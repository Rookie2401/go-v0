/**
 * Agreement in the noun phrase, used to order the readings of neighbouring words.
 *
 * An adjective, a determiner, a numeral or a participle agrees with its noun in case, number and gender. A reading that agrees with a
 * neighbouring word's reading (within three words, no stop between) is raised in proportion to that reading's own confidence, twice over so
 * that both sides settle. A union (Case "Abl,Dat") is NOT narrowed to the neighbour's case: measured against the treebanks, narrowing right
 * 4 times in 100 words and wrong once loses more than it gains (the first reading stays honest about what the form leaves open). Nothing is
 * added or removed, and a word with no partner keeps what the lexicon gave it. A finite verb's number was tried as evidence for its subject
 * and did not help.
 */
import type { AnalysisCandidate, RawToken } from '../../core';
import { foldKey } from './orthography';

const MODIFIER = new Set(['ADJ', 'DET', 'NUM']);
const HEAD = new Set(['NOUN', 'PROPN']);
const set = (c: AnalysisCandidate, k: string): string[] => (c.morph[k] ? c.morph[k].split(',') : []);
const isPart = (c: AnalysisCandidate): boolean => (c.pos === 'VERB' || c.pos === 'AUX') && ['Part', 'Gdv'].some((v) => (c.morph.VerbForm ?? '').split(',').includes(v));
const bearsCase = (c: AnalysisCandidate): boolean => !!c.morph.Case && (HEAD.has(c.pos ?? '') || MODIFIER.has(c.pos ?? '') || c.pos === 'PRON' || isPart(c));
const isModifier = (c: AnalysisCandidate): boolean => MODIFIER.has(c.pos ?? '') || isPart(c) || (c.pos === 'PRON' && !!c.morph.Gender && c.morph.Person === undefined);
const meet = (a: string[], b: string[]): string[] => a.filter((x) => b.includes(x));

/** Do two readings agree in case, number and gender, one of them a modifier of the other? */
function agrees(a: AnalysisCandidate, b: AnalysisCandidate): string[][] | undefined {
  if (!bearsCase(a) || !bearsCase(b)) return undefined;
  if (!(isModifier(a) || isModifier(b))) return undefined;
  if (HEAD.has(a.pos ?? '') === false && HEAD.has(b.pos ?? '') === false && !(isModifier(a) && isModifier(b))) return undefined;
  const cs = meet(set(a, 'Case'), set(b, 'Case'));
  if (!cs.length) return undefined;
  const ns = set(a, 'Number').length && set(b, 'Number').length ? meet(set(a, 'Number'), set(b, 'Number')) : set(a, 'Number').concat(set(b, 'Number'));
  if (set(a, 'Number').length && set(b, 'Number').length && !ns.length) return undefined;
  const gs = set(a, 'Gender').length && set(b, 'Gender').length ? meet(set(a, 'Gender'), set(b, 'Gender')) : set(a, 'Gender').concat(set(b, 'Gender'));
  if (set(a, 'Gender').length && set(b, 'Gender').length && !gs.length) return undefined;
  return [cs, [...new Set(ns)], [...new Set(gs)]];
}

/** Does the best reading of the word at `i` end a noun phrase: a preposition, a conjunction or a finite verb stands between a modifier and its noun only when they do not belong together. */
function breaksPhrase(list: AnalysisCandidate[]): boolean {
  const top = list.reduce<AnalysisCandidate | undefined>((b, c) => (!b || c.confidence > b.confidence ? c : b), undefined);
  if (!top) return false;
  if (top.pos === 'ADP' || top.pos === 'CONJ' || top.pos === 'SCONJ') return true;
  return (top.pos === 'VERB' || top.pos === 'AUX') && (top.morph.VerbForm ?? '') === 'Fin';
}

export function applyAgreement(tokens: RawToken[], base: AnalysisCandidate[][], words: number[]): void {
  // clause segments of word positions: a stop (. ; : ? ! ,) between two words separates them
  const seg: number[] = [];
  let s = 0;
  for (let w = 0; w < words.length; w++) {
    if (w > 0) {
      for (let t = words[w - 1] + 1; t < words[w]; t++) if (/^[.;:?!,]$/.test(tokens[t].surface)) { s++; break; }
    }
    seg.push(s);
  }
  for (let pass = 0; pass < 2; pass++) {
    const bonus: number[][] = base.map((l) => l.map(() => 0));
    for (let w = 0; w < words.length; w++) {
      const i = words[w];
      const surf = foldKey(tokens[i].surface);
      const adverbal = base[i].some((c) => c.pos === 'ADV' && foldKey(c.lemma ?? '') === surf);
      base[i].forEach((c, ci) => {
        if (!bearsCase(c)) return;
        // a vocative alone agrees with nothing (male, voc. of malus, is the adverb); an adjective that is also an adverb (primum, tantum, solum) takes only its next-door neighbour as head
        if (c.morph.Case === 'Voc') return;
        const reach = c.pos === 'ADJ' && adverbal ? 1 : 3;
        let best = 0;
        for (let d = -reach; d <= reach; d++) {
          if (d === 0) continue;
          const v = w + d;
          if (v < 0 || v >= words.length || seg[v] !== seg[w]) continue;
          let blocked = false;
          for (let u = Math.min(w, v) + 1; u < Math.max(w, v); u++) if (breaksPhrase(base[words[u]])) { blocked = true; break; }
          if (blocked) continue;
          for (const o of base[words[v]]) {
            if (!agrees(c, o)) continue;
            const score = o.confidence / (1 + 0.35 * (Math.abs(d) - 1));
            if (score > best) best = score;
          }
        }
        bonus[i][ci] = best;
      });
    }
    base.forEach((list, i) => list.forEach((c, ci) => { if (bonus[i][ci] > 0) c.confidence = Math.min(0.95, Math.round(c.confidence * (1 + 0.8 * bonus[i][ci]) * 100) / 100); }));
  }
}
