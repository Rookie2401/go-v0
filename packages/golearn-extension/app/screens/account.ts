/**
 * Sign in (optional): the form on the sign-in page, and the account state with sign-out under Settings. Without an account everything stays on this device; signing in keeps
 * the learner’s progress across devices: what is already on this device is uploaded once, the languages chosen here become
 * enrolments on the account, and from then on the two are kept in step. Signing out returns to the device alone and removes nothing.
 * The service address (create account / sign in go there) is kept as an advanced detail under the form.
 *
 * The password goes to the service address and nowhere else (in the extension: to the background worker, which sends
 * it to the service); it is never stored, logged or kept beyond the request. The bearer token is written only into
 * `golearn:session` (by the worker, or by this page when there is no worker).
 */
import { validateServiceUrl } from '../config';
import { recordTermsAcceptance } from '../consent';
import type { AppContext } from '../context';
import { append, button, clear, field, h, p, setStatus, shortDate, statusLine } from '../dom';
import { setCheckEmail } from '../flash';
import type { View } from './view';

export const MIN_PASSWORD = 10;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export { explainFailure } from '../errors';

export interface AccountHooks {
  /** The learner signed in (or created the account); `message` is what the form said about it (who, and what was uploaded). */
  signedIn(message: string): Promise<void>;
  /** The learner signed out. */
  signedOut(): Promise<void>;
}

export interface AccountOptions {
  /**
   * true (default): the sign in / create form and the service address, as on the sign-in page.
   * false: only who is signed in and the way out (the Account section of Settings); the form is a link to the sign-in page.
   */
  form?: boolean;
  /** The paragraph above the account state; false = none (the page has its own words). */
  intro?: string | false;
  /** Say nothing about the account while nobody is signed in (the sign-in page: the form is the whole of it). */
  quiet?: boolean;
}

const ACCOUNT_INTRO = 'Signing in is optional. Without an account everything you do stays on this device and GoLearn works exactly the same. With one, what is already on this device is uploaded once, your languages are saved on the account, and your record follows you between devices.';

export async function renderAccountSection(el: HTMLElement, ctx: AppContext, view: View, hooks: AccountHooks, opts: AccountOptions = {}): Promise<void> {
  const withForm = opts.form !== false;
  const stateBox = h('p', { id: 'account-state', class: 'status-note', role: 'status' });
  const sessionBox = h('div', { id: 'account-session' });
  const formBox = h('div', { id: 'account-form-box' });
  const serviceBox = h('details', { class: 'service-address', id: 'service-address' });
  append(el, [
    opts.intro === false ? null : p(opts.intro ?? ACCOUNT_INTRO),
    stateBox, sessionBox, withForm ? formBox : null, withForm ? serviceBox : null,
  ]);

  // ── service address
  const urlInput = h('input', { type: 'url', id: 'svc-url', name: 'svc-url', autocomplete: 'off', spellcheck: 'false', value: await ctx.serviceUrl() }) as HTMLInputElement;
  const svcStatus = statusLine();
  const save = button('Use this address', async () => {
    const raw = urlInput.value.trim();
    if (raw) { const c = validateServiceUrl(raw); if (!c.ok) { setStatus(svcStatus, c.message, 'error'); return; } }
    const r = await ctx.saveService(raw || undefined);
    if (!r.ok) { setStatus(svcStatus, r.message, 'error'); return; }
    urlInput.value = await ctx.serviceUrl();
    setStatus(svcStatus, raw ? `Service address set to ${urlInput.value}.` : 'Back to the default address.', 'ok');
  }, { id: 'svc-save' });
  append(serviceBox, [
    h('summary', { id: 'svc-h' }, 'Service address (only used if you sign in)'),
    field('Go Repository service', urlInput, 'https, or http on localhost for development. Leave empty to use the default.'),
    h('div', { class: 'row' }, save), svcStatus,
  ]);

  // ── session
  async function paintSession(): Promise<void> {
    if (!view.alive()) return;
    clear(sessionBox);
    const s = await ctx.state.getSession();
    if (!view.alive()) return;
    stateBox.textContent = s ? `Synced to your account as ${s.email}` : 'On this device only';
    stateBox.setAttribute('data-state', s ? 'synced' : 'device');
    stateBox.hidden = !!opts.quiet && !s;
    if (!s && opts.quiet) return;
    if (!s) {
      sessionBox.append(p('Not signed in. GoLearn works on this device without an account; nothing is sent anywhere.', 'muted'));
      if (!withForm) sessionBox.append(h('p', {}, h('a', { href: '#/signin', id: 'settings-signin' }, 'Sign in or create an account (optional)')));
      return;
    }
    const expired = Date.parse(s.expiresAt) <= ctx.deps.now().getTime();
    const out = statusLine();
    append(sessionBox, [
      h('p', { id: 'signed-in-as' }, `Signed in as ${s.email}`),
      h('p', { class: 'muted' }, `Learner ${s.learnerId} · session ${expired ? 'expired' : 'valid'} until ${shortDate(s.expiresAt)}`),
      expired ? p('The session has expired. Sign in again below.', 'error') : null,
      h('div', { class: 'row' }, button('Sign out of this device', async () => {
        await ctx.signOut();
        setStatus(out, 'Signed out. This device no longer holds a session or cached profile; everything you did here stays on this device.', 'ok');
        await paintSession();
        await hooks.signedOut();
      }, { id: 'acct-disconnect' })),
      out,
      withForm
        ? p('Signing in with another account replaces this session and clears the cached profile on this device.', 'muted')
        : h('p', {}, h('a', { href: '#/signin', id: 'settings-signin' }, 'Sign in with another account')),
    ]);
  }
  await paintSession();
  if (!withForm) return;

  // ── sign in / create
  const mode = h('select', { id: 'acct-mode', name: 'mode' }, h('option', { value: 'signin' }, 'Sign in'), h('option', { value: 'create' }, 'Create an account')) as HTMLSelectElement;
  const email = h('input', { type: 'email', id: 'acct-email', name: 'email', autocomplete: 'email', required: true }) as HTMLInputElement;
  const password = h('input', { type: 'password', id: 'acct-password', name: 'password', autocomplete: 'current-password', required: true }) as HTMLInputElement;
  const hint = h('p', { class: 'muted' });
  const terms = h('p', { class: 'muted', id: 'terms-note', hidden: true }, 'By creating an account you accept the ', h('a', { href: '#/terms', id: 'link-terms' }, 'Terms'), ' and the ', h('a', { href: '#/privacy', id: 'link-privacy' }, 'Privacy Policy'), '.');
  mode.addEventListener('change', () => {
    password.setAttribute('autocomplete', mode.value === 'create' ? 'new-password' : 'current-password');
    hint.textContent = mode.value === 'create' ? `At least ${MIN_PASSWORD} characters. The password is sent to the service only; it is never stored here.` : '';
    terms.hidden = mode.value !== 'create';
  });
  const status = statusLine();
  const submit = h('button', { type: 'submit', id: 'acct-submit', class: 'btn primary' }, 'Continue') as HTMLButtonElement;
  const unverified = h('div', { id: 'unverified-notice' });
  const form = h('form', { id: 'acct-form', novalidate: true },
    field('What would you like to do?', mode), field('Email', email), field('Password', password), hint, terms, h('div', { class: 'row' }, submit), status, unverified);
  append(formBox, [form, forgotBlock(ctx, email)]);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    void (async () => {
      const addr = email.value.trim();
      const secret = password.value;
      const creating = mode.value === 'create';
      if (!EMAIL.test(addr)) { setStatus(status, 'Enter a valid email address.', 'error'); return; }
      if (!secret) { setStatus(status, 'Enter your password.', 'error'); return; }
      if (creating && secret.length < MIN_PASSWORD) { setStatus(status, `Choose a password of at least ${MIN_PASSWORD} characters.`, 'error'); return; }
      submit.disabled = true;
      clear(unverified);
      setStatus(status, creating ? 'Creating the account…' : 'Signing in…', 'info');
      try {
        const r = await ctx.signIn({ email: addr, password: secret, create: creating });
        const sent = r.ok && r.uploaded !== undefined ? ` ${r.uploaded === 0 ? 'Nothing needed uploading from this device.' : `Uploaded ${r.uploaded} event${r.uploaded === 1 ? '' : 's'} from this device to your account.`} Progress is now synced to your account.` : r.ok ? ' Progress is now synced to your account.' : '';
        const said = r.ok ? (creating ? `Account created and signed in as ${addr}.` : `Signed in as ${addr}.`) + sent + (creating ? ' Check your email to confirm the address.' : '') : r.message;
        setStatus(status, said, r.ok ? 'ok' : 'error');
        if (!r.ok && r.code === 'email-unverified') {
          const again = statusLine();
          append(unverified, [h('div', { class: 'row' }, button('Send the confirmation email again', () => {
            void (async () => {
              const { client } = await ctx.accountApi();
              setStatus(again, 'Sending…', 'info');
              const sentAgain = await client.resendVerification(addr);
              setStatus(again, sentAgain.ok ? `If ${addr} still needs confirming, a new email is on its way.` : sentAgain.message || 'The service could not be reached. Try again.', sentAgain.ok ? 'ok' : 'error');
            })();
          }, { id: 'unverified-resend', class: 'btn' })), again]);
        }
        if (r.ok) {
          if (creating) {
            setCheckEmail(ctx, { email: addr, ...(r.verificationSent !== undefined ? { sent: r.verificationSent } : {}) });
            void recordTermsAcceptance(ctx);
          }
          await paintSession();
          await hooks.signedIn(said);
        }
      } finally {
        password.value = ''; // the password is never kept
        submit.disabled = false;
      }
    })();
  });
}

/**
 * “Forgot password?”: asks for the email address and has the service send a reset link. The answer is always the same whether or not
 * the address has an account, so the page never reveals which addresses do.
 */
function forgotBlock(ctx: AppContext, signInEmail: HTMLInputElement): HTMLElement {
  const email = h('input', { type: 'email', id: 'forgot-email', name: 'forgot-email', autocomplete: 'email' }) as HTMLInputElement;
  const out = statusLine();
  const box = h('details', { class: 'forgot', id: 'forgot' },
    h('summary', { id: 'forgot-h' }, 'Forgot password?'),
    p('Enter the email address of your account and we will send you a link to choose a new password.', 'muted'),
    field('Email', email),
    h('div', { class: 'row' }, button('Email me a reset link', () => {
      void (async () => {
        const addr = email.value.trim();
        if (!EMAIL.test(addr)) { setStatus(out, 'Enter a valid email address.', 'error'); return; }
        const { client } = await ctx.accountApi();
        setStatus(out, 'Sending…', 'info');
        const r = await client.forgotPassword(addr);
        if (r.ok || (r.status >= 400 && r.status < 500 && r.status !== 429)) setStatus(out, 'If that address has an account, an email is on its way.', 'ok');
        else setStatus(out, r.status === 0 ? 'The service could not be reached, so no email was sent. Try again.' : r.status === 429 ? 'Too many attempts. Wait a few minutes and try again.' : r.message || `The service answered ${r.status}.`, 'error');
      })();
    }, { id: 'forgot-submit', class: 'btn' })), out);
  box.addEventListener('toggle', () => { if ((box as HTMLDetailsElement).open && !email.value) email.value = signInEmail.value.trim(); });
  return box;
}
