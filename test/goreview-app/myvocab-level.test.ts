// @vitest-environment jsdom
/** My vocab shows (and sorts by) the level a learner would call true: a word met only in passing is New (owner, 2026-11-05). The Repository's level is not touched. */
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
  it('are listed and sorted as New, and a looked-up word as Seen; the Repository rows are untouched', async () => {
    const rig = await makeRig({ signedIn: true });
    const passing = entry('lemma:sq:mace:NOUN', 'mace', { dimensions: dims(6, 0) }, 6);
    const looked = entry('lemma:sq:qen:NOUN', 'qen', { dimensions: dims(1, 1) }, 1);
    const marked = entry('lemma:sq:dru:NOUN', 'dru', { dimensions: dims(2, 0), selfMark: { mark: 'seen', at: '2026-10-05T00:00:00.000Z' } }, 2);
    const known = entry('lemma:sq:lule:NOUN', 'lule', { level: 'known', dimensions: dims(2, 0, { readingRecognition: { observations: 4, score: 0.9, confidence: 0.8, positive: 4, negative: 0 } }) }, 6);
    useRecords(rig, [looked, known, marked, passing]);
    await rig.go('review/vocab');
    await until(() => rig.qa('.vocab-item').length === 4, 'the words');
    const shown = rig.qa('.vocab-item').map((li) => [li.getAttribute('data-unit-id'), li.getAttribute('data-level'), li.querySelector('.vocab-level')?.textContent]);
    // least known first: New (met in passing) before Seen (fewest encounters first), Known last
    expect(shown).toEqual([
      ['lemma:sq:mace:NOUN', 'new', 'new'],
      ['lemma:sq:qen:NOUN', 'seen', 'seen'],
      ['lemma:sq:dru:NOUN', 'seen', 'seen'],
      ['lemma:sq:lule:NOUN', 'known', 'known'],
    ]);
    expect(passing.knowledge.level).toBe('seen');
  });
});
