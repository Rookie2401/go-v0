/**
 * Transliteration of Hindi into Latin letters (ISO 15919). A RESCUE, never the default: the course is read in
 * Devanagari, and the word sheet shows this only when the learner asks for it at the earliest stage (the request is
 * recorded as help). It follows the pronunciation engine, so an unwritten a that is not said is not written.
 *
 * CONTRACT STUB (docs/PLAN12.md, package H1). The exported signatures are final.
 */

export interface HindiTransliteration {
  /** "kamal", "laṛkā", "prārthnā": the word as said, in ISO 15919 letters. Empty when the word cannot be read. */
  text: string;
  /** The lowest confidence of the word's units: below 0.6 the adapter does not offer it. */
  confidence: number;
}

export function transliterateHindi(surface: string): HindiTransliteration {
  void surface;
  return { text: '', confidence: 0 };
}
