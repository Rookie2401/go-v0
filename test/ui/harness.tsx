/**
 * UI test harness: memory store + real StoreEventBus + minimal fakes of GoLearn / GoListen / GoTell
 * (only the methods the components call), and react-dom/client + act rendering (no @testing-library).
 */
import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { COURSES, StoreEventBus, buildFixtureText, createMemoryStore, ids, seedBasics } from '../../src/core';
import type {
  AppStore, AssistanceLevel, AudioAsset, AudioManifest, AudioSegment, ComfortBand, DomainEvent, GoLearn, GoListen, GoTell,
  GoTellSuggestion, IntentProposal, PersonalizedCoverage, ProductionAnalysis, Recommendation, ScriptureReadiness,
  SentenceSupport, Testimony, TestimonyRevision, TokenSupport, VoiceConfig,
} from '../../src/core';
import { AppProvider } from '../../src/ui/context';
import type { AppServices } from '../../src/ui/context';
import { resetPrefsForTests } from '../../src/ui/prefs';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export const USER = 'u1';
export const SESSION = 'ses-test';

// ───────────────────────── fakes ─────────────────────────

export interface FakeLearnOptions {
  explanations?: Record<string, string>;
  band?: ComfortBand;
  known?: number;
  recommendations?: Recommendation[];
  readiness?: Partial<ScriptureReadiness>;
}

export function makeFakeGoLearn(store: AppStore, opts: FakeLearnOptions = {}) {
  const coverage = vi.fn(async (userId: string, textId: string): Promise<PersonalizedCoverage> => ({
    userId, textId, sentenceIds: [], wordTokens: 10, knownLexicalCoverage: opts.known ?? 0.62, partialCoverage: 0.2, unseenCoverage: 0.18,
    newItems: [], knownPhraseCoverage: 0, unfamiliarPatterns: [], avgSentenceLength: 5, band: opts.band ?? 'productive-challenge', expectedDifficulty: 0.4,
  }));
  const fake = {
    attach: () => () => undefined,
    handle: async () => undefined,
    rebuild: vi.fn(async () => undefined),
    coverage,
    recommend: async () => opts.recommendations ?? [],
    scriptureReadiness: async (userId: string, textId: string): Promise<ScriptureReadiness> => ({
      textId, sentenceIds: [], coverage: await coverage(userId, textId), familiarItems: [], unfamiliarForms: [], knownPhrases: [], difficultPatterns: [],
      prerequisites: [{ itemId: 'form:es:pecado', itemKind: 'form', surface: 'pecado', gain: 0.1 }],
      preparatoryTexts: [{ textId: 'text:es:story-01', covers: ['form:es:pecado'], band: 'comfortable', generated: false }],
      ...opts.readiness,
    }),
    sentenceSupport: async (_userId: string, sentenceId: string, o?: { withRescue?: boolean }): Promise<SentenceSupport> => {
      const sentence = (await store.sentences.get(sentenceId))!;
      const tokens = (await store.tokens.where('sentenceId', sentenceId)).sort((a, b) => a.index - b.index);
      const highlight: SentenceSupport['highlight'] = {};
      tokens.filter((t) => t.isWord).forEach((t, i) => { highlight[t.id] = i % 3 === 0 ? 'unseen' : i % 3 === 1 ? 'partial' : 'known'; });
      return {
        sentence, tokens, highlight, explanation: opts.explanations?.[sentenceId],
        rescue: o?.withRescue ? await store.rescues.get(ids.rescue(sentenceId)) : undefined,
      };
    },
    tokenSupport: vi.fn(async (_userId: string, tokenId: string, level: AssistanceLevel): Promise<TokenSupport> => {
      const token = (await store.tokens.get(tokenId))!;
      const analyses = await store.analyses.where('tokenId', tokenId);
      const lemma = analyses[0]?.lemmaId ? await store.lemmas.get(analyses[0].lemmaId) : undefined;
      const occs = (await store.phraseOccurrences.where('sentenceId', token.sentenceId)).filter((o) => o.tokenIds.includes(tokenId));
      const phrases = await Promise.all(occs.map(async (occurrence) => ({ occurrence, phrase: (await store.phrases.get(occurrence.phraseId))! })));
      const patternOccs = (await store.patternOccurrences.where('sentenceId', token.sentenceId)).filter((o) => o.tokenIds.includes(tokenId));
      const patterns = await Promise.all(patternOccs.map(async (o) => (await store.patterns.get(o.patternId))!));
      return {
        token,
        gloss: lemma?.gloss,
        lemma: level >= 3 ? lemma : undefined,
        analysis: level >= 3 ? analyses[0] : undefined,
        morphologyLine: level >= 3 && analyses[0] ? `${analyses[0].pos?.toLowerCase() ?? 'word'} · ${Object.values(analyses[0].morph).join(' · ')}` : undefined,
        phrases: level >= 2 ? phrases : [],
        patterns: level >= 3 ? patterns : [],
        priorEncounters: [],
        knownExamples: [],
        uncertain: false,
      };
    }),
  };
  return fake as unknown as GoLearn & typeof fake;
}

export interface FakeListenOptions { providerId?: string; actualLocale?: string; requestedLocale?: string; approved?: boolean }

/** Reads manifests/segments/assets/voices straight from the store; generation is scripted. */
export function makeFakeGoListen(store: AppStore, opts: FakeListenOptions = {}) {
  const voice: VoiceConfig = {
    id: 'es-HN:fixture:default', lang: 'es', providerId: opts.providerId ?? 'fixture', voiceId: 'fixture-voice',
    requestedLocale: opts.requestedLocale ?? 'es-HN', actualLocale: opts.actualLocale ?? 'es-419', approved: opts.approved ?? false,
  };
  const fake = {
    registerProvider: () => undefined,
    providers: () => [],
    resolveVoice: async () => voice,
    ensureAudio: vi.fn(async (textId: string) => {
      const manifest = (await store.manifests.where('textId', textId))[0];
      return { manifest: manifest!, created: 0, reused: 0, failed: 0 };
    }),
    runJobs: vi.fn(async () => 2),
    getManifest: async (textId: string) => (await store.manifests.where('textId', textId))[0],
    getSegment: (id: string) => store.audioSegments.get(id),
    getAsset: (id: string) => store.audioAssets.get(id),
    assetUrl: async (id: string) => `blob:test/${id}`,
    alignments: async () => [],
    diagnostics: async () => ({
      segments: (await store.audioSegments.all()).map((s) => ({
        segmentId: s.id, status: s.status, providerId: voice.providerId, voiceId: voice.voiceId, requestedLocale: voice.requestedLocale,
        actualLocale: voice.actualLocale, overridesUsed: [], alignmentMethods: ['by-construction'], minAlignmentConfidence: 1, contentVersion: s.contentVersion,
      })),
      failedJobs: 1, deadJobs: 0,
    }),
    jobs: async () => [],
  };
  void voice;
  return { fake: fake as unknown as GoListen & typeof fake, voice };
}

export interface FakeTellOptions {
  suggestions?: GoTellSuggestion[];
  diff?: Array<{ kind: 'same' | 'added' | 'removed' | 'changed'; a?: string; b?: string }>;
  proposal?: IntentProposal;
}

export function makeFakeGoTell(opts: FakeTellOptions = {}, onRevision?: (rev: TestimonyRevision) => Promise<string | undefined>) {
  const testimony: Testimony = { id: 'tst:u1:es', userId: USER, lang: 'es', title: 'My testimony', createdAt: '2026-01-01T00:00:00.000Z' };
  const revisions: TestimonyRevision[] = [];
  const fake = {
    getOrCreateTestimony: vi.fn(async () => testimony),
    listRevisions: vi.fn(async () => [...revisions]),
    submitDraft: vi.fn(async (_id: string, text: string): Promise<ProductionAnalysis> => ({
      draftHash: 'dh', lang: 'es', sentences: [], suggestions: opts.suggestions ?? [], independentItemIds: [], ...{ text },
    })),
    acceptSuggestion: vi.fn(async () => undefined),
    rejectSuggestion: vi.fn(async () => undefined),
    editSuggestion: vi.fn(async () => undefined),
    acceptRevision: vi.fn(async (testimonyId: string, text: string): Promise<TestimonyRevision> => {
      const number = revisions.length + 1;
      const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean).map((t, index) => ({ index, text: t, textHash: `h${index}` }));
      const rev: TestimonyRevision = {
        id: ids.revision(testimonyId, number), testimonyId, userId: USER, lang: 'es', number, createdAt: `2026-01-0${number}T10:00:00.000Z`,
        fullText: text, sentences, acceptedSuggestionIds: [], parentRevisionId: revisions.at(-1)?.id,
      };
      rev.textId = await onRevision?.(rev); // GoTell ingests each accepted revision as a private Text
      revisions.push(rev);
      return rev;
    }),
    diffRevisions: vi.fn(async () => opts.diff ?? [{ kind: 'same' as const, a: 'Yo creo.', b: 'Yo creo.' }]),
    intent: vi.fn(async (): Promise<IntentProposal> => opts.proposal ?? { proposal: 'Yo creo en Dios.', familiar: [], newItems: [] }),
    assertOwner: async () => undefined,
    analyzeProduction: async () => { throw new Error('not used by the UI'); },
  };
  return fake as unknown as GoTell & typeof fake;
}

export function suggestion(over: Partial<GoTellSuggestion> = {}): GoTellSuggestion {
  return {
    id: 'sug:1', userId: USER, lang: 'es', testimonyId: 'tst:u1:es', draftHash: 'dh', sentenceIndex: 0, kind: 'repair',
    original: 'Yo cree en Dios', suggested: 'Yo creo en Dios', explanation: 'Use creo after yo.', categories: ['conjugation'], priority: 2,
    familiar: [], newItems: [], status: 'shown', createdAt: '2026-01-01T00:00:00.000Z', ...over,
  };
}

// ───────────────────────── harness ─────────────────────────

export interface Harness {
  store: AppStore;
  bus: StoreEventBus;
  services: AppServices;
  learn: ReturnType<typeof makeFakeGoLearn>;
  listen: ReturnType<typeof makeFakeGoListen>['fake'];
  voice: VoiceConfig;
  tell: ReturnType<typeof makeFakeGoTell>;
  events(type?: DomainEvent['type']): Promise<DomainEvent[]>;
  mount(element: ReactElement, opts?: { router?: string }): Promise<Mounted>;
}

export interface Mounted {
  container: HTMLElement;
  root: Root;
  unmount(): Promise<void>;
}

export async function makeHarness(opts: { learn?: FakeLearnOptions; listen?: FakeListenOptions; tell?: FakeTellOptions } = {}): Promise<Harness> {
  resetPrefsForTests();
  const store = createMemoryStore();
  await seedBasics(store, USER, 'honduras-es');
  const bus = new StoreEventBus(store);
  const learn = makeFakeGoLearn(store, opts.learn);
  const { fake: listen, voice } = makeFakeGoListen(store, opts.listen);
  const tell = makeFakeGoTell(opts.tell, (rev) => createTestimonyText(store, voice, rev));
  const services: AppServices = {
    store, bus,
    adapters: { get: () => { throw new Error('adapters are not used by the UI tests'); }, all: () => [] },
    golearn: learn, golisten: listen, gotell: tell,
  };
  const user = (await store.users.get(USER))!;
  const course = COURSES.find((c) => c.id === 'honduras-es')!;

  return {
    store, bus, services, learn, listen, voice, tell,
    async events(type) {
      const all = await bus.history({ userId: USER });
      return type ? all.filter((e) => e.type === type) : all;
    },
    async mount(element, o) {
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      await act(async () => {
        root.render(
          <AppProvider services={services} user={user} course={course} session={SESSION}>
            <MemoryRouter initialEntries={[o?.router ?? '/']}>{element}</MemoryRouter>
          </AppProvider>,
        );
      });
      await flush();
      return {
        container, root,
        async unmount() { await act(async () => root.unmount()); container.remove(); },
      };
    },
  };
}

// ───────────────────────── DOM helpers ─────────────────────────

export async function flush(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }
}

export async function click(el: Element | null): Promise<void> {
  if (!el) throw new Error('click: element not found');
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
  await flush();
}

export async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await flush(2);
}

export async function choose(el: HTMLSelectElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
}

export async function pressKey(key: string, target: EventTarget = window): Promise<void> {
  await act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });
  await flush();
}

export const q = <T extends Element = HTMLElement>(root: ParentNode, selector: string) => root.querySelector<T>(selector);
export const qa = <T extends Element = HTMLElement>(root: ParentNode, selector: string) => [...root.querySelectorAll<T>(selector)];

export function button(root: ParentNode, label: string | RegExp): HTMLButtonElement {
  const match = (text: string) => (typeof label === 'string' ? text === label : label.test(text));
  const found = qa<HTMLButtonElement>(root, 'button').find((b) => match(b.getAttribute('aria-label') ?? b.textContent ?? '') || match((b.textContent ?? '').trim()));
  if (!found) throw new Error(`no button matching ${String(label)}; have: ${qa(root, 'button').map((b) => b.getAttribute('aria-label') ?? b.textContent).join(' | ')}`);
  return found;
}

export function byLabel<T extends HTMLElement = HTMLElement>(root: ParentNode, label: string): T {
  const el = root.querySelector<T>(`[aria-label="${label}"]`);
  if (!el) throw new Error(`no element with aria-label "${label}"`);
  return el;
}

export function installMediaStubs() {
  const play = vi.fn(() => Promise.resolve());
  const pause = vi.fn();
  const load = vi.fn();
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: play });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause });
  Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: load });
  return { play, pause, load };
}

/** Seed a ready, fixture-provider manifest of N sentences for `textId` (two paragraphs are not needed). */
export async function seedAudio(store: AppStore, voice: VoiceConfig, textId: string, sentenceIds: string[], tag = ''): Promise<AudioManifest> {
  await store.voices.put(voice);
  const segmentIds: string[] = [];
  for (let i = 0; i < sentenceIds.length; i++) {
    const sentence = (await store.sentences.get(sentenceIds[i]))!;
    const asset: AudioAsset = {
      id: `asset:${tag}${i}`, sourceType: 'generated-tts', lang: 'es', locale: voice.actualLocale, mime: 'audio/wav', sampleRate: 22050, channels: 1, durationMs: 800, bytes: 10,
      checksum: 'x', createdAt: '2026-01-01T00:00:00.000Z',
    };
    await store.audioAssets.put(asset);
    const seg: AudioSegment = {
      id: `seg:${tag}${i}`, cacheKey: `ck${tag}${i}`, lang: 'es', sentenceIds: [sentenceIds[i]], textId, displayText: sentence.text, speechText: sentence.text, speechNormalization: [],
      pronunciationOverridesUsed: [], voiceConfigId: voice.id, assetId: asset.id, status: 'ready', sequence: i, contentVersion: 1,
    };
    await store.audioSegments.put(seg);
    segmentIds.push(seg.id);
  }
  const manifest: AudioManifest = {
    id: ids.manifest(textId, voice.id, 1), textId, lang: 'es', voiceConfigId: voice.id, contentVersion: 1, segmentIds, complete: true,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
  await store.manifests.put(manifest);
  return manifest;
}

/** What GoTell.acceptRevision now does: ingest the accepted text as a private Text (kind testimony) and prepare its audio. */
export async function createTestimonyText(store: AppStore, voice: VoiceConfig, rev: TestimonyRevision): Promise<string> {
  await store.corpora.put({ id: 'testimony-es', lang: 'es', kind: 'testimony', title: 'Testimonies' });
  const text = await buildFixtureText(store, {
    lang: 'es', slug: `testimony-r${rev.number}`, title: `Testimony v${rev.number}`, kind: 'testimony', corpusId: 'testimony-es',
    sentences: rev.sentences.map((s) => ({
      text: s.text,
      tokens: (s.text.match(/\p{L}+|[^\s\p{L}]/gu) ?? []).map((surface) => ({ surface, isWord: /\p{L}/u.test(surface) })),
    })),
  });
  await seedAudio(store, voice, text.id, rev.sentences.map((s) => ids.sentence(text.id, s.index)), `${rev.number}-`);
  return text.id;
}
