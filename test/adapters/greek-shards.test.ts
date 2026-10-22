// @vitest-environment node
/**
 * The sharded Ancient Greek index (src/adapters/greek/shards.ts): a key goes to the longest listed prefix of its bare letters; a host
 * loads the shards of the keys it is about to read; compressed shards are inflated; at most `maxLoaded` shards stay in memory.
 * The first block runs on a tiny index made here; the second on the real shards when they have been built locally.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { elAdapter } from '../../src/adapters/el';
import { installedGreekIndexes, lookupGreekForm, resetGreekIndexes, type GreekFormIndex } from '../../src/adapters/greek/index-store';
import { createGreekShardLoader, shardLetters, shardPrefix, type GreekShardManifest } from '../../src/adapters/greek/shards';

afterEach(() => resetGreekIndexes((id) => id === 'morphgnt-sblgnt-core'));

const SOURCE = { label: 'test', licence: 'none', url: '' };
const shard = (p: string, forms: GreekFormIndex['forms'], lemmas: GreekFormIndex['lemmas'], bare: GreekFormIndex['bare'] = {}): GreekFormIndex =>
  ({ schema: 1, id: 'kaikki-grc-tables', codes: 'kaikki-tags', period: 'el-att', shard: p, source: SOURCE, built: '2026-10-21', lemmas, forms, bare });
const TINY: Record<string, GreekFormIndex> = {
  'λ': shard('λ', { 'λόγος': [['λόγος|NOUN', 'table:nominative|singular', 3]] }, { 'λόγος|NOUN': ['λόγος', 'word', 'NOUN', 3, '', ''] }, { 'λογος': ['λόγος'] }),
  'αρ': shard('αρ', { 'ἀρχή': [['ἀρχή|NOUN', 'table:nominative|singular', 2]] }, { 'ἀρχή|NOUN': ['ἀρχή', 'beginning', 'NOUN', 2, '', ''] }, { 'αρχη': ['ἀρχή'] }),
  'α': shard('α', { 'ἄνθρωπος': [['ἄνθρωπος|NOUN', 'table:nominative|singular', 5]] }, { 'ἄνθρωπος|NOUN': ['ἄνθρωπος', 'man', 'NOUN', 5, '', ''] }),
  '_': shard('_', {}, {}),
};
const manifestOf = (gz: boolean): GreekShardManifest => ({
  schema: 1, id: 'kaikki-grc-tables', codes: 'kaikki-tags', period: 'el-att', source: SOURCE, built: '2026-10-21',
  shards: Object.fromEntries(Object.keys(TINY).map((p) => [p, { file: `${p}.json${gz ? '.gz' : ''}`, bytes: 1, keys: Object.keys(TINY[p].forms).length }])),
});
const sourceOf = (gz: boolean, log: string[] = []) => ({
  async fetchJson(path: string) {
    log.push(path);
    if (path.endsWith('manifest.json')) return manifestOf(gz);
    const p = path.replace(/^.*\//, '').replace(/\.json$/, '');
    if (!TINY[p]) throw new Error(`no ${path}`);
    return TINY[p];
  },
  async fetchBytes(path: string) {
    log.push(path);
    const p = path.replace(/^.*\//, '').replace(/\.json\.gz$/, '');
    if (!TINY[p]) throw new Error(`no ${path}`);
    return new Uint8Array(zlib.gzipSync(JSON.stringify(TINY[p])));
  },
});

describe('shard prefixes', () => {
  it('a key is placed by its bare letters, final sigma folded, non-letters dropped; the longest listed prefix wins; no Greek letter → _', () => {
    expect(shardLetters('Λόγος')).toBe('λογοσ');
    expect(shardLetters('ἀρχῇ,')).toBe('αρχη');
    expect(shardLetters('-ssosi')).toBe('');
    const prefixes = new Set(['λ', 'α', 'αρ', '_']);
    expect(shardPrefix('λογοσ', prefixes, 2)).toBe('λ');
    expect(shardPrefix('αρχη', prefixes, 2)).toBe('αρ');
    expect(shardPrefix('ανθρωποσ', prefixes, 2)).toBe('α');
    expect(shardPrefix('', prefixes, 2)).toBe('_');
    expect(shardPrefix('ω', prefixes, 2)).toBe('_');
  });
});

describe('the loader on a tiny index', () => {
  it('loads only the shards of the keys asked for, once; lookups then see them; failures are reported, not thrown', async () => {
    const log: string[] = [];
    const loader = await createGreekShardLoader(sourceOf(false, log), { base: 'lexicon/el/ancient' });
    expect(loader.shardFor('ἀρχῇ')).toBe('αρ');
    expect(lookupGreekForm('λόγος').filter((h) => h.index.id === 'kaikki-grc-tables')).toHaveLength(0);
    const r = await loader.ensure(['λόγος', 'ἀρχή', 'λόγου']);
    expect(r.loaded.sort()).toEqual(['αρ', 'λ']);
    expect(r.failed).toEqual([]);
    expect(lookupGreekForm('λόγος').filter((h) => h.index.id === 'kaikki-grc-tables')[0]?.row[0]).toBe('λόγος|NOUN');
    expect(lookupGreekForm('αρχη').filter((h) => h.index.id === 'kaikki-grc-tables')[0]).toMatchObject({ viaBare: true, key: 'ἀρχή' }); // the bare map travelled with its shard
    const again = await loader.ensure(['λόγος']);
    expect(again.loaded).toEqual([]);
    expect(log.filter((p) => p.endsWith('λ.json'))).toHaveLength(1);
    expect(installedGreekIndexes().filter((i) => i.id === 'kaikki-grc-tables').map((i) => i.shard).sort()).toEqual(['αρ', 'λ']);
    expect(elAdapter.analyze(elAdapter.tokenize('λόγος'))[0].candidates.some((c) => c.varieties?.includes('el-att'))).toBe(true);
  });
  it('a compressed shard is inflated; the least recently used shard is forgotten beyond maxLoaded', async () => {
    const loader = await createGreekShardLoader(sourceOf(true), { base: 'lexicon/el/ancient', maxLoaded: 1 });
    expect(loader.manifest.shards['λ'].file).toBe('λ.json.gz');
    await loader.ensure(['λόγος']);
    expect(loader.loaded()).toEqual(['λ']);
    await loader.ensure(['ἄνθρωπος']);
    expect(loader.loaded()).toEqual(['α']);
    expect(lookupGreekForm('λόγος').filter((h) => h.index.id === 'kaikki-grc-tables')).toHaveLength(0); // evicted
    expect(lookupGreekForm('ἄνθρωπος').filter((h) => h.index.id === 'kaikki-grc-tables')).toHaveLength(1);
    // one call that needs more shards than maxLoaded keeps them all: a chapter's words are never cut out from under it
    await loader.ensure(['λόγος', 'ἀρχή']);
    expect(loader.loaded().sort()).toEqual(['αρ', 'λ']);
    expect(lookupGreekForm('λόγος').filter((h) => h.index.id === 'kaikki-grc-tables')).toHaveLength(1);
  });
  it('a missing shard is a reported failure and the others still load', async () => {
    const src = sourceOf(false);
    const loader = await createGreekShardLoader({ ...src, fetchJson: async (p) => { if (p.endsWith('λ.json')) throw new Error('gone'); return src.fetchJson(p); } }, { base: 'x' });
    const r = await loader.ensure(['λόγος', 'ἀρχή']);
    expect(r.loaded).toEqual(['αρ']);
    expect(r.failed).toEqual([['x/λ.json', 'gone']]);
  });
});

const REAL = 'public/lexicon/el/ancient/manifest.json';
describe.skipIf(!fs.existsSync(REAL))('the real shards (built locally)', () => {
  const src = {
    async fetchJson(p: string) { return JSON.parse(fs.readFileSync(`public/${p}`, 'utf8')); },
    async fetchBytes(p: string) { return new Uint8Array(fs.readFileSync(`public/${p}`)); },
  };
  it('John 1:1 needs a handful of shards; λόγος then has Attic readings beside the Koine core, and the Variants tab shows them', async () => {
    const loader = await createGreekShardLoader(src, { base: 'lexicon/el/ancient' });
    expect(Object.keys(loader.manifest.shards).length).toBeGreaterThan(50);
    const text = 'Ἐν ἀρχῇ ἦν ὁ λόγος, καὶ ὁ λόγος ἦν πρὸς τὸν θεόν, καὶ θεὸς ἦν ὁ λόγος.';
    const keys = elAdapter.tokenize(text).filter((t) => t.isWord).map((t) => t.normalized);
    const r = await loader.ensure(keys);
    expect(r.failed).toEqual([]);
    expect(r.loaded.length).toBeGreaterThanOrEqual(4);
    expect(r.loaded.length).toBeLessThanOrEqual(12);
    const logos = lookupGreekForm('λόγος');
    expect(logos.some((h) => h.index.id === 'kaikki-grc-tables')).toBe(true);
    const v = elAdapter.variants?.('λόγος', 'NOUN', 'λόγος');
    expect(v?.rows.find((row) => row.varietyId === 'el-att')?.status).toBe('attested');
  });
});
