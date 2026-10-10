// @vitest-environment jsdom
/**
 * GoLearn Active on a page: the scan underlines the words the learner has met (four levels, CSS highlights, the DOM
 * untouched), a scan records no event, a single click on a word opens the ordinary card (trigger `click`) and speaks
 * it when asked, controls are left alone, and stop() removes everything.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActiveMode } from '../../packages/golearn-extension/src/content/active';
import type { HighlightLike } from '../../packages/golearn-extension/src/active/highlight';
import { UnsupportedAdapter } from '../../packages/golearn-extension/src/adapters';
import { getAnalyser } from '../../packages/golearn-extension/src/parser';
import { createCardUI } from '../../packages/golearn-extension/src/popup/card';
import type { PlayResult, PronounceAvailability, Pronouncer } from '../../packages/golearn-extension/src/popup/view';
import type { DimView, KnowledgeView, ProfileReply } from '../../packages/golearn-extension/src/protocol';
import { flush, makeRig, setBody, stubLayout, type Rig } from './dom';

class FakeHighlight implements HighlightLike {
  ranges = new Set<Range>();
  add(r: Range) { this.ranges.add(r); return this; }
  delete(r: Range) { return this.ranges.delete(r); }
  clear() { this.ranges.clear(); }
  get size() { return this.ranges.size; }
}
const w = window as unknown as { CSS?: { highlights?: Map<string, HighlightLike> }; Highlight?: typeof FakeHighlight };

const SENTENCE = 'Unë po lexoj një libër të bukur në shtëpinë time.';
const PAGE = `<div id="content"><p id="p">${SENTENCE}</p><p><a id="link" href="#x">libër</a></p><textarea id="ta">libër</textarea></div>`;
const dim = (over: Partial<DimView>): DimView => ({ score: 0, confidence: 0, observations: 0, positive: 0, negative: 0, ...over });
const row = (unitId: string, dims: KnowledgeView['dimensions']): KnowledgeView => ({ unitId, dimensions: dims });
/** What the learner model says about this page: one word per level, the rest never met. */
const ROWS: Record<string, KnowledgeView> = {
  'form:sq:libër': row('form:sq:libër', { exposure: dim({ observations: 1 }) }),
  'form:sq:bukur': row('form:sq:bukur', { assistedRecognition: dim({ observations: 2, score: 0.4 }) }),
  'lemma:sq:shtëpi:NOUN': row('lemma:sq:shtëpi:NOUN', { exposure: dim({ observations: 4 }), readingRecognition: dim({ observations: 3, score: 0.8, confidence: 0.6 }) }),
  'form:sq:unë': row('form:sq:unë', { productiveRetrieval: dim({ observations: 1, score: 0.7 }) }),
};

let restore: () => void;
let registry: Map<string, HighlightLike>;
let rig: Rig;
let active: ActiveMode | undefined;
const asked: string[][] = [];
const played: string[] = [];

const pronouncer: Pronouncer = {
  availability: (): PronounceAvailability => ({ available: true, note: 'test voice' }),
  play: (text): PlayResult => { played.push(text); return { ok: true, voice: 'synthetic', voiceId: 'v' }; },
  stop: () => {},
};

beforeEach(() => {
  restore = stubLayout();
  registry = new Map();
  w.CSS = { highlights: registry }; w.Highlight = FakeHighlight;
  setBody(PAGE);
  document.documentElement.lang = 'sq';
  asked.length = 0; played.length = 0;
  const holder: { r?: Rig } = {};
  const ui = createCardUI({ doc: document, pronouncer, onDismiss: () => holder.r?.controller.onCardDismissed() });
  rig = makeRig({ ui });
  holder.r = rig;
});
afterEach(() => { active?.stop(); active = undefined; rig.controller.dispose(); restore(); w.CSS = undefined; w.Highlight = undefined; document.documentElement.removeAttribute('lang'); });

const profile = async (unitIds: string[]): Promise<ProfileReply> => {
  asked.push(unitIds);
  const rows: Record<string, KnowledgeView> = {};
  for (const id of unitIds) if (ROWS[id]) rows[id] = ROWS[id];
  return { ok: true, connected: false, source: 'device', rows, depth: 'brief', depthOrigin: 'default' };
};

function make(over: Partial<ConstructorParameters<typeof ActiveMode>[0]> = {}): ActiveMode {
  active = new ActiveMode({ doc: document, controller: rig.controller, adapters: rig.deps.adapters, ui: rig.ui, adapterOf: getAnalyser, profile, viewport: 'all', ...over });
  return active;
}

/** Make jsdom answer "the caret under this point is at `offset` of the paragraph's text". */
function caretAt(node: Node, offset: number): void {
  (document as unknown as Record<string, unknown>).caretPositionFromPoint = () => ({ offsetNode: node, offset });
}
const click = (target: Element, x = 10, y = 10): void => { target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })); };
const cardText = (): string => rig.ui.root()?.textContent ?? '';

describe('the scan', () => {
  it('underlines the met words by level through CSS highlights, asks the model in one batch, records nothing, and leaves the DOM alone', async () => {
    const before = document.body.innerHTML;
    const s = await make().start({ speak: false });
    // 10 words of the sentence plus the link's text (links are text the learner reads; a click on one is left to the link); the field is not read
    // the five met words get their level; the six other words are "new" (marked too, since 2026-10-10)
    expect(s).toMatchObject({ on: true, supported: true, languageId: 'sq', scanned: 11, marked: { new: 6, met: 2, assisted: 1, known: 1, produced: 1 } });
    expect(s.reason).toBeUndefined();
    expect(document.body.innerHTML).toBe(before);
    expect([...registry.keys()].sort()).toEqual(['golearn-assisted', 'golearn-known', 'golearn-met', 'golearn-new', 'golearn-produced']);
    expect([...(registry.get('golearn-new') as FakeHighlight).ranges].map((r) => r.toString())).toEqual(['po', 'lexoj', 'një', 'të', 'në', 'time']);
    const known = registry.get('golearn-known')!;
    expect([...(known as FakeHighlight).ranges].map((r) => r.toString())).toEqual(['shtëpinë']);
    expect([...(registry.get('golearn-met') as FakeHighlight).ranges].map((r) => r.toString())).toEqual(['libër', 'libër']);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain('lemma:sq:shtëpi:NOUN');
    expect(asked[0].length).toBeLessThanOrEqual(60);
    expect(await rig.store.list()).toEqual([]);
    expect(typeof s.scanMs).toBe('number');
  });

  it('asks only about new ids on a rescan, and a page change is followed', async () => {
    const a = make();
    await a.start({ speak: false });
    await a.rescan();
    expect(asked).toHaveLength(1);
    document.getElementById('p')!.textContent = 'Ana e do librin.';
    await a.rescan();
    expect(asked).toHaveLength(2);
    expect(asked[1]).not.toContain('form:sq:unë');
    expect(a.state.scanned).toBe(5); // the four words of the new sentence and the link's
  });

  it('a mark on the card ("New to me", "I recognise it") refreshes the word: its rows are asked again and the underline follows the mark', async () => {
    const a = make();
    await a.start({ speak: false });
    expect(asked).toHaveLength(1);
    const t = document.getElementById('p')!.firstChild as Text;
    caretAt(t, SENTENCE.indexOf('shtëpinë') + 2);
    click(document.getElementById('p')!);
    await flush(60);
    expect(rig.ui.isOpen()).toBe(true);
    // the learner says the recognised word is new to them: the model is asked about it again (the fake has no mark, so the rows stay); the event is recorded
    ROWS['lemma:sq:shtëpi:NOUN'] = { ...ROWS['lemma:sq:shtëpi:NOUN'], selfMark: { mark: 'learning', at: '2026-10-10T12:00:00.000Z' } };
    (rig.ui.root()!.querySelector('.rateBtn[data-mark="learning"]') as HTMLButtonElement).click();
    await flush(80);
    expect((await rig.store.list()).map((e) => e.kind)).toContain('ItemMarked');
    expect(asked.length).toBeGreaterThanOrEqual(2);
    expect(asked.at(-1)).toContain('lemma:sq:shtëpi:NOUN');
    expect([...(registry.get('golearn-new') as FakeHighlight).ranges].map((r) => r.toString())).toContain('shtëpinë');
    expect(a.state.marked.known).toBe(0);
    expect(rig.ui.root()!.querySelector('.rateBtn[data-mark="learning"]')!.getAttribute('aria-pressed')).toBe('true');
    delete ROWS['lemma:sq:shtëpi:NOUN'].selfMark;
  });

  it('without the learner model (no extension context) nothing is underlined and the state says why; without the highlight API likewise', async () => {
    const s = await make({ profile: undefined }).start({ speak: false });
    expect(s.marked).toEqual({ new: 0, met: 0, assisted: 0, known: 0, produced: 0 });
    expect(s.reason).toMatch(/learner model is not reachable/);
    active!.stop();
    w.CSS = undefined; w.Highlight = undefined;
    const s2 = await make().start({ speak: false });
    expect(s2.supported).toBe(false);
    expect(s2.reason).toMatch(/cannot draw the underlines/);
  });

  it('an unsupported reader is never scanned, whatever the switch says', async () => {
    const s = await make({ adapters: [new UnsupportedAdapter()] }).start({ speak: false });
    expect(s).toMatchObject({ on: true, scanned: 0 });
    expect(s.reason).toMatch(/does not read this page/);
    expect(asked).toEqual([]);
  });
});

describe('click to look up', () => {
  it('a single click on a word selects it and opens the ordinary card with the full analysis (trigger click), then speaks it when asked', async () => {
    const a = make();
    await a.start({ speak: true });
    const t = document.getElementById('p')!.firstChild as Text;
    caretAt(t, SENTENCE.indexOf('shtëpinë') + 3);
    click(document.getElementById('p')!);
    await flush(60);
    expect(document.getSelection()!.toString()).toBe('shtëpinë');
    expect(rig.ui.isOpen()).toBe(true);
    expect(cardText()).toContain('shtëpi (NOUN)');
    expect(played).toEqual(['shtëpinë']);
    const events = await rig.store.list();
    expect(events.map((e) => e.kind)).toEqual(['SelectionLookedUp', 'AnalysisShown', 'PronunciationPlayed']);
    expect(a.state.clicks).toBe(1);
  });

  it('with Speak on click off the card opens silently; a click between words, on a link or in a field does nothing', async () => {
    const a = make();
    await a.start({ speak: false });
    const t = document.getElementById('p')!.firstChild as Text;
    caretAt(t, SENTENCE.indexOf('libër'));
    click(document.getElementById('p')!);
    await flush(60);
    expect(rig.ui.isOpen()).toBe(true);
    expect(played).toEqual([]);
    rig.ui.dismiss('escape');
    caretAt(t, SENTENCE.length); // after the full stop
    click(document.getElementById('p')!);
    await flush(40);
    expect(rig.ui.isOpen()).toBe(false);
    caretAt(document.getElementById('link')!.firstChild!, 2);
    click(document.getElementById('link')!);
    click(document.getElementById('ta')!);
    await flush(40);
    expect(rig.ui.isOpen()).toBe(false);
    expect(a.state.clicks).toBe(1);
  });

  it('a drag (a non-collapsed selection) is left to the per-tab switch', async () => {
    await make().start({ speak: false });
    const t = document.getElementById('p')!.firstChild as Text;
    const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 6);
    document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(r);
    caretAt(t, 2);
    click(document.getElementById('p')!);
    await flush(40);
    expect(rig.ui.isOpen()).toBe(false);
  });
});

describe('stop', () => {
  it('removes the underlines and the click handling, and a later start reads again', async () => {
    const a = make();
    await a.start({ speak: false });
    expect(registry.size).toBe(5);
    a.stop();
    expect(registry.size).toBe(0);
    expect(a.state).toMatchObject({ on: false, scanned: 0 });
    const t = document.getElementById('p')!.firstChild as Text;
    caretAt(t, SENTENCE.indexOf('libër'));
    click(document.getElementById('p')!);
    await flush(40);
    expect(rig.ui.isOpen()).toBe(false);
    const s = await a.start({ speak: false });
    expect(s.marked.known).toBe(1);
  });
});
