/**
 * Thai constructions: grammatical patterns the reader can name (กำลัง + VERB, ถ้า … ก็ …). Each detector reads
 * the part of speech of its neighbours from the lexicon, so it fires only where the words around are known. A
 * detector whose evidence is a lexical coincidence (a word that is also an ordinary noun, an unknown neighbour)
 * reports a confidence below 0.6.
 *
 * Machine-drafted, not native-reviewed. `example` and `nearMiss` are used by the tests: the detector fires on the
 * example and stays silent on the near misses.
 */
import type { AnalyzedToken, PartOfSpeech, PatternCandidate, RawToken } from '../../core';
import { hasPos } from '../shared';

export interface ThaiConstruction {
  key: string;
  title: string;
  /** One or two sentences with one Thai example and its English. */
  explanation: string;
  example: { th: string; en: string };
  /** Sentences that look similar but are not this construction (the detector must not fire on them). */
  nearMiss: string[];
  detect(c: Ctx): PatternCandidate[];
}

export interface Ctx {
  tokens: RawToken[];
  analyses: AnalyzedToken[];
  /** Normalized text of token i ('' when out of range). */
  n(i: number): string;
  /** Token i is a word and has a candidate with one of these parts of speech. */
  pos(i: number, ...p: PartOfSpeech[]): boolean;
  /** Token i is a word with no candidate at all (the lexicon does not know it). */
  unknown(i: number): boolean;
  /** Index of the last word token (-1 when none). */
  lastWord: number;
}

function makeCtx(tokens: RawToken[], analyses: AnalyzedToken[]): Ctx {
  let lastWord = -1;
  for (let k = tokens.length - 1; k >= 0; k--) if (tokens[k].isWord) { lastWord = k; break; }
  return {
    tokens, analyses, lastWord,
    n: (i) => tokens[i]?.normalized ?? '',
    pos: (i, ...p) => !!tokens[i]?.isWord && hasPos(analyses[i], ...p),
    unknown: (i) => !!tokens[i]?.isWord && !(analyses[i]?.candidates.length),
  };
}

const hit = (key: string, title: string, explanation: string, confidence: number, tokenIndexes: number[]): PatternCandidate =>
  ({ key, title, explanation, confidence, tokenIndexes: [...tokenIndexes].sort((a, b) => a - b) });

/** Words after which ว่า introduces what was said, thought or known. */
const SAYING = new Set(['พูด', 'บอก', 'คิด', 'รู้', 'เชื่อ', 'เห็น', 'เข้าใจ', 'กลัว', 'หวัง', 'ถาม', 'ตอบ', 'รู้สึก', 'จำ', 'ลืม', 'ได้ยิน']);
const DIRECTIONAL = new Set(['ไป', 'มา', 'ขึ้น', 'ลง', 'เข้า', 'ออก']);
const QUESTION_WORDS = new Set(['อะไร', 'ใคร', 'ไหน', 'กี่', 'ทำไม', 'เมื่อไร', 'อย่างไร', 'ที่ไหน', 'เท่าไร', 'ยังไง', 'ไง', 'ไร']);
const POLITE_END = new Set(['ครับ', 'ค่ะ', 'คะ', 'ฮะ']);
const MODALS = new Set(['ต้อง', 'ควร', 'อยาก', 'อาจ', 'น่าจะ', 'คง']);
/** ไป, เข้าไป, ออกไป … : a direction word, or direction words the segmenter keeps together. */
const isDirectional = (s: string): boolean => s.length > 0 && [...DIRECTIONAL].some((d) => s === d || (s.startsWith(d) && isDirectional(s.slice(d.length))));
const THAI_DET = new Set(['นี้', 'นั้น', 'โน้น']);

export const THAI_CONSTRUCTIONS: ThaiConstruction[] = [
  {
    key: 'progressive-kamlang', title: 'กำลัง + verb (in the middle of doing)',
    explanation: 'กำลัง before a verb says the action is going on now, often closed with อยู่: ฉันกำลังกินข้าวอยู่ "I am eating".',
    example: { th: 'ฉันกำลังกินข้าวอยู่', en: 'I am eating.' },
    nearMiss: ['ผมมีกำลังใจ', 'ฉันกินข้าว'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        if (c.n(i) !== 'กำลัง') return;
        if (c.pos(i + 1, 'VERB')) {
          const yu = [i + 2, i + 3, i + 4].find((k) => c.n(k) === 'อยู่' && c.tokens[k]?.isWord);
          out.push(hit(this.key, this.title, this.explanation, yu !== undefined ? 0.9 : 0.85, yu !== undefined ? [i, i + 1, yu] : [i, i + 1]));
        } else if (c.unknown(i + 1)) {
          out.push(hit(this.key, this.title, this.explanation, 0.5, [i, i + 1]));
        }
      });
      return out;
    },
  },
  {
    key: 'continuing-yu', title: 'verb + อยู่ (continuing)',
    explanation: 'อยู่ after a verb says the action or state continues: เขานั่งอยู่ "he is sitting".',
    example: { th: 'เขานั่งอยู่', en: 'He is sitting.' },
    nearMiss: ['เขาอยู่บ้าน'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        if (c.n(i) === 'อยู่' && c.pos(i - 1, 'VERB') && c.n(i - 1) !== 'กำลัง') out.push(hit(this.key, this.title, this.explanation, 0.7, [i - 1, i]));
      });
      return out;
    },
  },
  {
    key: 'future-ja', title: 'จะ + verb (will, going to)',
    explanation: 'จะ before a verb or adjective looks ahead: พรุ่งนี้ฉันจะไปตลาด "tomorrow I will go to the market".',
    example: { th: 'พรุ่งนี้ฉันจะไปตลาด', en: 'Tomorrow I will go to the market.' },
    nearMiss: ['ฉันไม่ไปตลาด'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        if (c.n(i) !== 'จะ') return;
        if (c.pos(i + 1, 'VERB', 'ADJ')) out.push(hit(this.key, this.title, this.explanation, 0.85, [i, i + 1]));
        else if (c.unknown(i + 1)) out.push(hit(this.key, this.title, this.explanation, 0.5, [i, i + 1]));
      });
      return out;
    },
  },
  {
    key: 'experience-khoey', title: 'เคย + verb (have ever; used to)',
    explanation: 'เคย before a verb says it has happened at least once, or used to: ฉันเคยกินมะม่วง "I have eaten mango".',
    example: { th: 'ฉันเคยกินมะม่วง', en: 'I have eaten mango.' },
    nearMiss: ['ฉันกินมะม่วง'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        if (c.n(i) !== 'เคย') return;
        if (c.pos(i + 1, 'VERB', 'ADJ')) out.push(hit(this.key, this.title, this.explanation, 0.85, [i, i + 1]));
        else if (c.unknown(i + 1)) out.push(hit(this.key, this.title, this.explanation, 0.7, [i, i + 1]));
      });
      return out;
    },
  },
  {
    key: 'completed-laeo', title: 'verb + แล้ว (already; now so)',
    explanation: 'แล้ว after a verb or adjective says it is done or has changed: ฉันกินข้าวแล้ว "I have eaten".',
    example: { th: 'ฉันกินข้าวแล้ว', en: 'I have eaten.' },
    nearMiss: ['แล้วฉันก็กลับบ้าน'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        if (c.n(i) !== 'แล้ว') return;
        // after a verb, an object or an adjective; "แล้วก็" after a verb is "and then" — a coincidence
        const before = c.pos(i - 1, 'VERB', 'ADJ') ? i - 1 : (c.pos(i - 1, 'NOUN') && c.pos(i - 2, 'VERB')) ? i - 2 : -1;
        if (before < 0) return;
        out.push(hit(this.key, this.title, this.explanation, c.n(i + 1) === 'ก็' ? 0.55 : 0.75, [before, i]));
      });
      return out;
    },
  },
  {
    key: 'not-yet-yang-mai', title: 'ยังไม่ + verb (not yet)',
    explanation: 'ยังไม่ before a verb or adjective means "not yet": ฉันยังไม่หิว "I am not hungry yet".',
    example: { th: 'ฉันยังไม่หิว', en: 'I am not hungry yet.' },
    nearMiss: ['ฉันยังหิว'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        if (c.n(i) !== 'ยัง' || c.n(i + 1) !== 'ไม่') return;
        if (c.pos(i + 2, 'VERB', 'ADJ', 'AUX')) out.push(hit(this.key, this.title, this.explanation, 0.85, [i, i + 1, i + 2]));
        else if (c.unknown(i + 2)) out.push(hit(this.key, this.title, this.explanation, 0.65, [i, i + 1, i + 2]));
      });
      return out;
    },
  },
  {
    key: 'did-not-mai-dai', title: 'ไม่ได้ + verb (did not)',
    explanation: 'ไม่ได้ before a verb says something did not happen: ฉันไม่ได้กินข้าว "I did not eat".',
    example: { th: 'ฉันไม่ได้กินข้าว', en: 'I did not eat.' },
    nearMiss: ['ฉันกินไม่ได้'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        if (c.n(i) !== 'ไม่ได้' && !(c.n(i) === 'ไม่' && c.n(i + 1) === 'ได้')) return;
        const dai = c.n(i) === 'ไม่ได้' ? i : i + 1;
        if (c.pos(dai + 1, 'VERB') && !c.pos(i - 1, 'VERB')) out.push(hit(this.key, this.title, this.explanation, 0.8, [i, dai, dai + 1]));
      });
      return out;
    },
  },
  {
    key: 'ability-dai', title: 'verb + ได้ / ไม่ได้ (can, cannot)',
    explanation: 'ได้ after a verb says it is possible, ไม่ได้ that it is not: เขาพูดภาษาไทยได้ "he can speak Thai".',
    example: { th: 'เขาพูดภาษาไทยได้', en: 'He can speak Thai.' },
    nearMiss: ['เขาพูดภาษาไทย'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        const neg = c.n(i) === 'ไม่ได้' || (c.n(i) === 'ไม่' && c.n(i + 1) === 'ได้');
        const plain = c.n(i) === 'ได้';
        if (!neg && !plain) return;
        const end = neg && c.n(i) === 'ไม่' ? i + 1 : i;
        if (c.pos(end + 1, 'VERB')) return; // ได้ + verb is "did / got to", not ability
        // the verb, possibly followed by its object
        let v = -1;
        for (let k = i - 1; k >= Math.max(0, i - 3); k--) {
          if (c.pos(k, 'VERB')) { v = k; break; }
          if (!c.pos(k, 'NOUN', 'PROPN', 'PRON')) break;
        }
        if (v < 0) return;
        out.push(hit(this.key, this.title, this.explanation, v === i - 1 ? 0.8 : 0.7, [v, i, end]));
      });
      return out;
    },
  },
  {
    key: 'dai-before-verb', title: 'ได้ + verb (got to; did)',
    explanation: 'ได้ before a verb says the action happened or was possible for the doer: เขาได้กินข้าว "he got to eat".',
    example: { th: 'เขาได้กินข้าว', en: 'He got to eat.' },
    nearMiss: ['เขากินข้าวได้'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        if (c.n(i) === 'ได้' && c.pos(i + 1, 'VERB') && !c.pos(i - 1, 'VERB') && c.n(i - 1) !== 'ไม่') out.push(hit(this.key, this.title, this.explanation, 0.7, [i, i + 1]));
      });
      return out;
    },
  },
  {
    key: 'modal-before-verb', title: 'ต้อง / ควร / อยาก + verb',
    explanation: 'ต้อง "must", ควร "should", อยาก "want to", อาจ "may" go straight before the verb: ฉันอยากไปตลาด "I want to go to the market".',
    example: { th: 'ฉันอยากไปตลาด', en: 'I want to go to the market.' },
    nearMiss: ['ฉันอยากได้รถ'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        if (MODALS.has(c.n(i)) && c.pos(i + 1, 'VERB')) out.push(hit(this.key, this.title, this.explanation, 0.85, [i, i + 1]));
      });
      return out;
    },
  },
  {
    key: 'passive-thuk', title: 'ถูก / โดน + verb (passive)',
    explanation: 'ถูก or โดน before a verb says something is done to the subject: เด็กถูกหมากัด "the child was bitten by a dog". The doer, if named, comes between.',
    example: { th: 'เด็กถูกหมากัด', en: 'The child was bitten by a dog.' },
    nearMiss: ['ของถูกมาก'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        if (c.n(i) !== 'ถูก' && c.n(i) !== 'โดน') return;
        if (c.pos(i + 1, 'VERB')) out.push(hit(this.key, this.title, this.explanation, 0.75, [i, i + 1]));
        else if (c.pos(i + 1, 'NOUN', 'PRON', 'PROPN') && c.pos(i + 2, 'VERB')) out.push(hit(this.key, this.title, this.explanation, 0.75, [i, i + 1, i + 2]));
      });
      return out;
    },
  },
  {
    key: 'causative-hai', title: 'ให้ / ทำให้ + person + verb (make, let)',
    explanation: 'ให้ or ทำให้ followed by a person and a verb means to have, let or make them do it: ฉันอยากให้เขาไป "I want him to go".',
    example: { th: 'ฉันอยากให้เขาไป', en: 'I want him to go.' },
    nearMiss: ['ฉันให้หนังสือเขา'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        const causeMake = c.n(i) === 'ทำให้';
        if (c.n(i) !== 'ให้' && !causeMake) return;
        if (!c.pos(i + 1, 'PRON', 'NOUN', 'PROPN')) return;
        if (c.pos(i + 2, 'VERB') || (causeMake && c.pos(i + 2, 'ADJ'))) {
          // after a noun or pronoun, ให้ is more often "for" (see benefactive-hai)
          if (!causeMake && c.pos(i - 1, 'NOUN', 'PRON', 'PROPN')) return;
          out.push(hit(this.key, this.title, this.explanation, causeMake ? 0.8 : 0.65, [i, i + 1, i + 2]));
        }
      });
      return out;
    },
  },
  {
    key: 'benefactive-hai', title: 'verb + … + ให้ + person (for someone)',
    explanation: 'ให้ after a verb and its object marks who it is done for: ฉันซื้อหนังสือให้เขา "I bought a book for him".',
    example: { th: 'ฉันซื้อหนังสือให้เขา', en: 'I bought a book for him.' },
    nearMiss: ['ฉันอยากให้เขาไป'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        if (c.n(i) !== 'ให้' || !c.pos(i + 1, 'PRON', 'NOUN', 'PROPN') || c.pos(i + 2, 'VERB')) return;
        let v = -1;
        for (let k = i - 1; k >= Math.max(0, i - 3); k--) {
          if (c.pos(k, 'VERB')) { v = k; break; }
          if (!c.pos(k, 'NOUN', 'PROPN', 'PRON')) break;
        }
        if (v >= 0) out.push(hit(this.key, this.title, this.explanation, 0.65, [v, i, i + 1]));
      });
      return out;
    },
  },
  {
    key: 'relative-thi', title: 'noun + ที่ + clause (who, which)',
    explanation: 'ที่ after a noun starts a clause that describes it: หนังสือที่ฉันอ่านสนุก "the book that I read is fun".',
    example: { th: 'หนังสือที่ฉันอ่านสนุก', en: 'The book that I read is fun.' },
    nearMiss: ['ฉันอยู่ที่บ้าน'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        if (c.n(i) !== 'ที่' || !c.pos(i - 1, 'NOUN')) return;
        if (c.pos(i + 1, 'NUM')) return; // ordinal (ordinal-thi)
        if (c.pos(i + 1, 'VERB', 'ADJ', 'PRON')) out.push(hit(this.key, this.title, this.explanation, 0.65, [i - 1, i, i + 1]));
      });
      return out;
    },
  },
  {
    key: 'complement-wa', title: 'verb + ว่า (that …)',
    explanation: 'ว่า after a verb of saying, thinking or knowing opens what is said or thought: ฉันคิดว่าเขาใจดี "I think he is kind".',
    example: { th: 'ฉันคิดว่าเขาใจดี', en: 'I think he is kind.' },
    nearMiss: ['ฉันกินข้าวเพราะว่าหิว'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        if (c.n(i) !== 'ว่า' || !c.pos(i - 1, 'VERB')) return;
        out.push(hit(this.key, this.title, this.explanation, SAYING.has(c.n(i - 1)) ? 0.85 : 0.55, [i - 1, i]));
      });
      return out;
    },
  },
  {
    key: 'comparative-kwa', title: 'adjective + กว่า (more … than)',
    explanation: 'กว่า after an adjective makes it a comparison, and the thing compared comes after: แมวเล็กกว่าหมา "the cat is smaller than the dog".',
    example: { th: 'แมวเล็กกว่าหมา', en: 'The cat is smaller than the dog.' },
    nearMiss: ['แมวเล็ก'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        if (c.n(i) !== 'กว่า') return;
        if (c.pos(i - 1, 'ADJ')) out.push(hit(this.key, this.title, this.explanation, 0.85, [i - 1, i]));
        else if (c.pos(i - 1, 'VERB')) out.push(hit(this.key, this.title, this.explanation, 0.7, [i - 1, i]));
        else if (c.unknown(i - 1)) out.push(hit(this.key, this.title, this.explanation, 0.5, [i - 1, i]));
      });
      return out;
    },
  },
  {
    key: 'superlative-thisut', title: 'adjective + ที่สุด (the most)',
    explanation: 'ที่สุด after an adjective means "the most": เขาเก่งที่สุด "he is the best".',
    example: { th: 'เขาเก่งที่สุด', en: 'He is the best.' },
    nearMiss: ['เขาเก่ง', 'ในที่สุดเขาก็กลับบ้าน'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        const whole = c.n(i) === 'ที่สุด';
        const split = c.n(i) === 'ที่' && c.n(i + 1) === 'สุด';
        if (!whole && !split) return;
        const last = split ? i + 1 : i;
        if (c.pos(i - 1, 'ADJ')) out.push(hit(this.key, this.title, this.explanation, 0.85, [i - 1, i, last]));
        else if (c.pos(i - 1, 'VERB')) out.push(hit(this.key, this.title, this.explanation, 0.7, [i - 1, i, last]));
      });
      return out;
    },
  },
  {
    key: 'classifier-demonstrative', title: 'noun + classifier + นี้ / นั้น (this, that)',
    explanation: 'The classifier carries นี้ "this" or นั้น "that" after the noun: หนังสือเล่มนี้ "this book".',
    example: { th: 'หนังสือเล่มนี้', en: 'This book.' },
    nearMiss: ['หนังสือสองเล่ม', 'ตัวเอง'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        if (!c.pos(i, 'CLF') || !THAI_DET.has(c.n(i + 1))) return;
        if (c.pos(i - 1, 'NUM')) return;
        if (c.pos(i - 1, 'NOUN')) out.push(hit(this.key, this.title, this.explanation, 0.8, [i - 1, i, i + 1]));
        else out.push(hit(this.key, this.title, this.explanation, 0.65, [i, i + 1])); // อันนี้ "this one"
      });
      return out;
    },
  },
  {
    key: 'reduplication-mai-yamok', title: 'ๆ (repeat the word)',
    explanation: 'ๆ says to read the word before it twice: เด็กๆ "children" (plural), ช้าๆ "slowly".',
    example: { th: 'เด็กๆ', en: 'Children.' },
    nearMiss: ['เด็ก'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((t, i) => {
        if (t.surface === 'ๆ' && i > 0) out.push(hit(this.key, this.title, this.explanation, 0.9, [i - 1, i]));
        else if (t.surface.length > 1 && t.surface.endsWith('ๆ')) out.push(hit(this.key, this.title, this.explanation, 0.9, [i]));
      });
      return out;
    },
  },
  {
    key: 'directional-after-verb', title: 'verb + ไป / มา / ขึ้น / ลง / เข้า / ออก (direction)',
    explanation: 'A direction word after a verb says which way the action goes: เขาเดินเข้าไป "he walks in".',
    example: { th: 'เขาเดินเข้าไป', en: 'He walks in.' },
    nearMiss: ['ฉันไปตลาด'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        if (!isDirectional(c.n(i)) || !c.pos(i - 1, 'VERB') || isDirectional(c.n(i - 1))) return;
        const idx = [i - 1, i];
        for (let k = i + 1; isDirectional(c.n(k)); k++) idx.push(k);
        out.push(hit(this.key, this.title, this.explanation, 0.7, idx));
      });
      return out;
    },
  },
  {
    key: 'conditional-tha-ko', title: 'ถ้า … ก็ … (if … then)',
    explanation: 'ถ้า opens the condition and ก็ often opens the result: ถ้าฉันหิว ฉันก็กิน "if I am hungry, I eat".',
    example: { th: 'ถ้าฉันหิว ฉันก็กิน', en: 'If I am hungry, I eat.' },
    nearMiss: ['ถ้าฉันหิว ฉันกิน'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        if (c.n(i) !== 'ถ้า') return;
        for (let k = i + 2; k < Math.min(c.tokens.length, i + 14); k++) {
          if (c.n(k) === 'ก็') { out.push(hit(this.key, this.title, this.explanation, 0.8, [i, k])); break; }
        }
      });
      return out;
    },
  },
  {
    key: 'cause-result-phro-chung', title: 'เพราะ … จึง … (because … so)',
    explanation: 'เพราะ gives the reason and จึง opens the result: เพราะฉันหิว ฉันจึงกินข้าว "because I was hungry, I ate".',
    example: { th: 'เพราะฉันหิว ฉันจึงกินข้าว', en: 'Because I was hungry, I ate.' },
    nearMiss: ['ฉันกินข้าวเพราะหิว'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        if (c.n(i) !== 'เพราะ') return;
        for (let k = i + 2; k < Math.min(c.tokens.length, i + 14); k++) {
          if (c.n(k) === 'จึง') { out.push(hit(this.key, this.title, this.explanation, 0.85, [i, k])); break; }
        }
      });
      return out;
    },
  },
  {
    key: 'nominalizer-kan', title: 'การ + verb (the act of …ing)',
    explanation: 'การ before a verb makes it a noun for the activity: การอ่านหนังสือสนุก "reading is fun".',
    example: { th: 'การอ่านหนังสือสนุก', en: 'Reading is fun.' },
    nearMiss: ['ฉันอ่านหนังสือ'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        if (c.n(i) === 'การ' && c.pos(i + 1, 'VERB')) out.push(hit(this.key, this.title, this.explanation, 0.7, [i, i + 1]));
      });
      return out;
    },
  },
  {
    key: 'yes-no-question', title: 'ไหม / หรือเปล่า / ใช่ไหม (yes-no question)',
    explanation: 'A statement becomes a yes-no question with ไหม at the end: คุณหิวไหม "are you hungry?". หรือเปล่า "or not?" and ใช่ไหม "right?" work the same way.',
    example: { th: 'คุณหิวไหม', en: 'Are you hungry?' },
    nearMiss: ['คุณหิว'],
    detect(c) {
      const out: PatternCandidate[] = [];
      let end = c.lastWord;
      if (end >= 1 && POLITE_END.has(c.n(end))) end--; // ไหมคะ, หรือเปล่าครับ
      if (end < 0) return out;
      const w = c.n(end);
      if ((w === 'ไหม' || w === 'มั้ย') && end > 0) {
        out.push(hit(this.key, this.title, this.explanation, 0.85, c.n(end - 1) === 'ใช่' ? [end - 1, end] : [end]));
      } else if (w === 'เปล่า' && c.n(end - 1) === 'หรือ') {
        out.push(hit(this.key, this.title, this.explanation, 0.85, [end - 1, end]));
      }
      return out;
    },
  },
  {
    key: 'question-word-in-place', title: 'question words stay in place',
    explanation: 'A question word sits where the answer would be, with no change of word order: คุณชอบกินอะไร "what do you like to eat?".',
    example: { th: 'คุณชอบกินอะไร', en: 'What do you like to eat?' },
    nearMiss: ['คุณชอบกินข้าว'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        if (!c.tokens[i].isWord || !QUESTION_WORDS.has(c.n(i))) return;
        // after a negative, อะไร / ใคร / ที่ไหน mean "nothing / nobody / nowhere", not a question
        const negated = c.n(i - 1) === 'ไม่' || c.n(i - 1) === 'ไม่มี';
        out.push(hit(this.key, this.title, this.explanation, negated ? 0.5 : 0.8, [i]));
      });
      return out;
    },
  },
  {
    key: 'ordinal-thi', title: 'ที่ + number (first, second …)',
    explanation: 'ที่ before a number makes it an ordinal: ฉันเป็นลูกคนที่สอง "I am the second child".',
    example: { th: 'ฉันเป็นลูกคนที่สอง', en: 'I am the second child.' },
    nearMiss: ['ฉันอยู่ที่บ้าน'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        if (c.n(i) === 'ที่' && c.pos(i + 1, 'NUM') && !c.pos(i + 2, 'CLF')) out.push(hit(this.key, this.title, this.explanation, 0.7, [i, i + 1]));
      });
      return out;
    },
  },
  {
    key: 'prohibition-ya', title: 'อย่า + verb (do not)',
    explanation: 'อย่า before a verb forbids it: อย่ากลัว "do not be afraid".',
    example: { th: 'อย่ากลัว', en: 'Do not be afraid.' },
    nearMiss: ['ฉันไม่กลัว'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        if (c.n(i) === 'อย่า' && c.pos(i + 1, 'VERB', 'ADJ')) out.push(hit(this.key, this.title, this.explanation, 0.85, [i, i + 1]));
      });
      return out;
    },
  },
  {
    key: 'not-at-all-mai-loei', title: 'ไม่ … เลย (not at all)',
    explanation: 'ไม่ … เลย wraps a verb or adjective to mean "not at all": ฉันไม่หิวเลย "I am not hungry at all".',
    example: { th: 'ฉันไม่หิวเลย', en: 'I am not hungry at all.' },
    nearMiss: ['ฉันไม่หิว'],
    detect(c) {
      const out: PatternCandidate[] = [];
      c.tokens.forEach((_, i) => {
        if (c.n(i) !== 'เลย') return;
        for (let k = i - 1; k >= Math.max(0, i - 5); k--) {
          if (c.n(k) === 'ไม่' || c.n(k) === 'ไม่มี') { out.push(hit(this.key, this.title, this.explanation, 0.8, [k, i])); break; }
        }
      });
      return out;
    },
  },
];

/**
 * The five detectors of the first seed, behaviour unchanged (royal ทรง, ไม่ + verb, number + classifier, final
 * particle, ความ + word). Emitted first and in token order, as before.
 */
export function baseConstructions(tokens: RawToken[], analyses: AnalyzedToken[], finalParticles: readonly string[]): PatternCandidate[] {
  const out: PatternCandidate[] = [];
  const lastWord = (() => { for (let k = tokens.length - 1; k >= 0; k--) if (tokens[k].isWord) return k; return -1; })();
  analyses.forEach((a, i) => {
    const c = a.candidates[0];
    if (!c) return;
    const w = tokens[i].normalized;
    if (w === 'ทรง' && hasPos(analyses[i + 1], 'VERB')) {
      out.push({ key: 'royal-verb', title: 'ทรง + verb (royal/divine register)', confidence: 0.85, tokenIndexes: [i, i + 1],
        explanation: 'ทรง goes before a verb when the doer is God or royalty: พระเจ้าทรงรักโลก "God loves the world".' });
    }
    if (w === 'ไม่' && i + 1 < tokens.length && hasPos(analyses[i + 1], 'VERB', 'AUX', 'ADJ')) {
      out.push({ key: 'negation-mai', title: 'ไม่ + verb/adjective', confidence: 0.85, tokenIndexes: [i, i + 1],
        explanation: 'ไม่ goes directly before the word it negates: ไม่เข้าใจ "do not understand".' });
    }
    if (c.pos === 'CLF' && ((i > 0 && analyses[i - 1]?.candidates[0]?.pos === 'NUM') || tokens[i + 1]?.normalized === 'เดียว' || (i > 0 && hasPos(analyses[i - 1], 'NUM')))) {
      out.push({ key: 'classifier-phrase', title: 'Number + classifier', confidence: Math.min(0.8, c.confidence), tokenIndexes: [i > 0 && hasPos(analyses[i - 1], 'NUM') ? i - 1 : i, i],
        explanation: 'Counting uses noun + number + classifier: หนังสือสองเล่ม "two books"; องค์เดียว "one (divine) person".' });
    }
    if (i === lastWord && c.pos === 'PART' && finalParticles.includes(w)) {
      out.push({ key: 'final-particle', title: 'Sentence-final particle', confidence: c.confidence, tokenIndexes: [i],
        explanation: 'ครับ / ค่ะ / คะ / นะ / ไหม close a sentence: they add politeness or mark a question.' });
    }
    if (w === 'ความ' && i + 1 < tokens.length && tokens[i + 1].isWord) {
      out.push({ key: 'nominalizer-khwam', title: 'ความ + word (abstract noun)', confidence: 0.7, tokenIndexes: [i, i + 1],
        explanation: 'ความ turns a verb or adjective into an abstract noun: ความจริง "truth" (from จริง "true").' });
    }
  });
  return out;
}

/** All constructions found in one sentence: the five original detectors first, then the rest in token order. */
export function detectThaiConstructions(tokens: RawToken[], analyses: AnalyzedToken[], finalParticles: readonly string[]): PatternCandidate[] {
  const base = baseConstructions(tokens, analyses, finalParticles);
  const ctx = makeCtx(tokens, analyses);
  const more = THAI_CONSTRUCTIONS.flatMap((k) => k.detect(ctx))
    .sort((a, b) => a.tokenIndexes[0] - b.tokenIndexes[0] || a.key.localeCompare(b.key));
  // one report per construction and span
  const seen = new Set<string>();
  const unique = more.filter((p) => { const id = `${p.key}|${p.tokenIndexes.join(',')}`; if (seen.has(id)) return false; seen.add(id); return true; });
  return [...base, ...unique];
}
