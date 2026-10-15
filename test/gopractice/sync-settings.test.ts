// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { KEYS } from '../../packages/gopractice/state';
import { cardAdded, defaultService, destroyRigs, dueCard, ids, makeRig, queued, reopenDetails, reviewed, seed, type, until, unitOf } from './helpers';

afterEach(() => destroyRigs());

const A = ids('L1', 'sq');

describe('synchronisation', () => {
  it('pulls the learner\'s events on start, so the deck is a fold over the whole record', async () => {
    const service = defaultService();
    // three events already on the server (another device, or GoLearn)
    for (const e of [...dueCard(A, 'zog', 'meaning-to-form'), cardAdded(A, 'mace', 'meaning-to-form', '2026-10-08T09:00:00.000Z')]) service.inject('L1', e);
    const rig = await makeRig({ service });
    await rig.signIn();
    await rig.app.ctx.whenSynced();
    await reopenDetails(rig);
    expect((await rig.app.ctx.events('sq')).length).toBe(3);
    expect(rig.q('#count-due').textContent).toBe('1');
    expect(rig.q('#count-fresh').textContent).toBe('1');
    expect(rig.q('#sync-indicator').textContent).toMatch(/^Online · nothing waiting · last sync /);
  });

  it('sends what was recorded here, once, and shows it as sent', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, signedIn: true });
    await rig.app.ctx.whenSynced();
    await rig.app.ctx.record([cardAdded(A, 'zog', 'meaning-to-form', '2026-10-08T09:00:00.000Z')]);
    expect((await queued(rig)).length).toBe(1);
    expect(rig.q('#sync-indicator').textContent).toContain('1 waiting');
    const r = await rig.app.ctx.syncNow({ force: true });
    expect(r?.ok).toBe(true);
    expect((await queued(rig)).length).toBe(0);
    expect(service.storedEvents('L1')).toHaveLength(1);
    await rig.app.ctx.syncNow({ force: true }); // own event comes back on the pull: not doubled locally
    expect((await rig.app.ctx.events()).length).toBe(1);
  });

  it('asks for a new sign-in when the service refuses the session, and keeps every event', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, signedIn: true });
    await rig.app.ctx.whenSynced();
    await rig.app.ctx.record([cardAdded(A, 'zog', 'meaning-to-form', '2026-10-08T09:00:00.000Z')]);
    service.tokens.clear(); // the session expired on the server
    await rig.app.ctx.syncNow({ force: true });
    await until(async () => (await rig.app.ctx.syncView()).authExpired, 'the expiry to be noticed');
    await rig.go('settings');
    expect(rig.q('#sync-indicator').textContent).toContain('Sign in again to sync');
    expect((await queued(rig)).length).toBe(1);
    await rig.go('signin');
    expect(rig.q('#signed-in-as').textContent).toContain('has expired');
    expect(rig.q('#signed-in-as').textContent).toContain('nothing on this device was lost');
  });
});

describe('Settings', () => {
  it('shows the scheduler identity, the versions and the counts', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, [...dueCard(A, 'zog', 'meaning-to-form'), cardAdded(A, 'mace', 'meaning-to-form', '2026-10-08T09:00:00.000Z')]);
    await rig.go('settings');
    await until(() => !!rig.root.querySelector('#diagnostics dt'), 'the diagnostics');
    const text = rig.q('#diagnostics').textContent!;
    expect(text).toContain('fsrs@v5.4.2 using FSRS-6.0');
    expect(text).toContain('Event contract3');
    expect(text).toContain('Events in the local log3');
    expect(text).toContain('Deck items2');
    expect(text).toContain('Desired retention90%');
    expect(rig.q('#settings-email').textContent).toBe('Signed in as ana@example.org');
    expect(rig.q('#sync-pending').textContent).toBe('0');
  });

  it('keeps the review preferences here too, and the remote-speech switch off by default', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.go('settings');
    expect(rig.q<HTMLInputElement>('#consent-remote-speech').checked).toBe(false);
    const box = rig.q<HTMLInputElement>('#consent-remote-speech');
    box.checked = true; box.dispatchEvent(new Event('change'));
    await until(async () => (await rig.app.ctx.state.getSettings()).remoteSpeechConsent, 'the switch');
    type(rig.q<HTMLInputElement>('#pref-size'), '15');
    await until(async () => (await rig.app.ctx.state.getPrefs('L1', 'sq')).cardsPerDeck === 15, 'the preference');
  });

  it('validates the service address and keeps the old one when it is refused', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.go('settings');
    type(rig.q<HTMLInputElement>('#settings-svc-url'), 'http://repository.example.org');
    rig.q('#settings-svc-save').click();
    await until(() => !!rig.q('#settings-service .status').textContent, 'the message');
    expect(rig.q('#settings-service .status').getAttribute('data-kind')).toBe('error');
    expect((await rig.area.get(KEYS.service))[KEYS.service]).toBeUndefined();
    type(rig.q<HTMLInputElement>('#settings-svc-url'), 'https://other.example.org/');
    rig.q('#settings-svc-save').click();
    await until(async () => (await rig.app.ctx.serviceUrl()) === 'https://other.example.org', 'the new address');
  });

  it('signs out: the session and cache go, unsent events stay under the account; "remove this device\'s data" removes them too', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, signedIn: true });
    await rig.app.ctx.whenSynced();
    service.netDown = true;
    await rig.app.ctx.record([cardAdded(A, 'zog', 'meaning-to-form', '2026-10-08T09:00:00.000Z')]);
    await rig.go('settings');
    rig.q('#sign-out').click();
    await until(() => rig.app.current() === 'signin', 'the sign-in screen');
    expect((await rig.area.get(KEYS.session))[KEYS.session]).toBeUndefined();
    expect((await rig.area.get(KEYS.profile))[KEYS.profile]).toBeUndefined();
    expect(service.calls).toContain('deleteSession');
    let keys = Object.keys(await rig.area.get(null));
    expect(keys.some((k) => k.startsWith('u:L1:queue:'))).toBe(true);

    await rig.signIn();
    await rig.go('settings');
    rig.q('#sign-out-forget').click();
    await until(() => rig.app.current() === 'signin', 'the sign-in screen');
    keys = Object.keys(await rig.area.get(null));
    expect(keys.filter((k) => k.startsWith('u:L1:'))).toEqual([]);
    expect(keys.filter((k) => k.startsWith('gopractice:prefs:L1'))).toEqual([]);
  });
});

describe('the review history and the transfer measures', () => {
  it('shows one item\'s history with the scheduler numbers labelled as bookkeeping', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, [...dueCard(A, 'zog', 'meaning-to-form'), reviewed(A, 'zog', 'meaning-to-form', 3, '2026-09-02T10:00:00.000Z')]);
    await rig.go(`review/history/${encodeURIComponent(`card:meaning-to-target-retrieval:${unitOf('zog')}`)}`);
    await until(() => !!rig.root.querySelector('#item-history table'), 'the history');
    const text = rig.q('#item-history').textContent!;
    expect(text).toContain('Reviewed 2 times');
    expect(text).toContain('Again');
    expect(text).toContain('Good');
    expect(text).toContain('retention bookkeeping, not a score of what you know');
    expect(rig.qa('#item-history tbody tr')).toHaveLength(2);
  });

  it('says plainly when the item is not in the deck', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.go('review/history/card%3Anothing');
    await until(() => !!rig.root.querySelector('#item-history p'), 'the message');
    expect(rig.q('#item-history').textContent).toContain('not in your deck');
  });

  it('presents the measures as research measures with their basis and what they cannot show', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, dueCard(A, 'zog', 'meaning-to-form'));
    await rig.go('review/transfer');
    await until(() => !!rig.root.querySelector('.measures'), 'the measures');
    expect(rig.q('#transfer-notice').textContent).toContain('Research measures, not conclusions');
    const card = rig.q(`.measures[data-unit="${unitOf('zog')}"]`);
    expect(card.querySelectorAll('.measure').length).toBeGreaterThanOrEqual(4);
    expect(card.textContent).toContain('Cannot show:');
    expect(card.textContent).toContain('Too little recorded to say anything');
    expect(rig.q('main').textContent).not.toMatch(/mastered|has learned|streak/i);
  });

  it('has nothing to measure on an empty record', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.go('review/transfer');
    await until(() => (rig.q('main').textContent ?? '').includes('Nothing has been reviewed yet'), 'the empty message');
  });
});
