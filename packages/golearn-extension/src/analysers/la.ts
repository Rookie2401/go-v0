/** The la (Latin) analyser as its own chunk (`dist/analysers/la.js`): the content script imports it on demand. The full Whitaker lexicon is a second chunk, loaded lazily from here (the seed lexicon is inline). */
import { loadLatinLexicon } from '../../../../src/adapters/la';

export { laAdapter as adapter } from '../../../../src/adapters/la';

void loadLatinLexicon().catch(() => undefined);
