// Coverage of running Thai text. Each line "section | text" is one reading unit. The text is cut with the ADAPTER'S OWN tokenizer
// (Thai has no spaces), and every word token is put through the card's parseSelection with its real offsets in the unit.
// Classes: NONE (no reading at all) / NAME? (unconfirmed name guess) / DICT (a reading only from the dictionary headword list:
// part of speech but no meaning of its own) / RULE (ๆ stem) / LIST (course word list, with its own meaning).
import fs from 'node:fs';
import { registerAllAnalysers } from 'C:/Users/CJWal/dev/go-v0-rc/test/support/analysers';
import { parseSelection, parserAdapter } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/parser';
registerAllAnalysers();
const adapter: any = parserAdapter('th')!;
const lines = fs.readFileSync(process.argv[2]!, 'utf8').replace(/^\uFEFF/, '').split('\n').map((l) => l.replace(/\r$/, '').trim()).filter((l) => l && !l.startsWith('#'));
type T = { n: number; none: string[]; name: string[]; dict: string[]; rule: string[]; list: number; roman: number; tone: number };
const tot: Record<string, T> = {};
const all: T = { n: 0, none: [], name: [], dict: [], rule: [], list: 0, roman: 0, tone: 0 };
const out: string[] = [];
for (const line of lines) {
  const bar = line.indexOf('|');
  const sec = line.slice(0, bar).trim();
  const text = line.slice(bar + 1).trim().normalize('NFC');
  const t = (tot[sec] ??= { n: 0, none: [], name: [], dict: [], rule: [], list: 0, roman: 0, tone: 0 });
  const toks = adapter.tokenize(text);
  const an = adapter.analyze(toks);
  let row = '';
  toks.forEach((tk: any, i: number) => {
    if (!tk.isWord) return;
    let c: any;
    try { c = parseSelection({ surface: tk.surface, languageId: 'th', context: { kind: 'sentence', confidence: 0.9, sentence: text, selStart: tk.start, selEnd: tk.end } }); } catch { c = {}; }
    const src = an[i]?.candidates?.[0]?.notes?.source;
    for (const x of [t, all]) {
      x.n++;
      if (c.transliteration) x.roman++;
      if ((c.pronunciation ?? []).some((n: string) => n.startsWith('Tone by syllable'))) x.tone++;
      if (!c.lemma) x.none.push(tk.surface);
      else if (c.unconfirmed) x.name.push(tk.surface);
      else if (src === 'dictionary') x.dict.push(tk.surface);
      else if (src === 'rule') x.rule.push(tk.surface);
      else x.list++;
    }
    const tag = !c.lemma ? '∅' : c.unconfirmed ? 'NAME?' : `${c.pos}${src === 'dictionary' ? '°' : ''}${c.gloss ? `“${String(c.gloss).slice(0, 26)}”` : ''}${c.role ? `{${String(c.role).slice(0, 34)}}` : ''}`;
    row += `${tk.surface}=${tag}${c.transliteration ? `<${c.transliteration}>` : ''} · `;
  });
  out.push(`[${sec}] ${text}\n    ${row}\n`);
}
const pct = (a: number, b: number) => `${a} of ${b} (${(100 * a / b).toFixed(1)} %)`;
const sum = (name: string, t: T) => {
  out.push(`== ${name}: ${t.n} word tokens; no reading ${pct(t.none.length, t.n)}; name guess ${pct(t.name.length, t.n)}; dictionary headword only, no own meaning ${pct(t.dict.length, t.n)}; ๆ-stem by rule ${pct(t.rule.length, t.n)}; course word list ${pct(t.list, t.n)}; romanisation shown by the analyser ${pct(t.roman, t.n)}; tone named ${pct(t.tone, t.n)}`);
  out.push('   no reading: ' + [...new Set(t.none)].join(' '));
  out.push('   dictionary only: ' + [...new Set(t.dict)].join(' '));
};
for (const [k, t] of Object.entries(tot)) sum(k, t);
sum('ALL', all);
fs.writeFileSync(process.argv[3]!, out.join('\n') + '\n', 'utf8');
console.log(out.slice(-21).join('\n').slice(0, 6000));
