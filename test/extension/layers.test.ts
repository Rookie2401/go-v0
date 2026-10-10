// @vitest-environment jsdom
/**
 * The layered card and its pipeline: later arrivals never block the card, the order adapts to the learner model, every
 * layer opening records the right event (validated by the contract), failures of any side service leave an honest
 * partial card, and a language without a pack says so.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnsupportedAdapter, WebGenericAdapter } from '../../packages/golearn-extension/src/adapters';
import type { ContentServices } from '../../packages/golearn-extension/src/content/services';
import { LookupController, profileViewFrom } from '../../packages/golearn-extension/src/content/controller';
import { ASYNC_PHASES } from '../../packages/golearn-extension/src/metrics';
import { contextLine } from '../../packages/golearn-extension/src/parser/cardModel';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { createCardUI } from '../../packages/golearn-extension/src/popup/card';
import type { CorrectReply, ExplainReply, GlossReply, ProfileReply, PublicStatus } from '../../packages/golearn-extension/src/protocol';
import type { PlayResult, Pronouncer } from '../../packages/golearn-extension/src/popup/view';
import { createMemoryEncounterStore } from '../../packages/golearn-extension/src/store';
import { createMemoryMetricsStore } from '../../packages/golearn-extension/src/metrics';
import { validateEvent, type GoEvent } from '../../packages/repository-contract/src';
import { sqAdapter } from '../../src/adapters/sq';
import { flush, selectText, setBody, stubLayout } from './dom';

const SENTENCE = 'Unë po lexoj një libër të bukur në shtëpinë time.';
const PAGE = `<div id="content"><p id="p">${SENTENCE} Pastaj shkoj në punë.</p></div>`;
const ATTRIBUTION = 'Wiktionary, via kaikki.org — CC BY-SA 4.0';
// the Repository's morphological-construction id for "shtëpinë" (definite accusative singular), as the parser derives it
const CONSTRUCTION = (() => {
  const at = SENTENCE.indexOf('shtëpinë');
  const card = parseSelection({ surface: 'shtëpinë', context: { kind: 'sentence', confidence: 0.9, sentence: SENTENCE, selStart: at, selEnd: at + 'shtëpinë'.length } });
  const id = card.constructions.map((c) => c.unitId).find((u) => u.startsWith('morph:sq:NOUN:'));
  if (!id) throw new Error(`no morphological construction among ${card.constructions.map((c) => c.unitId).join(', ')}`);
  return id;
})();

const defer = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };
const status = (over: Partial<PublicStatus> = {}): PublicStatus => ({
  ok: true, connected: true, needsSignIn: false, languageId: 'sq', languageName: 'Albanian', packAvailable: true,
  ...over,
});
const row = (unitId: string, dims: Record<string, Partial<{ score: number; confidence: number; observations: number; positive: number; negative: number }>>) => ({
  unitId, dimensions: Object.fromEntries(Object.entries(dims).map(([k, d]) => [k, { score: 0, confidence: 0, observations: 0, positive: 0, negative: 0, ...d }])),
});
const profileReply = (rows: ProfileReply['rows'], over: Partial<ProfileReply> = {}): ProfileReply => ({ ok: true, connected: true, rows, depth: 'brief', depthOrigin: 'default', ...over });
const glossReply = (over: Partial<GlossReply> = {}): GlossReply => ({ ok: true, found: true, senses: ['house', 'home'], attribution: ATTRIBUTION, ...over });
const explainReply = (over: Partial<ExplainReply> = {}): ExplainReply => ({
  ok: true, source: 'pack',
  features: [{ key: 'Case', value: 'Acc', label: 'Case', brief: 'accusative', explanation: 'A noun changes its ending to show its job in the sentence. The accusative is the direct object.' }],
  constructions: [{ id: 'definite-accusative-singular', title: 'Definite accusative singular', brief: 'The ending marks a definite noun as the direct object.', explanation: 'The -in/-n ending marks a definite masculine noun as the direct object: libri becomes librin. A feminine noun usually shows the object with -në.' }],
  ...over,
});

interface Fake extends ContentServices { calls: Record<string, number> }
function fakeServices(over: Partial<ContentServices> = {}): Fake {
  const calls: Record<string, number> = {};
  const wrap = <K extends keyof ContentServices>(k: K, dflt: NonNullable<ContentServices[K]>): ContentServices[K] =>
    ((...a: unknown[]) => { calls[k] = (calls[k] ?? 0) + 1; return ((over[k] ?? dflt) as (...x: unknown[]) => unknown)(...a); }) as ContentServices[K];
  return {
    calls,
    status: wrap('status', async () => status()),
    profile: wrap('profile', async () => profileReply({})),
    gloss: wrap('gloss', async () => glossReply()),
    explain: wrap('explain', async () => explainReply()),
    correct: wrap('correct', async () => ({ ok: true, posted: true } satisfies CorrectReply)),
    pronounceInfo: wrap('pronounceInfo', async () => ({ ok: true, deviceVoice: 'maybe', remoteConsent: false, sources: [], note: '' })),
  };
}

const okPronouncer = (played: string[] = []): Pronouncer => ({
  availability: () => ({ available: true, note: 'Practice only.' }),
  play: (text): PlayResult => { played.push(text); return { ok: true, voice: 'synthetic', voiceId: 'device:sq-voice' }; },
});

let restore: () => void;
let rigs: Array<{ controller: LookupController; ui: ReturnType<typeof createCardUI> }> = [];

function makeRig(opts: { services?: ContentServices; pronouncer?: Pronouncer; parse?: typeof parseSelection; analysers?: string[] } = {}) {
  const store = createMemoryEncounterStore();
  const metrics = createMemoryMetricsStore();
  const holder: { c?: LookupController } = {};
  const ui = createCardUI({ doc: document, pronouncer: opts.pronouncer ?? okPronouncer(), onDismiss: () => holder.c?.onCardDismissed() });
  const parse = vi.fn(opts.parse ?? parseSelection);
  const controller = new LookupController({
    doc: document,
    adapters: [new WebGenericAdapter({ doc: document, segmentSentences: (t) => sqAdapter.segmentSentences(t) }), new UnsupportedAdapter()],
    parse, ui, store, metrics, services: opts.services, analysers: opts.analysers,
    identity: { learnerId: 'pending', enrolmentId: 'pending', deviceId: 'pending' }, version: '0.1.0', sessionId: `t${Math.random().toString(36).slice(2, 8)}`,
    nextFrame: () => Promise.resolve(),
  });
  holder.c = controller;
  rigs.push({ controller, ui });
  return { controller, ui, store, metrics, parse };
}

const root = (r: { ui: { root(): ShadowRoot | undefined } }): ShadowRoot => r.ui.root()!;
const rowTexts = (r: { ui: { root(): ShadowRoot | undefined } }): Record<string, string> =>
  Object.fromEntries([...root(r).querySelectorAll<HTMLElement>('.rows [data-row]')].map((el) => [el.dataset.row!, el.querySelector('.v')!.textContent!]));
const rowOrder = (r: { ui: { root(): ShadowRoot | undefined } }): string[] => [...root(r).querySelectorAll<HTMLElement>('.rows [data-row]')].map((el) => el.dataset.row!);
const click = (r: { ui: { root(): ShadowRoot | undefined } }, sel: string): void => (root(r).querySelector(sel) as HTMLElement).click();
const events = async (s: { list(): Promise<GoEvent[]> }, kind?: string): Promise<GoEvent[]> => (await s.list()).filter((e) => !kind || e.kind === kind);
const lookup = async (r: ReturnType<typeof makeRig>, word = 'shtëpinë') => {
  selectText(document.getElementById('p')!, word);
  const out = await r.controller.lookup({ trigger: 'command' });
  if (out.status !== 'shown') throw new Error(`expected a card, got ${JSON.stringify(out)}`);
  return out;
};

beforeEach(() => { restore = stubLayout(); setBody(PAGE); });
afterEach(() => { for (const r of rigs) r.controller.dispose(); rigs = []; restore(); vi.restoreAllMocks(); });

describe('later arrivals never block the card', () => {
  it('the card is on screen with "looking up…" while the dictionary is still on its way, and updates when the gloss arrives', async () => {
    const g = defer<GlossReply>();
    const services = fakeServices({ gloss: () => g.promise });
    const r = makeRig({ services, parse: (i) => ({ ...parseSelection(i), gloss: undefined }) }); // a word the word list knows but has no meaning for
    const out = await lookup(r); // resolves although the gloss has not arrived
    expect(services.calls.gloss).toBe(1);
    expect(rowTexts(r).meaning).toBe('looking up…');
    expect(await events(r.store)).toHaveLength(2); // the card was recorded without waiting for it
    g.resolve(glossReply({ senses: ['house', 'home', 'household'] }));
    await out.settled;
    expect(rowTexts(r).meaning).toBe(`house; home; household (${ATTRIBUTION})`);
  });

  it('when the word list already has a meaning it stays, and the dictionary\'s senses arrive as a separate, attributed line', async () => {
    const g = defer<GlossReply>();
    const r = makeRig({ services: fakeServices({ gloss: () => g.promise }) });
    const out = await lookup(r);
    expect(rowTexts(r).meaning).toBe('house, home');
    expect(rowTexts(r).dictionary).toBeUndefined();
    g.resolve(glossReply());
    await out.settled;
    expect(rowTexts(r).meaning).toBe('house, home');
    expect(rowTexts(r).dictionary).toBe(`house; home (${ATTRIBUTION})`);
  });

  it('a dictionary gloss is rendered as text, never as markup', async () => {
    const evil = '<img src=x onerror="window.__pwned=1">';
    const r = makeRig({ services: fakeServices({ gloss: async () => glossReply({ senses: [evil] }) }), parse: (i) => ({ ...parseSelection(i), gloss: undefined }) });
    const out = await lookup(r);
    await out.settled;
    expect(rowTexts(r).meaning).toBe(`${evil} (${ATTRIBUTION})`);
    expect(root(r).querySelector('img')).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('the learner-model line arrives later too: the card shows without it, then with it', async () => {
    const p = defer<ProfileReply>();
    const r = makeRig({ services: fakeServices({ profile: () => p.promise }) });
    const out = await lookup(r);
    expect(rowTexts(r).learner).toBeUndefined();
    p.resolve(profileReply({ 'lemma:sq:shtëpi:NOUN': row('lemma:sq:shtëpi:NOUN', { exposure: { observations: 3 }, readingRecognition: { observations: 2, score: 0.5, confidence: 0.6 } }) }));
    await out.settled;
    expect(rowTexts(r).learner).toBe('You have met this word 3 times; reading recognition: medium (confidence 0.60)');
    const tag = root(r).querySelector('[data-row="learner"] .tag')!;
    expect(tag.textContent).toBe('inference');
  });

  it('records the three late marks, and writes them into the same metrics row', async () => {
    const r = makeRig({ services: fakeServices() });
    const out = await lookup(r);
    await out.settled;
    await flush(5);
    const rows = await r.metrics.list();
    expect(rows).toHaveLength(1);
    for (const p of ASYNC_PHASES) expect(typeof rows[0].t[p], p).toBe('number');
    expect(rows[0].t.parsed!).toBeLessThan(rows[0].t.eventQueued! + 1);
    expect(rows[0].coldStart).toBe(true); // rewriting the row did not make it a second lookup
  });

  it('with no background at all (every call returns nothing) the card is still honest and complete: events recorded, states say why', async () => {
    const nothing = fakeServices({ status: async () => undefined, profile: async () => undefined, gloss: async () => undefined, explain: async () => undefined });
    const r = makeRig({ services: nothing, parse: (i) => ({ ...parseSelection(i), gloss: undefined }) });
    const out = await lookup(r);
    await out.settled;
    expect(rowTexts(r).learner).toBe('Your history with this word could not be loaded right now.');
    expect(rowTexts(r).meaning).toBe('No meaning in the word list; the dictionary could not be asked.'); // the failure reason is said, not hidden (2026-10-10)
    expect(rowTexts(r).lemma).toBe('shtëpi (NOUN)');
    expect(await events(r.store)).toHaveLength(2);
  });

  it('without services (the page has no extension API) the card shows the analyser\'s information only', async () => {
    const r = makeRig({});
    const out = await lookup(r);
    await out.settled;
    expect(rowTexts(r).meaning).toBe('house, home');
    expect(rowTexts(r).learner).toBeUndefined();
    expect(await events(r.store)).toHaveLength(2);
  });

  it('a late reply for a card that was replaced does nothing', async () => {
    const g = defer<GlossReply>();
    const r = makeRig({ services: fakeServices({ gloss: () => g.promise }), parse: (i) => ({ ...parseSelection(i), gloss: undefined }) });
    await lookup(r, 'shtëpinë');
    await lookup(r, 'libër'); // second card; its gloss is the same pending promise
    g.resolve(glossReply({ senses: ['book'] }));
    await flush(10);
    expect(rowTexts(r).lemma).toBe('libër (NOUN)');
    expect(rowTexts(r).meaning).toBe(`book (${ATTRIBUTION})`); // the live card got the reply that belongs to it
    expect(document.querySelectorAll('[data-golearn-host]')).toHaveLength(1);
  });
});

describe('adaptive order: the grammar hint above the gloss when the construction is weak', () => {
  it('a weak construction (grammatical understanding negative > positive) moves its hint above the meaning; every layer stays reachable', async () => {
    const weak = row(CONSTRUCTION, { grammaticalUnderstanding: { observations: 4, positive: 1, negative: 3, score: 0.25, confidence: 0.5 } });
    const p = defer<ProfileReply>();
    const r = makeRig({ services: fakeServices({ profile: () => p.promise }) });
    const out = await lookup(r);
    expect(rowOrder(r).indexOf('grammar')).toBeGreaterThan(rowOrder(r).indexOf('meaning')); // before the model arrives: the gloss first
    p.resolve(profileReply({ [CONSTRUCTION]: weak }));
    await out.settled;
    const order = rowOrder(r);
    expect(order.indexOf('grammar')).toBeGreaterThan(-1);
    expect(order.indexOf('grammar')).toBeLessThan(order.indexOf('meaning'));
    expect(order.indexOf('lemma')).toBeLessThan(order.indexOf('grammar'));
    expect(rowTexts(r).grammar).toMatch(/^Definite accusative singular: /);
    for (const cls of ['.l2', '.l3', '.l4', '.l5']) expect((root(r).querySelector(`button${cls}`) as HTMLButtonElement).disabled, cls).toBe(false);
  });

  it('a word the learner has never met gets the gloss first, and says so', async () => {
    const r = makeRig({ services: fakeServices({ profile: async () => profileReply({}) }) });
    const out = await lookup(r);
    await out.settled;
    const order = rowOrder(r);
    expect(order.indexOf('meaning')).toBeLessThan(order.indexOf('grammar'));
    expect(rowTexts(r).learner).toBe('You have not met this word before, as far as GoLearn knows.');
  });

  it('a construction the learner understands (positive >= negative) does not move', async () => {
    const strong = row(CONSTRUCTION, { grammaticalUnderstanding: { observations: 4, positive: 3, negative: 1, score: 0.75, confidence: 0.5 } });
    const r = makeRig({ services: fakeServices({ profile: async () => profileReply({ [CONSTRUCTION]: strong }) }) });
    await (await lookup(r)).settled;
    const order = rowOrder(r);
    expect(order.indexOf('meaning')).toBeLessThan(order.indexOf('grammar'));
  });

  it('not connected: no history is claimed, and the card says how to get it', async () => {
    const r = makeRig({ services: fakeServices({ profile: async () => ({ ok: true, connected: false, rows: {}, depth: 'brief', depthOrigin: 'default' }) }) });
    await (await lookup(r)).settled;
    expect(rowTexts(r).learner).toMatch(/^Not connected: your history with this word is not shown/);
    expect(root(r).querySelector('[data-row="learner"] .tag')!.textContent).toBe('fact');
  });

  it('reading recognition is not claimed when there is no observation of it', () => {
    const card = parseSelection({ surface: 'libër', context: { kind: 'none', confidence: 0 } });
    const v = profileViewFrom(card, profileReply({ [card.itemIds[0]]: row(card.itemIds[0], { exposure: { observations: 2 } }) }));
    expect(v).toMatchObject({ state: 'ready', met: 2, recognition: 'not-assessed', weak: [] });
    expect(profileViewFrom(card, profileReply({ [card.itemIds[0]]: row(card.itemIds[0], { exposure: { observations: 2 }, readingRecognition: { observations: 1, score: 0.9, confidence: 0.2 } }) })).recognition).toEqual({ level: 'high', confidence: 0.2 });
    expect(profileViewFrom(card, undefined)).toMatchObject({ state: 'unavailable' });
    // an answer that carries an error is not evidence of "never met"
    expect(profileViewFrom(card, profileReply({}, { stale: true, error: 'needs-sign-in' }))).toMatchObject({ state: 'unavailable', reason: 'needs-sign-in' });
    expect(profileViewFrom(card, profileReply({}, { stale: true, error: 'offline' }))).toMatchObject({ state: 'unavailable', reason: 'offline' });
    // ...unless the cache does hold the word
    expect(profileViewFrom(card, profileReply({ [card.itemIds[0]]: row(card.itemIds[0], { exposure: { observations: 4 } }) }, { stale: true, error: 'offline' }))).toMatchObject({ state: 'ready', met: 4, stale: true });
  });
});

describe('the five layers', () => {
  it('Layer 1 says what the context is, in plain words', async () => {
    const r = makeRig({ services: fakeServices() });
    await lookup(r);
    expect(rowTexts(r).context).toBe('full sentence');
    expect(contextLine(parseSelection({ surface: 'libër', context: { kind: 'sentence', confidence: 0.9, sentence: SENTENCE, selStart: 17, selEnd: 22 } }).context)).toBe('Context: full sentence');
    expect(contextLine({ kind: 'none', confidence: 0, reason: 'the reader does not provide sentence context', selectionLocated: true })).toBe('Context: only the selected word (this reader gives no sentence)');
    expect(contextLine({ kind: 'none', confidence: 0, reason: 'the selection is inside a frame this script cannot read', selectionLocated: true })).toBe('Context: only the selected word (the selection is inside a frame this script cannot read)');
    expect(contextLine({ kind: 'fragment', confidence: 0.2, selectionLocated: true })).toBe('Context: a fragment, not a verified sentence');
  });

  it('opening Layer 2, 3, 4 and 5 records AssistanceRequested with morphology / example / grammar / translation, each valid under the contract', async () => {
    const r = makeRig({ services: fakeServices() });
    const out = await lookup(r);
    await out.settled;
    expect((await events(r.store, 'AssistanceRequested'))).toHaveLength(0); // nothing is requested by merely showing the card
    click(r, 'button.l2'); click(r, 'button.l3'); click(r, 'button.l4'); click(r, 'button.l5');
    await flush(5);
    const got = (await events(r.store, 'AssistanceRequested')).map((e) => e.payload);
    expect(got).toEqual([
      { assistance: 'morphology', layer: 'morphology' },
      { assistance: 'example', layer: 'phrase-syntax' },
      { assistance: 'grammar', layer: 'grammar', depth: 'brief' },
      { assistance: 'translation', layer: 'sentence' },
    ]);
    for (const e of await r.store.list()) expect(validateEvent(e), `${e.kind}`).toEqual([]);
    // Layer 1 shown is an AnalysisShown, recorded with the lookup
    const shown = await events(r.store, 'AnalysisShown');
    expect(shown).toHaveLength(1);
    expect(shown[0].payload).toEqual({ layers: ['identification'] });
    expect(shown[0].subject.itemIds).toEqual(['lemma:sq:shtëpi:NOUN']);
    expect(shown[0].subject.sentenceKey).toBeTruthy();
    expect(JSON.stringify(await r.store.list())).not.toContain('lexoj'); // no sentence anywhere
  });

  it('opening the same layer twice on one card is one event; closing is not a request', async () => {
    const r = makeRig({ services: fakeServices() });
    await (await lookup(r)).settled;
    click(r, 'button.l2'); click(r, 'button.l2'); click(r, 'button.l2');
    await flush(5);
    expect(await events(r.store, 'AssistanceRequested')).toHaveLength(1);
    expect((root(r).querySelector('button.l2') as HTMLElement).getAttribute('aria-expanded')).toBe('true');
  });

  it('Layer 2 is a table of the features that exist, labelled from the pack when it answered', async () => {
    const r = makeRig({ services: fakeServices() });
    await (await lookup(r)).settled;
    click(r, 'button.l2');
    const table = root(r).querySelector('.layer.l2 table')!;
    const rows = [...table.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('th, td')].map((c) => c.textContent));
    expect(rows.map((x) => x[0])).toEqual(expect.arrayContaining(['Case', 'Definite', 'Number']));
    const caseRow = rows.find((x) => x[0] === 'Case')!;
    expect(caseRow[1]).toBe('accusative');
    expect(caseRow[2]).toBe('A noun changes its ending to show its job in the sentence.'); // 'brief' depth: the first sentence
    expect(rows.find((x) => x[0] === 'Definite')![1]).toBe('Def'); // the pack gave no entry for it: the analyser's own value, unexplained
    const noPack = makeRig({ services: fakeServices({ explain: async () => explainReply({ source: 'none', features: [], constructions: [] }) }) });
    await (await lookup(noPack)).settled;
    click(noPack, 'button.l2');
    expect(root(noPack).querySelector('.layer.l2')!.textContent).toMatch(/the pack’s explanations were not available/);
  });

  it('Layer 3 lists phrases and units, and shows the syntax relation (Stage 4) or says plainly when the analyser gives none', async () => {
    const r = makeRig({ services: fakeServices() });
    await (await lookup(r)).settled;
    click(r, 'button.l3');
    const t = root(r).querySelector('.layer.l3')!.textContent!;
    // the Albanian analyser has syntax rules since Stage 4: the relation line names the rules and the attached share; an analyser without rules keeps the old role line
    expect(t).toMatch(/Generated by the analyser.s rules \([\w-]+@\d+\); \d+% of this sentence|role: not available from this analyser|could not attach this word/);
    expect(t).toContain('Definite accusative singular');
  });

  it('Layer 3 with a phrase: the phrase entry and its meaning', async () => {
    setBody('<div><p id="p">Ai ka shumë punë sot.</p></div>');
    const r = makeRig({ services: fakeServices() });
    selectText(document.getElementById('p')!, 'shumë');
    const out = await r.controller.lookup({ trigger: 'command' });
    if (out.status !== 'shown') throw new Error('card');
    click(r, 'button.l3');
    expect(root(r).querySelector('.layer.l3')!.textContent).toMatch(/Phrases|Syntax|role: not available/);
  });

  it('Layer 4 follows the explanation depth: label, brief, explanatory', async () => {
    const texts: Record<string, string> = {};
    for (const depth of ['label', 'brief', 'explanatory'] as const) {
      const r = makeRig({ services: fakeServices({ profile: async () => profileReply({}, { depth, depthOrigin: depth === 'label' ? 'settings' : 'default' }) }) });
      await (await lookup(r)).settled;
      click(r, 'button.l4');
      await flush(5);
      texts[depth] = root(r).querySelector('.layer.l4')!.textContent!;
      const ev = (await events(r.store, 'AssistanceRequested'))[0];
      expect(ev.payload).toMatchObject({ assistance: 'grammar', depth });
      r.controller.dispose();
    }
    expect(texts.label).toContain('Definite accusative singular');
    expect(texts.label).not.toContain('The ending marks');
    expect(texts.brief).toContain('The ending marks a definite noun as the direct object.');
    expect(texts.brief).not.toContain('libri becomes librin');
    expect(texts.explanatory).toContain('libri becomes librin');
    expect(texts.label).toContain('(your setting)');
  });

  it('Layer 4 falls back to the analyser\'s own explanation when the pack says nothing, and is honest when there is none', async () => {
    const r = makeRig({ services: fakeServices({ explain: async () => explainReply({ source: 'none', features: [], constructions: [] }) }) });
    await (await lookup(r)).settled;
    click(r, 'button.l4');
    expect(root(r).querySelector('.layer.l4')!.textContent).toContain('The ending marks a definite noun as the direct object.');
    setBody('<div><p id="p">Zogu fluturon.</p></div>');
    const r2 = makeRig({ services: fakeServices({ explain: async () => explainReply({ source: 'none', features: [], constructions: [] }) }) });
    selectText(document.getElementById('p')!, 'fluturon');
    await (await r2.controller.lookup({ trigger: 'command' }) as { settled: Promise<void> }).settled;
    click(r2, 'button.l4');
    expect(root(r2).querySelector('.layer.l4')!.textContent).toMatch(/construction|No grammar note|Definite|Present/);
  });

  it('Layer 5 is a word-by-word list behind a disclosure, says there is no machine translation, and marks the selected word', async () => {
    const r = makeRig({ services: fakeServices() });
    await (await lookup(r)).settled;
    const panel = root(r).querySelector('.layer.l5') as HTMLElement;
    expect(panel.hasAttribute('hidden')).toBe(true);
    click(r, 'button.l5');
    expect(panel.hasAttribute('hidden')).toBe(false);
    expect(panel.textContent).toContain('There is no machine translation in GoLearn');
    const items = [...panel.querySelectorAll('li')].map((li) => li.textContent);
    expect(items.length).toBe(10); // Unë po lexoj një libër të bukur në shtëpinë time
    expect(items.find((t) => t!.startsWith('lexoj') || t!.startsWith('lexoj:'))).toBeTruthy();
    expect(panel.querySelector('li.sel')!.textContent).toMatch(/^shtëpinë: shtëpi \(NOUN\)/);
  });

  it('Layer 5 with no sentence context says there is nothing to list', async () => {
    const r = makeRig({ services: fakeServices() });
    r.controller.dispose();
    const a = new WebGenericAdapter({ doc: document, segmentSentences: (t) => sqAdapter.segmentSentences(t) });
    const none = makeRig({ services: fakeServices(), parse: (i) => parseSelection({ ...i, context: { kind: 'none', confidence: 0 } }) });
    void a;
    await (await lookup(none)).settled;
    click(none, 'button.l5');
    expect(root(none).querySelector('.layer.l5')!.textContent).toContain('no sentence context');
    expect(rowTexts(none).context).toBe('only the selected word (this reader gives no sentence)');
  });
});

describe('pronunciation', () => {
  it('a failure is one line and never blocks or alters the analysis; nothing is recorded as played', async () => {
    const pron: Pronouncer = { availability: () => ({ available: true, note: 'Practice only.' }), play: () => ({ ok: false, message: 'This device has no sq voice.' }) };
    const r = makeRig({ services: fakeServices(), pronouncer: pron });
    await (await lookup(r)).settled;
    const before = JSON.stringify(rowTexts(r));
    click(r, '.say');
    await flush(5);
    expect(root(r).querySelector('.pron')!.textContent).toBe('This device has no sq voice.');
    expect(JSON.stringify(rowTexts(r))).toBe(before);
    expect(await events(r.store, 'PronunciationPlayed')).toHaveLength(0);
    expect((root(r).querySelector('.say') as HTMLButtonElement).disabled).toBe(false); // it can be tried again
  });

  it('availability that throws or rejects leaves a working card with the button off and a note', async () => {
    for (const availability of [() => { throw new Error('boom'); }, () => Promise.reject(new Error('boom'))]) {
      const r = makeRig({ services: fakeServices(), pronouncer: { availability: availability as Pronouncer['availability'], play: () => ({ ok: true, voice: 'synthetic' }) } });
      const out = await lookup(r);
      await out.settled;
      await flush(5);
      expect((root(r).querySelector('.say') as HTMLButtonElement).disabled).toBe(true);
      expect(root(r).querySelector('.pron')!.textContent).toBe('Pronunciation is not available right now.');
      expect(rowTexts(r).lemma).toBe('shtëpi (NOUN)');
      r.controller.dispose();
    }
  });

  it('a play that throws is a failure message, not an exception', async () => {
    const r = makeRig({ services: fakeServices(), pronouncer: { availability: () => ({ available: true, note: 'ok' }), play: () => { throw new Error('boom'); } } });
    await (await lookup(r)).settled;
    click(r, '.say');
    await flush(5);
    expect(root(r).querySelector('.pron')!.textContent).toBe('Pronunciation failed.');
  });

  it('each play records PronunciationPlayed with the voice, and the second is flagged repeated', async () => {
    const played: string[] = [];
    const r = makeRig({ services: fakeServices(), pronouncer: okPronouncer(played) });
    await (await lookup(r)).settled;
    click(r, '.say'); await flush(5);
    click(r, '.say'); await flush(5);
    expect(played).toEqual(['shtëpinë', 'shtëpinë']);
    const ev = await events(r.store, 'PronunciationPlayed');
    expect(ev.map((e) => e.payload)).toEqual([
      { voice: 'synthetic', voiceId: 'device:sq-voice', repeated: false },
      { voice: 'synthetic', voiceId: 'device:sq-voice', repeated: true },
    ]);
    for (const e of ev) { expect(validateEvent(e)).toEqual([]); expect(e.evidence).toEqual({ quality: 'none', assisted: false }); } // exposure, never evidence
  });
});

describe('Review this', () => {
  it('records ItemMarked saved once, disables itself, and says so', async () => {
    const r = makeRig({ services: fakeServices() });
    await (await lookup(r)).settled;
    click(r, '.saveBtn'); await flush(5);
    const marks = await events(r.store, 'ItemMarked');
    expect(marks).toHaveLength(1);
    expect(marks[0].payload).toEqual({ mark: 'saved' });
    expect(marks[0].subject.itemIds).toEqual(['lemma:sq:shtëpi:NOUN']);
    expect(validateEvent(marks[0])).toEqual([]);
    const btn = root(r).querySelector('.saveBtn') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('Saved for review');
    expect(root(r).querySelector('.feedback')!.textContent).toBe('Saved for review.');
    btn.click(); await flush(5);
    expect(await events(r.store, 'ItemMarked')).toHaveLength(1);
  });

  it('a failed write is said, and the button stays usable', async () => {
    const r = makeRig({ services: fakeServices() });
    await (await lookup(r)).settled;
    (r.store as { append: unknown }).append = async () => ({ ok: false, error: 'full' });
    click(r, '.saveBtn'); await flush(5);
    expect(root(r).querySelector('.feedback')!.textContent).toBe('Could not save that. Try again.');
    expect((root(r).querySelector('.saveBtn') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('"This analysis is wrong"', () => {
  const pickLemma = (r: ReturnType<typeof makeRig>, lemma: string) => {
    click(r, '.wrongBtn');
    const form = root(r).querySelector('form.fix') as HTMLFormElement;
    const typed = form.querySelector('#alt-typed') as HTMLInputElement;
    const text = form.querySelector('#typed-lemma') as HTMLInputElement;
    text.value = lemma;
    text.dispatchEvent(new Event('input'));
    expect(typed.checked).toBe(true);
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  };

  it('a typed lemma: an AnalysisCorrected event referencing the lookup, and the proposal sent through the background', async () => {
    const services = fakeServices();
    const r = makeRig({ services });
    await (await lookup(r, 'bukur')).settled;
    const form = root(r).querySelector('form.fix') as HTMLElement;
    expect(form.hasAttribute('hidden')).toBe(true);
    pickLemma(r, 'i bukur');
    await flush(10);
    const sel = (await events(r.store, 'SelectionLookedUp'))[0];
    const ev = await events(r.store, 'AnalysisCorrected');
    expect(ev).toHaveLength(1);
    expect(ev[0].correctionOf).toBe(sel.id);
    expect(ev[0].payload).toEqual({ formId: 'form:sq:bukur', by: 'learner', correctedLexemeId: 'lemma:sq:i bukur', reason: 'typed the lemma' });
    expect(ev[0].subject.sentenceKey).toBe(sel.subject.sentenceKey);
    expect(validateEvent(ev[0])).toEqual([]);
    expect(services.calls.correct).toBe(1);
    expect(root(r).querySelector('.feedback')!.textContent).toBe('Correction sent. It is a proposal until a reviewer checks it.');
    expect(form.hasAttribute('hidden')).toBe(true);
  });

  it('choosing one of the other readings sends that reading\'s lemma and part of speech', async () => {
    const seen: unknown[] = [];
    const services = fakeServices({ correct: async (req) => { seen.push(req); return { ok: true, posted: true }; } });
    const r = makeRig({ services });
    const out = await lookup(r, 'bukur');
    expect(out.card.alternatives.length).toBeGreaterThan(0);
    click(r, '.wrongBtn');
    const first = root(r).querySelector('form.fix input[name="reading"]') as HTMLInputElement;
    first.checked = true;
    (root(r).querySelector('form.fix') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await flush(10);
    const alt = out.card.alternatives[0];
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ formId: 'form:sq:bukur', languageId: 'sq', lexemeId: `lemma:sq:${alt.lemma}${alt.pos ? ':' + alt.pos : ''}`, reason: 'chose another reading of this form' });
  });

  it('submitting with nothing chosen records nothing and says what is missing', async () => {
    const services = fakeServices();
    const r = makeRig({ services });
    await (await lookup(r, 'bukur')).settled;
    click(r, '.wrongBtn');
    (root(r).querySelector('form.fix') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await flush(5);
    expect(root(r).querySelector('.feedback')!.textContent).toBe('Choose a reading or type the lemma first.');
    expect(await events(r.store, 'AnalysisCorrected')).toHaveLength(0);
    expect(services.calls.correct ?? 0).toBe(0);
  });

  it('not connected: the correction is kept on this device and the card says how to send it', async () => {
    const r = makeRig({ services: fakeServices({ correct: async () => ({ ok: true, posted: false, reason: 'not-connected' }) }) });
    await (await lookup(r, 'bukur')).settled;
    pickLemma(r, 'i bukur');
    await flush(10);
    expect(await events(r.store, 'AnalysisCorrected')).toHaveLength(1);
    expect(root(r).querySelector('.feedback')!.textContent).toBe('Saved on this device. Connect GoLearn to send it.');
  });

  it('no answer from the background still keeps the event; typing a separator is refused in the form', async () => {
    const r = makeRig({ services: fakeServices({ correct: async () => undefined }) });
    await (await lookup(r, 'bukur')).settled;
    pickLemma(r, 'a:b');
    await flush(5);
    expect(root(r).querySelector('.feedback')!.textContent).toMatch(/may not contain/);
    expect(await events(r.store, 'AnalysisCorrected')).toHaveLength(0);
    pickLemma(r, 'i bukur');
    await flush(10);
    expect(await events(r.store, 'AnalysisCorrected')).toHaveLength(1);
    expect(root(r).querySelector('.feedback')!.textContent).toBe('Saved on this device.');
  });

  it('is off for a selection of several words', async () => {
    const r = makeRig({ services: fakeServices() });
    selectText(document.getElementById('p')!, 'një libër');
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(out.status).toBe('shown');
    expect((root(r).querySelector('.wrongBtn') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('honest partial cards', () => {
  it('an unknown word: a guessed lemma is labelled a guess, no meaning is invented by the analyser, and the dictionary IS asked with the word as written (a failed morphology must not block a definition, 2026-10-10)', async () => {
    setBody('<div><p id="p">Flurbozitet shkëlqejnë sot.</p></div>');
    const asked: Array<{ lemma: string; forms?: string[] }> = [];
    const services = fakeServices({ profile: async () => profileReply({}), gloss: async (req) => { asked.push({ lemma: req.lemma, forms: req.forms }); return { ok: true, found: false, senses: [], reason: 'not-found' }; } });
    const r = makeRig({ services });
    selectText(document.getElementById('p')!, 'Flurbozitet');
    const out = await r.controller.lookup({ trigger: 'command' });
    if (out.status !== 'shown') throw new Error('card');
    await out.settled;
    expect(out.card.unconfirmed).toBe(true);
    const t = rowTexts(r);
    expect(Object.keys(t)).toContain('lemma');
    expect(root(r).querySelector('[data-row="lemma"] .k')!.textContent).toBe('lemma (guess)');
    expect(t.meaning).toBe('No meaning in the word list; not in the dictionary either.');
    expect(services.calls.gloss).toBe(1);
    expect(asked[0].lemma).toBe('Flurbozitet'); // the word as written, not the guess, is what the dictionary is asked about first
    expect(asked[0].forms).toEqual(expect.arrayContaining(['Flurbozitet', 'flurbozitet']));
    expect(t.learner).toBe('You have not met this word before, as far as GoLearn knows.');
    const sel = (await events(r.store, 'SelectionLookedUp'))[0];
    expect(sel.payload).toMatchObject({ unconfirmed: true, provenance: 'rule' });
    expect(sel.subject.itemIds![0]).toMatch(/^form:sq:/);
  });

  it('a word the analyser cannot read at all: no lemma row, "Not in the word list.", still recorded as a lookup', async () => {
    setBody('<div><p id="p">Ai tha xqzv sot.</p></div>');
    const r = makeRig({ services: fakeServices() });
    selectText(document.getElementById('p')!, 'xqzv');
    const out = await r.controller.lookup({ trigger: 'command' });
    if (out.status !== 'shown') throw new Error('card');
    expect(out.card.provenance === 'none' || out.card.unconfirmed).toBe(true);
    expect(await events(r.store, 'SelectionLookedUp')).toHaveLength(1);
  });
});

describe('a language without a pack', () => {
  it('says so, runs no analysis, and records the lookup and nothing else', async () => {
    const r = makeRig({ services: fakeServices({ status: async () => status({ languageId: 'de', languageName: 'German', packAvailable: false }) }) });
    selectText(document.getElementById('p')!, 'shtëpinë');
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(out).toMatchObject({ status: 'message', reason: 'no-pack' });
    expect(root(r).textContent).toContain('There is no GoLearn pack for German yet');
    expect(root(r).textContent).toContain('The lookup was counted; nothing else was recorded.');
    expect(r.parse).not.toHaveBeenCalled();
    expect(r.ui.root()!.querySelector('.layerBtn')).toBeNull();
    const all = await r.store.list();
    expect(all.map((e) => e.kind)).toEqual(['SelectionLookedUp']);
    expect(all[0]).toMatchObject({ languageId: 'de', payload: { surface: 'shtëpinë', mode: 'no-pack', helpShown: ['surface'] } });
    expect(all[0].subject.itemIds).toEqual(['form:de:shtëpinë']);
    expect(validateEvent(all[0])).toEqual([]);
    expect(all[0].provenance).toBeUndefined(); // no analyser ran: no analysis is claimed
  });

  it('a pack that exists but whose analyser this build does not bundle says that instead', async () => {
    const r = makeRig({ services: fakeServices({ status: async () => status({ languageId: 'es', languageName: 'Spanish', packAvailable: true }) }) });
    selectText(document.getElementById('p')!, 'libër');
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(out).toMatchObject({ status: 'message', reason: 'no-analyser' });
    expect(root(r).textContent).toContain('The Spanish pack exists, but this version of the reader does not bundle its analyser');
    expect((await r.store.list()).map((e) => e.kind)).toEqual(['SelectionLookedUp']);
  });

  it('a long selection in such a language stores no text at all', async () => {
    const r = makeRig({ services: fakeServices({ status: async () => status({ languageId: 'de', languageName: 'German', packAvailable: false }) }) });
    selectText(document.getElementById('p')!, 'Unë po lexoj një libër');
    await r.controller.lookup({ trigger: 'command' });
    const e = (await r.store.list())[0];
    expect(e.payload.surfaceOmitted).toBe(true);
    expect(e.payload.surface).toBeUndefined();
    expect(e.subject.itemIds).toEqual([]);
    expect(validateEvent(e)).toEqual([]);
  });
});
