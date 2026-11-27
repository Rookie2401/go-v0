/**
 * Russian starter words for Alphabet Sprint (words/ru.ts). Three sources, in this order of trust:
 *   1. RU_FIRST_WORDS of src/adapters/russian/alphabet.ts: the first words and expressions of the Cyrillic course, written for it with
 *      their meanings and stress; every one is a headword or a form page of the Wiktionary extract. Its single words are words here,
 *      its expressions of several words are phrases.
 *   2. Five prepositions whose first Wiktionary sense is a grammar label, not a meaning ("[with prepositional]"): в на с по за, with a
 *      plain meaning written for this deck.
 *   3. The commonest lemmas of the compiled core (src/adapters/russian/generated/core.ts: Wiktionary via kaikki.org, CC BY-SA 4.0), ranked
 *      by their count in UD Russian-GSD train, with the first Wiktionary sense as the meaning. A lemma whose first sense is not a short
 *      meaning (a grammar label, a cross-reference, a long definition) is left out, never re-worded. No proper names, no abbreviations.
 * Pronunciation on the back: the pack's own transliteration (ruPronunciation), with the stress the source marks. It is the spelling in
 * Latin letters, not the reduced sound of the unstressed vowels; the stress rule of the profile says so.
 * npx vite-node scripts/alphabet-sprint/ru.mts [--check]
 */
import { RU_FIRST_WORDS } from '../../src/adapters/russian/alphabet';
import { RU_CORE } from '../../src/adapters/russian/generated/core';
import { ruPronunciation } from '../../src/adapters/russian/pronunciation';
import { ruKey, stressPositions } from '../../src/adapters/russian/text';
import { firstSense, weightFromRank, writeWords } from './lib.mts';
import type { StarterPhrase, StarterWord } from '../../packages/language-packs/src/alphabet-sprint/types';

const LIMIT = 300;
const WORD = /^[а-яё]+$/u;
const VOWEL = /[аеёиоуыэюя]/u;
/** The words of one consonant letter: real words, not abbreviations. */
const ONE_CONSONANT = new Set(['в', 'к', 'с']);
const COURSE = 'src/adapters/russian/alphabet.ts RU_FIRST_WORDS (written for the course; a Wiktionary headword or form page)';
const CORE = 'src/adapters/russian/generated/core.ts (Wiktionary via kaikki.org, CC BY-SA 4.0)';
const HAND: ReadonlyArray<[string, string]> = [['в', 'in, into'], ['на', 'on, onto'], ['с', 'with; from'], ['по', 'along, by'], ['за', 'behind; for']];

/**
 * Lemmas whose FIRST Wiktionary sense is a true meaning but not the one the word has in most text, so a beginner would learn the
 * wrong word (который "what", стать "to stand", клуб "cloud" …). Read by hand in the built list; they are left out, never re-worded.
 */
const NOT_FIRST_SENSE = new Set([
  'который', 'при', 'стать', 'являться', 'себя', 'результат', 'команда', 'вид', 'член', 'военный', 'принять', 'государственный', 'клуб',
  'московский', 'провести', 'занимать', 'кубок', 'северный', 'образ',
]);

const said = (form: string, stress: readonly number[]): string | undefined => ruPronunciation(form, stress).transliteration || undefined;

/** A short meaning from a first Wiktionary sense, or undefined when the sense is a label, a cross-reference or a long definition. */
function shortGloss(raw: string): string | undefined {
  if (!raw || /^\[/.test(raw.trim())) return undefined;
  let t = firstSense(raw);
  if (!t || /[:.]/.test(t) || /^(alternative|form|misspelling|obsolete|used|initialism|abbreviation)/i.test(t) || /\b(form|spelling) of\b/i.test(t)) return undefined;
  if (t.length > 40) t = t.split(', ').slice(0, 2).join(', ');
  return t.length > 40 ? undefined : t;
}

// the core's lemmas, commonest first; a headword with several entries keeps its commonest one
const ranked = Object.values(RU_CORE.lemmas).filter((r) => r[2] !== 'PROPN').sort((a, b) => b[4] - a[4] || (ruKey(a[0]) < ruKey(b[0]) ? -1 : 1));
const rankOf = new Map<string, number>();
ranked.forEach((r, i) => { const k = ruKey(r[0]); if (!rankOf.has(k)) rankOf.set(k, i); });

const words: StarterWord[] = [];
const phrases: StarterPhrase[] = [];
const seen = new Set<string>();
const add = (w: StarterWord): void => { if (!seen.has(w.form)) { seen.add(w.form); words.push(w); } };

for (const w of RU_FIRST_WORDS) {
  const pronunciation = said(w.form, w.stress);
  if (/[^\p{L}]/u.test(w.form)) { phrases.push({ form: w.form, gloss: w.gloss, ...(pronunciation ? { pronunciation } : {}), source: COURSE }); continue; }
  const form = ruKey(w.form); // Привет, Спасибо: a single word is practised in lower case
  const rank = rankOf.get(form);
  add({ form, gloss: w.gloss, ...(pronunciation ? { pronunciation } : {}), weight: Math.max(0.3, weightFromRank(rank, 0.3)), source: COURSE });
}
for (const [form, gloss] of HAND) add({ form, gloss, pronunciation: said(form, [])!, weight: weightFromRank(rankOf.get(form)), source: `written for this deck (the first Wiktionary sense is a grammar label); ranked by ${CORE}` });

let left = 0;
for (const row of ranked) {
  const [head, glossRaw, , , count] = row;
  const form = ruKey(head);
  if (seen.has(form) || !WORD.test(form) || (!VOWEL.test(form) && !ONE_CONSONANT.has(form))) continue;
  const gloss = NOT_FIRST_SENSE.has(form) ? undefined : shortGloss(glossRaw);
  if (!gloss) { left++; continue; }
  if (words.length >= LIMIT) break;
  const pronunciation = said(form, stressPositions(head));
  add({ form, gloss, ...(pronunciation ? { pronunciation } : {}), weight: weightFromRank(rankOf.get(form)), source: `${CORE}; count ${count} in UD Russian-GSD train` });
}

writeWords({
  lang: 'ru', words, phrases,
  sources: ['src/adapters/russian/alphabet.ts (RU_FIRST_WORDS)', 'src/adapters/russian/generated/core.ts (Wiktionary via kaikki.org, CC BY-SA 4.0; counts from UD Russian-GSD train, CC BY-SA 4.0)'],
  note: `Machine-drafted, not reviewed by a native speaker. Written without stress marks, as ordinary Russian text is; the pronunciation is the transliteration with the stress the source marks. ${left} commoner lemmas were left out because their first Wiktionary sense is not a short meaning.`,
});
