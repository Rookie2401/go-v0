/**
 * GoTell privacy: the plain statement of what is kept where, the learner's export of everything they wrote, deletion, the
 * device wipe, and the gate that keeps a remote assistant switched off until the learner has consented.
 * Rules: docs/ecosystem/RIGHTS-AND-PRIVACY-BOUNDARIES.md §3.
 */
import type { RepositoryApi } from '../../../repository-service/src/api';
import { DOC_PREFIX, QUEUE_PREFIX, REJECTED_PREFIX, QUARANTINE_PREFIX, CURSOR_KEY, DOCS_SINCE_KEY, type KeyValueArea } from '../../../repository-sync/src';
import { decodeBody } from '../documents/codec';
import { toIso, type TimeSource } from '../documents/time';
import { exportDraft } from '../documents/versions';
import type { ConsentGate, DraftRecord, DraftStore, RemoteAssistant } from '../types';

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
    if (!this.consent.remoteAssistance()) {
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
