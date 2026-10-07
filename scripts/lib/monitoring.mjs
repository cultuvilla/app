/**
 * Ops monitoring as code — the pure half of scripts/apply-monitoring.mjs.
 *
 * Builds the log-based metrics, the prod-health dashboard, the alert policies
 * and the notification channel as Cloud Logging / Cloud Monitoring API bodies,
 * and decides create / update / noop against what a project already holds.
 * Nothing here talks to the network, so the whole spec is unit-tested.
 *
 * Everything reads the structured Cloud Functions logs: every line carries
 * `jsonPayload.handler` (see the cloud-function-logging skill). Latency comes
 * from Cloud Run's built-in `request_latencies` instead of a log-based
 * distribution — it is free, exact, and covers functions that never log.
 */
import { createHash } from 'node:crypto';

export const MANAGED_BY = 'apply-monitoring';
export const OPS_EMAIL = 'cultuvilla.app@gmail.com';
export const CHANNEL_DISPLAY_NAME = 'Cultuvilla ops (email)';
export const DASHBOARD_ID = 'cultuvilla-ops-health';

/** Every Cloud Function is gen 2, so every log line sits on a Cloud Run revision. */
const RUN = 'resource.type="cloud_run_revision"';

/** The user-facing callables (plus the read site) whose latency is watched. */
export const KEY_SERVICES = [
  'readsite',
  'registertoevent',
  'sendauthotpcode',
  'verifyauthotpcode',
  'acceptinvite',
  'claimeventseat',
  'updatecenso',
];

/** Must match READ_SITE_VISIT_MESSAGE in functions/src/web/visit.ts. */
export const READ_SITE_VISIT_MESSAGE = 'readSite visit';

export const THRESHOLDS = {
  /** ERROR lines across all functions in 15 min. Prod saw none in the week to 2026-10-06. */
  serverErrorsPer15m: 10,
  /** Client errors in 15 min. Prod's worst 15 min that week was 47, one user's loop. */
  clientErrorsPer15m: 60,
  /** p95 of one key service over 30 min. Weekly p95s ran 0.1–2.8 s, cold starts included. */
  latencyP95Ms: 10_000,
};

const label = (key, description) => ({ key, valueType: 'STRING', description });

const counter = (labels) => ({ metricKind: 'DELTA', valueType: 'INT64', unit: '1', labels });

export const LOG_METRICS = [
  {
    name: 'server_errors',
    description: 'ERROR-or-worse log lines from Cloud Functions, client-error reports excluded. Labelled by jsonPayload.handler (empty for platform lines such as request timeouts).',
    filter: `${RUN} AND severity>=ERROR AND NOT jsonPayload.handler="logClientError"`,
    labelExtractors: { handler: 'EXTRACT(jsonPayload.handler)' },
    metricDescriptor: counter([label('handler', 'jsonPayload.handler of the log line')]),
  },
  {
    name: 'client_errors',
    description: 'Client errors reported through the logClientError callable.',
    filter: `${RUN} AND jsonPayload.handler="logClientError"`,
    labelExtractors: {
      platform: 'EXTRACT(jsonPayload.platform)',
      surface: 'EXTRACT(jsonPayload.surface)',
      error_code: 'EXTRACT(jsonPayload."error.code")',
      app_version: 'EXTRACT(jsonPayload.appVersion)',
    },
    metricDescriptor: counter([
      label('platform', 'ios | android | web'),
      label('surface', 'the UI surface that reported it'),
      label('error_code', 'machine-readable reason, e.g. permission-denied'),
      label('app_version', 'marketing version of the reporting client'),
    ]),
  },
  {
    name: 'read_site_visits',
    description: 'Pages served by the readSite function (origin renders: Hosting caches 200s for an hour, so this is a lower bound on visits).',
    filter: `${RUN} AND jsonPayload.handler="readSite" AND jsonPayload.message="${READ_SITE_VISIT_MESSAGE}"`,
    labelExtractors: {
      page: 'EXTRACT(jsonPayload.page)',
      entity_kind: 'EXTRACT(jsonPayload.entityKind)',
      device: 'EXTRACT(jsonPayload.device)',
      platform: 'EXTRACT(jsonPayload.platform)',
      status: 'EXTRACT(jsonPayload.status)',
    },
    metricDescriptor: counter([
      label('page', 'route type: home, village, entity, invite, download…'),
      label('entity_kind', 'event, news, organization… for entity/invite pages'),
      label('device', 'bot | phone | desktop'),
      label('platform', 'ios | android | other'),
      label('status', 'HTTP status served'),
    ]),
  },
];

export const userMetric = (name) => `logging.googleapis.com/user/${name}`;
const metricFilter = (name, extra = '') => `metric.type="${userMetric(name)}" AND ${RUN}${extra}`;
const oneOf = (values) => `one_of(${values.map((v) => `"${v}"`).join(',')})`;

const LATENCY_FILTER = `metric.type="run.googleapis.com/request_latencies" AND ${RUN}`;
const KEY_LATENCY_FILTER = `${LATENCY_FILTER} AND resource.label.service_name=${oneOf(KEY_SERVICES)}`;

const sumBy = (alignmentPeriod, groupByFields) => ({
  alignmentPeriod,
  perSeriesAligner: 'ALIGN_DELTA',
  crossSeriesReducer: 'REDUCE_SUM',
  groupByFields,
});

const p95By = (alignmentPeriod, groupByFields) => ({
  alignmentPeriod,
  perSeriesAligner: 'ALIGN_DELTA',
  crossSeriesReducer: 'REDUCE_PERCENTILE_95',
  groupByFields,
});

const chart = (title, filter, aggregation, plotType = 'STACKED_BAR', unit) => ({
  title,
  xyChart: {
    dataSets: [{ timeSeriesQuery: { timeSeriesFilter: { filter, aggregation } }, plotType }],
    ...(unit ? { yAxis: { label: unit, scale: 'LINEAR' } } : {}),
  },
});

const DASHBOARD_NOTE = [
  '**Cultuvilla ops health** — managed by `scripts/apply-monitoring.mjs`; edit there, not here.',
  'Server errors are ERROR log lines by `jsonPayload.handler` (empty handler = platform line, e.g. a timeout).',
  'Read-site visits count origin renders: Hosting caches 200s for an hour, so it is a lower bound.',
].join('\n\n');

export function buildDashboard() {
  const widgets = [
    { title: 'About', text: { content: DASHBOARD_NOTE, format: 'MARKDOWN' } },
    chart(
      'Server error lines by handler',
      metricFilter('server_errors'),
      sumBy('300s', ['metric.label.handler', 'resource.label.service_name']),
    ),
    {
      title: '5xx ratio by service',
      xyChart: {
        dataSets: [
          {
            plotType: 'LINE',
            timeSeriesQuery: {
              timeSeriesFilterRatio: {
                numerator: {
                  filter: `metric.type="run.googleapis.com/request_count" AND ${RUN} AND metric.label.response_code_class="5xx"`,
                  aggregation: { alignmentPeriod: '300s', perSeriesAligner: 'ALIGN_DELTA', crossSeriesReducer: 'REDUCE_SUM', groupByFields: ['resource.label.service_name'] },
                },
                denominator: {
                  filter: `metric.type="run.googleapis.com/request_count" AND ${RUN}`,
                  aggregation: { alignmentPeriod: '300s', perSeriesAligner: 'ALIGN_DELTA', crossSeriesReducer: 'REDUCE_SUM', groupByFields: ['resource.label.service_name'] },
                },
              },
            },
          },
        ],
      },
    },
    chart('p95 latency — key callables (ms)', KEY_LATENCY_FILTER, p95By('300s', ['resource.label.service_name']), 'LINE', 'ms'),
    chart('Client errors by platform', metricFilter('client_errors'), sumBy('300s', ['metric.label.platform'])),
    chart('Client errors by error code', metricFilter('client_errors'), sumBy('300s', ['metric.label.error_code'])),
    chart(
      'Read-site visits by page (people)',
      metricFilter('read_site_visits', ' AND metric.label.device!="bot"'),
      sumBy('3600s', ['metric.label.page', 'metric.label.entity_kind']),
    ),
    chart('Read-site visits by device', metricFilter('read_site_visits'), sumBy('3600s', ['metric.label.device', 'metric.label.platform'])),
  ];

  const WIDTH = 24;
  const HEIGHT = 16;
  return {
    displayName: 'Cultuvilla — ops health',
    mosaicLayout: {
      columns: 48,
      tiles: widgets.map((widget, i) => ({
        xPos: (i % 2) * WIDTH,
        yPos: Math.floor(i / 2) * HEIGHT,
        width: WIDTH,
        height: HEIGHT,
        widget,
      })),
    },
  };
}

const runbook = (lines) => ({ content: lines.join('\n\n'), mimeType: 'text/markdown' });

export function buildAlertPolicies({ project, channelName, enabled }) {
  const common = {
    combiner: 'OR',
    enabled,
    notificationChannels: [channelName],
    alertStrategy: { autoClose: '3600s' },
  };
  return [
    {
      ...common,
      displayName: 'Cultuvilla — server errors spike',
      documentation: runbook([
        `More than ${THRESHOLDS.serverErrorsPer15m} ERROR log lines from Cloud Functions in 15 minutes.`,
        `Find them: \`gcloud logging read 'resource.type="cloud_run_revision" AND severity>=ERROR AND NOT jsonPayload.handler="logClientError"' --project=${project} --freshness=1h --limit=50\``,
        'Group by `jsonPayload.handler`; an empty handler is a platform line (timeout, crash). Error Reporting groups the stacks.',
      ]),
      conditions: [
        {
          displayName: `server_errors > ${THRESHOLDS.serverErrorsPer15m} in 15 min`,
          conditionThreshold: {
            filter: metricFilter('server_errors'),
            aggregations: [sumBy('900s', [])],
            comparison: 'COMPARISON_GT',
            thresholdValue: THRESHOLDS.serverErrorsPer15m,
            duration: '0s',
            trigger: { count: 1 },
          },
        },
      ],
    },
    {
      ...common,
      displayName: 'Cultuvilla — client errors spike',
      documentation: runbook([
        `More than ${THRESHOLDS.clientErrorsPer15m} client errors reported through logClientError in 15 minutes.`,
        `Find them: \`gcloud logging read 'jsonPayload.handler="logClientError"' --project=${project} --freshness=1h --limit=50 --format='value(timestamp,jsonPayload.platform,jsonPayload.operation)'\``,
        'One hashed `user.id` repeating is a single client in a loop, not an outage.',
      ]),
      conditions: [
        {
          displayName: `client_errors > ${THRESHOLDS.clientErrorsPer15m} in 15 min`,
          conditionThreshold: {
            filter: metricFilter('client_errors'),
            aggregations: [sumBy('900s', [])],
            comparison: 'COMPARISON_GT',
            thresholdValue: THRESHOLDS.clientErrorsPer15m,
            duration: '0s',
            trigger: { count: 1 },
          },
        },
      ],
    },
    {
      ...common,
      displayName: 'Cultuvilla — key callable latency',
      documentation: runbook([
        `p95 latency of a key callable or the read site above ${THRESHOLDS.latencyP95Ms / 1000} s over 30 minutes.`,
        `Watched: ${KEY_SERVICES.join(', ')}. Check the service in Cloud Run → Metrics, and Firestore latency for the same window.`,
      ]),
      conditions: [
        {
          displayName: `p95 request latency > ${THRESHOLDS.latencyP95Ms} ms`,
          conditionThreshold: {
            filter: KEY_LATENCY_FILTER,
            aggregations: [p95By('1800s', ['resource.label.service_name'])],
            comparison: 'COMPARISON_GT',
            thresholdValue: THRESHOLDS.latencyP95Ms,
            duration: '0s',
            trigger: { count: 1 },
          },
        },
      ],
    },
  ];
}

export function buildNotificationChannel(email = OPS_EMAIL) {
  return {
    type: 'email',
    displayName: CHANNEL_DISPLAY_NAME,
    labels: { email_address: email },
    enabled: true,
  };
}

export function findChannel(channels, email = OPS_EMAIL) {
  return channels.find((c) => c.type === 'email' && c.labels?.email_address === email) ?? null;
}

/** Order-stable JSON, so a hash changes only when the spec does. */
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export const specHash = (spec) => createHash('sha256').update(stableStringify(spec)).digest('hex').slice(0, 16);

/**
 * Stamp a dashboard or policy with the hash of its own spec. The server
 * normalises bodies (durations, defaults, generated condition names), so a
 * field-by-field compare would always see a diff; the label is what we wrote.
 */
export function withSpecLabel(spec, key) {
  return { ...spec, [key]: { managed_by: MANAGED_BY, spec: specHash(spec) } };
}

/** A log metric's comparable shape — the fields we own, as the API returns them. */
export function logMetricDigest(m) {
  return stableStringify({
    description: m.description ?? '',
    filter: m.filter,
    labelExtractors: m.labelExtractors ?? {},
    labels: (m.metricDescriptor?.labels ?? []).map((l) => l.key).sort(),
  });
}

/** create when absent, update when what we own differs, noop otherwise. */
export function planLogMetric(desired, existing) {
  if (!existing) return 'create';
  return logMetricDigest(desired) === logMetricDigest(existing) ? 'noop' : 'update';
}

export function planLabelled(desired, existing, key) {
  if (!existing) return 'create';
  return existing[key]?.spec === desired[key].spec ? 'noop' : 'update';
}

/** Alerts page people; dev is a playground, so its policies exist but stay off. */
export const alertsEnabledFor = (env) => env !== 'dev';
