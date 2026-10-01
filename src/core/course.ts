/**
 * Curriculum model: Course → Stage → Work → Chapter (a Text) → Paragraph → Sentence → Phrase → Token.
 *
 * A course ladder is a set of reading STAGES (internal bands, not school years) and the WORKS recommended at each.
 * A Work is a curriculum entry with honest rights metadata; it only becomes readable when texts for it are
 * imported (each imported chapter is a `Text` with `workId` + `chapter`). Listing a work here never implies the
 * application may distribute it.
 */
import type { LanguageCode, ReviewStatus } from './model';

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
  | 'course-authored' // written for the course by its authors (machine-drafted text says so separately and still needs review)
  | 'recommended-only' // listed for the learner to find; the app holds no text
  | 'user-supplied' // the learner's own lawful copy, on this device only
  | 'rights-unverified'
  | 'prohibited-from-bundling';

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
  | 'regional-isan' | 'regional-north' | 'regional-south' | 'teochew' | 'child-directed' | 'slang';

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
  ending: 'open' | 'live' | 'dead';
  toneMark?: string;
  tone?: 'mid' | 'low' | 'falling' | 'high' | 'rising';
  /** Which rule produced the tone, in plain words ("mid-class consonant + mai tho → falling"). */
  rule?: string;
  ipa?: string;
  /** Emergency rescue only (see AssistanceProfile.romanization). */
  romanization?: string;
  irregular?: boolean; // sound and spelling part ways (exception list or dictionary pronunciation)
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
