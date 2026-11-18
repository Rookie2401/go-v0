// "All forms" tables the Hindi adapter generates, as the card would list them (there is no dictionary table for hi to merge in).
import { hiAdapter } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hi';
const want: Array<[string, string]> = [
  ['लड़का', 'NOUN'], ['घर', 'NOUN'], ['लड़की', 'NOUN'], ['किताब', 'NOUN'], ['माता', 'NOUN'], ['चिड़िया', 'NOUN'], ['क्रिया', 'NOUN'], ['दुनिया', 'NOUN'], ['कलीसिया', 'NOUN'],
  ['भाई', 'NOUN'], ['मिठाई', 'NOUN'], ['चंद्रमा', 'NOUN'], ['ख़ुदा', 'NOUN'], ['सिनेमा', 'NOUN'], ['माँ', 'NOUN'], ['हार', 'NOUN'], ['पिता', 'NOUN'], ['कुआँ', 'NOUN'], ['रेडियो', 'NOUN'],
  ['करना', 'VERB'], ['जाना', 'VERB'], ['होना', 'AUX'], ['पीना', 'VERB'], ['जीना', 'VERB'], ['सकना', 'AUX'], ['देना', 'VERB'], ['छूना', 'VERB'], ['चाहिए', 'AUX'],
  ['अच्छा', 'ADJ'], ['सुंदर', 'ADJ'], ['इकट्ठा', 'ADJ'], ['नया', 'ADJ'], ['दायाँ', 'ADJ'], ['पाँचवाँ', 'ADJ'],
  ['मैं', 'PRON'], ['वह', 'PRON'], ['कौन', 'PRON'], ['कोई', 'PRON'], ['आप', 'PRON'], ['मेरा', 'DET'], ['अपना', 'DET'], ['का', 'ADP'],
];
for (const [lemma, pos] of want) {
  let p: any;
  try { p = (hiAdapter as any).paradigm(lemma, pos, undefined); } catch (e) { console.log(`${lemma} ${pos}: THROW ${(e as Error).message}`); continue; }
  if (!p) { console.log(`\n== ${lemma} ${pos}: NO TABLE`); continue; }
  console.log(`\n== ${lemma} ${pos} == kind=${p.kind} template=${p.template ?? ''}`);
  const cells = p.cells ?? [];
  console.log('  ' + cells.map((c: any) => `${Object.values(c.features ?? {}).join('.')}: ${c.form}${c.note ? ` (${c.note})` : ''}`).join(' | '));
  if (p.constructions?.length) console.log('  constructions: ' + JSON.stringify(p.constructions).slice(0, 600));
  console.log('  notes: ' + (p.notes ?? []).join(' || '));
}
