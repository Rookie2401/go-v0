/**
 * Greek starter words for Alphabet Sprint, two lists:
 *   words/el.ts            MODERN Greek (monotonic). Real words that occur in the pack's Modern texts: the two course-authored
 *                          corpus texts (data/corpus/el/dialogue-01, story-01, with their sentence translations) and the 17 hand-annotated
 *                          Wikipedia sentences (test/adapters/greek-modern-gold.json, whose lemmas were written by hand). The meaning of a
 *                          headword is the Wiktionary (kaikki) gloss in the pack's Modern index (public/lexicon/el/modern-index.json,
 *                          a local git-ignored asset built by npm run el:build-modern). This is the only committed Modern data that is
 *                          glossed, and it is thin: the list is as long as the texts allow, ranked by how often the word occurs in them.
 *   words/el-classical.ts  Koine/Classical: the lemmas of the compiled Koine core (MorphGNT over the SBLGNT, Dodson / Abbott-Smith glosses),
 *                          ranked by New Testament count, polytonic as written. Pronunciation: the Erasmian classroom scheme.
 * npx vite-node scripts/alphabet-sprint/el.mts [--check]
 */
import fs from 'node:fs';
import { KOINE_CORE } from '../../src/adapters/greek/generated/koine-core';
import { transliterateGreek } from '../../src/adapters/greek/pronunciation';
import { firstSense, writeWords } from './lib.mts';
import type { StarterPhrase, StarterWord } from '../../packages/language-packs/src/alphabet-sprint/types';

const GREEK_WORD = /^[\p{Script=Greek}]+$/u;

/** A short gloss: the first sense, at most two comma parts; a gloss still over 48 characters, or only a cross-reference, is dropped. */
function shortGloss(g: string): string | undefined {
  let t = firstSense(g);
  if (/literally|:s*$/i.test(t)) return undefined;
  if (/^(alternative|form|misspelling|obsolete)/i.test(t) || /form of/i.test(t)) return undefined;
  if (t.length > 48) t = t.split(", ").slice(0, 2).join(", ");
  return t.length > 48 ? undefined : t;
}

/** Spellings whose single Wiktionary entry misleads a beginner: είναι is mostly the verb form "is" (the entry is the noun "being"); την/τον are the article forms, whose entry is the pronoun. */
const NOT_HEADWORDS = new Set(["είναι", "την", "τον"]);

/** Weight = share of the commonest word's count, raised to a power below 1 (a rank-like curve: the commonest words count much more than the long tail). */
const MODERN_POWER = 0.5;
const CLASSICAL_POWER = 0.7;

// ---------- Modern
const modernPath = 'public/lexicon/el/modern-index.json';
if (!fs.existsSync(modernPath)) throw new Error(`${modernPath} is not built here (npm run el:build-modern)`);
const modern = JSON.parse(fs.readFileSync(modernPath, 'utf8')) as {
  lemmas: Record<string, [string, string, string, number, string?]>;
  forms: Record<string, Array<[string, string, number]>>;
};
const texts: Array<{ sentences: Array<{ text: string; english?: string }>; source: string }> = [];
for (const id of ['dialogue-01', 'story-01']) {
  const c = JSON.parse(fs.readFileSync(`data/corpus/el/${id}.json`, 'utf8'));
  const sentences: Array<{ text: string; english?: string }> = [];
  for (const sec of c.sections) for (const p of sec.paragraphs ?? []) for (const s of p.sentences ?? []) sentences.push(s);
  texts.push({ sentences, source: `data/corpus/el/${id}.json` });
}
const gold = JSON.parse(fs.readFileSync('test/adapters/greek-modern-gold.json', 'utf8')) as { sentences: Array<{ text: string; words: Array<[string, string[], string[]]> }> };

const byHead = new Map<string, Array<[string, [string, string, string, number, string?]]>>();
for (const [k, v] of Object.entries(modern.lemmas)) { const h = k.split('|')[0]; const l = byHead.get(h); if (l) l.push([k, v]); else byHead.set(h, [[k, v]]); }
const rowCount = (headword: string) => byHead.get(headword)?.length ?? 0;
const lemmaRow = (headword: string) => byHead.get(headword)?.[0]?.[1];
/** headword → {count, source}: tokens of the Modern texts resolved to a Modern headword. */
const found = new Map<string, { count: number; source: string }>();
const bump = (h: string, source: string) => { const f = found.get(h); if (f) f.count++; else found.set(h, { count: 1, source }); };
const MONOTONIC = /^[\p{Script=Greek}]+$/u;
const isMonotonic = (s: string) => MONOTONIC.test(s) && !/[̓̔͂̀ͅ]/.test(s.normalize('NFD'));
function resolve(token: string): string | undefined {
  const t = token.normalize('NFC').toLowerCase();
  if (!isMonotonic(t) || [...t].length < 2) return undefined;
  const direct = lemmaRow(t);
  const rows = (modern.forms[t] ?? []).map((r) => r[0].split('|')[0]);
  const lemmas = [...new Set(rows)];
  if (direct && (lemmas.length === 0 || lemmas.includes(t))) return t; // the token is itself a headword
  if (lemmas.length === 1 && lemmaRow(lemmas[0])) return lemmas[0]; // one headword only: unambiguous
  return undefined;
}
for (const t of texts) for (const s of t.sentences) for (const tok of s.text.match(/[\p{Script=Greek}\p{M}]+/gu) ?? []) { const h = resolve(tok); if (h) bump(h, t.source); }
for (const s of gold.sentences) for (const [, lemmas] of s.words) { const h = lemmas?.[0]; if (h && isMonotonic(h) && [...h].length >= 2 && lemmaRow(h)) bump(h, 'test/adapters/greek-modern-gold.json'); }

const maxCount = Math.max(...[...found.values()].map((f) => f.count));
const modernWords: StarterWord[] = [];
for (const [h, f] of found) {
  if (NOT_HEADWORDS.has(h)) continue;
  if (rowCount(h) !== 1) continue; // a headword with several entries (σε, με, το …) has no single trustworthy gloss here: left out
  const row = lemmaRow(h)!;
  const gloss = shortGloss(row[1]);
  if (!gloss) continue;
  modernWords.push({
    form: h, gloss, pronunciation: transliterateGreek(h, 'modern'),
    weight: Math.round((0.05 + 0.95 * (f.count / maxCount) ** MODERN_POWER) * 1000) / 1000,
    source: `${f.source} (occurs); gloss: ${modernPath} (Wiktionary via kaikki.org)`,
  });
}
const modernPhrases: StarterPhrase[] = [];
for (const t of texts) for (const s of t.sentences) if (s.english && s.text.split(/\s+/).length <= 9) modernPhrases.push({ form: s.text, gloss: s.english, source: t.source });

writeWords({
  lang: 'el', words: modernWords, phrases: modernPhrases,
  sources: ['data/corpus/el/dialogue-01.json', 'data/corpus/el/story-01.json', 'test/adapters/greek-modern-gold.json', `${modernPath} (glosses; local, git-ignored)`],
  note: 'Modern Greek, monotonic. Machine-drafted course texts and Wiktionary glosses, not native-reviewed. Pronunciation: transliterateGreek(form, "modern").',
});

// ---------- Classical (Koine core)
const classical: StarterWord[] = [];
const top = Math.max(...Object.values(KOINE_CORE.lemmas).map((r) => r[3]));
for (const row of Object.values(KOINE_CORE.lemmas)) {
  const [form, glossRaw, pos, count] = row;
  if (pos === 'PROPN' || !GREEK_WORD.test(form.normalize('NFC')) || [...form].length < 2 || !glossRaw) continue;
  const gloss = firstSense(glossRaw);
  if (!gloss) continue;
  classical.push({
    form, gloss, pronunciation: transliterateGreek(form, 'erasmian'),
    weight: Math.round((0.05 + 0.95 * (count / top) ** CLASSICAL_POWER) * 1000) / 1000,
    source: 'src/adapters/greek/generated/koine-core.ts (MorphGNT lemma, count ' + count + ')',
  });
}
classical.sort((a, b) => b.weight - a.weight);
writeWords({
  lang: 'el-classical', script: 'scripts/alphabet-sprint/el.mts', words: classical.slice(0, 300), phrases: [],
  sources: ['src/adapters/greek/generated/koine-core.ts (MorphGNT over the SBLGNT; Dodson / Abbott-Smith / Strong’s glosses)'],
  note: 'Koine (New Testament) lemmas, polytonic, no proper names. Pronunciation: transliterateGreek(form, "erasmian") (the classroom scheme the Classical profile teaches).',
});


