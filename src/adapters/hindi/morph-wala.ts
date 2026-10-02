/**
 * X + वाला written as one word (package H2, docs/PLAN12.md). MACHINE-DRAFTED from the author's own knowledge of Hindi.
 *
 * (a) the oblique infinitive + वाला: देनेवाला "the one who gives", रेंगनेवाले "creeping ones" — the lemma is the verb's
 * infinitive (देना); (b) a noun, direct or oblique + वाला: बीजवाला "having seed", लड़केवाली — the lemma is the noun.
 * Either way the word is an ADJ whose Gender / Number / Case come from the ending of वाला exactly as the separate-word
 * वाला readings give them (plus the nominal -वालों / -वालियों), and `parts` tile the written form: the base (kind
 * 'stem') and वाला (kind 'clitic', as the pronoun fusions). The same words are also written as two words (देने वाला);
 * this module only reads the one-word spelling. A lemma such as "रेंगनेवाला" is never returned: with the base not
 * vouched for there is at most ONE unconfirmed guess (the infinitive when the base ends in -ने, otherwise the base
 * as a noun), 0.6 at most and without a gloss.
 */
import type { PartOfSpeech, WordPart } from '../../core';
import { adjText, nounReadings } from './morph-noun';
import { fold } from './morph-orth';
import type { Ctx, Raw } from './morph-types';
import { stemClass, validStemStart } from './morph-verb';
import { plausibleStem } from './morph-verb-read';

const M = 'Masc', F = 'Fem', S = 'Sing', P = 'Plur';
const cell = (g: string, n: string, c?: string): Record<string, string> => ({ Gender: g, Number: n, ...(c ? { Case: c } : {}) });

const CELLS: Array<{ suffix: string; morphs: Array<Record<string, string>> }> = [
  { suffix: 'वाला', morphs: [cell(M, S, 'Dir')] },
  { suffix: 'वाले', morphs: [cell(M, S, 'Obl'), cell(M, P, 'Dir'), cell(M, P, 'Obl')] },
  { suffix: 'वाली', morphs: [cell(F, S), cell(F, P)] },
  { suffix: 'वालीं', morphs: [cell(F, P)] },
  { suffix: 'वालों', morphs: [cell(M, P, 'Obl')] },
  { suffix: 'वालियों', morphs: [cell(F, P, 'Obl')] },
];

interface Base { lemma: string; pos: PartOfSpeech; morph: Record<string, string>; known: boolean; infinitive: boolean }

export function walaReadings(w: string, o: string, ctx: Ctx): Raw[] {
  const c = CELLS.find((x) => w.endsWith(x.suffix));
  if (!c) return [];
  const b = o.length - c.suffix.length;
  if (b < 2) return [];
  const base = o.slice(0, b);
  const suffix = o.slice(b);
  const bases: Base[] = [];
  let guess: Base | undefined;
  if (base.endsWith('ने') && base.length >= 3) {
    const stem = base.slice(0, -2);
    const cls = stemClass(stem);
    const lemma = stem + 'ना';
    if (cls && validStemStart(stem)) {
      if (ctx.knownVerb(lemma)) bases.push({ lemma, pos: 'VERB', morph: { VerbForm: 'Inf', Case: 'Obl' }, known: true, infinitive: true });
      else if (plausibleStem(stem, cls)) guess = { lemma, pos: 'VERB', morph: { VerbForm: 'Inf', Case: 'Obl' }, known: false, infinitive: true };
    }
  }
  if (!bases.length) {
    const seen = new Set<string>();
    for (const r of nounReadings(fold(base), base, ctx)) {
      if (!r.known || seen.has(r.lemma)) continue;
      seen.add(r.lemma);
      bases.push({ lemma: r.lemma, pos: 'NOUN', morph: { ...r.morph }, known: true, infinitive: false });
    }
  }
  if (!bases.length && !guess && !base.endsWith('ने')) {
    // a noun nobody vouched for: the base as it stands (one guess, below the infinitive guess)
    if (base.length >= 3 && validStemStart(base)) guess = { lemma: base, pos: 'NOUN', morph: {}, known: false, infinitive: false };
  }
  const list = bases.length ? bases : guess ? [guess] : [];
  const out: Raw[] = [];
  for (const bs of list) {
    const parts: WordPart[] = [
      { text: base, start: 0, end: b, lemma: bs.lemma, pos: bs.pos, kind: 'stem', morph: { ...bs.morph } },
      { text: suffix, start: b, end: o.length, lemma: 'वाला', pos: 'ADJ', kind: 'clitic', role: 'वाला: the one who … / having …' },
    ];
    for (const m of c.morphs) {
      const what = bs.infinitive
        ? `the one who …s / that which …s (the oblique infinitive ${base} + ${suffix}); also written as two words: ${base} ${suffix}`
        : `having / of / the one with ${bs.lemma} (${base} + ${suffix}); also written as two words: ${base} ${suffix}`;
      out.push({
        lemma: bs.lemma, pos: 'ADJ', morph: { ...m }, parts: parts.map((p) => ({ ...p, ...(p.morph ? { morph: { ...p.morph } } : {}) })),
        rule: `${bs.lemma} + वाला: ${what}; ${adjText(m)}`, known: bs.known, tier: bs.known ? 'rule' : 'guess',
        prior: bs.known ? 1 : bs.infinitive ? 0.59 : 0.5, paradigm: `${bs.lemma}|wala`,
      });
    }
  }
  return out;
}
