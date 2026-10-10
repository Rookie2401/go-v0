/** Builders for the store tests: valid events and rows of every table. */
import { CONTRACT_VERSION, DIMENSIONS } from '../../../packages/repository-contract/src';
import type {
  Account, AssistancePreferences, Device, Enrolment, FormAnalysis, GoEvent, LanguagePackInfo, LinguisticUnit, PrivateDocument, Session, Tombstone,
  UnitAlias, UnitKnowledge, UnitRelation,
} from '../../../packages/repository-contract/src';

export const L1 = 'learner-1';
export const L2 = 'learner-2';

export function ev(id: string, o: Partial<GoEvent> = {}): GoEvent {
  return {
    id, v: CONTRACT_VERSION, learnerId: L1, enrolmentId: 'en-1', languageId: 'sq', at: '2026-10-08T10:00:00.000Z',
    producer: { app: 'golearn-ext', version: '0.0.1', deviceId: 'dev-1' }, kind: 'SelectionLookedUp',
    subject: { itemIds: ['lemma:sq:shtëpi:NOUN'], sentenceKey: 'ab12', sourceRef: { kind: 'demo' } },
    payload: { surface: 'shtëpinë', tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId: 'demo', helpShown: ['lemma'] },
    ...o,
  };
}

export const encounter = (id: string, o: Partial<GoEvent> = {}): GoEvent => ev(id, { kind: 'EncounterRecorded', payload: { contextKind: 'sentence' }, ...o });

const prov = { source: 'dictionary', ref: 'pack:sq:1', confidence: 0.9 } as const;

export const unit = (unitId: string, status: LinguisticUnit['status'] = 'provisional', o: Partial<LinguisticUnit> = {}): LinguisticUnit => ({
  unitId, kind: 'lexeme', languageId: 'sq', label: unitId.split(':')[2] ?? unitId, packId: 'pack-sq', packVersion: '1', provenance: prov, status, createdAt: '2026-10-01T00:00:00.000Z', ...o,
});

export const relation = (fromId: string, to: string, status: UnitRelation['status'] = 'provisional', rel: UnitRelation['relation'] = 'form-of'): UnitRelation => ({
  fromId, relation: rel, toId: to, confidence: 0.8, provenance: prov, status,
});

export const analysis = (analysisId: string, o: Partial<FormAnalysis> = {}): FormAnalysis => ({
  analysisId, formId: 'form:sq:librin', languageId: 'sq', sentenceKey: 's1', candidates: [{ lexemeId: 'lemma:sq:libër:NOUN', confidence: 0.9, provenance: prov }],
  chosen: 0, status: 'provisional', analyzerId: 'rule-sq', packId: 'pack-sq', packVersion: '1', createdAt: '2026-10-01T00:00:00.000Z', ...o,
});

export const alias = (oldId: string, newId: string, packVersion = '2'): UnitAlias => ({ oldId, newId, packVersion, reason: 'corrected identity', confidence: 0.9, createdAt: '2026-10-02T00:00:00.000Z', mapping: 'certain' });

export const pack = (packId: string, version: string, languageId = 'sq'): LanguagePackInfo => ({
  packId, languageId, version, analyzerId: 'rule-sq', coverage: { lexemes: 10, notes: ['test'] }, licences: [{ resource: 'test', licence: 'CC0' }], reviewStatus: 'machine-drafted',
});

const est = { score: 0.5, confidence: 0.5, observations: 2, positive: 1, negative: 1, weight: 1.5, contexts: 1 };
export const knowledgeRow = (learnerId: string, unitId: string, modelVersion = 'm1'): UnitKnowledge => ({
  learnerId, unitId, languageId: 'sq',
  dimensions: Object.fromEntries(DIMENSIONS.map((d) => [d, est])) as UnitKnowledge['dimensions'],
  retention: { estimate: 0.5, halfLifeDays: 3, basedOn: 'readingRecognition' }, level: 'seen', encounters: 1, uncertainty: 0.5, modelVersion, basis: { events: 2, lastEventId: 'e2' },
});

const pref = <T>(value: T) => ({ value, origin: 'default' as const });
export const preferences = (learnerId: string, languageId?: string): AssistancePreferences => ({
  learnerId, ...(languageId ? { languageId } : {}),
  explanationDepth: pref('brief'), terminology: pref('plain'), transliteration: pref('on-request'), pronunciationFirst: pref(false),
  translationAvailable: pref(true), visualAssistance: pref('standard'), accessibility: pref([]), updatedAt: '2026-10-03T00:00:00.000Z',
});

export const doc = (learnerId: string, docId: string, body: string, o: Partial<PrivateDocument> = {}): PrivateDocument => ({
  docId, learnerId, languageId: 'sq', kind: 'draft', title: 'A draft', body, revision: 0, deviceId: 'dev-1', updatedAt: '2026-10-04T00:00:00.000Z', ...o,
});

export const account = (accountId: string, learnerId: string, email: string): Account & { passwordHash: string } => ({
  accountId, learnerId, email, createdAt: '2026-10-01T00:00:00.000Z', passwordHash: 'pbkdf2$hash',
});
export const session = (sessionId: string, learnerId: string, tokenHash: string): Session & { tokenHash: string } => ({
  sessionId, accountId: 'acc-1', learnerId, deviceId: 'dev-1', createdAt: '2026-10-01T00:00:00.000Z', expiresAt: '2026-11-01T00:00:00.000Z', tokenHash,
});
export const device = (learnerId: string, deviceId: string): Device => ({ deviceId, learnerId, platform: 'test', registeredAt: '2026-10-01T00:00:00.000Z' });
export const enrolment = (enrolmentId: string, learnerId: string, o: Partial<Enrolment> = {}): Enrolment => ({
  enrolmentId, learnerId, languageId: 'sq', packId: 'pack-sq', packVersion: '1', goals: [{ kind: 'reading', priority: 1 }, { kind: 'scripture' }], startedAt: '2026-10-01T00:00:00.000Z', ...o,
});
export const tombstone = (tombstoneId: string, learnerId: string, scope: Tombstone['scope'], createdAt = '2026-10-09T00:00:00.000Z'): Tombstone => ({ tombstoneId, learnerId, scope, createdAt, reason: 'test' });
