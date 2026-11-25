/**
 * The standalone Biblia's account: the sign-in state (`createAccountService`) and the screen where the learner signs in, creates an account or
 * asks for a password reset, and, signed in, sees and manages the account (`renderAccountScreen`), at #/account, in GoReview's look. Email and password go to the Repository service named in config.json and
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
  /** Creates the account (with the name to show on it, when given), then signs in. `verificationSent` is the service's own word on the confirmation email, when it says. */
  signUp(email: string, password: string, displayName?: string): Promise<AccountOutcome>;
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
    async signUp(email, password, displayName) {
      try {
        const name = displayName?.trim();
        const made = await apiFor().createAccount({ email: email.trim(), password, ...(name ? { displayName: name } : {}) });
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

/** The days the service keeps a deleted account before erasing it. GoReview's accountSecurity.ts says the same (account.test.ts compares them). */
export const GRACE_DAYS = 14;

/**
 * The account screen, in GoReview's look (the owner, 2026-11-25; packages/goreview/app/screens/signin.ts and account.ts): the hero, a kicker
 * between gold rules over a large title, with no photograph (the owner's word), then a column of warm tiles with no outline.
 *   signed out   WELCOME / Biblia; the YOUR ACCOUNT / Sign in tile (Your name for a new account, Email and Password as single lines, the gold
 *                pill, "Create an account" as a link); the closed "Welcome to Biblia" tile; "Forgot password?"; the email-links note; the drafts
 *   signed in    YOUR ACCOUNT / the name; the facts tile (Name, editable in place; Email, with the confirmation note only while it is needed);
 *                THIS DEVICE (the sync notice, when there is one); a tile each for Sign out, Download my data and Delete account; the guided
 *                deletion (what happens over the days of grace, then the password); the closed "Devices signed in" tile
 * While a deletion is pending, its notice with Cancel is the first tile.
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
  const field = (caption: string, control: HTMLElement, help?: string): HTMLElement =>
    h('label', { class: 'field' }, h('span', { class: 'cap' }, caption), control, help ? h('span', { class: 'help' }, help) : null);
  const link = (id: string, title: string): HTMLButtonElement => h('button', { id, type: 'button', class: 'acct-link' }, title) as HTMLButtonElement;
  /** The hero: the kicker between its gold rules (drawn by the stylesheet), the title under it. */
  const hero = (kicker: string, title: string): { el: HTMLElement; title: HTMLElement } => {
    const t = h('h1', { class: 'acct-hero__title' }, title);
    return { el: h('header', { class: 'acct-hero' }, h('p', { class: 'acct-hero__kicker' }, h('span', {}, kicker)), t), title: t };
  };
  /** A closed tile that opens: its kicker with a gold caret, the words under it. */
  const fold = (cls: string, id: string | undefined, title: string, ...children: Child[]): HTMLDetailsElement =>
    h('details', { class: `acct-fold${cls ? ` ${cls}` : ''}`, id }, h('summary', {}, h('span', { class: 'acct-kicker' }, title)), h('div', { class: 'acct-fold__body' }, ...children)) as HTMLDetailsElement;
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
    /** One of the account's actions as a tile, like GoReview's: its icon, its title over an italic caption, the arrow. */
    const tile = (id: string, title: string, caption: string, path: string, danger = false): HTMLButtonElement => h('button', {
      id, type: 'button', class: `account-tile${danger ? ' account-tile--danger' : ''}`, 'aria-labelledby': `${id}-label`, 'aria-describedby': `${id}-hint`,
    }, h('span', { class: 'account-tile__icon' }, icon(path)),
    h('span', { class: 'account-tile__copy' }, h('span', { id: `${id}-label`, class: 'account-tile__title' }, title), h('span', { id: `${id}-hint`, class: 'account-tile__caption' }, caption)),
    h('span', { class: 'account-tile__arrow' }, icon(arrow))) as HTMLButtonElement;
    const head = hero('Your account', 'Account');
    const out = status('account-feedback');
    const name = h('span', { id: 'account-name' }, 'Loading…');
    const edit = link('account-name-edit', 'Add a name');
    edit.hidden = true;
    const emailText = h('bdi', { id: 'account-who' }, st.email ?? 'Unavailable');
    const nameInput = h('input', { id: 'account-name-input', type: 'text', autocomplete: 'name', maxlength: '100', required: '' }) as HTMLInputElement;
    const save = h('button', { type: 'submit', class: 'acct-pill acct-pill--small' }, 'Save') as HTMLButtonElement;
    const cancel = link('account-name-cancel', 'Cancel');
    const editor = h('form', { class: 'account-editor', hidden: '' },
      field('Display name', nameInput), h('div', { class: 'acct-actions' }, save, cancel));
    const signOut = tile('account-signout', 'Sign out', 'Your reading stays on your account', 'M9 5h9v14H9m-1-7H3m1-4 4 4-4 4');
    const download = tile('account-export', 'Download my data', 'Everything held about you, as one file', 'M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4');
    const remove = tile('account-delete', 'Delete account', `Erased after ${GRACE_DAYS} days; you can cancel until then`, 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7', true);
    // the notice of a pending deletion, the first tile while there is one
    const pending = h('p', { class: 'account-pending', role: 'status' });
    const keep = link('account-cancel-deletion', 'Cancel the deletion');
    const banner = h('section', { class: 'acct-tile account-banner', id: 'account-deletion-notice', 'aria-label': 'Deletion scheduled', hidden: '' },
      h('p', { class: 'acct-kicker' }, 'Deletion scheduled'), pending, keep);
    // the guided deletion (GoReview's three steps), shown only once asked for
    const password = h('input', { id: 'account-delete-password', type: 'password', autocomplete: 'current-password', required: '' }) as HTMLInputElement;
    const confirm = h('button', { type: 'submit', class: 'acct-pill acct-pill--danger' }, 'Delete my account') as HTMLButtonElement;
    const close = link('account-close-deletion', 'Keep my account');
    const deletionOut = status('account-feedback');
    const deletion = h('form', { id: 'account-deletion', class: 'acct-tile account-editor', hidden: '' },
      h('h2', { class: 'acct-kicker' }, 'Delete your account'),
      h('ol', { class: 'acct-steps' },
        h('li', {}, h('strong', {}, 'Nothing happens today. '), `After you confirm, your account is scheduled for deletion ${GRACE_DAYS} days from now, and everything stays as it is until then.`),
        h('li', {}, h('strong', {}, `To get it back within the ${GRACE_DAYS} days: `), 'sign in as usual and press ', h('em', {}, 'Cancel the deletion'), ' on the notice at the top of this page. Your account then stays exactly as it was.'),
        h('li', {}, h('strong', {}, `After the ${GRACE_DAYS} days: `), 'the account and everything the service holds about you are erased and cannot be recovered. Download your data first if you want a copy. It is the account you also use in GoLearn and GoReview. Your place and your settings, kept on this device, are not touched.')),
      field('Your password', password, 'Needed to confirm. It is sent to the service and never stored here.'),
      h('div', { class: 'acct-actions' }, confirm, close), deletionOut);
    const list = h('ul', { class: 'account-devices__list', hidden: '' });
    const deviceStatus = status('account-feedback');
    const devices = fold('account-devices', undefined, 'Devices signed in', deviceStatus, list);
    const day = (date: string): string => new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    let profile: RepositoryAccountState = {};
    function paintDeletion(scheduled: boolean): void {
      remove.hidden = scheduled;
      banner.hidden = !scheduled;
      pending.textContent = !scheduled ? '' : profile.scheduledPurgeAt
        ? `Your account is scheduled for deletion on ${day(profile.scheduledPurgeAt)}. Until then nothing has been removed.`
        : 'Your account is scheduled for deletion.';
    }
    function paintName(): void {
      name.textContent = profile.name || 'No name yet';
      name.classList.toggle('muted', !profile.name);
      head.title.textContent = profile.name || 'Account';
      edit.textContent = profile.name ? 'Edit' : 'Add a name';
      edit.hidden = false;
    }
    function closeEditor(): void { editor.hidden = true; edit.hidden = false; edit.focus(); }
    edit.addEventListener('click', () => { edit.hidden = true; editor.hidden = false; nameInput.value = profile.name ?? ''; nameInput.focus(); });
    cancel.addEventListener('click', closeEditor);
    signOut.addEventListener('click', () => { signOut.disabled = true; void account.signOut().then(() => d.done()); });
    const resend = link('account-resend-verification', 'Send the confirmation email again');
    const verification = h('div', { class: 'account-verification', hidden: '' }, h('p', { class: 'help' }, 'This address is not confirmed yet.'), resend);
    resend.addEventListener('click', async () => {
      resend.disabled = true;
      const r = await account.resendVerification(profile.email ?? st.email ?? '');
      resend.disabled = false;
      say(out, r.ok ? 'If confirmation is still needed, a new email is on its way.' : r.message, r.ok ? 'ok' : 'error');
    });
    screen.append(
      head.el,
      h('div', { class: 'acct-tiles' },
        banner,
        h('section', { class: 'acct-tile account-identity', id: 'account-signed-in', 'aria-label': 'Account profile' },
          h('dl', {},
            h('div', { class: 'account-identity__row' }, h('dt', { class: 'acct-kicker' }, 'Name'), h('dd', {}, name, edit, editor)),
            h('div', { class: 'account-identity__row' }, h('dt', { class: 'acct-kicker' }, 'Email'), h('dd', {}, emailText, verification)))),
        d.syncStatus ? h('section', { class: 'acct-tile account-device', id: 'account-device', 'aria-label': 'This device' }, h('p', { class: 'acct-kicker' }, 'This device'), d.syncStatus) : null,
        h('div', { class: 'account-actions' }, signOut, download, remove, deletion),
        out, devices),
      legal);

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
        const a = h('a', { href: url, download: filename });
        doc.body.append(a);
        a.click();
        a.remove();
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
      if (!secret) { say(deletionOut, 'Enter your password to confirm.', 'error'); password.focus(); return; }
      confirm.disabled = close.disabled = true;
      say(deletionOut, 'Scheduling the deletion…', 'info');
      const r = await client.deleteAccount(secret);
      confirm.disabled = close.disabled = false;
      if (!active()) return;
      if (!r.ok) {
        say(deletionOut, r.status === 401 || r.status === 403 || r.error === 'bad-credentials' ? 'That password was not accepted. Nothing was scheduled.' : `${explainAccountFailure(r)} Nothing was scheduled.`, 'error');
        password.focus();
        return;
      }
      profile.scheduledPurgeAt = r.data?.scheduledPurgeAt;
      deletionOut.textContent = '';
      deletion.hidden = true;
      paintDeletion(true);
      keep.focus();
    });
    keep.addEventListener('click', async () => {
      keep.disabled = true;
      const r = await client.cancelDeletion();
      keep.disabled = false;
      if (!active()) return;
      if (!r.ok) { say(out, `${explainAccountFailure(r)} The deletion is still scheduled.`, 'error'); return; }
      profile.scheduledPurgeAt = undefined;
      paintDeletion(false);
      remove.focus();
      say(out, 'The deletion is cancelled. Your account stays as it was.', 'ok');
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

  const newName = h('input', { type: 'text', id: 'account-new-name', name: 'name', autocomplete: 'name', maxlength: '100' }) as HTMLInputElement;
  const email = h('input', { type: 'email', id: 'account-email', name: 'email', autocomplete: 'email', required: '', spellcheck: 'false' }) as HTMLInputElement;
  const password = h('input', { type: 'password', id: 'account-password', name: 'password', autocomplete: 'current-password', required: '' }) as HTMLInputElement;
  const out = status();
  const signInBtn = h('button', { type: 'submit', id: 'account-signin', class: 'acct-pill' }, 'Sign in') as HTMLButtonElement;
  const createBtn = link('account-create', 'Create an account');
  const more = h('div', { id: 'account-more' });
  const form = h('form', { id: 'account-form', class: 'acct-tile acct-signin', novalidate: '', 'aria-labelledby': 'account-form-h' },
    h('p', { class: 'acct-kicker' }, 'Your account'),
    h('h2', { class: 'acct-title', id: 'account-form-h' }, 'Sign in'),
    field('Your name', newName, 'For a new account only: the name shown on your account in GoLearn, GoReview and Biblia.'),
    field('Email', email),
    field('Password', password, `A new password needs at least ${MIN_PASSWORD} characters. It is sent to the service and nowhere else; it is never kept here.`),
    h('div', { class: 'acct-actions' }, signInBtn, createBtn),
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
    const btn = link('account-resend', 'Send the confirmation email again');
    btn.addEventListener('click', () => {
      void (async () => {
        say(again, 'Sending…', 'info');
        const r = await account.resendVerification(addr);
        say(again, r.ok ? `If ${addr} still needs confirming, a new email is on its way.` : r.message, r.ok ? 'ok' : 'error');
      })();
    });
    more.replaceChildren(h('div', { class: 'acct-actions' }, btn), again);
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
      // a new account carries a name, as it does when made in GoReview
      const who = newName.value.trim();
      if (!who) { say(out, 'Enter your name.', 'error'); newName.focus(); return; }
      busy(true); more.replaceChildren(); say(out, 'Creating the account…', 'info');
      try {
        const r = await account.signUp(v.addr, v.secret, who);
        if (!r.ok) { say(out, r.message, 'error'); return; }
        const sent = r.verificationSent === true ? ` Check your email: a link to confirm ${v.addr} is on its way.` : r.verificationSent === false ? ' The confirmation email could not be sent; ask for it again when you sign in.' : '';
        say(out, `Account created and signed in as ${v.addr}.${sent}`, 'ok');
        // the learner reads the "check your email" line before leaving this screen: no automatic redirect after a sign-up
        more.replaceChildren(h('p', {}, h('a', { class: 'acct-pill', href: '#/' }, 'Continue to the library')));
      } finally { password.value = ''; busy(false); }
    })();
  });

  const fEmail = h('input', { type: 'email', id: 'forgot-email', name: 'forgot-email', autocomplete: 'email', spellcheck: 'false' }) as HTMLInputElement;
  const fOut = status();
  const fBtn = h('button', { type: 'button', id: 'forgot-submit', class: 'acct-pill acct-pill--small' }, 'Email me a reset link') as HTMLButtonElement;
  const forgot = h('details', { id: 'forgot', class: 'acct-forgot' },
    h('summary', {}, 'Forgot password?'),
    h('div', { class: 'acct-tile' },
      h('p', { class: 'help' }, 'Enter the email address of your account and the service will send a link to choose a new password.'),
      field('Email', fEmail), h('div', { class: 'acct-actions' }, fBtn), fOut));
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
  const head = hero('Welcome', 'Biblia');
  screen.append(
    head.el,
    h('div', { class: 'acct-tiles' },
      form,
      fold('', 'account-welcome', 'Welcome to Biblia',
        h('p', {}, 'Biblia records what you read with GoLearn on the same account. Sign in with the account you use in GoLearn: what you look up and mark here is kept in it, GoReview and the GoLearn extension see it too, and the words you have met anywhere are marked on the page by how well you know them.'),
        h('p', { class: 'muted' }, 'Without an account Biblia is a reader only: every word can be looked up, but nothing is recorded and nothing is marked.'))),
    forgot,
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
