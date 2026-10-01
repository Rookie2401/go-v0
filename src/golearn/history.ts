/**
 * itemHistory — the learner's whole history with one item, across every text and surface, in plain words.
 * Reads the encounters (reading + listening define "met") and the item's dimension states; writes nothing.
 *
 * Reading / listening / production are plain labels from the existing dimension states (policy.ts levels, the estimate
 * and the production evidence); "pronunciation" is always 'not measured' — nothing in Go measures how he says a word.
 * The wording follows explain.ts ("Met 23 times in 4 texts", "needed help", "likely familiar (an estimate)").
 */
import { itemKindOf } from '../core';
import type { DimensionState, ItemHistory, ItemKnowledge, Text } from '../core';
import { totalsOf } from './agg';
import type { StoredItem } from './agg';
import { queryItems } from './queries';
import type { Ctx, StoredEncounter } from './state';
import { byAtThenId, itemHelpOf } from './state';
import { cmp, plural, times } from './util';

function receptiveLabel(d: DimensionState, met: number, verb: string, neverMet: string): string {
  if (met === 0) return neverMet;
  if (d.level === 'recognized' || d.level === 'rapid') return `shown understood (you reported understanding it without help)`;
  if (d.estimatedFamiliar) return 'likely familiar (an estimate)';
  if (d.level === 'recognized_with_help') return `${verb} with help`;
  return `${verb}, not yet shown understood`;
}

function productionLabel(k: ItemKnowledge): string {
  const p = k.productionEvidence;
  const n = p.independent + p.selfRepaired + p.assisted + p.copied;
  if (n === 0) return 'not used in your own writing yet';
  const how: string[] = [];
  if (p.independent) how.push(`${p.independent} on your own`);
  if (p.selfRepaired) how.push(`${p.selfRepaired} after fixing it yourself`);
  if (p.assisted) how.push(`${p.assisted} with help`);
  if (p.copied) how.push(`${p.copied} copied`);
  const where = k.writing.level !== 'unseen' && k.speaking.level === 'unseen' ? 'writing' : k.writing.level === 'unseen' && k.speaking.level !== 'unseen' ? 'speech' : 'writing or speech';
  return `used in your own ${where} ${times(n)} (${how.join(', ')})`;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export async function itemHistory(ctx: Ctx, userId: string, itemId: string): Promise<ItemHistory> {
  const itemKind = itemKindOf(itemId); // throws for an unknown id shape
  const lang = itemId.split(':')[1] as import('../core').LanguageCode;
  const [k] = await queryItems(ctx, userId, [{ itemId, lang }]);

  // A writing-system item has no encounter rows: its history is its aggregate. Every other item is read from its encounters.
  const row = (await ctx.store.learnerItems.get(`${userId}|${itemId}`)) as StoredItem | undefined;
  const encs = itemKind === 'orth' ? [] : ((await ctx.store.encounters.where('itemId', itemId)) as StoredEncounter[])
    .filter((e) => e.userId === userId && (e.modality === 'reading' || e.modality === 'listening')).sort(byAtThenId);
  const reading = encs.filter((e) => e.modality === 'reading');
  const listening = encs.filter((e) => e.modality === 'listening');
  const counts = new Map<string, number>();
  let nReading = reading.length;
  let nListening = listening.length;
  let firstEnc: { textId: string; sentenceId: string; at: string } | undefined = encs[0];
  for (const e of encs) counts.set(e.textId, (counts.get(e.textId) ?? 0) + 1);
  if (itemKind === 'orth' && row) {
    nReading = totalsOf(row.agg, 'reading').n;
    nListening = totalsOf(row.agg, 'listening').n;
    row.agg.texts.forEach((t, i) => counts.set(t, row.agg.counts[i]));
    firstEnc = row.agg.first;
  }
  const total = nReading + nListening;
  const texts = new Map<string, Text | undefined>();
  for (const id of counts.keys()) texts.set(id, await ctx.store.texts.get(id));
  const byText: ItemHistory['byText'] = [...counts.entries()]
    .map(([textId, count]) => {
      const t = texts.get(textId);
      return { textId, textTitle: t?.title ?? textId, ...(t?.workId ? { workId: t.workId } : {}), count };
    })
    .sort((a, b) => b.count - a.count || cmp(a.textId, b.textId));

  let first: ItemHistory['first'];
  let where = '';
  if (firstEnc) {
    const t = texts.get(firstEnc.textId);
    first = {
      textId: firstEnc.textId, textTitle: t?.title ?? firstEnc.textId, ...(t?.workId ? { workId: t.workId } : {}),
      ...(t?.chapter ? { chapter: t.chapter.index } : {}), at: firstEnc.at, sentenceId: firstEnc.sentenceId,
    };
    const work = t?.workId ? await ctx.store.works.get(t.workId) : undefined;
    where = work && t?.chapter ? `${work.title}, chapter ${t.chapter.index}` : t?.title ?? firstEnc.textId;
  }

  // Labels come from the stored evidence; an explicit mark is reported on its own line, never folded into a label.
  const readingLabel = receptiveLabel(row?.reading ?? k.reading, nReading, 'met', 'not met in reading yet');
  const listeningLabel = receptiveLabel(row?.listening ?? k.listening, nListening, 'heard in real speech', 'not heard in real speech yet');
  const productionText = productionLabel(k);

  // The run of most recent readings that needed no help with this item ("Met 23 times in 4 texts, the last 4 without help.").
  let clean = 0;
  for (let i = reading.length - 1; i >= 0 && itemHelpOf(reading[i]) === 0; i--) clean += 1;
  const trailing = clean > 0 && clean < reading.length ? `, the last ${clean} without help` : '';

  const lines: string[] = [];
  lines.push(first ? `You first met this in ${where}.` : 'You have not met this yet.');
  if (total > 0) lines.push(`Met ${times(total)} in ${plural(byText.length, 'text')}${trailing}.`);
  lines.push(`Reading: ${readingLabel}.`);
  if (row?.manualMark === 'known') lines.push('You marked it known.');
  else if (row?.manualMark === 'unknown') lines.push('You marked it unknown.');
  lines.push(`Listening: ${listeningLabel}.`);
  lines.push(`${capital(productionText)}.`);
  lines.push('Pronunciation: not measured.');

  return {
    itemId, itemKind, encounterCount: total,
    ...(first ? { first } : {}),
    byText, reading: readingLabel, listening: listeningLabel, production: productionText, pronunciation: 'not measured', lines,
  };
}
