/** Source-backed Biblical Aramaic shelf inventory; no designed learning sequence is implied. */
import type { Stage, Stream, Work, WorkRights } from '../core';
import { DEFAULT_ASSISTANCE, ids } from '../core';
import { ARAMAIC_PASSAGES } from '../adapters/aramaic/resources';
export const ARAMAIC_COURSE_ID = 'aramaic-arc';
export const ARAMAIC_STREAMS: Stream[] = [{
  id: ids.stream(ARAMAIC_COURSE_ID, 'scripture'), courseId: ARAMAIC_COURSE_ID, lang: 'arc', key: 'scripture',
  label: 'Biblical Aramaic', description: 'Source-backed Biblical Aramaic readings from Daniel, Ezra, Jeremiah and Genesis.',
  kind: 'scripture', order: 0, available: true,
}];
export const ARAMAIC_SHELVES: Stage[] = [{
  id: ids.stage(ARAMAIC_COURSE_ID, 's0'), courseId: ARAMAIC_COURSE_ID, lang: 'arc', index: 0, key: 's0',
  label: 'Source readings', kind: 'shelf', purpose: ['Read bundled Biblical Aramaic source passages with source-backed word help.'],
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
  sourceRepository: 'https://github.com/openscriptures/morphhb', licence: 'WLC text public domain; OSHB morphology CC BY 4.0; Open Scriptures HebrewLexicon (Strong transcription, Lexical Index) CC BY 4.0',
  attributionRequired: true, shareAlike: false, redistribution: true, commercialUse: true,
  attributionText: 'Original work of the Open Scriptures Hebrew Bible available at https://github.com/openscriptures/morphhb',
  modifications: 'Only A-coded source words, morpheme slash boundaries joined; Daniel 2:4 follows the qere path. Glosses: Strong meaning, else the Lexical Index definition; whitespace normalised.',
  retrievedAt: '2026-11-05', proofreading: 'Source-extraction comparison; not independent linguistic proofreading.',
  evidenceRecords: [{ kind: 'publisher-statement', url: 'https://github.com/openscriptures/morphhb', checkedAt: '2026-11-05', by: 'Codex (automated source check)', note: 'README: WLC text public domain; lemma and morphology CC BY 4.0.' },
    { kind: 'publisher-statement', url: 'https://github.com/openscriptures/HebrewLexicon', checkedAt: '2026-11-12', by: 'Claude (automated source check)', note: 'README: the files are released under CC BY 4.0; the Strong and BDB texts remain public domain. No share-alike term.' }],
};
export const ARAMAIC_WORKS: Work[] = ARAMAIC_PASSAGES.map((passage, index) => ({
  id: ids.work(ARAMAIC_COURSE_ID, passage.slug), courseId: ARAMAIC_COURSE_ID, lang: 'arc', stageId: ARAMAIC_SHELVES[0].id,
  order: index, title: passage.title, purpose: [`Read ${passage.reference} with source-backed word help.`], role: 'scripture', streams: ['scripture'], variety: 'arc-bib',
  rights: { ...RIGHTS }, bibliographyVerified: false, optional: true, ingestion: 'bundled',
  edition: 'OSHB WLC, qere reading path', sourceUrl: `https://github.com/openscriptures/morphhb/blob/master/wlc/${
    passage.slug.startsWith('daniel-') ? 'Dan' : passage.slug.startsWith('ezra-') ? 'Ezra' : passage.slug.startsWith('jeremiah-') ? 'Jer' : 'Gen'
  }.xml`,
}));
