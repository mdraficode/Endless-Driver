// 11.0d heightfield parity page — own Vite root so it never touches the app build.
// Usage: npx vite --config e2e/heightfield-parity/vite.config.mjs
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { defineConfig } from 'vite';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  server: {
    host: '127.0.0.1',
    port: 4199,
    strictPort: true,
  },
});
