// @vitest-environment jsdom
/**
 * The controller with the registry's adapters: adapter choice by address, the language-resolution hook (a fake resolver),
 * the injected sentence cutters, Scripture references on the encounter event, refusals, the cross-origin fallback and
 * chapter replacement. Fixtures: packages/golearn-extension/harness/sites (owner-authored test text).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdapters } from '../../packages/golearn-extension/src/adapters';
import type { LanguageEvidence, LanguageResolution } from '../../packages/golearn-extension/src/contract/language';
import { defaultResolveLanguage, type ControllerDeps } from '../../packages/golearn-extension/src/content/controller';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { validateEvent } from '../../packages/repository-contract/src';
import { ids } from '../../src/core/ids';
import { esAdapter } from '../../src/adapters/es';
import { sqAdapter } from '../../src/adapters/sq';
import { flush, makeRig, rowsOf, stubLayout, type Rig } from './dom';
import { focusFrame, mount, selectIn, selectTop, setUrl, unmount } from './sites.support';
import { registerAllAnalysers } from '../support/analysers';

registerAllAnalysers(); // the parser carries Albanian; the other analysers are chunks the content script loads on demand

const byId = (id: string): HTMLElement => document.getElementById(id)!;
const SEGMENTERS: Record<string, (t: string) => Array<{ start: number; end: number; text: string }>> = {
  sq: (t) => sqAdapter.segmentSentences(t),
  es: (t) => esAdapter.segmentSentences(t),
};

let restore: () => void;
let rig: Rig | undefined;
const build = (over: Partial<ControllerDeps> = {}): Rig => {
  rig = makeRig({
    adapters: createAdapters(document),
    analysers: ['sq', 'es'],
    segmenterFor: (id) => (Object.prototype.hasOwnProperty.call(SEGMENTERS, id) ? SEGMENTERS[id] : undefined),
    ...over,
  });
  return rig;
};
beforeEach(() => { restore = stubLayout(); });
afterEach(() => { rig?.controller.dispose(); rig = undefined; unmount(); restore(); vi.restoreAllMocks(); });

const fixed = (r: Partial<LanguageResolution> & { basis: LanguageResolution['basis'] }): LanguageResolution => ({ confidence: 1, reasons: [], ...r });

describe('the registry picks the adapter and the lookup records which', () => {
  it('Libroteka: an Albanian page with lang=sq is looked up as Albanian, on the document\'s own word, with the basis recorded everywhere', async () => {
    mount('libroteka-reader.html');
    const r = build();
    selectTop(byId('text'), 'shtëpinë');
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(out.status).toBe('shown');
    if (out.status !== 'shown') return;
    expect(out.card.lemma).toBe('shtëpi');
    expect(out.card.context.kind).toBe('sentence');
    expect(out.card.language).toMatchObject({ languageId: 'sq', basis: 'document-metadata', confidence: 0.8 });
    const host = r.ui.host()!;
    expect(host.getAttribute('data-language-basis')).toBe('document-metadata');
    expect(host.getAttribute('data-language-id')).toBe('sq');
    const rows = await rowsOf(r.store);
    expect(rows).toHaveLength(1);
    expect(validateEvent(rows[0])).toEqual([]);
    expect(rows[0].payload.readerId).toBe('libroteka');
    expect(rows[0].subject.sourceRef).toMatchObject({ kind: 'web', locator: '/liber/fixture/0' });
    const m = await r.metrics.list();
    expect(m[0]).toMatchObject({ readerId: 'libroteka', outcome: 'shown', languageId: 'sq', languageBasis: 'document-metadata', languageConfidence: 0.8 });
  });

  it('chapter replacement dismisses the card, and the next lookup works', async () => {
    mount('libroteka-reader.html');
    const r = build();
    selectTop(byId('text'), 'punë');
    const first = await r.controller.lookup({ trigger: 'command' });
    expect(first.status).toBe('shown');
    expect(r.ui.isOpen()).toBe(true);
    byId('text').replaceChildren((byId('chapter-2') as HTMLTemplateElement).content.cloneNode(true)); // "next chapter"
    await flush(80);
    expect(r.ui.isOpen()).toBe(false);
    selectTop(byId('text'), 'kuzhinë');
    const second = await r.controller.lookup({ trigger: 'command' });
    expect(second.status).toBe('shown');
    expect(r.ui.isOpen()).toBe(true);
    expect(((await r.metrics.list()).filter((x) => x.outcome === 'shown')).length).toBe(2);
  });
});

describe('Scripture references ride on the encounter event, apart from the text', () => {
  const SCRIPTURE_RESTRICTIONS = { textRetention: 'forbidden', remoteProcessing: 'forbidden', audioRetention: 'unknown', export: 'unknown', sharing: 'unknown', reviewExamples: 'forbidden' };
  /** The contract-v3 `scripture` member: provider from the registry id, the translation's language, the passage address, the adapter's confidence, the entry's restrictions. */
  const REF = {
    kind: 'scripture', provider: 'biblegateway', translationId: 'NIV', languageId: 'en', book: 'JHN', chapter: 3, verse: 16,
    url: 'https://www.biblegateway.com/passage/?search=John%203%3A16-17&version=NIV', confidence: 0.9, restrictions: SCRIPTURE_RESTRICTIONS,
  };

  it('every event of the card carries the reference; none carries the verse text; the contract accepts them', async () => {
    mount('biblegateway-passage.html');
    const r = build({ resolveLanguage: () => fixed({ languageId: 'sq', basis: 'override' }) });
    selectTop(byId('p1'), 'lamp');
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(out.status).toBe('shown');
    const all = await r.store.list();
    expect(all.length).toBeGreaterThanOrEqual(2);
    for (const ev of all) {
      expect(validateEvent(ev), ev.kind).toEqual([]);
      expect(ev.subject.sourceRef).toEqual(REF);
    }
    const sel = (await rowsOf(r.store))[0];
    expect(typeof sel.subject.sentenceKey).toBe('string'); // the sentence is a hash
    expect(JSON.stringify({ k: sel.subject.sentenceKey, s: sel.subject.sourceRef })).not.toMatch(/lamp|small|table|wall|Gateway/); // the item id is the looked-up word; the context is only a hash
    expect(sel.subject.sentenceKey).toBe(ids.sentenceKey('A small lamp stood on the table, and its light reached the far wall.'));
    const metrics = JSON.stringify(await r.metrics.list());
    expect(metrics).not.toMatch(/small lamp|Gateway/);
  });

  it('the English page declares en, which is not installed: an honest "no pack" card, still with the reference and the basis', async () => {
    mount('biblegateway-passage.html');
    const r = build();
    selectTop(byId('p1'), 'lamp');
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(out).toMatchObject({ status: 'message', reason: 'no-pack' });
    if (out.status === 'message') expect(out.message).toMatch(/no GoLearn pack for English/);
    const rows = await rowsOf(r.store);
    expect(rows).toHaveLength(1);
    expect(rows[0].languageId).toBe('en');
    expect(rows[0].subject.sourceRef).toEqual(REF);
    expect((await r.metrics.list())[0]).toMatchObject({ failure: 'no-pack', languageId: 'en', languageBasis: 'book-metadata' });
    expect(r.ui.host()!.getAttribute('data-language-basis')).toBe('book-metadata');
  });

  it('YouVersion: the verse wrapper gives the verse', async () => {
    mount('youversion-chapter.html');
    const r = build({ resolveLanguage: () => fixed({ languageId: 'sq', basis: 'override' }) });
    selectTop(byId('chapter'), 'slowly');
    await r.controller.lookup({ trigger: 'command' });
    const rows = await rowsOf(r.store);
    expect(rows[0].subject.sourceRef).toEqual({ kind: 'scripture', provider: 'youversion', translationId: 'NIV', languageId: 'en', book: 'JHN', chapter: 3, verse: 17, url: 'https://www.bible.com/bible/111/JHN.3.NIV', confidence: 0.9, restrictions: SCRIPTURE_RESTRICTIONS });
  });
});

describe('the language-resolution hook', () => {
  const seen: LanguageEvidence[] = [];
  const parseSpy = vi.fn(parseSelection);
  const resolver = (resolution: LanguageResolution) => (e: LanguageEvidence): LanguageResolution => { seen.push(structuredClone(e)); return resolution; };
  beforeEach(() => { seen.length = 0; parseSpy.mockClear(); });

  it('gets the evidence (document language, a sample of the selection, the default, the installed languages) and no page text', async () => {
    mount('libroteka-reader.html');
    const r = build({ parse: parseSpy, resolveLanguage: resolver(fixed({ languageId: 'sq', basis: 'document-metadata', confidence: 0.8 })) });
    selectTop(byId('text'), 'shtëpinë');
    await r.controller.lookup({ trigger: 'command' });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({
      documentLanguage: { languageId: 'sq', source: 'html-lang', confidence: 0.8 },
      sample: 'shtëpinë',
      teamDefault: 'sq',
      installed: ['sq', 'es'],
    });
    expect(JSON.stringify(seen[0])).not.toMatch(/Çdo|lexoj/);
  });

  it('parses in the RESOLVED language, and records its basis and confidence on the card model and in the metrics', async () => {
    mount('libroteka-reader.html');
    const r = build({ parse: parseSpy, resolveLanguage: resolver(fixed({ languageId: 'es', varietyId: 'es-ES', basis: 'book-metadata', confidence: 0.77, reasons: ['the book says so'] })) });
    selectTop(byId('text'), 'shtëpinë');
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(parseSpy.mock.calls[0][0].languageId).toBe('es');
    expect(out.status).toBe('shown');
    if (out.status !== 'shown') return;
    expect(out.card.languageId).toBe('es');
    expect(out.card.language).toEqual({ languageId: 'es', varietyId: 'es-ES', basis: 'book-metadata', confidence: 0.77, reasons: ['the book says so'] });
    expect(r.ui.host()!.getAttribute('data-language-basis')).toBe('book-metadata');
    expect((await r.metrics.list())[0]).toMatchObject({ languageId: 'es', languageBasis: 'book-metadata', languageConfidence: 0.77 });
    expect((await rowsOf(r.store))[0].languageId).toBe('es');
  });

  it('the learner\'s override (per lookup or kept on the controller) travels as evidence.override', async () => {
    mount('libroteka-reader.html');
    const r = build({ resolveLanguage: resolver(fixed({ languageId: 'sq', basis: 'override' })) });
    selectTop(byId('text'), 'shtëpinë');
    await r.controller.lookup({ trigger: 'command', languageOverride: 'es' });
    expect(seen[0].override).toBe('es');
    r.controller.setLanguageOverride('sq');
    await r.controller.lookup({ trigger: 'command' });
    expect(seen[1].override).toBe('sq');
    await r.controller.lookup({ trigger: 'command', languageOverride: 'es' });
    expect(seen[2].override).toBe('es');
    r.controller.setLanguageOverride(undefined);
    await r.controller.lookup({ trigger: 'command' });
    expect(seen[3]).not.toHaveProperty('override');
  });

  it('undetermined: an honest line, the installed languages offered, nothing parsed, nothing recorded as a lookup', async () => {
    mount('libroteka-reader.html');
    const r = build({ parse: parseSpy, resolveLanguage: resolver({ confidence: 0, basis: 'undetermined', reasons: ['no evidence'] }) });
    selectTop(byId('text'), 'shtëpinë');
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(out.status).toBe('message');
    if (out.status !== 'message') return;
    expect(out.reason).toBe('language-undetermined');
    expect(out.message).toMatch(/cannot tell which language/);
    expect(out.message).toMatch(/Albanian, Spanish/);
    expect(out.languageChoice).toEqual([{ languageId: 'sq', name: 'Albanian' }, { languageId: 'es', name: 'Spanish' }]);
    expect(out.language).toMatchObject({ basis: 'undetermined', confidence: 0, languageChoice: out.languageChoice });
    expect(parseSpy).not.toHaveBeenCalled();
    expect(await r.store.list()).toEqual([]);
    expect(r.ui.host()!.getAttribute('data-language-basis')).toBe('undetermined');
    expect(r.ui.root()!.textContent).toMatch(/cannot tell which language/);
    expect((await r.metrics.list())[0]).toMatchObject({ outcome: 'failed', failure: 'language-undetermined', languageBasis: 'undetermined' });
    // the learner chooses; the same selection is looked up
    r.controller.setLanguageOverride('sq');
    const again = await r.controller.lookup({ trigger: 'command', languageOverride: undefined });
    expect(again.status).toBe('message'); // the fake resolver still says undetermined: the override travels as evidence, the resolver decides
    expect(seen.at(-1)!.override).toBe('sq');
  });

  it('a resolver that throws is undetermined, never a guess and never an exception into the page', async () => {
    mount('libroteka-reader.html');
    const r = build({ parse: parseSpy, resolveLanguage: () => { throw new Error('boom'); } });
    selectTop(byId('text'), 'shtëpinë');
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(out).toMatchObject({ status: 'message', reason: 'language-undetermined' });
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it('the default resolver: override, then book, then document metadata, then the default; undetermined with nothing', () => {
    const base: LanguageEvidence = { installed: ['sq'] };
    expect(defaultResolveLanguage({ ...base, override: 'es', teamDefault: 'sq' })).toMatchObject({ languageId: 'es', basis: 'override' });
    expect(defaultResolveLanguage({ ...base, bookLanguage: { languageId: 'de', source: 'opf', confidence: 0.9 }, documentLanguage: { languageId: 'en', source: 'html-lang', confidence: 0.8 } })).toMatchObject({ languageId: 'de', basis: 'book-metadata' });
    expect(defaultResolveLanguage({ ...base, documentLanguage: { languageId: 'en', source: 'html-lang', confidence: 0.8 }, teamDefault: 'sq' })).toMatchObject({ languageId: 'en', basis: 'document-metadata' });
    expect(defaultResolveLanguage({ ...base, documentLanguage: { languageId: 'en', source: 'url', confidence: 0.3 }, teamDefault: 'sq' })).toMatchObject({ languageId: 'sq', basis: 'team-default' });
    expect(defaultResolveLanguage({ ...base, teamDefault: 'sq' })).toMatchObject({ languageId: 'sq', basis: 'team-default' });
    expect(defaultResolveLanguage(base)).toMatchObject({ basis: 'undetermined', confidence: 0 });
  });
});

describe('sentences are cut by the resolved language\'s own cutter', () => {
  it('Vivlio (Spanish, frame): the Spanish pack is asked for, once, with the resolved language', async () => {
    const { frames } = mount('vivlio-reader.html');
    const asked: string[] = [];
    const r = build({ segmenterFor: (id) => { asked.push(id); return SEGMENTERS[id]; } });
    const frame = frames.get('book')!;
    const fd = frame.contentDocument!;
    focusFrame(frame);
    selectIn(fd, fd.body, 'favorito');
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(out.status).toBe('shown');
    if (out.status !== 'shown') return;
    expect(asked).toEqual(['es']);
    expect(out.card.language).toMatchObject({ languageId: 'es', basis: 'document-metadata' });
    expect(out.card.context.kind).toBe('sentence');
    expect(out.card.context.sentenceChars).toBe('¿Dónde está mi libro favorito?'.length);
    expect((await rowsOf(r.store))[0].payload.readerId).toBe('vivlio-casadellibro');
  });

  it('an injected cutter decides: a cutter that does not split gives the whole paragraph', async () => {
    const { frames } = mount('vivlio-reader.html');
    const r = build({ segmenterFor: () => (t) => [{ start: 0, end: t.length, text: t }] });
    const frame = frames.get('book')!;
    const fd = frame.contentDocument!;
    focusFrame(frame);
    selectIn(fd, fd.body, 'favorito');
    const out = await r.controller.lookup({ trigger: 'command' });
    if (out.status !== 'shown') throw new Error('not shown');
    expect(out.card.context.sentenceChars).toBe('¿Dónde está mi libro favorito? Ella escribe una carta larga.'.length);
  });

  it('a language with no cutter falls back to the adapter\'s Intl.Segmenter for that language', async () => {
    const { frames } = mount('vivlio-reader.html');
    const r = build({ segmenterFor: () => undefined });
    const frame = frames.get('book')!;
    const fd = frame.contentDocument!;
    focusFrame(frame);
    selectIn(fd, fd.body, 'favorito');
    const out = await r.controller.lookup({ trigger: 'command' });
    if (out.status !== 'shown') throw new Error('not shown');
    expect(out.card.context.kind).toBe('sentence');
    expect(out.card.context.sentenceChars).toBe('¿Dónde está mi libro favorito?'.length);
  });

  it('German (Tolino) is not installed here: the card says so, and the lookup is counted under German', async () => {
    const { frames } = mount('tolino-reader.html');
    const r = build();
    const frame = frames.get('reader')!;
    const fd = frame.contentDocument!;
    focusFrame(frame);
    selectIn(fd, fd.body, 'Straßenbahn');
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(out).toMatchObject({ status: 'message', reason: 'no-pack' });
    if (out.status === 'message') expect(out.message).toMatch(/German/);
    expect((await rowsOf(r.store))[0]).toMatchObject({ languageId: 'de' });
  });
});

describe('refusals and the cross-origin fallback', () => {
  it.each([
    ['https://read.amazon.com/', 'kindle-web', /picture/],
    ['https://read.kobo.com/library', 'kobo-web', /terms have been reviewed/],
    ['https://readawrite.com/c/abc', 'readawrite', /user-select: none/],
    ['https://hindi.pratilipi.com/read/x-1', 'pratilipi', /switched off/],
    ['https://mebmarket.com/', 'mebmarket', /own app/],
  ])('%s: %s reads nothing, says why, and records no lookup', async (url, readerId, message) => {
    document.body.innerHTML = '<p id="p">Unë po lexoj një libër të bukur në shtëpinë time.</p>';
    setUrl(url);
    const r = build();
    selectTop(byId('p'), 'libër');
    const quiet = await r.controller.lookup({ trigger: 'selection' });
    expect(quiet).toMatchObject({ status: 'silent', reason: 'unsupported' });
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(out).toMatchObject({ status: 'message', reason: 'unsupported' });
    if (out.status === 'message') expect(out.message).toMatch(message);
    expect(await r.store.list()).toEqual([]);
    expect(r.ui.root()!.textContent).toMatch(message);
    const rows = await r.metrics.list();
    expect(rows.every((x) => x.outcome === 'failed' && x.readerId === readerId)).toBe(true);
  });

  it('Play Books: the frame is unreadable (cross-origin-frame); the browser\'s selection text gives a word-only lookup, saying so', async () => {
    const { frames } = mount('playbooks-reader.html');
    const frame = frames.get('page')!;
    Object.defineProperty(frame, 'contentDocument', { get: () => null, configurable: true });
    focusFrame(frame);
    const r = build();
    const none = await r.controller.lookup({ trigger: 'command' });
    expect(none).toMatchObject({ status: 'message', reason: 'cross-origin-frame' });
    const out = await r.controller.lookup({ trigger: 'command', selectionText: 'libër', languageOverride: 'sq' });
    expect(out.status).toBe('shown');
    if (out.status !== 'shown') return;
    expect(out.card.surface).toBe('libër');
    expect(out.card.context.kind).toBe('none');
    expect(out.card.language).toMatchObject({ languageId: 'sq', basis: 'override' });
    expect(r.ui.root()!.textContent).toMatch(/only the selected word/);
    const rows = await rowsOf(r.store);
    expect(rows[0].payload).toMatchObject({ readerId: 'play-books', contextKind: 'none' });
    expect(rows[0].subject.sentenceKey).toBeUndefined();
  });
});
