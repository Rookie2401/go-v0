// @vitest-environment jsdom
/**
 * Korean (`ko`): the brief's 16-step user journey (BRIEF XXII), over the REAL applications and the REAL Repository, in process, built like the
 * Albanian reference journey (test/certification/albanian-reference-e2e.test.ts) but on the parts of it that work today (the Albanian file has
 * seven red steps, about the GoReview Account page and a vocabulary-list selector that moved; they have nothing to do with Korean, and this file
 * uses neither selector: GoReview is driven through the shell's own deck planner and session start, then its own screens).
 *
 * HOW EACH STEP IS DRIVEN   (real = the shipped module; service = the real Repository handler, in process; UI = the shipped screen, driven by DOM events)
 *   1  setup app, languages page, "Download Korean": UI + real pack installer + every KO_VALIDATION case through the real analyser + real dictionary files
 *   2  a fixture page of the test's own (jsdom)
 *   3  GoLearn Active: real `ActiveMode`, real content controller, learner model through the real worker and service
 *   4  the real page scan: each word's reading, the underline marks, the words the analyser and the dictionary do not confirm
 *   5-7 a real selection → real `LookupController` → real `parseSelection` → real card UI; dictionary through the real worker (public/dict/ko)
 *   8  the card's own level buttons (UI)
 *   9  the events the worker queued on the device, then as the service holds them
 *   10 the real sync to the in-process service (and back to the device)
 *   11-14 the real GoReview shell, signed in through its own sign-in form; its own planner, session start, flashcard screen and FSRS scheduler
 *   15-16 the same fixture scanned again by a new `ActiveMode`
 * OFFLINE: the service is made unreachable (the in-process fetch throws); the device's own worker records the events; they sync when it returns.
 * Faked: the network (in-process fetch), the clock, the timers, the chrome API. Nothing between a screen and the service is replaced.
 *
 * WOULD SKIP on a machine without the built data (public/dict/ko, public/lexicon/ko: built locally, ignored by git): the whole file.
 * A step that fails because the PRODUCT is wrong is `it.fails` with the fault in the comment above it (file:line, what, why).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateEvent, type StoredEvent } from '../../packages/repository-contract/src';
import { createApp as createSetupApp } from '../../packages/golearn-extension/app/app';
import { createPackBindings } from '../../packages/golearn-extension/app/bindings';
import type { Deps as SetupDeps } from '../../packages/golearn-extension/app/ports';
import { ActiveMode } from '../../packages/golearn-extension/src/content/active';
import { createBridge } from '../../packages/golearn-extension/src/content/services';
import type { HighlightLike } from '../../packages/golearn-extension/src/active/highlight';
import { wordsOfText } from '../../packages/golearn-extension/src/active/scan';
import { getAnalyser } from '../../packages/golearn-extension/src/parser';
import { MSG, type ChromeApi } from '../../packages/golearn-extension/src/platform';
import { ACTIVE_ORIGINS, type ProfileReply } from '../../packages/golearn-extension/src/protocol';
import { PENDING_IDENTITY, buildEncounterEvent } from '../../packages/golearn-extension/src/store';
import { foldDeckItems } from '../../packages/goreview/src';
import { planCurrentDeck } from '../../packages/goreview/app/deckModel';
import { loadReviewModel } from '../../packages/goreview/app/workspace';
import { createRepositoryApi } from '../../packages/repository-service/src/api';
import { koAdapter } from '../../src/adapters/ko';
import { selectText } from '../extension/dom';
import { choose, flush, submit, type, until } from '../golearn-app/helpers';
import { DATA_PRESENT, EMAIL, MIN, PASSWORD, createJourneyRig, q } from '../support/korean/journey-rig';
import { SNOW } from '../support/korean/lexicon';

class FakeHighlight implements HighlightLike {
  ranges = new Set<Range>();
  add(r: Range) { this.ranges.add(r); return this; }
  delete(r: Range) { return this.ranges.delete(r); }
  clear() { this.ranges.clear(); }
  get size() { return this.ranges.size; }
}
const w = window as unknown as { CSS?: { highlights?: Map<string, HighlightLike> }; Highlight?: typeof FakeHighlight };

// ───────────────────────────── the fixture page ─────────────────────────────
// every sentence is from test/adapters/korean/regression.test.ts or KO_VALIDATION (packages/language-packs/src/packs/ko.ts)
const S = {
  ate: '저는 밥을 먹었습니다.',                       // an inflected verb (먹었습니다: past, formal polite) and a decided homonym (저는 = I)
  students: '학생들이 학교에서 공부했습니다.',        // a noun + particles; a 하다-verb
  snow: '눈이 와요.',                                  // a balanced homonym WITH a cue (snow)
  eyes: '눈이 예뻐요.',                                // the same spelling WITHOUT one: undecided
  time: '시간이 없어요.',                              // a main-set word
  counter: '학생이 세 명 있어요.',                     // a number + a counter
  hanja: '學校에서 공부해요.',                         // a Hanja word
  read: '선생님이 책을 읽으셨습니다.',                 // an honorific verb
  budget: '예산안을 발표했습니다.',                    // an unlisted compound: unconfirmed
};
const FORMS = ['먹어요', '먹으면', '먹는'];            // three more forms of 먹다, each alone in a list item
const PAGE = `<main><h1>한국어 뉴스</h1><div id="passage">${Object.values(S).map((s, i) => `<p id="s${i}">${s}</p>`).join('')}</div><ul id="forms">${FORMS.map((f) => `<li>${f}</li>`).join('')}</ul></main>`;
const WORD = '먹었습니다';
const LEMMA = 'lemma:ko:먹다:VERB';
const FORM = 'form:ko:먹었습니다';
const MORPH = 'morph:ko:VERB:Mood=Ind|SpeechLevel=Hasipsio|Tense=Past|VerbForm=Fin';
const SUPERSCRIPT = /[⁰¹²³⁴-⁹]/u;
const hex = (s: string): string => Buffer.from(s, 'utf8').toString('hex');

const rig = DATA_PRESENT ? createJourneyRig() : undefined!;
let learnerId = '';
let enrolmentId = '';
let token = '';
let registry: Map<string, HighlightLike>;
let active: ActiveMode | undefined;

beforeAll(() => { if (DATA_PRESENT) rig.start(); });
afterAll(async () => { active?.stop(); if (DATA_PRESENT) await rig.stop(); });

const marks = (): Record<string, string[]> => Object.fromEntries([...registry].map(([k, h]) => [k, [...(h as FakeHighlight).ranges].map((r) => r.toString())]));
const markedWords = (): string[] => Object.values(marks()).flat();
const pageWords = (): string[] => [...document.querySelectorAll('h1, #passage p, #forms li')].flatMap((p) => wordsOfText(p.textContent ?? '', koAdapter, 'ko').map((x) => x.surface));

function makeActive(reader: ReturnType<typeof rig.reader>): ActiveMode {
  active?.stop();
  const bridge = createBridge(rig.fake.contentChrome(7));
  active = new ActiveMode({
    doc: document, controller: reader.c, adapters: (reader.c as unknown as { d: { adapters: never[] } }).d.adapters, ui: reader.ui, adapterOf: getAnalyser, viewport: 'all',
    profile: (unitIds: string[], languageId: string) => bridge.activeProfile!({ unitIds, languageId }) as Promise<ProfileReply>,
    confirmForms: (forms: string[], languageId: string) => bridge.confirmForms!({ forms, languageId }),
    recordEncounter: bridge.events.append,
    buildEncounter: (ids: string[], languageId: string, readerId: string) => buildEncounterEvent({ languageId, itemIds: ids, readerId, identity: { ...PENDING_IDENTITY }, version: '0.2.0', sessionId: 'active-ko', now: new Date(rig.clockMs) }),
  } as never);
  return active;
}
/** A lookup of the n-th occurrence of `word` on the page, through the real controller. */
async function look(r: ReturnType<typeof rig.reader>, word: string, occurrence = 0) {
  return rig.lookup(r, document.body, word, (root, needle) => selectText(root, needle, occurrence));
}
const levelButton = (r: ReturnType<typeof rig.reader>, mark: string): HTMLElement => r.ui.root()!.querySelector<HTMLElement>(`.rateBtn[data-mark="${mark}"]`)!;
const eventsOf = async (kind: string): Promise<StoredEvent[]> => (await rig.events(learnerId)).filter((e) => e.kind === kind && e.languageId === 'ko');
const syncUp = async (): Promise<void> => { await flush(60); await rig.fireWorkerTimers(); await rig.page({ type: MSG.syncNow }); await flush(30); };

describe.skipIf(!DATA_PRESENT)('Korean journey', () => {
  // ═════════════════════════ 1-4: add the language, open a page, activate, annotate ═════════════════════════
  it('1. Korean is added on the languages page: one click downloads it, the pack installs by itself and every validation case passes through the real analyser', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    window.location.hash = '';
    const deps: SetupDeps = {
      win: window, doc: document, chrome: rig.fake as unknown as ChromeApi, fetch: rig.fileFetch, area: rig.area, packs: createPackBindings(), config: {},
      createApi: (baseUrl, tok) => createRepositoryApi({ baseUrl, fetch: rig.serviceFetch, token: tok }),
      download: () => {}, now: () => new Date(rig.clockMs), closeWindow: () => false, copyText: async () => true, appVersion: 'cert', speech: null,
    };
    const setup = createSetupApp(document.getElementById('app')!, deps);
    await setup.ready();
    expect(setup.current()).toBe('signin');
    choose(q('#acct-mode'), 'create');
    type(q<HTMLInputElement>('#acct-name'), 'Min');
    type(q<HTMLInputElement>('#acct-email'), EMAIL);
    type(q<HTMLInputElement>('#acct-password'), PASSWORD);
    submit(q<HTMLFormElement>('#acct-form'));
    await until(() => setup.current() === 'languages' && document.getElementById('flash'), 8000);
    const session = (await rig.area.get('golearn:session'))['golearn:session'] as { learnerId: string; token: string };
    learnerId = session.learnerId; token = session.token;
    expect(document.querySelector('#language-cards > [data-language="ko"]'), 'the languages page lists Korean').not.toBeNull();
    q('#language-cards > [data-language="ko"] [data-action="choose"]').click();
    await until(() => /is ready|did not|could not/.test(q('#language-cards > [data-language="ko"] .status').textContent ?? ''), 60_000);
    const enrolment = (await rig.store.listEnrolments(learnerId))[0];
    enrolmentId = enrolment.enrolmentId;
    expect(enrolment).toMatchObject({ languageId: 'ko', packId: 'pack:ko' });
    await until(() => document.querySelector('#language-cards > [data-language="ko"] .verify'), 30_000);
    // NOTE (2026-11-25, 11:4x): this check went red while other sessions were rebuilding the lexicon: "dictionary-mismatch: the pack expects
    // kaikki-ko@2026-10-30 with 59516 entries; the device has 58905" (packages/language-packs/src/packs/ko.ts KO_DICTIONARY.entries against
    // public/dict/ko/manifest.json, both uncommitted work of other sessions). It is the install check doing its job; it goes green when the two agree.
    expect(q('#language-cards > [data-language="ko"] .verify').getAttribute('data-ok'), q('#language-cards > [data-language="ko"] .status').textContent ?? '').toBe('true');
    expect(q('#language-cards > [data-language="ko"] .status').textContent).toMatch(/Korean is ready: [0-9]+ checks passed/);
    setup.destroy();
  }, 120_000);

  it('2. a Korean page: nine sentences and three bare forms, readable by the scan', async () => {
    await rig.page({ type: MSG.serviceConfig, baseUrl: 'http://127.0.0.1:8790', assetBase: 'http://localhost/' });
    expect(await rig.page({ type: MSG.status })).toMatchObject({ connected: true, languageId: 'ko', packAvailable: true });
    document.body.innerHTML = PAGE;
    document.documentElement.lang = 'ko';
    expect(document.querySelectorAll('#passage p')).toHaveLength(Object.keys(S).length);
  });

  it('3. GoLearn Active is activated: the learner switches it on, the worker answers the page\'s questions, the page is read as Korean', async () => {
    registry = new Map();
    w.CSS = { highlights: registry }; w.Highlight = FakeHighlight;
    rig.fake.grantOrigins(ACTIVE_ORIGINS); // the optional host permission, granted by the learner
    expect(await rig.page({ type: MSG.active, op: 'set', patch: { active: true } })).toMatchObject({ ok: true, settings: { active: true } });
    const state = await makeActive(rig.reader()).start({ speak: false });
    expect(state).toMatchObject({ on: true, languageId: 'ko', languages: ['ko'] });
    expect(state.reason).toBeUndefined();
  }, 60_000);

  it('4. annotation: every word is read, none blank; each word is underlined as New, except the words nothing confirms, which are counted and left alone', async () => {
    const words = pageWords();
    const st = active!.state;
    expect(st.scanned, 'every word token of the page is scanned').toBe(words.length);
    // every word has a reading with a lemma: the analyser leaves nothing blank (an unconfirmed word has its stem as written, and says so)
    for (const el of document.querySelectorAll('h1, #passage p, #forms li')) {
      const tokens = koAdapter.tokenize((el.textContent ?? '').normalize('NFC'));
      const analyses = koAdapter.analyze(tokens);
      analyses.forEach((a, i) => {
        if (!tokens[i].isWord) return;
        expect(a.candidates.length, `no reading for ${tokens[i].surface}`).toBeGreaterThan(0);
        expect(a.candidates[0].lemma, `blank lemma for ${tokens[i].surface}`).toBeTruthy();
      });
    }
    // the unconfirmed ones: 예산안을 (an unlisted compound) is built, flagged unconfirmed, never underlined, and named in the state
    expect(st.skipped).toBe(1);
    expect(st.unconfirmed).toBe(1);
    const budget = koAdapter.analyze(koAdapter.tokenize(S.budget))[0].candidates[0];
    expect(budget.unconfirmed).toBe(true);
    expect(budget.confidence).toBeLessThan(0.5);
    const m = marks();
    expect(Object.keys(m)).toEqual(['golearn-new']);
    expect(m['golearn-new']).toHaveLength(words.length - 1);
    expect(m['golearn-new']).not.toContain('예산안을');
    for (const w1 of ['먹었습니다', '학생들이', '學校에서', '눈이', '시간이', '읽으셨습니다', '먹어요', '먹으면', '먹는']) expect(markedWords(), w1).toContain(w1);
  });

  // ═════════════════════════ 5-9: select, dictionary form, details, state, event ═════════════════════════
  let card: ReturnType<typeof rig.reader>;
  let model: Awaited<ReturnType<typeof look>>['card'];
  it('5. an inflected word is selected: 먹었습니다 in its sentence', async () => {
    active!.stop();
    card = rig.reader();
    const out = await look(card, WORD);
    expect(out.status).toBe('shown');
    expect(out.recorded).toBe('recorded');
    model = out.card;
    expect(model.surface).toBe(WORD);
    expect(model.languageId).toBe('ko');
    expect(model.context.kind).toBe('sentence');
    expect(card.text()).toContain(WORD);
  }, 60_000);

  it('6. the dictionary form is 먹다 (verb), shown on the card, with its romanisation', () => {
    expect(model).toMatchObject({ lemma: '먹다', pos: 'VERB', unconfirmed: false });
    expect(model.confidence).toBeGreaterThanOrEqual(0.9);
    expect(card.text()).toMatch(/먹다\s*VERB/);
    expect(model.lemmaTransliteration).toBe('meokda');
    expect(model.itemIds).toEqual([LEMMA]);
  });

  it('7. the grammatical details: past, formal polite, the parts 먹 + 었 + 습니다, the dictionary gloss from public/dict/ko, the pronunciation as the model carries it', () => {
    expect(model.morphology).toMatch(/past/);
    expect(model.morphology).toMatch(/formal polite/);
    expect(Object.fromEntries(model.features.map((f) => [f.key, f.value]))).toMatchObject({ Tense: 'Past', SpeechLevel: 'Hasipsio', VerbForm: 'Fin' });
    const parts = model.syntaxNotes.join(' | ');
    expect(parts).toMatch(/먹: from 먹다, stem/);
    expect(parts).toMatch(/-었-: .*past/);
    expect(parts).toMatch(/-습니다: .*formal polite/);
    // the dictionary was asked through the real worker and answered from the dictionary files on disk
    expect(rig.dictRequests.some((p) => p.includes('/dict/ko/'))).toBe(true);
    expect(card.text()).toContain('to eat');
    expect(card.text()).toMatch(/Wiktionary, via kaikki\.org/);
    expect(card.text()).toMatch(/Speech level.*하십시오체/);
    // the units the learner model is asked about: the lemma, the form, the morphological construction
    expect(model.unitIds).toEqual(expect.arrayContaining([LEMMA, FORM, MORPH]));
    // pronunciation: the model carries the standard pronunciation by rule, and the romanisation is on the card
    expect(model.pronunciation.join(' ')).toContain('[머걷씀니다]');
    expect(card.text()).toContain('meogeotseumnida');
  });

  // FAULT (the card never shows the Hangul respelling): packages/golearn-extension/src/popup/card.ts renders `model.transliteration` but nothing renders
  // `CardModel.pronunciation` (the notes: "Pronounced [머걷씀니다] …", the sound rules). PLAN.md "Pronunciation" and brief XVI ask for the pronunciation on the card.
  it('7b. the card shows the pronunciation note "[머걷씀니다]" (the model has it, the card does not)', () => {
    expect(card.text()).toContain('머걷씀니다');
  });

  it('8. the learner changes the word\'s knowledge state on the card: "Familiar"', async () => {
    const button = levelButton(card, 'familiar');
    expect(button).toBeTruthy();
    button.click();
    await flush(60);
    expect(levelButton(card, 'familiar').getAttribute('aria-pressed')).toBe('true');
    expect(levelButton(card, 'new').getAttribute('aria-pressed')).not.toBe('true');
  });

  it('9. the events: on the device before any sync (queued, durable), carrying the lemma id and no passage text', async () => {
    await flush(60);
    const status = await rig.page({ type: MSG.status });
    expect(status.sync.pending, 'events wait on the device').toBeGreaterThanOrEqual(3);
    await syncUp();
    const all = (await rig.events(learnerId)).filter((e) => e.languageId === 'ko');
    for (const e of all) expect(validateEvent(e), e.kind).toEqual([]);
    const looked = (await eventsOf('SelectionLookedUp')).find((e) => e.subject.itemIds?.includes(LEMMA))!;
    expect(looked).toBeTruthy();
    expect(looked.enrolmentId).toBe(enrolmentId);
    expect(looked.languageId).toBe('ko');
    expect(looked.subject.itemIds).toEqual([LEMMA]);
    expect((looked.payload as { surface?: string }).surface).toBe(WORD);
    const marked = (await eventsOf('ItemMarked')).find((e) => e.subject.itemIds?.includes(LEMMA))!;
    expect(marked.payload).toMatchObject({ mark: 'familiar' });
    // privacy: the event holds the selected word, never the sentence or any other word of the page
    const dump = JSON.stringify(all);
    for (const other of ['저는 밥을', '밥을', '학생들이', '학교에서', '공부했습니다', '예산안', '읽으셨습니다', '눈이']) expect(dump, other).not.toContain(other);
    for (const s of Object.values(S)) expect(dump).not.toContain(s);
    expect(looked.subject.sentenceKey, 'the sentence is a hash').toMatch(/^[0-9a-f]{8,}$/);
  });

  // FAULT (the Repository service does not analyse Korean): packages/repository-linguistics/src/service.ts / packs.ts know Albanian and Hindi; every
  // other language, Korean included, is a generic form-only pack. A Korean lookup at the service answers one form unit at confidence 0.1 with the lemma,
  // part of speech and features "unknown" (packages/repository-service/src/main.ts:147 builds the service with no adapters). The encounter event
  // therefore carries only the lemma id, and no morph/form/particle unit rows exist at the service for GoReview's grammar assessments to name.
  it.fails('9b. the Repository resolves the Korean selection into lexeme and morphological units (lemma, form, morph), not a generic form unit', async () => {
    const r = await rig.api(token).lookup({ languageId: 'ko', surface: WORD, sentence: S.ate, selStart: S.ate.indexOf(WORD), selEnd: S.ate.indexOf(WORD) + WORD.length });
    expect(r.ok).toBe(true);
    const ids = r.ok ? r.data.units.map((u) => u.unitId) : [];
    expect(ids).toEqual(expect.arrayContaining([LEMMA, FORM, MORPH]));
  });

  // ═════════════════════════ 10: synchronise ═════════════════════════
  it('10. synchronisation: the event round-trips, the unit id is byte-identical at the service, in its knowledge row and back on the device', async () => {
    const stored = (await eventsOf('SelectionLookedUp')).find((e) => e.subject.itemIds?.includes(LEMMA))!;
    expect(hex(stored.subject.itemIds![0])).toBe(hex(LEMMA));
    expect((await rig.page({ type: MSG.status })).sync.pending).toBe(0);
    const row = (await rig.knowledge(learnerId, LEMMA))!;
    expect(hex(row.unitId)).toBe(hex(LEMMA));
    expect(row.languageId).toBe('ko');
    expect(row.dimensions.exposure.observations).toBeGreaterThan(0);
    // the device reads the account's knowledge of the same id (the profile answer is keyed by the id as the service holds it)
    const back = await rig.content({ type: MSG.profile, unitIds: [LEMMA, FORM, MORPH], languageId: 'ko' });
    expect(back.ok).toBe(true);
    expect(Object.keys(back.rows).map(hex)).toContain(hex(LEMMA));
    // the same event pulled to a second device would be skipped, not doubled: a second sync adds nothing
    const n = (await rig.events(learnerId)).length;
    await syncUp();
    expect((await rig.events(learnerId)).length).toBe(n);
  });

  // ═════════════════════════ 11-14: GoReview ═════════════════════════
  let reviewApp: Awaited<ReturnType<typeof rig.openPractice>>;
  it('11. GoReview opens, the learner signs in, the language shown is Korean', async () => {
    card.c.dispose();
    reviewApp = await rig.openPractice({ fresh: true });
    await rig.signInPractice();
    await reviewApp.go('review'); await reviewApp.ready(); await flush(10);
    await until(() => /Korean/.test(rig.practiceRoot.textContent ?? ''), 8000);
    expect(rig.practiceRoot.textContent).not.toContain('Not signed in');
  }, 60_000);

  it('12. an eligible Korean deck exists and holds the item: the candidate is admitted and the one card planned is the lexical card of 먹다', async () => {
    await reviewApp.go('review/details'); await reviewApp.ready(); await flush(10);
    await until(() => !!rig.practiceRoot.querySelector('#candidates'), 8000);
    const row = rig.practiceRoot.querySelector(`#candidates li[data-unit="${LEMMA}"]`)!;
    expect(row, 'the candidate list holds 먹다').toBeTruthy();
    expect(row.getAttribute('data-decision')).toBe('test-now');
    const m = (await loadReviewModel(reviewApp.ctx))!;
    expect(m.identity.languageId ?? 'ko').toBe('ko');
    const plan = (await planCurrentDeck(reviewApp.ctx, m)).plan;
    expect(plan.items.map((x) => x.item.itemId)).toEqual([`card:written-recognition:${LEMMA}`]);
  });

  it('13. the item is reviewed: an exercise in Hangul is presented, the headword 먹다 is shown without a homonym number, the answer is revealed on flipping', async () => {
    const out = await reviewOnce('good', 'start-session');
    expect(out.family).toBe('written-recognition');
    expect(out.front).toMatch(/[가-힣]/u);
    expect(out.front).toContain('먹었습니다');           // the form the learner met is the stimulus
    expect(out.tools).toContain('먹다');                // the headword
    expect(`${out.front}${out.back}${out.tools}`).not.toMatch(SUPERSCRIPT);
    expect(out.back).toContain('to eat');
  }, 60_000);

  let schedule1: { due: string; phase: string; reps: number; lapses: number; stability: number; scheduledDays: number };
  const deckItem = async () => foldDeckItems(await rig.events(learnerId), rig.scheduler, { languageId: 'ko', now: rig.nowIso() }).find((d) => d.unitId === LEMMA)!;
  it('14. FSRS: a correct answer moved the schedule (due later, learning); a later correct one graduates it; an incorrect one lapses it', async () => {
    const first = await deckItem();
    expect(first.schedule).toMatchObject({ reps: 1, lapses: 0, phase: 'learning' });
    expect(new Date(first.schedule.due).getTime()).toBeGreaterThan(rig.clockMs);
    expect(first.history.map((h) => h.outcome)).toEqual(['correct']);
    schedule1 = first.schedule as typeof schedule1;
    rig.tick(11 * MIN);                                   // past the learning step
    await reviewOnce('good');
    const second = await deckItem();
    expect(second.schedule.reps).toBe(2);
    expect(second.schedule.phase).toBe('review');
    expect(second.schedule.scheduledDays).toBeGreaterThanOrEqual(1);
    expect(new Date(second.schedule.due).getTime(), 'the interval grew from minutes to days').toBeGreaterThan(new Date(schedule1.due).getTime() + 24 * 60 * MIN);
    rig.tick(second.schedule.scheduledDays * 24 * 60 * MIN + MIN);
    await reviewOnce('again');
    const third = await deckItem();
    expect(third.schedule.lapses).toBe(1);
    expect(third.schedule.phase).toBe('relearning');
    expect(third.schedule.stability).toBeLessThan(second.schedule.stability);
    expect(new Date(third.schedule.due).getTime() - rig.clockMs, 'an incorrect answer is due again soon, not in days').toBeLessThan(24 * 60 * MIN);
    expect(third.history.map((h) => h.outcome)).toEqual(['correct', 'correct', 'incorrect']);
    // an incorrect answer sends the item to "Study missed items" (GoReview's remediation), shown by its headword; marked studied, it returns after ten minutes
    const app = await rig.openPractice();
    await app.go('review/deck'); await app.ready(); await flush(10);
    const missed = await until(() => rig.practiceRoot.querySelector<HTMLButtonElement>('[data-action="mark-studied"]'), 10_000);
    expect(rig.practiceRoot.textContent).toContain('먹다');
    expect(rig.practiceRoot.textContent ?? '').not.toMatch(SUPERSCRIPT);
    const details = rig.practiceRoot.querySelector<HTMLDetailsElement>('.remediation-item details')!;
    details.open = true; details.dispatchEvent(new Event('toggle'));   // opening it loads the study material from the pack's facts
    await until(() => !missed.disabled, 10_000).catch(() => { throw new Error('mark-studied stayed disabled: ' + (rig.practiceRoot.textContent ?? '').slice(0, 900)); });       // the button waits for the study material (the pack's facts)
    expect(rig.practiceRoot.querySelector('.remediation-item')!.textContent, 'the study material is the dictionary meaning of the headword').toMatch(/Meaning: to eat/);
    expect(rig.practiceRoot.querySelector('.remediation-item')!.textContent ?? '').not.toMatch(SUPERSCRIPT);
    missed.click();
    await until(() => !rig.practiceRoot.querySelector('[data-action="mark-studied"]'), 10_000).catch(() => { throw new Error('mark-studied did not take: ' + (rig.practiceRoot.textContent ?? '').slice(0, 900)); });
    await app.ctx.syncNow({ force: true });
    rig.tick(11 * MIN);
    await reviewOnce('good');
    const fourth = await deckItem();
    expect(fourth.schedule.lapses).toBe(1);
    expect(fourth.schedule.reps).toBe(4);
    // one lexical card all along: forms of the word never made another
    expect(foldDeckItems(await rig.events(learnerId), rig.scheduler, { languageId: 'ko', now: rig.nowIso() }).map((d) => d.itemId)).toEqual([`card:written-recognition:${LEMMA}`]);
    // the review's evidence reached the account's knowledge of the lemma
    const row = (await rig.knowledge(learnerId, LEMMA))!;
    expect(row.dimensions.readingRecognition.positive).toBeGreaterThan(0.06);
  }, 120_000);

  // ═════════════════════════ 15-16: back on the page ═════════════════════════
  it('15-16. back on the page the word is shown at the level the account now holds (after the review), and re-reading the page created no extra encounters', async () => {
    document.body.innerHTML = PAGE;
    registry = new Map(); w.CSS = { highlights: registry };
    const before = (await eventsOf('EncounterRecorded')).length;
    const a = makeActive(rig.reader());
    await a.start({ speak: false });
    await a.rescan(); await a.rescan();
    await flush(1500); await syncUp();                              // the dwell is 800 ms: the page's words are met once
    const recorded = (await eventsOf('EncounterRecorded')).length;
    await a.rescan(); await flush(1500); await syncUp();
    expect((await eventsOf('EncounterRecorded')).length, 'a re-scan of the same page creates no encounter').toBe(recorded);
    expect(recorded).toBeGreaterThanOrEqual(before);
    const reply = (await rig.content({ type: MSG.activeProfile, unitIds: [LEMMA, FORM], languageId: 'ko' })) as ProfileReply;
    const level = Object.entries(marks()).find(([, words]) => words.includes(WORD))?.[0];
    expect(level, 'the word is underlined').toBeTruthy();
    // the self-mark was Familiar; after reviews with a correct last answer the account's rows say at least that, and the underline follows them
    expect(['golearn-familiar', 'golearn-known', 'golearn-automatic', 'golearn-recognized']).toContain(level);
    expect(Object.keys(reply.rows ?? {}).map(hex)).toContain(hex(LEMMA));
    // the other forms of 먹다, which the learner never touched, share the lexical knowledge: they are not "new" (brief XVII)
    for (const f of FORMS) expect(marks()['golearn-new'] ?? [], f).not.toContain(f);
  }, 60_000);

  // ═════════════════════════ the same, offline ═════════════════════════
  describe('offline: steps 4-9 with no service reachable', () => {
    const OFF = '읽으셨습니다';
    const OFF_LEMMA = 'lemma:ko:읽다:VERB';
    let sawPending = 0;
    it('the page is still annotated from the device\'s own Repository, the card is still answered from the dictionary files, the mark is queued on the device', async () => {
      rig.net.down = true;
      document.body.innerHTML = PAGE; registry = new Map(); w.CSS = { highlights: registry };
      const r = rig.reader();
      const st = await makeActive(r).start({ speak: false });
      expect(st.on).toBe(true);
      expect(st.scanned).toBe(pageWords().length);
      expect(markedWords().length, 'underlines come from the device').toBeGreaterThan(10);
      active!.stop();
      const r2 = rig.reader();
      const out = await look(r2, OFF);
      expect(out.status).toBe('shown');
      expect(out.card).toMatchObject({ lemma: '읽다', pos: 'VERB', itemIds: [OFF_LEMMA] });
      expect(r2.text()).toMatch(/to read/);
      levelButton(r2, 'recognized').click();
      await flush(60); await rig.fireWorkerTimers();
      const status = await rig.page({ type: MSG.status });
      sawPending = status.sync.pending;
      expect(sawPending, 'the device queued the events').toBeGreaterThanOrEqual(3);
      expect(status.sync.lastError, 'the push failed').toBeTruthy();
      // the service has not seen them
      expect((await eventsOf('ItemMarked')).some((e) => e.subject.itemIds?.includes(OFF_LEMMA))).toBe(false);
      r2.c.dispose();
    }, 60_000);

    it('back online: the queued events reach the service, the unit id byte-identical, and nothing is doubled', async () => {
      rig.net.down = false;
      await syncUp(); await syncUp();
      expect((await rig.page({ type: MSG.status })).sync.pending).toBe(0);
      const looked = (await eventsOf('SelectionLookedUp')).filter((e) => e.subject.itemIds?.includes(OFF_LEMMA));
      expect(looked).toHaveLength(1);
      expect(hex(looked[0].subject.itemIds![0])).toBe(hex(OFF_LEMMA));
      const marked = (await eventsOf('ItemMarked')).filter((e) => e.subject.itemIds?.includes(OFF_LEMMA));
      expect(marked).toHaveLength(1);
      expect(marked[0].payload).toMatchObject({ mark: 'recognized' });
      expect(JSON.stringify(await rig.events(learnerId))).not.toContain(S.read);
    }, 60_000);
  });

  // ═════════════════════════ identity: what a lookup and a mark credit ═════════════════════════
  describe('identity at the Repository: which unit a lookup and a mark credit', () => {
    const creditOf = async (word: string, occurrence: number, mark?: string): Promise<{ lookedIds: string[]; markedIds: string[] }> => {
      document.body.innerHTML = PAGE;
      const r = rig.reader();
      const seen = new Set((await rig.events(learnerId)).map((e) => e.id));
      await look(r, word, occurrence);
      if (mark) { levelButton(r, mark).click(); await flush(60); }
      await syncUp();
      const fresh = async (kind: string) => (await eventsOf(kind)).filter((e) => !seen.has(e.id));
      await until(async () => (await fresh('SelectionLookedUp')).length > 0 && (!mark || (await fresh('ItemMarked')).length > 0), 8000);
      r.c.dispose();
      const looked = (await fresh('SelectionLookedUp'));
      const marked = mark ? await fresh('ItemMarked') : [];
      expect(looked, 'one new encounter').toHaveLength(1);
      expect(marked, 'one new mark').toHaveLength(mark ? 1 : 0);
      return { lookedIds: looked[0].subject.itemIds ?? [], markedIds: marked[0]?.subject.itemIds ?? [] };
    };

    it('눈이 예뻐요 (no cue): the undecided reading credits the BARE lemma, never 눈¹ or 눈²', async () => {
      const c = await creditOf('눈이', 1, 'seen');
      expect(c.lookedIds).toEqual(['lemma:ko:눈:NOUN']);
      expect(c.markedIds).toEqual(['lemma:ko:눈:NOUN']);
      expect([...c.lookedIds, ...c.markedIds].join()).not.toMatch(SUPERSCRIPT);
    }, 60_000);

    it('눈이 와요 (cue: snow): the encounter and the mark credit the numbered entry for "snow", read from the lexicon at run time', async () => {
      const snow = SNOW();
      expect(snow).toMatch(/^눈[¹²³⁴-⁹]+$|^눈$/u);
      const c = await creditOf('눈이', 0, 'seen');
      expect(c.lookedIds).toEqual([`lemma:ko:${snow}:NOUN`]);
      expect(c.markedIds).toEqual([`lemma:ko:${snow}:NOUN`]);
      expect(c.lookedIds[0], 'the cue decided: a numbered lemma, not the bare one').not.toBe('lemma:ko:눈:NOUN');
    }, 60_000);

    it('시간이 (a main-set word): the BARE lemma is credited', async () => {
      const c = await creditOf('시간이', 0, 'seen');
      expect(c.lookedIds).toEqual(['lemma:ko:시간:NOUN']);
      expect(c.markedIds).toEqual(['lemma:ko:시간:NOUN']);
    }, 60_000);

    it('예산안을 (an unlisted compound, unconfirmed): no lemma unit is credited, only the form (parser/index.ts itemIdsFor: not unconfirmed and confidence at least LEMMA_MIN_CONFIDENCE)', async () => {
      const c = await creditOf('예산안을', 0, 'seen');
      expect(c.lookedIds).toEqual(['form:ko:예산안을']);
      expect(c.markedIds).toEqual(['form:ko:예산안을']);
      expect(c.lookedIds.some((id) => id.startsWith('lemma:'))).toBe(false);
    }, 60_000);

    // retry: under a loaded machine a GoReview shell destroyed by the previous step can still finish a queued deck build and throw
  // ("Cannot read properties of undefined (reading 'now')", packages/goreview/app/engine.ts) into this test; seen about once in seven runs of
  // the whole suite, never in ten runs of this file alone. The race is in a destroyed shell's late work, not in what this test asserts.
  it('먹어요, 먹었습니다, 먹으면, 먹는 are ONE lemma unit at the Repository, and GoReview offers ONE lexical card for 먹다, not one per form', { retry: 2, timeout: 120_000 }, async () => {
      for (const [i, f] of FORMS.entries()) { const c = await creditOf(f, 0, ['known', 'recognized', 'familiar'][i]); expect(c.lookedIds, f).toEqual([LEMMA]); expect(c.markedIds, f).toEqual([LEMMA]); }
      const ids = new Set((await eventsOf('SelectionLookedUp')).flatMap((e) => e.subject.itemIds ?? []).filter((id) => id.includes('먹')));
      expect([...ids]).toEqual([LEMMA]);
      const app = await rig.openPractice({ fresh: true });
      await rig.signInPractice();
      await app.go('review'); await app.ready(); await flush(10);
      const deck = foldDeckItems(await rig.events(learnerId), rig.scheduler, { languageId: 'ko', now: rig.nowIso() }).filter((d) => d.itemId.includes('먹'));
      expect(deck.map((d) => d.itemId), 'the deck holds the ONE lexical card').toEqual(['card:written-recognition:' + LEMMA]);
      const m = (await loadReviewModel(app.ctx))!;
      const plan = (await planCurrentDeck(app.ctx, m)).plan;
      expect(plan.items.some((x) => /^card:.*:form:ko:먹/u.test(x.item.itemId))).toBe(false);
      expect(plan.items.filter((x) => x.item.itemId.includes('먹')).length).toBeLessThanOrEqual(1);
    });
  });

  // ═════════════════════════ a unit id with a superscript survives every hop ═════════════════════════
  describe('a numbered unit id survives every hop byte for byte', () => {
    it('JSON, the sync API (stored event, knowledge row, profile answer) and GoReview\'s card id', async () => {
      const snowId = `lemma:ko:${SNOW()}:NOUN`;
      if (!/[¹²³⁴-⁹]/u.test(snowId)) return; // the lexicon gives snow the bare lemma: nothing to carry
      expect(JSON.parse(JSON.stringify({ id: snowId })).id).toBe(snowId);
      const stored = (await eventsOf('SelectionLookedUp')).filter((e) => e.subject.itemIds?.includes(snowId));
      expect(stored.length).toBeGreaterThan(0);
      expect(hex(stored[0].subject.itemIds![0])).toBe(hex(snowId));
      const row = (await rig.knowledge(learnerId, snowId))!;
      expect(row, 'the knowledge row exists under the numbered id').toBeTruthy();
      expect(hex(row.unitId)).toBe(hex(snowId));
      const back = await rig.content({ type: MSG.profile, unitIds: [snowId], languageId: 'ko' });
      expect(Object.keys(back.rows).map(hex)).toContain(hex(snowId));
      expect(Object.keys(back.rows).some((k) => k.endsWith(':NOUN') && !/[¹²³⁴-⁹]/u.test(k) && /snow/.test(k))).toBe(false);
    });
  });
});

// ───────────────────────────── GoReview, one review through the real screens ─────────────────────────────
/** Opens GoReview, presses the deck button (the Current Deck for a new word, the Review Deck for a due one), flips the card and grades it. */
async function reviewOnce(grade: 'good' | 'again', button: 'start-session' | 'start-review' = 'start-review') {
  // the deck button that is enabled: a card still in its learning steps is in the Current Deck, a graduated one is in the Review Deck once due
  const app = await rig.openPractice();
  await app.go('review'); await app.ready(); await flush(10);
  const root = rig.practiceRoot;
  const enabled = (id: string): boolean => { const b = root.querySelector<HTMLButtonElement>('#' + id); return !!b && !b.disabled; };
  await until(() => enabled('start-review') || enabled('start-session'), 10_000).catch(() => { throw new Error('no deck button enabled: ' + (root.textContent ?? '').slice(0, 500)); });
  button = enabled('start-review') ? 'start-review' : 'start-session';
  root.querySelector<HTMLButtonElement>('#' + button)!.click();
  // an item that was missed and studied is offered on the Review Deck screen first (its own "Start review" button)
  await until(() => !!root.querySelector('#session .exercise') || !!root.querySelector<HTMLButtonElement>('#start-deck-review:not([disabled])'), 10_000).catch(() => undefined);
  root.querySelector<HTMLButtonElement>('#start-deck-review')?.click();
  await until(() => !!root.querySelector('#session .exercise'), 10_000).catch(() => { throw new Error('no exercise after ' + button + ': ' + (root.textContent ?? '').slice(0, 500)); });
  const ex = root.querySelector<HTMLElement>('#session .exercise')!;
  const family = ex.getAttribute('data-family') ?? '';
  const front = ex.textContent ?? '';
  const tools = root.querySelector('#item-tools')?.textContent ?? '';
  root.querySelector<HTMLButtonElement>('#flip-card')!.click();
  const back = (root.querySelector('#session .exercise')?.textContent ?? '') + (root.querySelector('#revealed-answer')?.textContent ?? '');
  q(`[data-grade="${grade}"]`, root).click();
  await until(() => !ex.isConnected, 8000);
  await app.ctx.syncNow({ force: true });
  await flush(20);
  return { family, front, back, tools };
}
