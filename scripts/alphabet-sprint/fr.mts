/**
 * French starter words and phrases for the Alphabet Sprint: the French pack's own hand lexicons (machine-drafted, not
 * native-reviewed) plus the examples and sentences of its orientation (tutorial/fr.ts, the Decoding Sprint stages).
 *
 * The French pack has no frequency list on this machine (public/dict/fr/frequency.json is absent), so, as the other generators do
 * when there is none, the weight is the list's own order: the words of the closed classes (function words) first, then the core
 * verbs, nouns and modifiers in the order the lexicon files give them, which put the commonest first. It is a stand-in for
 * frequency, not a measurement, and the profile notes say so. With a local frequency list present, ranks win.
 *
 *   npx vite-node --config scripts/vite.config.ts scripts/alphabet-sprint/fr.mts            write
 *   npx vite-node --config scripts/vite.config.ts scripts/alphabet-sprint/fr.mts --check    compare only
 */
import { FUNCTION_ROWS } from '../../src/adapters/french/function-words';
import { VERB_ROWS } from '../../src/adapters/french/lexicon-verbs';
import { NOUN_ROWS } from '../../src/adapters/french/lexicon-nouns';
import { ADJECTIVE_ROWS, ADVERB_ROWS, PROPER_ROWS } from '../../src/adapters/french/lexicon-modifiers';
import { FR_PASSAGE, FR_TUTORIAL_STEPS_OWN } from '../../packages/language-packs/src/tutorial/fr';
import { firstSense, frequencyRanks, lexiconRows, weightFromRank, writeWords, type Row } from './lib.mts';
import type { StarterPhrase, StarterWord } from '../../packages/language-packs/src/alphabet-sprint/types';

const ranks = frequencyRanks('fr');
const FW = 'src/adapters/french/function-words.ts';
/** Open classes: how many words to take from each lexicon, taken round robin from the sections of the file (family, body, food, house, travel …), the first words of each section first. */
const sources: Array<{ file: string; text: string; take: number; top: number; stride: boolean }> = [
  { file: FW, text: FUNCTION_ROWS, take: 96, top: 0.6, stride: false },
  { file: 'src/adapters/french/lexicon-verbs.ts', text: VERB_ROWS, take: 70, top: 0.5, stride: true },
  { file: 'src/adapters/french/lexicon-nouns.ts', text: NOUN_ROWS, take: 80, top: 0.45, stride: true },
  { file: 'src/adapters/french/lexicon-modifiers.ts', text: ADJECTIVE_ROWS + '\n' + ADVERB_ROWS, take: 60, top: 0.4, stride: true },
];
/** Closed-class words: how many of each part of speech (list order is the lexicon's, commonest first), and the rare ones left out. */
const FW_CAPS: Record<string, number> = { AUX: 3, DET: 10, ADP: 12, PRON: 20, PART: 3, ADV: 14, CONJ: 6, SCONJ: 6, NUM: 12, INTJ: 6 };
const RARE = new Set(['moyennant', 'hormis', 'excepté', 'outre', 'concernant', 'durant', 'lors', 'suivant', 'auxquelles', 'auxquels', 'desquels', 'desquelles', 'duquel', 'auquel', 'nôtre', 'vôtre', 'mien', 'tien', 'sien', 'soi', 'nul', 'jusque', 'dès']);

const PLAIN = /^[a-zàâäéèêëîïôöùûüçœ]{2,10}$/;
/** The first sense, short: parentheses dropped (they may hold a semicolon), then the text before the first semicolon. */
const sense = (g: string): string => firstSense(g.replace(/\s*\([^)]*\)/g, '')).replace(/\s+,/g, ',').trim();
const words: StarterWord[] = [];
const seen = new Set<string>();
const add = (w: StarterWord): void => { if (!seen.has(w.form)) { seen.add(w.form); words.push(w); } };

/** The rows of a lexicon text grouped by its `// ── …` sections (the part of speech of a `# POS` line is carried into each chunk). */
function sectionRows(text: string): Row[][] {
  const out: Row[][] = [];
  let pos = '';
  let chunk: string[] = [];
  const flush = (): void => { if (chunk.length) out.push(lexiconRows(`# ${pos}\n${chunk.join('\n')}`)); chunk = []; };
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (l.startsWith('// ──')) { flush(); continue; }
    if (l.startsWith('#')) { flush(); pos = l.slice(1).trim().split(/\s+/)[0]; continue; }
    chunk.push(line);
  }
  flush();
  return out;
}

for (const s of sources) {
  const ok = (row: Row): boolean => {
    const form = row.lemma;
    if (form !== form.toLowerCase() || RARE.has(form)) return false;
    if (!(PLAIN.test(form) || form === 'à' || form === 'y')) return false; // single words only (no multiword, hyphenated or elided lemma)
    const gloss = sense(row.gloss);
    return !!gloss && gloss.toLowerCase() !== form && (!ranks.size || ranks.has(form));
  };
  let pick: Row[] = [];
  if (s.stride) {
    // round robin over the lexicon's sections, the first words of each section first (the lexicons list the commonest words first)
    const sections = sectionRows(s.text).map((rows) => rows.filter(ok));
    for (let r = 0; pick.length < s.take && sections.some((x) => x.length > r); r++) for (const x of sections) if (x[r] && pick.length < s.take) pick.push(x[r]);
  } else {
    const used: Record<string, number> = {};
    pick = lexiconRows(s.text).filter(ok).filter((r) => { const p = r.pos ?? ''; used[p] = (used[p] ?? 0) + 1; return used[p] <= (FW_CAPS[p] ?? 0); });
  }
  pick.forEach((row, n) => add({ form: row.lemma, gloss: sense(row.gloss), weight: ranks.size ? weightFromRank(ranks.get(row.lemma)) : Math.round((s.top - n * 0.0015) * 10000) / 10000, source: s.file }));
}

// Words the pack lists that show a spelling the profile teaches (one real word per accent, digraph or rule), taken from the
// same lexicons by lemma so that every unit the profile teaches has a starter word. Glosses are the lexicon's own.
const NEEDED = ['île', 'sûr', 'naïf', 'âge', 'hôtel', 'fête', 'Israël', 'où', 'photo', 'thé', 'montagne', 'nation', 'question', 'famille', 'travail', 'voyage', 'loin',
  'bientôt', 'gare', 'guerre', 'guide', 'rouge', 'ici', 'jour', 'rue', 'nuit', 'lui', 'cœur', 'sœur', 'hiver', 'taxi', 'qui', 'quatre', 'année', 'inutile', 'ville', 'heure', 'chef',
  'avec', 'pour', 'sel', 'nez', 'trop', 'neige', 'plein', 'lait', 'beau', 'moi', 'ennemi', 'science', 'client', 'ancien', 'poisson', 'maison', 'rose', 'jouer', 'cher', 'texte', 'exemple',
  'bon', 'garçon', 'petit', 'grand', 'peu', 'vin', 'pain', 'un', 'enfant', 'chat', 'ami', 'mère', 'père', 'mer', 'vie', 'nom', 'sac', 'bras', 'dent', 'argent', 'moment', 'souvent', 'vent', 'lundi', 'huile', 'bouche', 'cheval', 'champ', 'ceci'];
const needSources: Array<{ file: string; text: string }> = [...sources.slice(1), { file: 'src/adapters/french/lexicon-modifiers.ts', text: PROPER_ROWS }, { file: FW, text: FUNCTION_ROWS }];
for (const lemma of NEEDED) {
  if (seen.has(lemma)) continue;
  for (const s of needSources) {
    const row = lexiconRows(s.text).find((r) => r.lemma === lemma);
    if (row) { add({ form: lemma, gloss: sense(row.gloss), weight: 0.3, source: s.file }); break; }
  }
}

// the elided forms the pack lists for its function words (l' j' d' n' c' qu' …): each is a token of its own in GoLearn
let elided = 0;
for (const line of FUNCTION_ROWS.split('\n')) {
  const m = /^([^=|[]+?)\s*=\s*([^[|]+)\|(.*)$/.exec(line.trim());
  if (!m) continue;
  for (const f of m[3].split(';')) {
    const form = f.trim().split(':')[0].trim().normalize('NFC');
    if ((!/^[a-zàâéèêîôû]{1,2}'$/.test(form) && form !== "qu'")) continue;
    add({ form, gloss: `${sense(m[2])} (${m[1].trim().split('/')[0]} before a vowel)`, weight: Math.round((0.55 - elided * 0.01) * 10000) / 10000, source: `${FW} (elided form)` });
    elided++;
  }
}

// the single-word examples the orientation's Decoding Sprint stages give (its own glosses, lower-cased as ordinary words)
const TUT = 'packages/language-packs/src/tutorial/fr.ts (Decoding Sprint stage examples)';
let tut = 0;
for (const step of FR_TUTORIAL_STEPS_OWN) {
  for (const ex of step.examples ?? []) {
    const form = ex.surface.toLowerCase();
    if (!PLAIN.test(form)) continue;
    if (seen.has(form)) continue;
    add({ form, gloss: ex.gloss, weight: Math.round((0.58 - tut * 0.004) * 10000) / 10000, source: TUT });
    tut++;
  }
}

// phrases: the orientation's own expressions and sentences, with the glosses it gives
const PHRASE_SRC = 'packages/language-packs/src/tutorial/fr.ts';
const phrases: StarterPhrase[] = [];
const wanted = new Set(['Bonjour', 'Merci', 'Salut', 'Oui', 'Non']);
for (const step of FR_TUTORIAL_STEPS_OWN) {
  for (const ex of step.examples ?? []) {
    if (wanted.has(ex.surface)) continue; // single words are starter words, not phrases
    if (ex.surface.split(/\s+/).length < 2) continue;
    if (ex.surface.split(/\s+/).length > 5) continue;
    phrases.push({ form: ex.surface, gloss: ex.gloss, source: `${PHRASE_SRC} (stage examples)` });
  }
}
for (const s of FR_PASSAGE.sentences) phrases.push({ form: s.text, gloss: s.gloss, source: `${PHRASE_SRC} (FR_PASSAGE)` });

writeWords({
  lang: 'fr', words, phrases,
  sources: [...sources.map((s) => s.file), PHRASE_SRC, ranks.size ? 'ranked by public/dict/fr/frequency.json (local)' : 'unranked: the weight is list order, function words first (no French frequency list)'],
  note: 'Machine-drafted lexicon glosses, not native-reviewed. The weight is list order, not frequency.',
});
