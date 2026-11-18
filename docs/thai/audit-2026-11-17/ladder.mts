// The course's own texts (data/ladder/th/units, data/stage0/th/scenes) through the adapter's tokenizer and analyser (not the full card:
// 40k+ tokens). Counts tokens with no reading, dictionary-only readings and course-list readings, lists the commonest of the first two,
// and prints the Thai lines of three sample units for reading. Read-only.
import fs from 'node:fs';
import path from 'node:path';
import { thAdapter } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/th';
const ROOT = 'C:/Users/CJWal/dev/go-v0-rc/data';
const thaiLines = (file: string): Array<{ th: string; en: string }> => {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out: Array<{ th: string; en: string }> = [];
  const walk = (o: any): void => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (!o || typeof o !== 'object') return;
    if (typeof o.text === 'string' && /[\u0E00-\u0E7F]/.test(o.text) && !o.text.includes('{')) out.push({ th: o.text, en: typeof o.english === 'string' ? o.english : typeof o.en === 'string' ? o.en : typeof o.translation === 'string' ? o.translation : '' });
    for (const k of Object.keys(o)) if (k !== 'text') walk(o[k]);
  };
  walk(j);
  return out;
};
const report: string[] = [];
for (const [name, dir] of [['ladder', 'ladder/th/units'], ['stage0 scenes', 'stage0/th/scenes']] as const) {
  const files = fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.json')).sort();
  let n = 0; let none = 0; let dict = 0; let list = 0; let lines = 0;
  const noneC = new Map<string, number>(); const dictC = new Map<string, number>();
  for (const f of files) {
    for (const l of thaiLines(path.join(ROOT, dir, f))) {
      lines++;
      const toks = thAdapter.tokenize(l.th.normalize('NFC'));
      const an = thAdapter.analyze(toks);
      toks.forEach((t, i) => {
        if (!t.isWord || !/[\u0E00-\u0E7F]/.test(t.surface)) return;
        n++;
        const c = an[i]?.candidates?.[0];
        if (!c) { none++; noneC.set(t.surface, (noneC.get(t.surface) ?? 0) + 1); }
        else if (c.notes?.source === 'dictionary') { dict++; dictC.set(t.surface, (dictC.get(t.surface) ?? 0) + 1); }
        else list++;
      });
    }
  }
  const top = (m: Map<string, number>, k: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([w, c]) => `${w}×${c}`).join(' ');
  report.push(`== ${name}: ${files.length} files, ${lines} Thai lines, ${n} Thai word tokens; no reading ${none} (${(100 * none / n).toFixed(2)} %), ${noneC.size} different; dictionary headword only ${dict} (${(100 * dict / n).toFixed(1)} %), ${dictC.size} different; course word list ${list} (${(100 * list / n).toFixed(1)} %)`);
  report.push(`   commonest tokens with no reading: ${top(noneC, 70)}`);
  report.push(`   commonest dictionary-only tokens: ${top(dictC, 60)}`);
}
for (const f of ['ladder/th/units/th-a1-1-01.json', 'ladder/th/units/th-a2-1-05.json', 'ladder/th/units/th-b1-10.json']) {
  report.push(`\n== sample ${f}`);
  for (const l of thaiLines(path.join(ROOT, f)).slice(0, 26)) report.push(`${l.th}   = ${l.en}\n      ${thAdapter.tokenize(l.th).filter((t) => t.isWord).map((t) => t.surface).join(' · ')}`);
}
fs.writeFileSync('C:/Users/CJWal/dev/tmp-mem/thaudit/ladder.out.txt', report.join('\n') + '\n', 'utf8');
console.log(report.slice(0, 6).join('\n'));
