// @vitest-environment jsdom
/**
 * GoPractice without an account: inside the extension the on-device Repository answers, the router no longer forces #/signin, GoReview and GoTell
 * work on the device, the account is offered any time (upload once, then synced; signing out returns to the device without removing anything),
 * and the hosted copy, which has no such repository, explains itself instead of walling the app.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { decodeBody } from '../../packages/gotell/src/documents';
import { tellOverrides } from '../../packages/gopractice/screens/tell/overrides';
import { draftIdFromHash, press, typeInto } from '../gotell-ui/rig';
import {
  LOCAL_LEARNER, candidate, cardAdded, defaultService, destroyRigs, flush, ids, makeRig, queued, reopenDetails, reviewed, seed, type, unitOf, until, type Rig,
} from './helpers';

afterEach(() => { tellOverrides.timers = undefined; tellOverrides.download = undefined; destroyRigs(); });

const LOC = ids(LOCAL_LEARNER, 'sq');
const submitSignIn = (rig: Rig, email = 'ana@example.org', password = 'correct-horse-battery'): void => {
  type(rig.q<HTMLInputElement>('#signin-email'), email);
  type(rig.q<HTMLInputElement>('#signin-password'), password);
  rig.q('#signin-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
};
const click = (el: Element | null | undefined): void => { if (!el) throw new Error('nothing to click'); (el as HTMLElement).click(); };

describe('on the device, with no account', () => {
  it('opens on GoReview with no sign-in form, shows the navigation and says the progress is on this device only', async () => {
    const rig = await makeRig({ local: true });
    expect(rig.app.current()).toBe('review');
    expect(rig.root.querySelector('#signin-form')).toBeNull();
    // the header is the language, the person (the account page) and the Settings cog; the account offer lives on the account page
    expect(rig.root.querySelector('.topnav')).toBeNull();
    expect(rig.q('#settings-link').getAttribute('aria-label')).toBe('Settings');
    expect(rig.q('#header-account').getAttribute('aria-label')).toBe('Account');
    expect(rig.q('#sync-indicator').textContent).toBe('On this device only');
    expect(rig.root.querySelector('#account-link')).toBeNull();
    await rig.go('account');
    expect(rig.q<HTMLAnchorElement>('#settings-keep-progress').getAttribute('href')).toBe('#/signin');
    expect(rig.q('#settings-keep-progress').textContent).toBe('Keep your progress across devices (optional)');
    await rig.go('review');
    expect(rig.q('#language-name').textContent).toBe('Albanian'); // one language: plain text, no select
    expect(rig.root.querySelector('#language-select')).toBeNull();
    expect(rig.q('main').getAttribute('data-language')).toBe('sq-AL');
    expect(rig.service.calls).not.toContain('createSession');
  });

  it('does not redirect a deep link to the sign-in page, and shows no team, leader or mission team on any screen', async () => {
    const rig = await makeRig({ local: true });
    await rig.go('settings');
    expect(rig.app.current()).toBe('settings');
    window.location.hash = '#/tell';
    await until(() => rig.app.current() === 'tell', 'the hashchange');
    for (const route of ['review', 'tell', 'settings', 'signin', 'review/transfer']) {
      await rig.go(route);
      await flush(4);
      expect(rig.root.textContent, route).not.toMatch(/team|leader/i);
    }
  });

  it('shows no team even for an account whose enrolment carries one, and labels the language only', async () => {
    const rig = await makeRig({ signedIn: true }); // the default account’s enrolment is stored with teamId 'albania'
    expect(rig.service.enrolments.get('L1')![0].teamId).toBe('albania');
    expect(rig.q('#language-name').textContent).toBe('Albanian'); // one language: plain text, no select
    expect(rig.root.querySelector('#language-select')).toBeNull();
    for (const route of ['review', 'tell', 'settings']) {
      await rig.go(route);
      await flush(4);
      expect(rig.root.textContent, route).not.toMatch(/team|albania|leader/i);
    }
    const state = await rig.area.get(null);
    expect(Object.keys(state).some((k) => /team/i.test(k))).toBe(false);
  });

  it('GoReview home works from the device: the candidates and the knowledge come from the local api, and answering is recorded on the device', async () => {
    const service = defaultService();
    service.candidates.set('LOC-e1', [candidate('det', 0.8), candidate('zog', 0.9)]);
    const rig = await makeRig({ service, local: true });
    await seed(rig, [
      cardAdded(LOC, 'zog', 'written-recognition', '2026-09-01T09:00:00.000Z'),
      reviewed(LOC, 'zog', 'written-recognition', 3, '2026-09-01T10:00:00.000Z'),
      cardAdded(LOC, 'mace', 'meaning-to-form', '2026-09-01T09:00:00.000Z'),
    ]);
    await reopenDetails(rig);
    expect(rig.q('#due-summary').textContent).toContain('Due');
    expect(rig.q('#count-candidates').textContent).toBe('0'); // missing admission evidence stays out; zog was already covered
    expect(rig.q(`#candidates [data-unit="${unitOf('det')}"]`).getAttribute('data-decision')).toBe('needs-validation');
    expect(rig.q(`#candidates [data-unit="${unitOf('det')}"]`).textContent).toContain('no verified facts');
    expect((await rig.app.ctx.events('sq')).some((e) => e.kind === 'CardAdded' && e.subject.itemIds?.includes(unitOf('det')))).toBe(false);
    expect(rig.qa('#candidates li[data-unit]').length).toBe(2);
    expect(service.calls).toContain('candidates'); // asked of the device’s own Repository, not of a server
    expect(rig.root.querySelector('#no-enrolment')).toBeNull();
    // an answer given on the device is queued and reaches the device’s Repository through the sync client
    await rig.app.ctx.record([reviewed(LOC, 'mace', 'meaning-to-form', 3, '2026-10-08T09:00:00.000Z')]);
    await rig.app.ctx.syncNow();
    expect(service.storedEvents(LOCAL_LEARNER).some((e) => e.id === 'rev-mace-2026-10-08T09:00:00.000Z')).toBe(true);
    expect((await queued(rig)).length).toBe(0);
    expect(rig.q('#sync-indicator').textContent).toBe('On this device only');
  });

  it('GoReview home says what to do when no language was chosen yet, and points to setup', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, local: { }, links: { setup: '../app/index.html#/language' } });
    rig.local!.api.listEnrolments = async () => ({ ok: true as const, status: 200, data: { enrolments: [] } });
    await rig.go('settings');
    await rig.go('review');
    await until(() => !!rig.root.querySelector('#no-enrolment'), 'the notice');
    expect(rig.q('#no-enrolment').textContent).toContain('choose your language in GoLearn setup');
    expect(rig.q('#no-enrolment').textContent).toContain('no account is needed');
    expect(rig.q<HTMLAnchorElement>('#link-setup').getAttribute('href')).toBe('../app/index.html#/language');
  });

  it('the language switcher lists the device’s own enrolments and prefers the one chosen in setup', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, local: { activeLanguageId: 'de' } });
    rig.local!.api.listEnrolments = async () => ({ ok: true as const, status: 200, data: { enrolments: [
      { enrolmentId: 'LOC-e1', learnerId: 'LOC', languageId: 'sq', varietyId: 'sq-AL', packId: 'pack:sq', packVersion: '1', goals: [{ kind: 'reading' as const }], startedAt: '2026-09-01T00:00:00.000Z' },
      { enrolmentId: 'LOC-e2', learnerId: 'LOC', languageId: 'de', packId: 'pack:de', packVersion: '1', goals: [{ kind: 'reading' as const }], startedAt: '2026-09-02T00:00:00.000Z' },
      { enrolmentId: 'LOC-e3', learnerId: 'LOC', languageId: 'hi', packId: 'pack:hi', packVersion: '1', goals: [], startedAt: '2026-09-03T00:00:00.000Z' },
    ] } });
    await rig.go('settings');
    await rig.go('review');
    const options = rig.qa<HTMLOptionElement>('#language-select option');
    expect(options.map((o) => o.textContent)).toEqual(['German', 'Albanian', 'Hindi']); // setup’s choices first, newest first
    expect(rig.q<HTMLSelectElement>('#language-select').value).toBe('LOC-e2');
    expect(rig.q('main').getAttribute('data-language')).toBe('de');
  });

  it('GoTell saves a draft on the device: the local api’s documents hold it, with no account', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, local: true });
    await rig.go('tell');
    await until(() => !!rig.root.querySelector('#tell-new-draft'), 'the GoTell home');
    expect(rig.q('#tell-connection').textContent).toContain('On this device only');
    click(rig.q('#tell-new-draft'));
    await until(() => !!rig.root.querySelector('#writer-text'), 'the writer');
    const id = draftIdFromHash();
    typeInto(rig.q<HTMLTextAreaElement>('#writer-text'), 'Unë jam në shtëpi. Ajo është e mirë.');
    press('s', { ctrl: true });
    await until(() => (service.docs.get(LOCAL_LEARNER)?.size ?? 0) === 1, 'the draft in the device’s documents');
    const doc = [...service.docs.get(LOCAL_LEARNER)!.values()][0];
    expect(doc.docId).toBe(id);
    expect(decodeBody(doc).versions).toHaveLength(1);
    expect(service.docs.has('L1')).toBe(false); // nothing went to an account
    expect(service.calls).not.toContain('createSession');
    // the observation (hashes and counts, never the words) is queued and reaches the device’s Repository
    const kinds = (await queued(rig)).map((e) => e.kind).sort();
    expect(kinds).toEqual(['DraftSaved', 'ProductionRecorded', 'ProductionRecorded']);
    await rig.go('tell');
    await until(() => !!rig.root.querySelector(`#tell-drafts li[data-doc="${id}"]`), 'the draft row');
    expect(rig.root.textContent).not.toMatch(/team/i);
  });
});

describe('the account is optional and only keeps progress across devices', () => {
  it('the sign-in page offers it with “Not now”, and asks for nothing the app needs', async () => {
    const rig = await makeRig({ local: true, links: { setup: '../app/index.html#/language' } });
    await rig.go('signin');
    expect(rig.q('#account-optional').textContent).toContain('An account is optional');
    expect(rig.q<HTMLAnchorElement>('#signin-not-now').getAttribute('href')).toBe('#/review');
    expect(rig.root.querySelector('#hosted-copy')).toBeNull();
    expect(rig.q<HTMLAnchorElement>('#link-setup').getAttribute('href')).toBe('../app/index.html#/language');
    expect(rig.q('#settings-link')).toBeTruthy();
  });

  it('signing in uploads the device’s history once, says how many events, and switches to the synced mode with the history on the account', async () => {
    const rig = await makeRig({ local: true });
    await rig.app.ctx.record([cardAdded(LOC, 'zog', 'meaning-to-form', '2026-09-01T09:00:00.000Z'), reviewed(LOC, 'zog', 'meaning-to-form', 3, '2026-09-01T10:00:00.000Z')]);
    await rig.app.ctx.syncNow();
    expect(rig.service.storedEvents(LOCAL_LEARNER)).toHaveLength(2);
    await rig.go('signin');
    submitSignIn(rig);
    await until(() => /Uploaded/.test(rig.q('#signin-form .status').textContent ?? ''), 'the upload message');
    expect(rig.q('#signin-form .status').textContent).toBe('Signed in as ana@example.org. Uploaded 2 events from this device to your account. Your progress is now synced to your account.');
    expect(rig.q<HTMLElement>('#signin-next').hidden).toBe(false);
    expect(rig.local!.uploads).toHaveLength(1);
    expect(rig.app.current()).toBe('signin'); // the learner reads the count, then continues
    // the account now holds the history, and GoPractice follows it
    await until(async () => (await rig.app.ctx.mode()) === 'account', 'the account mode');
    await rig.app.ctx.syncNow({ force: true });
    expect((await rig.app.ctx.events('sq')).some((e) => e.kind === 'CardReviewed')).toBe(true);
    click(rig.q('#signin-continue'));
    await rig.app.ready(); await flush(6);
    expect(rig.q('#sync-indicator').textContent).toMatch(/^Online/);
    expect(rig.root.querySelector('#account-link')).toBeNull();
  });

  it('a failed upload never undoes the sign-in, and nothing is claimed', async () => {
    const rig = await makeRig({ local: true });
    rig.local!.uploadFails = true;
    await rig.go('signin');
    submitSignIn(rig);
    await until(() => /Signed in as/.test(rig.q('#signin-form .status').textContent ?? ''), 'the sign-in');
    expect(rig.q('#signin-form .status').textContent).not.toMatch(/Uploaded/);
    expect((await rig.app.ctx.session())?.email).toBe('ana@example.org');
  });

  it('a wrong password signs in nothing and leaves the device mode as it was', async () => {
    const rig = await makeRig({ local: true });
    await rig.go('signin');
    submitSignIn(rig, 'ana@example.org', 'nope');
    await until(() => { const t = rig.q('#signin-form .status').textContent; return !!t && t !== 'Signing in…'; }, 'an error'); // the form says 'Signing in…' at once (2026-10-28: no service-address check before it)
    expect(rig.q('#signin-form .status').textContent).toBe('That email and password were not accepted.');
    expect(await rig.app.ctx.mode()).toBe('device');
    expect(rig.local!.uploads).toHaveLength(0);
  });

  it('in the extension the worker is signed in to the same account first (its upload and pull use it); a refusal from it stops the sign-in', async () => {
    const rig = await makeRig({ local: { worker: true } });
    await rig.go('signin');
    submitSignIn(rig, 'ana@example.org', 'nope');
    await until(() => { const t = rig.q('#signin-form .status').textContent; return !!t && t !== 'Signing in…'; }, 'an error'); // the form says 'Signing in…' at once (2026-10-28: no service-address check before it)
    expect(rig.q('#signin-form .status').textContent).toBe('The email or password was not accepted.');
    expect(rig.service.calls).not.toContain('createSession'); // the page did not go on without the worker
    submitSignIn(rig);
    await until(() => /Signed in as/.test(rig.q('#signin-form .status').textContent ?? ''), 'the sign-in');
    expect(rig.local!.connects).toEqual([{ email: 'ana@example.org' }]);
    expect(rig.local!.uploads).toHaveLength(1);
  });

  it('signing out returns to the device: the account’s history comes down first, the worker is signed out, and nothing local is removed', async () => {
    const rig = await makeRig({ local: { worker: true } });
    await rig.app.ctx.record([cardAdded(LOC, 'zog', 'meaning-to-form', '2026-09-01T09:00:00.000Z')]);
    await rig.app.ctx.syncNow();
    await rig.go('signin');
    submitSignIn(rig);
    await until(() => /Signed in as/.test(rig.q('#signin-form .status').textContent ?? ''), 'the sign-in');
    await rig.go('account');
    expect(rig.q('#verification-state').textContent).toBe('ana@example.org');
    click(rig.q('#sign-out'));
    await until(async () => (await rig.app.ctx.mode()) === 'device', 'the device mode');
    await rig.app.ready(); await flush(8);
    expect(rig.local!.pulls).toHaveLength(1);
    expect(rig.local!.disconnects).toBe(1);
    expect(rig.local!.cleared).toBe(0);
    expect(rig.service.storedEvents(LOCAL_LEARNER).length).toBeGreaterThan(0);
    expect(rig.app.current()).toBe('review'); // not thrown back to a sign-in wall
    expect(rig.q('#sync-indicator').textContent).toBe('On this device only');
    expect(Object.keys(await rig.area.get(null)).some((k) => k.startsWith(`u:${LOCAL_LEARNER}:`))).toBe(true);
  });

  it('Clear local data is explicit: armed by one click, disarmed by leaving it, done by the second, and it never happens at sign-out', async () => {
    const rig = await makeRig({ local: true });
    await rig.app.ctx.record([cardAdded(LOC, 'zog', 'meaning-to-form', '2026-09-01T09:00:00.000Z')]);
    await rig.go('account');
    expect(rig.q('#settings-device-only').textContent).toBe('On this device only.');
    expect(rig.q<HTMLAnchorElement>('#settings-keep-progress').getAttribute('href')).toBe('#/signin');
    const btn = rig.q<HTMLButtonElement>('#clear-local');
    click(btn);
    await flush(4);
    expect(btn.textContent).toBe('Click again to clear');
    expect(rig.local!.cleared).toBe(0);
    btn.dispatchEvent(new Event('blur'));
    expect(btn.textContent).toBe('Clear local data');
    click(btn);
    await flush(4);
    click(btn);
    await until(() => rig.local!.cleared === 1, 'the clear');
    await until(() => /Cleared the local data/.test(rig.q('#account-card').textContent ?? ''), 'the confirmation');
    expect(Object.keys(await rig.area.get(null)).filter((k) => k.startsWith(`u:${LOCAL_LEARNER}:`))).toEqual([]);
  });
});

describe('the hosted copy', () => {
  it('has no on-device Repository, so it explains that it needs an account instead of showing a bare wall, and shows no navigation', async () => {
    window.location.hash = '#/review';
    const rig = await makeRig();
    expect(rig.app.current()).toBe('signin');
    expect(rig.q('#hosted-copy').textContent).toContain('hosted copy');
    expect(rig.q('#hosted-copy').textContent).toContain('needs one');
    expect(rig.q('#hosted-copy').textContent).toContain('extension');
    expect(rig.q('#hosted-copy').textContent).toContain('no account at all');
    expect(rig.root.querySelector('#account-optional')).toBeNull();
    expect(rig.root.querySelector('#signin-not-now')).toBeNull(); // here the account is the only way in
    expect(rig.q('#signin-form')).toBeTruthy(); // for those who have an account
    expect(rig.root.querySelector('#settings-link')).toBeNull();
    expect(rig.q('#sync-indicator').textContent).toBe('Not signed in');
    expect(rig.root.textContent).not.toMatch(/team/i);
  });

  it('links to the extension page when the deployment names it', async () => {
    const rig = await makeRig({ links: { extension: 'https://example.org/golearn/practice' } });
    expect(rig.q<HTMLAnchorElement>('#open-extension-copy').getAttribute('href')).toBe('https://example.org/golearn/practice');
    expect(rig.q('#open-extension-copy').textContent).toBe('Open GoPractice in the extension');
  });

  it('without a named page it says where the extension copy is opened from', async () => {
    const rig = await makeRig();
    expect(rig.root.querySelector('#open-extension-copy')).toBeNull();
    expect(rig.q('#hosted-copy').textContent).toContain('“Practise”');
  });

  it('still signs in and works as before once the learner has an account', async () => {
    const rig = await makeRig({ signedIn: true });
    expect(rig.app.current()).toBe('review');
    expect(rig.q('#sync-indicator').textContent).toMatch(/^Online/);
    expect(await rig.app.ctx.mode()).toBe('account');
  });

  it('the hosted copy opens no repository: it has none', async () => {
    const rig = await makeRig();
    expect(await rig.app.ctx.local()).toBeUndefined();
    expect(await rig.app.ctx.mode()).toBe('none');
  });
});
