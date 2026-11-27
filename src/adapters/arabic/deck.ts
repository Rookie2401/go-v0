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
 *   description-only    has a shown meaning that is only a description in brackets ("(question word: is…? does…?)"): nothing to type;
 *   numbered-gloss     has a gloss that numbers several dictionary entries ("1. chief 2. big"): the reviewed choice does not lead;
 *   same-spelling       is also another NOUN / ADJ / PROPN of the same head with a meaning that shares no content word, and no sentence rule decided (kind 2);
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
 * A closed-class lexeme is judged by the same rule, with one more way in: its reading's gloss is a SINGLE hand-written gloss of the closed table (closed.ts), not a numbered
 * "1. ... 2. ..." merge of several entries, and the reading is not a homonym merge (notes.homonyms); otherwise it needs a reviewed (Rev) or single (One) index row like any word.
 */
import type { AnalysisCandidate, AnalyzedToken, RawToken } from '../../core';
import type { ReviewKind } from '../../core/review-gate';
import { AR_CLOSED } from './closed';
import { AR_KNOWN_LIMITS, AR_LIMITED_LEMMAS } from './generated/deck-limits';
import { installedArabicIndexes, lexOf, lookupArabicLemma, type ArabicFormIndex, type ArLemmaRow } from './index-store';
import { arHeadForm, arKey, hasTashkil } from './text';

export interface ArDeckLimit {
  id: string; test: string; reason: string;
  /** true: the hold is about the READING (a misread, undecided or unlisted word): the mark also says `reviewGate = 'yes'` and the extension credits the word to its form id only.
   *  false: the hold is about the MEANING SHOWN on the card (unreviewed, wrong part of speech, no gloss, a plural entry): the reading is right, the lemma is still credited. */
  reading: boolean;
  /** The reason's class, in the names of the shared gate (notes.reviewKind): the GoLearn card says why a held word is not added to review. */
  kind: ReviewKind;
}


/** THE known-limits table: id, the test in words, and the sentence a learner reads. */
export const AR_DECK_LIMITS: readonly ArDeckLimit[] = [
  { id: 'no-reading', test: 'the analyser gives the word no reading', reason: 'no reading: the word is not in the Arabic word list', reading: true, kind: 'unlisted' },
  { id: 'not-an-entry', test: "the top reading's lemma and part of speech are no entry of the Arabic index or of the closed-class table", reason: 'not an entry of the Arabic word list', reading: true, kind: 'unlisted' },
  { id: 'guess', test: 'the top reading is a guess from the shape of the word (unconfirmed)', reason: 'a guess from the shape of the word, not an entry of the word list', reading: true, kind: 'low-confidence' },
  { id: 'derived', test: 'the top reading is a participle or verbal noun with no entry of its own (notes.derivedFrom)', reason: 'a participle or verbal noun with no entry of its own: its lexeme is not in the word list', reading: true, kind: 'unlisted' },
  { id: 'no-meaning', test: 'the entry has no English gloss', reason: 'no English meaning', reading: false, kind: 'no-meaning' },
  { id: 'description-only', test: 'the shown meaning, with its bracketed text removed, leaves no letter: nothing a learner could type', reason: 'a grammar word with no single English meaning to type', reading: false, kind: 'no-meaning' },
  { id: 'numbered-gloss', test: 'the reading\'s gloss is a numbered merge of several dictionary entries ("1. ... 2. ...")', reason: 'several dictionary entries share this headword: the meaning shown has not been separated', reading: true, kind: 'undecided-entry' },
  { id: 'gloss-pos', test: "the first meaning does not match the part of speech: a VERB's must begin 'to ', a NOUN / ADJ / PRON meaning must not", reason: "its first meaning does not fit its part of speech (a verb's meaning begins 'to ')", reading: false, kind: 'meaning-unreviewed' },
  { id: 'dialect', test: 'the reading is flagged dialect or foreign (notes.variety)', reason: 'flagged as dialect or foreign: not read as Standard Arabic', reading: true, kind: 'other-variety' },
  { id: 'undecided', test: 'top confidence < 0.5, or notes.identity is undecided, partial or rare', reason: 'undecided: more evidence must decide', reading: true, kind: 'two-words' },
  { id: 'plural-entry', test: 'the reading is a broken plural that is an entry of its own (notes.pluralEntry)', reason: 'a plural that is an entry of its own: the card would teach the plural, not the word', reading: false, kind: 'other-listed-word' },
  { id: 'pronoun-form', test: 'a pronoun or demonstrative whose stem is written with other letters than its entry (the dictionary files one form under another)', reason: 'a pronoun or demonstrative written differently from its entry: the card would show another spelling', reading: true, kind: 'other-listed-word' },
  { id: 'two-lexemes', test: 'a reading of another lexeme is also credited (>= 0.5)', reason: 'two lexemes are both credited: more evidence must decide', reading: true, kind: 'two-words' },
  { id: 'restored-spelling', test: 'notes.spelling is restored and the reviewed identities list does not name the reading', reason: 'read through a restored spelling (a hamza, ى or ة put back): more evidence must decide', reading: true, kind: 'low-confidence' },
  { id: 'known-misread-form', test: 'the written form is in AR_KNOWN_LIMITS (generated by scripts/ar-deck-limits.mts)', reason: 'known limit: this spelling is misread', reading: true, kind: 'known-limit' },
  { id: 'known-misread-lemma', test: 'the lexeme is in AR_LIMITED_LEMMAS (credited to a misread spelling by the sweep)', reason: 'known limit: this lexeme is credited to a misread spelling', reading: true, kind: 'known-limit' },
  { id: 'same-spelling', test: 'the same head is also a lexeme of another part of speech among NOUN / ADJ / PROPN with a meaning that shares no content word, and no sentence rule decided between them', reason: 'this spelling is also another word with another meaning; nobody has checked which one this sentence has', reading: false, kind: 'meaning-unreviewed' },
  { id: 'sense-unreviewed', test: "the index row's Sense is not Rev or One (or it has Homonyms and is not Rev)", reason: 'its leading meaning has not been reviewed yet (the dictionary lists several senses)', reading: false, kind: 'meaning-unreviewed' },
];
const LIMIT = new Map(AR_DECK_LIMITS.map((l) => [l.id, l]));

export interface ArDeckVerdict { id: string; reason: string; /** the other lexemes' vocalized headwords, best first, at most 6 (kind two-words) */ rivals?: string[] }
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
const STEM_STOP = new Set(['to', 'a', 'an', 'the', 'of', 'be', 'or', 'and', 'in']);
/** The content words of a meaning, stemmed by their final s (Arab and Arabic share the stem "arab"... via the prefix rule below). */
const contentStems = (t: string): string[] => t.toLowerCase().replace(/\([^)]*\)/gu, ' ').split(/[^a-z]+/u).filter((w) => w && !STEM_STOP.has(w)).map((w) => (w.length > 3 ? w.replace(/(?:ic|s)$/u, '') : w));
const sharesWord = (a: string, b: string): boolean => { const B = contentStems(b); return contentStems(a).some((x) => B.some((y) => x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x))))); };
const RIVAL_POS = ['NOUN', 'ADJ', 'PROPN'] as const;
/**
 * AR_RIVAL_MODE = index (default) | off | both. `both` also reads the token's own other readings, which a lemma card never has (it is judged on the head read alone, so
 * the sentence's other readings do not travel) and which would hold 7-8 % of the cards: measurement only.
 */
const rivalMode = (): string => (typeof process !== 'undefined' && process.env?.AR_RIVAL_MODE) || 'index';
/**
 * The same written head is also a lexeme of another part of speech (NOUN / ADJ / PROPN) with a meaning that shares no content word with the one shown, and no
 * sentence rule decided between them (notes.identity 'sentence'): which of the two this sentence has is unchecked. The other lexeme is found in the index (same
 * vocalized head, exact part of speech) or among the token's own other readings (another part of speech of that set, whatever its confidence).
 */
export function arSameSpellingRival(top: AnalysisCandidate, cands: readonly AnalysisCandidate[]): string | undefined {
  if (rivalMode() === 'off' || !top.lemma || !top.pos || !(RIVAL_POS as readonly string[]).includes(top.pos) || text(top.notes?.identity) === 'sentence') return undefined;
  const shown = top.gloss ?? '';
  for (const p of RIVAL_POS) {
    if (p === top.pos) continue;
    const row = lookupArabicLemma(`${top.lemma}|${p}`) ?? lookupArabicLemma(`${top.lemma}|${p}|2`);
    if (row && (!shown || !sharesWord(shown, row[1]))) return `also ${p}: ${row[1] || 'no meaning'}`;
  }
  if (rivalMode() === 'both') {
    for (const c of cands) {
      if (c === top || !c.pos || c.pos === top.pos || !(RIVAL_POS as readonly string[]).includes(c.pos) || c.unconfirmed || !c.lemma) continue;
      if (!c.gloss || !shown || !sharesWord(shown, c.gloss)) return `also ${c.pos}: ${c.lemma}${c.gloss ? ' ' + c.gloss : ''}`;
    }
  }
  return undefined;
}

/** The vocalized headwords of some readings, best first, once each, at most 6. */
const headsOf = (cs: readonly AnalysisCandidate[]): string[] => [...new Set(cs.filter((c) => c.lemma).map((c) => arHeadForm(c.lemma!, c.pos ?? 'NOUN')))].slice(0, 6);
/**
 * Closed-class entries whose hand meaning the lead read and does not trust (2026-11-26): held BY LEMMA whatever their gloss source, with the reason of an
 * unreviewed leading meaning. `pos` omitted = any part of speech. Tested in test/adapters/arabic-deck-gate.test.ts.
 */
export const AR_UNREVIEWED_CLOSED: ReadonlyArray<{ head: string; pos?: string; note: string }> = [
  { head: '\u0628\u0643\u062B\u064A\u0631', note: 'the unvocalized head بكثير' },
  { head: '\u0645', note: 'the abbreviation م' },
  { head: '\u0625\u0650\u0644\u064E\u064A\u0652\u0647\u0650\u0645\u0652', note: 'whole-word adverb entry إِلَيْهِمْ' },
  { head: '\u0625\u0650\u0644\u064E\u064A\u0652\u0643\u064F\u0645\u0652', note: 'whole-word adverb entry إِلَيْكُمْ' },
  { head: '\u0644\u0650\u0645\u0651\u064E\u0627', note: 'لِمَّا' },
  { head: '\u0645\u064E\u0627', pos: 'ADV', note: 'مَا as an adverb' },
];
const isUnreviewedClosed = (lemma: string, pos: string): boolean => AR_UNREVIEWED_CLOSED.some((e) => arHeadForm(e.head, e.pos ?? pos) === arHeadForm(lemma, pos) && (!e.pos || e.pos === pos));
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
    if (rivals.size >= 2) return { id: 'undecided', reason: `undecided between ${rivals.size} readings: more evidence must decide`, rivals: headsOf(cands.filter((c) => c.confidence >= top.confidence - 0.15)) };
    return verdict('undecided', identity === 'partial' ? 'the word list for this spelling is not loaded' : identity === 'rare' ? 'a rare reading of a short unvocalized word' : `confidence ${top.confidence}`);
  }
  if (cands.some((c) => c !== top && c.confidence >= 0.5 && !c.unconfirmed && c.lemma && lemmaKey(c) !== lemmaKey(top))) return { ...verdict('two-lexemes'), rivals: headsOf(cands.filter((c) => c !== top && c.confidence >= 0.5 && !c.unconfirmed && lemmaKey(c) !== lemmaKey(top))) };
  if (text(notes.pluralEntry)) return verdict('plural-entry');
  if ((top.pos === 'PRON' || top.pos === 'DET') && (!sameLetters(top, surface) || spelledOtherwise(top.lemma, top.pos))) return verdict('pronoun-form');
  if (text(notes.spelling) === 'restored' && identity !== 'main') return verdict('restored-spelling');
  const row = arLemmaRow(top.lemma, top.pos);
  const closed = closedGloss(top.lemma, top.pos);
  if (!row && closed === undefined) return verdict('not-an-entry');
  if (!(closed ?? row?.[1] ?? '').trim()) return verdict('no-meaning');
  if (!/\p{L}/u.test((top.gloss ?? closed ?? row?.[1] ?? '').replace(/\([^()]*\)|\[[^[\]]*\]/gu, ' '))) return verdict('description-only');
  if (/(^|\s)\d+\.\s/u.test(top.gloss ?? '')) return verdict('numbered-gloss');
  const lead = (top.gloss ?? closed ?? row?.[1] ?? '').replace(/^\s*\d+\.\s*/u, '').trim();
  const verbal = top.pos === 'VERB' || top.pos === 'AUX';
  const toLead = /^to\b/iu.test(lead);
  if ((verbal && !toLead) || (!verbal && ['NOUN', 'ADJ', 'PRON', 'PROPN'].includes(top.pos) && toLead)) return verdict('gloss-pos', lead.slice(0, 40));
  const limited = arKnownLimitOf(surface);
  if (limited) return { id: 'known-misread-form', reason: `${LIMIT.get('known-misread-form')!.reason} (${limited})` };
  const badLemma = (AR_LIMITED_LEMMAS as Record<string, string>)[`${arHeadForm(top.lemma, top.pos)}|${top.pos}`];
  if (badLemma) return { id: 'known-misread-lemma', reason: `${LIMIT.get('known-misread-lemma')!.reason} (${badLemma})` };
  const shown = top.gloss ?? closed ?? '';
  const merged = /^\s*1\.\s/u.test(shown) || !!text(notes.homonyms);
  // a closed-class lexeme with a single hand-written meaning (the analyser says so: notes.glossSource = 'closed'), or a Rev / One row
  const handOk = text(notes.glossSource) === 'closed' && !merged;
  if (isUnreviewedClosed(top.lemma, top.pos)) return verdict('sense-unreviewed');
  const rival = arSameSpellingRival(top, cands);
  if (rival) return verdict('same-spelling', rival);
  const rowOk = !!row && arSenseOk(row) && (!text(notes.homonyms) || arSenseClass(row) === 'Rev');
  if (!handOk && !rowOk) return verdict('sense-unreviewed');
  return undefined;
}

/** The deck status an eligible Arabic reading may reach: never above provisional (the pack is experimental, machine-drafted). */
export const AR_DECK_STATUS_CEILING = 'provisional' as const;

/**
 * Marks the candidates of every word token the deck must not drill (see the header) and leaves everything else as it is.
 * Returns new objects for the marked tokens; an unmarked token is returned as it came.
 */
export function arMarkForDeck(tokens: readonly RawToken[], analyzed: AnalyzedToken[]): AnalyzedToken[] {
  // MEASUREMENT ONLY: AR_DECK_GATE=off gives the state before this gate (the deck audit's "before" column); never set in a product
  if (typeof process !== 'undefined' && process.env?.AR_DECK_GATE === 'off') return analyzed;
  return analyzed.map((a, i) => {
    const token = tokens[i] ?? a.token;
    if (!token?.isWord || !a.candidates.length) return a;
    const v = arDeckVerdict(token.surface, a.candidates);
    if (!v) return a;
    const gate: Record<string, string> = LIMIT.get(v.id)!.reading ? { reviewGate: 'yes' } : {};
    return { ...a, candidates: a.candidates.map((c) => ({ ...c, notes: { ...c.notes, reviewStatus: 'requires-review', reviewReason: v.reason, deckLimit: v.id, reviewKind: LIMIT.get(v.id)!.kind, ...(v.rivals?.length ? { reviewRivals: v.rivals } : {}), ...gate } })) };
  });
}
