import { observability } from '@cultuvilla/shared';

let attached = false;

export function attachGlobalHandlers(): void {
  if (attached) return;
  attached = true;

  // Preserve the existing global handler, then forward to observability.
  const g = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler(): (e: unknown, isFatal?: boolean) => void;
      setGlobalHandler(h: (e: unknown, isFatal?: boolean) => void): void;
    };
  };
  const prev = g.ErrorUtils?.getGlobalHandler?.();
  g.ErrorUtils?.setGlobalHandler?.((error, isFatal) => {
    observability.captureError(error, {});
    prev?.(error, isFatal);
  });
}
