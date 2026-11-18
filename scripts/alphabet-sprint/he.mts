/** Hebrew starter words: pointed Biblical headwords with their BDB/Strong's glosses (the pack's committed core index) and the course tutorial examples. */
import { BIBLICAL_CORE } from '../../src/adapters/hebrew/generated/biblical-core';
import { transliterateHebrew } from '../../src/adapters/hebrew/pronunciation';
import { pointed } from '../../src/adapters/hebrew/text';
import { HE_TUTORIAL_STEPS_OWN } from '../../packages/language-packs/src/tutorial/he';
import { squareDependencies } from '../../packages/language-packs/src/alphabet-sprint/profiles/hebrew-script';
import { firstSense, weightFromRank, writeWords } from './lib.mts';
import type { StarterWord } from '../../packages/language-packs/src/alphabet-sprint/types';

const pron = (form: string): string | undefined => transliterateHebrew(form)?.text || undefined;
const words: StarterWord[] = [];

// course tutorial examples (a course-core word weighs high)
for (const step of HE_TUTORIAL_STEPS_OWN) {
  for (const ex of step.examples ?? []) {
    const form = pointed(ex.surface);
    if (!squareDependencies(form) || !firstSense(ex.gloss)) continue; // unpointed examples are not decoding exercises
    const p = pron(form);
    words.push({ form, gloss: firstSense(ex.gloss), ...(p ? { pronunciation: p } : {}), weight: 0.9, source: 'packages/language-packs/src/tutorial/he.ts (examples)' });
  }
}

// Biblical headwords, ranked by how often the Tanakh uses the lemma
const lemmas = Object.values(BIBLICAL_CORE.lemmas).filter(([head, gloss]) => {
  const h = pointed(head);
  return /^[א-תְ-ּׁׂ]{2,}$/.test(h) && gloss.trim() && firstSense(gloss).length > 0 && firstSense(gloss).length <= 32 && !!squareDependencies(h);
}).sort((a, b) => b[3] - a[3]);
lemmas.forEach(([head, gloss], i) => {
  const form = pointed(head);
  const p = pron(form);
  words.push({ form, gloss: firstSense(gloss), ...(p ? { pronunciation: p } : {}), weight: weightFromRank(i), source: 'src/adapters/hebrew/generated/biblical-core.ts (headword, BDB gloss)' });
});

writeWords({
  lang: 'he', words, phrases: [],
  sources: ['packages/language-packs/src/tutorial/he.ts', 'src/adapters/hebrew/generated/biblical-core.ts (Open Scriptures Hebrew Bible morphology CC BY 4.0; glosses BDB/Strong, public domain)', 'pronunciation = transliterateHebrew (src/adapters/hebrew/pronunciation.ts)', 'ranked by Tanakh lemma count'],
  note: 'Pointed forms only; glosses are the lexicon\'s, not reviewed by a Hebrew scholar. The tutorial has no translated phrases, so there are none.',
});
