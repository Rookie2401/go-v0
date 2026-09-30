import { describe, expect, it } from 'vitest';
import { CHRONOLOGY, CONCEPTS, chronologyChange, conceptsForToken, createSourceFinder, diffSentences, englishConcepts, lexemesFor, meaningChanges, negationChange, tagSection, tenseChange } from '../../src/gotell';
import { LANGUAGES } from '../../src/core';
import type { LanguageCode } from '../../src/core';
import { mergeSources } from '../../src/gotell/sources';
import { applyEdits, parse } from '../../src/gotell/text';
import { FakeGoLearn, buildFixtureText, makeFakeAdapter } from './fakes';

describe('concept tables', () => {
  it('match key terms by stem/form per language (Latin, Thai substring, Devanagari)', () => {
    expect(conceptsForToken('es', 'perdonó')).toContain('forgive');
    expect(conceptsForToken('es', 'arrepentí')).toContain('repent');
    expect(conceptsForToken('es', 'creo')).toEqual(['believe']);
    expect(conceptsForToken('es', 'sé')).toEqual(['know']);
    expect(conceptsForToken('es', 'crear')).toEqual([]); // no false positive on the "cre-" stem
    expect(conceptsForToken('es', 'x', 'conocer')).toContain('know'); // via lemma
    expect(conceptsForToken('de', 'vergeben')).toContain('forgive');
    expect(conceptsForToken('de', 'Schuld'.toLowerCase())).toContain('guilt');
    expect(conceptsForToken('th', 'พระคุณ')).toContain('grace');
    expect(conceptsForToken('th', 'ความผิด')).toContain('guilt');
    expect(conceptsForToken('hi', 'पाप')).toContain('sin');
    expect(conceptsForToken('hi', 'क्षमा')).toContain('forgive');
    expect(conceptsForToken('sq', 'mëkatet')).toContain('sin');
  });

  it('every language covers the ten key terms from the plan', () => {
    const plan = ['know', 'believe', 'trust', 'repent', 'regret', 'guilt', 'conviction', 'salvation', 'forgive', 'grace'] as const;
    for (const lang of LANGUAGES as readonly LanguageCode[]) {
      for (const c of plan) {
        expect(CONCEPTS[c].keyTerm).toBe(true);
        expect(lexemesFor(lang, c).length, `${lang}:${c}`).toBeGreaterThan(0);
      }
    }
  });

  it('English intent words map to concepts in order of appearance, without substring false positives', () => {
    expect(englishConcepts('I knew Jesus but did not understand my sin').map((c) => c.concept)).toEqual(['know', 'jesus', 'understand', 'sin']);
    expect(englishConcepts('since singing is single').map((c) => c.concept)).toEqual([]);
  });

  it('section tagging: highest concept weight wins, confidence is derived from the evidence, none without evidence', () => {
    const t = (...ws: string[]) => ws.map((w) => ({ normalized: w }));
    expect(tagSection('es', t('me', 'arrepentí'))).toEqual({ section: 'repentance', confidence: 1 });
    expect(tagSection('es', t('la', 'casa'))).toBeUndefined();
    const mixed = tagSection('es', t('joven', 'jesús'))!; // childhood 2 vs knowledge 1
    expect(mixed.section).toBe('childhood');
    expect(mixed.confidence).toBeCloseTo((2 / 3) * 1, 2);
  });
});

describe('diffSentences', () => {
  it('pairs runs into changed and keeps unmatched ones as added/removed', () => {
    expect(diffSentences(['a', 'b', 'c'], ['a', 'x', 'c'])).toEqual([
      { kind: 'same', a: 'a', b: 'a' }, { kind: 'changed', a: 'b', b: 'x' }, { kind: 'same', a: 'c', b: 'c' },
    ]);
    expect(diffSentences(['a'], ['a', 'b', 'c'])).toEqual([{ kind: 'same', a: 'a', b: 'a' }, { kind: 'added', b: 'b' }, { kind: 'added', b: 'c' }]);
    expect(diffSentences(['a', 'b'], [])).toEqual([{ kind: 'removed', a: 'a' }, { kind: 'removed', a: 'b' }]);
    expect(diffSentences([], [])).toEqual([]);
  });
});

// ───────────────────────── D2 units ─────────────────────────

describe('meaning checks', () => {
  const adapter = makeFakeAdapter({
    lang: 'es',
    lexicon: {
      hablo: { lemma: 'hablar', pos: 'VERB', morph: { Tense: 'Pres' } }, hable: { lemma: 'hablar', pos: 'VERB', morph: { Tense: 'Past' } },
      comer: { lemma: 'comer', pos: 'VERB' },
    },
  });
  const p = (s: string) => parse(adapter, s);

  it('negation: removed, added, swapped, unchanged', () => {
    expect(negationChange('es', p('Yo no hablo.'), p('Yo hablo.'))).toMatch(/Removes the negation "no"/);
    expect(negationChange('es', p('Yo hablo.'), p('Yo no hablo.'))).toMatch(/Adds a negation "no"/);
    expect(negationChange('es', p('Yo no hablo.'), p('Yo nunca hablo.'))).toMatch(/Changes the negation: "no" becomes "nunca"/);
    expect(negationChange('es', p('Yo no hablo.'), p('Yo no hablo mucho.'))).toBeUndefined();
  });

  it('chronology: dropping / swapping / adding a time word, and the life-stage word "joven"', () => {
    expect(chronologyChange('es', p('Cuando era joven hablo.'), p('Hablo.'))).toMatch(/Drops the time word "cuando", "joven"/);
    expect(chronologyChange('es', p('Antes hablo.'), p('Ahora hablo.'))).toMatch(/"antes" becomes "ahora"/);
    expect(chronologyChange('es', p('Hablo.'), p('Hablo ayer.'))).toMatch(/Adds the time word "ayer"/);
    expect(chronologyChange('es', p('Hablo ayer.'), p('Hablo ayer mucho.'))).toBeUndefined();
  });

  it('tense: only when both sides carry a tense and they differ', () => {
    expect(tenseChange(p('Hablo.'), p('Hable.'))).toMatch(/Pres becomes Past/);
    expect(tenseChange(p('Comer.'), p('Hable.'))).toBeUndefined(); // an infinitive has no tense to lose
    expect(tenseChange(p('Hablo.'), p('Hablo.'))).toBeUndefined();
  });

  it('meaningChanges lists every difference, nothing when the meaning is intact', () => {
    expect(meaningChanges('es', p('Yo no hablo.'), p('Yo hablo ahora.')).length).toBe(2);
    expect(meaningChanges('es', p('Yo hablo.'), p('Yo hablo.'))).toEqual([]);
  });

  it('every language has chronology words and negators (Thai / Hindi as exact tokens)', () => {
    for (const lang of LANGUAGES as readonly LanguageCode[]) {
      expect(CHRONOLOGY[lang].length, lang).toBeGreaterThan(5);
    }
  });
});

describe('applyEdits', () => {
  it('applies several replacements and removes the space around a deletion', () => {
    expect(applyEdits('a b c', [{ start: 0, end: 1, replacement: 'x' }, { start: 4, end: 5, replacement: 'z' }])).toBe('x b z');
    expect(applyEdits('no sé', [{ start: 0, end: 2, replacement: '' }])).toBe('sé');
    expect(applyEdits('yo no sé', [{ start: 3, end: 5, replacement: '' }])).toBe('yo sé');
  });
  it('overlapping edits are refused', () => {
    expect(applyEdits('abcdef', [{ start: 0, end: 4, replacement: 'x' }, { start: 2, end: 5, replacement: 'y' }])).toBeUndefined();
  });
});

describe('source finder', () => {
  it('distinct sentences, corpus before the learner\'s own testimony, only this learner, capped', async () => {
    const { createMemoryStore, seedBasics } = await import('../../src/core');
    const store = createMemoryStore();
    await seedBasics(store);
    const gl = new FakeGoLearn(store);
    await buildFixtureText(store, { lang: 'es', slug: 's1', title: 'Story 1', sentences: [{ tokens: [{ surface: 'Yo' }, { surface: 'creo' }] }, { tokens: [{ surface: 'Creo' }, { surface: 'mucho' }] }] });
    await buildFixtureText(store, { lang: 'es', slug: 't1', title: 'Mine', kind: 'testimony', sentences: [{ tokens: [{ surface: 'creo' }] }] });
    const item = 'form:es:creo';
    await gl.encounter('A', 'es', item, 'text:es:t1/s0', 'text:es:t1', 'testimony');
    await gl.encounter('A', 'es', item, 'text:es:s1/s0', 'text:es:s1', 'corpus');
    await gl.encounter('A', 'es', item, 'text:es:s1/s1', 'text:es:s1', 'corpus');
    await gl.encounter('B', 'es', item, 'text:es:s1/s1', 'text:es:s1', 'corpus');
    const finder = createSourceFinder(store);
    const two = await finder.forItem('A', item);
    expect(two.map((s) => s.textTitle)).toEqual(['Story 1', 'Story 1']);
    expect(two.map((s) => s.surface)).toEqual(['corpus', 'corpus']);
    const three = await finder.forItem('A', item, 3);
    expect(three.map((s) => s.textTitle)).toEqual(['Story 1', 'Story 1', 'Mine']);
    expect(three[2].surface).toBe('testimony');
    expect(await finder.forItem('C', item)).toEqual([]);
    expect(mergeSources([two, three]).map((s) => s.sentenceId)).toHaveLength(3);
  });
});
