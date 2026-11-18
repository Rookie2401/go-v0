// Full card fields for a few words (gloss untruncated, notes, constructions, phrases, variants).
import fs from 'node:fs';
import { card } from 'C:/Users/CJWal/dev/tmp-mem/elaudit/setup.mts';
const lines = fs.readFileSync(process.argv[2]!, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
for (const line of lines) {
  const [v, s0, w0] = line.split('|').map((x) => x.trim());
  const s = s0.normalize('NFC'); const w = (w0 ?? s0).normalize('NFC');
  const c = await card('ext', s, w, s.indexOf(w), v !== '-' ? v : undefined);
  console.log(`\n«${w}» in "${s.slice(0, 60)}"`);
  console.log(`  lemma ${c.lemma} | pos ${c.pos} | form line: ${c.morphology} | meaning: ${c.gloss} | conf ${c.confidence} | tokens ${c.tokenCount}`);
  console.log(`  period: ${c.period?.label} (${c.period?.evidence}) — ${c.period?.basis}`);
  console.log(`  notes: ${c.notes.join(' || ')}`);
  console.log(`  constructions: ${c.constructions.map((k: any) => `${k.source}:${k.id} “${k.title}” — ${k.explanation}`).join(' || ') || 'none'} | phrases: ${c.phrases.length} | role: ${c.role ?? 'none'} | syntax: ${c.syntax ? JSON.stringify(c.syntax).slice(0, 80) : 'none'}`);
  console.log(`  item ids: ${c.itemIds.join(', ')} | words: ${(c.words ?? []).map((x: any) => `${x.surface}=${x.lemma ?? '∅'}`).join(' ')}`);
  console.log(`  alternatives: ${c.alternatives.map((a: any) => `${a.lemma}/${a.pos} “${a.gloss ?? ''}” ${a.confidence}`).join(' | ')}`);
  if (c.variants) console.log('  variants: ' + c.variants.rows.map((r: any) => `${r.label}${r.current ? ' [this text]' : ''}: ${r.status === 'attested' ? r.forms.slice(0, 4).join(', ') : 'not in our sources'}${r.note ? ` (${r.note})` : ''}`).join(' | '));
}
