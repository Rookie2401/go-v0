// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UnitKnowledge } from '../../packages/repository-contract/src';
import type { RepositoryApi } from '../../packages/repository-service/src/api';
import type { UnitReport, VocabularyItem, VocabularyPage, VocabularyQuery } from '../../packages/repository-service/src/api';
import { cardAdded, destroyRigs, ids, makeRig, queued, seed, type Rig, until, unitOf } from './helpers';

afterEach(() => destroyRigs());

function item(unitId: string, label: string, level: UnitKnowledge['level']): VocabularyItem {
  const knowledge = { unitId, languageId: 'sq', level, encounters: 2, firstSeenAt: '2026-10-01T00:00:00.000Z', lastSeenAt: '2026-10-02T00:00:00.000Z' } as UnitKnowledge;
  return { knowledge, unit: { unitId, languageId: 'sq', label, kind: unitId.startsWith('form:') ? 'form' : 'lexeme' } as VocabularyItem['unit'], surfaceForms: [`${label}-form`], lastEncounter: '2026-10-02T00:00:00.000Z', assistanceCount: 1, sources: [{ kind: 'ebook', title: 'A reader' }] };
}

const catalog = { total: 7, counts: { new: 2, seen: 1, recognized: 1, familiar: 1, known: 1, automatic: 1 } } as const;
async function useVocabularyApi(rig: Rig, respond: (query: VocabularyQuery) => VocabularyPage, extra: Record<string, unknown> = {}) {
  const queries: VocabularyQuery[] = [];
  const api = { ...extra, vocabulary: vi.fn(async (query: VocabularyQuery) => {
    queries.push(query);
    return { ok: true as const, status: 200, data: respond(query) };
  }) } as unknown as RepositoryApi;
  rig.app.ctx.api = async () => ({ api, session: undefined, baseUrl: '' });
  await rig.go('vocabulary');
  return queries;
}

describe('My Vocabulary', () => {
  it('shows encountered New items, observed forms and safe source titles without adding them to GoReview', async () => {
    const rig = await makeRig({ signedIn: true });
    await useVocabularyApi(rig, () => ({ items: [item('lemma:sq:libër:NOUN', 'libër', 'new')], catalog }));
    expect(rig.q('#vocabulary-results').textContent).toContain('libër');
    expect(rig.q('#vocabulary-results').textContent).toContain('libër-form');
    expect(rig.q('#vocabulary-results').textContent).toContain('New');
    expect(rig.q('#vocabulary-results').textContent).toContain('Lemma');
    expect(rig.q('#vocabulary').textContent).toContain('totals count records, not unique words');
    expect(rig.q('#vocabulary-results').textContent).toContain('A reader');
    expect(rig.q('#vocabulary-results').textContent).toContain('help requested 1 time');
    expect(rig.q('#vocabulary-catalog').textContent).toContain('7');
    expect(rig.root.querySelector('#start-session')).toBeNull();
  });

  it('sends search and knowledge filters to the Repository, and loads the next page on request', async () => {
    const rig = await makeRig({ signedIn: true });
    const queries = await useVocabularyApi(rig, (query) => query.after
      ? { items: [item('lemma:sq:shtepi:NOUN', 'shtëpi', 'seen')], catalog }
      : { items: [item('lemma:sq:libër:NOUN', 'libër', 'new')], nextCursor: query.sort === 'recent' ? 'cursor-2' : 'cursor-1', catalog });
    const search = rig.q<HTMLInputElement>('#vocabulary-search');
    search.value = 'book';
    rig.q<HTMLSelectElement>('#vocabulary-level').value = 'new';
    rig.q<HTMLInputElement>('#vocabulary-min-encounters').value = '3';
    rig.q<HTMLInputElement>('#vocabulary-first-from').value = '2026-09-01';
    rig.q<HTMLInputElement>('#vocabulary-last-to').value = '2026-10-10';
    rig.q<HTMLSelectElement>('#vocabulary-assistance').value = 'yes';
    rig.q<HTMLSelectElement>('#vocabulary-unresolved').value = 'no';
    rig.q<HTMLSelectElement>('#vocabulary-review-status').value = 'active';
    rig.q<HTMLInputElement>('#vocabulary-source-ref').value = 'reader:chapter-2';
    rig.q('#vocabulary-filters').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(queries.length).toBe(2));
    expect(queries[1]).toMatchObject({ search: 'book', level: 'new', languageId: 'sq', sort: 'knowledge', minEncounters: 3, firstEncounterFrom: '2026-09-01', lastEncounterTo: '2026-10-10', requiresAssistance: true, unresolved: false, reviewStatus: 'active', sourceRef: 'reader:chapter-2' });
    rig.q('#vocabulary-next').click();
    await vi.waitFor(() => expect(queries.length).toBe(3));
    expect(queries[2]).toMatchObject({ after: 'cursor-1', search: 'book', level: 'new', sort: 'knowledge', minEncounters: 3, requiresAssistance: true, unresolved: false, reviewStatus: 'active' });
    expect(rig.q('#vocabulary-results').textContent).toContain('shtëpi');
    rig.q<HTMLSelectElement>('#vocabulary-order').value = 'recent';
    rig.q<HTMLSelectElement>('#vocabulary-order').dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(queries.length).toBe(4));
    expect(queries[3]).toMatchObject({ sort: 'recent' });
    expect(queries[3]).not.toHaveProperty('after');
    rig.q('#vocabulary-next').click();
    await vi.waitFor(() => expect(queries.length).toBe(5));
    expect(queries[4]).toMatchObject({ sort: 'recent', after: 'cursor-2' });
    rig.deps.win.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(queries.length).toBe(6));
    expect(queries[5]).toMatchObject({ sort: 'recent' });
    expect(queries[5]).not.toHaveProperty('after');
  });

  it('loads bounded unit details and event history only when the learner opens a row', async () => {
    const rig = await makeRig({ signedIn: true });
    const unitId = 'lemma:sq:libër:NOUN';
    const report = {
      unit: { unitId, label: 'libër', kind: 'lexeme', languageId: 'sq', status: 'verified', features: { number: 'singular' } },
      analyses: [{ status: 'verified', candidates: [{ lemmaId: unitId, pos: 'NOUN', features: { case: 'nominative' } }] }],
      relations: [{ relation: 'form-of', fromId: 'form:sq:libri', toId: unitId }],
    } as unknown as UnitReport;
    const unit = vi.fn(async () => ({ ok: true as const, status: 200, data: report }));
    const listEvents = vi.fn(async () => ({ ok: true as const, status: 200, data: { events: [{ kind: 'CardReviewed', at: '2026-10-01T00:00:00Z', payload: { rating: 3 } }], head: 1 } }));
    const units = vi.fn(async () => ({ ok: true as const, status: 200, data: { units: { 'form:sq:libri': { unit: { label: 'libri' } } }, missing: [] } }));
    const factsFor = vi.fn(async () => ({
      unit: report.unit, relations: [], analyses: [], status: 'verified' as const, lemma: 'libër', pos: 'NOUN',
      glosses: ['book'], glossAttribution: 'Pack lexicon', constructionIds: [],
      featureExplanations: { 'number=singular': 'One item.' }, siblingForms: [], exampleSentences: [], pronunciationNotes: [],
    }));
    rig.app.ctx.engine.factsFor = factsFor;
    await useVocabularyApi(rig, () => ({ items: [item(unitId, 'libër', 'new')], catalog }), { unit, listEvents, units });
    const detail = rig.q<HTMLDetailsElement>('.vocabulary-detail');
    expect(unit).not.toHaveBeenCalled();
    detail.open = true;
    detail.dispatchEvent(new Event('toggle'));
    await vi.waitFor(() => expect(detail.textContent).toContain('Analysis'));
    expect(unit).toHaveBeenCalledWith(unitId);
    expect(listEvents).toHaveBeenCalledWith({ languageId: 'sq', unitId, limit: 25 });
    expect(detail.textContent).toContain('Meaningbook');
    expect(detail.textContent).toContain('Pack lexicon');
    expect(detail.textContent).toContain('number=singular · One item.');
    expect(detail.textContent).toContain('case=nominative');
    expect(detail.textContent).toContain('form-of');
    expect(detail.textContent).toContain('3');
  });

  it('saves an encountered New unit and toggles an existing GoReview item through suspend and resume events', async () => {
    const rig = await makeRig({ signedIn: true });
    const unitId = unitOf('libër');
    await seed(rig, [cardAdded(ids('L1', 'sq'), 'libër', 'written-recognition', '2026-10-01T00:00:00.000Z')]);
    const queries = await useVocabularyApi(rig, () => ({ items: [item(unitId, 'libër', 'new')], catalog }));
    rig.q('[data-action="suspend-practice"]').click();
    await until(async () => (await queued(rig)).some((event) => event.kind === 'CardRemoved'), 'the suspension event');
    expect((await queued(rig)).find((event) => event.kind === 'CardRemoved')?.payload).toMatchObject({ reason: 'suspended' });
    expect(rig.q('[data-action="resume-practice"]').textContent).toBe('Resume practice');
    rig.q('[data-action="resume-practice"]').click();
    await until(async () => (await queued(rig)).some((event) => event.kind === 'CardAdded'), 'the resume event');
    expect(rig.q('[data-action="suspend-practice"]').textContent).toBe('Suspend practice');
    rig.q('[data-action="save-practice"]').click();
    await until(async () => (await queued(rig)).some((event) => event.kind === 'ItemMarked'), 'the explicit saved request');
    expect((await queued(rig)).find((event) => event.kind === 'ItemMarked')?.payload).toMatchObject({ mark: 'saved' });
    await vi.waitFor(() => expect(queries.length).toBe(2));
  });

  it('keeps the current practice control unchanged when the Repository refuses suspension', async () => {
    const rig = await makeRig({ signedIn: true });
    const unitId = unitOf('libër');
    await seed(rig, [cardAdded(ids('L1', 'sq'), 'libër', 'written-recognition', '2026-10-01T00:00:00.000Z')]);
    await useVocabularyApi(rig, () => ({ items: [item(unitId, 'libër', 'new')], catalog }));
    rig.app.ctx.record = async () => ({ queued: 0, duplicates: 0, refused: [{ id: 'event-1', issues: ['temporarily refused'] }] });
    rig.q('[data-action="suspend-practice"]').click();
    await vi.waitFor(() => expect(rig.q('#vocabulary').textContent).toContain('temporarily refused'));
    const control = rig.q<HTMLButtonElement>('[data-action="suspend-practice"]');
    expect(control.textContent).toBe('Suspend practice');
    expect(control.disabled).toBe(false);
    expect(rig.root.querySelector('[data-action="resume-practice"]')).toBeNull();
  });
});
