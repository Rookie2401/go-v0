/**
 * Build of the GoPractice application.
 *
 *   vite build -c packages/gopractice/vite.config.ts
 *       -> packages/gopractice/dist/   a static site with relative URLs (base './'), any host or sub-path:
 *          index.html, assets/*.js, styles.css, config.json, and dict/<lang>/ for the languages in GOPRACTICE_DICT
 *          (default "sq,es,de,hi,th", the currently supported installable packs; set it empty to leave the dictionaries out). Review exercises read
 *          glosses from there, lazily, shard by shard.
 *   vite build -c packages/gopractice/vite.config.ts --mode extension
 *       -> packages/golearn-extension/dist/practice/   the same app as a page of the GoLearn extension (chrome-extension://<id>/practice/index.html).
 *          Relative asset paths, the same config.json, dictionaries and fonts as the web build. Served from the extension, GoPractice works on the
 *          device with no account (src/localBinding.ts reaches the extension's on-device Repository); the extension's popup and setup page link to it.
 *          Run it AFTER `npm run ext:build`: that build empties dist/ (keeping only dist/app/), so dist/practice/ has to be rebuilt after it.
 *   vite build -c packages/gopractice/vite.config.ts --mode review
 *       -> packages/gopractice/dist-review/   GoReview, the installable iPhone edition: the same static site plus a web manifest, icons, iOS meta tags,
 *          a service worker (sw.js, stamped with a build id and the precache list) and its registration, inlined into index.html. Starts at #/review.
 *   GOPRACTICE_OUT=<folder> puts any of the three builds in that folder instead; GOPRACTICE_DICT=sq,hi limits the dictionaries shipped.
 *   vite -c packages/gopractice/vite.config.ts   serves the app for development with the repository's public/.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { createReleaseManifest, normalizeCompiledModuleId, verifyReleaseArtifact } from '../../scripts/goreview-release.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

const dictLanguages = (): string[] => (process.env.GOPRACTICE_DICT ?? 'sq,es,de,hi,th').split(',').map((s) => s.trim()).filter(Boolean);

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
function staticFiles(outDir: string, pwa = false): Plugin {
  return {
    name: 'gopractice-static',
    apply: 'build',
    closeBundle() {
      fs.mkdirSync(outDir, { recursive: true });
      // GOPRACTICE_SERVICE_URL (https, or http on localhost) replaces config.json's serviceUrl in the copy: the installable review
      // edition is built against the public Repository address (e.g. https://repo.golearn-global-languages.com), the source file
      // keeps the local development address. Anything else is refused so a typo cannot ship.
      const config = JSON.parse(fs.readFileSync(path.join(here, 'config.json'), 'utf8')) as { serviceUrl: string };
      const override = process.env.GOPRACTICE_SERVICE_URL;
      if (override) {
        const u = new URL(override);
        const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
        if (!(u.protocol === 'https:' || (u.protocol === 'http:' && local)) || u.search || u.hash || u.username) throw new Error(`GOPRACTICE_SERVICE_URL must be an https URL (http only on localhost): ${override}`);
        config.serviceUrl = u.origin + u.pathname.replace(/\/$/, '');
      }
      fs.writeFileSync(path.join(outDir, 'config.json'), JSON.stringify(config, null, 2) + '\n');
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
      if (pwa) writePwa(outDir);
    },
  };
}

const pwaSource = path.join(here, 'public');

/** Every file of the build except the dictionary shards, the worker itself and its source maps: what the worker precaches. */
function shellFiles(outDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = path.relative(outDir, full).split(path.sep).join('/');
      if (e.isDirectory()) { if (rel === 'dict') continue; walk(full); } else if (rel !== 'sw.js' && !rel.endsWith('.map')) out.push(rel);
    }
  };
  walk(outDir);
  return out.sort();
}

/** Review build only: the manifest and icons are copied, sw.js is stamped with a content hash of the shell and the precache list. */
function writePwa(outDir: string): void {
  fs.copyFileSync(path.join(pwaSource, 'manifest.webmanifest'), path.join(outDir, 'manifest.webmanifest'));
  fs.cpSync(path.join(pwaSource, 'icons'), path.join(outDir, 'icons'), { recursive: true });
  // the launch screen's mark (the same PNG the app masks for its top bar), served beside the icons so index.html can show it before any script runs
  fs.copyFileSync(path.join(repoRoot, 'packages', 'shared-brand', 'go-logo.png'), path.join(outDir, 'icons', 'go-logo.png'));
  const files = shellFiles(outDir);
  const hash = crypto.createHash('sha256');
  for (const f of files) { hash.update(f); hash.update(fs.readFileSync(path.join(outDir, f))); }
  const buildId = hash.digest('hex').slice(0, 12);
  const list = ['./', ...files.map((f) => './' + f)];
  const worker = fs.readFileSync(path.join(pwaSource, 'sw.js'), 'utf8')
    .replace('__BUILD_ID__', buildId)
    .replace('__PRECACHE__', JSON.stringify(list, null, 2));
  fs.writeFileSync(path.join(outDir, 'sw.js'), worker);
}

/** The launch screen of the review build: the Go mark over REVIEW, in the page's ink on its paper, from the first paint; the app fades it out (splash.ts). */
const SPLASH_HTML = `<div id="goreview-splash" role="img" aria-label="GoReview">
  <span class="splash-mark" style="-webkit-mask-image: url('./icons/go-logo.png'); mask-image: url('./icons/go-logo.png')"></span>
  <span class="splash-word">REVIEW</span>
</div>`;

/** Review build only: the title, the manifest and iOS tags, the edition marker the app reads, the launch screen, and the worker's registration (inline, runs after load). */
function reviewHtml(): Plugin {
  const register = fs.readFileSync(path.join(pwaSource, 'register.js'), 'utf8');
  return {
    name: 'gopractice-review-html',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const tags = [
          '<meta name="goreview-edition" content="review">',
          '<link rel="manifest" href="./manifest.webmanifest">',
          '<meta name="apple-mobile-web-app-capable" content="yes">',
          '<meta name="mobile-web-app-capable" content="yes">',
          '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
          '<meta name="apple-mobile-web-app-title" content="GoReview">',
          '<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">',
          '<link rel="icon" type="image/png" href="./icons/icon-192.png">',
        ].join('\n');
        return html
          .replace('<title>GoPractice</title>', '<title>GoReview</title>')
          .replace('content="width=device-width, initial-scale=1"', 'content="width=device-width, initial-scale=1, viewport-fit=cover"')
          .replace('</head>', () => `${tags}\n</head>`)
          .replace('<body>', () => `<body>\n${SPLASH_HTML}`)
          .replace('</body>', () => `<script>\n${register}</script>\n</body>`);
      },
    },
  };
}

/** Review web output is the shared embedded-web artifact for web and native wrappers. */
function reviewProvenance(outDir: string): Plugin {
  const compiledModules = new Set<string>();
  const compiledDependencies = new Set<string>();
  return {
    name: 'goreview-release-provenance',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const id of Object.keys(output.modules)) {
          const resolved = normalizeCompiledModuleId(id, repoRoot);
          if (resolved?.sourcePath || resolved?.dependencyPath) {
            compiledModules.add(id);
            if (resolved.dependencyPath) compiledDependencies.add(id);
          }
        }
      }
    },
    closeBundle() {
      createReleaseManifest(outDir, (process.env.GOREVIEW_RELEASE_MODE ?? 'release') as 'release' | 'developer', [...compiledModules], repoRoot, [...compiledDependencies]);
      verifyReleaseArtifact(outDir, { compareCurrentSource: true });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  if (command === 'serve') {
    return { root: here, base: './', publicDir: path.join(repoRoot, 'public'), plugins: [devFonts()], server: { port: 5198, strictPort: true, watch: { ignored: ['**/public/dict/**', '**/public/library/**', '**/data/**'] } } };
  }
  if (mode !== 'production' && mode !== 'extension' && mode !== 'review') throw new Error('mode must be "extension" or "review" (or left out for the web build)');
  const extension = mode === 'extension';
  const review = mode === 'review';
  // GOPRACTICE_OUT builds somewhere else (the tests build into a scratch folder and leave the real dist and dist-review alone)
  const outDir = process.env.GOPRACTICE_OUT ? path.resolve(process.env.GOPRACTICE_OUT)
    : extension ? path.resolve(here, '..', 'golearn-extension', 'dist', 'practice') : path.join(here, review ? 'dist-review' : 'dist');
  return {
    root: here,
    base: './',
    publicDir: false,
    logLevel: 'warn',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [staticFiles(outDir, review), ...(review ? [reviewHtml(), reviewProvenance(outDir)] : [])],
    build: { outDir, emptyOutDir: true, copyPublicDir: false, sourcemap: false, minify: true, target: extension ? 'chrome110' : 'es2022', cssCodeSplit: false, chunkSizeWarningLimit: 2500 },
  };
});
