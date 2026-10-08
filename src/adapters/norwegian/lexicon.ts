/**
 * The Norwegian lexicon index: turns the hand-written rows into one map from written form to readings, per standard.
 * MACHINE-DRAFTED data, not checked against Norsk ordbank or by a native speaker (see types.ts).
 *
 * Every reading carries a rule text ("Bokmål noun bok, definite singular in -a"), the lemma's gloss and a confidence of
 * 0.9; readings of the same form are ordered closed classes first, then verbs, nouns, adjectives, so that context can
 * reorder them. Duplicate rows (the same lemma listed twice) are merged, never doubled.
 */
import type { PartOfSpeech } from '../../core';
import { NB_FUNCTION_FORMS } from './lexicon-function-nb';
import { NN_FUNCTION_FORMS } from './lexicon-function-nn';
import { NB_NOUNS_1 } from './lexicon-nouns-nb-1';
import { NB_NOUNS_2 } from './lexicon-nouns-nb-2';
import { NB_NOUNS_3, NB_NAMES } from './lexicon-nouns-nb-3';
import { NB_NOUNS_4 } from './lexicon-nouns-nb-4';
import { NN_NOUNS, NN_NAMES } from './lexicon-nouns-nn';
import { NB_VERBS } from './lexicon-verbs-nb';
import { NN_VERBS } from './lexicon-verbs-nn';
import { NB_ADJECTIVES } from './lexicon-adjectives-nb';
import { NN_ADJECTIVES } from './lexicon-adjectives-nn';
import { parseAdjectiveRows } from './adjectives';
import { parseNameRows, parseNounRows } from './nouns';
import { parseVerbRows } from './verbs';
import type { NoAdjective, NoNoun, NoReading, NoStandard, NoVerb, NoWordForm } from './types';

export interface NoLexicon {
  readonly std: NoStandard;
  readonly nouns: readonly NoNoun[];
  readonly verbs: readonly NoVerb[];
  readonly adjectives: readonly NoAdjective[];
  readonly words: readonly NoWordForm[];
  /** Readings of a normalized (lower-case NFC) written form, best first. */
  lookup(form: string): NoReading[];
  has(form: string): boolean;
  /** Entries with this lemma (any part of speech), as {pos, gloss, gender?}. */
  entriesOf(lemma: string): Array<{ pos: PartOfSpeech; gloss: string; gender?: string }>;
  hasLemma(lemma: string, pos?: PartOfSpeech): boolean;
  noun(lemma: string): NoNoun | undefined;
  verb(lemma: string): NoVerb | undefined;
  adjective(lemma: string): NoAdjective | undefined;
  /** Every written form of a lemma (any part of speech unless given). */
  formsOf(lemma: string, pos?: PartOfSpeech): string[];
  stats: { nouns: number; verbs: number; adjectives: number; words: number; forms: number; names: number };
}

const ORDER_FUNCTION = 0;
const ORDER_VERB = 100000;
const ORDER_NOUN = 200000;
const ORDER_ADJ = 300000;

const lc = (s: string): string => s.normalize('NFC').toLocaleLowerCase('nb');

function dedupe<T extends { lemma: string }>(list: T[], key: (x: T) => string, merge?: (a: T, b: T) => void): T[] {
  const seen = new Map<string, T>();
  for (const x of list) {
    const k = key(x);
    const prev = seen.get(k);
    if (prev) { merge?.(prev, x); continue; }
    seen.set(k, x);
  }
  return [...seen.values()];
}

const GENDER_NAME = { m: 'Masc', f: 'Fem', n: 'Neut' } as const;

function build(std: NoStandard): NoLexicon {
  const stdName = std === 'nb' ? 'Bokmål' : 'Nynorsk';
  const words: NoWordForm[] = std === 'nb' ? [...NB_FUNCTION_FORMS] : [...NN_FUNCTION_FORMS];
  const rawNouns = std === 'nb' ? [NB_NOUNS_1, NB_NOUNS_2, NB_NOUNS_3, NB_NOUNS_4].flatMap((s) => parseNounRows(s, 'nb')) : parseNounRows(NN_NOUNS, 'nn');
  const nouns = dedupe(rawNouns, (n) => `${n.lemma}|${n.gender}`, (a, b) => { if (!a.gloss.includes(b.gloss)) a.gloss += `; ${b.gloss}`; });
  const names = parseNameRows(std === 'nb' ? NB_NAMES : NN_NAMES);
  const verbs = dedupe(parseVerbRows(std === 'nb' ? NB_VERBS : NN_VERBS, std), (v) => v.lemma);
  const adjectives = dedupe(parseAdjectiveRows(std === 'nb' ? NB_ADJECTIVES : NN_ADJECTIVES, std), (a) => a.lemma);

  const byForm = new Map<string, NoReading[]>();
  const seen = new Set<string>();
  const add = (form: string, r: NoReading): void => {
    const key = lc(form);
    const sig = `${key}|${r.lemma}|${r.pos}|${JSON.stringify(r.morph)}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    const list = byForm.get(key) ?? [];
    list.push(r);
    byForm.set(key, list);
  };
  const lemmaEntries = new Map<string, Array<{ pos: PartOfSpeech; gloss: string; gender?: string }>>();
  const noteLemma = (lemma: string, pos: PartOfSpeech, gloss: string, gender?: string): void => {
    const list = lemmaEntries.get(lemma) ?? [];
    if (!list.some((e) => e.pos === pos && e.gender === gender)) list.push({ pos, gloss, gender });
    lemmaEntries.set(lemma, list);
  };
  const lemmaForms = new Map<string, Map<PartOfSpeech, Set<string>>>();
  const noteForm = (lemma: string, pos: PartOfSpeech, form: string): void => {
    const byPos = lemmaForms.get(lemma) ?? new Map<PartOfSpeech, Set<string>>();
    const set = byPos.get(pos) ?? new Set<string>();
    set.add(lc(form));
    byPos.set(pos, set);
    lemmaForms.set(lemma, byPos);
  };

  // closed classes and plain words
  words.forEach((w, i) => {
    add(w.form, {
      lemma: w.lemma, pos: w.pos, morph: { ...w.morph }, gloss: w.gloss, rule: `${stdName} word list: ${w.lemma}`, confidence: 0.9,
      role: w.role, register: w.register, varieties: w.varieties, unverified: w.unverified, order: ORDER_FUNCTION + (w.rank ?? i) * 4,
    });
    noteLemma(w.lemma, w.pos, w.gloss);
    noteForm(w.lemma, w.pos, w.form);
  });

  // verbs
  verbs.forEach((v, i) => {
    const base = ORDER_VERB + i;
    const common = { gloss: v.gloss, register: v.register, varieties: v.varieties, unverified: v.unverified, order: base };
    const r = (form: string, morph: Record<string, string>, what: string): void => {
      add(form, { ...common, lemma: v.lemma, pos: 'VERB', morph, rule: `${stdName} verb ${v.lemma}, ${what}`, confidence: 0.9 });
      noteForm(v.lemma, 'VERB', form);
    };
    for (const f of v.infinitives) r(f, { VerbForm: 'Inf' }, 'infinitive');
    if (!v.deponent) for (const f of v.present) r(f, { VerbForm: 'Fin', Tense: 'Pres', Mood: 'Ind' }, 'present');
    else for (const f of v.present) r(f, { VerbForm: 'Fin,Inf', Tense: 'Pres' }, 'present (deponent)');
    for (const f of v.past) r(f, { VerbForm: 'Fin', Tense: 'Past', Mood: 'Ind' }, 'past');
    for (const f of v.supine) r(f, { VerbForm: 'Part', Tense: 'Past' }, 'perfect participle');
    for (const f of v.imperative) r(f, { VerbForm: 'Fin', Mood: 'Imp' }, 'imperative');
    for (const f of v.passive) r(f, { VerbForm: 'Fin,Inf', Tense: 'Pres', Voice: 'Pass' }, std === 'nb' ? 'passive in -s' : 'passive in -st');
    noteLemma(v.lemma, 'VERB', v.gloss);
  });

  // nouns
  const allNouns = [...nouns, ...names];
  const nounByLemmaEarly = (l: string) => nouns.find((n) => n.lemma === l);
  allNouns.forEach((n, i) => {
    const base = ORDER_NOUN + i;
    const pos: PartOfSpeech = n.proper ? 'PROPN' : 'NOUN';
    const common = { gloss: n.gloss, register: n.register, varieties: n.varieties, unverified: n.unverified, order: base, gender: n.gender };
    const r = (form: string, morph: Record<string, string>, what: string): void => {
      add(form, { ...common, lemma: n.lemma, pos, morph, rule: `${stdName} noun ${n.lemma}, ${what}`, confidence: 0.9 });
      noteForm(n.lemma, pos, form);
    };
    if (n.proper) { r(n.lemma, {}, 'name'); noteLemma(n.lemma, pos, n.gloss); return; }
    const g = GENDER_NAME[n.gender];
    if (!n.pluralOnly) {
      r(n.lemma, { Gender: n.alsoMasc ? 'Fem,Masc' : g, Number: 'Sing', Definite: 'Ind' }, 'indefinite singular');
      for (const d of n.defSg) {
        const gender = n.alsoMasc && d.gender === 'Masc' ? 'Fem,Masc' : d.gender;
        r(d.form, { Gender: gender, Number: 'Sing', Definite: 'Def' }, 'definite singular');
      }
    }
    for (const p of n.plural) r(p, { Number: 'Plur', Definite: 'Ind' }, 'indefinite plural');
    for (const p of n.defPl) r(p, { Number: 'Plur', Definite: 'Def' }, 'definite plural');
    noteLemma(n.lemma, pos, n.gloss, n.gender);
  });

  // two valid 2005 spellings of one noun: bro and bru are ONE lemma (canonical: bro); the bru forms are variants of it
  if (std === 'nb') {
    const variants: Record<string, { indef: string[]; defSg: string[]; pl: string[]; defPl: string[] }> = {
      bro: { indef: ['bru'], defSg: ['brua', 'bruen'], pl: ['bruer'], defPl: ['bruene'] },
    };
    for (const [lemma, v] of Object.entries(variants)) {
      const n = nounByLemmaEarly(lemma);
      if (!n) continue;
      const common = { gloss: n.gloss, order: ORDER_NOUN + 100000 + allNouns.indexOf(n), gender: n.gender };
      const put = (form: string, morph: Record<string, string>, what: string): void => {
        add(form, { ...common, lemma, pos: 'NOUN', morph, rule: `${stdName} noun ${lemma}, ${what} (the variant spelling)`, confidence: 0.9 });
        noteForm(lemma, 'NOUN', form);
      };
      for (const f of v.indef) put(f, { Gender: 'Fem,Masc', Number: 'Sing', Definite: 'Ind' }, 'indefinite singular');
      for (const f of v.defSg) put(f, { Gender: f.endsWith('a') ? 'Fem' : 'Fem,Masc', Number: 'Sing', Definite: 'Def' }, 'definite singular');
      for (const f of v.pl) put(f, { Number: 'Plur', Definite: 'Ind' }, 'indefinite plural');
      for (const f of v.defPl) put(f, { Number: 'Plur', Definite: 'Def' }, 'definite plural');
    }
  }

  // adjectives
  adjectives.forEach((a, i) => {
    const base = ORDER_ADJ + i;
    const common = { gloss: a.gloss, register: a.register, varieties: a.varieties, unverified: a.unverified, order: base };
    const r = (form: string, morph: Record<string, string>, what: string): void => {
      add(form, { ...common, lemma: a.lemma, pos: 'ADJ', morph, rule: `${stdName} adjective ${a.lemma}, ${what}`, confidence: 0.9 });
      noteForm(a.lemma, 'ADJ', form);
    };
    r(a.lemma, { Degree: 'Pos', Gender: 'Fem,Masc', Number: 'Sing', Definite: 'Ind' }, 'common form');
    for (const f of a.feminine ?? []) r(f, { Degree: 'Pos', Gender: 'Fem', Number: 'Sing', Definite: 'Ind' }, 'feminine');
    for (const f of a.neuter) r(f, { Degree: 'Pos', Gender: 'Neut', Number: 'Sing', Definite: 'Ind' }, 'neuter singular');
    for (const f of a.plural) r(f, { Degree: 'Pos', Number: 'Plur,Sing', Definite: 'Def,Ind' }, 'plural and definite');
    for (const f of a.comparative) r(f, { Degree: 'Cmp' }, 'comparative');
    for (const f of a.superlative) r(f, { Degree: 'Sup', Definite: 'Ind' }, 'superlative');
    for (const f of a.superlativeDef) r(f, { Degree: 'Sup', Definite: 'Def' }, 'definite superlative');
    noteLemma(a.lemma, 'ADJ', a.gloss);
  });

  for (const list of byForm.values()) list.sort((x, y) => x.order - y.order);

  const nounByLemma = new Map(nouns.map((n) => [n.lemma, n]));
  const verbByLemma = new Map(verbs.map((v) => [v.lemma, v]));
  const adjByLemma = new Map(adjectives.map((a) => [a.lemma, a]));

  return {
    std, nouns, verbs, adjectives, words,
    lookup: (form) => byForm.get(form) ?? [],
    has: (form) => byForm.has(form),
    entriesOf: (lemma) => lemmaEntries.get(lemma) ?? lemmaEntries.get(lc(lemma)) ?? [],
    hasLemma: (lemma, pos) => (lemmaEntries.get(lemma) ?? []).some((e) => !pos || e.pos === pos),
    noun: (lemma) => nounByLemma.get(lemma),
    verb: (lemma) => verbByLemma.get(lemma),
    adjective: (lemma) => adjByLemma.get(lemma),
    formsOf: (lemma, pos) => {
      const m = lemmaForms.get(lemma);
      if (!m) return [];
      return pos ? [...(m.get(pos) ?? [])] : [...m.values()].flatMap((s) => [...s]);
    },
    stats: { nouns: nouns.length, verbs: verbs.length, adjectives: adjectives.length, words: new Set(words.map((w) => `${w.lemma}|${w.pos}`)).size, forms: byForm.size, names: names.length },
  };
}

let NB: NoLexicon | undefined;
let NN: NoLexicon | undefined;

export function lexiconFor(std: NoStandard): NoLexicon {
  if (std === 'nb') return (NB ??= build('nb'));
  return (NN ??= build('nn'));
}
