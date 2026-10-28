/**
 * The content script's only way out of the page: messages to the background worker. It makes no network call and holds
 * no token, no learner id and no storage; each call has a timeout, and a missing or silent background becomes
 * `undefined`, which the controller turns into an honest partial card.
 */
import type { GoEvent } from '../../../repository-contract/src';
import type { MetricsRow } from '../metrics';
import { MSG, type ContentChromeApi } from '../platform';
import type {
  ActiveReply, ConfirmFormsReply, ConfirmFormsRequest, CorrectReply, CorrectRequest, EntryReply, EntryRequest, ExplainReply, ExplainRequest, GlossReply, GlossRequest, PronounceInfoReply, ProfileReply, ProfileRequest, PublicStatus, RecordReply,
} from '../protocol';
import type { WriteResult } from '../store';
import type { LocalSentenceTranslationReply, LocalSentenceTranslationRequest } from '../translation/localProtocol';
import type { SpeechMessage, SpeechReply } from '../speechProtocol';

/** Where the controller writes events: the background (identity replaced there), or a test store. */
export interface EventSink { append(event: GoEvent): Promise<WriteResult> }
export interface MetricSink { append(row: MetricsRow): Promise<void> }

export interface ContentServices {
  status(): Promise<PublicStatus | undefined>;
  profile(req: ProfileRequest): Promise<ProfileReply | undefined>;
  gloss(req: GlossRequest): Promise<GlossReply | undefined>;
  explain(req: ExplainRequest): Promise<ExplainReply | undefined>;
  correct(req: CorrectRequest): Promise<CorrectReply | undefined>;
  pronounceInfo(languageId: string): Promise<PronounceInfoReply | undefined>;
  speech?(req: SpeechMessage): Promise<SpeechReply | undefined>;
  /** Level 2: the dictionary's full record of a lemma (paradigm table, etymology, IPA, audio, relations). Optional: fakes without it mean "no deeper sections". */
  entry?(req: EntryRequest): Promise<EntryReply | undefined>;
  /** The GoLearn Active switches (read only: a content script cannot set them). Optional: test fakes without it mean "never asked". */
  active?(): Promise<ActiveReply | undefined>;
  /** The scan's learner-model question (the words on screen): the worker answers from the device's own Repository, only while Active is on. */
  activeProfile?(req: ProfileRequest): Promise<ProfileReply | undefined>;
  /** The scan's dictionary question (2026-10-27): which of these normalised forms does the language's forms index have? Public dictionary data only. */
  confirmForms?(req: ConfirmFormsRequest): Promise<ConfirmFormsReply | undefined>;
  /** Calls the background's local model bridge only after an explicit sentence-translation action. */
  translateSentence?(req: LocalSentenceTranslationRequest): Promise<LocalSentenceTranslationReply | undefined>;
}

export interface Bridge extends ContentServices { events: EventSink; metrics: MetricSink }

const isReply = (v: unknown): v is { ok: boolean } => !!v && typeof v === 'object' && typeof (v as { ok?: unknown }).ok === 'boolean';

export function createBridge(api: ContentChromeApi, timeoutMs = 4_000): Bridge {
  async function call<T>(type: string, payload: Record<string, unknown> = {}, timeout = timeoutMs): Promise<T | undefined> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const reply = await Promise.race([
        api.runtime.sendMessage({ type, ...payload }),
        new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), timeout); }),
      ]);
      return isReply(reply) ? (reply as unknown as T) : undefined;
    } catch {
      return undefined; // the background is not there (extension reloaded, worker starting): no reply
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return {
    status: () => call<PublicStatus>(MSG.status),
    profile: (req) => call<ProfileReply>(MSG.profile, { ...req }),
    gloss: (req) => call<GlossReply>(MSG.gloss, { ...req }),
    explain: (req) => call<ExplainReply>(MSG.explain, { ...req }),
    correct: (req) => call<CorrectReply>(MSG.correct, { ...req }),
    pronounceInfo: (languageId) => call<PronounceInfoReply>(MSG.pronounceInfo, { languageId }),
    speech: (req) => call<SpeechReply>(MSG.speech, { ...req }, 30_000),
    active: () => call<ActiveReply>(MSG.active, { op: 'get' }),
    entry: (req) => call<EntryReply>(MSG.entry, { ...req }),
    activeProfile: (req) => call<ProfileReply>(MSG.activeProfile, { ...req }),
    // the first question of a page may make the worker locate the dictionary and fetch several shards: more time than a profile row
    confirmForms: (req) => call<ConfirmFormsReply>(MSG.confirmForms, { ...req }, 20_000),
    // The worker allows a cold local model up to 60 seconds; include time for its private config read and message round-trip.
    translateSentence: (req) => call<LocalSentenceTranslationReply>(MSG.translateSentence, { ...req }, 125_000),
    events: {
      async append(event): Promise<WriteResult> {
        const r = await call<RecordReply>(MSG.record, { event });
        if (!r) return { ok: false, error: 'the background did not answer' };
        return r.ok ? { ok: true, id: event.id, duplicate: r.duplicate === true } : { ok: false, error: r.error ?? 'refused' };
      },
    },
    metrics: { async append(row) { await call(MSG.metrics, { row }); } },
  };
}
