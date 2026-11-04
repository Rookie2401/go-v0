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

/** An analyzer's reading of one word, as the adapters hand it to `candidateWordAnalysis`. */
export interface CandidateMeaningInput {
  language: string; surface: string; lemma?: string; pos?: string;
  /** The lemma's citation gloss, as the lexicon writes it. */
  lemmaGloss?: string;
  morph?: Readonly<Record<string, string>>; source?: string; confidence?: number;
  alternatives?: Array<{ lemma?: string; pos?: string; morph: Readonly<Record<string, string>>; confidence?: number }>;
  sentence?: string; sentenceConfidence?: number; sentenceSource?: string;
  /** Reference ids (a verse: "GAL.5.14"); `labelReference` turns one into a label and a source. */
  references?: string[];
  contextualMeaning?: WordMeaning;
}
/** The English of the reading's form from its citation and features, or undefined when it cannot be written. */
export type MeaningRealizer = (lemma: string | undefined, pos: string | undefined, morph: Readonly<Record<string, string>>, lemmaGloss: string | undefined) => string | undefined;
export interface CandidateMeaningOptions {
  realize: MeaningRealizer;
  /** The lemma meaning to show (default: the citation as given). */
  lexicalText?: (lemmaGloss: string) => string;
  labelReference?: (ref: string) => WordAnalysisReference;
}

const VERBAL = (pos: string | undefined): boolean => !pos || pos === 'VERB' || pos === 'AUX';
const LISTED = ['VerbForm', 'Mood', 'Tense', 'Voice', 'Person', 'Number'] as const;
/**
 * An analyzer writes two readings of one form as a list ("Tense=Perf,Pres" for Latin venit, "Person=1,3" for Spanish era):
 * each is its own reading here, the first shown and the rest listed as other possible readings. At most twelve.
 */
export const hasListedFeatures = (morph: Readonly<Record<string, string>>): boolean => LISTED.some((key) => (morph[key] ?? '').includes(','));
export function expandListedFeatures(morph: Readonly<Record<string, string>>): Array<Record<string, string>> {
  let out: Array<Record<string, string>> = [{ ...morph }];
  for (const key of LISTED) {
    const value = morph[key];
    if (!value || !value.includes(',')) continue;
    const values = value.split(',').map((v) => v.trim()).filter(Boolean);
    out = out.flatMap((m) => values.map((v) => ({ ...m, [key]: v }))).slice(0, 12);
  }
  return out;
}
const featureList = (m: Readonly<Record<string, string>>): string => Object.entries(m).map(([k, v]) => `${k}=${v}`).join(', ') || 'no morphology';
/** Two readings with the same lemma, part of speech and features are one meaning (a finite form with or without VerbForm=Fin). */
const signature = (lemma: string | undefined, pos: string | undefined, m: Readonly<Record<string, string>>): string =>
  `${lemma ?? ''}|${pos ?? ''}|${Object.entries(m).filter(([k, v]) => !(k === 'VerbForm' && v === 'Fin')).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}:${v}`).join('|')}`;

/**
 * The word analysis of an analyzer's reading: the realized inflected meaning (verbs only; the adapter's realizer writes it),
 * the lemma meaning, the features, and the other readings as ambiguity. An alternative that is the same lexeme realizes
 * through the same realizer (so "I may love" stands beside "I love"); another lexeme is named with its features.
 */
export function candidateWordAnalysis(input: CandidateMeaningInput, opts: CandidateMeaningOptions): WordAnalysis {
  const morph = input.morph ?? {};
  const source = input.source;
  const [primary, ...listed] = expandListedFeatures(morph);
  const inflectedText = VERBAL(input.pos) ? opts.realize(input.lemma, input.pos, primary, input.lemmaGloss) : undefined;
  const seen = new Set<string>([signature(input.lemma, input.pos, primary)]);
  type Alternative = NonNullable<CandidateMeaningInput['alternatives']>[number];
  const readings: Alternative[] = [...listed.map((m) => ({ morph: m })), ...(input.alternatives ?? []).flatMap((a) => expandListedFeatures(a.morph).map((m) => ({ ...a, morph: m })))];
  const alternatives = readings.filter((a) => {
    const key = signature(a.lemma ?? input.lemma, a.pos ?? input.pos, a.morph);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((a) => {
    if ((a.lemma && a.lemma !== input.lemma) || (a.pos && a.pos !== input.pos)) return `${a.lemma ?? 'another lexeme'} (${a.pos ?? 'unclassified'}; ${featureList(a.morph)})`;
    const meaning = VERBAL(a.pos ?? input.pos) ? opts.realize(input.lemma, a.pos ?? input.pos, a.morph, input.lemmaGloss) : undefined;
    if (meaning && meaning === inflectedText) return '';
    return meaning ?? `Alternative reading (${featureList(a.morph)})`;
  }).filter(Boolean);
  const ambiguity = alternatives.length ? [...new Set([...(inflectedText ? [inflectedText] : []), ...alternatives])] : [];
  const labelReference = opts.labelReference ?? ((r: string): WordAnalysisReference => ({ label: r, uri: r }));
  return projectWordAnalysis({
    language: input.language, surface: input.surface, lemma: input.lemma ?? null, pos: input.pos ?? null,
    lexicalMeaning: input.lemmaGloss ? { text: opts.lexicalText ? opts.lexicalText(input.lemmaGloss) : input.lemmaGloss, source, confidence: input.confidence } : null,
    grammaticalFeatures: Object.entries(morph).map(([key, value]) => ({ key, value, ...(source ? { source } : {}), confidence: input.confidence, ...(ambiguity.length ? { ambiguity } : {}) })),
    inflectedMeaning: inflectedText ? { text: inflectedText, ...(source ? { source } : {}), confidence: input.confidence, ...(ambiguity.length ? { ambiguity } : {}) } : null,
    contextualMeaning: input.contextualMeaning ?? null,
    sentenceContext: input.sentence ? { text: input.sentence, ...(input.sentenceSource ? { source: input.sentenceSource } : {}), confidence: input.sentenceConfidence ?? 1 } : null,
    references: (input.references ?? []).map(labelReference),
    confidence: input.confidence, ambiguity,
  });
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
