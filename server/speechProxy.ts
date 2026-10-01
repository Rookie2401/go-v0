/**
 * speechProxy() - a Vite plugin that serves the same-origin speech endpoints from BOTH `vite` (dev) and
 * `vite preview`. It is a thin Node adapter around the pure `handleSpeechRequest` in ./speechHandler.
 *
 * Secrets: AZURE_SPEECH_KEY / AZURE_SPEECH_REGION are read from `process.env` and from `.env.local` / `.env` through
 * Vite's `loadEnv` with an EXPLICIT EMPTY PREFIX, and only those two names are kept (`readSpeechEnv`). The plugin has no
 * `config` hook and sets no `define`, and neither name starts with `VITE_`, so they can never reach `import.meta.env`
 * or the client bundle. The key is held in the server process only.
 *
 * A static build (`dist/` on a plain static host) has no server: the endpoints do not exist there, which the browser
 * side reports as "no speech proxy". Use the direct AzureSpeechProvider (key typed by the user) in that case.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEnv, type Plugin } from 'vite';
import { MAX_BODY_BYTES, createRateLimiter, handleSpeechRequest, isSpeechPath, type SpeechDeps, type SpeechEnv, type SpeechResponse } from './speechHandler.ts';

export { handleSpeechRequest, createRateLimiter, isSpeechPath, redactKey, localeOfVoice, SPEECH_OUTPUT_FORMAT, SPEECH_PROVIDER_ID, SPEECH_PROVIDER_VERSION, MAX_BODY_BYTES, MAX_TEXT_CHARS, DEFAULT_RATE_LIMIT_PER_MINUTE } from './speechHandler.ts';
export type { SpeechRequest, SpeechResponse, SpeechEnv, SpeechDeps, RateLimiter } from './speechHandler.ts';

export const SPEECH_ENV_NAMES = ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION'] as const;

/**
 * The two speech variables, from the process environment and the env files (process.env wins, as with every Vite
 * variable). Nothing else is returned: no other variable of `.env.local` leaves this function.
 */
export function readSpeechEnv(envDir: string, mode: string, processEnv: Record<string, string | undefined> = process.env): SpeechEnv {
  const fromFiles = loadEnv(mode, envDir, ''); // explicit empty prefix: every name is loaded, and we keep exactly two
  const pick = (name: (typeof SPEECH_ENV_NAMES)[number]) => (processEnv[name] ?? fromFiles[name] ?? '').trim() || undefined;
  return { key: pick('AZURE_SPEECH_KEY'), region: pick('AZURE_SPEECH_REGION') };
}

export interface SpeechProxyOptions {
  /** Replace the environment source (tests). Default: `readSpeechEnv` on the project's envDir, re-read on every request. */
  env?: () => SpeechEnv;
  /** Injected for tests. Default: global fetch. */
  fetch?: typeof fetch;
  /** Requests per minute for the voices / synthesize endpoints. Default 30. */
  rateLimitPerMinute?: number;
  /** Receives key-free diagnostics. Default: silent. */
  log?: (line: string) => void;
}

/** Beyond this the request is not even drained: the connection is closed. */
const DRAIN_CAP_BYTES = 1_000_000;

/**
 * Reads the body up to `limit`. An oversized body is DRAINED (discarded, never buffered) before the caller answers
 * 413: answering while the client is still sending makes the client see a connection reset instead of the
 * response (observed on Windows as an intermittent ECONNRESET). Past DRAIN_CAP_BYTES the caller closes the socket.
 */
function collectBody(req: IncomingMessage, limit: number): Promise<Uint8Array | 'too-large' | 'too-large-abort'> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    let over = Number.isFinite(declared) && declared > limit;
    if (Number.isFinite(declared) && declared > DRAIN_CAP_BYTES) { resolve('too-large-abort'); return; }
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const done = (v: Uint8Array | 'too-large' | 'too-large-abort') => { if (!settled) { settled = true; resolve(v); } };
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) { over = true; chunks.length = 0; }
      if (size > DRAIN_CAP_BYTES) { done('too-large-abort'); return; }
      if (!over) chunks.push(c);
    });
    req.on('end', () => done(over ? 'too-large' : new Uint8Array(Buffer.concat(chunks))));
    req.on('error', (e) => { if (!settled) { settled = true; reject(e); } });
  });
}

function send(res: ServerResponse, out: SpeechResponse): void {
  res.statusCode = out.status;
  for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v);
  res.end(typeof out.body === 'string' ? out.body : Buffer.from(out.body));
}

export function speechProxy(options: SpeechProxyOptions = {}): Plugin {
  let envDir = process.cwd();
  let mode = 'development';
  const getEnv = options.env ?? (() => readSpeechEnv(envDir, mode));
  const deps: SpeechDeps = {
    fetch: options.fetch ?? ((input, init) => fetch(input, init)),
    now: () => Date.now(),
    log: options.log,
    limiter: createRateLimiter({ limit: options.rateLimitPerMinute, now: () => Date.now() }),
  };

  const middleware = async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!isSpeechPath(url.pathname)) { next(); return; }
    try {
      let body: Uint8Array | undefined;
      if (req.method === 'POST') {
        const read = await collectBody(req, MAX_BODY_BYTES);
        if (read === 'too-large' || read === 'too-large-abort') {
          // A drained request can be answered normally; an abusive one is answered and the socket closed.
          if (read === 'too-large-abort') res.setHeader('Connection', 'close');
          send(res, { status: 413, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: JSON.stringify({ error: 'payload-too-large', message: `The request body is limited to ${MAX_BODY_BYTES} bytes.` }) });
          return;
        }
        body = read;
      }
      const headers: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
      const out = await handleSpeechRequest({
        method: req.method ?? 'GET', path: url.pathname, query: Object.fromEntries(url.searchParams), headers, body, remote: req.socket.remoteAddress,
      }, getEnv(), deps);
      send(res, out);
    } catch {
      // No error text is forwarded: nothing here may carry a secret into a log or a response.
      if (!res.headersSent) send(res, { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ error: 'internal-error', message: 'The speech proxy failed unexpectedly.' }) });
      else res.end();
    }
  };

  return {
    name: 'go-speech-proxy',
    configResolved(config) { envDir = typeof config.envDir === 'string' ? config.envDir : config.root; mode = config.mode; },
    configureServer(server) { server.middlewares.use((req, res, next) => { void middleware(req, res, next); }); },
    configurePreviewServer(server) { server.middlewares.use((req, res, next) => { void middleware(req, res, next); }); },
  };
}
