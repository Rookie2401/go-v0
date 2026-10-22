// @vitest-environment node
/**
 * The sharded Hebrew indexes (src/adapters/hebrew/shards.ts over the shared loader): a key goes to the longest listed prefix of its
 * consonants (finals folded); the shards of one id sit beside the compiled core; an unpointed lookup reaches a shard's pointed keys through
 * the consonantal map that travelled with it. The first block runs on a tiny index made here; the second on the real shards when built.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { heAdapter } from '../../src/adapters/he';
import { installedHebrewIndexes, lookupHebrewForm, resetHebrewIndexes, type HebrewFormIndex } from '../../src/adapters/hebrew/index-store';
import { createHebrewShardLoader, hebrewShardLetters } from '../../src/adapters/hebrew/shards';
import { pointed } from '../../src/adapters/hebrew/text';

afterEach(() => resetHebrewIndexes((id) => id === 'oshb-tanakh-core'));

const SOURCE = { label: 'test', licence: 'none', url: '' };
const shard = (p: string, forms: HebrewFormIndex['forms'], lemmas: HebrewFormIndex['lemmas'], consonantal: HebrewFormIndex['consonantal'] = {}): HebrewFormIndex =>
  ({ schema: 1, id: 'kaikki-he-tables', codes: 'kaikki-tags', period: 'he-mod', shard: p, source: SOURCE, built: '2026-10-22', lemmas, forms, consonantal });
const SEFER = pointed('סֵפֶר');
const TINY: Record<string, HebrewFormIndex> = {
  'ס': shard('ס', { [SEFER]: [['ספר|NOUN', 'singular|indefinite', 2]] }, { 'ספר|NOUN': ['סֵפֶר', 'book', 'NOUN', 2] }, { 'ספר': [SEFER] }),
  'ב': shard('ב', { [pointed('בַּיִת')]: [['בית|NOUN', 'singular|indefinite', 3]] }, { 'בית|NOUN': ['בַּיִת', 'house', 'NOUN', 3] }, { 'בית': [pointed('בַּיִת')] }),
  '_': shard('_', {}, {}),
};
const manifest = { schema: 1 as const, id: 'kaikki-he-tables', codes: 'kaikki-tags', period: 'he-mod', source: SOURCE, built: '2026-10-22', shards: Object.fromEntries(Object.keys(TINY).map((p) => [p, { file: `${p}.json.gz`, bytes: 1, keys: Object.keys(TINY[p].forms).length }])) };
const src = {
  async fetchJson(path: string) { if (path.endsWith('manifest.json')) return manifest; throw new Error(`no ${path}`); },
  async fetchBytes(path: string) { const p = decodeURIComponent(path.replace(/^.*\//, '').replace(/\.json\.gz$/, '')); if (!TINY[p]) throw new Error(`no ${path}`); return new Uint8Array(zlib.gzipSync(JSON.stringify(TINY[p]))); },
};

describe('shard letters', () => {
  it('a key is placed by its consonants, finals folded, points and accents dropped', () => {
    expect(hebrewShardLetters('סֵ֫פֶר')).toBe('ספר');
    expect(hebrewShardLetters('שָׁלוֹם')).toBe('שלומ');
    expect(hebrewShardLetters('3')).toBe('');
  });
});

describe('the loader on a tiny Modern index', () => {
  it('loads the shards of the keys asked for; a pointed and an unpointed lookup both find the shard; the core stays installed', async () => {
    const loader = await createHebrewShardLoader(src, { base: 'lexicon/he/modern' });
    expect(loader.shardFor('ספרים')).toBe('ס');
    const r = await loader.ensure(['סֵפֶר', 'בית']);
    expect(r.loaded.filter((p) => p !== '_').sort()).toEqual(['ב', 'ס']); // ('_' may come along: the remainder of a prefixed word whose first letter this tiny manifest does not list)
    expect(r.failed).toEqual([]);
    expect(lookupHebrewForm(SEFER).some((h) => h.index.id === 'kaikki-he-tables')).toBe(true);
    expect(lookupHebrewForm('ספר').some((h) => h.index.id === 'kaikki-he-tables' && h.viaConsonantal)).toBe(true); // the consonantal map travelled with the shard
    expect(installedHebrewIndexes().filter((i) => i.id === 'kaikki-he-tables').length).toBeGreaterThanOrEqual(2); // the shards asked for, beside the core
    expect(installedHebrewIndexes().some((i) => i.id === 'oshb-tanakh-core')).toBe(true);
    expect(heAdapter.analyze(heAdapter.tokenize('ספר'))[0].candidates.some((c) => c.varieties?.includes('he-mod'))).toBe(true);
  });
});

const REAL = 'public/lexicon/he/modern/manifest.json';
describe.skipIf(!fs.existsSync(REAL) || !fs.existsSync('public/lexicon/he/biblical/manifest.json'))('the real shards (built locally)', () => {
  const real = {
    async fetchJson(p: string) { return JSON.parse(fs.readFileSync(`public/${p}`, 'utf8')); },
    async fetchBytes(p: string) { return new Uint8Array(fs.readFileSync(`public/${p}`)); },
  };
  it('an unpointed Modern sentence reads as Modern once its shards are in; Genesis 1:1 reads as Biblical from the Biblical shards', async () => {
    const modern = await createHebrewShardLoader(real, { base: 'lexicon/he/modern' });
    const sentence = 'אני גר בירושלים ואתה גר בחיפה.';
    const keys = heAdapter.tokenize(sentence).filter((t) => t.isWord).map((t) => t.normalized);
    const r = await modern.ensure(keys);
    expect(r.failed).toEqual([]);
    const a = heAdapter.analyze(heAdapter.tokenize(sentence));
    expect(a[0].candidates[0]?.notes?.period).toBe('he-mod');
    expect(a.find((x) => x.token.surface === 'בירושלים')?.candidates.length).toBeGreaterThan(0);
    // with the Biblical shards installed too (as the extension does), the unpointed sentence still reads as Modern: a consonant-only
    // Biblical match weighs less than the Modern reading, whichever word is tapped first
    const biblical = await createHebrewShardLoader(real, { base: 'lexicon/he/biblical' });
    await biblical.ensure(keys);
    for (const surface of ['בירושלים', 'הספר', 'אני']) {
      const s2 = 'אני גר בירושלים ואתה גר בחיפה. הספר החדש של הסופרת יצא השבוע.';
      await modern.ensure(heAdapter.tokenize(s2).filter((t) => t.isWord).map((t) => t.normalized));
      await biblical.ensure(heAdapter.tokenize(s2).filter((t) => t.isWord).map((t) => t.normalized));
      const an = heAdapter.analyze(heAdapter.tokenize(s2));
      const w = an.find((x) => x.token.surface === surface);
      expect(w?.candidates[0]?.notes?.period, surface).toBe('he-mod');
    }
    const gen = 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃';
    const g = await biblical.ensure(heAdapter.tokenize(gen).filter((t) => t.isWord).map((t) => t.normalized));
    expect(g.failed).toEqual([]);
    expect(heAdapter.analyze(heAdapter.tokenize(gen)).filter((x) => x.token.isWord).every((x) => x.candidates.length > 0)).toBe(true);
  });
});
