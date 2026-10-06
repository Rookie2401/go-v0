/**
 * Everyday words whose FIRST dictionary sense is the wrong one for a beginner reading a bridge text or a Stage 0 scene:
 * the dictionary lists a rarer or older meaning first (เหนือ "north", ตกลง "to agree", ไว้ "to place", ช้อน "to scoop",
 * เก็บ "kept", เลิก "to lift up", ตั้ง "a classifier", สถานี "topic" ...). A word the hand list holds keeps its own
 * reading, so these rows put the meaning a learner meets first, with the other common meaning second; the few words
 * whose meaning depends on the neighbours are ordered in `contextual` (th.ts).
 * Machine-drafted and not native-reviewed, like the rest of the list: only common words whose meanings are certain.
 */
import { buildRows, type ThaiRow } from './entries';

const ROWS: ThaiRow[] = [
  // ── the first sense was a rare one
  ['เก็บ', 'VERB', 'to pick up; to collect; to put away; to keep'],
  ['ไว้', 'PART', '(after a verb: set aside, in place, for later; e.g. เก็บไว้ "keep it")', { role: 'resultative marker (keep, for later)' }],
  ['ไว้', 'VERB', 'to keep; to leave (as it is); to let (hair) grow'],
  ['ช้อน', 'NOUN', 'spoon'],
  ['ช้อน', 'VERB', 'to scoop up'],
  ['เหนือ', 'ADP', 'above, over'],
  ['เหนือ', 'NOUN', 'north'],
  ['ตกลง', 'VERB', 'to agree; to decide'], // read as "to fall down" (ตก + ลง) after rain and before มา / ไป: see `contextual` in th.ts
  ['เลิก', 'VERB', 'to stop, quit; to end (work, school)'],
  ['ตั้ง', 'VERB', 'to set up, put in place; to give (a name); to start'],
  ['สถานี', 'NOUN', 'station (train, bus, radio)'],
  ['รถไฟ', 'NOUN', 'train'],
  ['ค่ำ', 'NOUN', 'evening, nightfall'],
  ['ดัง', 'ADJ', 'loud; (of a sound) to ring out; famous'],
  ['นาฬิกา', 'NOUN', 'clock, watch; o\'clock'],
  ['ใส่', 'VERB', 'to put in or on; to wear'],
  ['ถ่าย', 'VERB', 'to take (a photo); to copy; to transfer'],
  ['ของขวัญ', 'NOUN', 'gift, present'],
  ['การบ้าน', 'NOUN', 'homework'],
  ['ซอย', 'NOUN', 'soi (a side street)'],
  ['ซอย', 'VERB', 'to chop, mince'],
  ['เกาะ', 'NOUN', 'island'],
  ['เกาะ', 'VERB', 'to cling to; to perch on; to grip'],
  ['ปู', 'NOUN', 'crab'],
  ['ปู', 'VERB', 'to spread out (a mat, a cloth); to lay (a floor)'],
  // ── days of the week (the dictionary gives the planet or the god first)
  ['จันทร์', 'NOUN', 'Monday (in วันจันทร์); the moon'],
  ['อังคาร', 'NOUN', 'Tuesday (in วันอังคาร); Mars'],
  ['พุธ', 'NOUN', 'Wednesday (in วันพุธ); Mercury'],
  ['พฤหัสบดี', 'NOUN', 'Thursday (in วันพฤหัสบดี); Jupiter'],
  ['ศุกร์', 'NOUN', 'Friday (in วันศุกร์); Venus'],
  ['เสาร์', 'NOUN', 'Saturday (in วันเสาร์); Saturn'],
];

export const EVERYDAY_ROWS: readonly ThaiRow[] = ROWS;
const built = buildRows(ROWS);
export const EVERYDAY_ENTRIES = built.entries;
export const EVERYDAY_ANNOTATIONS = built.annotations;
