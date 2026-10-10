/**
 * Gold-set builder (GoLearn Linguistic Engine V2, Stage 8; 2026-10-10). Two subcommands:
 *
 *   sample --out <dir> [--langs ..]    writes, per language, the UNLABELLED selections to label: <lang>-dev.json / <lang>-unseen.json
 *                                      (id, text, sentence, offsets, surface) and a reading copy <lang>-dev.txt / <lang>-unseen.txt.
 *   merge  --in <dir> [--langs ..]     joins <lang>-dev.tsv / <lang>-unseen.tsv labels (id, lemma, pos, features, relation, difficulty,
 *                                      ambiguous, span) with the samples, and the authored <lang>-hard.json items (sentence, surface, nth,
 *                                      expected..., wrong, why_hard, category), into data/gold/<lang>/{selections-dev,hard,unseen}.json.
 *
 * The sampler is deterministic (every k-th word over a pool; at most 3 per surface form while the pool allows). The labels are written
 * by an AI model, without running the analysers on the items; nothing here talks to the engine except its TOKENIZER (to cut words).
 */
import fs from 'node:fs';
import path from 'node:path';
import { getAnalyser } from '../packages/golearn-extension/src/parser';
import { GOLD_DIR, GOLD_LANGS, LABELLED_BY, ROOT, SET_FILE, corpusSentences, ensureAnalysers, sampleSelections, validateGold, wordTokens } from './gold-lib.mts';
import type { GoldFile, GoldItem, GoldSet, Skeleton } from './gold-lib.mts';

const argv = process.argv.slice(2);
const cmd = argv[0];
const arg = (name: string, dflt: string): string => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
const LANGS = arg('langs', GOLD_LANGS.join(',')).split(',');

/** Feature keys the labellers were asked to cover, per language (the adapters' UD-style vocabulary). */
export const FEATURE_KEYS: Record<string, string[]> = {
  sq: ['Case', 'Number', 'Gender', 'Definite', 'Person', 'Tense', 'Mood', 'Voice', 'VerbForm', 'Degree', 'PronType'],
  es: ['Gender', 'Number', 'Person', 'Tense', 'Mood', 'VerbForm', 'Degree', 'Polite'],
  de: ['Case', 'Number', 'Gender', 'Person', 'Tense', 'Mood', 'VerbForm', 'Degree', 'PronType', 'Polite'],
  hi: ['Case', 'Number', 'Gender', 'Person', 'Tense', 'Aspect', 'Mood', 'VerbForm', 'Voice', 'Polite'],
  th: ['Aspect', 'Polarity'],
  nb: ['Gender', 'Number', 'Definite', 'Tense', 'VerbForm', 'Mood', 'Degree', 'Voice', 'PronType'],
  nn: ['Gender', 'Number', 'Definite', 'Tense', 'VerbForm', 'Mood', 'Degree', 'Voice', 'PronType'],
};

const SOURCE: Record<string, Record<GoldSet, string>> = {
  sq: { dev: 'data/corpus/sq (course texts, bible-1john-1 and the four latest-listed texts of the latest-dated batch excluded)', hard: 'authored sentences (not from the corpus)', unseen: 'NO verified Scripture slice for sq: the four latest-listed course texts of the latest-dated batch (2026-10-05): udha-1-06, udha-1-07, udha-1-08, misioni-1-04 (data/corpus/sq) — labelled as such; these texts are NOT unseen by the word list, only by the dev set' },
  es: { dev: 'data/corpus/es (course texts; bible-* excluded)', hard: 'authored sentences (not from the corpus)', unseen: 'data/verified/scripture.json, Reina-Valera 1909 (spaRV1909), chapters not in the corpus slices' },
  de: { dev: 'data/corpus/de (course texts; bible-* excluded)', hard: 'authored sentences (not from the corpus)', unseen: 'data/verified/scripture.json, Lutherbibel 1912 (deu1912), chapters not in the corpus slices' },
  hi: { dev: 'data/corpus/hi (course texts; bible-* excluded)', hard: 'authored sentences (not from the corpus)', unseen: 'data/verified/scripture.json, IRV Hindi 2019 (hin2017), chapters not in the corpus slices' },
  th: { dev: 'data/corpus/th (course texts; bible-1john-1 excluded)', hard: 'authored sentences (not from the corpus)', unseen: 'data/verified/scripture.json, Biblica Open Thai Common Version 2025, chapters not in the corpus slices' },
  nb: { dev: 'data/corpus/nb (all 21 sentences) + the sentence text (annotations stripped) of NB_GOLD in test/adapters/norwegian-gold-data.ts', hard: 'authored sentences (not from the corpus)', unseen: 'NO verified Scripture slice for nb and the corpus holds only 21 sentences: the 40+ sentence texts of the blind holdout in test/adapters/norwegian-holdout.test.ts (annotations ignored, relabelled independently) — labelled as such' },
  nn: { dev: 'data/corpus/nn (all 21 sentences) + the sentence text (annotations stripped) of NN_GOLD in test/adapters/norwegian-gold-data.ts', hard: 'authored sentences (not from the corpus)', unseen: 'NO verified Scripture slice for nn and the corpus holds only 21 sentences: the sentence texts of the blind holdout in test/adapters/norwegian-holdout.test.ts (annotations ignored, relabelled independently) — labelled as such' },
};

const CORPUS_SLICES = new Set(['GEN.1', 'PSA.1', 'PSA.23', 'MAT.1', 'MRK.1', '1JN.1']);
const VERIFIED_ID: Record<string, string> = { es: 'spaRV1909', de: 'deu1912', hi: 'hin2017', th: 'a62f327aa0179709' };

function holdoutSentences(which: 'NB' | 'NN'): string[] {
  const src = fs.readFileSync(path.join(ROOT, 'test/adapters/norwegian-holdout.test.ts'), 'utf8');
  const m = new RegExp(`const ${which}: readonly Sentence\\[\\] = \\[([\\s\\S]*?)\\n\\];`).exec(src);
  if (!m) return [];
  return [...m[1].matchAll(/^\s*\[\s*'((?:[^'\\]|\\.)*)'\s*,/gm)].map((x) => x[1].replace(/\\'/g, "'").normalize('NFC'));
}
function goldDataSentences(which: 'NB_GOLD' | 'NN_GOLD'): string[] {
  const src = fs.readFileSync(path.join(ROOT, 'test/adapters/norwegian-gold-data.ts'), 'utf8');
  const m = new RegExp(`export const ${which}: GoldSentence\\[\\] = \\[([\\s\\S]*?)\\n\\];`).exec(src);
  if (!m) return [];
  return [...m[1].matchAll(/line: '((?:[^'\\]|\\.)*)'/g)].map((x) => x[1].replace(/\\'/g, "'").replace(/=[^\s,.?!]+/g, '').normalize('NFC'));
}

function verifiedPool(lang: string, wantVerses: number): Array<{ text: string; sentence: string }> {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/verified/scripture.json'), 'utf8')) as { translations: Array<{ lang: string; translationId: string; verses: Record<string, { text: string }> }> };
  const t = j.translations.find((x) => x.lang === lang && x.translationId === VERIFIED_ID[lang]);
  if (!t) return [];
  const byBook = new Map<string, string[]>();
  for (const k of Object.keys(t.verses)) {
    const [book, ch] = k.split('.');
    if (CORPUS_SLICES.has(`${book}.${ch}`)) continue;
    if (Number(ch) < 2) continue; // chapter 1 of any book is where course slices were drawn from
    const len = [...t.verses[k].text].length;
    if (len < 30 || len > 140) continue;
    (byBook.get(book) ?? byBook.set(book, []).get(book)!).push(k);
  }
  const books = [...byBook.keys()];
  const chosen: Array<{ text: string; sentence: string }> = [];
  for (let i = 0; i < wantVerses; i++) {
    const book = books[Math.floor((i * books.length) / wantVerses)];
    const verses = byBook.get(book)!;
    const k = verses[Math.floor(((i * 7 + 3) % 11) * verses.length / 11)];
    chosen.push({ text: k, sentence: t.verses[k].text.trim().normalize('NFC') });
  }
  return chosen;
}

/** Two word selections per verse (≈30% and ≈70% through the words), skipping one-letter words. */
function pickFromVerses(lang: string, pool: Array<{ text: string; sentence: string }>, idPrefix: string): Skeleton[] {
  const a = getAnalyser(lang)!;
  const out: Skeleton[] = [];
  for (const s of pool) {
    const toks = wordTokens(a, s.sentence).filter((t) => [...t.surface].length >= 2);
    if (toks.length < 2) continue;
    const idx = [...new Set([Math.floor(toks.length * 0.3), Math.floor(toks.length * 0.7)])];
    for (const i of idx) out.push({ id: '', text: s.text, sentence: s.sentence, start: toks[i].start, end: toks[i].end, surface: toks[i].surface });
  }
  return out.map((x, i) => ({ ...x, id: `${idPrefix}-${String(i + 1).padStart(3, '0')}` }));
}

function sample(outDir: string): void {
  ensureAnalysers();
  fs.mkdirSync(outDir, { recursive: true });
  for (const lang of LANGS) {
    const a = getAnalyser(lang);
    if (!a) continue;
    // dev
    let devPool: Array<{ text: string; sentence: string }>;
    const sqReserved = new Set(['udha-1-06', 'udha-1-07', 'udha-1-08', 'misioni-1-04']);
    if (lang === 'nb' || lang === 'nn') {
      devPool = [...corpusSentences(lang, () => true), ...goldDataSentences(lang === 'nb' ? 'NB_GOLD' : 'NN_GOLD').map((sentence, i) => ({ text: `gold-data-${i + 1}`, sentence }))];
    } else if (lang === 'sq') devPool = corpusSentences(lang, (id) => !id.startsWith('bible-') && !sqReserved.has(id));
    else devPool = corpusSentences(lang, (id) => !id.startsWith('bible-'));
    const dev = sampleSelections(a, devPool, 215, `${lang}-dev`);
    // unseen
    let unseen: Skeleton[];
    if (lang === 'sq') unseen = sampleSelections(a, corpusSentences(lang, (id) => sqReserved.has(id)), 70, `${lang}-unseen`);
    else if (lang === 'nb' || lang === 'nn') unseen = sampleSelections(a, holdoutSentences(lang === 'nb' ? 'NB' : 'NN').map((sentence, i) => ({ text: `holdout-${i + 1}`, sentence })), 70, `${lang}-unseen`);
    else unseen = pickFromVerses(lang, verifiedPool(lang, 40), `${lang}-unseen`);
    for (const [set, items] of [['dev', dev], ['unseen', unseen]] as const) {
      fs.writeFileSync(path.join(outDir, `${lang}-${set}.json`), JSON.stringify(items, null, 1));
      fs.writeFileSync(path.join(outDir, `${lang}-${set}.txt`), items.map((x) => `${x.id}\t${x.text}\t${x.sentence.slice(0, x.start)}⟦${x.surface}⟧${x.sentence.slice(x.end)}`).join('\n') + '\n');
    }
    console.log(`${lang}: dev ${dev.length} (${new Set(dev.map((x) => x.text)).size} texts), unseen ${unseen.length} (${new Set(unseen.map((x) => x.text)).size} texts)`);
  }
}

// ───────────────────────────── merge ─────────────────────────────

function parseFeatures(s: string): Record<string, string> {
  const t = s.trim();
  if (!t || t === '-' || t === '_') return {};
  const out: Record<string, string> = {};
  for (const kv of t.split('|')) { const i = kv.indexOf('='); if (i > 0) out[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); }
  return out;
}

function header(lang: string, set: GoldSet, items: GoldItem[]): GoldFile {
  const notes: Record<GoldSet, string> = {
    dev: 'Contextual word selections from the course corpus. AI-judged, unreviewed. Labelled without running the analysers on the items. Use for measuring; do not tune the engine to this file.',
    hard: 'Hard cases written to break a naive engine: each carries the expected analysis, the wrong analysis a naive engine would give, and why it is hard. AI-judged, unreviewed.',
    unseen: 'Held-out selections, never to be used for tuning. AI-judged, unreviewed.',
  };
  return { language: lang, labelled_by: LABELLED_BY, created: '2026-10-10', purpose: set, source: SOURCE[lang][set], feature_keys: FEATURE_KEYS[lang], notes: notes[set], items };
}

function mergeTsv(dir: string, lang: string, set: 'dev' | 'unseen'): GoldItem[] | undefined {
  const skelP = path.join(dir, `${lang}-${set}.json`);
  const tsvP = path.join(dir, `${lang}-${set}.tsv`);
  if (!fs.existsSync(skelP) || !fs.existsSync(tsvP)) return undefined;
  const skel = new Map((JSON.parse(fs.readFileSync(skelP, 'utf8')) as Skeleton[]).map((s) => [s.id, s]));
  const items: GoldItem[] = [];
  for (const line of fs.readFileSync(tsvP, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    const c = line.split(/\s;\s|\t/).map((x) => x.trim());
    const s = skel.get(c[0]);
    if (!s) { console.warn(`${lang} ${set}: unknown id ${c[0]}`); continue; }
    const [, lemma, pos, feats = '', relation = '', difficulty = 'medium', amb = '', spanRaw = ''] = c;
    const span = spanRaw === '-' ? '' : spanRaw;
    if (!lemma || lemma.trim().toUpperCase() === 'SKIP') continue;
    let { start, end, surface } = s;
    if (span.trim() && span.trim() !== surface) {
      // a corrected span (e.g. a Thai word the tokenizer cut wrongly): the occurrence nearest to the sampled start
      const sp = span.trim().normalize('NFC');
      let best = -1;
      for (let i = s.sentence.indexOf(sp); i >= 0; i = s.sentence.indexOf(sp, i + 1)) if (best < 0 || Math.abs(i - s.start) < Math.abs(best - s.start)) best = i;
      if (best >= 0) { start = best; end = best + sp.length; surface = sp; } else console.warn(`${lang} ${set} ${s.id}: span "${sp}" not found`);
    }
    const it: GoldItem = { id: s.id, text: s.text, sentence: s.sentence, start, end, surface, lemma: lemma.trim().normalize('NFC'), pos: pos.trim(), features: parseFeatures(feats), difficulty: (difficulty.trim() || 'medium') as GoldItem['difficulty'] };
    if (relation.trim() && relation.trim() !== '-') it.relation = relation.trim();
    if (/^(y|yes|1|true)$/i.test(amb.trim())) it.ambiguous = true;
    items.push(it);
  }
  return items;
}

function mergeHard(dir: string, lang: string): GoldItem[] | undefined {
  const p = path.join(dir, `${lang}-hard.json`);
  if (!fs.existsSync(p)) return undefined;
  const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Array<Record<string, unknown>>;
  const items: GoldItem[] = [];
  raw.forEach((r, i) => {
    const sentence = String(r.sentence ?? '').normalize('NFC');
    const surface = String(r.surface ?? '').normalize('NFC');
    const nth = Number(r.nth ?? 1);
    let at = -1;
    for (let k = 0, from = 0; k < nth; k++) { at = sentence.indexOf(surface, from); if (at < 0) break; from = at + 1; }
    if (at < 0) { console.warn(`${lang} hard #${i + 1}: "${surface}" not in "${sentence}"`); return; }
    const exp = (r.expected ?? {}) as { lemma?: string; pos?: string; features?: Record<string, string> };
    const it: GoldItem = {
      id: `${lang}-hard-${String(items.length + 1).padStart(3, '0')}`, text: 'authored', sentence, start: at, end: at + surface.length, surface,
      lemma: String(exp.lemma ?? '').normalize('NFC'), pos: String(exp.pos ?? ''), features: exp.features ?? {},
      difficulty: 'hard', category: String(r.category ?? ''), why_hard: String(r.why_hard ?? ''), wrong: (r.wrong ?? {}) as GoldItem['wrong'],
    };
    if (r.relation) it.relation = String(r.relation);
    if (r.ambiguous) it.ambiguous = true;
    if (Array.isArray(r.expected_segmentation)) it.expected_segmentation = (r.expected_segmentation as string[]).map((x) => x.normalize('NFC'));
    items.push(it);
  });
  return items;
}

function merge(dir: string): void {
  for (const lang of LANGS) {
    fs.mkdirSync(path.join(GOLD_DIR, lang), { recursive: true });
    for (const set of ['dev', 'unseen', 'hard'] as const) {
      const items = set === 'hard' ? mergeHard(dir, lang) : mergeTsv(dir, lang, set);
      if (!items) { console.log(`${lang} ${set}: nothing to merge`); continue; }
      const f = header(lang, set, items);
      fs.writeFileSync(path.join(GOLD_DIR, lang, SET_FILE[set]), JSON.stringify(f, null, 1) + '\n');
      const errs = validateGold(f, lang, set);
      console.log(`${lang} ${set}: ${items.length} items${errs.length ? `, ${errs.length} problems: ${errs.slice(0, 4).join('; ')}` : ''}`);
    }
  }
}

if (cmd === 'sample') sample(arg('out', ''));
else if (cmd === 'merge') merge(arg('in', ''));
else console.log('usage: gold-build.mts sample --out <dir> | merge --in <dir> [--langs ..]');
