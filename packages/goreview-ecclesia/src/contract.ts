/**
 * GoReview Ecclesia — the PUBLIC CONTRACT. Everything the Ecclesia theological library's own code (the reader, its agent, its
 * UI) talks to lives in this file; the other modules implement it. Nothing here is a user interface: Ecclesia designs that.
 *
 * What this subsystem is: the review half of GoReview (FSRS scheduling, the deck fold, intake, the planner, the session runner)
 * specialised for four classical languages — Biblical Hebrew, Biblical Aramaic, Koine Greek and Latin — read in a Scripture
 * reader. It adds, on top of the shared engine and WITHOUT duplicating any of it:
 *   - language profiles (./languages) and a lexical identity model (./identity): stable, language-aware unit ids;
 *   - a typed reading-encounter interface (./encounters) that turns what the reader observed into Repository events,
 *     idempotently (the same encounter id always yields the same events, which the event log stores once);
 *   - contextual flashcards with Scripture references and deterministic card identities (./cards);
 *   - a knowledge profile on the six levels, read beside the FSRS schedule and never confused with it (./profile);
 *   - session composition rules for a reading→review→reading cycle (./session);
 *   - a provisional Next Best Passage familiarity estimate (./familiarity) over corpus-frequency contracts (./frequency).
 *
 * Text never enters the event log: a reference identifies a passage, the reader shows the words from its own corpus.
 */
import type { AnalysisStatus, GoEvent, KnowledgeLevel, LinguisticUnit, SourceRef, SourceRestrictions } from '../../repository-contract/src';
import type { AssessmentDimension, DeckItem, ExerciseFamily, ReviewPreferences, ScheduleState, SessionPlan, UnitFacts } from '../../goreview/src/types';

// ───────────────────────────── languages ─────────────────────────────

export const ECCLESIA_LANGUAGES = ['he', 'arc', 'grc', 'la'] as const;
/**
 * Ecclesia's own language codes: Hebrew, Biblical Aramaic, Greek, Latin. Hebrew and Greek are each ONE language read in several
 * PERIODS (Biblical, Mishnaic, Medieval, Modern Hebrew; Homeric, Attic, Koine, Medieval, Modern Greek): see `EcclesiaPeriod`
 * and ./periods. `grc` names Greek of every period here (the Repository files all of them under `el`).
 */
export type EcclesiaLanguageId = (typeof ECCLESIA_LANGUAGES)[number];

/** Universal-Dependencies parts of speech, the vocabulary every unit id and every analysis uses. */
export const UD_POS = ['ADJ', 'ADP', 'ADV', 'AUX', 'CCONJ', 'DET', 'INTJ', 'NOUN', 'NUM', 'PART', 'PRON', 'PROPN', 'SCONJ', 'VERB', 'X'] as const;
export type UdPos = (typeof UD_POS)[number];

export interface EcclesiaLanguageProfile {
  id: EcclesiaLanguageId;
  label: string;
  script: 'Hebr' | 'Grek' | 'Latn';
  direction: 'rtl' | 'ltr';
  /**
   * How this language is filed in the shared Repository (the learner's enrolment): the language id that every unit id and
   * every event carries, and the variety (a PERIOD for Hebrew and Greek) the reader declares. Koine Greek is the Greek
   * adapter's period `el-koi` of the one language `el`, so a word met in Ecclesia and a word met in the Biblia reader are the
   * same unit. Biblical Aramaic is its own language `arc` here (its lexemes are not Hebrew lexemes), while the GoLearn Hebrew
   * adapter files it as the heritage variety `arc-bib` of `he`; see docs/ecosystem/GOREVIEW-ECCLESIA-ARCHITECTURE.md §3.
   */
  repository: { languageId: string; varietyId?: string; packId: string; packVersion: string };
  /** The edition the reader shows, as `ScriptureSourceRef.translationId` (letters, digits, `. _ + -`, at most 60). */
  textId: string;
  /** What the text and the analysis rest on, stated so a card can say where its facts come from. */
  corpus: { label: string; licence: string; restrictions: Partial<SourceRestrictions> };
  analysis: { label: string; licence: string; status: AnalysisStatus; analyzerId: string };
  /** Per-language defaults for the familiarity heuristic (./familiarity); a reader may override them per learner. */
  familiarity: FamiliarityPolicy;
  /** Session composition defaults (./session). */
  review: Pick<ReviewPreferences, 'grammarShare' | 'cardsPerDeck' | 'sessionMinutes' | 'maxNew' | 'desiredRetention'>;
}

// ───────────────────────────── periods ─────────────────────────────

/** What the GoLearn adapter itself holds for a period: an analysed corpus, dictionary tables, or only the labels a dictionary prints. */
export type PeriodAnalysis = 'corpus' | 'tables' | 'labels-only';

/**
 * A historical stage of a language that a text is written in and a learner may target. The `id` is the Repository variety id
 * the GoLearn adapters already use (`he-bib`, `el-att`…), so a period is never a second language: unit ids are period-free
 * (`lemma:el:λόγος:NOUN` is one lexeme from Homer to today) and the period travels on each EVENT (`varietyId`) as the period
 * of the text that was read, and on the lexicon's senses as where a meaning is attested.
 */
export interface EcclesiaPeriod {
  id: string;
  language: EcclesiaLanguageId;
  label: string;
  /** Other names a reader or a catalogue may use ("Classical Hebrew", "Byzantine Greek", "Rabbinic Hebrew"). */
  aliases: string[];
  /** Historical order within the language, 1 = earliest. */
  order: number;
  /** Approximate years (negative = BC; `to: null` = still written). A convention for ordering and labelling, not a claim about any text. */
  era: { from: number; to: number | null };
  /** How texts of the period are normally written, which decides what a FORM id looks like (./identity). */
  orthography: 'pointed-cantillated' | 'pointed' | 'unpointed' | 'polytonic' | 'monotonic';
  /** What the shared GoLearn adapter has for the period; the reader's own analysis may be better and says so per token. */
  goLearnAnalysis: PeriodAnalysis;
  /** The trust a token's analysis gets when the reader states none: corpus-backed periods `high-confidence`, the rest `provisional`. */
  defaultStatus: AnalysisStatus;
  /** Kinds of text a theological library holds in the period (examples only). */
  exampleTexts: string[];
  note: string;
}

// ───────────────────────────── passages and tokens ─────────────────────────────

interface PassageSpan { chapter: number; verse: number; verseEnd?: number }
/** A Scripture passage by coordinates: a USFM book code, a chapter, a verse or a verse range. Never any text. */
export interface ScripturePassageRef extends PassageSpan { book: string; work?: undefined }
/**
 * A passage of any other work (Plato, the Mishnah, Rashi, a Father): the reader's stable id for the work and two whole numbers
 * of its own citation scheme (book and line, page and section, chapter and sentence: 1..100000 each). The display citation
 * ("514a", "Berakhot 1:1") stays with the reader. Never any text.
 */
export interface WorkPassageRef extends PassageSpan { work: string; title?: string; book?: undefined }
export type PassageRef = ScripturePassageRef | WorkPassageRef;

/**
 * One word token as the reader's corpus analyses it. `surface` is the word as printed (a short string: the text guard refuses
 * anything of more than four words); `lemma` and `pos` are the lexical identity; `features` the morphology as UD-style
 * `key: value` pairs (`Case: Nom`, `Number: Sing`…). `index` is the token's position in its verse, 0-based.
 */
export interface EcclesiaToken {
  index: number;
  surface: string;
  lemma: string;
  pos: UdPos;
  features?: Record<string, string>;
  /** The analysis's own status for this token, when it differs from the profile's (an unresolved reading: `provisional`). */
  status?: AnalysisStatus;
}

export interface PassageVerse { verse: number; tokens: EcclesiaToken[] }

/** A passage with its tokens, verse by verse; the input of the familiarity estimate and of a bulk `passage-viewed` encounter. */
export interface PassageTokens { language: EcclesiaLanguageId; ref: PassageRef; verses: PassageVerse[] }

// ───────────────────────────── lexical identity ─────────────────────────────

/** The Repository ids of one token: its lexeme (lemma + part of speech), its surface form and, when it has features, its morphological construction. */
export interface TokenUnitIds { lexeme: string; form: string; morph?: string }

// ───────────────────────────── reading encounters ─────────────────────────────

/** Who is reading: the Repository identity of the learner's enrolment in this language and the device the reader runs on. */
export interface ReaderIdentity { learnerId: string; enrolmentId: string; deviceId: string }

interface EncounterBase {
  /**
   * The reader's own id for this observation (a UUID, or `<readingSession>:<n>`), 1..120 characters. It is the idempotency
   * key: the same encounter id with the same content always produces the same event ids, so a retried or re-synced
   * encounter is stored once. A reused id with DIFFERENT content is an error the reader must not make.
   */
  encounterId: string;
  /** ISO 8601 instant of the observation. */
  at: string;
  passage: PassageRef;
}

/** The reader displayed a passage: every token of it was seen (an exposure, nothing more). One event per verse. */
export interface PassageViewed extends EncounterBase { kind: 'passage-viewed'; verses: PassageVerse[] }
/** The learner selected a word (tapped it, hovered it, asked for its card). */
export interface WordSelected extends EncounterBase { kind: 'word-selected'; verse: number; token: EcclesiaToken }
/** The reader showed the word's gloss or definition after a selection. */
export interface DefinitionRevealed extends EncounterBase { kind: 'definition-revealed'; verse: number; token: EcclesiaToken; depth?: 'label' | 'brief' | 'explanatory' }
/** The reader showed the word's parsing (morphology). */
export interface MorphologyRevealed extends EncounterBase { kind: 'morphology-revealed'; verse: number; token: EcclesiaToken }
/** The reader showed a translation of a verse: help with every word of it. */
export interface TranslationRevealed extends EncounterBase { kind: 'translation-revealed'; verse: number; tokens: EcclesiaToken[] }
/** The learner asked for an explanation of the verse in context (syntax, discourse, a note). */
export interface ContextExplained extends EncounterBase { kind: 'context-explained'; verse: number; tokens: EcclesiaToken[] }
/**
 * The learner finished a passage and said whether they understood it. Without help this is a (weak, self-reported) reading
 * recognition of every word; with help it is assisted recognition. The reader decides `helpUsed` from the help it showed.
 */
export interface PassageCompleted extends EncounterBase { kind: 'passage-completed'; verses: PassageVerse[]; helpUsed: boolean }
/** The learner marked a word with a knowledge level (or bookmarked it). The newest level mark decides the word's level (KNOWLEDGE-LEVELS.md). */
export interface WordMarked extends EncounterBase { kind: 'word-marked'; verse: number; token: EcclesiaToken; mark: KnowledgeLevel | 'saved' | 'ignore' }

export type ReadingEncounter =
  | PassageViewed | WordSelected | DefinitionRevealed | MorphologyRevealed | TranslationRevealed | ContextExplained | PassageCompleted | WordMarked;

export const READING_ENCOUNTER_KINDS = [
  'passage-viewed', 'word-selected', 'definition-revealed', 'morphology-revealed', 'translation-revealed', 'context-explained', 'passage-completed', 'word-marked',
] as const;
export type ReadingEncounterKind = (typeof READING_ENCOUNTER_KINDS)[number];

/** How an encounter was mapped: the events to record and, per event, what the Repository engine will make of it. */
export interface EncounterMapping {
  encounterId: string;
  kind: ReadingEncounterKind;
  events: GoEvent[];
  /** Which encounters record nothing and why (an empty passage, a bookmark that is not evidence). */
  notes: string[];
}

/** Where recorded events go. `append` must be idempotent on event id / dedupeKey; the event log of the Repository already is. */
export interface EncounterSink { record(events: GoEvent[]): Promise<void> }

// ───────────────────────────── contextual cards ─────────────────────────────

/** A card is one unit tested along one assessment dimension: `card:<dimension>:<unitId>` (GoReview's `itemIdFor`). The passage is where it was met. */
export interface CardContext { ref: PassageRef; verse: number; tokenIndex: number; sentenceKey: string; sourceRef: SourceRef }

export interface ContextualCard {
  cardId: string;
  unitId: string;
  unitKind: 'lexeme' | 'form';
  language: EcclesiaLanguageId;
  dimension: AssessmentDimension;
  family: ExerciseFamily;
  /** The occurrence the card was made from. The same word met elsewhere is the SAME card; `contextsOf` lists every occurrence. */
  context: CardContext;
}

// ───────────────────────────── knowledge profile (six levels) and schedule (FSRS) ─────────────────────────────

/** What is known about one unit, on the six-level scale, from the Repository projection; never a schedule. */
export interface UnitStanding {
  unitId: string;
  level: KnowledgeLevel;
  /** Distinct encounters (lookups, exposures, recognitions, help requests). */
  encounters: number;
  /** The projection's own retention estimate 0..1 (not FSRS retrievability). */
  retention: number;
  readingRecognition: { score: number; observations: number; positive: number; negative: number };
  assistedRecognition: { observations: number; positive: number; negative: number };
  lookups: number;
  selfMark?: { mark: KnowledgeLevel; at: string };
  firstSeenAt?: string;
  lastSeenAt?: string;
}

/** The FSRS side of one card: where the schedule stands. Kept apart from the knowledge level on purpose. */
export interface CardSchedule {
  cardId: string;
  unitId: string;
  status: DeckItem['status'];
  due: string;
  isDue: boolean;
  retrievability: number;
  phase: ScheduleState['phase'];
  reps: number;
  lapses: number;
  lastReview?: string;
}

/** Both sides, for one unit: how well it is known (levels) and when its cards return (FSRS). */
export interface UnitOverview { standing: UnitStanding | undefined; cards: CardSchedule[] }

// ───────────────────────────── familiarity (Next Best Passage) ─────────────────────────────

export interface FamiliarityPolicy {
  /** A token counts as known when its lexeme (or its form) stands at this level or above. */
  knownFrom: KnowledgeLevel;
  /** The target band of known-token share for a next passage (the brief's 80–90 %). */
  targetLow: number;
  targetHigh: number;
  /** Count a token as known when its FORM is known even if its lexeme is not (default true: the reader meets forms). */
  formsCount: boolean;
  /**
   * Count a token as known when the SAME WORD is known under another period's spelling (polytonic ἄνθρωπος for monotonic
   * άνθρωπος, pointed for unpointed Hebrew): matched by `crossPeriodKey` and part of speech. Default false: a spelling link is
   * not an identity, and a word's sense may have moved between periods. The result says how many tokens were credited this way.
   */
  crossPeriodCredit: boolean;
}

export const FAMILIARITY_HEURISTIC = 'ecclesia-familiarity@provisional-1';

export interface UnknownLexeme {
  lexemeId: string;
  lemma: string;
  pos: UdPos;
  /** Token occurrences in the passage. */
  occurrences: number;
  level: KnowledgeLevel;
  /** Corpus frequency rank when a provider was given (1 = commonest); absent otherwise, never estimated. */
  frequencyRank?: number;
}

/** PROVISIONAL. A token-share heuristic, labelled as such; calibration against real learners has not happened. */
export interface PassageFamiliarity {
  heuristic: typeof FAMILIARITY_HEURISTIC;
  provisional: true;
  language: EcclesiaLanguageId;
  ref: PassageRef;
  policy: FamiliarityPolicy;
  tokens: number;
  knownTokens: number;
  /** knownTokens / tokens; 0 for an empty passage. */
  familiarity: number;
  inTargetBand: boolean;
  /** 0 inside the band; else the distance to its nearer edge. */
  distanceFromBand: number;
  /** Share of tokens whose lexeme has ANY knowledge row: how much the estimate rests on. */
  reliability: number;
  /** Tokens counted as known only through another period's spelling of the word (0 unless `policy.crossPeriodCredit`). */
  creditedAcrossPeriods: number;
  /** Distinct lexemes not yet known, commonest first (by corpus rank, then by occurrences), so the reader can pre-teach them. */
  unknownLexemes: UnknownLexeme[];
  notes: string[];
}

export interface RankedPassage { familiarity: PassageFamiliarity; rank: number; reasons: string[] }

// ───────────────────────────── corpus frequency ─────────────────────────────

/** Where a frequency comes from; Ecclesia supplies the corpus, this package never ships or estimates frequencies. */
export interface CorpusFrequencyProvider {
  corpusId: string;
  language: EcclesiaLanguageId;
  /** Word tokens in the corpus. */
  total: number;
  /** 1 = commonest; undefined when the lexeme is not in the corpus. */
  rankOf(lexemeId: string): number | undefined;
  countOf(lexemeId: string): number;
  /** Occurrences per million tokens; undefined when absent. */
  perMillion(lexemeId: string): number | undefined;
}

// ───────────────────────────── lexicon (facts for exercises) ─────────────────────────────

/** What the reader knows about a lexeme, for building exercises; glosses are short (a few words each). */
export interface EcclesiaLexeme {
  lexemeId: string;
  lemma: string;
  pos: UdPos;
  glosses: string[];
  /** Period ids the lexeme is attested in, when the dictionary says; absent = not stated (never "every period"). */
  periods?: string[];
  /** Glosses by period id where the meaning differs by period (λόγος: Attic "account, reason"; Koine "word"); `glosses` is the fallback. */
  glossesByPeriod?: Record<string, string[]>;
  /** Shown whenever a gloss is shown (the dictionary's name, its licence). */
  attribution?: string;
  frequency?: LinguisticUnit['frequency'];
  status?: AnalysisStatus;
}

export interface EcclesiaForm {
  formId: string;
  surface: string;
  lexemeId: string;
  features?: Record<string, string>;
  /** Period ids the form is attested in (an Epic form, a Modern spelling), when known. */
  periods?: string[];
  status?: AnalysisStatus;
}

/** The lookup the facts provider needs; a reader implements it over its own dictionary and corpus. */
export interface EcclesiaLexicon {
  lexeme(lexemeId: string): EcclesiaLexeme | undefined;
  form(formId: string): EcclesiaForm | undefined;
  /** Other lexemes whose glosses may serve as distractors (a sample of the lexicon; the builder filters them). */
  distractorPool?(language: EcclesiaLanguageId, limit: number): EcclesiaLexeme[];
}

// ───────────────────────────── sessions ─────────────────────────────

/** What a composed session is made of, so the caller can show why each card is there (the plan's own `why` and `skipped` stay). */
export interface ComposedSession {
  plan: SessionPlan;
  preferences: ReviewPreferences;
  deck: DeckItem[];
  /** Units proposed from reading that intake admitted (they are born as cards on their first answer). */
  admitted: string[];
  /** Units proposed from reading that intake declined, with its reasons. */
  declined: Array<{ unitId: string; decision: string; reasons: string[] }>;
  /** When a reading context was given: which planned items came from it. */
  fromReadingContext: string[];
}

export type { UnitFacts };
