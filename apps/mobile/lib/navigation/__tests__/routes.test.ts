import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveAuthRoute } from '../../auth/authRoute';
import {
  barrioHref,
  createEventHref,
  createNewsHref,
  defineWordHref,
  discoverOrganizeHref,
  entityRefHref,
  eventHref,
  festivalPosterEditHref,
  festivalPosterHref,
  historyEntryEditHref,
  historyEntryHref,
  myVillageHref,
  newHistoryEntryHref,
  newWordHref,
  newsHref,
  orgEditHref,
  orgHref,
  orgJoinHref,
  personHref,
  placeEditHref,
  placeHref,
  routes,
  seatClaimHref,
  userHref,
  villageHref,
  villageSectionHref,
  wordHref,
} from '../routes';

// Every path the app navigates to must land on a real route file. A typed-route
// string is cast from a template, so TypeScript cannot check it — and a path
// that names a renamed file fails only at runtime, as the "not found" screen.
// The onboarding redirect shipped exactly that way once: the code and its unit
// test agreed on a path no file answered.

const appDir = resolve(__dirname, '../../../app');

function isRouteFile(dir: string, name: string): boolean {
  return existsSync(join(dir, `${name}.tsx`)) || existsSync(join(dir, `${name}.ts`));
}

/** Resolves a URL path the way expo-router would, against the files in app/. */
function resolvesToRouteFile(path: string): boolean {
  const segments = path.split('?')[0]!.split('/').filter(Boolean);
  const walk = (dir: string, rest: string[]): boolean => {
    const entries = readdirSync(dir);
    const groups = entries.filter((e) => /^\(.+\)$/.test(e));
    if (rest.length === 0) {
      return isRouteFile(dir, 'index') || groups.some((g) => walk(join(dir, g), rest));
    }
    const [head, ...tail] = rest as [string, ...string[]];
    if (/^\(.+\)$/.test(head)) return entries.includes(head) && walk(join(dir, head), tail);
    const dynamic = entries.filter((e) => /^\[[^.].*\]$/.test(e.replace(/\.tsx?$/, '')));
    const candidates = [head, ...dynamic.map((e) => e.replace(/\.tsx?$/, ''))];
    for (const name of candidates) {
      if (tail.length === 0 && isRouteFile(dir, name)) return true;
      if (entries.includes(name) && walk(join(dir, name), tail)) return true;
    }
    return groups.some((g) => walk(join(dir, g), rest));
  };
  return walk(appDir, segments);
}

const E2E_VILLAGE_SLUG = 'altozano-de-prueba';

/** True when a first path segment names a file or folder in app/ (or a group), not [pueblo]. */
function isStaticTopSegment(head: string): boolean {
  const dirs = [appDir, ...readdirSync(appDir).filter((e) => /^\(.+\)$/.test(e)).map((g) => join(appDir, g))];
  return dirs.some((dir) => isRouteFile(dir, head) || existsSync(join(dir, head)));
}

const event = { id: 'e1', title: 'Fiesta', villageSlug: 'villa', visibilityOrgId: null };
const org = { id: 'o1', name: 'Peña', villageSlug: 'villa' };
const poster = { id: 'c1', title: null, year: 1987, villageSlug: 'villa' };
const entry = { id: 'h1', title: 'Riada', villageSlug: 'villa' };
const thing = { id: 'x1', name: 'Ermita' };

const built: [string, string][] = [
  ...Object.entries(routes),
  ['myVillageHref', myVillageHref('m1')],
  ['villageHref', villageHref('villa')],
  ...(['barrios', 'carteles', 'censo', 'comunidad', 'editar', 'entidades', 'historia', 'lugares', 'miembros', 'vocabulario'] as const).map(
    (s): [string, string] => [`villageSectionHref(${s})`, villageSectionHref('villa', s)],
  ),
  ['eventHref', eventHref(event)],
  ['seatClaimHref', seatClaimHref(event, 'tok')],
  ['newsHref', newsHref({ id: 'n1', title: 'Bando', villageSlug: 'villa' })],
  ['orgHref', orgHref(org)],
  ['orgEditHref', orgEditHref(org)],
  ['orgJoinHref', orgJoinHref(org)],
  ['placeHref', placeHref('villa', thing)],
  ['placeEditHref', placeEditHref('villa', thing)],
  ['barrioHref', barrioHref('villa', thing)],
  ['festivalPosterHref', festivalPosterHref(poster)],
  ['festivalPosterEditHref', festivalPosterEditHref(poster)],
  ['historyEntryHref', historyEntryHref(entry)],
  ['historyEntryEditHref', historyEntryEditHref(entry)],
  ['newHistoryEntryHref', newHistoryEntryHref('villa')],
  ['wordHref', wordHref('villa', 'esbardo')],
  ['defineWordHref', defineWordHref('villa', 'esbardo')],
  ['newWordHref', newWordHref('villa')],
  ['personHref', personHref('p1')],
  ['userHref', userHref('u1')],
  ['createEventHref', createEventHref({ villageId: 'm1' })],
  ['createNewsHref', createNewsHref({ newsId: 'n1' })],
  ['discoverOrganizeHref', discoverOrganizeHref('m1')],
  ['entityRefHref', entityRefHref('event', 'villa', '_e1')],
];

describe('every in-app path lands on a route file', () => {
  it.each(built)('%s → %s', (_name, path) => {
    expect(resolvesToRouteFile(path)).toBe(true);
  });

  it('so does every redirect the auth gate makes', () => {
    const redirects = [
      resolveAuthRoute({ user: true, profileChecked: true, hasPersonId: false, topSegment: '(tabs)' }),
      resolveAuthRoute({ user: true, profileChecked: true, hasPersonId: true, topSegment: '(onboarding)' }),
    ].filter((r): r is NonNullable<typeof r> => r != null);
    expect(redirects.length).toBeGreaterThan(0);
    for (const path of redirects) expect(resolvesToRouteFile(path)).toBe(true);
  });

  // A top-level segment that no file names still "resolves" — to [pueblo], as a
  // village slug. So a Maestro link to a renamed screen (`cultuvilla://profile`
  // after the move to `/perfil`) passes the check above and fails only on the
  // AVD, as a village-not-found screen with no tab bar.
  it('so does every deep link the native e2e suite opens', () => {
    const nativeDir = resolve(__dirname, '../../../e2e/native');
    const links = ['flows', 'subflows'].flatMap((sub) =>
      readdirSync(join(nativeDir, sub))
        .filter((f) => f.endsWith('.yaml'))
        .flatMap((f) => [...readFileSync(join(nativeDir, sub, f), 'utf8').matchAll(/openLink:\s*'?cultuvilla:\/\/([^'\s]*)/g)])
        .map((m) => m[1]!.split('?')[0]!),
    );
    expect(links.length).toBeGreaterThan(0);
    for (const path of links) {
      expect(resolvesToRouteFile(`/${path}`)).toBe(true);
      const head = path.split('/')[0]!;
      const isVillage = head === E2E_VILLAGE_SLUG || head.startsWith('${');
      if (!isVillage) expect({ path, static: isStaticTopSegment(head) }).toEqual({ path, static: true });
    }
  });

  // The helpers above are only half the surface: a hand-written literal passed
  // straight to the router bypasses them. The register sheet shipped
  // `router.push('/(auth)/login')` past a rename to `entrar`, and every guest
  // sign-up from a gated action hit "Unmatched route" in production.
  it('so does every literal path handed to the router', () => {
    const mobileDir = resolve(__dirname, '../../..');
    const sources = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = join(dir, e.name);
        if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : sources(full);
        return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
      });
    const literal = /(?:\b(?:push|replace|navigate|dismissTo)\(\s*|\bhref=\{?\s*|\bpathname:\s*)(['"`])(\/[^'"`$]*)\1/g;
    const paths = ['app', 'components', 'lib'].flatMap((sub) =>
      sources(join(mobileDir, sub)).flatMap((file) =>
        [...readFileSync(file, 'utf8').matchAll(literal)].map((m) => ({ file: file.slice(mobileDir.length + 1), path: m[2]! })),
      ),
    );
    expect(paths.length).toBeGreaterThan(0);
    for (const { file, path } of paths) {
      const head = path.split('?')[0]!.split('/').filter(Boolean)[0];
      const ok = resolvesToRouteFile(path) && (head === undefined || isStaticTopSegment(head));
      expect({ file, path, ok }).toEqual({ file, path, ok: true });
    }
  });

  it('does not resolve a path no file answers', () => {
    expect(resolvesToRouteFile('/(onboarding)/complete-profile')).toBe(false);
    expect(resolvesToRouteFile('/ajustes/nada')).toBe(false);
  });
});
