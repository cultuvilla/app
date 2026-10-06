/** A mobile platform we have a store listing for. */
export type StorePlatform = 'ios' | 'android';

/**
 * Which app store, if any, this browser's visitor should be offered.
 *
 * User-agent sniffing is unreliable in general, but the question here is narrow
 * ("which store listing would even install on this device?") and there is no
 * standard API that answers it. `navigator.userAgentData` does not help: it is
 * Chromium-only, so it is absent on exactly the platform that needs the most
 * care (Safari).
 *
 * Returns `null` for desktop and for anything unrecognised — the store link is
 * an offer, so the safe failure is to stay silent rather than to send a Windows
 * visitor to the App Store.
 *
 * @param userAgent `navigator.userAgent`
 * @param maxTouchPoints `navigator.maxTouchPoints` — load-bearing, see below
 */
export function resolveStorePlatform(
  userAgent: string | null | undefined,
  maxTouchPoints: number,
): StorePlatform | null {
  if (!userAgent) return null;

  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios';

  // iPadOS 13+ ships the *desktop* Safari user agent by default, so an iPad is
  // indistinguishable from a Mac by UA alone. The one signal that separates
  // them is touch: Macs report 0 touch points, iPads report 5. Scope this to
  // Macintosh — touchscreen Windows laptops report touch points too, and are
  // not iPads.
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return 'ios';

  // "Windows Phone" UAs also carry an "Android" token for compatibility, so the
  // Android check has to exclude them explicitly. Android tablets omit the
  // "Mobile" token but still install from Play, so we deliberately don't
  // require it.
  if (/Android/.test(userAgent) && !/Windows Phone/.test(userAgent)) return 'android';

  return null;
}
