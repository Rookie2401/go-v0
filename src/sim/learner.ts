/**
 * The simulated learner's knowledge: a deterministic rule, separate from GoLearn's model (and deliberately cruder).
 *
 *   A lemma is KNOWN after the learner has met it at least KNOWN_AFTER (3) times. Proper nouns and numerals are known from
 *   the start. This is exactly the rule of the audit probe (scripts/audit-b2-ladder.mts), so the two tools can be compared.
 *
 * LEMMA = the adapter's first candidate's lemma (NFC, lower-cased); a word token without a candidate counts as its
 * normalized form. This is the adapter alone, as in the probe: the importer's dictionary pass is not consulted here.
 */
import type { LanguageAdapter } from '../core';

export const KNOWN_AFTER = 3;
/** Interned id of a word that is known from the start (a proper noun or a numeral). */
export const AUTO = -1;

/** Lemma keys → small integers (one index per run). */
export class LemmaIndex {
  private readonly ids = new Map<string, number>();
  private readonly keys: string[] = [];

  intern(key: string): number {
    let id = this.ids.get(key);
    if (id === undefined) { id = this.keys.length; this.ids.set(key, id); this.keys.push(key); }
    return id;
  }

  /** The id of a key, without creating it. */
  find(key: string): number | undefined { return this.ids.get(key); }
  keyOf(id: number): string | undefined { return this.keys[id]; }
  get size(): number { return this.keys.length; }
}

/** One word of a sentence as the learner sees it: the stored token's index and the interned lemma (or AUTO). */
export interface SimWord { tokenIndex: number; lemma: number }

/**
 * The word tokens of one sentence, with their lemma ids. `tokenIndex` is the index of the token in `adapter.tokenize(text)`,
 * which is the index of the stored Token row (the importer tokenizes the same way), so a word lines up with its Token.
 */
export function analyseSentence(adapter: LanguageAdapter, text: string, lemmas: LemmaIndex): SimWord[] {
  const raw = adapter.tokenize(text);
  const analysed = adapter.analyze(raw);
  const out: SimWord[] = [];
  for (let i = 0; i < analysed.length; i++) {
    const x = analysed[i]!;
    if (!x.token.isWord) continue;
    const c = x.candidates[0];
    const norm = x.token.normalized.toLowerCase();
    if (c?.pos === 'PROPN' || c?.pos === 'NUM' || /^\p{N}+$/u.test(norm)) { out.push({ tokenIndex: i, lemma: AUTO }); continue; }
    out.push({ tokenIndex: i, lemma: lemmas.intern((c?.lemma ?? norm).normalize('NFC').toLowerCase()) });
  }
  return out;
}

export class SimLearner {
  private readonly counts: number[] = [];
  /** Distinct lemmas met at least once / known (met >= KNOWN_AFTER times). */
  met = 0;
  known = 0;

  count(lemma: number): number { return lemma === AUTO ? KNOWN_AFTER : (this.counts[lemma] ?? 0); }
  isKnown(lemma: number): boolean { return lemma === AUTO || (this.counts[lemma] ?? 0) >= KNOWN_AFTER; }

  /** One encounter. Returns what it changed: a lemma met for the first time, and a lemma that has just become known. */
  meet(lemma: number): { first: boolean; becameKnown: boolean } {
    if (lemma === AUTO) return { first: false, becameKnown: false };
    const before = this.counts[lemma] ?? 0;
    this.counts[lemma] = before + 1;
    const first = before === 0;
    const becameKnown = before + 1 === KNOWN_AFTER;
    if (first) this.met += 1;
    if (becameKnown) this.known += 1;
    return { first, becameKnown };
  }

  /** Share of `words` known (>= 3 encounters, or automatic), before any of them is met. */
  coverage(words: readonly SimWord[]): number {
    if (words.length === 0) return 1;
    let k = 0;
    for (const w of words) if (this.isKnown(w.lemma)) k += 1;
    return k / words.length;
  }
}
