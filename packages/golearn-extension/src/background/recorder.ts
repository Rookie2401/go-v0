/**
 * Event intake. A content script builds a GoEvent with a PLACEHOLDER identity and sends it here; the background REPLACES
 * the identity (learner, enrolment, device) with the session's, validates the result with the contract, writes it to the
 * local log (the learner's own exportable copy) and to the durable sync queue. The content script never knows the learner id.
 *
 * With no session (or no enrolment yet) an event is attributed to a local pseudonymous learner `local:<deviceId>` and
 * stays on this device; `reattributeQueued` rewrites those events when the learner signs in or enrols, so nothing
 * recorded before the account existed is lost, and nothing is sent under a name that is not the learner's.
 *
 * A learner's own mark (ItemMarked) goes to the account under the enrolment of its word's language, whichever language is selected (2026-11-05): it is the
 * learner's explicit word about a word, and held back on the device it left the card and every other app showing the old level. A mark in a language the
 * account has no enrolment in stays on this device, and the rest of a page's events still wait for their language to be selected.
 */
import { MAX_FUTURE_SKEW_MS, validateEvent, type GoEvent, type ValidationIssue } from '../../../repository-contract/src';
import { QUEUE_PREFIX, getByPrefix, readableRow, type LocalQueue, type QueueRow } from '../../../repository-sync/src';
import { EVENT_KEY_PREFIX, createStorageEncounterStore, readPrefix } from '../store';
import type { StorageArea } from '../platform';
import type { RecordReply } from '../protocol';
import { enrolmentIn, type SessionManager, type SessionRecord } from './session';
import { limitEventWords } from './wordids';

/** The only event kinds a content script may ask the background to record. */
export const CONTENT_EVENT_KINDS: readonly string[] = ['SelectionLookedUp', 'EncounterRecorded', 'AnalysisShown', 'AssistanceRequested', 'PronunciationPlayed', 'ItemMarked', 'AnalysisCorrected'];
/** The placeholder a content script writes into the identity fields. */
/** What an extension page (the setup page) may record in addition: its own tutorial lookups and the profile family. */
export const PAGE_EVENT_KINDS: readonly string[] = [...CONTENT_EVENT_KINDS, 'PackInstalled', 'PreferenceChanged', 'ConsentGiven', 'ConsentWithdrawn'];
export const PLACEHOLDER = 'pending';
const MAX_EVENT_JSON = 6_000;
const MARK_KIND = 'ItemMarked';

export const localLearnerId = (deviceId: string): string => `local:${deviceId}`;
/** How long recording waits for the device's Repository copy before it answers (the copy carries on by itself). */
export const LOCAL_COPY_WAIT_MS = 1500;
export const localEnrolmentId = (languageId: string): string => `local-enrolment:${languageId}`;
export const isLocalLearner = (id: string): boolean => id.startsWith('local:');

export interface RecorderOptions {
  area: StorageArea;
  queue: LocalQueue;
  session: SessionManager;
  deviceId: () => Promise<string>;
  version: string;
  /** The device clock (epoch ms); defaults to Date.now. A page cannot place an event further ahead of it than the contract allows. */
  now?: () => number;
  /** Called after an event was queued (the debounced sync). */
  onQueued?: () => void;
  /** Called, and awaited, with every event that was newly written to the local log and queued (the device-local Repository keeps a copy). A failure is ignored. */
  onRecorded?: (event: GoEvent, attributed: 'account' | 'local') => Promise<unknown> | unknown;
}

export function createRecorder(opts: RecorderOptions) {
  const now = opts.now ?? Date.now;
  const log = createStorageEncounterStore(opts.area);

  /** The event with its identity replaced. Never mutates the input. */
  async function attribute(event: GoEvent, app: GoEvent['producer']['app'] = 'golearn-ext'): Promise<{ event: GoEvent; attributed: 'account' | 'local' }> {
    const [s, deviceId] = await Promise.all([opts.session.current(), opts.deviceId()]);
    // An event in a language other than the selected enrolment's is not filed under that enrolment (audit P-07): it stays on this device under the local
    // pseudonym and is re-attributed when the learner selects (or enrols in) its language, exactly like an event recorded before sign-in.
    const selected = !!s?.enrolmentId && (!s.languageId || s.languageId === event.languageId);
    const enrolmentId = selected ? s!.enrolmentId! : s && event.kind === MARK_KIND ? enrolmentIn(s, event.languageId) : undefined;
    const account = !!enrolmentId;
    return {
      attributed: account ? 'account' : 'local',
      event: {
        ...event,
        learnerId: account ? s!.learnerId : localLearnerId(deviceId),
        enrolmentId: enrolmentId ?? localEnrolmentId(event.languageId),
        producer: { ...event.producer, app, version: opts.version, deviceId },
      },
    };
  }

  /** `from`: a content script (tab) may record reader events; an extension page may also record the setup page's own (producer golearn-app) and the profile family. */
  async function record(raw: unknown, from: 'content' | 'page' = 'content'): Promise<RecordReply> {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'not-an-event' };
    const e = raw as GoEvent;
    const kinds = from === 'page' ? PAGE_EVENT_KINDS : CONTENT_EVENT_KINDS;
    if (typeof e.kind !== 'string' || !kinds.includes(e.kind)) return { ok: false, error: 'kind-not-allowed' };
    const app = e.producer?.app;
    if (app !== 'golearn-ext' && !(from === 'page' && app === 'golearn-app')) return { ok: false, error: 'producer-not-allowed' };
    let size = 0;
    try { size = JSON.stringify(e).length; } catch { return { ok: false, error: 'not-an-event' }; }
    if (size > MAX_EVENT_JSON) return { ok: false, error: 'too-large' };
    const attributedTo = await attribute(e, app);
    const attributed = attributedTo.attributed;
    // The page chooses nothing about WHEN beyond its own clock: an `at` further ahead than the contract tolerates is the worker's own time.
    let event = attributedTo.event;
    if (typeof event.at === 'string' && Date.parse(event.at) > now() + MAX_FUTURE_SKEW_MS) event = { ...event, at: new Date(now()).toISOString() };
    // A long selection is page text: its unit ids must not spell it out (see ./wordids).
    event = limitEventWords(event);
    const issues = validateEvent(event);
    if (issues.length) return { ok: false, error: `invalid:${issues[0].path || 'event'} ${issues[0].message}` };
    const written = await log.append(event);
    if (!written.ok) return { ok: false, error: written.error ?? 'not-stored' };
    if (written.duplicate) return { ok: true, duplicate: true, attributed };
    const queued = await opts.queue.enqueue(event);
    if (!queued.ok && queued.reason === 'invalid') return { ok: false, error: 'invalid-for-queue' };
    // The device's Repository copy follows the log and the queue, which already hold the event (durable, synced from there). It is waited for
    // a moment only (2026-11-09: after the worker slept, opening that copy rebuilds every word's knowledge from the whole history, 10 s and more
    // with a large one; the card's request gave up at 4 s and said "Encounter not recorded" for an event that was recorded). It carries on
    // by itself, in order, behind the copy's own lock.
    const copied = Promise.resolve().then(() => opts.onRecorded?.(event, attributed)).catch(() => undefined);
    await Promise.race([copied, new Promise<void>((resolve) => setTimeout(resolve, LOCAL_COPY_WAIT_MS))]);
    if (attributed === 'account') opts.onQueued?.();
    return { ok: true, attributed };
  }

  /** Rewrites local-pseudonym events (queue and local log) to the account's identity. Events of other languages stay local; `onlyKind` narrows it to one kind of event. */
  async function reattributeQueued(learnerId: string, enrolmentId: string, languageId: string, onlyKind?: string): Promise<number> {
    let changed = 0;
    const rows = await getByPrefix<QueueRow>(opts.queue.area, QUEUE_PREFIX);
    for (const [key, row] of rows) {
      if (!readableRow(row)) continue;                       // a damaged row is the queue's to set aside, never this loop's to trip over
      if (!isLocalLearner(row.event.learnerId) || row.event.languageId !== languageId || (onlyKind && row.event.kind !== onlyKind)) continue;
      await opts.queue.area.set({ [key]: { ...row, event: { ...row.event, learnerId, enrolmentId } } satisfies QueueRow });
      changed++;
    }
    for (const [key, v] of await readPrefix(opts.area, EVENT_KEY_PREFIX)) {
      const ev = v as GoEvent;
      if (!isLocalLearner(ev.learnerId) || ev.languageId !== languageId || (onlyKind && ev.kind !== onlyKind)) continue;
      await opts.area.set({ [key]: { ...ev, learnerId, enrolmentId } });
    }
    return changed;
  }

  /** Marks still waiting on this device whose language now has an enrolment on the account go to it; returns how many. Costs one read of the queue when none is waiting. */
  async function fileWaitingMarks(s: Pick<SessionRecord, 'learnerId' | 'enrolmentId' | 'languageId' | 'enrolments'>): Promise<number> {
    const rows = await getByPrefix<QueueRow>(opts.queue.area, QUEUE_PREFIX);
    const languages = new Set<string>();
    for (const [, row] of rows) if (readableRow(row) && row.event.kind === MARK_KIND && isLocalLearner(row.event.learnerId)) languages.add(row.event.languageId);
    let changed = 0;
    for (const languageId of languages) {
      const enrolmentId = enrolmentIn(s, languageId);
      if (enrolmentId) changed += await reattributeQueued(s.learnerId, enrolmentId, languageId, MARK_KIND);
    }
    return changed;
  }

  /** Events queued under a different account than the one now signed in cannot be sent as this learner: they are set aside, not dropped. */
  async function setAsideForeign(learnerId: string): Promise<number> {
    let n = 0;
    for (const row of await opts.queue.pending()) {
      if (isLocalLearner(row.event.learnerId) || row.event.learnerId === learnerId) continue;
      const issues: ValidationIssue[] = [{ path: 'learnerId', message: 'recorded while signed in as a different account; kept on this device, not sent' }];
      await opts.queue.reject(row.event.id, issues);
      n++;
    }
    return n;
  }

  return { record, attribute, reattributeQueued, fileWaitingMarks, setAsideForeign, log };
}

export type Recorder = ReturnType<typeof createRecorder>;
