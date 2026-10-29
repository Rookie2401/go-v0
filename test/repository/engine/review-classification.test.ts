import { describe, expect, it } from 'vitest';
import { canonicalReviewEventKey, classifyReviewEvents, selectReviewEvidenceEvents, type GoEvent } from '../../../packages/repository-contract/src';
import { foldEvents } from '../../../packages/repository-engine/src/projection';

const unit = 'lemma:sq:liber', card = 'card:written-recognition:' + unit;
const review = (id: string, at: string, parent: string | null | undefined, over: Record<string, unknown> = {}): GoEvent => ({
  id, v: 3, learnerId: 'L', enrolmentId: 'E', languageId: 'sq', at,
  producer: { app: 'gopractice-review', version: '1', deviceId: id }, kind: 'CardReviewed',
  subject: { cardId: card, itemIds: [unit] },
  payload: { cardKind: 'recognition', grade: 'good', correct: true, hinted: false, rating: 3,
    ...(parent !== undefined ? { expectedPreviousReviewId: parent } : {}), ...over },
  evidence: { quality: 'moderate', assisted: false },
});

describe('shared causal review classification', () => {
  it('keeps legacy sequential events compatible and recognizes direct independent siblings', () => {
    const legacy = review('legacy', '2026-10-05T00:00:00Z', undefined);
    const parent = review('parent', '2026-10-02T00:00:00Z', null);
    const siblingA = review('sibling-a', '2026-10-03T00:00:00Z', parent.id);
    const siblingB = review('sibling-b', '2026-10-03T00:00:00Z', parent.id);
    const sameDevice = { ...review('same-device', '2026-10-03T01:00:00Z', parent.id), producer: { app: 'gopractice-review' as const, version: '1', deviceId: 'sibling-a' } };
    const tooLate = review('too-late', '2026-10-04T01:00:00Z', parent.id);
    const stale = review('stale', '2026-10-01T00:00:00Z', parent.id);
    const missing = review('missing', '2026-10-04T00:00:00Z', 'never-received');
    const result = classifyReviewEvents([legacy, parent, siblingB, siblingA, sameDevice, tooLate, stale, missing]);
    expect(result.effectiveIds).toEqual(new Set(['parent', 'sibling-a']));
    expect(result.independentSiblingIds).toEqual(new Set(['sibling-b']));
    expect(result.excludedReasons.get('stale')).toMatch(/timestamp/);
    expect(result.excludedReasons.get('same-device')).toMatch(/same-device/);
    expect(result.excludedReasons.get('too-late')).toMatch(/24-hour/);
    expect(result.excludedReasons.get('missing')).toMatch(/unknown/);
    // Repo sees legacy, canonical root, and both legitimate same-predecessor attempts exactly once.
    const row = foldEvents([legacy, parent, siblingB, siblingA, sameDevice, tooLate, stale, missing], { modelVersion: 'test' })[0];
    expect(row.dimensions.readingRecognition.observations).toBe(4);
  });

  it('accepts a sibling just under 24 hours after the winner but not one at exactly 24 hours (the Known-spacing rule treats 24h as delayed)', () => {
    const parent = review('parent', '2026-10-02T00:00:00Z', null);
    const winner = review('winner', '2026-10-03T00:00:00Z', parent.id);
    const justUnder = review('just-under', '2026-10-03T23:59:59.999Z', parent.id);
    const exactly = review('exactly-24h', '2026-10-04T00:00:00Z', parent.id);
    const result = classifyReviewEvents([parent, winner, justUnder, exactly]);
    expect(result.effectiveIds).toEqual(new Set(['parent', 'winner']));
    expect(result.independentSiblingIds).toEqual(new Set(['just-under']));
    expect(result.excludedReasons.get('exactly-24h')).toMatch(/24-hour/);
    expect(result.independentSiblingIds.has('exactly-24h')).toBe(false);
  });

  it('rejects malformed, cross-card, cyclic and conflict-tainted claims without deleting raw events', () => {
    const root = review('root', '2026-10-01T00:00:00Z', null);
    const malformed = review('malformed', '2026-10-02T00:00:00Z', '' );
    const cross = { ...review('cross', '2026-10-02T00:00:00Z', root.id), subject: { cardId: 'other-card', itemIds: [unit] } };
    const a = review('cycle-a', '2026-10-02T00:00:00Z', 'cycle-b');
    const b = review('cycle-b', '2026-10-02T00:00:00Z', 'cycle-a');
    const conflictChild = review('conflict-child', '2026-10-03T00:00:00Z', 'conflict-parent');
    const result = classifyReviewEvents([root, malformed, cross, a, b, conflictChild], new Set(), new Set(['conflict-parent']));
    expect(result.effectiveIds).toEqual(new Set(['root']));
    expect(result.excludedReasons.get('malformed')).toMatch(/malformed/);
    expect(result.excludedReasons.get('cross')).toMatch(/different/);
    expect(result.excludedReasons.get('cycle-a')).toMatch(/cycle/);
    expect(result.excludedReasons.get('conflict-child')).toMatch(/conflicting/);
    expect(foldEvents([root, malformed, cross, a, b, conflictChild], { modelVersion: 'test' })[0].dimensions.readingRecognition.observations).toBe(1);
  });

  it('classifies a long valid causal history iteratively', () => {
    const base = Date.parse('2026-01-01T00:00:00Z');
    const chain = Array.from({ length: 10_000 }, (_, i) => review(`long-${i}`, new Date(base + i * 60_000).toISOString(), i ? `long-${i - 1}` : null));
    expect(classifyReviewEvents(chain).effectiveIds.size).toBe(10_000);
  });

  it('keeps diagnostics bounded through a long losing-sibling descendant chain and replays deterministically', () => {
    const base = Date.parse('2026-01-01T00:00:00Z');
    const root = review('root', new Date(base).toISOString(), null);
    const winner = review('a-winner', new Date(base + 60_000).toISOString(), root.id);
    const loser = review('z-loser', new Date(base + 60_000).toISOString(), root.id);
    const descendants = Array.from({ length: 10_000 }, (_, i) => review(
      `loser-child-${i}`,
      new Date(base + (i + 2) * 60_000).toISOString(),
      i ? `loser-child-${i - 1}` : loser.id,
    ));
    const rows = [root, winner, loser, ...descendants];
    const result = classifyReviewEvents(rows);
    const replay = classifyReviewEvents([...rows].reverse());

    expect(result.effectiveIds).toEqual(new Set([root.id, winner.id]));
    expect(result.excludedReasons.get(descendants.at(-1)!.id)).toMatch(/^causal predecessor excluded: /);
    expect(result.excludedReasons.get(descendants.at(-1)!.id)).toContain(result.excludedReasons.get(loser.id));
    expect(Math.max(...[...result.excludedReasons.values()].map((reason) => reason.length))).toBeLessThan(128);
    expect(replay.effectiveIds).toEqual(result.effectiveIds);
    expect(replay.independentSiblingIds).toEqual(result.independentSiblingIds);
    expect(replay.excludedReasons).toEqual(result.excludedReasons);
    expect(replay.resolvedParents).toEqual(result.resolvedParents);
    expect(rows).toHaveLength(10_003);
  });

  it('rebases a child after its predecessor is corrected while preserving raw history', () => {
    const parent = review('corrected-parent', '2026-10-01T00:00:00Z', null);
    const child = review('rebased-child', '2026-10-02T00:00:00Z', parent.id);
    const correction: GoEvent = { ...parent, id: 'parent-correction', at: '2026-10-03T00:00:00Z', correctionOf: parent.id,
      payload: { ...parent.payload, rating: null, challenged: true }, evidence: { quality: 'none', assisted: false } };
    const all = [parent, child, correction];
    const row = foldEvents(all, { modelVersion: 'test' })[0];
    expect(row.dimensions.readingRecognition.observations).toBe(1);
    expect(all).toHaveLength(3);
    expect(classifyReviewEvents(all, new Set(['corrected-parent'])).effectiveIds).toEqual(new Set(['rebased-child']));
    const selected = selectReviewEvidenceEvents(all);
    expect(selected.events.map((event) => event.id)).toEqual(['rebased-child']);
    expect(selected.rebasedNotes.get('rebased-child')).toContain('retracted predecessor rebased to root');
  });

  it('keeps assisted evidence separate and never lets an assisted review authorize an independent child', () => {
    const root = review('root-assist-case', '2026-10-01T00:00:00Z', null, { outcome: 'correct' });
    const assisted: GoEvent = {
      ...review('assisted-parent', '2026-10-01T01:00:00Z', root.id, { outcome: 'correct', hinted: true }),
      evidence: { quality: 'weak', assisted: true },
    };
    const child = review('independent-child', '2026-10-01T02:00:00Z', assisted.id, { outcome: 'correct' });
    const selected = selectReviewEvidenceEvents([root, assisted, child]);
    expect(selected.canonicalIds).toEqual(new Set([root.id]));
    expect(selected.assistedIds).toEqual(new Set([assisted.id]));
    expect(selected.events.map((event) => event.id)).toEqual([root.id, assisted.id]);
    expect(selected.excludedReasons.get(child.id)).toContain('unknown expectedPreviousReviewId');
    const row = foldEvents([root, assisted, child], { modelVersion: 'test' })[0]!;
    expect(row.dimensions.readingRecognition.observations).toBe(1);
    expect(row.dimensions.assistedRecognition.observations).toBe(1);
    expect(row.basis.events).toBe(2);
  });

  it('excludes conflicting event ids even for legacy review rows', () => {
    const first = review('conflicted-legacy', '2026-10-01T00:00:00Z', undefined);
    const second = { ...first, payload: { ...first.payload, correct: false, grade: 'again' } };
    const selected = selectReviewEvidenceEvents([first, second]);
    expect(selected.events).toEqual([]);
    expect(selected.excludedReasons.get(first.id)).toMatch(/conflicting/);
    expect(foldEvents([first, second], { modelVersion: 'test' })).toEqual([]);
  });

  it('treats reordered synchronized envelopes with seq/recordedAt as the same semantic event', () => {
    const local = review('synced-copy', '2026-10-01T00:00:00Z', null);
    const copy = Object.fromEntries(Object.entries(local).reverse()) as GoEvent & { seq: number; recordedAt: string };
    copy.payload = Object.fromEntries(Object.entries(local.payload).reverse());
    copy.producer = Object.fromEntries(Object.entries(local.producer).reverse()) as GoEvent['producer'];
    copy.seq = 42;
    copy.recordedAt = '2026-10-02T00:00:00Z';
    expect(canonicalReviewEventKey(local)).toBe(canonicalReviewEventKey(copy));
    const selected = selectReviewEvidenceEvents([local, copy]);
    expect(selected.events.map((event) => event.id)).toEqual([local.id]);
    expect(selected.excludedReasons.has(local.id)).toBe(false);
  });

  it('keeps nested payload seq and recordedAt in immutable identity', () => {
    const original = review('nested-server-fields', '2026-10-01T00:00:00Z', null);
    const changedRecordedAt = { ...original, payload: { ...original.payload, recordedAt: '2026-10-02T00:00:00Z' } };
    const changedSeq = { ...original, payload: { ...original.payload, seq: 7 } };
    expect(canonicalReviewEventKey(original)).not.toBe(canonicalReviewEventKey(changedRecordedAt));
    expect(canonicalReviewEventKey(original)).not.toBe(canonicalReviewEventKey(changedSeq));
    for (const changed of [changedRecordedAt, changedSeq]) {
      const selected = selectReviewEvidenceEvents([original, changed]);
      expect(selected.events).toEqual([]);
      expect(selected.excludedReasons.get(original.id)).toMatch(/conflicting/);
    }
  });
});
