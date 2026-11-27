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
import { decided, isFin, isNominal, isParticiple, nextWord, norm, pick, prevWord, type C, type Ctx } from './sentence-core';

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

/** Words that open a clause: after one of them a word is the start of that clause's predicate or subject. */
const CLAUSE_OPENERS = new Set(['sepse', 'se', 'që', 'kur', 'ndërsa', 'ndaj', 'por', 'dhe', 'e', 'edhe', 'ku', 'nëse', 'pasi', 'sapo', 'megjithëse']);
/** Words that open a noun phrase of quantity or number, which a noun "the church" cannot be followed by. */
const QUANTIFIERS = new Set(['shumë', 'pak', 'mjaft', 'disa', 'një', 'dy', 'tre', 'katër', 'pesë', 'gjashtë', 'shtatë', 'tetë', 'nëntë', 'dhjetë', 'aq', 'gjithë', 'asnjë', 'asgjë', 'çdo']);

/**
 * "kisha" is the imperfect of kam (I had) and the definite noun kishë (the church). It is the verb when the words around
 * leave the noun no place: right after the subject pronoun "unë", or after a word that opens a clause (or at the start)
 * and before a word of quantity ("sepse kisha shumë punë"). Elsewhere (after a preposition, before "e", alone) nothing
 * is said. A form already decided by another rule is left alone.
 */
export function auxiliaryBeforeObject(cx: Ctx): void {
  for (let i = 0; i < cx.tokens.length; i++) {
    if (!cx.tokens[i].isWord || cx.inUnit.has(i) || decided(cx, i)) continue;
    if (!cx.cur[i].some(isAuxiliary) || !cx.cur[i].some(isNominal)) continue;
    const j = prevWord(cx, i);
    const n = nextWord(cx, i);
    const before = j === undefined ? '' : norm(cx, j);
    const after = n === undefined ? '' : norm(cx, n);
    const afterSubject = before === 'unë';
    const openedClause = (j === undefined || CLAUSE_OPENERS.has(before)) && QUANTIFIERS.has(after);
    if (!afterSubject && !openedClause) continue;
    pick(cx, i, {
      pred: isAuxiliary,
      why: afterSubject ? `after the subject "${before}": the verb (I had), not the noun` : `after a word that opens a clause and before "${after}", a quantity: the verb (had), not the noun`,
    });
  }
}

/**
 * "kurse" is the conjunction (whereas) and the plural of the noun kurs (course). After a comma it is the conjunction,
 * unless what follows goes with a noun (a linking article, "dhe", another comma: a list or a described noun). Elsewhere
 * nothing is said and the two readings stay level.
 */
export function conjunctionAfterComma(cx: Ctx): void {
  for (let i = 1; i < cx.tokens.length; i++) {
    if (!cx.tokens[i].isWord || cx.inUnit.has(i) || decided(cx, i) || norm(cx, i) !== 'kurse') continue;
    if (cx.tokens[i - 1].surface.trim() !== ',') continue;
    const n = nextWord(cx, i);
    if (n === undefined || ['të', 'e', 'i', 'së', 'dhe'].includes(norm(cx, n))) continue;
    pick(cx, i, { pred: (c) => c.pos === 'SCONJ', why: 'after a comma, between two clauses: the conjunction (whereas), not the noun' });
  }
}
