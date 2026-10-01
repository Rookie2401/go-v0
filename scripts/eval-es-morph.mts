/// <reference types="node" />
/**
 * npm run es:eval-morph -- --split dev|test [--in <kaikki file>] [--sample N] [--show N]
 *
 * How do the Spanish adapter's readings of single word forms compare with the dictionary's own statements about
 * inflected forms ("hablamos: first-person plural present indicative of hablar")? The dictionary source is
 * Wiktionary via kaikki.org: written by people, not by this project, and not consulted when the rules were written.
 *
 * Three questions, each on forms taken one at a time (no sentence, so nothing here measures the context rules):
 *   A. Word-list lemmas — for every inflected form the dictionary lists for a lemma that is in the course word list:
 *      does the adapter give that lemma (recall), with features that do not contradict the dictionary's labels
 *      (feature agreement)? And of the confident readings the adapter gives for those forms, how many does the
 *      dictionary not list at all (unsupported: over-generation, or a gap in the dictionary)?
 *   B. Other lemmas — for forms of lemmas outside the word list: is the dictionary's lemma among the rule's guesses?
 *      (That decides whether a dictionary-decided word keeps the rule's detailed features.)
 *   C. First reading — where the dictionary lists exactly one lemma for a form, is it the adapter's first reading?
 *
 * Held-out discipline: lemmas are split in two by a hash; `dev` may be looked at and tuned on, `test` is reported as
 * it comes. `--show` (examples of failures) is refused for `test`.
 * Reads the .jsonl or .jsonl.gz; downloads nothing; writes nothing.
 */
import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { createAdapterRegistry } from '../src/adapters';
import { esLexicon } from '../src/adapters/es';
import type { AnalysisCandidate, PartOfSpeech, RawToken } from '../src/core';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt = (k: string): string | undefined => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const split = opt('split');
if (split !== 'dev' && split !== 'test') { console.error('usage: npm run es:eval-morph -- --split dev|test [--in <file>] [--sample N] [--show N]'); process.exit(1); }
const show = Number(opt('show') ?? 0);
if (show > 0 && split === 'test') { console.error('--show is refused for the held-out split: its failures are not to be looked at'); process.exit(1); }
const sample = Math.max(1, Number(opt('sample') ?? 1));
const candidatesIn = [opt('in'), 'data/dictionaries/kaikki.org-dictionary-Spanish.jsonl', 'data/dictionaries/kaikki.org-dictionary-Spanish.jsonl.gz'].filter((f): f is string => !!f);
const file = candidatesIn.find((f) => existsSync(f));
if (!file) { console.error(`cannot read the dictionary file (tried ${candidatesIn.join(', ')})`); process.exit(1); }

const es = createAdapterRegistry().get('es');
const norm = (s: string) => es.normalize(s);
const POS: Record<string, PartOfSpeech> = { verb: 'VERB', noun: 'NOUN', adj: 'ADJ' };
const compatible = (a: PartOfSpeech | undefined, b: PartOfSpeech): boolean => a === b || (b === 'VERB' && a === 'AUX');
/** FNV-1a, for a stable split that does not depend on file order. */
const hash = (s: string): number => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
const inSplit = (lemma: string): boolean => (hash(lemma) % 2 === 0) === (split === 'dev');

interface Relation { form: string; lemma: string; pos: PartOfSpeech; tags: string[] }
const relations: Relation[] = [];
/** form → the (lemma|pos) pairs the dictionary lists for it, inflected or as a headword. */
const listed = new Map<string, Set<string>>();
const addListed = (form: string, lemma: string, pos: PartOfSpeech) => { const s = listed.get(form) ?? new Set<string>(); s.add(`${lemma}|${pos}`); listed.set(form, s); };
let lines = 0;

const input = file.endsWith('.gz') ? createReadStream(file).pipe(createGunzip()) : createReadStream(file, 'utf8');
for await (const line of createInterface({ input })) {
  if (!line.trim()) continue;
  lines++;
  let e: { word?: unknown; pos?: unknown; lang_code?: unknown; senses?: unknown };
  try { e = JSON.parse(line); } catch { continue; }
  if (e.lang_code !== 'es' || typeof e.word !== 'string' || /\s/.test(e.word)) continue;
  const pos = POS[String(e.pos)];
  if (!pos) continue;
  const form = norm(e.word);
  let headword = false;
  for (const s of Array.isArray(e.senses) ? e.senses as Array<{ form_of?: unknown; tags?: unknown; glosses?: unknown }> : []) {
    const of = Array.isArray(s.form_of) ? s.form_of as Array<{ word?: unknown }> : [];
    const tags = Array.isArray(s.tags) ? (s.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [];
    if (of.length) {
      for (const f of of) {
        if (typeof f.word !== 'string' || /\s/.test(f.word)) continue;
        const lemma = norm(f.word);
        relations.push({ form, lemma, pos, tags });
        addListed(form, lemma, pos);
      }
    } else if (Array.isArray(s.glosses) && s.glosses.length) headword = true;
  }
  if (headword) addListed(form, form, pos);
}

const analyse = (form: string): AnalysisCandidate[] => {
  const t: RawToken = { surface: form, start: 0, end: form.length, isWord: true, normalized: form };
  return es.analyze([t])[0].candidates;
};
const cache = new Map<string, AnalysisCandidate[]>();
const readings = (form: string): AnalysisCandidate[] => { let c = cache.get(form); if (!c) { c = analyse(form); cache.set(form, c); } return c; };
const agrees = (morph: Record<string, string>, want: Record<string, string>): boolean =>
  Object.entries(want).every(([k, v]) => morph[k] === undefined || morph[k].split(',').some((x) => v.split(',').includes(x)));
const inWordList = (lemma: string, pos: PartOfSpeech): boolean => !!esLexicon.find(lemma, pos) || (pos === 'VERB' && !!esLexicon.find(lemma, 'AUX'));

const A = { relations: 0, lemma: 0, withFeatures: 0, features: 0, forms: 0, confident: 0, unsupported: 0 };
const B = { relations: 0, guessed: 0, withFeatures: 0, features: 0, nothing: 0 };
const C = { forms: 0, first: 0, among: 0 };
const byPosA: Record<string, { n: number; lemma: number; feat: number; featN: number }> = {};
const missA: string[] = [], featA: string[] = [], unsupA: string[] = [], missB: string[] = [], firstC: string[] = [];
const seenFormsA = new Set<string>();
const keep = (list: string[], s: string) => { if (list.length < show) list.push(s); };

for (const r of relations) {
  if (!inSplit(r.lemma)) continue;
  if (hash(`${r.form}|${r.lemma}`) % sample !== 0) continue;
  const cands = readings(r.form);
  const want = es.morphFromTags ? es.morphFromTags(r.tags) : {};
  const hasFeatures = Object.keys(want).length > 0;
  const same = cands.filter((c) => c.lemma !== undefined && norm(c.lemma) === r.lemma && compatible(c.pos, r.pos));
  if (inWordList(r.lemma, r.pos)) {
    A.relations++;
    const p = (byPosA[r.pos] ??= { n: 0, lemma: 0, feat: 0, featN: 0 });
    p.n++;
    if (same.length) { A.lemma++; p.lemma++; } else keep(missA, `${r.form} → ${r.lemma}/${r.pos} [${r.tags.join(' ')}]   got: ${cands.slice(0, 3).map((c) => `${c.lemma}/${c.pos}`).join(', ') || 'nothing'}`);
    if (hasFeatures && same.length) {
      A.withFeatures++; p.featN++;
      if (same.some((c) => agrees(c.morph, want))) { A.features++; p.feat++; } else keep(featA, `${r.form} → ${r.lemma} [${r.tags.join(' ')}] wants ${JSON.stringify(want)}   got: ${same.slice(0, 3).map((c) => JSON.stringify(c.morph)).join(' | ')}`);
    }
    if (!seenFormsA.has(r.form)) {
      seenFormsA.add(r.form);
      A.forms++;
      for (const c of cands) {
        if (c.unconfirmed || c.notes?.lemmaStatus === 'inferred by the rules' || !c.lemma || !c.pos || !['VERB', 'AUX', 'NOUN', 'ADJ'].includes(c.pos)) continue;
        A.confident++;
        const pos = c.pos === 'AUX' ? 'VERB' : c.pos;
        const ok = listed.get(r.form)?.has(`${norm(c.lemma)}|${pos}`);
        if (!ok) { A.unsupported++; keep(unsupA, `${r.form}: the adapter reads ${c.lemma}/${c.pos} ${JSON.stringify(c.morph)} (${c.notes?.rule ?? c.origin ?? ''}); the dictionary lists ${[...(listed.get(r.form) ?? [])].join(', ')}`); }
      }
    }
  } else {
    B.relations++;
    if (!cands.length) B.nothing++;
    if (same.length) B.guessed++; else keep(missB, `${r.form} → ${r.lemma}/${r.pos} [${r.tags.join(' ')}]   guesses: ${cands.slice(0, 4).map((c) => `${c.lemma}/${c.pos}`).join(', ') || 'nothing'}`);
    if (hasFeatures && same.length) { B.withFeatures++; if (same.some((c) => agrees(c.morph, want))) B.features++; }
  }
}
// C: forms with exactly one (lemma, pos) in the dictionary, lemma in the word list
for (const [form, set] of listed) {
  if (set.size !== 1) continue;
  const [lemma, pos] = [...set][0].split('|') as [string, PartOfSpeech];
  if (!inSplit(lemma) || !inWordList(lemma, pos) || hash(form) % sample !== 0) continue;
  const cands = readings(form);
  C.forms++;
  const first = cands[0];
  if (first?.lemma !== undefined && norm(first.lemma) === lemma && compatible(first.pos, pos)) C.first++;
  else keep(firstC, `${form}: dictionary ${lemma}/${pos}; adapter first ${first ? `${first.lemma}/${first.pos}` : 'nothing'}; all: ${cands.slice(0, 4).map((c) => `${c.lemma}/${c.pos}`).join(', ')}`);
  if (cands.some((c) => c.lemma !== undefined && norm(c.lemma) === lemma && compatible(c.pos, pos))) C.among++;
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(2)} %` : 'n/a');
console.log(`es:eval-morph - split ${split}${sample > 1 ? `, 1 in ${sample}` : ''}; ${file}; ${lines} lines, ${relations.length} form-of relations (verb, noun, adjective; single words), adapter ${es.version}`);
console.log(`A. forms of word-list lemmas: ${A.relations} relations`);
console.log(`   the dictionary's lemma is among the adapter's readings:    ${A.lemma} (${pct(A.lemma, A.relations)})`);
console.log(`   features do not contradict the dictionary's labels:        ${A.features} of ${A.withFeatures} with readable labels (${pct(A.features, A.withFeatures)})`);
for (const [p, v] of Object.entries(byPosA)) console.log(`     ${p}: lemma ${pct(v.lemma, v.n)} of ${v.n}; features ${pct(v.feat, v.featN)} of ${v.featN}`);
console.log(`   confident readings the dictionary does not list:           ${A.unsupported} of ${A.confident} on ${A.forms} forms (${pct(A.unsupported, A.confident)})`);
console.log(`B. forms of other lemmas: ${B.relations} relations`);
console.log(`   the dictionary's lemma is among the rule's guesses:        ${B.guessed} (${pct(B.guessed, B.relations)}); no reading at all: ${B.nothing}`);
console.log(`   features do not contradict, where the lemma was guessed:   ${B.features} of ${B.withFeatures} (${pct(B.features, B.withFeatures)})`);
console.log(`C. forms with one dictionary reading (word-list lemma): ${C.forms}`);
console.log(`   it is the adapter's first reading:                         ${C.first} (${pct(C.first, C.forms)}); among its readings: ${C.among} (${pct(C.among, C.forms)})`);
if (show > 0) {
  const block = (title: string, list: string[]) => { if (list.length) { console.log(`\n${title}`); for (const s of list) console.log(`  ${s}`); } };
  block('A: lemma not found', missA);
  block('A: features contradict', featA);
  block('A: confident readings the dictionary does not list', unsupA);
  block('B: lemma not among the guesses', missB);
  block('C: not the first reading', firstC);
}
