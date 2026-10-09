// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SERVICE_URL, loadConfig, resolveServiceUrl, validateServiceUrl } from '../../packages/golearn-extension/app/config';
import { KEYS, type Session } from '../../packages/golearn-extension/app/state';
import { DEVICE_KEY } from '../../packages/golearn-extension/src/store';
import { destroyRigs, fakeBackground, flush, makeRig, signIn, submit, type, until, choose } from './helpers';

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

describe('the Account screen', () => {
  it('refuses an http, non-localhost service address and keeps the old one', async () => {
    const rig = await makeRig({ config: { serviceUrl: 'https://repository.example.org' } });
    await rig.go('account');
    const input = rig.q<HTMLInputElement>('#svc-url');
    expect(input.value).toBe('https://repository.example.org');
    type(input, 'http://repository.example.org');
    rig.q('#svc-save').click();
    await flush(10);
    const status = rig.q('#svc-save').closest('section')!.querySelector('.status')!;
    expect(status.getAttribute('data-kind')).toBe('error');
    expect(status.textContent).toContain('https');
    expect((await rig.area.get(KEYS.service))[KEYS.service]).toBeUndefined();
    // and a sign-in still goes to the address that was valid
    expect(await rig.app.ctx.serviceUrl()).toBe('https://repository.example.org');
  });

  it('accepts localhost over http and https, and an empty field returns to the default', async () => {
    const rig = await makeRig();
    await rig.go('account');
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
    expect(rig.q('#signed-in-as').textContent).toBe('Signed in as ana@example.org');
    // a dummy device id was created once and sent with the sign-in
    const device = (await rig.area.get(DEVICE_KEY))[DEVICE_KEY] as string;
    expect(device).toMatch(/^dev-/);
    expect(rig.service.calls.find((c) => c.method === 'createSession')!.args[1]).toBe(device);
    // the password is stored nowhere, and the token only in golearn:session
    const dump = (rig.area as unknown as { dump(): Record<string, unknown> }).dump();
    expect(JSON.stringify(dump)).not.toContain('correct horse battery');
    for (const [k, v] of Object.entries(dump)) if (k !== KEYS.session) expect(JSON.stringify(v), k).not.toContain(s!.token);
    expect((rig.q('#acct-password') as HTMLInputElement).value).toBe('');
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
    expect(rig.q('#signed-in-as').textContent).toBe('Signed in as bo@example.org');
  });

  it('create account: refuses a short password before any request, then creates and signs in', async () => {
    const rig = await makeRig();
    await rig.go('account');
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
    await rig.go('account');
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
    await rig.go('account');
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
    rig.q('#acct-disconnect').click();
    await until(() => /Not signed in/.test(rig.text()));
    expect(bg.messages.map((m) => m.type)).toContain('golearn:disconnect');
    expect(await sessionOf(rig.area)).toBeUndefined();
  });

  it('the service address goes to the worker too (golearn:service-config), which validates and stores it', async () => {
    const rig = await makeRig({ extension: true });
    const bg = fakeBackground(rig);
    await rig.go('account');
    type(rig.q('#svc-url'), 'https://repository.example.org/');
    rig.q('#svc-save').click();
    await until(() => bg.messages.some((m) => m.type === 'golearn:service-config'));
    expect(bg.messages.find((m) => m.type === 'golearn:service-config')).toMatchObject({ op: 'set', baseUrl: 'https://repository.example.org' });
    await flush(20);
    expect(await rig.app.ctx.serviceUrl()).toBe('https://repository.example.org');
  });
});
