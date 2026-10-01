/**
 * Hand data against the dictionary: coverage and recorded disagreements. Pure and browser-safe (no node modules);
 * the file reading and the report writing live in compare-node.ts / compare-report.ts, the extraction of the hand data
 * from the Thai adapter in compare-hand.ts.
 *
 * The rule of the course owner: the dictionary is a separately sourced layer, and where the hand data and the
 * dictionary differ, neither is chosen. This module produces the RECORD of the differences (`SourceDisagreement`, all
 * 'open' unless a person has decided, see `applyResolutions`) and the coverage numbers. A difference found here is
 * "possibly different", never "wrong": every comparison below says in its own docs what it can and cannot show.
 */
import type { DictionaryEntry, LanguageCode, PartOfSpeech, RegisterTag, SourceDisagreement } from '../core';
import { decodeThaiRespelling, tonesFromIpa } from '../adapters/thai/orthography';
import { entryFromKaikki } from './map';
import { cleanRespelling, glossesOverlap, isBracketOnly, respellingSyllables, romanSkeleton } from './compare-text';

export const COMPARE_SCHEMA = 1;

// ───────────────────────────── inputs ─────────────────────────────

export type HandCategory = 'function' | 'classifier' | 'core';
export const HAND_CATEGORIES: readonly HandCategory[] = ['function', 'classifier', 'core'];

export interface HandEntry {
  form: string;
  pos: PartOfSpeech;
  gloss: string;
  category: HandCategory;
  register?: RegisterTag[];
  role?: string;
  counts?: string;
  /** The course's own romanization (loose, toneless), where an author supplied one. */
  translit?: string;
}

export interface HandPhrase { form: string; gloss: string; kind?: string }

/** A word of the engine's exception lists: THAI_ORTH_EXCEPTIONS ('exception') or THAI_ORTH_SETTLED ('settled'). */
export interface HandException {
  surface: string;
  respelling: string;
  list: 'exception' | 'settled';
  note?: string;
  /** The tones the engine reads from the respelling, one per syllable (undefined where it cannot say). Absent: not computed. */
  tones?: ReadonlyArray<string | undefined>;
}

export interface HandData {
  lang: LanguageCode;
  /** `adapter-th@2:hand`, `adapter-th@2:phrases`, `adapter-th@2:orth-exceptions`. */
  sourceIds: { hand: string; phrases: string; orthExceptions: string };
  entries: HandEntry[];
  phrases: HandPhrase[];
  compounds: string[];
  exceptions: HandException[];
}

/** Everything the comparison needs to know about the dictionary, gathered in one pass over the source file. */
export interface DictStats {
  lines: number;
  blank: number;
  malformed: number;
  /** Lines that produced no entry (skipped by the mapper). */
  noEntry: number;
  /** Entries the mapper produced (before any merging). */
  entries: number;
  forms: number;
  formsWithRespelling: number;
  formsWithIpa: number;
  formsWithRomanization: number;
  formsWithAnyPronunciation: number;
  /** Entries per part of speech ('(none)' when the mapper leaves it out). */
  posCounts: Record<string, number>;
  /** How often each register tag occurs on an entry, in the whole dictionary. */
  registerCounts: Record<string, number>;
  /** Every headword some entry lists as a classifier it takes, plus every headword that is itself a classifier. */
  classifierForms: Set<string>;
}

export interface DictCollection {
  /** Entries of the wanted forms only (the file is 50 MB; nothing else is kept). */
  index: Map<string, DictionaryEntry[]>;
  stats: DictStats;
}

const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;

/** True when the entry (or any pronunciation row it carries) has the given reading. */
const hasReading = (e: DictionaryEntry, k: 'respelling' | 'ipa' | 'romanization'): boolean =>
  isStr(e[k]) || (e.pronunciations ?? []).some((p) => isStr(p[k]));

export interface DictCollector {
  addLine(raw: string): void;
  finish(): DictCollection;
}

/**
 * Feed the source line by line; the mapper (`entryFromKaikki`) decides what a line means. Entries of `wanted` forms are
 * kept whole, the rest are only counted (pronunciation coverage, part of speech, register vocabulary, classifier list).
 */
export function createDictCollector(opts: { lang: LanguageCode; normalize: (s: string) => string; wanted: ReadonlySet<string> }): DictCollector {
  const { lang, normalize, wanted } = opts;
  const index = new Map<string, DictionaryEntry[]>();
  const bits = new Map<string, number>(); // per form: 1 respelling, 2 ipa, 4 romanization
  const stats: DictStats = {
    lines: 0, blank: 0, malformed: 0, noEntry: 0, entries: 0, forms: 0, formsWithRespelling: 0, formsWithIpa: 0,
    formsWithRomanization: 0, formsWithAnyPronunciation: 0, posCounts: {}, registerCounts: {}, classifierForms: new Set(),
  };
  let first = true;
  return {
    addLine(raw) {
      let text = raw;
      if (first) { first = false; text = text.replace(/^﻿/, ''); }
      text = text.trim();
      if (!text) { stats.blank++; return; }
      stats.lines++;
      let json: unknown;
      try { json = JSON.parse(text); } catch { stats.malformed++; return; }
      const entries = entryFromKaikki(json, normalize, lang);
      if (!entries.length) { stats.noEntry++; return; }
      for (const e of entries) {
        stats.entries++;
        const pos = e.pos ?? '(none)';
        stats.posCounts[pos] = (stats.posCounts[pos] ?? 0) + 1;
        for (const r of e.register ?? []) stats.registerCounts[r] = (stats.registerCounts[r] ?? 0) + 1;
        if (e.pos === 'CLF') stats.classifierForms.add(e.form);
        for (const c of e.classifiers ?? []) if (isStr(c)) stats.classifierForms.add(normalize(c));
        const b = (hasReading(e, 'respelling') ? 1 : 0) | (hasReading(e, 'ipa') ? 2 : 0) | (hasReading(e, 'romanization') ? 4 : 0);
        bits.set(e.form, (bits.get(e.form) ?? 0) | b);
        if (wanted.has(e.form)) {
          const list = index.get(e.form);
          if (list) list.push(e); else index.set(e.form, [e]);
        }
      }
    },
    finish() {
      stats.forms = bits.size;
      for (const b of bits.values()) {
        if (b & 1) stats.formsWithRespelling++;
        if (b & 2) stats.formsWithIpa++;
        if (b & 4) stats.formsWithRomanization++;
        if (b) stats.formsWithAnyPronunciation++;
      }
      return { index, stats };
    },
  };
}

// ───────────────────────────── part of speech ─────────────────────────────

/**
 * Which dictionary parts of speech count as "the same kind of word" as a hand one. Wiktionary and the course tag set
 * differ systematically (no AUX or SCONJ in Wiktionary; Thai adjectives are stative verbs; many classifiers are
 * filed as nouns), so only a hand POS with NONE of these in the dictionary is recorded. Printed in the report.
 */
export const POS_COMPATIBLE: Readonly<Record<PartOfSpeech, readonly PartOfSpeech[]>> = {
  NOUN: ['NOUN', 'PROPN', 'CLF'],
  PROPN: ['PROPN', 'NOUN'],
  VERB: ['VERB', 'AUX', 'ADJ'],
  AUX: ['AUX', 'VERB', 'ADV', 'PART'],
  ADJ: ['ADJ', 'VERB', 'ADV', 'DET', 'NUM'],
  ADV: ['ADV', 'ADJ', 'PART', 'ADP', 'CONJ', 'DET', 'VERB'],
  PRON: ['PRON', 'NOUN', 'DET'],
  DET: ['DET', 'ADJ', 'PRON', 'NUM', 'ADV'],
  ADP: ['ADP', 'CONJ', 'NOUN', 'VERB', 'ADV'],
  CONJ: ['CONJ', 'SCONJ', 'ADP', 'ADV', 'PART'],
  SCONJ: ['SCONJ', 'CONJ', 'PRON', 'ADP', 'NOUN', 'PART'],
  PART: ['PART', 'ADV', 'INTJ', 'CONJ', 'AUX'],
  NUM: ['NUM', 'ADJ', 'DET', 'NOUN'],
  INTJ: ['INTJ', 'PART', 'VERB'],
  CLF: ['CLF', 'NOUN'],
  PUNCT: ['PUNCT'],
  X: ['X'],
};

/** Parts of speech the mapper leaves out or marks 'X' say nothing about the kind of word: they cannot confirm or contradict. */
const informative = (e: DictionaryEntry): e is DictionaryEntry & { pos: PartOfSpeech } => e.pos !== undefined && e.pos !== 'X';

// ───────────────────────────── records ─────────────────────────────

export type DisagreementKind = SourceDisagreement['field'];
export const KIND_ORDER: readonly DisagreementKind[] = [
  'missing', 'part-of-speech', 'meaning', 'register', 'classifier', 'tone', 'syllables', 'pronunciation', 'segmentation',
];

const SHORT = 90;
const clip = (s: string, n = SHORT): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const glossList = (es: readonly DictionaryEntry[], max = 5): string => {
  const out: string[] = [];
  for (const e of es) for (const g of e.glosses) if (!out.includes(g) && out.length < max) out.push(g);
  return out.map((g) => clip(g, 60)).join(' | ');
};

class Recorder {
  readonly list: SourceDisagreement[] = [];
  private readonly ids = new Set<string>();
  constructor(private readonly lang: LanguageCode, private readonly theirsId: string) {}
  add(kind: DisagreementKind, key: string, form: string, oursId: string, ours: string, theirs: string, note: string): void {
    let id = `${this.lang}:${kind}:${key}`;
    for (let n = 2; this.ids.has(id); n++) id = `${this.lang}:${kind}:${key}#${n}`;
    this.ids.add(id);
    this.list.push({
      id, lang: this.lang, form, field: kind, ours: { sourceId: oursId, value: ours }, theirs: { sourceId: this.theirsId, value: theirs },
      note, status: 'open',
    });
  }
}

// ───────────────────────────── coverage ─────────────────────────────

export interface CoverageRow {
  /** Row label: 'function words', 'classifiers', 'core vocabulary', 'phrase units', 'course compounds', 'exception-list words'. */
  label: string;
  total: number;
  distinctForms: number;
  byForm: number;
  /** Form + part of speech, exactly equal (hand rows only). */
  byFormPos?: number;
  /** Form + a part of speech from the compatible table. */
  byFormPosCompatible?: number;
}

export interface PronunciationCoverage {
  dictionary: { forms: number; withRespelling: number; withIpa: number; withRomanization: number; withAny: number };
  hand: {
    entries: number;
    distinctForms: number;
    /** Hand entries with an author-supplied romanization. */
    withOwnRomanization: number;
    /** Distinct hand forms found in the dictionary, and how many of those have each reading there. */
    formsInDictionary: number;
    dictRespelling: number;
    dictIpa: number;
    dictRomanization: number;
    dictAny: number;
  };
}

export interface CorpusToken { form: string; hand: boolean }
export interface CorpusDoc { name: string; tokens: CorpusToken[] }
export interface CorpusCoverageRow {
  name: string;
  tokens: number;
  types: number;
  withHand: number;
  withDictionary: number;
  withDictionaryPronunciation: number;
  /** Neither a hand analysis nor a dictionary entry. */
  neither: number;
}

const readingKinds = (es: readonly DictionaryEntry[]): number =>
  es.reduce((b, e) => b | (hasReading(e, 'respelling') ? 1 : 0) | (hasReading(e, 'ipa') ? 2 : 0) | (hasReading(e, 'romanization') ? 4 : 0), 0);

/** Share of the word tokens of each document that the hand lexicon / the dictionary / neither can say something about. */
export function corpusCoverage(docs: readonly CorpusDoc[], dict: DictCollection): { rows: CorpusCoverageRow[]; total: CorpusCoverageRow } {
  const rows: CorpusCoverageRow[] = [];
  const total: CorpusCoverageRow = { name: 'all', tokens: 0, types: 0, withHand: 0, withDictionary: 0, withDictionaryPronunciation: 0, neither: 0 };
  const allTypes = new Set<string>();
  for (const d of [...docs].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const r: CorpusCoverageRow = { name: d.name, tokens: 0, types: 0, withHand: 0, withDictionary: 0, withDictionaryPronunciation: 0, neither: 0 };
    const types = new Set<string>();
    for (const t of d.tokens) {
      const es = dict.index.get(t.form);
      r.tokens++;
      types.add(t.form); allTypes.add(t.form);
      if (t.hand) r.withHand++;
      if (es?.length) r.withDictionary++;
      if (es?.length && readingKinds(es)) r.withDictionaryPronunciation++;
      if (!t.hand && !es?.length) r.neither++;
    }
    r.types = types.size;
    rows.push(r);
    for (const k of ['tokens', 'withHand', 'withDictionary', 'withDictionaryPronunciation', 'neither'] as const) total[k] += r[k];
  }
  total.types = allTypes.size;
  return { rows, total };
}

// ───────────────────────────── the comparison ─────────────────────────────

export interface Resolution { by: string; at: string; decision: 'ours' | 'theirs' | 'both' | 'neither'; note?: string }

export interface CompareOptions {
  dictionaryId: string;
  resolutions?: ReadonlyMap<string, Resolution>;
}

export interface CompareResult {
  dictionaryId: string;
  handCounts: { entries: number; distinctForms: number; phrases: number; compounds: number; exceptions: number; settled: number };
  coverage: CoverageRow[];
  pronunciation: PronunciationCoverage;
  disagreements: SourceDisagreement[];
  /** Comparisons that could not be made, by reason: not an error, a limit of the source or of the wording. */
  notComparable: Record<string, number>;
  /** Resolution ids that match no current disagreement (kept in the file, listed in the report). */
  staleResolutions: string[];
  /** How many comparisons of each kind could actually be made. */
  checked: Record<string, number>;
  /** Register vocabulary and strong labels, as used. */
  method: { registerVocabulary: string[]; strongLabels: string[] };
}

const REGISTER_MIN_COUNT = 5;
/** Parts of speech whose glosses are mostly small words ("for", "which", "not"), which then count in the gloss comparison. */
const FUNCTION_POS: ReadonlySet<PartOfSpeech> = new Set<PartOfSpeech>(['ADP', 'CONJ', 'SCONJ', 'PART', 'AUX', 'DET', 'PRON', 'ADV', 'INTJ']);
/** Labels strong enough that a dictionary carrying one on the main sense is worth a look when the hand entry has none. */
export const STRONG_LABELS: readonly string[] = ['slang', 'archaic', 'royal'];
/** Raw sense tags that mean the same as a strong label or are stronger still (not RegisterTag values). */
const STRONG_RAW_TAGS: readonly string[] = ['vulgar', 'offensive', 'derogatory'];

const uniq = <T>(xs: readonly T[]): T[] => [...new Set(xs)];

/** The dictionary's readings of one form, in file order. */
interface Reading { respelling?: string; ipa?: string; romanization?: string; tags: string[] }
function readingsOf(es: readonly DictionaryEntry[]): Reading[] {
  const out: Reading[] = [];
  const seen = new Set<string>();
  const push = (r: Reading) => {
    if (!r.respelling && !r.ipa && !r.romanization) return;
    const key = `${r.respelling ?? ''}|${r.ipa ?? ''}|${r.romanization ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(r);
  };
  for (const e of es) {
    push({ respelling: e.respelling, ipa: e.ipa, romanization: e.romanization, tags: [] });
    for (const p of e.pronunciations ?? []) push({ respelling: p.respelling, ipa: p.ipa, romanization: p.romanization, tags: (p.tags ?? []).map((t) => t.toLowerCase()) });
  }
  return out;
}

/** What the spelling engine hears in a respelling: one "romanization:tone" per syllable; undefined when it cannot read it. */
function soundKey(surface: string, respelling: string): string | undefined {
  try {
    const syl = decodeThaiRespelling(surface, respelling);
    if (!syl.length || syl.some((x) => !x.romanization || !x.tone)) return undefined;
    return syl.map((x) => `${x.romanization}:${x.tone}`).join(' ');
  } catch { return undefined; }
}

const ipaSyllableCount = (ipa: string): number => tonesFromIpa(ipa).length;

export function compareHandToDictionary(hand: HandData, dict: DictCollection, opts: CompareOptions): CompareResult {
  const lang = hand.lang;
  const rec = new Recorder(lang, opts.dictionaryId);
  const notComparable: Record<string, number> = {};
  const skip = (why: string) => { notComparable[why] = (notComparable[why] ?? 0) + 1; };
  const counters = { partOfSpeechChecked: 0, meaningChecked: 0, registerChecked: 0, classifierChecked: 0, romanizationChecked: 0, syllablesChecked: 0, toneChecked: 0, respellingChecked: 0 };
  const idx = dict.index;
  const vocab = Object.entries(dict.stats.registerCounts).filter(([, n]) => n >= REGISTER_MIN_COUNT).map(([t]) => t).sort();
  const vocabSet = new Set(vocab);
  const handOurs = hand.sourceIds.hand;

  // ── coverage ──
  const coverage: CoverageRow[] = [];
  const labels: Record<HandCategory, string> = { function: 'function words', classifier: 'classifiers', core: 'core vocabulary' };
  const compatIn = (pos: PartOfSpeech, es: readonly DictionaryEntry[]) => es.some((e) => e.pos !== undefined && POS_COMPATIBLE[pos].includes(e.pos));
  const forAll = (rows: HandEntry[], label: string): CoverageRow => ({
    label, total: rows.length, distinctForms: new Set(rows.map((r) => r.form)).size,
    byForm: rows.filter((r) => idx.has(r.form)).length,
    byFormPos: rows.filter((r) => (idx.get(r.form) ?? []).some((e) => e.pos === r.pos)).length,
    byFormPosCompatible: rows.filter((r) => compatIn(r.pos, idx.get(r.form) ?? [])).length,
  });
  coverage.push(forAll(hand.entries, 'all hand entries'));
  for (const c of HAND_CATEGORIES) coverage.push(forAll(hand.entries.filter((e) => e.category === c), labels[c]));
  const formRow = (label: string, forms: string[]): CoverageRow => ({
    label, total: forms.length, distinctForms: new Set(forms).size, byForm: forms.filter((f) => idx.has(f)).length,
  });
  coverage.push(formRow('phrase units (as headwords)', hand.phrases.map((p) => p.form)));
  coverage.push(formRow('course compounds', hand.compounds));
  coverage.push(formRow('exception-list words', hand.exceptions.map((e) => e.surface)));

  // ── missing ──
  const seenMissing = new Set<string>();
  const missing = (group: string, form: string, oursId: string, ours: string) => {
    const k = `${group}:${form}`;
    if (seenMissing.has(k) || idx.has(form)) return;
    seenMissing.add(k);
    rec.add('missing', `${group}:${form}`, form, oursId, ours, '(no entry for this form)',
      'Not a finding against either source: the dictionary has no entry the mapper could read for this written form. It may list it under a different spelling or not at all.');
  };
  const handForms = new Map<string, HandEntry[]>();
  for (const e of hand.entries) handForms.set(e.form, [...(handForms.get(e.form) ?? []), e]);
  for (const [form, rows] of handForms) missing('hand', form, handOurs, rows.map((r) => `${r.pos}: ${r.gloss}`).join(' / '));
  for (const p of hand.phrases) missing('phrase', p.form, hand.sourceIds.phrases, `phrase unit: ${p.gloss}`);
  for (const c of hand.compounds) missing('compound', c, handOurs, 'course compound (kept as one word)');
  for (const x of hand.exceptions) missing('orth-exceptions', x.surface, hand.sourceIds.orthExceptions, `${x.list} list: ${x.respelling}`);

  // ── per hand entry: part of speech, meaning, register, classifier, romanization ──
  for (const e of hand.entries) {
    const es = idx.get(e.form);
    if (!es?.length) continue;
    const key = `${e.form}:${e.pos}`;

    // part of speech
    const informativeEs = es.filter(informative);
    if (!informativeEs.length) skip('part of speech: the dictionary entry has no usable part of speech');
    else if ((counters.partOfSpeechChecked++, !informativeEs.some((d) => POS_COMPATIBLE[e.pos].includes(d.pos)))) {
      rec.add('part-of-speech', key, e.form, handOurs, e.pos, uniq(informativeEs.map((d) => d.pos)).join(', '),
        `Possibly different: none of the dictionary's parts of speech for this form is ${e.pos} or a usual equivalent (${POS_COMPATIBLE[e.pos].join(', ')}). The two sources divide words differently (the course has AUX and SCONJ, Wiktionary files Thai adjectives and auxiliaries as verbs), so a reviewer should look before concluding anything.`);
    }

    // meaning
    if (isBracketOnly(e.gloss)) skip('meaning: the course gloss is only a bracketed description of a function (particle, marker, classifier)');
    else {
      const theirGlosses = es.flatMap((d) => [...d.glosses, ...(d.senses ?? []).map((s) => s.gloss)]);
      const overlap = glossesOverlap(e.gloss, theirGlosses, FUNCTION_POS.has(e.pos));
      counters.meaningChecked += overlap === undefined ? 0 : 1;
      if (overlap === undefined) skip('meaning: the course gloss has no content word to compare');
      else if (!overlap) {
        rec.add('meaning', key, e.form, handOurs, e.gloss, glossList(es, 6),
          'Possibly different: no content word of the course gloss appears in any dictionary gloss of this form (compared lower-case, without stop words and bracketed remarks, lightly stemmed; English pronouns are matched as "first / second / third person"). The wording may simply differ, or the two may describe different senses of the word; the comparison cannot tell a synonym from a different meaning.');
      }
    }

    // register: only against entries of a usual-equivalent part of speech when there are any
    const handRegs = e.register ?? [];
    const rel = es.some((d) => informative(d) && POS_COMPATIBLE[e.pos].includes(d.pos)) ? es.filter((d) => informative(d) && POS_COMPATIBLE[e.pos].includes(d.pos)) : es;
    const dictRegs = uniq(rel.flatMap((d) => d.register ?? []));
    const notes: string[] = [];
    for (const t of handRegs) {
      if (!vocabSet.has(t)) { skip(`register: the dictionary has no usable label for "${t}"`); continue; }
      counters.registerChecked++;
      if (!dictRegs.includes(t)) notes.push(`the course marks it ${t}; the dictionary's labels for this form ${dictRegs.length ? `are ${dictRegs.join(', ')}` : 'carry none'}`);
    }
    // a strong label counts only when it sits on every sense of the form (not on one old or rare sense among several)
    const wholeEntryLabel = (label: string): boolean =>
      rel.length > 0 && rel.every((d) => (d.senses?.length
        ? d.senses.every((x) => (x.tags ?? []).some((t) => t.toLowerCase() === label))
        : d.glosses.length === 1 && (d.register ?? []).includes(label as RegisterTag)));
    const strong: string[] = [];
    for (const label of [...STRONG_LABELS, ...STRONG_RAW_TAGS]) {
      if (handRegs.includes(label as RegisterTag) || !wholeEntryLabel(label)) continue;
      strong.push(label);
      notes.push(`the dictionary labels every sense "${label}"; the course entry carries no such tag`);
    }
    if (notes.length) {
      rec.add('register', key, e.form, handOurs, handRegs.length ? handRegs.join(', ') : '(no register tag)',
        [...dictRegs, ...strong.filter((x) => !dictRegs.includes(x as RegisterTag))].join(', ') || '(no register label)',
        `Possibly different: ${notes.join('; ')}. Wiktionary labels sparingly, so a missing label is weak evidence; a label it does give is a statement about senses, not about the word in every use.`);
    }

    // classifier
    if (e.pos === 'CLF') counters.classifierChecked++;
    if (e.pos === 'CLF' && !dict.stats.classifierForms.has(e.form)) {
      rec.add('classifier', e.form, e.form, handOurs, `CLF: ${e.gloss}`, uniq(es.map((d) => d.pos ?? '(none)')).join(', '),
        'Possibly different: the dictionary has this form but neither as a classifier nor in any entry\'s list of classifiers. It may file it under noun only, or leave the classifier information out.');
    }
  }

  // ── pronunciation: hand romanizations (translit) ──
  const translitDone = new Set<string>();
  for (const e of hand.entries) {
    if (!e.translit) continue;
    const es = idx.get(e.form);
    if (!es?.length) continue;
    const k = `${e.form}|${e.translit}`;
    if (translitDone.has(k)) continue;
    translitDone.add(k);
    const readings = readingsOf(es).filter((r) => r.romanization);
    if (!readings.length) { skip('romanization: the dictionary has no romanization for the form'); continue; }
    counters.romanizationChecked++;
    const mine = romanSkeleton(e.translit, 'rtgs');
    const agrees = readings.some((r) => {
      const system = r.tags.includes('royal institute') ? 'rtgs' : 'paiboon';
      return romanSkeleton(r.romanization!, system) === mine;
    });
    if (!agrees) {
      rec.add('pronunciation', `hand-romanization:${e.form}:${e.pos}`, e.form, handOurs, e.translit, uniq(readings.map((r) => r.romanization!)).join(' | '),
        'Possibly different: the course romanization matches none of the listed romanizations after folding both to a coarse letter skeleton (tones, vowel length and the Paiboon/RTGS initial differences are ignored). Two romanization systems are being compared; a difference may be the system, not the sound.');
    }
  }

  // ── pronunciation: exception and settled lists ──
  for (const x of hand.exceptions) {
    const es = idx.get(x.surface);
    if (!es?.length) continue;
    const readings = readingsOf(es);
    if (!readings.length) { skip('exception words: the dictionary entry lists no pronunciation'); continue; }
    const ours = cleanRespelling(x.respelling);
    const oursN = respellingSyllables(ours).length;
    const listTag = x.list;
    const key = `${listTag}:${x.surface}`;
    const theirCounts = uniq(readings.map((r) => (r.respelling ? respellingSyllables(cleanRespelling(r.respelling)).length : r.ipa ? ipaSyllableCount(r.ipa) : 0)).filter((n) => n > 0));
    const showTheirs = (): string => uniq(readings.map((r) => [r.respelling, r.ipa].filter(Boolean).join(' ')).filter(Boolean)).join(' | ');
    if (!theirCounts.length) { skip('exception words: no readable syllable structure in the dictionary reading'); continue; }
    counters.syllablesChecked++;
    if (!theirCounts.includes(oursN)) {
      rec.add('syllables', key, x.surface, hand.sourceIds.orthExceptions, `${ours} (${oursN})`, `${showTheirs()} (${theirCounts.join(' / ')})`,
        `Possibly different: the course reading has ${oursN} syllable${oursN === 1 ? '' : 's'}; no listed dictionary reading has that many. The divisions of linking syllables in Pali and Sanskrit loans are often written differently.`);
      continue;
    }
    // tone: any reading with the same number of syllables whose tones all agree
    const ourTones = x.tones;
    let toneComparable = false;
    let toneAgrees = false;
    if (ourTones && ourTones.length === oursN) {
      for (const r of readings) {
        if (!r.ipa) continue;
        const theirTones = tonesFromIpa(r.ipa);
        if (theirTones.length !== oursN) continue;
        const pairs = theirTones.map((t, i) => [t, ourTones[i]] as const).filter(([t, o]) => t !== undefined && o !== undefined);
        if (!pairs.length) continue;
        toneComparable = true;
        if (pairs.every(([t, o]) => t === o)) { toneAgrees = true; break; }
      }
    }
    if (!ourTones || ourTones.length !== oursN) skip('exception words: the engine did not read a tone for every syllable of the course respelling');
    else if (!toneComparable) skip('exception words: no dictionary IPA with tone letters and the same number of syllables');
    else if ((counters.toneChecked++, !toneAgrees)) {
      const theirs = readings.filter((r) => r.ipa && tonesFromIpa(r.ipa).length === oursN).map((r) => `${r.ipa} = ${tonesFromIpa(r.ipa!).map((t) => t ?? '?').join(' ')}`);
      rec.add('tone', key, x.surface, hand.sourceIds.orthExceptions, `${ours} = ${ourTones.map((t) => t ?? '?').join(' ')}`, uniq(theirs).join(' | '),
        'Possibly different: the tones the engine reads from the course respelling differ from the tones of every listed IPA reading with the same number of syllables. IPA tone letters are mapped to the five tones by a fixed table; a reading whose letters are not in the table is left out.');
    }
    // respelling text (only when syllables and tones gave no difference)
    // two respellings are the same reading when they are written alike, or when the engine hears the same
    // romanization and tone in every syllable (กฺระ and กระ, ทำ and ทัม differ only in notation)
    const ourSound = soundKey(x.surface, ours);
    const sameText = readings.some((r) => r.respelling && (cleanRespelling(r.respelling) === ours || (ourSound !== undefined && soundKey(x.surface, cleanRespelling(r.respelling)) === ourSound)));
    const anyText = readings.some((r) => r.respelling);
    if (anyText) counters.respellingChecked++;
    const alreadySaid = rec.list.some((d) => d.form === x.surface && (d.field === 'tone' || d.field === 'syllables') && d.id.includes(key));
    if (anyText && !sameText && !alreadySaid) {
      rec.add('pronunciation', key, x.surface, hand.sourceIds.orthExceptions, ours, uniq(readings.map((r) => r.respelling).filter((r): r is string => !!r)).join(' | '),
        'Possibly different: the course respelling is neither written like any listed dictionary respelling nor read by the spelling engine as the same romanization and tones. The number of syllables and the tones agree or could not be compared. A difference here can still be one of convention (how a vowel or a silent letter is marked).');
    }
  }

  // ── pronunciation coverage ──
  const handDistinct = [...handForms.keys()];
  const inDict = handDistinct.filter((f) => idx.has(f));
  const kindsOf = (f: string) => readingKinds(idx.get(f) ?? []);
  const pronunciation: PronunciationCoverage = {
    dictionary: {
      forms: dict.stats.forms, withRespelling: dict.stats.formsWithRespelling, withIpa: dict.stats.formsWithIpa,
      withRomanization: dict.stats.formsWithRomanization, withAny: dict.stats.formsWithAnyPronunciation,
    },
    hand: {
      entries: hand.entries.length, distinctForms: handDistinct.length, withOwnRomanization: hand.entries.filter((e) => e.translit).length,
      formsInDictionary: inDict.length,
      dictRespelling: inDict.filter((f) => kindsOf(f) & 1).length, dictIpa: inDict.filter((f) => kindsOf(f) & 2).length,
      dictRomanization: inDict.filter((f) => kindsOf(f) & 4).length, dictAny: inDict.filter((f) => kindsOf(f)).length,
    },
  };

  // ── order, resolutions ──
  const kindRank = new Map(KIND_ORDER.map((k, i) => [k, i] as const));
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const sorted = [...rec.list].sort((a, b) => (kindRank.get(a.field)! - kindRank.get(b.field)!) || cmp(a.form, b.form) || cmp(a.id, b.id));
  const { merged, stale } = applyResolutions(sorted, opts.resolutions);

  return {
    dictionaryId: opts.dictionaryId,
    handCounts: {
      entries: hand.entries.length, distinctForms: handDistinct.length, phrases: hand.phrases.length, compounds: hand.compounds.length,
      exceptions: hand.exceptions.filter((x) => x.list === 'exception').length, settled: hand.exceptions.filter((x) => x.list === 'settled').length,
    },
    coverage, pronunciation, disagreements: merged, notComparable, staleResolutions: stale, checked: { ...counters },
    method: { registerVocabulary: vocab, strongLabels: [...STRONG_LABELS, ...STRONG_RAW_TAGS] },
  };
}

// ───────────────────────────── resolutions ─────────────────────────────

const DECISIONS: ReadonlySet<string> = new Set(['ours', 'theirs', 'both', 'neither']);

/**
 * Read data/review/th/resolutions.json: an object keyed by disagreement id, each value `{ by, at, decision, note? }`
 * (an outer `{ "resolutions": {...} }` is accepted too). Entries that are not well formed are returned in `problems`
 * and ignored; a hand-edited file is never rewritten by the comparison.
 */
export function parseResolutions(json: unknown): { map: Map<string, Resolution>; problems: string[] } {
  const map = new Map<string, Resolution>();
  const problems: string[] = [];
  let obj: unknown = json;
  if (obj && typeof obj === 'object' && !Array.isArray(obj) && 'resolutions' in obj && Object.keys(obj).length === 1) obj = (obj as { resolutions: unknown }).resolutions;
  if (obj === undefined || obj === null) return { map, problems };
  if (typeof obj !== 'object' || Array.isArray(obj)) return { map, problems: ['resolutions.json must be an object keyed by disagreement id'] };
  for (const [id, v] of Object.entries(obj as Record<string, unknown>)) {
    const r = v as Partial<Resolution> | null;
    if (!r || typeof r !== 'object' || !isStr(r.by) || !isStr(r.at) || typeof r.decision !== 'string' || !DECISIONS.has(r.decision)) {
      problems.push(`${id}: needs by, at and decision (ours | theirs | both | neither)`);
      continue;
    }
    map.set(id, { by: r.by, at: r.at, decision: r.decision as Resolution['decision'], ...(isStr(r.note) ? { note: r.note } : {}) });
  }
  return { map, problems };
}

/** A resolved id keeps its freshly computed ours / theirs and gains `status: 'resolved'` and the decision. */
export function applyResolutions(list: readonly SourceDisagreement[], resolutions?: ReadonlyMap<string, Resolution>): { merged: SourceDisagreement[]; stale: string[] } {
  if (!resolutions?.size) return { merged: [...list], stale: [] };
  const ids = new Set(list.map((d) => d.id));
  const merged = list.map((d) => {
    const r = resolutions.get(d.id);
    return r ? { ...d, status: 'resolved' as const, resolution: { ...r } } : d;
  });
  const stale = [...resolutions.keys()].filter((id) => !ids.has(id)).sort();
  return { merged, stale };
}

/** Counts by kind: open and resolved. */
export function countByKind(list: readonly SourceDisagreement[]): Array<{ kind: DisagreementKind; open: number; resolved: number }> {
  return KIND_ORDER.map((kind) => ({
    kind,
    open: list.filter((d) => d.field === kind && d.status === 'open').length,
    resolved: list.filter((d) => d.field === kind && d.status === 'resolved').length,
  }));
}
