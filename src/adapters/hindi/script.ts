/**
 * Devanagari as written: the units a reader's eye takes in (akṣaras), the signs on them, and forms that are the same
 * word in another spelling. Nothing here changes a text; everything is derived from it and can be derived again.
 *
 * CONTRACT STUB (docs/PLAN12.md, package H1). The exported signatures are final: other packages build against them.
 */

/** One written unit: a consonant or consonant cluster with its vowel sign and marks, or an independent vowel. */
export interface Akshara {
  text: string;
  /** Offsets within the surface, in UTF-16 code units; the units tile the word exactly. */
  start: number;
  end: number;
  /** The consonant letters in order, each with its nukta when it has one (['प', 'र'] for प्र; ['ज़'] for ज़). Empty for an independent vowel. */
  consonants: string[];
  /** The vowel as written: an independent vowel letter (आ), a vowel sign with ◌ for the consonant (◌ा), or undefined when none is written. */
  vowel?: string;
  /** Signs on the unit by name: 'nukta', 'anusvara', 'chandrabindu', 'visarga', 'virama', 'reph', 'rakar', 'avagraha'. */
  signs: string[];
  /** True when the unit ends in a visible virama: no vowel is written or meant (the त् of सत्). */
  dead: boolean;
}

/** The akṣaras of one word (NFC in, offsets into what was given). A character that is not Devanagari is a unit of its own. */
export function aksharas(surface: string): Akshara[] {
  void surface;
  return [];
}

/**
 * A form for SEARCH only: zero-width joiners removed, anusvara and the nasal conjunct it stands for folded together,
 * chandrabindu folded to anusvara, the nukta dropped. Never stored as the text and never used as a form's identity.
 */
export function hindiSearchForm(s: string): string {
  return s.normalize('NFC');
}

/**
 * Other spellings of the same word that are in ordinary use, the given form excluded: हिंदी ↔ हिन्दी (anusvara for a nasal
 * before a consonant of its class), गई ↔ गयी, चाहिए ↔ चाहिये, a nukta present or absent (ज़रूरत ↔ जरूरत), ँ ↔ ं over a long
 * vowel sign (हैं is not हें: only real variants). Returned NFC, most usual first. Empty when there is none.
 */
export function hindiSpellingVariants(form: string): string[] {
  void form;
  return [];
}
