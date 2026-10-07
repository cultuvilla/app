import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SMOKE_UID, smokePaths, uploadUrl } from '../../../../scripts/smoke-storage-upload.mjs';

// 2026-10-07: storage.rules gated image writes on cross-service
// firestore.exists(), which the emulator allows and every deployed project
// denies. The rules suite passed and every event cover in prod failed. Every
// deploy now uploads to each image path as a real signed-in user.

const repoRoot = resolve(__dirname, '../../../..');
const deploy = readFileSync(resolve(repoRoot, '.github/workflows/deploy-firebase.yml'), 'utf-8');
const imageService = readFileSync(
  resolve(repoRoot, 'packages/shared/src/services/imageService.ts'),
  'utf-8',
);

describe('storage upload smoke check', () => {
  const run = 'node scripts/smoke-storage-upload.mjs --env=${{ inputs.firebase_alias }}';

  it('runs on every dev and beta deploy, after the rules have had the slow deploys to propagate', () => {
    const smoke = deploy.indexOf(run);
    expect(smoke).toBeGreaterThan(deploy.indexOf('firebase deploy --only firestore:rules,storage'));
    expect(smoke).toBeGreaterThan(deploy.indexOf('firebase deploy --only functions'));
    expect(smoke).toBeGreaterThan(deploy.indexOf('firebase deploy --only hosting:app'));
    const step = deploy.slice(deploy.lastIndexOf('- name:', smoke), smoke);
    // Gated only by env — never by the backend hold, which a beta deploy never sets.
    expect(step).toContain("if: ${{ inputs.firebase_alias != 'prod' }}");
    expect(step).toContain('FIREBASE_WEB_API_KEY: ${{ vars.FIREBASE_API_KEY }}');
  });

  it('uploads to every village-scoped prefix imageService writes to', () => {
    const paths = smokePaths('m1');
    const prefixes = [
      /municipalities\/\$\{municipalityId\}\/images\//,
      /municipalities\/\$\{municipalityId\}\/events\//,
      /municipalities\/\$\{municipalityId\}\/places\//,
      /municipalities\/\$\{municipalityId\}\/barrios\//,
      /`festivalPosters\//,
      /`historyEntries\//,
      /`organizations\//,
      /`news\//,
      /`users\//,
    ];
    for (const re of prefixes) expect(imageService).toMatch(re);
    for (const p of [
      'municipalities/m1/images/',
      'municipalities/m1/events/',
      'municipalities/m1/places/',
      'municipalities/m1/barrios/',
      'festivalPosters/m1/',
      'historyEntries/m1/',
      'organizations/',
      'news/',
      `users/${SMOKE_UID}/photo/`,
    ]) {
      expect(paths.some((x) => x.startsWith(p))).toBe(true);
    }
  });

  it('encodes the object name into a single query parameter', () => {
    expect(uploadUrl('b.firebasestorage.app', 'news/x/images/y.png')).toBe(
      'https://firebasestorage.googleapis.com/v0/b/b.firebasestorage.app/o?uploadType=media&name=news%2Fx%2Fimages%2Fy.png',
    );
  });
});
