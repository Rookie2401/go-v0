/**
 * The independent French fixtures (data/benchmarks/fr/fixtures; README beside them): written from French grammar and checked
 * against the kaikki.org extract and the UD French GSD treebank, without reading the adapter. An AI's judgement, not native-reviewed.
 *
 * Two parts. The FORMAT checks always run (ids, targets, feature vocabulary, counts per category, the known-limits file).
 * The EVALUATION runs the French adapter once it exists (src/adapters/fr.ts, export `frAdapter`); until then it is skipped.
 * Evaluation rule: every case passes every expectation EXCEPT those listed in data/benchmarks/fr/known-limits.json as
 * { id, failed: [keys], reason }; a known limit must fail EXACTLY as recorded, so the file is always the true list of what
 * does not work. If a case now passes or fails differently, this test fails and says to update the file.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { normalizeFr } from '../../src/adapters/french/orth';
import type { LanguageAdapter } from '../../src/core/adapters';
import { CATEGORIES, FEATURE_VALUES, MINIMUMS, POS_VALUES, evaluateAll, formatSummary, loadFixtures, summarise, type FixtureFile, type FixtureResult } from '../../src/bench/fr/fixtures';

const FIXTURES_DIR = fileURLToPath(new URL('../../data/benchmarks/fr/fixtures', import.meta.url));
const LIMITS_FILE = fileURLToPath(new URL('../../data/benchmarks/fr/known-limits.json', import.meta.url));

const CONSTRUCTIONS = new Set([
  'passe-compose', 'plus-que-parfait', 'futur-anterieur', 'conditionnel-passe', 'subjonctif-passe', 'passe-anterieur', 'passe-simple',
  'imparfait', 'futur-simple', 'futur-proche', 'passe-recent', 'etre-en-train-de', 'passive-voice', 'pronominal-verb',
  'participle-agreement-etre', 'participle-agreement-preceding-object', 'participle-no-agreement', 'negation', 'negation-ne-que',
  'negation-ne-dropped', 'object-pronouns', 'double-object-pronouns', 'pronoun-y', 'pronoun-en', 'imperative-pronouns',
  'inversion-question', 'est-ce-que', 'relative-qui', 'relative-que', 'relative-dont', 'relative-ou', 'relative-lequel',
  'partitive-article', 'contraction-article', 'elision', 'il-y-a', 'subjunctive-after-que', 'literary-subjunctive-imperfect',
  'adjective-position', 'gerondif', 'comparative', 'superlative', 'c-est',
]);
const EXPECT_KEYS = new Set(['lemma', 'pos', 'features', 'construction', 'phrase', 'parts', 'tokens', 'notLemma']);
const RESULT_KEYS = new Set(['target', 'tokens', 'lemma', 'pos', 'first', 'parts', 'notLemma', 'construction', 'phrase', 'exception', ...Object.keys(FEATURE_VALUES).map((k) => `feature:${k}`)]);

const files: FixtureFile[] = loadFixtures(FIXTURES_DIR);
const all = files.flatMap((f) => f.cases.map((c) => ({ category: f.category, c })));

interface KnownLimit { id: string; failed: string[]; reason: string }
const limits: KnownLimit[] = (JSON.parse(readFileSync(LIMITS_FILE, 'utf8')) as { limits: KnownLimit[] }).limits;

const countWord = (sentence: string, target: string): number => {
  const s = normalizeFr(sentence);
  const t = normalizeFr(target);
  let n = 0;
  for (let i = s.indexOf(t); i >= 0; i = s.indexOf(t, i + 1)) n++;
  return n;
};

describe('French fixtures: format', () => {
  it('has one file per category and each file names its category', () => {
    expect(files.map((f) => f.category).sort()).toEqual([...CATEGORIES].sort());
    for (const f of files) expect(f.note.length, f.category).toBeGreaterThan(40);
  });

  it('meets the minimum number of cases per category', () => {
    for (const f of files) expect(f.cases.length, `${f.category} has ${f.cases.length}, needs ${MINIMUMS[f.category]}`).toBeGreaterThanOrEqual(MINIMUMS[f.category] ?? 1);
  });

  it('has unique ids that carry a category prefix and a three-digit number', () => {
    const ids = all.map((x) => x.c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id, id).toMatch(/^[a-z]+-\d{3}$/);
  });

  it('has a target that occurs in the sentence the stated number of times', () => {
    for (const { c } of all) {
      expect(c.sentence.length, c.id).toBeGreaterThan(2);
      const n = countWord(c.sentence, c.target);
      expect(n, `${c.id}: ${JSON.stringify(c.target)} not in ${JSON.stringify(c.sentence)}`).toBeGreaterThanOrEqual(c.occurrence ?? 1);
    }
  });

  it('uses only the conventional feature keys and values (src/adapters/french/types.ts)', () => {
    for (const { c } of all) {
      for (const [k, v] of Object.entries(c.expect.features ?? {})) {
        expect(FEATURE_VALUES[k], `${c.id}: unknown feature key ${k}`).toBeDefined();
        for (const part of v.split(',')) expect(FEATURE_VALUES[k], `${c.id}: ${k}=${v}`).toContain(part);
      }
    }
  });

  it('uses real parts of speech, sources and levels, and known expectation keys', () => {
    for (const { c } of all) {
      if (c.expect.pos) expect(POS_VALUES, c.id).toContain(c.expect.pos);
      for (const p of c.alsoAcceptPos ?? []) expect(POS_VALUES, c.id).toContain(p);
      expect(['grammar', 'kaikki', 'ud'], c.id).toContain(c.source);
      expect(['core', 'advanced'], c.id).toContain(c.level);
      expect(c.why.length, c.id).toBeGreaterThanOrEqual(8);
      for (const k of Object.keys(c.expect)) expect(EXPECT_KEYS.has(k), `${c.id}: unknown expect key ${k}`).toBe(true);
      expect(Object.keys(c.expect).length, `${c.id}: expects nothing`).toBeGreaterThan(0);
      if (c.expect.construction) expect(CONSTRUCTIONS, `${c.id}: ${c.expect.construction}`).toContain(c.expect.construction);
      if (c.expect.parts) expect(c.expect.parts.length, c.id).toBeGreaterThanOrEqual(2);
      if (c.expect.tokens) expect(c.expect.tokens.length, c.id).toBeGreaterThan(0);
    }
  });

  it('writes the page spelling of the sentence with no stray control characters or doubled spaces', () => {
    for (const { c } of all) {
      expect(c.sentence, c.id).not.toMatch(/[\u0000-\u001f]|\s{2,}/u);
      expect(c.sentence.trim(), c.id).toBe(c.sentence);
    }
  });

  it('keeps the known-limits file well formed: real ids, real failure keys, a reason, no duplicates', () => {
    const byId = new Map(all.map((x) => [x.c.id, x.c]));
    const seen = new Set<string>();
    for (const l of limits) {
      expect(byId.has(l.id), `known limit for unknown id ${l.id}`).toBe(true);
      expect(seen.has(l.id), `duplicate known limit ${l.id}`).toBe(false);
      seen.add(l.id);
      expect(l.failed.length, l.id).toBeGreaterThan(0);
      for (const k of l.failed) expect(RESULT_KEYS.has(k), `${l.id}: unknown failure key ${k}`).toBe(true);
      expect(l.reason.trim().length, `${l.id}: a known limit needs a reason`).toBeGreaterThan(10);
    }
  });
});

describe('French fixtures: evaluation against the adapter', () => {
  let adapter: LanguageAdapter | undefined;
  let results: FixtureResult[] = [];

  beforeAll(async () => {
    const mod = await import('../../src/adapters/fr').catch(() => undefined);
    adapter = (mod as { frAdapter?: LanguageAdapter } | undefined)?.frAdapter;
    if (adapter) results = evaluateAll(adapter, files);
  });

  const limitFor = new Map(limits.map((l) => [l.id, l]));
  const sameKeys = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

  for (const cat of CATEGORIES) {
    it(`${cat}: every case passes, except the known limits, which fail exactly as recorded`, ({ skip }) => {
      if (!adapter) skip();
      const problems: string[] = [];
      for (const r of results.filter((x) => x.category === cat)) {
        const lim = limitFor.get(r.id);
        const detail = `readings: ${r.got.readings.slice(0, 4).join(' ; ') || '(none)'}${r.got.constructions.length ? ` | constructions: ${r.got.constructions.join(',')}` : ''}${r.got.tokens.length ? ` | tokens: ${r.got.tokens.join(' · ')}` : ''}`;
        if (lim) {
          if (r.ok) problems.push(`${r.id}: is listed as a known limit (${lim.failed.join(', ')}) but now passes: remove it from data/benchmarks/fr/known-limits.json`);
          else if (!sameKeys(r.failed, lim.failed)) problems.push(`${r.id}: known limit says it fails ${JSON.stringify(lim.failed)} but it fails ${JSON.stringify(r.failed)}: update data/benchmarks/fr/known-limits.json (${detail})`);
        } else if (!r.ok) problems.push(`${r.id}: fails ${JSON.stringify(r.failed)} (${detail})`);
      }
      expect(problems, problems.join('\n')).toEqual([]);
    });
  }

  it('prints the per-category summary', ({ skip }) => {
    if (!adapter) skip();
    const summary = summarise(results);
    // eslint-disable-next-line no-console
    console.log(`${formatSummary(summary)}\n  known limits recorded: ${limits.length}`);
    expect(summary.total).toBe(all.length);
  });
});
