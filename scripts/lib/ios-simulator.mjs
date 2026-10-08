/**
 * Which Simulator the iOS E2E run boots when none is booted and none is named
 * (the CI path: a fresh macOS runner). Pure, so it is unit-tested.
 *
 * The newest iOS runtime, then the iPhone whose name sorts first (numerically:
 * "iPhone 9" before "iPhone 17"). Deterministic for a given Xcode image, and
 * independent of `simctl`'s listing order; which model that is can still move
 * with an Xcode bump, which is fine — the suite does not depend on one.
 */

/** `…SimRuntime.iOS-26-5` → [26, 5]; non-iOS or malformed → [0]. */
export function runtimeVersion(runtime) {
  return (/iOS-([\d-]+)$/.exec(runtime)?.[1] ?? '0').split('-').map(Number);
}

/** Negative when `a` is the newer runtime — iOS 26 outranks iOS 9, which a string sort gets wrong. */
export function compareRuntimesNewestFirst(a, b) {
  const [va, vb] = [runtimeVersion(a), runtimeVersion(b)];
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    if ((vb[i] ?? 0) !== (va[i] ?? 0)) return (vb[i] ?? 0) - (va[i] ?? 0);
  }
  return 0;
}

/** `devices`: `[{ udid, name, runtime }]` from `simctl list devices available`. Undefined when no iPhone exists. */
export function pickSimulator(devices) {
  return devices
    .filter((d) => d.runtime.includes('iOS') && d.name.startsWith('iPhone'))
    .sort(
      (a, b) =>
        compareRuntimesNewestFirst(a.runtime, b.runtime) ||
        a.name.localeCompare(b.name, 'en', { numeric: true }),
    )[0];
}
