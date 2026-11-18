// Battery 4: the same verses of the repository's text in other encodings and spellings a web page may carry. For each variant, every word's
// card is compared with the card of the text as the repository prints it; only the words whose reading changed are listed.
import fs from 'node:fs';
import { card, loadFull, words } from './lib.mts';
await loadFull();
const verses = fs.readFileSync('C:/Users/CJWal/dev/tmp-mem/heaudit/passages.tsv', 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t')[1].normalize('NFC'));
// extra verses with Jerusalem and qamats qatan
const extra = JSON.parse(fs.readFileSync('C:/Users/CJWal/dev/go-v0/packages/biblia/public/data/he/Ps.json', 'utf8'));
verses.push(String(extra.chapters[121].verses[1].t).normalize('NFC'), String(extra.chapters[121].verses[5].t).normalize('NFC'), String(extra.chapters[136].verses[4].t).normalize('NFC'));
const PRES: Record<string, string> = { 'שׁ': '\uFB2A', 'שׂ': '\uFB2B', 'אַ': '\uFB2E', 'אָ': '\uFB2F', 'בּ': '\uFB31', 'גּ': '\uFB32', 'דּ': '\uFB33', 'הּ': '\uFB34', 'וּ': '\uFB35', 'כּ': '\uFB3B', 'לּ': '\uFB3C', 'מּ': '\uFB3E', 'פּ': '\uFB44', 'תּ': '\uFB4A', 'וֹ': '\uFB4B', 'יִ': '\uFB1D' };
const variants: Array<[string, (s: string) => string]> = [
  ['NFD (decomposed)', (s) => s.normalize('NFD')],
  ['presentation forms U+FB1D–FB4B for letter + dot', (s) => { let t = s.normalize('NFD'); for (const [k, v] of Object.entries(PRES)) t = t.split(k.normalize('NFD')).join(v); return t; }],
  ['dagesh typed BEFORE the vowel point (and left unnormalised by a combining grapheme joiner)', (s) => s.replace(/([\u05B0-\u05BB])\u05BC/g, '\u05BC\u034F$1')],
  ['ASCII hyphen for the maqaf', (s) => s.replace(/\u05BE/g, '-')],
  ['maqaf dropped, words run together', (s) => s.replace(/\u05BE/g, '')],
  ['colon for the sof pasuq, vertical bar for the paseq', (s) => s.replace(/\u05C3/g, ':').replace(/\u05C0/g, '|')],
  ['no cantillation, meteg kept', (s) => s.replace(/[\u0591-\u05AF]/g, '')],
  ['qamats qatan (U+05C7) and holam haser (U+05BA) written as plain qamats and holam; CGJ removed', (s) => s.replace(/\u05C7/g, '\u05B8').replace(/\u05BA/g, '\u05B9').replace(/\u034F/g, '')],
  ['every hataf vowel written as a shva (a common typing fault)', (s) => s.replace(/[\u05B1-\u05B3]/g, '\u05B0')],
  ['zero-width joiner / LRM/RLM marks between words (copied from a web page)', (s) => s.replace(/ /g, ' \u200F')],
  ['non-breaking spaces between words', (s) => s.replace(/ /g, '\u00A0')],
  ['geresh-style apostrophes inside? none; final letters replaced by medial ones (a typing fault)', (s) => s.replace(/ך/g, 'כ').replace(/ם/g, 'מ').replace(/ן/g, 'נ').replace(/ף/g, 'פ').replace(/ץ/g, 'צ')],
];
const base = verses.map((v) => words(v).map((w) => { const c = card(v, w.surface, w.start); return `${c.lemma ?? '∅'}/${c.pos ?? ''}/${c.morphology ?? ''}${c.unconfirmed ? '/UNCONF' : ''}`; }));
const total = base.reduce((s, b) => s + b.length, 0);
console.log(`base: ${verses.length} verses, ${total} words (Gen 1:1–5, Deut 6:4–9, Ps 23, Isa 53:4–6, Ruth 1:16–17, Ps 122:2, 122:6, 137:5)`);
for (const [name, fn] of variants) {
  let changed = 0, blank = 0, unconf = 0, count = 0, tokDiff = 0;
  const ex: string[] = [];
  const periods: Record<string, number> = {};
  verses.forEach((v, vi) => {
    const t = fn(v);
    const ws = words(t);
    if (ws.length !== base[vi].length) { tokDiff++; if (ex.length < 14) ex.push(`[verse ${vi + 1}: ${ws.length} words instead of ${base[vi].length}: ${ws.slice(0, 6).map((w) => w.surface).join(' · ')}]`); }
    ws.forEach((w, k) => {
      const c = card(t, w.surface, w.start);
      count++;
      if (k === 0) { const p = c.period?.varietyId ?? 'none'; periods[p] = (periods[p] ?? 0) + 1; }
      const sig = `${c.lemma ?? '∅'}/${c.pos ?? ''}/${c.morphology ?? ''}${c.unconfirmed ? '/UNCONF' : ''}`;
      if (!c.lemma) blank++;
      if (c.unconfirmed) unconf++;
      if (ws.length === base[vi].length && sig !== base[vi][k]) { changed++; if (ex.length < 14) ex.push(`${w.surface}: ${base[vi][k].slice(0, 40)} → ${sig.slice(0, 50)}`); }
    });
  });
  console.log(`\n== ${name}: ${count} words; reading changed ${changed}; blank ${blank}; unconfirmed ${unconf}; verses whose word count changed ${tokDiff}; periods ${JSON.stringify(periods)}`);
  for (const e of ex) console.log('   ' + e);
}
