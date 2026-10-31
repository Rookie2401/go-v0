import { describe, expect, it } from 'vitest';
import {
  BUILDERS, PROVISIONAL_EXCEPTION, buildExercise, familiesFor, gradeAndRate, validateExercise,
} from '../../../packages/goreview/src/exercises';
import type { ReviewExercise } from '../../../packages/goreview/src/exercises';
import type { ReviewFacts } from '../../../packages/goreview/src/facts';
import { EXERCISE_FAMILIES, FAMILY_DIMENSION } from '../../../packages/goreview/src/types';
import type { Exercise, ExerciseFamily, Response } from '../../../packages/goreview/src/types';
import { IDS, ctxOf, fakeAudio, makeWorld, target } from './support';
import type { World } from './support';

const resp = (over: Partial<Response> = {}): Response => ({ hinted: false, assistance: [], ...over });

async function build(w: World, family: ExerciseFamily, id: string, ctx = ctxOf(), facts?: ReviewFacts): Promise<ReviewExercise | { unavailable: true; reason: string }> {
  const f = facts ?? await w.facts(id);
  const r = await BUILDERS[family].build(target(id, FAMILY_DIMENSION[family]), f, ctx);
  return r as ReviewExercise | { unavailable: true; reason: string };
}
async function ok(w: World, family: ExerciseFamily, id: string, ctx = ctxOf(), facts?: ReviewFacts): Promise<ReviewExercise> {
  const r = await build(w, family, id, ctx, facts);
  if ('unavailable' in r) throw new Error(`${family} ${id}: ${r.reason}`);
  return r;
}
async function refused(w: World, family: ExerciseFamily, id: string, ctx = ctxOf(), facts?: ReviewFacts): Promise<string> {
  const r = await build(w, family, id, ctx, facts);
  if (!('unavailable' in r)) throw new Error(`${family} ${id} should have been refused`);
  return r.reason;
}

describe('written-recognition', () => {
  it('a lemma: the form shown, the glosses accepted, typed or self-graded', async () => {
    const w = makeWorld();
    const e = await ok(w, 'written-recognition', IDS.liber);
    expect(e.family).toBe('written-recognition');
    expect(e.prompt.stimulusText).toBe('Fëmijët lexojnë librin.');
    expect(e.prompt.instruction).toBe('What does “librin” mean in this sentence?');
    expect(e.answerKey.accepted).toEqual(['book']);
    expect(e.answerKey.normalization).toBe('loose');
    expect(e.responseMode).toBe('typed-or-self');
    expect(e.eligibility).toEqual({ eligible: true, status: 'high-confidence', caveats: [] });
    expect(e.validation).toEqual({ ok: true, issues: [] });
    expect(e.builtFrom.facts).toContain(`unit:${IDS.liber}`);
  });

  it('a provisional rule-derived form without a supported inflected meaning is withheld from meaning recognition', async () => {
    const w = makeWorld();
    expect(await refused(w, 'written-recognition', IDS.librin)).toContain('no gloss');
  });

  it('refuses a conflicted form and a unit without a gloss', async () => {
    const w = makeWorld();
    expect(await refused(w, 'written-recognition', IDS.nena)).toBe('analysis conflicted: sources disagree');
    const f = await w.facts(IDS.liber);
    expect(await refused(w, 'written-recognition', IDS.liber, ctxOf(), { ...f, glosses: [], lexiconGlossCount: 0 })).toContain('no gloss');
  });

  it('with a distractor pool it becomes a four-way choice whose wrong options share no word with the answer', async () => {
    const w = makeWorld();
    const pool = await Promise.all(['lemma:sq:shkollë:NOUN', 'lemma:sq:çaj:NOUN', 'lemma:sq:shtëpi:NOUN', 'lemma:sq:lexoj:VERB', IDS.liber].map((id) => w.facts(id)));
    const e = await ok(w, 'written-recognition', IDS.liber, ctxOf({ pool }));
    expect(e.responseMode).toBe('choice');
    expect(e.prompt.options).toHaveLength(4);
    expect(new Set(e.prompt.options).size).toBe(4);
    expect(e.prompt.options).toContain('book');
    expect(e.answerKey.accepted).toEqual(['book']);
    expect(e.prompt.options!.filter((o) => /book/.test(o))).toEqual(['book']);
    // too small a pool keeps it typed
    const small = await ok(w, 'written-recognition', IDS.liber, ctxOf({ pool: pool.slice(0, 2) }));
    expect(small.responseMode).toBe('typed-or-self');
    // the pool never offers the target’s own glosses back
    const own = await ok(w, 'written-recognition', IDS.liber, ctxOf({ pool: [pool[4], pool[4], pool[4]] }));
    expect(own.responseMode).toBe('typed-or-self');
  });

  it('grades its own answers: the gloss, a part of a compound gloss, a wrong word', async () => {
    const w = makeWorld();
    const e = await ok(w, 'written-recognition', 'lemma:sq:shtëpi:NOUN');
    expect(e.answerKey.accepted).toEqual(expect.arrayContaining(['house, home', 'house', 'home']));
    expect(gradeAndRate(e, resp({ typed: 'Home' }), { now: '' })).toMatchObject({ grading: { outcome: 'correct' }, rating: 3 });
    expect(gradeAndRate(e, resp({ typed: 'dog' }), { now: '' })).toMatchObject({ grading: { outcome: 'incorrect' }, rating: 1 });
    expect(gradeAndRate(e, resp({ selfGrade: 'hard' }), { now: '' })).toMatchObject({ grading: { outcome: 'correct' }, rating: 2 });
    // the gloss shown is the word list’s own, so no dictionary attribution is owed ...
    expect(e.answerKey.explanation).not.toContain('Wiktionary');
    // ... but a meaning that comes from the dictionary carries it
    const f = await w.facts('lemma:sq:shtëpi:NOUN');
    expect(f.glossAttribution).toContain('Wiktionary');
    const dictOnly = await ok(w, 'written-recognition', 'lemma:sq:shtëpi:NOUN', ctxOf(), { ...f, lexiconGlossCount: 0 });
    expect(dictOnly.answerKey.explanation).toContain('Wiktionary, via kaikki.org — CC BY-SA 4.0');
    expect(dictOnly.builtFrom.facts).toContain('gloss:dictionary');
  });
});

describe('meaning-to-form', () => {
  it('a lemma: the meaning shown, the lemma accepted', async () => {
    const w = makeWorld();
    const e = await ok(w, 'meaning-to-form', IDS.liber);
    expect(e.prompt.meaning).toBe('book');
    expect(e.prompt.stimulusText).toBeUndefined();
    expect(e.answerKey.accepted).toEqual(['libër']);
    expect(e.responseMode).toBe('typed');
    expect(gradeAndRate(e, resp({ typed: 'liber' }), { now: '' })).toMatchObject({ grading: { outcome: 'partial' }, rating: 1 });
    expect(gradeAndRate(e, resp({ typed: 'libër' }), { now: '' }).rating).toBe(3);
  });

  it('a verified form: the question names the form wanted; the form is accepted', async () => {
    const w = makeWorld();
    const e = await ok(w, 'meaning-to-form', IDS.shkolle);
    expect(e.prompt.instruction).toBe('Type the form of the word meaning “school” that is: indefinite feminine accusative singular.');
    expect(e.answerKey.accepted).toEqual(['shkollë']);
  });

  it('the lemma typed for a form question is partial, not correct', async () => {
    const w = makeWorld();
    const f = await w.facts(IDS.shkolle);
    // a form whose lemma differs from its written form: the same facts with the other surface (keeps the pack’s own data)
    const forged: ReviewFacts = { ...f, unit: { ...f.unit, label: 'shkollën', unitId: f.unit.unitId }, lemma: 'shkollë' };
    const e = await ok(w, 'meaning-to-form', IDS.shkolle, ctxOf(), forged);
    expect(e.answerKey.accepted).toEqual(['shkollën']);
    expect(e.answerKey.partial).toEqual(['shkollë']);
    expect(gradeAndRate(e, resp({ typed: 'shkollë' }), { now: '' })).toMatchObject({ grading: { outcome: 'partial' }, rating: 1 });
    expect(gradeAndRate(e, resp({ typed: 'shkollën' }), { now: '' }).grading.outcome).toBe('correct');
  });

  it('refuses provisional, conflicted and unglossed units', async () => {
    const w = makeWorld();
    expect(await refused(w, 'meaning-to-form', IDS.librin)).toBe('provisional analysis; no authoritative production question');
    expect(await refused(w, 'meaning-to-form', IDS.cajin)).toBe('provisional analysis; no authoritative production question');
    expect(await refused(w, 'meaning-to-form', IDS.nena)).toBe('analysis conflicted: sources disagree');
    const f = await w.facts(IDS.liber);
    expect(await refused(w, 'meaning-to-form', IDS.liber, ctxOf(), { ...f, glosses: [], lexiconGlossCount: 0 })).toContain('no concise gloss');
  });
});

describe('morphological-identification', () => {
  it('librin (provisional, rule-derived): its features are never asked; its lemma may be, and the exception is stated', async () => {
    const w = makeWorld();
    for (const random of [0.01, 0.5, 0.99]) {
      const e = await ok(w, 'morphological-identification', IDS.librin, ctxOf({ random: () => random }));
      expect(e.variant).toBe('lemma');
      expect(e.answerKey.features).toBeUndefined();
      expect(e.askedFeature).toBeUndefined();
      expect(e.answerKey.accepted).toEqual(['libër']);
      expect(e.responseMode).toBe('typed');
      expect(e.prompt.stimulusText).toBe('Fëmijët lexojnë librin.');
      expect(e.builtFrom.facts).toContain(PROVISIONAL_EXCEPTION);
      expect(e.eligibility.eligible && e.eligibility.status).toBe('provisional');
      expect(e.eligibility.eligible && e.eligibility.caveats.join(' ')).toContain('only its lemma is asked');
      // nothing in the text states the unverified features
      expect(e.answerKey.explanation).not.toMatch(/accusative|definite|masculine/);
      expect(e.answerKey.deeper).toBeUndefined();
      expect(e.constructionId).toBeUndefined();
    }
  });

  it('the exception is narrow: not for a form the rules did not produce, nor for a lemma the word list lacks, nor for a conflicted form', async () => {
    const w = makeWorld();
    const f = await w.facts(IDS.librin);
    const reason = 'provisional analysis; no authoritative grammar question';
    expect(await refused(w, 'morphological-identification', IDS.librin, ctxOf(), { ...f, lemmaInWordList: false })).toBe(reason);
    expect(await refused(w, 'morphological-identification', IDS.librin, ctxOf(), { ...f, lemmaInWordList: undefined })).toBe(reason);
    expect(await refused(w, 'morphological-identification', IDS.librin, ctxOf(), { ...f, source: 'hand-lexicon', unit: { ...f.unit, provenance: { ...f.unit.provenance, source: 'hand-lexicon' } } })).toBe(reason);
    expect(await refused(w, 'morphological-identification', IDS.librin, ctxOf(), { ...f, lemma: undefined })).toBe(reason);
    expect(await refused(w, 'morphological-identification', IDS.nena)).toBe('analysis conflicted: sources disagree');
    expect(await refused(w, 'morphological-identification', IDS.librin, ctxOf(), { ...f, exampleSentences: [], exampleReadings: [] })).toContain('no pack sentence');
  });

  it('shkollë (high-confidence): ONE feature as a choice among the pack’s values for that feature', async () => {
    const w = makeWorld();
    const seen = new Set<string>();
    for (const random of [0, 0.2, 0.4, 0.6, 0.8, 0.999]) {
      const e = await ok(w, 'morphological-identification', IDS.shkolle, ctxOf({ random: () => random }));
      expect(e.variant).toBe('feature');
      expect(e.responseMode).toBe('choice');
      const key = e.askedFeature!;
      seen.add(key);
      const def = w.manifest.grammar.features.find((x) => x.key === key)!;
      const expected = { Case: 'Acc', Definite: 'Ind', Gender: 'Fem', Number: 'Sing' }[key as 'Case']!;
      expect(e.answerKey.features).toEqual({ [key]: expected });
      expect(e.answerKey.accepted).toEqual([def.values[expected]]);
      expect(e.prompt.options).toContain(def.values[expected]);
      for (const o of e.prompt.options!) expect(Object.values(def.values)).toContain(o);
      expect(e.prompt.stimulusText).toBe('Ana shkon në shkollë.');
      expect(e.context).toMatchObject({ sentence: 'Ana shkon në shkollë.', surface: 'shkollë', start: 13, end: 20, source: 'pack-validation' });
      expect(e.answerKey.explanation).toContain(def.explain.slice(0, 40));
      expect(e.constructionId).toBe('morph:sq:NOUN:Case=Acc|Definite=Ind|Gender=Fem|Number=Sing');
      expect(e.builtFrom.facts).not.toContain(PROVISIONAL_EXCEPTION);
    }
    expect(seen.size).toBeGreaterThan(1); // the feature varies with the draw
  });

  it('a union of values is never asked; a form the sentences read differently is refused', async () => {
    const w = makeWorld();
    const f = await w.facts(IDS.shkolle);
    const union: ReviewFacts = { ...f, features: { ...f.features!, Case: 'Nom,Acc' } };
    for (let i = 0; i < 6; i += 1) {
      const e = await build(w, 'morphological-identification', IDS.shkolle, ctxOf({ random: () => i / 6 }), union);
      // the pack sentences read this form as Acc, not "Nom,Acc": the unit and the sentence disagree, so no question is set
      expect('unavailable' in e).toBe(true);
    }
    expect(await refused(w, 'morphological-identification', IDS.shkolle, ctxOf(), union)).toContain('do not read this form the way the unit says');
  });

  it('grades a choice and a typed lemma', async () => {
    const w = makeWorld();
    const e = await ok(w, 'morphological-identification', IDS.shkolle, ctxOf({ random: () => 0 }));
    const right = e.answerKey.accepted[0];
    expect(gradeAndRate(e, resp({ choice: right }), { now: '' })).toMatchObject({ grading: { outcome: 'correct' }, rating: 3 });
    const wrong = e.prompt.options!.find((o) => o !== right)!;
    expect(gradeAndRate(e, resp({ choice: wrong }), { now: '' })).toMatchObject({ grading: { outcome: 'incorrect' }, rating: 1 });
    const l = await ok(w, 'morphological-identification', IDS.cajin);
    expect(gradeAndRate(l, resp({ typed: 'çaj' }), { now: '' }).grading.outcome).toBe('correct');
    expect(gradeAndRate(l, resp({ typed: 'caj' }), { now: '' }).grading.outcome).toBe('partial');
    expect(gradeAndRate(l, resp({ typed: 'çajin' }), { now: '' }).grading.outcome).toBe('incorrect');
  });
});

describe('grammar-application', () => {
  it('libër among libër / librin: a gap, the form that has the named value', async () => {
    const w = makeWorld();
    const e = await ok(w, 'grammar-application', IDS.liber);
    expect(e.prompt.sentenceWithGap).toBe('Ajo ka një _____.');
    expect([...e.prompt.options!].sort()).toEqual(['librin', 'libër']);
    expect(e.answerKey.accepted).toEqual(['libër']);
    expect(e.answerKey.features).toEqual({ Definite: 'Ind' });
    expect(e.prompt.instruction).toContain('definiteness: indefinite');
    expect(e.responseMode).toBe('choice');
    expect(e.context).toMatchObject({ sentence: 'Ajo ka një libër.', surface: 'libër', source: 'pack-tutorial' });
    expect(e.constructionId).toBe('morph:sq:NOUN:Case=Nom,Acc|Definite=Ind|Gender=Masc|Number=Sing');
    expect(e.answerKey.explanation).toContain('Albanian adds “the” to the end of the noun');
    expect(gradeAndRate(e, resp({ choice: 'libër' }), { now: '' }).rating).toBe(3);
    expect(gradeAndRate(e, resp({ choice: 'librin' }), { now: '' }).rating).toBe(1);
  });

  it('a construction target is built from a realising form and the other forms of its lemma', async () => {
    const w = makeWorld();
    const e = await ok(w, 'grammar-application', IDS.constructionInd);
    // libër and çaj both realise this construction in the pack sentences; whichever is drawn, the answer is the form in the gap
    expect(['libër', 'çaj']).toContain(e.answerKey.accepted[0]);
    expect(e.answerKey.accepted[0]).toBe(e.context!.surface);
    expect(e.constructionId).toBe(IDS.constructionInd);
    expect(e.prompt.options).toHaveLength(2);
  });

  it('requires two forms and a trusted reading: shkollë has one form, librin and its construction are provisional', async () => {
    const w = makeWorld();
    expect(await refused(w, 'grammar-application', IDS.shkolle)).toContain('fewer than two forms');
    expect(await refused(w, 'grammar-application', IDS.shkolleLemma)).toContain('fewer than two forms');
    expect(await refused(w, 'grammar-application', IDS.librin)).toBe('provisional analysis; no authoritative grammar question');
    expect(await refused(w, 'grammar-application', IDS.construction)).toBe('provisional analysis; no authoritative grammar question');
    expect(await refused(w, 'grammar-application', IDS.nena)).toBe('analysis conflicted: sources disagree');
  });

  it('never offers a distractor that is not a form of the lemma shown in the pack, or one that shares the answer’s value', async () => {
    const w = makeWorld();
    const f = await w.facts(IDS.liber);
    const forged: ReviewFacts = {
      ...f,
      formGroups: [{ lemma: 'libër', pos: 'NOUN', forms: [
        { surface: 'libër', features: { Definite: 'Ind', Number: 'Sing' }, status: 'high-confidence' },
        { surface: 'libri', features: { Definite: 'Ind', Number: 'Sing' }, status: 'provisional' }, // same value: not distinguishable
      ] }],
    };
    expect(await refused(w, 'grammar-application', IDS.liber, ctxOf(), forged)).toContain('no other form');
  });
});

describe('phrase-comprehension', () => {
  it('a phrase in its sentence → its meaning, the gloss parts accepted', async () => {
    const w = makeWorld();
    const e = await ok(w, 'phrase-comprehension', IDS.phrase);
    expect(e.prompt.stimulusText).toBe('Unë quhem Sam.');
    expect(e.prompt.instruction).toBe('What does “quhem Sam” mean in this sentence?');
    expect(e.answerKey.accepted).toEqual(['to be called …; my name is …', 'to be called …', 'my name is …']);
    expect(e.context).toMatchObject({ surface: 'quhem Sam', start: 4, end: 13, source: 'pack-validation' });
    expect(gradeAndRate(e, resp({ typed: 'my name is' }), { now: '' }).grading.outcome).toBe('correct');
    expect(gradeAndRate(e, resp({ typed: 'To be called' }), { now: '' }).grading.outcome).toBe('correct');
    expect(gradeAndRate(e, resp({ typed: 'dog' }), { now: '' }).grading.outcome).toBe('incorrect');
  });

  it('requires the phrase facts and a sentence', async () => {
    const w = makeWorld();
    const f = await w.facts(IDS.phrase);
    expect(await refused(w, 'phrase-comprehension', IDS.phrase, ctxOf(), { ...f, phrase: undefined })).toContain('no phrase facts');
    expect(await refused(w, 'phrase-comprehension', IDS.phrase, ctxOf(), { ...f, phrase: { display: 'quhem …' } })).toContain('no phrase facts');
    expect(await refused(w, 'phrase-comprehension', IDS.phrase, ctxOf(), { ...f, exampleSentences: [], exampleReadings: [] })).toContain('no pack sentence');
    expect(await refused(w, 'phrase-comprehension', IDS.liber)).toContain('multiword');
  });
});

describe('sentence-completion', () => {
  it('the target word removed from a pack sentence, the meaning as the cue, the exact form accepted', async () => {
    const w = makeWorld();
    const e = await ok(w, 'sentence-completion', IDS.shkolle);
    expect(e.prompt.sentenceWithGap).toBe('Ana shkon në _____.');
    expect(e.prompt.meaning).toBe('school');
    expect(e.answerKey.accepted).toEqual(['shkollë']);
    expect(e.prompt.sentenceWithGap).not.toContain('shkollë');
    expect(e.context).toMatchObject({ surface: 'shkollë', source: 'pack-validation' });
    expect(gradeAndRate(e, resp({ typed: 'shkollë' }), { now: '' }).rating).toBe(3);
    expect(gradeAndRate(e, resp({ typed: 'shkolle' }), { now: '' })).toMatchObject({ grading: { outcome: 'partial' }, rating: 1 });
    const l = await ok(w, 'sentence-completion', IDS.liber);
    expect(l.prompt.sentenceWithGap).toBe('Ajo ka një _____.'); // the provisional occurrence "librin" is never the gap
  });

  it('refuses a provisional form, a conflicted form, a unit without a sentence and a sentence that leaks the answer', async () => {
    const w = makeWorld();
    expect(await refused(w, 'sentence-completion', IDS.librin)).toBe('provisional analysis; no authoritative production question');
    expect(await refused(w, 'sentence-completion', IDS.nena)).toBe('analysis conflicted: sources disagree');
    const f = await w.facts(IDS.shkolle);
    expect(await refused(w, 'sentence-completion', IDS.shkolle, ctxOf(), { ...f, exampleSentences: [], exampleReadings: [] })).toContain('no pack sentence');
    const text = 'Ana shkon në shkollë e shkollë.';
    const leaky: ReviewFacts = {
      ...f,
      exampleSentences: [{ text, source: 'pack-validation', surface: 'shkollë', start: 13, end: 20 }],
      exampleReadings: [f.exampleReadings![0]],
    };
    expect(await refused(w, 'sentence-completion', IDS.shkolle, ctxOf(), leaky)).toContain('still contains the answer');
  });

  it('a form whose written shape is not the lemma also asks for its description and accepts a same-feature form', async () => {
    const w = makeWorld();
    const f = await w.facts(IDS.shkolle);
    const forged: ReviewFacts = {
      ...f, siblingForms: [{ surface: 'shkollet', features: f.features! }],
    };
    const e = await ok(w, 'sentence-completion', IDS.shkolle, ctxOf(), forged);
    expect(e.answerKey.accepted).toEqual(['shkollë', 'shkollet']);
  });
});

describe('every family, every unit', () => {
  const UNITS = [IDS.liber, IDS.librin, IDS.shkolle, IDS.shkolleLemma, IDS.construction, IDS.constructionInd, IDS.phrase, IDS.nena, IDS.cajin, 'lemma:sq:shtëpi:NOUN', 'lemma:sq:lexoj:VERB'];

  it('canBuild agrees with build; every exercise built validates; ineligible targets are always refused', async () => {
    const w = makeWorld();
    let built = 0;
    for (const id of UNITS) {
      const f = await w.facts(id);
      for (const family of EXERCISE_FAMILIES) {
        const t = target(id, FAMILY_DIMENSION[family]);
        for (const audio of [undefined, fakeAudio('recorded')]) {
          const ctx = ctxOf({ audio });
          const can = BUILDERS[family].canBuild(t, f, ctx);
          const r = await BUILDERS[family].build(t, f, ctx);
          const isAudio = family.startsWith('audio-');
          if (isAudio && !audio) { expect(can, `${id} ${family}`).toBe(false); expect('unavailable' in r).toBe(true); continue; }
          expect(can, `${id} ${family}`).toBe(!('unavailable' in r));
          if (!('unavailable' in r)) {
            built += 1;
            expect(validateExercise(r), `${id} ${family}`).toEqual({ ok: true, issues: [] });
            expect(r.validation).toEqual({ ok: true, issues: [] });
            expect(r.target.unitId).toBe(id);
            expect(r.prompt.instruction.length).toBeGreaterThan(0);
            expect(r.answerKey.accepted.length).toBeGreaterThan(0);
            expect(r.eligibility.eligible).toBe(true);
            // the stimulus never gives the answer away
            if (r.prompt.sentenceWithGap) expect(r.prompt.sentenceWithGap.split('_____')).toHaveLength(2);
          } else {
            expect(r.reason.length).toBeGreaterThan(5);
          }
        }
      }
    }
    expect(built).toBeGreaterThan(25);
  });

  it('a target for the wrong unit, language or dimension is refused', async () => {
    const w = makeWorld();
    const f = await w.facts(IDS.liber);
    const b = BUILDERS['written-recognition'];
    expect('unavailable' in await b.build({ ...target(IDS.shkolleLemma, 'written-recognition') }, f, ctxOf())).toBe(true);
    expect('unavailable' in await b.build({ ...target(IDS.liber, 'written-recognition'), languageId: 'de' }, f, ctxOf())).toBe(true);
    expect('unavailable' in await b.build(target(IDS.liber, 'productive-recall'), f, ctxOf())).toBe(true);
    expect(b.canBuild(target(IDS.liber, 'productive-recall'), f, ctxOf())).toBe(false);
  });

  it('familiesFor lists the families that can test a target now; buildExercise is the registry front door', async () => {
    const w = makeWorld();
    const f = await w.facts(IDS.liber);
    expect(familiesFor(target(IDS.liber, 'written-recognition'), f, ctxOf())).toEqual(['written-recognition']);
    expect(familiesFor(target(IDS.liber, 'auditory-recognition'), f, ctxOf())).toEqual([]);
    expect(familiesFor(target(IDS.liber, 'auditory-recognition'), f, ctxOf({ audio: fakeAudio() }))).toEqual(['audio-to-meaning']);
    const e = await buildExercise('meaning-to-form', target(IDS.liber, 'meaning-to-target-retrieval'), f, ctxOf());
    expect('unavailable' in e).toBe(false);
  });

  it('no family builds a provisional or conflicted target except recognition families and the stated lemma exception', async () => {
    const w = makeWorld();
    for (const id of [IDS.librin, IDS.cajin, IDS.nena, IDS.construction]) {
      const f = await w.facts(id);
      for (const family of EXERCISE_FAMILIES) {
        const r = await BUILDERS[family].build(target(id, FAMILY_DIMENSION[family]), f, ctxOf({ audio: fakeAudio() })) as Exercise & { unavailable?: true };
        if ('unavailable' in r) continue;
        const e = r as ReviewExercise;
        const recognition = ['written-recognition', 'phrase-comprehension', 'audio-to-meaning', 'audio-transcription'].includes(family);
        const excepted = family === 'morphological-identification' && e.variant === 'lemma' && e.builtFrom.facts.includes(PROVISIONAL_EXCEPTION);
        expect(recognition || excepted, `${id} ${family}`).toBe(true);
        if (f.status === 'conflicted') throw new Error(`${id} ${family} built from a conflicted analysis`);
      }
    }
  });
});
