/**
 * Korean fixed expressions that are ONE lexical unit across a space (brief V): kept small and certain. An expression is listed only when
 *   - it is a headword of the built dictionary (public/dict/ko, Wiktionary via kaikki.org, CC BY-SA 4.0), with that dictionary's gloss
 *     (`headword: true`): 그럼에도 불구하고; or
 *   - it is grammar: a particle on a noun followed by a fixed verb form that has become a postposition (-에 대해(서) "about", -에 관해(서)
 *     "concerning", -(으)로 인해(서) "because of", -에 의해(서) "by", -에도 불구하고 "despite", -에 따라(서) "according to"). These frames
 *     are not dictionary headwords; their gloss is this adapter's own (machine-drafted).
 * Each word keeps its own readings; the phrase only says that the words belong together. -기 때문에 and -(으)ㄹ 수 있다 are constructions
 * (korean/constructions.ts), not phrases. Not reviewed by a native speaker.
 */
import type { AnalyzedToken, PhraseCandidate, RawToken } from '../../core';

export interface KoPhrase {
  id: string;
  /** The learner item's pattern: normalised pieces, `_` the open slot. */
  pattern: string[];
  display: string;
  gloss: string;
  kind: PhraseCandidate['kind'];
  /** True: a dictionary headword, gloss the dictionary's. False: a grammar frame, gloss this adapter's. */
  headword: boolean;
  /** The particle family ids the slot word must END with (the frame's own particle), or undefined for a whole-word expression. */
  particles?: readonly string[][];
  /** The written forms of the second word. */
  second: readonly string[];
  /** For a whole-word expression: the first word as written. */
  first?: readonly string[];
}

export const KO_PHRASES: readonly KoPhrase[] = [
  { id: 'geureomedo-bulguhago', pattern: ['그럼에도', '불구하고'], display: '그럼에도 불구하고', gloss: 'nevertheless, nonetheless, yet', kind: 'formula', headword: true, first: ['그럼에도'], second: ['불구하고'] },
  { id: 'edo-bulguhago', pattern: ['_에도', '불구하고'], display: '-에도 불구하고', gloss: 'despite, in spite of', kind: 'frame', headword: false, particles: [['to', 'also']], second: ['불구하고'] },
  { id: 'e-daehae', pattern: ['_에', '대하다'], display: '-에 대해(서) / 대하여 / 대한', gloss: 'about, on (a topic); 대한: about (before a noun)', kind: 'frame', headword: false, particles: [['to']], second: ['대해', '대해서', '대하여', '대한'] },
  { id: 'e-gwanhae', pattern: ['_에', '관하다'], display: '-에 관해(서) / 관하여 / 관한', gloss: 'concerning, about', kind: 'frame', headword: false, particles: [['to']], second: ['관해', '관해서', '관하여', '관한'] },
  { id: 'euro-inhae', pattern: ['_(으)로', '인하다'], display: '-(으)로 인해(서) / 인하여 / 인한', gloss: 'because of, owing to', kind: 'frame', headword: false, particles: [['by']], second: ['인해', '인해서', '인하여', '인한'] },
  { id: 'e-uihae', pattern: ['_에', '의하다'], display: '-에 의해(서) / 의하여 / 의한', gloss: 'by (the doer of a passive); according to', kind: 'frame', headword: false, particles: [['to']], second: ['의해', '의해서', '의하여', '의한', '의하면'] },
  { id: 'e-ttara', pattern: ['_에', '따르다'], display: '-에 따라(서) / 따르면', gloss: 'according to; depending on', kind: 'frame', headword: false, particles: [['to']], second: ['따라', '따라서', '따르면', '따른'] },
];

const DIGITS = /^[0-9]+$/u;
const endsWith = (ps: string[], tail: readonly string[]): boolean => ps.length >= tail.length && tail.every((p, k) => ps[ps.length - tail.length + k] === p);

/** The fixed expressions of a sentence. */
export function detectKoPhrases(tokens: RawToken[], analyses: AnalyzedToken[]): PhraseCandidate[] {
  const out: PhraseCandidate[] = [];
  for (let i = 0; i + 1 < tokens.length; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (!a.isWord || !b.isWord) continue;
    const ca = analyses[i]?.candidates[0];
    for (const p of KO_PHRASES) {
      if (!p.second.includes(b.normalized)) continue;
      let ok = false;
      if (p.first) ok = p.first.includes(a.normalized);
      else if (ca && !ca.unconfirmed && p.particles) {
        const ps = ca.morph.Particle ? ca.morph.Particle.split('+') : [];
        ok = p.particles.some((tail) => endsWith(ps, tail)) && !DIGITS.test(a.surface);
      }
      if (!ok) continue;
      out.push({
        pattern: p.pattern, display: p.display, kind: p.kind, gloss: p.gloss, tokenIndexes: [i, i + 1],
        confidence: p.headword ? 0.9 : Math.min(0.85, ca?.confidence ?? 0.85),
      });
    }
  }
  return out;
}
