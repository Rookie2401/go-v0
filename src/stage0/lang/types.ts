/**
 * Per-language Stage 0 configuration — what differs between languages, as data the shared engine reads.
 * Content (scenes, sounds, exit forms) is NOT here: it lives in data/stage0/<lang>/.
 */
import type { LanguageCode, Stage0ExitCriteria } from '../../core';

/** A sound–spelling feature of a Latin-script language, found in a word by its spelling. */
export interface Stage0SpellingFeature {
  id: string;
  /** What the learner reads ("ll — like the y in 'yes'"). Plain words. */
  label: string;
  /** Matched against the word in lower case (NFC). */
  pattern: RegExp;
  /** Only for words of this part of speech (German capital nouns). */
  pos?: string;
  /** Matched against the word as written (case kept). */
  caseSensitive?: boolean;
}

export interface Stage0FadePolicy {
  /** A feature is secure after this many correct answers in a row with no help shown. */
  secureAfter: number;
  /** Path index (0-based) after which the support is never shown by default again — only on request, as a rescue. */
  retireAfterStep: number;
}

export interface Stage0LanguageConfig {
  lang: LanguageCode;
  name: string;
  /** BCP-47 tags tried, in order, for the device's computer voice (practice only). */
  voiceLangs: string[];
  /** Where first-person forms depend on the speaker's gender: the question asked once. */
  speakerForms?: { question: string; why: string };
  script: {
    kind: 'latin' | 'devanagari' | 'thai' | 'hebrew' | 'greek';
    /** 'adapter': orth features from the language adapter's decoder; 'spelling': the patterns below. */
    features: 'adapter' | 'spelling';
    spelling?: Stage0SpellingFeature[];
    /** Romanization shown under words while their features are not yet secure — and retired for good after a step. */
    transliteration?: Stage0FadePolicy;
    /** Thai: thin gaps between words while segmentation is not yet secure. */
    segmentation?: Stage0FadePolicy;
    tones?: boolean;
  };
  /** Curriculum-level target bands, checked by the validator along the intended path. */
  bands: {
    /** The first scenes (by path order) may introduce at most `earlyMaxNew` new words each. */
    earlyScenes: number;
    earlyMaxNew: number;
    laterMaxNew: number;
    /** Share of a later scene's word tokens that a learner who followed the path has met before. */
    laterMinCoverage: number;
    /** Share of an exit form's word tokens met along the path. */
    exitMinCoverage: number;
  };
  exit: Stage0ExitCriteria;
  /** One plain sentence shown on the Stage 0 page. */
  intro: string;
}
