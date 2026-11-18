/** Albanian starter words: the pack's core lexicons (machine-drafted, not native-reviewed), ranked by the local frequency list. */
import { SQ_NOUNS } from '../../src/adapters/albanian/lexicon-nouns';
import { SQ_VERBS } from '../../src/adapters/albanian/lexicon-verbs';
import { SQ_ADJECTIVES, SQ_ADVERBS } from '../../src/adapters/albanian/lexicon-modifiers';
import { SQ_FUNCTION_WORDS } from '../../src/adapters/albanian/function-words';
import { SQ_PLAN_LEXEMES } from '../../src/adapters/albanian/lexicon-ladder';
import { SQ_PASSAGE } from '../../packages/language-packs/src/tutorial/sq';
import { firstSense, frequencyRanks, weightFromRank, writeWords } from './lib.mts';
import type { StarterWord } from '../../packages/language-packs/src/alphabet-sprint/types';

const ranks = frequencyRanks('sq');
const sources: Array<[string, Array<{ lemma: string; gloss: string }>]> = [
  ['src/adapters/albanian/function-words.ts', SQ_FUNCTION_WORDS], ['src/adapters/albanian/lexicon-nouns.ts', SQ_NOUNS],
  ['src/adapters/albanian/lexicon-verbs.ts', SQ_VERBS], ['src/adapters/albanian/lexicon-modifiers.ts', [...SQ_ADJECTIVES, ...SQ_ADVERBS]],
  ['src/adapters/albanian/lexicon-ladder.ts', SQ_PLAN_LEXEMES],
];
const words: StarterWord[] = [];
for (const [source, rows] of sources) {
  for (const row of rows) {
    const form = row.lemma.normalize('NFC');
    if (!/^[a-zçë]{2,10}$/.test(form)) continue; // lower-case single words only (no names, no multiword)
    const rank = ranks.get(form);
    if (ranks.size && rank === undefined) continue;
    const gloss = firstSense(row.gloss);
    if (!gloss || !/[aeiouyëäöü]/i.test(form) || gloss.toLowerCase() === form.toLowerCase() || /^(km|etj|shek)$/.test(form)) continue; // drop abbreviations and echo glosses
    words.push({ form, gloss, weight: weightFromRank(rank), source });
  }
}
words.sort((a, b) => b.weight - a.weight);
const seen = new Set<string>();
for (let i = words.length - 1; i >= 0; i--) { if (seen.has(words[i].form)) words.splice(i, 1); else seen.add(words[i].form); }
writeWords({
  lang: 'sq', words: words.slice(0, 300),
  phrases: SQ_PASSAGE.sentences.map((s) => ({ form: s.text, gloss: s.gloss, source: 'packages/language-packs/src/tutorial/sq.ts (SQ_PASSAGE)' })),
  sources: [...sources.map(([s]) => s), 'packages/language-packs/src/tutorial/sq.ts', ranks.size ? 'ranked by public/dict/sq/frequency.json (local)' : 'unranked'],
  note: 'Machine-drafted lexicon glosses, not native-reviewed.',
});
