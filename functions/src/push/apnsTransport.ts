import { connect, type ClientHttp2Session } from 'node:http2';
import { logger } from 'firebase-functions/v2';
import type { ApnsEnvironment, ApnsNotification } from '@cultuvilla/shared/models';
import { buildApnsJwt, parseApnsSecret, type ApnsCredentials } from './apnsJwt';
import { APNS_AUTH_KEY } from './secret';
import type { TransportResult, TransportTarget } from './transport';

const APNS_HOST: Record<ApnsEnvironment, string> = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
};

/**
 * Reasons that mean the token itself is finished, as opposed to the request.
 * `BadDeviceToken` also answers an environment mismatch, but the environment
 * travels with the token (DeviceTokenDataModel), so here it genuinely means the
 * token is bad.
 */
const DEAD_REASONS = new Set(['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic']);

// Apple throttles providers that mint a new token more than once every 20
// minutes, and rejects one older than 60. Cache for 50.
const JWT_TTL_MS = 50 * 60 * 1000;
let cachedJwt: { value: string; mintedAt: number; keyId: string } | null = null;

function credentials(): ApnsCredentials | null {
  return parseApnsSecret(APNS_AUTH_KEY.value());
}

function providerToken(creds: ApnsCredentials, now: Date): string {
  if (
    cachedJwt &&
    cachedJwt.keyId === creds.keyId &&
    now.getTime() - cachedJwt.mintedAt < JWT_TTL_MS
  ) {
    return cachedJwt.value;
  }
  const value = buildApnsJwt(creds, now);
  cachedJwt = { value, mintedAt: now.getTime(), keyId: creds.keyId };
  return value;
}

interface ApnsResponse {
  status: number;
  reason: string | null;
}

function post(
  session: ClientHttp2Session,
  token: string,
  topic: string,
  jwt: string,
  notification: ApnsNotification,
): Promise<ApnsResponse> {
  return new Promise((resolve) => {
    const req = session.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      'apns-topic': topic,
      'content-type': 'application/json',
      ...notification.headers,
    });
    let status = 0;
    let body = '';
    req.setEncoding('utf8');
    req.on('response', (headers) => {
      status = headers[':status'] ?? 0;
    });
    req.on('data', (chunk: string) => {
      body += chunk;
    });
    req.on('end', () => {
      let reason: string | null = null;
      if (body) {
        try {
          const parsed: unknown = JSON.parse(body);
          if (typeof parsed === 'object' && parsed !== null && 'reason' in parsed) {
            reason = typeof parsed.reason === 'string' ? parsed.reason : null;
          }
        } catch {
          reason = null;
        }
      }
      resolve({ status, reason });
    });
    // A socket error is a transport failure, not a verdict on the token —
    // report it as a failure that must NOT prune the device.
    req.on('error', () => {
      resolve({ status: 0, reason: null });
    });
    req.end(JSON.stringify(notification.payload));
  });
}

/**
 * Sends one notification to a set of iOS devices over APNs HTTP/2.
 *
 * Best-effort: a missing or malformed key logs once and reports every target
 * as failed-but-alive, so a misconfigured env degrades to "no iOS push" rather
 * than crashing the trigger that wrote the notification.
 */
export async function sendApns(
  targets: TransportTarget[],
  notification: ApnsNotification,
): Promise<TransportResult> {
  if (targets.length === 0) return { delivered: 0, failed: 0, deadTokens: [] };

  const creds = credentials();
  if (!creds) {
    logger.warn('APNS_AUTH_KEY is missing or malformed; iOS push skipped', {
      handler: 'sendApns',
      targetCount: targets.length,
    });
    return { delivered: 0, failed: targets.length, deadTokens: [] };
  }
  const jwt = providerToken(creds, new Date());

  const byEnv = new Map<ApnsEnvironment, TransportTarget[]>();
  for (const t of targets) {
    const env = t.apnsEnvironment ?? 'production';
    byEnv.set(env, [...(byEnv.get(env) ?? []), t]);
  }

  let delivered = 0;
  let failed = 0;
  const deadTokens: string[] = [];

  for (const [env, envTargets] of byEnv) {
    const session = connect(APNS_HOST[env]);
    try {
      const results = await Promise.all(
        envTargets.map((t) => post(session, t.token, t.apnsTopic ?? '', jwt, notification)),
      );
      results.forEach((r, i) => {
        const target = envTargets[i];
        if (r.status === 200) {
          delivered += 1;
          return;
        }
        failed += 1;
        if (r.status === 410 || (r.reason !== null && DEAD_REASONS.has(r.reason))) {
          deadTokens.push(target.token);
        } else {
          logger.warn('APNs rejected a push', {
            handler: 'sendApns',
            environment: env,
            status: r.status,
            reason: r.reason,
          });
        }
      });
    } finally {
      session.close();
    }
  }

  return { delivered, failed, deadTokens };
}
