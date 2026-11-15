/**
 * Compiles a TypeScript entry (the Repository service, or an ops script) into one plain JavaScript file that Node runs with no Vite in the process.
 *
 * Why: under vite-node the service held about 360 MB before its first request (a Vite dev server, its module graph and the transformed sources), on a
 * 512 MB instance; ordinary requests on top of that ran it out of memory several times a day (2026-11-12). The same code run from this bundle holds a
 * fraction of that.
 *
 * Files that read something beside their own source (`new URL('./x.json', import.meta.url)`: migrations, the source policy) keep reading it there: in
 * each source file, `import.meta.url` is replaced by that source file's own address, worked out from where the bundle sits. So the bundle must stay
 * inside the checkout it was built from, at a real path (Node resolves links for the entry file, so not under a linked node_modules): it is written to
 * infra/repository/.build, which ignores itself in git. Nothing has to be copied next to it.
 *
 * Packages (pg, …) stay outside the bundle and load from node_modules as before.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const OWN_URL = /\bimport\.meta\.url\b/g;

/** The esbuild plugin: each TypeScript source's `import.meta.url` becomes that source's own file URL, resolved from the bundle's location at run time. */
export function sourceUrlPlugin(outfile) {
  const outDir = dirname(resolve(outfile));
  return {
    name: 'source-import-meta-url',
    setup(build) {
      build.onLoad({ filter: /\.m?ts$/ }, async (args) => {
        const text = await readFile(args.path, 'utf8');
        if (!OWN_URL.test(text)) return undefined;
        OWN_URL.lastIndex = 0;
        const fromBundle = relative(outDir, args.path).split(sep).join('/');
        const own = `new URL(${JSON.stringify(fromBundle)}, import.meta.url).href`;
        return { contents: text.replace(OWN_URL, own), loader: 'ts' };
      });
    },
  };
}

/**
 * Bundles `entry` into `outfile` (ESM, Node 24). Resolves when written; throws with esbuild's message when the sources do not compile.
 * `banner` makes `require` available to the CommonJS packages that esbuild leaves in the bundle.
 */
export async function bundle({ entry, outfile, root = process.cwd() }) {
  const esbuild = await import('esbuild');
  const dir = dirname(resolve(root, outfile));
  mkdirSync(dir, { recursive: true });
  if (!existsSync(resolve(dir, '.gitignore'))) writeFileSync(resolve(dir, '.gitignore'), '*\n');
  try {
    await esbuild.build({
      entryPoints: [resolve(root, entry)],
      outfile: resolve(root, outfile),
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node24',
      packages: 'external',
      sourcemap: 'linked',
      logLevel: 'silent',
      banner: { js: "import { createRequire as __goCreateRequire } from 'node:module'; const require = __goCreateRequire(import.meta.url);" },
      plugins: [sourceUrlPlugin(resolve(root, outfile))],
    });
  } finally {
    await esbuild.stop?.(); // otherwise esbuild keeps a helper process alive, beside the service, for the life of the starter
  }
  return resolve(root, outfile);
}

/** Where the service bundle is written. Never committed (the folder ignores itself); render-start.mjs rebuilds it at every start, so it is never stale. */
export const SERVICE_BUNDLE = 'infra/repository/.build/service.mjs';
export const SERVICE_ENTRY = 'packages/repository-service/src/main.ts';

/** `node infra/repository/bundle.mjs <entry> <outfile>`: render-start.mjs compiles in a child process, so esbuild never stays in the starter's memory. */
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [entry, outfile] = process.argv.slice(2);
  bundle({ entry: entry ?? SERVICE_ENTRY, outfile: outfile ?? SERVICE_BUNDLE }).then(
    (file) => { console.log(file); },
    (error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; },
  );
}
