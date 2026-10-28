// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UnitKnowledge } from '../../packages/repository-contract/src';
import type { RepositoryApi, VocabularyItem, VocabularyPage } from '../../packages/repository-service/src/api';
import { decksKey, sortVocab, type SavedDeck } from '../../packages/goreview/app/deckModel';
import { forgetPaintedHome } from '../../packages/goreview/app/screens/review';
import { UI_KEY } from '../../packages/goreview/app/screens/uiprefs';
import { candidate, defaultService, destroyRigs, dueCard, ids, flush, makeRig, queued, reopen, seed, until, unitOf, type Rig } from './helpers';

afterEach(() => destroyRigs());
const A = ids('L1', 'sq');
const click = (el: Element): void => (el as HTMLElement).click();
const savedDecks = async (rig: Rig): Promise<SavedDeck[]> => {
  const key = decksKey('L1', 'sq');
  return (((await rig.area.get(key))[key] as { decks?: SavedDeck[] } | undefined)?.decks ?? []).filter((d) => !d.builtin); // the learner's own; Class Essentials is seeded beside them
};

describe('the GoReview home', () => {
  it('shows a fifth entry, Biblia, when the app ships Biblia beside it (the iPhone edition, the extension), linking to it', async () => {
    const rig = await makeRig({ signedIn: true, links: { biblia: './biblia/index.html' } });
    await seed(rig, [...dueCard(A, 'zog', 'meaning-to-form')]);
    await reopen(rig);
    expect(rig.qa('#review-home > section').map((s) => s.getAttribute('data-entry'))).toEqual(['tell', 'deck', 'previous', 'vocab', 'biblia']);
    expect(rig.q<HTMLAnchorElement>('#entry-biblia').getAttribute('href')).toBe('./biblia/index.html');
    expect(rig.q('#entry-biblia .entry-kicker').textContent).toMatch(/Hebrew Bible and the Greek New Testament/);
  });

  it('shows four entries in order (GoTell above a rule, the current deck, saved decks, my vocab) and nothing else', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form')]);
    await reopen(rig);
    expect(rig.qa('#review-home > section').map((s) => s.getAttribute('data-entry'))).toEqual(['tell', 'deck', 'previous', 'vocab']);
    expect(rig.qa('#review-home .entry-title').map((t) => t.textContent)).toEqual(['GoTell', 'Current deck', 'Saved decks', 'My vocab']);
    expect(rig.q('#entry-tell .entry-kicker').textContent).toBe('Write and be corrected');
    expect(rig.q('#deck-count').textContent).toBe('2 cards ready');
    expect(rig.q('#previous-count').textContent).toBe('1 saved'); // Class Essentials, the built-in deck, is already there
    expect(rig.q('#vocab-count').textContent).toMatch(/^\d+ words?$/);
    expect(rig.qa('#review-home button').map((b) => b.textContent)).toEqual(['Begin', 'Save deck']);   // the four entries; no deck-size line (Settings keeps the stepper, 2026-10-28)
    expect(rig.q('#save-deck').classList.contains('friendly')).toBe(true); // Save deck as the friendly pill beside Begin
    expect(rig.q('#review-home').textContent).not.toMatch(/deck size/);
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

  it('Save deck moves the deck to Saved decks and plans a fresh one; pressing the card starts the practice and Remove sits on the card (2026-10-28: no "Practise again" button)', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form')]);
    await reopen(rig);
    click(rig.q('#save-deck'));
    await until(() => rig.q('#previous-count').textContent === '2 saved', 'the saved count');
    const [deck] = await savedDecks(rig);
    expect(deck.items.map((i) => i.unitId).sort()).toEqual([unitOf('mace'), unitOf('zog')]);
    expect(deck.languageId).toBe('sq');
    expect(Number(rig.q('#deck-count').getAttribute('data-cards'))).toBeGreaterThan(0); // a fresh deck is ready at once
    expect((await rig.area.get(decksKey('L1', 'sq')))[decksKey('L1', 'sq')]).toMatchObject({ v: 1 });

    click(rig.q('#entry-previous'));
    await until(() => rig.app.current() === 'review/decks' && rig.qa('.deckrow').length === 2, 'the list');
    expect(rig.q('[data-deck-id]:not([data-deck-id^="class-essentials"]) .deckrow-line').textContent).toMatch(/ · 2 cards · Albanian$/);
    // the card is the button: it holds the deck's line and names itself for a screen reader; no separate "Practise again" button, Remove beside it
    const card = rig.q<HTMLButtonElement>('[data-deck-id]:not([data-deck-id^="class-essentials"]) [data-action="practise-again"]');
    expect(card.tagName).toBe('BUTTON');
    expect(card.classList.contains('deckrow-open')).toBe(true);
    expect(card.querySelector('.deckrow-line')).not.toBeNull();
    expect(card.textContent).toMatch(/2 cards · Albanian, press to practise$/);
    expect(rig.root.querySelector('.deckrow .btn')).toBeNull();
    expect(rig.q('[data-deck-id]:not([data-deck-id^="class-essentials"]) [data-action="remove-deck"]').classList.contains('deckrow-remove')).toBe(true);
    click(card);
    await until(() => rig.app.current() === 'review/session' && !!rig.root.querySelector('#session .exercise'), 'the session');
    expect(rig.app.ctx.run.active!.plan.items.map((p) => p.item.unitId).sort()).toEqual([unitOf('mace'), unitOf('zog')]);

    await rig.go('review/decks');
    click(rig.q('[data-deck-id]:not([data-deck-id^="class-essentials"]) [data-action="remove-deck"]'));
    await until(() => rig.qa('.deckrow').length === 1, 'the removal');
    expect(await savedDecks(rig)).toEqual([]);
  });

  it('reads a damaged saved-decks record as no saved decks', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.area.set({ [decksKey('L1', 'sq')]: { v: 7, decks: 'nonsense' } });
    await rig.go('review');
    await until(() => !!rig.root.querySelector('#previous-count'), 'the home');
    expect(rig.q('#previous-count').textContent).toBe('1 saved'); // nothing of the learner's own, and only the built-in deck
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
    expect(row.querySelector<HTMLAnchorElement>('a.vocab-history')!.getAttribute('href')).toBe(`#/review/history/${encodeURIComponent(unitOf('zog'))}`);
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
  forgetPaintedHome(rig.app.ctx); // the Repository changed under the app: in use that arrives as events, which the painted home's key sees
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

describe('the deck always comes from the vocabulary when nothing else yields a card', () => {
  const HINDI_LIKE = [
    entry('lemma:sq:zog:NOUN', 'zog', 'seen', 4, '2026-10-05T00:00:00.000Z'), entry('lemma:sq:mace:NOUN', 'mace', 'recognized', 2, '2026-10-06T00:00:00.000Z'),
    entry('lemma:sq:qen:NOUN', 'qen', 'new', 1, '2026-10-01T00:00:00.000Z'), entry('lemma:sq:diell:NOUN', 'diell', 'new', 1, '2026-10-04T00:00:00.000Z'),
  ];

  it('every candidate ineligible and nothing due: the deck is built from My vocab, least known first then most recent, and Begin is enabled', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, signedIn: true });
    service.candidates.set('L1-e1', ['zog', 'mace'].map((l) => candidate(l, 0.9, { eligibility: { eligible: false, status: 'unknown', reason: 'the analysis of this pack is unreviewed' } })));
    useRecords(rig, HINDI_LIKE);
    await reopen(rig);
    expect(rig.q('#deck-count').textContent).toBe('4 cards ready');
    expect(rig.q('#vocab-count').textContent).toBe('4 words');
    expect(rig.q<HTMLButtonElement>('#start-session').disabled).toBe(false);
    expect(rig.q('#review-home').textContent).not.toMatch(/Read with GoLearn|vocabulary, not|schedule/);   // no explanation on the home
    click(rig.q('#start-session'));
    await until(() => rig.app.current() === 'review/session' && !!rig.root.querySelector('#session .exercise'), 'the session');
    const plan = rig.app.ctx.run.active!.plan.items;
    expect(plan.map((p) => p.item.unitId)).toEqual(['lemma:sq:diell:NOUN', 'lemma:sq:qen:NOUN', 'lemma:sq:zog:NOUN', 'lemma:sq:mace:NOUN']); // new (most recent first), seen, recognized
    expect(plan.every((p) => p.family === 'written-recognition' && p.item.dimension === 'written-recognition')).toBe(true);
    expect(rig.q('#vocab-note').textContent).toMatch(/from your vocabulary, not from the review schedule/);   // the one honest note, in the session
  });

  it('shows the empty state only when My vocab has no word', async () => {
    const rig = await makeRig({ signedIn: true });
    useRecords(rig, []);
    await reopen(rig);
    expect(rig.q('#deck-count').textContent).toBe('Read with GoLearn to build your first deck');
    expect(rig.q<HTMLButtonElement>('#start-session').disabled).toBe(true);
  });
});

describe('My vocab: add a word to the current deck', () => {
  const WORDS2 = [entry('lemma:sq:zog:NOUN', 'zog', 'seen', 4, '2026-10-05T00:00:00.000Z'), entry('lemma:sq:mace:NOUN', 'mace', 'new', 1, '2026-10-06T00:00:00.000Z')];

  it('tapping a word asks, "Not now" closes the question, and History stays a small link on the row', async () => {
    const rig = await makeRig({ signedIn: true });
    useRecords(rig, WORDS2);
    await rig.app.ctx.state.setPrefs('L1', { ...(await rig.app.ctx.state.getPrefs('L1', 'sq')), cardsPerDeck: 5 });
    await seed(rig, ['qen', 'a1', 'a2', 'a3', 'a4'].flatMap((l) => dueCard(A, l, 'meaning-to-form')));   // a scheduled deck that is full, so the vocabulary words are not in it
    await rig.go('review/vocab');
    await until(() => rig.qa('.vocab-item').length === 2, 'the words');
    await flush(6);
    const row = rig.q(`[data-unit-id="lemma:sq:mace:NOUN"]`);
    expect(row.querySelector<HTMLAnchorElement>('a.vocab-history')!.getAttribute('href')).toBe(`#/review/history/${encodeURIComponent('lemma:sq:mace:NOUN')}`);
    expect(row.querySelector('.vocab-ask')).toBeNull();
    click(row.querySelector('button.vocab-row')!);
    await until(() => !!rig.root.querySelector('.vocab-ask'), 'the question');
    expect(rig.q('.vocab-ask').textContent).toContain('Add mace to the current deck?');
    click(rig.q('[data-action="not-now"]'));
    expect(rig.root.querySelector('.vocab-ask')).toBeNull();
  });

  it('Add records the explicit saved choice, puts the word into the current deck at once, and the row says "In your deck"', async () => {
    const rig = await makeRig({ signedIn: true });
    useRecords(rig, WORDS2);
    await rig.app.ctx.state.setPrefs('L1', { ...(await rig.app.ctx.state.getPrefs('L1', 'sq')), cardsPerDeck: 5 });
    await seed(rig, ['qen', 'a1', 'a2', 'a3', 'a4'].flatMap((l) => dueCard(A, l, 'meaning-to-form')));
    await reopen(rig);
    const before = Number(rig.q('#deck-count').getAttribute('data-cards'));
    await rig.go('review/vocab');
    await until(() => rig.qa('.vocab-item').length === 2, 'the words');
    click(rig.q(`[data-unit-id="lemma:sq:mace:NOUN"] button.vocab-row`));
    await until(() => !!rig.root.querySelector('[data-action="add-to-deck"]'), 'the question');
    click(rig.q('[data-action="add-to-deck"]'));
    await until(() => rig.q(`[data-unit-id="lemma:sq:mace:NOUN"]`).getAttribute('data-in-deck') === 'true', 'the row to say it is in the deck');
    expect(rig.q(`[data-unit-id="lemma:sq:mace:NOUN"] .vocab-indeck`).textContent).toBe('In your deck');
    const marks = (await queued(rig)).filter((e) => e.kind === 'ItemMarked');
    expect(marks).toHaveLength(1);
    expect(marks[0].payload).toMatchObject({ mark: 'saved' });
    expect(marks[0].subject.itemIds).toEqual(['lemma:sq:mace:NOUN']);
    // the home's deck has it, first, even though the deck was already full of due cards
    await reopen(rig);
    expect(Number(rig.q('#deck-count').getAttribute('data-cards'))).toBe(before + 1);
    click(rig.q('#start-session'));
    await until(() => rig.app.current() === 'review/session' && !!rig.root.querySelector('#session .exercise'), 'the session');
    expect(rig.app.ctx.run.active!.plan.items[0].item.unitId).toBe('lemma:sq:mace:NOUN');
  });

  it('tapping a word that is already in the deck says so instead of asking', async () => {
    const rig = await makeRig({ signedIn: true });
    useRecords(rig, WORDS2);
    await seed(rig, [...dueCard(A, 'zog', 'meaning-to-form')]);
    await rig.go('review/vocab');
    await until(() => rig.qa('.vocab-item').length === 2, 'the words');
    await until(() => rig.q(`[data-unit-id="lemma:sq:zog:NOUN"]`).getAttribute('data-in-deck') === 'true', 'the deck to be known');
    click(rig.q(`[data-unit-id="lemma:sq:zog:NOUN"] button.vocab-row`));
    await until(() => !!rig.root.querySelector('.vocab-ask'), 'the answer');
    expect(rig.q('.vocab-ask').textContent).toContain('is already in your deck');
    expect(rig.root.querySelector('[data-action="add-to-deck"]')).toBeNull();
  });
});
