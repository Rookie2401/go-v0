/**
 * Korean: the dictionary's labels and the paradigm's cells, in one vocabulary (the `ko` adapter's `morphFromTags`,
 * `featuresFromTableTags` (context-free half) and `cellsFor`).
 *
 * A cell of the "All forms" table is named by a SLOT (the row of the table: "statement, polite, past") and a COLUMN (plain or
 * honorific -(으)시-). Its features are the ones the analyser gives to that form (VerbForm, Mood, SpeechLevel, Tense, Modality,
 * Aspect, Honorific, Connective) plus two the table needs to place and key the cell: `Slot` and `Honorific` (`No` or `Subj`; the
 * analyser sets only `Subj`). The generator (korean/paradigm.ts) and the dictionary mapper below both build their features here,
 * so a generated cell and a dictionary row that describe the same slot get the same key and `mergeParadigm` can compare them.
 *
 * Wiktionary's Korean tables (the `ko-conj/verb` and `ko-conj/adj` templates, 85 distinct tag sets over the 5,210 verb and adjective
 * records with a table) name their cells with `formal` (the plain 해라체, NOT the formal polite 하십시오체), `informal`
 * (해체), `polite`, `indicative / interrogative / imperative / hortative / assertive` (assertive is the -겠- statement),
 * `causative / conditional / contrastive / conjunctive` (which are connectives: -아서, -(으)면, -지만, -고 …), `determiner`
 * (before a noun), `noun-from-verb`, `infinitive` and `sequential`. The second table of a record (the honorific one) repeats the
 * same tag sets, so the tags alone never say whether a row is honorific: korean/paradigm.ts decides that from the form.
 */
import type { ParadigmCell } from '../../core';
import { featureKey } from '../../core';

export type KoLevel = 'Haera' | 'Hae' | 'Haeyo' | 'Hasipsio';
export const KO_LEVELS: readonly KoLevel[] = ['Haera', 'Hae', 'Haeyo', 'Hasipsio'];
export type KoMood = 'Ind' | 'Int' | 'Imp' | 'Prop';
export type KoTense = 'Pres' | 'Past' | 'Fut';

/** The connective slots of the table, in display order, with the ending's citation form and plain meaning. */
export const KO_CONNECTIVE_SLOTS: ReadonlyArray<readonly [id: string, cite: string, role: string]> = [
  ['and', '-고', 'and; and then'],
  ['so', '-아/어서', 'so, because; and then'],
  ['if', '-(으)면', 'if; when'],
  ['but', '-지만', 'but'],
  ['because', '-(으)니까', 'because; when (found that)'],
  ['since', '-(으)니', 'since; when (and found that)'],
  ['only-if', '-아/어야', 'only if; must (before 하다 / 되다)'],
  ['background', '-는데 / -(으)ㄴ데', 'background or contrast (…, and; but)'],
  ['and-then', '-더니', 'and then (as the speaker saw)'],
  ['intend', '-(으)려고', 'in order to; intending to'],
  ['inf', '-아/어', 'the infinitive (joins a verb to the next one)'],
];

/** The features of a slot as the analyser would give them for its forms (no `Slot`, no `Honorific`). */
export function koSlotFeatures(slot: string): Record<string, string> | undefined {
  const p = slot.split(':');
  switch (p[0]) {
    case 'stem': return p[1] === 'base' || p[1] === 'eu' || p[1] === 'aeo' ? { Stem: p[1] } : undefined;
    case 'fin': {
      const [, mood, level, tense] = p;
      if (!mood || !level || !tense) return undefined;
      return { VerbForm: 'Fin', Mood: mood, SpeechLevel: level, Tense: tense, ...(tense === 'Fut' ? { Modality: 'Presumptive' } : {}) };
    }
    case 'conn': return KO_CONNECTIVE_SLOTS.some(([id]) => id === p[1]) ? { VerbForm: 'Conn', Connective: p[1] } : undefined;
    case 'adn':
      switch (p[1]) {
        case 'pres': return { VerbForm: 'Adn', Tense: 'Pres' };
        case 'past': return { VerbForm: 'Adn', Tense: 'Past' };
        case 'prosp': return { VerbForm: 'Adn', Aspect: 'Prosp' };
        case 'retro': return { VerbForm: 'Adn', Tense: 'Past', Modality: 'Retrospective' };
      }
      return undefined;
    case 'nmlz':
      if (p[1] !== 'gi' && p[1] !== 'm') return undefined;
      return { VerbForm: 'Nmlz', Nominalizer: p[1], ...(p[2] === 'past' ? { Tense: 'Past' } : {}) };
    default: return undefined;
  }
}

/** The full feature bundle of a cell: the slot's, the slot itself and the column. */
export function koCellFeatures(slot: string, hon: boolean): Record<string, string> | undefined {
  const f = koSlotFeatures(slot);
  if (!f) return undefined;
  return { ...f, Slot: slot, Honorific: hon ? 'Subj' : 'No' };
}

// ───────────────────────────── the dictionary's table tags → a slot ─────────────────────────────

/** Tags that name no cell of the table (the row is something else: the class, a variant spelling, a romanization, a Hanja). */
const NOT_CELLS: ReadonlySet<string> = new Set([
  'class', 'table-tags', 'inflection-template', 'canonical', 'romanization', 'alternative', 'hanja', 'error-unrecognized-form', 'form-of',
  'dialectal', 'archaic', 'obsolete', 'misspelling', 'nonstandard', 'colloquial', 'dated', 'Early', 'Modern', 'contraction', 'abbreviation',
]);

/**
 * The slot a row of Wiktionary's conjugation table fills, from its tags alone (the table does not say plain or honorific: see the
 * file header). `undefined`: the tags name no cell (a header row, a variant spelling, a template left unfilled, a bare
 * `indicative`). The reading of the tags follows scripts/ko-conj-check.mts, which checked it against the generated forms (99.83 %).
 */
export function koTableSlot(tags: readonly string[]): string | undefined {
  const t = new Set(tags);
  for (const n of t) if (NOT_CELLS.has(n)) return undefined;
  const has = (...x: string[]) => x.every((y) => t.has(y));
  const polite = t.has('polite');
  const formal = t.has('formal');
  const informal = t.has('informal');
  if (t.size === 1 && t.has('infinitive')) return 'stem:aeo';
  if (t.size === 1 && t.has('sequential')) return 'conn:since';
  if (has('determiner')) {
    if (polite) return undefined; // the unfilled-template rows of 단란하다
    if (has('past')) return 'adn:past';
    if (has('present')) return 'adn:pres';
    if (has('future')) return 'adn:prosp';
    return undefined;
  }
  if (has('noun-from-verb')) {
    if (polite) return undefined;
    const kind = informal ? 'gi' : formal ? 'm' : undefined;
    if (!kind) return undefined;
    return `nmlz:${kind}${has('past') ? ':past' : ''}`;
  }
  if (has('motive-form')) return 'conn:intend';
  if (has('conditional')) return informal ? 'conn:only-if' : formal ? 'conn:if' : undefined;
  if (has('conjunctive')) return 'conn:and';
  if (has('contrastive')) return polite ? 'conn:and-then' : informal ? 'conn:background' : formal ? 'conn:but' : undefined;
  if (has('causative')) return formal ? (polite ? 'conn:because' : 'conn:inf') : polite ? 'conn:since' : informal ? 'conn:so' : undefined;
  const level: KoLevel | undefined = formal && polite ? 'Hasipsio' : formal ? 'Haera' : informal && polite ? 'Haeyo' : informal ? 'Hae' : undefined;
  if (!level) return undefined;
  if (has('assertive')) return `fin:Ind:${level}:Fut`;
  if (has('imperative')) return `fin:Imp:${level}:Pres`;
  if (has('hortative')) return `fin:Prop:${level}:Pres`;
  const mood = has('indicative') ? 'Ind' : has('interrogative') ? 'Int' : undefined;
  if (!mood) return undefined;
  return `fin:${mood}:${level}:${has('past') ? 'Past' : 'Pres'}`;
}

/** What `featuresFromTableTags` gives with no knowledge of the lemma: the plain (not honorific) cell of the slot. */
export function koFeaturesFromTableTagsPlain(tags: readonly string[], form?: string): Record<string, string> | undefined {
  if (form !== undefined && !/^[가-힣]+(?: [가-힣]+)*$/u.test(form)) return undefined; // an unfilled template ({{{stem1}}}), a label (cause, past: …) or a variant in old letters is not a form; a phrasal verb's form (못 본 체해요) is
  const slot = koTableSlot(tags);
  return slot ? koCellFeatures(slot, false) : undefined;
}

// ───────────────────────────── the dictionary's form-of labels → morphology ─────────────────────────────

/**
 * The labels of a dictionary entry that says "form of X" (먹어: infinitive of 먹다; 먹는: adnominal present of 먹다) as the analyser's
 * features. Only inflectional labels are read: `honorific`, `humble` and `causative` / `passive` of a form-of entry relate two
 * VERBS, not two forms of one, so the voice is read and the rest is not. Dialect, region, Hanja and register labels are not
 * morphology. Unknown labels are ignored, never guessed.
 */
export function koMorphFromTags(tags: readonly string[]): Record<string, string> {
  const t = new Set(tags.map((x) => x.trim().toLowerCase()));
  const out: Record<string, string> = {};
  const has = (x: string) => t.has(x);
  const adn = has('determiner') || has('adnominal') || has('attributive');
  if (adn) {
    out.VerbForm = 'Adn';
    if (has('past')) out.Tense = 'Past';
    else if (has('present')) out.Tense = 'Pres';
    else if (has('future') || has('prospective') || has('irrealis')) out.Aspect = 'Prosp';
    return out;
  }
  if (has('noun-from-verb') || has('nominal') || has('substantive')) { out.VerbForm = 'Nmlz'; if (has('past')) out.Tense = 'Past'; return out; }
  if (has('infinitive')) { out.VerbForm = 'Conn'; out.Connective = 'inf'; return out; }
  if (has('sequential')) { out.VerbForm = 'Conn'; out.Connective = 'since'; return out; }
  if (has('conditional')) { out.VerbForm = 'Conn'; out.Connective = 'if'; return out; }
  if (has('causative') && !has('form-of')) { out.VerbForm = 'Conn'; out.Connective = 'because'; }
  const mood = has('hortative') ? 'Prop' : has('imperative') ? 'Imp' : has('interrogative') ? 'Int' : has('indicative') ? 'Ind' : undefined;
  const level: KoLevel | undefined = has('formal') && has('polite') ? 'Hasipsio' : has('informal') && has('polite') ? 'Haeyo' : has('informal') ? 'Hae' : has('formal') && mood ? 'Haera' : undefined;
  if (mood || level) {
    out.VerbForm = 'Fin';
    if (mood) out.Mood = mood;
    if (level) out.SpeechLevel = level;
    if (has('past')) out.Tense = 'Past';
    else if (has('present')) out.Tense = 'Pres';
  }
  if (has('passive')) out.Voice = 'Pass';
  else if (has('causative')) out.Voice = 'Caus';
  if (has('plural')) out.Number = 'Plur';
  return out;
}

// ───────────────────────────── a reading → the cells it occupies ─────────────────────────────

/** The keys of a reading that decide which cell it is (everything else the analyser says about a form is about the word, not the cell). */
const CELL_KEYS = ['VerbForm', 'Mood', 'SpeechLevel', 'Connective', 'Aspect', 'Modality', 'Tense', 'Honorific', 'Particle', 'Number'] as const;
const splitVals = (v: string): string[] => v.split(',').map((x) => x.trim()).filter(Boolean);

/**
 * Can this cell be the one a reading names? Every key the reading gives and the cell has must agree (a union value such as
 * `Ind,Int` allows any of its parts). A key the reading lacks leaves the cell open EXCEPT the three the analyser sets only when
 * they are true: no `Tense` is not the past (먹어요 is not 먹었어요), no `Honorific` is not the honorific (먹어요 is not 먹으셔요), no
 * `Modality` is not -겠- (먹어요 is not 먹겠어요).
 */
export function koCellCompatible(cell: Readonly<Record<string, string>>, reading: Readonly<Record<string, string>>): boolean {
  if (cell.Stem !== undefined && reading.VerbForm !== undefined) return false; // a stem shape is not a reading of a word
  if (cell.VerbType === 'Cop' && reading.VerbType !== 'Cop') return false;
  if (cell.Particle !== undefined && reading.VerbType === 'Cop') return false;
  for (const k of CELL_KEYS) {
    const cv = cell[k];
    if (cv === undefined) continue;
    if (k === 'Particle') {
      const rv = reading.Particle;
      if (rv === undefined) { if (cv !== 'none') return false; continue; }
      const ids = rv.split('+').filter((x) => x !== 'plural');
      if (ids.length === 0 ? cv !== 'none' : !ids.includes(cv)) return false;
      continue;
    }
    if (k === 'Number') {
      const plural = reading.Number === 'Plur' || (reading.Particle ?? '').split('+').includes('plural');
      if ((cv === 'Plur') !== plural) return false;
      continue;
    }
    const rv = reading[k];
    if (rv === undefined) {
      if (k === 'Tense' && cv === 'Past') return false;
      if (k === 'Honorific' && cv === 'Subj') return false;
      if (k === 'Modality' && cv !== undefined && reading.VerbForm === 'Fin') return false;
      continue;
    }
    if (!splitVals(rv).includes(cv)) {
      // the plain column is `No`; a reading with Honorific=Subj never names it
      return false;
    }
  }
  return true;
}

const sameText = (a: string, b: string): boolean => a.normalize('NFC') === b.normalize('NFC');
const spells = (c: ParadigmCell, surface: string): boolean => sameText(c.form, surface) || (c.alternatives ?? []).some((a) => sameText(a, surface));

/**
 * The cells of a Korean paradigm that the selected reading occupies: the reading's features name the cells (an open mood such as
 * the 해요체 statement / question / command / suggestion names all four), then the form the reader clicked picks among them. A form no
 * feature names (the analyser read a union, or the cell vocabulary differs) falls back to every cell that spells it.
 */
export function koCellsFor(paradigm: { cells: ParadigmCell[] }, features: Record<string, string>, surface?: string): ParadigmCell[] {
  const byFeatures = Object.keys(features).length ? paradigm.cells.filter((c) => koCellCompatible(c.features, features)) : [];
  if (!surface) return byFeatures;
  const exact = byFeatures.filter((c) => spells(c, surface));
  if (exact.length) return exact;
  const anywhere = paradigm.cells.filter((c) => spells(c, surface));
  if (anywhere.length) return anywhere;
  return byFeatures;
}

/** The distinct cells by key (a helper for callers that merge two lists). */
export const koUniqueCells = (cells: ParadigmCell[]): ParadigmCell[] => { const seen = new Set<string>(); return cells.filter((c) => { const k = featureKey(c.features); if (seen.has(k)) return false; seen.add(k); return true; }); };
