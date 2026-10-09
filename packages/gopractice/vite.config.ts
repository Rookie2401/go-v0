/**
 * Build of the GoPractice application.
 *
 *   vite build -c packages/gopractice/vite.config.ts
 *       -> packages/gopractice/dist/   a static site with relative URLs (base './'), any host or sub-path:
 *          index.html, assets/*.js, styles.css, config.json, and dict/<lang>/ for the languages in GOPRACTICE_DICT
 *          (default "sq", the only installable pack; set it empty to leave the dictionaries out). Review exercises read
 *          glosses from there, lazily, shard by shard.
 *   vite -c packages/gopractice/vite.config.ts   serves the app for development with the repository's public/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

const dictLanguages = (): string[] => (process.env.GOPRACTICE_DICT ?? 'sq').split(',').map((s) => s.trim()).filter(Boolean);

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

/** Files Vite does not process: config.json and the dictionaries. */
function staticFiles(outDir: string): Plugin {
  return {
    name: 'gopractice-static',
    apply: 'build',
    closeBundle() {
      fs.mkdirSync(outDir, { recursive: true });
      fs.copyFileSync(path.join(here, 'config.json'), path.join(outDir, 'config.json'));
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
      // the stylesheet is bundled into assets/, so its ./fonts/ URLs resolve to assets/fonts/
      copyFonts(path.join(outDir, 'assets', 'fonts'), path.join(outDir, 'EB-Garamond-OFL.txt'));
    },
  };
}

export default defineConfig(({ command }) => {
  if (command === 'serve') {
    return { root: here, base: './', publicDir: path.join(repoRoot, 'public'), plugins: [devFonts()], server: { port: 5198, strictPort: true, watch: { ignored: ['**/public/dict/**', '**/public/library/**', '**/data/**'] } } };
  }
  const outDir = path.join(here, 'dist');
  return {
    root: here,
    base: './',
    publicDir: false,
    logLevel: 'warn',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [staticFiles(outDir)],
    build: { outDir, emptyOutDir: true, copyPublicDir: false, sourcemap: false, minify: true, target: 'es2022', cssCodeSplit: false, chunkSizeWarningLimit: 2500 },
  };
});
