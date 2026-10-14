import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

/**
 * GitHub Pages serves project sites from `/<repository>/`, so the deploy workflow sets
 * `VITE_BASE_PATH` and the build is emitted with that prefix. Local development and the sandbox
 * preview leave it unset and stay at the root, so no path logic changes between the two.
 *
 * Runtime asset URLs (the HDRI and the manifest) are deliberately relative — `assets/manifest.json`
 * rather than `/assets/manifest.json` — so they resolve under whichever base is in use.
 */
const base = process.env['VITE_BASE_PATH'] ?? '/';

export default defineConfig({
  base,
  plugins: [tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: ['.e2b.app'],
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: ['.e2b.app'],
  },
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
