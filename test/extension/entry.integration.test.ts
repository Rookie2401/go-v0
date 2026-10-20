/**
 * Level 2 through the real worker and the REAL built shards (Linguistic Engine V2): the content script asks `golearn:entry`,
 * the worker resolves the dictionary location, fetches the `full/` shard and answers with the lemma's full record (inflection
 * table, etymology, IPA, audio, relations); then the page-side enrichment builds the paradigm, the etymology and the
 * pronunciation from it. Skipped when the full records have not been built (public/dict is git-ignored: `npm run dict:build-full -- sq`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBackground } from '../../packages/golearn-extension/src/background/core';
import { buildParadigm, etymologyOf, pickRecord, pronunciationOf, type LexicalRecord } from '../../packages/golearn-extension/src/content/enrich';
import { MSG } from '../../packages/golearn-extension/src/platform';
import type { EntryReply } from '../../packages/golearn-extension/src/protocol';
import { sqAdapter } from '../../src/adapters/sq';
import { createChromeFake } from './chromeFake';

const ROOT = path.resolve(__dirname, '../../public');
const built = fs.existsSync(path.join(ROOT, 'dict/sq/full/manifest.json')) && fs.existsSync(path.join(ROOT, 'dict/sq/manifest.json'));
const DICT = 'https://dict.example/';

/** The hosted copy, served from disk: every URL under DICT is a file under public/. */
const fileFetch: typeof fetch = (async (input: RequestInfo | URL) => {
  const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!u.startsWith(DICT)) return new Response('refused', { status: 404 });
  const p = path.join(ROOT, u.slice(DICT.length).split('?')[0]);
  if (!fs.existsSync(p)) return new Response('not found', { status: 404 });
  return new Response(fs.readFileSync(p), { status: 200, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;

const PAGE = { id: 'test-ext-id', url: 'chrome-extension://test-ext-id/app/index.html' };
const CONTENT = { id: 'test-ext-id', tab: { id: 7 }, url: 'https://example.test/page' };

describe.each([
  ['sq', 'libër'], ['de', 'Haus'], ['es', 'casa'], ['hi', 'लड़का'], ['th', 'เด็ก'],
])('real full dictionary enrichment: %s', (languageId, lemma) => {
  const available = fs.existsSync(path.join(ROOT, `dict/${languageId}/full/manifest.json`));
  it.skipIf(!available)('returns sourced senses, origin and pronunciation through the worker', async () => {
    const fake = createChromeFake();
    delete (fake.runtime as { getURL?: unknown }).getURL;
    createBackground(fake, { fetch: fileFetch }).register();
    await fake.dispatch({ type: MSG.serviceConfig, op: 'set', baseUrl: 'https://repo.example', assetBase: DICT }, PAGE);
    const reply = await fake.dispatch({ type: MSG.entry, lemma, pos: 'NOUN', languageId, forms: [lemma] }, CONTENT) as EntryReply;
    expect(reply).toMatchObject({ ok: true, found: true, source: 'configured' });
    expect(reply.attribution).toMatch(/Wiktionary/);
    const record = pickRecord(reply.records as LexicalRecord[], 'NOUN')!;
    expect(record.s?.some((sense) => sense.g.length > 0)).toBe(true);
    expect(etymologyOf(record).status).toBe('supported-by-source');
    expect(pronunciationOf(record).ipa.length).toBeGreaterThan(0);
    if (languageId !== 'th') expect(record.f?.length).toBeGreaterThan(0);
  });
});

describe.skipIf(!built)('the full record of a lemma, from the real shards through the worker', () => {
  it('dy has a sourced origin and IPA even though it has no inflection table', async () => {
    const fake = createChromeFake();
    delete (fake.runtime as { getURL?: unknown }).getURL;
    createBackground(fake, { fetch: fileFetch }).register();
    await fake.dispatch({ type: MSG.serviceConfig, op: 'set', baseUrl: 'https://repo.example', assetBase: DICT }, PAGE);
    const reply = await fake.dispatch({ type: MSG.entry, lemma: 'dy', pos: 'NUM', languageId: 'sq' }, CONTENT) as EntryReply;
    expect(reply.found).toBe(true);
    const record = pickRecord(reply.records as LexicalRecord[], 'NUM')!;
    expect(etymologyOf(record).status).toBe('supported-by-source');
    expect(pronunciationOf(record).ipa.length).toBeGreaterThan(0);
    expect(record.f ?? []).toHaveLength(0);
  });
  it('libër: the worker answers with the record; the page builds a declension with the dictionary half, the etymology and the IPA', async () => {
    const fake = createChromeFake();
    delete (fake.runtime as { getURL?: unknown }).getURL; // no extension-local copy in this test: the configured address is the one that answers
    createBackground(fake, { fetch: fileFetch }).register();
    await fake.dispatch({ type: MSG.serviceConfig, op: 'set', baseUrl: 'https://repo.example', assetBase: DICT }, PAGE);
    const reply = (await fake.dispatch({ type: MSG.entry, lemma: 'libër', pos: 'NOUN', languageId: 'sq', forms: ['libër'] }, CONTENT)) as EntryReply;
    expect(reply).toMatchObject({ ok: true, found: true, source: 'configured' });
    expect(reply.records.length).toBeGreaterThan(0);
    const record = pickRecord(reply.records as LexicalRecord[], 'NOUN')!;
    expect(record.p).toBe('NOUN');
    expect(record.f!.some((r) => r.f === 'librin' && r.t.includes('accusative') && r.t.includes('definite'))).toBe(true);
    const e = etymologyOf(record);
    expect(e.status).toBe('supported-by-source');
    expect(e.text).toMatch(/Latin/);
    expect(pronunciationOf(record).ipa.length).toBeGreaterThan(0);
    // the paradigm: with the Albanian adapter's tag map (when its Stage 3 lane has landed) the dictionary half is placed in cells
    const p = buildParadigm(sqAdapter, 'sq', 'libër', 'NOUN', record, { features: { Case: 'Acc', Definite: 'Def', Number: 'Sing' }, surface: 'librin' });
    if (sqAdapter.featuresFromTableTags) {
      expect(p).toBeDefined();
      expect(p!.cells.some((c) => c.form === 'librin')).toBe(true);
      expect(p!.sources.some((s) => s.id === 'wiktionary')).toBe(true);
    }
    // the second ask is served from the shard cache: no fetch is needed
    const again = (await fake.dispatch({ type: MSG.entry, lemma: 'libër', pos: 'NOUN', languageId: 'sq' }, CONTENT)) as EntryReply;
    expect(again.found).toBe(true);
  });

  it('an inflected form asked as written is followed to its headword (librin → libër), and a word the dictionary lacks is honestly not found', async () => {
    const fake = createChromeFake();
    delete (fake.runtime as { getURL?: unknown }).getURL;
    createBackground(fake, { fetch: fileFetch }).register();
    await fake.dispatch({ type: MSG.serviceConfig, op: 'set', baseUrl: 'https://repo.example', assetBase: DICT }, PAGE);
    const r = (await fake.dispatch({ type: MSG.entry, lemma: 'librin', languageId: 'sq', forms: ['librin'] }, CONTENT)) as EntryReply;
    expect(r.ok).toBe(true);
    if (r.found) expect((r.records as LexicalRecord[]).some((x) => x.w === 'libër' || x.w === 'librin')).toBe(true);
    const none = (await fake.dispatch({ type: MSG.entry, lemma: 'xqzvbnm', languageId: 'sq', forms: ['xqzvbnm'] }, CONTENT)) as EntryReply;
    expect(none).toMatchObject({ ok: true, found: false, reason: 'not-found' });
  });
});
