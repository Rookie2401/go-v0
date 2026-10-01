/**
 * Function words, each with a `role` in plain words: aspect and modal markers, negation, question words and
 * particles, polite and mood particles, connectives, relative and complement markers, prepositions, pronouns and
 * kin terms. Words outside ordinary contemporary Central Thai carry a `register` tag.
 *
 * Machine-drafted, not native-reviewed. Words the lexicon in th.ts already holds (ฉัน จะ ได้ ก็ ครับ …) are not
 * repeated here: they get their role and register through ANNOTATE_EXISTING. Multi-token connectives (แล้วก็
 * เพราะว่า แต่ว่า อย่างไรก็ตาม …) are phrase units (phrases.ts), because the segmenter splits them.
 */
import type { PartOfSpeech, RegisterTag } from '../../core';
import { buildRows, mergeAnnotations, type ThaiAnnotation, type ThaiRow } from './entries';

const C: RegisterTag[] = ['colloquial'];
const F: RegisterTag[] = ['formal'];

const ROWS: ThaiRow[] = [
  // ── aspect and modal markers
  ['กำลัง', 'AUX', 'in the middle of (doing)', { role: 'progressive marker' }],
  ['เคย', 'AUX', 'to have ever; used to', { role: 'experience marker' }],
  ['ต้อง', 'AUX', 'must, have to', { role: 'obligation marker' }],
  ['ควร', 'AUX', 'should, ought to', { role: 'advice marker' }],
  ['อาจ', 'AUX', 'may, might', { role: 'possibility marker' }],
  ['น่าจะ', 'AUX', 'probably; ought to', { role: 'probability marker' }],
  ['คง', 'AUX', 'probably, surely', { role: 'probability marker' }],
  ['เพิ่ง', 'ADV', 'just (a moment ago)', { role: 'just-happened marker' }],
  ['กว่า', 'ADP', 'more than; -er', { role: 'comparative marker' }],
  ['การ', 'NOUN', '(prefix: the act of …-ing)', { role: 'noun-forming prefix' }],
  ['ถูก', 'AUX', '(passive: to be done to)', { role: 'passive marker' }],
  ['โดน', 'AUX', '(passive, usually for bad events)', { role: 'passive marker' }],
  // ── negation and answers
  ['อย่า', 'AUX', 'do not (command)', { role: 'prohibition marker' }],
  ['มิ', 'PART', 'not (written)', { role: 'negation', register: F }],
  ['ใช่', 'INTJ', 'yes; that is right', { role: 'agreement' }],
  ['เปล่า', 'INTJ', 'no, not so (denying)', { role: 'denial' }],
  // ── question words and particles
  ['ใคร', 'PRON', 'who', { role: 'question word' }],
  ['ไหน', 'PRON', 'which; where', { role: 'question word' }],
  ['กี่', 'DET', 'how many (before a classifier)', { role: 'question word' }],
  ['ไร', 'PRON', 'what (short form of อะไร)', { role: 'question word', register: C }],
  ['ไง', 'ADV', 'how (short form of อย่างไร)', { role: 'question word', register: C }],
  ['มั้ย', 'PART', '(yes/no question particle, informal spelling of ไหม)', { role: 'question particle', register: C }],
  ['หรือ', 'CONJ', 'or; (also ends a yes/no question)', { role: 'or-connective' }],
  ['ล่ะ', 'PART', '(what about…? / emphasis)', { role: 'follow-up particle' }],
  ['ละ', 'PART', '(short form of ล่ะ or แล้ว)', { role: 'follow-up particle', register: C }],
  // ── polite and mood particles
  ['จ้ะ', 'PART', '(friendly polite particle)', { role: 'friendly particle', register: C }],
  ['จ๊ะ', 'PART', '(friendly polite particle)', { role: 'friendly particle', register: C }],
  ['ฮะ', 'PART', '(casual form of ครับ)', { role: 'polite particle', register: C }],
  ['ซิ', 'PART', '(urging particle)', { role: 'urging particle', register: C }],
  ['ซะ', 'PART', '(urging: go ahead and …)', { role: 'urging particle', register: C }],
  ['เถอะ', 'PART', '(urging: go on; let us)', { role: 'urging particle' }],
  ['หรอก', 'PART', '(softens a denial)', { role: 'softening particle', register: C }],
  ['เลย', 'PART', '(emphasis: at all; right away; very)', { role: 'emphasis particle' }],
  ['น่ะ', 'PART', '(stressing or explaining particle)', { role: 'stress particle', register: C }],
  ['แหละ', 'PART', '(that is it; exactly)', { role: 'confirming particle', register: C }],
  // ── connectives and discourse markers
  ['จึง', 'CONJ', 'so, therefore', { role: 'result connective' }],
  ['ดังนั้น', 'CONJ', 'therefore, so', { role: 'result connective', register: F }],
  ['แม้', 'SCONJ', 'although; even if', { role: 'concession connective' }],
  ['แม้ว่า', 'SCONJ', 'although; even if', { role: 'concession connective' }],
  ['เมื่อ', 'SCONJ', 'when (a point in time)', { role: 'time connective' }],
  ['ก่อน', 'ADP', 'before; first', { role: 'time word' }],
  ['ส่วน', 'CONJ', 'as for; whereas', { role: 'contrast connective' }],
  ['หาก', 'SCONJ', 'if', { role: 'condition connective', register: F }],
  ['อนึ่ง', 'CONJ', 'furthermore', { role: 'added-point connective', register: F }],
  ['ฤๅ', 'CONJ', 'or', { role: 'or-connective', register: ['literary', 'archaic'] }],
  ['ครั้น', 'SCONJ', 'when', { role: 'time connective', register: ['literary'] }],
  // ── relative and complement markers
  ['ซึ่ง', 'SCONJ', 'which, that', { role: 'relative marker', register: F }],
  ['อัน', 'SCONJ', 'which, that', { role: 'relative marker', register: F }],
  // ── prepositions
  ['สำหรับ', 'ADP', 'for; as for', { role: 'preposition' }],
  ['กับ', 'ADP', 'with; and', { role: 'preposition' }],
  ['ต่อ', 'ADP', 'to, toward; against', { role: 'preposition' }],
  ['โดย', 'ADP', 'by; by means of', { role: 'preposition' }],
  ['ตาม', 'ADP', 'according to; along', { role: 'preposition' }],
  ['บน', 'ADP', 'on, above', { role: 'preposition' }],
  ['ใต้', 'ADP', 'under, below', { role: 'preposition' }],
  ['นอก', 'ADP', 'outside', { role: 'preposition' }],
  ['ระหว่าง', 'ADP', 'between; during', { role: 'preposition' }],
  ['หลัง', 'ADP', 'after, behind', { role: 'preposition' }],
  ['แทน', 'ADP', 'instead of', { role: 'preposition' }],
  ['ตั้งแต่', 'ADP', 'since, from (a time)', { role: 'preposition' }],
  ['ภายใน', 'ADP', 'within, inside', { role: 'preposition', register: F }],
  ['ณ', 'ADP', 'at', { role: 'preposition', register: F }],
  ['แห่ง', 'ADP', 'of', { role: 'preposition', register: F }],
  ['แก่', 'ADP', 'to (a person)', { role: 'preposition', register: F }],
  ['สู่', 'ADP', 'to, into', { role: 'preposition', register: F }],
  // ── pronouns
  ['เขา', 'PRON', 'he, she, they', { role: 'third-person pronoun' }],
  ['มัน', 'PRON', 'it; he, she (rude)', { role: 'third-person pronoun' }],
  ['เธอ', 'PRON', 'she; you (to an equal)', { role: 'pronoun' }],
  ['ท่าน', 'PRON', 'you, he, she (respectful)', { role: 'respectful pronoun', register: F }],
  ['ข้าพเจ้า', 'PRON', 'I (written, formal)', { role: 'first-person pronoun', register: F }],
  ['ดิฉัน', 'PRON', 'I (woman, formal)', { role: 'first-person pronoun', register: F }],
  ['กระผม', 'PRON', 'I (man, very polite)', { role: 'first-person pronoun', register: F }],
  ['หนู', 'PRON', 'I, you (to or from a child)', { role: 'child-directed pronoun', register: ['child-directed'] }],
  ['กู', 'PRON', 'I (very rude or intimate)', { role: 'first-person pronoun', register: ['slang'] }],
  ['มึง', 'PRON', 'you (very rude or intimate)', { role: 'second-person pronoun', register: ['slang'] }],
  ['ข้า', 'PRON', 'I (old style)', { role: 'first-person pronoun', register: ['archaic'] }],
  ['เจ้า', 'PRON', 'you, he, she (old or literary)', { role: 'pronoun', register: ['archaic', 'literary'] }],
  // ── kin terms (also used as "you" and "I")
  ['พี่', 'NOUN', 'older sibling', { role: 'kin term, also "you" or "I" to someone older' }],
  ['น้อง', 'NOUN', 'younger sibling', { role: 'kin term, also "you" or "I" to someone younger' }],
  ['ลุง', 'NOUN', 'uncle (parent\'s older brother); older man', { role: 'kin term, also used for an older man' }],
  ['ป้า', 'NOUN', 'aunt (parent\'s older sister); older woman', { role: 'kin term, also used for an older woman' }],
  ['น้า', 'NOUN', 'mother\'s younger brother or sister', { role: 'kin term' }],
  ['อา', 'NOUN', 'father\'s younger brother or sister', { role: 'kin term' }],
  ['ยาย', 'NOUN', 'grandmother (mother\'s mother)', { role: 'kin term' }],
  ['ปู่', 'NOUN', 'grandfather (father\'s father)', { role: 'kin term' }],
  ['ย่า', 'NOUN', 'grandmother (father\'s mother)', { role: 'kin term' }],
  // ── royal and religious vocabulary
  ['เสด็จ', 'VERB', 'to go, to come (royal)', { role: 'royal verb', register: ['royal'] }],
  ['พระ', 'NOUN', 'monk; Buddha image; royal or holy (prefix)', { role: 'royal or holy prefix', register: ['royal', 'religious'] }],
  ['ถวาย', 'VERB', 'to offer (to royalty, monks or God)', { role: 'royal or religious verb', register: ['royal', 'religious'] }],
  ['รับสั่ง', 'VERB', 'to say, to command (royal)', { role: 'royal verb', register: ['royal'] }],
  ['พระราชทาน', 'VERB', 'to grant (royal)', { role: 'royal verb', register: ['royal'] }],
  ['อาตมา', 'PRON', 'I (a monk speaking)', { role: 'first-person pronoun', register: ['religious'] }],
  ['โยม', 'PRON', 'you, I (a lay person with a monk)', { role: 'pronoun', register: ['religious'] }],
  // ── regional words (each carries its tag)
  ['บ่', 'ADV', 'not (Isan)', { role: 'negation', register: ['regional-isan'] }],
  ['ข้อย', 'PRON', 'I (Isan)', { role: 'first-person pronoun', register: ['regional-isan'] }],
  ['เด้อ', 'PART', '(Isan particle, like นะ)', { role: 'softening particle', register: ['regional-isan'] }],
  ['หยัง', 'PRON', 'what (Isan)', { role: 'question word', register: ['regional-isan'] }],
  ['ไส', 'PRON', 'where (Isan)', { role: 'question word', register: ['regional-isan'] }],
  ['หรอย', 'ADJ', 'delicious (southern)', { register: ['regional-south'] }],
  ['แหลง', 'VERB', 'to speak (southern)', { register: ['regional-south'] }],
  ['กิ๋น', 'VERB', 'to eat (northern)', { register: ['regional-north'] }],
  ['แอ่ว', 'VERB', 'to go out, to visit for fun (northern)', { register: ['regional-north'] }],
  ['จ๊าด', 'ADV', 'very (northern)', { register: ['regional-north'] }],
  // ── other varieties
  ['หม่ำ', 'VERB', 'to eat (said to children)', { register: ['child-directed'] }],
];

/** Roles and registers for words the hand lexicon in th.ts already holds (keyed lemma|pos). */
export const ANNOTATE_EXISTING: Array<[lemma: string, pos: PartOfSpeech, note: ThaiAnnotation]> = [
  ['ฉัน', 'PRON', { role: 'first-person pronoun' }],
  ['ผม', 'PRON', { role: 'first-person pronoun (men)' }],
  ['เรา', 'PRON', { role: 'first-person pronoun (we, or I)' }],
  ['คุณ', 'PRON', { role: 'second-person pronoun (polite)' }],
  ['อะไร', 'PRON', { role: 'question word' }],
  ['พระองค์', 'PRON', { role: 'royal or divine pronoun', register: ['royal', 'religious'] }],
  ['พระเจ้า', 'PROPN', { register: ['religious'] }],
  ['พระบุตร', 'NOUN', { register: ['religious'] }],
  ['ทรง', 'AUX', { role: 'royal or divine verb marker', register: ['royal', 'religious'] }],
  ['ประทาน', 'VERB', { role: 'royal or divine verb', register: ['royal', 'religious'] }],
  ['โปรด', 'VERB', { register: ['royal', 'religious'] }],
  ['จะ', 'AUX', { role: 'future marker' }],
  ['ได้', 'AUX', { role: 'ability marker, or "got to"' }],
  ['อยาก', 'AUX', { role: 'wish marker' }],
  ['อยู่', 'AUX', { role: 'continuing-state marker' }],
  ['ยัง', 'ADV', { role: 'still / not-yet marker' }],
  ['แล้ว', 'ADV', { role: 'completed or changed-state marker' }],
  ['ด้วย', 'ADV', { role: 'also / together marker' }],
  ['เอง', 'ADV', { role: 'emphasis (oneself)' }],
  ['ไม่', 'PART', { role: 'negation' }],
  ['ก็', 'PART', { role: 'linking particle' }],
  ['ครับ', 'PART', { role: 'polite particle (man speaking)' }],
  ['ค่ะ', 'PART', { role: 'polite particle (woman, statements)' }],
  ['คะ', 'PART', { role: 'polite particle (woman, questions)' }],
  ['ไหม', 'PART', { role: 'question particle (yes/no)' }],
  ['นะ', 'PART', { role: 'softening particle' }],
  ['สิ', 'PART', { role: 'urging particle' }],
  ['เหรอ', 'PART', { role: 'checking question particle', register: ['colloquial'] }],
  ['ทำไม', 'ADV', { role: 'question word (why)' }],
  ['ที่', 'SCONJ', { role: 'relative or complement marker' }],
  ['ว่า', 'SCONJ', { role: 'complement marker (that)' }],
  ['เพื่อ', 'SCONJ', { role: 'purpose connective' }],
  ['ถ้า', 'SCONJ', { role: 'condition connective' }],
  ['เพราะ', 'CONJ', { role: 'reason connective' }],
  ['แต่', 'CONJ', { role: 'contrast connective' }],
  ['และ', 'CONJ', { role: 'and-connective' }],
  ['จน', 'CONJ', { role: 'extent connective (until, so that)' }],
  ['ของ', 'ADP', { role: 'preposition (of, belonging to)' }],
  ['ใน', 'ADP', { role: 'preposition' }],
  ['จาก', 'ADP', { role: 'preposition' }],
  ['ให้', 'ADP', { role: 'benefactive marker (for, to)' }],
  ['ให้', 'VERB', { role: 'giving or causing' }],
  ['ความ', 'NOUN', { role: 'noun-forming prefix' }],
  ['คน', 'CLF', { counts: 'people' }],
  ['ตัว', 'CLF', { counts: 'animals, letters, clothes, furniture' }],
  ['อัน', 'CLF', { counts: 'small objects in general' }],
  ['เล่ม', 'CLF', { counts: 'books, knives' }],
  ['องค์', 'CLF', { counts: 'royalty, deities, monks, holy images' }],
  ['หลัง', 'CLF', { counts: 'houses, buildings' }],
  ['เรื่อง', 'CLF', { counts: 'stories, matters' }],
  ['ครั้ง', 'NOUN', { counts: 'times, occasions' }],
];

const built = buildRows(ROWS);
export const FUNCTION_ROWS: readonly ThaiRow[] = ROWS;
export const FUNCTION_ENTRIES = built.entries;
export const FUNCTION_ANNOTATIONS = mergeAnnotations(
  built.annotations,
  new Map(ANNOTATE_EXISTING.map(([lemma, pos, note]) => [`${lemma}|${pos}`, note] as const)),
);
