import fs from 'node:fs';
import path from 'node:path';
import { runNode } from '../helpers/cli';
import { afterAll, describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../src/core';
import { buildLibraryFiles } from '../../src/library/build-node';
import { LibraryBuildError } from '../../src/library/build';
import { parseManifest } from '../../src/library/format';
import { createLibrary } from '../../src/library';
import { clock, registry, tmpDir } from './helpers';
import { cleanInspect, fixtureManifest, writeTree } from './fixtures';

const cli = path.resolve('node_modules/vite-node/dist/cli.mjs');
const run = async (...args: string[]) => {
  const r = await runNode([cli, 'scripts/library-build.mts', ...args], { cwd: path.resolve('.'), timeout: 120_000 });
  return { status: r.status, out: r.out };
};
const listFiles = (dir: string): string[] => fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join('/')).sort();

const root = tmpDir('go-library-cli-');
afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

/** Sources and manifest on disk: two good works plus a few refusals. */
function setup(name: string, only?: string[]) {
  const { manifest, files } = fixtureManifest();
  const dir = path.join(root, name);
  const inDir = path.join(dir, 'in');
  const entries = manifest.entries.filter((e) => !only || only.includes(e.slug));
  writeTree(inDir, files);
  const manifestFile = path.join(dir, 'manifest.json');
  fs.writeFileSync(manifestFile, JSON.stringify({ ...manifest, entries }), 'utf8');
  return { dir, inDir, manifestFile, outDir: path.join(dir, 'out') };
}

describe('npm run library:build (scripts/library-build.mts)', () => {
  it('builds the accepted works, prints what it did and why it refused the rest, and the output is readable by the runtime', async () => {
    const s = setup('ok');
    const r = await run('--', '--lang', 'es', '--manifest', s.manifestFile, '--in', s.inDir, '--out', s.outDir, '--date', '2026-10-01');
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/library:build - library-es@2026-10-01 \(schema 1\)/);
    expect(r.out).toMatch(/built:\s+3 work\(s\), 5 text\(s\)/);
    expect(r.out).toMatch(/\+ cuento-publico: 2 text\(s\)/);
    expect(r.out).toMatch(/\+ camino-test: 1 text\(s\).* rights course-authored/);
    expect(r.out).toMatch(/refused:\s+12/);
    expect(r.out).toMatch(/- moderno: .*"prohibited-from-bundling"/);
    expect(r.out).toMatch(/- sin-verificar: .*"rights-unverified"/);
    expect(r.out).toMatch(/- sin-verificador: .*named verifier/);
    expect(r.out).toMatch(/- danado: .*damaged/);
    expect(r.out).toMatch(/- faltante: .*not found/);

    const dir = path.join(s.outDir, 'es');
    const manifest = parseManifest(JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')), 'es')!;
    expect(manifest.texts).toBe(5);
    const files = listFiles(dir);
    expect(files).toContain('provenance.json');
    expect(files.filter((f) => f.startsWith('index/'))).toEqual(manifest.shards.map((x) => x.file).sort());
    expect(files.filter((f) => f.startsWith('t/')).length).toBe(5);
    expect(files.filter((f) => f.startsWith('p/')).length).toBe(5);
    expect(files.some((f) => /moderno|sin-verific|danado/.test(f))).toBe(false);
    expect(fs.readdirSync(s.outDir)).toEqual(['es']); // no staging directory left behind

    // read back through the runtime the way the app would
    const fetchFromDisk = (async (u: string) => {
      const rel = String(u).replace(/^.*\/library\/es\//, '');
      const file = path.join(dir, rel);
      return fs.existsSync(file) ? new Response(fs.readFileSync(file, 'utf8')) : new Response('', { status: 404 });
    }) as unknown as typeof fetch;
    const lib = createLibrary({ store: createMemoryStore(), adapters: registry, fetch: fetchFromDisk, clock });
    expect((await lib.info('es'))!.texts).toBe(5);
    expect((await lib.search({ lang: 'es', text: 'cuento' })).total).toBe(4); // both 'Cuento ...' works
    const text = await lib.open('text:es:cuento-publico-ch02');
    expect(text.title).toMatch(/Capítulo II/);
  }, 180_000);

  it('is deterministic for the same input and --date', async () => {
    const s = setup('det');
    const a = path.join(root, 'det-a');
    const b = path.join(root, 'det-b');
    expect((await run('--lang', 'es', '--manifest', s.manifestFile, '--in', s.inDir, '--out', a, '--date', '2026-10-01')).status).toBe(0);
    expect((await run('--lang', 'es', '--manifest', s.manifestFile, '--in', s.inDir, '--out', b, '--date', '2026-10-01')).status).toBe(0);
    const names = listFiles(path.join(a, 'es'));
    expect(names).toEqual(listFiles(path.join(b, 'es')));
    for (const n of names) expect(fs.readFileSync(path.join(a, 'es', n)), n).toEqual(fs.readFileSync(path.join(b, 'es', n)));
  }, 180_000);

  it('exits 1 with a usage line for missing or bad arguments, and writes nothing', async () => {
    const s = setup('bad');
    const cases: string[][] = [
      [],
      ['--lang', 'es'],
      ['--lang', 'xx', '--manifest', s.manifestFile, '--in', s.inDir, '--out', s.outDir],
      ['--lang', 'es', '--manifest', path.join(s.dir, 'nope.json'), '--in', s.inDir, '--out', s.outDir],
      ['--lang', 'es', '--manifest', s.manifestFile, '--in', path.join(s.dir, 'nope'), '--out', s.outDir],
      ['--lang', 'es', '--manifest', s.manifestFile, '--in', s.inDir, '--out', s.outDir, '--dict', path.join(s.dir, 'no-dict')],
    ];
    for (const args of cases) {
      const r = await run(...args);
      expect(r.status, args.join(' ')).toBe(1);
      expect(r.out, args.join(' ')).toMatch(/usage: npm run library:build/);
    }
    expect(fs.existsSync(s.outDir)).toBe(false);
  }, 240_000);

  it('exits 1 when nothing could be built, writing nothing and leaving an earlier build alone', async () => {
    const good = setup('keep');
    expect((await run('--lang', 'es', '--manifest', good.manifestFile, '--in', good.inDir, '--out', good.outDir, '--date', '2026-10-01')).status).toBe(0);
    const before = fs.readFileSync(path.join(good.outDir, 'es', 'manifest.json'), 'utf8');
    const refused = setup('refused-only', ['moderno', 'sin-verificar', 'faltante']);
    const r = await run('--lang', 'es', '--manifest', refused.manifestFile, '--in', refused.inDir, '--out', good.outDir, '--date', '2026-10-09');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/nothing was built: every entry was refused \(3\)/);
    expect(fs.readFileSync(path.join(good.outDir, 'es', 'manifest.json'), 'utf8')).toBe(before);
    expect(fs.readdirSync(good.outDir)).toEqual(['es']);
  }, 240_000);

  it('--strict makes any refusal an error (the build is still written)', async () => {
    const s = setup('strict', ['cuento-publico', 'moderno']);
    const r = await run('--lang', 'es', '--manifest', s.manifestFile, '--in', s.inDir, '--out', s.outDir, '--strict');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/--strict/);
    expect(fs.existsSync(path.join(s.outDir, 'es', 'manifest.json'))).toBe(true);
    const lenient = await run('--lang', 'es', '--manifest', s.manifestFile, '--in', s.inDir, '--out', path.join(s.dir, 'out2'));
    expect(lenient.status).toBe(0);
  }, 240_000);
});

describe('buildLibraryFiles', () => {
  it('replaces an earlier build only when the new one succeeded, and reads sources only from inside the input directory', async () => {
    const s = setup('lib');
    const first = await buildLibraryFiles({ lang: 'es', manifestFile: s.manifestFile, inDir: s.inDir, outDir: s.outDir, date: '2026-10-01', inspect: cleanInspect });
    expect(first.built.map((b) => b.slug)).toEqual(['cuento-publico', 'camino-test', 'revisado']);
    expect(first.files).toBe(listFiles(first.dir).length);
    // a stale file of the old build does not survive a rebuild
    fs.writeFileSync(path.join(first.dir, 'old.json'), '{}');
    const second = await buildLibraryFiles({ lang: 'es', manifestFile: s.manifestFile, inDir: s.inDir, outDir: s.outDir, date: '2026-10-02', inspect: cleanInspect });
    expect(listFiles(second.dir)).not.toContain('old.json');
    expect(second.manifest.id).toBe('library-es@2026-10-02');
    // a manifest that cannot be read, or is for another language, builds nothing
    await expect(buildLibraryFiles({ lang: 'es', manifestFile: path.join(s.dir, 'missing.json'), inDir: s.inDir, outDir: s.outDir, date: '2026-10-03' })).rejects.toThrow(LibraryBuildError);
    await expect(buildLibraryFiles({ lang: 'de', manifestFile: s.manifestFile, inDir: s.inDir, outDir: s.outDir, date: '2026-10-03' })).rejects.toThrow(/language/);
    expect(JSON.parse(fs.readFileSync(path.join(second.dir, 'manifest.json'), 'utf8')).id).toBe('library-es@2026-10-02');
  }, 120_000);
});
