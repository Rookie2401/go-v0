/**
 * Consistent reads: a read never observes a half-applied fold, whatever the store's latency, and never deadlocks a fold.
 * The store here is deliberately slow: every WRITE resolves a few milliseconds late, so a fold of dozens of items takes far
 * longer than the gap between an un-awaited `bus.emit` and the read the UI issues right after it (the audited defect).
 */
import { describe, expect, it } from 'vitest';
import { SITTING_GAP_MS, StoreEventBus, buildFixtureText, createMemoryStore } from '../../src/core';
import type { AppStore, DomainEvent, EventInput } from '../../src/core';
import { createGoLearn } from '../../src/golearn';
import { ES_STORY, buildSpanish } from './fixtures';
import { createTestRegistry } from './testAdapters';

const U = 'u1';
const BIBLE = 'text:es:verses';
const T0 = Date.UTC(2026, 5, 1, 8, 0, 0);
const at = (n: number) => new Date(T0 + n * (SITTING_GAP_MS + 60_000)).toISOString(); // n-th sitting
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const tk = (surface: string, lemma: string, pos: 'NOUN' | 'VERB' | 'PRON' | 'DET' | 'ADP' | 'PROPN') => ({ surface, lemma, pos });

/** The same store, but every write resolves `knob.ms` late (reads are immediate). A rebuild rewrites everything, so tests turn the knob down for it. */
function slowStore(inner: AppStore, knob: { ms: number }): AppStore {
  const WRITES = new Set(['put', 'bulkPut', 'delete']);
  const out = { ...inner } as unknown as Record<string, unknown>;
  for (const [name, table] of Object.entries(inner)) {
    if (name === 'transaction' || name === 'assets') continue;
    out[name] = new Proxy(table as object, {
      get(target, prop, recv) {
        const v = Reflect.get(target, prop, recv);
        if (typeof v !== 'function') return v;
        if (typeof prop === 'string' && WRITES.has(prop)) return async (...a: unknown[]) => { if (knob.ms > 0) await sleep(knob.ms); return v.apply(target, a); };
        return v.bind(target);
      },
    });
  }
  return out as unknown as AppStore;
}

/** Story read help-free in three sittings, two of three verses seen in a fourth — written through a FAST GoLearn. */
async function seeded() {
  const raw = createMemoryStore();
  await buildSpanish(raw);
  await buildFixtureText(raw, {
    lang: 'es', slug: 'verses', kind: 'scripture', title: 'Versos', version: 'fixture', scripture: { book: 'JHN', chapter: 3 },
    sentences: [
      { verseRefs: ['JHN.3.1'], tokens: [tk('Yo', 'yo', 'PRON'), tk('creo', 'creer', 'VERB'), tk('en', 'en', 'ADP'), tk('Dios', 'Dios', 'PROPN')], english: 'I believe in God.' },
      { verseRefs: ['JHN.3.2'], tokens: [tk('Dios', 'Dios', 'PROPN'), tk('perdona', 'perdonar', 'VERB'), tk('el', 'el', 'DET'), tk('pecado', 'pecado', 'NOUN')], english: 'God forgives the sin.' },
      { verseRefs: ['JHN.3.3'], tokens: [tk('Jesús', 'Jesús', 'PROPN'), tk('ama', 'amar', 'VERB'), tk('la', 'la', 'DET'), tk('luz', 'luz', 'NOUN')], english: 'Jesus loves the light.' },
    ],
  });
  const adapters = createTestRegistry();
  const fastBus = new StoreEventBus(raw);
  const fast = createGoLearn({ store: raw, bus: fastBus, adapters });
  fast.attach();
  let n = 0;
  const view = (textId: string, i: number, sitting: number, surface: 'corpus' | 'scripture') => fastBus.emit({
    type: 'SentenceViewed', userId: U, lang: 'es', surface, session: `s${sitting}`, dedupeKey: `v${n++}`, at: at(sitting),
    textId, sentenceId: `${textId}/s${i}`, tokenIds: [],
  } as EventInput<DomainEvent>);
  for (const s of [1, 2, 3]) for (let i = 0; i < 4; i++) await view(ES_STORY, i, s, 'corpus');
  await view(BIBLE, 0, 4, 'scripture');
  await view(BIBLE, 1, 4, 'scripture');
  const rescue = (key: string, ms = 1000) => ({
    type: 'EnglishRescueRevealed', userId: U, lang: 'es', surface: 'scripture', session: 's4', dedupeKey: key, at: new Date(Date.parse(at(4)) + ms).toISOString(),
    textId: BIBLE, sentenceIds: [0, 1, 2].map((i) => `${BIBLE}/s${i}`), scope: 'parallel',
  } as EventInput<DomainEvent>);
  return { raw, adapters, rescue, view };
}

/** A GoLearn on the slow view of the seeded store (it derives its in-memory indexes from the log on first use). */
function slowGoLearn(raw: AppStore, adapters: ReturnType<typeof createTestRegistry>, writeMs = 2, extra: { inflightWaitMs?: number } = {}) {
  const knob = { ms: writeMs };
  const store = slowStore(raw, knob);
  const bus = new StoreEventBus(store);
  const golearn = createGoLearn({ store, bus, adapters, ...extra });
  return { store, bus, golearn, knob };
}

describe('a read issued right after an un-awaited emit returns the settled value', () => {
  it('coverage() equals the value after the emit resolved and after a rebuild; repeated calls are byte-identical', async () => {
    const { raw, adapters, rescue } = await seeded();
    const { bus, golearn, knob } = slowGoLearn(raw, adapters, 2);
    golearn.attach();
    const before = JSON.stringify(await golearn.coverage(U, BIBLE));

    const pending = bus.emit(rescue('rescue:1')); // NOT awaited: the UI fires and forgets
    const immediate = JSON.stringify(await golearn.coverage(U, BIBLE)); // issued synchronously after the emit
    await pending;
    const settled = JSON.stringify(await golearn.coverage(U, BIBLE));
    knob.ms = 0;
    await golearn.rebuild(U);
    const rebuilt = JSON.stringify(await golearn.coverage(U, BIBLE));

    expect(settled).not.toBe(before); // the reveal really changed the numbers (and asOf)…
    expect(immediate).toBe(settled); // …and the immediate read saw the whole change, never a part of it or none of it
    expect(rebuilt).toBe(settled);
    for (let i = 0; i < 5; i++) expect(JSON.stringify(await golearn.coverage(U, BIBLE))).toBe(settled);
  });

  it('reads issued WHILE the fold is running — at several moments, concurrently — all return the settled value', async () => {
    const { raw, adapters, rescue } = await seeded();
    const { bus, golearn } = slowGoLearn(raw, adapters, 2);
    golearn.attach();
    await golearn.coverage(U, BIBLE); // warm
    const pending = bus.emit(rescue('rescue:1'));
    const seen: string[] = [];
    const reads: Array<Promise<void>> = [];
    for (const ms of [0, 1, 3, 6, 12, 25, 60]) {
      reads.push(sleep(ms).then(async () => { seen.push(JSON.stringify(await golearn.coverage(U, BIBLE))); }));
    }
    await Promise.all([pending, ...reads]);
    const settled = JSON.stringify(await golearn.coverage(U, BIBLE));
    expect(seen).toHaveLength(7);
    for (const s of seen) expect(s).toBe(settled);
  });

  it('every read method waits: item state, queries, progress, explanation, support, recommendations, known list', async () => {
    const { raw, adapters, rescue } = await seeded();
    const { bus, golearn, knob } = slowGoLearn(raw, adapters, 2);
    golearn.attach();
    const dios = 'form:es:dios';
    const everything = async () => JSON.stringify([
      await golearn.getItemState(U, dios),
      await golearn.queryItem(U, { itemId: dios, lang: 'es' }),
      await golearn.queryItems(U, [{ surface: 'Creo', lang: 'es' }]),
      await golearn.listKnown(U, 'es', 'reading', 'encountered'),
      await golearn.explainItem(U, dios),
      await golearn.readingProgress(U, BIBLE),
      [...(await golearn.readingProgressMany(U, [BIBLE, ES_STORY])).values()],
      await golearn.sentenceSupport(U, `${BIBLE}/s1`),
      await golearn.tokenSupport(U, `${BIBLE}/s1/t0`, 1),
      await golearn.scriptureReadiness(U, BIBLE),
      await golearn.recommend(U),
      await golearn.coverage(U, BIBLE),
    ]);
    const pending = bus.emit(rescue('rescue:1'));
    const immediate = await everything();
    await pending;
    const settled = await everything();
    expect(immediate).toBe(settled);
    knob.ms = 0;
    await golearn.rebuild(U);
    expect(await everything()).toBe(settled);
  });

  it('settled() resolves when the emitted event has been folded', async () => {
    const { raw, adapters, rescue } = await seeded();
    const { store, bus, golearn } = slowGoLearn(raw, adapters, 2);
    golearn.attach();
    const pending = bus.emit(rescue('rescue:1'));
    await golearn.settled();
    // raw row access (no GoLearn read): the fold is complete
    expect((await store.encounters.where('textId', BIBLE)).every((e) => e.assistance === 5)).toBe(true);
    await pending;
  });
});

describe('no deadlock', () => {
  it('a subscriber that reads GoLearn inside its handler (SentenceViewed AND GoLearn\'s own PhraseEncountered) completes', async () => {
    const { raw, adapters } = await seeded();
    const { bus, golearn } = slowGoLearn(raw, adapters, 1);
    golearn.attach();
    const reads: string[] = [];
    bus.subscribe(async (e) => { reads.push(e.type); await golearn.readingProgress(U, ES_STORY); await golearn.coverage(U, ES_STORY); });
    const done = bus.emit({
      type: 'SentenceViewed', userId: U, lang: 'es', surface: 'corpus', session: 's9', dedupeKey: 'late', at: at(9),
      textId: ES_STORY, sentenceId: `${ES_STORY}/s0`, tokenIds: [],
    } as EventInput<DomainEvent>);
    await expect(Promise.race([done, sleep(4000).then(() => 'hung')])).resolves.not.toBe('hung');
    expect(reads).toContain('SentenceViewed');
    expect(reads).toContain('PhraseEncountered'); // "creo en …" is a phrase of that sentence
  });

  it('a subscriber registered BEFORE GoLearn that reads inside its handler is released by the safety valve', async () => {
    const { raw, adapters } = await seeded();
    const store = slowStore(raw, { ms: 1 });
    const bus = new StoreEventBus(store);
    const golearn = createGoLearn({ store, bus, adapters, inflightWaitMs: 60 });
    bus.subscribe(async () => { await golearn.readingProgress(U, ES_STORY); }); // earlier than GoLearn's own subscription
    golearn.attach();
    const done = bus.emit({
      type: 'SentenceViewed', userId: U, lang: 'es', surface: 'corpus', session: 's9', dedupeKey: 'late', at: at(9),
      textId: ES_STORY, sentenceId: `${ES_STORY}/s0`, tokenIds: [],
    } as EventInput<DomainEvent>);
    await expect(Promise.race([done, sleep(4000).then(() => 'hung')])).resolves.not.toBe('hung');
  });

  it('rebuild, ensureCurrent, auditEvidence and settled issued while events are in flight all finish', async () => {
    const { raw, adapters, rescue } = await seeded();
    const { bus, golearn } = slowGoLearn(raw, adapters, 0);
    golearn.attach();
    const pending = bus.emit(rescue('rescue:1'));
    const all = Promise.all([golearn.ensureCurrent(U), golearn.auditEvidence(U), golearn.settled(), golearn.rebuild(U), golearn.auditEvidence(U, { rebuild: true }), pending]);
    await expect(Promise.race([all, sleep(8000).then(() => 'hung')])).resolves.not.toBe('hung');
    expect((await golearn.coverage(U, BIBLE)).asOf).toBe(rescue('x').at);
  });

  it('detach restores the bus: emit is the original again and reads keep working', async () => {
    const { raw, adapters } = await seeded();
    const bus = new StoreEventBus(raw);
    const original = bus.emit;
    const golearn = createGoLearn({ store: raw, bus, adapters });
    const off = golearn.attach();
    expect(bus.emit).not.toBe(original);
    off();
    expect(bus.emit).toBe(original);
    expect(Object.prototype.hasOwnProperty.call(bus, 'emit')).toBe(false);
    await golearn.coverage(U, BIBLE);
  });
});
