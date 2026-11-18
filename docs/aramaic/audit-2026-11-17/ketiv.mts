// The ketiv (written) forms of the Aramaic portions, taken from the bundled OSHB snapshot (type="x-ketiv"). A printed Bible shows the
// ketiv in the text line (unpointed here, as OSHB gives it); what does the card do when a reader selects it?
import fs from 'node:fs';
import { arcAdapter } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/arc';
const xml = fs.readFileSync('C:/Users/CJWal/dev/go-v0-rc/data/sources/aramaic/oshb-aramaic-snapshot.xml', 'utf8');
const re = /<w type="x-ketiv" lemma="([^"]+)"(?: n="[^"]*")? morph="(A[^"]+)" id="([^"]+)">([^<]+)<\/w>/g;
let m: RegExpExecArray | null; let n = 0, blank = 0, sameLemma = 0, otherLemma = 0; const blanks: string[] = []; const others: string[] = [];
const pick = (c: any[]) => (c.length ? c.reduce((a, b) => (b.confidence > a.confidence ? b : a), c[0]) : undefined);
while ((m = re.exec(xml))) {
  n++; const surface = m[4].replace(/\//g, ''); const lemma = m[1].split('/').pop();
  const an = arcAdapter.analyze(arcAdapter.tokenize(surface)); const c = pick(an.find((x) => x.token.isWord)?.candidates ?? []);
  if (!c) { blank++; blanks.push(surface); } else if (c.notes.lemmaId === lemma) sameLemma++; else { otherLemma++; others.push(`${surface}→${c.lemma} (ketiv lemma ${lemma})`); }
}
console.log({ ketivWords: n, blank, firstReadingSameLexeme: sameLemma, firstReadingOtherLexeme: otherLemma });
console.log('blank: ' + blanks.join(' '));
console.log('other lexeme: ' + others.join(' ; '));
const all = [...xml.matchAll(/type="x-ketiv"/g)].length; console.log('all ketiv elements in the snapshot (any language):', all);
