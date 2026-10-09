/**
 * Build of the GoLearn extension into packages/golearn-extension/dist/. Three self-contained classic scripts (a
 * content script injected with chrome.scripting cannot import modules, so nothing is split into shared chunks):
 *
 *   vite build -c packages/golearn-extension/vite.config.ts --mode content      -> dist/content.js (+ manifest.json, action/popup.html)
 *   vite build -c packages/golearn-extension/vite.config.ts --mode background   -> dist/background.js
 *   vite build -c packages/golearn-extension/vite.config.ts --mode action       -> dist/action/popup.js
 *
 * `npm run ext:build` runs the three in order. The language adapter is bundled into content.js (pure, no network).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));

const ENTRIES = {
  content: { input: path.join(here, 'src/content/index.ts'), file: 'content.js', name: 'GoLearnContent' },
  background: { input: path.join(here, 'src/background/index.ts'), file: 'background.js', name: 'GoLearnBackground' },
  action: { input: path.join(here, 'action/popup.ts'), file: 'action/popup.js', name: 'GoLearnPopup' },
} as const;

/** Copy the static files once, in the first (content) build. */
function copyStatic(): Plugin {
  return {
    name: 'golearn-copy-static',
    apply: 'build',
    closeBundle() {
      const dist = path.join(here, 'dist');
      fs.mkdirSync(path.join(dist, 'action'), { recursive: true });
      fs.copyFileSync(path.join(here, 'manifest.json'), path.join(dist, 'manifest.json'));
      fs.copyFileSync(path.join(here, 'action/popup.html'), path.join(dist, 'action/popup.html'));
    },
  };
}

export default defineConfig(({ mode }) => {
  const entry = ENTRIES[mode as keyof typeof ENTRIES];
  if (!entry) throw new Error(`mode must be one of: ${Object.keys(ENTRIES).join(', ')}`);
  return {
    root: here,
    base: './',
    publicDir: false,
    logLevel: 'warn',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: mode === 'content' ? [copyStatic()] : [],
    build: {
      outDir: path.join(here, 'dist'),
      emptyOutDir: mode === 'content',
      copyPublicDir: false,
      sourcemap: false,
      minify: true,
      target: 'chrome110',
      rollupOptions: {
        input: { [mode]: entry.input },
        output: { format: 'iife', name: entry.name, entryFileNames: entry.file },
      },
    },
  };
});
