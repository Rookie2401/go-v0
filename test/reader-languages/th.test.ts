// @vitest-environment node
/**
 * Thai (experimental pack) through the reader's parser and the analyser's own sentence splitter. Every assertion is what
 * adapter-th@5 really does; where it does not do what a learner would need, the test is an `it.fails` named "LIMIT: ..."
 * with a comment saying what is missing, so the limit is counted and cannot be forgotten.
 */
import { describe, expect, it } from 'vitest';
import { thAdapter } from '../../src/adapters/th';
import { cardOf, wordsOf } from './helpers';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { registerAllAnalysers } from '../support/analysers';

registerAllAnalysers(); // the parser carries Albanian; the other analysers are chunks the content script loads on demand

const ids = (c: ReturnType<typeof cardOf>): string[] => c.constructions.map((k) => k.id);

describe('Thai: a run of text with no spaces is cut into words', () => {
  it('ฉันกินข้าวที่บ้านทุกวัน becomes seven words, and no space is added to the text', () => {
    const text = 'ฉันกินข้าวที่บ้านทุกวัน';
    expect(wordsOf(thAdapter, text)).toEqual(['ฉัน', 'กิน', 'ข้าว', 'ที่', 'บ้าน', 'ทุก', 'วัน']);
    expect(thAdapter.tokenize(text).map((t) => t.surface).join('')).toBe(text);
  });

  it('every token is an exact slice of the text, whatever it is', () => {
    const text = 'ฉันชอบ coffee มาก และเขาไปโรงเรียนแล้วครับ';
    for (const t of thAdapter.tokenize(text)) expect(text.slice(t.start, t.end)).toBe(t.surface);
  });

  it('a selected word in the run gets its own card: ข้าว is rice, from the hand lexicon, with the phrase it belongs to', () => {
    const c = cardOf('ฉันกิน«ข้าว»ที่บ้านทุกวัน', 'th');
    expect(c).toMatchObject({ languageId: 'th', lemma: 'ข้าว', pos: 'NOUN', gloss: 'rice; food, a meal', provenance: 'lexicon', tokenCount: 1 });
    expect(c.phrases.map((p) => p.display)).toEqual(['กินข้าว']);
    expect(c.itemIds).toEqual(['lemma:th:ข้าว:NOUN']);
  });

  it('Thai has no inflection: a reading has a lemma and a part of speech and no morphology, and the card says nothing it does not know', () => {
    const c = cardOf('«ฉัน»กินข้าวที่บ้านทุกวัน', 'th');
    expect(c).toMatchObject({ lemma: 'ฉัน', pos: 'PRON' });
    expect(c.features).toEqual([]);
    expect(c.morphology).toBeUndefined();
  });

  it('tone and syllables come from the spelling: the pronunciation notes name the consonant class and the tone mark', () => {
    const c = cardOf('ฉันกิน«ข้าว»ที่บ้านทุกวัน', 'th');
    expect(c.pronunciation.join(' ')).toMatch(/Initial consonant class: high/);
    expect(c.pronunciation.join(' ')).toMatch(/tone mark/);
  });
});

describe('Thai: boundaries that are ambiguous', () => {
  it('a compound the lexicon lists is kept whole: ตากลม ("take the air") is one word', () => {
    expect(wordsOf(thAdapter, 'ฉันอยากไปตากลม')).toEqual(['ฉัน', 'อยาก', 'ไป', 'ตากลม']);
    const c = cardOf('ฉันอยากไป«ตากลม»', 'th');
    expect(c).toMatchObject({ lemma: 'ตากลม', pos: 'VERB', gloss: 'to take the air; to dry in the wind' });
  });

  it('a boundary the segmenter gets wrong is reported, not hidden: in สองคนในห้อง the segmenter cuts คนใน ("insiders") as one word', () => {
    const w = wordsOf(thAdapter, 'มีนักเรียนสองคนในห้อง');
    expect(w).toEqual(['มี', 'นักเรียน', 'สอง', 'คนใน', 'ห้อง']);
    // selecting the classifier คน alone: the selection is part of the token คนใน and the card says so
    const c = cardOf('มีนักเรียนสอง«คน»ในห้อง', 'th');
    expect(c.lemma).toBe('คนใน');
    expect(c.notes.join(' ')).toMatch(/The selection is part of the word "คนใน"/);
  });

  // LIMIT: the intended reading is สอง | คน | ใน | ห้อง (two + classifier คน, then "in the room"), but the dictionary
  // segmentation plus the course compound list produces the listed word คนใน, so the classifier is never offered on its own.
  it.fails('LIMIT: คน in สองคนในห้อง is its own word (the classifier)', () => {
    expect(wordsOf(thAdapter, 'มีนักเรียนสองคนในห้อง')).toContain('คน');
  });

  // LIMIT: where the lexicon lacks a compound, ICU may cut it into its parts or keep a longer word than a learner expects;
  // the adapter says so itself and nothing has been measured on running prose. Here the unit คนใน is a listed noun with its
  // own gloss, so the card for the selected classifier shows "people inside; insiders" and not "person".
  it.fails('LIMIT: the card for the classifier คน in สองคนในห้อง is the classifier, not the noun คนใน', () => {
    expect(cardOf('มีนักเรียนสอง«คน»ในห้อง', 'th').pos).toBe('CLF');
  });
});

describe('Thai: mixed Thai and English', () => {
  it('a Latin-script word inside Thai text is its own token and has NO reading: the card says the word is unknown, with confidence 0', () => {
    expect(wordsOf(thAdapter, 'ฉันชอบ coffee มาก')).toEqual(['ฉัน', 'ชอบ', 'coffee', 'มาก']);
    const c = cardOf('ฉันชอบ «coffee» มาก', 'th');
    expect(c).toMatchObject({ confidence: 0, provenance: 'none', unconfirmed: false });
    expect(c.lemma).toBeUndefined();
    expect(c.itemIds).toEqual(['form:th:coffee']);
    expect(c.notes.join(' ')).toMatch(/not in Thai script: the Thai word list does not apply/);
  });

  it('the Thai words around it are unaffected', () => {
    expect(cardOf('ฉันชอบ coffee «มาก»', 'th')).toMatchObject({ lemma: 'มาก', pos: 'ADV', provenance: 'lexicon' });
    expect(cardOf('ฉัน«ชอบ» coffee มาก', 'th')).toMatchObject({ lemma: 'ชอบ', pos: 'VERB' });
  });

  it('a Thai selection on an English page says the page declares another language but still reads it as Thai', () => {
    const c = cardOf('«ข้าว»กิน', 'th', { pageLanguage: 'en-US' });
    expect(c.lemma).toBe('ข้าว');
    expect(c.notes.join(' ')).toMatch(/The page declares its language as "en-US"; the Thai word list is applied because Thai is the language you are studying/);
  });
});

describe('Thai: sentence-final particles', () => {
  it('ครับ ends the sentence as a polite particle, and the card names the construction', () => {
    const c = cardOf('เขาไปโรงเรียนแล้ว«ครับ»', 'th');
    expect(c).toMatchObject({ lemma: 'ครับ', pos: 'PART', gloss: '(polite particle, male speaker)' });
    expect(ids(c)).toContain('final-particle');
  });

  it('คะ marks a question for a female speaker: คุณชื่ออะไรคะ', () => {
    const c = cardOf('คุณชื่ออะไร«คะ»', 'th');
    expect(c).toMatchObject({ lemma: 'คะ', pos: 'PART', gloss: '(polite particle, female speaker; questions)' });
    expect(ids(c)).toContain('final-particle');
  });

  it('แล้ว marks a completed action, found with the verb: ไป … แล้ว', () => {
    const c = cardOf('เขาไปโรงเรียน«แล้ว»ครับ', 'th');
    expect(c).toMatchObject({ lemma: 'แล้ว', pos: 'ADV' });
    expect(ids(c)).toContain('completed-laeo');
  });
});

describe('Thai: sentence segmentation (adapter.segmentSentences)', () => {
  it('a newline between sentences splits them; the spans are exact slices', () => {
    const text = 'เขาไปโรงเรียนแล้วครับ\nฉันกินข้าวที่บ้าน';
    const spans = thAdapter.segmentSentences(text);
    expect(spans).toHaveLength(2);
    for (const s of spans) expect(text.slice(s.start, s.end)).toBe(s.text);
  });

  it('two spaces between sentences split them', () => {
    expect(thAdapter.segmentSentences('เขาไปโรงเรียนแล้วครับ  ฉันกินข้าวที่บ้าน')).toHaveLength(2);
  });

  it('a SINGLE space is a clause pause and does not split (the adapter states this)', () => {
    expect(thAdapter.segmentSentences('เธอพูดภาษาไทยได้ดีมาก ฉันชอบเธอ')).toHaveLength(1);
  });

  // LIMIT: two sentences separated only by a single space are one unit; the adapter cannot tell a clause pause from a
  // sentence end without a mark, a newline or a final particle plus a longer gap.
  it.fails('LIMIT: เธอพูดภาษาไทยได้ดีมาก ฉันชอบเธอ is two sentences', () => {
    expect(thAdapter.segmentSentences('เธอพูดภาษาไทยได้ดีมาก ฉันชอบเธอ')).toHaveLength(2);
  });

  it('the parser still reads a word of the second clause with the whole unit as its context', () => {
    const c = cardOf('เธอพูดภาษาไทยได้ดีมาก ฉัน«ชอบ»เธอ', 'th');
    expect(c).toMatchObject({ lemma: 'ชอบ', pos: 'VERB' });
    expect(c.context.kind).toBe('sentence');
  });
});

describe('Thai: the card for a selection that is not Thai', () => {
  it('a Latin selection read as Thai says it is not in Thai script and what the pack does about it (nothing)', () => {
    const c = parseSelection({ surface: 'coffee', languageId: 'th', context: { kind: 'none', confidence: 0 } });
    expect(c.confidence).toBe(0);
    expect(c.notes.join(' ')).toMatch(/not in Thai script/);
  });

  it('every Thai card carries the experimental pack’s limits', () => {
    const c = cardOf('ฉันกิน«ข้าว»ที่บ้านทุกวัน', 'th');
    expect(c.limits.join(' ')).toMatch(/The Thai pack is experimental: lemmatisation is seed-only/);
    expect(c.limits.join(' ')).toMatch(/word segmentation is limited/);
  });
});
