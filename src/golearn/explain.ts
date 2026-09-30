/** explainItem — every number a learner sees must be explainable in one plain sentence. */
import { itemKindOf } from '../core';
import type { ItemExplanation, LanguageCode } from '../core';
import { excludedListens } from './audit';
import { sentenceItems } from './items';
import { queryItems } from './queries';
import type { Ctx, StoredEncounter } from './state';

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export async function explainItem(ctx: Ctx, userId: string, itemId: string): Promise<ItemExplanation> {
  itemKindOf(itemId); // throws for an unknown id shape
  const lang = itemId.split(':')[1] as LanguageCode;
  const [k] = await queryItems(ctx, userId, [{ itemId, lang }]);
  const row = await ctx.store.learnerItems.get(`${userId}|${itemId}`);

  const encs = ((await ctx.store.encounters.where('itemId', itemId)) as StoredEncounter[])
    .filter((e) => e.userId === userId && (e.modality === 'reading' || e.modality === 'listening'));
  const byText = new Map<string, number>();
  for (const e of encs) byText.set(e.textId, (byText.get(e.textId) ?? 0) + 1);
  const texts: ItemExplanation['texts'] = [];
  for (const [textId, count] of byText) texts.push({ textId, title: (await ctx.store.texts.get(textId))?.title ?? textId, count });
  texts.sort((a, b) => b.count - a.count || (a.textId < b.textId ? -1 : 1));

  let excludedEvents = 0;
  for (const { event } of await excludedListens(ctx, userId)) {
    for (const sid of event.sentenceIds) {
      const info = await sentenceItems(ctx, sid);
      if (info?.items.has(itemId)) { excludedEvents += 1; break; }
    }
  }

  const prod = k.productionEvidence;
  const produced = prod.independent + prod.selfRepaired + prod.assisted + prod.copied;
  const parts: string[] = [];
  if (k.encounterCount > 0) {
    parts.push(`Met ${times(k.encounterCount)} in ${plural(texts.length, 'text')}`);
    if (k.assistedCount > 0) parts.push(`needed help ${times(k.assistedCount)}`);
    if (k.demonstratedCount > 0) parts.push(`understood without help ${times(k.demonstratedCount)}`);
  }
  if (produced > 0) {
    const how: string[] = [];
    if (prod.independent) how.push(`${prod.independent} on your own`);
    if (prod.selfRepaired) how.push(`${prod.selfRepaired} after fixing it yourself`);
    if (prod.assisted) how.push(`${prod.assisted} with help`);
    if (prod.copied) how.push(`${prod.copied} copied`);
    parts.push(`used in your own writing or speech ${times(produced)} (${how.join(', ')})`);
  }
  let summary = parts.length > 0 ? `${parts.join('; ')}.` : 'Not met yet.';
  if (k.reading.estimatedFamiliar) summary += ' Likely familiar (an estimate from repeated help-free exposure, not a demonstration).';
  if (row?.manualMark === 'known') summary += ' You marked it known.';
  else if (row?.manualMark === 'unknown') summary += ' You marked it unknown.';
  if (excludedEvents > 0) summary += ` ${plural(excludedEvents, 'audio play')} ignored because the audio was not reviewed real speech.`;

  return {
    itemId, summary, exposures: k.exposureCount, assisted: k.assistedCount, demonstrated: k.demonstratedCount,
    productions: { ...prod }, excludedEvents, texts,
  };
}
