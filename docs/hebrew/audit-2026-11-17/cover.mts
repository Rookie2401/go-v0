// Running text through the CARD (parseSelection per word, in its sentence), with the adapter's own tokeniser and sentence splitter.
// Input: a TSV from extract.mjs (REF \t verse \t gold) or plain text lines. For the TSV the same verses are read in three registers
// (as printed; points without accents; consonants only) and the card is compared with the Open Scriptures reading of the token.
// Usage: cover.mts <file> [tsv|text] [variety]
import fs from 'node:fs';
import { adapter, bare, card, loadFull, strip, words } from './lib.mts';
import { lemmaStem, lookupHebrewLemma } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hebrew/index-store';
import { decodeOshb } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hebrew/oshb';
await loadFull();
const file = process.argv[2]!;
const kind = process.argv[3] ?? 'text';
const variety = process.argv[4];
const extra = variety ? { varietyId: variety } : {};
const raw = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
type Tot = { n: number; none: number; unconf: number; rule: number; exact: number; form: number; lemma: number; several: number; periods: Record<string, number>; noneList: string[]; unconfList: string[]; noTranslit: number };
const mk = (): Tot => ({ n: 0, none: 0, unconf: 0, rule: 0, exact: 0, form: 0, lemma: 0, several: 0, periods: {}, noneList: [], unconfList: [], noTranslit: 0 });
function run(label: string, sentences: Array<{ ref: string; text: string; gold?: any[] }>): void {
  const t = mk();
  console.log(`\n===== ${label} =====`);
  for (const s of sentences) {
    const ws = words(s.text);
    const goldOk = s.gold && s.gold.length === ws.length;
    let line = `${s.ref}:`;
    ws.forEach((w, k) => {
      const c = card(s.text, w.surface, w.start, extra);
      t.n++;
      if (k === 0) { const p = c.period?.varietyId ?? 'none'; t.periods[p] = (t.periods[p] ?? 0) + 1; line += ` [${p}]`; }
      if (!c.lemma) { t.none++; t.noneList.push(w.surface); line += `\n    ${w.surface} = ∅`; return; }
      if (c.unconfirmed) { t.unconf++; t.unconfList.push(`${w.surface}→${c.lemma}`); }
      if (c.provenance === 'rule' && !c.unconfirmed) t.rule++;
      if (c.alternatives.length) t.several++;
      if (!c.transliteration) t.noTranslit++;
      let mark = '';
      if (goldOk && s.gold![k]) {
        const [gl, gc] = s.gold![k];
        const toks = adapter.tokenize(s.text);
        const an = adapter.analyze(toks, variety ? { varietyId: variety } : undefined);
        const ti = toks.findIndex((x: any) => x.isWord && x.start === w.start);
        const cands: any[] = an[ti]?.candidates ?? [];
        const picked = cands.length ? cands.reduce((m, x) => (x.confidence > m.confidence ? x : m), cands[0]) : undefined;
        const gid = lemmaStem(gl);
        const grow = lookupHebrewLemma(gid);
        const g = cands.find((x) => x.notes?.lemmaId === gid && x.notes?.code === gc);
        const gd = decodeOshb(gl, gc);
        const gWords = `${gd.pos}, ${adapter.describeMorph(gd.morph, gd.pos)}`;
        const sameHead = !!grow && grow[0] === c.lemma && picked?.notes?.source !== 'kaikki-he';
        if (g && picked === g) { t.exact++; mark = 'OK'; }
        else if (sameHead && (picked?.notes?.lemmaId === gid || grow![2] === c.pos)) { t.form++; mark = `FORM (source: ${gWords}${g ? '' : '; not offered at all'})`; }
        else { t.lemma++; mark = `LEMMA (source: ${grow?.[0] ?? gid} ${gWords}; "${String(grow?.[1] ?? '').slice(0, 30)}"${g ? '' : '; not offered at all'})`; }
      }
      line += `\n    ${w.surface} = ${c.lemma}/${c.pos} [${c.morphology ?? ''}] "${String(c.gloss ?? '—').slice(0, 44)}" ${c.confidence}${c.unconfirmed ? ' UNCONF' : ''}${c.provenance === 'rule' ? ' rule' : ''}${c.alternatives.length ? ` +${c.alternatives.length}alt(${c.alternatives.map((a: any) => `${a.lemma}/${a.pos}`).join(',')})` : ''}${c.syntaxNotes?.length ? ` {${c.syntaxNotes.join(' ; ')}}` : ''} R:${c.transliteration ?? '—'}${mark ? `  ⟹ ${mark}` : ''}`;
    });
    console.log(line);
  }
  const pc = (x: number): string => `${x} (${(100 * x / Math.max(1, t.n)).toFixed(1)} %)`;
  console.log(`\n== ${label}: ${t.n} words; blank ${pc(t.none)}; unconfirmed guess ${pc(t.unconf)}; made by rule (prefix cut, hand table) ${pc(t.rule)}; with other readings ${pc(t.several)}; no transliteration ${pc(t.noTranslit)}${kind === 'tsv' ? `; card = source reading ${pc(t.exact)}; right lemma, other form ${pc(t.form)}; WRONG LEMMA ${pc(t.lemma)}` : ''}; sentences read as ${JSON.stringify(t.periods)}`);
  console.log('blank: ' + [...new Set(t.noneList)].join(' '));
  console.log('unconfirmed: ' + [...new Set(t.unconfList)].join(' '));
}
if (kind === 'tsv') {
  const verses = raw.map((l) => { const [ref, text, gold] = l.split('\t'); return { ref, text: text.normalize('NFC'), gold: JSON.parse(gold) }; });
  run('as printed (points and cantillation)', verses);
  run('points, no cantillation', verses.map((v) => ({ ...v, text: strip(v.text) })));
  run('consonants only', verses.map((v) => ({ ...v, text: bare(v.text) })));
} else {
  const sentences: Array<{ ref: string; text: string }> = [];
  raw.forEach((l, i) => { for (const sp of adapter.segmentSentences(l.normalize('NFC'))) sentences.push({ ref: `L${i + 1}`, text: sp.text }); });
  run(file.split(/[\\/]/).pop()!, sentences);
}
