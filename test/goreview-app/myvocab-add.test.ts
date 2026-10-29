// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UnitKnowledge } from '../../packages/repository-contract/src';
import type { RepositoryApi, VocabularyItem, VocabularyPage } from '../../packages/repository-service/src/api';
import { addedCardFor, decksKey } from '../../packages/goreview/app/deckModel';
import { forgetPaintedHome } from '../../packages/goreview/app/screens/review';
import { destroyRigs, makeRig, until, type Rig } from './helpers';

afterEach(() => destroyRigs());
const click = (el: Element): void => (el as HTMLElement).click();

function entry(unitId: string, label: string, kind: string): VocabularyItem {
  const knowledge = { unitId, languageId: 'sq', level: 'new', encounters: 1, firstSeenAt: '2026-09-01T00:00:00.000Z', lastSeenAt: '2026-10-06T00:00:00.000Z' } as UnitKnowledge;
  return { knowledge, unit: { unitId, languageId: 'sq', label, kind } as VocabularyItem['unit'], surfaceForms: [label], lastEncounter: '2026-10-06T00:00:00.000Z', sources: [] };
}
function useRecords(rig: Rig, items: VocabularyItem[]): void {
  const page: VocabularyPage = { items, catalog: { total: items.length, counts: { new: items.length, seen: 0, recognized: 0, familiar: 0, known: 0, automatic: 0 } } };
  const units = vi.fn(async (ids: string[]) => ({ ok: true as const, status: 200, data: { units: Object.fromEntries(ids.map((id) => [id, { unit: {}, analyses: [], provenance: {}, relations: [] }])), missing: [] } }));
  const api = { vocabulary: vi.fn(async () => ({ ok: true as const, status: 200, data: page })), units } as unknown as RepositoryApi;
  rig.app.ctx.api = async () => ({ api, session: undefined, baseUrl: '' });
  forgetPaintedHome(rig.app.ctx);
}
/** Adds one row from the My vocab screen and returns what the deck store then holds for it. */
async function addFrom(rig: Rig, unitId: string): Promise<{ unitId: string; unitKind: string; dimension: string; family: string }> {
  await rig.go('review/vocab');
  await until(() => rig.qa('.vocab-item').length === 2, 'the words');
  click(rig.q(`[data-unit-id="${unitId}"] button.vocab-row`));
  await until(() => !!rig.root.querySelector('[data-action="add-to-deck"]'), 'the question');
  click(rig.q('[data-action="add-to-deck"]'));
  await until(() => !!rig.root.querySelector(`[data-unit-id="${unitId}"] .vocab-selected`), 'the row to identify optional practice');
  const key = decksKey('L1', 'sq');
  const added = ((await rig.area.get(key))[key] as { added?: { unitId: string; unitKind: string; dimension: string; family: string }[] }).added ?? [];
  return added.find((w) => w.unitId === unitId)!;
}
const WORDS = [entry('lemma:sq:mace:NOUN', 'mace', 'lexeme'), entry('phrase:sq:me-gjithe-zemer', 'me gjithë zemër', 'multiword')];

describe('My vocab: what Add asks the unit as', () => {
  it('adding a phrase selects phrase-comprehension, the only card a multiword unit can build', async () => {
    const rig = await makeRig({ signedIn: true });
    useRecords(rig, WORDS);
    const stored = await addFrom(rig, 'phrase:sq:me-gjithe-zemer');
    expect(stored).toMatchObject({ dimension: 'phrase-comprehension', family: 'phrase-comprehension' });
  });

  it('adding a word selects written-recognition', async () => {
    const rig = await makeRig({ signedIn: true });
    useRecords(rig, WORDS);
    const stored = await addFrom(rig, 'lemma:sq:mace:NOUN');
    expect(stored).toMatchObject({ dimension: 'written-recognition', family: 'written-recognition' });
  });

  it('chooses by kind or by the phrase: id prefix, and the copy no longer says the automatic batch is untouched', async () => {
    expect(addedCardFor('x', 'multiword').dimension).toBe('phrase-comprehension');
    expect(addedCardFor('x', 'phrase').dimension).toBe('phrase-comprehension');
    expect(addedCardFor('phrase:sq:y', undefined).dimension).toBe('phrase-comprehension');
    expect(addedCardFor('lemma:sq:z:NOUN', 'lexeme').dimension).toBe('written-recognition');
    expect(addedCardFor('form:sq:z', 'form').dimension).toBe('written-recognition');
    const rig = await makeRig({ signedIn: true });
    useRecords(rig, WORDS);
    await addFrom(rig, 'lemma:sq:mace:NOUN');
    const text = rig.q('#vocab-status, .status').textContent ?? '';
    expect(text).not.toMatch(/does not change the next automatic batch/);
    expect(text).toMatch(/leads the next deck you start/);
  });
});
