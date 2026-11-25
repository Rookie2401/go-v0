/** The ar (Arabic) analyser as its own chunk (`dist/analysers/ar.js`): the content script imports it on demand. */
export { arAdapter as adapter } from '../../../../src/adapters/ar';
/** The chunk's own shard-loader factory: the sharded Arabic index (lexicon/ar/standard) must be installed into THIS chunk's index store. */
export { createArabicShardLoader as createShardLoader } from '../../../../src/adapters/arabic/shards';
