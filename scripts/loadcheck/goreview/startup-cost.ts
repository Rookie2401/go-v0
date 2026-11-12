/**
 * GoReview start-up cost in Node: how long the top-level evaluation of each module takes, one fresh process per module.
 *
 *   npx vite-node scripts/loadcheck/goreview/startup-cost.ts [--runs 5] [--only main,he,...]
 *
 * Each target is bundled with esbuild (the way the app's build bundles it: one file, no transform cost left in the measurement) into the OS
 * temp folder, then a NEW node process times `await import(bundle)` with performance.now(), so the figure is parse + top-level evaluation of
 * everything the target links in and nothing else. The median of --runs processes is printed (milliseconds). Nothing is written outside the
 * temp folder. A phone is several times slower than the machine that runs this: read the figures as ratios.
 *
 * Targets: every language adapter on its own, the adapter registry, the language-packs barrel, the exercise builders (what `registry` is),
 * and GoReview's own entry (packages/goreview/app/main.ts), which is the real start graph: it is what the browser evaluates before a
 * learner's language is known.
 */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const LANGS = ['sq', 'es', 'de', 'hi', 'th', 'nb', 'nn', 'la', 'he', 'el'];

interface Target { id: string; entry: string; builds: string }
const TARGETS: Target[] = [
  ...LANGS.map((l) => ({ id: `adapter ${l}`, entry: `src/adapters/${l}.ts`, builds: '' })),
  { id: 'adapter registry (src/adapters/index)', entry: 'src/adapters/index.ts', builds: 'all ten adapters' },
  { id: 'language-packs barrel', entry: 'packages/language-packs/src/index.ts', builds: 'manifests, tutorials, builtins (all adapters)' },
  { id: 'exercise builders (goreview/src)', entry: 'packages/goreview/src/index.ts', builds: 'the ten exercise builders and the facts provider' },
  { id: 'GoReview entry (app/main.ts)', entry: 'packages/goreview/app/main.ts', builds: 'the whole start graph' },
];

const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1]! : fallback; };
const RUNS = Number(flag('--runs', '5'));
const ONLY = flag('--only', '').split(',').filter(Boolean);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'goreview-startup-'));
const probe = path.join(temp, 'probe.mjs');
fs.writeFileSync(probe, [
  "import { pathToFileURL } from 'node:url';",
  "const t0 = performance.now();",
  "await import(pathToFileURL(process.argv[2]).href);",
  "console.log((performance.now() - t0).toFixed(1));",
].join('\n'));

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

async function measure(t: Target): Promise<{ ms: number; kb: number }> {
  const out = path.join(temp, t.id.replace(/\W+/g, '_') + '.mjs');
  await build({
    entryPoints: [path.join(ROOT, t.entry)], outfile: out, bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'silent',
    define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' }, loader: { '.png': 'dataurl', '.css': 'empty', '.svg': 'dataurl' },
    plugins: [{ name: 'raw', setup(b) {
      b.onResolve({ filter: /\?raw$/ }, (a) => ({ path: path.resolve(a.resolveDir, a.path.replace(/\?raw$/, '')), namespace: 'raw' }));
      b.onLoad({ filter: /.*/, namespace: 'raw' }, (a) => ({ contents: `export default ${JSON.stringify(fs.readFileSync(a.path, 'utf8'))};`, loader: 'js' }));
    } }],
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const r = spawnSync(process.execPath, [probe, out], { encoding: 'utf8', cwd: temp });
    if (r.status !== 0) throw new Error(`${t.id}: ${r.stderr.split('\n').slice(0, 4).join(' | ')}`);
    times.push(Number(r.stdout.trim()));
  }
  return { ms: median(times), kb: Math.round(fs.statSync(out).size / 1024) };
}

const rows: string[] = [];
for (const t of TARGETS) {
  if (ONLY.length && !ONLY.some((o) => t.id.includes(o) || t.entry.includes(o))) continue;
  try {
    const { ms, kb } = await measure(t);
    rows.push(`${t.id.padEnd(40)} ${ms.toFixed(0).padStart(6)} ms  ${String(kb).padStart(6)} KB  ${t.builds}`);
  } catch (e) { rows.push(`${t.id.padEnd(40)} FAILED ${(e as Error).message.slice(0, 160)}`); }
}

// ── the review build's shape: the same entry with language-packs' builtins swapped for app/leanBuiltins.ts, each adapter its own chunk ──
async function measureLean(): Promise<string[]> {
  const dir = path.join(temp, 'lean');
  await build({
    entryPoints: { main: path.join(ROOT, 'packages/goreview/app/main.ts'), lean: path.join(ROOT, 'packages/goreview/app/leanBuiltins.ts') },
    outdir: dir, outExtension: { '.js': '.mjs' }, bundle: true, splitting: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'silent',
    define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' }, loader: { '.png': 'dataurl', '.css': 'empty', '.svg': 'dataurl' },
    plugins: [{ name: 'lean', setup(b) {
      b.onResolve({ filter: /\?raw$/ }, (a) => ({ path: path.resolve(a.resolveDir, a.path.replace(/\?raw$/, '')), namespace: 'raw' }));
      b.onLoad({ filter: /.*/, namespace: 'raw' }, (a) => ({ contents: `export default ${JSON.stringify(fs.readFileSync(a.path, 'utf8'))};`, loader: 'js' }));
      b.onResolve({ filter: /builtins$/ }, (a) => (path.resolve(a.resolveDir, a.path).replace(/\\/g, '/').endsWith('language-packs/src/builtins') ? { path: path.join(ROOT, 'packages/goreview/app/leanBuiltins.ts') } : undefined));
    } }],
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  const kb = (f: string): number => Math.round(fs.statSync(path.join(dir, f)).size / 1024);
  const startProbe = path.join(temp, 'lean-start.mjs');
  fs.writeFileSync(startProbe, "import { pathToFileURL } from 'node:url'; const t0 = performance.now(); await import(pathToFileURL(process.argv[2]).href); console.log((performance.now() - t0).toFixed(1));");
  const langProbe = path.join(temp, 'lean-lang.mjs');
  fs.writeFileSync(langProbe, "import { pathToFileURL } from 'node:url'; await import(pathToFileURL(process.argv[2] + '/main.mjs').href); const lean = await import(pathToFileURL(process.argv[2] + '/lean.mjs').href); const t0 = performance.now(); await lean.loadBuiltInAdapter(process.argv[3]); console.log((performance.now() - t0).toFixed(1));");
  const run = (file: string, ...a: string[]): number => {
    const times: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const r = spawnSync(process.execPath, [file, ...a], { encoding: 'utf8', cwd: temp });
      if (r.status !== 0) throw new Error(r.stderr.split('\n').slice(0, 4).join(' | '));
      times.push(Number(r.stdout.trim()));
    }
    return median(times);
  };
  const out = [`${'GoReview entry, review build shape'.padEnd(40)} ${run(startProbe, path.join(dir, 'main.mjs')).toFixed(0).padStart(6)} ms  ${String(kb('main.mjs')).padStart(6)} KB  start graph only; no adapter`];
  for (const l of LANGS) out.push(`${('  + language chunk ' + l).padEnd(40)} ${run(langProbe, dir, l).toFixed(0).padStart(6)} ms  (loaded on first use of that language)`);
  return out;
}
if (!ONLY.length || ONLY.includes('lean')) { try { rows.push(...await measureLean()); } catch (e) { rows.push('lean FAILED ' + (e as Error).message.slice(0, 200)); } }
console.log(`module (fresh process, median of ${RUNS})`.padEnd(40) + '     ms      bundle  builds');
console.log(rows.join('\n'));
fs.rmSync(temp, { recursive: true, force: true });
