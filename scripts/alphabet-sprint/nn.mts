/**
 * Nynorsk starter words: the pack's own Nynorsk lexicons (machine-drafted, not native-reviewed). Nynorsk has no local frequency list, so
 * a word spelled the same in the Bokmål list borrows that rank as a PROXY (public/dict/nb/frequency.json, local) and every other word gets
 * a low flat weight; the top 220 by weight plus up to 80 Nynorsk-only words (lexicon order) are kept. Pronunciation = the pack's
 * rule-based East respelling, a draft.
 */
import { NN_FUNCTION_ROWS } from '../../src/adapters/norwegian/lexicon-function-nn';
import { NN_NOUNS } from '../../src/adapters/norwegian/lexicon-nouns-nn';
import { NN_VERBS } from '../../src/adapters/norwegian/lexicon-verbs-nn';
import { NN_ADJECTIVES } from '../../src/adapters/norwegian/lexicon-adjectives-nn';
import { transcribe } from '../../src/adapters/norwegian/pronunciation';
import { NN_TUTORIAL_STEPS_OWN } from '../../packages/language-packs/src/tutorial/nn';
import { firstSense, frequencyRanks, lexiconRows, weightFromRank, writeWords } from './lib.mts';
import type { StarterPhrase, StarterWord } from '../../src/alphabet/sprint/types';

const nbRanks = frequencyRanks('nb');
const sources: Array<[string, string, 'pipe' | 'eq']> = [
  ['src/adapters/norwegian/lexicon-function-nn.ts', NN_FUNCTION_ROWS, 'pipe'], ['src/adapters/norwegian/lexicon-nouns-nn.ts', NN_NOUNS, 'eq'],
  ['src/adapters/norwegian/lexicon-verbs-nn.ts', NN_VERBS, 'eq'], ['src/adapters/norwegian/lexicon-adjectives-nn.ts', NN_ADJECTIVES, 'eq'],
];
const rowsOf = (text: string, kind: 'pipe' | 'eq'): Array<{ lemma: string; gloss: string }> => kind === 'eq' ? lexiconRows(text) :
  text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//')).map((l) => l.split('|')).filter((p) => p.length >= 3).map((p) => ({ lemma: p[0].trim().normalize('NFC'), gloss: p[2].trim() }));
const SOFT = /(?:[kg]|sk)(?:ei|øy)/; // the pack's transcriber does not soften k, g, sk before ei / øy: leave those pronunciations out
const shared: StarterWord[] = [];
const own: StarterWord[] = [];
for (const [source, text, kind] of sources) {
  for (const row of rowsOf(text, kind)) {
    const form = row.lemma;
    if (!/^[a-zæøå]{2,9}$/.test(form)) continue;
    const gloss = firstSense(row.gloss).replace(/\s*\^$/, '').trim();
    if (!gloss) continue;
    const t = SOFT.test(form) ? undefined : transcribe(form);
    const rank = nbRanks.get(form);
    const w: StarterWord = { form, gloss, ...(t ? { pronunciation: t.respelling } : {}), weight: weightFromRank(rank, 0.15), source };
    (rank === undefined ? own : shared).push(w);
  }
}
shared.sort((a, b) => b.weight - a.weight);
const picked = [...shared.slice(0, 220)];
for (const w of own) { if (picked.length >= 300) break; if (!picked.some((p) => p.form === w.form)) picked.push(w); }
const phrases: StarterPhrase[] = NN_TUTORIAL_STEPS_OWN.flatMap((s) => (s.examples ?? []).filter((e) => /\s/.test(e.surface)).map((e) => ({ form: e.surface, gloss: e.gloss, source: 'packages/language-packs/src/tutorial/nn.ts' })));
writeWords({
  lang: 'nn', words: picked, phrases,
  sources: [...sources.map(([s]) => s), 'src/adapters/norwegian/pronunciation.ts (transcribe: East respelling, machine-drafted)', 'packages/language-packs/src/tutorial/nn.ts', nbRanks.size ? 'weights borrowed from public/dict/nb/frequency.json for words spelled the same in Bokmål (a proxy; Nynorsk has no frequency list)' : 'unranked'],
  note: 'Machine-drafted lexicon glosses and respellings, not native-reviewed. Tone (the word accent) is not shown. Weights are a Bokmål-spelling proxy, not Nynorsk frequency.',
});
