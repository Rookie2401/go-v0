/**
 * Initial Biblical Aramaic shelf. Only the two declared excerpts are bundled.
 * Aramaic is its own learner account; future dialects are not treated as this variety.
 */
import type { Stage, Stream, Work, WorkRights } from '../core';
import { DEFAULT_ASSISTANCE, ids } from '../core';
export const ARAMAIC_COURSE_ID = 'aramaic-arc';
export const ARAMAIC_STREAMS: Stream[] = [{
  id: ids.stream(ARAMAIC_COURSE_ID, 'scripture'), courseId: ARAMAIC_COURSE_ID, lang: 'arc', key: 'scripture',
  label: 'Biblical Aramaic', description: 'Source-backed first readings from Daniel; the remainder of Daniel and Ezra is not bundled.',
  kind: 'scripture', order: 0, available: true,
}];
export const ARAMAIC_SHELVES: Stage[] = [{
  id: ids.stage(ARAMAIC_COURSE_ID, 's0'), courseId: ARAMAIC_COURSE_ID, lang: 'arc', index: 0, key: 's0',
  label: 'First authentic readings', kind: 'shelf', purpose: ['Read square script with source-backed word help.', 'Compare repeated words and their inflections in two short passages.'],
  assistance: DEFAULT_ASSISTANCE,
}];
const RIGHTS: WorkRights = {
  state: 'verified-public-domain',
  verifiedBy: 'Codex (automated primary distributor statement check; not human legal review)', verifiedAt: '2026-11-05',
  basis: 'The OSHB distributor README states that the WLC base text remains public domain. OSHB lemma/morphology and Open Scriptures lexical transcription are separately CC BY 4.0, with their required attribution retained.',
  jurisdictions: ['US'], statusByJurisdiction: { US: 'public-domain' },
  copyrightStatus: 'public-domain', permission: 'not-needed', canBundle: true, userImportOnly: false, audiobook: 'unknown',
  // Verification here records the primary distributor statement; no human rights review is claimed.
  verified: false, canModify: true, canStoreOffline: true, canBundleAudio: false,
  sourceRepository: 'https://github.com/openscriptures/morphhb', licence: 'WLC text public domain; OSHB morphology CC BY 4.0',
  attributionRequired: true, shareAlike: false, redistribution: true, commercialUse: true,
  attributionText: 'Original work of the Open Scriptures Hebrew Bible available at https://github.com/openscriptures/morphhb',
  modifications: 'Only A-coded source words, morpheme slash boundaries joined; Daniel 2:4 follows the qere path.',
  retrievedAt: '2026-11-05', proofreading: 'Source-extraction comparison; not independent linguistic proofreading.',
  evidenceRecords: [{ kind: 'publisher-statement', url: 'https://github.com/openscriptures/morphhb', checkedAt: '2026-11-05', by: 'Codex (automated source check)', note: 'README: WLC text public domain; lemma and morphology CC BY 4.0.' }],
};
export const ARAMAIC_WORKS: Work[] = [
  { slug: 'daniel-2-4b', title: 'Daniel 2:4b — the reply to the king', purpose: ['Read the address to the king, two imperatives, the dream and its interpretation.'] },
  { slug: 'daniel-2-20', title: 'Daniel 2:20 — Daniel speaks', purpose: ['Read participles, construct and emphatic states, and the repeated word for time.'] },
].map((w, index) => ({
  id: ids.work(ARAMAIC_COURSE_ID, w.slug), courseId: ARAMAIC_COURSE_ID, lang: 'arc', stageId: ARAMAIC_SHELVES[0].id,
  order: index, title: w.title, purpose: w.purpose, role: 'scripture', streams: ['scripture'], variety: 'arc-bib',
  rights: { ...RIGHTS }, bibliographyVerified: false, optional: true, ingestion: 'bundled', genericLevel: 'easy',
  edition: 'OSHB WLC, qere reading path', sourceUrl: 'https://github.com/openscriptures/morphhb/blob/master/wlc/Dan.xml',
}));
