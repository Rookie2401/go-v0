/** Latin starter words: the commonest lemmas of the pack's Vulgate lexicon (Whitaker's Words senses, with the reviewed lead glosses of gloss-data.ts), ranked by Vulgate count. No pronunciation: none is invented. */
import { ADJ_ROWS, ADV_ROWS, CONJ_ROWS, NOUN_ROWS, PREP_ROWS, VERB_ROWS } from '../../src/adapters/latin/lexicon-data';
import { GLOSS_LEAD } from '../../src/adapters/latin/gloss-data';
import { LA_PASSAGE } from '../../packages/language-packs/src/tutorial/la';
import { firstSense, writeWords } from './lib.mts';
import type { StarterWord } from '../../packages/language-packs/src/alphabet-sprint/types';

const F = 'src/adapters/latin/lexicon-data.ts';
const cand: Array<{ lemma: string; pos: string; gloss: string; count: number; source: string }> = [];
for (const r of NOUN_ROWS) cand.push({ lemma: r[0], pos: 'NOUN', gloss: r[3], count: r[4], source: F });
for (const r of VERB_ROWS) cand.push({ lemma: r[0], pos: 'VERB', gloss: r[6], count: r[7], source: F });
for (const r of ADJ_ROWS) cand.push({ lemma: r[0], pos: 'ADJ', gloss: r[4], count: r[5], source: F });
for (const r of ADV_ROWS) cand.push({ lemma: r[0], pos: 'ADV', gloss: r[1], count: r[2], source: F });
for (const r of CONJ_ROWS) cand.push({ lemma: r[0], pos: 'CONJ', gloss: r[1], count: r[2], source: F });
for (const r of PREP_ROWS) cand.push({ lemma: r[0], pos: 'PREP', gloss: r[2], count: r[3], source: F });
const top = cand.filter((c) => /^[a-z]{2,10}$/.test(c.lemma)).sort((a, b) => b.count - a.count).slice(0, 320);
const max = Math.log10(top[0].count + 1);
const words: StarterWord[] = [];
for (const c of top) {
  const lead = GLOSS_LEAD[`${c.lemma}|${c.pos}`];
  const gloss = firstSense(lead ?? c.gloss).split(',')[0].trim() || firstSense(lead ?? c.gloss);
  if (!gloss) continue;
  words.push({ form: c.lemma, gloss, weight: Math.max(0.05, Math.round((Math.log10(c.count + 1) / max) * 1000) / 1000), source: lead ? `${c.source}; src/adapters/latin/gloss-data.ts` : c.source });
}
writeWords({
  lang: 'la', words: words.slice(0, 280),
  phrases: LA_PASSAGE.sentences.map((s) => ({ form: s.text, gloss: s.gloss, source: 'packages/language-packs/src/tutorial/la.ts (LA_PASSAGE)' })),
  sources: [F, 'src/adapters/latin/gloss-data.ts', 'packages/language-packs/src/tutorial/la.ts', 'weight = log of the Vulgate count in the lexicon'],
  note: 'Whitaker-derived glosses (first sense, shortened); not reviewed by a Latinist. Lemma spelling is plain (no macrons).',
});
