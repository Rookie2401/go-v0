import type { FetchLike, FetchResponseLike } from '../golisten/src/ports';
import type { SpeechMessage, SpeechReply } from '../golearn-extension/src/speechProtocol';

export interface PracticeExtensionRuntime {
  id?: string;
  sendMessage(message: unknown): Promise<unknown>;
}
let bridgeSequence = 0;

export function isTrustedPracticeUrl(href: string | undefined, runtimeId: string | undefined): boolean {
  if (!href || !runtimeId) return false;
  try {
    const u = new URL(href);
    return (u.protocol === 'chrome-extension:' || u.protocol === 'moz-extension:') && u.hostname === runtimeId &&
      u.pathname === '/practice/index.html' && !u.search && !u.username && !u.password;
  } catch { return false; }
}

const response = (reply: SpeechReply, op: SpeechMessage['op']): FetchResponseLike => ({
  ok: reply.ok,
  status: reply.status,
  headers: { get: (name) => name.toLowerCase() === 'content-type' && op === 'synthesize' && reply.ok ? 'audio/wav' : 'application/json' },
  json: async () => reply.json ?? {},
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
    const cancel = () => { cancelled = true; void runtime.sendMessage({ type: 'golearn:speech', op: 'cancel', requestId, languageId: req.languageId }).catch(() => undefined); };
    if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, { once: true });
    try {
      if (cancelled) return response({ ok: false, status: 499, message: 'Pronunciation was cancelled.' }, op);
      const reply = await runtime.sendMessage({ type: 'golearn:speech', ...req }) as SpeechReply | undefined;
      if (cancelled || signal?.aborted) return response({ ok: false, status: 499, message: 'Pronunciation was cancelled.' }, op);
      return response(reply ?? { ok: false, status: 503, message: 'The speech service did not answer.' }, op);
    } catch { return response({ ok: false, status: 503, message: 'The speech service did not answer.' }, op); }
    finally { signal?.removeEventListener('abort', cancel); }
  };
}
