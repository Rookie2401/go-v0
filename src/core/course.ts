/**
 * Curriculum model: Course → Stage → Work → Chapter (a Text) → Paragraph → Sentence → Phrase → Token.
 *
 * A course ladder is a set of reading STAGES (internal bands, not school years) and the WORKS recommended at each.
 * A Work is a curriculum entry with honest rights metadata; it only becomes readable when texts for it are
 * imported (each imported chapter is a `Text` with `workId` + `chapter`). Listing a work here never implies the
 * application may distribute it.
 */
import type { LanguageCode, ReviewStatus } from './model';
import type { StageContract } from '../course/curriculumPolicy';

// ───────────────────────────── stages and assistance ─────────────────────────────

/** The layers of help a tap can open, in the order a stage offers them. */
export type HelpLayer =
  | 'gloss' // contextual word meaning
  | 'decoding' // script: syllables, consonant class, vowel length, tone (Thai Stage 0+)
  | 'phrase' // phrase unit meaning (ไปหา = go to see)
  | 'grammar' // construction / function (กำลัง + VERB = progressive)
  | 'definition' // easy definition in the target language
  | 'discourse' // what this particle / connective is doing here
  | 'clause-structure' // visual decomposition of a difficult sentence (never rewrites it)
  | 'note' // cultural / regional / register / literary note
  | 'sentence' // sentence-level explanation
  | 'english' // English rescue
  | 'history'; // the learner's own history with the item

/**
 * How much of the system shows at a stage. The system removes itself as the learner advances; help never
 * disappears, it moves deeper. English rescue is available at EVERY stage.
 */
export interface AssistanceProfile {
  visibility: 'heavy' | 'contextual' | 'light' | 'clean' | 'invisible';
  defaultHighlight: 'off' | 'subtle' | 'strong';
  /** Order in which the word sheet offers layers. 'english' is always present. */
  layers: HelpLayer[];
  /** How close to the surface English is. */
  englishRescue: 'easy' | 'secondary' | 'deep' | 'on-request';
  /** Romanization is an emergency rescue at the earliest stage only; it must never become a crutch. */
  romanization: 'rescue' | 'never';
  /** Show the decoding breakdown (syllable / tone) by default on the first tap. */
  decodingFirst: boolean;
  /** Prefer an easy target-language definition before English when one exists. */
  targetLanguageDefinitions: boolean;
  /** Progress chrome (coverage lines, panels) shown by default in the reader. */
  chrome: 'full' | 'reduced' | 'minimal';
}

/**
 * The profile of a course that has no ladder (and the fallback when a stage cannot be resolved): the word sheet as
 * it has always worked — gloss, phrases, grammar, sentence explanation, English — with full chrome.
 */
export const DEFAULT_ASSISTANCE: AssistanceProfile = {
  visibility: 'contextual',
  defaultHighlight: 'subtle',
  layers: ['gloss', 'phrase', 'grammar', 'sentence', 'english', 'history'],
  englishRescue: 'secondary',
  romanization: 'never',
  decodingFirst: false,
  targetLanguageDefinitions: false,
  chrome: 'full',
};

/**
 * What opening a layer means for evidence (the reader emits the matching event; GoLearn's policy does the rest):
 *   gloss → TokenHelpOpened level 1 · decoding → DecodingRevealed · phrase → PhraseHelpOpened / level 2 ·
 *   grammar, definition, discourse → GrammarHelpOpened / level 3 · sentence, clause-structure →
 *   SentenceExplanationRevealed (level 4) · english → EnglishRescueRevealed (level 5) ·
 *   note → NoteOpened (context, no evidence effect) · history → nothing (looking at one's own record is not help).
 */
export const LAYER_ASSISTANCE_LEVEL: Record<HelpLayer, 0 | 1 | 2 | 3 | 4 | 5> = {
  gloss: 1, decoding: 1, phrase: 2, grammar: 3, definition: 3, discourse: 3, 'clause-structure': 4, sentence: 4, english: 5, note: 0, history: 0,
};

export interface Stage {
  contract?: StageContract;
  id: string; // ids.stage(courseId, key) e.g. "stage:thailand-th:0", "stage:thailand-th:g4", "stage:thailand-th:open"
  courseId: string;
  lang: LanguageCode;
  index: number; // order in the ladder
  key: string; // "0" | "g1" … "g9" | "open"
  label: string; // "Stage 0 — Pre-reader", "Grade 4"
  /** 'shelf' = a browsing shelf of a large library (Spanish): an orientation, never a lock and never a gate. */
  kind: 'pre-reader' | 'grade' | 'open' | 'shelf';
  /** What the stage is for (decoding, first sustained narrative, discourse particles…). */
  purpose: string[];
  /** Approximate CEFR band, when the course owner states one. An orientation, never an entry requirement. */
  band?: string;
  assistance: AssistanceProfile;
}

// ───────────────────────────── works and rights ─────────────────────────────

export type WorkRole = 'spine' | 'subsidiary' | 'nonfiction' | 'extensive' | 'audio' | 'scripture';

/**
 * Rights are recorded, never assumed. Unknown stays 'unknown'. `canBundle` is true only when the status is
 * established (public domain with a stated basis, or a licence/permission on file); otherwise the work is a
 * curriculum recommendation that the learner imports from a copy he is entitled to use.
 */
/**
 * The single rights state shown to the learner and enforced by tooling. "rights-unverified" is never presented as
 * public domain; only the two "verified" states (set by a named person, with the basis and source recorded) allow
 * a work's text to be bundled.
 */
export type RightsState =
  | 'verified-public-domain'
  | 'verified-open-licence'
  | 'permission-granted' // the rights holder gave written permission for this use; the permission is on file and named in the record
  | 'course-authored' // written for the course by its authors (machine-drafted text says so separately and still needs review)
  | 'recommended-only' // listed for the learner to find; the app holds no text
  | 'user-supplied' // the learner's own lawful copy, on this device only
  | 'rights-unverified'
  | 'prohibited-from-bundling'
  // material kept for validation or study only (a treebank, a reference edition): never bundled, never shown as course text
  | 'research-only';

export interface WorkRights {
  /** Preferred over the older fields below when present. */
  state?: RightsState;
  /** Where the rule applies, when it matters ("public domain in the United States; other countries differ"). */
  jurisdiction?: string;
  canModify?: boolean;
  canStoreOffline?: boolean;
  canBundleAudio?: boolean;
  /** Who verified the rights and when (required for the two verified states). */
  verifiedBy?: string;
  verifiedAt?: string;
  copyrightStatus: 'in-copyright' | 'public-domain' | 'licensed' | 'unknown';
  /** Why we believe the status (author's death year + term, licence text, publisher statement…) and how sure. */
  basis?: string;
  licensing?: string;
  permission: 'none' | 'requested' | 'granted' | 'not-needed' | 'unknown';
  canBundle: boolean;
  userImportOnly: boolean;
  audiobook: 'exists' | 'none' | 'unknown';
  audioRights?: string;
  transcriptRights?: string;
  acquisitionNotes?: string;
  /** True only when a person has checked the claims above against a source. */
  verified: boolean;
  // ── the evidence record of an exact edition (required before a text is bundled; absent on a mere recommendation) ──
  /** Where the text was taken from: the repository ("de.wikisource.org", "eBible.org") and the exact page or file. */
  sourceRepository?: string;
  /** Every jurisdiction the basis was checked for ("DE", "EU", "US"). A U.S.-only statement is not worldwide. */
  jurisdictions?: string[];
  /** The licence the source states for its text ("CC BY-SA 4.0", "Public Domain"), verbatim, with where it says so. */
  licence?: string;
  attributionRequired?: boolean;
  shareAlike?: boolean;
  /** What was changed on the way in ("none: identical to the source", "line breaks removed; page headers removed"). */
  modifications?: string;
  retrievedAt?: string;
  /** sha256 of the retrieved source file or page. */
  checksum?: string;
  /** The source's own proofreading state ("Wikisource: proofread twice (fertig)"), or 'unknown'. */
  proofreading?: string;
  /** The evidence itself, one statement per line: who died when, which edition, what the source page says. */
  evidence?: string[];
  /** The name of the licence ("CC BY-SA", "CC0") and its version ("4.0"); `licence` stays the free-text statement. */
  licenceName?: string;
  licenceVersion?: string;
  /** The attribution line the licence or the rights holder asks for, ready to show. */
  attributionText?: string;
  /** Whether redistribution of the text (bundling it in the app) is allowed at all; absent = not established. */
  redistribution?: boolean;
  /** Machine-readable evidence, one record per source consulted; `evidence` keeps the plain statements. */
  evidenceRecords?: Array<{
    kind: 'publisher-statement' | 'catalogue-entry' | 'author-death' | 'licence-text' | 'correspondence' | 'statute' | 'other';
    url?: string;
    quote?: string;
    checkedAt: string;
    by: string;
    note?: string;
  }>;
  /** Contractual limits of the source site that apply whatever the copyright status (a site's terms of use). */
  sourceTerms?: string;
  /** Whether the app as built meets the licence's conditions (attribution shown, share-alike respected), and how. */
  compliance?: string;
  // ── an old work has several layers, each with its own rights: the work, this edition, the scan, the transcription ──
  /** Country the work was first published in ("AL", "IT", "TR"): the term of the source country starts from here. */
  countryOfOrigin?: string;
  /** Year this EDITION was published (the work's first publication is `Work.publicationYear`). */
  editionYear?: number;
  /** The scan the text was read from (library, shelf mark or URL), when a scan is the source. */
  scanSource?: string;
  /** Who transcribed the text and from what; a modern transcription may carry rights the old work does not. */
  transcriptionSource?: string;
  /** Who modernised or normalised the spelling, when the text is not in its original orthography. */
  modernizationSource?: string;
  /** The status in each jurisdiction that was actually checked ("US", "AL", "EU"). Absent = not checked; one never implies another. */
  statusByJurisdiction?: Record<string, 'public-domain' | 'in-copyright' | 'licensed' | 'unknown'>;
  /** Whether the licence or permission covers commercial use. Absent = not established. */
  commercialUse?: boolean;
}

export interface Work {
  id: string; // ids.work(courseId, slug)
  courseId: string;
  lang: LanguageCode;
  stageId: string;
  role: WorkRole;
  /** Order within the stage (spine first). Sub-steps like 8.1 … 8.9 use `step`. */
  order: number;
  step?: string;
  title: string;
  author?: string;
  publisher?: string;
  edition?: string;
  isbn?: string;
  source?: string;
  digitalAvailability?: string;
  /** Why it is in the course. */
  purpose: string[];
  /** Language varieties the learner will meet here (drives register notes). */
  registers?: RegisterTag[];
  rights: WorkRights;
  /** False until the bibliographic details were checked against a catalogue or the book itself. */
  bibliographyVerified: boolean;
  /** May be skipped / is optional at this stage. */
  optional?: boolean;
  notes?: string;
  // ── catalogue fields for a large library (all optional; unknown stays absent, never guessed) ──
  /** Content streams this work belongs to (keys of the course's streams: 'acquisition', 'library', 'honduras', …). */
  streams?: string[];
  /** Variety of the language the work is written in ('es-HN', 'es-ES', 'es-hist', …; see core/variety.ts). */
  variety?: string;
  /** Country or region the work comes from / is about, in plain words. */
  region?: string;
  era?: string; // "19th century", "medieval", "contemporary"
  genre?: string;
  audience?: string; // "children", "general", "scholarly"
  /** Subject domains ('history', 'engineering', 'theology' …): feeds domain familiarity. */
  domains?: string[];
  /** A generic difficulty orientation for a reader with no history. Personal difficulty is computed, not stored. */
  genericLevel?: 'controlled' | 'easy' | 'intermediate' | 'advanced' | 'literary' | 'classical' | 'historical';
  wordCount?: number;
  publicationYear?: number;
  /** Year of the author's death, when known: a lead for rights research, never a conclusion. */
  authorDied?: number;
  sourceUrl?: string;
  /** How far the text has come: only catalogued, ingested by a tool into the library, or bundled with the app. */
  ingestion?: 'catalogued' | 'ingested' | 'bundled';
  translator?: string;
  editor?: string;
  /** A translation and an edition have their own terms: the translator's death year is a separate lead. */
  translatorDied?: number;
  /**
   * Where the work stands on the way into the corpus. 'implemented' = bundled and readable now; 'verified-ready' =
   * rights verified for an exact edition, not yet ingested; 'candidate' = awaiting a rights review; 'recommendation' =
   * will only ever be the learner's own copy. Never 'implemented' or 'verified-ready' without a verified rights state.
   */
  readiness?: 'implemented' | 'verified-ready' | 'candidate' | 'recommendation';
  /** The pipeline states of a text on its way in. */
  pipeline?: { acquisition: 'none' | 'retrieved'; parsing: 'none' | 'parsed'; proofreading: 'unknown' | 'none' | 'once' | 'twice' };
  /** The writing system or spelling norm of this edition, in plain words ("Istanbul alphabet (1879)", "pre-1972 spelling"). */
  orthography?: string;
  /** Whether the text is as its source wrote it, or was normalised / modernised (then `rights.modernizationSource` says by whom). */
  modernization?: 'original' | 'normalized' | 'modernized';
}

/** A major content stream of a course. Streams share one learner model; they are shelves of one library, not courses. */
export interface Stream {
  id: string; // ids.stream(courseId, key)
  courseId: string;
  lang: LanguageCode;
  key: string;
  label: string;
  description: string;
  kind: 'acquisition' | 'library' | 'regional' | 'knowledge' | 'scripture' | 'mission' | 'personal' | 'listening';
  order: number;
  /** Shown in navigation. A stream whose engine is switched off (listening while GoListen is deferred) is kept as data. */
  available: boolean;
}

// ───────────────────────────── language varieties ─────────────────────────────

/**
 * Variety / register of a word or construction. Anything that is not 'standard' must be shown as such, so that
 * regional, historical or literary forms never corrupt the learner's model of ordinary contemporary usage.
 */
export type RegisterTag =
  | 'standard' | 'colloquial' | 'formal' | 'literary' | 'archaic' | 'historical' | 'royal' | 'religious'
  | 'regional-isan' | 'regional-north' | 'regional-south' | 'teochew' | 'child-directed' | 'slang'
  // lexical layers of one language (Hindi: everyday Hindustani, Sanskrit-derived formal words, Persian / Arabic-derived words,
  // English loans) and the vocabulary of Scripture and church. A layer is a fact about the word, never a verdict on it.
  | 'everyday' | 'sanskritic' | 'perso-arabic' | 'english-loan' | 'biblical';

// ───────────────────────────── script decoding ─────────────────────────────

/**
 * One syllable of a word, decoded from its spelling. Produced by rule where the spelling is regular and from a
 * reviewed exception list where it is not; `confidence` is low (and `tone` may be absent) when the engine cannot
 * be sure — it never guesses silently.
 */
export interface SyllableAnalysis {
  text: string;
  start: number; // offsets within the token surface
  end: number;
  initial?: string; // initial consonant letter(s) as written
  initialClass?: 'mid' | 'high' | 'low';
  cluster?: string; // true cluster (กร, ปล…) or leading-consonant pattern (ห นำ, อ นำ)
  vowel?: string; // the vowel as written, with ◌ for the consonant position
  vowelLength?: 'short' | 'long';
  /** The vowel's sound in plain romanized form ("a", "o", "ue"…); what the learner needs when the vowel is unwritten (vowel "◌"). */
  vowelSound?: string;
  /** This syllable as a regular respelling, only when sound and spelling part ways (ขนม → second syllable "หนม"). */
  respelled?: string;
  final?: string; // final consonant letter(s) as written
  finalSound?: string; // k p t m n ŋ j w
  /** Thai: how the syllable ends, which decides its tone. Absent for a script where the notion does not apply. */
  ending?: 'open' | 'live' | 'dead';
  toneMark?: string;
  tone?: 'mid' | 'low' | 'falling' | 'high' | 'rising';
  /** Which rule produced the tone, in plain words ("mid-class consonant + mai tho → falling"). */
  rule?: string;
  ipa?: string;
  /** Emergency rescue only (see AssistanceProfile.romanization). */
  romanization?: string;
  irregular?: boolean; // sound and spelling part ways (exception list or dictionary pronunciation)
  /**
   * Scripts whose consonant letters carry an unwritten vowel (Devanagari): whether that vowel is said in this unit.
   * Writing and speech part ways here (कमल is written ka-ma-la and said ka-mal), so it is stated per unit, with the
   * unit's own `confidence`; 'uncertain' when the rules cannot tell. Absent when the unit has a written vowel.
   */
  inherentVowel?: 'pronounced' | 'dropped' | 'uncertain';
  /** Signs written on the unit, by name ('nukta', 'anusvara', 'chandrabindu', 'visarga', 'virama', 'reph', 'rakar'). */
  signs?: string[];
  /**
   * Where this reading came from: the spelling rules, the engine's hand-written exception list (machine-drafted),
   * a dictionary's pronunciation data (`sourceId`), or a decoding supplied with the text.
   */
  source?: 'rule' | 'exception-list' | 'dictionary' | 'author';
  sourceId?: string;
  /**
   * When `source` is not 'rule': what the spelling rules alone say for this syllable, if they give a confident answer
   * that DIFFERS. Kept so that a dictionary never silently overrides a rule result (and the reverse).
   */
  ruleTone?: 'mid' | 'low' | 'falling' | 'high' | 'rising';
  confidence: number; // 0..1
}

// ───────────────────────────── notes ─────────────────────────────

/** A concise note attached to a place in a text. Notes clarify the text; they never replace or rewrite it. */
export interface ContentNote {
  id: string; // ids.note(textId, key)
  textId: string;
  lang: LanguageCode;
  sentenceId?: string;
  tokenIds?: string[];
  kind: 'cultural' | 'regional' | 'register' | 'literary' | 'historical' | 'clause-structure';
  /** For clause-structure: labelled spans over the sentence's own text (offsets), e.g. main clause / reason clause. */
  spans?: Array<{ start: number; end: number; label: string }>;
  body: string;
  topics?: string[]; // kinship, Buddhism, food, Teochew…
  provenance: 'human' | 'machine' | 'lexicon';
  /** Who wrote the note, when the import says so. */
  by?: string;
  reviewStatus: ReviewStatus;
}
