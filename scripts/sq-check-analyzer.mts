/// <reference types="node" />
/**
 * npm run sq:check-analyzer -- [--split dev|test|all] [--show N] [--write] [--reuse]
 *
 * Do the Albanian adapter's own word list and rules agree with an independent analyzer? Every written form the word
 * list generates (and every closed-class form) is given to the UniParser Albanian analyzer (PyPI uniparser-albanian
 * 2.3.0, MIT; run offline from data/private/venv-sq through scripts/external/uniparser_sq_analyze.py), and each of
 * the adapter's readings is compared with the analyzer's analyses of the same form:
 *
 *   agree            the analyzer has the same lemma with features that do not contradict
 *   nonstandard      it agrees, but the analyzer marks every agreeing analysis as Gheg or non-standard
 *   features-differ  the same lemma, but no analysis whose features are compatible
 *   other-lemma      the analyzer knows the form only under other lemmas
 *   unknown-form     the analyzer does not recognise the form at all
 *   pos-differs      the same lemma and compatible features, filed under another part of speech (besimtar: noun here,
 *                    adjective there) — counted, not treated as a dispute
 *   name-unknown     a proper name the analyzer does not have — counted, not treated as a dispute
 *
 * Three differences of convention are not disagreements and are not counted as such:
 *   - a verb that exists only in the non-active is listed here under that form (ankohem), by the analyzer under the
 *     active (ankoj) with a non-active analysis: the lemmas are matched through their stems;
 *   - the analyzer gives the plural command (hapni!) only as the present (ju hapni): an imperative plural here agrees
 *     with its present second person plural;
 *   - a noun's bare form is "unmarked" there and nominative-or-accusative here.
 *
 * Neither side is ground truth: the word list is machine-drafted, and the analyzer's authors report about 93 % recall
 * on their corpus. A disagreement is a place for a person to look, and until one has, the adapter does not present
 * that reading as certain (see `--write`).
 *
 * `--write` regenerates the two files that carry the outcome:
 *   data/review/sq/analyzer-check.json     every disagreement, for a reviewer (nothing is decided in it)
 *   src/adapters/albanian/disputed.ts      the (form, lemma) pairs the two sources disagree on, read by the engine,
 *                                          which keeps those readings at low confidence ("possibly …")
 * Lemmas are split in two by a hash; rule fixes are made looking at `dev` only, and `--show` is refused for `test`.
 * `--reuse` skips the analyzer run and reads the last result (data/private/sq/forms.uniparser.jsonl).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SQ_FUNCTION_READINGS } from '../src/adapters/albanian/function-words';
import { sqGeneratedForms } from '../src/adapters/albanian/morphology';
import { sqNormalize } from '../src/adapters/albanian/orthography';
import { uniparserToReading, type UniparserReading } from '../src/adapters/albanian/tags';
import { sqAgree, type SqReading } from '../src/adapters/albanian/types';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt = (k: string): string | undefined => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const split = opt('split') ?? 'all';
const show = Number(opt('show') ?? 0);
if (!['dev', 'test', 'all'].includes(split)) { console.error('--split must be dev, test or all'); process.exit(1); }
if (show > 0 && split !== 'dev') { console.error('--show is allowed for --split dev only: the other half is not to be looked at while fixing rules'); process.exit(1); }

const PY = 'data/private/venv-sq/Scripts/python.exe';
const WORK = 'data/private/sq';
const FORMS = path.join(WORK, 'forms.txt');
const OUT = path.join(WORK, 'forms.uniparser.jsonl');
const hash = (s: string): number => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
const inSplit = (lemma: string): boolean => split === 'all' || (hash(lemma) % 2 === 0) === (split === 'dev');

// ── our side ──
const ours = new Map<string, SqReading[]>();
for (const [form, list] of sqGeneratedForms()) ours.set(form, [...list]);
for (const [form, list] of SQ_FUNCTION_READINGS) ours.set(form, [...(ours.get(form) ?? []), ...list]);

// ── their side ──
if (!args.includes('--reuse')) {
  if (!fs.existsSync(PY)) { console.error(`the analyzer is not installed (${PY}): it is an optional offline tool, installed only with the owner's permission`); process.exit(1); }
  fs.mkdirSync(WORK, { recursive: true });
  fs.writeFileSync(FORMS, `${[...ours.keys()].sort().join('\n')}\n`, 'utf8');
  const r = spawnSync(PY, ['scripts/external/uniparser_sq_analyze.py', FORMS, OUT], { encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) { console.error('the analyzer run failed'); process.exit(1); }
}
if (!fs.existsSync(OUT)) { console.error(`no analyzer output at ${OUT}: run without --reuse`); process.exit(1); }
const theirs = new Map<string, Array<{ lemma: string; gramm: string; reading: UniparserReading }>>();
for (const line of fs.readFileSync(OUT, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const row = JSON.parse(line) as { form: string; analyses: Array<{ lemma: string; gramm: string }> };
  theirs.set(row.form, row.analyses.map((a) => ({ lemma: sqNormalize(a.lemma), gramm: a.gramm, reading: uniparserToReading(a.gramm) })));
}

// ── compare ──
type Verdict = 'agree' | 'nonstandard' | 'features-differ' | 'other-lemma' | 'unknown-form' | 'pos-differs' | 'name-unknown';
const DISPUTE: ReadonlySet<Verdict> = new Set<Verdict>(['nonstandard', 'features-differ', 'other-lemma', 'unknown-form']);
const FEATURES = ['Case', 'Number', 'Definite', 'Gender', 'Person', 'Tense', 'Mood', 'Voice', 'VerbForm'];
const samePos = (a: string, b: string | undefined): boolean =>
  b === undefined || a === b || (a === 'AUX' && b === 'VERB') || (a === 'PROPN' && b === 'NOUN') || (['DET', 'PRON'].includes(a) && ['DET', 'PRON'].includes(b))
  || (['CONJ', 'SCONJ'].includes(a) && b === 'CONJ') || (['PART', 'ADV', 'INTJ', 'ADP', 'CONJ', 'SCONJ'].includes(a) && ['PART', 'ADV', 'INTJ', 'ADP', 'CONJ'].includes(b));
const compatible = (r: SqReading, u: UniparserReading): boolean => {
  // the plural command is the present second person plural for the analyzer
  const pluralCommand = r.morph.Mood === 'Imp' && r.morph.Number === 'Plur' && u.morph.Mood === 'Ind' && u.morph.Tense === 'Pres';
  return FEATURES.every((f) => (pluralCommand && (f === 'Mood' || f === 'Tense')) || sqAgree(r.morph[f], u.morph[f]));
};
/** ankohem (listed here) and ankoj with a non-active analysis (listed there) are the same verb. */
const deponentMatch = (r: SqReading, t: { lemma: string; reading: UniparserReading }): boolean => {
  if (!(r.pos === 'VERB' || r.pos === 'AUX') || !/(h?em)$/u.test(r.lemma) || t.reading.pos !== 'VERB') return false;
  const mine = sqNormalize(r.lemma).replace(/h?em$/u, '');
  const theirs = t.lemma.replace(/j$/u, '');
  return (mine === theirs || mine === t.lemma) && (t.reading.morph.Voice === 'Mid' || t.reading.morph.VerbForm === 'Part');
};

interface Finding { form: string; lemma: string; pos: string; verdict: Verdict; ours: string; theirs: string[] }
const findings: Finding[] = [];
const counts: Record<string, Record<Verdict, number>> = {};
const lexemes = new Map<string, { n: number; bad: number }>();
const bump = (pos: string, v: Verdict) => { ((counts[pos] ??= { agree: 0, nonstandard: 0, 'features-differ': 0, 'other-lemma': 0, 'unknown-form': 0, 'pos-differs': 0, 'name-unknown': 0 })[v])++; };
const feat = (m: Record<string, string>) => FEATURES.filter((f) => m[f]).map((f) => `${f}=${m[f]}`).join(' ');

for (const [form, list] of [...ours.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
  const them = theirs.get(form) ?? [];
  for (const r of list) {
    const lemma = sqNormalize(r.lemma);
    if (!inSplit(lemma)) continue;
    let verdict: Verdict;
    const same = them.filter((t) => (t.lemma === lemma && samePos(r.pos, t.reading.pos)) || deponentMatch(r, t));
    const otherPos = them.filter((t) => t.lemma === lemma && !samePos(r.pos, t.reading.pos) && compatible(r, t.reading));
    if (!them.length) verdict = r.pos === 'PROPN' ? 'name-unknown' : 'unknown-form';
    else if (!same.length) verdict = otherPos.length ? 'pos-differs' : 'other-lemma';
    else {
      const ok = same.filter((t) => compatible(r, t.reading));
      verdict = !ok.length ? 'features-differ' : ok.every((t) => t.reading.gheg || t.reading.nonstandard) ? 'nonstandard' : 'agree';
    }
    bump(r.pos, verdict);
    const key = `${lemma}|${r.pos}`;
    const lx = lexemes.get(key) ?? { n: 0, bad: 0 };
    lx.n++;
    if (DISPUTE.has(verdict)) {
      lx.bad++;
      findings.push({ form, lemma: r.lemma, pos: r.pos, verdict, ours: feat(r.morph) || '(no features)', theirs: (verdict === 'other-lemma' ? them : same.length ? same : them).slice(0, 6).map((t) => `${t.lemma} [${t.gramm}]`) });
    }
    lexemes.set(key, lx);
  }
}

// ── report ──
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(2)} %` : 'n/a');
const total = Object.values(counts).reduce((s, c) => s + Object.values(c).reduce((x, y) => x + y, 0), 0);
const agree = Object.values(counts).reduce((s, c) => s + c.agree, 0);
const disputed = Object.values(counts).reduce((s, c) => s + c.nonstandard + c['features-differ'] + c['other-lemma'] + c['unknown-form'], 0);
console.log(`sq:check-analyzer - split ${split}: ${ours.size} written forms; ${total} readings compared; the two sources agree on ${agree} (${pct(agree, total)}); disputed ${disputed} (${pct(disputed, total)})`);
for (const [pos, c] of Object.entries(counts).sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0))) {
  const n = Object.values(c).reduce((x, y) => x + y, 0);
  console.log(`  ${pos.padEnd(6)} ${String(n).padStart(6)} readings: agree ${pct(c.agree, n)}; non-standard for the analyzer ${c.nonstandard}; features differ ${c['features-differ']}; other lemma ${c['other-lemma']}; form unknown to it ${c['unknown-form']}${c['pos-differs'] ? `; other part of speech ${c['pos-differs']}` : ''}${c['name-unknown'] ? `; name it does not have ${c['name-unknown']}` : ''}`);
}
const clean = [...lexemes.values()].filter((l) => l.bad === 0).length;
console.log(`  lexemes: ${lexemes.size}; every reading agrees for ${clean} (${pct(clean, lexemes.size)}); ${lexemes.size - clean} have at least one disputed reading`);

if (show > 0) {
  for (const v of ['features-differ', 'other-lemma', 'unknown-form', 'nonstandard'] as Verdict[]) {
    const list = findings.filter((f) => f.verdict === v).slice(0, show);
    if (list.length) console.log(`\n${v}`);
    for (const f of list) console.log(`  ${f.form}: ours ${f.lemma}/${f.pos} ${f.ours}   analyzer: ${f.theirs.join(' | ') || '—'}`);
  }
}

if (args.includes('--write')) {
  if (split !== 'all') { console.error('--write needs --split all (the files cover every lemma, written mechanically without looking)'); process.exit(1); }
  fs.mkdirSync('data/review/sq', { recursive: true });
  const review = {
    schema: 1,
    note: 'Readings on which the Albanian word list / rules (machine-drafted) and the UniParser Albanian analyzer differ. Nothing is decided here: each is a place for a person to look. Generated by npm run sq:check-analyzer -- --write; do not edit by hand.',
    analyzer: { name: 'uniparser-albanian', version: '2.3.0', licence: 'MIT', authors: 'Maria Morozova, Alexander Rusakov, Timofey Arkhangelskiy', mode: 'strict, no disambiguation' },
    counts,
    findings,
  };
  fs.writeFileSync('data/review/sq/analyzer-check.json', `${JSON.stringify(review, null, 1)}\n`, 'utf8');
  const pairs = [...new Set(findings.map((f) => `${f.form}\t${sqNormalize(f.lemma)}`))].sort();
  const body = `/**
 * Readings the adapter's own word list and the UniParser Albanian analyzer disagree on: written form + lemma.
 * GENERATED by \`npm run sq:check-analyzer -- --write\` — do not edit by hand. The engine keeps these readings at low
 * confidence (shown as "possibly …") until a person has looked; the full record with both sides' statements is
 * data/review/sq/analyzer-check.json. ${pairs.length} pairs.
 */
export const SQ_DISPUTED: ReadonlySet<string> = new Set([
${pairs.map((p) => `  ${JSON.stringify(p)},`).join('\n')}
]);
`;
  fs.writeFileSync('src/adapters/albanian/disputed.ts', body, 'utf8');
  console.log(`\nwrote data/review/sq/analyzer-check.json (${findings.length} findings) and src/adapters/albanian/disputed.ts (${pairs.length} pairs)`);
}
