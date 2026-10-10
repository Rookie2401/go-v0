// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SERVICE_URL, loadConfig, resolveServiceUrl, validateServiceUrl } from '../../packages/golearn-extension/app/config';
import { KEYS, type Session } from '../../packages/golearn-extension/app/state';
import { DEVICE_KEY } from '../../packages/golearn-extension/src/store';
import { cardStatus, downloadLanguage, destroyRigs, fakeBackground, flush, makeRig, signIn, submit, type, until, choose } from './helpers';

afterEach(() => destroyRigs());

const sessionOf = async (area: { get(k: string): Promise<Record<string, unknown>> }): Promise<Session | undefined> => (await area.get(KEYS.session))[KEYS.session] as Session | undefined;

describe('the service address', () => {
  it('accepts https anywhere and http only on a loopback host', () => {
    expect(validateServiceUrl('https://repository.example.org/')).toEqual({ ok: true, url: 'https://repository.example.org' });
    expect(validateServiceUrl('https://example.org/api/')).toEqual({ ok: true, url: 'https://example.org/api' });
    expect(validateServiceUrl('http://localhost:8790')).toEqual({ ok: true, url: 'http://localhost:8790' });
    expect(validateServiceUrl('http://127.0.0.1:8790/')).toEqual({ ok: true, url: 'http://127.0.0.1:8790' });
    expect(validateServiceUrl('http://[::1]:8790')).toEqual({ ok: true, url: 'http://[::1]:8790' });
    expect(validateServiceUrl('http://repo.localhost:3000').ok).toBe(true);
  });

  it('refuses plain http to anywhere else, other schemes, credentials, queries and junk', () => {
    for (const bad of ['http://example.org', 'http://192.168.1.5:8790', 'http://localhost.evil.example', 'ftp://example.org', 'javascript:alert(1)', 'https://user:pw@example.org', 'https://example.org/?a=1', 'not a url', '']) {
      expect(validateServiceUrl(bad).ok, bad).toBe(false);
    }
  });

  it('resolves override, then config.json, then the development default; a config that fails validation is dropped', async () => {
    expect(resolveServiceUrl(undefined, {})).toBe(DEFAULT_SERVICE_URL);
    expect(resolveServiceUrl(undefined, { serviceUrl: 'https://r.example.org' })).toBe('https://r.example.org');
    expect(resolveServiceUrl('https://mine.example.org', { serviceUrl: 'https://r.example.org' })).toBe('https://mine.example.org');
    expect(resolveServiceUrl('http://evil.example', {})).toBe(DEFAULT_SERVICE_URL);
    const ok = async () => new Response(JSON.stringify({ serviceUrl: 'https://r.example.org/', assetBaseUrl: '/x/' }));
    expect(await loadConfig(ok as unknown as typeof fetch)).toEqual({ serviceUrl: 'https://r.example.org', assetBaseUrl: '/x/' });
    const insecure = async () => new Response(JSON.stringify({ serviceUrl: 'http://evil.example' }));
    expect(await loadConfig(insecure as unknown as typeof fetch)).toEqual({});
    const html = async () => new Response('<!doctype html><html></html>'); // a dev server's fallback for a missing file
    expect(await loadConfig(html as unknown as typeof fetch)).toEqual({});
    const down = async () => { throw new Error('offline'); };
    expect(await loadConfig(down as unknown as typeof fetch)).toEqual({});
  });
});

describe('Sign-in page (optional)', () => {
  it('refuses an http, non-localhost service address and keeps the old one', async () => {
    const rig = await makeRig({ config: { serviceUrl: 'https://repository.example.org' } });
    await rig.go('signin');
    const input = rig.q<HTMLInputElement>('#svc-url');
    expect(input.value).toBe('https://repository.example.org');
    type(input, 'http://repository.example.org');
    rig.q('#svc-save').click();
    await flush(10);
    const status = rig.q('#svc-save').closest('details')!.querySelector('.status')!;
    expect(status.getAttribute('data-kind')).toBe('error');
    expect(status.textContent).toContain('https');
    expect((await rig.area.get(KEYS.service))[KEYS.service]).toBeUndefined();
    // and a sign-in still goes to the address that was valid
    expect(await rig.app.ctx.serviceUrl()).toBe('https://repository.example.org');
  });

  it('accepts localhost over http and https, and an empty field returns to the default', async () => {
    const rig = await makeRig();
    await rig.go('signin');
    const input = rig.q<HTMLInputElement>('#svc-url');
    expect(input.value).toBe(DEFAULT_SERVICE_URL);
    type(input, 'http://localhost:9000/');
    rig.q('#svc-save').click();
    await flush(10);
    expect(await rig.app.ctx.serviceUrl()).toBe('http://localhost:9000');
    type(input, 'https://repository.example.org');
    rig.q('#svc-save').click();
    await flush(10);
    expect(await rig.app.ctx.serviceUrl()).toBe('https://repository.example.org');
    type(input, '');
    rig.q('#svc-save').click();
    await flush(10);
    expect(await rig.app.ctx.serviceUrl()).toBe(DEFAULT_SERVICE_URL);
  });

  it('never sends the password to an insecure address, even when one slipped into storage', async () => {
    const rig = await makeRig();
    await rig.deps.area.set({ [KEYS.service]: { baseUrl: 'http://evil.example' } });
    // the stored value no longer validates, so the default is used; nothing is sent to evil.example
    expect(await rig.app.ctx.serviceUrl()).toBe(DEFAULT_SERVICE_URL);
    await signIn(rig);
    expect(rig.createApiCalls.every((c) => c.baseUrl === DEFAULT_SERVICE_URL)).toBe(true);
  });

  it('signing in stores exactly the session shape, a device id, and nothing else secret', async () => {
    const rig = await makeRig();
    await signIn(rig, 'ana@example.org', 'correct horse battery');
    const s = await sessionOf(rig.area);
    expect(Object.keys(s!).sort()).toEqual(['email', 'enrolmentId', 'expiresAt', 'languageId', 'learnerId', 'token']);
    expect(s).toMatchObject({ email: 'ana@example.org', learnerId: 'learner-ana', enrolmentId: '', languageId: '', expiresAt: '2026-11-08T00:00:00.000Z' });
    expect(s!.token).toMatch(/^tok-learner-ana-/);
    await rig.go('settings');
    expect(rig.q('#signed-in-as').textContent).toBe('Signed in as ana@example.org');
    // a dummy device id was created once and sent with the sign-in
    const device = (await rig.area.get(DEVICE_KEY))[DEVICE_KEY] as string;
    expect(device).toMatch(/^dev-/);
    expect(rig.service.calls.find((c) => c.method === 'createSession')!.args[1]).toBe(device);
    // the password is stored nowhere, and the token only in golearn:session
    const dump = (rig.area as unknown as { dump(): Record<string, unknown> }).dump();
    expect(JSON.stringify(dump)).not.toContain('correct horse battery');
    for (const [k, v] of Object.entries(dump)) if (k !== KEYS.session) expect(JSON.stringify(v), k).not.toContain(s!.token);
  });

  it('adopts the newest enrolment the account already has', async () => {
    const rig = await makeRig();
    rig.service.enrolments.push(
      { enrolmentId: 'old', learnerId: 'learner-ana', languageId: 'es', packId: 'pack:es', packVersion: '3', goals: [], startedAt: '2026-01-01T00:00:00Z' },
      { enrolmentId: 'new', learnerId: 'learner-ana', languageId: 'sq', packId: 'pack:sq', packVersion: '9', goals: [], startedAt: '2026-06-01T00:00:00Z' },
    );
    await signIn(rig);
    expect(await sessionOf(rig.area)).toMatchObject({ enrolmentId: 'new', languageId: 'sq' });
  });

  it('a second sign-in replaces the session and clears the cached profile', async () => {
    const rig = await makeRig();
    await signIn(rig, 'ana@example.org');
    const first = await sessionOf(rig.area);
    await rig.app.ctx.state.setProfile({ fetchedAt: '2026-10-08T00:00:00Z', email: 'ana@example.org', learnerId: first!.learnerId, enrolments: [] });
    expect(await rig.app.ctx.state.getProfile()).toBeDefined();
    await signIn(rig, 'bo@example.org', 'another long password');
    const second = await sessionOf(rig.area);
    expect(second!.email).toBe('bo@example.org');
    expect(second!.learnerId).not.toBe(first!.learnerId);
    expect(second!.token).not.toBe(first!.token);
    expect((await rig.area.get(KEYS.profile))[KEYS.profile]).toBeUndefined();
    await rig.go('settings');
    expect(rig.q('#signed-in-as').textContent).toBe('Signed in as bo@example.org');
  });

  it('create account: refuses a short password before any request, then creates and signs in', async () => {
    const rig = await makeRig();
    await rig.go('signin');
    choose(rig.q('#acct-mode'), 'create');
    type(rig.q('#acct-email'), 'new@example.org');
    type(rig.q('#acct-password'), 'short');
    submit(rig.q('#acct-form'));
    await flush(10);
    expect(rig.q('#acct-form .status').textContent).toMatch(/at least 10/);
    expect(rig.service.calls).toHaveLength(0);
    await signIn(rig, 'new@example.org', 'a long enough password', true);
    expect(rig.service.calls.map((c) => c.method)).toEqual(expect.arrayContaining(['createAccount', 'createSession']));
    expect((await sessionOf(rig.area))!.email).toBe('new@example.org');
  });

  it('explains wrong credentials and an unreachable service plainly, and keeps nothing', async () => {
    const rig = await makeRig();
    rig.service.accounts.set('ana@example.org', { password: 'right password!', learnerId: 'l1', email: 'ana@example.org' });
    await rig.go('signin');
    type(rig.q('#acct-email'), 'ana@example.org');
    type(rig.q('#acct-password'), 'wrong password');
    submit(rig.q('#acct-form'));
    await until(() => /not accepted/.test(rig.q('#acct-form .status').textContent ?? ''));
    expect(await sessionOf(rig.area)).toBeUndefined();
    rig.service.down = true;
    type(rig.q('#acct-password'), 'right password!');
    submit(rig.q('#acct-form'));
    await until(() => /could not reach/i.test(rig.q('#acct-form .status').textContent ?? ''));
    expect(await sessionOf(rig.area)).toBeUndefined();
    expect(rig.q<HTMLInputElement>('#acct-password').value).toBe('');
  });

  it('disconnect revokes the session on the service and drops the local one and the profile', async () => {
    const rig = await makeRig();
    await signIn(rig);
    await rig.app.ctx.state.setProfile({ fetchedAt: 'x', email: 'ana@example.org', learnerId: 'l', enrolments: [] });
    await rig.go('settings');
    rig.q('#acct-disconnect').click();
    await until(() => /Not signed in/.test(rig.text()));
    expect(rig.service.calls.map((c) => c.method)).toContain('deleteSession');
    expect(await rig.app.ctx.state.getProfile()).toBeUndefined();
    expect(rig.text()).toContain('Not signed in');
  });
});

describe('connecting in the extension', () => {
  it('asks the background worker to sign in (the password goes in the message, nowhere else), and the worker keeps the session', async () => {
    const rig = await makeRig({ extension: true });
    const bg = fakeBackground(rig);
    await signIn(rig);
    const sent = bg.messages.find((m) => m.type === 'golearn:connect')!;
    expect(sent).toMatchObject({ type: 'golearn:connect', email: 'ana@example.org', password: 'correct horse battery', baseUrl: 'http://127.0.0.1:8790' });
    expect(rig.createApiCalls).toHaveLength(0); // this page made no request to the service itself
    const s = await sessionOf(rig.area);
    expect(s).toMatchObject({ email: 'ana@example.org' });
    // the worker uploaded the device’s history and said how many; the page shows the count and made no upload of its own
    expect(rig.q('#flash').textContent).toContain('Uploaded 3 events from this device to your account');
    expect(rig.local.uploads).toHaveLength(0);
    await rig.go('settings');
    expect(rig.q('#signed-in-as').textContent).toBe('Signed in as ana@example.org');
    expect(JSON.stringify((rig.area as unknown as { dump(): Record<string, unknown> }).dump())).not.toContain('correct horse battery');
  });

  it('create account goes to golearn:create-account; a refusal from the worker is shown as it is', async () => {
    const rig = await makeRig({ extension: true });
    const bg = fakeBackground(rig);
    await signIn(rig, 'new@example.org', 'a long enough password', true);
    expect(bg.messages.map((m) => m.type)).toContain('golearn:create-account');
    // the worker refuses a wrong password: its words reach the screen, and nothing is kept
    rig.service.accounts.set('bo@example.org', { password: 'right password!', learnerId: 'l-bo', email: 'bo@example.org' });
    await rig.go('signin');
    choose(rig.q('#acct-mode'), 'signin');
    type(rig.q('#acct-email'), 'bo@example.org');
    type(rig.q('#acct-password'), 'wrong password');
    submit(rig.q('#acct-form'));
    await until(() => /not accepted/.test(rig.q('#acct-form .status').textContent ?? ''));
    expect(rig.q('#acct-form .status').getAttribute('data-kind')).toBe('error');
  });

  it('without a worker that answers, signs in from this page and writes golearn:session itself', async () => {
    const rig = await makeRig({ extension: true });
    fakeBackground(rig, []); // listens, answers nothing
    await signIn(rig, 'bo@example.org');
    expect(rig.createApiCalls.length).toBeGreaterThan(0);
    expect((await sessionOf(rig.area))!.email).toBe('bo@example.org');
  });

  it('a second sign-in through the worker also clears the cached profile', async () => {
    const rig = await makeRig({ extension: true });
    fakeBackground(rig);
    await signIn(rig, 'ana@example.org');
    await rig.app.ctx.state.setProfile({ fetchedAt: 'x', email: 'ana@example.org', learnerId: 'l', enrolments: [] });
    await signIn(rig, 'bo@example.org', 'another long password');
    expect((await sessionOf(rig.area))!.email).toBe('bo@example.org');
    expect(await rig.app.ctx.state.getProfile()).toBeUndefined();
  });

  it('disconnect asks the worker, which drops the session', async () => {
    const rig = await makeRig({ extension: true });
    const bg = fakeBackground(rig);
    await signIn(rig);
    await rig.go('settings');
    rig.q('#acct-disconnect').click();
    await until(() => /Not signed in/.test(rig.text()));
    expect(bg.messages.map((m) => m.type)).toContain('golearn:disconnect');
    expect(await sessionOf(rig.area)).toBeUndefined();
  });

  it('the service address goes to the worker too (golearn:service-config), which validates and stores it', async () => {
    const rig = await makeRig({ extension: true });
    const bg = fakeBackground(rig);
    await rig.go('signin');
    type(rig.q('#svc-url'), 'https://repository.example.org/');
    rig.q('#svc-save').click();
    await until(() => bg.messages.some((m) => m.type === 'golearn:service-config'));
    expect(bg.messages.find((m) => m.type === 'golearn:service-config')).toMatchObject({ op: 'set', baseUrl: 'https://repository.example.org' });
    await flush(20);
    expect(await rig.app.ctx.serviceUrl()).toBe('https://repository.example.org');
  });
});

describe('an account is optional and only keeps progress across devices', () => {
  const pickSq = async (rig: Awaited<ReturnType<typeof makeRig>>): Promise<void> => { await downloadLanguage(rig, 'sq'); };

  it('the sign-in page is the first page: the brand, one sentence, the form, and a plain “Continue without an account” that says an account is optional', async () => {
    const rig = await makeRig();
    expect(rig.app.current()).toBe('signin');
    expect(rig.q('#signin')).toBeTruthy();
    expect(rig.q('#screen h1').textContent).toBe('Sign in');
    expect(rig.q('.topbar .brand').textContent).toBe('GoLearn');
    expect(rig.q('.signin .hero-brand').textContent).toBe('GoLearn');
    expect(rig.text()).toContain('select a word on a web page');
    for (const id of ['#acct-form', '#acct-email', '#acct-password', '#acct-mode', '#acct-submit', '#service-address']) expect(rig.root.querySelector(id), id).not.toBeNull();
    expect(rig.q<HTMLDetailsElement>('#service-address').open).toBe(false);
    expect(rig.q('#continue-without-account').textContent).toBe('Continue without an account');
    expect(rig.text()).toContain('An account is optional: it only keeps your progress across devices');
    expect(rig.q('#account-state').textContent).toBe('On this device only');
    expect(rig.root.querySelector('#acct-not-now')).toBeNull();
    expect(rig.q('#account-state').hidden).toBe(true); // a clean page: nothing is said about the account until someone signs in
    // nothing on this page is the language list
    expect(rig.root.querySelector('#language-cards')).toBeNull();
    await rig.go('home');
    expect(rig.q('#progress-mode').textContent).toContain('On this device only');
    expect(rig.createApiCalls).toHaveLength(0); // nothing was sent anywhere
  });

  it('“Continue without an account” moves on to the languages page and sends nothing anywhere', async () => {
    const rig = await makeRig();
    expect(rig.app.current()).toBe('signin');
    rig.q('#continue-without-account').click();
    await until(() => rig.app.current() === 'languages');
    await rig.app.ready();
    expect(window.location.hash).toBe('#/languages');
    expect(rig.q('#language-cards')).toBeTruthy();
    expect(rig.q('#account-line').getAttribute('data-state')).toBe('device');
    expect(rig.root.querySelector('#flash')).toBeNull();
    expect(await sessionOf(rig.area)).toBeUndefined();
    expect(rig.createApiCalls).toHaveLength(0);
    expect(rig.service.calls).toHaveLength(0);
  });

  it('creating an account on the sign-in page moves on to the languages page, which says who is signed in', async () => {
    const rig = await makeRig();
    await signIn(rig, 'new@example.org', 'a long enough password', true);
    expect(rig.app.current()).toBe('languages');
    expect(window.location.hash).toBe('#/languages');
    expect(rig.q('#flash').textContent).toContain('Account created and signed in as new@example.org');
    expect(rig.q('#account-line').getAttribute('data-state')).toBe('synced');
    // the note is shown once
    await rig.go('settings');
    await rig.go('languages');
    expect(rig.root.querySelector('#flash')).toBeNull();
  });

  it('a wrong password keeps the learner on the sign-in page', async () => {
    const rig = await makeRig();
    rig.service.accounts.set('ana@example.org', { password: 'right password!', learnerId: 'l1', email: 'ana@example.org' });
    type(rig.q('#acct-email'), 'ana@example.org');
    type(rig.q('#acct-password'), 'wrong password');
    submit(rig.q('#acct-form'));
    await until(() => /not accepted/.test(rig.q('#acct-form .status').textContent ?? ''));
    await flush(20);
    expect(rig.app.current()).toBe('signin');
  });

  it('Settings holds the account: signed in as … with sign-out, or “On this device only” with a link to the sign-in page', async () => {
    const rig = await makeRig();
    await rig.go('settings');
    expect(rig.q('#settings-account h2').textContent).toBe('Account');
    expect(rig.q('#account-state').textContent).toBe('On this device only');
    expect(rig.q('#settings-signin').getAttribute('href')).toBe('#/signin');
    expect(rig.root.querySelector('#acct-form, #svc-url')).toBeNull(); // the form lives on the sign-in page
    await signIn(rig);
    await rig.go('settings');
    expect(rig.q('#signed-in-as').textContent).toBe('Signed in as ana@example.org');
    expect(rig.q('#acct-disconnect').textContent).toBe('Sign out of this device');
    expect(rig.q('#settings-signin').getAttribute('href')).toBe('#/signin');
    // and the sign-in page remains reachable, with the form for another account
    await rig.go('signin');
    expect(rig.q('#acct-form')).toBeTruthy();
    expect(rig.q('#signed-in-as').textContent).toBe('Signed in as ana@example.org');
  });

  it('signing in uploads the device’s history once, shows the count, and switches to “Synced to your account”', async () => {
    const rig = await makeRig();
    await pickSq(rig);
    await signIn(rig);
    expect(rig.local.uploads).toHaveLength(1);
    expect(rig.q('#flash').textContent).toContain('Uploaded 3 events from this device to your account');
    expect(rig.q('#flash').textContent).toContain('Progress is now synced to your account');
    expect(rig.q('#account-line').textContent).toContain('Synced to your account as ana@example.org');
    await rig.go('settings');
    expect(rig.q('#account-state').textContent).toBe('Synced to your account as ana@example.org');
    // the language chosen before the account is now also an enrolment on the account, and the session’s active one
    expect(rig.service.enrolments.map((e) => e.languageId)).toEqual(['sq']);
    expect(rig.service.enrolments[0]).not.toHaveProperty('teamId');
    expect(await sessionOf(rig.area)).toMatchObject({ enrolmentId: rig.service.enrolments[0].enrolmentId, languageId: 'sq' });
    // creating an account does the same
    await rig.app.ctx.signOut();
    await signIn(rig, 'new@example.org', 'a long enough password', true);
    expect(rig.local.uploads).toHaveLength(2);
  });

  it('a count of one reads in the singular, and an upload that failed does not stop the sign-in or claim a count', async () => {
    const rig = await makeRig();
    rig.local.uploadResult = { sent: 1 };
    await signIn(rig);
    expect(rig.q('#flash').textContent).toContain('Uploaded 1 event from this device');
    await rig.app.ctx.signOut();
    rig.local.uploadFails = true;
    await signIn(rig, 'bo@example.org', 'another long password');
    expect(rig.q('#flash').textContent).toMatch(/Signed in as bo@example\.org\./);
    expect(rig.q('#flash').textContent).not.toMatch(/Uploaded/);
    expect(rig.q('#flash').getAttribute('role')).toBe('status');
  });

  it('with nothing to upload it says so', async () => {
    const rig = await makeRig();
    rig.local.uploadResult = { sent: 0, duplicates: 0, failed: 0 };
    await signIn(rig);
    expect(rig.q('#flash').textContent).toContain('Nothing needed uploading from this device');
  });

  it('signing out returns to this device alone: the choice and the local data stay, and nothing is cleared', async () => {
    const rig = await makeRig();
    await pickSq(rig);
    await signIn(rig);
    await rig.go('settings');
    rig.q('#acct-disconnect').click();
    await until(() => /Not signed in/.test(rig.text()));
    expect(rig.q('#account-state').textContent).toBe('On this device only');
    expect(await sessionOf(rig.area)).toBeUndefined();
    expect(rig.local.cleared).toBe(0);
    expect(await rig.app.ctx.activeLanguage()).toMatchObject({ languageId: 'sq' });
    expect(rig.local.enrolments).toHaveLength(1);
    await rig.go('home');
    expect(rig.q('#progress-mode').textContent).toContain('On this device only');
  });

  it('“Clear local data” is explicit: the first click only arms it, leaving it disarms it, the second clears the on-device Repository', async () => {
    const rig = await makeRig();
    await rig.go('privacy');
    const btn = rig.q<HTMLButtonElement>('#clear-local');
    btn.click();
    await flush(5);
    expect(btn.textContent).toBe('Click again to clear');
    expect(rig.local.cleared).toBe(0);
    btn.dispatchEvent(new Event('blur'));
    expect(btn.textContent).toBe('Clear local data');
    btn.click();
    await flush(5);
    btn.click();
    await until(() => rig.local.cleared === 1);
    await until(() => /Cleared the local data/.test(rig.q('#priv-clear').closest('section')!.textContent ?? ''));
  });
});

describe('after sign-in everything that needs doing happens by itself', () => {
  it('a language chosen before signing in stays installed, becomes an enrolment on the account, and nothing is installed twice', async () => {
    const rig = await makeRig();
    await downloadLanguage(rig, 'sq');
    await signIn(rig);
    await until(() => rig.service.enrolments.length === 1);
    expect(rig.service.enrolments[0]).toMatchObject({ languageId: 'sq', packId: 'pack:sq' });
    expect(rig.local.uploads).toHaveLength(1);
    expect(rig.packs.installs).toHaveLength(1);
    await rig.go('settings');
    expect(rig.q('#account-state').textContent).toBe('Synced to your account as ana@example.org');
    await rig.go('languages');
    expect(rig.q('#language-cards [data-language="sq"] .mine').textContent).toContain('Downloaded · ready');
  });

  it('on a new device the account’s language gets its pack installed without a click', async () => {
    const rig = await makeRig();
    rig.service.enrolments.push({ enrolmentId: 'acct-1', learnerId: 'learner-ana', languageId: 'sq', varietyId: 'sq-standard', packId: 'pack:sq', packVersion: '9', goals: [], startedAt: '2026-06-01T00:00:00Z' } as never);
    expect(rig.root.querySelector('#next-note')).toBeNull();
    await signIn(rig);
    await until(() => rig.packs.installs.length === 1);
    await until(() => /Albanian is ready/.test(cardStatus(rig, 'sq')));
    expect(cardStatus(rig, 'sq')).toContain('Taken from your account');
    await until(() => rig.root.querySelector('#next-note'));
    expect(rig.q('#next-note').textContent).toContain('GoLearn Active');
    // the account’s enrolment was used; no second one was made
    expect(rig.service.enrolments).toHaveLength(1);
  });

  it('a pack that failed before signing in is installed again after it', async () => {
    const rig = await makeRig();
    rig.packs.nextInstall = { ok: false, version: '9', checks: [{ id: 'sample-shard', label: 'A dictionary shard can be fetched and read', ok: false }] };
    await downloadLanguage(rig, 'sq');
    expect(rig.packs.installs).toHaveLength(1);
    rig.packs.nextInstall = { ok: true, version: '9', checks: [{ id: 'sample-shard', label: 'A dictionary shard can be fetched and read', ok: true }] };
    await signIn(rig);
    await until(() => rig.packs.installs.length === 2);
    await until(() => /Albanian is ready/.test(cardStatus(rig, 'sq')));
  });

  it('signing out under Settings keeps the languages and says the progress is on this device only', async () => {
    const rig = await makeRig();
    await downloadLanguage(rig, 'sq');
    await signIn(rig);
    await rig.go('settings');
    rig.q('#acct-disconnect').click();
    await until(() => /Not signed in/.test(rig.text()));
    expect(rig.q('#account-state').textContent).toBe('On this device only');
    expect(rig.q('#settings-signin').getAttribute('href')).toBe('#/signin');
    await rig.go('languages');
    expect(rig.q('#language-cards [data-language="sq"] .mine').textContent).toContain('Downloaded · ready');
    expect(rig.q('#next-note').textContent).toContain('GoLearn Active');
  });

  it('the service address sits under the form as an advanced detail, closed by default', async () => {
    const rig = await makeRig();
    const d = rig.q<HTMLDetailsElement>('#service-address');
    expect(d.open).toBe(false);
    expect(d.querySelector('summary')!.textContent).toMatch(/Service address/);
    expect(d.querySelector('#svc-url')).not.toBeNull();
  });
});
