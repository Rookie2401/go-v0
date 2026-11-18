/**
 * Build of the GoReview application.
 *
 *   vite build -c packages/goreview/app/vite.config.ts
 *       -> packages/goreview/app/dist/   a static site with relative URLs (base './'), any host or sub-path:
 *          index.html, assets/*.js, styles.css, config.json, and dict/<lang>/ for the languages in GOREVIEW_DICT
 *          (default "sq,es,de,hi,th,la,he,nb,nn", the packs declaring dictionaries: Hebrew, Bokmål and Nynorsk since 2026-11-13; set it empty when using a shared dictionary tree). Review exercises read
 *          glosses from there, lazily, shard by shard.
 *   vite build -c packages/goreview/app/vite.config.ts --mode extension
 *       -> packages/golearn-extension/dist/review/   the same app as a page of the GoLearn extension (chrome-extension://<id>/review/index.html).
 *          Relative asset paths, the same config.json, dictionaries and fonts as the web build. Served from the extension, GoReview works on the
 *          device with no account (src/localBinding.ts reaches the extension's on-device Repository); the extension's popup and setup page link to it.
 *          Run it AFTER `npm run ext:build`: that build empties dist/ (keeping only dist/app/), so dist/review/ has to be rebuilt after it.
 *   vite build -c packages/goreview/app/vite.config.ts --mode review
 *       -> packages/goreview/app/dist-review/   GoReview, the installable iPhone edition: the same static site plus a web manifest, icons, iOS meta tags,
 *          a service worker (sw.js, stamped with a build id and the precache list) and its registration, inlined into index.html. Starts at #/review.
 *   The review and web builds load each language's analyser as its own chunk (assets/lang-<id>-<hash>.js, see leanBuiltins.ts) on first use; the
 *   service worker does not precache them but keeps the ones that were used. The extension build keeps every analyser in the main script.
 *   GOREVIEW_OUT=<folder> puts any of the three builds in that folder instead; GOREVIEW_DICT=sq,hi limits the dictionaries shipped.
 *   vite -c packages/goreview/app/vite.config.ts   serves the app for development with the repository's public/.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { createReleaseManifest, normalizeCompiledModuleId, verifyReleaseArtifact } from '../../../scripts/goreview-release.mjs';
import { gzipHebrewFormFrequency } from './hebrewFrequencyAssets.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

const dictLanguages = (): string[] => (process.env.GOREVIEW_DICT ?? 'sq,es,de,hi,th,la,he,nb,nn').split(',').map((s) => s.trim()).filter(Boolean);

const fontsSource = path.join(repoRoot, 'packages', 'shared-fonts');

/** The EB Garamond files (SIL OFL 1.1) and their licence text: copied into the build beside the stylesheet's fonts/ folder, and served in development. */
function copyFonts(fontsOut: string, licenceOut: string): void {
  if (!fs.existsSync(fontsSource)) return;
  fs.mkdirSync(fontsOut, { recursive: true });
  for (const f of fs.readdirSync(fontsSource)) if (f.endsWith('.woff2')) fs.copyFileSync(path.join(fontsSource, f), path.join(fontsOut, f));
  const licence = path.join(fontsSource, 'EB-Garamond-OFL.txt');
  if (fs.existsSync(licence)) { fs.copyFileSync(licence, path.join(fontsOut, 'EB-Garamond-OFL.txt')); fs.copyFileSync(licence, licenceOut); }
}

/** Hebrew's Bible and modern tables are loaded by the runtime's sharded lexicon reader. */
function copyHebrewLexicons(outDir: string): void {
  for (const period of ['biblical', 'modern']) {
    const source = path.join(repoRoot, 'public', 'lexicon', 'he', period);
    const manifestPath = path.join(source, 'manifest.json');
    if (!fs.existsSync(manifestPath)) throw new Error(`The Hebrew ${period} lexicon is missing its manifest; refusing an incomplete build.`);
    let manifest: { shards?: Record<string, { file?: string }> };
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
    catch { throw new Error(`The Hebrew ${period} lexicon manifest is invalid JSON; refusing an incomplete build.`); }
    if (!manifest.shards || typeof manifest.shards !== 'object' || !Object.keys(manifest.shards).length) throw new Error(`The Hebrew ${period} lexicon manifest has no shards; refusing an incomplete build.`);
    const target = path.join(outDir, 'lexicon', 'he', period);
    fs.mkdirSync(target, { recursive: true });
    for (const shard of Object.values(manifest.shards)) {
      const name = shard?.file;
      if (typeof name !== 'string' || path.basename(name) !== name || !name.endsWith('.json.gz')) throw new Error(`The Hebrew ${period} lexicon manifest contains an invalid shard path; refusing an incomplete build.`);
      const from = path.join(source, name);
      if (!fs.existsSync(from) || !fs.statSync(from).isFile()) throw new Error(`The Hebrew ${period} lexicon shard ${name} is missing; refusing an incomplete build.`);
      const bytes = fs.readFileSync(from);
      if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error(`The Hebrew ${period} lexicon shard ${name} is not a valid gzip file; refusing an incomplete build.`);
      fs.copyFileSync(from, path.join(target, name));
    }
    fs.copyFileSync(manifestPath, path.join(target, 'manifest.json'));
  }
  const indexPath = path.join(repoRoot, 'public', 'lexicon', 'he', 'biblical-index.json');
  if (!fs.existsSync(indexPath) || !fs.statSync(indexPath).isFile()) throw new Error('The Hebrew biblical frequency source index is missing; refusing an incomplete build.');
  let frequency: Buffer;
  try { frequency = gzipHebrewFormFrequency(JSON.parse(fs.readFileSync(indexPath, 'utf8'))); }
  catch (error) { throw new Error(`The Hebrew biblical frequency source index is invalid; refusing an incomplete build. ${error instanceof Error ? error.message : String(error)}`); }
  const frequencyPath = path.join(outDir, 'lexicon', 'he', 'biblical', 'form-frequency.json.gz');
  fs.writeFileSync(frequencyPath, frequency);
}

/** Greek's ancient and modern indexes are fetched from their provenance-bearing manifests, then loaded shard by shard. */
function copyGreekLexicons(outDir: string): void {
  for (const period of ['ancient', 'modern']) {
    const source = path.join(repoRoot, 'public', 'lexicon', 'el', period);
    const manifestPath = path.join(source, 'manifest.json');
    if (!fs.existsSync(manifestPath)) throw new Error(`The Greek ${period} lexicon is missing its manifest; refusing an incomplete build.`);
    let manifest: { shards?: Record<string, { file?: string }> };
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
    catch { throw new Error(`The Greek ${period} lexicon manifest is invalid JSON; refusing an incomplete build.`); }
    if (!manifest.shards || typeof manifest.shards !== 'object' || !Object.keys(manifest.shards).length) throw new Error(`The Greek ${period} lexicon manifest has no shards; refusing an incomplete build.`);
    const target = path.join(outDir, 'lexicon', 'el', period);
    fs.mkdirSync(target, { recursive: true });
    for (const shard of Object.values(manifest.shards)) {
      const name = shard?.file;
      if (typeof name !== 'string' || path.basename(name) !== name || !name.endsWith('.json.gz')) throw new Error(`The Greek ${period} lexicon manifest contains an invalid shard path; refusing an incomplete build.`);
      const from = path.join(source, name);
      if (!fs.existsSync(from) || !fs.statSync(from).isFile()) throw new Error(`The Greek ${period} lexicon shard ${name} is missing; refusing an incomplete build.`);
      const bytes = fs.readFileSync(from);
      if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error(`The Greek ${period} lexicon shard ${name} is not a valid gzip file; refusing an incomplete build.`);
      fs.copyFileSync(from, path.join(target, name));
    }
    fs.copyFileSync(manifestPath, path.join(target, 'manifest.json'));
  }
  const indexPath = path.join(repoRoot, 'public', 'lexicon', 'el', 'koine-index.json');
  if (!fs.existsSync(indexPath) || !fs.statSync(indexPath).isFile()) throw new Error('The MorphGNT Koine index is missing; refusing an incomplete build.');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as { schema?: number; id?: string; period?: string; source?: { label?: string; licence?: string; url?: string } };
  if (index.schema !== 1 || index.id !== 'morphgnt-sblgnt' || index.period !== 'el-koi' || !index.source?.label || !index.source?.licence || !index.source?.url) throw new Error('The MorphGNT Koine index is missing valid provenance; refusing an incomplete build.');
  const target = path.join(outDir, 'lexicon', 'el', 'koine-index.json.gz');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, gzipSync(fs.readFileSync(indexPath), { level: 9 }));
}

/**
 * The web and review builds swap packages/language-packs/src/builtins.ts (every adapter linked in) for ./leanBuiltins.ts (each adapter its own
 * chunk, loaded on first use), the way the extension's builds swap it for theirs. Any import that resolves to that module is swapped.
 */
function leanBuiltins(): Plugin {
  const full = path.join(repoRoot, 'packages', 'language-packs', 'src', 'builtins.ts');
  const lean = path.join(here, 'leanBuiltins.ts');
  return {
    name: 'goreview-lean-builtins',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !source.startsWith('.')) return null;
      const target = path.resolve(path.dirname(importer.split('?')[0]), source);
      return target === full || target === full.replace(/\.ts$/, '') ? lean : null;
    },
  };
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

/** Development only: generate the licensed Hebrew frequency sidecar from its source index on request. */
function devHebrewFrequency(): Plugin {
  return {
    name: 'hebrew-frequency-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/lexicon/he/biblical/form-frequency.json.gz', (_req, res) => {
        try {
          const indexPath = path.join(repoRoot, 'public', 'lexicon', 'he', 'biblical-index.json');
          const bytes = gzipHebrewFormFrequency(JSON.parse(fs.readFileSync(indexPath, 'utf8')));
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/gzip');
          res.setHeader('Cache-Control', 'no-store');
          res.end(bytes);
        } catch (error) {
          res.statusCode = 500;
          res.end(`Unable to build Hebrew frequency asset: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    },
  };
}

/** Development only: serve the licensed Koine index in the same compressed form used by releases. */
function devGreekKoine(): Plugin {
  return {
    name: 'greek-koine-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/lexicon/el/koine-index.json.gz', (_req, res) => {
        try {
          const indexPath = path.join(repoRoot, 'public', 'lexicon', 'el', 'koine-index.json');
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/gzip');
          res.setHeader('Cache-Control', 'no-store');
          res.end(gzipSync(fs.readFileSync(indexPath), { level: 9 }));
        } catch (error) {
          res.statusCode = 500;
          res.end(`Unable to prepare the Koine Greek index: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    },
  };
}

/** Files Vite does not process: config.json and the dictionaries. */
function staticFiles(outDir: string, pwa = false): Plugin {
  return {
    name: 'goreview-app-static',
    apply: 'build',
    closeBundle() {
      fs.mkdirSync(outDir, { recursive: true });
      // GOREVIEW_SERVICE_URL (https, or http on localhost) replaces config.json's serviceUrl in the copy: the installable review
      // edition is built against the public Repository address (e.g. https://repo.golearn-global-languages.com), the source file
      // keeps the local development address. Anything else is refused so a typo cannot ship.
      const config = JSON.parse(fs.readFileSync(path.join(here, 'config.json'), 'utf8')) as { serviceUrl: string; assetBaseUrl?: string };
      const override = process.env.GOREVIEW_SERVICE_URL;
      if (override) {
        const u = new URL(override);
        const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
        if (!(u.protocol === 'https:' || (u.protocol === 'http:' && local)) || u.search || u.hash || u.username) throw new Error(`GOREVIEW_SERVICE_URL must be an https URL (http only on localhost): ${override}`);
        config.serviceUrl = u.origin + u.pathname.replace(/\/$/, '');
      }
      // Hosted editions can share the complete dictionary tree beside /review/;
      // native/extension builds keep './' and bundle their selected dictionaries.
      const assetBase = process.env.GOREVIEW_ASSET_BASE;
      if (assetBase) {
        const u = new URL(assetBase, 'https://asset-base.invalid/review/');
        if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || assetBase.startsWith('//')) throw new Error('GOREVIEW_ASSET_BASE must be a relative path or an https URL without credentials, query or fragment.');
        config.assetBaseUrl = assetBase;
      }
      fs.writeFileSync(path.join(outDir, 'config.json'), JSON.stringify(config, null, 2) + '\n');
      for (const lang of dictLanguages()) {
        const from = path.join(repoRoot, 'public', 'dict', lang);
        // the frequency sidecar was counted from the retired library and is quarantined (RIGHTS-AND-PRIVACY-BOUNDARIES §2): never shipped
        if (!fs.existsSync(path.join(from, 'manifest.json'))) throw new Error(`The selected ${lang} dictionary is missing its manifest; refusing an incomplete build.`);
        fs.cpSync(from, path.join(outDir, 'dict', lang), { recursive: true, filter: (src) => path.basename(src) !== 'frequency.json' });
        const shipped = path.join(outDir, 'dict', lang, 'manifest.json');
        // the shipped manifest must not promise the sidecar that was left out
        if (fs.existsSync(shipped)) fs.writeFileSync(shipped, JSON.stringify({ ...JSON.parse(fs.readFileSync(shipped, 'utf8')), hasFrequency: false }, null, 2));
      }
      copyHebrewLexicons(outDir);
      copyGreekLexicons(outDir);
      const notices = path.join(repoRoot, 'THIRD-PARTY-NOTICES.md');
      if (fs.existsSync(notices)) fs.copyFileSync(notices, path.join(outDir, 'THIRD-PARTY-NOTICES.md'));
      // the stylesheet is bundled into assets/, so its ./fonts/ URLs resolve to assets/fonts/
      copyFonts(path.join(outDir, 'assets', 'fonts'), path.join(outDir, 'EB-Garamond-OFL.txt'));
      if (pwa) writePwa(outDir);
    },
  };
}

const pwaSource = path.join(here, 'public');

/** A language's analyser chunk (leanBuiltins.ts): fetched when the language is first used and kept by the worker, never precached. */
const LANG_CHUNK = /^assets\/lang-[a-z]+-[^/]+\.js$/;

/** Every file of the build except the on-demand dictionary and lexicon shards and language chunks, the worker itself and its source maps: what the worker precaches. */
function shellFiles(outDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = path.relative(outDir, full).split(path.sep).join('/');
      if (e.isDirectory()) { if (rel === 'dict' || rel === 'lexicon') continue; walk(full); } else if (rel !== 'sw.js' && !rel.endsWith('.map') && !LANG_CHUNK.test(rel)) out.push(rel);
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
  // each language's analyser chunks by language (assets/lang-<id>-<hash>.js): a new build fetches, at install, the ones the build before it had kept
  const langChunks: Record<string, string[]> = {};
  const assetsDir = path.join(outDir, 'assets');
  for (const name of fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir).sort() : []) {
    const m = /^lang-([a-z]+)-[^/]+\.js$/.exec(name);
    if (m) (langChunks[m[1]!] ??= []).push(`./assets/${name}`);
  }
  // where the dictionary is read from (config.json, written just before): the worker keeps its dict/ files also when that folder is outside its scope
  const assetBase = (JSON.parse(fs.readFileSync(path.join(outDir, 'config.json'), 'utf8')) as { assetBaseUrl?: string }).assetBaseUrl ?? './';
  if (/['\\\n]/.test(assetBase)) throw new Error('The asset base cannot be written into the service worker.');
  const worker = fs.readFileSync(path.join(pwaSource, 'sw.js'), 'utf8')
    .replace("'__BUILD_ID__'", `'${buildId}'`)
    .replace('__PRECACHE__;', JSON.stringify(list, null, 2) + ';')
    .replace("'__ASSET_BASE__'", `'${assetBase}'`)
    .replace('__LANG_CHUNKS__;', JSON.stringify(langChunks, null, 2) + ';');
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
          .replace('<title>GoReview</title>', '<title>GoReview</title>')
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

/**
 * A language's analyser chunk is named lang-<language>-<hash>.js: a dynamic entry that is src/adapters/<id>.ts, or a chunk made only of
 * modules under src/adapters/<dir>/ (what two adapters share, Norwegian's engine for nb and nn), so the service worker can tell it from
 * the shell's own files (never precached, kept once used). Everything else keeps Vite's default name.
 */
function languageChunkName(chunk: { isDynamicEntry?: boolean; facadeModuleId?: string | null; moduleIds?: string[] }): string {
  const slash = (id: string): string => id.replace(/\\/g, '/');
  const entry = chunk.isDynamicEntry && chunk.facadeModuleId ? /\/src\/adapters\/([a-z]{2})\.ts$/.exec(slash(chunk.facadeModuleId))?.[1] : undefined;
  if (entry) return `assets/lang-${entry}-[hash].js`;
  const ids = (chunk.moduleIds ?? []).map(slash);
  const dirs = new Set(ids.map((id) => /\/src\/adapters\/([a-z]+)\//.exec(id)?.[1]).filter((d): d is string => !!d && d !== 'shared'));
  if (dirs.size === 1 && ids.length && ids.every((id) => /\/src\/(adapters|core)\//.test(id))) return `assets/lang-${[...dirs][0]}-[hash].js`;
  return 'assets/[name]-[hash].js';
}

export default defineConfig(({ command, mode }) => {
  if (command === 'serve') {
    return { root: here, base: './', publicDir: path.join(repoRoot, 'public'), plugins: [devFonts(), devHebrewFrequency(), devGreekKoine()], server: { port: 5198, strictPort: true, watch: { ignored: ['**/public/dict/**', '**/public/library/**', '**/data/**'] } } };
  }
  if (mode !== 'production' && mode !== 'extension' && mode !== 'review') throw new Error('mode must be "extension" or "review" (or left out for the web build)');
  const extension = mode === 'extension';
  const review = mode === 'review';
  // GOREVIEW_OUT builds somewhere else (the tests build into a scratch folder and leave the real dist and dist-review alone)
  const outDir = process.env.GOREVIEW_OUT ? path.resolve(process.env.GOREVIEW_OUT)
    : extension ? path.resolve(here, '..', '..', 'golearn-extension', 'dist', 'review') : path.join(here, review ? 'dist-review' : 'dist');
  return {
    root: here,
    base: './',
    publicDir: false,
    logLevel: 'warn',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [...(extension ? [] : [leanBuiltins()]), staticFiles(outDir, review), ...(review ? [reviewHtml(), reviewProvenance(outDir)] : [])],
    build: {
      outDir, emptyOutDir: true, copyPublicDir: false, sourcemap: false, minify: true, target: extension ? 'chrome110' : 'es2022', cssCodeSplit: false, chunkSizeWarningLimit: 2500,
      // a language's analyser (leanBuiltins.ts) is named by its language, so the service worker can tell it from the shell's own files
      rollupOptions: { output: { chunkFileNames: languageChunkName } },
    },
  };
});
