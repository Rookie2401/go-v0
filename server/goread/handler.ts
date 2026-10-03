/**
 * The GoRead team server's request handler (contract: docs/goread/BACKEND.md, v3): web `Request` in, `Response` out,
 * with the store and the document check passed in, so the same code runs on Node (main.ts) and on a Cloudflare Worker
 * (worker.ts). It uses only web APIs (fetch types, `crypto.subtle`, `TextEncoder`); no `node:` import.
 *
 * Reading is open. Adding (PUT) needs a contributor key on the team's whitelist; the key is hashed (sha256) and the
 * digests are compared in constant time. The name on the whitelist row is the text's `addedBy`.
 * The handler logs nothing and never echoes a key.
 */
import { MAX_DOCUMENT_BYTES, type CheckResult, type DocumentCheck, type GoreadCourse } from './check.ts';
import type { GoreadStore, StoredSummary } from './store.ts';

export type { GoreadCourse } from './check.ts';

/** The largest request body accepted (bytes). */
export const MAX_BODY_BYTES = MAX_DOCUMENT_BYTES;

export interface GoreadDeps {
  store: GoreadStore;
  /** Every course here is a team. */
  courses: readonly GoreadCourse[];
  /** Judges a document for a course (light on Cloudflare, light then full on Node). */
  check: DocumentCheck;
  /** The clock (ISO timestamps). Default: the system clock. */
  now?: () => string;
}

export interface TextSummary {
  id: string; title: string; lang: string; addedBy: string; addedAt: string; updatedAt: string; sha256: string; bytes: number;
  workId?: string; chapter?: { index: number; title?: string };
}

const MESSAGES = {
  noTeam: 'This server has no team with that name.',
  noText: 'The team has no text with that id.',
  alreadyThere: "This text is already on the team's shelf. A text once added stays as it is; add it under another id if it is a new version.",
  tooLarge: 'This text is too large to share (the limit is 2 MB). Share it a chapter at a time.',
  notFound: 'Nothing here.',
  method: 'That method is not allowed here.',
  server: 'The server could not complete the request.',
} as const;

/** The 401 sentence of the contract, with the team's country filled in. */
export const notOnWhitelistMessage = (country: string): string =>
  `Adding texts to the ${country} team's shelf is open to the people on its list. Ask whoever keeps the team's list for a contributor key, and enter it in Settings → Team sharing. You can still read everything here.`;

const encoder = new TextEncoder();

/** sha256 of a string as lower-case hex (Web Crypto: the same call in Node and in Workers). */
export async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(s));
  let out = '';
  for (const b of new Uint8Array(digest)) out += b.toString(16).padStart(2, '0');
  return out;
}

/** Equality of two strings in time that depends only on their length: XOR every code unit, never stop early. */
export function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A failure the handler turns into a response. */
class Refusal extends Error {
  constructor(readonly status: number, readonly error: string, message: string, readonly extra: Record<string, unknown> = {}) {
    super(message);
  }
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '600',
};

function respond(status: number, body?: unknown): Response {
  const headers: Record<string, string> = { ...CORS, 'Cache-Control': 'no-store' };
  if (body === undefined || status === 204) return new Response(null, { status, headers });
  headers['Content-Type'] = 'application/json; charset=utf-8';
  return new Response(JSON.stringify(body), { status, headers });
}

/** Read the request body as text, stopping (and refusing) at the size limit; the limit is on the stream, not on a header. */
async function readText(request: Request): Promise<string> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    await request.body?.cancel().catch(() => undefined);
    throw new Refusal(422, 'too-large', MESSAGES.tooLarge);
  }
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Refusal(422, 'too-large', MESSAGES.tooLarge);
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.length; }
  return new TextDecoder().decode(all);
}

function summaryOf(r: StoredSummary): TextSummary {
  const s: TextSummary = { id: r.id, title: r.title, lang: r.lang, addedBy: r.addedBy, addedAt: r.addedAt, updatedAt: r.updatedAt, sha256: r.sha256, bytes: r.bytes };
  if (r.workId !== null) s.workId = r.workId;
  if (r.chapterIndex !== null) s.chapter = { index: r.chapterIndex, ...(r.chapterTitle !== null ? { title: r.chapterTitle } : {}) };
  return s;
}

/** `Text.workId` of a document, as the importer names it: `work:<course id>:<slug>`. */
function workIdOf(doc: Record<string, unknown>, course: GoreadCourse): string | null {
  const w = doc.work;
  return isObj(w) && typeof w.slug === 'string' ? `work:${typeof w.courseId === 'string' ? w.courseId : course.id}:${w.slug}` : null;
}

/** Handle one request. Never throws: anything unexpected is a 500 without detail. */
export async function handle(request: Request, deps: GoreadDeps): Promise<Response> {
  try {
    return await route(request, deps);
  } catch (e) {
    if (e instanceof Refusal) return respond(e.status, { error: e.error, message: e.message, ...e.extra });
    // never the cause: it could hold a document or a header
    return respond(500, { error: 'server-error', message: MESSAGES.server });
  }
}

async function route(request: Request, deps: GoreadDeps): Promise<Response> {
  const { store, courses } = deps;
  const now = deps.now ?? ((): string => new Date().toISOString());
  const method = request.method;
  const url = new URL(request.url);
  if (method === 'OPTIONS') return respond(204);

  let parts: string[];
  try { parts = url.pathname.split('/').filter((p) => p.length > 0).map(decodeURIComponent); } catch { throw new Refusal(404, 'not-found', MESSAGES.notFound); }

  if (parts.length === 1 && parts[0] === 'health') {
    if (method !== 'GET') throw new Refusal(405, 'method-not-allowed', MESSAGES.method);
    return respond(200, { ok: true, service: 'goread', version: 1 });
  }

  if (parts[0] !== 'teams' || parts.length < 3 || parts.length > 4 || (parts[2] !== 'texts' && !(parts[2] === 'me' && parts.length === 3))) {
    throw new Refusal(404, 'not-found', MESSAGES.notFound);
  }
  const course = courses.find((c) => c.id === parts[1]);
  if (!course) throw new Refusal(404, 'no-such-team', MESSAGES.noTeam);

  /** The whitelist row of the request's key, or a 401. */
  const contributor = async (): Promise<{ name: string }> => {
    const header = request.headers.get('authorization');
    const m = header ? /^Bearer[ \t]+(.+)$/i.exec(header.trim()) : null;
    const key = m ? m[1].trim() : '';
    const hash = await sha256Hex(key);
    const row = key ? await store.findByKeyHash(course.id, hash) : undefined;
    // the lookup is by digest; the digests are then compared in constant time, and a revoked key is no key
    const ok = row !== undefined && constantTimeEqual(row.keyHash, hash) && row.revokedAt === null;
    if (!ok || !row) throw new Refusal(401, 'not-on-whitelist', notOnWhitelistMessage(course.country));
    return { name: row.name };
  };

  if (parts[2] === 'me') {
    if (method !== 'GET') throw new Refusal(405, 'method-not-allowed', MESSAGES.method);
    const who = await contributor();
    return respond(200, { team: course.id, name: who.name });
  }

  if (parts.length === 3) {
    if (method !== 'GET') throw new Refusal(405, 'method-not-allowed', MESSAGES.method);
    const sinceRaw = url.searchParams.get('since');
    let since: string | undefined;
    if (sinceRaw !== null && sinceRaw !== '') {
      const t = Date.parse(sinceRaw);
      if (Number.isNaN(t)) throw new Refusal(422, 'invalid-document', '"since" must be a date and time such as 2026-10-02T09:30:00.000Z.');
      since = new Date(t).toISOString();
    }
    return respond(200, { course: course.id, lang: course.lang, texts: (await store.list(course.id, since)).map(summaryOf) });
  }

  const id = parts[3];
  if (method === 'GET') {
    const row = await store.get(course.id, id);
    if (!row) throw new Refusal(404, 'no-such-text', MESSAGES.noText);
    return respond(200, { document: JSON.parse(row.document) as unknown, addedBy: row.addedBy, addedAt: row.addedAt, updatedAt: row.updatedAt, sha256: row.sha256 });
  }
  if (method !== 'PUT') throw new Refusal(405, 'method-not-allowed', MESSAGES.method);

  // ── PUT: the key first (nothing is read from a stranger), then the body, then the document ──
  const who = await contributor();
  const raw = await readText(request);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { throw new Refusal(422, 'invalid-document', 'The request body is not valid JSON.'); }
  if (!isObj(body)) throw new Refusal(422, 'invalid-document', 'The request body must be a JSON object.');
  const doc = body.document;
  if (!isObj(doc)) throw new Refusal(422, 'invalid-document', 'The request needs a "document": the Go text to share.');
  if (doc.id !== id) {
    throw new Refusal(422, 'id-mismatch', `The document's id (${JSON.stringify(doc.id ?? null)}) is not the id in the address (${JSON.stringify(id)}).`);
  }
  const verdict: CheckResult = await deps.check(doc, course);
  if (!verdict.ok) throw new Refusal(422, verdict.error, verdict.message, verdict.issues ? { issues: verdict.issues } : {});

  const canonical = JSON.stringify(doc);
  const work = isObj(doc.work) ? doc.work : undefined;
  const chapter = work && isObj(work.chapter) ? work.chapter : undefined;
  {
    const stamp = now();
    const stored = {
      course: course.id,
      id,
      lang: course.lang,
      title: String(doc.title),
      workId: workIdOf(doc, course),
      chapterIndex: chapter && typeof chapter.index === 'number' ? chapter.index : null,
      chapterTitle: chapter && typeof chapter.title === 'string' ? chapter.title : null,
      addedBy: who.name,
      addedAt: stamp,
      updatedAt: stamp,
      sha256: await sha256Hex(canonical),
      bytes: encoder.encode(canonical).length,
      document: canonical,
    };
    // the store decides atomically whether the id is free: a text once added is never replaced
    if (!(await store.put(stored))) throw new Refusal(409, 'already-there', MESSAGES.alreadyThere);
    const { document: _document, ...summary } = stored;
    return respond(201, { summary: summaryOf(summary) });
  }
}
