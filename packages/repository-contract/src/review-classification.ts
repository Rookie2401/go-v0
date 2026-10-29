import type { GoEvent } from './index';

const REVIEW_KINDS = new Set(['CardReviewed', 'AssessmentAnswered', 'ListeningAssessed']);
export const isValidReviewClaim = (e: GoEvent): boolean => REVIEW_KINDS.has(e.kind) && !!e.id && Number.isFinite(Date.parse(e.at))
  && !!e.learnerId && !!e.languageId
  && !['invalid-question','ambiguous','unable-to-grade'].includes(String(e.payload.outcome))
  && e.payload.challenged !== true && e.payload.audioFailed !== true && e.payload.retrievalAttempted !== false;
const rating = (e: GoEvent): unknown => e.payload.rating;
const rated = (e: GoEvent): boolean => isValidReviewClaim(e) && Number.isInteger(rating(e)) && Number(rating(e)) >= 1 && Number(rating(e)) <= 4
  && e.payload.hinted !== true && e.payload.answerShownBefore !== true && e.payload.transcriptShownBefore !== true
  && e.evidence?.assisted !== true && e.evidence?.quality !== 'none';
const parentOf = (e: GoEvent): string | null => typeof e.payload.expectedPreviousReviewId === 'string' ? e.payload.expectedPreviousReviewId : null;
const compare = (a: GoEvent, b: GoEvent): number => Date.parse(a.at) - Date.parse(b.at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const sameScope = (a: GoEvent, b: GoEvent): boolean => a.learnerId === b.learnerId && a.languageId === b.languageId && a.subject?.cardId === b.subject?.cardId;
const scopeOf = (e: GoEvent): string => `${e.learnerId}\u0000${e.languageId}\u0000${e.subject?.cardId ?? ''}`;

/**
 * Shared causal classification for FSRS and Repository evidence. For events that carry
 * expectedPreviousReviewId, only a fully resolved causal branch can advance scheduling.
 * Only a sibling on a distinct, named device strictly less than 24 hours after the deterministic winner
 * may provide evidence. Same-device later siblings, siblings outside that window, and all
 * sibling descendants are excluded as stale state claims. The earliest timestamp then ID
 * advances FSRS. This bounded concurrent evidence is not a spacing guarantee; level promotion
 * must use its own delayed-evidence gate.
 *
 * Events without the field are legacy sequential history and retain prior behavior. Raw
 * events are never removed; callers use these sets only for projections.
 */
export interface ReviewClassification {
  effectiveIds: Set<string>;
  independentSiblingIds: Set<string>;
  excludedReasons: Map<string, string>;
  rebasedNotes: Map<string, string>;
  resolvedParents: Map<string, string | null>;
}

export function classifyReviewEvents(events: readonly GoEvent[], retracted: ReadonlySet<string> = new Set(), conflictingIds: ReadonlySet<string> = new Set()): ReviewClassification {
  const all = new Map(events.filter(e => REVIEW_KINDS.has(e.kind) && rated(e)).map(e => [e.id, e]));
  const rows = [...all.values()].filter(e => e.payload.expectedPreviousReviewId !== undefined);
  const nodes = new Map(rows.map(e => [e.id, e]));
  const legacyByScope = new Map<string, GoEvent[]>();
  for (const e of all.values()) if (e.payload.expectedPreviousReviewId === undefined) {
    const list = legacyByScope.get(scopeOf(e)) ?? []; list.push(e); legacyByScope.set(scopeOf(e), list);
  }
  for (const list of legacyByScope.values()) list.sort(compare);
  const latestLegacyBefore = (scope: string, event: GoEvent): GoEvent | undefined => {
    const list = legacyByScope.get(scope) ?? []; let lo = 0, hi = list.length - 1, result: GoEvent | undefined;
    while (lo <= hi) { const mid = (lo + hi) >>> 1; if (compare(list[mid]!, event) < 0) { result = list[mid]; lo = mid + 1; } else hi = mid - 1; }
    return result;
  };
  const effectiveIds = new Set<string>(), independentSiblingIds = new Set<string>();
  const excludedReasons = new Map<string, string>(), rebasedNotes = new Map<string, string>(), resolvedParents = new Map<string, string | null>();
  const groups = new Map<string, GoEvent[]>();
  for (const e of rows) {
    const raw = e.payload.expectedPreviousReviewId;
    if (raw !== null && (typeof raw !== 'string' || !raw)) { excludedReasons.set(e.id, 'malformed expectedPreviousReviewId'); continue; }
    if (!e.subject?.cardId) { excludedReasons.set(e.id, 'causal review is missing its card scope'); continue; }
    let parent = parentOf(e); const original = parent, seen = new Set<string>([e.id]);
    const referenced = parent ? all.get(parent) : undefined;
    if (referenced && !sameScope(e, referenced)) { excludedReasons.set(e.id, 'expected predecessor belongs to a different learner, language or card'); continue; }
    if (parent && !referenced && !conflictingIds.has(parent)) { resolvedParents.set(e.id, parent); excludedReasons.set(e.id, 'unknown expectedPreviousReviewId ' + parent); continue; }
    while (parent && retracted.has(parent) && !seen.has(parent)) { seen.add(parent); const prior = all.get(parent); parent = prior ? parentOf(prior) : null; }
    if (parent && seen.has(parent)) { excludedReasons.set(e.id, 'causal predecessor cycle'); continue; }
    resolvedParents.set(e.id, parent);
    if (parent !== original) rebasedNotes.set(e.id, 'retracted predecessor rebased to ' + (parent ?? 'root'));
    if (retracted.has(e.id)) { excludedReasons.set(e.id, 'review was retracted'); continue; }
    if (conflictingIds.has(e.id)) { excludedReasons.set(e.id, 'conflicting duplicate event ID'); continue; }
    const key = `${scopeOf(e)}\u0000${parent ?? ''}`, group = groups.get(key) ?? []; group.push(e); groups.set(key, group);
  }
  // Detect cycles once in the functional parent graph (linear time, iterative to avoid deep-stack failures).
  const state = new Map<string, 0 | 1 | 2>(), cycles = new Set<string>();
  for (const e of rows) {
    if (state.get(e.id) === 2 || excludedReasons.has(e.id)) continue;
    const path: string[] = [], position = new Map<string, number>(); let cursor: string | null = e.id;
    while (cursor && nodes.has(cursor) && !excludedReasons.has(cursor)) {
      if (state.get(cursor) === 2) break;
      if (position.has(cursor)) { for (const id of path.slice(position.get(cursor)!)) cycles.add(id); break; }
      position.set(cursor, path.length); path.push(cursor); state.set(cursor, 1); cursor = resolvedParents.get(cursor) ?? null;
    }
    for (const id of path) state.set(id, 2);
  }
  for (const id of cycles) excludedReasons.set(id, 'causal predecessor cycle');
  for (const [key, group] of groups) groups.set(key, group.filter(e => !cycles.has(e.id)));
  for (const group of groups.values()) group.sort(compare);
  const done = new Set<string>();
  const process = (startScope: string, startParent: string | null, startInherited?: string): void => {
    const queue: Array<{ scope: string; parent: string | null; inherited?: string }> = [{ scope: startScope, parent: startParent, inherited: startInherited }];
    while (queue.length) {
      const task = queue.pop()!, { scope, parent, inherited } = task;
      const key = `${scope}\u0000${parent ?? ''}`; if (done.has(key)) continue; done.add(key);
      const siblings = groups.get(key) ?? [];
      if (inherited || (parent !== null && (!all.has(parent) || conflictingIds.has(parent)))) {
        // Keep the first exclusion cause as a bounded root explanation. Re-prepending
        // this message at every descendant makes diagnostics quadratic on long offline
        // sibling branches, while the resolvedParents map already preserves ancestry.
        const inheritedPrefix = 'causal predecessor excluded: ';
        const reason = inherited
          ? inherited.startsWith(inheritedPrefix) ? inherited : inheritedPrefix + inherited
          : conflictingIds.has(parent!) ? 'causal predecessor has conflicting duplicate event ID' : 'unknown expectedPreviousReviewId ' + parent;
        for (const e of siblings) { excludedReasons.set(e.id, reason); queue.push({ scope, parent: e.id, inherited: reason }); }
        continue;
      }
      const previous = parent ? all.get(parent) : undefined;
      const valid: GoEvent[] = [];
      for (const e of siblings) {
        const legacyHead = latestLegacyBefore(scope, e);
        const parentOlderThanHead = !!legacyHead && (!previous || compare(previous, legacyHead) < 0);
        if (parentOlderThanHead) {
          const device = e.producer?.deviceId, headDevice = legacyHead!.producer?.deviceId;
          const age = Date.parse(e.at) - Date.parse(legacyHead!.at);
          const reason = `stale predecessor: latest legacy review is ${legacyHead!.id}`;
          if (device && headDevice && device !== headDevice && age >= 0 && age <= 24 * 60 * 60_000) {
            excludedReasons.set(e.id, reason); independentSiblingIds.add(e.id);
          } else excludedReasons.set(e.id, !device || !headDevice ? 'stale predecessor lacks distinct device identity from legacy head' : device === headDevice ? 'stale same-device predecessor after legacy head ' + legacyHead!.id : 'stale predecessor outside 24-hour concurrency window after ' + legacyHead!.id);
          queue.push({ scope, parent: e.id, inherited: excludedReasons.get(e.id) });
        } else if (previous && Date.parse(e.at) < Date.parse(previous.at)) {
          const reason = 'causal timestamp precedes predecessor ' + previous.id; excludedReasons.set(e.id, reason); queue.push({ scope, parent: e.id, inherited: reason });
        } else valid.push(e);
      }
      if (!valid.length) continue;
      const winner = valid[0], winnerDevice = winner.producer?.deviceId;
      effectiveIds.add(winner.id);
      for (const e of valid.slice(1)) {
        const delta = Date.parse(e.at) - Date.parse(winner.at), device = e.producer?.deviceId;
        if (winnerDevice && device && winnerDevice !== device && delta >= 0 && delta < 24 * 60 * 60_000) {
          excludedReasons.set(e.id, 'concurrent sibling; canonical event is ' + winner.id); independentSiblingIds.add(e.id);
        } else excludedReasons.set(e.id, !winnerDevice || !device ? 'concurrent sibling lacks distinct device identity' : winnerDevice === device ? 'stale same-device sibling; canonical event is ' + winner.id : 'sibling outside 24-hour concurrency window');
        queue.push({ scope, parent: e.id, inherited: excludedReasons.get(e.id) });
      }
      queue.push({ scope, parent: winner.id });
    }
  };
  for (const e of rows) if (resolvedParents.get(e.id) === null && !cycles.has(e.id)) process(scopeOf(e), null);
  for (const e of rows) {
    const p = resolvedParents.get(e.id);
    if (p && !nodes.has(p) && !retracted.has(p) && (conflictingIds.has(p) || all.has(p))) process(scopeOf(e), p);
  }
  for (const e of rows) if (!effectiveIds.has(e.id) && !independentSiblingIds.has(e.id) && !excludedReasons.has(e.id)) excludedReasons.set(e.id, 'causal predecessor chain is unresolved');
  return { effectiveIds, independentSiblingIds, excludedReasons, rebasedNotes, resolvedParents };
}
