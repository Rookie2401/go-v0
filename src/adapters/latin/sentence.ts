/**
 * The sentence layer: the readings of each word of ONE sentence, ordered by its neighbours. Two things the neighbours decide in Latin:
 *
 *   - what a preposition governs: after ad, per, de ... the next noun phrase is accusative, after a, ex, cum ... ablative, after in / sub
 *     either (motion towards: accusative; place or position: ablative). A reading in the governed case is confirmed and a union
 *     ("Abl,Dat" after in: principio) is narrowed to it; a reading in another case is lowered, never dropped.
 *   - which word is meant by cum, ex, ante ... when a word is both preposition and conjunction (cum): a following noun phrase in the
 *     ablative makes the preposition; a following finite verb the conjunction.
 *
 * Nothing here adds or removes a reading; it moves one, lowers a confidence and sets `notes.context`.
 */
import type { AnalysisCandidate, AnalyzedToken, RawToken } from '../../core';
import { wordCandidates } from './morphology';
import { applyContextRules } from './context';
import { applyAgreement } from './agreement';
import { LA_ANALYZER } from './version';

const NOMINAL = new Set(['NOUN', 'PROPN', 'ADJ', 'PRON', 'DET', 'NUM']);
const HEAD = new Set(['NOUN', 'PROPN', 'PRON']);

const caseSet = (c: AnalysisCandidate): string[] => (c.morph.Case ? c.morph.Case.split(',') : []);
const governs = (c: AnalysisCandidate): string[] => {
  const g = c.notes?.governs;
  return Array.isArray(g) ? g : typeof g === 'string' ? [g] : [];
};

function note(c: AnalysisCandidate, text: string): void {
  c.notes = { ...c.notes, context: text };
}

export function analyzeLatinSentence(tokens: RawToken[]): AnalysisCandidate[][] {
  let seenWord = false;
  const base: AnalysisCandidate[][] = tokens.map((t) => {
    if (!t.isWord) { if (/^[.:;?!]$/.test(t.surface)) seenWord = false; return []; }
    const initial = !seenWord;
    seenWord = true;
    return wordCandidates(t.surface, { sentenceInitial: initial }).map((c) => ({ ...c, morph: { ...c.morph }, notes: c.notes ? { ...c.notes } : undefined }));
  });
  const words = tokens.map((t, i) => (t.isWord ? i : -1)).filter((i) => i >= 0);
  applyContextRules(tokens, base, words);

  for (let w = 0; w < words.length; w++) {
    const i = words[w];
    const preps = base[i].filter((c) => c.pos === 'ADP' && governs(c).length);
    if (!preps.length) continue;
    const gov = [...new Set(preps.flatMap(governs))];
    // the noun phrase that follows: up to three words, each nominal, through the first head noun
    let matchedHead = false;
    let anyNominalAfter = false;
    for (let k = 1; k <= 3 && w + k < words.length; k++) {
      const j = words[w + k];
      if (tokens[j].start - tokens[words[w + k - 1]].end > 4 && /[.;:!?]/.test(tokens.slice(words[w + k - 1] + 1, j).map((t) => t.surface).join(''))) break;
      const cands = base[j];
      if (!cands.some((c) => c.pos && NOMINAL.has(c.pos))) break;
      anyNominalAfter = true;
      let hasHead = false;
      for (const c of cands) {
        if (!c.pos || !NOMINAL.has(c.pos) || !c.morph.Case) continue;
        const cs = caseSet(c);
        const hit = cs.filter((x) => gov.includes(x));
        if (hit.length) {
          c.morph.Case = hit.join(',');
          c.confidence = Math.min(0.95, Math.round(c.confidence * 1.25 * 100) / 100);
          note(c, `case governed by the preposition ${preps[0].lemma}`);
          if (HEAD.has(c.pos)) { hasHead = true; matchedHead = true; }
        } else {
          c.confidence = Math.round(c.confidence * 0.55 * 100) / 100;
          note(c, `not in the case ${preps[0].lemma} governs (${gov.join(' / ')})`);
        }
      }
      if (hasHead || cands.some((c) => c.pos && HEAD.has(c.pos))) break;
    }
    // a word that is a preposition AND something else (cum): the following noun phrase decides
    const others = base[i].filter((c) => c.pos !== 'ADP');
    if (others.length && preps[0].lemma !== 'cum') {
      for (const c of base[i]) {
        if (c.pos === 'ADP') {
          c.confidence = Math.round(c.confidence * (matchedHead ? 1.35 : anyNominalAfter ? 0.9 : 0.55) * 100) / 100;
          note(c, matchedHead ? 'followed by a noun in the case it governs' : 'no noun phrase in its case follows');
        } else {
          c.confidence = Math.round(c.confidence * (matchedHead ? 0.6 : 1.1) * 100) / 100;
        }
      }
    }
  }

  applyAgreement(tokens, base, words);
  // a reading the lexicon does not vouch for never rises above 0.4, whatever its neighbours say
  return base.map((list) => list.map((c) => ({ ...c, confidence: Math.min(c.unconfirmed ? 0.4 : 0.95, c.confidence) })).sort((a, b) => b.confidence - a.confidence));
}

export function latinAnalyze(tokens: RawToken[]): AnalyzedToken[] {
  const cands = analyzeLatinSentence(tokens);
  return tokens.map((token, i) => ({ token, candidates: cands[i], analyzer: LA_ANALYZER }));
}
