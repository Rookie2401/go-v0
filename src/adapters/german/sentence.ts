/**
 * The German sentence layer: agreement and government narrow what a form can be, separated verbs are put together,
 * compounds are taken apart, readings are ordered by context (package GC; docs/PLAN11.md).
 *
 * The order of the steps, for one sentence:
 *   1. every word gets its context-free readings (engine, older spelling, compounds, derived nouns: context-base.ts);
 *   2. capital letters (a noun inside a sentence, never at a lower-case word), the first word of the sentence, and a name
 *      that is also a noun (Herr Koch, nach Halle: context-words.ts, decideNames);
 *   3. separated verbs: the prefix at the end of the clause joins its verb, or the detached readings go (units.ts);
 *   4. the noun phrase: case, gender and number agree, a preposition governs, the adjective's declension follows
 *      the determiner (agreement.ts);
 *   5. words with several functions: der / die / das, zu, sein / ihr, the modal particles (context-words.ts);
 *   6. the verbs of each clause: the relative pronoun's gender and number, the subject wherever it stands, infinitive, participle,
 *      imperative, auxiliaries (context-subject.ts, context-verbs.ts); the noun phrases are settled again with what that decided;
 *   7. two nouns of one spelling that nothing separates (die Feste) are not shown as certain (context-nouns.ts).
 * Everything a step cannot decide stays a union or stays in the order the engine gave; nothing is guessed. `refine`
 * does the same after a dictionary replaced the readings of some tokens: the dictionary's readings are neighbours that
 * may be reordered and marked down, never added to, removed or rewritten.
 */
import type { AnalysisCandidate, AnalyzedToken, RawToken } from '../../core';
import { agreeNounPhrases, settlePhrases } from './agreement';
import { decideHomographs, mergeSameReadings } from './context-nouns';
import { baseReadings } from './context-base';
import { decideVerbs } from './context-verbs';
import { applyCapitals, decideInitial, decideNames, decideWords } from './context-words';
import { DE_ANALYZER, capitalise, cloneCandidate, makeSent, makeToks, norm, settle, type R } from './context';
import { componentLemmas } from './compounds';
import { joinSeparableVerbs } from './units';
import type { DeLexiconView } from './types';

export { decomposeCompound } from './compounds';

interface Given { candidates: AnalysisCandidate[]; frozen: boolean }

/** The whole pipeline over one sentence; `given[i]` is set for a token whose readings somebody else supplied. */
function run(tokens: RawToken[], lex: DeLexiconView, given: (i: number) => Given | undefined): AnalysisCandidate[][] {
  const toks = makeToks(
    tokens,
    (i) => !given(i),
    (i) => !!given(i)?.frozen,
    (i): R[] => {
      const g = given(i);
      return g ? g.candidates.map((c): R => ({ c: cloneCandidate(c), own: false })) : baseReadings(tokens[i].surface, lex);
    },
  );
  applyCapitals(toks);
  const s = makeSent(lex, toks);
  decideInitial(s);
  decideNames(s);
  joinSeparableVerbs(s);
  agreeNounPhrases(s);
  decideWords(s);
  decideVerbs(s);
  for (const t of s.toks) if (t.word) mergeSameReadings(t);
  if (decideHomographs(s)) settlePhrases(s);
  for (const t of s.toks) if (t.word) mergeSameReadings(t);
  return toks.map((t) => {
    if (!t.word) return [];
    settle(t);
    return t.rs.map((r) => r.c);
  });
}

/** The candidates of every token of one sentence, best first (the adapter's `analyze`). */
export function analyzeGermanSentence(tokens: RawToken[], lex: DeLexiconView): AnalysisCandidate[][] {
  return run(tokens, lex, () => undefined);
}

/** The adapter's `refine` (see LanguageAdapter.refine): order again after the importer merged dictionary readings. */
export function refineGermanSentence(tokens: RawToken[], analyzed: AnalyzedToken[], analyzers: ReadonlySet<string>, lex: DeLexiconView, given?: ReadonlySet<number>): AnalyzedToken[] {
  // a token named in `given` is ours, but the importer put readings beside ours: its list is taken as it is (never restarted, reordered or re-decided), neighbours may read it
  const own = (i: number): boolean => analyzed[i].analyzer === DE_ANALYZER && analyzers.has(DE_ANALYZER) && !given?.has(i);
  const out = run(tokens, lex, (i) => (own(i) ? undefined : { candidates: analyzed[i].candidates, frozen: !analyzers.has(analyzed[i].analyzer) || !!given?.has(i) }));
  return tokens.map((t, i) => {
    if (!t.isWord || given?.has(i)) return analyzed[i];
    if (analyzed[i].analyzer !== DE_ANALYZER && !analyzers.has(analyzed[i].analyzer)) return analyzed[i];
    if (analyzed[i].analyzer === DE_ANALYZER && !analyzers.has(DE_ANALYZER)) return analyzed[i];
    // The contract: only order, a lowered confidence and notes.context may change. A token of ours was started again from its
    // context-free readings, and a neighbour whose readings the dictionary replaced may no longer show what its first analysis
    // saw (a participle the engine guessed, now a dictionary entry that names no form): where that would add, drop, merge or
    // change a reading (the perfect auxiliary haben as a plain verb again, the indicative and Konjunktiv II twins of suchte
    // merged), the first analysis stands, which saw every neighbour as the engine read it.
    if (!sameReadings(out[i], analyzed[i].candidates)) return analyzed[i];
    return { ...analyzed[i], candidates: out[i] };
  });
}

/** The (lemma, part of speech) pairs of two lists of readings are the same, whatever the order: what refine must keep (plan.ts compares exactly this). */
function sameReadings(a: readonly AnalysisCandidate[], b: readonly AnalysisCandidate[]): boolean {
  const key = (l: readonly AnalysisCandidate[]): string[] => l.map((c) => JSON.stringify([c.lemma ?? null, c.pos ?? null])).sort();
  const x = key(a);
  const y = key(b);
  return x.length === y.length && x.every((v, k) => v === y[k]);
}

// ───────────────────────────── relate ─────────────────────────────

function lemmasOf(form: string, lex: DeLexiconView): Set<string> {
  const out = new Set<string>();
  const forms = new Set([form, capitalise(form), form.toLocaleLowerCase('de')]);
  for (const f of forms) for (const r of baseReadings(f, lex)) if (!r.c.unconfirmed && r.c.lemma) out.add(norm(r.c.lemma));
  return out;
}

/** The adapter's `relate`: 'same' | 'inflection' (same lemma, a separable verb's pieces too) | 'component' (one is a part of the other compound) | 'none'. */
export function relateGerman(a: string, b: string, lex: DeLexiconView): 'same' | 'inflection' | 'component' | 'none' {
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return 'same';
  const la = lemmasOf(a, lex);
  const lb = lemmasOf(b, lex);
  for (const l of la) if (lb.has(l)) return 'inflection';
  const ca = componentLemmas(a, lex);
  if (ca.some((l) => lb.has(l))) return 'component';
  const cb = componentLemmas(b, lex);
  if (cb.some((l) => la.has(l))) return 'component';
  return 'none';
}
