/**
 * The fr (French) analyser as its own chunk (`dist/analysers/fr.js`): the content script imports it on demand. The lemma list taken from the
 * dictionary (about 78,000 lemmas; no meanings) is a second chunk, and `ready` is the promise of its arrival: the loaders wait for it before
 * they hand the analyser to the parser, so the first card a learner opens already knows which words are real (without it the first lookup of a
 * word outside the hand list would show a rule guess and the second lookup something else). Both chunks are the extension's own files, so the
 * wait is a file read and a parse of about a megabyte; if the list cannot be read the analyser still loads and works from the hand word list
 * alone. (An exported promise, not a top-level await: the setup page is built as a classic script, which cannot contain one.)
 */
import { loadFrenchLexicon } from '../../../../src/adapters/fr';

export { frAdapter as adapter } from '../../../../src/adapters/fr';

export const ready: Promise<void> = loadFrenchLexicon().catch(() => undefined);
