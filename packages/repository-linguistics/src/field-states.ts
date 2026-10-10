/**
 * fieldStatesFor — the ONE place that decides the validation state of each linguistic FIELD (Linguistic Engine V2, Stage 7).
 * Pure: it reads what the sources said and writes nothing. Documented with the same rules in
 * docs/ecosystem/linguistics/REPOSITORY-STATES.md.
 *
 * THE RULES (the first that applies to a field decides):
 *   verified     only with a NAMED reviewer's correction (`reviewer.id`, or a reading whose provenance source is `reviewer`), or a
 *                reading from a source marked `native-reviewed` (`nativeReviewed`). Confidence alone, and two machine sources that
 *                agree, never make a field verified.
 *   supported    one authoritative source states it (the hand lexicon or a dictionary at confidence >= 0.85, the dictionary's
 *                paradigm table or etymology) and the rules agree or do not speak (no competing reading within 0.15).
 *   provisional  only the rules state it: a rule-derived or parser reading, an unconfirmed guess from a word ending, a dictionary
 *                reading below 0.85, a generated paradigm cell, generated syntax, a learner's unconfirmed correction.
 *   conflicted   two sources disagree: readings within 0.15 of the top confidence that differ in the field; a conflicted paradigm
 *                cell; syntax of status `conflicted`; segmentation alternatives within 0.15.
 *   unknown      nothing states the field.
 *   invalidated  never produced here. Only `invalidate` / `correct` withdraw a row (`invalidateFieldStates` in the contract).
 *
 * The existing analysis-level `statusFor` is split across lemma / pos / features:
 *   lemma      conflicted when the competing readings name different lemmas;
 *   pos        conflicted when they name different parts of speech;
 *   features   conflicted when the readings share the lemma and differ only in features (if the lemma itself is contested,
 *              the features are at best provisional: a contested lemma cannot lend its features a better state);
 *   sense      follows the lemma (a sense belongs to its lexeme);
 *   supported  = the old `high-confidence` source test (hand lexicon / dictionary, not unconfirmed, confidence >= 0.85).
 *
 * Mapping of the other statuses:
 *   ParadigmCell.status  generated -> provisional; supported (dictionary only) -> supported; verified (rules AND dictionary agree)
 *                        -> supported, because two machine sources agreeing is not a person's check; conflicted -> conflicted.
 *   enrich FieldStatus   supported-by-source -> supported; provisional; conflicted; unknown; verified -> supported unless a named
 *                        reviewer or a native-reviewed source stands behind it.
 *   SyntaxRelation       generated -> provisional (rules never verify themselves); conflicted -> conflicted; no relation -> unknown.
 */
import { FIELD_NAMES, FIELD_STATE_RANK } from '../../repository-contract/src';
import type { AnalysisCandidate, FieldName, FieldState, FieldStateEntry, FieldStates } from '../../repository-contract/src';
import { unitIds } from '../../repository-contract/src';

/** Two readings this close in confidence are treated as competing. */
export const CLOSE = 0.15;
/** The confidence from which a hand-lexicon / dictionary reading is `supported` (the old `high-confidence`). */
export const HIGH_CONFIDENCE = 0.85;

/** A reading plus what the producer knows about it that the contract's candidate does not carry. */
export interface FieldReading extends AnalysisCandidate {
  /** A guess from the ending of a word the list does not know. */
  unconfirmed?: boolean;
  /** The reading's source is marked `native-reviewed` by its adapter. */
  nativeReviewed?: boolean;
}

/** The label a dictionary-fed view gives a field (enrich's `FieldStatus`); `supported` is accepted as a synonym of `supported-by-source`. */
export type ExternalStatus = 'verified' | 'supported-by-source' | 'supported' | 'provisional' | 'conflicted' | 'unknown';
export interface ExternalField {
  status: ExternalStatus;
  /** What stated it (`wiktionary`, `adapter-sq@9 rules`). */
  source?: string;
  /** A named reviewer or a native-reviewed source stands behind this field (only then may `verified` stay verified). */
  reviewerId?: string;
  nativeReviewed?: boolean;
}
export type CellStatusIn = 'verified' | 'supported' | 'generated' | 'conflicted';
export type SyntaxStatusIn = 'generated' | 'conflicted';

export interface FieldStatesInput {
  /** Every reading of the form (the whole analysis). */
  readings: FieldReading[];
  /** The chosen reading's index; absent = the highest confidence, the first on a tie. */
  chosen?: number;
  /** A named reviewer's verdict on this analysis; `fields` limits what it verifies (default: every field the chosen reading states). */
  reviewer?: { id: string; fields?: FieldName[] };
  /** The status of the paradigm cell(s) the chosen reading occupies (`ParadigmCell.status`). */
  paradigmCells?: Array<{ status: CellStatusIn; reviewerId?: string }>;
  etymology?: ExternalField;
  pronunciation?: ExternalField;
  /** The chosen token's syntax relation(s) (`SyntaxRelation.status`). */
  syntax?: { status: SyntaxStatusIn; source?: string } | Array<{ status: SyntaxStatusIn; source?: string }>;
  /** How the word was cut into morphs / words: who cut it, and the confidences of the cuts it kept. */
  segmentation?: { origin: 'rule' | 'dictionary' | 'hand-lexicon'; confidence?: number; alternativeConfidences?: number[]; source?: string };
  now: string;
}

const entry = (state: FieldState, basis: string, sources: string[], at: string): FieldStateEntry => ({ state, basis: basis.slice(0, 400), sources: [...new Set(sources)], at });
const minState = (states: FieldState[]): FieldState => states.reduce((a, b) => (FIELD_STATE_RANK[b] < FIELD_STATE_RANK[a] ? b : a));
const posOf = (r: AnalysisCandidate): string | undefined => r.lexemeId?.split(':')[3] || undefined;
const featureKeyOf = (r: AnalysisCandidate): string => unitIds.featureKey(r.features ?? {});
const hasFeatures = (r: AnalysisCandidate): boolean => Object.keys(r.features ?? {}).length > 0;
const lexical = (r: AnalysisCandidate): boolean => r.provenance.source === 'hand-lexicon' || r.provenance.source === 'dictionary';

/** What the reading's own source supports for a field it states (before any conflict is considered). */
function sourceState(r: FieldReading, at: string): FieldStateEntry {
  const ref = r.provenance.ref;
  if (r.unconfirmed) return entry('provisional', 'a guess from the ending of a word the list does not know', [ref], at);
  if (lexical(r)) {
    return r.confidence >= HIGH_CONFIDENCE
      ? entry('supported', `${r.provenance.source === 'dictionary' ? 'the dictionary' : 'the hand lexicon'} states it and no competing reading within ${CLOSE} disagrees`, [ref], at)
      : entry('provisional', `the ${r.provenance.source === 'dictionary' ? 'dictionary' : 'hand lexicon'} states it but its confidence ${r.confidence.toFixed(2)} is below ${HIGH_CONFIDENCE}`, [ref], at);
  }
  return entry('provisional', 'only the rules state it', [ref], at);
}

const fromExternal = (label: string, e: ExternalField | undefined, at: string): FieldStateEntry => {
  if (!e) return entry('unknown', `no source states the ${label}`, [], at);
  const src = [e.source ?? label];
  switch (e.status) {
    case 'verified':
      if (e.reviewerId) return entry('verified', `${label} confirmed by reviewer ${e.reviewerId}`, [...src, `reviewer:${e.reviewerId}`], at);
      if (e.nativeReviewed) return entry('verified', `${label} from a native-reviewed source`, src, at);
      return entry('supported', `${label} is called verified by its source, but no named reviewer stands behind it: supported`, src, at);
    case 'supported-by-source': case 'supported': return entry('supported', `${label} stated by ${e.source ?? 'the dictionary'}`, src, at);
    case 'provisional': return entry('provisional', `${label} stated only by the rules`, src, at);
    case 'conflicted': return entry('conflicted', `sources disagree about the ${label}`, src, at);
    default: return entry('unknown', `no source states the ${label}`, [], at);
  }
};

function fromCells(cells: FieldStatesInput['paradigmCells'], at: string): FieldStateEntry {
  if (!cells?.length) return entry('unknown', 'no paradigm cell is stated for this reading', [], at);
  const each: FieldState[] = cells.map((c) => {
    if (c.status === 'conflicted') return 'conflicted';
    if (c.status === 'generated') return 'provisional';
    if (c.status === 'verified' && c.reviewerId) return 'verified';
    return 'supported'; // supported (dictionary only) and verified (rules and dictionary agree, nobody checked)
  });
  const state = minState(each);
  const why: Record<FieldState, string> = {
    verified: 'a named reviewer confirmed the cell', supported: 'the dictionary table states the cell and the rules agree or do not speak',
    provisional: 'only the rules generated the cell', conflicted: 'the rules and the dictionary give different forms for the cell',
    unknown: 'nothing states the cell', invalidated: 'withdrawn',
  };
  return entry(state, why[state], cells.map((c) => `paradigm:${c.status}`), at);
}

function fromSyntax(s: FieldStatesInput['syntax'], at: string): FieldStateEntry {
  const list = s === undefined ? [] : Array.isArray(s) ? s : [s];
  if (!list.length) return entry('unknown', 'the adapter produced no syntax relation for this word', [], at);
  const state = minState(list.map((r): FieldState => (r.status === 'conflicted' ? 'conflicted' : 'provisional')));
  const src = list.map((r) => r.source ?? 'adapter syntax rules');
  return state === 'conflicted'
    ? entry('conflicted', 'the rules cannot rule out another head or relation and keep both', src, at)
    : entry('provisional', 'generated by the adapter rules; rules never verify themselves', src, at);
}

function fromSegmentation(s: FieldStatesInput['segmentation'], at: string): FieldStateEntry {
  if (!s) return entry('unknown', 'no segmentation is stated', [], at);
  const src = [s.source ?? `segmentation:${s.origin}`];
  if (s.confidence !== undefined && (s.alternativeConfidences ?? []).some((a) => a >= s.confidence! - CLOSE)) {
    return entry('conflicted', `another cut is within ${CLOSE} of the chosen one`, src, at);
  }
  return s.origin === 'rule'
    ? entry('provisional', 'only the rules chose this cut', src, at)
    : entry('supported', `${s.origin === 'dictionary' ? 'the dictionary' : 'the hand lexicon'} states this cut and no other is close`, src, at);
}

/** The state of every field (all nine, `unknown` where nothing states it). Use `contextualFieldStates` / `sharedFieldStates` to pick what a row stores. */
export function fieldStatesFor(input: FieldStatesInput): Required<FieldStates> {
  const at = input.now;
  const { readings } = input;
  const out = {} as Required<FieldStates>;
  const unknown = (what: string): FieldStateEntry => entry('unknown', `no source states the ${what}`, [], at);

  // ── the chosen reading and the readings competing with it ──
  let ci = input.chosen;
  if (ci === undefined || ci < 0 || ci >= readings.length) {
    ci = undefined;
    readings.forEach((r, i) => { if (ci === undefined || r.confidence > readings[ci].confidence) ci = i; });
  }
  const chosen = ci === undefined ? undefined : readings[ci];
  if (!chosen) {
    for (const f of FIELD_NAMES) out[f] = unknown(f);
  } else {
    const top = Math.max(...readings.map((r) => r.confidence));
    const rivals = readings.filter((r, i) => i !== ci && r.confidence >= top - CLOSE && chosen.confidence >= top - CLOSE);
    const sameLexeme = (r: FieldReading): boolean => (r.lexemeId ?? '') === (chosen.lexemeId ?? '');
    const lemmaConflict = !!chosen.lexemeId && rivals.some((r) => !sameLexeme(r));
    const posConflict = !!posOf(chosen) && rivals.some((r) => !!posOf(r) && posOf(r) !== posOf(chosen));
    const featuresConflict = hasFeatures(chosen) && rivals.some((r) => sameLexeme(r) && featureKeyOf(r) !== featureKeyOf(chosen));
    const lemmas = [...new Set([chosen.lexemeId, ...rivals.map((r) => r.lexemeId)].filter((x): x is string => !!x))].map((l) => l.split(':')[2] ?? l);

    // what the chosen reading states at all
    const states: Record<'lemma' | 'pos' | 'features' | 'sense', boolean> = {
      lemma: !!chosen.lexemeId, pos: !!posOf(chosen), features: hasFeatures(chosen), sense: !!chosen.senseId,
    };
    const reviewerId = input.reviewer?.id ?? (chosen.provenance.source === 'reviewer' ? (chosen.provenance.validatedBy || 'reviewer') : undefined);
    const named = reviewerId !== undefined && reviewerId.length > 0;
    const verifiedFields = new Set<FieldName>(named ? (input.reviewer?.fields ?? (Object.keys(states) as FieldName[]).filter((f) => states[f as keyof typeof states])) : []);
    const learner = chosen.provenance.source === 'learner';

    const decide = (field: 'lemma' | 'pos' | 'features' | 'sense', conflict: boolean, why: string, capProvisional = false): FieldStateEntry => {
      if (!states[field]) return unknown(field);
      if (named && verifiedFields.has(field)) return entry('verified', `corrected by reviewer ${reviewerId}`, [`reviewer:${reviewerId}`, chosen.provenance.ref], at);
      if (chosen.nativeReviewed) return entry('verified', 'the reading comes from a native-reviewed source', [chosen.provenance.ref], at);
      if (learner) return entry('provisional', "a learner's correction that nobody has confirmed", ['learner'], at);
      if (conflict) return entry('conflicted', why, [chosen, ...rivals].map((r) => r.provenance.ref), at);
      const s = sourceState(chosen, at);
      return capProvisional && FIELD_STATE_RANK[s.state] > FIELD_STATE_RANK.provisional
        ? entry('provisional', 'the lemma is contested, so these features cannot be better than provisional', s.sources, at)
        : s;
    };
    out.lemma = decide('lemma', lemmaConflict, `readings within ${CLOSE} name different lemmas: ${lemmas.join(', ')}`);
    out.pos = decide('pos', posConflict, `readings within ${CLOSE} name different parts of speech`);
    out.features = decide('features', featuresConflict, `readings of the same lemma within ${CLOSE} differ only in their features`, lemmaConflict);
    out.sense = decide('sense', lemmaConflict, `the lemma is contested (${lemmas.join(', ')}), so its sense is too`);

    out.paradigmCell = fromCells(input.paradigmCells, at);
    out.etymology = fromExternal('etymology', input.etymology, at);
    out.pronunciation = fromExternal('pronunciation', input.pronunciation, at);
    out.syntaxRelation = fromSyntax(input.syntax, at);
    out.segmentation = fromSegmentation(input.segmentation, at);
    // a named reviewer who lists one of the externally fed fields verifies it, when something states it at all
    if (named) {
      for (const f of input.reviewer?.fields ?? []) {
        if ((f === 'paradigmCell' || f === 'etymology' || f === 'pronunciation' || f === 'syntaxRelation' || f === 'segmentation') && out[f].state !== 'unknown' && out[f].state !== 'invalidated') {
          out[f] = entry('verified', `confirmed by reviewer ${reviewerId}`, [...out[f].sources, `reviewer:${reviewerId}`], at);
        }
      }
    }
    return out;
  }
  // no reading at all: the externally supplied fields can still be stated
  out.paradigmCell = fromCells(input.paradigmCells, at);
  out.etymology = fromExternal('etymology', input.etymology, at);
  out.pronunciation = fromExternal('pronunciation', input.pronunciation, at);
  out.syntaxRelation = fromSyntax(input.syntax, at);
  out.segmentation = fromSegmentation(input.segmentation, at);
  return out;
}

/** The fields an analysis stores (one reading in one sentence). */
export function contextualFieldStates(all: FieldStates): FieldStates {
  const out: FieldStates = {};
  for (const f of ['lemma', 'pos', 'features', 'sense', 'paradigmCell', 'syntaxRelation', 'segmentation'] as const) if (all[f]) out[f] = all[f];
  return out;
}

/** The fields a unit stores, picked by the caller (a form: pronunciation, etymology, paradigmCell; a sense unit: sense); only fields something states. */
export function pickFieldStates(all: FieldStates, fields: readonly FieldName[]): FieldStates | undefined {
  const out: FieldStates = {};
  for (const f of fields) if (all[f] && all[f]!.state !== 'unknown') out[f] = all[f];
  return Object.keys(out).length ? out : undefined;
}
