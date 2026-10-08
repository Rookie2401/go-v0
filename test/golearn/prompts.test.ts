/** Recall prompts (R3): pure generation from a text's own sentences and the learner's levels. No store, no events. */
import { describe, expect, it } from 'vitest';
import type { PartOfSpeech, Sentence, Token } from '../../src/core';
import { BLANK, decidesNo, generatePrompts, stableHash, suggestedDegree } from '../../src/golearn/prompts';
import type { ClozePrompt, PromptInput, YesNoPrompt } from '../../src/golearn/prompts';

type W = string | [string, PartOfSpeech];

/** Sentences from word lists (every sentence ends with a full stop), tokens with exact offsets, and the POS map. */
function build(textId: string, rows: W[][], kind: PromptInput['kind'] = 'story') {
  const sentences: Sentence[] = [];
  const tokensBySentence = new Map<string, Token[]>();
  const pos = new Map<string, PartOfSpeech>();
  rows.forEach((row, si) => {
    const sid = `${textId}/s${si}`;
    let text = '';
    const tokens: Token[] = [];
    row.forEach((w, i) => {
      const [surface, p] = typeof w === 'string' ? [w, undefined] : w;
      if (i > 0) text += ' ';
      const start = text.length;
      text += surface;
      const normalized = surface.toLowerCase();
      const t: Token = { id: `${sid}/t${i}`, sentenceId: sid, textId, lang: 'es', index: i, surface, start, end: text.length, normalized, formId: `form:es:${normalized}`, isWord: true };
      tokens.push(t);
      if (p) pos.set(t.id, p);
    });
    tokens.push({ id: `${sid}/t${row.length}`, sentenceId: sid, textId, lang: 'es', index: row.length, surface: '.', start: text.length, end: text.length + 1, normalized: '.', formId: 'form:es:.', isWord: false });
    text += '.';
    sentences.push({ id: sid, key: String(si), textId, paragraphId: `${textId}/p0`, lang: 'es', index: si, versionAdded: 1, text } as Sentence);
    tokensBySentence.set(sid, tokens);
  });
  return { sentences, tokensBySentence, pos, kind };
}

const lv = (o: Record<string, string>) => new Map(Object.entries(o).map(([k, v]) => [`form:es:${k}`, v]));

const N = (s: string): W => [s, 'NOUN'];
const V = (s: string): W => [s, 'VERB'];
const A = (s: string): W => [s, 'ADJ'];

/** A small story with plenty of nouns and verbs of the same part of speech. */
const ROWS: W[][] = [
  [['El', 'DET'], N('hombre'), V('compró'), ['una', 'DET'], N('manzana'), A('roja')],
  [['La', 'DET'], N('mujer'), V('cantaba'), ['una', 'DET'], N('canción'), A('antigua')],
  [['Los', 'DET'], N('niños'), V('miraban'), ['el', 'DET'], N('camino'), A('largo')],
  [['Dios', 'PROPN'], V('perdonó'), ['a', 'ADP'], N('Pedro'), ['en', 'ADP'], N('casa')],
];

function input(over: Partial<PromptInput> = {}, rows: W[][] = ROWS, textId = 'text:es:t1'): PromptInput {
  const b = build(textId, rows, over.kind);
  return {
    textId, lang: 'es', kind: b.kind ?? 'story', sentences: b.sentences, tokensBySentence: b.tokensBySentence, pos: b.pos,
    levels: lv({ manzana: 'recognized_with_help', canción: 'recognized', camino: 'recognized_with_help' }),
    understood: new Set<string>(),
    ...over,
  };
}
const clozes = (ps: ReturnType<typeof generatePrompts>) => ps.filter((p): p is ClozePrompt => p.kind === 'cloze');
const yesnos = (ps: ReturnType<typeof generatePrompts>) => ps.filter((p): p is YesNoPrompt => p.kind === 'yesno');

describe('generatePrompts: determinism', () => {
  it('gives the same prompts, in the same order, for the same input; no clock, no randomness', () => {
    const i = input({ understood: new Set(['text:es:t1/s0', 'text:es:t1/s1']), otherSentences: ['El perro duerme.', 'Una casa vieja.'] });
    const a = generatePrompts(i);
    const b = generatePrompts(input({ understood: new Set(['text:es:t1/s0', 'text:es:t1/s1']), otherSentences: ['El perro duerme.', 'Una casa vieja.'] }));
    expect(b).toEqual(a);
    expect(a.length).toBeGreaterThanOrEqual(2);
    expect(a.length).toBeLessThanOrEqual(3);
    expect(stableHash('x')).toBe(stableHash('x'));
  });

  it('puts the clozes first and at most one yes/no last', () => {
    const ps = generatePrompts(input({ understood: new Set(['text:es:t1/s0']) }));
    const kinds = ps.map((p) => p.kind);
    expect(kinds.indexOf('yesno')).toBe(kinds.length - 1);
    expect(kinds.filter((k) => k === 'yesno')).toHaveLength(1);
  });
});

describe('generatePrompts: the weak word', () => {
  it('blanks a known-but-weak content word in its own sentence and tests that sentence', () => {
    const ps = clozes(generatePrompts(input()));
    expect(ps.length).toBeGreaterThan(0);
    for (const p of ps) {
      const s = ROWS_TEXT(p.sentenceId);
      expect(p.before + p.answer + p.after).toBe(s); // the wording is untouched: hiding a word never edits the text
      expect(p.id).toBe(`cloze:${p.tokenId}`);
      expect(p.tokenId.startsWith(p.sentenceId)).toBe(true);
    }
  });

  it('prefers the weakest level (recognized_with_help before recognized) and takes one word per sentence', () => {
    const ps = clozes(generatePrompts(input({ maxCloze: 3 })));
    expect(ps.map((p) => p.answer)).toEqual(expect.arrayContaining(['manzana', 'camino', 'canción']));
    expect(ps.map((p) => p.answer).indexOf('canción')).toBe(2); // 'recognized' after both 'recognized_with_help'
    expect(new Set(ps.map((p) => p.sentenceId)).size).toBe(ps.length);
  });

  it('never asks about unseen, encountered or well-known words', () => {
    const ps = clozes(generatePrompts(input({ levels: lv({ manzana: 'unseen', canción: 'encountered', camino: 'rapid', mujer: 'recalled', hombre: 'automatic' }) })));
    expect(ps).toEqual([]);
  });

  it('never asks about a name or a number, a function word, or a word under four letters', () => {
    const rows: W[][] = [
      [['Pedro', 'PROPN'], V('compró'), N('manzana'), A('roja'), ['tres', 'NUM']],
      [['Dios', 'PROPN'], V('hizo'), N('luz'), A('buena'), N('cielo')],
      [N('niño'), V('miró'), N('camino'), A('largo'), N('sol')],
    ];
    const levels = lv({ pedro: 'recognized_with_help', tres: 'recognized_with_help', dios: 'recognized_with_help', luz: 'recognized_with_help', sol: 'recognized_with_help' });
    expect(clozes(generatePrompts(input({ levels }, rows)))).toEqual([]); // names, a number, and 3-letter words
  });

  it('a four-letter content word qualifies; an untagged capital in mid-sentence is taken for a name', () => {
    const rows: W[][] = [
      ['El', V('hizo'), 'bien', 'Roma', 'ayer'],
      [N('perro'), V('come'), N('pan'), A('fresco'), N('hoy')],
      [N('gato'), V('bebe'), N('leche'), A('fría'), N('ahora')],
    ];
    const ps = clozes(generatePrompts(input({ levels: lv({ hizo: 'recognized', roma: 'recognized', come: 'recognized_with_help' }) }, rows)));
    const answers = ps.map((p) => p.answer);
    expect(answers).toContain('come');
    expect(answers).toContain('hizo'); // four letters is enough
    expect(answers).not.toContain('Roma');
  });

  it('skips a word that occurs twice in its sentence, and a sentence too short to give the blank any context', () => {
    const rows: W[][] = [
      [N('casa'), V('tiene'), N('casa'), A('grande'), N('puerta')], // 'casa' twice: ambiguous blank
      [N('niño'), V('canta')], // two words
    ];
    const ps = clozes(generatePrompts(input({ levels: lv({ casa: 'recognized_with_help', canta: 'recognized_with_help' }) }, rows)));
    expect(ps).toEqual([]);
  });

  it('makes no prompt at all when nothing qualifies (a new learner)', () => {
    expect(generatePrompts(input({ levels: new Map() }))).toEqual([]);
  });
});

describe('generatePrompts: choices and distractors', () => {
  it('offers three distinct choices: the answer and two other content words of the same text with the same part of speech', () => {
    const i = input();
    for (const p of clozes(generatePrompts(i))) {
      expect(p.choices).toHaveLength(3);
      expect(new Set(p.choices.map((c) => c.toLowerCase())).size).toBe(3);
      expect(p.choices).toContain(p.answer);
      const answerPos = i.pos!.get(p.tokenId);
      const sentenceWords = new Set(i.tokensBySentence.get(p.sentenceId)!.map((t) => t.normalized));
      for (const c of p.choices.filter((x) => x !== p.answer)) {
        const owners = [...i.tokensBySentence.values()].flat().filter((t) => t.normalized === c.toLowerCase());
        expect(owners.length).toBeGreaterThan(0); // from the text itself
        expect(owners.some((t) => i.pos!.get(t.id) === answerPos)).toBe(true); // same part of speech
        expect(sentenceWords.has(c.toLowerCase())).toBe(false); // not already in the sentence it fills
      }
    }
  });

  it('never uses a name, a number or a function word as a distractor', () => {
    const rows: W[][] = [
      [N('hombre'), V('compró'), N('manzana'), A('roja'), N('hoy')],
      [['Dios', 'PROPN'], ['Pedro', 'PROPN'], ['tres', 'NUM'], ['el', 'DET'], N('casa'), N('mesa')],
    ];
    const ps = clozes(generatePrompts(input({ levels: lv({ manzana: 'recognized_with_help' }) }, rows)));
    expect(ps).toHaveLength(1);
    expect(ps[0].choices.filter((c) => c !== 'manzana').sort()).toEqual(['casa', 'mesa']);
  });

  it('makes no cloze when the text has fewer than two other words of the same part of speech', () => {
    const rows: W[][] = [
      [N('hombre'), V('compró'), N('manzana'), A('roja'), A('dulce')],
      [V('cantaba'), V('miraban'), A('largo'), A('antiguo'), V('corría')],
    ];
    // the only other noun, 'hombre', is in the same sentence: there is no distractor at all
    const ps = clozes(generatePrompts(input({ levels: lv({ manzana: 'recognized_with_help' }) }, rows)));
    expect(ps).toEqual([]);
  });

  it('keeps the case of the answer on its distractors (a sentence-initial word stays capitalised)', () => {
    const rows: W[][] = [
      [N('Camino'), V('lleva'), ['a', 'ADP'], N('casa'), A('larga')],
      [N('casa'), V('tiene'), N('puerta'), A('verde'), N('techo')],
    ];
    const ps = clozes(generatePrompts(input({ levels: lv({ camino: 'recognized_with_help' }) }, rows)));
    expect(ps).toHaveLength(1);
    for (const c of ps[0].choices) expect(c[0]).toBe(c[0].toUpperCase());
  });

  it('is stable: the choices come in the same order every time', () => {
    const a = clozes(generatePrompts(input())).map((p) => p.choices);
    const b = clozes(generatePrompts(input())).map((p) => p.choices);
    expect(b).toEqual(a);
  });
});

describe('generatePrompts: Scripture', () => {
  const john = (levels = lv({ manzana: 'recognized_with_help', canción: 'recognized', camino: 'recognized_with_help' })) =>
    input({ kind: 'scripture', levels, understood: new Set(['text:es:t1/s0', 'text:es:t1/s1', 'text:es:t1/s2']), otherSentences: ['Una sentencia de otro texto.'] });

  it('asks only clozes, never a yes/no, even when sentences are marked Understood and other sentences are offered', () => {
    const ps = generatePrompts(john());
    expect(yesnos(ps)).toEqual([]);
    expect(clozes(ps).length).toBeGreaterThan(0);
    expect(ps.every((p) => p.kind === 'cloze')).toBe(true);
  });

  it('can ask up to three clozes, and never alters a verse', () => {
    const ps = clozes(generatePrompts(john()));
    expect(ps).toHaveLength(3);
    for (const p of ps) expect(p.before + p.answer + p.after).toBe(ROWS_TEXT(p.sentenceId));
  });

  it('a non-Scripture text with the same input gets a yes/no', () => {
    const i = input({ understood: new Set(['text:es:t1/s0', 'text:es:t1/s1']), otherSentences: ['Una sentencia de otro texto.'] });
    expect(yesnos(generatePrompts(i))).toHaveLength(1);
  });
});

/** A text id whose sentences' hash decides "no" (a statement NOT in the text) or "yes". */
function idFor(wantNo: boolean): string {
  for (let n = 0; n < 200; n++) {
    const id = `text:es:y${n}`;
    if (decidesNo(ROWS.map((_, si) => `${id}/s${si}`)) === wantNo) return id;
  }
  throw new Error('no id found');
}

describe('generatePrompts: yes/no', () => {
  const understood = (id: string) => new Set([`${id}/s0`, `${id}/s1`, `${id}/s2`]);

  it('is skipped when the learner marked nothing Understood', () => {
    const id = idFor(true);
    expect(yesnos(generatePrompts(input({ otherSentences: ['Otra cosa distinta.'] }, ROWS, id)))).toEqual([]);
  });

  it('a "yes" statement is an Understood sentence, verbatim', () => {
    const id = idFor(false);
    const [p] = yesnos(generatePrompts(input({ understood: understood(id) }, ROWS, id)));
    expect(p).toBeDefined();
    expect(p.truth).toBe(true);
    expect(p.origin).toBe('text');
    expect(understood(id).has(p.sentenceId)).toBe(true);
    expect(p.statement).toBe(ROWS_TEXT(p.sentenceId));
  });

  it('a "no" statement is a sentence of another finished text of the language, never one that is in this text', () => {
    const id = idFor(true);
    const own = ROWS_TEXT(`${id}/s1`);
    const [p] = yesnos(generatePrompts(input({ understood: understood(id), otherSentences: [own, 'EL HOMBRE COMPRÓ UNA MANZANA ROJA.', 'El perro duerme en la sala.'] }, ROWS, id)));
    expect(p.truth).toBe(false);
    expect(p.origin).toBe('other-text');
    expect(p.statement).toBe('El perro duerme en la sala.');
    expect(understood(id).has(p.sentenceId)).toBe(true);
  });

  it('with no other text to borrow from, a "no" statement swaps two content words of an Understood sentence', () => {
    const id = idFor(true);
    const [p] = yesnos(generatePrompts(input({ understood: understood(id) }, ROWS, id)));
    expect(p.truth).toBe(false);
    expect(p.origin).toBe('swapped');
    const original = ROWS_TEXT(p.sentenceId);
    expect(p.statement).not.toBe(original);
    expect(p.statement.split(' ').sort()).toEqual(original.split(' ').sort()); // the same words, two of them exchanged
    expect(p.statement.split(' ')[0]).toBe(original.split(' ')[0]); // the first word of a sentence stays put
  });

  it('when a "no" statement cannot be made (no other text, nothing to swap) it falls back to a "yes" statement', () => {
    const id = idFor(true);
    const rows: W[][] = [[N('perro'), V('corre'), ['y', 'CONJ']], [N('gato'), V('duerme'), ['y', 'CONJ']], [N('niño'), V('canta'), ['y', 'CONJ']], [N('sol'), V('sale'), ['y', 'CONJ']]];
    const ids = new Set(rows.map((_, si) => `${id}/s${si}`));
    const [p] = yesnos(generatePrompts({ ...input({ understood: ids }, rows, id), levels: new Map() }));
    // 'perro corre y': first word fixed, only 'corre' and 'y'(not content) remain: no pair, so "yes"
    expect(p.truth).toBe(true);
    expect(p.origin).toBe('text');
  });

  it('nothing qualifies at all: an empty list', () => {
    expect(generatePrompts(input({ levels: new Map(), understood: new Set() }))).toEqual([]);
  });
});

describe('suggestedDegree', () => {
  it('suggests "Some" from two misses and nothing from fewer', () => {
    expect(suggestedDegree(0)).toBeUndefined();
    expect(suggestedDegree(1)).toBeUndefined();
    expect(suggestedDegree(2)).toBe('some');
    expect(suggestedDegree(3)).toBe('some');
  });
});

function ROWS_TEXT(sentenceId: string): string {
  const si = Number(/\/s(\d+)$/.exec(sentenceId)![1]);
  return build('x', ROWS)!.sentences[si].text;
}

// BLANK is what the UI shows in place of the hidden word
describe('BLANK', () => { it('is a run of underscores', () => { expect(BLANK).toMatch(/^_+$/); }); });
