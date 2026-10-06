import type { Work, WorkRights } from '../core';
import { ids } from '../core';

export const MODERN_ALBANIAN_WORK_ID = 'sq-modern-open';

export const MODERN_ALBANIAN_RIGHTS: WorkRights = {
  state: 'verified-open-licence', copyrightStatus: 'licensed', permission: 'granted', canBundle: true, userImportOnly: false,
  canModify: true, canStoreOffline: true, canBundleAudio: false, audiobook: 'unknown', verified: true,
  verifiedBy: 'Wikimedia source-manifest and CC BY-SA licence record', verifiedAt: '2026-10-02',
  basis: 'Selected Albanian Wikipedia revisions are distributed under CC BY-SA 4.0; each document retains its exact revision, URL, attribution and content signature.',
  licensing: 'CC BY-SA 4.0', sourceRepository: 'sq.wikipedia.org rendered page API', licence: 'CC BY-SA 4.0', jurisdictions: ['*'], statusByJurisdiction: { '*': 'licensed' },
  attributionRequired: true, shareAlike: true, commercialUse: true,
  evidence: ['https://sq.wikipedia.org/wiki/Wikipedia:CC_BY-SA', 'https://creativecommons.org/licenses/by-sa/4.0/'],
  acquisitionNotes: 'Twenty-seven modern-standard Albanian article or section documents are available through the lazy library. Source-fidelity review is recorded; native-speaker and beginner-level review remain open.',
};

/** Authentic modern-standard Albanian reference reading, kept at stage 7 as a bridge to unrestricted prose. */
export const MODERN_ALBANIAN_WORKS: Work[] = [{
  id: ids.work('albania-sq', MODERN_ALBANIAN_WORK_ID), courseId: 'albania-sq', lang: 'sq', stageId: ids.stage('albania-sq', '7'), role: 'extensive', order: 900,
  title: 'Modern standard Albanian open reading', publisher: 'Wikipedia shqip', edition: 'Selected sq.wikipedia.org revisions checked 2026-10-02',
  purpose: ['authentic modern-standard Albanian reference reading', 'ordinary geography, daily life, animals, food and society topics'],
  streams: ['library'], variety: 'sq', genre: 'educational reference', domains: ['library', 'culture', 'geography'],
  rights: MODERN_ALBANIAN_RIGHTS, bibliographyVerified: true, ingestion: 'ingested', readiness: 'implemented',
  notes: 'Twenty-seven source-faithful documents from nine Albanian Wikipedia revisions. Familja and the Shqipëria — Kultura section are retained only as quarantined raw sources because their orthography fails the modern-standard quality bar. This is an intermediate bridge collection, not an A0 or native-speaker certification.',
}];
