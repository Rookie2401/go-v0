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
  /**
   * The Repository address this copy uses and the way to change it on this device (GoReview's "Service address" field, 2026-10-25): for a
   * network that filters the usual name, or a service of one's own. `set(undefined)` returns to `standard`. The page reloads after a change,
   * since sessions and queues are kept per address. Absent inside the GoReview app, whose address is the app's.
   */
  serviceAddress?: { current: string; standard: string; set(url: string | undefined): void };
}

/** A Repository address as typed: https (http only for a local machine), no credentials, query or fragment; the trailing slash dropped. */
export function normalizeServiceAddress(raw: string): string | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  // another scheme (ftp://, file://) is not made https by prefixing it
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^https?:\/\//i.test(text)) return undefined;
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { return undefined; }
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname);
  if (!(u.protocol === 'https:' || (u.protocol === 'http:' && local)) || u.username || u.password || u.search || u.hash) return undefined;
  return u.origin + u.pathname.replace(/\/+$/, '');
}

type Child = Node | string | null | undefined | false;

/**
 * The account screen, in GoReview's design (packages/gopractice/screens/signin.ts): a title with its rule, a WELCOME card that says what the
 * account is for, the SIGN IN card with its EMAIL and PASSWORD labels and the gold Sign in button, the "Forgot password?" disclosure, the
 * note about email links and the line to the drafts. Signed in, the same page says who and offers Sign out.
 */
export function renderAccountScreen(d: AccountScreenDeps): HTMLElement {
  const { doc, account } = d;
  const h = (tag: string, attrs: Record<string, string | undefined> = {}, ...children: Child[]): HTMLElement => {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(k, v);
    for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(typeof c === 'string' ? doc.createTextNode(c) : c);
    return el;
  };
  const status = (cls = ''): HTMLElement => h('p', { class: `status${cls ? ` ${cls}` : ''}`, role: 'status', 'aria-live': 'polite' });
  const say = (el: HTMLElement, text: string, kind: 'ok' | 'error' | 'info'): void => { el.textContent = text; el.className = `status ${kind}`; el.setAttribute('data-kind', kind); };
  const field = (caption: string, control: HTMLElement): HTMLElement => h('label', { class: 'field' }, h('span', { class: 'cap' }, caption), control);
  const legal = h('p', { class: 'muted legal-links' }, h('a', { href: '#/terms' }, 'Terms'), ' · ', h('a', { href: '#/privacy' }, 'Privacy Policy'), ' (drafts)');
  const box = h('div', { class: 'account' }, d.topbar);
  const screen = h('div', { class: 'screen' });
  box.append(screen);

  const st = account.state();
  if (st.signedIn) {
    screen.append(
      h('h1', {}, 'Account'),
      h('section', { class: 'card', id: 'account-signed-in', 'aria-labelledby': 'account-signed-in-h' },
        h('h2', { id: 'account-signed-in-h' }, 'Signed in'),
        h('p', { id: 'account-who' }, `Signed in as ${st.email ?? 'your account'}. What you look up and mark in Biblia is recorded in your GoLearn account, and the words you have met anywhere are shown on the page.`),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', id: 'account-signout' }, 'Sign out')),
        d.serviceAddress ? h('p', { class: 'muted', id: 'account-service' }, `Service: ${d.serviceAddress.current}${d.serviceAddress.current === d.serviceAddress.standard ? '' : ' (not the usual address; sign out to change it)'}`) : null),
      legal);
    (box.querySelector('#account-signout') as HTMLButtonElement).addEventListener('click', () => { void account.signOut().then(() => d.done()); });
    return box;
  }

  const email = h('input', { type: 'email', id: 'account-email', name: 'email', autocomplete: 'email', required: '', spellcheck: 'false' }) as HTMLInputElement;
  const password = h('input', { type: 'password', id: 'account-password', name: 'password', autocomplete: 'current-password', required: '' }) as HTMLInputElement;
  const out = status();
  const signInBtn = h('button', { type: 'submit', id: 'account-signin', class: 'btn primary' }, 'Sign in') as HTMLButtonElement;
  const createBtn = h('button', { type: 'button', id: 'account-create', class: 'btn' }, 'Create account') as HTMLButtonElement;
  const more = h('div', { id: 'account-more' });
  const form = h('form', { id: 'account-form', class: 'card', novalidate: '' },
    h('h2', {}, 'Sign in'),
    field('Email', email),
    field('Password', password),
    h('p', { class: 'hint muted' }, `A new password needs at least ${MIN_PASSWORD} characters. It is sent to the service and nowhere else; it is never kept here.`),
    h('div', { class: 'row' }, signInBtn, createBtn),
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
    const btn = h('button', { type: 'button', id: 'account-resend', class: 'btn' }, 'Send the confirmation email again') as HTMLButtonElement;
    btn.addEventListener('click', () => {
      void (async () => {
        say(again, 'Sending…', 'info');
        const r = await account.resendVerification(addr);
        say(again, r.ok ? `If ${addr} still needs confirming, a new email is on its way.` : r.message, r.ok ? 'ok' : 'error');
      })();
    });
    more.replaceChildren(h('div', { class: 'row' }, btn), again);
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
        more.replaceChildren(h('p', {}, h('a', { class: 'btn primary', href: '#/' }, 'Continue to the library')));
      } finally { password.value = ''; busy(false); }
    })();
  });

  const fEmail = h('input', { type: 'email', id: 'forgot-email', name: 'forgot-email', autocomplete: 'email', spellcheck: 'false' }) as HTMLInputElement;
  const fOut = status();
  const fBtn = h('button', { type: 'button', id: 'forgot-submit', class: 'btn' }, 'Email me a reset link') as HTMLButtonElement;
  const forgot = h('details', { id: 'forgot', class: 'card forgot' },
    h('summary', {}, 'Forgot password?'),
    h('p', { class: 'hint muted' }, 'Enter the email address of your account and the service will send a link to choose a new password.'),
    field('Email', fEmail), h('div', { class: 'row' }, fBtn), fOut);
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

  // the Service address, as in GoReview's sign-in (2026-10-25): where this copy sends its sign-in and its activity; changed only when a
  // network filters the usual name or a service of one's own is meant. Saved on this device; the page reloads with the new address.
  let service: HTMLElement | null = null;
  if (d.serviceAddress) {
    const sa = d.serviceAddress;
    const sUrl = h('input', { type: 'url', id: 'service-url', name: 'service-url', inputmode: 'url', autocomplete: 'off', spellcheck: 'false', placeholder: sa.standard, value: sa.current }) as HTMLInputElement;
    const sOut = status();
    const sSave = h('button', { type: 'button', id: 'service-save', class: 'btn' }, 'Use this address') as HTMLButtonElement;
    const sReset = h('button', { type: 'button', id: 'service-reset', class: 'btn' }, 'Back to the usual address') as HTMLButtonElement;
    sReset.hidden = sa.current === sa.standard;
    service = h('details', { id: 'service-address', class: 'card forgot' },
      h('summary', {}, 'Service address (only if you were told to change it)'),
      h('p', { class: 'hint muted' }, `Where Biblia signs in and sends what you read. The usual address is ${sa.standard}. Change it only when your network cannot reach that name (another name for the same service) or when you run a service of your own. Your sign-in belongs to the address it was made at.`),
      field('Address', sUrl), h('div', { class: 'row' }, sSave, sReset), sOut);
    sSave.addEventListener('click', () => {
      const next = normalizeServiceAddress(sUrl.value);
      if (!next) { say(sOut, 'Enter an https address such as https://example.org (http only for a local machine), without a query or a fragment.', 'error'); return; }
      if (next === sa.current) { say(sOut, 'That is the address in use.', 'info'); return; }
      say(sOut, `Using ${next}. Reloading…`, 'ok');
      sa.set(next === sa.standard ? undefined : next);
    });
    sReset.addEventListener('click', () => { say(sOut, `Back to ${sa.standard}. Reloading…`, 'ok'); sa.set(undefined); });
  }

  screen.append(
    h('h1', {}, 'Sign in'),
    h('section', { class: 'card', id: 'account-welcome', 'aria-labelledby': 'account-welcome-h' },
      h('h2', { id: 'account-welcome-h' }, 'Welcome to Biblia'),
      h('p', {}, 'Biblia records what you read with GoLearn on the same account. Sign in with the account you use in GoLearn: what you look up and mark here is kept in it, GoReview and the GoLearn extension see it too, and the words you have met anywhere are marked on the page by how well you know them.'),
      h('p', { class: 'muted' }, 'Without an account Biblia is a reader only: every word can be looked up, but nothing is recorded and nothing is marked.')),
    form, forgot, ...(service ? [service] : []),
    h('p', { class: 'muted', id: 'email-links-note' }, 'Links in confirmation and password-reset emails open GoLearn setup.'),
    legal);
  return box;
}

/** #/privacy and #/terms: the legal drafts of the repository (docs/legal), rendered safely. */
export function renderLegalScreen(d: { doc: Document; topbar: HTMLElement; which: 'privacy' | 'terms' }): HTMLElement {
  const el = (tag: string, cls?: string): HTMLElement => { const e = d.doc.createElement(tag); if (cls) e.className = cls; return e; };
  const wrap = el('div', 'legal');
  const screen = el('div', 'screen');
  const title = el('h1');
  title.textContent = d.which === 'privacy' ? 'Privacy Policy' : 'Terms of use';
  const body = el('section', 'card legal');
  body.setAttribute('aria-label', d.which === 'privacy' ? 'Privacy Policy (draft)' : 'Terms of Use (draft)');
  body.append(renderMarkdown(d.which === 'privacy' ? PRIVACY_POLICY_MD : TERMS_MD_TEXT, 2));
  const back = el('p', 'muted');
  const a = d.doc.createElement('a');
  a.href = '#/account'; a.textContent = 'Back to the account';
  back.append(a);
  screen.append(title, body, back);
  wrap.append(d.topbar, screen);
  return wrap;
}
