import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';

// A secret only exists at runtime if the function that needs it *declares* it:
// `onCall({ secrets: [RESEND_API_KEY] }, …)` is what makes Firebase mount the
// Secret Manager version into that Cloud Run service. Miss the declaration and
// `RESEND_API_KEY.value()` returns empty, Resend answers "Missing API key", and
// `sendEventEmail` swallows it by design — the write succeeds and the mail
// silently never goes out. That is exactly how cancellation emails shipped to
// prod dead: `cancelRegistration` reached `eventEmail.ts` without declaring the
// secret, and every handler test mocks `../../auth/secret`, so no test could see
// it.
//
// This walks the real import graph instead: any entry point that can reach a
// module calling `<SECRET>.value()` must declare `<SECRET>` in its own options.

const FUNCTIONS_SRC = resolve(__dirname, '../..');

/** Secrets mounted per-function (defined in `auth/secret.ts`, `push/secret.ts`). */
const SECRETS = ['RESEND_API_KEY', 'APNS_AUTH_KEY'] as const;

/** `export const foo = onCall(…)` / `onDocumentWritten(…)` / `onSchedule(…)` / … */
const ENTRY_POINT = /=\s*on(Call|Request|Schedule|Document[A-Za-z]+|MessagePublished|ObjectFinalized)\b/;

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Relative imports only — a secret's consumers all live in this workspace. */
function localImports(file: string): string[] {
  const source = readFileSync(file, 'utf-8');
  const out: string[] = [];
  for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const base = resolve(dirname(file), match[1]);
    for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
      if (existsSync(candidate)) {
        out.push(candidate);
        break;
      }
    }
  }
  return out;
}

/** Every file reachable from `entry` through relative imports, `entry` included. */
function reachableFrom(entry: string): Set<string> {
  const seen = new Set([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined) break;
    for (const next of localImports(current)) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

const sourceFiles = listSourceFiles(FUNCTIONS_SRC);
const sourceOf = new Map(sourceFiles.map((f) => [f, readFileSync(f, 'utf-8')]));
const relative = (file: string) => file.slice(FUNCTIONS_SRC.length + 1);

describe('Cloud Functions secret declaration invariant', () => {
  it.each(SECRETS)('every entry point that can use %s declares it', (secret) => {
    const usesSecret = new RegExp(`\\b${secret}\\s*\\.\\s*value\\s*\\(`);
    const declaresSecret = new RegExp(`secrets:\\s*\\[[^\\]]*\\b${secret}\\b`);

    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = sourceOf.get(file) ?? '';
      if (!ENTRY_POINT.test(source)) continue;
      const consumers = [...reachableFrom(file)].filter((f) => usesSecret.test(sourceOf.get(f) ?? ''));
      if (consumers.length === 0) continue;
      if (declaresSecret.test(source)) continue;
      offenders.push(`${relative(file)} — reaches ${consumers.map(relative).join(', ')}`);
    }

    expect(
      offenders,
      [
        `These entry points can call ${secret}.value() but never declare the secret,`,
        'so Firebase will not mount it and the call returns an empty string at runtime.',
        `Add \`secrets: [${secret}]\` to the function's options object:`,
        '',
        `  onCall({ region: 'us-central1', cors: true, secrets: [${secret}] }, async (request) => {`,
        '',
        'Offenders:',
        ...offenders,
      ].join('\n'),
    ).toEqual([]);
  });

  it('actually sees the entry points and secret consumers it is meant to guard', () => {
    // Without this, a broken regex would make the invariant above vacuously green.
    const entryPoints = sourceFiles.filter((f) => ENTRY_POINT.test(sourceOf.get(f) ?? ''));
    expect(entryPoints.length).toBeGreaterThan(20);

    const consumers = sourceFiles.filter((f) => /RESEND_API_KEY\s*\.\s*value\s*\(/.test(sourceOf.get(f) ?? ''));
    expect(consumers.map(relative).sort()).toContain('shared/email.ts');

    // cancelRegistration is the regression: it must reach the mail transport.
    // So must the cuota reminders, the first scheduled sender.
    for (const entry of ['events/cancelRegistration.ts', 'organizations/sendCuotaReminders.ts']) {
      expect([...reachableFrom(resolve(FUNCTIONS_SRC, entry))].map(relative)).toContain('shared/email.ts');
    }

    // Push is the same trap: a trigger that sends without declaring the APNs key
    // would deliver to Android and silently drop every iOS device.
    const apnsConsumers = sourceFiles.filter((f) =>
      /APNS_AUTH_KEY\s*\.\s*value\s*\(/.test(sourceOf.get(f) ?? ''),
    );
    expect(apnsConsumers.map(relative)).toContain('push/apnsTransport.ts');
    for (const entry of ['push/onNotificationCreated.ts', 'push/flushPushQueue.ts']) {
      expect([...reachableFrom(resolve(FUNCTIONS_SRC, entry))].map(relative)).toContain(
        'push/apnsTransport.ts',
      );
    }
  });
});
