import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vite';

// The controlled reader page (PROTOTYPE) is built and served on its own, apart from the Go app:
//   npm run reader:build            → packages/controlled-reader/dist  (mode "prototype": window.__reader + ?fixture= on)
//   npx vite --config packages/controlled-reader/vite.config.ts --mode prototype   → dev server on 5197
// A build in any other mode leaves out the debug handle and the fixtures.
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');

export default defineConfig({
  root: here,
  base: './',
  server: { port: 5197, strictPort: true, fs: { allow: [repo] } },
  preview: { port: 4197, strictPort: true },
  build: { outDir: path.join(here, 'dist'), emptyOutDir: true, target: 'es2023', chunkSizeWarningLimit: 1200 },
});
