/**
 * Compares every row of the French hand lexicon (lexicon-verbs/nouns/modifiers) with the kaikki.org French extract:
 *   NOT-FOUND   the lemma is not in the dictionary with that part of speech
 *   FORM-ONLY   the dictionary has the word with that part of speech, but only as an inflected form or alternative spelling
 *   GENDER      a noun whose gender the dictionary does not give (the row's gender must be among the dictionary's genders;
 *               a /mf row needs both)
 * Run:  npx vite-node --config scripts/vite.config.ts scripts/fr-check-lexicon.mts
 * Every disagreement that is not a mistake in the list goes in EXPECTED below, with the reason; anything else fails the run.
 * The function words (function-words.ts) are closed-class and are read by test/adapters/french-lexicon.test.ts instead.
 */
import fs from 'node:fs';
import readline from 'node:readline';
import { parseRows, type FrRow } from '../src/adapters/french/entries';
import { VERB_ROWS } from '../src/adapters/french/lexicon-verbs';
import { NOUN_ROWS } from '../src/adapters/french/lexicon-nouns';
import { ADJECTIVE_ROWS, ADVERB_ROWS, PROPER_ROWS } from '../src/adapters/french/lexicon-modifiers';

const DICT = 'data/dictionaries/kaikki.org-dictionary-French.jsonl';

/** Disagreements that are not mistakes in the list: "kind:lemma|POS" → why. */
const EXPECTED: Record<string, string> = {
  'FORM-ONLY:vacances|NOUN': 'a plural-only noun: the dictionary files it as the plural of vacance, but a learner meets only the plural (les vacances)',
  'FORM-ONLY:meilleur|ADJ': 'the dictionary files meilleur as the comparative of bon; learners meet it as a word of its own, and it has its own gender and number forms',
  'FORM-ONLY:pis|ADV': 'the dictionary files pis as the comparative of mal; it is kept as the word of its own that it is (tant pis, de mal en pis)',
  'ALT-ONLY:Méditerranée|PROPN': 'the dictionary files Méditerranée as an alternative form of another entry (la mer Méditerranée); the bare name is how it is written in running text',
};

const POS_MAP: Record<string, string[]> = {
  NOUN: ['noun'], VERB: ['verb'], ADJ: ['adj'], ADV: ['adv'], PROPN: ['name'],
};

const files: Array<[string, string]> = [
  ['lexicon-verbs', VERB_ROWS], ['lexicon-nouns', NOUN_ROWS], ['lexicon-modifiers:ADJ', ADJECTIVE_ROWS],
  ['lexicon-modifiers:ADV', ADVERB_ROWS], ['lexicon-modifiers:PROPN', PROPER_ROWS],
];
const rows: FrRow[] = [];
const problems: string[] = [];
for (const [label, src] of files) rows.push(...parseRows(src, label, problems));
if (problems.length) { console.error('PARSE PROBLEMS:\n' + problems.join('\n')); process.exit(1); }

const wanted = new Map<string, FrRow[]>();
for (const r of rows) {
  if (!POS_MAP[r.pos]) continue;
  const list = wanted.get(r.lemma) ?? [];
  list.push(r);
  wanted.set(r.lemma, list);
}

interface Seen { lemmaSenses: number; formSenses: number; altSenses: number; genders: Set<string> }
const seen = new Map<string, Seen>(); // key = word|dictPos

const genderOf = (o: any): string[] => {
  const out = new Set<string>();
  for (const h of o.head_templates ?? []) {
    const a = h.args ?? {};
    const g = typeof a['1'] === 'string' ? a['1'] : '';
    const m = /^(mf|fm|m|f)(?:[-?]|$)/u.exec(g);
    if (m) { if (m[1] === 'mf' || m[1] === 'fm') { out.add('m'); out.add('f'); } else out.add(m[1]); }
    else {
      const ex = String(h.expansion ?? '');
      if (/\bm or f\b|\bmf\b|\bf or m\b/u.test(ex)) { out.add('m'); out.add('f'); }
      else { if (/ m( |$|,)/u.test(ex)) out.add('m'); if (/ f( |$|,)/u.test(ex)) out.add('f'); }
    }
  }
  for (const s of o.senses ?? []) {
    for (const t of s.tags ?? []) { if (t === 'masculine') out.add('m'); if (t === 'feminine') out.add('f'); }
  }
  return [...out];
};

const rl = readline.createInterface({ input: fs.createReadStream(DICT, { encoding: 'utf8' }), crlfDelay: Infinity });
let lines = 0;
for await (const line of rl) {
  lines++;
  // the word key also occurs inside nested etymology data, so the line is parsed whole
  let o: any;
  try { o = JSON.parse(line); } catch { continue; }
  const word: string = o.word;
  if (!wanted.has(word)) continue;
  const key = `${word}|${o.pos}`;
  const s = seen.get(key) ?? { lemmaSenses: 0, formSenses: 0, altSenses: 0, genders: new Set<string>() };
  for (const sense of o.senses ?? []) {
    const tags: string[] = sense.tags ?? [];
    if (tags.includes('form-of') || sense.form_of) s.formSenses++;
    else if (tags.includes('alt-of') || sense.alt_of) s.altSenses++;
    else s.lemmaSenses++;
  }
  if (!(o.senses ?? []).length) s.lemmaSenses++;
  for (const g of genderOf(o)) s.genders.add(g);
  seen.set(key, s);
}

type Kind = 'NOT-FOUND' | 'FORM-ONLY' | 'ALT-ONLY' | 'GENDER';
const found: Array<{ kind: Kind; key: string; detail: string }> = [];
const counts: Record<string, { rows: number; bad: number }> = {};
for (const r of rows) {
  if (!POS_MAP[r.pos]) continue;
  const c = (counts[r.pos] ??= { rows: 0, bad: 0 });
  c.rows++;
  const entries = POS_MAP[r.pos].map((p) => seen.get(`${r.lemma}|${p}`)).filter((x): x is Seen => !!x);
  const key = `${r.lemma}|${r.pos}`;
  const add = (kind: Kind, detail: string) => { found.push({ kind, key, detail }); c.bad++; };
  if (!entries.length) { add('NOT-FOUND', 'no entry with this part of speech'); continue; }
  const lemma = entries.reduce((n, e) => n + e.lemmaSenses, 0);
  const alt = entries.reduce((n, e) => n + e.altSenses, 0);
  if (!lemma && alt) { add('ALT-ONLY', 'only an alternative-spelling entry'); continue; }
  if (!lemma) { add('FORM-ONLY', 'only inflected-form entries'); continue; }
  if (r.pos === 'NOUN' && r.gender) {
    const g = new Set(entries.flatMap((e) => [...e.genders]));
    const want = r.gender === 'mf' ? ['m', 'f'] : [r.gender];
    if (g.size && !want.every((w) => g.has(w))) add('GENDER', `row says ${r.gender}, dictionary says ${[...g].join('')}`);
    else if (!g.size) add('GENDER', `row says ${r.gender}, dictionary gives no gender`);
  }
}

let unexplained = 0;
const explained: string[] = [];
for (const f of found) {
  const reason = EXPECTED[`${f.kind}:${f.key}`];
  if (reason) { explained.push(`${f.kind} ${f.key}: ${reason}`); continue; }
  unexplained++;
  console.log(`${f.kind.padEnd(9)} ${f.key.padEnd(34)} ${f.detail}`);
}
const checked = Object.values(counts).reduce((n, c) => n + c.rows, 0);
console.log(`\nscanned ${lines} dictionary lines`);
for (const [pos, c] of Object.entries(counts)) console.log(`  ${pos.padEnd(6)} rows ${String(c.rows).padStart(5)}  disagreements ${c.bad}`);
console.log(`rows checked: ${checked}; disagreements: ${found.length}; explained in EXPECTED: ${explained.length}; UNEXPLAINED: ${unexplained}`);
for (const e of explained) console.log(`  expected: ${e}`);
process.exit(unexplained ? 1 : 0);
