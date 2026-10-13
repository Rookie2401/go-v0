/** My Vocabulary is a read-only view of the Repository's encounter projection, not a second deck or word store. */
import type { KnowledgeLevel } from '../../repository-contract/src';
import type { VocabularyItem, VocabularyQuery } from '../../repository-service/src/api';
import { sourceTitle } from '../../repository-contract/src/sources';
import type { AppContext } from '../context';
import { append, button, clear, field, h, langProps, p, setStatus, statusLine } from '../dom';
import { itemMarked } from '../events';
import { languageName } from '../format';
import type { View } from './view';

const LEVELS: Array<KnowledgeLevel | 'all'> = ['all', 'new', 'seen', 'recognized', 'familiar', 'known', 'automatic'];
const LEVEL_LABEL: Record<KnowledgeLevel, string> = {
  new: 'New', seen: 'Seen', recognized: 'Recognized', familiar: 'Familiar', known: 'Known', automatic: 'Automatic',
};
const UNIT_KIND_LABEL: Record<string, string> = { lexeme: 'Lemma', form: 'Form', sense: 'Meaning', phrase: 'Phrase', 'morph-construction': 'Grammar pattern' };
type VocabularySort = 'knowledge' | 'recent' | 'alphabetical';
const SORT_OPTIONS: Array<[VocabularySort, string]> = [
  ['knowledge', 'Knowledge: least established first'],
  ['recent', 'Recently encountered'],
  ['alphabetical', 'Alphabetical'],
];

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const identity = await ctx.identity();
  if (!identity) { el.append(p('Choose a language to see the words you have encountered.')); return; }
  const activeIdentity = identity;
  const root = h('section', { id: 'vocabulary', 'aria-labelledby': 'vocabulary-heading' });
  const heading = h('h2', { id: 'vocabulary-heading' }, `Words encountered in ${languageName(identity.languageId)}`);
  const search = h('input', { type: 'search', id: 'vocabulary-search', name: 'search', maxlength: 120, autocomplete: 'off', 'aria-label': 'Search vocabulary' }) as HTMLInputElement;
  const level = h('select', { id: 'vocabulary-level', name: 'level', 'aria-label': 'Filter by knowledge level' }) as HTMLSelectElement;
  for (const value of LEVELS) level.append(h('option', { value }, value === 'all' ? 'All levels' : LEVEL_LABEL[value]));
  const order = h('select', { id: 'vocabulary-order', name: 'order', 'aria-label': 'Order words' }) as HTMLSelectElement;
  for (const [value, label] of SORT_OPTIONS) order.append(h('option', { value }, label));
  const minEncounters = h('input', { type: 'number', id: 'vocabulary-min-encounters', min: 1, max: 100000, step: 1, inputmode: 'numeric' }) as HTMLInputElement;
  const firstFrom = h('input', { type: 'date', id: 'vocabulary-first-from' }) as HTMLInputElement;
  const firstTo = h('input', { type: 'date', id: 'vocabulary-first-to' }) as HTMLInputElement;
  const lastFrom = h('input', { type: 'date', id: 'vocabulary-last-from' }) as HTMLInputElement;
  const lastTo = h('input', { type: 'date', id: 'vocabulary-last-to' }) as HTMLInputElement;
  const requiresAssistance = h('select', { id: 'vocabulary-assistance' }) as HTMLSelectElement;
  const unresolved = h('select', { id: 'vocabulary-unresolved' }) as HTMLSelectElement;
  for (const select of [requiresAssistance, unresolved]) select.append(h('option', { value: '' }, 'Any'), h('option', { value: 'yes' }, 'Yes'), h('option', { value: 'no' }, 'No'));
  const reviewStatus = h('select', { id: 'vocabulary-review-status' }) as HTMLSelectElement;
  for (const [value, label] of [['', 'Any review status'], ['none', 'Not in GoReview'], ['active', 'In active GoReview'], ['suspended', 'Suspended in GoReview']]) reviewStatus.append(h('option', { value }, label));
  const sourceRef = h('input', { type: 'search', id: 'vocabulary-source-ref', maxlength: 240, autocomplete: 'off' }) as HTMLInputElement;
  const status = statusLine();
  const list = h('div', { id: 'vocabulary-results', 'aria-live': 'polite' });
  const catalog = h('dl', { class: 'facts', id: 'vocabulary-catalog', 'aria-label': 'Encountered words by level' });
  const nextWrap = h('div', { class: 'row', id: 'vocabulary-pagination' });
  const events = await ctx.events(activeIdentity.languageId);
  const prefs = await ctx.state.getPrefs(activeIdentity.learnerId, activeIdentity.languageId);
  const deck = ctx.engine.foldDeck(events, activeIdentity.languageId, prefs, ctx.deps.now().toISOString());
  const saved = new Set<string>();
  const assistanceCounts = new Map<string, number>();
  for (const event of events.filter((row) => row.kind === 'AssistanceRequested')) {
    for (const id of event.subject.itemIds ?? []) assistanceCounts.set(id, (assistanceCounts.get(id) ?? 0) + 1);
  }
  for (const event of events.filter((row) => row.kind === 'ItemMarked').sort((a, b) => a.at.localeCompare(b.at))) {
    const mark = (event.payload as { mark?: string }).mark;
    for (const id of event.subject.itemIds ?? []) { if (mark === 'saved') saved.add(id); else if (mark) saved.delete(id); }
  }
  let serial = 0;
  let cursor: string | undefined;
  let nextCursor: string | undefined;

  const form = h('form', { id: 'vocabulary-filters' });
  const moreFilters = h('details', { id: 'vocabulary-more-filters', class: 'vocabulary-more-filters' }, h('summary', {}, 'More filters'));
  append(moreFilters, [field('Minimum encounters', minEncounters), field('First encountered from', firstFrom), field('First encountered through', firstTo),
    field('Last encountered from', lastFrom), field('Last encountered through', lastTo),
    field('Help requested', requiresAssistance, 'Filters for assisted recognition events.'), field('Analysis unresolved', unresolved),
    field('GoReview status', reviewStatus), field('Source reference', sourceRef, 'Match an indexed reference identifier.')]);
  form.append(field('Search labels and forms', search, 'Search covers labels and up to 25 recent encountered forms per record. Dictionary meanings are not indexed.'), field('Knowledge level', level), field('Order words', order, 'Knowledge order uses the latest knowledge estimate. It does not replace your manual marks.'),
    h('button', { id: 'vocabulary-search-button', type: 'submit', class: 'btn primary' }, 'Apply filters'),
    button('Refresh words', () => { cursor = undefined; void load(); }, { id: 'vocabulary-refresh', class: 'btn' }), moreFilters);
  form.addEventListener('submit', (event) => { event.preventDefault(); cursor = undefined; void load(); });
  level.addEventListener('change', () => { cursor = undefined; void load(); });
  order.addEventListener('change', () => { cursor = undefined; void load(); });
  const refreshOnFocus = (): void => { if (!view.alive()) return; cursor = undefined; void load(); };
  ctx.deps.win.addEventListener('focus', refreshOnFocus);
  view.onDispose(() => ctx.deps.win.removeEventListener('focus', refreshOnFocus));

  async function load(appendPage = false): Promise<void> {
    const turn = ++serial;
    if (!appendPage) { clear(list); clear(catalog); }
    clear(nextWrap); nextCursor = undefined;
    setStatus(status, 'Loading encountered vocabulary…');
    try {
      const { api } = await ctx.api();
      const query: VocabularyQuery = {
        languageId: activeIdentity.languageId,
        sort: order.value as VocabularySort,
        ...(level.value !== 'all' ? { level: level.value as KnowledgeLevel } : {}),
        ...(search.value.trim() ? { search: search.value.trim() } : {}),
        ...(minEncounters.value && Number(minEncounters.value) >= 1 ? { minEncounters: Math.floor(Number(minEncounters.value)) } : {}),
        ...(firstFrom.value ? { firstEncounterFrom: firstFrom.value } : {}), ...(firstTo.value ? { firstEncounterTo: firstTo.value } : {}),
        ...(lastFrom.value ? { lastEncounterFrom: lastFrom.value } : {}), ...(lastTo.value ? { lastEncounterTo: lastTo.value } : {}),
        ...(requiresAssistance.value ? { requiresAssistance: requiresAssistance.value === 'yes' } : {}),
        ...(unresolved.value ? { unresolved: unresolved.value === 'yes' } : {}),
        ...(reviewStatus.value ? { reviewStatus: reviewStatus.value as 'none' | 'active' | 'suspended' } : {}),
        ...(sourceRef.value.trim() ? { sourceRef: sourceRef.value.trim() } : {}),
        ...(cursor ? { after: cursor } : {}), limit: 50,
      };
      const result = await api.vocabulary(query);
      if (!view.alive() || turn !== serial) return;
      if (!result.ok) throw new Error(result.message || `The Repository answered ${result.status}.`);
      const page = result.data;
      nextCursor = page.nextCursor;
      if (!appendPage) append(catalog, [h('dt', {}, 'Encountered records'), h('dd', {}, String(page.catalog.total)), ...LEVELS.filter((value): value is KnowledgeLevel => value !== 'all')
        .flatMap((value) => [h('dt', {}, LEVEL_LABEL[value]), h('dd', {}, String(page.catalog.counts[value] ?? 0))])]);
      append(list, page.items.length ? page.items.map(itemRow) : [h('p', { class: 'muted', id: 'vocabulary-empty' }, cursor
        ? 'There are no more encountered words on this page.'
        : 'No encountered words match this search yet. Words appear here after they are met while reading.')]);
      if (nextCursor) nextWrap.append(button('Load more', () => { cursor = nextCursor; void load(true); }, { id: 'vocabulary-next', class: 'btn' }));
      setStatus(status, `${page.items.length} encountered word${page.items.length === 1 ? '' : 's'}${nextCursor ? ' shown; more available' : ''}.`, 'ok');
    } catch (error) {
      if (!view.alive() || turn !== serial) return;
      setStatus(status, error instanceof Error ? `Vocabulary could not be loaded: ${error.message}` : 'Vocabulary could not be loaded.', 'error');
      nextWrap.append(button('Try again', () => void load(), { id: 'vocabulary-retry', class: 'btn' }));
    }
  }

  function itemRow(item: VocabularyItem): HTMLElement {
    const unitId = item.knowledge.unitId;
    const title = item.unit?.label || unitId;
    const kind = item.unit?.kind ?? unitId.split(':', 1)[0];
    const kindLabel = UNIT_KIND_LABEL[kind] ?? kind;
    const variants = [...new Set(item.surfaceForms.filter((x) => x && x !== title))].slice(0, 25);
    const last = item.lastEncounter ? new Date(item.lastEncounter) : undefined;
    const when = last && !Number.isNaN(last.getTime()) ? last.toLocaleDateString() : 'date unavailable';
    const refs = item.sources.map(sourceTitle).filter((x): x is string => !!x);
    const card = deck.find((entry) => entry.unitId === unitId);
    const assistanceCount = item.assistanceCount ?? assistanceCounts.get(unitId) ?? 0;
    const row = h('article', { class: 'card vocabulary-item', 'data-unit-id': unitId },
      h('div', { class: 'row vocabulary-title' }, h('h3', langProps(activeIdentity.varietyId ?? activeIdentity.languageId), title), h('span', { class: 'tag', 'data-unit-kind': kind }, kindLabel), h('span', { class: 'tag', 'data-level': item.knowledge.level }, LEVEL_LABEL[item.knowledge.level])),
      variants.length ? h('p', {}, 'Recent encountered forms: ', h('span', langProps(activeIdentity.varietyId ?? activeIdentity.languageId), variants.join(', '))) : null,
      h('p', { class: 'muted' }, `${item.knowledge.encounters} encounter${item.knowledge.encounters === 1 ? '' : 's'} · last met ${when}${assistanceCount ? ` · help requested ${assistanceCount} time${assistanceCount === 1 ? '' : 's'}` : ''}`),
      refs.length ? p(`Sources: ${[...new Set(refs)].join('; ')}`, 'muted') : null);
    const tools = h('div', { class: 'row vocabulary-actions' });
    if (!saved.has(unitId)) tools.append(button('Save for GoReview', () => {
      void (async () => {
        const ectx = await ctx.eventContext();
        if (!ectx) { setStatus(status, 'Choose a language first.', 'error'); return; }
        const result = await ctx.record([itemMarked(ectx, ctx.deps.newId(), unitId, 'saved')]);
        if (result.refused.length) { setStatus(status, result.refused[0].issues.join('; '), 'error'); return; }
        saved.add(unitId); setStatus(status, `Saved ${title} as a request for GoReview.`, 'ok');
        const control = tools.querySelector<HTMLButtonElement>('button');
        if (control) { control.textContent = 'Saved for GoReview'; control.disabled = true; }
        cursor = undefined;
        void load();
      })();
    }, { class: 'btn small', 'data-action': 'save-practice' }));
    else tools.append(button('Saved for GoReview', () => undefined, { class: 'btn small', disabled: true }));
    if (card) {
      const currentCard = { ...card };
      const practiceControl = button(currentCard.status === 'suspended' ? 'Resume practice' : 'Suspend practice', () => {
        void (async () => {
          if (practiceControl.disabled) return;
          practiceControl.disabled = true;
          const wasSuspended = currentCard.status === 'suspended';
          try {
            const ectx = await ctx.eventContext();
            const event = ectx ? ctx.engine.controlEvent(ectx, currentCard, wasSuspended ? { kind: 'resume' } : { kind: 'suspend' }) : undefined;
            if (!event) { setStatus(status, 'That practice state could not be changed.', 'error'); return; }
            const result = await ctx.record([event]);
            if (result.refused.length) { setStatus(status, result.refused[0].issues.join('; '), 'error'); return; }
            currentCard.status = wasSuspended ? 'active' : 'suspended';
            practiceControl.textContent = currentCard.status === 'suspended' ? 'Resume practice' : 'Suspend practice';
            practiceControl.dataset.action = currentCard.status === 'suspended' ? 'resume-practice' : 'suspend-practice';
            setStatus(status, wasSuspended ? `Resumed ${title} in GoReview.` : `Suspended ${title} in GoReview.`, 'ok');
          } finally { practiceControl.disabled = false; }
        })();
      }, { class: 'btn small', 'data-action': currentCard.status === 'suspended' ? 'resume-practice' : 'suspend-practice' });
      tools.append(practiceControl);
    }
    const details = h('details', { class: 'vocabulary-detail', 'data-loaded': 'false' }, h('summary', {}, 'Unit details and history'), h('div', { class: 'vocabulary-detail-body' }, p('Open to load the unit record and recent history.', 'muted')));
    details.addEventListener('toggle', () => {
      if (!(details as HTMLDetailsElement).open || details.dataset.loaded === 'true') return;
      details.dataset.loaded = 'true';
      const body = details.querySelector<HTMLElement>('.vocabulary-detail-body')!;
      clear(body); append(body, [p('Loading unit record…', 'muted')]);
      void (async () => {
        try {
          const { api } = await ctx.api();
          const [report, recent, packFacts] = await Promise.all([
            api.unit(unitId), api.listEvents({ languageId: activeIdentity.languageId, unitId, limit: 25 }),
            ctx.engine.factsFor?.(unitId, activeIdentity.languageId, api),
          ]);
          if (!view.alive()) return;
          clear(body);
          if (!report.ok) append(body, [p('Unit details are not available from the Repository.', 'muted')]);
          else {
            const unit = report.data.unit;
            const relatedIds = [...new Set(report.data.relations.flatMap((relation) => [relation.fromId, relation.toId]).filter((id) => id !== unitId))].slice(0, 20);
            const related = relatedIds.length ? await api.units(relatedIds) : undefined;
            const relatedLabels = related?.ok ? Object.fromEntries(Object.entries(related.data.units).map(([id, value]) => [id, value.unit.label])) : {};
            const meanings = [...new Set([...(packFacts?.glosses ?? []), ...(packFacts?.phrase?.gloss ? [packFacts.phrase.gloss] : [])])].slice(0, 8);
            const featureExplanations = Object.entries(packFacts?.featureExplanations ?? {}).slice(0, 12);
            const facts: Array<[string, string]> = [
              ['Kind', unit.kind], ['Analysis status', unit.status], ['Part of speech', packFacts?.pos ?? unit.pos ?? 'Not supplied'],
              ['Lemma', packFacts?.lemma ?? 'Not supplied'],
              ['Meaning', meanings.length ? meanings.join('; ') : 'No meaning supplied by this language pack'],
              ['Features', unit.features ? Object.entries(unit.features).map(([key, value]) => `${key}: ${value}`).join('; ') : 'None recorded'],
              ['Last review', card?.history.at(-1)?.at ?? 'Not reviewed'], ['Next review', card?.schedule.due ?? 'Not scheduled'],
              ['GoReview status', card?.status ?? 'Not in the GoReview deck'],
            ];
            const analysisRows = report.data.analyses.slice(0, 10).map((analysis) => p(
              `Analysis · ${analysis.status} · ${analysis.candidates.slice(0, 8).map((candidate) => [candidate.lexemeId, candidate.senseId, candidate.role, candidate.features ? Object.entries(candidate.features).map(([k, v]) => `${k}=${v}`).join(', ') : undefined].filter(Boolean).join(' · ')).join(' / ') || 'No candidates recorded'}`));
            const relationRows = report.data.relations.slice(0, 20).map((relation) => p(`${relation.relation} · ${relatedLabels[relation.fromId] ?? relation.fromId} → ${relatedLabels[relation.toId] ?? relation.toId}`, 'muted'));
            append(body, [h('dl', { class: 'facts' }, ...facts.flatMap(([key, value]) => [h('dt', {}, key), h('dd', {}, value)])),
              meanings.length && packFacts?.glossAttribution ? p(`Meaning source: ${packFacts.glossAttribution}`, 'muted') : null,
              h('h3', {}, 'Feature explanations'), ...(featureExplanations.length
                ? featureExplanations.map(([key, explanation]) => p(`${key} · ${explanation}`))
                : [p('No pack explanations are available for these features.', 'muted')]),
              h('h3', {}, 'Analyses'), ...(analysisRows.length ? analysisRows : [p('No analysis records.', 'muted')]),
              h('h3', {}, 'Relations'), ...(relationRows.length ? relationRows : [p('No relations recorded.', 'muted')])]);
          }
          if (recent.ok) {
            const reviewedRows = recent.data.events.filter((event) => event.kind === 'CardReviewed').slice(0, 25);
            body.append(h('h3', {}, 'Recent history'), reviewedRows.length
              ? h('ul', {}, ...reviewedRows.map((event) => h('li', {}, `${new Date(event.at).toLocaleString()} · ${String((event.payload as { rating?: unknown }).rating ?? 'no rating')}`)))
              : p('No review events returned.', 'muted'));
          }
          const correction = h('details', { class: 'vocabulary-correction' }, h('summary', {}, 'Report an analysis problem'));
          const reason = h('textarea', { rows: 2, maxlength: 300, 'aria-label': 'Describe the analysis problem' }) as HTMLTextAreaElement;
          correction.append(field('What seems wrong?', reason), button('Send report', () => {
            void (async () => {
              if (!reason.value.trim()) { setStatus(status, 'Add a short reason before sending the report.', 'error'); return; }
              const { api } = await ctx.api();
              const sent = await api.correctUnit(unitId, { reason: reason.value.trim() });
              setStatus(status, sent.ok ? 'Report sent to the Repository for review.' : `Report could not be sent: ${sent.message}`, sent.ok ? 'ok' : 'error');
            })();
          }, { class: 'btn small' }));
          body.append(correction);
        } catch {
          clear(body); append(body, [p('Unit details could not be loaded. Try closing and reopening this section.', 'error')]);
          details.dataset.loaded = 'false';
        }
      })();
    });
    row.append(tools, details);
    return row;
  }

  root.append(heading, p('A reading-based list from your Repository record. New and unreviewed units are included. A lemma and its forms may appear as separate records, so the totals count records, not unique words; this list does not add items to GoReview.', 'muted'), catalog, form, status, list, nextWrap);
  el.append(root);
  await load();
}
