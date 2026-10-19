#!/usr/bin/env node
/**
 * Builds src/adapters/latin/lexicon-ls-data.ts: headwords of Lewis & Short, A Latin Dictionary (1879), that Whitaker's Words does not hold,
 * as lexicon rows in the same line formats as lexicon-full-data.ts (scripts/latin-build-full.mjs). It is a backstop for lemma and part of
 * speech (proper names such as Catilina and Troia, rarer classical words) and the source of a short English gloss for those lemmas.
 *
 * Source: the Perseus TEI edition (lat.ls.perseus-eng2.xml, 51,645 entries) held by vetus-v0 (C:/Users/CJWal/dev/vetus-v0/data/lewis-short),
 * licence CC BY-SA 4.0 (Perseus Digital Library; the text is the 1879 dictionary, public domain). Read only.
 *
 * What is read from an entry: the headword (`key`), the inflection hint (`itype`: "ae", "a, um", "is, e", "ŏris", "āre", "fēci, factum, 3"), the
 * gender (`gen`), the part of speech (`pos`) and the first italic translation(s) of the first sense. A noun's genitive or a verb's perfect that the
 * entry gives only as an ending is worked out only where the ending fixes it; otherwise the row carries what is certain (a verb: the present
 * system). Nothing is invented: a row whose class cannot be told is left out.
 *
 * Usage: node scripts/latin-build-ls.mjs   (needs src/adapters/latin/lexicon-full-data.ts first, to leave out what Whitaker already holds)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'src', 'adapters', 'latin', 'lexicon-ls-data.ts');
const FULL = path.join(here, '..', 'src', 'adapters', 'latin', 'lexicon-full-data.ts');
const SRC = 'C:/Users/CJWal/dev/vetus-v0/data/lewis-short/lat.ls.perseus-eng2.xml';

const strip = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
const fold = (s) => strip(s).toLowerCase().replace(/j/g, 'i').replace(/v/g, 'u').replace(/æ/g, 'ae').replace(/œ/g, 'oe');
const untag = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

// what Whitaker already holds: kind letter + folded lemma
const held = new Set();
{
  const t = fs.readFileSync(FULL, 'utf8');
  const body = JSON.parse(t.slice(t.indexOf('"'), t.lastIndexOf('"') + 1));
  for (const line of body.split('\n')) {
    const f = line.split('\t');
    if (f[0] && f[1]) held.add(f[0] + '|' + fold(f[1]));
  }
}

const xml = fs.readFileSync(SRC, 'utf8');
const rows = [];
const skipped = {};
const skip = (why) => { skipped[why] = (skipped[why] ?? 0) + 1; };
const seen = new Set();

/** The genitive of a third-declension noun whose entry gives only the ending ("ūlis" for consul, "ōris" for habitator, "ōnis" for natio, "ātis" for velocitas): the last vowel and consonant of the nominative give way to it, or only its last vowel. */
function thirdGenitive(l, e) {
  if (/[aeiou]$/.test(l)) return l.slice(0, -1) + e;
  if (/[aeiou][bcdfghklmnpqrstvxz]$/.test(l)) return l.slice(0, -2) + e;
  return '';
}

function gloss(body) {
  const sense = /<sense[^>]*>([\s\S]*?)(?=<sense|<\/entryFree>)/.exec(body);
  if (!sense) return '';
  const parts = [];
  for (const m of sense[1].matchAll(/<hi rend="ital">([\s\S]*?)<\/hi>/g)) {
    const t = untag(m[1]).replace(/[.,;:]+$/, '');
    if (!t || /^(v|a|n|adj|adv|subst|prep|conj|masc|fem|neut|part|gen|dat|acc|abl|nom|plur|sing|trans|intrans|dep|absol|comp|sup|dim|imper|inf|orig|lit|trop|transf|esp|prop|fig|poet|post-class|ante-class)\.?$/i.test(t)) continue;
    if (t.length > 52) continue;
    parts.push(t);
    if (parts.join('; ').length >= 24 || parts.length >= 3) break;
  }
  let g = parts.join('; ');
  if (g.length > 60) g = g.slice(0, 57).replace(/[\s,;(]+\S*$/, '') + '...';
  return g.replace(/\t/g, ' ');
}

for (const m of xml.matchAll(/<entryFree key="([^"]+)" type="main"[^>]*>([\s\S]*?)<\/entryFree>/g)) {
  const key = m[1].replace(/[0-9]+$/, '');
  if (!/^[A-Za-z]+$/.test(key) || key.length < 2) { skip('key'); continue; }
  const body = m[2];
  const cut = body.search(/<sense/);
  const header = cut >= 0 ? body.slice(0, cut) : body;
  const itypes = [...header.matchAll(/<itype>([\s\S]*?)<\/itype>/g)].map((x) => strip(untag(x[1])).toLowerCase());
  const gen = /<gen>([\s\S]*?)<\/gen>/.exec(header)?.[1]?.trim().toLowerCase() ?? '';
  const posRaw = (/<pos>([\s\S]*?)<\/pos>/.exec(header)?.[1] ?? '').trim().toLowerCase();
  const lemma = key;
  const proper = /^[A-Z]/.test(lemma);
  const lcl = strip(lemma);
  const g = gloss(body);
  const add = (kind, line) => {
    if (held.has(kind + '|' + fold(lemma))) { skip('held by Whitaker'); return; }
    const id = kind + '|' + fold(lemma) + '|' + line.split('\t')[2];
    if (seen.has(id)) return;
    seen.add(id);
    rows.push(line);
  };
  const it0 = itypes[0] ?? '';
  const sameStart = (a) => a.length >= 3 && a.slice(0, 2) === lcl.slice(0, 2).toLowerCase();

  if (/^v\./.test(posRaw) || itypes.some((x) => /(^|, )[1-4]$/.test(x)) && /v\./.test(posRaw + ' v.')) {
    const dep = /dep/.test(posRaw);
    if (/^(adj|adv|prep|conj|interj|pron|num)/.test(posRaw)) { skip('not a verb'); continue; }
    const conjS = itypes.map((x) => /(?:^|, )([1-4])$/.exec(x)?.[1]).find(Boolean) ?? (/are$|ari$/.test(it0) ? '1' : /ere$|eri$/.test(it0) && /eo$|eor$/.test(lcl) ? '2' : /ire$|iri$/.test(it0) ? '4' : '');
    if (!conjS) { skip('verb without a conjugation'); continue; }
    let inf;
    let base;
    if (dep) base = lcl.replace(/or$/, ''); else base = lcl.replace(/o$/, '');
    if (!dep && !/o$/.test(lcl)) { skip('verb lemma not in -o'); continue; }
    if (dep && !/or$/.test(lcl)) { skip('deponent lemma not in -or'); continue; }
    const io = conjS === '3' && /io$|ior$/.test(lcl);
    if (conjS === '1') { inf = base + (dep ? 'ari' : 'are'); }
    else if (conjS === '2') { base = base.replace(/e$/, ''); inf = base + (dep ? 'eri' : 'ere'); }
    else if (conjS === '3') { if (io) base = base.replace(/i$/, ''); inf = base + (dep ? 'i' : 'ere'); }
    else { base = base.replace(/i$/, ''); inf = base + (dep ? 'iri' : 'ire'); }
    // principal parts only where the entry gives them whole (fecit, factum) or the conjugation fixes them (1: -avi -atum, 4: -ivi -itum)
    const parts = (itypes.find((x) => x.includes(',')) ?? '').split(',').map((x) => x.trim()).filter((x) => x && !/^[1-4]$/.test(x));
    let perf = '';
    let sup = '';
    if (dep) {
      const pp = parts.find((x) => /us$/.test(x)) ?? (it0 && /us$/.test(it0) ? it0 : '');
      if (pp) perf = pp.replace(/\s.*/, '') + ' sum';
    } else if (parts.length >= 1 && sameStart(parts[0])) { perf = parts[0]; sup = parts[1] && sameStart(parts[1]) ? parts[1] : ''; }
    else if (conjS === '1') { perf = base + 'avi'; sup = base + 'atum'; }
    else if (conjS === '4') { perf = base + 'ivi'; sup = base + 'itum'; }
    add('V', ['V', lemma, inf, perf, sup, io ? '3io' : conjS, dep ? 'DEP' : 'X', 'E', g].join('\t'));
    continue;
  }
  if (/^adv/.test(posRaw)) { add('D', ['D', lemma, 'E', g, '', ''].join('\t')); continue; }
  if (/^prep/.test(posRaw)) { add('R', ['R', lemma, /abl/.test(header) && !/acc/.test(header) ? 'Abl' : 'Acc', 'E', g].join('\t')); continue; }
  if (/^conj/.test(posRaw)) { add('C', ['C', lemma, 'E', g].join('\t')); continue; }
  if (/^interj/.test(posRaw)) { add('I', ['I', lemma, 'E', g].join('\t')); continue; }
  if (/^(pron|num)/.test(posRaw)) { skip('pronoun or numeral'); continue; }

  // adjectives
  const adjEnd = it0.replace(/\s+/g, '');
  if (/^adj/.test(posRaw) || /^(a,um|ra,rum|era,erum|ra,rum)$/.test(adjEnd) || /^(is,e|e)$/.test(adjEnd)) {
    const l = lcl.toLowerCase();
    if (/^(a,?um)$/.test(adjEnd) && /us$/.test(l)) { const s = l.replace(/us$/, ''); add('A', ['A', l, '12', s + 'a', s + 'um', 'E', g, '', ''].join('\t')); continue; }
    if (/^(a,?um)$/.test(adjEnd) && /er$/.test(l)) { add('A', ['A', l, '12r', l + 'a', l + 'um', 'E', g, '', ''].join('\t')); continue; }
    if (/^(ra,?rum)$/.test(adjEnd) && /er$/.test(l)) { const s = l.replace(/er$/, 'r'); add('A', ['A', l, '12r', s + 'a', s + 'um', 'E', g, '', ''].join('\t')); continue; }
    if (/^(era,?erum)$/.test(adjEnd) && /er$/.test(l)) { add('A', ['A', l, '12r', l + 'a', l + 'um', 'E', g, '', ''].join('\t')); continue; }
    if (/^(is,?e)$/.test(adjEnd) && /is$/.test(l)) { const s = l.replace(/is$/, ''); add('A', ['A', l, '3b', '', s + 'e', 'E', g, '', ''].join('\t')); continue; }
    if (/^adj/.test(posRaw) && /^[aeiou][a-z]*is$/.test(adjEnd) && adjEnd.length >= 3) { const gn = thirdGenitive(l, adjEnd); if (gn) { add('A', ['A', l, '3x', gn, '', 'E', g, '', ''].join('\t')); continue; } }
    if (/^is$/.test(adjEnd) && /(er|is)$/.test(l) === false) { skip('adjective 3rd'); continue; }
    if (/^adj/.test(posRaw) && !adjEnd) { skip('adjective without ending'); continue; }
  }

  // nouns
  if ((gen || (proper && /^(ae|i)$/.test(it0.replace(/\s+/g, '')))) && it0) {
    const G = gen ? (gen.startsWith('comm') ? 'c' : gen[0]) : /^ae$/.test(it0.replace(/\s+/g, '')) ? 'f' : 'm';
    if (!/^[mfnc]/.test(G)) { skip('gender'); continue; }
    const e = it0.replace(/\s+/g, '');
    let genitive = '';
    if (e === 'ae' && /(a|e|es|as)$/.test(lcl)) genitive = lcl.replace(/(a|e|es|as)$/, '') + 'ae';
    else if (e === 'i' && /(us|um|er|ir|os|on)$/.test(lcl)) genitive = lcl.replace(/(us|um|os|on)$/, '') + 'i';
    else if (e === 'ri' && /er$/.test(lcl)) genitive = lcl.replace(/er$/, 'r') + 'i';
    else if (e === 'us' && /(us|u)$/.test(lcl)) genitive = lcl.replace(/(us|u)$/, '') + 'us';
    else if (e === 'ei' && /es$/.test(lcl)) genitive = lcl.replace(/es$/, '') + 'ei';
    else if (e === 'is' && /(is|es|s|x)$/.test(lcl)) genitive = lcl.replace(/(s|x)$/, '') + (/(is|es)$/.test(lcl) ? 'is' : 'is');
    else if (e === 'ii' && /(ium|ius)$/.test(lcl)) genitive = lcl.replace(/(um|us)$/, '') + 'i';
    else if (/is$/.test(e) && sameStart(e)) genitive = e;
    else if (/^[aeiou][a-z]*is$/.test(e) && e.length >= 3) genitive = thirdGenitive(lcl, e);
    if (!genitive) { skip('noun genitive unclear'); continue; }
    if (!/^[A-Z]/.test(lemma) && /^(.*)$/.test(genitive) && genitive === lcl) { skip('noun genitive equals nominative'); continue; }
    add('N', ['N', lemma, genitive, G, 'E', g].join('\t'));
    continue;
  }
  skip('unclassified');
  void proper;
}

const body = rows.join('\n');
const L = [];
L.push('/**');
L.push(' * GENERATED by scripts/latin-build-ls.mjs — do not edit by hand (docs/latin/ADAPTER.md says how it is made).');
L.push(' * Headwords of Lewis & Short, A Latin Dictionary (1879; Perseus Digital Library TEI edition, CC BY-SA 4.0) that Whitaker\'s Words does not hold: proper names and');
L.push(' * rarer classical words, with their class where the entry fixes it and a short English gloss from the entry. Same line formats as lexicon-full-data.ts. Loaded lazily with it.');
L.push(' */');
L.push('export const LS_LEXICON = ' + JSON.stringify(body) + ';');
L.push('');
fs.writeFileSync(OUT, L.join('\n'));
const byKind = {};
for (const r of rows) byKind[r[0]] = (byKind[r[0]] ?? 0) + 1;
console.error(`rows ${rows.length} ${JSON.stringify(byKind)}; ${(body.length / 1024).toFixed(0)} KB; skipped ${JSON.stringify(skipped)}`);
