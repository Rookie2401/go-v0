/**
 * Audit of the coordinator's own tone tables against the dictionary: is every expected reading in
 * test/integration/thai-tone-tables.ts one that Wiktionary lists? A table written from memory can be wrong too.
 * Run: npx vite-node scripts/check-tone-tables.mts
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { CORE, HARD, HELD_OUT, T, tonesOf, words } from '../test/integration/thai-tone-tables';

const TONE_RE = /[˥˦˧˨˩]+/gu;
const toneOf = (l: string) => (l === '˧' || l === '˧˧' ? 'mid' : l === '˨˩' ? 'low' : l === '˥˩' ? 'falling' : l === '˦˥' || l === '˥' ? 'high' : l === '˩˩˦' || l === '˩˦' || l === '˨˦' ? 'rising' : undefined);
const ipaTones = (ipa: string) => ipa.replace(/[/[\]]/g, '').split(/[.\s]+/u).filter(Boolean).map((s) => { const m = s.match(TONE_RE); return m ? toneOf(m[m.length - 1]) : undefined; });

const readings = new Map<string, string[]>();
for await (const line of createInterface({ input: createReadStream('data/dictionaries/kaikki.org-dictionary-Thai.jsonl', 'utf8') })) {
  if (!line.trim()) continue;
  const e = JSON.parse(line) as { word: string; sounds?: Array<{ ipa?: string }> };
  for (const s of e.sounds ?? []) {
    if (!s.ipa) continue;
    const t = ipaTones(s.ipa);
    if (t.length && t.every(Boolean)) readings.set(e.word, [...new Set([...(readings.get(e.word) ?? []), t.join(' ')])]);
  }
}

const tables: Array<[string, Array<[string, string]>]> = [
  ['CORE', Object.entries(CORE).flatMap(([letter, list]) => words(list).map((w) => [w, T[letter]] as [string, string]))],
  ['HARD', HARD.map(([w, l]) => [w, tonesOf(l).join(' ')] as [string, string])],
  ['HELD_OUT', HELD_OUT.map(([w, l]) => [w, tonesOf(l).join(' ')] as [string, string])],
];
for (const [name, rows] of tables) {
  let agree = 0, absent = 0;
  const differ: string[] = [];
  for (const [word, expected] of rows) {
    const r = readings.get(word);
    if (!r) { absent++; continue; }
    if (r.includes(expected)) agree++;
    else differ.push(`${word}: table says ${expected}; Wiktionary lists ${r.join(' | ')}`);
  }
  console.log(`${name}: ${rows.length} words — ${agree} agree with a Wiktionary reading, ${differ.length} differ, ${absent} not in the dictionary`);
  for (const d of differ) console.log('   ' + d);
}
