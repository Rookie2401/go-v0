/**
 * The Repository service: one `handle(request, deps)` with web APIs only (Request in, Response out), so the same code
 * runs under node:http (main.ts), in a Worker, and in-process in tests (api.ts). Same convention as server/goread/handler.ts:
 * errors are `{ error, message }`, one log line per request `METHOD /path status ms` (never a body, a query or a token),
 * bearer tokens are 32 random bytes, only their sha256 is stored.
 *
 * Authorization has one rule: the learner is the SESSION's learner. A learnerId that appears anywhere in a request
 * (query, body, an event, a document) and differs from it is `403 not-your-data` and nothing is read or written.
 * Team membership grants nothing; no route exists that reads another learner.
 */
import {
  CONTRACT_VERSION, EVENT_KINDS, KNOWLEDGE_LEVELS, MAX_CORRECTIONS, UNKNOWN_RESTRICTIONS, capRestrictions, MAX_FUTURE_SKEW_MS, MAX_SURFACE_CHARS, familyOf, provenanceOf, validateCorrection, validateEvent, validationForPack,
} from '../../repository-contract/src';
import type {
  Account, AppendOutcome, AssistancePreferences, Device, Enrolment, EventFamily, EventKind, GoEvent, Learner,
  LearningGoal, LinguisticUnit, PrivateDocument, RestrictionsInput, Session, SourceRef, SourceRestrictions, StoredEvent, SyncPullResponse, SyncPushResponse, Tombstone, UnitCorrection, ValidationIssue, ValidationLevel,
} from '../../repository-contract/src';
import type { CorrectionResult, LookupResult, ServiceDeps } from './deps';

export const SERVICE_VERSION = 1;
/** The largest request body accepted (bytes), counted on the stream; over it is 413. */
export const MAX_BODY_BYTES = 1024 * 1024;
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
export const LOCKOUT_ATTEMPTS = 5;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
export const MIN_PASSWORD_CHARS = 10;
export const MAX_EVENTS_PER_BATCH = 500;
export const MAX_DOCUMENTS_PER_PUSH = 50;
export const MAX_PAGE = 1000;
/** The most units one `POST /units/batch` returns. */
export const MAX_UNITS_PER_BATCH = 50;
/** The skew a sync-pushing device may have (its clock is reported, not applied); a direct POST /events allows MAX_FUTURE_SKEW_MS. */
export const MAX_SYNC_SKEW_MS = 24 * 3600 * 1000;
/** A request body nested deeper than this is refused with 400 before any field is read (no real request is anywhere near it). */
export const MAX_BODY_DEPTH = 24;
export const EXPORT_FORMAT = 'go-repository-export@1';

/** What the two concrete stores add to the port: record a tombstone, then physically remove what it names (repository-store `applyTombstone`). Declared here so the handler imports no store code. */
interface TombstoneApplier { applyTombstone(t: Tombstone): Promise<{ events: number; knowledge: number }> }

const MESSAGES = {
  unauthorized: 'Sign in again: this session is missing, unknown, expired or ended.',
  notYours: 'That belongs to a different learner. A request can only name its own learner.',
  notFound: 'Nothing here.',
  method: 'That method is not allowed here.',
  tooLarge: 'That request is too large (the limit is 1 MB). Send it in smaller parts.',
  invalidJson: 'The request body is not valid JSON.',
  server: 'The server could not complete the request.',
} as const;

/** A failure the handler turns into a response. */
class Refusal extends Error {
  constructor(readonly status: number, readonly error: string, message: string, readonly extra: Record<string, unknown> = {}) {
    super(message);
  }
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '600',
};

/**
 * Sent on every response. The service answers JSON only, some of it user-controlled (document bodies, titles), so a browser
 * must never sniff it into something else (nosniff), never frame it, never leak the address of the page that fetched it
 * (a path can hold an id), and has no business running anything from it (an empty CSP).
 */
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
};

function respond(status: number, body?: unknown, extraHeaders: Record<string, string> = {}): Response {
  const headers: Record<string, string> = { ...CORS, ...SECURITY_HEADERS, 'Cache-Control': 'no-store', ...extraHeaders };
  if (body === undefined || status === 204) return new Response(null, { status, headers });
  headers['Content-Type'] = 'application/json; charset=utf-8';
  return new Response(JSON.stringify(body), { status, headers });
}

/** Equality of two strings in time that depends only on their length (never stops early). */
export function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const uuid = (): string => crypto.randomUUID();

/** Whether `root` has objects or arrays nested more than `max` levels deep. Iterative and stops at the first excess, so a hostile body costs little and cannot overflow the stack. */
function nestedDeeperThan(root: unknown, max: number): boolean {
  const stack: Array<[unknown, number]> = [[root, 1]];
  let visited = 0;
  while (stack.length) {
    const [v, depth] = stack.pop()!;
    if (v === null || typeof v !== 'object') continue;
    if (depth > max) return true;
    if (++visited > 200_000) return false; // a wide body is bounded by the 1 MB limit; this only bounds the walk
    for (const child of Array.isArray(v) ? v : Object.values(v)) if (child !== null && typeof child === 'object') stack.push([child, depth + 1]);
  }
  return false;
}

/** Read the body as text, refusing at the size limit; the limit is on the stream, not only on the header. */
async function readText(request: Request): Promise<string> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    await request.body?.cancel().catch(() => undefined);
    throw new Refusal(413, 'too-large', MESSAGES.tooLarge);
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
      throw new Refusal(413, 'too-large', MESSAGES.tooLarge);
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.length; }
  return new TextDecoder().decode(all);
}

// ───────────────────────────── context ─────────────────────────────

interface Ctx {
  request: Request;
  deps: ServiceDeps;
  query: URLSearchParams;
  params: Record<string, string>;
  now: () => string;
  body: () => Promise<Record<string, unknown>>;
  /** Only after `authed`. */
  session: Session;
}

type Handler = (ctx: Ctx) => Promise<Response>;
interface Route { method: string; path: string[]; auth: boolean; run: Handler }

/** The learner is the session's. Anything else named in a request is refused. */
function assertSelf(ctx: Ctx, supplied: unknown): void {
  if (supplied !== undefined && supplied !== null && supplied !== ctx.session.learnerId) throw new Refusal(403, 'not-your-data', MESSAGES.notYours);
}

const invalid = (message: string, issues?: unknown): Refusal => new Refusal(422, 'invalid-input', message, issues ? { issues } : {});

function intParam(q: URLSearchParams, name: string, opts: { def: number; min: number; max: number; clamp?: boolean }): number {
  const raw = q.get(name);
  if (raw === null || raw === '') return opts.def;
  if (!/^-?\d+$/.test(raw)) throw new Refusal(422, 'invalid-query', `"${name}" must be a whole number.`);
  const n = Number(raw);
  if (n < opts.min) throw new Refusal(422, 'invalid-query', `"${name}" must be at least ${opts.min}.`);
  if (n > opts.max) {
    if (opts.clamp) return opts.max;
    throw new Refusal(422, 'invalid-query', `"${name}" must be at most ${opts.max}.`);
  }
  return n;
}

const listParam = (q: URLSearchParams, name: string, max: number): string[] | undefined => {
  const raw = q.get(name);
  if (raw === null || raw === '') return undefined;
  const items = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (items.length > max) throw new Refusal(422, 'invalid-query', `"${name}" takes at most ${max} values.`);
  return items;
};

// ───────────────────────────── sign-in throttle ─────────────────────────────

/**
 * Failed sign-ins per email, in memory. PER PROCESS: it is lost on restart and not shared between instances, so a
 * horizontally scaled deployment multiplies the allowance. Unknown emails are counted the same as known ones, so the
 * 429 reveals nothing about which addresses have accounts.
 */
const failures = new WeakMap<object, Map<string, number[]>>();
const dummyHashes = new WeakMap<object, Promise<string>>();

function failureLog(deps: ServiceDeps): Map<string, number[]> {
  let m = failures.get(deps);
  if (!m) { m = new Map(); failures.set(deps, m); }
  return m;
}

function recentFailures(deps: ServiceDeps, email: string, nowMs: number): number[] {
  const m = failureLog(deps);
  const recent = (m.get(email) ?? []).filter((t) => nowMs - t < LOCKOUT_WINDOW_MS);
  if (recent.length) m.set(email, recent); else m.delete(email);
  if (m.size > 10_000) for (const [k, v] of m) if (v.every((t) => nowMs - t >= LOCKOUT_WINDOW_MS)) m.delete(k);
  return recent;
}

const normalEmail = (e: string): string => e.trim().toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ───────────────────────────── validation of inputs ─────────────────────────────

const GOAL_KINDS: readonly LearningGoal['kind'][] = ['reading', 'listening', 'speaking', 'writing', 'scripture', 'conversation', 'custom'];
const DOC_KINDS: readonly PrivateDocument['kind'][] = ['draft', 'testimony', 'note'];

function parseGoals(raw: unknown): LearningGoal[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 20) throw invalid('"goals" must be a list of at most 20 goals.');
  return raw.map((g, i) => {
    if (!isObj(g) || !GOAL_KINDS.includes(g.kind as LearningGoal['kind'])) throw invalid(`goals[${i}].kind must be one of ${GOAL_KINDS.join(', ')}.`);
    const goal: LearningGoal = { kind: g.kind as LearningGoal['kind'] };
    if (typeof g.label === 'string') goal.label = g.label.slice(0, 200);
    if (typeof g.priority === 'number' && Number.isFinite(g.priority)) goal.priority = g.priority;
    return goal;
  });
}

/** `deleted`: the client marked the document deleted (`doc.deletedAt`, as the sync client's `LocalDocuments.remove` does); the server deletes it, with the same revision rule, and keeps no word of it. */
interface DocumentInput { doc: PrivateDocument; expectedRevision: number; deleted: boolean }

/** The server decides learner, device, time and revision; the client supplies the content and the revision it last saw. */
function parseDocument(ctx: Ctx, raw: unknown, where: string, idFromPath?: string, allowDeletion = false): DocumentInput {
  if (!isObj(raw) || !isObj(raw.doc)) throw invalid(`${where} needs a "doc".`);
  const d = raw.doc;
  assertSelf(ctx, d.learnerId);
  const expectedRevision = raw.expectedRevision;
  if (typeof expectedRevision !== 'number' || !Number.isInteger(expectedRevision) || expectedRevision < 0) throw invalid(`${where}: "expectedRevision" must be a whole number from 0 (0 for a new document).`);
  const docId = idFromPath ?? d.docId;
  if (!isStr(docId) || docId.length > 200) throw invalid(`${where}: "doc.docId" is required (at most 200 characters).`);
  if (idFromPath !== undefined && d.docId !== undefined && d.docId !== idFromPath) throw new Refusal(422, 'id-mismatch', `${where}: the document's id is not the id in the address.`);
  if (!isStr(d.languageId)) throw invalid(`${where}: "doc.languageId" is required.`);
  if (!DOC_KINDS.includes(d.kind as PrivateDocument['kind'])) throw invalid(`${where}: "doc.kind" must be one of ${DOC_KINDS.join(', ')}.`);
  if (typeof d.body !== 'string') throw invalid(`${where}: "doc.body" must be a string.`);
  if (d.title !== undefined && (typeof d.title !== 'string' || d.title.length > 300)) throw invalid(`${where}: "doc.title" must be a string of at most 300 characters.`);
  const doc: PrivateDocument = {
    docId,
    learnerId: ctx.session.learnerId,
    languageId: d.languageId,
    kind: d.kind as PrivateDocument['kind'],
    body: d.body,
    revision: expectedRevision + 1,
    deviceId: ctx.session.deviceId,
    updatedAt: ctx.now(),
  };
  // Only the sync protocol carries a deletion this way (`LocalDocuments.remove` pushes the document with `deletedAt`); on PUT and /writing a client-sent `deletedAt` is ignored like any other server-owned field.
  const deleted = allowDeletion && typeof d.deletedAt === 'string' && d.deletedAt.length > 0;
  if (typeof d.title === 'string' && !deleted) doc.title = d.title;
  if (deleted) doc.body = '';
  return { doc, expectedRevision, deleted };
}

const meta = (d: PrivateDocument): Omit<PrivateDocument, 'body'> => {
  const { body: _body, ...rest } = d;
  return rest;
};

/**
 * Validates events as one batch: learner first (403, nothing else is looked at), then the contract (422 for the whole
 * batch with issues per index). Server-owned fields (`recordedAt`, `seq`) are dropped; the store stamps them.
 *
 * Beyond the contract, because only the service knows who the caller is and what time it is:
 *  - `at` may be at most MAX_FUTURE_SKEW_MS (5 minutes) ahead of the SERVER's clock (`at-in-future`; a sync push is allowed the
 *    skew it declares, to a day);
 *  - `producer.app` is never `repository` for a NEW event: that name is the service's own (it writes those events itself, not through
 *    here); a client may only replay one the service already stored for it, which is a duplicate by id;
 *  - `producer.deviceId` is the session's device, or a device registered to this learner (S-05: a device id an event names
 *    must be one this learner signed in from; an invented or foreign one is refused);
 *  - `enrolmentId` is one of the learner's own enrolments, and the event's `languageId` is that enrolment's language (one lookup per batch).
 */
async function prepareEvents(ctx: Ctx, raw: unknown, where: string, restrict?: { families: EventFamily[] }, clientTimeMs?: number): Promise<GoEvent[]> {
  if (!Array.isArray(raw) || raw.length === 0) throw invalid(`${where} needs a non-empty "events" list.`);
  if (raw.length > MAX_EVENTS_PER_BATCH) throw invalid(`${where}: at most ${MAX_EVENTS_PER_BATCH} events per request.`);
  for (const e of raw) if (isObj(e)) assertSelf(ctx, e.learnerId);
  const nowMs = Date.parse(ctx.now());
  // The latest `at` accepted. A sync push declares its device's clock (`clientTime`), which is measured and reported as skew rather than
  // corrected, so an honest device up to a day off keeps its own timeline: its events may run up to 5 minutes past ITS stated time.
  const latestAt = clientTimeMs === undefined || Number.isNaN(clientTimeMs)
    ? nowMs + MAX_FUTURE_SKEW_MS
    : Math.max(nowMs + MAX_FUTURE_SKEW_MS, Math.min(clientTimeMs + MAX_FUTURE_SKEW_MS, nowMs + MAX_SYNC_SKEW_MS));
  const bad: Array<{ index: number; id?: string; issues: ValidationIssue[] }> = [];
  const { store } = ctx.deps;
  const learnerId = ctx.session.learnerId;
  let enrolmentLanguages: Map<string, string> | undefined;
  const knownDevices = new Map<string, boolean>([[ctx.session.deviceId, true]]);
  for (const [index, e] of raw.entries()) {
    const issues = validateEvent(e, { nowMs: latestAt, futureSkewMs: 0 });
    if (issues.length === 0) {
      const ev = e as GoEvent;
      if (restrict && !restrict.families.includes(familyOf(ev.kind))) issues.push({ path: 'kind', message: `${where} accepts only ${restrict.families.join(' and ')} events` });
      // The name is the service's own. A client may REPLAY one of those events the service already holds for it (a whole-history resend is deduped by id), never introduce one.
      if (ev.producer.app === 'repository' && !(await store.get(learnerId, ev.id))) issues.push({ path: 'producer.app', message: 'the producer "repository" is the service itself; a client names its own application' });
      if (!knownDevices.has(ev.producer.deviceId)) knownDevices.set(ev.producer.deviceId, !!(await store.getDevice(learnerId, ev.producer.deviceId)));
      if (!knownDevices.get(ev.producer.deviceId)) issues.push({ path: 'producer.deviceId', message: 'not a device of this session or of this learner; sign in from the device to register it' });
      enrolmentLanguages ??= new Map((await store.listEnrolments(learnerId)).map((n) => [n.enrolmentId, n.languageId] as const));
      const enrolledIn = enrolmentLanguages.get(ev.enrolmentId);
      if (enrolledIn === undefined) issues.push({ path: 'enrolmentId', message: "not one of this learner's enrolments" });
      // P-07: the two languages' histories stay separate on the server too, however a client labels an event.
      else if (ev.languageId !== enrolledIn) issues.push({ path: 'languageId', message: `the event is in "${ev.languageId}" but its enrolment is for "${enrolledIn}"` });
    }
    if (issues.length) bad.push({ index, ...(isObj(e) && typeof e.id === 'string' ? { id: e.id.slice(0, 200) } : {}), issues });
  }
  if (bad.length) throw new Refusal(422, 'invalid-events', `${bad.length} of ${raw.length} events are invalid; nothing was stored. Fix them and send the whole batch again.`, { issues: bad });
  return raw.map((e) => {
    const { recordedAt: _r, seq: _s, ...rest } = e as GoEvent & { seq?: number };
    // A source's restrictions are the client's claim: the stored value is that claim capped by the reader's policy (sourcePolicy.ts), so
    // metadata a page controls cannot grant a permission. A typed (v3) reference is also rebuilt from its known fields.
    const ref = rest.subject.sourceRef as unknown;
    if (isObj(ref)) {
      const policy = ctx.deps.sourcePolicy?.((rest.payload as { readerId?: unknown }).readerId) ?? UNKNOWN_RESTRICTIONS;
      rest.subject = { ...rest.subject, sourceRef: storedSourceRef(ref, policy, rest.v >= 3) as unknown as SourceRef };
    }
    return rest as GoEvent;
  });
}

/** Known fields of each member of the typed source-reference union: a v3 reference is stored rebuilt from these alone. */
const SOURCE_FIELDS: Record<SourceRef['kind'], readonly string[]> = {
  web: ['title', 'locator'], ebook: ['title', 'locator'], file: ['title', 'locator'], demo: ['title', 'locator'], practice: ['title', 'locator'], writing: ['title', 'locator'],
  scripture: ['provider', 'translationId', 'languageId', 'book', 'chapter', 'verse', 'verseEnd', 'url', 'confidence'],
  share: ['mechanism', 'sourceApp', 'title', 'locator'],
  media: ['provider', 'mediaId', 'timestampMs', 'captionLanguage', 'audioLanguage', 'captionProvenance'],
};

/**
 * The source reference as the service stores it (contract v3). `restrictions` is the client's claim: it is written only when the client sent some,
 * as the cap of that claim by `policy` (the most permissive value the service will store for the event's reader; see sourcePolicy.ts). A client
 * may tighten and never loosen, so metadata a page controls cannot grant a permission. A typed (v3) reference keeps its known fields only; a
 * v1/v2 reference keeps every field it had.
 */
export function storedSourceRef(ref: Record<string, unknown>, policy: Readonly<SourceRestrictions>, typed: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const known = SOURCE_FIELDS[ref.kind as SourceRef['kind']];
  if (typed && known) {
    out.kind = ref.kind;
    for (const k of known) if (ref[k] !== undefined) out[k] = ref[k];
  } else {
    for (const [k, v] of Object.entries(ref)) if (k !== 'restrictions') out[k] = v;
  }
  if (ref.restrictions !== undefined) out.restrictions = capRestrictions(ref.restrictions as RestrictionsInput, policy);
  return out;
}

/** Folds new events into the learner's knowledge. A failure here never loses the events: they are already stored. */
async function project(ctx: Ctx): Promise<boolean> {
  try { await ctx.deps.engine.project(ctx.session.learnerId); return true; } catch { return false; }
}

/**
 * Layer A follows the reader (§14 certification finding): a `SelectionLookedUp` event names the surface the learner
 * met, so the Repository resolves and stores its analysis (lexeme, form and morph units) exactly as `/lookup` would.
 * Without this the unit stays unknown to the linguistic store and GoReview's intake can only answer "needs
 * validation". Only the surface (already in the event, at most 4 words) and the sentence hash are used; a failure never
 * affects ingestion, which has already succeeded.
 */
async function registerSurfaces(ctx: Ctx, events: GoEvent[]): Promise<void> {
  const seen = new Set<string>();
  for (const e of events) {
    if (e.kind !== 'SelectionLookedUp') continue;
    const surface = (e.payload as { surface?: unknown }).surface;
    if (typeof surface !== 'string' || !surface.trim() || surface.length > MAX_SURFACE_CHARS) continue;
    const key = `${e.languageId}\0${surface}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const result = // out-of-context registration on purpose: a sentence hash is one learner's reading context and must not land in the shared rows (privacy export audit)
      await ctx.deps.linguistics.resolveAndStore({ languageId: e.languageId, surface });
      await stampLookup(ctx, result);
    } catch { /* the analysis can be registered by a later lookup */ }
  }
}

/**
 * Provenance for rows a lookup registered (audit P-12). The shared linguistic tables hold no learner data, so a stamp says HOW the row came to
 * exist, never WHO looked it up: `origin: 'learner-lookup'`, `validation` from the pack's level (`validationForPack`: an installable pack
 * reads as production-validated only if its manifest says so, an experimental one as experimental, anything unknown as unreviewed), and the
 * pack version. Only stored rows that carry no `origin` yet are stamped, so it happens once per row and a producer's own origin is never replaced.
 * A failure never affects the lookup or the ingestion.
 */
async function stampLookup(ctx: Ctx, result: LookupResult): Promise<void> {
  try {
    const { store } = ctx.deps;
    const validations = new Map<string, ValidationLevel>();
    const validationOf = async (packId: string, packVersion: string): Promise<ValidationLevel> => {
      const key = `${packId}\u0000${packVersion}`;
      let v = validations.get(key);
      if (v === undefined) { v = validationForPack(await store.getPack(packId, packVersion)); validations.set(key, v); }
      return v;
    };
    const unitValidation = new Map<string, ValidationLevel>();
    const storedUnits = await store.getUnits(result.units.map((u) => u.unitId));
    const unitsToStamp: LinguisticUnit[] = [];
    for (const u of storedUnits) {
      const validation = u.provenance.validation ?? await validationOf(u.packId, u.packVersion);
      unitValidation.set(u.unitId, validation);
      if (u.provenance.origin === undefined) {
        unitsToStamp.push({ ...u, provenance: { ...u.provenance, origin: 'learner-lookup', validation, packVersion: u.provenance.packVersion ?? u.packVersion } });
      }
    }
    if (unitsToStamp.length) await store.putUnits(unitsToStamp);
    const fallback = unitValidation.values().next().value ?? 'unreviewed';

    const relationsToStamp = [];
    for (const rel of result.relations) {
      const stored = (await store.relationsOf(rel.fromId, 'out')).find((r) => r.relation === rel.relation && r.toId === rel.toId);
      if (stored && stored.provenance.origin === undefined) {
        relationsToStamp.push({ ...stored, provenance: { ...stored.provenance, origin: 'learner-lookup' as const, validation: stored.provenance.validation ?? unitValidation.get(stored.fromId) ?? fallback } });
      }
    }
    if (relationsToStamp.length) await store.putRelations(relationsToStamp);

    if (result.analysis) {
      const stored = await store.getAnalysis(result.analysis.analysisId);
      const candidate = stored?.candidates[stored.chosen ?? 0]?.provenance;
      if (stored && stored.provenance === undefined && candidate?.origin === undefined) {
        const validation = candidate?.validation ?? await validationOf(stored.packId, stored.packVersion);
        await store.putAnalyses([{
          ...stored,
          provenance: {
            source: candidate?.source ?? 'parser', ref: candidate?.ref ?? stored.analyzerId, confidence: candidate?.confidence ?? 0,
            origin: 'learner-lookup', validation, packVersion: stored.packVersion,
          },
        }]);
      }
    }
  } catch { /* provenance is best effort; the rows themselves are already stored */ }
}

const accountView = (a: Account): Pick<Account, 'accountId' | 'email' | 'createdAt'> => ({ accountId: a.accountId, email: a.email, createdAt: a.createdAt });

async function currentAccount(ctx: Ctx): Promise<Account> {
  const account = await ctx.deps.store.getAccount(ctx.session.accountId);
  if (!account) throw new Refusal(401, 'unauthorized', MESSAGES.unauthorized);
  return account;
}

// ───────────────────────────── routes ─────────────────────────────

const routes: Route[] = [];
const route = (method: string, path: string, auth: boolean, run: Handler): void => { routes.push({ method, path: path.split('/').filter(Boolean), auth, run }); };

route('GET', '/health', false, async () => respond(200, { ok: true, service: 'repository', version: SERVICE_VERSION, contractVersion: CONTRACT_VERSION }));

// ── accounts and sessions ──

route('POST', '/accounts', false, async (ctx) => {
  const b = await ctx.body();
  if (typeof b.email !== 'string' || b.email.length > 254 || !EMAIL.test(normalEmail(b.email))) throw invalid('"email" must be an email address.');
  if (typeof b.password !== 'string' || b.password.length < MIN_PASSWORD_CHARS) throw new Refusal(422, 'weak-password', `The password needs at least ${MIN_PASSWORD_CHARS} characters.`);
  if (b.password.length > 1000) throw invalid('"password" is too long (at most 1000 characters).');
  if (b.displayName !== undefined && (typeof b.displayName !== 'string' || b.displayName.length > 200)) throw invalid('"displayName" must be a string of at most 200 characters.');
  const email = normalEmail(b.email);
  const { store, crypto: c } = ctx.deps;
  if (await store.getAccountByEmail(email)) throw new Refusal(409, 'email-taken', 'There is already an account with that email.');
  const at = ctx.now();
  const learner: Learner = { learnerId: uuid(), createdAt: at, ...(typeof b.displayName === 'string' && b.displayName ? { displayName: b.displayName } : {}) };
  const account: Account & { passwordHash: string } = { accountId: uuid(), learnerId: learner.learnerId, email, createdAt: at, passwordHash: await c.hashPassword(b.password) };
  await store.transaction(async () => { await store.putLearner(learner); await store.putAccount(account); });
  return respond(201, { learnerId: learner.learnerId, accountId: account.accountId });
});

route('POST', '/sessions', false, async (ctx) => {
  const b = await ctx.body();
  if (typeof b.email !== 'string' || typeof b.password !== 'string' || b.email.length > 254 || b.password.length > 1000) throw invalid('"email" and "password" are required.');
  if (!isStr(b.deviceId) || b.deviceId.length > 200) throw invalid('"deviceId" is required (at most 200 characters).');
  if (b.platform !== undefined && (typeof b.platform !== 'string' || b.platform.length > 100)) throw invalid('"platform" must be a string of at most 100 characters.');
  const { store, crypto: c } = ctx.deps;
  const email = normalEmail(b.email);
  const nowMs = Date.parse(ctx.now());
  if (recentFailures(ctx.deps, email, nowMs).length >= LOCKOUT_ATTEMPTS) {
    throw new Refusal(429, 'too-many-attempts', 'Too many failed sign-ins for that email. Wait 15 minutes and try again.');
  }
  const account = await store.getAccountByEmail(email);
  // The same work whether or not the email exists: an unknown email is checked against a throw-away hash.
  let dummy = dummyHashes.get(ctx.deps);
  if (!dummy) { dummy = c.hashPassword(c.randomToken()); dummyHashes.set(ctx.deps, dummy); }
  const ok = await c.verifyPassword(b.password, account ? account.passwordHash : await dummy);
  if (!account || !ok || account.disabledAt) {
    const m = failureLog(ctx.deps);
    m.set(email, [...recentFailures(ctx.deps, email, nowMs), nowMs]);
    throw new Refusal(401, 'bad-credentials', 'The email or the password is not right.');
  }
  failureLog(ctx.deps).delete(email);
  const at = ctx.now();
  const existing = await store.getDevice(account.learnerId, b.deviceId);
  const device: Device = {
    deviceId: b.deviceId, learnerId: account.learnerId, registeredAt: existing?.registeredAt ?? at, lastSyncAt: existing?.lastSyncAt,
    ...(typeof b.platform === 'string' ? { platform: b.platform } : existing?.platform ? { platform: existing.platform } : {}),
    ...(existing?.label ? { label: existing.label } : {}),
  };
  if (device.lastSyncAt === undefined) delete device.lastSyncAt;
  await store.putDevice(device);
  const token = c.randomToken();
  const expiresAt = new Date(Date.parse(at) + SESSION_TTL_MS).toISOString();
  const session: Session & { tokenHash: string } = {
    sessionId: uuid(), accountId: account.accountId, learnerId: account.learnerId, deviceId: b.deviceId, createdAt: at, expiresAt, tokenHash: c.sha256(token),
  };
  await store.putSession(session);
  return respond(201, { token, learnerId: account.learnerId, expiresAt });
});

route('DELETE', '/sessions/current', true, async (ctx) => {
  await ctx.deps.store.revokeSession(ctx.session.sessionId, ctx.now());
  return respond(204);
});

route('GET', '/me', true, async (ctx) => {
  const { store } = ctx.deps;
  const learnerId = ctx.session.learnerId;
  const [learner, account, enrolments, device, consentEvents] = await Promise.all([
    store.getLearner(learnerId), currentAccount(ctx), store.listEnrolments(learnerId), store.getDevice(learnerId, ctx.session.deviceId),
    store.list({ learnerId, kinds: ['ConsentGiven', 'ConsentWithdrawn'], limit: MAX_PAGE }),
  ]);
  // Latest word per consent key (payload.consent, else scope, else key, else "general"); "given" unless the last event withdrew it.
  const consents = new Map<string, { key: string; given: boolean; at: string }>();
  for (const e of consentEvents) {
    const p = e.payload as Record<string, unknown>;
    const key = [p.consent, p.scope, p.key].find((v) => typeof v === 'string') as string | undefined ?? 'general';
    // The latest decision BY TIME, whatever order the events arrived in (a lagging device's older grant must not undo a newer withdrawal); a tie goes to the later arrival.
    const earlier = consents.get(key);
    if (earlier && Date.parse(e.at) < Date.parse(earlier.at)) continue;
    consents.set(key, { key, given: e.kind === 'ConsentGiven', at: e.at });
  }
  return respond(200, {
    learner, account: accountView(account), enrolments,
    devices: device ? [{ deviceId: device.deviceId, platform: device.platform, registeredAt: device.registeredAt, lastSyncAt: device.lastSyncAt }] : [{ deviceId: ctx.session.deviceId }],
    consents: [...consents.values()],
  });
});

route('DELETE', '/me', true, async (ctx) => {
  const b = await ctx.body();
  assertSelf(ctx, b.learnerId);
  const account = await currentAccount(ctx);
  if (typeof b.confirmEmail !== 'string' || normalEmail(b.confirmEmail) !== account.email) {
    throw new Refusal(422, 'email-mismatch', 'To delete everything, send the email address of this account as "confirmEmail".');
  }
  const { store } = ctx.deps;
  const learnerId = ctx.session.learnerId;
  const at = ctx.now();
  await store.revokeSession(ctx.session.sessionId, at);
  await store.eraseLearner(learnerId); // events, projections, documents, sessions, devices, enrolments
  // The port has no account deletion: if the account row survived the erase, it is disabled and its email released.
  const left = await store.getAccount(ctx.session.accountId);
  if (left) await store.putAccount({ ...accountView(left), learnerId, email: `deleted+${left.accountId}@invalid`, disabledAt: at, passwordHash: '!' });
  const learner = await store.getLearner(learnerId);
  if (learner) await store.putLearner({ learnerId, createdAt: learner.createdAt });
  return respond(204);
});

// ── enrolments, packs, linguistics ──

route('GET', '/enrolments', true, async (ctx) => {
  assertSelf(ctx, ctx.query.get('learnerId') ?? undefined);
  return respond(200, { enrolments: await ctx.deps.store.listEnrolments(ctx.session.learnerId) });
});

route('POST', '/enrolments', true, async (ctx) => {
  const b = await ctx.body();
  assertSelf(ctx, b.learnerId);
  if (!isStr(b.languageId) || !isStr(b.packId) || !isStr(b.packVersion)) throw invalid('"languageId", "packId" and "packVersion" are required.');
  for (const k of ['teamId', 'varietyId', 'scriptId'] as const) if (b[k] !== undefined && !isStr(b[k])) throw invalid(`"${k}" must be a non-empty string.`);
  const goals = parseGoals(b.goals);
  const { store } = ctx.deps;
  const learnerId = ctx.session.learnerId;
  if (typeof b.teamId === 'string') {
    if (!(await store.getTeam(b.teamId))) throw new Refusal(404, 'no-such-team', 'There is no team with that id.');
    if (!(await store.listTeamMembers(b.teamId)).some((m) => m.learnerId === learnerId)) throw new Refusal(403, 'not-a-member', 'You are not a member of that team.');
  }
  const at = ctx.now();
  const enrolment: Enrolment = {
    enrolmentId: uuid(), learnerId, languageId: b.languageId, packId: b.packId, packVersion: b.packVersion, goals, startedAt: at,
    ...(typeof b.teamId === 'string' ? { teamId: b.teamId } : {}),
    ...(typeof b.varietyId === 'string' ? { varietyId: b.varietyId } : {}),
    ...(typeof b.scriptId === 'string' ? { scriptId: b.scriptId } : {}),
  };
  const event: GoEvent = {
    id: uuid(), v: CONTRACT_VERSION, learnerId, enrolmentId: enrolment.enrolmentId, languageId: enrolment.languageId,
    ...(enrolment.varietyId ? { varietyId: enrolment.varietyId } : {}), at,
    producer: { app: 'repository', version: String(SERVICE_VERSION), deviceId: ctx.session.deviceId },
    kind: 'EnrolmentChanged', subject: {}, payload: { change: 'started', packId: enrolment.packId, packVersion: enrolment.packVersion, goals },
    dedupeKey: `enrolment:${enrolment.enrolmentId}:started`,
  };
  await store.transaction(async () => { await store.putEnrolment(enrolment); await store.append(learnerId, [event]); });
  await project(ctx);
  return respond(201, { enrolment });
});

// A learner ends one of their own enrolments (audit P-06): it keeps its history and its team label as a record, the apps stop recording against it
// (`pickEnrolment` skips an ended one), and an `EnrolmentChanged {change:'ended'}` event says so. Ending twice is the same answer.
route('POST', '/enrolments/:id/end', true, async (ctx) => {
  const { store } = ctx.deps;
  const learnerId = ctx.session.learnerId;
  // listed per learner: another learner's enrolment is indistinguishable from a missing one
  const found = (await store.listEnrolments(learnerId)).find((e) => e.enrolmentId === ctx.params.id);
  if (!found) throw new Refusal(404, 'no-such-enrolment', 'You have no enrolment with that id.');
  if (found.endedAt) return respond(200, { enrolment: found });
  const at = ctx.now();
  const enrolment: Enrolment = { ...found, endedAt: at };
  const event: GoEvent = {
    id: uuid(), v: CONTRACT_VERSION, learnerId, enrolmentId: enrolment.enrolmentId, languageId: enrolment.languageId,
    ...(enrolment.varietyId ? { varietyId: enrolment.varietyId } : {}), at,
    producer: { app: 'repository', version: String(SERVICE_VERSION), deviceId: ctx.session.deviceId },
    kind: 'EnrolmentChanged', subject: {}, payload: { change: 'ended', packId: enrolment.packId, packVersion: enrolment.packVersion },
    dedupeKey: `enrolment:${enrolment.enrolmentId}:ended`,
  };
  await store.transaction(async () => { await store.putEnrolment(enrolment); await store.append(learnerId, [event]); });
  await project(ctx);
  return respond(200, { enrolment });
});

route('GET', '/packs', true, async (ctx) => {
  const languageId = ctx.query.get('languageId') ?? undefined;
  return respond(200, { packs: await ctx.deps.store.listPacks(languageId || undefined) });
});

route('GET', '/units/:id', true, async (ctx) => {
  const id = ctx.params.id;
  if (id.length > 300) throw new Refusal(404, 'no-such-unit', 'There is no unit with that id.');
  const view = await ctx.deps.linguistics.lookup(id);
  if (!view) throw new Refusal(404, 'no-such-unit', 'There is no unit with that id.');
  // `provenance` is the unit's own, with the v3 defaults filled in (a v2 row reads as origin "import", validation "unreviewed").
  return respond(200, { unit: view.unit, relations: view.relations, analyses: view.analyses, provenance: provenanceOf(view.unit.provenance) });
});

/**
 * A learner's (or, later, a reviewer's) challenge to a unit (contract v3, P-12). The correction is APPENDED to the unit's `provenance.corrections`
 * with a role and a bounded reason and no learner id. For a form unit given a `lexemeId` or `features`, the linguistics port's `correct()` also
 * writes the superseding analysis (the same path as `POST /corrections`); otherwise the unit is moved to `requires-review`, but only from
 * `provisional`: one learner cannot lower a high-confidence or verified unit for everyone, the correction waits there for a reviewer.
 */
route('POST', '/units/:id/corrections', true, async (ctx) => {
  const b = await ctx.body();
  assertSelf(ctx, b.learnerId);
  const id = ctx.params.id;
  if (id.length > 300) throw new Refusal(404, 'no-such-unit', 'There is no unit with that id.');
  if (b.by !== undefined && b.by !== 'learner') throw new Refusal(403, 'learner-only', 'This route takes a learner correction ("by": "learner"). A reviewer’s verdict is made by the operator through the store.');
  if (b.lexemeId !== undefined && !isStr(b.lexemeId)) throw invalid('"lexemeId" must be a unit id.');
  if (b.sentenceKey !== undefined && (typeof b.sentenceKey !== 'string' || b.sentenceKey.length > 200)) throw invalid('"sentenceKey" must be a string of at most 200 characters.');
  if (b.features !== undefined && (!isObj(b.features) || Object.values(b.features).some((v) => typeof v !== 'string'))) throw invalid('"features" must map feature names to strings.');
  const at = ctx.now();
  const correction: UnitCorrection = {
    at, by: 'learner', reason: b.reason as string,
    ...(b.from !== undefined ? { from: b.from as string } : {}), ...(b.to !== undefined ? { to: b.to as string } : {}),
  };
  const issues = validateCorrection(correction);
  if (issues.length) throw invalid('That correction is not valid.', issues);
  const { store, linguistics } = ctx.deps;
  const [unit] = await store.getUnits([id]);
  if (!unit) throw new Refusal(404, 'no-such-unit', 'There is no unit with that id.');
  if ((unit.provenance.corrections?.length ?? 0) >= MAX_CORRECTIONS) {
    throw new Refusal(409, 'corrections-full', `This unit already has ${MAX_CORRECTIONS} corrections waiting for a reviewer.`);
  }
  let result: CorrectionResult | undefined;
  if (unit.kind === 'form' && (b.lexemeId !== undefined || b.features !== undefined) && typeof linguistics.correct === 'function') {
    result = await linguistics.correct(id, {
      by: 'learner', learnerId: ctx.session.learnerId,
      ...(typeof b.lexemeId === 'string' ? { lexemeId: b.lexemeId } : {}),
      ...(b.features ? { features: b.features as Record<string, string> } : {}),
      reason: correction.reason,
      ...(typeof b.sentenceKey === 'string' ? { sentenceKey: b.sentenceKey } : {}),
    }, at);
  }
  const flag = result === undefined;
  let recorded: { unit: LinguisticUnit; statusChanged: boolean } | undefined;
  if (typeof store.recordUnitCorrection === 'function') recorded = await store.recordUnitCorrection(id, correction, flag);
  else {
    // A store without the v3 method can append but cannot lower a status.
    const fresh = (await store.getUnits([id]))[0];
    if (fresh) {
      const next = { ...fresh, provenance: { ...fresh.provenance, corrections: [...(fresh.provenance.corrections ?? []), correction] } };
      await store.putUnits([next]);
      recorded = { unit: next, statusChanged: false };
    }
  }
  if (!recorded) throw new Refusal(404, 'no-such-unit', 'There is no unit with that id.');
  return respond(200, {
    unit: recorded.unit, provenance: provenanceOf(recorded.unit.provenance), statusChanged: recorded.statusChanged,
    ...(result ? { result } : {}),
  });
});

// Several units in one call (audit PF-02): GoReview's intake needs the unit, relations and analyses of every testable candidate; one request per
// candidate made 201 round trips for 200 candidates. Same view as `GET /units/:id`; an unknown id is listed in `missing`, never an error.
route('POST', '/units/batch', true, async (ctx) => {
  const b = await ctx.body();
  if (!Array.isArray(b.ids) || b.ids.length === 0 || b.ids.length > MAX_UNITS_PER_BATCH || b.ids.some((i) => !isStr(i) || i.length > 300)) {
    throw invalid(`"ids" must be a list of 1 to ${MAX_UNITS_PER_BATCH} unit ids.`);
  }
  const units: Record<string, { unit: unknown; relations: unknown; analyses: unknown; provenance: unknown }> = {};
  const missing: string[] = [];
  for (const id of [...new Set(b.ids as string[])]) {
    const view = await ctx.deps.linguistics.lookup(id);
    if (view) units[id] = { unit: view.unit, relations: view.relations, analyses: view.analyses, provenance: provenanceOf(view.unit.provenance) }; else missing.push(id);
  }
  return respond(200, { units, missing });
});

route('POST', '/lookup', true, async (ctx) => {
  const b = await ctx.body();
  assertSelf(ctx, b.learnerId);
  if (!isStr(b.languageId)) throw invalid('"languageId" is required.');
  if (!isStr(b.surface) || b.surface.length > MAX_SURFACE_CHARS) throw invalid(`"surface" is required (at most ${MAX_SURFACE_CHARS} characters).`);
  if (b.sentence !== undefined && (typeof b.sentence !== 'string' || b.sentence.length > 5000)) throw invalid('"sentence" must be a string of at most 5000 characters.');
  if (b.sentenceKey !== undefined && (typeof b.sentenceKey !== 'string' || b.sentenceKey.length > 200)) throw invalid('"sentenceKey" must be a string of at most 200 characters.');
  for (const k of ['selStart', 'selEnd'] as const) if (b[k] !== undefined && (typeof b[k] !== 'number' || !Number.isInteger(b[k]) || (b[k] as number) < 0)) throw invalid(`"${k}" must be a whole number from 0.`);
  const sentence = b.sentence as string | undefined;
  // The sentence is passed through to the analyser and goes no further: only its hash is kept anywhere.
  const sentenceKey = (b.sentenceKey as string | undefined) ?? (sentence ? ctx.deps.crypto.sha256(sentence) : undefined);
  const result = await ctx.deps.linguistics.resolveAndStore({
    languageId: b.languageId, surface: b.surface,
    ...(sentence !== undefined ? { sentence } : {}), ...(sentenceKey !== undefined ? { sentenceKey } : {}),
    ...(typeof b.selStart === 'number' ? { selStart: b.selStart } : {}), ...(typeof b.selEnd === 'number' ? { selEnd: b.selEnd } : {}),
  });
  await stampLookup(ctx, result);
  return respond(200, { formId: result.formId, units: result.units, relations: result.relations, analysis: result.analysis ?? null, sentenceKey: sentenceKey ?? null });
});

// ── events and learner state ──

route('POST', '/events', true, async (ctx) => {
  const b = await ctx.body();
  assertSelf(ctx, b.learnerId);
  const events = await prepareEvents(ctx, b.events, 'POST /events');
  const { store } = ctx.deps;
  const outcomes = await store.append(ctx.session.learnerId, events);
  await registerSurfaces(ctx, events);
  const projected = await project(ctx);
  return respond(200, { outcomes, ...tally(outcomes), head: await store.head(ctx.session.learnerId), projected });
});

const tally = (outcomes: AppendOutcome[]): { stored: number; duplicates: number } => ({
  stored: outcomes.filter((o) => o.stored).length, duplicates: outcomes.filter((o) => !o.stored && o.duplicateOf !== undefined).length,
});

route('GET', '/events', true, async (ctx) => {
  assertSelf(ctx, ctx.query.get('learnerId') ?? undefined);
  const since = ctx.query.get('since');
  if (since && !isIso(since)) throw new Refusal(422, 'invalid-query', '"since" must be a date and time.');
  const learnerId = ctx.session.learnerId;
  const events = await ctx.deps.store.list({
    learnerId,
    afterSeq: intParam(ctx.query, 'afterSeq', { def: 0, min: 0, max: Number.MAX_SAFE_INTEGER }),
    limit: intParam(ctx.query, 'limit', { def: 200, min: 1, max: MAX_PAGE, clamp: true }),
    ...(listParam(ctx.query, 'kinds', 50) ? { kinds: listParam(ctx.query, 'kinds', 50) } : {}),
    ...(ctx.query.get('unitId') ? { unitId: ctx.query.get('unitId') as string } : {}),
    ...(ctx.query.get('languageId') ? { languageId: ctx.query.get('languageId') as string } : {}),
    ...(since ? { since } : {}),
  });
  return respond(200, { events, head: await ctx.deps.store.head(learnerId) });
});

route('GET', '/knowledge', true, async (ctx) => {
  assertSelf(ctx, ctx.query.get('learnerId') ?? undefined);
  const unitIds = listParam(ctx.query, 'unitIds', 200);
  return respond(200, { knowledge: await ctx.deps.engine.knowledge(ctx.session.learnerId, unitIds) });
});

route('GET', '/vocabulary', true, async (ctx) => {
  assertSelf(ctx, ctx.query.get('learnerId') ?? undefined);
  const languageId = ctx.query.get('languageId');
  if (!languageId || languageId.length > 200) throw new Refusal(422, 'invalid-query', 'A languageId of at most 200 characters is required.');
  const level = ctx.query.get('level') ?? undefined;
  if (level && !(KNOWLEDGE_LEVELS as readonly string[]).includes(level)) throw new Refusal(422, 'invalid-query', 'The level is not a known knowledge level.');
  const search = (ctx.query.get('search') ?? '').trim();
  if (search.length > 120) throw new Refusal(422, 'invalid-query', 'Search is limited to 120 characters.');
  const limit = intParam(ctx.query, 'limit', { def: 50, min: 1, max: 100, clamp: true });
  const after = ctx.query.get('after') ?? undefined;
  if (after && after.length > 300) throw new Refusal(422, 'invalid-query', 'The cursor is too long.');
  const minEncounters = intParam(ctx.query, 'minEncounters', { def: 0, min: 0, max: 1_000_000, clamp: true });
  const dateFilters = ['firstEncounterFrom', 'firstEncounterTo', 'lastEncounterFrom', 'lastEncounterTo'] as const;
  const dates: Partial<Record<(typeof dateFilters)[number], string>> = {};
  for (const key of dateFilters) {
    const value = ctx.query.get(key) ?? undefined;
    if (value !== undefined) {
      if (!isIso(value)) throw new Refusal(422, 'invalid-query', `"${key}" must be an ISO date.`);
      dates[key] = value;
    }
  }
  const boolFilter = (key: 'requiresAssistance' | 'unresolved'): boolean | undefined => {
    const value = ctx.query.get(key);
    if (value === null) return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Refusal(422, 'invalid-query', `"${key}" must be true or false.`);
  };
  const requiresAssistance = boolFilter('requiresAssistance');
  const unresolved = boolFilter('unresolved');
  const reviewStatus = ctx.query.get('reviewStatus') ?? undefined;
  if (reviewStatus && !['none', 'active', 'suspended'].includes(reviewStatus)) throw new Refusal(422, 'invalid-query', '"reviewStatus" must be none, active, or suspended.');
  const sourceRef = ctx.query.get('sourceRef') ?? undefined;
  if (sourceRef !== undefined && (!sourceRef.length || sourceRef.length > 2048)) throw new Refusal(422, 'invalid-query', '"sourceRef" must be a non-empty reference value of at most 2048 characters.');
  const { store, engine } = ctx.deps;
  const learnerId = ctx.session.learnerId;
  await engine.knowledge(learnerId, []); // ensure the projection and alias re-keying are current
  let catalog = store.getEncounteredKnowledgeStats ? await store.getEncounteredKnowledgeStats(learnerId, languageId) : undefined;
  if (!catalog) {
    const rows = (await store.getKnowledge(learnerId)).filter((r) => r.languageId === languageId && r.encounters > 0);
    const counts = { new: 0, seen: 0, recognized: 0, familiar: 0, known: 0, automatic: 0 };
    for (const r of rows) counts[r.level]++;
    catalog = { total: rows.length, counts };
  }
  const matches: Array<{ knowledge: import('../../repository-contract/src').UnitKnowledge; unit?: LinguisticUnit; surfaceForms: string[]; lastEncounter?: string; firstEncounter?: string; reviewStatus?: 'none' | 'active' | 'suspended'; sources: SourceRef[] }> = [];
  let cursor = after ?? '';
  let hasMore = false;
  const pageSize = Math.max(100, limit);
  while (matches.length < limit) {
    const rows = store.getKnowledgePage
      ? await store.getKnowledgePage(learnerId, { languageId, after: cursor || undefined, limit: pageSize, sourceRef })
      : (await store.getKnowledge(learnerId)).filter((r) => r.languageId === languageId && r.unitId > cursor).slice(0, pageSize);
    if (!rows.length) break;
    const encountered = rows.filter((r) => r.encounters > 0 && (!level || r.level === level));
    const units = await store.getUnits(encountered.map((r) => r.unitId));
    const unitsById = new Map(units.map((u) => [u.unitId, u]));
    const pageIds = encountered.map((r) => r.unitId);
    const aliases = [...await store.aliasesFor(pageIds), ...(store.aliasesTo ? await store.aliasesTo(pageIds) : [])];
    const aliasUnits = await store.getUnits([...new Set(aliases.flatMap((a) => [a.oldId, a.newId]))]);
    const aliasLabels = new Map(aliasUnits.map((u) => [u.unitId, u.label]));
    let summaries: Array<{ unitId: string; event: StoredEvent }>;
    if (store.listEncounterSummaries) summaries = await store.listEncounterSummaries(learnerId, languageId, pageIds, 25);
    else {
      summaries = [];
      for (const unitId of pageIds) {
        const events = await store.list({ learnerId, languageId, unitId, kinds: ['EncounterRecorded', 'SelectionLookedUp', 'AssistanceRequested'], limit: 25, order: 'desc' });
        summaries.push(...events.map((event) => ({ unitId, event })));
      }
    }
    const summariesByUnit = new Map<string, typeof summaries>();
    for (const summary of summaries) summariesByUnit.set(summary.unitId, [...(summariesByUnit.get(summary.unitId) ?? []), summary]);
    const assistanceIds = new Set(store.listAssistanceRequestedUnitIds
      ? await store.listAssistanceRequestedUnitIds(learnerId, languageId, pageIds)
      : summaries.filter((summary) => summary.event.kind === 'AssistanceRequested').map((summary) => summary.unitId));
    const dateRanges = store.getEncounterDateRanges ? await store.getEncounterDateRanges(learnerId, languageId, pageIds) : [];
    const datesByUnit = new Map(dateRanges.map((x) => [x.unitId, x]));
    const reviewSummaries = store.listReviewStatusSummaries ? await store.listReviewStatusSummaries(learnerId, languageId, pageIds) : [];
    const reviewByUnit = new Map<string, typeof reviewSummaries>();
    for (const summary of reviewSummaries) reviewByUnit.set(summary.unitId, [...(reviewByUnit.get(summary.unitId) ?? []), summary]);
    for (const knowledge of rows) {
      cursor = knowledge.unitId;
      if (knowledge.encounters <= 0 || (level && knowledge.level !== level)) continue;
      const unit = unitsById.get(knowledge.unitId);
      const relatedAliases = aliases.filter((a) => a.oldId === knowledge.unitId || a.newId === knowledge.unitId);
      const surfaceForms = [...new Set([unit?.label, ...relatedAliases.flatMap((a) => [aliasLabels.get(a.oldId), aliasLabels.get(a.newId)])].filter((x): x is string => !!x))].slice(0, 20);
      let lastEncounter: string | undefined;
      const sources = new Map<string, SourceRef>();
      for (const { event: e } of summariesByUnit.get(knowledge.unitId) ?? []) {
        if (e.kind === 'EncounterRecorded' || e.kind === 'SelectionLookedUp' || e.kind === 'AssistanceRequested') {
          if (!lastEncounter || Date.parse(e.at) > Date.parse(lastEncounter)) lastEncounter = e.at;
        }
        if (e.kind === 'EncounterRecorded' || e.kind === 'SelectionLookedUp') {
          const surface = (e.payload as { surface?: unknown }).surface;
          if (typeof surface === 'string' && !surfaceForms.includes(surface) && surfaceForms.length < 20) surfaceForms.push(surface);
        }
        if (e.subject.sourceRef && sources.size < 10) sources.set(JSON.stringify(e.subject.sourceRef), e.subject.sourceRef);
      }
      const range = datesByUnit.get(knowledge.unitId);
      const firstEncounter = range?.firstEncounter;
      const exactLastEncounter = range?.lastEncounter ?? lastEncounter;
      const perCard = reviewByUnit.get(knowledge.unitId) ?? [];
      const cardStates = perCard.map(({ event }) => {
        if (event.kind === 'CardAdded') return 'active';
        if (event.kind === 'ReviewItemInvalidated') return 'suspended';
        const reason = (event.payload as Record<string, unknown>).reason;
        return reason === 'suspended' ? 'suspended' : reason === 'dismissed' ? 'none' : 'active';
      });
      const currentReviewStatus: 'none' | 'active' | 'suspended' = cardStates.includes('active') ? 'active' : cardStates.includes('suspended') ? 'suspended' : 'none';
      if (knowledge.encounters < minEncounters) continue;
      if (dates.firstEncounterFrom && (!firstEncounter || Date.parse(firstEncounter) < Date.parse(dates.firstEncounterFrom))) continue;
      if (dates.firstEncounterTo && (!firstEncounter || Date.parse(firstEncounter) > Date.parse(dates.firstEncounterTo))) continue;
      if (dates.lastEncounterFrom && (!exactLastEncounter || Date.parse(exactLastEncounter) < Date.parse(dates.lastEncounterFrom))) continue;
      if (dates.lastEncounterTo && (!exactLastEncounter || Date.parse(exactLastEncounter) > Date.parse(dates.lastEncounterTo))) continue;
      const assisted = assistanceIds.has(knowledge.unitId);
      if (requiresAssistance !== undefined && assisted !== requiresAssistance) continue;
      const status = knowledge.analysisStatus ?? unit?.status;
      const isUnresolved = status !== 'verified' && status !== 'high-confidence';
      if (unresolved !== undefined && isUnresolved !== unresolved) continue;
      if (reviewStatus && currentReviewStatus !== reviewStatus) continue;
      const haystack = [unit?.label, ...surfaceForms].filter(Boolean).join('\n').normalize('NFC').toLowerCase();
      if (search && !haystack.includes(search.normalize('NFC').toLowerCase())) continue;
      matches.push({ knowledge, ...(unit ? { unit } : {}), surfaceForms, ...(firstEncounter ? { firstEncounter } : {}), ...(exactLastEncounter ? { lastEncounter: exactLastEncounter } : {}), reviewStatus: currentReviewStatus, sources: [...sources.values()] });
      if (matches.length >= limit) { hasMore = true; break; }
    }
    if (rows.length < pageSize) break;
    hasMore = true;
  }
  return respond(200, { items: matches, catalog, ...(hasMore ? { nextCursor: cursor } : {}) });
});

route('GET', '/candidates', true, async (ctx) => {
  assertSelf(ctx, ctx.query.get('learnerId') ?? undefined);
  const enrolmentId = ctx.query.get('enrolmentId');
  if (!enrolmentId) throw new Refusal(422, 'invalid-query', '"enrolmentId" is required.');
  // Enrolments are listed per learner, so another learner's enrolment is indistinguishable from a missing one.
  if (!(await ctx.deps.store.listEnrolments(ctx.session.learnerId)).some((e) => e.enrolmentId === enrolmentId)) {
    throw new Refusal(404, 'no-such-enrolment', 'You have no enrolment with that id.');
  }
  const limit = intParam(ctx.query, 'limit', { def: 20, min: 1, max: 200, clamp: true });
  return respond(200, { candidates: await ctx.deps.engine.candidates(ctx.session.learnerId, enrolmentId, { limit, now: ctx.now() }) });
});

route('GET', '/preferences', true, async (ctx) => {
  assertSelf(ctx, ctx.query.get('learnerId') ?? undefined);
  const preferences: AssistancePreferences = await ctx.deps.engine.preferences(ctx.session.learnerId, ctx.query.get('languageId') || undefined);
  return respond(200, { preferences });
});

route('POST', '/reviews', true, async (ctx) => {
  const b = await ctx.body();
  assertSelf(ctx, b.learnerId);
  const events = await prepareEvents(ctx, b.events, 'POST /reviews', { families: ['review', 'listening'] });
  const outcomes = await ctx.deps.store.append(ctx.session.learnerId, events);
  const projected = await project(ctx);
  return respond(200, { outcomes, ...tally(outcomes), head: await ctx.deps.store.head(ctx.session.learnerId), projected });
});

// ── writing and private documents ──

type PutOutcome = { ok: true } | { ok: false; current?: PrivateDocument; missing: boolean };

/**
 * The store's revision rule, with one case answered here instead of thrown: a revision above 0 names a document that does
 * not exist (a guess at someone's revision number, a server that lost the document). The store throws for that; it must
 * never become a 500, and in a sync push never fail the other items of the request.
 */
async function putUnderRevision(ctx: Ctx, doc: PrivateDocument, expectedRevision: number, deleted = false): Promise<PutOutcome> {
  const { store } = ctx.deps;
  const absent = async (): Promise<boolean> => !(await store.getDocument(doc.learnerId, doc.docId));
  if (deleted) {
    // A deletion made on a device (audit P-04): the same revision rule, then the store's own deletion (body and title gone, `deletedAt` set, revision + 1).
    const cur = await store.getDocument(doc.learnerId, doc.docId);
    if (!cur) return expectedRevision > 0 ? { ok: false, missing: true } : { ok: true };
    if (cur.deletedAt) return { ok: true };
    if (cur.revision !== expectedRevision) return { ok: false, current: cur, missing: false };
    await store.deleteDocument(doc.learnerId, doc.docId);
    return { ok: true };
  }
  if (expectedRevision > 0 && (await absent())) return { ok: false, missing: true };
  try {
    const r = await store.putDocument(doc, expectedRevision);
    return r.ok ? { ok: true } : { ok: false, current: r.current, missing: false };
  } catch (e) {
    if (expectedRevision > 0 && (await absent())) return { ok: false, missing: true };
    throw e;
  }
}

/** Puts the document under the revision rule; a mismatch throws the 409 (inside a transaction, that rolls back). */
async function saveDocument(ctx: Ctx, input: DocumentInput): Promise<PrivateDocument> {
  const r = await putUnderRevision(ctx, input.doc, input.expectedRevision, input.deleted);
  if (!r.ok && r.missing) throw new Refusal(409, 'conflict', 'There is no such document at that revision. Save it as a new document (expectedRevision 0).', { reason: 'no-such-document' });
  if (!r.ok) throw new Refusal(409, 'conflict', 'The document changed since you last read it. Merge your changes into the current version and save again.', { current: r.current });
  return input.doc;
}

route('POST', '/writing', true, async (ctx) => {
  const b = await ctx.body();
  assertSelf(ctx, b.learnerId);
  if (!isObj(b.observation)) throw invalid('"observation" (a ProductionRecorded event) is required.');
  const [event] = await prepareEvents(ctx, [b.observation], 'POST /writing');
  if (event.kind !== 'ProductionRecorded') throw new Refusal(422, 'invalid-events', 'POST /writing takes a ProductionRecorded observation.', { issues: [{ index: 0, issues: [{ path: 'kind', message: 'ProductionRecorded required' }] }] });
  const input = b.document === undefined ? undefined : parseDocument(ctx, b.document, 'POST /writing document');
  const { store } = ctx.deps;
  const result = await store.transaction(async () => {
    const doc = input ? await saveDocument(ctx, input) : undefined;
    const outcomes = await store.append(ctx.session.learnerId, [event]);
    return { doc, outcomes };
  });
  const projected = await project(ctx);
  return respond(200, { outcome: result.outcomes[0], ...(result.doc ? { document: meta(result.doc) } : {}), projected });
});

route('GET', '/documents', true, async (ctx) => {
  assertSelf(ctx, ctx.query.get('learnerId') ?? undefined);
  const docs = (await ctx.deps.store.listDocuments(ctx.session.learnerId)).filter((d) => !d.deletedAt);
  return respond(200, { documents: docs.map(meta) });
});

route('GET', '/documents/:id', true, async (ctx) => {
  assertSelf(ctx, ctx.query.get('learnerId') ?? undefined);
  const doc = await ctx.deps.store.getDocument(ctx.session.learnerId, ctx.params.id);
  if (!doc || doc.deletedAt) throw new Refusal(404, 'no-such-document', 'You have no document with that id.');
  return respond(200, { document: doc });
});

route('PUT', '/documents/:id', true, async (ctx) => {
  const b = await ctx.body();
  assertSelf(ctx, b.learnerId);
  const input = parseDocument(ctx, b, 'PUT /documents', ctx.params.id);
  const doc = await saveDocument(ctx, input);
  return respond(200, { document: meta(doc) });
});

route('DELETE', '/documents/:id', true, async (ctx) => {
  assertSelf(ctx, ctx.query.get('learnerId') ?? undefined);
  const doc = await ctx.deps.store.getDocument(ctx.session.learnerId, ctx.params.id);
  if (!doc || doc.deletedAt) throw new Refusal(404, 'no-such-document', 'You have no document with that id.');
  await ctx.deps.store.deleteDocument(ctx.session.learnerId, ctx.params.id);
  return respond(204);
});

// ── corrections ──

route('POST', '/corrections', true, async (ctx) => {
  const b = await ctx.body();
  assertSelf(ctx, b.learnerId);
  if (!isStr(b.formId) || b.formId.length > 300) throw invalid('"formId" is required.');
  if (b.lexemeId !== undefined && !isStr(b.lexemeId)) throw invalid('"lexemeId" must be a unit id.');
  if (b.reason !== undefined && (typeof b.reason !== 'string' || b.reason.length > 1000)) throw invalid('"reason" must be a string of at most 1000 characters.');
  if (b.sentenceKey !== undefined && (typeof b.sentenceKey !== 'string' || b.sentenceKey.length > 200)) throw invalid('"sentenceKey" must be a string of at most 200 characters.');
  if (b.features !== undefined && (!isObj(b.features) || Object.values(b.features).some((v) => typeof v !== 'string'))) throw invalid('"features" must map feature names to strings.');
  if (b.lexemeId === undefined && b.features === undefined) throw invalid('A correction needs a "lexemeId" or "features".');
  const { store, linguistics } = ctx.deps;
  const learnerId = ctx.session.learnerId;
  const languageId = typeof b.languageId === 'string' ? b.languageId : /^form:([^:]+):/.exec(b.formId)?.[1];
  const enrolments = await store.listEnrolments(learnerId);
  const enrolment = isStr(b.enrolmentId) ? enrolments.find((e) => e.enrolmentId === b.enrolmentId) : enrolments.filter((e) => e.languageId === languageId && !e.endedAt).at(-1);
  if (!enrolment) throw new Refusal(422, 'no-enrolment', 'A correction is recorded against one of your enrolments; enrol in the language first.');
  const at = ctx.now();
  const result = await linguistics.correct(b.formId, {
    by: 'learner', learnerId,
    ...(typeof b.lexemeId === 'string' ? { lexemeId: b.lexemeId } : {}),
    ...(b.features ? { features: b.features as Record<string, string> } : {}),
    ...(typeof b.reason === 'string' ? { reason: b.reason } : {}),
    ...(typeof b.sentenceKey === 'string' ? { sentenceKey: b.sentenceKey } : {}),
  }, at);
  const event: GoEvent = {
    id: uuid(), v: CONTRACT_VERSION, learnerId, enrolmentId: enrolment.enrolmentId, languageId: enrolment.languageId, at,
    producer: { app: 'repository', version: String(SERVICE_VERSION), deviceId: ctx.session.deviceId },
    kind: 'AnalysisCorrected', subject: { itemIds: [b.formId] },
    payload: {
      formId: b.formId, by: 'learner',
      ...(result.analysis ? { analysisId: result.analysis.analysisId } : {}),
      ...(typeof b.lexemeId === 'string' ? { correctedLexemeId: b.lexemeId } : {}),
      ...(b.features ? { correctedFeatures: b.features } : {}),
      ...(typeof b.reason === 'string' ? { reason: b.reason } : {}),
    },
  };
  const [outcome] = await store.append(learnerId, [event]);
  const projected = await project(ctx);
  return respond(200, { result, outcome, projected });
});

// ── sync ──

route('POST', '/sync/push', true, async (ctx) => {
  const b = await ctx.body();
  assertSelf(ctx, b.learnerId);
  if (!isStr(b.deviceId)) throw invalid('"deviceId" is required.');
  if (b.deviceId !== ctx.session.deviceId) throw new Refusal(403, 'not-your-device', 'This session belongs to a different device.');
  if (!isIso(b.clientTime)) throw invalid('"clientTime" must be an ISO date and time.');
  const events = b.events === undefined || (Array.isArray(b.events) && b.events.length === 0) ? [] : await prepareEvents(ctx, b.events, 'POST /sync/push', undefined, Date.parse(b.clientTime as string));
  let docs: DocumentInput[] = [];
  if (b.documents !== undefined) {
    if (!Array.isArray(b.documents) || b.documents.length > MAX_DOCUMENTS_PER_PUSH) throw invalid(`"documents" must be a list of at most ${MAX_DOCUMENTS_PER_PUSH}.`);
    docs = b.documents.map((d, i) => parseDocument(ctx, d, `documents[${i}]`, undefined, true));
  }
  const { store } = ctx.deps;
  const learnerId = ctx.session.learnerId;
  const serverTime = ctx.now();
  const result = await store.transaction(async () => {
    const outcomes = events.length ? await store.append(learnerId, events) : [];
    await registerSurfaces(ctx, events);
    const documents: SyncPushResponse['documents'] = [];
    // One impossible document is that document's failure, not the request's: the events and the other documents still go through.
    for (const d of docs) {
      try {
        const r = await putUnderRevision(ctx, d.doc, d.expectedRevision, d.deleted);
        documents.push(r.ok ? { docId: d.doc.docId, ok: true } : r.missing ? { docId: d.doc.docId, ok: false, reason: 'no-such-document' } : { docId: d.doc.docId, ok: false, current: r.current });
      } catch {
        documents.push({ docId: d.doc.docId, ok: false, reason: 'refused' });
      }
    }
    const device = await store.getDevice(learnerId, ctx.session.deviceId);
    await store.putDevice({ ...(device ?? { deviceId: ctx.session.deviceId, learnerId, registeredAt: serverTime }), lastSyncAt: serverTime });
    return { outcomes, documents };
  });
  await project(ctx);
  const response: SyncPushResponse = {
    outcomes: result.outcomes, documents: result.documents, serverTime,
    clockSkewMs: Date.parse(b.clientTime as string) - Date.parse(serverTime), head: await store.head(learnerId),
  };
  return respond(200, response);
});

route('POST', '/sync/pull', true, async (ctx) => {
  const b = await ctx.body();
  assertSelf(ctx, b.learnerId);
  if (!isStr(b.deviceId)) throw invalid('"deviceId" is required.');
  if (b.deviceId !== ctx.session.deviceId) throw new Refusal(403, 'not-your-device', 'This session belongs to a different device.');
  if (typeof b.afterSeq !== 'number' || !Number.isInteger(b.afterSeq) || b.afterSeq < 0) throw invalid('"afterSeq" must be a whole number from 0.');
  if (b.limit !== undefined && (typeof b.limit !== 'number' || !Number.isInteger(b.limit) || b.limit < 1)) throw invalid('"limit" must be a positive whole number.');
  if (b.documentsSince !== undefined && !isIso(b.documentsSince)) throw invalid('"documentsSince" must be an ISO date and time.');
  const { store } = ctx.deps;
  const learnerId = ctx.session.learnerId;
  const events: StoredEvent[] = await store.list({ learnerId, afterSeq: b.afterSeq, limit: Math.min(b.limit ?? MAX_PAGE, MAX_PAGE) });
  const since = typeof b.documentsSince === 'string' ? Date.parse(b.documentsSince) : undefined;
  // Deleted documents travel too (body gone, `deletedAt` set), so the other devices can drop them.
  // `>=`: a document written in the same millisecond as the device's cursor, after it pulled, must still arrive (audit P-05). The client keeps
  // the newest revision per document, so a document it already holds is delivered again harmlessly.
  const documents = (await store.listDocuments(learnerId)).filter((d) => since === undefined || Date.parse(d.updatedAt) >= since);
  const response: SyncPullResponse = { events, documents, head: await store.head(learnerId), serverTime: ctx.now() };
  return respond(200, response);
});

// ── export, tombstones ──

async function buildExport(ctx: Ctx): Promise<unknown> {
  const { store } = ctx.deps;
  const learnerId = ctx.session.learnerId;
  const events: StoredEvent[] = [];
  for (let afterSeq = 0; ;) {
    const page = await store.list({ learnerId, afterSeq, limit: MAX_PAGE });
    events.push(...page);
    if (page.length < MAX_PAGE) break;
    afterSeq = page[page.length - 1].seq;
  }
  const [learner, account, enrolments, knowledge, documents, tombstones, device] = await Promise.all([
    store.getLearner(learnerId), currentAccount(ctx), store.listEnrolments(learnerId), store.getKnowledge(learnerId), store.listDocuments(learnerId),
    store.listTombstones(learnerId), store.getDevice(learnerId, ctx.session.deviceId),
  ]);
  const preferences: AssistancePreferences[] = [];
  for (const lang of [undefined, ...new Set(enrolments.map((e) => e.languageId))]) {
    const p = await store.getPreferences(learnerId, lang);
    if (p && !preferences.some((q) => q.languageId === p.languageId)) preferences.push(p);
  }
  // Provenance of the shared-layer units the learner's events refer to (contract v3, P-12): the learner's copy of "why does the app say this".
  // The linguistic tables themselves are not the learner's data, are not erased by DELETE /me and are not restored by an import.
  const unitIds = [...new Set(events.flatMap((e) => e.subject.itemIds ?? []))].sort();
  const unitProvenance = [];
  for (let i = 0; i < unitIds.length; i += 500) {
    for (const u of await store.getUnits(unitIds.slice(i, i + 500))) {
      unitProvenance.push({ unitId: u.unitId, kind: u.kind, languageId: u.languageId, label: u.label, status: u.status, provenance: provenanceOf(u.provenance) });
    }
  }
  unitProvenance.sort((a, b) => (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0));
  return {
    // The store package's export shape (`exportLearner`) plus the account and the contract version, so `importLearner` accepts this file as it is (audit P-01).
    // `devices` keeps the full device objects (a superset of the store's list of ids; the importer does not read it).
    format: EXPORT_FORMAT, contractVersion: CONTRACT_VERSION, exportedAt: ctx.now(), learnerId,
    learner, account: accountView(account), devices: device ? [device] : [],
    enrolments, events, knowledge, preferences, documents, tombstones, unitProvenance,
  };
}

route('GET', '/export', true, async (ctx) => {
  assertSelf(ctx, ctx.query.get('learnerId') ?? undefined);
  const exported = ctx.deps.exporter ? await ctx.deps.exporter(ctx.session.learnerId) : await buildExport(ctx);
  return respond(200, exported, { 'Content-Disposition': 'attachment; filename="go-repository-export.json"' });
});

function parseScope(raw: unknown): Tombstone['scope'] {
  if (!isObj(raw)) throw invalid('"scope" is required: {kind:"learner"}, {kind:"source",sourceRef}, {kind:"range",from,to} or {kind:"event",id}.');
  switch (raw.kind) {
    case 'learner': return { kind: 'learner' };
    case 'event':
      if (!isStr(raw.id)) throw invalid('scope.id is required for an event tombstone.');
      return { kind: 'event', id: raw.id };
    case 'range':
      if (!isIso(raw.from) || !isIso(raw.to)) throw invalid('scope.from and scope.to must be ISO dates and times.');
      return { kind: 'range', from: raw.from, to: raw.to };
    case 'source': {
      const r = raw.sourceRef;
      if (!isObj(r) || !isStr(r.kind)) throw invalid('scope.sourceRef.kind is required for a source tombstone.');
      return { kind: 'source', sourceRef: { kind: r.kind, ...(typeof r.title === 'string' ? { title: r.title } : {}), ...(typeof r.locator === 'string' ? { locator: r.locator } : {}) } };
    }
    default: throw invalid('scope.kind must be learner, source, range or event.');
  }
}

route('POST', '/tombstones', true, async (ctx) => {
  const b = await ctx.body();
  assertSelf(ctx, b.learnerId);
  const scope = parseScope(b.scope);
  if (b.reason !== undefined && (typeof b.reason !== 'string' || b.reason.length > 1000)) throw invalid('"reason" must be a string of at most 1000 characters.');
  const tombstone: Tombstone = { tombstoneId: uuid(), learnerId: ctx.session.learnerId, scope, createdAt: ctx.now(), ...(typeof b.reason === 'string' ? { reason: b.reason } : {}) };
  const { store } = ctx.deps;
  // A learner-scope tombstone is a recorded request only: erasing a whole account is `DELETE /me`, which asks for the email first.
  if (scope.kind === 'learner') {
    await store.putTombstone(tombstone);
    return respond(201, { tombstone, applied: { events: 0, knowledge: 0 } });
  }
  // event / source / range: record the instruction, then physically remove what it names (one transaction), then refold the projection.
  const applier = (store as Partial<TombstoneApplier>).applyTombstone;
  if (typeof applier !== 'function') throw new Refusal(501, 'deletion-unsupported', 'This Repository cannot delete events, so the instruction was not recorded.');
  let result: { events: number; knowledge: number };
  try { result = await applier.call(store, tombstone); } catch { throw invalid('That deletion could not be applied (a range needs "from" no later than "to").'); }
  await project(ctx);
  return respond(201, { tombstone, applied: { events: result.events, knowledge: result.knowledge } });
});

// ───────────────────────────── dispatch ─────────────────────────────

function match(pattern: string[], parts: string[]): Record<string, string> | undefined {
  if (pattern.length !== parts.length) return undefined;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i].startsWith(':')) params[pattern[i].slice(1)] = parts[i];
    else if (pattern[i] !== parts[i]) return undefined;
  }
  return params;
}

async function authenticate(request: Request, deps: ServiceDeps, now: string): Promise<Session> {
  const header = request.headers.get('authorization');
  const m = header ? /^Bearer[ \t]+(.+)$/i.exec(header.trim()) : null;
  const token = m ? m[1].trim() : '';
  const unauthorized = new Refusal(401, 'unauthorized', MESSAGES.unauthorized);
  if (!token) throw unauthorized;
  const hash = deps.crypto.sha256(token);
  const found = await deps.store.getSessionByTokenHash(hash);
  if (!found) throw unauthorized;
  // The lookup is by digest of a 256-bit secret; if the store hands the digest back, it is compared in constant time as well.
  const stored = (found as Session & { tokenHash?: string }).tokenHash;
  if (stored !== undefined && !constantTimeEqual(stored, hash)) throw unauthorized;
  if (found.revokedAt || !(Date.parse(found.expiresAt) > Date.parse(now))) throw unauthorized;
  const account = await deps.store.getAccount(found.accountId);
  if (!account || account.disabledAt) throw unauthorized;
  return { sessionId: found.sessionId, accountId: found.accountId, learnerId: found.learnerId, deviceId: found.deviceId, createdAt: found.createdAt, expiresAt: found.expiresAt };
}

async function dispatch(request: Request, deps: ServiceDeps): Promise<Response> {
  const now = deps.now ?? ((): string => new Date().toISOString());
  const method = request.method;
  const url = new URL(request.url);
  if (method === 'OPTIONS') return respond(204);
  let parts: string[];
  try { parts = url.pathname.split('/').filter((p) => p.length > 0).map(decodeURIComponent); } catch { throw new Refusal(404, 'not-found', MESSAGES.notFound); }

  let params: Record<string, string> | undefined;
  let found: Route | undefined;
  let pathMatched = false;
  for (const r of routes) {
    const p = match(r.path, parts);
    if (!p) continue;
    pathMatched = true;
    if (r.method === method) { found = r; params = p; break; }
  }
  if (!found || !params) throw pathMatched ? new Refusal(405, 'method-not-allowed', MESSAGES.method) : new Refusal(404, 'not-found', MESSAGES.notFound);

  let session: Session | undefined;
  if (found.auth) session = await authenticate(request, deps, now());

  let cached: Record<string, unknown> | undefined;
  const ctx: Ctx = {
    request, deps, query: url.searchParams, params, now,
    session: session as Session,
    body: async () => {
      if (cached) return cached;
      const raw = await readText(request);
      let parsed: unknown;
      try { parsed = raw.trim() === '' ? {} : JSON.parse(raw); } catch { throw new Refusal(400, 'invalid-json', MESSAGES.invalidJson); }
      if (!isObj(parsed)) throw new Refusal(422, 'invalid-input', 'The request body must be a JSON object.');
      if (nestedDeeperThan(parsed, MAX_BODY_DEPTH)) throw new Refusal(400, 'too-deeply-nested', `The request body is nested more than ${MAX_BODY_DEPTH} levels deep.`);
      cached = parsed;
      return parsed;
    },
  };
  return found.run(ctx);
}

/** Handle one request. Never throws: anything unexpected is a 500 without detail. One log line per request. */
export async function handle(request: Request, deps: ServiceDeps): Promise<Response> {
  const started = Date.now();
  let response: Response;
  try {
    response = await dispatch(request, deps);
  } catch (e) {
    if (e instanceof Refusal) {
      response = respond(e.status, { error: e.error, message: e.message, ...e.extra }, e.status === 401 ? { 'WWW-Authenticate': 'Bearer' } : e.status === 429 ? { 'Retry-After': '900' } : {});
    } else {
      // never the cause: it could hold a document, a header or a password
      response = respond(500, { error: 'server-error', message: MESSAGES.server });
    }
  }
  if (deps.log) {
    let path = '-';
    try { path = new URL(request.url).pathname; } catch { /* keep "-" */ }
    deps.log(`${request.method} ${path} ${response.status} ${Date.now() - started}ms`);
  }
  return response;
}

/** The event kinds the review route accepts, for clients. */
export const REVIEW_KINDS: readonly EventKind[] = [...EVENT_KINDS.review, ...EVENT_KINDS.listening];
