/**
 * Authorship judged from the steps that were really shown (produced by the real engine, not hand-written), and from the text.
 */
import { describe, expect, it } from 'vitest';
import { createAssistance, isReproducedLater, judgeAuthorship, shownSentence } from '../../packages/gotell/src/engine';
import type { Refusal } from '../../packages/gotell/src/engine';
import type { AssistanceLevel, AssistanceStep, Authorship } from '../../packages/gotell/src/types';
import { AUTHORSHIP } from '../../packages/gotell/src/types';
import { NOW, realAnalyzer } from './helpers';

const analyzer = realAnalyzer();
const SENTENCE = 'Unë shkoj te libër.';
const analysis = analyzer.analyzeDraft('d1', `${SENTENCE} Unë shkoj me shoku.`);
const remoteProposal = 'Unë shkoj me shokun.';

async function stepsThrough(level: AssistanceLevel, sentenceIndex = 0, opts: { remote?: boolean; own?: string } = {}): Promise<AssistanceStep[]> {
  const a = createAssistance({
    analyzer, consent: { remoteAssistance: () => !!opts.remote }, now: () => NOW,
    ...(opts.remote ? { remote: { providerId: 'fake', propose: async () => [{ suggested: remoteProposal, explanation: 'x', confidence: 0.9 }] } } : {}),
  });
  const r = await a.through(analysis, { draftId: 'd1', sentenceIndex, level, at: NOW }, [], opts.own ? { ownSentence: opts.own } : {});
  if ('refused' in r) throw new Error((r as Refusal).reason);
  return r.steps;
}

describe('judgeAuthorship', () => {
  it('independent: no step touched the sentence', () => {
    expect(judgeAuthorship(SENTENCE, [], {})).toBe('independent');
    expect(judgeAuthorship(SENTENCE, [])).toBe('independent');
    expect(judgeAuthorship(SENTENCE, [], { previous: 'Unë shkoj te libër' })).toBe('independent');
  });

  it('after-hint: only levels 1–3 were shown, whatever the learner then wrote', async () => {
    for (const level of [1, 2, 3] as const) {
      const steps = await stepsThrough(level);
      expect(judgeAuthorship('Unë shkoj te libri.', steps), `level ${level}`).toBe('after-hint');
      expect(judgeAuthorship('Unë po shkoj te libri.', steps)).toBe('after-hint');
    }
  });

  it('after-hint even when the learner’s fix happens to equal the checker’s replacement, because no correction was shown', async () => {
    const steps = await stepsThrough(3); // the replacement was NAMED, the revised sentence was not shown
    expect(judgeAuthorship('Unë shkoj te libri.', steps)).toBe('after-hint');
  });

  it('copied-from-model: the text equals a shown correction (level 4), after case, spacing and end punctuation are ignored', async () => {
    const steps = await stepsThrough(4);
    expect(shownSentence(steps[3])).toBe('Unë shkoj te libri.');
    expect(judgeAuthorship('Unë shkoj te libri.', steps)).toBe('copied-from-model');
    expect(judgeAuthorship('  unë  shkoj te LIBRI ', steps)).toBe('copied-from-model');
    expect(judgeAuthorship('Unë shkoj te libri!', steps)).toBe('copied-from-model');
  });

  it('copied-from-model: the text equals a shown model (level 6)', async () => {
    const steps = await stepsThrough(6);
    const model = shownSentence(steps[steps.length - 1])!;
    expect(model).toBe('Fëmijët lexojnë librin.');
    expect(judgeAuthorship('Fëmijët lexojnë librin.', steps)).toBe('copied-from-model');
  });

  it('revised-after-feedback: a correction was shown and the learner wrote something else', async () => {
    const steps = await stepsThrough(4);
    expect(judgeAuthorship('Unë shkoj tek libri.', steps)).toBe('revised-after-feedback');
    expect(judgeAuthorship(SENTENCE, steps)).toBe('revised-after-feedback'); // kept their own sentence after seeing the correction: still after feedback
    const alts = await stepsThrough(5);
    expect(judgeAuthorship('Unë shkoj te libri.', alts)).toBe('copied-from-model'); // the level 4 correction came with it
    expect(judgeAuthorship('Unë shkoj tek mësuesi.', alts)).toBe('revised-after-feedback');
  });

  it('revised-after-feedback: a model was shown and the learner did not copy it', async () => {
    const steps = await stepsThrough(6);
    expect(judgeAuthorship('Unë shkoj te mësuesi.', steps)).toBe('revised-after-feedback');
  });

  it('ai-generated: the text equals what a remote assistant proposed', async () => {
    const steps = await stepsThrough(6, 1, { remote: true });
    const last = steps[steps.length - 1];
    expect(last.source).toBe('remote-assistant');
    expect(judgeAuthorship(remoteProposal, steps)).toBe('ai-generated');
    expect(judgeAuthorship('unë shkoj me shokun', steps)).toBe('ai-generated');
    expect(judgeAuthorship('Unë shkoj me shokët.', steps)).toBe('revised-after-feedback');
  });

  it('the learner’s own earlier sentence, shown back, is not help: reusing it stays independent', async () => {
    const steps = await stepsThrough(6, 0, { own: 'Unë shkoj te mësuesi.' });
    const own = steps.filter((s) => s.source === 'learner-own-sentence');
    expect(own).toHaveLength(1);
    expect(judgeAuthorship('Unë shkoj te mësuesi.', own)).toBe('independent');
  });

  it('history can carry the shown text when the steps are not to hand', () => {
    expect(judgeAuthorship('Unë shkoj te libri.', [{ level: 4, content: 'x', revealedUnitIds: [], source: 'adapter-checker', at: NOW }], { acceptedCorrection: 'Unë shkoj te libri.' })).toBe('copied-from-model');
    expect(judgeAuthorship('Fëmijët lexojnë librin.', [{ level: 6, content: 'x', revealedUnitIds: [], source: 'pack-sentence', at: NOW }], { modelShown: 'Fëmijët lexojnë librin.' })).toBe('copied-from-model');
  });

  it('letters are never normalised away: ë and e are different sentences', async () => {
    const steps = await stepsThrough(6);
    expect(judgeAuthorship('Femijet lexojne librin.', steps)).toBe('revised-after-feedback');
  });

  it('only returns values of the contract; reproduced-later is the documents module’s call', async () => {
    const seen = new Set<Authorship>();
    for (const lvl of [1, 4, 6] as const) seen.add(judgeAuthorship('Unë shkoj te mësuesi.', await stepsThrough(lvl)));
    seen.add(judgeAuthorship(SENTENCE, []));
    for (const v of seen) expect(AUTHORSHIP).toContain(v);
    expect(seen.has('reproduced-later')).toBe(false);
  });
});

describe('isReproducedLater', () => {
  const earlier = [
    { text: 'Unë shkoj te libri.', authorship: 'copied-from-model' as const },
    { text: 'Unë lexoj librin.', authorship: 'independent' as const },
    { text: 'Ana shkon në shkollë.', authorship: 'after-hint' as const },
  ];

  it('is true when a later sentence repeats one that was assisted before', () => {
    expect(isReproducedLater('Unë shkoj te libri.', earlier)).toBe(true);
    expect(isReproducedLater('ana shkon në shkollë', earlier)).toBe(true);
  });

  it('is false for a sentence that was independent before, a new sentence, or an empty one', () => {
    expect(isReproducedLater('Unë lexoj librin.', earlier)).toBe(false);
    expect(isReproducedLater('Unë shkoj te mësuesi.', earlier)).toBe(false);
    expect(isReproducedLater('', earlier)).toBe(false);
    expect(isReproducedLater('Unë shkoj te libri.', [])).toBe(false);
  });

  it('counts a bare string as an assisted sentence, and an earlier reproduced-later one too', () => {
    expect(isReproducedLater('Unë shkoj te libri.', ['Unë shkoj te libri.'])).toBe(true);
    expect(isReproducedLater('Unë shkoj te libri.', [{ text: 'Unë shkoj te libri.', authorship: 'reproduced-later' }])).toBe(true);
  });
});

describe('shownSentence', () => {
  it('reads back a correction or a model from a step, and nothing from the other levels', async () => {
    const steps = await stepsThrough(6);
    expect(steps.map((s) => shownSentence(s) !== undefined)).toEqual([false, false, false, true, false, true]);
  });
});
