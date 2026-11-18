import { germanParadigm } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/german/paradigm';
for (const [l, p] of [['unterhalten', 'VERB'], ['viel', 'ADJ'], ['Tee', 'NOUN'], ['spannend', 'ADJ']] as const) {
  const t: any = germanParadigm(l, p as any);
  if (!t) { console.log(l, 'NO TABLE'); continue; }
  console.log(`== ${l}: ${t.cells.length} cells; ` + t.cells.filter((c: any) => /ünter|viler|mehrer|Teees|dester/.test(c.form)).map((c: any) => `${Object.values(c.features).join('.')}=${c.form}`).slice(0, 8).join(' | '));
  console.log('  notes: ' + (t.notes ?? []).join(' || ').slice(0, 700));
}
