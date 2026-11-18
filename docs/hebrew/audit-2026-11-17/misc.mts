// Small checks: a declared variety on a Mishnah sentence, a maqaf-joined selection, a ketiv inside a pointed verse, number words, "All forms" tables.
import fs from 'node:fs';
import { adapter, card, loadFull, words } from './lib.mts';
import { heNumberToWords } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hebrew/numbers';
await loadFull();
const show = (label: string, s: string, w: string, extra: any = {}) => { const at = s.indexOf(w); const c = card(s, w, at, extra); console.log(`${label}: «${w}» ⇒ ${c.lemma ?? '∅'} / ${c.pos ?? ''} / ${c.morphology ?? ''} / "${String(c.gloss ?? '—').slice(0, 40)}" / ${c.confidence}${c.unconfirmed ? ' UNCONF' : ''} / period ${c.period?.varietyId ?? '—'} (${c.period?.evidence ?? ''}: ${String(c.period?.basis ?? '').slice(0, 90)}) / tokens ${c.tokenCount}${c.words?.length ? ' / words: ' + c.words.map((x: any) => `${x.surface}=${x.lemma ?? '∅'}`).join(', ') : ''} / notes: ${c.notes.join(' || ').slice(0, 260)}`); };
const m = 'מֵאֵימָתַי קוֹרִין אֶת שְׁמַע בְּעַרְבִית.';
for (const w of ['קוֹרִין', 'מֵאֵימָתַי']) { show('Mishnah, nothing declared', m, w); show('Mishnah, he-mish declared', m, w, { varietyId: 'he-mish' }); }
const avot = 'רַבִּי אֱלִיעֶזֶר אוֹמֵר, עַד חֲצוֹת.';
show('Mishnah', avot, 'רַבִּי'); show('Mishnah, he-mish declared', avot, 'רַבִּי', { varietyId: 'he-mish' });
const g = fs.readFileSync('C:/Users/CJWal/dev/tmp-mem/heaudit/passages.tsv', 'utf8').split('\n')[0].split('\t')[1].normalize('NFC');
const ws = words(g);
const two = g.slice(ws[3].start, ws[4].end); // אֵת הַשָּׁמַיִם
show('two words selected', g, two);
const g4 = fs.readFileSync('C:/Users/CJWal/dev/tmp-mem/heaudit/passages.tsv', 'utf8').split('\n')[3].split('\t')[1].normalize('NFC');
const w4 = words(g4);
show('maqaf pair selected as one', g4, g4.slice(w4[2].start, w4[3].end));
// ketiv: Gen 8:17 in the WLC spelling with the unpointed ketiv הוצא where the qere הַיְצֵא stands
const wlc = JSON.parse(fs.readFileSync('C:/Users/CJWal/dev/tmp-mem/heaudit/wlc/Gen.json', 'utf8')).chapters[7].verses[16].t.normalize('NFC');
const q = words(wlc).find((x) => x.surface.replace(/[\u0591-\u05C7]/g, '') === 'היצא');
if (q) { show('qere as printed', wlc, q.surface); const k = wlc.slice(0, q.start) + 'הוצא' + wlc.slice(q.end); show('ketiv (unpointed) in the same verse', k, 'הוצא'); }
// Pentateuch הִוא, yerushalayim, YHWH unpointed
show('unpointed Name alone', 'יהוה', 'יהוה');
show('nonsense pointed word', 'גְּלַרְפּוֹן', 'גְּלַרְפּוֹן');
show('pointed Modern word not in the Bible', 'מַחְשֵׁב', 'מַחְשֵׁב');
show('rabbinic particle', 'אֲפִלּוּ', 'אֲפִלּוּ'); show('rabbinic particle', 'כֵּיצַד', 'כֵּיצַד');
console.log('\nnumber words: ' + [2, 3, 11, 12, 21, 100, 111, 115, 120, 1020, 1100, 1111, 2000, 2026, 11000].map((n) => `${n} = ${heNumberToWords(n)}`).join(' | '));
for (const [l, p] of [['שָׁמַר', 'VERB'], ['דָּבָר', 'NOUN'], ['בּוֹא', 'VERB'], ['כָּתַב', 'VERB'], ['גָּדוֹל', 'ADJ'], ['הוּא', 'PRON']] as const) {
  const t: any = adapter.paradigm(l, p);
  if (!t) { console.log(`\n${l} ${p}: NO TABLE`); continue; }
  console.log(`\n== ${l} ${p}: ${t.cells.length} cells; template ${t.template ?? '—'}; notes: ${t.notes.join(' ').slice(0, 200)}`);
  console.log(t.cells.slice(0, 26).map((c: any) => `${Object.values(c.features).join('.')}=${c.form}${c.note ? ` (${String(c.note).slice(0, 50)})` : ''}`).join(' | ').slice(0, 1800));
}
