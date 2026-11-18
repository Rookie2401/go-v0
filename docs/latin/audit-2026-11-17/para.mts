// "All forms" tables the Latin adapter generates, as the card would list them (there is no dictionary table for Latin to merge in).
import { latinParadigm } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/latin/paradigm';
import { loadLatinLexicon } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/latin/lexicon-load';
await loadLatinLexicon();
const want = process.argv.slice(2).map((x) => x.split(':'));
for (const [lemma, pos, mode] of want) {
  const p: any = latinParadigm(lemma, pos as any);
  if (!p) { console.log(`\n== ${lemma} ${pos}: NO TABLE`); continue; }
  console.log(`\n== ${lemma} ${pos} == ${p.kind} | ${p.template}`);
  const groups = new Map<string, string[]>();
  for (const c of p.cells as any[]) {
    const f = c.features;
    const sec = [f.VerbForm, f.Mood, f.Voice, f.Tense, f.Degree, f.Number && (pos === 'ADJ' || pos === 'PRON' || pos === 'DET' || pos === 'NUM') ? f.Number : '', f.VerbForm ? '' : ''].filter(Boolean).join(' ');
    const lab = pos === 'VERB' || pos === 'AUX' ? `${f.Person ?? ''}${f.Number ? f.Number[0].toLowerCase() : ''}${f.Case ? f.Case : ''}` : `${f.Case ?? ''}${pos === 'NOUN' || pos === 'PROPN' ? (f.Number ? f.Number[0].toLowerCase() : '') : ''}${f.Gender ? f.Gender[0].toLowerCase() : ''}${f.Person ?? ''}`;
    const g = groups.get(sec) ?? [];
    g.push(`${lab}=${c.form}${c.note ? (c.note.startsWith('a variant') ? '~' : c.note.startsWith('a contracted') ? '^' : c.note.startsWith('two words') ? '' : `(${c.note.slice(0, 20)})`) : ''}`);
    groups.set(sec, g);
  }
  for (const [sec, list] of groups) { if (mode === 'short' && /Sub|Pqp|FutPerf|Imp Pass|Fut Pass/.test(sec)) continue; console.log(`  [${sec}] ${list.join(' ')}`); }
  console.log('  notes: ' + (p.notes ?? []).join(' || ').slice(0, 400));
}
