// Card probe for Biblical Aramaic. One battery line each:
//   @WLC Dan 5:25 | *            every word of the bundled verse (data/corpus/arc, the text the project ships), verse = sentence
//   @WLC Dan 2:20 | 5            the 5th word of it
//   @MAM Dan 2:4 | *             the verse as the owner's Biblia app holds it (Miqra al pi ha-Masorah, a second edition; whole verse, Hebrew part included)
//   @MAM Jer 10:10-12 | *        several verses joined as one text
//   options after the reference: [3-6] only these words as the sentence; nopoint (all marks removed); novowel-accents (accents only removed);
//                                alone (the word with no sentence); lang=he (ask the Hebrew card instead)
//   T | typed sentence | word    typed text (word = * for all)
import fs from 'node:fs';
import { registerAllAnalysers } from 'C:/Users/CJWal/dev/go-v0-rc/test/support/analysers';
import { parseSelection } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/parser';
import { arcAdapter } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/arc';
import { consonantal } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hebrew/text';
registerAllAnalysers();
const CORPUS = 'C:/Users/CJWal/dev/go-v0-rc/data/corpus/arc/';
const BIBLIA = 'C:/Users/CJWal/dev/biblia-v0/public/data/he/';
const slugBook: Record<string, string> = { Dan: 'daniel', Ezra: 'ezra', Jer: 'jeremiah', Gen: 'genesis' };
const cache: Record<string, any> = {};
function wlc(book: string, ch: number, v: number): string {
  let f = `${CORPUS}${slugBook[book]}-${ch}-${v}.json`;
  if (!fs.existsSync(f)) f = `${CORPUS}${slugBook[book]}-${ch}-${v}b.json`;
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  return d.sections.flatMap((s: any) => s.paragraphs.flatMap((q: any) => q.sentences.map((x: any) => x.text))).join(' ');
}
function mam(book: string, ch: number, v: number): string {
  const d = (cache[book] ??= JSON.parse(fs.readFileSync(`${BIBLIA}${book}.json`, 'utf8')));
  return d.chapters[ch - 1].verses[v - 1].t;
}
const strip = (s: string) => s.normalize('NFC').replace(/[\u0591-\u05AF\u05BD\u05BF\u05C0\u05C4\u05C5\u034F]/g, '');
const lines = fs.readFileSync(process.argv[2]!, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const tot = { n: 0, blank: 0, c98: 0, other: 0 };
for (const line of lines) {
  let sentence = ''; let pick = '*'; let lang = 'arc'; let alone = false; let label = line;
  if (line.startsWith('@')) {
    const [left, right] = line.split('|').map((x) => x.trim());
    pick = right ?? '*';
    const m = /^@(WLC|MAM) (\w+) (\d+):(\d+)(?:-(\d+))?(.*)$/.exec(left)!;
    const [, ed, book, ch, v1, v2, opts] = m;
    const vs: string[] = [];
    for (let v = Number(v1); v <= Number(v2 ?? v1); v++) vs.push(ed === 'WLC' ? wlc(book, Number(ch), v) : mam(book, Number(ch), v));
    sentence = vs.join(' ');
    const range = /\[(\d+)-(\d+)\]/.exec(opts);
    if (range) { const ws = arcAdapter.tokenize(sentence).filter((t) => t.isWord); sentence = sentence.slice(ws[Number(range[1]) - 1].start, ws[Number(range[2]) - 1].end); }
    if (/nopoint/.test(opts)) sentence = consonantal(sentence.replace(/־/g, ' ')).replace(/\s+/g, ' ');
    if (/noaccent/.test(opts)) sentence = strip(sentence);
    if (/lang=he/.test(opts)) lang = 'he';
    alone = /alone/.test(opts);
  } else {
    const p = line.split('|').map((x) => x.trim());
    if (p[0].startsWith('T')) { sentence = p[1]; pick = p[2] ?? '*'; if (/lang=he/.test(p[0])) lang = 'he'; alone = /alone/.test(p[0]); }
  }
  const adapterTok = arcAdapter.tokenize(sentence).filter((t) => t.isWord);
  let chosen = adapterTok;
  if (pick !== '*') {
    if (/^\d+$/.test(pick)) chosen = [adapterTok[Number(pick) - 1]];
    else { const at = sentence.indexOf(pick); chosen = adapterTok.filter((t) => t.start < at + pick.length && t.end > at); }
  }
  console.log(`\n### ${label}`);
  console.log(`    text: ${strip(sentence)}`);
  for (const w of chosen) {
    if (!w) { console.log('    (no such word)'); continue; }
    let c: any;
    const context = alone ? { kind: 'none' as const, confidence: 0 } : { kind: 'sentence' as const, confidence: 0.9, sentence, selStart: w.start, selEnd: w.end };
    try { c = parseSelection({ surface: w.surface, languageId: lang, context }); } catch (e) { console.log(`  ${w.surface}: THROW ${(e as Error).message}`); continue; }
    tot.n++; if (!c.lemma) tot.blank++; else if (c.confidence === 0.98) tot.c98++; else tot.other++;
    const alts = (c.alternatives ?? []).map((a: any) => `${a.lemma}/${a.pos}/${a.gloss ?? ''}@${a.confidence}`).join(' ; ');
    console.log(`  ${strip(w.surface)} ⇒ ${c.lemma ?? '∅'} | ${c.pos ?? ''} | ${c.morphology ?? ''} | means: ${c.gloss ?? '—'}${c.wordAnalysis?.lexicalMeaning && c.wordAnalysis.lexicalMeaning.text !== c.gloss ? ` (lemma: ${c.wordAnalysis.lexicalMeaning.text})` : ''} | ${c.confidence}${c.unconfirmed ? ' UNCONF' : ''}`
      + (alts ? `\n        also: ${alts}` : '') + ((c.syntaxNotes ?? []).length ? `\n        parts: ${c.syntaxNotes.join(' ; ')}` : '')
      + (c.transliteration ? `\n        translit: ${c.transliteration}` : '') + ((c.pronunciation ?? []).length ? `\n        pron: ${c.pronunciation.join(' ')}` : '')
      + (c.period ? `\n        period: ${c.period.label} (${c.period.basis})` : '')
      + ((c.phrases ?? []).length ? `\n        phrases: ${c.phrases.map((p: any) => p.display).join(';')}` : '')
      + ((c.constructions ?? []).filter((x: any) => x.source === 'pattern').length ? `\n        grammar notes: ${c.constructions.filter((x: any) => x.source === 'pattern').map((x: any) => x.title).join(';')}` : '')
      + (process.argv[3] === 'long' ? `\n        notes: ${(c.notes ?? []).join(' || ')}\n        basis: ${(c.basis ?? []).join(' || ')}\n        form-construction: ${(c.constructions ?? []).map((x: any) => `${x.title} — ${x.explanation}`).join(' ;; ')}\n        role: ${c.role ?? ''} syntax: ${c.syntax ? JSON.stringify(c.syntax).slice(0, 200) : ''}\n        ambiguity: ${(c.wordAnalysis?.ambiguity ?? []).join(' / ')}` : ''));
  }
}
console.log(`\n== totals: ${tot.n} words; blank ${tot.blank}; in-verse 0.98 ${tot.c98}; other ${tot.other}`);
