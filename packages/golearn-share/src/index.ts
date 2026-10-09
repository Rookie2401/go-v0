/**
 * golearn-share — the mobile share contract. A passage that reaches GoLearn from outside a browser tab (an Android text
 * selection menu, a share sheet, an iOS share extension, a web share target, a pasted clipboard, a deep link) is
 * normalised under the reader contract's rules, the learner picks the word when the sender did not, and the lookup is
 * recorded as the same `SelectionLookedUp` event a browser lookup produces. Imports only the Repository contract.
 * See docs/ecosystem/reader/MOBILE-COMPANION-PLAN.md.
 */
export * from './mechanism';
export * from './passage';
export * from './source';
export * from './event';
export * from './query';
export { cleanText, trimEdges, wordCount, textDirection } from './text';
