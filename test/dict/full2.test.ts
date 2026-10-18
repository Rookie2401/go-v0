import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  buildStringTable, bytesToText, createFullRecordSource, dedupeForms, encodeShard2, expandRecord2, internCandidates, isGzip, mapFullLine, parseFullManifest,
  parseFullShard, parseFullShard2, readFullRecord, splitUrl, type FullRecord,
} from '../../src/dict';
import { buildFullFile } from '../../src/dict/build-full';
import { occupiedBuckets, occupiedHex } from '../../src/dict/full-format';
import { tmpDir } from './helpers';

const norm = (s: string): string => s.normalize('NFC').toLowerCase();
const UPLOAD = 'https://upload.wikimedia.org/wikipedia/commons/';

const verb = {
  pos: 'verb', word: 'hablar', lang_code: 'es', lang: 'Spanish', etymology_number: 1,
  forms: [
    { form: 'hablo', tags: ['first-person', 'present', 'singular'] },
    { form: 'es-conj', source: 'conjugation', tags: ['inflection-template'] },
    { form: 'hablar', tags: ['infinitive'], source: 'conjugation' },
    { form: 'hablás', tags: ['vos-form', 'singular', 'second-person', 'present', 'indicative', 'informal'], source: 'conjugation' },
    { form: 'hablado', tags: ['participle', 'past'], source: 'conjugation' },
    { form: 'hablada', tags: ['participle', 'past'], source: 'conjugation', roman: 'ablada' },
  ],
  hyphenations: [{ parts: ['ha‧blar'] }],
  sounds: [{ ipa: '/aˈblaɾ/' }, { ipa: '[aˈβ̞laɾ]', tags: ['Latin-America'] }, { audio: 'Es-hablar.ogg', ogg_url: `${UPLOAD}a/ab/Es-hablar.ogg`, tags: ['Spain'] }],
  etymology_text: 'From Latin fābulārī.',
  etymology_templates: [{ name: 'inh', args: { '1': 'es', '2': 'la', '3': 'fābulārī', t: 'to talk' } }, { name: 'af', args: { '1': 'es', '2': 'habl', '3': '-ar' } }],
  derived: [{ word: 'hablador' }, { word: 'habladuría' }],
  senses: [{ glosses: ['to speak'], tags: ['intransitive'], examples: [{ text: 'Ella habla español.' }] }, { glosses: ['to talk'], raw_tags: ['Latin America'] }],
};
const noun = {
  pos: 'noun', word: 'libro', lang_code: 'es',
  forms: [{ form: 'libros', tags: ['plural'] }, { form: 'es-noun', source: 'declension', tags: ['inflection-template'] }],
  sounds: [{ ipa: '/ˈliβɾo/' }, { audio: 'Es-libro.ogg', ogg_url: `${UPLOAD}transcoded/c/cd/Es-libro.ogg/Es-libro.ogg.mp3` }],
  etymology_templates: [{ name: 'inh', args: { '1': 'es', '2': 'la', '3': 'liber' } }],
  senses: [{ glosses: ['book'] }],
};
const lines = [verb, { ...verb, pos: 'noun', etymology_number: 2, senses: [{ glosses: ['speech'] }] }, noun];

function records(): Map<string, FullRecord[]> {
  const out = new Map<string, FullRecord[]>();
  for (const l of lines) {
    const { key, record } = mapFullLine(l, norm, 'es');
    if (key && record) out.set(key, [...(out.get(key) ?? []), record]);
  }
  return out;
}
function table(map: Map<string, FullRecord[]>) {
  const counts = new Map<string, number>();
  for (const l of map.values()) for (const r of l) internCandidates(r, (s) => counts.set(s, (counts.get(s) ?? 0) + 1));
  return buildStringTable(counts, 1);
}
const asObject = (m: Map<string, FullRecord[]>): Record<string, FullRecord[]> => Object.fromEntries(m);

describe('full-2 encoding', () => {
  it('round trips: full-1 records -> full-2 shard text -> expanded are the same records', () => {
    const map = records();
    const strings = table(map);
    const text = encodeShard2(map, strings);
    const back = parseFullShard2(JSON.parse(text), strings.list);
    expect(asObject(back)).toEqual(asObject(map));
    // and through the full-1 route, the records are what the full-1 reader gives
    const f1 = parseFullShard(JSON.parse(`{${[...map.entries()].map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',')}}`));
    expect(asObject(back)).toEqual(asObject(f1));
  });

  it('writes each tag set once per shard and rows as [form, tagset-index, source?, roman?]', () => {
    const map = records();
    const strings = table(map);
    const shard = JSON.parse(encodeShard2(map, strings)) as { v: number; T: unknown[][]; k: Record<string, Array<{ f?: unknown[][] }>> };
    expect(shard.v).toBe(2);
    const rows = shard.k.hablar[0].f!;
    expect(rows).toHaveLength(5);
    for (const row of rows) { expect(typeof row[0]).toBe('string'); expect(Number.isInteger(row[1])).toBe(true); }
    // 'participle past' is used twice and has one entry
    const participle = rows[3][1] as number;
    expect(rows[4][1]).toBe(participle);
    expect(shard.T.length).toBe(new Set(shard.T.map((t) => JSON.stringify(t))).size);
    // the most used tag set takes the smallest index
    expect(participle).toBe(0);
    // tags are interned dictionary-wide: no tag string is written in the records, and the source is a number (or null before a romanization)
    const text = JSON.stringify(shard.k);
    expect(text).not.toMatch(/participle|conjugation|intransitive/);
    expect(rows[4]).toEqual(['hablada', participle, expect.any(Number), 'ablada']);
    for (const w of ['participle', 'conjugation', 'inh']) expect(strings.list).toContain(w);
    expect(strings.list).toContain(UPLOAD);
  });

  it('keeps a string that is not in the table as itself, and an audio url that has no prefix entry whole', () => {
    const map = records();
    const empty = buildStringTable(new Map());
    const text = encodeShard2(map, empty);
    expect(text).toContain('"participle"');
    expect(asObject(parseFullShard2(JSON.parse(text), []))).toEqual(asObject(map));
    expect(splitUrl(`${UPLOAD}transcoded/c/cd/x.ogg`)).toEqual([`${UPLOAD}transcoded/`, 'c/cd/x.ogg']);
    expect(splitUrl('not a url')).toBeUndefined();
  });

  it('drops exact duplicate form rows and nothing else', () => {
    const a = { f: 'x', t: ['plural'] };
    const dup = dedupeForms([a, { f: 'x', t: ['plural'] }, { f: 'x', t: ['plural'], s: 'declension' }, { f: 'x', t: ['singular'] }, { f: 'x', t: ['plural'], r: 'ks' }]);
    expect(dup).toHaveLength(4);
    const rec: FullRecord = { w: 'x', s: [{ g: 'g' }], f: [a, { ...a }, { f: 'y', t: ['plural'] }] };
    const map = new Map([['x', [rec]]]);
    const back = parseFullShard2(JSON.parse(encodeShard2(map, buildStringTable(new Map()))), []);
    expect(back.get('x')![0].f).toEqual([a, { f: 'y', t: ['plural'] }]);
  });

  it('reads untrusted shards safely: a bad index drops that entry, a bad shard is empty', () => {
    const strings = ['present', 'conjugation'];
    const raw = { v: 2, T: [[0], 'no', [9, 'extra']], k: { a: [{ w: 'a', s: [{ g: 'g', t: 7 }], f: [['x', 0, 1], ['y', 5], ['z', 2], 'bad', ['w', 0, 99]], ety: { tpl: [{ k: 1, lang: 99 }, { k: 55 }] } }, 3], b: 'no' } };
    const out = parseFullShard2(raw, strings).get('a')!;
    expect(out).toHaveLength(1);
    expect(out[0].s).toEqual([{ g: 'g' }]); // the tag-set index 7 is out of range: no tags, the sense stays
    expect(out[0].f).toEqual([{ f: 'x', t: ['present'], s: 'conjugation' }, { f: 'z', t: ['extra'] }, { f: 'w', t: ['present'] }]);
    expect(out[0].ety).toEqual({ tpl: [{ k: 'conjugation' }] });
    expect(parseFullShard2(null, strings).size).toBe(0);
    expect(parseFullShard2({ v: 1, k: {} }, strings).size).toBe(0);
    expect(expandRecord2(5, [], [])).toBeUndefined();
    expect(readFullRecord(expandRecord2({ w: 'a', s: [{ g: 'g' }], audio: [{ u: 'x.ogg', b: 3, n: 'a' }] }, [], ['https://h.test/'])))?.toEqual({ w: 'a', s: [{ g: 'g' }] });
  });

  it('keeps the bucket bitmap exact', () => {
    const set = new Set([0, 1, 5, 8, 255, 256, 1023]);
    const hex = occupiedHex(1024, (b) => set.has(b));
    expect(hex).toHaveLength(256);
    expect(occupiedBuckets(hex, 1024)).toEqual([...set].sort((x, y) => x - y));
    expect(occupiedBuckets('f', 3)).toEqual([0, 1, 2]);
  });
});

describe('full-2 on disk and over fetch', () => {
  const input = (dir: string) => { const f = path.join(dir, 'in.jsonl'); fs.writeFileSync(f, lines.map((l) => JSON.stringify(l)).join('\n') + '\n'); return f; };
  async function build(schema: 'full-1' | 'full-2', root = tmpDir('go-full2-')) {
    const out = path.join(root, schema);
    const r = await buildFullFile({ input: input(root), lang: 'es', outDir: out, date: '2026-10-17', normalize: norm, schema, gzip: schema === 'full-2', source: { url: 'https://kaikki.org/dictionary/Spanish/', lastModified: '2026-09-28' } });
    return { out, r, dir: path.join(out, 'es', 'full') };
  }
  /** A static host over a folder; 'decoded' = the server content-encodes, so the client sees the inflated bytes. */
  const serve = (root: string, log: string[] = [], mode: 'raw' | 'decoded' = 'raw'): typeof fetch => (async (input: RequestInfo | URL) => {
    const url = String(input);
    log.push(url);
    const p = path.join(root, url.replace(/^https:\/\/dict\.test\//, '').split('?')[0]);
    if (!fs.existsSync(p)) return new Response('nope', { status: 404 });
    let body: Buffer = fs.readFileSync(p);
    if (mode === 'decoded' && isGzip(body)) body = zlib.gunzipSync(body);
    return new Response(new Uint8Array(body), { status: 200 });
  }) as typeof fetch;

  it('stores gzipped shards at rest, a manifest that says so, and is byte-stable', async () => {
    const a = await build('full-2');
    const b = await build('full-2');
    const names = fs.readdirSync(a.dir).sort();
    expect(names.filter((n) => n.startsWith('f-')).every((n) => n.endsWith('.json.gz'))).toBe(true);
    expect(names).toEqual(fs.readdirSync(b.dir).sort());
    for (const n of names) expect(fs.readFileSync(path.join(a.dir, n)).equals(fs.readFileSync(path.join(b.dir, n)))).toBe(true);
    const shard = names.find((n) => n.startsWith('f-'))!;
    const bytes = fs.readFileSync(path.join(a.dir, shard));
    expect(isGzip(bytes)).toBe(true);
    expect(JSON.parse(zlib.gunzipSync(bytes).toString('utf8'))).toMatchObject({ v: 2 });
    expect(await bytesToText(bytes)).toBe(zlib.gunzipSync(bytes).toString('utf8'));
    expect(await bytesToText(new TextEncoder().encode('{"a":1}'))).toBe('{"a":1}'); // not gzip: read as text
    const manifest = JSON.parse(fs.readFileSync(path.join(a.dir, 'manifest.json'), 'utf8'));
    expect(manifest).toMatchObject({ schema: 'full-2', gzip: true, lang: 'es', buckets: 256 });
    expect(manifest.shardFiles).toBeUndefined();
    expect(manifest.rev).toMatch(/^[0-9a-f]{12}$/);
    const parsed = parseFullManifest(manifest, 'es')!;
    expect(parsed.shardFiles.sort()).toEqual(names.filter((n) => n.startsWith('f-')));
    expect(a.r.stats.diskBytes).toBeLessThan(a.r.stats.shardBytes + 1);
  });

  it('reads full-1 and full-2 side by side through the same reader, to the same records', async () => {
    const root = tmpDir('go-full2-both-');
    const one = await build('full-1', root);
    const two = await build('full-2', root);
    // full-1 and full-2 live in sibling folders: serve each as its own root
    const f1 = (async (i: RequestInfo | URL) => serve(one.out)(String(i))) as typeof fetch;
    const f2 = (async (i: RequestInfo | URL) => serve(two.out)(String(i))) as typeof fetch;
    const log: string[] = [];
    const a = createFullRecordSource('es', { baseUrl: 'https://dict.test/', fetch: f1 });
    const b = createFullRecordSource('es', { baseUrl: 'https://dict.test/', fetch: (async (i: RequestInfo | URL) => { log.push(String(i)); return f2(i); }) as typeof fetch });
    expect((await a.info())?.schema).toBe('full-1');
    expect((await b.info())?.schema).toBe('full-2');
    for (const key of ['hablar', 'libro', 'nada']) expect(await b.lookup(key)).toEqual(await a.lookup(key));
    expect((await b.lookup('hablar', 'NOUN')).map((r) => r.p)).toEqual(['NOUN', 'VERB']);
    const rev = (await b.info())!.rev!;
    const shardFetches = log.filter((u) => /\/f-[0-9a-f]+\.json\.gz/.test(u));
    expect(shardFetches.length).toBeGreaterThan(0);
    expect(shardFetches.every((u) => u.endsWith(`?v=${rev}`))).toBe(true); // versioned: a host may cache them as immutable
    expect(log.filter((u) => u.includes('manifest.json')).every((u) => !u.includes('?'))).toBe(true);
  });

  it('inflates in Node, takes a body the server already decoded, and falls back to the plain name', async () => {
    const two = await build('full-2');
    const expected = await createFullRecordSource('es', { baseUrl: 'https://dict.test/', fetch: serve(two.out) }).lookup('hablar');
    expect(expected).toHaveLength(2);
    expect(expected[0].f).toHaveLength(5);
    expect(await createFullRecordSource('es', { baseUrl: 'https://dict.test/', fetch: serve(two.out, [], 'decoded') }).lookup('hablar')).toEqual(expected);
    // only the plain name is hosted: a plain-text copy of each shard next to a manifest that says gzip
    const plain = path.join(tmpDir('go-full2-plain-'), 'es', 'full');
    fs.mkdirSync(plain, { recursive: true });
    for (const n of fs.readdirSync(two.dir)) {
      const bytes = fs.readFileSync(path.join(two.dir, n));
      fs.writeFileSync(path.join(plain, n.endsWith('.gz') ? n.slice(0, -3) : n), n.endsWith('.gz') ? zlib.gunzipSync(bytes) : bytes);
    }
    const log: string[] = [];
    const fromPlain = createFullRecordSource('es', { baseUrl: 'https://dict.test/', fetch: serve(path.dirname(path.dirname(plain)), log) });
    expect(await fromPlain.lookup('hablar')).toEqual(expected);
    expect(log.some((u) => /\.json\.gz/.test(u))).toBe(true);
    expect(log.some((u) => /\.json\?/.test(u))).toBe(true);
  });

  it('never throws on a corrupt gzip shard', async () => {
    const two = await build('full-2');
    const f = serve(two.out);
    const bad = createFullRecordSource('es', { baseUrl: 'https://dict.test/', fetch: (async (i: RequestInfo | URL) => (/\/f-/.test(String(i)) ? new Response(new Uint8Array([0x1f, 0x8b, 8, 0, 1, 2, 3]), { status: 200 }) : f(i))) as typeof fetch });
    expect(await bad.lookup('hablar')).toEqual([]);
    expect(await bad.lookup('hablar')).toEqual([]); // and again: a failed read is not remembered
  });
});

describe('size regression guard', () => {
  /** A deterministic German-like synthetic dictionary: nouns with a declension table, verbs with a conjugation table. */
  function synthetic(n: number): string[] {
    const CASES = ['nominative', 'genitive', 'dative', 'accusative'];
    const PERSONS = ['first-person', 'second-person', 'third-person'];
    let seed = 12345;
    const rnd = (m: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % m; };
    const syl = ['ba', 'ko', 'mi', 'ru', 'sel', 'tan', 'ger', 'fo', 'lin', 'ste', 'wal', 'hau', 'ber', 'zun'];
    const word = (k: number) => Array.from({ length: k }, () => syl[rnd(syl.length)]).join('');
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const w = word(2 + rnd(3)) + i.toString(36);
      const forms: unknown[] = [{ form: 'de-ndecl', source: 'declension', tags: ['inflection-template'] }];
      let pos = 'noun';
      if (i % 3 === 2) {
        pos = 'adj';
        for (const degree of ['positive', 'comparative']) for (const strength of ['strong', 'weak']) for (const g of ['masculine', 'feminine', 'neuter']) for (const c of CASES) {
          forms.push({ form: `${w}${degree[0]}${strength[0]}${g[0]}${c[0]}`, tags: [c, degree, g, 'singular', strength], source: 'declension' });
        }
      } else if (i % 3 === 0) {
        pos = 'verb';
        for (const tense of ['present', 'preterite']) for (const p of PERSONS) for (const num of ['singular', 'plural']) forms.push({ form: `${w.slice(0, -1)}${tense[0]}${p[0]}${num[0]}`, tags: [p, num, tense, 'indicative'], source: 'conjugation' });
        forms.push({ form: `ge${w}t`, tags: ['participle', 'past'], source: 'conjugation' }, { form: w, tags: ['infinitive'], source: 'conjugation' });
      } else {
        for (const num of ['singular', 'plural']) for (const c of CASES) for (const def of [['definite'], ['indefinite']]) forms.push({ form: `${def[0][0]}${w}${c[0]}${num[0]}`, tags: [c, num, ...def], source: 'declension' });
      }
      out.push(JSON.stringify({
        pos, word: w, lang_code: 'de', senses: [{ glosses: [`meaning of ${w}`], tags: ['feminine'], examples: [{ text: `Ein Beispiel mit ${w}.` }] }], forms,
        sounds: [{ ipa: `/${w}/` }, ...(i % 5 === 0 ? [{ audio: `De-${w}.ogg`, ogg_url: `${UPLOAD}${(i % 9).toString(16)}/${(i % 7).toString(16)}${(i % 5).toString(16)}/De-${w}.ogg`, tags: ['Germany'] }] : [])],
        etymology_text: `From Middle High German ${w}.`,
        etymology_templates: [{ name: 'inh', args: { '1': 'de', '2': 'gmh', '3': w } }, { name: 'der', args: { '1': 'de', '2': 'goh', '3': `${w}a` } }],
        derived: [{ word: `${w}er` }],
      }));
    }
    return out;
  }

  it('a 20,000-record synthetic build is at least 60% smaller than full-1 (and far smaller gzipped at rest)', async () => {
    const root = tmpDir('go-full2-size-');
    const file = path.join(root, 'in.jsonl');
    fs.writeFileSync(file, synthetic(20000).join('\n') + '\n');
    const one = await buildFullFile({ input: file, lang: 'de', outDir: path.join(root, 'a'), date: '2026-10-17', normalize: norm, schema: 'full-1' });
    const two = await buildFullFile({ input: file, lang: 'de', outDir: path.join(root, 'b'), date: '2026-10-17', normalize: norm, schema: 'full-2', gzip: true });
    expect(one.stats.counts.records).toBe(20000);
    expect(two.stats.counts).toEqual(one.stats.counts);
    expect(two.stats.shardBytes).toBeLessThanOrEqual(one.stats.shardBytes * 0.4);
    expect(two.stats.diskBytes).toBeLessThanOrEqual(one.stats.diskBytes * 0.15);
    expect(two.stats.keys).toBe(one.stats.keys);
    // and the compact build reads back to the same records as the plain one for a sample of keys
    const f = (r: string): typeof fetch => (async (i: RequestInfo | URL) => {
      const p = path.join(root, r, String(i).replace(/^https:\/\/dict\.test\//, '').split('?')[0]);
      return fs.existsSync(p) ? new Response(fs.readFileSync(p), { status: 200 }) : new Response('', { status: 404 });
    }) as typeof fetch;
    const a = createFullRecordSource('de', { baseUrl: 'https://dict.test/', fetch: f('a') });
    const b = createFullRecordSource('de', { baseUrl: 'https://dict.test/', fetch: f('b') });
    const keys = synthetic(20000).filter((_, i) => i % 997 === 0).map((l) => (JSON.parse(l) as { word: string }).word);
    for (const k of keys) { const x = await a.lookup(k); expect(x.length).toBe(1); expect(await b.lookup(k)).toEqual(x); }
  }, 120_000);
});
