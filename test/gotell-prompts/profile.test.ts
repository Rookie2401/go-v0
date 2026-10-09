import { describe, expect, it } from 'vitest';
import { buildWriterProfile } from '../../packages/gotell/src/profile';
import { LEARNER, NOW, event, goalEvent, row, source } from './helpers';

const id = { learnerId: LEARNER, languageId: 'sq', varietyId: 'sq-standard' };

describe('writer profile', () => {
  it('separates production from reading: a unit with reading evidence only is not productive', async () => {
    const rows = [
      row('lemma:sq:shtëpi:NOUN', { contextualProduction: { weight: 1.2 }, readingRecognition: { weight: 2 } }),
      row('lemma:sq:ujë:NOUN', { productiveRetrieval: { weight: 0.5 } }),
      row('lemma:sq:libër:NOUN', { readingRecognition: { weight: 3, positive: 3, observations: 3 }, exposure: { weight: 3 } }),
      row('lemma:sq:nënë:NOUN', { assistedRecognition: { weight: 1 }, exposure: { weight: 1 } }),
      row('lemma:sq:çaj:NOUN', { contextualProduction: { weight: 0 }, productiveRetrieval: { weight: 0 }, readingRecognition: { weight: 1 } }),
    ];
    const p = await buildWriterProfile(source(rows), id, NOW);
    expect(p.productive).toEqual(['lemma:sq:shtëpi:NOUN', 'lemma:sq:ujë:NOUN']);
    expect(p.productive).not.toContain('lemma:sq:libër:NOUN');
    expect(p.recognisedOnly).toEqual(['lemma:sq:libër:NOUN', 'lemma:sq:çaj:NOUN']);
    // read-and-written is productive, never "recognised only"
    expect(p.recognisedOnly).not.toContain('lemma:sq:shtëpi:NOUN');
    // no overlap between the two lists
    expect(p.productive.filter((u) => p.recognisedOnly.includes(u))).toEqual([]);
  });

  it('heavy reading never raises the band', async () => {
    const rows = Array.from({ length: 200 }, (_, i) => row(`lemma:sq:w${i}:NOUN`, { readingRecognition: { weight: 5 } }));
    const p = await buildWriterProfile(source(rows), id, NOW);
    expect(p.productive).toHaveLength(0);
    expect(p.recognisedOnly).toHaveLength(200);
    expect(p.band.level).toBe('first-sentences');
  });

  it('ignores other learners and other languages', async () => {
    const rows = [
      row('lemma:sq:a:NOUN', { contextualProduction: { weight: 1 } }),
      row('lemma:sq:b:NOUN', { contextualProduction: { weight: 1 } }, { learnerId: 'someone-else' }),
      row('lemma:es:c:NOUN', { contextualProduction: { weight: 1 } }, { languageId: 'es' }),
    ];
    const p = await buildWriterProfile(source(rows), id, NOW);
    expect(p.productive).toEqual(['lemma:sq:a:NOUN']);
  });

  it('finds weak constructions: more negative than positive grammatical evidence, morph/syntax units only', async () => {
    const rows = [
      row('syntax:sq:negation-nuk', { grammaticalUnderstanding: { negative: 3, positive: 1 } }),
      row('morph:sq:NOUN:Case=Acc|Definite=Def|Number=Sing', { grammaticalUnderstanding: { negative: 2, positive: 0 } }),
      row('syntax:sq:question-a', { grammaticalUnderstanding: { negative: 1, positive: 1 } }),
      row('syntax:sq:future', { grammaticalUnderstanding: { negative: 0, positive: 4 } }),
      row('lemma:sq:libër:NOUN', { grammaticalUnderstanding: { negative: 5, positive: 0 } }),
    ];
    const p = await buildWriterProfile(source(rows), id, NOW);
    expect(p.weakConstructions).toEqual(['morph:sq:NOUN:Case=Acc|Definite=Def|Number=Sing', 'syntax:sq:negation-nuk']);
  });

  it('finds recurring errors: a category in at least two of the learner’s own events', async () => {
    const events = [
      event('ProductionRecorded', { categories: ['agreement', 'spelling'] }),
      event('CorrectionAccepted', { category: 'agreement' }),
      event('CorrectionRejected', { categories: ['spelling', 'spelling'] }), // counts once per event
      event('CorrectionAccepted', { category: 'case' }),
      event('ProductionRecorded', { categories: ['case'] }, { learnerId: 'someone-else' }), // not this learner
      event('ProductionRecorded', { categories: ['definiteness'] }, { languageId: 'es' }),
      event('DraftSaved', { category: 'case' }), // wrong kind
    ];
    const p = await buildWriterProfile(source([], events), id, NOW);
    expect(p.recurringErrors).toEqual(['agreement', 'spelling']);
    const none = await buildWriterProfile(source([], [event('ProductionRecorded', { category: 'case' })]), id, NOW);
    expect(none.recurringErrors).toEqual([]);
  });

  it('lists units met in the last 14 days', async () => {
    const rows = [
      row('lemma:sq:a:NOUN', { exposure: { lastAt: '2026-10-08T00:00:00.000Z' } }),
      row('lemma:sq:b:NOUN', { exposure: { lastAt: '2026-09-26T12:00:00.000Z' } }), // 13 days
      row('lemma:sq:c:NOUN', { exposure: { lastAt: '2026-09-20T00:00:00.000Z' } }), // older
      row('lemma:sq:d:NOUN', {}),
    ];
    const p = await buildWriterProfile(source(rows), id, NOW);
    expect(p.recent).toEqual(['lemma:sq:a:NOUN', 'lemma:sq:b:NOUN']);
  });

  it('reads explanation depth, defaulting to brief', async () => {
    expect((await buildWriterProfile(source([]), id, NOW)).explanationDepth).toBe('brief');
    expect((await buildWriterProfile(source([], [], 'explanatory'), id, NOW)).explanationDepth).toBe('explanatory');
    expect((await buildWriterProfile(source([], [], 'label'), id, NOW)).explanationDepth).toBe('label');
    expect((await buildWriterProfile(source([], [], 'nonsense'), id, NOW)).explanationDepth).toBe('brief');
  });

  it('reads the learner’s goals from gotell:goal PreferenceChanged events; the latest per goalId wins', async () => {
    const events = [
      goalEvent({ goalId: 'g1', text: 'Write to my host family', createdAt: '2026-10-01T08:00:00.000Z' }, '2026-10-01T08:00:00.000Z'),
      goalEvent({ goalId: 'g2', text: 'Tell my story', createdAt: '2026-10-02T08:00:00.000Z' }, '2026-10-02T08:00:00.000Z'),
      goalEvent({ goalId: 'g1', text: 'Write to my host family', createdAt: '2026-10-01T08:00:00.000Z', done: true }, '2026-10-05T08:00:00.000Z'),
      goalEvent({ goalId: 'g3', text: 'Gone', createdAt: '2026-10-03T08:00:00.000Z' }, '2026-10-03T08:00:00.000Z'),
      goalEvent({ goalId: 'g3', removed: true }, '2026-10-04T08:00:00.000Z'),
      event('PreferenceChanged', { key: 'explanationDepth', origin: 'explicit', value: 'brief' }),
      goalEvent({ goalId: 'g4', text: '   ' }), // blank text ignored
      goalEvent(null),
      event('PreferenceChanged', { key: 'gotell:goal', origin: 'explicit', value: { goalId: 'x', text: 'other learner' } }, { learnerId: 'someone-else' }),
    ];
    const p = await buildWriterProfile(source([], events), id, NOW);
    expect(p.goals).toEqual([
      { goalId: 'g1', text: 'Write to my host family', createdAt: '2026-10-01T08:00:00.000Z', done: true },
      { goalId: 'g2', text: 'Tell my story', createdAt: '2026-10-02T08:00:00.000Z' },
    ]);
  });

  it('reads a goal whose words are under `label` (what GoTell writes now) as well as the older `text`', async () => {
    const events = [
      goalEvent({ goalId: 'n1', label: 'Pray in Albanian', createdAt: '2026-10-01T08:00:00.000Z' }, '2026-10-01T08:00:00.000Z'),
      goalEvent({ goalId: 'o1', text: 'An older goal', createdAt: '2026-10-02T08:00:00.000Z' }, '2026-10-02T08:00:00.000Z'),
      goalEvent({ goalId: 'n1', label: 'Pray in Albanian', createdAt: '2026-10-01T08:00:00.000Z', done: true }, '2026-10-06T08:00:00.000Z'),
    ];
    const p = await buildWriterProfile(source([], events), id, NOW);
    expect(p.goals).toEqual([
      { goalId: 'n1', text: 'Pray in Albanian', createdAt: '2026-10-01T08:00:00.000Z', done: true },
      { goalId: 'o1', text: 'An older goal', createdAt: '2026-10-02T08:00:00.000Z' },
    ]);
  });

  it('derives the band from the productive count and names its basis', async () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => row(`lemma:sq:w${i}:NOUN`, { contextualProduction: { weight: 1 } }));
    const at = async (n: number) => buildWriterProfile(source(many(n)), id, NOW);
    expect((await at(0)).band.level).toBe('first-sentences');
    expect((await at(9)).band.level).toBe('first-sentences');
    expect((await at(10)).band.level).toBe('short-paragraph');
    expect((await at(59)).band.level).toBe('short-paragraph');
    expect((await at(60)).band.level).toBe('connected-paragraphs');
    const p = await at(12);
    expect(p.band.basis.join(' ')).toMatch(/12 units with evidence of your own production/);
    expect(p.band.basis.length).toBeGreaterThan(0);
  });

  it('carries identity and never emits a CEFR label', async () => {
    const rows = Array.from({ length: 70 }, (_, i) => row(`lemma:sq:w${i}:NOUN`, { contextualProduction: { weight: 1 }, readingRecognition: { weight: 1 } }));
    const p = await buildWriterProfile(source(rows, [event('ProductionRecorded', { category: 'case' }), event('ProductionRecorded', { category: 'case' })], 'explanatory'), id, NOW);
    expect(p.learnerId).toBe(LEARNER);
    expect(p.languageId).toBe('sq');
    expect(p.varietyId).toBe('sq-standard');
    const text = JSON.stringify(p);
    expect(text).not.toMatch(/CEFR/i);
    expect(text).not.toMatch(/\b[ABC][12]\b/);
  });
});
