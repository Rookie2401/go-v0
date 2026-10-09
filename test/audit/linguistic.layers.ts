/**
 * The layers on top of the adapter, measured on the same unseen sentences (helper, not a test file): the Repository
 * resolver's statuses, the extension parser's card, the production checker, and GoReview's exercise builders over the real
 * Albanian pack facts. Judgements are the audit author's (a language model), not a native speaker's.
 */
import { sqAdapter } from '../../src/adapters/sq';
import type { AnalysisCandidate } from '../../src/core';
import { resolveSelection } from '../../packages/repository-linguistics/src/resolver';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { BUILDERS } from '../../packages/goreview/src/exercises';
import { EXERCISE_FAMILIES, FAMILY_DIMENSION } from '../../packages/goreview/src/types';
import { IDS, SENT, ctxOf, makeWorld, target } from '../goreview/exercises/support';
import type { Selection } from '../goreview/exercises/support';
import type { Fixture, SentenceResult, WordResult } from './linguistic.measure';
import { loadFixture, nfc, pct } from './linguistic.measure';
import { adjOk, adjustedGold, judgeAdjustedWith } from './linguistic.adjust';

const NOW = '2026-10-09T10:00:00.000Z';
const rate = (n: number, d: number) => ({ n, d, pct: pct(n, d) });

const selOf = (w: WordResult, r: SentenceResult) => ({ surface: w.surface, sentence: r.gold.text, selStart: r.tokens[w.tokenIndex].start, selEnd: r.tokens[w.tokenIndex].end });

// ───────────────────────────── Repository resolver ─────────────────────────────

export type Status = 'verified' | 'high-confidence' | 'provisional' | 'conflicted' | 'invalidated';
export interface ResolverRow { id: string; word: string; status: Status; correct: boolean; candidates: number; chosenIsAdapterTop: boolean }

export function runResolver(res: SentenceResult[]): ResolverRow[] {
  const rows: ResolverRow[] = [];
  for (const r of res) for (const w of r.words) {
    const s = selOf(w, r);
    const out = resolveSelection({ languageId: 'sq', surface: s.surface, sentence: s.sentence, selStart: s.selStart, selEnd: s.selEnd, now: NOW });
    const a = out.analysis;
    const chosen = a.chosen === undefined ? undefined : a.candidates[a.chosen];
    const parts = chosen?.lexemeId?.split(':') ?? [];
    const pseudo = chosen ? ({ lemma: parts[2], pos: parts[3], morph: chosen.features ?? {}, unit: w.candidates.find((c) => c.lemma === parts[2] && c.pos === parts[3])?.unit, confidence: chosen.confidence } as unknown as AnalysisCandidate) : undefined;
    const v = judgeAdjustedWith(w, pseudo);
    rows.push({ id: r.gold.id, word: w.surface, status: a.status as Status, correct: adjOk(v), candidates: a.candidates.length, chosenIsAdapterTop: !!pseudo && !!w.top && pseudo.lemma === w.top.lemma && pseudo.pos === w.top.pos });
  }
  return rows;
}

export function summarizeResolver(rows: ResolverRow[]) {
  const by: Record<string, { n: number; correct: number }> = {};
  for (const r of rows) { const b = (by[r.status] ??= { n: 0, correct: 0 }); b.n += 1; if (r.correct) b.correct += 1; }
  return {
    total: rows.length, byStatus: by,
    overall: rate(rows.filter((r) => r.correct).length, rows.length),
    verifiedCount: by.verified?.n ?? 0,
    highConfidenceWrong: (by['high-confidence']?.n ?? 0) - (by['high-confidence']?.correct ?? 0),
    conflictedButRight: by.conflicted?.correct ?? 0,
    chosenDiffersFromAdapterTop: rows.filter((r) => !r.chosenIsAdapterTop).length,
  };
}

// ───────────────────────────── extension card ─────────────────────────────

export interface CardRow {
  id: string; word: string; correct: boolean; lemma?: string; cardLemma?: string; adapterLemma?: string;
  explain?: { expected: string; got: string[]; verdict: 'correct' | 'none' | 'wrong'; notDirectObject: boolean };
}
const expectedConstruction = (g: { feats: Record<string, string>; pos: string[] }): string | undefined => {
  if (!g.pos.includes('NOUN') || g.feats.Definite !== 'Def') return undefined;
  if (g.feats.Number === 'Plur') return 'definite-plural';
  if (g.feats.Case === 'Nom') return 'definite-nominative-singular';
  if (g.feats.Case === 'Acc') return 'definite-accusative-singular';
  return undefined; // genitive / dative / ablative definite: the card has no named explanation for it
};

export function runCards(res: SentenceResult[]): CardRow[] {
  const rows: CardRow[] = [];
  for (const r of res) for (const w of r.words) {
    const s = selOf(w, r);
    const card = parseSelection({ surface: s.surface, context: { kind: 'sentence', confidence: 1, sentence: s.sentence, selStart: s.selStart, selEnd: s.selEnd } });
    const morph = Object.fromEntries(card.features.map((f) => [f.key, f.value]));
    const inUnit = card.syntaxNotes.some((x) => x.startsWith('Part of the unit'));
    const pseudo = { lemma: card.lemma, pos: card.pos, morph, unit: inUnit ? { head: w.tokenIndex, pieces: [w.tokenIndex], role: '', display: '' } : undefined } as unknown as AnalysisCandidate;
    const v = judgeAdjustedWith(w, pseudo);
    const row: CardRow = { id: r.gold.id, word: w.surface, correct: adjOk(v), cardLemma: card.lemma, adapterLemma: w.top?.lemma };
    const g = adjustedGold(w.gold, w.sentence);
    const exp = expectedConstruction(g);
    if (exp) {
      const got = card.constructions.filter((c) => c.source === 'form' && !c.id.startsWith('form:')).map((c) => c.id);
      const prev = r.gold.words[w.index - 1];
      row.explain = { expected: exp, got, verdict: got.includes(exp) ? 'correct' : got.length ? 'wrong' : 'none', notDirectObject: exp === 'definite-accusative-singular' && !!prev && prev.pos.includes('ADP') };
    }
    rows.push(row);
  }
  return rows;
}
export function summarizeCards(rows: CardRow[]) {
  const ex = rows.filter((r) => r.explain);
  return {
    total: rows.length, correct: rate(rows.filter((r) => r.correct).length, rows.length),
    cardLemmaDiffersFromAdapterTop: rows.filter((r) => r.cardLemma !== r.adapterLemma).length,
    explanation: {
      definiteNouns: ex.length,
      correct: ex.filter((r) => r.explain!.verdict === 'correct').length,
      none: ex.filter((r) => r.explain!.verdict === 'none').length,
      wrong: ex.filter((r) => r.explain!.verdict === 'wrong').length,
      accusativeExplanationOnNonObject: ex.filter((r) => r.explain!.notDirectObject && r.explain!.verdict === 'correct').length,
    },
  };
}

// ───────────────────────────── production checker ─────────────────────────────

const wordsOf = (t: string): string[] => [...t.matchAll(/\p{L}+(?:'\p{L}+)?/gu)].map((m) => m[0]);
const WANT_CATEGORY: Record<string, string[]> = {
  definiteness: ['definiteness', 'case'], case: ['case'], 'agreement-article': ['agreement'], 'agreement-adjective': ['agreement'], clitic: ['agreement', 'syntax', 'word-order', 'morphology'], negation: ['particle', 'syntax', 'word-order'],
};
export interface ProdRow { id: string; category: string; detected: boolean; located: boolean; rightCategory: boolean; hasFix: boolean; fixCorrect: boolean; categories: string[]; fixed?: string; confidence?: number }
export function runProduction(fx: Fixture = loadFixture()) {
  const check = (text: string) => { const t = sqAdapter.tokenize(text); return { t, found: sqAdapter.checkProduction!(t, sqAdapter.analyze(t), text) }; };
  const errors: ProdRow[] = fx.production.errors.map((e) => {
    const { t, found } = check(e.text);
    const a = wordsOf(e.text); const b = wordsOf(e.fix);
    const blamed = new Set(a.map((x, i) => (b[i] === x ? -1 : i)).filter((i) => i >= 0));
    const wordIdx = t.map((x, i) => (x.isWord ? i : -1)).filter((i) => i >= 0);
    const located = found.filter((f) => f.tokenIndexes.some((ti) => blamed.has(wordIdx.indexOf(ti))));
    const withFix = located.find((f) => f.suggestion);
    const fixed = withFix?.suggestion ? e.text.slice(0, withFix.suggestion.start) + withFix.suggestion.replacement + e.text.slice(withFix.suggestion.end) : undefined;
    const fixCorrect = !!withFix?.suggestion && (fixed === e.fix || e.fixOk.map(nfc).includes(nfc(withFix.suggestion.replacement)));
    return {
      id: e.id, category: e.category, detected: found.length > 0, located: located.length > 0,
      rightCategory: located.some((f) => WANT_CATEGORY[e.category].includes(f.category)),
      hasFix: !!withFix, fixCorrect, categories: found.map((f) => f.category), ...(fixed ? { fixed } : {}), ...(located[0] ? { confidence: located[0].confidence } : {}),
    };
  });
  const clean = [...fx.production.correct, ...fx.sentences.filter((s) => s.id !== 'u60').map((s) => s.text)];
  const falsePositives = clean.filter((x) => check(x).found.length > 0);
  return { errors, clean: clean.length, falsePositives };
}
export function summarizeProduction(p: ReturnType<typeof runProduction>) {
  const byCat: Record<string, { n: number; located: number; fixed: number }> = {};
  for (const e of p.errors) { const b = (byCat[e.category] ??= { n: 0, located: 0, fixed: 0 }); b.n += 1; if (e.located) b.located += 1; if (e.fixCorrect) b.fixed += 1; }
  return {
    errors: p.errors.length, located: p.errors.filter((e) => e.located).length, rightCategory: p.errors.filter((e) => e.rightCategory).length,
    withFix: p.errors.filter((e) => e.hasFix).length, fixCorrect: p.errors.filter((e) => e.fixCorrect).length,
    falsePositives: p.falsePositives.length, cleanSentences: p.clean, byCat,
  };
}

// ───────────────────────────── GoReview exercises over the real pack facts ─────────────────────────────

export const REVIEW_SELECTIONS: Selection[] = [
  { surface: 'librin', sentence: SENT.librin }, { surface: 'libër', sentence: SENT.liber }, { surface: 'shkollë', sentence: SENT.shkolle },
  { surface: 'quhem Sam', sentence: SENT.quhem, selStart: SENT.quhem.indexOf('quhem'), selEnd: SENT.quhem.length - 1 },
  { surface: 'Nëna', sentence: SENT.nena }, { surface: 'çajin', sentence: SENT.cajin },
  { surface: 'lexojnë', sentence: SENT.librin }, { surface: 'Fëmijët', sentence: SENT.librin }, { surface: 'çaj', sentence: SENT.nena },
];

export interface BuiltExercise { unit: string; family: string; prompt: unknown; accepted: string[]; explanation?: string; variant?: string; mode?: string }
export async function buildReviewSample(): Promise<{ built: BuiltExercise[]; refused: Array<{ unit: string; family: string; reason: string }> }> {
  const world = makeWorld({ selections: REVIEW_SELECTIONS });
  const built: BuiltExercise[] = []; const refused: Array<{ unit: string; family: string; reason: string }> = [];
  const units = [...world.repo.units.keys()].filter((id) => /^(lemma|form|phrase|morph):/.test(id));
  for (const unit of units) {
    const facts = await world.facts(unit).catch(() => undefined);
    if (!facts) continue;
    for (const fam of EXERCISE_FAMILIES) {
      if (fam.startsWith('audio')) continue;
      const r = (await BUILDERS[fam].build(target(unit, FAMILY_DIMENSION[fam]), facts, ctxOf())) as unknown as Record<string, any>;
      if (r.unavailable) { refused.push({ unit, family: fam, reason: r.reason as string }); continue; }
      built.push({ unit, family: fam, prompt: r.prompt, accepted: r.answerKey.accepted, explanation: r.answerKey.explanation, variant: r.variant, mode: r.responseMode });
    }
  }
  return { built, refused };
}

/** How much of the unseen vocabulary GoReview could ask about at all (the builders use only the pack's own sentences). */
export async function reviewAvailability(res: SentenceResult[]) {
  const selections: Selection[] = [];
  for (const r of res) for (const w of r.words) if (w.gold.pos.some((p) => ['NOUN', 'VERB', 'ADJ', 'PROPN'].includes(p))) selections.push(selOf(w, r));
  const world = makeWorld({ selections });
  const lemmaIds = [...world.repo.units.keys()].filter((id) => id.startsWith('lemma:sq:'));
  const formIds = [...world.repo.units.keys()].filter((id) => id.startsWith('form:sq:'));
  const perFamily: Record<string, number> = {};
  const reasons: Record<string, number> = {};
  let withAny = 0; let tested = 0;
  const glosses: Array<{ unit: string; gloss: string[] }> = [];
  const goldLemmas = new Set(res.flatMap((r) => r.words.flatMap((w) => w.gold.lemma.flatMap((lm) => w.gold.pos.map((p) => nfc(lm) + '|' + (p === 'AUX' ? 'VERB' : p))))));
  const offGold: Array<{ unit: string; gloss: string[] }> = [];
  for (const unit of [...lemmaIds, ...formIds]) {
    const facts = await world.facts(unit).catch(() => undefined);
    if (!facts) continue;
    tested += 1;
    let any = false;
    for (const fam of EXERCISE_FAMILIES) {
      if (fam.startsWith('audio')) continue;
      const r = (await BUILDERS[fam].build(target(unit, FAMILY_DIMENSION[fam]), facts, ctxOf())) as unknown as Record<string, any>;
      if (r.unavailable) { const k = (r.reason as string).replace(/“[^”]*”/g, '').slice(0, 90); reasons[k] = (reasons[k] ?? 0) + 1; continue; }
      any = true; perFamily[fam] = (perFamily[fam] ?? 0) + 1;
      if (fam === 'written-recognition' && unit.startsWith('lemma:')) { glosses.push({ unit, gloss: r.answerKey.accepted }); if (!goldLemmas.has(nfc(unit.split(':')[2]) + '|' + unit.split(':')[3])) offGold.push({ unit, gloss: r.answerKey.accepted }); }
    }
    if (any) withAny += 1;
  }
  return { lemmaUnits: lemmaIds.length, formUnits: formIds.length, tested, withAny, perFamily, reasons, glosses, offGold };
}

export { IDS };
