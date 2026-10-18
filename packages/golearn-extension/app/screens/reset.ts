/**
 * #/reset — the page the “reset your password” link opens (`#/reset?token=…`). The token fills the field (and is taken out of the
 * address bar); the learner chooses a new password twice. On success every session was ended by the service, so this device is signed
 * out too and the page leads to sign-in. The password goes to the service and is never kept.
 */
import type { AppContext } from '../context';
import { append, clear, field, h, p, setStatus, statusLine } from '../dom';
import { MIN_PASSWORD } from './account';
import { dropQuery, tokenFromHash } from './verify';
import type { View } from './view';

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const fromLink = tokenFromHash(ctx.deps.win.location.hash);
  if (fromLink) dropQuery(ctx, 'reset');
  const token = h('input', { type: 'text', id: 'reset-token', name: 'token', autocomplete: 'off', spellcheck: 'false', value: fromLink, required: true }) as HTMLInputElement;
  const first = h('input', { type: 'password', id: 'reset-password', name: 'new-password', autocomplete: 'new-password', required: true }) as HTMLInputElement;
  const again = h('input', { type: 'password', id: 'reset-password-again', name: 'new-password-again', autocomplete: 'new-password', required: true }) as HTMLInputElement;
  const status = statusLine();
  const submit = h('button', { type: 'submit', id: 'reset-submit', class: 'btn primary' }, 'Change my password') as HTMLButtonElement;
  const form = h('form', { id: 'reset-form', novalidate: true },
    field('Reset code', token, fromLink ? 'Filled in from the link in your email.' : 'The part after “token=” in the link in your email.'),
    field('New password', first, `At least ${MIN_PASSWORD} characters.`),
    field('New password again', again),
    h('div', { class: 'row' }, submit), status);
  const done = h('div', { id: 'reset-done', hidden: true });
  append(el, [p('Choose a new password for your GoLearn account. When it is changed, every device is signed out and you sign in again with the new password.'), form, done,
    h('p', { class: 'muted' }, 'No email? ', h('a', { href: '#/signin', id: 'reset-forgot-link' }, 'Ask for a new link on the sign-in page'), '.')]);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    void (async () => {
      const t = token.value.trim();
      const a = first.value;
      const b = again.value;
      if (!t) { setStatus(status, 'Enter the reset code from your email.', 'error'); return; }
      if (a.length < MIN_PASSWORD) { setStatus(status, `Choose a password of at least ${MIN_PASSWORD} characters.`, 'error'); return; }
      if (a !== b) { setStatus(status, 'The two passwords are not the same.', 'error'); return; }
      submit.disabled = true;
      setStatus(status, 'Changing the password…', 'info');
      try {
        const { client, session } = await ctx.accountApi();
        const r = await client.resetPassword(t, a);
        if (!view.alive()) return;
        if (!r.ok) {
          setStatus(status, r.status === 0 ? 'The service could not be reached, so nothing was changed. Try again.'
            : r.status === 429 ? 'Too many attempts. Wait a few minutes and try again.'
            : r.status === 400 || r.status === 404 || r.status === 410 || r.status === 422 ? (r.message || 'This reset link has expired or was already used. Ask for a new one on the sign-in page.')
            : r.message || `The service answered ${r.status}.`, 'error');
          return;
        }
        // the service ended every session; this device’s copy of the session is dead, so drop it (and the cached profile) too
        if (session) await ctx.signOut();
        if (!view.alive()) return;
        form.hidden = true;
        done.hidden = false;
        clear(done);
        append(done, [
          h('p', { class: 'notice', id: 'reset-ok', role: 'status' }, 'Your password is changed. Every device was signed out.'),
          h('p', {}, h('a', { class: 'btn primary', id: 'reset-signin', href: '#/signin' }, 'Sign in')),
        ]);
      } finally {
        first.value = ''; again.value = ''; // the password is never kept
        submit.disabled = false;
      }
    })();
  });
}
