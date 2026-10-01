import fs from 'node:fs';
import path from 'node:path';
import { runNode } from '../helpers/cli';
import { afterAll, describe, expect, it } from 'vitest';
import { createFileLexiconSource } from '../../src/dict/file';
import { DATE, FIXTURE, tmpDir } from './helpers';

const cli = path.resolve('node_modules/vite-node/dist/cli.mjs');
const run = async (...args: string[]) => {
  const r = await runNode([cli, 'scripts/dict-build.mts', ...args], { cwd: path.resolve('.'), timeout: 90_000 });
  return { status: r.status, out: r.out };
};

const root = tmpDir('go-dict-cli-');
afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('npm run dict:build (scripts/dict-build.mts)', () => {
  it('builds the fixture, prints the counts, and the result is readable by the file source', async () => {
    const outDir = path.join(root, 'ok');
    const r = await run('--', '--in', FIXTURE, '--lang', 'th', '--out', outDir, '--date', DATE,
      '--source-url', 'https://example.test/f.jsonl', '--last-modified', '2026-09-28', '--retrieved', '2026-09-30');
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/dict:build - kaikki-th@2026-09-28 \(schema 2\)/);
    expect(r.out).toMatch(/input lines:\s+71/);
    expect(r.out).toMatch(/malformed lines:\s+2/);
    expect(r.out).toMatch(/not-an-object 2, no-word 1, wrong-language 1, no-gloss 3, non-word 3 \(non-word: character 1, symbol 1, punct 1\)/);
    expect(r.out).toMatch(/59 lines -> 58 entries \(50 forms\)/);
    expect(r.out).toMatch(/1 entries with unpaired pronunciation rows/);
    expect(r.out).toMatch(/sha256 [0-9a-f]{64}/);
    expect(r.out).toMatch(/CC BY-SA 4\.0/);
    const src = createFileLexiconSource(outDir, 'th');
    const info = await src.info();
    expect(info?.entries).toBe(58);
    expect(info?.source).toMatchObject({ url: 'https://example.test/f.jsonl', file: 'kaikki-th-sample.jsonl', lastModified: '2026-09-28', retrievedAt: '2026-09-30', lines: 72 });
    expect((await src.lookup(['ขนม'])).get('ขนม')?.[0].pos).toBe('NOUN');
  }, 120_000);

  it('is deterministic for the same input and --date', async () => {
    const a = path.join(root, 'det-a');
    const b = path.join(root, 'det-b');
    expect((await run('--in', FIXTURE, '--lang', 'th', '--out', a, '--date', DATE)).status).toBe(0);
    expect((await run('--in', FIXTURE, '--lang', 'th', '--out', b, '--date', DATE)).status).toBe(0);
    const names = fs.readdirSync(path.join(a, 'th'));
    expect(names).toEqual(fs.readdirSync(path.join(b, 'th')));
    for (const n of names) expect(fs.readFileSync(path.join(a, 'th', n))).toEqual(fs.readFileSync(path.join(b, 'th', n)));
  }, 120_000);

  it('exits 1 with a usage line for missing or bad arguments, and writes nothing', async () => {
    const outDir = path.join(root, 'bad');
    const cases: string[][] = [
      [],
      ['--lang', 'th'],
      ['--in', FIXTURE],
      ['--in', FIXTURE, '--lang', 'xx', '--out', outDir],
      ['--in', FIXTURE, '--lang', 'th', '--out', outDir, '--date', '30/09/2026'],
      ['--in', path.join(root, 'does-not-exist.jsonl'), '--lang', 'th', '--out', outDir],
      ['--in', FIXTURE, '--lang', 'th', '--out', outDir, '--bogus', 'x'],
      ['--in', FIXTURE, '--lang', 'th', '--out', outDir, '--last-modified', 'yesterday'],
      ['--in', FIXTURE, '--lang', 'th', '--out', outDir, '--retrieved', '2026/09/30'],
    ];
    for (const args of cases) {
      const r = await run(...args);
      expect(r.status, args.join(' ')).toBe(1);
      expect(r.out, args.join(' ')).toMatch(/usage: npm run dict:build/);
    }
    expect(fs.existsSync(outDir)).toBe(false);
  }, 180_000);

  it('exits 1 on an input with no usable entries, writing nothing', async () => {
    const input = path.join(root, 'junk.jsonl');
    fs.writeFileSync(input, 'not json\n{"word":"x"}\n');
    const outDir = path.join(root, 'junk-out');
    const r = await run('--in', input, '--lang', 'th', '--out', outDir, '--date', DATE);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/no usable entries/);
    expect(fs.existsSync(outDir)).toBe(false);
  }, 120_000);
});
