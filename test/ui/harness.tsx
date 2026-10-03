/**
 * UI test harness (contract v2): memory store + real StoreEventBus + minimal fakes of GoLearn / GoListen / GoTell
 * (only the methods the components call), fakes of the importer / backup / speech-provider controls, and
 * react-dom/client + act rendering (no @testing-library).
 *
 * The fakes follow the contract: drafts live in `store.drafts` with a monotonic `seq` and a `DraftConflict` error;
 * `audioStatus` is derived from what is in the store (manifest + voice review); `readingProgress` is derived from
 * the event log, so a test that clicks "Understood" sees the wording change.
 *
 * Reading ladder (PLAN5 F1): `services.catalog` is the REAL `createCourseCatalog` on the memory store; while that module is
 * still the coordinator's stub it falls back to `makeFakeCatalog` (same contract, built from THAI_STAGES / THAI_WORKS).
 * `h.catalogIsReal` says which one a test got. `controls.ingest.convertPlainText` is a fake unless USE_REAL_CONVERTER is
 * switched on (one line, below); `services.lexicon` is a memory source with no entries.
 */
import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import type { Mock } from 'vitest';
import { COURSES, REVIEW_OK, StoreEventBus, buildFixtureText, createMemoryStore, ids, seedBasics } from '../../src/core';
import type {
  AppStore, AssistanceLevel, AudioAsset, AudioManifest, AudioSegment, AudioStatus, ComfortBand, ComprehensionReported, DomainEvent,
  AssistanceProfile, CatalogText, CourseCatalog, EvidenceAudit, Features, GoLearn, GoListen, GoTell, GoTellSuggestion, IntentProposal, PersonalizedCoverage, ProductionAnalysis, ProviderAvailability,
  Library, LibraryQuery, RankedText, ReadingPace, ReadingProgress, Recommendation, RescueDependence, ScriptureReadiness, Stage, StageReadiness, SentenceSupport, Testimony, TestimonyDraft, TestimonyRevision, Text, TokenSupport, VoiceConfig,
} from '../../src/core';
import type { Stream, Work } from '../../src/core';
import { THAI_COURSE_ID, THAI_STAGES, THAI_WORKS, createCourseCatalog } from '../../src/course';
import { createMemoryLexiconSource } from '../../src/dict';
import { canonicalTextSha256, editionIdOf, releaseIdOf } from '../../src/golisten/rights';
import { epubToDocuments } from '../../src/ingest';
import { plainTextToDocuments } from '../../src/ingest/plaintext';
import type { PlainTextOptions, PlainTextResult } from '../../src/ingest/plaintext';
import { AppProvider } from '../../src/ui/context';
import type { AppServices, BackupApi, BackupCheckView, ContentHistoryView, ImportDocView, IngestApi, SpeechApi } from '../../src/ui/context';
import { resetPrefsForTests } from '../../src/ui/prefs';
import { resetSittingsForTests } from '../../src/ui/sitting';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** True: the course tests' .txt conversion runs through the real package-D converter. False: the small fake below (same document shape). */
export const USE_REAL_CONVERTER = true;

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
  /** What `stageReadiness` returns (merged over a "not enough reading yet" default). */
  stageReadiness?: Partial<StageReadiness>;
  /** What `readingPace` returns (merged over an empty default). */
  pace?: Partial<ReadingPace>;
}

export function makeFakeGoLearn(store: AppStore, opts: FakeLearnOptions = {}, bus?: StoreEventBus) {
  const coverage = vi.fn(async (userId: string, textId: string): Promise<PersonalizedCoverage> => ({
    userId, textId, sentenceIds: [], wordTokens: 10, knownLexicalCoverage: opts.known ?? 0.62, estimatedFamiliarCoverage: opts.estimated ?? 0.05,
    partialCoverage: 0.15, unseenCoverage: 0.18,
    explanation: 'Shown means you said you understood it without help; likely familiar is an estimate from meeting a word often without help.',
    newItems: [], knownPhraseCoverage: 0, unfamiliarPatterns: [], avgSentenceLength: 5, band: opts.band ?? 'productive-challenge', expectedDifficulty: 0.4,
  }));
  /**
   * The canonical record (contract v4), derived from the event log: Seen = SentenceViewed on LIVE sentences (a report never
   * fabricates one); exposure against retired sentences is reported as `earlierVersions`, never counted; `finishedAt` only for a
   * TextCompleted of THIS content version (an event without a version counts only while the text is at version 1), otherwise
   * `finishedEarlierVersion`.
   */
  const progressOf = async (userId: string, textId: string): Promise<ReadingProgress> => {
    const all = await store.sentences.where('textId', textId);
    const live = all.filter((s) => s.retiredInVersion === undefined);
    const liveIds = new Set(live.map((s) => s.id));
    const retiredIds = new Set(all.filter((s) => s.retiredInVersion !== undefined).map((s) => s.id));
    const events = (bus ? await bus.history({ userId }) : []).filter((e) => (e as { textId?: string }).textId === textId);
    const text = await store.texts.get(textId);
    const version = text?.contentVersion ?? 1;
    const views = events.filter((e) => e.type === 'SentenceViewed') as Array<DomainEvent & { sentenceId: string }>;
    const seen = new Set(views.map((e) => e.sentenceId).filter((id) => liveIds.has(id)));
    const earlierSeen = new Set(views.map((e) => e.sentenceId).filter((id) => retiredIds.has(id)));
    const completed = events.filter((e) => e.type === 'TextCompleted').map((e) => e as DomainEvent & { contentVersion?: number });
    const current = completed.filter((e) => (e.contentVersion === undefined ? version === 1 : e.contentVersion === version)).at(-1);
    const earlier = completed.filter((e) => e !== current && !(e.contentVersion === undefined ? version === 1 : e.contentVersion === version)).at(-1);
    const reports = events.filter((e): e is ComprehensionReported => e.type === 'ComprehensionReported');
    const understood = new Set(reports.filter((r) => r.scope === 'sentence' && r.degree === 'all').flatMap((r) => r.sentenceIds).filter((id) => liveIds.has(id)));
    const earlierUnderstood = new Set(reports.filter((r) => r.scope === 'sentence' && r.degree === 'all').flatMap((r) => r.sentenceIds).filter((id) => retiredIds.has(id)));
    const sittings = new Set(views.map((e) => e.session));
    return {
      userId, lang: text?.lang ?? 'es', textId, contentVersion: version, sentencesTotal: live.length, sentencesSeen: seen.size, sentencesUnderstood: understood.size,
      ...(current ? { finishedAt: current.at } : earlier ? { finishedEarlierVersion: { ...(earlier.contentVersion !== undefined ? { version: earlier.contentVersion } : {}), at: earlier.at } } : {}),
      ...(earlierSeen.size > 0 || earlierUnderstood.size > 0 ? { earlierVersions: { sentencesSeen: earlierSeen.size, sentencesUnderstood: earlierUnderstood.size } } : {}),
      reportedComprehension: reports.filter((r) => r.scope === 'text').at(-1)?.degree, sittings: sittings.size, listenedSentences: 0,
      ...(events.length > 0 ? { asOf: events[events.length - 1].at } : {}),
    };
  };
  const readingProgress = vi.fn(progressOf);
  /** One read for several texts; the Map equals per-text calls (as the contract requires). */
  const readingProgressMany = vi.fn(async (userId: string, textIds: string[]): Promise<Map<string, ReadingProgress>> => {
    const out = new Map<string, ReadingProgress>();
    for (const id of new Set(textIds)) out.set(id, await progressOf(userId, id));
    return out;
  });
  /** Every event emitted so far is already in the store the fake reads; tests that need a slow fold override this. */
  const settled = vi.fn(async (): Promise<void> => undefined);
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
    stageReadiness: vi.fn(async (userId: string, courseId: string, stageId?: string): Promise<StageReadiness> => ({
      userId, courseId, stageId: stageId ?? `stage:${courseId}:0`, verdict: 'insufficient-data',
      explanation: 'Not enough reading here yet to say anything about moving on.',
      signals: [
        { key: 'lexical-coverage', target: 'comfortable coverage of 95 % or more across the texts you added', status: 'insufficient-data', explanation: 'No texts of this stage have been read yet.' },
        { key: 'lookup-rate', target: '4 or fewer lookups per 100 words', status: 'insufficient-data', explanation: 'Fewer than 100 words seen so far.' },
        { key: 'listening', target: 'reviewed real speech', status: 'not-available', explanation: 'There is no reviewed real speech for this course yet.' },
      ],
      ...opts.stageReadiness,
    })),
    readingPace: vi.fn(async (_userId: string, _o?: { textId?: string; stageId?: string; lang?: string }): Promise<ReadingPace> => ({
      basis: 'sentence-dwell', sentences: 0, lookupsPer100Words: 0, rescuesPer100Sentences: 0, rereadSittings: 0, trend: 'insufficient-data', ...opts.pace,
    })),
    rescueDependence: vi.fn(async (_userId: string, _o?: { textId?: string; stageId?: string; lang?: string }): Promise<RescueDependence> => ({
      overall: { sentences: 0, words: 0, per100Words: { decoding: 0, romanization: 0, word: 0, phrase: 0, grammar: 0 }, per100Sentences: { explanation: 0, english: 0 }, unaidedSentenceShare: 0 },
      trend: 'insufficient-data',
    })),
    /** The library ranking: empty unless a test scripts it (`h.learn.rankLibrary.mockImplementation(...)`). */
    rankLibrary: vi.fn(async (_userId: string, _candidates: unknown[], _o?: unknown): Promise<RankedText[]> => []),
    readingProgress,
    readingProgressMany,
    settled,
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
    availability: vi.fn(async (): Promise<ProviderAvailability> => opts.availability ?? (opts.unavailable ? { available: false, reason: 'no-provider' } : { available: providerId !== 'fixture', realSpeech: providerId !== 'fixture', ...(providerId === 'fixture' ? { reason: 'development-fixture' as const } : {}) })),
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
  const speechProxyStatus: { current: ProviderAvailability | undefined } = { current: undefined };
  const issue = (path: string) => ({ path, code: 'missing-field', message: 'title is required', hint: 'Add a non-empty "title".', severity: 'error' as const });
  const ingest = {
    validate: vi.fn(async (docs: unknown[]): Promise<ImportDocView[]> => docs.map((d) => {
      const doc = d as { id?: string; title?: string; bad?: boolean; source?: { rights?: string } };
      const copy = doc.source?.rights === 'personal-copy';
      return { id: doc.id ?? '?', title: doc.title, action: 'valid', issues: doc.bad ? [issue('title')] : [], ...(copy ? { published: true, analysisCoverage: 0.5 } : {}) };
    })),
    import: vi.fn(async (docs: unknown[]): Promise<ImportDocView[]> => {
      const out: ImportDocView[] = [];
      for (const d of docs) {
        const doc = d as FakeDoc;
        if (doc.source?.rights === 'personal-copy') {
          // A personal copy: readable on this device (published), attached to its work, labelled as the learner's own.
          const lang = doc.lang ?? 'th';
          await store.texts.put({
            id: `text:${lang}:${doc.id}`, corpusId: `ci-${lang}`, lang, kind: 'story', title: doc.title, sourceId: 'src:personal-copy', importedAt: '2026-01-01T00:00:00.000Z',
            tags: [], editorialTags: [], prepTargets: [], reviewStatus: 'unreviewed', published: true, unpublishedReasons: [],
            schemaVersion: 2, generated: false, transformations: [], contentVersion: 1, personalCopy: true,
            ...(doc.work ? { workId: `work:${doc.work.courseId}:${doc.work.slug}`, chapter: doc.work.chapter } : {}),
          });
          out.push({ id: doc.id, title: doc.title, action: 'created', contentVersion: 1, published: true, issues: [], analysisCoverage: 0.5 });
          continue;
        }
        await store.texts.put({
          id: `text:es:${doc.id}`, corpusId: 'ci-es', lang: 'es', kind: 'story', title: doc.title, sourceId: 'src:import', importedAt: '2026-01-01T00:00:00.000Z',
          tags: [], editorialTags: [], prepTargets: [], reviewStatus: 'unreviewed', published: false, unpublishedReasons: ['Awaiting native-speaker review.'],
          schemaVersion: 2, generated: false, transformations: [], contentVersion: 1,
        });
        out.push({ id: doc.id, title: doc.title, action: 'created', contentVersion: 1, published: false, unpublishedReasons: ['Awaiting native-speaker review.'], issues: [], analysisCoverage: 0.8 });
      }
      return out;
    }),
    history: vi.fn((_text: Text): ContentHistoryView[] => []),
    /** The real EPUB reader (package S4): a test hands it a tiny real EPUB built by `tinyEpub` in fixtures.ts. */
    convertEpub: vi.fn(async (bytes: Uint8Array, opts: PlainTextOptions): Promise<PlainTextResult> => epubToDocuments(bytes, opts)),
    convertPlainText: vi.fn((text: string, opts: PlainTextOptions): PlainTextResult => (USE_REAL_CONVERTER ? plainTextToDocuments(text, opts) : fakePlainText(text, opts))),
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
    /** The app's own speech service: absent by default (a static deployment). Tests assign `proxyStatus`. */
    proxy: vi.fn(async (): Promise<ProviderAvailability | undefined> => speechProxyStatus.current),
    recheck: vi.fn(async (): Promise<ProviderAvailability | undefined> => speechProxyStatus.current),
  } satisfies SpeechApi;
  return { ingest, backup, speech, speechProxyStatus };
}

// ───────────────────────── ladder fakes ─────────────────────────

/** The part of an import document the fake importer reads (package D's real documents are richer). */
interface FakeDoc { id: string; title: string; lang?: 'th' | 'es'; work?: { slug: string; courseId: string; chapter: { index: number; title?: string } }; source?: { rights?: string; provenance?: string }; bad?: boolean }

const HEADING = /^(บทที่|ตอนที่|Chapter)\s*\S+/;

/**
 * A stand-in for package D's `plainTextToDocuments`: chapters begin at lines like "Chapter 3" / "บทที่ ๓" / "ตอนที่ 3"; no heading ⇒ one
 * document. Documents are personal copies attached to the work (or free-standing with the given title). Never alters the text.
 */
export function fakePlainText(text: string, opts: PlainTextOptions): PlainTextResult {
  const lines = text.split(/\r?\n/);
  const starts = lines.flatMap((l, i) => (HEADING.test(l.trim()) ? [i] : []));
  const base = opts.idPrefix ?? (opts.work ? opts.work.id.split(':').pop()! : (opts.title ?? 'text').toLowerCase().replace(/\W+/g, '-'));
  const source = { rights: 'personal-copy', ...(opts.copyNote ? { provenance: opts.copyNote } : {}) };
  const pieces = starts.length === 0 ? [{ heading: undefined as string | undefined, body: lines.join('\n') }]
    : starts.map((s, k) => ({ heading: lines[s].trim(), body: lines.slice(s, starts[k + 1] ?? lines.length).join('\n') }));
  const documents = pieces.map((piece, k) => ({
    schemaVersion: 2, id: `${base}-ch${k + 1}`, lang: opts.lang, title: piece.heading ?? opts.work?.title ?? opts.title ?? 'Untitled',
    ...(opts.work ? { work: { slug: opts.work.id.slice(`work:${opts.work.courseId}:`.length), courseId: opts.work.courseId, chapter: { index: k + 1, ...(piece.heading ? { title: piece.heading } : {}) } } } : {}),
    source, body: piece.body,
  }));
  return {
    documents: documents as unknown as PlainTextResult['documents'],
    headings: starts.map((i) => ({ line: i + 1, text: lines[i].trim() })),
    quality: { checkedWith: 'fake@1', flags: [], verdict: 'clean' },
    removed: [],
    notes: starts.length === 0 ? ['No chapter headings were found, so the text is one document.'] : [`${starts.length} chapters found by headings like “${lines[starts[0]].trim()}”.`],
  };
}

/** A catalogue with the contract's behaviour on the memory store, built from the Thai manifest (used while createCourseCatalog is a stub). */
export function makeFakeCatalog(store: AppStore, golearn?: Pick<GoLearn, 'stageReadiness'>): CourseCatalog {
  const key = (userId: string, courseId: string) => `stage:${userId}:${courseId}`;
  const stages = async (courseId: string): Promise<Stage[]> => (await store.stages.where('courseId', courseId)).sort((a, b) => a.index - b.index);
  const fallback: AssistanceProfile = { visibility: 'contextual', defaultHighlight: 'subtle', layers: ['gloss', 'phrase', 'grammar', 'sentence', 'english', 'history'], englishRescue: 'secondary', romanization: 'never', decodingFirst: false, targetLanguageDefinitions: false, chrome: 'full' };
  const self: CourseCatalog = {
    async install(courseId) {
      if (courseId !== THAI_COURSE_ID) return;
      await store.stages.bulkPut(THAI_STAGES);
      for (const w of THAI_WORKS) {
        const stored = await store.works.get(w.id);
        await store.works.put(stored && (stored.rights.verified || stored.bibliographyVerified) ? { ...w, rights: stored.rights } : w);
      }
    },
    stages,
    streams: async () => [],
    findWorks: memoryFindWorks(store),
    async works(courseId, stageId) {
      const rows = await store.works.where('courseId', courseId);
      const rank = (r: string) => (r === 'spine' ? 0 : 1);
      return rows.filter((w) => !stageId || w.stageId === stageId).sort((a, b) => rank(a.role) - rank(b.role) || a.order - b.order);
    },
    work: (id) => store.works.get(id),
    async textsOf(workId) {
      return (await store.texts.where('workId', workId)).sort((a, b) => (a.chapter?.index ?? 0) - (b.chapter?.index ?? 0) || a.title.localeCompare(b.title));
    },
    async stageOfText(textId) {
      const t = await store.texts.get(textId);
      const w = t?.workId ? await store.works.get(t.workId) : undefined;
      return w ? store.stages.get(w.stageId) : undefined;
    },
    async assistanceFor({ courseId, textId, currentStageId }) {
      const of = textId ? await self.stageOfText(textId) : undefined;
      const stage = of ?? (currentStageId ? await store.stages.get(currentStageId) : undefined);
      void courseId;
      return stage?.assistance ?? fallback;
    },
    async currentStage(userId, courseId) {
      const all = await stages(courseId);
      const stored = await store.meta.get(key(userId, courseId));
      const chosen = stored ? all.find((s) => s.id === stored.value) : undefined;
      if (chosen) return chosen;
      if (!golearn) return all[0];
      for (const s of all) if ((await golearn.stageReadiness(userId, courseId, s.id)).verdict !== 'ready-to-advance') return s;
      return all.at(-1);
    },
    async setCurrentStage(userId, courseId, stageId) {
      await store.meta.put({ id: key(userId, courseId), value: stageId, updatedAt: new Date().toISOString() });
    },
  };
  return self;
}

const accentless = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The paged work search over the works in the store (what package S6's catalogue does): the fake catalogue's, and the stand-in for the real one. */
export function memoryFindWorks(store: AppStore): CourseCatalog['findWorks'] {
  return async (q) => {
    const rows = (await store.works.where('courseId', q.courseId)).filter((w: Work) =>
      (!q.stream || (w.streams ?? []).includes(q.stream)) && (!q.stageId || w.stageId === q.stageId) && (!q.domain || (w.domains ?? []).includes(q.domain))
      && (!q.variety || w.variety === q.variety) && (!q.rights || w.rights.state === q.rights)
      && (!q.text || accentless(`${w.title} ${w.author ?? ''}`).includes(accentless(q.text))))
      .sort((x, y) => x.order - y.order);
    const offset = q.offset ?? 0;
    return { total: rows.length, items: rows.slice(offset, offset + Math.min(q.limit ?? 30, 200)) };
  };
}

/** The real catalogue when package E has landed (it throws while it is the stub), otherwise the fake above. */
export function makeCatalog(store: AppStore, golearn?: Pick<GoLearn, 'stageReadiness'>, extra: { streams?: Stream[] } = {}): { catalog: CourseCatalog; real: boolean } {
  let base: CourseCatalog;
  let real = true;
  try { base = createCourseCatalog({ store, golearn }); } catch { base = makeFakeCatalog(store, golearn); real = false; }
  // The streams and the paged work search are package S6's; until the real catalogue has them (or when a test scripts the streams) these stand in.
  const catalog: CourseCatalog = {
    ...base,
    streams: extra.streams ? async (courseId) => (courseId === extra.streams![0]?.courseId ? extra.streams! : []) : (base.streams?.bind(base) ?? (async () => [])),
    findWorks: base.findWorks?.bind(base) ?? memoryFindWorks(store),
  };
  return { catalog, real };
}

export interface FakeLibrary extends Library {
  search: Mock<Library['search']>;
  open: Mock<Library['open']>;
  profile: Mock<Library['profile']>;
  items: CatalogText[];
  /** Ids passed to `open`, in order. */
  opened: string[];
}

/** A small in-memory library over catalogue rows (paged, filtered like the real index); `open` makes the text readable by writing a Text row. */
export function makeFakeLibrary(store: AppStore, items: CatalogText[] = []): FakeLibrary {
  const accent = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const lib: FakeLibrary = {
    items, opened: [],
    info: vi.fn(async (lang: string) => (items.length > 0 ? { lang, id: 'library-fake', texts: items.length, works: items.length, words: 0, builtAt: '2026-10-01' } : undefined)) as unknown as Library['info'],
    search: vi.fn(async (q: LibraryQuery) => {
      const rows = lib.items.filter((t) => t.lang === q.lang && (!q.stream || t.stream === q.stream || (t.streams ?? []).includes(q.stream)) && (!q.stageId || t.stageId === q.stageId)
        && (!q.domain || (t.domains ?? []).includes(q.domain)) && (!q.workId || t.workId === q.workId) && (!q.variety || t.variety === q.variety) && (!q.rights || t.rights === q.rights)
        && (!q.location || t.location === q.location) && (!q.publishedOnly || t.published)
        && (!q.text || accent(`${t.title} ${t.author ?? ''}`).includes(accent(q.text))));
      if (q.workId) rows.sort((a, b) => (a.chapter ?? 0) - (b.chapter ?? 0));
      const offset = q.offset ?? 0;
      return { total: rows.length, items: rows.slice(offset, offset + Math.min(q.limit ?? 30, 200)) };
    }),
    entry: vi.fn(async (id: string) => lib.items.find((t) => t.id === id)),
    profile: vi.fn(async (id: string) => {
      const t = lib.items.find((x) => x.id === id);
      return t ? { textId: t.id, lang: t.lang, analyzers: ['fake@1'], words: t.features.words, forms: [], lemmas: [], phrases: [], patterns: [], features: t.features } : undefined;
    }),
    open: vi.fn(async (id: string) => {
      lib.opened.push(id);
      const have = await store.texts.get(id);
      if (have) return have;
      const t = lib.items.find((x) => x.id === id);
      if (!t) throw new Error(`The library has no text ${id}.`);
      const row: Text = {
        id: t.id, corpusId: 'ci-es', lang: t.lang, kind: 'story', title: t.title, sourceId: 'src:fake-library', importedAt: '2026-01-01T00:00:00.000Z', tags: [], editorialTags: [], prepTargets: [],
        reviewStatus: 'approved', published: t.published, unpublishedReasons: [], schemaVersion: 2, generated: false, transformations: [], contentVersion: 1,
      };
      await store.texts.put(row);
      return row;
    }),
    indexStore: vi.fn(async () => 0),
  };
  return lib;
}

/** One catalogue row with sensible defaults. */
export function catalogText(over: Partial<CatalogText> & { id: string; title: string }): CatalogText {
  return {
    lang: 'es', stream: 'library', rights: 'rights-unverified', location: 'library', published: true,
    features: { words: 1200, sentences: 90, uniqueForms: 500, meanSentenceWords: 13 }, ...over,
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
  controls: ReturnType<typeof makeFakeControls>;
  /** The fake library in `services.library`: set `library.items` before mounting. */
  library: FakeLibrary;
  /** True when `services.catalog` is the real package-E catalogue, false when it is the fake in this file. */
  catalogIsReal: boolean;
  events(type?: DomainEvent['type']): Promise<DomainEvent[]>;
  /** `session: null` mounts WITHOUT a fixed session id, so the provider uses the learner's sitting-stable id (sitting.ts). */
  mount(element: ReactElement, opts?: { router?: string; session?: string | null }): Promise<Mounted>;
}

export interface Mounted {
  container: HTMLElement;
  root: Root;
  unmount(): Promise<void>;
}

export async function makeHarness(opts: { learn?: FakeLearnOptions; listen?: FakeListenOptions; tell?: FakeTellOptions; courseId?: string; features?: Partial<Features>;
  /** Streams the catalogue reports for the course (default: whatever the real catalogue says, which is none until package S6). */
  streams?: Stream[]; library?: CatalogText[]; interests?: string[] } = {}): Promise<Harness> {
  resetPrefsForTests();
  resetSittingsForTests();
  try { localStorage.clear(); } catch { /* jsdom only */ }
  const store = createMemoryStore();
  const courseId = opts.courseId ?? 'honduras-es';
  await seedBasics(store, USER, courseId);
  if (opts.interests) await store.users.put({ ...(await store.users.get(USER))!, interests: opts.interests });
  // Seeded audio uses readable asset ids ("asset:0") that are not content hashes: report their bytes as present, as the
  // real store does for real assets (the listening emitter refuses completions for an asset whose bytes are missing).
  const realHas = store.assets.has.bind(store.assets);
  store.assets.has = async (id: string) => id.startsWith('asset:') || realHas(id);
  const bus = new StoreEventBus(store);
  const learn = makeFakeGoLearn(store, opts.learn, bus);
  const { fake: listen, voice } = makeFakeGoListen(store, opts.listen);
  const tell = makeFakeGoTell(store, opts.tell, (rev) => createTestimonyText(store, voice, rev));
  const controls = makeFakeControls(store);
  const { catalog, real: catalogIsReal } = makeCatalog(store, learn, { streams: opts.streams });
  const library = makeFakeLibrary(store, opts.library ?? []);
  await catalog.install(courseId); // what bootstrap does at startup (a no-op for a course without a ladder)
  const services: AppServices = {
    store, bus, catalog, library, lexicon: (lang) => ({ ...createMemoryLexiconSource(lang, []), info: async () => undefined }),
    adapters: { get: () => { throw new Error('adapters are not used by the UI tests'); }, all: () => [] },
    golearn: learn, golisten: listen, gotell: tell,
    ingest: controls.ingest, backup: controls.backup, speech: controls.speech,
    features: { listen: true, ...opts.features }, // the dormant GoListen UI keeps its tests: new tests pass { listen: false }
  };
  const user = (await store.users.get(USER))!;
  const course = COURSES.find((c) => c.id === courseId)!;

  return {
    store, bus, services, learn, listen, voice, tell, controls, library, catalogIsReal,
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
          <AppProvider services={services} user={user} course={course} session={o?.session === null ? undefined : (o?.session ?? SESSION)}>
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
  const text = (await store.texts.get(textId))!;
  const liveSentences = (await store.sentences.where('textId', textId)).filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
  const textSha256 = await canonicalTextSha256(textId, text.contentVersion, liveSentences);
  const segmentIds: string[] = [];
  for (let i = 0; i < sentenceIds.length; i++) {
    const sentence = (await store.sentences.get(sentenceIds[i]))!;
    const asset: AudioAsset = {
      id: `asset:${tag}${i}`, sourceType: 'human-recording', audioKind: 'human', lang: text.lang, locale: voice.actualLocale, mime: 'audio/wav', sampleRate: 22050, channels: 1, durationMs: 800, bytes: 10,
      checksum: 'x', createdAt: '2026-01-01T00:00:00.000Z', isSpeech: true, qualityState: 'machine_checked',
      narratorOrVoiceId: 'Test narrator',
      rights: { id: `rights:${tag}${i}`, status: 'approved', recordingOwner: 'Test recorder', recordingBasis: 'Local UI test recording', performanceOwner: 'Test narrator', performancePermission: 'Permission granted for local UI tests', playInApp: true, stream: true, offline: false, redistribute: false, segment: true, transform: false, reviewedAt: '2026-10-03T00:00:00.000Z' },
      textBinding: { textId, contentVersion: text.contentVersion, textSha256, releaseId: releaseIdOf(text), editionId: editionIdOf(text) },
    };
    await store.audioAssets.put(asset);
    const seg: AudioSegment = {
      id: `seg:${tag}${i}`, cacheKey: `ck${tag}${i}`, lang: text.lang, sentenceIds: [sentenceIds[i]], textId, displayText: sentence.text, speechText: sentence.text, speechNormalization: [],
      pronunciationOverridesUsed: [], voiceConfigId: voice.id, assetId: asset.id, status: 'ready', sequence: i, contentVersion: text.contentVersion,
    };
    await store.audioSegments.put(seg);
    segmentIds.push(seg.id);
  }
  const manifest: AudioManifest = {
    id: ids.manifest(textId, voice.id, text.contentVersion), textId, lang: text.lang, voiceConfigId: voice.id, contentVersion: text.contentVersion, segmentIds, complete: true,
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
