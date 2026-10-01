/**
 * Thai phrase units: words that always travel together or whose meaning is not the sum of the parts. The
 * segmenter splits most of them, so a unit is matched on the tokens ICU gives for the unit written alone (the
 * parts are derived from the segmenter at load time, not typed). The phrase's identity (`pattern`) is the written
 * form, so it does not change if a segmenter update changes the parts.
 *
 * Machine-drafted, not native-reviewed; only units that were certain are listed.
 */
import type { RawToken } from '../../core';
import type { PhraseRule } from '../shared';

type Kind = PhraseRule['kind'];
/** `alt`: other ways the segmenter splits the unit in running text (it keeps some whole when written alone). */
type Unit = readonly [form: string, gloss: string, kind: Kind, alt?: readonly (readonly string[])[]];

export const PHRASE_UNITS: readonly Unit[] = [
  // going and doing
  ['ไปหา', 'go to see (a person)', 'collocation', [['ไป', 'หา']]],
  ['ไปเที่ยว', 'go out for fun, go travelling', 'collocation'],
  ['กลับบ้าน', 'go home', 'collocation'],
  ['ไปโรงเรียน', 'go to school', 'collocation'],
  ['กินข้าว', 'to eat (a meal)', 'collocation'],
  ['อาบน้ำ', 'to bathe, to shower', 'collocation'],
  ['แปรงฟัน', 'to brush one\'s teeth', 'collocation'],
  ['ตื่นนอน', 'to wake up', 'collocation'],
  ['นอนหลับ', 'to sleep, to fall asleep', 'collocation'],
  ['อ่านหนังสือ', 'to read; to study', 'collocation'],
  ['เรียนหนังสือ', 'to study (at school)', 'collocation'],
  ['ทำการบ้าน', 'to do homework', 'collocation'],
  ['ลองดู', 'to try (and see)', 'formula'],
  // feelings (verb + ใจ)
  ['เป็นห่วง', 'to worry about; to care for', 'collocation'],
  ['มีความสุข', 'to be happy', 'collocation'],
  ['ให้อภัย', 'to forgive', 'collocation'],
  ['ไม่สบาย', 'unwell', 'collocation'],
  // questions
  ['เป็นอย่างไร', 'how is it?', 'formula'],
  ['เป็นยังไง', 'how is it? (colloquial)', 'formula'],
  ['เท่าไหร่', 'how much?', 'formula'],
  ['เมื่อไหร่', 'when?', 'formula'],
  ['ยังไง', 'how? (colloquial)', 'formula'],
  ['ใช่ไหม', 'right? (tag question)', 'formula'],
  ['หรือเปล่า', 'or not? (yes/no question)', 'formula'],
  // everyday formulas
  ['ไม่เป็นไร', 'never mind; it is nothing', 'formula'],
  ['ไม่มีอะไร', 'nothing; you are welcome', 'formula'],
  ['ขอบคุณมาก', 'thank you very much', 'formula'],
  ['ยินดีที่ได้รู้จัก', 'nice to meet you', 'formula'],
  ['ยินดีต้อนรับ', 'welcome', 'formula'],
  ['สบายดี', 'well, fine', 'formula'],
  ['ลาก่อน', 'goodbye', 'formula'],
  ['ช่วยด้วย', 'help!', 'formula'],
  ['ขอให้', 'may; I hope that', 'formula'],
  ['ก็แล้วกัน', 'so be it; fine then', 'formula'],
  ['อะไรก็ได้', 'anything at all', 'formula'],
  ['ใครก็ได้', 'anyone at all', 'formula'],
  ['ไม่มีใคร', 'nobody', 'formula'],
  // adverbs and degree
  ['ด้วยกัน', 'together', 'collocation'],
  ['เหมือนกัน', 'the same; likewise', 'collocation'],
  ['อีกครั้ง', 'once more', 'collocation'],
  ['นิดหน่อย', 'a little', 'collocation'],
  ['เกือบจะ', 'almost', 'collocation'],
  ['ในที่สุด', 'finally, in the end', 'collocation'],
  ['ทุกวัน', 'every day', 'collocation'],
  ['ตลอดเวลา', 'all the time', 'collocation'],
  ['ตลอดไป', 'for ever', 'collocation'],
  ['ต่อไป', 'next; from now on; to continue', 'collocation'],
  ['อย่างนี้', 'like this', 'collocation'],
  ['อย่างนั้น', 'like that', 'collocation'],
  // negation and aspect combinations
  ['ไม่ค่อย', 'not very, not often', 'construction'],
  ['ไม่เคย', 'never', 'construction'],
  ['ยังไม่', 'not yet', 'construction'],
  ['ไม่ได้', 'did not; cannot', 'construction'],
  // connectives
  ['แล้วก็', 'and then', 'collocation'],
  ['แต่ว่า', 'but', 'collocation'],
  ['เพราะว่า', 'because', 'collocation'],
  ['เพราะฉะนั้น', 'therefore', 'collocation'],
  ['ถึงแม้ว่า', 'even though', 'collocation'],
  ['ถึงแม้', 'even though', 'collocation'],
  ['อย่างไรก็ตาม', 'however', 'collocation'],
  ['ทั้งๆที่', 'even though; despite the fact that', 'collocation'],
  ['ก่อนที่', 'before (+ clause)', 'collocation'],
  ['หลังจาก', 'after', 'collocation'],
  ['ขณะที่', 'while', 'collocation'],
  ['เกี่ยวกับ', 'about, concerning', 'collocation'],
];

/** The five units of the first seed (these keep their original pattern identity). */
export const BASE_PHRASE_RULES: PhraseRule[] = [
  { pattern: ['ตอน', 'เด็ก'], display: 'ตอน…เด็ก', gloss: 'when (I was) young', kind: 'formula',
    variants: [['ตอน', { gap: 3, only: ['SCONJ', 'PRON', 'ADV', 'PART'] }, 'เด็ก']] },
  { pattern: ['เริ่ม', 'เข้าใจ'], display: 'เริ่มเข้าใจ', gloss: 'begin to understand', kind: 'construction',
    variants: [['เริ่ม', 'เข้าใจ']] },
  { pattern: ['เชื่อ', 'ใน', '_'], display: 'เชื่อใน…', gloss: 'to believe in', kind: 'frame',
    variants: [['เชื่อ', 'ใน', { slot: true }]] },
  { pattern: ['ยก', 'โทษ'], display: 'ยกโทษ', gloss: 'to forgive', kind: 'collocation', variants: [['ยก', 'โทษ']] },
  { pattern: ['ยก', 'บาป'], display: 'ยกบาป', gloss: 'to forgive sins (take sin away)', kind: 'collocation', variants: [['ยก', 'บาป']] },
];

/** The parts the segmenter gives for a unit written alone. */
export function phraseParts(form: string, tokenize: (text: string) => RawToken[]): string[] {
  return tokenize(form).map((t) => t.normalized);
}

/** Phrase rules for the units above, parts taken from the given tokenizer. */
export function buildPhraseRules(tokenize: (text: string) => RawToken[]): PhraseRule[] {
  const rules: PhraseRule[] = [...BASE_PHRASE_RULES];
  for (const [form, gloss, kind, alt] of PHRASE_UNITS) {
    const parts = phraseParts(form, tokenize);
    // a unit the segmenter keeps whole is a lexicon word, not a phrase, unless running text splits it (alt)
    const variants = [...(parts.length > 1 ? [parts] : []), ...(alt ?? []).map((p) => [...p])];
    if (variants.length) rules.push({ pattern: [form], display: form, gloss, kind, variants });
  }
  return rules;
}
