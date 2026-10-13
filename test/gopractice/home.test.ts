// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UnitKnowledge } from '../../packages/repository-contract/src';
import type { RepositoryApi, VocabularyItem, VocabularyPage } from '../../packages/repository-service/src/api';
import { decksKey, sortVocab, type SavedDeck } from '../../packages/gopractice/deckModel';
import { UI_KEY } from '../../packages/gopractice/screens/uiprefs';
import { candidate, defaultService, destroyRigs, dueCard, ids, makeRig, reopen, seed, until, unitOf, type Rig } from './helpers';

afterEach(() => destroyRigs());
const A = ids('L1', 'sq');
const click = (el: Element): void => (el as HTMLElement).click();
const savedDecks = async (rig: Rig): Promise<SavedDeck[]> => {
  const key = decksKey('L1', 'sq');
  return ((await rig.area.get(key))[key] as { decks?: SavedDeck[] } | undefined)?.decks ?? [];
};

describe('the GoReview home', () => {
  it('shows four entries in order (GoTell above a rule, the current deck, previous decks, my vocab) and nothing else', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form')]);
    await reopen(rig);
    expect(rig.qa('#review-home > section').map((s) => s.getAttribute('data-entry'))).toEqual(['tell', 'deck', 'previous', 'vocab']);
    expect(rig.qa('#review-home .entry-title').map((t) => t.textContent)).toEqual(['GoTell', 'Current deck', 'Previous decks', 'My vocab']);
    expect(rig.q('#entry-tell .entry-kicker').textContent).toBe('Write and be corrected');
    expect(rig.q('#deck-count').textContent).toBe('2 cards ready');
    expect(rig.q('#previous-count').textContent).toBe('None saved yet');
    expect(rig.q('#vocab-count').textContent).toMatch(/^\d+ words?$/);
    expect(rig.qa('#review-home button').map((b) => b.textContent)).toEqual(['Begin', 'Save deck']);
    // none of what the home used to show
    for (const gone of ['.card', '#due-summary', '.time-presets', '#session-controls', '#candidates', '#deck-list', 'table', 'dl', 'details', '#link-transfer']) {
      expect(rig.root.querySelector(`#review-home ${gone}`), gone).toBeNull();
    }
    expect(rig.q('#review-home').textContent).not.toMatch(/scheduler|fsrs|Why|Due\b/);
    // the header: the language and the Settings cog
    expect(rig.q('header #settings-link').getAttribute('aria-label')).toBe('Settings');
  });

  it('GoTell is a link to #/tell and opens the GoTell workspace', async () => {
    const rig = await makeRig({ signedIn: true });
    expect(rig.q<HTMLAnchorElement>('#entry-tell').getAttribute('href')).toBe('#/tell');
    click(rig.q('#entry-tell'));
    await until(() => rig.app.current() === 'tell', 'GoTell');
  });

  it('the deck is never empty while the Repository has vocabulary: with nothing due or admitted it is filled from the candidates, and Begin starts it', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, signedIn: true });
    await rig.app.ctx.state.setPrefs('L1', { languageId: 'sq', sessionMinutes: 10, maxNew: 0, desiredRetention: 0.9, includeListening: false, grammarShare: 0.2, prioritizeSaved: true });
    service.candidates.set('L1-e1', [candidate('det', 0.8), candidate('diell', 0.3), candidate('hene', 0.05)]);
    await reopen(rig);
    expect(Number(rig.q('#deck-count').getAttribute('data-cards'))).toBeGreaterThan(0);
    expect(rig.q('#deck-count').textContent).toMatch(/^\d+ cards? ready$/);
    expect(rig.q<HTMLButtonElement>('#start-session').disabled).toBe(false);
    expect(rig.q('#review-home').textContent).not.toMatch(/because|no cards are due|filled/i); // no explanation on the home
    click(rig.q('#start-session'));
    await until(() => rig.app.current() === 'review/session' && !!rig.root.querySelector('#session .exercise'), 'the session');
  });

  it('with no vocabulary at all it says how to build the first deck and Begin is disabled', async () => {
    const rig = await makeRig({ signedIn: true });
    expect(rig.q('#deck-count').textContent).toBe('Read with GoLearn to build your first deck');
    expect(rig.q<HTMLButtonElement>('#start-session').disabled).toBe(true);
    expect(rig.root.querySelector('#save-deck')).toBeNull();
  });

  it('Save deck moves the deck to Previous decks and plans a fresh one; the list offers Practise again and Remove', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form')]);
    await reopen(rig);
    click(rig.q('#save-deck'));
    await until(() => rig.q('#previous-count').textContent === '1 saved', 'the saved count');
    const [deck] = await savedDecks(rig);
    expect(deck.items.map((i) => i.unitId).sort()).toEqual([unitOf('mace'), unitOf('zog')]);
    expect(deck.languageId).toBe('sq');
    expect(Number(rig.q('#deck-count').getAttribute('data-cards'))).toBeGreaterThan(0); // a fresh deck is ready at once
    expect((await rig.area.get(decksKey('L1', 'sq')))[decksKey('L1', 'sq')]).toMatchObject({ v: 1 });

    click(rig.q('#entry-previous'));
    await until(() => rig.app.current() === 'review/decks' && !!rig.root.querySelector('.deckrow'), 'the list');
    expect(rig.q('.deckrow-line').textContent).toMatch(/ · 2 cards · Albanian$/);
    click(rig.q('[data-action="practise-again"]'));
    await until(() => rig.app.current() === 'review/session' && !!rig.root.querySelector('#session .exercise'), 'the session');
    expect(rig.app.ctx.run.active!.plan.items.map((p) => p.item.unitId).sort()).toEqual([unitOf('mace'), unitOf('zog')]);

    await rig.go('review/decks');
    click(rig.q('[data-action="remove-deck"]'));
    await until(() => !!rig.root.querySelector('#decks-empty'), 'the removal');
    expect(await savedDecks(rig)).toEqual([]);
  });

  it('reads a damaged saved-decks record as no saved decks', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.area.set({ [decksKey('L1', 'sq')]: { v: 7, decks: 'nonsense' } });
    await rig.go('review');
    await until(() => !!rig.root.querySelector('#previous-count'), 'the home');
    expect(rig.q('#previous-count').textContent).toBe('None saved yet');
  });

  it('puts the details, the session controls and the transfer measures one tap away in Settings', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.go('settings');
    expect(rig.q<HTMLAnchorElement>('#link-details').getAttribute('href')).toBe('#/review/details');
    expect(rig.q<HTMLAnchorElement>('#link-transfer').getAttribute('href')).toBe('#/review/transfer');
    expect(rig.q<HTMLAnchorElement>('#link-vocabulary').getAttribute('href')).toBe('#/vocabulary');
  });
});

function word(label: string, level: UnitKnowledge['level'], encounters: number, lastSeenAt: string): VocabularyItem {
  const unitId = `lemma:sq:${label}:NOUN`;
  const knowledge = { unitId, languageId: 'sq', level, encounters, firstSeenAt: '2026-09-01T00:00:00.000Z', lastSeenAt } as UnitKnowledge;
  return { knowledge, unit: { unitId, languageId: 'sq', label, kind: 'lexeme' } as VocabularyItem['unit'], surfaceForms: [label], lastEncounter: lastSeenAt, sources: [] };
}
const WORDS = [
  word('mace', 'known', 9, '2026-10-01T00:00:00.000Z'), word('zog', 'new', 1, '2026-10-05T00:00:00.000Z'),
  word('qen', 'seen', 4, '2026-10-03T00:00:00.000Z'), word('shtepi', 'seen', 2, '2026-10-07T00:00:00.000Z'), word('diell', 'recognized', 3, '2026-10-02T00:00:00.000Z'),
];
async function openVocab(rig: Rig): Promise<void> {
  const page: VocabularyPage = { items: WORDS, catalog: { total: WORDS.length, counts: { new: 1, seen: 2, recognized: 1, familiar: 0, known: 1, automatic: 0 } } };
  const api = { vocabulary: vi.fn(async () => ({ ok: true as const, status: 200, data: page })) } as unknown as RepositoryApi;
  rig.app.ctx.api = async () => ({ api, session: undefined, baseUrl: '' });
  await rig.go('review/vocab');
  await until(() => rig.qa('.vocab-item').length === WORDS.length, 'the words');
}
const order = (rig: Rig): string[] => rig.qa('.vocab-word').map((w) => w.textContent!);

describe('My vocab', () => {
  it('sorts least known first (level, then fewest encounters) and by recently encountered, and remembers the choice', async () => {
    const rig = await makeRig({ signedIn: true });
    await openVocab(rig);
    expect(rig.q('#vocab-sort-least').getAttribute('aria-pressed')).toBe('true');
    expect(order(rig)).toEqual(['zog', 'shtepi', 'qen', 'diell', 'mace']);
    click(rig.q('#vocab-sort-recent'));
    expect(order(rig)).toEqual(['shtepi', 'zog', 'qen', 'diell', 'mace']);
    expect(rig.q('#vocab-sort-recent').getAttribute('aria-pressed')).toBe('true');
    await until(async () => ((await rig.area.get(UI_KEY))[UI_KEY] as { vocabSort?: string } | undefined)?.vocabSort === 'recent', 'the stored choice');
    await openVocab(rig); // a new visit
    expect(order(rig)).toEqual(['shtepi', 'zog', 'qen', 'diell', 'mace']);
    expect(rig.q('#vocab-sort-recent').getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the word, its meaning when the pack knows it, and its level; tapping opens its history', async () => {
    const rig = await makeRig({ signedIn: true });
    await openVocab(rig);
    const row = rig.q(`[data-unit-id="${unitOf('zog')}"]`);
    await until(() => row.querySelector('.vocab-gloss')!.textContent !== '', 'the meaning');
    expect(row.querySelector('.vocab-word')!.getAttribute('lang')).toBe('sq-AL');
    expect(row.querySelector('.vocab-level')!.textContent).toBe('new');
    expect(row.querySelector<HTMLAnchorElement>('a')!.getAttribute('href')).toBe(`#/review/history/${encodeURIComponent(unitOf('zog'))}`);
  });

  it('sortVocab breaks ties by word so the order is stable', () => {
    const rows = WORDS.map((w) => ({ unitId: w.knowledge.unitId, label: w.unit!.label, level: w.knowledge.level, encounters: w.knowledge.encounters, lastSeenAt: w.knowledge.lastSeenAt }));
    expect(sortVocab(rows, 'least').map((r) => r.label)).toEqual(['zog', 'shtepi', 'qen', 'diell', 'mace']);
    expect(sortVocab([...rows].reverse(), 'least').map((r) => r.label)).toEqual(['zog', 'shtepi', 'qen', 'diell', 'mace']);
  });
});

function entry(unitId: string, label: string, level: UnitKnowledge['level'], encounters: number, lastSeenAt: string, forms: string[] = [label]): VocabularyItem {
  const knowledge = { unitId, languageId: 'sq', level, encounters, firstSeenAt: '2026-09-01T00:00:00.000Z', lastSeenAt } as UnitKnowledge;
  return { knowledge, unit: { unitId, languageId: 'sq', label, kind: unitId.startsWith('form:') ? 'form' : 'lexeme' } as VocabularyItem['unit'], surfaceForms: forms, lastEncounter: lastSeenAt, sources: [] };
}
/** The vocabulary the Repository lists, and which form belongs to which lemma (the `form-of` relations of the batch lookup). */
function useRecords(rig: Rig, items: VocabularyItem[], formOf: Record<string, string> = {}): void {
  const page: VocabularyPage = { items, catalog: { total: items.length, counts: { new: 0, seen: 0, recognized: 0, familiar: 0, known: 0, automatic: 0 } } };
  const units = vi.fn(async (ids: string[]) => ({
    ok: true as const, status: 200,
    data: { units: Object.fromEntries(ids.map((id) => [id, { unit: {}, analyses: [], provenance: {}, relations: formOf[id] ? [{ fromId: id, relation: 'form-of', toId: formOf[id] }] : [] }])), missing: [] },
  }));
  const api = { vocabulary: vi.fn(async () => ({ ok: true as const, status: 200, data: page })), units } as unknown as RepositoryApi;
  rig.app.ctx.api = async () => ({ api, session: undefined, baseUrl: '' });
}

describe('My vocab: one line per word', () => {
  it('folds a form into its lemma: the lemma is the word, the level is the higher, encounters the larger, last-seen the later, and the other spelling is quiet', async () => {
    const rig = await makeRig({ signedIn: true });
    useRecords(rig, [
      entry('lemma:sq:zemër:NOUN', 'zemër', 'seen', 2, '2026-10-01T00:00:00.000Z'),
      entry('form:sq:zemrën', 'zemrën', 'recognized', 5, '2026-10-06T00:00:00.000Z'),
      entry('lemma:sq:mace:NOUN', 'mace', 'known', 3, '2026-10-02T00:00:00.000Z'),
    ], { 'form:sq:zemrën': 'lemma:sq:zemër:NOUN' });
    await rig.go('review/vocab');
    await until(() => rig.qa('.vocab-item').length === 2, 'two words, not three records');
    const row = rig.q(`[data-unit-id="lemma:sq:zemër:NOUN"]`);
    expect(row.querySelector('.vocab-word')!.textContent).toBe('zemër');
    expect(row.querySelector('.vocab-level')!.textContent).toBe('recognized');
    expect(row.querySelector('.vocab-met')!.textContent).toBe('met as: zemrën');
    expect(rig.root.querySelector('[data-unit-id="form:sq:zemrën"]')).toBeNull();
    expect(rig.root.querySelector(`[data-unit-id="${unitOf('mace')}"] .vocab-met`)).toBeNull();
    // sorting applies after the merge: zemër (recognized) now comes before mace (known); by recency it is the later one too
    expect(order(rig)).toEqual(['zemër', 'mace']);
    click(rig.q('#vocab-sort-recent'));
    expect(order(rig)).toEqual(['zemër', 'mace']);
  });

  it('keeps a form with no lemma record as its own line, and folds a form spelled like its lemma', async () => {
    const rig = await makeRig({ signedIn: true });
    useRecords(rig, [
      entry('form:sq:shtëpinë', 'shtëpinë', 'seen', 1, '2026-10-03T00:00:00.000Z'),
      entry('lemma:sq:qen:NOUN', 'qen', 'seen', 1, '2026-10-01T00:00:00.000Z'),
      entry('form:sq:qen', 'qen', 'seen', 4, '2026-10-02T00:00:00.000Z'),
    ], { 'form:sq:shtëpinë': 'lemma:sq:shtëpi:NOUN' }); // its lemma was never met: no record to fold into
    await rig.go('review/vocab');
    await until(() => rig.qa('.vocab-item').length === 2, 'two words');
    expect(order(rig).sort()).toEqual(['qen', 'shtëpinë']);
    expect(rig.q('[data-unit-id="form:sq:shtëpinë"] .vocab-word').textContent).toBe('shtëpinë');
    expect(rig.root.querySelector('[data-unit-id="lemma:sq:qen:NOUN"] .vocab-met')).toBeNull();
    expect(rig.root.querySelectorAll('.vocab-item').length).toBe(2);
  });

  it('still shows one line per word when the Repository cannot say which lemma a form belongs to', async () => {
    const rig = await makeRig({ signedIn: true });
    useRecords(rig, [entry('lemma:sq:diell:NOUN', 'diell', 'seen', 1, '2026-10-01T00:00:00.000Z'), entry('form:sq:diell', 'diell', 'seen', 2, '2026-10-02T00:00:00.000Z')]);
    (await rig.app.ctx.api()).api.units = (async () => ({ ok: false as const, status: 500, message: 'down' })) as unknown as RepositoryApi['units'];
    await rig.go('review/vocab');
    await until(() => rig.qa('.vocab-item').length === 1, 'one word');
  });

  it('the count on the home is the number of merged entries', async () => {
    const rig = await makeRig({ signedIn: true });
    useRecords(rig, [
      entry('lemma:sq:zemër:NOUN', 'zemër', 'seen', 2, '2026-10-01T00:00:00.000Z'), entry('form:sq:zemrën', 'zemrën', 'seen', 1, '2026-10-02T00:00:00.000Z'),
      entry('lemma:sq:mace:NOUN', 'mace', 'known', 3, '2026-10-02T00:00:00.000Z'), entry('form:sq:maces', 'maces', 'seen', 1, '2026-10-02T00:00:00.000Z'),
      entry('lemma:sq:qen:NOUN', 'qen', 'seen', 1, '2026-10-03T00:00:00.000Z'),
    ], { 'form:sq:zemrën': 'lemma:sq:zemër:NOUN', 'form:sq:maces': 'lemma:sq:mace:NOUN' });
    await reopen(rig);
    expect(rig.q('#vocab-count').textContent).toBe('3 words');
  });
});
