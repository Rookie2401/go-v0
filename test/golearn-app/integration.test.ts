// @vitest-environment jsdom
/**
 * The setup application against the REAL pieces it is built to work with, end to end, in one jsdom page:
 *   - the real Repository service (SQLite in memory, real scrypt crypto), reached through an in-process `fetch`;
 *   - the real background worker (src/background/core.ts) on a chrome fake, which holds the session, records and syncs;
 *   - the real language pack (installPack over the real dictionary files on disk).
 * Every message the application sends goes to the real worker, which only answers extension pages.
 */
import fs from 'node:fs';
import path from 'node:path';
import { URL as NodeURL } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createProjectionEngine } from '../../packages/repository-engine/src';
import { createLinguisticService } from '../../packages/repository-linguistics/src';
import { openSqliteStore } from '../../packages/repository-store/src';
import { createRepositoryApi } from '../../packages/repository-service/src/api';
import { nodeCrypto } from '../../packages/repository-service/src/crypto-node';
import { handle } from '../../packages/repository-service/src/handler';
import { adaptLinguistics } from '../../packages/repository-service/src/linguistics-adapter';
import type { ServiceDeps } from '../../packages/repository-service/src/deps';
import { createApp } from '../../packages/golearn-extension/app/app';
import { createPackBindings } from '../../packages/golearn-extension/app/bindings';
import type { Deps } from '../../packages/golearn-extension/app/ports';
import { createBackground } from '../../packages/golearn-extension/src/background/core';
import type { ChromeApi } from '../../packages/golearn-extension/src/platform';
import { createMemoryStorageArea } from '../../packages/golearn-extension/src/store';
import { createChromeFake } from '../extension/chromeFake';
import { stubLayout } from './domtools';
import { choose, flush, submit, type, until } from './helpers';

// the jsdom environment replaces the global URL with its own class, which node:fs and the SQLite migrations refuse
(globalThis as { URL: typeof URL }).URL = NodeURL as unknown as typeof URL;

const DICT_ROOT = path.resolve(__dirname, '../../public');
const store = openSqliteStore(':memory:', { migrationsDir: path.resolve(__dirname, '../../packages/repository-store/migrations') });
const clock = (): string => new Date().toISOString();
const serviceDeps: ServiceDeps = {
  store, engine: createProjectionEngine({ store, now: clock }), linguistics: adaptLinguistics(createLinguisticService(store, { now: clock })),
  crypto: nodeCrypto, now: clock, log: () => {},
};

/** `fetch` for the service: straight into the handler (the host and port of the address are ignored). */
const serviceFetch = ((input: RequestInfo | URL, init?: RequestInit) => handle(new Request(input, init), serviceDeps)) as typeof fetch;

/** `fetch` for the page: the service’s own address goes straight into the handler (the account routes), everything else is a pack file read from disk (public/dict/**). */
const fileFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input).startsWith('http://127.0.0.1:8790/')) return serviceFetch(input, init);
  const url = new URL(String(input), 'http://app.test/');
  const file = path.join(DICT_ROOT, url.pathname);
  return fs.existsSync(file) ? new Response(fs.readFileSync(file), { status: 200 }) : new Response('not found', { status: 404 });
}) as typeof fetch;

let restore: () => void;
let app: ReturnType<typeof createApp> | undefined;
beforeAll(() => { restore = stubLayout(); });
afterAll(() => restore());
afterEach(() => { app?.destroy(); app = undefined; document.body.innerHTML = ''; });

describe('the setup application with the real worker and the real service', () => {
  it('chooses a language with no account (its pack installs by itself), signs up on the same page, syncs, exports, and deletes — end to end', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    window.location.hash = '';
    const fake = createChromeFake();
    // an extension page sending to the worker: the worker checks the sender’s extension id and the document’s address
    fake.runtime.id = 'ext-golearn';
    fake.runtime.sendMessage = (message) => new Promise((resolve) => {
      let answered = false;
      for (const f of fake.events.onMessage.listeners) {
        const r = f(message, { id: 'ext-golearn', url: 'chrome-extension://ext-golearn/app/index.html' }, (resp) => { answered = true; resolve(resp); });
        if (r === true) return;
      }
      if (!answered) resolve(undefined);
    });
    const worker = createBackground(fake as unknown as ChromeApi, { fetch: serviceFetch });
    worker.register();

    const area = fake.local as unknown as ReturnType<typeof createMemoryStorageArea>;
    const downloads: Array<{ filename: string; blob: Blob }> = [];
    const deps: Deps = {
      win: window, doc: document, chrome: fake as unknown as ChromeApi, fetch: fileFetch, area, packs: createPackBindings(), config: {},
      createApi: (baseUrl, token) => createRepositoryApi({ baseUrl, fetch: serviceFetch, token }),
      download: (filename, blob) => { downloads.push({ filename, blob }); },
      now: () => new Date(), closeWindow: () => false, copyText: async () => true, appVersion: 'it', speech: null,
    };
    app = createApp(document.getElementById('app')!, deps);
    await app.ready();
    const q = <T extends Element = HTMLElement>(sel: string): T => { const el = document.querySelector<T>(sel); if (!el) throw new Error(`not found: ${sel}`); return el; };
    const go = async (route: string): Promise<void> => { await app!.go(route); await app!.ready(); await flush(); };

    // ── the languages page. Language first, with no account: one click downloads it, keeps the choice on this device and installs the pack
    //    (the real installer over the real dictionary files, every validation case run through the real analyser)
    expect(app!.current()).toBe('signin'); // a first run opens on the sign-in page
    q('#continue-without-account').click();
    await until(() => app!.current() === 'languages');
    await app!.ready();
    expect(q('#account-line').textContent).toContain('On this device only');
    q('[data-language="sq"] [data-action="choose"]').click();
    await until(() => /is ready|did not|could not/.test(q('[data-language="sq"] .status').textContent ?? ''), 20_000);
    expect(q('[data-language="sq"] .status').textContent).toMatch(/Albanian is ready: [0-9]+ checks passed(, dictionary from [^.]+)?[.]/);
    expect(q('[data-language="sq"] .status').textContent).toContain('Saved on this device');
    expect(q('[data-language="sq"] .verify').getAttribute('data-ok')).toBe('true');
    expect(q('[data-language="sq"] .verify').textContent).toMatch(/Verified: all [0-9]+ checks passed/);
    expect(document.querySelectorAll('[data-language="sq"] .checks li').length).toBeGreaterThanOrEqual(14);
    expect(((await area.get('golearn:choice'))['golearn:choice'] as { languageId: string }).languageId).toBe('sq');
    expect((await area.get('golearn:session'))['golearn:session']).toBeUndefined();
    expect((await area.get('golearn:pack:installed:pack:sq'))['golearn:pack:installed:pack:sq']).toMatchObject({ version: expect.any(String) });
    await until(() => document.querySelector('#next-note'));
    expect(q('#next-note').textContent).toContain('GoLearn Active');

    // ── sign in (optional), on the sign-in page: the worker signs the new account in; the page holds no token of its own making
    await go('signin');
    choose(q('#acct-mode'), 'create');
    type(q<HTMLInputElement>('#acct-email'), 'ana@example.org');
    type(q<HTMLInputElement>('#acct-password'), 'a very long password 123');
    submit(q<HTMLFormElement>('#acct-form'));
    await until(() => app!.current() === 'languages' && document.getElementById('flash'), 8000);
    expect(q('#flash').textContent).toMatch(/Account created/);
    const session = (await area.get('golearn:session'))['golearn:session'] as { learnerId: string; token: string; email: string };
    expect(session.email).toBe('ana@example.org');
    expect(session.token.length).toBeGreaterThan(20);
    expect(JSON.stringify(await area.get(null))).not.toContain('a very long password 123');
    await go('settings');
    expect(q('#account-state').textContent).toBe('Synced to your account as ana@example.org');
    await go('languages');

    // ── the language chosen on the device is now an enrolment on the account too (no team), and the worker adopted it
    await until(async () => (await store.listEnrolments(session.learnerId)).length === 1, 8000);
    const enrolment = (await store.listEnrolments(session.learnerId))[0];
    expect(enrolment).toMatchObject({ languageId: 'sq', varietyId: 'sq-standard', scriptId: 'Latn', packId: 'pack:sq' });
    expect(enrolment.teamId).toBeUndefined();
    await flush(30);
    expect((await area.get('golearn:session'))['golearn:session']).toMatchObject({ enrolmentId: enrolment.enrolmentId, languageId: 'sq' });
    // the pack stayed installed; nothing needed installing again
    expect(q('#language-cards > [data-language="sq"]').getAttribute('data-state')).toBe('ready');
    const all = Object.entries(await area.get(null)).filter(([k]) => k.startsWith('golearn:event:')).map(([, v]) => v as { learnerId: string; enrolmentId: string; producer: Record<string, string>; kind: string; payload: Record<string, unknown> });
    // the install wrote one PackInstalled (the pack's level and how far it is validated), through the worker
    const installed = all.filter((e) => e.kind === 'PackInstalled');
    expect(installed).toHaveLength(1);
    expect(installed[0].payload).toMatchObject({ packId: 'pack:sq', level: 'installable', validation: 'unreviewed' });
    expect(installed[0].producer).toMatchObject({ app: 'golearn-ext', surface: 'pack' });

    // ── sync: the worker pushes it to the service
    await go('sync');
    expect(q('#sync-facts').textContent).toMatch(/Waiting to send1/); // the PackInstalled
    q('#sync-now').click();
    await until(() => /Synchronised|Sent|Nothing/.test(q('.screen .body > .status').textContent ?? ''), 10_000);
    const stored = await store.list({ learnerId: session.learnerId, kinds: ['PackInstalled'] });
    expect(stored).toHaveLength(1);
    expect(stored[0].producer.surface).toBe('pack');
    expect(stored[0].payload).toMatchObject({ packId: 'pack:sq', level: 'installable', validation: 'unreviewed' });
    await until(() => /Waiting to send0/.test(q('#sync-facts').textContent ?? ''), 5000);

    // ── privacy: the export carries the event; deleting the account erases it and signs the page out
    await go('privacy');
    q('#export-data').click();
    await until(() => downloads.length === 1, 8000);
    const exported = JSON.parse(await new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsText(downloads[0].blob); }));
    expect(JSON.stringify(exported)).toContain('PackInstalled');
    // deleting is scheduled, not immediate: the password confirms it, the 14-day grace keeps everything, and Cancel undoes it
    type(q<HTMLInputElement>('#delete-password'), 'a very long password 123');
    q('#delete-account').click();
    await until(() => q('#priv-delete').querySelector('#delete-cancel'), 10_000);
    expect(q('#priv-delete').textContent).toMatch(/Deletion is scheduled for/);
    expect((await area.get('golearn:session'))['golearn:session']).toBeDefined();
    expect((await store.list({ learnerId: session.learnerId })).length).toBeGreaterThan(0);
    q('#delete-cancel').click();
    await until(() => q('#priv-delete').querySelector('#delete-account'), 10_000);
  }, 60_000);
});
