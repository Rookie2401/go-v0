/**
 * The fr (French) analyser as its own chunk (`dist/analysers/fr.js`): the content script imports it on demand. The lemma list taken from the
 * dictionary (about 78,000 lemmas; no meanings) is a second chunk. This module WAITS for it (a top-level await: the chunks are ES modules),
 * so the first card a learner opens already knows which words are real: without it the first lookup of a word outside the hand list would
 * show a rule guess and the second lookup something else. Both chunks are read from the extension's own files, so the wait is a file read and
 * a parse (about a megabyte, well under a tenth of a second); if the list cannot be read the analyser still loads and works from the hand
 * word list alone.
 */
import { loadFrenchLexicon } from '../../../../src/adapters/fr';

export { frAdapter as adapter } from '../../../../src/adapters/fr';

await loadFrenchLexicon().catch(() => undefined);
