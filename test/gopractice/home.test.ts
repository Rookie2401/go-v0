// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UnitKnowledge } from '../../packages/repository-contract/src';
import type { RepositoryApi, VocabularyItem, VocabularyPage } from '../../packages/repository-service/src/api';
import { decksKey, sortVocab, type SavedDeck } from '../../packages/gopractice/deckModel';
import { UI_KEY } from '../../packages/gopractice/screens/uiprefs';
import { loadReviewModel } from '../../packages/gopractice/workspace';
import { candidate, defaultService, destroyRigs, dueCard, ids, flush, makeRig, queued, reopen, seed, until, unitOf, type Rig } from './helpers';
afterEach(() => destroyRigs());
const A = ids('L1', 'sq');
const click = (el: Element): void => (el as HTMLElement).click();
const savedDecks = async (rig: Rig): Promise<SavedDeck[]> => {
  const key = decksKey('L1', 'sq');
  return (((await rig.area.get(key))[key] as {
    decks?: SavedDeck[];
  } | undefined)?.decks ?? []).filter((d) => !d.builtin);
 // the learner's own; Class Essentials is seeded beside them
};
describe('the GoReview home', () => {
  it('refreshes a timed return when the shared clock advances without new Repository events', async () => { const rig = await makeRig({ signedIn: true });
 const events = dueCard(A, 'zog', 'meaning-to-form');
 events[1].at = rig.clock.now.toISOString();
 await seed(rig, events);
 await reopen(rig);
 await until(() => !!rig.root.querySelector('#current-deck'), 'the scheduled home');
 const model = (await loadReviewModel(rig.app.ctx))!;
 const dueAt = Date.parse(model.deck[0].schedule.due);
 expect(dueAt).toBeGreaterThan(rig.clock.now.getTime());
 expect(rig.q<HTMLButtonElement>('#start-session').disabled).toBe(true);
 expect(rig.q('#next-learning-return').textContent).toContain('Next short-term learning return');
 expect(rig.q('#microdeck-size').textContent).toContain('0 question(s) in this batch');
 expect(rig.q('#microdeck-estimate').textContent).toContain('Estimates are approximate');
 rig.clock.set(new Date(dueAt + 1000).toISOString());
 window.dispatchEvent(new Event('pageshow'));
 await until(() => !rig.q<HTMLButtonElement>('#start-session').disabled, 'the now-due return');
 expect(rig.q('#review-obligations').textContent).toContain('1 due learning/relearning');
 });
  it('shows Biblia after the separate Class Essentials scope when the app ships it beside GoReview', async () => { const rig = await makeRig({ signedIn: true, links: { biblia: './biblia/index.html' } });
 await seed(rig, [...dueCard(A, 'zog', 'meaning-to-form')]);
 await reopen(rig);
 expect(rig.qa('#review-home > section').map((s) => s.getAttribute('data-entry'))).toEqual(['tell', 'deck', 'class-essentials-due', 'previous', 'vocab', 'biblia']);
 expect(rig.q<HTMLAnchorElement>('#entry-biblia').getAttribute('href')).toBe('./biblia/index.html');
 expect(rig.q('#entry-biblia .entry-kicker').textContent).toMatch(/Hebrew Bible and the Greek New Testament/);
 });
  it('shows the primary entries with Class Essentials as a separate due scope', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form')]);
    await reopen(rig);
    expect(rig.qa('#review-home > section').map((s) => s.getAttribute('data-entry'))).toEqual(['tell', 'deck', 'class-essentials-due', 'previous', 'vocab']);
    expect(rig.qa('#review-home .entry-title').map((t) => t.textContent)).toEqual(['GoTell', 'GoReview', 'Class Essentials', 'Saved decks', 'My vocab']);
    expect(rig.q('#entry-tell .entry-kicker').textContent).toBe('Write and be corrected');
    expect(rig.q('#deck-count').textContent).toBe('2 cards ready');
    expect(rig.q('#review-obligations').textContent).toContain('2 due learning/relearning');
    expect(rig.q('#microdeck-size').textContent).toContain('2 question(s) in this batch');
    expect(rig.q('#microdeck-estimate').textContent).toContain('active practice');
    expect(rig.q('#previous-count').textContent).toBe('1 saved');
 // Class Essentials, the built-in deck, is already there
    expect(rig.q('#vocab-count').textContent).toMatch(/^\d+ words?$/);
    expect(rig.qa('#review-home button:not(.stepper-btn):not(.pill)').map((b) => b.textContent)).toEqual(['deck size: 10', 'Begin', 'Save deck']);
 // the four entries and one quiet size line
    // none of what the home used to show
    for (const gone of ['.card', '#due-summary', '.time-presets', '#session-controls', '#candidates', '#deck-list', 'table', 'dl', 'details', '#link-transfer']) {
      expect(rig.root.querySelector(`#review-home ${gone}`), gone).toBeNull();
    }
    expect(rig.q('#review-home').textContent).not.toMatch(/scheduler|fsrs|Why/);
 // the header: the language and the Settings cog
    expect(rig.q('header #settings-link').getAttribute('aria-label')).toBe('Settings');
  });
  it('GoTell is a link to #/tell and opens the GoTell workspace', async () => { const rig = await makeRig({ signedIn: true });
 expect(rig.q<HTMLAnchorElement>('#entry-tell').getAttribute('href')).toBe('#/tell');
 click(rig.q('#entry-tell'));
 await until(() => rig.app.current() === 'tell', 'GoTell');
 });
  it('a zero admission limit leaves vocabulary available without fabricating a scheduled batch', async () => { const service = defaultService(), rig = await makeRig({ service, signedIn: true });
 await rig.app.ctx.state.updatePrefs('L1', 'sq', { maxNew: 0 });
 service.candidates.set('L1-e1', [candidate('det', .8), candidate('diell', .3)]);
 await reopen(rig);
 expect(Number(rig.q('#deck-count').getAttribute('data-cards'))).toBe(0);
 expect(rig.q<HTMLButtonElement>('#start-session').disabled).toBe(true);
 expect(await queued(rig)).toEqual([]);
 });
  it('with no vocabulary at all it says how to build the first deck and Begin is disabled', async () => { const rig = await makeRig({ signedIn: true });
 expect(rig.q('#deck-count').textContent).toBe('No eligible reviews right now');
 expect(rig.q<HTMLButtonElement>('#start-session').disabled).toBe(true);
 expect(rig.root.querySelector('#save-deck')).toBeNull();
 });
  it('Save deck preserves due work and reports exhaustion of unseen alternatives; the list offers Practise again and Remove', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form')]);
    await reopen(rig);
    click(rig.q('#save-deck'));
    await until(() => rig.q('#previous-count').textContent === '2 saved', 'the saved count');
    const [deck] = await savedDecks(rig);
    expect(deck.items.map((i) => i.unitId).sort()).toEqual([unitOf('mace'), unitOf('zog')]);
    expect(deck.languageId).toBe('sq');
    expect(Number(rig.q('#deck-count').getAttribute('data-cards'))).toBe(2);
 // saving a collection cannot postpone due obligations
    expect(rig.q('#review-home > .status').textContent).toContain('No unseen eligible alternatives');
    expect((await rig.area.get(decksKey('L1', 'sq')))[decksKey('L1', 'sq')]).toMatchObject({ v: 1 });
    click(rig.q('#entry-previous'));
    await until(() => rig.app.current() === 'review/decks' && rig.qa('.deckrow').length === 2, 'the list');
    expect(rig.q('[data-deck-id]:not([data-deck-id^="class-essentials"]) .deckrow-line').textContent).toMatch(/ · 2 cards · Albanian$/);
    click(rig.q('[data-deck-id]:not([data-deck-id^="class-essentials"]) [data-action="practise-again"]'));
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
    expect(rig.q('#previous-count').textContent).toBe('1 saved');
 // nothing of the learner's own, and only the built-in deck
  });
  it('puts the details, the session controls and the transfer measures one tap away in Settings', async () => { const rig = await makeRig({ signedIn: true });
 await rig.go('settings');
 expect(rig.q<HTMLAnchorElement>('#link-details').getAttribute('href')).toBe('#/review/details');
 expect(rig.q<HTMLAnchorElement>('#link-transfer').getAttribute('href')).toBe('#/review/transfer');
 expect(rig.q<HTMLAnchorElement>('#link-vocabulary').getAttribute('href')).toBe('#/vocabulary');
 });
});
function word(label: string, level: UnitKnowledge['level'], encounters: number, lastSeenAt: string): VocabularyItem { const unitId = `lemma:sq:${label}:NOUN`;
 const knowledge = { unitId, languageId: 'sq', level, encounters, firstSeenAt: '2026-09-01T00:00:00.000Z', lastSeenAt } as UnitKnowledge;
 return { knowledge, unit: { unitId, languageId: 'sq', label, kind: 'lexeme' } as VocabularyItem['unit'], surfaceForms: [label], lastEncounter: lastSeenAt, sources: [] };
 }
const WORDS = [word('mace', 'known', 9, '2026-10-01T00:00:00.000Z'), word('zog', 'new', 1, '2026-10-05T00:00:00.000Z'), word('qen', 'seen', 4, '2026-10-03T00:00:00.000Z'), word('shtepi', 'seen', 2, '2026-10-07T00:00:00.000Z'), word('diell', 'recognized', 3, '2026-10-02T00:00:00.000Z'),];
async function openVocab(rig: Rig): Promise<void> { const page: VocabularyPage = { items: WORDS, catalog: { total: WORDS.length, counts: { new: 1, seen: 2, recognized: 1, familiar: 0, known: 1, automatic: 0 } } };
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
    await until(async () => ((await rig.area.get(UI_KEY))[UI_KEY] as {
      vocabSort?: string;
    } | undefined)?.vocabSort === 'recent', 'the stored choice');
    await openVocab(rig);
 // a new visit
    expect(order(rig)).toEqual(['shtepi', 'zog', 'qen', 'diell', 'mace']);
    expect(rig.q('#vocab-sort-recent').getAttribute('aria-pressed')).toBe('true');
  });
  it('shows the word, its meaning when the pack knows it, and its level; tapping opens its history', async () => { const rig = await makeRig({ signedIn: true });
 await openVocab(rig);
 const row = rig.q(`[data-unit-id="${unitOf('zog')}"]`);
 await until(() => row.querySelector('.vocab-gloss')!.textContent !== '', 'the meaning');
 expect(row.querySelector('.vocab-word')!.getAttribute('lang')).toBe('sq-AL');
 expect(row.querySelector('.vocab-level')!.textContent).toBe('new');
 expect(row.querySelector<HTMLAnchorElement>('a.vocab-history')!.getAttribute('href')).toBe(`#/review/history/${encodeURIComponent(unitOf('zog'))}`);
 });
  it('sortVocab breaks ties by word so the order is stable', () => { const rows = WORDS.map((w) => ({ unitId: w.knowledge.unitId, label: w.unit!.label, level: w.knowledge.level, encounters: w.knowledge.encounters, lastSeenAt: w.knowledge.lastSeenAt }));
 expect(sortVocab(rows, 'least').map((r) => r.label)).toEqual(['zog', 'shtepi', 'qen', 'diell', 'mace']);
 expect(sortVocab([...rows].reverse(), 'least').map((r) => r.label)).toEqual(['zog', 'shtepi', 'qen', 'diell', 'mace']);
 });
});
function entry(unitId: string, label: string, level: UnitKnowledge['level'], encounters: number, lastSeenAt: string, forms: string[] = [label]): VocabularyItem { const knowledge = { unitId, languageId: 'sq', level, encounters, firstSeenAt: '2026-09-01T00:00:00.000Z', lastSeenAt } as UnitKnowledge;
 return { knowledge, unit: { unitId, languageId: 'sq', label, kind: unitId.startsWith('form:') ? 'form' : 'lexeme' } as VocabularyItem['unit'], surfaceForms: forms, lastEncounter: lastSeenAt, sources: [] };
 } /** The vocabulary the Repository lists, and which form belongs to which lemma (the `form-of` relations of the batch lookup). */
function useRecords(rig: Rig, items: VocabularyItem[], formOf: Record<string, string> = {}): void { const page: VocabularyPage = { items, catalog: { total: items.length, counts: { new: 0, seen: 0, recognized: 0, familiar: 0, known: 0, automatic: 0 } } };
 const units = vi.fn(async (ids: string[]) => ({ ok: true as const, status: 200, data: { units: Object.fromEntries(ids.map((id) => [id, { unit: {}, analyses: [], provenance: {}, relations: formOf[id] ? [{ fromId: id, relation: 'form-of', toId: formOf[id] }] : [] }])), missing: [] }, }));
 const api = { vocabulary: vi.fn(async () => ({ ok: true as const, status: 200, data: page })), units } as unknown as RepositoryApi;
 rig.app.ctx.api = async () => ({ api, session: undefined, baseUrl: '' });
 }
describe('My vocab: one line per word', () => {
  it('folds a form into its lemma: the lemma is the word, the level is the higher, encounters the larger, last-seen the later, and the other spelling is quiet', async () => {
    const rig = await makeRig({ signedIn: true });
    useRecords(rig, [entry('lemma:sq:zemër:NOUN', 'zemër', 'seen', 2, '2026-10-01T00:00:00.000Z'), entry('form:sq:zemrën', 'zemrën', 'recognized', 5, '2026-10-06T00:00:00.000Z'), entry('lemma:sq:mace:NOUN', 'mace', 'known', 3, '2026-10-02T00:00:00.000Z'),], { 'form:sq:zemrën': 'lemma:sq:zemër:NOUN' });
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
    useRecords(rig, [entry('form:sq:shtëpinë', 'shtëpinë', 'seen', 1, '2026-10-03T00:00:00.000Z'), entry('lemma:sq:qen:NOUN', 'qen', 'seen', 1, '2026-10-01T00:00:00.000Z'), entry('form:sq:qen', 'qen', 'seen', 4, '2026-10-02T00:00:00.000Z'),], { 'form:sq:shtëpinë': 'lemma:sq:shtëpi:NOUN' });
 // its lemma was never met: no record to fold into
    await rig.go('review/vocab');
    await until(() => rig.qa('.vocab-item').length === 2, 'two words');
    expect(order(rig).sort()).toEqual(['qen', 'shtëpinë']);
    expect(rig.q('[data-unit-id="form:sq:shtëpinë"] .vocab-word').textContent).toBe('shtëpinë');
    expect(rig.root.querySelector('[data-unit-id="lemma:sq:qen:NOUN"] .vocab-met')).toBeNull();
    expect(rig.root.querySelectorAll('.vocab-item').length).toBe(2);
  });
  it('still shows one line per word when the Repository cannot say which lemma a form belongs to', async () => { const rig = await makeRig({ signedIn: true });
 useRecords(rig, [entry('lemma:sq:diell:NOUN', 'diell', 'seen', 1, '2026-10-01T00:00:00.000Z'), entry('form:sq:diell', 'diell', 'seen', 2, '2026-10-02T00:00:00.000Z')]);
 (await rig.app.ctx.api()).api.units = (async () => ({ ok: false as const, status: 500, message: 'down' })) as unknown as RepositoryApi['units'];
 await rig.go('review/vocab');
 await until(() => rig.qa('.vocab-item').length === 1, 'one word');
 });
  it('the count on the home is the number of merged entries', async () => { const rig = await makeRig({ signedIn: true });
 useRecords(rig, [entry('lemma:sq:zemër:NOUN', 'zemër', 'seen', 2, '2026-10-01T00:00:00.000Z'), entry('form:sq:zemrën', 'zemrën', 'seen', 1, '2026-10-02T00:00:00.000Z'), entry('lemma:sq:mace:NOUN', 'mace', 'known', 3, '2026-10-02T00:00:00.000Z'), entry('form:sq:maces', 'maces', 'seen', 1, '2026-10-02T00:00:00.000Z'), entry('lemma:sq:qen:NOUN', 'qen', 'seen', 1, '2026-10-03T00:00:00.000Z'),], { 'form:sq:zemrën': 'lemma:sq:zemër:NOUN', 'form:sq:maces': 'lemma:sq:mace:NOUN' });
 await reopen(rig);
 expect(rig.q('#vocab-count').textContent).toBe('3 words');
 });
});
describe('catalog membership does not create scheduling demand', () => { const HINDI_LIKE = [entry('lemma:sq:zog:NOUN', 'zog', 'seen', 4, '2026-10-05T00:00:00.000Z'), entry('lemma:sq:mace:NOUN', 'mace', 'recognized', 2, '2026-10-06T00:00:00.000Z'), entry('lemma:sq:qen:NOUN', 'qen', 'new', 1, '2026-10-01T00:00:00.000Z'), entry('lemma:sq:diell:NOUN', 'diell', 'new', 1, '2026-10-04T00:00:00.000Z'),];
 it('ineligible candidates and catalog words do not enable Begin or bypass validation', async () => { const service = defaultService(), rig = await makeRig({ service, signedIn: true });
 service.candidates.set('L1-e1', ['zog', 'mace'].map(l => candidate(l, .9, { eligibility: { eligible: false, status: 'unknown', reason: 'unreviewed' } })));
 useRecords(rig, HINDI_LIKE);
 await reopen(rig);
 expect(rig.q('#deck-count').textContent).toBe('No eligible reviews right now');
 expect(rig.q('#vocab-count').textContent).toBe('4 words');
 expect(rig.q<HTMLButtonElement>('#start-session').disabled).toBe(true);
 expect(await queued(rig)).toEqual([]);
 });
 it('shows an empty state when no eligible work exists', async () => { const rig = await makeRig({ signedIn: true });
 useRecords(rig, []);
 await reopen(rig);
 expect(rig.q('#deck-count').textContent).toBe('No eligible reviews right now');
 expect(rig.q<HTMLButtonElement>('#start-session').disabled).toBe(true);
 });
 });
describe('My vocab: add a word to the current deck', () => {
  const WORDS2 = [entry('lemma:sq:zog:NOUN', 'zog', 'seen', 4, '2026-10-05T00:00:00.000Z'), entry('lemma:sq:mace:NOUN', 'mace', 'new', 1, '2026-10-06T00:00:00.000Z')];
  it('tapping a word asks, "Not now" closes the question, and History stays a small link on the row', async () => {
    const rig = await makeRig({ signedIn: true });
    useRecords(rig, WORDS2);
    await rig.app.ctx.state.setPrefs('L1', { ...(await rig.app.ctx.state.getPrefs('L1', 'sq')), cardsPerDeck: 5 });
    await seed(rig, ['qen', 'a1', 'a2', 'a3', 'a4'].flatMap((l) => dueCard(A, l, 'meaning-to-form')));
 // a scheduled deck that is full, so the vocabulary words are not in it
    await rig.go('review/vocab');
    await until(() => rig.qa('.vocab-item').length === 2, 'the words');
    await flush(6);
    const row = rig.q(`[data-unit-id="lemma:sq:mace:NOUN"]`);
    expect(row.querySelector<HTMLAnchorElement>('a.vocab-history')!.getAttribute('href')).toBe(`#/review/history/${encodeURIComponent('lemma:sq:mace:NOUN')}`);
    expect(row.querySelector('.vocab-ask')).toBeNull();
    click(row.querySelector('button.vocab-row')!);
    await until(() => !!rig.root.querySelector('.vocab-ask'), 'the question');
    expect(rig.q('.vocab-ask').textContent).toContain('Choose mace for an optional practice session?');
    click(rig.q('[data-action="not-now"]'));
    expect(rig.root.querySelector('.vocab-ask')).toBeNull();
  });
  it('Add records optional selected practice without claiming it is in the next automatic batch', async () => {
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
    await until(() => !!rig.root.querySelector(`[data-unit-id="lemma:sq:mace:NOUN"] .vocab-selected`), 'the row to identify optional practice');
    expect(rig.q(`[data-unit-id="lemma:sq:mace:NOUN"] .vocab-selected`).textContent).toBe('Selected for optional practice');
    expect(rig.root.querySelector(`[data-unit-id="lemma:sq:mace:NOUN"] .vocab-indeck`)).toBeNull();
    const marks = (await queued(rig)).filter((e) => e.kind === 'ItemMarked');
    expect(marks).toHaveLength(1);
    expect(marks[0].payload).toMatchObject({ mark: 'saved' });
    expect(marks[0].subject.itemIds).toEqual(['lemma:sq:mace:NOUN']);
 // Optional vocabulary practice does not displace the five due cards.
    await reopen(rig);
    expect(Number(rig.q('#deck-count').getAttribute('data-cards'))).toBe(before);
    click(rig.q('#start-selected-practice'));
    await until(() => rig.app.current() === 'review/session' && !!rig.root.querySelector('#session .exercise'), 'the optional session');
    expect(rig.app.ctx.run.active!.plan.items[0].item.unitId).toBe('lemma:sq:mace:NOUN');
    expect(rig.app.ctx.run.active!.plan.items[0].intent?.kind).toBe('explicit');
    await rig.go('review/vocab');
    await until(() => rig.qa('.vocab-item').length === 2, 'the vocabulary list after selected practice');
    expect(rig.root.querySelector(`[data-unit-id="lemma:sq:mace:NOUN"] .vocab-selected`)).toBeNull();
  });
  it('tapping a word that is already in the deck says so instead of asking', async () => { const rig = await makeRig({ signedIn: true });
 useRecords(rig, WORDS2);
 await seed(rig, [...dueCard(A, 'zog', 'meaning-to-form')]);
 await rig.go('review/vocab');
 await until(() => rig.qa('.vocab-item').length === 2, 'the words');
 await until(() => rig.q(`[data-unit-id="lemma:sq:zog:NOUN"]`).getAttribute('data-in-deck') === 'true', 'the deck to be known');
 click(rig.q(`[data-unit-id="lemma:sq:zog:NOUN"] button.vocab-row`));
 await until(() => !!rig.root.querySelector('.vocab-ask'), 'the answer');
 expect(rig.q('.vocab-ask').textContent).toContain('is in the current automatic deck');
 expect(rig.root.querySelector('[data-action="add-to-deck"]')).toBeNull();
 });
});
