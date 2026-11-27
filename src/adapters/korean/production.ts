/**
 * Checks on a learner's own Korean (GoTell). MACHINE-DRAFTED; no Korean teacher has checked them. One check only, on one unambiguous
 * shape. AN EMPTY RESULT MEANS NOTHING WAS FOUND, NEVER THAT THE KOREAN IS RIGHT: spacing, endings, speech level, honorifics, word choice
 * and word order are not looked at.
 *
 * The particle allomorph (category 'particle'): a noun the lexicon knows followed by the form of a particle that belongs after the other
 * kind of final sound: 은 / 이 / 을 / 과 / 으로 / 이랑 / 이나 after a consonant, 는 / 가 / 를 / 와 / 로 / 랑 / 나 after a vowel (로 also after
 * ㄹ). It fires only when the analysis itself found the mismatch (the reading's particle part says it does not agree with its host) and
 * no reading of the word explains it otherwise; the suggestion swaps the particle for its other form.
 */
import type { AnalyzedToken, ErrorCandidate, RawToken } from '../../core';
import { PARTICLES } from './particles';

const NONSTANDARD = '(non-standard form after this host)';

/** The other allomorph of a particle family for this host, from the closed particle table (korean/particles.ts). */
function otherForm(family: string, written: string): string | undefined {
  const p = Object.values(PARTICLES).find((x) => x.family === family);
  if (!p) return undefined;
  const forms = p.forms.map((f) => f.text).filter((t) => t !== written);
  return forms.length === 1 ? forms[0] : forms.find((t) => t.length === written.length + 1 || t.length === written.length - 1);
}

export function checkKoProduction(tokens: RawToken[], analyses: AnalyzedToken[], _sentence: string): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  tokens.forEach((t, i) => {
    if (!t.isWord) return;
    const cands = analyses[i]?.candidates ?? [];
    const first = cands[0];
    if (!first || first.unconfirmed || first.confidence < 0.5) return;
    // another reading of the word explains it with no mismatch: nothing to say
    if (cands.some((c) => !c.unconfirmed && c.confidence >= 0.5 && !(c.parts ?? []).some((p) => p.role?.includes(NONSTANDARD)))) return;
    const bad = (first.parts ?? []).find((p) => p.role?.includes(NONSTANDARD) && p.lemma);
    if (!bad) return;
    const fix = otherForm(bad.lemma!, bad.text);
    out.push({
      category: 'particle', tokenIndexes: [i],
      message: `${bad.text} is the form of ${bad.lemma} for the other kind of final sound${fix ? `: after ${t.surface.slice(0, bad.start)} write ${fix}` : ''}.`,
      ...(fix ? { suggestion: { start: t.start + bad.start, end: t.start + bad.end, replacement: fix } } : {}),
      confidence: 0.7, affectsMeaning: false,
    });
  });
  return out;
}
