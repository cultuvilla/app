import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  KEY_SERVICES,
  LOG_METRICS,
  OPS_EMAIL,
  READ_SITE_VISIT_MESSAGE,
  alertsEnabledFor,
  buildAlertPolicies,
  buildDashboard,
  buildNotificationChannel,
  findChannel,
  planLabelled,
  planLogMetric,
  specHash,
  stableStringify,
  userMetric,
  withSpecLabel,
} from '../lib/monitoring.mjs';
import { parseMonitoringArgs } from '../apply-monitoring.mjs';

const CHANNEL = 'projects/p/notificationChannels/1';
const policies = (enabled = true) => buildAlertPolicies({ project: 'p', channelName: CHANNEL, enabled });

describe('log metrics', () => {
  it('every filter reads the structured Cloud Run logs', () => {
    for (const m of LOG_METRICS) assert.match(m.filter, /resource\.type="cloud_run_revision"/, m.name);
  });

  it('server errors exclude client-error reports, which are logged at ERROR too', () => {
    const m = LOG_METRICS.find((x) => x.name === 'server_errors');
    assert.match(m.filter, /severity>=ERROR/);
    assert.match(m.filter, /NOT jsonPayload\.handler="logClientError"/);
  });

  it('declares a descriptor label for every extractor, and no more', () => {
    for (const m of LOG_METRICS) {
      assert.deepEqual(
        m.metricDescriptor.labels.map((l) => l.key).sort(),
        Object.keys(m.labelExtractors).sort(),
        m.name,
      );
    }
  });

  it('the read-site metric matches the message the function logs', () => {
    const src = readFileSync(new URL('../../functions/src/web/visit.ts', import.meta.url), 'utf8');
    assert.ok(src.includes(`READ_SITE_VISIT_MESSAGE = '${READ_SITE_VISIT_MESSAGE}'`));
    const m = LOG_METRICS.find((x) => x.name === 'read_site_visits');
    assert.ok(m.filter.includes(`jsonPayload.message="${READ_SITE_VISIT_MESSAGE}"`));
  });
});

describe('dashboard and alerts', () => {
  const metricNames = new Set(LOG_METRICS.map((m) => userMetric(m.name)));
  const referenced = (obj) => [...stableStringify(obj).matchAll(/logging\.googleapis\.com\/user\/(\w+)/g)].map((x) => `logging.googleapis.com/user/${x[1]}`);

  it('reference only metrics this spec defines', () => {
    for (const name of [...referenced(buildDashboard()), ...referenced(policies())]) {
      assert.ok(metricNames.has(name), name);
    }
  });

  it('tiles do not overlap', () => {
    const seen = new Set();
    for (const t of buildDashboard().mosaicLayout.tiles) {
      const key = `${t.xPos},${t.yPos}`;
      assert.ok(!seen.has(key), key);
      seen.add(key);
    }
  });

  it('every policy pages the channel and carries a runbook', () => {
    const all = policies();
    assert.ok(all.some((p) => /server errors/.test(p.displayName)));
    assert.ok(all.some((p) => /client errors/.test(p.displayName)));
    for (const p of all) {
      assert.deepEqual(p.notificationChannels, [CHANNEL]);
      assert.ok(p.documentation.content.length > 0);
      assert.equal(p.conditions.length, 1);
    }
  });

  it('runbooks name the project they were applied to', () => {
    const doc = buildAlertPolicies({ project: 'cultuvilla-prod', channelName: CHANNEL, enabled: true })[0].documentation.content;
    assert.match(doc, /--project=cultuvilla-prod/);
  });

  it('latency watches the key callables only', () => {
    const latency = policies().find((p) => /latency/.test(p.displayName));
    for (const s of KEY_SERVICES) assert.ok(latency.conditions[0].conditionThreshold.filter.includes(`"${s}"`), s);
  });

  it('alerts are off on dev and on elsewhere', () => {
    assert.equal(alertsEnabledFor('dev'), false);
    assert.equal(alertsEnabledFor('beta'), true);
    assert.equal(alertsEnabledFor('prod'), true);
    assert.ok(policies(false).every((p) => p.enabled === false));
  });
});

describe('notification channel', () => {
  it('builds and finds the ops email channel', () => {
    const c = buildNotificationChannel();
    assert.equal(c.type, 'email');
    assert.equal(c.labels.email_address, OPS_EMAIL);
    const existing = { ...c, name: 'projects/p/notificationChannels/9' };
    assert.equal(findChannel([{ type: 'sms', labels: {} }, existing]), existing);
    assert.equal(findChannel([{ type: 'email', labels: { email_address: 'other@x.es' } }]), null);
  });
});

describe('planning', () => {
  it('stableStringify ignores key order', () => {
    assert.equal(stableStringify({ a: 1, b: [{ d: 2, c: 3 }] }), stableStringify({ b: [{ c: 3, d: 2 }], a: 1 }));
    assert.equal(specHash({ a: 1 }), specHash({ a: 1 }));
    assert.notEqual(specHash({ a: 1 }), specHash({ a: 2 }));
  });

  it('a log metric is created, left alone, or updated', () => {
    const m = LOG_METRICS[0];
    assert.equal(planLogMetric(m, null), 'create');
    // The API echoes extra fields (name, timestamps, descriptor type) we do not own.
    const echoed = { ...m, createTime: 'x', metricDescriptor: { ...m.metricDescriptor, type: 'logging.googleapis.com/user/x' } };
    assert.equal(planLogMetric(m, echoed), 'noop');
    assert.equal(planLogMetric(m, { ...echoed, filter: 'old' }), 'update');
  });

  it('a labelled resource updates only when its spec hash moves', () => {
    const desired = withSpecLabel(buildDashboard(), 'labels');
    assert.equal(planLabelled(desired, null, 'labels'), 'create');
    assert.equal(planLabelled(desired, { labels: { ...desired.labels }, etag: 'e' }, 'labels'), 'noop');
    assert.equal(planLabelled(desired, { labels: { spec: 'stale' } }, 'labels'), 'update');
    assert.equal(planLabelled(desired, {}, 'labels'), 'update');
  });
});

describe('parseMonitoringArgs', () => {
  it('accepts a project id or an env, dry run unless --confirm', () => {
    assert.deepEqual(parseMonitoringArgs(['--project=cultuvilla-beta']), { env: 'beta', project: 'cultuvilla-beta', apply: false });
    assert.deepEqual(parseMonitoringArgs(['--env=prod', '--confirm']), { env: 'prod', project: 'cultuvilla-prod', apply: true });
    assert.equal(parseMonitoringArgs(['--env=dev', '--confirm', '--dry-run']).apply, false);
  });

  it('refuses an unknown or missing target', () => {
    assert.throws(() => parseMonitoringArgs([]));
    assert.throws(() => parseMonitoringArgs(['--project=someone-else']));
    assert.throws(() => parseMonitoringArgs(['--env=dev', '--project=cultuvilla-prod']));
  });
});
