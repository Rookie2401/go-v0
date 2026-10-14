/**
 * #/signin — the optional account. Email and password go to the Repository service and nowhere else; the password is never stored or
 * logged. The bearer token is kept in this application's own storage only.
 *
 * Three situations, one page:
 *   - inside the GoLearn extension (the on-device Repository answers): the account only keeps progress across devices. Everything works
 *     without it; signing in uploads what is already on this device once, says how many events, and switches to the account;
 *   - the hosted copy: it has no on-device Repository, so the account is where its data lives. The page says so instead of walling the app,
 *     and points to the extension, whose copy of GoPractice works on the device;
 *   - signed in already: who, and that another sign-in switches accounts.
 */
import type { AppContext } from '../context';
import { validateServiceUrl } from '../config';
import { append, field, h, p, setStatus, statusLine } from '../dom';
import type { View } from './view';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const [session, sync, mode] = await Promise.all([ctx.state.getSession(), ctx.syncView(), ctx.mode()]);
  if (!view.alive()) return;
  const expired = !!session && (sync.authExpired || Date.parse(session.expiresAt) <= ctx.deps.now().getTime());
  const hosted = mode === 'none';
  const links = ctx.deps.links ?? {};

  if (hosted && ctx.deps.edition === 'review') {
    // the iPhone app: there is no extension on a phone, so the account is the only way in, and it is the one GoLearn uses
    append(el, [h('section', { class: 'card', id: 'review-first-launch', 'aria-labelledby': 'review-first-h' },
      h('h2', { id: 'review-first-h' }, 'Welcome to GoReview'),
      p('GoReview shows what you read with GoLearn on the same account. Sign in with the account you use in GoLearn: your words, your decks and your reviews appear here, and what you look up while reading on your computer arrives within seconds while GoReview is open.'),
      p('Your reviews done here go back to the same account, so GoLearn sees them too. Nothing is shown until you sign in.', 'muted'))]);
  } else if (hosted) {
    // no wall: the page says what this copy is and where the copy that needs no account lives
    append(el, [h('section', { class: 'card', id: 'hosted-copy', 'aria-labelledby': 'hosted-h' },
      h('h2', { id: 'hosted-h' }, 'This is the hosted copy of GoPractice'),
      p('The hosted copy keeps your reviews and drafts on your account, so it needs one. The copy inside the GoLearn extension works on your own device with no account at all: it reads what you met while reading from the device, and keeps your reviews and drafts there.'),
      links.extension
        ? h('p', {}, h('a', { class: 'btn primary', id: 'open-extension-copy', href: links.extension }, 'Open GoPractice in the extension'))
        : p('To use it without an account, install the GoLearn extension and press “Practise” in its toolbar button; the extension’s own page opens.', 'muted'))]);
  } else if (!session) {
    append(el, [
      h('section', { class: 'card', id: 'account-optional' },
        h('h2', {}, 'Keep your progress across devices'),
        p('An account is optional. GoPractice already works on this device: your reviews and drafts are kept here, and nothing leaves it. Sign in only if you want them on your other devices too.'),
        p('Signing in uploads what is on this device to your account once, then keeps the two in step. Signing out later brings you back to this device alone and removes nothing.', 'muted'),
        h('p', {}, h('a', { class: 'btn', id: 'signin-not-now', href: '#/review' }, 'Not now'))),
    ]);
  }

  append(el, [
    hosted ? null : p(session ? 'GoPractice reviews what you met while reading and keeps your drafts.' : 'Use the account you use in GoLearn. To create one, use GoLearn setup.'),
    session
      ? h('p', { id: 'signed-in-as', class: expired ? 'error' : 'muted' }, expired ? `Your session for ${session.email} has expired. Sign in again; nothing on this device was lost.` : `Signed in as ${session.email}. Signing in with another account switches accounts: the cached profile and language are forgotten, and ${session.email}'s unsent events stay on this device under that account.`)
      : null,
    !hosted && !session && links.setup ? h('p', { class: 'muted' }, h('a', { href: links.setup, id: 'link-setup' }, 'GoLearn setup')) : null,
  ]);
  const url = h('input', { type: 'url', id: 'svc-url', name: 'svc-url', autocomplete: 'off', spellcheck: 'false', value: await ctx.serviceUrl() }) as HTMLInputElement;
  const email = h('input', { type: 'email', id: 'signin-email', name: 'email', autocomplete: 'email', required: true, value: session?.email ?? '' }) as HTMLInputElement;
  const password = h('input', { type: 'password', id: 'signin-password', name: 'password', autocomplete: 'current-password', required: true }) as HTMLInputElement;
  const status = statusLine();
  const submit = h('button', { type: 'submit', id: 'signin-submit', class: 'btn primary' }, 'Sign in') as HTMLButtonElement;
  const next = h('p', { id: 'signin-next', hidden: true }, h('a', { class: 'btn primary', id: 'signin-continue', href: '#/review' }, 'Continue to GoReview'));
  const form = h('form', { id: 'signin-form', novalidate: true, class: 'card' },
    h('h2', {}, 'Sign in'),
    field('Email', email), field('Password', password),
    h('details', {}, h('summary', {}, 'Service address'), field('Go Repository service', url, 'https, or http on localhost for development.')),
    h('div', { class: 'row' }, submit), status, next);
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
        const who = r.switched ? `Switched to ${addr}.` : `Signed in as ${addr}.`;
        if (mode !== 'device') {
          setStatus(status, who, 'ok');
          ctx.go('review');
          return;
        }
        // inside the extension the upload of the device's history is part of the step: say how many, then let the learner go on
        const count = r.uploaded === undefined ? '' : r.uploaded === 0 ? ' Nothing needed uploading from this device.' : ` Uploaded ${r.uploaded} event${r.uploaded === 1 ? '' : 's'} from this device to your account.`;
        setStatus(status, `${who}${count} Your progress is now synced to your account.`, 'ok');
        next.hidden = false;
      } finally {
        password.value = ''; // the password is never kept
        submit.disabled = false;
      }
    })();
  });
}
