import fs from 'fs';
import path from 'path';

// The root layout is too heavy to render under jest, so this locks its wiring
// at the source: everything that can navigate or listen — the router's Stack
// (AuthGate), the deep-link router, auth's link listener, push's notification
// taps, the village sync — mounts only as a child of AppVersionGate, which
// renders the blocker instead of its children under a hard wall. Move one
// outside and a walled binary runs again (docs/decisions/hard-wall-replaces-app-tree.md).
const source = fs
  .readFileSync(path.resolve(__dirname, '..', '_layout.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '');

const gated = (() => {
  const open = source.indexOf('<AppVersionGate>');
  const close = source.indexOf('</AppVersionGate>');
  expect(open).toBeGreaterThanOrEqual(0);
  expect(close).toBeGreaterThan(open);
  return source.slice(open, close);
})();
const outside = source.replace(gated, '');

describe('_layout.tsx mounts every app entry point behind AppVersionGate', () => {
  it.each([
    ['the router (AuthGate)', /<AuthGate\b/],
    ['auth and its deep-link listener', /<AuthProvider\b/],
    ['notification taps', /<PushProvider\b/],
    ['the village sync', /<VillageSync\b/],
    ['callable error handling', /<CallableErrorProvider\b/],
  ])('%s is inside the gate', (_label, pattern) => {
    expect(gated).toMatch(pattern);
    expect(outside.replace(/^import .*$/gm, '')).not.toMatch(pattern);
  });

  it('only AuthGate renders the Stack and the deep-link router', () => {
    const authGate = source.slice(source.indexOf('function AuthGate('));
    expect(authGate).toMatch(/<Stack\b/);
    expect(authGate).toMatch(/useDeepLinkRouter\(/);
    const beforeAuthGate = source.slice(0, source.indexOf('function AuthGate('));
    expect(beforeAuthGate.replace(/^import .*$/gm, '')).not.toMatch(/<Stack\b|useDeepLinkRouter\(/);
  });
});
