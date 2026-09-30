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
  | 'unverified'; // sample/test text whose rights have not been established — never ship

export type Authorship = 'human' | 'public-domain' | 'licensed' | 'generated' | 'learner';

export interface ContentSource {
  id: string;
  title: string;
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
  /** Free tags: "mission", "daily-life", "prep:john-3", … Reading pathways are tag queries. */
  tags: string[];
  /** Generated texts must say so; the reader shows a badge. Never true for scripture. */
  generated: boolean;
  transformations: TransformationRecord[];
  /** Content version, bumped whenever any sentence text changes (audio cache keys include it). */
  contentVersion: number;
  /** For scripture: canonical book code (e.g. "JHN") + chapter range. */
  scripture?: { book: string; chapter: number };
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
}

export interface Sentence {
  id: string; // ids.sentenceId(textId, index)
  textId: string;
  paragraphId: string;
  lang: LanguageCode;
  index: number; // global order within the text
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

export type ItemKind = 'form' | 'lemma' | 'phrase' | 'pattern';
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

/** Evidence in one modality. Confidence is a belief, not a grade. */
export interface DimensionState {
  level: LearnerLevel;
  confidence: number; // 0..1
  /** Accumulated evidence weight (assistance-discounted). */
  evidence: number;
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
  /** Highest assistance used in this encounter (0 none … 5 english rescue). */
  assistance: AssistanceLevel;
  priorLevel: LearnerLevel;
  /** Evidence weight this encounter contributed. */
  weight: number;
  playbackSpeed?: number; // listening only
  /** Production encounters only: how the production came about. */
  productionKind?: ProductionKind;
}

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
  status: 'shown' | 'accepted' | 'rejected' | 'edited';
  createdAt: string;
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
  productionEvidence: { independent: number; selfRepaired: number; assisted: number; copied: number };
}

export type ComfortBand = 'comfortable' | 'productive-challenge' | 'difficult' | 'stretch';

export interface PersonalizedCoverage {
  userId: string;
  textId: string;
  sentenceIds: string[];
  wordTokens: number;
  knownLexicalCoverage: number; // 0..1 of word tokens whose form or lemma is ≥ recognized
  partialCoverage: number; // encountered but < recognized
  unseenCoverage: number;
  newItems: Array<{ itemId: string; itemKind: ItemKind; surface: string; count: number }>;
  knownPhraseCoverage: number; // fraction of phrase occurrences known
  unfamiliarPatterns: string[]; // patternIds
  avgSentenceLength: number;
  listeningCoverage?: number;
  band: ComfortBand;
  expectedDifficulty: number; // 0..1
}
