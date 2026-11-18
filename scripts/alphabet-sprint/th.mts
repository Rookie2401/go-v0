/** Thai starter words: the pack's core lexicons (machine-drafted, not native-reviewed), read through the pack's own decoder and ranked by the local frequency list. */
import { CORE_ROWS } from '../../src/adapters/thai/lexicon-core';
import { EVERYDAY_ROWS } from '../../src/adapters/thai/lexicon-everyday';
import { FUNCTION_ROWS } from '../../src/adapters/thai/function-words';
import { LADDER_ROWS } from '../../src/adapters/thai/lexicon-ladder';
import { decodeThai } from '../../src/adapters/thai/orthography';
import { firstSense, frequencyRanks, weightFromRank, writeWords } from './lib.mts';
import type { StarterWord } from '../../src/alphabet/sprint/types';

const ranks = frequencyRanks('th');
const sources: Array<[string, readonly (readonly [string, string, string, ...unknown[]])[]]> = [
  ['src/adapters/thai/lexicon-everyday.ts', EVERYDAY_ROWS], ['src/adapters/thai/lexicon-core.ts', CORE_ROWS],
  ['src/adapters/thai/function-words.ts', FUNCTION_ROWS], ['src/adapters/thai/lexicon-ladder.ts', LADDER_ROWS],
];
const THAI_ONLY = /^[ก-ฮะ-ูเ-็่-๋]{2,7}$/u; // consonants, vowels, tone marks: no ์ ๆ ฯ, no digits
const words: StarterWord[] = [];
for (const [source, rows] of sources) {
  for (const [form0, pos, gloss] of rows) {
    const form = form0.normalize('NFC');
    if (pos === 'PROPN' || !THAI_ONLY.test(form)) continue;
    const rank = ranks.get(form);
    if (ranks.size && rank === undefined) continue; // with a frequency list, only words the reading library uses
    const syl = decodeThai(form);
    if (!syl.length || syl.length > 2 || syl.some((s) => s.confidence < 0.85 || !s.tone || !s.romanization)) continue;
    const g = firstSense(gloss);
    if (!g || g.startsWith('(')) continue;
    words.push({ form, gloss: g, pronunciation: syl.map((s) => `${s.romanization} (${s.tone})`).join('-'), weight: weightFromRank(rank), source });
  }
}
words.sort((a, b) => b.weight - a.weight);
writeWords({
  lang: 'th', words: words.slice(0, 290), phrases: [],
  sources: [...sources.map(([s]) => s), 'src/adapters/thai/orthography.ts (decodeThai: Royal Institute respelling and tone)', ranks.size ? 'ranked by public/dict/th/frequency.json (local)' : 'unranked'],
  note: 'Machine-drafted lexicon glosses and decoder respellings, not reviewed by a Thai teacher or native speaker. No phrases: the pack has no glossed Thai sentences.',
});
