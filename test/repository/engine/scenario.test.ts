// @vitest-environment node
/** Prompt 3 §8 scenario: one Albanian form across click, help, audio, a grammar miss, written recall and listening. */
import { describe, expect, it } from 'vitest';
import { createProjectionEngine } from '../../../packages/repository-engine/src';
import { FakeStore } from './fakeStore';
import { L, NOW, assist, card, grammar, listening, lookup, play, resetIds, unit } from './helpers';

const FORM = 'form:sq:librin';
const LEMMA = 'lemma:sq:libër:NOUN';
const CONSTRUCTION = 'morph:sq:NOUN:Case=Acc|Definite=Def|Gender=Masc|Number=Sing';

describe('the "librin" scenario', () => {
  it('keeps every dimension apart: exposure, assistance and playback counted, grammar missed, recall and listening earned, reading untouched', async () => {
    resetIds();
    const t = (m: number) => ({ at: `2026-10-07T09:${String(m).padStart(2, '0')}:00.000Z` });
    const store = new FakeStore();
    store.units.set(FORM, unit(FORM, 'form'));
    store.units.set(LEMMA, unit(LEMMA, 'lexeme'));
    store.units.set(CONSTRUCTION, unit(CONSTRUCTION, 'morph-construction'));
    await store.append(L, [
      lookup([FORM, LEMMA], { ...t(1), sentenceKey: 's-1' }), // click
      assist([FORM, LEMMA], { assistance: 'gloss' }, { ...t(2), sentenceKey: 's-1' }), // request meaning
      play([FORM], { ...t(3), sentenceKey: 's-1' }), // play audio
      grammar([FORM], CONSTRUCTION, false, {}, t(4)), // wrong grammar answer
      card([LEMMA], 'recall', true, { cardKind: 'recall' }, t(5)), // correct written recall
      listening([FORM], true, {}, t(6)), // correct audio-only recognition
    ]);
    const engine = createProjectionEngine({ store, now: () => NOW });
    await engine.project(L);
    const rows = await engine.knowledge(L);
    const f = rows.find((r) => r.unitId === FORM)!;
    const l = rows.find((r) => r.unitId === LEMMA)!;
    const c = rows.find((r) => r.unitId === CONSTRUCTION)!;

    expect(f.dimensions.exposure.weight).toBeGreaterThan(0);
    expect(f.dimensions.exposure.observations).toBe(3);
    expect(await engine.counters(L, FORM)).toEqual({ encounters: 0, lookups: 1, assistance: 1, playbacks: 1, byLanguageBasis: { missing: 1 } });
    expect(f.dimensions.exposure.negative).toBe(2); // lookup + assistance request
    expect(f.dimensions.exposure.positive).toBe(1); // the playback

    expect(c.dimensions.grammaticalUnderstanding.negative).toBeGreaterThan(0);
    expect(c.dimensions.grammaticalUnderstanding.positive).toBe(0);
    expect(c.dimensions.grammaticalUnderstanding.score).toBeLessThan(0.5);

    expect(l.dimensions.productiveRetrieval.positive).toBeGreaterThan(0);
    expect(f.dimensions.listeningRecognition.positive).toBeGreaterThan(0);

    for (const r of [f, l, c]) {
      expect(r.dimensions.readingRecognition.observations, r.unitId).toBe(0);
      expect(r.dimensions.readingRecognition.confidence).toBe(0);
    }
    // the audio exposure did not become listening recognition on its own: one assessment only
    expect(f.dimensions.listeningRecognition.observations).toBe(1);
    expect(f.dimensions.productiveRetrieval.observations).toBe(0);

    // nothing says "learned" (or "known" / "mastered") anywhere in the output
    expect(JSON.stringify(rows)).not.toMatch(/learned|mastered|known/i);
    expect(f.analysisStatus).toBe('verified');
    expect(f.basis.events).toBe(4);
    expect(f.firstSeenAt).toBe('2026-10-07T09:01:00.000Z');
  });
});
