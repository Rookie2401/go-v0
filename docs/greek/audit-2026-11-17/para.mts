// The "All forms" table as the extension builds it: the adapter's paradigm from the indexes that are loaded when the card is made (the shards of the
// sentence's words only), with no dictionary record (Greek declares no dictionary). usage: para.mts <file: "sentence | word [| extra text whose shards are also loaded]">
import fs from 'node:fs';
import { card, prepare } from 'C:/Users/CJWal/dev/tmp-mem/elaudit/setup.mts';
import { parserAdapter } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/parser';
import { buildParadigm } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/content/enrich';
import { resetGreekIndexes } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/greek/index-store';
const lines = fs.readFileSync(process.argv[2]!, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const verbose = process.argv[3] !== 'count';
const adapter: any = parserAdapter('el');
for (const line of lines) {
  const [sentenceRaw, wordRaw, extra] = line.split('|').map((x) => x.trim());
  const sentence = sentenceRaw.normalize('NFC'); const word = wordRaw.normalize('NFC');
  const c = await card('ext', sentence, word, sentence.indexOf(word));
  if (extra) await prepare('ext', extra);
  if (!c.lemma || !c.pos) { console.log(`\n== ${word}: no lemma`); continue; }
  const hint = { features: Object.fromEntries(c.features.map((f: any) => [f.key, f.value])), surface: c.surface };
  const p: any = buildParadigm(adapter, 'el', c.lemma, c.pos, undefined, hint);
  if (!p) { console.log(`\n== ${word} → ${c.lemma}/${c.pos}: NO TABLE`); continue; }
  const byStatus: Record<string, number> = {};
  for (const cell of p.cells) byStatus[cell.status] = (byStatus[cell.status] ?? 0) + 1;
  console.log(`\n== ${word} → ${c.lemma}/${c.pos}${extra ? ` (+ shards of "${extra}")` : ''}: ${p.cells.length} cells ${JSON.stringify(byStatus)}; sources ${p.sources.map((s: any) => s.label).join(' + ')}`);
  if (verbose) {
    for (const cell of p.cells.slice(0, Number(process.argv[4] ?? 400))) console.log(`   ${Object.entries(cell.features).map(([k, v]) => `${k}=${v}`).join(' ')}: ${cell.form}${cell.note ? `  (${cell.note})` : ''}${cell.alternatives?.length ? `  alt ${cell.alternatives.join(',')}` : ''}`);
    console.log('   notes: ' + (p.notes ?? []).join(' || ').slice(0, 400));
  }
}
