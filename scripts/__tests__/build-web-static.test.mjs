import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRobotsTxt, buildWebStatic } from '../build-web-static.mjs';

// dev and beta are public *.web.app sites full of demo seed data under the
// Cultuvilla name. Allowing them is an invitation to index them.
for (const env of ['dev', 'beta']) {
  test(`${env}: disallows everything and advertises no sitemap`, () => {
    const txt = buildRobotsTxt(env);
    assert.match(txt, /^User-agent: \*\nDisallow: \/\n$/);
    assert.doesNotMatch(txt, /Sitemap:/);
  });
}

test('prod: points crawlers at the sitemap on the brand domain', () => {
  assert.match(buildRobotsTxt('prod'), /^Sitemap: https:\/\/cultuvilla\.es\/sitemap\.xml$/m);
});

test('prod: keeps people, invite links and private screens out', () => {
  const txt = buildRobotsTxt('prod');
  for (const path of ['/persona/', '/*/unirse$', '/*/plaza/', '/mis-inscripciones', '/mis-pueblos', '/buzon', '/ajustes', '/admin']) {
    assert.ok(txt.includes(`Disallow: ${path}\n`), `missing Disallow: ${path}`);
  }
  // A bare "Disallow: /" on prod would de-index the whole site.
  assert.doesNotMatch(txt, /^Disallow: \/$/m);
});

for (const env of ['dev', 'beta', 'prod']) {
  test(`${env}: assembles its own deep-link identities, robots and brand files`, () => {
    const out = buildWebStatic(env, mkdtempSync(join(tmpdir(), 'web-static-')));
    const aasa = readFileSync(join(out, '.well-known/apple-app-site-association'), 'utf8');
    assert.equal(aasa, readFileSync(new URL(`../../web/well-known/${env}/apple-app-site-association`, import.meta.url), 'utf8'));
    assert.ok(existsSync(join(out, '.well-known/assetlinks.json')));
    assert.equal(readFileSync(join(out, 'robots.txt'), 'utf8'), buildRobotsTxt(env));
    assert.ok(existsSync(join(out, 'brand/logo-96.png')));
    assert.ok(existsSync(join(out, 'favicon.ico')));
  });
}

test('rejects an unknown env', () => {
  assert.throws(() => buildWebStatic('staging'), /unknown env/);
});
