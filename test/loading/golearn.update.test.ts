// @vitest-environment jsdom
/**
 * The build stamp and the self-update of an unpacked extension (2026-11-10). The owner loads GoLearn from packages/golearn-extension/dist; a rebuilt
 * folder changes nothing until the browser reloads it, and the browser was repeatedly found days behind the code. The worker now knows which build it
 * is (`__GOLEARN_BUILD_ID__`, here passed as the `build` option), compares it with dist/build.json, and reloads itself when it is safe.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { initPopup } from '../../packages/golearn-extension/action/popup';
import { createBackground } from '../../packages/golearn-extension/src/background/core';
import { SELF_UPDATE_GAP_MS, SELF_UPDATE_KEY, SETTLE_MS, UPDATED_NOTE_MS, createSelfUpdate, type SelfUpdateRecord } from '../../packages/golearn-extension/src/background/selfUpdate';
import { MSG, type ChromeApi } from '../../packages/golearn-extension/src/platform';
import { computeBuildId } from '../../packages/golearn-extension/vite.config';
import { createChromeFake } from '../extension/chromeFake';
import { flush } from '../extension/dom';
import { fakePacks, pendingEvent } from '../extension/rig';

const EXT = 'test-ext-id';
const BUILD_URL = `chrome-extension://${EXT}/build.json`;
const RUNNING = { id: 'aaaaaaaaaaaa', builtAt: '2026-11-10T10:00:00.000Z' };
const NEWER = { id: 'bbbbbbbbbbbb', builtAt: '2026-11-10T11:00:00.000Z' };
const settle = async (n = 25): Promise<void> => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

interface World {
  fake: ReturnType<typeof createChromeFake>;
  chrome: ChromeApi;
  reload: ReturnType<typeof vi.fn>;
  folder: { body: string | undefined; throws: boolean };
  clock: { now: number };
  fetchCalls: Array<{ url: string; cache?: RequestCache }>;
  fetch: typeof fetch;
}
function world(folderBuild: unknown = RUNNING, fake = createChromeFake()): World {
  const reload = vi.fn();
  const chrome = { ...fake, runtime: { ...fake.runtime, reload } } as unknown as ChromeApi;
  const w: World = { fake, chrome, reload, folder: { body: folderBuild === undefined ? undefined : JSON.stringify(folderBuild), throws: false }, clock: { now: Date.parse('2026-11-10T12:00:00.000Z') }, fetchCalls: [], fetch: undefined as never };
  w.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === BUILD_URL) {
      w.fetchCalls.push({ url, cache: init?.cache });
      if (w.folder.throws) throw new TypeError('Failed to fetch');
      return w.folder.body === undefined ? new Response('', { status: 404 }) : new Response(w.folder.body, { status: 200 });
    }
    return new Response('', { status: 404 });
  }) as typeof fetch;
  return w;
}
const life = (w: World, running: { id: string; builtAt: string } | undefined, busy: () => boolean = () => false) =>
  createSelfUpdate({ chrome: w.chrome, fetch: w.fetch, now: () => w.clock.now, build: running, busy });
/** Two sightings (a new worker life for each, over the same storage): the first records, the second, SETTLE_MS later, may reload. */
const sightTwice = async (w: World, running: { id: string; builtAt: string }): Promise<string> => { await life(w, running).check(); w.clock.now += SETTLE_MS; return life(w, running).check(); };
const record = async (w: World): Promise<SelfUpdateRecord | undefined> => (await w.fake.local.get(SELF_UPDATE_KEY))[SELF_UPDATE_KEY] as SelfUpdateRecord | undefined;

function worker(w: World, running = RUNNING) {
  const bg = createBackground(w.chrome, { fetch: w.fetch, packs: fakePacks(), now: () => w.clock.now, build: running });
  bg.register();
  return bg;
}
const page = (w: World, m: Record<string, unknown>) => w.fake.dispatch(m, { id: EXT, url: `chrome-extension://${EXT}/action/popup.html` }) as Promise<any>;
const content = (w: World, m: Record<string, unknown>) => w.fake.dispatch(m, { id: EXT, tab: { id: 7 }, url: 'https://example.test/page' }) as Promise<any>;
const alarm = (w: World): void => { w.fake.alarmEvent.fire({ name: 'golearn-sync' } as never); };

describe('(a) the status carries the build', () => {
  it('both the page status and the content status say which build runs; run from source (no build) there is none', async () => {
    const w = world(RUNNING);
    worker(w);
    expect((await page(w, { type: MSG.status })).build).toEqual(RUNNING);
    expect((await content(w, { type: MSG.status })).build).toEqual(RUNNING);
    const src = world(undefined);
    const bg = createBackground(src.chrome, { fetch: src.fetch, packs: fakePacks(), now: () => src.clock.now });
    bg.register();
    expect((await page(src, { type: MSG.status })).build).toBeUndefined();
    await settle();
    expect(src.reload).not.toHaveBeenCalled(); // no compiled build: the self-update is inert
  });
});

describe('(b) reload only for a different id', () => {
  it('the same id never reloads (start, alarm, popup); a different id reloads once, with the file read uncached', async () => {
    const same = world(RUNNING);
    worker(same);
    await settle(); alarm(same); await settle(); await page(same, { type: MSG.status }); await settle();
    expect(same.fetchCalls.length).toBeGreaterThanOrEqual(3);
    expect(same.reload).not.toHaveBeenCalled();

    const w = world(NEWER);
    worker(w);
    await settle();
    expect(w.reload).not.toHaveBeenCalled(); // the first sighting only records
    w.clock.now += SETTLE_MS;
    alarm(w); await settle();
    expect(w.reload).toHaveBeenCalledTimes(1);
    expect(w.fetchCalls.every((c) => c.cache === 'no-store')).toBe(true);
    // asked again in the same life (the alarm, the popup): still once
    alarm(w); await page(w, { type: MSG.status }); await settle();
    expect(w.reload).toHaveBeenCalledTimes(1);
    expect(await record(w)).toMatchObject({ toId: NEWER.id, fromId: RUNNING.id });
  });

  it('a content script asking for the status never triggers a check; the popup and the alarm do', async () => {
    const w = world(RUNNING);
    worker(w);
    await settle();
    const before = w.fetchCalls.length;
    await content(w, { type: MSG.status }); await settle();
    expect(w.fetchCalls.length).toBe(before);
    await page(w, { type: MSG.status }); await settle();
    expect(w.fetchCalls.length).toBe(before + 1);
    alarm(w); await settle();
    expect(w.fetchCalls.length).toBe(before + 2);
  });

  it('a folder stamped older than the running code is not a newer build', async () => {
    const w = world({ id: 'cccccccccccc', builtAt: '2026-11-09T10:00:00.000Z' });
    expect(await life(w, RUNNING).check()).toBe('older');
    expect(w.reload).not.toHaveBeenCalled();
  });
});

describe('(c) not while the Repository is opening or a record is being handled', () => {
  function gated(w: World) {
    const local = w.fake.local;
    const orig = local.get.bind(local);
    const gate = { open: false, release: (): void => undefined, wait: undefined as Promise<void> | undefined };
    gate.wait = new Promise<void>((r) => { gate.release = () => { gate.open = true; r(); }; });
    (local as { get: typeof local.get }).get = (async (k: unknown) => { if (k !== SELF_UPDATE_KEY && !gate.open) await gate.wait; return orig(k as never); }) as typeof local.get;
    return gate;
  }

  it('a check while the device Repository is opening does nothing; once it has opened, the next check reloads', async () => {
    const w = world(RUNNING);
    const bg = worker(w);
    await settle();
    const gate = gated(w);
    void bg.local.open(); // opening is held at the first storage read
    await settle();
    expect(bg.local.busy()).toBe(true);
    w.folder.body = JSON.stringify(NEWER);
    alarm(w); await settle(); // first sighting
    w.clock.now += SETTLE_MS;
    alarm(w); await settle();
    expect(w.reload).not.toHaveBeenCalled();
    gate.release();
    await bg.local.open();
    await settle();
    expect(bg.local.busy()).toBe(false);
    alarm(w); await settle();
    expect(w.reload).toHaveBeenCalledTimes(1);
  });

  it('a check while a record message is being handled does nothing; after it, the next check reloads', async () => {
    const w = world(RUNNING);
    worker(w);
    await settle();
    const gate = gated(w);
    const recorded = content(w, { type: MSG.record, event: pendingEvent() });
    await settle();
    w.folder.body = JSON.stringify(NEWER);
    alarm(w); await settle(); // first sighting
    w.clock.now += SETTLE_MS;
    void page(w, { type: MSG.status }); // the popup opening asks too; its status waits on the gate, so it is not awaited
    alarm(w); await settle();
    expect(w.reload).not.toHaveBeenCalled();
    gate.release();
    await recorded;
    await settle();
    alarm(w); await settle();
    expect(w.reload).toHaveBeenCalledTimes(1);
  });
});

describe('two sightings (a mirror may still be copying the folder)', () => {
  it('a single sighting never reloads, however many checks find nothing new', async () => {
    const w = world(NEWER);
    expect(await life(w, RUNNING).check()).toBe('seen');
    expect(w.reload).not.toHaveBeenCalled();
    expect(await record(w)).toMatchObject({ seen: { id: NEWER.id } });
  });
  it('two sightings 59 s apart do not reload; 60 s apart do', async () => {
    const w = world(NEWER);
    await life(w, RUNNING).check();
    w.clock.now += SETTLE_MS - 1_000;
    expect(await life(w, RUNNING).check()).toBe('settling');
    expect(w.reload).not.toHaveBeenCalled();
    w.clock.now += 1_000; // 60 s after the first
    expect(await life(w, RUNNING).check()).toBe('reloading');
    expect(w.reload).toHaveBeenCalledTimes(1);
  });
  it('an id that changes between the sightings restarts the wait', async () => {
    const w = world(NEWER);
    await life(w, RUNNING).check();
    w.clock.now += SETTLE_MS - 5_000;
    w.folder.body = JSON.stringify({ id: 'ffffffffffff', builtAt: '2026-11-10T11:30:00.000Z' });
    expect(await life(w, RUNNING).check()).toBe('seen'); // a new sighting for the new id
    w.clock.now += SETTLE_MS - 1_000;
    expect(await life(w, RUNNING).check()).toBe('settling');
    expect(w.reload).not.toHaveBeenCalled();
    w.clock.now += 1_000;
    expect(await life(w, RUNNING).check()).toBe('reloading');
    expect(await record(w)).toMatchObject({ toId: 'ffffffffffff' });
  });
  it('a worker restarted between the sightings (a new background over the same storage) still reloads on the second', async () => {
    const w = world(NEWER);
    const first = worker(w);
    await settle();
    expect(w.reload).not.toHaveBeenCalled();
    expect(first).toBeTruthy();
    const w2 = world(NEWER, createChromeFake());
    w2.fake.local.set({ [SELF_UPDATE_KEY]: (await record(w))! });
    w2.clock.now = w.clock.now + SETTLE_MS;
    worker(w2); // the new worker's start check is the second sighting
    await settle();
    expect(w2.reload).toHaveBeenCalledTimes(1);
  });
});

describe('(d) not twice within 120 s', () => {
  it('a second newer build within the gap waits; after the gap it reloads', async () => {
    const w = world(NEWER);
    expect(await sightTwice(w, RUNNING)).toBe('reloading'); // life 1 reloads to B
    expect(w.reload).toHaveBeenCalledTimes(1);
    // life 2 runs B; the folder already holds C
    w.folder.body = JSON.stringify({ id: 'dddddddddddd', builtAt: '2026-11-10T11:30:00.000Z' });
    await life(w, NEWER).check(); // sighted
    w.clock.now += SETTLE_MS; // settled, but within 120 s of the last reload
    expect(await life(w, NEWER).check()).toBe('too-soon');
    expect(w.reload).toHaveBeenCalledTimes(1);
    w.clock.now += SELF_UPDATE_GAP_MS;
    expect(await life(w, NEWER).check()).toBe('reloading');
    expect(w.reload).toHaveBeenCalledTimes(2);
  });
});

describe('(e) no loop', () => {
  it('after a reload to X, a worker that still runs another id does not reload for X again and records stuck', async () => {
    const w = world(NEWER);
    expect(await sightTwice(w, RUNNING)).toBe('reloading');
    expect(w.reload).toHaveBeenCalledTimes(1);
    for (const later of [30_000, 400_000, 4_000_000]) {
      w.clock.now += later;
      expect(await life(w, RUNNING).check()).toBe('stuck'); // the browser started the old code again
    }
    expect(w.reload).toHaveBeenCalledTimes(1);
    expect(await record(w)).toMatchObject({ toId: NEWER.id, stuck: true });
    // a genuinely different build later is a new matter
    w.folder.body = JSON.stringify({ id: 'eeeeeeeeeeee', builtAt: '2026-11-10T13:00:00.000Z' });
    expect(await sightTwice(w, RUNNING)).toBe('reloading');
    expect(w.reload).toHaveBeenCalledTimes(2);
  });
});

describe('(f) a missing, unreadable or malformed build.json does nothing', () => {
  it.each([
    ['missing (404)', (w: World) => { w.folder.body = undefined; }],
    ['fetch error', (w: World) => { w.folder.throws = true; }],
    ['not JSON', (w: World) => { w.folder.body = '<html>nope'; }],
    ['no id', (w: World) => { w.folder.body = JSON.stringify({ builtAt: NEWER.builtAt }); }],
    ['empty id', (w: World) => { w.folder.body = JSON.stringify({ id: '  ', builtAt: NEWER.builtAt }); }],
    ['numeric id', (w: World) => { w.folder.body = JSON.stringify({ id: 42 }); }],
    ['an array', (w: World) => { w.folder.body = JSON.stringify([NEWER]); }],
  ])('%s', async (_name, spoil) => {
    const w = world(NEWER);
    spoil(w);
    expect(await life(w, RUNNING).check()).toBe('unreadable');
    expect(w.reload).not.toHaveBeenCalled();
    expect(await record(w)).toBeUndefined();
  });
});

describe('(g) the "updated" note', () => {
  it('is in the status for 10 minutes after a reload, then gone; the popup foot line says so', async () => {
    document.body.innerHTML = fs.readFileSync(path.resolve(__dirname, '../../packages/golearn-extension/action/popup.html'), 'utf8').replace(/^[\s\S]*<body>/, '').replace(/<\/body>[\s\S]*$/, '').replace(/<script[\s\S]*?<\/script>/g, '');
    const w = world(NEWER);
    // life 1 (running A) reloads to B; life 2 is the worker that now runs B
    expect(await sightTwice(w, RUNNING)).toBe('reloading');
    const t0 = w.clock.now;
    w.clock.now = t0 + 60_000;
    worker(w, NEWER);
    const s = await page(w, { type: MSG.status });
    expect(s.updatedFrom).toBe(RUNNING.id);
    expect(s.updatedAt).toBe(new Date(t0).toISOString());
    expect(s.build).toEqual(NEWER);
    await initPopup(document, w.chrome);
    expect(document.getElementById('build')!.textContent).toMatch(new RegExp(`^Updated to build ${NEWER.id} at `));
    w.clock.now = t0 + UPDATED_NOTE_MS + 1;
    const later = await page(w, { type: MSG.status });
    expect(later.updatedAt).toBeUndefined();
    expect(later.updatedFrom).toBeUndefined();
    await initPopup(document, w.chrome);
    await flush(5);
    expect(document.getElementById('build')!.textContent).toMatch(new RegExp(`^Build ${NEWER.id} · `));
  });
});

describe('(h) the build id helper of vite.config.ts', () => {
  it('with git available: 12 hexadecimal characters of HEAD, with -dirty when the tree differs', () => {
    const id = computeBuildId();
    expect(id).toMatch(/^[0-9a-f]{12}(-dirty)?$/);
    const head = execSync('git rev-parse HEAD', { cwd: path.resolve(__dirname, '../..') }).toString().trim();
    expect(head.startsWith(id.slice(0, 12))).toBe(true);
  });
  it("without a repository: 'unknown'", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'golearn-nogit-'));
    try { expect(computeBuildId(dir)).toBe('unknown'); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
