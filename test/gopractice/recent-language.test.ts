// @vitest-environment jsdom
/**
 * Several enabled languages: when the learner has not picked a language in GoPractice, the active one is the language of the MOST RECENT
 * reading event (the newest SelectionLookedUp across all enrolments); then the setup page's language; then the first enrolment. A pick in the
 * header switcher is remembered and wins from then on. The header says in one line when the language was chosen for the learner.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { CONTRACT_VERSION, validateEvent } from '../../packages/repository-contract/src';
import type { Enrolment, GoEvent } from '../../packages/repository-contract/src';
import { LOCAL_LEARNER, defaultService, destroyRigs, flush, makeRig, until } from './helpers';

afterEach(() => destroyRigs());

const lookedUp = (learnerId: string, enrolmentId: string, languageId: string, at: string, id = `lk-${languageId}-${at}`): GoEvent => {
  const e: GoEvent = {
    id, v: CONTRACT_VERSION, learnerId, enrolmentId, languageId, at, producer: { app: 'golearn-app', version: '1', deviceId: 'dev-ext' },
    kind: 'SelectionLookedUp', subject: { itemIds: [`lemma:${languageId}:fjale:NOUN`] },
    payload: { tokenCount: 1, contextKind: 'sentence', contextConfidence: 1, readerId: 'r1', helpShown: ['gloss'] },
  };
  expect(validateEvent(e)).toEqual([]);
  return e;
};

const optionLabels = (rig: Awaited<ReturnType<typeof makeRig>>): string[] => rig.qa<HTMLOptionElement>('#language-select option').map((o) => o.textContent ?? '');
const note = (rig: Awaited<ReturnType<typeof makeRig>>): string | undefined => rig.root.querySelector('#language-note')?.textContent ?? undefined;
/** GoPractice does not re-render a route it is already on: leave and return, so the header is read afresh. */
const rerender = async (rig: Awaited<ReturnType<typeof makeRig>>): Promise<void> => { await rig.go('settings'); await rig.go('review'); };
const pick = async (rig: Awaited<ReturnType<typeof makeRig>>, enrolmentId: string): Promise<void> => {
  const select = rig.q<HTMLSelectElement>('#language-select');
  select.value = enrolmentId;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await until(async () => (await rig.app.ctx.identity())?.enrolmentId === enrolmentId, 'the language to change');
  await flush(6);
};

describe('on the device (the extension\'s copy), with Albanian, German and Hindi enabled', () => {
  const enrolments: Array<Partial<Enrolment> & { languageId: string }> = [
    { languageId: 'sq', varietyId: 'sq-AL', startedAt: '2026-09-01T00:00:00.000Z' },
    { languageId: 'de', startedAt: '2026-09-02T00:00:00.000Z' },
    { languageId: 'hi', startedAt: '2026-09-03T00:00:00.000Z' },
  ];
  // the repository orders the newest enrolments first, so the first enrolment is the one set up last; ids are LOC-e1 (sq), LOC-e2 (de), LOC-e3 (hi)
  const E = { sq: 'LOC-e1', de: 'LOC-e2', hi: 'LOC-e3' };

  it('opens on the language of the newest lookup, lists every enrolled language and says why that one was chosen', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, local: { enrolments, activeLanguageId: 'hi' } });
    service.inject(LOCAL_LEARNER, lookedUp(LOCAL_LEARNER, E.sq, 'sq', '2026-10-05T10:00:00.000Z'));
    service.inject(LOCAL_LEARNER, lookedUp(LOCAL_LEARNER, E.de, 'de', '2026-10-07T10:00:00.000Z'));
    service.inject(LOCAL_LEARNER, lookedUp(LOCAL_LEARNER, E.sq, 'sq', '2026-10-06T10:00:00.000Z'));
    await rerender(rig);
    const id = await rig.app.ctx.identity();
    expect(id).toMatchObject({ languageId: 'de', enrolmentId: E.de, chosenBy: 'recent-reading' });
    expect(rig.q<HTMLSelectElement>('#language-select').value).toBe(E.de);
    expect(optionLabels(rig).sort()).toEqual(['de', 'hi', 'sq (sq-AL)']);
    expect(note(rig)).toBe('German: the language you read most recently');
    expect(rig.q('main').getAttribute('data-language')).toBe('de');
  });

  it('follows the reading: a newer lookup in another language moves the default there', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, local: { enrolments } });
    service.inject(LOCAL_LEARNER, lookedUp(LOCAL_LEARNER, E.de, 'de', '2026-10-07T10:00:00.000Z'));
    expect((await rig.app.ctx.identity())?.languageId).toBe('de');
    service.inject(LOCAL_LEARNER, lookedUp(LOCAL_LEARNER, E.sq, 'sq', '2026-10-08T09:00:00.000Z'));
    expect((await rig.app.ctx.identity())?.languageId).toBe('sq');
    await rerender(rig);
    expect(note(rig)).toBe('Albanian: the language you read most recently');
  });

  it('a pick in the switcher is remembered, drops the note, and is not overridden by later reading', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, local: { enrolments } });
    service.inject(LOCAL_LEARNER, lookedUp(LOCAL_LEARNER, E.de, 'de', '2026-10-07T10:00:00.000Z'));
    await rerender(rig);
    expect(note(rig)).toBeTruthy();
    await pick(rig, E.hi);
    expect(await rig.app.ctx.state.getActive(LOCAL_LEARNER)).toBe(E.hi);
    expect(await rig.app.ctx.identity()).toMatchObject({ languageId: 'hi', chosenBy: 'picked' });
    expect(note(rig)).toBeUndefined();
    service.inject(LOCAL_LEARNER, lookedUp(LOCAL_LEARNER, E.sq, 'sq', '2026-10-09T09:00:00.000Z')); // reading elsewhere afterwards
    expect((await rig.app.ctx.identity())?.languageId).toBe('hi');
    await rerender(rig);
    expect(rig.q<HTMLSelectElement>('#language-select').value).toBe(E.hi);
    expect(note(rig)).toBeUndefined();
  });

  it('with no reading yet it falls back to the language chosen in setup, then to the first enrolment', async () => {
    const withSetup = await makeRig({ service: defaultService(), local: { enrolments, activeLanguageId: 'de' } });
    expect(await withSetup.app.ctx.identity()).toMatchObject({ languageId: 'de', chosenBy: 'setup' });
    await rerender(withSetup);
    expect(note(withSetup)).toBeUndefined();
    destroyRigs();

    const bare = await makeRig({ service: defaultService(), local: { enrolments } });
    const id = await bare.app.ctx.identity();
    expect(id?.chosenBy).toBe('first');
    expect(id?.enrolmentId).toBe((await bare.app.ctx.enrolments())[0].enrolmentId);
  });

  it('ignores lookups in a language that is not enrolled, and lookups of other kinds', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, local: { enrolments, activeLanguageId: 'sq' } });
    service.inject(LOCAL_LEARNER, lookedUp(LOCAL_LEARNER, E.sq, 'fr', '2026-10-09T10:00:00.000Z')); // French is not enabled
    service.inject(LOCAL_LEARNER, { ...lookedUp(LOCAL_LEARNER, E.de, 'de', '2026-10-09T11:00:00.000Z', 'enc-1'), kind: 'EncounterRecorded', payload: { contextKind: 'sentence' } } as GoEvent);
    expect(await rig.app.ctx.identity()).toMatchObject({ languageId: 'sq', chosenBy: 'setup' });
  });
});

describe('with an account, and Albanian and German enabled', () => {
  const twoLanguages = () => {
    const service = defaultService();
    service.addAccount('duo@example.org', 'correct-horse-battery', 'L9', [{ languageId: 'sq', varietyId: 'sq-AL' }, { languageId: 'de' }]);
    return service; // enrolments L9-e1 (sq, started 09-01) and L9-e2 (de, started 09-02): the list is newest first, so German is first
  };

  it('opens on the language of the newest lookup that reached the log, with the one-line note, and lists both languages', async () => {
    const service = twoLanguages();
    service.inject('L9', lookedUp('L9', 'L9-e1', 'sq', '2026-10-08T08:00:00.000Z'));
    service.inject('L9', lookedUp('L9', 'L9-e2', 'de', '2026-10-07T08:00:00.000Z'));
    const rig = await makeRig({ service });
    await rig.signIn('duo@example.org');
    await rig.app.ctx.syncNow({ force: true });
    await rerender(rig);
    expect(await rig.app.ctx.identity()).toMatchObject({ learnerId: 'L9', languageId: 'sq', chosenBy: 'recent-reading' });
    expect(optionLabels(rig).sort()).toEqual(['de', 'sq (sq-AL)']);
    expect(rig.q<HTMLSelectElement>('#language-select').value).toBe('L9-e1');
    expect(note(rig)).toBe('Albanian: the language you read most recently');
  });

  it('a lookup that arrives later by sync moves the default; a pick is remembered through state and wins over it', async () => {
    const service = twoLanguages();
    service.inject('L9', lookedUp('L9', 'L9-e1', 'sq', '2026-10-06T08:00:00.000Z'));
    const rig = await makeRig({ service });
    await rig.signIn('duo@example.org');
    await rig.app.ctx.syncNow({ force: true });
    expect((await rig.app.ctx.identity())?.languageId).toBe('sq');
    service.inject('L9', lookedUp('L9', 'L9-e2', 'de', '2026-10-09T08:00:00.000Z'));
    await rig.app.ctx.syncNow({ force: true });
    expect((await rig.app.ctx.identity())?.languageId).toBe('de');

    await rerender(rig);
    await pick(rig, 'L9-e1');
    expect(await rig.app.ctx.state.getActive('L9')).toBe('L9-e1');
    service.inject('L9', lookedUp('L9', 'L9-e2', 'de', '2026-10-09T09:00:00.000Z', 'lk-later'));
    await rig.app.ctx.syncNow({ force: true });
    expect(await rig.app.ctx.identity()).toMatchObject({ languageId: 'sq', chosenBy: 'picked' });
    await rig.go('settings');
    await rerender(rig);
    expect(note(rig)).toBeUndefined();
  });

  it('with no lookups the first enrolment stands, with no note', async () => {
    const rig = await makeRig({ service: twoLanguages() });
    await rig.signIn('duo@example.org');
    await rerender(rig);
    expect(await rig.app.ctx.identity()).toMatchObject({ chosenBy: 'first' });
    expect(note(rig)).toBeUndefined();
  });
});
