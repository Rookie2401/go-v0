import fs from 'node:fs';
import path from 'node:path';

const MANIFEST = path.resolve(__dirname, '../../public/dict/la/manifest.json');

/** The built Latin dictionary's manifest (id, entries …), or undefined when the dictionary lane's output is not on disk. */
export function laDictionaryOnDisk(): { id: string; entries: number; shardFiles?: string[] } | undefined {
  try {
    const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as { id?: unknown; entries?: unknown; shardFiles?: unknown };
    return typeof m.id === 'string' && typeof m.entries === 'number' ? { id: m.id, entries: m.entries, ...(Array.isArray(m.shardFiles) ? { shardFiles: m.shardFiles as string[] } : {}) } : undefined;
  } catch {
    return undefined;
  }
}
