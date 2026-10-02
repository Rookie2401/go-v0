/**
 * Older spellings related to today's (pre-1972 spelling habits; the alphabets before 1908 are a matter of the
 * edition, recorded on the work, not of single words). The text is never changed. Package Q4.
 *
 * What is here, and why so little. The brief forbids invented history, so this covers only what overlaps with the
 * Gheg-based literary spelling that books printed in the Latin alphabet after 1908 and before the 1972 norm often
 * used (the Shkodër tradition): nji for një, tue for duke, âsht / asht for është, the participle ending -ue for -uar,
 * -ue- for -ua-, and the nasal vowel marks â ê î ô û ŷ. These are shared with gheg.ts (one engine, so the two cannot
 * drift) and returned tagged 'sq-pre1972' with a rule that says "older Gheg-based spelling". They are a reading aid,
 * machine-drafted, not checked by a speaker. Nothing else is claimed: no pre-1972 Tosk spelling habits, no spelling of
 * individual authors, and no rhotacism (that is a dialect feature, not a spelling habit).
 *
 * Not here, on purpose: the alphabets before 1908 (the Istanbul alphabet, Bashkimi, Agimi, Greek- or Arabic-script
 * Albanian). They are properties of an EDITION and are recorded on the work (`Work.orthography`), not converted word
 * by word. A text may be both older and Gheg; this function returns its answer as 'sq-pre1972' only.
 */
import { correspondences, type SqCorrespondence } from './gheg';

/** Today's spelling of an older written form, restricted to forms `known` accepts. May be empty. */
export function historicalToModern(form: string, known: (form: string) => boolean): SqCorrespondence[] {
  return correspondences(form, known, 'sq-pre1972', true);
}
