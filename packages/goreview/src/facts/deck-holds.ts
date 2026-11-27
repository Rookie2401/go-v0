/**
 * Languages whose deck is held to the owner's landing condition "no false or unknown word in the GoReview deck" (Arabic, 2026-11-25).
 * For such a language the facts provider
 *   - never builds facts for a bare FORM unit (`form:<lang>:<written form>`): it answers `requires-review` with a reason, so nothing
 *     downstream (recovery, intake, the session) can pick a lexeme and a meaning for it from the bare key. The word stays readable and
 *     markable on the GoLearn card; it is simply not drilled. (Before this, `formFacts` took the lemma of the top reading even when the
 *     analyser had refused to credit it, and fell back to the dictionary entry of the bare spelling.)
 *   - lets the adapter's own mark on the reading of a LEMMA unit (`notes.reviewStatus = 'requires-review'`, set by the language's deck
 *     gate: src/adapters/arabic/deck.ts) decide the unit's status, whether the unit is stored or derived from the pack.
 * Language-neutral: a language is listed here only when its adapter marks its readings that way. Today: Arabic only.
 */
export const DECK_HELD_LANGUAGES: ReadonlySet<string> = new Set(['ar']);

export const holdsDeck = (languageId: string): boolean => DECK_HELD_LANGUAGES.has(languageId) && !(typeof process !== 'undefined' && process.env?.AR_DECK_GATE === 'off');

/** What a learner reads when no reason came from the analyser. */
export const FORM_HELD_REASON = 'a bare written form is read on the card but not drilled: only a word the word list decides is';
