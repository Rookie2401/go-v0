/// <reference types="node" />
/**
 * npm run authoring:report -- --lang sq [--out <file.md>] [--stages <json file or inline map slug→stage>]
 *
 * The recurrence report of a language's own controlled texts (owner-authored or generated, not Scripture), in reading
 * order (stage, work, chapter, id): which words come back, in how many texts and forms, which were met once, which are
 * drilled. Reads the bundled documents; changes nothing. A guide for the people who write the texts, not a gate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdapterRegistry } from '../src/adapters';
import { analyseCorpus, NO_STAGE } from '../src/authoring/analyse';
import { parseArgs, resolveStageOf } from '../src/authoring/cli';
import { recurrenceReport, renderRecurrenceMarkdown } from '../src/authoring/recurrence';
import { selectCourseTexts } from '../src/authoring/select';
import { loadBundledCorpus } from '../src/ingest';

const { flags } = parseArgs(process.argv.slice(2));
const lang = flags.lang;
if (!lang) {
  console.error('usage: npm run authoring:report -- --lang <code> [--out <file.md>] [--stages <json file or inline {"slug":"stage"}>]');
  process.exit(2);
}

const { stageOf, note } = await resolveStageOf(lang, flags.stages);
const docs = selectCourseTexts(loadBundledCorpus(), lang, stageOf);
const adapter = createAdapterRegistry().get(lang as never);
const analysis = analyseCorpus(docs, adapter, { stageOf });
const report = recurrenceReport(analysis);

const count = (flag: string): number => report.lemmas.filter((l) => l.flags.includes(flag as never)).length;
console.log(`authoring report — ${lang}: ${docs.length} course-written text(s), ${report.totalWords} running words, ${report.lemmas.length} distinct lemmas`);
if (note) console.log(`note: ${note}`);
const unstaged = docs.filter((d) => (stageOf(d) || NO_STAGE) === NO_STAGE).length;
if (unstaged) console.log(`note: ${unstaged} text(s) have no stage ('?'): check --stages or the course catalogue`);
console.log('');
console.log('stage  texts  words  sentences  lemmas  new  cumulative  guesses  unread');
for (const s of report.stages) {
  console.log([s.stage.padEnd(5), String(s.documents).padStart(5), String(s.words).padStart(6), String(s.sentences).padStart(9), String(s.distinctLemmas).padStart(7),
    String(s.newLemmas).padStart(4), String(s.cumulativeLemmas).padStart(11), String(s.guesses).padStart(8), String(s.unread).padStart(7)].join('  '));
}
console.log('');
console.log(`lemmas met once: ${count('once')}; twice: ${count('twice')}; in one text only: ${count('single-text')}; in one form only: ${count('one-form')}; clustered: ${count('clustered')}; long gap: ${count('late-gap')}`);
console.log(`constructions: ${report.constructions.length} (met once: ${report.constructions.filter((u) => u.flags.includes('once')).length}); phrase units: ${report.phrases.length} (met once: ${report.phrases.filter((u) => u.flags.includes('once')).length})`);

if (flags.out) {
  fs.mkdirSync(path.dirname(path.resolve(flags.out)), { recursive: true });
  fs.writeFileSync(flags.out, renderRecurrenceMarkdown(report), 'utf8');
  console.log(`markdown written to ${flags.out}`);
}
