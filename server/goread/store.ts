/**
 * The GoRead team store: shared import documents in one SQLite file (Node's built-in `node:sqlite`).
 * Pure data — no HTTP, no rules. The handler (app.ts) decides what may be stored; this only keeps it.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** The file inside the data directory. */
export const STORE_FILE = 'goread.sqlite';

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

export interface GoreadStore {
  /** Summaries of a course's texts, oldest update first (newest last). `since` (ISO) keeps those updated after it. */
  list(course: string, since?: string): StoredSummary[];
  get(course: string, id: string): StoredText | undefined;
  /** Insert, or replace the row with the same (course, id). The caller decides whether replacing is allowed. */
  put(text: StoredText): void;
  /** True when a row was removed. */
  remove(course: string, id: string): boolean;
  close(): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS texts (
  course TEXT NOT NULL,
  id TEXT NOT NULL,
  lang TEXT NOT NULL,
  title TEXT NOT NULL,
  work_id TEXT NULL,
  chapter_index INTEGER NULL,
  chapter_title TEXT NULL,
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  document TEXT NOT NULL,
  PRIMARY KEY (course, id)
);
CREATE INDEX IF NOT EXISTS texts_updated ON texts (course, updated_at);
`;

type Row = Record<string, unknown>;

const summaryOf = (r: Row): StoredSummary => ({
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

const SUMMARY_COLUMNS = 'course, id, lang, title, work_id, chapter_index, chapter_title, added_by, added_at, updated_at, sha256, bytes';

/** Open (creating the directory and the file when missing) the store in `dir`. */
export function openStore(dir: string): GoreadStore {
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, STORE_FILE));
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);

  const listAll = db.prepare(`SELECT ${SUMMARY_COLUMNS} FROM texts WHERE course = ? ORDER BY updated_at, id`);
  const listSince = db.prepare(`SELECT ${SUMMARY_COLUMNS} FROM texts WHERE course = ? AND updated_at > ? ORDER BY updated_at, id`);
  const getOne = db.prepare('SELECT * FROM texts WHERE course = ? AND id = ?');
  const upsert = db.prepare(`INSERT OR REPLACE INTO texts
    (course, id, lang, title, work_id, chapter_index, chapter_title, added_by, added_at, updated_at, sha256, bytes, document)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const del = db.prepare('DELETE FROM texts WHERE course = ? AND id = ?');
  let closed = false;

  return {
    list(course, since) {
      const rows = since === undefined ? listAll.all(course) : listSince.all(course, since);
      return (rows as Row[]).map(summaryOf);
    },
    get(course, id) {
      const r = getOne.get(course, id) as Row | undefined;
      return r ? { ...summaryOf(r), document: r.document as string } : undefined;
    },
    put(t) {
      upsert.run(t.course, t.id, t.lang, t.title, t.workId, t.chapterIndex, t.chapterTitle, t.addedBy, t.addedAt, t.updatedAt, t.sha256, t.bytes, t.document);
    },
    remove(course, id) {
      return Number(del.run(course, id).changes) > 0;
    },
    close() {
      if (closed) return;
      closed = true;
      db.close();
    },
  };
}
