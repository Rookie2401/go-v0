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
        if (fs.existsSync(from)) fs.cpSync(from, path.join(outDir, 'dict', lang), { recursive: true });
      }
    },
  };
}

export default defineConfig(({ command }) => {
  if (command === 'serve') {
    return { root: here, base: './', publicDir: path.join(repoRoot, 'public'), server: { port: 5198, strictPort: true, watch: { ignored: ['**/public/dict/**', '**/public/library/**', '**/data/**'] } } };
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
