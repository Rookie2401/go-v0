/**
 * Transliteration of Hindi into Latin letters (ISO 15919). A RESCUE, never the default: the course is read in
 * Devanagari, and the word sheet shows this only when the learner asks for it at the earliest stage (the request is
 * recorded as help). It follows the pronunciation engine, so an unwritten a that is not said is not written, and an
 * unwritten a the rules cannot decide is written (and lowers the confidence).
 *
 * MACHINE-DRAFTED (package H1, docs/PLAN12.md). Conventions: ए and ओ are written e and o as Hindi is said; a nasal
 * vowel or an anusvara before a non-stop is ṁ; before a stop the anusvara is written as that stop's nasal (ṅ ñ ṇ n m);
 * ड़ ढ़ are ṛ ṛh; the nukta letters are q ḵẖ ġ z f; ज्ञ is jñ (ISO spelling, although it is said gy); ऋ is r̥.
 *
 * The exported signatures are final.
 */
import { decodeHindi } from './pronunciation';

export interface HindiTransliteration {
  /** "kamal", "laṛkā", "prārthnā": the word as said, in ISO 15919 letters. Empty when the word cannot be read. */
  text: string;
  /** The lowest confidence of the word's units: below 0.6 the adapter does not offer it. */
  confidence: number;
}

export function transliterateHindi(surface: string): HindiTransliteration {
  const units = decodeHindi(surface);
  if (units.length === 0) return { text: '', confidence: 0 };
  let text = '';
  let confidence = 1;
  for (const u of units) {
    if (u.romanization === undefined || u.confidence <= 0) return { text: '', confidence: 0 };
    text += u.romanization;
    if (u.confidence < confidence) confidence = u.confidence;
  }
  return { text, confidence };
}
