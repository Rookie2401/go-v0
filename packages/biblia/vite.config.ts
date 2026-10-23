/**
 * Build of Biblia (packages/biblia/README.md).
 *
 *   vite build -c packages/biblia/vite.config.ts                   -> packages/biblia/dist/   a static site with relative URLs: index.html, assets/*.js,
 *          styles.css, data/ (the texts copied by npm run biblia:import), lexicon/he/biblical-index.json and lexicon/el/koine-index.json (the full
 *          form indexes built by npm run he:build-biblical / el:build-koine; left out, with a warning, when they have not been built).
 *   vite build -c packages/biblia/vite.config.ts --mode extension  -> packages/golearn-extension/dist/biblia/   the same app as a page of the GoLearn
 *          extension, where its lookups and marks reach the on-device Repository. Run it AFTER npm run ext:build (that build empties dist/).
 *   vite build -c packages/biblia/vite.config.ts --mode standalone -> packages/biblia/dist-standalone/   the installable web app (docs/ecosystem/BIBLIA-STANDALONE.md):
 *          the same static site plus config.json (the Repository address; BIBLIA_SERVICE_URL sets it in the copy), a web manifest, icons, the iOS meta tags,
 *          the edition marker the app reads (<meta name="biblia-edition" content="standalone">), a service worker (sw.js, stamped with a build id and the
 *          shell's precache list) and its registration, inlined into index.html. The texts and lexicon are not precached: the worker keeps each file once read.
 *   BIBLIA_OUT=<folder> puts any of the builds in that folder instead; BIBLIA_SERVICE_URL=https://repo.example.org sets the standalone edition's service address.
 *   vite -c packages/biblia/vite.config.ts   serves the app for development (port 5199) with the repository's public/lexicon.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const INDEXES = [['he', 'biblical-index.json'], ['el', 'koine-index.json']] as const;

/** Development only: serve /lexicon/<lang>/<file> from the repository's public/lexicon. */
function devLexicon(): Plugin {
  return {
    name: 'biblia-lexicon-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/lexicon', (req, res, next) => {
        // <lang>/<file>.json, or the shard folder <lang>/ancient/<prefix>.json[.gz] (the prefix is Greek letters, URL-encoded by the browser)
        const rel = decodeURIComponent((req.url ?? '').split('?')[0].replace(/^\/+/, ''));
        const file = path.join(repoRoot, 'public', 'lexicon', rel);
        if (!/^[a-z]{2}\/([a-z-]+\.json|[a-z]+\/[^/]+\.json(\.gz)?)$/u.test(rel) || !fs.existsSync(file)) return next();
        // a .gz shard is sent as the gzip bytes it is (no Content-Encoding): the loader inflates it itself, as it does in the extension
        res.setHeader('Content-Type', rel.endsWith('.gz') ? 'application/gzip' : 'application/json');
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

/** Build only: copy the full form indexes beside the texts (Vite's publicDir already copies public/data). */
function copyIndexes(outDir: string): Plugin {
  return {
    name: 'biblia-indexes',
    apply: 'build',
    closeBundle() {
      for (const [lang, file] of INDEXES) {
        const from = path.join(repoRoot, 'public', 'lexicon', lang, file);
        if (!fs.existsSync(from)) { console.warn(`[biblia] ${from} is not built (npm run ${lang === 'he' ? 'he:build-biblical' : 'el:build-koine'}); the reader will fall back to the compiled core`); continue; }
        fs.mkdirSync(path.join(outDir, 'lexicon', lang), { recursive: true });
        fs.copyFileSync(from, path.join(outDir, 'lexicon', lang, file));
      }
      // the sharded tables (npm run lexicon:shard): Ancient Greek (130 gzip shards, 12 MB), Modern Greek (53, 6.4 MB), Modern Hebrew (23, 2.7 MB);
      // the Biblical Hebrew index travels whole above, so its shards are not needed here
      for (const set of ['el/ancient', 'el/modern', 'he/modern']) {
        const shards = path.join(repoRoot, 'public', 'lexicon', set);
        if (fs.existsSync(path.join(shards, 'manifest.json'))) fs.cpSync(shards, path.join(outDir, 'lexicon', set), { recursive: true });
        else console.warn(`[biblia] public/lexicon/${set} is not built (npm run lexicon:shard); the Variants tab will show less for that period`);
      }
    },
  };
}

// ---- the standalone (installable) edition -------------------------------------------------------------------------------------------------

const pwaSource = path.join(here, 'public');
/** Files of public/ that belong to the standalone edition only: the other builds drop them from their output. */
const PWA_FILES = ['manifest.webmanifest', 'sw.js', 'register.js', 'icons'];

/**
 * BIBLIA_SERVICE_URL (https, or http on localhost / 127.0.0.1; no query, fragment or credentials) replaces config.json's serviceUrl in the
 * copy. A trailing slash is dropped. Anything else throws, so a typo cannot ship. Unset or empty: the source config.json's address.
 */
function resolveServiceUrl(override: string | undefined, fallback: string): string {
  if (!override) return fallback;
  let u: URL;
  try { u = new URL(override); } catch { throw new Error(`BIBLIA_SERVICE_URL is not a URL: ${override}`); }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (!(u.protocol === 'https:' || (u.protocol === 'http:' && local)) || u.search || u.hash || u.username || u.password) {
    throw new Error(`BIBLIA_SERVICE_URL must be an https URL (http only on localhost), with no query, fragment or credentials: ${override}`);
  }
  return u.origin + u.pathname.replace(/\/$/, '');
}

/** Every file under the given top-level folders of the build (relative, forward slashes, sorted). */
function filesUnder(outDir: string, only: (rel: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = path.relative(outDir, full).split(path.sep).join('/');
      if (e.isDirectory()) walk(full); else if (only(rel)) out.push(rel);
    }
  };
  if (fs.existsSync(outDir)) walk(outDir);
  return out.sort();
}

const isData = (rel: string): boolean => rel.startsWith('data/') || rel.startsWith('lexicon/');
/** What the worker precaches: every file of the build except the texts and lexicon, the worker itself, the registration source and source maps. */
const shellFiles = (outDir: string): string[] => filesUnder(outDir, (rel) => !isData(rel) && rel !== 'sw.js' && rel !== 'register.js' && !rel.endsWith('.map'));

function hashFiles(outDir: string, files: string[]): string {
  const hash = crypto.createHash('sha256');
  for (const f of files) { hash.update(f); hash.update('\0'); hash.update(fs.readFileSync(path.join(outDir, f))); }
  return hash.digest('hex').slice(0, 12);
}

/** Standalone build only: config.json (with the service address), the manifest and icons, and sw.js stamped with the shell's build id, the data id and the precache list. */
function writeStandalone(outDir: string): void {
  const config = JSON.parse(fs.readFileSync(path.join(here, 'config.json'), 'utf8')) as { serviceUrl: string; assetBaseUrl: string };
  const serviceUrl = resolveServiceUrl(process.env.BIBLIA_SERVICE_URL, config.serviceUrl);
  if (!process.env.BIBLIA_SERVICE_URL) console.warn(`[biblia] BIBLIA_SERVICE_URL is not set: config.json keeps ${config.serviceUrl}, an address only this computer can reach (set it to the https address of the Repository service to publish)`);
  fs.writeFileSync(path.join(outDir, 'config.json'), JSON.stringify({ ...config, serviceUrl }, null, 2) + '\n');
  fs.copyFileSync(path.join(pwaSource, 'manifest.webmanifest'), path.join(outDir, 'manifest.webmanifest'));
  fs.cpSync(path.join(pwaSource, 'icons'), path.join(outDir, 'icons'), { recursive: true });
  const shell = shellFiles(outDir);
  const buildId = hashFiles(outDir, shell);
  const dataId = hashFiles(outDir, filesUnder(outDir, isData));
  const list = ['./', ...shell.map((f) => './' + f)];
  const worker = fs.readFileSync(path.join(pwaSource, 'sw.js'), 'utf8')
    .split('__BUILD_ID__').join(buildId)
    .split('__DATA_ID__').join(dataId)
    .split('__PRECACHE__').join(JSON.stringify(list, null, 2));
  fs.writeFileSync(path.join(outDir, 'sw.js'), worker);
  // register.js is inlined into index.html; the copy Vite made from public/ is not needed
  fs.rmSync(path.join(outDir, 'register.js'), { force: true });
}

/** Runs after copyIndexes (plugin order), so the lexicon files are already in the output when the data id is computed. */
function standaloneFiles(outDir: string): Plugin {
  return { name: 'biblia-standalone-files', apply: 'build', closeBundle() { writeStandalone(outDir); } };
}

/** The default and extension builds: public/ also holds the standalone edition's files (manifest, worker, icons); they stay out of those outputs. */
function withoutStandaloneFiles(outDir: string): Plugin {
  return { name: 'biblia-no-standalone-files', apply: 'build', closeBundle() { for (const f of PWA_FILES) fs.rmSync(path.join(outDir, f), { recursive: true, force: true }); } };
}

/** Standalone build only: the edition marker the app reads, the manifest and iOS tags, and the worker's registration (inline, runs after load). */
function standaloneHtml(): Plugin {
  const register = fs.readFileSync(path.join(pwaSource, 'register.js'), 'utf8');
  return {
    name: 'biblia-standalone-html',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const tags = [
          '<meta name="biblia-edition" content="standalone">',
          '<link rel="manifest" href="./manifest.webmanifest">',
          '<meta name="apple-mobile-web-app-capable" content="yes">',
          '<meta name="mobile-web-app-capable" content="yes">',
          '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
          '<meta name="apple-mobile-web-app-title" content="Biblia">',
          '<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">',
          '<link rel="icon" type="image/svg+xml" href="./icons/icon.svg">',
        ].join('\n');
        // viewport-fit=cover is already in index.html; add it if a later edit drops it
        const withViewport = /<meta name="viewport"[^>]*viewport-fit=cover/.test(html)
          ? html
          : html.replace(/(<meta name="viewport" content=")([^"]*)(")/, (_m, a: string, b: string, c: string) => `${a}${b}, viewport-fit=cover${c}`);
        return withViewport
          .replace('</head>', () => `${tags}\n</head>`)
          .replace('</body>', () => `<script>\n${register}</script>\n</body>`);
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const standalone = mode === 'standalone';
  // BIBLIA_OUT=<folder> puts the build there instead (the GoReview iPhone stage builds Biblia into its web/biblia/)
  const outDir = process.env.BIBLIA_OUT ? path.resolve(repoRoot, process.env.BIBLIA_OUT)
    : mode === 'extension' ? path.join(repoRoot, 'packages', 'golearn-extension', 'dist', 'biblia')
    : path.join(here, standalone ? 'dist-standalone' : 'dist');
  // a bad BIBLIA_SERVICE_URL stops the build before anything is bundled
  if (standalone) resolveServiceUrl(process.env.BIBLIA_SERVICE_URL, '');
  return {
    root: here,
    base: './',
    publicDir: path.join(here, 'public'),
    plugins: [devLexicon(), copyIndexes(outDir), ...(standalone ? [standaloneFiles(outDir), standaloneHtml()] : [withoutStandaloneFiles(outDir)])],
    build: { outDir, emptyOutDir: true, target: 'es2022', sourcemap: false, rollupOptions: { input: path.join(here, 'index.html') } },
    server: { port: 5199, strictPort: true, host: '127.0.0.1', fs: { allow: [repoRoot] } },
  };
});
