#!/usr/bin/env node
/**
 * Builds src/adapters/latin/closed-data.ts: the closed classes of the Latin adapter (pronouns, the irregular verbs, numerals,
 * prepositions, conjunctions and particles), ported from the Romance app (C:/Users/CJWal/dev/romance-v0/src/lexicon/*.ts).
 * Not part of the app build. Two steps, both read-only on the Romance app:
 *
 *   1. (cwd = romance-v0)  npx vite-node scripts/latin-dump-romance-closed.ts <out>/closed.json
 *   2. node scripts/latin-build-closed.mjs <out>/closed.json
 *
 * The conversion drops macrons and turns the Romance app's feature names into the Universal-Dependencies-style keys the adapter uses.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'src', 'adapters', 'latin', 'closed-data.ts');
const closed = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
// Vulgate occurrence counts per lemma (vetus-v0): the ranking between homographs, nothing else
const conc = JSON.parse(fs.readFileSync('C:/Users/CJWal/dev/vetus-v0/data/build/conc-la.json', 'utf8'));
const COUNT = new Map();
for (const [k, v] of Object.entries(conc)) { const l = k.replace(/#[0-9]+$/, '').toLowerCase(); COUNT.set(l, (COUNT.get(l) ?? 0) + v.length / 4); }

const CASE = { nom: 'Nom', gen: 'Gen', dat: 'Dat', acc: 'Acc', abl: 'Abl', voc: 'Voc', loc: 'Loc' };
const GENDER = { m: 'Masc', f: 'Fem', n: 'Neut' };
const NUMBER = { sg: 'Sing', pl: 'Plur' };
const TENSE = { present: 'Pres', imperfect: 'Imp', future: 'Fut', perfect: 'Perf', pluperfect: 'Pqp', 'future-perfect': 'FutPerf' };
const VOICE = { active: 'Act', passive: 'Pass' };
const PRON = { personal: 'Prs', reflexive: 'Prs', demonstrative: 'Dem', relative: 'Rel', interrogative: 'Int', indefinite: 'Ind', intensive: 'Emp', possessive: 'Prs' };

function ud(f) {
  const o = {};
  const put = (k, v) => { if (v !== undefined) o[k] = String(v); };
  if (f.mood === 'indicative') { put('VerbForm', 'Fin'); put('Mood', 'Ind'); }
  else if (f.mood === 'subjunctive') { put('VerbForm', 'Fin'); put('Mood', 'Sub'); }
  else if (f.mood === 'imperative') { put('VerbForm', 'Fin'); put('Mood', 'Imp'); }
  else if (f.mood === 'infinitive') put('VerbForm', 'Inf');
  else if (f.mood === 'participle') put('VerbForm', 'Part');
  else if (f.mood === 'gerund') put('VerbForm', 'Ger');
  else if (f.mood === 'gerundive') put('VerbForm', 'Gdv');
  else if (f.mood === 'supine') put('VerbForm', 'Sup');
  put('Tense', TENSE[f.tense]);
  put('Voice', VOICE[f.voice]);
  put('Person', f.person);
  put('Number', NUMBER[f.number]);
  put('Gender', GENDER[f.gender]);
  put('Case', CASE[f.case]);
  put('PronType', PRON[f.pronoun_type]);
  if (f.pronoun_type === 'reflexive') put('Reflex', 'Yes');
  if (f.pronoun_type === 'possessive') put('Poss', 'Yes');
  if (f.enclitic) put('Clitic', f.enclitic);
  return Object.keys(o).sort().map((k) => `${k}=${o[k]}`).join('|');
}

const SCONJ = new Set(['ut', 'ne', 'cum', 'si', 'nisi', 'quod', 'quia', 'quoniam', 'dum', 'postquam', 'ubi', 'quamquam', 'quamvis', 'quin', 'quominus', 'utinam', 'priusquam', 'antequam']);
function posOf(l) {
  if (l.pos === 'pronoun') return 'PRON';
  if (l.pos === 'adjective') return 'ADJ';
  if (l.pos === 'numeral') return 'NUM';
  if (l.pos === 'preposition') return 'ADP';
  if (l.pos === 'conjunction') return SCONJ.has(l.lemma) ? 'SCONJ' : 'CONJ';
  if (l.pos === 'adverb') return 'ADV';
  if (l.pos === 'particle') return 'PART';
  if (l.pos === 'interjection') return 'INTJ';
  if (l.pos === 'verb') return l.lemma === 'sum' ? 'AUX' : 'VERB';
  return 'X';
}
function shortGloss(m) {
  const t = String(m || '').replace(/\s+/g, ' ').replace(/\s*\([^)]*\)/g, '').trim();
  const parts = t.split(/;\s*/).filter(Boolean);
  let out = parts[0] ?? '';
  for (let i = 1; i < parts.length && out.length < 30 && (out + '; ' + parts[i]).length <= 60; i++) out += '; ' + parts[i];
  return out.length > 70 ? out.slice(0, 67).replace(/[\s,;]+\S*$/, '') + '...' : out;
}

const groups = [
  ['PRONOUNS', 'pron'], ['NUMERALS', 'num'], ['PARTICLES', 'part'], ['ENCLITICS', 'enclitic'], ['PREPOSITIONS', 'prep'], ['IRREGULAR_VERBS', 'verb'],
];
const merged = new Map();
for (const [k, kind] of groups) {
  for (const l of closed[k]) {
    if (kind === 'enclitic') continue; // -que / -ne / -ve are handled by the tokenizer / analysis, not as words
    if (kind === 'verb' && (l.lemma === 'do' || l.lemma === 'edo')) continue; // do is a regular first-conjugation verb; edo is in the seed lexicon
    const id = `${kind}:${l.lemma}:${posOf(l)}`;
    const m = merged.get(id) ?? { lemma: l.lemma, pos: posOf(l), kind, gloss: shortGloss(l.gloss), pronType: PRON[l.pronoun_type], governs: l.governs, forms: [], seen: new Set(), count: 0 };
    for (const f of l.forms) {
      const key = f.s + '|' + ud(f.f);
      if (m.seen.has(key)) continue;
      m.seen.add(key);
      m.forms.push([f.s, ud(f.f)]);
    }
    m.count = COUNT.get(l.lemma.toLowerCase()) ?? 0;
    if (l.governs) m.governs = l.governs;
    merged.set(id, m);
  }
}
const q = JSON.stringify;
const L = [];
L.push('/**');
L.push(' * GENERATED by scripts/latin-build-closed.mjs — do not edit by hand (docs/latin/ADAPTER.md says how it is made).');
L.push(' * The closed classes of the Latin adapter, ported from the Romance app (src/lexicon/pronouns, numerals, particles, prepositions, irregular):');
L.push(' * macrons dropped, features turned into Universal-Dependencies-style keys. A form is [written form, "Key=Value|Key=Value"].');
L.push(' */');
L.push("import type { ClosedRow } from './types';");
L.push('');
L.push('export const CLOSED_ROWS: ClosedRow[] = [');
for (const m of merged.values()) {
  const gov = m.governs ? `, governs: ${q(m.governs.map((c) => c[0].toUpperCase() + c.slice(1)))}` : '';
  const pt = m.pronType ? `, pronType: ${q(m.pronType)}` : '';
  L.push(`  { lemma: ${q(m.lemma)}, pos: ${q(m.pos)}, kind: ${q(m.kind)}, gloss: ${q(m.gloss)}, count: ${m.count}${pt}${gov}, forms: [`);
  // the source table gave volo a subjunctive volim, volis…; the present subjunctive of volo is velim, velis, velit, velimus, velitis, velint
  const VOLO_SUB = { volim: 'velim', volis: 'velis', volit: 'velit', volimus: 'velimus', volitis: 'velitis', volint: 'velint' };
  for (const [s0, f] of m.forms) { const s = m.lemma === 'volo' && VOLO_SUB[s0] ? VOLO_SUB[s0] : s0; L.push(`    [${q(s)}, ${q(f)}],`); }
  L.push('  ] },');
}
L.push('];');
L.push('');
fs.writeFileSync(OUT, L.join('\n'));
console.error(`wrote ${OUT}: ${merged.size} lexemes, ${[...merged.values()].reduce((a, m) => a + m.forms.length, 0)} forms`);
