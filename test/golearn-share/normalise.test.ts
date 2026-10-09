import { describe, expect, it } from 'vitest';
import {
  MAX_SHARE_WORDS, candidateWords, chooseWord, normaliseSharedPassage, shareReaderId, SHARE_MECHANISMS,
  type NormalisedShare,
} from '../../packages/golearn-share/src';
import { graphemeBoundaries } from '../../packages/golearn-share/src/text';

const ok = (text: string, languageHint?: string): NormalisedShare => {
  const r = normaliseSharedPassage({ text, ...(languageHint ? { languageHint } : {}) });
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}: ${r.message}`);
  return r;
};

describe('normalising a shared passage', () => {
  it('applies NFC, collapses whitespace and trims, as the reader contract does', () => {
    const r = ok('  \n  shtëpï  \t ');
    expect(r.surface).toBe('shtëpï'.normalize('NFC'));
    expect(r.surface).toBe(r.surface.normalize('NFC'));
    expect(r.surface.length).toBeLessThan('shtëpï'.length);
    const p = ok('Unë   po lexoj​një\r\nlibër të bukur.');
    expect(p.surface).toBe('Unë po lexoj një libër të bukur.'.replace('lexoj një', 'lexoj një'));
    expect(p.surface).not.toMatch(/\s{2,}|[​ \n\r]/u);
  });

  it('keeps the zero-width joiner and non-joiner, which spell words, and drops direction marks at the edges', () => {
    const joined = 'क्‍ष';
    expect(ok(joined).surface).toBe(joined);
    const persian = 'می‌خواهم';
    expect(ok(persian).surface).toBe(persian);
    expect(ok('‏שלום‏').surface).toBe('שלום');
  });

  it('a single word, or a phrase of up to four words in one sentence, is a selection: kind none, no word choice', () => {
    const w = ok('“shtëpinë,”');
    expect(w).toMatchObject({ surface: 'shtëpinë', needsWordChoice: false, wordCount: 1 });
    expect(w.context).toMatchObject({ kind: 'none', confidence: 0 });
    const ph = ok('me shumë dashuri.');
    expect(ph).toMatchObject({ surface: 'me shumë dashuri', needsWordChoice: false, wordCount: 3 });
    expect(ph.context.kind).toBe('none');
    expect(ph.context.sentence).toBeUndefined();
  });

  it('a longer single sentence needs a word choice and is a sentence at a lower confidence than a web page', () => {
    const r = ok('Unë po lexoj një libër të bukur në shtëpinë time.');
    expect(r.needsWordChoice).toBe(true);
    expect(r.context.kind).toBe('sentence');
    expect(r.context.confidence).toBe(0.6);
    expect(r.context.confidence).toBeLessThan(0.9);
    expect(r.surface).toBe('Unë po lexoj një libër të bukur në shtëpinë time.');
  });

  it('a passage of more than one sentence is a fragment with the word unknown', () => {
    const r = ok('Unë po lexoj një libër të bukur. Ai është në shtëpi. Ne flasim.');
    expect(r).toMatchObject({ needsWordChoice: true });
    expect(r.context).toMatchObject({ kind: 'fragment', confidence: 0.4 });
    expect(r.context.selStart).toBeUndefined();
    expect(r.context.sentence).toBeUndefined();
  });

  it('a sentence cut without its ending, and a text with a line break, are fragments, not sentences', () => {
    expect(ok('Unë po lexoj një libër të bukur në shtëpinë').context.kind).toBe('fragment');
    expect(ok('Unë po lexoj një libër\nnë shtëpinë time.').context.kind).toBe('fragment');
  });

  it('Hindi sentences end at the danda; a Thai passage has no sentence-final mark to check and stays a fragment', () => {
    const hi = ok('मैं हर दिन अपने घर में किताब पढ़ता हूँ।', 'hi');
    expect(hi.context).toMatchObject({ kind: 'sentence', pageLanguage: 'hi' });
    const hi2 = ok('मैं घर जा रहा हूँ। तुम कहाँ हो? ठीक है।', 'hi');
    expect(hi2.context.kind).toBe('fragment');
    const th = ok('สวัสดีครับ ผมชื่อสมชาย ยินดีที่ได้รู้จัก', 'th');
    expect(th).toMatchObject({ needsWordChoice: true });
    expect(th.context.kind).toBe('fragment');
  });

  it('trims the edges of a looked-up word without cutting a Hindi or Thai cluster', () => {
    // a trailing vowel sign, a virama-joined cluster and a tone mark are marks, not punctuation
    expect(ok('“कि”').surface).toBe('कि');
    expect(ok('नमस्ते।').surface).toBe('नमस्ते');
    expect(ok('«हूँ»').surface).toBe('हूँ');
    expect(ok('"น้ำ"', 'th').surface).toBe('น้ำ');
    expect(ok('(สวัสดี)', 'th').surface).toBe('สวัสดี');
    for (const s of ['कि', 'नमस्ते', 'हूँ', 'น้ำ', 'ที่']) {
      const r = ok(`”${s}“`);
      expect(graphemeBoundaries(s)).toContain(r.surface.length);
      expect(r.surface).toBe(s);
    }
  });

  it('refuses what is too long, empty, only a link, or not text, with a reason the screen can show', () => {
    const eighty = Array.from({ length: MAX_SHARE_WORDS }, (_, i) => `fjalë${i}`).join(' ');
    expect(normaliseSharedPassage({ text: eighty }).ok).toBe(true);
    const over = normaliseSharedPassage({ text: `${eighty} edhe` });
    expect(over).toMatchObject({ ok: false, reason: 'too-long' });
    const long = normaliseSharedPassage({ text: Array.from({ length: 60 }, () => 'x'.repeat(30)).join(' ') });
    expect(long).toMatchObject({ ok: false, reason: 'too-long' });
    expect(normaliseSharedPassage({ text: ' \n\t ' })).toMatchObject({ ok: false, reason: 'empty' });
    expect(normaliseSharedPassage({ text: '… !! …' })).toMatchObject({ ok: false, reason: 'empty' });
    expect(normaliseSharedPassage({ text: 'https://example.org/read/ch3?x=1' })).toMatchObject({ ok: false, reason: 'link-only' });
    expect(normaliseSharedPassage({ text: 42 as unknown as string })).toMatchObject({ ok: false, reason: 'unreadable' });
    for (const bad of [over, long]) if (!bad.ok) expect(bad.message.length).toBeGreaterThan(10);
  });

  it('an invalid language hint is ignored, not thrown', () => {
    expect(ok('Unë po lexoj një libër të bukur.', 'not a tag!!').needsWordChoice).toBe(true);
  });
});

describe('the words the learner can pick', () => {
  it('lists the word-like segments with offsets that slice back to the word', () => {
    const r = ok('Unë po lexoj një libër të bukur në shtëpinë time.');
    const words = candidateWords(r);
    expect(words.map((w) => w.surface)).toEqual(['Unë', 'po', 'lexoj', 'një', 'libër', 'të', 'bukur', 'në', 'shtëpinë', 'time']);
    for (const w of words) expect(r.surface.slice(w.start, w.end)).toBe(w.surface);
    expect(words.map((w) => w.index)).toEqual(words.map((_, i) => i));
  });

  it('a Hindi passage is cut at words, never inside a conjunct, matra or nukta', () => {
    const r = ok('नमस्ते दुनिया, मैं कितना खुश हूँ। फ़ैसला हो गया।', 'hi');
    const words = candidateWords(r, 'hi');
    expect(words.map((w) => w.surface)).toEqual(['नमस्ते', 'दुनिया', 'मैं', 'कितना', 'खुश', 'हूँ', 'फ़ैसला', 'हो', 'गया']);
    const b = new Set(graphemeBoundaries(r.surface));
    for (const w of words) { expect(b.has(w.start), w.surface).toBe(true); expect(b.has(w.end), w.surface).toBe(true); }
  });

  it('a Thai passage with no spaces between words is segmented into words, on cluster boundaries', () => {
    const r = ok('ฉันกำลังอ่านหนังสือที่บ้านของฉันทุกวัน', 'th');
    const words = candidateWords(r, 'th');
    expect(words.length).toBeGreaterThan(4);
    expect(words.map((w) => w.surface).join('')).toBe(r.surface);
    const b = new Set(graphemeBoundaries(r.surface));
    for (const w of words) {
      expect(b.has(w.start), w.surface).toBe(true);
      expect(b.has(w.end), w.surface).toBe(true);
      expect(w.surface).not.toMatch(/^[ะ-ฺ็-๎]/u);
    }
  });

  it('a chosen word carries the passage and its offsets; a selection that needed no choice has none', () => {
    const r = ok('Unë po lexoj një libër të bukur në shtëpinë time.');
    const pick = candidateWords(r).find((w) => w.surface === 'shtëpinë')!;
    const chosen = chooseWord(r, pick)!;
    expect(chosen.surface).toBe('shtëpinë');
    expect(chosen.context).toMatchObject({ kind: 'sentence', confidence: 0.6, sentence: r.surface });
    expect(chosen.context.sentence!.slice(chosen.context.selStart, chosen.context.selEnd)).toBe('shtëpinë');
    expect(chooseWord(ok('shtëpinë'), { start: 0, end: 3 })).toBeUndefined();
    expect(chooseWord(r, { start: 5, end: 5 })).toBeUndefined();
    expect(chooseWord(r, { start: 0, end: 9999 })).toBeUndefined();
  });
});

describe('reader ids', () => {
  it('maps every mechanism to one of the four ids', () => {
    expect(shareReaderId('android-process-text')).toBe('share-android');
    expect(shareReaderId('android-send')).toBe('share-android');
    expect(shareReaderId('ios-share-extension')).toBe('share-ios');
    expect(shareReaderId('ios-safari-extension')).toBe('share-ios');
    expect(shareReaderId('web-share-target')).toBe('share-web');
    expect(shareReaderId('deep-link')).toBe('share-web');
    expect(shareReaderId('clipboard-import')).toBe('clipboard');
    expect(new Set(SHARE_MECHANISMS.map(shareReaderId))).toEqual(new Set(['share-android', 'share-ios', 'share-web', 'clipboard']));
  });
});
