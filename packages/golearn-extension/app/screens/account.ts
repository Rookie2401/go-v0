/**
 * Keep your progress across devices (optional, and last in setup): the service address, create account / sign in, connect /
 * disconnect, account switching. Without an account everything stays on this device; signing in uploads that history once and
 * then keeps the two in step; signing out returns to the device alone and removes nothing.
 * The password goes to the service address and nowhere else (in the extension: to the background worker, which sends
 * it to the service); it is never stored, logged or kept beyond the request. The bearer token is written only into
 * `golearn:session` (by the worker, or by this page when there is no worker).
 */
import { validateServiceUrl } from '../config';
import type { AppContext } from '../context';
import { append, button, clear, field, h, p, setStatus, shortDate, statusLine } from '../dom';
import type { View } from './view';

export const MIN_PASSWORD = 10;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export { explainFailure } from '../errors';

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const stateBox = h('p', { id: 'account-state', class: 'status-note', role: 'status' });
  const serviceBox = h('section', { class: 'card', 'aria-labelledby': 'svc-h' });
  const sessionBox = h('section', { class: 'card', 'aria-labelledby': 'sess-h' });
  const formBox = h('section', { class: 'card', 'aria-labelledby': 'form-h' });
  append(el, [
    p('Keep your progress across devices. An account is optional: without one, everything you do stays on this device and GoLearn works exactly the same. With one, what is already on this device is uploaded once, and from then on your record follows you between devices.'),
    h('p', { class: 'actions' }, h('a', { class: 'btn', id: 'acct-not-now', href: '#/home' }, 'Not now')),
    stateBox, sessionBox, formBox, serviceBox,
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
    h('h2', { id: 'svc-h' }, 'Service address (only used if you sign in)'),
    field('Go Repository service', urlInput, 'https, or http on localhost for development. Leave empty to use the default.'),
    h('div', { class: 'row' }, save), svcStatus,
  ]);

  // ── session
  async function paintSession(): Promise<void> {
    if (!view.alive()) return;
    clear(sessionBox);
    const s = await ctx.state.getSession();
    if (!view.alive()) return;
    append(sessionBox, [h('h2', { id: 'sess-h' }, 'This device')]);
    stateBox.textContent = s ? 'Synced to your account' : 'On this device only';
    stateBox.setAttribute('data-state', s ? 'synced' : 'device');
    if (!s) { sessionBox.append(p('Not signed in. GoLearn works on this device without an account; nothing is sent anywhere.', 'muted')); return; }
    const expired = Date.parse(s.expiresAt) <= ctx.deps.now().getTime();
    const out = statusLine();
    append(sessionBox, [
      h('p', { id: 'signed-in-as' }, `Signed in as ${s.email}`),
      h('p', { class: 'muted' }, `Learner ${s.learnerId} · session ${expired ? 'expired' : 'valid'} until ${shortDate(s.expiresAt)}`),
      expired ? p('The session has expired. Sign in again below.', 'error') : null,
      h('div', { class: 'row' }, button('Disconnect this device', async () => {
        await ctx.signOut();
        setStatus(out, 'Signed out. This device no longer holds a session or cached profile; everything you did here stays on this device.', 'ok');
        await paintSession();
      }, { id: 'acct-disconnect' })),
      out,
      p('Signing in with another account replaces this session and clears the cached profile on this device.', 'muted'),
    ]);
  }
  await paintSession();

  // ── sign in / create
  const mode = h('select', { id: 'acct-mode', name: 'mode' }, h('option', { value: 'signin' }, 'Sign in'), h('option', { value: 'create' }, 'Create an account')) as HTMLSelectElement;
  const email = h('input', { type: 'email', id: 'acct-email', name: 'email', autocomplete: 'email', required: true }) as HTMLInputElement;
  const password = h('input', { type: 'password', id: 'acct-password', name: 'password', autocomplete: 'current-password', required: true }) as HTMLInputElement;
  const hint = h('p', { class: 'muted' });
  mode.addEventListener('change', () => {
    password.setAttribute('autocomplete', mode.value === 'create' ? 'new-password' : 'current-password');
    hint.textContent = mode.value === 'create' ? `At least ${MIN_PASSWORD} characters. The password is sent to the service only; it is never stored here.` : '';
  });
  const status = statusLine();
  const submit = h('button', { type: 'submit', id: 'acct-submit', class: 'btn primary' }, 'Continue') as HTMLButtonElement;
  const form = h('form', { id: 'acct-form', novalidate: true },
    field('What would you like to do?', mode), field('Email', email), field('Password', password), hint, h('div', { class: 'row' }, submit), status);
  append(formBox, [h('h2', { id: 'form-h' }, 'Sign in or create an account (optional)'), form]);

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
      setStatus(status, creating ? 'Creating the account…' : 'Signing in…', 'info');
      try {
        const r = await ctx.signIn({ email: addr, password: secret, create: creating });
        const sent = r.ok && r.uploaded !== undefined ? ` ${r.uploaded === 0 ? 'Nothing needed uploading from this device.' : `Uploaded ${r.uploaded} event${r.uploaded === 1 ? '' : 's'} from this device to your account.`} Progress is now synced to your account.` : r.ok ? ' Progress is now synced to your account.' : '';
        setStatus(status, r.ok ? (creating ? `Account created and signed in as ${addr}.` : `Signed in as ${addr}.`) + sent : r.message, r.ok ? 'ok' : 'error');
        if (r.ok) await paintSession();
      } finally {
        password.value = ''; // the password is never kept
        submit.disabled = false;
      }
    })();
  });
}
