/**
 * The compound tenses: a form of kam or jam directly before a participle (kam parë, kishte shkuar, është hapur).
 * Coordinator's addition to the sentence layer.
 *
 * Two words are decided, each only when its own readings leave a choice:
 *   - the second word, when it is a participle AND something else ("parë": seen / first; "hapur": opened / open), is
 *     read as the participle;
 *   - the first word, when it is a form of kam or jam AND something else ("kisha": I had / the church), is read as
 *     the auxiliary.
 * Only directly adjacent words: an adverb or a linking article between them ("është e parë") means this rule says
 * nothing. Machine-drafted, not checked by a native speaker.
 */
import { isFin, isParticiple, norm, pick, prevWord, type C, type Ctx } from './sentence-core';

const AUXILIARIES = new Set(['kam', 'jam']);
const isAuxiliary = (c: C): boolean => isFin(c) && AUXILIARIES.has(c.lemma ?? '');

export function perfect(cx: Ctx): void {
  for (let i = 0; i < cx.tokens.length; i++) {
    if (!cx.tokens[i].isWord || cx.inUnit.has(i) || !cx.cur[i].some(isParticiple)) continue;
    const j = prevWord(cx, i);
    if (j === undefined || cx.inUnit.has(j)) continue;
    const aux = cx.cur[j].find(isAuxiliary);
    if (!aux) continue;
    pick(cx, i, { pred: isParticiple, why: `after "${norm(cx, j)}": the participle of a compound tense (${aux.lemma} + participle)` });
    pick(cx, j, { pred: isAuxiliary, why: `before the participle "${norm(cx, i)}": the auxiliary of a compound tense` });
  }
}
