import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { bucketOf, createFetchLexiconSource, createMemoryLexiconSource, shardName } from '../../src/dict';
import { createFileLexiconSource } from '../../src/dict/file';
import { buildDictionaryFile } from '../../src/dict/build-node';
import { DATE, FIXTURE, buildFixture, byPos, fakeFetch, filesAt, thNormalize, tmpDir, writeBuild } from './helpers';

const out = buildFixture();
const root = tmpDir();
afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

/** A form that is not in the dictionary and whose bucket has no shard file. */
function formInEmptyBucket(): string {
  const used = new Set(out.manifest.shardFiles);
  for (let i = 0; i < 5000; i++) if (!used.has(shardName(bucketOf(`ไม่มี${i}`)))) return `ไม่มี${i}`;
  throw new Error('no empty bucket found');
}

describe('memory source', () => {
  it('returns only forms that have entries and reports info', async () => {
    const src = createMemoryLexiconSource('th', [{ form: 'ก', lang: 'th', glosses: ['x'] }], { id: 'mem' });
    expect((await src.info())?.id).toBe('mem');
    const m = await src.lookup(['ก', 'ข']);
    expect([...m.keys()]).toEqual(['ก']);
  });
});

describe('file source (shards written by the real writer)', () => {
  it('builds to disk and reads back through info() and lookup()', async () => {
    const outDir = path.join(root, 'file-src');
    const r = await buildDictionaryFile({
      input: FIXTURE, lang: 'th', outDir, date: DATE,
      source: { url: 'https://example.test/fixture.jsonl', lastModified: '2026-09-28', retrievedAt: '2026-09-30' },
    });
    expect(r.stats.entries).toBe(58);
    expect(fs.existsSync(path.join(outDir, 'th', 'manifest.json'))).toBe(true);

    const src = createFileLexiconSource(outDir, 'th');
    expect(src.lang).toBe('th');
    const info = await src.info();
    expect(info).toEqual({
      id: 'kaikki-th@2026-09-28', lang: 'th', attribution: 'Wiktionary, via kaikki.org — CC BY-SA 4.0', licence: expect.stringContaining('CC BY-SA 4.0'),
      entries: 58, builtAt: DATE, hasFrequency: false,
      source: {
        url: 'https://example.test/fixture.jsonl', file: 'kaikki-th-sample.jsonl', lastModified: '2026-09-28', retrievedAt: '2026-09-30',
        sha256: crypto.createHash('sha256').update(fs.readFileSync(FIXTURE)).digest('hex'), lines: 72, // 71 non-blank + 1 blank
      },
    });

    const got = await src.lookup(['ขนม', 'ที่', 'กิน', 'ไม่มีคำนี้']);
    expect([...got.keys()]).toEqual(['ขนม', 'ที่', 'กิน']);
    expect(got.get('ขนม')![0]).toMatchObject({ form: 'ขนม', lang: 'th', pos: 'NOUN', glosses: ['sweets; dessert', 'snack'], ipa: '/kʰa˨˩.nom˩˩˦/' });
    expect(got.get('ที่')!.map((e) => e.pos)).toEqual(['NOUN', 'CONJ', 'CLF']);
    expect(byPos(got.get('ที่'), 'CLF')?.glosses).toEqual(['classifier for places and orders']);
  });

  it('the preserved senses, pronunciations, etymology and alt-of survive the shard round trip', async () => {
    const outDir = path.join(root, 'preserved');
    writeBuild(outDir, out);
    const got = await createFileLexiconSource(outDir, 'th').lookup(['นีออน', 'ขอบคุณ', 'นา', 'ตุ๊กตุ๊ก', 'ทดสอบ']);
    expect(got.get('นีออน')![0].pronunciations).toHaveLength(2);
    expect(got.get('นีออน')![0].pronunciations![1].tags).toEqual(['Unorthographical', 'Short']);
    expect(got.get('ขอบคุณ')![0].pronunciations![0].asWritten).toBe(true);
    expect(got.get('นา')!.map((e) => e.etymology)).toEqual([1, 2]);
    expect(got.get('ตุ๊กตุ๊ก')![0].altOf).toEqual(['ตุ๊ก ๆ', 'ตุ๊กตุ๊ก2']);
    expect(got.get('ทดสอบ')![0].pronunciations).toHaveLength(5);
    expect(got.get('นีออน')![0].senses).toEqual([{ gloss: 'neon (fixture)' }]);
  });

  it('a schema-1 dictionary on disk reads as not installed', async () => {
    const outDir = path.join(root, 'old-schema');
    const dir = writeBuild(outDir, out);
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as Record<string, unknown>;
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ ...m, schema: 1 }));
    const src = createFileLexiconSource(outDir, 'th');
    expect(await src.info()).toBeUndefined();
    expect((await src.lookup(['ขนม'])).size).toBe(0);
  });

  it('round-trips every fixture entry exactly', async () => {
    const outDir = path.join(root, 'roundtrip');
    writeBuild(outDir, out);
    const src = createFileLexiconSource(outDir, 'th');
    const all: string[] = [];
    for (const f of out.manifest.shardFiles) all.push(...Object.keys(JSON.parse(out.files.get(f)!) as object));
    expect(all).toHaveLength(out.stats.forms);
    const got = await src.lookup(all);
    expect(got.size).toBe(all.length);
    expect([...got.values()].flat()).toHaveLength(out.manifest.entries);
  });

  it('is not installed: no directory, no manifest, a corrupt or wrong-language manifest all read as absent', async () => {
    expect(await createFileLexiconSource(path.join(root, 'nope'), 'th').info()).toBeUndefined();
    expect((await createFileLexiconSource(path.join(root, 'nope'), 'th').lookup(['ก'])).size).toBe(0);

    const bad = path.join(root, 'bad');
    fs.mkdirSync(path.join(bad, 'th'), { recursive: true });
    fs.writeFileSync(path.join(bad, 'th', 'manifest.json'), '{not json');
    expect(await createFileLexiconSource(bad, 'th').info()).toBeUndefined();

    const wrong = path.join(root, 'wrong');
    writeBuild(wrong, out);
    expect(await createFileLexiconSource(wrong, 'es').info()).toBeUndefined(); // th files do not answer for es
  });

  it('a corrupt shard answers empty for its forms and leaves the others alone', async () => {
    const dir = path.join(root, 'corrupt');
    const d = writeBuild(dir, out);
    const victim = bucketOf('ขนม');
    fs.writeFileSync(path.join(d, shardName(victim)), '{"ขนม":[{"g":');
    const other = ['ดี', 'มา', 'ไป', 'และ', 'แต่', 'กิน', 'น้ำ'].find((f) => bucketOf(f) !== victim)!;
    const src = createFileLexiconSource(dir, 'th');
    const got = await src.lookup(['ขนม', other]);
    expect(got.has('ขนม')).toBe(false);
    expect(got.has(other)).toBe(true);
  });

  it('a missing shard file (listed in the manifest) answers empty', async () => {
    const dir = path.join(root, 'missing-shard');
    const d = writeBuild(dir, out);
    fs.rmSync(path.join(d, shardName(bucketOf('ขนม'))));
    expect((await createFileLexiconSource(dir, 'th').lookup(['ขนม'])).size).toBe(0);
  });

  it('entries with bad fields inside a shard are dropped, good ones kept', async () => {
    const dir = path.join(root, 'bad-entries');
    const d = writeBuild(dir, out);
    const name = shardName(bucketOf('ขนม'));
    fs.writeFileSync(path.join(d, name), JSON.stringify({
      ขนม: [{ g: [] }, 'x', { g: ['ok'], p: 'BOGUS', c: ['formal', 'nonsense'] }], ไม่ใช่: 5,
    }));
    const got = await createFileLexiconSource(dir, 'th').lookup(['ขนม', 'ไม่ใช่']);
    expect(got.get('ขนม')).toEqual([{ form: 'ขนม', lang: 'th', glosses: ['ok'], register: ['formal'] }]);
    expect(got.has('ไม่ใช่')).toBe(false);
  });

  it('the CLI writer replaces an earlier build: no stale shard survives', async () => {
    const dir = path.join(root, 'rebuild');
    const th = path.join(dir, 'th');
    fs.mkdirSync(th, { recursive: true });
    const stale = out.manifest.shardFiles.includes('s-ff.json') ? 's-fe.json' : 's-ff.json';
    fs.writeFileSync(path.join(th, stale), '{"x":[{"g":["stale"]}]}');
    fs.writeFileSync(path.join(th, 'notes.txt'), 'kept');
    await buildDictionaryFile({ input: FIXTURE, lang: 'th', outDir: dir, date: DATE, normalize: thNormalize });
    expect(fs.existsSync(path.join(th, stale))).toBe(false);
    expect(fs.readFileSync(path.join(th, 'notes.txt'), 'utf8')).toBe('kept');
  });

  it('builds byte-identical files twice', async () => {
    const a = path.join(root, 'det-a');
    const b = path.join(root, 'det-b');
    await buildDictionaryFile({ input: FIXTURE, lang: 'th', outDir: a, date: DATE });
    await buildDictionaryFile({ input: FIXTURE, lang: 'th', outDir: b, date: DATE });
    const names = fs.readdirSync(path.join(a, 'th'));
    expect(names).toEqual(fs.readdirSync(path.join(b, 'th')));
    for (const n of names) expect(fs.readFileSync(path.join(a, 'th', n))).toEqual(fs.readFileSync(path.join(b, 'th', n)));
  });

  it('refuses to write an empty dictionary', async () => {
    const empty = path.join(root, 'empty.jsonl');
    fs.writeFileSync(empty, 'garbage\n{}\n');
    await expect(buildDictionaryFile({ input: empty, lang: 'th', outDir: path.join(root, 'empty-out'), date: DATE })).rejects.toThrow(/no usable entries/);
    expect(fs.existsSync(path.join(root, 'empty-out'))).toBe(false);
  });
});

describe('fetch source (fake fetch)', () => {
  it('reads the manifest lazily, then only the shards it needs, and caches them', async () => {
    const f = fakeFetch(filesAt('/dict', out));
    const src = createFetchLexiconSource('th', { fetch: f.fetch });
    expect(f.log).toEqual([]); // nothing until asked
    const info = await src.info();
    expect(info?.id).toBe(`kaikki-th@${DATE}`);
    expect(f.log).toEqual(['/dict/th/manifest.json']);

    const a = await src.lookup(['ขนม']);
    expect(a.get('ขนม')![0].glosses).toEqual(['sweets; dessert', 'snack']);
    expect(f.log).toEqual(['/dict/th/manifest.json', `/dict/th/${shardName(bucketOf('ขนม'))}`]);

    await src.lookup(['ขนม']); // cached
    await src.info();
    expect(f.log).toHaveLength(2);
  });

  it('concurrent lookups share one request per shard and one manifest request', async () => {
    const f = fakeFetch(filesAt('/dict', out));
    const src = createFetchLexiconSource('th', { fetch: f.fetch });
    const [a, b, c] = await Promise.all([src.lookup(['ขนม', 'ที่']), src.lookup(['ขนม']), src.info()]);
    expect(a.get('ขนม')).toBeDefined();
    expect(b.get('ขนม')).toBeDefined();
    expect(c).toBeDefined();
    expect(f.log.filter((u) => u.endsWith('manifest.json'))).toHaveLength(1);
    const shardReqs = f.log.filter((u) => !u.endsWith('manifest.json'));
    expect(new Set(shardReqs).size).toBe(shardReqs.length);
    expect(shardReqs.sort()).toEqual([...new Set(['ขนม', 'ที่'].map((x) => `/dict/th/${shardName(bucketOf(x))}`))].sort());
  });

  it('a lookup of many forms fetches each bucket once and preserves the caller order', async () => {
    const f = fakeFetch(filesAt('/dict', out));
    const src = createFetchLexiconSource('th', { fetch: f.fetch });
    const forms = ['ไป', 'มา', 'กิน', 'น้ำ', 'ดี', 'ไป', 'ไม่มีคำนี้'];
    const got = await src.lookup(forms);
    expect([...got.keys()]).toEqual(['ไป', 'มา', 'กิน', 'น้ำ', 'ดี']);
    const shardReqs = f.log.filter((u) => !u.endsWith('manifest.json'));
    const wanted = new Set(forms.map(bucketOf).filter((b) => out.manifest.shardFiles.includes(shardName(b))));
    expect(shardReqs).toHaveLength(wanted.size); // one per bucket that has a file, none for empty buckets
  });

  it('returns copies: changing a result does not change the cache', async () => {
    const f = fakeFetch(filesAt('/dict', out));
    const src = createFetchLexiconSource('th', { fetch: f.fetch });
    (await src.lookup(['ดี'])).get('ดี')![0].glosses.push('tampered');
    expect((await src.lookup(['ดี'])).get('ดี')![0].glosses).toEqual(['good', 'well']);
  });

  it('makes no request for a bucket the manifest says is empty', async () => {
    const f = fakeFetch(filesAt('/dict', out));
    const src = createFetchLexiconSource('th', { fetch: f.fetch });
    const got = await src.lookup([formInEmptyBucket()]);
    expect(got.size).toBe(0);
    expect(f.log).toEqual(['/dict/th/manifest.json']);
  });

  it('honours baseUrl (trailing slash or not)', async () => {
    const f = fakeFetch(filesAt('https://x.test/d', out));
    const src = createFetchLexiconSource('th', { baseUrl: 'https://x.test/d/', fetch: f.fetch });
    expect((await src.lookup(['ดี'])).size).toBe(1);
    expect(f.log[0]).toBe('https://x.test/d/th/manifest.json');
  });

  it('no manifest (404): info undefined, lookup empty, no shard requests, never throws', async () => {
    const f = fakeFetch(new Map());
    const src = createFetchLexiconSource('th', { fetch: f.fetch });
    expect(await src.info()).toBeUndefined();
    expect((await src.lookup(['ขนม', 'ดี'])).size).toBe(0);
    expect(f.log).toEqual(['/dict/th/manifest.json']); // the 404 is remembered
  });

  it('invalid manifests read as not installed: garbage, HTML fallback page, wrong schema, wrong language, missing fields', async () => {
    const good = JSON.parse(out.files.get('manifest.json')!) as Record<string, unknown>;
    const cases: string[] = [
      '{not json', '<!doctype html><html></html>', 'null', '[]',
      JSON.stringify({ ...good, schema: 1 }), JSON.stringify({ ...good, schema: 3 }), JSON.stringify({ ...good, lang: 'es' }), JSON.stringify({ ...good, entries: 'many' }),
      JSON.stringify({ ...good, hasFrequency: undefined }), JSON.stringify({ ...good, attribution: '' }),
    ];
    for (const body of cases) {
      const f = fakeFetch(new Map([['/dict/th/manifest.json', body]]));
      const src = createFetchLexiconSource('th', { fetch: f.fetch });
      expect(await src.info()).toBeUndefined();
      expect((await src.lookup(['ขนม'])).size).toBe(0);
    }
  });

  it('a corrupt shard answers empty (and is remembered) while other shards still work', async () => {
    const files = filesAt('/dict', out);
    const victim = `/dict/th/${shardName(bucketOf('ขนม'))}`;
    files.set(victim, '{"ขนม":[{"g":');
    const f = fakeFetch(files);
    const src = createFetchLexiconSource('th', { fetch: f.fetch });
    const other = ['ดี', 'มา', 'ไป', 'และ', 'แต่'].find((x) => bucketOf(x) !== bucketOf('ขนม'))!;
    const got = await src.lookup(['ขนม', other]);
    expect(got.has('ขนม')).toBe(false);
    expect(got.has(other)).toBe(true);
    await src.lookup(['ขนม']);
    expect(f.log.filter((u) => u === victim)).toHaveLength(1);
  });

  it('a shard that answers 404 or a non-object body is empty, not an error', async () => {
    const files = filesAt('/dict', out);
    files.delete(`/dict/th/${shardName(bucketOf('ขนม'))}`);
    const src = createFetchLexiconSource('th', { fetch: fakeFetch(files).fetch });
    expect((await src.lookup(['ขนม'])).size).toBe(0);

    const files2 = filesAt('/dict', out);
    files2.set(`/dict/th/${shardName(bucketOf('ขนม'))}`, '[1,2,3]');
    expect((await createFetchLexiconSource('th', { fetch: fakeFetch(files2).fetch }).lookup(['ขนม'])).size).toBe(0);
  });

  it('a network failure is not cached: the next call retries and succeeds', async () => {
    const files = filesAt('/dict', out);
    let down = true;
    const f = fakeFetch(files, { '/dict/th/manifest.json': () => { if (down) throw new TypeError('network down'); return new Response(files.get('/dict/th/manifest.json')!); } });
    const src = createFetchLexiconSource('th', { fetch: f.fetch });
    expect(await src.info()).toBeUndefined();
    expect((await src.lookup(['ขนม'])).size).toBe(0);
    down = false;
    expect((await src.info())?.entries).toBe(58);
    expect((await src.lookup(['ขนม'])).size).toBe(1);
  });

  it('a server error on a shard is retried on the next lookup', async () => {
    const files = filesAt('/dict', out);
    const url = `/dict/th/${shardName(bucketOf('ขนม'))}`;
    let broken = true;
    const f = fakeFetch(files, { [url]: () => (broken ? new Response('oops', { status: 503 }) : new Response(files.get(url)!)) });
    const src = createFetchLexiconSource('th', { fetch: f.fetch });
    expect((await src.lookup(['ขนม'])).size).toBe(0);
    broken = false;
    expect((await src.lookup(['ขนม'])).size).toBe(1);
  });

  it('lookup of nothing is empty and costs no shard request', async () => {
    const f = fakeFetch(filesAt('/dict', out));
    const src = createFetchLexiconSource('th', { fetch: f.fetch });
    expect((await src.lookup([])).size).toBe(0);
    expect((await src.lookup([''])).size).toBe(0);
    expect(f.log.filter((u) => !u.endsWith('manifest.json'))).toEqual([]);
  });
});

describe('browser safety', () => {
  it('src/dict/index.ts and everything it imports contain no node: imports', () => {
    const dir = path.resolve('src/dict');
    for (const f of ['index.ts', 'format.ts', 'map.ts', 'build.ts', 'sharded.ts']) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(text, f).not.toMatch(/from ['"]node:/);
      expect(text, f).not.toMatch(/from ['"]\.\/(file|build-node)['"]/);
    }
  });
});
