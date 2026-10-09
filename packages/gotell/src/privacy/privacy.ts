/**
 * GoTell privacy: the plain statement of what is kept where, the learner's export of everything they wrote, deletion, the
 * device wipe, and the gate that keeps a remote assistant switched off until the learner has consented.
 * Rules: docs/ecosystem/RIGHTS-AND-PRIVACY-BOUNDARIES.md §3.
 */
import { CONTRACT_VERSION } from '../../../repository-contract/src';
import type { GoEvent } from '../../../repository-contract/src';
import type { RepositoryApi } from '../../../repository-service/src/api';
import { DOC_PREFIX, QUEUE_PREFIX, REJECTED_PREFIX, QUARANTINE_PREFIX, CURSOR_KEY, DOCS_SINCE_KEY, type KeyValueArea } from '../../../repository-sync/src';
import { decodeBody } from '../documents/codec';
import { toIso, type TimeSource } from '../documents/time';
import { exportDraft } from '../documents/versions';
import type { ConsentGate, DraftRecord, DraftStore, Identity, RemoteAssistant } from '../types';

// ───────────────────────────── the statement ─────────────────────────────

export interface PrivacySection { heading: string; points: string[] }
export interface PrivacyStatement {
  title: string;
  sections: PrivacySection[];
  /** The whole statement as plain text. */
  text: string;
  /** One paragraph per line (each section's heading, then its points), for a screen that renders paragraphs. */
  lines: string[];
}

export function privacyStatement(): PrivacyStatement {
  const sections: PrivacySection[] = [
    {
      heading: 'What is stored, and where',
      points: [
        'Your drafts, testimonies and notes are private documents in your own account. Each one holds your text and its version history (every earlier version is kept, so nothing you wrote is overwritten).',
        'While you are offline, the same documents are kept on this device and sent to your account when you are back online.',
        'Your learning record holds counts and hashes only: how many sentences you wrote, which help you asked for, whether a sentence was your own. It never holds your sentences.',
      ],
    },
    {
      heading: 'What is never sent',
      points: [
        'The text of your sentences is never put in a learning event, a log line or a diagnostic. Diagnostics show lengths only.',
        'Nothing you write is sent to an outside service or an AI provider unless you have switched that on, and it is checked again on every use.',
        'Sentences copied from a model, or written by an AI, are recorded as history. They are never counted as something you can produce.',
      ],
    },
    {
      heading: 'Who can see it',
      points: [
        'Only you. Being in a team gives nobody access to your drafts, your testimony, or your learning record; a team is a label, not a permission.',
      ],
    },
    {
      heading: 'Your control',
      points: [
        'Export: you can download every draft, with its full version history, at any time.',
        'Delete: you can delete any draft. The text is removed from your account; a conflict copy made when two devices disagreed is a separate draft and is deleted on its own.',
        'Forget this device: wipes the drafts and the waiting changes stored here. It does not touch your account.',
      ],
    },
  ];
  const text = ['How GoTell treats your writing', '', ...sections.flatMap((s) => [s.heading, ...s.points.map((p) => `- ${p}`), ''])].join('\n').trimEnd();
  return { title: 'How GoTell treats your writing', sections, text, lines: sections.flatMap((x) => [x.heading, ...x.points]) };
}

// ───────────────────────────── export ─────────────────────────────

export interface ExportedDraft {
  docId: string;
  kind: string;
  title?: string;
  languageId: string;
  revision: number;
  updatedAt: string;
  deviceId: string;
  record: DraftRecord;
}

export type WritingExport =
  | { ok: true; count: number; json: string; text: string; failed: Array<{ docId: string; message: string }> }
  | { ok: false; message: string };

export const WRITING_EXPORT_FORMAT = 'gotell-writing-export';

/** Every private document of the learner (drafts, testimonies, notes, conflict copies) as a JSON bundle and a text bundle. */
export async function exportLearnerWriting(api: Pick<RepositoryApi, 'listDocuments' | 'getDocument'>, opts: { now?: TimeSource } = {}): Promise<WritingExport> {
  let list: Awaited<ReturnType<RepositoryApi['listDocuments']>>;
  try { list = await api.listDocuments(); } catch { return { ok: false, message: 'Your documents could not be listed: the service cannot be reached.' }; }
  if (!list.ok) return { ok: false, message: list.message || `Your documents could not be listed (${list.status}).` };
  const drafts: ExportedDraft[] = [];
  const failed: Array<{ docId: string; message: string }> = [];
  for (const meta of list.data.documents.filter((d) => !d.deletedAt)) {
    try {
      const r = await api.getDocument(meta.docId);
      if (!r.ok) { failed.push({ docId: meta.docId, message: r.message || `status ${r.status}` }); continue; }
      const d = r.data.document;
      drafts.push({ docId: d.docId, kind: d.kind, ...(d.title !== undefined ? { title: d.title } : {}), languageId: d.languageId, revision: d.revision, updatedAt: d.updatedAt, deviceId: d.deviceId, record: decodeBody(d) });
    } catch { failed.push({ docId: meta.docId, message: 'the service cannot be reached' }); }
  }
  const exportedAt = toIso(opts.now);
  const json = JSON.stringify({ format: WRITING_EXPORT_FORMAT, version: 1, exportedAt, count: drafts.length, drafts, failed }, null, 2);
  const text = [`GoTell writing export · ${exportedAt.slice(0, 10)} · ${drafts.length} ${drafts.length === 1 ? 'draft' : 'drafts'}`, '', ...drafts.flatMap((d) => ['='.repeat(60), exportDraft(d.record, 'text').trimEnd(), ''])].join('\n');
  return { ok: true, count: drafts.length, json, text, failed };
}

// ───────────────────────────── deletion ─────────────────────────────

export async function deleteDraft(store: DraftStore, draftId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try { await store.remove(draftId); return { ok: true }; } catch (e) { return { ok: false, message: e instanceof Error ? e.message : 'The draft could not be deleted.' }; }
}

const DEVICE_PREFIXES = [DOC_PREFIX, QUEUE_PREFIX, REJECTED_PREFIX, QUARANTINE_PREFIX] as const;

/** Wipes the drafts and the waiting changes stored on this device (and the sync cursors), leaving every other key alone. */
export async function forgetDevice(area: KeyValueArea): Promise<{ drafts: number; queued: number; rejected: number; other: number }> {
  const count = { drafts: 0, queued: 0, rejected: 0, other: 0 };
  for (const prefix of DEVICE_PREFIXES) {
    const keys = await area.list(prefix);
    if (keys.length) await area.remove(keys);
    if (prefix === DOC_PREFIX) count.drafts += keys.length;
    else if (prefix === QUEUE_PREFIX) count.queued += keys.length;
    else if (prefix === REJECTED_PREFIX) count.rejected += keys.length;
    else count.other += keys.length;
  }
  const present = Object.keys(await area.get([CURSOR_KEY, DOCS_SINCE_KEY]));
  if (present.length) { await area.remove(present); count.other += present.length; }
  return count;
}

// ───────────────────────────── remote assistance ─────────────────────────────

export class RemoteAssistanceNotConsented extends Error {
  readonly code = 'remote-assistance-not-consented';
  constructor() {
    super('Remote assistance is off. Nothing was sent. Turn it on in your privacy settings if you want suggestions from an outside service.');
    this.name = 'RemoteAssistanceNotConsented';
  }
}

/** Lengths only: what a diagnostic may say about a piece of the learner's text. */
export function redact(text: string | undefined): string {
  if (text === undefined) return '[no text]';
  const words = (text.match(/[\p{L}\p{M}\p{N}]+/gu) ?? []).length;
  return `[text withheld: ${text.length} characters, ${words} ${words === 1 ? 'word' : 'words'}]`;
}

/**
 * Wraps a RemoteAssistant. Consent is read on EVERY call (never cached); without it the call is refused before anything
 * is passed on. The optional `log` receives lengths and outcomes, never text.
 */
export class RemoteAssistantGate implements RemoteAssistant {
  constructor(private readonly inner: RemoteAssistant, private readonly consent: ConsentGate, private readonly log?: (line: string) => void) {}

  get providerId(): string { return this.inner.providerId; }

  async propose(input: Parameters<RemoteAssistant['propose']>[0]): ReturnType<RemoteAssistant['propose']> {
    // only the boolean true is consent: a truthy string, a number, an object or a Promise from an async store is not
    if (this.consent.remoteAssistance() !== true) {
      this.log?.(`remote-assistant ${this.inner.providerId}: refused (no consent); sent nothing`);
      throw new RemoteAssistanceNotConsented();
    }
    this.log?.(`remote-assistant ${this.inner.providerId}: sending ${redact(input.sentence)}${input.intendedMeaning !== undefined ? ` and intended meaning ${redact(input.intendedMeaning)}` : ''}`);
    try {
      const out = await this.inner.propose(input);
      this.log?.(`remote-assistant ${this.inner.providerId}: ${out.length} ${out.length === 1 ? 'proposal' : 'proposals'} received`);
      return out;
    } catch (e) {
      this.log?.(`remote-assistant ${this.inner.providerId}: failed (${e instanceof Error ? e.name : 'error'})`);
      throw e;
    }
  }
}

export const gateRemoteAssistant = (inner: RemoteAssistant, consent: ConsentGate, log?: (line: string) => void): RemoteAssistant => new RemoteAssistantGate(inner, consent, log);

// ───────────────────────────── the remote-assistance switch ─────────────────────────────

/** The consent key written into ConsentGiven / ConsentWithdrawn payloads (the service reads `consent`, then `scope`, then `key`). */
export const REMOTE_ASSISTANCE_SCOPE = 'gotell:remote-assistance';

export interface RemoteConsentEventInput { identity: Identity; appVersion: string; at: string; eventId: string; on: boolean }

/** A ConsentGiven (on) or ConsentWithdrawn (off) event for remote assistance. It names the scope and nothing else: no text, no provider. */
export function remoteConsentEvent(input: RemoteConsentEventInput): GoEvent {
  const { identity: id } = input;
  return {
    id: input.eventId, v: CONTRACT_VERSION, learnerId: id.learnerId, enrolmentId: id.enrolmentId, languageId: id.languageId,
    ...(id.varietyId ? { varietyId: id.varietyId } : {}),
    at: input.at,
    producer: { app: 'gopractice-tell', version: input.appVersion, deviceId: id.deviceId, surface: 'tell-privacy' },
    kind: input.on ? 'ConsentGiven' : 'ConsentWithdrawn', subject: {},
    payload: { consent: REMOTE_ASSISTANCE_SCOPE, scope: REMOTE_ASSISTANCE_SCOPE },
    dedupeKey: `${REMOTE_ASSISTANCE_SCOPE}:${input.on ? 'given' : 'withdrawn'}:${input.eventId}`,
  };
}

export interface RemoteConsentDeps {
  identity: Identity;
  appVersion: string;
  /** The stored switch; only the boolean true counts as on. */
  initial: unknown;
  /** Keeps the switch on this device. */
  persist(on: boolean): Promise<void>;
  /** The existing event submission path (the shell's queue). */
  record(events: GoEvent[]): Promise<{ refused: Array<{ id: string; issues: string[] }> }>;
  now(): Date | string;
  newId(): string;
}

export interface RemoteConsent {
  /** What the assistance ladder asks, on every call. Always a boolean. */
  readonly gate: ConsentGate;
  value(): boolean;
  /**
   * Turning ON records ConsentGiven first and only then switches on, so consent is never on without its record (if the record is
   * refused this throws and the switch stays off; offline, the shell's queue keeps it and it is sent later). Turning OFF switches
   * off at once, so no further call can be made, and then records ConsentWithdrawn; the switch is authoritative even if that
   * record fails.
   */
  set(on: boolean): Promise<void>;
}

export function createRemoteConsent(deps: RemoteConsentDeps): RemoteConsent {
  let current = deps.initial === true;
  const eventFor = (on: boolean): GoEvent => remoteConsentEvent({ identity: deps.identity, appVersion: deps.appVersion, at: toIso(deps.now()), eventId: `consent-${deps.newId()}`, on });
  return {
    gate: { remoteAssistance: () => current === true },
    value: () => current,
    async set(on) {
      if (on === current) return;
      if (on) {
        const r = await deps.record([eventFor(true)]);
        if (r.refused.length) throw new Error(`consent could not be recorded (${r.refused[0].issues.join('; ') || 'refused'}), so remote help stays off`);
        current = true;
        await deps.persist(true);
        return;
      }
      current = false;
      await deps.persist(false);
      try { await deps.record([eventFor(false)]); } catch { /* the switch is off; the withdrawal event is best effort */ }
    },
  };
}
