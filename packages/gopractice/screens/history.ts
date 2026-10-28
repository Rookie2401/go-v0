/** Review history of one deck item, and the transfer-measures page. Both are read-only views of the event log. */
import type { AppContext } from '../context';
import { append, clear, embedTarget, h, langProps, p } from '../dom';
import { DIMENSION_LABEL, FAMILY_LABEL, OUTCOME_LABEL, RATING_LABEL, unitLabel } from '../format';
import type { View } from './view';

/**
 * Fills `el` with the item's history: the plain-language account, then every recorded review. `level` is the heading level of
 * its sections: h3 inside a session (under that screen's h2), h2 on the history screen (under the h1 of the page).
 */
export async function fillItemHistory(ctx: AppContext, el: HTMLElement, itemId: string, tag?: string, level: 'h2' | 'h3' = 'h3'): Promise<boolean> {
  const id = await ctx.identity();
  if (!id) { append(el, [p('Sign in to see your history.', 'muted')]); return false; }
  const prefs = await ctx.state.getPrefs(id.learnerId, id.languageId);
  const events = await ctx.events(id.languageId);
  const deck = ctx.engine.foldDeck(events, id.languageId, prefs, ctx.deps.now().toISOString());
  // My vocab links by item when the word has a card and by unit id when it has none
  const item = deck.find((i) => i.itemId === itemId) ?? deck.find((i) => i.unitId === itemId);
  clear(el);
  if (!item) {
    const mine = events.filter((e) => e.subject.itemIds?.includes(itemId) && ['EncounterRecorded', 'SelectionLookedUp', 'AssistanceRequested', 'AnalysisShown'].includes(e.kind));
    if (!mine.length) { append(el, [p('That item is not in your deck on this device.', 'muted')]); return false; }
    const lookups = mine.filter((e) => e.kind === 'SelectionLookedUp').length;
    const last = mine.map((e) => e.at).sort().at(-1)!;
    append(el, [
      h(level, {}, 'Word'),
      h('p', {}, h('span', langProps(tag ?? id.varietyId ?? id.languageId), unitLabel(itemId)), ` · met ${mine.length} time${mine.length === 1 ? '' : 's'}${lookups ? `, looked up ${lookups}` : ''} · last ${last.slice(0, 10)}`),
      p('It is not in a deck yet. GoReview adds words from what you read when they are worth asking.', 'muted'),
    ]);
    return true;
  }
  const hist = ctx.engine.itemHistory(events, itemId);
  append(el, [
    h(level, {}, 'Item'),
    h('p', {}, h('span', langProps(tag ?? id.varietyId ?? id.languageId), unitLabel(item.unitId)), ` · ${FAMILY_LABEL[item.family]} · ${DIMENSION_LABEL[item.dimension]} · ${item.status}`),
    h('p', { class: 'item-explanation' }, ...embedTarget(ctx.engine.explainItem(item, events), [unitLabel(item.unitId)], tag ?? id.varietyId ?? id.languageId)),
  ]);
  if (item.reasons.length) append(el, [h(level, {}, 'Why it is in your deck'), h('ul', {}, ...item.reasons.map((r) => h('li', {}, ...embedTarget(r.split(' | ')[0], [unitLabel(item.unitId)], tag ?? id.varietyId ?? id.languageId))))]);
  if (item.history.length) {
    append(el, [h(level, {}, 'Scheduled reviews'), h('table', { class: 'plain' },
      h('thead', {}, h('tr', {}, h('th', {}, 'When'), h('th', {}, 'Kind'), h('th', {}, 'Outcome'), h('th', {}, 'Rating'), h('th', {}, 'Days since last'))),
      h('tbody', {}, ...item.history.map((r) => h('tr', {}, h('td', {}, r.at.slice(0, 16).replace('T', ' ')), h('td', {}, FAMILY_LABEL[r.family]), h('td', {}, OUTCOME_LABEL[r.outcome]), h('td', {}, RATING_LABEL[r.rating]), h('td', {}, String(Math.round(r.elapsedDays * 10) / 10))))))]);
  }
  if (hist && hist.reviews > item.history.length) {
    append(el, [p(`${hist.reviews - item.history.length} further answer(s) were recorded without a rating (challenged, invalid or not heard): they are in your history and did not move the schedule.`, 'muted')]);
  }
  append(el, [h('p', { class: 'muted' }, `Next due ${item.schedule.due.slice(0, 10)} · stability ${item.schedule.stability.toFixed(1)} · difficulty ${item.schedule.difficulty.toFixed(1)} · ${item.schedule.algorithm}. These numbers are retention bookkeeping, not a score of what you know.`)]);
  return true;
}

export async function renderHistory(el: HTMLElement, ctx: AppContext, view: View, params: string[]): Promise<void> {
  const itemId = decodeURIComponent(params.join('/'));
  const body = h('section', { class: 'card', id: 'item-history' });
  append(el, [body]);
  await fillItemHistory(ctx, body, itemId, undefined, 'h2');
  void view;
}

export async function renderTransfer(el: HTMLElement, ctx: AppContext): Promise<void> {
  append(el, [
    h('p', { class: 'notice', id: 'transfer-notice' }, 'Research measures, not conclusions. Each line describes what was recorded, with the observations behind it and what it cannot show. None of it is a score of what you know, and none of it changes your schedule.'),
  ]);
  const id = await ctx.identity();
  if (!id) { append(el, [p('Sign in to see measures.', 'muted')]); return; }
  const events = await ctx.events(id.languageId);
  const prefs = await ctx.state.getPrefs(id.learnerId, id.languageId);
  const deck = ctx.engine.foldDeck(events, id.languageId, prefs, ctx.deps.now().toISOString());
  const units = [...new Set(deck.filter((i) => i.history.length > 0).map((i) => i.unitId))].sort();
  if (!units.length) { append(el, [p('Nothing has been reviewed yet, so there is nothing to measure.', 'muted')]); return; }
  const tag = id.varietyId ?? id.languageId;
  for (const unit of units) {
    const measures = ctx.engine.measures(events, unit);
    const card = h('section', { class: 'card measures', 'data-unit': unit },
      h('h2', {}, h('span', langProps(tag), unitLabel(unit))));
    for (const m of measures) {
      card.append(h('div', { class: 'measure' },
        h('h3', {}, m.measure.replace(/-/g, ' ')),
        h('p', {}, ...(m.value === null ? ['Too little recorded to say anything.'] : embedTarget(`Value: ${m.value}`, [unitLabel(unit)], tag))),
        m.basis.length ? h('details', {}, h('summary', {}, `Basis (${m.basis.length})`), h('ul', {}, ...m.basis.map((b) => h('li', {}, ...embedTarget(b, [unitLabel(unit)], tag))))) : null,
        h('p', { class: 'muted' }, ...embedTarget(`Cannot show: ${m.caveat}`, [unitLabel(unit)], tag))));
    }
    el.append(card);
  }
}
