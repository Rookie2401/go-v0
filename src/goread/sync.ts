/**
 * Fetching and sharing, one tap at a time (docs/goread/BACKEND.md, "The app side"). Nothing here runs in the background:
 * `fetchTeamTexts` is what "Fetch team texts" does, `shareBook` is what "Share with the team" does.
 */
import type { AppStore, LanguageCode } from '../core';
import { ids } from '../core';
import type { ImportDocView } from '../ui/context';
import { TeamServerError, type TeamClient } from './client';
import type { SharedText, TextSummary } from './client';
import { documentOf, type DocumentOfResult } from './documentOf';
import { shareableText } from './sharing';

/** `recordTeamImport` of `src/ui/goread/TeamTexts.tsx` (passed in, so this module does not depend on the page). */
export type RecordTeamImport = (store: Pick<AppStore, 'meta'>, lang: LanguageCode, views: ImportDocView[], by: string, now?: string) => Promise<void>;

export interface FetchTeamTextsArgs {
  client: Pick<TeamClient, 'list' | 'get'>;
  course: string;
  lang: LanguageCode;
  store: Pick<AppStore, 'texts' | 'meta'>;
  /** The ordinary importer: every check runs again on this device. */
  ingest: { import(docs: unknown[]): Promise<ImportDocView[]> };
  recordTeamImport: RecordTeamImport;
  /** Only texts added or updated after this ISO time (the server's `since`). */
  since?: string;
}

export interface FetchTeamTextsResult {
  /** Documents downloaded from the server. */
  fetched: number;
  /** Documents the importer created or updated. */
  imported: number;
  /** Summaries whose text this device already has. */
  skipped: number;
  failed: Array<{ id: string; message: string }>;
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Why the importer turned a document away, in a sentence. */
function rejection(view: ImportDocView): string {
  const first = view.issues.find((i) => i.severity === 'error');
  if (first) return first.path ? `${first.message} (${first.path})` : first.message;
  return view.note ?? 'The importer did not accept this text.';
}

/**
 * Pull the team's texts: list, skip what this device has (a text id already in the store), fetch the rest, import them in
 * ONE batch through the ordinary importer, then record each in the language's `goread:<lang>` row with the server's own
 * `addedBy` and `addedAt`. A list that cannot be read throws the `TeamServerError`; a single text that fails is reported in
 * `failed` and the others carry on (a failure of the batch as a whole puts every fetched text in `failed`).
 */
export async function fetchTeamTexts(args: FetchTeamTextsArgs): Promise<FetchTeamTextsResult> {
  const { client, course, lang, store, ingest, recordTeamImport } = args;
  const result: FetchTeamTextsResult = { fetched: 0, imported: 0, skipped: 0, failed: [] };

  const summaries = await client.list(course, args.since);
  const wanted: TextSummary[] = [];
  for (const s of summaries) {
    if (s.lang !== lang) { result.failed.push({ id: s.id, message: `This text is in "${s.lang}", not the team's language ("${lang}"); it was not fetched.` }); continue; }
    if (await store.texts.get(ids.text(lang, s.id))) { result.skipped++; continue; }
    wanted.push(s);
  }

  const got: Array<{ summary: TextSummary; shared: SharedText }> = [];
  for (const summary of wanted) {
    try {
      const shared = await client.get(course, summary.id);
      if (shared.document.id !== summary.id || shared.document.lang !== lang) {
        result.failed.push({ id: summary.id, message: 'The server sent a different text than the one asked for; it was not imported.' });
        continue;
      }
      got.push({ summary, shared });
      result.fetched++;
    } catch (e) {
      // the team as a whole is out of reach (no answer, wrong code, no such team): stop, do not repeat the failure per text
      if (e instanceof TeamServerError && (e.status === 0 || e.status === 401 || e.error === 'no-such-team')) throw e;
      result.failed.push({ id: summary.id, message: messageOf(e) });
    }
  }
  if (got.length === 0) return result;

  let views: ImportDocView[];
  try {
    views = await ingest.import(got.map((g) => g.shared.document));
  } catch (e) {
    for (const g of got) result.failed.push({ id: g.summary.id, message: messageOf(e) });
    return result;
  }

  const byId = new Map(views.map((v) => [v.id, v]));
  for (const { summary, shared } of got) {
    const view = byId.get(summary.id);
    if (!view) { result.failed.push({ id: summary.id, message: 'The importer did not report on this text.' }); continue; }
    if (view.action === 'rejected' || view.action === 'valid') { result.failed.push({ id: summary.id, message: rejection(view) }); continue; }
    if (view.action === 'created' || view.action === 'updated') result.imported++;
    // who added it and when is the server's word, per text
    await recordTeamImport(store, lang, [view], shared.addedBy || summary.addedBy, shared.addedAt || summary.addedAt);
  }
  return result;
}

export interface ShareBookArgs {
  client: Pick<TeamClient, 'share'>;
  course: string;
  store: Pick<AppStore, 'texts' | 'sources' | 'corpora' | 'sections' | 'paragraphs' | 'sentences' | 'rescues' | 'notes'>;
  /** Text ids (`text:<lang>:<id>`) of the chapters to share. */
  textIds: readonly string[];
  addedBy: string;
}

export interface ShareBookResult {
  /** Text ids the server accepted. */
  shared: string[];
  /** Text ids not sent, or turned away by the server, with the reason in the learner's words. */
  refused: Array<{ id: string; reason: string }>;
  /** What `documentOf` could not carry into the document, per shared text id (only those with something to say). */
  notes: Record<string, string[]>;
}

/**
 * Send chapters to the team. Each is checked against the rights table BEFORE anything is sent; one that may not be shared
 * is refused with the reason and never reaches the client. The server's own refusals (`not-shareable`, `not-yours`,
 * `invalid-document`, …) are reported in `refused` too; a server that cannot be reached, or a wrong code, stops the whole call.
 */
export async function shareBook(args: ShareBookArgs): Promise<ShareBookResult> {
  const { client, course, store, addedBy } = args;
  const result: ShareBookResult = { shared: [], refused: [], notes: {} };
  for (const id of args.textIds) {
    const text = await store.texts.get(id);
    if (!text) { result.refused.push({ id, reason: 'This text is not on this device.' }); continue; }
    const verdict = await shareableText(store, text);
    if (!verdict.ok) { result.refused.push({ id, reason: verdict.reason }); continue; }
    let built: DocumentOfResult;
    try {
      built = await documentOf(store, id);
    } catch (e) {
      result.refused.push({ id, reason: messageOf(e) });
      continue;
    }
    try {
      await client.share(course, built.document, addedBy);
      result.shared.push(id);
      if (built.notes.length) result.notes[id] = built.notes;
    } catch (e) {
      if (e instanceof TeamServerError && e.status !== 0 && e.status !== 401 && e.error !== 'no-such-team') { result.refused.push({ id, reason: e.message }); continue; }
      throw e;
    }
  }
  return result;
}
