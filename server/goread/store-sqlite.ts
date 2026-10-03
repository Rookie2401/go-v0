/** The GoRead store on Node's built-in `node:sqlite` (one file: `<dir>/goread.sqlite`). */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contributorOfRow, INSERT_TEXT_SQL, SUMMARY_COLUMNS, summaryOfRow, textParams, type GoreadStore, type StoredText } from './store.ts';

/** The file inside the data directory. */
export const STORE_FILE = 'goread.sqlite';

type Row = Record<string, unknown>;

/** Open (creating the directory, the file and the tables when missing) the store in `dir`. */
export function openSqliteStore(dir: string): GoreadStore {
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, STORE_FILE));
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));

  const listAll = db.prepare(`SELECT ${SUMMARY_COLUMNS} FROM texts WHERE course = ? ORDER BY updated_at, id`);
  const listSince = db.prepare(`SELECT ${SUMMARY_COLUMNS} FROM texts WHERE course = ? AND updated_at > ? ORDER BY updated_at, id`);
  const getOne = db.prepare('SELECT * FROM texts WHERE course = ? AND id = ?');
  const insert = db.prepare(INSERT_TEXT_SQL);
  const del = db.prepare('DELETE FROM texts WHERE course = ? AND id = ?');
  const addC = db.prepare('INSERT INTO contributors (team, name, key_hash, created_at, revoked_at) VALUES (?, ?, ?, ?, ?)');
  const byHash = db.prepare('SELECT * FROM contributors WHERE team = ? AND key_hash = ?');
  const listC = db.prepare('SELECT * FROM contributors WHERE team = ? ORDER BY created_at, name');
  const revokeC = db.prepare('UPDATE contributors SET revoked_at = ? WHERE team = ? AND name = ? AND revoked_at IS NULL');
  let closed = false;

  return {
    async list(course, since) {
      const rows = since === undefined ? listAll.all(course) : listSince.all(course, since);
      return (rows as Row[]).map(summaryOfRow);
    },
    async get(course, id) {
      const r = getOne.get(course, id) as Row | undefined;
      return r ? { ...summaryOfRow(r), document: r.document as string } : undefined;
    },
    async put(t: StoredText) {
      return Number(insert.run(...textParams(t)).changes) > 0;
    },
    async remove(course, id) {
      return Number(del.run(course, id).changes) > 0;
    },
    async addContributor(c) {
      try { addC.run(c.team, c.name, c.keyHash, c.createdAt, c.revokedAt); }
      catch (e) { throw new Error(`"${c.name}" is already on the ${c.team} list`, { cause: e }); }
    },
    async findByKeyHash(team, keyHash) {
      const r = byHash.get(team, keyHash) as Row | undefined;
      return r ? contributorOfRow(r) : undefined;
    },
    async listContributors(team) {
      return (listC.all(team) as Row[]).map(contributorOfRow);
    },
    async revoke(team, name, at = new Date().toISOString()) {
      return Number(revokeC.run(at, team, name).changes) > 0;
    },
    close() {
      if (closed) return;
      closed = true;
      db.close();
    },
  };
}
