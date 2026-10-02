/**
 * Two nouns, one spelling (package GC, batch 2): die Feste is the plural of Fest and the singular of Feste. A sentence that does
 * not decide between them must not present one as certain, because a confident wrong lemma credits the learner with a word he
 * did not read. Two rules:
 *   1. Within one sentence a spelling means one word: when the same noun spelling occurs more than once and an occurrence is
 *      decided by agreement (unter der Feste can only be the feminine singular), the undecided occurrences take the same lemma.
 *   2. When readings of DIFFERENT noun lemmas all fit and nothing decides, none is shown as certain: each is capped at 0.45 (below
 *      the 0.5 at which the learner model names a lemma), the order is kept, and `notes.context` says which words it could be.
 * Neither fires for one lemma with several cells (die Lehrer), nor when the article or an adjective decided (eine Feste, der
 * Feste, viele Feste). Only nouns the word list holds count; a guessed noun is already unconfirmed.
 */
import { addContext, anyLive, cellsOf, markDown, norm, settle, type R, type Sent, type Tok } from './context';

const CAP = 0.45;

const liveNouns = (t: Tok): R[] => t.rs.filter((r) => !r.down && r.c.pos === 'NOUN' && !r.c.unconfirmed && r.c.lemma);
const lemmasOf = (rs: R[]): string[] => [...new Set(rs.map((r) => r.c.lemma as string))];

function describe(t: Tok, lemma: string): string {
  const cells = liveNouns(t).filter((r) => r.c.lemma === lemma).flatMap((r) => cellsOf(r) ?? []);
  const plural = cells.some((x) => x.g === 'p');
  const singular = cells.some((x) => x.g !== 'p');
  return plural && !singular ? `the plural of ${lemma}` : singular && !plural ? `the singular of ${lemma}` : `a form of ${lemma}`;
}

/** Noun readings of one word that the sentence made the same (one lemma, one set of features) are one reading, the higher confidence kept (Friede and Frieden after a noun phrase narrowed both). */
export function mergeSameReadings(t: Tok): void {
  if (!t.own || t.frozen) return;
  const out: R[] = [];
  for (const r of t.rs) {
    const twin = r.c.pos === 'NOUN' ? out.find((o) => o.c.pos === 'NOUN' && !!o.down === !!r.down && o.c.lemma === r.c.lemma && JSON.stringify(o.c.morph) === JSON.stringify(r.c.morph)) : undefined;
    if (!twin) out.push(r);
    else twin.c.confidence = Math.max(twin.c.confidence, r.c.confidence);
  }
  t.rs = out;
}

/** The step, over a sentence that the noun phrases and the verbs have already settled. Returns whether anything changed. */
export function decideHomographs(s: Sent): boolean {
  let changed = false;
  const bySpelling = new Map<string, Tok[]>();
  for (const t of s.toks) if (t.word && liveNouns(t).length) bySpelling.set(norm(t.raw.surface), [...(bySpelling.get(norm(t.raw.surface)) ?? []), t]);

  // 1. a spelling means one word in a sentence
  for (const toks of bySpelling.values()) {
    if (toks.length < 2) continue;
    const decided = new Set(toks.filter((t) => lemmasOf(liveNouns(t)).length === 1).map((t) => lemmasOf(liveNouns(t))[0]));
    if (decided.size !== 1) continue;
    const lemma = [...decided][0];
    for (const t of toks) {
      if (t.frozen || !t.own) continue;
      const ls = lemmasOf(liveNouns(t));
      if (ls.length < 2 || !ls.includes(lemma)) continue;
      const decider = toks.find((o) => lemmasOf(liveNouns(o)).length === 1)!;
      for (const r of liveNouns(t)) if (r.c.lemma !== lemma) markDown(r);
      for (const r of liveNouns(t)) addContext(r, `the same spelling stands elsewhere in the sentence (${decider.raw.surface}) where only ${lemma} fits: a spelling means one word here`);
      settle(t);
      changed = true;
    }
  }

  // 2. nothing decides between nouns of different lemma
  for (const t of s.toks) {
    if (!t.word || t.frozen || !t.own) continue;
    const rs = liveNouns(t);
    const ls = lemmasOf(rs);
    if (ls.length < 2 || !anyLive(t, (c) => c.pos === 'NOUN')) continue;
    const could = ls.map((l) => describe(t, l)).join(' or ');
    for (const r of rs) {
      r.c.confidence = Math.min(r.c.confidence, CAP);
      addContext(r, `could be ${could}: the sentence does not decide`);
    }
    changed = true;
  }
  return changed;
}
