/**
 * Builds src/adapters/french/lexicon-full-data.ts: every French lemma the dictionary extract holds, as lemma + part of speech + gender
 * + three flags. NO glosses, NO definitions, NO examples. Run from the repository root:
 *   npx vite-node --config scripts/vite.config.ts scripts/fr-build-lexicon.mts
 * Deterministic: the same extract gives a byte-identical file (sorted, no timestamps). See docs/french/LEXICON.md.
 *
 * Rules (HONESTY: nothing invented):
 *  - a lemma is listed only if the extract has it as a headword of a kept part of speech with at least one REAL sense: a sense that is not
 *    a form-of / alt-of pointer, not a "… spelling of / form of / plural of / feminine of / past participle of" gloss, and not tagged
 *    misspelling / pronunciation-spelling;
 *  - gender only where the extract states it (head template argument, else the senses' tags masculine / feminine);
 *  - single tokens as the tokenizer makes them (no space; hyphen fine; an apostrophe only for FRENCH_WHOLE_APOSTROPHE).
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { FRENCH_WHOLE_APOSTROPHE } from '../src/adapters/french/tokenize';
import { normalizeFr } from '../src/adapters/french/orth';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'data', 'dictionaries', 'kaikki.org-dictionary-French.jsonl');
const OUT = path.join(ROOT, 'src', 'adapters', 'french', 'lexicon-full-data.ts');
const SHA256 = '9053b1845fb3e045fa1fbe3f749122fa43e21b49bfa741cadd50255ae6ca0126';

const POS_MAP: Record<string, 'NOUN' | 'VERB' | 'ADJ' | 'ADV' | 'PROPN' | 'INTJ'> = { noun: 'NOUN', verb: 'VERB', adj: 'ADJ', adv: 'ADV', name: 'PROPN', intj: 'INTJ' };
type P = 'NOUN' | 'VERB' | 'ADJ' | 'ADV' | 'PROPN' | 'INTJ';
const POS_ORDER: P[] = ['NOUN', 'VERB', 'ADJ', 'ADV', 'PROPN', 'INTJ'];

interface Sense { tags?: string[]; glosses?: string[]; form_of?: unknown; alt_of?: unknown; categories?: Array<{ name?: string } | string> }
interface Entry { word: string; pos: string; head_templates?: Array<{ name?: string; args?: Record<string, string> }>; senses?: Sense[]; categories?: Array<{ name?: string } | string> }

const POINTER_GLOSS = /^(?:[A-Za-z0-9-]+ ){0,2}(?:spelling|alternative form|alternative spelling|alternative|form|variant|misspelling|plural|feminine|masculine|inflection|past participle|present participle|participle) of\b/i;
const NOT_POINTER_START = /^(?:a|an|the|any|one|of|some|each|type|kind|piece|resident|native)\s/i;
const NOT_REAL_TAGS = new Set(['form-of', 'alt-of', 'misspelling', 'pronunciation-spelling', 'error-misspelling']);
const DATED_TAGS = new Set(['obsolete', 'archaic', 'dated']);

const catName = (c: { name?: string } | string): string => (typeof c === 'string' ? c : c.name ?? '');

function isReal(s: Sense): boolean {
  if (s.form_of || s.alt_of) return false;
  const tags = s.tags ?? [];
  if (tags.some((t) => NOT_REAL_TAGS.has(t))) return false;
  const g = (s.glosses ?? [])[0] ?? '';
  if (!NOT_POINTER_START.test(g) && POINTER_GLOSS.test(g)) return false;
  return true;
}

/** 'm' | 'f' | 'b' (both) | '' from the head template; '' when it states none. */
function headGender(e: Entry): string {
  let m = false, f = false;
  for (const h of e.head_templates ?? []) {
    const raw = e.pos === 'noun' && h.name === 'head' ? h.args?.g : h.args?.['1'];
    if (!raw) continue;
    if (h.name !== 'head' && !/^fr-(noun|proper noun|prop)$/.test(h.name ?? '')) continue;
    for (const part of raw.replace(/<[^>]*>/g, '').split(',')) {
      const t = part.trim().replace(/-[ps]$/, '');
      if (t === 'm') m = true; else if (t === 'f') f = true; else if (t === 'mf' || t === 'mfbysense') { m = true; f = true; }
    }
  }
  return m && f ? 'b' : m ? 'm' : f ? 'f' : '';
}
function senseGender(senses: Sense[]): string {
  let m = false, f = false;
  for (const s of senses) for (const t of s.tags ?? []) { if (t === 'masculine') m = true; else if (t === 'feminine') f = true; }
  return m && f ? 'b' : m ? 'm' : f ? 'f' : '';
}
const joinG = (a: string, b: string): string => (!a ? b : !b ? a : a === b ? a : 'b');

interface Rec { g: string; real: boolean; allDated: boolean; allPron: boolean; h: boolean; fromSe: boolean; fromBare: boolean }
const tables: Record<P, Map<string, Rec>> = { NOUN: new Map(), VERB: new Map(), ADJ: new Map(), ADV: new Map(), PROPN: new Map(), INTJ: new Map() };

const stats = { lines: 0, kept: 0, skippedForm: 0, skippedShape: 0, skippedSe: 0, skippedBadChar: 0 };
const WORD_SHAPE = /^[\p{L}][\p{L}\p{M}'’-]*$/u;

const hash = crypto.createHash('sha256');
const rl = readline.createInterface({ input: fs.createReadStream(SRC).on('data', (d) => hash.update(d)), crlfDelay: Infinity });
for await (const line of rl) {
  stats.lines++;
  if (!line) continue;
  const e = JSON.parse(line) as Entry;
  const pos = POS_MAP[e.pos];
  if (!pos) continue;
  let word = e.word;
  let fromSe = false;
  if (pos === 'VERB') {
    const m = /^(?:se |s')(.+)$/.exec(word);
    if (m) { word = m[1]; fromSe = true; }
  }
  if (!word || /\s/.test(word) || !WORD_SHAPE.test(word) || /['’]$/.test(word)) { stats.skippedShape++; if (fromSe) stats.skippedSe++; continue; }
  if (/['’]/.test(word) && !FRENCH_WHOLE_APOSTROPHE.has(normalizeFr(word))) { stats.skippedShape++; continue; }
  const senses = e.senses ?? [];
  const real = senses.filter(isReal);
  if (!real.length) { stats.skippedForm++; continue; }
  const dated = real.every((s) => (s.tags ?? []).some((t) => DATED_TAGS.has(t)));
  const pron = fromSe || real.every((s) => (s.tags ?? []).includes('pronominal'));
  const h = (e.categories ?? []).some((c) => /aspirated h/.test(catName(c))) || senses.some((s) => (s.categories ?? []).some((c) => /aspirated h/.test(catName(c))));
  const g = pos === 'NOUN' ? (headGender(e) || senseGender(real)) : '';
  const t = tables[pos];
  const cur = t.get(word);
  if (!cur) t.set(word, { g, real: true, allDated: dated, allPron: pron, h, fromSe, fromBare: !fromSe });
  else {
    cur.g = joinG(cur.g, g);
    cur.allDated &&= dated;
    cur.allPron &&= pron;
    cur.h ||= h;
    cur.fromSe ||= fromSe;
    cur.fromBare ||= !fromSe;
  }
  stats.kept++;
}
const sha = hash.digest('hex');
if (sha !== SHA256) throw new Error(`the extract is not the expected one: sha256 ${sha}`);

const collator = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const out: Record<P, string[]> = { NOUN: [], VERB: [], ADJ: [], ADV: [], PROPN: [], INTJ: [] };
const counts: Record<string, number> = {};
const flagCounts = { p: 0, o: 0, h: 0 };
const genderCounts = { m: 0, f: 0, b: 0, none: 0 };
for (const pos of POS_ORDER) {
  const keys = [...tables[pos].keys()].filter((k) => !/[/!\n]/.test(k)).sort(collator);
  counts[pos] = keys.length;
  const lines: string[] = [];
  for (const k of keys) {
    const r = tables[pos].get(k)!;
    let s = k;
    if (pos === 'NOUN') { if (r.g) s += '/' + r.g; genderCounts[(r.g || 'none') as keyof typeof genderCounts]++; }
    let fl = '';
    if (pos === 'VERB' && r.allPron) { fl += 'p'; flagCounts.p++; }
    if (r.allDated) { fl += 'o'; flagCounts.o++; }
    if (r.h) { fl += 'h'; flagCounts.h++; }
    if (fl) s += '!' + fl;
    lines.push(s);
  }
  // chunks of about 1,400 characters so that no source line is huge
  let cur: string[] = [], len = 0;
  for (const l of lines) {
    cur.push(l); len += l.length + 1;
    if (len >= 1400) { out[pos].push(JSON.stringify(cur.join('\n'))); cur = []; len = 0; }
  }
  if (cur.length) out[pos].push(JSON.stringify(cur.join('\n')));
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);
const header = `/**
 * GENERATED FILE: never hand-edited. Built by scripts/fr-build-lexicon.mts (npx vite-node --config scripts/vite.config.ts scripts/fr-build-lexicon.mts).
 *
 * Every French lemma the dictionary extract holds, with its part of speech, a noun's gender and three flags. NO glosses, NO definitions, NO example text.
 * Source: kaikki.org French dictionary extract (data/dictionaries/kaikki.org-dictionary-French.jsonl), dated 2026-10-30,
 *   sha256 ${SHA256}, ${stats.lines.toLocaleString('en-US')} lines.
 * Licence: CC BY-SA 4.0 (the extract's own). Attribution: Wiktionary, via kaikki.org — CC BY-SA 4.0
 *
 * Format: one string per part of speech, entries separated by "\\n", sorted; each entry is  lemma  [/g]  [!flags]
 *   g      m | f | b (both: the extract gives both, "mf" / "mfbysense", or two entries of different gender); nouns only; absent = the extract states none
 *   flags  p  verb headword used only as a pronominal (se souvenir; stored under the bare infinitive)
 *          o  every real sense is labelled obsolete, archaic or dated
 *          h  the extract marks the word "French terms with aspirated h"
 * Lemmas keep the extract's case (proper names keep their capital); lookups compare by normalizeFr (french/lexicon-full.ts).
 * ${total.toLocaleString('en-US')} entries: ${POS_ORDER.map((p) => `${p} ${counts[p].toLocaleString('en-US')}`).join(', ')}.
 */
`;
let body = 'export const FR_FULL: Readonly<Record<\'NOUN\' | \'VERB\' | \'ADJ\' | \'ADV\' | \'PROPN\' | \'INTJ\', string>> = {\n';
for (const pos of POS_ORDER) body += `  ${pos}: [\n${out[pos].map((c) => '    ' + c).join(',\n')},\n  ].join('\\n'),\n`;
body += '};\n\n';
body += `export const FR_FULL_SOURCE = {
  id: 'kaikki-fr@2026-10-30',
  sha256: '${SHA256}',
  lines: ${stats.lines},
  builtBy: 'scripts/fr-build-lexicon.mts',
  entries: { ${POS_ORDER.map((p) => `${p}: ${counts[p]}`).join(', ')} },
} as const;
`;
fs.writeFileSync(OUT, header + body, 'utf8');
const size = fs.statSync(OUT).size;
console.log('lines read', stats.lines);
console.log('counts', counts, 'total', total);
console.log('nouns by gender', genderCounts);
console.log('flags', flagCounts);
console.log('skipped: only-pointer senses', stats.skippedForm, '| not a single token / bad shape', stats.skippedShape, '(of which se-/s\' headwords that are multi-word', stats.skippedSe + ')');
console.log('file size', size, 'bytes', (size / 1048576).toFixed(2), 'MiB');
