import { describe, expect, it } from 'vitest';
import type { FixtureToken, ProductionRecorded } from '../../src/core';
import { buildFixtureText, ids } from '../../src/core';
import { PRODUCTION_WEIGHTS } from '../../src/golearn/policy';
import {
  DAILY_CAP, OVERDUE_DAYS, RETRIEVAL_DUE_HOURS, RETRY_HOURS, applyOutcome, candidateReason, createRetrieval, localDay, parseRetrievalState, retrievalMetaId,
} from '../../src/golearn/retrieval';
import type { RetrievalPrompt } from '../../src/golearn/retrieval';
import { createHarness } from './harness';
import { ES_STORY, buildSpanish } from './fixtures';

const U = 'u1';
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const CREER = ids.lemma('es', 'creer', 'VERB');
const CORAZON = ids.lemma('es', 'corazón', 'NOUN');
const PECADO = ids.lemma('es', 'pecado', 'NOUN');
const PERDONAR = ids.lemma('es', 'perdonar', 'VERB');

/** A learner who met the four-sentence story in two sittings: every content lemma was met twice (creer three times). */
async function weakLearner() {
  const h = createHarness();
  await h.seed(U, 'honduras-es');
  await buildSpanish(h.store);
  await h.viewAll(U, 'es', ES_STORY, 4, 's1');
  await h.viewAll(U, 'es', ES_STORY, 4, 's2');
  const retrieval = createRetrieval({ store: h.store, bus: h.bus, adapters: h.adapters, golearn: h.golearn, clock: h.clock, session: () => 'practice-1' });
  return { h, retrieval };
}

const promptFor = async (retrieval: ReturnType<typeof createRetrieval>, itemId: string): Promise<RetrievalPrompt> => {
  const day = await retrieval.today(U, 'es');
  const p = day.prompts.find((x) => x.itemId === itemId);
  if (!p) throw new Error(`no prompt for ${itemId}: ${day.prompts.map((x) => x.itemId).join(', ')}`);
  return p;
};

describe('the interval table (schedule.ts)', () => {
  it('copies GoTell DUE_HOURS exactly and retries a miss after 4 h', () => {
    expect(RETRIEVAL_DUE_HOURS).toEqual({ 0: 0, 1: 4, 2: 8, 3: 24, 4: 48, 5: 120, 6: 288, 7: 720 });
    expect(RETRY_HOURS).toBe(4);
    expect(DAILY_CAP).toBe(20);
  });

  it('independent answers climb the table one level at a time, to 7 and no further', () => {
    let s = applyOutcome(undefined, 'independent', '2026-01-01T00:00:00.000Z');
    const hours: number[] = [];
    let at = '2026-01-01T00:00:00.000Z';
    for (let i = 0; i < 9; i++) {
      hours.push((Date.parse(s.dueAt!) - Date.parse(at)) / HOUR);
      at = s.dueAt!;
      s = applyOutcome(s, 'independent', at);
    }
    expect(hours.slice(0, 7)).toEqual([4, 8, 24, 48, 120, 288, 720]);
    expect(hours.slice(7)).toEqual([720, 720]);
    expect(s.level).toBe(7);
  });

  it('a miss on level 4 or more falls to level 3 and counts a lapse; a lower level is kept; the retry is 4 h away', () => {
    const at = '2026-01-01T00:00:00.000Z';
    let s = applyOutcome({ level: 5, attempts: 4, lapses: 0, dueAt: at }, 'miss', at);
    expect(s).toMatchObject({ level: 3, lapses: 1, lastOutcome: 'miss', attempts: 5 });
    expect(Date.parse(s.dueAt!) - Date.parse(at)).toBe(4 * HOUR);
    s = applyOutcome({ level: 2, attempts: 2, lapses: 0 }, 'miss', at);
    expect(s).toMatchObject({ level: 2, lapses: 1 });
    s = applyOutcome(undefined, 'miss', at);
    expect(s).toMatchObject({ level: 0, lapses: 0, attempts: 1 }); // a word never recalled has nothing to lapse from
  });

  it('an assisted recall never raises the level: it is held between 1 and 3', () => {
    const at = '2026-01-01T00:00:00.000Z';
    expect(applyOutcome(undefined, 'assisted', at).level).toBe(1);
    expect(applyOutcome({ level: 6, attempts: 6, lapses: 0 }, 'assisted', at).level).toBe(3);
    const s = applyOutcome({ level: 2, attempts: 1, lapses: 0 }, 'assisted', at);
    expect(s.level).toBe(2);
    expect(Date.parse(s.dueAt!) - Date.parse(at)).toBe(8 * HOUR);
  });

  it('candidateReason: weak, overdue, due, retry, queued — and nothing for a word marked known or not yet due', () => {
    const now = '2026-03-01T00:00:00.000Z';
    const facts = (over: Partial<Parameters<typeof candidateReason>[0]>) => ({ readingLevel: 'encountered', encounterCount: 2, ...over });
    expect(candidateReason(facts({}), undefined, now)).toBe('weak');
    expect(candidateReason(facts({ readingLevel: 'recognized_with_help' }), undefined, now)).toBe('weak');
    expect(candidateReason(facts({ encounterCount: 1 }), undefined, now)).toBeUndefined();
    expect(candidateReason(facts({ readingLevel: 'recognized', encounterCount: 3, lastSeenAt: '2026-02-20T00:00:00.000Z' }), undefined, now)).toBeUndefined();
    const old = new Date(Date.parse(now) - OVERDUE_DAYS * DAY).toISOString();
    expect(candidateReason(facts({ readingLevel: 'recognized', encounterCount: 3, lastSeenAt: old }), undefined, now)).toBe('overdue');
    expect(candidateReason(facts({ readingLevel: 'recognized', encounterCount: 2, lastSeenAt: old }), undefined, now)).toBeUndefined();
    expect(candidateReason(facts({ manualMark: 'known' }), undefined, now)).toBeUndefined();
    const sched = { level: 2 as const, attempts: 1, lapses: 0, lastOutcome: 'independent' as const };
    expect(candidateReason(facts({ readingLevel: 'recognized' }), { ...sched, dueAt: '2026-03-02T00:00:00.000Z' }, now)).toBeUndefined();
    expect(candidateReason(facts({ readingLevel: 'recognized' }), { ...sched, dueAt: '2026-02-28T00:00:00.000Z' }, now)).toBe('due');
    expect(candidateReason(facts({ readingLevel: 'recognized' }), { ...sched, lastOutcome: 'miss', dueAt: '2026-02-28T00:00:00.000Z' }, now)).toBe('retry');
    expect(candidateReason(facts({ manualMark: 'known' }), { ...sched, queuedAt: now }, now)).toBe('queued');
  });

  it('parseRetrievalState survives a missing or damaged row', () => {
    expect(parseRetrievalState(undefined).items).toEqual({});
    expect(parseRetrievalState('{not json').items).toEqual({});
    expect(parseRetrievalState('{"v":2}').items).toEqual({});
    expect(parseRetrievalState('{"v":1,"items":{"a":{"level":1,"attempts":1,"lapses":0}},"day":"2026-01-01","doneToday":3}').doneToday).toBe(3);
  });
});

describe('candidates: the learner\'s own read sentences', () => {
  it('asks weak content words in a sentence he read, blanked, with the title of the text; function words and names are left out', async () => {
    const { retrieval } = await weakLearner();
    const day = await retrieval.today(U, 'es');
    expect(day.hasReading).toBe(true);
    expect(day.cap).toBe(20);
    expect(day.prompts.map((p) => p.itemId).sort()).toEqual([CORAZON, CREER, PECADO, PERDONAR].sort());
    for (const p of day.prompts) {
      expect(p.reason).toBe('weak');
      expect(p.textId).toBe(ES_STORY);
      expect(p.textTitle).toBe('Historia 1');
      expect(p.sentenceId.startsWith(`${ES_STORY}/s`)).toBe(true);
      expect(p.before + p.answer + p.after).toBe(p.sentence);
      expect(p.answer.length).toBeGreaterThan(0);
      expect(p.firstLetter).toBe(p.answer[0]);
    }
    // creer is asked in one of the three sentences it was met in, and the blank is the form written there
    const creer = day.prompts.find((p) => p.itemId === CREER)!;
    expect(['creo', 'cree']).toContain(creer.answer);
    expect(creer.sentence).not.toContain('____');
  });

  it('a learner with no reading has an empty set and hasReading false', async () => {
    const h = createHarness();
    await h.seed(U, 'honduras-es');
    await buildSpanish(h.store);
    const retrieval = createRetrieval({ store: h.store, bus: h.bus, adapters: h.adapters, golearn: h.golearn, clock: h.clock });
    expect(await retrieval.today(U, 'es')).toMatchObject({ prompts: [], hasReading: false, doneToday: 0 });
    expect(await retrieval.hasDue(U, 'es')).toBe(false);
  });

  it('a word met once is not weak; a word never read in a sentence of the store is not asked', async () => {
    const h = createHarness();
    await h.seed(U, 'honduras-es');
    await buildSpanish(h.store);
    await h.view(U, 'es', ES_STORY, 3); // perdonar, pecado: met once
    const retrieval = createRetrieval({ store: h.store, bus: h.bus, adapters: h.adapters, golearn: h.golearn, clock: h.clock });
    const day = await retrieval.today(U, 'es');
    expect(day.hasReading).toBe(true);
    expect(day.prompts).toEqual([]);
  });

  it('overdue: met three times but not for 14 days; a word met again recently is not', async () => {
    const h = createHarness();
    await h.seed(U, 'honduras-es');
    await buildSpanish(h.store);
    for (const s of ['s1', 's2', 's3']) await h.understood(U, 'es', ES_STORY, [0, 1, 2, 3], s); // demonstrated: recognized, not weak
    const retrieval = createRetrieval({ store: h.store, bus: h.bus, adapters: h.adapters, golearn: h.golearn, clock: h.clock });
    expect((await retrieval.today(U, 'es')).prompts).toEqual([]); // fresh
    h.advance(OVERDUE_DAYS * DAY + HOUR);
    const day = await retrieval.today(U, 'es');
    expect(day.prompts.length).toBeGreaterThan(0);
    expect(day.prompts.every((p) => p.reason === 'overdue')).toBe(true);
    expect(day.prompts.map((p) => p.itemId)).toContain(PECADO);
    // meeting pecado again (sentence 3) takes it off the list
    await h.view(U, 'es', ES_STORY, 3, 's4');
    const again = await retrieval.today(U, 'es');
    expect(again.prompts.map((p) => p.itemId)).not.toContain(PECADO);
    expect(again.prompts.map((p) => p.itemId)).toContain(CORAZON);
  });

  it('a word marked "I know it" is left alone', async () => {
    const { h, retrieval } = await weakLearner();
    await h.mark(U, 'es', PECADO, 'known', 'lemma');
    expect((await retrieval.today(U, 'es')).prompts.map((p) => p.itemId)).not.toContain(PECADO);
  });
});

describe('answers: the event emitted and what GoLearn folds from it', () => {
  it('a correct unaided recall emits ProductionRecorded (independent, writing) for that item, with the sentence, and folds at weight 1.0', async () => {
    const { h, retrieval } = await weakLearner();
    const p = await promptFor(retrieval, PECADO);
    const r = await retrieval.submit(U, p, p.answer, 'none');
    expect(r).toMatchObject({ accepted: true, outcome: 'independent', recorded: true });

    const events = (await h.bus.history({ userId: U, types: ['ProductionRecorded'] })) as ProductionRecorded[];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ itemId: PECADO, itemKind: 'lemma', kind: 'independent', modality: 'writing', sentenceText: p.sentence, lang: 'es', session: 'practice-1' });
    expect(events[0].dedupeKey.startsWith('retrieval:')).toBe(true);

    expect(PRODUCTION_WEIGHTS.independent).toBe(1);
    const state = await h.golearn.getItemState(U, PECADO);
    expect(state?.writing.evidence).toBe(1);
    expect(state?.writing.level).toBe('used_independently');
    expect(state?.writing.unassisted).toBe(1);
    // reading evidence is untouched by a recall
    expect(state?.reading.evidence).toBe(0);
    expect(state?.reading.level).toBe('encountered');
  });

  it('a recall after the first letter is assisted (0.4); a recall after the whole word is shown records nothing', async () => {
    const { h, retrieval } = await weakLearner();
    const a = await promptFor(retrieval, CORAZON);
    expect(await retrieval.submit(U, a, a.answer, 'letter')).toMatchObject({ accepted: true, outcome: 'assisted' });
    const state = await h.golearn.getItemState(U, CORAZON);
    expect(state?.writing.evidence).toBe(PRODUCTION_WEIGHTS.assisted);
    expect(state?.writing.evidence).toBe(0.4);
    expect(state?.writing.level).toBe('used_with_assistance');

    const b = await promptFor(retrieval, PERDONAR);
    await retrieval.giveUp(U, b);
    const events = (await h.bus.history({ userId: U, types: ['ProductionRecorded'] })) as ProductionRecorded[];
    expect(events.map((e) => [e.itemId, e.kind])).toEqual([[CORAZON, 'assisted']]);
    expect(await h.golearn.getItemState(U, PERDONAR).then((s) => s?.writing.evidence ?? 0)).toBe(0);
  });

  it('a wrong answer records nothing and changes no schedule', async () => {
    const { h, retrieval } = await weakLearner();
    const p = await promptFor(retrieval, PECADO);
    expect(await retrieval.submit(U, p, 'perro', 'none')).toEqual({ accepted: false });
    expect(await retrieval.submit(U, p, '   ', 'none')).toEqual({ accepted: false });
    expect(await h.bus.history({ userId: U, types: ['ProductionRecorded'] })).toHaveLength(0);
    expect(await retrieval.schedule(U, 'es', PECADO)).toBeUndefined();
  });

  it('matching: case and punctuation never matter, and a missing accent is accepted with a note (es)', async () => {
    const { h, retrieval } = await weakLearner();
    const p = await promptFor(retrieval, CORAZON);
    expect(p.answer).toBe('corazón');
    expect(retrieval.check(p, 'Corazón.')).toEqual({ accepted: true });
    const lenient = retrieval.check(p, 'corazon');
    expect(lenient.accepted).toBe(true);
    expect(lenient.note).toContain('corazón');
    expect(retrieval.check(p, 'corazones').accepted).toBe(false);
    await retrieval.submit(U, p, 'corazon', 'none');
    expect((await h.golearn.getItemState(U, CORAZON))?.writing.evidence).toBe(1);
  });

  it('evidence for an item in a sentence is recorded once, ever; unaided and hinted recalls of one sentence are separate facts', async () => {
    const { h, retrieval } = await weakLearner();
    const p = await promptFor(retrieval, PECADO);
    expect(await retrieval.submit(U, p, p.answer, 'letter')).toMatchObject({ outcome: 'assisted', recorded: true });
    expect(await retrieval.submit(U, p, p.answer, 'letter')).toMatchObject({ outcome: 'assisted', recorded: false });
    expect(await retrieval.submit(U, p, p.answer, 'none')).toMatchObject({ outcome: 'independent', recorded: true });
    expect(await retrieval.submit(U, p, p.answer, 'none')).toMatchObject({ outcome: 'independent', recorded: false });
    const state = await h.golearn.getItemState(U, PECADO);
    expect(state?.writing.evidence).toBe(1.4); // 0.4 + 1.0, each once
  });
});

describe('scheduling through the engine', () => {
  it('an unaided recall puts the word off for 4 h, and it is not asked again until due', async () => {
    const { h, retrieval } = await weakLearner();
    const p = await promptFor(retrieval, PECADO);
    await retrieval.submit(U, p, p.answer, 'none');
    const sched = (await retrieval.schedule(U, 'es', PECADO))!;
    expect(sched).toMatchObject({ level: 1, attempts: 1, lapses: 0, lastOutcome: 'independent' });
    expect(Date.parse(sched.dueAt!) - Date.parse(sched.lastAt!)).toBe(4 * HOUR);
    expect((await retrieval.today(U, 'es')).prompts.map((x) => x.itemId)).not.toContain(PECADO);
    h.advance(4 * HOUR + 60_000);
    const back = (await retrieval.today(U, 'es')).prompts.find((x) => x.itemId === PECADO);
    expect(back?.reason).toBe('due');
    expect(back?.level).toBe(1);
  });

  it('a miss comes back after 4 h as a retry, in another sentence when the word was read in several', async () => {
    const { h, retrieval } = await weakLearner();
    const first = await promptFor(retrieval, CREER);
    await retrieval.giveUp(U, first);
    expect(await retrieval.schedule(U, 'es', CREER)).toMatchObject({ level: 0, lastOutcome: 'miss', attempts: 1 });
    expect((await retrieval.today(U, 'es')).prompts.map((x) => x.itemId)).not.toContain(CREER);
    h.advance(4 * HOUR + 60_000);
    const second = await promptFor(retrieval, CREER);
    expect(second.reason).toBe('retry');
    expect(second.sentenceId).not.toBe(first.sentenceId);
  });

  it('a lapse from level 4 or more falls to level 3', async () => {
    const { h, retrieval } = await weakLearner();
    let p = await promptFor(retrieval, PECADO);
    for (let i = 0; i < 4; i++) {
      await retrieval.submit(U, p, p.answer, 'none');
      h.advance(721 * HOUR);
      p = await promptFor(retrieval, PECADO);
    }
    expect((await retrieval.schedule(U, 'es', PECADO))!.level).toBe(4);
    await retrieval.giveUp(U, p);
    expect(await retrieval.schedule(U, 'es', PECADO)).toMatchObject({ level: 3, lapses: 1, lastOutcome: 'miss' });
  });

  it('the state is one row in meta, keyed by learner and language', async () => {
    const { h, retrieval } = await weakLearner();
    const p = await promptFor(retrieval, PECADO);
    await retrieval.submit(U, p, p.answer, 'none');
    const row = await h.store.meta.get(retrievalMetaId(U, 'es'));
    expect(row?.id).toBe('retrieval:u1:es');
    const parsed = parseRetrievalState(row!.value);
    expect(parsed.items[PECADO].level).toBe(1);
    expect(parsed.doneToday).toBe(1);
    expect(parsed.day).toBe(localDay(parsed.items[PECADO].lastAt!));
  });

  it('at most 20 prompts a day; a finished prompt counts against the day, and the next day starts again', async () => {
    const h = createHarness();
    await h.seed(U, 'honduras-es');
    const word = (n: number): FixtureToken => ({ surface: `palabra${n}`, lemma: `palabra${n}`, pos: 'NOUN' });
    const sentences = Array.from({ length: 30 }, (_, i) => ({ tokens: [word(i), { surface: '.', isWord: false }] }));
    await buildFixtureText(h.store, { lang: 'es', slug: 'big', title: 'Muchas palabras', sentences });
    const id = 'text:es:big';
    await h.viewAll(U, 'es', id, 30, 's1');
    await h.viewAll(U, 'es', id, 30, 's2');
    const retrieval = createRetrieval({ store: h.store, bus: h.bus, adapters: h.adapters, golearn: h.golearn, clock: h.clock });

    const first = await retrieval.today(U, 'es');
    expect(first.prompts).toHaveLength(20);
    for (const p of first.prompts.slice(0, 5)) await retrieval.submit(U, p, p.answer, 'none');
    const next = await retrieval.today(U, 'es');
    expect(next.doneToday).toBe(5);
    expect(next.prompts).toHaveLength(15); // the other ten words wait for tomorrow
    for (const p of next.prompts) await retrieval.giveUp(U, p);
    const full = await retrieval.today(U, 'es');
    expect(full.doneToday).toBe(20);
    expect(full.prompts).toEqual([]);

    h.advance(DAY * 2); // another day: the cap starts again, and the ten waiting words (plus the ones now due) are asked
    const tomorrow = await retrieval.today(U, 'es');
    expect(tomorrow.doneToday).toBe(0);
    expect(tomorrow.prompts.length).toBe(20);
  });
});

describe('practise now: a queued word', () => {
  it('goes to the front of the set, even a function word, and beyond the cap; it must have a read sentence', async () => {
    const { h, retrieval } = await weakLearner();
    expect(await retrieval.queue(U, 'es', ids.form('es', 'pecado'))).toEqual({ ok: true });
    expect(await retrieval.queue(U, 'es', ids.lemma('es', 'yo', 'PRON'))).toEqual({ ok: true });
    const day = await retrieval.today(U, 'es');
    expect(day.prompts[0].reason).toBe('queued');
    expect(day.prompts.slice(0, 2).map((p) => p.itemId).sort()).toEqual([ids.form('es', 'pecado'), ids.lemma('es', 'yo', 'PRON')].sort());
    const form = day.prompts.find((p) => p.itemId === ids.form('es', 'pecado'))!;
    expect(form.itemKind).toBe('form');
    expect(form.answer).toBe('pecado');
    await retrieval.submit(U, form, 'pecado', 'none');
    expect((await retrieval.schedule(U, 'es', ids.form('es', 'pecado')))!.queuedAt).toBeUndefined();
    expect((await h.golearn.getItemState(U, ids.form('es', 'pecado')))?.writing.evidence).toBe(1);
    expect((await retrieval.today(U, 'es')).prompts.map((p) => p.itemId)).not.toContain(ids.form('es', 'pecado'));

    expect(await retrieval.queue(U, 'es', ids.lemma('es', 'nunca', 'ADV'))).toMatchObject({ ok: false });
    expect(await retrieval.queue(U, 'es', ids.phrase('es', ['creo', 'en', '_']))).toMatchObject({ ok: false });
  });
});
