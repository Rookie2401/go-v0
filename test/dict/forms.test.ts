import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import type { DictionaryEntry } from '../../src/core';
import { bucketOf } from '../../src/dict/format';
import {
  FORMS_CACHE_SHARDS, FORMS_MAX_ROWS, FORMS_SHARD_MAX_BYTES, FORMS_VERSION, createFormsBuilder, createFormsSource, formsShardFile, isTableForm, parseFormsManifest,
  parseFormsShard, utf8Length, type FormsManifest,
} from '../../src/dict/forms';
import { tmpDir } from './helpers';

const entry = (form: string, extra: Partial<DictionaryEntry> = {}): DictionaryEntry => ({ form, lang: 'de', glosses: [], ...extra });
const inflected = (form: string, lemma: string, pos: DictionaryEntry['pos'] = 'NOUN', extra: Partial<DictionaryEntry> = {}): DictionaryEntry =>
  entry(form, { pos, formOf: [{ lemma, tags: [] }], ...extra });

describe('forms builder', () => {
  it('makes an inflected form point at its lemmas and a lemma point at itself (the written spelling)', () => {
    const b = createFormsBuilder();
    b.add(inflected('bisherigen', 'bisherig', 'ADJ'));
    b.add(entry('sklave', { written: 'Sklave', pos: 'NOUN' }));
    b.add(entry('gehen', { pos: 'VERB' }));
    b.add({ ...inflected('gehst', 'gehen', 'VERB'), formOf: [{ lemma: 'gehen', tags: [] }, { lemma: 'gehen', tags: ['x'] }, { lemma: 'gehn', tags: [] }] });
    const { shards, forms } = b.finish(4);
    expect(forms).toBe(4);
    const all: Record<string, unknown[]> = Object.assign({}, ...[...shards.values()].map((t) => JSON.parse(t) as object));
    expect(all.bisherigen).toEqual([['bisherig', 'ADJ']]);
    expect(all.sklave).toEqual([['Sklave', 'NOUN']]);
    expect(all.gehen).toEqual([['gehen', 'VERB']]);
    expect(all.gehst).toEqual([['gehen', 'VERB'], ['gehn', 'VERB']]); // distinct lemmas only
  });
  it('keeps the dictionary order, dedupes lemma+pos across entries, caps at 6 rows, and stores a missing pos as null', () => {
    const b = createFormsBuilder();
    b.add(entry('x', { written: 'X', pos: 'NOUN' }));
    b.add(inflected('x', 'a', 'VERB'));
    b.add(inflected('x', 'a', 'VERB'));
    b.add(entry('x', { written: 'X', pos: 'NOUN' }));
    b.add(entry('x'));
    for (let i = 0; i < 10; i++) b.add(inflected('x', `l${i}`, 'ADJ'));
    const all = JSON.parse([...b.finish(1).shards.values()][0]) as Record<string, unknown[]>;
    expect(all.x).toHaveLength(FORMS_MAX_ROWS);
    expect(all.x.slice(0, 4)).toEqual([['X', 'NOUN'], ['a', 'VERB'], ['x', null], ['l0', 'ADJ']]);
  });
  it('gives a form-of lemma the written spelling of its own entry, whichever comes first', () => {
    const b = createFormsBuilder();
    b.add(inflected('kämpfen', 'kampf', 'NOUN')); // the form first ...
    b.add(entry('kämpfen', { pos: 'VERB' }));
    b.add(entry('kampf', { written: 'Kampf', pos: 'NOUN' })); // ... its lemma later
    b.add(inflected('klassenkämpfe', 'klassenkampf', 'NOUN'));
    b.add(entry('klassenkampf', { written: 'Klassenkampf', pos: 'NOUN' }));
    b.add(inflected('xyz', 'unknownlemma', 'NOUN')); // no entry for the lemma: the lemma stays as the dictionary has it
    const all = JSON.parse([...b.finish(1).shards.values()][0]) as Record<string, unknown[]>;
    expect(all['kämpfen']).toEqual([['Kampf', 'NOUN'], ['kämpfen', 'VERB']]);
    expect(all['klassenkämpfe']).toEqual([['Klassenkampf', 'NOUN']]);
    expect(all.xyz).toEqual([['unknownlemma', 'NOUN']]);
  });
  it('adds inflection-table forms after the entries rows, deduped, capped, and counted', () => {
    const b = createFormsBuilder();
    b.addTable('kämpfenden', 'kämpfen', 'VERB'); // table rows may arrive before the entries of the same form are added
    b.add(entry('kämpfend', { pos: 'VERB' }));
    b.add(inflected('kämpfenden', 'kämpfend', 'ADJ'));
    expect(b.addTable('kämpfend', 'kämpfen', 'VERB')).toBe(1);
    expect(b.addTable('kämpfend', 'kämpfen', 'VERB')).toBe(0); // lemma+pos already there
    expect(b.addTable('kämpfend', 'kämpfend', 'VERB')).toBe(0); // the entry's own row
    expect(b.addTable('', 'x', null) + b.addTable('x', '', null)).toBe(0);
    for (let i = 0; i < 10; i++) b.addTable('viele', `l${i}`, null);
    const r = b.finish(1);
    const all = JSON.parse([...r.shards.values()][0]) as Record<string, unknown[]>;
    expect(all['kämpfend']).toEqual([['kämpfend', 'VERB'], ['kämpfen', 'VERB']]);
    expect(all['kämpfenden']).toEqual([['kämpfen', 'VERB'], ['kämpfend', 'ADJ']]); // arrival order within the builder
    expect(all.viele).toHaveLength(FORMS_MAX_ROWS);
    expect(r.fromTables).toBe(2 + FORMS_MAX_ROWS);
  });
  it('takes only single-word rows that have a grammatical tag and no error, class or auxiliary tag', () => {
    const row = (f: string, ...t: string[]) => ({ f, t });
    expect(isTableForm(row('Ständen', 'dative', 'plural'))).toBe(true);
    expect(isTableForm(row('kämpfte', 'past'))).toBe(true);
    expect(isTableForm(row('hat gegangen', 'perfect'))).toBe(false); // a phrase
    expect(isTableForm(row('haben', 'auxiliary'))).toBe(false);
    expect(isTableForm(row('ī-stem', 'class'))).toBe(false);
    expect(isTableForm(row('Admiri', 'error-unrecognized-form', 'singular'))).toBe(false);
    expect(isTableForm(row('Kampf', 'canonical'))).toBe(false);
    expect(isTableForm(row('-', 'plural'))).toBe(false);
    expect(isTableForm(row('ความรัก', 'abstract-noun'))).toBe(false); // derived word, not an inflection
  });
  it('is independent of the order entries arrive in, and sorts its keys', () => {
    const list = [inflected('b', 'B', 'NOUN'), inflected('a', 'A', 'NOUN'), inflected('c', 'C', 'NOUN')];
    const build = (l: DictionaryEntry[]) => { const b = createFormsBuilder(); for (const e of l) b.add(e); return JSON.stringify([...b.finish(2).shards].sort((x, y) => x[0] - y[0])); };
    expect(build(list)).toBe(build([...list].reverse()));
  });
  it('puts every form in the shard of its bucket and picks a power-of-two bucket count that keeps shards small', () => {
    const b = createFormsBuilder();
    for (let i = 0; i < 6000; i++) b.add(inflected(`wort${i}`, `lemma-number-${i % 997}`, 'NOUN'));
    const r = b.finish();
    expect(r.buckets & (r.buckets - 1)).toBe(0);
    expect(r.buckets).toBeGreaterThanOrEqual(16);
    expect(r.maxShardBytes).toBeLessThanOrEqual(FORMS_SHARD_MAX_BYTES);
    for (const [bucket, text] of r.shards) {
      expect(utf8Length(text)).toBeLessThanOrEqual(r.maxShardBytes);
      for (const form of Object.keys(JSON.parse(text) as object)) expect(bucketOf(form, r.buckets)).toBe(bucket);
    }
    expect(r.forms).toBe(6000);
    expect(r.lemmas).toBe(997);
  });
  it('counts UTF-8 bytes', () => {
    expect(utf8Length('abc')).toBe(3);
    expect(utf8Length('ä')).toBe(2);
    expect(utf8Length('น้ำ')).toBe(9);
    expect(utf8Length('😀')).toBe(4);
  });
});

describe('forms files', () => {
  it('names shards by the width the bucket count needs', () => {
    expect(formsShardFile(5)).toBe('f-05.json');
    expect(formsShardFile(5, 16)).toBe('f-05.json');
    expect(formsShardFile(0x3ff, 1024)).toBe('f-3ff.json');
  });
  it('drops rows of the wrong shape and refuses a bad manifest', () => {
    const shard = parseFormsShard({ a: [['x', 'NOUN'], ['', null], 'y', ['z', 7]], junk: 'x', empty: [] });
    expect(shard.get('a')).toEqual([['x', 'NOUN'], ['z', null]]);
    expect(shard.has('junk') || shard.has('empty')).toBe(false);
    const ok = { version: FORMS_VERSION, lang: 'de', buckets: 4, forms: 3, lemmas: 2, shardFiles: ['f-00.json'], builtFrom: 'x' };
    expect(parseFormsManifest(ok, 'de')?.forms).toBe(3);
    expect(parseFormsManifest(ok, 'de')?.fromTables).toBe(0); // an index built before the tables were added
    expect(parseFormsManifest({ ...ok, fromTables: 7 }, 'de')?.fromTables).toBe(7);
    expect(parseFormsManifest(ok, 'es')).toBeUndefined();
    expect(parseFormsManifest({ ...ok, version: 2 }, 'de')).toBeUndefined();
    expect(parseFormsManifest({ ...ok, shardFiles: ['../x.json'] }, 'de')).toBeUndefined();
    expect(parseFormsManifest({ ...ok, buckets: 0 }, 'de')).toBeUndefined();
    expect(parseFormsManifest({ ...ok, forms: 'x' }, 'de')).toBeUndefined();
  });
});

describe('forms source over a fixture directory', () => {
  let dir = '';
  let requests: string[] = [];
  const BUCKETS = 32;
  const serve = (root: string, failFirst = new Set<string>()): typeof fetch => (async (url: string | URL | Request) => {
    const u = String(url);
    requests.push(u);
    if (failFirst.delete(u)) return new Response('busy', { status: 503 });
    const file = path.join(root, u.replace(/^\/dict\//, ''));
    return fs.existsSync(file) ? new Response(fs.readFileSync(file, 'utf8')) : new Response('not found', { status: 404 });
  }) as typeof fetch;
  const names = (m: FormsManifest) => m.shardFiles;

  beforeAll(() => {
    dir = tmpDir('forms-fixture-');
    const b = createFormsBuilder();
    b.add(inflected('bisherigen', 'bisherig', 'ADJ'));
    b.add(entry('sklave', { written: 'Sklave', pos: 'NOUN' }));
    b.add(inflected('sklaven', 'sklave', 'NOUN'));
    b.add(entry('kampf', { written: 'Kampf', pos: 'NOUN' }));
    b.add(inflected('versteckten', 'verstecken', 'VERB'));
    b.add(entry('verstecken', { pos: 'VERB' }));
    for (let i = 0; i < 80; i++) b.add(inflected(`füller${i}`, `füll${i % 7}`, 'NOUN')); // enough forms to fill most buckets
    const { shards, forms, lemmas, fromTables } = b.finish(BUCKETS);
    const out = path.join(dir, 'de', 'forms');
    fs.mkdirSync(out, { recursive: true });
    const shardFiles: string[] = [];
    for (const [bucket, text] of [...shards].sort((x, y) => x[0] - y[0])) {
      const name = formsShardFile(bucket, BUCKETS);
      fs.writeFileSync(path.join(out, name), text);
      shardFiles.push(name);
    }
    const manifest: FormsManifest = { version: FORMS_VERSION, lang: 'de', buckets: BUCKETS, forms, lemmas, fromTables, shardFiles, builtFrom: 'fixture' };
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest));
  });
  afterAll(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
  const manifest = () => JSON.parse(fs.readFileSync(path.join(dir, 'de', 'forms', 'manifest.json'), 'utf8')) as FormsManifest;

  it('round trips: the manifest parses and every form is found, with its pos when it has one', async () => {
    const m = parseFormsManifest(manifest(), 'de')!;
    expect(m.buckets).toBe(BUCKETS);
    expect(m.forms).toBe(86);
    const src = createFormsSource('de', { fetch: serve(dir) });
    const got = await src.lookupForms(['bisherigen', 'sklave', 'sklaven', 'versteckten', 'xyzzy', 'kampf']);
    expect(got.get('bisherigen')).toEqual([{ lemma: 'bisherig', pos: 'ADJ' }]);
    expect(got.get('sklave')).toEqual([{ lemma: 'Sklave', pos: 'NOUN' }]);
    expect(got.get('sklaven')).toEqual([{ lemma: 'Sklave', pos: 'NOUN' }]); // the lemma carries its written capital
    expect(got.get('versteckten')).toEqual([{ lemma: 'verstecken', pos: 'VERB' }]);
    expect(got.has('xyzzy')).toBe(false); // only the forms it found
    expect([...got.keys()].sort()).toEqual(['bisherigen', 'kampf', 'sklave', 'sklaven', 'versteckten']);
  });
  it('fetches the manifest once and each needed shard once, however many forms share it', async () => {
    requests = [];
    const m = manifest();
    // two forms of one bucket, plus a duplicate in the ask
    const byBucket = new Map<number, string[]>();
    for (let i = 0; i < 80; i++) { const f = `füller${i}`; const k = bucketOf(f, BUCKETS); byBucket.set(k, [...(byBucket.get(k) ?? []), f]); }
    const same = [...byBucket.values()].find((l) => l.length >= 2)!;
    const src = createFormsSource('de', { fetch: serve(dir), base: '/dict/' });
    const got = await src.lookupForms([...same.slice(0, 2), same[0], 'sklave']);
    expect([...got.keys()].sort()).toEqual([...new Set([...same.slice(0, 2), 'sklave'])].sort());
    expect(requests[0]).toBe('/dict/de/forms/manifest.json');
    const shardReads = requests.filter((u) => /f-[0-9a-f]+\.json$/.test(u));
    expect(new Set(shardReads).size).toBe(shardReads.length);
    expect(shardReads.length).toBeLessThanOrEqual(2);
    await src.lookupForms(same); // cached: no new request
    await src.lookupForms(same);
    expect(requests.filter((u) => u.endsWith('manifest.json'))).toHaveLength(1);
    expect(requests.filter((u) => /f-[0-9a-f]+\.json$/.test(u))).toHaveLength(shardReads.length);
    expect(m.shardFiles.length).toBeGreaterThan(FORMS_CACHE_SHARDS);
  });
  it('skips buckets the manifest says are empty: no request', async () => {
    const m = manifest();
    const skipped = formsShardFile(bucketOf('sklave', BUCKETS), BUCKETS);
    const trimmed = JSON.stringify({ ...m, shardFiles: names(m).filter((n) => n !== skipped) });
    requests = [];
    const none = createFormsSource('de', { fetch: (async (u: string) => { requests.push(u); return new Response(trimmed); }) as typeof fetch, base: '/dict' });
    expect((await none.lookupForms(['sklave'])).size).toBe(0);
    expect(requests).toEqual(['/dict/de/forms/manifest.json']);
  });
  it(`keeps at most ${FORMS_CACHE_SHARDS} shards: the least recently used one is read again`, async () => {
    const m = manifest();
    // one form per shard file, found by reading the shards
    const forms = m.shardFiles.map((f) => Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'de', 'forms', f), 'utf8')) as object)[0]);
    expect(forms.length).toBeGreaterThan(FORMS_CACHE_SHARDS);
    requests = [];
    const src = createFormsSource('de', { fetch: serve(dir) });
    for (const f of forms) await src.lookupForms([f]);
    await src.lookupForms([forms[0]]); // evicted by now
    const first = formsShardFile(bucketOf(forms[0], BUCKETS), BUCKETS);
    expect(requests.filter((u) => u.endsWith(first))).toHaveLength(2);
    requests = [];
    await src.lookupForms([forms[0]]); // the most recent one is held
    expect(requests).toEqual([]);
  });
  it('answers an empty Map when there is no manifest (a 404 is remembered), and never throws', async () => {
    requests = [];
    const src = createFormsSource('sq', { fetch: serve(dir) });
    expect((await src.lookupForms(['shtëpi'])).size).toBe(0);
    expect((await src.lookupForms(['shtëpi'])).size).toBe(0);
    expect(requests).toEqual(['/dict/sq/forms/manifest.json']);
    expect((await src.lookupForms([])).size).toBe(0);
    const broken = createFormsSource('de', { fetch: (async () => { throw new Error('offline'); }) as typeof fetch });
    expect((await broken.lookupForms(['sklave'])).size).toBe(0);
    const garbage = createFormsSource('de', { fetch: (async () => new Response('{not json')) as typeof fetch });
    expect((await garbage.lookupForms(['sklave'])).size).toBe(0);
    const wrongLang = createFormsSource('es', { fetch: (async () => new Response(fs.readFileSync(path.join(dir, 'de', 'forms', 'manifest.json'), 'utf8'))) as typeof fetch });
    expect((await wrongLang.lookupForms(['sklave'])).size).toBe(0);
  });
  it('retries a transient failure on the next call, for the manifest and for a shard', async () => {
    const first = '/dict/de/forms/manifest.json';
    const src = createFormsSource('de', { fetch: serve(dir, new Set([first])) });
    expect((await src.lookupForms(['sklave'])).size).toBe(0); // the manifest request failed: nothing, not an error
    expect((await src.lookupForms(['sklave'])).get('sklave')?.[0].lemma).toBe('Sklave');
    const shard = `/dict/de/forms/${formsShardFile(bucketOf('kampf', BUCKETS), BUCKETS)}`;
    const src2 = createFormsSource('de', { fetch: serve(dir, new Set([shard])) });
    expect((await src2.lookupForms(['kampf'])).size).toBe(0);
    expect((await src2.lookupForms(['kampf'])).get('kampf')?.[0].lemma).toBe('Kampf');
  });
});

// The real built indexes (npm run dict:build-forms): present on a machine that has built them, absent on a clean checkout.
const REAL = path.resolve(__dirname, '../../public/dict');
const built = (lang: string) => fs.existsSync(path.join(REAL, lang, 'forms', 'manifest.json'));
const real = (): typeof fetch => (async (url: string | URL | Request) => {
  const file = path.join(REAL, String(url).replace(/^\/dict\//, ''));
  return fs.existsSync(file) ? new Response(fs.readFileSync(file, 'utf8')) : new Response('', { status: 404 });
}) as typeof fetch;
const notBuilt = (lang: string) => `the ${lang} forms index is not built (public/dict/${lang}/forms/manifest.json is absent): run npm run dict:build-forms -- --langs ${lang}`;
const deNorm = (s: string) => createAdapterRegistry().get('de').normalize(s);

// [surface form on a page, the lemmas it must give, one of which has to be among the readings]
const GERMAN: Array<[string, string[]]> = [
  ['bisherigen', ['bisherig']],
  ['Sklave', ['Sklave']],
  ['Kampf', ['Kampf']],
  ['Untergang', ['Untergang']],
  ['Patrizier', ['Patrizier']],
  ['Klassenkämpfe', ['Klassenkampf']],
  ['Kämpfen', ['Kampf']],
  ['versteckten', ['verstecken', 'versteckt']],
  ['kämpfend', ['kämpfend', 'kämpfen']],
  ['ununterbrochenen', ['ununterbrochen']],
  ['führten', ['führen']], // from the entries
  ['standen', ['stehen']],
  ['Ständen', ['Stand']], // "stehen" (subjunctive) and "Stand" (dative plural)
];
describe('the built German forms index answers the Manifesto words', () => {
  for (const [surface, lemmas] of GERMAN) {
    it.skipIf(!built('de'))(`${surface} -> ${lemmas.join(' | ')} (${built('de') ? 'built' : notBuilt('de')})`, async () => {
      const key = deNorm(surface);
      const got = (await createFormsSource('de', { fetch: real() }).lookupForms([key])).get(key);
      expect(got, `${key} is in the index`).toBeDefined();
      expect(got!.some((h) => lemmas.includes(h.lemma))).toBe(true);
    });
  }
  it.skipIf(!built('de'))(`xyzzy is absent (${built('de') ? 'built' : notBuilt('de')})`, async () => {
    expect((await createFormsSource('de', { fetch: real() }).lookupForms(['xyzzy'])).has('xyzzy')).toBe(false);
  });
  // Two examples the data cannot give, even with the inflection tables: kaikki has no entry for "Klassenkämpfen" or "kämpfenden", and
  // the full record of Klassenkampf lists only the genitives and the plural (no declension table), while "kämpfend" has no record
  // of its own (it is a form of kämpfen). The index is silent on them; if a rebuilt dictionary gains them this test only checks that
  // what it says is right.
  it.skipIf(!built('de'))(`Klassenkämpfen and kämpfenden: silent, or right (${built('de') ? 'built' : notBuilt('de')})`, async () => {
    const got = await createFormsSource('de', { fetch: real() }).lookupForms(['klassenkämpfen', 'kämpfenden']);
    if (got.has('klassenkämpfen')) expect(got.get('klassenkämpfen')!.map((h) => h.lemma)).toContain('Klassenkampf');
    if (got.has('kämpfenden')) expect(got.get('kämpfenden')!.some((h) => ['kämpfend', 'kämpfen'].includes(h.lemma))).toBe(true);
  });
  it.skipIf(!built('de'))(`every shard stays within the size limit (${built('de') ? 'built' : notBuilt('de')})`, () => {
    const m = JSON.parse(fs.readFileSync(path.join(REAL, 'de', 'forms', 'manifest.json'), 'utf8')) as FormsManifest;
    for (const f of m.shardFiles) expect(fs.statSync(path.join(REAL, 'de', 'forms', f)).size).toBeLessThanOrEqual(FORMS_SHARD_MAX_BYTES);
  });
});
