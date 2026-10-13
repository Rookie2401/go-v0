/**
 * #/review/vocab — My vocab: every unit the learner has met (the Repository's knowledge rows), one quiet line each: the
 * word, its meaning when the pack knows it, and its level in a word. Two orders, chosen with two quiet toggles and remembered
 * on this device: least known first (by level, then encounters) or most recently encountered (by when it was last tapped).
 * Tapping a word opens its history. The filtered, searchable list with the unit details is kept at #/vocabulary (Settings).
 */
import { KNOWLEDGE_LEVELS } from '../../repository-contract/src';
import type { AppContext } from '../context';
import { append, button, clear, h, langProps, p, setStatus, statusLine } from '../dom';
import { loadVocab, sortVocab, type VocabRow, type VocabSort } from '../deckModel';
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
  append(el, [h('p', {}, h('a', { href: '#/review' }, '← GoReview')), h('h2', { class: 'page-title', id: 'vocab-title' }, 'My vocab'), toggles, list, more, status]);
  if (!id) { toggles.remove(); list.replaceWith(p('Choose a language to see the words you have met.', 'muted')); return; }
  const identity = id;
  const tag = identity.varietyId ?? identity.languageId;

  let sort: VocabSort = (await getUiPrefs(ctx)).vocabSort;
  let rows: VocabRow[] = [];
  let shown = PAGE;
  const itemOfUnit = new Map<string, string>();
  const glossed = new Map<string, string | null>();

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

  function rowView(r: VocabRow): HTMLElement {
    const known = glossed.get(r.unitId);
    const gloss = h('span', { class: 'vocab-gloss', 'data-gloss': r.unitId }, known ?? '');
    return h('li', { class: 'vocab-item', 'data-unit-id': r.unitId, 'data-level': r.level },
      h('a', { class: 'vocab-row', href: `#/review/history/${encodeURIComponent(itemOfUnit.get(r.unitId) ?? r.unitId)}` },
        h('span', { ...langProps(tag), class: 'vocab-word target-text' }, r.label), gloss, h('span', { class: 'vocab-level' }, r.level)));
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

  paintToggles();
  setStatus(status, 'Loading your words…');
  try {
    const events = await ctx.events(identity.languageId);
    const prefs = await ctx.state.getPrefs(identity.learnerId, identity.languageId);
    for (const item of ctx.engine.foldDeck(events, identity.languageId, prefs, ctx.deps.now().toISOString())) if (!itemOfUnit.has(item.unitId)) itemOfUnit.set(item.unitId, item.itemId);
    const loaded = await loadVocab(ctx, identity.languageId);
    if (!view.alive()) return;
    rows = loaded.rows.filter((r) => KNOWLEDGE_LEVELS.includes(r.level));
    setStatus(status, '');
    paintList();
  } catch (e) {
    if (!view.alive()) return;
    setStatus(status, `Your words could not be loaded${e instanceof Error ? `: ${e.message}` : ''}.`, 'error');
    more.append(button('Try again', () => { clear(el); void render(el, ctx, view); }, { class: 'linklike', id: 'vocab-retry' }));
  }
}
