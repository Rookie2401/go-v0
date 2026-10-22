/** The el (Greek) analyser as its own chunk (`dist/analysers/el.js`): the content script imports it on demand. */
export { elAdapter as adapter } from '../../../../src/adapters/el';
/** The chunk's own shard-loader factory: a sharded Greek index (lexicon/el/*) must be installed into THIS chunk's index store. */
export { createGreekShardLoader as createShardLoader } from '../../../../src/adapters/greek/shards';
