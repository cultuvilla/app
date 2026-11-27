// Where gateway calls go when the client talks to the local emulators. The
// Functions SDK's own emulator switch only rewrites calls made by name; a call
// made by URL (the gateway's) would otherwise reach the deployed service.
let functionsEmulatorHost: string | null = null;

/** Called by firebaseInit.ts beside the Functions SDK's emulator switch, with the same host and port. */
// test-login: allowed — state that only firebaseInit.ts's emulator wiring sets.
export function connectCallableGatewayEmulator(host: string, port: number): void {
  functionsEmulatorHost = `${host}:${String(port)}`;
}

/** `host:port` of the Functions emulator, or null against deployed Firebase. */
export function callableGatewayEmulatorHost(): string | null {
  return functionsEmulatorHost;
}
