// Play "What's new" from the CHANGELOG, its read-back, and the store-listing
// check — against a fake Play API, so every edit call is visible.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import {
  MAX_PLAY_NOTES,
  findTrackRelease,
  formatTrackRelease,
  makePlayClient,
  playSubmitTarget,
  pushReleaseNotesWhenReady,
  resolvePlayCredential,
} from '../lib/play.mjs';
import { extractReleaseNotes } from '../lib/changelog-notes.mjs';
import { loadStoreListing, parseStoreListing, validateStoreListing } from '../lib/store-listing.mjs';

const PKG = 'com.cultuvilla.app';
const EDIT = `/androidpublisher/v3/applications/${PKG}/edits/e1`;

const serviceAccount = () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { client_email: 'p@x.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
};
const SA = JSON.stringify(serviceAccount());

/** A fake Play: answers by route, records `METHOD path` and every body. */
function fakePlay(routes = {}) {
  const calls = [];
  const bodies = {};
  const fetchImpl = async (url, init) => {
    const path = url.replace(/^https:\/\/[^/]+/, '');
    const key = `${init.method} ${path}`;
    const json = (b, status = 200, ok = true) => ({ ok, status, json: async () => b, text: async () => JSON.stringify(b) });
    if (url.includes('oauth2')) {
      calls.push('TOKEN');
      bodies.TOKEN = new URLSearchParams(init.body);
      return json({ access_token: 't' });
    }
    calls.push(key);
    bodies[key] = init.body ? JSON.parse(init.body) : undefined;
    bodies[`${key} headers`] = init.headers;
    const route = routes[key];
    if (typeof route === 'function') return route(json);
    if (route !== undefined) return json(route);
    if (init.method === 'POST' && path.endsWith('/edits')) return json({ id: 'e1' });
    if (init.method === 'DELETE') return json(null, 204);
    return json({});
  };
  return { calls, bodies, fetchImpl };
}

const track = {
  track: 'production',
  releases: [
    { name: '41 (1.13.0)', versionCodes: ['41'], status: 'completed', releaseNotes: [{ language: 'en-US', text: 'old en' }] },
    { name: '40 (1.12.0)', versionCodes: ['40'], status: 'completed' },
  ],
};

describe('setReleaseNotes', () => {
  it('patches the matching release in one edit and commits it', async () => {
    const fake = fakePlay({ [`GET ${EDIT}/tracks/production`]: structuredClone(track) });
    const play = makePlayClient({ serviceAccountJson: SA, fetchImpl: fake.fetchImpl });
    const r = await play.setReleaseNotes(PKG, 'production', { versionCode: '41', version: '1.13.0', language: 'es-ES', text: '• Nuevo' });

    assert.equal(r.found, true);
    assert.deepEqual(fake.calls, [
      'TOKEN',
      `POST /androidpublisher/v3/applications/${PKG}/edits`,
      `GET ${EDIT}/tracks/production`,
      `PUT ${EDIT}/tracks/production`,
      `POST ${EDIT}:commit`,
    ]);
    const put = fake.bodies[`PUT ${EDIT}/tracks/production`];
    // Every release goes back (a track PUT replaces the list); only 41 changes,
    // and its other languages are kept.
    assert.equal(put.releases.length, 2);
    assert.deepEqual(put.releases[0].releaseNotes, [
      { language: 'en-US', text: 'old en' },
      { language: 'es-ES', text: '• Nuevo' },
    ]);
    assert.equal(put.releases[1].releaseNotes, undefined);
  });

  it('replaces the language’s earlier notes instead of adding a second entry', async () => {
    const t = structuredClone(track);
    t.releases[0].releaseNotes = [{ language: 'es-ES', text: 'viejo' }];
    const fake = fakePlay({ [`GET ${EDIT}/tracks/production`]: t });
    await makePlayClient({ serviceAccountJson: SA, fetchImpl: fake.fetchImpl })
      .setReleaseNotes(PKG, 'production', { versionCode: '41', language: 'es-ES', text: 'nuevo' });
    assert.deepEqual(fake.bodies[`PUT ${EDIT}/tracks/production`].releases[0].releaseNotes, [{ language: 'es-ES', text: 'nuevo' }]);
  });

  it('writes nothing and drops the edit when the release is not on the track', async () => {
    const fake = fakePlay({ [`GET ${EDIT}/tracks/production`]: structuredClone(track) });
    const r = await makePlayClient({ serviceAccountJson: SA, fetchImpl: fake.fetchImpl })
      .setReleaseNotes(PKG, 'production', { versionCode: '42', version: '1.13.0', language: 'es-ES', text: 'x' });
    assert.equal(r.found, false);
    assert.ok(!fake.calls.some((c) => c.startsWith('PUT') || c.includes(':commit')));
    assert.equal(fake.calls.at(-1), `DELETE ${EDIT}`);
  });

  it('refuses notes over Play’s limit before calling Play', async () => {
    const fake = fakePlay();
    const play = makePlayClient({ serviceAccountJson: SA, fetchImpl: fake.fetchImpl });
    await assert.rejects(
      play.setReleaseNotes(PKG, 'production', { versionCode: '41', language: 'es-ES', text: 'a'.repeat(MAX_PLAY_NOTES + 1) }),
      /500/,
    );
    assert.deepEqual(fake.calls, []);
  });

  it('drops the edit when the commit fails, and surfaces the commit’s error', async () => {
    const fake = fakePlay({
      [`GET ${EDIT}/tracks/production`]: structuredClone(track),
      [`POST ${EDIT}:commit`]: (json) => json({ error: 'nope' }, 400, false),
    });
    await assert.rejects(
      makePlayClient({ serviceAccountJson: SA, fetchImpl: fake.fetchImpl })
        .setReleaseNotes(PKG, 'production', { versionCode: '41', language: 'es-ES', text: 'x' }),
      /commit failed \(400\)/,
    );
    assert.equal(fake.calls.at(-1), `DELETE ${EDIT}`);
  });
});

describe('pushReleaseNotesWhenReady', () => {
  it('retries until the submitted release shows up', async () => {
    let n = 0;
    const play = { setReleaseNotes: async () => (++n < 3 ? { found: false } : { found: true, release: { name: '41 (1.13.0)' } }) };
    const slept = [];
    const r = await pushReleaseNotesWhenReady({
      play, packageName: PKG, track: 'production', version: '1.13.0', versionCode: '41', language: 'es-ES', text: 'x',
      attempts: 5, delayMs: 7, sleep: async (ms) => slept.push(ms),
    });
    assert.equal(r.name, '41 (1.13.0)');
    assert.deepEqual(slept, [7, 7]);
  });

  it('fails after the last attempt, naming how it looked', async () => {
    const play = { setReleaseNotes: async () => ({ found: false }) };
    await assert.rejects(
      pushReleaseNotesWhenReady({ play, packageName: PKG, track: 'internal', version: '1.13.0', language: 'es-ES', text: 'x', attempts: 2, sleep: async () => {} }),
      /no release with name 1\.13\.0 on com\.cultuvilla\.app internal after 2 attempts/,
    );
  });
});

describe('findTrackRelease', () => {
  it('matches by versionCode when given one, never falling back to the name', () => {
    assert.equal(findTrackRelease(track, { versionCode: 40, version: '1.13.0' }).name, '40 (1.12.0)');
    assert.equal(findTrackRelease(track, { versionCode: '99', version: '1.13.0' }), null);
  });
  it('matches by version name otherwise, not inside a longer version', () => {
    assert.equal(findTrackRelease(track, { version: '1.13.0' }).name, '41 (1.13.0)');
    assert.equal(findTrackRelease({ releases: [{ name: '1.13.01' }] }, { version: '1.13.0' }), null);
  });
});

describe('credentials', () => {
  it('exchanges user ADC by refresh token and bills its quota project', async () => {
    const adc = { type: 'authorized_user', client_id: 'c', client_secret: 's', refresh_token: 'r', quota_project_id: 'q' };
    const fake = fakePlay({ [`GET ${EDIT}/tracks/internal`]: { releases: [] } });
    const play = makePlayClient({ credential: resolvePlayCredential({ env: {}, adcPaths: ['a'], readFile: () => JSON.stringify(adc) }), fetchImpl: fake.fetchImpl });
    await play.getTrack(PKG, 'internal');
    assert.equal(fake.bodies.TOKEN.get('grant_type'), 'refresh_token');
    assert.equal(fake.bodies[`GET ${EDIT}/tracks/internal headers`]['X-Goog-User-Project'], 'q');
    // Read-only: the edit is deleted, never committed.
    assert.ok(!fake.calls.some((c) => c.includes(':commit')));
  });

  it('refuses user ADC without a quota project', () => {
    const credential = { kind: 'authorized_user', adc: { client_id: 'c', client_secret: 's', refresh_token: 'r' } };
    assert.throws(() => makePlayClient({ credential }), /quota_project_id/);
  });

  it('prefers --key-file, then the CI secret, then the first ADC file that exists', () => {
    const files = { key: SA, adc2: JSON.stringify({ client_id: 'c', client_secret: 's', refresh_token: 'r' }) };
    const readFile = (p) => {
      if (!(p in files)) throw new Error('ENOENT');
      return files[p];
    };
    assert.equal(resolvePlayCredential({ keyFile: 'key', env: {}, readFile }).kind, 'service_account');
    assert.equal(resolvePlayCredential({ env: { GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: SA }, adcPaths: ['adc2'], readFile }).kind, 'service_account');
    assert.equal(resolvePlayCredential({ env: {}, adcPaths: ['adc1', 'adc2'], readFile }).kind, 'authorized_user');
    assert.equal(resolvePlayCredential({ env: {}, adcPaths: ['adc1'], readFile }), null);
    assert.throws(() => resolvePlayCredential({ env: { GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: '{}' } }), /service account/);
  });
});

describe('pushListing', () => {
  const listing = { title: 'Cultuvilla', shortDescription: 's', fullDescription: 'f' };

  it('PATCHes the language and commits without cancelling a review in progress', async () => {
    const fake = fakePlay({ [`GET ${EDIT}/listings/es-ES`]: { title: 'Old' } });
    const before = await makePlayClient({ serviceAccountJson: SA, fetchImpl: fake.fetchImpl }).pushListing(PKG, 'es-ES', listing);
    assert.equal(before.title, 'Old');
    assert.deepEqual(fake.calls.slice(2), [
      `GET ${EDIT}/listings/es-ES`,
      `PATCH ${EDIT}/listings/es-ES`,
      `POST ${EDIT}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW`,
    ]);
    assert.deepEqual(fake.bodies[`PATCH ${EDIT}/listings/es-ES`], listing);
  });

  it('drops the edit when Play refuses the commit (something is in review)', async () => {
    const fake = fakePlay({ [`POST ${EDIT}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW`]: (json) => json({}, 400, false) });
    await assert.rejects(makePlayClient({ serviceAccountJson: SA, fetchImpl: fake.fetchImpl }).pushListing(PKG, 'es-ES', listing));
    assert.equal(fake.calls.at(-1), `DELETE ${EDIT}`);
  });
});

describe('playSubmitTarget', () => {
  const eas = JSON.parse(readFileSync(new URL('../../apps/mobile/eas.json', import.meta.url), 'utf8'));
  it('sends production notes to the store app and beta notes to Cultuvilla Beta', () => {
    assert.deepEqual(playSubmitTarget('production', eas), { packageName: 'com.cultuvilla.app', track: 'production' });
    assert.deepEqual(playSubmitTarget('beta', eas), { packageName: 'com.cultuvilla.app.beta', track: 'internal' });
  });
  it('names the profiles it knows when given another', () => {
    assert.throws(() => playSubmitTarget('nope', eas), /known: .*production/);
  });
});

describe('notes text', () => {
  const changelog = (body) => `# Changelog\n\n## v1.14.0 — 2026-12-01\n\n${body}\n\n## v1.13.0 — 2026-11-22\n\n- old\n`;

  it('gives Play the store-notes block as plain text', () => {
    const text = extractReleaseNotes(changelog('<!-- store-notes -->\n- **Grupos**: algo.\n<!-- /store-notes -->\n\n- internal detail'), '1.14.0', { max: MAX_PLAY_NOTES });
    assert.equal(text, '• Grupos: algo.');
  });

  it('cuts a section without a block to Play’s 500 characters', () => {
    const text = extractReleaseNotes(changelog(`- ${'ñ'.repeat(600)}`), '1.14.0', { max: MAX_PLAY_NOTES });
    assert.equal([...text].length, MAX_PLAY_NOTES);
    assert.ok(text.endsWith('…'));
  });

  it('prints a release with its notes for the read-back', () => {
    const out = formatTrackRelease({ name: '41 (1.13.0)', status: 'completed', versionCodes: ['41'], releaseNotes: [{ language: 'es-ES', text: 'a\nb' }] });
    assert.match(out, /name: 41 \(1\.13\.0\)\n\s+status: completed\n\s+versionCodes: 41\n\s+releaseNotes es-ES:\n\s+a\n\s+b/);
    assert.match(formatTrackRelease({ status: 'draft' }), /releaseNotes: \(none\)/);
  });
});

describe('store listing', () => {
  it('the committed es-ES listing fits both stores', () => {
    const listing = loadStoreListing(new URL('../../docs/store/listing-es-ES.md', import.meta.url).pathname);
    assert.deepEqual(validateStoreListing(listing).errors, []);
    assert.equal(listing.name, 'Cultuvilla');
    // Hard wraps in the doc are not line breaks in the store; bullets are.
    assert.ok(!/apúntate con\n/.test(listing.fullDescription));
    assert.match(listing.fullDescription, /\n• Ver el calendario/);
    assert.ok(!listing.fullDescription.includes('**'));
  });

  const doc = ({ short = 'Corta.', subtitle = 'La agenda', keywords = 'fiestas,eventos' } = {}) => `# Store listing

## Shared

| Field | Value |
|---|---|
| Nombre / App Name | \`Cultuvilla\` (Play ≤ 30) |

## Google Play

**Descripción corta** (≤ 80 caracteres):

> ${short}

**Descripción completa** (≤ 4000 caracteres):

> Uno
> dos.
>
> **Título**
>
> • a
> • b

## App Store

| Campo | Límite | Valor |
|---|---|---|
| Subtitle | 30 | \`${subtitle}\` |
| Promotional text | 170 | \`Promo.\` |
| Keywords | 100 | \`${keywords}\` |
`;

  it('reads every field of the doc as store text', () => {
    assert.deepEqual(parseStoreListing(doc()), {
      name: 'Cultuvilla',
      shortDescription: 'Corta.',
      fullDescription: 'Uno dos.\n\nTítulo\n\n• a\n• b',
      subtitle: 'La agenda',
      promotionalText: 'Promo.',
      keywords: 'fiestas,eventos',
      description: 'Uno dos.\n\nTítulo\n\n• a\n• b',
    });
  });

  it('fails what a store rejects, every problem at once', () => {
    const { errors } = validateStoreListing(parseStoreListing(doc({ short: 'x'.repeat(81), subtitle: 's'.repeat(31), keywords: `a, b,,${'k'.repeat(100)}` })));
    assert.equal(errors.length, 5);
    assert.ok(errors.some((e) => /shortDescription is 81 characters; the limit is 80/.test(e)));
    assert.ok(errors.some((e) => /subtitle is 31/.test(e)));
    assert.ok(errors.some((e) => /keywords is \d+ bytes/.test(e)));
    assert.ok(errors.some((e) => /space around «b»/.test(e)));
    assert.ok(errors.some((e) => /empty keyword/.test(e)));
  });

  it('counts keyword bytes, so an ñ costs two', () => {
    const { errors } = validateStoreListing(parseStoreListing(doc({ keywords: 'ñ'.repeat(51) })));
    assert.ok(errors.some((e) => /102 bytes/.test(e)));
  });

  it('only warns about a keyword already in the name or subtitle, or listed twice', () => {
    const r = validateStoreListing(parseStoreListing(doc({ keywords: 'agenda,fiestas,Fiestas' })));
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, ['keyword «agenda» is already in the name or subtitle', 'keyword «Fiestas» is listed twice']);
  });

  it('fails a reshaped doc instead of checking less', () => {
    assert.throws(() => parseStoreListing(doc().replace('**Descripción corta**', 'Descripción corta')), /Descripción corta/);
    assert.throws(() => parseStoreListing(doc().replace('| Keywords', '| Palabras')), /Keywords/);
    assert.throws(() => parseStoreListing(doc().replace('## App Store', '## iOS')), /App Store/);
  });
});
