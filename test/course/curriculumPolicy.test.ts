import { describe, expect, it } from 'vitest';
import { STAGE_CONTRACTS, releaseDecision, stageAvailability } from '../../src/course/curriculumPolicy';
import type { CurriculumMetadata } from '../../src/course/curriculumPolicy';
import type { Text } from '../../src/core/model';
import { THAI_STAGES, THAI_WORKS } from '../../src/course/thai';

const stage = THAI_STAGES[0];
const work = { ...THAI_WORKS[0], stageId: stage.id, role: 'spine' as const, rights: { ...THAI_WORKS[0].rights, state: 'course-authored' as const, canBundle: true, verified: true } };
const text = { id: 'test', workId: work.id, lang: 'th', kind: 'story', published: true, unpublishedReasons: [], editorialTags: [], contentVersion: 1, generated: false } as unknown as Text;
const metadata: CurriculumMetadata = { lifecycle: 'published', role: 'controlled', registers: ['standard'], rejectionReasons: [], provenance: { kind: 'original' }, audio: { state: 'unavailable', rightsCleared: false } };
describe('curriculum release contracts', () => {
  it('covers each of the 60 real stage declarations with noncertifying transitions', () => {
    expect(STAGE_CONTRACTS).toHaveLength(60);
    expect(new Set(STAGE_CONTRACTS.map(s => s.id)).size).toBe(60);
    expect(STAGE_CONTRACTS.every(s => s.targetCapabilities.length && !s.exitEvidence.certification)).toBe(true);
  });
  it('does not count empty, inaccessible, unpublished or assessment stages', () => {
    expect(stageAvailability(stage, [work], []).published).toBe(false);
    expect(stageAvailability(stage, [work], [text], new Map(), () => false).published).toBe(false);
    expect(stageAvailability(stage, [work], [{ ...text, published: false }]).published).toBe(false);
    expect(stageAvailability(stage, [work], [text], new Map([[text.id, { ...metadata, role: 'assessment' }]])).published).toBe(false);
    expect(stageAvailability(stage, [work], [{ ...text, listeningAssessmentId: 'listen:heldout' }]).published).toBe(false);
    expect(stageAvailability(stage, [{ ...work, role: 'audio' }], [text]).published).toBe(false);
    expect(stageAvailability(stage, [work], [text]).workCount).toBe(1);
  });
  it('retains rejection reasons and refuses pending rights', () => {
    expect(releaseDecision({ ...work, rights: { ...work.rights, state: 'rights-unverified' } }, text).published).toBe(false);
    expect(releaseDecision(work, text, { ...metadata, lifecycle: 'rejected', rejectionReasons: ['Damaged transcription'] }).reasons).toContain('Damaged transcription');
  });
  it('requires current named native review for generated wording, independent of audio', () => {
    expect(releaseDecision(work, { ...text, generated: true }, metadata).published).toBe(false);
    const reviewed = { ...metadata, nativeReview: { by: 'Reviewer', at: '2026-10-04', contentVersion: 1, language: 'th' as const } };
    expect(releaseDecision(work, { ...text, generated: true }, reviewed)).toMatchObject({ published: true, audioPublished: false });
    expect(releaseDecision(work, { ...text, generated: true, contentVersion: 2 }, reviewed).published).toBe(false);
  });
  it('keeps Thai adaptations distinct and Albanian translation provenance explicit', () => {
    const reviewed = { ...metadata, nativeReview: { by: 'Reviewer', at: '2026-10-04', contentVersion: 1, language: 'th' as const }, provenance: { kind: 'adaptation' as const, sourceTextId: text.id, adapter: 'Editor', description: 'Shortened narrative' } };
    expect(releaseDecision(work, text, reviewed).published).toBe(false);
    expect(releaseDecision(work, text, { ...reviewed, provenance: { ...reviewed.provenance, sourceTextId: 'original' } }).published).toBe(true);
    const sq = { ...text, lang: 'sq' as const };
    const translation = { ...metadata, provenance: { kind: 'translation' as const }, nativeReview: { ...reviewed.nativeReview, language: 'sq' as const } };
    expect(releaseDecision(work, sq, translation).published).toBe(false);
    expect(releaseDecision(work, sq, { ...translation, provenance: { kind: 'translation', sourceTitle: 'Original', sourceLanguage: 'de', translator: 'Translator' } }).published).toBe(true);
  });
});
