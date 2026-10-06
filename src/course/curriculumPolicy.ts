import type { LanguageCode, Text } from '../core/model';
import type { Stage, Work, RegisterTag } from '../core/course';
import { THAI_STAGES } from './thai';
import { ALBANIAN_STAGES } from './albanian';
import { SPANISH_SHELVES } from './spanish';
import { GERMAN_SHELVES } from './german';
import { HINDI_SHELVES } from './hindi';

export type Lifecycle = 'candidate' | 'rights_pending' | 'acquired' | 'converted' | 'linguistic_review' | 'native_review' | 'ready' | 'published' | 'rejected';
export type PedagogicalRole = 'controlled' | 'graded' | 'bridge' | 'authentic' | 'heritage' | 'scripture' | 'reference' | 'assessment';
export interface CurriculumMetadata {
  lifecycle: Lifecycle;
  role: PedagogicalRole;
  registers: RegisterTag[];
  rejectionReasons: string[];
  provenance: {
    kind: 'original' | 'translation' | 'adaptation' | 'generated';
    sourceTextId?: string;
    sourceTitle?: string;
    sourceLanguage?: string;
    translator?: string;
    adapter?: string;
    description?: string;
  };
  nativeReview?: { by: string; at: string; contentVersion: number; language: LanguageCode };
  audio: { state: 'unavailable' | 'candidate' | 'rights_pending' | 'review_pending' | 'ready' | 'published'; rightsCleared: boolean; reviewedBy?: string; contentVersion?: number };
}
export interface StageContract {
  id: string;
  language: LanguageCode;
  entryCapabilities: string[];
  targetCapabilities: string[];
  orthography: { script: 'Latin' | 'Devanagari' | 'Thai'; expectation: string };
  lexicalProfile: { basis: string; intendedKnownCoverage: { min: number; max: number }; frequencyBandTargets: string[] };
  grammarProfile: { expectedKnown: string[]; introduced: string[]; toleratedWithSupport: string[] };
  textProfile: { genres: string[]; registers: RegisterTag[]; typicalLengthRange: { min: number; max: number }; lengthUnit: string; lengthPolicy: string };
  rescueExpectation: { targetLanguageHelp: string; englishRescue: string };
  exitEvidence: { kind: 'unseen-reading'; measures: readonly string[]; certification: false };
}
const measures = ['comprehension', 'gist', 'detail', 'inference', 'lookups', 'rescue-use', 'reading-time'] as const;
const ladders = [THAI_STAGES, ALBANIAN_STAGES, SPANISH_SHELVES, GERMAN_SHELVES, HINDI_SHELVES];
const constructions: Record<LanguageCode, readonly string[][]> = {
  de: [['Sound/spelling correspondence', 'Basic verb-second statements'], ['Present tense and questions', 'Article/noun agreement'], ['Accusative and dative phrases', 'Separable verbs'], ['Perfect past', 'Modal verbs'], ['Common subordinate clauses', 'Relative clauses'], ['Passive and indirect reference'], ['Argument structure and discourse connectors'], ['Register-sensitive idiom and implicit viewpoint']],
  es: [['Sound/spelling correspondence', 'Present-tense everyday statements'], ['Gender and number agreement', 'Questions and negation'], ['Object pronouns', 'Frequent past forms'], ['Preterite/imperfect narrative contrast'], ['Subordination and relative clauses'], ['Frequent subjunctive contexts'], ['Connectors and implicit reference'], ['Register-sensitive idiom and inference']],
  hi: [['Vowel signs and consonant combinations', 'Basic copular statements'], ['Gender agreement', 'Postpositions'], ['Oblique forms', 'Habitual and progressive aspect'], ['Perfective and ergative marking'], ['Compound verbs', 'Relative-correlative constructions'], ['Reported speech and embedded clauses'], ['Discourse continuity across Sanskritic and everyday registers'], ['Implicit reference and extended argument']],
  sq: [['Contemporary Standard spelling', 'Basic copular and present statements'], ['Definite/indefinite noun forms', 'Gender agreement'], ['Case relations and prepositions', 'Clitic pronouns'], ['Past narrative tense contrasts'], ['Subjunctive constructions and subordination'], ['Clitic combinations and reported speech'], ['Discourse reference; recognize labelled Gheg/historical forms'], ['Implicit argument and register-sensitive idiom']],
  th: [['Consonant classes, vowels and tone decoding', 'Basic Thai word order'], ['Negation and questions', 'Common classifiers'], ['Aspect markers and serial verbs'], ['Pronoun omission', 'Dialogue/discourse particles'], ['Connected clauses and narrative reference'], ['Embedded explanation', 'Register-dependent pronouns'], ['Implicit reference and literary economy'], ['Regional/historical recognition and contextual inference']],
};
const bandFor = (i: number, size: number) => Math.min(7, Math.floor(i * 8 / size));
const editorialLengths = [{ min: 5, max: 80 }, { min: 50, max: 250 }, { min: 150, max: 600 }, { min: 400, max: 1500 }, { min: 800, max: 3000 }, { min: 1200, max: 5000 }, { min: 1500, max: 8000 }, { min: 2000, max: 12000 }];
/** Editorial transition contracts, not measured CEFR equivalences or invented corpus statistics. */
export const STAGE_CONTRACTS: readonly StageContract[] = ladders.flatMap(stages => stages.map((stage, i) => ({
  id: stage.id,
  language: stage.lang,
  entryCapabilities: i ? [...stages[i - 1].purpose] : ['No prior reading proficiency required; script support remains available'],
  targetCapabilities: [...stage.purpose],
  orthography: {
    script: stage.lang === 'th' ? 'Thai' as const : stage.lang === 'hi' ? 'Devanagari' as const : 'Latin' as const,
    expectation: stage.lang === 'th' ? 'Read Thai script; segmentation and tone decoding remain available; romanization is rescue only' : stage.lang === 'hi' ? 'Read Devanagari; support vowel signs, conjuncts and orthographic decoding' : stage.lang === 'sq' ? 'Contemporary Standard Albanian for production; label Gheg and historical spelling for recognition' : 'Read contemporary spelling; label historical or regional forms for recognition',
  },
  lexicalProfile: { basis: 'Editorial target for supported acquisition, not measured corpus coverage; compare personalized demonstrated coverage and unfamiliar phrases', intendedKnownCoverage: { min: .9, max: .98 }, frequencyBandTargets: i < 3 ? ['frequent everyday language'] : ['everyday language', 'genre and domain vocabulary'] },
  grammarProfile: { expectedKnown: constructions[stage.lang].slice(0, bandFor(i, stages.length)).flat(), introduced: [...constructions[stage.lang][bandFor(i, stages.length)]], toleratedWithSupport: ['Unfamiliar constructions explained in the original text without rewriting it'] },
  textProfile: { genres: i < 3 ? ['connected everyday narrative', 'dialogue'] : ['narrative', 'ordinary modern nonfiction', 'dialogue'], registers: ['standard' as const, ...(i >= 3 ? ['colloquial' as const, 'formal' as const] : []), ...(i >= 6 ? ['literary' as const, 'historical' as const] : [])], typicalLengthRange: editorialLengths[bandFor(i, stages.length)], lengthUnit: stage.lang === 'th' ? 'adapter-segmented lexical tokens, never whitespace counts' : 'lexical word tokens', lengthPolicy: 'Ranges are editorial acquisition targets, not measured availability or maximum reading restrictions. Increase sustained length using actual text measurements and learner reading history; stage number alone is insufficient' },
  rescueExpectation: { targetLanguageHelp: stage.assistance.targetLanguageDefinitions ? 'Prefer available simple target-language definitions; retain phrase and grammar support' : 'Offer contextual gloss, phrase and decoding support', englishRescue: stage.assistance.englishRescue },
  exitEvidence: { kind: 'unseen-reading' as const, measures, certification: false as const },
})));
export function getStageContract(stage: Stage): StageContract | undefined { return STAGE_CONTRACTS.find(contract => contract.id === stage.id); }

export function releaseDecision(work: Work, text: Text, metadata: CurriculumMetadata | undefined = text.curriculum): { published: boolean; audioPublished: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!text.published) reasons.push(...(text.unpublishedReasons.length ? text.unpublishedReasons : ['Text publication gate has not passed']));
  if (!work.rights.canBundle || !work.rights.verified || !['verified-public-domain', 'verified-open-licence', 'permission-granted', 'course-authored'].includes(work.rights.state ?? '')) reasons.push('Work rights are not cleared for bundled curriculum use');
  if (metadata && metadata.lifecycle !== 'published') reasons.push(`Curriculum lifecycle is ${metadata.lifecycle}`);
  if (metadata?.lifecycle === 'rejected') reasons.push(...metadata.rejectionReasons);
  const needsNative = text.generated || text.editorialTags.includes('needs-native-review') || (metadata && metadata.provenance.kind !== 'original');
  if (needsNative) {
    const review = metadata?.nativeReview;
    if (!review?.by.trim() || !review.at.trim() || review.contentVersion !== text.contentVersion || review.language !== text.lang) reasons.push('Native review of the current target-language wording is required');
  }
  if (metadata?.provenance.kind === 'translation' && (!metadata.provenance.sourceTitle?.trim() || !metadata.provenance.sourceLanguage?.trim() || !metadata.provenance.translator?.trim())) reasons.push('Translation provenance needs original title, language and translator');
  if (metadata?.provenance.kind === 'adaptation' && (!metadata.provenance.sourceTextId?.trim() || metadata.provenance.sourceTextId === text.id || !metadata.provenance.adapter?.trim() || !metadata.provenance.description?.trim())) reasons.push('An adaptation must have a distinct text identity, source reference, adapter and description');
  const audio = metadata?.audio;
  return { published: reasons.length === 0, audioPublished: reasons.length === 0 && audio?.state === 'published' && audio.rightsCleared && !!audio.reviewedBy?.trim() && audio.contentVersion === text.contentVersion, reasons };
}

/** Counts chapters separately from works; candidates, personal copies, Scripture and held-out tests never fill gaps. */
export function stageAvailability(stage: Stage, works: readonly Work[], texts: readonly Text[], metadataByText: ReadonlyMap<string, CurriculumMetadata> = new Map(), accessible: (text: Text) => boolean = () => true, heldOutTextIds: ReadonlySet<string> = new Set()) {
  const stageWorks = new Map(works.filter(w => w.stageId === stage.id && w.lang === stage.lang && w.courseId === stage.courseId && w.role !== 'scripture' && w.role !== 'audio').map(w => [w.id, w]));
  const available = texts.filter(text => {
    const work = stageWorks.get(text.workId ?? '');
    const metadata = metadataByText.get(text.id) ?? text.curriculum;
    return !!work && text.lang === stage.lang && text.kind !== 'scripture' && text.kind !== 'testimony' && !text.personalCopy && !text.teamText && text.readingAssessmentId === undefined && text.listeningAssessmentId === undefined && !heldOutTextIds.has(text.id) && !['assessment', 'scripture', 'reference'].includes(metadata?.role ?? '') && accessible(text) && releaseDecision(work, text, metadata).published;
  });
  return { stageId: stage.id, lifecycle: available.length ? 'published' as const : 'candidate' as const, published: available.length > 0, textCount: available.length, workCount: new Set(available.map(t => t.workId)).size, textIds: available.map(t => t.id), reasons: available.length ? [] : ['No accessible published secular acquisition text in this stage'] };
}
export class StagePublicationError extends Error {
  readonly stageId: string;
  readonly reasons: string[];
  constructor(stageId: string, reasons: string[]) {
    super(`Stage ${stageId} cannot be declared published: ${reasons.join('; ')}`);
    this.name = 'StagePublicationError';
    this.stageId = stageId;
    this.reasons = [...reasons];
  }
}
/** A build/editor assertion for declarations of published stages. Documented gaps remain unpublished. */
export function assertPublishedStage(...args: Parameters<typeof stageAvailability>): ReturnType<typeof stageAvailability> {
  const availability = stageAvailability(...args);
  if (!availability.published) throw new StagePublicationError(args[0].id, availability.reasons);
  return availability;
}
