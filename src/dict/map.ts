/**
 * Pure mapper from one kaikki.org Wiktionary JSON line to a DictionaryEntry. Every field is optional and every
 * shape untrusted; nothing is invented (no frequency, no role, no definition: the source carries none).
 */
import type { DictionaryEntry, LanguageCode, PartOfSpeech, RegisterTag } from '../core';
import { MAX_GLOSSES } from './format';

export type KaikkiSkip = 'not-an-object' | 'no-word' | 'wrong-language' | 'no-gloss';
export const KAIKKI_SKIPS: readonly KaikkiSkip[] = ['not-an-object', 'no-word', 'wrong-language', 'no-gloss'];

/** Wiktionary part-of-speech headings to PartOfSpeech. Anything not listed (phrase, prefix, symbol ...) stays absent. */
const POS_MAP: Record<string, PartOfSpeech> = {
  noun: 'NOUN', name: 'PROPN', 'proper noun': 'PROPN', verb: 'VERB', adj: 'ADJ', adjective: 'ADJ', adv: 'ADV', adverb: 'ADV',
  pron: 'PRON', pronoun: 'PRON', det: 'DET', determiner: 'DET', article: 'DET', prep: 'ADP', postp: 'ADP', adp: 'ADP',
  preposition: 'ADP', postposition: 'ADP', conj: 'CONJ', conjunction: 'CONJ', particle: 'PART', num: 'NUM', numeral: 'NUM',
  intj: 'INTJ', interjection: 'INTJ', classifier: 'CLF', punct: 'PUNCT',
};

/** Sense tags that map onto a register tag (compared lower-case). Tags we are not sure about are left out, not guessed. */
const REGISTER_MAP: Record<string, RegisterTag> = {
  colloquial: 'colloquial', informal: 'colloquial', formal: 'formal', literary: 'literary', poetic: 'literary',
  archaic: 'archaic', obsolete: 'archaic', historical: 'historical', royal: 'royal', religious: 'religious',
  slang: 'slang', isan: 'regional-isan', northern: 'regional-north', southern: 'regional-south', teochew: 'teochew',
  childish: 'child-directed',
};

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown): string | undefined => (typeof x === 'string' && x.trim() ? x.trim() : undefined);
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const tagsOf = (o: Record<string, unknown>): string[] =>
  [...list(o.tags), ...list(o.raw_tags)].filter((t): t is string => typeof t === 'string').map((t) => t.toLowerCase());

function classifiersOf(x: unknown): string[] {
  const out: string[] = [];
  for (const c of list(x)) {
    const v = typeof c === 'string' ? str(c) : isObj(c) ? str(c.classifier) ?? str(c.word) : undefined;
    if (v) out.push(v);
  }
  return out;
}

const pushUnique = <T>(arr: T[], v: T) => { if (!arr.includes(v)) arr.push(v); };

/** The first gloss of a sense (kaikki nests narrower glosses after it); raw_glosses only when glosses is empty. */
function glossOf(sense: Record<string, unknown>): string | undefined {
  for (const g of list(sense.glosses)) { const s = str(g); if (s) return s; }
  for (const g of list(sense.raw_glosses)) { const s = str(g); if (s) return s; }
  return undefined;
}

export interface KaikkiMapping { entry?: DictionaryEntry; skipped?: KaikkiSkip }

/** Map one parsed line; says why when nothing comes out. `lang` defaults to Thai, the only source so far. */
export function mapKaikkiLine(line: unknown, normalize: (surface: string) => string, lang: LanguageCode = 'th'): KaikkiMapping {
  if (!isObj(line)) return { skipped: 'not-an-object' };
  const code = str(line.lang_code);
  if (code !== undefined && code !== lang) return { skipped: 'wrong-language' };
  const word = str(line.word);
  let form = '';
  try { form = word ? normalize(word) : ''; } catch { form = ''; }
  if (!form) return { skipped: 'no-word' };

  // Senses with a gloss; spelling and form variants only count when nothing else is there.
  const senses = list(line.senses).filter(isObj).filter((s) => glossOf(s) !== undefined);
  const isVariant = (s: Record<string, unknown>) => tagsOf(s).some((t) => t === 'form-of' || t === 'alt-of');
  const real = senses.filter((s) => !isVariant(s));
  const used = real.length ? real : senses;
  if (!used.length) return { skipped: 'no-gloss' };

  const glosses: string[] = [];
  const register: RegisterTag[] = [];
  const classifiers: string[] = classifiersOf(line.classifiers);
  for (const s of used) {
    const g = glossOf(s)!;
    if (glosses.length < MAX_GLOSSES) pushUnique(glosses, g);
    for (const t of tagsOf(s)) { const r = REGISTER_MAP[t]; if (r) pushUnique(register, r); }
    for (const c of classifiersOf(s.classifiers)) pushUnique(classifiers, c);
  }

  const sounds = list(line.sounds).filter(isObj);
  const respelling = sounds.map((s) => (tagsOf(s).includes('phonemic') ? str(s.other) : undefined)).find((v) => v !== undefined);
  const ipa = sounds.map((s) => str(s.ipa)).find((v) => v !== undefined);
  const paiboon = sounds.map((s) => (tagsOf(s).includes('paiboon') ? str(s.roman) : undefined)).find((v) => v !== undefined);
  const formRoman = list(line.forms).filter(isObj).map((f) => (tagsOf(f).includes('romanization') ? str(f.form) : undefined)).find((v) => v !== undefined);
  const romanization = paiboon ?? formRoman;

  const pos = typeof line.pos === 'string' ? POS_MAP[line.pos.trim().toLowerCase()] : undefined;
  const entry: DictionaryEntry = { form, lang, glosses };
  if (pos) entry.pos = pos;
  if (respelling) entry.respelling = respelling;
  if (ipa) entry.ipa = ipa;
  if (romanization) entry.romanization = romanization;
  if (register.length) entry.register = register;
  if (classifiers.length) entry.classifiers = classifiers;
  return { entry };
}

/** The contract-facing mapper: zero or one entry for a parsed JSON line (never throws on odd input). */
export function entryFromKaikki(line: unknown, normalize: (surface: string) => string, lang: LanguageCode = 'th'): DictionaryEntry[] {
  const { entry } = mapKaikkiLine(line, normalize, lang);
  return entry ? [entry] : [];
}
