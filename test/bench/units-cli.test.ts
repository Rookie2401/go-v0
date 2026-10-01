import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runNode } from '../helpers/cli';
import { afterAll, describe, expect, it } from 'vitest';
import { CONSTRUCTED_UNIT_CASES, parseJsonl, toJsonl, validateUnitCases } from '../../src/bench/units';

const cli = path.resolve('node_modules/vite-node/dist/cli.mjs');
const run = async (...args: string[]) => {
  const r = await runNode([cli, 'scripts/bench-units.mts', ...args], { cwd: path.resolve('.'), timeout: 120_000 });
  return { status: r.status, out: r.out };
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-units-cli-'));
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('constructed gold file', () => {
  const file = path.resolve('data/benchmarks/th/constructed-units.gold.jsonl');
  it('is the committed file generated from src/bench/units/constructed.ts, and valid', () => {
    const text = fs.readFileSync(file, 'utf8');
    expect(text).toBe(toJsonl(CONSTRUCTED_UNIT_CASES));
    const cases = parseJsonl(text);
    expect(cases).toEqual(CONSTRUCTED_UNIT_CASES);
    expect(validateUnitCases(cases)).toEqual([]);
  });
});

describe('npm run bench:units (scripts/bench-units.mts)', () => {
  it('runs the constructed set through every system and prints the table, the hazards, the failing cases and the guards', async () => {
    const r = await run();
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/\| adapter \| \d+ \|/);
    expect(r.out).toMatch(/\| paragraph \| \d+ \|/);
    expect(r.out).toMatch(/\| spaces \| \d+ \|/);
    expect(r.out).toMatch(/boundary F1/);
    expect(r.out).toMatch(/adapter: by hazard/);
    expect(r.out).toMatch(/adapter: cases that differ from the gold/);
    expect(r.out).toMatch(/guards over the gold paragraphs/);
    expect(r.out).toMatch(/units over 40 words/);
  }, 180_000);

  it('--check-constructed passes, and --errors writes every error with its kind', async () => {
    expect((await run('--check-constructed')).status).toBe(0);
    const out = path.join(dir, 'errors.json');
    const r = await run('--systems', 'adapter', '--errors', out);
    expect(r.status).toBe(0);
    const payload = JSON.parse(fs.readFileSync(out, 'utf8')) as Array<{ system: string; cases: Array<{ id: string; errors: Array<{ kind: string }> }> }>;
    expect(payload).toHaveLength(1);
    expect(payload[0].system).toBe('adapter');
    expect(payload[0].cases.length).toBeGreaterThan(0);
    expect(payload[0].cases.every((c) => c.errors.length > 0 && c.errors.every((e) => ['over-split', 'under-split', 'shifted'].includes(e.kind)))).toBe(true);
  }, 180_000);

  it('--text prints the guards over any text without a gold; --sensitivity prints the probe', async () => {
    const f = path.join(dir, 'book.txt');
    fs.writeFileSync(f, 'ผมชื่อสมชายครับ ผมอยู่เชียงใหม่ครับ\nวันนี้ปี พ.ศ. 2565 ฝนตกหนักมาก\n', 'utf8');
    const t = await run('--text', f);
    expect(t.status).toBe(0);
    expect(t.out).toMatch(/guards over 2 paragraphs/);
    expect(t.out).toMatch(/\| adapter \| 2 \|/);
    const s = await run('--sensitivity', f);
    expect(s.status).toBe(0);
    expect(s.out).toMatch(/dwell model/);
    expect(s.out).toMatch(/adapter → paragraph/);
  }, 180_000);

  it('exits 1 with a usage line for a bad option, a missing file or a gold file with problems', async () => {
    expect((await run('--nope')).status).toBe(1);
    expect((await run('--gold')).status).toBe(1);
    expect((await run('--gold', path.join(dir, 'missing.jsonl'))).status).toBe(1);
    const bad = path.join(dir, 'bad.jsonl');
    fs.writeFileSync(bad, JSON.stringify({ ...CONSTRUCTED_UNIT_CASES[0], unitBoundaries: [CONSTRUCTED_UNIT_CASES[0].paragraph.indexOf(' ')] }) + '\n', 'utf8');
    const r = await run('--gold', bad);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/usage: npm run bench:units/);
    expect((await run('--systems', 'bogus')).status).toBe(1);
  }, 180_000);
});
