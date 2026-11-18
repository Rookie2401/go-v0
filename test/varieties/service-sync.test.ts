// @vitest-environment node
/**
 * Test G, through the real service: two devices of one account (a reader and GoReview on a phone), a SQLite store, the projection and the
 * candidates route. Variety assignments, knowledge per variety, review histories and encounters are the same on both devices, and the
 * candidates asked for one variety never hold a word of another.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { CONTRACT_VERSION, cardIdFor, classifiedVarietiesOf, knowledgeInVariety, type GoEvent, type ReviewCandidate, type UnitKnowledge } from '../../packages/repository-contract/src';
import { openSqliteStore } from '../../packages/repository-store/src';
import { createProjectionEngine } from '../../packages/repository-engine/src';
import { createLinguisticService } from '../../packages/repository-linguistics/src';
import { createInProcessApi, type RepositoryApi } from '../../packages/repository-service/src';
import { adaptLinguistics } from '../../packages/repository-service/src/linguistics-adapter';
import { nodeCrypto } from '../../packages/repository-service/src/crypto-node';
import { policyFor } from '../../packages/repository-service/src/sourcePolicy';
import type { ServiceDeps } from '../../packages/repository-service/src/deps';
import { createFsrsScheduler, foldDeckItems } from '../../packages/goreview/src/scheduler';

const now = () => '2026-11-17T12:00:00.000Z';
const store = openSqliteStore(':memory:', { now });
const engine = createProjectionEngine({ store, now });
const deps: ServiceDeps = { store, engine, linguistics: adaptLinguistics(createLinguisticService(store, { now })), crypto: nodeCrypto, now, sourcePolicy: policyFor, log: () => {} };
afterAll(async () => { await store.close(); });

interface Device { api: RepositoryApi; learnerId: string; enrolmentId: string; deviceId: string }
const call = <T,>(r: { ok: boolean; status: number; data?: unknown; error?: string; message?: string }): T => {
  if (!r.ok) throw new Error(`request failed (${r.status}) ${r.error ?? ''}: ${r.message ?? ''}`);
  return r.data as T;
};
const passphrase = 'variety-sync-test-password';
async function device(email: string, deviceId: string, create: boolean): Promise<Device> {
  const api = createInProcessApi(deps);
  if (create) call(await api.createAccount({ email, password: passphrase }));
  const session = call<{ learnerId: string }>(await api.createSession({ email, password: passphrase, deviceId, platform: 'integration-test' }));
  if (create) {
    const enrolled = call<{ enrolment: { enrolmentId: string } }>(await api.enrol({ languageId: 'he', varietyId: 'he-bib', scriptId: 'Hebr', packId: 'pack:he', packVersion: '1', goals: [{ kind: 'reading' }] }));
    return { api, learnerId: session.learnerId, enrolmentId: enrolled.enrolment.enrolmentId, deviceId };
  }
  const enrolments = call<{ enrolments: Array<{ enrolmentId: string }> }>(await api.listEnrolments());
  return { api, learnerId: session.learnerId, enrolmentId: enrolments.enrolments[0]!.enrolmentId, deviceId };
}

const MELEKH = 'lemma:he:מלך:NOUN';   // read in the Bible and in a newspaper
const TORAH = 'lemma:he:תורה:NOUN';    // read in the Bible only
const MAHSHEV = 'lemma:he:מחשב:NOUN';  // read in a newspaper only
const at = (minute: number): string => `2026-11-16T10:${String(minute).padStart(2, '0')}:00.000Z`;
const ev = (d: Device, id: string, kind: GoEvent['kind'], subject: GoEvent['subject'], payload: Record<string, unknown>, app: GoEvent['producer']['app'], minute: number, extra: Partial<GoEvent> = {}): GoEvent => ({
  id, v: CONTRACT_VERSION, learnerId: d.learnerId, enrolmentId: d.enrolmentId, languageId: 'he', at: at(minute),
  producer: { app, version: 'test', deviceId: d.deviceId }, kind, subject, payload, dedupeKey: id, ...extra,
});
const lookup = (d: Device, id: string, unit: string, minute: number, variety: { declared?: string; analysed?: string }): GoEvent => ev(d, id, 'SelectionLookedUp', { itemIds: [unit], sentenceKey: `s-${id}` }, {
  tokenCount: 1, contextKind: 'sentence', contextConfidence: 1, readerId: 'r', helpShown: ['gloss'],
  ...(variety.declared ? { language: { languageId: 'he', varietyId: variety.declared, basis: 'override', confidence: 1, override: true } } : {}),
  ...(variety.analysed ? { variety: { varietyId: variety.analysed, basis: 'analysed' } } : {}),
}, 'golearn-ext', minute);

describe('one account, two devices, two varieties of Hebrew', () => {
  it('a reader records, GoReview reviews, and both hold the same variety-scoped knowledge and decks', async () => {
    const desk = await device('variety-sync@example.test', 'desktop', true);
    const phone = await device('variety-sync@example.test', 'phone', false);

    // the desktop reads the Bible (declared) and a newspaper (settled by the analyser), and marks a word while reading the Bible
    const reading: GoEvent[] = [
      lookup(desk, 'bib-1', MELEKH, 1, { declared: 'he-bib' }), lookup(desk, 'bib-2', TORAH, 2, { declared: 'he-bib' }),
      ev(desk, 'bib-mark', 'ItemMarked', { itemIds: [MELEKH], sentenceKey: 's-bib-1' }, { mark: 'known' }, 'golearn-ext', 3),
      lookup(desk, 'mod-1', MELEKH, 4, { analysed: 'he-mod' }), lookup(desk, 'mod-2', MAHSHEV, 5, { analysed: 'he-mod' }),
    ];
    const pushed = call<{ outcomes: Array<{ stored: boolean }> }>(await desk.api.syncPush({ deviceId: desk.deviceId, events: reading, clientTime: now() }));
    expect(pushed.outcomes.every((o) => o.stored)).toBe(true);

    // the phone sees the same knowledge, per variety
    const rowsOn = async (d: Device): Promise<Map<string, UnitKnowledge>> =>
      new Map(call<{ knowledge: UnitKnowledge[] }>(await d.api.knowledge([MELEKH, TORAH, MAHSHEV])).knowledge.map((r) => [r.unitId, r]));
    const onPhone = await rowsOn(phone);
    expect(classifiedVarietiesOf(onPhone.get(MELEKH))).toEqual(['he-bib', 'he-mod']);
    expect(knowledgeInVariety(onPhone.get(MELEKH)!, 'he-bib').knowledge.level).toBe('known');
    expect(knowledgeInVariety(onPhone.get(MELEKH)!, 'he-mod').knowledge.level).toBe('seen');
    expect(classifiedVarietiesOf(onPhone.get(TORAH))).toEqual(['he-bib']);
    expect(classifiedVarietiesOf(onPhone.get(MAHSHEV))).toEqual(['he-mod']);

    // candidates asked for one variety: only that variety's words, each tagged, each read in that variety
    const candidatesFor = async (varietyIds?: string[]): Promise<ReviewCandidate[]> =>
      call<{ candidates: ReviewCandidate[] }>(await phone.api.candidates(phone.enrolmentId, 200, undefined, undefined, varietyIds)).candidates;
    const biblical = await candidatesFor(['he-bib']);
    expect(biblical.map((c) => c.unitId)).not.toContain(MAHSHEV);
    expect(biblical.filter((c) => c.unitId === TORAH).map((c) => c.varietyId)).toEqual(['he-bib']);
    const modern = await candidatesFor(['he-mod']);
    expect(modern.map((c) => c.unitId)).not.toContain(TORAH);
    expect(modern.filter((c) => [MELEKH, MAHSHEV].includes(c.unitId)).map((c) => c.varietyId)).toEqual(expect.arrayContaining(['he-mod']));
    expect(modern.every((c) => c.varietyId === 'he-mod' || c.varietyId === undefined)).toBe(true);
    // without a scope the route answers as it always did: every word, no tag (an older GoReview keeps working)
    const whole = await candidatesFor();
    expect(whole.every((c) => c.varietyId === undefined)).toBe(true);
    expect(whole.map((c) => c.unitId)).toEqual(expect.arrayContaining([TORAH, MAHSHEV]));

    // the phone makes the Biblical card of מלך and answers it twice; the Modern card is made and left alone
    const bibCard = cardIdFor(MELEKH, 'written-recognition', 'he-bib'), modCard = cardIdFor(MELEKH, 'written-recognition', 'he-mod');
    const created = (cardId: string, id: string, variety: string, minute: number): GoEvent => ev(phone, id, 'CardAdded', { cardId, itemIds: [MELEKH] },
      { unitId: MELEKH, unitKind: 'lexeme', dimension: 'written-recognition', family: 'written-recognition', addedBy: 'intake' }, 'gopractice-review', minute, { varietyId: variety, evidence: { quality: 'none' } });
    const answered = (cardId: string, id: string, variety: string, minute: number, previous: string | null): GoEvent => ev(phone, id, 'CardReviewed', { cardId, itemIds: [MELEKH] },
      { cardKind: 'recognition', grade: 'good', correct: true, hinted: false, rating: 3, expectedPreviousReviewId: previous }, 'gopractice-review', minute, { varietyId: variety });
    const reviews = [created(bibCard, 'card-bib', 'he-bib', 10), answered(bibCard, 'rev-bib-1', 'he-bib', 11, null), answered(bibCard, 'rev-bib-2', 'he-bib', 40, 'rev-bib-1')];
    const sent = call<{ outcomes: Array<{ stored: boolean; issues?: unknown }> }>(await phone.api.submitReviews(reviews));
    expect(sent.outcomes.map((o) => o.stored)).toEqual([true, true, true]);

    // the Biblical card covers the word in the Biblical queue and does NOT hide it from the Modern queue (it is another learning task)
    expect((await candidatesFor(['he-bib'])).filter((c) => c.unitId === MELEKH && c.targetDimension === 'readingRecognition')).toEqual([]);
    expect((await candidatesFor(['he-mod'])).filter((c) => c.unitId === MELEKH).map((c) => c.varietyId)).toEqual(['he-mod']);
    // once the Modern card exists the Modern task is covered too
    expect(call<{ outcomes: Array<{ stored: boolean }> }>(await phone.api.submitReviews([created(modCard, 'card-mod', 'he-mod', 12)])).outcomes[0]?.stored).toBe(true);
    expect((await candidatesFor(['he-mod'])).filter((c) => c.unitId === MELEKH && c.targetDimension === 'readingRecognition')).toEqual([]);

    // both devices pull the whole log and fold the same deck: two cards of one word, one answered twice, one never
    const logOn = async (d: Device): Promise<GoEvent[]> => call<{ events: GoEvent[] }>(await d.api.syncPull({ deviceId: d.deviceId, afterSeq: 0 })).events;
    const fsrs = createFsrsScheduler({ desiredRetention: 0.9 });
    const deckOn = async (d: Device) => foldDeckItems(await logOn(d), fsrs, { languageId: 'he', now: now() });
    const [deskDeck, phoneDeck] = [await deckOn(desk), await deckOn(phone)];
    expect(deskDeck).toEqual(phoneDeck);
    expect(deskDeck.map((i) => [i.itemId, i.varietyId, i.history.length]).sort()).toEqual([[bibCard, 'he-bib', 2], [modCard, 'he-mod', 0]].sort());
    expect(deskDeck.find((i) => i.itemId === modCard)!.schedule).toEqual(fsrs.newState(at(12)));

    // and the same knowledge: the Biblical answers are Biblical evidence, the Modern item is still only Seen
    const [a, b] = [await rowsOn(desk), await rowsOn(phone)];
    expect([...a.values()]).toEqual([...b.values()]);
    const row = a.get(MELEKH)!;
    expect(knowledgeInVariety(row, 'he-bib').knowledge.dimensions.readingRecognition.observations).toBeGreaterThanOrEqual(2);
    expect(knowledgeInVariety(row, 'he-mod').knowledge.dimensions.readingRecognition.observations).toBe(0);
    expect(knowledgeInVariety(row, 'he-mod').knowledge.level).toBe('seen');
    expect(row.varieties?.['he-bib']).toMatchObject({ own: { review: 2, reader: 2 } });
    expect(row.varieties?.['he-mod']).toMatchObject({ own: { review: 0, reader: 1 } });

    // a rebuild from the stored log gives the rows the devices already hold
    const rebuilt = (await engine.rebuild(desk.learnerId)).filter((r) => [MELEKH, TORAH, MAHSHEV].includes(r.unitId));
    expect(rebuilt).toEqual([...(await rowsOn(desk)).values()].sort((x, y) => (x.unitId < y.unitId ? -1 : 1)));
  });

  it('refuses a malformed variety list and ignores varieties for a language that has none', async () => {
    const d = await device('variety-sync-2@example.test', 'desktop-2', true);
    const many = Array.from({ length: 17 }, (_, i) => `v${i}`);
    expect(await d.api.candidates(d.enrolmentId, 20, undefined, undefined, many)).toMatchObject({ ok: false, status: 422 });
    expect((await d.api.candidates(d.enrolmentId, 20, undefined, undefined, ['nonsense'])).ok).toBe(true);
  });
});
