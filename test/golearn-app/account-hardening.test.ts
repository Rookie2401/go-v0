// @vitest-environment jsdom
/**
 * Account hardening in the setup application, against a fake of the service contract (test/golearn-app/accountFake.ts):
 * sign-up → check your email, #/verify and #/reset from the emailed links, forgot password, an unverified sign-in, sessions and revoking,
 * the data download, deleting with a grace period and cancelling, the pending-deletion banner, security events, and the legal pages.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { auditDom } from '../audit/a11y.support';
import { FakeAccountService } from './accountFake';
import { choose, destroyRigs, flush, makeRig, readBlob, signIn, submit, type, until, type Rig } from './helpers';

afterEach(() => destroyRigs());

const account = (): FakeAccountService => new FakeAccountService();

/** Follow a link from an email: the hash changes in the running page. */
async function openLink(rig: Rig, hash: string): Promise<void> {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await rig.app.ready();
  await flush(10);
}

const clickThrough = async (el: Element): Promise<void> => { (el as HTMLElement).click(); await flush(15); };

describe('sign-up', () => {
  it('shows “check your email” after the account is created, with a resend, and says the Terms and Privacy Policy are accepted', async () => {
    const acct = account();
    const rig = await makeRig({ fetch: acct.fetch });
    await rig.go('signin');
    choose(rig.q('#acct-mode'), 'create');
    expect(rig.q('#terms-note').hidden).toBe(false);
    expect(rig.q('#terms-note').textContent).toBe('By creating an account you accept the Terms and the Privacy Policy.');
    expect(rig.q<HTMLAnchorElement>('#terms-note #link-terms').getAttribute('href')).toBe('#/terms');
    expect(rig.q<HTMLAnchorElement>('#terms-note #link-privacy').getAttribute('href')).toBe('#/privacy');
    await signIn(rig, 'new@example.org', 'a long enough password', true);
    expect(rig.q('#flash').textContent).toMatch(/Account created and signed in as new@example.org.*Check your email/);
    expect(rig.q('#check-email').textContent).toContain('We sent a link to new@example.org');
    await clickThrough(rig.q('#check-email-resend'));
    expect(acct.last('POST', '/accounts/verify/resend')!.body).toEqual({ email: 'new@example.org' });
    expect(rig.q('#check-email .status').textContent).toMatch(/a new email is on its way/);
    // the notice is shown once
    await rig.go('home');
    await rig.go('languages');
    expect(rig.root.querySelector('#check-email')).toBeNull();
  });

  it('records that the Terms and Privacy Policy were accepted as a ConsentGiven event', async () => {
    const rig = await makeRig({ fetch: account().fetch });
    await signIn(rig, 'new@example.org', 'a long enough password', true);
    await flush(30);
    const rows = Object.entries(await rig.area.get(null)).filter(([k]) => k.startsWith('golearn:event:')).map(([, v]) => v as { kind: string; payload: { scope?: string; version?: string } });
    const consent = rows.find((r) => r.kind === 'ConsentGiven' && r.payload.scope === 'terms-and-privacy');
    expect(consent?.payload.version).toMatch(/^draft-/);
  });

  it('says honestly when the service could not send the email', async () => {
    const rig = await makeRig({ fetch: account().fetch });
    rig.service.verificationSent = false;
    await signIn(rig, 'new@example.org', 'a long enough password', true);
    expect(rig.q('#check-email').textContent).toContain('could not send the confirmation email');
  });

  it('a plain sign-in shows no check-your-email notice and no terms line', async () => {
    const rig = await makeRig({ fetch: account().fetch });
    await rig.go('signin');
    expect(rig.q('#terms-note').hidden).toBe(true);
    await signIn(rig);
    expect(rig.root.querySelector('#check-email')).toBeNull();
  });
});

describe('#/verify', () => {
  it('confirms the address from the link, takes the token out of the address bar and continues to the languages page', async () => {
    const acct = account();
    const rig = await makeRig({ fetch: acct.fetch, startRoute: 'verify?token=good-verify' });
    await until(() => rig.root.querySelector('#verify-ok'));
    expect(rig.q('#verify-ok').textContent).toBe('Your email address is confirmed.');
    expect(acct.last('POST', '/accounts/verify')!.body).toEqual({ token: 'good-verify' });
    expect(acct.last('POST', '/accounts/verify')!.auth).toBeUndefined();
    expect(window.location.hash).toBe('#/verify');
    expect(rig.q<HTMLAnchorElement>('#verify-continue').getAttribute('href')).toBe('#/languages');
    expect(acct.verified).toBe(true);
    expect(rig.q('#page-title').textContent).toBe('Confirm your email');
  });

  it('a link that did not work says so and offers a new email and a field for the code', async () => {
    const acct = account();
    const rig = await makeRig({ fetch: acct.fetch, startRoute: 'verify?token=stale' });
    await until(() => rig.root.querySelector('#verify-failed'));
    expect(rig.q('#verify-failed').textContent).toContain('expired or was already used');
    expect(rig.root.querySelector('#verify-ok')).toBeNull();
    // paste a good code
    type(rig.q('#verify-token'), 'good-verify');
    rig.q('#verify-submit').click();
    await until(() => rig.root.querySelector('#verify-ok'));
    expect(acct.verified).toBe(true);
  });

  it('asks for a new email for any address and answers the same way', async () => {
    const acct = account();
    const rig = await makeRig({ fetch: acct.fetch, startRoute: 'verify' });
    await until(() => rig.root.querySelector('#verify-resend'));
    rig.q('#verify-resend').click();
    await flush(10);
    expect(rig.q('#verify-more').textContent).toContain('Enter a valid email address');
    type(rig.q('#verify-email'), 'someone@example.org');
    rig.q('#verify-resend').click();
    await until(() => /a new email is on its way/.test(rig.text()));
    expect(acct.last('POST', '/accounts/verify/resend')!.body).toEqual({ email: 'someone@example.org' });
  });

  it('an unreachable service is said plainly and confirms nothing', async () => {
    const acct = account();
    acct.down = true;
    const rig = await makeRig({ fetch: acct.fetch, startRoute: 'verify?token=good-verify' });
    await until(() => rig.root.querySelector('#verify-failed'));
    expect(rig.q('#verify-failed').textContent).toContain('could not be reached');
    expect(acct.verified).toBe(false);
  });

  it('an empty field asks for the code', async () => {
    const rig = await makeRig({ fetch: account().fetch, startRoute: 'verify' });
    await until(() => rig.root.querySelector('#verify-submit'));
    rig.q('#verify-submit').click();
    await flush(10);
    expect(rig.q('#verify-token').closest('section')!.textContent).toContain('Paste the code first');
  });
});

describe('#/reset', () => {
  it('fills the token from the link, checks the two passwords, changes the password and leads to sign-in', async () => {
    const acct = account();
    const rig = await makeRig({ fetch: acct.fetch, startRoute: 'reset?token=good-reset' });
    await until(() => rig.root.querySelector('#reset-form'));
    expect(rig.q<HTMLInputElement>('#reset-token').value).toBe('good-reset');
    expect(window.location.hash).toBe('#/reset');
    type(rig.q('#reset-password'), 'short');
    type(rig.q('#reset-password-again'), 'short');
    submit(rig.q('#reset-form'));
    await flush(10);
    expect(rig.q('#reset-form .status').textContent).toMatch(/at least 10/);
    type(rig.q('#reset-password'), 'a brand new password');
    type(rig.q('#reset-password-again'), 'a different password');
    submit(rig.q('#reset-form'));
    await flush(10);
    expect(rig.q('#reset-form .status').textContent).toMatch(/not the same/);
    expect(acct.count('POST', '/accounts/password/reset')).toBe(0);
    type(rig.q('#reset-password-again'), 'a brand new password');
    submit(rig.q('#reset-form'));
    await until(() => rig.root.querySelector('#reset-ok'));
    expect(acct.last('POST', '/accounts/password/reset')!.body).toEqual({ token: 'good-reset', password: 'a brand new password' });
    expect(acct.password).toBe('a brand new password');
    expect(rig.q<HTMLAnchorElement>('#reset-signin').getAttribute('href')).toBe('#/signin');
    expect(rig.q<HTMLInputElement>('#reset-password').value).toBe('');
    expect(JSON.stringify(await rig.area.get(null))).not.toContain('a brand new password');
  });

  it('signs this device out too: the service ended every session', async () => {
    const acct = account();
    const rig = await makeRig({ fetch: acct.fetch });
    await signIn(rig);
    expect(await rig.app.ctx.state.getSession()).toBeDefined();
    await openLink(rig, '#/reset?token=good-reset');
    type(rig.q('#reset-password'), 'a brand new password');
    type(rig.q('#reset-password-again'), 'a brand new password');
    submit(rig.q('#reset-form'));
    await until(() => rig.root.querySelector('#reset-ok'));
    expect(await rig.app.ctx.state.getSession()).toBeUndefined();
  });

  it('a link that has expired says so, keeps the form and changes nothing', async () => {
    const acct = account();
    const rig = await makeRig({ fetch: acct.fetch, startRoute: 'reset?token=stale' });
    await until(() => rig.root.querySelector('#reset-form'));
    type(rig.q('#reset-password'), 'a brand new password');
    type(rig.q('#reset-password-again'), 'a brand new password');
    submit(rig.q('#reset-form'));
    await until(() => /expired or was already used/.test(rig.q('#reset-form .status').textContent ?? ''));
    expect(rig.root.querySelector('#reset-ok')).toBeNull();
    expect(acct.password).toBe('correct horse battery');
    // the code can also be pasted
    type(rig.q('#reset-token'), 'good-reset');
    type(rig.q('#reset-password'), 'a brand new password');
    type(rig.q('#reset-password-again'), 'a brand new password');
    submit(rig.q('#reset-form'));
    await until(() => rig.root.querySelector('#reset-ok'));
  });
});

describe('forgot password', () => {
  it('asks for the email and always answers “if that address has an account, an email is on its way”', async () => {
    const acct = account();
    const rig = await makeRig({ fetch: acct.fetch });
    await rig.go('signin');
    type(rig.q('#acct-email'), 'ana@example.org');
    const details = rig.q<HTMLDetailsElement>('#forgot');
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    expect(rig.q<HTMLInputElement>('#forgot-email').value).toBe('ana@example.org');
    rig.q('#forgot-submit').click();
    await until(() => rig.q('#forgot .status').textContent);
    expect(rig.q('#forgot .status').textContent).toBe('If that address has an account, an email is on its way.');
    expect(acct.last('POST', '/accounts/password/forgot')!.body).toEqual({ email: 'ana@example.org' });
    // an address the service has never heard of gets the same words
    type(rig.q('#forgot-email'), 'nobody@example.org');
    acct.failNext.set('POST /accounts/password/forgot', { status: 404 });
    rig.q('#forgot-submit').click();
    await until(() => acct.count('POST', '/accounts/password/forgot') === 2);
    await flush(10);
    expect(rig.q('#forgot .status').textContent).toBe('If that address has an account, an email is on its way.');
  });

  it('refuses an invalid address before any request and says when the service is unreachable', async () => {
    const acct = account();
    const rig = await makeRig({ fetch: acct.fetch });
    await rig.go('signin');
    type(rig.q('#forgot-email'), 'not-an-email');
    rig.q('#forgot-submit').click();
    await flush(10);
    expect(rig.q('#forgot .status').textContent).toMatch(/valid email/);
    expect(acct.count('POST', '/accounts/password/forgot')).toBe(0);
    acct.down = true;
    type(rig.q('#forgot-email'), 'ana@example.org');
    rig.q('#forgot-submit').click();
    await until(() => /could not be reached/.test(rig.q('#forgot .status').textContent ?? ''));
  });
});

describe('an unverified sign-in', () => {
  it('explains that the address must be confirmed and offers the email again', async () => {
    const acct = account();
    const rig = await makeRig({ fetch: acct.fetch });
    rig.service.accounts.set('ana@example.org', { password: 'right password!', learnerId: 'l1', email: 'ana@example.org' });
    rig.service.unverified.add('ana@example.org');
    await rig.go('signin');
    type(rig.q('#acct-email'), 'ana@example.org');
    type(rig.q('#acct-password'), 'right password!');
    submit(rig.q('#acct-form'));
    await until(() => /Confirm your email address first/.test(rig.q('#acct-form .status').textContent ?? ''));
    expect(rig.q('#acct-form .status').getAttribute('data-kind')).toBe('error');
    expect(await rig.app.ctx.state.getSession()).toBeUndefined();
    await clickThrough(rig.q('#unverified-resend'));
    expect(acct.last('POST', '/accounts/verify/resend')!.body).toEqual({ email: 'ana@example.org' });
    expect(rig.q('#unverified-notice .status').textContent).toMatch(/a new email is on its way/);
  });

  it('in the extension, the worker’s refusal carries the same words and the same resend', async () => {
    const acct = account();
    const rig = await makeRig({ fetch: acct.fetch, extension: true });
    await rig.go('signin');
    // the fake worker is not wired in this rig: the page falls back to signing in itself, which the fake service refuses as unverified
    rig.service.accounts.set('ana@example.org', { password: 'right password!', learnerId: 'l1', email: 'ana@example.org' });
    rig.service.unverified.add('ana@example.org');
    type(rig.q('#acct-email'), 'ana@example.org');
    type(rig.q('#acct-password'), 'right password!');
    submit(rig.q('#acct-form'));
    await until(() => rig.root.querySelector('#unverified-resend'), 8000);
  });
});

describe('Settings → account', () => {
  it('shows the verification state: not confirmed (with a resend), confirmed, and not reported', async () => {
    const acct = account();
    const rig = await makeRig({ fetch: acct.fetch });
    await signIn(rig);
    await rig.go('settings');
    await until(() => rig.q('#verification-state').getAttribute('data-state'));
    expect(rig.q('#verification-state').getAttribute('data-state')).toBe('unverified');
    expect(rig.q('#verification-state').textContent).toContain('ana@example.org is not confirmed yet');
    await clickThrough(rig.q('#verification-resend'));
    expect(acct.last('POST', '/accounts/verify/resend')!.body).toEqual({ email: 'ana@example.org' });
    expect(rig.q('#acct-verification .status').textContent).toMatch(/a new email is on its way/);

    acct.verified = true;
    await rig.go('home');
    await rig.go('settings');
    await until(() => rig.q('#verification-state').getAttribute('data-state'));
    expect(rig.q('#verification-state').getAttribute('data-state')).toBe('verified');
    expect(rig.q('#verification-resend').hidden).toBe(true);

    acct.reportVerified = false;
    await rig.go('home');
    await rig.go('settings');
    await until(() => rig.q('#verification-state').getAttribute('data-state'));
    expect(rig.q('#verification-state').getAttribute('data-state')).toBe('unknown');
  });

  it('has no account block while nobody is signed in', async () => {
    const rig = await makeRig({ fetch: account().fetch });
    await rig.go('settings');
    expect(rig.root.querySelector('#acct-sessions')).toBeNull();
    expect(rig.root.querySelector('#acct-delete')).toBeNull();
  });

  it('lists the sessions with device and last use, can end one, and can sign out everywhere else', async () => {
    const acct = account();
    const rig = await makeRig({ fetch: acct.fetch });
    await signIn(rig);
    await rig.go('settings');
    await until(() => rig.root.querySelectorAll('#sessions li').length === 3);
    const rows = [...rig.root.querySelectorAll('#sessions li')];
    expect(rows[0].textContent).toContain('This browser');
    expect(rows[0].textContent).toContain('this device');
    expect(rows[0].querySelector('button')).toBeNull(); // the current session has no revoke
    expect(rows[1].textContent).toContain('Phone');
    expect(rows[1].textContent).toContain('last used 2026-10-07 18:30 UTC');
    expect(acct.last('GET', '/me/sessions')!.auth).toMatch(/^Bearer tok-/);

    await clickThrough(rig.q('[data-revoke="s-phone"]'));
    await until(() => rig.root.querySelectorAll('#sessions li').length === 2);
    expect(acct.count('DELETE', '/me/sessions/s-phone')).toBe(1);
    expect(rig.q('#acct-sessions .status').textContent).toBe('Ended the session on Phone.');

    await clickThrough(rig.q('#sessions-revoke-others'));
    await until(() => rig.root.querySelectorAll('#sessions li').length === 1);
    expect(acct.count('DELETE', '/me/sessions')).toBe(1);
    expect(rig.root.querySelector('#sessions-revoke-others')).toBeNull();
    expect(rig.q('#acct-sessions').textContent).toContain('This is the only device signed in');
  });

  it('says what went wrong when a session cannot be ended or listed', async () => {
    const acct = account();
    const rig = await makeRig({ fetch: acct.fetch });
    await signIn(rig);
    await rig.go('settings');
    await until(() => rig.root.querySelectorAll('#sessions li').length === 3);
    acct.failNext.set('DELETE /me/sessions/s-phone', { status: 500, body: { error: 'boom', message: 'The store is busy.' } });
    await clickThrough(rig.q('[data-revoke="s-phone"]'));
    await until(() => /store is busy/.test(rig.q('#acct-sessions .status').textContent ?? ''));
    expect(rig.root.querySelectorAll('#sessions li')).toHaveLength(3);
    acct.failNext.set('GET /me/sessions', { status: 500, body: { error: 'boom', message: 'Down for a moment.' } });
    await rig.go('home');
    await rig.go('settings');
    await until(() => /could not be listed/.test(rig.q('#sessions-list').textContent ?? ''));
  });

  it('“Download my data” downloads the export as golearn-data-<date>.json with the session’s token', async () => {
    const acct = account();
    const rig = await makeRig({ fetch: acct.fetch });
    await signIn(rig);
    await rig.go('settings');
    rig.q('#acct-export #export-data').click();
    await until(() => rig.downloads.length === 1);
    expect(rig.downloads[0].filename).toBe('golearn-data-2026-10-08.json');
    expect(rig.downloads[0].blob.type).toBe('application/json');
    expect(JSON.parse(await readBlob(rig.downloads[0].blob))).toEqual(acct.exportBody);
    expect(acct.last('GET', '/me/export')!.auth).toMatch(/^Bearer tok-/);
    expect(rig.q('#acct-export .status').textContent).toBe('Your data is ready: golearn-data-2026-10-08.json.');
  });

  it('a refused or unreachable download downloads nothing and says why', async () => {
    const acct = account();
    const rig = await makeRig({ fetch: acct.fetch });
    await signIn(rig);
    await rig.go('settings');
    acct.failNext.set('GET /me/export', { status: 401, body: { error: 'unauthorized', message: '' } });
    rig.q('#acct-export #export-data').click();
    await until(() => /no longer valid/.test(rig.q('#acct-export .status').textContent ?? ''));
    acct.down = true;
    rig.q('#acct-export #export-data').click();
    await until(() => /could not be reached/.test(rig.q('#acct-export .status').textContent ?? ''));
    expect(rig.downloads).toHaveLength(0);
  });

  it('the privacy page downloads the same file', async () => {
    const acct = account();
    const rig = await makeRig({ fetch: acct.fetch });
    await signIn(rig);
    await rig.go('privacy');
    rig.q('#export-data').click();
    await until(() => rig.downloads.length === 1);
    expect(rig.downloads[0].filename).toBe('golearn-data-2026-10-08.json');
    expect(JSON.parse(await readBlob(rig.downloads[0].blob))).toEqual(acct.exportBody);
  });

  it('shows the last 20 security events, newest first, in plain words', async () => {
    const acct = account();
    acct.events = Array.from({ length: 25 }, (_, i) => ({ kind: i === 24 ? 'password-reset' : 'sign-in', at: `2026-10-${String(i + 1).padStart(2, '0')}T09:00:00.000Z`, ...(i === 24 ? {} : { deviceLabel: 'Phone' }) }));
    const rig = await makeRig({ fetch: acct.fetch });
    await signIn(rig);
    await rig.go('settings');
    await until(() => rig.root.querySelectorAll('#events li').length === 20);
    const first = rig.root.querySelector('#events li')!.textContent!;
    expect(first).toContain('Password changed with an emailed link');
    expect(first).toContain('2026-10-25 09:00 UTC');
    expect(rig.root.querySelectorAll('#events li')[1].textContent).toContain('Signed in');
    expect(rig.root.querySelectorAll('#events li')[1].textContent).toContain('Phone');
  });

  it('links to the Terms and the Privacy Policy', async () => {
    const rig = await makeRig({ fetch: account().fetch });
    await signIn(rig);
    await rig.go('settings');
    expect(rig.q<HTMLAnchorElement>('#legal-links #link-terms').getAttribute('href')).toBe('#/terms');
    expect(rig.q<HTMLAnchorElement>('#legal-links #link-privacy-policy').getAttribute('href')).toBe('#/privacy');
  });
});

describe('deleting the account', () => {
  it('needs the password, explains the 14-day grace, then shows the pending deletion with a Cancel', async () => {
    const acct = account();
    const rig = await makeRig({ fetch: acct.fetch });
    await signIn(rig, 'ana@example.org', acct.password);
    await rig.go('settings');
    await until(() => rig.root.querySelector('#delete-account'));
    expect(rig.q('#delete-body').textContent).toContain('14 days');
    expect(rig.root.querySelector('#deletion-banner')).toBeNull();
    // no password: nothing is sent
    rig.q('#delete-account').click();
    await flush(10);
    expect(rig.q('#delete-body .status').textContent).toBe('Enter your password to confirm.');
    expect(acct.count('DELETE', '/me')).toBe(0);
    // a wrong password: refused, nothing scheduled, the field is emptied
    type(rig.q('#delete-password'), 'not the password');
    rig.q('#delete-account').click();
    await until(() => /not accepted/.test(rig.q('#delete-body .status').textContent ?? ''));
    expect(rig.q('#delete-body .status').textContent).toContain('Nothing was scheduled');
    expect(rig.q<HTMLInputElement>('#delete-password').value).toBe('');
    expect(acct.scheduledPurgeAt).toBeUndefined();
    // the right one
    type(rig.q('#delete-password'), acct.password);
    rig.q('#delete-account').click();
    await until(() => rig.root.querySelector('#delete-cancel'));
    expect(acct.last('DELETE', '/me')!.body).toEqual({ password: acct.password });
    expect(acct.last('DELETE', '/me')!.auth).toMatch(/^Bearer tok-/);
    expect(rig.q('#delete-body').textContent).toContain('Deletion is scheduled for 2026-10-22 12:00 UTC');
    expect(rig.root.querySelector('#delete-account')).toBeNull();
    // the banner appears at the top of the account section, too
    await until(() => rig.root.querySelector('#deletion-banner'));
    expect(rig.q('#deletion-banner').textContent).toContain('scheduled for deletion on 2026-10-22 12:00 UTC');
    expect(JSON.stringify(await rig.area.get(null))).not.toContain(acct.password);
    // still signed in: nothing was removed
    expect(await rig.app.ctx.state.getSession()).toBeDefined();
    // cancel from the delete block
    await clickThrough(rig.q('#delete-cancel'));
    await until(() => rig.root.querySelector('#delete-account'));
    expect(acct.count('POST', '/me/delete/cancel')).toBe(1);
    expect(acct.scheduledPurgeAt).toBeUndefined();
    await until(() => !rig.root.querySelector('#deletion-banner'));
    expect(rig.q('#delete-body').textContent).toContain('The deletion is cancelled');
  });

  it('the banner’s own Cancel cancels the deletion and the delete block follows', async () => {
    const acct = account();
    const rig = await makeRig({ fetch: acct.fetch });
    await signIn(rig);
    acct.scheduledPurgeAt = acct.purgeAt;
    await rig.go('settings');
    await until(() => rig.root.querySelector('#deletion-banner'));
    await until(() => rig.root.querySelector('#delete-cancel'));
    await clickThrough(rig.q('#deletion-cancel'));
    await until(() => rig.root.querySelector('#deletion-cancelled'));
    expect(rig.q('#deletion-cancelled').textContent).toBe('The deletion is cancelled. Your account stays as it was.');
    await until(() => rig.root.querySelector('#delete-account'));
    expect(acct.scheduledPurgeAt).toBeUndefined();
  });

  it('a failed cancel says the deletion is still scheduled', async () => {
    const acct = account();
    const rig = await makeRig({ fetch: acct.fetch });
    await signIn(rig);
    acct.scheduledPurgeAt = acct.purgeAt;
    await rig.go('settings');
    await until(() => rig.root.querySelector('#deletion-banner'));
    acct.failNext.set('POST /me/delete/cancel', { status: 500, body: { error: 'boom', message: 'Try later.' } });
    await clickThrough(rig.q('#deletion-cancel'));
    await until(() => /still scheduled/.test(rig.q('#deletion-banner .status').textContent ?? ''));
    expect(acct.scheduledPurgeAt).toBe(acct.purgeAt);
  });

  it('the sign-in page shows the pending deletion after signing in, with a Cancel, and waits for the learner', async () => {
    const acct = account();
    acct.scheduledPurgeAt = acct.purgeAt;
    const rig = await makeRig({ fetch: acct.fetch });
    rig.service.accounts.set('ana@example.org', { password: acct.password, learnerId: 'l1', email: 'ana@example.org' });
    await rig.go('signin');
    expect(rig.root.querySelector('#deletion-banner')).toBeNull();
    type(rig.q('#acct-email'), 'ana@example.org');
    type(rig.q('#acct-password'), acct.password);
    submit(rig.q('#acct-form'));
    await until(() => rig.root.querySelector('#deletion-banner'));
    expect(rig.app.current()).toBe('signin');
    expect(rig.q<HTMLElement>('#signin-proceed').hidden).toBe(false);
    await clickThrough(rig.q('#deletion-cancel'));
    await until(() => rig.root.querySelector('#deletion-cancelled'));
    rig.q('#signin-continue').click();
    await until(() => rig.app.current() === 'languages');
    await until(() => rig.root.querySelector('#flash'));
    expect(rig.q('#flash').textContent).toContain('Signed in as ana@example.org');
  });

  it('a signed-in visitor to the sign-in page sees the banner; a normal sign-in goes straight on', async () => {
    const acct = account();
    const rig = await makeRig({ fetch: acct.fetch });
    await signIn(rig); // no deletion pending: straight to the languages page
    expect(rig.app.current()).toBe('languages');
    acct.scheduledPurgeAt = acct.purgeAt;
    await rig.go('signin');
    await until(() => rig.root.querySelector('#deletion-banner'));
  });

  it('the privacy page has the same deletion block', async () => {
    const acct = account();
    const rig = await makeRig({ fetch: acct.fetch });
    await signIn(rig, 'ana@example.org', acct.password);
    await rig.go('privacy');
    await until(() => rig.root.querySelector('#priv-delete #delete-account'));
    type(rig.q('#delete-password'), acct.password);
    rig.q('#delete-account').click();
    await until(() => rig.root.querySelector('#priv-delete #delete-cancel'));
    expect(acct.scheduledPurgeAt).toBe(acct.purgeAt);
  });
});

describe('the legal pages', () => {
  it('#/terms shows the Terms draft, marked as not in force', async () => {
    const rig = await makeRig({ fetch: account().fetch });
    await rig.go('terms');
    expect(rig.app.current()).toBe('terms');
    expect(rig.q('#screen h1').textContent).toBe('Terms of use');
    expect(rig.q('#terms-text').textContent).toContain("DRAFT — for the owner's review and legal counsel; not in force");
    expect(rig.q('#terms-text').textContent).toContain('Wiktionary');
    expect(rig.q<HTMLAnchorElement>('#terms-text a[href="#/privacy"]')).toBeTruthy();
  });

  it('#/privacy shows the Privacy Policy draft below the switches', async () => {
    const rig = await makeRig({ fetch: account().fetch });
    await rig.go('privacy');
    const policy = rig.q('#privacy-policy');
    expect(policy.textContent).toContain('not in force');
    expect(policy.textContent).toContain('What the sync service keeps');
    expect(policy.textContent).toContain('CC BY-SA 4.0');
    expect(policy.textContent).toContain('14-day grace period');
    expect(rig.q<HTMLAnchorElement>('#link-terms').getAttribute('href')).toBe('#/terms');
    // the policy is text only: nothing in it can run
    expect(policy.querySelector('script, img, iframe')).toBeNull();
  });
});

describe('the new pages are accessible', () => {
  it('verify, reset, terms, sign-in with the forgot form, and the signed-in Settings audit clean', async () => {
    const acct = account();
    const rig = await makeRig({ fetch: acct.fetch, startRoute: 'verify?token=stale' });
    await until(() => rig.root.querySelector('#verify-failed'));
    const results = [auditDom(rig.root, 'app/verify (failed)')];
    await openLink(rig, '#/verify?token=good-verify');
    await until(() => rig.root.querySelector('#verify-ok'));
    results.push(auditDom(rig.root, 'app/verify (confirmed)'));
    await openLink(rig, '#/reset?token=good-reset');
    results.push(auditDom(rig.root, 'app/reset'));
    await rig.go('terms');
    results.push(auditDom(rig.root, 'app/terms'));
    await rig.go('signin');
    rig.q<HTMLDetailsElement>('#forgot').open = true;
    results.push(auditDom(rig.root, 'app/signin (forgot open)'));
    await signIn(rig);
    acct.scheduledPurgeAt = acct.purgeAt;
    await rig.go('settings');
    await until(() => rig.root.querySelectorAll('#sessions li').length === 3 && rig.root.querySelector('#deletion-banner') && rig.root.querySelectorAll('#events li').length > 0);
    results.push(auditDom(rig.root, 'app/settings (signed in, deletion pending)'));
    await rig.go('privacy');
    await until(() => rig.root.querySelector('#priv-delete #delete-cancel'));
    results.push(auditDom(rig.root, 'app/privacy (signed in, policy)'));
    expect(results.flatMap((r) => r.findings.map((f) => `${f.screen}: ${f.rule}: ${f.where}: ${f.detail}`))).toEqual([]);
  });
});
