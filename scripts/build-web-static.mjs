#!/usr/bin/env node
/**
 * Assembles the static half of the public web into `web/dist` for one env —
 * what Firebase Hosting serves before it rewrites everything else to the
 * `readSite` function (docs/decisions/web-is-a-read-site.md):
 *
 *   - `web/public/**`                       brand images, favicon
 *   - the CULTUVILLA lettering              from its one home, packages/shared/assets/brand
 *   - `web/well-known/<env>/*` → `.well-known/`   this env's deep-link identities
 *   - `robots.txt`                          generated per env
 *   - `apps/studio/dist` → `estudio/`      the web studio, built beforehand
 *                                           (`pnpm --filter @cultuvilla/studio build`)
 *
 * Per env because the deep-link files carry each build's signing identity and
 * dev/beta must never be indexable. Usage: build-web-static.mjs <dev|beta|prod>
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const WEB_DIST = resolve(REPO, 'web/dist');
export const STUDIO_DIST = resolve(REPO, 'apps/studio/dist');
const ENVS = ['dev', 'beta', 'prod'];

// Keep in step with webOriginForProject in packages/shared/src/utils/webOrigin.ts.
const PROD_ORIGIN = 'https://cultuvilla.es';

/** App-only and invite paths; the read site also marks each of them noindex. */
export const PROD_DISALLOWED = [
  '/mis-inscripciones',
  '/mis-pueblos',
  '/buzon',
  '/ajustes',
  '/admin',
  '/persona/',
  '/*/unirse$',
  '/*/plaza/',
  '/estudio',
];

export function buildRobotsTxt(env) {
  // dev and beta are public *.web.app sites full of demo data under the
  // Cultuvilla name: never indexable.
  if (env !== 'prod') return 'User-agent: *\nDisallow: /\n';
  return [
    'User-agent: *',
    'Allow: /',
    ...PROD_DISALLOWED.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${PROD_ORIGIN}/sitemap.xml`,
    '',
  ].join('\n');
}

export function buildWebStatic(env, out = WEB_DIST, studio = STUDIO_DIST) {
  if (!ENVS.includes(env)) throw new Error(`build-web-static: unknown env "${env}" (dev|beta|prod)`);
  // A deploy without the studio would 404 every /estudio page: fail instead.
  if (!existsSync(resolve(studio, 'index.html'))) {
    throw new Error('build-web-static: the studio is not built — run `pnpm --filter @cultuvilla/studio build` first');
  }
  rmSync(out, { recursive: true, force: true });
  cpSync(resolve(REPO, 'web/public'), out, { recursive: true });
  cpSync(resolve(REPO, 'packages/shared/assets/brand/cultuvilla-lettering.svg'), resolve(out, 'brand/cultuvilla-lettering.svg'));
  mkdirSync(resolve(out, '.well-known'), { recursive: true });
  cpSync(resolve(REPO, `web/well-known/${env}`), resolve(out, '.well-known'), { recursive: true });
  writeFileSync(resolve(out, 'robots.txt'), buildRobotsTxt(env));
  cpSync(studio, resolve(out, 'estudio'), { recursive: true });
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const env = process.argv[2];
  if (!ENVS.includes(env ?? '')) {
    console.error('build-web-static: usage: build-web-static.mjs <dev|beta|prod>');
    process.exit(2);
  }
  console.log(`build-web-static: assembled ${env} into ${buildWebStatic(env)}`);
}
