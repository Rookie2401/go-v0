/**
 * The Thai ladder is data. These invariants keep it honest: nothing bundled, nothing claimed public domain, nothing
 * marked verified, English rescue present at every stage, romanization only as a Stage 0 rescue, Scripture outside.
 */
import { describe, expect, it } from 'vitest';
import { COURSES } from '../../src/core';
import { THAI_ASSISTANCE, THAI_AUDIO_POLICY, THAI_COURSE_ID, THAI_OTCV_RIGHTS, THAI_OUTSIDE_LADDER, THAI_SCRIPTURE_POLICY, THAI_STAGES, THAI_WORKS } from '../../src/course/thai';

describe('Thai ladder manifest', () => {
  it('belongs to the Thailand course and runs Stage 0, Grades 1–9, then open reading', () => {
    expect(COURSES.some((c) => c.id === THAI_COURSE_ID && c.lang === 'th')).toBe(true);
    expect(THAI_STAGES.map((s) => s.key)).toEqual(['0', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9', 'open']);
    expect(THAI_STAGES.map((s) => s.index)).toEqual([...THAI_STAGES.keys()]);
    expect(THAI_STAGES[0].kind).toBe('pre-reader');
    expect(THAI_STAGES.at(-1)?.kind).toBe('open');
    expect(new Set(THAI_STAGES.map((s) => s.id)).size).toBe(THAI_STAGES.length);
  });

  it('keeps draft works distinct from exact licensed and public-domain records', () => {
    expect(THAI_WORKS.length).toBeGreaterThan(50);
    const externalVerified = new Set([
      'work:thailand-th:th-gap-recovery-aesop',
      'work:thailand-th:thai-wikisource-nueng-sai-mu-mai-muan',
      'work:thailand-th:thai-wikisource-phai-chai-lae-hai-than',
      'work:thailand-th:thai-wikisource-phu-yai-ha-pha-mai',
      'work:thailand-th:nms-vetal-selected',
      'work:thailand-th:bible-thai-otcv2025',
    ]);
    expect(THAI_WORKS.filter((w) => w.rights.state?.startsWith('verified-')).map((w) => w.id).sort()).toEqual([...externalVerified].sort());
    for (const w of THAI_WORKS) {
      if (externalVerified.has(w.id)) {
        expect(w.rights.canBundle, w.title).toBe(true);
        expect(w.rights.userImportOnly, w.title).toBe(false);
        expect(w.rights.verified, w.title).toBe(true);
        expect(w.rights.verifiedBy, w.title).toBeTruthy();
        expect(w.rights.evidence?.length ?? 0, w.title).toBeGreaterThan(0);
      } else if (w.rights.state === 'course-authored') {
        expect(w.rights.canBundle, w.title).toBe(true);
        expect(w.author, w.title).toMatch(/Course authors/);
        expect(w.notes, w.title).toMatch(/unreviewed|review/i);
      } else {
        expect(w.rights.canBundle, w.title).toBe(false);
        expect(w.rights.userImportOnly, w.title).toBe(true);
        expect(w.rights.verified, w.title).toBe(false);
        expect(w.bibliographyVerified, w.title).toBe(false);
        expect(['in-copyright', 'unknown'], w.title).toContain(w.rights.copyrightStatus);
        expect(w.rights.permission === 'none' || w.rights.permission === 'unknown', w.title).toBe(true);
      }
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
    const scripture = THAI_WORKS.filter((w) => w.role === 'scripture');
    expect(scripture.map((w) => w.id)).toEqual(['work:thailand-th:bible-thai-otcv2025']);
    expect(scripture[0].stageId).toBe(THAI_STAGES.find((s) => s.key === 'open')?.id);
  });

  it('records declined THSV11 separately from the verified text-only replacement', () => {
    expect(THAI_SCRIPTURE_POLICY.declined).toMatchObject({ id: 'THSV11', status: 'permission-declined', canBundleText: false, canBundleAudio: false, externalLinkOnly: true });
    expect(THAI_SCRIPTURE_POLICY.candidate).toMatchObject({ status: 'verified-open-licence', canBundleText: true, canBundleAudio: false, releaseId: 'a62f327aa0179709-rev2' });
    expect(THAI_OTCV_RIGHTS).toMatchObject({ state: 'verified-open-licence', canBundle: true, canBundleAudio: false, verified: true, verifiedAt: '2026-10-01' });
    expect(THAI_SCRIPTURE_POLICY.technicalFixture).toMatchObject({ status: 'technical-fixture-only', draftTranslation: true });
    expect(THAI_SCRIPTURE_POLICY.notApproved).toEqual(expect.arrayContaining(['Thai KJV', 'TH1940']));
    expect(THAI_AUDIO_POLICY.bundledRecordings).toBe('none');
    expect(THAI_OTCV_RIGHTS.canBundleAudio).toBe(false);
  });
});
