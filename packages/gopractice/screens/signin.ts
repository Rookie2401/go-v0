/**
 * #/signin — email and password to the Repository service. The password goes to the service address and nowhere else; it is
 * never stored or logged. The bearer token is kept in this application's own storage only.
 */
import type { AppContext } from '../context';
import { validateServiceUrl } from '../config';
import { append, field, h, p, setStatus, statusLine } from '../dom';
import type { View } from './view';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const session = await ctx.state.getSession();
  const sync = await ctx.syncView();
  if (!view.alive()) return;
  const expired = !!session && (sync.authExpired || Date.parse(session.expiresAt) <= ctx.deps.now().getTime());
  append(el, [
    p('GoPractice reviews what you met while reading and keeps your drafts. Sign in with the account you use in GoLearn.'),
    session
      ? h('p', { id: 'signed-in-as', class: expired ? 'error' : 'muted' }, expired ? `Your session for ${session.email} has expired. Sign in again; nothing on this device was lost.` : `Signed in as ${session.email}. Signing in with another account switches accounts: the cached profile and language are forgotten, and ${session.email}'s unsent events stay on this device under that account.`)
      : null,
  ]);
  const url = h('input', { type: 'url', id: 'svc-url', name: 'svc-url', autocomplete: 'off', spellcheck: 'false', value: await ctx.serviceUrl() }) as HTMLInputElement;
  const email = h('input', { type: 'email', id: 'signin-email', name: 'email', autocomplete: 'email', required: true, value: session?.email ?? '' }) as HTMLInputElement;
  const password = h('input', { type: 'password', id: 'signin-password', name: 'password', autocomplete: 'current-password', required: true }) as HTMLInputElement;
  const status = statusLine();
  const submit = h('button', { type: 'submit', id: 'signin-submit', class: 'btn primary' }, 'Sign in') as HTMLButtonElement;
  const form = h('form', { id: 'signin-form', novalidate: true, class: 'card' },
    h('h2', {}, 'Sign in'),
    field('Email', email), field('Password', password),
    h('details', {}, h('summary', {}, 'Service address'), field('Go Repository service', url, 'https, or http on localhost for development.')),
    h('div', { class: 'row' }, submit), status);
  el.append(form);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    void (async () => {
      const addr = email.value.trim();
      const secret = password.value;
      if (!EMAIL.test(addr)) { setStatus(status, 'Enter a valid email address.', 'error'); return; }
      if (!secret) { setStatus(status, 'Enter your password.', 'error'); return; }
      const raw = url.value.trim();
      if (raw) { const c = validateServiceUrl(raw); if (!c.ok) { setStatus(status, c.message, 'error'); return; } }
      if (raw && raw !== (await ctx.serviceUrl())) {
        const saved = await ctx.saveService(raw);
        if (!saved.ok) { setStatus(status, saved.message, 'error'); return; }
      }
      submit.disabled = true;
      setStatus(status, 'Signing in…', 'info');
      try {
        const r = await ctx.signIn({ email: addr, password: secret });
        if (!r.ok) { setStatus(status, r.message, 'error'); return; }
        setStatus(status, r.switched ? `Switched to ${addr}.` : `Signed in as ${addr}.`, 'ok');
        ctx.go('review');
      } finally {
        password.value = ''; // the password is never kept
        submit.disabled = false;
      }
    })();
  });
}
