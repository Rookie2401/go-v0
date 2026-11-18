/// <reference types="node" />
/**
 * npx vite-node --config scripts/vite.config.ts scripts/fr-eval-morph.mts -- --split dev|dev2|final|test [--in <kaikki file>] [--sample N] [--show N]
 *
 * How do the French morphology engine's readings of single word forms compare with the dictionary's own statements about
 * inflected forms ("parlons: first-person plural present indicative of parler")? The dictionary source is Wiktionary via
 * kaikki.org: written by people, not by this project, and not consulted when the rules were written beyond the NAMES of its
 * labels (counted before `table-tags.ts` was written).
 *
 * The engine is called directly (`analyzeFrenchForm`), with `knownLemma` = "this is a headword of the dictionary" (the
 * dictionary stands in for the word list). Questions, each on forms taken one at a time (no sentence, so nothing here measures
 * the context rules); a form with an apostrophe or a hyphen is outside the engine's model and is counted apart:
 *   A. Known lemmas: for every inflected form the dictionary lists for a lemma that is a headword: does the engine give that
 *      lemma (recall), with features that do not contradict the dictionary's labels (feature agreement)? And of the readings the
 *      engine gives for those forms with a confirmed lemma, how many does the dictionary not list at all (unsupported:
 *      over-generation, or a gap in the dictionary)?
 *   B. Rule guesses only (`knownLemma` always false): is the dictionary's lemma among the guesses?
 *   C. Where the dictionary lists exactly one lemma for a form, is it the engine's first reading?
 *
 * Held-out discipline: lemmas are split by a hash; `dev` and `dev2` may be looked at and tuned on, `final` is reported as it
 * comes (`test` = dev2 + final). `--show` (examples of failures) is refused for `final` and `test`.
 * Reads the .jsonl or .jsonl.gz; downloads nothing; writes nothing.
 */
import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import type { PartOfSpeech } from '../src/core';
import { normalizeFr } from '../src/adapters/french/orth';
import { analyzeFrenchForm } from '../src/adapters/french/morphology';
import { frenchMorphFromTags } from '../src/adapters/french/table-tags';
import type { FrenchAnalysis } from '../src/adapters/french/types';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt = (k: string): string | undefined => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const split = opt('split');
const SPLITS = ['dev', 'dev2', 'final', 'test'];
if (!split || !SPLITS.includes(split)) { console.error('usage: fr-eval-morph.mts -- --split dev|dev2|final|test [--in <file>] [--sample N] [--show N]'); process.exit(1); }
const show = Number(opt('show') ?? 0);
if (show > 0 && (split === 'test' || split === 'final')) { console.error('--show is refused for the held-out split: its failures are not to be looked at'); process.exit(1); }
const sample = Math.max(1, Number(opt('sample') ?? 1));
const candidatesIn = [opt('in'), 'data/dictionaries/kaikki.org-dictionary-French.jsonl', 'data/dictionaries/kaikki.org-dictionary-French.jsonl.gz'].filter((f): f is string => !!f);
const file = candidatesIn.find((f) => existsSync(f));
if (!file) { console.error(`cannot read the dictionary file (tried ${candidatesIn.join(', ')})`); process.exit(1); }

const norm = (s: string) => normalizeFr(s);
const POS: Record<string, PartOfSpeech> = { verb: 'VERB', noun: 'NOUN', adj: 'ADJ' };
const compatible = (a: PartOfSpeech | undefined, b: PartOfSpeech): boolean => a === b || (b === 'VERB' && a === 'AUX');
/** FNV-1a, for a stable split that does not depend on file order. */
const hash = (s: string): number => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
/** For SAMPLING, the hash is mixed first (the low bits of FNV-1a of "lemma|form" follow the low bits of the lemma's own hash, which the split is made from). */
const mixed = (s: string): number => { let h = hash(s); h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
/** dev = even hash; the odd half is divided again by the next bit: `dev2` for diagnosis, `final` never looked at; `test` = both. */
const inSplit = (lemma: string): boolean => {
  const h = hash(lemma);
  if (split === 'dev') return h % 2 === 0;
  if (h % 2 === 0) return false;
  if (split === 'test') return true;
  return ((h >>> 1) % 2 === 0) === (split === 'dev2');
};

interface Relation { form: string; lemma: string; pos: PartOfSpeech; tags: string[] }
const relations: Relation[] = [];
/** form → the (lemma|pos) pairs the dictionary lists for it, inflected or as a headword. */
const listed = new Map<string, Set<string>>();
const addListed = (form: string, lemma: string, pos: PartOfSpeech) => { const s = listed.get(form) ?? new Set<string>(); s.add(`${lemma}|${pos}`); listed.set(form, s); };
const headwords: Record<PartOfSpeech, Set<string>> = { VERB: new Set(), NOUN: new Set(), ADJ: new Set() } as Record<PartOfSpeech, Set<string>>;
let lines = 0;
let outside = 0;

let truncated = '';
const input = file.endsWith('.gz') ? createReadStream(file).pipe(createGunzip()) : createReadStream(file, 'utf8');
try {
  for await (const line of createInterface({ input })) {
    if (!line.trim()) continue;
    lines++;
    let e: { word?: unknown; pos?: unknown; lang_code?: unknown; senses?: unknown };
    try { e = JSON.parse(line); } catch { continue; }
    if (e.lang_code !== 'fr' || typeof e.word !== 'string' || /\s/.test(e.word)) continue;
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
          addListed(form, lemma, pos);
          // the engine models a plain written word: a form or a lemma with an apostrophe or a hyphen is outside it
          if (/['-]/.test(form) || /['-]/.test(lemma)) { outside++; continue; }
          relations.push({ form, lemma, pos, tags });
        }
      } else if (Array.isArray(s.glosses) && s.glosses.length) headword = true;
    }
    if (headword) { addListed(form, form, pos); headwords[pos].add(form); }
  }
} catch (err) {
  if (!args.includes('--allow-truncated')) { console.error(`the dictionary file could not be read to its end: ${err instanceof Error ? err.message : String(err)}`); process.exit(1); }
  truncated = ' (THE FILE ENDED EARLY: figures are for the part read)';
}

const knownReal = (lemma: string, pos?: PartOfSpeech): boolean => {
  if (!pos) return headwords.VERB.has(lemma) || headwords.NOUN.has(lemma) || headwords.ADJ.has(lemma);
  if (pos === 'AUX') return headwords.VERB.has(lemma);
  return headwords[pos]?.has(lemma) ?? false;
};
const knownNone = (): boolean => false;
/**
 * The lemmas that answer a relation. The dictionary files a participle as a form of its verb AND an adjective or verb
 * entry of its own (flambés → flambé → flamber), so a lemma that is no headword but is itself listed as a form of another
 * (same part of speech) stands for that other too.
 */
const acceptable = (lemma: string, pos: PartOfSpeech): string[] => {
  const out = new Set([lemma]);
  let frontier = [lemma];
  for (let depth = 0; depth < 3 && frontier.length; depth++) {
    const next: string[] = [];
    for (const l of frontier) {
      if (headwords[pos]?.has(l)) continue;
      for (const x of listed.get(l) ?? []) {
        const [ml, mp] = x.split('|');
        if (mp === pos && ml !== l && !out.has(ml)) { out.add(ml); next.push(ml); }
      }
    }
    frontier = next;
  }
  return [...out];
};
const cacheReal = new Map<string, FrenchAnalysis[]>();
const cacheNone = new Map<string, FrenchAnalysis[]>();
const readingsReal = (form: string): FrenchAnalysis[] => { let c = cacheReal.get(form); if (!c) { c = analyzeFrenchForm(form, { knownLemma: knownReal }); cacheReal.set(form, c); } return c; };
const readingsNone = (form: string): FrenchAnalysis[] => { let c = cacheNone.get(form); if (!c) { c = analyzeFrenchForm(form, { knownLemma: knownNone }); cacheNone.set(form, c); } return c; };
const agrees = (morph: Record<string, string>, want: Record<string, string>): boolean =>
  Object.entries(want).every(([k, v]) => morph[k] === undefined || morph[k].split(',').some((x) => v.split(',').includes(x)));
/** The tense / mood bucket of a verb relation, from the dictionary's own labels. */
const bucket = (want: Record<string, string>): string => {
  if (want.VerbForm === 'Inf') return 'infinitive';
  if (want.VerbForm === 'Part') return want.Tense === 'Pres' ? 'participe présent' : 'participe passé';
  if (want.Mood === 'Imp') return 'impératif';
  if (want.Mood === 'Cnd') return 'conditionnel';
  const m = want.Mood ?? '?';
  const t = want.Tense ?? '?';
  const name: Record<string, string> = { 'Ind|Pres': 'indicatif présent', 'Ind|Imp': 'imparfait', 'Ind|Past': 'passé simple', 'Ind|Fut': 'futur', 'Sub|Pres': 'subjonctif présent', 'Sub|Imp': 'subjonctif imparfait' };
  return name[`${m}|${t}`] ?? `${m}/${t}`;
};

const A = { relations: 0, lemma: 0, withFeatures: 0, features: 0, forms: 0, confident: 0, unsupported: 0 };
const B = { relations: 0, guessed: 0, withFeatures: 0, features: 0, nothing: 0 };
const C = { forms: 0, first: 0, among: 0 };
const byPosA: Record<string, { n: number; lemma: number; feat: number; featN: number }> = {};
const byPosB: Record<string, { n: number; guessed: number }> = {};
const byBucketA: Record<string, { n: number; lemma: number; feat: number; featN: number }> = {};
const missA: string[] = [], featA: string[] = [], unsupA: string[] = [], missB: string[] = [], firstC: string[] = [];
const seenFormsA = new Set<string>();
const keep = (list: string[], s: string) => { if (list.length < show) list.push(s); };

for (const r of relations) {
  if (!inSplit(r.lemma)) continue;
  if (mixed(`${r.form}|${r.lemma}`) % sample !== 0) continue;
  const want = frenchMorphFromTags(r.tags);
  const hasFeatures = Object.keys(want).length > 0;
  const acc = acceptable(r.lemma, r.pos);
  {
    // B: every relation, the engine without the word list
    const cands = readingsNone(r.form);
    const same = cands.filter((c) => acc.includes(norm(c.lemma)) && compatible(c.pos, r.pos));
    B.relations++;
    const p = (byPosB[r.pos] ??= { n: 0, guessed: 0 });
    p.n++;
    if (!cands.length) B.nothing++;
    if (same.length) { B.guessed++; p.guessed++; } else keep(missB, `${r.form} → ${r.lemma}/${r.pos} [${r.tags.join(' ')}]   guesses: ${cands.slice(0, 4).map((c) => `${c.lemma}/${c.pos}`).join(', ') || 'nothing'}`);
    if (hasFeatures && same.length) { B.withFeatures++; if (same.some((c) => agrees(c.morph, want))) B.features++; }
  }
  if (acc.some((l) => knownReal(l, r.pos))) {
    const cands = readingsReal(r.form);
    const same = cands.filter((c) => acc.includes(norm(c.lemma)) && compatible(c.pos, r.pos));
    A.relations++;
    const p = (byPosA[r.pos] ??= { n: 0, lemma: 0, feat: 0, featN: 0 });
    const b = r.pos === 'VERB' ? (byBucketA[bucket(want)] ??= { n: 0, lemma: 0, feat: 0, featN: 0 }) : undefined;
    p.n++; if (b) b.n++;
    if (same.length) { A.lemma++; p.lemma++; if (b) b.lemma++; } else keep(missA, `${r.form} → ${r.lemma}/${r.pos} [${r.tags.join(' ')}]   got: ${cands.slice(0, 3).map((c) => `${c.lemma}/${c.pos}`).join(', ') || 'nothing'}`);
    if (hasFeatures && same.length) {
      A.withFeatures++; p.featN++; if (b) b.featN++;
      if (same.some((c) => agrees(c.morph, want))) { A.features++; p.feat++; if (b) b.feat++; } else keep(featA, `${r.form} → ${r.lemma} [${r.tags.join(' ')}] wants ${JSON.stringify(want)}   got: ${same.slice(0, 3).map((c) => JSON.stringify(c.morph)).join(' | ')}`);
    }
    if (!seenFormsA.has(r.form)) {
      seenFormsA.add(r.form);
      A.forms++;
      for (const c of cands) {
        if (!c.lemmaKnown || !['VERB', 'AUX', 'NOUN', 'ADJ'].includes(c.pos)) continue;
        A.confident++;
        const pos = c.pos === 'AUX' ? 'VERB' : c.pos;
        if (!listed.get(r.form)?.has(`${norm(c.lemma)}|${pos}`)) { A.unsupported++; keep(unsupA, `${r.form}: the engine reads ${c.lemma}/${c.pos} ${JSON.stringify(c.morph)} (${c.rule}); the dictionary lists ${[...(listed.get(r.form) ?? [])].join(', ')}`); }
      }
    }
  }
}
// C: forms with exactly one (lemma, pos) in the dictionary, lemma a headword
for (const [form, set] of listed) {
  if (set.size !== 1 || /['-]/.test(form)) continue;
  const [lemma, pos] = [...set][0].split('|') as [string, PartOfSpeech];
  if (!inSplit(lemma) || !knownReal(lemma, pos) || mixed(form) % sample !== 0) continue;
  const cands = readingsReal(form);
  C.forms++;
  const first = cands[0];
  if (first && norm(first.lemma) === lemma && compatible(first.pos, pos)) C.first++;
  else keep(firstC, `${form}: dictionary ${lemma}/${pos}; engine first ${first ? `${first.lemma}/${first.pos}` : 'nothing'}; all: ${cands.slice(0, 4).map((c) => `${c.lemma}/${c.pos}`).join(', ')}`);
  if (cands.some((c) => norm(c.lemma) === lemma && compatible(c.pos, pos))) C.among++;
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(2)} %` : 'n/a');
console.log(`fr-eval-morph - split ${split}${sample > 1 ? `, 1 in ${sample}` : ''}; ${file}${truncated}; ${lines} lines, ${relations.length} form-of relations (verb, noun, adjective; single plain words; ${outside} with an apostrophe or hyphen left out)`);
console.log(`A. forms of headword lemmas (knownLemma = the dictionary's headwords): ${A.relations} relations`);
console.log(`   the dictionary's lemma is among the engine's readings:      ${A.lemma} (${pct(A.lemma, A.relations)})`);
console.log(`   features do not contradict the dictionary's labels:         ${A.features} of ${A.withFeatures} with readable labels (${pct(A.features, A.withFeatures)}); contradiction ${pct(A.withFeatures - A.features, A.withFeatures)}`);
for (const [p, v] of Object.entries(byPosA)) console.log(`     ${p}: lemma ${pct(v.lemma, v.n)} of ${v.n}; features ${pct(v.feat, v.featN)} of ${v.featN}`);
console.log('   verbs by tense and mood (lemma recall; feature agreement):');
for (const [k, v] of Object.entries(byBucketA).sort((x, y) => y[1].n - x[1].n)) console.log(`     ${k.padEnd(20)} ${pct(v.lemma, v.n).padStart(9)} of ${String(v.n).padStart(7)}; features ${pct(v.feat, v.featN).padStart(9)}`);
console.log(`   confirmed readings the dictionary does not list:            ${A.unsupported} of ${A.confident} on ${A.forms} forms (${pct(A.unsupported, A.confident)})`);
console.log(`B. every relation, rule guesses only (knownLemma always false): ${B.relations} relations`);
console.log(`   the dictionary's lemma is among the rule's guesses:         ${B.guessed} (${pct(B.guessed, B.relations)}); no reading at all: ${B.nothing}`);
for (const [p, v] of Object.entries(byPosB)) console.log(`     ${p}: ${pct(v.guessed, v.n)} of ${v.n}`);
console.log(`   features do not contradict, where the lemma was guessed:    ${B.features} of ${B.withFeatures} (${pct(B.features, B.withFeatures)})`);
console.log(`C. forms with one dictionary reading (headword lemma): ${C.forms}`);
console.log(`   it is the engine's first reading:                           ${C.first} (${pct(C.first, C.forms)}); among its readings: ${C.among} (${pct(C.among, C.forms)})`);
if (show > 0) {
  const block = (title: string, list: string[]) => { if (list.length) { console.log(`\n${title}`); for (const s of list) console.log(`  ${s}`); } };
  block('A: lemma not found', missA);
  block('A: features contradict', featA);
  block('A: confirmed readings the dictionary does not list', unsupA);
  block('B: lemma not among the guesses', missB);
  block('C: not the first reading', firstC);
}
