/**
 * Build of the GoLearn extension into packages/golearn-extension/dist/. Three self-contained classic scripts (a
 * content script injected with chrome.scripting cannot import modules, so nothing is split into shared chunks) and the
 * language analysers, one ES module each:
 *
 *   vite build -c packages/golearn-extension/vite.config.ts --mode content      -> dist/content.js (+ manifest.json, action/popup.html)
 *   vite build -c packages/golearn-extension/vite.config.ts --mode background   -> dist/background.js
 *   vite build -c packages/golearn-extension/vite.config.ts --mode action       -> dist/action/popup.js
 *   vite build -c packages/golearn-extension/vite.config.ts --mode analysers    -> dist/analysers/{sq,es,de,hi,th}.js (+ shared chunks)
 *
 * `npm run ext:build` runs the four in order. Albanian (the reference language) is bundled into content.js and
 * background.js; the other analysers are separate chunks that the content script imports on demand (the manifest lists
 * `analysers/*.js` under `web_accessible_resources`). The worker cannot `import()` at all, so it never carries them: see
 * `leanBuiltins` below. The sizes are asserted by test/extension/bundle.test.ts.
 *
 * The setup / options page (`app/`, declared as `options_page: app/index.html` in the manifest) has its own build,
 * `app/vite.config.ts`, which writes to `dist/app/`. This config never builds it, and the first (content) build keeps
 * `dist/app/` in place when it clears `dist/`; run the app's build after `ext:build` for a loadable extension.
 *
 * The background worker must not carry the service's in-process request handler (the API client module imports it for
 * `createInProcessApi`, which the extension never uses): it is replaced by an empty stub at build time.
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

/** The analysers: one entry per language (`src/analysers/<id>.ts` exports the adapter as `adapter`). */
const ANALYSER_IDS = ['sq', 'es', 'de', 'hi', 'th'] as const;

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
      const notices = path.join(here, '..', '..', 'THIRD-PARTY-NOTICES.md');
      if (fs.existsSync(notices)) fs.copyFileSync(notices, path.join(dist, 'THIRD-PARTY-NOTICES.md'));
    },
  };
}

/** Empty `dist/` except `dist/app/` (built by the setup page's own config). */
function cleanDistKeepingApp(): Plugin {
  return {
    name: 'golearn-clean-dist',
    apply: 'build',
    buildStart() {
      const dist = path.join(here, 'dist');
      if (!fs.existsSync(dist)) return;
      for (const name of fs.readdirSync(dist)) if (name !== 'app') fs.rmSync(path.join(dist, name), { recursive: true, force: true });
    },
  };
}

/** Empty `dist/analysers/` before the analysers are written (the other modes leave it alone). */
function cleanAnalysers(): Plugin {
  return {
    name: 'golearn-clean-analysers',
    apply: 'build',
    buildStart() { fs.rmSync(path.join(here, 'dist', 'analysers'), { recursive: true, force: true }); },
  };
}

/** The API client module imports the service's request handler only for `createInProcessApi`; the extension talks over `fetch`. */
function stubServiceHandler(): Plugin {
  return {
    name: 'golearn-stub-service-handler',
    enforce: 'pre',
    resolveId(source, importer) {
      if (importer && /repository-service[\\/]src[\\/]api\.ts$/.test(importer) && source === './handler') return '\0golearn-stub-handler';
      return null;
    },
    load(id) {
      return id === '\0golearn-stub-handler' ? 'export const handle = () => { throw new Error("the in-process service is not part of the extension"); };' : null;
    },
  };
}

/**
 * The pack runtime (`language-packs/src/runtime.ts`) takes its analysers from `./builtins`, which links in all five adapters.
 * In the extension's scripts that module is swapped for `src/analysers/builtins.ts`: Albanian linked in, every other language
 * read from the parser's analyser registry. Without the swap the background worker (which has no `import()`) would carry
 * German, Hindi and Thai for no reason.
 */
export function leanBuiltins(): Plugin {
  const lean = path.join(here, 'src/analysers/builtins.ts');
  return {
    name: 'golearn-lean-builtins',
    enforce: 'pre',
    resolveId(source, importer) {
      if (importer && /language-packs[\\/]src[\\/]runtime\.ts$/.test(importer) && source === './builtins') return lean;
      return null;
    },
  };
}

export default defineConfig(({ mode }) => {
  if (mode === 'analysers') {
    return {
      root: here,
      base: './',
      publicDir: false,
      logLevel: 'warn',
      define: { 'process.env.NODE_ENV': '"production"' },
      plugins: [cleanAnalysers()],
      build: {
        outDir: path.join(here, 'dist'),
        emptyOutDir: false,
        copyPublicDir: false,
        sourcemap: false,
        minify: true,
        target: 'chrome110',
        rollupOptions: {
          input: Object.fromEntries(ANALYSER_IDS.map((id) => [id, path.join(here, 'src/analysers', `${id}.ts`)])),
          preserveEntrySignatures: 'exports-only',
          output: { format: 'es', entryFileNames: 'analysers/[name].js', chunkFileNames: 'analysers/shared-[hash].js' },
        },
      },
    };
  }
  const entry = ENTRIES[mode as keyof typeof ENTRIES];
  if (!entry) throw new Error(`mode must be one of: ${[...Object.keys(ENTRIES), 'analysers'].join(', ')}`);
  return {
    root: here,
    base: './',
    publicDir: false,
    logLevel: 'warn',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [stubServiceHandler(), leanBuiltins(), ...(mode === 'content' ? [cleanDistKeepingApp(), copyStatic()] : [])],
    build: {
      outDir: path.join(here, 'dist'),
      emptyOutDir: false,
      copyPublicDir: false,
      modulePreload: false,
      sourcemap: false,
      minify: true,
      target: 'chrome110',
      rollupOptions: {
        input: { [mode]: entry.input },
        // the content script imports analyser chunks with a dynamic import; Vite wraps that in a preload helper that mentions import.meta, which an IIFE
        // cannot have. Rolldown replaces it with {} (the helper only reads it when a chunk has CSS dependencies, and an analyser has none): say nothing about it.
        onwarn(warning, defaultHandler) { if (warning.code === 'EMPTY_IMPORT_META') return; defaultHandler(warning); },
        output: { format: 'iife', name: entry.name, entryFileNames: entry.file },
      },
    },
  };
});
