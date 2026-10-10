// @vitest-environment jsdom
/**
 * Lazy analysers. The parser is synchronous and reads a language with whatever the registry holds; Albanian is registered by the
 * parser itself, every other analyser is a chunk the content script loads on demand (content/index.ts, analysers/urlLoader.ts).
 *
 *   - the registry: what can be loaded, what is loaded, an unknown language is refused
 *   - `parseSelection`: a known-but-unloaded language throws AnalyserNotLoaded; an unknown one a RangeError; Albanian needs no load
 *   - the controller: resolves the language, loads the analyser (telling the learner), records analyserLoadMs, then parses;
 *     a failed load is an honest message and records nothing; Albanian is never loaded
 *   - the loader's addresses (the extension's file, or dist/analysers/ beside a harness page)
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deAdapter } from '../../src/adapters/de';
import { nbAdapter } from '../../src/adapters/nb';
import { nnAdapter } from '../../src/adapters/nn';
import { loadAnalyser } from '../../packages/golearn-extension/src/analysers/loaders';
import { analyserUrl, createAnalyserLoader } from '../../packages/golearn-extension/src/analysers/urlLoader';
import { createAdapters } from '../../packages/golearn-extension/src/adapters';
import {
  AnalyserNotLoaded, PARSER_LANGUAGES, clearAnalysers, getAnalyser, hasAnalyser, parseSelection, parserAdapter, registerAnalyser,
} from '../../packages/golearn-extension/src/parser';
import { flush, makeRig, setBody, selectText, stubLayout, type Rig } from './dom';
import { registerAllAnalysers } from '../support/analysers';

const GERMAN = 'Ich lese das Buch im Wohnzimmer.';
const ALBANIAN = 'Unë po lexoj një libër të bukur në shtëpinë time.';

let restore: () => void;
let rig: Rig | undefined;
beforeEach(() => { restore = stubLayout(); clearAnalysers(['sq']); });
afterEach(() => { rig?.controller.dispose(); rig = undefined; document.body.innerHTML = ''; restore(); vi.restoreAllMocks(); });
afterAll(() => { registerAllAnalysers(); }); // leave the registry as the other suites in this worker expect it

describe('the analyser registry', () => {
  it('lists the languages that CAN be loaded, and only Albanian is loaded at import', () => {
    expect([...PARSER_LANGUAGES]).toEqual(['sq', 'es', 'de', 'hi', 'th', 'nb', 'nn']);
    expect(hasAnalyser('sq')).toBe(true);
    for (const l of ['es', 'de', 'hi', 'th', 'nb', 'nn']) expect(hasAnalyser(l), l).toBe(false);
    expect(parserAdapter('de')).toBeUndefined();
  });

  it('registerAnalyser makes a language loaded; an unknown language is refused', () => {
    registerAnalyser('de', deAdapter);
    expect(hasAnalyser('de')).toBe(true);
    expect(getAnalyser('de')).toBe(deAdapter);
    expect(() => registerAnalyser('sv', deAdapter)).toThrow(RangeError);
    expect(hasAnalyser('sv')).toBe(false);
    expect(hasAnalyser('constructor')).toBe(false);
  });

  it('Norwegian Bokmål and Nynorsk are loadable analysers of their own: registering one never makes the other available', () => {
    registerAnalyser('nb', nbAdapter);
    expect(hasAnalyser('nb')).toBe(true);
    expect(hasAnalyser('nn')).toBe(false);
    expect(parserAdapter('nb')).toBe(nbAdapter);
    expect(parserAdapter('nn')).toBeUndefined();
    registerAnalyser('nn', nnAdapter);
    expect(getAnalyser('nn')).toBe(nnAdapter);
  });

  it('the on-demand loader (setup app, tests) has an entry for each of the seven and registers the adapter it imports', async () => {
    for (const [id, adapter] of [['nb', nbAdapter], ['nn', nnAdapter], ['de', deAdapter]] as const) {
      expect(await loadAnalyser(id), id).toBe(adapter);
      expect(getAnalyser(id), id).toBe(adapter);
    }
    expect(await loadAnalyser('sv')).toBeUndefined();
  });
});

describe('parseSelection and a language that is not loaded', () => {
  it('throws AnalyserNotLoaded for a known language, with its name; a RangeError for an unknown one', () => {
    let err: unknown;
    try { parseSelection({ surface: 'Buch', context: { kind: 'none', confidence: 0 }, languageId: 'de' }); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(AnalyserNotLoaded);
    expect(err).toMatchObject({ languageId: 'de', name: 'AnalyserNotLoaded' });
    expect((err as Error).message).toMatch(/German analyser is not loaded/);
    expect(() => parseSelection({ surface: 'bok', context: { kind: 'none', confidence: 0 }, languageId: 'sv' })).toThrow(RangeError);
    for (const [id, name] of [['nb', 'Norwegian (Bokmål)'], ['nn', 'Norwegian (Nynorsk)']] as const) {
      expect(() => parseSelection({ surface: 'bok', context: { kind: 'none', confidence: 0 }, languageId: id }), id).toThrow(AnalyserNotLoaded);
      expect(() => parseSelection({ surface: 'bok', context: { kind: 'none', confidence: 0 }, languageId: id }), id).toThrow(new RegExp(`${name.replace(/[()]/g, '\\$&')} analyser is not loaded`));
    }
  });

  it('reads the language once it is registered, and Albanian without any load', () => {
    expect(parseSelection({ surface: 'libër', context: { kind: 'none', confidence: 0 } })).toMatchObject({ languageId: 'sq', lemma: 'libër' });
    registerAnalyser('de', deAdapter);
    expect(parseSelection({ surface: 'Buch', context: { kind: 'none', confidence: 0 }, languageId: 'de' })).toMatchObject({ languageId: 'de', packId: `pack:de:${deAdapter.version}` });
  });
});

describe('the controller loads the analyser, then parses', () => {
  const build = (over: Parameters<typeof makeRig>[0] = {}): Rig => {
    rig = makeRig({ adapters: createAdapters(document), analysers: ['sq', 'de'], hasAnalyser, ...over });
    return rig;
  };
  const select = (text: string, word: string): void => {
    setBody(`<p id="p" lang="de">${text}</p>`);
    selectText(document.getElementById('p')!, word);
  };

  it('German: the language is resolved first, the learner is told, the analyser is loaded once, the card follows and the metrics row carries analyserLoadMs', async () => {
    const loadAnalyser = vi.fn(async (id: string) => { await flush(5); if (id === 'de') registerAnalyser('de', deAdapter); });
    const r = build({ loadAnalyser });
    const shown: string[] = [];
    const show = r.ui.showMessage.bind(r.ui);
    vi.spyOn(r.ui, 'showMessage').mockImplementation((m, a, k) => { shown.push(m); return show(m, a, k); });
    select(GERMAN, 'Wohnzimmer');
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(out.status).toBe('shown');
    if (out.status !== 'shown') return;
    expect(out.card).toMatchObject({ languageId: 'de', lemma: 'Wohnzimmer' });
    expect(out.card.language).toMatchObject({ languageId: 'de', basis: 'document-metadata' });
    expect(loadAnalyser).toHaveBeenCalledTimes(1);
    expect(loadAnalyser).toHaveBeenCalledWith('de');
    expect(shown).toEqual(['Loading the German analyser…']);
    const rows = await r.metrics.list();
    expect(rows).toHaveLength(1);
    expect(rows[0].analyserLoadMs).toBeGreaterThanOrEqual(0);
    expect(typeof rows[0].analyserLoadMs).toBe('number');
    expect(rows[0].outcome).toBe('shown');

    // a second lookup in the same language: already in memory, no load, no message, no analyserLoadMs
    select(GERMAN, 'Buch');
    const again = await r.controller.lookup({ trigger: 'command' });
    expect(again.status).toBe('shown');
    expect(loadAnalyser).toHaveBeenCalledTimes(1);
    expect(shown).toHaveLength(1);
    const all = await r.metrics.list();
    expect(all).toHaveLength(2);
    expect(all.filter((x) => x.analyserLoadMs !== undefined)).toHaveLength(1);
  });

  it('a failed load is an honest message: no guess, no card, no event, a failed metrics row', async () => {
    const loadAnalyser = vi.fn(async () => { throw new TypeError('Failed to fetch dynamically imported module'); });
    const r = build({ loadAnalyser });
    select(GERMAN, 'Wohnzimmer');
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(out.status).toBe('message');
    if (out.status !== 'message') return;
    expect(out.reason).toBe('analyser-load-failed');
    expect(out.message).toMatch(/could not load the German analyser/);
    expect(out.message).toMatch(/will not guess/);
    expect(hasAnalyser('de')).toBe(false);
    expect((await r.store.list())).toHaveLength(0);
    const rows = await r.metrics.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: 'failed', failure: 'analyser-load-failed' });
    expect(rows[0].analyserLoadMs).toBeGreaterThanOrEqual(0);
    // the next lookup tries again
    await r.controller.lookup({ trigger: 'command' });
    expect(loadAnalyser).toHaveBeenCalledTimes(2);
  });

  it('a load that resolves without registering the analyser is a failed load too, never a parse that throws into the page', async () => {
    const r = build({ loadAnalyser: async () => undefined });
    select(GERMAN, 'Wohnzimmer');
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(out).toMatchObject({ status: 'message', reason: 'analyser-load-failed' });
  });

  it('Albanian needs no load: the port is never called and the row has no analyserLoadMs', async () => {
    const loadAnalyser = vi.fn(async () => undefined);
    const r = build({ loadAnalyser });
    setBody(`<p id="p" lang="sq">${ALBANIAN}</p>`);
    selectText(document.getElementById('p')!, 'shtëpinë');
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(out.status).toBe('shown');
    expect(loadAnalyser).not.toHaveBeenCalled();
    expect((await r.metrics.list())[0].analyserLoadMs).toBeUndefined();
  });

  it('without a load port (every analyser linked in) nothing is loaded and the card is shown', async () => {
    registerAnalyser('de', deAdapter);
    const r = build({ hasAnalyser: undefined });
    select(GERMAN, 'Wohnzimmer');
    expect((await r.controller.lookup({ trigger: 'command' })).status).toBe('shown');
  });

  it('the gloss request carries the dictionary forms the loaded analyser worked out (the worker has no German analyser)', async () => {
    registerAnalyser('de', deAdapter);
    const gloss = vi.fn(async () => undefined);
    const services = { status: vi.fn(async () => undefined), profile: vi.fn(async () => undefined), gloss, explain: vi.fn(async () => undefined), correct: vi.fn(async () => undefined), pronounceInfo: vi.fn(async () => undefined) };
    const r = build({
      services, hasAnalyser,
      glossForms: (lemma, _pos, id) => { const a = getAnalyser(id)!; return [a.normalize(lemma)]; },
    });
    select(GERMAN, 'Wohnzimmer');
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(out.status).toBe('shown');
    if (out.status === 'shown') await out.settled;
    expect(gloss).toHaveBeenCalledWith(expect.objectContaining({ lemma: 'Wohnzimmer', languageId: 'de', forms: ['wohnzimmer'] }));
  });

  it('detection loads the word lists it needs and asks the resolver again (no declared language, three or more words)', async () => {
    const loaded: string[] = [];
    const loadAnalyser = vi.fn(async (id: string) => { loaded.push(id); if (id === 'de') registerAnalyser('de', deAdapter); });
    const { createLanguageResolver } = await import('../../packages/golearn-extension/src/language/resolve');
    const r = build({ loadAnalyser, resolveLanguage: createLanguageResolver() });
    setBody(`<p id="p">${GERMAN}</p>`);
    selectText(document.getElementById('p')!, GERMAN);
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(loaded).toContain('de');
    expect(out.status === 'shown' || out.status === 'message').toBe(true);
    if (out.status === 'shown') expect(out.card.language?.basis).toMatch(/detection|team-default/);
  });
});

describe('where an analyser chunk is read from', () => {
  it('in the extension: the extension\'s own analysers/<id>.js', () => {
    const api = { runtime: { getURL: (p: string) => `chrome-extension://abc/${p}` } };
    expect(analyserUrl(api, 'https://example.org/page', 'th')).toBe('chrome-extension://abc/analysers/th.js');
  });

  it('on a harness page (no chrome.runtime): /dist/analysers/<id>.js of the page\'s origin', () => {
    expect(analyserUrl(undefined, 'http://localhost:5199/packages/golearn-extension/harness/index.html', 'hi')).toBe('http://localhost:5199/dist/analysers/hi.js');
  });

  it('a loader that cannot read the chunk rejects, remembers nothing, and tries again next time', async () => {
    const getURL = vi.fn((p: string) => `chrome-extension://missing/${p}`);
    const load = createAnalyserLoader({ runtime: { getURL } }, 'https://example.org/');
    await expect(load('de')).rejects.toBeTruthy();
    await expect(load('de')).rejects.toBeTruthy();
    expect(getURL).toHaveBeenCalledTimes(2);
    expect(hasAnalyser('de')).toBe(false);
    await expect(createAnalyserLoader(undefined, 'https://example.org/')('sq')).resolves.toBeUndefined(); // Albanian: already in memory
  });
});
