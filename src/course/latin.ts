/**
 * The Latin course: its catalogue of works (rights records) for the bundled corpus in data/corpus/la
 * (built by scripts/corpus-la-build.mts; docs/latin/CORPUS.md). Three works so far:
 *
 *   ritchie-fabulae-faciles      Ritchie, Fabulae Faciles (1903): the four tales are four documents (chapters 1-4) of this one work.
 *   caesar-de-bello-gallico-1    Caesar, De bello Gallico I, chapters 1-7 (macronised Latin Wikisource edition).
 *   vulgata-clementina           The Clementine Vulgate (1592): the Scripture slices (chapters 1-11 are the slices in the order of the build script).
 *
 * RIGHTS. All three are old texts recorded as public domain with the basis written out below; the records say which parts of the
 * basis were NOT established from a primary source. The Wikisource transcriptions carry their own licence (CC BY-SA 4.0), named on
 * each document. This is a record for the owner to confirm, not legal advice.
 */
import type { Stage, Stream, Work, WorkRights } from '../core';
import { DEFAULT_ASSISTANCE, ids } from '../core';

export const LATIN_COURSE_ID = 'latin-la';
const LANG = 'la' as const;

const stream = (order: number, key: string, kind: Stream['kind'], label: string, description: string): Stream => ({
  id: ids.stream(LATIN_COURSE_ID, key), courseId: LATIN_COURSE_ID, lang: LANG, key, label, description, kind, order, available: true,
});

export const LATIN_STREAMS: Stream[] = [
  stream(0, 'library', 'library', 'Reading', 'Latin read as it was written: graded tales and Roman prose.'),
  stream(1, 'scripture', 'scripture', 'Vulgate', 'The Clementine Vulgate, with English only as rescue.'),
];

const shelf = (index: number, label: string, purpose: string[]): Stage => ({
  id: ids.stage(LATIN_COURSE_ID, `s${index}`), courseId: LATIN_COURSE_ID, lang: LANG, index, key: `s${index}`, label, kind: 'shelf', purpose,
  assistance: DEFAULT_ASSISTANCE,
});

/** Shelves, not locks. */
export const LATIN_SHELVES: Stage[] = [
  shelf(0, 'Graded tales', ['Ritchie, Fabulae Faciles: simple narrative Latin of 1903 in a classical register']),
  shelf(1, 'Roman prose', ['Caesar, De bello Gallico I: classical historical prose, vowel length marked']),
  shelf(2, 'Vulgate', ['the Clementine Vulgate (1592), whole chapters, one verse per sentence']),
];

const COMMON: Pick<WorkRights, 'copyrightStatus' | 'permission' | 'canBundle' | 'userImportOnly' | 'canModify' | 'canStoreOffline' | 'canBundleAudio' | 'audiobook' | 'verified' | 'verifiedBy' | 'verifiedAt' | 'jurisdictions' | 'statusByJurisdiction' | 'state'> = {
  state: 'verified-public-domain', copyrightStatus: 'public-domain', permission: 'not-needed', canBundle: true, userImportOnly: false,
  canModify: true, canStoreOffline: true, canBundleAudio: false, audiobook: 'unknown', verified: true,
  verifiedBy: 'Claude (AI), Latin corpus lane, 2026-10-17, from the evidence listed; not legal advice - to be confirmed by the owner',
  verifiedAt: '2026-10-17',
  jurisdictions: ['US', 'EU', 'DE'], statusByJurisdiction: { US: 'public-domain', EU: 'public-domain', DE: 'public-domain' },
};

const WIKISOURCE = 'Latin Wikisource (Vicifons, https://la.wikisource.org): the transcription (and, for Caesar, the macron edition) is offered under CC BY-SA 4.0; the underlying text is public domain.';

const RITCHIE_RIGHTS: WorkRights = {
  ...COMMON,
  basis: 'First published in 1903 (London): a work published before 1929 is in the public domain in the United States. For the EU and Germany (life plus 70 years) the author\'s '
    + 'death year was NOT established in this session; Francis Ritchie\'s school reader of 1903 is presumed to be long out of term. NOT ESTABLISHED FROM A PRIMARY SOURCE: the death year of Francis Ritchie '
    + '(if he died after 1955 the EU/DE term would still run), and the exact print edition behind the Wikisource transcription.',
  sourceRepository: 'Latin Wikisource, page "Ritchie\'s Fabulae Faciles" (https://la.wikisource.org/wiki/Ritchie%27s_Fabulae_Faciles); held by romance-v0/data/la/ritchie-fabulae-faciles.wikitext.json',
  licence: 'Text public domain; Wikisource transcription CC BY-SA 4.0',
  licenceName: 'CC BY-SA', licenceVersion: '4.0', attributionRequired: true, shareAlike: true,
  attributionText: 'Francis Ritchie, Fabulae Faciles (1903), public domain. Transcription: Latin Wikisource, CC BY-SA 4.0.',
  countryOfOrigin: 'GB', editionYear: 1903, retrievedAt: '2026-10-17',
  checksum: 'd50eb1fd84ef7bb62ed81adc5bd56cc34a8475bb7d5ea8c18f7a275e00ef3ee5',
  modifications: 'Only the Latin paragraphs; the English argument before each tale is left out; paragraphs split into sentences; one stray U+FFFD character removed (Hercules 23.5).',
  proofreading: 'not proofread against the printed book',
  transcriptionSource: WIKISOURCE,
  evidence: [
    'Latin Wikisource page "Ritchie\'s Fabulae Faciles" is headed "A First Latin Reader", year 1903 (the page\'s title template).',
    WIKISOURCE,
  ],
  compliance: 'Each document names the author, the year and the Wikisource transcription with its licence in source.attribution and source.licenseNote.',
};

const CAESAR_RIGHTS: WorkRights = {
  ...COMMON,
  basis: 'Gaius Julius Caesar died in 44 BC: the text is far out of copyright everywhere. The edition used marks vowel length (macrons) and is from Latin Wikisource, whose '
    + 'transcription and markup are offered under CC BY-SA 4.0; that licence is honoured (attribution and share-alike) although the text itself needs neither. NOT ESTABLISHED: which print edition the Wikisource text follows.',
  sourceRepository: 'Latin Wikisource, page "Commentarii de bello Gallico/Liber I" (https://la.wikisource.org/wiki/Commentarii_de_bello_Gallico/Liber_I); held by romance-v0/data/la/caesar-bg-1.text.json',
  licence: 'Text public domain; Wikisource edition CC BY-SA 4.0',
  licenceName: 'CC BY-SA', licenceVersion: '4.0', attributionRequired: true, shareAlike: true,
  attributionText: 'Gaius Iulius Caesar, Commentarii de bello Gallico I, public domain. Text with macrons: Latin Wikisource, CC BY-SA 4.0.',
  countryOfOrigin: 'IT', retrievedAt: '2026-10-17',
  checksum: '0194ad6cdfb9dc822d53a0e67bc94c221e1ea66208e4d0e68f56cd89d30ca637',
  modifications: 'Chapters 1-7 only; the source\'s hard line breaks joined with a space; split into sentences. Macrons kept.',
  proofreading: 'not proofread against a printed edition',
  transcriptionSource: WIKISOURCE,
  evidence: [
    'Caesar died in 44 BC (well-known; no edition dependency).',
    WIKISOURCE,
  ],
  compliance: 'Each document names the author and the Wikisource edition with its licence in source.attribution and source.licenseNote.',
};

const VULGATE_RIGHTS: WorkRights = {
  ...COMMON,
  basis: 'The Clementine Vulgate was published in 1592 (Rome, Pope Clement VIII): far out of copyright everywhere. The digital text is seven1m/open-bibles\' USFX file, which that '
    + 'repository lists among its public-domain and openly licensed Bible texts. NOT ESTABLISHED FROM A PRIMARY SOURCE: a rights statement read directly from that repository in this session '
    + '(the file was taken from the copy held by the Vetus V0 app, whose README records "Clementine Vulgate (1592), via seven1m/open-bibles (USFX), public domain").',
  sourceRepository: 'seven1m/open-bibles (https://github.com/seven1m/open-bibles), lat-clementine.usfx.xml, as held by vetus-v0/data/vulgate',
  licence: 'Public Domain (Clementine Vulgate, 1592)',
  attributionRequired: false, shareAlike: false,
  countryOfOrigin: 'IT', editionYear: 1592, retrievedAt: '2026-10-17',
  checksum: '5da5f3c07fa6896d4a2b45f5f309c3ece43e554fd059b31b8ae3688bbd182baf',
  modifications: 'none: each sentence is exactly one verse of the source (surrounding whitespace trimmed); only whole chapters are bundled.',
  proofreading: 'the distributor\'s text; no proofreading of our own',
  evidence: [
    'The Vetus V0 README (vetus-v0/README.md) records the Vulgate text source as "Clementine Vulgate (1592), via seven1m/open-bibles (USFX)", licence public domain.',
    'Each bundled verse is compared with the USFX file by scripts/verify-la-scripture.mts and recorded in data/verified/scripture.json (translation latVulgClementine).',
  ],
};

let order = 0;
const work = (shelfIndex: number, w: Partial<Work> & Pick<Work, 'title' | 'rights' | 'role'> & { slug: string }): Work => {
  const { slug, ...rest } = w;
  return {
    id: ids.work(LATIN_COURSE_ID, slug), courseId: LATIN_COURSE_ID, lang: LANG, stageId: ids.stage(LATIN_COURSE_ID, `s${shelfIndex}`),
    order: order++, purpose: [], bibliographyVerified: false, optional: true, ingestion: 'bundled', readiness: 'implemented', ...rest,
  };
};

export const LATIN_WORKS: Work[] = [
  work(0, {
    slug: 'ritchie-fabulae-faciles', title: 'Fabulae Faciles: A First Latin Reader', author: 'Francis Ritchie', publicationYear: 1903, role: 'spine',
    edition: 'Latin Wikisource transcription', streams: ['library'], era: '20th century (classical register)', genre: 'graded reader: myth', audience: 'learners of Latin',
    genericLevel: 'easy', sourceUrl: 'https://la.wikisource.org/wiki/Ritchie%27s_Fabulae_Faciles', rights: RITCHIE_RIGHTS,
    purpose: ['simple connected narrative Latin: Perseus, Hercules, the Argonauts, Ulysses'], notes: 'Four documents (chapters 1-4), one per tale.',
  }),
  work(1, {
    slug: 'caesar-de-bello-gallico-1', title: 'Commentarii de bello Gallico, Liber I (chapters 1-7)', author: 'Gaius Iulius Caesar', role: 'subsidiary',
    edition: 'Latin Wikisource edition with vowel length marked', streams: ['library'], era: 'antiquity', genre: 'history', domains: ['history'], genericLevel: 'classical',
    sourceUrl: 'https://la.wikisource.org/wiki/Commentarii_de_bello_Gallico/Liber_I', rights: CAESAR_RIGHTS, authorDied: -44, purpose: ['classical historical prose'],
  }),
  work(2, {
    slug: 'vulgata-clementina', title: 'Biblia Sacra Vulgata (Clementine, 1592)', publicationYear: 1592, role: 'scripture', edition: 'Clementine Vulgate 1592',
    streams: ['scripture'], era: 'early modern (text of late antiquity)', genre: 'Bible translation', domains: ['theology'], genericLevel: 'intermediate',
    sourceUrl: 'https://github.com/seven1m/open-bibles', rights: VULGATE_RIGHTS, purpose: ['the Bible in Latin'],
    notes: 'Whole chapters, one verse per sentence. Psalm 23 (Hebrew numbering) is the Vulgate\'s Psalm 22.',
  }),
];
