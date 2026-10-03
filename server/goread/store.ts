/**
 * The GoRead store contract: the shelf (`texts`) and the whitelist (`contributors`). Pure data, no HTTP, no rules; every
 * method is async so one handler serves both runtimes (store-sqlite.ts on Node, store-d1.ts on Cloudflare D1).
 * The one schema both use is schema.sql.
 */

/** One stored text: the columns of `texts`, with `document` holding the canonical JSON (`JSON.stringify(document)`). */
export interface StoredText {
  course: string;
  id: string;
  lang: string;
  title: string;
  workId: string | null;
  chapterIndex: number | null;
  chapterTitle: string | null;
  addedBy: string;
  addedAt: string;
  updatedAt: string;
  sha256: string;
  bytes: number;
  document: string;
}

/** A stored text without its document (what a listing returns). */
export type StoredSummary = Omit<StoredText, 'document'>;

/** One person on one team's whitelist. Only the sha256 of the key is kept. */
export interface Contributor {
  team: string;
  name: string;
  keyHash: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface GoreadStore {
  /** Summaries of a course's texts, oldest update first (newest last). `since` (ISO) keeps those updated after it. */
  list(course: string, since?: string): Promise<StoredSummary[]>;
  get(course: string, id: string): Promise<StoredText | undefined>;
  /** Add a text. False (and nothing changes) when the id is already on the shelf: a text once added is never replaced. */
  put(text: StoredText): Promise<boolean>;
  /** The keeper's removal. True when a row was removed. Not reachable through the HTTP handler. */
  remove(course: string, id: string): Promise<boolean>;

  /** Add a person to a team's list. Throws when that name is already on the team's list (revoked or not). */
  addContributor(c: Contributor): Promise<void>;
  /** The row (revoked or not) whose key has this sha256 hex digest on this team; undefined when none. */
  findByKeyHash(team: string, keyHash: string): Promise<Contributor | undefined>;
  listContributors(team: string): Promise<Contributor[]>;
  /** Revoke a person's key. True when an active key was revoked; their texts stay. */
  revoke(team: string, name: string, at?: string): Promise<boolean>;
  close(): void | Promise<void>;
}

type Row = Record<string, unknown>;

/** Row to summary, shared by both stores (column names as in schema.sql). */
export const summaryOfRow = (r: Row): StoredSummary => ({
  course: r.course as string,
  id: r.id as string,
  lang: r.lang as string,
  title: r.title as string,
  workId: (r.work_id as string | null) ?? null,
  chapterIndex: r.chapter_index === null || r.chapter_index === undefined ? null : Number(r.chapter_index),
  chapterTitle: (r.chapter_title as string | null) ?? null,
  addedBy: r.added_by as string,
  addedAt: r.added_at as string,
  updatedAt: r.updated_at as string,
  sha256: r.sha256 as string,
  bytes: Number(r.bytes),
});

export const contributorOfRow = (r: Row): Contributor => ({
  team: r.team as string,
  name: r.name as string,
  keyHash: r.key_hash as string,
  createdAt: r.created_at as string,
  revokedAt: (r.revoked_at as string | null) ?? null,
});

export const SUMMARY_COLUMNS = 'course, id, lang, title, work_id, chapter_index, chapter_title, added_by, added_at, updated_at, sha256, bytes';
export const INSERT_TEXT_SQL = `INSERT INTO texts
  (course, id, lang, title, work_id, chapter_index, chapter_title, added_by, added_at, updated_at, sha256, bytes, document)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (course, id) DO NOTHING`;

export const textParams = (t: StoredText): Array<string | number | null> =>
  [t.course, t.id, t.lang, t.title, t.workId, t.chapterIndex, t.chapterTitle, t.addedBy, t.addedAt, t.updatedAt, t.sha256, t.bytes, t.document];
