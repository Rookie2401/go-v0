/**
 * #/verify — the page the “confirm your email” link opens (`#/verify?token=…`). The token is read from the address, sent to the
 * service once, and taken out of the address bar. The result is shown plainly; a confirmed address continues to the languages page.
 * Without a token in the address (or when the link has expired or was used), the page has a field to paste a token into and a way
 * to ask for a new email.
 */
import type { AppContext } from '../context';
import { append, button, clear, field, h, p, setStatus, statusLine } from '../dom';
import type { View } from './view';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The `token` in `#/route?token=…`, tolerating a hash that is only `?token=…`. */
export function tokenFromHash(hash: string): string {
  const q = hash.indexOf('?');
  if (q < 0) return '';
  try { return new URLSearchParams(hash.slice(q + 1)).get('token')?.trim() ?? ''; } catch { return ''; }
}

/** Remove the query from the address bar (the token has been taken; it should not stay in history or be copied by accident). */
export function dropQuery(ctx: AppContext, route: string): void {
  try { ctx.deps.win.history.replaceState(null, '', `#/${route}`); } catch { /* the address stays as it is */ }
}

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const fromLink = tokenFromHash(ctx.deps.win.location.hash);
  if (fromLink) dropQuery(ctx, 'verify');
  const result = h('div', { id: 'verify-result', role: 'status', 'aria-live': 'polite' });
  const form = h('div', { id: 'verify-more' });
  append(el, [
    p('Confirming your email address tells GoLearn that the account is yours. It is needed to reset a forgotten password and to keep signing in after the first few days.'),
    result, form,
  ]);

  async function confirm(token: string): Promise<void> {
    clear(result);
    append(result, [p('Confirming your email address…', 'muted')]);
    const { client } = await ctx.accountApi();
    const r = await client.verify(token);
    if (!view.alive()) return;
    clear(result);
    if (r.ok) {
      clear(form);
      append(result, [
        h('p', { class: 'notice', id: 'verify-ok' }, 'Your email address is confirmed.'),
        h('p', {}, h('a', { class: 'btn primary', id: 'verify-continue', href: '#/languages' }, 'Continue')),
      ]);
      return;
    }
    append(result, [h('p', { class: 'error', id: 'verify-failed' },
      r.status === 0 ? 'The service could not be reached, so nothing was confirmed. Check your connection and try again.'
        : r.status === 429 ? 'Too many attempts. Wait a few minutes and try again.'
        : `This confirmation link did not work${r.message ? `: ${r.message}` : '. It may have expired or already been used'}. Ask for a new email below, or paste a newer link’s code.`)]);
    paintForm(token);
  }

  function paintForm(prefill: string): void {
    clear(form);
    const token = h('input', { type: 'text', id: 'verify-token', name: 'token', autocomplete: 'off', spellcheck: 'false', value: prefill }) as HTMLInputElement;
    const tokenOut = statusLine();
    const email = h('input', { type: 'email', id: 'verify-email', name: 'email', autocomplete: 'email' }) as HTMLInputElement;
    const emailOut = statusLine();
    ctx.state.getSession().then((s) => { if (s && !email.value && view.alive()) email.value = s.email; }, () => undefined);
    append(form, [
      h('section', { class: 'sub', 'aria-labelledby': 'verify-paste-h' },
        h('h2', { id: 'verify-paste-h' }, 'Paste the code from the email'),
        field('Confirmation code', token, 'The part after “token=” in the link, if the link itself does not open here.'),
        h('div', { class: 'row' }, button('Confirm', () => {
          const t = token.value.trim();
          if (!t) { setStatus(tokenOut, 'Paste the code first.', 'error'); return; }
          setStatus(tokenOut, '', 'info');
          void confirm(t);
        }, { id: 'verify-submit', class: 'btn primary' })), tokenOut),
      h('section', { class: 'sub', 'aria-labelledby': 'verify-resend-h' },
        h('h2', { id: 'verify-resend-h' }, 'Send a new email'),
        field('Your email address', email),
        h('div', { class: 'row' }, button('Send it again', () => {
          void (async () => {
            const addr = email.value.trim();
            if (!EMAIL.test(addr)) { setStatus(emailOut, 'Enter a valid email address.', 'error'); return; }
            const { client } = await ctx.accountApi();
            setStatus(emailOut, 'Sending…', 'info');
            const r = await client.resendVerification(addr);
            setStatus(emailOut, r.ok ? 'If that address has an account that still needs confirming, a new email is on its way.' : r.status === 0 ? 'The service could not be reached. Try again.' : r.message || `The service answered ${r.status}.`, r.ok ? 'ok' : 'error');
          })();
        }, { id: 'verify-resend', class: 'btn' })), emailOut),
    ]);
  }

  if (fromLink) await confirm(fromLink);
  else {
    append(result, [p('Open the link in the email we sent you, or paste its code below.', 'muted')]);
    paintForm('');
  }
}
