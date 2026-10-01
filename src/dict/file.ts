/// <reference types="node" />
/**
 * Node-only dictionary source (CLI, tests, server-side analysis): reads `<dir>/<lang>/manifest.json` and shards from
 * disk. Kept out of src/dict/index.ts so the browser bundle never imports node:fs.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { LanguageCode, LexiconSource } from '../core';
import { createShardedSource, type ShardCacheOptions } from './sharded';

/** `options` bounds the parsed-shard cache (default: 24 shards, 4 read at a time); see ShardCacheOptions. */
export function createFileLexiconSource(dir: string, lang: LanguageCode, options?: ShardCacheOptions): LexiconSource {
  return createShardedSource(lang, async (relative) => {
    try { return await fs.promises.readFile(path.join(dir, lang, relative), 'utf8'); }
    catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return undefined; // not installed: the normal state
      throw e; // anything else (permissions, I/O) is transient: not cached, retried on the next lookup
    }
  }, options);
}
