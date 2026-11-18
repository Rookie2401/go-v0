// "All forms" tables the Spanish adapter generates, as the card would list them (no dictionary table exists for es to merge with).
import { esAdapter } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/es';
const want: Array<[string, string]> = [['dar', 'VERB'], ['ir', 'VERB'], ['ver', 'VERB'], ['reír', 'VERB'], ['sonreír', 'VERB'], ['freír', 'VERB'], ['oír', 'VERB'], ['huir', 'VERB'], ['sentarse', 'VERB'], ['llover', 'VERB'], ['soler', 'VERB'], ['colar', 'VERB'], ['erguir', 'VERB'], ['rehacer', 'VERB'], ['marrón', 'ADJ'], ['cortés', 'ADJ'], ['guay', 'ADJ'], ['joven', 'ADJ'], ['taxi', 'NOUN'], ['espíritu', 'NOUN'], ['régimen', 'NOUN'], ['carácter', 'NOUN'], ['club', 'NOUN'], ['lunes', 'NOUN'], ['crisis', 'NOUN'], ['niño', 'NOUN'], ['yo', 'PRON'], ['este', 'DET']];
for (const [lemma, pos] of want) {
  const p: any = (esAdapter as any).paradigm(lemma, pos);
  if (!p) { console.log(`\n== ${lemma} ${pos}: NO TABLE`); continue; }
  console.log(`\n== ${lemma} ${pos} == template: ${p.template}`);
  const key = (c: any) => Object.entries(c.features).map(([k, v]) => `${String(k).slice(0, 1)}=${v}`).join(',');
  const cells = p.cells as any[];
  const show = pos === 'VERB' ? cells.filter((c) => c.features.VerbForm !== 'Fin' || (c.features.Mood === 'Ind' && c.features.Tense === 'Pres') || c.features.Mood === 'Imp' || (c.features.Mood === 'Sub' && c.features.Tense === 'Pres') || (c.features.Mood === 'Ind' && c.features.Tense === 'Past')) : cells;
  console.log('  ' + show.map((c) => `${key(c)}: ${c.form}${c.note ? ` (${c.note})` : ''}`).join(' | '));
  console.log('  notes: ' + (p.notes ?? []).join(' || ').slice(0, 900));
}
