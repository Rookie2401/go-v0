/**
 * #/account — the learner's account, reached from the person icon beside the Settings cog, in the home's look (the owner, 2026-11-18): the
 * hero (app.ts: "Your account" between gold rules, the title, the photo of the language being reviewed), then the home's column of warm tiles
 * with no outline.
 *
 *   Name, Email      one tile of facts: the name, editable in place; the address, and only while it is unconfirmed, the note and "send again"
 *   Sign out, Download my data, Delete account   a tile each, like the home's Review Deck; Delete opens the guided deletion below it
 *   Devices signed in   a closed dropdown
 *   Your Account Settings   the language list and setup link at the foot
 *
 * The deletion walks through what happens (nothing for 14 days), how to restore the account in that time (sign in and press Cancel), then asks
 * for the password and deletes. While a deletion is pending the banner with its Cancel sits at the top. Nothing here says learner ids, session
 * expiries or security events: those are the developer's (#/developer).
 *
 * Without an account: on a device-only copy, the offer to keep progress across devices and "Clear local data", followed by the languages; on the
 * hosted copy, the way to sign in.
 */
import { icon, type IconName } from '../icons';
import type { AppContext } from '../context';
import { append, button, clear, field, h, p, setStatus, shortDate, statusLine } from '../dom';
import { enrolmentName } from '../enrolmentName';
import { attachRipple } from '../ripple';
import { ACCOUNT_CHANGED, dataFilename, explainAccountFailure, GRACE_DAYS, mountDeletionBanner, saveFile, sessionsBlock } from './accountSecurity';
import type { View } from './view';

/** A label in the home's manner: the kicker, the title, the caption under it. */
const tileLabel = (kicker: string | null, title: string, caption?: string, captionLang?: string): HTMLElement =>
  h('span', { class: 'deck-label' },
    kicker ? h('span', { class: 'deck-kicker' }, kicker) : null,
    h('span', { class: 'deck-title' }, title),
    caption ? h('span', { class: 'deck-caption', ...(captionLang ? { lang: captionLang } : {}) }, caption) : null);

async function languageSettings(ctx: AppContext, view: View): Promise<HTMLElement | undefined> {
  const [list, id, { languagesOf }, { packFor }] = await Promise.all([
    ctx.enrolments().catch(() => []), ctx.identity().catch(() => undefined),
    import('../languageChoices'), import('../../../language-packs/src/registry'),
  ]);
  if (!view.alive()) return;
  const catalogue = languagesOf();
  const active = list.find((e) => e.enrolmentId === id?.enrolmentId) ?? list[0];
  const ordered = active ? [active, ...list.filter((e) => e !== active)] : [];
  const groups = new Map<string, typeof list>();
  for (const e of ordered) {
    const parent = catalogue.find((l) => l.languageId === e.languageId || l.choice?.options.some((o) => o.languageId === e.languageId));
    const key = parent?.languageId ?? e.languageId;
    const group = groups.get(key);
    if (group) group.push(e);
    else groups.set(key, [e]);
  }

  type Enrolment = (typeof list)[number];
  const activate = async (e: Enrolment): Promise<boolean> => e === active || await ctx.setLanguage(e.enrolmentId);
  const boxes = Array.from(groups, ([key, members]) => {
    const language = catalogue.find((l) => l.languageId === key);
    const reviewing = members.some((e) => e === active);
    const label = (name: string, status?: string): HTMLElement => h('span', { class: 'deck-label' },
      status ? h('span', { class: 'deck-kicker' }, status) : null,
      h('span', { class: 'deck-title account-language-name' }, name,
        language?.nativeName ? h('small', { lang: key, dir: 'auto' }, ` (${language.nativeName})`) : null));
    const choice = language?.choice;
    const deck = reviewing ? 'current' : 'language';
    if (!language || !choice) {
      const e = members[0]!;
      const face = button('', () => { void activate(e).then((ok) => { if (ok && view.alive()) ctx.go('review'); }); },
        { class: 'deck-face', 'data-enrolment': e.enrolmentId, ...(reviewing ? { 'aria-current': 'true' } : {}) });
      face.append(label(language?.name ?? enrolmentName(e, list), reviewing ? 'Reviewing now' : undefined), icon(ctx.deps.doc, 'arrow'));
      const tile = h('div', { class: 'deck-tile account-language', 'data-deck': deck }, face);
      attachRipple(tile);
      return tile;
    }

    const status = statusLine();
    const rows: HTMLElement[] = [];
    const matched = new Set<Enrolment>();
    let selecting = false;
    function track(name: string, existing?: Enrolment, target?: { languageId: string; varietyId: string }): HTMLElement {
      const current = existing === active && !!existing;
      const control = button('', () => {
        void (async () => {
          if (selecting) return;
          selecting = true;
          control.disabled = true;
          try {
            if (existing) {
              if (!(await activate(existing))) {
                if (view.alive()) setStatus(status, 'This track could not be opened. Try again.', 'error');
                return;
              }
            } else if (target) {
              const result = await ctx.chooseLanguage({ ...target, keepOtherVarieties: true });
              if (!result.ok) {
                if (view.alive()) setStatus(status, result.message, 'error');
                return;
              }
            }
            if (view.alive()) ctx.go('review');
          } finally {
            selecting = false;
            control.disabled = false;
          }
        })();
      }, { class: 'account-language-row', disabled: !existing && !target,
        'data-enrolment': existing?.enrolmentId, ...(current ? { 'aria-current': 'true' } : {}) });
      control.append(h('span', {}, name), h('small', {}, current ? 'Reviewing now' : existing ? '' : target ? 'Add track' : 'Unavailable'));
      return h('li', {}, control);
    }

    const options = key === 'he' || key === 'el' ? [...choice.options].reverse() : choice.options;
    for (const option of options) {
      const pack = packFor(option.languageId);
      const existing = members.find((e) => e.languageId === option.languageId &&
        (choice.kind === 'standard' || (e.varietyId ?? pack?.varietyId) === option.varietyId));
      if (existing) matched.add(existing);
      const name = option.label.replace(/\s*\(default\)$/u, '');
      const title = name.endsWith(` ${language.name}`) ? name.slice(0, -language.name.length - 1) : name;
      const target = option.varietyId && pack?.status === 'installable' && pack.varieties.some((v) => v.varietyId === option.varietyId && v.analysed)
        ? { languageId: option.languageId, varietyId: option.varietyId } : undefined;
      if (existing || target) rows.push(track(title, existing, target));
      if (key === 'he' && option.id === 'he-bib' && !choice.options.some((o) => /medieval/i.test(o.label))) rows.push(track('Medieval'));
    }
    for (const e of members) {
      if (!matched.has(e)) rows.push(track(enrolmentName(e, list), e));
    }
    const summary = h('summary', { class: 'deck-face' }, label(language.name, reviewing ? 'Reviewing now' : undefined),
      h('span', { class: 'account-language-caret', 'aria-hidden': 'true' }, '▾'));
    return h('details', { class: 'deck-tile account-language account-language-disclosure', 'data-deck': deck },
      summary, h('ul', { class: 'account-language-list', 'aria-label': `${language.name} tracks` }, ...rows), status);
  });
  return h('section', { class: 'account-group', id: 'account-languages', 'aria-labelledby': 'account-settings-h' },
    h('h3', { class: 'tiles-heading', id: 'account-settings-h' }, 'Your Account Settings'),
    ...boxes,
    h('a', { class: 'home-link', id: 'add-language', href: '#/setup' }, list.length ? 'Add a language' : 'Choose your language'));
}

/** One of the account's actions as a tile, like the home's Review Deck: an icon, a title and its caption, the arrow. Keeps the button (and its id). */
function actionTile(ctx: AppContext, action: HTMLButtonElement, glyph: IconName, caption: string, deck: string): HTMLElement {
  const title = action.textContent ?? '';
  action.className = 'deck-face';
  action.replaceChildren(h('span', { class: 'deck-row' }, icon(ctx.deps.doc, glyph), tileLabel(null, title, caption)), icon(ctx.deps.doc, 'arrow'));
  const tile = h('div', { class: 'deck-tile account-action', 'data-deck': deck }, action);
  attachRipple(tile);
  return tile;
}

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const session = await ctx.state.getSession();
  const mode = await ctx.mode();
  if (!view.alive()) return;
  // the home's column: tiles with no outline, one under the other (styles.css, "#/account in the home's look")
  const card = h('section', { class: 'home account-page', id: 'account-card', 'aria-labelledby': 'account-h' }, h('h2', { id: 'account-h', class: 'sr' }, 'Account'));
  el.append(card);
  const settings = mode !== 'none' ? languageSettings(ctx, view) : undefined;

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
      }, { id: 'clear-local', class: 'account-link' });
      clearBtn.addEventListener('blur', () => { if (armed) { armed = false; clearBtn.textContent = 'Clear local data'; setStatus(clearOut, 'Nothing was cleared.', 'info'); } });
      append(card, [
        h('div', { class: 'deck-tile account-panel', id: 'account-device' },
          h('p', { class: 'deck-kicker', id: 'settings-device-only' }, 'On this device only'),
          p('Your reviews and drafts are kept on this device, and nothing is sent anywhere. An account is optional; it only keeps your progress across devices.', 'account-lede'),
          h('div', { class: 'account-panel-actions' },
            h('a', { class: 'account-pill', href: '#/signin', id: 'settings-keep-progress' }, 'Keep your progress across devices'), clearBtn),
          clearOut),
      ]);
    } else {
      append(card, [h('div', { class: 'deck-tile account-panel' },
        h('p', { class: 'deck-kicker' }, 'Not signed in'),
        h('div', { class: 'account-panel-actions' }, h('a', { class: 'account-pill', href: '#/signin' }, 'Sign in')))]);
    }
    const languages = await settings;
    if (languages && view.alive()) card.append(languages);
    return;
  }

  const status = statusLine();
  status.id = 'account-status';
  const banner = h('div', { id: 'deletion-slot' });
  const repaintBanner = mountDeletionBanner(banner, ctx, view);

  // ── name: shown, and editable in place
  const nameText = h('span', { id: 'account-name' }, '…');
  const nameEdit = button('Edit', () => openNameEditor(), { class: 'account-link', id: 'account-name-edit' });
  const nameRow = h('dd', { class: 'account-name-row account-profile-fact account-name-fact' }, nameText, ' ', nameEdit);
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
    }, { class: 'account-pill small', id: 'account-name-save' });
    const cancel = button('Cancel', () => { editor.replaceWith(nameRow); }, { class: 'account-link', id: 'account-name-cancel' });
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
  }, { id: 'verification-resend', class: 'account-link' });
  resend.hidden = true;
  const verifyNote = h('p', { class: 'muted help', id: 'verification-note', hidden: true });
  const verifyOut = statusLine();
  const emailRow = h('dd', { id: 'acct-verification', class: 'account-profile-fact account-email-fact' }, emailLine, verifyNote, resend, verifyOut);

  // ── the plain actions
  const signOut = button('Sign out', () => {
    void (async () => {
      const r = await ctx.signOut({ forget: false });
      if (r.pendingLeft) setStatus(status, `${r.pendingLeft} event(s) could not be sent and stay on this device under your account.`, 'info');
      // back to the device alone where there is one (nothing was removed); the hosted copy has nothing to show without an account
      ctx.go((await ctx.mode()) === 'device' ? 'review' : 'signin');
    })();
  }, { id: 'sign-out' });
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
  }, { id: 'export-data' });
  const deleteOpen = button('Delete account', () => { void openDeletion(); }, { id: 'delete-open' });
  // a tile each, like the home's Review Deck (the delete tile hides with its button while the deletion is open: styles.css)
  const actions = h('div', { class: 'account-group account-actions', 'aria-label': 'Account actions' },
    actionTile(ctx, signOut, 'sign-out', 'Your reviews stay on your account', 'action'),
    actionTile(ctx, download, 'download', 'Everything held about you, as one file', 'action'),
    actionTile(ctx, deleteOpen, 'trash', `Erased after ${GRACE_DAYS} days; you can cancel until then`, 'danger'));

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

  // ── the devices signed in, out of the way (the owner's request of 2026-10-28: no "remove this device's data" link; Sign out is the one exit)
  // a closed dropdown at the foot, like the sign-in page's welcome: a tile's kicker with a gold caret
  const devices = h('details', { class: 'signin-about account-devices', id: 'acct-devices' }, h('summary', {}, 'Devices signed in'), sessionsBlock(ctx, view));

  card.append(banner);
  append(card, [
    h('div', { class: 'deck-tile account-panel' },
      h('dl', { class: 'account-facts account-profile', 'aria-label': 'Account profile' },
        h('div', { class: 'account-fact' }, h('dt', { class: 'deck-kicker' }, icon(ctx.deps.doc, 'person'), 'Name'), nameRow),
        h('div', { class: 'account-fact' }, h('dt', { class: 'deck-kicker' }, icon(ctx.deps.doc, 'mail'), 'Email'), emailRow))),
    actions, status, h('div', { class: 'deck-tile account-panel', id: 'delete-panel' }, deleteBody), devices,
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
  await Promise.all([
    settings?.then((languages) => { if (languages && view.alive()) card.append(languages); }),
    paintState(),
  ]);
  if (!view.alive()) return;
  const onChange = (): void => { if (view.alive()) void paintState(); };
  ctx.deps.doc.addEventListener(ACCOUNT_CHANGED, onChange);
  view.onDispose(() => ctx.deps.doc.removeEventListener(ACCOUNT_CHANGED, onChange));
}
