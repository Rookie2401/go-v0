// @vitest-environment jsdom
/**
 * My vocab lists the words the learner PICKED, Seen to Automatic, never New (the owner, 2026-11-14): a word met only in passing, which reads
 * New (owner, 2026-11-05), is not in the list at all, and is not counted on the home. The Repository's row is not touched.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UnitKnowledge } from '../../packages/repository-contract/src';
import type { RepositoryApi, VocabularyItem, VocabularyPage } from '../../packages/repository-service/src/api';
import { forgetPaintedHome } from '../../packages/goreview/app/screens/review';
import { destroyRigs, makeRig, until, type Rig } from './helpers';

afterEach(() => destroyRigs());

function entry(unitId: string, label: string, over: Partial<UnitKnowledge>, encounters: number): VocabularyItem {
  const knowledge = { unitId, languageId: 'sq', level: 'seen', encounters, firstSeenAt: '2026-09-01T00:00:00.000Z', lastSeenAt: '2026-10-06T00:00:00.000Z', ...over } as UnitKnowledge;
  return { knowledge, unit: { unitId, languageId: 'sq', label, kind: 'lexeme' } as VocabularyItem['unit'], surfaceForms: [label], lastEncounter: '2026-10-06T00:00:00.000Z', sources: [] };
}
const dims = (observations: number, negative: number, extra: Record<string, unknown> = {}) => ({ exposure: { observations, negative, positive: 0 }, ...extra }) as unknown as UnitKnowledge['dimensions'];
function useRecords(rig: Rig, items: VocabularyItem[]): void {
  const page: VocabularyPage = { items, catalog: { total: items.length, counts: { new: 0, seen: items.length, recognized: 0, familiar: 0, known: 0, automatic: 0 } } };
  const units = vi.fn(async (ids: string[]) => ({ ok: true as const, status: 200, data: { units: Object.fromEntries(ids.map((id) => [id, { unit: {}, analyses: [], provenance: {}, relations: [] }])), missing: [] } }));
  const api = { vocabulary: vi.fn(async () => ({ ok: true as const, status: 200, data: page })), units } as unknown as RepositoryApi;
  rig.app.ctx.api = async () => ({ api, session: undefined, baseUrl: '' });
  forgetPaintedHome(rig.app.ctx);
}

describe('My vocab: words met only in passing', () => {
  it('are not listed at all; a looked-up word is Seen, a marked one keeps its mark; the Repository rows are untouched', async () => {
    const rig = await makeRig({ signedIn: true });
    const passing = entry('lemma:sq:mace:NOUN', 'mace', { dimensions: dims(6, 0) }, 6);
    const looked = entry('lemma:sq:qen:NOUN', 'qen', { dimensions: dims(1, 1) }, 1);
    const marked = entry('lemma:sq:dru:NOUN', 'dru', { dimensions: dims(2, 0), selfMark: { mark: 'seen', at: '2026-10-05T00:00:00.000Z' } }, 2);
    const known = entry('lemma:sq:lule:NOUN', 'lule', { level: 'known', dimensions: dims(2, 0, { readingRecognition: { observations: 4, score: 0.9, confidence: 0.8, positive: 4, negative: 0 } }) }, 6);
    useRecords(rig, [looked, known, marked, passing]);
    await rig.go('review/vocab');
    await until(() => rig.qa('.vocab-item').length === 3, 'the words');
    const shown = rig.qa('.vocab-item').map((li) => [li.getAttribute('data-unit-id'), li.getAttribute('data-level'), li.querySelector('.vocab-level')?.textContent]);
    // least known first: Seen (fewest encounters first), Known last; the word only met in passing (six times, never picked) is absent
    expect(shown).toEqual([
      ['lemma:sq:qen:NOUN', 'seen', 'seen'],
      ['lemma:sq:dru:NOUN', 'seen', 'seen'],
      ['lemma:sq:lule:NOUN', 'known', 'known'],
    ]);
    expect(rig.root.querySelector('[data-unit-id="lemma:sq:mace:NOUN"]')).toBeNull();
    expect(rig.root.querySelector('[data-level="new"]')).toBeNull();
    expect(passing.knowledge.level).toBe('seen');
  });

  it('a learner with only words met in passing sees an empty list that says how a word gets there, and the home counts none', async () => {
    const rig = await makeRig({ signedIn: true });
    useRecords(rig, [entry('lemma:sq:mace:NOUN', 'mace', { dimensions: dims(6, 0) }, 6), entry('lemma:sq:zog:NOUN', 'zog', { level: 'new', dimensions: dims(0, 0) }, 1)]);
    await rig.go('review/vocab');
    await until(() => !!rig.root.querySelector('#vocab-empty'), 'the empty list');
    expect(rig.q('#vocab-empty').textContent).toBe('Words you pick while reading with GoLearn appear here: tap a word, or mark how well you know it.');
    expect(rig.qa('.vocab-item')).toHaveLength(0);
    await rig.go('review');
    await until(() => rig.q('#vocab-count').getAttribute('data-completeness') === 'complete', 'the count');
    expect(rig.q('#vocab-count').textContent).toBe('0 words');
  });
});
