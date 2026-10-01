/**
 * Coordinator's independent check of the Thai orthography engine (not written by the package that built it).
 *
 * The one unacceptable outcome is a confident wrong tone. Three tables:
 *   CORE  — regular one-syllable words: must decode to exactly one syllable with the right tone, confidence ≥ 0.8.
 *   HARD  — thanthakhat words and polysyllabic words: whenever every syllable is returned with confidence ≥ 0.8,
 *           the tones must be right; lower confidence (or no answer) is allowed and counted.
 *   RESP  — dictionary-style phonemic respellings: regular by construction, must decode exactly.
 * Tones are the citation tones of the written form (เขา, ฉัน, ไหม: rising, as spelled).
 */
import { describe, expect, it } from 'vitest';
import { decodeThai, decodeThaiRespelling, thaiOrthFeatures, tonesFromIpa } from '../../src/adapters/thai/orthography';

type Tone = 'mid' | 'low' | 'falling' | 'high' | 'rising';
const T: Record<string, Tone> = { M: 'mid', L: 'low', F: 'falling', H: 'high', R: 'rising' };
const words = (s: string) => s.trim().split(/\s+/u);

const CORE: Record<keyof typeof T, string> = {
  M: `กา คา มา ดี ปู งู กิน ใจ ไป ทำ คำ เรา คน ลม ตรง ความ ปลา ครู ไกล กลัว เมือง เรียน เดิน เลย เคย เธอ โรง ตา มี ดู นา ยา ลา วัน
      บิน ดิน จาน ยาง ลิง แดง ดำ ไฟ ใน เอา เบา ยาว ดาว เดียว เรือ เมีย ตัว กลาง เพลง ครัว คราว แกง โต ปี จำ ตาม นาน งาน ทาง เย็น เป็น`,
  R: `ขา สี หู ผี หมา หนู หมู หนา หลาย หวาน ไหม หลัง เขา เสือ หัว สวย ฝน ผม ขวา หรือ เหนือ สาม สอง ขาย ถาม ฝัน สูง ขาว เห็น หิน หอม
      หาย ผอม ถือ เสียง สาว ฉัน หนาว เหมือน ขอ หา แหวน สวน ถุง`,
  L: `กัด จาก บาป ปาก เด็ก ขัด สุก หก ผัก ถูก สิบ ไก่ ป่า ต่อ ข่าว สี่ ใส่ ถั่ว ใหม่ หนึ่ง หมด หนัก หยุด เหล็ก อยู่ อย่า อย่าง อยาก เปล่า
      เปิด เกิด เกาะ แกะ สด จบ กบ ปลูก ตก ออก บอก ดอก เจ็ด แปด ปิด ติด ตัด จับ กับ เก่า แก่ เต่า ไข่ ข่า ผ่า ส่ง ต่ำ ก่อน อ่าน ปู่ จะ
      ขวด ขาด สอบ ฝาก หาด หลับ หมวก เหยียบ อีก อาบ`,
  H: `คัด รัก นก เล็ก พบ ทุก ยก น้อง ม้า รู้ ร้อน นี้ นั้น แล้ว ซื้อ ช้าง ไม้ ฟ้า น้ำ โต๊ะ จ๊ะ พระ ครับ พริก ครั้ง เท้า เช้า ใช้ เยอะ เพราะ
      และ มด รถ นัก ลิ้น ร้าน ล้าง เลี้ยง น้า ยิ้ม ร้อง ทิ้ง ค้า นิด คิด วัด ชุด ลุก นับ รับ ลบ คะ นะ ละ`,
  F: `มาก พูด ชอบ เรียก ลูก โลก ภาพ เลือด แม่ พ่อ ไม่ ที่ ว่า เพื่อน นั่ง ง่าย บ้าน ได้ ข้าว ห้า ต้อง ให้ เก้า ผู้ ด้วย เข้า ถ้า หน้า หญ้า
      ไหม้ กว้าง ใกล้ กล้วย ใช่ เสื้อ เล่น ค่ะ ป้า ย่า พี่ นี่ ชื่อ เชื่อ ล่าง ช่วย ยาก ราก ลาก เชือก รีบ มืด ตู้ ด้าย ก้าว เจ้า ต้น ข้าง ส้ม
      ถ้วย ผ้า ห้อง บ้า ปั้น ตั้ง ขึ้น สั้น ซ่อม ท่าน ค่ำ น่า แน่`,
};

/** word → tones, one letter per syllable. */
const HARD: Array<[string, string]> = [
  ['สัตว์', 'L'], ['ศุกร์', 'L'], ['จันทร์', 'M'], ['เสาร์', 'R'], ['องค์', 'M'], ['ศักดิ์', 'L'], ['สิทธิ์', 'L'], ['พิมพ์', 'M'],
  ['ยนต์', 'M'], ['เบียร์', 'M'], ['ศูนย์', 'R'], ['ทุกข์', 'H'], ['โกรธ', 'L'], ['พุทธ', 'H'],
  ['หนังสือ', 'RR'], ['โรงเรียน', 'MM'], ['อาหาร', 'MR'], ['ภาษา', 'MR'], ['เข้าใจ', 'FM'], ['นักเรียน', 'HM'], ['ทำงาน', 'MM'],
  ['ขอบคุณ', 'LM'], ['ประตู', 'LM'], ['ประเทศ', 'LF'], ['ชีวิต', 'MH'], ['ขนม', 'LR'], ['ตลาด', 'LL'], ['สนุก', 'LL'], ['ถนน', 'LR'],
  ['อร่อย', 'LL'], ['จมูก', 'LL'], ['สบาย', 'LM'], ['สวัสดี', 'LLM'], ['ฝรั่ง', 'LL'], ['สมุด', 'LL'], ['ตลก', 'LL'], ['ขยัน', 'LR'],
  ['สนาม', 'LR'], ['ฉลาด', 'LL'], ['สะอาด', 'LL'], ['กรุงเทพ', 'MF'], ['เวลา', 'MM'], ['นาฬิกา', 'MHM'], ['พินาศ', 'HF'],
  ['สารภาพ', 'RHF'], ['สันติสุข', 'RLL'], ['ชำระ', 'MH'], ['ประทาน', 'LM'], ['อธรรม', 'LM'], ['ยุติธรรม', 'HLM'], ['นิรันดร์', 'HM'],
  ['มะม่วง', 'HF'], ['กระเป๋า', 'LR'], ['โทรศัพท์', 'MHL'], ['รถไฟ', 'HM'], ['น้ำตา', 'HM'], ['แม่น้ำ', 'FH'], ['พ่อแม่', 'FF'],
  ['ลูกชาย', 'FM'], ['ผู้หญิง', 'FR'], ['เด็กชาย', 'LM'], ['ครอบครัว', 'FM'], ['อาจารย์', 'MM'], ['มหา', 'HR'], ['ทะเล', 'HM'],
  ['มะพร้าว', 'HH'], ['กะทิ', 'LH'], ['สะพาน', 'LM'], ['ระวัง', 'HM'], ['ตะกร้า', 'LF'], ['ดอกไม้', 'LH'], ['ต้นไม้', 'FH'],
  ['ท้องฟ้า', 'HH'], ['พระจันทร์', 'HM'], ['พระอาทิตย์', 'HMH'], ['วันนี้', 'MH'], ['พรุ่งนี้', 'FH'], ['เมื่อวาน', 'FM'], ['ตอนเช้า', 'MH'],
  ['กลางคืน', 'MM'], ['อะไร', 'LM'], ['ทำไม', 'MM'], ['เท่าไร', 'FM'], ['ที่ไหน', 'FR'], ['อย่างไร', 'LM'], ['สวยงาม', 'RM'],
  ['ใหญ่โต', 'LM'], ['เล็กน้อย', 'HH'], ['มากมาย', 'FM'], ['เสียใจ', 'RM'], ['ดีใจ', 'MM'], ['ตกใจ', 'LM'], ['เข้ามา', 'FM'],
  ['ออกไป', 'LM'], ['กลับบ้าน', 'LF'], ['โรงพยาบาล', 'MHMM'], ['มหาวิทยาลัย', 'HRHHMM'], ['รัฐบาล', 'HLM'], ['ประชาชน', 'LMM'],
  ['ธนาคาร', 'HMM'], ['วัฒนธรรม', 'HHHM'], ['ศาสนา', 'LLR'], ['กษัตริย์', 'LL'], ['สามารถ', 'RF'], ['ปรารถนา', 'LLR'],
  ['สำเร็จ', 'RL'], ['ตำรวจ', 'ML'], ['กำเนิด', 'ML'], ['อังกฤษ', 'ML'], ['ผลไม้', 'RHH'], ['ราชการ', 'FHM'], ['พยายาม', 'HMM'],
  ['ทหาร', 'HR'], ['ชนะ', 'HH'], ['ธรรมดา', 'MHM'], ['สัปดาห์', 'LM'], ['อุบัติเหตุ', 'LLLL'], ['ปัจจุบัน', 'LLM'], ['อนาคต', 'LMH'],
  ['อดีต', 'LL'], ['เศรษฐกิจ', 'LLL'], ['สังคม', 'RM'], ['วิทยุ', 'HHH'], ['โทรทัศน์', 'MHH'], ['กาแฟ', 'MM'],
];

/** word, phonemic respelling (kaikki / Wiktionary style), tones. */
const RESP: Array<[string, string, string]> = [
  ['ขนม', 'ขะ-หฺนม', 'LR'], ['ตลาด', 'ตะ-หฺลาด', 'LL'], ['สวัสดี', 'สะ-หฺวัด-ดี', 'LLM'], ['ประเทศ', 'ปฺระ-เทด', 'LF'],
  ['อร่อย', 'อะ-หฺร่อย', 'LL'], ['ผลไม้', 'ผน-ละ-ม้าย', 'RHH'], ['โรงพยาบาล', 'โรง-พะ-ยา-บาน', 'MHMM'], ['น้ำ', 'น้าม', 'H'],
  ['เพชร', 'เพ็ด', 'H'], ['จริง', 'จิง', 'M'], ['ธรรม', 'ทำ', 'M'], ['สามารถ', 'สา-มาด', 'RF'], ['ทหาร', 'ทะ-หาน', 'HR'],
  ['กษัตริย์', 'กะ-สัด', 'LL'], ['ศาสนา', 'สาด-สะ-หฺนา', 'LLR'],
];

/**
 * Held-out words: written after the engine was finished, so none of them can have been put in its lists to pass.
 * This is the table that measures the real guarantee on words the engine has not been tuned to.
 */
const HELD_OUT: Array<[string, string]> = [
  // one syllable
  ['จีน', 'M'], ['ยืน', 'M'], ['นอน', 'M'], ['ลืม', 'M'], ['ยืม', 'M'], ['เตียง', 'M'], ['บน', 'M'], ['ลง', 'M'], ['มอง', 'M'], ['แพง', 'M'],
  ['ชาม', 'M'], ['ลาว', 'M'], ['เทา', 'M'], ['ชา', 'M'], ['คอ', 'M'], ['มือ', 'M'], ['ยุง', 'M'], ['ลุง', 'M'], ['ปลาย', 'M'], ['ยิง', 'M'], ['ริม', 'M'],
  ['สาย', 'R'], ['เสีย', 'R'], ['เขียน', 'R'], ['หาง', 'R'], ['ฝา', 'R'], ['ผิว', 'R'], ['แขน', 'R'], ['ขน', 'R'], ['หวี', 'R'], ['หญิง', 'R'],
  ['หลาน', 'R'], ['หมอ', 'R'], ['หมี', 'R'], ['เหา', 'R'],
  ['เตะ', 'L'], ['กะ', 'L'], ['ฉีก', 'L'], ['ฝึก', 'L'], ['สัก', 'L'], ['ปีก', 'L'], ['จูบ', 'L'], ['ดื่ม', 'L'], ['ขี่', 'L'], ['แจก', 'L'],
  ['หยิบ', 'L'], ['หลีก', 'L'], ['หมอก', 'L'], ['อบ', 'L'], ['ตบ', 'L'], ['กด', 'L'], ['บท', 'L'], ['เหนื่อย', 'L'],
  ['นิ้ว', 'H'], ['ท้อง', 'H'], ['แร้ง', 'H'], ['ล้อ', 'H'], ['เนื้อ', 'H'], ['รส', 'H'], ['ซัก', 'H'], ['ลัก', 'H'], ['นึก', 'H'], ['ชก', 'H'],
  ['คุก', 'H'], ['เคาะ', 'H'], ['เงาะ', 'H'],
  ['ไล่', 'F'], ['ถ้ำ', 'F'], ['ชั่ว', 'F'], ['ค่อย', 'F'], ['เที่ยง', 'F'], ['โทษ', 'F'], ['เมฆ', 'F'], ['โชค', 'F'], ['ภาค', 'F'], ['เลข', 'F'],
  ['ฟาด', 'F'], ['เชิด', 'F'], ['ชาติ', 'F'],
  // more than one syllable
  ['กระดาษ', 'LL'], ['กระทะ', 'LH'], ['กระต่าย', 'LL'], ['ตะวัน', 'LM'], ['ทะเลาะ', 'HH'], ['มะละกอ', 'HHM'], ['มะนาว', 'HM'], ['นาที', 'MM'],
  ['วินาที', 'HMM'], ['เก้าอี้', 'FF'], ['หน้าต่าง', 'FL'], ['ประชุม', 'LM'], ['ปัญหา', 'MR'], ['คำถาม', 'MR'], ['คำตอบ', 'ML'], ['ความรัก', 'MH'],
  ['ความสุข', 'ML'], ['การบ้าน', 'MF'], ['อากาศ', 'ML'], ['อาทิตย์', 'MH'], ['จังหวัด', 'ML'], ['อำเภอ', 'MM'], ['ตำบล', 'MM'], ['หมู่บ้าน', 'LF'],
  ['แผนที่', 'RF'], ['เครื่องบิน', 'FM'], ['รถยนต์', 'HM'], ['จักรยาน', 'LLM'], ['สนามบิน', 'LRM'], ['หนังสือพิมพ์', 'RRM'], ['ปากกา', 'LM'],
  ['ดินสอ', 'MR'], ['กระดาน', 'LM'], ['ห้องเรียน', 'FM'], ['ห้องน้ำ', 'FH'], ['ตู้เย็น', 'FM'], ['พัดลม', 'HM'], ['ไฟฟ้า', 'MH'], ['น้ำแข็ง', 'HR'],
  ['ข้าวผัด', 'FL'], ['ก๋วยเตี๋ยว', 'RR'], ['ส้มตำ', 'FM'], ['ไก่ย่าง', 'LF'], ['ผักบุ้ง', 'LF'], ['มะเขือ', 'HR'], ['แตงโม', 'MM'], ['สับปะรด', 'LLH'],
  ['ทุเรียน', 'HM'], ['มังคุด', 'MH'], ['เสื้อผ้า', 'FF'], ['กางเกง', 'MM'], ['รองเท้า', 'MH'], ['กระโปรง', 'LM'], ['ร่างกาย', 'FM'], ['หัวใจ', 'RM'],
  ['โรงงาน', 'MM'], ['ตำรา', 'MM'], ['กำลัง', 'MM'], ['จำนวน', 'MM'], ['สำคัญ', 'RM'], ['สำหรับ', 'RL'], ['ตัวอย่าง', 'ML'], ['เรื่องราว', 'FM'],
  ['เหตุผล', 'LR'], ['ความคิด', 'MH'], ['ประโยชน์', 'LL'], ['ประวัติ', 'LL'], ['ประมาณ', 'LM'], ['ประเพณี', 'LMM'], ['ภูเขา', 'MR'],
  ['ทะเลสาบ', 'HML'], ['ชายหาด', 'ML'], ['ป่าไม้', 'LH'], ['ดวงอาทิตย์', 'MMH'], ['ดวงจันทร์', 'MM'], ['ฤดู', 'HM'], ['หน้าร้อน', 'FH'],
  ['หน้าฝน', 'FR'], ['หน้าหนาว', 'FR'], ['เมื่อคืน', 'FM'], ['ตอนเย็น', 'MM'], ['กลางวัน', 'MM'], ['ใจดี', 'MM'], ['ขี้เกียจ', 'FL'],
  ['ง่วงนอน', 'FM'], ['หิวข้าว', 'RF'], ['กระหาย', 'LR'], ['สะดวก', 'LL'], ['ลำบาก', 'ML'], ['ธรรมชาติ', 'MHF'], ['วิทยาศาสตร์', 'HHML'],
  ['คณิตศาสตร์', 'HHLL'], ['ประวัติศาสตร์', 'LLLL'], ['ภาษาไทย', 'MRM'], ['ภาษาอังกฤษ', 'MRML'], ['นักศึกษา', 'HLR'], ['ครูใหญ่', 'ML'],
  ['เพื่อนบ้าน', 'FF'], ['ลูกสาว', 'FR'], ['พี่ชาย', 'FM'], ['น้องสาว', 'HR'], ['คุณยาย', 'MM'], ['คุณปู่', 'ML'], ['สามี', 'RM'], ['ภรรยา', 'MHM'],
  ['แต่งงาน', 'LM'],
];

const tonesOf = (letters: string): Tone[] => [...letters].map((c) => T[c]);

describe('Thai orthography engine — coordinator table', () => {
  describe('regular one-syllable words decode confidently and correctly', () => {
    for (const [letter, list] of Object.entries(CORE)) {
      it.each(words(list))(`%s → ${T[letter]}`, (word) => {
        const syl = decodeThai(word);
        expect(syl.map((s) => s.tone), `${word}: ${JSON.stringify(syl)}`).toEqual([T[letter]]);
        expect(syl[0].confidence, `${word} confidence`).toBeGreaterThanOrEqual(0.8);
        expect(word.slice(syl[0].start, syl[0].end)).toBe(syl[0].text);
      });
    }
  });

  it('harder words are never confidently wrong', () => {
    const wrong: string[] = [];
    let confidentRight = 0;
    const unsure: string[] = [];
    for (const [word, letters] of HARD) {
      const syl = decodeThai(word);
      const confident = syl.length > 0 && syl.every((s) => s.confidence >= 0.8 && s.tone);
      if (!confident) { unsure.push(word); continue; }
      const got = syl.map((s) => s.tone);
      if (JSON.stringify(got) === JSON.stringify(tonesOf(letters))) confidentRight++;
      else wrong.push(`${word}: expected ${tonesOf(letters).join(' ')}, got ${got.join(' ')} (${syl.map((s) => `${s.text}@${s.confidence}`).join(' ')})`);
    }
    console.info(`[thai-tones] harder words: ${confidentRight} confident and right, ${unsure.length} left uncertain, ${wrong.length} confidently wrong of ${HARD.length}`);
    if (unsure.length) console.info(`[thai-tones] uncertain: ${unsure.join(' ')}`);
    expect(wrong).toEqual([]);
    // the engine must be useful, not merely cautious
    expect(confidentRight).toBeGreaterThanOrEqual(Math.floor(HARD.length * 0.5));
  });

  it('held-out words (never shown to the engine\'s author) are never confidently wrong', () => {
    const wrong: string[] = [];
    let confidentRight = 0;
    const unsure: string[] = [];
    for (const [word, letters] of HELD_OUT) {
      const syl = decodeThai(word);
      const confident = syl.length > 0 && syl.every((s) => s.confidence >= 0.8 && s.tone);
      if (!confident) { unsure.push(word); continue; }
      const got = syl.map((s) => s.tone);
      if (JSON.stringify(got) === JSON.stringify(tonesOf(letters))) confidentRight++;
      else wrong.push(`${word}: expected ${tonesOf(letters).join(' ')}, got ${got.join(' ')} (${syl.map((s) => `${s.text}@${s.confidence}`).join(' ')})`);
    }
    console.info(`[thai-tones] held-out: ${confidentRight} confident and right, ${unsure.length} left uncertain, ${wrong.length} confidently wrong of ${HELD_OUT.length}`);
    if (unsure.length) console.info(`[thai-tones] held-out uncertain: ${unsure.join(' ')}`);
    expect(wrong).toEqual([]);
  });

  it.each(RESP)('respelling %s (%s) decodes exactly', (word, respelling, letters) => {
    const syl = decodeThaiRespelling(word, respelling);
    expect(syl.map((s) => s.tone), JSON.stringify(syl)).toEqual(tonesOf(letters));
  });

  it('IPA is the authority for tone when a respelling comes with one', () => {
    expect(tonesFromIpa('/kʰa˨˩.nom˩˩˦/')).toEqual(['low', 'rising']);
    expect(tonesFromIpa('/ta˨˩.laːt̚˨˩/')).toEqual(['low', 'low']);
    expect(decodeThaiRespelling('ขนม', 'ขะ-หฺนม', '/kʰa˨˩.nom˩˩˦/').map((s) => s.tone)).toEqual(['low', 'rising']);
    // spoken น้ำ is long and high: the tone letters win and the word is flagged irregular where spelling and sound part
    const nam = decodeThaiRespelling('น้ำ', 'น้าม', '/naːm˦˥/');
    expect(nam.map((s) => s.tone)).toEqual(['high']);
  });

  it('features come only from confident syllables and name the rule that applied', () => {
    const f = thaiOrthFeatures(decodeThai('บ้าน'));
    expect(f).toContain('class:mid');
    expect(f).toContain('mark:mai-tho');
    expect(f.some((k) => k.startsWith('rule:mid+mai-tho=falling'))).toBe(true);
    const none = thaiOrthFeatures([{ text: 'x', start: 0, end: 1, ending: 'live', confidence: 0.3 }]);
    expect(none).toEqual([]);
  });

  it('non-Thai input and signs do not produce syllables', () => {
    expect(decodeThai('abc')).toEqual([]);
    expect(decodeThai('ๆ')).toEqual([]);
    expect(decodeThai('')).toEqual([]);
  });
});
