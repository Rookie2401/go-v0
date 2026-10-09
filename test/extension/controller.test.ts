// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebGenericAdapter, UnsupportedAdapter } from '../../packages/golearn-extension/src/adapters';
import type { ReaderCapabilities } from '../../packages/golearn-extension/src/contract/readerCapabilities';
import { GOLEARN_HOST_ATTR, type ReaderContext, type SelectionResult } from '../../packages/golearn-extension/src/contract/readerAdapter';
import { PHASES } from '../../packages/golearn-extension/src/metrics';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { sqAdapter } from '../../src/adapters/sq';
import { ids } from '../../src/core/ids';
import { validateEvent } from '../../packages/repository-contract/src';
import { flush, makeRig, selectAcross, selectText, setBody, stubLayout, textNodes, type Rig } from './dom';

const SENTENCE = 'Unë po lexoj një libër të bukur në shtëpinë time.';
const PAGE = `<div id="content"><p id="p">${SENTENCE} Pastaj shkoj në punë.</p><p id="q">Tjetri fle.</p></div>`;
const hosts = () => document.querySelectorAll(`[${GOLEARN_HOST_ATTR}]`);
const shown = (r: Rig): string => r.ui.root()?.textContent ?? '';
const cardTop = (r: Rig): number => parseFloat((r.ui.root()!.querySelector('.card') as HTMLElement).style.top);

class Tweak extends WebGenericAdapter {
  contextImpl?: (range: Range) => ReaderContext;
  selectionImpl?: (inner: () => SelectionResult) => SelectionResult;
  capsPatch?: Partial<ReaderCapabilities>;
  override context(range: Range, o?: { adjacent?: boolean }): ReaderContext { return this.contextImpl ? this.contextImpl(range) : super.context(range, o); }
  override selection(): SelectionResult { return this.selectionImpl ? this.selectionImpl(() => super.selection()) : super.selection(); }
  override capabilities(): ReaderCapabilities { return { ...super.capabilities(), ...this.capsPatch }; }
}
const tweak = () => new Tweak({ doc: document, segmentSentences: (t) => sqAdapter.segmentSentences(t) });

let restore: () => void;
let rig: Rig;
beforeEach(() => { restore = stubLayout(); setBody(PAGE); rig = makeRig(); });
afterEach(() => { rig.controller.dispose(); restore(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('the lookup flow', () => {
  it('selection -> context -> parser -> card -> encounter record, with all five phases measured', async () => {
    selectText(document.getElementById('p')!, 'shtëpinë');
    const out = await rig.controller.lookup({ trigger: 'command' });
    expect(out.status).toBe('shown');
    if (out.status !== 'shown') return;
    expect(out.recorded).toBe('recorded');
    expect(out.card.lemma).toBe('shtëpi');
    expect(out.card.context.kind).toBe('sentence');
    expect(shown(rig)).toContain('shtëpi (NOUN)');
    expect(shown(rig)).toContain('Encounter recorded.');

    const rows = await rig.store.list();
    expect(rows).toHaveLength(1);
    expect(validateEvent(rows[0])).toEqual([]);
    expect(rows[0].subject.itemIds).toEqual(['lemma:sq:shtëpi:NOUN']);
    expect(rows[0].subject.sentenceKey).toBe(ids.sentenceKey(SENTENCE));
    expect(rows[0].subject.sourceRef).toMatchObject({ kind: 'web', locator: '/' });
    expect(JSON.stringify(rows[0])).not.toContain('lexoj');

    const metrics = await rig.metrics.list();
    expect(metrics).toHaveLength(1);
    for (const p of PHASES) expect(typeof metrics[0].t[p]).toBe('number');
    const t = PHASES.map((p) => metrics[0].t[p]!);
    expect([...t].sort((a, b) => a - b)).toEqual(t); // marks are in order
    expect(metrics[0]).toMatchObject({ readerId: 'web-generic', contextKind: 'sentence', outcome: 'shown', coldStart: true, tokenCount: 1 });
    expect(metrics[0].contextChars).toBe(SENTENCE.length);
  });

  it('the page is untouched except for the one host element', async () => {
    const before = document.getElementById('content')!.outerHTML;
    selectText(document.getElementById('p')!, 'libër');
    await rig.controller.lookup({ trigger: 'command' });
    expect(document.getElementById('content')!.outerHTML).toBe(before);
    expect(hosts()).toHaveLength(1);
    expect(document.body.getAttribute('style')).toBeNull();
  });

  it('the same word in the same sentence in one session is recorded once', async () => {
    selectText(document.getElementById('p')!, 'libër');
    await rig.controller.lookup({ trigger: 'command' });
    const again = await rig.controller.lookup({ trigger: 'command' });
    expect(again).toMatchObject({ status: 'shown', recorded: 'duplicate' });
    expect(await rig.store.count()).toBe(1);
    expect(shown(rig)).toContain('already recorded');
  });

  it('a store failure still shows the card and says the encounter was not recorded', async () => {
    const failing = { ...rig.store, append: async () => ({ ok: false, error: 'QUOTA_BYTES exceeded' }) } as typeof rig.store;
    const r2 = makeRig({ store: failing });
    selectText(document.getElementById('p')!, 'libër');
    const out = await r2.controller.lookup({ trigger: 'command' });
    expect(out).toMatchObject({ status: 'shown', recorded: 'failed' });
    expect(shown(r2)).toContain('Encounter not recorded.');
    r2.controller.dispose();
  });
});

describe('failure paths: a one-line message, never an exception', () => {
  it('no selection: a message for an explicit command, silence for a passive selection', async () => {
    const loud = await rig.controller.lookup({ trigger: 'command' });
    expect(loud).toMatchObject({ status: 'message', reason: 'no-selection', message: 'Select a word first.' });
    expect(shown(rig)).toContain('Select a word first.');
    rig.ui.dismiss('close');
    const quiet = await rig.controller.lookup({ trigger: 'selection' });
    expect(quiet).toMatchObject({ status: 'silent', reason: 'no-selection' });
    expect(hosts()).toHaveLength(0);
    expect(await rig.store.count()).toBe(0);
  });

  it('whitespace-only selection', async () => {
    setBody('<p id="p">one<b id="b">   </b>two</p>');
    const r = document.createRange(); r.selectNodeContents(document.getElementById('b')!);
    document.getSelection()!.addRange(r);
    const out = await rig.controller.lookup({ trigger: 'menu' });
    expect(out).toMatchObject({ status: 'message', reason: 'empty' });
    expect(await rig.store.count()).toBe(0);
  });

  it('a selection across paragraphs', async () => {
    selectAcross(textNodes(document.getElementById('p')!)[0], 3, textNodes(document.getElementById('q')!)[0], 4);
    expect(await rig.controller.lookup({ trigger: 'command' })).toMatchObject({ status: 'message', reason: 'multi-block', message: 'Select a word or phrase inside one paragraph.' });
    expect(await rig.controller.lookup({ trigger: 'selection' })).toMatchObject({ status: 'silent', reason: 'multi-block' });
    expect(await rig.store.count()).toBe(0);
  });

  it('too long a selection', async () => {
    const words = Array.from({ length: 100 }, (_, i) => `w${i}`).join(' ');
    setBody(`<p id="p">${words}</p>`);
    selectText(document.getElementById('p')!, words);
    expect(await rig.controller.lookup({ trigger: 'command' })).toMatchObject({ status: 'message', reason: 'too-long' });
  });

  it('an unsupported reader: the popup says so and nothing is read or recorded', async () => {
    const declining = new WebGenericAdapter({ doc: document, declinedHosts: ['localhost'] });
    const r = makeRig({ adapters: [declining, new UnsupportedAdapter()] });
    selectText(document.getElementById('p')!, 'libër');
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(out).toMatchObject({ status: 'message', reason: 'unsupported' });
    expect(shown(r)).toMatch(/does not support this reader yet/);
    expect(await r.store.count()).toBe(0);
    expect(await r.metrics.list()).toHaveLength(1);
    expect((await r.metrics.list())[0]).toMatchObject({ outcome: 'failed', failure: 'unsupported' });
    r.controller.dispose();
  });

  it('context extraction throws: the word is looked up alone and flagged context none', async () => {
    const a = tweak();
    a.contextImpl = () => { throw new Error('context failed'); };
    const r = makeRig({ adapters: [a, new UnsupportedAdapter()] });
    selectText(document.getElementById('p')!, 'libër');
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(out.status).toBe('shown');
    if (out.status !== 'shown') return;
    expect(out.card.context).toMatchObject({ kind: 'none', confidence: 0 });
    expect(out.card.context.reason).toMatch(/context extraction failed/);
    expect(out.card.notes.join(' ')).toMatch(/No sentence context/);
    const row = (await r.store.list())[0];
    expect(row.subject.sentenceKey).toBeUndefined();
    expect(row.payload.contextKind).toBe('none');
    r.controller.dispose();
  });

  it('the block is removed after the selection: a fragment-only lookup still works and is flagged', async () => {
    const a = tweak();
    a.selectionImpl = (inner) => { const s = inner(); document.getElementById('p')!.remove(); return s; };
    const r = makeRig({ adapters: [a, new UnsupportedAdapter()] });
    selectText(document.getElementById('p')!, 'libër');
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(out.status).toBe('shown');
    if (out.status !== 'shown') return;
    expect(out.card.context.kind).toBe('fragment');
    expect(out.card.context.confidence).toBeLessThanOrEqual(0.25);
    expect(out.card.context.sentenceKey).toBeUndefined();
    expect(out.card.lemma).toBe('libër');
    expect(out.card.notes.join(' ')).toMatch(/fragment/);
    const row = (await r.store.list())[0];
    expect(row.payload.contextKind).toBe('fragment');
    expect(row.subject.sentenceKey).toBeUndefined();
    r.controller.dispose();
  });

  it('an adapter may not claim more than it declared: partial context turns a sentence into a fragment; none is ignored', async () => {
    const partial = tweak();
    partial.capsPatch = { sentenceContext: 'partial', contextConfidence: 0.4 };
    const r1 = makeRig({ adapters: [partial, new UnsupportedAdapter()] });
    selectText(document.getElementById('p')!, 'libër');
    const o1 = await r1.controller.lookup({ trigger: 'command' });
    if (o1.status !== 'shown') throw new Error('expected a card');
    expect(o1.card.context.kind).toBe('fragment');
    expect(o1.card.context.confidence).toBeLessThanOrEqual(0.4);
    r1.controller.dispose();

    const none = tweak();
    none.capsPatch = { sentenceContext: 'none', contextConfidence: 0, adjacentContext: false };
    const spy = vi.spyOn(none, 'context');
    const r2 = makeRig({ adapters: [none, new UnsupportedAdapter()] });
    selectText(document.getElementById('p')!, 'libër');
    const o2 = await r2.controller.lookup({ trigger: 'command' });
    if (o2.status !== 'shown') throw new Error('expected a card');
    expect(o2.card.context.kind).toBe('none');
    expect(spy).not.toHaveBeenCalled(); // an adapter that declares no context is never asked for it
    r2.controller.dispose();
  });

  it('a cross-origin frame: the browser\'s own copy of the selected text gives a word-only lookup, flagged', async () => {
    const a = tweak();
    a.selectionImpl = () => ({ ok: false, reason: 'cross-origin-frame', message: 'This selection is inside a frame GoLearn cannot read.' });
    const r = makeRig({ adapters: [a, new UnsupportedAdapter()] });
    const out = await r.controller.lookup({ trigger: 'menu', selectionText: '  shtëpinë ' });
    if (out.status !== 'shown') throw new Error(JSON.stringify(out));
    expect(out.card.surface).toBe('shtëpinë');
    expect(out.card.context.kind).toBe('none');
    expect(out.card.context.reason).toMatch(/frame/);
    const noText = await r.controller.lookup({ trigger: 'menu' });
    expect(noText).toMatchObject({ status: 'message', reason: 'cross-origin-frame' });
    r.controller.dispose();
  });

  it('a parser failure and an unexpected exception end in a message, with nothing recorded', async () => {
    const r = makeRig({ parse: () => { throw new Error('parser blew up'); } });
    selectText(document.getElementById('p')!, 'libër');
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(out).toMatchObject({ status: 'message', reason: 'parser-error', message: 'GoLearn could not analyse that selection.' });
    expect(await r.store.count()).toBe(0);
    r.controller.dispose();

    const bad = makeRig({ ui: { ...makeRig().ui, show: () => { throw new Error('ui exploded'); } } });
    selectText(document.getElementById('p')!, 'libër');
    await expect(bad.controller.lookup({ trigger: 'command' })).resolves.toMatchObject({ status: 'message', reason: 'unexpected' });
    bad.controller.dispose();
  });

  it('page text is untrusted: markup in the selected text is shown as text and executes nothing', async () => {
    setBody('<p id="p">Ai lexoi &lt;img src=x onerror="window.__pwned=1"&gt; sot.</p>');
    selectText(document.getElementById('p')!, '<img src=x onerror="window.__pwned=1">');
    const out = await rig.controller.lookup({ trigger: 'command' });
    expect(out.status).toBe('shown');
    expect(document.querySelector('img')).toBeNull();
    expect(rig.ui.root()!.querySelector('img')).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });
});

describe('rapid selections', () => {
  it('ten lookups started in the same instant produce one popup and one record', async () => {
    const words = ['Unë', 'lexoj', 'libër', 'bukur', 'shtëpinë', 'time', 'Pastaj', 'shkoj', 'punë', 'po'];
    const pending = words.map((w) => { selectText(document.getElementById('p')!, w); return rig.controller.lookup({ trigger: 'selection' }); });
    const outcomes = await Promise.all(pending);
    expect(outcomes.filter((o) => o.status === 'shown')).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === 'superseded')).toHaveLength(9);
    expect(hosts()).toHaveLength(1);
    expect(await rig.store.count()).toBe(1);
    expect(await rig.metrics.list()).toHaveLength(1);
    expect(shown(rig)).toContain('po');
  });

  it('ten mouse-ups inside 100 ms are coalesced by the debounce into one lookup of the last selection', async () => {
    vi.useFakeTimers();
    rig.controller.enable();
    const lookup = vi.spyOn(rig.controller, 'lookup');
    const words = ['Unë', 'lexoj', 'libër', 'bukur', 'shtëpinë', 'time', 'Pastaj', 'shkoj', 'punë', 'po'];
    for (const w of words) {
      selectText(document.getElementById('p')!, w);
      document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true }));
      await vi.advanceTimersByTimeAsync(10);
    }
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();
    await flush(20);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(hosts()).toHaveLength(1);
    expect(await rig.store.count()).toBe(1);
    expect((await rig.store.list())[0].payload.surface).toBe('po');
  });

  it('leaves no listener behind after disable and dispose, even after many lookups', async () => {
    const add = vi.spyOn(document, 'addEventListener');
    const rem = vi.spyOn(document, 'removeEventListener');
    const wadd = vi.spyOn(window, 'addEventListener');
    const wrem = vi.spyOn(window, 'removeEventListener');
    rig.controller.enable();
    for (let i = 0; i < 12; i++) {
      selectText(document.getElementById('p')!, i % 2 ? 'libër' : 'bukur');
      await rig.controller.lookup({ trigger: 'command' });
    }
    rig.controller.dispose();
    const tally = (spy: typeof add, types: string[]) => spy.mock.calls.filter((c) => types.includes(c[0] as string)).length;
    const doc = ['keydown', 'pointerdown', 'mouseup', 'keyup'];
    expect(tally(add, doc)).toBeGreaterThan(0);
    expect(tally(rem, doc)).toBe(tally(add, doc));
    const win = ['resize', 'scroll'];
    expect(tally(wrem, win)).toBe(tally(wadd, win));
    expect(hosts()).toHaveLength(0);
  });
});

describe('the page changes under the card', () => {
  it('the text is replaced (DOM replaced): the card is dismissed, and a new selection works on the new DOM', async () => {
    selectText(document.getElementById('p')!, 'libër');
    await rig.controller.lookup({ trigger: 'command' });
    expect(rig.ui.isOpen()).toBe(true);

    document.getElementById('content')!.innerHTML = '<p id="p2">Ai ka një mace të zezë dhe një qen.</p>';
    await flush(60);
    expect(rig.ui.isOpen()).toBe(false);
    expect(hosts()).toHaveLength(0);

    selectText(document.getElementById('p2')!, 'mace');
    const out = await rig.controller.lookup({ trigger: 'command' });
    expect(out.status).toBe('shown');
    if (out.status === 'shown') expect(out.card.lemma).toBe('mace');
    expect(rig.adapter.anchor(document.getSelection()!.getRangeAt(0)).source).toBe('range');
    expect(hosts()).toHaveLength(1);
  });

  it('the whole body is replaced: the card goes with it, the controller recovers on the next lookup', async () => {
    selectText(document.getElementById('p')!, 'libër');
    await rig.controller.lookup({ trigger: 'command' });
    document.body.innerHTML = '<p id="p3">Ai ka një mace.</p>';
    await flush(60);
    expect(rig.ui.isOpen()).toBe(false);
    selectText(document.getElementById('p3')!, 'mace');
    expect((await rig.controller.lookup({ trigger: 'command' })).status).toBe('shown');
    expect(document.body.contains(hosts()[0])).toBe(true);
  });

  it('a text-size change moves the card with the selection', async () => {
    document.getElementById('p')!.style.fontSize = '16px';
    selectText(document.getElementById('p')!, 'libër');
    await rig.controller.lookup({ trigger: 'command' });
    const before = cardTop(rig);
    document.getElementById('p')!.style.fontSize = '48px';
    await flush(60);
    expect(rig.ui.isOpen()).toBe(true);
    expect(cardTop(rig)).toBeGreaterThan(before);
    document.getElementById('p')!.style.fontSize = '16px';
    await flush(60);
    expect(cardTop(rig)).toBe(before);
  });

  it('a window resize repositions an open card; after dismissal nothing is watched', async () => {
    selectText(document.getElementById('p')!, 'libër');
    await rig.controller.lookup({ trigger: 'command' });
    const reposition = vi.spyOn(rig.ui, 'reposition');
    window.dispatchEvent(new Event('resize'));
    await flush(60);
    expect(reposition).toHaveBeenCalled();
    rig.ui.dismiss('close');
    reposition.mockClear();
    window.dispatchEvent(new Event('resize'));
    await flush(60);
    expect(reposition).not.toHaveBeenCalled();
  });

  it('flips above near the bottom of the page', async () => {
    restore();
    restore = stubLayout({ top: 700, viewportHeight: 768, cardHeight: 220 });
    selectText(document.getElementById('p')!, 'libër');
    await rig.controller.lookup({ trigger: 'command' });
    expect(rig.ui.root()!.querySelector('.card')!.getAttribute('data-placement')).toBe('above');
  });
});

describe('"GoLearn on" for a tab', () => {
  it('a user selection looks the word up once the switch is on, and not before', async () => {
    vi.useFakeTimers();
    selectText(document.getElementById('p')!, 'libër');
    document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true }));
    await vi.advanceTimersByTimeAsync(300);
    expect(hosts()).toHaveLength(0); // off: nothing happens
    rig.controller.enable();
    document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true }));
    await vi.advanceTimersByTimeAsync(300);
    vi.useRealTimers();
    await flush(20);
    expect(hosts()).toHaveLength(1);
    expect(await rig.store.count()).toBe(1);
  });

  it('a mouse-up inside the card does not trigger another lookup', async () => {
    vi.useFakeTimers();
    rig.controller.enable();
    selectText(document.getElementById('p')!, 'libër');
    document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true }));
    await vi.advanceTimersByTimeAsync(300);
    vi.useRealTimers();
    await flush(20);
    const lookup = vi.spyOn(rig.controller, 'lookup');
    const host = hosts()[0];
    host.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true }));
    await flush(200);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('turning it off closes the card and stops listening', async () => {
    rig.controller.enable();
    selectText(document.getElementById('p')!, 'libër');
    await rig.controller.lookup({ trigger: 'command' });
    rig.controller.disable();
    expect(rig.ui.isOpen()).toBe(false);
    expect(rig.controller.isEnabled).toBe(false);
  });

  it('a parser run on the real Albanian adapter completes quickly enough to measure (sanity, not a benchmark)', () => {
    const c = parseSelection({ surface: 'libër', context: { kind: 'none', confidence: 0 } });
    expect(c.provenance).not.toBe('none');
  });
});
