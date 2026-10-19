/**
 * Context rules that choose between the readings of a few very common ambiguous words, read from their neighbours:
 *
 *   - a capitalised word inside a sentence is a name, when it has a reading as one (Maria, Paulum, not mare, paulum);
 *   - quod: the relative pronoun when a neuter noun or pronoun stands before it (id quod, omne quod), else the conjunction;
 *   - quam: the relative pronoun after a feminine noun (the woman whom), else the adverb / conjunction (than, how);
 *   - cum: the preposition before a noun phrase with no subject of its own (cum discipulis suis), the conjunction before a verb, or before
 *     a nominative and then a verb (cum esset Iesus ...).
 *
 * A rule moves a reading (it scales its confidence) and sets `notes.context`; it never adds or removes one.
 */
import type { AnalysisCandidate, RawToken } from '../../core';

const NOMINAL = new Set(['NOUN', 'PROPN', 'ADJ', 'PRON', 'DET', 'NUM']);
const has = (c: AnalysisCandidate, k: string, v: string): boolean => (c.morph[k] ?? '').split(',').includes(v);
const isFin = (c: AnalysisCandidate): boolean => (c.pos === 'VERB' || c.pos === 'AUX') && has(c, 'VerbForm', 'Fin');

function scale(list: AnalysisCandidate[], pred: (c: AnalysisCandidate) => boolean, factor: number, why: string): void {
  for (const c of list) {
    if (!pred(c)) continue;
    c.confidence = Math.max(0.05, Math.min(0.95, Math.round(c.confidence * factor * 100) / 100));
    c.notes = { ...c.notes, context: why };
  }
}

/** The word before `w` (skipping nothing but punctuation) with its best reading. */
function before(_tokens: RawToken[], base: AnalysisCandidate[][], words: number[], w: number): AnalysisCandidate | undefined {
  if (w === 0) return undefined;
  const i = words[w - 1];
  return base[i]?.slice().sort((a, b) => b.confidence - a.confidence)[0];
}

export function applyContextRules(tokens: RawToken[], base: AnalysisCandidate[][], words: number[]): void {
  for (let w = 0; w < words.length; w++) {
    const i = words[w];
    const list = base[i];
    if (!list.length) continue;
    const surface = tokens[i].surface;

    // names
    const prevTok = i > 0 ? tokens[i - 1] : undefined;
    const startsSentence = w === 0 || (!!prevTok && !prevTok.isWord && /^[.:;?!]$/.test(prevTok.surface));
    if (!startsSentence && /^\p{Lu}/u.test(surface) && list.some((c) => c.pos === 'PROPN')) {
      scale(list, (c) => c.pos !== 'PROPN', 0.4, 'a capitalised word inside a sentence: a name');
      scale(list, (c) => c.pos === 'PROPN', 1.4, 'a capitalised word inside a sentence: a name');
    }

    const key = tokens[i].normalized;
    // vis: you wish (volo), or force (vis): force follows a preposition, an adjective or a determiner and is rare beside the verb
    if (key === 'vis' && list.some((c) => c.lemma === 'volo') && list.some((c) => c.lemma === 'vis')) {
      const prev = before(tokens, base, words, w);
      const nominalBefore = !!prev && (prev.pos === 'ADP' || prev.pos === 'ADJ' || prev.pos === 'DET' || (prev.pos === 'PRON' && prev.morph.Case === 'Gen'));
      if (!nominalBefore) {
        scale(list, (c) => c.lemma === 'volo', 2.4, 'vis: second person of volo; no preposition or adjective stands before it');
        scale(list, (c) => c.lemma === 'vis', 0.5, 'vis: second person of volo; no preposition or adjective stands before it');
      }
    }
    // mei, tui, sui, nostri, vestri, nostrum, vestrum: the genitive of the personal pronoun (miserere mei; quis vestrum) unless a noun follows (mei discipuli)
    if (/^(mei|tui|sui|nostri|[uv]estri|nostrum|[uv]estrum)$/.test(key) && list.some((c) => c.pos === 'PRON') && list.some((c) => c.pos === 'ADJ')) {
      const next = w + 1 < words.length ? base[words[w + 1]].slice().sort((a, b) => b.confidence - a.confidence)[0] : undefined;
      const stops = w + 1 < words.length && tokens.slice(words[w] + 1, words[w + 1]).some((t) => /^[.;:?!,]$/.test(t.surface));
      const nounFollows = !!next && !stops && (next.pos === 'NOUN' || next.pos === 'PROPN');
      if (!nounFollows) {
        scale(list, (c) => c.pos === 'PRON', 3, 'genitive of the personal pronoun: no noun follows');
        scale(list, (c) => c.pos === 'ADJ', 0.4, 'genitive of the personal pronoun: no noun follows');
      }
    }
    // quam
    if (key === 'quam' && list.some((c) => c.pos === 'ADV' || c.pos === 'CONJ')) {
      const prev = before(tokens, base, words, w);
      const antecedent = !!prev && !!prev.pos && NOMINAL.has(prev.pos) && has(prev, 'Gender', 'Fem') && prev.morph.Number !== 'Plur' && prev.pos !== 'ADJ';
      if (antecedent) scale(list, (c) => c.pos === 'PRON', 1.8, 'relative: a feminine antecedent stands before it');
      else {
        scale(list, (c) => c.pos === 'PRON', 0.3, 'adverb or conjunction: no feminine antecedent before it');
        scale(list, (c) => c.pos === 'ADV', 2.2, 'adverb or conjunction: no feminine antecedent before it');
      }
    }
    // cum
    if (key === 'cum' && list.some((c) => c.pos === 'ADP') && list.some((c) => c.pos === 'SCONJ')) {
      const next = w + 1 < words.length ? base[words[w + 1]] : [];
      const nextBest = next.slice().sort((a, b) => b.confidence - a.confidence)[0];
      const nextIsVerb = !!nextBest && isFin(nextBest);
      const nextNom = !!nextBest && !!nextBest.pos && NOMINAL.has(nextBest.pos) && nextBest.morph.Case === 'Nom';
      const afterNext = w + 2 < words.length ? base[words[w + 2]] : [];
      const verbAfterNom = afterNext.some((c) => isFin(c));
      const nextAbl = next.some((c) => !!c.pos && NOMINAL.has(c.pos) && (has(c, 'Case', 'Abl') || c.pos === 'PROPN'));
      let conj: boolean;
      if (nextIsVerb) conj = true;
      else if (nextNom && verbAfterNom) conj = true;
      else conj = !nextAbl;
      if (conj) {
        scale(list, (c) => c.pos === 'SCONJ', 2.2, 'conjunction: a verb or a subject and verb follow');
        scale(list, (c) => c.pos === 'ADP', 0.3, 'conjunction: a verb or a subject and verb follow');
      } else {
        scale(list, (c) => c.pos === 'ADP', 2.2, 'preposition: an ablative noun phrase follows');
        scale(list, (c) => c.pos === 'SCONJ' || c.pos === 'ADV', 0.3, 'preposition: an ablative noun phrase follows');
      }
    }
  }
}
