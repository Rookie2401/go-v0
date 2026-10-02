/// <reference types="node" />
/**
 * Probe: what does the Albanian word-form engine say about these written forms, read alone?
 * Run: npx vite-node scripts/probe-sq.mts -- libri librin ma "t'i" eshte asht   (no arguments: index statistics)
 */
import { analyzeSqForm, sqGeneratedForms, sqIndexProblems, SQ_LEXEMES } from '../src/adapters/albanian/morphology';
import { sqNormalize } from '../src/adapters/albanian/orthography';

const forms = process.argv.slice(2).filter((a) => a !== '--');
if (!forms.length) {
  const index = sqGeneratedForms();
  let readings = 0;
  for (const list of index.values()) readings += list.length;
  const byPos = SQ_LEXEMES.reduce<Record<string, number>>((m, l) => { m[l.pos] = (m[l.pos] ?? 0) + 1; return m; }, {});
  console.log(`word list: ${SQ_LEXEMES.length} lexemes ${JSON.stringify(byPos)}; ${index.size} generated forms, ${readings} readings`);
  const problems = sqIndexProblems();
  console.log(problems.length ? `could not generate: ${problems.join(' | ')}` : 'every lexeme generated its forms');
}
for (const f of forms) {
  const out = analyzeSqForm(sqNormalize(f));
  console.log(`${f}: ${out.length} reading${out.length === 1 ? '' : 's'}`);
  for (const r of out) {
    console.log(`   ${r.lemma}/${r.pos} ${r.confidence}${r.lemmaKnown ? '' : ' (guess)'} ${JSON.stringify(r.morph)}${r.parts ? ` parts: ${r.parts.map((p) => `${p.text}=${p.lemma ?? '?'}`).join(' + ')}` : ''}${r.relation ? ` ← ${r.relation.standard} [${r.relation.period}]` : ''}${r.articulated ? ' [articulated]' : ''} — ${r.rule}`);
  }
}
