import { describe, expect, it } from 'vitest';
import {
  decodeThai,
  decodeThaiByRulesOnly,
  decodeThaiRespelling,
  describeThaiOrthFeature,
  thaiOrthFeatures,
  tonesFromIpa,
  type ThaiTone,
} from '../../src/adapters/thai/orthography';
import { THAI_ORTH_EXCEPTIONS, THAI_ORTH_SETTLED, THAI_ORTH_SPLITS } from '../../src/adapters/thai/orth-exceptions';

const words = (s: string): string[] => s.split(/\s+/).filter(Boolean);
const tones = (w: string): Array<ThaiTone | undefined> => decodeThai(w).map((x) => x.tone);

/** Regular one-syllable words from the brief, by expected tone. */
const MONO: Record<ThaiTone, string[]> = {
  mid: words('กา คา มา ดี ปู งู กิน ใจ ไป ทำ คำ เรา คน ลม ตรง ความ ปลา ครู ไกล กลัว เมือง เรียน เดิน เลย เคย เธอ โรง'),
  rising: words('ขา สี หู ผี หมา หนู หมู หนา หลาย หวาน ไหม หลัง เขา เสือ หัว สวย ฝน ผม ขวา หรือ เหนือ'),
  low: words(
    'กัด จาก บาป ปาก เด็ก ขัด สุก หก ผัก ถูก สิบ ไก่ ป่า ต่อ ข่าว สี่ ใส่ ถั่ว ใหม่ หนึ่ง หมด หนัก หยุด เหล็ก อยู่ อย่า อย่าง อยาก เปล่า เปิด เกิด เกาะ แกะ สด จบ กบ',
  ),
  high: words(
    'คัด รัก นก เล็ก พบ ทุก ยก น้อง ม้า รู้ ร้อน นี้ นั้น แล้ว ซื้อ ช้าง ไม้ ฟ้า น้ำ โต๊ะ จ๊ะ พระ ครับ พริก ครั้ง เท้า เช้า ใช้ เยอะ เพราะ และ มด รถ',
  ),
  falling: words(
    'มาก พูด ชอบ เรียก ลูก โลก ภาพ เลือด แม่ พ่อ ไม่ ที่ ว่า เพื่อน นั่ง ง่าย บ้าน ได้ ข้าว ห้า ต้อง ให้ เก้า ผู้ ด้วย เข้า ถ้า หน้า หญ้า ไหม้ กว้าง ใกล้ กล้วย ใช่ เสื้อ',
  ),
};

const THANTHAKHAT: Array<[string, ThaiTone]> = [
  ['สัตว์', 'low'],
  ['ศุกร์', 'low'],
  ['จันทร์', 'mid'],
  ['เสาร์', 'rising'],
  ['องค์', 'mid'],
  ['ศักดิ์', 'low'],
];

const POLY: Array<[string, ThaiTone[]]> = [
  ['หนังสือ', ['rising', 'rising']],
  ['โรงเรียน', ['mid', 'mid']],
  ['อาหาร', ['mid', 'rising']],
  ['ภาษา', ['mid', 'rising']],
  ['เข้าใจ', ['falling', 'mid']],
  ['นักเรียน', ['high', 'mid']],
  ['ทำงาน', ['mid', 'mid']],
  ['ขอบคุณ', ['low', 'mid']],
  ['ประตู', ['low', 'mid']],
  ['ประเทศ', ['low', 'falling']],
  ['ชีวิต', ['mid', 'high']],
  ['ขนม', ['low', 'rising']],
  ['ตลาด', ['low', 'low']],
  ['สนุก', ['low', 'low']],
  ['ถนน', ['low', 'rising']],
  ['อร่อย', ['low', 'low']],
  ['จมูก', ['low', 'low']],
  ['สบาย', ['low', 'mid']],
  ['สวัสดี', ['low', 'low', 'mid']],
];

describe('decodeThai — acceptance: regular one-syllable words', () => {
  for (const tone of Object.keys(MONO) as ThaiTone[]) {
    it(`reads every ${tone}-tone word correctly with confidence ≥ 0.8`, () => {
      const problems: string[] = [];
      for (const w of MONO[tone]) {
        const r = decodeThai(w);
        if (r.length !== 1) problems.push(`${w}: ${r.length} syllables`);
        else if (r[0].tone !== tone) problems.push(`${w}: ${r[0].tone} (${r[0].rule})`);
        else if (r[0].confidence < 0.8) problems.push(`${w}: confidence ${r[0].confidence}`);
      }
      expect(problems).toEqual([]);
    });
  }

  it('covers the whole brief list (every word once)', () => {
    const all = Object.values(MONO).flat();
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBeGreaterThanOrEqual(150);
  });
});

describe('decodeThai — thanthakhat', () => {
  it('silences the marked letters and still reads the tone', () => {
    for (const [w, tone] of THANTHAKHAT) {
      const r = decodeThai(w);
      expect(r, w).toHaveLength(1);
      expect(r[0].tone, w).toBe(tone);
      // confidence: see the next test (Pali letters keep it, loan letters do not)
      expect(r[0].text, w).toBe(w);
    }
  });

  it('knows which letter is the final and which are silent', () => {
    expect(decodeThai('จันทร์')[0]).toMatchObject({ final: 'น', finalSound: 'n' });
    expect(decodeThai('ศักดิ์')[0]).toMatchObject({ final: 'ก', finalSound: 'k' });
    expect(decodeThai('สัตว์')[0]).toMatchObject({ final: 'ต', finalSound: 't' });
    expect(decodeThai('เสาร์')[0]).toMatchObject({ vowel: 'เ◌า', ending: 'live' });
    expect(decodeThai('องค์')[0]).toMatchObject({ final: 'ง', finalSound: 'ŋ' });
  });

  it('reads a thanthakhat in the middle of a word (การ์ด)', () => {
    const r = decodeThai('การ์ด');
    expect(r.map((x) => x.text)).toEqual(['การ์ด']);
    expect(r[0]).toMatchObject({ final: 'ด', finalSound: 't', tone: 'low' });
  });
});

describe('decodeThai — polysyllabic words', () => {
  for (const [w, expected] of POLY) {
    it(`${w} → ${expected.join(' ')}`, () => {
      expect(tones(w)).toEqual(expected);
    });
  }

  it('never gives a confident (≥ 0.8) wrong tone on the polysyllabic table', () => {
    for (const [w, expected] of POLY) {
      decodeThai(w).forEach((s, k) => {
        if (s.confidence >= 0.8) expect(s.tone, `${w}[${k}]`).toBe(expected[k]);
      });
    }
  });

  it('is confident only where every syllable has a written vowel and nothing competes', () => {
    for (const w of ['เข้าใจ', 'ไม่มี', 'แม่น้ำ', 'ผู้ชาย']) {
      for (const s of decodeThai(w)) expect(s.confidence, w).toBeGreaterThanOrEqual(0.8);
    }
  });

  // words below are NOT on the reviewed lists, so they show the bare rules
  it('caps a class carry-over decided by rule at 0.75', () => {
    for (const w of ['สมอง', 'ผนัง', 'ขโมย', 'ฉลอง', 'ตลิ่ง', 'ถลำ']) {
      const r = decodeThai(w);
      expect(r.length, w).toBeGreaterThanOrEqual(2);
      expect(r[1].confidence, w).toBeLessThanOrEqual(0.75);
      expect(r[0].confidence, w).toBeLessThanOrEqual(0.6);
    }
  });

  it('applies the carry-over to the second syllable (สมอง → สะ-หมอง, ตลิ่ง → ตะ-หลิ่ง)', () => {
    const r = decodeThai('สมอง');
    expect(r.map((x) => x.text)).toEqual(['ส', 'มอง']);
    expect(r.map((x) => x.tone)).toEqual(['low', 'rising']);
    expect(r[1].initialClass).toBe('high');
    expect(r[1].rule).toContain('the class of ส carries over: read as high class; live syllable → rising tone');
    const t = decodeThai('ตลิ่ง');
    expect(t[1].initialClass).toBe('mid');
    expect(t.map((x) => x.tone)).toEqual(['low', 'low']);
    // a low-class first letter passes nothing on
    const low = decodeThai('นลา');
    expect(low.map((x) => x.initialClass)).toEqual(['low', 'low']);
    expect(low.map((x) => x.tone)).toEqual(['high', 'mid']);
  });

  it('keeps a lone consonant before a non-sonorant as a plain short-a syllable', () => {
    const r = decodeThai('สกุล');
    expect(r[0]).toMatchObject({ text: 'ส', vowel: '◌', vowelLength: 'short', ending: 'dead', tone: 'low' });
    expect(r[1]).toMatchObject({ text: 'กุล', tone: 'mid' });
    expect(r[1].initialClass).toBe('mid');
  });

  it('lowers confidence when the division of the letters is ambiguous (ประกัน could be two or three syllables)', () => {
    const r = decodeThai('ประกัน');
    expect(r.map((x) => x.text)).toEqual(['ประ', 'กัน']);
    expect(r.map((x) => x.tone)).toEqual(['low', 'mid']);
    expect(r[0].confidence).toBeLessThan(0.6);
  });

  it('does not claim a word ending in a short open vowel (a possible Pali ending like ติ, ตุ)', () => {
    for (const w of ['กุสุมะ', 'ภาติ', 'วัตถุ']) {
      const r = decodeThai(w);
      expect(r.length, w).toBeGreaterThan(1);
      for (const s of r) expect(s.confidence, w).toBeLessThanOrEqual(0.72);
    }
  });

  it('keeps Pali- and Sanskrit-looking spellings below 0.8 (their readings break the rules)', () => {
    for (const w of ['ศาลา', 'ภาษี', 'เกษา', 'ฐานะ']) {
      for (const s of decodeThai(w)) expect(s.confidence, w).toBeLessThan(0.8);
    }
  });

  it('returns [] rather than guessing when a word cannot be parsed', () => {
    for (const w of ['ะก', 'เ', 'แแก', 'กำำ', 'กฺ']) expect(decodeThai(w), w).toEqual([]);
    expect(decodeThai('กก')[0]).toMatchObject({ final: 'ก', finalSound: 'k' });
  });

  it('is not confident when a syllable-final letter may also start a hidden syllable (สารภาพ, ราชการ, คุณภาพ)', () => {
    // names that are not on the reviewed list, with the same shape
    for (const w of ['สารกาน', 'พาลมาน', 'รัชชาน', 'ตาษมาน']) {
      const r = decodeThai(w);
      for (const s of r) expect(s.confidence, w).toBeLessThanOrEqual(0.6);
    }
    // native finals do not trigger the cap
    for (const s of decodeThai('นักเรียน')) expect(s.rule ?? '', 'นักเรียน').not.toContain('hidden syllable');
  });

  it('is not confident when ◌ำ meets a low sonorant that may take its class (สำเร็จ vs สำนัก)', () => {
    for (const w of ['ตำรอด', 'สำรอด', 'กำนอด', 'สำนอด', 'ดำลิบ']) {
      for (const s of decodeThai(w)) expect(s.confidence, w).toBeLessThanOrEqual(0.6);
    }
    // a low-class first letter or a non-sonorant second letter is settled by the spelling
    for (const w of ['ทำให้', 'ทำไม่ได้']) for (const s of decodeThai(w)) expect(s.confidence, w).toBeGreaterThanOrEqual(0.8);
  });
});

describe('decodeThai — vowel length and live / dead', () => {
  it('reads long and short vowels', () => {
    const t = (w: string) => decodeThai(w)[0];
    expect(t('กา')).toMatchObject({ vowel: '◌า', vowelLength: 'long', ending: 'open' });
    expect(t('กะ')).toMatchObject({ vowel: '◌ะ', vowelLength: 'short', ending: 'dead' });
    expect(t('กิน')).toMatchObject({ vowel: '◌ิ', vowelLength: 'short', ending: 'live' });
    expect(t('กีน')).toMatchObject({ vowel: '◌ี', vowelLength: 'long' });
    expect(t('คึก')).toMatchObject({ vowel: '◌ึ', vowelLength: 'short', ending: 'dead' });
    expect(t('คืน')).toMatchObject({ vowel: '◌ื', vowelLength: 'long', ending: 'live' });
    expect(t('มือ')).toMatchObject({ vowel: '◌ือ', vowelLength: 'long', ending: 'open' });
    expect(t('ถุง')).toMatchObject({ vowel: '◌ุ', vowelLength: 'short' });
    expect(t('ปู')).toMatchObject({ vowel: '◌ู', vowelLength: 'long' });
    expect(t('เกะ')).toMatchObject({ vowel: 'เ◌ะ', vowelLength: 'short' });
    expect(t('เด็ก')).toMatchObject({ vowel: 'เ◌็', vowelLength: 'short', ending: 'dead' });
    expect(t('เก')).toMatchObject({ vowel: 'เ◌', vowelLength: 'long' });
    expect(t('แกะ')).toMatchObject({ vowel: 'แ◌ะ', vowelLength: 'short' });
    expect(t('แก')).toMatchObject({ vowel: 'แ◌', vowelLength: 'long' });
    expect(t('โกะ')).toMatchObject({ vowel: 'โ◌ะ', vowelLength: 'short' });
    expect(t('โก')).toMatchObject({ vowel: 'โ◌', vowelLength: 'long' });
    expect(t('เกาะ')).toMatchObject({ vowel: 'เ◌าะ', vowelLength: 'short' });
    expect(t('กอ')).toMatchObject({ vowel: '◌อ', vowelLength: 'long' });
    expect(t('ก็อก')).toMatchObject({ vowel: '◌็อ', vowelLength: 'short', ending: 'dead' });
    expect(t('เกอะ')).toMatchObject({ vowel: 'เ◌อะ', vowelLength: 'short' });
    expect(t('เกอ')).toMatchObject({ vowel: 'เ◌อ', vowelLength: 'long' });
    expect(t('เกิน')).toMatchObject({ vowel: 'เ◌ิ', vowelLength: 'long' });
    expect(t('เกียะ')).toMatchObject({ vowel: 'เ◌ียะ', vowelLength: 'short' });
    expect(t('เกีย')).toMatchObject({ vowel: 'เ◌ีย', vowelLength: 'long' });
    expect(t('เกือะ')).toMatchObject({ vowel: 'เ◌ือะ', vowelLength: 'short' });
    expect(t('เกือ')).toMatchObject({ vowel: 'เ◌ือ', vowelLength: 'long' });
    expect(t('กัวะ')).toMatchObject({ vowel: '◌ัวะ', vowelLength: 'short' });
    expect(t('กัว')).toMatchObject({ vowel: '◌ัว', vowelLength: 'long', ending: 'open' });
    expect(t('กวด')).toMatchObject({ vowel: '◌ว◌', vowelLength: 'long', finalSound: 't' });
    expect(t('ไทย')).toMatchObject({ vowel: 'ไ◌ย', vowelLength: 'short', ending: 'live' });
  });

  it('counts ◌ำ ใ◌ ไ◌ เ◌า as short vowels that end in a sonorant (live)', () => {
    for (const [w, snd] of [['คำ', 'm'], ['ใจ', 'j'], ['ไป', 'j'], ['เรา', 'w']] as const) {
      const s = decodeThai(w)[0];
      expect(s.vowelLength, w).toBe('short');
      expect(s.ending, w).toBe('live');
      expect(s.finalSound, w).toBe(snd);
      expect(s.final, w).toBeUndefined();
      expect(s.tone, w).toBe('mid');
    }
  });

  it('gives a long open vowel the live tone, a short open vowel the dead tone', () => {
    expect(tones('ขา')).toEqual(['rising']);
    expect(tones('ขะ')).toEqual(['low']);
    expect(tones('คะ')).toEqual(['high']);
    expect(tones('คา')).toEqual(['mid']);
  });

  it('separates a short from a long vowel in a dead low-class syllable', () => {
    expect(tones('มาก')).toEqual(['falling']);
    expect(tones('มัก')).toEqual(['high']);
    expect(tones('ลูก')).toEqual(['falling']);
    expect(tones('ลุก')).toEqual(['high']);
  });

  it('reads the implicit short o between two consonants and a short a on a lone consonant', () => {
    expect(decodeThai('คน')[0]).toMatchObject({ vowel: '◌', vowelLength: 'short', tone: 'mid', final: 'น' });
    expect(decodeThai('นก')[0]).toMatchObject({ vowel: '◌', ending: 'dead', tone: 'high' });
    expect(decodeThai('สกุล')[0]).toMatchObject({ vowel: '◌', ending: 'dead' });
    // ร final after no vowel: an n sound, live
    expect(decodeThai('พร')[0]).toMatchObject({ finalSound: 'n', tone: 'mid' });
    expect(decodeThai('กร')[0]).toMatchObject({ finalSound: 'n', tone: 'mid' });
  });

  it('reads รร as a short a before a final and as an at the end', () => {
    const k = decodeThai('กรรม')[0];
    expect(k).toMatchObject({ vowel: '◌รร', vowelLength: 'short', final: 'ม', finalSound: 'm', tone: 'mid' });
    const s = decodeThai('สรร')[0];
    expect(s).toMatchObject({ vowel: '◌รร', finalSound: 'n', ending: 'live', tone: 'rising' });
    expect(s.confidence).toBeLessThanOrEqual(0.7);
    expect(thaiOrthFeatures([k, s])).toContain('special:ro-han');
  });

  it('reads ฤ without giving a tone', () => {
    const r = decodeThai('ฤดู');
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ text: 'ฤ', vowel: 'ฤ' });
    expect(r[0].tone).toBeUndefined();
    expect(r[0].confidence).toBeLessThan(0.6);
    expect(thaiOrthFeatures(r)).not.toContain('special:rue'); // below the 0.6 threshold
  });
});

describe('decodeThai — finals and classes', () => {
  it('maps every final letter to its sound', () => {
    const finals: Array<[string, string]> = [
      ['มาก', 'k'], ['ลาภ', 'p'], ['บาท', 't'], ['กด', 't'], ['กบ', 'p'], ['กก', 'k'], ['คน', 'n'], ['ลม', 'm'], ['ลง', 'ŋ'],
      ['เลย', 'j'], ['เลว', 'w'], ['สาย', 'j'], ['ขาว', 'w'], ['เจ็ด', 't'], ['มาก', 'k'], ['ผล', 'n'], ['ครบ', 'p'],
      ['โรค', 'k'], ['โลก', 'k'], ['ภาพ', 'p'], ['รัฐ', 't'], ['ปัญ', 'n'], ['กาฬ', 'n'],
    ];
    for (const [w, snd] of finals) {
      const r = decodeThai(w);
      expect(r.length, w).toBeGreaterThan(0);
      expect(r[r.length - 1].finalSound, w).toBe(snd);
    }
  });

  it('records the final letter as written', () => {
    expect(decodeThai('เจ็ด')[0].final).toBe('ด');
    expect(decodeThai('ภาพ')[0].final).toBe('พ');
    expect(decodeThai('เลย')[0].final).toBe('ย');
  });

  it('assigns consonant classes (mid / high / low)', () => {
    for (const ch of 'กจดตฎฏบปอ') expect(decodeThai(`${ch}า`)[0].initialClass, ch).toBe('mid');
    for (const ch of 'ขฉฐถผฝศษสห') expect(decodeThai(`${ch}า`)[0].initialClass, ch).toBe('high');
    for (const ch of 'คงชซญฑฒณทธนพฟภมยรลวฬฮ') expect(decodeThai(`${ch}า`)[0].initialClass, ch).toBe('low');
  });

  it('applies the tone marks by class', () => {
    const t = (w: string) => decodeThai(w)[0].tone;
    // mai ek
    expect(t('ก่า')).toBe('low');
    expect(t('ข่า')).toBe('low');
    expect(t('ค่า')).toBe('falling');
    // mai tho
    expect(t('ก้า')).toBe('falling');
    expect(t('ข้า')).toBe('falling');
    expect(t('ค้า')).toBe('high');
    // mai tri, mai chattawa: mid class only
    expect(t('ก๊า')).toBe('high');
    expect(t('ก๋า')).toBe('rising');
    expect(t('ค๊า')).toBeUndefined();
    expect(t('ข๋า')).toBeUndefined();
    expect(decodeThai('ค๊า')[0].confidence).toBeLessThan(0.6);
    expect(decodeThai('ก่า')[0].toneMark).toBe('่');
  });

  it('writes a plain sentence for the rule', () => {
    expect(decodeThai('นก')[0].rule).toBe('low-class consonant, dead syllable with a short vowel → high tone');
    expect(decodeThai('มาก')[0].rule).toBe('low-class consonant, dead syllable with a long vowel → falling tone');
    expect(decodeThai('ขา')[0].rule).toBe('high-class consonant, long open vowel (counts as live) → rising tone');
    expect(decodeThai('กิน')[0].rule).toBe('mid-class consonant, live syllable → mid tone');
    expect(decodeThai('กัด')[0].rule).toBe('mid-class consonant, dead syllable → low tone');
    expect(decodeThai('บ้าน')[0].rule).toBe('mid-class consonant + mai tho → falling tone');
    expect(decodeThai('ใจ')[0].rule).toContain('live');
  });

  it('gives a romanization and IPA for a rule decode', () => {
    expect(decodeThai('นก')[0].romanization).toBe('nok');
    expect(decodeThai('กิน')[0].romanization).toBe('kin');
    expect(decodeThai('ขา')[0].ipa).toBe('kʰaː˩˩˦');
    expect(decodeThai('มาก')[0].ipa).toBe('maːk̚˥˩');
    expect(decodeThai('เลย')[0].romanization).toBe('loei');
  });
});

describe('decodeThai — clusters and leading ห / อ', () => {
  it('reads true clusters with the class of the first letter', () => {
    const all: Array<[string, string, string]> = [
      ['กราบ', 'กร', 'mid'], ['กลาง', 'กล', 'mid'], ['กวาง', 'กว', 'mid'], ['ขราบ', 'ขร', 'high'], ['ขลาด', 'ขล', 'high'],
      ['ขวาง', 'ขว', 'high'], ['ครับ', 'คร', 'low'], ['คลาน', 'คล', 'low'], ['ความ', 'คว', 'low'], ['ตราบ', 'ตร', 'mid'],
      ['ปราบ', 'ปร', 'mid'], ['ปลา', 'ปล', 'mid'], ['พราย', 'พร', 'low'], ['พลาด', 'พล', 'low'], ['ผลัก', 'ผล', 'high'],
      ['บรรจุ', 'บร', 'mid'], ['บลาด', 'บล', 'mid'], ['ดราม', 'ดร', 'mid'], ['ฟราย', 'ฟร', 'low'], ['ฟลาย', 'ฟล', 'low'],
    ];
    for (const [w, cluster, cls] of all) {
      const r = decodeThai(w);
      if (w === 'บรรจุ') continue; // รร, not a cluster: see the next test
      expect(r.length, w).toBeGreaterThan(0);
      expect(r[0].cluster, w).toBe(cluster);
      expect(r[0].initial, w).toBe(cluster);
      expect(r[0].initialClass, w).toBe(cls);
    }
  });

  it('does not treat รร as the second letter of a cluster', () => {
    const r = decodeThai('บรรจุ');
    expect(r[0].cluster).toBeUndefined();
    expect(r[0].vowel).toBe('◌รร');
  });

  it('reads pseudo-clusters with the first letter only: ทร = s, and silent ร after จ ส ศ ซ', () => {
    for (const w of ['ทราย', 'ทราบ', 'ทรง', 'จริต', 'สร้าง', 'ศรี', 'ซรี']) {
      const r = decodeThai(w);
      expect(r, w).toHaveLength(1);
      expect(r[0].cluster, w).toBeUndefined();
      expect(r[0].initial?.length, w).toBe(2);
    }
    expect(tones('ทราย')).toEqual(['mid']);
    expect(tones('ทราบ')).toEqual(['falling']);
    expect(tones('ทรง')).toEqual(['mid']);
    expect(tones('สร้าง')).toEqual(['falling']);
    expect(tones('ศรี')).toEqual(['rising']);
    expect(decodeThai('ศรี')[0].romanization).toBe('si');
    expect(decodeThai('ทราย')[0].ipa?.startsWith('s')).toBe(true);
  });

  it('reads leading ห before ง ญ น ม ย ร ล ว: silent, high class', () => {
    for (const w of ['หงา', 'หญา', 'หนา', 'หมา', 'หยา', 'หรา', 'หลา', 'หวา']) {
      const r = decodeThai(w);
      expect(r, w).toHaveLength(1);
      expect(r[0].cluster, w).toBe(w.slice(0, 2));
      expect(r[0].initialClass, w).toBe('high');
      expect(r[0].tone, w).toBe('rising');
    }
    // the same letters with a low-class initial stay low
    expect(decodeThai('นา')[0].initialClass).toBe('low');
  });

  it('reads leading อ in อย่า อยู่ อย่าง อยาก as mid class', () => {
    for (const w of ['อย่า', 'อยู่', 'อย่าง', 'อยาก']) {
      const r = decodeThai(w);
      expect(r, w).toHaveLength(1);
      expect(r[0].cluster, w).toBe('อย');
      expect(r[0].initialClass, w).toBe('mid');
      expect(r[0].tone, w).toBe('low');
    }
    // other อย… spellings are not leading อ
    expect(decodeThai('อยุธยา')).not.toEqual([]);
    expect(decodeThai('อยุธยา')[0].cluster).toBeUndefined();
  });

  it('keeps ห as an ordinary initial before a non-sonorant', () => {
    const r = decodeThai('หาก');
    expect(r[0].cluster).toBeUndefined();
    expect(r[0].tone).toBe('low'); // high class, dead syllable → low
  });
});

describe('decodeThai — offsets', () => {
  const SAMPLE = [
    ...Object.values(MONO).flat(),
    ...THANTHAKHAT.map(([w]) => w),
    ...POLY.map(([w]) => w),
    'ดีๆ', 'กรุงเทพฯ', 'การ์ด', 'ฤดู', 'อยุธยา', 'สามารถ', 'ครอบครัว', 'ผู้หญิง', 'มหาวิทยาลัย', 'ธนาคาร',
  ].filter((w) => !THAI_ORTH_EXCEPTIONS.some((e) => e.surface === w));

  it('slices every rule decode back to its text', () => {
    for (const w of SAMPLE) {
      for (const s of decodeThai(w)) {
        expect(w.slice(s.start, s.end), w).toBe(s.text);
        expect(s.start, w).toBeLessThan(s.end);
      }
    }
  });

  it('tiles the whole word with contiguous syllables', () => {
    for (const w of SAMPLE) {
      const r = decodeThai(w);
      if (r.length === 0) continue;
      expect(r[0].start, w).toBe(0);
      expect(r[r.length - 1].end, w).toBe(w.length);
      for (let k = 1; k < r.length; k++) expect(r[k].start, w).toBe(r[k - 1].end);
      expect(r.map((x) => x.text).join(''), w).toBe(w);
    }
  });

  it('attaches ๆ and ฯ to the syllable before them without making a syllable of them', () => {
    const r = decodeThai('ดีๆ');
    expect(r).toHaveLength(1);
    expect(r[0].text).toBe('ดีๆ');
    expect(r[0].tone).toBe('mid');
    expect(thaiOrthFeatures(r)).toContain('sign:mai-yamok');
    const k = decodeThai('กรุงเทพฯ');
    expect(k).toHaveLength(2);
    expect(k[1].text).toBe('เทพฯ');
    expect(k.map((x) => x.tone)).toEqual(['mid', 'falling']);
  });

  it('returns [] for text that is not a single Thai word', () => {
    for (const w of ['', 'abc', '๑๒๓', 'ไทย 1', 'ไป ไป', 'ๆ', 'ะ', 'กํ']) expect(decodeThai(w), JSON.stringify(w)).toEqual([]);
  });

  it('is deterministic and pure', () => {
    const a = JSON.stringify(decodeThai('หนังสือ'));
    expect(JSON.stringify(decodeThai('หนังสือ'))).toBe(a);
  });
});

describe('tonesFromIpa', () => {
  it('reads each tone letter sequence', () => {
    expect(tonesFromIpa('/kʰa˧/')).toEqual(['mid']);
    expect(tonesFromIpa('/kʰa˧˧/')).toEqual(['mid']);
    expect(tonesFromIpa('/kʰa˨˩/')).toEqual(['low']);
    expect(tonesFromIpa('/kʰa˥˩/')).toEqual(['falling']);
    expect(tonesFromIpa('/kʰa˦˥/')).toEqual(['high']);
    expect(tonesFromIpa('/kʰa˥/')).toEqual(['high']);
    expect(tonesFromIpa('/kʰa˩˩˦/')).toEqual(['rising']);
    expect(tonesFromIpa('/kʰa˩˦/')).toEqual(['rising']);
    expect(tonesFromIpa('/kʰa˨˦/')).toEqual(['rising']);
  });

  it('gives one entry per syllable, splitting on . and spaces', () => {
    expect(tonesFromIpa('/kʰa˨˩.nom˩˩˦/')).toEqual(['low', 'rising']);
    expect(tonesFromIpa('/ta˨˩.laːt̚˨˩/')).toEqual(['low', 'low']);
    expect(tonesFromIpa('/saː˩˩˦ ma˧.ɕiːk̚˦˥/')).toEqual(['rising', 'mid', 'high']);
    expect(tonesFromIpa('[kʰaːw˩˩˦]')).toEqual(['rising']);
  });

  it('gives undefined where no tone letter is found or it is unreadable', () => {
    expect(tonesFromIpa('/kʰa.nom˩˩˦/')).toEqual([undefined, 'rising']);
    expect(tonesFromIpa('/kʰa˨/')).toEqual([undefined]);
    expect(tonesFromIpa('')).toEqual([]);
    expect(tonesFromIpa('/kʰa˧˨˩/')).toEqual([undefined]);
  });
});

describe('decodeThaiRespelling', () => {
  it('decodes ขนม from its respelling and agrees with the rule engine (not irregular)', () => {
    const r = decodeThaiRespelling('ขนม', 'ขะ-หฺนม', '/kʰa˨˩.nom˩˩˦/');
    expect(r.map((x) => x.tone)).toEqual(['low', 'rising']);
    expect(r.map((x) => x.text)).toEqual(['ข', 'นม']);
    expect(r[1]).toMatchObject({ initial: 'น', final: 'ม', initialClass: 'high', finalSound: 'm', ending: 'live' });
    expect(r[0]).toMatchObject({ vowel: '◌', initialClass: 'high', ending: 'dead' });
    expect(r.every((x) => x.irregular !== true)).toBe(true);
    expect(r.every((x) => x.confidence >= 0.9)).toBe(true);
    expect(r.map((x) => x.ipa)).toEqual(['kʰa˨˩', 'nom˩˩˦']);
    expect(r[1].cluster).toBeUndefined(); // the written syllable has no ห: the class is carried
  });

  it('decodes ตลาด from its respelling: low, low', () => {
    const r = decodeThaiRespelling('ตลาด', 'ตะ-หฺลาด', '/ta˨˩.laːt̚˨˩/');
    expect(r.map((x) => x.tone)).toEqual(['low', 'low']);
    expect(r[1]).toMatchObject({ vowelLength: 'long', ending: 'dead', finalSound: 't' });
  });

  it('works without IPA, taking the tone from the rules', () => {
    const r = decodeThaiRespelling('สนุก', 'สะ-หฺนุก');
    expect(r.map((x) => x.tone)).toEqual(['low', 'low']);
    expect(r.map((x) => x.text)).toEqual(['ส', 'นุก']);
  });

  it('lets the IPA tone win on disagreement: irregular, confidence ≤ 0.7', () => {
    const r = decodeThaiRespelling('ขนม', 'ขะ-หฺนม', '/kʰa˨˩.nom˧/');
    expect(r[0].tone).toBe('low');
    expect(r[1].tone).toBe('mid');
    expect(r[1].irregular).toBe(true);
    expect(r[1].confidence).toBeLessThanOrEqual(0.7);
    expect(r[1].rule).toContain('IPA');
    expect(r[0].confidence).toBeGreaterThan(0.9);
  });

  it('ignores IPA whose syllable count does not match', () => {
    const r = decodeThaiRespelling('ขนม', 'ขะ-หฺนม', '/kʰanom˩˩˦/');
    expect(r.map((x) => x.tone)).toEqual(['low', 'rising']);
    expect(r[0].ipa).toBe('kʰa˨˩');
  });

  it('decodes a true cluster written with phinthu', () => {
    const r = decodeThaiRespelling('ปลา', 'ปฺลา');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ cluster: 'ปล', initialClass: 'mid', tone: 'mid', text: 'ปลา', start: 0, end: 3 });
  });

  it('marks a respelling that the rules would not produce as irregular and spans the whole word when it cannot align', () => {
    const r = decodeThaiRespelling('ผลไม้', 'ผน-ละ-ไม้');
    expect(r.map((x) => x.tone)).toEqual(['rising', 'high', 'high']);
    expect(r.every((x) => x.irregular === true)).toBe(true);
    expect(r.every((x) => x.start === 0 && x.end === 5)).toBe(true);
    expect(r.map((x) => x.text)).toEqual(['ผน', 'ละ', 'ไม้']);
  });

  it('lays a single respelling syllable over the whole word', () => {
    const r = decodeThaiRespelling('จริง', 'จิง');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ text: 'จริง', start: 0, end: 4, tone: 'mid' });
    expect(r[0].irregular).not.toBe(true); // the rules read จริง the same way
  });

  it('returns [] when a part is not one regular syllable', () => {
    expect(decodeThaiRespelling('ไทย', '')).toEqual([]);
    expect(decodeThaiRespelling('ไทย', 'abc')).toEqual([]);
    expect(decodeThaiRespelling('ไทย', 'ไท-')).not.toEqual([]);
    expect(decodeThaiRespelling('', 'ไท')).toEqual([]);
  });
});

describe('exception list', () => {
  it('decodes every listed word through its respelling, flagged irregular', () => {
    expect(THAI_ORTH_EXCEPTIONS.length).toBeGreaterThanOrEqual(20);
    const seen = new Set<string>();
    for (const e of THAI_ORTH_EXCEPTIONS) {
      expect(seen.has(e.surface), `duplicate ${e.surface}`).toBe(false);
      seen.add(e.surface);
      expect(e.surface, e.surface).toBe(e.surface.normalize('NFC'));
      const r = decodeThai(e.surface);
      expect(r.length, e.surface).toBe(e.respelling.split('-').length);
      expect(r.every((s) => s.irregular === true), e.surface).toBe(true);
      expect(r.every((s) => s.tone !== undefined && s.confidence >= 0.9), e.surface).toBe(true);
      expect(r.every((s) => s.start >= 0 && s.end <= e.surface.length), e.surface).toBe(true);
    }
  });

  const SPOKEN: Array<[string, ThaiTone[]]> = [
    ['น้ำ', ['high']],
    ['ก็', ['falling']],
    ['จริง', ['mid']],
    ['ธรรม', ['mid']],
    ['สระ', ['low']],
    ['เพชร', ['high']],
    ['ชาติ', ['falling']],
    ['เหตุ', ['low']],
    ['ธาตุ', ['falling']],
    ['พุทธ', ['high']],
    ['ผลไม้', ['rising', 'high', 'high']],
    ['ธรรมชาติ', ['mid', 'high', 'falling']],
    ['ศาสนา', ['low', 'low', 'rising']],
    ['ประวัติ', ['low', 'low']],
    ['สมาชิก', ['low', 'mid', 'high']],
    ['อนุญาต', ['low', 'high', 'falling']],
    ['มหาวิทยาลัย', ['high', 'rising', 'high', 'high', 'mid', 'mid']],
  ];
  it('gives the spoken tones of the listed words', () => {
    for (const [w, expected] of SPOKEN) expect(tones(w), w).toEqual(expected);
  });

  it('keeps น้ำ long and says why', () => {
    const r = decodeThai('น้ำ');
    expect(r[0]).toMatchObject({ vowelLength: 'long', finalSound: 'm', irregular: true, text: 'น้ำ' });
    expect(r[0].rule).toContain('Irregular spelling');
  });

  it('does not list words the rules already read correctly', () => {
    for (const w of ['เขา', 'ฉัน', 'ไหม', 'บ้าน', 'ครับ']) expect(decodeThai(w)[0].irregular).not.toBe(true);
  });
});

describe('settled list (regular words whose division the spelling does not settle)', () => {
  it('is disjoint from the exception list and has no duplicates', () => {
    const ex = new Set(THAI_ORTH_EXCEPTIONS.map((e) => e.surface));
    const seen = new Set<string>();
    for (const e of THAI_ORTH_SETTLED) {
      expect(ex.has(e.surface), `${e.surface} in both lists`).toBe(false);
      expect(seen.has(e.surface), `duplicate ${e.surface}`).toBe(false);
      seen.add(e.surface);
      expect(e.surface, e.surface).toBe(e.surface.normalize('NFC'));
    }
    expect(THAI_ORTH_SETTLED.length).toBeGreaterThanOrEqual(40);
  });

  it('agrees with the rule engine on every entry: same syllables, same tones, not flagged irregular', () => {
    const problems: string[] = [];
    for (const e of THAI_ORTH_SETTLED) {
      const r = decodeThai(e.surface);
      if (r.length !== e.respelling.split('-').length) problems.push(`${e.surface}: ${r.length} syllables`);
      else if (r.some((s) => s.irregular)) problems.push(`${e.surface}: rules disagree with the respelling`);
      else if (r.some((s) => s.confidence < 0.9)) problems.push(`${e.surface}: low confidence`);
      else if (r.map((s) => s.text).join('') !== e.surface) problems.push(`${e.surface}: not aligned`);
    }
    expect(problems).toEqual([]);
  });

  it('settles a word to high confidence where the bare rules would hold back', () => {
    for (const w of ['ขนม', 'ตลาด', 'ประตู', 'หนังสือ', 'สำนัก' /* exception list */]) {
      for (const s of decodeThai(w)) expect(s.confidence, w).toBeGreaterThanOrEqual(0.9);
    }
    // the same letters inside a longer, unlisted word are back to the cautious rule decode
    for (const s of decodeThai('ขนมปัง')) expect(s.confidence).toBeLessThanOrEqual(0.72);
  });
});

describe('vowelSound, respelled and written letters', () => {
  it('sets vowelSound on every decoded syllable (not on ฤ, whose sound varies)', () => {
    const t = (w: string) => decodeThai(w).map((s) => s.vowelSound);
    expect(t('นก')).toEqual(['o']);
    expect(t('คน')).toEqual(['o']);
    expect(t('กา')).toEqual(['a']);
    expect(t('เรียน')).toEqual(['ia']);
    expect(t('มือ')).toEqual(['ue']);
    expect(t('เธอ')).toEqual(['oe']);
    expect(t('เลย')).toEqual(['oe']);
    expect(t('แม่')).toEqual(['ae']);
    expect(t('สกุล')).toEqual(['a', 'u']);
    expect(t('ขนม')).toEqual(['a', 'o']);
    expect(t('น้ำ')).toEqual(['a']);
    expect(t('ฤดู')[0]).toBeUndefined();
    for (const w of [...Object.values(MONO).flat(), ...POLY.map(([x]) => x)]) {
      for (const s of decodeThai(w)) expect(s.vowelSound, w).toBeTruthy();
    }
    expect(decodeThaiRespelling('ขนม', 'ขะ-หฺนม').map((s) => s.vowelSound)).toEqual(['a', 'o']);
  });

  it('gives a respelling only where sound and spelling part ways', () => {
    const k = decodeThai('ขนม');
    expect(k.map((s) => s.text)).toEqual(['ข', 'นม']);
    expect(k.map((s) => s.respelled)).toEqual(['ขะ', 'หนม']);
    expect(decodeThai('น้ำ')[0].respelled).toBe('น้าม');
    // rule-decoded carry-over: the part with the ห made explicit
    expect(decodeThai('สมอง').map((s) => s.respelled)).toEqual([undefined, 'หมอง']);
    expect(decodeThai('ตลิ่ง').map((s) => s.respelled)).toEqual([undefined, 'หลิ่ง']);
    expect(decodeThai('ฉลอง')[1].respelled).toBe('หลอง');
    // read as written: nothing
    for (const w of ['นก', 'กิน', 'บ้าน', 'โรงเรียน', 'สกุล', 'ทำงาน', 'หมา', 'ปลา']) {
      for (const s of decodeThai(w)) expect(s.respelled, w).toBeUndefined();
    }
    expect(decodeThaiRespelling('ขนม', 'ขะ-หฺนม').map((s) => s.respelled)).toEqual(['ขะ', 'หนม']);
    expect(decodeThaiRespelling('จริง', 'จิง')[0].respelled).toBe('จิง');
    // an unaligned respelling: the text already is the respelled part
    expect(decodeThai('ผลไม้').map((s) => s.respelled)).toEqual([undefined, undefined, undefined]);
  });

  it('describes the written letters of a respelled syllable and says why the class carries over', () => {
    const [a, b] = decodeThai('ขนม');
    expect(a).toMatchObject({ initial: 'ข', initialClass: 'high', vowel: '◌' });
    expect(a.final).toBeUndefined();
    expect(b).toMatchObject({ initial: 'น', initialClass: 'high', final: 'ม', finalSound: 'm', vowel: '◌', tone: 'rising' });
    expect(b.cluster).toBeUndefined();
    expect(b.rule).toBe('the class of ข carries over: read as high class; live syllable → rising tone');
    // a known split (THAI_ORTH_SPLITS): ตำรวจ → ตำ-หรวด, the written part is รวจ
    const t = decodeThai('ตำรวจ');
    expect(t[1]).toMatchObject({ initial: 'ร', initialClass: 'high', final: 'จ', finalSound: 't', tone: 'low', text: 'รวจ' });
    expect(t[1].cluster).toBeUndefined();
    expect(t[1].rule).toContain('the class of ต carries over: read as high class');
    expect(t[1].respelled).toBe('หรวด');
    // a lone letter does double duty (the ร of สารภาพ)
    const s = decodeThai('สารภาพ');
    expect(s[1]).toMatchObject({ text: 'ร', initial: 'ร', respelled: 'ระ', tone: 'high' });
    // when a word keeps its ห, the cluster stays
    expect(decodeThai('หนังสือ')[0]).toMatchObject({ initial: 'หน', cluster: 'หน' });
  });

  it('keeps respelling-based letters when the split is not known', () => {
    const r = decodeThai('ผลไม้');
    expect(r.map((s) => s.initial)).toEqual(['ผ', 'ล', 'ม']);
    expect(r[0].final).toBe('น');
    expect(r[0].respelled).toBeUndefined();
  });

  it('describes the written initial of every split word, and its class matches the sound', () => {
    const letterClass = (ch: string) => decodeThai(`${ch}า`)[0].initialClass;
    for (const [surface, split] of Object.entries(THAI_ORTH_SPLITS)) {
      const r = decodeThai(surface);
      const parts = split.split('-');
      r.forEach((s, k) => {
        expect(surface.slice(s.start, s.end), surface).toBe(parts[k]);
        expect(s.initial, surface).toBeTruthy();
        // the written first consonant has the class used for the tone, unless the class is carried (then the rule says so)
        const first = s.initial?.replace(/^[เแโใไ]/, '').charAt(0) ?? '';
        if (letterClass(first) !== s.initialClass) expect(s.rule, `${surface}[${k}]`).toContain('carries over');
      });
    }
  });
});

describe('reviewed word splits', () => {
  const respelling = new Map<string, string>([
    ...THAI_ORTH_SETTLED.map((e) => [e.surface, e.respelling] as const),
    ...THAI_ORTH_EXCEPTIONS.map((e) => [e.surface, e.respelling] as const),
  ]);

  it('every split belongs to a listed word, concatenates to it and has one part per spoken syllable', () => {
    for (const [surface, split] of Object.entries(THAI_ORTH_SPLITS)) {
      const spoken = respelling.get(surface);
      expect(spoken, `${surface} is not listed`).toBeDefined();
      expect(split.split('-').join(''), surface).toBe(surface);
      expect(split.split('-').length, surface).toBe(spoken?.split('-').length);
    }
  });

  it('lays each spoken syllable over its written part', () => {
    const r = decodeThai('สารภาพ');
    expect(r.map((s) => s.text)).toEqual(['สา', 'ร', 'ภาพ']);
    expect(r.map((s) => s.tone)).toEqual(['rising', 'high', 'falling']);
    for (const s of r) expect('สารภาพ'.slice(s.start, s.end)).toBe(s.text);
    const h = decodeThai('โรงพยาบาล');
    expect(h.map((s) => s.text)).toEqual(['โรง', 'พ', 'ยา', 'บาล']);
  });

  it('lays a hidden-syllable word over the whole spelling when no split is known', () => {
    const r = decodeThai('ผลไม้');
    expect(r.map((s) => [s.start, s.end])).toEqual([[0, 5], [0, 5], [0, 5]]);
    expect(r.map((s) => s.text)).toEqual(['ผน', 'ละ', 'ไม้']);
  });

  it('reads ผลิต as two syllables, not as a cluster ผล; ผลาญ is a real cluster and is left to the rules', () => {
    expect(tones('ผลิต')).toEqual(['low', 'low']);
    expect(tones('ผลาญ')).toEqual(['rising']);
    expect(tones('ผลัก')).toEqual(['low']); // a real cluster: ผลัก (push)
    expect(tones('บรม')).toEqual(['mid', 'mid']);
  });
});

/** Everyday words with tones the author is certain of (not part of the brief's list). */
const EXTRA_MONO: Record<ThaiTone, string[]> = {
  mid: words('ดู ฟัง นอน ยืน รอ เจอ เย็น ยาว เบา เร็ว เลว แพง บาง เดียว กัน เอง ตัว ไฟ ดิน ใบ ตา ยาย ลุง อา แมว วัว ควาย ลิง นม เค็ม ชา พัน วัน คืน ปี เดือน ตอน แดง ดำ คุณ มัน เงิน เรือ บิน เรียน จำ ลืม ควร เคย ยัง โดย ใน บน ลง ทาง วาง'),
  rising: words('ผอม ผง ไหน หมี ขม ของ เหลือง เหรอ ฉัน ขอ สอน สูง ถึง ใส หา เห็น หิว สอง สาม แสน ขาย ถาม หนาว ขาว'),
  low: words('ผ่าน ผิด บอก ตอบ อ่าน ดื่ม ตื่น ส่ง ปิด เกลียด สุข ปวด เจ็บ อิ่ม เหนื่อย อุ่น เปียก ต่ำ เก่า เก่ง อื่น ดอก ปู่ เป็ด ไข่ เผ็ด จืด แปด เจ็ด หมื่น ก่อน บ่าย แก่ เก็บ ขอบ ออก กลับ จะ แต่ กับ'),
  high: words('ลุก รับ ทุกข์ ช้า น้อย ทั้ง น้า เนื้อ ล้าน เช้า คะ นะ ร้าน ร้อง คิด ยิ้ม รัก'),
  falling: words('ผู้ ผ้า นั่น นี่ เมื่อ ซึ่ง วิ่ง เริ่ม เศร้า ง่วง แห้ง สั้น น่า ยาก ห้อง ต้น พี่ ย่า ป้า กุ้ง ข้าว เปรี้ยว เหล้า เที่ยง ค่ำ ส้ม ค่ะ จ้ะ เครื่อง เพื่อน เล่น เพิ่ง แค่ เพื่อ ล่าง ข้าง ใต้ ขึ้น เข้า มืด พวก'),
};

/** word → tones, one letter per syllable (m l f h r). */
const EXTRA_POLY: Array<[string, string]> = [
  ['สารภาพ', 'rhf'], ['ราชการ', 'fhm'], ['สำเร็จ', 'rl'], ['ตำรวจ', 'ml'], ['กำเนิด', 'ml'], ['สำนัก', 'rh'], ['อำนาจ', 'mf'],
  ['ตุ๊กตา', 'hlm'], ['สกปรก', 'lll'], ['ชนบท', 'mhl'], ['คุณภาพ', 'mhf'], ['สุขภาพ', 'llf'], ['ปัจจุบัน', 'llm'],
  ['วันนี้', 'mh'], ['ตอนนี้', 'mh'], ['ขอโทษ', 'rf'], ['ชั่วโมง', 'fm'], ['นาที', 'mm'], ['เวลา', 'mm'], ['ภูเขา', 'mr'], ['ทะเล', 'hm'],
  ['แม่น้ำ', 'fh'], ['ผู้ชาย', 'fm'], ['ห้องน้ำ', 'fh'], ['เครื่องบิน', 'fm'], ['กำลัง', 'mm'], ['ตัวเอง', 'mm'], ['ทุกคน', 'hm'],
  ['เพื่อนบ้าน', 'ff'], ['ไม่ใช่', 'ff'], ['ไม่มี', 'fm'], ['ไม่ได้', 'ff'], ['ขอบใจ', 'lm'], ['ยินดี', 'mm'], ['เสียใจ', 'rm'], ['ดีใจ', 'mm'],
  ['สนใจ', 'rm'], ['ปัญหา', 'mr'], ['ความรัก', 'mh'], ['ความสุข', 'ml'], ['เมืองไทย', 'mm'], ['เชียงใหม่', 'ml'], ['ทุกวัน', 'hm'],
  ['ลูกชาย', 'fm'], ['ลูกสาว', 'fr'], ['พี่ชาย', 'fm'], ['น้องสาว', 'hr'], ['ผู้ใหญ่', 'fl'], ['เด็กชาย', 'lm'], ['กำมือ', 'mm'],
];

describe('broader word table (not confidently wrong)', () => {
  const letter: Record<string, ThaiTone> = { m: 'mid', l: 'low', f: 'falling', h: 'high', r: 'rising' };

  for (const tone of Object.keys(EXTRA_MONO) as ThaiTone[]) {
    it(`reads everyday ${tone}-tone words correctly with confidence ≥ 0.8`, () => {
      const problems: string[] = [];
      for (const w of EXTRA_MONO[tone]) {
        const r = decodeThai(w);
        if (r.length !== 1) problems.push(`${w}: ${r.length} syllables`);
        else if (r[0].tone !== tone) problems.push(`${w}: ${r[0].tone}`);
        else if (r[0].confidence < 0.8) problems.push(`${w}: confidence ${r[0].confidence}`);
      }
      expect(problems).toEqual([]);
    });
  }

  it('gives the right tones for the polysyllabic table, and is confident only when right', () => {
    const wrong: string[] = [];
    let confidentRight = 0;
    for (const [w, letters] of EXTRA_POLY) {
      const expected = [...letters].map((c) => letter[c]);
      const r = decodeThai(w);
      const confident = r.length > 0 && r.every((s) => s.confidence >= 0.8);
      const got = r.map((s) => s.tone);
      if (confident && JSON.stringify(got) !== JSON.stringify(expected)) wrong.push(`${w}: ${got.join(' ')}`);
      if (confident && JSON.stringify(got) === JSON.stringify(expected)) confidentRight++;
    }
    expect(wrong).toEqual([]);
    expect(confidentRight).toBeGreaterThanOrEqual(Math.floor(EXTRA_POLY.length / 2));
  });

  it('never returns a confident syllable whose tone differs from the table, syllable by syllable', () => {
    for (const [w, letters] of EXTRA_POLY) {
      const expected = [...letters].map((c) => letter[c]);
      const r = decodeThai(w);
      if (r.length !== expected.length) {
        // a different division: nothing in it may be confident
        for (const s of r) expect(s.confidence, w).toBeLessThan(0.8);
      }
    }
  });
});

describe('thaiOrthFeatures', () => {
  it('lists de-duplicated keys for a word', () => {
    const f = thaiOrthFeatures(decodeThai('นก'));
    expect(f).toEqual(['class:low', 'vowel:◌', 'final:k', 'ending:dead', 'rule:low+dead-short=high']);
  });

  it('reports marks and the tone rule with the mark', () => {
    const f = thaiOrthFeatures(decodeThai('บ้าน'));
    expect(f).toContain('mark:mai-tho');
    expect(f).toContain('rule:mid+mai-tho=falling');
    expect(f).toContain('class:mid');
    expect(f).toContain('vowel:◌า');
    expect(f).toContain('final:n');
    expect(f).toContain('ending:live');
    for (const [w, key] of [['ก่า', 'mark:mai-ek'], ['ก๊า', 'mark:mai-tri'], ['ก๋า', 'mark:mai-chattawa']] as const) {
      expect(thaiOrthFeatures(decodeThai(w)), w).toContain(key);
    }
  });

  it('reports live / dead rules', () => {
    expect(thaiOrthFeatures(decodeThai('มาก'))).toContain('rule:low+dead-long=falling');
    expect(thaiOrthFeatures(decodeThai('ขา'))).toContain('rule:high+live=rising');
    expect(thaiOrthFeatures(decodeThai('กัด'))).toContain('rule:mid+dead-short=low');
  });

  it('reports leading ห / อ, clusters, signs and irregular spellings', () => {
    expect(thaiOrthFeatures(decodeThai('หมา'))).toContain('lead:ho-nam');
    expect(thaiOrthFeatures(decodeThai('อยาก'))).toContain('lead:o-nam');
    expect(thaiOrthFeatures(decodeThai('ปลา'))).toContain('cluster:ปล');
    expect(thaiOrthFeatures(decodeThai('ปลา'))).not.toContain('lead:ho-nam');
    expect(thaiOrthFeatures(decodeThai('สัตว์'))).toContain('sign:thanthakhat');
    expect(thaiOrthFeatures(decodeThai('กรรม'))).toContain('special:ro-han');
    expect(thaiOrthFeatures(decodeThai('น้ำ'))).toContain('irregular');
    expect(thaiOrthFeatures(decodeThai('ดีๆ'))).toContain('sign:mai-yamok');
  });

  it('skips syllables below confidence 0.6 and removes duplicates across syllables', () => {
    const low = decodeThai('ฤดู');
    expect(low[0].confidence).toBeLessThan(0.6);
    expect(thaiOrthFeatures(low)).not.toContain('special:rue');
    const f = thaiOrthFeatures(decodeThai('โรงเรียน'));
    expect(new Set(f).size).toBe(f.length);
    expect(f.filter((k) => k === 'class:low')).toHaveLength(1);
    expect(thaiOrthFeatures([])).toEqual([]);
    const syl = decodeThai('นก')[0];
    expect(thaiOrthFeatures([{ ...syl, confidence: 0.59 }])).toEqual([]);
    expect(thaiOrthFeatures([{ ...syl, confidence: 0.6 }]).length).toBeGreaterThan(0);
  });

  it('only produces keys that describeThaiOrthFeature understands', () => {
    const all = new Set<string>();
    for (const w of [
      ...Object.values(MONO).flat(),
      ...THANTHAKHAT.map(([w]) => w),
      ...POLY.map(([w]) => w),
      'กรรม', 'ก่า', 'ก๊า', 'ก๋า', 'ดีๆ', 'ผลไม้',
    ]) {
      for (const k of thaiOrthFeatures(decodeThai(w))) all.add(k);
    }
    expect(all.size).toBeGreaterThan(40);
    for (const k of all) {
      const d = describeThaiOrthFeature(k);
      expect(d, k).not.toBe(k);
      expect(d.length, k).toBeGreaterThan(8);
    }
  });
});

describe('describeThaiOrthFeature', () => {
  it('labels the documented key shapes in plain words', () => {
    expect(describeThaiOrthFeature('rule:low+dead-short=high')).toBe('low-class consonant, short dead syllable → high tone');
    expect(describeThaiOrthFeature('rule:low+dead-long=falling')).toBe('low-class consonant, long dead syllable → falling tone');
    expect(describeThaiOrthFeature('rule:high+live=rising')).toBe('high-class consonant, live syllable → rising tone');
    expect(describeThaiOrthFeature('rule:mid+mai-tho=falling')).toBe('mid-class consonant with mai tho → falling tone');
    expect(describeThaiOrthFeature('class:mid')).toContain('mid-class consonant');
    expect(describeThaiOrthFeature('class:low')).toContain('low-class');
    expect(describeThaiOrthFeature('vowel:เ◌า')).toBe('the vowel เ◌า (short)');
    expect(describeThaiOrthFeature('vowel:◌ี')).toBe('the vowel ◌ี (long)');
    expect(describeThaiOrthFeature('vowel:◌')).toContain('no vowel written');
    expect(describeThaiOrthFeature('final:ŋ')).toContain('ng');
    expect(describeThaiOrthFeature('final:k')).toContain('stop');
    expect(describeThaiOrthFeature('ending:live')).toContain('live syllable');
    expect(describeThaiOrthFeature('ending:dead')).toContain('dead syllable');
    expect(describeThaiOrthFeature('mark:mai-ek')).toContain('mai ek');
    expect(describeThaiOrthFeature('lead:ho-nam')).toContain('ห');
    expect(describeThaiOrthFeature('lead:o-nam')).toContain('อย่า');
    expect(describeThaiOrthFeature('cluster:กร')).toBe('consonant cluster กร: both letters are said');
    expect(describeThaiOrthFeature('sign:thanthakhat')).toContain('not said');
    expect(describeThaiOrthFeature('sign:mai-yamok')).toContain('ๆ');
    expect(describeThaiOrthFeature('special:ro-han')).toContain('รร');
    expect(describeThaiOrthFeature('special:rue')).toContain('ฤ');
    expect(describeThaiOrthFeature('irregular')).toContain('usual rules');
  });

  it('returns the key itself for unknown or malformed keys', () => {
    for (const k of ['', 'nope', 'class:purple', 'rule:bad', 'mark:x', 'final:z', 'sign:x']) expect(describeThaiOrthFeature(k)).toBe(k);
  });

  it('uses no exclamation marks', () => {
    for (const k of ['class:mid', 'ending:dead', 'irregular', 'special:rue', 'lead:ho-nam']) expect(describeThaiOrthFeature(k)).not.toContain('!');
  });
});

describe('provenance (PLAN6 A)', () => {
  it('marks a rule decode as source "rule" on every syllable', () => {
    for (const w of ['นก', 'สมอง', 'เข้าใจ', 'ฟอนต์']) {
      const r = decodeThai(w);
      expect(r.length, w).toBeGreaterThan(0);
      for (const s of r) {
        expect(s.source, w).toBe('rule');
        expect(s.sourceId, w).toBeUndefined();
        expect(s.ruleTone, w).toBeUndefined();
      }
    }
  });

  it('marks words decoded from the reviewed lists as "exception-list" with their source id', () => {
    for (const w of ['น้ำ', 'ขนม', 'ผลไม้', 'สำเร็จ']) {
      for (const s of decodeThai(w)) {
        expect(s.source, w).toBe('exception-list');
        expect(s.sourceId, w).toBe('adapter-th:orth-exceptions');
      }
    }
  });

  it('marks a respelling decode as "dictionary" unless told otherwise', () => {
    expect(decodeThaiRespelling('ขนม', 'ขะ-หฺนม').every((s) => s.source === 'dictionary')).toBe(true);
    expect(decodeThaiRespelling('ขนม', 'ขะ-หฺนม')[0].sourceId).toBeUndefined();
    const d = decodeThaiRespelling('ขนม', 'ขะ-หฺนม', undefined, { sourceId: 'dict:kaikki-th-2026-09-28' });
    expect(d.every((s) => s.source === 'dictionary' && s.sourceId === 'dict:kaikki-th-2026-09-28')).toBe(true);
    const a = decodeThaiRespelling('ขนม', 'ขะ-หฺนม', undefined, { source: 'author', sourceId: 'text:abc' });
    expect(a.every((s) => s.source === 'author' && s.sourceId === 'text:abc')).toBe(true);
  });

  it('keeps what the rules said when a respelling disagrees with a confident rule tone', () => {
    // กา is read mid by the rules (confidence 0.95); a respelling that says ก้า (falling) is kept, and the rule tone is recorded
    const r = decodeThaiRespelling('กา', 'ก้า');
    expect(r[0].tone).toBe('falling');
    expect(r[0].ruleTone).toBe('mid');
    expect(r[0].irregular).toBe(true);
    // agreement: nothing recorded
    expect(decodeThaiRespelling('กา', 'กา')[0].ruleTone).toBeUndefined();
    // the rules not confident (the word has more than one reading): nothing recorded
    expect(decodeThaiRespelling('สมอง', 'สะ-หฺมอง').every((s) => s.ruleTone === undefined)).toBe(true);
  });

  it('does not set ruleTone when the syllable counts differ', () => {
    expect(decodeThaiRespelling('ผลไม้', 'ผน-ละ-ไม้').every((s) => s.ruleTone === undefined)).toBe(true);
  });

  it('exports decodeThaiByRulesOnly, which ignores both word lists', () => {
    expect(decodeThaiByRulesOnly('น้ำ')[0]).toMatchObject({ source: 'rule', vowel: '◌ำ', vowelLength: 'short' });
    expect(decodeThaiByRulesOnly('ผลไม้')).toHaveLength(2); // the list says three syllables
    expect(decodeThai('ผลไม้')).toHaveLength(3);
    expect(decodeThaiByRulesOnly('นก')).toEqual(decodeThai('นก'));
    expect(decodeThaiByRulesOnly('abc')).toEqual([]);
    expect(decodeThaiByRulesOnly('ตำรวจ').every((s) => s.confidence < 0.8)).toBe(true); // while the list reads it confidently
    expect(decodeThai('ตำรวจ').every((s) => s.confidence >= 0.9)).toBe(true);
  });

  it('lets the IPA win for ข้าวหมกไก่ but flags the disagreement (หมก is a dead syllable, so it cannot be rising)', () => {
    const noIpa = decodeThaiRespelling('ข้าวหมกไก่', 'ข้าว-หมก-ไก่');
    expect(noIpa.map((s) => s.tone)).toEqual(['falling', 'low', 'low']);
    const withIpa = decodeThaiRespelling('ข้าวหมกไก่', 'ข้าว-หมก-ไก่', '/kʰaːw˥˩.mok̚˩˩˦.kaj˨˩/');
    expect(withIpa.map((s) => s.tone)).toEqual(['falling', 'rising', 'low']);
    expect(withIpa[1]).toMatchObject({ irregular: true });
    expect(withIpa[1].confidence).toBeLessThanOrEqual(0.7);
  });
});

describe('conservative policy (PLAN6 A): patterns the spelling does not settle', () => {
  const notSure = (w: string) => {
    const r = decodeThaiByRulesOnly(w);
    expect(r.length, w).toBeGreaterThan(0);
    for (const s of r) expect(s.confidence, w).toBeLessThan(0.8);
    return r;
  };

  it('keeps the tone but not the confidence for thanthakhat over loan letters', () => {
    for (const w of ['ฟอนต์', 'ซิงก์', 'เมาส์', 'พอร์ต', 'กอล์ฟ', 'เต็นท์']) {
      const r = notSure(w);
      expect(r[0].tone, w).toBeDefined();
    }
    const f = decodeThaiByRulesOnly('ฟอนต์')[0];
    expect(f.rule).toContain('Not sure: thanthakhat silences a letter that loanwords silence');
    // Pali letters under thanthakhat keep it
    for (const w of ['ทิพย์', 'ภัณฑ์', 'สิงห์']) expect(decodeThaiByRulesOnly(w)[0].confidence, w).toBeGreaterThanOrEqual(0.8);
  });

  it('does not trust an unmarked dead syllable closed by a loan-style stop (ชีส, เชฟ, วัตต์)', () => {
    for (const w of ['ชีส', 'เชฟ', 'ยีส', 'ฟุตซ']) notSure(w);
    // the plain native stops and the finals of CORE words stay confident
    for (const w of ['บาป', 'ภาพ', 'รถ', 'ลาก', 'ลาภ', 'มาด', 'สุข']) expect(decodeThaiByRulesOnly(w)[0].confidence, w).toBeGreaterThanOrEqual(0.8);
  });

  it('does not trust a silent ร after จ ส ศ ซ in a dead syllable (สรุป, จรัส)', () => {
    notSure('สรุป');
    notSure('จรัส');
    for (const w of ['สร้าง', 'ศรี', 'ทราย', 'ทราบ']) expect(decodeThaiByRulesOnly(w)[0].confidence, w).toBeGreaterThanOrEqual(0.8);
  });

  it('does not trust ล / ว clusters before a short open vowel (พละ), but พระ stays', () => {
    notSure('พละ');
    notSure('พลิ');
    expect(decodeThaiByRulesOnly('พระ')[0].confidence).toBeGreaterThanOrEqual(0.8);
    expect(decodeThaiByRulesOnly('ปลา')[0].confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('does not trust the vowels ◌็อ and แ◌็ (English loans), but เ◌็ stays', () => {
    notSure('บล็อก');
    notSure('แล็บ');
    expect(decodeThaiByRulesOnly('เด็ก')[0].confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('does not trust no written vowel before ร ล ณ ญ ฬ (Pali), but คน นก มด stay', () => {
    for (const w of ['นร', 'คณ', 'มล']) notSure(w);
    for (const w of ['คน', 'นก', 'มด', 'ลม']) expect(decodeThaiByRulesOnly(w)[0].confidence, w).toBeGreaterThanOrEqual(0.8);
  });

  it('does not trust an unmarked word that ends in a long vowel (loanwords take the English stress)', () => {
    for (const w of ['อิตาลี', 'เบคอน', 'ยูเรเนียม', 'เทวดา']) notSure(w);
    // a tone mark anywhere in the word, or a short end, keeps the word confident
    for (const w of ['เข้าใจ', 'ไม่มี', 'แม่น้ำ']) for (const s of decodeThaiByRulesOnly(w)) expect(s.confidence, w).toBeGreaterThanOrEqual(0.8);
  });

  it('does not trust three or more syllables with no tone mark, or a stop before an open end', () => {
    notSure('แคริบเบียน');
    notSure('ฮอกกี้');
    notSure('จักจี้');
  });

  it('does not trust a class that may pass across a leading vowel (เสมอ, เขย่า) or across ◌ำ', () => {
    for (const w of ['เสมอ', 'เผยอ', 'เขม่า', 'ตำรอด', 'สำนอด']) notSure(w);
  });

  it('does not trust a long เ◌ closed by a stop at the start of a longer word (เอกสาร)', () => {
    notSure('เอกสาร');
    notSure('เอกมัย');
    
  });

  it('treats โล่งอก as ambiguous: the อ may start a syllable', () => {
    const r = decodeThaiByRulesOnly('โล่งอก');
    expect(r.length).toBeGreaterThan(0);
    for (const s of r) expect(s.confidence).toBeLessThan(0.8);
  });

  it('says why in the rule sentence, only where the doubt changed the answer', () => {
    expect(decodeThaiByRulesOnly('ชีส')[0].rule).toContain('Not sure:');
    expect(decodeThaiByRulesOnly('นก')[0].rule).not.toContain('Not sure');
    // a syllable already below 0.8 for another reason is not annotated
    expect(decodeThaiByRulesOnly('ขนมปัง').every((s) => !(s.rule ?? '').includes('Not sure'))).toBe(true);
  });
});

describe('respelling input forms', () => {
  it('reads a bare consonant as a syllable with the unwritten short a (กวี is respelled ก-วี)', () => {
    const r = decodeThaiRespelling('กวี', 'ก-วี');
    expect(r.map((s) => s.tone)).toEqual(['low', 'mid']);
    expect(r[0]).toMatchObject({ vowelSound: 'a', ending: 'dead' });
  });

  it('accepts a phrase respelling with spaces between words', () => {
    const r = decodeThaiRespelling('ทุกที', 'ทุก ที');
    expect(r.map((s) => s.tone)).toEqual(['high', 'mid']);
    const p = decodeThaiRespelling('ไม่อยู่', 'ไม่ หฺยู่');
    expect(p.map((s) => s.tone)).toEqual(['falling', 'low']);
  });
});


describe('tighter policy (second PLAN6 pass)', () => {
  const notSure = (w: string) => {
    const r = decodeThaiByRulesOnly(w);
    expect(r.length, w).toBeGreaterThan(0);
    for (const s of r) expect(s.confidence, w).toBeLessThan(0.8);
  };
  const sure = (w: string) => {
    const r = decodeThaiByRulesOnly(w);
    expect(r.length, w).toBeGreaterThan(0);
    for (const s of r) expect(s.confidence, w).toBeGreaterThanOrEqual(0.8);
  };

  it('does not trust ป พ ผ + ล or ดร + a short vowel in a closed syllable (ปะ-หลัด, พะ-ลัง, ผะ-หลึก, ดะ-รุ)', () => {
    for (const w of ['ปลัด', 'พลัง', 'ผลึก', 'ดรุ']) notSure(w);
    for (const w of ['กลับ', 'ปลา', 'ปลูก', 'เปล่า', 'ครับ', 'พริก']) sure(w);
  });

  it('does not trust a short loan with a leading เ / แ and a low-class stop (เทป)', () => {
    notSure('เทป');
    notSure('แทป');
    for (const w of ['เล็ก', 'เรียก', 'โลก', 'โรค', 'เลือด']) sure(w);
  });

  it('does not trust a dead syllable closed by ก before a stop-initial syllable (ตุ๊ก-กะ-ตา, จัก-กะ-จั่น)', () => {
    notSure('ตุ๊กตา');
    notSure('จักจั่น');
    notSure('ปักเป้า');
  });

  it('does not trust a one-syllable dead word that starts with ฮ or ฟ (English loans)', () => {
    notSure('ฮอก');
    notSure('ฟุก');
    sure('ฟัง');
  });

  it('does not trust thanthakhat over ด or ม (ไซด์), while ดิ์ stays', () => {
    notSure('ไซด์');
    sure('ศักดิ์');
  });

  it('does not trust โ with a high-class initial and a final (โสน), marked or not', () => {
    notSure('โสน');
    notSure('โสร่ง');
    sure('โลก');
  });

  it('does not trust no written vowel after ภ ธ ฮ ฟ, but ขม stays', () => {
    notSure('ภก');
    sure('ขม');
  });

  it('does not trust a final ร after ุ (ธุร) or เ◌า after a leading ห (เหรา)', () => {
    notSure('ธุร');
    notSure('เหรา');
    sure('เขา');
    sure('ควร');
  });

  it('does not trust a ร-cluster with a long vowel before a stop (ปราก, แกรด), while พระ stays', () => {
    notSure('ปราก');
    notSure('แกรด');
    sure('พระ');
    sure('พริก');
  });

  it('does not trust a short open ิ or ุ after a low-class consonant inside a word (ภูมิ)', () => {
    notSure('ภูมิแพ้');
    notSure('ภูมิต้านทาน');
  });

  it('does not trust a long string of syllables with an unwritten or non-plain-final syllable', () => {
    notSure('ตลาดนัดสวนจตุจักร');
    const r = decodeThaiByRulesOnly('ตลาดนัดสวนจตุจักร');
    expect(r.length).toBeGreaterThanOrEqual(5);
  });

  it('no longer lists ผลาญ as two syllables (the dictionary reads a cluster), and every list entry still decodes', () => {
    expect(THAI_ORTH_EXCEPTIONS.some((e) => e.surface === 'ผลาญ')).toBe(false);
    expect(THAI_ORTH_SETTLED.some((e) => e.surface === 'ผลาญ')).toBe(false);
    expect(decodeThai('ผลาญ')[0].source).toBe('rule');
  });
});
