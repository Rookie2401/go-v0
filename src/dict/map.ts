/**
 * Pure mapper from one kaikki.org Wiktionary JSON line to a DictionaryEntry. Every field is optional and every
 * shape untrusted; nothing is invented (no frequency, no definition: the source carries none).
 *
 * Everything the source says is kept: every sense (`senses`, with its own labels), every pronunciation row group
 * (`pronunciations`, tags verbatim), the etymology number, the alt-of headwords. `glosses`, `respelling`, `ipa` and
 * `romanization` are only the short view. Real shapes: docs/PLAN6.md ("Facts established").
 *
 * An inflected form is its own entry whose senses carry `form_of: [{ word }]`: those senses become `formOf`
 * (lemma + the source's grammatical labels), never a gloss or a sense of their own. A word that is also a lemma keeps
 * both. Region labels on senses and pronunciations stay verbatim tags; no variety is guessed from them.
 */
import type { DictionaryEntry, DictionaryPronunciation, DictionarySense, LanguageCode, PartOfSpeech, RegisterTag } from '../core';
import { MAX_GLOSSES } from './format';

export type KaikkiSkip = 'not-an-object' | 'no-word' | 'wrong-language' | 'no-gloss' | 'non-word';
export const KAIKKI_SKIPS: readonly KaikkiSkip[] = ['not-an-object', 'no-word', 'wrong-language', 'no-gloss', 'non-word'];

/** Wiktionary part-of-speech headings to PartOfSpeech. Anything not listed stays absent rather than guessed. */
const POS_MAP: Record<string, PartOfSpeech> = {
  noun: 'NOUN', name: 'PROPN', 'proper noun': 'PROPN', verb: 'VERB', adj: 'ADJ', adjective: 'ADJ', adv: 'ADV', adverb: 'ADV',
  pron: 'PRON', pronoun: 'PRON', det: 'DET', determiner: 'DET', article: 'DET', prep: 'ADP', postp: 'ADP', adp: 'ADP',
  preposition: 'ADP', postposition: 'ADP', conj: 'CONJ', conjunction: 'CONJ', particle: 'PART', num: 'NUM', numeral: 'NUM',
  intj: 'INTJ', interjection: 'INTJ', classifier: 'CLF',
};

/** Units that are not single words: part of speech X, with a `role` that says what they are. */
const UNIT_ROLES: Record<string, string> = {
  phrase: 'phrase', proverb: 'proverb', prep_phrase: 'prepositional phrase', prefix: 'prefix', suffix: 'suffix', infix: 'infix',
};

/** How the source continues a form-of target that describes a verb with attached pronouns, after the verb itself. */
const COMBINED_WITH = ' combined with';

/** The part of speech a Wiktionary heading maps to (units that are not single words are X); undefined when the heading is not listed. */
export function partOfSpeechOf(heading: string): PartOfSpeech | undefined {
  const h = heading.trim().toLowerCase();
  return UNIT_ROLES[h] ? 'X' : POS_MAP[h];
}

/** Headings that are not words at all (a letter, a symbol, punctuation): kept out of word analysis, but counted. */
export const NON_WORD_POS: ReadonlySet<string> = new Set(['character', 'symbol', 'punct']);

/**
 * Sense tags that map onto a register tag (compared lower-case). Vague or unmapped labels (dialectal, dated, humble,
 * polite, vulgar, derogatory ...) add nothing; a region is only ever taken from a label that names one.
 */
const REGISTER_MAP: Record<string, RegisterTag> = {
  colloquial: 'colloquial', informal: 'colloquial', formal: 'formal', literary: 'literary', poetic: 'literary',
  archaic: 'archaic', obsolete: 'archaic', historical: 'historical', royal: 'royal', religious: 'religious',
  slang: 'slang', childish: 'child-directed',
};
/** The regional register tags are Thai ones (Isan, Northern, Southern, Teochew); another language's region labels stay plain tags. */
const THAI_REGISTER_MAP: Record<string, RegisterTag> = {
  isan: 'regional-isan', northeastern: 'regional-isan', northern: 'regional-north', southern: 'regional-south', teochew: 'teochew',
};

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown): string | undefined => (typeof x === 'string' && x.trim() ? x.trim() : undefined);
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
/** Labels exactly as the source wrote them (tags first, then raw_tags), without repeats. */
const labelsOf = (o: Record<string, unknown>): string[] => {
  const out: string[] = [];
  for (const t of [...list(o.tags), ...list(o.raw_tags)]) { const s = str(t); if (s && !out.includes(s)) out.push(s); }
  return out;
};
const lower = (labels: string[]): string[] => labels.map((t) => t.toLowerCase());

const pushUnique = <T>(arr: T[], v: T) => { if (!arr.includes(v)) arr.push(v); };
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function classifiersOf(x: unknown): string[] {
  const out: string[] = [];
  for (const c of list(x)) {
    const v = typeof c === 'string' ? str(c) : isObj(c) ? str(c.classifier) ?? str(c.word) : undefined;
    if (v) out.push(v);
  }
  return out;
}

/** "ใบ • (bai) (classifier ใบ or ลูก)" gives ['ใบ', 'ลูก']. Only what the template's own expansion states. */
function classifiersFromTemplates(heads: unknown): string[] {
  const out: string[] = [];
  for (const h of list(heads)) {
    const expansion = isObj(h) ? str(h.expansion) : undefined;
    const m = expansion ? /\(classifiers? ([^)]+)\)/.exec(expansion) : null;
    if (!m) continue;
    for (const part of m[1].split(/\s+or\s+|\s*,\s*/)) { const c = part.trim(); if (c) pushUnique(out, c); }
  }
  return out;
}

/** The parts of a sense's gloss chain. kaikki nests narrower glosses after the first (sometimes a label like "Lao:"). */
function glossParts(sense: Record<string, unknown>): string[] {
  const parts = list(sense.glosses).map(str).filter((s): s is string => s !== undefined);
  if (parts.length) return parts;
  return list(sense.raw_glosses).map(str).filter((s): s is string => s !== undefined).slice(0, 1);
}
/** Short view: the first gloss; when that is only a label ending in ":" the next part is appended. */
function shortGloss(parts: string[]): string {
  return parts[0].endsWith(':') && parts.length > 1 ? `${parts[0]} ${parts[1]}` : parts[0];
}

interface SoundRows {
  phonemic: Array<{ respelling?: string; asWritten: boolean; tags: string[] }>;
  ipa: Array<{ ipa: string; tags: string[] }>;
  paiboon: string[];
}

const MARKERS = new Set(['phonemic', 'orthographic/phonemic']);

function soundRows(sounds: unknown[]): SoundRows {
  const rows: SoundRows = { phonemic: [], ipa: [], paiboon: [] };
  for (const raw of sounds) {
    if (!isObj(raw)) continue;
    const labels = labelsOf(raw);
    const low = lower(labels);
    const ipa = str(raw.ipa);
    if (ipa) { rows.ipa.push({ ipa, tags: labels }); continue; }
    if (low.includes('phonemic') || low.includes('orthographic/phonemic')) {
      rows.phonemic.push({
        respelling: str(raw.other),
        asWritten: low.includes('orthographic/phonemic'),
        tags: labels.filter((t) => !MARKERS.has(t.toLowerCase())),
      });
    } else if (low.includes('paiboon')) {
      const roman = str(raw.roman);
      if (roman) rows.paiboon.push(roman);
    }
    // Orthographic (letter by letter), Royal Institute, homophone and audio rows are not pronunciations of the word.
  }
  return rows;
}

const withTags = (p: DictionaryPronunciation, tags: string[]): DictionaryPronunciation => (tags.length ? { ...p, tags } : p);

/** Pair each phonemic respelling with its IPA and Paiboon romanization by order when the counts agree. */
function pronunciationsOf(rows: SoundRows, form: string): { list: DictionaryPronunciation[]; unpaired: boolean } {
  const out: DictionaryPronunciation[] = [];
  let unpaired = false;
  const n = rows.phonemic.length;
  if (n > 0) {
    const ipaOk = rows.ipa.length === n || rows.ipa.length === 0;
    const pbOk = rows.paiboon.length === n || rows.paiboon.length === 0;
    rows.phonemic.forEach((p, i) => {
      const pr: DictionaryPronunciation = {};
      if (p.asWritten) { pr.respelling = form; pr.asWritten = true; } else if (p.respelling) pr.respelling = p.respelling;
      if (ipaOk && rows.ipa[i]) pr.ipa = rows.ipa[i].ipa;
      if (pbOk && rows.paiboon[i]) pr.romanization = rows.paiboon[i];
      out.push(withTags(pr, p.tags));
    });
    if (!ipaOk) { unpaired = true; for (const r of rows.ipa) out.push(withTags({ ipa: r.ipa }, r.tags)); }
    if (!pbOk) { unpaired = true; for (const r of rows.paiboon) out.push({ romanization: r }); }
  } else if (rows.ipa.length && rows.paiboon.length && rows.ipa.length === rows.paiboon.length) {
    rows.ipa.forEach((r, i) => out.push(withTags({ ipa: r.ipa, romanization: rows.paiboon[i] }, r.tags)));
  } else {
    if (rows.ipa.length && rows.paiboon.length) unpaired = true;
    for (const r of rows.ipa) out.push(withTags({ ipa: r.ipa }, r.tags));
    for (const r of rows.paiboon) out.push({ romanization: r });
  }
  return { list: out, unpaired };
}

export interface KaikkiMapping {
  entry?: DictionaryEntry;
  skipped?: KaikkiSkip;
  /** With skipped 'non-word': the source's own part-of-speech heading (character, symbol, punct). */
  nonWordPos?: string;
  /** True when this entry's pronunciation rows could not all be paired by order (kept unpaired, not guessed). */
  unpairedPronunciations?: boolean;
}

/** Map one parsed line; says why when nothing comes out. `lang` defaults to Thai, the only source so far. */
export function mapKaikkiLine(line: unknown, normalize: (surface: string) => string, lang: LanguageCode = 'th'): KaikkiMapping {
  if (!isObj(line)) return { skipped: 'not-an-object' };
  const code = str(line.lang_code);
  if (code !== undefined && code !== lang) return { skipped: 'wrong-language' };
  const word = str(line.word);
  let form = '';
  try { form = word ? normalize(word) : ''; } catch { form = ''; }
  if (!form) return { skipped: 'no-word' };
  const heading = typeof line.pos === 'string' ? line.pos.trim().toLowerCase() : '';
  if (NON_WORD_POS.has(heading)) return { skipped: 'non-word', nonWordPos: heading };

  // Inflected-form senses (form_of lemmas) become formOf; the rest are senses with a gloss. Spelling and form
  // variants without a lemma only feed the short view when nothing else is there.
  const formOf: Array<{ lemma: string; tags: string[] }> = [];
  const senses: Array<Record<string, unknown>> = [];
  for (const s of list(line.senses).filter(isObj)) {
    const lemmas = list(s.form_of).map((f) => (isObj(f) ? str(f.word) : undefined)).filter((w): w is string => w !== undefined);
    if (lemmas.length) {
      const tags = labelsOf(s);
      for (const target of lemmas) {
        // a verb with attached pronouns names its lemma as a description ("decir combined with indirect object le/les and
        // direct object lo"): the lemma is the first word; the description is not a headword and nothing is put in its place
        const at = target.indexOf(COMBINED_WITH);
        const w = at > 0 && !/\s/.test(target.slice(0, at)) ? target.slice(0, at) : target;
        let lemma = w;
        try { lemma = normalize(w) || w; } catch { /* keep the source's spelling */ }
        if (!formOf.some((f) => f.lemma === lemma && sameList(f.tags, tags))) formOf.push({ lemma, tags });
      }
    } else if (glossParts(s).length > 0) senses.push(s);
  }
  if (!senses.length && !formOf.length) return { skipped: 'no-gloss' };
  const isVariant = (s: Record<string, unknown>) => lower(labelsOf(s)).some((t) => t === 'form-of' || t === 'alt-of');
  const real = senses.filter((s) => !isVariant(s));
  const used = real.length ? real : senses;

  const glosses: string[] = [];
  const register: RegisterTag[] = [];
  const classifiers: string[] = classifiersOf(line.classifiers);
  for (const c of classifiersFromTemplates(line.head_templates)) pushUnique(classifiers, c);
  for (const s of used) {
    const g = shortGloss(glossParts(s));
    if (glosses.length < MAX_GLOSSES) pushUnique(glosses, g);
    for (const t of lower(labelsOf(s))) { const r = REGISTER_MAP[t] ?? (lang === 'th' ? THAI_REGISTER_MAP[t] : undefined); if (r) pushUnique(register, r); }
    for (const c of classifiersOf(s.classifiers)) pushUnique(classifiers, c);
  }

  const allSenses: DictionarySense[] = senses.map((s) => {
    const out: DictionarySense = { gloss: glossParts(s).join(' — ') };
    const tags = labelsOf(s);
    if (tags.length) out.tags = tags;
    const topics = [...new Set(list(s.topics).map(str).filter((t): t is string => t !== undefined))];
    if (topics.length) out.topics = topics;
    const examples = list(s.examples).length;
    if (examples) out.examples = examples;
    return out;
  });

  const altOf: string[] = [];
  for (const s of senses) for (const a of list(s.alt_of)) { const w = isObj(a) ? str(a.word) : undefined; if (w) pushUnique(altOf, w); }

  const { list: pronunciations, unpaired } = pronunciationsOf(soundRows(list(line.sounds)), form);
  // The short view comes from the plain readings (no variant label); with none, from whatever is there.
  // Thai variant readings are orthographic variants; another language's labels are usually regions, and no region's
  // reading is promoted to "the" reading, so there the short view comes from untagged readings only.
  const plain = pronunciations.filter((p) => !p.tags?.length);
  const pool = plain.length || lang !== 'th' ? plain : pronunciations;
  const respelling = pool.find((p) => p.respelling)?.respelling;
  const ipa = pool.find((p) => p.ipa)?.ipa;
  const formRoman = list(line.forms).filter(isObj).map((f) => (lower(labelsOf(f)).includes('romanization') ? str(f.form) : undefined)).find((v) => v !== undefined);
  const romanization = pool.find((p) => p.romanization)?.romanization ?? formRoman;

  const unit = UNIT_ROLES[heading];
  const pos: PartOfSpeech | undefined = unit ? 'X' : POS_MAP[heading];
  const entry: DictionaryEntry = { form, lang, glosses };
  // the source's own spelling, kept when normalization changed it (its capitals above all: PA, ESO, Rosa)
  const written = word!.normalize('NFC');
  if (written !== form) entry.written = written;
  if (pos) entry.pos = pos;
  if (unit) entry.role = unit;
  if (respelling) entry.respelling = respelling;
  if (ipa) entry.ipa = ipa;
  if (romanization) entry.romanization = romanization;
  if (register.length) entry.register = register;
  if (classifiers.length) entry.classifiers = classifiers;
  if (allSenses.length) entry.senses = allSenses;
  if (pronunciations.length) entry.pronunciations = pronunciations;
  const ety = line.etymology_number;
  if (typeof ety === 'number' && Number.isInteger(ety) && ety >= 1) entry.etymology = ety;
  if (altOf.length) entry.altOf = altOf;
  if (formOf.length) entry.formOf = formOf;
  return unpaired ? { entry, unpairedPronunciations: true } : { entry };
}

/** The contract-facing mapper: zero or one entry for a parsed JSON line (never throws on odd input). */
export function entryFromKaikki(line: unknown, normalize: (surface: string) => string, lang: LanguageCode = 'th'): DictionaryEntry[] {
  const { entry } = mapKaikkiLine(line, normalize, lang);
  return entry ? [entry] : [];
}
