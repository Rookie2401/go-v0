import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DictionaryEntry, LanguageCode } from '../../src/core';
import { bucketOf } from '../../src/dict/format';
import {
  REVERSE_MAX_PER_HEAD, REVERSE_VERSION, createReverseBuilder, createReverseSource, extractGlossHeads, reverseScore, extractHeads, normalizeEnglish, parseReverseManifest,
  parseReverseShard, reverseKeys, reverseShardName, type ReverseManifest,
} from '../../src/dict/reverse';

describe('English head extraction', () => {
  it('splits on ; and , and drops a leading "to "', () => {
    expect(extractGlossHeads('to drink; to swallow')).toEqual(['drink', 'swallow']);
    expect(extractGlossHeads('to think, to believe, to reckon')).toEqual(['think', 'believe', 'reckon']);
  });
  it('drops bracketed notes, commas inside them never split', () => {
    expect(extractGlossHeads('(of a person) tall')).toEqual(['tall']);
    expect(extractGlossHeads('(of a person, usually) tall')).toEqual(['tall']);
    expect(extractGlossHeads('water (liquid)')).toEqual(['water']);
    expect(extractGlossHeads('rain [weather] {archaic}')).toEqual(['rain']);
    expect(extractGlossHeads('fire (nested (deeper) note)')).toEqual(['fire']);
    expect(extractGlossHeads('open (unclosed note, goes on')).toEqual(['open']);
  });
  it('skips stop-heads and heads that begin or end with a function word', () => {
    expect(extractGlossHeads('the Bible')).toEqual([]);
    expect(extractGlossHeads('a; the; of; one; that; which; used')).toEqual([]);
    expect(extractGlossHeads('lack of')).toEqual([]);
    expect(extractGlossHeads('plural of casa')).toEqual([]);
    expect(extractGlossHeads('feminine singular of bueno')).toEqual([]);
  });
  it('keeps heads of one to three words made of letters, apostrophes, hyphens', () => {
    expect(extractGlossHeads("Mother-in-law; one's own; ice cream; a long phrase of four")).toEqual(['mother-in-law', "one's own", 'ice cream']);
    expect(extractGlossHeads('house 2; x-ray; 3d printer')).toEqual(['x-ray']);
    expect(extractGlossHeads('well, indeed!')).toEqual(['well', 'indeed']);
    expect(extractGlossHeads('  Ice   Cream  .')).toEqual(['ice cream']);
  });
  it('drops a placeholder object: "to believe something" is "believe"', () => {
    expect(extractGlossHeads('to believe something (to consider true)')).toEqual(['believe']);
    expect(extractGlossHeads('to hit someone; to love oneself')).toEqual(['hit', 'love']);
    expect(extractGlossHeads('something')).toEqual(['something']);
  });
  it('uses only the first three glosses and no repeats', () => {
    expect(extractHeads(['water', 'to water; water', 'rain', 'fourth', 'fifth'])).toEqual(['water', 'rain']);
  });
  it('normalizes like the lookup', () => {
    expect(normalizeEnglish('  To   Drink ')).toBe('to drink');
    expect(normalizeEnglish('Don’t')).toBe("don't");
    expect(reverseKeys('To Believe')).toEqual(['to believe', 'believe']);
    expect(reverseKeys('waters')).toEqual(['waters', 'water']);
    expect(reverseKeys('to waters')).toEqual(['to waters', 'waters', 'to water', 'water']);
    expect(reverseKeys('grass')).toEqual(['grass']);
    expect(reverseKeys('   ')).toEqual([]);
  });
});

const entry = (form: string, glosses: string[], pos?: DictionaryEntry['pos'], extra: Partial<DictionaryEntry> = {}): DictionaryEntry =>
  ({ form, lang: 'es', glosses, ...(pos ? { pos } : {}), ...extra });

describe('reverse builder', () => {
  it('lists lemmas per head, most frequent first, deduped and capped', () => {
    const b = createReverseBuilder();
    b.add(entry('rareza', ['water']), null);
    b.add(entry('agua', ['water', 'body of water'], 'NOUN'), 172);
    b.add(entry('agua', ['water'], 'NOUN'), 172); // the same (lemma, pos) again: once
    b.add(entry('regar', ['to water', 'to irrigate'], 'VERB'), 2623);
    for (let i = 0; i < 40; i++) b.add(entry(`w${String(i).padStart(2, '0')}`, ['crowd']), 1000 + i);
    const { shards, heads } = b.finish(16);
    expect(heads).toBe(4); // water, body of water, irrigate, crowd
    const all: Record<string, unknown[]> = Object.assign({}, ...shards.values());
    expect(all.water).toEqual([['agua', 'NOUN', 172, 0, 0], ['regar', 'VERB', 2623, 0, 0], ['rareza', null, null, 0, 0]]);
    expect(all.crowd).toHaveLength(REVERSE_MAX_PER_HEAD);
    expect(all.crowd[0]).toEqual(['w00', null, 1000, 0, 0]);
    expect(all.crowd[REVERSE_MAX_PER_HEAD - 1]).toEqual(['w11', null, 1011, 0, 0]);
    for (const [bucket, shard] of shards) for (const head of Object.keys(shard)) expect(bucketOf(head, 16)).toBe(bucket);
  });
  it('uses the written headword (German nouns keep their capital) and ignores glosses after the third', () => {
    const b = createReverseBuilder();
    b.add({ form: 'wasser', written: 'Wasser', lang: 'de', glosses: ['water', 'x1', 'x2', 'late'] }, 175);
    const all: Record<string, unknown[]> = Object.assign({}, ...b.finish(4).shards.values());
    expect(all.water).toEqual([['Wasser', null, 175, 0, 0]]);
    expect(all.late).toBeUndefined();
  });
  it('records the gloss and head position, and ranks the main sense above a buried frequent one', () => {
    const b = createReverseBuilder();
    b.add(entry('ese', ['that', 'x', 'hello']), 61); // "hello" buried in the third gloss of a very frequent word
    b.add(entry('hola', ['hello, hi, hey']), 1728); // first head of the first gloss
    b.add(entry('buenas', ['hi, hello']), null); // a later head of the first gloss, no rank
    b.add(entry('salve', ['hail', 'hello']), 8290);
    const all: Record<string, unknown[][]> = Object.assign({}, ...b.finish(4).shards.values());
    expect(all.hello.map((r) => r[0])).toEqual(['hola', 'ese', 'buenas', 'salve']); // 6, then a tie at 2 broken by rank, then 1
    expect(all.hello.find((r) => r[0] === 'ese')!.slice(3)).toEqual([2, 0]);
    expect(all.hello.find((r) => r[0] === 'buenas')!.slice(3)).toEqual([0, 1]);
  });
  it('scores primary*2 + tier', () => {
    expect(reverseScore(172, 0, 0)).toBe(6);
    expect(reverseScore(5000, 0, 0)).toBe(5);
    expect(reverseScore(null, 0, 0)).toBe(4);
    expect(reverseScore(172, 0, 1)).toBe(4);
    expect(reverseScore(null, 0, 1)).toBe(2);
    expect(reverseScore(172, 2, 0)).toBe(2);
    expect(reverseScore(20000, 1, 0)).toBe(0);
  });
  it('is independent of the order entries arrive in', () => {
    const rows: Array<[string, number | null]> = [['a', 5], ['b', 3], ['c', 3], ['d', null], ['e', 9]];
    const build = (list: Array<[string, number | null]>) => {
      const b = createReverseBuilder();
      for (const [f, r] of list) b.add(entry(f, ['thing']), r);
      return JSON.stringify([...b.finish(4).shards]);
    };
    expect(build(rows)).toBe(build([...rows].reverse()));
  });
});

describe('reverse source over a fixture directory', () => {
  let dir = '';
  let requests: string[] = [];
  const BUCKETS = 16;
  // a fetch that serves <dir>/<lang>/reverse/..., the way the app's static host does
  const serve = (root: string, failFirst = new Set<string>()): typeof fetch => (async (url: string | URL | Request) => {
    const u = String(url);
    requests.push(u);
    if (failFirst.delete(u)) return new Response('busy', { status: 503 });
    const file = path.join(root, u.replace(/^\/dict\//, ''));
    return fs.existsSync(file) ? new Response(fs.readFileSync(file, 'utf8')) : new Response('not found', { status: 404 });
  }) as typeof fetch;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reverse-fixture-'));
    const b = createReverseBuilder();
    b.add(entry('agua', ['water', 'body of water'], 'NOUN'), 172);
    b.add(entry('regar', ['to water', 'to irrigate'], 'VERB'), 2623);
    b.add(entry('creer', ['to believe', 'to think'], 'VERB'), 109);
    b.add(entry('bebida', ['drink', 'beverage'], 'NOUN'), 3654);
    b.add(entry('beber', ['to drink'], 'VERB'), 341);
    b.add(entry('hierba', ['grass']), 5000);
    for (let i = 0; i < 40; i++) b.add(entry(`filler${i}`, [`zz${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`]), null); // enough heads to fill every bucket
    const { shards, heads } = b.finish(BUCKETS);
    const out = path.join(dir, 'es', 'reverse');
    fs.mkdirSync(out, { recursive: true });
    const shardFiles: string[] = [];
    for (const [bucket, shard] of [...shards].sort((x, y) => x[0] - y[0])) {
      const name = reverseShardName(bucket, BUCKETS);
      fs.writeFileSync(path.join(out, name), JSON.stringify(shard));
      shardFiles.push(name);
    }
    const manifest: ReverseManifest = { version: REVERSE_VERSION, lang: 'es', buckets: BUCKETS, heads, shardFiles, builtFrom: 'fixture' };
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest));
  });
  afterAll(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

  it('round trips: the manifest parses and every head is found in its bucket', async () => {
    const m = parseReverseManifest(JSON.parse(fs.readFileSync(path.join(dir, 'es', 'reverse', 'manifest.json'), 'utf8')), 'es')!;
    expect(m.buckets).toBe(BUCKETS);
    expect(m.heads).toBe(48);
    const src = createReverseSource('es', { fetch: serve(dir) });
    expect(await src.lookupEnglish('water')).toEqual([{ lemma: 'agua', pos: 'NOUN', frequencyRank: 172 }, { lemma: 'regar', pos: 'VERB', frequencyRank: 2623 }]);
    expect(await src.lookupEnglish('irrigate')).toEqual([{ lemma: 'regar', pos: 'VERB', frequencyRank: 2623 }]);
    expect(await src.lookupEnglish('grass')).toEqual([{ lemma: 'hierba', frequencyRank: 5000 }]); // no pos: the key is left out
  });
  it('normalizes the query and also tries without "to " and without a trailing s', async () => {
    const src = createReverseSource('es', { fetch: serve(dir) });
    expect((await src.lookupEnglish('  To   BELIEVE ')).map((e) => e.lemma)).toEqual(['creer']);
    expect((await src.lookupEnglish('to drink')).map((e) => e.lemma)).toEqual(['beber', 'bebida']); // by rank
    expect((await src.lookupEnglish('beverages')).map((e) => e.lemma)).toEqual(['bebida']);
    expect((await src.lookupEnglish('to beverages')).map((e) => e.lemma)).toEqual(['bebida']);
    expect(await src.lookupEnglish('zzyzx')).toEqual([]);
    expect(await src.lookupEnglish('')).toEqual([]);
  });
  it('reads the manifest once and a shard once while it is cached; skips buckets the manifest says are empty', async () => {
    requests = [];
    const src = createReverseSource('es', { fetch: serve(dir), base: '/dict/' });
    await src.lookupEnglish('water');
    await src.lookupEnglish('water');
    await src.lookupEnglish('to irrigate');
    expect(requests.filter((u) => u.endsWith('manifest.json'))).toHaveLength(1);
    expect(requests[0]).toBe('/dict/es/reverse/manifest.json');
    const shardReads = requests.filter((u) => /r-[0-9a-f]+\.json$/.test(u));
    expect(new Set(shardReads).size).toBe(shardReads.length);
    // a manifest that leaves out the shard of "water": the lookup answers [] without asking for it
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'es', 'reverse', 'manifest.json'), 'utf8')) as ReverseManifest;
    const skipped = reverseShardName(bucketOf('water', BUCKETS), BUCKETS);
    const trimmed = JSON.stringify({ ...m, shardFiles: m.shardFiles.filter((n) => n !== skipped) });
    requests = [];
    const none = createReverseSource('es', { fetch: (async (u: string) => { requests.push(u); return new Response(trimmed); }) as typeof fetch, base: '/dict' });
    expect(await none.lookupEnglish('water')).toEqual([]);
    expect(requests).toEqual(['/dict/es/reverse/manifest.json']);
  });
  it('keeps at most 8 shards: an evicted shard is read again', async () => {
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'es', 'reverse', 'manifest.json'), 'utf8')) as ReverseManifest;
    // one head per shard file, found by reading the shards
    const heads = m.shardFiles.map((f) => Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'es', 'reverse', f), 'utf8')) as object)[0]);
    expect(heads.length).toBeGreaterThan(8);
    requests = [];
    const src = createReverseSource('es', { fetch: serve(dir) });
    for (const h of heads) await src.lookupEnglish(h);
    await src.lookupEnglish(heads[0]); // evicted by now
    expect(requests.filter((u) => u.endsWith(m.shardFiles[bucketIndex(m, heads[0])]))).toHaveLength(2);
    requests = [];
    await src.lookupEnglish(heads[heads.length - 1]); // the most recent one is still held
    expect(requests).toEqual([]);
  });
  it('answers [] when there is no manifest (nb has none), and never throws', async () => {
    requests = [];
    const src = createReverseSource('nb', { fetch: serve(dir) });
    expect(await src.lookupEnglish('water')).toEqual([]);
    expect(await src.lookupEnglish('house')).toEqual([]);
    expect(requests).toEqual(['/dict/nb/reverse/manifest.json']); // a missing manifest is remembered
    const broken = createReverseSource('es', { fetch: (async () => { throw new Error('offline'); }) as typeof fetch });
    expect(await broken.lookupEnglish('water')).toEqual([]);
    const garbage = createReverseSource('es', { fetch: (async () => new Response('{not json')) as typeof fetch });
    expect(await garbage.lookupEnglish('water')).toEqual([]);
    const wrongLang = createReverseSource('de', { fetch: (async () => new Response(fs.readFileSync(path.join(dir, 'es', 'reverse', 'manifest.json'), 'utf8'))) as typeof fetch });
    expect(await wrongLang.lookupEnglish('water')).toEqual([]);
  });
  it('retries after a transient failure', async () => {
    const first = '/dict/es/reverse/manifest.json';
    const src = createReverseSource('es', { fetch: serve(dir, new Set([first])) });
    expect(await src.lookupEnglish('water')).toEqual([]); // the manifest request failed: nothing, not an error
    expect((await src.lookupEnglish('water')).map((e) => e.lemma)).toEqual(['agua', 'regar']);
  });
  it('drops rows of the wrong shape', () => {
    const shard = parseReverseShard({ water: [['agua', 'NOUN', 1], ['', null, 2], 'x', ['regar', 7, 'n']], junk: 'x', empty: [] });
    expect(shard.get('water')).toEqual([['agua', 'NOUN', 1, 0, 0], ['regar', null, null, 0, 0]]);
    expect(shard.has('junk') || shard.has('empty')).toBe(false);
    expect(parseReverseManifest({ version: 1, lang: 'es', buckets: 4, heads: 1, shardFiles: [] }, 'es')).toBeUndefined();
    expect(parseReverseManifest({ version: 2, lang: 'es', buckets: 4, heads: 1, shardFiles: ['../x.json'] }, 'es')).toBeUndefined();
  });
});

function bucketIndex(m: ReverseManifest, head: string): number {
  return m.shardFiles.indexOf(reverseShardName(bucketOf(head, m.buckets), m.buckets));
}

// The real built indexes (npm run dict:build-reverse): present on a machine that has built them, absent on a clean checkout.
const REAL = path.resolve(__dirname, '../../public/dict');
const built = (lang: string) => fs.existsSync(path.join(REAL, lang, 'reverse', 'manifest.json'));
const real = (): typeof fetch => (async (url: string | URL | Request) => {
  const file = path.join(REAL, String(url).replace(/^\/dict\//, ''));
  return fs.existsSync(file) ? new Response(fs.readFileSync(file, 'utf8')) : new Response('', { status: 404 });
}) as typeof fetch;
const notBuilt = (lang: string) => `the ${lang} reverse index is not built (public/dict/${lang}/reverse/manifest.json is absent): run npm run dict:build-reverse -- --langs ${lang}`;

// [language, English, the lemma that must come first]
const FIRST: Array<[LanguageCode, string, string]> = [
  ['es', 'hello', 'hola'], ['es', 'water', 'agua'], ['es', 'to believe', 'creer'], ['de', 'to believe', 'glauben'], ['de', 'bread', 'Brot'],
  ['th', 'water', 'น้ำ'], ['hi', 'water', 'पानी'],
];
describe('the built reverse indexes put the everyday word first', () => {
  for (const [lang, english, lemma] of FIRST) {
    it.skipIf(!built(lang))(`${lang} "${english}" -> ${lemma} (${built(lang) ? 'built' : notBuilt(lang)})`, async () => {
      const hits = await createReverseSource(lang, { fetch: real() }).lookupEnglish(english);
      expect(hits[0]?.lemma).toBe(lemma);
    });
  }
  it.skipIf(!built('es'))(`es "to believe": creer among the top 3 (${built('es') ? 'built' : notBuilt('es')})`, async () => {
    const hits = await createReverseSource('es', { fetch: real() }).lookupEnglish('to believe');
    expect(hits.slice(0, 3).map((h) => h.lemma)).toContain('creer');
  });
});
