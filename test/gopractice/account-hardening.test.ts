// @vitest-environment jsdom
/**
 * Account hardening in GoReview / GoPractice, against a fake of the service contract (test/golearn-app/accountFake.ts): forgot password and
 * an unverified sign-in on #/signin; on #/settings the verification state, the sessions and their revoking, the data download, deleting with a
 * grace period and cancelling, the pending-deletion banner and the security events; and the legal drafts at #/privacy and #/terms.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { auditDom } from '../audit/a11y.support';
import { FakeAccountService } from '../golearn-app/accountFake';
import { destroyRigs, flush, makeRig, type, until, type Rig } from './helpers';

afterEach(() => { destroyRigs(); });

const readBlob = (blob: Blob): Promise<string> => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsText(blob); });
const click = async (el: Element | null | undefined): Promise<void> => { if (!el) throw new Error('nothing to click'); (el as HTMLElement).click(); await flush(4); };
const submitSignIn = (rig: Rig, email = 'ana@example.org', password = 'correct-horse-battery'): void => {
  type(rig.q<HTMLInputElement>('#signin-email'), email);
  type(rig.q<HTMLInputElement>('#signin-password'), password);
  rig.q('#signin-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
};

/** A signed-in rig whose page `fetch` is the fake account service; downloads are captured. */
async function signedIn(acct = new FakeAccountService()): Promise<{ rig: Rig; acct: FakeAccountService; downloads: Array<{ filename: string; blob: Blob }> }> {
  acct.password = 'correct-horse-battery';
  const rig = await makeRig({ signedIn: true, fetch: acct.fetch });
  const downloads: Array<{ filename: string; blob: Blob }> = [];
  rig.deps.download = (filename, blob) => { downloads.push({ filename, blob }); };
  return { rig, acct, downloads };
}

describe('#/signin', () => {
  it('forgot password asks for the email and always answers “if that address has an account, an email is on its way”', async () => {
    const acct = new FakeAccountService();
    const rig = await makeRig({ config: { serviceUrl: 'https://repository.example.org' }, links: { setup: 'https://setup.example.org/' }, fetch: acct.fetch });
    await rig.go('signin');
    type(rig.q('#signin-email'), 'ana@example.org');
    const details = rig.q<HTMLDetailsElement>('#forgot');
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    expect(rig.q<HTMLInputElement>('#forgot-email').value).toBe('ana@example.org');
    await click(rig.q('#forgot-submit'));
    await until(() => !!rig.q('#forgot .status').textContent, 'the answer');
    expect(rig.q('#forgot .status').textContent).toBe('If that address has an account, an email is on its way.');
    expect(acct.last('POST', '/accounts/password/forgot')!.body).toEqual({ email: 'ana@example.org' });
    // an address the service does not know gets the same words
    type(rig.q('#forgot-email'), 'nobody@example.org');
    acct.failNext.set('POST /accounts/password/forgot', { status: 404 });
    await click(rig.q('#forgot-submit'));
    await until(() => acct.count('POST', '/accounts/password/forgot') === 2, 'the second request');
    await flush(4);
    expect(rig.q('#forgot .status').textContent).toBe('If that address has an account, an email is on its way.');
    // the reset link opens GoLearn setup
    expect(rig.q('#email-links-note').textContent).toContain('open GoLearn setup');
    expect(rig.q<HTMLAnchorElement>('#link-setup-email').getAttribute('href')).toBe('https://setup.example.org/');
  });

  it('refuses an invalid address before any request and says when the service is unreachable', async () => {
    const acct = new FakeAccountService();
    const rig = await makeRig({ fetch: acct.fetch });
    await rig.go('signin');
    type(rig.q('#forgot-email'), 'not-an-email');
    await click(rig.q('#forgot-submit'));
    expect(rig.q('#forgot .status').textContent).toMatch(/valid email/);
    expect(acct.count('POST', '/accounts/password/forgot')).toBe(0);
    acct.down = true;
    type(rig.q('#forgot-email'), 'ana@example.org');
    await click(rig.q('#forgot-submit'));
    await until(() => /could not be reached/.test(rig.q('#forgot .status').textContent ?? ''), 'the unreachable message');
  });

  it('an unverified account is told to confirm the address, with a resend, and no session is kept', async () => {
    const acct = new FakeAccountService();
    const rig = await makeRig({ fetch: acct.fetch });
    rig.service.unverified.add('ana@example.org');
    await rig.go('signin');
    submitSignIn(rig);
    await until(() => /Confirm your email address first/.test(rig.q('#signin-form .status').textContent ?? ''), 'the unverified message');
    expect(rig.q('#signin-form .status').getAttribute('data-kind')).toBe('error');
    expect((await rig.area.get('gopractice:session'))['gopractice:session']).toBeUndefined();
    await click(rig.q('#unverified-resend'));
    await until(() => !!rig.q('#unverified-notice .status').textContent, 'the resend answer');
    expect(acct.last('POST', '/accounts/verify/resend')!.body).toEqual({ email: 'ana@example.org' });
    expect(rig.q('#unverified-notice .status').textContent).toMatch(/a new email is on its way/);
  });

  it('shows a pending deletion after signing in, with a Cancel, and waits for the learner', async () => {
    const acct = new FakeAccountService();
    acct.scheduledPurgeAt = acct.purgeAt;
    const rig = await makeRig({ fetch: acct.fetch });
    await rig.go('signin');
    expect(rig.root.querySelector('#deletion-banner')).toBeNull();
    submitSignIn(rig);
    await until(() => !!rig.root.querySelector('#deletion-banner'), 'the banner');
    expect(rig.app.current()).toBe('signin');
    expect(rig.q<HTMLElement>('#signin-next').hidden).toBe(false);
    expect(rig.q('#deletion-banner').textContent).toContain('scheduled for deletion on 2026-10-22 12:00 UTC');
    await click(rig.q('#deletion-cancel'));
    await until(() => !!rig.root.querySelector('#deletion-cancelled'), 'the cancelled note');
    expect(acct.scheduledPurgeAt).toBeUndefined();
  });

  it('a normal sign-in goes straight to GoReview', async () => {
    const acct = new FakeAccountService();
    const rig = await makeRig({ fetch: acct.fetch });
    await rig.go('signin');
    submitSignIn(rig);
    await until(() => rig.app.current() === 'review', 'GoReview');
  });

  it('is open to the terms and the privacy policy before any sign-in', async () => {
    const rig = await makeRig({ fetch: new FakeAccountService().fetch });
    await rig.go('signin');
    expect(rig.q<HTMLAnchorElement>('#signin-form ~ #legal-links #link-terms, #legal-links #link-terms').getAttribute('href')).toBe('#/terms');
    expect(rig.q<HTMLAnchorElement>('#legal-links #link-privacy-policy').getAttribute('href')).toBe('#/privacy');
  });
});

describe('#/account', () => {
  it('shows the verification state: not confirmed (with a resend), confirmed, and not reported', async () => {
    const { rig, acct } = await signedIn();
    await rig.go('account');
    await until(() => !!rig.q('#verification-state').getAttribute('data-state'), 'the state');
    expect(rig.q('#verification-state').getAttribute('data-state')).toBe('unverified');
    expect(rig.q('#verification-state').textContent).toBe('ana@example.org');
    expect(rig.q('#verification-note').textContent).toContain('Not confirmed yet');
    await click(rig.q('#verification-resend'));
    await until(() => !!rig.q('#acct-verification .status').textContent, 'the resend answer');
    expect(acct.last('POST', '/accounts/verify/resend')!.body).toEqual({ email: 'ana@example.org' });
    expect(rig.q('#acct-verification .status').textContent).toMatch(/a new email is on its way/);

    acct.verified = true;
    await rig.go('review');
    await rig.go('account');
    await until(() => !!rig.q('#verification-state').getAttribute('data-state'), 'the state');
    expect(rig.q('#verification-state').getAttribute('data-state')).toBe('verified');
    expect(rig.q('#verification-resend').hidden).toBe(true);

    acct.reportVerified = false;
    await rig.go('review');
    await rig.go('account');
    await until(() => !!rig.q('#verification-state').getAttribute('data-state'), 'the state');
    expect(rig.q('#verification-state').getAttribute('data-state')).toBe('unknown');
  });

  it('has no account blocks without an account', async () => {
    const rig = await makeRig({ local: true, fetch: new FakeAccountService().fetch });
    await rig.go('account');
    expect(rig.root.querySelector('#acct-sessions')).toBeNull();
    expect(rig.root.querySelector('#acct-delete')).toBeNull();
    await rig.go('settings');
    expect(rig.q<HTMLAnchorElement>('#legal-links #link-terms').getAttribute('href')).toBe('#/terms');
  });

  it('lists the sessions, ends one, and signs out everywhere else', async () => {
    const { rig, acct } = await signedIn();
    await rig.go('account');
    await until(() => rig.root.querySelectorAll('#sessions li').length === 3, 'the sessions');
    const rows = [...rig.root.querySelectorAll('#sessions li')];
    expect(rows[0].textContent).toContain('This browser');
    expect(rows[0].textContent).toContain('this device');
    expect(rows[0].querySelector('button')).toBeNull();
    expect(rows[1].textContent).toContain('last used 2026-10-07 18:30 UTC');
    expect(acct.last('GET', '/me/sessions')!.auth).toMatch(/^Bearer tok-L1-/);
    await click(rig.q('[data-revoke="s-phone"]'));
    await until(() => rig.root.querySelectorAll('#sessions li').length === 2, 'one fewer session');
    expect(acct.count('DELETE', '/me/sessions/s-phone')).toBe(1);
    expect(rig.q('#acct-sessions .status').textContent).toBe('Ended the session on Phone.');
    await click(rig.q('#sessions-revoke-others'));
    await until(() => rig.root.querySelectorAll('#sessions li').length === 1, 'only this device');
    expect(acct.count('DELETE', '/me/sessions')).toBe(1);
    expect(rig.root.querySelector('#sessions-revoke-others')).toBeNull();
    expect(rig.q('#acct-sessions').textContent).toContain('only device signed in');
  });

  it('says what went wrong when a session cannot be ended', async () => {
    const { rig, acct } = await signedIn();
    await rig.go('account');
    await until(() => rig.root.querySelectorAll('#sessions li').length === 3, 'the sessions');
    acct.failNext.set('DELETE /me/sessions/s-phone', { status: 500, body: { error: 'boom', message: 'The store is busy.' } });
    await click(rig.q('[data-revoke="s-phone"]'));
    await until(() => /store is busy/.test(rig.q('#acct-sessions .status').textContent ?? ''), 'the error');
    expect(rig.root.querySelectorAll('#sessions li')).toHaveLength(3);
  });

  it('“Download my data” offers the export as goreview-data-<date>.json, sent with the session’s token', async () => {
    const { rig, acct, downloads } = await signedIn();
    await rig.go('account');
    await click(rig.q('#export-data'));
    await until(() => downloads.length === 1, 'the download');
    expect(downloads[0].filename).toBe('goreview-data-2026-10-08.json');
    expect(downloads[0].blob.type).toBe('application/json');
    expect(JSON.parse(await readBlob(downloads[0].blob))).toEqual(acct.exportBody);
    expect(acct.last('GET', '/me/export')!.auth).toMatch(/^Bearer tok-L1-/);
    expect(rig.q('#account-status').textContent).toBe('Your data is ready: goreview-data-2026-10-08.json.');
  });

  it('a refused or unreachable download downloads nothing and says why', async () => {
    const { rig, acct, downloads } = await signedIn();
    await rig.go('account');
    acct.failNext.set('GET /me/export', { status: 401, body: { error: 'unauthorized', message: '' } });
    await click(rig.q('#export-data'));
    await until(() => /no longer valid/.test(rig.q('#account-status').textContent ?? ''), 'the 401 message');
    acct.down = true;
    await click(rig.q('#export-data'));
    await until(() => /could not be reached/.test(rig.q('#account-status').textContent ?? ''), 'the unreachable message');
    expect(downloads).toHaveLength(0);
  });

  it('shows the last 20 security events, newest first, in plain words', async () => {
    const acct = new FakeAccountService();
    acct.events = Array.from({ length: 25 }, (_, i) => ({ kind: i === 24 ? 'password-reset' : 'sign-in', at: `2026-10-${String(i + 1).padStart(2, '0')}T09:00:00.000Z`, ...(i === 24 ? {} : { deviceLabel: 'Phone' }) }));
    const { rig } = await signedIn(acct);
    await rig.go('developer');
    await until(() => rig.root.querySelectorAll('#events li').length === 20, 'twenty events');
    expect(rig.root.querySelector('#events li')!.textContent).toContain('Password changed with an emailed link');
    expect(rig.root.querySelectorAll('#events li')[1].textContent).toContain('Phone');
  });
});

describe('deleting the account', () => {
  it('needs the password, explains the 14-day grace, then shows the pending deletion with a Cancel', async () => {
    const { rig, acct } = await signedIn();
    await rig.go('account');
    await until(() => !!rig.root.querySelector('#delete-open'), 'the delete link');
    await click(rig.q('#delete-open'));
    await until(() => !!rig.root.querySelector('#delete-account'), 'the delete form');
    expect(rig.q('#delete-body').textContent).toContain('14 days');
    expect(rig.root.querySelector('#deletion-banner')).toBeNull();
    await click(rig.q('#delete-account'));
    expect(rig.q('#delete-body .status').textContent).toBe('Enter your password to confirm.');
    expect(acct.count('DELETE', '/me')).toBe(0);
    type(rig.q('#delete-password'), 'not the password');
    await click(rig.q('#delete-account'));
    await until(() => /not accepted/.test(rig.q('#delete-body .status').textContent ?? ''), 'the refusal');
    expect(rig.q('#delete-body .status').textContent).toContain('Nothing was scheduled');
    expect(rig.q<HTMLInputElement>('#delete-password').value).toBe('');
    expect(acct.scheduledPurgeAt).toBeUndefined();
    type(rig.q('#delete-password'), acct.password);
    await click(rig.q('#delete-account'));
    await until(() => !!rig.root.querySelector('#delete-cancel'), 'the pending state');
    expect(acct.last('DELETE', '/me')!.body).toEqual({ password: acct.password });
    expect(rig.q('#delete-body').textContent).toContain('Deletion is scheduled for 2026-10-22 12:00 UTC');
    await until(() => !!rig.root.querySelector('#deletion-banner'), 'the banner');
    expect(JSON.stringify(await rig.area.get(null))).not.toContain(acct.password);
    expect((await rig.area.get('gopractice:session'))['gopractice:session']).toBeDefined();
    await click(rig.q('#delete-cancel'));
    await until(() => !!rig.root.querySelector('#delete-open'), 'the link again');
    expect(acct.count('POST', '/me/delete/cancel')).toBe(1);
    expect(acct.scheduledPurgeAt).toBeUndefined();
    await until(() => !rig.root.querySelector('#deletion-banner'), 'the banner gone');
    expect(rig.q('#delete-body').textContent).toContain('The deletion is cancelled');
  });

  it('the banner’s own Cancel cancels the deletion and the delete block follows; a failed cancel says it is still scheduled', async () => {
    const { rig, acct } = await signedIn();
    acct.scheduledPurgeAt = acct.purgeAt;
    await rig.go('account');
    await until(() => !!rig.root.querySelector('#deletion-banner'), 'the pending state');
    acct.failNext.set('POST /me/delete/cancel', { status: 500, body: { error: 'boom', message: 'Try later.' } });
    await click(rig.q('#deletion-cancel'));
    await until(() => /still scheduled/.test(rig.q('#deletion-banner .status').textContent ?? ''), 'the failure');
    expect(acct.scheduledPurgeAt).toBe(acct.purgeAt);
    await click(rig.q('#deletion-cancel'));
    await until(() => !!rig.root.querySelector('#deletion-cancelled'), 'the cancelled note');
    await until(() => !rig.root.querySelector('#deletion-banner'), 'the banner gone');
    expect(acct.scheduledPurgeAt).toBeUndefined();
  });
});

describe('the legal pages', () => {
  it('#/terms and #/privacy open without an account on the hosted copy and show the drafts, marked as not in force', async () => {
    const rig = await makeRig({ fetch: new FakeAccountService().fetch });
    expect(rig.app.current()).toBe('signin');
    await rig.go('terms');
    expect(rig.app.current()).toBe('terms');
    expect(rig.q('h1').textContent).toBe('Terms of use');
    expect(rig.q('#terms-text').textContent).toContain("DRAFT — for the owner's review and legal counsel; not in force");
    expect(rig.q('#terms-text').textContent).toContain('Wiktionary');
    await rig.go('privacy');
    expect(rig.app.current()).toBe('privacy');
    expect(rig.q('h1').textContent).toBe('Privacy Policy');
    const policy = rig.q('#privacy-policy');
    expect(policy.textContent).toContain('not in force');
    expect(policy.textContent).toContain('What the sync service keeps');
    expect(policy.textContent).toContain('CC BY-SA 4.0');
    expect(policy.textContent).toContain('14-day grace period');
    expect(policy.querySelector('script, img, iframe')).toBeNull();
    expect(rig.q<HTMLAnchorElement>('#link-terms').getAttribute('href')).toBe('#/terms');
  });

  it('a signed-in learner reaches them from Settings and gets a way back to GoReview', async () => {
    const { rig } = await signedIn();
    await rig.go('settings');
    expect(rig.q<HTMLAnchorElement>('#legal-links #link-terms').getAttribute('href')).toBe('#/terms');
    await rig.go('privacy');
    expect(rig.root.querySelector('#back-home')).toBeNull(); // no "← GoReview" on any screen: the Go mark in the top bar is the way home
    expect(rig.q('header .go-brand').getAttribute('href')).toBe('#/review');
  });
});

describe('the changed pages are accessible', () => {
  it('sign-in with the forgot form, Settings with the account blocks and a pending deletion, the privacy policy and the terms audit clean', async () => {
    const acct = new FakeAccountService();
    const results = [] as ReturnType<typeof auditDom>[];
    const rig = await makeRig({ signedIn: true, fetch: acct.fetch });
    acct.password = 'correct-horse-battery';
    await rig.go('signin');
    rig.q<HTMLDetailsElement>('#forgot').open = true;
    results.push(auditDom(rig.root, 'practice/signin (signed in, forgot open)'));
    acct.scheduledPurgeAt = acct.purgeAt;
    await rig.go('account');
    await until(() => rig.root.querySelectorAll('#sessions li').length === 3 && !!rig.root.querySelector('#deletion-banner'), 'the account page');
    rig.q<HTMLDetailsElement>('#acct-devices').open = true;
    await click(rig.q('#delete-open'));
    results.push(auditDom(rig.root, 'practice/account (devices open, deletion pending)'));
    await rig.go('developer');
    await until(() => rig.root.querySelectorAll('#events li').length > 0 && !!rig.root.querySelector('#diagnostics dt'), 'the developer page');
    results.push(auditDom(rig.root, 'practice/developer'));
    await rig.go('privacy');
    results.push(auditDom(rig.root, 'practice/privacy'));
    await rig.go('terms');
    results.push(auditDom(rig.root, 'practice/terms'));
    expect(results.flatMap((r) => r.findings.map((f) => `${f.screen}: ${f.rule}: ${f.where}: ${f.detail}`))).toEqual([]);
  });
});

