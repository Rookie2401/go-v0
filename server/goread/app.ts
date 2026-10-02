/**
 * The GoRead team server's request handler (contract: docs/goread/BACKEND.md). Plain `node:http`: it returns a
 * `(req, res) => void`, so a test can mount it on a throw-away server, and `main.ts` mounts it on the real one.
 *
 * Knows the rules, not the storage (store.ts) and not the process (main.ts). It logs nothing.
 */
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AdapterRegistry, LanguageCode } from '../../src/core/index.ts';
import { validateBatch, workIdOf, type CorpusDocument, type ValidationIssue } from '../../src/ingest/format.ts';
import { documentText, fitsTeamLanguage } from '../../src/ingest/language.ts';
import type { GoreadStore, StoredSummary } from './store.ts';

/** The largest request body accepted (bytes). */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
/** After this many bytes of an over-long body the connection is dropped instead of drained. */
const DRAIN_LIMIT_BYTES = 64 * 1024 * 1024;

export interface GoreadCourse { id: string; lang: LanguageCode; country: string }

export interface GoreadHandlerOptions {
  store: GoreadStore;
  registry: AdapterRegistry;
  courses: readonly GoreadCourse[];
  /** The clock (ISO timestamps). Default: the system clock. */
  now?: () => string;
}

export interface TextSummary {
  id: string; title: string; lang: string; addedBy: string; addedAt: string; updatedAt: string; sha256: string; bytes: number;
  workId?: string; chapter?: { index: number; title?: string };
}

/** The sentence a learner sees for a personal copy (contract, "422 errors"). */
export const PERSONAL_COPY_MESSAGE =
  'Your own copy of a published book stays on your device — it is yours to read, not to redistribute. Texts your team wrote can be shared.';

const TEAM_HINT = 'Texts your team wrote can be shared.';

const MESSAGES = {
  noTeam: 'This server has no team with that name.',
  noText: 'The team has no text with that id.',
  alreadyThere: "This text is already on the team's shelf. A text once added stays as it is; add it under another id if it is a new version.",
  tooLarge: 'This text is too large to share (the limit is 2 MB). Share it a chapter at a time.',
  notFound: 'Nothing here.',
  method: 'That method is not allowed here.',
  server: 'The server could not complete the request.',
} as const;

const sha256Hex = (s: string | Buffer): string => createHash('sha256').update(s).digest('hex');

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonBlank = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** True when the document carries a verification record: who checked (`by`) and when (`checkedAt`), at `source.verification` or `scripture.verification`. */
function hasVerification(doc: Record<string, unknown>): boolean {
  const ok = (v: unknown): boolean => isObj(v) && isNonBlank(v.by) && isNonBlank(v.checkedAt);
  const source = isObj(doc.source) ? doc.source : undefined;
  const scripture = isObj(doc.scripture) ? doc.scripture : undefined;
  return ok(source?.verification) || ok(scripture?.verification);
}

/** Why this document may not be shared, by its rights (the contract's table); undefined when it may. */
function notShareableReason(doc: Record<string, unknown>): string | undefined {
  const source = isObj(doc.source) ? doc.source : undefined;
  if (doc.generated === true || source?.authorship === 'generated') return `Machine-generated text is not shared with the team. ${TEAM_HINT}`;
  switch (source?.rights) {
    case 'owner-authored': return undefined;
    case 'public-domain':
    case 'licensed':
      return hasVerification(doc)
        ? undefined
        : 'Before a public-domain or licensed text can be shared, a verification record must say who checked its rights and wording and when. Until then it stays on your device.';
    case 'personal-copy': return PERSONAL_COPY_MESSAGE;
    case 'user-private': return `This text is private to the learner who made it, so it is not shared with the team. ${TEAM_HINT}`;
    case 'generated': return `Machine-generated text is not shared with the team. ${TEAM_HINT}`;
    case 'unverified': return `The rights to this text have not been established, so it is not shared with the team. ${TEAM_HINT}`;
    // anything else is not a rights status at all: the validator says so (invalid-document)
    default: return undefined;
  }
}

function summaryOf(r: StoredSummary): TextSummary {
  const s: TextSummary = { id: r.id, title: r.title, lang: r.lang, addedBy: r.addedBy, addedAt: r.addedAt, updatedAt: r.updatedAt, sha256: r.sha256, bytes: r.bytes };
  if (r.workId !== null) s.workId = r.workId;
  if (r.chapterIndex !== null) s.chapter = { index: r.chapterIndex, ...(r.chapterTitle !== null ? { title: r.chapterTitle } : {}) };
  return s;
}

/** A failure the handler turns into a response. */
class Refusal extends Error {
  constructor(readonly status: number, readonly error: string, readonly extra: Record<string, unknown> = {}, message?: string) {
    super(message ?? error);
  }
}

const issueSummary = (issues: readonly ValidationIssue[]): string => {
  const errors = issues.filter((i) => i.severity === 'error');
  const first = errors[0];
  const more = errors.length > 1 ? ` (and ${errors.length - 1} more)` : '';
  return `This text could not be shared because it is not a valid Go text: ${first ? `${first.path || '(document)'}: ${first.message}` : 'it did not pass the check'}${more}.`;
};

/** Read a request body to a string; over the limit it is drained (not kept) and `too-large` is thrown. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    const chunks: Buffer[] = [];
    let size = 0;
    let over = Number.isFinite(declared) && declared > MAX_BODY_BYTES;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) over = true;
      if (size > DRAIN_LIMIT_BYTES) { req.destroy(); return; }
      if (!over) chunks.push(chunk);
    });
    req.on('end', () => {
      if (over) reject(new Refusal(422, 'too-large', {}, MESSAGES.tooLarge));
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (e) => reject(e));
    req.on('close', () => { if (!req.complete) reject(new Refusal(422, 'too-large', {}, MESSAGES.tooLarge)); });
  });
}

async function readJsonObject(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(req);
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Refusal(422, 'invalid-document', {}, 'The request body is not valid JSON.'); }
  if (!isObj(parsed)) throw new Refusal(422, 'invalid-document', {}, 'The request body must be a JSON object.');
  return parsed;
}

/** `addedBy`: a display name of 1–60 characters once trimmed. */
function addedByOf(body: Record<string, unknown>): string {
  const v = body.addedBy;
  if (typeof v !== 'string') throw new Refusal(422, 'invalid-document', {}, 'addedBy (the name to show next to the text) is required.');
  const name = v.trim();
  const length = Array.from(name).length;
  if (length < 1 || length > 60) throw new Refusal(422, 'invalid-document', {}, 'addedBy must be a name of 1 to 60 characters.');
  return name;
}

export function createGoreadHandler(options: GoreadHandlerOptions): (req: IncomingMessage, res: ServerResponse) => void {
  const { store, registry, courses } = options;
  const now = options.now ?? ((): string => new Date().toISOString());
  const courseById = new Map(courses.map((c) => [c.id, c] as const));

  const cors = (res: ServerResponse): void => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  };

  const send = (req: IncomingMessage, res: ServerResponse, status: number, body?: unknown): void => {
    // a body nobody read must not stall a kept-alive connection
    if (!req.complete) req.resume();
    cors(res);
    res.setHeader('Cache-Control', 'no-store');
    if (body === undefined || status === 204) { res.writeHead(status); res.end(); return; }
    const json = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(json) });
    res.end(json);
  };

  const fail = (req: IncomingMessage, res: ServerResponse, r: Refusal): void =>
    send(req, res, r.status, { error: r.error, message: r.message, ...r.extra });

  async function putText(req: IncomingMessage, res: ServerResponse, course: GoreadCourse, id: string): Promise<void> {
    const body = await readJsonObject(req);
    const addedBy = addedByOf(body);
    const doc = body.document;
    if (!isObj(doc)) throw new Refusal(422, 'invalid-document', {}, 'The request needs a "document": the Go text to share.');

    if (doc.id !== id) {
      throw new Refusal(422, 'id-mismatch', {}, `The document's id (${JSON.stringify(doc.id ?? null)}) is not the id in the address (${JSON.stringify(id)}).`);
    }
    if (doc.lang !== course.lang) {
      const kind = typeof doc.lang === 'string' ? fitsTeamLanguage('', course, doc.lang).message : undefined;
      throw new Refusal(422, 'wrong-language', {}, kind ?? `This text must be written in the team's language (${course.lang}); its language is not ${course.lang}.`);
    }
    const language = fitsTeamLanguage(documentText(doc), course, course.lang);
    if (!language.ok) throw new Refusal(422, 'not-the-team-language', {}, language.message);

    const why = notShareableReason(doc);
    if (why !== undefined) throw new Refusal(422, 'not-shareable', {}, why);

    const verdict = validateBatch([doc], { registry });
    const issues = verdict.documents[0]?.issues ?? [];
    if (!verdict.ok) throw new Refusal(422, 'invalid-document', { issues }, issueSummary(issues));

    const existing = store.get(course.id, id);
    if (existing) throw new Refusal(409, 'already-there', {}, MESSAGES.alreadyThere);

    const canonical = JSON.stringify(doc);
    const typed = doc as unknown as CorpusDocument;
    const stamp = now();
    store.put({
      course: course.id,
      id,
      lang: course.lang,
      title: typed.title,
      workId: workIdOf(typed) ?? null,
      chapterIndex: typed.work?.chapter?.index ?? null,
      chapterTitle: typed.work?.chapter?.title ?? null,
      addedBy,
      addedAt: stamp,
      updatedAt: stamp,
      sha256: sha256Hex(canonical),
      bytes: Buffer.byteLength(canonical),
      document: canonical,
    });
    const stored = store.get(course.id, id);
    if (!stored) throw new Error('the text was not stored');
    send(req, res, 201, { summary: summaryOf(stored) });
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://goread.invalid');
    if (method === 'OPTIONS') { send(req, res, 204); return; }

    let parts: string[];
    try { parts = url.pathname.split('/').filter((p) => p.length > 0).map(decodeURIComponent); } catch { throw new Refusal(404, 'not-found', {}, MESSAGES.notFound); }

    if (parts.length === 1 && parts[0] === 'health') {
      if (method !== 'GET') throw new Refusal(405, 'method-not-allowed', {}, MESSAGES.method);
      send(req, res, 200, { ok: true, service: 'goread', version: 1 });
      return;
    }

    if (parts[0] !== 'teams' || parts.length < 3 || parts[2] !== 'texts' || parts.length > 4) throw new Refusal(404, 'not-found', {}, MESSAGES.notFound);
    const course = courseById.get(parts[1]);
    if (!course) throw new Refusal(404, 'no-such-team', {}, MESSAGES.noTeam);

    if (parts.length === 3) {
      if (method !== 'GET') throw new Refusal(405, 'method-not-allowed', {}, MESSAGES.method);
      const sinceRaw = url.searchParams.get('since');
      let since: string | undefined;
      if (sinceRaw !== null && sinceRaw !== '') {
        const t = Date.parse(sinceRaw);
        if (Number.isNaN(t)) throw new Refusal(422, 'invalid-document', {}, '"since" must be a date and time such as 2026-10-02T09:30:00.000Z.');
        since = new Date(t).toISOString();
      }
      send(req, res, 200, { course: course.id, lang: course.lang, texts: store.list(course.id, since).map(summaryOf) });
      return;
    }

    const id = parts[3];
    if (method === 'GET') {
      const row = store.get(course.id, id);
      if (!row) throw new Refusal(404, 'no-such-text', {}, MESSAGES.noText);
      send(req, res, 200, { document: JSON.parse(row.document) as unknown, addedBy: row.addedBy, addedAt: row.addedAt, updatedAt: row.updatedAt, sha256: row.sha256 });
      return;
    }
    if (method === 'PUT') { await putText(req, res, course, id); return; }
    throw new Refusal(405, 'method-not-allowed', {}, MESSAGES.method);
  }

  return (req, res) => {
    route(req, res).catch((e: unknown) => {
      if (res.headersSent || res.writableEnded) { res.destroy(); return; }
      if (e instanceof Refusal) { fail(req, res, e); return; }
      // never the cause: it could hold a document or a header
      fail(req, res, new Refusal(500, 'server-error', {}, MESSAGES.server));
    });
  };
}
