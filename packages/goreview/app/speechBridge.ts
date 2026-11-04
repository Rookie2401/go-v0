import type { FetchLike, FetchResponseLike } from '../../golisten/src/ports';
import type { SpeechMessage, SpeechReply } from './speechProtocol';

export interface PracticeExtensionRuntime {
  id?: string;
  sendMessage(message: unknown): Promise<unknown>;
}
let bridgeSequence = 0;
const BRIDGE_TIMEOUT_MS: Record<SpeechMessage['op'], number> = { status: 8_000, voices: 8_000, synthesize: 25_000, cancel: 1_000 };

export function isTrustedPracticeUrl(href: string | undefined, runtimeId: string | undefined): boolean {
  if (!href || !runtimeId) return false;
  try {
    const u = new URL(href);
    return (u.protocol === 'chrome-extension:' || u.protocol === 'moz-extension:') && u.hostname === runtimeId &&
      u.pathname === '/review/index.html' && !u.search && !u.username && !u.password;
  } catch { return false; }
}

const response = (reply: SpeechReply, op: SpeechMessage['op']): FetchResponseLike => ({
  ok: reply.ok,
  status: reply.status,
  headers: { get: (name) => name.toLowerCase() === 'content-type' && op === 'synthesize' && reply.ok ? 'audio/wav' : 'application/json' },
  json: async () => reply.json ?? (reply.message ? {
    error: reply.status === 401 ? 'unauthorized'
      : reply.status === 422 ? 'invalid-input'
      : /missing.credentials|no working key/i.test(reply.message) ? 'missing-credentials'
        : /remote.speech consent/i.test(reply.message) ? 'remote-speech-consent-required'
          : /source.*permission|not permitted to send/i.test(reply.message) ? 'source-not-authorized'
            : /isolated word|one word/i.test(reply.message) ? 'invalid-input' : 'speech-unavailable',
    message: reply.message,
  } : {}),
  blob: async () => new Blob([new Uint8Array(reply.bytes ?? [])], { type: 'audio/wav' }),
});

export function createPracticeSpeechFetch(runtime: PracticeExtensionRuntime, runtimeUrl: string | undefined): FetchLike | undefined {
  if (!isTrustedPracticeUrl(runtimeUrl, runtime.id)) return undefined;
  return async (url, init) => {
    const op: SpeechMessage['op'] = url.endsWith('/status') ? 'status' : url.includes('/voices?') ? 'voices' : url.endsWith('/synthesize') ? 'synthesize' : 'status';
    if (!url.endsWith('/status') && !url.includes('/voices?') && !url.endsWith('/synthesize')) return response({ ok: false, status: 400, message: 'Invalid speech endpoint.' }, op);
    const requestId = `review:${Date.now().toString(36)}:${++bridgeSequence}`;
    let body: Record<string, unknown> = {};
    if (typeof init?.body === 'string') { try { body = JSON.parse(init.body) as Record<string, unknown>; } catch { return response({ ok: false, status: 400, message: 'Invalid speech request.' }, op); } }
    const queryLang = (() => { try { return new URL(url, runtimeUrl).searchParams.get('lang') ?? ''; } catch { return ''; } })();
    const localeLang = typeof body.locale === 'string' ? body.locale.toLowerCase().split('-')[0] : '';
    const req: SpeechMessage = {
      op, requestId, languageId: typeof body.languageId === 'string' && body.languageId ? body.languageId : (queryLang || localeLang || (op === 'status' ? 'sq' : '')),
      readerId: 'gopractice-review', kind: body.kind === 'phrase' || body.kind === 'sentence' ? body.kind : 'word', processingPermission: 'allowed',
      text: typeof body.text === 'string' ? body.text : undefined,
      voice: typeof body.voice === 'string' ? body.voice : undefined,
      locale: typeof body.locale === 'string' ? body.locale : undefined,
    };
    const signal = init?.signal;
    let cancelled = false;
    const cancel = (aborted = true) => {
      if (aborted) cancelled = true;
      void runtime.sendMessage({ type: 'golearn:speech', op: 'cancel', requestId, languageId: req.languageId }).catch(() => undefined);
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let removeAbort = (): void => undefined;
    try {
      if (signal?.aborted) { cancel(); return response({ ok: false, status: 499, message: 'Pronunciation was cancelled.' }, op); }
      const reply = await Promise.race([
        runtime.sendMessage({ type: 'golearn:speech', ...req }).then((value) => value as SpeechReply | undefined),
        new Promise<SpeechReply>((resolve) => {
          timer = setTimeout(() => { cancel(false); resolve({ ok: false, status: 504, message: 'The speech service did not answer in time.' }); }, BRIDGE_TIMEOUT_MS[op]);
          if (signal) {
            const abort = (): void => { cancel(); resolve({ ok: false, status: 499, message: 'Pronunciation was cancelled.' }); };
            if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
            removeAbort = () => signal.removeEventListener('abort', abort);
          }
        }),
      ]);
      if (cancelled || signal?.aborted) return response({ ok: false, status: 499, message: 'Pronunciation was cancelled.' }, op);
      return response(reply ?? { ok: false, status: 503, message: 'The speech service did not answer.' }, op);
    } catch { return response({ ok: false, status: 503, message: 'The speech service did not answer.' }, op); }
    finally { if (timer) clearTimeout(timer); removeAbort(); }
  };
}

/** Account-authenticated Repository speech for hosted and native GoReview. Only the exact configured service route receives the token. */
export function createAccountSpeechFetch(fetcher: FetchLike, endpoint: string, accountToken: () => Promise<string | undefined>, consent: () => boolean): FetchLike {
  const base = new URL(endpoint);
  const basePath = base.pathname.replace(/\/+$/, '');
  return async (url, init) => {
    let target: URL;
    try { target = new URL(url, base); } catch { return response({ ok: false, status: 400, message: 'Invalid speech endpoint.' }, 'status'); }
    const path = target.pathname.slice(basePath.length + 1);
    const op: SpeechMessage['op'] = path === 'status' ? 'status' : path === 'voices' ? 'voices' : path === 'synthesize' ? 'synthesize' : 'status';
    const validQuery = op === 'voices'
      ? [...target.searchParams.keys()].every((key) => key === 'lang') && target.searchParams.getAll('lang').length === 1 && /^[a-z]{2,3}$/.test(target.searchParams.get('lang') ?? '')
      : target.search === '';
    if (target.origin !== base.origin || target.pathname !== `${basePath}/${path}` || !['status', 'voices', 'synthesize'].includes(path) || !validQuery || target.hash) {
      return response({ ok: false, status: 400, message: 'Invalid speech endpoint.' }, op);
    }
    if (!consent()) return response({ ok: false, status: 403, message: 'Remote speech consent is off.' }, op);
    const token = await accountToken().catch(() => undefined);
    if (!token) return response({ ok: false, status: 401, message: 'Sign in to use remote speech.' }, op);
    const method = init?.method ?? (op === 'synthesize' ? 'POST' : 'GET');
    if (op === 'synthesize' && method !== 'POST' || op !== 'synthesize' && method !== 'GET') return response({ ok: false, status: 405, message: 'Invalid speech method.' }, op);
    if (op === 'synthesize') {
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(init?.body ?? '{}') as Record<string, unknown>; } catch { return response({ ok: false, status: 422, message: 'Invalid speech request.' }, op); }
      if (typeof body.languageId !== 'string' || !['word', 'phrase', 'sentence'].includes(String(body.kind)) || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 5000 || /[\u0000-\u001f\u007f<>]/u.test(body.text) || body.sourcePermission !== 'allowed') {
        return response({ ok: false, status: 422, message: 'Invalid speech request.' }, op);
      }
    }
    const headers = { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` };
    return fetcher(target.href, { ...init, method, headers, credentials: 'omit', redirect: 'error', cache: 'no-store' });
  };
}
