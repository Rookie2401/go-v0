/**
 * The Albanian sentence layer (package Q5): which reading of e / i / të / së, më, u, ju, do, po, pa is meant; article +
 * adjective as one unit; case after a preposition and after a linking article; verb or not, mood and person; names; the
 * non-active aorist. Every case goes through the real word-form engine: tokenizer → context-free candidates → sentence.
 * The sentences are short and certain; each rule is tested firing and not firing.
 */
import { describe, expect, it } from 'vitest';
import type { AnalysisCandidate, RawToken } from '../../src/core';
import { makeWordTokenizer } from '../../src/adapters/shared';
import { sqNormalize } from '../../src/adapters/albanian/orthography';
import { sqAnalyze, sqCandidates } from '../../src/adapters/albanian/analyze';
import { orderSqSentence } from '../../src/adapters/albanian/sentence';

type C = AnalysisCandidate;
const tokenize = makeWordTokenizer({ locale: 'sq', normalize: sqNormalize });

function run(sentence: string) {
  const tokens: RawToken[] = tokenize(sentence);
  const base = tokens.map((t) => (t.isWord ? sqCandidates(t.normalized) : []));
  const snapshot = structuredClone(base);
  const out = orderSqSentence(tokens, base);
  return { tokens, base, snapshot, out };
}
/** Index of the nth token whose normalized form is `word`. */
function indexOf(tokens: RawToken[], word: string, nth = 0): number {
  const hits = tokens.map((t, i) => (t.normalized === word ? i : -1)).filter((i) => i >= 0);
  expect(hits.length, `"${word}" occurs ${nth + 1} times`).toBeGreaterThan(nth);
  return hits[nth];
}

interface Want {
  lemma?: string;
  pos?: string;
  morph?: Record<string, string>;
  /** true = a context note is present; false = absent; a RegExp must match it. */
  context?: boolean | RegExp;
  unit?: 'article' | 'head' | 'none';
  role?: RegExp;
}

function check(sentence: string, word: string, nth: number, want: Want): void {
  const { tokens, out } = run(sentence);
  const i = indexOf(tokens, word, nth);
  const first = out[i][0];
  expect(first, `${sentence} / ${word}`).toBeDefined();
  if (want.lemma !== undefined) expect(first.lemma).toBe(want.lemma);
  if (want.pos !== undefined) expect(first.pos).toBe(want.pos);
  if (want.morph) expect(first.morph).toMatchObject(want.morph);
  if (want.context === true) expect(typeof first.notes?.context).toBe('string');
  if (want.context === false) expect(first.notes?.context).toBeUndefined();
  if (want.context instanceof RegExp) expect(String(first.notes?.context)).toMatch(want.context);
  if (want.unit === 'none') expect(first.unit).toBeUndefined();
  if (want.unit === 'article') expect(first.unit?.role).toBe('linking article');
  if (want.unit === 'head') expect(first.unit?.role).toBe('head');
  if (want.role) expect(String(first.role)).toMatch(want.role);
}

const GENITIVE = /genitive linking article/;

// [sentence, normalized word, which occurrence, what the first reading of that word must be]
const ROWS: Array<[string, string, number, Want]> = [
  // ── 1. article + articulated adjective, ordinal or possessive: one lexical unit ──
  ['Djali i mirë lexon.', 'i', 0, { lemma: 'i mirë', pos: 'ADJ', unit: 'article', morph: { PronType: 'Art', Gender: 'Masc' }, context: true }],
  ['Djali i mirë lexon.', 'mirë', 0, { lemma: 'i mirë', pos: 'ADJ', unit: 'head', morph: { Gender: 'Masc' }, context: true }],
  ['Djali i mirë lexon.', 'djali', 0, { lemma: 'djalë', morph: { Case: 'Nom', Definite: 'Def', Number: 'Sing' }, context: true }],
  ['Vajza e mirë punon.', 'e', 0, { lemma: 'i mirë', pos: 'ADJ', unit: 'article', morph: { Gender: 'Fem', Number: 'Sing', PronType: 'Art' } }],
  ['Vajza e mirë punon.', 'mirë', 0, { unit: 'head', morph: { Gender: 'Fem' } }],
  ['Vajza e mirë punon.', 'vajza', 0, { lemma: 'vajzë', morph: { Number: 'Sing', Definite: 'Def', Case: 'Nom' }, context: true }],
  ['Libri i djalit është i ri.', 'i', 1, { lemma: 'i ri', pos: 'ADJ', unit: 'article' }],
  ['Libri i djalit është i ri.', 'ri', 0, { lemma: 'i ri', pos: 'ADJ', unit: 'head' }],
  ['Vajzat janë të mira.', 'të', 0, { lemma: 'i mirë', pos: 'ADJ', unit: 'article' }],
  ['Vajzat janë të mira.', 'mira', 0, { lemma: 'i mirë', pos: 'ADJ', unit: 'head', morph: { Gender: 'Fem', Number: 'Plur' } }],
  ['Shtëpia e Anës është e madhe.', 'e', 1, { lemma: 'i madh', pos: 'ADJ', unit: 'article' }],
  ['Shtëpia e Anës është e madhe.', 'madhe', 0, { lemma: 'i madh', unit: 'head', morph: { Gender: 'Fem', Number: 'Sing' } }],
  ['Libri im i mirë është këtu.', 'i', 0, { lemma: 'i mirë', pos: 'ADJ', unit: 'article' }],
  ['Libri im i mirë është këtu.', 'libri', 0, { morph: { Case: 'Nom', Definite: 'Def' }, context: true }],
  ['Libri i tij është këtu.', 'tij', 0, { lemma: 'i tij', pos: 'DET', unit: 'head', morph: { Poss: 'Yes' } }],
  ['Libri i tij është këtu.', 'i', 0, { lemma: 'i tij', pos: 'DET', unit: 'article' }],
  ['Vajza e parë.', 'parë', 0, { lemma: 'i parë', unit: 'head' }],
  ['Djemtë e mirë punojnë.', 'mirë', 0, { unit: 'head', morph: { Gender: 'Masc', Number: 'Plur' } }],
  ['Ai është më i mirë.', 'i', 0, { lemma: 'i mirë', unit: 'article' }],
  ['Ai është më i mirë.', 'më', 0, { lemma: 'më', pos: 'ADV', context: /more/ }],
  // ── 1. the linking article of a genitive: its own word, the noun after it narrows to the genitive ──
  ['Libri i djalit është i ri.', 'i', 0, { lemma: 'i', pos: 'DET', unit: 'none', role: GENITIVE, context: true }],
  ['Libri i djalit është i ri.', 'djalit', 0, { morph: { Case: 'Gen' }, context: /genitive/ }],
  ['Shtëpia e Anës është e madhe.', 'e', 0, { lemma: 'i', pos: 'DET', unit: 'none', role: GENITIVE }],
  ['Shtëpia e Anës është e madhe.', 'anës', 0, { lemma: 'Ana', morph: { Case: 'Gen' } }],
  ['Librat e nxënësve janë këtu.', 'e', 0, { lemma: 'i', pos: 'DET', unit: 'none', role: GENITIVE }],
  ['Librat e nxënësve janë këtu.', 'nxënësve', 0, { morph: { Case: 'Gen', Number: 'Plur' } }],
  ['Libri i kitarës.', 'kitarës', 0, { lemma: 'kitarë', morph: { Case: 'Gen' }, context: true }],
  // ── 1. where the sentence does not decide: nothing changes ──
  ['Libri, i djalit.', 'i', 0, { pos: 'PRON', context: false }],
  ['Libri, i djalit.', 'djalit', 0, { morph: { Case: 'Gen,Dat,Abl' }, context: false }],
  ['Libri. I djalit.', 'i', 0, { pos: 'PRON', context: false }],
  ['Libri e lapsi.', 'e', 0, { pos: 'PRON', context: false }],
  ['Ai punon, e lexon.', 'e', 0, { pos: 'PRON', context: false }],
  ['Të shoh.', 'të', 0, { pos: 'PART', context: false }],
  ['Mira është këtu.', 'mira', 0, { lemma: 'Mira', pos: 'PROPN', context: false }],
  // ── 1. e / i before a conjugated verb: the object pronoun ──
  ['Unë e shoh djalin.', 'e', 0, { lemma: 'ai', pos: 'PRON', morph: { Clitic: 'Yes', Case: 'Acc' }, context: true }],
  ['Ai i dha librin djalit.', 'i', 0, { pos: 'PRON', morph: { Clitic: 'Yes' }, context: true }],
  ['Nuk e di.', 'e', 0, { pos: 'PRON', morph: { Clitic: 'Yes' } }],
  ['E di.', 'e', 0, { pos: 'PRON', morph: { Clitic: 'Yes' }, context: true }],
  ['Ai ma dha librin.', 'ai', 0, { pos: 'PRON', morph: { Case: 'Nom', Person: '3' }, context: true }],
  // ── 1. e = "and" ──
  ['Ai punon e lexon.', 'e', 0, { lemma: 'e', pos: 'CONJ', context: true }],
  ['Ana e Beni.', 'e', 0, { pos: 'CONJ', context: true }],
  ['Ana punon, e Beni lexon.', 'e', 0, { pos: 'CONJ', context: true }],
  ['Ai ka libra e lapsa.', 'e', 0, { pos: 'CONJ', context: true }],
  // ── 1. të: the subjunctive particle or the pronoun ──
  ['Dua të shkoj në shtëpi.', 'të', 0, { lemma: 'të', pos: 'PART', context: true }],
  ['Ata të shohin.', 'të', 0, { lemma: 'ti', pos: 'PRON', morph: { Clitic: 'Yes' }, context: true }],
  ['Ata të shohin.', 'ata', 0, { pos: 'PRON', morph: { Case: 'Nom', Person: '3', Number: 'Plur' } }],
  ['Do të vij nesër.', 'do', 0, { lemma: 'do', pos: 'PART', context: true }],
  ['Do të vij nesër.', 'të', 0, { pos: 'PART', context: /do/ }],
  ['Dua të më shohë.', 'të', 0, { pos: 'PART' }],
  ['Dua të më shohë.', 'më', 0, { pos: 'PRON', morph: { Clitic: 'Yes' } }],
  ['Dua ta shoh.', 'ta', 0, { lemma: 'të', pos: 'PART' }],
  ['Ai ta dha.', 'ta', 0, { pos: 'PRON', morph: { Clitic: 'Yes' } }],
  ["Dua t'i jap librin.", "t'i", 0, { lemma: 'të', pos: 'PART' }],
  ['Nuk të shoh.', 'të', 0, { pos: 'PRON', morph: { Clitic: 'Yes' } }],
  ['Për të shkuar.', 'të', 0, { pos: 'PART', context: /për/ }],
  ['Të pashë.', 'të', 0, { pos: 'PRON', morph: { Clitic: 'Yes' } }],
  ['Ai më tha të vij.', 'të', 0, { pos: 'PART' }],
  // ── 2. verb or not, and the mood the particle asks for ──
  ['Dua të shkoj në shtëpi.', 'shkoj', 0, { lemma: 'shkoj', morph: { Mood: 'Sub' }, context: /subjunctive/ }],
  ['Do të vij nesër.', 'vij', 0, { morph: { Mood: 'Sub' } }],
  ['Dua ta shoh.', 'shoh', 0, { morph: { Mood: 'Sub' } }],
  ['Dua të mos shkoj.', 'shkoj', 0, { morph: { Mood: 'Sub' } }],
  ['Nuk e di.', 'di', 0, { lemma: 'di', morph: { Mood: 'Ind' }, context: /indicative/ }],
  ['Nuk të shoh.', 'shoh', 0, { morph: { Mood: 'Ind' } }],
  ['Unë nuk shoh.', 'shoh', 0, { morph: { Mood: 'Ind', Person: '1' } }],
  ['Mos shqyrtoni.', 'shqyrtoni', 0, { lemma: 'shqyrtoj', morph: { Mood: 'Sub' }, context: /mos/ }],
  ['Ju nuk shqyrtoni.', 'shqyrtoni', 0, { morph: { Mood: 'Ind' } }],
  ['Ai do një libër.', 'do', 0, { lemma: 'dua', pos: 'VERB', morph: { Person: '3' }, context: true }],
  ['Po, vij.', 'po', 0, { pos: 'INTJ', context: true }],
  ['Po.', 'po', 0, { pos: 'INTJ' }],
  ['Ai po punon.', 'po', 0, { pos: 'PART', lemma: 'po' }],
  ['Ai pa djalin.', 'pa', 0, { lemma: 'shoh', pos: 'VERB', morph: { Tense: 'Past', Person: '3' } }],
  ['Ai e pa.', 'pa', 0, { lemma: 'shoh', pos: 'VERB' }],
  ['Ai pa shkuar.', 'pa', 0, { pos: 'PART' }],
  ['Pa bukë nuk jetohet.', 'pa', 0, { pos: 'ADP' }],
  ['Djali është pa libër.', 'pa', 0, { pos: 'ADP' }],
  ['Ai është afër.', 'afër', 0, { pos: 'ADV', context: true }],
  ['Ai ka më shumë libra.', 'më', 0, { pos: 'ADV' }],
  ['Më shihni.', 'më', 0, { pos: 'PRON', morph: { Clitic: 'Yes' } }],
  ['Më 5 maj.', 'më', 0, { pos: 'ADP' }],
  // ── 2. u ──
  ['Unë u dhashë librat.', 'u', 0, { pos: 'PRON', morph: { Clitic: 'Yes' } }],
  ['Unë u pashë.', 'u', 0, { lemma: 'u', pos: 'PART' }],
  // ── 4. the subject pronoun: person and number ──
  ['Ti punon.', 'punon', 0, { morph: { Person: '2' }, context: /second person/ }],
  ['Ai po punon.', 'punon', 0, { morph: { Person: '3' } }],
  ['Ju shihni librin.', 'ju', 0, { pos: 'PRON', morph: { Case: 'Nom', Person: '2', Number: 'Plur' } }],
  ['Ne ju shohim.', 'ju', 0, { pos: 'PRON', morph: { Clitic: 'Yes' } }],
  // ── 3. case after a preposition ──
  ['Dua të shkoj në shtëpi.', 'shtëpi', 0, { lemma: 'shtëpi', morph: { Case: 'Acc' }, context: /accusative/ }],
  ['Ai punon në një qytet.', 'qytet', 0, { morph: { Case: 'Acc' } }],
  ['Ajo vjen nga shtëpi.', 'shtëpi', 0, { morph: { Case: 'Nom', Number: 'Sing' }, context: /nominative/ }],
  ['Ai vjen prej shtëpisë.', 'shtëpisë', 0, { morph: { Case: 'Abl' }, context: /ablative/ }],
  ['Ai është pranë shtëpisë.', 'pranë', 0, { pos: 'ADP' }],
  ['Ai është pranë shtëpisë.', 'shtëpisë', 0, { morph: { Case: 'Abl' } }],
  ['Pas shkollës shkoj në shtëpi.', 'shkollës', 0, { morph: { Case: 'Abl' } }],
  ['Pa bukë nuk jetohet.', 'bukë', 0, { morph: { Case: 'Acc' } }],
  ['Djali është pa libër.', 'libër', 0, { morph: { Case: 'Acc' } }],
  ['Ai vjen me ju.', 'ju', 0, { pos: 'PRON', morph: { Case: 'Acc' } }],
  ['Nga sorollit.', 'sorollit', 0, { lemma: 'soroll', morph: { Case: 'Nom', Number: 'Plur' } }],
  // ── 5. names ──
  ['Ajo është Mira.', 'mira', 0, { lemma: 'Mira', pos: 'PROPN', context: /capital/ }],
  ['Ajo ka mira.', 'mira', 0, { lemma: 'i mirë', pos: 'ADJ', context: /small letter/ }],
  ['MIRA ËSHTË KËTU', 'mira', 0, { pos: 'PROPN', context: false }],
  // ── 6. the non-active aorist ──
  ['U lava.', 'u', 0, { lemma: 'u', pos: 'PART' }],
  ['U lava.', 'lava', 0, { lemma: 'laj', morph: { Tense: 'Past', Voice: 'Act' }, context: /non-active/ }],
  ['Unë u pashë.', 'pashë', 0, { morph: { Voice: 'Act' }, context: /non-active/ }],
];

describe('the Albanian sentence layer: first reading of the word in question', () => {
  it.each(ROWS.map((r) => [`${r[0]}  [${r[1]}${r[2] ? ` #${r[2] + 1}` : ''}]`, r] as const))('%s', (_name, [sentence, word, nth, want]) => {
    check(sentence, word, nth, want);
  });
});

const SENTENCES = [...new Set(ROWS.map((r) => r[0]))];

describe('coverage of the cases', () => {
  it('has at least 60 distinct sentences, each with a certain expectation', () => {
    expect(SENTENCES.length).toBeGreaterThanOrEqual(60);
  });
});

// ───────────────────────────── the units, in detail ─────────────────────────────

describe('article + adjective as one lexical unit', () => {
  it('sets the unit on the first candidate of both tokens, pieces in text order', () => {
    const { tokens, out } = run('Djali i mirë lexon.');
    const a = indexOf(tokens, 'i');
    const j = indexOf(tokens, 'mirë');
    expect(j).toBe(a + 1);
    for (const k of [a, j]) {
      expect(out[k][0].unit).toMatchObject({ head: j, pieces: [a, j], display: 'i mirë' });
      expect(out[k][0].lemma).toBe('i mirë');
      expect(out[k][0].pos).toBe('ADJ');
    }
    expect(out[a][0].unit?.role).toBe('linking article');
    expect(out[j][0].unit?.role).toBe('head');
    // only the first candidate carries the unit
    for (const k of [a, j]) expect(out[k].slice(1).every((c) => c.unit === undefined)).toBe(true);
  });
  it('the article piece keeps its morphology (PronType Art) and its role text', () => {
    const { tokens, out } = run('Djali i mirë lexon.');
    const piece = out[indexOf(tokens, 'i')][0];
    expect(piece.morph.PronType).toBe('Art');
    expect(String(piece.role)).toMatch(/linking article/);
  });
  it('"më i mirë": the unit is the two words, "më" stands outside it', () => {
    const { tokens, out } = run('Ai është më i mirë.');
    const a = indexOf(tokens, 'i');
    expect(out[a][0].unit?.pieces).toEqual([a, a + 1]);
    expect(out[indexOf(tokens, 'më')][0].unit).toBeUndefined();
  });
  it('a possessive unit keeps the part of speech of the possessive', () => {
    const { out, tokens } = run('Libri i tij është këtu.');
    expect(out[indexOf(tokens, 'tij')][0].pos).toBe('DET');
    expect(out[indexOf(tokens, 'i')][0].pos).toBe('DET');
  });
  it('two units in one sentence', () => {
    const { out, tokens } = run('Libri i vjetër është i mirë.');
    const units = out.filter((l) => l[0]?.unit?.role === 'head').map((l) => l[0].lemma);
    expect(units).toEqual(['i vjetër', 'i mirë']);
    expect(out[indexOf(tokens, 'i', 0)][0].unit?.pieces).toEqual([1, 2]);
  });
  it('article and adjective must be adjacent: a comma between them forms no unit', () => {
    const { out, tokens } = run('Djali i, mirë lexon.');
    expect(out[indexOf(tokens, 'i')][0].unit).toBeUndefined();
    expect(out[indexOf(tokens, 'mirë')][0].unit).toBeUndefined();
  });
  it('the readings of the adjective that disagree with the article are marked down (0.4 at most), not removed', () => {
    const { out, tokens } = run('Vajza e mirë punon.');
    const list = out[indexOf(tokens, 'mirë')];
    expect(list.length).toBe(3);
    expect(list.slice(1).every((c) => c.confidence <= 0.4)).toBe(true);
    expect(list.some((c) => c.pos === 'ADV')).toBe(true);
  });
  it('the head noun narrows to the one reading that agrees with the article', () => {
    const { out, tokens } = run('Vajza e mirë punon.');
    const list = out[indexOf(tokens, 'vajza')];
    expect(list[0].morph).toMatchObject({ Number: 'Sing', Definite: 'Def' });
    expect(list[1].morph.Number).toBe('Plur');
    expect(list[1].confidence).toBeLessThanOrEqual(0.4);
  });
});

// ───────────────────────────── the invariants ─────────────────────────────

const keyOf = (c: C): string => `${c.lemma}|${c.pos}`;
const multiset = (list: C[]): string[] => list.map(keyOf).sort();

describe('invariants over every sentence above', () => {
  it.each(SENTENCES)('%s', (sentence) => {
    const { tokens, base, snapshot, out } = run(sentence);
    // base is never written to
    expect(base).toEqual(snapshot);
    expect(out).toHaveLength(tokens.length);
    tokens.forEach((t, i) => {
      if (!t.isWord) { expect(out[i]).toEqual([]); return; }
      const rebuilt = out[i][0]?.unit?.role === 'linking article';
      if (rebuilt) {
        // the one exception: the article reading is rebuilt with the unit's lemma and part of speech
        const expected = multiset(base[i].filter((c) => !(c.pos === 'DET' && c.morph.PronType === 'Art')));
        const got = multiset(out[i].slice(1));
        expect(got).toEqual(expected);
        expect(out[i][0].morph.PronType).toBe('Art');
      } else {
        // no reading lost or gained
        expect(multiset(out[i])).toEqual(multiset(base[i]));
      }
      // a reading's own confidence is never raised
      for (const c of out[i]) {
        const sameKind = base[i].filter((b) => keyOf(b) === keyOf(c) || (rebuilt && b.pos === 'DET' && b.morph.PronType === 'Art'));
        if (sameKind.length === 0) continue;
        expect(c.confidence, `${t.surface}: ${keyOf(c)}`).toBeLessThanOrEqual(Math.max(...sameKind.map((b) => b.confidence)));
      }
      // a lone reading with no union and no unit is left as the engine gave it — except the one note the brief asks for:
      // "u" before an aorist that has only its active reading says the meaning is non-active (the reading itself is not rewritten)
      if (base[i].length === 1 && !Object.values(base[i][0].morph).some((v) => v.includes(',')) && out[i][0].unit === undefined) {
        const nonActiveNote = /^after "u" the meaning is non-active/.test(String(out[i][0].notes?.context));
        if (nonActiveNote) {
          expect({ ...out[i][0], notes: { ...out[i][0].notes, context: undefined } }).toEqual({ ...base[i][0], notes: { ...base[i][0].notes, context: undefined } });
        } else {
          expect(out[i]).toEqual(base[i]);
        }
      }
      // a context note is plain words
      for (const c of out[i]) if (c.notes?.context !== undefined) expect(typeof c.notes.context).toBe('string');
      // a unit lives on the first candidate only
      expect(out[i].slice(1).every((c) => c.unit === undefined)).toBe(true);
    });
  });
});

describe('what the sentence does not decide stays as it was', () => {
  it('a sentence of unknown words comes back unchanged', () => {
    const { tokens, base, out } = run('Xyzon qwk zzvb brtx.');
    expect(out).toEqual(base);
    tokens.forEach((_, i) => expect(out[i]).toBe(base[i]));
  });
  it('a sentence with nothing to decide returns the very same arrays', () => {
    const { tokens, base, out } = run('Unë shoh.');
    tokens.forEach((_, i) => expect(out[i]).toBe(base[i]));
  });
  it('words that are not near a rule are not touched, even in a sentence where rules fire', () => {
    const { tokens, base, out } = run('Djali i mirë lexon.');
    expect(out[indexOf(tokens, 'lexon')]).toBe(base[indexOf(tokens, 'lexon')]);
  });
  it('punctuation between two words breaks the relation (comma, full stop, dash)', () => {
    for (const s of ['Libri, i djalit.', 'Libri. I djalit.', 'Libri — i djalit.']) {
      const { tokens, base, out } = run(s);
      const i = indexOf(tokens, 'i');
      expect(out[i], s).toBe(base[i]);
      expect(out[indexOf(tokens, 'djalit')], s).toBe(base[indexOf(tokens, 'djalit')]);
    }
  });
  it('a guessed word is still ordered by the sentence, with the note, and keeps its confidence and its unconfirmed flag', () => {
    const { tokens, base, out } = run('Libri i kitarës.');
    const i = indexOf(tokens, 'kitarës');
    expect(out[i][0].unconfirmed).toBe(true);
    expect(out[i][0].confidence).toBe(base[i][0].confidence);
    expect(out[i][0].morph.Case).toBe('Gen');
    expect(typeof out[i][0].notes?.context).toBe('string');
    const g = run('Ju nuk shqyrtoni.');
    const v = g.out[indexOf(g.tokens, 'shqyrtoni')];
    expect(v[0].unconfirmed).toBe(true);
    expect(v[0].morph.Mood).toBe('Ind');
    expect(v[0].confidence).toBeLessThanOrEqual(0.4);
    expect(v[1].morph.Mood).toBe('Imp');
    expect(v[1].confidence).toBeLessThanOrEqual(0.4);
  });
  it('a verb that does not agree with the pronoun before it is left alone (no false person)', () => {
    const { tokens, base, out } = run('Ai punojmë.');
    expect(out[indexOf(tokens, 'punojmë')]).toBe(base[indexOf(tokens, 'punojmë')]);
    expect(out[indexOf(tokens, 'ai')][0].notes?.context).toBeUndefined();
  });
  it('"dhe" between two pronouns stays the conjunction: a subject before a word does not turn it into a verb', () => {
    const { tokens, out } = run('Ti dhe unë punojmë.');
    expect(out[indexOf(tokens, 'dhe')][0].pos).toBe('CONJ');
  });
});

describe('the ruled-out readings stay, marked down', () => {
  it('"Ata të shohin": the particle and the article stay behind the pronoun, 0.4 at most', () => {
    const { tokens, out } = run('Ata të shohin.');
    const list = out[indexOf(tokens, 'të')];
    expect(list.map((c) => c.pos).sort()).toEqual(['DET', 'PART', 'PRON']);
    expect(list.slice(1).every((c) => c.confidence <= 0.4)).toBe(true);
    expect(list[0].confidence).toBeGreaterThan(0.4);
  });
  it('a merely usual choice ("u" before an aorist) marks nothing down', () => {
    const { tokens, base, out } = run('U lava.');
    const i = indexOf(tokens, 'u');
    expect(out[i][1].confidence).toBe(base[i].find((c) => c.pos === 'PRON')!.confidence);
  });
  it('the sentence layer is wired into the adapter pipeline', () => {
    const tokens = tokenize('Vajza e mirë punon.');
    const analyzed = sqAnalyze(tokens);
    expect(analyzed[1].candidates[0].unit?.display).toBe('i mirë');
    expect(analyzed[1].analyzer).toMatch(/adapter-sq/);
  });
});
