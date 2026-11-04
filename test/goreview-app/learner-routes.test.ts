// @vitest-environment jsdom
/**
 * What a learner reaches without knowing the system (the readiness audit of 2026-11-03, P1, P3, P4): the session summary leads with the result, a phone can make
 * an account, and Help opens without one.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { FakeAccountService } from '../golearn-app/accountFake';
import { destroyRigs, flush, makeRig, type, until } from './helpers';

afterEach(() => { destroyRigs(); });

const hostedRig = async (acct: FakeAccountService) => makeRig({ signedIn: false, fetch: acct.fetch });

describe('creating an account in GoReview', () => {
  it('offers it on the hosted copy, asks for a name and a long enough password, shows the terms, and signs in', async () => {
    const rig = await hostedRig(new FakeAccountService());
    const created: Array<{ email?: string; displayName?: string }> = [];
    const consents: unknown[] = [];
    // the rig's service speaks sessions and events; the two calls this path adds are observed here
    const realApi = rig.deps.createApi;
    rig.deps.createApi = ((url: string, token?: string) => {
      const api = realApi(url, token);
      return Object.assign(Object.create(api) as typeof api, {
        createAccount: async (input: { email: string; password: string; displayName?: string }) => { created.push(input); rig.service.accounts.set(input.email, { password: input.password, learnerId: 'learner-new' } as never); return { ok: true, status: 201, data: { learnerId: 'learner-1', accountId: 'a-1' } }; },
        appendEvents: async (events: unknown[]) => { consents.push(...events); return { ok: true, status: 200, data: { outcomes: [], projected: true } }; },
      });
    }) as typeof realApi;
    await rig.go('signin');
    const toggle = rig.root.querySelector<HTMLButtonElement>('#signin-create-toggle');
    expect(toggle).not.toBeNull();
    expect(rig.q('#terms-note').hidden).toBe(true);
    toggle!.click();
    expect(rig.q('#signin-form h2').textContent).toBe('Create an account');
    expect(rig.q('#terms-note').hidden).toBe(false);
    expect(rig.q('#signin-password').getAttribute('autocomplete')).toBe('new-password');

    type(rig.q<HTMLInputElement>('#signin-email'), 'new@example.org');
    type(rig.q<HTMLInputElement>('#signin-password'), 'short');
    rig.q('#signin-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await until(() => /at least 10 characters/.test(rig.q('#signin-form .status').textContent ?? ''), 'the password rule');
    type(rig.q<HTMLInputElement>('#signin-password'), 'correct-horse-battery');
    rig.q('#signin-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await until(() => /Enter your name/.test(rig.q('#signin-form .status').textContent ?? ''), 'the name rule');
    type(rig.q<HTMLInputElement>('#signin-name'), 'Ana');
    rig.q('#signin-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await until(async () => !!(await rig.deps.area.get('gopractice:session'))['gopractice:session'], 'the session');
    expect(created).toEqual([expect.objectContaining({ email: 'new@example.org', displayName: 'Ana' })]);
    await until(() => consents.length > 0, 'the acceptance of the terms is recorded');
    expect(consents[0]).toMatchObject({ kind: 'ConsentGiven', payload: { scope: 'terms-and-privacy' } });
  });

  it('switches back to signing in', async () => {
    const rig = await hostedRig(new FakeAccountService());
    await rig.go('signin');
    const toggle = rig.q<HTMLButtonElement>('#signin-create-toggle');
    toggle.click(); toggle.click();
    expect(rig.q('#signin-form h2').textContent).toBe('Sign in');
    expect(rig.q('#terms-note').hidden).toBe(true);
    expect(rig.q('#signin-password').getAttribute('autocomplete')).toBe('current-password');
  });
});

describe('Help', () => {
  it('opens without an account, answers the first questions, and shows no contact until there is one', async () => {
    const rig = await hostedRig(new FakeAccountService());
    await rig.go('help');
    await flush(4);
    expect(rig.q('#help').getAttribute('aria-label')).toBe('Help');
    expect(rig.q('#help').textContent).toContain('Why are there no new words today?');
    expect(rig.root.querySelector('#help-contact')).toBeNull();
    expect(rig.q('#help-contact-none').textContent).toContain('no support address');
  });

  it('shows the address when the build names one', async () => {
    const rig = await makeRig({ signedIn: false, fetch: new FakeAccountService().fetch, links: { support: 'help@example.org' } });
    await rig.go('help');
    await flush(4);
    expect(rig.q<HTMLAnchorElement>('#help-contact a').getAttribute('href')).toBe('mailto:help@example.org');
  });
});
