/**
 * Plain-text lines for a `CompareResult` (used by `scripts/sq-eval-ud.mts`, tested on its own).
 * Percentages always come with their counts.
 */
import { COMPARED_FEATURES, pct, type CompareResult, type Rate } from './compare';

const rate = (r: Rate): string => `${pct(r)} (${r.n}/${r.of})`;

export function formatReport(res: CompareResult, opts: { tableSize?: number } = {}): string[] {
  const size = opts.tableSize ?? 20;
  const t = res.tokens;
  const out: string[] = [];
  const line = (s = ''): void => { out.push(s); };

  line(`split ${res.split}: ${res.sentences} of ${res.sentencesTotal} sentences`);
  line('');
  line('TOKENS (punctuation and numerals excluded on both sides)');
  line(`  sentences tokenized exactly   ${rate(t.sentencesExact)}`);
  line(`  treebank tokens ${t.treebankTokens}, adapter word tokens ${t.adapterTokens}, same offsets ${t.matched}`);
  line(`  boundary precision            ${rate(t.precision)}`);
  line(`  boundary recall               ${rate(t.recall)}`);
  line(`  boundary F1                   ${(100 * t.f1).toFixed(1)}%`);

  const mw = res.multiword;
  line('');
  line(`MULTIWORD TOKENS (${mw.total} in the treebank; every rate is out of all of them)`);
  line(`  one adapter token             ${rate(mw.oneToken)}`);
  line(`  ... first reading has parts, same number   ${rate(mw.partsFirst)}`);
  line(`  ... any reading has parts, same number     ${rate(mw.partsAny)}`);
  line(`  ... components' lemmas equal, first        ${rate(mw.lemmasFirst)}`);
  line(`  ... components' lemmas equal, any          ${rate(mw.lemmasAny)}`);
  if (res.tablesWithheld) line('  (forms table withheld for the held-out split)');
  else if (mw.table.length) {
    line(`  most frequent forms (${Math.min(size, mw.table.length)} of ${mw.table.length}): form  count  one-token  parts  lemmas  | what the adapter said`);
    for (const r of mw.table.slice(0, size)) {
      line(`    ${r.form}  ${r.count}  ${r.oneToken}  ${r.partsFirst}  ${r.lemmasFirst}  | ${r.said.slice(0, 3).map((s) => `${s.what} x${s.count}`).join('; ')}`);
    }
  }

  const w = res.words;
  line('');
  line(`WORDS where the boundaries agree: ${w.aligned} (of which multiword tokens, read through their first component: ${w.alignedMultiword})`);
  line('  part of speech');
  line(`    strict, first reading       ${rate(w.pos.first)}`);
  line(`    strict, any reading         ${rate(w.pos.any)}`);
  line(`    lenient, first reading      ${rate(w.pos.firstLenient)}   (AUX/VERB and CCONJ/CONJ/SCONJ counted as agreeing)`);
  line(`    lenient, any reading        ${rate(w.pos.anyLenient)}`);
  if (w.pos.confusion.length) {
    line('    disagreements, first reading (treebank -> adapter):');
    for (const c of w.pos.confusion.slice(0, size)) line(`      ${c.gold} -> ${c.adapter}  ${c.count}${c.kind === 'tolerated' ? '  (tolerated pair)' : ''}`);
  }
  line('  lemma (equal after normalization; the lemma conventions of a treebank and of the adapter may differ: this is not "correct")');
  line(`    equal, first reading        ${rate(w.lemma.first)}`);
  line(`    equal, any reading          ${rate(w.lemma.any)}`);
  if (res.tablesWithheld) line('    (differing pairs withheld for the held-out split)');
  else if (w.lemma.disagreements.length) {
    line(`    most frequent differing pairs, first reading (treebank -> adapter), ${Math.min(size, w.lemma.disagreements.length)} of ${w.lemma.disagreements.length}:`);
    for (const d of w.lemma.disagreements.slice(0, size)) line(`      ${d.gold} -> ${d.adapter}  ${d.count}`);
  }
  line('  features, where both sides state the feature (values that intersect do not contradict)');
  for (const f of COMPARED_FEATURES) {
    const r = w.features[f];
    line(`    ${f.padEnd(9)} first ${rate(r.first)}   any ${rate(r.any)}`);
  }

  const c = res.coverage;
  line('');
  line(`COVERAGE of the adapter's ${c.words} word tokens`);
  line(`  no reading                    ${rate({ n: c.none, of: c.words })}`);
  line(`  only unconfirmed readings     ${rate({ n: c.onlyUnconfirmed, of: c.words })}`);
  line(`  a confident reading           ${rate({ n: c.confident, of: c.words })}`);

  if (res.examples.length) {
    line('');
    line('EXAMPLES (dev split only)');
    for (const e of res.examples) line(`  [${e.kind}] ${e.sentId}: ${e.text}\n      ${e.detail}`);
  }
  return out;
}
