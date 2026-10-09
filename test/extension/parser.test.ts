import { describe, expect, it } from 'vitest';
import { PACK_ID, parseSelection, type CardModel, type ParseContext } from '../../packages/golearn-extension/src/parser';
import { ids } from '../../src/core/ids';

/**
 * These tests check the SHAPE of the card model and that confidence and provenance are always present and honest.
 * They do not assert linguistic correctness: no native speaker has checked the Albanian pack.
 */
const SENTENCES: Array<[sentence: string, selection: string]> = [
  ['Unë po lexoj një libër të bukur në shtëpinë time.', 'shtëpinë'],
  ['Ajo shkoi në treg për të blerë bukë dhe qumësht.', 'blerë'],
  ['Fëmijët e vegjël luajnë në oborr çdo ditë.', 'vegjël'],
  ['Nëse bie shi, nuk do të dalim sot.', 'bie'],
  ['Mësuesi na tregoi një histori shumë interesante.', 'interesante'],
  ['Kam shumë vite që jetoj në Tiranë.', 'Tiranë'],
  ['Xhirimet e filmit filluan të hënën.', 'Xhirimet'],
  ['Ai është një njeri i mirë.', 'një njeri i mirë'],
  ['Zonja Drita ka një mace të zezë.', 'mace'],
  ['Flurbozitet shkëlqejnë sot.', 'Flurbozitet'],
];

const ctxOf = (sentence: string, selection: string, over: Partial<ParseContext> = {}): ParseContext => {
  const at = sentence.indexOf(selection);
  return { kind: 'sentence', confidence: 0.9, sentence, selStart: at, selEnd: at + selection.length, ...over };
};

const FIELDS = ['surface', 'lemma', 'pos', 'morphology', 'gloss', 'confidence', 'provenance', 'phrases', 'words', 'notes', 'basis', 'pronunciation', 'context'] as const;

describe('parser: the card model on ten Albanian sentences', () => {
  for (const [sentence, selection] of SENTENCES) {
    it(`"${selection}" in "${sentence}"`, () => {
      const card: CardModel = parseSelection({ surface: selection, context: ctxOf(sentence, selection) });
      expect(card.surface).toBe(selection);
      expect(card.languageId).toBe('sq');
      expect(card.packId).toBe(PACK_ID);
      expect(card.analyzerId).toMatch(/adapter-sq@/);
      // confidence and provenance are always present, in range, and consistent with each other
      expect(typeof card.confidence).toBe('number');
      expect(card.confidence).toBeGreaterThanOrEqual(0);
      expect(card.confidence).toBeLessThanOrEqual(1);
      expect(['lexicon', 'rule', 'none']).toContain(card.provenance);
      if (card.provenance === 'none') { expect(card.confidence).toBe(0); expect(card.lemma).toBeUndefined(); }
      else { expect(card.confidence).toBeGreaterThan(0); if (card.tokenCount === 1) expect(card.source?.reviewStatus).toBeTruthy(); }
      // arrays are arrays, notes are strings
      for (const k of ['phrases', 'words', 'notes', 'basis', 'pronunciation', 'alternatives', 'itemIds', 'limits'] as const) expect(Array.isArray(card[k])).toBe(true);
      // every analyser-made field carries a label, and none of them claims to be a learner-state inference: only the learner-model line (filled in by the card from the background) is labelled inference
      for (const f of FIELDS) expect(['fact', 'analysis']).toContain(card.labels[f]);
      expect(card.labels.surface).toBe('fact');
      expect(card.labels.lemma).toBe('analysis');
      expect(Object.entries(card.labels).filter(([, v]) => v === 'inference').map(([k]) => k)).toEqual(['learner']);
      // the context is reported as it was given and as a hash, never as text
      expect(card.context.kind).toBe('sentence');
      expect(card.context.sentenceKey).toMatch(/^[0-9a-f]{12}$/);
      expect(card.context.sentenceKey).toBe(ids.sentenceKey(sentence));
      expect(JSON.stringify(card.context)).not.toContain(sentence);
      expect(card.context.selectionLocated).toBe(true);
      // the card says what it lacks
      expect(card.limits.join(' ')).toMatch(/machine-drafted/);
      expect(card.limits.join(' ')).toMatch(/no machine translation/);
      // the encounter has at least one item, as a lemma id only when the reading is creditable
      expect(card.itemIds.length).toBeGreaterThan(0);
      for (const id of card.itemIds) expect(id).toMatch(/^(lemma|form|phrase):sq:/);
      if (card.unconfirmed) { expect(card.gloss).toBeUndefined(); expect(card.itemIds.every((i) => i.startsWith('form:'))).toBe(true); }
    });
  }

  it('an unknown word is reported as unknown or unconfirmed, never given an invented meaning', () => {
    const c = parseSelection({ surface: 'Flurbozitet', context: ctxOf('Flurbozitet shkëlqejnë sot.', 'Flurbozitet') });
    expect(c.gloss).toBeUndefined();
    expect(c.unconfirmed).toBe(true);
    expect(c.provenance).toBe('rule');
    expect(c.confidence).toBeLessThan(0.5);
    expect(c.notes.join(' ')).toMatch(/Not in the word list/);
  });

  it('a multi-word selection gets one line per word and takes the weakest confidence', () => {
    const c = parseSelection({ surface: 'një njeri i mirë', context: ctxOf('Ai është një njeri i mirë.', 'një njeri i mirë') });
    expect(c.tokenCount).toBe(4);
    expect(c.words.length).toBe(4);
    expect(c.confidence).toBe(Math.min(...c.words.map((w) => w.confidence)));
    expect(c.lemma).toBeUndefined();
    expect(c.itemIds.length).toBeGreaterThan(1);
  });

  it('a phrase entry that covers the whole selection becomes the card', () => {
    const c = parseSelection({ surface: 'bie shi', context: ctxOf('Nëse bie shi, nuk do të dalim sot.', 'bie shi') });
    expect(c.phrases.some((p) => p.display === 'bie shi')).toBe(true);
    expect(c.lemma).toBe('bie shi');
    expect(c.provenance).toBe('lexicon');
  });

  it('forty words are analysed and summarised without a crash; only the first twelve lines are kept', () => {
    const words = Array.from({ length: 40 }, (_, i) => ['shtëpi', 'libër', 'mace', 'ujë'][i % 4]);
    const sentence = `Ai tha ${words.join(' ')} sot.`;
    const sel = words.join(' ');
    const c = parseSelection({ surface: sel, context: ctxOf(sentence, sel) });
    expect(c.tokenCount).toBe(40);
    expect(c.words).toHaveLength(12);
    expect(c.notes.join(' ')).toMatch(/first 12 of 40/);
  });

  it('a selection that is part of a word says so', () => {
    const c = parseSelection({ surface: 'shtëp', context: ctxOf('Unë jam në shtëpi.', 'shtëp') });
    expect(c.notes.join(' ')).toMatch(/part of the word "shtëpi"/);
  });
});

describe('parser: honesty when context or language is missing', () => {
  it('with no context the selection is read alone and the card says so (context none, confidence 0)', () => {
    const c = parseSelection({ surface: 'po', context: { kind: 'none', confidence: 0 } });
    expect(c.context.kind).toBe('none');
    expect(c.context.confidence).toBe(0);
    expect(c.context.sentenceKey).toBeUndefined();
    expect(c.notes.join(' ')).toMatch(/No sentence context/);
    expect(typeof c.confidence).toBe('number');
    expect(c.provenance).not.toBe('none');
  });

  it('a fragment is reported as a fragment, with a fragment key and no sentence key', () => {
    const c = parseSelection({ surface: 'libër', context: { kind: 'fragment', confidence: 0.3, sentence: 'lexoj një libër të', selStart: 10, selEnd: 15, reason: 'test' } });
    expect(c.context.kind).toBe('fragment');
    expect(c.context.sentenceKey).toBeUndefined();
    expect(c.context.fragmentKey).toMatch(/^[0-9a-f]{12}$/);
    expect(c.context.confidence).toBe(0.3);
    expect(c.notes.join(' ')).toMatch(/fragment/);
  });

  it('context confidence is never raised by the parser', () => {
    const c = parseSelection({ surface: 'libër', context: ctxOf('Unë lexoj një libër.', 'libër', { confidence: 0.2 }) });
    expect(c.context.confidence).toBe(0.2);
  });

  it('a selection that is not found in its context falls back to the word alone and says so', () => {
    const c = parseSelection({ surface: 'libër', context: { kind: 'sentence', confidence: 0.9, sentence: 'Tjetër fjali këtu.', selStart: 0, selEnd: 5 } });
    expect(c.context.kind).toBe('none');
    expect(c.context.selectionLocated).toBe(false);
    expect(c.context.reason).toMatch(/not found/);
  });

  it('Thai: a span the Albanian tokenizer cannot segment reports provenance none, context and the script mismatch', () => {
    const sentence = 'ฉันชอบอ่านหนังสือภาษาไทยทุกวัน';
    const sel = 'หนังสือ';
    const c = parseSelection({ surface: sel, context: ctxOf(sentence, sel) });
    expect(c.provenance).toBe('none');
    expect(c.confidence).toBe(0);
    expect(c.lemma).toBeUndefined();
    expect(c.gloss).toBeUndefined();
    expect(c.context.kind).toBe('sentence');
    expect(c.notes.join(' ')).toMatch(/not in Latin script/);
    expect(c.itemIds).toEqual(['form:sq:หนังสือ']);
    // a span cut through the middle of the segmenter's words still yields an honest card
    const mid = parseSelection({ surface: 'ชอบอ่านหนัง', context: ctxOf(sentence, 'ชอบอ่านหนัง') });
    expect(mid.provenance).toBe('none');
    expect(mid.confidence).toBe(0);
  });

  it('Hebrew, Arabic and Devanagari get no Albanian reading', () => {
    for (const [sentence, sel] of [['שלום עולם, זהו משפט.', 'עולם'], ['مرحبا بالعالم، هذه جملة.', 'بالعالم'], ['यह किताब अच्छी है।', 'किताब']] as const) {
      const c = parseSelection({ surface: sel, context: ctxOf(sentence, sel, { direction: sel === 'किताब' ? 'ltr' : 'rtl' }) });
      expect(c.provenance).toBe('none');
      expect(c.confidence).toBe(0);
      expect(c.notes.join(' ')).toMatch(/not in Latin script/);
    }
  });

  it('a page that declares another language is named in a note when the Albanian pack is applied anyway', () => {
    const c = parseSelection({ surface: 'Straße', context: ctxOf('Die Straße ist lang.', 'Straße', { pageLanguage: 'de' }) });
    expect(c.notes.join(' ')).toMatch(/declares its language as "de"/);
    const sq = parseSelection({ surface: 'libër', context: ctxOf('Unë lexoj një libër.', 'libër', { pageLanguage: 'sq' }) });
    expect(sq.notes.join(' ')).not.toMatch(/declares its language/);
  });

  it('punctuation-only and empty selections produce a valid card with no reading', () => {
    for (const s of ['…', '!!', '']) {
      const c = parseSelection({ surface: s, context: { kind: 'none', confidence: 0 } });
      expect(c.provenance).toBe('none');
      expect(c.confidence).toBe(0);
      expect(c.tokenCount).toBe(0);
      expect(c.notes.length).toBeGreaterThan(0);
    }
  });
});
