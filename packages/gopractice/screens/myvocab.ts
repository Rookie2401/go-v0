/**
 * #/review/vocab — My vocab: every word the learner has met, once (a lemma and its forms are one entry), one quiet line each: the
 * word, its meaning when the pack knows it, and its level in a word. Two orders, chosen with two quiet toggles and remembered
 * on this device: least known first (by level, then encounters) or most recently encountered (by when it was last tapped).
 * Tapping a word asks "Add <word> to the current deck?" under the row (Add / Not now); a word already in the deck says so. Add
 * records the learner's explicit choice (ItemMarked saved) and puts the word at the head of the current deck. A small History link
 * keeps the word's history one tap away. The filtered, searchable list with the unit details is kept at #/vocabulary (Settings).
 */
import { KNOWLEDGE_LEVELS } from '../../repository-contract/src';
import type { AppContext } from '../context';
import { append, button, clear, h, langProps, p, setStatus, statusLine } from '../dom';
import { addToDeck, holdOutOf, loadVocab, planCurrentDeck, removeFromAdded, sortVocab, type VocabRow, type VocabSort } from '../deckModel';
import { itemMarked } from '../events';
import { loadReviewModel } from '../workspace';
import type { View } from './view';
import { getUiPrefs, patchUiPrefs } from './uiprefs';

const PAGE = 80;
const SORTS: Array<[VocabSort, string]> = [['least', 'Least known first'], ['recent', 'Recently encountered']];

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const id = await ctx.identity();
  const status = statusLine();
  const toggles = h('div', { class: 'vocab-sorts', role: 'group', 'aria-label': 'Order the words' });
  const list = h('ul', { class: 'vocablist', id: 'vocab-list' });
  const more = h('div', { class: 'vocab-more' });
  append(el, [h('h2', { class: 'page-title', id: 'vocab-title' }, 'My vocab'), toggles, list, more, status]);
  if (!id) { toggles.remove(); list.replaceWith(p('Choose a language to see the words you have met.', 'muted')); return; }
  const identity = id;
  const tag = identity.varietyId ?? identity.languageId;

  let sort: VocabSort = (await getUiPrefs(ctx)).vocabSort;
  let rows: VocabRow[] = [];
  let shown = PAGE;
  const itemOfUnit = new Map<string, string>();
  const glossed = new Map<string, string | null>();
  /** The units of the current deck, once known; a word of one of them is "In your deck". */
  let deckUnits: Set<string> | undefined;
  /** The word whose question is open under its row. */
  let asking: string | undefined;
  /** An Add in flight, or the first load: a live repaint waits for them, so nothing under the learner's finger is replaced. */
  let busy = true;

  const inDeck = (r: VocabRow): boolean => !!deckUnits && (r.unitIds ?? [r.unitId]).some((u) => deckUnits!.has(u));

  function paintToggles(): void {
    clear(toggles);
    for (const [value, label] of SORTS) {
      toggles.append(button(label, () => {
        if (sort === value) return;
        sort = value; shown = PAGE;
        void patchUiPrefs(ctx, { vocabSort: value }).catch(() => undefined);
        paintToggles(); paintList();
      }, { class: 'toggle-link', id: `vocab-sort-${value}`, 'data-sort': value, 'aria-pressed': sort === value ? 'true' : 'false' }));
    }
  }

  /** The current deck's units: the home's own plan, so what is said here is what Begin will ask. */
  async function refreshDeck(): Promise<void> {
    try {
      const model = await loadReviewModel(ctx);
      if (!model || !view.alive()) return;
      const deck = await planCurrentDeck(ctx, model, await holdOutOf(ctx, identity.learnerId, identity.languageId), rows);
      if (!view.alive()) return;
      deckUnits = new Set(deck.entries.map((e) => e.unitId));
      paintList();
    } catch { /* the question is still asked; Add reports what happened */ }
  }

  async function add(r: VocabRow): Promise<void> {
    busy = true;
    try {
      const ectx = await ctx.eventContext();
      if (!ectx) { setStatus(status, 'Choose a language first.', 'error'); return; }
      const marked = await ctx.record([itemMarked(ectx, ctx.deps.newId(), r.unitId, 'saved')]);
      if (marked.refused.length) { setStatus(status, marked.refused[0].issues.join('; '), 'error'); return; }
      await addToDeck(ctx, identity, { unitId: r.unitId, unitKind: r.kind ?? 'lexeme', dimension: 'written-recognition', family: 'written-recognition' });
      const model = await loadReviewModel(ctx);
      const deck = model ? await planCurrentDeck(ctx, model, await holdOutOf(ctx, identity.learnerId, identity.languageId), rows) : undefined;
      if (!view.alive()) return;
      if (deck?.entries.some((e) => e.unitId === r.unitId)) {
        deckUnits = new Set(deck.entries.map((e) => e.unitId));
        asking = undefined;
        setStatus(status, `${r.label} is in your deck.`, 'ok');
      } else {
        await removeFromAdded(ctx, identity, r.unitId);
        setStatus(status, `${r.label} cannot be asked yet: no exercise can be built for it. Your choice is kept as a saved word.`, 'info');
      }
      paintList();
    } catch (e) { setStatus(status, e instanceof Error ? e.message : 'The word could not be added.', 'error'); } finally { busy = false; }
  }

  function rowView(r: VocabRow): HTMLElement {
    const known = glossed.get(r.unitId);
    const gloss = h('span', { class: 'vocab-gloss', 'data-gloss': r.unitId }, known ?? '');
    const present = inDeck(r);
    const open = asking === r.unitId;
    const line = h('div', { class: 'vocab-line' },
      button('', () => { asking = open ? undefined : r.unitId; paintList(); void (deckUnits ? Promise.resolve() : refreshDeck()); }, {
        class: 'vocab-row', 'aria-expanded': open ? 'true' : 'false',
      }),
      h('a', { class: 'vocab-history', href: `#/review/history/${encodeURIComponent(itemOfUnit.get(r.unitId) ?? r.unitId)}`, 'aria-label': `History of ${r.label}` }, 'History'));
    const tap = line.querySelector('button')!;
    append(tap, [
      h('span', { ...langProps(tag), class: 'vocab-word target-text' }, r.label), gloss,
      r.metAs?.length ? h('span', { class: 'vocab-met' }, 'met as: ', h('span', langProps(tag), r.metAs.join(', '))) : null,
      present ? h('span', { class: 'vocab-indeck' }, 'In your deck') : null,
      h('span', { class: 'vocab-level' }, r.level),
    ]);
    const item = h('li', { class: 'vocab-item', 'data-unit-id': r.unitId, 'data-level': r.level, ...(present ? { 'data-in-deck': 'true' } : {}) }, line);
    if (open) {
      const ask = h('div', { class: 'vocab-ask', role: 'group', 'aria-label': `Add ${r.label} to the current deck` });
      if (present) ask.append(h('p', { class: 'muted' }, h('span', langProps(tag), r.label), ' is already in your deck.'));
      else {
        const addBtn = button('Add', () => { addBtn.disabled = true; void add(r).finally(() => { addBtn.disabled = false; }); }, { class: 'btn small', 'data-action': 'add-to-deck' });
        ask.append(h('p', {}, 'Add ', h('span', langProps(tag), r.label), ' to the current deck?'),
          h('div', { class: 'entry-actions' }, addBtn, button('Not now', () => { asking = undefined; paintList(); }, { class: 'linklike', 'data-action': 'not-now' })));
      }
      item.append(ask);
    }
    return item;
  }

  function paintList(): void {
    clear(list); clear(more);
    const ordered = sortVocab(rows, sort);
    const visible = ordered.slice(0, shown);
    if (!ordered.length) { list.append(h('li', { class: 'muted', id: 'vocab-empty' }, 'Words you meet while reading with GoLearn appear here.')); return; }
    append(list, visible.map(rowView));
    if (ordered.length > shown) more.append(button(`Show more`, () => { shown += PAGE; paintList(); }, { class: 'linklike', id: 'vocab-more' }));
    void fillGlosses(visible);
  }

  /** The meaning of each visible word, when the language pack knows one; a few at a time, never blocking the list. */
  async function fillGlosses(visible: VocabRow[]): Promise<void> {
    const todo = visible.filter((r) => !glossed.has(r.unitId));
    if (!todo.length || !ctx.engine.factsFor) return;
    const { api } = await ctx.api();
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < todo.length && view.alive()) {
        const r = todo[next++];
        let text: string | null = null;
        try { text = (await ctx.engine.factsFor!(r.unitId, identity.languageId, api))?.glosses?.[0] ?? null; } catch { text = null; }
        glossed.set(r.unitId, text);
        if (text && view.alive()) {
          const slot = [...list.querySelectorAll<HTMLElement>('[data-gloss]')].find((x) => x.getAttribute('data-gloss') === r.unitId);
          if (slot) slot.textContent = text;
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  }

  const offlineNote = (at: string): string => `You are offline: these are the words this device saved on ${at.slice(0, 10)}. New ones appear when you are back online.`;
  const signature = (list: readonly VocabRow[]): string => JSON.stringify(list.map((r) => [r.unitId, r.level, r.encounters, r.lastSeenAt ?? '']));

  /** A live update (GoLearn pushed new lookups): the list is read again and repainted in place, unless the learner is in the middle of an Add. */
  async function refresh(): Promise<void> {
    if (busy || !view.alive()) return;
    busy = true;
    try {
      const loaded = await loadVocab(ctx, identity.languageId);
      if (!view.alive() || loaded.stale) return;
      const next = loaded.rows.filter((r) => KNOWLEDGE_LEVELS.includes(r.level));
      if (signature(next) === signature(rows)) return;
      rows = next;
      setStatus(status, '');
      paintList();
      deckUnits = undefined; void refreshDeck();
    } catch { /* the list stays as painted */ } finally { busy = false; }
  }
  view.onDispose(ctx.onData(() => { void refresh(); }));

  paintToggles();
  setStatus(status, 'Loading your words…');
  try {
    const events = await ctx.events(identity.languageId);
    const prefs = await ctx.state.getPrefs(identity.learnerId, identity.languageId);
    for (const item of ctx.engine.foldDeck(events, identity.languageId, prefs, ctx.deps.now().toISOString())) if (!itemOfUnit.has(item.unitId)) itemOfUnit.set(item.unitId, item.itemId);
    const loaded = await loadVocab(ctx, identity.languageId);
    if (!view.alive()) return;
    rows = loaded.rows.filter((r) => KNOWLEDGE_LEVELS.includes(r.level));
    setStatus(status, loaded.stale ? offlineNote(loaded.stale) : '', loaded.stale ? 'info' : 'info');
    busy = false;
    paintList();
    void refreshDeck();
  } catch (e) {
    busy = false;
    if (!view.alive()) return;
    setStatus(status, `Your words could not be loaded${e instanceof Error ? `: ${e.message}` : ''}.`, 'error');
    more.append(button('Try again', () => { clear(el); void render(el, ctx, view); }, { class: 'linklike', id: 'vocab-retry' }));
  }
}
