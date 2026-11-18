/** Spanish starter words: the pack's core lexicons (machine-drafted, not native-reviewed), ranked by the local frequency list. */
import { COURSE_ROWS } from '../../src/adapters/spanish/lexicon-course';
import { NOUN_ROWS } from '../../src/adapters/spanish/lexicon-nouns';
import { VERB_ROWS } from '../../src/adapters/spanish/lexicon-verbs';
import { ADJECTIVE_ROWS } from '../../src/adapters/spanish/lexicon-modifiers';
import { FUNCTION_ROWS } from '../../src/adapters/spanish/function-words';
import { ES_PASSAGE } from '../../packages/language-packs/src/tutorial/es';
import { firstSense, frequencyRanks, lexiconRows, weightFromRank, writeWords } from './lib.mts';
import type { StarterWord } from '../../packages/language-packs/src/alphabet-sprint/types';

const ranks = frequencyRanks('es');
const sources: Array<[string, string]> = [
  ['src/adapters/spanish/function-words.ts', FUNCTION_ROWS], ['src/adapters/spanish/lexicon-nouns.ts', NOUN_ROWS],
  ['src/adapters/spanish/lexicon-verbs.ts', VERB_ROWS], ['src/adapters/spanish/lexicon-modifiers.ts', ADJECTIVE_ROWS],
  ['src/adapters/spanish/lexicon-course.ts', COURSE_ROWS],
];
const words: StarterWord[] = [];
for (const [source, text] of sources) {
  for (const row of lexiconRows(text)) {
    const form = row.lemma;
    if (!/^[a-záéíóúüñ]{2,9}$/.test(form)) continue; // lower-case single words only (no names, no multiword)
    const rank = ranks.get(form);
    if (ranks.size && rank === undefined) continue; // with a frequency list, only words the reading library actually uses
    words.push({ form, gloss: firstSense(row.gloss), weight: weightFromRank(rank), source });
  }
}
words.sort((a, b) => b.weight - a.weight);
writeWords({
  lang: 'es', words: words.slice(0, 300),
  phrases: ES_PASSAGE.sentences.map((s) => ({ form: s.text, gloss: s.gloss, source: 'packages/language-packs/src/tutorial/es.ts (ES_PASSAGE)' })),
  sources: [...sources.map(([s]) => s), 'packages/language-packs/src/tutorial/es.ts', ranks.size ? 'ranked by public/dict/es/frequency.json (local)' : 'unranked'],
  note: 'Machine-drafted lexicon glosses, not native-reviewed.',
});
