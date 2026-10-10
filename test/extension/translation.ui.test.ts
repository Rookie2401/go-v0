// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTranslationEngine, type TranslationRequest, type TranslationResult, type TranslationProvider } from '../../packages/golearn-extension/src/translation/provider';
import type { AnySourceReference } from '../../packages/golearn-extension/src/contract/readerAdapter';
import { WebGenericAdapter } from '../../packages/golearn-extension/src/adapters';
import { makeRig, setBody, selectText, stubLayout, flush } from './dom';

const SENTENCE = 'Unë po lexoj një libër të bukur në shtëpinë time.';
let restore: () => void;
let rig: ReturnType<typeof makeRig> | undefined;

beforeEach(() => { restore = stubLayout(); setBody(`<p lang="sq">${SENTENCE}</p>`); });
afterEach(() => { rig?.controller.dispose(); rig = undefined; restore(); });

async function lookup(word = 'lexoj') {
  selectText(document.querySelector('p')!, word);
  rig = makeRig({ analysers: ['sq'] });
  const result = await rig.controller.lookup({ trigger: 'command' });
  if (result.status !== 'shown') throw new Error(`Expected card, got ${result.status}`);
  await result.settled;
  return result;
}

function openSentence(): HTMLButtonElement {
  const root = rig!.ui.root()!;
  (root.querySelector('.sentenceBtn') as HTMLButtonElement).click();
  return root.querySelector('.translateSentence') as HTMLButtonElement;
}

describe('sentence translation card flow', () => {
  it('keeps the word-by-word list and reports a safe unavailable state without a provider', async () => {
    await lookup();
    const button = openSentence();
    expect(button.disabled).toBe(true);
    expect(rig!.ui.root()!.textContent).toContain('The list below is word by word.');
    expect(rig!.ui.root()!.textContent).toContain('No sentence translation provider is available');
    expect(rig!.ui.root()!.textContent).toContain('lexoj');
  });

  it('leaves translation unavailable when the adapter cannot provide sentence context', async () => {
    const never = { translate: async (_request: TranslationRequest): Promise<TranslationResult> => ({ status: 'unavailable', reason: 'no-provider' }) };
    rig = makeRig({ analysers: ['sq'], translationEngine: never });
    const original = rig.adapter.capabilities.bind(rig.adapter);
    rig.adapter.capabilities = () => ({ ...original(), sentenceContext: 'none', contextConfidence: 0, adjacentContext: false });
    selectText(document.querySelector('p')!, 'lexoj');
    const result = await rig.controller.lookup({ trigger: 'command' });
    if (result.status !== 'shown') throw new Error('Expected card');
    const button = openSentence();
    expect(button.disabled).toBe(true);
    expect(rig.ui.root()!.textContent).toContain('Sentence context is not available');
  });

  it('calls the injected engine only on click and ignores a superseded reply', async () => {
    let resolve!: (result: TranslationResult) => void;
    const requests: TranslationRequest[] = [];
    const engine = { processingMode: 'local' as const, translate: (request: TranslationRequest) => {
      requests.push(request);
      return new Promise<TranslationResult>((r) => { resolve = r; });
    } };
    rig = makeRig({ analysers: ['sq'], translationEngine: engine, resolveLanguage: () => ({ languageId: 'sq', confidence: 0.4, basis: 'team-default', reasons: ['team default only'] }) });
    rig.adapter.sourceRef = () => ({ kind: 'web', restrictions: { textRetention: 'allowed', remoteProcessing: 'allowed', audioRetention: 'allowed', export: 'allowed', sharing: 'allowed', reviewExamples: 'allowed' } } as AnySourceReference);
    selectText(document.querySelector('p')!, 'lexoj');
    const first = await rig.controller.lookup({ trigger: 'command' });
    if (first.status !== 'shown') throw new Error('Expected first card');
    await first.settled;
    const button = openSentence();
    expect(requests).toHaveLength(0);
    expect(rig.ui.root()!.textContent).toContain('Translation uses a local model service; model files may download. Sentence text stays on this device.');
    await flush();
    const eventCount = (await rig.store.list()).length;
    const metricCount = (await rig.metrics.list()).length;
    button.click();
    expect(requests).toHaveLength(1);
    expect(requests[0].text).toBe(SENTENCE);
    expect(requests[0].explicitlyRequested).toBe(true);
    expect(requests[0].sourceRestrictions?.remoteProcessing).toBe('unknown');
    expect(requests[0].sourceLanguage.languageId).toBe('sq');
    expect(requests[0].sourceLanguage.source).toBe('unknown');
    expect(requests[0].sourceLanguage.uncertaintyNotes?.[0]).toContain('40%');
    expect(requests[0].targetLanguage.languageId).toBe('en');

    resolve({ status: 'translated', kind: 'natural', text: 'I am reading a beautiful book in my house.', providerId: 'fake', generated: true, reviewed: false,
      sourceLanguage: requests[0].sourceLanguage, targetLanguage: requests[0].targetLanguage });
    await flush();
    expect(rig.ui.root()!.textContent).toContain('I am reading a beautiful book');
    expect(rig.ui.root()!.textContent).toContain('Natural English (machine translation)');
    expect(rig.ui.root()!.textContent).toContain('Machine output may be wrong.');
    expect(rig.ui.root()!.textContent).toContain('40% source-language confidence');
    expect(JSON.stringify(await rig.store.list())).not.toContain(SENTENCE);
    expect(JSON.stringify(await rig.store.list())).not.toContain('I am reading a beautiful book');
    expect((await rig.store.list()).length).toBe(eventCount);
    expect((await rig.metrics.list()).length).toBe(metricCount);

    const nextButton = rig.ui.root()!.querySelector('.translateSentence') as HTMLButtonElement;
    nextButton.click();
    expect(requests).toHaveLength(2);
    selectText(document.querySelector('p')!, 'bukur');
    const second = await rig.controller.lookup({ trigger: 'command' });
    if (second.status !== 'shown') throw new Error('Expected replacement card');
    resolve({ status: 'gloss', kind: 'word-gloss', text: 'I read a book beautiful', label: 'word gloss', providerId: 'fake', generated: true, reviewed: false,
      sourceLanguage: requests[1].sourceLanguage, targetLanguage: requests[1].targetLanguage });
    await flush();
    expect(rig.ui.root()!.textContent).not.toContain('I read a book beautiful');
    expect(rig.ui.root()!.textContent).toContain('The list below is word by word.');
  });

  it('identifies an exact-title reference without claiming machine generation or review', async () => {
    const reference = {
      status: 'translated', kind: 'natural', text: 'Suffering Socrates or the satisfied pig',
      providerId: 'reference:elsie:migjeni-title', generated: false, reviewed: false,
      origin: 'reference', attribution: 'Robert Elsie, Migjeni author profile; exact title reference, not a newly generated translation',
      sourceLanguage: { languageId: 'sq', source: 'selection' }, targetLanguage: { languageId: 'en', source: 'user' },
    } as unknown as TranslationResult;
    rig = makeRig({ analysers: ['sq'], translationEngine: { processingMode: 'local', translate: async () => reference } });
    selectText(document.querySelector('p')!, 'lexoj');
    const result = await rig.controller.lookup({ trigger: 'command' });
    if (result.status !== 'shown') throw new Error('Expected card');
    openSentence().click();
    await flush();
    const text = rig.ui.root()!.querySelector('.sentenceBox')!.textContent ?? '';
    expect(text).toContain('Reference English');
    expect(text).toContain('Suffering Socrates or the satisfied pig');
    expect(text).toContain('Robert Elsie, Migjeni author profile');
    expect(text).toContain('Exact title reference; no general dialect guarantee.');
    expect(text).not.toContain('Generated by');
    expect(text).not.toContain('Not reviewed.');
  });

  it('blocks remote providers using registry restrictions despite permissive source-reference claims', async () => {
    for (const readerId of ['web-generic', 'kobo-web']) {
      rig?.controller.dispose();
      rig = undefined;
      setBody(`<p lang="sq">${SENTENCE}</p>`);
      const adapter = new WebGenericAdapter({ doc: document, readerId });
      adapter.sourceRef = () => ({ kind: 'web', restrictions: { textRetention: 'allowed', remoteProcessing: 'allowed', audioRetention: 'allowed', export: 'allowed', sharing: 'allowed', reviewExamples: 'allowed' } } as AnySourceReference);
      let providerCalls = 0;
      const provider: TranslationProvider = { id: 'remote-test', mode: 'remote', authorized: true, async translate() { providerCalls++; return { kind: 'natural', text: 'remote sentence' }; } };
      const engine = createTranslationEngine({ providers: [provider] });
      rig = makeRig({ adapters: [adapter], analysers: ['sq'], translationEngine: engine });
      selectText(document.querySelector('p')!, 'lexoj');
      const result = await rig.controller.lookup({ trigger: 'command' });
      if (result.status !== 'shown') throw new Error(`Expected card for ${readerId}`);
      openSentence().click();
      await flush();
      expect(providerCalls).toBe(0);
      expect(rig.ui.root()!.textContent).toContain('do not allow sending text to a remote translation service');
      expect(JSON.stringify(await rig.store.list())).not.toContain(SENTENCE);
    }
  });

  it('shows retry after a provider error and discards a reply after dismissal', async () => {
    let calls = 0;
    let resolve!: (result: TranslationResult) => void;
    const engine = { processingMode: 'local' as const, async translate(): Promise<TranslationResult> {
      calls++;
      if (calls === 1) throw new Error('offline');
      return await new Promise<TranslationResult>((r) => { resolve = r; });
    } };
    rig = makeRig({ analysers: ['sq'], translationEngine: engine });
    selectText(document.querySelector('p')!, 'lexoj');
    const result = await rig.controller.lookup({ trigger: 'command' });
    if (result.status !== 'shown') throw new Error('Expected card');
    openSentence().click();
    await flush();
    expect(rig!.ui.root()!.textContent).toContain('Try again');
    (rig!.ui.root()!.querySelector('.translateSentence') as HTMLButtonElement).click();
    expect(calls).toBe(2);
    rig!.ui.dismiss('close');
    resolve({ status: 'translated', kind: 'natural', text: 'late sentence', providerId: 'fake', generated: true, reviewed: false,
      sourceLanguage: { languageId: 'sq', source: 'page' }, targetLanguage: { languageId: 'en', source: 'user' } });
    await flush();
    expect(rig!.ui.isOpen()).toBe(false);
  });
});
