/**
 * #/account — the learner's account, reached from the person icon beside the Settings cog. Quiet and short:
 *
 *   Name           the display name on the account (set when the account is created in GoLearn; editable here)
 *   Email          the address, and only if it is not confirmed yet, a note with "send the email again"
 *   Sign out                      plain text, no box
 *   Download my data              plain text, centred
 *   Delete account                plain red text, centred; opens the guided deletion below, nothing of it shown before
 *
 * The deletion walks through what happens (nothing for 14 days), how to restore the account in that time (sign in and press
 * Cancel), then asks for the password and deletes. While a deletion is pending the banner with its Cancel sits at the top.
 * The devices signed in to the account wait under a closed disclosure at the bottom. Nothing here says learner ids, session
 * expiries or security events: those are the developer's (#/developer).
 *
 * Without an account: on a device-only copy, the offer to keep progress across devices and "Clear local data"; on the hosted
 * copy, the way to sign in.
 */
import type { AppContext } from '../context';
import { append, button, clear, field, h, p, setStatus, shortDate, statusLine } from '../dom';
import { ACCOUNT_CHANGED, dataFilename, explainAccountFailure, GRACE_DAYS, mountDeletionBanner, saveFile, sessionsBlock } from './accountSecurity';
import type { View } from './view';

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const session = await ctx.state.getSession();
  const mode = await ctx.mode();
  const card = h('section', { class: 'card account-page', id: 'account-card', 'aria-labelledby': 'account-h' }, h('h2', { id: 'account-h', class: 'sr' }, 'Account'));
  el.append(card);

  if (!session) {
    if (mode === 'device') {
      // no account: the data is on this device. The account is offered, and clearing the device is its own deliberate step
      const clearOut = statusLine();
      let armed = false;
      const clearBtn = button('Clear local data', () => {
        void (async () => {
          if (!armed) {
            armed = true;
            clearBtn.textContent = 'Click again to clear';
            setStatus(clearOut, 'This removes your reviews, drafts, preferences and the on-device record kept on this device. An account, if you have one, is not touched. Move on to cancel.', 'info');
            return;
          }
          armed = false;
          clearBtn.textContent = 'Clear local data';
          const n = await ctx.clearLocalData();
          setStatus(clearOut, `Cleared the local data on this device (${n} row${n === 1 ? '' : 's'}).`, 'ok');
        })();
      }, { id: 'clear-local', class: 'btn' });
      clearBtn.addEventListener('blur', () => { if (armed) { armed = false; clearBtn.textContent = 'Clear local data'; setStatus(clearOut, 'Nothing was cleared.', 'info'); } });
      append(card, [
        h('p', { id: 'settings-device-only' }, 'On this device only.'),
        p('Your reviews and drafts are kept on this device, and nothing is sent anywhere. An account is optional; it only keeps your progress across devices.', 'muted'),
        h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/signin', id: 'settings-keep-progress' }, 'Keep your progress across devices (optional)'), clearBtn),
        clearOut,
      ]);
    } else append(card, [p('Not signed in.', 'muted'), h('a', { class: 'btn primary', href: '#/signin' }, 'Sign in')]);
    return;
  }

  const status = statusLine();
  status.id = 'account-status';
  const banner = h('div', { id: 'deletion-slot' });
  const repaintBanner = mountDeletionBanner(banner, ctx, view);

  // ── name: shown, and editable in place
  const nameText = h('span', { id: 'account-name' }, '…');
  const nameEdit = button('Edit', () => openNameEditor(), { class: 'linklike small', id: 'account-name-edit' });
  const nameRow = h('dd', { class: 'account-name-row' }, nameText, ' ', nameEdit);
  let currentName = '';
  function showName(name: string | undefined): void {
    currentName = name ?? '';
    nameText.textContent = name || 'No name yet';
    nameText.classList.toggle('muted', !name);
    nameEdit.textContent = name ? 'Edit' : 'Add a name';
  }
  function openNameEditor(): void {
    const input = h('input', { type: 'text', id: 'account-name-input', name: 'name', autocomplete: 'name', maxlength: 100, value: currentName, 'aria-label': 'Your name' }) as HTMLInputElement;
    const save = button('Save', () => {
      void (async () => {
        const name = input.value.trim();
        if (!name) { setStatus(status, 'Enter a name, or cancel.', 'error'); return; }
        save.disabled = true;
        const { client } = await ctx.accountApi();
        const r = await client.rename(name);
        save.disabled = false;
        if (!r.ok) {
          setStatus(status, r.status === 404 ? 'This service cannot change names yet; the name stays as it was.' : explainAccountFailure(r), 'error');
          return;
        }
        showName(name);
        editor.replaceWith(nameRow);
        setStatus(status, 'Name saved.', 'ok');
      })();
    }, { class: 'btn small', id: 'account-name-save' });
    const cancel = button('Cancel', () => { editor.replaceWith(nameRow); }, { class: 'linklike small', id: 'account-name-cancel' });
    const editor = h('dd', { class: 'account-name-edit' }, input, save, cancel);
    nameRow.replaceWith(editor);
    input.focus();
  }

  // ── email, with the confirmation note only while it is needed
  const emailLine = h('span', { id: 'verification-state' }, session.email);
  const resend = button('Send the confirmation email again', () => {
    void (async () => {
      const { client, session: s } = await ctx.accountApi();
      if (!s) return;
      setStatus(verifyOut, 'Sending…', 'info');
      const r = await client.resendVerification(s.email);
      setStatus(verifyOut, r.ok ? `If ${s.email} still needs confirming, a new email is on its way.` : explainAccountFailure(r), r.ok ? 'ok' : 'error');
    })();
  }, { id: 'verification-resend', class: 'linklike small' });
  resend.hidden = true;
  const verifyNote = h('p', { class: 'muted help', id: 'verification-note', hidden: true });
  const verifyOut = statusLine();
  const emailRow = h('dd', { id: 'acct-verification' }, emailLine, verifyNote, resend, verifyOut);

  // ── the plain actions
  const signOut = button('Sign out', () => {
    void (async () => {
      const r = await ctx.signOut({ forget: false });
      if (r.pendingLeft) setStatus(status, `${r.pendingLeft} event(s) could not be sent and stay on this device under your account.`, 'info');
      // back to the device alone where there is one (nothing was removed); the hosted copy has nothing to show without an account
      ctx.go((await ctx.mode()) === 'device' ? 'review' : 'signin');
    })();
  }, { id: 'sign-out', class: 'linklike' });
  const download = button('Download my data', () => {
    void (async () => {
      const { client, session: s } = await ctx.accountApi();
      if (!s) { setStatus(status, 'Sign in first: the download comes from your account on the service.', 'error'); return; }
      setStatus(status, 'Preparing the file…', 'info');
      const r = await client.exportData();
      if (!r.ok) { setStatus(status, explainAccountFailure(r), 'error'); return; }
      const name = dataFilename(ctx.deps.now());
      saveFile(ctx, name, new Blob([r.data], { type: 'application/json' }));
      setStatus(status, `Your data is ready: ${name}.`, 'ok');
    })();
  }, { id: 'export-data', class: 'linklike' });
  const deleteOpen = button('Delete account', () => { void openDeletion(); }, { id: 'delete-open', class: 'linklike danger' });
  const actions = h('div', { class: 'account-actions' }, signOut, download, deleteOpen);

  // ── the guided deletion, shown only once asked for
  const deleteBody = h('div', { id: 'delete-body', hidden: true });
  let pending: string | undefined;
  async function openDeletion(): Promise<void> {
    const { client } = await ctx.accountApi();
    clear(deleteBody);
    deleteBody.hidden = false;
    deleteOpen.hidden = true;
    const out = statusLine();
    if (pending) {
      append(deleteBody, [
        h('h3', {}, 'Your account is scheduled for deletion'),
        p(`Deletion is scheduled for ${shortDate(pending)}. Until then nothing has been removed and you can cancel.`, 'notice'),
        h('div', { class: 'row' }, button('Cancel the scheduled deletion', () => {
          void (async () => {
            setStatus(out, 'Cancelling…', 'info');
            const c = await client.cancelDeletion();
            if (!c.ok) { setStatus(out, `${explainAccountFailure(c)} The deletion is still scheduled.`, 'error'); return; }
            pending = undefined;
            ctx.deps.doc.dispatchEvent(new Event(ACCOUNT_CHANGED));
            clear(deleteBody);
            const done = statusLine();
            deleteBody.append(done);
            setStatus(done, 'The deletion is cancelled. Your account stays as it was.', 'ok');
            deleteOpen.hidden = false;
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
            setStatus(out, r.status === 401 || r.status === 403 ? 'That password was not accepted. Nothing was scheduled.' : `${explainAccountFailure(r)} Nothing was scheduled.`, 'error');
            return;
          }
          pending = r.data?.scheduledPurgeAt ?? 'soon';
          ctx.deps.doc.dispatchEvent(new Event(ACCOUNT_CHANGED));
          await repaintBanner();
          await openDeletion();
        } finally {
          password.value = ''; // the password is never kept
          del.disabled = false;
        }
      })();
    }, { id: 'delete-account', class: 'btn danger' });
    const keep = button('Keep my account', () => { deleteBody.hidden = true; clear(deleteBody); deleteOpen.hidden = false; }, { id: 'delete-keep', class: 'linklike' });
    append(deleteBody, [
      h('h3', {}, 'Delete your account'),
      h('ol', { class: 'steps' },
        h('li', {}, h('strong', {}, 'Nothing happens today. '), `After you confirm, your account is scheduled for deletion ${GRACE_DAYS} days from now, and everything stays as it is until then.`),
        h('li', {}, h('strong', {}, `To get it back within the ${GRACE_DAYS} days: `), 'sign in as usual and press ', h('em', {}, 'Cancel the deletion'), ' on the notice at the top. Your account then stays exactly as it was.'),
        h('li', {}, h('strong', {}, `After the ${GRACE_DAYS} days: `), 'the account and everything the service holds about you are erased and cannot be recovered. Download your data first if you want a copy. What is kept only on this device is not touched.')),
      field('Your password', password, 'Needed to confirm. It is sent to the service and never stored here.'),
      h('div', { class: 'row' }, del, keep),
      out,
    ]);
    password.focus();
  }

  // ── the devices signed in, out of the way
  // the devices signed in, out of the way; with them, the way to leave this device clean (a shared or borrowed one)
  const forget = button('Sign out and remove this device\x27s data', () => {
    void (async () => {
      await ctx.signOut({ forget: true });
      ctx.go((await ctx.mode()) === 'device' ? 'review' : 'signin');
    })();
  }, { id: 'sign-out-forget', class: 'linklike small' });
  const devices = h('details', { class: 'quiet', id: 'acct-devices' }, h('summary', {}, 'Devices signed in'), sessionsBlock(ctx, view),
    h('p', { class: 'muted help' }, 'On a shared or borrowed device: ', forget, '. It also deletes the local copy of your events and any events that could not be sent.'));

  append(card, [
    banner,
    h('dl', { class: 'account-facts' }, h('dt', {}, 'Name'), nameRow, h('dt', {}, 'Email'), emailRow),
    actions, status, deleteBody, devices,
  ]);

  // what the service says about the account: the name, whether the email is confirmed, whether a deletion is pending
  async function paintState(): Promise<void> {
    const { client, session: s } = await ctx.accountApi();
    if (!view.alive() || !s) return;
    const r = await client.state();
    if (!view.alive()) return;
    if (!r.ok) { showName(undefined); emailLine.setAttribute('data-state', 'unknown'); return; }
    showName(r.data.name);
    pending = r.data.scheduledPurgeAt;
    if (r.data.verified === true) {
      emailLine.setAttribute('data-state', 'verified');
      verifyNote.hidden = true; resend.hidden = true;
    } else if (r.data.verified === false) {
      emailLine.setAttribute('data-state', 'unverified');
      verifyNote.textContent = 'Not confirmed yet. Open the link in the email we sent; until it is confirmed, signing in works for a limited time only.';
      verifyNote.hidden = false; resend.hidden = false;
    } else {
      emailLine.setAttribute('data-state', 'unknown');
      verifyNote.hidden = true; resend.hidden = true;
    }
  }
  await paintState();
  const onChange = (): void => { if (view.alive()) void paintState(); };
  ctx.deps.doc.addEventListener(ACCOUNT_CHANGED, onChange);
  view.onDispose(() => ctx.deps.doc.removeEventListener(ACCOUNT_CHANGED, onChange));
}
