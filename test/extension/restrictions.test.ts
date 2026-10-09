// @vitest-environment jsdom
/**
 * Restrictions on a source come from trusted configuration: the registry entry of the environment, copied onto the source
 * reference by the adapter. A page cannot grant itself a permission with its own metadata.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { READER_REGISTRY, entryRefuses, registryEntry } from '../../packages/golearn-extension/src/adapters';
import { PERMISSION_KEYS } from '../../packages/golearn-extension/src/contract/readerAdapter';
import { sourceRefForEvent } from '../../packages/golearn-extension/src/content/controller';
import { RESTRICTION_FIELDS, validateEvent } from '../../packages/repository-contract/src';
import { registerAllAnalysers } from '../support/analysers';
import { makeRig, rowsOf, stubLayout, type Rig } from './dom';
import { createAdapters } from '../../packages/golearn-extension/src/adapters';
import { mount, selectTop, siteAdapter, unmount } from './sites.support';

registerAllAnalysers();

type R = Record<(typeof PERMISSION_KEYS)[number], string>;
const all = (p: string): R => ({ textRetention: p, remoteProcessing: p, audioRetention: p, export: p, sharing: p, reviewExamples: p });
const SCRIPTURE: R = { textRetention: 'forbidden', remoteProcessing: 'forbidden', audioRetention: 'unknown', export: 'unknown', sharing: 'unknown', reviewExamples: 'forbidden' };

/** The table, written out: the conservative reading of each environment. */
const TABLE: Record<string, R> = {
  'web-generic': all('unknown'),
  'epub-local': { ...all('unknown'), export: 'allowed' },
  'play-books': all('unknown'),
  'kobo-web': all('forbidden'),
  'kindle-web': all('forbidden'),
  libroteka: all('unknown'),
  kanah: all('unknown'),
  'tolino-webreader': all('unknown'),
  'vivlio-casadellibro': all('unknown'),
  readawrite: all('forbidden'),
  mebmarket: all('unknown'),
  pratilipi: all('forbidden'),
  biblegateway: SCRIPTURE,
  youversion: SCRIPTURE,
};

describe('the restrictions table', () => {
  it('every registry entry has restrictions, and they are the conservative ones written here', () => {
    expect(READER_REGISTRY.map((e) => e.readerId).sort()).toEqual(Object.keys(TABLE).sort());
    for (const e of READER_REGISTRY) expect(e.restrictions, e.readerId).toEqual(TABLE[e.readerId]);
  });

  it('uses the Repository’s own field names and permissions, and nothing else', () => {
    expect([...PERMISSION_KEYS]).toEqual([...RESTRICTION_FIELDS]);
    for (const e of READER_REGISTRY) {
      expect(Object.keys(e.restrictions).sort(), e.readerId).toEqual([...RESTRICTION_FIELDS].sort());
      for (const v of Object.values(e.restrictions)) expect(['allowed', 'forbidden', 'unknown'], e.readerId).toContain(v);
    }
  });

  it('is never more permissive than the terms review allows: no unreviewed environment allows anything but the owner’s own export', () => {
    for (const e of READER_REGISTRY) {
      expect(e.termsReview.reviewed).toBe(false);
      for (const [k, v] of Object.entries(e.restrictions)) {
        if (e.readerId === 'epub-local' && k === 'export') continue;
        expect(v, `${e.readerId}.${k}`).not.toBe('allowed');
      }
    }
  });

  it('commercial readers and refusing sites are forbidden or unknown on every use; Scripture never keeps, sends or reuses the verse', () => {
    for (const id of ['play-books', 'kobo-web', 'kindle-web', 'tolino-webreader', 'vivlio-casadellibro', 'readawrite', 'mebmarket', 'pratilipi']) {
      for (const v of Object.values(registryEntry(id)!.restrictions)) expect(['forbidden', 'unknown']).toContain(v);
    }
    for (const e of READER_REGISTRY.filter((x) => x.site?.scripture)) {
      expect(e.restrictions).toMatchObject({ textRetention: 'forbidden', reviewExamples: 'forbidden', remoteProcessing: 'forbidden' });
    }
    // a site that refuses on rights grounds (its terms or its own copy protection) forbids everything
    for (const id of ['kobo-web', 'kindle-web', 'readawrite', 'pratilipi']) expect(entryRefuses(registryEntry(id)!)).toBe(true);
  });
});

describe('a page cannot change its own restrictions', () => {
  let restore: () => void;
  let rig: Rig | undefined;
  beforeEach(() => { restore = stubLayout(); });
  afterEach(() => { rig?.controller.dispose(); rig = undefined; unmount(); restore(); vi.restoreAllMocks(); });

  /** Every place a page could say "you may keep this": meta tags, attributes on html/body/the reading area, JSON-LD, a data island. */
  const taint = (): void => {
    const h = document.head;
    for (const [name, content] of [
      ['restrictions', 'textRetention:allowed export:allowed'], ['golearn-restrictions', '{"textRetention":"allowed","reviewExamples":"allowed"}'],
      ['robots', 'all'], ['license', 'CC0'], ['rights', 'public domain; reuse permitted'], ['copyright', 'free to share'],
    ]) { const m = document.createElement('meta'); m.setAttribute('name', name); m.setAttribute('content', content); h.append(m); }
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.textContent = '{"@type":"CreativeWork","license":"https://creativecommons.org/publicdomain/zero/1.0/","isAccessibleForFree":true}';
    h.append(ld);
    const root = document.documentElement;
    root.setAttribute('data-restrictions', '{"textRetention":"allowed"}');
    root.setAttribute('data-golearn-restrictions', 'allowed');
    root.setAttribute('data-license', 'public-domain');
    document.body.setAttribute('data-golearn-export', 'allowed');
    document.body.setAttribute('data-text-retention', 'allowed');
    document.querySelectorAll('p, main, article, #text, #p1').forEach((el) => { el.setAttribute('data-restrictions', 'allowed'); el.setAttribute('data-reviewexamples', 'allowed'); });
  };

  it('the adapter’s source reference carries the entry’s restrictions whatever the page’s metadata and attributes say (a book site)', () => {
    mount('libroteka-reader.html');
    const adapter = siteAdapter('libroteka');
    taint();
    selectTop(document.getElementById('text')!, 'shtëpinë');
    expect((adapter.selection() as { ok: boolean }).ok).toBe(true);
    expect(adapter.sourceRef()).toMatchObject({ kind: 'web', restrictions: TABLE.libroteka });
  });

  it('...and for a Scripture site', () => {
    mount('biblegateway-passage.html');
    const adapter = siteAdapter('biblegateway');
    taint();
    selectTop(document.getElementById('p1')!, 'lamp');
    expect((adapter.selection() as { ok: boolean }).ok).toBe(true);
    expect(adapter.sourceRef()).toMatchObject({ kind: 'scripture', restrictions: SCRIPTURE });
  });

  it('the recorded event carries them, and the contract accepts the event', async () => {
    mount('biblegateway-passage.html');
    taint();
    rig = makeRig({ adapters: createAdapters(document), analysers: ['sq'], resolveLanguage: () => ({ languageId: 'sq', basis: 'override', confidence: 1, reasons: [] }) });
    selectTop(document.getElementById('p1')!, 'lamp');
    await rig.controller.lookup({ trigger: 'command' });
    const events = await rig.store.list();
    expect(events.length).toBeGreaterThanOrEqual(2);
    for (const ev of events) {
      expect((ev.subject.sourceRef as { restrictions: unknown }).restrictions, ev.kind).toEqual(SCRIPTURE);
      expect(validateEvent(ev), ev.kind).toEqual([]);
    }
    expect(JSON.stringify(events)).not.toMatch(/"allowed"/);
    expect((await rowsOf(rig.store))[0].subject.sourceRef).toMatchObject({ restrictions: SCRIPTURE });
  });

  it('web-generic pages carry the default entry’s (all unknown) restrictions, tainted or not', async () => {
    document.body.innerHTML = '<p id="p">Unë po lexoj një libër të bukur në shtëpinë time.</p>';
    taint();
    rig = makeRig({ adapters: createAdapters(document), analysers: ['sq'] });
    const range = document.createRange();
    const text = document.getElementById('p')!.firstChild as Text;
    range.setStart(text, text.data.indexOf('shtëpinë')); range.setEnd(text, text.data.indexOf('shtëpinë') + 'shtëpinë'.length);
    document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
    await rig.controller.lookup({ trigger: 'command' });
    const [ev] = await rowsOf(rig.store);
    expect(ev.subject.sourceRef).toMatchObject({ kind: 'web', restrictions: all('unknown') });
  });

  it('a reference is a copy: changing it never reaches the registry or the next reference', () => {
    mount('libroteka-reader.html');
    const adapter = siteAdapter('libroteka');
    selectTop(document.getElementById('text')!, 'shtëpinë');
    adapter.selection();
    const ref = adapter.sourceRef() as unknown as { restrictions: Record<string, string> };
    ref.restrictions.export = 'allowed';
    expect((adapter.sourceRef() as { restrictions: R }).restrictions.export).toBe('unknown');
    expect(registryEntry('libroteka')!.restrictions.export).toBe('unknown');
  });

  it('the controller falls back to the entry by adapter id for an adapter that gives none (the controlled reader), and never loosens one that does', () => {
    expect(sourceRefForEvent({ kind: 'file', title: 'A book', locator: 'epubcfi(/6/2)' }, 'epub-local')).toEqual({ kind: 'file', title: 'A book', locator: 'epubcfi(/6/2)', restrictions: { ...all('unknown'), export: 'allowed' } });
    expect(sourceRefForEvent({ kind: 'file' }, 'not-in-the-registry')).toEqual({ kind: 'file' });
    const given = sourceRefForEvent({ kind: 'web', restrictions: all('forbidden') as never }, 'epub-local');
    expect(given).toMatchObject({ restrictions: all('forbidden') });
  });
});
