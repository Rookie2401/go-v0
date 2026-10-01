/**
 * evidence@6 — learner state is updated INCREMENTALLY (agg.ts); it must be exactly what a rebuild from the log derives, for every
 * event type and in every order the log allows. A long, seeded, mixed sequence is folded live, and then
 *   1. snapshotted, rebuilt from the log, and compared byte for byte (items, encounters);
 *   2. compared, item by item, with the REFERENCE derivation from the encounter rows (the evidence@5 definition);
 *   3. folded again by a cold GoLearn that is started halfway through (state persisted between processes).
 */
import { describe, expect, it } from 'vitest';
import { SITTING_GAP_MS, ids } from '../../src/core';
import type { DomainEvent, EventInput, LanguageCode } from '../../src/core';
import { createGoLearn, defaultPolicy } from '../../src/golearn';
import { referenceItemState } from '../../src/golearn/state';
import type { Ctx, StoredEncounter } from '../../src/golearn/state';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { ES_JOHN, ES_STORY, TH_STORY, buildSpanish, buildSpanishScripture, buildThai } from './fixtures';
import { fakeDecode, fakeFeatures } from './testAdapters';

const U = 'u1';
const T0 = Date.UTC(2026, 2, 1, 8, 0, 0);

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Plan { events: Array<EventInput<DomainEvent>> }

/** The whole script as events with explicit times, so two runs of it are byte-identical. */
async function script(h: Harness, seed: number, steps: number): Promise<Plan> {
  const rnd = prng(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
  const texts: Array<{ id: string; lang: LanguageCode; surface: 'corpus' | 'scripture'; sentences: number }> = [
    { id: ES_STORY, lang: 'es', surface: 'corpus', sentences: 4 },
    { id: ES_JOHN, lang: 'es', surface: 'scripture', sentences: 2 },
    { id: TH_STORY, lang: 'th', surface: 'corpus', sentences: 2 },
  ];
  const tokensOf = async (sentenceId: string) =>
    (await h.store.tokens.where('sentenceId', sentenceId)).filter((t) => t.isWord).sort((a, b) => a.index - b.index);

  const events: Array<EventInput<DomainEvent>> = [];
  let clock = T0;
  let sitting = 0;
  let n = 0;
  const base = (lang: LanguageCode, surface: string) => {
    clock += 20_000 + Math.floor(rnd() * 40_000);
    return { userId: U, lang, surface, session: `s${sitting}`, dedupeKey: `k${n++}`, at: new Date(clock).toISOString() };
  };
  const push = (e: object) => events.push(e as EventInput<DomainEvent>);

  for (let i = 0; i < steps; i++) {
    if (rnd() < 0.08) { sitting += 1; clock += SITTING_GAP_MS + 5_000; } // a new sitting
    const text = pick(texts);
    const index = Math.floor(rnd() * text.sentences);
    const sentenceId = `${text.id}/s${index}`;
    const toks = await tokensOf(sentenceId);
    const tok = pick(toks);
    const b = (surface: string = text.surface) => base(text.lang, surface);
    const r = rnd();
    if (r < 0.26) push({ type: 'SentenceViewed', ...b(), textId: text.id, sentenceId, tokenIds: rnd() < 0.2 ? [tok.id] : [], dwellMs: 1500 + Math.floor(rnd() * 4000) });
    else if (r < 0.34) push({ type: 'TokenHelpOpened', ...b(), sentenceId, tokenId: tok.id, itemId: tok.formId, level: pick([1, 2, 3] as const) });
    else if (r < 0.38 && text.id === ES_STORY && index % 2 === 0) {
      const phraseId = ids.phrase('es', ['creo', 'en', '_']);
      push({ type: 'PhraseHelpOpened', ...b(), sentenceId, phraseId, phraseOccurrenceId: ids.phraseOccurrence(phraseId, sentenceId, 1) });
    } else if (r < 0.42 && text.id === ES_STORY && index < 2) {
      push({ type: 'GrammarHelpOpened', ...b(), sentenceId, patternId: ids.pattern('es', 'present-tense'), tokenIds: [`${sentenceId}/t${index === 0 ? 1 : 2}`] });
    } else if (r < 0.48 && text.lang === 'th') {
      const feats = fakeFeatures(fakeDecode(tok.surface));
      push({ type: 'DecodingRevealed', ...b(), sentenceId, tokenId: tok.id, itemId: tok.formId, features: rnd() < 0.8 ? feats : feats.slice(0, 1), romanization: rnd() < 0.3 });
    } else if (r < 0.52) push({ type: 'SentenceExplanationRevealed', ...b(), sentenceId });
    else if (r < 0.57) push({ type: 'EnglishRescueRevealed', ...b(), textId: text.id, sentenceIds: [sentenceId], scope: pick(['sentence', 'verse', 'parallel'] as const) });
    else if (r < 0.7) {
      const ids2 = Array.from({ length: 1 + Math.floor(rnd() * text.sentences) }, (_, k) => `${text.id}/s${(index + k) % text.sentences}`);
      const sorted = [...new Set(ids2)].sort((a, c) => Number(a.split('/s')[1]) - Number(c.split('/s')[1]));
      push({
        type: 'ComprehensionReported', ...b(), textId: text.id, sentenceIds: sorted, modality: rnd() < 0.8 ? 'reading' : 'listening',
        scope: rnd() < 0.85 ? 'sentence' : 'text', degree: pick(['all', 'all', 'all', 'most', 'some', 'little'] as const),
      });
    } else if (r < 0.74) push({ type: 'TextCompleted', ...b(), textId: text.id });
    else if (r < 0.84) {
      const ss = [...new Set([index, (index + 1) % text.sentences])].sort((x, y) => x - y);
      const real = rnd() < 0.85;
      push({
        type: 'AudioSegmentCompleted', ...b('listen'), textId: text.id, segmentId: `seg:${n}`, sentenceIds: ss.map((k) => `${text.id}/s${k}`),
        speed: pick([0.7, 0.85, 1, 1.25]), transcriptVisible: rnd() < 0.15, replayCount: Math.floor(rnd() * 3),
        revealedTranscript: rnd() < 0.15, revealedTranslation: rnd() < 0.1, assetId: 'sha256:real', speech: real, voiceReviewed: real,
      });
    } else if (r < 0.9) {
      push({
        type: 'ProductionRecorded', ...b('testimony'), itemId: tok.formId, itemKind: 'form', kind: pick(['independent', 'self-repaired', 'assisted', 'copied'] as const),
        modality: rnd() < 0.7 ? 'writing' : 'speaking', revisionId: 'rev1', sentenceText: `frase ${Math.floor(rnd() * 6)}`,
      });
    } else if (r < 0.94) push({ type: 'ItemMarked', ...b('corpus'), itemId: tok.formId, itemKind: 'form', mark: pick(['known', 'unknown', 'clear'] as const) });
    else push({ type: 'NoteOpened', ...b(), textId: text.id, noteId: 'note:1', sentenceId, kind: 'cultural' });
  }
  return { events };
}

async function world(): Promise<Harness> {
  const h = createHarness({ decode: ['th'] });
  await buildSpanish(h.store);
  await buildSpanishScripture(h.store);
  await buildThai(h.store);
  return h;
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : 1);
/**
 * JSON with object keys sorted — except the entries of a sitting (`e`), whose ORDER is the order the encounters were created
 * in and is part of the state (it decides which encounters are the last two).
 */
function canonical(v: unknown, key = ''): unknown {
  if (Array.isArray(v)) return v.map((x) => canonical(x));
  if (v && typeof v === 'object') {
    const keys = key === 'e' ? Object.keys(v) : Object.keys(v).sort();
    return Object.fromEntries(keys.map((k) => [k, canonical((v as Record<string, unknown>)[k], k)]));
  }
  return v;
}
async function snapshot(h: Harness) {
  return JSON.stringify(canonical({
    items: (await h.store.learnerItems.where('userId', U)).sort(byId),
    encounters: (await h.store.encounters.where('userId', U)).sort(byId),
  }));
}

/** The first difference between two snapshots (readable when the byte comparison fails). */
function firstDiff(a: string, b: string): string | null {
  if (a === b) return null;
  const pa = JSON.parse(a) as Record<string, Array<{ id: string }>>;
  const pb = JSON.parse(b) as Record<string, Array<{ id: string }>>;
  for (const k of Object.keys(pa)) {
    const mb = new Map(pb[k].map((r) => [r.id, r]));
    for (const r of pa[k]) {
      const o = mb.get(r.id);
      if (!o || JSON.stringify(o) !== JSON.stringify(r)) return `${k} ${r.id}\n live:    ${JSON.stringify(r)}\n rebuilt: ${JSON.stringify(o)}`;
    }
    if (pa[k].length !== pb[k].length) return k + ': ' + pa[k].length + ' rows live, ' + pb[k].length + ' rebuilt';
  }
  return 'differs';
}

const seqOf = (e: StoredEncounter) => Number(/\/s(\d+)$/.exec(e.sentenceId)?.[1] ?? 0);
const inSentenceOrder = (a: StoredEncounter, b: StoredEncounter) => seqOf(a) - seqOf(b) || (a.id < b.id ? -1 : 1);

async function ctxOf(h: Harness): Promise<Ctx> {
  return { store: h.store, bus: h.bus, adapters: h.adapters, policy: defaultPolicy, clock: h.clock } as unknown as Ctx;
}

describe('incremental folding equals a rebuild from the log', () => {
  for (const seed of [1, 7, 2026]) {
    it(`seed ${seed}: a long mixed sequence (views across sittings, every help level, decoding ± romanization, rescues, reports, completions, listening, production, marks)`, async () => {
      const h = await world();
      const { events } = await script(h, seed, 420);
      expect(new Set(events.map((e) => e.type)).size).toBeGreaterThanOrEqual(12);
      for (const e of events) await h.bus.emit(e);

      const live = await snapshot(h);
      const items = JSON.parse(live).items as Array<{ itemKind: string }>;
      expect(items.length).toBeGreaterThan(40);
      expect(new Set(items.map((i) => i.itemKind))).toEqual(new Set(['form', 'lemma', 'phrase', 'pattern', 'orth']));
      const encs = (await h.store.encounters.where('userId', U)) as StoredEncounter[];
      expect(new Set(encs.map((e) => e.evidenceKind))).toEqual(new Set(['exposure', 'assisted', 'demonstrated', 'production']));
      expect(encs.some((e) => e.romanized)).toBe(true);
      expect(encs.some((e) => e.modality === 'listening')).toBe(true);

      // 1. rebuild from the log: byte for byte
      await h.golearn.rebuild(U);
      expect(firstDiff(live, await snapshot(h))).toBeNull();

      // 2. the independent definition, item by item (writing-system items have no encounter rows to derive from)
      const ctx = await ctxOf(h);
      let checked = 0;
      for (const row of await h.store.learnerItems.where('userId', U)) {
        if (row.itemKind === 'orth') continue;
        const { agg: _agg, ...stored } = row as typeof row & { agg: unknown };
        void _agg;
        const ref = await referenceItemState(ctx, U, row.itemId, { lang: row.lang, itemKind: row.itemKind }, inSentenceOrder);
        expect(stored, row.itemId).toEqual(ref);
        checked += 1;
      }
      expect(checked).toBeGreaterThan(20);
    });
  }

  it('priorLevel of every encounter is the level its item had before it (in creation order), after live folding and after a rebuild', async () => {
    const h = await world();
    const { events } = await script(h, 11, 300);
    for (const e of events) await h.bus.emit(e);
    const check = async () => {
      const bad: string[] = [];
      const encs = ((await h.store.encounters.where('userId', U)) as StoredEncounter[]).filter((e) => e.modality === 'reading' || e.modality === 'listening');
      const byItem = new Map<string, StoredEncounter[]>();
      for (const e of encs) { let l = byItem.get(`${e.itemId}|${e.modality}`); if (!l) byItem.set(`${e.itemId}|${e.modality}`, (l = [])); l.push(e); }
      for (const l of byItem.values()) {
        l.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : inSentenceOrder(a, b)));
        expect(l[0].priorLevel).toBe('unseen');
        for (let i = 1; i < l.length; i++) if (l[i].priorLevel === 'unseen') bad.push(l[i].id);
      }
      expect(bad).toEqual([]);
    };
    await check();
    const before = await snapshot(h);
    await h.golearn.rebuild(U);
    expect(firstDiff(before, await snapshot(h))).toBeNull();
    await check();
  });

  it('a cold GoLearn started halfway (aggregates persisted between processes) folds to the same state as one that never stopped', async () => {
    const whole = await world();
    const { events } = await script(whole, 99, 360);
    for (const e of events) await whole.bus.emit(e);

    const split = await world();
    const half = Math.floor(events.length / 2) + 3; // not on a sitting boundary
    for (const e of events.slice(0, half)) await split.bus.emit(e);
    split.golearn.attach()(); // detach the first GoLearn …
    const cold = createGoLearn({ store: split.store, bus: split.bus, adapters: split.adapters, clock: split.clock });
    cold.attach(); // … and start a new one over the same store: nothing but the stored rows carries over
    for (const e of events.slice(half)) await split.bus.emit(e);
    await cold.settled();
    expect(firstDiff(await snapshot(whole), await snapshot(split))).toBeNull();
  });
});
