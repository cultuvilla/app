// The global error handlers fire outside React, so they cannot reach the router
// through a hook. useRouteTracking mirrors the active route here on every
// navigation, so an unhandled error can still say which screen produced it.
let tracked: string | null = null;

export function setCurrentRoute(route: string): void {
  tracked = route;
}

/** Test-only: drop the mirrored route between cases. */
export function __resetCurrentRouteForTest(): void {
  tracked = null;
}

export function getCurrentRoute(): string | undefined {
  return tracked ?? undefined;
}
