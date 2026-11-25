/**
 * The Arabic regression and development fixtures (test/fixtures/arabic), in two parts.
 *
 *  1. Shape (always runs): ids unique, every lemma already in the one headword spelling (arHeadForm leaves it unchanged), every target
 *     occurs in its text, parts concatenate to the key of the word they cut, parts of speech and feature keys are in the allowed sets,
 *     the development sets are consistent and the harness' comparison rules do what they say (tiny hand-made inputs).
 *  2. The analyser (skipped until one exists): the regression table of docs/arabic/EVAL.md, one reported test per case. A case that
 *     fails is NEVER deleted or weakened: it is listed in EVAL.md as an open failure.
 *
 * The fixtures were written from grammar knowledge BEFORE the analyser read them (see the `frozen` date in each file); the
 * msa-dev sets are machine-written and machine-annotated development data, not a human gold standard.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AnalysisCandidate, RawToken } from '../../src/core';
import { arHeadForm, arKey, arTokenize } from '../../src/adapters/arabic/text';
import {
  BUCKWALTER, checkCase, featureProblems, fromBuckwalter, installIndex, lemmaLetters, lemmaSame, loadArabicAnalyser, loadMsa, loadRegression, posMatch, judgeRegression, OPEN_FAILURES_FILE, type OpenFailures,
  scoreToken, Tally, targetIndex, FEATURE_KEYS, UPOS, type GoldToken, type RegressionCase,
} from '../../scripts/ar-eval.mts';

const cases = loadRegression();
const dev = loadMsa(false);
const devVoc = loadMsa(true);

// ───────────────────────────── 1. shape ─────────────────────────────

describe('regression fixture: shape', () => {
  it('holds the owner\'s table and the builder\'s own cases, ids unique', () => {
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    expect(cases.filter((c) => c.source === 'owner').length).toBeGreaterThanOrEqual(36);
    expect(cases.filter((c) => c.source === 'builder').length).toBeGreaterThanOrEqual(40);
    expect(cases.length).toBeLessThanOrEqual(100);
  });

  it('is frozen and says what it is', () => {
    const raw = JSON.parse(fs.readFileSync(path.resolve('test/fixtures/arabic/regression.json'), 'utf8')) as { frozen: string; _about: string };
    expect(raw.frozen).toBe('2026-11-25');
    expect(raw._about).toMatch(/never from analyser output/i);
  });

  for (const c of cases) {
    it(`${c.id}: well formed`, () => {
      const e = c.expect;
      expect(c.text.length).toBeGreaterThan(0);
      expect(arTokenize(c.text).some((t) => t.isWord && arKey(t.surface) === arKey(c.target)), 'the target is a word of the text').toBe(true);
      expect(c.note.length).toBeGreaterThan(5);
      if (e.lemma) expect(arHeadForm(e.lemma, e.pos ?? 'NOUN').normalize('NFC'), `lemma ${e.lemma} is in the headword spelling`).toBe(e.lemma);
      if (e.lemma) expect(e.pos, 'a lemma comes with its part of speech').toBeTruthy();
      for (const p of [e.pos, ...(e.posAlt ?? [])]) if (p) expect(UPOS.has(p), `UPOS ${p}`).toBe(true);
      for (const [k, v] of Object.entries(e.features ?? {})) {
        expect(FEATURE_KEYS.has(k), `feature key ${k}`).toBe(true);
        expect(v).toMatch(/^[A-Za-z0-9]+(,[A-Za-z0-9]+)*$/);
      }
      if (e.parts) {
        expect(e.parts.map((p) => arKey(p.text)).join(''), 'parts concatenate to the key of the target').toBe(arKey(c.target));
        for (const p of e.parts) expect(['prefix', 'stem', 'suffix']).toContain(p.role);
        expect(e.parts.filter((p) => p.role === 'stem')).toHaveLength(1);
      }
      for (const l of [...(e.alsoReadings ?? []), ...(e.notLemma ? [e.notLemma] : []), ...(e.restored ? [e.restored] : [])]) {
        expect(arHeadForm(l, 'NOUN').normalize('NFC') === l || arHeadForm(l, 'VERB').normalize('NFC') === l, `${l} in the headword spelling`).toBe(true);
      }
      if (e.undecided) { expect(e.lemma).toBeNull(); expect(e.alsoReadings?.length, 'an undecided case names its rival readings').toBeGreaterThanOrEqual(1); }
      if (e.notArabic || e.dialect) expect(e.lemma).toBeNull();
      if (e.root) expect(e.root).toMatch(/^[^\s]( [^\s]){2,3}$/u);
    });
  }

  it('covers everything the owner named', () => {
    const has = (re: RegExp): boolean => cases.some((c) => re.test(c.id));
    for (const re of [/kataba/, /katabtu/, /katabna/, /taktubu/, /yaktubuna/, /lam-yaktub/, /lan-yaktuba/, /kutiba/, /qala/, /qul/, /yaidu/, /irmi/, /istaghfara/, /taallama/, /kutub/, /muallimuna/, /muallimat/, /kitabani/, /kitabayni/, /kitab-altalib/, /kitabuhu/, /bilkitabi/, /lilbayti/, /wajada/, /raahu/, /alshams/, /alqamar/, /ktb/, /wbalktab/, /fsyktbwnha/, /ilm-bare/]) {
      expect(has(re), String(re)).toBe(true);
    }
    for (const f of ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']) expect(has(new RegExp(`w-form-${f}$`)), `Form ${f}`).toBe(true);
    for (const t of ['hollow', 'defective', 'assimilated', 'geminate', 'hamzated']) expect(has(new RegExp(t)), t).toBe(true);
    for (const m of ['perfect', 'imperfect', 'imperative']) expect(cases.filter((c) => c.id.includes(m)).length, m).toBeGreaterThanOrEqual(3);
    for (const re of [/kana/, /laysa/, /w-inna/, /alayhi/, /lahu/, /minni/, /katabahu/, /trap-bayt/, /trap-kull/, /trap-walad/, /trap-faqad/, /trap-laha/, /trap-wahum/, /trap-fahm/, /trap-kama/, /ta-marbuta/, /hamza-perfect/, /hamza-imperfect/, /hamza-noun/, /hamza-passive/, /loose-akala/, /loose-ila/, /loose-madrasa/, /participle-katib/, /participle-maktub/, /persian/, /dialect/]) {
      expect(has(re), String(re)).toBe(true);
    }
    expect(cases.filter((c) => /persian/.test(c.id)).some((c) => /[پچگ]/.test(c.text))).toBe(true);
  });

  it('keeps Person "2,3" as ONE reading for تَكْتُبُ and Case "Acc,Gen" for the dual', () => {
    expect(cases.find((c) => c.id === 'o04-taktubu')!.expect).toMatchObject({ features: { Person: '2,3' }, oneReading: true });
    expect(cases.find((c) => c.id === 'o19-kitabayni')!.expect.features).toMatchObject({ Case: 'Acc,Gen' });
  });
});

describe('development sets: shape', () => {
  it('msa-dev: sentences and tokens in range, tokens consistent with the sentence text', () => {
    const tokens = dev.reduce((n, s) => n + s.tokens.length, 0);
    expect(dev.length).toBeGreaterThanOrEqual(60);
    expect(dev.length).toBeLessThanOrEqual(80);
    expect(tokens).toBeGreaterThanOrEqual(700);
    expect(new Set(dev.map((s) => s.id)).size).toBe(dev.length);
    for (const s of [...dev, ...devVoc]) {
      const words = arTokenize(s.text).filter((t) => t.isWord);
      expect(words.map((w) => w.surface), s.id).toEqual(s.tokens.map((t) => t.surface));
    }
  });

  it('every token: UPOS, lemma in the headword spelling or skipped, parts concatenate to the word', () => {
    for (const s of [...dev, ...devVoc]) {
      for (const t of s.tokens) {
        const where = `${s.id} ${t.surface}`;
        expect(UPOS.has(t.pos), `${where}: UPOS ${t.pos}`).toBe(true);
        if (t.skip) expect(t.lemma, where).toBeNull();
        else {
          expect(t.lemma, where).toBeTruthy();
          expect(arHeadForm(t.lemma!, t.pos).normalize('NFC'), `${where}: lemma ${t.lemma} is in the headword spelling`).toBe(t.lemma);
        }
        if (t.parts) {
          expect(t.parts.join(''), where).toBe(arKey(t.surface));
          expect(t.parts.length, where).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it('msa-dev is unvocalized, msa-dev-vocalized is a vocalized subset with the same annotation', () => {
    const hasMarks = (s: string): boolean => /[ً-ْ]/.test(s);
    expect(dev.some((s) => hasMarks(s.text))).toBe(false);
    expect(devVoc.length).toBeGreaterThanOrEqual(12);
    const byId = new Map(dev.map((s) => [s.id, s]));
    for (const v of devVoc) {
      expect(hasMarks(v.text), v.id).toBe(true);
      const base = byId.get(v.of!);
      expect(base, v.id).toBeTruthy();
      expect(v.tokens.map((t) => [arKey(t.surface), t.lemma, t.pos])).toEqual(base!.tokens.map((t) => [arKey(t.surface), t.lemma, t.pos]));
    }
  });

  it('the files state what they are: machine-written, not human gold, frozen before the analyser read them', () => {
    for (const f of ['msa-dev.json', 'msa-dev-vocalized.json']) {
      const raw = JSON.parse(fs.readFileSync(path.resolve('test/fixtures/arabic', f), 'utf8')) as { _about: string; frozen: string };
      expect(raw._about).toMatch(/MACHINE-WRITTEN and MACHINE-ANNOTATED/);
      expect(raw._about).toMatch(/NOT a human gold standard/);
      expect(raw._about).toMatch(/FROZEN on 2026-11-25/);
      expect(raw._about).toMatch(/independent auditor/);
      expect(raw.frozen).toBe('2026-11-25');
    }
  });
});

// ───────────────────────────── the harness' own rules ─────────────────────────────

const cand = (over: Partial<AnalysisCandidate>): AnalysisCandidate => ({ morph: {}, confidence: 0.9, ...over });

describe('harness: comparison and scoring rules', () => {
  it('lemmas are compared through the one headword spelling, strictly', () => {
    expect(lemmaSame('كِتاب', 'كِتَاب', 'NOUN')).toBe(true);
    expect(lemmaSame('كِتَابٌ', 'كِتَاب', 'NOUN')).toBe(true);
    expect(lemmaSame('كَتَبَ', 'كُتِبَ', 'VERB')).toBe(false);
    expect(lemmaSame('عِلْم', 'عَلَم', 'NOUN')).toBe(false);
    expect(lemmaLetters('عِلْم', 'عَلَم')).toBe(true);
    expect(lemmaSame(undefined, 'عِلْم', 'NOUN')).toBe(false);
  });

  it('features are subsets and a union compares as a set', () => {
    expect(featureProblems({ Person: '3,2', Number: 'Sing', Mood: 'Ind' }, { Person: '2,3' })).toEqual([]);
    expect(featureProblems({ Person: '3' }, { Person: '2,3' })).toHaveLength(1);
    expect(featureProblems({ Number: 'Sing' }, { Case: 'Nom' })).toEqual(['Case: expected Nom, absent']);
    expect(featureProblems(undefined, undefined)).toEqual([]);
  });

  it('parts of speech: the index says CONJ and PART where UD says SCONJ, AUX is a verb', () => {
    expect(posMatch('SCONJ', 'CONJ')).toBe(true);
    expect(posMatch('CCONJ', 'PART')).toBe(true);
    expect(posMatch('AUX', 'VERB')).toBe(true);
    expect(posMatch('NOUN', 'ADJ')).toBe(false);
    expect(posMatch('NOUN', 'ADJ', true)).toBe(true);
    expect(posMatch('VERB', undefined)).toBe(false);
  });

  it('checkCase: a decided case needs the lemma and confidence; an undecided one needs low confidence and the rival readings', () => {
    const decided = cases.find((c) => c.id === 'o01-kataba')!;
    const okTop = cand({ lemma: 'كَتَبَ', pos: 'VERB', morph: { Aspect: 'Perf', Person: '3', Gender: 'Masc', Number: 'Sing', Voice: 'Act', Form: 'I' }, notes: { root: 'ك ت ب' } });
    expect(checkCase(decided, [okTop])).toEqual([]);
    expect(checkCase(decided, [{ ...okTop, lemma: 'كُتُب' }]).join()).toMatch(/lemma/);
    expect(checkCase(decided, [{ ...okTop, confidence: 0.4 }]).join()).toMatch(/undecided/);
    expect(checkCase(decided, []).join()).toMatch(/no reading/);
    const und = cases.find((c) => c.id === 'o28-ktb')!;
    const rivals = [cand({ lemma: 'كَتَبَ', pos: 'VERB', confidence: 0.45 }), cand({ lemma: 'كِتَاب', pos: 'NOUN', confidence: 0.4 })];
    expect(checkCase(und, rivals)).toEqual([]);
    expect(checkCase(und, [{ ...rivals[0], confidence: 0.9 }, rivals[1]]).join()).toMatch(/credited/);
    expect(checkCase(und, [rivals[0]]).join()).toMatch(/not in the list/);
    const persian = cases.find((c) => c.id === 'w-persian-goft')!;
    expect(checkCase(persian, [])).toEqual([]);
    expect(checkCase(persian, [cand({ lemma: 'كَفَتَ', pos: 'VERB', confidence: 0.9 })]).join()).toMatch(/read as Arabic/);
    const dial = cases.find((c) => c.id === 'w-dialect-egyptian')!;
    expect(checkCase(dial, [cand({ lemma: 'x', confidence: 0.4, notes: { variety: 'dialect?' } })])).toEqual([]);
    expect(checkCase(dial, [cand({ lemma: 'x', confidence: 0.4 })]).join()).toMatch(/dialect\?/);
  });

  it('checkCase: parts compare by key and kind; a whole word must not be cut', () => {
    const c = cases.find((x) => x.id === 'o29-wbalktab')!;
    const mk = (texts: Array<[string, string]>): AnalysisCandidate => cand({ lemma: 'كِتَاب', pos: 'NOUN', morph: { Definite: 'Def' }, parts: texts.map(([t, k], i) => ({ text: t, start: i, end: i + 1, kind: k as 'prefix' })) });
    expect(checkCase(c, [mk([['و', 'prefix'], ['بِ', 'prefix'], ['ال', 'prefix'], ['كتاب', 'stem']])])).toEqual([]);
    expect(checkCase(c, [mk([['وب', 'prefix'], ['ال', 'prefix'], ['كتاب', 'stem']])]).join()).toMatch(/parts/);
    const whole = cases.find((x) => x.id === 'w-trap-bayt')!;
    expect(checkCase(whole, [cand({ lemma: 'بَيْت', pos: 'NOUN', parts: [{ text: 'ب', start: 0, end: 1, kind: 'prefix' }, { text: 'يت', start: 1, end: 3, kind: 'stem' }] })]).join()).toMatch(/cut/);
    expect(checkCase(whole, [cand({ lemma: 'بَيْت', pos: 'NOUN' })])).toEqual([]);
  });

  it('scoreToken counts undecided, confident-and-wrong and clitic breakdowns separately', () => {
    const t = new Tally();
    const fails: never[] = [];
    const g = (lemma: string, pos = 'NOUN', parts?: string[]): GoldToken => ({ surface: lemma, lemma, pos, ...(parts ? { parts } : {}) });
    scoreToken(t, g('كِتَاب'), [cand({ lemma: 'كِتَاب', pos: 'NOUN' })], 's', '1', fails);
    scoreToken(t, g('كِتَاب'), [cand({ lemma: 'كُتُب', pos: 'NOUN', confidence: 0.9 })], 's', '2', fails);
    scoreToken(t, g('كِتَاب'), [cand({ lemma: 'كَتَبَ', pos: 'VERB', confidence: 0.4 }), cand({ lemma: 'كِتَاب', pos: 'NOUN', confidence: 0.3 })], 's', '3', fails);
    scoreToken(t, g('كِتَاب'), [], 's', '4', fails);
    scoreToken(t, { surface: 'x', lemma: null, pos: 'NOUN', skip: true }, [], 's', '5', fails);
    expect(t.tokens).toBe(4);
    expect(t.strict).toBe(1);
    expect(t.letters).toBe(1);
    expect(t.anywhereLetters).toBe(2);
    expect(t.confidentWrong).toBe(1);
    expect(t.undecided).toBe(1);
    expect(t.anywhere).toBe(2);
    expect(t.unknown).toBe(1);
    const p = new Tally();
    scoreToken(p, g('كِتَاب', 'NOUN', ['ال', 'كتاب']), [cand({ lemma: 'كِتَاب', pos: 'NOUN', parts: [{ text: 'ال', start: 0, end: 2, kind: 'prefix' }, { text: 'كتاب', start: 2, end: 6, kind: 'stem' }] })], 's', '6', fails);
    expect([p.partsTotal, p.partsRight]).toEqual([1, 1]);
  });

  it('targetIndex finds the first word with the target\'s key, marks ignored', () => {
    const toks: RawToken[] = arTokenize('لَمْ يَكْتُبْ');
    expect(targetIndex(toks, 'يكتب')).toBe(1);
    expect(targetIndex(toks, 'قال')).toBe(-1);
  });

  it('the Buckwalter table is the standard one (a corpus file in transliteration is read with it)', () => {
    expect(fromBuckwalter('ktAb')).toBe('كتاب');
    expect(fromBuckwalter('kitAbN')).toBe('\u0643\u0650\u062A\u0627\u0628\u064C');
    expect(fromBuckwalter('>kl')).toBe('أكل');
    expect(fromBuckwalter('ma$o')).toBe('مَشْ');
    expect(Object.keys(BUCKWALTER)).toHaveLength(new Set(Object.values(BUCKWALTER)).size);
  });
});

// ───────────────────────────── 2. the analyser (a ratchet) ─────────────────────────────

/*
 * The open failures are recorded in test/fixtures/arabic/open-failures.json for ONE configuration: the compiled core plus the full
 * shards of public/lexicon/ar/standard, with the best analyser that exists (adapter, then arAnalyze, then arWordCandidates). A case
 * not in the list must pass; a case in the list must still fail (a fix forces its entry out). When the shards are absent (a CI
 * checkout) this part is skipped entirely and only the shape checks above run. Re-record: npx vite-node --config
 * scripts/vite.config.ts scripts/ar-eval.mts -- --write-open
 */
const shards = fs.existsSync(path.resolve('public/lexicon/ar/standard/manifest.json'));
let judged: Map<string, string[]> | undefined;
let analyserKind = '';
const analyser = shards ? await loadArabicAnalyser('auto').catch(() => undefined) : undefined;
const open = JSON.parse(fs.readFileSync(path.resolve(OPEN_FAILURES_FILE), 'utf8')) as OpenFailures;

describe.skipIf(!analyser)('regression table through the analyser (ratchet against open-failures.json)', () => {
  beforeAll(async () => {
    await installIndex('full');
    analyserKind = analyser!.kind;
    judged = await judgeRegression(analyser!.run);
  }, 180_000);

  it('summary: prints the open failures', () => {
    const n = [...judged!.values()].filter((p) => p.length).length;
    console.log(`arabic regression: ${n} open of ${cases.length} (recorded ${Object.keys(open.cases).length}; analyser ${analyserKind}, recorded with ${open.analyser}, ${open.date})`);
    expect(open.index).toBe('full');
  });

  for (const c of cases as RegressionCase[]) {
    it(`${c.id}: ${c.note.split(':')[0].slice(0, 70)}`, () => {
      const problems = judged!.get(c.id) ?? ['not judged'];
      if (open.cases[c.id]) expect(problems.length, `case ${c.id} now passes: remove it from open-failures.json (re-record with --write-open)`).toBeGreaterThan(0);
      else expect(problems, `${c.id} fails and is not in open-failures.json`).toEqual([]);
    });
  }

  it('open-failures.json lists only real cases', () => {
    const ids = new Set(cases.map((c) => c.id));
    for (const id of Object.keys(open.cases)) expect(ids.has(id), id).toBe(true);
  });
});
