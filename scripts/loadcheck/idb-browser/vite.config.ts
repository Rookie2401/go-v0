import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Browser build of the timing page: root is this folder; the repository packages bundle as plain TypeScript (no alias or define needed).
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  publicDir: false,
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
});
