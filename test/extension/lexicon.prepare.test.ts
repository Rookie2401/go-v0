// @vitest-environment node
/**
 * The content script's lexicon preparer (src/lexicon/prepare.ts): before a Hebrew or Greek lookup it fetches the shards the sentence's
 * words live in, from the extension's own files (chrome.runtime.getURL) or, on a harness page, from /dist/lexicon on the page's origin;
 * a set that is not in the build is reported once and the compiled core carries the lookup.
 */
import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { elAdapter } from '../../src/adapters/el';
import { resetGreekIndexes, installedGreekIndexes } from '../../src/adapters/greek/index-store';
import { resetHebrewIndexes } from '../../src/adapters/hebrew/index-store';
import { createLexiconPreparer, lexiconUrl } from '../../packages/golearn-extension/src/lexicon/prepare';
import { registerAllAnalysers } from '../support/analysers';

registerAllAnalysers();
afterEach(() => { resetGreekIndexes((id) => id === 'morphgnt-sblgnt-core'); resetHebrewIndexes((id) => id === 'oshb-tanakh-core'); });

describe('where the files are read from', () => {
  it('the extension gives its own URL; a harness page reads /dist/lexicon on its origin', () => {
    expect(lexiconUrl({ runtime: { getURL: (p) => `chrome-extension://abc/${p}` } }, undefined, 'el/ancient/manifest.json')).toBe('chrome-extension://abc/lexicon/el/ancient/manifest.json');
    expect(lexiconUrl(undefined, 'http://127.0.0.1:5196/harness/active-el.html', 'el/ancient/manifest.json')).toBe('http://127.0.0.1:5196/dist/lexicon/el/ancient/manifest.json');
  });
});

describe('preparing a lookup', () => {
  it('a build without the sets reports them unavailable once and the lookup goes on with the core', async () => {
    const fetcher = (async () => new Response('not found', { status: 404 })) as unknown as typeof fetch;
    const prep = createLexiconPreparer({ runtime: { getURL: (p) => `chrome-extension://abc/${p}` } }, fetcher);
    const r = await prep.prepare('el', 'Ἐν ἀρχῇ ἦν ὁ λόγος');
    expect(r.sets).toEqual([]);
    expect(r.failed.sort()).toEqual(['el/ancient', 'el/modern']);
    expect(prep.unavailable().sort()).toEqual(['el/ancient', 'el/modern']);
    const again = await prep.prepare('el', 'λόγος');
    expect(again.failed.sort()).toEqual(['el/ancient', 'el/modern']); // remembered, not re-fetched
    expect(await prep.prepare('sq', 'libër')).toEqual({ sets: [], failed: [] }); // a language with no sharded index
  });

  const built = ['el/ancient', 'el/modern', 'he/biblical', 'he/modern'].every((s) => fs.existsSync(`public/lexicon/${s}/manifest.json`));
  it.skipIf(!built)('over the real shards: a Greek sentence gets its Ancient and Modern shards, and λόγος then has an Attic reading', async () => {
    const fetcher = (async (url: string | URL | Request) => { const p = String(url).replace('chrome-extension://abc/lexicon/', 'public/lexicon/'); if (!fs.existsSync(p)) return new Response('', { status: 404 }); return new Response(fs.readFileSync(p)); }) as unknown as typeof fetch;
    const prep = createLexiconPreparer({ runtime: { getURL: (p) => `chrome-extension://abc/${p}` } }, fetcher);
    const r = await prep.prepare('el', 'Ἐν ἀρχῇ ἦν ὁ λόγος, καὶ ὁ λόγος ἦν πρὸς τὸν θεόν.');
    expect(r.failed).toEqual([]);
    expect(r.sets.sort()).toEqual(['el/ancient', 'el/modern']);
    expect(installedGreekIndexes().some((i) => i.id === 'kaikki-grc-tables')).toBe(true);
    expect(installedGreekIndexes().some((i) => i.id === 'kaikki-el-tables')).toBe(true);
    const v = elAdapter.variants?.('λόγος', 'NOUN', 'λόγος');
    expect(v?.rows.find((row) => row.varietyId === 'el-att')?.status).toBe('attested');
    expect(v?.rows.find((row) => row.varietyId === 'el-mod')?.status).toBe('attested');
    // a monotonic Modern sentence now reads as Modern
    const m = await prep.prepare('el', 'Ο λόγος είναι ελεύθερος και οι άνθρωποι γράφουν βιβλία.');
    expect(m.failed).toEqual([]);
    const a = elAdapter.analyze(elAdapter.tokenize('Ο λόγος είναι ελεύθερος και οι άνθρωποι γράφουν βιβλία.'));
    expect(a[1].candidates[0]?.notes?.period).toBe('el-mod');
  });
});
