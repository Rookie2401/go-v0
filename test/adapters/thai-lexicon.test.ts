import { describe, expect, it } from 'vitest';
import type { AnalysisCandidate, PartOfSpeech, RegisterTag } from '../../src/core';
import { thAdapter, thLexicon } from '../../src/adapters/th';
import { CORE_ROWS } from '../../src/adapters/thai/lexicon-core';
import { FUNCTION_ROWS } from '../../src/adapters/thai/function-words';
import { CLASSIFIER_ROWS } from '../../src/adapters/thai/classifiers';
import { best, run } from './helpers';

const ALL_ROWS = [...CORE_ROWS, ...FUNCTION_ROWS, ...CLASSIFIER_ROWS];
const TAGS: RegisterTag[] = [
  'standard', 'colloquial', 'formal', 'literary', 'archaic', 'historical', 'royal', 'religious',
  'regional-isan', 'regional-north', 'regional-south', 'teochew', 'child-directed', 'slang',
];

/** Analyse a form written alone: one token, all its candidates. */
function candidatesOf(form: string): AnalysisCandidate[] {
  const r = run('th', form);
  expect(r.tokens.map((t) => t.surface), `"${form}" is one token`).toEqual([form]);
  return r.analyses[0].candidates;
}
const withPos = (form: string, pos: PartOfSpeech) => candidatesOf(form).find((c) => c.pos === pos);

describe('Thai lexicon: lists', () => {
  it('has no duplicate form + part of speech, and every gloss is a short plain string', () => {
    const seen = new Set<string>();
    for (const e of thLexicon.entries) {
      const key = `${e.lemma}|${e.pos}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
      expect(e.gloss.trim(), key).toBe(e.gloss);
      expect(e.gloss.length, key).toBeGreaterThan(0);
      expect(e.gloss.length, key).toBeLessThanOrEqual(70);
    }
  });

  it('is large enough to be useful and says what it is (about 600 entries; sizes of the three lists)', () => {
    expect(CORE_ROWS.length).toBeGreaterThanOrEqual(300);
    expect(FUNCTION_ROWS.length).toBeGreaterThanOrEqual(90);
    expect(CLASSIFIER_ROWS.filter((r) => r[1] === 'CLF').length).toBeGreaterThanOrEqual(40);
    expect(thLexicon.entries.length).toBeGreaterThanOrEqual(550);
  });

  it('every listed row is one token and analyses to its part of speech, gloss, role and register', () => {
    for (const [form, pos, gloss, extra] of ALL_ROWS) {
      const c = withPos(form, pos);
      expect(c, `${form} ${pos}`).toBeDefined();
      expect(c!.gloss, form).toBe(gloss);
      expect(c!.lemma, form).toBe(form);
      if (extra?.role) expect(c!.role, form).toBe(extra.role);
      else expect(c!.role, form).toBeUndefined();
      if (extra?.register) expect(c!.register, form).toEqual(extra.register);
      else expect(c!.register, form).toBeUndefined();
      if (extra?.counts) expect(c!.notes?.counts, form).toBe(extra.counts);
      if (extra?.unit) expect(c!.notes?.unit, form).toBe('yes');
    }
  });

  it('only uses register tags from the contract', () => {
    for (const row of ALL_ROWS) for (const t of row[3]?.register ?? []) expect(TAGS, row[0]).toContain(t);
  });
});

describe('Thai lexicon: function words carry a role', () => {
  const ROLE_WORDS = [
    // aspect and modals
    'กำลัง', 'จะ', 'เคย', 'แล้ว', 'อยู่', 'ได้', 'ต้อง', 'ควร', 'อาจ', 'น่าจะ', 'คง', 'ยัง', 'เพิ่ง', 'อยาก',
    // negation, answers, questions
    'ไม่', 'อย่า', 'มิ', 'ใช่', 'เปล่า', 'ไหม', 'มั้ย', 'หรือ', 'เหรอ', 'ล่ะ', 'ทำไม', 'อะไร', 'ใคร', 'ไหน', 'กี่',
    // polite and mood particles
    'ครับ', 'ค่ะ', 'คะ', 'จ้ะ', 'จ๊ะ', 'ฮะ', 'นะ', 'สิ', 'ซิ', 'เถอะ', 'หรอก', 'เลย', 'ด้วย', 'น่ะ', 'แหละ', 'ละ',
    // connectives and discourse markers
    'ก็', 'แต่', 'เพราะ', 'จึง', 'ดังนั้น', 'ถ้า', 'แม้', 'เมื่อ', 'ก่อน', 'ส่วน', 'สำหรับ', 'และ',
    // relative and complement markers, prepositions
    'ที่', 'ซึ่ง', 'อัน', 'ว่า', 'ให้', 'ของ', 'ใน', 'จาก', 'กับ', 'โดย', 'ตาม',
    // pronouns
    'ฉัน', 'ผม', 'เรา', 'เขา', 'เธอ', 'มัน', 'คุณ', 'ท่าน', 'ข้าพเจ้า', 'ดิฉัน', 'หนู', 'กู', 'มึง',
  ];

  it.each(ROLE_WORDS)('%s has a role', (form) => {
    const roles = candidatesOf(form).map((c) => c.role).filter(Boolean);
    expect(roles.length, form).toBeGreaterThan(0);
    for (const r of roles) {
      expect(r!.length).toBeLessThanOrEqual(60);
      expect(r).not.toMatch(/!/);
    }
  });

  it('gives the roles learners need in plain words', () => {
    expect(withPos('กำลัง', 'AUX')!.role).toBe('progressive marker');
    expect(withPos('นะ', 'PART')!.role).toBe('softening particle');
    expect(withPos('เถอะ', 'PART')!.role).toBe('urging particle');
    expect(withPos('จึง', 'CONJ')!.role).toBe('result connective');
    expect(withPos('ไหม', 'PART')!.role).toMatch(/question/);
    expect(withPos('ที่', 'SCONJ')!.role).toMatch(/relative/);
    expect(withPos('ว่า', 'SCONJ')!.role).toMatch(/complement/);
    expect(withPos('ถูก', 'AUX')!.role).toBe('passive marker');
    expect(withPos('ให้', 'ADP')!.role).toMatch(/benefactive/);
  });

  it('ordinary content words have neither a role nor a register', () => {
    for (const f of ['กิน', 'บ้าน', 'ไป', 'น้ำ', 'ใหญ่', 'โรงเรียน']) {
      const c = candidatesOf(f)[0];
      expect(c.role, f).toBeUndefined();
      expect(c.register, f).toBeUndefined();
    }
  });

  it('a role is carried through a whole sentence analysis', () => {
    const r = run('th', 'ฉันกำลังกินข้าวอยู่ครับ');
    expect(best(r, 'กำลัง').role).toBe('progressive marker');
    expect(best(r, 'อยู่').role).toBe('continuing-state marker');
    expect(best(r, 'ครับ').role).toBe('polite particle (man speaking)');
    expect(best(r, 'กิน').role).toBeUndefined();
  });
});

describe('Thai lexicon: register', () => {
  const EXPECT: Array<[string, RegisterTag[]]> = [
    ['ข้าพเจ้า', ['formal']], ['ดิฉัน', ['formal']], ['กระผม', ['formal']],
    ['หนู', ['child-directed']], ['หม่ำ', ['child-directed']],
    ['กู', ['slang']], ['มึง', ['slang']],
    ['ทรง', ['royal', 'religious']], ['เสด็จ', ['royal']], ['พระ', ['royal', 'religious']], ['พระองค์', ['royal', 'religious']],
    ['รับสั่ง', ['royal']], ['พระราชทาน', ['royal']], ['ถวาย', ['royal', 'religious']],
    ['อาตมา', ['religious']], ['โยม', ['religious']], ['พระเจ้า', ['religious']],
    ['ซึ่ง', ['formal']], ['แห่ง', ['formal']], ['ณ', ['formal']], ['ดังนั้น', ['formal']], ['มิ', ['formal']],
    ['ข้า', ['archaic']], ['เจ้า', ['archaic', 'literary']], ['ฤๅ', ['literary', 'archaic']], ['ครั้น', ['literary']],
    ['จ้ะ', ['colloquial']], ['ฮะ', ['colloquial']], ['น่ะ', ['colloquial']], ['แหละ', ['colloquial']], ['เหรอ', ['colloquial']],
    ['บ่', ['regional-isan']], ['ข้อย', ['regional-isan']], ['เด้อ', ['regional-isan']], ['หยัง', ['regional-isan']], ['ไส', ['regional-isan']],
    ['หรอย', ['regional-south']], ['แหลง', ['regional-south']],
    ['กิ๋น', ['regional-north']], ['แอ่ว', ['regional-north']], ['จ๊าด', ['regional-north']],
  ];

  it.each(EXPECT)('%s is tagged %j', (form, tags) => {
    const reg = candidatesOf(form).flatMap((c) => c.register ?? []);
    for (const t of tags) expect(reg, form).toContain(t);
  });

  it('every regional word carries its tag (none untagged)', () => {
    const regional = ['บ่', 'ข้อย', 'เด้อ', 'หยัง', 'ไส', 'หรอย', 'แหลง', 'กิ๋น', 'แอ่ว', 'จ๊าด'];
    for (const f of regional) expect(candidatesOf(f).every((c) => c.register?.some((t) => t.startsWith('regional-'))), f).toBe(true);
  });

  it('ordinary pronouns and kin terms are standard (no tag) and say what they are', () => {
    for (const f of ['ฉัน', 'ผม', 'เรา', 'เขา', 'เธอ', 'มัน']) {
      const c = candidatesOf(f)[0];
      expect(c.pos, f).toBe('PRON');
      expect(c.register, f).toBeUndefined();
    }
    for (const f of ['พี่', 'น้อง', 'ลุง', 'ป้า', 'น้า', 'อา', 'ยาย', 'ปู่', 'ย่า']) {
      const c = candidatesOf(f)[0];
      expect(c.pos, f).toBe('NOUN');
      expect(c.role, f).toMatch(/kin term/);
      expect(c.register, f).toBeUndefined();
    }
  });
});

describe('Thai lexicon: classifiers', () => {
  const COUNTED = [
    'คน', 'ตัว', 'อัน', 'เล่ม', 'ใบ', 'ลูก', 'คัน', 'หลัง', 'ห้อง', 'แผ่น', 'เส้น', 'ดอก', 'ต้น', 'ผืน', 'คู่', 'ชิ้น', 'ก้อน', 'เม็ด',
    'ขวด', 'แก้ว', 'ถ้วย', 'จาน', 'ชาม', 'ฉบับ', 'หน', 'องค์', 'รูป', 'ท่าน', 'สาย', 'ด้าม', 'เครื่อง', 'ลำ', 'ขบวน', 'ซอง', 'กล่อง',
    'ถุง', 'ช่อ', 'พวง', 'ฝูง',
  ];

  it.each(COUNTED)('สอง%s: the classifier after a number, with what it counts', (clf) => {
    const r = run('th', `สอง${clf}`);
    const i = r.tokens.findIndex((t) => t.surface === clf);
    expect(i, `${clf} is its own token after สอง`).toBeGreaterThan(0);
    const c = r.analyses[i].candidates[0];
    expect(c.pos).toBe('CLF');
    expect(typeof c.notes?.counts).toBe('string');
    expect((c.notes!.counts as string).length).toBeGreaterThan(2);
  });

  it('เรื่อง and ครั้ง count themselves and say what they count', () => {
    expect(withPos('เรื่อง', 'CLF')!.notes?.counts).toBe('stories, matters');
    expect(withPos('ครั้ง', 'NOUN')!.notes?.counts).toBe('times, occasions');
    expect(withPos('ครั้ง', 'NOUN')!.notes?.unit).toBe('yes');
  });

  it('a word that is a classifier and an ordinary noun is read by what is around it', () => {
    // after a number: classifier
    expect(best(run('th', 'ฉันมีห้องสองห้อง'), 'ห้อง', 1).pos).toBe('CLF');
    expect(best(run('th', 'ฉันมีห้องสองห้อง'), 'ห้อง', 0).pos).toBe('NOUN');
    expect(best(run('th', 'แมวสามตัว'), 'ตัว').pos).toBe('CLF');
    expect(best(run('th', 'ฉันมีส้มสามลูก'), 'ลูก').pos).toBe('CLF');
    // noun + classifier + this: classifier
    expect(best(run('th', 'หนังสือเล่มนี้'), 'เล่ม').pos).toBe('CLF');
    // otherwise the ordinary word, at modest confidence
    const room = best(run('th', 'เขาเข้าห้อง'), 'ห้อง');
    expect(room.pos).toBe('NOUN');
    expect(room.confidence).toBeLessThan(0.8);
    // หลัง after a number counts houses; otherwise it is "after"
    expect(best(run('th', 'สองหลัง'), 'หลัง').pos).toBe('CLF');
    expect(best(run('th', 'หลังบ้าน'), 'หลัง').pos).not.toBe('CLF');
  });

  it('Thai and Arabic digits before a classifier count as numbers too', () => {
    expect(best(run('th', 'ห้องที่ 2 ห้อง'), 'ห้อง', 1).pos).toBe('CLF');
  });
});

describe('Thai lexicon: words with two readings', () => {
  it('ถูก is the passive marker before a verb and "cheap; correct" otherwise', () => {
    expect(best(run('th', 'เด็กถูกหมากัด'), 'ถูก').pos).toBe('AUX');
    expect(best(run('th', 'ของถูกมาก'), 'ถูก').pos).toBe('ADJ');
    expect(best(run('th', 'ของถูกมาก'), 'ถูก').gloss).toBe('cheap; correct');
  });

  it('an ambiguous word keeps its alternatives and a modest confidence', () => {
    const cs = candidatesOf('ตา');
    expect(cs.length).toBeGreaterThanOrEqual(1);
    for (const f of ['เขา', 'ท่าน', 'หนู', 'ใบ', 'แก่']) {
      const c = candidatesOf(f);
      if (c.length > 1) expect(c[0].confidence, f).toBeLessThanOrEqual(0.6);
    }
  });

  it('time and money words count themselves (no false classifier error)', () => {
    for (const f of ['วัน', 'คืน', 'ปี', 'เดือน', 'สัปดาห์', 'ชั่วโมง', 'นาที', 'บาท', 'ครั้ง']) {
      expect(candidatesOf(f).some((c) => c.pos === 'CLF' || c.notes?.unit === 'yes'), f).toBe(true);
    }
    expect(thAdapter.checkProduction(run('th', 'ฉันมีสองวัน').tokens, run('th', 'ฉันมีสองวัน').analyses, 'ฉันมีสองวัน')).toEqual([]);
    expect(thAdapter.checkProduction(run('th', 'สามชั่วโมง').tokens, run('th', 'สามชั่วโมง').analyses, 'สามชั่วโมง')).toEqual([]);
  });
});

describe('Thai lexicon: the bundled seed analyses are unchanged', () => {
  it('keeps the seed reading of the first seed words', () => {
    const r = run('th', 'พระเจ้าทรงรักโลก');
    expect(best(r, 'พระเจ้า')).toMatchObject({ pos: 'PROPN', gloss: 'God' });
    expect(best(r, 'ทรง')).toMatchObject({ pos: 'AUX', role: 'royal or divine verb marker' });
    expect(best(r, 'รัก')).toMatchObject({ pos: 'VERB', gloss: 'to love' });
    expect(best(r, 'ทรง').register).toEqual(['royal', 'religious']);
    expect(best(r, 'พระเจ้า').register).toEqual(['religious']);
    const d = run('th', 'ผมไม่เข้าใจเรื่องหนึ่ง');
    expect(best(d, 'เรื่อง').pos).toBe('NOUN'); // ambiguous as before: noun first
  });

  it('unknown words are still left unanalysed', () => {
    const r = run('th', 'ภูมิศาสตร์');
    expect(r.analyses[0].candidates).toEqual([]);
  });
});
