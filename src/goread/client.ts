/**
 * The GoRead team-server client (contract: docs/goread/BACKEND.md). A thin, dependency-free wrapper over `fetch`.
 *
 *  - Contract v3: reading is open and carries no credential. Adding needs a personal contributor key on the team's list;
 *    the key (when there is one) goes in `Authorization: Bearer` on `share` and `me` only, never on list / get / health.
 *    A text once added is never replaced or removed.
 *  - Every failure is a `TeamServerError` that carries the server's own learner-facing `message`; a server that does not
 *    answer at all is `status: 0, error: 'unreachable'` with a sentence that tells the learner where to look.
 *  - Nothing is retried and nothing is cached: one call, one request.
 */
import type { CorpusDocument } from '../ingest/format';

/** What the server lists for a shared text (no document body). */
export interface TextSummary {
  id: string;
  title: string;
  lang: string;
  addedBy: string;
  addedAt: string;
  updatedAt: string;
  sha256: string;
  bytes: number;
  workId?: string;
  chapter?: { index: number; title?: string };
}

/** A shared text in full: the import document exactly as a learner imported it, plus who added it and when. */
export interface SharedText {
  document: CorpusDocument;
  addedBy: string;
  addedAt: string;
  updatedAt: string;
  sha256: string;
}

/** One validator issue as the server echoes it in a `422 invalid-document` (the shape of `ValidationIssue`). */
export interface TeamServerIssue {
  path?: string;
  code?: string;
  message?: string;
  hint?: string;
  severity?: string;
}

/** The sentence a learner sees when the server does not answer. */
export const UNREACHABLE_MESSAGE = 'The team server did not answer. Check the address in Settings → Team sharing.';

export class TeamServerError extends Error {
  readonly status: number;
  /** The server's machine-readable code (`not-on-whitelist`, `not-shareable`, `already-there`, …), or `unreachable` / `bad-response`. */
  readonly error: string;
  readonly issues?: TeamServerIssue[];
  constructor(init: { status: number; error: string; message: string; issues?: TeamServerIssue[] }) {
    super(init.message);
    this.name = 'TeamServerError';
    this.status = init.status;
    this.error = init.error;
    if (init.issues) this.issues = init.issues;
  }
}

export interface TeamClientOptions {
  /** The server's address, e.g. `https://goread.example.org` (a trailing slash is ignored). */
  baseUrl: string;
  /** The learner's contributor key, if they have one. Sent only to `share` and `me`, as a Bearer token. */
  key?: string;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

export interface TeamClient {
  /** Does the server answer? Never throws: an unreachable server is `{ ok: false, message }`. */
  health(): Promise<{ ok: boolean; message?: string }>;
  list(course: string, since?: string): Promise<TextSummary[]>;
  get(course: string, id: string): Promise<SharedText>;
  /**
   * Add a text to the team; the server takes the name from the key's row on the team's list. A key that is missing, unknown
   * or revoked is a `401 not-on-whitelist` TeamServerError. A text once added is never replaced: an id that exists is a
   * `409 already-there` TeamServerError.
   */
  share(course: string, document: CorpusDocument): Promise<{ status: 201; summary: TextSummary }>;
  /** Who the key is on this team's list: `{ team, name }`, or a `401 not-on-whitelist` TeamServerError. */
  me(course: string): Promise<{ team: string; name: string }>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function createTeamClient(opts: TeamClientOptions): TeamClient {
  const baseUrl = opts.baseUrl.trim().replace(/\/+$/, '');
  // `fetch` must be called as a plain function (a browser throws "Illegal invocation" when it is called as a method).
  const doFetch: typeof fetch = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));

  /** One request. Resolves with the response, or throws the `unreachable` error when nothing answered. */
  async function send(path: string, init: RequestInit): Promise<Response> {
    try {
      return await doFetch(`${baseUrl}${path}`, init);
    } catch {
      throw new TeamServerError({ status: 0, error: 'unreachable', message: UNREACHABLE_MESSAGE });
    }
  }

  async function readBody(res: Response): Promise<unknown> {
    try { return await res.json(); } catch { return undefined; }
  }

  /** The error for a non-2xx response: the server's own `{ error, message, issues? }` when it sent one. */
  async function failure(res: Response): Promise<TeamServerError> {
    const body = await readBody(res);
    if (isObj(body) && typeof body.error === 'string') {
      return new TeamServerError({
        status: res.status,
        error: body.error,
        message: typeof body.message === 'string' && body.message ? body.message : `The team server refused the request (${body.error}).`,
        ...(Array.isArray(body.issues) ? { issues: body.issues as TeamServerIssue[] } : {}),
      });
    }
    return new TeamServerError({ status: res.status, error: `http-${res.status}`, message: `The team server answered with an error (${res.status}).` });
  }

  const key = opts.key?.trim();
  /** The headers of a request that needs the key (none of the reading ones does). */
  const withKey = (extra: Record<string, string> = {}): Record<string, string> => ({ ...(key ? { Authorization: `Bearer ${key}` } : {}), ...extra });
  const JSON_BODY = { 'Content-Type': 'application/json' };
  const team = (course: string) => `/teams/${encodeURIComponent(course)}/texts`;

  /** A successful response must be JSON of the shape the caller needs; anything else is a `bad-response`. */
  async function jsonOf(res: Response): Promise<Record<string, unknown>> {
    const body = await readBody(res);
    if (!isObj(body)) throw new TeamServerError({ status: res.status, error: 'bad-response', message: 'The team server sent an answer this version of Go cannot read.' });
    return body;
  }

  return {
    async health() {
      let res: Response;
      try {
        res = await send('/health', { method: 'GET' });
      } catch (e) {
        return { ok: false, message: e instanceof TeamServerError ? e.message : UNREACHABLE_MESSAGE };
      }
      if (!res.ok) return { ok: false, message: `The team server answered with an error (${res.status}).` };
      const body = await readBody(res);
      if (isObj(body) && body.ok === true && (body.service === undefined || body.service === 'goread')) return { ok: true };
      return { ok: false, message: 'The address answers, but it is not a GoRead team server.' };
    },

    async list(course, since) {
      const query = since ? `?since=${encodeURIComponent(since)}` : '';
      const res = await send(`${team(course)}${query}`, { method: 'GET' });
      if (!res.ok) throw await failure(res);
      const body = await jsonOf(res);
      if (!Array.isArray(body.texts)) throw new TeamServerError({ status: res.status, error: 'bad-response', message: 'The team server sent an answer this version of Go cannot read.' });
      return body.texts as TextSummary[];
    },

    async get(course, id) {
      const res = await send(`${team(course)}/${encodeURIComponent(id)}`, { method: 'GET' });
      if (!res.ok) throw await failure(res);
      const body = await jsonOf(res);
      if (!isObj(body.document)) throw new TeamServerError({ status: res.status, error: 'bad-response', message: 'The team server sent an answer this version of Go cannot read.' });
      return body as unknown as SharedText;
    },

    async me(course) {
      const res = await send(`/teams/${encodeURIComponent(course)}/me`, { method: 'GET', headers: withKey() });
      if (!res.ok) throw await failure(res);
      const body = await jsonOf(res);
      if (typeof body.team !== 'string' || typeof body.name !== 'string') {
        throw new TeamServerError({ status: res.status, error: 'bad-response', message: 'The team server sent an answer this version of Go cannot read.' });
      }
      return { team: body.team, name: body.name };
    },

    async share(course, document) {
      const res = await send(`${team(course)}/${encodeURIComponent(document.id)}`, {
        method: 'PUT', headers: withKey(JSON_BODY), body: JSON.stringify({ document }),
      });
      if (!res.ok) throw await failure(res);
      const body = await jsonOf(res);
      if (!isObj(body.summary) || res.status !== 201) {
        throw new TeamServerError({ status: res.status, error: 'bad-response', message: 'The team server sent an answer this version of Go cannot read.' });
      }
      return { status: 201, summary: body.summary as unknown as TextSummary };
    },
  };
}
