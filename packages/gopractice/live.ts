/**
 * Live updates: while GoReview is open, visible, online and signed in, it holds one long request to the Repository service
 * (`POST /sync/wait`, up to 25 s) and learns within seconds that GoLearn pushed something new. The loop:
 *
 *   GET  /sync/status            -> { cursor, events, at }     once, to learn where the account stands (then a normal pull catches up)
 *   POST /sync/wait { since }    -> { changed, cursor, events } held until a push for this learner lands, or the timeout
 *   changed  -> the normal pull (the sync path the app already uses) -> onChanged -> the current screen repaints
 *   !changed -> wait again
 *
 * Bounds, all of them deliberate:
 *   - it runs only while the page is visible (and online, and signed in); hidden or offline aborts the held request at once, and
 *     visibilitychange->visible, pageshow and online start it again. iOS suspends a backgrounded web app: nothing arrives then;
 *   - an error backs off 1 s, 2 s, 4 s ... up to 30 s, and resets on the first success;
 *   - a 404/405/501 from /sync/status or /sync/wait (an older service) switches to the 60 s poll alone;
 *   - independently of the loop, a 60 s periodic pull runs while visible and online (the fallback, and a safety net for the loop);
 *   - at most one held request at a time (the service allows four per learner), and one pull at a time.
 * No timer or listener survives `destroy()`.
 */

export type LiveState = 'idle' | 'live' | 'polling' | 'backoff' | 'offline' | 'hidden' | 'signed-out' | 'auth-expired';

export interface LiveAuth { baseUrl: string; token: string }

export interface LiveOptions {
  win: Window;
  doc: Document;
  fetch: typeof fetch;
  /** The signed-in account's service address and token; undefined when signed out (the loop then stays idle). */
  auth(): Promise<LiveAuth | undefined>;
  /** The normal sync (push the queue, pull what is new). `reason` says why: 'wait' = a wait answered changed. Returns how many events the pull appended. */
  pull(reason: 'catchup' | 'wait' | 'poll'): Promise<{ appended: number; cursor?: number } | undefined>;
  /** Something new arrived: a wait answered `changed` (after its pull), or a periodic pull appended events. */
  onChanged(info: { appended: number; source: 'wait' | 'poll' }): void | Promise<void>;
  onState?(state: LiveState): void;
  /** Timer functions (tests may pass fakes); default the global ones. */
  timers?: { set(fn: () => void, ms: number): unknown; clear(h: unknown): void };
  waitTimeoutMs?: number;
  pollMs?: number;
  backoff?: { baseMs: number; maxMs: number };
  /** The least time one wait round may take, so a service that answers `changed: false` at once cannot make the loop spin. */
  minRoundMs?: number;
}

export interface Live {
  /** Start (or restart) the loop if the page is visible, online and signed in. */
  kick(): void;
  stop(): void;
  state(): LiveState;
  destroy(): void;
}

class Unsupported extends Error {}
class AuthRefused extends Error {}
class Aborted extends Error {}

const WAIT_MAX = 25_000;

export function createLive(opts: LiveOptions): Live {
  const { win, doc } = opts;
  const timers = opts.timers ?? { set: (fn, ms) => globalThis.setTimeout(fn, ms), clear: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>) };
  const waitTimeout = Math.min(opts.waitTimeoutMs ?? WAIT_MAX, WAIT_MAX);
  const pollMs = opts.pollMs ?? 60_000;
  const backoff = opts.backoff ?? { baseMs: 1_000, maxMs: 30_000 };
  const minRound = opts.minRoundMs ?? 400;

  let state: LiveState = 'idle';
  let generation = 0;
  let running = false;
  let destroyed = false;
  let abort: AbortController | undefined;
  let pollTimer: unknown;
  let sleepTimer: unknown;
  let sleepWake: (() => void) | undefined;
  let pulling: Promise<void> | undefined;
  let pollOnly = false;

  const setState = (s: LiveState): void => { if (s !== state) { state = s; try { opts.onState?.(s); } catch { /* a listener must not stop the loop */ } } };
  const visible = (): boolean => !(doc.hidden || doc.visibilityState === 'hidden');
  const online = (): boolean => (win.navigator ? win.navigator.onLine !== false : true);
  const eligible = (): boolean => !destroyed && visible() && online();

  // ───────────── requests ─────────────

  const url = (a: LiveAuth, path: string): string => `${a.baseUrl.replace(/\/+$/, '')}${path}`;
  const headers = (a: LiveAuth): Record<string, string> => ({ Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json', Accept: 'application/json' });

  async function call<T>(a: LiveAuth, path: string, init: { method: 'GET' | 'POST'; body?: unknown }, signal: AbortSignal): Promise<T> {
    let r: Response;
    try {
      r = await opts.fetch(url(a, path), { method: init.method, headers: headers(a), ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}), signal, cache: 'no-store' });
    } catch (e) {
      if (signal.aborted) throw new Aborted();
      throw e;
    }
    if (r.status === 404 || r.status === 405 || r.status === 501) throw new Unsupported(path);
    if (r.status === 401 || r.status === 403) throw new AuthRefused(path);
    if (!r.ok) throw new Error(`${path} answered ${r.status}`);
    const text = await r.text();
    try { return JSON.parse(text) as T; } catch { throw new Unsupported(`${path} did not answer JSON`); } // a host that returns index.html for any path is "older service" too
  }

  const cursorOf = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined);

  // ───────────── pulling ─────────────

  /** One pull at a time: a pull asked for while another runs starts when that one has finished (so it sees what landed meanwhile). */
  function pullOnce(reason: 'catchup' | 'wait' | 'poll'): Promise<{ appended: number; cursor?: number } | undefined> {
    const next = (pulling ?? Promise.resolve()).then(async () => { try { return await opts.pull(reason); } catch { return undefined; } });
    const tracked = next.then(() => undefined);
    pulling = tracked;
    void tracked.then(() => { if (pulling === tracked) pulling = undefined; });
    return next;
  }

  // ───────────── sleeping ─────────────

  function sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = (): void => { if (sleepTimer !== undefined) timers.clear(sleepTimer); sleepTimer = undefined; sleepWake = undefined; resolve(); };
      sleepWake = done;
      sleepTimer = timers.set(done, ms);
    });
  }

  // ───────────── the loop ─────────────

  async function loop(gen: number): Promise<void> {
    let since: string | undefined;
    let token: string | undefined;
    let failures = 0;
    while (gen === generation && eligible()) {
      const a = await opts.auth();
      if (gen !== generation) return;
      if (!a) { setState('signed-out'); return; }
      if (a.token !== token) { token = a.token; since = undefined; }
      const ctl = new AbortController();
      abort = ctl;
      const began = Date.now();
      try {
        if (since === undefined) {
          const st = await call<{ cursor?: unknown }>(a, '/sync/status', { method: 'GET' }, ctl.signal);
          const c = cursorOf(st.cursor);
          if (c === undefined) throw new Unsupported('/sync/status gave no cursor');
          // the cursor is taken BEFORE the catch-up pull: anything that lands in between makes the first wait answer at once
          since = c;
          setState('live');
          const r = await pullOnce('catchup');
          if (gen !== generation) return;
          if (r && r.appended > 0) await opts.onChanged({ appended: r.appended, source: 'poll' });
          failures = 0;
          continue;
        }
        setState('live');
        const w = await call<{ changed?: unknown; cursor?: unknown }>(a, '/sync/wait', { method: 'POST', body: { since, timeoutMs: waitTimeout } }, ctl.signal);
        if (gen !== generation) return;
        failures = 0;
        const next = cursorOf(w.cursor) ?? since;
        if (w.changed === true) {
          const r = await pullOnce('wait');
          if (gen !== generation) return;
          await opts.onChanged({ appended: r?.appended ?? 0, source: 'wait' });
          // after a full pull the account's head is what the pull reached; never move the cursor backwards past it
          since = r?.cursor !== undefined && Number(next) <= r.cursor ? String(r.cursor) : next;
        } else {
          since = next;
          const took = Date.now() - began;
          if (took < minRound) await sleep(minRound - took);
        }
      } catch (e) {
        if (e instanceof Aborted || gen !== generation) return;
        if (e instanceof Unsupported) { pollOnly = true; setState('polling'); return; }
        if (e instanceof AuthRefused) { setState('auth-expired'); return; }
        failures += 1;
        setState('backoff');
        await sleep(Math.min(backoff.baseMs * 2 ** (failures - 1), backoff.maxMs));
      } finally {
        if (abort === ctl) abort = undefined;
      }
    }
    if (gen === generation && !destroyed) setState(!visible() ? 'hidden' : !online() ? 'offline' : 'idle');
  }

  // ───────────── the periodic pull ─────────────

  function schedulePoll(): void {
    if (pollTimer !== undefined) timers.clear(pollTimer);
    pollTimer = undefined;
    if (!eligible()) return;
    pollTimer = timers.set(() => {
      pollTimer = undefined;
      if (!eligible()) return;
      void (async () => {
        const a = await opts.auth();
        if (a) {
          const r = await pullOnce('poll');
          if (r && r.appended > 0) { try { await opts.onChanged({ appended: r.appended, source: 'poll' }); } catch { /* a repaint failure must not stop the poll */ } }
        }
        schedulePoll();
      })();
    }, pollMs);
  }

  // ───────────── control ─────────────

  function halt(next: LiveState): void {
    generation += 1;
    running = false;
    if (abort) { try { abort.abort(); } catch { /* */ } abort = undefined; }
    if (sleepWake) sleepWake();
    if (pollTimer !== undefined) { timers.clear(pollTimer); pollTimer = undefined; }
    setState(next);
  }

  function kick(): void {
    if (destroyed) return;
    if (!visible()) { halt('hidden'); return; }
    if (!online()) { halt('offline'); return; }
    schedulePoll();
    if (running || pollOnly) { if (pollOnly) setState('polling'); return; }
    running = true;
    const gen = ++generation;
    void loop(gen).finally(() => { if (gen === generation) running = false; });
  }

  const onVisibility = (): void => { if (visible()) { pollOnly = false; kick(); } else halt('hidden'); };
  const onPageShow = (): void => { pollOnly = false; halt(state); kick(); };
  const onOnline = (): void => { pollOnly = false; halt(state); kick(); };
  const onOffline = (): void => halt('offline');
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pageshow', onPageShow);
  win.addEventListener('online', onOnline);
  win.addEventListener('offline', onOffline);

  return {
    kick,
    stop: () => halt('idle'),
    state: () => state,
    destroy() {
      destroyed = true;
      halt('idle');
      doc.removeEventListener('visibilitychange', onVisibility);
      win.removeEventListener('pageshow', onPageShow);
      win.removeEventListener('online', onOnline);
      win.removeEventListener('offline', onOffline);
    },
  };
}
