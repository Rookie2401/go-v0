// @vitest-environment jsdom
/**
 * Contract v3 on the lookup event: `SelectionLookedUp.payload.language` is the ONE resolution the controller made, recorded
 * as it was decided (basis, confidence, source, override === (basis === 'override')), the same as the card model carries and the
 * card host shows; and the Scripture source reference is the contract's `scripture` member (provider, translation language,
 * passage address, confidence from the adapter, the registry entry's restrictions).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdapters } from '../../packages/golearn-extension/src/adapters';
import { languagePayload } from '../../packages/golearn-extension/src/store';
import type { LanguageResolution } from '../../packages/golearn-extension/src/contract/language';
import { validateEvent } from '../../packages/repository-contract/src';
import { registerAllAnalysers } from '../support/analysers';
import { makeRig, rowsOf, selectText, setBody, stubLayout, type Rig } from './dom';
import { mount, selectTop, unmount } from './sites.support';

registerAllAnalysers();

const SENTENCE = 'Unë po lexoj një libër të bukur në shtëpinë time.';
let restore: () => void;
let rig: Rig | undefined;
beforeEach(() => { restore = stubLayout(); });
afterEach(() => { rig?.controller.dispose(); rig = undefined; unmount(); setBody(''); restore(); vi.restoreAllMocks(); });

const fixed = (r: Partial<LanguageResolution> & { basis: LanguageResolution['basis'] }): LanguageResolution => ({ confidence: 1, reasons: [], ...r });
const languageOf = (ev: { payload: Record<string, unknown> }) => ev.payload.language as Record<string, unknown>;

describe('payload.language is the resolution the controller made', () => {
  it('the enrolment’s language with nothing declared: team-default, override false, validated by the contract', async () => {
    setBody(`<p id="p">${SENTENCE}</p>`);
    rig = makeRig();
    selectText(document.getElementById('p')!, 'shtëpinë');
    const out = await rig.controller.lookup({ trigger: 'command' });
    expect(out.status).toBe('shown');
    const [ev] = await rowsOf(rig.store);
    expect(languageOf(ev)).toEqual({ languageId: 'sq', basis: 'team-default', confidence: 0.4, override: false });
    expect(validateEvent(ev)).toEqual([]);
  });

  it('the learner’s override: basis override, override true, confidence 1', async () => {
    setBody(`<p id="p">${SENTENCE}</p>`);
    rig = makeRig();
    selectText(document.getElementById('p')!, 'shtëpinë');
    const out = await rig.controller.lookup({ trigger: 'command', languageOverride: 'sq' });
    expect(out.status).toBe('shown');
    const [ev] = await rowsOf(rig.store);
    expect(languageOf(ev)).toEqual({ languageId: 'sq', basis: 'override', confidence: 1, override: true });
    expect(validateEvent(ev)).toEqual([]);
  });

  it('what the page declares: document-metadata with the declaration’s own label as the source', async () => {
    mount('libroteka-reader.html');
    rig = makeRig({ adapters: createAdapters(document), analysers: ['sq'] });
    selectTop(document.getElementById('text')!, 'shtëpinë');
    const out = await rig.controller.lookup({ trigger: 'command' });
    expect(out.status).toBe('shown');
    const [ev] = await rowsOf(rig.store);
    expect(languageOf(ev)).toMatchObject({ languageId: 'sq', basis: 'document-metadata', confidence: 0.8, source: 'html-lang', override: false });
    expect(validateEvent(ev)).toEqual([]);
  });

  it('every basis the resolver can give maps to override === (basis === "override"), and an undetermined one records nothing', () => {
    for (const basis of ['override', 'book-metadata', 'document-metadata', 'detection', 'team-default'] as const) {
      expect(languagePayload({ languageId: 'es', basis, confidence: 0.5 }, 'es')).toMatchObject({ basis, override: basis === 'override' });
    }
    expect(languagePayload({ basis: 'undetermined', confidence: 0 }, 'es')).toBeUndefined();
    expect(languagePayload(undefined, 'es')).toBeUndefined();
  });

  it('the language the controller resolved, the card model, the recorded payload and the card host are one and the same decision', async () => {
    mount('libroteka-reader.html');
    const resolved = fixed({ languageId: 'sq', varietyId: 'sq-standard', basis: 'book-metadata', confidence: 0.85 });
    rig = makeRig({ adapters: createAdapters(document), analysers: ['sq'], resolveLanguage: () => resolved });
    selectTop(document.getElementById('text')!, 'shtëpinë');
    const out = await rig.controller.lookup({ trigger: 'command' });
    expect(out.status).toBe('shown');
    if (out.status !== 'shown') return;
    const info = out.card.language!;
    const [ev] = await rowsOf(rig.store);
    const rec = languageOf(ev);
    expect({ languageId: rec.languageId, varietyId: rec.varietyId, basis: rec.basis, confidence: rec.confidence }).toEqual({ languageId: info.languageId, varietyId: info.varietyId, basis: info.basis, confidence: info.confidence });
    expect(rec.override).toBe(info.basis === 'override');
    expect(ev.languageId).toBe(info.languageId);
    expect(rig.ui.host()!.getAttribute('data-language-basis')).toBe(rec.basis);
    expect(rig.ui.host()!.getAttribute('data-language-id')).toBe(rec.languageId);
    expect((await rig.metrics.list())[0]).toMatchObject({ languageId: rec.languageId, languageBasis: rec.basis, languageConfidence: rec.confidence });
  });

  it('a lookup in a language with no pack (the no-pack event) records the same evidence', async () => {
    mount('biblegateway-passage.html');
    rig = makeRig({ adapters: createAdapters(document) });
    selectTop(document.getElementById('p1')!, 'lamp');
    const out = await rig.controller.lookup({ trigger: 'command' });
    expect(out).toMatchObject({ status: 'message', reason: 'no-pack' });
    const [ev] = await rowsOf(rig.store);
    expect(languageOf(ev)).toMatchObject({ languageId: 'en', basis: 'book-metadata', source: 'scripture-translation', override: false });
    expect(rig.ui.host()!.getAttribute('data-language-basis')).toBe('book-metadata');
    expect(validateEvent(ev)).toEqual([]);
  });
});

describe('the Scripture source reference (contract v3 member)', () => {
  const build = (): Rig => makeRig({ adapters: createAdapters(document), analysers: ['sq', 'es'], resolveLanguage: () => fixed({ languageId: 'sq', basis: 'override' }) });

  it('provider is the registry id; the language is the translation’s; the address is the passage address; restrictions are the entry’s', async () => {
    mount('biblegateway-passage.html');
    rig = build();
    selectTop(document.getElementById('p1')!, 'lamp');
    await rig.controller.lookup({ trigger: 'command' });
    const [ev] = await rowsOf(rig.store);
    expect(ev.subject.sourceRef).toMatchObject({ kind: 'scripture', provider: 'biblegateway', translationId: 'NIV', languageId: 'en', book: 'JHN', chapter: 3, verse: 16, confidence: 0.9 });
    expect((ev.subject.sourceRef as { url: string }).url).toBe('https://www.biblegateway.com/passage/?search=John%203%3A16-17&version=NIV');
    expect(validateEvent(ev)).toEqual([]);
  });

  it('only the passage parameters of the address are kept: a tracker or session in the query never reaches the event', async () => {
    mount('biblegateway-passage.html');
    const { setUrl } = await import('./sites.support');
    setUrl('https://www.biblegateway.com/passage/?search=John+3%3A16&version=NIV&utm_source=mail&sid=SECRET#:~:text=lamp');
    rig = build();
    selectTop(document.getElementById('p1')!, 'lamp');
    await rig.controller.lookup({ trigger: 'command' });
    const [ev] = await rowsOf(rig.store);
    const url = (ev.subject.sourceRef as { url: string }).url;
    expect(url).toBe('https://www.biblegateway.com/passage/?search=John+3%3A16&version=NIV');
    expect(JSON.stringify(ev)).not.toMatch(/SECRET|utm_source|text=lamp/);
    expect(validateEvent(ev)).toEqual([]);
  });

  it('confidence is 0.6 when only the URL gave the reference (no verse marker before the selection)', async () => {
    mount('biblegateway-passage.html');
    const { setUrl } = await import('./sites.support');
    setUrl('https://www.biblegateway.com/passage/?search=John+3%3A16&version=NIV');
    document.querySelectorAll('sup.versenum, sup.chapternum').forEach((n) => n.remove()); // the page gives no verse markup
    rig = build();
    selectTop(document.getElementById('p1')!, 'lamp');
    await rig.controller.lookup({ trigger: 'command' });
    const [ev] = await rowsOf(rig.store);
    expect(ev.subject.sourceRef).toMatchObject({ kind: 'scripture', verse: 16, confidence: 0.6 });
    expect(validateEvent(ev)).toEqual([]);
  });

  it('confidence is 0.6 when the markup disagrees with the URL (a verse marker before the verse the URL names)', async () => {
    mount('biblegateway-passage.html');
    const { setUrl } = await import('./sites.support');
    setUrl('https://www.biblegateway.com/passage/?search=John+3%3A20&version=NIV'); // the page's marker for the selection says verse 16
    rig = build();
    selectTop(document.getElementById('p1')!, 'lamp');
    await rig.controller.lookup({ trigger: 'command' });
    const [ev] = await rowsOf(rig.store);
    expect(ev.subject.sourceRef).toMatchObject({ kind: 'scripture', verse: 16, confidence: 0.6 });
  });

  it('a Scripture reference has no title or locator and no text', async () => {
    mount('biblegateway-passage.html');
    rig = build();
    selectTop(document.getElementById('p1')!, 'lamp');
    await rig.controller.lookup({ trigger: 'command' });
    for (const ev of await rig.store.list()) {
      const ref = ev.subject.sourceRef as unknown as Record<string, unknown>;
      expect(ref.title).toBeUndefined();
      expect(ref.locator).toBeUndefined();
      expect(JSON.stringify({ ...ref, url: undefined })).not.toMatch(/lamp|small|table|wall/);
    }
  });
});
