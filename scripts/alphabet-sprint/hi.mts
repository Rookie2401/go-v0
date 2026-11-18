/** Hindi starter words: the pack's committed lexicons (machine-drafted, not native-reviewed), ranked by the local frequency list. Pronunciation is the pack's own ISO 15919 transliteration. */
import { FUNCTION_ROWS } from '../../src/adapters/hindi/lexicon-function';
import { VERB_ROWS } from '../../src/adapters/hindi/lexicon-verbs';
import { ADJECTIVE_ROWS } from '../../src/adapters/hindi/lexicon-modifiers';
import { NOUN_HOME_ROWS } from '../../src/adapters/hindi/lexicon-nouns-home';
import { NOUN_WORLD_ROWS } from '../../src/adapters/hindi/lexicon-nouns-world';
import { NOUN_FAITH_ROWS } from '../../src/adapters/hindi/lexicon-nouns-faith';
import { WORD_MORE_ROWS } from '../../src/adapters/hindi/lexicon-more-words';
import { NUMBER_TIME_ROWS } from '../../src/adapters/hindi/lexicon-numbers-time';
import { transliterateHindi } from '../../src/adapters/hindi/translit';
import { firstSense, frequencyRanks, lexiconRows, weightFromRank, writeWords } from './lib.mts';
import type { StarterWord } from '../../src/alphabet/sprint/types';

const ranks = frequencyRanks('hi');
const sources: Array<[string, string]> = [
  ['src/adapters/hindi/lexicon-function.ts', FUNCTION_ROWS], ['src/adapters/hindi/lexicon-nouns-home.ts', NOUN_HOME_ROWS],
  ['src/adapters/hindi/lexicon-nouns-world.ts', NOUN_WORLD_ROWS], ['src/adapters/hindi/lexicon-nouns-faith.ts', NOUN_FAITH_ROWS],
  ['src/adapters/hindi/lexicon-verbs.ts', VERB_ROWS], ['src/adapters/hindi/lexicon-modifiers.ts', ADJECTIVE_ROWS],
  ['src/adapters/hindi/lexicon-more-words.ts', WORD_MORE_ROWS], ['src/adapters/hindi/lexicon-numbers-time.ts', NUMBER_TIME_ROWS],
];
const words: StarterWord[] = [];
for (const [source, text] of sources) {
  for (const row of lexiconRows(text)) {
    const form = row.lemma;
    if (!/^[ऀ-ॿ]{2,7}$/.test(form) || /[।॥ऽ॰]/.test(form)) continue; // short Devanagari words only
    const rank = ranks.get(form);
    if (ranks.size && rank === undefined) continue;
    const gloss = firstSense(row.gloss);
    if (!gloss || /^(name|given name)/i.test(gloss)) continue;
    const t = transliterateHindi(form);
    if (!t.text || t.confidence < 0.8) continue; // only readings the pack's rules are sure of
    words.push({ form, gloss, pronunciation: t.text, weight: weightFromRank(rank), source });
  }
}
words.sort((a, b) => b.weight - a.weight);
writeWords({
  lang: 'hi', words: words.slice(0, 300), phrases: [],
  sources: [...sources.map(([s]) => s), 'pronunciation: src/adapters/hindi/translit.ts (ISO 15919)', ranks.size ? 'ranked by public/dict/hi/frequency.json (local)' : 'unranked'],
  note: 'Machine-drafted lexicon glosses, not native-reviewed. The Hindi tutorial has no translated sentences, so there are no phrases.',
});
