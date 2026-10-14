// @vitest-environment node
/**
 * Live updates (packages/gopractice/live.ts) against a scripted service, with fake timers and a fake fetch: wait -> changed -> the normal pull ->
 * repaint; a hidden page stops, a visible one restarts; an older service (404) falls back to the 60 s poll; errors back off 1 s -> 30 s.
 * The screens' own reaction (no repaint under a card mid-answer) is in live-app.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLive, type Live, type LiveOptions } from '../../packages/gopractice/live';

/** A window and a document that only carry what the loop reads and listens to. */
function pageRig() {
  const win = Object.assign(new EventTarget(), { navigator: { onLine: true } });
  const doc = Object.assign(new EventTarget(), { hidden: false, visibilityState: 'visible' });
  return {
    win: win as unknown as Window, doc: doc as unknown as Document,
    hide() { doc.hidden = true; doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange')); },
    show() { doc.hidden = false; doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange')); },
    offline() { win.navigator.onLine = false; win.dispatchEvent(new Event('offline')); },
    online() { win.navigator.onLine = true; win.dispatchEvent(new Event('online')); },
    pageshow() { win.dispatchEvent(new Event('pageshow')); },
    listeners: () => 0,
  };
}

interface Call { path: string; method: string; body?: { since?: string; timeoutMs?: number }; headers: Record<string, string>; signal: AbortSignal }
type Reply = { status?: number; json?: unknown; throws?: Error };

/** A service whose /sync/wait is held until the test answers it (or the request is aborted). */
function scriptedService() {
  const calls: Call[] = [];
  const held: Array<{ call: Call; answer(r: Reply): void }> = [];
  const state = { status: { status: 200, json: { cursor: '5', events: 5, at: 'now' } } as Reply, waitMode: 'hold' as 'hold' | Reply, statusCalls: 0 };
  const respond = (r: Reply): Response => {
    if (r.throws) throw r.throws;
    const status = r.status ?? 200;
    return new Response(r.json === undefined ? '' : JSON.stringify(r.json), { status });
  };
  const fetchFn = (async (input: string, init: RequestInit) => {
    const url = new URL(input);
    const call: Call = { path: url.pathname, method: init.method ?? 'GET', headers: init.headers as Record<string, string>, signal: init.signal as AbortSignal, ...(init.body ? { body: JSON.parse(String(init.body)) } : {}) };
    calls.push(call);
    if (url.pathname === '/sync/status') { state.statusCalls += 1; return respond(state.status); }
    if (url.pathname === '/sync/wait') {
      if (state.waitMode !== 'hold') return respond(state.waitMode);
      return new Promise<Response>((resolve, reject) => {
        call.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        held.push({ call, answer: (r) => { try { resolve(respond(r)); } catch (e) { reject(e); } } });
      });
    }
    return new Response('', { status: 404 });
  }) as unknown as typeof fetch;
  return { calls, held, state, fetchFn, waits: () => calls.filter((c) => c.path === '/sync/wait') };
}

const flush = async (ms = 0): Promise<void> => { await vi.advanceTimersByTimeAsync(ms); };

describe('live updates', () => {
  let page: ReturnType<typeof pageRig>;
  let svc: ReturnType<typeof scriptedService>;
  let live: Live | undefined;
  let pulls: Array<{ reason: string }>;
  let changed: Array<{ appended: number; source: string }>;
  let pullResult: { appended: number; cursor?: number };
  let token: string | undefined;

  const make = (extra: Partial<LiveOptions> = {}): Live => {
    live = createLive({
      win: page.win, doc: page.doc, fetch: svc.fetchFn,
      auth: async () => (token ? { baseUrl: 'https://repo.test', token } : undefined),
      pull: async (reason) => { pulls.push({ reason }); return pullResult; },
      onChanged: (i) => { changed.push(i); },
      ...extra,
    });
    return live;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    page = pageRig(); svc = scriptedService(); pulls = []; changed = []; pullResult = { appended: 0 }; token = 'tok-1';
  });
  afterEach(() => { live?.destroy(); live = undefined; vi.useRealTimers(); });

  it('learns where the account stands, catches up with a pull, then holds one wait from that cursor (authed, with the timeout)', async () => {
    make().kick();
    await flush();
    expect(svc.calls[0]).toMatchObject({ path: '/sync/status', method: 'GET' });
    expect(svc.calls[0].headers.Authorization).toBe('Bearer tok-1');
    expect(pulls).toEqual([{ reason: 'catchup' }]);
    expect(svc.waits()).toHaveLength(1);
    expect(svc.waits()[0].body).toEqual({ since: '5', timeoutMs: 25_000 });
    expect(live!.state()).toBe('live');
  });

  it('wait -> changed -> the normal pull -> onChanged (repaint), then waits again from the new cursor', async () => {
    make().kick();
    await flush();
    pullResult = { appended: 2, cursor: 7 };
    svc.held[0].answer({ json: { changed: true, cursor: '7', events: 7 } });
    await flush();
    expect(pulls.map((p) => p.reason)).toEqual(['catchup', 'wait']);
    expect(changed).toEqual([{ appended: 2, source: 'wait' }]);
    expect(svc.waits()).toHaveLength(2);
    expect(svc.waits()[1].body!.since).toBe('7');
  });

  it('changed:false just waits again (from the cursor it was given), with no pull and no repaint', async () => {
    make().kick();
    await flush();
    svc.held[0].answer({ json: { changed: false, cursor: '5', events: 5 } });
    await flush(500);
    expect(pulls.map((p) => p.reason)).toEqual(['catchup']);
    expect(changed).toEqual([]);
    expect(svc.waits()).toHaveLength(2);
  });

  it('cannot spin: a service that answers changed:false at once is asked no faster than every 400 ms', async () => {
    svc.state.waitMode = { json: { changed: false, cursor: '5', events: 5 } };
    make().kick();
    await flush(2_000);
    expect(svc.waits().length).toBeGreaterThan(2);
    expect(svc.waits().length).toBeLessThanOrEqual(6);
  });

  it('a hidden page aborts the held request and stops; a visible page starts again (a fresh status, a fresh wait)', async () => {
    make().kick();
    await flush();
    const first = svc.waits()[0];
    page.hide();
    await flush();
    expect(first.signal.aborted).toBe(true);
    expect(live!.state()).toBe('hidden');
    const sent = svc.calls.length;
    await flush(120_000); // a minute and more with the page in the background: not one request, not one poll
    expect(svc.calls.length).toBe(sent);
    expect(pulls.map((p) => p.reason)).toEqual(['catchup']);
    page.show();
    await flush();
    expect(svc.calls.length).toBeGreaterThan(sent);
    expect(svc.waits()).toHaveLength(2);
    expect(live!.state()).toBe('live');
  });

  it('pageshow (back from the page cache) and online restart it, and going offline stops it', async () => {
    make().kick();
    await flush();
    page.offline();
    await flush();
    expect(svc.waits()[0].signal.aborted).toBe(true);
    expect(live!.state()).toBe('offline');
    page.online();
    await flush();
    expect(svc.waits()).toHaveLength(2);
    page.pageshow();
    await flush();
    expect(svc.waits()[1].signal.aborted).toBe(true);   // the old wait was dropped, never two held at once
    expect(svc.waits()).toHaveLength(3);
    expect(svc.waits().filter((w) => !w.signal.aborted)).toHaveLength(1);
  });

  it('kicking twice holds one request, not two (the service allows four per learner)', async () => {
    const l = make();
    l.kick(); l.kick();
    await flush();
    l.kick();
    await flush();
    expect(svc.waits()).toHaveLength(1);
  });

  it('an older service (404 from /sync/status) falls back to the 60 s pull alone: no waits, a pull every minute, a repaint when it brings events', async () => {
    svc.state.status = { status: 404 };
    make().kick();
    await flush();
    expect(live!.state()).toBe('polling');
    expect(svc.waits()).toHaveLength(0);
    expect(pulls).toEqual([]);
    pullResult = { appended: 0 };
    await flush(60_000);
    expect(pulls.map((p) => p.reason)).toEqual(['poll']);
    expect(changed).toEqual([]);
    pullResult = { appended: 3 };
    await flush(60_000);
    expect(pulls).toHaveLength(2);
    expect(changed).toEqual([{ appended: 3, source: 'poll' }]);
    expect(svc.state.statusCalls).toBe(1);
    expect(svc.waits()).toHaveLength(0);
  });

  it('a 404 from /sync/wait itself (status exists, wait does not) falls back the same way', async () => {
    svc.state.waitMode = { status: 404 };
    make().kick();
    await flush();
    expect(live!.state()).toBe('polling');
    await flush(60_000);
    expect(pulls.map((p) => p.reason)).toEqual(['catchup', 'poll']);
  });

  it('a service that answers something other than JSON (a host returning its index page) counts as an older service', async () => {
    const orig = svc.fetchFn;
    svc.fetchFn = (async (i: string, init: RequestInit) => (String(i).endsWith('/sync/status') ? new Response('<!doctype html>', { status: 200 }) : orig(i, init))) as typeof fetch;
    make().kick();
    await flush();
    expect(live!.state()).toBe('polling');
  });

  it('backs off 1 s, 2 s, 4 s ... up to 30 s on errors, and starts again at 1 s after a success', async () => {
    svc.state.waitMode = { status: 500 };
    make({ minRoundMs: 0 }).kick();
    await flush();                       // status ok, then wait #1 fails
    expect(svc.waits()).toHaveLength(1);
    expect(live!.state()).toBe('backoff');
    await flush(999); expect(svc.waits()).toHaveLength(1);
    await flush(1);   expect(svc.waits()).toHaveLength(2);     // after 1 s
    await flush(1_999); expect(svc.waits()).toHaveLength(2);
    await flush(1);   expect(svc.waits()).toHaveLength(3);     // after 2 s more
    await flush(3_999); expect(svc.waits()).toHaveLength(3);
    await flush(1);   expect(svc.waits()).toHaveLength(4);     // after 4 s more
    // the delays double to a ceiling of 30 s
    for (const gap of [8_000, 16_000, 30_000, 30_000]) { const n = svc.waits().length; await flush(gap - 1); expect(svc.waits()).toHaveLength(n); await flush(1); expect(svc.waits()).toHaveLength(n + 1); }
    // a good answer resets it
    svc.state.waitMode = 'hold';
    await flush(30_000);
    svc.held.at(-1)!.answer({ json: { changed: false, cursor: '5', events: 5 } });
    await flush(1_000);
    svc.held.at(-1)!.answer({ status: 500 });
    await flush();
    const n = svc.waits().length;
    await flush(999); expect(svc.waits()).toHaveLength(n);
    await flush(1);   expect(svc.waits()).toHaveLength(n + 1);
  });

  it('a network failure (fetch throws) backs off as an error does', async () => {
    svc.state.waitMode = { throws: new TypeError('Failed to fetch') };
    make({ minRoundMs: 0 }).kick();
    await flush();
    expect(live!.state()).toBe('backoff');
    await flush(1_000);
    expect(svc.waits()).toHaveLength(2);
  });

  it('a refused token (401) stops the loop and says so', async () => {
    svc.state.waitMode = { status: 401 };
    const l = make();
    l.kick();
    await flush();
    expect(l.state()).toBe('auth-expired');
    const n = svc.waits().length;
    await flush(60_000);
    expect(svc.waits()).toHaveLength(n);
  });

  it('does nothing while signed out, and starts when a token appears and the app kicks it', async () => {
    token = undefined;
    const l = make();
    l.kick();
    await flush();
    expect(l.state()).toBe('signed-out');
    expect(svc.calls).toEqual([]);
    token = 'tok-2';
    l.kick();
    await flush();
    expect(svc.waits()).toHaveLength(1);
    expect(svc.waits()[0].headers.Authorization).toBe('Bearer tok-2');
  });

  it('another account starts from its own status (the cursor of the first is not reused)', async () => {
    make({ minRoundMs: 0 }).kick();
    await flush();
    token = 'tok-2';
    svc.state.status = { status: 200, json: { cursor: '90', events: 90, at: 'now' } };
    svc.held[0].answer({ json: { changed: false, cursor: '5', events: 5 } });
    await flush();
    expect(svc.state.statusCalls).toBe(2);
    expect(svc.waits().at(-1)!.body!.since).toBe('90');
  });

  it('also pulls every 60 s while visible and online (the safety net), and brings a repaint when that pull finds events', async () => {
    make().kick();
    await flush();
    pullResult = { appended: 4 };
    await flush(60_000);
    expect(pulls.map((p) => p.reason)).toEqual(['catchup', 'poll']);
    expect(changed).toEqual([{ appended: 4, source: 'poll' }]);
  });

  it('a pull in flight is not started twice (a wait answering while the poll fires)', async () => {
    let release!: () => void;
    let running = 0; let most = 0;
    make({ pull: async () => { running += 1; most = Math.max(most, running); await new Promise<void>((r) => { release = r; }); running -= 1; return { appended: 0 }; } }).kick();
    await flush();
    release();
    await flush();
    svc.held[0].answer({ json: { changed: true, cursor: '6', events: 6 } });
    await flush(60_000);
    expect(most).toBe(1);
  });

  it('destroy removes every listener and timer', async () => {
    const l = make();
    l.kick();
    await flush();
    l.destroy();
    const n = svc.calls.length;
    page.hide(); page.show(); page.online(); page.pageshow();
    await flush(120_000);
    expect(svc.calls.length).toBe(n);
    expect(vi.getTimerCount()).toBe(0);
  });
});
