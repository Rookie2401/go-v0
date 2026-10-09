/**
 * Linguistic accuracy audit, part 2: the layers on top of the adapter. Same fixture, same caveat: the expectations and the
 * judgements below are a language MODEL's, not a native speaker's. Floors are "no worse than the first measurement"
 * (2026-10-09, adapter-sq@9); they are not targets. Write-up: docs/ecosystem/audit/LINGUISTIC-ACCURACY.md.
 */
import { describe, expect, it } from 'vitest';
import { SQ_CONSTRUCTIONS } from '../../src/adapters/albanian/constructions';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { albanianManifest } from '../../packages/language-packs/src';
import { BUILDERS } from '../../packages/goreview/src/exercises';
import { FAMILY_DIMENSION } from '../../packages/goreview/src/types';
import type { ExerciseFamily } from '../../packages/goreview/src/types';
import { ctxOf, makeWorld, target } from '../goreview/exercises/support';
import {
  REVIEW_SELECTIONS, buildReviewSample, reviewAvailability, runCards, runProduction, runResolver, summarizeCards, summarizeProduction, summarizeResolver,
} from './linguistic.layers';
import { loadFixture, runAdapter } from './linguistic.measure';

const fx = loadFixture();
const res = runAdapter(fx);

// ───────────────────────────── Repository resolver ─────────────────────────────
describe('Repository resolver statuses (323 words, each resolved in its sentence)', () => {
  const sum = summarizeResolver(runResolver(res));
  it('never claims "verified": every source is machine-drafted, so no reading may be vouched for by a person', () => {
    expect(sum.verifiedCount).toBe(0);
  });
  it('"high-confidence" is almost always right and is wrong at most once in 109 (the first measurement: u60 "ne" typed without ë)', () => {
    expect(sum.byStatus['high-confidence'].n).toBeGreaterThanOrEqual(109);
    expect(sum.highConfidenceWrong).toBeLessThanOrEqual(1);
  });
  it('the chosen reading is right at least as often as at the first measurement (304 of 323)', () => {
    expect(sum.overall.n).toBeGreaterThanOrEqual(304);
    expect(sum.byStatus.provisional.correct).toBeGreaterThanOrEqual(121);
  });
  it('"conflicted" is conservative: 75 of 88 conflicted words had a right top reading (it withholds exercises from them)', () => {
    expect(sum.byStatus.conflicted.correct).toBeGreaterThanOrEqual(75);
    // calibration honesty: a conflicted status is not a wrong reading
    expect(sum.byStatus.conflicted.correct / sum.byStatus.conflicted.n).toBeGreaterThan(0.8);
  });
});

// ───────────────────────────── extension card ─────────────────────────────
describe('GoLearn extension card (lemma, POS, features, explanations)', () => {
  const rows = runCards(res);
  const sum = summarizeCards(rows);
  it('shows the adapter\'s top reading: the card is right exactly as often as the adapter (304 of 323) and never disagrees with its lemma', () => {
    expect(sum.correct.n).toBeGreaterThanOrEqual(304);
    expect(sum.cardLemmaDiffersFromAdapterTop).toBe(0);
  });
  it('names the right construction for all 28 definite nouns that are nominative, accusative or plural', () => {
    expect(sum.explanation.definiteNouns).toBeGreaterThanOrEqual(28);
    expect(sum.explanation.correct).toBeGreaterThanOrEqual(28);
    expect(sum.explanation.wrong).toBe(0);
  });
  it('but its "accusative = direct object" explanation is shown on an accusative that is NOT an object (u62 "në shtëpinë tonë"): not worse than once', () => {
    expect(sum.explanation.accusativeExplanationOnNonObject).toBeLessThanOrEqual(1);
  });
});

// ───────────────────────────── explanations (judged by reading) ─────────────────────────────
type Verdict = 'correct' | 'imprecise' | 'wrong' | 'unsure';
/** The audit author's reading of every explanation text a learner can be shown. Anything not listed fails the inventory test below. */
const IMPRECISE: Record<string, string> = {
  'pack:construction:definite-accusative-singular': 'says the -in/-n ending "marks a definite masculine noun as the direct object"; the accusative is also the case after në, për, me … (and masculine -un is missing: mikun)',
  'pack:construction:definite-nominative-singular': '"That ending alone tells you it is definite and the subject" over-claims: vajza can be the plural "girls"; the nominative also marks a predicate noun and the noun after nga / te',
  'parser:form:definite-accusative-singular': '"marks a definite noun as the direct object" is shown on every accusative; wrong for "në shtëpinë tonë"',
  'parser:form:definite-nominative-singular': '"marks a definite noun as the subject": also a predicate noun, and the noun after nga / te / tek',
};
const UNSURE: Record<string, string> = {
  'adapter:construction:nominative-after-preposition': 'nga + nominative is stated as a rule; grammars differ on nga (nominative or ablative); a model cannot settle it',
};
const verdictOf = (key: string): Verdict => (IMPRECISE[key] ? 'imprecise' : UNSURE[key] ? 'unsure' : 'correct');

describe('explanation texts (pack, adapter constructions, extension card) judged by reading', () => {
  const m = albanianManifest();
  const parserIds = ['definite-accusative-singular', 'definite-nominative-singular', 'definite-plural'];
  const inventory = [
    ...m.grammar.features.map((f) => `pack:feature:${f.key}`),
    ...m.grammar.constructions.map((c) => `pack:construction:${c.id}`),
    ...SQ_CONSTRUCTIONS.map((c) => `adapter:construction:${c.key}`),
    ...parserIds.map((id) => `parser:form:${id}`),
  ];
  it('every explanation has a judgement slot, and the imprecise / unsure ones still exist (a changed text must be re-read)', () => {
    expect(inventory.length).toBeGreaterThanOrEqual(10 + 8 + 31 + 3);
    for (const k of [...Object.keys(IMPRECISE), ...Object.keys(UNSURE)]) expect(inventory, k).toContain(k);
    const sentence = 'Libri është i mirë dhe e pashë librin dhe librat.';
    const seen = new Set<string>();
    for (const [surface, id] of [['Libri', 'definite-nominative-singular'], ['librin', 'definite-accusative-singular'], ['librat', 'definite-plural']] as const) {
      const card = parseSelection({ surface, context: { kind: 'sentence', confidence: 1, sentence, selStart: sentence.indexOf(surface), selEnd: sentence.indexOf(surface) + surface.length } });
      if (card.constructions.some((c) => c.id === id && c.source === 'form')) seen.add(id);
    }
    expect([...seen].sort()).toEqual([...parserIds].sort());
  });
  it('counts: of the inventory, 4 are imprecise, 1 unsure, none wrong, the rest read as correct', () => {
    const counts = { correct: 0, imprecise: 0, wrong: 0, unsure: 0 };
    for (const k of inventory) counts[verdictOf(k)] += 1;
    expect(counts.imprecise).toBe(4);
    expect(counts.unsure).toBe(1);
    expect(counts.wrong).toBe(0);
    expect(counts.correct).toBe(inventory.length - 5);
  });
});

// ───────────────────────────── production checker ─────────────────────────────
describe('writing correction (checkProduction): 20 sentences with ONE deliberate error each, 79 correct sentences', () => {
  const p = runProduction(fx);
  const sum = summarizeProduction(p);
  it('locates the error in at least as many sentences as at the first measurement (13 of 20), in the right category every time it fires', () => {
    expect(sum.located).toBeGreaterThanOrEqual(13);
    expect(sum.rightCategory).toBeGreaterThanOrEqual(13);
  });
  it('per category floors: case 5/5, article agreement 3/3, adjective agreement 2/2, negation 2/3, definiteness 1/4, clitic 0/3', () => {
    expect(sum.byCat.case.located).toBeGreaterThanOrEqual(5);
    expect(sum.byCat['agreement-article'].located).toBeGreaterThanOrEqual(3);
    expect(sum.byCat['agreement-adjective'].located).toBeGreaterThanOrEqual(2);
    expect(sum.byCat.negation.located).toBeGreaterThanOrEqual(2);
    expect(sum.byCat.definiteness.located).toBeGreaterThanOrEqual(1);
  });
  it('offers a correct fix whenever it offers one (9 of 9) — and offers one for 9 of 20', () => {
    expect(sum.withFix).toBeGreaterThanOrEqual(9);
    expect(sum.fixCorrect).toBeGreaterThanOrEqual(9);
    expect(sum.fixCorrect).toBe(sum.withFix);
  });
  it('raises nothing on the 79 correct sentences (the ten written for the purpose and the 69 unseen ones that are correct Standard Albanian)', () => {
    expect(sum.cleanSentences).toBe(79);
    expect(sum.falsePositives).toBe(0);
  });
  it('says nothing on clitic errors and on a misplaced nuk (documented as not built): they are not detected today', () => {
    // not a target: a record of the stated limit. If a check is added this expectation is the one to delete.
    const unbuilt = p.errors.filter((e) => ['e15', 'e16', 'e17', 'e20'].includes(e.id));
    expect(unbuilt.length).toBe(4);
  });
});

// ───────────────────────────── GoReview ─────────────────────────────
describe('GoReview exercises over the real Albanian pack facts', () => {
  it('builds exercises for 10 units and every key reads as right, except the two the audit judges wrong (a two-word "form" unit)', async () => {
    const { built } = await buildReviewSample();
    const units = new Set(built.map((b) => b.unit));
    expect(units.size).toBeGreaterThanOrEqual(10);
    expect(built.length).toBeGreaterThanOrEqual(39);
    // judged by reading: key correct unless listed here
    const WRONG = new Set(['form:sq:quhem sam|written-recognition', 'form:sq:quhem sam|meaning-to-form']);
    const NARROW = new Set(['phrase:sq:quhem__|phrase-comprehension']);
    const keyOf = (b: { unit: string; family: string }) => `${b.unit}|${b.family}`;
    for (const k of [...WRONG, ...NARROW]) expect(built.map(keyOf), k).toContain(k);
    const right = built.filter((b) => !WRONG.has(keyOf(b)) && !NARROW.has(keyOf(b)));
    expect(right.length).toBeGreaterThanOrEqual(36);
    // the keys that are right, spot-checked against the audit's own Albanian
    const key = (unit: string, family: string) => built.find((b) => b.unit === unit && b.family === family)?.accepted;
    expect(key('lemma:sq:libër:NOUN', 'written-recognition')).toEqual(['book']);
    expect(key('lemma:sq:libër:NOUN', 'meaning-to-form')).toEqual(['libër']);
    expect(key('form:sq:shkollë', 'morphological-identification')).toEqual(['accusative']); // Ana shkon në shkollë
    expect(key('form:sq:librin', 'morphological-identification')).toEqual(['libër']);
    expect(key('form:sq:libër', 'morphological-identification')).toEqual(['indefinite (“a …”)']); // Ajo ka një libër
    expect(key('lemma:sq:çaj:NOUN', 'grammar-application')).toEqual(['çaj']); // Burrat pinë çaj (indefinite)
  });

  it('refuses a conflicted form (nëna) in every family, and every provisional form for grammar and production questions', async () => {
    const w = makeWorld({ selections: REVIEW_SELECTIONS });
    const facts = await w.facts('form:sq:nëna');
    for (const fam of ['written-recognition', 'meaning-to-form', 'morphological-identification', 'grammar-application', 'sentence-completion'] as ExerciseFamily[]) {
      const r = (await BUILDERS[fam].build(target('form:sq:nëna', FAMILY_DIMENSION[fam]), facts, ctxOf())) as { unavailable?: boolean };
      expect(r.unavailable, fam).toBe(true);
    }
    const f2 = await w.facts('form:sq:çajin');
    const g = (await BUILDERS['grammar-application'].build(target('form:sq:çajin', FAMILY_DIMENSION['grammar-application']), f2, ctxOf())) as { unavailable?: boolean };
    expect(g.unavailable).toBe(true);
  });

  it('grading probes (31 typed answers, expected outcomes written by the audit): agrees on at least 24; marks "children", "the book", "they read" incorrect for inflected forms', async () => {
    const w = makeWorld({ selections: REVIEW_SELECTIONS });
    type Out = 'correct' | 'partial' | 'incorrect';
    const probes: Array<[string, ExerciseFamily, Array<[string, Out[]]>]> = [
      ['form:sq:fëmijët', 'written-recognition', [['children', ['correct']], ['the children', ['correct']], ['child', ['correct', 'partial']], ['kids', ['correct', 'partial']]]],
      ['form:sq:librin', 'written-recognition', [['the book', ['correct']], ['book', ['correct', 'partial']], ['a book', ['incorrect', 'partial']], ['books', ['incorrect']]]],
      ['form:sq:lexojnë', 'written-recognition', [['they read', ['correct']], ['read', ['correct', 'partial']], ['to read', ['correct', 'partial']], ['reads', ['incorrect', 'partial']]]],
      ['lemma:sq:libër:NOUN', 'meaning-to-form', [['libër', ['correct']], ['librin', ['incorrect']], ['liber', ['correct', 'partial']], ['libri', ['incorrect']], ['LIBËR', ['correct']]]],
      ['form:sq:shkollë', 'meaning-to-form', [['shkollë', ['correct']], ['shkolla', ['incorrect']], ['shkolle', ['correct', 'partial']], ['shkollën', ['incorrect']]]],
      ['form:sq:çaj', 'sentence-completion', [['çaj', ['correct']], ['çajin', ['incorrect']], ['caj', ['correct', 'partial']]]],
      ['form:sq:libër', 'morphological-identification', [['indefinite (“a …”)', ['correct']], ['definite (“the …”)', ['incorrect']]]],
      ['phrase:sq:quhem__', 'phrase-comprehension', [['my name is', ['correct']], ['my name is Sam', ['correct']], ['to be called', ['correct']], ['I am called', ['correct']], ['hello', ['incorrect']]]],
    ];
    let total = 0; let agree = 0; const disagree: string[] = [];
    for (const [unit, fam, answers] of probes) {
      const ex = (await BUILDERS[fam].build(target(unit, FAMILY_DIMENSION[fam]), await w.facts(unit), ctxOf())) as any;
      expect(ex.unavailable, unit).toBeUndefined();
      for (const [a, ok] of answers) {
        const g = BUILDERS[fam].grade(ex, ex.responseMode === 'choice' ? { choice: a, hinted: false, assistance: [] } : { typed: a, hinted: false, assistance: [] }, {} as never);
        total += 1;
        if ((ok as string[]).includes(g.outcome)) agree += 1; else disagree.push(`${unit} ${JSON.stringify(a)} -> ${g.outcome}`);
      }
    }
    expect(total).toBe(31);
    expect(agree).toBeGreaterThanOrEqual(24);
    // the known false negatives are inflected forms asked with a lemma-only key
    expect(disagree.length).toBeLessThanOrEqual(7);
  });

  it('can ask about 150 of the 199 lemma and form units drawn from the unseen sentences — almost all of it written recognition; only 2 grammar questions', async () => {
    const av = await reviewAvailability(res);
    expect(av.tested).toBeGreaterThanOrEqual(199);
    expect(av.withAny).toBeGreaterThanOrEqual(150);
    expect(av.perFamily['written-recognition']).toBeGreaterThanOrEqual(150);
    expect(av.perFamily['grammar-application'] ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('also builds a gloss for four lemma units that came from readings the sentence did not choose (re = cloud, anë = side, i parë, bukur ADV): not worse than four', async () => {
    const av = await reviewAvailability(res);
    expect(av.offGold.length).toBeLessThanOrEqual(4);
  });
});
