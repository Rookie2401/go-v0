/**
 * The fr (French) analyser as its own chunk (`dist/analysers/fr.js`): the content script imports it on demand. The lemma list taken from the
 * dictionary (about 78,000 lemmas; no meanings) is a second chunk, loaded lazily from here: the hand word list is inline, so the analyser
 * reads at once and reads more words a moment later.
 */
import { loadFrenchLexicon } from '../../../../src/adapters/fr';

export { frAdapter as adapter } from '../../../../src/adapters/fr';

void loadFrenchLexicon().catch(() => undefined);
