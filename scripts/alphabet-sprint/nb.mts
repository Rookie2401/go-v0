/** Bokmål starter words: the pack's own lexicons (machine-drafted, not native-reviewed), ranked by the local frequency list; pronunciation = the pack's rule-based East respelling (a draft). */
import { NB_FUNCTION_ROWS } from '../../src/adapters/norwegian/lexicon-function-nb';
import { NB_NOUNS_1 } from '../../src/adapters/norwegian/lexicon-nouns-nb-1';
import { NB_VERBS } from '../../src/adapters/norwegian/lexicon-verbs-nb';
import { NB_ADJECTIVES } from '../../src/adapters/norwegian/lexicon-adjectives-nb';
import { NB_NOUNS_2 } from '../../src/adapters/norwegian/lexicon-nouns-nb-2';
import { NB_NOUNS_3 } from '../../src/adapters/norwegian/lexicon-nouns-nb-3';
import { NB_NOUNS_4 } from '../../src/adapters/norwegian/lexicon-nouns-nb-4';
import { transcribe } from '../../src/adapters/norwegian/pronunciation';
import { NB_TUTORIAL_STEPS_OWN } from '../../packages/language-packs/src/tutorial/nb';
import { firstSense, frequencyRanks, lexiconRows, weightFromRank, writeWords } from './lib.mts';
import type { StarterPhrase, StarterWord } from '../../packages/language-packs/src/alphabet-sprint/types';

const ranks = frequencyRanks('nb');
const sources: Array<[string, string, 'pipe' | 'eq']> = [
  ['src/adapters/norwegian/lexicon-function-nb.ts', NB_FUNCTION_ROWS, 'pipe'], ['src/adapters/norwegian/lexicon-nouns-nb-1.ts', NB_NOUNS_1, 'eq'],
  ['src/adapters/norwegian/lexicon-nouns-nb-2.ts', NB_NOUNS_2, 'eq'], ['src/adapters/norwegian/lexicon-nouns-nb-3.ts', NB_NOUNS_3, 'eq'],
  ['src/adapters/norwegian/lexicon-nouns-nb-4.ts', NB_NOUNS_4, 'eq'], ['src/adapters/norwegian/lexicon-verbs-nb.ts', NB_VERBS, 'eq'],
  ['src/adapters/norwegian/lexicon-adjectives-nb.ts', NB_ADJECTIVES, 'eq'],
];
const rowsOf = (text: string, kind: 'pipe' | 'eq'): Array<{ lemma: string; gloss: string }> => kind === 'eq' ? lexiconRows(text) :
  text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//')).map((l) => l.split('|')).filter((p) => p.length >= 3).map((p) => ({ lemma: p[0].trim().normalize('NFC'), gloss: p[2].trim() }));
const SOFT = /(?:[kg]|sk)(?:ei|øy)/; // the pack's transcriber does not soften k, g, sk before ei / øy: leave those pronunciations out
const words: StarterWord[] = [];
for (const [source, text, kind] of sources) {
  for (const row of rowsOf(text, kind)) {
    const form = row.lemma;
    if (!/^[a-zæøå]{2,9}$/.test(form)) continue;
    const rank = ranks.get(form);
    if (ranks.size && rank === undefined) continue;
    const gloss = firstSense(row.gloss).replace(/\s*\^$/, '').trim();
    if (!gloss) continue;
    const t = SOFT.test(form) ? undefined : transcribe(form);
    words.push({ form, gloss, ...(t ? { pronunciation: t.respelling } : {}), weight: weightFromRank(rank), source });
  }
}
words.sort((a, b) => b.weight - a.weight);
const phrases: StarterPhrase[] = NB_TUTORIAL_STEPS_OWN.flatMap((s) => (s.examples ?? []).filter((e) => /\s/.test(e.surface)).map((e) => ({ form: e.surface, gloss: e.gloss, source: 'packages/language-packs/src/tutorial/nb.ts' })));
writeWords({
  lang: 'nb', words: words.slice(0, 300), phrases,
  sources: [...sources.map(([s]) => s), 'src/adapters/norwegian/pronunciation.ts (transcribe: East respelling, machine-drafted)', 'packages/language-packs/src/tutorial/nb.ts', ranks.size ? 'ranked by public/dict/nb/frequency.json (local)' : 'unranked'],
  note: 'Machine-drafted lexicon glosses and respellings, not native-reviewed. Tone (the word accent) is not shown.',
});
