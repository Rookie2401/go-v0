import { describe, expect, it } from 'vitest';
import { endsInAbbreviation, pairedRanges } from '../../src/adapters/thai/text';
import { adapter } from './helpers';

const th = adapter('th');
const units = (t: string) => th.segmentSentences(t).map((s) => s.text);

describe('reading units: deterministic full-stop hazards', () => {
  it('1. a full stop inside an abbreviation never ends a unit (Thai, dotted, titles, Latin)', () => {
    for (const t of [
      'ปี พ.ศ. 2565 เป็นปีที่ฝนตกมาก', 'ร.ร. ของเราอยู่ใกล้บ้าน', 'ดร. สมชายมาถึงแล้ว', 'นพ. สมศักดิ์ตรวจคนไข้', 'วันที่ 5 ก.ค. 2566 เป็นวันหยุด',
      'เขาเกิดเมื่อ ค.ศ. 1990 ที่เมืองนี้', 'อ. สมหญิงสอนภาษา', 'คุณ ก. กับคุณ ข. ไปด้วยกัน', 'รศ. สมชายและ ผศ. สมหญิงมาถึง', 'พล.อ. สมชายเปิดงาน',
      'Dr. Smith ไปถึงแล้ว', 'Mr. Brown พูดว่าดี', 'ประชุม 9 a.m. ทุกวัน', 'เช่น e.g. สิ่งนี้',
    ]) expect(units(t), t).toEqual([t]);
  });

  it('1. but a word of two or three letters with a full stop is still a sentence end', () => {
    expect(units('ฉันชอบนก. เธอชอบปลา')).toEqual(['ฉันชอบนก.', 'เธอชอบปลา']);
    expect(units('เขามาแล้ว. เธอยังไม่มา')).toEqual(['เขามาแล้ว.', 'เธอยังไม่มา']);
  });

  it('1. an abbreviation does not hide a real stop elsewhere', () => {
    expect(units('ปี พ.ศ. 2565 ฝนตก. เขากลับบ้าน')).toEqual(['ปี พ.ศ. 2565 ฝนตก.', 'เขากลับบ้าน']);
    expect(units('Dr. Smith came. ฉันกลับ')).toEqual(['Dr. Smith came.', 'ฉันกลับ']);
  });

  it('1. endsInAbbreviation reads the text before the stop only', () => {
    expect(endsInAbbreviation('ปี พ.ศ.', 6)).toBe(true);
    expect(endsInAbbreviation('นก.', 2)).toBe(false);
    expect(endsInAbbreviation('go home.', 7)).toBe(false);
    expect(endsInAbbreviation('see Dr.', 6)).toBe(true);
    expect(endsInAbbreviation('at 5 p.m.', 8)).toBe(true);
  });

  it('2. times and decimals stay whole, and น. after a time belongs to it', () => {
    for (const t of ['ประชุมเวลา 10.30 น. ที่ห้องประชุม', 'ราคา 3.5 บาท ไม่แพง', 'เขาตื่นตอน 6.00 น. ทุกเช้า', 'ตี 5.45 น. ฉันก็ตื่นแล้ว', 'รถออกเวลา 08:30 น. ทุกวัน', 'ฉันมีเงิน ๑๒๓.๕๐ บาท'])
      expect(units(t), t).toEqual([t]);
  });

  it('3. a list marker at the start of a unit stays with the unit it introduces', () => {
    expect(units('1. ล้างมือ')).toEqual(['1. ล้างมือ']);
    expect(units('๑. ล้างมือแล้วกินข้าว')).toEqual(['๑. ล้างมือแล้วกินข้าว']);
    expect(units('ก. ข้าว')).toEqual(['ก. ข้าว']);
    expect(units('(1) ล้างมือ 1) กินข้าว')).toEqual(['(1) ล้างมือ 1) กินข้าว']);
    // after a line break the marker is at the start of its own unit
    expect(units('ล้างมือ\n2. กินข้าว')).toEqual(['ล้างมือ', '2. กินข้าว']);
    // a number ending a sentence in the middle of a unit is not a marker
    expect(units('ฉันมี 5. เธอมี 6')).toEqual(['ฉันมี 5.', 'เธอมี 6']);
  });

  it('4. an ellipsis ends a unit only at the end of the text, or before closing quotation marks and the end', () => {
    expect(units('เขาเดินจากไป…')).toEqual(['เขาเดินจากไป…']);
    expect(units('“ฉันไม่รู้…”')).toEqual(['“ฉันไม่รู้…”']);
    for (const t of ['“ฉัน… ฉันไม่รู้” เขาพูด', '“ฉันคิดว่า…” เขาพูดเบา ๆ', 'รอเดี๋ยว... เดี๋ยวฉันไปด้วย', 'รอก่อน.... แล้วค่อยไป', 'ฝนหยุดแล้ว… ฟ้าสว่างขึ้น'])
      expect(units(t), t).toEqual([t]);
    // ? and ! still end a unit, also when they are followed by dots
    expect(units('ไปไหน?… ฉันไม่รู้')).toEqual(['ไปไหน?…', 'ฉันไม่รู้']);
    expect(units('เธอไป! ฉันกลับ')).toEqual(['เธอไป!', 'ฉันกลับ']);
    // two spaces or a line break still end a unit after an ellipsis
    expect(units('ฝนหยุดแล้ว…  ฟ้าสว่าง')).toEqual(['ฝนหยุดแล้ว…', 'ฟ้าสว่าง']);
    expect(units('ฝนหยุดแล้ว…\nฟ้าสว่าง')).toEqual(['ฝนหยุดแล้ว…', 'ฟ้าสว่าง']);
  });

  it('5. ฯ and ฯลฯ never end a unit by themselves; two spaces or a line break still do', () => {
    expect(units('ในตลาดมีผัก ผลไม้ เนื้อ ปลา ฯลฯ ขายทุกวัน')).toHaveLength(1);
    expect(units('กรุงเทพฯ เป็นเมืองหลวง')).toHaveLength(1);
    expect(units('ผู้ว่าฯ มาเปิดงานเมื่อวานนี้')).toHaveLength(1);
    expect(units('ฉันไปกรุงเทพฯ  เธอกลับบ้าน')).toEqual(['ฉันไปกรุงเทพฯ', 'เธอกลับบ้าน']);
    expect(units('ฉันไปกรุงเทพฯ\nเธอกลับบ้าน')).toEqual(['ฉันไปกรุงเทพฯ', 'เธอกลับบ้าน']);
    expect(units('ฯลฯ ก็ดี')).toHaveLength(1);
  });

  it('6. no cut inside a bracket or quotation pair that holds a short phrase without terminal punctuation', () => {
    for (const t of ['เขาบอกไว้ (ไปด้วยนะ ถ้าว่าง) แต่ฉันไม่ว่าง', '“พี่ครับ ช่วยผมหน่อย” น้องพูด', '"ไปด้วยนะ ถ้าว่าง" เขาพูด', 'เขาตอบ (เบา ๆ) ว่า “ไม่เป็นไรนะ ฉันโอเค”'])
      expect(units(t), t).toEqual([t]);
    // the same text without the pair is cut after the particle
    expect(units('เขาบอกไว้ไปด้วยนะ ถ้าว่าง')).toEqual(['เขาบอกไว้ไปด้วยนะ', 'ถ้าว่าง']);
    // a quotation with terminal punctuation inside is contested: unchanged
    expect(units('“ไปไหน? ไปตลาดนะ ครับ” เขาพูด').length).toBeGreaterThan(1);
    // a longer quotation (more than six words) may hold several sentences: not protected
    expect(units('“ผมไม่รู้ครับ ขอโทษด้วยนะครับ” เขาตอบ').length).toBeGreaterThan(1);
    // a pair that does not close, or closes on another line, protects nothing
    expect(units('เขาบอก “ไปนะ ครับ')).toEqual(['เขาบอก “ไปนะ', 'ครับ']);
    expect(pairedRanges('“ก\nข”')).toEqual([]);
    expect(pairedRanges('a (b) “c” "d"')).toHaveLength(3);
  });

  it('7. a form of address plus a particle at the start of a unit does not end it', () => {
    for (const t of ['พี่ครับ ช่วยผมหน่อย', 'คุณครูคะ หนูขอถามหน่อยค่ะ', 'คุณแม่คะ วันนี้หนูกลับบ้านช้านะคะ', 'น้องครับ ขอน้ำหนึ่งแก้วครับ', 'คุณหมอครับ ผมปวดหัว'])
      expect(units(t), t).toEqual([t]);
    // only at the very start: after a unit has begun, the particle ends it as before
    expect(units('ฉันกลับบ้านแล้วครับ พี่ครับ ช่วยด้วย')).toEqual(['ฉันกลับบ้านแล้วครับ', 'พี่ครับ ช่วยด้วย']);
    // an ordinary greeting or thanks is not a form of address
    expect(units('สวัสดีค่ะ สบายดีไหมคะ')).toEqual(['สวัสดีค่ะ', 'สบายดีไหมคะ']);
    expect(units('ขอบคุณครับ ผมไปก่อน')).toEqual(['ขอบคุณครับ', 'ผมไปก่อน']);
    // more than a bare address before the particle: a sentence
    expect(units('พี่ไปตลาดครับ ผมไปด้วย')).toEqual(['พี่ไปตลาดครับ', 'ผมไปด้วย']);
  });

  it('8. a line break inside a sentence still starts a new unit, and the adapter says so', () => {
    expect(units('ฉันเดินไปที่ตลาด\nเพื่อซื้อผัก')).toEqual(['ฉันเดินไปที่ตลาด', 'เพื่อซื้อผัก']);
    expect(th.support.limitations.join(' ')).toMatch(/line break inside a sentence/);
  });

  it('spans still slice the text exactly and keep their order', () => {
    const t = 'ปี พ.ศ. 2565 ประชุม 10.30 น. ที่ห้อง “ไปนะ ครับ” เขาพูด… กรุงเทพฯ ดี  พี่ครับ ช่วยด้วย\n1. ล้างมือ ไปไหน? ฉันไม่รู้';
    const spans = th.segmentSentences(t);
    spans.forEach((s) => expect(t.slice(s.start, s.end)).toBe(s.text));
    for (let k = 1; k < spans.length; k++) expect(spans[k].start).toBeGreaterThanOrEqual(spans[k - 1].end);
    expect(spans.map((s) => s.text).join('').replace(/\s/gu, '')).toBe(t.replace(/\s/gu, ''));
  });
});
