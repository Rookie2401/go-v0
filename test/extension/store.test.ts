import { describe, expect, it } from 'vitest';
import { validateEvent } from '../../packages/repository-contract/src';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { MAX_STORED_SURFACE_WORDS, buildSelectionEvent, createMemoryEncounterStore, createMemoryStorageArea, createStorageEncounterStore, getDeviceId, DEVICE_KEY } from '../../packages/golearn-extension/src/store';
import { fnv1a64, sentenceKeyOf } from '../../packages/golearn-extension/src/text';
import { ids, hash } from '../../src/core/ids';

const SENTENCE = 'Unë po lexoj një libër të bukur në shtëpinë time.';
const identity = { learnerId: 'local-learner', enrolmentId: 'local-enrolment:sq', deviceId: 'dev-1' };
const card = (sel = 'shtëpinë', sentence = SENTENCE) => {
  const at = sentence.indexOf(sel);
  return parseSelection({ surface: sel, context: { kind: 'sentence', confidence: 0.9, sentence, selStart: at, selEnd: at + sel.length } });
};
const event = (c = card(), over: Partial<Parameters<typeof buildSelectionEvent>[0]> = {}) =>
  buildSelectionEvent({ card: c, source: { kind: 'web', title: 'A page', locator: '/chapter/1' }, readerId: 'web-generic', identity, version: '0.0.1', sessionId: 's1', now: new Date('2026-10-08T10:00:00.000Z'), ...over });

describe('hashes agree with the engine', () => {
  it('fnv1a64 and sentenceKeyOf are the engine\'s hash and sentenceKey', () => {
    for (const s of ['', 'a', SENTENCE, 'Çdo mëngjes pi një çaj.', 'यह किताब अच्छी है।', 'ฉันชอบอ่านหนังสือ']) {
      expect(fnv1a64(s)).toBe(hash(s));
      expect(sentenceKeyOf(s)).toBe(ids.sentenceKey(s));
    }
  });
});

describe('the encounter event', () => {
  it('is a valid SelectionLookedUp of the contract, with item ids, a sentence key and a source reference', () => {
    const e = event();
    expect(validateEvent(e)).toEqual([]);
    expect(e.kind).toBe('SelectionLookedUp');
    expect(e.producer).toEqual({ app: 'golearn-ext', version: '0.0.1', deviceId: 'dev-1' });
    expect(e.languageId).toBe('sq');
    expect(e.subject.itemIds).toEqual(['lemma:sq:shtëpi:NOUN']);
    expect(e.subject.sentenceKey).toBe(ids.sentenceKey(SENTENCE));
    expect(e.subject.sourceRef).toEqual({ kind: 'web', title: 'A page', locator: '/chapter/1' });
    expect(e.provenance).toMatchObject({ analyzerId: expect.stringMatching(/adapter-sq@/), packId: expect.stringMatching(/^pack:sq:/) });
    expect(e.provenance!.confidence).toBeGreaterThan(0);
    expect(e.payload).toMatchObject({ contextKind: 'sentence', mode: 'word-list-only', readerId: 'web-generic', surface: 'shtëpinë' });
    expect(e.at).toBe('2026-10-08T10:00:00.000Z');
  });

  it('never carries the sentence or the page text anywhere in the serialized row', () => {
    const e = event();
    const json = JSON.stringify(e);
    for (const w of ['po lexoj', 'libër të bukur', 'time.', SENTENCE]) expect(json).not.toContain(w);
  });

  it('a long selection is a passage: its surface is not stored, only its size', () => {
    const words = Array.from({ length: 20 }, () => 'shtëpi');
    const long = card(words.join(' '), `Ai tha ${words.join(' ')} sot.`);
    const e = event(long);
    expect(e.payload.surface).toBeUndefined();
    expect(e.payload.surfaceOmitted).toBe(true);
    expect(e.payload.tokenCount).toBe(20);
    expect(JSON.stringify(e)).not.toContain(words.join(' '));
    const short = event(card('një libër'));
    expect(short.payload.surface).toBe('një libër');
    expect(MAX_STORED_SURFACE_WORDS).toBeGreaterThanOrEqual(2);
  });

  it('with no context there is no sentence key; a fragment carries a fragment key instead', () => {
    const none = event(parseSelection({ surface: 'libër', context: { kind: 'none', confidence: 0 } }));
    expect(none.subject.sentenceKey).toBeUndefined();
    expect(none.payload.contextKind).toBe('none');
    expect(validateEvent(none)).toEqual([]);
    const frag = event(parseSelection({ surface: 'libër', context: { kind: 'fragment', confidence: 0.3, sentence: 'lexoj një libër të', selStart: 10, selEnd: 15 } }));
    expect(frag.subject.sentenceKey).toBeUndefined();
    expect(frag.payload.fragmentKey).toMatch(/^[0-9a-f]{12}$/);
  });

  it('an unconfirmed reading is credited as a form, not a lemma', () => {
    const e = event(card('Flurbozitet', 'Flurbozitet shkëlqejnë sot.'));
    expect(e.subject.itemIds).toEqual(['form:sq:flurbozitet']);
    expect(e.payload.unconfirmed).toBe(true);
  });

  it('the source reference keeps the title short', () => {
    const e = event(card(), { source: { kind: 'web', title: 'x'.repeat(500), locator: '/p' } });
    expect(e.subject.sourceRef!.title!.length).toBe(120);
  });
});

describe('the store', () => {
  it('validates before writing: an invalid row is refused and nothing is stored', async () => {
    const store = createMemoryEncounterStore();
    const bad = { ...event(), at: 'yesterday' };
    const r = await store.append(bad);
    expect(r.ok).toBe(false);
    expect(r.issues!.map((i) => i.path)).toContain('at');
    expect(await store.count()).toBe(0);
    const withText = { ...event(), subject: { ...event().subject, sentenceText: SENTENCE } };
    const r2 = await store.append(withText as never);
    expect(r2.ok).toBe(false);
    expect(await store.count()).toBe(0);
  });

  it('writes, counts, lists in time order, and is idempotent on the dedupe key', async () => {
    const store = createMemoryEncounterStore();
    const a = event(card(), { now: new Date('2026-10-08T10:00:00.000Z') });
    const b = event(card('libër'), { now: new Date('2026-10-08T10:00:05.000Z') });
    expect((await store.append(b)).ok).toBe(true);
    expect((await store.append(a)).ok).toBe(true);
    const again = await store.append({ ...a, id: 'ev:other' });
    expect(again).toMatchObject({ ok: true, duplicate: true, id: a.id });
    expect(await store.count()).toBe(2);
    expect((await store.list()).map((e) => e.at)).toEqual(['2026-10-08T10:00:00.000Z', '2026-10-08T10:00:05.000Z']);
  });

  it('exports the rows as JSON and clears them', async () => {
    const store = createMemoryEncounterStore();
    await store.append(event());
    const text = await store.exportRows();
    const rows = JSON.parse(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('SelectionLookedUp');
    expect(await store.clear()).toBe(1);
    expect(await store.count()).toBe(0);
    expect(JSON.parse(await store.exportRows())).toEqual([]);
  });

  it('keeps other storage keys out of the rows, and reports a storage failure as a failed write', async () => {
    const area = createMemoryStorageArea();
    await area.set({ 'other:key': 1, [DEVICE_KEY]: 'dev-x' });
    const store = createStorageEncounterStore(area);
    await store.append(event());
    expect(await store.count()).toBe(1);
    const broken = createStorageEncounterStore({ ...area, set: async () => { throw new Error('QUOTA_BYTES exceeded'); } });
    const r = await broken.append(event(card('libër')));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/QUOTA/);
  });

  it('the device id is created once and kept', async () => {
    const area = createMemoryStorageArea();
    const a = await getDeviceId(area);
    const b = await getDeviceId(area);
    expect(a).toBe(b);
    expect(a).toMatch(/^dev-/);
    const down = await getDeviceId({ ...area, get: async () => { throw new Error('down'); } });
    expect(down).toMatch(/^dev-session-/);
  });
});
