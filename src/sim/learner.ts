/**
 * The simulated learner's knowledge: a deterministic rule, separate from GoLearn's model (and deliberately cruder).
 *
 *   A lemma is KNOWN after the learner has met it at least KNOWN_AFTER (3) times. Proper nouns and numerals are known from
 *   the start. This is exactly the rule of the audit probe (scripts/audit-b2-ladder.mts), so the two tools can be compared.
 *
 * LEMMA = the adapter's first candidate's lemma (NFC, lower-cased); a word token without a candidate counts as its
 * normalized form. This is the adapter alone, as in the probe: the importer's dictionary pass is not consulted here.
 *
 * FORGETTING (audit 2026-10-07 items 5 and 18; the same rule as the app's, policy.ts DECAY). The learner lives in simulated DAYS (the
 * run derives them from the words read and a reading pace). A lemma that was known but has not been met for DECAY.weeks is DECAYED:
 * with decay on it is no longer `isKnown` (the learner looks it up again), counts half in `coverage`, and any encounter restores it.
 * The learner always TRACKS decay (`knownNow`, `decayedNow`) so that a run can report both yardsticks; the `decay` option only says
 * whether the learner BEHAVES by it. `known` stays the lifetime count (met >= 3 times), the figure of every earlier run.
 */
import type { LanguageAdapter } from '../core';
import { isAbbreviation, isNameGuess } from '../ladder/analyse';
import { DECAY } from '../golearn/policy';

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
    // names and numerals are known from the start, as at the ladder gate — but not an unconfirmed name GUESS (a Thai Bible chunk the
    // adapter does not know): that is a word still to be learned (src/ladder/analyse.ts isNameGuess)
    if ((c?.pos === 'PROPN' && !isNameGuess(c)) || c?.pos === 'NUM' || isAbbreviation(c) || /^\p{N}+$/u.test(norm)) { out.push({ tokenIndex: i, lemma: AUTO }); continue; }
    out.push({ tokenIndex: i, lemma: lemmas.intern((c?.lemma ?? norm).normalize('NFC').toLowerCase()) });
  }
  return out;
}

export interface SimLearnerOptions {
  /** The learner behaves by decay (default true). Decay is tracked either way. */
  decay?: boolean;
  /** Days without an encounter after which a known lemma is decayed (default DECAY.weeks x 7). */
  decayDays?: number;
}

export class SimLearner {
  private readonly counts: number[] = [];
  /** The simulated day of each lemma's latest encounter. */
  private readonly last: number[] = [];
  private day = 0;
  /** Distinct lemmas met at least once / known (met >= KNOWN_AFTER times, ever). */
  met = 0;
  known = 0;
  /** Of the known lemmas, those met within the decay window now / those not (decayed). Always tracked. */
  knownNow = 0;
  decayedNow = 0;
  readonly decay: boolean;
  readonly decayDays: number;

  constructor(opts: SimLearnerOptions = {}) {
    this.decay = opts.decay !== false;
    this.decayDays = opts.decayDays ?? DECAY.weeks * 7;
  }

  /** The simulated day now (fractional days); the run calls it before each text. Recounts the decayed lemmas. */
  advanceTo(day: number): void {
    if (day <= this.day) return;
    this.day = day;
    let now = 0, dec = 0;
    for (let l = 0; l < this.counts.length; l++) {
      if ((this.counts[l] ?? 0) < KNOWN_AFTER) continue;
      if (this.day - (this.last[l] ?? 0) >= this.decayDays) dec += 1; else now += 1;
    }
    this.knownNow = now;
    this.decayedNow = dec;
  }

  get today(): number { return this.day; }

  count(lemma: number): number { return lemma === AUTO ? KNOWN_AFTER : (this.counts[lemma] ?? 0); }
  /** Known at some time (met >= 3 times, or automatic), whether or not it has since decayed. */
  everKnown(lemma: number): boolean { return lemma === AUTO || (this.counts[lemma] ?? 0) >= KNOWN_AFTER; }
  /** Known once and not met for the decay window. */
  isDecayed(lemma: number): boolean {
    return lemma !== AUTO && (this.counts[lemma] ?? 0) >= KNOWN_AFTER && this.day - (this.last[lemma] ?? 0) >= this.decayDays;
  }
  /** What the learner behaves by: with decay on, a decayed lemma is not known (it is looked up again, and then restored). */
  isKnown(lemma: number): boolean { return this.everKnown(lemma) && !(this.decay && this.isDecayed(lemma)); }

  /** One encounter. Returns what it changed: a lemma met for the first time, and a lemma that has just become known. */
  meet(lemma: number): { first: boolean; becameKnown: boolean } {
    if (lemma === AUTO) return { first: false, becameKnown: false };
    const before = this.counts[lemma] ?? 0;
    const wasDecayed = this.isDecayed(lemma);
    this.counts[lemma] = before + 1;
    this.last[lemma] = this.day;
    const first = before === 0;
    const becameKnown = before + 1 === KNOWN_AFTER;
    if (first) this.met += 1;
    if (becameKnown) { this.known += 1; this.knownNow += 1; }
    else if (wasDecayed) { this.knownNow += 1; this.decayedNow -= 1; }
    return { first, becameKnown };
  }

  /**
   * Share of `words` known (>= 3 encounters, or automatic), before any of them is met. With decay on, a decayed lemma counts half
   * (the app's half credit); a word the learner no longer knows is still half met.
   */
  coverage(words: readonly SimWord[]): number {
    if (words.length === 0) return 1;
    let k = 0;
    for (const w of words) {
      if (this.isKnown(w.lemma)) k += 1;
      else if (this.decay && this.isDecayed(w.lemma) && DECAY.halfCredit) k += 0.5;
    }
    return k / words.length;
  }
}
