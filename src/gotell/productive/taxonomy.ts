/**
 * Error taxonomy for productive attempts — extensible, and language-neutral at this level.
 *
 * Codes are "<area>.<name>". GoTell itself produces the `meaning.*` and `lexical.*` codes (it compares an attempt with the
 * meaning it was meant to carry). Everything language-specific comes from the language adapter's checkProduction: each
 * adapter ErrorCategory becomes "lang.<category>" in a family. An adapter (or a later module) may register finer codes with
 * `registerErrorCode` without touching this file; an unknown code still has a family ('discourse' by default) and is shown.
 */
import type { ErrorCategory, ErrorFamily } from '../../core';

export interface TaxonomyEntry {
  code: string;
  family: ErrorFamily;
  /** A short learner-facing name for the kind of problem — never the fix itself. */
  label: string;
}

const CATEGORY: Record<ErrorCategory, { family: ErrorFamily; label: string }> = {
  spelling: { family: 'orthography', label: 'spelling' },
  morphology: { family: 'morphology', label: 'the form of a word' },
  conjugation: { family: 'morphology', label: 'the verb form' },
  agreement: { family: 'morphology', label: 'agreement between words' },
  case: { family: 'morphology', label: 'the case of a word' },
  syntax: { family: 'syntax', label: 'how the sentence is built' },
  'word-order': { family: 'syntax', label: 'word order' },
  'lexical-choice': { family: 'lexical', label: 'the choice of word' },
  'missing-function-word': { family: 'syntax', label: 'a missing small word' },
  collocation: { family: 'lexical', label: 'which words go together' },
  ambiguity: { family: 'discourse', label: 'something that could be read two ways' },
  clarity: { family: 'discourse', label: 'clarity' },
  register: { family: 'register', label: 'how formal it sounds' },
  'meaning-change': { family: 'meaning', label: 'the meaning' },
  segmentation: { family: 'orthography', label: 'where words begin and end' },
  particle: { family: 'syntax', label: 'a particle' },
  classifier: { family: 'morphology', label: 'a classifier' },
  postposition: { family: 'syntax', label: 'a postposition' },
  definiteness: { family: 'morphology', label: 'definite or indefinite form' },
  dialect: { family: 'register', label: 'a form from another variety' },
  idiomaticity: { family: 'lexical', label: 'what sounds natural' },
};

const REGISTRY = new Map<string, TaxonomyEntry>([
  ['meaning.missing-concept', { code: 'meaning.missing-concept', family: 'meaning', label: 'part of the meaning is missing' }],
  ['meaning.polarity', { code: 'meaning.polarity', family: 'meaning', label: 'yes/no is reversed' }],
  ['meaning.key-term-substitution', { code: 'meaning.key-term-substitution', family: 'meaning', label: 'a different key word' }],
  ['lexical.known-language-word', { code: 'lexical.known-language-word', family: 'lexical', label: 'an English word in the sentence' }],
  ...(Object.entries(CATEGORY) as Array<[ErrorCategory, { family: ErrorFamily; label: string }]>).map(([c, e]) => [`lang.${c}`, { code: `lang.${c}`, ...e }] as [string, TaxonomyEntry]),
]);

export function registerErrorCode(entry: TaxonomyEntry): void {
  REGISTRY.set(entry.code, entry);
}

export function taxonomyEntry(code: string): TaxonomyEntry {
  return REGISTRY.get(code) ?? { code, family: 'discourse', label: 'something to check' };
}

export function codeForCategory(category: ErrorCategory): string {
  return `lang.${category}`;
}

export function allErrorCodes(): TaxonomyEntry[] {
  return [...REGISTRY.values()];
}
