/**
 * Consistency check of the French fixtures against the kaikki.org French extract (Wiktionary, CC BY-SA 4.0; read only).
 *
 *   npx vite-node --config scripts/vite.config.ts scripts/fr-fixtures-check.mts [-- --show-ok] [--strict]
 *
 * For every fixture whose `source` is kaikki or grammar and whose target is one word, it looks the normalised target up in
 * the extract (a line of its own, or an entry's `forms` list) and reports: whether some line gives the expected lemma for
 * that form (form_of / alt_of, or the word is its own lemma), whether that lemma has the expected part of speech, and
 * whether the extract's labels contradict a listed feature. It reads the fixtures and the extract only, never the adapter.
 */
import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { normalizeFr } from '../src/adapters/french/orth';
import { loadFixtures, type FixtureCase } from '../src/bench/fr/fixtures';

const ROOT = join(import.meta.dirname ?? '.', '..');
const EXTRACT = join(ROOT, 'data/dictionaries/kaikki.org-dictionary-French.jsonl');
const FIXTURES = join(ROOT, 'data/benchmarks/fr/fixtures');
const args = process.argv.slice(2);
const showOk = args.includes('--show-ok');
const strict = args.includes('--strict');

interface Line { word: string; pos: string; lemmas: string[]; tags: string[]; via: 'line' | 'forms' }

const POS_MAP: Record<string, string[]> = {
  NOUN: ['noun'], PROPN: ['name', 'noun'], VERB: ['verb'], AUX: ['verb'], ADJ: ['adj', 'verb'], ADV: ['adv'],
  PRON: ['pron'], DET: ['det', 'article', 'num'], ADP: ['prep', 'contraction', 'adv'], CONJ: ['conj'], SCONJ: ['conj'],
  PART: ['particle', 'adv'], NUM: ['num'], INTJ: ['intj'],
};

type FeatMap = Record<string, Set<string>>;
function tagFeatures(tags: string[]): FeatMap {
  const f: FeatMap = {};
  const add = (k: string, v: string) => (f[k] ??= new Set()).add(v);
  const has = (t: string) => tags.includes(t);
  if (has('first-person')) add('Person', '1');
  if (has('second-person')) add('Person', '2');
  if (has('third-person')) add('Person', '3');
  if (has('singular')) add('Number', 'Sing');
  if (has('plural')) add('Number', 'Plur');
  if (has('masculine')) add('Gender', 'Masc');
  if (has('feminine')) add('Gender', 'Fem');
  if (has('indicative')) add('Mood', 'Ind');
  if (has('subjunctive')) add('Mood', 'Sub');
  if (has('conditional')) add('Mood', 'Cnd');
  if (has('imperative')) add('Mood', 'Imp');
  if (has('infinitive')) add('VerbForm', 'Inf');
  if (has('participle')) add('VerbForm', 'Part');
  if (has('indicative') || has('subjunctive') || has('conditional') || has('imperative')) add('VerbForm', 'Fin');
  if (has('imperfect')) add('Tense', 'Imp');
  if (has('future')) add('Tense', 'Fut');
  if (has('historic') || has('past-historic') || (has('past') && has('participle'))) add('Tense', 'Past');
  if (has('present')) add('Tense', 'Pres');
  if (has('possessive')) add('Poss', 'Yes');
  return f;
}

const cases: Array<{ file: string; c: FixtureCase; key: string }> = [];
for (const f of loadFixtures(FIXTURES)) for (const c of f.cases) {
  if (c.source === 'ud') continue;
  if (/\s/.test(c.target)) continue;
  cases.push({ file: f.category, c, key: normalizeFr(c.target) });
}
/** The extract lists a participle only in its masculine singular (arrivé, écrit, mort); an agreeing form is looked up through it. */
const participleBases = (key: string): string[] => [...new Set([key.replace(/es$/, ''), key.replace(/s$/, ''), key.replace(/e$/, ''), key.replace(/(?<=[éiu])es$/, ''), key.replace(/(?<=[éiu])e$/, '')])].filter((b) => b !== key && b.length >= 2);
const wanted = new Set(cases.map((x) => x.key));
const isParticipleCase = (c: FixtureCase): boolean => c.expect.pos === 'VERB' && (c.expect.features?.VerbForm === 'Part' || (!!c.expect.features && ('Gender' in c.expect.features || 'Number' in c.expect.features) && !('Tense' in c.expect.features) && !('Person' in c.expect.features)));
for (const { c, key } of cases) if (isParticipleCase(c)) for (const b of participleBases(key)) wanted.add(b);
const index = new Map<string, Line[]>();
const push = (k: string, l: Line) => { const a = index.get(k); if (a) a.push(l); else index.set(k, [l]); };

if (!existsSync(EXTRACT)) { console.error(`The extract is not on disk: ${EXTRACT}`); process.exit(2); }

const rl = createInterface({ input: createReadStream(EXTRACT, { encoding: 'utf8' }), crlfDelay: Infinity });
for await (const raw of rl) {
  if (!raw) continue;
  let o: any;
  try { o = JSON.parse(raw); } catch { continue; }
  const word = normalizeFr(String(o.word ?? ''));
  const pos = String(o.pos ?? '');
  if (wanted.has(word)) {
    for (const s of o.senses ?? []) {
      const lemmas = [...(s.form_of ?? []), ...(s.alt_of ?? [])].map((x: any) => normalizeFr(String(x.word)));
      push(word, { word, pos, lemmas: lemmas.length ? lemmas : [word], tags: s.tags ?? [], via: 'line' });
    }
  }
  for (const fm of o.forms ?? []) {
    const k = normalizeFr(String(fm.form ?? ''));
    if (wanted.has(k) && k !== word) push(k, { word: k, pos, lemmas: [word], tags: fm.tags ?? [], via: 'forms' });
  }
}

const counts = { confirmed: 0, viaBase: 0, lemmaOnlyPos: 0, notFound: 0, contradicted: 0, skipped: 0 };
const problems: string[] = [];
const unlabelled = new Map<string, number>();

for (const { c, key } of cases) {
  const e = c.expect;
  const lines = index.get(key) ?? [];
  if (e.lemma === undefined && e.pos === undefined) { counts.skipped++; continue; }
  const accepted = new Set<string>([...(e.pos ? [e.pos] : []), ...(c.alsoAcceptPos ?? [])]);
  const okKaikkiPos = new Set<string>([...accepted].flatMap((p) => POS_MAP[p] ?? []));
  const wantLemma = e.lemma === undefined ? undefined : normalizeFr(e.lemma);
  let lemmaLines = wantLemma === undefined ? lines : lines.filter((l) => l.lemmas.includes(wantLemma));
  const header = `${c.id} ${JSON.stringify(c.target)} → ${e.lemma ?? '(no lemma)'} ${e.pos ?? ''}`;
  if (!lemmaLines.some((l) => l.tags.includes('participle')) && isParticipleCase(c) && wantLemma !== undefined) {
    // an agreeing participle form: confirm the lemma through the masculine singular participle line, and note it
    const viaBase = participleBases(key).flatMap((b) => index.get(b) ?? []).filter((l) => l.lemmas.includes(wantLemma) && l.tags.includes('participle'));
    if (viaBase.length) {
      counts.viaBase++;
      const gl = Object.entries(e.features ?? {}).filter(([k]) => k === 'Gender' || k === 'Number').map(([k, v]) => `${k}=${v}`).join(' ');
      if (showOk) console.log(`ok (via masc. sing. participle ${viaBase[0]!.word}; ${gl} agreement is grammar, not listed) ${header}`);
      continue;
    }
  }
  if (!lemmaLines.length) {
    counts.notFound++;
    problems.push(`NOT FOUND   ${header}\n             extract has: ${lines.length ? [...new Set(lines.map((l) => `${l.pos}:${l.lemmas.join('/')}`))].join(', ') : 'no line for this form'}`);
    continue;
  }
  const posLines = okKaikkiPos.size ? lemmaLines.filter((l) => okKaikkiPos.has(l.pos)) : lemmaLines;
  if (!posLines.length) {
    counts.lemmaOnlyPos++;
    problems.push(`POS NOT LISTED ${header}\n             lines for this lemma: ${[...new Set(lemmaLines.map((l) => l.pos))].join(', ')}`);
    continue;
  }
  const contradictions: string[] = [];
  for (const [k, v] of Object.entries(e.features ?? {})) {
    if (k === 'Tense' && e.features?.Mood === 'Cnd') continue; // contract: conditionnel = Mood Cnd + Tense Pres
    const labelled = posLines.map((l) => tagFeatures(l.tags)).filter((m) => m[k]);
    const wants = v.split(',');
    if (!labelled.length) { unlabelled.set(k, (unlabelled.get(k) ?? 0) + 1); continue; }
    const supported = labelled.some((m) => wants.every((w) => m[k]!.has(w)));
    if (!supported) contradictions.push(`${k}=${v} (extract labels: ${[...new Set(labelled.flatMap((m) => [...m[k]!]))].join(',')})`);
  }
  if (contradictions.length) {
    counts.contradicted++;
    problems.push(`CONTRADICTED ${header}\n             ${contradictions.join('; ')}\n             tags: ${posLines.map((l) => l.tags.join(',')).join(' | ')}`);
    continue;
  }
  counts.confirmed++;
  if (showOk) console.log(`ok          ${header}`);
}

const checked = counts.confirmed + counts.viaBase + counts.lemmaOnlyPos + counts.notFound + counts.contradicted;
console.log(`French fixtures against the kaikki extract: ${cases.length} cases with a one-word target and source grammar or kaikki`);
console.log(`  confirmed (lemma, part of speech, no label contradicts a listed feature): ${counts.confirmed}`);
console.log(`  confirmed through the masculine singular participle (agreement forms are not lines): ${counts.viaBase}`);
console.log(`  lemma found, part of speech not listed for it:                          ${counts.lemmaOnlyPos}`);
console.log(`  no line gives the expected lemma for the form:                         ${counts.notFound}`);
console.log(`  a feature contradicted by the labels:                                  ${counts.contradicted}`);
console.log(`  skipped (nothing lemma-bearing to look up, e.g. tokens-only):          ${counts.skipped}`);
console.log(`  checked: ${checked}`);
if (unlabelled.size) console.log(`  features the extract does not label (not checkable here): ${[...unlabelled].map(([k, n]) => `${k}×${n}`).join(', ')}`);
if (problems.length) { console.log('\n' + problems.join('\n')); }
if (strict && problems.length) process.exit(1);
