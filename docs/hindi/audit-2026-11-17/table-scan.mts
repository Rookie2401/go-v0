// Mechanical scan of every generated "All forms" table of the word list for three kinds of suspect cell.
import { hiAdapter, hiLexicon } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hi';
const bad1: string[] = [], bad2: string[] = [], bad3: string[] = [], noTable: string[] = [];
let tables = 0;
const seen = new Set<string>();
for (const e of hiLexicon.entries as any[]) {
  const k = `${e.lemma}|${e.pos}`;
  if (seen.has(k)) continue; seen.add(k);
  if (!['NOUN', 'VERB', 'AUX', 'ADJ', 'PROPN'].includes(e.pos)) continue;
  let p: any;
  try { p = (hiAdapter as any).paradigm(e.lemma, e.pos, undefined); } catch { p = undefined; }
  if (!p || !p.cells?.length) { if (e.pos === 'NOUN') noTable.push(e.lemma); continue; }
  tables++;
  const forms: string[] = p.cells.map((c: any) => c.form);
  // (1) a chandrabindu written on a vowel sign that rises above the line (ेँ ैँ ोँ ौँ ीँ): not a spelling in use
  const a = forms.filter((f) => /[ेैोौी]ँ/.test(f));
  if (a.length) bad1.push(`${e.lemma}: ${[...new Set(a)].join(' ')}`);
  // (2) a noun in -ई shown with a form in -यी
  if ((e.pos === 'NOUN' || e.pos === 'PROPN') && /ई$/.test(e.lemma)) { const b = forms.filter((f) => /यी$/.test(f)); if (b.length) bad2.push(`${e.lemma}: ${[...new Set(b)].join(' ')}`); }
  // (3) a feminine noun in -िया declined like चिड़िया although the य belongs to a conjunct or the word is a loan (reported for reading by hand)
  if (e.pos === 'NOUN' && /िया$/.test(e.lemma) && forms.some((f) => /ियाँ$/.test(f))) bad3.push(`${e.lemma}: ${forms.filter((f) => /ियाँ$|ियों$/.test(f)).join(' ')}`);
}
console.log(`tables generated: ${tables}`);
console.log(`(1) chandrabindu on a raised vowel sign: ${bad1.length} lemmas\n  ${bad1.join(' | ')}`);
console.log(`(2) noun in -ई with a form in -यी: ${bad2.length} lemmas\n  ${bad2.join(' | ')}`);
console.log(`(3) feminine in -िया with plural -ियाँ: ${bad3.length} lemmas\n  ${bad3.join(' | ')}`);
console.log(`nouns with no table: ${noTable.length}: ${noTable.join(' ')}`);
