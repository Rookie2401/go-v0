// @vitest-environment jsdom
/**
 * The rule (the owner, 2026-11-10: "the loading is so inconsistent and unstable"):
 *   while a page with GoLearn in use is visible, the worker stays warm; a read that finds the worker still opening is retried, never dropped;
 *   and the page never changes language because a request was slow.
 * The worker half (the Repository is not opened on every wake) is in test/extension/background.wake.test.ts.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActiveMode } from '../../packages/golearn-extension/src/content/active';
import { createBridge } from '../../packages/golearn-extension/src/content/services';
import { createKeepWarm, KEEP_WARM_IDLE_MS, KEEP_WARM_MS } from '../../packages/golearn-extension/src/content/warm';
import type { HighlightLike } from '../../packages/golearn-extension/src/active/highlight';
import { getAnalyser } from '../../packages/golearn-extension/src/parser';
import { MSG, type ContentChromeApi } from '../../packages/golearn-extension/src/platform';
import { resolveLanguage } from '../../packages/golearn-extension/src/language/resolve';
import type { KnowledgeView, ProfileReply, PublicStatus } from '../../packages/golearn-extension/src/protocol';
import { registerAllAnalysers } from '../support/analysers';
import { makeRig, selectText, setBody, stubLayout } from '../extension/dom';

registerAllAnalysers();

let visibility: 'visible' | 'hidden' = 'visible';
beforeAll(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility }); });
beforeEach(() => { visibility = 'visible'; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });
const setVisibility = (v: 'visible' | 'hidden'): void => { visibility = v; document.dispatchEvent(new Event('visibilitychange')); };
const tick = async (ms: number): Promise<void> => { await vi.advanceTimersByTimeAsync(ms); };

describe('keep-warm: the page pings the worker while it is read', () => {
  function warm(over: { active?: boolean; alive?: () => boolean; ping?: () => Promise<boolean> } = {}) {
    const state = { active: over.active ?? true, pings: 0 };
    const kw = createKeepWarm({
      doc: document, activeOn: () => state.active, alive: over.alive,
      ping: over.ping ?? (async () => { state.pings++; return true; }),
    });
    return { kw, state };
  }

  it('with Active on and the page visible: one ping at once, then one every KEEP_WARM_MS', async () => {
    const { kw, state } = warm();
    kw.refresh();
    await tick(0);
    expect(state.pings).toBe(1);
    await tick(KEEP_WARM_MS * 3);
    expect(state.pings).toBe(4);
    kw.dispose();
  });

  it('a hidden page never pings; shown again it pings at once; hidden again it stops', async () => {
    const { kw, state } = warm();
    kw.refresh(); await tick(0);
    setVisibility('hidden');
    const before = state.pings;
    await tick(KEEP_WARM_MS * 5);
    expect(state.pings).toBe(before);
    kw.refresh(); await tick(KEEP_WARM_MS); // even asked again while hidden
    expect(state.pings).toBe(before);
    setVisibility('visible'); await tick(0);
    expect(state.pings).toBe(before + 1);
    kw.dispose();
  });

  it('with Active off: nothing, until a word is looked up; then KEEP_WARM_IDLE_MS of pings, then nothing', async () => {
    const { kw, state } = warm({ active: false });
    kw.refresh(); await tick(KEEP_WARM_MS * 3);
    expect(state.pings).toBe(0);
    kw.noteLookup(); await tick(0);
    expect(state.pings).toBe(1);
    await tick(KEEP_WARM_IDLE_MS + KEEP_WARM_MS);
    const after = state.pings;
    expect(after).toBeGreaterThanOrEqual(5);
    expect(after).toBeLessThanOrEqual(8);
    await tick(KEEP_WARM_MS * 10);
    expect(state.pings).toBe(after); // the idle time ran out
    kw.dispose();
  });

  it('turning Active off stops the pings (the next tick finds it off)', async () => {
    const { kw, state } = warm();
    kw.refresh(); await tick(0);
    state.active = false;
    kw.refresh();
    const n = state.pings;
    await tick(KEEP_WARM_MS * 4);
    expect(state.pings).toBe(n);
    kw.dispose();
  });

  it('an orphaned script (the extension was reloaded) stops for good at the first failed send', async () => {
    let throws = false;
    const { kw, state } = warm({ ping: async () => { if (throws) return false; state.pings++; return true; } });
    kw.refresh(); await tick(KEEP_WARM_MS);
    const n = state.pings;
    throws = true;
    await tick(KEEP_WARM_MS * 2);
    throws = false; // even if sending would work again, it does not start again
    setVisibility('hidden'); setVisibility('visible'); kw.refresh(); kw.noteLookup();
    await tick(KEEP_WARM_MS * 5);
    expect(state.pings).toBe(n);
    kw.dispose();
  });

  it('a context that is gone (runtime.id unreadable) sends nothing', async () => {
    let alive = true;
    const { kw, state } = warm({ alive: () => alive });
    kw.refresh(); await tick(0);
    alive = false;
    const n = state.pings;
    await tick(KEEP_WARM_MS * 3);
    expect(state.pings).toBe(n);
    kw.dispose();
  });

  it('wired into the content script: an Active page sends golearn:keep-warm to the worker, and none once hidden', async () => {
    const g = globalThis as unknown as Record<string, unknown>;
    g.__GOLEARN_NO_AUTOINSTALL = true;
    delete g.__goLearnExtension;
    const { install } = await import('../../packages/golearn-extension/src/content/index');
    const sent: string[] = [];
    const api: ContentChromeApi = {
      runtime: {
        id: 'x', getManifest: () => ({ version: '0.1.0' }),
        onMessage: { addListener() {}, removeListener() {}, hasListener: () => false } as never,
        sendMessage: async (m) => {
          const type = (m as { type: string }).type; sent.push(type);
          if (type === MSG.active) return { ok: true, settings: { active: true, speakOnClick: false } };
          return { ok: true };
        },
      },
    };
    setBody('<p>Unë po lexoj një libër.</p>');
    await install(api, document);
    await tick(0);
    expect(sent.filter((t) => t === MSG.keepWarm)).toHaveLength(1);
    await tick(KEEP_WARM_MS);
    expect(sent.filter((t) => t === MSG.keepWarm)).toHaveLength(2);
    setVisibility('hidden');
    await tick(KEEP_WARM_MS * 3);
    expect(sent.filter((t) => t === MSG.keepWarm)).toHaveLength(2);
    const marker = g.__goLearnExtension as { active: { stop(): void }; controller: { dispose(): void }; warm?: { dispose(): void } };
    marker.active.stop(); marker.warm?.dispose(); marker.controller.dispose(); delete g.__goLearnExtension;
  });
});

describe('the bridge: reads are retried, writes never', () => {
  /** A runtime whose answers a test scripts per message type: 'hang' never answers, 'throw' throws, anything else is the reply. */
  function runtime(script: (type: string, n: number) => unknown) {
    const calls: string[] = [];
    const api: ContentChromeApi = {
      runtime: {
        onMessage: { addListener() {}, removeListener() {}, hasListener: () => false } as never,
        sendMessage: (m) => {
          const type = (m as { type: string }).type; calls.push(type);
          const r = script(type, calls.filter((t) => t === type).length);
          if (r === 'hang') return new Promise(() => undefined);
          if (r === 'throw') return Promise.reject(new Error('Could not establish connection'));
          return Promise.resolve(r);
        },
      },
    };
    return { api, calls };
  }

  it('a read that times out twice is asked a third time and answered (at 4 s + 0.4 s + 4 s + 1.2 s)', async () => {
    const { api, calls } = runtime((_type, n) => (n < 3 ? 'hang' : { ok: true, rows: {} }));
    const bridge = createBridge(api);
    const p = bridge.gloss({ lemma: 'x' } as never);
    await tick(4_000 + 400 + 4_000 + 1_200);
    expect(await p).toEqual({ ok: true, rows: {} });
    expect(calls.filter((t) => t === MSG.gloss)).toHaveLength(3);
  });

  it('a read that never answers gives up after three attempts, within 3 x timeout + 1.6 s', async () => {
    const { api, calls } = runtime(() => 'hang');
    const bridge = createBridge(api);
    let done = false;
    const p = bridge.profile({ unitIds: ['form:sq:x'], languageId: 'sq' } as never).then((r) => { done = true; return r; });
    await tick(3 * 4_000 + 1_600 - 1);
    expect(done).toBe(false);
    await tick(2);
    expect(await p).toBeUndefined();
    expect(calls.filter((t) => t === MSG.profile)).toHaveLength(3);
  });

  it('a send that throws (the worker is waking) is retried like a timeout', async () => {
    const { api, calls } = runtime((_t, n) => (n === 1 ? 'throw' : { ok: true }));
    const bridge = createBridge(api);
    const p = bridge.active!();
    await tick(400);
    expect(await p).toEqual({ ok: true });
    expect(calls).toEqual([MSG.active, MSG.active]);
  });

  it('a reply that says no is an answer, not retried', async () => {
    const { api, calls } = runtime(() => ({ ok: false, error: 'inactive' }));
    await createBridge(api).activeProfile!({ unitIds: ['form:sq:x'], languageId: 'sq' } as never);
    expect(calls).toHaveLength(1);
  });

  it('a write that times out is sent once: record, correct and metrics are never repeated by the bridge', async () => {
    const { api, calls } = runtime(() => 'hang');
    const bridge = createBridge(api);
    const ev = { id: 'e1' } as never;
    const writes = [bridge.events.append(ev), bridge.correct({} as never), bridge.metrics.append({} as never)];
    await tick(60_000);
    await Promise.all(writes);
    expect(calls.filter((t) => t === MSG.record)).toHaveLength(1);
    expect(calls.filter((t) => t === MSG.correct)).toHaveLength(1);
    expect(calls.filter((t) => t === MSG.metrics)).toHaveLength(1);
  });
});

// ─────────────────────────── the scan keeps asking until the worker answers ───────────────────────────

class FakeHighlight implements HighlightLike {
  ranges = new Set<Range>();
  add(r: Range) { this.ranges.add(r); return this; }
  delete(r: Range) { return this.ranges.delete(r); }
  clear() { this.ranges.clear(); }
  get size() { return this.ranges.size; }
}
const w = window as unknown as { CSS?: { highlights?: Map<string, HighlightLike> }; Highlight?: typeof FakeHighlight };
const row = (unitId: string): KnowledgeView => ({ unitId, dimensions: { exposure: { score: 0, confidence: 0, observations: 2, positive: 0, negative: 1 } } });

describe('GoLearn Active: marks appear when the worker is ready, without a new scan from the learner', () => {
  let restore: () => void;
  let registry: Map<string, HighlightLike>;
  let active: ActiveMode | undefined;
  beforeEach(() => {
    restore = stubLayout();
    registry = new Map(); w.CSS = { highlights: registry }; w.Highlight = FakeHighlight;
    setBody('<div id="content"><p id="p">Unë po lexoj një libër të bukur në shtëpinë time.</p></div>');
    document.documentElement.lang = 'sq';
  });
  afterEach(() => { active?.stop(); active = undefined; restore(); w.CSS = undefined; w.Highlight = undefined; document.documentElement.removeAttribute('lang'); });

  const marked = (): number => [...registry.values()].reduce((n, h) => n + h.size, 0);
  function activeWith(profile: (ids: string[], languageId: string) => Promise<ProfileReply | undefined>) {
    const rig = makeRig();
    active = new ActiveMode({ doc: document, controller: rig.controller, adapters: rig.deps.adapters, ui: rig.ui, adapterOf: getAnalyser, profile, viewport: 'all' });
    return { rig, active };
  }
  const answer = (ids: string[]): ProfileReply => ({ ok: true, connected: false, source: 'device', rows: Object.fromEntries(ids.map((i) => [i, row(i)])), depth: 'brief', depthOrigin: 'default' });

  it('a batch the bridge could not get answered in two tries is answered on the third: marks are on the page after the first scan', async () => {
    let n = 0;
    const { api } = (() => {
      const a: ContentChromeApi = {
        runtime: {
          onMessage: { addListener() {}, removeListener() {}, hasListener: () => false } as never,
          sendMessage: (m) => {
            const msg = m as { type: string; unitIds: string[] };
            if (msg.type !== MSG.activeProfile) return Promise.resolve({ ok: false });
            return ++n < 3 ? new Promise(() => undefined) : Promise.resolve(answer(msg.unitIds));
          },
        },
      };
      return { api: a };
    })();
    const bridge = createBridge(api);
    const { active: a } = activeWith((unitIds, languageId) => bridge.activeProfile!({ unitIds, languageId }));
    const started = a.start({ speak: false });
    await tick(4_000 + 400 + 4_000 + 1_200 + 10);
    await started;
    expect(n).toBe(3);
    expect(marked()).toBeGreaterThan(0);
    expect(a.state.marked.seen).toBeGreaterThan(0);
  });

  it('a batch that fails every bridge retry is put back: the timer (3 s) asks again and the marks are painted without a scroll', async () => {
    let calls = 0;
    const api: ContentChromeApi = {
      runtime: {
        onMessage: { addListener() {}, removeListener() {}, hasListener: () => false } as never,
        sendMessage: (m) => {
          const msg = m as { type: string; unitIds: string[] };
          if (msg.type !== MSG.activeProfile) return Promise.resolve({ ok: false });
          calls++;
          return calls <= 3 ? Promise.reject(new Error('Could not establish connection')) : Promise.resolve(answer(msg.unitIds));
        },
      },
    };
    const bridge = createBridge(api);
    const { active: a } = activeWith((unitIds, languageId) => bridge.activeProfile!({ unitIds, languageId }));
    const started = a.start({ speak: false });
    await tick(1_600 + 10);
    await started;
    expect(calls).toBe(3);
    expect(marked()).toBe(0); // "0 underlined": what the learner saw before
    await tick(3_000 + 10);
    expect(calls).toBe(4);
    expect(marked()).toBeGreaterThan(0);
  });

  it('the retry is bounded (5 per scan) and stops with Active', async () => {
    let calls = 0;
    const { active: a } = activeWith(async () => { calls++; return undefined; });
    await a.start({ speak: false });
    await tick(3_000 * 12);
    expect(calls).toBe(1 + 5);
    a.stop();
    calls = 0;
    await tick(3_000 * 3);
    expect(calls).toBe(0);
  });

  it('a retry timer pending when Active is turned off asks nothing', async () => {
    let calls = 0;
    const { active: a } = activeWith(async () => { calls++; return undefined; });
    await a.start({ speak: false });
    expect(calls).toBe(1);
    a.stop();
    await tick(3_000 * 3);
    expect(calls).toBe(1);
  });
});

// ─────────────────────────── the language never falls back because a request was slow ───────────────────────────

describe('the page keeps its language when the status is slow', () => {
  let restore: () => void;
  beforeEach(() => { restore = stubLayout(); vi.useRealTimers(); document.documentElement.lang = 'en'; });
  afterEach(() => { restore(); document.documentElement.removeAttribute('lang'); });
  const HINDI = 'क्षत्रिय ज्ञान की खोज में निकला। उसने कहा, मैं कल आऊँगा।';
  const hindi: PublicStatus = { ok: true, connected: false, needsSignIn: false, languageId: 'hi', languageName: 'Hindi', packAvailable: true, installedLanguages: ['hi'] };
  const services = (status: () => Promise<PublicStatus | undefined>) => ({ status, profile: async () => undefined, gloss: async () => undefined, explain: async () => undefined, correct: async () => undefined, pronounceInfo: async () => undefined });

  it('a status that times out after one good answer: the page is still read in the chosen language, not the analyser list or Albanian', async () => {
    setBody(`<main><p id="p">${HINDI}</p></main>`);
    let n = 0;
    const rig = makeRig({ resolveLanguage, analysers: ['sq', 'hi'], services: services(async () => (n++ === 0 ? hindi : undefined)) });
    try {
      expect(await rig.controller.pageLanguages()).toEqual(['hi']);
      expect(await rig.controller.pageLanguages()).toEqual(['hi']); // before: ['sq', 'hi']
      selectText(document.getElementById('p')!, 'खोज');
      const out = await rig.controller.lookup({ trigger: 'click' });
      expect(out.status).toBe('shown');
      if (out.status === 'shown') expect(out.card.language?.languageId).toBe('hi');
    } finally { rig.controller.dispose(); }
  });

  it('with no earlier status the worker is asked once more (it was waking), and that answer is used', async () => {
    setBody(`<main><p id="p">${HINDI}</p></main>`);
    let n = 0;
    const rig = makeRig({ resolveLanguage, analysers: ['sq', 'hi'], services: services(async () => (n++ === 0 ? undefined : hindi)) });
    try {
      expect(await rig.controller.pageLanguages()).toEqual(['hi']);
      expect(n).toBe(2);
    } finally { rig.controller.dispose(); }
  });

  it('with no status at all the default is a guess and the lookup says so: basis team-default (recorded with source unknown), never a declared language', async () => {
    setBody('<main><p id="p">Beni shkon në shkollë.</p></main>');
    const rig = makeRig({ resolveLanguage, analysers: ['sq', 'hi'], services: services(async () => undefined) });
    try {
      selectText(document.getElementById('p')!, 'shkollë');
      const out = await rig.controller.lookup({ trigger: 'click' });
      if (out.status === 'shown') {
        expect(['team-default', 'detection']).toContain(out.card.language?.basis);
        if (out.card.language?.basis === 'team-default') expect(out.card.language.reasons.join(' ')).toMatch(/did not answer/);
      }
    } finally { rig.controller.dispose(); }
  });
});
