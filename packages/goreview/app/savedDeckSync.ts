/** Explicit saved-collection operations share the existing preference-event stream.
 * Legacy local collections are exported only through Sync saved decks.
 */
import { CONTRACT_VERSION, validateEvent } from '../../repository-contract/src';
import { ASSESSMENT_DIMENSIONS, EXERCISE_FAMILIES, FAMILY_DIMENSION } from '../src/types';
import type { AppContext } from './context';
import type { SavedDeck } from './deckModel';
import { unitLabel } from './format';
const PREFIX = 'goreview.savedDeck:';
export async function recordSavedDeckChange(ctx: AppContext, action: 'save' | 'remove', deck: SavedDeck): Promise<void> {
  const identity = await ctx.eventContext();
  if (!identity) throw new Error('Choose a language first.');
  const value = action === 'save' ? { action, id: deck.id, savedAt: deck.savedAt, languageId: deck.languageId,
    ...(deck.varietyId ? { varietyId: deck.varietyId } : {}),
    items: deck.items.map(({ itemId, unitId, unitKind, dimension, family }) => ({ itemId, unitId, unitKind, dimension, family })) }
    : { action, id: deck.id };
  const event = { id: 'saved-deck:' + ctx.deps.newId(), v: CONTRACT_VERSION, learnerId: identity.learnerId,
    enrolmentId: identity.enrolmentId, languageId: identity.languageId, at: identity.now,
    producer: { app: 'gopractice-review' as const, version: identity.appVersion, deviceId: identity.deviceId, surface: 'saved-decks' },
    kind: 'PreferenceChanged' as const, subject: {}, payload: { key: PREFIX + deck.id, value, origin: 'explicit' as const },
    evidence: { quality: 'none' as const } };
  const issues = validateEvent(event);
  if (issues.length) throw new Error('The saved deck cannot be synchronized: ' + issues.map(i => i.message).join('; '));
  const result = await ctx.record([event]);
  if (result.refused.length) throw new Error(result.refused[0].issues.join('; '));
}
export async function sharedSavedDecks(ctx: AppContext, learnerId: string, languageId: string, local: SavedDeck[]): Promise<SavedDeck[]> {
  const merged = new Map(local.map(d => [d.id, d]));
  const events = (await ctx.events(languageId)).filter(e => e.learnerId === learnerId && e.languageId === languageId
    && e.kind === 'PreferenceChanged' && typeof e.payload.key === 'string' && e.payload.key.startsWith(PREFIX))
    .sort((a,b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));
  for (const event of events) {
    const value = event.payload.value as { action?: string; id?: string; languageId?: string; varietyId?: string; savedAt?: string; items?: SavedDeck['items'] } | undefined;
    if (!value || typeof value.id !== 'string' || event.payload.key !== PREFIX + value.id) continue;
    if (value.action === 'remove') { merged.delete(value.id); continue; }
    if (value.action !== 'save' || value.languageId !== languageId || typeof value.savedAt !== 'string' || !Number.isFinite(Date.parse(value.savedAt)) || !Array.isArray(value.items) || value.items.length > 60) continue;
    const items = value.items.filter(i => i && typeof i.itemId === 'string' && typeof i.unitId === 'string' && typeof i.unitKind === 'string'
      && (ASSESSMENT_DIMENSIONS as readonly string[]).includes(i.dimension) && (EXERCISE_FAMILIES as readonly string[]).includes(i.family) && FAMILY_DIMENSION[i.family] === i.dimension)
      .map(i => ({ ...i, label: unitLabel(i.unitId) }));
    if (items.length) merged.set(value.id, { id: value.id, savedAt: value.savedAt, languageId, ...(typeof value.varietyId === 'string' ? { varietyId: value.varietyId } : {}), items });
  }
  return [...merged.values()].sort((a,b) => Date.parse(b.savedAt) - Date.parse(a.savedAt) || a.id.localeCompare(b.id));
}
