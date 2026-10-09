/**
 * Build of the GoLearn setup application. Two modes:
 *
 *   vite build -c packages/golearn-extension/app/vite.config.ts --mode options
 *       -> packages/golearn-extension/dist/app/   index.html, app.js (one classic IIFE script), styles.css, config.json
 *          The extension’s manifest names it as "options_page": "app/index.html". Run it AFTER `npm run ext:build`:
 *          that build empties dist/ first.
 *   vite build -c packages/golearn-extension/app/vite.config.ts --mode web
 *       -> packages/golearn-extension/dist-web/   a static site with relative URLs (base './'), any host or sub-path
 *
 * Language-pack files (the dictionary shards the installer fetches) are copied from public/dict/<lang>/ for the
 * languages in GOLEARN_APP_DICT (default "sq", the only installable pack; set it empty to leave them out).
 * `vite -c packages/golearn-extension/app/vite.config.ts` serves the app for development with the repository’s public/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(here, '..');
const repoRoot = path.resolve(here, '../../..');

const dictLanguages = (): string[] => (process.env.GOLEARN_APP_DICT ?? 'sq').split(',').map((s) => s.trim()).filter(Boolean);

/** Files Vite does not process: config.json, the dictionaries, and (options mode) the classic-script page. */
function staticFiles(outDir: string, classic: boolean): Plugin {
  return {
    name: 'golearn-app-static',
    apply: 'build',
    closeBundle() {
      fs.mkdirSync(outDir, { recursive: true });
      fs.copyFileSync(path.join(here, 'config.json'), path.join(outDir, 'config.json'));
      if (classic) {
        // a classic script, not a module: the page loads ./app.js with defer
        const html = fs.readFileSync(path.join(here, 'index.html'), 'utf8')
          .replace(/<script type="module" src="\.\/main\.ts"><\/script>/, '<script src="./app.js" defer></script>');
        fs.writeFileSync(path.join(outDir, 'index.html'), html);
        fs.copyFileSync(path.join(here, 'styles.css'), path.join(outDir, 'styles.css'));
      }
      for (const lang of dictLanguages()) {
        const from = path.join(repoRoot, 'public', 'dict', lang);
        // the frequency sidecar was counted from the retired library and is quarantined (RIGHTS-AND-PRIVACY-BOUNDARIES §2): never shipped
        if (fs.existsSync(from)) fs.cpSync(from, path.join(outDir, 'dict', lang), { recursive: true, filter: (src) => path.basename(src) !== 'frequency.json' });
      }
      const notices = path.join(repoRoot, 'THIRD-PARTY-NOTICES.md');
      if (fs.existsSync(notices)) fs.copyFileSync(notices, path.join(outDir, 'THIRD-PARTY-NOTICES.md'));
    },
  };
}

export default defineConfig(({ mode, command }) => {
  if (command === 'serve') {
    return { root: here, base: './', publicDir: path.join(repoRoot, 'public'), server: { port: 5197, strictPort: true, watch: { ignored: ['**/public/dict/**', '**/public/library/**', '**/data/**'] } } };
  }
  if (mode !== 'options' && mode !== 'web') throw new Error('mode must be "options" or "web"');
  const options = mode === 'options';
  const outDir = path.join(extensionRoot, options ? 'dist/app' : 'dist-web');
  return {
    root: here,
    base: './',
    publicDir: false,
    logLevel: 'warn',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [staticFiles(outDir, options)],
    build: {
      outDir,
      emptyOutDir: true,
      copyPublicDir: false,
      sourcemap: false,
      minify: true,
      target: options ? 'chrome110' : 'es2022',
      cssCodeSplit: false,
      ...(options
        ? { rollupOptions: { input: path.join(here, 'main.ts'), output: { format: 'iife' as const, name: 'GoLearnApp', entryFileNames: 'app.js' } } }
        : { chunkSizeWarningLimit: 2000 }),
    },
  };
});
