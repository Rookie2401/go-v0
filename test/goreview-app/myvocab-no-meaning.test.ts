// @vitest-environment jsdom
/**
 * A word My vocab lists whose facts carry no meaning (German Lehrer: the deck gate holds it and the dictionary has no entry of that spelling)
 * showed a blank where the meaning goes. It now says "no meaning found", and a word with a meaning still shows it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UnitKnowledge } from '../../packages/repository-contract/src';
import type { RepositoryApi, VocabularyItem, VocabularyPage } from '../../packages/repository-service/src/api';
import { destroyRigs, makeRig, until, unitOf, PICKED } from './helpers';

afterEach(() => destroyRigs());

const entry = (unitId: string, label: string): VocabularyItem => ({
  knowledge: { unitId, languageId: 'sq', level: 'seen', encounters: 1, firstSeenAt: '2026-09-01T00:00:00.000Z', lastSeenAt: '2026-10-06T00:00:00.000Z', dimensions: PICKED } as UnitKnowledge,
  unit: { unitId, languageId: 'sq', label, kind: 'lexeme' } as VocabularyItem['unit'], surfaceForms: [label], lastEncounter: '2026-10-06T00:00:00.000Z', sources: [] });

describe('My vocab: a word without a meaning', () => {
  it('says "no meaning found" instead of a blank, and still shows a meaning where there is one', async () => {
    const rig = await makeRig({ signedIn: true });
    const items = [entry(unitOf('zog'), 'zog'), entry(unitOf('mace'), 'mace')];
    const page: VocabularyPage = { items, catalog: { total: 2, counts: { new: 0, seen: 2, recognized: 0, familiar: 0, known: 0, automatic: 0 } } };
    const api = { vocabulary: vi.fn(async () => ({ ok: true as const, status: 200, data: page })) } as unknown as RepositoryApi;
    rig.app.ctx.api = async () => ({ api, session: undefined, baseUrl: '' });
    const real = rig.app.ctx.engine.factsFor!;
    rig.app.ctx.engine.factsFor = async (unitId, languageId, a) => {
      const f = await real(unitId, languageId, a);
      return unitId === unitOf('mace') && f ? { ...f, glosses: [] } : f;
    };
    await rig.go('review/vocab');
    await until(() => rig.qa('.vocab-item').length === 2, 'the words');
    const gloss = (w: string): string => rig.q(`[data-unit-id="${unitOf(w)}"] .vocab-gloss`).textContent ?? '';
    await until(() => gloss('zog') !== '' && gloss('mace') !== '', 'both meanings looked up');
    expect(gloss('zog')).toBe('bird');
    expect(gloss('mace')).toBe('no meaning found');
  });
});
