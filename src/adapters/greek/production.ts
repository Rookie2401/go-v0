/**
 * Checks on a learner's own Greek (GoTell). Each rule fires on its own unambiguous shape and says nothing when a fact is missing; an
 * empty result is "nothing found", never "correct". The target PERIOD matters: polytonic spelling in a Modern draft, or monotonic
 * spelling in a Koine one, is a register note (a proposal), and a form of another period is said to be that.
 */
import type { AnalyzeOptions, AnalyzedToken, ErrorCandidate, RawToken } from '../../core';
import { hasAccent, isPolytonic } from './text';

const ANCIENT = new Set(['el-hom', 'el-att', 'el-koi', 'el-med']);

export function checkElProduction(tokens: RawToken[], analyses: AnalyzedToken[], _sentence: string, opts?: AnalyzeOptions): ErrorCandidate[] {
  const out: ErrorCandidate[] = [];
  const target = opts?.varietyId ?? 'el-mod';
  tokens.forEach((t, i) => {
    if (!t.isWord) return;
    const s = t.surface;
    // spelling: a non-final sigma at the end of a word, a final sigma inside one
    if (/σ$/u.test(s) && s.length > 1) out.push({ category: 'spelling', tokenIndexes: [i], message: 'σ at the end of a word is written ς.', suggestion: { start: t.start, end: t.end, replacement: s.replace(/σ$/u, 'ς') }, confidence: 0.9, affectsMeaning: false });
    else if (/ς(?=.)/u.test(s)) out.push({ category: 'spelling', tokenIndexes: [i], message: 'ς is the final form; inside a word the letter is written σ.', suggestion: { start: t.start, end: t.end, replacement: s.replace(/ς(?=.)/gu, 'σ') }, confidence: 0.8, affectsMeaning: false });
    // register: the spelling system of the other period
    if (target === 'el-mod' && isPolytonic(s)) out.push({ category: 'register', tokenIndexes: [i], message: `${s} is written with polytonic marks (breathings, grave, circumflex or iota subscript); Modern Greek has used the monotonic system since 1982.`, confidence: 0.7, affectsMeaning: false });
    if (ANCIENT.has(target) && hasAccent(s) && !isPolytonic(s) && /[αεηιουω]/u.test(s) && s.length > 2 && !/^[\p{Lu}]/u.test(s)) {
      // a monotonic word that would carry a breathing or a different accent in ancient spelling cannot be checked letter by letter here; only the fact is noted
      const best = analyses[i]?.candidates[0];
      if (best && !(best.varieties ?? []).some((v) => ANCIENT.has(v))) out.push({ category: 'register', tokenIndexes: [i], message: `${s} is read as a Modern Greek form; the draft targets ${target === 'el-koi' ? 'Koine' : target === 'el-att' ? 'Attic' : target === 'el-hom' ? 'Homeric' : 'medieval'} Greek, which is written polytonic.`, confidence: 0.5, affectsMeaning: false });
    }
    // dialect: an Attic / Epic form in a Koine draft, or a Koine / Attic form in a Modern one, when the readings say so unambiguously
    const best = analyses[i]?.candidates[0];
    const vs = best?.varieties ?? [];
    // a reading matched without its accents says nothing sure about the period of the written word
    if (best && vs.length && !vs.includes(target) && best.notes?.accents !== 'inferred' && !(target === 'el-mod' && isPolytonic(s))) {
      const other = vs.filter((v) => v !== target);
      if (other.length && !vs.some((v) => v === target)) out.push({ category: 'dialect', tokenIndexes: [i], message: `${s} is read as ${other.map((v) => v.replace('el-', '')).join(' / ')} Greek, not as a form of the period this draft targets.`, confidence: 0.45, affectsMeaning: false });
    }
  });
  return out;
}
