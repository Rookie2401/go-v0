/** The he (Hebrew) analyser as its own chunk (`dist/analysers/he.js`): the content script imports it on demand. */
export { heAdapter as adapter } from '../../../../src/adapters/he';
/** The chunk's own shard-loader factory: a sharded Hebrew index (lexicon/he/*) must be installed into THIS chunk's index store. */
export { createHebrewShardLoader as createShardLoader } from '../../../../src/adapters/hebrew/shards';
