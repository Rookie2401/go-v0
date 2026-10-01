/**
 * UI test harness (contract v2): memory store + real StoreEventBus + minimal fakes of GoLearn / GoListen / GoTell
 * (only the methods the components call), fakes of the importer / backup / speech-provider controls, and
 * react-dom/client + act rendering (no @testing-library).
 *
 * The fakes follow the contract: drafts live in `store.drafts` with a monotonic `seq` and a `DraftConflict` error;
 * `audioStatus` is derived from what is in the store (manifest + voice review); `readingProgress` is derived from
 * the event log, so a test that clicks "Understood" sees the wording change.
 */
import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { COURSES, REVIEW_OK, StoreEventBus, buildFixtureText, createMemoryStore, ids, seedBasics } from '../../src/core';
import type {
  AppStore, AssistanceLevel, AudioAsset, AudioManifest, AudioSegment, AudioStatus, ComfortBand, ComprehensionReported, DomainEvent,
  EvidenceAudit, GoLearn, GoListen, GoTell, GoTellSuggestion, IntentProposal, PersonalizedCoverage, ProductionAnalysis, ProviderAvailability,
  ReadingProgress, Recommendation, ScriptureReadiness, SentenceSupport, Testimony, TestimonyDraft, TestimonyRevision, TokenSupport, VoiceConfig,
} from '../../src/core';
import { AppProvider } from '../../src/ui/context';
import type { AppServices, BackupApi, BackupCheckView, ImportDocView, IngestApi, SpeechApi } from '../../src/ui/context';
import { resetPrefsForTests } from '../../src/ui/prefs';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export const USER = 'u1';
export const SESSION = 'ses-test';

// ───────────────────────── fakes ─────────────────────────

export interface FakeLearnOptions {
  explanations?: Record<string, string>;
  band?: ComfortBand;
  /** knownLexicalCoverage (demonstrated). */
  known?: number;
  estimated?: number;
  recommendations?: Recommendation[];
  readiness?: Partial<ScriptureReadiness>;
  /** What explainItem says, by item id. */
  explain?: Record<string, string>;
  audit?: Partial<EvidenceAudit>;
}

export function makeFakeGoLearn(store: AppStore, opts: FakeLearnOptions = {}, bus?: StoreEventBus) {
  const coverage = vi.fn(async (userId: string, textId: string): Promise<PersonalizedCoverage> => ({
    userId, textId, sentenceIds: [], wordTokens: 10, knownLexicalCoverage: opts.known ?? 0.62, estimatedFamiliarCoverage: opts.estimated ?? 0.05,
    partialCoverage: 0.15, unseenCoverage: 0.18,
    explanation: 'Shown means you said you understood it without help; likely familiar is an estimate from meeting a word often without help.',
    newItems: [], knownPhraseCoverage: 0, unfamiliarPatterns: [], avgSentenceLength: 5, band: opts.band ?? 'productive-challenge', expectedDifficulty: 0.4,
  }));
  const readingProgress = vi.fn(async (userId: string, textId: string): Promise<ReadingProgress> => {
    const live = (await store.sentences.where('textId', textId)).filter((s) => s.retiredInVersion === undefined);
    const events = bus ? await bus.history({ userId }) : [];
    const viewed = new Set(events.filter((e) => e.type === 'SentenceViewed' && e.textId === textId).map((e) => (e as { sentenceId: string }).sentenceId));
    const completed = events.find((e) => e.type === 'TextCompleted' && e.textId === textId);
    const reports = events.filter((e): e is ComprehensionReported => e.type === 'ComprehensionReported' && e.textId === textId && e.scope === 'text');
    return { textId, sentencesTotal: live.length, sentencesViewed: viewed.size, completedAt: completed?.at, reportedComprehension: reports.at(-1)?.degree, listenedSentences: 0 };
  });
  const fake = {
    attach: () => () => undefined,
    handle: async () => undefined,
    rebuild: vi.fn(async () => undefined),
    policyVersion: 'evidence@2',
    ensureCurrent: vi.fn(async () => false),
    auditEvidence: vi.fn(async (userId: string, o?: { rebuild?: boolean }): Promise<EvidenceAudit> => ({
      userId, policyVersion: 'evidence@2', totalEvents: 12, rebuilt: !!o?.rebuild,
      excluded: [
        { eventId: 'ev:aaaa:1', type: 'AudioSegmentCompleted', reason: 'non-speech-audio' },
        { eventId: 'ev:aaaa:2', type: 'AudioSegmentCompleted', reason: 'non-speech-audio' },
        { eventId: 'ev:aaaa:3', type: 'AudioPlayed', reason: 'unreviewed-voice' },
      ],
      ...opts.audit,
    })),
    explainItem: vi.fn(async (_userId: string, itemId: string) => ({
      itemId, summary: opts.explain?.[itemId] ?? 'Seen 3 times in 1 text; needed help once; not yet shown without help.', exposures: 3, assisted: 1, demonstrated: 0,
      productions: { independent: 0, selfRepaired: 0, assisted: 0, copied: 0 }, excludedEvents: 0, texts: [],
    })),
    readingProgress,
    coverage,
    recommend: vi.fn(async (_userId: string, _o?: { limit?: number; includeUnpublished?: boolean; lang?: string }) => opts.recommendations ?? []),
    scriptureReadiness: vi.fn(async (userId: string, textId: string, _s?: string[], _o?: { includeUnpublished?: boolean }): Promise<ScriptureReadiness> => ({
      textId, sentenceIds: [], coverage: await coverage(userId, textId), familiarItems: [], unfamiliarForms: [], knownPhrases: [], difficultPatterns: [],
      prerequisites: [{ itemId: 'form:es:pecado', itemKind: 'form', surface: 'pecado', gain: 0.1 }],
      preparatoryTexts: [{ textId: 'text:es:story-01', covers: ['form:es:pecado'], band: 'comfortable', generated: false }],
      gaps: [{ itemId: 'form:es:pecado', itemKind: 'form', surface: 'pecado', count: 1, status: 'unseen' }],
      corpusCanPrepare: true,
      ...opts.readiness,
    })),
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

export interface FakeListenOptions {
  providerId?: string;
  actualLocale?: string;
  requestedLocale?: string;
  /** A person has auditioned the voice. */
  approved?: boolean;
  /** Nothing can make speech: audioStatus is 'unavailable' for every text. */
  unavailable?: boolean;
  /** Override (merge into) the derived audio status, per text. */
  status?: (textId: string) => Partial<AudioStatus>;
  availability?: ProviderAvailability;
}

/** Reads manifests/segments/assets/voices straight from the store; generation is scripted. */
export function makeFakeGoListen(store: AppStore, opts: FakeListenOptions = {}) {
  const providerId = opts.providerId ?? 'fixture';
  const voice: VoiceConfig = {
    id: 'es-HN:fixture:default', lang: 'es', providerId, voiceId: 'fixture-voice',
    requestedLocale: opts.requestedLocale ?? 'es-HN', actualLocale: opts.actualLocale ?? 'es-419', approved: opts.approved ?? false,
    reviewStatus: opts.approved ? 'reviewed' : 'unreviewed', isSpeech: providerId !== 'fixture',
  };
  const currentVoice = async (): Promise<VoiceConfig> => (await store.voices.get(voice.id)) ?? voice;
  const audioStatus = vi.fn(async (textId: string, _o?: { preview?: boolean }): Promise<AudioStatus> => {
    const text = await store.texts.get(textId);
    const v = await currentVoice();
    const base: AudioStatus = {
      textId, state: 'not-generated', isSpeech: v.isSpeech, textContentVersion: text?.contentVersion ?? 1,
      readySegments: 0, totalSegments: 0, failedSegments: 0, evidenceEligible: false,
    };
    let derived: AudioStatus;
    if (opts.unavailable) derived = { ...base, state: 'unavailable', reason: 'Audio is not available — no speech provider is configured. You can still read.' };
    else {
      const manifest = (await store.manifests.where('textId', textId))[0];
      if (!manifest) derived = { ...base, reason: 'No audio has been generated for this text yet (voice fixture-voice). Reading works without it.' };
      else {
        const eligible = v.isSpeech && REVIEW_OK.includes(v.reviewStatus);
        derived = {
          ...base, state: eligible ? 'ready' : 'preview-only', providerId: v.providerId, voiceId: v.voiceId, voiceReview: v.reviewStatus,
          readySegments: manifest.segmentIds.length, totalSegments: manifest.segmentIds.length, audioContentVersion: manifest.contentVersion,
          evidenceEligible: eligible,
          reason: eligible ? undefined : v.isSpeech
            ? `Voice ${v.voiceId} has not been auditioned. Preview only: playing it earns no listening evidence until a person auditions it and marks it reviewed.`
            : 'Development fixture audio (sine tones), not speech. Preview only: playing it never counts as listening evidence.',
        };
      }
    }
    return { ...derived, ...(opts.status?.(textId) ?? {}) };
  });
  const fake = {
    registerProvider: () => undefined,
    providers: () => [],
    resolveVoice: vi.fn(async () => currentVoice()),
    availability: vi.fn(async (): Promise<ProviderAvailability> => opts.availability ?? (opts.unavailable ? { available: false, reason: 'no-provider' } : { available: providerId !== 'fixture', ...(providerId === 'fixture' ? { reason: 'development-fixture' as const } : {}) })),
    audioStatus,
    setVoiceReview: vi.fn(async (id: string, status: VoiceConfig['reviewStatus'], note?: string): Promise<VoiceConfig> => {
      const row = (await store.voices.get(id)) ?? voice;
      const next: VoiceConfig = { ...row, reviewStatus: status, approved: REVIEW_OK.includes(status) && row.isSpeech, qaNote: note ?? row.qaNote };
      await store.voices.put(next);
      return next;
    }),
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
  return { fake: fake as unknown as GoListen & typeof fake, voice };
}

export interface FakeTellOptions {
  suggestions?: GoTellSuggestion[];
  diff?: Array<{ kind: 'same' | 'added' | 'removed' | 'changed'; a?: string; b?: string }>;
  proposal?: IntentProposal;
}

const conflict = (current: TestimonyDraft | undefined, expected: number) => {
  const e = new Error(`Draft changed elsewhere (you have version ${expected}, the saved draft is version ${current?.seq ?? 0}).`);
  e.name = 'DraftConflict';
  return e;
};

/** GoTell as the UI uses it. Drafts are real rows in `store.drafts` (monotonic seq, DraftConflict), as GoTell v2 does. */
export function makeFakeGoTell(store: AppStore, opts: FakeTellOptions = {}, onRevision?: (rev: TestimonyRevision) => Promise<string | undefined>) {
  const testimonies = new Map<string, { testimony: Testimony; revisions: TestimonyRevision[] }>();
  const writeDraft = async (userId: string, lang: TestimonyDraft['lang'], text: string, o: { expectedSeq?: number; basedOnRevisionId?: string } = {}): Promise<TestimonyDraft> => {
    const id = ids.draft(userId, lang);
    const existing = await store.drafts.get(id);
    if (o.expectedSeq !== undefined && o.expectedSeq !== (existing?.seq ?? 0)) throw conflict(existing, o.expectedSeq);
    const based = o.basedOnRevisionId ?? existing?.basedOnRevisionId;
    const draft: TestimonyDraft = { id, userId, lang, text, updatedAt: new Date().toISOString(), seq: (existing?.seq ?? 0) + 1, ...(based ? { basedOnRevisionId: based } : {}) };
    await store.drafts.put(draft);
    return draft;
  };
  const fake = {
    getOrCreateTestimony: vi.fn(async (userId: string, lang: TestimonyDraft['lang']) => {
      const id = ids.testimony(userId, lang);
      if (!testimonies.has(id)) testimonies.set(id, { testimony: { id, userId, lang, title: 'My testimony', createdAt: '2026-01-01T00:00:00.000Z' }, revisions: [] });
      return testimonies.get(id)!.testimony;
    }),
    listRevisions: vi.fn(async (testimonyId: string) => [...(testimonies.get(testimonyId)?.revisions ?? [])]),
    submitDraft: vi.fn(async (_id: string, text: string): Promise<ProductionAnalysis> => ({
      draftHash: 'dh', lang: 'es', sentences: [], suggestions: opts.suggestions ?? [], independentItemIds: [], ...{ text },
    })),
    acceptSuggestion: vi.fn(async () => undefined),
    rejectSuggestion: vi.fn(async () => undefined),
    editSuggestion: vi.fn(async () => undefined),
    acceptRevision: vi.fn(async (testimonyId: string, text: string): Promise<TestimonyRevision> => {
      const entry = testimonies.get(testimonyId)!;
      const number = entry.revisions.length + 1;
      const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean).map((t, index) => ({ index, text: t, textHash: `h${index}` }));
      const rev: TestimonyRevision = {
        id: ids.revision(testimonyId, number), testimonyId, userId: entry.testimony.userId, lang: entry.testimony.lang, number, createdAt: `2026-01-0${number}T10:00:00.000Z`,
        fullText: text, sentences, acceptedSuggestionIds: [], parentRevisionId: entry.revisions.at(-1)?.id,
      };
      rev.textId = await onRevision?.(rev); // GoTell ingests each accepted revision as a private Text
      entry.revisions.push(rev);
      await store.revisions.put(rev);
      // the working draft is kept and now descends from this version (no seq bump), as GoTell does
      const draft = await store.drafts.get(ids.draft(entry.testimony.userId, entry.testimony.lang));
      if (draft && draft.text !== '') await store.drafts.put({ ...draft, basedOnRevisionId: rev.id });
      return rev;
    }),
    diffRevisions: vi.fn(async () => opts.diff ?? [{ kind: 'same' as const, a: 'Yo creo.', b: 'Yo creo.' }]),
    intent: vi.fn(async (): Promise<IntentProposal> => opts.proposal ?? { supported: true, insertable: true, proposal: 'Yo creo en Dios.', sources: [], unexpressed: [], familiar: [], newItems: [] }),
    getDraft: vi.fn(async (userId: string, lang: TestimonyDraft['lang']) => {
      const d = await store.drafts.get(ids.draft(userId, lang));
      return d && d.text !== '' ? d : undefined;
    }),
    saveDraft: vi.fn(async (userId: string, lang: TestimonyDraft['lang'], text: string, o?: { expectedSeq?: number; basedOnRevisionId?: string }) => writeDraft(userId, lang, text, o)),
    clearDraft: vi.fn(async (userId: string, lang: TestimonyDraft['lang']) => {
      const existing = await store.drafts.get(ids.draft(userId, lang));
      if (existing) await store.drafts.put({ ...existing, text: '', seq: existing.seq + 1, updatedAt: new Date().toISOString() });
    }),
    restoreRevisionAsDraft: vi.fn(async (revisionId: string) => {
      const rev = (await store.revisions.get(revisionId))!;
      return writeDraft(rev.userId, rev.lang, rev.fullText, { basedOnRevisionId: rev.id });
    }),
    assertOwner: async () => undefined,
    analyzeProduction: async () => { throw new Error('not used by the UI'); },
  };
  return fake as unknown as GoTell & typeof fake;
}

export function suggestion(over: Partial<GoTellSuggestion> = {}): GoTellSuggestion {
  return {
    id: 'sug:1', userId: USER, lang: 'es', testimonyId: 'tst:u1:es', draftHash: 'dh', sentenceIndex: 0, kind: 'repair',
    original: 'Yo cree en Dios', suggested: 'Yo creo en Dios', explanation: 'Use creo after yo.', categories: ['conjugation'], priority: 2,
    familiar: [], newItems: [], scope: 'fixes-all-detected', remainingIssues: [], checkerCoverage: 'The Spanish checker knows a few verb and agreement patterns; it cannot judge meaning or style.',
    sources: [], status: 'shown', createdAt: '2026-01-01T00:00:00.000Z', ...over,
  };
}

/** The importer / backup / speech controls, scripted. The importer really writes a Text row so lists refresh. */
export function makeFakeControls(store: AppStore) {
  const issue = (path: string) => ({ path, code: 'missing-field', message: 'title is required', hint: 'Add a non-empty "title".', severity: 'error' as const });
  const ingest = {
    validate: vi.fn(async (docs: unknown[]): Promise<ImportDocView[]> => docs.map((d) => {
      const doc = d as { id?: string; title?: string; bad?: boolean };
      return { id: doc.id ?? '?', title: doc.title, action: 'valid', issues: doc.bad ? [issue('title')] : [] };
    })),
    import: vi.fn(async (docs: unknown[]): Promise<ImportDocView[]> => {
      const out: ImportDocView[] = [];
      for (const d of docs) {
        const doc = d as { id: string; title: string; lang?: 'es' };
        await store.texts.put({
          id: `text:es:${doc.id}`, corpusId: 'ci-es', lang: 'es', kind: 'story', title: doc.title, sourceId: 'src:import', importedAt: '2026-01-01T00:00:00.000Z',
          tags: [], editorialTags: [], prepTargets: [], reviewStatus: 'unreviewed', published: false, unpublishedReasons: ['Awaiting native-speaker review.'],
          schemaVersion: 2, generated: false, transformations: [], contentVersion: 1,
        });
        out.push({ id: doc.id, title: doc.title, action: 'created', contentVersion: 1, published: false, unpublishedReasons: ['Awaiting native-speaker review.'], issues: [], analysisCoverage: 0.8 });
      }
      return out;
    }),
  } satisfies IngestApi;
  const backup = {
    exportLearner: vi.fn(async (userId: string, o?: { includeRecordings?: boolean }) => ({ format: 'go-backup', version: 1, userId, includesRecordings: !!o?.includeRecordings })),
    check: vi.fn((file: unknown): BackupCheckView => (file && typeof file === 'object' && (file as { format?: string }).format === 'go-backup'
      ? { ok: true, errors: [], warnings: [], summary: '3 history events, 1 saved versions' }
      : { ok: false, errors: ['This is not a Go backup file.'] })),
    restore: vi.fn(async (_file: unknown, _o?: { mode?: 'merge' | 'replace' }) => ({ needsRebuild: true, summary: ['3 history events added'] })),
  } satisfies BackupApi;
  let azure = { configured: false, remembered: false, region: undefined as string | undefined };
  const speech = {
    azure: vi.fn(() => azure),
    configureAzure: vi.fn(async (i: { key: string; region: string; remember: boolean }) => { azure = { configured: true, remembered: i.remember, region: i.region }; }),
    forgetAzure: vi.fn(() => { azure = { configured: false, remembered: false, region: undefined }; }),
  } satisfies SpeechApi;
  return { ingest, backup, speech };
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
  controls: ReturnType<typeof makeFakeControls>;
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
  try { localStorage.clear(); } catch { /* jsdom only */ }
  const store = createMemoryStore();
  await seedBasics(store, USER, 'honduras-es');
  // Seeded audio uses readable asset ids ("asset:0") that are not content hashes: report their bytes as present, as the
  // real store does for real assets (the listening emitter refuses completions for an asset whose bytes are missing).
  const realHas = store.assets.has.bind(store.assets);
  store.assets.has = async (id: string) => id.startsWith('asset:') || realHas(id);
  const bus = new StoreEventBus(store);
  const learn = makeFakeGoLearn(store, opts.learn, bus);
  const { fake: listen, voice } = makeFakeGoListen(store, opts.listen);
  const tell = makeFakeGoTell(store, opts.tell, (rev) => createTestimonyText(store, voice, rev));
  const controls = makeFakeControls(store);
  const services: AppServices = {
    store, bus,
    adapters: { get: () => { throw new Error('adapters are not used by the UI tests'); }, all: () => [] },
    golearn: learn, golisten: listen, gotell: tell,
    ingest: controls.ingest, backup: controls.backup, speech: controls.speech,
  };
  const user = (await store.users.get(USER))!;
  const course = COURSES.find((c) => c.id === 'honduras-es')!;

  return {
    store, bus, services, learn, listen, voice, tell, controls,
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

/** Let real time pass (debounce timers), inside act so React state settles. */
export async function sleep(ms: number): Promise<void> {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
  await flush(3);
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

export async function blur(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('blur'));
  });
  await flush();
}

export async function choose(el: HTMLSelectElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
}

export async function check(el: HTMLInputElement, on = true): Promise<void> {
  if (el.checked !== on) await click(el);
}

/** Give a file input a file (jsdom cannot open a picker). */
export async function pickFiles(input: HTMLInputElement, files: File[]): Promise<void> {
  Object.defineProperty(input, 'files', { configurable: true, value: Object.assign(files.slice(), { item: (i: number) => files[i] ?? null }) });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  await flush(10);
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

/** Seed a ready manifest of N sentences for `textId` with the given voice. */
export async function seedAudio(store: AppStore, voice: VoiceConfig, textId: string, sentenceIds: string[], tag = ''): Promise<AudioManifest> {
  await store.voices.put(voice);
  const segmentIds: string[] = [];
  for (let i = 0; i < sentenceIds.length; i++) {
    const sentence = (await store.sentences.get(sentenceIds[i]))!;
    const asset: AudioAsset = {
      id: `asset:${tag}${i}`, sourceType: 'generated-tts', lang: 'es', locale: voice.actualLocale, mime: 'audio/wav', sampleRate: 22050, channels: 1, durationMs: 800, bytes: 10,
      checksum: 'x', createdAt: '2026-01-01T00:00:00.000Z', isSpeech: voice.isSpeech,
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

/** What GoTell.acceptRevision does: ingest the accepted text as a private Text (kind testimony) and prepare its audio. */
export async function createTestimonyText(store: AppStore, voice: VoiceConfig, rev: TestimonyRevision): Promise<string> {
  await store.corpora.put({ id: `testimony-${rev.lang}`, lang: rev.lang, kind: 'testimony', title: 'Testimonies' });
  const text = await buildFixtureText(store, {
    lang: rev.lang, slug: `testimony-r${rev.number}`, title: `Testimony v${rev.number}`, kind: 'testimony', corpusId: `testimony-${rev.lang}`,
    sentences: rev.sentences.map((s) => ({
      text: s.text,
      tokens: (s.text.match(/\p{L}+|[^\s\p{L}]/gu) ?? []).map((surface) => ({ surface, isWord: /\p{L}/u.test(surface) })),
    })),
  });
  await seedAudio(store, voice, text.id, rev.sentences.map((s) => ids.sentence(text.id, s.index)), `${rev.number}-`);
  return text.id;
}
