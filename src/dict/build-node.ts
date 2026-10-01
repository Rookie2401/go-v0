/// <reference types="node" />
/**
 * Node-only half of the dictionary build. The input (the Spanish kaikki extract is ~1 GB, the Thai one ~50 MB) is
 * streamed line by line and never held whole, and memory stays bounded however large it is:
 *
 *   pass 1  each line is mapped and appended to one of 256 spill files in the temp directory, chosen by the form's
 *           hash (so every entry of one form lands in the same file); only small write buffers are held. The label
 *           lists of the form-of relations are counted here, so the manifest's label-set numbering is known before
 *           any shard is written.
 *   pass 2  the spill files are read one at a time, entries of the same form + part of speech + etymology +
 *           pronunciations are merged, and the shards of that partition are written. The bucket count (a multiple of
 *           256, chosen from the total size so that shards average ~100 kB) makes bucket mod 256 the partition.
 *
 * The output is byte-identical to the in-memory builder's (src/dict/build.ts) for the same input. Records where the
 * data came from (file name, sha256, line count and whatever the caller states about it) in the manifest.
 * Not imported by the browser bundle.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import type { DictionaryEntry, DictionaryInfo, LanguageCode } from '../core';
import { createAdapterRegistry } from '../adapters';
import {
  chooseBuckets, createLabelSetRegistry, createLineIngestor, dropsFormPronunciations, entryJson, estimateBytes, makeManifest, manifestText,
  mergeEntries, mergeKey, newBuildStats, settleEntries, shardShape, shardText, tallyEntry, tallyShard, type BuildStats,
} from './build';
import { SHARD_FILE, bucketOf, shardName, type DictionaryManifest } from './format';

export const SPILL_PARTITIONS = 256;

export interface BuildFileOptions {
  input: string;
  lang: LanguageCode;
  outDir: string;
  /** YYYY-MM-DD; the only clock the build uses. */
  date: string;
  normalize?: (surface: string) => string;
  /** Leave the pronunciation off inflected-form entries (default: the language's setting, DROP_FORM_PRONUNCIATIONS in build.ts). */
  dropFormPronunciations?: boolean;
  /** What the caller knows about the file; the file name, sha256 and line count are computed here. */
  source?: { url?: string; lastModified?: string; retrievedAt?: string };
  /** Where the temporary spill directory is made (default: the system temp directory). It is removed when the build ends. */
  tmpDir?: string;
}

export interface BuildFileResult {
  manifest: DictionaryManifest;
  stats: BuildStats;
  /** Directory the files were written to (`<outDir>/<lang>`). */
  dir: string;
}

/** Remove what an earlier build left in `dir` (manifest and shards only), so a stale shard never outlives a rebuild. */
function clearPreviousBuild(dir: string): void {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) if (name === 'manifest.json' || SHARD_FILE.test(name)) fs.rmSync(path.join(dir, name));
}

/** sha256 of the file's bytes, streamed. */
export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (c) => hash.update(c)).on('error', reject).on('end', () => resolve(hash.digest('hex')));
  });
}

/** Append-only spill files with small in-memory buffers (bounded: 256 x ~32 K characters at most). */
function createSpill(dir: string) {
  const fds: Array<number | undefined> = new Array(SPILL_PARTITIONS).fill(undefined);
  const bufs: string[] = new Array(SPILL_PARTITIONS).fill('');
  const file = (p: number) => path.join(dir, `p-${p}.jsonl`);
  const flush = (p: number) => {
    if (!bufs[p]) return;
    if (fds[p] === undefined) fds[p] = fs.openSync(file(p), 'a');
    fs.writeSync(fds[p]!, bufs[p]);
    bufs[p] = '';
  };
  return {
    add(p: number, record: string) {
      bufs[p] += record + '\n';
      if (bufs[p].length > 32768) flush(p);
    },
    close() {
      for (let p = 0; p < SPILL_PARTITIONS; p++) { flush(p); if (fds[p] !== undefined) { fs.closeSync(fds[p]!); fds[p] = undefined; } }
    },
    /** The records of one partition, in the order they were written (empty when none). */
    read(p: number): string[] {
      const f = file(p);
      if (!fs.existsSync(f)) return [];
      return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
    },
  };
}

export async function buildDictionaryFile(opts: BuildFileOptions): Promise<BuildFileResult> {
  const adapter = opts.normalize ? undefined : createAdapterRegistry().get(opts.lang);
  const normalize = opts.normalize ?? ((s: string) => adapter!.normalize(s));
  const stats = newBuildStats();
  const labelSets = createLabelSetRegistry();
  const drop = dropsFormPronunciations({ lang: opts.lang, dropFormPronunciations: opts.dropFormPronunciations });
  const ingest = createLineIngestor({ lang: opts.lang, normalize, dropFormPronunciations: opts.dropFormPronunciations }, stats, labelSets);
  const spillDir = fs.mkdtempSync(path.join(opts.tmpDir ?? os.tmpdir(), 'go-dict-spill-'));
  const spill = createSpill(spillDir);
  try {
    // Pass 1: map every line and spill it by form hash. The checksum is read in parallel.
    const sha = sha256File(opts.input);
    sha.catch(() => undefined); // surfaced below; do not leave it unhandled if the read loop throws first
    let lines = 0;
    let estimate = 0;
    const rl = readline.createInterface({ input: fs.createReadStream(opts.input, { encoding: 'utf8' }), crlfDelay: Infinity });
    for await (const line of rl) {
      lines++;
      const entry = ingest(line);
      if (!entry) continue;
      estimate += estimateBytes(entry, entryJson(shardShape(entry, drop), labelSets.provisional));
      // The spill is this process's own temporary file: the mapped entry as it is, read back with JSON.parse.
      spill.add(bucketOf(entry.form, SPILL_PARTITIONS), JSON.stringify(entry));
    }
    spill.close();
    const source: NonNullable<DictionaryInfo['source']> = {
      ...(opts.source?.url ? { url: opts.source.url } : {}),
      file: path.basename(opts.input),
      ...(opts.source?.lastModified ? { lastModified: opts.source.lastModified } : {}),
      sha256: await sha,
      ...(opts.source?.retrievedAt ? { retrievedAt: opts.source.retrievedAt } : {}),
      lines,
    };
    if (stats.kept === 0) throw new Error('no usable entries in the input (nothing written)');

    // Pass 2: merge and write one partition at a time.
    const buckets = chooseBuckets(estimate);
    stats.buckets = buckets;
    const table = labelSets.finalize(); // every relation's labels were counted in pass 1, so the numbering is final
    stats.labelSets = table.sets.length;
    const dir = path.join(opts.outDir, opts.lang);
    fs.mkdirSync(dir, { recursive: true });
    clearPreviousBuild(dir);
    const shardFiles: string[] = [];
    for (let p = 0; p < SPILL_PARTITIONS; p++) {
      const records = spill.read(p);
      if (!records.length) continue;
      const merged = new Map<string, DictionaryEntry>();
      for (const rec of records) {
        const entry = JSON.parse(rec) as DictionaryEntry;
        const key = mergeKey(entry);
        const prev = merged.get(key);
        merged.set(key, prev ? mergeEntries(prev, entry) : entry);
      }
      const grouped = new Map<number, Map<string, string[]>>();
      const forms = new Set<string>();
      for (const e of settleEntries(merged.values(), drop, stats)) { // insertion order = input order within the partition
        tallyEntry(stats, e);
        forms.add(e.form);
        const b = bucketOf(e.form, buckets);
        const shard = grouped.get(b) ?? new Map<string, string[]>();
        shard.set(e.form, [...(shard.get(e.form) ?? []), entryJson(e, table.indexOf)]);
        grouped.set(b, shard);
      }
      stats.forms += forms.size;
      for (const b of [...grouped.keys()].sort((x, y) => x - y)) {
        const text = shardText(grouped.get(b)!);
        const name = shardName(b, buckets);
        fs.writeFileSync(path.join(dir, name), text, 'utf8');
        shardFiles.push(name);
        tallyShard(stats, text);
      }
    }
    shardFiles.sort();
    const manifest = makeManifest(opts.lang, opts.date, source, stats, shardFiles, table.sets);
    fs.writeFileSync(path.join(dir, 'manifest.json'), manifestText(manifest), 'utf8');
    return { manifest, stats, dir };
  } finally {
    spill.close();
    fs.rmSync(spillDir, { recursive: true, force: true });
  }
}
