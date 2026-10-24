import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const sharedSrc = fileURLToPath(new URL('../../packages/shared/src', import.meta.url));

// Hosting serves the build under /estudio/ (firebase.json), ahead of the read
// site's catch-all. Shared models and services are compiled from source, so
// the studio always runs the same code the app does.
export default defineConfig({
  base: '/estudio/',
  plugins: [react()],
  resolve: {
    alias: [{ find: /^@cultuvilla\/shared\/(.*)$/, replacement: `${sharedSrc}/$1` }],
    // One Firebase instance: the shared seam and the studio must not each bundle a copy.
    dedupe: ['firebase', '@firebase/app', '@firebase/auth', 'react', 'react-dom', 'zod'],
  },
  server: {
    port: 5175,
    // Locally, take the dev project's web config from its Hosting site.
    proxy: { '/__/firebase': { target: 'https://villa-events.web.app', changeOrigin: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
