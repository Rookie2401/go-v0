/// <reference types="node" />
/**
 * Node-only builder of the full lexical records (schema `full-1`, src/dict/full-format.ts).
 *
 *   npm run dict:build-full -- <lang> [--limit N] [--in <file>] [--out <dir>] [--date YYYY-MM-DD]
 *                              [--last-modified YYYY-MM-DD] [--source-url <url>]
 *
 * The kaikki file (the Spanish one is ~1 GB) is STREAMED line by line, never read whole; a `.gz` is gunzipped on the
 * fly. Two passes with bounded memory, like src/dict/build-node.ts: pass 1 maps each line and spills the record to one
 * of 256 files by its lemma key's hash; pass 2 reads one spill file at a time and writes the shards of that partition
 * (the bucket count is a multiple of 256 chosen from the total size, so bucket mod 256 is the partition).
 *
 * Input defaults to data/dictionaries/kaikki.org-dictionary-<Language>.jsonl (else .jsonl.gz). The source version and
 * url come from the flags, else from the schema-3 manifest already built in <out>/<lang>/. `--limit N` reads only the
 * first N lines and, with no --out, writes to a temporary directory (it never overwrites a real build).
 * Output: <out>/<lang>/full/manifest.json and f-<hh>.json.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';
import { LANGUAGES, type LanguageCode } from '../core';
import { createAdapterRegistry } from '../adapters';
import { KAIKKI_ATTRIBUTION } from './build';
import {
  FULL_SCHEMA, FULL_SHARD_FILE, FULL_SKIPS, bucketOf, chooseFullBuckets, fullManifestText, fullShardName, fullShardText, mapFullLine, newFullCounts,
  tallyFullRecord, type FullCounts, type FullManifest, type FullSkip,
} from './full-format';

export const FULL_SPILL_PARTITIONS = 256;

/** The language name kaikki uses in its file names. */
export const KAIKKI_LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  sq: 'Albanian', de: 'German', es: 'Spanish', hi: 'Hindi', th: 'Thai', nb: 'Norwegian Bokmål', en: 'English', grc: 'Ancient Greek',
};

export interface BuildFullOptions {
  input: string;
  lang: LanguageCode;
  outDir: string;
  /** YYYY-MM-DD; the only clock the build uses. */
  date: string;
  normalize?: (surface: string) => string;
  /** Read only the first N lines. */
  limit?: number;
  source?: { url?: string; lastModified?: string };
  tmpDir?: string;
}

export interface FullBuildStats {
  lines: number;
  blank: number;
  malformed: number;
  skipped: Record<FullSkip, number>;
  counts: FullCounts;
  buckets: number;
  shards: number;
  shardBytes: number;
  largestShardBytes: number;
  /** Lemma keys (distinct). */
  keys: number;
}

export interface BuildFullResult {
  manifest: FullManifest;
  stats: FullBuildStats;
  dir: string;
}

const utf8 = new TextEncoder();
const byteLength = (s: string): number => utf8.encode(s).length;

/** Lines of a file, gunzipped when it ends in .gz; streamed. */
export function readLines(file: string): AsyncIterable<string> {
  const raw = fs.createReadStream(file);
  const input = file.endsWith('.gz') ? raw.pipe(zlib.createGunzip()) : raw;
  input.setEncoding?.('utf8');
  return readline.createInterface({ input, crlfDelay: Infinity });
}

function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (c) => hash.update(c)).on('error', reject).on('end', () => resolve(hash.digest('hex')));
  });
}

function createSpill(dir: string) {
  const fds: Array<number | undefined> = new Array(FULL_SPILL_PARTITIONS).fill(undefined);
  const bufs: string[] = new Array(FULL_SPILL_PARTITIONS).fill('');
  const file = (p: number) => path.join(dir, `p-${p}.jsonl`);
  const flush = (p: number) => {
    if (!bufs[p]) return;
    if (fds[p] === undefined) fds[p] = fs.openSync(file(p), 'a');
    fs.writeSync(fds[p]!, bufs[p]);
    bufs[p] = '';
  };
  return {
    add(p: number, record: string) { bufs[p] += record + '\n'; if (bufs[p].length > 65536) flush(p); },
    close() { for (let p = 0; p < FULL_SPILL_PARTITIONS; p++) { flush(p); if (fds[p] !== undefined) { fs.closeSync(fds[p]!); fds[p] = undefined; } } },
    read(p: number): string[] {
      const f = file(p);
      return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean) : [];
    },
  };
}

/** Remove what an earlier full build left in `dir` (manifest and shards only). */
function clearPreviousBuild(dir: string): void {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) if (name === 'manifest.json' || FULL_SHARD_FILE.test(name)) fs.rmSync(path.join(dir, name));
}

/** What the schema-3 manifest of the same language says about the source (url, dump date), when it is there. */
function schema3Source(outDir: string, lang: string): { url?: string; lastModified?: string } {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(outDir, lang, 'manifest.json'), 'utf8')) as { source?: { url?: string; lastModified?: string } };
    return { ...(m.source?.url ? { url: m.source.url } : {}), ...(m.source?.lastModified ? { lastModified: m.source.lastModified } : {}) };
  } catch { return {}; }
}

export async function buildFullFile(opts: BuildFullOptions): Promise<BuildFullResult> {
  const adapter = opts.normalize ? undefined : createAdapterRegistry().get(opts.lang);
  const normalize = opts.normalize ?? ((s: string) => adapter!.normalize(s));
  const stats: FullBuildStats = {
    lines: 0, blank: 0, malformed: 0, counts: newFullCounts(), buckets: 0, shards: 0, shardBytes: 0, largestShardBytes: 0, keys: 0,
    skipped: Object.fromEntries(FULL_SKIPS.map((k) => [k, 0])) as Record<FullSkip, number>,
  };
  const spillDir = fs.mkdtempSync(path.join(opts.tmpDir ?? os.tmpdir(), 'go-dict-full-spill-'));
  const spill = createSpill(spillDir);
  try {
    const sha = sha256File(opts.input);
    sha.catch(() => undefined);
    let estimate = 0;
    let first = true;
    for await (const raw of readLines(opts.input)) {
      let text = raw;
      if (first) { first = false; text = text.replace(/^﻿/, ''); }
      text = text.trim();
      if (!text) { stats.blank++; continue; }
      if (opts.limit !== undefined && stats.lines >= opts.limit) break;
      stats.lines++;
      let json: unknown;
      try { json = JSON.parse(text); } catch { stats.malformed++; continue; }
      const { key, record, skipped } = mapFullLine(json, normalize, opts.lang);
      if (!record || key === undefined) { stats.skipped[skipped!]++; continue; }
      tallyFullRecord(stats.counts, record);
      const rec = JSON.stringify(record);
      estimate += byteLength(rec) + byteLength(key) + 6;
      spill.add(bucketOf(key, FULL_SPILL_PARTITIONS), JSON.stringify([key, rec]));
    }
    spill.close();
    if (stats.counts.records === 0) throw new Error('no usable entries in the input (nothing written)');

    const buckets = chooseFullBuckets(estimate);
    stats.buckets = buckets;
    const dir = path.join(opts.outDir, opts.lang, 'full');
    fs.mkdirSync(dir, { recursive: true });
    clearPreviousBuild(dir);
    const shardFiles: string[] = [];
    for (let p = 0; p < FULL_SPILL_PARTITIONS; p++) {
      const rows = spill.read(p);
      if (!rows.length) continue;
      const grouped = new Map<number, Map<string, string[]>>();
      const keys = new Set<string>();
      for (const row of rows) {
        const [key, rec] = JSON.parse(row) as [string, string];
        keys.add(key);
        const b = bucketOf(key, buckets);
        const shard = grouped.get(b) ?? new Map<string, string[]>();
        const l = shard.get(key);
        if (l) l.push(rec); else shard.set(key, [rec]);
        grouped.set(b, shard);
      }
      stats.keys += keys.size;
      for (const b of [...grouped.keys()].sort((x, y) => x - y)) {
        const text = fullShardText(grouped.get(b)!);
        const name = fullShardName(b, buckets);
        fs.writeFileSync(path.join(dir, name), text, 'utf8');
        shardFiles.push(name);
        const bytes = byteLength(text);
        stats.shards++;
        stats.shardBytes += bytes;
        stats.largestShardBytes = Math.max(stats.largestShardBytes, bytes);
      }
    }
    shardFiles.sort();
    const known = { ...(schema3Source(opts.outDir, opts.lang).lastModified ? schema3Source(opts.outDir, opts.lang) : schema3Source('public/dict', opts.lang)), ...(opts.source?.url ? { url: opts.source.url } : {}), ...(opts.source?.lastModified ? { lastModified: opts.source.lastModified } : {}) };
    const name = KAIKKI_LANGUAGE_NAMES[opts.lang] ?? opts.lang;
    const manifest: FullManifest = {
      schema: FULL_SCHEMA,
      lang: opts.lang,
      source: {
        name: 'Wiktionary, via kaikki.org (Wiktextract)',
        url: known.url ?? `https://kaikki.org/dictionary/${encodeURIComponent(name)}/`,
        version: known.lastModified ?? opts.date,
        licence: 'CC BY-SA 4.0',
        attribution: KAIKKI_ATTRIBUTION,
        file: path.basename(opts.input),
        sha256: await sha,
        lines: stats.lines,
      },
      buckets,
      shardFiles,
      counts: stats.counts,
      builtAt: opts.date,
    };
    fs.writeFileSync(path.join(dir, 'manifest.json'), fullManifestText(manifest), 'utf8');
    return { manifest, stats, dir };
  } finally {
    spill.close();
    fs.rmSync(spillDir, { recursive: true, force: true });
  }
}

/** The kaikki input for a language under data/dictionaries: the plain file when there is one, else the gzip. */
export function defaultInput(lang: string, root = 'data/dictionaries'): string | undefined {
  const name = KAIKKI_LANGUAGE_NAMES[lang];
  if (!name) return undefined;
  for (const ext of ['.jsonl', '.jsonl.gz']) {
    const f = path.join(root, `kaikki.org-dictionary-${name}${ext}`);
    if (fs.existsSync(f)) return f;
  }
  return undefined;
}

export function printReport(r: BuildFullResult, ms: number): void {
  const s = r.stats;
  const c = s.counts;
  const pct = (k: number) => (c.records ? `${((100 * k) / c.records).toFixed(1)}%` : '-');
  console.log(`dict:build-full - ${r.manifest.lang} (${FULL_SCHEMA}) source ${r.manifest.source.file}, version ${r.manifest.source.version}`);
  console.log(`  input lines:      ${s.lines} (+ ${s.blank} blank), malformed ${s.malformed}`);
  console.log(`  skipped:          ${FULL_SKIPS.map((k) => `${k} ${s.skipped[k]}`).join(', ')}`);
  console.log(`  records:          ${c.records} under ${s.keys} lemma keys`);
  console.log(`  with forms:       ${c.withForms} (${pct(c.withForms)}); etymology ${c.withEtymology} (${pct(c.withEtymology)}); ipa ${c.withIpa} (${pct(c.withIpa)}); audio ${c.withAudio} (${pct(c.withAudio)})`);
  console.log(`  shards written:   ${s.shards} of ${s.buckets} buckets, ${s.shardBytes} bytes total (avg ${s.shards ? Math.round(s.shardBytes / s.shards) : 0}), largest ${s.largestShardBytes} -> ${r.dir}`);
  console.log(`  attribution:      ${r.manifest.source.attribution}`);
  console.log(`  build time:       ${ms} ms; peak memory ${Math.round(process.resourceUsage().maxRSS / 1024)} MB`);
}

const USAGE = 'usage: npm run dict:build-full -- <lang> [--limit N] [--in <file>] [--out <dir>] [--date YYYY-MM-DD] [--last-modified YYYY-MM-DD] [--source-url <url>]';

async function main(): Promise<void> {
  const fail = (msg: string): never => { console.error(`${msg}\n${USAGE}`); process.exit(1); };
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const lang = args[0];
  if (!lang || lang.startsWith('--')) fail('a language code is required');
  if (!(LANGUAGES as readonly string[]).includes(lang)) fail(`unknown language "${lang}" (one of ${LANGUAGES.join(', ')})`);
  const opt: Record<string, string> = {};
  for (let i = 1; i < args.length; i += 2) {
    const k = args[i], v = args[i + 1];
    if (!k.startsWith('--') || v === undefined || v.startsWith('--')) fail(`bad argument: ${k}`);
    opt[k.slice(2)] = v;
  }
  for (const k of Object.keys(opt)) if (!['limit', 'in', 'out', 'date', 'last-modified', 'source-url'].includes(k)) fail(`unknown option --${k}`);
  const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const date = opt.date ?? new Date().toISOString().slice(0, 10);
  if (!isDate(date)) fail(`--date must be YYYY-MM-DD, got "${date}"`);
  if (opt['last-modified'] !== undefined && !isDate(opt['last-modified'])) fail(`--last-modified must be YYYY-MM-DD, got "${opt['last-modified']}"`);
  let limit: number | undefined;
  if (opt.limit !== undefined) { limit = Number(opt.limit); if (!Number.isInteger(limit) || limit < 1) fail('--limit must be a positive integer'); }
  const input = opt.in ?? defaultInput(lang);
  if (!input || !fs.existsSync(input)) return fail(`cannot find the kaikki input for ${lang} (pass --in <file>)`);
  const outDir = opt.out ?? (limit !== undefined ? fs.mkdtempSync(path.join(os.tmpdir(), 'go-dict-full-sample-')) : 'public/dict');
  if (limit !== undefined && !opt.out) console.log(`--limit without --out: writing to ${outDir}`);
  const t0 = Date.now();
  try {
    const r = await buildFullFile({ input, lang: lang as LanguageCode, outDir, date, ...(limit !== undefined ? { limit } : {}), source: { url: opt['source-url'], lastModified: opt['last-modified'] } });
    printReport(r, Date.now() - t0);
  } catch (e) {
    console.error(`dict:build-full failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

// Run as the CLI only when started by its npm script (or node on this file), never when a test or another script imports it.
if (process.env.npm_lifecycle_event === 'dict:build-full' || /^build-full\.[cm]?[jt]s$/.test(path.basename(process.argv[1] ?? ''))) void main();
