// @vitest-environment jsdom
/**
 * #/account (packages/goreview/app/screens/account.ts): the person icon beside the Settings cog leads there; the page shows the name and the
 * email, then Sign out, Download my data and Delete account as plain text (the last one red); nothing of the learner id or the session
 * expiry; the deletion is a guided step that appears only when asked for; the name can be set in place. Settings no longer carries the
 * account, the service address, the synchronisation counters or the diagnostics: those are #/developer, behind the quiet line at its foot.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { FakeAccountService } from '../golearn-app/accountFake';
import { destroyRigs, flush, makeRig, type, until } from './helpers';

afterEach(() => { destroyRigs(); });
const click = async (el: Element | null | undefined): Promise<void> => { if (!el) throw new Error('nothing to click'); (el as HTMLElement).click(); await flush(4); };

describe('the account page', () => {
  it('is reached from the person icon beside the Settings cog, and the icon marks the page while it is open', async () => {
    const acct = new FakeAccountService();
    const rig = await makeRig({ signedIn: true, fetch: acct.fetch });
    const link = rig.q<HTMLAnchorElement>('header #header-account');
    expect(link.getAttribute('href')).toBe('#/account');
    expect(link.getAttribute('aria-label')).toBe('Account');
    expect(link.querySelector('svg circle')).not.toBeNull(); // the person: a head over shoulders, like Biblia's
    expect(link.nextElementSibling?.id).toBe('settings-link');
    await rig.go('account');
    expect(rig.q('main h1').textContent).toBe('Account');
    expect(rig.q('header #header-account').getAttribute('aria-current')).toBe('page');
    expect(rig.root.querySelector('#back-home')).toBeNull(); // the Go mark in the top bar is the way home
  });

  it('shows name and email, then Sign out, Download my data and a red Delete account as plain text; no ids, no expiry, no boxes', async () => {
    const acct = new FakeAccountService();
    acct.name = 'Ana';
    acct.reportVerified = true; acct.verified = true;
    const rig = await makeRig({ signedIn: true, fetch: acct.fetch });
    await rig.go('account');
    await until(() => rig.q('#account-name').textContent === 'Ana', 'the name from the service');
    const facts = rig.q('.account-facts');
    expect([...facts.querySelectorAll('dt')].map((d) => d.textContent)).toEqual(['Name', 'Email']);
    expect(rig.q('#verification-state').textContent).toBe('ana@example.org');
    expect(rig.q('#verification-state').getAttribute('data-state')).toBe('verified');
    expect(rig.q<HTMLElement>('#verification-resend').hidden).toBe(true);
    const text = rig.q('#account-card').textContent ?? '';
    expect(text).not.toMatch(/Learner [0-9a-f-]{8}/);
    expect(text).not.toMatch(/session until/i);
    const actions = [...rig.q('.account-actions').querySelectorAll('button')];
    expect(actions.map((b) => b.id)).toEqual(['sign-out', 'export-data', 'delete-open']);
    expect(actions.map((b) => b.textContent)).toEqual(['Sign out', 'Download my data', 'Delete account']);
    // friendly pills, not underlined text (the owner, 2026-10-28); Delete account keeps its red
    for (const b of actions) expect(b.classList.contains('btn') && b.classList.contains('friendly'), b.id).toBe(true);
    expect(rig.root.querySelector('.account-actions .linklike')).toBeNull();
    expect(rig.q('#delete-open').classList.contains('danger')).toBe(true);
    expect(rig.q('#account-name-edit').classList.contains('friendly')).toBe(true);
    // there is no "remove this device's data" link anywhere on the page: Sign out is the one exit
    expect(rig.root.querySelector('#sign-out-forget')).toBeNull();
    expect(rig.q('#account-card').textContent).not.toContain('remove this device');
    // nothing of the deletion is on the page before it is asked for; the devices wait under a closed disclosure
    expect(rig.q<HTMLElement>('#delete-body').hidden).toBe(true);
    expect(rig.q('#delete-body').textContent).toBe('');
    expect(rig.q<HTMLDetailsElement>('#acct-devices').open).toBe(false);
    expect(rig.q('#acct-devices summary').textContent).toBe('Devices signed in');
  });

  it('an unconfirmed address gets the note and the resend link; the name can be added in place and is sent to the service', async () => {
    const acct = new FakeAccountService();
    acct.reportVerified = true; acct.verified = false;
    const rig = await makeRig({ signedIn: true, fetch: acct.fetch });
    await rig.go('account');
    await until(() => rig.q('#verification-state').getAttribute('data-state') === 'unverified', 'the state');
    expect(rig.q<HTMLElement>('#verification-note').hidden).toBe(false);
    expect(rig.q<HTMLElement>('#verification-resend').hidden).toBe(false);
    expect(rig.q('#account-name').textContent).toBe('No name yet');
    expect(rig.q('#account-name-edit').textContent).toBe('Add a name');
    await click(rig.q('#account-name-edit'));
    type(rig.q<HTMLInputElement>('#account-name-input'), 'Ana Lima');
    await click(rig.q('#account-name-save'));
    await until(() => rig.q('#account-name').textContent === 'Ana Lima', 'the saved name');
    expect(acct.last('POST', '/me/profile')!.body).toEqual({ displayName: 'Ana Lima' });
    expect(acct.name).toBe('Ana Lima');
    expect(rig.q('#account-status').textContent).toBe('Name saved.');
    expect(rig.q('#account-name-edit').textContent).toBe('Edit');
  });

  it('Delete account opens the guided step: what happens, how to restore within 14 days, the password; Keep my account closes it', async () => {
    const acct = new FakeAccountService();
    acct.password = 'correct-horse-battery';
    const rig = await makeRig({ signedIn: true, fetch: acct.fetch });
    await rig.go('account');
    await until(() => !!rig.root.querySelector('#delete-open'), 'the link');
    await click(rig.q('#delete-open'));
    expect(rig.q<HTMLElement>('#delete-body').hidden).toBe(false);
    expect(rig.q<HTMLElement>('#delete-open').hidden).toBe(true);
    const steps = [...rig.q('#delete-body .steps').querySelectorAll('li')].map((li) => li.textContent ?? '');
    expect(steps).toHaveLength(3);
    expect(steps[0]).toContain('14 days');
    expect(steps[1]).toContain('Cancel the deletion');
    expect(steps[2]).toContain('cannot be recovered');
    expect(rig.q('#delete-account').classList.contains('danger')).toBe(true);
    await click(rig.q('#delete-keep'));
    expect(rig.q<HTMLElement>('#delete-body').hidden).toBe(true);
    expect(rig.q<HTMLElement>('#delete-open').hidden).toBe(false);
    expect(acct.count('DELETE', '/me')).toBe(0);
  });
});

describe('Settings without the analytics', () => {
  it('keeps the preferences and the links and nothing of the account, the service address, the sync counters or the diagnostics; the developer line leads to them', async () => {
    const acct = new FakeAccountService();
    const rig = await makeRig({ signedIn: true, fetch: acct.fetch });
    await rig.go('settings');
    expect(rig.q('#settings-prefs')).toBeTruthy();
    for (const gone of ['#settings-account', '#settings-service', '#settings-sync', '#settings-diagnostics', '#acct-events', '#acct-sessions', '#sign-out']) expect(rig.root.querySelector(gone), gone).toBeNull();
    expect(rig.q<HTMLAnchorElement>('#link-developer').getAttribute('href')).toBe('#/developer');
    await rig.go('developer');
    expect(rig.q('main h1').textContent).toBe('Developer');
    await until(() => !!rig.root.querySelector('#diagnostics dt'), 'the diagnostics');
    for (const there of ['#settings-sync', '#settings-diagnostics', '#sync-now']) expect(rig.root.querySelector(there), there).not.toBeNull();
    for (const gone of ['#settings-service', '#settings-svc-url']) expect(rig.root.querySelector(gone), gone).toBeNull(); // no way to change the service address (2026-10-28)
    expect(rig.q('#diagnostics').textContent).toContain('Session until');
  });
});
