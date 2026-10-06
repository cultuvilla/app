#!/usr/bin/env node
/**
 * apply-monitoring.mjs — ops monitoring as code.
 *
 * Creates or updates, in one project: the log-based metrics, the
 * "Cultuvilla — ops health" dashboard, the alert policies and the email
 * notification channel they page. The spec lives in lib/monitoring.mjs;
 * edit it there and re-run, never in the console (a console edit is
 * overwritten on the next apply).
 *
 * USAGE
 *   node scripts/apply-monitoring.mjs --project=<villa-events|cultuvilla-beta|cultuvilla-prod> [--confirm]
 *   node scripts/apply-monitoring.mjs --env=<dev|beta|prod> [--confirm]
 *
 *   Dry run by default: prints create / update / noop per resource and
 *   writes nothing. --confirm writes. Idempotent — a second run is all noop.
 *
 * Auth: your gcloud user (`gcloud auth print-access-token`), which needs
 * roles/logging.configWriter + roles/monitoring.editor on the project.
 * Alert policies are created disabled on dev (see alertsEnabledFor).
 */
import { execFileSync } from 'node:child_process';
import { ENVS } from './lib/env-credentials.mjs';
import {
  DASHBOARD_ID,
  LOG_METRICS,
  alertsEnabledFor,
  buildAlertPolicies,
  buildDashboard,
  buildNotificationChannel,
  findChannel,
  planLabelled,
  planLogMetric,
  withSpecLabel,
} from './lib/monitoring.mjs';

export function parseMonitoringArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    args[key] = value ?? true;
  }
  const byProject = Object.entries(ENVS).find(([, v]) => v.project === args.project);
  const env = typeof args.env === 'string' ? args.env : byProject?.[0];
  if (!env || !ENVS[env] || (args.project && ENVS[env].project !== args.project)) {
    throw new Error(
      `Pass --project=<${Object.values(ENVS).map((v) => v.project).join('|')}> or --env=<${Object.keys(ENVS).join('|')}>.`,
    );
  }
  return { env, project: ENVS[env].project, apply: args.confirm === true && args['dry-run'] !== true };
}

function client(project) {
  const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
  const send = async (method, url, body, attempt = 1) => {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-goog-user-project': project,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404 && method === 'GET') return null;
    const json = await res.json().catch(() => ({}));
    // Creating an alert on a log-based metric makes Monitoring call Logging on
    // our behalf, against a small per-user "control requests per minute" quota;
    // it surfaces as a 500 naming the quota. Waiting it out is the fix.
    const throttled = res.status === 429 || /Quota exceeded/.test(JSON.stringify(json));
    if (!res.ok && throttled && attempt < 6) {
      const waitMs = 15_000 * attempt;
      console.log(`    throttled (${res.status}); retrying in ${waitMs / 1000}s`);
      await new Promise((r) => setTimeout(r, waitMs));
      return send(method, url, body, attempt + 1);
    }
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${JSON.stringify(json.error ?? json)}`);
    return json;
  };
  return send;
}

async function listAll(call, url, key) {
  const out = [];
  let pageToken = '';
  do {
    const sep = url.includes('?') ? '&' : '?';
    const page = await call('GET', `${url}${pageToken ? `${sep}pageToken=${pageToken}` : ''}`);
    out.push(...(page?.[key] ?? []));
    pageToken = page?.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

async function main() {
  const { env, project, apply } = parseMonitoringArgs(process.argv.slice(2));
  const call = client(project);
  const LOGGING = `https://logging.googleapis.com/v2/projects/${project}`;
  const MONITORING = `https://monitoring.googleapis.com/v3/projects/${project}`;
  const DASHBOARDS = `https://monitoring.googleapis.com/v1/projects/${project}/dashboards`;
  const step = (action, kind, name) => console.log(`  ${action.padEnd(6)} ${kind} ${name}`);

  console.log(`Monitoring for ${env} (${project}) — ${apply ? 'APPLYING' : 'dry run (pass --confirm to write)'}`);

  for (const metric of LOG_METRICS) {
    const existing = await call('GET', `${LOGGING}/metrics/${metric.name}`);
    const action = planLogMetric(metric, existing);
    step(action, 'log metric', metric.name);
    if (!apply || action === 'noop') continue;
    if (action === 'create') await call('POST', `${LOGGING}/metrics`, metric);
    else await call('PUT', `${LOGGING}/metrics/${metric.name}`, metric);
  }

  const channels = await listAll(call, `${MONITORING}/notificationChannels?filter=${encodeURIComponent('type="email"')}`, 'notificationChannels');
  let channel = findChannel(channels);
  step(channel ? 'noop' : 'create', 'notification channel', channel?.name ?? buildNotificationChannel().labels.email_address);
  if (!channel && apply) channel = await call('POST', `${MONITORING}/notificationChannels`, buildNotificationChannel());
  const channelName = channel?.name ?? `projects/${project}/notificationChannels/<to-be-created>`;

  const dashboard = withSpecLabel(buildDashboard(), 'labels');
  const dashboards = await listAll(call, DASHBOARDS, 'dashboards');
  const existingDashboard =
    dashboards.find((d) => d.name.endsWith(`/${DASHBOARD_ID}`)) ?? dashboards.find((d) => d.displayName === dashboard.displayName);
  const dashAction = planLabelled(dashboard, existingDashboard, 'labels');
  step(dashAction, 'dashboard', existingDashboard?.name ?? dashboard.displayName);
  if (apply && dashAction === 'create') {
    await call('POST', DASHBOARDS, { ...dashboard, name: `projects/${project}/dashboards/${DASHBOARD_ID}` });
  } else if (apply && dashAction === 'update') {
    await call('PATCH', `https://monitoring.googleapis.com/v1/${existingDashboard.name}`, {
      ...dashboard,
      name: existingDashboard.name,
      etag: existingDashboard.etag,
    });
  }

  const policies = await listAll(call, `${MONITORING}/alertPolicies`, 'alertPolicies');
  for (const spec of buildAlertPolicies({ project, channelName, enabled: alertsEnabledFor(env) })) {
    const policy = withSpecLabel(spec, 'userLabels');
    const existing = policies.find((p) => p.displayName === policy.displayName);
    const action = planLabelled(policy, existing, 'userLabels');
    step(action, `alert policy${policy.enabled ? '' : ' (disabled)'}`, existing?.name ?? policy.displayName);
    if (!apply || action === 'noop') continue;
    if (action === 'create') await call('POST', `${MONITORING}/alertPolicies`, policy);
    else await call('PATCH', `https://monitoring.googleapis.com/v3/${existing.name}`, { ...policy, name: existing.name });
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
