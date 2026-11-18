/** German starter words: the pack's core lexicons (machine-drafted, not native-reviewed), ranked by the local frequency list. */
import fs from 'node:fs';
import { COURSE_ROWS } from '../../src/adapters/german/lexicon-course';
import { NOUN_ROWS } from '../../src/adapters/german/lexicon-nouns';
import { VERB_ROWS } from '../../src/adapters/german/lexicon-verbs';
import { ADJECTIVE_ROWS, ADVERB_ROWS } from '../../src/adapters/german/lexicon-modifiers';
import { FUNCTION_ROWS } from '../../src/adapters/german/function-words';
import { firstSense, frequencyRanks, lexiconRows, weightFromRank, writeWords } from './lib.mts';
import type { StarterWord } from '../../src/alphabet/sprint/types';

const ranks = frequencyRanks('de');
const sources: Array<[string, string]> = [
  ['src/adapters/german/function-words.ts', FUNCTION_ROWS], ['src/adapters/german/lexicon-nouns.ts', NOUN_ROWS],
  ['src/adapters/german/lexicon-verbs.ts', VERB_ROWS], ['src/adapters/german/lexicon-modifiers.ts', ADJECTIVE_ROWS + '\n' + ADVERB_ROWS],
  ['src/adapters/german/lexicon-course.ts', COURSE_ROWS],
];
const words: StarterWord[] = [];
const unranked: StarterWord[] = [];
for (const [source, text] of sources) {
  for (const row of lexiconRows(text)) {
    const form = row.lemma;
    if (!/^[A-Za-zäöüßÄÖÜ]{2,11}$/.test(form)) continue; // single words (nouns keep their capital); separable verbs (ab|fahren) are skipped
    const rank = ranks.get(form) ?? ranks.get(form.toLowerCase());
    const gloss = firstSense(row.gloss);
    if (!gloss || !/[aeiouyëäöü]/i.test(form) || gloss.toLowerCase() === form.toLowerCase() || /^(km|etj|shek)$/.test(form)) continue; // drop abbreviations and echo glosses
    if (ranks.size && rank === undefined) { unranked.push({ form, gloss, weight: 0.12, source }); continue; } // filler, only when the ranked words fall short
    words.push({ form, gloss, weight: weightFromRank(rank), source });
  }
}
words.sort((a, b) => b.weight - a.weight);
const seen = new Set<string>();
for (let i = words.length - 1; i >= 0; i--) { if (seen.has(words[i].form)) words.splice(i, 1); else seen.add(words[i].form); }
if (words.length < 270) words.push(...unranked.filter((u) => !seen.has(u.form) && seen.add(u.form)).slice(0, 270 - words.length));
const dialogue = JSON.parse(fs.readFileSync('data/corpus/de/dialogue-01.json', 'utf8')) as { sections: Array<{ paragraphs: Array<{ sentences: Array<{ text: string; english: string }> }> }> };
const phrases = dialogue.sections.flatMap((s) => s.paragraphs.flatMap((p) => p.sentences))
  .filter((s) => s.english && s.text.split(/\s+/).length <= 9)
  .map((s) => ({ form: s.text, gloss: s.english, source: 'data/corpus/de/dialogue-01.json (course-authored, drafter-glossed)' }));
writeWords({
  lang: 'de', words: words.slice(0, 300), phrases,
  sources: [...sources.map(([s]) => s), 'data/corpus/de/dialogue-01.json', ranks.size ? 'ranked by public/dict/de/frequency.json (local)' : 'unranked'],
  note: 'Machine-drafted lexicon glosses, not native-reviewed. Nouns keep their capital.',
});
