// @vitest-environment jsdom
/**
 * My vocab: a form and its lemma are ONE entry even where the Repository does not link them (the owner's report of 2026-11-14: forms of
 * Psalm 65:5 listed as words of their own, New, beside lemmas marked Automatic). The readers record the form id and the lemma id of a
 * word, and the service's resolver relates fewer forms to a lemma than the readers do; the pack facts this screen already fetches for a
 * word's meaning name the lemma, and the form then joins the lemma's entry.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UnitKnowledge } from '../../packages/repository-contract/src';
import type { RepositoryApi, VocabularyItem, VocabularyPage } from '../../packages/repository-service/src/api';
import { foldFormRow, type VocabRow } from '../../packages/goreview/app/deckModel';
import { forgetPaintedHome } from '../../packages/goreview/app/screens/review';
import { projectWordAnalysis } from '../../src/core/word-analysis';
import { destroyRigs, fakeFacts, flush, makeRig, until, type Rig } from './helpers';

afterEach(() => destroyRigs());

const passing = { exposure: { observations: 1, negative: 0, positive: 0 } } as unknown as UnitKnowledge['dimensions'];
function entry(unitId: string, label: string, kind: 'lexeme' | 'form', over: Partial<UnitKnowledge> = {}, forms: string[] = [label], lastSeenAt = '2026-11-13T10:00:00.000Z'): VocabularyItem {
  const knowledge = { unitId, languageId: 'sq', level: 'seen', encounters: 1, firstSeenAt: '2026-11-01T00:00:00.000Z', lastSeenAt, dimensions: passing, ...over } as UnitKnowledge;
  return { knowledge, unit: { unitId, languageId: 'sq', label, kind } as VocabularyItem['unit'], surfaceForms: forms, lastEncounter: lastSeenAt, sources: [] };
}
/** The service lists the records and relates NO form to a lemma (its resolver does not know these forms). */
function useRecords(rig: Rig, items: VocabularyItem[]): { vocabulary: ReturnType<typeof vi.fn>; units: ReturnType<typeof vi.fn> } {
  const page: VocabularyPage = { items, catalog: { total: items.length, counts: { new: 0, seen: items.length, recognized: 0, familiar: 0, known: 0, automatic: 0 } } };
  const units = vi.fn(async (ids: string[]) => ({ ok: true as const, status: 200, data: { units: Object.fromEntries(ids.map((id) => [id, { unit: {}, analyses: [], provenance: {}, relations: [] }])), missing: [] } }));
  const vocabulary = vi.fn(async () => ({ ok: true as const, status: 200, data: page }));
  rig.app.ctx.api = async () => ({ api: { vocabulary, units } as unknown as RepositoryApi, session: undefined, baseUrl: '' });
  forgetPaintedHome(rig.app.ctx);
  return { vocabulary, units };
}
/** The pack facts: each form's analysis names its lemma (as the language pack's own analyser reads it); a lemma has a meaning. */
function useFacts(rig: Rig, lemmaOf: Record<string, { lemma: string; pos?: string; others?: Array<{ lemma: string; pos?: string }> } | undefined>, glossOf: Record<string, string> = {}): { calls: string[] } {
  const calls: string[] = [];
  rig.deps.engine.factsFor = async (unitId, languageId) => {
    calls.push(unitId);
    const base = (await fakeFacts.factsFor(unitId, languageId))!;
    const reading = lemmaOf[unitId];
    return {
      ...base, glosses: glossOf[unitId] ? [glossOf[unitId]] : [],
      ...(unitId.startsWith('form:') ? {
        wordAnalysis: projectWordAnalysis({ language: 'sq', surface: unitId.split(':')[2], ...(reading ? { lemma: reading.lemma, ...(reading.pos ? { pos: reading.pos } : {}) } : {}) }),
        alternativeReadings: (reading?.others ?? []).map((o) => ({ ...o, glosses: [] })),
      } : {}),
    } as never;
  };
  return { calls };
}
const shownRows = (rig: Rig): Array<[string | null, string | null, string | undefined]> =>
  rig.qa('.vocab-item').map((li) => [li.getAttribute('data-unit-id'), li.getAttribute('data-level'), li.querySelector('.vocab-met')?.textContent ?? undefined]);

describe('foldFormRow: a form joins the entry of its lemma', () => {
  const lemma: VocabRow = { unitId: 'lemma:he:בַּיִת:NOUN', label: 'בַּיִת', kind: 'lexeme', level: 'automatic', encounters: 4, lastSeenAt: '2026-11-10T00:00:00.000Z', metAs: ['לְבֵית'], unitIds: ['lemma:he:בַּיִת:NOUN'] };
  const form: VocabRow = { unitId: 'form:he:בֵּיתֶךָ', label: 'בֵּיתֶךָ', kind: 'form', level: 'new', encounters: 1, lastSeenAt: '2026-11-13T00:00:00.000Z', unitIds: ['form:he:בֵּיתֶךָ'] };
  const other: VocabRow = { unitId: 'lemma:he:הֵיכָל:NOUN', label: 'הֵיכָל', kind: 'lexeme', level: 'new', encounters: 1 };

  it('the lemma is the word shown, at the higher level, with the larger count, the later date, and the form listed as met', () => {
    const out = foldFormRow([lemma, form, other], 'form:he:בֵּיתֶךָ', [{ lemma: 'בַּיִת', pos: 'NOUN' }], 'he');
    expect(out).toEqual([
      { unitId: 'lemma:he:בַּיִת:NOUN', label: 'בַּיִת', kind: 'lexeme', level: 'automatic', encounters: 4, lastSeenAt: '2026-11-13T00:00:00.000Z', metAs: ['לְבֵית', 'בֵּיתֶךָ'], unitIds: ['lemma:he:בַּיִת:NOUN', 'form:he:בֵּיתֶךָ'] },
      other,
    ]);
    // a form the learner knows better than the lemma's own row raises the entry (the readers take the highest of a word's rows)
    expect(foldFormRow([{ ...lemma, level: 'seen' }, { ...form, level: 'known' }], form.unitId, [{ lemma: 'בַּיִת', pos: 'NOUN' }], 'he')[0].level).toBe('known');
  });

  it('takes the first of the analysis’s lemmas that has an entry, under the part of speech it names', () => {
    const verb: VocabRow = { unitId: 'lemma:he:טוֹב:VERB', label: 'טוֹב', kind: 'lexeme', level: 'seen', encounters: 2 };
    const noun: VocabRow = { unitId: 'lemma:he:טוּב:NOUN', label: 'טוּב', kind: 'lexeme', level: 'recognized', encounters: 1 };
    const f: VocabRow = { unitId: 'form:he:בְּטוּב', label: 'בְּטוּב', kind: 'form', level: 'new', encounters: 1 };
    // the best reading has no entry (an adjective nobody recorded): the next one that has is taken
    const out = foldFormRow([verb, noun, f], f.unitId, [{ lemma: 'טוֹב', pos: 'ADJ' }, { lemma: 'טוּב', pos: 'NOUN' }, { lemma: 'טוֹב', pos: 'VERB' }], 'he');
    expect(out.map((r) => [r.unitId, r.metAs])).toEqual([['lemma:he:טוֹב:VERB', undefined], ['lemma:he:טוּב:NOUN', ['בְּטוּב']]]);
    // a reading with no part of speech takes the lemma under any; a lemma recorded without one is found by a reading that has one
    expect(foldFormRow([verb, f], f.unitId, [{ lemma: 'טוֹב' }], 'he').map((r) => r.unitId)).toEqual(['lemma:he:טוֹב:VERB']);
    const bare: VocabRow = { unitId: 'lemma:he:טוּב', label: 'טוּב', kind: 'lexeme', level: 'seen', encounters: 1 };
    expect(foldFormRow([bare, f], f.unitId, [{ lemma: 'טוּב', pos: 'NOUN' }], 'he').map((r) => r.unitId)).toEqual(['lemma:he:טוּב']);
  });

  it('changes nothing (the same array) when the lemma has no entry, when the form is already under a lemma, or when there is no such form', () => {
    const rows = [lemma, form, other];
    expect(foldFormRow(rows, form.unitId, [{ lemma: 'אֶשֶׁר', pos: 'NOUN' }], 'he')).toBe(rows);
    expect(foldFormRow(rows, form.unitId, [], 'he')).toBe(rows);
    expect(foldFormRow(rows, 'form:he:nothing', [{ lemma: 'בַּיִת', pos: 'NOUN' }], 'he')).toBe(rows);
    const folded = foldFormRow(rows, form.unitId, [{ lemma: 'בַּיִת', pos: 'NOUN' }], 'he');
    expect(foldFormRow(folded, form.unitId, [{ lemma: 'הֵיכָל', pos: 'NOUN' }], 'he')).toBe(folded); // once under its lemma it is not moved
    // another language's lemma of the same spelling is not this form's lemma
    expect(foldFormRow(rows, form.unitId, [{ lemma: 'בַּיִת', pos: 'NOUN' }], 'arc')).toBe(rows);
    // a form never folds into another form
    const twin: VocabRow = { unitId: 'form:he:בַּיִת', label: 'בַּיִת', kind: 'form', level: 'seen', encounters: 1, unitIds: ['form:he:בַּיִת', 'lemma:he:בַּיִת:NOUN'] };
    expect(foldFormRow([twin, form], form.unitId, [{ lemma: 'בַּיִת', pos: 'NOUN' }], 'he')).toHaveLength(2);
  });

  it('keeps at most three met-as forms and never lists the lemma’s own spelling', () => {
    const many = { ...lemma, metAs: ['לְבֵית', 'בֵּית', 'הַבַּיִת'] };
    expect(foldFormRow([many, form], form.unitId, [{ lemma: 'בַּיִת', pos: 'NOUN' }], 'he')[0].metAs).toEqual(['לְבֵית', 'בֵּית', 'הַבַּיִת']);
    const same: VocabRow = { ...form, unitId: 'form:he:בַּיִת', label: 'בַּיִת' };
    expect(foldFormRow([{ ...lemma, metAs: undefined }, same], same.unitId, [{ lemma: 'בַּיִת', pos: 'NOUN' }], 'he')[0].metAs).toBeUndefined();
  });
});

describe('My vocab: a form the service does not relate to its lemma', () => {
  const house = entry('lemma:sq:shtepi:NOUN', 'shtepi', 'lexeme', { level: 'automatic', encounters: 5, selfMark: { mark: 'automatic', at: '2026-11-02T00:00:00.000Z' } as never }, ['shtepi', 'shtepise'], '2026-11-12T10:00:00.000Z');
  const yourHouse = entry('form:sq:shtepine', 'shtepine', 'form');
  const temple = entry('lemma:sq:tempull:NOUN', 'tempull', 'lexeme', {}, ['tempull'], '2026-11-13T09:00:00.000Z');
  const yourTemple = entry('form:sq:tempullin', 'tempullin', 'form', {}, ['tempullin'], '2026-11-13T09:30:00.000Z');
  const orphan = entry('form:sq:lumturi', 'lumturi', 'form', {}, ['lumturi'], '2026-11-13T08:00:00.000Z');

  it('joins the lemma’s entry once the pack facts name the lemma: one word, at the lemma’s level, with the form listed as met', async () => {
    const rig = await makeRig({ signedIn: true });
    const service = useRecords(rig, [house, yourHouse, temple, yourTemple, orphan]);
    const facts = useFacts(rig, {
      'form:sq:shtepine': { lemma: 'shtepi', pos: 'NOUN' },
      'form:sq:tempullin': { lemma: 'tempull', pos: 'NOUN' },
      'form:sq:lumturi': { lemma: 'lumturi', pos: 'NOUN' }, // its lemma was never recorded: it stays a word of its own
    }, { 'lemma:sq:shtepi:NOUN': 'house' });
    await rig.go('review/vocab');
    await until(() => rig.qa('.vocab-item').length === 3, 'the forms to join their lemmas');
    expect(shownRows(rig).sort()).toEqual([
      ['form:sq:lumturi', 'new', undefined],
      ['lemma:sq:shtepi:NOUN', 'automatic', 'met as: shtepise, shtepine'],
      ['lemma:sq:tempull:NOUN', 'new', 'met as: tempullin'],
    ]);
    // the forms are gone as words of their own; the word reads at the level the readers show it at
    expect(rig.root.querySelector('[data-unit-id="form:sq:shtepine"]')).toBeNull();
    expect(rig.q('[data-unit-id="lemma:sq:shtepi:NOUN"] .vocab-level').textContent).toBe('automatic');
    await until(() => rig.q('[data-unit-id="lemma:sq:shtepi:NOUN"] [data-gloss]').textContent === 'house', 'the lemma’s meaning');
    // folding asks the service for nothing: no listing and no relations lookup follows it, and the facts are the ones the screen fetched anyway (once per entry)
    const asked = [service.vocabulary.mock.calls.length, service.units.mock.calls.length];
    await flush(30);
    expect([service.vocabulary.mock.calls.length, service.units.mock.calls.length]).toEqual(asked);
    expect([...facts.calls].sort()).toEqual(['form:sq:lumturi', 'form:sq:shtepine', 'form:sq:tempullin', 'lemma:sq:shtepi:NOUN', 'lemma:sq:tempull:NOUN']);
  });

  it('stays folded when the list is read again, and when the screen is opened again in the same session', async () => {
    const rig = await makeRig({ signedIn: true });
    useRecords(rig, [house, yourHouse]);
    useFacts(rig, { 'form:sq:shtepine': { lemma: 'shtepi', pos: 'NOUN' } });
    await rig.go('review/vocab');
    await until(() => rig.qa('.vocab-item').length === 1, 'the form to join its lemma');
    // opened again: what was learned folds the list before it is painted, so the form never shows as a word of its own
    const facts = useFacts(rig, { 'form:sq:shtepine': { lemma: 'shtepi', pos: 'NOUN' } });
    await rig.go('review');
    await rig.go('review/vocab');
    await until(() => rig.qa('.vocab-item').length > 0, 'the words again');
    expect(shownRows(rig)).toEqual([['lemma:sq:shtepi:NOUN', 'automatic', 'met as: shtepise, shtepine']]);
    expect(facts.calls.filter((id) => id.startsWith('form:'))).toEqual([]); // the form's facts are not needed a second time
  });

  it('a form whose analysis names no lemma, and a list with no lemma for it, are left as they were', async () => {
    const rig = await makeRig({ signedIn: true });
    useRecords(rig, [yourHouse, temple]);
    useFacts(rig, { 'form:sq:shtepine': undefined });
    await rig.go('review/vocab');
    await until(() => rig.qa('.vocab-item').length === 2, 'the words');
    await until(() => rig.qa('[data-gloss]').length === 2, 'the meanings to settle');
    expect(shownRows(rig).sort()).toEqual([['form:sq:shtepine', 'new', undefined], ['lemma:sq:tempull:NOUN', 'new', undefined]]);
  });

  it('the question open under a form moves with it to the lemma', async () => {
    const rig = await makeRig({ signedIn: true });
    useRecords(rig, [house, yourHouse]);
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    const facts = useFacts(rig, { 'form:sq:shtepine': { lemma: 'shtepi', pos: 'NOUN' } });
    const answer = rig.deps.engine.factsFor!;
    rig.deps.engine.factsFor = async (unitId, languageId, api) => { await held; return answer(unitId, languageId, api); };
    await rig.go('review/vocab');
    await until(() => rig.qa('.vocab-item').length === 2, 'both entries, before the facts arrive');
    rig.q<HTMLButtonElement>('[data-unit-id="form:sq:shtepine"] button.vocab-row').click();
    await until(() => !!rig.root.querySelector('[data-unit-id="form:sq:shtepine"] .vocab-ask'), 'the question under the form');
    release();
    await until(() => rig.qa('.vocab-item').length === 1, 'the form to join its lemma');
    expect(rig.root.querySelector('[data-unit-id="lemma:sq:shtepi:NOUN"] .vocab-ask')).not.toBeNull();
    expect(facts.calls.length).toBeGreaterThan(0);
  });
});
