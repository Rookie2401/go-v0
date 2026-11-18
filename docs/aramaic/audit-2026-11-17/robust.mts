// What the card's first reading is when the sentence is NOT exactly the bundled verse. Uses the adapter's analyze() and the card's own
// pick rule (highest confidence, ties keep the adapter's order). The truth for each word is the source row of that word (lemma chain + code).
//  A  the word alone (no sentence)
//  B  the verse cut at its atnah: each half as the sentence
//  C  the whole verse with all marks removed (unpointed)
//  D  the verse as the owner's Biblia app prints it (MAM, a second edition), verse = sentence; truth = Biblia's own OSHB column
import fs from 'node:fs';
import { arcAdapter } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/arc';
import { ARAMAIC_SEED } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/aramaic/seed';
import { ARAMAIC_PASSAGES } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/aramaic/resources';
import { heNormalize, consonantal } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hebrew/text';
const DIR = 'C:/Users/CJWal/dev/go-v0-rc/data/corpus/arc/';
const BIBLIA = 'C:/Users/CJWal/dev/biblia-v0/public/data/he/';
const OUT = 'C:/Users/CJWal/dev/tmp-mem/arcaudit/';
const refOf = (title: string) => title.replace('Daniel', 'Dan').replace('Jeremiah', 'Jer').replace('Genesis', 'Gen');
const seedByRef = new Map<string, typeof ARAMAIC_SEED[number][]>();
for (const r of ARAMAIC_SEED) { const a = seedByRef.get(r.reference) ?? []; a.push(r); seedByRef.set(r.reference, a); }
const pick = (cands: any[]) => (cands.length ? cands.reduce((m, c) => (c.confidence > m.confidence ? c : m), cands[0]) : undefined);
const first = (text: string) => { const toks = arcAdapter.tokenize(text); const an = arcAdapter.analyze(toks); return toks.map((t, i) => ({ t, c: pick(an[i].candidates), n: an[i].candidates.length })).filter((x) => x.t.isWord); };
const key = (lemmaId: string, code: string) => `${lemmaId.split('/').pop()}|${code}`;
const candKey = (c: any) => (c ? `${c.notes.lemmaId}|${c.notes.code}` : '∅');
// a candidate merges several codes with the same decoded features; accept any of its sourceCodes
const matches = (c: any, lemmaId: string, code: string) => !!c && c.notes.lemmaId === lemmaId.split('/').pop() && (c.notes.sourceCodes as string[]).includes(code);
type Tot = { n: number; blank: number; same: number; diff: number; diffLemma: number; list: string[] };
const T = (): Tot => ({ n: 0, blank: 0, same: 0, diff: 0, diffLemma: 0, list: [] });
const A = T(), B = T(), C = T(), D = T();
const score = (tot: Tot, c: any, row: { lemmaId: string; morph: string; surface: string; reference: string; lemma?: string }, extra = '') => {
  tot.n++;
  if (!c) { tot.blank++; tot.list.push(`${row.reference}\t${row.surface}\tBLANK\t(source ${row.morph} ${row.lemmaId})${extra}`); return; }
  if (matches(c, row.lemmaId, row.morph)) { tot.same++; return; }
  tot.diff++; if (c.notes.lemmaId !== row.lemmaId.split('/').pop()) tot.diffLemma++;
  tot.list.push(`${row.reference}\t${row.surface}\tcard: ${c.lemma} ${c.notes.code} @${c.confidence}\tsource: ${row.morph} ${row.lemmaId}${extra}`);
};
const bibCache: Record<string, any> = {};
let dVerses = 0, dAligned = 0; const dTextDiff: string[] = [];
for (const p of ARAMAIC_PASSAGES) {
  const doc = JSON.parse(fs.readFileSync(DIR + p.slug + '.json', 'utf8'));
  const text: string = doc.sections.flatMap((s: any) => s.paragraphs.flatMap((q: any) => q.sentences.map((x: any) => x.text))).join(' ');
  const ref = refOf(p.title); const seed = seedByRef.get(ref)!;
  // A alone
  const words = arcAdapter.tokenize(text).filter((t) => t.isWord);
  words.forEach((w, k) => { const an = arcAdapter.analyze(arcAdapter.tokenize(w.surface)); score(A, pick(an.find((x) => x.token.isWord)?.candidates ?? []), seed[k]); });
  // B halves at atnah
  const at = text.indexOf('\u0591');
  if (at > 0) {
    let cut = text.indexOf(' ', at); const mq = text.indexOf('־', at); if (mq > 0 && (cut < 0 || mq < cut)) cut = -1; // atnah word joined by maqaf: skip
    if (cut > 0) { let k = 0; for (const half of [text.slice(0, cut), text.slice(cut + 1)]) for (const x of first(half)) score(B, x.c, seed[k++]); }
  }
  // C unpointed
  const bare = text.split(' ').map((w) => consonantal(w.replace(/־/g, ' ')).trim()).join(' ').replace(/\s+/g, ' ');
  const bw = first(bare);
  if (bw.length === seed.length) bw.forEach((x, k) => score(C, x.c, seed[k]));
  else C.list.push(`${ref}\tword count differs unpointed ${bw.length} vs ${seed.length}`);
  // D MAM edition
  const m = /^(\w+) (\d+):(\d+)/.exec(ref)!; const book = m[1];
  const bd = (bibCache[book] ??= JSON.parse(fs.readFileSync(`${BIBLIA}${book}.json`, 'utf8')));
  const bv = bd.chapters[Number(m[2]) - 1].verses[Number(m[3]) - 1];
  const fw = first(bv.t);
  dVerses++;
  if (fw.length !== bv.w.length) { D.list.push(`${ref}\tMAM tokens ${fw.length} vs Biblia annotations ${bv.w.length}: not scored`); continue; }
  const aligned = fw.every((x) => !x.c || x.c.confidence === 0.98 || true) && fw.filter((x) => x.c).some((x) => x.c.confidence === 0.98);
  if (aligned) dAligned++;
  const wlcNorm = words.map((w) => heNormalize(w.surface)); const mamAram = fw.filter((_, k) => bv.w[k] && bv.w[k][1][0] === 'A').map((x) => heNormalize(x.t.surface));
  if (wlcNorm.join(' ') !== mamAram.join(' ')) dTextDiff.push(`${ref}\tWLC: ${wlcNorm.filter((w, i) => w !== mamAram[i]).join(' ')}\tMAM: ${mamAram.filter((w, i) => w !== wlcNorm[i]).join(' ')}`);
  fw.forEach((x, k) => { if (!bv.w[k]) { D.list.push(ref + '	' + x.t.surface + '	no annotation in Biblia: not scored'); return; } const [lemmaId, code] = bv.w[k]; if (code[0] !== 'A') { D.n++; if (!x.c) D.blank++; else { D.diff++; D.list.push(`${ref}\t${x.t.surface}\tHEBREW word read as Aramaic: ${x.c.lemma} ${x.c.notes.code} @${x.c.confidence}\tsource: ${code} ${lemmaId}`); } return; }
    score(D, x.c, { lemmaId, morph: code, surface: x.t.surface, reference: ref }, x.c && x.c.confidence !== 0.98 ? '' : ''); });
}
const rep = (name: string, t: Tot) => { console.log(`${name}: words ${t.n}; blank ${t.blank}; first reading = source ${t.same}; first reading ≠ source ${t.diff} (other lexeme ${t.diffLemma})`); fs.writeFileSync(`${OUT}robust-${name[0]}.tsv`, t.list.join('\n') + '\n', 'utf8'); };
rep('A alone', A); rep('B half-verse', B); rep('C unpointed', C); rep('D MAM edition', D);
console.log(`D: verses ${dVerses}; verses in which the exact-verse alignment fired ${dAligned}; verses whose Aramaic words differ in pointing or spelling between the bundled WLC and MAM: ${dTextDiff.length}`);
fs.writeFileSync(`${OUT}robust-D-textdiff.tsv`, dTextDiff.join('\n') + '\n', 'utf8');
