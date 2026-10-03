/**
 * Deterministic assessment of one attempt: MEANING and LANGUAGE are judged separately.
 *
 *  - Meaning: did the attempt carry every concept of the goal, with the right polarity? Concepts are recognised with GoTell's
 *    concept tables (the same ones that flag meaning changes in suggestions). How each concept was matched sets the
 *    confidence; a concept the tables do not recognise is reported missing, and `limits` says so.
 *  - Language: the language adapter's own checkProduction, sentence by sentence. "No issues detected" is reported as exactly
 *    that, never as "correct": the checker's coverage is attached.
 *
 * Nothing here calls a model or the network, and nothing here changes learner state.
 */
import type { LanguageAdapter, LanguageAssessment, LanguageCode, LanguageFinding, MeaningAssessment, SemanticGoal, SupportLevel, TellError } from '../../core';
import { checkerCoverage } from '../coverage';
import { CONCEPTS, conceptMatches } from '../concepts';
import type { ConceptId } from '../concepts';
import { negatorsIn } from '../meaning';
import { MIN_ERROR_CONFIDENCE, bestCandidate, parse, wordIndexes } from '../text';
import { codeForCategory, taxonomyEntry } from './taxonomy';

export const MEANING_METHOD = 'concept-tables@1';
export const EVALUATOR = { id: 'deterministic', version: '1' } as const;

const VIA_CONFIDENCE = { form: 0.92, lemma: 0.88, stem: 0.78, substring: 0.7 } as const;
const ANALYSIS_FACTOR: Record<SupportLevel, number> = { dependable: 1, limited: 0.95, 'seed-only': 0.9, none: 0.8 };
/** When a concept is reported missing, the tables may simply not list the learner's word for it. */
const MISSING_CONFIDENCE = 0.65;

const NON_LATIN: ReadonlySet<LanguageCode> = new Set<LanguageCode>(['th', 'hi']);
const round2 = (n: number) => Math.round(n * 100) / 100;

export const MEANING_LIMITS = 'GoTell recognises the ideas through its own word lists (not yet reviewed by native speakers). A word or paraphrase that is not in them is reported as missing, and it does not check who did what, tense or word order: those are the checker\'s and your teacher\'s job.';

export function assessMeaning(adapter: LanguageAdapter, lang: LanguageCode, goal: SemanticGoal, text: string): MeaningAssessment {
  const p = parse(adapter, text);
  const words = wordIndexes(p);
  const wanted = new Set(goal.components.map((c) => c.concept));
  const covered: MeaningAssessment['covered'] = [];
  const goalTokens = new Set<number>();
  const otherKeyTerms = new Set<string>();
  const knownLanguageWords: string[] = [];
  const goalEnglish = new Set(goal.components.flatMap((c) => [c.english.toLowerCase(), ...(CONCEPTS[c.concept as ConceptId]?.english ?? [])]));

  const matchesAt = words.map((i) => ({ i, m: conceptMatches(lang, p.tokens[i].normalized, bestCandidate(p.analyses[i])?.lemma) }));
  // Thai is written without spaces and a segmenter may split a compound (กลับ|ใจ): adjacent tokens are also read together
  const joined: Array<{ i: number; surface: string; m: ReturnType<typeof conceptMatches> }> = [];
  if (lang === 'th') {
    for (let k = 0; k < words.length; k++) {
      for (const n of [2, 3]) {
        const run = words.slice(k, k + n);
        if (run.length < n || run.some((x, j) => j > 0 && x !== run[j - 1] + 1)) continue;
        joined.push({ i: run[0], surface: run.map((x) => p.tokens[x].surface).join(''), m: conceptMatches(lang, run.map((x) => p.tokens[x].normalized).join('')) });
      }
    }
  }
  for (const { i, m } of matchesAt) {
    for (const hit of m) {
      if (!wanted.has(hit.concept) || covered.some((c) => c.concept === hit.concept)) continue;
      covered.push({ concept: hit.concept, token: p.tokens[i].surface, via: hit.via });
      goalTokens.add(i);
    }
  }
  for (const j of joined) {
    for (const hit of j.m) {
      if (!wanted.has(hit.concept) || covered.some((c) => c.concept === hit.concept)) continue;
      covered.push({ concept: hit.concept, token: j.surface, via: 'substring' });
    }
  }
  for (const { i, m } of matchesAt) {
    if (goalTokens.has(i)) continue; // a token that carries a goal concept is not a substitution (Glaube / विश्वास are both)
    for (const hit of m) if (!wanted.has(hit.concept) && CONCEPTS[hit.concept].keyTerm) otherKeyTerms.add(hit.concept);
  }
  for (const i of words) {
    const s = p.tokens[i].surface;
    const ascii = /^[A-Za-z']+$/.test(s);
    if (!ascii) continue;
    // in a non-Latin script any Latin word is the known language; in a Latin script only an English word of this meaning
    // that the adapter cannot read as a word of the language ("sin" is also Spanish: not flagged)
    if (NON_LATIN.has(lang) || (goalEnglish.has(s.toLowerCase()) && (p.analyses[i]?.candidates.length ?? 0) === 0)) knownLanguageWords.push(s);
  }

  const missing = goal.components.map((c) => c.concept).filter((c) => !covered.some((x) => x.concept === c));
  const negated = negatorsIn(lang, p).length > 0;
  const polarity: MeaningAssessment['polarity'] = negated === goal.negated ? 'ok' : goal.negated ? 'missing-negation' : 'unexpected-negation';
  const factor = ANALYSIS_FACTOR[adapter.support?.lemmatization ?? 'none'];
  const parts = [...covered.map((c) => VIA_CONFIDENCE[c.via]), ...missing.map(() => MISSING_CONFIDENCE)];
  const confidence = round2((parts.length ? Math.min(...parts) : 0.5) * factor);
  return {
    success: missing.length === 0 && polarity === 'ok' && words.length > 0,
    covered,
    missing,
    polarity,
    otherKeyTerms: [...otherKeyTerms],
    knownLanguageWords,
    confidence,
    method: MEANING_METHOD,
    limits: MEANING_LIMITS,
  };
}

export function assessLanguage(adapter: LanguageAdapter, text: string): LanguageAssessment {
  const findings: LanguageFinding[] = [];
  for (const span of adapter.segmentSentences(text)) {
    if (!span.text.trim()) continue;
    const p = parse(adapter, span.text);
    for (const e of adapter.checkProduction(p.tokens, p.analyses, span.text)) {
      if (e.confidence < MIN_ERROR_CONFIDENCE) continue;
      const valid = e.tokenIndexes.filter((i) => i >= 0 && i < p.tokens.length);
      const local: [number, number] = valid.length
        ? [Math.min(...valid.map((i) => p.tokens[i].start)), Math.max(...valid.map((i) => p.tokens[i].end))]
        : e.suggestion ? [e.suggestion.start, e.suggestion.end] : [0, span.text.length];
      const code = codeForCategory(e.category);
      findings.push({
        code,
        family: taxonomyEntry(code).family,
        category: e.category,
        message: e.message,
        span: [local[0] + span.start, local[1] + span.start],
        confidence: e.confidence,
        affectsMeaning: e.affectsMeaning,
        ...(e.suggestion ? { fix: { start: e.suggestion.start + span.start, end: e.suggestion.end + span.start, replacement: e.suggestion.replacement } } : {}),
      });
    }
  }
  return { noIssuesDetected: findings.length === 0, findings, checker: `${adapter.name}@${adapter.version}`, coverage: checkerCoverage(adapter) };
}

const conceptLabel = (goal: SemanticGoal, concept: string) => goal.components.find((c) => c.concept === concept)?.label ?? concept;

/** The errors of an attempt, from both assessments, in one taxonomy. */
export function errorsOf(goal: SemanticGoal, meaning: MeaningAssessment, language: LanguageAssessment): TellError[] {
  const out: TellError[] = [];
  const substituted = meaning.otherKeyTerms.length > 0;
  for (const m of meaning.missing) {
    const keyTerm = CONCEPTS[m as ConceptId]?.keyTerm;
    if (keyTerm && substituted) {
      out.push({ code: 'meaning.key-term-substitution', family: 'meaning', concept: m, confidence: 0.6, source: 'meaning',
        detail: `The meaning needs "${conceptLabel(goal, m)}"; the sentence has ${meaning.otherKeyTerms.map((k) => `"${CONCEPTS[k as ConceptId]?.english[0] ?? k}"`).join(', ')} instead. These key words are not interchangeable.` });
    } else {
      out.push({ code: 'meaning.missing-concept', family: 'meaning', concept: m, confidence: MISSING_CONFIDENCE, source: 'meaning', detail: `"${conceptLabel(goal, m)}" is not yet in the sentence.` });
    }
  }
  if (meaning.polarity !== 'ok') {
    out.push({ code: 'meaning.polarity', family: 'meaning', confidence: 0.8, source: 'meaning',
      detail: meaning.polarity === 'missing-negation' ? 'The meaning is negative ("not"), but the sentence is not.' : 'The sentence is negative, but the meaning is not.' });
  }
  for (const w of meaning.knownLanguageWords) {
    out.push({ code: 'lexical.known-language-word', family: 'lexical', confidence: 0.85, source: 'meaning', detail: `"${w}" is English.` });
  }
  for (const f of language.findings) out.push({ code: f.code, family: f.family, confidence: f.confidence, source: 'checker', detail: f.message });
  return out;
}

export function outcomeOf(meaning: MeaningAssessment, language: LanguageAssessment): 'success' | 'meaning-only' | 'language-only' | 'failed' {
  const m = meaning.success && meaning.knownLanguageWords.length === 0;
  if (m && language.noIssuesDetected) return 'success';
  if (m) return 'meaning-only';
  return language.noIssuesDetected ? 'language-only' : 'failed';
}
