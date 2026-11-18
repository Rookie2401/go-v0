// The project's own hand-written Modern Greek gold (test/adapters/greek-modern-gold.json, 294 counted words) read through the CARD
// (the reading with the highest confidence) with the indexes as the extension loads them, beside the analyser's first reading (what the project measured).
import fs from 'node:fs';
import { card, prepare } from 'C:/Users/CJWal/dev/tmp-mem/elaudit/setup.mts';
import { elAdapter } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/el';
import { resetElPeriodMemory } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/greek/analyze';
const gold = JSON.parse(fs.readFileSync('C:/Users/CJWal/dev/go-v0-rc/test/adapters/greek-modern-gold.json', 'utf8'));
const fold = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC').toLowerCase().replace(/ς/g, 'σ');
const mode = (process.argv[2] ?? 'ext') as any;
let counted = 0; const C = { covered: 0, lemma: 0, pos: 0, both: 0, koine: 0, low: 0 }; const F = { covered: 0, lemma: 0, pos: 0, both: 0 };
const wrong: string[] = [];
for (const s of gold.sentences) {
  const text: string = s.text.normalize('NFC');
  await prepare(mode, text); resetElPeriodMemory();
  const tokens = elAdapter.tokenize(text);
  const an = elAdapter.analyze(tokens);
  const words = tokens.map((t, i) => ({ t, i })).filter((x) => x.t.isWord);
  for (let k = 0; k < words.length; k++) {
    const [, lemmas, parts] = s.words[k] ?? [];
    if (!lemmas || !parts) continue;
    counted++;
    const { t, i } = words[k];
    const first = an[i].candidates[0];
    if (first) { F.covered++; const l = lemmas.map(fold).includes(fold(first.lemma ?? '')); const p = parts.includes(first.pos ?? ''); if (l) F.lemma++; if (p) F.pos++; if (l && p) F.both++; }
    const c = await card(mode, text, t.surface, t.start);
    if (!c.lemma) continue;
    C.covered++;
    const l = lemmas.map(fold).includes(fold(c.lemma)); const p = parts.includes(c.pos ?? '');
    if (l) C.lemma++; if (p) C.pos++; if (l && p) C.both++;
    if ((c.source?.id ?? '').startsWith('morphgnt')) C.koine++;
    if (c.confidence < 0.5) C.low++;
    if (!(l && p)) wrong.push(`${t.surface}: card ${c.lemma}/${c.pos} “${(c.gloss ?? '').slice(0, 20)}” [${(c.source?.id ?? '').replace('-tables', '').replace('-sblgnt', '')}] — wanted ${lemmas[0]}/${parts.join('|')}${first && first.lemma !== c.lemma ? ` (analyser's first reading: ${first.lemma}/${first.pos})` : ''}`);
  }
}
const pct = (x: number) => `${x} (${(100 * x / counted).toFixed(1)} %)`;
console.log(`[${mode}] counted ${counted}`);
console.log(`analyser's first reading (what docs/greek/MODERN-AUDIT.md measured): covered ${pct(F.covered)}, lemma ${pct(F.lemma)}, part of speech ${pct(F.pos)}, both ${pct(F.both)}`);
console.log(`the card (highest confidence):                                     covered ${pct(C.covered)}, lemma ${pct(C.lemma)}, part of speech ${pct(C.pos)}, both ${pct(C.both)}; shown from MorphGNT ${pct(C.koine)}; confidence under 0.5 ${pct(C.low)}`);
console.log(wrong.join('\n'));
