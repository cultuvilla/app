/**
 * Build options shared by the deploy bundle and the local Wrapped preview, so a
 * preview that renders is proof the deploy bundle renders too.
 */
export const sharedBuildOptions = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  external: [
    'firebase-admin',
    'firebase-admin/*',
    'firebase-functions',
    'firebase-functions/*',
    'sharp',
    // google-gax loads its .proto files from disk at runtime.
    '@google-cloud/pubsub',
  ],
  // Fonts and the brand mark are inlined into the bundle. Only `functions/` is
  // uploaded and nothing copies loose assets into dist/, so reading one from disk
  // at runtime would work in the emulator and throw ENOENT in the deployed container.
  loader: { '.ttf': 'binary', '.png': 'binary' },
};
