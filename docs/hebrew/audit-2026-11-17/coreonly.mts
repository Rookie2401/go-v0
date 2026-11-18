// The card BEFORE the full indexes are installed (the compiled core alone): the five passages as printed, and the Modern text.
import fs from 'node:fs';
import { adapter, card, words } from './lib.mts';
const verses = fs.readFileSync('C:/Users/CJWal/dev/tmp-mem/heaudit/passages.tsv', 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t')[1].normalize('NFC'));
const modern: string[] = [];
for (const l of fs.readFileSync('C:/Users/CJWal/dev/tmp-mem/heaudit/modern-text.txt', 'utf8').split('\n').filter((x) => x.trim() && !x.startsWith('#'))) for (const sp of adapter.segmentSentences(l.normalize('NFC'))) modern.push(sp.text);
for (const [name, list] of [['five Biblical passages as printed', verses], ['Modern text', modern]] as const) {
  let n = 0, none = 0; const blanks: string[] = [];
  for (const s of list) for (const w of words(s)) { const c = card(s, w.surface, w.start); n++; if (!c.lemma) { none++; blanks.push(w.surface); } }
  console.log(`core only, ${name}: ${n} words; blank ${none} (${(100 * none / n).toFixed(1)} %)\n   ${blanks.slice(0, 60).join(' ')}`);
}
