/**
 * The GoRead store on Cloudflare D1. Takes a D1-like binding (`env.DB`), typed here by the few methods used, so nothing
 * is imported from @cloudflare/workers-types. The tables are created by schema.sql (`wrangler d1 execute ... --file`).
 */
import { contributorOfRow, INSERT_TEXT_SQL, SUMMARY_COLUMNS, summaryOfRow, textParams, type GoreadStore, type StoredText } from './store.ts';

export interface D1LikeStatement {
  bind(...values: unknown[]): D1LikeStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
}
export interface D1Like { prepare(sql: string): D1LikeStatement }

type Row = Record<string, unknown>;

export function createD1Store(db: D1Like): GoreadStore {
  const changed = (r: { meta?: { changes?: number } }): boolean => Number(r.meta?.changes ?? 0) > 0;
  return {
    async list(course, since) {
      const r = since === undefined
        ? await db.prepare(`SELECT ${SUMMARY_COLUMNS} FROM texts WHERE course = ? ORDER BY updated_at, id`).bind(course).all<Row>()
        : await db.prepare(`SELECT ${SUMMARY_COLUMNS} FROM texts WHERE course = ? AND updated_at > ? ORDER BY updated_at, id`).bind(course, since).all<Row>();
      return r.results.map(summaryOfRow);
    },
    async get(course, id) {
      const r = await db.prepare('SELECT * FROM texts WHERE course = ? AND id = ?').bind(course, id).first<Row>();
      return r ? { ...summaryOfRow(r), document: r.document as string } : undefined;
    },
    async put(t: StoredText) {
      return changed(await db.prepare(INSERT_TEXT_SQL).bind(...textParams(t)).run());
    },
    async remove(course, id) {
      return changed(await db.prepare('DELETE FROM texts WHERE course = ? AND id = ?').bind(course, id).run());
    },
    async addContributor(c) {
      try {
        await db.prepare('INSERT INTO contributors (team, name, key_hash, created_at, revoked_at) VALUES (?, ?, ?, ?, ?)').bind(c.team, c.name, c.keyHash, c.createdAt, c.revokedAt).run();
      } catch (e) { throw new Error(`"${c.name}" is already on the ${c.team} list`, { cause: e }); }
    },
    async findByKeyHash(team, keyHash) {
      const r = await db.prepare('SELECT * FROM contributors WHERE team = ? AND key_hash = ?').bind(team, keyHash).first<Row>();
      return r ? contributorOfRow(r) : undefined;
    },
    async listContributors(team) {
      const r = await db.prepare('SELECT * FROM contributors WHERE team = ? ORDER BY created_at, name').bind(team).all<Row>();
      return r.results.map(contributorOfRow);
    },
    async revoke(team, name, at = new Date().toISOString()) {
      return changed(await db.prepare('UPDATE contributors SET revoked_at = ? WHERE team = ? AND name = ? AND revoked_at IS NULL').bind(at, team, name).run());
    },
    close() { /* the binding belongs to the platform */ },
  };
}
