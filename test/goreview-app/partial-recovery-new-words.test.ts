// @vitest-environment jsdom
/**
 * The owner's Hindi deck (2026-11-15): "despite the fact that I have 20 cards enabled for Hindi, the deck insists on giving me 2".
 * On their phone the Hindi recovery of words with no catalogue unit never completed, and from 2026-11-02 an incomplete recovery
 * replaced the whole live model with the last complete saved copy and ITS intake outcomes. The words that copy proposed were all in the
 * deck by 2026-11-01, so no new word could reach test-now again: every deck was just the one or two cards due. The server's log shows
 * 0 Hindi CardAdded after 2026-11-01 while reviews went on. An incomplete recovery now keeps the live candidates and runs intake on them.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { ReviewCandidate, UnitKnowledge } from '../../packages/repository-contract/src';
import type { VocabularyItem } from '../../packages/repository-service/src/api';
import { forgetRecoveryScans, loadReviewModel } from '../../packages/goreview/app/workspace';
import { planCurrentDeck } from '../../packages/goreview/app/deckModel';
import { candidatesKey, snapshotKey } from '../../packages/goreview/app/state';
import { buildCardAdded, FAMILY_DIMENSION } from '../../packages/goreview/src';
import { FakeService, destroyRigs, knowledgeRow, makeRig, seed } from './helpers';

afterEach(() => { destroyRigs(); });

const ok = <T>(data: T) => ({ ok: true as const, status: 200, data });
const oldWord = 'form:he:בָּרָא';
const newWord = 'form:he:אֶרֶץ';
const recovered = (unitId: string): ReviewCandidate => ({
  unitId, kind: 'form', score: 0.8, reasons: [{ rule: 'recentEncounter', weight: 0.15 }], targetDimension: 'readingRecognition',
  eligibility: { eligible: true, status: 'high-confidence', caveats: [] }, cost: 0.2,
});
const unknown = (unitId: string): ReviewCandidate => ({
  unitId, kind: 'unknown', score: 0, reasons: [], targetDimension: 'readingRecognition',
  eligibility: { eligible: false, status: 'unknown', reason: 'unit is not in the linguistic store' }, cost: 0.2,
});
const row = (unitId: string): UnitKnowledge => ({ ...knowledgeRow('L1', unitId, 'he', {}), analysisStatus: 'high-confidence' } as UnitKnowledge);
const vocab = (unitId: string): VocabularyItem => ({ knowledge: row(unitId), surfaceForms: [unitId.slice('form:he:'.length)], sources: [] });

describe('an incomplete recovery does not freeze new words (the owner\'s Hindi deck, 2026-11-15)', () => {
  it('admits a word met since the last complete load although that load\'s proposals are all in the deck', async () => {
    const service = new FakeService();
    service.addAccount('ana@example.org', 'correct-horse-battery', 'L1', [{ languageId: 'he', varietyId: 'he-bib' }]);
    const rig = await makeRig({ service, signedIn: true });
    rig.app.ctx.engine.canRecoverCandidates = () => true;
    rig.app.ctx.engine.exerciseReadiness = async () => ({ available: true });
    const identity = (await rig.app.ctx.identity())!;
    await rig.area.remove([snapshotKey(identity.learnerId, identity.languageId), ...(await rig.area.list(candidatesKey(identity.learnerId, identity.enrolmentId)))]);
    const api = (await rig.app.ctx.api()).api;

    // 1. a complete load: the old word is recovered and proposed, and the complete copy is saved
    let words = [oldWord];
    let recoveryComplete = true;
    Object.assign(api, {
      async candidates() { return ok({ candidates: words.map(unknown) }); },
      async knowledge(unitIds?: string[]) { return ok({ knowledge: (unitIds ?? words).filter((id) => words.includes(id)).map(row) }); },
      async vocabulary() { return ok({ items: words.map(vocab) }); },
      async units(unitIds: string[]) { return ok({ units: {}, missing: unitIds }); },
    });
    rig.app.ctx.engine.recoverCandidates = async (request) => ({
      candidates: request.unresolvedVocabulary.map((item) => recovered(item.knowledge.unitId)).filter((c) => recoveryComplete || c.unitId === newWord),
      complete: recoveryComplete, ...(recoveryComplete ? {} : { note: 'Some he pack facts could not be loaded; recovered candidates may be incomplete.' }),
    });
    const first = await loadReviewModel(rig.app.ctx);
    const proposal = first!.outcomes.find((o) => o.unitId === oldWord);
    expect(proposal?.decision).toBe('test-now');
    const key = snapshotKey(identity.learnerId, identity.languageId);
    const saved = (await rig.area.get(key))[key] as { model?: { savedAt: string } };
    expect(saved.model?.savedAt).toBeDefined();

    // 2. that proposal became a card (as the owner's last Hindi words did on 2026-11-01)
    await seed(rig, [buildCardAdded({
      learnerId: 'L1', enrolmentId: identity.enrolmentId, languageId: 'he', at: '2026-11-01T02:43:03.147Z', deviceId: 'dev-phone',
      unitId: oldWord, unitKind: 'form', dimension: proposal!.proposed!.dimension, family: proposal!.proposed!.family, addedBy: 'intake',
    })]);
    expect(FAMILY_DIMENSION[proposal!.proposed!.family]).toBe(proposal!.proposed!.dimension);

    // 3. a word is met since, and from now on the recovery never completes on this device (the old word's facts keep failing)
    words = [oldWord, newWord];
    recoveryComplete = false;
    forgetRecoveryScans(rig.app.ctx);
    const later = await loadReviewModel(rig.app.ctx);
    expect(later?.candidateRecoveryIncomplete).toBe(true);
    expect(later?.candidateSource).toBe('live');
    expect(later?.outcomes.find((o) => o.unitId === newWord)?.decision).toBe('test-now');
    const plan = await planCurrentDeck(rig.app.ctx, later!, new Set(), undefined, 'current');
    expect(plan.entries.some((entry) => entry.unitId === newWord)).toBe(true);
    // the incomplete load does not replace the last complete copy
    const after = (await rig.area.get(key))[key] as { model?: { savedAt: string } };
    expect(after.model?.savedAt).toBe(saved.model?.savedAt);
  });

  it('carries over a word only the last complete load knew, with its knowledge read now', async () => {
    const service = new FakeService();
    service.addAccount('ana@example.org', 'correct-horse-battery', 'L1', [{ languageId: 'he', varietyId: 'he-bib' }]);
    const rig = await makeRig({ service, signedIn: true });
    rig.app.ctx.engine.canRecoverCandidates = () => true;
    rig.app.ctx.engine.exerciseReadiness = async () => ({ available: true });
    const identity = (await rig.app.ctx.identity())!;
    await rig.area.remove([snapshotKey(identity.learnerId, identity.languageId), ...(await rig.area.list(candidatesKey(identity.learnerId, identity.enrolmentId)))]);
    const api = (await rig.app.ctx.api()).api;
    let complete = true;
    Object.assign(api, {
      async candidates() { return ok({ candidates: [] }); },
      async knowledge(unitIds?: string[]) { return ok({ knowledge: (unitIds ?? [oldWord]).filter((id) => id === oldWord).map(row) }); },
      async vocabulary() { return ok({ items: [vocab(oldWord)] }); },
      async units(unitIds: string[]) { return ok({ units: {}, missing: unitIds }); },
    });
    rig.app.ctx.engine.recoverCandidates = async () => (complete
      ? { candidates: [recovered(oldWord)], complete: true }
      : { candidates: [], complete: false, note: 'Some he pack facts could not be loaded; recovered candidates may be incomplete.' });
    expect((await loadReviewModel(rig.app.ctx))!.outcomes.find((o) => o.unitId === oldWord)?.decision).toBe('test-now');

    complete = false;
    forgetRecoveryScans(rig.app.ctx);
    const later = await loadReviewModel(rig.app.ctx);
    expect(later?.candidateSource).toBe('live');
    expect(later?.candidates?.some((c) => c.unitId === oldWord && c.eligibility.status === 'high-confidence')).toBe(true);
    expect(later?.outcomes.find((o) => o.unitId === oldWord)?.decision).toBe('test-now');
    expect(later?.candidateNote).toContain("1 word the refresh could not check comes from this device's word data of");
  });
});
