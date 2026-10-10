import type { LocalSentenceTranslationReply, LocalSentenceTranslationRequest } from '../translation/localProtocol';

const CONFIG_FILE = 'translation.local.json';
const LOOPBACK_HOST = ['127', '0', '0', '1'].join('.');
const SERVICE_PORT = '8792';
const SERVICE_PATH = '/translate';
const MODEL = 'Helsinki-NLP/opus-mt-sq-en' as const;
const MAX_INPUT = 2_000;
const MAX_OUTPUT = 4_000;
const MAX_REVISION = 100;
const TOKEN = /^[a-f0-9]{32,}$/iu;

interface LocalConfig { endpoint: string; token: string }
interface ServiceResponse { text?: unknown; model?: unknown; revision?: unknown }

function fixedLoopbackEndpoint(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' || url.hostname !== LOOPBACK_HOST || url.port !== SERVICE_PORT || url.pathname !== SERVICE_PATH
      || url.username || url.password || url.search || url.hash || value !== url.href) return undefined;
    return url.href;
  } catch { return undefined; }
}

export interface LocalTranslationServiceOptions {
  fetch: typeof fetch;
  extensionId?: string;
  getURL?: (path: string) => string;
  hasLoopbackPermission?: () => Promise<boolean>;
}

/** Calls only the packaged, loopback-only local service. No text or result is cached or persisted. */
export function createLocalTranslationService(options: LocalTranslationServiceOptions) {
  async function readConfig(): Promise<LocalConfig | undefined> {
    if (!options.getURL) return undefined;
    let url: string;
    try { url = options.getURL(CONFIG_FILE); } catch { return undefined; }
    // getURL is trusted worker API, but keep this read pinned to this extension's private packaged file.
    const expected = options.extensionId ? `chrome-extension://${options.extensionId}/${CONFIG_FILE}` : undefined;
    if (!expected || url !== expected) return undefined;
    try {
      const response = await options.fetch(url, { method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error', timeoutMs: 60_000 } as RequestInit);
      if (!response.ok) return undefined;
      const value = await response.json() as Partial<LocalConfig>;
      const endpoint = fixedLoopbackEndpoint(value.endpoint);
      if (!endpoint || typeof value.token !== 'string' || !TOKEN.test(value.token)) return undefined;
      return { endpoint, token: value.token };
    } catch { return undefined; }
  }

  return {
    async translate(raw: unknown): Promise<LocalSentenceTranslationReply> {
      const req = raw as Partial<LocalSentenceTranslationRequest> | null;
      if (!req || req.explicitlyRequested !== true || req.sourceLanguage !== 'sq' || req.targetLanguage !== 'en'
        || typeof req.text !== 'string' || !req.text.trim() || req.text.length > MAX_INPUT || /[\u0000]/u.test(req.text)) {
        return { ok: false, reason: 'invalid-request' };
      }
      if (!options.hasLoopbackPermission || !(await options.hasLoopbackPermission().catch(() => false))) {
        return { ok: false, reason: 'host-permission-unavailable' };
      }
      const config = await readConfig();
      if (!config) return { ok: false, reason: 'not-configured' };
      try {
        const response = await options.fetch(config.endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${config.token}` },
          body: JSON.stringify({ text: req.text, sourceLanguage: 'sq', targetLanguage: 'en' }),
          cache: 'no-store', credentials: 'omit', redirect: 'error',
          timeoutMs: 60_000,
        } as RequestInit);
        if (!response.ok) return { ok: false, reason: 'service-error' };
        const result = await response.json() as ServiceResponse;
        if (typeof result.text !== 'string' || !result.text.trim() || result.text.length > MAX_OUTPUT || result.model !== MODEL) {
          return { ok: false, reason: 'service-error' };
        }
        const revision = typeof result.revision === 'string' && result.revision.length <= MAX_REVISION && /^[\w.+-]+$/u.test(result.revision)
          ? result.revision : undefined;
        return { ok: true, text: result.text.trim(), model: MODEL, ...(revision ? { revision } : {}) };
      } catch { return { ok: false, reason: 'unavailable' }; }
    },
  };
}
