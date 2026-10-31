/**
 * A source-aware projection of the distinct meanings and grammatical facts attached to a word.
 * This module is deliberately language-neutral: it shapes explicit evidence and never infers a
 * grammatical feature, transfers a lemma gloss to an inflected form, or invents context.
 */

export interface WordAnalysisEvidence {
  source?: string;
  confidence?: number;
  ambiguity?: string[];
}

export interface WordMeaning extends WordAnalysisEvidence {
  text: string;
}

export interface WordGrammaticalFeature extends WordAnalysisEvidence {
  key: string;
  value: string;
}

export interface WordSentenceContext extends WordAnalysisEvidence {
  text: string;
}

export interface WordAnalysisReference {
  label: string;
  source?: string;
  uri?: string;
}

/**
 * A nullable field means that no evidence for that kind of meaning/context was supplied.
 * In particular, lexicalMeaning is never used as a fallback for inflectedMeaning.
 */
export interface WordAnalysis {
  language: string | null;
  surface: string | null;
  normalizedForm: string | null;
  lemma: string | null;
  pos: string | null;
  lexicalMeaning: WordMeaning | null;
  grammaticalFeatures: WordGrammaticalFeature[];
  inflectedMeaning: WordMeaning | null;
  contextualMeaning: WordMeaning | null;
  sentenceContext: WordSentenceContext | null;
  references: WordAnalysisReference[];
  confidence: number | null;
  ambiguity: string[];
}

/** Inputs are explicit evidence only; omitted fields project to empty/null states. */
export type WordAnalysisInput = Partial<WordAnalysis>;

function confidence(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}

function meaning(value: WordMeaning | null | undefined): WordMeaning | null {
  if (value == null || !value.text.trim()) return null;
  return {
    text: value.text,
    ...(value.source ? { source: value.source } : {}),
    ...(confidence(value.confidence) !== null ? { confidence: confidence(value.confidence)! } : {}),
    ...(value.ambiguity?.length ? { ambiguity: [...value.ambiguity] } : {}),
  };
}

/**
 * Return a detached, stable display shape from explicit source evidence.
 * The function is a projection, not an analyzer or fallback policy.
 */
export function projectWordAnalysis(input: WordAnalysisInput = {}): WordAnalysis {
  return {
    language: input.language?.trim() || null,
    surface: input.surface?.trim() || null,
    normalizedForm: input.normalizedForm?.normalize('NFC').trim() || input.surface?.normalize('NFC').trim() || null,
    lemma: input.lemma?.trim() || null,
    pos: input.pos?.trim() || null,
    lexicalMeaning: meaning(input.lexicalMeaning),
    grammaticalFeatures: (input.grammaticalFeatures ?? []).filter((f) => !!f.key && !!f.value).map((f) => ({
      key: f.key,
      value: f.value,
      ...(f.source ? { source: f.source } : {}),
      ...(confidence(f.confidence) !== null ? { confidence: confidence(f.confidence)! } : {}),
      ...(f.ambiguity?.length ? { ambiguity: [...f.ambiguity] } : {}),
    })),
    inflectedMeaning: meaning(input.inflectedMeaning),
    contextualMeaning: meaning(input.contextualMeaning),
    sentenceContext: input.sentenceContext == null || !input.sentenceContext.text.trim() ? null : {
      text: input.sentenceContext.text,
      ...(input.sentenceContext.source ? { source: input.sentenceContext.source } : {}),
      ...(confidence(input.sentenceContext.confidence) !== null ? { confidence: confidence(input.sentenceContext.confidence)! } : {}),
      ...(input.sentenceContext.ambiguity?.length ? { ambiguity: [...input.sentenceContext.ambiguity] } : {}),
    },
    references: (input.references ?? []).filter((r) => !!r.label).map((r) => ({
      label: r.label,
      ...(r.source ? { source: r.source } : {}),
      ...(r.uri ? { uri: r.uri } : {}),
    })),
    confidence: confidence(input.confidence),
    ambiguity: [...(input.ambiguity ?? [])],
  };
}
