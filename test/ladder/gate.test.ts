/**
 * The ladder gate (docs/LADDER.md): (a) every committed data/ladder/<lang>/ladder.json must measure with no error-level
 * finding - the CI gate; (b) the checks themselves, on small synthetic Spanish ladders run through the real Spanish adapter;
 * (c) the loader (in-place document references, paths that leave the repository, absent authentic texts); (d) ladder:place.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import type { CorpusDocument } from '../../src/ingest';
import {
  FIRST_UNITS_ALLOWANCE, LADDER_STAGES, LadderFormatError, ladderLanguages, loadLadder, loadStage0Head, measureLadder, parseLadder, placeCandidate,
} from '../../src/ladder';
import type { Finding, LadderKind, LadderStage, LoadedLadder } from '../../src/ladder';

const root = path.resolve('.');
const adapter = createAdapterRegistry().get('es');

// ───────────────────────────── (a) the CI gate over committed ladders ─────────────────────────────

describe('committed ladders (CI gate)', () => {
  const langs = ladderLanguages(root);
  if (!langs.length) it('no data/ladder/*/ladder.json yet - nothing to gate', () => { expect(langs).toEqual([]); });
  for (const lang of langs) {
    it(`${lang}: no error-level finding`, () => {
      const report = measureLadder(lang, loadLadder(lang, root), { adapter: createAdapterRegistry().get(lang) });
      const errors = report.findings.filter((f) => f.level === 'error').map((f) => `${f.unit} [${f.check}] ${f.message}`);
      expect(errors).toEqual([]);
    });
  }
});

// ───────────────────────────── synthetic ladders ─────────────────────────────

/** Words the head teaches (>= 3 encounters each), words it shows once (met, not yet known), and fresh words for new lemmas. */
const K = ['niño', 'perro', 'gato', 'ciudad', 'mesa', 'libro', 'agua', 'pan', 'árbol', 'mujer', 'hombre', 'día', 'ver', 'tener', 'querer', 'buscar', 'comer', 'leer', 'grande', 'pequeño', 'bueno', 'aquí', 'hoy', 'mucho'];
const H = ['barco', 'puente', 'campo', 'isla', 'playa', 'arena']; // met once in the head: unknown at 3, but not "new"
const U = ['zorro', 'lobo', 'nube', 'río', 'bosque', 'luna', 'viento', 'lluvia', 'fuego', 'piedra', 'hierba', 'flor', 'rama', 'sombra', 'camino', 'ventana', 'puerta', 'techo', 'pared', 'suelo', 'cielo', 'trigo', 'miel', 'sal'];
const W = ['tempestad', 'villorrio', 'devastar', 'subitamente', 'lejano', 'cordillera', 'naufragio', 'caudaloso', 'bergantín', 'acantilado', 'promontorio', 'cataratas', 'galeón', 'contrabando', 'arrecife', 'meseta', 'desfiladero'];

const cyc = (list: string[], n: number, offset = 0): string[] => Array.from({ length: n }, (_, i) => list[(i + offset) % list.length]);
const sentencesOf = (words: string[], size = 7): string[] => {
  const out: string[] = [];
  for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size).join(' ') + '.');
  return out;
};
const doc = (id: string, words: string[], contentType = 'story'): CorpusDocument => ({
  schemaVersion: 2, id, lang: 'es', title: id, contentType,
  sections: [{ paragraphs: [{ sentences: sentencesOf(words).map((text) => ({ text })) }] }],
} as unknown as CorpusDocument);

const headDoc = (): CorpusDocument => doc('head', [...[0, 5, 11, 17].flatMap((o) => cyc(K, 24, o)), ...H]);

interface UnitSpec { id: string; stage?: LadderStage; kind?: LadderKind; domain?: string; doc: CorpusDocument }
const ladderOf = (specs: UnitSpec[], withHead = true): LoadedLadder => ({
  ladder: { lang: 'es', version: 1, after: 'stage0', units: specs.map((s) => ({ id: s.id, stage: s.stage ?? 'a1-1', kind: s.kind ?? 'controlled', domain: s.domain ?? 'narrative' })) },
  head: withHead ? [{ id: 'stage0:head', title: 'head', doc: headDoc() }] : [],
  units: specs.map((s) => ({ unit: { id: s.id, stage: s.stage ?? 'a1-1', kind: s.kind ?? 'controlled', domain: s.domain ?? 'narrative' }, doc: s.doc, status: 'ok' as const })),
});

/** A gentle unit: known body, its own new word twice, and the two previous units' new words twice each (so new words are recycled). */
const gentle = (i: number, recycle = true): CorpusDocument => {
  const body = cyc(K, 80, i * 7);
  const extras = [U[i], U[i], ...(recycle && i >= 1 ? [U[i - 1], U[i - 1]] : []), ...(recycle && i >= 2 ? [U[i - 2], U[i - 2]] : [])];
  return doc(`g${i}`, [...body.slice(0, 40), ...extras, ...body.slice(40)]);
};
const gentleUnits = (n: number, recycle = true, stageOf: (i: number) => LadderStage = (i) => (i < 4 ? 'a1-1' : 'a1-2')): UnitSpec[] =>
  Array.from({ length: n }, (_, i) => ({ id: `u${i}`, stage: stageOf(i), doc: gentle(i, recycle) }));

/** A unit with `unknown` tokens met only once in the head (neither known nor new) among `total` running words. */
const gappy = (id: string, total: number, unknown: number): CorpusDocument =>
  doc(id, [...cyc(K, total - unknown, 3).slice(0, 30), ...cyc(H, unknown), ...cyc(K, total - unknown, 3).slice(30)]);

const report = (units: UnitSpec[], withHead = true) => measureLadder('es', ladderOf(units, withHead), { adapter });
const byCheck = (findings: Finding[], check: string, unit?: string): Finding[] => findings.filter((f) => f.check === check && (unit === undefined || f.unit === unit));

describe('measureLadder on small synthetic Spanish ladders', () => {
  it('a gentle ladder passes with no finding at all, and reports the per-unit facts', () => {
    const r = report(gentleUnits(8));
    expect(r.findings).toEqual([]);
    expect(r.head.words).toBeGreaterThan(90);
    for (const row of r.rows) {
      expect(row.cov3).toBeGreaterThanOrEqual(0.92);
      expect(row.cov1).toBeGreaterThanOrEqual(row.cov3);
      expect(row.words).toBeGreaterThan(80);
      expect(row.newLemmas).toBe(1);
      expect(Array.isArray(row.constructionsFirstMet)).toBe(true);
      expect(row.scripture).toBe(false);
    }
    expect(r.rows[0].recycled).toBe(1); // the unit-0 word returns in units 1 and 2
    expect(r.rows[7].recycled).toBeNull(); // no complete 6-unit window after it
    expect(r.stages.map((s) => s.stage)).toEqual(['stage0', 'a1-1', 'a1-2']);
    expect(r.stages[1].units).toBe(4);
    expect(r.stages[1].scriptureShare).toBe(0);
  });

  it('constructions count as met in the first unit that has them, never again', () => {
    const r = report(gentleUnits(4));
    const all = r.rows.flatMap((x) => x.constructionsFirstMet);
    expect(new Set(all).size).toBe(all.length);
  });

  it('a hard unit produces the coverage error, the cliff and the new-lemma error', () => {
    const units = gentleUnits(6);
    units.splice(4, 0, { id: 'hard', stage: 'a1-2', doc: doc('hard', [...W, ...W.slice(0, 10)].concat(cyc(K, 10))) });
    const r = report(units);
    expect(byCheck(r.findings, 'coverage', 'hard')[0]?.level).toBe('error');
    expect(byCheck(r.findings, 'cliff', 'hard')[0]?.level).toBe('error');
    expect(byCheck(r.findings, 'new-lemmas', 'hard')[0]?.level).toBe('error');
    expect(r.errors).toBeGreaterThanOrEqual(3);
    // the gentle units before it are untouched
    for (const id of ['u0', 'u1', 'u2', 'u3']) expect(r.findings.filter((f) => f.unit === id && f.check !== 'recycling')).toEqual([]);
  });

  it('a cliff of more than 6 points below the previous three is a warning, of more than 12 an error', () => {
    const three = gentleUnits(3);
    const small = report([...three, { id: 'dip', doc: gappy('dip', 100, 11) }]); // 89 % after three units at ~96 %
    expect(byCheck(small.findings, 'cliff', 'dip').map((f) => f.level)).toEqual(['warning']);
    const big = report([...three, { id: 'dip', doc: gappy('dip', 100, 20) }]); // 80 %
    expect(byCheck(big.findings, 'cliff', 'dip').map((f) => f.level)).toEqual(['error']);
    const none = report([...three, { id: 'dip', doc: gappy('dip', 100, 5) }]); // 95 %: within 6 points
    expect(byCheck(none.findings, 'cliff', 'dip')).toEqual([]);
    // fewer than three earlier units: no cliff is judged
    expect(byCheck(report([...gentleUnits(2), { id: 'dip', doc: gappy('dip', 100, 20) }]).findings, 'cliff')).toEqual([]);
  });

  it('a unit whose new words never recur gets the recycling warning (and only a warning)', () => {
    const r = report(gentleUnits(9, false));
    const recycling = byCheck(r.findings, 'recycling');
    expect(recycling.map((f) => f.unit)).toEqual(['u0', 'u1', 'u2']); // only units with a full 6-unit window after them are judged
    expect(recycling.every((f) => f.level === 'warning')).toBe(true);
    expect(r.errors).toBe(0);
    expect(r.rows[0].recycled).toBe(0);
  });

  it('a stage that is mostly Scripture gets the warning; a stage with a quarter of it does not', () => {
    const mostly = gentleUnits(4, true, () => 'a1-1');
    for (const i of [0, 1, 2]) mostly[i] = { ...mostly[i], domain: 'scripture', doc: { ...gentle(i), contentType: 'scripture' } as CorpusDocument };
    const r = report(mostly);
    const f = byCheck(r.findings, 'scripture-share');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ unit: 'a1-1', level: 'warning' });
    expect(r.stages[1].scriptureShare).toBeGreaterThan(0.7);
    expect(r.rows[0].scripture).toBe(true);

    const some = gentleUnits(4, true, () => 'a1-1');
    some[0] = { ...some[0], doc: { ...gentle(0), contentType: 'scripture' } as CorpusDocument };
    const r2 = report(some);
    expect(byCheck(r2.findings, 'scripture-share')).toEqual([]);
    expect(r2.stages[1].scriptureShare).toBeCloseTo(0.25, 1);
  });

  it('the first-two-units allowance: 82 % is a warning at position 0, an error at position 3', () => {
    const first = report([{ id: 'low', doc: gappy('low', 100, 18) }, ...gentleUnits(3).map((u, i) => ({ ...u, id: `x${i}` }))]);
    expect(first.rows[0].cov3).toBeGreaterThan(FIRST_UNITS_ALLOWANCE.error);
    expect(first.rows[0].cov3).toBeLessThan(FIRST_UNITS_ALLOWANCE.warn);
    expect(first.rows[0].allowance).toBe(true);
    expect(byCheck(first.findings, 'coverage', 'low').map((f) => f.level)).toEqual(['warning']);

    const late = report([...gentleUnits(3), { id: 'low', doc: gappy('low', 100, 18) }]);
    expect(late.rows[3].allowance).toBe(false);
    expect(byCheck(late.findings, 'coverage', 'low').map((f) => f.level)).toEqual(['error']);

    const below = report([{ id: 'verylow', doc: gappy('verylow', 100, 25) }]);
    expect(byCheck(below.findings, 'coverage', 'verylow').map((f) => f.level)).toEqual(['error']); // 75 % < 78 %
  });

  it('authentic units have their own error floor (88 %) and controlled / adapted units 85 %', () => {
    const three = gentleUnits(3);
    const asKind = (kind: LadderKind) => report([...three, { id: 'k', kind, doc: gappy('k', 100, 13) }]);
    expect(byCheck(asKind('authentic').findings, 'coverage', 'k').map((f) => f.level)).toEqual(['error']); // 87 %
    expect(byCheck(asKind('controlled').findings, 'coverage', 'k').map((f) => f.level)).toEqual(['warning']);
    expect(byCheck(asKind('adapted').findings, 'coverage', 'k').map((f) => f.level)).toEqual(['warning']);
  });

  it('too many new lemmas per 100 words warns above 5 and fails above 9', () => {
    const fresh = (n: number): CorpusDocument => doc('f', [...cyc(K, 100 - n, 4), ...U.slice(8, 8 + n)]);
    const run = (n: number) => report([...gentleUnits(3), { id: 'f', doc: fresh(n) }]);
    // coverage drops with each new word, so look at the new-lemmas check only
    expect(byCheck(run(4).findings, 'new-lemmas', 'f')).toEqual([]);
    expect(byCheck(run(7).findings, 'new-lemmas', 'f').map((f) => f.level)).toEqual(['warning']);
    expect(byCheck(run(11).findings, 'new-lemmas', 'f').map((f) => f.level)).toEqual(['error']);
  });

  it('an unreadable unit is reported, not thrown: warning for a missing authentic text, errors otherwise', () => {
    const l = ladderOf(gentleUnits(2));
    l.units.push({ unit: { id: 'a', stage: 'a1-1', kind: 'authentic', textId: 'text:es:nope', domain: 'narrative' }, status: 'missing', problem: 'absent' });
    l.units.push({ unit: { id: 'c', stage: 'a1-1', kind: 'controlled', document: 'units/c.json', domain: 'narrative' }, status: 'missing', problem: 'document not found' });
    l.units.push({ unit: { id: 'd', stage: 'a1-1', kind: 'adapted', document: 'units/d.json', domain: 'narrative' }, status: 'invalid', problem: 'bad json' });
    const r = measureLadder('es', l, { adapter });
    expect(byCheck(r.findings, 'missing-text', 'a')[0]?.level).toBe('warning');
    expect(byCheck(r.findings, 'missing-document', 'c')[0]?.level).toBe('error');
    expect(byCheck(r.findings, 'invalid-document', 'd')[0]?.level).toBe('error');
    expect(r.rows[2].words).toBe(0);
  });
});

// ───────────────────────────── the loader ─────────────────────────────

describe('loadLadder', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ladder-test-'));
  afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });
  const write = (rel: string, data: unknown): void => {
    const f = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data));
  };

  it('resolves a document by a path relative to the ladder folder, also outside units/ (an in-place reference); refuses a path that leaves the repository', () => {
    write('data/corpus/es/draft-01.json', gentle(0));
    write('data/ladder/es/units/own.json', gentle(1));
    write('outside.json', gentle(2));
    write('data/ladder/es/ladder.json', {
      lang: 'es', version: 1, after: 'stage0',
      units: [
        { id: 'in-place', stage: 'a1-1', kind: 'controlled', document: '../../corpus/es/draft-01.json', domain: 'narrative' },
        { id: 'own', stage: 'a1-1', kind: 'adapted', document: 'units/own.json', domain: 'conversation' },
        { id: 'escape', stage: 'a1-1', kind: 'controlled', document: '../../../../outside.json', domain: 'narrative' },
        { id: 'absolute', stage: 'a1-1', kind: 'controlled', document: path.join(tmp, 'outside.json'), domain: 'narrative' },
        { id: 'absent', stage: 'a1-1', kind: 'controlled', document: 'units/absent.json', domain: 'narrative' },
        { id: 'lib', stage: 'b1-bridge', kind: 'authentic', textId: 'text:es:definitely-not-a-real-text', domain: 'narrative' },
      ],
    });
    const loaded = loadLadder('es', tmp);
    const status = Object.fromEntries(loaded.units.map((u) => [u.unit.id, u.status]));
    expect(status).toEqual({ 'in-place': 'ok', own: 'ok', escape: 'invalid', absolute: 'invalid', absent: 'missing', lib: 'missing' });
    expect(loaded.units[0].doc?.id).toBe('g0');
    expect(loaded.units[2].problem).toMatch(/leaves the repository root/);
    expect(loaded.head).toEqual([]); // no data/stage0 in the temp root
    const r = measureLadder('es', loaded, { adapter });
    expect(r.rows[0].words).toBeGreaterThan(80);
    expect(byCheck(r.findings, 'invalid-document').map((f) => f.unit)).toEqual(['escape', 'absolute']);
    expect(byCheck(r.findings, 'missing-document').map((f) => f.unit)).toEqual(['absent']);
    expect(byCheck(r.findings, 'missing-text', 'lib')[0]?.level).toBe('warning'); // library absent: a warning, never a crash
  });

  it('rejects a malformed ladder file with every problem listed', () => {
    expect(() => parseLadder({ lang: 'de', version: 'x', units: [{ id: 'a', stage: 'z9', kind: 'authentic' }, { id: 'a' }] }, 'es')).toThrow(LadderFormatError);
    let problems: string[] = [];
    try { parseLadder({ lang: 'es', version: 1, units: [{ id: 'a', stage: 'a1-1', kind: 'controlled', domain: 'x' }, { id: 'a', stage: 'a1-1', kind: 'authentic', domain: 'x' }] }, 'es'); } catch (e) {
      problems = (e as LadderFormatError).problems;
    }
    expect(problems).toHaveLength(3);
    expect(problems.join('|')).toMatch(/needs a document path/);
    expect(problems.join('|')).toMatch(/duplicate unit id/);
    expect(problems.join('|')).toMatch(/needs a textId/);
    expect(LADDER_STAGES).toContain('b1-bridge');
    expect(() => loadLadder('hi', tmp)).toThrow(LadderFormatError); // no ladder file for hi
  });

  it('reads Stage 0 scenes as the head of the ladder, once each, from the repository', () => {
    const head = loadStage0Head('es', root);
    expect(head.length).toBeGreaterThan(5);
    expect(new Set(head.map((h) => h.id)).size).toBe(head.length);
    const r = measureLadder('es', { ladder: { lang: 'es', version: 1, after: 'stage0', units: [] }, head, units: [] }, { adapter });
    expect(r.head.words).toBeGreaterThan(100);
    expect(r.stages[0]).toMatchObject({ stage: 'stage0', units: head.length });
  });
});

// ───────────────────────────── ladder:place ─────────────────────────────

describe('placeCandidate (ladder:place)', () => {
  // u1 introduces the U[0..4] words twice, u2 repeats them twice: known (>= 3) only after u2
  const n1 = U.slice(0, 5);
  const units: UnitSpec[] = [
    { id: 'u0', doc: doc('u0', cyc(K, 80, 2)) },
    { id: 'u1', doc: doc('u1', [...cyc(K, 60, 5), ...n1, ...n1]) },
    { id: 'u2', doc: doc('u2', [...cyc(K, 60, 9), ...n1, ...n1]) },
    { id: 'u3', doc: doc('u3', cyc(K, 80, 1)) },
  ];

  it('returns the first unit after which the candidate is >= 95 % known', () => {
    const candidate = doc('cand', [...cyc(K, 70, 6), ...n1, ...n1, ...n1]);
    const p = placeCandidate(ladderOf(units), candidate, { adapter });
    expect(p.steps.map((s) => s.after)).toEqual(['stage0', 'u0', 'u1', 'u2', 'u3']);
    expect(p.steps[2].cov3).toBeLessThan(0.95);
    expect(p.steps[3].cov3).toBeGreaterThanOrEqual(0.95);
    expect(p.enterAfter).toBe('u2');
    expect(p.verdict).toMatch(/^could enter after u2/);
  });

  it('can enter right after Stage 0 when nothing in it is new', () => {
    const p = placeCandidate(ladderOf(units), doc('easy', cyc(K, 50, 3)), { adapter });
    expect(p.enterAfter).toBe('stage0');
  });

  it('says "library, not ladder" with the best coverage when it never reaches 95 %', () => {
    const p = placeCandidate(ladderOf(units), doc('hard', [...cyc(K, 60, 0), ...W]), { adapter });
    expect(p.enterAfter).toBeUndefined();
    expect(p.verdict).toMatch(/^library, not ladder \(best: \d+\.\d %/);
    expect(p.verdict).toMatch(/after the last unit\)$/);
    expect(p.best.cov3).toBeLessThan(0.95);
  });
});
