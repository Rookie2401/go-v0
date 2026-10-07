/**
 * The Hindi course (India team): streams, shelves, assistance profiles and the first catalogue of works.
 *
 * Target: modern Standard Hindi (Devanagari). The course is a text-first comprehensible-input environment: engineered
 * Hindi (Stage 0) → native children's Hindi → general native Hindi → unrestricted reading. Like Spanish and German it
 * has a surplus of text, so this is a catalogue with shelves, not a syllabus. Shelves are an orientation for
 * browsing and never a lock and never a gate; what the learner reads next is decided by his own record (GoLearn).
 *
 * THE SHELVES. Stage 0 is three bands (s0a, s0b, s0c) of controlled stories written for the course. Classes 1–12 are
 * READING-DIFFICULTY shelves. They are NOT Indian school grades (Class 6 here is not a sixth-standard textbook), and
 * a school textbook's own class number is stored nowhere as a level. Open Reading has no difficulty claim.
 *
 * THE OWNER'S ROUGH CUMULATIVE-EXPOSURE GUIDE (running words read, an ORIENTATION ONLY, never a promotion gate):
 *   Stage 0 ≈ the first 30k · Class 1 ≈ 30–75k · 2 ≈ 75–150k · 3 ≈ 150–300k · 4 ≈ 300–500k · 5 ≈ 500–750k ·
 *   6 ≈ 750k–1m · 7 ≈ 1–1.5m · 8 ≈ 1.5–2.5m · 9 ≈ 2.5–4m · 10 ≈ 4–6m · 11 ≈ 6–10m · 12 ≈ 10m+.
 * No CEFR band is attached to any shelf.
 *
 * RIGHTS: a rights state is a fact someone verified, never an inference. Nothing is public domain because it is old or
 * because it is online. Every entry below is one of: course-authored (bundled; the text is machine-drafted and
 * unreviewed), rights-unverified (a candidate: a date of death is a LEAD, never a conclusion), or
 * prohibited-from-bundling (a modern work, or a modern translation: the learner's own lawful copy only).
 * BIBLIOGRAPHY: titles and authors are from general knowledge and are marked unverified (`bibliographyVerified:
 * false`). A publication year is given only where it is certain; otherwise the field is left out.
 *
 * HERITAGE. Awadhi ('awa'), Braj ('bra') and the mixed language of the Sant poets ('hi-sant') are related literary
 * languages, not Modern Standard Hindi and not an older stage of it. They are catalogued in the heritage stream, are
 * never spine texts of a Modern Standard Hindi shelf, and do not count as evidence about Modern Standard Hindi.
 */
import type { AssistanceProfile, HelpLayer, RegisterTag, Stage, Stream, Work, WorkRights, WorkRole } from '../core';
import { ids } from '../core';
import { mergeReadingBridgeWorks } from './readingBridges';
import { CURRICULUM_ACQUIRED_WORKS } from './curriculumAcquired';

export const HINDI_COURSE_ID = 'india-hi';
const LANG = 'hi' as const;

// ───────────────────────────── assistance profiles ─────────────────────────────

const L = (...layers: HelpLayer[]): HelpLayer[] => layers;

/**
 * The system removes itself shelf by shelf, as in Thai. Decoding the script comes first at Stage 0; romanization is a
 * recorded rescue through Class 2 at most and 'never' after that; English rescue is present in every profile, easy
 * at the start and only on request by the last shelves.
 */
export const HINDI_ASSISTANCE: Record<string, AssistanceProfile> = {
  s0a: { visibility: 'heavy', defaultHighlight: 'strong', layers: L('gloss', 'decoding', 'phrase', 'english', 'grammar', 'sentence', 'history'), englishRescue: 'easy', romanization: 'rescue', decodingFirst: true, targetLanguageDefinitions: false, chrome: 'full' },
  s0b: { visibility: 'heavy', defaultHighlight: 'strong', layers: L('gloss', 'decoding', 'phrase', 'grammar', 'english', 'sentence', 'history'), englishRescue: 'easy', romanization: 'rescue', decodingFirst: true, targetLanguageDefinitions: false, chrome: 'full' },
  s0c: { visibility: 'heavy', defaultHighlight: 'subtle', layers: L('gloss', 'decoding', 'phrase', 'grammar', 'discourse', 'english', 'sentence', 'history'), englishRescue: 'easy', romanization: 'rescue', decodingFirst: true, targetLanguageDefinitions: false, chrome: 'full' },
  c1: { visibility: 'heavy', defaultHighlight: 'subtle', layers: L('gloss', 'phrase', 'grammar', 'decoding', 'english', 'sentence', 'history'), englishRescue: 'easy', romanization: 'rescue', decodingFirst: false, targetLanguageDefinitions: false, chrome: 'full' },
  c2: { visibility: 'heavy', defaultHighlight: 'subtle', layers: L('gloss', 'phrase', 'grammar', 'decoding', 'sentence', 'english', 'history'), englishRescue: 'easy', romanization: 'rescue', decodingFirst: false, targetLanguageDefinitions: false, chrome: 'full' },
  c3: { visibility: 'contextual', defaultHighlight: 'subtle', layers: L('gloss', 'phrase', 'definition', 'grammar', 'decoding', 'sentence', 'english', 'history'), englishRescue: 'secondary', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: true, chrome: 'full' },
  c4: { visibility: 'contextual', defaultHighlight: 'subtle', layers: L('gloss', 'phrase', 'discourse', 'definition', 'grammar', 'sentence', 'english', 'decoding', 'history'), englishRescue: 'secondary', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: true, chrome: 'reduced' },
  c5: { visibility: 'light', defaultHighlight: 'subtle', layers: L('gloss', 'phrase', 'definition', 'discourse', 'note', 'grammar', 'sentence', 'english', 'history', 'decoding'), englishRescue: 'secondary', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: true, chrome: 'reduced' },
  c6: { visibility: 'clean', defaultHighlight: 'off', layers: L('gloss', 'phrase', 'definition', 'note', 'discourse', 'clause-structure', 'grammar', 'sentence', 'history', 'english', 'decoding'), englishRescue: 'deep', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: true, chrome: 'reduced' },
  c7: { visibility: 'clean', defaultHighlight: 'off', layers: L('gloss', 'phrase', 'definition', 'note', 'discourse', 'clause-structure', 'grammar', 'sentence', 'history', 'english', 'decoding'), englishRescue: 'deep', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: true, chrome: 'minimal' },
  c8: { visibility: 'clean', defaultHighlight: 'off', layers: L('gloss', 'note', 'phrase', 'definition', 'history', 'discourse', 'clause-structure', 'grammar', 'sentence', 'english', 'decoding'), englishRescue: 'deep', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: true, chrome: 'minimal' },
  c9: { visibility: 'clean', defaultHighlight: 'off', layers: L('gloss', 'history', 'note', 'phrase', 'definition', 'discourse', 'clause-structure', 'grammar', 'sentence', 'english', 'decoding'), englishRescue: 'on-request', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: true, chrome: 'minimal' },
  c10: { visibility: 'clean', defaultHighlight: 'off', layers: L('gloss', 'history', 'note', 'phrase', 'definition', 'discourse', 'clause-structure', 'grammar', 'sentence', 'english', 'decoding'), englishRescue: 'on-request', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: true, chrome: 'minimal' },
  c11: { visibility: 'invisible', defaultHighlight: 'off', layers: L('gloss', 'history', 'note', 'phrase', 'definition', 'discourse', 'clause-structure', 'grammar', 'sentence', 'english', 'decoding'), englishRescue: 'on-request', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: true, chrome: 'minimal' },
  c12: { visibility: 'invisible', defaultHighlight: 'off', layers: L('gloss', 'history', 'note', 'phrase', 'definition', 'discourse', 'clause-structure', 'grammar', 'sentence', 'english', 'decoding'), englishRescue: 'on-request', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: true, chrome: 'minimal' },
  open: { visibility: 'invisible', defaultHighlight: 'off', layers: L('gloss', 'history', 'note', 'phrase', 'definition', 'discourse', 'clause-structure', 'grammar', 'sentence', 'english', 'decoding'), englishRescue: 'on-request', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: true, chrome: 'minimal' },
};

// ───────────────────────────── streams ─────────────────────────────

const stream = (order: number, key: string, kind: Stream['kind'], label: string, description: string, available = true): Stream => ({
  id: ids.stream(HINDI_COURSE_ID, key), courseId: HINDI_COURSE_ID, lang: LANG, key, label, description, kind, order, available,
});

/** One learner model, many content surfaces. A word learned on one shelf is known on every other. */
export const HINDI_STREAMS: Stream[] = [
  stream(0, 'acquisition', 'acquisition', 'First Stories', 'Controlled Hindi written for the course: small stories with a recurring cast, a ramp whose help fades into real texts.'),
  stream(1, 'children', 'library', 'Children\'s Library', 'Hindi written for native children: story collections, picture-book text, school readers, fables.'),
  stream(2, 'literature', 'library', 'Hindi Literature', 'Stories, novels and poetry of modern Hindi, from easy to demanding.'),
  stream(3, 'knowledge', 'knowledge', 'Nonfiction', 'History, biography, science and more, in plain native Hindi.'),
  stream(4, 'heritage', 'library', 'Heritage Hindi', 'Older and related literary languages (Awadhi, Braj, the Sant poets) read as their own languages, never as evidence about Modern Standard Hindi.'),
  stream(5, 'scripture', 'scripture', 'Bible', 'Scripture read directly in Hindi, with English only as rescue.'),
  stream(6, 'mission', 'mission', 'Mission', 'Language for the gospel, testimony, prayer, church and ordinary conversation in ministry.'),
  stream(7, 'personal', 'personal', 'Your Books', 'Your own lawful copies, on this device only, read with the same help as everything else.'),
  // GoListen is deferred to V2: the stream exists as data so that audio can attach to texts later.
  stream(8, 'listening', 'listening', 'Listen', 'Audio attached to texts, when rights-clear recordings exist.', false),
];

// ───────────────────────────── shelves ─────────────────────────────

const NOT_A_GRADE = 'a reading-difficulty shelf, not an Indian school grade';

/**
 * A text on no shelf — the learner's own book, his testimony: every layer is within reach (decoding and the
 * transliteration rescue included, because nobody knows how far the owner of the book has come), none is pushed forward.
 */
export const HINDI_OUTSIDE_ASSISTANCE: AssistanceProfile = {
  visibility: 'contextual', defaultHighlight: 'subtle', layers: L('gloss', 'phrase', 'grammar', 'decoding', 'sentence', 'english', 'history'),
  englishRescue: 'secondary', romanization: 'rescue', decodingFirst: false, targetLanguageDefinitions: false, chrome: 'full',
};

const shelf = (index: number, key: string, label: string, purpose: string[]): Stage => ({
  id: ids.stage(HINDI_COURSE_ID, key), courseId: HINDI_COURSE_ID, lang: LANG, index, key, label, kind: 'shelf', purpose, assistance: HINDI_ASSISTANCE[key],
});

/** Shelves, not locks: an orientation for browsing. Personal difficulty is computed per learner, per text. */
export const HINDI_SHELVES: Stage[] = [
  shelf(0, 's0a', 'Stage 0A — First words in real sentences', ['tiny stories with a recurring cast, from the first line', 'this and that, is and are, in and on, and, also', 'a few dozen concrete words met again and again', 'the script is decoded on the word sheet, as part of reading']),
  shelf(1, 's0b', 'Stage 0B — Postpositions, agreement, questions', ['of, to, from, with: the postpositions and the oblique forms', 'plural, my / your / his / her / one\'s own', 'question words, commands, polite commands', 'the habitual and the progressive; was / were']),
  shelf(2, 's0c', 'Stage 0C — Narrative past and clause linking', ['real narrative in the past, with ने and the perfective', 'common compound verbs (आ गया, ले लिया, बैठ गया)', 'but, then, because, so, when, if, that']),
  shelf(3, 'c1', 'Class 1', [NOT_A_GRADE, 'the first native children\'s stories, very short, very plain', 'a first sustained narrative in everyday words']),
  shelf(4, 'c2', 'Class 2', [NOT_A_GRADE, 'short children\'s stories with dialogue', 'fables and simple folk tales']),
  shelf(5, 'c3', 'Class 3', [NOT_A_GRADE, 'longer children\'s stories', 'sentences that run on, with linking words', 'first target-language definitions']),
  shelf(6, 'c4', 'Class 4', [NOT_A_GRADE, 'children\'s story collections and easy poems', 'narrative that does not stay in one place or one day']),
  shelf(7, 'c5', 'Class 5', [NOT_A_GRADE, 'school readers and young readers\' stories', 'more abstract words; some Sanskrit-derived vocabulary']),
  shelf(8, 'c6', 'Class 6', [NOT_A_GRADE, 'classic short stories in plain prose', 'translated young-readers\' novels you may know already']),
  shelf(9, 'c7', 'Class 7', [NOT_A_GRADE, 'short stories with village and town speech', 'essays and biography in a clear style']),
  shelf(10, 'c8', 'Class 8', [NOT_A_GRADE, 'older prose that is still plain', 'plays and popular adventure novels', 'nonfiction for general readers']),
  shelf(11, 'c9', 'Class 9', [NOT_A_GRADE, 'classic stories and verse with literary vocabulary', 'autobiography and history in formal Hindi']),
  shelf(12, 'c10', 'Class 10', [NOT_A_GRADE, 'longer novels and demanding short fiction', 'long sentences, irony, and Sanskrit-derived and Persian-derived vocabulary side by side']),
  shelf(13, 'c11', 'Class 11', [NOT_A_GRADE, 'major novels with regional speech', 'dense literary prose']),
  shelf(14, 'c12', 'Class 12', [NOT_A_GRADE, 'the long novels and the hardest literary prose and verse', 'literary history and criticism']),
  shelf(15, 'open', 'Open Reading', ['read by interest, with no difficulty claim', 'scripture, older and related literary languages, reference and general reading']),
];

// ───────────────────────────── rights records ─────────────────────────────

const BASE: WorkRights = {
  state: 'rights-unverified', copyrightStatus: 'unknown', permission: 'unknown', canBundle: false, userImportOnly: true,
  canModify: false, canStoreOffline: false, canBundleAudio: false, audiobook: 'unknown', verified: false,
  acquisitionNotes: 'Rights not verified. Nothing is bundled until the exact edition, its source and the legal basis are recorded with their evidence.',
};

/** An old work: the date is a lead. The edition actually used still has to be identified and checked. */
const lead = (basis: string): WorkRights => ({
  ...BASE, basis: `${basis} A lead for verification, not a conclusion: the edition and the transcription must be identified and checked for India and the United States, an edition or translation can carry its own rights, and terms differ by country.`,
  jurisdiction: 'not established',
});

/** A modern work under copyright, or a modern translation: listed so the learner can find it; the app holds no text. */
const modern = (basis: string): WorkRights => ({
  ...BASE, state: 'prohibited-from-bundling', copyrightStatus: 'in-copyright', permission: 'none', basis: `${basis} Presumed in copyright; not verified.`,
  acquisitionNotes: 'In copyright: never bundled. Import your own lawful copy; it stays on this device.',
});

/**
 * Text written for the course. It is MACHINE-DRAFTED by an AI model and has NOT been reviewed by a native speaker:
 * the documents say so, and none of them is published to normal learner use until a named reviewer signs the wording.
 */
const COURSE: WorkRights = {
  state: 'course-authored', copyrightStatus: 'licensed', licensing: 'written for this course', permission: 'not-needed', canBundle: true, userImportOnly: false,
  canModify: true, canStoreOffline: true, canBundleAudio: false, audiobook: 'none', verified: true, verifiedBy: 'course authors',
  basis: 'Original text written for the course, machine-drafted by an AI model; not reviewed by a native speaker.',
  acquisitionNotes: 'Machine-drafted and unreviewed: visible in preview only until a native speaker reviews the wording.',
};

/**
 * The Hindi Bible the course bundles a slice of: the Indian Revised Version (IRV) Hindi 2019, taken from the distributor
 * eBible.org (translation id hin2017). It is a LICENSED text, not a public-domain one: the licence was read on the
 * distributor's own pages (not taken from memory), `scripts/build-hi-scripture.mjs` reads it again on every build and
 * stops when the page no longer says so, and `scripts/verify-scripture.mjs` compares every bundled verse with the source.
 * The share-alike condition is kept apart from everything else: the verses are passed on unchanged under their own
 * licence, in their own corpus (`bible-hi-irv2019`), beside — not inside — the app's code and the other corpora.
 */
export const IRV_HINDI_RIGHTS: WorkRights = {
  state: 'verified-open-licence', copyrightStatus: 'licensed', permission: 'not-needed', canBundle: true, userImportOnly: false,
  canModify: true, canStoreOffline: true, canBundleAudio: false, audiobook: 'unknown', verified: true,
  verifiedBy: 'coordinator (AI), from the evidence listed; not legal advice — to be confirmed by the owner', verifiedAt: '2026-10-02',
  basis: 'Indian Revised Version (IRV) Hindi 2019: the distributor\'s copyright page names the rights holder and states the Creative Commons Attribution Share-Alike licence 4.0 for this translation.',
  licensing: 'CC BY-SA 4.0',
  sourceRepository: 'eBible.org, translation id hin2017 (https://ebible.org/hin2017/)',
  licence: 'Creative Commons Attribution Share-Alike license 4.0 (as stated on the source\'s copyright page, https://ebible.org/hin2017/copyright.htm)',
  jurisdictions: ['a worldwide public licence granted by the rights holder; not checked country by country'],
  attributionRequired: true, shareAlike: true, commercialUse: true,
  // A Creative Commons licence is granted by the rights holder worldwide by its own terms: the basis is the licence, the
  // same in every jurisdiction, and not a term of protection that differs by country (which is why a public-domain
  // status is never recorded this way).
  statusByJurisdiction: { '*': 'licensed' },
  modifications: 'none to the wording: each bundled verse is identical to the source after Unicode normalization (NFC) and whitespace normalization. A selection: the translators\' footnotes, the section headings and the cross-references are not included, and every Scripture text says so.',
  proofreading: 'the distributor\'s text; no proofreading of our own',
  evidence: [
    'eBible.org lists the translation "इंडियन रिवाइज्ड वर्जन (IRV) हिंदी - 2019" (hin2017); its copyright page reads "copyright © 2017, 2018, 2019 Bridge Connectivity Solutions" and names the Creative Commons Attribution Share-Alike license 4.0.',
    'The build script reads that page again on every run and writes nothing when the rights holder or the licence is no longer stated there.',
    'Every bundled verse (91 verses: Genesis 1, Psalms 1 and 23, Mark 1, and three seed verses) is compared with the distributor\'s page and recorded with its URL in data/verified/scripture.json.',
  ],
  compliance: 'Attribution: the translation, its copyright holder, the licence and the source are named on every Scripture text. Changes indicated: the provenance of every text says what was left out. Share-alike: the verse text is passed on unchanged under CC BY-SA 4.0 as its own corpus; the app\'s code, the dictionary layer and the other corpora are separate works beside it. Open question for the owner: whether the word-by-word help shown over a verse counts as adapted material; it is computed on the device and never stored inside the verse text.',
  audioRights: 'No recording is bundled. A recording of this translation has rights of its own, to be checked separately.',
  acquisitionNotes: 'A slice is bundled. The whole translation is one download from the same distributor, which needs the owner\'s permission to fetch.',
};

export const BHARATENDU_ANDHER_NAGARI_RIGHTS: WorkRights = {
  state: 'verified-public-domain', copyrightStatus: 'public-domain', permission: 'not-needed', canBundle: true, userImportOnly: false,
  canModify: true, canStoreOffline: true, canBundleAudio: false, audiobook: 'none', verified: true,
  verifiedBy: 'Wikisource Bharatendu-Natakavali revision 517232', verifiedAt: '2026-10-01',
  basis: 'Wikisource source record identifies the 1935 Bharatendu-Natakavali first edition and explicitly marks it Public Domain India and Public Domain US; the underlying play was written in 1881 by Bharatendu Harishchandra.',
  sourceRepository: 'hi.wikisource.org', jurisdictions: ['IN', 'US'], licence: 'Public domain underlying edition; Wikisource transcription CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)', attributionRequired: true, shareAlike: true,
  modifications: 'Navigation and editorial preface removed; Hindi play text retained from six official Wikisource act pages.', retrievedAt: '2026-10-01',
  checksum: 'be33006a0584af910eb9cb5a5b7beea1c448c64c81ac63bb02cbc29770a2e91f', proofreading: 'Wikisource proofread source pages',
  evidence: ['भारतेंदु-नाटकावली revision 517232: editor Brajaratnadas, first edition VS 1992 / 1935.', 'Contents index assigns अंधेर नगरी to pages 543–570; all six act pages retrieved.', 'Source record states Public Domain India and Public Domain United States.'],
  statusByJurisdiction: { IN: 'public-domain', US: 'public-domain' }, commercialUse: true,
};

/**
 * NCERT school readers. NCERT's own terms (ncert.nic.in/textbook.php, read 2026-10-01; the wording is recorded in
 * docs/hindi/SOURCES_RESEARCH.md, section 3) rule out everything an app would do with them.
 */
const NCERT: WorkRights = {
  // userImportOnly is false on purpose: the stated terms also rule out use inside software, so the app offers no "add your copy"
  ...BASE, state: 'prohibited-from-bundling', copyrightStatus: 'in-copyright', permission: 'none', userImportOnly: false,
  basis: 'NCERT states on its online-textbook page that its textbooks are copyrighted, that nobody may copy and redistribute them in any form, and that using them as part of digital content packages or software is prohibited.',
  sourceTerms: 'ncert.nic.in/textbook.php, section "Copyright of NCERT Textbooks and terms of use": download for use as a textbook or for reference only; no redistribution; no use inside software; even a link needs NCERT\'s written permission.',
  acquisitionNotes: 'Never bundled, never fetched and not linked from the app: the app holds no text of it. Listed only so that the learner knows the series exists. Only NCERT\'s written permission would change this.',
};

/** Hindi children's books available through the Global Digital Library's official API. */
const GDL_HINDI = {
  state: 'verified-open-licence', copyrightStatus: 'licensed', permission: 'not-needed', canBundle: true, userImportOnly: false,
  canModify: true, canStoreOffline: true, canBundleAudio: false, audiobook: 'unknown', verified: true,
  verifiedBy: 'coordinator (AI), from the GDL licence and API records; not legal advice', verifiedAt: '2026-10-01',
  basis: 'The Global Digital Library licence page says its primary content licences are CC BY and CC BY-SA and that every content element carries its specific licence. The official Hindi books API records CC-BY-4.0 on each eligible book.',
  licensing: 'CC BY 4.0 (per book; check the API record before acquisition)',
  sourceRepository: 'Global Digital Library, Hindi books API (https://content.digitallibrary.io/wp-json/content-api/v1/books/hi)',
  licence: 'Creative Commons Attribution 4.0 International, as recorded per book by the GDL API and explained at https://digitallibrary.io/about/license/',
  jurisdictions: ['the source states CC licensing; no country-by-country public-domain claim is made'],
  statusByJurisdiction: { '*': 'licensed' }, attributionRequired: true, shareAlike: false, commercialUse: true,
  modifications: 'Text is retained verbatim after EPUB extraction; images and read-along audio are not bundled. Each book keeps its own author, illustrator, translator and publisher credit from the EPUB/API metadata.',
  proofreading: 'source EPUB; no proofreading of our own',
  evidence: [
    'The GDL licence page (read 2026-10-01) says its primary licences are CC BY and CC BY-SA and that all content elements are marked with their specific Creative Commons licence.',
    'The official API endpoint lists 129 Hindi books on the 2026-10-01 catalogue response; 125 carry a per-book CC-BY-4.0 record. The acquisition script stores that response before any EPUB is selected.',
    'The API documentation says its endpoints support reuse and provide book structure/content without credentials; no StoryWeaver or Literacy Cloud endpoint is used.',
  ],
  compliance: 'Attribution is carried per book from the source record. Narration, illustrations and any non-CC-BY book are excluded unless their own record permits reuse.',
  audioRights: 'No audio is bundled; read-along rights are separate from text.',
  acquisitionNotes: 'Use scripts/acquire-hi-gdl.mts to save the official catalogue and selected EPUBs under data/private. Run source-quality review and the lazy library build before publication; do not commit the downloaded source files.',
} as const satisfies WorkRights;

const DRAFT = 'Machine-drafted prototype by an AI model: not reviewed by a native speaker, so it is visible in preview only. Gender, agreement, spelling, naturalness and the English lines all need a native reviewer.';

// ───────────────────────────── works ─────────────────────────────

let order = 0;
interface W {
  slug: string; title: string; author?: string; died?: number; year?: number; role?: WorkRole; streams?: string[]; variety?: string; region?: string;
  era?: string; genre?: string; audience?: string; domains?: string[]; level?: Work['genericLevel']; registers?: RegisterTag[]; rights?: WorkRights;
  purpose?: string[]; notes?: string; ingestion?: Work['ingestion']; readiness?: Work['readiness']; translator?: string; publisher?: string; sourceUrl?: string;
}
const readinessOf = (r: WorkRights): NonNullable<Work['readiness']> =>
  (r.state === 'prohibited-from-bundling' || r.state === 'recommended-only' ? 'recommendation' : r.state === 'rights-unverified' ? 'candidate' : 'verified-ready');
/**
 * The Global Digital Library books are placed on Classes 1–4 by measured difficulty (scripts/prepare-hi-gdl-collection.mts):
 * one catalogue record per shelf, so a book is on the shelf its work is on. Class 1 is `gdl-hindi-ccby` (below).
 */
const GDL_SHELF = (class_: 2 | 3 | 4) => ({
  slug: `gdl-hindi-ccby-c${class_}`, title: `Global Digital Library — Hindi CC BY 4.0 books, Class ${class_}`, role: 'extensive' as const, streams: ['children'], publisher: 'Global Digital Library', audience: 'children', genre: 'illustrated story collection',
  purpose: ['native Hindi children’s reading from individually licensed books'], rights: GDL_HINDI, ingestion: 'ingested' as const, readiness: 'implemented' as const,
  notes: `The Class ${class_} part of the Global Digital Library Hindi collection: the books whose measured difficulty (length, sentence length, vocabulary the other books do not share) puts them here. Each book retains its own GDL API licence and attribution record.`,
});

const works = (shelfKey: string, list: W[]): Work[] => list.map((w) => {
  const rights = w.rights ?? (w.died !== undefined ? lead(`The author died in ${w.died}${w.year ? `; first published ${w.year}` : ''}.`) : BASE);
  return {
    id: ids.work(HINDI_COURSE_ID, w.slug), courseId: HINDI_COURSE_ID, lang: LANG, stageId: ids.stage(HINDI_COURSE_ID, shelfKey),
    role: w.role ?? 'subsidiary', order: order++, title: w.title, author: w.author, publisher: w.publisher, purpose: w.purpose ?? [], registers: w.registers,
    rights, bibliographyVerified: false, optional: true, notes: w.notes, translator: w.translator, sourceUrl: w.sourceUrl,
    streams: w.streams ?? ['literature'], variety: w.variety, region: w.region, era: w.era, genre: w.genre, audience: w.audience, domains: w.domains,
    genericLevel: w.level, publicationYear: w.year, authorDied: w.died, ingestion: w.ingestion ?? 'catalogued', readiness: w.readiness ?? readinessOf(rights),
  };
});

const PREMCHAND = { author: 'प्रेमचंद', died: 1936, era: 'early 20th century' } as const;
const PREMCHAND_NOTE = 'Part of his work first appeared in Urdu: which text a Hindi edition follows, and whose spelling and editing it carries, has to be identified edition by edition.';

const HINDI_BASE_WORKS: Work[] = [
  // ── Stage 0A–0C: controlled Hindi written for the course (machine-drafted, unreviewed) ──
  ...works('s0a', [
    { slug: 'pehli-kahaniyan-0a', title: 'पहली कहानियाँ 0A — घर में', role: 'spine', streams: ['acquisition'], level: 'controlled', genre: 'microstories', rights: COURSE, ingestion: 'bundled', readiness: 'implemented',
      domains: ['daily-life', 'family', 'food', 'school'],
      purpose: ['this / that + noun + is', 'in and on, also, and', 'the first habitual verbs, questions with क्या, कहाँ, कौन'], notes: DRAFT },
  ]),
  ...works('s0b', [
    { slug: 'pehli-kahaniyan-0b', title: 'पहली कहानियाँ 0B — दिन भर', role: 'spine', streams: ['acquisition'], level: 'controlled', genre: 'short narrative', rights: COURSE, ingestion: 'bundled', readiness: 'implemented',
      domains: ['daily-life', 'family', 'school', 'travel', 'hospitality', 'work'],
      purpose: ['का / के / की, को, से; oblique forms and the plural', 'my / your / his / her / one\'s own', 'commands and polite commands', 'the habitual, the progressive, was / were'], notes: DRAFT },
  ]),
  ...works('s0c', [
    { slug: 'pehli-kahaniyan-0c', title: 'पहली कहानियाँ 0C — कल की बातें', role: 'spine', streams: ['acquisition'], level: 'controlled', genre: 'narrative', rights: COURSE, ingestion: 'bundled', readiness: 'implemented',
      domains: ['daily-life', 'family', 'school', 'travel'],
      purpose: ['the narrative past with ने', 'compound verbs', 'लेकिन, फिर, क्योंकि, इसलिए, जब, अगर, कि'], notes: DRAFT },
  ]),

  // ── Children's Hindi ──
  ...works('c1', [
    { slug: 'gdl-hindi-ccby', title: 'Global Digital Library — Hindi CC BY 4.0 books', role: 'extensive', streams: ['children'], publisher: 'Global Digital Library', audience: 'children', genre: 'illustrated story collection', purpose: ['native Hindi children’s reading from individually licensed books'], rights: GDL_HINDI, ingestion: 'ingested', readiness: 'implemented',
      notes: 'A collection index, not one text: each selected book retains its own GDL API licence and attribution record. The lazy library pipeline acquires only individually selected CC-BY-4.0 books.' },
    { slug: 'storyweaver', title: 'StoryWeaver (Pratham Books) — Hindi stories', role: 'extensive', streams: ['children'], publisher: 'Pratham Books', audience: 'children', genre: 'illustrated story collection', purpose: ['native children\'s stories across the first classes'],
      // The publisher's own level and the course's level are STORED SEPARATELY when stories arrive: the publisher's level is a fact about the story, the course level a judgement. genericLevel is left unset on the collection.
      rights: { ...BASE, basis: 'Partly checked, and still unverified as a whole. The site states one open licence for all its stories and illustrations and a narrower one for its narrated stories and videos; the licence of an individual story is printed on that story\'s own attribution page and has not been checked for any story.',
        sourceRepository: 'storyweaver.org.in (Pratham Books)',
        evidence: [
          'storyweaver.org.in/en/open-content (read 2026-10-01) states that all stories and illustrations carry CC BY 4.0.',
          'The site\'s terms (read 2026-10-01) put the Read Along feature and the videos under CC BY-NC-ND 4.0: text and narration have different rights.',
          'storyweaver.org.in/en/attributions sets out the credit a reused story must carry: author, illustrator, translator, publisher, donor, the platform and the licence.',
          'No documented interface or bulk route for taking stories was found. The site names a partner contact (storyweaver@prathambooks.org) for use at scale.',
        ],
        sourceTerms: 'The terms of use say nothing either way about automated retrieval; a sister site built on the same platform forbids it outright. Until Pratham Books answers, nothing is fetched by a program.',
        acquisitionNotes: 'One catalogue entry for the whole collection. Before anything is ingested: the licence of EACH story, the attribution it requires, and a lawful way of access at scale must be verified and recorded with evidence. Nothing is bundled meanwhile.' },
      notes: 'A collection, not a work: stories will arrive one by one with their own record. The publisher\'s level (kept as the publisher\'s) and the course\'s own shelf are separate fields.' },
  ]),
  ...works('c2', [
    GDL_SHELF(2),
    { slug: 'ncert-rimjhim', title: 'रिमझिम (Hindi school readers)', role: 'extensive', streams: ['children'], publisher: 'NCERT', audience: 'children', genre: 'school reader', era: 'contemporary', rights: NCERT,
      notes: 'A school textbook series: NCERT\'s own class numbers are not this course\'s classes. The terms NCERT states forbid redistribution and use inside software, so this is a pointer only.' },
  ]),
  ...works('c3', [
    GDL_SHELF(3),
    { slug: 'panchatantra', title: 'पंचतंत्र की कहानियाँ', role: 'extensive', streams: ['children'], audience: 'children', genre: 'fables', era: 'ancient tales, many retellings',
      notes: 'The fables are ancient, but every Hindi retelling is its own work with its own record; the exact retelling has to be identified.' },
  ]),
  ...works('c4', [
    GDL_SHELF(4),
    { slug: 'chauhan-jhansi-ki-rani', title: 'झाँसी की रानी', author: 'सुभद्रा कुमारी चौहान', died: 1948, era: 'early 20th century', genre: 'poem', audience: 'children', streams: ['children', 'literature'], registers: ['literary'], domains: ['history'] },
  ]),
  ...works('c5', [
    { slug: 'ncert-vasant', title: 'वसंत (Hindi school readers)', role: 'extensive', streams: ['children'], publisher: 'NCERT', audience: 'young readers', genre: 'school reader', era: 'contemporary', rights: NCERT,
      notes: 'A school textbook series: NCERT\'s own class numbers are not this course\'s classes. The terms NCERT states forbid redistribution and use inside software, so this is a pointer only.' },
  ]),

  // ── Familiar translated fiction: the plot you already know helps the reading; never bundled ──
  ...works('c6', [
    { slug: 'rowling-harry-potter-1-hindi', title: 'हैरी पॉटर और पारस पत्थर', author: 'J. K. Rowling (Hindi translation)', genre: 'fantasy novel in translation', audience: 'young readers', streams: ['literature', 'children', 'personal'],
      rights: modern('A modern novel in a modern translation.'),
      notes: 'Knowing the story already makes the Hindi far easier to read. The translator and publisher are not recorded here until checked against the book.' },
    { slug: 'chauhan-mukul', title: 'मुकुल', author: 'सुभद्रा कुमारी चौहान', died: 1948, era: 'early 20th century', genre: 'poems', registers: ['literary'], streams: ['literature'] },
    { slug: 'premchand-idgah', title: 'ईदगाह', ...PREMCHAND, genre: 'short story', domains: ['family'], notes: PREMCHAND_NOTE },
    { slug: 'premchand-do-bailon-ki-katha', title: 'दो बैलों की कथा', ...PREMCHAND, genre: 'short story', notes: PREMCHAND_NOTE },
  ]),

  // ── Hindi literature: the older authors (candidates, nothing verified) ──
  ...works('c7', [
    { slug: 'premchand-bade-bhai-sahab', title: 'बड़े भाई साहब', ...PREMCHAND, genre: 'short story', domains: ['school', 'family'], notes: PREMCHAND_NOTE },
    { slug: 'premchand-gulli-danda', title: 'गुल्ली डंडा', ...PREMCHAND, genre: 'short story', notes: PREMCHAND_NOTE },
    { slug: 'ncert-kshitij', title: 'क्षितिज (Hindi school readers)', role: 'extensive', streams: ['literature'], publisher: 'NCERT', audience: 'young readers', genre: 'school reader', era: 'contemporary', rights: NCERT,
      notes: 'A school textbook series: NCERT\'s own class numbers are not this course\'s classes. The terms NCERT states forbid redistribution and use inside software, so this is a pointer only.' },
  ]),
  ...works('c8', [
    { slug: 'premchand-namak-ka-daroga', title: 'नमक का दारोगा', ...PREMCHAND, genre: 'short story', domains: ['work'], notes: PREMCHAND_NOTE },
    { slug: 'premchand-bade-ghar-ki-beti', title: 'बड़े घर की बेटी', ...PREMCHAND, genre: 'short story', domains: ['family'], notes: PREMCHAND_NOTE },
    { slug: 'premchand-panch-parameshwar', title: 'पंच परमेश्वर', ...PREMCHAND, genre: 'short story', notes: PREMCHAND_NOTE },
    { slug: 'premchand-budhi-kaki', title: 'बूढ़ी काकी', ...PREMCHAND, genre: 'short story', domains: ['family'], notes: PREMCHAND_NOTE },
    { slug: 'premchand-sava-ser-genhu', title: 'सवा सेर गेहूँ', ...PREMCHAND, genre: 'short story', notes: PREMCHAND_NOTE },
    { slug: 'premchand-mantra', title: 'मंत्र', ...PREMCHAND, genre: 'short story', notes: PREMCHAND_NOTE },
    { slug: 'khatri-chandrakanta', title: 'चंद्रकांता', author: 'देवकीनंदन खत्री', died: 1913, year: 1888, era: '19th century', genre: 'adventure novel',
      notes: 'A popular, plainly written romance of adventure. The edition (and any modernised spelling) has its own record.' },
    { slug: 'bharatendu-andher-nagari', title: 'अंधेर नगरी', author: 'भारतेंदु हरिश्चंद्र', died: 1885, era: '19th century', genre: 'play', registers: ['literary'], streams: ['literature'], rights: BHARATENDU_ANDHER_NAGARI_RIGHTS, ingestion: 'ingested', readiness: 'implemented', sourceUrl: 'https://hi.wikisource.org/wiki/भारतेंदु-नाटकावली' },
    { slug: 'kalam-agni-ki-udaan', title: 'अग्नि की उड़ान', author: 'A. P. J. Abdul Kalam (Hindi translation)', died: 2015, streams: ['knowledge', 'personal'], genre: 'autobiography in translation', domains: ['science'],
      rights: modern('A modern book in a Hindi translation; the author died in 2015.') },
  ]),
  ...works('c9', [
    { slug: 'premchand-thakur-ka-kuan', title: 'ठाकुर का कुआँ', ...PREMCHAND, genre: 'short story', notes: PREMCHAND_NOTE },
    { slug: 'premchand-sadgati', title: 'सद्गति', ...PREMCHAND, genre: 'short story', notes: PREMCHAND_NOTE },
    { slug: 'premchand-poos-ki-raat', title: 'पूस की रात', ...PREMCHAND, genre: 'short story', notes: PREMCHAND_NOTE },
    { slug: 'premchand-shatranj-ke-khiladi', title: 'शतरंज के खिलाड़ी', ...PREMCHAND, genre: 'short story', domains: ['history'], notes: PREMCHAND_NOTE },
    { slug: 'premchand-kafan', title: 'कफ़न', ...PREMCHAND, genre: 'short story', notes: PREMCHAND_NOTE },
    { slug: 'guleri-usne-kaha-tha', title: 'उसने कहा था', author: 'चंद्रधर शर्मा गुलेरी', died: 1922, year: 1915, era: 'early 20th century', genre: 'short story', domains: ['history'] },
    { slug: 'bharatendu-bharat-durdasha', title: 'भारत दुर्दशा', author: 'भारतेंदु हरिश्चंद्र', died: 1885, era: '19th century', genre: 'play', registers: ['literary'], domains: ['history'] },
    { slug: 'gandhi-satya-ke-prayog', title: 'सत्य के प्रयोग', author: 'मोहनदास करमचंद गांधी', died: 1948, era: '20th century', genre: 'autobiography', streams: ['knowledge'], domains: ['history'],
      notes: 'Originally written in Gujarati: a Hindi edition is a translation, with its own translator, publisher and terms. Identify the exact edition before anything else.' },
    { slug: 'bachchan-madhushala', title: 'मधुशाला', author: 'हरिवंश राय बच्चन', died: 2003, year: 1935, era: '20th century', genre: 'poem', registers: ['literary'], rights: modern('Published 1935; the author died in 2003.') },
    { slug: 'bharati-gunahon-ka-devta', title: 'गुनाहों का देवता', author: 'धर्मवीर भारती', died: 1997, era: '20th century', genre: 'novel', rights: modern('The author died in 1997.') },
  ]),
  ...works('c10', [
    { slug: 'premchand-nirmala', title: 'निर्मला', ...PREMCHAND, genre: 'novel', domains: ['family'], notes: PREMCHAND_NOTE },
    { slug: 'prasad-akashdeep', title: 'आकाशदीप', author: 'जयशंकर प्रसाद', died: 1937, era: 'early 20th century', genre: 'short story', registers: ['literary'] },
    { slug: 'dinkar-rashmirathi', title: 'रश्मिरथी', author: 'रामधारी सिंह \'दिनकर\'', died: 1974, era: '20th century', genre: 'epic poem', registers: ['literary'], rights: modern('The author died in 1974.') },
    { slug: 'sahni-tamas', title: 'तमस', author: 'भीष्म साहनी', died: 2003, era: '20th century', genre: 'novel', domains: ['history'], rights: modern('The author died in 2003.') },
  ]),
  ...works('c11', [
    { slug: 'premchand-gaban', title: 'गबन', ...PREMCHAND, genre: 'novel', notes: PREMCHAND_NOTE },
    { slug: 'premchand-sevasadan', title: 'सेवासदन', ...PREMCHAND, genre: 'novel', notes: PREMCHAND_NOTE },
    { slug: 'renu-maila-anchal', title: 'मैला आँचल', author: 'फणीश्वरनाथ रेणु', died: 1977, year: 1954, era: '20th century', genre: 'regional novel', registers: ['colloquial', 'literary'], rights: modern('Published 1954; the author died in 1977.'),
      notes: 'Rural speech written as spoken: regional forms must be marked as regional.' },
  ]),
  ...works('c12', [
    { slug: 'premchand-godan', title: 'गोदान', ...PREMCHAND, year: 1936, genre: 'novel', notes: PREMCHAND_NOTE },
    { slug: 'prasad-kamayani', title: 'कामायनी', author: 'जयशंकर प्रसाद', died: 1937, year: 1936, era: 'early 20th century', genre: 'epic poem', registers: ['literary', 'sanskritic'] },
    { slug: 'shukla-raag-darbari', title: 'राग दरबारी', author: 'श्रीलाल शुक्ल', died: 2011, year: 1968, era: '20th century', genre: 'satirical novel', rights: modern('Published 1968; the author died in 2011.') },
    { slug: 'yashpal-jhootha-sach', title: 'झूठा सच', author: 'यशपाल', died: 1976, era: '20th century', genre: 'novel', domains: ['history'], rights: modern('The author died in 1976.') },
    { slug: 'shukla-hindi-sahitya-ka-itihas', title: 'हिंदी साहित्य का इतिहास', author: 'रामचंद्र शुक्ल', died: 1941, era: '20th century', genre: 'literary history', streams: ['knowledge', 'literature'], domains: ['history'], registers: ['sanskritic'] },
  ]),

  // ── Heritage Hindi: related literary languages, NOT Modern Standard Hindi ──
  // These do not count as evidence about Modern Standard Hindi (the variety policy shows them as heritage). An edition's text,
  // notes and translation each carry rights of their own.
  ...works('open', [
    { slug: 'tulsidas-ramcharitmanas', title: 'रामचरितमानस', author: 'तुलसीदास', died: 1623, streams: ['heritage'], variety: 'awa', era: '16th century', genre: 'epic poem', registers: ['archaic', 'literary', 'religious'],
      notes: 'In Awadhi, not Modern Standard Hindi. The year of death is the traditional date and is itself only a lead. An edition\'s text, commentary and translation each have their own rights.' },
    { slug: 'surdas-sursagar', title: 'सूरसागर (चयन)', author: 'सूरदास', streams: ['heritage'], variety: 'bra', era: '16th century', genre: 'devotional verse', registers: ['archaic', 'literary', 'religious'],
      notes: 'In Braj, not Modern Standard Hindi. The collection is large and its text varies between editions: selections are catalogued, not the whole. Dates are not recorded here.' },
    { slug: 'kabir-dohe', title: 'कबीर के दोहे', author: 'कबीर', streams: ['heritage'], variety: 'hi-sant', era: '15th century', genre: 'couplets', registers: ['archaic', 'religious'],
      notes: 'The mixed language of the Sant poets, not Modern Standard Hindi. Attribution and wording differ between collections: the exact collection has to be identified. Dates are not recorded here.' },
  ]),

  // ── Scripture ──
  ...works('open', [
    { slug: 'bible-hindi', title: 'बाइबल (हिंदी)', role: 'scripture', streams: ['scripture'], genre: 'Scripture', registers: ['religious', 'biblical'], domains: ['scripture', 'theology'],
      purpose: ['Scripture read directly in Hindi'],
      rights: IRV_HINDI_RIGHTS, ingestion: 'bundled', readiness: 'implemented', sourceUrl: 'https://ebible.org/hin2017/', publisher: 'Bridge Connectivity Solutions Pvt. Ltd.',
      notes: 'The Indian Revised Version (IRV) Hindi 2019. A licensed text (share-alike), not a public-domain one: it is named, credited and kept as its own corpus. Biblical vocabulary is tagged as its own register layer; the text is never changed. Only a slice is bundled.' },
  ]),
];

export const HINDI_WORKS: Work[] = [...mergeReadingBridgeWorks(HINDI_BASE_WORKS, LANG), ...CURRICULUM_ACQUIRED_WORKS.filter(w => w.lang === 'hi')];

/** Texts that are not placed on a shelf by this file: the learner's own books and his testimony. */
export const HINDI_OUTSIDE_SHELVES = ['testimony'] as const;

/** Subject areas the Home page can offer as doors; each is a filter on the catalogue, never a separate course. */
export const HINDI_DOORS = [
  { key: 'stage-0', label: 'Stage 0', stages: ['s0a', 's0b', 's0c'] },
  { key: 'classes', label: 'Classes 1–12', stages: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12'] },
  { key: 'children', label: 'Children\'s Library', stream: 'children' },
  { key: 'literature', label: 'Hindi Literature', stream: 'literature' },
  { key: 'nonfiction', label: 'Nonfiction', stream: 'knowledge' },
  { key: 'heritage', label: 'Heritage Hindi', stream: 'heritage' },
  { key: 'bible', label: 'Bible', stream: 'scripture' },
  { key: 'your-books', label: 'Your Books', stream: 'personal' },
  { key: 'open-reading', label: 'Open Reading', stages: ['open'] },
] as const;
