// "All forms" tables the Albanian adapter generates, as the card would list them.
import { sqParadigm } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/albanian/paradigm';
const want: Array<[string, string]> = [
  ['i mirë', 'ADJ'], ['i serioz', 'ADJ'], ['sallatë', 'NOUN'], ['kek', 'NOUN'], ['lot', 'NOUN'], ['grua', 'NOUN'], ['blej', 'VERB'], ['dua', 'VERB'], ['bie', 'VERB'], ['nxjerr', 'VERB'], ['lë', 'VERB'], ['ai', 'PRON'], ['im', 'DET'], ['arrestoj', 'VERB'], ['Agim', 'PROPN'],
];
for (const [lemma, pos] of want) {
  const p: any = sqParadigm(lemma, pos as any);
  if (!p) { console.log(`\n== ${lemma} ${pos}: NO TABLE`); continue; }
  console.log(`\n== ${lemma} ${pos} == keys ${JSON.stringify(Object.keys(p))} cells ${(p.cells ?? []).length}`);
  console.log('  ' + (p.cells ?? []).map((c: any) => `${Object.values(c.features ?? {}).join('.')}: ${c.form}${c.note ? ` (${c.note})` : ''}`).join(' | ').slice(0, 2600));
  console.log('  notes: ' + (p.notes ?? []).join(' || '));
  if (p.constructions) console.log('  constructions: ' + JSON.stringify(p.constructions).slice(0, 600));
}
