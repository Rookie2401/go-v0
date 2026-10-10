/**
 * Paradigms (GoLearn Linguistic Engine V2, Stage 3): the complete set of forms a lexeme can take, as ONE shape every
 * language shares, with per-cell provenance and a validation state. A paradigm is never a guess presented as fact:
 *
 *   - `generated`   the adapter's own morphology produced the form (rules + its irregular tables);
 *   - `wiktionary`  the form stands in the dictionary's inflection table (kaikki/Wiktextract, CC BY-SA);
 *   - a cell both agree on is `verified`; one only the dictionary has is `supported`; one only the rules produced is
 *     `generated`; a cell where they disagree is `conflicted` and carries both forms. The learner sees the state.
 *
 * Features use the UD-style keys the adapters already use (Case, Number, Gender, Definite, Person, Tense, Mood,
 * VerbForm, Voice, Aspect, Degree, Polite, ...). A language whose words do not inflect (Thai) has no paradigm of this
 * kind and returns `kind: 'none'` with its constructions instead (the card shows those, never an empty table).
 */
import type { PartOfSpeech } from './model';

export type ParadigmKind = 'noun-declension' | 'adjective-declension' | 'verb-conjugation' | 'pronoun-paradigm' | 'determiner-paradigm' | 'none';
export type CellSource = 'generated' | 'wiktionary';
export type CellStatus = 'verified' | 'supported' | 'generated' | 'conflicted';

export interface ParadigmCell {
  /** The form shown (the generated one, or the dictionary's when only it has one; on conflict the dictionary's first). */
  form: string;
  /** The feature bundle that names the cell (sorted keys, stable: `featureKey()` identifies the cell). */
  features: Record<string, string>;
  /** Who produced the form. */
  sources: CellSource[];
  status: CellStatus;
  /** On `conflicted`: the other form(s). On `verified`/`supported`: any variant spellings the dictionary lists. */
  alternatives?: string[];
  /** Plain-words note about this cell when it needs one ("colloquial", "archaic", "the stem changes before -i"). */
  note?: string;
}

/** How the card lays the cells out: rows × columns over two feature keys, grouped into sections by the others. */
export interface ParadigmLayout {
  /** The feature key spread over the columns and the order of its values (`[value, label]`). */
  columns: { key: string; values: Array<[string, string]> };
  /** The feature key spread over the rows and the order of its values. */
  rows: { key: string; values: Array<[string, string]> };
  /** The feature keys that split the table into sections (each distinct combination is one section, in this order of keys). */
  sections?: string[];
  /** Labels for section values, by key then value. */
  labels?: Record<string, Record<string, string>>;
}

export interface Paradigm {
  languageId: string;
  lemma: string;
  pos: PartOfSpeech;
  kind: ParadigmKind;
  /** The cells; empty for `kind: 'none'`. */
  cells: ParadigmCell[];
  layout?: ParadigmLayout;
  /** The inflection class or template, when the morphology names one ("sq-noun-m", "strong verb, class 3", "-ar"). */
  template?: string;
  /** Whole-paradigm notes: irregularity, defectiveness, what is not covered. Plain words, never invented facts. */
  notes: string[];
  /** The sources that contributed: the adapter (versioned) and the dictionary (name, licence). */
  sources: Array<{ id: string; label: string; licence?: string }>;
  /** The worst cell status, or `none` when there are no cells. */
  status: CellStatus | 'none';
  /** For a language that does not inflect: the constructions the card shows instead (ids the pack explains). */
  constructions?: string[];
}

/** What an adapter's `paradigm()` returns: its generated cells (no status yet) with the layout and notes; `mergeParadigm` adds the dictionary half. */
export interface GeneratedParadigm {
  kind: ParadigmKind;
  cells: Array<{ features: Record<string, string>; form: string; note?: string }>;
  layout?: ParadigmLayout;
  template?: string;
  notes: string[];
  /** For `kind: 'none'`: the construction ids the card shows instead. */
  constructions?: string[];
}

/** A stable key for a feature bundle: `Case=Acc|Definite=Def|Number=Sing` (sorted). */
export function featureKey(features: Record<string, string>): string {
  return Object.keys(features).sort().map((k) => `${k}=${features[k]}`).join('|');
}

/** The cell whose features equal the given bundle (the selected form's), if any. */
export function cellOf(p: Pick<Paradigm, 'cells'>, features: Record<string, string>): ParadigmCell | undefined {
  const key = featureKey(features);
  return p.cells.find((c) => featureKey(c.features) === key);
}

/** The cells whose form equals the given surface (lower-cased, NFC): how the card highlights the selected form when the features are not known. */
export function cellsWithForm(p: Pick<Paradigm, 'cells'>, surface: string): ParadigmCell[] {
  const s = surface.normalize('NFC').toLowerCase();
  return p.cells.filter((c) => c.form.normalize('NFC').toLowerCase() === s || (c.alternatives ?? []).some((a) => a.normalize('NFC').toLowerCase() === s));
}

/**
 * The cells the selected reading occupies, when the adapter has no projection of its own: union values ("Fem,Masc",
 * "Imp,Ind") are split into every combination, keys no cell carries are dropped, and a cell that carries every selected
 * feature (and more) counts when no exact cell exists. Falls back to the cells whose form is the surface. Never guesses
 * beyond the features given.
 */
export function cellsForSelection(p: Pick<Paradigm, 'cells'>, features: Record<string, string>, surface?: string): ParadigmCell[] {
  const keysInCells = new Set<string>();
  for (const c of p.cells) for (const k of Object.keys(c.features)) keysInCells.add(k);
  const entries = Object.entries(features).filter(([k, v]) => keysInCells.has(k) && typeof v === 'string' && v.trim());
  let combos: Array<Record<string, string>> = [{}];
  for (const [k, v] of entries) {
    const vals = v.split(',').map((x) => x.trim()).filter(Boolean);
    combos = combos.flatMap((c) => vals.map((x) => ({ ...c, [k]: x })));
    if (combos.length > 64) break;
  }
  let out: ParadigmCell[] = [];
  if (entries.length) {
    const wanted = new Set(combos.map(featureKey));
    out = p.cells.filter((c) => wanted.has(featureKey(c.features)));
    if (!out.length) out = p.cells.filter((c) => combos.some((combo) => Object.entries(combo).every(([k, v]) => c.features[k] === v)));
    if (out.length > 1 && surface) {
      const s = surface.normalize('NFC').toLowerCase();
      const narrowed = out.filter((c) => c.form.normalize('NFC').toLowerCase() === s || (c.alternatives ?? []).some((a) => a.normalize('NFC').toLowerCase() === s));
      if (narrowed.length) out = narrowed;
    }
  }
  if (!out.length && surface) out = cellsWithForm(p, surface);
  return out;
}

/** Alternative cuts of a selection into words, for a script without word spaces (Thai): the adapter's chosen cut and the others the word list allows. */
export interface SegmentationWord { text: string; known: boolean; lemma?: string; pos?: string; gloss?: string }
export interface SegmentationCut { words: SegmentationWord[]; /** Share of the plausibility among the cuts considered (not a probability). */ confidence: number; basis: string }
export interface SegmentationAlternatives { text: string; chosen: SegmentationCut; alternatives: SegmentationCut[]; /** Present when there are no alternatives: why only the chosen cut is plausible. */ reason?: string }

const RANK: Record<CellStatus, number> = { verified: 0, supported: 1, generated: 2, conflicted: 3 };

/**
 * Merge the adapter's generated cells with the dictionary's table cells (already mapped to the same feature keys by the
 * language's tag map) into one paradigm with per-cell status. Cells present in only one source keep that source's form;
 * a cell in both with different forms is `conflicted` (the dictionary's form first, the generated one in `alternatives`).
 */
export function mergeParadigm(base: Omit<Paradigm, 'cells' | 'status'>, generated: Array<{ features: Record<string, string>; form: string; note?: string }>, wiktionary: Array<{ features: Record<string, string>; form: string; note?: string }>): Paradigm {
  const byKey = new Map<string, ParadigmCell>();
  for (const g of generated) {
    const key = featureKey(g.features);
    const cell = byKey.get(key);
    if (!cell) byKey.set(key, { form: g.form, features: { ...g.features }, sources: ['generated'], status: 'generated', ...(g.note ? { note: g.note } : {}) });
    else if (cell.form !== g.form) cell.alternatives = [...new Set([...(cell.alternatives ?? []), g.form])];
  }
  for (const w of wiktionary) {
    const key = featureKey(w.features);
    const cell = byKey.get(key);
    if (!cell) { byKey.set(key, { form: w.form, features: { ...w.features }, sources: ['wiktionary'], status: 'supported', ...(w.note ? { note: w.note } : {}) }); continue; }
    if (cell.sources.includes('wiktionary')) {
      // a second dictionary form for the same cell (variant spellings)
      if (cell.form !== w.form) cell.alternatives = [...new Set([...(cell.alternatives ?? []), w.form])];
      continue;
    }
    cell.sources.push('wiktionary');
    const same = cell.form.normalize('NFC') === w.form.normalize('NFC') || (cell.alternatives ?? []).some((a) => a.normalize('NFC') === w.form.normalize('NFC'));
    if (same) { cell.status = 'verified'; }
    else { cell.status = 'conflicted'; cell.alternatives = [...new Set([cell.form, ...(cell.alternatives ?? [])])]; cell.form = w.form; }
  }
  const cells = [...byKey.values()];
  const status: Paradigm['status'] = cells.length ? cells.map((c) => c.status).sort((a, b) => RANK[b] - RANK[a])[0] : 'none';
  return { ...base, cells, status };
}

/** Count of cells per status, for reports and the card's one-line summary ("24 forms: 20 verified, 4 from the rules only"). */
export function paradigmSummary(p: Paradigm): Record<CellStatus, number> {
  const out: Record<CellStatus, number> = { verified: 0, supported: 0, generated: 0, conflicted: 0 };
  for (const c of p.cells) out[c.status]++;
  return out;
}
