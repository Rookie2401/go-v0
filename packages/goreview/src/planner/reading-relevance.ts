import { sourceLocator, type GoEvent, type SourceRef, type UnitKnowledge } from '../../../repository-contract/src';

export interface ReadingRelevance {
  readingRelevance: number;
  recentExposure: number;
  recentContexts: number;
  recentSources: number;
}

const EMPTY: ReadingRelevance = Object.freeze({ readingRelevance: 0, recentExposure: 0, recentContexts: 0, recentSources: 0 });
const CONTEXT_KINDS = new Set(['EncounterRecorded', 'SelectionLookedUp']);
const DAY = 86_400_000;

function sourceKey(ref: SourceRef | undefined): string | undefined {
  if (!ref) return undefined;
  // This key lives only during one ranking/planning snapshot. It is never returned or persisted.
  const locator = sourceLocator(ref) ?? ('title' in ref && typeof ref.title === 'string' ? ref.title : 'identified-source');
  return `${ref.kind}:${locator}`;
}

function bibliaReference(event: GoEvent, payload: Record<string, unknown>): string | undefined {
  if (event.producer.surface !== 'biblia-reading') return undefined;
  const language = payload.language as { basis?: unknown; confidence?: unknown; source?: unknown } | undefined;
  if (language?.basis !== 'override' || language.confidence !== 1 || typeof language.source !== 'string') return undefined;
  // Biblia uses OSIS book names such as Exod, Matt and 1Thess as well as Gen.
  const match = language.source.match(/^biblia:((?:[1-3]?[A-Za-z]{2,12})\.\d+\.\d+)$/);
  return match ? `biblia:${match[1].toUpperCase()}` : undefined;
}

/**
 * Builds one bounded index for a selection/planning snapshot. It looks only at recent sentence
 * encounters and lookups with an identified source. It returns no source metadata or text.
 * Duplicate event ids with conflicting shapes are ignored.
 * Scope: this app receives exact unit ids and the current knowledge projection, but not the
 * Repository's source tombstones or certain-alias table. Signals therefore never cross IDs;
 * absent/stale knowledge gives no relevance. Source-deletion filtering remains a Repository
 * data-loading responsibility and is not claimed by this local ranking helper.
 */
export function indexReadingRelevance(events: readonly GoEvent[], languageId: string, now: string,
  authoritativeKnowledge: ReadonlyMap<string, Pick<UnitKnowledge, 'encounters' | 'lastSeenAt'>> = new Map()): ReadonlyMap<string, ReadingRelevance> {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) return new Map();
  const byId = new Map<string, { shape: string; event: GoEvent }>();
  const conflicting = new Set<string>();
  for (const event of events) {
    if (!CONTEXT_KINDS.has(event.kind) || event.correctionOf !== undefined) continue;
    const payload = event.payload as Record<string, unknown>;
    const language = payload.language as { basis?: unknown; confidence?: unknown; source?: unknown } | undefined;
    const shape = JSON.stringify([event.kind, event.languageId, event.at, [...new Set(event.subject?.itemIds ?? [])].sort(),
      event.subject?.sentenceKey, sourceKey(event.subject?.sourceRef) ?? bibliaReference(event, payload), event.producer.surface,
      payload.contextKind, payload.contextConfidence, payload.unconfirmed, language?.basis, language?.confidence, language?.source]);
    const current = byId.get(event.id);
    if (!current) byId.set(event.id, { shape, event });
    else if (current.shape !== shape) conflicting.add(event.id);
  }

  const rowsByUnit = new Map<string, Array<{ at: number; context: string; source?: string }>>();
  for (const [id, { event }] of byId) {
    if (conflicting.has(id) || event.languageId !== languageId) continue;
    const at = Date.parse(event.at);
    if (!Number.isFinite(at) || at > nowMs || nowMs - at > 30 * DAY) continue;
    const payload = event.payload as Record<string, unknown>;
    if (payload.contextKind !== 'sentence') continue;
    const ref = event.subject?.sourceRef;
    if (event.kind === 'SelectionLookedUp' && (payload.unconfirmed === true || typeof payload.contextConfidence !== 'number' || payload.contextConfidence < 0.7)) continue;
    const language = payload.language as { basis?: unknown; confidence?: unknown } | undefined;
    if (language && (language.basis === 'undetermined' || language.basis === 'team-default'
      || (typeof language.confidence === 'number' && language.confidence < 0.7))) continue;
    const bibleSource = bibliaReference(event, payload);
    const identifiedSource = sourceKey(ref) ?? bibleSource;
    const sentenceKey = event.subject?.sentenceKey;
    if (!identifiedSource && !sentenceKey) continue;
    const context = bibleSource && !sentenceKey
      ? bibleSource
      : identifiedSource
        ? `${identifiedSource}:sentence:${sentenceKey ?? id}`
      : `anonymous-sentence:${sentenceKey}`;
    for (const unitId of new Set(event.subject.itemIds ?? [])) {
      const projected = authoritativeKnowledge.get(unitId);
      if (!projected || projected.encounters <= 0) continue;
      const projectedAt = projected.lastSeenAt ? Date.parse(projected.lastSeenAt) : undefined;
      if (projectedAt !== undefined && Number.isFinite(projectedAt) && at > projectedAt) continue;
      const rows = rowsByUnit.get(unitId) ?? [];
      rows.push({ at, source: identifiedSource, context });
      rowsByUnit.set(unitId, rows);
    }
  }

  const out = new Map<string, ReadingRelevance>();
  for (const [unitId, rows] of rowsByUnit) {
    const projected = authoritativeKnowledge.get(unitId)!;
    // The projection's encounter count bounds how much event-derived evidence this snapshot may use.
    const capped = rows.sort((a, b) => b.at - a.at).slice(0, Math.max(0, Math.floor(projected.encounters)));
    if (!capped.length) continue;
    const contexts = new Set(capped.map(row => row.context));
    const sources = new Set(capped.flatMap(row => row.source ? [row.source] : []));
    const recentExposure = capped.filter(row => nowMs - row.at <= 3 * DAY).length;
    out.set(unitId, {
      readingRelevance: Math.min(1, contexts.size / 3),
      recentExposure: Math.min(1, recentExposure / 3),
      recentContexts: contexts.size,
      recentSources: sources.size,
    });
  }
  return out;
}

export function readingRelevanceFromIndex(index: ReadonlyMap<string, ReadingRelevance>, unitId: string): ReadingRelevance {
  return index.get(unitId) ?? EMPTY;
}

/** Convenience wrapper for one-off callers and tests; batch paths should build an index once. */
export function readingRelevanceForUnit(events: readonly GoEvent[], unitId: string, languageId: string, now: string,
  authoritativeKnowledge: ReadonlyMap<string, Pick<UnitKnowledge, 'encounters' | 'lastSeenAt'>> = new Map()): ReadingRelevance {
  return readingRelevanceFromIndex(indexReadingRelevance(events, languageId, now, authoritativeKnowledge), unitId);
}
