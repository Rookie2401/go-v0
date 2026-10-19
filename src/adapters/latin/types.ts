/**
 * Latin adapter: the row shapes of the seed lexicon (lexicon-data.ts, generated) and the internal lexeme model.
 * Forms are written WITHOUT macrons, with i for j; the analysis folds u/v and j/i when it looks a written word up, and
 * never changes the written form.
 */
import type { PartOfSpeech } from '../../core';

/** [lemma, genitive singular, gender (m f n c x), gloss, Vulgate count] */
export type NounRow = [lemma: string, gen: string, gender: string, gloss: string, count: number];
/** [name, genitive singular or '' (indeclinable / unknown), gender, gloss, count, origin: w = Whitaker, r = rule] */
export type ProperRow = [name: string, gen: string, gender: string, gloss: string, count: number, origin: string];
/** [lemma, present infinitive, perfect or 'stem us sum', supine, conjugation, kind, gloss, count] */
export type VerbRow = [lemma: string, inf: string, perf: string, sup: string, conj: string, kind: string, gloss: string, count: number];
/** [lemma, type, feminine / genitive, neuter, gloss, count] */
export type AdjRow = [lemma: string, type: string, fem: string, neut: string, gloss: string, count: number, cmpStem?: string, supStem?: string];
/** [lemma, gloss, count] */
export type ConjRow = [lemma: string, gloss: string, count: number];
/** [lemma, cases governed, gloss, count] */
export type PrepRow = [lemma: string, cases: string[], gloss: string, count: number];

export type Feats = Record<string, string>;

/** One generated or tabled form of a lexeme with the feature bundle that names its cell. */
export interface Cell { form: string; features: Feats; note?: string; /** the form is two words (amatus est): not looked up as one word */ periphrastic?: boolean }

export type LexKind = 'noun' | 'proper' | 'adj' | 'verb' | 'adv' | 'prep' | 'conj' | 'intj' | 'pron' | 'det' | 'num' | 'part';

/** A lexeme of the adapter: what the analysis returns a lemma for. */
export interface Lexeme {
  id: string;
  lemma: string;
  pos: PartOfSpeech;
  kind: LexKind;
  gloss: string;
  /** Vulgate occurrences (the ranking only); closed-class lexemes carry a high rank by hand. */
  count: number;
  /** Where the entry comes from: 'whitaker' (seed lexicon), 'romance' (closed-class tables ported from the Romance app), 'rule' (built by a rule: a name, a derived adverb, a compound verb). */
  origin: 'whitaker' | 'romance' | 'rule';
  /** Lemma-level facts for the card and the notes of an analysis. */
  info: { gender?: string; declension?: string; conjugation?: string; adjType?: string; principal?: string[]; deponent?: boolean; governs?: string[]; pronType?: string; indeclinable?: boolean; defective?: boolean };
  /**
   * The folded stems every form of this lexeme starts with. A lexeme with stems is found through the stem index and its cells are generated
   * only when a written form starts with one of them; a lexeme without (closed classes, compounds, irregular nouns) is expanded into the direct form index.
   */
  stems?: string[];
  /** All the one-word and two-word cells, generated once, lazily. */
  cells(): Cell[];
}

/** A closed-class lexeme as ported from the Romance app (closed-data.ts, generated). Forms are [written form, "Key=Value|Key=Value"]. */
export interface ClosedRow {
  lemma: string;
  pos: PartOfSpeech;
  kind: 'pron' | 'num' | 'part' | 'prep' | 'verb';
  gloss: string;
  /** Vulgate occurrences of the lemma (the ranking between homographs only). */
  count: number;
  pronType?: string;
  governs?: string[];
  forms: Array<[string, string]>;
}
