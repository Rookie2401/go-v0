/**
 * Field-level validation states (Linguistic Engine V2, Stage 7). Every linguistic FIELD a row states carries its own state,
 * not only the row as a whole: an analysis can have a `supported` lemma and a `conflicted` feature set, a lexeme an
 * `unknown` etymology and a `provisional` pronunciation. The states are the SAME six everywhere:
 *
 *   verified     a named reviewer corrected it, or a source marked `native-reviewed` states it. Never from confidence alone.
 *   supported    one authoritative source (the dictionary table, the dictionary's etymology, the hand lexicon) states it and
 *                the rules agree or do not speak.
 *   provisional  only the rules state it (rule-derived readings, unconfirmed guesses, generated paradigm cells, generated syntax),
 *                or a learner's correction that nobody has confirmed.
 *   conflicted   two sources (or two readings within 0.15) disagree.
 *   unknown      nothing states it. This is also what an ABSENT `fieldStates` (a row written before Stage 7) reads as.
 *   invalidated  withdrawn through `invalidate` / `correct`; the row and its basis stay.
 *
 * Where each kind of knowledge lives (docs/ecosystem/linguistics/REPOSITORY-STATES.md): shared linguistic facts are
 * `LinguisticUnit` rows (etymology, pronunciation, paradigm cells, senses), contextual analyses are `FormAnalysis` rows
 * (lemma, pos, features, the cell and the syntax relation of ONE reading in ONE sentence), and learner evidence is the event
 * log (Layer B). A learner's performance never changes a field state; a correction never writes an event.
 *
 * Contract compatibility: `fieldStates` is optional everywhere; `CONTRACT_VERSION` (the event envelope) is unchanged; the
 * row revision is `CONTRACT_REVISION`.
 */

export const FIELD_STATES = ['verified', 'supported', 'provisional', 'conflicted', 'unknown', 'invalidated'] as const;
export type FieldState = (typeof FIELD_STATES)[number];

/** The fixed field names. A state for any other name is refused by `validateFieldStates`. */
export const FIELD_NAMES = ['lemma', 'pos', 'features', 'sense', 'paradigmCell', 'etymology', 'pronunciation', 'syntaxRelation', 'segmentation'] as const;
export type FieldName = (typeof FIELD_NAMES)[number];

/** Fields that describe ONE reading of a form in a sentence (stored on the `FormAnalysis`). */
export const CONTEXTUAL_FIELDS: readonly FieldName[] = ['lemma', 'pos', 'features', 'sense', 'paradigmCell', 'syntaxRelation', 'segmentation'];
/** Fields that belong to a unit whatever the sentence (stored on the lexeme / form / sense `LinguisticUnit`). */
export const SHARED_FIELDS: readonly FieldName[] = ['sense', 'paradigmCell', 'etymology', 'pronunciation'];

export interface FieldStateEntry {
  state: FieldState;
  /** Why, in one plain sentence ("the hand lexicon states it and no rule disagrees"). Never learner text. */
  basis: string;
  /** What states it: provenance refs, `dictionary:wiktionary`, `reviewer:<id>`, `learner`, `rules:adapter-sq@9`. May be empty for `unknown`. */
  sources: string[];
  /** ISO time the state was decided. */
  at?: string;
}

/** Field name to state. Partial: a field not listed reads as `unknown` (`fieldStateOf`). */
export type FieldStates = Partial<Record<FieldName, FieldStateEntry>>;

/** The revision of the Layer A row shapes: 3 is contract v3 (provenance), 3.1 adds `fieldStates`. The event envelope stays `CONTRACT_VERSION`. */
export const CONTRACT_REVISION = '3.1' as const;

/** Higher is more trustworthy. `invalidated` ranks below `unknown`: it is a withdrawn statement, not an absent one. */
export const FIELD_STATE_RANK: Record<FieldState, number> = { invalidated: 0, unknown: 1, conflicted: 2, provisional: 3, supported: 4, verified: 5 };

/** The state of a field on a row that may predate Stage 7: absent reads as `unknown`. */
export function fieldStateOf(row: { fieldStates?: FieldStates } | undefined, field: FieldName): FieldState {
  return row?.fieldStates?.[field]?.state ?? 'unknown';
}

/** The fields of `states` that are in `state`, in the fixed field order. */
export function fieldsInState(states: FieldStates | undefined, state: FieldState): FieldName[] {
  return FIELD_NAMES.filter((f) => states?.[f]?.state === state);
}

/**
 * Every STATED field becomes `invalidated` (basis keeps the old state and the reason); a field that was `unknown` or absent stays so,
 * because there is nothing to withdraw. Pure; the row itself is never removed.
 */
export function invalidateFieldStates(states: FieldStates | undefined, reason: string, at?: string): FieldStates | undefined {
  if (!states) return undefined;
  const out: FieldStates = {};
  for (const f of FIELD_NAMES) {
    const e = states[f];
    if (!e) continue;
    const when = at ?? e.at;
    out[f] = e.state === 'unknown' || e.state === 'invalidated'
      ? { ...e, sources: [...e.sources] }
      : { state: 'invalidated', basis: `was ${e.state}: ${e.basis}; withdrawn: ${reason}`.slice(0, 400), sources: [...e.sources], ...(when ? { at: when } : {}) };
  }
  return out;
}

/**
 * Monotone merge of a stored row's states with new ones: per field the HIGHER-ranked state wins (ties keep the stored one), `invalidated`
 * is terminal, and a field only the other side has is taken. Used where a shared fact is seen again (a unit met in another sentence).
 */
export function mergeFieldStates(stored: FieldStates | undefined, incoming: FieldStates | undefined): FieldStates | undefined {
  if (!stored) return incoming;
  if (!incoming) return stored;
  const out: FieldStates = {};
  for (const f of FIELD_NAMES) {
    const a = stored[f];
    const b = incoming[f];
    if (!a) { if (b) out[f] = b; continue; }
    if (!b || a.state === 'invalidated') { out[f] = a; continue; }
    out[f] = FIELD_STATE_RANK[b.state] > FIELD_STATE_RANK[a.state] ? b : a;
  }
  return out;
}

export const sameFieldStates = (a: FieldStates | undefined, b: FieldStates | undefined): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export const MAX_FIELD_BASIS_CHARS = 400;
export const MAX_FIELD_SOURCES = 20;

/** Runtime check: known field names, a known state, a bounded basis, a list of source strings. Absent is valid (pre-Stage 7 rows). */
export function validateFieldStates(s: unknown, path = 'fieldStates'): Array<{ path: string; message: string }> {
  if (s === undefined) return [];
  if (!s || typeof s !== 'object' || Array.isArray(s)) return [{ path, message: 'object of field states' }];
  const out: Array<{ path: string; message: string }> = [];
  for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
    const p = `${path}.${k}`;
    if (!(FIELD_NAMES as readonly string[]).includes(k)) { out.push({ path: p, message: `unknown field name; one of ${FIELD_NAMES.join(', ')}` }); continue; }
    if (!v || typeof v !== 'object' || Array.isArray(v)) { out.push({ path: p, message: 'object' }); continue; }
    const e = v as Record<string, unknown>;
    if (!(FIELD_STATES as readonly string[]).includes(String(e.state))) out.push({ path: `${p}.state`, message: `one of ${FIELD_STATES.join(', ')}` });
    if (typeof e.basis !== 'string' || e.basis.length > MAX_FIELD_BASIS_CHARS) out.push({ path: `${p}.basis`, message: `string of at most ${MAX_FIELD_BASIS_CHARS} characters` });
    if (!Array.isArray(e.sources) || e.sources.length > MAX_FIELD_SOURCES || e.sources.some((x) => typeof x !== 'string' || x.length > 300)) out.push({ path: `${p}.sources`, message: `list of at most ${MAX_FIELD_SOURCES} strings` });
    if (e.at !== undefined && (typeof e.at !== 'string' || Number.isNaN(Date.parse(e.at)))) out.push({ path: `${p}.at`, message: 'ISO 8601 timestamp' });
  }
  return out;
}
