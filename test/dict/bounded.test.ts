import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_PARSED_SHARDS, DEFAULT_SHARD_CONCURRENCY, bucketOf, createFetchLexiconSource, newShardCacheProbe, shardName,
} from '../../src/dict';
import { buildFixture, fakeFetch, filesAt } from './helpers';

const out = buildFixture(); // 44 shard files
const allForms = (): string[] => {
  const forms: string[] = [];
  for (const f of out.manifest.shardFiles) forms.push(...Object.keys(JSON.parse(out.files.get(f)!) as object));
  return forms;
};
/** One form from each of the first `n` shards, so that a lookup of them touches n different shards. */
const formsFromShards = (n: number): string[] => out.manifest.shardFiles.slice(0, n).map((f) => Object.keys(JSON.parse(out.files.get(f)!) as object)[0]);
const shardUrl = (form: string) => `/dict/th/${shardName(bucketOf(form))}`;

describe('bounded runtime: the parsed-shard cache', () => {
  it('defaults: 24 parsed shards, 4 read at a time', async () => {
    expect(DEFAULT_MAX_PARSED_SHARDS).toBe(24);
    expect(DEFAULT_SHARD_CONCURRENCY).toBe(4);
    const probe = newShardCacheProbe();
    const f = fakeFetch(filesAt('/dict', out));
    const src = createFetchLexiconSource('th', { fetch: f.fetch, cache: { probe } });
    const forms = allForms();
    const got = await src.lookup(forms);
    expect(got.size).toBe(forms.length); // every form of all 44 shards answered
    expect(probe.loads).toBe(out.manifest.shardFiles.length);
    expect(probe.highWater).toBe(24);
    expect(probe.held).toBe(24);
    expect(probe.evictions).toBe(out.manifest.shardFiles.length - 24);
    expect(probe.maxActive).toBeLessThanOrEqual(4);
    expect(probe.active).toBe(0);
  });

  it('never holds more than the bound however many forms are asked for, and gives the same answers as an unbounded source', async () => {
    const reference = await createFetchLexiconSource('th', { fetch: fakeFetch(filesAt('/dict', out)).fetch, cache: { maxParsedShards: 1000 } }).lookup(allForms());
    for (const [max, concurrency] of [[1, 1], [2, 5], [3, 2], [7, 4]] as const) {
      const probe = newShardCacheProbe();
      const src = createFetchLexiconSource('th', { fetch: fakeFetch(filesAt('/dict', out)).fetch, cache: { maxParsedShards: max, concurrency, probe } });
      const forms = [...allForms(), ...allForms()]; // repeated forms are one answer
      const got = await src.lookup(forms);
      expect(got, `max ${max}`).toEqual(reference);
      expect([...got.keys()]).toEqual([...new Set(forms)].filter((f) => reference.has(f)));
      expect(probe.highWater, `max ${max}`).toBeLessThanOrEqual(max);
      expect(probe.maxActive, `max ${max}`).toBeLessThanOrEqual(Math.min(concurrency, max));
    }
  });

  it('holds the bound across concurrent lookups too (the limit is on the source, not on each lookup)', async () => {
    const probe = newShardCacheProbe();
    const src = createFetchLexiconSource('th', { fetch: fakeFetch(filesAt('/dict', out)).fetch, cache: { maxParsedShards: 5, concurrency: 3, probe } });
    const forms = allForms();
    const parts = [0, 1, 2, 3, 4, 5].map((k) => forms.filter((_, i) => i % 6 === k));
    const results = await Promise.all(parts.map((p) => src.lookup(p)));
    expect(results.map((r) => r.size)).toEqual(parts.map((p) => p.length));
    expect(probe.highWater).toBeLessThanOrEqual(5);
    expect(probe.maxActive).toBeLessThanOrEqual(3);
  });

  it('an evicted shard is simply read again; the least recently used one goes first', async () => {
    const [a, b, c] = formsFromShards(3);
    const f = fakeFetch(filesAt('/dict', out));
    const probe = newShardCacheProbe();
    const src = createFetchLexiconSource('th', { fetch: f.fetch, cache: { maxParsedShards: 2, probe } });
    const reads = (form: string) => f.log.filter((u) => u === shardUrl(form)).length;
    await src.lookup([a]); await src.lookup([b]);
    await src.lookup([a]); // a is now more recent than b
    expect([reads(a), reads(b)]).toEqual([1, 1]);
    await src.lookup([c]); // makes room by dropping b, not a
    expect(probe.evictions).toBe(1);
    await src.lookup([a]);
    expect(reads(a)).toBe(1); // still there
    expect((await src.lookup([b])).has(b)).toBe(true); // gone, read again, answered
    expect(reads(b)).toBe(2);
  });

  it('concurrent lookups of the same shard still make one request, and a corrupt shard is still remembered', async () => {
    const [a, b] = formsFromShards(2);
    const files = filesAt('/dict', out);
    files.set(shardUrl(b), '{"x":[{"g":');
    const f = fakeFetch(files);
    const src = createFetchLexiconSource('th', { fetch: f.fetch, cache: { maxParsedShards: 4 } });
    const got = await Promise.all([src.lookup([a]), src.lookup([a]), src.lookup([a, b]), src.lookup([b])]);
    expect(got.map((g) => g.has(a))).toEqual([true, true, true, false]);
    expect(f.log.filter((u) => u === shardUrl(a))).toHaveLength(1);
    expect(f.log.filter((u) => u === shardUrl(b))).toHaveLength(1);
    await src.lookup([b]);
    expect(f.log.filter((u) => u === shardUrl(b))).toHaveLength(1);
  });

  it('a failed read is not cached, frees its place and its slot, and the others still answer', async () => {
    const [a, b, c] = formsFromShards(3);
    const files = filesAt('/dict', out);
    let down = true;
    const f = fakeFetch(files, { [shardUrl(a)]: () => { if (down) throw new TypeError('network down'); return new Response(files.get(shardUrl(a))!); } });
    const probe = newShardCacheProbe();
    const src = createFetchLexiconSource('th', { fetch: f.fetch, cache: { maxParsedShards: 2, concurrency: 1, probe } });
    const got = await src.lookup([a, b, c]); // a fails first: with one slot, the others must still get theirs
    expect([...got.keys()]).toEqual([b, c]);
    expect(probe.active).toBe(0);
    expect(probe.held).toBeLessThanOrEqual(2);
    down = false;
    expect((await src.lookup([a])).has(a)).toBe(true); // read again, not remembered as failed
    expect(f.log.filter((u) => u === shardUrl(a))).toHaveLength(2);
  });

  it('nonsense options are clamped, not honoured', async () => {
    const probe = newShardCacheProbe();
    const src = createFetchLexiconSource('th', { fetch: fakeFetch(filesAt('/dict', out)).fetch, cache: { maxParsedShards: 0, concurrency: -3, probe } });
    const got = await src.lookup(formsFromShards(6));
    expect(got.size).toBe(6);
    expect(probe.highWater).toBe(1);
    expect(probe.maxActive).toBe(1);
  });

  it('asks for nothing and answers nothing when the forms are not in the dictionary or not strings', async () => {
    const f = fakeFetch(filesAt('/dict', out));
    const src = createFetchLexiconSource('th', { fetch: f.fetch });
    expect((await src.lookup(['', 'ไม่มีคำนี้', 5 as unknown as string])).size).toBe(0);
  });
});
