import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDoc } from './helpers';

const cli = path.resolve('node_modules/vite-node/dist/cli.mjs');
const run = (script: string, ...args: string[]) => {
  const r = spawnSync(process.execPath, [cli, script, ...args], { encoding: 'utf8', cwd: path.resolve('.'), timeout: 90_000 });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
};

describe('corpus CLI (npm run corpus:validate / corpus:check / corpus:migrate)', () => {
  let dir: string;
  beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-corpus-')); });
  afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });
  const write = (name: string, doc: unknown) => { const p = path.join(dir, name); fs.writeFileSync(p, JSON.stringify(doc, null, 2)); return p; };

  it('corpus:validate exits 0 for a valid file and prints the analysis coverage and publication status', () => {
    const r = run('scripts/corpus-validate.mts', write('ok.json', baseDoc()));
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/analysis coverage 100\.0%/);
    expect(r.out).toMatch(/unpublished/);
    expect(r.out).toMatch(/corpus:validate - 1 document\(s\), 0 error\(s\), 0 warning\(s\)/);
  }, 120_000);

  it('corpus:validate exits 1 on errors and prints path and hint for every issue; directories are walked', () => {
    const bad = baseDoc();
    bad.review = { status: 'reviewed' };
    (bad.sections[0].paragraphs[0] as unknown as { sentences: Array<Record<string, unknown>> }).sentences[0].spans = [{ start: 0, end: 2, lemma: 'x' }];
    write('bad.json', bad);
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'sub', 'broken.json'), '{ not json');
    const r = run('scripts/corpus-validate.mts', dir);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/ERROR review\.reviewedBy: .*\[review-missing-reviewer\]/);
    expect(r.out).toMatch(/hint: Name the person/);
    expect(r.out).toMatch(/ERROR sections\[0\]\.paragraphs\[0\]\.sentences\[0\]\.spans\[0\]: .*\[span-not-on-token\]/);
    expect(r.out).toMatch(/not valid JSON/);
    expect(r.out).toMatch(/corpus:validate - 3 document\(s\), [3-9] error\(s\)/);
  }, 120_000);

  it('corpus:validate rejects a version 1 file pointing at the migration, and exits 1 with nothing to validate', () => {
    const r = run('scripts/corpus-validate.mts', write('v1.json', { formatVersion: 1, lang: 'es', slug: 'x' }));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/unsupported-schema-version/);
    expect(r.out).toMatch(/corpus:migrate/);
    expect(run('scripts/corpus-validate.mts').status).toBe(1);
    expect(run('scripts/corpus-validate.mts', path.join(dir, 'nope')).status).toBe(1);
  }, 120_000);

  it('corpus:check passes on the bundled corpus: valid, re-import a no-op, verified Scripture byte-identical', () => {
    const r = run('scripts/corpus-check.mts');
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/corpus:check - 15 document\(s\), 0 validation error\(s\), \d+ warning\(s\); 2 published, 13 unpublished; re-import unchanged: yes; 6 verified verse\(s\) byte-identical; OK/);
  }, 120_000);

  it('corpus:migrate is repeatable: the bundled corpus is already version 2, nothing is rewritten', () => {
    const before = fs.readFileSync('data/corpus/es/story-01.json', 'utf8');
    const r = run('scripts/corpus-migrate.mts');
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/converted 0 document\(s\) to schemaVersion 2, left 15 unchanged/);
    expect(fs.readFileSync('data/corpus/es/story-01.json', 'utf8')).toBe(before);
  }, 120_000);
});
