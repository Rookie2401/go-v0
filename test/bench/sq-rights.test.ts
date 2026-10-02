/**
 * Rights isolation of the Albanian validation material. The treebanks are research-only: the machine must not let them
 * into a bundle, they must not appear in the course corpus, and the resource records must say so.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bundleDecision } from '../../src/ingest/rights';

function files(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

describe('research-only material is never bundled', () => {
  const doc = (extra: Record<string, unknown> = {}) => ({ id: 'ud-sentence', lang: 'sq', source: { rights: 'research-only', licenseNote: 'CC BY-SA 4.0', attribution: 'Universal Dependencies' }, ...extra });

  it('bundleDecision does not bundle a document whose rights are research-only', () => {
    expect(bundleDecision(doc()).verdict).not.toBe('bundle');
    expect(bundleDecision(doc({ work: { slug: 'some-work' } })).verdict).not.toBe('bundle');
    expect(bundleDecision(doc({ work: { slug: 'some-work' } }), { work: () => ({ state: 'verified-open-licence', verifiedBy: 'x', verifiedAt: '2026-10-01' }) }).verdict).not.toBe('bundle');
    expect(bundleDecision(doc({ contentType: 'scripture' })).verdict).not.toBe('bundle');
  });
});

describe('the course corpus holds no treebank material', () => {
  it('no file under data/corpus/sq/ mentions Universal Dependencies or a UD_ treebank', () => {
    const found = files(path.resolve('data/corpus/sq'));
    expect(found.length).toBeGreaterThan(0);
    for (const f of found) {
      const text = fs.readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/Universal Dependencies/i);
      expect(text, f).not.toMatch(/\bUD_[A-Za-z]/);
      expect(text, f).not.toMatch(/data\/research\/ud/);
    }
  });
});

describe('RESOURCES.json', () => {
  const file = JSON.parse(fs.readFileSync(path.resolve('data/benchmarks/sq/RESOURCES.json'), 'utf8')) as { resources: Array<Record<string, unknown>> };

  const treebanks = file.resources.filter((r) => String(r.name).startsWith('UD_'));

  it('lists the three treebanks, each research-only and not shipped', () => {
    expect(treebanks.map((r) => r.name)).toEqual(['UD_Albanian-STAF', 'UD_Albanian-TSA', 'UD_Gheg-GPS']);
    for (const r of treebanks) {
      expect(r.licence, String(r.name)).toBe('CC BY-SA 4.0');
      expect(r.localPath, String(r.name)).toBe(`data/research/ud/${String(r.name)}`);
      expect(r.repository, String(r.name)).toBe(`https://github.com/UniversalDependencies/${String(r.name)}`);
    }
  });

  it('every resource is research-only, not shipped, and kept under data/research/ (git-ignored)', () => {
    expect(file.resources.length).toBeGreaterThanOrEqual(3);
    for (const r of file.resources) {
      expect(r.shipped, String(r.name)).toBe(false);
      expect(r.use, String(r.name)).toBe('research-only');
      expect(String(r.localPath), String(r.name)).toMatch(/^data\/research\//);
      expect(String(r.licence), String(r.name)).not.toBe('');
    }
    expect(fs.readFileSync(path.resolve('.gitignore'), 'utf8')).toMatch(/^data\/research\/$/m);
  });

  it('a downloaded resource records when and which version; the facts read from the READMEs stand', () => {
    for (const r of file.resources) {
      // either not downloaded (both null) or downloaded with a date and an exact version
      expect(r.retrieved === null, String(r.name)).toBe(r.version === null);
      if (r.retrieved !== null) {
        expect(String(r.retrieved), String(r.name)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(String(r.version), String(r.name)).toMatch(/git [0-9a-f]{40}|sha256/);
      }
    }
    const by = Object.fromEntries(file.resources.map((r) => [String(r.name), r]));
    expect(by['UD_Albanian-STAF']).toMatchObject({ sentences: 202, udSince: 'v2.15', annotation: 'lemmas and features automatic with corrections' });
    expect(by['UD_Albanian-TSA']).toMatchObject({ sentences: 60, tokens: 922, udSince: 'v2.6', annotation: 'manual' });
    expect(by['UD_Gheg-GPS']).toMatchObject({ sentences: 966, udSince: 'v2.11', annotation: 'manual' });
  });
});

describe('the gold directory', () => {
  it('holds only the schema and a placeholder until a reviewer has accepted sentences', () => {
    const names = fs.readdirSync(path.resolve('data/benchmarks/sq/gold'));
    expect(names).toEqual(expect.arrayContaining(['SCHEMA.md', '.gitkeep']));
    expect(names.every((n) => n === 'SCHEMA.md' || n === '.gitkeep' || n.endsWith('.jsonl'))).toBe(true);
  });
});
