/**
 * The parts of the account that need care, shared by Settings, Privacy and the sign-in page:
 *   - email confirmation: whether the address is confirmed, and “send it again”;
 *   - sessions: every signed-in device with its last use, a revoke per row and “sign out everywhere else”;
 *   - “Download my data”: the service’s whole export as golearn-data-<date>.json;
 *   - “Delete my account”: password-confirmed, with a 14-day grace period, then the pending deletion with a Cancel;
 *   - the last 20 security events;
 *   - a banner on the sign-in page and Settings while a deletion is pending.
 * All of it talks to the service through `ctx.accountApi()`; the password is only ever sent, never kept.
 */
import type { AppContext } from '../context';
import { append, button, clear, field, h, p, setStatus, shortDate, statusLine } from '../dom';
import type { View } from './view';

/** Dispatched on the document when the deletion state or the sessions changed, so the other parts of the page repaint. */
export const ACCOUNT_CHANGED = 'golearn:account-changed';
export const GRACE_DAYS = 14;

export const dataFilename = (now: Date): string => `golearn-data-${now.toISOString().slice(0, 10)}.json`;

const announce = (ctx: AppContext): void => { ctx.deps.doc.dispatchEvent(new Event(ACCOUNT_CHANGED)); };

/** Repaint `paint` whenever the account changed elsewhere on the page, until the screen goes away. */
function watch(ctx: AppContext, view: View, paint: () => void): void {
  const on = (): void => { if (view.alive()) paint(); };
  ctx.deps.doc.addEventListener(ACCOUNT_CHANGED, on);
  view.onDispose(() => ctx.deps.doc.removeEventListener(ACCOUNT_CHANGED, on));
}

const EVENT_LABEL: Record<string, string> = {
  'sign-in': 'Signed in', 'signin': 'Signed in', 'login': 'Signed in', 'sign-out': 'Signed out', 'signout': 'Signed out', 'logout': 'Signed out',
  'password-reset': 'Password changed with an emailed link', 'password-changed': 'Password changed', 'password-reset-requested': 'Password reset asked for',
  'email-verified': 'Email address confirmed', 'verification-resent': 'Confirmation email asked for again',
  'session-revoked': 'A session was ended', 'sessions-revoked': 'Other sessions were ended',
  'deletion-requested': 'Account deletion scheduled', 'deletion-cancelled': 'Account deletion cancelled', 'data-exported': 'Data downloaded',
};
export const eventLabel = (kind: string): string => EVENT_LABEL[kind] ?? (kind.replace(/[-_.]+/g, ' ').replace(/^./, (c) => c.toUpperCase()) || 'Event');

// ───────────────────────────── pending deletion banner ─────────────────────────────

/** Fills `slot` with the pending-deletion banner (and its Cancel) while a deletion is scheduled; leaves it empty otherwise. Returns the function that asks the service again. */
export function mountDeletionBanner(slot: HTMLElement, ctx: AppContext, view: View): () => Promise<void> {
  let seq = 0;
  let own = false;
  async function paint(): Promise<void> {
    const my = ++seq;
    const { client, session } = await ctx.accountApi();
    if (!view.alive() || my !== seq) return;
    if (!session) { clear(slot); return; }
    const r = await client.state();
    if (!view.alive() || my !== seq) return;
    clear(slot);
    if (!r.ok || !r.data.scheduledPurgeAt) return;
    const when = r.data.scheduledPurgeAt;
    const out = statusLine();
    append(slot, [h('div', { class: 'notice', id: 'deletion-banner', role: 'status' },
      h('p', {}, h('strong', {}, `Your account is scheduled for deletion on ${shortDate(when)}.`), ' Until then you can sign in and use GoLearn as usual; at that time the account and everything the service holds about you are erased.'),
      h('div', { class: 'row' }, button('Cancel the deletion', () => {
        void (async () => {
          setStatus(out, 'Cancelling…', 'info');
          const c = await client.cancelDeletion();
          if (!c.ok) { setStatus(out, `${explain(c)} The deletion is still scheduled.`, 'error'); return; }
          clear(slot);
          append(slot, [p('The deletion is cancelled. Your account stays as it was.', 'notice')]);
          slot.firstElementChild?.setAttribute('id', 'deletion-cancelled');
          slot.firstElementChild?.setAttribute('role', 'status');
          own = true;
          announce(ctx);
        })();
      }, { id: 'deletion-cancel', class: 'btn' })),
      out)]);
  }
  void paint();
  // another part of the page scheduled or cancelled the deletion: ask the service again
  watch(ctx, view, () => { if (own) { own = false; return; } void paint(); });
  return paint;
}

type Failed = { ok: false; status: number; error: string; message: string };
function explain(r: Failed): string {
  if (r.status === 0) return 'The service could not be reached. Check your connection and try again.';
  if (r.status === 429) return 'Too many attempts. Wait a few minutes and try again.';
  if (r.status === 401) return 'Your session is no longer valid. Sign in again.';
  return r.message || `The service answered ${r.status}.`;
}

// ───────────────────────────── email confirmation ─────────────────────────────

/** “Check your email”: shown right after an account is created, with a way to ask for the email again. */
export function checkEmailNotice(ctx: AppContext, email: string, sent?: boolean): HTMLElement {
  const out = statusLine();
  return h('div', { class: 'notice', id: 'check-email', role: 'status' },
    h('p', {}, h('strong', {}, 'Check your email.'), sent === false
      ? ` We could not send the confirmation email to ${email} just now. Ask for it again below.`
      : ` We sent a link to ${email}. Open it to confirm that the address is yours; you can carry on meanwhile.`),
    h('div', { class: 'row' }, button('Send the email again', () => {
      void (async () => {
        const { client } = await ctx.accountApi();
        setStatus(out, 'Sending…', 'info');
        const r = await client.resendVerification(email);
        setStatus(out, r.ok ? `If ${email} still needs confirming, a new email is on its way.` : explain(r), r.ok ? 'ok' : 'error');
      })();
    }, { id: 'check-email-resend', class: 'btn' })),
    out);
}

export function verificationBlock(ctx: AppContext, view: View): HTMLElement {
  const box = h('section', { class: 'sub', id: 'acct-verification', 'aria-labelledby': 'acct-verification-h' }, h('h3', { id: 'acct-verification-h' }, 'Email address'));
  const line = h('p', { id: 'verification-state' });
  const out = statusLine();
  const resend = button('Send the confirmation email again', () => {
    void (async () => {
      const { client, session } = await ctx.accountApi();
      if (!session) return;
      setStatus(out, 'Sending…', 'info');
      const r = await client.resendVerification(session.email);
      setStatus(out, r.ok ? `If ${session.email} still needs confirming, a new email is on its way.` : explain(r), r.ok ? 'ok' : 'error');
    })();
  }, { id: 'verification-resend' });
  append(box, [line, h('div', { class: 'row' }, resend), out]);
  void (async () => {
    const { client, session } = await ctx.accountApi();
    if (!view.alive() || !session) return;
    const r = await client.state();
    if (!view.alive()) return;
    if (r.ok && r.data.verified === true) {
      line.textContent = `${session.email} is confirmed.`;
      line.setAttribute('data-state', 'verified');
      resend.hidden = true;
    } else if (r.ok && r.data.verified === false) {
      line.textContent = `${session.email} is not confirmed yet. Open the link in the email we sent; until it is confirmed, signing in works for a limited time only.`;
      line.setAttribute('data-state', 'unverified');
    } else {
      line.textContent = `${session.email}. The service did not say whether this address is confirmed.`;
      line.setAttribute('data-state', 'unknown');
    }
  })();
  return box;
}

// ───────────────────────────── sessions ─────────────────────────────

export function sessionsBlock(ctx: AppContext, view: View): HTMLElement {
  const box = h('section', { class: 'sub', id: 'acct-sessions', 'aria-labelledby': 'acct-sessions-h' }, h('h3', { id: 'acct-sessions-h' }, 'Sessions'));
  const listBox = h('div', { id: 'sessions-list' });
  const out = statusLine();
  append(box, [p('Every device and browser signed in to your account. End one you do not recognise or no longer use.', 'muted'), listBox, out]);

  async function paint(): Promise<void> {
    const { client, session } = await ctx.accountApi();
    if (!view.alive() || !session) return;
    const r = await client.sessions();
    if (!view.alive()) return;
    clear(listBox);
    if (!r.ok) { append(listBox, [p(`The sessions could not be listed. ${explain(r)}`, 'error')]); return; }
    const rows = Array.isArray(r.data?.sessions) ? r.data.sessions : []; // a body that is not the contract’s shape is an empty list
    if (!rows.length) { append(listBox, [p('No sessions are listed.', 'muted')]); return; }
    const others = rows.filter((s) => !s.current).length;
    append(listBox, [
      h('ul', { class: 'status-list', id: 'sessions' }, ...rows.map((s) => h('li', { 'data-session': s.id, ...(s.current ? { 'data-current': 'true' } : {}) },
        h('strong', {}, s.deviceLabel || 'Unnamed device'), s.current ? ' · this device' : '',
        h('span', { class: 'muted' }, ` · last used ${shortDate(s.lastSeenAt)} · signed in ${shortDate(s.createdAt)}`),
        s.current ? null : [' ', button('End this session', () => {
          void (async () => {
            setStatus(out, 'Ending the session…', 'info');
            const d = await client.revokeSession(s.id);
            if (!d.ok) { setStatus(out, explain(d), 'error'); return; }
            setStatus(out, `Ended the session on ${s.deviceLabel || 'an unnamed device'}.`, 'ok');
            await paint();
          })();
        }, { class: 'btn small', 'data-revoke': s.id, 'aria-label': `End the session on ${s.deviceLabel || 'an unnamed device'}, last used ${shortDate(s.lastSeenAt)}` })]))),
      others > 0
        ? h('div', { class: 'row' }, button('Sign out everywhere else', () => {
          void (async () => {
            setStatus(out, 'Signing out the other devices…', 'info');
            const d = await client.revokeOthers();
            if (!d.ok) { setStatus(out, explain(d), 'error'); return; }
            setStatus(out, 'Every other device is signed out. This one stays signed in.', 'ok');
            await paint();
          })();
        }, { id: 'sessions-revoke-others' }))
        : p('This is the only device signed in.', 'muted'),
    ]);
  }
  void paint();
  return box;
}

// ───────────────────────────── download my data ─────────────────────────────

export function exportBlock(ctx: AppContext, opts: { id?: string; extra?: HTMLElement[] } = {}): HTMLElement {
  const hid = `${opts.id ?? 'acct-export'}-h`;
  const box = h('section', { class: 'sub', id: opts.id ?? 'acct-export', 'aria-labelledby': hid }, h('h3', { id: hid }, 'Download my data'));
  const out = statusLine();
  append(box, [
    p('Everything the service holds about you, as one JSON file: events, enrolments, knowledge estimates, preferences and your private documents.'),
    h('div', { class: 'row' },
      button('Download my data', () => {
        void (async () => {
          const { client, session } = await ctx.accountApi();
          if (!session) { setStatus(out, 'Sign in first: the download comes from your account on the service.', 'error'); return; }
          setStatus(out, 'Preparing the file…', 'info');
          const r = await client.exportData();
          if (!r.ok) { setStatus(out, explain(r), 'error'); return; }
          const name = dataFilename(ctx.deps.now());
          ctx.deps.download(name, new Blob([r.data], { type: 'application/json' }));
          setStatus(out, `Your data is ready: ${name}.`, 'ok');
        })();
      }, { id: 'export-data', class: 'btn primary' }), ...(opts.extra ?? [])),
    out,
  ]);
  return box;
}

// ───────────────────────────── delete my account ─────────────────────────────

export function deleteBlock(ctx: AppContext, view: View): HTMLElement {
  const box = h('section', { class: 'sub', id: 'acct-delete', 'aria-labelledby': 'acct-delete-h' }, h('h3', { id: 'acct-delete-h' }, 'Delete my account'));
  const body = h('div', { id: 'delete-body' });
  box.append(body);

  let seq = 0;
  let own = false;
  async function paint(): Promise<void> {
    const my = ++seq;
    const { client, session } = await ctx.accountApi();
    if (!view.alive() || my !== seq) return;
    if (!session) { clear(body); append(body, [p('Sign in to delete an account.', 'muted')]); return; }
    const state = await client.state();
    if (!view.alive() || my !== seq) return;
    clear(body);
    const out = statusLine();
    if (state.ok && state.data.scheduledPurgeAt) {
      append(body, [
        p(`Deletion is scheduled for ${shortDate(state.data.scheduledPurgeAt)}. Until then nothing has been removed and you can cancel.`, 'notice'),
        h('div', { class: 'row' }, button('Cancel the scheduled deletion', () => {
          void (async () => {
            setStatus(out, 'Cancelling…', 'info');
            const c = await client.cancelDeletion();
            if (!c.ok) { setStatus(out, `${explain(c)} The deletion is still scheduled.`, 'error'); return; }
            own = true;
            announce(ctx);
            await paint();
            const done = statusLine();
            body.append(done);
            setStatus(done, 'The deletion is cancelled.', 'ok');
          })();
        }, { id: 'delete-cancel', class: 'btn' })),
        out,
      ]);
      return;
    }
    const password = h('input', { type: 'password', id: 'delete-password', name: 'delete-password', autocomplete: 'current-password' }) as HTMLInputElement;
    const del = button('Delete my account', () => {
      void (async () => {
        const secret = password.value;
        if (!secret) { setStatus(out, 'Enter your password to confirm.', 'error'); return; }
        del.disabled = true;
        setStatus(out, 'Scheduling the deletion…', 'info');
        try {
          const r = await client.deleteAccount(secret);
          if (!r.ok) {
            setStatus(out, r.status === 401 || r.status === 403 ? 'That password was not accepted. Nothing was scheduled.' : `${explain(r)} Nothing was scheduled.`, 'error');
            return;
          }
          own = true;
          announce(ctx);
          await paint();
        } finally {
          password.value = ''; // the password is never kept
          del.disabled = false;
        }
      })();
    }, { id: 'delete-account', class: 'btn danger' });
    append(body, [
      p(`Deleting your account is not immediate. After you confirm, nothing is removed for ${GRACE_DAYS} days, and you can cancel by signing in and pressing Cancel. When the ${GRACE_DAYS} days have passed, the account and everything the service holds about you are erased and cannot be recovered. Download your data first if you want a copy. What is kept only on this device is not touched; clear it under Privacy.`),
      field('Your password', password, 'Needed to confirm. It is sent to the service and never stored here.'),
      h('div', { class: 'row' }, del),
      out,
    ]);
  }
  void paint();
  watch(ctx, view, () => { if (own) { own = false; return; } void paint(); });
  return box;
}

// ───────────────────────────── security events ─────────────────────────────

export function eventsBlock(ctx: AppContext, view: View): HTMLElement {
  const box = h('section', { class: 'sub', id: 'acct-events', 'aria-labelledby': 'acct-events-h' }, h('h3', { id: 'acct-events-h' }, 'Security events'));
  const listBox = h('div', { id: 'events-list' });
  append(box, [p('The last 20 things that happened to the account’s sign-ins and settings.', 'muted'), listBox]);
  void (async () => {
    const { client, session } = await ctx.accountApi();
    if (!view.alive() || !session) return;
    const r = await client.securityEvents();
    if (!view.alive()) return;
    if (!r.ok) { append(listBox, [p(`The events could not be listed. ${explain(r)}`, 'error')]); return; }
    const rows = [...(Array.isArray(r.data?.events) ? r.data.events : [])].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20);
    if (!rows.length) { append(listBox, [p('Nothing has been recorded yet.', 'muted')]); return; }
    append(listBox, [h('ul', { class: 'status-list', id: 'events' }, ...rows.map((e) => h('li', {},
      h('strong', {}, eventLabel(e.kind)), h('span', { class: 'muted' }, ` · ${shortDate(e.at)}${e.deviceLabel ? ` · ${e.deviceLabel}` : ''}`))))]);
  })();
  return box;
}

// ───────────────────────────── the whole block for Settings ─────────────────────────────

/** Settings → Account, for a signed-in learner: confirmation, sessions, export, deletion, security events and the two legal links. */
export async function renderAccountDetails(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const session = await ctx.state.getSession();
  if (!view.alive() || !session) return;
  const banner = h('div', { id: 'deletion-slot' });
  mountDeletionBanner(banner, ctx, view);
  append(el, [
    banner,
    verificationBlock(ctx, view),
    sessionsBlock(ctx, view),
    exportBlock(ctx),
    deleteBlock(ctx, view),
    eventsBlock(ctx, view),
    h('p', { class: 'muted', id: 'legal-links' }, 'The ', h('a', { href: '#/terms', id: 'link-terms' }, 'Terms'), ' and the ', h('a', { href: '#/privacy', id: 'link-privacy-policy' }, 'Privacy Policy'), ' (drafts).'),
  ]);
}
