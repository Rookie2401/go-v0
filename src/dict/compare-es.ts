/// <reference types="node" />
/**
 * The Spanish word list against the dictionary (kaikki.org extract of Wiktionary): coverage and recorded
 * disagreements. The same rule as the Thai comparison (src/dict/compare.ts): the dictionary is a separately sourced
 * layer, and where the hand data and the dictionary differ NOTHING is chosen. The differences are recorded as
 * `SourceDisagreement` records, all 'open' unless a person has decided (resolutions.json, merged by id).
 *
 * Six kinds are compared, each one weak in its own way (the report says how): missing, part-of-speech, gender,
 * meaning, variety, inflection. A record means "possibly different", never "wrong".
 *
 * The comparison itself (`compareEsHandToDictionary`) is pure; the streaming of the 1 GB file, the reading of the word
 * list from the adapter and the rendering of the report sit further down in the same file. Gloss comparison is the
 * Thai module's (compare-text.ts); resolutions are the Thai module's too (parseResolutions / applyResolutions).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import zlib from 'node:zlib';
import type { PartOfSpeech, SourceDisagreement } from '../core';
import { ES_SOURCE_IDS, esLexicon } from '../adapters/es';
import { buildRows, parseRows, type EsRow } from '../adapters/spanish/entries';
import { FUNCTION_ROWS } from '../adapters/spanish/function-words';
import { ADJECTIVE_ROWS, PROPER_ROWS } from '../adapters/spanish/lexicon-modifiers';
import { COURSE_ROWS } from '../adapters/spanish/lexicon-course';
import { NOUN_ROWS } from '../adapters/spanish/lexicon-nouns';
import { VERB_ROWS } from '../adapters/spanish/lexicon-verbs';
import { REGIONAL_ROWS } from '../adapters/spanish/regional';
import { KAIKKI_ATTRIBUTION, KAIKKI_LICENCE } from './build';
import { COMPARE_SCHEMA, applyResolutions, parseResolutions, type Resolution } from './compare';
import { glossesOverlap, isBracketOnly } from './compare-text';
import { lastModifiedFromHeaders } from './compare-node';

// ───────────────────────────── inputs ─────────────────────────────

export type EsKind = 'missing' | 'part-of-speech' | 'gender' | 'meaning' | 'variety' | 'inflection';
export const ES_KIND_ORDER: readonly EsKind[] = ['missing', 'part-of-speech', 'gender', 'meaning', 'variety', 'inflection'];

export interface EsHandForm { form: string; tags: string }

/** One word-list entry: a lemma with a part of speech. */
export interface EsHandEntry {
  lemma: string;
  pos: PartOfSpeech;
  gloss: string;
  gender?: 'm' | 'f' | 'mf';
  /** The tags of the row, verbatim: variety codes ("es-HN", "voseo") only; registers are not compared. */
  varieties: string[];
  /** Forms the word list writes out itself (irregular paradigms, closed classes), the lemma excluded. */
  forms?: EsHandForm[];
}

/** One sense of a dictionary entry, as much of it as the comparison reads. */
export interface EsDictSense {
  glosses: string[];
  tags: string[];
  /** Headwords of `form_of`: the sense says "inflected form of X". */
  formOf: string[];
  /** The sense says "alternative form / spelling of X". */
  altOf: boolean;
}

export interface EsDictEntry {
  pos: string;
  senses: EsDictSense[];
  /** First argument of each head template that can carry a gender ("m", "f", "mf", "m-p", "mfbysense" ...). */
  genderArgs: string[];
  /** Surfaces of the entry's own table of forms ("forms": [{ form, tags }]). */
  forms: string[];
}

export interface EsDictStats {
  lines: number;
  blank: number;
  malformed: number;
  /** The last non-blank line did not parse: the file looks cut off. */
  lastLineMalformed: boolean;
  /** Entries read (a line with a headword and a part of speech). */
  entries: number;
  /** Entries kept: those whose headword is a word-list lemma or one of its listed forms. */
  kept: number;
  posCounts: Record<string, number>;
}

export interface EsDictCollection {
  index: Map<string, EsDictEntry[]>;
  stats: EsDictStats;
}

const CAP_SENSES = 80;
const CAP_GLOSSES = 6;
const CAP_GLOSS_CHARS = 300;
const CAP_TAGS = 40;
const CAP_FORMS = 400;

const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const nfc = (s: string): string => s.normalize('NFC');

/** The head-template argument(s) that can say the gender of a noun. */
function genderArgsOf(j: Record<string, unknown>): string[] {
  const out: string[] = [];
  const templates = Array.isArray(j.head_templates) ? j.head_templates : [];
  for (const t of templates) {
    if (!t || typeof t !== 'object') continue;
    const name = (t as { name?: unknown }).name;
    const args = (t as { args?: unknown }).args;
    if (typeof name !== 'string' || !args || typeof args !== 'object') continue;
    const a = args as Record<string, unknown>;
    if (/^es-(noun|proper noun|prop)\b/.test(name) && isStr(a['1'])) out.push(a['1']);
    else if (name === 'head' && isStr(a.g)) out.push(a.g);
  }
  return out;
}

function senseOf(raw: unknown): EsDictSense | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const s = raw as Record<string, unknown>;
  const glosses = (Array.isArray(s.glosses) ? s.glosses : []).filter(isStr).slice(0, CAP_GLOSSES).map((g) => g.slice(0, CAP_GLOSS_CHARS));
  const tags = (Array.isArray(s.tags) ? s.tags : []).filter(isStr).slice(0, CAP_TAGS);
  const formOf: string[] = [];
  // "inflected form of X" (form_of) and "alternative / apocopic / contracted form of X" (alt_of) are both a form of X, not a meaning
  for (const key of ['form_of', 'alt_of']) {
    const list = s[key];
    if (Array.isArray(list)) for (const f of list) { const w = (f as { word?: unknown } | null)?.word; if (isStr(w)) formOf.push(nfc(w)); }
  }
  const altOf = (Array.isArray(s.alt_of) && s.alt_of.length > 0) || tags.includes('alt-of');
  return { glosses, tags, formOf, altOf };
}

export interface EsCollector {
  addLine(raw: string): void;
  finish(): EsDictCollection;
}

/**
 * Feed the file line by line. Entries of the wanted headwords are kept (reduced to what the comparison reads); every
 * other line is only counted, so memory does not depend on the size of the file.
 */
export function createEsCollector(wanted: ReadonlySet<string>): EsCollector {
  const index = new Map<string, EsDictEntry[]>();
  const stats: EsDictStats = { lines: 0, blank: 0, malformed: 0, lastLineMalformed: false, entries: 0, kept: 0, posCounts: {} };
  let first = true;
  return {
    addLine(raw) {
      let text = raw;
      if (first) { first = false; text = text.replace(/^﻿/, ''); }
      text = text.trim();
      if (!text) { stats.blank++; return; }
      stats.lines++;
      let json: unknown;
      try { json = JSON.parse(text); } catch { stats.malformed++; stats.lastLineMalformed = true; return; }
      stats.lastLineMalformed = false;
      if (!json || typeof json !== 'object') { stats.malformed++; return; }
      const j = json as Record<string, unknown>;
      if (!isStr(j.word) || !isStr(j.pos)) return;
      if (isStr(j.lang_code) && j.lang_code !== 'es') return;
      stats.entries++;
      stats.posCounts[j.pos] = (stats.posCounts[j.pos] ?? 0) + 1;
      const word = nfc(j.word);
      if (!wanted.has(word)) return;
      const senses = (Array.isArray(j.senses) ? j.senses : []).slice(0, CAP_SENSES).map(senseOf).filter((s): s is EsDictSense => !!s);
      const forms: string[] = [];
      if (Array.isArray(j.forms)) for (const f of j.forms.slice(0, CAP_FORMS)) { const w = (f as { form?: unknown } | null)?.form; if (isStr(w)) forms.push(nfc(w)); }
      const entry: EsDictEntry = { pos: j.pos, senses, genderArgs: genderArgsOf(j), forms };
      const list = index.get(word);
      if (list) list.push(entry); else index.set(word, [entry]);
      stats.kept++;
    },
    finish() { return { index, stats }; },
  };
}

// ───────────────────────────── part of speech ─────────────────────────────

/**
 * Which dictionary parts of speech count as "the same kind of word" as a hand one. The two tag sets divide Spanish
 * words differently (the word list has DET for the articles and possessives, which Wiktionary files as det, article or
 * adjective; AUX for ser / estar / haber, which Wiktionary calls verbs; SCONJ, which it calls conj; ADP for
 * prepositions and the contractions al / del). Only a hand part of speech with NONE of these among the dictionary's
 * entries of the lemma is recorded. Proper names (PROPN) are compared for presence only. Printed in the report.
 */
export const ES_POS_COMPATIBLE: Readonly<Record<PartOfSpeech, readonly string[]>> = {
  NOUN: ['noun', 'name', 'adj'],
  PROPN: ['name', 'noun'],
  VERB: ['verb'],
  AUX: ['verb', 'aux'],
  ADJ: ['adj', 'noun', 'det', 'num', 'pron'],
  ADV: ['adv', 'adj', 'prep', 'conj', 'intj', 'particle', 'phrase'],
  PRON: ['pron', 'det', 'noun', 'adj', 'article'],
  DET: ['det', 'article', 'adj', 'pron', 'num'],
  ADP: ['prep', 'contraction', 'adv', 'conj', 'prep_phrase'],
  CONJ: ['conj', 'adv', 'prep', 'particle'],
  SCONJ: ['conj', 'adv', 'prep', 'pron', 'particle'],
  PART: ['particle', 'adv', 'intj', 'conj', 'pron'],
  NUM: ['num', 'adj', 'det', 'noun', 'pron'],
  INTJ: ['intj', 'adv', 'particle', 'phrase', 'noun', 'verb'],
  CLF: ['noun'],
  PUNCT: ['punct', 'symbol'],
  X: ['phrase', 'proverb'],
};

/** Parts of speech whose glosses are mostly small words ("for", "which", "not"), which then count in the gloss comparison. */
const FUNCTION_POS: ReadonlySet<PartOfSpeech> = new Set<PartOfSpeech>(['ADP', 'CONJ', 'SCONJ', 'PART', 'AUX', 'DET', 'PRON', 'ADV', 'INTJ']);

// ───────────────────────────── regions ─────────────────────────────

export interface RegionRule {
  name: string;
  /** Dictionary labels (lower-case) for a place inside the hand region. */
  inside: readonly string[];
  /** Dictionary labels for a wider region around it that still holds the hand region. */
  around: readonly string[];
}

const LATIN_AMERICA: readonly string[] = [
  'latin-america', 'americas', 'north-america', 'central-america', 'south-america', 'caribbean', 'antilles', 'mexico', 'guerrero', 'puebla',
  'honduras', 'el-salvador', 'guatemala', 'nicaragua', 'costa-rica', 'panama', 'belize', 'cuba', 'puerto-rico', 'dominican-republic',
  'colombia', 'bogota', 'venezuela', 'llanos', 'chile', 'paraguay', 'peru', 'bolivia', 'ecuador', 'argentina', 'uruguay', 'rioplatense', 'lunfardo',
];

/**
 * The word-list region codes the comparison understands, and which dictionary region labels it counts as "the same
 * region, one inside it, or one around it". A label for a different place (Nicaragua for a word the list calls
 * Honduran) is not compatible: that is exactly what the variety record is for. The table is a judgment, printed in
 * the report; a reviewer can overrule any line of it.
 */
export const REGION_RULES: Readonly<Record<string, RegionRule>> = {
  'es-HN': { name: 'Honduras', inside: ['honduras'], around: ['central-america', 'latin-america', 'americas'] },
  'es-CA': { name: 'Central America', inside: ['central-america', 'honduras', 'el-salvador', 'guatemala', 'nicaragua', 'costa-rica', 'panama', 'belize'], around: ['latin-america', 'americas'] },
  'es-419': { name: 'Latin America', inside: LATIN_AMERICA, around: [] },
  'es-ES': { name: 'Spain', inside: ['spain', 'canary-islands', 'tenerife', 'andalusia', 'seville', 'aragon', 'asturias', 'catalonia', 'galicia', 'valencia', 'navarre', 'mallorca', 'iberian'], around: ['european', 'europe'] },
  'es-MX': { name: 'Mexico', inside: ['mexico', 'guerrero', 'puebla'], around: ['latin-america', 'north-america', 'americas'] },
  'es-CAR': { name: 'Caribbean', inside: ['caribbean', 'antilles', 'cuba', 'puerto-rico', 'dominican-republic'], around: ['latin-america', 'americas'] },
  'es-AND': { name: 'Andean', inside: ['peru', 'bolivia', 'ecuador', 'colombia', 'chile'], around: ['south-america', 'latin-america', 'americas'] },
  'es-AR': { name: 'Río de la Plata', inside: ['argentina', 'uruguay', 'rioplatense', 'lunfardo'], around: ['south-america', 'latin-america', 'americas'] },
};

/** Every sense tag of the dictionary that names a place (lower-case). Other tags (colloquial, slang, plural ...) are not regions. */
export const REGION_LABELS: ReadonlySet<string> = new Set([
  ...Object.values(REGION_RULES).flatMap((r) => [...r.inside, ...r.around]),
  'philippines', 'us', 'louisiana', 'california', 'texas', 'new-york-city', 'canada', 'morocco', 'angola', 'equatorial-guinea',
]);

/** Hand codes the comparison tests; the voseo / vosotros feature tags and any other tag are not regions. */
const handRegions = (varieties: readonly string[]): string[] => varieties.filter((v) => v in REGION_RULES);
/** Regions where "the dictionary gives no region" is worth a (weaker) record: the owner's target region. */
const TARGET_REGIONS: ReadonlySet<string> = new Set(['es-HN', 'es-CA']);

// ───────────────────────────── gender ─────────────────────────────

export type Gender = 'masculine' | 'feminine';

/** The genders one head-template argument says: "m" → masculine, "mf" / "mfbysense" → both, "m-p" → masculine, "gneut" / "?" → none. */
export function parseGenderArg(arg: string): Gender[] {
  let s = arg;
  for (let prev = ''; prev !== s;) { prev = s; s = s.replace(/<[^<>]*>/g, ''); }
  const out = new Set<Gender>();
  for (const raw of s.split(',')) {
    const t = raw.trim().toLowerCase().replace(/-(p|s)$/, '');
    if (t === 'm') out.add('masculine');
    else if (t === 'f') out.add('feminine');
    else if (t === 'mf' || t === 'mfbysense' || t === 'mfequiv' || t === 'm-f' || t === 'common') { out.add('masculine'); out.add('feminine'); }
  }
  return [...out];
}

const GENDER_ORDER: readonly Gender[] = ['masculine', 'feminine'];
const handGenders = (g: 'm' | 'f' | 'mf'): Gender[] => (g === 'm' ? ['masculine'] : g === 'f' ? ['feminine'] : ['masculine', 'feminine']);

// ───────────────────────────── records ─────────────────────────────

const SHORT = 90;
const clip = (s: string, n = SHORT): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const uniq = <T>(xs: readonly T[]): T[] => [...new Set(xs)];
const lower = (s: string): string => nfc(s).toLowerCase();

const isFormOnly = (s: EsDictSense): boolean => s.formOf.length > 0 || s.altOf || s.tags.includes('form-of');
/** The senses that are a meaning of their own: not an inflected form, not an alternative spelling. */
const ownSenses = (e: EsDictEntry): EsDictSense[] => e.senses.filter((s) => !isFormOnly(s) && s.glosses.length > 0);
/**
 * compare-text.ts turns the number words of a HAND gloss into digits ("four" → "4") but leaves the dictionary side as
 * written ("four"), because Thai dictionary glosses write digits. Spanish ones write the word, so the dictionary glosses
 * get the digits added here, else "cuatro = four" would look like a different meaning.
 */
const NUMERALS: Readonly<Record<string, string>> = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' };
function withNumerals(glosses: readonly string[]): string[] {
  const extra: string[] = [];
  for (const g of glosses) {
    const digits = g.toLowerCase().split(/[^a-z0-9]+/).map((w) => NUMERALS[w]).filter((d): d is string => d !== undefined);
    if (digits.length) extra.push(digits.join(' '));
  }
  return [...glosses, ...extra];
}
/**
 * The word list is written in British spelling ("centre", "saviour", "practise"), Wiktionary mostly in American. The
 * gloss as written is compared first; only when that finds nothing is this fold tried, so it can add a match and never
 * remove one. A fold that produces a non-word ("promize") simply matches nothing.
 */
export function usSpelling(gloss: string): string {
  return gloss
    .replace(/\bpractis/g, 'practic')
    .replace(/\b(\w{3,})our(s|ed|ing|ite|able|hood)?\b/g, '$1or$2')
    .replace(/\b(\w{2,})tre(s)?\b/g, '$1ter$2')
    .replace(/\b(\w{4,})is(e|es|ed|ing|ation)\b/g, '$1iz$2')
    .replace(/\bgrey\b/g, 'gray')
    .replace(/\bprogramme/g, 'program')
    .replace(/\b(defen|offen|licen|preten)ce\b/g, '$1se');
}
/** Words too small to count as a shared word on their own. */
const TINY: ReadonlySet<string> = new Set(['a', 'an', 'the', 'to', 'of', 'or', 'and', 'in', 'on', 'at', 'by', 'for', 'with', 'be', 'is', 'it', 'as', 'one', 'e', 'g', 'etc']);
/**
 * Last resort of the meaning comparison: a whole word of the hand gloss (outside its bracketed remarks) that stands as
 * a whole word in a dictionary gloss. The helper drops "also", "often", "used" ... from a hand gloss as stop words, so
 * "besides, also" would otherwise not meet a dictionary gloss that says "also".
 */
function sharesWholeWord(handGloss: string, dictGlosses: readonly string[]): boolean {
  const mine = handGloss.replace(/\([^()]*\)|\[[^\]]*\]/g, ' ').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !TINY.has(w));
  if (!mine.length) return false;
  const theirs = new Set(dictGlosses.flatMap((g) => g.toLowerCase().split(/[^a-z0-9]+/)));
  return mine.some((w) => theirs.has(w));
}
const lastGloss = (s: EsDictSense): string => s.glosses[s.glosses.length - 1] ?? '';
/** " (also listed as a form of: tío)" when some of the entries are, beside their own senses, a form of another word. */
const formTargets = (es: readonly EsDictEntry[], lemma: string): string[] =>
  uniq(es.flatMap((d) => d.senses.flatMap((s) => s.formOf))).filter((w) => lower(w) !== lower(lemma)).slice(0, 4);
function alsoFormOf(es: readonly EsDictEntry[], lemma: string): string {
  const of = formTargets(es, lemma);
  return of.length ? ` (also listed as a form of: ${of.join(', ')})` : '';
}

/** Own glosses of some entries, for display: the first few distinct ones. */
function glossList(es: readonly EsDictEntry[], max = 5): string {
  const out: string[] = [];
  for (const e of es) for (const s of ownSenses(e)) { const g = lastGloss(s); if (g && !out.includes(g) && out.length < max) out.push(g); }
  return out.map((g) => clip(g, 60)).join(' | ');
}

class Recorder {
  readonly list: SourceDisagreement[] = [];
  private readonly ids = new Set<string>();
  constructor(private readonly theirsId: string, private readonly oursId: string) {}
  add(kind: EsKind, key: string, form: string, ours: string, theirs: string, note: string): void {
    let id = `es:${kind}:${key}`;
    for (let n = 2; this.ids.has(id); n++) id = `es:${kind}:${key}#${n}`;
    this.ids.add(id);
    this.list.push({
      id, lang: 'es', form, field: kind, ours: { sourceId: this.oursId, value: ours }, theirs: { sourceId: this.theirsId, value: theirs },
      note, status: 'open',
    });
  }
}

export interface EsCompareOptions {
  dictionaryId: string;
  /** `adapter-es@4:hand`; defaults to the adapter's own id. */
  oursId?: string;
  resolutions?: ReadonlyMap<string, Resolution>;
}

export interface EsPosCoverage { pos: string; entries: number; found: number; compatible: number }

export interface EsCompareResult {
  dictionaryId: string;
  coverage: {
    entries: number;
    distinctLemmas: number;
    /** Distinct lemmas that are a headword of the dictionary at all (any entry, even only a form-of one). */
    lemmasAnyEntry: number;
    /** Distinct lemmas with an entry that has a meaning of its own. */
    lemmasWithOwnEntry: number;
    /** Hand entries with an own-sense dictionary entry of a compatible part of speech. */
    entriesCompatible: number;
    byPos: EsPosCoverage[];
  };
  disagreements: SourceDisagreement[];
  notComparable: Record<string, number>;
  staleResolutions: string[];
  checked: Record<string, number>;
  /** Region labels the dictionary gave to the word-list lemmas, with how many lemmas carry each (verbatim spelling). */
  regionLabelsSeen: Record<string, number>;
  /** Capitalised sense tags on the word-list lemmas that the region table does NOT read as a place (so a reviewer can see what is ignored). */
  otherCapitalTags: Record<string, number>;
  /** Every word-list entry tagged Honduras or Central America, with what the dictionary says about its region (also the ones with no record). */
  varietyOverview: EsVarietyRow[];
}

/**
 * 'label matches': some sense carries a label for the region, a place inside it or a region around it (not a
 * confirmation of the gloss). 'another region' and 'no region label' are the two that make a variety record.
 */
export type EsVarietyOutcome = 'label matches' | 'another region' | 'no region label' | 'not in the dictionary' | 'not compared';
export interface EsVarietyRow { lemma: string; pos: string; ours: string; theirs: string; outcome: EsVarietyOutcome }

const compatibleEntries = (pos: PartOfSpeech, es: readonly EsDictEntry[]): EsDictEntry[] =>
  es.filter((e) => ES_POS_COMPATIBLE[pos].includes(e.pos) && ownSenses(e).length > 0);

const regionTags = (s: EsDictSense): string[] => s.tags.filter((t) => REGION_LABELS.has(t.toLowerCase()));

export function compareEsHandToDictionary(hand: readonly EsHandEntry[], dict: EsDictCollection, opts: EsCompareOptions): EsCompareResult {
  const idx = dict.index;
  const at = (w: string): EsDictEntry[] => idx.get(nfc(w)) ?? [];
  const oursId = opts.oursId ?? ES_SOURCE_IDS.hand;
  const rec = new Recorder(opts.dictionaryId, oursId);
  const notComparable: Record<string, number> = {};
  const skip = (why: string) => { notComparable[why] = (notComparable[why] ?? 0) + 1; };
  const checked = { partOfSpeechChecked: 0, genderChecked: 0, genderFromTags: 0, genderFromHeadTemplate: 0, meaningChecked: 0, varietyChecked: 0, inflectionChecked: 0 };
  const regionLabelsSeen: Record<string, number> = {};
  const otherCapitalTags: Record<string, number> = {};
  const varietyOverview: EsVarietyRow[] = [];

  // ── coverage ──
  const lemmas = uniq(hand.map((e) => e.lemma));
  const ownIn = (lemma: string): EsDictEntry[] => at(lemma).filter((e) => ownSenses(e).length > 0);
  const posRows = new Map<string, EsPosCoverage>();
  let entriesCompatible = 0;
  for (const e of hand) {
    const own = ownIn(e.lemma);
    const compat = compatibleEntries(e.pos, at(e.lemma)).length > 0;
    if (compat) entriesCompatible++;
    const row = posRows.get(e.pos) ?? { pos: e.pos, entries: 0, found: 0, compatible: 0 };
    row.entries++;
    if (own.length) row.found++;
    if (compat) row.compatible++;
    posRows.set(e.pos, row);
  }
  const coverage = {
    entries: hand.length,
    distinctLemmas: lemmas.length,
    lemmasAnyEntry: lemmas.filter((l) => at(l).length > 0).length,
    lemmasWithOwnEntry: lemmas.filter((l) => ownIn(l).length > 0).length,
    entriesCompatible,
    byPos: [...posRows.values()].sort((a, b) => b.entries - a.entries || (a.pos < b.pos ? -1 : 1)),
  };

  for (const e of hand) {
    const es = at(e.lemma);
    const own = es.filter((d) => ownSenses(d).length > 0);
    const key = `${e.lemma}:${e.pos}`;
    const oursText = `${e.pos}: ${e.gloss}`;
    /** Every entry of the headword under a compatible part of speech, form-of entries included. */
    const samePos = es.filter((d) => ES_POS_COMPATIBLE[e.pos].includes(d.pos));
    const regions = handRegions(e.varieties);
    const isTarget = regions.some((r) => TARGET_REGIONS.has(r));
    const oursV = `${e.varieties.join(' ')}: ${e.gloss}`;
    const overview = (outcome: EsVarietyOutcome, theirs: string) => { if (isTarget) varietyOverview.push({ lemma: e.lemma, pos: e.pos, ours: oursV, theirs, outcome }); };

    /**
     * Variety. The region labels are read from every sense of the headword under a compatible part of speech, the
     * form-of senses too ("female equivalent of cipote", labelled Honduras, is the dictionary's word on cipota).
     */
    const compareVariety = (entries: readonly EsDictEntry[]): void => {
      if (!regions.length) return;
      checked.varietyChecked++;
      const regSenses = entries.flatMap((d) => d.senses).filter((s) => regionTags(s).length > 0);
      const labels = uniq(regSenses.flatMap(regionTags));
      const ok = new Set(regions.flatMap((r) => [...REGION_RULES[r].inside, ...REGION_RULES[r].around]));
      const theirsV = regSenses.slice(0, 4).map((s) => `${regionTags(s).join(', ')}: ${clip(lastGloss(s), 70)}`).join(' | ');
      const onlyForm = entries.every((d) => ownSenses(d).length === 0) ? formTargets(entries, e.lemma) : [];
      if (labels.length) {
        if (labels.some((l) => ok.has(l.toLowerCase()))) { overview('label matches', theirsV); return; }
        // do the labelled senses even speak of the meaning the word list gives? (said in the note, never used to drop the record)
        const related = regSenses.some((s) => glossesOverlap(e.gloss, withNumerals(s.glosses), FUNCTION_POS.has(e.pos)) === true);
        rec.add('variety', key, e.lemma, oursV, theirsV,
          `Possibly different: the word list places this word in ${regions.map((r) => `${r} (${REGION_RULES[r].name})`).join(', ')}; the dictionary's region labels for it (${labels.join(', ')}) name no place inside or around that region. A label says where Wiktionary's editors know a sense to be used; it does not say the word is unused elsewhere.${related ? '' : ' None of the labelled senses shares a word with the word-list gloss: the labels may belong to other meanings of the word, and the meaning the word list gives may carry no region label at all.'}`);
        overview('another region', theirsV);
      } else if (isTarget) {
        const theirs = `(no region label on any sense${onlyForm.length ? `; the dictionary has the word only as a form of: ${onlyForm.join(', ')}` : ''})`;
        rec.add('variety', key, e.lemma, oursV, theirs,
          'the dictionary gives no region for this word. Weaker than a disagreement: Wiktionary labels regions sparingly, so this neither confirms nor contradicts the word list.');
        overview('no region label', theirs);
      } else skip('variety: the word list names a region outside Honduras and Central America and the dictionary gives no region label');
    };

    // ── missing ──
    if (!own.length) {
      const formOnly = uniq(es.flatMap((d) => d.senses.flatMap((s) => s.formOf)));
      // an entry whose senses carry no gloss at all (kaikki tags them "no-gloss"): the headword is there, a definition is not
      const bare = uniq(es.filter((d) => !d.senses.some((s) => s.glosses.length > 0)).map((d) => d.pos));
      const formPart = es.some((d) => d.senses.some(isFormOnly)) ? `inflected-form or alternative-form entries${formOnly.length ? `, of: ${formOnly.slice(0, 5).join(', ')}` : ''}` : '';
      const theirs = !es.length ? '(no entry for this headword)'
        : bare.length ? `(${[`${bare.join(', ')} entry without a definition`, formPart].filter(Boolean).join('; ')})`
          : `(only ${formPart || 'entries without a meaning of their own'})`;
      rec.add('missing', key, e.lemma, oursText, theirs,
        'Not a finding against either source: the dictionary has no entry with a meaning of its own for this headword. It may list the word under another spelling, only as a form of another word, or not at all.');
      // a region-tagged word that is missing: a form-of entry may still carry a region label; no entry at all leaves nothing to compare
      if (samePos.length) compareVariety(samePos);
      else overview('not in the dictionary', theirs);
      continue;
    }
    for (const label of uniq(es.flatMap((d) => d.senses.flatMap(regionTags)))) regionLabelsSeen[label] = (regionLabelsSeen[label] ?? 0) + 1;
    for (const tag of uniq(es.flatMap((d) => d.senses.flatMap((s) => s.tags.filter((t) => /^\p{Lu}/u.test(t) && !REGION_LABELS.has(t.toLowerCase())))))) otherCapitalTags[tag] = (otherCapitalTags[tag] ?? 0) + 1;
    if (e.pos === 'PROPN') { overview('not compared', '(a proper name: compared for presence only)'); continue; } // proper names: presence only

    // ── part of speech ──
    const compat = compatibleEntries(e.pos, es);
    checked.partOfSpeechChecked++;
    if (!compat.length) {
      // an entry of a compatible part of speech that is only a form of another word ("mi": apocopic form of mío) is said, not counted
      const formOnly = es.filter((d) => ES_POS_COMPATIBLE[e.pos].includes(d.pos) && ownSenses(d).length === 0);
      const formOnlyOf = formTargets(formOnly, e.lemma);
      const formOnlyText = formOnly.length ? `; as ${uniq(formOnly.map((d) => d.pos)).join(', ')} only a form of another word${formOnlyOf.length ? ` (${formOnlyOf.join(', ')})` : ''}` : '';
      rec.add('part-of-speech', key, e.lemma, e.pos, `${uniq(own.map((d) => d.pos)).join(', ')}${formOnlyText}`,
        `Possibly different: none of the dictionary's parts of speech for this headword is ${e.pos} or a usual equivalent (${ES_POS_COMPATIBLE[e.pos].join(', ')}). The two tag sets divide Spanish words differently, so a reviewer should look before concluding anything. The remaining comparisons for this entry were not made.`);
      skip('the headword has no entry of a compatible part of speech: gender, meaning, variety and inflection not compared');
      overview('not compared', '(no entry of a compatible part of speech)');
      continue;
    }

    // ── gender ── (read from every noun entry of the headword, form-of senses included: "clipping of motocicleta", feminine)
    if (e.pos === 'NOUN' && e.gender) {
      const nouns = samePos.filter((d) => d.pos === 'noun' || d.pos === 'name');
      if (!nouns.length) skip('gender: the dictionary has no noun entry for the headword (only adjective or similar)');
      else {
        const fromTags = new Set<Gender>();
        for (const d of nouns) for (const s of d.senses) {
          const t = s.tags.map((x) => x.toLowerCase());
          if (t.includes('masculine')) fromTags.add('masculine');
          if (t.includes('feminine')) fromTags.add('feminine');
          if (t.includes('by-personal-gender') || t.includes('common-gender')) { fromTags.add('masculine'); fromTags.add('feminine'); }
        }
        const args = uniq(nouns.flatMap((d) => d.genderArgs));
        const fromTemplate = new Set<Gender>(args.flatMap(parseGenderArg));
        const used = fromTags.size ? 'sense tags' : fromTemplate.size ? 'head template' : undefined;
        const theirSet = fromTags.size ? fromTags : fromTemplate;
        if (!used) skip('gender: the dictionary gives no gender for the noun (no sense tag, no usable head-template argument)');
        else {
          checked.genderChecked++;
          if (used === 'sense tags') checked.genderFromTags++; else checked.genderFromHeadTemplate++;
          const ours = handGenders(e.gender);
          if (!ours.some((g) => theirSet.has(g))) {
            const theirsText = GENDER_ORDER.filter((g) => theirSet.has(g)).join(', ');
            rec.add('gender', key, e.lemma, `/${e.gender} (${ours.join(', ')})`, `${theirsText} (from ${used}${used === 'head template' ? `: ${args.map((a) => clip(a, 30)).join(' | ')}` : ''})`,
              'Possibly different: the gender of the word list and the genders the dictionary gives for the noun do not overlap (a word used with both genders, written mf here or "by personal gender" there, counts as compatible with either). The dictionary may be describing another noun of the same spelling (el cura / la cura); the comparison reads the entries filed as noun together.');
          }
        }
      }
    }

    // ── meaning ──
    if (isBracketOnly(e.gloss)) skip('meaning: the word-list gloss is only a bracketed description');
    else {
      // every gloss of the headword under a compatible part of speech, the form-of ones too ("clipping of motocicleta (motorcycle)")
      const theirGlosses = withNumerals(samePos.flatMap((d) => d.senses.flatMap((s) => s.glosses)));
      const fn = FUNCTION_POS.has(e.pos);
      const overlap = glossesOverlap(e.gloss, theirGlosses, fn);
      if (overlap === undefined) skip('meaning: the word-list gloss has no content word to compare');
      else {
        checked.meaningChecked++;
        // lenient on purpose: the gloss as written, then in American spelling, then any whole word in common
        const meets = overlap || glossesOverlap(usSpelling(e.gloss), theirGlosses, fn) === true || sharesWholeWord(e.gloss, theirGlosses);
        if (!meets) {
          rec.add('meaning', key, e.lemma, e.gloss, `${glossList(compat, 6)}${alsoFormOf(samePos, e.lemma)}`,
            'Possibly different: no content word of the word-list gloss appears in any dictionary gloss of this headword under a compatible part of speech (compared lower-case, without stop words and bracketed remarks, lightly stemmed; British spellings also tried in their American form). The wording may simply differ, or the two may describe different senses; the comparison cannot tell a synonym or a paraphrase from a different meaning. A sense the dictionary words only as "form of another word" (tía as "female equivalent of tío") carries no English meaning to compare; the other word is named.');
        }
      }
    }

    // ── variety ──
    compareVariety(samePos);

    // ── inflection ──
    if (e.forms?.length) {
      const surfaces = uniq(e.forms.map((f) => f.form).filter((f) => f !== e.lemma));
      const table = new Set(samePos.flatMap((d) => d.forms));
      for (const surface of surfaces) {
        checked.inflectionChecked++;
        const entries = at(surface);
        const isFormOfLemma = entries.some((d) => d.senses.some((s) => s.formOf.some((w) => lower(w) === lower(e.lemma))));
        if (table.has(surface) || isFormOfLemma) continue;
        const tags = uniq(e.forms.filter((f) => f.form === surface).map((f) => f.tags)).filter(Boolean);
        let theirs: string;
        if (!entries.length) theirs = '(no entry for this form)';
        else {
          const of = uniq(entries.flatMap((d) => d.senses.flatMap((s) => s.formOf)));
          const ownHere = entries.some((d) => ownSenses(d).length > 0);
          theirs = [of.length ? `listed as a form of: ${of.slice(0, 5).join(', ')}` : '', ownHere ? `a headword with a meaning of its own: ${glossList(entries, 2)}` : ''].filter(Boolean).join('; ') || '(an entry with no form-of sense)';
        }
        rec.add('inflection', `${key}:${surface}`, e.lemma, `${surface}${tags.length ? ` (${tags.join('; ')})` : ''}`, theirs,
          'Possibly different: the word list writes this form out as a form of the lemma, but the dictionary neither has the form as a form-of entry for the lemma nor lists it in the lemma\'s own table of forms. The dictionary may list it under another lemma, spell it differently, or omit a rare form.');
      }
    }
  }

  // ── order, resolutions ──
  const rank = new Map(ES_KIND_ORDER.map((k, i) => [k as string, i] as const));
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const sorted = [...rec.list].sort((a, b) => (rank.get(a.field)! - rank.get(b.field)!) || cmp(a.form, b.form) || cmp(a.id, b.id));
  const { merged, stale } = applyResolutions(sorted, opts.resolutions);

  varietyOverview.sort((a, b) => cmp(a.lemma, b.lemma) || cmp(a.pos, b.pos));
  return { dictionaryId: opts.dictionaryId, coverage, disagreements: merged, notComparable, staleResolutions: stale, checked: { ...checked }, regionLabelsSeen, otherCapitalTags, varietyOverview };
}

export function countByEsKind(list: readonly SourceDisagreement[]): Array<{ kind: EsKind; open: number; resolved: number }> {
  return ES_KIND_ORDER.map((kind) => ({
    kind,
    open: list.filter((d) => d.field === kind && d.status === 'open').length,
    resolved: list.filter((d) => d.field === kind && d.status === 'resolved').length,
  }));
}

// ───────────────────────────── the word list ─────────────────────────────

const rowSources: Array<[string, string]> = [
  ['function-words', FUNCTION_ROWS], ['verbs', VERB_ROWS], ['nouns', NOUN_ROWS], ['modifiers', ADJECTIVE_ROWS],
  ['proper', PROPER_ROWS], ['regional', REGIONAL_ROWS], ['course', COURSE_ROWS],
];

export interface EsHandData {
  entries: EsHandEntry[];
  /** Entries whose tags and gender come from the rows. */
  fromRows: number;
  /** Entries of the older paradigm list in es.ts (explicit forms, no tags); their gender is read from the forms. */
  fromOldList: number;
}

const morphText = (m: Record<string, string>): string => Object.entries(m).map(([k, v]) => `${k}=${v}`).join(' ');

/**
 * The word list as the adapter holds it (`esLexicon`), with the row-level facts the lexicon does not keep (the gender,
 * the variety tags, which forms the row writes out) read back from the same row sources through the exported helpers of
 * spanish/entries.ts. An entry whose forms match what its row would build is a row entry; any other is of the older list.
 */
export function esHandData(): EsHandData {
  const first = new Map<string, EsRow>();
  for (const [label, src] of rowSources) for (const r of parseRows(src, label)) { const k = `${r.lemma}|${r.pos}`; if (!first.has(k)) first.set(k, r); }
  const out: EsHandEntry[] = [];
  let fromRows = 0;
  let fromOldList = 0;
  for (const e of esLexicon.entries) {
    const row = first.get(`${e.lemma}|${e.pos}`);
    const built = row ? buildRows([row]).entries[0] : undefined;
    const isRow = !!row && !!built && JSON.stringify(built.forms) === JSON.stringify(e.forms);
    const base: EsHandEntry = { lemma: e.lemma, pos: e.pos, gloss: e.gloss, varieties: [] };
    if (isRow && row) {
      fromRows++;
      if (row.gender) base.gender = row.gender;
      base.varieties = [...row.varieties];
      if (row.forms) base.forms = e.forms.filter((f) => f.form !== e.lemma).map((f) => ({ form: f.form, tags: morphText(f.morph) }));
    } else {
      fromOldList++;
      if (e.pos === 'NOUN') {
        const g = new Set(e.forms.flatMap((f) => (f.morph.Gender ?? '').split(',')));
        if (g.has('Masc') && g.has('Fem')) base.gender = 'mf'; else if (g.has('Masc')) base.gender = 'm'; else if (g.has('Fem')) base.gender = 'f';
      }
      const forms = e.forms.filter((f) => f.form !== e.lemma).map((f) => ({ form: f.form, tags: morphText(f.morph) }));
      if (forms.length) base.forms = forms;
    }
    out.push(base);
  }
  return { entries: out, fromRows, fromOldList };
}

/** Every headword the comparison needs from the file: the lemmas and the forms the word list writes out. */
export function wantedHeadwords(hand: readonly EsHandEntry[]): Set<string> {
  const s = new Set<string>();
  for (const e of hand) { s.add(nfc(e.lemma)); for (const f of e.forms ?? []) s.add(nfc(f.form)); }
  return s;
}

// ───────────────────────────── reading the file ─────────────────────────────

/** Lines of a plain or gzip (by extension) file. A damaged or cut-off gzip rejects with a clear message; nothing partial is returned. */
export async function* fileLines(file: string): AsyncGenerator<string> {
  const gz = file.toLowerCase().endsWith('.gz');
  const src = fs.createReadStream(file);
  let stream: NodeJS.ReadableStream = src;
  if (gz) {
    const gunzip = zlib.createGunzip();
    src.on('error', (e) => gunzip.destroy(e));
    src.pipe(gunzip);
    stream = gunzip;
  }
  const dec = new StringDecoder('utf8');
  let rest = '';
  try {
    for await (const chunk of stream) {
      rest += dec.write(chunk as Buffer);
      let at = rest.indexOf('\n');
      while (at >= 0) {
        yield rest.slice(0, at).replace(/\r$/, '');
        rest = rest.slice(at + 1);
        at = rest.indexOf('\n');
      }
    }
  } catch (e) {
    throw new Error(gz
      ? `${file}: the gzip file is damaged or incomplete (${e instanceof Error ? e.message : String(e)}); the download may not have finished`
      : `${file}: cannot read (${e instanceof Error ? e.message : String(e)})`);
  }
  rest += dec.end();
  if (rest.length) yield rest;
}

function sha256Of(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

export interface EsSourceInfo { file: string; bytes: number; sha256?: string; lastModified?: string }

export interface EsCompareFileOptions {
  input: string;
  dictionaryId: string;
  lastModified?: string;
  resolutionsFile: string;
  reportFile: string;
  jsonFile: string;
  /** The word list to compare (default: the adapter's own, `esHandData()`); tests pass a small one. */
  hand?: EsHandData;
  /** Skip the sha256 of the input (tests). */
  skipHash?: boolean;
}

export interface EsCompareFileResult {
  result: EsCompareResult;
  stats: EsDictStats;
  report: string;
  json: string;
  source: EsSourceInfo;
  hand: EsHandData;
}

export async function compareEsFile(opts: EsCompareFileOptions): Promise<EsCompareFileResult> {
  const hand = opts.hand ?? esHandData();
  const collector = createEsCollector(wantedHeadwords(hand.entries));
  for await (const line of fileLines(opts.input)) collector.addLine(line);
  const dict = collector.finish();
  if (dict.stats.entries === 0) throw new Error(`no usable Spanish entries in ${opts.input} (nothing written)`);
  if (dict.stats.lastLineMalformed) throw new Error(`${opts.input}: the last line is not valid JSON, so the file looks cut off (nothing written)`);

  let resolutionProblems: string[] = [];
  let resolutions = new Map<string, Resolution>();
  if (fs.existsSync(opts.resolutionsFile)) {
    let raw: unknown;
    try { raw = JSON.parse(fs.readFileSync(opts.resolutionsFile, 'utf8')); } catch (e) { throw new Error(`cannot read ${opts.resolutionsFile}: ${e instanceof Error ? e.message : String(e)} (it was left untouched)`); }
    const parsed = parseResolutions(raw);
    resolutions = parsed.map;
    resolutionProblems = parsed.problems;
  }

  const result = compareEsHandToDictionary(hand.entries, dict, { dictionaryId: opts.dictionaryId, resolutions });
  const source: EsSourceInfo = {
    file: path.relative(process.cwd(), opts.input).split(path.sep).join('/'),
    bytes: fs.statSync(opts.input).size,
    sha256: opts.skipHash ? undefined : await sha256Of(opts.input),
    lastModified: opts.lastModified,
  };
  const input: EsReportInput = { result, dictStats: dict.stats, source, hand, resolutionProblems };
  return { result, stats: dict.stats, report: renderEsReport(input), json: renderEsJson(input), source, hand };
}

/** Write both outputs, and an empty resolutions file when none exists (an existing one is never touched). */
export function writeEsOutputs(opts: Pick<EsCompareFileOptions, 'resolutionsFile' | 'reportFile' | 'jsonFile'>, out: EsCompareFileResult): void {
  for (const f of [opts.reportFile, opts.jsonFile, opts.resolutionsFile]) fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(opts.reportFile, out.report, 'utf8');
  fs.writeFileSync(opts.jsonFile, out.json, 'utf8');
  if (!fs.existsSync(opts.resolutionsFile)) fs.writeFileSync(opts.resolutionsFile, '{}\n', 'utf8');
}

/** The dictionary id: `--id`, else `kaikki-es@<Last-Modified date of headers-es.txt>`, else today's date. */
export function esDictionaryId(opts: { id?: string; headersText?: string; today: string }): { id: string; lastModified?: string } {
  if (opts.id) return { id: opts.id, lastModified: /@(\d{4}-\d{2}-\d{2})$/.exec(opts.id)?.[1] };
  const lastModified = opts.headersText ? lastModifiedFromHeaders(opts.headersText) : undefined;
  return { id: `kaikki-es@${lastModified ?? opts.today}`, lastModified };
}

// ───────────────────────────── report ─────────────────────────────

export interface EsReportInput {
  result: EsCompareResult;
  dictStats: EsDictStats;
  source: EsSourceInfo;
  hand: EsHandData;
  resolutionProblems?: string[];
}

const pct = (n: number, d: number): string => (d ? `${((100 * n) / d).toFixed(1)} %` : 'n/a');
const num = (n: number): string => n.toLocaleString('en-US');
const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
function table(head: string[], rows: string[][], textColumns = 1): string {
  return [`| ${head.join(' | ')} |`, `| ${head.map((_, i) => (i < textColumns ? '---' : '---:')).join(' | ')} |`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');
}

const KIND_TITLE: Record<EsKind, string> = {
  'missing': 'missing (the dictionary has no entry)',
  'part-of-speech': 'part of speech',
  'gender': 'gender',
  'meaning': 'meaning',
  'variety': 'variety (region)',
  'inflection': 'inflection (listed forms)',
};

const CAN_SHOW: Record<EsKind, string> = {
  'missing': 'Can show: the dictionary file has no entry with a meaning of its own for that headword (an entry that only says "form of X" or "alternative spelling of X" does not count). Cannot show: that the word list is at fault or that the word is not Spanish; Wiktionary may list the word under another spelling, may call it a form of another word, or may simply lack it. Proper names are compared for presence only.',
  'part-of-speech': 'Can show: none of the dictionary\'s parts of speech for the headword is the word list\'s, even after the equivalence table above. Cannot show which side is right: the two tag sets divide Spanish words differently, and a word that is a noun in one source and an adjective in the other (a substantivised adjective) is often not a mistake on either side. When this record is made the other comparisons for that entry are skipped.',
  'gender': 'Can show: for a noun the word list gives a gender, the dictionary\'s gender (read from the masculine / feminine tags on the senses of every noun entry of the headword, form-of senses included, else from the first argument of the head template, whichever is present; the report counts which was used) shares none with it. A word used with both genders, written mf here or "by personal gender" there, is compatible with either. Cannot show: that a gender is wrong. A spelling shared by two nouns (el cura, la cura) looks like a disagreement because the entries are read together; a dictionary that gives no gender is skipped, not counted as agreement.',
  'meaning': 'Can show: no content word of the word-list gloss appears in any gloss of the headword under a compatible part of speech. Cannot show that the meanings differ. This test is weak: a synonym, a paraphrase or a narrower sense looks exactly like a different meaning, and a gloss that happens to share a word with an unrelated sense passes. It is lenient on purpose: the gloss is tried as written, then in American spelling (centre / center), then for any whole word in common. A sense the dictionary words only as a form of another word (tía as "female equivalent of tío") has no English meaning in it, so such a word can be recorded here although the dictionary knows the meaning under the other word; the record then names that word. The comparison reads the first six glosses of each of the first 80 senses.',
  'variety': 'Can show: the word list places a word in a region (Honduras, Central America, Latin America, Spain, Mexico, the Caribbean, the Andes, the Río de la Plata) and the dictionary\'s region labels on the word\'s senses name no place inside or around it; or the word list says Honduras or Central America and the dictionary gives no region label at all (recorded as weaker, with that note). Both sides are quoted verbatim. Cannot show: that the word is not used in the region. A label records where Wiktionary\'s editors know a sense to be used; most senses carry none, and a missing label is not evidence against a regional word. The labels are read for the whole word under a compatible part of speech (form-of senses included, so a word the dictionary has only as "female equivalent of ..." is still compared), not sense by sense: a label on an unrelated meaning of the same spelling counts, in both directions (the note of a record says when none of the labelled senses shares a word with the word-list gloss). A region the word list names outside Honduras and Central America with no dictionary label is not recorded (counted as not comparable). The region table above is a judgment of which labels "inside or around" a region.',
  'inflection': 'Can show: for an entry whose forms the word list writes out itself (irregular paradigms, the closed classes), a listed form that the dictionary neither has as a form-of entry for the lemma nor lists in the lemma\'s own table of forms. Cannot show that the form is wrong: the dictionary may file it under another lemma, spell it differently or omit a rare form (the future subjunctive, for example). The grammatical tags written in the word list are not compared, only the existence of the form.',
};

/** The report: same input, byte-identical output (no clock; the only date is the one inside the dictionary id). */
export function renderEsReport(input: EsReportInput): string {
  const { result: r, dictStats: ds, source, hand } = input;
  const L: string[] = [];
  const counts = countByEsKind(r.disagreements);
  const total = r.disagreements.length;
  const open = r.disagreements.filter((d) => d.status === 'open').length;
  const cov = r.coverage;

  L.push(`# Spanish word list against the dictionary (${r.dictionaryId})`, '');
  L.push(`Dictionary data below is from ${KAIKKI_ATTRIBUTION}. Licence: ${KAIKKI_LICENCE}. Words and short glosses are quoted here as findings; the dictionary itself is not copied into the repository.`, '');
  L.push('Generated by `npm run dict:compare-es` (src/dict/compare-es.ts); do not edit by hand. The full list of disagreements is `data/review/es/disagreements.json`; decisions go in `data/review/es/resolutions.json`.', '');
  L.push('**The Spanish word list is machine-drafted: an AI model wrote it and no person has checked it. Nothing in this report is a decision.** The dictionary is a separately sourced layer, and where the two differ neither is chosen: the difference is recorded for a human reviewer. A record means "possibly different", never "wrong".', '');

  L.push('## Source', '');
  L.push(`- dictionary id: \`${r.dictionaryId}\``);
  L.push(`- file: \`${source.file}\``);
  if (source.lastModified) L.push(`- source last modified: ${source.lastModified}`);
  L.push(`- size: ${num(source.bytes)} bytes, ${num(ds.lines + ds.blank)} lines${source.sha256 ? `, sha256 \`${source.sha256}\`` : ''}`);
  L.push(`- read: ${num(ds.entries)} Spanish entries from ${num(ds.lines)} lines (${num(ds.malformed)} malformed); ${num(ds.kept)} kept (headwords that are a word-list lemma or one of its listed forms)`);
  L.push(`- word list: ${num(cov.entries)} entries (${num(cov.distinctLemmas)} distinct lemmas); ${num(hand.fromRows)} read with their row tags, ${num(hand.fromOldList)} from the older paradigm list in es.ts (no variety tags; gender read from their listed forms)`, '');

  L.push('## Coverage', '');
  L.push(table(['', 'count', 'share'], [
    ['word-list entries (lemma + part of speech)', num(cov.entries), ''],
    ['distinct lemmas', num(cov.distinctLemmas), ''],
    ['lemmas that are a headword of the dictionary at all', num(cov.lemmasAnyEntry), pct(cov.lemmasAnyEntry, cov.distinctLemmas)],
    ['lemmas with an entry that has a meaning of its own (found)', num(cov.lemmasWithOwnEntry), pct(cov.lemmasWithOwnEntry, cov.distinctLemmas)],
    ['entries found under a compatible part of speech', num(cov.entriesCompatible), pct(cov.entriesCompatible, cov.entries)],
  ], 1), '');
  L.push(table(['part of speech', 'entries', 'found (own entry)', 'compatible part of speech'], cov.byPos.map((p) => [p.pos, num(p.entries), `${num(p.found)} (${pct(p.found, p.entries)})`, `${num(p.compatible)} (${pct(p.compatible, p.entries)})`]), 1), '');

  L.push('## Disagreements by kind', '');
  L.push(table(['kind', 'open', 'resolved'], [...counts.map((c) => [c.kind, num(c.open), num(c.resolved)]), ['all', num(open), num(total - open)]]), '');
  L.push('Comparisons actually made (a kind with no record is only meaningful next to how many were made):', '');
  const CHECKED: Array<[string, string]> = [
    ['partOfSpeechChecked', 'entries whose lemma has a dictionary entry with a meaning of its own (proper names excluded)'],
    ['genderChecked', 'nouns with a gender, compared with a gender the dictionary gives'],
    ['genderFromTags', '  of those, dictionary gender read from the sense tags'],
    ['genderFromHeadTemplate', '  of those, dictionary gender read from the head template (no gender tag present)'],
    ['meaningChecked', 'word-list glosses with a content word, compared with the glosses of the headword'],
    ['varietyChecked', 'entries tagged with a region, compared with the dictionary\'s region labels'],
    ['inflectionChecked', 'listed forms compared with the dictionary\'s forms of the lemma'],
  ];
  for (const [k, why] of CHECKED) L.push(`- ${num(r.checked[k] ?? 0)}: ${why.trim()}`);
  L.push('');
  if (Object.keys(r.notComparable).length) {
    L.push('Comparisons that could not be made (not counted above):', '');
    for (const [why, n] of Object.entries(r.notComparable).sort(([a], [b]) => (a < b ? -1 : 1))) L.push(`- ${num(n)}: ${why}`);
    L.push('');
  }
  if (r.staleResolutions.length) L.push(`Resolutions whose id matches no current disagreement (kept in resolutions.json): ${r.staleResolutions.length}.`, '');
  if (input.resolutionProblems?.length) L.push('Entries of resolutions.json that could not be read:', '', ...input.resolutionProblems.map((p) => `- ${p}`), '');

  L.push('## Part-of-speech equivalence', '');
  L.push('A word-list part of speech counts as matched when the dictionary has an entry (with a meaning of its own) of any of these Wiktionary parts of speech. Only a lemma with none of them is recorded. The table is a judgment, deliberately loose; it is also the filter for the gender, meaning, variety and inflection comparisons.', '');
  L.push(table(['word list', 'dictionary parts of speech accepted'], (Object.entries(ES_POS_COMPATIBLE) as Array<[string, readonly string[]]>).filter(([p]) => p !== 'CLF' && p !== 'PUNCT' && p !== 'X').map(([p, ok]) => [p, ok.join(', ')]), 2), '');
  L.push('PROPN is compared for presence only: no part-of-speech, gender or meaning test.', '');

  L.push('## Region equivalence (variety)', '');
  L.push('A word-list region matches when some dictionary region label on the word\'s senses is the region itself, a place inside it, or a wider region around it:', '');
  L.push(table(['word list', 'region', 'dictionary labels inside', 'dictionary labels around'], Object.entries(REGION_RULES).map(([code, rule]) => [code, rule.name, rule.inside.join(', '), rule.around.join(', ') || '(none)']), 4), '');
  const seen = Object.entries(r.regionLabelsSeen).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  L.push(`Region labels the dictionary actually gives to word-list lemmas (verbatim, with the number of entries carrying each): ${seen.length ? seen.map(([k, n]) => `${k} ${num(n)}`).join(', ') : '(none)'}.`, '');
  const other = Object.entries(r.otherCapitalTags).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  L.push(`Capitalised sense tags on word-list lemmas that this tool does not read as a region (if one of them is a place, the variety comparison is blind to it): ${other.length ? other.map(([k, n]) => `${k} ${num(n)}`).join(', ') : '(none)'}.`, '');

  L.push('## What each comparison can and cannot show', '');
  for (const k of ES_KIND_ORDER) L.push(`**${KIND_TITLE[k]}.** ${CAN_SHOW[k]}`, '');
  L.push('All of them compare the word list with the dictionary as this tool reads it. A sense the tool does not read, a gloss beyond the caps or a region label not in the table above is invisible here.', '');

  const variety = r.disagreements.filter((d) => d.field === 'variety');
  L.push(`## Variety: all ${num(variety.length)} records`, '');
  L.push('Every region-tagged entry in the word list is unverified; these are the ones where the dictionary names another place or names none. Both sides verbatim.', '');
  if (variety.length) L.push(table(['lemma', 'word list says', 'dictionary says', 'note', 'status'], variety.map((d) => [d.id.slice('es:variety:'.length), d.ours.value, d.theirs.value, d.theirs.value.startsWith('(no region label') ? 'dictionary gives no region (weaker)' : 'dictionary names another region', d.status]), 5), '');

  const ov = r.varietyOverview;
  L.push(`### Every Honduran and Central American entry of the word list: ${num(ov.length)}`, '');
  L.push('All entries tagged es-HN or es-CA, with or without a record, so that the whole unverified set is in one place. "label matches" means only that some sense of the word carries a label for the region, a place inside it or a region around it (Latin America counts for a Honduran word): it is not a check of the meaning, and not a confirmation by a speaker. "not in the dictionary" entries are in the `missing` list.', '');
  const tally = new Map<string, number>();
  for (const v of ov) tally.set(v.outcome, (tally.get(v.outcome) ?? 0) + 1);
  if (ov.length) {
    L.push([...tally.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, n]) => `${k}: ${num(n)}`).join('; ') + '.', '');
    L.push(table(['lemma', 'word list says', 'dictionary says', 'outcome'], ov.map((v) => [`${v.lemma}:${v.pos}`, v.ours, v.theirs, v.outcome]), 4), '');
  } else L.push('None.', '');

  L.push('## First 40 of each other kind', '');
  L.push('Sorted by lemma in code-unit order. The full list is `data/review/es/disagreements.json`.', '');
  for (const k of ES_KIND_ORDER) {
    if (k === 'variety') continue;
    const list = r.disagreements.filter((d) => d.field === k);
    L.push(`### ${KIND_TITLE[k]}: ${num(list.length)}`, '');
    if (!list.length) { L.push('None.', ''); continue; }
    L.push(table(['lemma', 'word list', 'dictionary', 'status'], list.slice(0, 40).map((d) => [d.id.slice(`es:${k}:`.length), d.ours.value, d.theirs.value, d.status]), 4), '');
  }

  L.push('## Method notes', '');
  L.push('Dictionary entries by part of speech as the file gives them:', '');
  L.push(Object.entries(ds.posCounts).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([k, n]) => `${k} ${num(n)}`).join(', '), '');
  return `${L.join('\n')}\n`;
}

/** The review file: every disagreement (open and resolved), deterministic order, with the attribution beside the dictionary's words. */
export function renderEsJson(input: EsReportInput): string {
  const { result: r, source } = input;
  const out = {
    schema: COMPARE_SCHEMA,
    note: 'Possible differences between the machine-drafted Spanish word list and the dictionary, recorded for a human reviewer. Neither side is chosen. Decisions belong in resolutions.json, keyed by id. Generated by npm run dict:compare-es.',
    attribution: `Dictionary data: ${KAIKKI_ATTRIBUTION}. Licence: ${KAIKKI_LICENCE}.`,
    dictionary: { id: r.dictionaryId, file: source.file, sha256: source.sha256, lastModified: source.lastModified },
    counts: Object.fromEntries(countByEsKind(r.disagreements).map((c) => [c.kind, { open: c.open, resolved: c.resolved }])),
    disagreements: r.disagreements,
  };
  return `${JSON.stringify(out, null, 2)}\n`;
}
