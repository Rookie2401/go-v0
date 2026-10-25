// @vitest-environment jsdom
/**
 * The standalone Biblia's account (packages/biblia/src/account.ts): the service (sign in, create account, forgot password, sign out, a kept
 * session confirmed or ended by GET /me) over a fake `fetch` that imitates the Repository's account routes, and the screen at #/account. No network.
 * The password is only ever in the request body: these tests check it is in no storage, no status line and no field after a submit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAccountService, renderAccountScreen, renderLegalScreen, type AccountService } from '../../packages/biblia/src/account';
import { SESSION_KEY, DEVICE_KEY } from '../../packages/biblia/src/session';

const SERVICE = 'https://repo.example.org';
const PASSWORD = 'correct horse battery';

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

class FakeService {
  email = 'ana@example.org';
  password = PASSWORD;
  token = 'tok-fake-1';
  down = false;
  /** What POST /accounts says about the confirmation email (undefined = it says nothing). */
  verificationSent: boolean | undefined = true;
  unverified = false;
  failNext = new Map<string, { status: number; body: Record<string, unknown> }>();
  calls: Array<{ method: string; path: string; body?: Record<string, unknown>; auth?: string; text?: string }> = [];
  revoked = new Set<string>();
  private json(status: number, body?: unknown): Response {
    return status === 204 ? new Response(null, { status }) : new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }
  readonly fetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (this.down) throw new TypeError('network down');
    const url = new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    this.calls.push({ method, path: url.pathname, ...(body ? { body } : {}), ...(headers.Authorization ? { auth: headers.Authorization } : {}), text: init?.body ? String(init.body) : '' });
    const key = `${method} ${url.pathname}`;
    const forced = this.failNext.get(key);
    if (forced) { this.failNext.delete(key); return this.json(forced.status, forced.body); }
    const authed = headers.Authorization === `Bearer ${this.token}` && !this.revoked.has(this.token);
    if (key === 'POST /accounts') {
      if (String(body?.email) === this.email) return this.json(409, { error: 'email-taken', message: 'There is already an account with that email.' });
      this.email = String(body?.email); this.password = String(body?.password);
      return this.json(201, { learnerId: 'L-new', accountId: 'A-new', ...(this.verificationSent === undefined ? {} : { verificationSent: this.verificationSent }) });
    }
    if (key === 'POST /sessions') {
      if (body?.email !== this.email || body?.password !== this.password) return this.json(401, { error: 'bad-credentials', message: 'The email or the password is not right.' });
      if (this.unverified) return this.json(403, { error: 'email-unverified', message: 'Confirm your email address first.' });
      return this.json(201, { token: this.token, learnerId: 'L1', expiresAt: '2099-01-01T00:00:00.000Z' });
    }
    if (key === 'DELETE /sessions/current') { if (!authed) return this.json(401, { error: 'unauthorized', message: 'Sign in.' }); this.revoked.add(this.token); return this.json(204); }
    if (key === 'GET /me') return authed ? this.json(200, { learner: null, account: { accountId: 'A1', email: this.email, createdAt: '2026-09-01T00:00:00.000Z' }, enrolments: [], devices: [], consents: [] }) : this.json(401, { error: 'unauthorized', message: 'Sign in.' });
    if (key === 'POST /accounts/password/forgot') return this.json(202, { accepted: true });
    if (key === 'POST /accounts/verify/resend') return this.json(202, { accepted: true });
    return this.json(404, { error: 'not-found', message: `No route ${key}` });
  }) as typeof fetch;
  count(method: string, path: string): number { return this.calls.filter((c) => c.method === method && c.path === path).length; }
}

function make(over: { storage?: Storage } = {}) {
  const svc = new FakeService();
  const storage = over.storage ?? memoryStorage();
  const account = createAccountService({ serviceUrl: SERVICE, storage, fetch: svc.fetch, now: () => new Date('2026-10-22T12:00:00Z') });
  return { svc, storage: storage as ReturnType<typeof memoryStorage>, account };
}

describe('the account service', () => {
  it('signs in, keeps the session under biblia:session (token, learner, email, service, device) and never the password', async () => {
    const { svc, storage, account } = make();
    expect(account.state()).toEqual({ signedIn: false });
    const seen = vi.fn();
    account.subscribe(seen);
    expect(await account.signIn(' ana@example.org ', PASSWORD)).toEqual({ ok: true });
    expect(seen).toHaveBeenCalled();
    expect(account.state()).toEqual({ signedIn: true, email: 'ana@example.org' });
    const stored = JSON.parse(storage.getItem(SESSION_KEY)!) as Record<string, string>;
    expect(stored).toMatchObject({ serviceUrl: SERVICE, token: 'tok-fake-1', learnerId: 'L1', email: 'ana@example.org' });
    expect(stored.deviceId).toMatch(/^biblia:web:[0-9a-f]{24}$/);
    expect(storage.getItem(DEVICE_KEY)).toBe(stored.deviceId);
    expect([...storage.data.values()].join('\n')).not.toContain(PASSWORD);
    // the password travelled only in the POST /sessions body, with this browser's device id
    const post = svc.calls.find((c) => c.path === '/sessions')!;
    expect(post.body).toMatchObject({ email: 'ana@example.org', password: PASSWORD, deviceId: stored.deviceId, platform: 'web' });
    expect(svc.calls.filter((c) => c.text?.includes(PASSWORD)).map((c) => c.path)).toEqual(['/sessions']);
    // the api carries the token
    await account.api()!.me();
    expect(svc.calls.at(-1)).toMatchObject({ path: '/me', auth: 'Bearer tok-fake-1' });
  });

  it('a wrong password is the service own message and nothing is kept', async () => {
    const { storage, account } = make();
    const r = await account.signIn('ana@example.org', 'wrong wrong wrong');
    expect(r).toMatchObject({ ok: false, message: 'The email or the password is not right.' });
    expect(account.state().signedIn).toBe(false);
    expect(storage.data.has(SESSION_KEY)).toBe(false);
  });

  it('an unreachable service is said plainly; an unconfirmed address is reported with its code', async () => {
    const { svc, account } = make();
    svc.down = true;
    expect(await account.signIn('ana@example.org', PASSWORD)).toMatchObject({ ok: false, code: 'unreachable', message: expect.stringMatching(/could not be reached/) });
    svc.down = false; svc.unverified = true;
    expect(await account.signIn('ana@example.org', PASSWORD)).toMatchObject({ ok: false, code: 'email-unverified' });
  });

  it('creating an account signs in and passes on what the service says about the confirmation email', async () => {
    for (const said of [true, false, undefined]) {
      const { svc, account } = make();
      svc.verificationSent = said;
      const r = await account.signUp('new@example.org', PASSWORD);
      expect(r).toEqual({ ok: true, ...(said === undefined ? {} : { verificationSent: said }) });
      expect(account.state()).toEqual({ signedIn: true, email: 'new@example.org' });
      expect(svc.count('POST', '/accounts')).toBe(1);
      expect(svc.count('POST', '/sessions')).toBe(1);
    }
  });

  it('an address that already has an account is refused with the service words', async () => {
    const { account } = make();
    expect(await account.signUp('ana@example.org', PASSWORD)).toMatchObject({ ok: false, message: 'There is already an account with that email.' });
    expect(account.state().signedIn).toBe(false);
  });

  it('forgot password gives the same answer for any address and only reports that it could not ask', async () => {
    const { svc, account } = make();
    expect(await account.forgot('nobody@example.org')).toEqual({ ok: true });
    svc.failNext.set('POST /accounts/password/forgot', { status: 404, body: { error: 'not-found', message: 'no such account' } });
    expect(await account.forgot('nobody@example.org')).toEqual({ ok: true }); // a 4xx reveals nothing
    svc.down = true;
    expect(await account.forgot('ana@example.org')).toMatchObject({ ok: false, message: expect.stringMatching(/could not be reached/) });
  });

  it('sign out deletes the session at the service and forgets it here, even when the service cannot be reached', async () => {
    const a = make();
    await a.account.signIn('ana@example.org', PASSWORD);
    await a.account.signOut();
    expect(a.svc.count('DELETE', '/sessions/current')).toBe(1);
    expect(a.account.state()).toEqual({ signedIn: false });
    expect(a.account.api()).toBeUndefined();
    expect(a.storage.data.has(SESSION_KEY)).toBe(false);
    const b = make();
    await b.account.signIn('ana@example.org', PASSWORD);
    b.svc.down = true;
    await b.account.signOut();
    expect(b.account.state().signedIn).toBe(false);
    expect(b.storage.data.has(SESSION_KEY)).toBe(false);
  });

  it('a kept session is confirmed on start; a 401 ends it; an unreachable service leaves it, marked offline', async () => {
    const first = make();
    await first.account.signIn('ana@example.org', PASSWORD);
    const reopen = (svc: FakeService) => createAccountService({ serviceUrl: SERVICE, storage: first.storage, fetch: svc.fetch });
    const ok = reopen(first.svc);
    expect(ok.state().signedIn).toBe(true);
    await ok.start();
    expect(ok.state()).toEqual({ signedIn: true, email: 'ana@example.org' });

    const offlineSvc = new FakeService(); offlineSvc.down = true;
    const off = reopen(offlineSvc);
    await off.start();
    expect(off.state()).toEqual({ signedIn: true, email: 'ana@example.org', offline: true });

    first.svc.revoked.add('tok-fake-1');
    const ended = reopen(first.svc);
    const seen = vi.fn();
    ended.subscribe(seen);
    await ended.start();
    expect(ended.state()).toEqual({ signedIn: false, expired: true });
    expect(first.storage.data.has(SESSION_KEY)).toBe(false);
    expect(seen).toHaveBeenCalled();
  });

  it('a session kept for another service address is not used', async () => {
    const first = make();
    await first.account.signIn('ana@example.org', PASSWORD);
    const other = createAccountService({ serviceUrl: 'https://elsewhere.example.org', storage: first.storage, fetch: first.svc.fetch });
    expect(other.state().signedIn).toBe(false);
  });

  it('expire() (a 401 met elsewhere) forgets the session and says it ended', async () => {
    const { account, storage } = make();
    await account.signIn('ana@example.org', PASSWORD);
    account.expire();
    expect(account.state()).toEqual({ signedIn: false, expired: true });
    expect(storage.data.has(SESSION_KEY)).toBe(false);
  });
});

describe('the account screen', () => {
  let account: AccountService;
  let svc: FakeService;
  let storage: ReturnType<typeof memoryStorage>;
  let done: ReturnType<typeof vi.fn>;
  const flush = async (): Promise<void> => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };
  const topbar = (): HTMLElement => { const d = document.createElement('div'); d.className = 'topbar'; d.textContent = 'Account'; return d; };
  const mount = (): HTMLElement => { const el = renderAccountScreen({ doc: document, account, topbar: topbar(), done: done as unknown as () => void }); document.body.replaceChildren(el); return el; };
  const q = <T extends Element>(sel: string): T => document.querySelector(sel) as T;
  const fill = (email: string, password: string): void => { q<HTMLInputElement>('#account-email').value = email; q<HTMLInputElement>('#account-password').value = password; };

  beforeEach(() => { ({ svc, storage, account } = make()); done = vi.fn(); document.body.innerHTML = ''; });
  afterEach(() => { document.body.innerHTML = ''; });

  it('signed out: email and password fields, Sign in, Create account, Forgot password and links to the Privacy Policy and Terms', () => {
    mount();
    expect(q<HTMLInputElement>('#account-email').type).toBe('email');
    expect(q<HTMLInputElement>('#account-password').type).toBe('password');
    expect(q('#account-signin').textContent).toBe('Sign in');
    expect(q('#account-create').textContent).toBe('Create account');
    expect(q('#forgot summary').textContent).toBe('Forgot password?');
    expect([...document.querySelectorAll('.legal-links a')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([['Terms', '#/terms'], ['Privacy Policy', '#/privacy']]); // GoReview's order: Terms · Privacy Policy (drafts)
  });

  it('the Service address disclosure (2026-10-25): shown only when the page offers it, prefilled, validated, saved through set(); the usual address clears the override', () => {
    mount();
    expect(document.querySelector('#service-address')).toBeNull();
    const set = vi.fn();
    const el = renderAccountScreen({ doc: document, account, topbar: topbar(), done: done as unknown as () => void, serviceAddress: { current: 'https://repo.example.org', standard: 'https://repo.example.org', set } });
    document.body.replaceChildren(el);
    expect(q('#service-address summary').textContent).toMatch(/^Service address/);
    expect(q<HTMLInputElement>('#service-url').value).toBe('https://repo.example.org');
    expect(q<HTMLButtonElement>('#service-reset').hidden).toBe(true);
    // the disclosure sits after Forgot password and before the email-links note, in the same card style
    const order = [...document.querySelectorAll('.screen > *')].map((n) => n.id || n.tagName.toLowerCase());
    expect(order.indexOf('service-address')).toBe(order.indexOf('forgot') + 1);
    expect(order.indexOf('email-links-note')).toBe(order.indexOf('service-address') + 1);
    // a bad address is refused and set() is not called
    q<HTMLInputElement>('#service-url').value = 'ftp://x';
    q<HTMLButtonElement>('#service-save').click();
    expect(q('#service-address .status').getAttribute('data-kind')).toBe('error');
    expect(set).not.toHaveBeenCalled();
    // the same address is a no-op
    q<HTMLInputElement>('#service-url').value = 'https://repo.example.org/';
    q<HTMLButtonElement>('#service-save').click();
    expect(set).not.toHaveBeenCalled();
    // another name for the service is kept (normalised: scheme added, trailing slash dropped)
    q<HTMLInputElement>('#service-url').value = 'go-v0.onrender.com/';
    q<HTMLButtonElement>('#service-save').click();
    expect(set).toHaveBeenCalledWith('https://go-v0.onrender.com');
    // with an override in force, the reset button shows and clears it
    const el2 = renderAccountScreen({ doc: document, account, topbar: topbar(), done: done as unknown as () => void, serviceAddress: { current: 'https://go-v0.onrender.com', standard: 'https://repo.example.org', set } });
    document.body.replaceChildren(el2);
    expect(q<HTMLButtonElement>('#service-reset').hidden).toBe(false);
    q<HTMLButtonElement>('#service-reset').click();
    expect(set).toHaveBeenLastCalledWith(undefined);
    // typing the usual address back also clears the override
    q<HTMLInputElement>('#service-url').value = 'https://repo.example.org';
    q<HTMLButtonElement>('#service-save').click();
    expect(set).toHaveBeenLastCalledWith(undefined);
  });

  it('is GoReview\'s sign-in design: the title with its rule, a WELCOME card, a SIGN IN card with EMAIL / PASSWORD labels, the gold Sign in, the forgot disclosure, the email-links note and the drafts line', () => {
    mount();
    expect(q('.screen > h1').textContent).toBe('Sign in');
    expect([...document.querySelectorAll('.screen > section.card > h2, .screen > form.card > h2')].map((h) => h.textContent)).toEqual(['Welcome to Biblia', 'Sign in']);
    expect(q('#account-welcome').textContent).toMatch(/records what you read with GoLearn on the same account/);
    expect(q('#account-welcome').textContent).toMatch(/reader only/);
    // labelled inputs: the caption sits in a label with the control (CSS shows it in tracked capitals)
    expect([...document.querySelectorAll('#account-form label.field > .cap')].map((c) => c.textContent)).toEqual(['Email', 'Password']);
    expect(q('#account-email').closest('label')!.textContent).toContain('Email');
    expect(q('#account-signin').classList.contains('primary')).toBe(true); // the gold button
    expect(q('#account-create').classList.contains('primary')).toBe(false);
    expect(q('#forgot').tagName).toBe('DETAILS');
    expect(q('#forgot').classList.contains('card')).toBe(true);
    expect(q('#email-links-note').textContent).toBe('Links in confirmation and password-reset emails open GoLearn setup.');
    expect(q('.legal-links').textContent).toBe('Terms · Privacy Policy (drafts)');
    // the order of the page: welcome, sign in, forgot, the note, the drafts
    expect([...document.querySelector('.screen')!.children].map((c) => c.id || c.className.split(' ')[0] || c.tagName.toLowerCase())).toEqual(['h1', 'account-welcome', 'account-form', 'forgot', 'email-links-note', 'muted']);
  });

  it('signed in, the same page is titled Account and carries who and Sign out in a card', async () => {
    await account.signIn('ana@example.org', PASSWORD);
    mount();
    expect(q('.screen > h1').textContent).toBe('Account');
    expect(q('#account-signed-in > h2').textContent).toBe('Signed in');
    expect(q('#account-signed-in #account-signout').textContent).toBe('Sign out');
  });

  it('Sign in: checks the fields first, then signs in, empties the password field and moves on', async () => {
    mount();
    q<HTMLFormElement>('#account-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(q('.status').textContent).toBe('Enter a valid email address.');
    expect(svc.calls).toHaveLength(0);
    fill('ana@example.org', PASSWORD);
    q<HTMLFormElement>('#account-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(q('.status').textContent).toBe('Signed in as ana@example.org.');
    expect(q<HTMLInputElement>('#account-password').value).toBe('');
    expect(done).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain(PASSWORD);
    expect(account.state().signedIn).toBe(true);
  });

  it('Sign in with a wrong password shows the service message and keeps the learner here', async () => {
    mount();
    fill('ana@example.org', 'not the password');
    q<HTMLFormElement>('#account-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(q('.status').textContent).toBe('The email or the password is not right.');
    expect(q('.status').className).toContain('error');
    expect(q<HTMLInputElement>('#account-password').value).toBe('');
    expect(done).not.toHaveBeenCalled();
  });

  it('an unconfirmed address offers to send the confirmation email again', async () => {
    svc.unverified = true;
    mount();
    fill('ana@example.org', PASSWORD);
    q<HTMLFormElement>('#account-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(q('.status').textContent).toBe('Confirm your email address first.');
    q<HTMLButtonElement>('#account-resend').click();
    await flush();
    expect(svc.count('POST', '/accounts/verify/resend')).toBe(1);
    expect(document.body.textContent).toContain('a new email is on its way');
  });

  it('Create account: a short password is refused before anything is sent; then it creates, signs in and says to check the email when the service says it sent one', async () => {
    mount();
    fill('new@example.org', 'short');
    q<HTMLButtonElement>('#account-create').click();
    await flush();
    expect(q('.status').textContent).toMatch(/at least 10 characters/);
    expect(svc.calls).toHaveLength(0);
    fill('new@example.org', PASSWORD);
    q<HTMLButtonElement>('#account-create').click();
    await flush();
    expect(q('.status').textContent).toBe('Account created and signed in as new@example.org. Check your email: a link to confirm new@example.org is on its way.');
    expect(account.state()).toEqual({ signedIn: true, email: 'new@example.org' });
    expect(done).not.toHaveBeenCalled(); // the learner reads the line first
    expect(q<HTMLAnchorElement>('#account-more a').getAttribute('href')).toBe('#/');
  });

  it('Create account does not claim an email was sent when the service says it was not', async () => {
    svc.verificationSent = false;
    mount();
    fill('new@example.org', PASSWORD);
    q<HTMLButtonElement>('#account-create').click();
    await flush();
    expect(q('.status').textContent).toMatch(/confirmation email could not be sent/);
    expect(q('.status').textContent).not.toMatch(/Check your email/);
  });

  it('Forgot password: email only, and the same answer whatever the address', async () => {
    mount();
    (q('#forgot') as HTMLDetailsElement).open = true;
    q<HTMLInputElement>('#forgot-email').value = 'nobody@example.org';
    q<HTMLButtonElement>('#forgot-submit').click();
    await flush();
    expect(svc.count('POST', '/accounts/password/forgot')).toBe(1);
    expect(document.querySelector('#forgot .status')!.textContent).toBe('If that address has an account, an email is on its way.');
    q<HTMLInputElement>('#forgot-email').value = 'not an email';
    q<HTMLButtonElement>('#forgot-submit').click();
    await flush();
    expect(document.querySelector('#forgot .status')!.textContent).toBe('Enter a valid email address.');
  });

  it('signed in: who, and Sign out', async () => {
    await account.signIn('ana@example.org', PASSWORD);
    mount();
    expect(q('#account-who').textContent).toMatch(/^Signed in as ana@example.org/);
    expect(document.querySelector('#account-form')).toBeNull();
    q<HTMLButtonElement>('#account-signout').click();
    await flush();
    expect(account.state().signedIn).toBe(false);
    expect(svc.count('DELETE', '/sessions/current')).toBe(1);
    expect(done).toHaveBeenCalledTimes(1);
    expect(storage.data.has(SESSION_KEY)).toBe(false);
  });

  it('an ended session is explained on the sign-in form', async () => {
    await account.signIn('ana@example.org', PASSWORD);
    account.expire();
    mount();
    expect(q('.status').textContent).toMatch(/Your sign-in has ended/);
  });
});

describe('the legal screens', () => {
  it('render the Privacy Policy and the Terms drafts of the repository, with a way back', () => {
    for (const which of ['privacy', 'terms'] as const) {
      const el = renderLegalScreen({ doc: document, which, topbar: document.createElement('div') });
      expect(el.querySelector('.legal-text')!.textContent!.length).toBeGreaterThan(500);
      expect(el.querySelector('a[href="#/account"]')).not.toBeNull();
    }
    const privacy = renderLegalScreen({ doc: document, which: 'privacy', topbar: document.createElement('div') }).textContent;
    const terms = renderLegalScreen({ doc: document, which: 'terms', topbar: document.createElement('div') }).textContent;
    expect(privacy).not.toBe(terms);
  });
});
