/** The ko (Korean) analyser as its own chunk (`dist/analysers/ko.js`): the content script imports it on demand. */
export { koAdapter as adapter } from '../../../../src/adapters/ko';
/** The chunk's own shard-loader factory: the sharded Korean stem lexicon (lexicon/ko/standard) must be installed into THIS chunk's store. */
export { createKoreanShardLoader as createShardLoader } from '../../../../src/adapters/korean/shards';
