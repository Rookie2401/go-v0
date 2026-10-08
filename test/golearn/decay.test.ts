/**
 * Forgetting (policy.ts DECAY; audit 2026-10-07 item 5): an item not met for DECAY.weeks no longer stands as recognized / likely
 * familiar. It counts half until it is met again (any encounter, a heard one and a recall included). The standing is computed at READ
 * time (`effectiveStanding`), so the stored level and estimate never change.
 */
import { describe, expect, it } from 'vitest';
import { buildFixtureText, ids } from '../../src/core';
import { DECAY, DECAY_MS, POLICY_VERSION } from '../../src/golearn/policy';
import { effectiveStanding, lastMetAt } from '../../src/golearn/queries';
import { createHarness } from './harness';
import type { Harness } from './harness';

const U = 'u1';
const LUZ = ids.form('es', 'luz');
const DAY = 86_400_000;
const WEEK = 7 * DAY;
/** The time `days` after an ISO time. */
const after = (iso: string, days: number) => new Date(Date.parse(iso) + days * DAY).toISOString();

/** Four sentences that all contain "luz": one session can hold four encounters of one item. */
async function buildLuz(h: Harness) {
  await buildFixtureText(h.store, {
    lang: 'es', slug: 'luz',
    sentences: Array.from({ length: 4 }, (_, i) => ({ tokens: [{ surface: 'la', lemma: 'la', pos: 'DET' as const }, { surface: 'luz', lemma: 'luz', pos: 'NOUN' as const }, { surface: `n${i}`, lemma: `n${i}`, pos: 'NOUN' as const }] })),
  });
  return 'text:es:luz';
}

/** "luz" recognized: two demonstrated sentences in two sittings. */
async function recognized(h: Harness) {
  const t = await buildLuz(h);
  await h.understood(U, 'es', t, [0], 's1');
  await h.understood(U, 'es', t, [1], 's2');
  const row = (await h.golearn.getItemState(U, LUZ))!;
  expect(row.reading.level).toBe('recognized');
  return { t, row };
}

describe('the decay constants', () => {
  it('six weeks, half credit, and no version bump (the standing is derived at read time)', () => {
    expect(DECAY).toEqual({ weeks: 6, halfCredit: true });
    expect(DECAY_MS).toBe(6 * WEEK);
    expect(POLICY_VERSION).toBe('evidence@8');
  });
});

describe('effectiveStanding: recognized', () => {
  it('an item recognized and not met for 7 weeks is "met before, decayed": weight 0.5 and decayed', async () => {
    const h = createHarness();
    const { row } = await recognized(h);
    const met = lastMetAt(row)!;
    expect(met).toBe(row.lastSeenAt);

    const fresh = effectiveStanding(row, after(met, 1));
    expect(fresh).toMatchObject({ level: 'recognized', decayed: false, weight: 1 });

    const edge = effectiveStanding(row, after(met, 41));
    expect(edge).toMatchObject({ decayed: false, weight: 1 });

    const decayed = effectiveStanding(row, after(met, 49)); // 7 weeks
    expect(decayed).toMatchObject({ level: 'encountered', storedLevel: 'recognized', decayed: true, weight: 0.5, idleDays: 49 });
    expect(effectiveStanding(row, after(met, 42))).toMatchObject({ decayed: true, weight: 0.5 }); // exactly DECAY.weeks
  });

  it('accepts a Date or epoch milliseconds as the moment', async () => {
    const h = createHarness();
    const { row } = await recognized(h);
    const ms = Date.parse(lastMetAt(row)!) + 49 * DAY;
    expect(effectiveStanding(row, ms).weight).toBe(0.5);
    expect(effectiveStanding(row, new Date(ms)).weight).toBe(0.5);
  });

  it('nothing stored changes: the level and the estimate stay what the evidence made them, before and after the weeks pass', async () => {
    const h = createHarness();
    const { row } = await recognized(h);
    h.advance(60 * DAY);
    const again = (await h.golearn.getItemState(U, LUZ))!;
    expect(again).toEqual(row);
    expect(again.reading.level).toBe('recognized');
  });

  it('meeting it again restores full credit at once, however weak the new encounter (a help-free view is enough)', async () => {
    const h = createHarness();
    const { t, row } = await recognized(h);
    const before = lastMetAt(row)!;
    h.advance(50 * DAY);
    expect(effectiveStanding(row, new Date(Date.parse(before) + 50 * DAY)).decayed).toBe(true);

    await h.view(U, 'es', t, 2, 's3'); // an exposure: it proves no understanding, but it is a meeting
    const met = (await h.golearn.getItemState(U, LUZ))!;
    expect(met.reading.level).toBe('recognized'); // stored level untouched
    expect(lastMetAt(met)! > before).toBe(true);
    expect(effectiveStanding(met, after(lastMetAt(met)!, 3))).toMatchObject({ level: 'recognized', decayed: false, weight: 1 });
    // ...and the clock starts again from that meeting
    expect(effectiveStanding(met, after(lastMetAt(met)!, 43))).toMatchObject({ decayed: true, weight: 0.5 });
  });

  it('a heard encounter counts as meeting it (listening included)', async () => {
    const h = createHarness();
    const { t, row } = await recognized(h);
    const before = lastMetAt(row)!;
    h.advance(50 * DAY);
    await h.listen(U, 'es', t, [3], { session: 'l1' });
    const heard = (await h.golearn.getItemState(U, LUZ))!;
    expect(heard.listening.level).not.toBe('unseen');
    expect(lastMetAt(heard)! > before).toBe(true);
    expect(effectiveStanding(heard, after(lastMetAt(heard)!, 1))).toMatchObject({ decayed: false, weight: 1 });
  });

  it('a correct recall (a ProductionRecorded) counts as meeting it, whichever dimension it is recorded in', async () => {
    const h = createHarness();
    const { row } = await recognized(h);
    const before = lastMetAt(row)!;
    h.advance(50 * DAY);
    // ANY ProductionRecorded for the item is a meeting; the standing reads every dimension's last evidence.
    await h.produce(U, 'es', LUZ, 'independent', { modality: 'writing' });
    const after1 = (await h.golearn.getItemState(U, LUZ))!;
    expect(after1.writing.lastEvidenceAt).toBeDefined();
    expect(lastMetAt(after1)! > before).toBe(true);
    expect(effectiveStanding(after1, after(lastMetAt(after1)!, 2))).toMatchObject({ level: 'recognized', decayed: false, weight: 1 });
  });

  it('a retrieval recall (package R1: a writing ProductionRecorded whose dedupeKey starts with "retrieval:") and a spoken production restore it too', async () => {
    const h = createHarness();
    const { row } = await recognized(h);
    const before = lastMetAt(row)!;
    h.advance(50 * DAY);
    expect(effectiveStanding(row, new Date(Date.parse(before) + 50 * DAY)).decayed).toBe(true);
    await h.bus.emit({
      type: 'ProductionRecorded', userId: U, lang: 'es', session: 'r1', surface: 'corpus', dedupeKey: 'retrieval:u1:luz:1',
      itemId: LUZ, itemKind: 'form', kind: 'independent', modality: 'writing', revisionId: 'retrieval:1', sentenceText: 'la luz n0',
    } as never);
    const recalled = (await h.golearn.getItemState(U, LUZ))!;
    expect(recalled.reading.level).toBe('recognized'); // reading standing is untouched; only the date moved
    expect(lastMetAt(recalled)! > before).toBe(true);
    expect(effectiveStanding(recalled, after(lastMetAt(recalled)!, 2))).toMatchObject({ level: 'recognized', decayed: false, weight: 1 });
    expect(effectiveStanding(recalled, after(lastMetAt(recalled)!, 43))).toMatchObject({ decayed: true, weight: 0.5 });

    // a spoken production does the same (the speaking dimension's date counts)
    h.advance(60 * DAY);
    await h.produce(U, 'es', LUZ, 'independent', { modality: 'speaking' });
    const spoken = (await h.golearn.getItemState(U, LUZ))!;
    expect(spoken.speaking.lastEvidenceAt).toBeDefined();
    expect(lastMetAt(spoken)! > lastMetAt(recalled)!).toBe(true);
  });
});

describe('effectiveStanding: the "likely familiar" estimate', () => {
  async function familiar(h: Harness) {
    const t = await buildLuz(h);
    await h.viewAll(U, 'es', t, 4, 's1');
    await h.viewAll(U, 'es', t, 4, 's2');
    const row = (await h.golearn.getItemState(U, LUZ))!;
    expect(row.reading.estimatedFamiliar).toBe(true);
    expect(row.reading.level).toBe('encountered');
    return { t, row };
  }

  it('stands while it is met, and expires after DECAY.weeks without an encounter', async () => {
    const h = createHarness();
    const { row } = await familiar(h);
    const met = lastMetAt(row)!;
    expect(effectiveStanding(row, after(met, 10))).toMatchObject({ decayed: false, weight: 1, estimated: true });
    expect(effectiveStanding(row, after(met, 49))).toMatchObject({ decayed: true, weight: 0.5, estimated: false, level: 'encountered' });
  });

  it('a new encounter brings the estimate back at once', async () => {
    const h = createHarness();
    const { t, row } = await familiar(h);
    h.advance(60 * DAY);
    await h.view(U, 'es', t, 0, 's3');
    const met = (await h.golearn.getItemState(U, LUZ))!;
    expect(met.reading.estimatedFamiliar).toBe(true); // stored estimate is untouched
    expect(effectiveStanding(met, after(lastMetAt(met)!, 1))).toMatchObject({ decayed: false, weight: 1, estimated: true });
    expect(lastMetAt(met)! > lastMetAt(row)!).toBe(true);
  });
});

describe('effectiveStanding: what never decays or never counts', () => {
  it('an unseen item, and an item that never stood, weigh nothing and are not "decayed"', async () => {
    const h = createHarness();
    const t = await buildLuz(h);
    expect(effectiveStanding(undefined, '2030-01-01T00:00:00.000Z')).toMatchObject({ level: 'unseen', decayed: false, weight: 0 });
    await h.view(U, 'es', t, 0, 's1'); // met once: encountered, no estimate
    const row = (await h.golearn.getItemState(U, LUZ))!;
    expect(effectiveStanding(row, after(lastMetAt(row)!, 400))).toMatchObject({ level: 'encountered', decayed: false, weight: 0 });
  });

  it('the learner\'s own "known" mark does not decay, and the mark still floors the level', async () => {
    const h = createHarness();
    await buildLuz(h);
    await h.mark(U, 'es', LUZ, 'known');
    const row = (await h.golearn.getItemState(U, LUZ))!;
    expect(effectiveStanding(row, '2040-01-01T00:00:00.000Z')).toMatchObject({ level: 'recognized', decayed: false, weight: 1 });
  });

  it('an item marked unknown has no estimate to expire', async () => {
    const h = createHarness();
    const t = await buildLuz(h);
    await h.viewAll(U, 'es', t, 4, 's1');
    await h.viewAll(U, 'es', t, 4, 's2');
    await h.mark(U, 'es', LUZ, 'unknown');
    const row = (await h.golearn.getItemState(U, LUZ))!;
    expect(effectiveStanding(row, after(lastMetAt(row)!, 90))).toMatchObject({ decayed: false, weight: 0, estimated: false });
  });

  it('a row with no dated evidence cannot be judged stale and keeps its standing', () => {
    const row = {
      id: 'u|x', userId: 'u', lang: 'es', itemId: 'form:es:x', itemKind: 'form', encounterCount: 0, textIds: [], manualMark: undefined,
      reading: { level: 'recognized', confidence: 0.6, evidence: 2, exposures: 0, estimatedFamiliar: false, unassisted: 2, assisted: 0 },
      listening: { level: 'unseen', confidence: 0, evidence: 0, exposures: 0, estimatedFamiliar: false, unassisted: 0, assisted: 0 },
      writing: { level: 'unseen', confidence: 0, evidence: 0, exposures: 0, estimatedFamiliar: false, unassisted: 0, assisted: 0 },
      speaking: { level: 'unseen', confidence: 0, evidence: 0, exposures: 0, estimatedFamiliar: false, unassisted: 0, assisted: 0 },
    } as unknown as Parameters<typeof effectiveStanding>[0];
    expect(effectiveStanding(row, '2040-01-01T00:00:00.000Z')).toMatchObject({ level: 'recognized', decayed: false, weight: 1 });
  });
});

describe('the "Why?" line', () => {
  it('says that a word not met for 7 weeks counts half until it is met again, and says nothing of the kind before', async () => {
    const h = createHarness();
    const { t } = await recognized(h);
    const soon = await h.golearn.explainItem(U, LUZ);
    expect(soon.summary).not.toMatch(/counts half/);

    h.advance(49 * DAY + 1000);
    const late = await h.golearn.explainItem(U, LUZ);
    expect(late.summary).toContain('not met for 7 weeks: counts half until you meet it again.');
    expect(late.summary).toContain('Was recognized');

    await h.view(U, 'es', t, 3, 's9');
    const back = await h.golearn.explainItem(U, LUZ);
    expect(back.summary).not.toMatch(/counts half/);
  });

  it('a decayed estimate is described as one that WAS likely familiar', async () => {
    const h = createHarness();
    const t = await buildLuz(h);
    await h.viewAll(U, 'es', t, 4, 's1');
    await h.viewAll(U, 'es', t, 4, 's2');
    expect((await h.golearn.explainItem(U, LUZ)).summary).toContain('Likely familiar');
    h.advance(56 * DAY);
    const s = (await h.golearn.explainItem(U, LUZ)).summary;
    expect(s).toContain('Was likely familiar, but not met for 8 weeks: counts half until you meet it again.');
    expect(s).not.toContain('Likely familiar (an estimate');
  });
});
