/**
 * Older German spelling related to today's (daß → dass, thun → tun, Thal → Tal). The text is never changed.
 * STUB — package GE replaces the body.
 */

export interface DeSpellingRelation { modern: string; period: 'de-1901' | 'de-pre1901'; confidence: number; rule: string }

/**
 * The modern spellings an older written form may stand for, best first; empty for a form that is modern spelling.
 * `isModernWord` says whether a candidate modern spelling is a known word (lexicon, or a dictionary-backed test).
 */
export function historicalGerman(_form: string, _isModernWord: (form: string) => boolean): DeSpellingRelation[] { return []; }
