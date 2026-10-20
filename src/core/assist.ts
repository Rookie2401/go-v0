/**
 * What the learner was helped with while writing (docs/GOTELL-GUIDED.md). These shapes live in core because the draft
 * and revision models carry them and the GoTell contract takes them; the prediction engine (src/gotell/predict) and the
 * editor import them from here. Nothing in core may import from an engine.
 */

/** A half-open character range [start, end) in the editor text. */
export interface Range { start: number; end: number }

/** What the learner was helped with, kept beside the text and shifted on every edit. */
export interface TextAssist {
  /** Words supplied from an English parenthetical: shown in italics for ever. */
  supplied: Range[];
  /** Words the learner typed while a ghost for that word was showing. */
  guided: Range[];
}
export const EMPTY_ASSIST: TextAssist = { supplied: [], guided: [] };

/** A word supplied for an English parenthetical ("(water)" → Wasser). */
export interface SuppliedWord {
  english: string;
  /** what the ghost shows and what the learner must type */
  surface: string;
  /** form:<lang>:<normalized(surface)> */
  itemId: string;
  /** false ⇒ ghost style 'new' */
  known: boolean;
}
