import type { StorageArea } from '../platform';
import type { PrivacySettings } from '../protocol';
import type { SpeechMessage, SpeechReply } from '../speechProtocol';
import { registryEntry, matchEntry } from '../adapters/registry';
import { REMOTE_SPEECH_CONSENT_OWNER_KEY } from '../protocol';

export const SPEECH_CONFIG_KEY = 'golearn:speech-proxy';
interface SpeechConfig { baseUrl: string; token: string; permittedSourceOrigins?: string[] }
const refused = (status: number, message: string): SpeechReply => ({ ok: false, status, message });

function trustedReviewSender(senderUrl: string | undefined, extensionId: string | undefined, req: SpeechMessage): boolean {
  if (!senderUrl || !extensionId || req.readerId !== 'gopractice-review' || req.processingPermission !== 'allowed') return false;
  try {
    const u = new URL(senderUrl);
    return (u.protocol === 'chrome-extension:' || u.protocol === 'moz-extension:') && !u.username && !u.password && u.hostname === extensionId &&
      u.pathname === '/review/index.html' && !u.search;
  } catch { return false; }
}

/** GoLearn Share may send only one explicitly permissioned word, never a passage or sentence. */
function trustedShareSender(senderUrl: string | undefined, extensionId: string | undefined, req: SpeechMessage): boolean {
  if (!senderUrl || !extensionId || req.readerId !== 'golearn-share' || req.processingPermission !== 'allowed' || req.kind !== 'word') return false;
  try {
    const u = new URL(senderUrl);
    return (u.protocol === 'chrome-extension:' || u.protocol === 'moz-extension:') && !u.username && !u.password && u.hostname === extensionId &&
      u.pathname === '/app/index.html' && !u.search;
  } catch { return false; }
}

/** HTTPS in deployment; plain HTTP is permitted only on numeric loopback. */
export function speechBase(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  try {
    const u = new URL(value);
    if (u.username || u.password || u.search || u.hash) return;
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === '[::1]'))) return;
    if (u.pathname.replace(/\/+$/, '') !== '/api/speech') return;
    return u.href.replace(/\/+$/, '');
  } catch { return; }
}

export function createSpeechService(opts: {
  area: StorageArea;
  settings: () => Promise<PrivacySettings>;
  fetch: typeof fetch;
  hasPermission: (origin: string) => Promise<boolean>;
  extensionId?: string;
  /** Read the current account session inside the trusted worker; its token never leaves this module. */
  account?: () => Promise<{ baseUrl: string; token: string; learnerId?: string } | undefined>;
}) {
  const pending = new Map<string, AbortController>();
  async function read(): Promise<SpeechConfig | undefined> {
    const raw = (await opts.area.get(SPEECH_CONFIG_KEY))[SPEECH_CONFIG_KEY] as Partial<SpeechConfig> | undefined;
    const baseUrl = speechBase(raw?.baseUrl);
    return baseUrl && typeof raw?.token === 'string' && /^[A-Za-z0-9._~-]{32,256}$/.test(raw.token) ? { baseUrl, token: raw.token, permittedSourceOrigins: Array.isArray(raw.permittedSourceOrigins) ? raw.permittedSourceOrigins : [] } : undefined;
  }
  async function target(): Promise<{ baseUrl: string; token: string; learnerId?: string; permittedSourceOrigins?: string[]; privateBackend: boolean } | undefined> {
    const configured = await read();
    if (configured) return { ...configured, privateBackend: true };
    const account = await opts.account?.().catch(() => undefined);
    if (!account || !/^https:\/\//i.test(account.baseUrl) && !/^http:\/\/(?:127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(account.baseUrl)) return undefined;
    return { baseUrl: `${account.baseUrl.replace(/\/+$/, '')}/api/speech`, token: account.token, learnerId: account.learnerId, privateBackend: false };
  }
  async function configure(raw: Record<string, unknown>): Promise<{ ok: boolean; configured?: boolean; baseUrl?: string; message?: string }> {
    try {
      if (raw.op === 'set') {
        if (raw.clear === true) { await opts.area.remove(SPEECH_CONFIG_KEY); return { ok: true, configured: false }; }
        const baseUrl = speechBase(raw.baseUrl);
        if (!baseUrl || typeof raw.token !== 'string' || !/^[A-Za-z0-9._~-]{32,256}$/.test(raw.token)) return { ok: false, message: 'Use an HTTPS speech endpoint (or numeric loopback) and a separate backend access token of at least 32 characters.' };
        const permittedSourceOrigins: string[] = [];
        if (Array.isArray(raw.permittedSourceOrigins)) for (const value of raw.permittedSourceOrigins) {
          if (typeof value !== 'string') return { ok: false, message: 'Invalid source origin.' };
          let u: URL;
          try { u = new URL(value); } catch { return { ok: false, message: 'Invalid source origin.' }; }
          if (!/^https?:$/.test(u.protocol) || u.username || u.password || u.pathname !== '/' || u.search || u.hash) return { ok: false, message: 'Source permission must name an exact web origin.' };
          permittedSourceOrigins.push(u.origin);
        }
        if (permittedSourceOrigins.length > 20) return { ok: false, message: 'At most 20 source origins can be permitted.' };
        await opts.area.set({ [SPEECH_CONFIG_KEY]: { baseUrl, token: raw.token, permittedSourceOrigins } });
      }
      const config = await read();
      return { ok: true, configured: !!config, ...(config ? { baseUrl: config.baseUrl } : {}) };
    } catch { return { ok: false, message: 'Speech configuration could not be saved or read.' }; }
  }
  async function handle(raw: Record<string, unknown>, owner: string, senderUrl?: string): Promise<SpeechReply> {
    const req = raw as unknown as SpeechMessage;
    if (typeof req.requestId !== 'string' || !/^[\w:.-]{1,100}$/.test(req.requestId)) return refused(400, 'Invalid speech request.');
    const key = `${owner}:${req.requestId}`;
    if (req.op === 'cancel') { pending.get(key)?.abort(); return { ok: true, status: 200 }; }
    if (!['status', 'voices', 'synthesize'].includes(req.op) || !['sq', 'es', 'de', 'hi', 'th', 'nb', 'nn', 'he', 'el', 'la'].includes(req.languageId)) return refused(400, 'Unsupported speech request.');
    if (pending.size >= 8) return refused(429, 'Too many speech requests are pending.');
    pending.get(key)?.abort();
    const ctl = new AbortController(); pending.set(key, ctl);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      timer = setTimeout(() => ctl.abort(), 25_000);
      const st = await opts.settings();
      if (st.localOnlySpeech !== false || !st.remoteSpeechConsent) return refused(403, 'Local-only speech is on or remote speech consent is off.');
      const config = await target();
      if (!config) return refused(401, 'Sign in to use the account speech service, or configure your own speech backend.');
      if (!config.privateBackend) {
        const owner = (await opts.area.get(REMOTE_SPEECH_CONSENT_OWNER_KEY))[REMOTE_SPEECH_CONSENT_OWNER_KEY];
        if (typeof owner !== 'string' || !owner || owner !== config.learnerId) return refused(403, 'Re-enable remote speech consent for the currently signed-in account before sending text.');
      }
      if (req.op === 'voices' && req.languageId === 'nn') return { ok: true, status: 200, json: { voices: [] } };
      if (req.op === 'synthesize') {
        // Derive the reader from the browser-supplied URL, never a page-supplied permission flag.
        let entry;
        try { const u = new URL(senderUrl ?? ''); entry = matchEntry({ href: u.href, protocol: u.protocol, host: u.host, pathname: u.pathname }); } catch { /* fail closed */ }
        const sourceOrigin = (() => { try { return new URL(senderUrl ?? '').origin; } catch { return ''; } })();
        const permission = entry?.restrictions.remoteProcessing;
        // Explicit owner permission for an exact origin can resolve unknown rights, never override a prohibition.
        const permitted = permission === 'allowed' || config.privateBackend && permission === 'unknown' && config.permittedSourceOrigins?.includes(sourceOrigin);
        const trustedReview = trustedReviewSender(senderUrl, opts.extensionId, req);
        const trustedShare = trustedShareSender(senderUrl, opts.extensionId, req);
        if (!trustedReview && !trustedShare && (!entry || !entry.enabled || entry.readerId !== req.readerId || !registryEntry(req.readerId) || !permitted)) return refused(403, 'This reader has no permission to send source text to a speech service.');
        if (typeof req.text !== 'string' || !req.text.trim() || req.text.length > (trustedReview || trustedShare ? 120 : 5000) || !['word', 'phrase', 'sentence'].includes(req.kind ?? '') || typeof req.voice !== 'string' || typeof req.locale !== 'string') return refused(400, 'Invalid pronunciation input.');
        if (trustedShare && (/\s/u.test(req.text) || /[\u0000-\u001f\u007f]/u.test(req.text))) return refused(400, 'Share pronunciation accepts one isolated word only.');
        if (trustedShare && req.kind !== 'word') return refused(400, 'Share pronunciation accepts isolated words only.');
        if (trustedReview && config.privateBackend && (req.kind !== 'word' || /\s/u.test(req.text))) return refused(400, 'Custom speech setup accepts only an isolated word from GoReview.');
        const latinStandIn = req.languageId === 'la' && req.locale.toLowerCase() === 'it-it' && req.voice.toLowerCase().startsWith('it-it-');
        if (!latinStandIn && !req.locale.toLowerCase().startsWith(`${req.languageId}-`) || !req.voice.toLowerCase().startsWith(`${req.locale.toLowerCase()}-`)) return refused(400, 'The speech voice does not match the requested language and locale.');
        if (!config.privateBackend && (req.kind === 'word' && /\s/u.test(req.text) || /[\u0000-\u001f\u007f<>]/u.test(req.text))) return refused(422, 'The Repository accepts words and approved examples only; arbitrary speech text is not sent to Azure.');
      }
      const origin = `${new URL(config.baseUrl).origin}/*`;
      if (!(await opts.hasPermission(origin))) return refused(403, config.privateBackend ? 'Grant access to the configured speech backend from GoLearn setup.' : 'Grant access to the Repository service in GoLearn setup.');
      const sendingSettings = await opts.settings();
      if (sendingSettings.localOnlySpeech !== false || !sendingSettings.remoteSpeechConsent) return refused(403, 'Speech permission changed before sending the request.');
      if (ctl.signal.aborted) return refused(499, 'Pronunciation was cancelled.');
      const voicesLanguage = req.languageId === 'la' ? 'it' : req.languageId;
      const path = req.op === 'voices' ? `/voices?lang=${encodeURIComponent(voicesLanguage)}` : `/${req.op}`;
      const response = await opts.fetch(config.baseUrl + path, {
        method: req.op === 'synthesize' ? 'POST' : 'GET', signal: ctl.signal,
        credentials: 'omit', redirect: 'error', cache: 'no-store',
        headers: { Authorization: `Bearer ${config.token}`, ...(req.op === 'synthesize' ? { 'content-type': 'application/json' } : {}) },
        ...(req.op === 'synthesize' ? { body: JSON.stringify({ languageId: req.languageId, text: req.text, voice: req.voice, locale: req.locale, format: 'riff-24khz-16bit-mono-pcm', kind: req.kind, sourcePermission: 'allowed' }) } : {}),
      });
      if (ctl.signal.aborted) return refused(499, 'Pronunciation was cancelled.');
      if (!response.ok) {
        if (response.status === 401) return refused(401, 'Speech backend authentication failed. Sign in again.');
        if (response.status === 403) {
          let code = '';
          try { code = String((await response.clone().json() as { error?: unknown }).error ?? ''); } catch { /* generic denial */ }
          return refused(403, code === 'remote-speech-consent-required' ? 'The Repository has no current remote-speech consent for this account. Re-enable speech consent after syncing.' : 'The speech backend refused this request. Check source permissions and speech consent.');
        }
        if (response.status === 422) return refused(422, 'The Repository accepts words and exact approved examples only; arbitrary speech text is not sent to Azure.');
        return refused(response.status, 'The speech backend refused or failed the request.');
      }
      if (req.op !== 'synthesize') return { ok: true, status: response.status, json: await response.json() };
      if (!response.headers.get('content-type')?.startsWith('audio/wav')) return refused(502, 'Speech backend did not return WAV audio.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      const latest = await opts.settings();
      if (ctl.signal.aborted || latest.localOnlySpeech !== false || !latest.remoteSpeechConsent) return refused(499, 'Pronunciation was cancelled or permission changed.');
      if (bytes.length < 44 || bytes.length > 4_000_000) return refused(502, 'Invalid speech audio size.');
      return { ok: true, status: 200, bytes: Array.from(bytes) };
    } catch { return refused(503, 'Speech backend is unavailable or playback was cancelled.'); }
    finally { if (timer) clearTimeout(timer); if (pending.get(key) === ctl) pending.delete(key); }
  }
  return { configure, handle };
}
