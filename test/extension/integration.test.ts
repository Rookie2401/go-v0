// @vitest-environment jsdom
/**
 * The whole path with nothing faked between the page and the service: a controller and card in the page, the message
 * bridge, the background worker, the real service handler. A lookup while signed out, the sign-in, a lookup while signed
 * in with the learner model and the dictionary, the layer events, and the sync that carries them.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UnsupportedAdapter, WebGenericAdapter } from '../../packages/golearn-extension/src/adapters';
import { LookupController } from '../../packages/golearn-extension/src/content/controller';
import { createBridge } from '../../packages/golearn-extension/src/content/services';
import { parseSelection } from '../../packages/golearn-extension/src/parser';
import { createCardUI } from '../../packages/golearn-extension/src/popup/card';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { validateEvent } from '../../packages/repository-contract/src';
import { sqAdapter } from '../../src/adapters/sq';
import { flush, selectText, setBody, stubLayout } from './dom';
import { createRig, knowledgeRow, type Rig } from './rig';

const SENTENCE = 'Unë po lexoj një libër të bukur në shtëpinë time.';
const PAGE = `<div id="content"><p id="p">${SENTENCE}</p></div>`;
/** The Repository's morphological-construction id the parser derives for a word of the page sentence. */
const constructionIdOf = (word: string): string => {
  const at = SENTENCE.indexOf(word);
  const id = parseSelection({ surface: word, context: { kind: 'sentence', confidence: 0.9, sentence: SENTENCE, selStart: at, selEnd: at + word.length } }).constructions.map((c) => c.unitId).find((u) => u.startsWith('morph:'));
  if (!id) throw new Error(`no morphological construction for ${word}`);
  return id;
};
let restore: () => void;
let rig: Rig;
let controller: LookupController | undefined;

beforeEach(() => { restore = stubLayout(); setBody(PAGE); rig = createRig(); });
afterEach(() => { controller?.dispose(); controller = undefined; restore(); });

function pageController() {
  const content = rig.fake.contentChrome(7);
  const bridge = createBridge(content);
  const holder: { c?: LookupController } = {};
  const ui = createCardUI({ doc: document, speech: null, onDismiss: () => holder.c?.onCardDismissed() });
  controller = new LookupController({
    doc: document,
    adapters: [new WebGenericAdapter({ doc: document, segmentSentences: (t) => sqAdapter.segmentSentences(t) }), new UnsupportedAdapter()],
    parse: parseSelection, ui, store: bridge.events, metrics: bridge.metrics, services: bridge, analysers: ['sq'],
    identity: { learnerId: 'pending', enrolmentId: 'pending', deviceId: 'pending' }, version: '0.1.0', sessionId: 'integration', nextFrame: () => Promise.resolve(),
  });
  holder.c = controller;
  return { ui, controller };
}

const text = (ui: { root(): ShadowRoot | undefined }): string => ui.root()!.textContent ?? '';

describe('page -> bridge -> background -> service', () => {
  it('signed out: the card works, the events wait on the device under a local name; nothing touches the network', async () => {
    const { ui, controller: c } = pageController();
    selectText(document.getElementById('p')!, 'shtëpinë');
    const out = await c.lookup({ trigger: 'command' });
    if (out.status !== 'shown') throw new Error('card');
    await out.settled;
    expect(out.recorded).toBe('recorded');
    expect(text(ui)).toContain('shtëpi (NOUN)');
    // no account, but the device's own Repository answers: the footer carries the learner's local count, never "not connected"
    expect(text(ui)).toMatch(/· \d+× encounters/);
    expect(text(ui)).not.toContain('Not connected');
    expect(rig.log.filter((l) => !l.path.includes("/dict/"))).toEqual([]); // only the dictionary, read from the extension's own files
    const local = Object.values(await rig.fake.local.get(null)).filter((v) => (v as { learnerId?: string })?.learnerId?.startsWith('local:'));
    expect(local).toHaveLength(2);
  });

  it('signed in: identity is the account\'s, the learner model and the dictionary arrive, layer events are recorded and synced', async () => {
    const who = await rig.signUp();
    await rig.h.store.putKnowledge([
      knowledgeRow(who.learnerId, 'lemma:sq:shtëpi:NOUN', { exposure: { observations: 5 }, readingRecognition: { observations: 3, score: 0.8, confidence: 0.7 } }),
      knowledgeRow(who.learnerId, constructionIdOf('shtëpinë'), { grammaticalUnderstanding: { observations: 4, positive: 0, negative: 4, score: 0.1, confidence: 0.6 } }),
    ]);
    await rig.connect();
    await rig.fireTimers();
    const { ui, controller: c } = pageController();
    selectText(document.getElementById('p')!, 'shtëpinë');
    const out = await c.lookup({ trigger: 'command' });
    if (out.status !== 'shown') throw new Error('card');
    await out.settled;
    await flush(30);

    // the learner model: the number of earlier meetings in the footer, a weak construction first in Grammar, and the dictionary with its attribution
    expect(ui.root()!.querySelector('.encounters')!.textContent).toBe('· 8× encounters');
    expect(text(ui)).toContain('house; home (Wiktionary, via kaikki.org — CC BY-SA 4.0)');
    // Go deeper: the pack's own words for the form
    (ui.root()!.querySelector('button.deeperBtn') as HTMLElement).click();
    (ui.root()!.querySelector('button.analysisBtn') as HTMLElement).click(); // the grammar is in the ANALYSIS dropdown
    (ui.root()!.querySelector('button.sentenceBtn') as HTMLElement).click(); // the sentence has its own pill (it closes Go deeper)
    expect(ui.root()!.querySelector('.layer.l2')!.textContent).toContain('accusative');
    expect(ui.root()!.querySelector('.layer.l4 .row strong')!.textContent).toBe('Definite accusative singular');
    (ui.root()!.querySelector('.rateBtn[data-mark="seen"]') as HTMLElement).click();
    await flush(30);

    // what the service now holds: the lookup, the card, the eight sections of Go deeper, the mark; all under the account, none with text
    await rig.fireTimers();
    const kinds = (await rig.h.store.list({ learnerId: who.learnerId })).filter((e) => e.producer.app === 'golearn-ext').map((e) => e.kind).sort();
    expect(kinds).toEqual(['AnalysisShown', ...Array(8).fill('AssistanceRequested'), 'ItemMarked', 'SelectionLookedUp']);
    for (const e of await rig.h.store.list({ learnerId: who.learnerId })) {
      expect(validateEvent(e)).toEqual([]);
      if (e.producer.app === 'golearn-ext') expect(e.enrolmentId).toBe(who.enrolmentId);
    }
    expect(JSON.stringify(rig.h.store.dump())).not.toContain('lexoj');
    expect(JSON.stringify(rig.h.store.dump())).not.toContain('bukur në');
    // and the page itself never held the token: the content chrome has no storage
    expect((rig.fake.contentChrome() as unknown as { storage?: unknown }).storage).toBeUndefined();
    expect((await rig.page({ type: MSG.status })).sync.pending).toBe(0);
  });

  it('a correction goes to the shared word list through the background, and the event goes through the queue', async () => {
    const who = await rig.signUp();
    await rig.connect();
    const { ui, controller: c } = pageController();
    selectText(document.getElementById('p')!, 'bukur');
    const out = await c.lookup({ trigger: 'command' });
    if (out.status !== 'shown') throw new Error('card');
    (ui.root()!.querySelector('.reportBtn') as HTMLElement).click();
    const form = ui.root()!.querySelector('form.fix') as HTMLFormElement;
    (form.querySelector('#typed-lemma') as HTMLInputElement).value = 'i bukur';
    (form.querySelector('#alt-typed') as HTMLInputElement).checked = true;
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await flush(50);
    expect(rig.h.linguistics.correctCalls.map((x) => x.formId)).toEqual(['form:sq:bukur']);
    await rig.fireTimers();
    const corrections = (await rig.h.store.list({ learnerId: who.learnerId, kinds: ['AnalysisCorrected'] }));
    // the service's own record of the correction, and the extension's queued event that names the lookup it corrects
    expect(corrections.map((e) => e.producer.app).sort()).toEqual(['golearn-ext', 'repository']);
    expect(corrections.find((e) => e.producer.app === 'golearn-ext')!.correctionOf).toMatch(/^ev:/);
    expect(text(ui)).toContain('Correction sent.');
  });

  it('after the service stops accepting the sign-in the card still works and keeps recording locally', async () => {
    await rig.signUp();
    await rig.connect();
    const token = ((await rig.fake.local.get('golearn:session'))['golearn:session'] as { token: string }).token;
    await rig.h.api(token).deleteSession();
    const { ui, controller: c } = pageController();
    selectText(document.getElementById('p')!, 'libër');
    const out = await c.lookup({ trigger: 'command' });
    if (out.status !== 'shown') throw new Error('card');
    await out.settled;
    expect(text(ui)).toContain('libër (NOUN)');
    expect(ui.root()!.querySelector('.encounters')!.textContent).toBe(''); // the 401 on /knowledge: no history, no number, no pretence
    expect(out.recorded).toBe('recorded');
    await rig.fireTimers();
    expect((await rig.page({ type: MSG.status })).needsSignIn).toBe(true);
  });

  it('the metrics row for the lookup is stored by the background, with the three late marks', async () => {
    await rig.signUp();
    await rig.connect();
    const { controller: c } = pageController();
    selectText(document.getElementById('p')!, 'libër');
    const out = await c.lookup({ trigger: 'command' });
    if (out.status !== 'shown') throw new Error('card');
    await out.settled;
    await flush(30);
    const rows = Object.entries(await rig.fake.local.get(null)).filter(([k]) => k.startsWith('golearn:metric:')).map(([, v]) => v as { t: Record<string, number>; coldStart: boolean });
    expect(rows).toHaveLength(1);
    for (const p of ['selectionObtained', 'contextExtracted', 'parsed', 'popupPositioned', 'firstInfoShown', 'eventQueued', 'profileArrived', 'glossArrived']) expect(typeof rows[0].t[p], p).toBe('number');
  });
});
