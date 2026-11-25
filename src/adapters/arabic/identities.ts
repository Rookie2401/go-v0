/**
 * Which lexeme a bare spelling stands for when several share it (docs/arabic/PLAN.md, "Which lexeme a bare spelling credits").
 *
 * Arabic is printed without its short vowels, so about half of all running words are spelled like some other word. Leaving every
 * such word undecided would keep قال from ever counting as قَالَ; choosing the first reading would credit the wrong lexeme. So the
 * most frequent ambiguous spellings are settled ONE BY ONE in identities.json:
 *   "<key>": "<lemma id>"        the main reading: one meaning plainly dominates in ordinary prose (قال → قَالَ|VERB). The other
 *                                readings are still listed on the card, below it.
 *   "<key>": "ف+<lemma id>"      the main reading is a chain of attached function words (فقد → ف+قَدْ|PART): proclitic letters,
 *                                then the lemma id of what follows.
 *   "<key>": null                reviewed and BALANCED: a reader really has to choose (علم, كتب, ذهب). Nothing is credited until
 *                                the sentence or printed vowels decide.
 * A key that is not listed is decided by the analyser's structural rules alone (analyze.ts), or left undecided.
 *
 * The list is MACHINE-DRAFTED and reviewed entry by entry by the pack's builder; it has not been reviewed by a native speaker or
 * an Arabist. It never overrides printed vowels or the sentence: it only says which reading a bare, isolated spelling most likely is.
 * A lemma id that the installed index does not hold is ignored (the analyser checks), so the list cannot invent a word.
 */
import data from './identities.json';

export const AR_IDENTITIES: Readonly<Record<string, string | null>> = data as Record<string, string | null>;

export interface ArMainReading {
  /** Proclitic letters written before the stem, in order ("ف", "و", "ب", "ل", "ك", "ال" …); empty for a whole word. */
  proclitics: string[];
  /** The lemma id of the main reading ("قَالَ|VERB"). */
  lemmaId: string;
}

/**
 * The reviewed decision for a key: a main reading, `null` when the key is reviewed and balanced, `undefined` when it was never
 * reviewed.
 */
export function arMainOf(key: string): ArMainReading | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(AR_IDENTITIES, key)) return undefined;
  const v = AR_IDENTITIES[key];
  if (v === null) return null;
  const parts = v.split('+');
  return { proclitics: parts.slice(0, -1), lemmaId: parts[parts.length - 1] };
}

/** How many keys are reviewed, and how many of them have a main reading (for the support notes and INDEX.md). */
export function arIdentityCounts(): { reviewed: number; main: number; balanced: number } {
  const values = Object.values(AR_IDENTITIES);
  const main = values.filter((v) => v !== null).length;
  return { reviewed: values.length, main, balanced: values.length - main };
}
