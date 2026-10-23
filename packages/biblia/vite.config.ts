/**
 * Build of Biblia (packages/biblia/README.md).
 *
 *   vite build -c packages/biblia/vite.config.ts                   -> packages/biblia/dist/   a static site with relative URLs: index.html, assets/*.js,
 *          styles.css, data/ (the texts copied by npm run biblia:import), lexicon/he/biblical-index.json and lexicon/el/koine-index.json (the full
 *          form indexes built by npm run he:build-biblical / el:build-koine; left out, with a warning, when they have not been built).
 *   vite build -c packages/biblia/vite.config.ts --mode extension  -> packages/golearn-extension/dist/biblia/   the same app as a page of the GoLearn
 *          extension, where its lookups and marks reach the on-device Repository. Run it AFTER npm run ext:build (that build empties dist/).
 *   vite -c packages/biblia/vite.config.ts   serves the app for development (port 5199) with the repository's public/lexicon.
 */
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

export default defineConfig(({ mode }) => {
  // BIBLIA_OUT=<folder> puts the build there instead (the GoReview iPhone stage builds Biblia into its web/biblia/)
  const outDir = process.env.BIBLIA_OUT ? path.resolve(repoRoot, process.env.BIBLIA_OUT) : mode === 'extension' ? path.join(repoRoot, 'packages', 'golearn-extension', 'dist', 'biblia') : path.join(here, 'dist');
  return {
    root: here,
    base: './',
    publicDir: path.join(here, 'public'),
    plugins: [devLexicon(), copyIndexes(outDir)],
    build: { outDir, emptyOutDir: true, target: 'es2022', sourcemap: false, rollupOptions: { input: path.join(here, 'index.html') } },
    server: { port: 5199, strictPort: true, host: '127.0.0.1', fs: { allow: [repoRoot] } },
  };
});
