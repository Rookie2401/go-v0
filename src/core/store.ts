/**
 * AppStore — the one persistence contract. Implementations: MemoryStore (tests, probes) and
 * DexieStore (browser). Engines never touch IndexedDB directly.
 */
import type {
  AudioAlignment, AudioAsset, AudioJob, AudioManifest, AudioSegment, ContentSource, Corpus, Course,
  Encounter, EnglishRescue, GoTellSuggestion, GrammarPattern, Language, LearnerItemState, Lemma, Paragraph,
  MetaRow, PatternOccurrence, Phrase, PhraseOccurrence, PronunciationEntry, Sentence, Testimony, TestimonyDraft, TestimonyRevision, Text,
  TextSection, Token, TokenAnalysis, User, UserRecording, VoiceConfig,
} from './model';
import type { DomainEvent } from './events';
import type { ContentNote, Stage, Work } from './course';
import type { CatalogText } from './contracts/library';

export interface Table<T extends { id: string }> {
  get(id: string): Promise<T | undefined>;
  getMany(ids: string[]): Promise<(T | undefined)[]>;
  put(row: T): Promise<void>;
  bulkPut(rows: T[]): Promise<void>;
  delete(id: string): Promise<void>;
  all(): Promise<T[]>;
  /** Equality filter on one indexed field. Implementations index the fields listed in INDEXES. */
  where<K extends keyof T & string>(field: K, value: T[K]): Promise<T[]>;
  count(): Promise<number>;
}

export interface AppStore {
  users: Table<User>;
  languages: Table<Language>;
  courses: Table<Course>;
  sources: Table<ContentSource>;
  corpora: Table<Corpus>;
  texts: Table<Text>;
  sections: Table<TextSection>;
  paragraphs: Table<Paragraph>;
  sentences: Table<Sentence>;
  tokens: Table<Token>;
  lemmas: Table<Lemma>;
  analyses: Table<TokenAnalysis>;
  phrases: Table<Phrase>;
  phraseOccurrences: Table<PhraseOccurrence>;
  patterns: Table<GrammarPattern>;
  patternOccurrences: Table<PatternOccurrence>;
  rescues: Table<EnglishRescue>;
  events: Table<DomainEvent>;
  encounters: Table<Encounter>;
  learnerItems: Table<LearnerItemState>;
  voices: Table<VoiceConfig>;
  audioAssets: Table<AudioAsset>;
  audioSegments: Table<AudioSegment>;
  alignments: Table<AudioAlignment>;
  manifests: Table<AudioManifest>;
  audioJobs: Table<AudioJob>;
  pronunciations: Table<PronunciationEntry>;
  recordings: Table<UserRecording>;
  testimonies: Table<Testimony>;
  revisions: Table<TestimonyRevision>;
  suggestions: Table<GoTellSuggestion>;
  /** Autosaved testimony drafts, one per learner + language. */
  drafts: Table<TestimonyDraft>;
  /** Policy versions, migrations, flags. */
  meta: Table<MetaRow>;
  /** Curriculum: reading stages of a course and the works recommended at each (course.ts). */
  stages: Table<Stage>;
  works: Table<Work>;
  /** Cultural / regional / register / literary / clause-structure notes attached to texts. */
  notes: Table<ContentNote>;
  /** The library index: one small row per catalogued text (bundled, built library, personal). Paged, never listed whole. */
  catalog: Table<CatalogText>;
  /** Run `fn` atomically where the backend supports it (Dexie rw transaction); MemoryStore just runs it. */
  transaction<R>(tables: (keyof AppStore)[], fn: () => Promise<R>): Promise<R>;
  /** Binary asset storage (audio bytes), content-addressed. Not a database blob column in spirit: a separate object store. */
  assets: AssetStore;
}

export interface AssetStore {
  /** Stores bytes; returns "sha256:<hex>" (or the store's content id). Idempotent. */
  put(bytes: Uint8Array, mime: string): Promise<string>;
  get(id: string): Promise<{ bytes: Uint8Array; mime: string } | undefined>;
  has(id: string): Promise<boolean>;
  /** A URL a browser <audio> can play (object URL / data URL); memory impl may return a data: URL. */
  url(id: string): Promise<string | undefined>;
}

/** Fields each table indexes for `where`. Dexie schema strings are generated from this. */
export const INDEXES: Record<keyof Omit<AppStore, 'transaction' | 'assets'>, string[]> = {
  users: ['courseId'],
  languages: [],
  courses: ['lang'],
  sources: ['rights'],
  corpora: ['lang', 'kind'],
  texts: ['corpusId', 'lang', 'kind', 'sourceId', 'reviewStatus', 'workId'],
  sections: ['textId'],
  paragraphs: ['textId', 'sectionId'],
  sentences: ['textId', 'paragraphId', 'lang', 'textHash', 'key'],
  tokens: ['sentenceId', 'textId', 'formId', 'normalized'],
  lemmas: ['lang', 'lemma'],
  analyses: ['tokenId', 'lemmaId', 'provenance'],
  phrases: ['lang'],
  phraseOccurrences: ['phraseId', 'sentenceId', 'textId'],
  patterns: ['lang', 'key'],
  patternOccurrences: ['patternId', 'sentenceId', 'textId'],
  rescues: ['sentenceId', 'textId'],
  events: ['userId', 'type', 'dedupeKey', 'session'],
  encounters: ['userId', 'itemId', 'sentenceId', 'textId'],
  learnerItems: ['userId', 'itemId', 'lang', 'itemKind'],
  voices: ['lang', 'courseId', 'providerId'],
  audioAssets: ['sourceType', 'lang'],
  audioSegments: ['textId', 'cacheKey', 'voiceConfigId', 'status', 'assetId'],
  alignments: ['segmentId', 'unitId', 'assetId'],
  manifests: ['textId', 'voiceConfigId'],
  audioJobs: ['segmentId', 'status'],
  pronunciations: ['lang', 'match'],
  recordings: ['userId', 'assetId'],
  testimonies: ['userId', 'lang'],
  revisions: ['testimonyId', 'userId'],
  suggestions: ['testimonyId', 'userId', 'draftHash', 'status'],
  drafts: ['userId', 'lang'],
  meta: [],
  stages: ['courseId', 'lang'],
  works: ['courseId', 'stageId', 'lang', 'role'],
  notes: ['textId', 'sentenceId', 'kind'],
  catalog: ['lang', 'stream', 'workId', 'location', 'stageId'],
};
