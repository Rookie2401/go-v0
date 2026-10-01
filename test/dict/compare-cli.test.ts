import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import { lastModifiedFromHeaders } from '../../src/dict/compare-node';
import { FIXTURE, tmpDir } from './helpers';

const cli = path.resolve('node_modules/vite-node/dist/cli.mjs');
const run = (...args: string[]) => {
  const r = spawnSync(process.execPath, [cli, 'scripts/dict-compare.mts', ...args], { encoding: 'utf8', cwd: path.resolve('.'), timeout: 90_000 });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
};

const root = tmpDir('go-dict-compare-');
afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

const paths = (name: string) => ({
  report: path.join(root, name, 'REPORT.md'),
  json: path.join(root, name, 'disagreements.json'),
  resolutions: path.join(root, name, 'resolutions.json'),
});
const common = (name: string) => {
  const p = paths(name);
  const emptyCorpus = path.join(root, 'corpus-empty');
  fs.mkdirSync(emptyCorpus, { recursive: true });
  const text = path.join(root, 'tiny.txt');
  fs.writeFileSync(text, 'ฉันมีบ้านหลังหนึ่ง\nแม่ไปตลาดแล้ว\n', 'utf8');
  return ['--in', FIXTURE, '--lang', 'th', '--last-modified', '2026-09-28', '--corpus', emptyCorpus, '--text', text, '--report', p.report, '--json', p.json, '--resolutions', p.resolutions];
};

describe('npm run dict:compare (scripts/dict-compare.mts)', () => {
  it('compares the hand data with the fixture, writes both outputs and creates an empty resolutions file', () => {
    const p = paths('ok');
    const r = run('--', ...common('ok'));
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/dict:compare - kaikki-th@2026-09-28/);
    expect(r.out).toMatch(/all hand entries\s+\d+/);
    const report = fs.readFileSync(p.report, 'utf8');
    expect(report).toMatch(/^# Thai hand data against the dictionary \(kaikki-th@2026-09-28\)/);
    expect(report).toMatch(/CC BY-SA 4\.0/);
    expect(report).toMatch(/tiny\.txt/);
    const json = JSON.parse(fs.readFileSync(p.json, 'utf8')) as { dictionary: { id: string }; disagreements: Array<{ status: string; ours: { sourceId: string }; theirs: { sourceId: string } }> };
    expect(json.dictionary.id).toBe('kaikki-th@2026-09-28');
    expect(json.disagreements.length).toBeGreaterThan(0);
    expect(json.disagreements.every((d) => d.status === 'open' && /^adapter-th@\d+:/.test(d.ours.sourceId) && d.theirs.sourceId === 'kaikki-th@2026-09-28')).toBe(true);
    expect(fs.readFileSync(p.resolutions, 'utf8').trim()).toBe('{}');
  }, 120_000);

  it('is deterministic, and never overwrites an existing resolutions file', () => {
    const a = paths('det-a');
    const b = paths('det-b');
    fs.mkdirSync(path.dirname(a.resolutions), { recursive: true });
    const mine = `{\n  "th:missing:hand:ไม่มีทางมี": { "by": "Khun A", "at": "2026-10-02", "decision": "neither" }\n}\n`;
    fs.mkdirSync(path.dirname(b.resolutions), { recursive: true });
    fs.writeFileSync(a.resolutions, mine, 'utf8');
    fs.writeFileSync(b.resolutions, mine, 'utf8');
    expect(run(...common('det-a')).status).toBe(0);
    expect(run(...common('det-b')).status).toBe(0);
    expect(fs.readFileSync(a.report)).toEqual(fs.readFileSync(b.report));
    expect(fs.readFileSync(a.json)).toEqual(fs.readFileSync(b.json));
    expect(fs.readFileSync(a.resolutions, 'utf8')).toBe(mine);
    expect(fs.readFileSync(a.report, 'utf8')).toMatch(/matches no current disagreement \(kept in resolutions\.json\): 1/);
  }, 180_000);

  it('exits 1 with a usage line for missing or bad arguments, and writes nothing', () => {
    const p = paths('bad');
    const cases: string[][] = [
      [],
      ['--lang', 'th'],
      ['--in', FIXTURE],
      ['--in', FIXTURE, '--lang', 'xx', '--last-modified', '2026-09-28'],
      ['--in', FIXTURE, '--lang', 'es', '--last-modified', '2026-09-28'],
      ['--in', FIXTURE, '--lang', 'th', '--last-modified', '28/09/2026'],
      ['--in', path.join(root, 'nope.jsonl'), '--lang', 'th', '--last-modified', '2026-09-28'],
      ['--in', FIXTURE, '--lang', 'th', '--last-modified', '2026-09-28', '--bogus', 'x'],
      ['--in', FIXTURE, '--lang', 'th'], // no way to tell the version (the fixture's folder has no headers.txt)
    ];
    for (const args of cases) {
      const r = run(...args, '--report', p.report, '--json', p.json, '--resolutions', p.resolutions);
      expect(r.status, args.join(' ')).toBe(1);
      expect(r.out, args.join(' ')).toMatch(/usage: npm run dict:compare/);
    }
    expect(fs.existsSync(path.dirname(p.report))).toBe(false);
  }, 240_000);

  it('reads the version from the Last-Modified line of a saved header file', () => {
    expect(lastModifiedFromHeaders('HTTP/1.1 200 OK\nLast-Modified: Mon, 28 Sep 2026 17:57:05 GMT\n')).toBe('2026-09-28');
    expect(lastModifiedFromHeaders('HTTP/1.1 200 OK\n')).toBeUndefined();
  });
});
