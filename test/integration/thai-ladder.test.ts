/**
 * The Thai ladder is data. These invariants keep it honest: nothing bundled, nothing claimed public domain, nothing
 * marked verified, English rescue present at every stage, romanization only as a Stage 0 rescue, Scripture outside.
 */
import { describe, expect, it } from 'vitest';
import { COURSES } from '../../src/core';
import { THAI_ASSISTANCE, THAI_AUDIO_POLICY, THAI_COURSE_ID, THAI_OUTSIDE_LADDER, THAI_SCRIPTURE_POLICY, THAI_STAGES, THAI_WORKS } from '../../src/course/thai';

describe('Thai ladder manifest', () => {
  it('belongs to the Thailand course and runs Stage 0, Grades 1–9, then open reading', () => {
    expect(COURSES.some((c) => c.id === THAI_COURSE_ID && c.lang === 'th')).toBe(true);
    expect(THAI_STAGES.map((s) => s.key)).toEqual(['0', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9', 'open']);
    expect(THAI_STAGES.map((s) => s.index)).toEqual([...THAI_STAGES.keys()]);
    expect(THAI_STAGES[0].kind).toBe('pre-reader');
    expect(THAI_STAGES.at(-1)?.kind).toBe('open');
    expect(new Set(THAI_STAGES.map((s) => s.id)).size).toBe(THAI_STAGES.length);
  });

  it('makes no rights claim it cannot support', () => {
    expect(THAI_WORKS.length).toBeGreaterThan(50);
    for (const w of THAI_WORKS) {
      expect(w.rights.canBundle, w.title).toBe(false);
      expect(w.rights.userImportOnly, w.title).toBe(true);
      expect(w.rights.verified, w.title).toBe(false);
      expect(w.bibliographyVerified, w.title).toBe(false);
      expect(['in-copyright', 'unknown'], w.title).toContain(w.rights.copyrightStatus);
      expect(w.rights.permission === 'none' || w.rights.permission === 'unknown', w.title).toBe(true);
    }
  });

  it('has unique work ids, every work on a real stage, and the compulsory spine in order', () => {
    const stageIds = new Set(THAI_STAGES.map((s) => s.id));
    expect(new Set(THAI_WORKS.map((w) => w.id)).size).toBe(THAI_WORKS.length);
    for (const w of THAI_WORKS) expect(stageIds.has(w.stageId), w.title).toBe(true);
    const spine = THAI_WORKS.filter((w) => w.role === 'spine').sort((a, b) => a.order - b.order).map((w) => w.title);
    expect(spine).toEqual([
      'อ่าน อาน อ๊าน — ระดับ 1–4', 'มานะ มานี ป.1', 'มานะ มานี ป.2', 'มานะ มานี ป.3', 'มานะ มานี ป.4', 'แก้วจอมแก่น', 'มานะ มานี ป.5', 'มานะ มานี ป.6',
      'ส้มสีม่วง', 'แว้งที่รัก', 'ความสุขของกะทิ', 'ความสุขของกะทิ ตอน ตามหาพระจันทร์', 'เด็กชายมะลิวัลย์', 'ผีเสื้อและดอกไม้', 'เวลาในขวดแก้ว',
      'มอม (in เพื่อนนอน)', 'อยู่กับก๋ง', 'ลูกอีสาน', 'ก่อกองทราย', 'ข้างหลังภาพ', 'จดหมายจากเมืองไทย',
    ]);
    const g8 = THAI_WORKS.filter((w) => w.role === 'spine' && w.step).map((w) => w.step);
    expect(g8).toEqual(['8.2', '8.3', '8.4', '8.5', '8.6', '8.7', '8.8', '8.9']);
  });

  it('marks regional and historical varieties on the works that carry them', () => {
    const by = (slug: string) => THAI_WORKS.find((w) => w.id.endsWith(`:${slug}`));
    expect(by('luk-isan')?.registers).toContain('regional-isan');
    expect(by('waeng-thi-rak')?.registers).toContain('regional-south');
    expect(by('yu-kap-kong')?.registers).toContain('teochew');
    expect(by('khang-lang-phap')?.registers).toContain('literary');
  });

  it('removes the system gradually and never removes English', () => {
    const order = ['heavy', 'contextual', 'light', 'clean', 'invisible'];
    let last = 0;
    for (const s of THAI_STAGES) {
      const p = s.assistance;
      expect(p, s.key).toBe(THAI_ASSISTANCE[s.key]);
      expect(p.layers, s.key).toContain('english');
      expect(p.layers, s.key).toContain('gloss');
      expect(new Set(p.layers).size, s.key).toBe(p.layers.length);
      const v = order.indexOf(p.visibility);
      expect(v, s.key).toBeGreaterThanOrEqual(last);
      last = v;
      expect(p.romanization, s.key).toBe(s.key === '0' ? 'rescue' : 'never');
      expect(p.decodingFirst, s.key).toBe(s.key === '0');
    }
    expect(THAI_STAGES.find((s) => s.key === 'g9')?.assistance.chrome).toBe('minimal');
  });

  it('keeps Scripture and testimony outside the numbered ladder', () => {
    expect(THAI_OUTSIDE_LADDER).toContain('scripture');
    expect(THAI_WORKS.some((w) => w.role === 'scripture')).toBe(false);
  });

  it('records the Scripture and audio policy without unblocking anything', () => {
    expect(THAI_SCRIPTURE_POLICY.declined).toMatchObject({ id: 'THSV11', status: 'permission-declined', canBundleText: false, canBundleAudio: false, externalLinkOnly: true });
    // the named replacement is a candidate only: nothing is bundled until its release metadata is verified
    expect(THAI_SCRIPTURE_POLICY.candidate).toMatchObject({ status: 'candidate-unverified', canBundleText: false, canBundleAudio: false });
    expect(THAI_SCRIPTURE_POLICY.candidate.releaseId).toBeUndefined();
    expect(THAI_SCRIPTURE_POLICY.technicalFixture).toMatchObject({ status: 'technical-fixture-only', draftTranslation: true });
    expect(THAI_SCRIPTURE_POLICY.notApproved).toEqual(expect.arrayContaining(['Thai KJV', 'TH1940']));
    expect(THAI_AUDIO_POLICY.bundledRecordings).toBe('none');
    // no work of the ladder claims audio that may be bundled
    for (const w of THAI_WORKS) expect(w.rights.canBundle, w.title).toBe(false);
  });
});
