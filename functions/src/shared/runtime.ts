// Set by the Functions emulator runtime itself — it cannot be true in deployed
// Functions, so this is a guard by physics rather than by configuration. Read at
// call time (not module load) so tests can toggle it.
export function isFunctionsEmulator(): boolean {
  return process.env.FUNCTIONS_EMULATOR === 'true';
}
