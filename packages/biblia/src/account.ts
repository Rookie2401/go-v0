/**
 * The standalone Biblia's account: the sign-in state (`createAccountService`) and the screen where the learner signs in, creates an account or
 * asks for a password reset (`renderAccountScreen`), at #/account. Email and password go to the Repository service named in config.json and
 * nowhere else; the password is read from its field, passed to the request and the field is emptied: it is never stored, logged or shown again.
 * What the page keeps is the session the service gave (session.ts).
 */
import { createRepositoryApi, type RepositoryApi } from '../../repository-service/src/api';
import { createAccountClient, explainAccountFailure, type AccountClient, type AccountState as RepositoryAccountState } from '../../goreview/app/accountClient';
import { explainFailure, type Refused } from '../../goreview/app/config';
import { PRIVACY_POLICY_MD, TERMS_MD_TEXT, renderMarkdown } from '../../goreview/app/legal';
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
  /** Account profile, data, and sessions for the current sign-in. */
  profileClient(): AccountClient | undefined;
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
    profileClient: () => session ? createAccountClient({ baseUrl: serviceUrl, fetch: o.fetch, token: session.token }) : undefined,
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
  syncStatus?: HTMLElement;
  /** Where to go once the learner is signed in. */
  done(): void;
}

type Child = Node | string | null | undefined | false;

/**
 * The account screen, in GoReview's design (packages/goreview/app/screens/signin.ts): a title with its rule, a WELCOME card that says what the
 * account is for, the SIGN IN card with its EMAIL and PASSWORD labels and the gold Sign in button, the "Forgot password?" disclosure, the
 * note about email links and the line to the drafts. Signed in, the page shows the profile and account controls.
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
    box.classList.add('account--signed-in');
    const client = account.profileClient();
    const token = account.session()?.token;
    const active = (): boolean => box.isConnected && account.session()?.token === token;
    const icon = (path: string): SVGSVGElement => {
      const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      const line = doc.createElementNS(svg.namespaceURI, 'path');
      line.setAttribute('d', path);
      svg.append(line);
      return svg;
    };
    const arrow = 'M4 12h15m-6-6 6 6-6 6';
    const btn = (id: string, title: string): HTMLButtonElement => h('button', { id, type: 'button', class: 'btn' }, title) as HTMLButtonElement;
    const tile = (id: string, title: string, subtitle: string, path: string, danger = false): HTMLButtonElement => h('button', {
      id, type: 'button', class: `account-tile${danger ? ' account-tile--danger' : ''}`, 'aria-labelledby': `${id}-label`, 'aria-describedby': `${id}-hint`,
    }, h('span', { class: 'account-symbol' }, icon(path)),
    h('span', { class: 'account-tile__copy' }, h('span', { id: `${id}-label`, class: 'account-tile__title' }, title), h('span', { id: `${id}-hint` }, subtitle)),
    h('span', { class: 'account-tile__arrow' }, icon(arrow))) as HTMLButtonElement;
    const out = status('account-feedback');
    const name = h('span', { id: 'account-name' }, 'Loading…');
    const edit = btn('account-name-edit', 'Add a name');
    edit.hidden = true;
    const emailText = h('bdi', { id: 'account-who' }, st.email ?? 'Unavailable');
    const nameInput = h('input', { id: 'account-name-input', type: 'text', autocomplete: 'name', maxlength: '100', required: '' }) as HTMLInputElement;
    const save = h('button', { type: 'submit', class: 'btn primary' }, 'Save') as HTMLButtonElement;
    const cancel = btn('account-name-cancel', 'Cancel');
    const editor = h('form', { class: 'account-editor', hidden: '' },
      field('Display name', nameInput), h('div', { class: 'row' }, save, cancel));
    const signOut = tile('account-signout', 'Sign out', 'End this session on this device.', 'M9 5h9v14H9m-1-7H3m1-4 4 4-4 4');
    const download = tile('account-export', 'Download my data', 'Export your learning data.', 'M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4');
    const remove = tile('account-delete', 'Delete account', 'Schedule deletion of your account and data.', 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7', true);
    const pending = h('p', { class: 'account-pending', role: 'status', hidden: '' });
    const keep = btn('account-cancel-deletion', 'Cancel the deletion');
    keep.hidden = true;
    const password = h('input', { id: 'account-delete-password', type: 'password', autocomplete: 'current-password', required: '' }) as HTMLInputElement;
    const confirm = h('button', { type: 'submit', class: 'btn account-danger' }, 'Schedule deletion') as HTMLButtonElement;
    const close = btn('account-close-deletion', 'Keep my account');
    const deletionOut = status('account-feedback');
    const deletion = h('form', { id: 'account-deletion', class: 'card account-editor', hidden: '' },
      h('h2', {}, 'Delete your account'),
      h('p', {}, 'This schedules deletion of your shared GoLearn account and its learning data. You can cancel from this screen until the scheduled date.'),
      field('Confirm with your password', password), h('div', { class: 'row' }, confirm, close), deletionOut);
    const list = h('ul', { class: 'account-devices__list', hidden: '' });
    const deviceStatus = status('account-feedback');
    const devices = h('details', { class: 'account-devices' },
      h('summary', {}, 'Devices signed in'), deviceStatus, list) as HTMLDetailsElement;
    const day = (date: string): string => new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    let profile: RepositoryAccountState = {};
    function paintDeletion(scheduled: boolean): void {
      remove.hidden = scheduled;
      pending.hidden = keep.hidden = !scheduled;
      pending.textContent = !scheduled ? '' : profile.scheduledPurgeAt
        ? `Your account is scheduled for deletion on ${day(profile.scheduledPurgeAt)}.`
        : 'Your account is scheduled for deletion.';
    }
    function paintName(): void {
      name.textContent = profile.name || 'No name yet';
      edit.textContent = profile.name ? 'Edit' : 'Add a name';
      edit.hidden = false;
    }
    function closeEditor(): void { editor.hidden = true; edit.hidden = false; edit.focus(); }
    edit.addEventListener('click', () => { edit.hidden = true; editor.hidden = false; nameInput.value = profile.name ?? ''; nameInput.focus(); });
    cancel.addEventListener('click', closeEditor);
    signOut.addEventListener('click', () => { signOut.disabled = true; void account.signOut().then(() => d.done()); });
    const resend = btn('account-resend-verification', 'Resend confirmation email');
    const verification = h('div', { class: 'account-verification', hidden: '' }, h('p', {}, 'Confirm your email address.'), resend);
    resend.addEventListener('click', async () => {
      resend.disabled = true;
      const r = await account.resendVerification(profile.email ?? st.email ?? '');
      resend.disabled = false;
      say(out, r.ok ? 'If confirmation is still needed, a new email is on its way.' : r.message, r.ok ? 'ok' : 'error');
    });
    screen.append(
      h('h1', {}, 'Account'),
      h('section', { class: 'account-identity', id: 'account-signed-in', 'aria-label': 'Account profile' },
        h('dl', {},
          h('div', { class: 'account-identity__row' },
            h('dt', {}, h('span', { class: 'account-symbol' }, icon('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 7 0 0 1 16 0')), 'Name'),
            h('dd', {}, name, edit, editor)),
          h('div', { class: 'account-identity__row' },
            h('dt', {}, h('span', { class: 'account-symbol' }, icon('M3 5h18v14H3ZM3 6l9 7 9-7')), 'Email'),
            h('dd', {}, emailText))),
        verification),
      h('div', { class: 'account-actions' }, pending, keep, signOut, download, remove, deletion),
      out, devices, ...(d.syncStatus ? [d.syncStatus] : []), legal);

    if (!client) {
      name.textContent = 'Unavailable';
      download.disabled = remove.disabled = true;
      return box;
    }
    // Check for a pending deletion before enabling the action.
    remove.disabled = true;
    void client.state().then((r) => {
      if (!active()) return;
      if (!r.ok) { name.textContent = 'Unavailable'; say(out, explainAccountFailure(r), 'error'); return; }
      profile = r.data;
      emailText.textContent = profile.email ?? emailText.textContent;
      verification.hidden = profile.verified !== false || !profile.email && !st.email;
      paintName();
      paintDeletion(!!profile.scheduledPurgeAt);
      remove.disabled = false;
    });
    editor.addEventListener('submit', async (event) => {
      event.preventDefault();
      const value = nameInput.value.trim();
      if (!value) { say(out, 'Enter a name.', 'error'); nameInput.focus(); return; }
      save.disabled = cancel.disabled = true;
      const r = await client.rename(value);
      save.disabled = cancel.disabled = false;
      if (!active()) return;
      if (!r.ok) { say(out, explainAccountFailure(r), 'error'); return; }
      profile.name = value;
      paintName();
      closeEditor();
      say(out, 'Name saved.', 'ok');
    });
    download.addEventListener('click', async () => {
      download.disabled = true;
      say(out, 'Preparing your download…', 'info');
      const r = await client.exportData();
      download.disabled = false;
      if (!active()) return;
      if (!r.ok) { say(out, explainAccountFailure(r), 'error'); return; }
      const filename = `biblia-data-${new Date().toISOString().slice(0, 10)}.json`;
      try {
        const url = URL.createObjectURL(new Blob([r.data], { type: 'application/json' }));
        const link = h('a', { href: url, download: filename });
        doc.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        say(out, 'Your data is ready to download.', 'ok');
      } catch { say(out, 'The file could not be saved on this device.', 'error'); }
    });
    remove.addEventListener('click', () => { remove.hidden = true; deletion.hidden = false; password.focus(); });
    close.addEventListener('click', () => {
      password.value = ''; deletionOut.textContent = ''; deletion.hidden = true; remove.hidden = false; remove.focus();
    });
    deletion.addEventListener('submit', async (event) => {
      event.preventDefault();
      const secret = password.value;
      password.value = '';
      if (!secret) { password.focus(); return; }
      confirm.disabled = close.disabled = true;
      say(deletionOut, 'Scheduling deletion…', 'info');
      const r = await client.deleteAccount(secret);
      confirm.disabled = close.disabled = false;
      if (!active()) return;
      if (!r.ok) {
        say(deletionOut, r.status === 403 || r.error === 'bad-credentials' ? 'The password was not accepted.' : explainAccountFailure(r), 'error');
        password.focus();
        return;
      }
      profile.scheduledPurgeAt = r.data?.scheduledPurgeAt;
      deletion.hidden = true;
      paintDeletion(true);
      keep.focus();
    });
    keep.addEventListener('click', async () => {
      keep.disabled = true;
      const r = await client.cancelDeletion();
      keep.disabled = false;
      if (!active()) return;
      if (!r.ok) { say(out, explainAccountFailure(r), 'error'); return; }
      profile.scheduledPurgeAt = undefined;
      paintDeletion(false);
      remove.focus();
      say(out, 'Account deletion cancelled.', 'ok');
    });
    let loadingDevices = false;
    devices.addEventListener('toggle', async () => {
      if (!devices.open || loadingDevices) return;
      loadingDevices = true;
      say(deviceStatus, 'Loading devices…', 'info');
      list.hidden = true;
      const r = await client.sessions();
      loadingDevices = false;
      if (!active()) return;
      if (!r.ok) { say(deviceStatus, explainAccountFailure(r), 'error'); return; }
      const sessions = Array.isArray(r.data?.sessions) ? r.data.sessions : [];
      list.replaceChildren(...sessions.map((s) => h('li', {},
        h('strong', {}, s.deviceLabel || 'Unnamed device'), s.current ? ' · This device' : '',
        h('span', {}, `Last used ${day(s.lastSeenAt)}`))));
      list.hidden = !sessions.length;
      deviceStatus.textContent = sessions.length ? '' : 'No signed-in devices are listed.';
    });
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
  if (st.expired && d.syncStatus) form.append(d.syncStatus);

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

  // no Service address field: the address is config.json's and nothing on the page changes it (2026-10-28; the field existed 2026-10-25 to 28)
  screen.append(
    h('h1', {}, 'Sign in'),
    h('section', { class: 'card', id: 'account-welcome', 'aria-labelledby': 'account-welcome-h' },
      h('h2', { id: 'account-welcome-h' }, 'Welcome to Biblia'),
      h('p', {}, 'Biblia records what you read with GoLearn on the same account. Sign in with the account you use in GoLearn: what you look up and mark here is kept in it, GoReview and the GoLearn extension see it too, and the words you have met anywhere are marked on the page by how well you know them.'),
      h('p', { class: 'muted' }, 'Without an account Biblia is a reader only: every word can be looked up, but nothing is recorded and nothing is marked.')),
    form, forgot,
    h('p', { class: 'muted', id: 'email-links-note' }, 'Links in confirmation and password-reset emails open GoLearn setup.'),
    legal);
  return box;
}

/** #/privacy and #/terms: the legal drafts of the repository (docs/legal), rendered safely. `from` is where the way back leads: About (under Settings) or the account. */
export function renderLegalScreen(d: { doc: Document; topbar: HTMLElement; which: 'privacy' | 'terms'; from?: 'about' | 'account' }): HTMLElement {
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
  a.href = d.from === 'about' ? '#/about' : '#/account';
  a.textContent = d.from === 'about' ? 'Back to About' : 'Back to the account';
  back.append(a);
  screen.append(title, body, back);
  wrap.append(d.topbar, screen);
  return wrap;
}
