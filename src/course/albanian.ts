/**
 * The Albanian course (Albania team): a ladder of ten stages and an open stage, streams, doors, and the first manifest
 * of works with their rights records.
 *
 * Target: Standard Albanian (sq). Gheg, Arbëresh, Arvanitika and older spellings are reading matter to recognise,
 * labelled as such, never the model for the learner's own Albanian. The Gheg bridge belongs to Stages 7–9, never to 0–2.
 *
 * STAGES ARE NOT GATES. The lemma counts in the labels and purposes describe how the course's OWN texts are written
 * (how many different words a stage's controlled texts may lean on); they do not lock anything. A learner may open any
 * text at any time, and what he reads next is decided by his own record (GoLearn), not by a stage number. The
 * numbers in ALBANIAN_CORPUS_TARGETS are planning targets for the size of the course-owned corpus, not build blockers.
 *
 * RIGHTS. Every entry of this manifest is one of these, and the difference is the point of this file:
 *   course-authored            written for the course (machine-drafted, not native-reviewed): the only bundlable state used here
 *   rights-unverified          a CANDIDATE awaiting a rights review. A date of death or of publication is a LEAD, never a conclusion
 *   prohibited-from-bundling   a modern book in copyright: the learner's own copy only ("Your Books")
 * NOTHING external is verified. No work in this file carries `verified: true`, a `verifiedBy`, or a "verified-*" state.
 * "Found online", "old", "on Wikisource", "probably public domain" are not permissions. Rights attach to the exact
 * edition, scan, transcription, modernised spelling and translation, not to the work. A statement that holds in one
 * country is not a worldwide statement. See docs/albanian/RIGHTS.md for the procedure and docs/albanian/CANDIDATES.md
 * for a table of this manifest.
 * BIBLIOGRAPHY: titles, authors and dates are from general knowledge and are marked unverified; anything not certain is
 * absent, not guessed.
 */
import type { AssistanceProfile, HelpLayer, RegisterTag, Stage, Stream, VarietyPolicy, Work, WorkRights, WorkRole } from '../core';
import { ids } from '../core';
import { MODERN_ALBANIAN_WORKS } from './modernAlbanian';
import { readingBridgeWorks } from './readingBridges';
import { CURRICULUM_ACQUIRED_WORKS } from './curriculumAcquired';

export const ALBANIAN_COURSE_ID = 'albania-sq';
const LANG = 'sq' as const;

// ───────────────────────────── assistance profiles ─────────────────────────────

const L = (...layers: HelpLayer[]): HelpLayer[] => layers;

/**
 * The system removes itself as the learner advances; English rescue is present in every profile. Albanian needs no
 * decoding engine (the alphabet is phonemic and small), so there is no 'decoding' layer and no romanization.
 */
export const ALBANIAN_ASSISTANCE: Record<string, AssistanceProfile> = {
  '0': { visibility: 'heavy', defaultHighlight: 'strong', layers: L('gloss', 'note', 'phrase', 'english', 'grammar', 'sentence', 'history'), englishRescue: 'easy', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: false, chrome: 'full' },
  '1': { visibility: 'heavy', defaultHighlight: 'strong', layers: L('gloss', 'phrase', 'grammar', 'english', 'sentence', 'note', 'history'), englishRescue: 'easy', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: false, chrome: 'full' },
  '2': { visibility: 'heavy', defaultHighlight: 'subtle', layers: L('gloss', 'phrase', 'grammar', 'sentence', 'english', 'note', 'history'), englishRescue: 'easy', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: false, chrome: 'full' },
  '3': { visibility: 'contextual', defaultHighlight: 'subtle', layers: L('gloss', 'phrase', 'grammar', 'sentence', 'english', 'note', 'history'), englishRescue: 'secondary', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: false, chrome: 'full' },
  '4': { visibility: 'contextual', defaultHighlight: 'subtle', layers: L('gloss', 'phrase', 'grammar', 'discourse', 'sentence', 'english', 'note', 'history'), englishRescue: 'secondary', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: false, chrome: 'reduced' },
  '5': { visibility: 'light', defaultHighlight: 'subtle', layers: L('gloss', 'phrase', 'definition', 'grammar', 'discourse', 'sentence', 'english', 'note', 'history'), englishRescue: 'secondary', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: true, chrome: 'reduced' },
  '6': { visibility: 'light', defaultHighlight: 'subtle', layers: L('gloss', 'phrase', 'definition', 'grammar', 'discourse', 'sentence', 'note', 'english', 'history'), englishRescue: 'secondary', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: true, chrome: 'reduced' },
  '7': { visibility: 'clean', defaultHighlight: 'off', layers: L('gloss', 'phrase', 'definition', 'note', 'discourse', 'clause-structure', 'grammar', 'sentence', 'history', 'english'), englishRescue: 'deep', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: true, chrome: 'reduced' },
  '8': { visibility: 'clean', defaultHighlight: 'off', layers: L('gloss', 'note', 'phrase', 'definition', 'history', 'discourse', 'clause-structure', 'grammar', 'sentence', 'english'), englishRescue: 'deep', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: true, chrome: 'minimal' },
  '9': { visibility: 'invisible', defaultHighlight: 'off', layers: L('gloss', 'history', 'note', 'phrase', 'definition', 'discourse', 'clause-structure', 'grammar', 'sentence', 'english'), englishRescue: 'on-request', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: true, chrome: 'minimal' },
  open: { visibility: 'invisible', defaultHighlight: 'off', layers: L('gloss', 'history', 'note', 'phrase', 'definition', 'discourse', 'clause-structure', 'grammar', 'sentence', 'english'), englishRescue: 'on-request', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: true, chrome: 'minimal' },
};

// ───────────────────────────── stages ─────────────────────────────

const stage = (index: number, key: string, label: string, kind: Stage['kind'], purpose: string[], band?: string): Stage => ({
  id: ids.stage(ALBANIAN_COURSE_ID, key), courseId: ALBANIAN_COURSE_ID, lang: LANG, index, key, label, kind, purpose, band, assistance: ALBANIAN_ASSISTANCE[key],
});

const NO_GATE = 'a description of how the stage\'s own texts are written, not a gate: nothing is locked';

/** Ten stages and an open stage. None of them locks anything. */
export const ALBANIAN_STAGES: Stage[] = [
  stage(0, '0', 'Stage 0 — Orthography and ultra-simple Albanian', 'pre-reader', [
    'the Albanian alphabet: the letters ë and ç, and the digraphs dh, gj, ll, nj, rr, sh, th, xh, zh',
    'sound and spelling met together, without any romanization',
    'the first very frequent words in very short, ultra-simple sentences',
    NO_GATE,
  ]),
  stage(1, '1', 'Stage 1 — Core words (about 250–350 lemmas)', 'grade', [
    'about 250–350 core lemmas in the course\'s own texts: family, home, food, people, ordinary actions',
    'the present tense, the definite endings on nouns, the first prepositions',
    'a first small recurring world told in short narrative and dialogue',
    NO_GATE,
  ]),
  stage(2, '2', 'Stage 2 — About 600 lemmas', 'grade', [
    'about 600 lemmas in the course\'s own texts',
    'the cases met in sentences, simple past forms, the clitic pronouns in use',
    'short connected narrative; the linking article met as what it is',
    NO_GATE,
  ]),
  stage(3, '3', 'Stage 3 — About 1,000 lemmas', 'grade', [
    'about 1,000 lemmas in the course\'s own texts',
    'longer connected narrative and dialogue; the subjunctive and the admirative met in natural use',
    'the first texts that feel like real reading',
    NO_GATE,
  ]),
  stage(4, '4', 'Stage 4 — About 1,500 lemmas', 'grade', [
    'about 1,500 lemmas in the course\'s own texts',
    'subordinate clauses and relative clauses in natural use; discourse particles',
    'chapter-length narrative continuity',
    NO_GATE,
  ]),
  stage(5, '5', 'Stage 5 — About 2,500 lemmas', 'grade', [
    'about 2,500 lemmas in the course\'s own texts',
    'descriptive and more abstract language; the non-active forms in everyday use',
    'the target-language definition appears beside English where a dictionary supplies one',
    NO_GATE,
  ]),
  stage(6, '6', 'Stage 6 — Transitional: easy unrestricted prose', 'grade', [
    'the bridge from course-written texts to authentic prose: easy prose with no vocabulary restriction',
    'the course\'s own transitional texts and the easiest authentic texts, side by side',
    NO_GATE,
  ]),
  stage(7, '7', 'Stage 7 — Easier authentic contemporary Albanian', 'grade', [
    'authentic contemporary Albanian of moderate difficulty: news, essays, stories, plain fiction',
    'first exposure to Gheg and to regional usage, labelled as such (the Gheg bridge belongs to Stages 7–9)',
    NO_GATE,
  ]),
  stage(8, '8', 'Stage 8 — Historical and literary Albanian', 'grade', [
    'historical and literary Albanian: the Rilindja writers, older spelling, literary register',
    'older forms related to today\'s Standard form in the analysis; the text is never changed',
    NO_GATE,
  ]),
  stage(9, '9', 'Stage 9 — Unrestricted Albanian with advanced dialect exposure', 'grade', [
    'unrestricted Albanian, the assistance system all but disappears',
    'advanced dialect exposure: Gheg, Arbëresh, older printed Albanian — recognised and labelled, not adopted',
    NO_GATE,
  ]),
  stage(10, 'open', 'Open reading', 'open', ['the learner\'s own lawful texts, recommended from his learner model, with no stage numbers']),
];

// ───────────────────────────── corpus targets ─────────────────────────────

export interface AlbanianCorpusTarget {
  /** Stage key ('0' … '6'). */
  stage: string;
  /** Planned size of the course-owned controlled corpus for the stage, in running words. */
  minWords: number;
  /** Absent = open-ended. */
  maxWords?: number;
}

/**
 * PLANNING targets for the size of the course-owned controlled corpus per stage. They are not build blockers and not
 * a claim about what exists: today's actual figures come from the authoring report (scripts/authoring-report.mts),
 * never from this table.
 */
export const ALBANIAN_CORPUS_TARGETS: readonly AlbanianCorpusTarget[] = [
  { stage: '0', minWords: 15_000, maxWords: 25_000 },
  { stage: '1', minWords: 50_000, maxWords: 80_000 },
  { stage: '2', minWords: 100_000, maxWords: 150_000 },
  { stage: '3', minWords: 150_000, maxWords: 250_000 },
  { stage: '4', minWords: 250_000, maxWords: 400_000 },
  { stage: '5', minWords: 400_000, maxWords: 700_000 },
  { stage: '6', minWords: 500_000 },
];

// ───────────────────────────── streams ─────────────────────────────

const stream = (order: number, key: string, kind: Stream['kind'], label: string, description: string, available = true): Stream => ({
  id: ids.stream(ALBANIAN_COURSE_ID, key), courseId: ALBANIAN_COURSE_ID, lang: LANG, key, label, description, kind, order, available,
});

/** One learner model, many content surfaces. A word learned on one shelf is known on every other. */
export const ALBANIAN_STREAMS: Stream[] = [
  stream(0, 'acquisition', 'acquisition', 'Acquisition Path', 'Controlled, modern, highly comprehensible Standard Albanian written for the course: the launch ramp into real texts.'),
  stream(1, 'library', 'library', 'Stories', 'Authentic Albanian by shelf: stories, novels, essays, in your own copy or where the rights are clear.'),
  stream(2, 'scripture', 'scripture', 'Bible', 'Scripture read directly in Albanian, with English only as rescue. No Albanian Bible text is bundled today.'),
  stream(3, 'mission', 'mission', 'Mission', 'Stories, dialogues and explanations for mission life: meetings, homes, church, ordinary conversation. Not a phrasebook.'),
  stream(4, 'historical', 'library', 'History & Literature', 'Historical and literary Albanian: the Rilindja writers and older printed Albanian, in the spelling of their time.'),
  stream(5, 'gheg', 'regional', 'Gheg Bridge', 'Northern Albanian (Gheg) read beside the Standard, labelled as Gheg. Meant for the later stages (7–9), never the first ones.'),
  stream(6, 'personal', 'personal', 'Your Books', 'Your own lawful copies, on this device only, read with the same help as everything else.'),
  // GoListen is deferred: audio is not part of V1. The stream exists as data so that audio can attach to texts later.
  stream(7, 'listening', 'listening', 'Listen', 'Audio attached to texts, when rights-clear recordings exist. Not part of V1.', false),
];

// ───────────────────────────── doors ─────────────────────────────

/** Doors on Home and Explore; each is a filter on the catalogue, never a separate course. */
export const ALBANIAN_DOORS = [
  { key: 'acquisition', label: 'Acquisition Path', stream: 'acquisition' },
  { key: 'stories', label: 'Stories', stream: 'library' },
  { key: 'bible', label: 'Bible', stream: 'scripture' },
  { key: 'mission', label: 'Mission', stream: 'mission' },
  { key: 'history-literature', label: 'History & Literature', stream: 'historical' },
  { key: 'gheg-bridge', label: 'Gheg Bridge', stream: 'gheg' },
  { key: 'your-books', label: 'Your Books', stream: 'personal' },
] as const;

// ───────────────────────────── variety policy ─────────────────────────────

/**
 * The active target is Standard Albanian. Every other variety is recognised and labelled, never adopted by default.
 * Codes (defined in src/adapters/albanian/varieties.ts): sq Standard, aln Gheg, aln-XK, aln-AL, als Tosk, aae Arbëresh,
 * aat Arvanitika, sq-hist, sq-pre1972, sq-pre1908.
 */
export const ALBANIAN_VARIETY_POLICY: VarietyPolicy = { target: 'sq', within: [] };

// ───────────────────────────── rights records ─────────────────────────────

/** The caution every old-work candidate carries, in one plain sentence. */
const OLD_WORK_CAUTION =
  'The Albanian term is commonly the author\'s life plus 70 years, which by itself says nothing about United States status; a modern edition, transcription or modernised spelling may carry its own rights; Wikisource is a place to find a text, not a verification.';

const BASE: WorkRights = {
  state: 'rights-unverified', copyrightStatus: 'unknown', permission: 'unknown', canBundle: false, userImportOnly: true,
  canModify: false, canStoreOffline: false, canBundleAudio: false, audiobook: 'unknown', verified: false,
  acquisitionNotes: 'Rights not verified. Nothing is bundled until the exact edition, its source and the legal basis are recorded with their evidence.',
};

/** An old work: the date of death is a lead. The edition actually used still has to be identified and checked. */
const lead = (basis: string, extra?: Partial<WorkRights>): WorkRights => ({
  ...BASE, jurisdiction: 'not established',
  basis: `${basis} A lead for verification, not a conclusion: the exact edition and source must be checked, and terms differ by country.`,
  acquisitionNotes: `Rights not verified. ${OLD_WORK_CAUTION}`,
  ...extra,
});

/** A modern work under copyright: listed so the learner can find it; the app holds no text. */
const modern = (basis: string): WorkRights => ({
  ...BASE, state: 'prohibited-from-bundling', copyrightStatus: 'in-copyright', permission: 'none', basis: `${basis} Presumed in copyright; not verified.`,
  acquisitionNotes: 'In copyright: never bundled. Import your own lawful copy; it stays on this device.',
});

/** Text written for the course. Machine-drafted text says so on the work and needs native review before it is published. */
const COURSE: WorkRights = {
  state: 'course-authored', copyrightStatus: 'licensed', licensing: 'written for this course', permission: 'not-needed', canBundle: true, userImportOnly: false,
  canModify: true, canStoreOffline: true, canBundleAudio: false, audiobook: 'none', verified: true, verifiedBy: 'course authors', basis: 'Original text written for the course.',
};

// ───────────────────────────── works ─────────────────────────────

let order = 0;
interface W {
  slug: string; stage: string; title: string; author?: string; died?: number; year?: number; role?: WorkRole; streams?: string[]; variety?: string;
  region?: string; era?: string; genre?: string; audience?: string; domains?: string[]; level?: Work['genericLevel']; registers?: RegisterTag[];
  rights?: WorkRights; purpose?: string[]; notes?: string; ingestion?: Work['ingestion']; readiness?: Work['readiness']; orthography?: string;
}
const readinessOf = (r: WorkRights): NonNullable<Work['readiness']> =>
  (r.state === 'prohibited-from-bundling' || r.state === 'recommended-only' ? 'recommendation' : r.state === 'rights-unverified' ? 'candidate' : 'verified-ready');
const works = (list: W[]): Work[] => list.map((w) => {
  const rights = w.rights ?? (w.died !== undefined ? lead(`The author died in ${w.died}${w.year ? `; first published ${w.year}` : ''}.`) : BASE);
  return {
    id: ids.work(ALBANIAN_COURSE_ID, w.slug), courseId: ALBANIAN_COURSE_ID, lang: LANG, stageId: ids.stage(ALBANIAN_COURSE_ID, w.stage),
    role: w.role ?? 'subsidiary', order: order++, title: w.title, author: w.author, purpose: w.purpose ?? [], registers: w.registers,
    rights, bibliographyVerified: false, optional: true, notes: w.notes,
    streams: w.streams ?? ['library'], variety: w.variety, region: w.region, era: w.era, genre: w.genre, audience: w.audience, domains: w.domains,
    genericLevel: w.level, publicationYear: w.year, authorDied: w.died, ingestion: w.ingestion ?? 'catalogued',
    readiness: w.readiness ?? readinessOf(rights), orthography: w.orthography,
  };
});

const DRAFT = 'Machine-drafted prototype: not reviewed by a native speaker, so it is visible in preview only.';

/**
 * The Albanian Bible commonly labelled "ALB". What is known (read from the version page by the coordinator on
 * 2026-10-01): the page says the text is in the public domain in the United States, and says it has no further
 * information about the version's publication history. That single statement does not establish the edition, the
 * translator, the year, or the status outside the United States, and a website's label is not a verification.
 */
export const ALB_BIBLE_RIGHTS: WorkRights = {
  ...BASE,
  jurisdiction: 'not established',
  statusByJurisdiction: { US: 'unknown' },
  sourceRepository: 'the BibleGateway version page for the version labelled ALB (the page only; no text was retrieved)',
  basis: 'A website\'s version page says the text is in the public domain in the United States. That is a label on a web page, not a verification.',
  evidence: [
    'The version page of BibleGateway, read by the coordinator on 2026-10-01, states that the text is in the public domain in the United States.',
    'The same page states that it has no further information about the version\'s publication history.',
    'MISSING: which edition this is, who published it, who translated it, and in what year.',
    'MISSING: the status of the text outside the United States, and in the source country.',
    'MISSING: whether this exact text may be modified, annotated, and stored offline by the app.',
    'MISSING: a person\'s verification of any of this against the edition itself.',
  ],
  acquisitionNotes: 'Rights not verified. The only statement on record is a website\'s label for the United States; it does not identify the edition and does not speak for other countries. No Albanian Bible text is bundled.',
};

/** The layers of a nineteenth-century translation that each need their own check before any text could be used. */
const KRISTOFORIDHI_LAYERS =
  'Each layer has its own rights question and none is answered: (1) the nineteenth-century work itself; (2) the particular edition; (3) a scan of it, and who holds the scan; (4) a modern transcription of the scan; (5) any transliteration or modernised spelling made from it; (6) editorial notes, introductions and apparatus added by a modern editor.';

const LEAD_CAUTION = OLD_WORK_CAUTION;

export const ALBANIAN_WORKS: Work[] = [
  ...CURRICULUM_ACQUIRED_WORKS.filter(w => w.lang === 'sq'),
  ...MODERN_ALBANIAN_WORKS,
  ...readingBridgeWorks('sq'),
  // ── Course-authored: the seed. Later course works are not listed until they exist. ──
  ...works([
    { slug: 'udha-0', stage: '0', title: 'Udha 0 — Shkronjat dhe fjalët e para', role: 'spine', streams: ['acquisition'], variety: 'sq', level: 'controlled', genre: 'microstories', rights: COURSE, ingestion: 'bundled', readiness: 'implemented',
      purpose: ['the letters and digraphs of Albanian, met in words', 'the first very frequent words', 'ultra-simple sentences'], notes: DRAFT },
    { slug: 'udha-1', stage: '1', title: 'Udha 1 — Familja dhe shtëpia', role: 'spine', streams: ['acquisition'], variety: 'sq', level: 'controlled', genre: 'short narrative', rights: COURSE, ingestion: 'bundled', readiness: 'implemented',
      purpose: ['family and home vocabulary', 'the present tense and the definite endings', 'a small recurring world'], notes: DRAFT },
    { slug: 'misioni-1', stage: '1', title: 'Misioni 1 — Takime', role: 'spine', streams: ['mission', 'acquisition'], variety: 'sq', level: 'controlled', genre: 'dialogues', rights: COURSE, ingestion: 'bundled', readiness: 'implemented',
      purpose: ['meetings and first conversations in mission life', 'stories and dialogues, not a phrasebook'], notes: DRAFT },
  ]),

  // ── Scripture: ONE modern candidate ──
  ...works([
    { slug: 'bibla-alb', stage: '6', title: 'Bibla (the Albanian Bible commonly labelled ALB)', streams: ['scripture', 'mission'], variety: 'sq', genre: 'Bible translation', registers: ['religious', 'biblical'], domains: ['theology'],
      rights: ALB_BIBLE_RIGHTS, readiness: 'candidate',
      notes: 'A candidate only. The edition, translator and year are not established and are not named here. A three-verse sample of unidentified origin exists in data/corpus/sq/bible-1john-1.json as a technical fixture; it never ships. Stage placement is an orientation, not a gate.' },
  ]),

  // ── Historical Scripture: Kristoforidhi, as candidates for the historical and Gheg streams ──
  ...works([
    { slug: 'kristoforidhi-dhjata-e-re-gheg', stage: '9', title: 'Kostandin Kristoforidhi — the New Testament in Gheg', author: 'Kostandin Kristoforidhi', died: 1895, streams: ['historical', 'gheg', 'scripture'], variety: 'aln', era: '19th century', genre: 'Bible translation (New Testament)', registers: ['religious', 'biblical', 'historical'], domains: ['theology'], level: 'historical',
      notes: `A nineteenth-century translation into Gheg, a candidate for historical and Gheg study only, never for the learner's own Albanian. ${KRISTOFORIDHI_LAYERS} ${LEAD_CAUTION}` },
    { slug: 'kristoforidhi-dhjata-e-re-tosk', stage: '8', title: 'Kostandin Kristoforidhi — the New Testament in Tosk', author: 'Kostandin Kristoforidhi', died: 1895, streams: ['historical', 'scripture'], variety: 'als', era: '19th century', genre: 'Bible translation (New Testament)', registers: ['religious', 'biblical', 'historical'], domains: ['theology'], level: 'historical',
      notes: `A nineteenth-century translation into Tosk, a candidate for historical study only. ${KRISTOFORIDHI_LAYERS} ${LEAD_CAUTION}` },
  ]),

  // ── Historical and literary candidates: only certain facts; every one carries the caution ──
  ...works([
    // Rilindja authors of the south (Tosk), in the spelling of their time
    { slug: 'naim-frasheri-lulet-e-veres', stage: '8', title: 'Lulet e verës', author: 'Naim Frashëri', died: 1900, year: 1890, streams: ['historical'], variety: 'sq-hist', era: '19th century', genre: 'verse', level: 'historical', registers: ['literary'],
      notes: `Poetry of the Rilindja. Early editions are in the spelling of their time. ${LEAD_CAUTION}` },
    { slug: 'naim-frasheri-bageti-e-bujqesi', stage: '8', title: 'Bagëti e bujqësi', author: 'Naim Frashëri', died: 1900, year: 1886, streams: ['historical'], variety: 'sq-hist', era: '19th century', genre: 'verse', level: 'historical', registers: ['literary'],
      notes: `Poetry of the Rilindja. ${LEAD_CAUTION}` },
    { slug: 'naim-frasheri-istori-e-skenderbeut', stage: '8', title: 'Istori e Skënderbeut', author: 'Naim Frashëri', died: 1900, year: 1898, streams: ['historical'], variety: 'sq-hist', era: '19th century', genre: 'epic verse', level: 'historical', registers: ['literary'],
      notes: `A verse history of Skanderbeg. ${LEAD_CAUTION}` },
    { slug: 'sami-frasheri-shqiperia', stage: '8', title: 'Shqipëria ç\'ka qënë, ç\'është e ç\'do të bëhetë', author: 'Sami Frashëri', died: 1904, year: 1899, streams: ['historical'], variety: 'sq-hist', era: '19th century', genre: 'essay', level: 'historical', domains: ['history'],
      notes: `A political and cultural essay of the Rilindja. ${LEAD_CAUTION}` },
    { slug: 'cajupi-baba-tomorri', stage: '8', title: 'Baba Tomorri', author: 'Andon Zako Çajupi', died: 1930, year: 1902, streams: ['historical'], variety: 'sq-hist', era: 'early 20th century', genre: 'verse', level: 'historical', registers: ['literary'],
      notes: `${LEAD_CAUTION}` },
    { slug: 'konica-albania-periodical', stage: '8', title: 'Albania (the periodical edited by Faik Konica)', author: 'Faik Konica (editor)', died: 1942, streams: ['historical'], variety: 'sq-hist', era: 'early 20th century', genre: 'periodical', level: 'historical', domains: ['history'],
      notes: `A periodical of many contributors: each contribution is its own text with its own author and term; the editor's death year is a lead for his own writing only. ${LEAD_CAUTION}` },
    { slug: 'asdreni-rreze-dielli', stage: '8', title: 'Rreze dielli', author: 'Asdreni', died: 1947, year: 1904, streams: ['historical'], variety: 'sq-hist', era: 'early 20th century', genre: 'verse', level: 'historical', registers: ['literary'],
      notes: `Asdreni is the pen name of the poet. ${LEAD_CAUTION}` },
    { slug: 'vasa-bardha-e-temalit', stage: '8', title: 'Bardha e Temalit', author: 'Pashko Vasa', died: 1892, streams: ['historical'], variety: 'sq-hist', era: '19th century', genre: 'novel', level: 'historical',
      notes: `${LEAD_CAUTION}` },
    // Arbëresh
    { slug: 'de-rada-milosao', stage: '9', title: 'Milosao', author: 'Jeronim de Rada', died: 1903, year: 1836, streams: ['historical'], variety: 'aae', era: '19th century', genre: 'verse', level: 'historical', registers: ['literary'],
      rights: lead('The author died in 1903; first published 1836.', { countryOfOrigin: 'IT' }),
      notes: `Written in Arbëresh, the Albanian of Italy, which is recognised and labelled, never mixed into Standard Albanian. First printed in Naples. ${LEAD_CAUTION}` },
    // Gheg (north)
    { slug: 'fishta-lahuta-e-malcis', stage: '9', title: 'Lahuta e Malcís', author: 'Gjergj Fishta', died: 1940, streams: ['historical', 'gheg'], variety: 'aln', era: 'early 20th century', genre: 'epic verse', level: 'historical', registers: ['literary'],
      notes: `Written in Gheg. Published in parts, the complete edition in 1937; the edition used decides the question. ${LEAD_CAUTION}` },
    { slug: 'fishta-mrizi-i-zanave', stage: '9', title: 'Mrizi i Zanave', author: 'Gjergj Fishta', died: 1940, streams: ['historical', 'gheg'], variety: 'aln', era: 'early 20th century', genre: 'play', level: 'historical',
      notes: `Written in Gheg. ${LEAD_CAUTION}` },
    { slug: 'fishta-anzat-e-parnasit', stage: '9', title: 'Anzat e Parnasit', author: 'Gjergj Fishta', died: 1940, streams: ['historical', 'gheg'], variety: 'aln', era: 'early 20th century', genre: 'satirical verse', level: 'historical', registers: ['literary'],
      notes: `Written in Gheg. ${LEAD_CAUTION}` },
    { slug: 'mjeda-juvenilia', stage: '9', title: 'Juvenilia', author: 'Ndre Mjeda', died: 1937, year: 1917, streams: ['historical', 'gheg'], variety: 'aln', era: 'early 20th century', genre: 'verse', level: 'historical', registers: ['literary'],
      notes: `Written in Gheg. ${LEAD_CAUTION}` },
    { slug: 'migjeni-vargje-te-lira', stage: '9', title: 'Vargje të lira', author: 'Migjeni (Millosh Gjergj Nikolla)', died: 1938, year: 1936, streams: ['historical', 'gheg'], variety: 'aln', era: '20th century', genre: 'verse', level: 'literary', registers: ['literary'],
      notes: `Written in northern Albanian. ${LEAD_CAUTION}` },
    { slug: 'migjeni-novela-te-qytetit-te-veriut', stage: '9', title: 'Novela të qytetit të Veriut', author: 'Migjeni (Millosh Gjergj Nikolla)', died: 1938, streams: ['historical', 'gheg'], variety: 'aln', era: '20th century', genre: 'short stories', level: 'literary',
      notes: `Written in northern Albanian. ${LEAD_CAUTION}` },
    // Old printed Albanian
    { slug: 'buzuku-meshari', stage: '9', title: 'Meshari', author: 'Gjon Buzuku', year: 1555, streams: ['historical', 'gheg'], variety: 'sq-hist', era: '16th century', genre: 'liturgical book', level: 'historical', registers: ['religious', 'archaic'],
      notes: `The earliest Albanian printed book that survives. The sixteenth-century book is not in doubt; every modern edition, transcription, transliteration and set of notes is a separate text with its own rights. ${LEAD_CAUTION}` },
    { slug: 'bogdani-cuneus-prophetarum', stage: '9', title: 'Cuneus Prophetarum', author: 'Pjetër Bogdani', year: 1685, streams: ['historical', 'gheg'], variety: 'sq-hist', era: '17th century', genre: 'religious and historical prose', level: 'historical', registers: ['religious', 'archaic'],
      notes: `A seventeenth-century book. Every modern edition, transcription, transliteration and set of notes is a separate text with its own rights. ${LEAD_CAUTION}` },
    // Fan Noli: died 1965, NOT near the public domain by any life-plus-70 rule
    { slug: 'noli-historia-e-skenderbeut', stage: '9', title: 'Historia e Skënderbeut', author: 'Fan S. Noli', died: 1965, year: 1947, streams: ['historical'], variety: 'sq', era: '20th century', genre: 'history', level: 'literary', domains: ['history'],
      rights: lead('The author died in 1965; first published 1947. By the life-plus-70 rule the Albanian term would run to the end of 2035, so this is NOT a candidate for early verification: expect it to be in copyright in the source country for years to come.'),
      notes: `Listed so the learner can find it; his own copy is the lawful path. ${LEAD_CAUTION}` },
  ]),

  // ── Modern books: the learner's own copy only ──
  ...works([
    { slug: 'kadare-gjenerali-i-ushtrise-se-vdekur', stage: '8', title: 'Gjenerali i ushtrisë së vdekur', author: 'Ismail Kadare', streams: ['library', 'personal'], variety: 'sq', era: '20th century', genre: 'novel', level: 'literary', rights: modern('A modern novel by a twentieth-century author.') },
    { slug: 'kadare-kronike-ne-gur', stage: '8', title: 'Kronikë në gur', author: 'Ismail Kadare', streams: ['library', 'personal'], variety: 'sq', era: '20th century', genre: 'novel', level: 'literary', rights: modern('A modern novel by a twentieth-century author.') },
    { slug: 'kadare-keshtjella', stage: '8', title: 'Kështjella', author: 'Ismail Kadare', streams: ['library', 'personal'], variety: 'sq', era: '20th century', genre: 'novel', level: 'literary', rights: modern('A modern novel by a twentieth-century author.') },
    { slug: 'agolli-njeriu-me-top', stage: '8', title: 'Njeriu me top', author: 'Dritëro Agolli', streams: ['library', 'personal'], variety: 'sq', era: '20th century', genre: 'novel', level: 'literary', rights: modern('A modern novel by a twentieth-century author.') },
    { slug: 'agolli-shkelqimi-dhe-renia-e-shokut-zylo', stage: '8', title: 'Shkëlqimi dhe rënia e shokut Zylo', author: 'Dritëro Agolli', streams: ['library', 'personal'], variety: 'sq', era: '20th century', genre: 'novel', level: 'literary', rights: modern('A modern novel by a twentieth-century author.') },
    { slug: 'marko-hasta-la-vista', stage: '8', title: 'Hasta la vista', author: 'Petro Marko', streams: ['library', 'personal'], variety: 'sq', era: '20th century', genre: 'novel', level: 'literary', rights: modern('A modern novel by a twentieth-century author.') },
  ]),
];

// ───────────────────────────── Scripture policy ─────────────────────────────

/**
 * Scripture policy as data. NO Albanian Bible text is bundled or published today. English rescue is the World English
 * Bible, as elsewhere in the app.
 */
export const ALBANIAN_SCRIPTURE_POLICY = {
  candidate: {
    name: 'The Albanian Bible commonly labelled ALB',
    workSlug: 'bibla-alb',
    status: 'candidate-unverified',
    canBundleText: false,
    canBundleAudio: false,
    /** What must be established, and recorded with its evidence, before any text is ingested. */
    mustEstablish: [
      'the edition and its publisher',
      'the translator or translators, and the year',
      'the status in the United States and in the source country, checked separately',
      'permission to modify, annotate and store the text offline',
      'a person\'s verification of the wording against the exact edition (scripts/verify-scripture.mjs)',
    ],
  },
  /** What is not approved today. */
  notApproved: [
    'no Albanian Bible text is bundled or published today',
    'the three-verse sample in data/corpus/sq/bible-1john-1.json is of unidentified origin; it is a technical fixture and never ships',
    'any modern Albanian translation without the publisher\'s written permission on file',
  ],
  englishRescue: { name: 'World English Bible', note: 'public domain, as elsewhere in the app; the English rescue for every Scripture text' },
  /** For historical and Gheg study only, never the learner\'s own Albanian. */
  historical: {
    name: 'Kostandin Kristoforidhi, nineteenth-century New Testament translations (Gheg and Tosk)',
    workSlugs: ['kristoforidhi-dhjata-e-re-gheg', 'kristoforidhi-dhjata-e-re-tosk'],
    status: 'candidate-unverified',
    use: 'historical and Gheg study only',
    canBundleText: false,
  },
  rule: 'A translation is shown only from the learner\'s own copy or with its rights verified and recorded. The Scripture surface is Albanian text with English rescue, not a parallel-Bible interface.',
  audio: 'No recording is bundled. Text rights and recording rights are separate.',
} as const;
