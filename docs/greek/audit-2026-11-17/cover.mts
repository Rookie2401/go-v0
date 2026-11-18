// Coverage of running text: every word of each line ("register | variety-or-dash | text") through the card, sentence by sentence (the adapter's own
// sentence splitter and tokenizer), with the indexes loaded as the extension loads them. usage: cover.mts <text file> [ext|core|biblia] [full]
import fs from 'node:fs';
import { card, short, type Mode } from 'C:/Users/CJWal/dev/tmp-mem/elaudit/setup.mts';
import { elAdapter } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/el';
const lines = fs.readFileSync(process.argv[2]!, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const mode = (process.argv[3] ?? 'ext') as Mode;
const full = process.argv[4] === 'full';
interface Tot { n: number; none: number; unconf: number; low: number; inferred: number; listed: number; nomorph: number; src: Record<string, number>; periods: Record<string, number>; sentences: number; noneList: string[]; unconfList: string[]; lowList: string[]; inferredList: string[]; alt: number }
const tot: Record<string, Tot> = {};
for (const line of lines) {
  const [reg, v, ...rest] = line.split('|');
  const text = rest.join('|').trim().normalize('NFC');
  const t = (tot[reg.trim()] ??= { n: 0, none: 0, unconf: 0, low: 0, inferred: 0, listed: 0, nomorph: 0, src: {}, periods: {}, sentences: 0, noneList: [], unconfList: [], lowList: [], inferredList: [], alt: 0 });
  for (const span of elAdapter.segmentSentences(text)) {
    const s = span.text;
    const toks = elAdapter.tokenize(s).filter((x) => x.isWord);
    let out = '';
    let period = '';
    for (const tk of toks) {
      let c: any;
      try { c = await card(mode, s, tk.surface, tk.start, v.trim() !== '-' ? v.trim() : undefined); } catch (e) { c = { notes: [], alternatives: [] }; out += ` ${tk.surface}=THROW`; }
      t.n++;
      const src = c.source?.id ?? 'none';
      t.src[src] = (t.src[src] ?? 0) + 1;
      if (c.period) period = `${c.period.varietyId}:${c.period.evidence ?? ''}`;
      const inferred = (c.basis ?? []).length === 0 && false;
      if (!c.lemma) { t.none++; t.noneList.push(tk.surface); out += ` ${tk.surface}=∅`; continue; }
      const flags: string[] = [];
      if (c.unconfirmed) { t.unconf++; t.unconfList.push(`${tk.surface}→${c.lemma}`); flags.push('?'); }
      if (c.confidence < 0.5) { t.low++; t.lowList.push(`${tk.surface}(${c.confidence})`); flags.push('low'); }
      if (/ or /.test(c.morphology ?? '')) { t.listed++; flags.push('OR'); }
      if (c.alternatives.length) t.alt++;
      const srcTag = src.startsWith('morphgnt') ? 'NT' : src === 'kaikki-grc-tables' ? 'AG' : src === 'kaikki-el-tables' ? 'MG' : src.startsWith('el-rules') ? 'RULE' : src;
      out += ` ${tk.surface}=${c.lemma}/${c.pos}[${c.morphology ?? ''}]“${short(c.gloss, 22)}”{${srcTag} ${c.confidence}${flags.length ? ' ' + flags.join(',') : ''}${c.alternatives.length ? ` +${c.alternatives.length}` : ''}}`;
    }
    t.sentences++;
    t.periods[period || 'none'] = (t.periods[period || 'none'] ?? 0) + 1;
    if (full) console.log(`[${reg.trim()}] (${period}) ${s.slice(0, 70)}\n  ${out}\n`);
  }
}
for (const [reg, t] of Object.entries(tot)) {
  const pct = (x: number) => `${x} (${(100 * x / t.n).toFixed(1)} %)`;
  console.log(`\n== ${reg} [${mode}]: ${t.n} words in ${t.sentences} sentences; blank ${pct(t.none)}; unconfirmed ${pct(t.unconf)}; confidence under 0.5 (no lemma credit) ${pct(t.low)}; form line is a list ("or") ${pct(t.listed)}; card has other readings ${pct(t.alt)}`);
  console.log('   source of the first reading: ' + JSON.stringify(t.src) + ' | sentence periods: ' + JSON.stringify(t.periods));
  console.log('   blank: ' + [...new Set(t.noneList)].join(' '));
  console.log('   unconfirmed: ' + [...new Set(t.unconfList)].join(' '));
  console.log('   low: ' + [...new Set(t.lowList)].join(' '));
}
