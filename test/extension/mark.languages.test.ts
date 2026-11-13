// @vitest-environment node
/**
 * A learner's own mark is never lost to the language that happens to be selected (2026-11-05). The owner, reading in several languages with German
 * selected, pressed Known and Recognized and the word did not change: the event stayed on the device under the local pseudonym, and a signed-in card
 * reads the account. Now a mark goes under the enrolment of its word's language, marks already waiting go too, and the card reads the learner's own
 * newest mark wherever it is. Through the real worker and the real service handler.
 */
import { describe, expect, it } from 'vitest';
import type { GoEvent } from '../../packages/repository-contract/src';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { PENDING_IDENTITY, buildMarkEvent, buildSelectionEvent } from '../../packages/golearn-extension/src/store';
import { createRig, knowledgeRow, type Rig } from './rig';

const SESSION_KEY = 'golearn:session';

const cardOf = (languageId: string, unit: string, word: string): any => ({
  languageId, surface: word, itemIds: [unit], packId: `pack:${languageId}`, analyzerId: 'test', confidence: 0.9, constructions: [], pronunciation: [], phrases: [],
  tokenCount: 1, provenance: 'dictionary', unconfirmed: false, context: { kind: 'sentence', confidence: 0.9, sentence: `x ${word} y`, sentenceKey: `s-${word}`, selStart: 2, selEnd: 2 + word.length },
});
const ctx = (card: unknown, ms = 0, sessionId = 's-marks'): any => ({ card, readerId: 'web-generic', identity: { ...PENDING_IDENTITY }, version: '0.1.0', sessionId, now: new Date(Date.now() - 60_000 + ms) });

const ES = { lang: 'es', unit: 'lemma:es:libro:NOUN', word: 'libro' };
const DE = { lang: 'de', unit: 'lemma:de:Haus:NOUN', word: 'Haus' };
const SQ = { lang: 'sq', unit: 'lemma:sq:shkoj:VERB', word: 'shkoj' };
const mark = (w: typeof ES, level = 'known', ms = 0): GoEvent => buildMarkEvent(ctx(cardOf(w.lang, w.unit, w.word), ms), level as never);
const lookup = (w: typeof ES): GoEvent => buildSelectionEvent(ctx(cardOf(w.lang, w.unit, w.word), 0, `s-look-${w.word}`));

/** Signed in, enrolled in Albanian and Spanish, Albanian selected. */
async function twoLanguages(): Promise<{ rig: Rig; learnerId: string; sqId: string; esId: string }> {
  const rig = createRig();
  const who = await rig.signUp();
  await rig.connect();
  const es = await rig.page({ type: MSG.enrol, languageId: 'es', packId: 'pack:es', packVersion: '1', goals: [{ kind: 'reading' }] });
  expect(es).toMatchObject({ ok: true });
  const esId = (await rig.h.store.listEnrolments(who.learnerId)).find((e) => e.languageId === 'es')!.enrolmentId;
  expect(await rig.page({ type: MSG.selectEnrolment, enrolmentId: who.enrolmentId })).toMatchObject({ ok: true });
  expect((await rig.page({ type: 'golearn:status' })).languageId).toBe('sq');
  return { rig, learnerId: who.learnerId, sqId: who.enrolmentId, esId };
}
const sentMarks = (rig: Rig, learnerId: string) => rig.h.store.list({ learnerId, kinds: ['ItemMarked'] });
const cardRow = async (rig: Rig, w: typeof ES) => (await rig.content({ type: MSG.profile, unitIds: [w.unit], languageId: w.lang })).rows?.[w.unit];
const settle = async (rig: Rig): Promise<void> => { await rig.fireTimers(); await new Promise((r) => setTimeout(r, 50)); await rig.fireTimers(); await new Promise((r) => setTimeout(r, 50)); };
/** The session as a build from before the enrolments were kept left it. */
async function forgetEnrolments(rig: Rig): Promise<void> {
  const s = (await rig.fake.local.get(SESSION_KEY))[SESSION_KEY] as Record<string, unknown>;
  const { enrolments: _e, enrolmentsAt: _a, ...old } = s;
  await rig.fake.local.set({ [SESSION_KEY]: old });
}

describe('a mark in an enrolled language other than the selected one', () => {
  it('goes to the account under its own language\'s enrolment, never the selected one', async () => {
    const { rig, learnerId, esId } = await twoLanguages();
    expect(await rig.content({ type: MSG.record, event: mark(ES) })).toMatchObject({ ok: true, attributed: 'account' });
    await settle(rig);
    const sent = await sentMarks(rig, learnerId);
    expect(sent.map((e) => [e.languageId, e.enrolmentId, (e.payload as { mark?: string }).mark])).toEqual([['es', esId, 'known']]);
  });

  it('shows on the card at once, before any sync round', async () => {
    const { rig, learnerId } = await twoLanguages();
    await rig.content({ type: MSG.record, event: lookup(ES) });
    expect((await cardRow(rig, ES))?.selfMark).toBeUndefined(); // the card's first read: the account has nothing yet, and that is cached
    await rig.content({ type: MSG.record, event: mark(ES, 'recognized', 1000) });
    expect((await sentMarks(rig, learnerId))).toHaveLength(0);
    const row = await cardRow(rig, ES);
    expect(row?.selfMark?.mark).toBe('recognized');
    expect(row?.level).toBe('recognized');
  });

  it('leaves the selected language working as before', async () => {
    const { rig, learnerId, sqId } = await twoLanguages();
    expect(await rig.content({ type: MSG.record, event: mark(SQ, 'familiar') })).toMatchObject({ ok: true, attributed: 'account' });
    await settle(rig);
    expect((await sentMarks(rig, learnerId)).map((e) => e.enrolmentId)).toEqual([sqId]);
    expect((await cardRow(rig, SQ))?.selfMark?.mark).toBe('familiar');
  });
});

describe('what does not change', () => {
  it('a lookup in a language that is not selected still waits on the device (audit P-07: never filed under the selected enrolment)', async () => {
    const { rig, learnerId } = await twoLanguages();
    expect(await rig.content({ type: MSG.record, event: lookup(ES) })).toMatchObject({ ok: true, attributed: 'local' });
    await settle(rig);
    expect(await rig.h.store.list({ learnerId, kinds: ['SelectionLookedUp'] })).toHaveLength(0);
  });

  it('a mark in a language the account has no enrolment in stays on the device, the card still shows it, and it goes when the account enrols', async () => {
    const { rig, learnerId } = await twoLanguages();
    expect(await rig.content({ type: MSG.record, event: mark(DE) })).toMatchObject({ ok: true, attributed: 'local' });
    await settle(rig);
    expect(await sentMarks(rig, learnerId)).toHaveLength(0);
    expect((await cardRow(rig, DE))?.selfMark?.mark).toBe('known');
    expect(await rig.page({ type: MSG.enrol, languageId: 'de', packId: 'pack:de', packVersion: '1', goals: [{ kind: 'reading' }] })).toMatchObject({ ok: true });
    await settle(rig);
    expect((await sentMarks(rig, learnerId)).map((e) => e.languageId)).toEqual(['de']);
  });

  it('a newer mark from another device stands over an older one on this device; an older one does not', async () => {
    const { rig, learnerId } = await twoLanguages();
    await rig.content({ type: MSG.record, event: mark(SQ, 'recognized') }); // on this device, a minute ago
    const account = (level: string, at: string) => ({ ...knowledgeRow(learnerId, SQ.unit, { exposure: { observations: 4 } }), level, selfMark: { mark: level, at } });
    await rig.h.store.putKnowledge([account('known', new Date(Date.now() + 1000).toISOString())] as never);
    expect((await cardRow(rig, SQ))).toMatchObject({ level: 'known', selfMark: { mark: 'known' } });

    const later = await twoLanguages();
    await later.rig.content({ type: MSG.record, event: mark(SQ, 'recognized') });
    const old = { ...knowledgeRow(later.learnerId, SQ.unit, { exposure: { observations: 4 } }), level: 'familiar', encounters: 4, selfMark: { mark: 'familiar', at: '2026-01-01T00:00:00.000Z' } };
    await later.rig.h.store.putKnowledge([old] as never);
    expect((await cardRow(later.rig, SQ))).toMatchObject({ level: 'recognized', encounters: 4, selfMark: { mark: 'recognized' } });
  });
});

describe('marks already waiting on the device, from a build before this one', () => {
  it('go up after the first sync round reads the account\'s enrolments; the other events stay', async () => {
    const { rig, learnerId, esId } = await twoLanguages();
    await forgetEnrolments(rig);
    expect(await rig.content({ type: MSG.record, event: mark(ES) })).toMatchObject({ ok: true, attributed: 'local' });
    await rig.content({ type: MSG.record, event: lookup(ES) });
    expect(await sentMarks(rig, learnerId)).toHaveLength(0);
    await rig.page({ type: 'golearn:sync-now' });
    await settle(rig);
    expect((await sentMarks(rig, learnerId)).map((e) => [e.languageId, e.enrolmentId])).toEqual([['es', esId]]);
    expect(await rig.h.store.list({ learnerId, kinds: ['SelectionLookedUp'] })).toHaveLength(0);
    // and new marks go straight up from now on
    expect(await rig.content({ type: MSG.record, event: mark(ES, 'familiar', 5000) })).toMatchObject({ ok: true, attributed: 'account' });
  });

  it('the list of enrolments is not read again while it is fresh, and is read again once it is old', async () => {
    const { rig } = await twoLanguages();
    const reads = (): number => rig.log.filter((l) => l.method === 'GET' && l.path === '/enrolments').length;
    const before = reads();
    await rig.page({ type: 'golearn:sync-now' });
    await settle(rig);
    expect(reads()).toBe(before);
    rig.clock.now += 61 * 60_000;
    await rig.page({ type: 'golearn:sync-now' });
    await settle(rig);
    expect(reads()).toBe(before + 1);
  });
});
