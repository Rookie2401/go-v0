// @vitest-environment jsdom
/**
 * The harness fixture hook (`<html data-fixture-url>`, src/adapters/page.ts). It exists only in the HARNESS BUILD
 * (`__GOLEARN_HARNESS__` true; dist/content.harness.js). Here the flag is set on the global the way the build's define sets it.
 *
 *   - off (the default, and every production build): the attribute is ignored on any host;
 *   - on, on a host that is not loopback: ignored;
 *   - on, on a loopback host: it chooses which registry entry MATCHES the page, and nothing else. The refusal of a blocked,
 *     permission-required or switched-off entry does not depend on matching, and an address can never change an entry's
 *     `enabled`, `status`, `termsReview` or `restrictions` (the registry is frozen).
 * The production bundle having no such branch at all is asserted in bundle.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  READER_REGISTRY, SiteAdapter, chooseAdapter, createAdapters, describePage, entryRefuses, registryEntry, type ReaderRegistryEntry,
} from '../../packages/golearn-extension/src/adapters';
import { makeRig, rowsOf, selectText, setBody, stubLayout, type Rig } from './dom';
import { resetUrl, setUrl } from './sites.support';
import { registerAllAnalysers } from '../support/analysers';

registerAllAnalysers();

const flag = globalThis as { __GOLEARN_HARNESS__?: boolean };
const FIXTURE = (url: string, extra = ''): void => {
  document.documentElement.setAttribute('data-fixture-url', url);
  setBody(`<main ${extra}><p id="p">Unë po lexoj një libër të bukur në shtëpinë time.</p></main>`);
};

let restore: () => void;
let rig: Rig | undefined;
beforeEach(() => { restore = stubLayout(); });
afterEach(() => {
  rig?.controller.dispose(); rig = undefined;
  delete flag.__GOLEARN_HARNESS__;
  document.documentElement.removeAttribute('data-fixture-url');
  document.documentElement.removeAttribute('data-fixture-status');
  setBody('');
  resetUrl();
  restore(); vi.restoreAllMocks();
});

describe('the hook is a harness-build feature', () => {
  it('with the flag off (the default; every production build) the attribute is ignored even on localhost', () => {
    setUrl('http://localhost:3000/reader');
    FIXTURE('https://www.biblegateway.com/passage/?search=John+3%3A16');
    expect(flag.__GOLEARN_HARNESS__).toBeUndefined();
    expect(describePage(document)).toMatchObject({ host: 'localhost:3000', pathname: '/reader' });
    expect(describePage(document).href).toBe('http://localhost:3000/reader');
  });

  it('with the flag on, a loopback host takes the fixture’s address', () => {
    flag.__GOLEARN_HARNESS__ = true;
    for (const home of ['http://localhost:3000/', 'http://127.0.0.1:4173/x']) {
      setUrl(home);
      FIXTURE('https://www.biblegateway.com/passage/?search=John+3%3A16');
      expect(describePage(document)).toMatchObject({ host: 'www.biblegateway.com', pathname: '/passage/' });
    }
  });

  it('with the flag on, a host that is not loopback ignores the attribute', () => {
    flag.__GOLEARN_HARNESS__ = true;
    for (const home of ['https://evil.example/page', 'https://localhost.evil.example/', 'http://127.0.0.1.evil.example/', 'https://example.org/']) {
      setUrl(home);
      FIXTURE('https://www.biblegateway.com/passage/?search=John+3%3A16');
      const page = describePage(document);
      expect(page.href, home).toBe(home);
      expect(chooseAdapter(page, createAdapters(document)).id, home).toBe('web-generic');
    }
  });

  it('with the flag on, an unparsable fixture address falls back to the real location', () => {
    flag.__GOLEARN_HARNESS__ = true;
    setUrl('http://localhost:3000/real');
    FIXTURE('not a url');
    expect(describePage(document).pathname).toBe('/real');
  });
});

describe('a fixture address chooses the entry and decides nothing about it', () => {
  const REFUSING = [
    ['kobo-web', 'https://read.kobo.com/reader'],
    ['kindle-web', 'https://read.amazon.com/'],
    ['readawrite', 'https://www.readawrite.com/c/0123456789abcdef0123456789abcdef'],
    ['pratilipi', 'https://hindi.pratilipi.com/read/story-1'],
    ['mebmarket', 'https://www.mebmarket.com/'],
  ] as const;

  it.each(REFUSING)('flag on, loopback, a fixture naming %s: the adapter is that entry’s and the lookup is refused, nothing is recorded', async (id, url) => {
    flag.__GOLEARN_HARNESS__ = true;
    setUrl('http://localhost:3000/');
    FIXTURE(url);
    const entry = registryEntry(id)!;
    expect(entryRefuses(entry)).toBe(true);
    rig = makeRig({ adapters: createAdapters(document) });
    expect(chooseAdapter(describePage(document), rig.deps.adapters).id).toBe(id);
    selectText(document.getElementById('p')!, 'shtëpinë');
    const out = await rig.controller.lookup({ trigger: 'command' });
    expect(out.status).toBe('message');
    if (out.status === 'message') expect(out.message).toBe(entry.refusal ?? 'GoLearn does not support this reader yet. It was not read.');
    expect(await rig.store.list()).toEqual([]);
  });

  it('the refusal does not depend on matching: an enabled entry whose status says refuse, and a status-fine entry that is switched off, both refuse', () => {
    const base = registryEntry('libroteka')!;
    for (const over of [{ status: 'blocked' }, { status: 'permission-required' }, { status: 'unsupported' }, { enabled: false }] as Array<Partial<ReaderRegistryEntry>>) {
      const entry: ReaderRegistryEntry = { ...base, ...over };
      expect(entryRefuses(entry), JSON.stringify(over)).toBe(true);
      setUrl('https://libroteka.al/liber/x/1');
      setBody('<p id="p">Unë po lexoj një libër të bukur në shtëpinë time.</p>');
      const adapter = new SiteAdapter({ doc: document, entry });
      expect(adapter.matches(describePage(document))).toBe(true); // it matches the page...
      expect(adapter.refuses).toBe(true); // ...and refuses all the same
      selectText(document.getElementById('p')!, 'shtëpinë');
      expect(adapter.selection()).toMatchObject({ ok: false, reason: 'unsupported' });
      expect(adapter.sourceRef()).toBeUndefined();
      expect(adapter.context(document.createRange())).toMatchObject({ kind: 'none', confidence: 0 });
    }
  });

  it('positive control: a fixture naming an enabled, unverified entry is read', async () => {
    flag.__GOLEARN_HARNESS__ = true;
    setUrl('http://localhost:3000/');
    FIXTURE('https://libroteka.al/liber/fixture/0');
    rig = makeRig({ adapters: createAdapters(document), analysers: ['sq'] });
    selectText(document.getElementById('p')!, 'shtëpinë');
    const out = await rig.controller.lookup({ trigger: 'command' });
    expect(out.status).toBe('shown');
    const [ev] = await rowsOf(rig.store);
    expect(ev.payload.readerId).toBe('libroteka');
  });

  it('no attribute, address or lookup changes an entry’s enabled flag, status, terms review or restrictions: the registry is deeply frozen', async () => {
    flag.__GOLEARN_HARNESS__ = true;
    const before = JSON.stringify(READER_REGISTRY);
    setUrl('http://localhost:3000/');
    FIXTURE('https://read.kobo.com/reader');
    document.documentElement.setAttribute('data-fixture-status', 'verified');
    document.documentElement.setAttribute('data-fixture-enabled', 'true');
    rig = makeRig({ adapters: createAdapters(document) });
    selectText(document.getElementById('p')!, 'shtëpinë');
    await rig.controller.lookup({ trigger: 'command' });
    expect(JSON.stringify(READER_REGISTRY)).toBe(before);

    const frozen = (v: unknown): boolean => {
      if (!v || typeof v !== 'object') return true;
      return Object.isFrozen(v) && Object.values(v as Record<string, unknown>).every(frozen);
    };
    expect(Object.isFrozen(READER_REGISTRY)).toBe(true);
    for (const e of READER_REGISTRY) expect(frozen(e), e.readerId).toBe(true);

    const kobo = registryEntry('kobo-web') as unknown as Record<string, unknown>;
    expect(() => { kobo.enabled = true; }).toThrow(TypeError);
    expect(() => { kobo.status = 'verified'; }).toThrow(TypeError);
    expect(() => { (kobo.termsReview as Record<string, unknown>).reviewed = true; }).toThrow(TypeError);
    expect(() => { (kobo.restrictions as Record<string, unknown>).export = 'allowed'; }).toThrow(TypeError);
    expect(() => { (READER_REGISTRY as unknown as unknown[]).push({}); }).toThrow(TypeError);
    expect(registryEntry('kobo-web')).toMatchObject({ enabled: false, status: 'permission-required', termsReview: { reviewed: false } });
    expect(registryEntry('kobo-web')!.restrictions).toEqual({ textRetention: 'forbidden', remoteProcessing: 'forbidden', audioRetention: 'forbidden', export: 'forbidden', sharing: 'forbidden', reviewExamples: 'forbidden' });
  });
});
