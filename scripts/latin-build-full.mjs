#!/usr/bin/env node
/**
 * Builds src/adapters/latin/lexicon-full-data.ts: the FULL Whitaker lexicon (DICTLINE.GEN, about 39,000 entries) in a compact one-line-per-entry
 * text, loaded lazily by the adapter (latin/lexicon-load.ts, a dynamic import: its own chunk beside the analyser). The seed lexicon
 * (lexicon-data.ts, 1,500 rows ranked by the Vulgate) stays inline.
 *
 * Reads, and never modifies: C:/Users/CJWal/dev/romance-v0/data/dict/DICTLINE.GEN (William Whitaker's Words, free for any use).
 * Usage: node scripts/latin-build-full.mjs
 *
 * Line formats (fields separated by a tab; the first letter names the kind; f = frequency letter A..F of Whitaker's file):
 *   N lemma gen genderflags f gloss          noun / name; genderflags: m f n c x, then p (plural only), I (i-stem), K (consonant stem)
 *   V lemma inf perf sup conj kind f gloss   verb (perf "stem us sum" for a deponent); kind TRANS INTRANS DEP SEMIDEP IMPERS PERFDEF X
 *   A lemma type fem neut f gloss            adjective (types as lexicon-data.ts)
 *   D lemma f gloss comparative superlative  adverb
 *   R lemma cases f gloss                    preposition
 *   C lemma f gloss    I lemma f gloss       conjunction, interjection
 *   M lemma kind f gloss                     numeral; kind: I indeclinable, 12 first/second declension singular, P plural
 *   K lemma base pres perf ppp f gloss       compound of sum / eo / fero
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'src', 'adapters', 'latin', 'lexicon-full-data.ts');
const raw = fs.readFileSync('C:/Users/CJWal/dev/romance-v0/data/dict/DICTLINE.GEN', 'utf8').split(/\r?\n/);
const GRAM = { N: 4, V: 3, ADJ: 3, ADV: 1, PREP: 1, CONJ: 0, INTERJ: 0, NUM: 4, PRON: 3, PACK: 3 };
const ji = (x) => x.replace(/j/g, 'i').replace(/J/g, 'I');
const plain = (s) => ji(s.normalize('NFD').replace(/[\u0304\u0306]/g, '').normalize('NFC'));

function shortGloss(m) {
  const t = m.replace(/^\|/, '').replace(/\((?:N|V|ADJ) [0-9][^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
  const parts = t.split(/;\s*/).filter(Boolean);
  let out = parts[0] ?? '';
  for (let i = 1; i < parts.length && out.length < 28 && (out + '; ' + parts[i]).length <= 52; i++) out += '; ' + parts[i];
  if (out.length > 60) out = out.slice(0, 57).replace(/[\s,;(]+\S*$/, '') + '...';
  return out.replace(/[;,\s]+$/, '').replace(/\t/g, ' ');
}

const entries = [];
for (const line of raw) {
  if (line.length < 80) continue;
  const s = [0, 19, 38, 57].map((i) => ji(line.slice(i, i + 19).trim()));
  const rest = line.slice(76).trim().split(/\s+/);
  const pos = rest[0];
  if (!(pos in GRAM)) continue;
  const g = rest.slice(1, 1 + GRAM[pos]);
  const tail = rest.slice(1 + GRAM[pos]);
  entries.push({ pos, s, g, freq: tail[3] ?? 'X', age: tail[0], meaning: tail.slice(5).join(' ') });
}

const out = { N: [], V: [], A: [], D: [], R: [], C: [], I: [], M: [], K: [] };
const skipped = {};
const skip = (why) => { skipped[why] = (skipped[why] ?? 0) + 1; };
const none = (x) => (!x || x === 'zzz' ? '' : x);
const FR = 'ABCDEF';
const rank = (f) => { const i = FR.indexOf(f); return i < 0 ? 6 : i; };

for (const e of entries) {
  const [s1, s2, s3, s4] = e.s;
  const f = FR.includes(e.freq) ? e.freq : 'F';
  const gloss = shortGloss(e.meaning);
  const name = /^[A-Z]/.test(s1);
  if (e.pos === 'N') {
    const [d, v, gen] = e.g;
    const G = { M: 'm', F: 'f', N: 'n', C: 'c' }[gen] ?? 'x';
    const st = s2 || s1;
    let lemma, genitive, flags = '';
    if (d === '1' && v === '1') { lemma = s1 + 'a'; genitive = st + 'ae'; }
    else if (d === '1' && v === '6') { lemma = s1 + 'es'; genitive = st + 'ae'; }
    else if (d === '1' && v === '7') { lemma = s1 + 'e'; genitive = st + 'ae'; }
    else if (d === '1' && v === '8') { lemma = s1 + 'as'; genitive = st + 'ae'; }
    else if (d === '2' && v === '3') { lemma = s1; genitive = st + 'i'; }
    else if (d === '2') { lemma = s1 + (G === 'n' ? 'um' : 'us'); genitive = st + 'i'; }
    else if (d === '3') { lemma = s1; genitive = st + 'is'; flags = v === '3' || v === '4' ? 'I' : v === '1' || v === '2' ? 'K' : ''; }
    else if (d === '4' && (v === '1' || v === '2')) { lemma = s1 + (G === 'n' ? 'u' : 'us'); genitive = st + 'us'; }
    else if (d === '5') { lemma = s1 + 'es'; genitive = st + 'ei'; }
    else if (d === '9') { lemma = s1; genitive = ''; }
    else { skip(`N ${d} ${v}`); continue; }
    if (!lemma) { skip('N empty'); continue; }
    out.N.push([f, `N\t${lemma}\t${genitive}\t${G}${flags}\t${f}\t${gloss}`]);
  } else if (e.pos === 'V') {
    const [c, v, kind] = e.g;
    const dep = kind === 'DEP';
    const perfdef = kind === 'PERFDEF';
    const p3 = none(s3);
    const p4 = none(s4);
    if (c === '5' && v === '1' && kind === 'TO_BEING' && s2) { out.K.push([f, `K\t${s1 + 'um'}\tsum\t${s2}\t${p3}\t\t${f}\t${gloss}`]); continue; }
    if (c === '6' && v === '1' && s2 && s1.endsWith('e') && !perfdef) { out.K.push([f, `K\t${s1 + 'o'}\teo\t${s1.slice(0, -1)}\t\t\t${f}\t${gloss}`]); continue; }
    if (c === '6' && v === '2' && s1.endsWith('fer') && p3) { out.K.push([f, `K\t${s1 + 'o'}\tfero\t${s1.slice(0, -3)}\t${p3}\t${p4.replace(/um$/, '')}\t${f}\t${gloss}`]); continue; }
    if (!['1', '2', '3'].includes(c) && !(c === '8' && v === '3') && !(c === '7' && v === '3')) { skip(`V ${c} ${v}`); continue; }
    let lemma, inf;
    const sx = s2 || s1;
    if (c === '1' && v === '1') { lemma = s1 + (dep ? 'or' : 'o'); inf = sx + (dep ? 'ari' : 'are'); }
    else if (c === '2' && v === '1') { lemma = s1 + (dep ? 'eor' : 'eo'); inf = sx + (dep ? 'eri' : 'ere'); }
    else if (c === '3' && v === '1') { lemma = s1 + (dep ? 'or' : 'o'); inf = sx + (dep ? 'i' : 'ere'); }
    else if (c === '3' && (v === '3' || v === '4')) {
      lemma = s1 + (dep ? 'or' : 'o');
      inf = v === '3' ? sx + (dep ? 'i' : 'ere') : sx + (dep ? 'iri' : 'ire');
    } else if (c === '8' && v === '3') { lemma = s1 + (dep ? 'or' : 'o'); inf = sx + (dep ? 'i' : 'ere'); }
    else if (c === '7' && v === '3') { lemma = s1 + 'o'; inf = sx + 'ere'; }
    else { skip(`V ${c} ${v}`); continue; }
    const impers = kind === 'IMPERS';
    if (impers && c === '2') lemma = s1 + 'et';
    else if (impers && (c === '1' || c === '3')) lemma = s1 + (c === '1' ? 'at' : 'it');
    let perf = '';
    let sup = '';
    if (dep || kind === 'SEMIDEP') { perf = p4 || p3 ? (p4 || p3) + 'us sum' : ''; }
    else { perf = p3 ? p3 + 'i' : ''; sup = p4 ? p4 + 'um' : ''; }
    // the -io verbs of the 3rd conjugation: tell them by the lemma (facio, capio, patior)
    let conj = c === '8' ? '3' : c === '7' ? '3' : c;
    if (c === '3' && v === '4') conj = '4';
    else if ((c === '3' && /ior?$/.test(lemma) && !/iri?$/.test(inf)) || (c === '3' && v === '3') || (c === '8' && v === '3')) conj = '3io';
    let k = kind;
    if (perfdef) { k = 'PERFDEF'; lemma = p3 ? p3 + 'i' : lemma; perf = lemma; sup = ''; }
    out.V.push([f, `V\t${lemma}\t${inf}\t${perf}\t${sup}\t${conj}\t${k}\t${f}\t${gloss}`]);
  } else if (e.pos === 'ADJ') {
    const [d, v, deg] = e.g;
    if ((deg === 'COMP' || deg === 'SUPER') && d === '0') {
      // an irregular comparative or superlative with an entry of its own (anterior, summus): its own headword
      if (deg === 'COMP' && s1) out.A.push([f, `A	${s1}or	cmp			${f}	${gloss}`]);
      else if (s1) out.A.push([f, `A	${s1}mus	12	${s1}ma	${s1}mum	${f}	${gloss}`]);
      continue;
    }
    if (s1 === 'zzz' || !s1) {
      if (none(s3)) out.A.push([f, `A\t${s3}or\tcmp\t\t\t${f}\t${gloss}`]);
      if (none(s4)) out.A.push([f, `A\t${s4}mus\t12\t${s4}ma\t${s4}mum\t${f}\t${gloss}`]);
      continue;
    }
    const st = s2 || s1;
    let row;
    if (d === '1' && v === '2') row = [s1, '12r', st + 'a', st + 'um'];
    else if (d === '1' || d === '2') row = [s1 + 'us', '12', s1 + 'a', s1 + 'um'];
    else if (d === '3' && v === '2') row = [s1 + 'is', '3b', '', s1 + 'e'];
    else if (d === '3' && v === '3') row = [s1, '3a', st + 'is', st + 'e'];
    else if (d === '3') row = [s1, '3x', st + 'is', ''];
    else if (d === '9') row = [s1, 'I', '', ''];
    else { skip(`ADJ ${d} ${v}`); continue; }
    if (!row[0]) { skip('ADJ empty'); continue; }
    // the comparative and superlative stems the entry gives (abjecti-, abjectissi-; the irregular ones: ulter has ultim-)
    const cmpS = deg === 'X' ? none(s3) : '';
    const supS = deg === 'X' ? none(s4) : '';
    out.A.push([f, `A\t${row[0]}\t${row[1]}\t${row[2]}\t${row[3]}\t${f}\t${gloss}\t${cmpS}\t${supS}`]);
  } else if (e.pos === 'ADV') {
    if (e.g[0] === 'COMP' || e.g[0] === 'SUPER') { out.D.push([f, `D	${s1}	${f}	${gloss}			${e.g[0] === 'COMP' ? 'Cmp' : 'Sup'}`]); continue; }
    const cmp = e.g[0] === 'X' ? none(s2) : '';
    const sup = e.g[0] === 'X' ? none(s3) : '';
    out.D.push([f, `D\t${s1}\t${f}\t${gloss}\t${cmp}\t${sup}`]);
  } else if (e.pos === 'PREP') {
    out.R.push([f, `R\t${s1}\t${e.g[0][0] + e.g[0].slice(1).toLowerCase()}\t${f}\t${gloss}`]);
  } else if (e.pos === 'CONJ') out.C.push([f, `C\t${s1}\t${f}\t${gloss}`]);
  else if (e.pos === 'INTERJ') out.I.push([f, `I\t${s1}\t${f}\t${gloss}`]);
  else if (e.pos === 'NUM') {
    const [d, v, kind] = e.g;
    const cards = [];
    const push = (lemma, k, g) => { if (lemma) cards.push([lemma, k, g]); };
    if (kind === 'X') {
      // one entry gives the cardinal, ordinal and distributive stems (the stems of un-, du-, tr- are closed-class words, written by hand)
      if (d === '2') push(s1, 'I', gloss);
      else if (d === '1' && v === '4') push(s1 + 'i', 'P', gloss);
      if (none(s2)) push(s2 + 'us', '12', 'ordinal: ' + gloss);
      if (none(s3) && s3.length > 3) push(s3 + 'i', 'P', 'distributive: ' + gloss);
    } else if (kind === 'CARD') push(d === '2' ? s1 : '', 'I', gloss);
    else if (kind === 'ORD') push(s1 + 'us', '12', gloss);
    else if (kind === 'DIST') push(s1 + 'i', 'P', gloss);
    else if (kind === 'ADVERB') push(s1, 'I', gloss);
    for (const [lemma, k, g] of cards) out.M.push([f, `M\t${lemma}\t${k}\t${f}\t${g}`]);
  }
  void name;
}

// ─── the Vulgate's names: PROIEL / automated lemmas tagged as proper names in vetus-v0 (counts only; no text), declension assumed from the ending ───
const lemPos = JSON.parse(fs.readFileSync('C:/Users/CJWal/dev/vetus-v0/data/build/la-lemma-pos.json', 'utf8'));
const conc = JSON.parse(fs.readFileSync('C:/Users/CJWal/dev/vetus-v0/data/build/conc-la.json', 'utf8'));
const INDECL = new Set(['Israel', 'David', 'Iacob', 'Abraham', 'Isaac', 'Aaron', 'Ioseph', 'Ierusalem', 'Hierusalem', 'Sion', 'Beniamin', 'Levi', 'Iuda', 'Ruben', 'Simeon', 'Gad', 'Dan', 'Nephthali', 'Aser', 'Zabulon', 'Issachar', 'Moab', 'Ammon', 'Amalec', 'Edom', 'Esau', 'Noe', 'Adam', 'Eva', 'Sem', 'Cham', 'Iaphet', 'Lot', 'Sara', 'Rebecca', 'Rachel', 'Lia', 'Bethlehem', 'Sina', 'Iordanes', 'Nazareth']);
const have = new Set(out.N.map((r) => r[1].split('	')[1]));
let addedNames = 0;
for (const [lem, tag] of Object.entries(lemPos)) {
  if (tag !== 'Ne') continue;
  const name = plain(lem.replace(/#[0-9]+$/, ''));
  if (!/^[A-Z]/.test(name) || have.has(name)) continue;
  // the automated lemmas include inflected forms of names (Simeonis, Simeoni): skip a form whose stem is a name already
  const names = Object.keys(lemPos).filter((k) => lemPos[k] === 'Ne');
  if (!globalThis.__nameSet) globalThis.__nameSet = new Set(names.map((k) => plain(k.replace(/#[0-9]+$/, ''))));
  const stemOf = (suffix) => (name.endsWith(suffix) && name.length - suffix.length >= 3 ? name.slice(0, -suffix.length) : undefined);
  if (['ibus', 'orum', 'arum', 'is', 'em', 'um', 'am', 'ae', 'os', 'as', 'i', 'o', 'e'].some((sfx) => { const base = stemOf(sfx); return base !== undefined && [base, base + 'us', base + 'a', base + 'es', base + 'as'].some((c) => c !== name && globalThis.__nameSet.has(c)); })) continue;
  have.add(name);
  let gen = '';
  let g = 'm';
  if (INDECL.has(name)) gen = '';
  else if (/us$/.test(name)) gen = name.replace(/us$/, 'i');
  else if (/a$/.test(name)) { gen = name + 'e'; g = 'f'; }
  else if (/as$/.test(name)) gen = name.replace(/as$/, 'ae');
  else if (/o$/.test(name)) gen = name + 'nis';
  else if (/es$/.test(name)) gen = name.replace(/es$/, 'is');
  else if (/[nlrx]$/.test(name)) gen = name + 'is';
  out.N.push(['F', `N	${name}	${gen}	${g}	F	`]);
  addedNames++;
}
console.error('Vulgate names added: ' + addedNames);

const lines = [];
for (const k of ['N', 'V', 'A', 'D', 'R', 'C', 'I', 'M', 'K']) {
  out[k].sort((a, b) => rank(a[0]) - rank(b[0]));
  for (const [, l] of out[k]) lines.push(l);
}
// ─── the Vulgate occurrence count of a lemma (vetus-v0 concordance: counts only) replaces Whitaker's frequency letter where the part of speech agrees ───
const KIND_OF_TAG = { Nb: 'N', Ne: 'N', 'V-': 'V', 'A-': 'A', Df: 'D', Dq: 'D', Du: 'D', 'R-': 'R', 'C-': 'C', 'G-': 'C', 'I-': 'I', Ma: 'M', Mo: 'M' };
const vcount = new Map();
for (const [key, v] of Object.entries(conc)) {
  const k = KIND_OF_TAG[lemPos[key]];
  if (!k) continue;
  const lemma = plain(key.replace(/#[0-9]+$/, ''));
  const id = k + '|' + lemma;
  vcount.set(id, (vcount.get(id) ?? 0) + v.length / 4);
}
const FREQ_FIELD = { N: 4, V: 7, A: 5, D: 2, R: 3, C: 2, I: 2, M: 3, K: 6 };
let counted = 0;
const givenCount = new Set();
const counted_lines = lines.map((l) => {
  const parts = l.split('\t');
  const fi = FREQ_FIELD[parts[0]];
  const id = parts[0] + '|' + parts[1];
  const n = fi && !givenCount.has(id) ? vcount.get(id) : undefined;
  if (n && fi) {
    givenCount.add(id); parts[fi] = String(Math.round(n)); counted++; return parts.join('\t'); }
  return l;
});
console.error('rows with a Vulgate count: ' + counted);
const body = counted_lines.join('\n');
const L = [];
L.push('/**');
L.push(' * GENERATED by scripts/latin-build-full.mjs — do not edit by hand (docs/latin/ADAPTER.md says how it is made).');
L.push(" * The whole of William Whitaker's Words dictionary (DICTLINE.GEN, free for any use): one line per entry, best-attested first within each kind.");
L.push(' * Loaded lazily by latin/lexicon-load.ts; the seed lexicon (lexicon-data.ts) stays inline. Line formats: scripts/latin-build-full.mjs.');
L.push(' */');
L.push('export const FULL_LEXICON = ' + JSON.stringify(body) + ';');
L.push('');
fs.writeFileSync(OUT, L.join('\n'));
console.error(`rows: ${Object.entries(out).map(([k, v]) => k + '=' + v.length).join(' ')}; ${(body.length / 1024).toFixed(0)} KB; skipped ${JSON.stringify(skipped)}`);
