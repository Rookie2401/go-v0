/** Biblical Aramaic starter words: distinct pointed forms of the pack seed (Daniel, Ezra; OSHB), no verbs, no attached prefix or suffix, ranked by how often the form occurs. */
import { ARAMAIC_SEED } from '../../src/adapters/aramaic/seed';
import { pointed } from '../../src/adapters/hebrew/text';
import { squareDependencies } from '../../src/alphabet/sprint/profiles/hebrew-script';
import { firstSense, weightFromRank, writeWords } from './lib.mts';
import type { StarterWord } from '../../src/alphabet/sprint/types';

const byForm = new Map<string, { n: number; glosses: Map<string, number> }>();
for (const r of ARAMAIC_SEED) {
  if (r.lemmaId.includes('/') || r.glossStatus !== 'external' || !r.gloss) continue; // an attached prefix
  if (!(r.morph.indexOf('/') < 0 || /^[^/]+\/Td$/.test(r.morph))) continue; // a suffix or a particle chain
  if (r.morph.startsWith('AV')) continue; // verbs: the lexicon gloss is the infinitive, not the form
  const form = pointed(r.surface);
  const g = firstSense(r.gloss);
  if (g.length === 0 || g.length > 32 || /\bi\.e\.|\bor\b/.test(g)) continue;
  const e = byForm.get(form) ?? { n: 0, glosses: new Map() };
  e.n++; e.glosses.set(g, (e.glosses.get(g) ?? 0) + 1);
  byForm.set(form, e);
}
const ranked = [...byForm].filter(([form]) => !!squareDependencies(form) && /^[א-תְ-ּׁׂ]{2,}$/.test(form))
  .sort((a, b) => b[1].n - a[1].n || (a[0] < b[0] ? -1 : 1)).slice(0, 300);
const words: StarterWord[] = ranked.map(([form, e], i) => ({
  form, gloss: [...e.glosses].sort((a, b) => b[1] - a[1])[0][0], weight: weightFromRank(i), source: `src/adapters/aramaic/seed.ts (ARAMAIC_SEED, ${e.n} occurrences)`,
}));
writeWords({
  lang: 'arc', words, phrases: [],
  sources: ['src/adapters/aramaic/seed.ts (OSHB WLC Aramaic words: base text public domain, annotations CC BY 4.0)'],
  note: 'Each gloss is the lexicon gloss of the word the form belongs to (not of the exact inflection); no pronunciation, since the pack has no Aramaic transliteration.',
});
