/**
 * Thai: pieces of longer words carded as words of their own (deck-gate follow-up, adapter-th@5). ICU cuts what its own list lacks;
 * thai/recut.ts re-cuts with the installed dictionary and the course list, marks a cut it cannot settle as `cutDoubt` (every reading
 * of such a token is `unconfirmed`, so no card is made), and the adapter reads ละ and ว่า by their neighbours.
 * Machine-drafted by an AI model, not native-reviewed.
 */
import { describe, expect, it } from 'vitest';
import { thAdapter } from '../../src/adapters/th';

const words = (text: string) => thAdapter.tokenize(text).filter((t) => t.isWord).map((t) => t.surface);
const read = (text: string, surface: string) => {
  const toks = thAdapter.tokenize(text);
  const an = thAdapter.analyze(toks);
  const i = toks.findIndex((t) => t.surface === surface);
  expect(i, `${surface} in ${text}`).toBeGreaterThanOrEqual(0);
  return an[i].candidates;
};
const confident = (text: string, surface: string) => read(text, surface).some((c) => c.lemma && !c.unconfirmed);

describe('Thai re-cut: a compound ICU cut is one token again', () => {
  it('a course word + a dictionary-only word that spell a long dictionary headword', () => {
    expect(words('ขณะนี้มีผู้ประสบภัยมากกว่าสองหมื่นครัวเรือนในห้าจังหวัด')).toContain('ครัวเรือน');
    expect(words('ใช้งบประมาณมากขึ้น')).toEqual(['ใช้', 'งบประมาณ', 'มาก', 'ขึ้น']);
    expect(words('นักวิเคราะห์ระบุว่าราคาจะลดลง')[0]).toBe('นักวิเคราะห์');
    expect(words('สิ่งแวดล้อมได้รับผลกระทบ')).toContain('ผลกระทบ');
    expect(words('ผลกระทบต่อเศรษฐกิจรุนแรง')[0]).toBe('ผลกระทบ');
  });

  it('fragments nobody lists are joined into the word they belong to (ผลก + ระ + ทบ)', () => {
    const w = words('นายกรัฐมนตรีกล่าวว่า รัฐบาลจะช่วยผู้ที่ได้รับผลกระทบจากน้ำท่วม');
    expect(w).toContain('ผลกระทบ');
    expect(w).not.toContain('ระ');
    expect(w).not.toContain('ทบ');
  });

  it('the course compounds (BASE_COMPOUNDS) stay one token: เจ้าหน้าที่, เบาหวาน, ท้องถิ่น, เสมอภาค, รับประทาน', () => {
    expect(words('เจ้าหน้าที่ได้อพยพชาวบ้าน')[0]).toBe('เจ้าหน้าที่');
    expect(words('โรงพยาบาลตรวจหาโรคเบาหวานฟรี')).toContain('เบาหวาน');
    expect(words('รัฐบาลท้องถิ่นเตรียมปลูกต้นไม้')).toContain('ท้องถิ่น');
    expect(words('ทุกคนมีสิทธิเสมอภาคกัน')).toContain('เสมอภาค');
    expect(words('ก่อนรับประทานอาหาร')).toContain('รับประทาน');
    expect(read('เจ้าหน้าที่ได้อพยพชาวบ้าน', 'เจ้าหน้าที่')[0]).toMatchObject({ lemma: 'เจ้าหน้าที่', pos: 'NOUN' });
  });

  it('counter-examples stay as ICU cut them: words the course teaches as parts, and two course words', () => {
    expect(words('ผมซื้อความหมายค่ะ')).toEqual(['ผม', 'ซื้อ', 'ความ', 'หมาย', 'ค่ะ']); // taught as ความ + หมาย
    expect(words('ผมซื้อตะวันออกค่ะ')).toEqual(['ผม', 'ซื้อ', 'ตะวัน', 'ออก', 'ค่ะ']);
    expect(words('ผมกินข้าวแล้ว')).toEqual(['ผม', 'กิน', 'ข้าว', 'แล้ว']);
    expect(words('ผู้ป่วยโรคเบาหวาน')).toContain('ผู้');
  });
});

describe('Thai re-cut: a cut across a word boundary is mended', () => {
  it('มาส + อง and พอก + ลับ become two course words each', () => {
    expect(words('ผมปวดหัวและเป็นไข้มาสองวันแล้ว')).toEqual(['ผม', 'ปวด', 'หัว', 'และ', 'เป็น', 'ไข้', 'มา', 'สอง', 'วัน', 'แล้ว']);
    expect(words('พอกลับถึงบ้าน ลูกสาวก็นอน').slice(0, 3)).toEqual(['พอ', 'กลับ', 'ถึง']);
    expect(words('ตื่นมาสามวันแล้ว')).toContain('สาม');
  });

  it('น้อยห + ลัง becomes น้อย + หลัง (ลัง is no word here)', () => {
    const w = words('ตลาดหุ้นปิดสูงขึ้นเล็กน้อยหลังนักลงทุนได้ข่าวดี');
    expect(w).toContain('หลัง');
    expect(w).not.toContain('ลัง');
  });

  it('ว่า after a verb of saying is cut off the word ICU joined it to (ว่าการ, ว่าย)', () => {
    expect(words('ผลการวิจัยชี้ว่าการนอนหลับให้เพียงพอช่วยให้เด็กเรียนรู้ได้ดีขึ้น')).toContain('ว่า');
    expect(words('ผู้ส่งออกข้าวเชื่อว่ายอดขายในปีหน้าจะดีขึ้น')).toEqual(expect.arrayContaining(['เชื่อ', 'ว่า', 'ยอดขาย']));
    expect(words('เขากล่าวว่ายอดขายจะลดลง')).toEqual(['เขา', 'กล่าว', 'ว่า', 'ยอดขาย', 'จะ', 'ลด', 'ลง']);
    expect(words('เธอคิดว่าสมการนี้ง่าย')).toEqual(['เธอ', 'คิด', 'ว่า', 'สมการ', 'นี้', 'ง่าย']);
  });

  it('counter-examples: ผู้ว่าการ is not after a verb of saying, and ว่าย "to swim" is left alone there', () => {
    expect(words('ผู้ว่าการธนาคารกล่าวว่าเงินเฟ้อลดลง').slice(0, 3)).toEqual(['ผู้', 'ว่าการ', 'ธนาคาร']);
    expect(words('เขาว่ายน้ำเก่ง')).toContain('ว่าย');
  });
});

describe('Thai re-cut: a cut the sentence cannot decide gives no confident reading', () => {
  it('มาก + อด against มา + กอด: both pieces are unconfirmed', () => {
    const text = 'พอกลับถึงบ้าน ลูกสาวคนเล็กวิ่งมากอดผมแล้ว';
    expect(confident(text, 'อด')).toBe(false);
    expect(confident(text, 'มาก')).toBe(false);
    expect(read(text, 'อด')[0].notes).toMatchObject({ cutDoubt: 'yes' });
    expect(confident('เด็กวิ่งมากอดแม่', 'อด')).toBe(false);
  });

  it('a compound the course teaches as its parts keeps the cut but its pieces are unconfirmed (ช่วย + เหลือ, ชาน + ชาลา)', () => {
    expect(words('รัฐบาลจะเร่งช่วยเหลือประชาชน')).toEqual(expect.arrayContaining(['ช่วย', 'เหลือ']));
    expect(confident('รัฐบาลจะเร่งช่วยเหลือประชาชน', 'เหลือ')).toBe(false);
    expect(confident('ออกจากชานชาลาไหน', 'ชาน')).toBe(false);
  });

  it('short pieces beside a piece nobody lists are unconfirmed (เม็ก + ซิ + กัน)', () => {
    expect(confident('ฉันไม่เคยกินอาหารเม็กซิกันมาก่อน', 'ซิ')).toBe(false);
    expect(confident('ฉันกินข้าวแล้ว', 'กิน')).toBe(true); // nothing odd: confident as ever
  });
});

describe('Thai: ละ and ว่า by their neighbours', () => {
  it('ละ after a noun and before a number is "each, per"; elsewhere the particle', () => {
    for (const [text] of [['ชามละห้าสิบบาท'], ['ผมกินข้าววันละสามครั้ง'], ['ครอบครัวละสามคนเข้าห้อง']]) {
      expect(read(text, 'ละ')[0]).toMatchObject({ pos: 'DET' });
    }
    expect(read('ผมไปแล้วละ', 'ละ')[0]).toMatchObject({ pos: 'PART' });
  });

  it('ว่า after a negator and before อะไร / ใคร is the verb "to scold"; before a pronoun the two readings are left undecided', () => {
    expect(read('หัวหน้าไม่ได้ว่าอะไร', 'ว่า')[0]).toMatchObject({ pos: 'VERB' });
    expect(read('ครูไม่ได้ว่าใคร', 'ว่า')[0]).toMatchObject({ pos: 'VERB' });
    const pron = read('ผมไม่ได้ว่าเขา', 'ว่า');
    expect(pron[0].confidence - pron[1].confidence).toBeLessThanOrEqual(0.15);
  });

  it('ว่า elsewhere stays "that"', () => {
    expect(read('เขาบอกว่าพรุ่งนี้ฝนจะตก', 'ว่า')[0]).toMatchObject({ pos: 'SCONJ' });
    expect(read('ผมคิดว่าเขาไม่มา', 'ว่า')[0]).toMatchObject({ pos: 'SCONJ' });
  });
});
