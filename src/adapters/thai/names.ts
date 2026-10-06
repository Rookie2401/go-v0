/**
 * When is an ordinary Thai word a given name? (adapter-th@4; machine-drafted, not native-reviewed.)
 *
 * The course cast has names that are also everyday words: ต้น "tree; classifier", มะลิ "jasmine", บอล "ball", แดง "red", เล็ก
 * "small". The ladder gate counts a proper noun as known, so reading a word as a name has a cost: it must happen only where
 * the text shows a name. The rule, in the order it is tried (the first that holds decides):
 *  1. a title or kin term right before: คุณต้น, น้องมะลิ, ป้าแดง, ลุงเล็ก, ครูบอล, พ่อบอล; and ชื่อ (ผมชื่อต้น, ฉันชื่อมะลิ);
 *  2. joined by กับ / และ to another name of the cast (แซมกับมะลิ, ต้นและบอล);
 *  3. the SUBJECT of a clause: no word before it, or only a clause opener (a time word, a conjunction, an adverb: วันนี้,
 *     เพราะ, แต่, ก็ …), and a predicate right after it: a verb or auxiliary (บอลอยู่ที่บ้าน, ต้นไม่นอน, มะลิทำงาน), a
 *     polite particle (ต้นครับ), or an adjective that only a person can be (บอลหิว, ต้นเหนื่อย, มะลิป่วย).
 * Everything else keeps the everyday reading: ต้นไม้สูง, สามต้น, ต้นนี้, สีแดง, ไข่แดง, ลูกบอล, น้องเล็ก, ผมเห็นบอล. A name is
 * therefore sometimes read as a word (ผมเจอบอลที่ตลาด; ต้นสูง "Ton is tall" / "the tree is tall") and a word as a name
 * (ต้นมีผลมาก "the tree has much fruit"): the first is the safer error for the gate, because it costs a lemma at most.
 * A sentence in which the name is not obvious should write ชื่อ or a title first.
 */
import type { AnalysisCandidate, RawToken } from '../../core';

/** Names that are also words: the everyday reading comes first, the PROPN reading is moved up only where `readsAsName` holds. */
export const CAST_NAMES: ReadonlySet<string> = new Set(['ต้น', 'มะลิ', 'บอล', 'แดง', 'เล็ก']);
/** Names with no everyday reading (PROPN only in the lexicon). */
const SURE_NAMES: ReadonlySet<string> = new Set(['แซม', 'สมชาย', 'เอมี่', 'มาร์ค']);

/** A title, kin term or the word "name" directly before a given name. (ตา is left out: ตาแดง is "red eyes".) */
const TITLES: ReadonlySet<string> = new Set([
  'คุณ', 'น้อง', 'พี่', 'ป้า', 'ลุง', 'น้า', 'อา', 'ยาย', 'ปู่', 'ย่า', 'ครู', 'คุณครู', 'อาจารย์', 'หมอ', 'คุณหมอ', 'หนู', 'ชื่อ',
  'นาย', 'นาง', 'นางสาว', 'แม่', 'พ่อ',
]);
/** Titles after which a word is still its ordinary self: น้องเล็ก "the youngest sibling", พี่เล็ก, หนูเล็ก, แม่เล็ก. */
const NOT_BEFORE: Readonly<Record<string, ReadonlySet<string>>> = {
  เล็ก: new Set(['น้อง', 'พี่', 'หนู', 'แม่', 'พ่อ']),
};

const JOINERS: ReadonlySet<string> = new Set(['กับ', 'และ']);
/** Clause openers: a word before the subject that does not take it as its object. */
const OPENER_POS: ReadonlySet<string> = new Set(['ADV', 'CONJ', 'SCONJ', 'INTJ']);
const OPENERS: ReadonlySet<string> = new Set(['ก็', 'แล้ว', 'เมื่อ', 'ตอนนี้', 'เช้า', 'บ่าย', 'เย็น', 'คืน']);
/** Words after a subject that start its predicate although they are not verbs. */
const PREDICATE_STARTERS: ReadonlySet<string> = new Set(['ไม่', 'จะ', 'ยัง', 'กำลัง', 'ก็', 'เพิ่ง', 'ได้', 'ครับ', 'ค่ะ', 'คะ']);
/** Adjectives of a person's state: a ball is not hungry. */
const PERSON_STATES: ReadonlySet<string> = new Set(['หิว', 'ป่วย', 'เหนื่อย', 'ง่วง', 'อิ่ม', 'สบาย', 'กลัว', 'โกรธ', 'ดีใจ', 'เสียใจ', 'เหงา', 'กังวล', 'ตกใจ', 'สนุก']);

const word = (tokens: RawToken[], i: number): string => (tokens[i]?.isWord ? tokens[i].normalized : '');

export function readsAsName(i: number, tokens: RawToken[], base: AnalysisCandidate[][]): boolean {
  const w = word(tokens, i);
  const before = word(tokens, i - 1);
  // 1. a title / kin term / ชื่อ right before
  if (before && TITLES.has(before) && !NOT_BEFORE[w]?.has(before)) return true;
  // 2. joined to another name of the cast
  const isCast = (j: number): boolean => CAST_NAMES.has(word(tokens, j)) || SURE_NAMES.has(word(tokens, j));
  if (JOINERS.has(before) && isCast(i - 2)) return true;
  if (JOINERS.has(word(tokens, i + 1)) && isCast(i + 2)) return true;
  // 3. the subject of a clause: at its start (or after a clause opener) and followed by a predicate
  const prevPos = base[i - 1]?.[0]?.pos;
  const atClauseStart = !before || OPENER_POS.has(prevPos ?? '') || OPENERS.has(before) || (prevPos === 'PART' && before === 'ก็');
  if (!atClauseStart) return false;
  const next = word(tokens, i + 1);
  if (!next) return false;
  const nextPos = base[i + 1]?.[0]?.pos;
  return nextPos === 'VERB' || nextPos === 'AUX' || PREDICATE_STARTERS.has(next) || (nextPos === 'ADJ' && PERSON_STATES.has(next));
}
