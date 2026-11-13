/**
 * Reading encounters → Repository events. The reader observes (a passage shown, a word selected, a gloss revealed…); this
 * module says what each observation IS in the shared contract's vocabulary and builds the events, deterministically:
 *
 *   passage-viewed        EncounterRecorded   one per verse; every form and lexeme of the verse; exposure only
 *   word-selected         SelectionLookedUp   the form, its lexeme (and its construction); a lookup (exposure, counted)
 *   definition-revealed   AssistanceRequested gloss            } exposure + assistance count; the engine never reads help as
 *   morphology-revealed   AssistanceRequested morphology       } recognition, and never as a failure either
 *   translation-revealed  AssistanceRequested translation, every unit of the verse
 *   context-explained     AssistanceRequested grammar, every unit of the verse
 *   passage-completed     UnderstoodMarked    one per verse; a weak self-report: reading recognition without help, assisted with
 *   word-marked           ItemMarked          the level the learner chose (decides the level), or a bookmark (no evidence)
 *
 * Idempotency: `dedupeKey` = `ecclesia:<kind>:<encounterId>[:<verse>[:<chunk>]]` and the event id is derived from it and the
 * identity, so the same encounter always yields the same events and the event log keeps one copy. Text never travels: a
 * `surface` is a single word (the text guard allows four), a verse is its coordinates, a passage its reference.
 *
 * The PERIOD of the text travels on every event as `varietyId` (and in `payload.language`): record a passage of Plato with
 * `profileForPeriod('el-att')`, a passage of Rashi with `profileForPeriod('he-med')`. A passage of a work that is not a book
 * of Scripture is a `WorkPassageRef`; its source reference is a plain one whose locator is the passage key.
 */
import { CONTRACT_VERSION, MAX_ITEM_IDS } from '../../repository-contract/src';
import type { AssistancePayload, EncounterPayload, GoEvent, ItemMarkPayload, LanguageEvidence, LookupPayload, UnderstoodPayload } from '../../repository-contract/src';
import { assertValidEvent } from '../../goreview/src/scheduler/deck';
import { fnv } from '../../goreview/src/exercises/shared';
import type {
  EcclesiaLanguageProfile, EcclesiaToken, EncounterMapping, EncounterSink, PassageRef, PassageVerse, ReaderIdentity, ReadingEncounter, ReadingEncounterKind,
} from './contract';
import { assertPassageRef, inPassage, normalizeWord, passageKey, sourceRefOf, unitIdsOf, verseKey } from './identity';

export const ECCLESIA_READER_ID = 'ecclesia';
export const ECCLESIA_PRODUCER_VERSION = 'goreview-ecclesia@1';
/** Events are filed under the reader app (as the Biblia reader files its own): a reader is not a review session. */
export const ECCLESIA_PRODUCER_APP = 'golearn-app' as const;

const ENCOUNTER_ID = /^\S{1,120}$/u;

export interface EncounterContext {
  profile: EcclesiaLanguageProfile;
  identity: ReaderIdentity;
  producerVersion?: string;
}

/** Every unit id a verse's tokens name, in token order, distinct, forms before lexemes per token; constructions are not exposures. */
export function verseUnitIds(profile: EcclesiaLanguageProfile, tokens: EcclesiaToken[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    const ids = unitIdsOf(profile, t);
    for (const id of [ids.form, ids.lexeme]) if (!seen.has(id)) { seen.add(id); out.push(id); }
  }
  return out;
}

const chunk = <T>(xs: T[], n: number): T[][] => { const out: T[][] = []; for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n)); return out; };

function languageOf(profile: EcclesiaLanguageProfile): LanguageEvidence {
  return {
    languageId: profile.repository.languageId, ...(profile.repository.varietyId ? { varietyId: profile.repository.varietyId } : {}),
    basis: 'book-metadata', confidence: 1, override: false, source: ECCLESIA_READER_ID,
  } as LanguageEvidence;
}

function envelope(ctx: EncounterContext, encounterKind: ReadingEncounterKind, kind: GoEvent['kind'], dedupeKey: string, at: string): Omit<GoEvent, 'subject' | 'payload'> {
  const { profile, identity } = ctx;
  return {
    id: `ev:ecclesia:${fnv(dedupeKey)}${fnv(`${identity.learnerId}|${identity.deviceId}|${dedupeKey}`)}`,
    v: CONTRACT_VERSION,
    learnerId: identity.learnerId,
    enrolmentId: identity.enrolmentId,
    languageId: profile.repository.languageId,
    ...(profile.repository.varietyId ? { varietyId: profile.repository.varietyId } : {}),
    at,
    producer: { app: ECCLESIA_PRODUCER_APP, version: ctx.producerVersion ?? ECCLESIA_PRODUCER_VERSION, deviceId: identity.deviceId, surface: `ecclesia:${encounterKind}` },
    kind,
    dedupeKey,
  };
}

function subjectOf(profile: EcclesiaLanguageProfile, ref: PassageRef, verse: number, itemIds: string[]): GoEvent['subject'] {
  return { itemIds, sentenceKey: verseKey(ref, verse), sourceRef: sourceRefOf(profile, ref, verse) };
}

function assertEncounter(e: ReadingEncounter): void {
  if (!ENCOUNTER_ID.test(e.encounterId)) throw new RangeError(`encounterId must be 1..120 non-space characters: ${JSON.stringify(e.encounterId)}`);
  if (Number.isNaN(Date.parse(e.at))) throw new RangeError(`not an ISO instant: ${e.at}`);
  assertPassageRef(e.passage);
  if ('verse' in e && !inPassage(e.passage, e.verse)) throw new RangeError(`verse ${e.verse} is outside ${passageKey(e.passage)}`);
}

/** Maps one encounter to its events (validated against the contract); pure and deterministic. */
export function mapEncounter(encounter: ReadingEncounter, ctx: EncounterContext): EncounterMapping {
  assertEncounter(encounter);
  const { profile } = ctx;
  const notes: string[] = [];
  const events: GoEvent[] = [];
  const key = (...parts: Array<string | number>): string => ['ecclesia', encounter.kind, encounter.encounterId, ...parts].join(':');
  const language = languageOf(profile);

  const perVerse = (verses: PassageVerse[], make: (verse: PassageVerse, ids: string[], dedupeKey: string) => GoEvent): void => {
    for (const v of verses) {
      if (!inPassage(encounter.passage, v.verse)) throw new RangeError(`verse ${v.verse} is outside the passage`);
      const ids = verseUnitIds(profile, v.tokens);
      if (!ids.length) { notes.push(`verse ${v.verse}: no tokens, nothing recorded`); continue; }
      const parts = chunk(ids, MAX_ITEM_IDS);
      parts.forEach((part, i) => events.push(make(v, part, parts.length > 1 ? key(v.verse, i) : key(v.verse))));
    }
  };

  switch (encounter.kind) {
    case 'passage-viewed': {
      perVerse(encounter.verses, (v, ids, dedupeKey) => {
        const payload: EncounterPayload = { contextKind: 'sentence', tokenCount: v.tokens.length, readerId: ECCLESIA_READER_ID, language };
        return { ...envelope(ctx, encounter.kind, 'EncounterRecorded', dedupeKey, encounter.at), subject: subjectOf(profile, encounter.passage, v.verse, ids), payload: payload as unknown as Record<string, unknown>, evidence: { quality: 'weak' } };
      });
      break;
    }
    case 'word-selected': {
      const ids = unitIdsOf(profile, encounter.token);
      const payload: LookupPayload = {
        surface: normalizeWord(profile.id, encounter.token.surface), tokenCount: 1, contextKind: 'sentence', contextConfidence: 1, readerId: ECCLESIA_READER_ID,
        helpShown: [], language,
      };
      events.push({
        ...envelope(ctx, encounter.kind, 'SelectionLookedUp', key(), encounter.at),
        subject: subjectOf(profile, encounter.passage, encounter.verse, [ids.form, ids.lexeme, ...(ids.morph ? [ids.morph] : [])]),
        payload: payload as unknown as Record<string, unknown>, evidence: { quality: 'weak' },
      });
      break;
    }
    case 'definition-revealed':
    case 'morphology-revealed': {
      const ids = unitIdsOf(profile, encounter.token);
      const morphology = encounter.kind === 'morphology-revealed';
      const payload: AssistancePayload = morphology
        ? { assistance: 'morphology', layer: 'parsing' }
        : { assistance: 'gloss', layer: 'definition', ...(encounter.depth ? { depth: encounter.depth } : {}) };
      const itemIds = morphology ? [ids.form, ...(ids.morph ? [ids.morph] : []), ids.lexeme] : [ids.lexeme, ids.form];
      events.push({
        ...envelope(ctx, encounter.kind, 'AssistanceRequested', key(), encounter.at),
        subject: subjectOf(profile, encounter.passage, encounter.verse, itemIds), payload: payload as unknown as Record<string, unknown>, evidence: { quality: 'weak', assisted: true },
      });
      break;
    }
    case 'translation-revealed':
    case 'context-explained': {
      const ids = verseUnitIds(profile, encounter.tokens);
      if (!ids.length) { notes.push('no tokens given for the verse, nothing recorded'); break; }
      const payload: AssistancePayload = encounter.kind === 'translation-revealed' ? { assistance: 'translation', layer: 'verse' } : { assistance: 'grammar', layer: 'context' };
      chunk(ids, MAX_ITEM_IDS).forEach((part, i, all) => events.push({
        ...envelope(ctx, encounter.kind, 'AssistanceRequested', all.length > 1 ? key(encounter.verse, i) : key(encounter.verse), encounter.at),
        subject: subjectOf(profile, encounter.passage, encounter.verse, part), payload: payload as unknown as Record<string, unknown>, evidence: { quality: 'weak', assisted: true },
      }));
      break;
    }
    case 'passage-completed': {
      perVerse(encounter.verses, (v, ids, dedupeKey) => {
        const payload: UnderstoodPayload = { scope: 'passage', helpUsed: encounter.helpUsed, tokenCount: v.tokens.length };
        return {
          ...envelope(ctx, encounter.kind, 'UnderstoodMarked', dedupeKey, encounter.at), subject: subjectOf(profile, encounter.passage, v.verse, ids),
          payload: payload as unknown as Record<string, unknown>,
          // a self-report over a whole passage: weak, and lower in reliability than a judged answer
          evidence: { quality: 'weak', assisted: encounter.helpUsed, sourceReliability: 0.6 },
        };
      });
      break;
    }
    case 'word-marked': {
      const ids = unitIdsOf(profile, encounter.token);
      const payload: ItemMarkPayload = { mark: encounter.mark };
      if (encounter.mark === 'saved' || encounter.mark === 'ignore') notes.push(`a ${encounter.mark} mark is a bookmark, not evidence of knowledge (intake reads it)`);
      events.push({
        ...envelope(ctx, encounter.kind, 'ItemMarked', key(), encounter.at),
        subject: subjectOf(profile, encounter.passage, encounter.verse, [ids.lexeme, ids.form]), payload: payload as unknown as Record<string, unknown>,
      });
      break;
    }
  }
  for (const e of events) assertValidEvent(e);
  return { encounterId: encounter.encounterId, kind: encounter.kind, events, notes };
}

export function mapEncounters(encounters: readonly ReadingEncounter[], ctx: EncounterContext): EncounterMapping[] {
  return encounters.map((e) => mapEncounter(e, ctx));
}

/** Maps and records, in one batch per call; returns what was mapped so the caller can show it. */
export async function recordEncounters(encounters: readonly ReadingEncounter[], ctx: EncounterContext, sink: EncounterSink): Promise<EncounterMapping[]> {
  const mapped = mapEncounters(encounters, ctx);
  const events = mapped.flatMap((m) => m.events);
  if (events.length) await sink.record(events);
  return mapped;
}

/** The events of a learner in a language, as the deck fold and the projection want them (other learners and languages dropped). */
export function scopedEvents(events: readonly GoEvent[], scope: { learnerId: string; languageId: string }): GoEvent[] {
  return events.filter((e) => e.learnerId === scope.learnerId && e.languageId === scope.languageId);
}
