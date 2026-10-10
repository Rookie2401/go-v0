// @vitest-environment jsdom
/**
 * Two promises of GoLearn, through the real stack (the real content script, the message bridge, the real worker with the device Repository,
 * the fake chrome and, signed in, the real service handler):
 *
 *  A. A word is saved as soon as its level of recognition is altered. Pressing a circle of the card's six-level meter writes the ItemMarked
 *     event at once (the device Repository holds it before any timer runs; signed in, the durable sync queue holds it too), the meter shows the
 *     level pressed in the same tick, the next profile reply carries the new level, and the page marks and counts follow.
 *     The chain: controller `onRate` -> `buildMarkEvent` -> `store.append` -> worker `MSG.record` -> recorder (log, queue) -> localRepo
 *     `appendEvents` -> `knowledgeFor` (`level`, `selfMark`).
 *  B. Clicking a new word turns it from New into Seen at once: the lookup event is a meeting, the engine releases a mark of New by any later
 *     observation, the page marks and counts move from new to seen, and the card's meter says Seen.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { HighlightLike } from '../../packages/golearn-extension/src/active/highlight';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { ACTIVE_ORIGINS } from '../../packages/golearn-extension/src/protocol';
import { flush, setBody, stubLayout } from './dom';
import { createRig, type Rig } from './rig';

class FakeHighlight implements HighlightLike {
  ranges = new Set<Range>();
  add(r: Range) { this.ranges.add(r); return this; }
  delete(r: Range) { return this.ranges.delete(r); }
  clear() { this.ranges.clear(); }
  get size() { return this.ranges.size; }
}
const w = window as unknown as { CSS?: { highlights?: Map<string, HighlightLike> }; Highlight?: typeof FakeHighlight };
const g = globalThis as unknown as Record<string, unknown>;

const PAGE = '<div id="content"><p id="p">Unë po lexoj një libër të bukur në shtëpinë time.</p><p id="q">Beni shkon në shtëpinë e Anës.</p></div>';
const LEMMA = 'lemma:sq:shkoj:VERB';

let install: (chromeApi: unknown, doc: Document) => Promise<unknown>;
let restore: () => void;
let registry: Map<string, HighlightLike>;
let rig: Rig;

beforeAll(async () => {
  g.__GOLEARN_NO_AUTOINSTALL = true;
  install = (await import('../../packages/golearn-extension/src/content/index')).install as typeof install;
});
beforeEach(() => {
  restore = stubLayout();
  registry = new Map();
  w.CSS = { highlights: registry }; w.Highlight = FakeHighlight;
  setBody(PAGE);
  document.documentElement.lang = 'sq';
  delete g.__goLearnExtension;
  rig = createRig();
});
afterEach(() => {
  const marker = g.__goLearnExtension as { controller: { dispose(): void }; active: { stop(): void } } | undefined;
  marker?.active.stop(); marker?.controller.dispose();
  delete g.__goLearnExtension;
  restore(); w.CSS = undefined; w.Highlight = undefined; document.documentElement.removeAttribute('lang');
});

const until = async (f: () => boolean | Promise<boolean>, ms = 4000): Promise<void> => { const t0 = Date.now(); while (!(await f())) { if (Date.now() - t0 > ms) throw new Error('timeout'); await flush(5); } };
const marks = (): Record<string, string[]> => Object.fromEntries([...registry].map(([k, h]) => [k, [...(h as FakeHighlight).ranges].map((r) => r.toString())]));
type Counts = Record<string, number>;
const counts = async (): Promise<Counts> => ((await rig.fake.tabs!.sendMessage(7, { type: MSG.ping })) as { activeState: { marked: Counts } }).activeState.marked;
const deviceEvents = async (kind: string): Promise<Array<{ kind: string; payload: { mark?: string } }>> =>
  ((await rig.page({ type: MSG.localRepo, op: 'export' })).events as Array<{ kind: string; payload: { mark?: string } }>).filter((e) => e.kind === kind);
const rowOf = async (): Promise<{ level?: string; selfMark?: { mark: string; at: string }; encounters?: number } | undefined> =>
  (await rig.content({ type: MSG.activeProfile, unitIds: [LEMMA], languageId: 'sq' })).rows?.[LEMMA];

async function startActive(): Promise<void> {
  await install(rig.fake.contentChrome(7), document);
  rig.fake.grantOrigins(ACTIVE_ORIGINS);
  await rig.page({ type: MSG.active, op: 'set', patch: { active: true } });
  await until(() => registry.size > 0);
}
/** A click on a word of the page, as the learner makes it; resolves with the open card's shadow root once the lookup has settled. */
async function clickWord(paragraph: string, word: string, expectNew = true): Promise<ShadowRoot> {
  const lookups = (await deviceEvents('SelectionLookedUp')).length;
  document.getSelection()?.removeAllRanges(); // a real click collapses the previous selection first
  const t = document.getElementById(paragraph)!.firstChild as Text;
  (document as unknown as Record<string, unknown>).caretPositionFromPoint = () => ({ offsetNode: t, offset: t.data.indexOf(word) + 1 });
  document.getElementById(paragraph)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10, button: 0 }));
  if (expectNew) await until(async () => (await deviceEvents('SelectionLookedUp')).length > lookups); // this click's lookup is on the device (not an earlier card)
  await until(() => !!document.querySelector('[data-golearn-host]'));
  const host = document.querySelector('[data-golearn-host]') as HTMLElement;
  const root = host.shadowRoot ?? (g.__goLearnExtension as { controller: { d: { ui: { root(): ShadowRoot | undefined } } } }).controller.d.ui.root()!;
  await until(() => !!root.textContent && root.querySelector('.encounters')?.textContent !== undefined && root.querySelectorAll('.rateBtn').length === 6);
  await flush(60);
  return root;
}
const pressed = (root: ShadowRoot): string[] => [...root.querySelectorAll('.rateBtn[aria-pressed="true"]')].map((b) => b.getAttribute('data-mark')!);
const press = (root: ShadowRoot, mark: string): void => (root.querySelector(`.rateBtn[data-mark="${mark}"]`) as HTMLButtonElement).click();

describe('A. a level pressed on the card is saved as soon as it is pressed', () => {
  it('the meter shows it in the same tick; the device holds the event before any timer runs; the next profile reply carries the level; the page marks and counts follow', async () => {
    await startActive();
    const root = await clickWord('q', 'shkon');
    await until(async () => (await counts()).seen === 1); // the click met the word (see B)
    const before = await counts();
    const firedBefore = rig.timers.filter((t) => t.fired).length;
    expect(await deviceEvents('ItemMarked')).toEqual([]);

    press(root, 'familiar');
    // (4) the card's meter shows the level pressed, at once: nothing was awaited since the press
    expect(pressed(root)).toEqual(['familiar']);
    expect(root.querySelector('.levelName')!.textContent).toBe('Familiar');
    // (1) the device Repository holds the ItemMarked event: no debounce, no timer of the worker had to fire
    await until(async () => (await deviceEvents('ItemMarked')).length === 1);
    expect((await deviceEvents('ItemMarked'))[0].payload.mark).toBe('familiar');
    expect(rig.timers.filter((t) => t.fired).length).toBe(firedBefore);
    // (2) the next profile reply carries the new level and the mark (projection@4: `level`, `selfMark`)
    const row = await rowOf();
    expect(row).toMatchObject({ level: 'familiar', selfMark: { mark: 'familiar' } });
    const card = await rig.content({ type: MSG.profile, unitIds: [LEMMA], languageId: 'sq' });
    expect(card).toMatchObject({ ok: true, source: 'device', rows: { [LEMMA]: { level: 'familiar', selfMark: { mark: 'familiar' } } } });
    // (3) the Active state's counts moved after the rescan; the mark on the page is the familiar underline
    await until(async () => (await counts()).familiar === 1);
    const after = await counts();
    expect(after).toMatchObject({ familiar: before.familiar + 1, seen: before.seen - 1, new: before.new });
    expect(marks()['golearn-familiar']).toEqual(['shkon']);
    expect(marks()['golearn-seen'] ?? []).not.toContain('shkon');
    // and the meter, still: the confirmation did not take it back
    expect(pressed(root)).toEqual(['familiar']);

    // pressing another circle replaces the mark at once, the same way
    press(root, 'known');
    expect(pressed(root)).toEqual(['known']);
    await until(async () => (await counts()).known === 1);
    expect((await deviceEvents('ItemMarked')).map((e) => e.payload.mark)).toEqual(['familiar', 'known']);
    expect(await rowOf()).toMatchObject({ level: 'known', selfMark: { mark: 'known' } });
    expect(marks()['golearn-known']).toEqual(['shkon']);
    expect(marks()['golearn-familiar'] ?? []).not.toContain('shkon');
    expect(await counts()).toMatchObject({ known: 1, familiar: 0 });
  });

  it('signed in, the same press is also in the durable sync queue at once (the network round waits its own 2 s, the event does not)', async () => {
    const who = await rig.signUp();
    await rig.connect();
    await startActive();
    const root = await clickWord('q', 'shkon');
    const queued = async (): Promise<string[]> => (await rig.bg.sync.queue.pending()).map((r) => `${r.event.kind}:${(r.event.payload as { mark?: string }).mark ?? ''}`);
    expect(await queued()).not.toContain('ItemMarked:automatic');
    press(root, 'automatic');
    expect(pressed(root)).toEqual(['automatic']);
    await until(async () => (await queued()).includes('ItemMarked:automatic'));
    // the device Repository too, as the account's own event
    await until(async () => (await deviceEvents('ItemMarked')).length === 1);
    // nothing had to fire for either: the service has not been asked yet
    expect((await rig.h.store.list({ learnerId: who.learnerId, kinds: ['ItemMarked'] })).length).toBe(0);
    await until(async () => (await counts()).automatic === 1);
    // a round of the sync delivers it
    await rig.fireTimers();
    const sent = await rig.h.store.list({ learnerId: who.learnerId, kinds: ['ItemMarked'] });
    expect(sent.map((e) => (e.payload as { mark?: string }).mark)).toEqual(['automatic']);
  });

  it('a write that fails takes the press back with a message', async () => {
    await startActive();
    const root = await clickWord('q', 'shkon');
    expect(pressed(root)).toEqual(['seen']);
    // the worker refuses (the page's own store is the bridge to it)
    const marker = g.__goLearnExtension as { controller: { d: { store: { append: unknown } } } };
    const real = marker.controller.d.store.append;
    marker.controller.d.store.append = async () => ({ ok: false, error: 'full' });
    press(root, 'known');
    expect(pressed(root)).toEqual(['known']); // optimistic
    await until(() => root.querySelector('.feedback')?.textContent === 'Could not save that. Try again.');
    expect(pressed(root)).toEqual(['seen']); // taken back to what it was
    marker.controller.d.store.append = real;
    press(root, 'known');
    await until(async () => (await deviceEvents('ItemMarked')).length === 1);
    expect(pressed(root)).toEqual(['known']);
  });
});

describe('B. clicking a new word turns it from New into Seen', () => {
  it('the page marks and counts move from new to seen, the engine row says seen, the card shows Seen pressed', async () => {
    await startActive();
    const start = await counts();
    expect(start).toMatchObject({ seen: 0 });
    expect(start.new).toBeGreaterThan(10);
    expect(marks()['golearn-new']).toContain('shkon');
    expect(await rowOf()).toBeUndefined(); // never met: no row at all

    const root = await clickWord('q', 'shkon');
    // the card: the word was New, the click met it
    expect(pressed(root)).toEqual(['seen']);
    expect(root.querySelector('.levelName')!.textContent).toBe('Seen');
    // the device: the lookup is recorded, the row reads seen
    expect(await deviceEvents('SelectionLookedUp')).toHaveLength(1);
    expect(await rowOf()).toMatchObject({ level: 'seen' });
    expect((await rowOf())!.selfMark).toBeUndefined();
    // the page: a rescan after the lookup, without the learner doing anything else
    await until(() => (marks()['golearn-seen'] ?? []).includes('shkon'));
    expect(marks()['golearn-new']).not.toContain('shkon');
    const now = await counts();
    expect(now.seen).toBe(start.seen + 1);
    expect(now.new).toBe(start.new - 1);
  });

  it('a word the learner marked New is released by the next lookup: Seen again (a repeat of the same sentence is the same lookup and does not count)', async () => {
    setBody(PAGE.replace('</div>', '<p id="r">Ai shkon në punë.</p></div>'));
    await startActive();
    let root = await clickWord('q', 'shkon');
    press(root, 'new');
    await until(async () => (await deviceEvents('ItemMarked')).length === 1);
    expect(pressed(root)).toEqual(['new']);
    await until(async () => (await counts()).seen === 0); // marked New: back among the new words
    expect(marks()['golearn-new']).toContain('shkon');
    expect(await rowOf()).toMatchObject({ level: 'new', selfMark: { mark: 'new' } });
    await flush(15);
    // the same word in the same sentence, again: the lookup is recorded once per session and sentence (dedupeKey), so it is not a new meeting
    await clickWord('q', 'shkon', false);
    await flush(150);
    expect(await deviceEvents('SelectionLookedUp')).toHaveLength(1);
    expect(await rowOf()).toMatchObject({ level: 'new', selfMark: { mark: 'new' } });
    // the word in another sentence is a meeting after the mark
    root = await clickWord('r', 'shkon');
    expect(pressed(root)).toEqual(['seen']);
    expect(await rowOf()).toMatchObject({ level: 'seen', selfMark: { mark: 'new' } });
    await until(() => (marks()['golearn-seen'] ?? []).includes('shkon'));
    expect(marks()['golearn-new']).not.toContain('shkon');
  });
});
