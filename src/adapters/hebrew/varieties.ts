/**
 * The varieties of Hebrew the adapter can label: the PERIODS of one language (kind 'period', core/variety.ts), each of which
 * a learner may target, plus Biblical Aramaic as a heritage language read beside it. Nothing is suppressed: a Biblical form
 * in a Modern learner's text is shown and tracked, with a plain statement of where it belongs.
 *
 * Analysed periods (the adapter has a source for them): he-bib (Open Scriptures Hebrew Bible morphology over the Tanakh) and
 * he-mod (Wiktionary via kaikki.org). Mishnaic and Medieval Hebrew are RECOGNISED only, from the labels the dictionary puts
 * on a sense or a form; the adapter has no corpus or table for them and says so.
 */
import type { Variety } from '../../core';

export const HE_VARIETIES: Record<string, Variety> = {
  'he-bib': {
    code: 'he-bib', label: 'Biblical Hebrew', kind: 'period',
    note: 'The Hebrew of the Tanakh (roughly 1000–200 BC), as the Masoretes pointed it. Analysed from the Open Scriptures Hebrew Bible morphology aligned to the Miqra according to the Masorah text.',
  },
  'he-mish': {
    code: 'he-mish', label: 'Mishnaic (Rabbinic) Hebrew', kind: 'period',
    note: 'The Hebrew of the Mishnah, the Tosefta and the early midrashim (roughly 1st–5th century AD). Recognised from dictionary labels only: the adapter has no text or table for it.',
  },
  'he-med': {
    code: 'he-med', label: 'Medieval Hebrew', kind: 'period',
    note: 'The Hebrew of the medieval poets, philosophers and commentators. Recognised from dictionary labels only.',
  },
  'he-mod': {
    code: 'he-mod', label: 'Modern Hebrew', kind: 'period',
    note: 'The Hebrew spoken and written in Israel today, normally without vowel points. Analysed from the Wiktionary (kaikki.org) Hebrew entries and their tables; the default target of the course.',
  },
  // Not a period of Hebrew at all: the Aramaic chapters of Daniel and Ezra (and Jer 10:11, Gen 31:47). Read as their own
  // language; never evidence about Hebrew and never credited to it.
  'arc-bib': {
    code: 'arc-bib', label: 'Biblical Aramaic', kind: 'heritage',
    note: 'The Aramaic of Daniel 2:4b–7:28, Ezra 4:8–6:18 and 7:12–26, Jeremiah 10:11 and two words of Genesis 31:47: a related language written in the same letters, read as its own language.',
  },
};

/** The periods in historical order, for the Variants tab. */
export const HE_PERIOD_ORDER: readonly string[] = ['he-bib', 'he-mish', 'he-med', 'he-mod'];

/**
 * Dictionary labels (lower case, as kaikki prints them) → the period each one names, no wider. "archaic" and "obsolete" say
 * only that a word is not current, not which period it belongs to: they map to nothing here (the register tag carries them).
 */
const LABEL_VARIETIES: Readonly<Record<string, string>> = {
  'biblical hebrew': 'he-bib', biblical: 'he-bib',
  'mishnaic hebrew': 'he-mish', 'rabbinic hebrew': 'he-mish', rabbinic: 'he-mish', talmudic: 'he-mish', mishnaic: 'he-mish',
  'medieval hebrew': 'he-med', medieval: 'he-med',
  'modern hebrew': 'he-mod', 'modern-israeli': 'he-mod', 'modern israeli hebrew': 'he-mod', 'modern israeli': 'he-mod', israeli: 'he-mod',
  aramaic: 'arc-bib', 'biblical aramaic': 'arc-bib',
};

/** A dictionary's own usage labels → the variety codes above. */
export function heVarietiesFromTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const code = LABEL_VARIETIES[t.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ')];
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}
