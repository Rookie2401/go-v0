/**
 * The Arabic DECK GATE (2026-11-25, the owner's landing condition: "no false words or unknown words in the GoReview deck").
 *
 * The analyser may READ a word it cannot be sure of (the GoLearn card shows every reading, marked); GoReview may only DRILL a word the pack
 * is sure of. This file is the one place that says which is which. It never changes a reading (confidence, order, lemma, gloss stay as the
 * analyser made them): it MARKS the candidates of a token that must not be drilled with
 *     notes.reviewStatus = 'requires-review'      (the name Biblical Aramaic uses; `statusOf` / `statusFor` turn it into the status
 *                                                  `requires-review`, which the Repository engine never lets support an item)
 *     notes.reviewReason  = one plain sentence    (what the learner / the audit reads)
 *     notes.deckLimit     = the id of the rule below that fired
 * `arMarkForDeck` runs at the end of `analyze` and `refine` in src/adapters/ar.ts.
 *
 * THE RULES (AR_DECK_LIMITS is the one list: the audit, the unit tests and docs/arabic/DECK.md read it). The first that applies decides.
 * A token is held back when its TOP reading
 *   no-reading          there is none;
 *   not-an-entry        is not an entry of the word list: its lemma and part of speech are no lemma id of the installed Arabic index (any "|2" suffix)
 *                       and no closed-class entry (a clitic fragment, a name the source does not list);
 *   guess               is a guess from the shape of the word (`unconfirmed`);
 *   derived             is a participle or verbal noun that has no entry of its own (notes.derivedFrom);
 *   no-meaning          has no English meaning (the entry's gloss is empty);
 *   gloss-pos          has a first meaning that does not fit its part of speech (a verb's begins 'to ', a noun's does not);
 *   dialect             is flagged dialect or foreign (notes.variety);
 *   undecided           has confidence < 0.5, or identity undecided / partial / rare (no lexeme is credited);
 *   plural-entry       is a broken plural that is an entry of its own (notes.pluralEntry): the card would teach the plural;
 *   pronoun-form        is a pronoun or demonstrative written with other letters than its entry (تلك filed under ذلك);
 *   two-lexemes         shares credit (>= 0.5) with a reading of another lexeme (the analyser's invariant says this cannot happen: this is the check);
 *   restored-spelling   was reached through a restored spelling (hamza, ى, ة put back) that the reviewed identities list does not name;
 *   known-misread-form  has a written form the sweep (scripts/ar-deck-limits.mts) found credited to the wrong lexeme;
 *   known-misread-lemma is a lexeme the sweep found credited to the wrong spelling;
 *   sense-unreviewed    has a leading meaning nobody has reviewed: the index row's `Sense` is not Rev (reviewed choice) or One (one real sense),
 *                       or it has Homonyms and is not Rev. A row without the key is read as Ord (several unlabelled senses: not eligible).
 * Closed-class entries (closed.ts: hand-written, one-line functions) have no `Sense` and are exempt from the last rule.
 */
import type { AnalysisCandidate, AnalyzedToken, RawToken } from '../../core';
import { AR_CLOSED } from './closed';
import { AR_KNOWN_LIMITS, AR_LIMITED_LEMMAS } from './generated/deck-limits';
import { installedArabicIndexes, lexOf, lookupArabicLemma, type ArabicFormIndex, type ArLemmaRow } from './index-store';
import { arHeadForm, arKey, hasTashkil } from './text';

export interface ArDeckLimit { id: string; test: string; reason: string }

/** THE known-limits table: id, the test in words, and the sentence a learner reads. */
export const AR_DECK_LIMITS: readonly ArDeckLimit[] = [
  { id: 'no-reading', test: 'the analyser gives the word no reading', reason: 'no reading: the word is not in the Arabic word list' },
  { id: 'not-an-entry', test: "the top reading's lemma and part of speech are no entry of the Arabic index or of the closed-class table", reason: 'not an entry of the Arabic word list' },
  { id: 'guess', test: 'the top reading is a guess from the shape of the word (unconfirmed)', reason: 'a guess from the shape of the word, not an entry of the word list' },
  { id: 'derived', test: 'the top reading is a participle or verbal noun with no entry of its own (notes.derivedFrom)', reason: 'a participle or verbal noun with no entry of its own: its lexeme is not in the word list' },
  { id: 'no-meaning', test: 'the entry has no English gloss', reason: 'no English meaning' },
  { id: 'gloss-pos', test: "the first meaning does not match the part of speech: a VERB's must begin 'to ', a NOUN / ADJ / PRON meaning must not", reason: "its first meaning does not fit its part of speech (a verb's meaning begins 'to ')" },
  { id: 'dialect', test: 'the reading is flagged dialect or foreign (notes.variety)', reason: 'flagged as dialect or foreign: not read as Standard Arabic' },
  { id: 'undecided', test: 'top confidence < 0.5, or notes.identity is undecided, partial or rare', reason: 'undecided: more evidence must decide' },
  { id: 'plural-entry', test: 'the reading is a broken plural that is an entry of its own (notes.pluralEntry)', reason: 'a plural that is an entry of its own: the card would teach the plural, not the word' },
  { id: 'pronoun-form', test: 'a pronoun or demonstrative whose stem is written with other letters than its entry (the dictionary files one form under another)', reason: 'a pronoun or demonstrative written differently from its entry: the card would show another spelling' },
  { id: 'two-lexemes', test: 'a reading of another lexeme is also credited (>= 0.5)', reason: 'two lexemes are both credited: more evidence must decide' },
  { id: 'restored-spelling', test: 'notes.spelling is restored and the reviewed identities list does not name the reading', reason: 'read through a restored spelling (a hamza, ى or ة put back): more evidence must decide' },
  { id: 'known-misread-form', test: 'the written form is in AR_KNOWN_LIMITS (generated by scripts/ar-deck-limits.mts)', reason: 'known limit: this spelling is misread' },
  { id: 'known-misread-lemma', test: 'the lexeme is in AR_LIMITED_LEMMAS (credited to a misread spelling by the sweep)', reason: 'known limit: this lexeme is credited to a misread spelling' },
  { id: 'sense-unreviewed', test: "the index row's Sense is not Rev or One (or it has Homonyms and is not Rev)", reason: 'its leading meaning has not been reviewed yet (the dictionary lists several senses)' },
];
const LIMIT = new Map(AR_DECK_LIMITS.map((l) => [l.id, l]));

export interface ArDeckVerdict { id: string; reason: string }
const verdict = (id: string, detail?: string): ArDeckVerdict => ({ id, reason: `${LIMIT.get(id)!.reason}${detail ? ` (${detail})` : ''}` });

// ───────────────────────────── the word list ─────────────────────────────

const POS_ALIASES: Readonly<Record<string, readonly string[]>> = {
  NOUN: ['NOUN', 'ADJ'], ADJ: ['ADJ', 'NOUN'], VERB: ['VERB', 'AUX'], AUX: ['AUX', 'VERB'],
  CCONJ: ['CONJ', 'CCONJ', 'SCONJ', 'PART'], SCONJ: ['SCONJ', 'CONJ', 'PART'], CONJ: ['CONJ', 'CCONJ', 'SCONJ'],
  ADP: ['ADP', 'PART'], PART: ['PART', 'ADP', 'CONJ', 'ADV', 'SCONJ'], ADV: ['ADV', 'PART'], PRON: ['PRON', 'DET'], DET: ['DET', 'PRON'],
};
const posesFor = (pos: string): readonly string[] => POS_ALIASES[pos] ?? [pos];

const REVERSE = new WeakMap<ArabicFormIndex, Map<string, ArLemmaRow>>();
function reverseOf(index: ArabicFormIndex): Map<string, ArLemmaRow> {
  let m = REVERSE.get(index);
  if (!m) {
    m = new Map();
    for (const row of Object.values(index.lemmas)) {
      const k = `${arHeadForm(row[0], row[2])}|${row[2]}`;
      const have = m.get(k);
      if (!have || row[4] > have[4]) m.set(k, row);
    }
    REVERSE.set(index, m);
  }
  return m;
}

/** The index row of a lemma as the analyser names it (`arHeadForm` of the head) with a part of speech; undefined when no installed index holds it. */
export function arLemmaRow(lemma: string, pos: string): ArLemmaRow | undefined {
  const head = arHeadForm(lemma, pos);
  for (const p of posesFor(pos)) {
    for (const suffix of ['', '|2', '|3']) {
      const row = lookupArabicLemma(`${lemma}|${p}${suffix}`) ?? lookupArabicLemma(`${head}|${p}${suffix}`);
      if (row) return row;
    }
  }
  for (const index of installedArabicIndexes()) {
    for (const p of posesFor(pos)) { const row = reverseOf(index).get(`${head}|${p}`); if (row) return row; }
  }
  return undefined;
}

let CLOSED: Map<string, string> | undefined;
/** The closed-class entries by `arHeadForm(lemma)|POS` → gloss. */
function closedGloss(lemma: string, pos: string): string | undefined {
  if (!CLOSED) {
    CLOSED = new Map();
    for (const list of Object.values(AR_CLOSED)) for (const e of list) for (const p of posesFor(e.pos)) CLOSED.set(`${arHeadForm(e.lemma, e.pos)}|${p}`, e.gloss);
  }
  const head = arHeadForm(lemma, pos);
  for (const p of posesFor(pos)) { const g = CLOSED.get(`${head}|${p}`); if (g !== undefined) return g; }
  return undefined;
}

/** What the index says about a leading meaning when a row has no `Sense` key: the source's first sense, never reviewed. Tests of the other rules may say 'One'. */
let SENSE_WHEN_ABSENT: 'Ord' | 'One' = 'Ord';
/** Test hook ONLY (the audit's "what if every row were reviewed" simulation, clearly labelled there); called with nothing it restores the rule. */
export function arDeckSenseWhenAbsent(v?: 'Ord' | 'One'): void { SENSE_WHEN_ABSENT = v ?? 'Ord'; }

export type ArSenseClass = 'Rev' | 'One' | 'Lab' | 'Ord';
/** The class of the leading meaning of an index row (see the header). */
export function arSenseClass(row: ArLemmaRow | undefined): ArSenseClass {
  const lex = lexOf(row);
  const s = lex.Sense;
  const base: ArSenseClass = s === 'Rev' || s === 'One' || s === 'Lab' || s === 'Ord' ? s : SENSE_WHEN_ABSENT;
  return base;
}
export const arSenseOk = (row: ArLemmaRow | undefined): boolean => {
  const c = arSenseClass(row);
  if (c === 'Rev') return true;
  return c === 'One' && !lexOf(row).Homonyms;
};

// ───────────────────────────── the verdict ─────────────────────────────

const text = (v: unknown): string => (Array.isArray(v) ? v.join(',') : String(v ?? ''));
let SPELLED_OTHERWISE: Set<string> | undefined;
/** Pronoun / demonstrative lexemes of the closed table that other spellings are filed under (تلك and ذلك under ذٰلِكَ): their LEMMA card is held too, because the lemma id the extension records for such a word names the entry, not the word met. */
function spelledOtherwise(lemma: string, pos: string): boolean {
  if (!SPELLED_OTHERWISE) {
    SPELLED_OTHERWISE = new Set();
    for (const list of Object.values(AR_CLOSED)) for (const e of list) if ((e.pos === 'PRON' || e.pos === 'DET') && !e.suffix && arKey(e.form) !== arKey(e.lemma)) SPELLED_OTHERWISE.add(`${arHeadForm(e.lemma, e.pos)}|${e.pos}`);
  }
  return SPELLED_OTHERWISE.has(`${arHeadForm(lemma, pos)}|${pos}`);
}
/** The written stem (without attached words) has the letters of the lemma. */
function sameLetters(c: AnalysisCandidate, surface: string): boolean {
  const stem = c.parts?.find((p) => p.kind === 'stem')?.text ?? surface;
  return arKey(stem) === arKey(c.lemma ?? '');
}
const lemmaKey = (c: AnalysisCandidate): string => `${c.lemma ?? ''}|${c.pos ?? ''}`;

/** The known-limits entry of a written token: the printed (vocalized) form first, then its unvocalized key when the page printed no vowels. */
export function arKnownLimitOf(surface: string): string | undefined {
  const printed = surface.normalize('NFC');
  const own = (AR_KNOWN_LIMITS as Record<string, string>)[printed];
  if (own) return own;
  return hasTashkil(printed) ? undefined : (AR_KNOWN_LIMITS as Record<string, string>)[arKey(printed)];
}

/**
 * Whether the TOP reading of a word may be drilled; undefined = yes. `cands` is the reading list as the analyser gave it (best first).
 * `surface` is the written word (for the known-limits list).
 */
export function arDeckVerdict(surface: string, cands: readonly AnalysisCandidate[]): ArDeckVerdict | undefined {
  const top = cands[0];
  if (!top) return verdict('no-reading');
  const notes = top.notes ?? {};
  if (top.unconfirmed) return verdict('guess');
  if (!top.lemma || !top.pos) return verdict('not-an-entry', 'no lemma');
  if (notes.derivedFrom) return verdict('derived', text(notes.derivation) || undefined);
  if (/dialect|foreign/i.test(text(notes.variety)) || notes.dialect) return verdict('dialect');
  const identity = text(notes.identity);
  if (top.confidence < 0.5 || identity === 'undecided' || identity === 'partial' || identity === 'rare') {
    const rivals = new Set(cands.filter((c) => c.confidence >= top.confidence - 0.15 && c.lemma).map(lemmaKey));
    if (rivals.size >= 2) return { id: 'undecided', reason: `undecided between ${rivals.size} readings: more evidence must decide` };
    return verdict('undecided', identity === 'partial' ? 'the word list for this spelling is not loaded' : identity === 'rare' ? 'a rare reading of a short unvocalized word' : `confidence ${top.confidence}`);
  }
  if (cands.some((c) => c !== top && c.confidence >= 0.5 && !c.unconfirmed && c.lemma && lemmaKey(c) !== lemmaKey(top))) return verdict('two-lexemes');
  if (text(notes.pluralEntry)) return verdict('plural-entry');
  if ((top.pos === 'PRON' || top.pos === 'DET') && (!sameLetters(top, surface) || spelledOtherwise(top.lemma, top.pos))) return verdict('pronoun-form');
  if (text(notes.spelling) === 'restored' && identity !== 'main') return verdict('restored-spelling');
  const row = arLemmaRow(top.lemma, top.pos);
  const closed = closedGloss(top.lemma, top.pos);
  if (!row && closed === undefined) return verdict('not-an-entry');
  if (!(closed ?? row?.[1] ?? '').trim()) return verdict('no-meaning');
  const lead = (top.gloss ?? closed ?? row?.[1] ?? '').replace(/^\s*\d+\.\s*/u, '').trim();
  const verbal = top.pos === 'VERB' || top.pos === 'AUX';
  const toLead = /^to\b/iu.test(lead);
  if ((verbal && !toLead) || (!verbal && ['NOUN', 'ADJ', 'PRON', 'PROPN'].includes(top.pos) && toLead)) return verdict('gloss-pos', lead.slice(0, 40));
  const limited = arKnownLimitOf(surface);
  if (limited) return { id: 'known-misread-form', reason: `${LIMIT.get('known-misread-form')!.reason} (${limited})` };
  const badLemma = (AR_LIMITED_LEMMAS as Record<string, string>)[`${arHeadForm(top.lemma, top.pos)}|${top.pos}`];
  if (badLemma) return { id: 'known-misread-lemma', reason: `${LIMIT.get('known-misread-lemma')!.reason} (${badLemma})` };
  if (closed === undefined && row && !arSenseOk(row)) return verdict('sense-unreviewed');
  return undefined;
}

/** The deck status an eligible Arabic reading may reach: never above provisional (the pack is experimental, machine-drafted). */
export const AR_DECK_STATUS_CEILING = 'provisional' as const;

/**
 * Marks the candidates of every word token the deck must not drill (see the header) and leaves everything else as it is.
 * Returns new objects for the marked tokens; an unmarked token is returned as it came.
 */
export function arMarkForDeck(tokens: readonly RawToken[], analyzed: AnalyzedToken[]): AnalyzedToken[] {
  return analyzed.map((a, i) => {
    const token = tokens[i] ?? a.token;
    if (!token?.isWord || !a.candidates.length) return a;
    const v = arDeckVerdict(token.surface, a.candidates);
    if (!v) return a;
    return { ...a, candidates: a.candidates.map((c) => ({ ...c, notes: { ...c.notes, reviewStatus: 'requires-review', reviewReason: v.reason, deckLimit: v.id } })) };
  });
}
