// "All forms" tables the adapter generates, as the card would list them (before the dictionary table is merged in).
import { norwegianParadigm } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/norwegian/paradigm';
const want: Array<[string, string, string]> = [
  ['nb', 'kalle', 'VERB'], ['nb', 'se', 'VERB'], ['nb', 'spørre', 'VERB'], ['nb', 'synes', 'VERB'], ['nb', 'stor', 'ADJ'], ['nb', 'liten', 'ADJ'], ['nb', 'morsom', 'ADJ'],
  ['nb', 'bok', 'NOUN'], ['nb', 'hus', 'NOUN'], ['nb', 'jeg', 'PRON'], ['nb', 'min', 'DET'],
  ['nn', 'tenkje', 'VERB'], ['nn', 'kome', 'VERB'], ['nn', 'vanleg', 'ADJ'], ['nn', 'bok', 'NOUN'], ['nn', 'eg', 'PRON'],
];
for (const [std, lemma, pos] of want) {
  const p: any = norwegianParadigm(std as any, lemma, pos as any);
  if (!p) { console.log(`${std} ${lemma} ${pos}: NO TABLE`); continue; }
  console.log(`\n== ${std} ${lemma} ${pos} == ${JSON.stringify(Object.keys(p))}`);
  const secs = p.sections ?? [{ title: '', cells: p.cells }];
  for (const s of secs) console.log(`  [${s.title ?? s.label ?? ''}] ` + (s.cells ?? []).map((c: any) => `${c.label ?? Object.entries(c.features ?? {}).map(([k, v]) => `${k}=${v}`).join(' ')}: ${c.form}${c.note ? ` (${c.note})` : ''}`).join(' | '));
  console.log('  notes: ' + (p.notes ?? []).join(' || '));
}
