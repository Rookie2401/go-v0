/**
 * Library runtime (browser-safe). The build tool is src/library/build.ts (pure) and src/library/build-node.ts (files,
 * Node only); neither is imported from here, so the app bundle carries only what it reads a library with.
 *
 *   createLibrary                      the `Library` contract: info / search / entry / profile / open / indexStore
 *   profileOfStoredText                the lexical profile of a text already in the store
 *   featuresOfStoredText               its generic difficulty features
 *   putCatalogRows / removeCatalogRows write catalogue rows through the posting lists (search needs them in step)
 *   searchCatalog                      the paged query behind `Library.search`, with optional cost statistics
 *   fold, textMatcher                  accent- and case-insensitive name matching
 */
import type { CatalogText } from '../core';

export { createLibrary, type LibraryDeps } from './library';
export { profileOfStoredText, featuresOfStoredText, measureStoredText, analyzerKeyOf, LONG_SENTENCE_WORDS } from './measure';
export { putCatalogRows, removeCatalogRows, rebuildCatalogIndex, searchCatalog, textMatcher, facetsOf, CHUNK, DEFAULT_LIMIT, MAX_LIMIT, type SearchStats } from './postings';
export { baseRowOf, rightsStateOf } from './store-index';
export { fold, wordsOf } from './text';
export {
  LIBRARY_SCHEMA, SHARD_ROWS, documentPathOf, profilePathOf, shardPathOf, parseManifest, parseShard,
  type LibraryManifest, type LibraryShardInfo,
} from './format';

export type { CatalogText };
