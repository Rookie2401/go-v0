/**
 * An unlisted separable verb read from a separable prefix + a form of a KNOWN verb: abgeschickt = ab + geschickt (the
 * participle of schicken), abzuschicken = ab + zu + schicken, abschickt = ab + schickt. Built only from forms the
 * engine itself produces for the known verb (its listed readings), never from a spelling guess. Every reading is
 * unconfirmed (`lemmaKnown: false`), at most 0.6, with NO gloss (abschicken does not mean "to send") and no claim about
 * the auxiliary. The two-way prefixes (um, über, durch …) show a separable verb only by a ge- or zu- between prefix and
 * verb; without them the form cannot say which kind of verb it is, and the reading stays at 0.4.
 */
import type { WordPart } from '../../core';
import type { DeReading } from './types';
import { describeGermanMorph } from './morph-describe';
import { PREFIXES } from './prefixes';

type Listed = (word: string) => DeReading[];

/** Every verb prefix that can stand before ge- / zu-, longest first, with its kind. */
export const PREFIX_LIST: ReadonlyArray<{ prefix: string; dual: boolean }> = [
  ...PREFIXES.separable.map((prefix) => ({ prefix, dual: false })),
  ...PREFIXES.dual.map((prefix) => ({ prefix, dual: true })),
].sort((a, b) => b.prefix.length - a.prefix.length);

/** Prefix + ge: the start of a separable verb's participle (abge-, angemacht). Used by the ordinary guess to stay away from it. */
const PREFIX_ALT = PREFIX_LIST.map((p) => p.prefix).join('|');
export const PREFIX_GE = new RegExp(`^(${PREFIX_ALT})ge`, 'u');
/** A weak participle with a prefix: prefix + ge + stem + (e)t. */
export const PREFIX_GE_PARTICIPLE = new RegExp(`^(${PREFIX_ALT})ge(.{3,}?)(e?t)$`, 'u');

/**
 * Does the participle `part` of the verb `lemma` start with a ge- that was added to it (gehört of hören: yes; of gehören:
 * no, ge- is the verb's own prefix; gegeben: yes)?
 */
function addsGe(lemma: string, part: string, listed: Listed): boolean {
  if (!part.startsWith('ge')) return false;
  if (!lemma.startsWith('ge')) return true;
  // a verb with its own ge- (gehören, gestehen, gefallen): the participle has no added ge- when the verb without it is a known verb with the same participle
  const rem = lemma.slice(2);
  if (rem.length >= 3 && listed(rem).some((r) => r.pos === 'VERB' && r.lemma === rem && r.morph.VerbForm === 'Inf') && listed(part).some((r) => r.pos === 'VERB' && r.lemma === rem && r.morph.VerbForm === 'Part')) return false;
  return !part.startsWith(lemma.slice(0, Math.max(3, lemma.length - 2))); // gehören → gehört: the stem is already there
}

interface Found { reading: DeReading; rank: number }

export function separablePrefixVerb(word: string, listed: Listed): DeReading[] {
  const found: Found[] = [];
  let usedLength = 0;
  for (const { prefix, dual } of PREFIX_LIST) {
    if (usedLength && prefix.length < usedLength) break; // the longest prefix that gives anything wins
    if (!word.startsWith(prefix) || word.length - prefix.length < 3) continue;
    const rest = word.slice(prefix.length);
    const before = found.length;
    const base = (r: DeReading): boolean => r.lemmaKnown && r.pos === 'VERB' && !r.cells && !r.prefix && !/ /.test(r.lemma);

    const add = (b: DeReading, kind: 'ge' | 'zu' | 'plain', zuWord?: string): void => {
      const lemma = `${prefix}${b.lemma}`;
      const morph = { ...b.morph };
      const shape = kind !== 'plain';
      const confidence = shape ? 0.6 : dual ? 0.4 : 0.5;
      const key = `${lemma}|${JSON.stringify(morph)}`;
      if (found.some((f) => `${f.reading.lemma}|${JSON.stringify(f.reading.morph)}` === key)) return;
      const parts: WordPart[] = [{ text: prefix, start: 0, end: prefix.length, kind: 'prefix', role: 'separable prefix' }];
      let at = prefix.length;
      const marker = kind === 'zu' ? 'zu' : kind === 'ge' ? 'ge' : '';
      if (marker) {
        parts.push({ text: marker, start: at, end: at + 2, kind: 'marker', role: marker === 'zu' ? 'infinitive marker zu' : 'participle prefix ge-' });
        at += 2;
      }
      const stemText = zuWord ?? (kind === 'ge' ? rest.slice(2) : rest);
      parts.push({ text: stemText, start: at, end: word.length, lemma: b.lemma, pos: 'VERB', kind: 'stem', role: `known verb: ${b.gloss ?? b.lemma}` });
      const why = dual
        ? shape
          ? `the ${marker === 'zu' ? 'zu' : 'ge-'} after the prefix shows a separable verb`
          : 'separable or inseparable cannot be told from this form'
        : 'separable prefix';
      const reading: DeReading = {
        lemma, pos: 'VERB', morph, confidence, lemmaKnown: false, prefix: { text: prefix, attached: true }, parts,
        rule: `derived: ${lemma} is not in the word list; read as ${prefix}- + ${stemText}, a form of the known verb ${b.lemma} (${why}); `
          + `${describeGermanMorph(morph)}; its meaning and its auxiliary (haben or sein) are not known`,
      };
      found.push({ reading, rank: confidence });
    };

    // prefix + zu + infinitive
    if (rest.startsWith('zu') && rest.length - 2 >= 3) {
      for (const b of listed(rest.slice(2))) if (base(b) && b.morph.VerbForm === 'Inf') add(b, 'zu', rest.slice(2));
    }
    // prefix + a form of the known verb: participle (with or without ge-), infinitive, finite form of a clause-final verb
    for (const b of listed(rest)) {
      if (!base(b)) continue;
      const vf = b.morph.VerbForm;
      if (vf === 'Part' && b.morph.Tense === 'Past') add(b, addsGe(b.lemma, rest, listed) ? 'ge' : 'plain');
      else if (vf === 'Inf' || (vf === 'Fin' && b.morph.Mood !== 'Imp')) add(b, 'plain');
    }
    if (found.length > before) usedLength = prefix.length;
  }
  return found.sort((a, b) => b.rank - a.rank).slice(0, 8).map((f) => f.reading);
}
