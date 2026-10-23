// @vitest-environment jsdom
/**
 * Biblia kept current while it is open (the standalone edition, signed in): the levels refresh on focus, when the tab becomes visible and every
 * 60 s while visible; and the whole path in the real app over the real Genesis / John data and a fake Repository `fetch`: sign in at #/account,
 * levels painted on the chapter, a tap recorded (and the word Seen at once), a mark repainted at once, a change made elsewhere picked up on focus,
 * a lookup made offline queued and sent when the browser is online again, sign out repainting without levels. No network.
 */
import fs from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAccountService, type AccountService } from '../../packages/biblia/src/account';
import { createBibliaApp, type BibliaApp } from '../../packages/biblia/src/app';
import type { DataSource } from '../../packages/biblia/src/data';
import { LEVEL_ATTR, REFRESH_MS, createLevels, unitIdsOfSite, type LevelSite } from '../../packages/biblia/src/levels';
import { createEventQueue } from '../../packages/biblia/src/queue';
import { accountRecorder, type AccountRecorder } from '../../packages/biblia/src/repo';
import { languageMeta } from '../../packages/golearn-extension/src/parser/registry';
import type { GoEvent, UnitKnowledge } from '../../packages/repository-contract/src';
import { elAdapter } from '../../src/adapters/el';
import { setBody, stubLayout } from '../extension/dom';
import { registerAllAnalysers } from '../support/analysers';

function memoryStorage(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => { data.delete(k); },
    setItem: (k, v) => { data.set(k, String(v)); },
  };
}
const setVisibility = (state: 'visible' | 'hidden'): void => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state }); };

// ── the timing of the refreshes ──
describe('the levels stay current while the tab is open', () => {
  const SENTENCE = 'Ἐν ἀρχῇ ἦν ὁ λόγος';
  function sites(): LevelSite[] {
    document.body.innerHTML = '';
    return elAdapter.tokenize(SENTENCE).filter((t) => t.isWord).map((t) => {
      const el = document.createElement('button');
      document.body.append(el);
      return { el, lang: 'el' as const, sentence: SENTENCE, start: t.start, end: t.end, surface: SENTENCE.slice(t.start, t.end), varietyId: 'el-koi' };
    });
  }
  let calls: string[][];
  let rows: Record<string, Partial<UnitKnowledge>>;
  const knowledge = async (ids?: string[]) => {
    calls.push(ids ?? []);
    return { ok: true as const, status: 200, data: { knowledge: (ids ?? []).filter((id) => rows[id]).map((id) => ({ learnerId: 'L1', unitId: id, languageId: 'el', level: 'new', encounters: 0, ...rows[id] }) as UnitKnowledge) } };
  };
  beforeEach(() => { vi.useFakeTimers(); calls = []; rows = {}; setVisibility('visible'); });
  afterEach(() => { vi.useRealTimers(); setVisibility('visible'); });

  it('refreshes every 60 seconds while visible, not while hidden, and when the tab becomes visible or focused', async () => {
    expect(REFRESH_MS).toBe(60_000);
    const s = sites();
    const levels = createLevels({ win: window, doc: document, api: () => ({ knowledge: knowledge as never }), yieldNow: async () => undefined });
    await levels.setChapter('read/John/1', s);
    const afterOpen = calls.length;
    expect(afterOpen).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(59_000);
    expect(calls.length).toBe(afterOpen);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls.length).toBeGreaterThan(afterOpen); // the minute came round: the whole chapter was asked again
    const afterMinute = calls.length;

    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(180_000);
    expect(calls.length).toBe(afterMinute); // hidden: no requests

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.length).toBeGreaterThan(afterMinute); // the tab came back: asked at once
    const afterVisible = calls.length;

    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.length).toBeGreaterThan(afterVisible); // focus: asked at once
    levels.destroy();
  });

  it('a change made elsewhere shows on the next refresh; after destroy nothing more is asked', async () => {
    const s = sites();
    const levels = createLevels({ win: window, doc: document, api: () => ({ knowledge: knowledge as never }), yieldNow: async () => undefined });
    await levels.setChapter('read/John/1', s);
    expect(s[0].el.getAttribute(LEVEL_ATTR)).toBe('new');
    rows[unitIdsOfSite(s[0])[0]] = { level: 'familiar' }; // learned in GoReview or the extension meanwhile
    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(s[0].el.getAttribute(LEVEL_ATTR)).toBe('familiar');
    levels.destroy();
    const n = calls.length;
    await vi.advanceTimersByTimeAsync(REFRESH_MS * 3);
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.length).toBe(n);
  });

  it('after the learner own events only those units are asked again', async () => {
    const s = sites();
    const levels = createLevels({ win: window, doc: document, api: () => ({ knowledge: knowledge as never }), yieldNow: async () => undefined });
    await levels.setChapter('read/John/1', s);
    calls.length = 0;
    const ids = unitIdsOfSite(s[2]);
    rows[ids[0]] = { level: 'seen', encounters: 1 };
    await levels.refresh(ids);
    expect(calls.flat().sort()).toEqual([...ids].sort());
    expect(s[2].el.getAttribute(LEVEL_ATTR)).toBe('seen');
    levels.destroy();
  });
});

// ── the whole path, in the real app ──
const DATA = 'packages/biblia/public/data';
const localSource: DataSource = {
  async fetchJson(path) {
    const file = path.startsWith('lexicon/') ? `public/${path}` : `${DATA}/${path.replace(/^data\//, '')}`;
    if (!fs.existsSync(file)) throw new Error(`no such file ${file}`);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  },
  async fetchBytes(path) {
    const file = `public/${path}`;
    if (!fs.existsSync(file)) throw new Error(`no such file ${file}`);
    return new Uint8Array(fs.readFileSync(file));
  },
};

const SERVICE = 'https://repo.example.org';
const PASSWORD = 'correct horse battery';
/** A fake Repository service as a `fetch`: accounts, sessions, enrolments, events (which move a simple knowledge projection) and knowledge. */
class FakeEngine {
  email = 'ana@example.org';
  token = 'tok-fake-1';
  down = false;
  revoked = new Set<string>();
  events: GoEvent[] = [];
  rows = new Map<string, Partial<UnitKnowledge>>();
  asked: string[] = [];
  deleted = 0;
  private json(status: number, body?: unknown): Response {
    return status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body ?? {}), { status, headers: { 'Content-Type': 'application/json' } });
  }
  readonly fetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (this.down) throw new TypeError('network down');
    const url = new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const authed = headers.Authorization === `Bearer ${this.token}` && !this.revoked.has(this.token);
    const key = `${method} ${url.pathname}`;
    if (key === 'POST /sessions') return body?.email === this.email && body?.password === PASSWORD ? this.json(201, { token: this.token, learnerId: 'L1', expiresAt: '2099-01-01T00:00:00.000Z' }) : this.json(401, { error: 'bad-credentials', message: 'The email or the password is not right.' });
    if (!authed) return this.json(401, { error: 'unauthorized', message: 'Sign in.' });
    if (key === 'DELETE /sessions/current') { this.deleted++; this.revoked.add(this.token); return this.json(204); }
    if (key === 'GET /me') return this.json(200, { learner: null, account: { accountId: 'A1', email: this.email, createdAt: '2026-09-01T00:00:00.000Z' }, enrolments: [], devices: [], consents: [] });
    if (key === 'GET /enrolments') return this.json(200, { enrolments: [{ enrolmentId: 'enr-el', languageId: 'el', varietyId: 'el-koi' }, { enrolmentId: 'enr-he', languageId: 'he', varietyId: 'he-bib' }] });
    if (key === 'POST /events') {
      for (const e of (body?.events ?? []) as GoEvent[]) {
        this.events.push(e);
        for (const id of e.subject?.itemIds ?? []) {
          const cur = this.rows.get(id) ?? {};
          if (e.kind === 'SelectionLookedUp') this.rows.set(id, { ...cur, level: cur.level ?? 'seen', encounters: (cur.encounters ?? 0) + 1 });
          if (e.kind === 'ItemMarked') { const m = (e.payload as { mark: UnitKnowledge['level'] }).mark; this.rows.set(id, { ...cur, level: m, selfMark: { mark: m, at: e.at } }); }
        }
      }
      return this.json(201, { outcomes: [], stored: (body?.events as unknown[]).length, duplicates: 0, head: this.events.length, projected: true });
    }
    if (key === 'GET /knowledge') {
      const ids = (url.searchParams.get('unitIds') ?? '').split(',').filter(Boolean);
      this.asked.push(...ids);
      return this.json(200, { knowledge: ids.filter((id) => this.rows.has(id)).map((id) => ({ learnerId: 'L1', unitId: id, languageId: 'el', level: 'new', encounters: 0, ...this.rows.get(id) })) });
    }
    return this.json(404, { error: 'not-found', message: key });
  }) as typeof fetch;
}

let restore: () => void;
let app: BibliaApp | undefined;
beforeEach(() => { restore = stubLayout(); setBody('<div id="app"></div>'); window.location.hash = ''; setVisibility('visible'); window.scrollTo = (() => undefined) as typeof window.scrollTo; });
afterEach(() => { app?.destroy(); app = undefined; restore(); });

describe.skipIf(!fs.existsSync(`${DATA}/canon.json`) || !fs.existsSync(`${DATA}/el/John.json`) || !languageMeta('el'))('the standalone edition over a fake service', { timeout: 60_000 }, () => {
  beforeAll(() => { registerAllAnalysers(); });
  const q = <T extends Element>(sel: string): T => document.querySelector(sel) as T;
  const words = (): HTMLElement[] => [...document.querySelectorAll('.reader .prose button.word')] as HTMLElement[];
  const painted = (): number => words().filter((b) => b.hasAttribute(LEVEL_ATTR)).length;
  const submitSignIn = (email: string, password: string): void => {
    q<HTMLInputElement>('#account-email').value = email;
    q<HTMLInputElement>('#account-password').value = password;
    q<HTMLFormElement>('#account-form').dispatchEvent(new Event('submit', { cancelable: true }));
  };

  async function start(opts: { storage?: ReturnType<typeof memoryStorage>; svc?: FakeEngine } = {}) {
    const svc = opts.svc ?? new FakeEngine();
    const storage = opts.storage ?? memoryStorage();
    const account: AccountService = createAccountService({ serviceUrl: SERVICE, storage, fetch: svc.fetch });
    const recorder: AccountRecorder = accountRecorder({
      session: () => { const s = account.session(); const api = account.api(); return s && api ? { api, learnerId: s.learnerId, deviceId: s.deviceId } : undefined; },
      queue: createEventQueue(storage), storage, win: window,
      onAppended: (e) => account.emitAppended(e), onAuthExpired: () => account.expire(),
    });
    app = await createBibliaApp({ win: window, doc: document, source: localSource, recorder, account, storage, now: () => new Date() });
    return { svc, storage, account, recorder };
  }

  it('signed out: the library offers to sign in, says it is a reader only, and the chapter carries no levels', async () => {
    const { svc } = await start();
    expect(q('#accountline a').getAttribute('href')).toBe('#/account');
    expect(q('#accountline').textContent).toBe('Sign in to record what you read');
    expect(document.body.textContent).toContain('Biblia is a reader only');
    await app!.go('#/read/John/1');
    expect(words().length).toBeGreaterThan(100);
    expect(painted()).toBe(0);
    expect(document.querySelector('#level-legend')).toBeNull();
    expect(svc.asked).toHaveLength(0);
  });

  it('sign in at #/account, then the chapter is painted, a tap is recorded and the word is Seen at once, a mark is repainted at once, and sign out removes the levels', async () => {
    const { svc, account, recorder } = await start();
    await app!.go('#/account');
    expect(app!.route).toBe('account');
    submitSignIn('ana@example.org', PASSWORD);
    await vi.waitFor(() => expect(account.state().signedIn).toBe(true));
    await vi.waitFor(() => expect(app!.route).toBe('library'));
    expect(q('#accountline').textContent).toMatch(/^Signed in as ana@example.org/);
    expect(recorder.mode).toBe('account');
    expect(document.body.textContent).toContain('recorded in your GoLearn account (ana@example.org)');
    expect(document.body.textContent).not.toContain(PASSWORD);

    // the chapter: every word is asked about, none is known yet, so every word is New
    await app!.go('#/read/John/1');
    await vi.waitFor(() => expect(painted()).toBe(words().length));
    expect(words().every((b) => b.getAttribute(LEVEL_ATTR) === 'new')).toBe(true);
    expect(q('#level-legend').textContent).toMatch(/New.*Seen.*Recognized.*Familiar/);
    expect(svc.asked.length).toBeGreaterThan(50);

    // a tap: recorded under the account's Greek enrolment, and the word (and its other occurrences) is Seen at once
    const tapped = words().find((b) => b.textContent === 'λόγος')!;
    tapped.click();
    await vi.waitFor(() => expect(svc.events.map((e) => e.kind)).toEqual(['SelectionLookedUp']));
    expect(svc.events[0]).toMatchObject({ learnerId: 'L1', enrolmentId: 'enr-el', languageId: 'el' });
    expect(svc.events[0].producer.deviceId).toMatch(/^biblia:web:/);
    const recorded = svc.events[0].subject.itemIds ?? [];
    expect(recorded.length).toBeGreaterThan(0);
    for (const id of recorded) expect(svc.asked, id).toContain(id); // the ids the recorder sent are among the ids the page asked about
    const same = words().filter((b) => b.textContent === 'λόγος');
    expect(same.length).toBeGreaterThan(1);
    expect(same.every((b) => b.getAttribute(LEVEL_ATTR) === 'seen')).toBe(true);
    expect(words().filter((b) => b.getAttribute(LEVEL_ATTR) === 'seen').length).toBe(same.length);

    // a mark: repainted before the service has answered, then confirmed by it
    svc.down = true;
    (app!.cardRoot()!.querySelector('.rateBtn[data-mark="known"]') as HTMLButtonElement).click();
    expect(same.every((b) => b.getAttribute(LEVEL_ATTR) === 'known')).toBe(true);
    svc.down = false;
    await recorder.flush();
    expect(svc.events.map((e) => e.kind)).toEqual(['SelectionLookedUp', 'ItemMarked']);
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(svc.rows.get(recorded[0])?.selfMark?.mark).toBe('known'));
    await new Promise((r) => setTimeout(r, 20));
    expect(same.every((b) => b.getAttribute(LEVEL_ATTR) === 'known')).toBe(true);

    // learned elsewhere: another word becomes Familiar in the service, and the page shows it when the tab is focused
    const other = words().find((b) => b.textContent === 'ἀρχῇ')!;
    const otherIds = unitIdsOfSite({ el: other, lang: 'el', sentence: 'Ἐν ἀρχῇ ἦν ὁ λόγος', start: 3, end: 7, surface: 'ἀρχῇ', varietyId: 'el-koi' });
    svc.rows.set(otherIds[0], { level: 'familiar' });
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(other.getAttribute(LEVEL_ATTR)).toBe('familiar'));

    // sign out: the service is told, the levels go, the notice says it is a reader only again
    await app!.go('#/');
    q<HTMLButtonElement>('#signout').click();
    await vi.waitFor(() => expect(account.state().signedIn).toBe(false));
    expect(svc.deleted).toBe(1);
    expect(q('#accountline').textContent).toBe('Sign in to record what you read');
    await app!.go('#/read/John/1');
    expect(painted()).toBe(0);
    expect(recorder.mode).toBe('none');
    expect(document.body.textContent).toContain('Biblia is a reader only');
  });

  it('a lookup made while the service cannot be reached is queued, and sent when the browser is online again', async () => {
    const { svc, account, recorder, storage } = await start();
    expect(await account.signIn('ana@example.org', PASSWORD)).toEqual({ ok: true });
    await app!.go('#/read/John/1');
    await vi.waitFor(() => expect(painted()).toBe(words().length));
    const identityFirst = await recorder.identity('el', 'el-koi'); // the enrolment is remembered while online
    expect(identityFirst?.enrolmentId).toBe('enr-el');
    svc.down = true;
    words().find((b) => b.textContent === 'ἀρχῇ')!.click();
    await vi.waitFor(() => expect(recorder.pending()).toBe(1));
    expect(JSON.parse(storage.getItem('biblia:queue')!)).toHaveLength(1);
    await vi.waitFor(() => expect(q('.notice[role="status"]').textContent).toMatch(/Saved on this device \(1 waiting\)/));
    expect(svc.events).toHaveLength(0);
    svc.down = false;
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(svc.events.map((e) => e.kind)).toEqual(['SelectionLookedUp']));
    await vi.waitFor(() => expect(recorder.pending()).toBe(0));
    expect(storage.getItem('biblia:queue')).toBeNull();
  });

  it('a kept sign-in is confirmed on start; one the service no longer accepts is dropped and the library says so', async () => {
    const first = await start();
    await first.account.signIn('ana@example.org', PASSWORD);
    app!.destroy(); app = undefined;
    // reopen: the session is read from storage, GET /me confirms it
    const again = await start({ storage: first.storage, svc: first.svc });
    expect(again.account.state().signedIn).toBe(true);
    await again.account.start();
    expect(q('#accountline').textContent).toMatch(/^Signed in as ana@example.org/);
    app!.destroy(); app = undefined;
    // reopen after the service revoked the token
    first.svc.revoked.add('tok-fake-1');
    const ended = await start({ storage: first.storage, svc: first.svc });
    await ended.account.start();
    await vi.waitFor(() => expect(q('#accountline').textContent).toBe('Your sign-in ended: sign in again'));
    expect(first.storage.data.has('biblia:session')).toBe(false);
  });

  it('without an account the app behaves as before: no account line, no account route', async () => {
    app = await createBibliaApp({
      win: window, doc: document, source: localSource, now: () => new Date(),
      recorder: { mode: 'extension', identity: async () => undefined, record: async () => ({ ok: true }) },
    });
    expect(document.querySelector('#accountline')).toBeNull();
    expect(document.body.textContent).toContain('GoLearn extension’s on-device Repository');
    await app.go('#/account');
    expect(app.route).toBe('library');
  });
});
