// @vitest-environment jsdom
/**
 * GoLearn Active through the real stack, nothing faked between the page and the worker: the real content script (install), the
 * message bridge, the real background worker with the device-local Repository (no account), the fake chrome. A lookup is
 * recorded on the device; the switch goes on; the page is scanned and the looked-up word is underlined from the device's own
 * rows (the scan's question is not trimmed like a long selection); a click opens the card; the switch goes off and clears.
 *
 * This is the test the owner's report "nothing is underlined in Brave" asked for: the earlier page test used a fake learner model.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { HighlightLike } from '../../packages/golearn-extension/src/active/highlight';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { ACTIVE_ORIGINS } from '../../packages/golearn-extension/src/protocol';
import { flush, selectText, setBody, stubLayout } from './dom';
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

const SENTENCE = 'Unë po lexoj një libër të bukur në shtëpinë time.';
const PAGE = `<div id="content"><p id="p">${SENTENCE}</p><p id="q">Beni shkon në shtëpinë e Anës.</p></div>`;

let install: (chromeApi: unknown, doc: Document) => Promise<{ lookup(req: { trigger: 'command' | 'click' }): Promise<{ status: string; settled?: Promise<void> }>; dispose(): void } | undefined>;
let restore: () => void;
let registry: Map<string, HighlightLike>;
let rig: Rig;

beforeAll(async () => {
  g.__GOLEARN_NO_AUTOINSTALL = true; // the module installs itself on import otherwise (with no chrome in jsdom, and before the fake exists)
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
afterEach(async () => {
  const marker = g.__goLearnExtension as { controller: { dispose(): void }; active: { stop(): void } } | undefined;
  marker?.active.stop(); marker?.controller.dispose();
  delete g.__goLearnExtension;
  restore(); w.CSS = undefined; w.Highlight = undefined; document.documentElement.removeAttribute('lang');
});

const until = async (f: () => boolean, ms = 3000): Promise<void> => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error('timeout'); await flush(20); } };
const marks = (): Record<string, string[]> => Object.fromEntries([...registry].map(([k, h]) => [k, [...(h as FakeHighlight).ranges].map((r) => r.toString())]));

describe('GoLearn Active, real page to real worker', () => {
  it('a word looked up on the device is underlined by the scan after the switch goes on; the words asked about never reach the service', async () => {
    const content = rig.fake.contentChrome(7);
    const controller = (await install(content, document))!;
    await flush(20);
    // 1. a lookup, with no account: recorded in the device-local Repository
    selectText(document.getElementById('p')!, 'shtëpinë');
    const out = await controller.lookup({ trigger: 'command' });
    expect(out.status).toBe('shown');
    await out.settled; await flush(40);
    expect(rig.log.filter((l) => !l.path.includes("/dict/"))).toEqual([]); // the dictionary is read from the extension's own files; the service is never asked
    // 2. the scan's question is refused while the switch is off
    expect(await rig.content({ type: MSG.activeProfile, unitIds: ['lemma:sq:shtëpi:NOUN'], languageId: 'sq' })).toMatchObject({ ok: false, error: 'inactive' });
    expect(registry.size).toBe(0);
    // 3. the switch goes on (permission granted by the learner): the worker starts the page in front
    rig.fake.grantOrigins(ACTIVE_ORIGINS);
    const r = await rig.page({ type: MSG.active, op: 'set', patch: { active: true } });
    expect(r).toMatchObject({ ok: true, settings: { active: true }, registered: true });
    await until(() => registry.size > 0);
    const m = marks();
    expect(m['golearn-seen']).toEqual(['shtëpinë', 'shtëpinë']); // both paragraphs carry the looked-up word; exposure only so far
    expect(Object.keys(m).sort()).toEqual(['golearn-new', 'golearn-seen']);
    expect(m['golearn-new']).toHaveLength(14); // every other word is new to the learner, and marked so
    const ping = await rig.fake.tabs!.sendMessage(7, { type: MSG.ping }) as { active: boolean; enabled: boolean; activeState: { scanned: number; marked: Record<string, number>; languageId?: string; reason?: string } };
    expect(ping.active).toBe(true);
    expect(ping.enabled).toBe(true); // the per-tab selection lookup is part of Active now
    expect(ping.activeState).toMatchObject({ languageId: 'sq', scanned: 16, marked: { new: 14, seen: 2, recognized: 0, familiar: 0, known: 0, automatic: 0 } });
    expect(ping.activeState.reason).toBeUndefined();
    expect(rig.log.filter((l) => !l.path.includes("/dict/"))).toEqual([]); // the scan asked the device, never the service
    // 4. a batch of 60 ids is answered whole (not trimmed to four lemma ids as a long selection would be)
    const ids = Array.from({ length: 50 }, (_, i) => `form:sq:fjala${i}`).concat(['lemma:sq:shtëpi:NOUN']);
    const reply = await rig.content({ type: MSG.activeProfile, unitIds: ids, languageId: 'sq' });
    expect(reply).toMatchObject({ ok: true, source: 'device' });
    expect(Object.keys(reply.rows)).toEqual(['lemma:sq:shtëpi:NOUN']);
  });

  it('a click on a word opens the card through the real stack and records the lookup on the device; switching off clears the page', async () => {
    const content = rig.fake.contentChrome(7);
    await install(content, document);
    rig.fake.grantOrigins(ACTIVE_ORIGINS);
    await rig.page({ type: MSG.active, op: 'set', patch: { active: true } });
    await flush(60);
    const t = document.getElementById('q')!.firstChild as Text;
    (document as unknown as Record<string, unknown>).caretPositionFromPoint = () => ({ offsetNode: t, offset: t.data.indexOf('shkon') + 1 });
    document.getElementById('q')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10, button: 0 }));
    await until(() => !!document.querySelector('[data-golearn-host]'));
    await flush(60);
    const root = (document.querySelector('[data-golearn-host]') as HTMLElement).shadowRoot ?? (g.__goLearnExtension as { controller: { d: { ui: { root(): ShadowRoot | undefined } } } }).controller.d.ui.root();
    expect(root?.textContent).toContain('shkoj');
    const st = await rig.page({ type: MSG.localRepo, op: 'status' });
    expect(st.events).toBeGreaterThanOrEqual(2); // SelectionLookedUp + AnalysisShown from the click
    // the learner marks the word as familiar on the card: the device Repository keeps the mark, and the underline follows it on the next scan
    (root!.querySelector('.rateBtn[data-mark="familiar"]') as HTMLButtonElement).click();
    await until(() => (marks()['golearn-familiar'] ?? []).includes('shkon'), 4000);
    expect(marks()['golearn-new']).not.toContain('shkon');
    const know = await rig.content({ type: MSG.activeProfile, unitIds: ['lemma:sq:shkoj:VERB', 'form:sq:shkon'], languageId: 'sq' });
    expect(Object.values(know.rows as Record<string, { selfMark?: { mark: string } }>).some((r) => r.selfMark?.mark === 'familiar')).toBe(true);
    // "Automatic": the underline becomes the barely visible hairline of an automatic word
    (root!.querySelector('.rateBtn[data-mark="automatic"]') as HTMLButtonElement).click();
    await until(() => (marks()['golearn-automatic'] ?? []).includes('shkon'), 4000);
    expect(marks()['golearn-familiar'] ?? []).not.toContain('shkon');
    expect(root!.querySelector('.rateBtn[data-mark="automatic"]')!.getAttribute('aria-pressed')).toBe('true');
    await rig.page({ type: MSG.active, op: 'set', patch: { active: false } });
    await flush(40);
    expect(registry.size).toBe(0);
    expect(await rig.fake.tabs!.sendMessage(7, { type: MSG.ping })).toMatchObject({ active: false, enabled: false });
  });
});
