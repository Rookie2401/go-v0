/**
 * The command line of the treebank comparison, `npm run sq:eval-ud`. It runs the installed Albanian adapter on the
 * HAND-MADE sample (test/bench/fixtures/sq-sample.conllu, not an extract of any treebank) and asserts only what does not
 * depend on how good the adapter is.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runNode } from '../helpers/cli';

const cli = path.resolve('node_modules/vite-node/dist/cli.mjs');
const sample = path.resolve('test/bench/fixtures/sq-sample.conllu');
const run = async (...args: string[]) => {
  const r = await runNode([cli, 'scripts/sq-eval-ud.mts', ...args], { cwd: path.resolve('.'), timeout: 120_000 });
  return { status: r.status, out: r.out };
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sq-eval-'));
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

describe('npm run sq:eval-ud', () => {
  it('exits 1 on bad arguments, on --show with the test split, and on a path that does not exist', async () => {
    expect((await run()).status).toBe(1);
    expect((await run('--treebank', sample)).status).toBe(1); // no split
    expect((await run('--treebank', sample, '--split', 'all')).status).toBe(1);

    const shown = await run('--treebank', sample, '--split', 'test', '--show', '3');
    expect(shown.status).toBe(1);
    expect(shown.out).toMatch(/--show is refused for the held-out split/);

    const missing = await run('--treebank', path.join(tmp, 'UD_Albanian-TSA'), '--split', 'dev');
    expect(missing.status).toBe(1);
    expect(missing.out).toMatch(/does not exist/);
    expect(missing.out).toMatch(/research material/);
    expect(missing.out).toMatch(/owner's permission/);
    expect(missing.out).toMatch(/data\/research\/ud\//);
  }, 600_000);

  it('exits 1 for an empty directory and for a malformed file, naming the line', async () => {
    const empty = path.join(tmp, 'empty');
    fs.mkdirSync(empty);
    expect((await run('--treebank', empty, '--split', 'dev')).status).toBe(1);

    const bad = path.join(tmp, 'bad');
    fs.mkdirSync(bad);
    fs.writeFileSync(path.join(bad, 'x.conllu'), '# sent_id = a\n1\tPo\tpo\n', 'utf8');
    const r = await run('--treebank', bad, '--split', 'dev');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/x\.conllu: conllu line 2: expected 10 tab-separated columns, found 3/);
  }, 600_000);

  it('reports a dev run on a directory: name, counts, adapter version, the measures, examples when asked', async () => {
    const dir = path.join(tmp, 'UD_Fake-Sample');
    fs.mkdirSync(dir);
    fs.copyFileSync(sample, path.join(dir, 'a.conllu'));
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not read', 'utf8');
    const r = await run('--treebank', dir, '--split', 'dev', '--show', '2', '--name', 'SAMPLE');
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/^treebank SAMPLE: 1 file\(s\), 12 sentences, 58 surface tokens/m);
    expect(r.out).toMatch(/^adapter .* version \S+/m);
    expect(r.out).toMatch(/not ground truth/);
    expect(r.out).toMatch(/^split dev: \d+ of 12 sentences/m);
    for (const part of ['TOKENS', 'MULTIWORD TOKENS', 'WORDS where the boundaries agree', 'part of speech', 'lemma', 'features', 'COVERAGE']) {
      expect(r.out).toContain(part);
    }
    expect(r.out).toMatch(/boundary F1/);
    expect(r.out).toMatch(/\d+\.\d% \(\d+\/\d+\)/);
    expect(r.out).toContain('EXAMPLES (dev split only)');
  }, 600_000);

  it('reports the test split without examples and with the word tables withheld', async () => {
    const r = await run('--treebank', sample, '--split', 'test');
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/^split test: \d+ of 12 sentences/m);
    expect(r.out).not.toContain('EXAMPLES');
    expect(r.out).toMatch(/withheld for the held-out split/);
  }, 600_000);
});
