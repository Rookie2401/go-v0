// Mechanical consistency checks of the source annotation as the seed carries it (what the card shows at 0.98 in its verse).
import { ARAMAIC_SEED } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/aramaic/seed';
import { ARAMAIC_QUESTIONED_SOURCE_IDS, ARAMAIC_HEBREW_LEXEME_IDS } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/arc';
import { decodeOshb } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hebrew/oshb';
import { heNormalize, consonantal, splitByLetters } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hebrew/text';
const flagged = (id: string) => (ARAMAIC_QUESTIONED_SOURCE_IDS.has(id) || ARAMAIC_HEBREW_LEXEME_IDS.has(id) ? ' [FLAGGED]' : '');
const sec = (t: string) => console.log(`\n##### ${t}`);
const show = (r: any, why = '') => console.log(`${r.reference}\t${r.surface}\t${r.morph}\t${r.lemmaId}\t${r.lemma}\t${r.seg}\t${why}${flagged(r.sourceWordId)}`);
sec('0 flagged occurrences');
for (const r of ARAMAIC_SEED) if (flagged(r.sourceWordId)) show(r);
sec('1 code segments vs lemma-chain prefixes vs letter segmentation');
let n1 = 0;
for (const r of ARAMAIC_SEED) {
  const segs = r.morph.slice(1).split('/'); const chain = r.lemmaId.split('/'); const cuts = r.seg.split('/');
  const d = decodeOshb(r.lemmaId, r.morph);
  const nPre = chain.length - 1;
  const codePre = segs.findIndex((s) => !/^(C|R|Rd|Td|Ti|To|Tn|D)$/.test(s) || false);
  const bad: string[] = [];
  if (cuts.length !== segs.length) bad.push(`pieces ${cuts.length} ≠ code segments ${segs.length}`);
  if (d.mainIndex !== nPre) bad.push(`main index ${d.mainIndex} ≠ prefixes ${nPre}`);
  if (segs.length - 1 - nPre > 1) bad.push(`more than one segment after the main word`);
  if (!splitByLetters(r.surface, cuts.map(Number))) bad.push('letter counts do not fit the surface');
  if (bad.length) { n1++; show(r, bad.join('; ')); }
}
console.log('count', n1);
sec('2 state letter d without a Td segment, and Td without state d');
let n2 = 0;
for (const r of ARAMAIC_SEED) {
  const segs = r.morph.slice(1).split('/'); const d = decodeOshb(r.lemmaId, r.morph); const main = segs[d.mainIndex] ?? '';
  const st = /^[NA]/.test(main) ? main[4] : /^V.[rs]/.test(main) ? main[5] : '';
  const hasTd = segs.slice(d.mainIndex + 1).includes('Td');
  if ((st === 'd') !== hasTd) { n2++; show(r, st === 'd' ? 'state d, no Td piece' : 'Td piece, state not d'); }
}
console.log('count', n2);
sec('3 nominal ending against the tagged gender/number/state (nouns, adjectives, numerals, participles without suffix)');
let n3 = 0;
for (const r of ARAMAIC_SEED) {
  const segs = r.morph.slice(1).split('/'); const d = decodeOshb(r.lemmaId, r.morph); const main = segs[d.mainIndex] ?? '';
  let g = '', n = '', st = '';
  if (/^[NA]/.test(main)) { g = main[2]; n = main[3]; st = main[4]; if (main[1] === 'p') continue; }
  else if (/^V.[rs]/.test(main)) { g = main[3]; n = main[4]; st = main[5]; } else continue;
  if (d.suffix) continue;
  const w = heNormalize(r.surface); const c = consonantal(w);
  const endsYa = /ַיָּא$|ָיֵא$|ַיָּה$|ָאֵי$|ֵא$/.test(w); const endsIn = /ִין$|ַיִן$|ָן$|ֵין$/.test(w); const endsA = /ָא$|ָה$/.test(w); const endsTa = /תָא$|תָה$|ְתָּא$/.test(w); const endsE = /ֵי$/.test(w); const endsAt = /ַת$|ָת$/.test(w);
  const why: string[] = [];
  if (n === 'p' && st === 'a' && !(endsIn || /וֹ$|ָן$|ִים$/.test(w))) why.push('plural absolute without -in/-an');
  if (n === 'p' && st === 'd' && !(endsYa || endsTa || /ַיָּא$|ָתָא$/.test(w))) why.push('plural determined without -ayya/-ata');
  if (n === 'p' && st === 'c' && !(endsE || endsAt || /ָת$/.test(w))) why.push('plural construct without -e/-at');
  if (n === 's' && st === 'd' && !endsA) why.push('singular determined without -a');
  if (n === 's' && st === 'a' && g === 'm' && endsA && c.length > 2) why.push('masc. sing. absolute ending in -a');
  if (n === 's' && (endsIn && /ִין$/.test(w)) && c.length > 3) why.push('singular ending in -in');
  if (n === 's' && /ַיָּא$/.test(w)) why.push('singular ending in -ayya');
  if (why.length) { n3++; show(r, why.join('; ')); }
}
console.log('count', n3);
sec('4 verb shape against the tagged stem and conjugation');
let n4 = 0;
for (const r of ARAMAIC_SEED) {
  const segs = r.morph.slice(1).split('/'); const d = decodeOshb(r.lemmaId, r.morph); const main = segs[d.mainIndex] ?? '';
  if (main[0] !== 'V') continue;
  const cuts = r.seg.split('/').map(Number); const pieces = splitByLetters(r.surface, cuts); if (!pieces) continue;
  const stemPiece = consonantal(pieces[d.mainIndex] ?? ''); const w = heNormalize(pieces[d.mainIndex] ?? '');
  const stem = main[1]; const conj = main[2]; const why: string[] = [];
  const f = stemPiece[0]; const s2 = stemPiece[1];
  if (conj === 'i' && !/[יתאנל]/.test(f)) why.push('imperfect without a prefix letter');
  if (conj === 'i' && f === 'ל' && r.lemma !== 'הָוָא') why.push('l-prefix imperfect on another verb');
  if (conj === 'r' && stem !== 'q' && f !== 'מ') why.push('derived-stem participle without m-');
  if (conj === 's' && stem !== 'q' && stem !== 'Q' && f !== 'מ') why.push('derived-stem passive participle without m-');
  if (conj === 'c' && stem === 'q' && f !== 'מ') why.push('peal infinitive without m-');
  if (conj === 'p' || conj === 'v' || conj === 'c') {
    if (stem === 'h' && f !== 'ה') why.push('hafel without h-');
    if (stem === 'a' && f !== 'א') why.push('afel without aleph');
    if ((stem === 'u' || stem === 'M') && !(f === 'ה' && (s2 === 'ת' || s2 === 'ז' || s2 === 'ש' || s2 === 'צ'))) why.push('hit- stem without hit-');
    if ((stem === 'i' || stem === 'P') && !(f === 'א')) why.push('it- stem without it-');
    if (stem === 'H' && f !== 'ה') why.push('hofal without h-');
    if (stem === 'q' && conj === 'p' && /^[הא]ת/.test(stemPiece) && stemPiece.length > 4) why.push('peal perfect that looks like a t-stem');
  }
  if (conj === 'i' || conj === 'r' || conj === 's') {
    if (stem === 'h' && s2 !== 'ה') why.push('hafel imperfect/participle without -h-');
    if (stem === 'a' && s2 === 'ה') why.push('afel imperfect/participle with -h-');
    if ((stem === 'u' || stem === 'M' || stem === 'i' || stem === 'P') && !(s2 === 'ת' || s2 === 'ז' || s2 === 'ש' || s2 === 'צ' || s2 === 'ס')) why.push('t-stem imperfect/participle without -t-');
    if (stem === 'q' && s2 === 'ת' && stemPiece.length >= 5 && conj !== 's') why.push('peal that looks like a t-stem');
  }
  // person/number endings of the perfect
  if (conj === 'p' && !d.suffix) {
    const pgn = main.slice(3);
    if (pgn === '3mp' && !/וּ$|וֹ$/.test(w)) why.push('perfect 3mp without -u');
    if (pgn === '3ms' && /וּ$/.test(w)) why.push('perfect 3ms ending in -u');
    if (pgn === '1cs' && !/ת$|תֿ$/.test(stemPiece)) why.push('perfect 1cs without -t');
    if (pgn === '2ms' && !/ת$|תא$|תה$/.test(stemPiece)) why.push('perfect 2ms without -t');
    if (pgn === '3fs' && !/ת$/.test(stemPiece)) why.push('perfect 3fs without -t');
    if (pgn === '1cp' && !/נא$/.test(stemPiece)) why.push('perfect 1cp without -na');
    if (pgn === '2mp' && !/תון$/.test(stemPiece)) why.push('perfect 2mp without -tun');
  }
  if (conj === 'i' && !d.suffix) {
    const pgn = main.slice(3);
    if (/^3m[sp]|^3f[p]/.test(pgn) && !/[יל]/.test(f)) why.push('imperfect 3m/3fp without y-/l-');
    if (/^2|^3fs/.test(pgn) && f !== 'ת') why.push('imperfect 2 / 3fs without t-');
    if (pgn === '1cs' && f !== 'א') why.push('imperfect 1cs without aleph');
    if (pgn === '1cp' && f !== 'נ') why.push('imperfect 1cp without n-');
    if (/[23]mp/.test(pgn) && !/ון$|ו$/.test(stemPiece)) why.push('imperfect mp without -un/-u');
    if (/3fp/.test(pgn) && !/ן$/.test(stemPiece)) why.push('imperfect 3fp without -an');
  }
  if (why.length) { n4++; show(r, why.join('; ')); }
}
console.log('count', n4);
sec('5 pronominal suffix shape against the tagged person');
let n5 = 0;
for (const r of ARAMAIC_SEED) {
  const segs = r.morph.slice(1).split('/'); const last = segs[segs.length - 1];
  if (!/^Sp/.test(last)) continue;
  const cuts = r.seg.split('/').map(Number); const pieces = splitByLetters(r.surface, cuts); if (!pieces) continue;
  const sfx = consonantal(pieces[pieces.length - 1]); const pgn = last.slice(2);
  const ok: Record<string, RegExp> = { '1cs': /^(י|ני)$/, '2ms': /^ך$/, '3ms': /^(ה|הי|יה|והי)$/, '3fs': /^(ה|הא|יה)$/, '1cp': /^(נא|נה)$/, '2mp': /^(כון|כם|כן)$/, '3mp': /^(הון|הם|הן|ון)$/, '3fp': /^(הין|הן|ן)$/ };
  if (ok[pgn] && !ok[pgn].test(sfx)) { n5++; show(r, `suffix piece "${sfx}" tagged ${pgn}`); }
  else if (!ok[pgn]) { n5++; show(r, `unusual suffix tag ${pgn} on "${sfx}"`); }
}
console.log('count', n5);
