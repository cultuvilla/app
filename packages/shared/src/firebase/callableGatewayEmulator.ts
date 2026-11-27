// Where gateway calls go when the client talks to the local emulators.
// `connectFunctionsEmulator` only rewrites calls made by name; a call made by
// URL (the gateway's) would otherwise reach the deployed service.
let functionsEmulatorHost: string | null = null;

/** Called beside `connectFunctionsEmulator`, with the same host and port. */
export function connectCallableGatewayEmulator(host: string, port: number): void {
  functionsEmulatorHost = `${host}:${String(port)}`;
}

/** `host:port` of the Functions emulator, or null against deployed Firebase. */
export function callableGatewayEmulatorHost(): string | null {
  return functionsEmulatorHost;
}
