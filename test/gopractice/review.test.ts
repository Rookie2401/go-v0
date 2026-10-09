// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { destroyRigs, defaultService, candidate, cardAdded, flush, ids, makeRig, queued, reopen, reviewed, seed, type, until, unitOf, type Rig, FakeService } from './helpers';

afterEach(() => destroyRigs());

const A = ids('L1', 'sq');


async function fixtureRig(): Promise<Rig> {
  const service = defaultService();
  service.candidates.set('L1-e1', [
    candidate('det', 0.8), candidate('diell', 0.3), candidate('hene', 0.05), candidate('zog', 0.9),
  ]);
  const rig = await makeRig({ service, signedIn: true });
  await seed(rig, [
    cardAdded(A, 'zog', 'meaning-to-form', '2026-09-01T09:00:00.000Z', { reason: 'you looked it up three times' }),
    reviewed(A, 'zog', 'meaning-to-form', 3, '2026-09-01T10:00:00.000Z'),
    cardAdded(A, 'mace', 'meaning-to-form', '2026-09-01T09:00:00.000Z'),
    reviewed(A, 'mace', 'meaning-to-form', 1, '2026-09-01T10:00:00.000Z'),
    cardAdded(A, 'shtepi', 'meaning-to-form', '2026-10-08T09:00:00.000Z'),
    reviewed(A, 'shtepi', 'meaning-to-form', 3, '2026-10-08T09:58:00.000Z'),
    cardAdded(A, 'qen', 'meaning-to-form', '2026-10-08T09:30:00.000Z'),
  ]);
  await reopen(rig);
  return rig;
}

describe('the due-review summary', () => {
  it('counts due, learning, new items, candidates and listening from the local log', async () => {
    const rig = await fixtureRig();
    // zog and mace were reviewed weeks ago, shtepi two minutes ago, qen never
    expect(rig.q('#count-due').textContent).toBe('2');
    expect(rig.q('#count-fresh').textContent).toBe('1');
    expect(Number(rig.q('#count-learning').textContent)).toBeGreaterThanOrEqual(1);
    // candidates worth testing: det (0.8, test now) and diell (0.3, test later); zog is already covered, hene is low priority
    expect(rig.q('#count-candidates').textContent).toBe('2');
    expect(rig.q('#listening-availability').textContent).toContain('practice only');
    // the scheduler identity is shown
    expect(rig.q('#due-summary').textContent).toContain('fsrs@');
  });

  it('says listening is not available when GoListen has no usable voice', async () => {
    const { fakeAudio } = await import('./helpers');
    const rig = await makeRig({ signedIn: true, audio: fakeAudio({ available: false }) });
    await reopen(rig);
    expect(rig.q('#listening-availability').textContent).toContain('not available: no Albanian voice is installed');
  });
});

describe('the candidate list', () => {
  it('shows every intake outcome with its reason, and a Why expander with the rule that fired', async () => {
    const rig = await fixtureRig();
    const row = (label: string): HTMLElement => rig.q(`[data-unit="${unitOf(label)}"]`);
    expect(row('det').getAttribute('data-decision')).toBe('test-now');
    expect(row('det').querySelector('.reason')!.textContent).toContain('score 0.80');
    expect(row('diell').getAttribute('data-decision')).toBe('test-later');
    expect(row('hene').getAttribute('data-decision')).toBe('low-priority');
    expect(row('hene').querySelector('.reason')!.textContent).toContain('below');
    expect(row('zog').getAttribute('data-decision')).toBe('already-covered');
    expect(row('zog').querySelector('.reason')!.textContent).toContain('already in the deck');
    const why = row('det').querySelector('details.why')!;
    expect(why.textContent).toContain('Test now');
    expect(why.textContent).toContain('you looked det up three times this week'); // the Repository's own detail
    expect(why.textContent).toContain('looked-up-recently');
  });

  it('"Test now" puts the item in the deck as a queued CardAdded; "Dismiss" records an ignore mark and stops proposing it', async () => {
    const rig = await fixtureRig();
    rig.q('[data-unit="' + unitOf('det') + '"] [data-act="test-now"]').click();
    await until(async () => (await queued(rig)).some((e) => e.kind === 'CardAdded'), 'the CardAdded');
    const added = (await queued(rig)).find((e) => e.kind === 'CardAdded')!;
    expect(added.payload).toMatchObject({ unitId: unitOf('det'), addedBy: 'learner', family: 'meaning-to-form' });
    expect(added.producer.app).toBe('gopractice-review');
    await until(() => rig.q('#count-fresh').textContent === '2', 'the deck to grow');
    // it is covered now
    expect(rig.q(`[data-unit="${unitOf('det')}"]`).getAttribute('data-decision')).toBe('already-covered');

    rig.q(`[data-unit="${unitOf('diell')}"] [data-act="dismiss"]`).click();
    await until(async () => (await queued(rig)).some((e) => e.kind === 'ItemMarked'), 'the ItemMarked');
    const mark = (await queued(rig)).find((e) => e.kind === 'ItemMarked')!;
    expect(mark.payload).toEqual({ mark: 'ignore' });
    expect(mark.subject.itemIds).toEqual([unitOf('diell')]);
    await until(() => !rig.root.querySelector(`[data-unit="${unitOf('diell')}"]`), 'the dismissed candidate to go');
  });

  it('"Later" keeps the candidate listed but out of the next session, and can be undone', async () => {
    const rig = await fixtureRig();
    rig.q(`[data-unit="${unitOf('det')}"] [data-act="later"]`).click();
    await until(() => rig.q(`[data-unit="${unitOf('det')}"]`).getAttribute('data-choice') === 'later', 'the later note');
    expect((await queued(rig)).length).toBe(0); // a note on this device, not an event
    rig.q(`[data-unit="${unitOf('det')}"] [data-act="later"]`).click();
    await until(() => !rig.q(`[data-unit="${unitOf('det')}"]`).hasAttribute('data-choice'), 'the undo');
  });

  it('falls back to the last list the service sent when it cannot be reached', async () => {
    const rig = await fixtureRig();
    rig.service.allDown = true;
    await reopen(rig);
    expect(rig.q('#candidates').textContent).toContain('these candidates are from');
    expect(rig.root.querySelector(`[data-unit="${unitOf('det')}"]`)).not.toBeNull();
  });
});

describe('the deck and its controls', () => {
  it('snoozes, suspends, dismisses and resumes an item as events, never by editing the deck', async () => {
    const rig = await fixtureRig();
    rig.root.querySelector<HTMLElement>('#deck')!.setAttribute('open', '');
    const itemOf = (label: string): HTMLElement => rig.q(`#deck [data-item$="${unitOf(label)}"]`);
    itemOf('qen').querySelector<HTMLElement>('[data-control="suspend"]')!.click();
    await until(() => itemOf('qen').getAttribute('data-status') === 'suspended', 'suspended');
    rig.clock.set('2026-10-08T10:01:00.000Z'); // events are ordered by time: a resume must come after the suspend
    itemOf('qen').querySelector<HTMLElement>('[data-control="resume"]')!.click();
    await until(() => itemOf('qen').getAttribute('data-status') === 'active', 'resumed');
    rig.clock.set('2026-10-08T10:02:00.000Z');
    itemOf('mace').querySelector<HTMLElement>('[data-control="snooze"]')!.click();
    await until(() => itemOf('mace').getAttribute('data-status') === 'snoozed', 'snoozed');
    itemOf('zog').querySelector<HTMLElement>('[data-control="dismiss"]')!.click();
    await until(() => itemOf('zog').getAttribute('data-status') === 'dismissed', 'dismissed');
    const kinds = (await queued(rig)).map((e) => `${e.kind}:${(e.payload as { reason?: string }).reason ?? ''}`);
    expect(kinds).toEqual(['CardRemoved:suspended', 'CardAdded:resumed by the learner', 'CardRemoved:snoozed', 'CardRemoved:dismissed']);
  });
});

describe('the one active language', () => {
  async function twoLanguages(): Promise<{ rig: Rig; service: FakeService }> {
    const service = new FakeService();
    service.addAccount('ana@example.org', 'correct-horse-battery', 'L1', [{ languageId: 'sq', varietyId: 'sq-AL' }, { languageId: 'de' }]);
    const rig = await makeRig({ service, signedIn: true });
    const sq = ids('L1', 'sq');
    const de = { learnerId: 'L1', enrolmentId: 'L1-e2', languageId: 'de' };
    await seed(rig, [
      cardAdded(sq, 'zog', 'meaning-to-form', '2026-09-01T09:00:00.000Z'), reviewed(sq, 'zog', 'meaning-to-form', 3, '2026-09-01T10:00:00.000Z'),
      cardAdded(de, 'hund', 'meaning-to-form', '2026-09-01T09:00:00.000Z', { lang: 'de' }),
      cardAdded(de, 'katze', 'meaning-to-form', '2026-09-01T09:00:00.000Z', { lang: 'de' }),
      cardAdded(de, 'haus', 'meaning-to-form', '2026-09-01T09:00:00.000Z', { lang: 'de' }),
    ]);
    await reopen(rig);
    return { rig, service };
  }

  it('re-folds the deck for the language it switches to, from the same local log', async () => {
    const { rig } = await twoLanguages();
    // the newest enrolment is active by default: de (three new items); sq is the other
    const select = rig.q<HTMLSelectElement>('#language-select');
    expect(select.options.length).toBe(2);
    const first = select.value;
    const counts = (): string => `${rig.q('#count-due').textContent}/${rig.q('#count-fresh').textContent}`;
    const before = counts();
    select.value = first === 'L1-e1' ? 'L1-e2' : 'L1-e1';
    select.dispatchEvent(new Event('change'));
    await until(() => counts() !== before, 'the other language');
    const after = counts();
    expect(new Set([before, after])).toEqual(new Set(['0/3', '1/0']));
    expect(rig.q('main').getAttribute('data-language')).toMatch(/^(de|sq-AL)$/);
    // the choice is remembered
    expect(await rig.app.ctx.state.getActive('L1')).toBe(select.value);
  });
});

describe('the session controls', () => {
  it('are saved as ReviewPreferences on every change and survive a restart', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, signedIn: true });
    await reopen(rig);
    rig.root.querySelector<HTMLElement>('#session-controls')!.setAttribute('open', '');
    type(rig.q<HTMLInputElement>('#pref-minutes'), '25');
    type(rig.q<HTMLInputElement>('#pref-max-new'), '3');
    type(rig.q<HTMLInputElement>('#pref-retention'), '85');
    const listening = rig.q<HTMLInputElement>('#pref-listening');
    listening.checked = true; listening.dispatchEvent(new Event('change'));
    const saved = rig.q<HTMLInputElement>('#pref-saved');
    saved.checked = false; saved.dispatchEvent(new Event('change'));
    await until(async () => (await rig.app.ctx.state.getPrefs('L1', 'sq')).includeListening, 'the preferences to be saved');
    await flush(4);
    expect(await rig.app.ctx.state.getPrefs('L1', 'sq')).toEqual({
      languageId: 'sq', sessionMinutes: 25, maxNew: 3, desiredRetention: 0.85, includeListening: true, grammarShare: 0.2, prioritizeSaved: false,
    });
    const { area } = rig;
    rig.app.destroy();
    const again = await makeRig({ service, area }); // the session is in the area: signed in already
    await until(() => !!again.root.querySelector('#due-summary'), 'the review home');
    again.root.querySelector<HTMLElement>('#session-controls')!.setAttribute('open', '');
    expect(again.q<HTMLInputElement>('#pref-minutes').value).toBe('25');
    expect(again.q<HTMLInputElement>('#pref-listening').checked).toBe(true);
    expect(again.q<HTMLInputElement>('#pref-saved').checked).toBe(false);
  });

  it('clamps nonsense instead of storing it', async () => {
    const rig = await makeRig({ signedIn: true });
    await reopen(rig);
    type(rig.q<HTMLInputElement>('#pref-minutes'), '9999');
    await until(async () => (await rig.app.ctx.state.getPrefs('L1', 'sq')).sessionMinutes === 120, 'the clamp');
    type(rig.q<HTMLInputElement>('#pref-retention'), '10');
    await until(async () => (await rig.app.ctx.state.getPrefs('L1', 'sq')).desiredRetention === 0.7, 'the clamp');
  });
});
