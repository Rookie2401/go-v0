/**
 * Learner controls over the deck: snooze, suspend, dismiss, resume. They never edit the deck. Each control becomes an
 * event (CardRemoved with reason 'snoozed' | 'suspended' | 'dismissed', or CardAdded to resume); the deck fold applies them,
 * so every device ends with the same deck and the history is never rewritten. A postponement is a CardRemoved{snoozed,
 * until} — it moves nothing in the schedule and fakes no review.
 */
import type { GoEvent } from '../../../repository-contract/src';
import { assertValidEvent, buildCardAdded, buildCardRemoved } from '../scheduler/deck';
import type { DeckItem } from '../types';

export interface Controls {
  snooze?: Array<{ itemId: string; until: string }>;
  suspend?: string[];
  dismiss?: string[];
  resume?: string[];
}

export interface ControlContext { learnerId: string; enrolmentId: string; deviceId: string; now: string; varietyId?: string }

export interface ControlResult {
  events: GoEvent[];
  /** Controls that were not applied, and why (an unknown item, a no-op, a snooze that ends in the past). */
  ignored: Array<{ itemId: string; control: 'snooze' | 'suspend' | 'dismiss' | 'resume'; why: string }>;
}

export function applyControls(deck: readonly DeckItem[], controls: Controls, ctx: ControlContext): ControlResult {
  const byId = new Map(deck.map((i) => [i.itemId, i] as const));
  const events: GoEvent[] = [];
  const ignored: ControlResult['ignored'] = [];
  const nowMs = Date.parse(ctx.now);
  // one event per item per call: a later control on the same item in the same call would share the dedupe key
  const touched = new Set<string>();

  const base = (item: DeckItem) => ({
    learnerId: ctx.learnerId, enrolmentId: ctx.enrolmentId, languageId: item.languageId,
    ...(item.varietyId !== undefined ? { varietyId: item.varietyId } : {}), at: ctx.now, deviceId: ctx.deviceId,
  });
  const take = (itemId: string, control: ControlResult['ignored'][number]['control']): DeckItem | undefined => {
    const item = byId.get(itemId);
    if (!item) { ignored.push({ itemId, control, why: 'not in the deck' }); return undefined; }
    if (touched.has(itemId)) { ignored.push({ itemId, control, why: 'another control on this item is already in this call' }); return undefined; }
    return item;
  };

  for (const { itemId, until } of controls.snooze ?? []) {
    const item = take(itemId, 'snooze');
    if (!item) continue;
    const t = Date.parse(until);
    if (Number.isNaN(t)) { ignored.push({ itemId, control: 'snooze', why: 'the snooze needs a valid ISO timestamp' }); continue; }
    if (t <= nowMs) { ignored.push({ itemId, control: 'snooze', why: 'the snooze would already be over' }); continue; }
    if (item.status === 'dismissed' || item.status === 'suspended') { ignored.push({ itemId, control: 'snooze', why: `the item is ${item.status}` }); continue; }
    touched.add(itemId);
    events.push(assertValidEvent(buildCardRemoved({ ...base(item), itemId, reason: 'snoozed', until })));
  }
  for (const itemId of controls.suspend ?? []) {
    const item = take(itemId, 'suspend');
    if (!item) continue;
    if (item.status === 'suspended' || item.status === 'dismissed') { ignored.push({ itemId, control: 'suspend', why: `the item is already ${item.status}` }); continue; }
    touched.add(itemId);
    events.push(assertValidEvent(buildCardRemoved({ ...base(item), itemId, reason: 'suspended' })));
  }
  for (const itemId of controls.dismiss ?? []) {
    const item = take(itemId, 'dismiss');
    if (!item) continue;
    if (item.status === 'dismissed') { ignored.push({ itemId, control: 'dismiss', why: 'the item is already dismissed' }); continue; }
    touched.add(itemId);
    events.push(assertValidEvent(buildCardRemoved({ ...base(item), itemId, reason: 'dismissed' })));
  }
  for (const itemId of controls.resume ?? []) {
    const item = take(itemId, 'resume');
    if (!item) continue;
    if (item.status === 'active') { ignored.push({ itemId, control: 'resume', why: 'the item is already active' }); continue; }
    touched.add(itemId);
    events.push(assertValidEvent(buildCardAdded({
      ...base(item), unitId: item.unitId, unitKind: item.unitKind, dimension: item.dimension, family: item.family,
      addedBy: 'learner', reason: 'resumed by the learner', itemId,
    })));
  }
  return { events, ignored };
}
