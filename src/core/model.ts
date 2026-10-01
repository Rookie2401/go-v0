/**
 * Go — shared content / linguistic / learner / audio / production model.
 *
 * This file is THE contract. Every surface (Read, Scripture, My Testimony) and every engine
 * (GoLearn, GoListen, GoTell) reads and writes these shapes through `AppStore` (store.ts) and
 * communicates through the domain events in events.ts. Nothing duplicates learner state.
 *
 * ID conventions (see ids.ts): ids are stable strings derived from content identity so the same
 * linguistic object resolves to the same id wherever it appears.
 */

// ───────────────────────────── languages / courses ─────────────────────────────

/** BCP-47 primary subtags of the five course languages. */
export type LanguageCode = 'es' | 'sq' | 'th' | 'hi' | 'de';
export const LANGUAGES: readonly LanguageCode[] = ['es', 'sq', 'th', 'hi', 'de'] as const;

export type Script = 'Latn' | 'Deva' | 'Thai';

export interface Language {
  id: LanguageCode;
  name: string; // English name
  endonym: string; // name in the language itself
  script: Script;
  direction: 'ltr' | 'rtl';
  /** Whether ordinary whitespace separates words (false for Thai). */
  whitespaceDelimited: boolean;
}

export interface Course {
  id: string; // e.g. "honduras-es"
  lang: LanguageCode;
  country: string; // "Honduras"
  title: string; // "Honduras → Spanish"
  /** Preferred TTS locale(s), most preferred first. GoListen records the actual fallback used. */
  preferredLocales: string[]; // e.g. ["es-HN", "es-419", "es-MX"]
  /** Preferred Bible version id for this course (a Text with kind 'scripture'). */
  bibleVersionId?: string;
}

export interface User {
  id: string;
  displayName: string;
  courseId: string;
  createdAt: string; // ISO
}

// ───────────────────────────── content / provenance ─────────────────────────────

export type RightsStatus =
  | 'public-domain'
  | 'licensed'
  | 'owner-authored' // written by the course authors
  | 'generated' // machine generated — must be displayed as such
  | 'user-private' // learner's own content (testimony, recordings)
  | 'personal-copy' // a published work the learner supplied from a copy he is entitled to use: stays on this device, never bundled, never redistributed
  | 'unverified'; // sample/test text whose rights have not been established — never ship

/** 'published' = a published work by a native author (a book), as opposed to course-written or generated text. */
export type Authorship = 'human' | 'public-domain' | 'licensed' | 'generated' | 'learner' | 'published';

/** Editorial review of a text or a voice. Only 'reviewed' / 'approved' content reaches normal learner use. */
export type ReviewStatus = 'unreviewed' | 'in-review' | 'reviewed' | 'approved' | 'rejected';
export const REVIEW_OK: readonly ReviewStatus[] = ['reviewed', 'approved'] as const;

/** How the exact wording of a scripture text was established. Absent ⇒ not verified ⇒ never published. */
export interface SourceVerification {
  /** e.g. "eBible.org spaRV1909" */
  against: string;
  url?: string;
  checkedAt: string; // ISO date
  method: 'byte-comparison' | 'human-proofread' | 'publisher-file';
  by: string;
}

export interface ContentSource {
  id: string;
  title: string;
  /** Learner-visible attribution line ("Reina-Valera 1909, public domain"). */
  attribution?: string;
  /** Honest statement of where the words came from and what has been checked. */
  provenance?: string;
  author?: string;
  publisher?: string;
  url?: string;
  edition?: string;
  rights: RightsStatus;
  licenseNote?: string;
  authorship: Authorship;
}

export interface TransformationRecord {
  at: string;
  tool: string; // e.g. "ingest@1", "adapter-th@1"
  description: string;
}

export type TextKind = 'story' | 'dialogue' | 'nonfiction' | 'scripture' | 'transcript' | 'testimony' | 'generated-prep';

export interface Corpus {
  id: string; // e.g. "ci-es" | "bible-es-rv1909"
  lang: LanguageCode;
  kind: 'comprehensible-input' | 'scripture' | 'testimony';
  title: string;
}

export interface Text {
  id: string; // see ids.textId
  corpusId: string;
  lang: LanguageCode;
  kind: TextKind;
  title: string;
  sourceId: string;
  /** Exact translation/version for scripture, e.g. "Reina-Valera 1909". */
  version?: string;
  importedAt: string;
  /** Static, editorial difficulty label. Personalised difficulty comes from GoLearn, not from here. */
  staticLevel?: 'A0' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'native';
  /** BCP-47 locale of the text when known (es-HN, de-DE…). */
  locale?: string;
  /** Learner-facing topics / pathways ("mission", "daily-life"). Never editorial state. */
  tags: string[];
  /** Editorial tags ("needs-native-review", "typed-from-memory"). Never shown as learner pathways. */
  editorialTags: string[];
  /** Preparation targets: scripture refs ("1JN.1.9") or text ids this text helps prepare. */
  prepTargets: string[];
  reviewStatus: ReviewStatus;
  /**
   * The publication gate, computed at import (see ingest `computePublished`): review ok AND rights established;
   * scripture additionally needs translation identity + a SourceVerification. Unpublished texts are visible only
   * in the explicitly marked preview mode and are never recommended in normal use.
   */
  published: boolean;
  /** Why a text is not published (actionable, shown in preview mode and by the validator). */
  unpublishedReasons: string[];
  /** Import schema version the text was ingested with. */
  schemaVersion: number;
  /** Generated texts must say so; the reader shows a badge. Never true for scripture. */
  generated: boolean;
  transformations: TransformationRecord[];
  /** Content version, bumped whenever any sentence text changes (audio cache keys include it). */
  contentVersion: number;
  /** For scripture: canonical book code (e.g. "JHN") + first chapter, translation identity and verification. */
  scripture?: { book: string; chapter: number; translationId?: string; edition?: string; verification?: SourceVerification };
  /** The curriculum Work this text belongs to (course.ts) and its place in it. One Text = one chapter / unit. */
  workId?: string;
  /** The learner's own copy of a published work (source.rights 'personal-copy'): readable on this device, labelled, never bundled. */
  personalCopy?: boolean;
  chapter?: { index: number; title?: string };
}

export interface TextSection {
  id: string;
  textId: string;
  index: number;
  title?: string;
  /** For scripture: the chapter number. */
  chapter?: number;
}

export interface Paragraph {
  id: string;
  textId: string;
  sectionId: string;
  index: number; // within text
  /** The exact original paragraph string as supplied (Unicode, punctuation and whitespace untouched). */
  originalText?: string;
}

export interface Sentence {
  /**
   * ids.sentence(textId, key). `key` is STABLE across content versions: the author-supplied sentence id, else a
   * hash of the exact text (+ "~n" for repeats). Editing a sentence therefore creates a new Sentence (new id) and
   * retires the old one; encounters and audio that point at the old id stay valid history.
   */
  id: string;
  key: string;
  textId: string;
  paragraphId: string;
  lang: LanguageCode;
  /** Order within the CURRENT content version (retired sentences keep their last index). */
  index: number;
  /** contentVersion in which this sentence first appeared / was retired (absent = live). */
  versionAdded: number;
  retiredInVersion?: number;
  /** Dialogue speaker label, when the source declares one. Not part of `text`. */
  speaker?: string;
  /** Offsets of this sentence inside Paragraph.originalText: originalText.slice(paraStart, paraEnd) === text. */
  paraStart?: number;
  paraEnd?: number;
  /** Canonical display text. NEVER modified by processing. */
  text: string;
  /** Derived, adapter-normalized processing text (NFC, casefold rules etc.). */
  normalizedText: string;
  /** Scripture: verse references this sentence belongs to, e.g. ["JHN.3.16"]. Not part of `text`. */
  verseRefs?: string[];
  /** Hash of `text` — part of every audio cache key. */
  textHash: string;
}

export interface Token {
  id: string; // ids.tokenId(sentenceId, index)
  sentenceId: string;
  textId: string;
  lang: LanguageCode;
  index: number;
  /** Exact surface slice of Sentence.text[start,end). */
  surface: string;
  start: number;
  end: number;
  /** Adapter-normalized form (e.g. lowercase NFC); identity of the Form item. */
  normalized: string;
  /** ids.formId(lang, normalized) — the form-level learner item. */
  formId: string;
  /** Word-like (counts as a lexical item) vs punctuation/space/number. */
  isWord: boolean;
}

export interface Lemma {
  id: string; // ids.lemmaId(lang, lemma, pos?)
  lang: LanguageCode;
  lemma: string;
  pos?: PartOfSpeech;
  gloss?: string; // concise English gloss
}

import type { RegisterTag, SyllableAnalysis } from './course';

export type PartOfSpeech =
  | 'NOUN' | 'PROPN' | 'VERB' | 'AUX' | 'ADJ' | 'ADV' | 'PRON' | 'DET' | 'ADP' | 'CONJ' | 'SCONJ'
  | 'PART' | 'NUM' | 'INTJ' | 'CLF' /* Thai classifier */ | 'PUNCT' | 'X';

export type AnalysisProvenance = 'machine' | 'lexicon' | 'human';

/**
 * One analysis of a token. Several may exist (alternatives, later human override).
 * Resolution rule (GoLearn.resolveAnalysis): human > lexicon > machine, then highest confidence.
 * Overrides never delete prior rows; they add a row with `supersedes`.
 */
export interface TokenAnalysis {
  id: string;
  tokenId: string;
  lang: LanguageCode;
  lemmaId?: string;
  pos?: PartOfSpeech;
  /** Universal-Dependencies-style feature map, e.g. {Case:"Dat", Gender:"Fem", Number:"Sing"}. */
  morph: Record<string, string>;
  /** Language-specific extras the adapter wants to surface (e.g. separable prefix, compound parts, tone). */
  notes?: Record<string, string | string[]>;
  /** Contextual meaning of this token here (distinct from the lemma's dictionary gloss). */
  gloss?: string;
  /** Script decoding, syllable by syllable (Thai: consonant class, vowel length, ending, tone). */
  syllables?: SyllableAnalysis[];
  /** Variety / register when it is not ordinary standard usage. Absent = no claim. */
  register?: RegisterTag[];
  /** What the word is doing, when that matters more than a gloss: 'classifier', 'particle', 'discourse-marker', 'aspect', 'serial-verb', 'pronoun', 'negator', 'question'. */
  role?: string;
  /** An easy definition in the target language itself, when one is available. */
  definition?: string;
  confidence: number; // 0..1 — uncertainty is stored, never hidden
  provenance: AnalysisProvenance;
  analyzer: string; // "adapter-de@1", "human:cj"
  createdAt: string;
  supersedes?: string; // id of the analysis this overrides
  /** Alternative readings the analyzer considered (kept so the UI can say "possibly …"). */
  alternatives?: Array<{ lemmaId?: string; pos?: PartOfSpeech; morph: Record<string, string>; confidence: number }>;
}

/** A multi-token unit worth tracking: collocation, formula, idiom, argument frame. */
export interface Phrase {
  id: string; // ids.phraseId(lang, normalizedTokens)
  lang: LanguageCode;
  /** Normalized token sequence; "_" = slot (e.g. ["creer","en","_"]). */
  pattern: string[];
  display: string; // e.g. "creer en …"
  gloss?: string;
  kind: 'collocation' | 'formula' | 'idiom' | 'frame' | 'construction';
}

export interface PhraseOccurrence {
  id: string;
  phraseId: string;
  sentenceId: string;
  textId: string;
  lang: LanguageCode;
  tokenIds: string[];
  confidence: number;
  provenance: AnalysisProvenance;
}

/** A grammatical construction / syntactic frame (e.g. "past narration", "dative experiencer"). */
export interface GrammarPattern {
  id: string; // ids.patternId(lang, key)
  lang: LanguageCode;
  key: string; // "preterite" | "sep-prefix-verb" | …
  title: string;
  explanation: string; // short learner-facing explanation
}

export interface PatternOccurrence {
  id: string;
  patternId: string;
  sentenceId: string;
  textId: string;
  lang: LanguageCode;
  tokenIds: string[];
  confidence: number;
  provenance: AnalysisProvenance;
}

/** English rescue at sentence granularity. The reader may aggregate by verse or paragraph. */
export interface EnglishRescue {
  id: string; // ids.rescueId(sentenceId)
  sentenceId: string;
  textId: string;
  english: string;
  /** Where the English came from: a published translation, an author, or a machine. */
  provenance: AnalysisProvenance;
  sourceNote?: string; // e.g. "WEB (public domain)"
}

// ───────────────────────────── learner state (GoLearn owns) ─────────────────────────────

/**
 * 'orth' = an element of the writing system the learner has to learn to decode (a consonant class, a vowel
 * form, a tone mark, a spelling pattern). It has its own encounter history like any other item.
 */
export type ItemKind = 'form' | 'lemma' | 'phrase' | 'pattern' | 'orth';
export type Modality = 'reading' | 'listening' | 'writing' | 'speaking';

/** Ordered evidence levels. Not all are user-visible. */
export type LearnerLevel =
  | 'unseen'
  | 'encountered'
  | 'recognized_with_help'
  | 'recognized'
  | 'rapid'
  | 'recalled'
  | 'used_with_assistance'
  | 'used_independently'
  | 'automatic';

export const LEVEL_ORDER: readonly LearnerLevel[] = [
  'unseen', 'encountered', 'recognized_with_help', 'recognized', 'rapid', 'recalled',
  'used_with_assistance', 'used_independently', 'automatic',
] as const;

/**
 * Evidence in one modality. Confidence is a belief, not a grade.
 * EXPOSURE IS NOT COMPREHENSION: seeing or hearing an item only increments `exposures` (level ≤ 'encountered').
 * `evidence` accumulates DEMONSTRATED comprehension / production only (self-reported understanding without
 * help, an explicit mark, production) — discounted by the assistance used.
 */
export interface DimensionState {
  level: LearnerLevel;
  confidence: number; // 0..1
  /** Demonstrated-evidence weight (assistance-discounted). Exposure contributes nothing here. */
  evidence: number;
  /** Count of plain exposures (sentence on screen / real speech played) with no demonstration. */
  exposures: number;
  /** Cautious estimate from repeated unassisted exposure: "probably familiar". Never treated as known. */
  estimatedFamiliar: boolean;
  unassisted: number; // count of unassisted encounters/productions
  assisted: number; // count of assisted ones
  lastEvidenceAt?: string;
}

export interface LearnerItemState {
  id: string; // ids.learnerItemId(userId, itemId)
  userId: string;
  lang: LanguageCode;
  itemId: string; // formId | lemmaId | phraseId | patternId
  itemKind: ItemKind;
  reading: DimensionState;
  listening: DimensionState;
  writing: DimensionState;
  speaking: DimensionState;
  encounterCount: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
  /** Explicit learner mark, kept separately from evidence. */
  manualMark?: 'known' | 'unknown';
  /** Distinct textIds where encountered (provenance for GoTell: "seen in Story 12, John 3"). */
  textIds: string[];
}

/**
 * One meaningful encounter of an item in one sentence context (derived by GoLearn from events).
 * A rerender never creates a second encounter: (userId, itemId, sentenceId, modality, session) dedupes.
 */
export interface Encounter {
  id: string;
  userId: string;
  lang: LanguageCode;
  itemId: string;
  itemKind: ItemKind;
  sentenceId: string;
  textId: string;
  surface: 'corpus' | 'scripture' | 'testimony' | 'listen';
  modality: Modality;
  at: string;
  /**
   * What this encounter is evidence OF:
   *  exposure     – the item was on screen / played in real speech; nothing demonstrated
   *  assisted     – the learner needed help with it (help level in `assistance`)
   *  demonstrated – comprehension shown (self-report without help, explicit mark)
   *  production   – the learner wrote / said it (see productionKind)
   */
  evidenceKind: EvidenceKind;
  /** Highest assistance used in this encounter (0 none … 5 english rescue). */
  assistance: AssistanceLevel;
  priorLevel: LearnerLevel;
  /** Evidence weight this encounter contributed. */
  weight: number;
  playbackSpeed?: number; // listening only
  /** Reading/listening sitting this encounter belongs to (estimates need distinct sessions). */
  session?: string;
  /**
   * Sitting key derived by GoLearn from time, not trusted from the UI: encounters of one learner less than
   * SITTING_GAP_MS apart belong to one sitting. A reload or a route revisit inside a sitting can therefore never
   * add a second exposure for the same item + sentence, whatever session id the UI sent.
   */
  sitting?: string;
  /** Content version of the text when the encounter happened (history stays attached to what was actually read). */
  contentVersion?: number;
  /** Listening only: replays within the pass. */
  replays?: number;
  /** Production encounters only: how the production came about. */
  productionKind?: ProductionKind;
}

export type EvidenceKind = 'exposure' | 'assisted' | 'demonstrated' | 'production';

/** Two encounters of one learner closer than this belong to the same sitting (30 minutes). */
export const SITTING_GAP_MS = 30 * 60 * 1000;

/** The layered support ladder. Higher = more help = weaker evidence of comprehension. */
export type AssistanceLevel = 0 | 1 | 2 | 3 | 4 | 5;
export const ASSISTANCE: Record<string, AssistanceLevel> = {
  none: 0,
  gloss: 1, // tap word → concise gloss
  phrase: 2, // phrase meaning
  morphology: 3, // lemma / morphology / grammar pattern
  sentenceExplanation: 4,
  englishRescue: 5,
};

// ───────────────────────────── audio (GoListen owns) ─────────────────────────────

export type AudioSourceType = 'generated-tts' | 'human-recording' | 'licensed-recording' | 'user-recording';

export interface VoiceConfig {
  id: string; // e.g. "es-HN:fixture:default"
  lang: LanguageCode;
  courseId?: string;
  providerId: string;
  engine?: string;
  voiceId: string;
  requestedLocale: string;
  /** Actual locale delivered. If ≠ requestedLocale the UI says "fallback accent". */
  actualLocale: string;
  approved: boolean;
  qaNote?: string;
  /** Human audition status of this voice. Unreviewed voices are preview-only and earn no listening evidence. */
  reviewStatus: ReviewStatus;
  providerVersion?: string;
  /** False for fixtures / tones / any non-speech provider. */
  isSpeech: boolean;
}

export interface AudioAsset {
  id: string; // content hash of the bytes ("sha256:…")
  sourceType: AudioSourceType;
  lang: LanguageCode;
  locale: string;
  mime: string; // "audio/wav" | "audio/mpeg" | "audio/ogg"
  sampleRate: number;
  channels: number;
  durationMs: number;
  bytes: number;
  checksum: string; // same as id for content-addressed assets
  createdAt: string;
  /** False for fixture tones or any non-speech audio: such assets can never produce learner evidence. */
  isSpeech: boolean;
  generation?: {
    providerId: string;
    engine?: string;
    voiceId: string;
    settings: Record<string, string | number | boolean>;
    sourceTextHash: string;
    speechTextHash: string;
    normalizerVersion: string;
    pronunciationLexiconVersion: string;
    softwareVersion: string;
  };
  validation?: AudioValidation;
}

export interface AudioValidation {
  ok: boolean;
  problems: string[];
  peak?: number; // 0..1
  rms?: number;
  leadingSilenceMs?: number;
  trailingSilenceMs?: number;
  silenceRatio?: number;
  clipped?: boolean;
}

/** One synthesized unit — normally one sentence. */
export interface AudioSegment {
  id: string; // ids.audioSegmentId(cacheKey)
  cacheKey: string;
  lang: LanguageCode;
  sentenceIds: string[];
  textId: string;
  displayText: string;
  speechText: string;
  speechNormalization: TransformationRecord[];
  pronunciationOverridesUsed: string[]; // PronunciationEntry ids
  voiceConfigId: string;
  assetId?: string; // absent until a valid asset exists → never "ready" without one
  status: 'pending' | 'ready' | 'failed';
  sequence: number;
  contentVersion: number;
}

export type AlignmentMethod = 'by-construction' | 'provider-marks' | 'forced-aligner' | 'manual';

export interface AudioAlignment {
  id: string;
  segmentId: string;
  assetId: string;
  unit: 'sentence' | 'phrase' | 'word';
  /** sentenceId | phraseOccurrenceId | tokenId */
  unitId: string;
  startMs: number;
  endMs: number;
  method: AlignmentMethod;
  confidence: number;
  alignerVersion: string;
}

export interface AudioManifest {
  id: string; // ids.manifestId(textId, voiceConfigId, contentVersion)
  textId: string;
  lang: LanguageCode;
  voiceConfigId: string;
  contentVersion: number;
  /** Ordered segment ids; a player prefetches ahead through this list. */
  segmentIds: string[];
  /** All segments ready? */
  complete: boolean;
  createdAt: string;
  updatedAt: string;
}

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'dead';

export interface AudioJob {
  id: string; // = cacheKey (idempotent)
  segmentId: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt?: string;
  lastError?: string;
  log: Array<{ at: string; message: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface PronunciationEntry {
  id: string;
  lang: LanguageCode;
  providerId?: string; // null = all providers
  voiceId?: string;
  /** Exact display-text match (case-sensitive for names). */
  match: string;
  mechanism: 'ssml-phoneme' | 'substitution' | 'lang-tag' | 'lexicon';
  value: string; // IPA, substitution string, or lang tag
  provenance: AnalysisProvenance;
  reviewed: boolean;
  note?: string;
  lexiconVersion: string;
}

export interface UserRecording {
  id: string;
  userId: string;
  lang: LanguageCode;
  /** What was being rehearsed. */
  target: { sentenceId?: string; testimonyRevisionId?: string; testimonySentenceIndex?: number; text: string };
  assetId: string;
  attempt: number;
  createdAt: string;
}

// ───────────────────────────── production (GoTell owns) ─────────────────────────────

export interface Testimony {
  id: string;
  userId: string;
  lang: LanguageCode;
  title: string;
  createdAt: string;
  currentRevisionId?: string;
}

export type SemanticSection =
  | 'background' | 'childhood' | 'knowledge-of-christianity' | 'understanding-of-sin' | 'conviction'
  | 'repentance' | 'faith' | 'forgiveness' | 'grace' | 'transformation' | 'present-faith' | 'why-sharing';

export interface TestimonySentence {
  index: number;
  text: string; // learner's accepted target-language text
  textHash: string;
  /** Optional semantic tag (metadata, never a form field). */
  section?: SemanticSection;
  sectionConfidence?: number;
}

/** Every accepted state of the testimony. Never overwritten. */
export interface TestimonyRevision {
  id: string;
  testimonyId: string;
  userId: string;
  lang: LanguageCode;
  number: number;
  createdAt: string;
  fullText: string;
  sentences: TestimonySentence[];
  /** The private Text (kind "testimony", corpus kind "testimony") that holds this revision's sentences/tokens, so GoLearn and GoListen address it like any other text. */
  textId?: string;
  /** Suggestion ids accepted in producing this revision. */
  acceptedSuggestionIds: string[];
  parentRevisionId?: string;
}

export type SuggestionKind = 'repair' | 'recombination' | 'expansion';

/** A private, autosaved working draft. Separate from saved versions (TestimonyRevision); never evidence. */
export interface TestimonyDraft {
  id: string; // ids.draft(userId, lang)
  userId: string;
  lang: LanguageCode;
  text: string;
  updatedAt: string;
  /** Monotonic save counter (a stale tab cannot overwrite a newer draft). */
  seq: number;
  /** The saved version this draft started from, if any. */
  basedOnRevisionId?: string;
}

/** Small key/value rows: policy versions, migrations run, settings that must travel with a backup. */
export interface MetaRow { id: string; value: string; updatedAt: string }

export type ErrorCategory =
  | 'spelling' | 'morphology' | 'conjugation' | 'agreement' | 'case' | 'syntax' | 'word-order'
  | 'lexical-choice' | 'missing-function-word' | 'collocation' | 'ambiguity' | 'clarity' | 'register'
  | 'meaning-change' | 'segmentation' | 'particle' | 'classifier' | 'postposition' | 'definiteness';

export interface ProvenanceRef {
  itemId: string;
  itemKind: ItemKind;
  encounterCount: number;
  textIds: string[];
  readingLevel: LearnerLevel;
  listeningLevel: LearnerLevel;
  writingLevel: LearnerLevel;
}

export interface GoTellSuggestion {
  id: string;
  userId: string;
  lang: LanguageCode;
  testimonyId: string;
  draftHash: string; // hash of the submitted draft this responds to
  sentenceIndex: number;
  kind: SuggestionKind;
  original: string;
  suggested: string;
  explanation: string;
  categories: ErrorCategory[];
  /** Priority 1 = affects meaning … 4 = recurrent pattern. */
  priority: 1 | 2 | 3 | 4;
  /** Which items in `suggested` are already within the learner's language, with why. */
  familiar: ProvenanceRef[];
  /** Items the learner has NOT acquired; non-empty ⇒ kind should be 'expansion'. */
  newItems: Array<{ itemId: string; itemKind: ItemKind; gloss?: string }>;
  /** Set when the correction alters meaning or theological nuance — surfaced, never silent. */
  meaningChange?: string;
  /**
   * Honest scope. 'fixes-all-detected' = every issue the checker found in this sentence is fixed by `suggested`;
   * 'partial' = other detected issues remain (listed in remainingIssues). Neither ever means "the sentence is
   * now correct": `checkerCoverage` says what the checker can and cannot verify for this language.
   */
  scope: 'fixes-all-detected' | 'partial';
  remainingIssues: string[];
  checkerCoverage: string;
  /** Where the suggested language actually came from in the learner's history. */
  sources: SuggestionSource[];
  /** Final text when the learner edited the suggestion before using it. */
  finalText?: string;
  status: 'shown' | 'accepted' | 'rejected' | 'edited';
  createdAt: string;
}

export interface SuggestionSource {
  itemId: string;
  textId: string;
  textTitle: string;
  sentenceId: string;
  /** The exact sentence where the learner met it. */
  excerpt: string;
  surface: 'corpus' | 'scripture' | 'testimony' | 'listen';
}

export type ProductionKind = 'independent' | 'self-repaired' | 'assisted' | 'copied';

// ───────────────────────────── engines' shared read models ─────────────────────────────

export interface ItemKnowledge {
  itemId: string;
  itemKind: ItemKind;
  exists: boolean;
  encounterCount: number;
  textIds: string[];
  lastSeenAt?: string;
  reading: DimensionState;
  listening: DimensionState;
  writing: DimensionState;
  speaking: DimensionState;
  /** Encountered in exactly this surface form (for forms) / this exact phrase. */
  exactFormSeen: boolean;
  /** Some related item (same lemma, other form) has been seen. */
  relatedSeen: boolean;
  /** Counts by evidence kind (reading + listening), for explanations: "seen 7 times, needed help twice". */
  exposureCount: number;
  assistedCount: number;
  demonstratedCount: number;
  productionEvidence: { independent: number; selfRepaired: number; assisted: number; copied: number };
}

export type ComfortBand = 'comfortable' | 'productive-challenge' | 'difficult' | 'stretch';

export interface PersonalizedCoverage {
  userId: string;
  textId: string;
  sentenceIds: string[];
  wordTokens: number;
  /** DEMONSTRATED: fraction of word tokens whose form or lemma is ≥ recognized (shown comprehension). */
  knownLexicalCoverage: number;
  /** ESTIMATE: met repeatedly without help but never demonstrated. Reported separately, labelled as an estimate. */
  estimatedFamiliarCoverage: number;
  /** Met at least once (exposure or with help) but neither demonstrated nor estimated familiar. */
  partialCoverage: number;
  unseenCoverage: number;
  /** One plain sentence saying what the numbers are based on. */
  explanation: string;
  /** Time of the latest evidence event these numbers include (same evidence ⇒ same numbers, always). */
  asOf?: string;
  newItems: Array<{ itemId: string; itemKind: ItemKind; surface: string; count: number }>;
  knownPhraseCoverage: number; // fraction of phrase occurrences known
  unfamiliarPatterns: string[]; // patternIds
  avgSentenceLength: number;
  listeningCoverage?: number;
  band: ComfortBand;
  expectedDifficulty: number; // 0..1
}
