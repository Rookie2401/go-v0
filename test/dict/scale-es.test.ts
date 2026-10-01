/**
 * The dictionary at Spanish scale: a synthetic 300,000-line file shaped like the real one (84 % inflected forms, the
 * rest headwords with senses and pronunciations) is built by the real CLI, then 20,000 forms spread over every bucket
 * are looked up through the bounded runtime. Checks: bounded memory, exact answers, a bounded number of parsed shards,
 * and a shard size at least 40 % under what the schema-2 writer made of the same lines.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { afterAll, describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import type { DictionaryEntry, DictionaryPronunciation, DictionarySense } from '../../src/core';
import { MAX_BUCKETS, bucketOf, entryFromKaikki, newShardCacheProbe, parseManifest, type CompactEntry } from '../../src/dict';
import { createFileLexiconSource } from '../../src/dict/file';
import { runNode } from '../helpers/cli';
import { DATE, tmpDir } from './helpers';

const LINES = 300_000;
const FORMS = 20_000;
const esNormalize = (s: string) => createAdapterRegistry().get('es').normalize(s);

/** A deterministic, unique word for index i: syllables from a fixed table. */
const SYL = (() => { const out: string[] = []; for (const c of 'bcdfglmnprstv') for (const v of 'aeiou') out.push(c + v); return out; })();
const wordOf = (i: number): string => {
  let n = i;
  let w = '';
  do { w += SYL[n % SYL.length]; n = Math.floor(n / SYL.length); } while (n > 0);
  return w + 'r';
};

/** Line i of the synthetic file: every sixth is a headword (24 listed forms, two sounds, two senses), the rest an inflected form of it. */
function lineOf(i: number): Record<string, unknown> {
  const lemma = wordOf(Math.floor(i / 6));
  if (i % 6 === 0) {
    const forms = Array.from({ length: 24 }, (_, k) => ({ form: `${lemma}${k}`, tags: ['indicative', 'present', k % 2 ? 'plural' : 'singular', `person-${k % 3}`] }));
    return {
      word: lemma, pos: 'verb', lang_code: 'es', lang: 'Spanish', forms,
      sounds: [{ ipa: `/ˈ${lemma}/` }, { ipa: `/ˈ${lemma}s/`, tags: ['Latin-America'] }, { rhymes: '-aɾ' }],
      senses: [{ glosses: [`to ${lemma}`, 'a narrower gloss'], tags: i % 12 === 0 ? ['Spain'] : ['Latin-America', 'Mexico'], examples: [{ text: 'x' }] }, { glosses: [`to ${lemma} again`] }],
      etymology_text: 'synthetic line for the size test '.repeat(8),
    };
  }
  return {
    word: `${lemma}${(i % 6) - 1}`, pos: 'verb', lang_code: 'es', lang: 'Spanish', sounds: [{ ipa: `/ˈ${lemma}${i % 6}/` }],
    senses: [{ glosses: [`first-person singular present indicative of ${lemma}`], tags: ['first-person', 'form-of', 'indicative', 'present', 'singular'], form_of: [{ word: lemma }], links: [[lemma, lemma]] }],
    etymology_text: 'synthetic line for the size test '.repeat(6),
  };
}

function writeSynthetic(file: string): void {
  const fd = fs.openSync(file, 'w');
  let buf = '';
  for (let i = 0; i < LINES; i++) {
    buf += JSON.stringify(lineOf(i)) + '\n';
    if (buf.length > 1 << 20) { fs.writeSync(fd, buf); buf = ''; }
  }
  fs.writeSync(fd, buf);
  fs.closeSync(fd);
}

// ---- A kept copy of the schema-2 compaction (what the writer did before schema 3), to measure against. Not used by src. ----
interface OldCompactEntry extends Omit<CompactEntry, 'g' | 'm'> { g: string[]; m?: Array<{ l: string; t?: string[] }> }
const oldSense = (s: DictionarySense) => ({ g: s.gloss, ...(s.tags?.length ? { t: s.tags } : {}), ...(s.topics?.length ? { o: s.topics } : {}), ...(s.examples ? { x: s.examples } : {}) });
const oldPronunciation = (p: DictionaryPronunciation) => ({
  ...(p.respelling ? { r: p.respelling } : {}), ...(p.ipa ? { i: p.ipa } : {}), ...(p.romanization ? { t: p.romanization } : {}),
  ...(p.tags?.length ? { g: p.tags } : {}), ...(p.asWritten ? { w: true as const } : {}),
});
function oldCompactEntry(e: DictionaryEntry): OldCompactEntry {
  return {
    ...(e.pos ? { p: e.pos } : {}), g: e.glosses, ...(e.respelling ? { r: e.respelling } : {}), ...(e.ipa ? { i: e.ipa } : {}),
    ...(e.romanization ? { t: e.romanization } : {}), ...(e.register?.length ? { c: e.register } : {}),
    ...(e.classifiers?.length ? { l: e.classifiers } : {}), ...(e.role ? { o: e.role } : {}), ...(e.definition ? { d: e.definition } : {}),
    ...(e.frequencyRank !== undefined ? { f: e.frequencyRank } : {}),
    ...(e.senses?.length ? { s: e.senses.map(oldSense) } : {}),
    ...(e.pronunciations?.length ? { n: e.pronunciations.map(oldPronunciation) } : {}),
    ...(e.etymology !== undefined ? { y: e.etymology } : {}), ...(e.altOf?.length ? { a: e.altOf } : {}),
    ...(e.formOf?.length ? { m: e.formOf.map((f) => ({ l: f.lemma, ...(f.tags.length ? { t: f.tags } : {}) })) } : {}),
  };
}
const OLD_TARGET_SHARD_BYTES = 120_000;
const bytes = (s: string) => Buffer.byteLength(s, 'utf8');

/** The bytes the schema-2 writer would have put in shard files for the synthetic file (every form there has one entry, nothing merges). */
async function schema2ShardBytes(file: string): Promise<{ total: number; buckets: number }> {
  let estimate = 0;
  let forms = 0;
  let body = 0;
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    const e = entryFromKaikki(JSON.parse(line) as unknown, esNormalize, 'es')[0];
    if (!e) continue;
    const json = JSON.stringify(oldCompactEntry(e));
    estimate += bytes(json) + bytes(e.form) + 6;
    body += bytes(JSON.stringify(e.form)) + 1 + 1 + bytes(json) + 1 + 1; // "form":[entry],
    forms++;
  }
  let buckets = 256;
  while (buckets < MAX_BUCKETS && estimate / buckets > OLD_TARGET_SHARD_BYTES) buckets *= 2;
  expect(forms).toBe(LINES);
  return { total: body - Math.min(buckets, forms) /* the last comma of each shard */ + Math.min(buckets, forms) * 3 /* { } newline */, buckets };
}

const root = tmpDir('go-dict-scale-');
afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('Spanish scale: 300,000 synthetic lines', () => {
  it('builds with bounded memory, is at least 40 % smaller than schema 2, and answers 20,000 forms exactly through a bounded cache', async () => {
    const input = path.join(root, 'synthetic-es.jsonl');
    writeSynthetic(input);
    const outDir = path.join(root, 'out');
    const cli = path.resolve('node_modules/vite-node/dist/cli.mjs');
    const t0 = Date.now();
    const r = await runNode([cli, 'scripts/dict-build.mts', '--in', input, '--lang', 'es', '--out', outDir, '--date', DATE], { cwd: path.resolve('.'), timeout: 540_000 });
    const buildMs = Date.now() - t0;
    expect(r.status, r.out).toBe(0);

    // --- the build: bounded memory, the numbers it prints
    const peakMb = Number(/peak memory:\s+(\d+) MB/.exec(r.out)?.[1]);
    const largest = Number(/largest (\d+)\)/.exec(r.out)?.[1]);
    const total = Number(/\((\d+) bytes total/.exec(r.out)?.[1]);
    const labelSets = Number(/label sets:\s+(\d+) distinct/.exec(r.out)?.[1]);
    const dropped = Number(/pronunciations dropped: (\d+) \(off (\d+) inflected-form lines/.exec(r.out)?.[1]);
    const droppedLines = Number(/pronunciations dropped: \d+ \(off (\d+) inflected-form lines/.exec(r.out)?.[1]);
    expect(peakMb).toBeGreaterThan(0);
    expect(peakMb).toBeLessThan(700); // vite-node itself is ~250 MB; the data is not held in memory
    expect(r.out).toMatch(/\(schema 3\)/);
    expect(labelSets).toBe(1); // every inflected line says the same thing
    expect(droppedLines).toBe(250_000);
    expect(dropped).toBe(250_000);
    const manifest = parseManifest(JSON.parse(fs.readFileSync(path.join(outDir, 'es', 'manifest.json'), 'utf8')), 'es')!;
    expect(manifest.schema).toBe(3);
    expect(manifest.entries).toBe(LINES);
    expect(manifest.labelSets).toEqual([['first-person', 'form-of', 'indicative', 'present', 'singular']]);
    expect(largest).toBeLessThan(250_000);
    const files = fs.readdirSync(path.join(outDir, 'es')).filter((n) => n !== 'manifest.json');
    const shardTotal = files.reduce((n, f) => n + fs.statSync(path.join(outDir, 'es', f)).size, 0);
    expect(shardTotal).toBe(total);
    expect(manifest.shards).toBe(files.length);

    // --- size against the schema-2 writer
    const old = await schema2ShardBytes(input);
    const saving = 1 - shardTotal / old.total;
    console.log(`scale-es: build ${buildMs} ms, peak ${peakMb} MB, ${manifest.buckets} buckets (schema 2 would use ${old.buckets}), largest shard ${largest}; shard bytes ${shardTotal} vs schema 2 ${old.total} (${(saving * 100).toFixed(1)} % smaller)`);
    expect(saving).toBeGreaterThanOrEqual(0.4);

    // --- 20,000 forms spread over every bucket: half headwords, half inflected forms, plus absent ones
    const lineOfForm = new Map<string, number>(); // form -> index of its line
    for (let k = 0; k < FORMS; k++) {
      const j = (k * 7919) % (LINES / 6); // 7919 is prime and does not divide 50,000: distinct headwords
      if (k % 2 === 0) lineOfForm.set(wordOf(j), 6 * j);
      else lineOfForm.set(`${wordOf(j)}${k % 5}`, 6 * j + (k % 5) + 1);
    }
    expect(lineOfForm.size).toBe(FORMS);
    const wanted = [...lineOfForm.keys()];
    expect(new Set(wanted.map((f) => bucketOf(f, manifest.buckets))).size).toBe(manifest.buckets); // every bucket is touched
    const absent = Array.from({ length: 500 }, (_, k) => `inexistente${k}`);
    const ask = [...wanted.slice(0, 10_000), ...absent, ...wanted.slice(10_000), ...wanted.slice(0, 100)]; // order mixed, some repeated

    const expectedFor = (form: string): DictionaryEntry[] => {
      const e = entryFromKaikki(lineOf(lineOfForm.get(form)!), esNormalize, 'es')[0];
      if (e.glosses.length || !e.formOf?.length) return [e];
      const { pronunciations: _p, respelling: _r, ipa: _i, romanization: _t, ...rest } = e; // an inflected form carries no pronunciation
      return [rest];
    };
    const check = async (cache: { maxParsedShards?: number; concurrency?: number }, label: string) => {
      const probe = newShardCacheProbe();
      const src = createFileLexiconSource(outDir, 'es', { ...cache, probe });
      const t1 = Date.now();
      const got = await src.lookup(ask);
      const ms = Date.now() - t1;
      expect(got.size, label).toBe(FORMS);
      const wrong: string[] = [];
      for (const f of wanted) { try { expect(got.get(f)).toEqual(expectedFor(f)); } catch { wrong.push(f); if (wrong.length > 5) break; } }
      expect(wrong, label).toEqual([]);
      expect([...got.keys()]).toEqual([...new Set(ask)].filter((f) => lineOfForm.has(f))); // the caller's order, absent forms absent
      console.log(`scale-es ${label}: ${ms} ms, loads ${probe.loads}, evictions ${probe.evictions}, parsed shards held at most ${probe.highWater}, read at once at most ${probe.maxActive}`);
      return probe;
    };

    const dflt = await check({}, 'default bound (24 shards, 4 at a time)');
    expect(dflt.highWater).toBeLessThanOrEqual(24);
    expect(dflt.highWater).toBe(24); // all of them were needed, so the cache filled up to the bound and no further
    expect(dflt.maxActive).toBeLessThanOrEqual(4);
    expect(dflt.loads).toBe(manifest.buckets);
    expect(dflt.evictions).toBe(manifest.buckets - 24);
    expect(dflt.held).toBe(24);

    const small = await check({ maxParsedShards: 5, concurrency: 2 }, 'bound 5, 2 at a time');
    expect(small.highWater).toBeLessThanOrEqual(5);
    expect(small.maxActive).toBeLessThanOrEqual(2);

    // concurrent lookups share the one bound
    const probe = newShardCacheProbe();
    const src = createFileLexiconSource(outDir, 'es', { maxParsedShards: 8, probe });
    const parts = Array.from({ length: 8 }, (_, k) => wanted.filter((_, i) => i % 8 === k));
    const results = await Promise.all(parts.map((p) => src.lookup(p)));
    expect(results.map((m) => m.size)).toEqual(parts.map((p) => p.length));
    expect(probe.highWater).toBeLessThanOrEqual(8);
    expect(probe.maxActive).toBeLessThanOrEqual(4);
  }, 600_000);
});
