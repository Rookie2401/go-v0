import { beforeAll, describe, expect, it } from 'vitest';
import { BUILDERS, GAP, PROVISIONAL_EXCEPTION, validateExercise } from '../../../packages/goreview/src/exercises';
import type { ReviewExercise } from '../../../packages/goreview/src/exercises';
import { FAMILY_DIMENSION } from '../../../packages/goreview/src/types';
import type { ExerciseFamily } from '../../../packages/goreview/src/types';
import { IDS, ctxOf, fakeAudio, makeWorld, target } from './support';

const world = makeWorld();
const good: Partial<Record<string, ReviewExercise>> = {};

async function make(key: string, family: ExerciseFamily, id: string, random = 0.1): Promise<ReviewExercise> {
  const f = await world.facts(id);
  const r = await BUILDERS[family].build(target(id, FAMILY_DIMENSION[family]), f, ctxOf({ audio: fakeAudio('recorded'), random: () => random }));
  if ('unavailable' in r) throw new Error(r.reason);
  good[key] = r as ReviewExercise;
  return r as ReviewExercise;
}
const clone = (e: ReviewExercise): ReviewExercise => structuredClone(e) as ReviewExercise;
const issues = (e: ReviewExercise): string => validateExercise(e).issues.join(' | ');

beforeAll(async () => {
  await make('recognition', 'written-recognition', IDS.liber);
  await make('toForm', 'meaning-to-form', IDS.liber);
  await make('feature', 'morphological-identification', IDS.shkolle, 0);
  await make('lemma', 'morphological-identification', IDS.librin);
  await make('grammar', 'grammar-application', IDS.liber);
  await make('phrase', 'phrase-comprehension', IDS.phrase);
  await make('cloze', 'sentence-completion', IDS.shkolle);
  await make('hear', 'audio-to-meaning', IDS.liber);
  await make('write', 'audio-transcription', IDS.liber);
});

describe('validateExercise accepts what the builders make', () => {
  it('every good exercise is ok with no issues', () => {
    for (const [k, e] of Object.entries(good)) expect(validateExercise(e!), k).toEqual({ ok: true, issues: [] });
  });
});

describe('validateExercise catches a bad exercise', () => {
  it('an empty instruction, no accepted answer, no explanation, no id', () => {
    const a = clone(good.recognition!);
    a.prompt.instruction = '   ';
    expect(issues(a)).toContain('the instruction is empty');
    const b = clone(good.recognition!);
    b.answerKey.accepted = ['', ' '];
    expect(issues(b)).toContain('there is no accepted answer');
    const c = clone(good.recognition!);
    c.answerKey.explanation = '';
    expect(issues(c)).toContain('no explanation');
    const d = clone(good.recognition!);
    d.exerciseId = '';
    expect(issues(d)).toContain('no id');
  });

  it('the stimulus never equals the answer for a meaning question', () => {
    const a = clone(good.recognition!);
    a.prompt.stimulusText = 'LIBËR';
    a.answerKey.accepted = ['LIBËR'];
    expect(issues(a)).toContain('the stimulus equals an accepted answer');
    const loose = clone(good.recognition!);
    loose.prompt.stimulusText = 'libër';
    loose.answerKey.accepted = ['liber'];
    expect(issues(loose)).toContain('the stimulus equals an accepted answer');
    const b = clone(good.toForm!);
    b.prompt.meaning = 'libër';
    expect(issues(b)).toContain('the stimulus equals an accepted answer');
    const c = clone(good.hear!);
    c.answerKey.accepted = ['libër'];
    expect(issues(c)).toContain('the stimulus equals an accepted answer');
    const d = clone(good.recognition!);
    delete d.prompt.stimulusText;
    expect(issues(d)).toContain('the stimulus is missing');
  });

  it('an audio exercise lists its written form as hidden, has its stimulus, and does not name the word', () => {
    for (const k of ['hear', 'write']) {
      const a = clone(good[k]!);
      a.hiddenBeforeAnswer = [];
      expect(issues(a), k).toContain('hiddenBeforeAnswer');
      const b = clone(good[k]!);
      delete b.prompt.audio;
      expect(issues(b), k).toContain('needs its stimulus');
      const c = clone(good[k]!);
      c.prompt.instruction = 'Listen to libër and type it.';
      expect(issues(c), k).toContain('instruction names the hidden word');
      const d = clone(good[k]!);
      (d.prompt.audio as { answerHidden: boolean }).answerHidden = false;
      expect(issues(d), k).toContain('does not declare its answer hidden');
      const e = clone(good[k]!);
      e.prompt.audio!.itemIds = ['lemma:sq:other:NOUN'];
      expect(issues(e), k).toContain('another unit');
      const f = clone(good[k]!);
      delete f.prompt.stimulusText;
      expect(issues(f), k).toContain('written form of the audio is missing');
    }
    const m = clone(good.hear!);
    m.prompt.meaning = 'book';
    expect(issues(m)).toContain('the meaning must be listed in hiddenBeforeAnswer');
  });

  it('eligibility must be consistent with the target’s status', () => {
    for (const k of ['toForm', 'feature', 'grammar', 'cloze']) {
      const a = clone(good[k]!);
      a.eligibility = { eligible: true, status: 'provisional', caveats: ['x'] };
      expect(issues(a), k).toContain('refuse a provisional analysis');
      const b = clone(good[k]!);
      b.eligibility = { eligible: true, status: 'conflicted', caveats: [] };
      expect(issues(b), k).toContain('conflicted analysis');
      const c = clone(good[k]!);
      c.eligibility = { eligible: false, status: 'conflicted', reason: 'x' };
      expect(issues(c), k).toContain('ineligible target');
    }
    const inv = clone(good.recognition!);
    inv.eligibility = { eligible: true, status: 'invalidated', caveats: [] };
    expect(issues(inv)).toContain('invalidated analysis');
    // a provisional recognition exercise needs its caveat
    const noCaveat = clone(good.recognition!);
    noCaveat.eligibility = { eligible: true, status: 'provisional', caveats: [] };
    expect(issues(noCaveat)).toContain('needs its caveat');
    const withCaveat = clone(good.recognition!);
    withCaveat.eligibility = { eligible: true, status: 'provisional', caveats: ['provisional analysis; shown with caveats'] };
    expect(validateExercise(withCaveat).ok).toBe(true);
  });

  it('the provisional exception is exactly the lemma question tagged as such', () => {
    expect(validateExercise(good.lemma!).ok).toBe(true);
    const noTag = clone(good.lemma!);
    noTag.builtFrom.facts = noTag.builtFrom.facts.filter((x) => x !== PROVISIONAL_EXCEPTION);
    expect(issues(noTag)).toContain('refuse a provisional analysis');
    const feature = clone(good.lemma!);
    feature.answerKey.features = { Case: 'Acc' };
    expect(issues(feature)).toContain('refuse a provisional analysis');
    const other = clone(good.lemma!);
    other.family = 'sentence-completion';
    other.target.dimension = 'productive-recall';
    expect(issues(other)).toContain('refuse a provisional analysis');
  });

  it('sentences: only the pack’s sources, and the surface at the offsets', () => {
    const a = clone(good.cloze!);
    (a.context as { source: string }).source = 'commercial-book';
    (a.builtFrom as { sentenceSource: string }).sentenceSource = 'commercial-book';
    expect(issues(a)).toContain('not an allowed source');
    const b = clone(good.cloze!);
    b.context!.start += 1;
    b.context!.end += 1;
    expect(issues(b)).toContain('does not contain the surface at the given offsets');
    const c = clone(good.cloze!);
    c.context!.end = 9999;
    expect(issues(c)).toContain('offsets are out of range');
    const d = clone(good.cloze!);
    delete d.builtFrom.sentenceSource;
    expect(issues(d)).toContain('declared sentence source does not match');
    const e = clone(good.cloze!);
    delete e.context;
    expect(issues(e)).toMatch(/needs (its context|a pack sentence)/);
    const f = clone(good.feature!);
    delete f.context;
    expect(issues(f)).toContain('needs a pack sentence');
    const g = clone(good.feature!);
    g.prompt.stimulusText = 'Another sentence.';
    expect(issues(g)).toContain('stimulus is not the sentence');
  });

  it('a gap sentence has one gap, matches the offsets, and does not leak', () => {
    const a = clone(good.cloze!);
    a.prompt.sentenceWithGap = `Ana ${GAP} në ${GAP}.`;
    expect(issues(a)).toContain('exactly one gap');
    const b = clone(good.cloze!);
    b.prompt.sentenceWithGap = 'Ana shkon në shkollë.';
    expect(issues(b)).toContain('does not match the sentence and offsets');
    const c = clone(good.cloze!);
    c.answerKey.accepted = ['shkon'];
    expect(issues(c)).toContain('the word that was removed is not an accepted answer');
    // a sentence that still holds the answer elsewhere
    const d = clone(good.cloze!);
    d.context = { sentence: 'Ana shkon në shkollë e shkollë.', surface: 'shkollë', start: 13, end: 20, source: 'pack-validation' };
    d.prompt.sentenceWithGap = `Ana shkon në ${GAP} e shkollë.`;
    expect(issues(d)).toContain('still contains the answer');
  });

  it('choice questions: the answer among distinct options, exactly one correct, no options for typed ones', () => {
    const a = clone(good.feature!);
    a.prompt.options = a.prompt.options!.filter((o) => o !== a.answerKey.accepted[0]);
    expect(issues(a)).toContain('correct answer is not among the options');
    const b = clone(good.feature!);
    b.prompt.options = [b.answerKey.accepted[0]];
    expect(issues(b)).toContain('at least two options');
    const c = clone(good.feature!);
    c.prompt.options = [...c.prompt.options!, c.prompt.options![0]];
    expect(issues(c)).toContain('options are not distinct');
    const d = clone(good.feature!);
    d.answerKey.accepted = [...d.answerKey.accepted, d.prompt.options!.find((o) => o !== d.answerKey.accepted[0])!];
    expect(issues(d)).toContain('exactly one correct option');
    const e = clone(good.toForm!);
    e.prompt.options = ['a', 'b'];
    expect(issues(e)).toContain('options are only for a choice question');
  });

  it('the family’s dimension and response mode', () => {
    const a = clone(good.recognition!);
    a.target.dimension = 'productive-recall';
    expect(issues(a)).toContain('is not the one written-recognition tests');
    const b = clone(good.toForm!);
    b.responseMode = 'choice';
    expect(issues(b)).toContain('does not take the response mode choice');
    const c = clone(good.write!);
    c.responseMode = 'typed-or-self';
    expect(issues(c)).toContain('does not take the response mode');
  });
});
