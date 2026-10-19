/**
 * Checks on a learner's own Hebrew (GoTell). Each rule fires only on its own unambiguous shape and says nothing when a fact is
 * missing; an empty result means "nothing found", never "correct". The target PERIOD matters: a Biblical narrative form in a
 * Modern Hebrew draft is a register proposal, not an error, and the other way round.
 */
import type { AnalyzeOptions, AnalyzedToken, ErrorCandidate, RawToken } from '../../core';
import { consonantal } from './text';

const NON_FINAL_AT_END = /[כמנפצ]$/u;
const FINAL_INSIDE = /[ךםןףץ](?=.)/u;
const TO_FINAL: Record<string, string> = { 'כ': 'ך', 'מ': 'ם', 'נ': 'ן', 'פ': 'ף', 'צ': 'ץ' };
const TO_NON_FINAL: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

export function checkHeProduction(tokens: RawToken[], analyses: AnalyzedToken[], _sentence: string, opts?: AnalyzeOptions): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  const target = opts?.varietyId ?? 'he-mod';
  tokens.forEach((t, i) => {
    if (!t.isWord) return;
    const skel = consonantal(t.surface);
    // spelling: a non-final letter at the end of a word (except the few words written so, like the abbreviation marks); a final letter inside
    if (NON_FINAL_AT_END.test(skel) && skel.length > 1 && !/[׳״'"]/.test(t.surface)) {
      const last = skel[skel.length - 1];
      const fixed = t.surface.replace(/[כמנפצ](?=[^א-ת]*$)/u, TO_FINAL[last]);
      out.push({ category: 'spelling', tokenIndexes: [i], message: `${last} at the end of a word is written in its final form ${TO_FINAL[last]}.`, suggestion: { start: t.start, end: t.end, replacement: fixed }, confidence: 0.85, affectsMeaning: false });
    } else if (FINAL_INSIDE.test(skel)) {
      const m = FINAL_INSIDE.exec(skel)!;
      out.push({ category: 'spelling', tokenIndexes: [i], message: `${m[0]} is a final form; inside a word the letter is written ${TO_NON_FINAL[m[0]]}.`, confidence: 0.7, affectsMeaning: false });
    }
    // register: a Biblical narrative form in a Modern draft, or a Modern tense form in a Biblical one — a proposal, never a correction
    const best = analyses[i]?.candidates[0];
    if (!best) return;
    const conj = best.morph.Conj;
    if (target === 'he-mod' && (conj === 'Wayyiqtol' || conj === 'WeQatal') && (best.varieties ?? []).includes('he-bib')) {
      out.push({ category: 'register', tokenIndexes: [i], message: `${t.surface} is a Biblical narrative form (${conj === 'Wayyiqtol' ? 'wayyiqtol' : 'weqatal'}); Modern Hebrew tells a story in the past tense.`, confidence: 0.6, affectsMeaning: false });
    }
    if (target === 'he-bib' && (conj === 'Past' || conj === 'Fut' || conj === 'Pres') && !(best.varieties ?? []).includes('he-bib')) {
      out.push({ category: 'register', tokenIndexes: [i], message: `${t.surface} is read as a Modern Hebrew form; Biblical Hebrew marks time differently (qatal / yiqtol and the sequential forms).`, confidence: 0.5, affectsMeaning: false });
    }
  });
  return out;
}
