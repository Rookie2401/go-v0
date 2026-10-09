import { describe, expect, it } from 'vitest';
import {
  glossParts, gradeChoice, gradeResponse, gradeSelf, gradeTyped, hasLetter, normalizeAnswer, ratingFor, stripArticle,
} from '../../../packages/goreview/src/grading';
import type { GradingKey } from '../../../packages/goreview/src/grading';
import type { Exercise, GradeOutcome, Grading, Rating, Response } from '../../../packages/goreview/src/types';

const resp = (over: Partial<Response> = {}): Response => ({ hinted: false, assistance: [], ...over });
const grading = (outcome: GradeOutcome, confidence = 1): Grading => ({ outcome, confidence, explanation: 'x' });

const KEY: GradingKey = { accepted: ['libër'], normalization: 'loose', explanation: 'The pack says: libër means book.' };

describe('normalizeAnswer', () => {
  it('NFC, trim, collapse spaces, lower-case, strip surrounding punctuation', () => {
    expect(normalizeAnswer('  LIBËR  ')).toBe('libër');
    expect(normalizeAnswer('libër')).toBe('libër'); // a decomposed ë is the same letter
    expect(normalizeAnswer('  to   be   called ')).toBe('to be called');
    expect(normalizeAnswer('“Libër!”')).toBe('libër');
    expect(normalizeAnswer('...libër?!')).toBe('libër');
    expect(normalizeAnswer('my name is …')).toBe('my name is');
    expect(normalizeAnswer('')).toBe('');
    expect(normalizeAnswer('?!')).toBe('');
  });

  it('keeps an apostrophe inside a word and treats the curly one as the straight one', () => {
    expect(normalizeAnswer("t’i")).toBe("t'i");
    expect(normalizeAnswer("s'jam")).toBe("s'jam");
  });

  it('exact mode keeps ë and ç; loose mode folds them', () => {
    expect(normalizeAnswer('Çaj', 'exact')).toBe('çaj');
    expect(normalizeAnswer('Çaj', 'loose')).toBe('caj');
    expect(normalizeAnswer('libër', 'loose')).toBe('liber');
    expect(normalizeAnswer('né', 'loose')).toBe('né'); // only ë and ç are Albanian letters being folded
  });

  it('helpers: hasLetter, stripArticle, glossParts', () => {
    expect(hasLetter('3')).toBe(false);
    expect(hasLetter('a3')).toBe(true);
    expect(stripArticle('i bukur')).toBe('bukur');
    expect(stripArticle('to read')).toBe('read');
    expect(stripArticle('the')).toBeUndefined();
    expect(stripArticle('book')).toBeUndefined();
    expect(glossParts('house, home')).toEqual(['house, home', 'house', 'home']);
    expect(glossParts('girl; daughter')).toEqual(['girl; daughter', 'girl', 'daughter']);
    expect(glossParts('to take (in use with drogë (“drug(s)”) and medicinë), to carry')).toEqual([
      'to take (in use with drogë (“drug(s)”) and medicinë), to carry', 'to take (in use with drogë (“drug(s)”) and medicinë)', 'to carry',
    ]);
    expect(glossParts('   ')).toEqual([]);
  });
});

describe('gradeTyped', () => {
  it('exact after normalisation is correct, with full confidence and the pack explanation', () => {
    for (const typed of ['libër', 'LIBËR', ' libër. ', '“libër”']) {
      const g = gradeTyped(KEY, resp({ typed }));
      expect(g.outcome, typed).toBe('correct');
      expect(g.confidence).toBe(1);
      expect(g.matched).toBe('libër');
      expect(g.explanation).toContain('The pack says: libër means book.');
    }
  });

  it('accepts any of several accepted answers', () => {
    const key: GradingKey = { accepted: ['house, home', 'house', 'home'], normalization: 'loose', explanation: 'e' };
    expect(gradeTyped(key, resp({ typed: 'Home' })).outcome).toBe('correct');
    expect(gradeTyped(key, resp({ typed: 'house' })).matched).toBe('house');
  });

  it('ë→e and ç→c is only ever a PARTIAL match, never correct', () => {
    const g = gradeTyped(KEY, resp({ typed: 'liber' }));
    expect(g.outcome).toBe('partial');
    expect(g.confidence).toBe(0.7);
    expect(g.matched).toBe('libër');
    expect(g.explanation).toContain('ë and ç are letters of their own');
    expect(gradeTyped({ ...KEY, accepted: ['çaj'] }, resp({ typed: 'caj' })).outcome).toBe('partial');
    expect(gradeTyped({ ...KEY, accepted: ['çaj'] }, resp({ typed: 'Çaj' })).outcome).toBe('correct');
    // a key that is exact never folds
    expect(gradeTyped({ ...KEY, normalization: 'exact' }, resp({ typed: 'liber' })).outcome).toBe('incorrect');
  });

  it('accepts an article-less answer where the key has a leading article (loose keys only)', () => {
    const key: GradingKey = { accepted: ['i bukur'], normalization: 'loose', explanation: 'e' };
    const g = gradeTyped(key, resp({ typed: 'bukur' }));
    expect(g.outcome).toBe('correct');
    expect(g.confidence).toBe(0.9);
    expect(gradeTyped(key, resp({ typed: 'i bukur' })).confidence).toBe(1);
    expect(gradeTyped({ ...key, accepted: ['i vogël'] }, resp({ typed: 'vogel' })).outcome).toBe('partial'); // article-less AND ë-less
    expect(gradeTyped({ ...key, normalization: 'exact' }, resp({ typed: 'bukur' })).outcome).toBe('incorrect');
    const gloss: GradingKey = { accepted: ['to read'], normalization: 'loose', explanation: 'e', articles: ['to', 'a', 'an', 'the'] };
    expect(gradeTyped(gloss, resp({ typed: 'read' })).outcome).toBe('correct');
    // the transcription key switches the rule off: the learner heard the article
    expect(gradeTyped({ ...key, articles: [] }, resp({ typed: 'bukur' })).outcome).toBe('incorrect');
  });

  it('a near miss the key lists (the lemma for a form question) is partial with the key’s own words', () => {
    const key: GradingKey = { accepted: ['shkollën'], normalization: 'loose', explanation: 'e', partial: ['shkollë'], partialExplanation: 'That is the dictionary form; the form was asked.' };
    const g = gradeTyped(key, resp({ typed: 'shkollë' }));
    expect(g.outcome).toBe('partial');
    expect(g.confidence).toBe(0.6);
    expect(g.explanation).toContain('That is the dictionary form; the form was asked.');
    expect(gradeTyped({ ...key, partialExplanation: undefined }, resp({ typed: 'shkollë' })).explanation).toContain('dictionary form');
  });

  it('an answer right for ANOTHER reading is ambiguous, not wrong', () => {
    const key: GradingKey = {
      accepted: ['to drink'], normalization: 'loose', explanation: 'e', openEnded: true,
      alternatives: [{ answer: 'from', sense: 'pi (ADP)' }],
    };
    const g = gradeTyped(key, resp({ typed: 'From' }));
    expect(g.outcome).toBe('ambiguous');
    expect(g.explanation).toContain('pi (ADP)');
    // but a response that is ALSO accepted is simply correct
    expect(gradeTyped({ ...key, accepted: ['to drink', 'from'] }, resp({ typed: 'from' })).outcome).toBe('correct');
  });

  it('wrong answers: confident for a closed question, less so for an open meaning question', () => {
    expect(gradeTyped(KEY, resp({ typed: 'shtëpi' }))).toMatchObject({ outcome: 'incorrect', confidence: 0.95 });
    const open = gradeTyped({ ...KEY, accepted: ['book'], openEnded: true }, resp({ typed: 'volume' }));
    expect(open).toMatchObject({ outcome: 'incorrect', confidence: 0.7 });
    expect(open.explanation).toContain('challenge');
    expect(gradeTyped(KEY, resp({ typed: 'shtëpi' })).explanation).toContain('“libër”');
  });

  it('empty or letterless input cannot be graded', () => {
    for (const typed of [undefined, '', '   ', '???', '42', '…']) {
      const g = gradeTyped(KEY, resp({ typed }));
      expect(g.outcome, String(typed)).toBe('unable-to-grade');
      expect(g.confidence).toBe(0);
    }
    expect(gradeTyped(KEY, 'libër').outcome).toBe('correct'); // the bare string works too
  });
});

describe('gradeChoice', () => {
  const key: GradingKey = { accepted: ['accusative'], normalization: 'exact', explanation: 'Case: accusative.' };
  it('correct, incorrect, empty and not-offered', () => {
    expect(gradeChoice(key, resp({ choice: 'accusative' })).outcome).toBe('correct');
    const wrong = gradeChoice(key, resp({ choice: 'dative' }));
    expect(wrong.outcome).toBe('incorrect');
    expect(wrong.explanation).toContain('“accusative”');
    expect(gradeChoice(key, resp({})).outcome).toBe('unable-to-grade');
    expect(gradeChoice(key, resp({ choice: 'locative' }), ['accusative', 'dative']).outcome).toBe('unable-to-grade');
    expect(gradeChoice(key, resp({ choice: 'dative' }), ['accusative', 'dative']).outcome).toBe('incorrect');
  });
  it('a choice that matches an alternative reading is ambiguous', () => {
    expect(gradeChoice({ ...key, alternatives: [{ answer: 'nominative', sense: 'the other reading' }] }, resp({ choice: 'nominative' })).outcome).toBe('ambiguous');
  });
});

describe('gradeSelf', () => {
  const key = { accepted: ['book'], explanation: 'libër is book.' };
  it('maps the learner’s own judgement to an outcome at confidence 0.6', () => {
    expect(gradeSelf(key, resp({ selfGrade: 'again' }))).toMatchObject({ outcome: 'incorrect', confidence: 0.6 });
    expect(gradeSelf(key, resp({ selfGrade: 'hard' }))).toMatchObject({ outcome: 'partial', confidence: 0.6 });
    expect(gradeSelf(key, resp({ selfGrade: 'good' }))).toMatchObject({ outcome: 'correct', confidence: 0.6 });
    expect(gradeSelf(key, resp({ selfGrade: 'easy' }))).toMatchObject({ outcome: 'correct', confidence: 0.6 });
    expect(gradeSelf(key, resp({ selfGrade: 'good' })).explanation).toContain('libër is book.');
    expect(gradeSelf(key, resp({})).outcome).toBe('unable-to-grade');
  });
});

describe('gradeResponse (by response mode)', () => {
  const base = (over: Partial<Exercise>): Exercise => ({
    exerciseId: 'ex:1', family: 'written-recognition',
    target: { unitId: 'lemma:sq:libër:NOUN', unitKind: 'lexeme', languageId: 'sq', dimension: 'written-recognition' },
    prompt: { instruction: 'What does “libër” mean?', stimulusText: 'libër' },
    answerKey: { accepted: ['book'], normalization: 'loose', explanation: 'e' },
    hiddenBeforeAnswer: [], responseMode: 'typed-or-self', eligibility: { eligible: true, status: 'high-confidence', caveats: [] },
    builtFrom: { facts: [] }, validation: { ok: true, issues: [] }, ...over,
  });
  it('typed-or-self: typing wins; otherwise the self-grade; otherwise nothing', () => {
    const e = base({});
    expect(gradeResponse(e, resp({ typed: 'book' })).outcome).toBe('correct');
    expect(gradeResponse(e, resp({ typed: 'book', selfGrade: 'again' })).outcome).toBe('correct');
    expect(gradeResponse(e, resp({ selfGrade: 'again' })).outcome).toBe('incorrect');
    expect(gradeResponse(e, resp({})).outcome).toBe('unable-to-grade');
  });
  it('choice and typed modes', () => {
    const c = base({ responseMode: 'choice', prompt: { instruction: 'i', options: ['book', 'tea'] }, answerKey: { accepted: ['book'], normalization: 'exact', explanation: 'e' } });
    expect(gradeResponse(c, resp({ choice: 'book' })).outcome).toBe('correct');
    expect(gradeResponse(c, resp({ choice: 'house' })).outcome).toBe('unable-to-grade'); // not an option
    const t = base({ responseMode: 'typed' });
    expect(gradeResponse(t, resp({ typed: 'tea' })).outcome).toBe('incorrect');
    expect(gradeResponse(t, resp({ selfGrade: 'good' })).outcome).toBe('unable-to-grade'); // typed mode ignores self-grades
  });
  it('an invalid exercise and failed audio are invalid questions', () => {
    expect(gradeResponse(base({ validation: { ok: false, issues: ['x'] } }), resp({ typed: 'book' })).outcome).toBe('invalid-question');
    expect(gradeResponse(base({}), resp({ typed: 'book', audioFailed: true })).outcome).toBe('invalid-question');
  });
});

describe('ratingFor', () => {
  const table: Array<[string, Grading, Partial<Response>, Rating | null]> = [
    ['correct, unhinted', grading('correct'), {}, 3],
    ['correct, self-graded easy', grading('correct'), { selfGrade: 'easy' }, 4],
    ['correct, self-graded good', grading('correct'), { selfGrade: 'good' }, 3],
    ['correct, hinted', grading('correct'), { hinted: true }, 2],
    ['correct, hinted, easy', grading('correct'), { hinted: true, selfGrade: 'easy' }, 2],
    ['partial', grading('partial'), {}, 2],
    ['partial, hinted', grading('partial'), { hinted: true }, 2],
    ['incorrect', grading('incorrect'), {}, 1],
    ['incorrect, hinted', grading('incorrect'), { hinted: true }, 1],
    ['ambiguous', grading('ambiguous'), {}, null],
    ['invalid-question', grading('invalid-question'), {}, null],
    ['unable-to-grade', grading('unable-to-grade'), {}, null],
    ['challenged correct', grading('correct'), { challenged: true }, null],
    ['challenged incorrect', grading('incorrect'), { challenged: true }, null],
    ['audio failed', grading('correct'), { audioFailed: true }, null],
    ['audio failed, incorrect', grading('incorrect'), { audioFailed: true }, null],
  ];
  it.each(table)('%s', (_name, g, r, expected) => {
    expect(ratingFor(g, resp(r))).toBe(expected);
  });
});
