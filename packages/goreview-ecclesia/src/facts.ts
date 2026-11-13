/**
 * Facts for exercises, from the reader's own lexicon. GoReview's builders never invent what the facts do not hold: a
 * written-recognition card needs a gloss, a morphology card needs features. The reader implements `EcclesiaLexicon` over its
 * dictionary and corpus; this adapter turns an entry into `UnitFacts` the builders accept.
 *
 * Glosses: short (at most four words each, no brackets) so the grading accepts them as answers; the first is the reference
 * answer. They are filed as word-list (lexicon) glosses, since a curated reader dictionary is what GoReview's own word lists
 * are. `attribution` is shown with every gloss. Example sentences stay EMPTY: GoReview's `ExampleSentence.source` admits pack
 * material only, and a passage must not enter the facts; the reader shows the verse beside the card from `ContextualCard.context`.
 */
import type { AnalysisStatus, LinguisticUnit, UnitRelation } from '../../repository-contract/src';
import type { FactsProvider, UnitFacts } from '../../goreview/src/types';
import type { EcclesiaForm, EcclesiaLanguageProfile, EcclesiaLexeme, EcclesiaLexicon } from './contract';

/** A fixed instant for synthesised unit rows (a lexicon entry has no creation time of its own). */
export const LEXICON_CREATED_AT = '2026-01-01T00:00:00.000Z';
export const MAX_GLOSS_WORDS = 4;

const wordCount = (s: string): number => s.trim().split(/\s+/u).filter(Boolean).length;

/** Glosses the grading can accept: short, bracket-free, distinct; long senses are kept after them (shown, never accepted). */
export function orderGlosses(glosses: readonly string[]): string[] {
  const seen = new Set<string>();
  const short: string[] = [];
  const long: string[] = [];
  for (const g of glosses) {
    const t = g.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    (wordCount(t) <= MAX_GLOSS_WORDS && !/[(\[]/u.test(t) ? short : long).push(t);
  }
  return [...short, ...long];
}

function unitRow(profile: EcclesiaLanguageProfile, base: Pick<LinguisticUnit, 'unitId' | 'kind' | 'label'> & Partial<LinguisticUnit>, status: AnalysisStatus): LinguisticUnit {
  return {
    languageId: profile.repository.languageId, ...(profile.repository.varietyId ? { varietyId: profile.repository.varietyId } : {}), scriptId: profile.script,
    packId: profile.repository.packId, packVersion: profile.repository.packVersion,
    provenance: { source: 'dictionary', ref: profile.analysis.analyzerId, confidence: 1 }, status, createdAt: LEXICON_CREATED_AT,
    ...base,
  };
}

/** The glosses of a lexeme for a period: the period's own where the dictionary gives them (a meaning that moved between periods), else the general ones. */
export function glossesFor(lexeme: EcclesiaLexeme, varietyId: string | undefined): string[] {
  const own = varietyId ? lexeme.glossesByPeriod?.[varietyId] : undefined;
  return orderGlosses(own?.length ? own : lexeme.glosses);
}

export function lexemeFacts(profile: EcclesiaLanguageProfile, lexeme: EcclesiaLexeme, varietyId: string | undefined = profile.repository.varietyId): UnitFacts {
  const status = lexeme.status ?? profile.analysis.status;
  const glosses = glossesFor(lexeme, varietyId);
  const facts: UnitFacts = {
    unit: unitRow(profile, { unitId: lexeme.lexemeId, kind: 'lexeme', label: lexeme.lemma, pos: lexeme.pos, ...(lexeme.frequency ? { frequency: lexeme.frequency } : {}) }, status),
    relations: [], analyses: [], status, lemma: lexeme.lemma, pos: lexeme.pos, glosses,
    ...(lexeme.attribution ? { glossAttribution: lexeme.attribution } : {}),
    constructionIds: [], featureExplanations: {}, siblingForms: [], exampleSentences: [], pronunciationNotes: [],
  };
  // the glosses are the reader's own word list: all of them count as lexicon glosses (the reference answer is the first)
  return Object.assign(facts, { lexiconGlossCount: glosses.filter((g) => wordCount(g) <= MAX_GLOSS_WORDS && !/[(\[]/u.test(g)).length });
}

export function formFacts(profile: EcclesiaLanguageProfile, form: EcclesiaForm, lexeme: EcclesiaLexeme | undefined, varietyId: string | undefined = profile.repository.varietyId): UnitFacts {
  const status = form.status ?? lexeme?.status ?? profile.analysis.status;
  const glosses = lexeme ? glossesFor(lexeme, varietyId) : [];
  const relation: UnitRelation[] = lexeme ? [{
    fromId: form.formId, relation: 'form-of', toId: lexeme.lexemeId, confidence: 1, status,
    provenance: { source: 'dictionary', ref: profile.analysis.analyzerId, confidence: 1 },
  }] : [];
  const facts: UnitFacts = {
    unit: unitRow(profile, { unitId: form.formId, kind: 'form', label: form.surface, ...(lexeme ? { pos: lexeme.pos } : {}), ...(form.features ? { features: form.features } : {}) }, status),
    relations: relation, analyses: [], status, ...(lexeme ? { lemma: lexeme.lemma, pos: lexeme.pos } : {}), ...(form.features ? { features: form.features } : {}), glosses,
    ...(lexeme?.attribution ? { glossAttribution: lexeme.attribution } : {}),
    constructionIds: [], featureExplanations: {}, siblingForms: [], exampleSentences: [], pronunciationNotes: [],
  };
  return Object.assign(facts, { lexiconGlossCount: glosses.filter((g) => wordCount(g) <= MAX_GLOSS_WORDS && !/[(\[]/u.test(g)).length });
}

export interface EcclesiaFactsProvider extends FactsProvider {
  /** Facts of other lexemes, for choice distractors (the session runner's `pool`). */
  pool(limit?: number): UnitFacts[];
}

/** The facts provider GoReview's planner and session runner take, over the reader's lexicon. Unknown ids yield `undefined` (the item is skipped with that reason). */
export function factsProviderFor(profile: EcclesiaLanguageProfile, lexicon: EcclesiaLexicon): EcclesiaFactsProvider {
  const languageId = profile.repository.languageId;
  return {
    async factsFor(unitId, lang, varietyId) {
      if (lang !== languageId) return undefined;
      // the period asked for (the learner's target, as the planner passes it) chooses the glosses; the profile's own otherwise
      const period = varietyId ?? profile.repository.varietyId;
      if (unitId.startsWith('lemma:')) { const l = lexicon.lexeme(unitId); return l ? lexemeFacts(profile, l, period) : undefined; }
      if (unitId.startsWith('form:')) { const f = lexicon.form(unitId); return f ? formFacts(profile, f, lexicon.lexeme(f.lexemeId), period) : undefined; }
      return undefined;
    },
    pool(limit = 40) {
      return (lexicon.distractorPool?.(profile.id, limit) ?? []).map((l) => lexemeFacts(profile, l));
    },
  };
}

/** A lexicon held in memory: what a test or a small reader needs. */
export function inMemoryLexicon(lexemes: readonly EcclesiaLexeme[], forms: readonly EcclesiaForm[] = []): EcclesiaLexicon {
  const byLexeme = new Map(lexemes.map((l) => [l.lexemeId, l]));
  const byForm = new Map(forms.map((f) => [f.formId, f]));
  return {
    lexeme: (id) => byLexeme.get(id),
    form: (id) => byForm.get(id),
    distractorPool: (_language, limit) => lexemes.filter((l) => l.glosses.length).slice(0, limit),
  };
}
