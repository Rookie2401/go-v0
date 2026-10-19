#!/usr/bin/env node
/**
 * Builds src/adapters/latin/lexicon-data.ts (the open-class seed lexicon) for the Latin adapter.
 * Not part of the app build: run by hand when the seed list changes. It reads, and never modifies, sibling projects:
 *
 *   C:/Users/CJWal/dev/vetus-v0/data/build/conc-la.json         lemma -> occurrences in the Clementine Vulgate (the ranking: counts only, no text)
 *   C:/Users/CJWal/dev/vetus-v0/data/build/la-lemma-pos.json    lemma -> coarse part of speech (to tell homographs apart)
 *   C:/Users/CJWal/dev/romance-v0/data/dict/DICTLINE.GEN        William Whitaker's Words dictionary (declension / conjugation / stems / meanings)
 *   <closed.json>                                               the closed-class lemmas of romance-v0's src/lexicon/*.ts (skipped here: they are hand-tabled)
 *
 * Usage: node scripts/latin-build-lexicon.mjs <closed.json> [rows=1500]    (env SCRATCH = where missing.json is written)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'src', 'adapters', 'latin');
const closedPath = process.argv[2];
const ROWS = Number(process.argv[3] ?? 1500);
const conc = JSON.parse(fs.readFileSync('C:/Users/CJWal/dev/vetus-v0/data/build/conc-la.json', 'utf8'));
const lemPos = JSON.parse(fs.readFileSync('C:/Users/CJWal/dev/vetus-v0/data/build/la-lemma-pos.json', 'utf8'));
const closed = JSON.parse(fs.readFileSync(closedPath, 'utf8'));

// ───────── Whitaker's DICTLINE.GEN ─────────
const raw = fs.readFileSync('C:/Users/CJWal/dev/romance-v0/data/dict/DICTLINE.GEN', 'utf8').split(/\r?\n/);
const GRAM = { N: 4, V: 3, ADJ: 3, ADV: 1, PREP: 1, CONJ: 0, INTERJ: 0, NUM: 4, PRON: 3, PACK: 3 };
const entries = [];
for (const line of raw) {
  if (line.length < 80) continue;
  const stems = [0, 19, 38, 57].map((i) => line.slice(i, i + 19).trim());
  const rest = line.slice(76).trim().split(/\s+/);
  const pos = rest[0];
  if (!(pos in GRAM)) continue;
  const g = rest.slice(1, 1 + GRAM[pos]);
  const tail = rest.slice(1 + GRAM[pos]);
  const [age, area, geo, freq, src] = tail;
  const meaning = tail.slice(5).join(' ');
  entries.push({ pos, s: stems, g, age, area, geo, freq, src, meaning });
}
const byS1 = new Map();
const ji = (x) => x.replace(/j/g, 'i').replace(/J/g, 'I');
for (const e of entries) { e.s = e.s.map(ji); const l = byS1.get(e.s[0]) ?? []; l.push(e); byS1.set(e.s[0], l); }
const FREQ_RANK = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, I: 6, M: 7, N: 8 };

const plain = (s) => s.normalize('NFD').replace(/[\u0304\u0306]/g, '').normalize('NFC');

function shortGloss(m) {
  const t = m.replace(/^\|/, '').replace(/\((?:N|V|ADJ) [0-9][^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
  const parts = t.split(/;\s*/).filter(Boolean);
  let out = parts[0] ?? '';
  for (let i = 1; i < parts.length && out.length < 40 && (out + '; ' + parts[i]).length <= 70; i++) out += '; ' + parts[i];
  if (out.length > 80) out = out.slice(0, 77).replace(/[\s,;(]+\S*$/, '') + '...';
  return out.replace(/;$/, '');
}

// ───────── frequency list ─────────
const freq = Object.entries(conc).map(([k, v]) => [k.replace(/#[0-9]+$/, ''), v.length / 4]).sort((a, b) => b[1] - a[1]);
const lemPosOf = (k) => lemPos[k] ?? lemPos[k + '#1'] ?? lemPos[k + '#2'];

const closedLemmas = new Set();
for (const k of ['PRONOUNS', 'NUMERALS', 'PARTICLES', 'PREPOSITIONS', 'IRREGULAR_VERBS']) for (const l of closed[k]) closedLemmas.add(l.lemma.toLowerCase());
// closed-class words the adapter writes by hand besides romance's lists (see morph-closed.ts)
const EXTRA_CLOSED = new Set((process.env.EXTRA_CLOSED ?? 'aio,inquam,memini,odi,coepi,quisque,uterque,quisquam,quicumque,qualis,talis,quantus,tantus,nos,vos,quidam,sui,ceterus').split(','));
const SKIP_VERBS = new Set(['sum', 'possum', 'eo', 'fero', 'volo', 'nolo', 'malo', 'fio', 'edo', 'offero', 'suffero', 'confero', 'effero', 'perfero', 'praefero']);
// principal parts Whitaker's file gives in a shape the matcher cannot read
const VERB_FIX = { capio: { perf: 'cepi', sup: 'captum' } };

function cands(Ls) {
  const out = [];
  for (let k = Math.min(Ls.length, 19); k >= 1; k--) {
    const c = byS1.get(Ls.slice(0, k));
    if (c) out.push([k, c]);
  }
  return out;
}
function matchNoun(L) {
  const out = [];
  const Ls = plain(L);
  for (const [k, c] of cands(Ls)) {
    for (const e of c) {
      if (e.pos !== 'N') continue;
      const [d, , gender] = e.g;
      const ending = Ls.slice(k);
      const okEnd = { 1: ['a', 'e', 'es', 'as'], 2: ['us', 'um', '', 'os', 'on'], 3: [''], 4: ['us', 'u'], 5: ['es', ''] }[d];
      const plEnd = { 1: ['ae'], 2: ['i', 'a'], 3: ['es', 'ia'], 4: ['us', 'ua'], 5: ['es'] }[d];
      const isPl = !okEnd?.includes(ending) && !!plEnd?.includes(ending) && Ls.endsWith(ending) && Ls.length > 3;
      if (!isPl && (!okEnd || !okEnd.includes(ending))) continue;
      // the ending has to fit the gender: -um / -u / plural -a are neuter; -us and -a (first declension) are not
      const isN = gender === 'N';
      if (!isPl && (['um', 'on'].includes(ending) || (d === '4' && ending === 'u')) && !isN) continue;
      if (!isPl && ['us', 'a', 'e', 'es', 'as', 'os'].includes(ending) && isN) continue;
      if (isPl && ['a', 'ia', 'ua'].includes(ending) && !isN) continue;
      if (isPl && !['a', 'ia', 'ua'].includes(ending) && isN) continue;
      if (isPl && d === '2' && ending === 'i' && gender !== 'M') continue;
      if (isPl && d === '3' && ending === 'es' && gender === 'N') continue;
      const s2 = e.s[1] || e.s[0];
      const genEnd = { 1: 'ae', 2: 'i', 3: 'is', 4: 'us', 5: 'ei' }[d];
      out.push({ e, lemma: Ls, gen: s2 + genEnd, decl: d, gender, pl: isPl });
    }
  }
  return out;
}
const byPlural = (a, b) => (a.pl ? 1 : 0) - (b.pl ? 1 : 0);
function nounRow(m, n) {
  let g = m.gender === 'C' ? 'c' : m.gender === 'N' ? 'n' : m.gender === 'F' ? 'f' : m.gender === 'M' ? 'm' : 'x';
  if (m.pl) g += 'p';
  return { lemma: m.lemma, gen: m.gen, g, gloss: shortGloss(m.e.meaning), n };
}
function matchVerb(L) {
  const out = [];
  const Ls = plain(L);
  for (const [, c] of cands(Ls)) {
    for (const e of c) {
      if (e.pos !== 'V') continue;
      const [cj, v, kind] = e.g;
      if (!['1', '2', '3'].includes(cj) && !(cj === '8' && v === '3')) continue;
      const isDep = kind === 'DEP';
      const [s1, s2, s3, s4] = e.s;
      let lemma;
      let inf;
      if (cj === '1' && v === '1') { lemma = s1 + (isDep ? 'or' : 'o'); inf = s2 + (isDep ? 'ari' : 'are'); }
      else if (cj === '2' && v === '1') { lemma = s1 + (isDep ? 'eor' : 'eo'); inf = s2 + (isDep ? 'eri' : 'ere'); }
      else if (cj === '3' && v === '1') { lemma = s1 + (isDep ? 'or' : 'o'); inf = s2 + (isDep ? 'i' : 'ere'); }
      else if (cj === '3' && v === '3') { lemma = s1 + (isDep ? 'ior' : 'io'); inf = s2 + (isDep ? 'i' : 'ere'); }
      else if (cj === '8' && v === '3') { lemma = s1 + (isDep ? 'or' : 'o'); inf = s2 + (isDep ? 'i' : 'ere'); }
      else if (cj === '3' && v === '4') { lemma = s1 + (isDep ? 'or' : 'o'); inf = s2 + (isDep ? 'iri' : 'ire'); }
      else continue;
      if (kind === 'IMPERS' && cj === '2' && Ls === s1 + 'et') { lemma = Ls; }
      if (lemma !== Ls) continue;
      const pp3 = s3 && s3 !== 'zzz' ? s3 : '';
      const pp4 = s4 && s4 !== 'zzz' ? s4 : '';
      let perf;
      let sup;
      if (isDep || kind === 'SEMIDEP') { perf = pp4 || pp3 ? (pp4 || pp3) + 'us sum' : ''; sup = ''; }
      else { perf = pp3 ? pp3 + 'i' : ''; sup = pp4 ? pp4 + 'um' : ''; }
      // the -io verbs of the third conjugation (facio, capio, patior) are coded differently in several places of the file: tell them by the lemma
      const io = cj === '3' && (v === '3' || (v === '1' && /ior?$/.test(lemma))) || (cj === '8' && v === '3');
      out.push({ e, lemma, inf, perf, sup, conj: io ? '3io' : cj === '3' && v === '4' ? '4' : cj === '8' ? '3' : cj, kind });
    }
  }
  return out;
}
function matchAdj(L) {
  const out = [];
  const Ls = plain(L);
  for (const [k, c] of cands(Ls)) {
    for (const e of c) {
      if (e.pos !== 'ADJ') continue;
      const [d, v] = e.g;
      const end = Ls.slice(k);
      const s1 = e.s[0];
      const s2 = e.s[1] || e.s[0];
      if (d === '1' && v === '1' && end === 'us') out.push({ e, type: '12', lemma: Ls, fem: s1 + 'a', neut: s1 + 'um' });
      else if (d === '1' && v === '2' && end === '') out.push({ e, type: '12r', lemma: Ls, fem: s2 + 'a', neut: s2 + 'um' });
      else if (d === '3' && v === '1' && end === '') out.push({ e, type: '3x', lemma: Ls, gen: s2 + 'is' });
      else if (d === '3' && v === '2' && end === 'is') out.push({ e, type: '3b', lemma: Ls, neut: s1 + 'e' });
      else if (d === '3' && v === '3' && end === '') out.push({ e, type: '3a', lemma: Ls, fem: s2 + 'is', neut: s2 + 'e' });
    }
  }
  return out;
}
function matchSimple(L, pos) {
  return (byS1.get(plain(L)) ?? []).filter((e) => e.pos === pos);
}
// homographs Whitaker lists with the same frequency: the sense a reader of the Vulgate means (vir "man", not the neuter vir "venom")
const PREFER_GENDER = { vir: 'M', os: 'N', fas: 'N' };
const bestOf = (list, key) => list.slice().sort((a, b) => {
  if (!!a.pl !== !!b.pl) return byPlural(a, b);
  const pa = PREFER_GENDER[a.lemma] && a.gender !== PREFER_GENDER[a.lemma] ? 1 : 0;
  const pb = PREFER_GENDER[b.lemma] && b.gender !== PREFER_GENDER[b.lemma] ? 1 : 0;
  return pa - pb || (FREQ_RANK[key(a).freq] ?? 9) - (FREQ_RANK[key(b).freq] ?? 9);
})[0];

// Biblical names the Vulgate leaves undeclined in most cases (the lemma stands for every case), and glosses for the commonest names
const INDECL_NAMES = new Set(['Israel', 'David', 'Iacob', 'Abraham', 'Isaac', 'Aaron', 'Ioseph', 'Ierusalem', 'Sion', 'Beniamin', 'Levi', 'Iuda', 'Ruben', 'Simeon', 'Gad', 'Dan', 'Nephthali', 'Aser', 'Zabulon', 'Issachar', 'Moab', 'Ammon', 'Amalec', 'Edom', 'Esau', 'Noe', 'Adam', 'Eva', 'Sem', 'Cham', 'Iaphet', 'Lot', 'Sara', 'Rebecca', 'Rachel', 'Lia', 'Bethlehem', 'Sina', 'Iordanes', 'Nazareth']);
const NAME_GLOSS = { Israel: 'Israel (Jacob, and his people)', David: 'David', Iesus: 'Jesus', Iacob: 'Jacob', Moyses: 'Moses', Pharao: 'Pharaoh', Aegyptus: 'Egypt', Iudas: 'Judas, Judah', Iuda: 'Judah', Ioseph: 'Joseph', Abraham: 'Abraham', Isaac: 'Isaac', Aaron: 'Aaron', Salomon: 'Solomon', Ierusalem: 'Jerusalem', Babylon: 'Babylon', Iohannes: 'John', Petrus: 'Peter', Paulus: 'Paul', Maria: 'Mary', Pilatus: 'Pilate', Herodes: 'Herod', Samuel: 'Samuel', Saul: 'Saul', Christus: 'Christ', Iudaea: 'Judaea', Galilaea: 'Galilee', Samaria: 'Samaria', Sion: 'Zion', Noe: 'Noah', Adam: 'Adam', Eva: 'Eve', Levi: 'Levi', Beniamin: 'Benjamin', Ruben: 'Reuben', Simon: 'Simon', Andreas: 'Andrew', Iacobus: 'James', Matthaeus: 'Matthew', Lazarus: 'Lazarus', Elias: 'Elijah', Eliseus: 'Elisha', Isaias: 'Isaiah', Ieremias: 'Jeremiah', Ezechiel: 'Ezekiel', Daniel: 'Daniel', Tobias: 'Tobias', Iob: 'Job', Esther: 'Esther', Saba: 'Sheba', Pharisaeus: 'Pharisee', Iudaeus: 'Jew', Hebraeus: 'Hebrew', Sodoma: 'Sodom', Gomorrha: 'Gomorrah', Nineve: 'Nineveh', Egyptus: 'Egypt' };

const rows = { nouns: [], verbs: [], adjs: [], advs: [], preps: [], conjs: [], intjs: [], props: [] };
const missing = [];
const seen = new Set();
let taken = 0;
const POSMAP = { Nb: 'N', Ne: 'PN', 'V-': 'V', 'A-': 'A', Df: 'D', Dq: 'D', Du: 'D', 'R-': 'R', 'C-': 'C', 'G-': 'C', 'I-': 'I', Ma: 'M', Mo: 'M', Px: 'A?', 'F-': 'F' };
for (const [L, n] of freq) {
  if (taken >= ROWS) break;
  const lc = L.toLowerCase();
  const pp = lemPosOf(L);
  const kind = POSMAP[pp] ?? (pp && pp[0] === 'P' ? 'P' : '?');
  if (closedLemmas.has(lc) || EXTRA_CLOSED.has(lc) || SKIP_VERBS.has(lc)) continue;
  if (kind === 'P' || kind === 'M') { missing.push([L, n, pp, 'closed-class pronoun/numeral not in the closed tables']); continue; }
  if (kind === 'F') continue;
  const key = lc + '|' + kind;
  if (seen.has(key)) continue;
  let done = false;
  if (kind === 'N') {
    const ms = matchNoun(L);
    if (ms.length) { rows.nouns.push(nounRow(bestOf(ms, (x) => x.e), n)); done = true; }
    else { const as = matchAdj(L); if (as.length) { const m = bestOf(as, (x) => x.e); rows.adjs.push({ lemma: m.lemma, type: m.type, fem: m.fem ?? m.gen ?? '', neut: m.neut ?? '', gloss: shortGloss(m.e.meaning), n }); done = true; } }
  } else if (kind === 'V') {
    const ms = matchVerb(L);
    if (ms.length) { const m = bestOf(ms, (x) => x.e); rows.verbs.push({ lemma: m.lemma, inf: m.inf, perf: VERB_FIX[m.lemma]?.perf ?? m.perf, sup: VERB_FIX[m.lemma]?.sup ?? m.sup, conj: m.conj, kind: m.kind, gloss: shortGloss(m.e.meaning), n }); done = true; }
  } else if (kind === 'A' || kind === 'A?') {
    const ms = matchAdj(L);
    if (ms.length) { const m = bestOf(ms, (x) => x.e); rows.adjs.push({ lemma: m.lemma, type: m.type, fem: m.fem ?? m.gen ?? '', neut: m.neut ?? '', gloss: shortGloss(m.e.meaning), n }); done = true; }
  } else if (kind === 'D' || kind === 'R' || kind === 'C' || kind === 'I') {
    const order = { D: ['ADV', 'CONJ', 'PREP', 'INTERJ'], R: ['PREP', 'ADV', 'CONJ'], C: ['CONJ', 'ADV', 'PREP'], I: ['INTERJ', 'ADV', 'CONJ'] }[kind];
    for (const pos of order) {
      const es = matchSimple(L, pos);
      if (!es.length) continue;
      const gloss = shortGloss(bestOf(es, (x) => x).meaning);
      if (pos === 'ADV') rows.advs.push({ lemma: plain(L), gloss, n });
      else if (pos === 'CONJ') rows.conjs.push({ lemma: plain(L), gloss, n });
      else if (pos === 'INTERJ') rows.intjs.push({ lemma: plain(L), gloss, n });
      else rows.preps.push({ lemma: plain(L), cases: [...new Set(es.map((e) => e.g[0]))].filter((c) => c === 'ACC' || c === 'ABL' || c === 'GEN').map((c) => c[0] + c.slice(1).toLowerCase()), gloss, n });
      done = true;
      break;
    }
  } else if (kind === 'PN') {
    // a name: Whitaker's entry when it has one (Aegyptus), else a rule-built row (Hebrew names are mostly indeclinable)
    const ms = matchNoun(L);
    const name = plain(L);
    if (INDECL_NAMES.has(name)) { rows.props.push({ lemma: name, gen: '', g: 'm', gloss: NAME_GLOSS[name] ?? '', n, src: 'r' }); done = true; }
    else if (ms.length) { const r = nounRow(bestOf(ms, (x) => x.e), n); rows.props.push({ ...r, lemma: name, gloss: NAME_GLOSS[name] ?? '', src: 'w' }); done = true; }
    else {
      // a name the word list does not hold: the declension its ending suggests (rule-built, said so in the notes)
      const g = /us$/.test(name) ? name.replace(/us$/, 'i') : /a$/.test(name) ? name + 'e' : /as$/.test(name) ? name.replace(/as$/, 'ae') : /o$/.test(name) ? name + 'nis' : /es$/.test(name) ? name.replace(/es$/, 'is') : /[nlrx]$/.test(name) ? name + 'is' : '';
      rows.props.push({ lemma: name, gen: g, g: /a$/.test(name) ? 'f' : 'm', gloss: NAME_GLOSS[name] ?? '', n, src: 'r' });
      done = true;
    }
  }
  if (done) { seen.add(key); taken++; }
  else missing.push([L, n, pp, 'no Whitaker entry matched']);
}

// ───────── report ─────────
const tot = freq.reduce((a, [, n]) => a + n, 0);
const have = Object.values(rows).flat().reduce((a, r) => a + r.n, 0);
console.error(`rows: ${Object.entries(rows).map(([k, v]) => k + '=' + v.length).join(' ')}; taken ${taken}`);
console.error(`Vulgate tokens covered by the open-class rows: ${((have / tot) * 100).toFixed(2)} % of ${tot}; missing among scanned: ${missing.length}`);
console.error('missing top: ' + missing.slice(0, 100).map(([l, n, p]) => `${l}(${n},${p})`).join(' '));
if (process.env.SCRATCH) fs.writeFileSync(path.join(process.env.SCRATCH, 'missing.json'), JSON.stringify(missing));

// ───────── write lexicon-data.ts ─────────
const q = (s) => JSON.stringify(s);
const L = [];
L.push('/**');
L.push(' * GENERATED by scripts/latin-build-lexicon.mjs — do not edit by hand (docs/latin/ADAPTER.md says how it is made).');
L.push(' * The open-class seed lexicon of the Latin adapter: the most frequent lemmas of the Clementine Vulgate, ranked by');
L.push(" * occurrence counts, with their declension / conjugation class and principal parts from William Whitaker's Words");
L.push(' * (DICTLINE.GEN, public domain / free for any use) and a short English gloss from the same file. Spelling is plain');
L.push(" * (no macrons, i for j); the last number of a row is the lemma's count in the Vulgate (the ranking only).");
L.push(' */');
L.push("import type { AdjRow, ConjRow, NounRow, PrepRow, ProperRow, VerbRow } from './types';");
L.push('');
L.push('/** [lemma, genitive singular, gender (m f n c = common, x = unknown), gloss, Vulgate count] */');
L.push('export const NOUN_ROWS: NounRow[] = [');
for (const r of rows.nouns) L.push(`  [${q(r.lemma)}, ${q(r.gen)}, ${q(r.g)}, ${q(r.gloss)}, ${r.n}],`);
L.push('];');
L.push('');
L.push('/** Names: [name, genitive singular or "" when the name is indeclinable / unknown, gender, gloss, count, origin: w = Whitaker, r = built by rule] */');
L.push('export const PROPER_ROWS: ProperRow[] = [');
for (const r of rows.props) L.push(`  [${q(r.lemma)}, ${q(r.gen)}, ${q(r.g)}, ${q(r.gloss)}, ${r.n}, ${q(r.src)}],`);
L.push('];');
L.push('');
L.push('/** [lemma, present infinitive, perfect (1st sg., or "ppp-stem us sum" for a deponent), supine, conjugation (1 2 3 3io 4), kind (TRANS INTRANS DEP SEMIDEP IMPERS X), gloss, count] */');
L.push('export const VERB_ROWS: VerbRow[] = [');
for (const r of rows.verbs) L.push(`  [${q(r.lemma)}, ${q(r.inf)}, ${q(r.perf)}, ${q(r.sup)}, ${q(r.conj)}, ${q(r.kind)}, ${q(r.gloss)}, ${r.n}],`);
L.push('];');
L.push('');
L.push('/** [lemma (masculine nominative), type (12 bonus -a -um, 12r pulcher -ra -rum, 3a acer -is -e, 3b fortis -e, 3x felix -icis), feminine form / genitive, neuter form, gloss, count] */');
L.push('export const ADJ_ROWS: AdjRow[] = [');
for (const r of rows.adjs) L.push(`  [${q(r.lemma)}, ${q(r.type)}, ${q(r.fem)}, ${q(r.neut)}, ${q(r.gloss)}, ${r.n}],`);
L.push('];');
L.push('');
L.push('/** [adverb, gloss, count] */');
L.push('export const ADV_ROWS: ConjRow[] = [');
for (const r of rows.advs) L.push(`  [${q(r.lemma)}, ${q(r.gloss)}, ${r.n}],`);
L.push('];');
L.push('');
L.push('/** [preposition, cases it governs (Acc Abl Gen), gloss, count] */');
L.push('export const PREP_ROWS: PrepRow[] = [');
for (const r of rows.preps) L.push(`  [${q(r.lemma)}, ${q(r.cases)}, ${q(r.gloss)}, ${r.n}],`);
L.push('];');
L.push('');
L.push('/** [conjunction, gloss, count] */');
L.push('export const CONJ_ROWS: ConjRow[] = [');
for (const r of rows.conjs) L.push(`  [${q(r.lemma)}, ${q(r.gloss)}, ${r.n}],`);
L.push('];');
L.push('');
L.push('/** [interjection, gloss, count] */');
L.push('export const INTJ_ROWS: ConjRow[] = [');
for (const r of rows.intjs) L.push(`  [${q(r.lemma)}, ${q(r.gloss)}, ${r.n}],`);
L.push('];');
L.push('');
fs.writeFileSync(path.join(OUT, 'lexicon-data.ts'), L.join('\n'));
console.error('wrote lexicon-data.ts');
