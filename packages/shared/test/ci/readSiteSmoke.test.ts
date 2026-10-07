import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HOSTS, urlsFor } from '../../../../scripts/smoke-read-site.mjs';

// 2026-10-07: a held release shipped hosting without readSite, cultuvilla.es
// 404'd for five hours with every deploy step green, and Google Play rejected
// the release over its dead privacy and account-deletion URLs. Every deploy
// now asks the live site for those pages and fails when they are not up.

const repoRoot = resolve(__dirname, '../../../..');
const deploy = readFileSync(resolve(repoRoot, '.github/workflows/deploy-firebase.yml'), 'utf-8');

describe('read-site smoke check', () => {
  it('runs on every deploy, after hosting and before the release is recorded', () => {
    const smoke = deploy.indexOf('node scripts/smoke-read-site.mjs --env=${{ inputs.firebase_alias }}');
    expect(smoke).toBeGreaterThan(deploy.indexOf('firebase deploy --only hosting:app'));
    expect(smoke).toBeLessThan(deploy.indexOf('release-announce.mjs record'));
    const step = deploy.slice(deploy.lastIndexOf('- name:', smoke), smoke);
    expect(step).not.toMatch(/\bif:/);
  });

  it('covers every env the deploy runs for, and the store-facing domain on prod', () => {
    for (const env of ['dev', 'beta', 'prod']) expect(HOSTS).toHaveProperty(env);
    expect(HOSTS.prod).toContain('cultuvilla.es');
  });

  it('asks for the pages the store reviews', () => {
    const urls = urlsFor('prod');
    for (const path of ['/legal/privacidad', '/legal/privacy', '/legal/eliminar-cuenta']) {
      expect(urls).toContain(`https://cultuvilla.es${path}`);
    }
  });
});
