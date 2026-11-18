/**
 * Reading Analysis: the messages and the shapes its three parts exchange.
 *
 *   popup (extension page)  ── READING.analysis ──▶  content script     start / status / cancel; the reply is a `ReadingStatus`
 *   popup                   ── READING.knowledge ─▶  background worker  op 'grant': this tab may ask about its words for a few minutes
 *   content script          ── READING.knowledge ─▶  background worker  op 'snapshot', then op 'classify' in bounded batches
 *
 * What crosses each line:
 *   - popup → content: a language, a text variety. Nothing about the learner.
 *   - content → background: unit ids only (`form:<lang>:<normalised word>`, `lemma:<lang>:<lemma>:<POS>`): single dictionary words, once each,
 *     in no order, never sentences. The page's text never leaves the tab.
 *   - background → content: one knowledge level per word and how the snapshot was verified. Never a learner id, a token or a row.
 * The background answers from the device's own Repository only, after bringing it level with the account (a download of the learner's own
 * events; nothing of the page is sent to the service).
 */
import type { KnowledgeLevel } from '../../../repository-contract/src/knowledge-levels';

/** One word as the content script names it: its form id, then the lemma id of every creditable reading (none = the analyser and the dictionary do not have it). */
export type WireWord = readonly [formId: string, ...readingIds: string[]];

/** At most this many words in one `classify` message (each carries a form id and usually one lemma id). More is refused, never trimmed. */
export const MAX_WORDS_PER_MESSAGE = 400;
/** A word names at most this many readings; a word with more is sent with none and counted as not identified (it is not guessed). */
export const MAX_READINGS = 6;
/** How long a popup's grant lets a tab's content script ask about its words. */
export const GRANT_MS = 10 * 60_000;

/**
 * What the device's Repository says of one word.
 *   known        Known or Automatic, on evidence that belongs to the text's variety (or the language has none)
 *   unsettled    Known or Automatic in the learner's record of the language, but nothing says in WHICH variety (Hebrew, Greek): not credited
 *   below        a level under Known (see `level`), or no record at all (`new`)
 *   ambiguous    the spelling is more than one word and the learner knows some of them, not all: not credited, not called unknown
 *   unidentified no reading and no record of the form: the word could not be tied to a unit
 */
export type WordVerdict = 'known' | 'unsettled' | 'below' | 'ambiguous' | 'unidentified';

/** One word's answer on the wire: the verdict and the level it rests on (the most established reading's, for a word below Known). */
export type WireVerdict = readonly [verdict: WordVerdict, level: KnowledgeLevel];

/** How far the knowledge the analysis read can be trusted to be the learner's whole record. */
export interface KnowledgeSnapshot {
  /** Opaque: changes whenever the device's Repository takes in an event. Two batches with different ids were not read from one state. */
  id: string;
  /** `account`: signed in, and the device was brought level with the account for this analysis. `device`: not signed in; this device's own record is the whole of it. */
  authority: 'account' | 'device';
  /**
   * verified    the device holds every event the account held at `verifiedAt` (signed in), or there is no account (this device is the record)
   * unverified  signed in, but the account could not be read to its head now (`reason`); the device's record as of `lastVerifiedAt` was used
   */
  state: 'verified' | 'unverified';
  reason?: 'offline' | 'needs-sign-in' | 'unreachable' | 'timeout' | 'incomplete' | 'refused-events' | 'mixed-accounts';
  /** Epoch ms of the check that established `state`. */
  verifiedAt?: number;
  /** Epoch ms of the last time the device was known to be level with this account, when `state` is `unverified`. */
  lastVerifiedAt?: number;
  /** Events of other devices this check brought in. */
  added?: number;
  /** Events recorded on this device that the account does not have yet (they ARE counted here; other devices do not see them yet). */
  unsent: number;
}

/** Occurrence counts. Every eligible word of the analysed text is in exactly one of them: they sum to `total`. */
export interface CoverageCounts {
  total: number;
  known: number;
  automatic: number;
  familiar: number;
  recognized: number;
  seen: number;
  new: number;
  /** Known in the language's record with no variety established (Hebrew, Greek). Not credited. */
  unsettled: number;
  ambiguous: number;
  unidentified: number;
}

export interface Coverage {
  counts: CoverageCounts;
  /** Known + Automatic occurrences: the numerator of the figure shown. */
  knownOccurrences: number;
  /** knownOccurrences / total × 100, unrounded; null when there is no eligible word. */
  knownPercent: number | null;
  /** The share that would be Known if every word that could not be decided (ambiguous, unidentified, unsettled) were Known: the top of the range. */
  upperPercent: number | null;
  /** True when no occurrence is ambiguous, unidentified or unsettled: `knownPercent` is then the exact figure under the matching rules. */
  exact: boolean;
  /** Distinct words (form + readings) the text holds. */
  distinctWords: number;
}

export interface ReadingScope {
  /** `reader`: the reading area the site's registry entry names. `main`: the page's main content. `page`: the whole page's readable text. */
  kind: 'reader' | 'main' | 'page';
  /** The document's title as the page gives it (kept in the tab; shown in the popup). */
  title: string;
  /** False when a limit stopped the reading before the end of the text that was there: the figures cover `analysedCharacters` of `characters`. */
  complete: boolean;
  characters: number;
  analysedCharacters: number;
  /** Text nodes left out because they declare another language (lang=). */
  foreignBlocks: number;
  /** Same-origin frames whose text was read with the page. */
  frames: number;
}

export interface ReadingResult {
  languageId: string;
  varietyId?: string;
  coverage: Coverage;
  scope: ReadingScope;
  snapshot: KnowledgeSnapshot;
  /** Unit ids asked of the Repository, and how many of them it answered about (a row, or "no record"). Equal, or the analysis failed. */
  lookups: { asked: number; answered: number };
  /** The dictionary's forms index could not be asked about some words (offline, not installed): they are counted as not identified. */
  dictionary: 'asked' | 'unavailable' | 'not-needed';
  /** The text's words were taken from the earlier reading of the same text (only the knowledge was read again). */
  reusedText: boolean;
  at: number;
}

export type ReadingStage = 'idle' | 'extracting' | 'resolving' | 'verifying' | 'calculating' | 'done' | 'failed' | 'canceled';

export type ReadingErrorCode =
  | 'unsupported-page'      // the reader's registry entry refuses it
  | 'unsupported-language'  // no analyser for the language in this build
  | 'variety-required'      // Hebrew or Greek: the text's variety must be said
  | 'no-text'               // nothing readable in the language
  | 'page-changed'          // the text changed while it was being read
  | 'repository-unavailable'// the device's Repository would not open
  | 'lookup-incomplete'     // a batch of words was not answered
  | 'knowledge-changing'    // the Repository kept changing under the analysis
  | 'not-granted'           // the background does not know of an analysis for this tab
  | 'error';

export interface ReadingStatus {
  ok: true;
  stage: ReadingStage;
  /** Which run this is about: a status asked for another run's id is answered with the current one. */
  runId?: string;
  progress?: { done: number; total: number };
  result?: ReadingResult;
  error?: { code: ReadingErrorCode; message: string };
  /** The text on the page is no longer the text `result` was read from. */
  stale?: boolean;
}

export type ReadingRequest =
  | { type: string; op: 'start'; languageId?: string; varietyId?: string }
  | { type: string; op: 'status' }
  | { type: string; op: 'cancel' };

export type ReadingKnowledgeRequest =
  | { type: string; op: 'grant'; tabId: number }
  | { type: string; op: 'snapshot'; languageId: string }
  | { type: string; op: 'classify'; languageId: string; varietyId?: string; snapshot: string; words: WireWord[] };

export type ReadingKnowledgeReply =
  | { ok: true; op: 'grant' }
  | { ok: true; op: 'snapshot'; snapshot: KnowledgeSnapshot }
  | { ok: true; op: 'classify'; snapshot: string; verdicts: WireVerdict[]; asked: number; answered: number }
  | { ok: false; error: 'not-granted' | 'invalid' | 'too-many' | 'repository-unavailable' | 'lookup-failed' | 'snapshot-changed'; message?: string };
