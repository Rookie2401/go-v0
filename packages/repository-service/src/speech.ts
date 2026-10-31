/** Account-authenticated speech endpoints backed by the shared, pure Azure speech handler. */
import { createRateLimiter, handleSpeechRequest, type SpeechEnv, type SpeechResponse } from '../../../server/speechHandler';
import { isPermittedAccountSpeechText } from './speechMaterial';
import type { SpeechService } from './deps';
import { CORS, Refusal, SECURITY_HEADERS, isObj, respond, type Ctx, type Handler } from './http';

const PATH = '/api/speech';
const DEFAULT_RATE_LIMIT = 30;
const DEFAULT_DAILY_LIMIT = 100_000;
const MAX_SPEECH_BODY_BYTES = 20 * 1024;

const limiters = new WeakMap<SpeechService, Map<number, ReturnType<typeof createRateLimiter>>>();

function limiterFor(service: SpeechService): ReturnType<typeof createRateLimiter> {
  const limit = service.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT;
  let byLimit = limiters.get(service);
  if (!byLimit) { byLimit = new Map(); limiters.set(service, byLimit); }
  let limiter = byLimit.get(limit);
  if (!limiter) { limiter = createRateLimiter({ limit, now: () => Date.now() }); byLimit.set(limit, limiter); }
  return limiter;
}

function speechEnv(service: SpeechService | undefined, internalAuth: string): SpeechEnv {
  const key = service?.key?.trim();
  const region = service?.region?.trim();
  return {
    ...(key ? { key } : {}), ...(region ? { region } : {}),
    // This random process-local value is never returned to a client. Repository authentication
    // already succeeded in handle(); the shared handler retains its standalone token guard.
    authToken: internalAuth,
    ...(service?.maxBodyBytes ? { maxBodyBytes: service.maxBodyBytes } : {}),
    ...(service?.maxTextChars ? { maxTextChars: service.maxTextChars } : {}),
    ...(service?.rateLimitPerMinute ? { rateLimitPerMinute: service.rateLimitPerMinute } : {}),
    ...(service?.upstreamTimeoutMs ? { upstreamTimeoutMs: service.upstreamTimeoutMs } : {}),
    dailyCharacterLimit: service?.dailyCharacterLimit ?? DEFAULT_DAILY_LIMIT,
  };
}

function toResponse(out: SpeechResponse): Response {
  const headers = new Headers({ ...CORS, ...SECURITY_HEADERS, 'Cache-Control': 'no-store' });
  headers.set('Access-Control-Expose-Headers', `${CORS['Access-Control-Expose-Headers']}, X-Speech-Provider-Version, X-Speech-Voice, X-Speech-Requested-Locale, X-Speech-Delivered-Locale`);
  for (const [name, value] of Object.entries(out.headers)) headers.set(name, value);
  let body: BodyInit | null;
  if (typeof out.body === 'string') body = out.body;
  else {
    const audio = new ArrayBuffer(out.body.byteLength);
    new Uint8Array(audio).set(out.body);
    body = audio;
  }
  return new Response(body, { status: out.status, headers });
}

async function readSpeechBody(request: Request): Promise<Record<string, unknown>> {
  const tooLarge = (): Refusal => new Refusal(413, 'too-large', 'That request is too large (the limit is 20 KB for this route).');
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_SPEECH_BODY_BYTES) {
    await request.body?.cancel().catch(() => undefined);
    throw tooLarge();
  }
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SPEECH_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw tooLarge();
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let parsed: unknown;
  const text = new TextDecoder().decode(bytes).trim();
  try { parsed = text ? JSON.parse(text) : {}; }
  catch { throw new Refusal(400, 'invalid-json', 'The request body is not valid JSON.'); }
  if (!isObj(parsed)) throw new Refusal(422, 'invalid-input', 'The request body must be a JSON object.');
  const stack: Array<[unknown, number]> = [[parsed, 1]];
  while (stack.length) {
    const [value, depth] = stack.pop()!;
    if (value === null || typeof value !== 'object') continue;
    if (depth > 24) throw new Refusal(400, 'too-deeply-nested', 'The request body is nested more than 24 levels deep.');
    for (const child of Array.isArray(value) ? value : Object.values(value)) if (child !== null && typeof child === 'object') stack.push([child, depth + 1]);
  }
  return parsed;
}

function credentialsPresent(env: SpeechEnv): boolean {
  return !!env.key && !!env.region && /^[a-z0-9-]{2,40}$/i.test(env.region);
}

function serviceFor(ctx: Ctx): SpeechService | undefined { return ctx.deps.speech; }

/** Current persisted consent, resolved by event time and seq, fails closed on store errors. */
async function remoteSpeechConsent(ctx: Ctx): Promise<boolean> {
  let events;
  try {
    events = await ctx.deps.store.list({
      learnerId: ctx.session.learnerId,
      kinds: ['ConsentGiven', 'ConsentWithdrawn'],
      order: 'desc',
      limit: 1000,
    });
  } catch {
    throw new Refusal(503, 'consent-unavailable', 'Remote speech permission could not be verified.');
  }
  let latest: typeof events[number] | undefined;
  for (const event of events) {
    const payload = event.payload as Record<string, unknown>;
    const keys = [payload.consent, payload.scope, payload.key].filter((v): v is string => typeof v === 'string');
    if (!keys.includes('remote-speech')) continue;
    if (!latest || Date.parse(event.at) > Date.parse(latest.at) || (event.at === latest.at && event.seq > latest.seq)) latest = event;
  }
  return latest?.kind === 'ConsentGiven';
}

async function dispatch(ctx: Ctx, path: string, query: Record<string, string | undefined> = {}, body?: Record<string, unknown>): Promise<Response> {
  const service = serviceFor(ctx);
  const internalAuth = ctx.deps.crypto.randomToken();
  const env = speechEnv(service, internalAuth);
  if (path !== `${PATH}/status` && !credentialsPresent(env)) {
    return respond(503, { error: 'missing-credentials', message: 'Speech is not configured on this service.' });
  }
  const requestBody = body === undefined ? undefined : JSON.stringify(body);
  // Repository authentication and CORS have already been enforced by the outer service. Don't
  // forward a page Origin into the localhost-oriented standalone proxy's stricter same-origin check.
  const result = await handleSpeechRequest({
    method: ctx.request.method,
    path,
    query,
    headers: { authorization: `Bearer ${internalAuth}`, host: 'repository.internal' },
    ...(requestBody === undefined ? {} : { body: requestBody }),
    remote: ctx.session.accountId,
    budgetKey: ctx.session.accountId,
    signal: ctx.request.signal,
  }, env, {
    fetch: service?.fetch ?? fetch,
    now: () => Date.now(),
    limiter: service ? limiterFor(service) : undefined,
  });
  return toResponse(result);
}

export const speechStatus: Handler = async (ctx) => dispatch(ctx, `${PATH}/status`);

export const speechVoices: Handler = async (ctx) => dispatch(ctx, `${PATH}/voices`, { lang: ctx.query.get('lang') ?? undefined });

export const speechSynthesize: Handler = async (ctx) => {
  if (!(await remoteSpeechConsent(ctx))) throw new Refusal(403, 'remote-speech-consent-required', 'Turn on remote speech consent before sending text to a speech service.');
  const body = await readSpeechBody(ctx.request);
  if (body.sourcePermission !== 'allowed') throw new Refusal(403, 'source-not-authorized', 'This text is not authorized for remote speech processing.');
  // Words are isolated; longer text must exactly match published language-pack material.
  // The caller's sourcePermission claim cannot expand this server-owned allowlist.
  if (typeof body.languageId !== 'string' || typeof body.locale !== 'string' || typeof body.kind !== 'string' || typeof body.text !== 'string' ||
      !isPermittedAccountSpeechText({ languageId: body.languageId, locale: body.locale, kind: body.kind, text: body.text })) {
    throw new Refusal(422, 'invalid-input', 'Account speech accepts isolated words or exact published pack phrases and sentences.');
  }
  return dispatch(ctx, `${PATH}/synthesize`, {}, body);
};
