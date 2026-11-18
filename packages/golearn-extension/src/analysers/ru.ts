/** The ru (Russian) analyser as its own chunk (`dist/analysers/ru.js`): the content script imports it on demand. */
export { ruAdapter as adapter } from '../../../../src/adapters/ru';
/** The chunk's own shard-loader factory: the sharded Russian index (lexicon/ru/standard) must be installed into THIS chunk's index store. */
export { createRussianShardLoader as createShardLoader } from '../../../../src/adapters/russian/shards';
