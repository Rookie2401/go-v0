/// <reference types="node" />
/**
 * npm run authoring:check -- --lang sq [--budgets '{"0":150,"1":350}'] [--stages <json file or inline map>]
 *
 * The lexical budget and morphology checks of a language's own controlled texts, and the authoring state of each.
 * Exit 1 when there is any 'error' finding (unread token, over-budget stage). Writes nothing: it never adds a tag or a
 * status to a document (a person, or `npm run corpus:review`, does that). The ceilings are a way of writing the course
 * texts, never a gate on the learner.
 */
import { createAdapterRegistry } from '../src/adapters';
import { analyseCorpus } from '../src/authoring/analyse';
import { checkBudget } from '../src/authoring/budget';
import { parseArgs, resolveStageOf } from '../src/authoring/cli';
import { selectCourseTexts } from '../src/authoring/select';
import { authoringState, mayShowToLearners } from '../src/authoring/states';
import { loadBundledCorpus } from '../src/ingest';

const { flags } = parseArgs(process.argv.slice(2));
const lang = flags.lang;
if (!lang) {
  console.error('usage: npm run authoring:check -- --lang <code> [--budgets \'{"0":150,"1":350}\'] [--stages <json file or inline map>]');
  process.exit(2);
}
let budgets: Record<string, number> = {};
if (flags.budgets) {
  try {
    const parsed: unknown = JSON.parse(flags.budgets);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) || Object.values(parsed).some((v) => typeof v !== 'number')) throw new Error('not a map stage → number');
    budgets = parsed as Record<string, number>;
  } catch (e) {
    console.error(`--budgets must be a JSON map of stage → cumulative lemma ceiling (${e instanceof Error ? e.message : String(e)})`);
    process.exit(2);
  }
}

const { stageOf, note } = await resolveStageOf(lang, flags.stages);
const docs = selectCourseTexts(loadBundledCorpus(), lang, stageOf);
const adapter = createAdapterRegistry().get(lang as never);
const analysis = analyseCorpus(docs, adapter, { stageOf });
const result = checkBudget(analysis, budgets);

console.log(`authoring check — ${lang}: ${docs.length} course-written text(s), ${analysis.totalWords} running words`);
if (note) console.log(`note: ${note}`);
console.log(result.counted);
if (Object.keys(budgets).length === 0) console.log('no --budgets given: only the per-text and morphology checks ran');
console.log('');
console.log('stage  ceiling  cumulative  new');
for (const s of result.stages) console.log(`${s.stage.padEnd(5)}  ${String(s.ceiling ?? '–').padStart(7)}  ${String(s.cumulative).padStart(10)}  ${String(s.newLemmas).padStart(3)}`);
console.log('');

for (const f of result.findings) console.log(`${f.severity === 'error' ? 'ERROR' : 'warn '} [${f.kind}] ${f.message}`);
console.log(`${result.errors} error(s), ${result.warnings} warning(s)`);
console.log('');

console.log('states:');
for (const d of docs) {
  const st = authoringState(d);
  console.log(`  ${d.id}: ${st.state}${mayShowToLearners(st.state) ? '' : ' (preview only)'}${st.problem ? ` — PROBLEM: ${st.problem}` : ''}`);
  // a stage-level error (over-budget) counts against every text of that stage
  const stage = analysis.docs.find((x) => x.id === d.id)?.stage;
  const hasError = result.findings.some((f) => f.severity === 'error' && (f.docId === d.id || (f.docId === undefined && f.stage === stage)));
  if (st.state === 'DRAFT' && !hasError) console.log(`    would be AUTO_VALIDATED: ${d.id} passes the automatic checks (a person may mark it auto-validated)`);
}
process.exit(result.errors > 0 ? 1 : 0);
