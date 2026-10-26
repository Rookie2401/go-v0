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
   The setup page imports the analysers it needs (German, Hindi, Thai, Spanish) from the extension's own `analysers/<id>.js`; the web build splits them into chunks.
 *
 * Language-pack files (the dictionary shards the installer fetches) are copied from public/dict/<lang>/ for the
 * languages in GOLEARN_APP_DICT (default "sq", the only installable pack; set it empty to leave them out).
 * `vite -c packages/golearn-extension/app/vite.config.ts` serves the app for development with the repository’s public/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type BuildEnvironmentOptions, type Plugin } from 'vite';
import { leanBuiltins } from '../vite.config.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(here, '..');
const repoRoot = path.resolve(here, '../../..');

const dictLanguages = (): string[] => (process.env.GOLEARN_APP_DICT ?? 'sq').split(',').map((s) => s.trim()).filter(Boolean);

const fontsSource = path.join(repoRoot, 'packages', 'shared-fonts');

/** The EB Garamond files (SIL OFL 1.1) and their licence text: copied into the build beside the stylesheet's fonts/ folder, and served in development. */
function copyFonts(fontsOut: string, licenceOut: string): void {
  if (!fs.existsSync(fontsSource)) return;
  fs.mkdirSync(fontsOut, { recursive: true });
  for (const f of fs.readdirSync(fontsSource)) if (f.endsWith('.woff2')) fs.copyFileSync(path.join(fontsSource, f), path.join(fontsOut, f));
  const licence = path.join(fontsSource, 'EB-Garamond-OFL.txt');
  if (fs.existsSync(licence)) { fs.copyFileSync(licence, path.join(fontsOut, 'EB-Garamond-OFL.txt')); fs.copyFileSync(licence, licenceOut); }
}

/** Development only: serve /fonts/<file>.woff2 from packages/shared-fonts. */
function devFonts(): Plugin {
  return {
    name: 'fonts-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/fonts', (req, res, next) => {
        const name = path.basename((req.url ?? '').split('?')[0]);
        const file = path.join(fontsSource, name);
        if (!name.endsWith('.woff2') || !fs.existsSync(file)) return next();
        res.setHeader('Content-Type', 'font/woff2');
        res.end(fs.readFileSync(file));
      });
    },
  };
}

/** Files Vite does not process: config.json, the dictionaries, and (options mode) the classic-script page. */
function staticFiles(outDir: string, classic: boolean): Plugin {
  return {
    name: 'golearn-app-static',
    apply: 'build',
    closeBundle() {
      fs.mkdirSync(outDir, { recursive: true });
      fs.copyFileSync(path.join(here, 'config.json'), path.join(outDir, 'config.json'));
      fs.cpSync(path.join(here, 'icons'), path.join(outDir, 'icons'), { recursive: true });
      if (classic) {
        // a classic script, not a module: the page loads ./app.js with defer
        const html = fs.readFileSync(path.join(here, 'index.html'), 'utf8')
          .replace(/<script type="module" src="\.\/main\.ts"><\/script>/, '<script src="./app.js" defer></script>')
          // the extension's options page is not an installable web app: no manifest link, no manifest file
          .replace(/<link rel="manifest"[^>]*>\r?\n?/, '');
        fs.writeFileSync(path.join(outDir, 'index.html'), html);
        fs.copyFileSync(path.join(here, 'styles.css'), path.join(outDir, 'styles.css'));
      } else {
        // the hosted web app: the web app manifest (with the share target) and its icon, beside index.html, so relative URLs resolve from any sub-path
        fs.copyFileSync(path.join(here, 'manifest.webmanifest'), path.join(outDir, 'manifest.webmanifest'));
        // Vite hashes a linked manifest into assets/, where its relative start_url, scope and icon would resolve wrongly: point the link back at the copy beside index.html
        const page = path.join(outDir, 'index.html');
        const built = fs.readFileSync(page, 'utf8');
        const hashed = /href="\.\/assets\/(manifest-[^"]*\.webmanifest)"/.exec(built);
        if (hashed) {
          fs.writeFileSync(page, built.replace(hashed[0], 'href="./manifest.webmanifest"'));
          fs.rmSync(path.join(outDir, 'assets', hashed[1]), { force: true });
        }
        const icon = path.join(repoRoot, 'public', 'favicon.svg');
        if (fs.existsSync(icon)) fs.copyFileSync(icon, path.join(outDir, 'favicon.svg'));
      }
      for (const lang of dictLanguages()) {
        const from = path.join(repoRoot, 'public', 'dict', lang);
        // the frequency sidecar was counted from the retired library and is quarantined (RIGHTS-AND-PRIVACY-BOUNDARIES §2): never shipped
        if (fs.existsSync(from)) fs.cpSync(from, path.join(outDir, 'dict', lang), { recursive: true, filter: (src) => path.basename(src) !== 'frequency.json' });
        const shipped = path.join(outDir, 'dict', lang, 'manifest.json');
        // the shipped manifest must not promise the sidecar that was left out
        if (fs.existsSync(shipped)) fs.writeFileSync(shipped, JSON.stringify({ ...JSON.parse(fs.readFileSync(shipped, 'utf8')), hasFrequency: false }, null, 2));
      }
      const notices = path.join(repoRoot, 'THIRD-PARTY-NOTICES.md');
      if (fs.existsSync(notices)) fs.copyFileSync(notices, path.join(outDir, 'THIRD-PARTY-NOTICES.md'));
      // options build: styles.css is copied as it is, so ./fonts/ sits beside it; web build: the stylesheet is bundled into assets/
      copyFonts(path.join(outDir, classic ? 'fonts' : path.join('assets', 'fonts')), path.join(outDir, 'EB-Garamond-OFL.txt'));
    },
  };
}

/** The extension analysers are imported by URL from a classic script; Vite's preload helper mentions import.meta, which an IIFE replaces with {} (see ../vite.config.ts). */
const quietImportMeta: NonNullable<NonNullable<BuildEnvironmentOptions['rollupOptions']>['onwarn']> = (warning, handler) => { if (warning.code !== 'EMPTY_IMPORT_META') handler(warning); };

export default defineConfig(({ mode, command }) => {
  if (command === 'serve') {
    return { root: here, base: './', publicDir: path.join(repoRoot, 'public'), plugins: [devFonts()], server: { port: 5197, strictPort: true, watch: { ignored: ['**/public/dict/**', '**/public/library/**', '**/data/**'] } } };
  }
  if (mode !== 'options' && mode !== 'web') throw new Error('mode must be "options" or "web"');
  const options = mode === 'options';
  const outDir = path.join(extensionRoot, options ? 'dist/app' : 'dist-web');
  return {
    root: here,
    base: './',
    publicDir: false,
    logLevel: 'warn',
    // the pack runtime's analysers: Albanian linked in, the others loaded on demand (see ../vite.config.ts leanBuiltins and analysers.ts)
    define: { 'process.env.NODE_ENV': '"production"', __GOLEARN_ANALYSERS__: options ? '"url"' : '"chunks"' },
    plugins: [leanBuiltins(), staticFiles(outDir, options)],
    build: {
      outDir,
      emptyOutDir: true,
      copyPublicDir: false,
      sourcemap: false,
      minify: true,
      target: options ? 'chrome110' : 'es2022',
      cssCodeSplit: false,
      ...(options
        ? { rollupOptions: { input: path.join(here, 'main.ts'), onwarn: quietImportMeta, output: { format: 'iife' as const, name: 'GoLearnApp', entryFileNames: 'app.js' } } }
        : { chunkSizeWarningLimit: 2000 }),
    },
  };
});
