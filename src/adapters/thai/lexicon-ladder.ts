/**
 * Words the Thai ladder plan (data/ladder/th/PLAN.md, sections 6 and 7) asked the adapter to read in one way: the cast's
 * names, the church and mission words, the loanwords ICU cuts differently from context to context, the tens and the last
 * digit of the teens, and two whole tokens ICU makes that a beginner needs in pieces (หน้าที่, ตากลม).
 * (adapter-th@4; machine-drafted, not native-reviewed.) The words that are pinned as one token (text.ts, THAI_PINNED) and
 * already have a row in lexicon-bible.ts (สะมาเรีย, บัพติศมา, ฟาริสี, ดาวิด, เปโตร, พระบิดา, พระวจนะ, พระวิญญาณ) are not repeated.
 *
 * Names. A given name is a PROPN, and the ladder gate counts a proper noun as known (src/ladder/analyse.ts), so a name must
 * only be read as one where the text shows a name:
 *  - แซม and สมชาย have no everyday reading: PROPN only, always.
 *  - ต้น (tree, classifier), มะลิ (jasmine), บอล (ball), แดง (red), เล็ก (small) keep their everyday reading FIRST; the PROPN
 *    reading is a second candidate that `contextual` (th.ts, names.ts) moves to the front only after a title or kin term
 *    (คุณต้น, ป้าแดง, ลุงเล็ก), after ชื่อ (ผมชื่อต้น), joined by กับ / และ to another name, or as the subject of a sentence
 *    (บอลหิว, ต้นอยู่ที่บ้าน). ต้นไม้สูง, สามต้น, สีแดง, ลูกบอล and น้องเล็ก are read as before.
 * Rows are listed after the lexicon's other lists, so the everyday readings keep their place.
 */
import { buildRows, type RowExtra, type ThaiRow } from './entries';

const R: RowExtra = { register: ['religious'] };

const ROWS: ThaiRow[] = [
  // ── the cast: names with no everyday reading
  ['แซม', 'PROPN', 'Sam (a given name)'],
  ['สมชาย', 'PROPN', 'Somchai (a given name)'],
  // ── the cast: names that are also ordinary words (the everyday reading first, the name second)
  ['มะลิ', 'NOUN', 'jasmine'],
  ['บอล', 'NOUN', 'ball; football'],
  ['ต้น', 'PROPN', 'Ton (a given name; also "tree")'],
  ['มะลิ', 'PROPN', 'Mali (a given name; also "jasmine")'],
  ['บอล', 'PROPN', 'Ball (a given name; also "ball")'],
  ['แดง', 'PROPN', 'Daeng (a given name; also "red")'],
  ['เล็ก', 'PROPN', 'Lek (a given name; also "small")'],
  // ── names and loanwords ICU cuts into junk or cuts differently in different contexts (pinned in text.ts)
  ['เอมี่', 'PROPN', 'Amy (a given name)'],
  ['มาร์ค', 'PROPN', 'Mark (a given name)'],
  ['อับราฮัม', 'PROPN', 'Abraham', R],
  ['เยริโค', 'PROPN', 'Jericho (the spelling many texts use; the OTCV writes เยรีโค)', R],
  ['ซิม', 'NOUN', 'SIM card'],
  ['ซิมการ์ด', 'NOUN', 'SIM card'],
  ['แชท', 'NOUN', 'chat (a message conversation)'],
  ['แชท', 'VERB', 'to chat (by messages)'],
  ['โอเค', 'INTJ', 'okay', { register: ['colloquial'] }],
  ['ไซส์', 'NOUN', 'size (of clothes, shoes)'],
  // ── church and mission words
  ['ศิษยาภิบาล', 'NOUN', 'pastor', R],
  ['มิชชันนารี', 'NOUN', 'missionary', R],
  ['อีสเตอร์', 'NOUN', 'Easter', R],
  // ── numerals: the tens (one token each), and เอ็ด, the last digit "one" of 11, 21, 31 … (สิบเอ็ด = สิบ + เอ็ด)
  ['ยี่สิบ', 'NUM', 'twenty'],
  ['สามสิบ', 'NUM', 'thirty'],
  ['สี่สิบ', 'NUM', 'forty'],
  ['ห้าสิบ', 'NUM', 'fifty'],
  ['หกสิบ', 'NUM', 'sixty'],
  ['เจ็ดสิบ', 'NUM', 'seventy'],
  ['แปดสิบ', 'NUM', 'eighty'],
  ['เก้าสิบ', 'NUM', 'ninety'],
  ['เอ็ด', 'NUM', 'one (last digit above ten: สิบเอ็ด 11, ยี่สิบเอ็ด 21)'],
  // ── whole tokens ICU makes that the text cuts apart unless the neighbours show the other reading (text.ts)
  ['หน้าที่', 'NOUN', 'duty, responsibility'],
  ['ตากลม', 'VERB', 'to take the air; to dry in the wind'],
];

export const LADDER_ROWS: readonly ThaiRow[] = ROWS;
const built = buildRows(ROWS);
export const LADDER_ENTRIES = built.entries;
export const LADDER_ANNOTATIONS = built.annotations;
