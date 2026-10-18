// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CONTRACT_VERSION } from '../../packages/repository-contract/src';
import { KEYS, createStateStore, createWebStorageArea } from '../../packages/golearn-extension/app/state';
import { PERMISSIONS, SURFACES } from '../../packages/golearn-extension/app/surfaces';
import { createMemoryStorageArea, createStorageEncounterStore } from '../../packages/golearn-extension/src/store';
import { destroyRigs, fakeBackground, flush, makeRig, readBlob, signIn, until, choose, type Rig } from './helpers';

afterEach(() => destroyRigs());

const settingsOf = async (rig: Rig): Promise<Record<string, unknown>> => ((await rig.area.get(KEYS.settings))[KEYS.settings] ?? {}) as Record<string, unknown>;

describe('How GoLearn reads pages (the reader integration, an advanced screen)', () => {
  it('is reached from a footer link on the languages page and from Settings, and is not part of setup', async () => {
    const rig = await makeRig({ startRoute: 'languages' });
    expect(rig.q<HTMLAnchorElement>('#reader-link').getAttribute('href')).toBe('#/reader');
    expect(rig.q('#reader-link').textContent).toBe('How GoLearn reads pages');
    expect(rig.q('.topbar').querySelector('a[href="#/reader"]')).toBeNull();
    await rig.go('settings');
    expect(rig.q('#advanced-links li[data-route="reader"] a').textContent).toBe('How GoLearn reads pages');
    await rig.go('reader');
    expect(rig.q('#screen h1').textContent).toBe('How GoLearn reads pages');
    expect(rig.text()).not.toMatch(/orientation/i);
    expect(rig.root.querySelector('#try-here')).toBeNull();
  });

  it('in the web app: step-by-step installation guidance, never a claim that it can install or detect the extension', async () => {
    const rig = await makeRig();
    await rig.go('reader');
    const guide = rig.q('#reader-install');
    expect(guide.textContent).toContain('cannot install a browser extension');
    expect(guide.textContent).toContain('Load unpacked');
    expect(guide.textContent).toContain('Developer mode');
    expect(guide.textContent).toContain('Chrome Web Store');
    expect(guide.textContent).toMatch(/cannot check whether the extension is installed/);
    expect(rig.root.querySelector('#reader-installed')).toBeNull();
    // acknowledging is remembered, because the page cannot verify it; it is no part of setup
    rig.q('#reader-ack').click();
    await until(() => rig.q('#reader-note').textContent === 'Noted.');
    expect((await rig.area.get(KEYS.app))[KEYS.app]).toMatchObject({ readerAck: true });
  });

  it('in the extension: installed, its version, and how it is switched on', async () => {
    const rig = await makeRig({ extension: true });
    await rig.go('reader');
    expect(rig.q('#ext-version').textContent).toBe(`Installed, version ${rig.chrome!.runtime.getManifest!().version}.`);
    const text = rig.q('#reader-installed').textContent!;
    expect(text).toContain('per tab');
    expect(text).toContain('Alt+Shift+G');
    expect(text).toContain('right-click');
    expect(rig.root.querySelector('#reader-install')).toBeNull();
  });

  it('the permissions it explains are exactly the ones the manifest declares', () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../packages/golearn-extension/manifest.json'), 'utf8')) as { permissions: string[]; options_page?: string };
    expect(PERMISSIONS.map((p) => p.name).sort()).toEqual([...manifest.permissions].sort());
    expect(manifest.options_page).toBe('app/index.html');
  });

  it('lists the supported surfaces from the constant, honestly: Kindle is not supported', async () => {
    const rig = await makeRig();
    await rig.go('reader');
    const items = [...rig.root.querySelectorAll('#surfaces li')];
    expect(items.map((li) => li.getAttribute('data-surface'))).toEqual(SURFACES.map((s) => s.id));
    const kindle = rig.q('#surfaces li[data-surface="kindle"]');
    expect(kindle.getAttribute('data-status')).toBe('not-supported');
    expect(kindle.textContent).toMatch(/Not supported/);
    expect(kindle.textContent).toMatch(/copy/);
    expect(rig.q('#surfaces li[data-surface="web-generic"]').getAttribute('data-status')).toBe('works');
    expect(rig.q('#surfaces li[data-surface="controlled-reader"]').textContent).toMatch(/DRM-free/);
    expect(rig.text()).toMatch(/never bypasses DRM/);
    for (const perm of PERMISSIONS) expect(rig.text()).toContain(perm.name);
    expect(rig.text()).toContain('no host permissions');
  });
});

describe('Sync', () => {
  it('in the web app says it runs inside the extension', async () => {
    const rig = await makeRig();
    await rig.go('sync');
    expect(rig.text()).toContain('runs inside the extension');
    expect(rig.root.querySelector('#sync-now')).toBeNull();
  });

  it('in the extension reads golearn:status from the background (its sync view) and shows it', async () => {
    const rig = await makeRig({ extension: true });
    const bg = fakeBackground(rig);
    bg.statusReply = { ...bg.statusReply, sync: { pending: 3, rejected: 1, lastPushAt: Date.parse('2026-10-08T09:30:00.000Z'), lastError: 'timeout', online: true, needsSignIn: false } };
    await signIn(rig);
    await rig.go('sync');
    const facts = rig.q('#sync-facts').textContent!;
    expect(facts).toContain('Waiting to send3');
    expect(facts).toContain('Last sync2026-10-08 09:30 UTC');
    expect(facts).toContain('Refused by the service1');
    expect(facts).toContain('timeout');
    expect(facts).toContain('synced to your account (ana@example.org)');
  });

  it('without a worker that answers, says the status is unavailable instead of inventing one, and Sync now reports it', async () => {
    const rig = await makeRig({ extension: true });
    await rig.go('sync');
    expect(rig.q('#sync-facts').textContent).toContain('did not answer');
    rig.q('#sync-now').click();
    await until(() => /did not answer/.test(rig.q('.screen .body > .status').textContent ?? ''));
  });

  it('Sync now sends golearn:sync-now and explains what the worker answered, including a skip', async () => {
    const rig = await makeRig({ extension: true });
    const bg = fakeBackground(rig);
    await rig.go('sync');
    rig.q('#sync-now').click();
    await until(() => /Synchronised/.test(rig.q('.screen .body > .status').textContent ?? ''));
    expect(bg.messages.map((m) => m.type)).toContain('golearn:sync-now');
    bg.syncReply = { ok: true, skipped: 'not-connected' };
    rig.q('#sync-now').click();
    await until(() => /on this device only/.test(rig.q('.screen .body > .status').textContent ?? ''));
    bg.syncReply = { ok: false, skipped: 'needs-sign-in' };
    rig.q('#sync-now').click();
    await until(() => /no longer accepts your sign-in/.test(rig.q('.screen .body > .status').textContent ?? ''));
    expect(rig.q('.screen .body > .status').getAttribute('data-kind')).toBe('error');
  });
});

describe('Privacy', () => {
  it('every switch starts off; snippets and external processing cannot be switched on; depth starts automatic', async () => {
    const rig = await makeRig();
    await rig.go('privacy');
    expect(rig.q<HTMLInputElement>('#keep-snippets').checked).toBe(false);
    expect(rig.q<HTMLInputElement>('#keep-snippets').disabled).toBe(true);
    expect(rig.q<HTMLInputElement>('#remote-speech').checked).toBe(false);
    expect(rig.q<HTMLInputElement>('#remote-speech').disabled).toBe(false);
    expect(rig.q<HTMLInputElement>('#external-processing').checked).toBe(false);
    expect(rig.q<HTMLInputElement>('#external-processing').disabled).toBe(true);
    expect(rig.q<HTMLSelectElement>('#depth').value).toBe('auto');
    expect([...rig.q<HTMLSelectElement>('#depth').options].map((o) => o.value)).toEqual(['auto', 'label', 'brief', 'explanatory']);
    // the remote speech text names the provider and what is sent
    const speech = rig.q('#remote-speech').closest('section')!.textContent!;
    expect(speech).toContain('azure');
    expect(speech).toMatch(/only the word, phrase or sentence you explicitly ask to hear/);
    expect(speech).toMatch(/Source permissions must allow this/);
    expect(rig.q('#keep-snippets').closest('section')!.textContent).toMatch(/cannot be switched on in this version/);
    expect(rig.text()).toMatch(/nothing in GoLearn sends text to an outside AI provider/);
  });

  it('in the web app the choices are written to golearn:settings in the extension’s own shape and read back on the next visit', async () => {
    const rig = await makeRig();
    await rig.go('privacy');
    const speech = rig.q<HTMLInputElement>('#remote-speech');
    speech.checked = true; speech.dispatchEvent(new Event('change', { bubbles: true }));
    choose(rig.q('#depth'), 'explanatory');
    await flush(30);
    expect(await settingsOf(rig)).toEqual({ keepSnippets: false, remoteSpeechConsent: true, localOnlySpeech: true, externalProcessingConsent: false, explanationDepth: 'explanatory' });
    await rig.go('home');
    await rig.go('privacy');
    expect(rig.q<HTMLInputElement>('#remote-speech').checked).toBe(true);
    expect(rig.q<HTMLSelectElement>('#depth').value).toBe('explanatory');
    // back to automatic removes the override instead of storing a value for it
    choose(rig.q('#depth'), 'auto');
    await flush(30);
    expect(await settingsOf(rig)).toEqual({ keepSnippets: false, remoteSpeechConsent: true, localOnlySpeech: true, externalProcessingConsent: false });
  });

  it('in the extension the worker is asked to write them (golearn:settings, op set); depth back to automatic sends null', async () => {
    const rig = await makeRig({ extension: true });
    const bg = fakeBackground(rig);
    await rig.go('privacy');
    const box = rig.q<HTMLInputElement>('#remote-speech');
    box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => bg.messages.some((m) => m.type === 'golearn:settings'));
    expect(bg.messages.find((m) => m.type === 'golearn:settings')).toMatchObject({ op: 'set', patch: { remoteSpeechConsent: true } });
    choose(rig.q('#depth'), 'brief');
    await until(() => bg.settings.explanationDepth === 'brief');
    choose(rig.q('#depth'), 'auto');
    await until(() => bg.settings.explanationDepth === undefined);
    expect(bg.messages.filter((m) => m.type === 'golearn:settings').at(-1)).toMatchObject({ patch: { explanationDepth: null } });
    expect(bg.settings).toMatchObject({ remoteSpeechConsent: true, keepSnippets: false });
  });

  describe('the remote-speech switch is a recorded consent (P-09)', () => {
    it('in the extension: ConsentGiven is recorded through the worker BEFORE the switch is written; turning it off writes the switch, then ConsentWithdrawn', async () => {
      const rig = await makeRig({ extension: true });
      const bg = fakeBackground(rig);
      await rig.go('privacy');
      const box = rig.q<HTMLInputElement>('#remote-speech');
      box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true }));
      await until(() => bg.settings.remoteSpeechConsent === true);
      const order = bg.messages.filter((m) => m.type === 'golearn:record' || m.type === 'golearn:settings').map((m) => m.type);
      expect(order).toEqual(['golearn:record', 'golearn:settings']);
      expect(bg.recorded).toHaveLength(1);
      expect(bg.recorded[0]).toMatchObject({ kind: 'ConsentGiven', payload: { consent: 'remote-speech', scope: 'remote-speech' }, producer: { app: 'golearn-ext' }, subject: {} });
      expect(typeof bg.recorded[0].id).toBe('string');
      box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true }));
      await until(() => bg.recorded.length === 2);
      expect(bg.recorded[1]).toMatchObject({ kind: 'ConsentWithdrawn', payload: { scope: 'remote-speech' } });
      expect(bg.settings.remoteSpeechConsent).toBe(false);
      expect(bg.messages.filter((m) => m.type === 'golearn:record' || m.type === 'golearn:settings').map((m) => m.type)).toEqual(['golearn:record', 'golearn:settings', 'golearn:settings', 'golearn:record']);
    });

    it('in the web app the events go to the shared event log', async () => {
      const rig = await makeRig();
      await rig.go('privacy');
      const box = rig.q<HTMLInputElement>('#remote-speech');
      box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true }));
      await flush(40);
      expect((await settingsOf(rig)).remoteSpeechConsent).toBe(true);
      const rows = JSON.parse(await createStorageEncounterStore(rig.area as never).exportRows()) as Array<{ kind: string; payload: { scope?: string } }>;
      expect(rows.filter((r) => r.kind === 'ConsentGiven').map((r) => r.payload.scope)).toEqual(['remote-speech']);
    });

    it('when the record cannot be made the switch snaps back to off and says so', async () => {
      const rig = await makeRig({ extension: true });
      const bg = fakeBackground(rig, ['settings']);               // the worker answers settings but refuses to record
      rig.chrome!.events.onMessage.addListener((m, _s, respond) => {
        if ((m as { type?: string }).type !== 'golearn:record') return undefined;
        respond({ ok: false, error: 'invalid:payload refused for the test' });
        return true;
      });
      await rig.go('privacy');
      const box = rig.q<HTMLInputElement>('#remote-speech');
      box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true }));
      await until(() => !box.checked);
      expect(bg.settings.remoteSpeechConsent).toBeUndefined();
      expect(rig.text()).toContain('could not be recorded, so remote speech stays off');
    });
  });

  it('A-20 the repeated "Change" links on the home screen name what they change', async () => {
    const rig = await makeRig();
    await rig.go('home');
    const labels = [...rig.root.querySelectorAll('#status-list a')].map((a) => a.getAttribute('aria-label'));
    expect(labels.length).toBe(2);
    expect(new Set(labels).size).toBe(labels.length);
    for (const l of labels) expect(l).toMatch(/^Change: /);
  });

  it('shows what the extension holds: a consent stored elsewhere is displayed as it is, never silently reset', async () => {
    const rig = await makeRig();
    await rig.area.set({ [KEYS.settings]: { keepSnippets: true, remoteSpeechConsent: true, externalProcessingConsent: true, explanationDepth: 'label' } });
    await rig.go('privacy');
    expect(rig.q<HTMLInputElement>('#remote-speech').checked).toBe(true);
    expect(rig.q<HTMLInputElement>('#external-processing').checked).toBe(true); // true as stored; the switch itself is disabled here
    expect(rig.q<HTMLInputElement>('#keep-snippets').checked).toBe(false); // the extension holds it at false: nothing can keep a sentence
    expect(rig.q<HTMLSelectElement>('#depth').value).toBe('label');
  });

  it('export without an account says to sign in and downloads nothing', async () => {
    const rig = await makeRig();
    await rig.go('privacy');
    rig.q('#export-data').click();
    await flush(20);
    expect(rig.downloads).toHaveLength(0);
    expect(rig.text()).toContain('Sign in first');
  });

  it('the device’s own rows can be exported without an account', async () => {
    const rig = await makeRig();
    await rig.go('privacy');
    rig.q('#export-local').click();
    await until(() => rig.downloads.length === 1);
    expect(rig.downloads[0].filename).toBe('golearn-device-rows-2026-10-08.json');
    expect(JSON.parse(await readBlob(rig.downloads[0].blob))).toEqual([]);
  });

  it('without an account there is nothing to delete', async () => {
    const rig = await makeRig();
    await rig.go('privacy');
    await until(() => /Sign in to delete an account/.test(rig.text()));
    expect(rig.root.querySelector('#delete-account')).toBeNull();
  });
});

describe('Diagnostics and updates', () => {
  it('shows the extension, application, contract and pack versions', async () => {
    const rig = await makeRig({ extension: true });
    await rig.go('diagnostics');
    expect(rig.q('#v-ext').textContent).toBe(`installed, version ${rig.chrome!.runtime.getManifest!().version}`);
    expect(rig.q('#v-app').textContent).toBe('0.1.0-test');
    expect(rig.q('#v-contract').textContent).toBe(String(CONTRACT_VERSION));
    expect(rig.q('#v-packs').textContent).toContain('Albanian 9');
    expect(rig.q('#v-packs').textContent).toContain('Spanish 3');
  });

  it('in the web app the extension line says it is not running as an extension', async () => {
    const rig = await makeRig();
    await rig.go('diagnostics');
    expect(rig.q('#v-ext').textContent).toBe('not running as an extension');
  });

  it('checks the service health and says what it answered, or that it could not be reached', async () => {
    const rig = await makeRig();
    await rig.go('diagnostics');
    await until(() => /Service reachable/.test(rig.q('#health').textContent ?? ''));
    expect(rig.q('#health').textContent).toContain('go-repository, version 2');
    expect(rig.q('#report').textContent === '' ? (rig.q('#report') as HTMLTextAreaElement).value : '').toContain('service: go-repository answered ok, version 2');
    rig.service.down = true;
    rig.q('#health-again').click();
    await until(() => /could not be reached/.test(rig.q('#health').textContent ?? ''));
    expect((rig.q('#report') as HTMLTextAreaElement).value).toContain('service: not reachable');
  });

  it('compares installed pack versions with the available ones, and the service version with the contract, and promises no automatic updates', async () => {
    const rig = await makeRig();
    await rig.app.ctx.state.recordPack('pack:sq', { version: '8', ok: true, verifiedAt: '2026-10-01T00:00:00Z' });
    await rig.app.ctx.state.recordPack('pack:nb', { version: '2', ok: true, verifiedAt: '2026-10-01T00:00:00Z' });
    // the service's own version (3) is not the contract version; the page compares the contract version it reports (an older one here)
    const older = CONTRACT_VERSION - 1;
    rig.service.health = { ok: true, status: 200, data: { ok: true, service: 'go-repository', version: 3, contractVersion: older } };
    await rig.go('diagnostics');
    await until(() => /speaks/.test(rig.q('#updates').textContent ?? ''));
    const state = (id: string): string | null => rig.q(`#updates tr[data-pack="${id}"]`).getAttribute('data-state');
    expect(state('pack:sq')).toBe('update-available');
    expect(state('pack:nb')).toBe('current');
    expect(state('pack:nn')).toBe('not-installed');
    expect(state('pack:es')).toBe('planned');
    expect(rig.q('#updates tr[data-pack="pack:sq"]').textContent).toContain('8');
    expect(rig.q('#updates').textContent).toContain(`speaking contract version ${older}, but this app speaks ${CONTRACT_VERSION}`);
    expect(rig.q('#updates').textContent).toContain('There are no automatic updates in this build');
  });

  it('builds a copyable report with counts and versions and no secrets', async () => {
    const rig = await makeRig();
    await signIn(rig, 'ana@example.org');
    const token = (await rig.app.ctx.state.getSession())!.token;
    await rig.area.set({ 'golearn:event:a': { id: 'a' }, 'golearn:event:b': { id: 'b' } });
    await rig.go('diagnostics');
    await until(() => /Service reachable/.test(rig.q('#health').textContent ?? ''));
    const report = (rig.q('#report') as HTMLTextAreaElement).value;
    expect(report).toContain('local rows on this device: 2');
    expect(report).toContain(`repository contract: version ${CONTRACT_VERSION}`);
    expect(report).toContain('signed in: yes');
    expect(report).toContain('automatic updates: none in this build');
    expect(report).not.toContain(token);
    expect(report).not.toContain('ana@example.org');
    rig.q('#copy-report').click();
    await until(() => rig.q('#copy-report').closest('section')!.querySelector('.status')!.textContent === 'Copied.');
  });
});

describe('state storage', () => {
  it('web storage keeps values as JSON under the same keys and returns only what exists', async () => {
    const backing = new Map<string, string>();
    const fake = { get length() { return backing.size; }, key: (i: number) => [...backing.keys()][i] ?? null, getItem: (k: string) => backing.get(k) ?? null, setItem: (k: string, v: string) => { backing.set(k, v); }, removeItem: (k: string) => { backing.delete(k); }, clear: () => backing.clear() } as Storage;
    const area = createWebStorageArea(fake);
    await area.set({ a: { x: 1 }, b: 'two' });
    expect(backing.get('a')).toBe('{"x":1}');
    expect(await area.get('a')).toEqual({ a: { x: 1 } });
    expect(await area.get(['a', 'zz'])).toEqual({ a: { x: 1 } });
    expect(Object.keys(await area.get(null)).sort()).toEqual(['a', 'b']);
    backing.set('bad', '{not json');
    expect(await area.get('bad')).toEqual({});
    await area.remove(['a', 'b']);
    expect(backing.has('a')).toBe(false);
  });

  it('ignores a malformed stored session and serialises quick progress changes', async () => {
    const area = createMemoryStorageArea();
    const state = createStateStore(area);
    await area.set({ [KEYS.session]: { token: 5 } });
    expect(await state.getSession()).toBeUndefined();
    await Promise.all([state.markVisited('sync'), state.patchProgress({ tutorialStep: 2 }), state.recordPack('pack:sq', { version: '9', ok: true, verifiedAt: 'x' }), state.markVisited('privacy')]);
    expect(await state.getProgress()).toMatchObject({ visited: ['sync', 'privacy'], tutorialStep: 2, packs: { 'pack:sq': { version: '9' } } });
  });
});
