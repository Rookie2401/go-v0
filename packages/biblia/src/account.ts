/**
 * The standalone Biblia's account: the sign-in state (`createAccountService`) and the screen where the learner signs in, creates an account or
 * asks for a password reset (`renderAccountScreen`), at #/account. Email and password go to the Repository service named in config.json and
 * nowhere else; the password is read from its field, passed to the request and the field is emptied: it is never stored, logged or shown again.
 * What the page keeps is the session the service gave (session.ts).
 */
import { createRepositoryApi, type RepositoryApi } from '../../repository-service/src/api';
import { createAccountClient, explainAccountFailure, type AccountClient } from '../../gopractice/accountClient';
import { explainFailure, type Refused } from '../../gopractice/config';
import { PRIVACY_POLICY_MD, TERMS_MD_TEXT, renderMarkdown } from '../../gopractice/legal';
import type { GoEvent } from '../../repository-contract/src';
import { clearSession, deviceIdFor, loadSession, saveSession, type BibliaSession } from './session';

export const MIN_PASSWORD = 10;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AccountOutcome = { ok: true; verificationSent?: boolean } | { ok: false; message: string; code?: string };

export interface AccountState {
  signedIn: boolean;
  email?: string;
  /** The session ended (the service said 401, or it ran out) since the learner last signed in. */
  expired?: boolean;
  /** The service could not be reached the last time the session was checked. */
  offline?: boolean;
}

export interface AccountService {
  readonly serviceUrl: string;
  state(): AccountState;
  session(): BibliaSession | undefined;
  /** The signed-in api (carries the token), or undefined when signed out. */
  api(): RepositoryApi | undefined;
  /** Confirms a kept session with the service (`GET /me`): 401 ends it; an unreachable service leaves it (offline). */
  start(): Promise<void>;
  signIn(email: string, password: string): Promise<AccountOutcome>;
  /** Creates the account, then signs in. `verificationSent` is the service's own word on the confirmation email, when it says. */
  signUp(email: string, password: string): Promise<AccountOutcome>;
  /** Asks for a reset link. Whether the address has an account is never revealed. */
  forgot(email: string): Promise<AccountOutcome>;
  resendVerification(email: string): Promise<AccountOutcome>;
  /** Ends the session at the service (best effort) and here. What waits in the offline queue stays. */
  signOut(): Promise<void>;
  /** The service refused the token somewhere else (401): forget the session, keep the queue. */
  expire(): void;
  subscribe(fn: () => void): () => void;
  /** Events the service acknowledged (the recorder calls `emitAppended`); the levels listen. */
  onAppended(fn: (events: GoEvent[]) => void): () => void;
  emitAppended(events: GoEvent[]): void;
}

export interface AccountServiceOptions {
  serviceUrl: string;
  storage?: Storage;
  fetch: typeof fetch;
  now?: () => Date;
}

const UNREACHABLE = 'The service could not be reached. Check your connection and try again.';

/** The service's own words for a sign-in or sign-up failure; a plain sentence when it sent none. */
function signInMessage(r: Refused): string {
  if (r.status === 429 || (r.status === 403 && r.error === 'email-unverified')) return explainFailure(r, 'signin');
  return r.message || explainFailure(r, 'signin');
}

export function createAccountService(o: AccountServiceOptions): AccountService {
  const serviceUrl = o.serviceUrl.replace(/\/+$/, '');
  const now = o.now ?? (() => new Date());
  const apiFor = (token?: string): RepositoryApi => createRepositoryApi({ baseUrl: serviceUrl, fetch: o.fetch, ...(token ? { token } : {}) });
  const client = (): AccountClient => createAccountClient({ baseUrl: serviceUrl, fetch: o.fetch });

  let session = loadSession(o.storage, serviceUrl, now().getTime());
  let api: RepositoryApi | undefined = session ? apiFor(session.token) : undefined;
  let expired = false;
  let offline = false;
  const listeners = new Set<() => void>();
  const appendListeners = new Set<(events: GoEvent[]) => void>();
  const notify = (): void => { for (const fn of [...listeners]) { try { fn(); } catch { /* a view's error never breaks the account */ } } };

  function begin(s: BibliaSession, a: RepositoryApi): void {
    session = s; api = a; expired = false; offline = false;
    saveSession(o.storage, s);
  }
  function end(): void {
    session = undefined; api = undefined; offline = false;
    clearSession(o.storage);
  }

  async function signIn(email: string, password: string): Promise<AccountOutcome> {
    const a = apiFor();
    const deviceId = session?.deviceId ?? deviceIdFor(o.storage);
    try {
      const r = await a.createSession({ email: email.trim(), password, deviceId, platform: 'web' });
      if (!r.ok) return { ok: false, message: signInMessage(r), code: r.error };
      begin({ serviceUrl, token: r.data.token, learnerId: r.data.learnerId, email: email.trim(), deviceId, ...(r.data.expiresAt ? { expiresAt: r.data.expiresAt } : {}) }, a);
      notify();
      return { ok: true };
    } catch { return { ok: false, message: UNREACHABLE, code: 'unreachable' }; }
  }

  return {
    serviceUrl,
    state: () => ({ signedIn: !!session, ...(session ? { email: session.email } : {}), ...(expired ? { expired: true } : {}), ...(offline ? { offline: true } : {}) }),
    session: () => session,
    api: () => api,
    async start() {
      if (!session || !api) return;
      try {
        const r = await api.me();
        if (r.ok) {
          offline = false;
          const email = r.data?.account?.email;
          if (email && email !== session.email) { session = { ...session, email }; saveSession(o.storage, session); }
        } else if (r.status === 401) { expired = true; end(); }
        else offline = true;
      } catch { offline = true; }
      notify();
    },
    signIn,
    async signUp(email, password) {
      try {
        const made = await apiFor().createAccount({ email: email.trim(), password });
        if (!made.ok) return { ok: false, message: signInMessage(made), code: made.error };
        const said = (made.data as { verificationSent?: unknown } | null)?.verificationSent;
        const entered = await signIn(email, password);
        if (!entered.ok) return { ok: false, message: `Your account was made, but signing in did not work: ${entered.message}`, ...(entered.code ? { code: entered.code } : {}) };
        return { ok: true, ...(typeof said === 'boolean' ? { verificationSent: said } : {}) };
      } catch { return { ok: false, message: UNREACHABLE, code: 'unreachable' }; }
    },
    async forgot(email) {
      const r = await client().forgotPassword(email.trim());
      // the same answer whether or not the address has an account; only "could not ask" is reported
      if (r.ok || (r.status >= 400 && r.status < 500 && r.status !== 429)) return { ok: true };
      return { ok: false, message: explainAccountFailure(r) };
    },
    async resendVerification(email) {
      const r = await client().resendVerification(email.trim());
      if (r.ok || (r.status >= 400 && r.status < 500 && r.status !== 429)) return { ok: true };
      return { ok: false, message: explainAccountFailure(r) };
    },
    async signOut() {
      const a = api;
      end();
      expired = false;
      notify();
      if (a) { try { await a.deleteSession(); } catch { /* the token lapses on its own; this browser has already forgotten it */ } }
    },
    expire() {
      if (!session) return;
      expired = true;
      end();
      notify();
    },
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    onAppended(fn) { appendListeners.add(fn); return () => { appendListeners.delete(fn); }; },
    emitAppended(events) { for (const fn of [...appendListeners]) { try { fn(events); } catch { /* ignore */ } } },
  };
}

// ───────────────────────────── the screen ─────────────────────────────

export interface AccountScreenDeps {
  doc: Document;
  account: AccountService;
  /** The top bar the other views carry. */
  topbar: HTMLElement;
  /** Where to go once the learner is signed in. */
  done(): void;
}

type Child = Node | string | null | undefined | false;

export function renderAccountScreen(d: AccountScreenDeps): HTMLElement {
  const { doc, account } = d;
  const h = (tag: string, attrs: Record<string, string | undefined> = {}, ...children: Child[]): HTMLElement => {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(k, v);
    for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(typeof c === 'string' ? doc.createTextNode(c) : c);
    return el;
  };
  const status = (cls = ''): HTMLElement => h('p', { class: `status${cls ? ` ${cls}` : ''}`, role: 'status' });
  const say = (el: HTMLElement, text: string, kind: 'ok' | 'error' | 'info'): void => { el.textContent = text; el.className = `status ${kind}`; };
  const legal = h('p', { class: 'legal-links' }, h('a', { href: '#/privacy' }, 'Privacy Policy'), ' · ', h('a', { href: '#/terms' }, 'Terms'));
  const box = h('div', { class: 'account' }, d.topbar);

  const st = account.state();
  if (st.signedIn) {
    box.append(
      h('p', { id: 'account-who' }, `Signed in as ${st.email ?? 'your account'}. What you look up and mark in Biblia is recorded in your GoLearn account, and the words you have met anywhere are shown on the page.`),
      h('p', {}, h('button', { type: 'button', id: 'account-signout' }, 'Sign out')),
      legal);
    (box.querySelector('#account-signout') as HTMLButtonElement).addEventListener('click', () => { void account.signOut().then(() => d.done()); });
    return box;
  }

  const email = h('input', { type: 'email', id: 'account-email', name: 'email', autocomplete: 'email', required: '', spellcheck: 'false' }) as HTMLInputElement;
  const password = h('input', { type: 'password', id: 'account-password', name: 'password', autocomplete: 'current-password', required: '' }) as HTMLInputElement;
  const out = status();
  const signInBtn = h('button', { type: 'submit', id: 'account-signin' }, 'Sign in') as HTMLButtonElement;
  const createBtn = h('button', { type: 'button', id: 'account-create' }, 'Create account') as HTMLButtonElement;
  const more = h('div', { id: 'account-more' });
  const form = h('form', { id: 'account-form', novalidate: '' },
    h('p', {}, 'Use your GoLearn account to record what you read here and to see, on the page, how well you know each word. Without one, Biblia is a reader only.'),
    h('label', {}, 'Email', email),
    h('label', {}, 'Password', password),
    h('p', { class: 'hint' }, `A new password needs at least ${MIN_PASSWORD} characters. It is sent to the service and nowhere else; it is never kept here.`),
    h('p', { class: 'row' }, signInBtn, ' ', createBtn),
    out, more);
  if (st.expired) say(out, 'Your sign-in has ended. Sign in again; anything you did meanwhile is kept on this device and sent after.', 'error');

  const busy = (on: boolean): void => { signInBtn.disabled = on; createBtn.disabled = on; };
  const read = (needsLength: boolean): { addr: string; secret: string } | undefined => {
    const addr = email.value.trim();
    const secret = password.value;
    if (!EMAIL.test(addr)) { say(out, 'Enter a valid email address.', 'error'); return undefined; }
    if (!secret) { say(out, 'Enter your password.', 'error'); return undefined; }
    if (needsLength && secret.length < MIN_PASSWORD) { say(out, `Choose a password of at least ${MIN_PASSWORD} characters.`, 'error'); return undefined; }
    return { addr, secret };
  };
  const unverified = (addr: string): void => {
    const again = status();
    const btn = h('button', { type: 'button', id: 'account-resend' }, 'Send the confirmation email again') as HTMLButtonElement;
    btn.addEventListener('click', () => {
      void (async () => {
        say(again, 'Sending…', 'info');
        const r = await account.resendVerification(addr);
        say(again, r.ok ? `If ${addr} still needs confirming, a new email is on its way.` : r.message, r.ok ? 'ok' : 'error');
      })();
    });
    more.replaceChildren(h('p', {}, btn), again);
  };

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    void (async () => {
      const v = read(false);
      if (!v) return;
      busy(true); more.replaceChildren(); say(out, 'Signing in…', 'info');
      try {
        const r = await account.signIn(v.addr, v.secret);
        if (!r.ok) { say(out, r.message, 'error'); if (r.code === 'email-unverified') unverified(v.addr); return; }
        say(out, `Signed in as ${v.addr}.`, 'ok');
        d.done();
      } finally { password.value = ''; busy(false); }
    })();
  });
  createBtn.addEventListener('click', () => {
    void (async () => {
      const v = read(true);
      if (!v) return;
      busy(true); more.replaceChildren(); say(out, 'Creating the account…', 'info');
      try {
        const r = await account.signUp(v.addr, v.secret);
        if (!r.ok) { say(out, r.message, 'error'); return; }
        const sent = r.verificationSent === true ? ` Check your email: a link to confirm ${v.addr} is on its way.` : r.verificationSent === false ? ' The confirmation email could not be sent; ask for it again when you sign in.' : '';
        say(out, `Account created and signed in as ${v.addr}.${sent}`, 'ok');
        // the learner reads the "check your email" line before leaving this screen: no automatic redirect after a sign-up
        more.replaceChildren(h('p', {}, h('a', { href: '#/' }, 'Continue to the library')));
      } finally { password.value = ''; busy(false); }
    })();
  });

  const fEmail = h('input', { type: 'email', id: 'forgot-email', name: 'forgot-email', autocomplete: 'email', spellcheck: 'false' }) as HTMLInputElement;
  const fOut = status();
  const fBtn = h('button', { type: 'button', id: 'forgot-submit' }, 'Email me a reset link') as HTMLButtonElement;
  const forgot = h('details', { id: 'forgot', class: 'forgot' },
    h('summary', {}, 'Forgot password?'),
    h('p', { class: 'hint' }, 'Enter the email address of your account and the service will send a link to choose a new password.'),
    h('label', {}, 'Email', fEmail), h('p', {}, fBtn), fOut);
  forgot.addEventListener('toggle', () => { if ((forgot as HTMLDetailsElement).open && !fEmail.value) fEmail.value = email.value.trim(); });
  fBtn.addEventListener('click', () => {
    void (async () => {
      const addr = fEmail.value.trim();
      if (!EMAIL.test(addr)) { say(fOut, 'Enter a valid email address.', 'error'); return; }
      say(fOut, 'Sending…', 'info');
      const r = await account.forgot(addr);
      say(fOut, r.ok ? 'If that address has an account, an email is on its way.' : r.message, r.ok ? 'ok' : 'error');
    })();
  });

  box.append(form, forgot, legal);
  return box;
}

/** #/privacy and #/terms: the legal drafts of the repository (docs/legal), rendered safely. */
export function renderLegalScreen(d: { doc: Document; topbar: HTMLElement; which: 'privacy' | 'terms' }): HTMLElement {
  const wrap = d.doc.createElement('div');
  wrap.className = 'legal';
  const back = d.doc.createElement('p');
  const a = d.doc.createElement('a');
  a.href = '#/account'; a.textContent = 'Back to the account';
  back.append(a);
  wrap.append(d.topbar, renderMarkdown(d.which === 'privacy' ? PRIVACY_POLICY_MD : TERMS_MD_TEXT, 2), back);
  return wrap;
}
