// @vitest-environment jsdom
/**
 * GoReview's own model under a review scope (2026-11-17, docs/ecosystem/LANGUAGE-VARIETIES.md), through the real app: the model a screen
 * reads is built from ONE variety unless the learner names several; the choice is a stored preference; a saved copy made for one scope is
 * never shown for another. The fake service here answers like a service from before varieties (it ignores the scope it is asked for), so
 * everything below is enforced by GoReview itself. No screen is changed by any of it.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cardIdFor } from '../../packages/repository-contract/src';
import type { GoEvent, ReviewCandidate, UnitKnowledge } from '../../packages/repository-contract/src';
import { loadReviewModel } from '../../packages/goreview/app/workspace';
import { planCurrentDeck, planFromEntries } from '../../packages/goreview/app/deckModel';
import { FakeService, destroyRigs, makeRig, seed, type Rig } from './helpers';
import { cardAdded, cardReviewed, day, knowledgeOf, lookup, met } from '../varieties/helpers';

afterEach(() => destroyRigs());
const WR = 'written-recognition';
const LOGOS = 'lemma:el:λόγος:NOUN';   // Classical and Modern; a card in each
const THEOS = 'lemma:el:θεός:NOUN';    // Koine; a card
const AGAPE = 'lemma:el:ἀγάπη:NOUN';   // Koine; no card yet
const SPITI = 'lemma:el:σπίτι:NOUN';   // Modern; no card yet
const OLD = 'lemma:el:παλαιός:ADJ';    // nothing classifies it; an old card

/** The variety helpers write for 'learner-1' / 'enrol-1'; the rig's account is L1 with enrolment L1-e1. */
const asL1 = <T,>(x: T): T => JSON.parse(JSON.stringify(x).replaceAll('"learner-1"', '"L1"').replaceAll('"enrol-1"', '"L1-e1"')) as T;
const reading: GoEvent[] = asL1([
  ...met(LOGOS, 'el-att', 1), ...met(LOGOS, 'el-mod', 2, 'recognized', 'analysed'), ...met(THEOS, 'el-koi', 1), ...met(AGAPE, 'el-koi', 2),
  ...met(SPITI, 'el-mod', 2, 'recognized', 'analysed'), lookup(OLD, { at: day(1), weak: 'el-mod' }),
]);
const cards: GoEvent[] = asL1([
  cardAdded(LOGOS, { at: day(3), variety: 'el-att' }), cardReviewed(LOGOS, 3, { at: day(3, 11), variety: 'el-att' }),
  cardAdded(LOGOS, { at: day(3, 12), variety: 'el-mod' }), cardReviewed(LOGOS, 3, { at: day(3, 13), variety: 'el-mod' }),
  cardAdded(THEOS, { at: day(4), variety: 'el-koi' }), cardReviewed(THEOS, 3, { at: day(4, 11), variety: 'el-koi' }),
  cardAdded(OLD, { at: day(2), stamp: 'el-mod' }), cardReviewed(OLD, 3, { at: day(2, 11), stamp: 'el-mod' }),
]);
const rows: UnitKnowledge[] = knowledgeOf([...reading, ...cards]);
const proposal = (unitId: string): ReviewCandidate => ({ unitId, kind: 'lexeme', score: 0.8, reasons: [{ rule: 'looked-up-recently', weight: 0.6 }], targetDimension: 'readingRecognition',
  eligibility: { eligible: true, status: 'high-confidence', caveats: [] }, cost: 0.2 });

async function greekRig(enrolmentVariety: string | undefined = 'el-koi'): Promise<Rig> {
  const service = new FakeService();
  service.addAccount('ana@example.org', 'correct-horse-battery', 'L1', [{ languageId: 'el', ...(enrolmentVariety ? { varietyId: enrolmentVariety } : {}) }]);
  service.knowledge.set('L1', rows);
  service.candidates.set('L1-e1', [LOGOS, THEOS, AGAPE, SPITI, OLD].map(proposal));
  const rig = await makeRig({ service, signedIn: true });
  await seed(rig, [...reading, ...cards]);
  rig.clock.set('2026-10-20T10:00:00.000Z');
  return rig;
}
const ids = (items: Array<{ itemId: string }>): string[] => items.map((i) => i.itemId).sort();
const choose = (rig: Rig, scope: { varietyIds: string[]; includeUnsettled?: boolean } | undefined) => rig.app.ctx.state.updatePrefs('L1', 'el', { scope });

describe('the model is built for one variety unless the learner names several', () => {
  it('no choice: the enrolment\'s variety alone (Koine), with the unsettled old card and nothing Classical or Modern', async () => {
    const rig = await greekRig('el-koi');
    const model = (await loadReviewModel(rig.app.ctx))!;
    expect(model.varieties?.scope).toEqual({ languageId: 'el', varietyIds: ['el-koi'], includeUnsettled: true });
    expect(model.varieties?.chosen).toBe(false);
    expect(ids(model.deck)).toEqual([cardIdFor(OLD, WR), cardIdFor(THEOS, WR, 'el-koi')].sort());
    // the service was asked for this variety (a newer one ranks for it); this one ignored that, and GoReview still kept only Koine words
    expect(rig.service.candidateScopes.at(-1)).toEqual(['el-koi']);
    expect(model.candidates?.map((c) => [c.unitId, c.varietyId])).toEqual([[THEOS, 'el-koi'], [AGAPE, 'el-koi'], [OLD, undefined]]);
    expect(model.outcomes.map((o) => o.unitId).sort()).toEqual([AGAPE, OLD, THEOS].sort());
    expect(model.varieties?.excluded.map((x) => x.unitId).sort()).toEqual([LOGOS, LOGOS, LOGOS, SPITI].sort()); // two cards and the proposal of λόγος, and σπίτι
    // what a screen needs to offer another scope: every variety, and the cards of the whole deck by variety
    expect(model.varieties?.available.filter((v) => v.selectable).map((v) => v.id)).toEqual(['el-hom', 'el-att', 'el-koi', 'el-mod']);
    expect(model.varieties?.counts.map((c) => [c.varietyId, c.eligible])).toEqual([['el-att', 1], ['el-koi', 1], ['el-mod', 1], [undefined, 1]]);
    expect(model.counts.total).toBe(2);
  });

  it('the queue planned from it holds Koine work only, and the new Koine word becomes a Koine card', async () => {
    const rig = await greekRig('el-koi');
    const model = (await loadReviewModel(rig.app.ctx))!;
    const deck = await planCurrentDeck(rig.app.ctx, model);
    const planned = deck.plan.items.map((p) => p.item);
    expect(planned.map((i) => i.unitId).sort()).toEqual([AGAPE, OLD, THEOS].sort());
    expect(planned.find((i) => i.unitId === AGAPE)).toMatchObject({ itemId: cardIdFor(AGAPE, WR, 'el-koi'), varietyId: 'el-koi' });
    for (const item of planned) { expect(item.itemId).not.toContain('@el-att'); expect(item.itemId).not.toContain('@el-mod'); }
  });

  it('choosing Modern Greek is a stored preference; the model, its counts and its knowledge follow it', async () => {
    const rig = await greekRig('el-koi');
    await choose(rig, { varietyIds: ['el-modern'] }); // an alias is stored as the id it names
    expect((await rig.app.ctx.state.getPrefs('L1', 'el')).scope).toEqual({ varietyIds: ['el-mod'] });
    const model = (await loadReviewModel(rig.app.ctx))!;
    expect(model.varieties).toMatchObject({ chosen: true, scope: { varietyIds: ['el-mod'] } });
    expect(ids(model.deck)).toEqual([cardIdFor(LOGOS, WR, 'el-mod'), cardIdFor(OLD, WR)].sort());
    expect(model.candidates?.map((c) => [c.unitId, c.varietyId])).toEqual([[LOGOS, 'el-mod'], [SPITI, 'el-mod'], [OLD, undefined]]);
    expect(rig.service.candidateScopes.at(-1)).toEqual(['el-mod']);
    // λόγος is read as its Modern self, and what is known of it in Classical Greek is reported as familiarity, not as knowledge
    expect(model.knowledge.find((k) => k.unitId === LOGOS)?.level).toBe('recognized');
    expect(model.varieties?.transfer[LOGOS]).toEqual([{ unitId: LOGOS, fromVarietyId: 'el-att', relation: 'other-group', link: 'same-item', level: 'recognized', strength: 'weak' }]);
    // the choice survives a restart of the app's state (it is in the preferences record)
    expect((await rig.app.ctx.state.getPrefs('L1', 'el')).scope).toEqual({ varietyIds: ['el-mod'] });
  });

  it('several varieties are reviewed together only when named, each card keeping its own identity', async () => {
    const rig = await greekRig('el-koi');
    await choose(rig, { varietyIds: ['el-att', 'el-koi', 'el-mod'] });
    const model = (await loadReviewModel(rig.app.ctx))!;
    expect(model.varieties?.scope.varietyIds).toEqual(['el-att', 'el-koi', 'el-mod']);
    expect(ids(model.deck)).toEqual([cardIdFor(LOGOS, WR, 'el-att'), cardIdFor(LOGOS, WR, 'el-mod'), cardIdFor(THEOS, WR, 'el-koi'), cardIdFor(OLD, WR)].sort());
    expect(model.deck.filter((i) => i.unitId === LOGOS).map((i) => i.variety?.varietyId).sort()).toEqual(['el-att', 'el-mod']);
    expect(model.varieties?.excluded).toEqual([]);
  });

  it('in a combined scope a card of one variety neither covers nor blocks the proposal of the same word in another', async () => {
    // κόσμος: read in Plato and in a newspaper; a Classical card exists, a Modern one does not
    const KOSMOS = 'lemma:el:κόσμος:NOUN';
    const extra: GoEvent[] = asL1([...met(KOSMOS, 'el-att', 1), ...met(KOSMOS, 'el-mod', 5, 'recognized', 'analysed'), cardAdded(KOSMOS, { at: day(3), variety: 'el-att' }), cardReviewed(KOSMOS, 3, { at: day(3, 11), variety: 'el-att' })]);
    const rig = await greekRig('el-koi');
    rig.service.knowledge.set('L1', knowledgeOf([...reading, ...cards, ...extra]));
    rig.service.candidates.set('L1-e1', [KOSMOS, AGAPE].map(proposal));
    await seed(rig, extra);
    await choose(rig, { varietyIds: ['el-att', 'el-mod'] });
    const model = (await loadReviewModel(rig.app.ctx))!;
    const kosmos = model.outcomes.find((o) => o.unitId === KOSMOS)!;
    expect(kosmos.candidate.varietyId).toBe('el-mod');          // the task without a card
    expect(kosmos.proposed).toEqual({ dimension: WR, family: WR }); // still proposed: the Classical card is another task
    expect(kosmos.decision).not.toBe('already-covered');
    // in the Classical queue alone the same word IS covered, by its Classical card
    await choose(rig, { varietyIds: ['el-att'] });
    const classical = (await loadReviewModel(rig.app.ctx))!;
    expect(classical.outcomes.find((o) => o.unitId === KOSMOS)).toMatchObject({ decision: 'already-covered' });
  });

  it('a queue that leaves the unsettled out, and a choice the language does not know', async () => {
    const rig = await greekRig('el-koi');
    await choose(rig, { varietyIds: ['el-koi'], includeUnsettled: false });
    expect((await rig.app.ctx.state.getPrefs('L1', 'el')).scope).toEqual({ varietyIds: ['el-koi'], includeUnsettled: false });
    const strict = (await loadReviewModel(rig.app.ctx))!;
    expect(ids(strict.deck)).toEqual([cardIdFor(THEOS, WR, 'el-koi')]);
    expect(strict.outcomes.map((o) => o.unitId)).not.toContain(OLD);
    await choose(rig, { varietyIds: ['klingon'] });
    expect((await rig.app.ctx.state.getPrefs('L1', 'el')).scope).toBeUndefined(); // not stored; the default (the enrolment's variety) is back
    expect((await loadReviewModel(rig.app.ctx))!.varieties).toMatchObject({ chosen: false, scope: { varietyIds: ['el-koi'], includeUnsettled: true } });
  });

  it('an enrolment without a variety takes the one variety the deck shows was studied last, never all of them', async () => {
    const rig = await greekRig(undefined);
    const model = (await loadReviewModel(rig.app.ctx))!;
    expect(model.varieties?.scope.varietyIds).toHaveLength(1);
    expect(model.varieties?.scope.varietyIds).toEqual(['el-koi']); // the Koine card was answered last
  });
});

describe('saved copies and saved decks respect the scope', () => {
  it('this device\'s saved copy of one scope is not shown for another', async () => {
    const rig = await greekRig('el-koi');
    const live = (await loadReviewModel(rig.app.ctx))!;
    expect(live.candidateSource).toBe('live');
    const saved = await loadReviewModel(rig.app.ctx, { savedOnly: true });
    expect(saved?.varieties?.scope.varietyIds).toEqual(['el-koi']);
    expect(ids(saved!.deck)).toEqual(ids(live.deck));
    await choose(rig, { varietyIds: ['el-mod'] });
    expect(await loadReviewModel(rig.app.ctx, { savedOnly: true })).toBeUndefined(); // the Koine copy is not a Modern deck
    await loadReviewModel(rig.app.ctx);
    const again = await loadReviewModel(rig.app.ctx, { savedOnly: true });
    expect(again?.varieties?.scope.varietyIds).toEqual(['el-mod']);
    expect(again?.outcomes.map((o) => o.unitId)).not.toContain(THEOS);
  });

  it('offline, the saved copy is read under the scope it was made for and never grows another variety\'s words', async () => {
    const rig = await greekRig('el-koi');
    await loadReviewModel(rig.app.ctx);
    rig.service.allDown = true;
    const offline = (await loadReviewModel(rig.app.ctx))!;
    expect(offline.candidateSource).toBe('cached');
    expect(offline.varieties?.scope.varietyIds).toEqual(['el-koi']);
    expect(ids(offline.deck)).toEqual([cardIdFor(OLD, WR), cardIdFor(THEOS, WR, 'el-koi')].sort());
    expect(offline.outcomes.every((o) => [THEOS, AGAPE, OLD].includes(o.unitId))).toBe(true);
  });

  it('a saved deck asked again brings only the cards of the scope in force', async () => {
    const rig = await greekRig('el-koi');
    const model = (await loadReviewModel(rig.app.ctx))!;
    const entry = (unit: string, variety?: string) => ({ itemId: cardIdFor(unit, WR, variety), unitId: unit, unitKind: 'lexeme', label: unit, dimension: 'written-recognition' as const, family: 'written-recognition' as const });
    const plan = await planFromEntries(rig.app.ctx, model, [entry(THEOS, 'el-koi'), entry(LOGOS, 'el-att'), entry(LOGOS, 'el-mod'), entry(OLD)]);
    expect(plan.items.map((p) => p.item.itemId).sort()).toEqual([cardIdFor(OLD, WR), cardIdFor(THEOS, WR, 'el-koi')].sort());
  });
});

// Albanian was this file's example of a language without learning varieties until 2026-11-18, when its dialects became learning
// varieties (docs/ecosystem/LANGUAGE-VARIETIES.md section 10). A language without them is covered in test/varieties (German).
describe('Albanian: one dialect per queue, Standard unless the learner chooses', () => {
  it('a variety the language does not know is not kept; the model\'s scope is Standard alone; Gheg can be chosen, by the registry id or the adapter\'s code', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.app.ctx.state.updatePrefs('L1', 'sq', { scope: { varietyIds: ['sq-AL'] } });
    expect((await rig.app.ctx.state.getPrefs('L1', 'sq')).scope).toBeUndefined();
    const model = (await loadReviewModel(rig.app.ctx))!;
    expect(model.varieties?.scope.varietyIds).toEqual(['sq-standard']);
    expect(model.varieties?.chosen).toBe(false);
    expect(model.varieties?.available.filter((v) => v.selectable).map((v) => v.id)).toEqual(['sq-standard', 'sq-gheg']);
    expect(rig.service.candidateScopes.at(-1)).toEqual(['sq-standard']);
    await rig.app.ctx.state.updatePrefs('L1', 'sq', { scope: { varietyIds: ['aln'] } });
    expect((await rig.app.ctx.state.getPrefs('L1', 'sq')).scope?.varietyIds).toEqual(['sq-gheg']);
    const gheg = (await loadReviewModel(rig.app.ctx))!;
    expect(gheg.varieties?.scope.varietyIds).toEqual(['sq-gheg']);
    expect(gheg.varieties?.chosen).toBe(true);
    expect(rig.service.candidateScopes.at(-1)).toEqual(['sq-gheg']);
  });
});
