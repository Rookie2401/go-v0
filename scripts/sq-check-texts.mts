/// <reference types="node" />
/**
 * npm run sq:check-texts -- [--dir data/corpus/sq] [--analyzer]
 *
 * Do the course's own Albanian texts use only forms that the sources know — and do the sources agree about them?
 * For every word of every course-written Albanian document:
 *   - the adapter's word-form engine must have a reading whose lemma its own lists hold (not a guess, not a respelling);
 *   - with --analyzer, the UniParser Albanian analyzer (offline, optional) must recognise the form too, and at least
 *     one of the adapter's readings must have the analyzer's lemma.
 *   - no form may have only readings the sources dispute (src/adapters/albanian/disputed.ts, from npm run sq:agreement).
 * A word that fails is printed with its sentence. Exit 1 when any word fails: a text with such a word is not ready
 * to be shown to a reviewer, let alone to a learner. This checks FORMS; it cannot judge whether a sentence is natural.
 * The one way past a failure is a row in data/review/sq/accepted-differences.json, written by a person, saying what
 * each source states; such forms are named on every run and the reader goes on showing them as uncertain.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeSqForm } from '../src/adapters/albanian/morphology';
import { sqNormalize } from '../src/adapters/albanian/orthography';
import { makeWordTokenizer } from '../src/adapters/shared';
import { SQ_DISPUTED } from '../src/adapters/albanian/disputed';
import { sameCitation } from '../src/bench/sq/aliases';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt = (k: string): string | undefined => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const dir = opt('dir') ?? 'data/corpus/sq';
const useAnalyzer = args.includes('--analyzer');
const tokenize = makeWordTokenizer({ locale: 'sq', normalize: sqNormalize });

interface Occ { doc: string; sentence: string; surface: string; form: string }
const occ: Occ[] = [];
let docs = 0;
for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as { id: string; contentType?: string; source?: { rights?: string }; sections?: Array<{ paragraphs?: Array<{ sentences?: Array<{ text: string }> }> }> };
  if (d.contentType === 'scripture' || !['owner-authored', 'generated'].includes(String(d.source?.rights))) continue;
  docs++;
  for (const s of d.sections ?? []) for (const p of s.paragraphs ?? []) for (const x of p.sentences ?? []) {
    for (const t of tokenize(x.text)) if (t.isWord) occ.push({ doc: d.id, sentence: x.text, surface: t.surface, form: t.normalized });
  }
}

const forms = [...new Set(occ.map((o) => o.form))].sort();
const problems = new Map<string, string>();
for (const f of forms) {
  const rs = analyzeSqForm(f);
  if (!rs.length) problems.set(f, 'the adapter has no reading');
  else if (!rs.some((r) => r.lemmaKnown)) problems.set(f, `the adapter only guesses (${rs.map((r) => r.lemma).join(', ')})`);
  else if (rs.every((r) => r.relation)) problems.set(f, `not Standard spelling as written (read as ${rs[0].relation!.standard})`);
  // the recorded comparison (data/review/sq/analyzer-check.json): a form all of whose known readings are disputed
  else if (rs.filter((r) => r.lemmaKnown).every((r) => SQ_DISPUTED.has(`${f}\t${sqNormalize(r.lemma)}`))) problems.set(f, `the sources dispute every reading of this form (${[...new Set(rs.map((r) => r.lemma))].join(', ')}): see data/review/sq/source-agreement.json`);
}

let analyzerNote = 'the UniParser analyzer was not consulted (run with --analyzer)';
if (useAnalyzer) {
  const PY = 'data/private/venv-sq/Scripts/python.exe';
  if (!fs.existsSync(PY)) { console.error(`the analyzer is not installed (${PY})`); process.exit(1); }
  fs.mkdirSync('data/private/sq', { recursive: true });
  const src = `data/private/sq/texts.${process.pid}.txt`;
  const dst = `data/private/sq/texts.${process.pid}.jsonl`;
  fs.writeFileSync(src, `${forms.join('\n')}\n`, 'utf8');
  const r = spawnSync(PY, ['scripts/external/uniparser_sq_analyze.py', src, dst], { encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) { console.error('the analyzer run failed'); process.exit(1); }
  let unknown = 0, otherLemma = 0;
  for (const line of fs.readFileSync(dst, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as { form: string; analyses: Array<{ lemma: string }> };
    if (/'/.test(row.form)) continue; // the analyzer does not read apostrophe forms as one token
    const ours = analyzeSqForm(row.form).filter((x) => x.lemmaKnown);
    const theirs = new Set(row.analyses.map((a) => sqNormalize(a.lemma)));
    const stem = (l: string) => sqNormalize(l).replace(/h?em$/u, '');
    const agree = ours.some((o) => [...theirs].some((t) => sameCitation(sqNormalize(o.lemma), t) || t.replace(/j$/u, '') === stem(o.lemma)) || (o.parts?.length ?? 0) > 0 || o.pos === 'PROPN');
    if (!row.analyses.length) { if (!ours.some((o) => o.pos === 'PROPN')) { unknown++; if (!problems.has(row.form)) problems.set(row.form, 'the UniParser analyzer does not recognise this form'); } }
    else if (ours.length && !agree) { otherLemma++; if (!problems.has(row.form)) problems.set(row.form, `the sources differ: the adapter reads ${[...new Set(ours.map((o) => o.lemma))].join(', ')}, the analyzer ${[...theirs].slice(0, 4).join(', ')}`); }
  }
  fs.rmSync(src, { force: true });
  fs.rmSync(dst, { force: true });
  analyzerNote = `UniParser analyzer consulted: ${unknown} form(s) it does not recognise, ${otherLemma} read under another lemma`;
}

// forms a person has accepted in course texts although the sources differ: recorded, named on every run, never silent
const ACCEPTED = 'data/review/sq/accepted-differences.json';
const accepted = new Map<string, string>();
if (fs.existsSync(ACCEPTED)) {
  const file = JSON.parse(fs.readFileSync(ACCEPTED, 'utf8')) as { forms?: Array<{ form: string; status?: string }> };
  for (const f of file.forms ?? []) accepted.set(sqNormalize(f.form), f.status ?? 'recorded');
}
const open = [...problems].filter(([form]) => !accepted.has(form));
const waived = [...problems].filter(([form]) => accepted.has(form));

console.log(`sq:check-texts - ${docs} course-written document(s) in ${dir}; ${occ.length} words, ${forms.length} distinct forms; ${analyzerNote}`);
const line = (form: string, why: string) => {
  const first = occ.find((o) => o.form === form)!;
  const n = occ.filter((o) => o.form === form).length;
  console.log(`  ${form} (${n}×): ${why}\n      ${first.doc}: ${first.sentence}`);
};
if (waived.length) {
  console.log(`${waived.length} form(s) are used although the sources differ about them (recorded in ${ACCEPTED}; the reader still shows them as uncertain):`);
  for (const [form, why] of waived) line(form, `${why} — ${accepted.get(form)}`);
}
if (open.length === 0) {
  console.log(waived.length ? 'every other word form is known to the sources consulted, and they agree on a lemma for it' : 'every word form is known to the sources consulted, and they agree on a lemma for it');
  process.exit(0);
}
for (const [form, why] of open) line(form, why);
console.log(`${open.length} form(s) need attention`);
process.exit(1);
