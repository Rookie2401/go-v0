/**
 * Service address and application configuration. The address must be https, or http on a loopback host (development);
 * a learner’s password is sent to this address and nowhere else, so a plain-http remote address is refused outright.
 */
export const DEFAULT_SERVICE_URL = 'http://127.0.0.1:8790';

export interface AppConfig {
  /** Default service address (from config.json next to the app); the learner may override it on the Account screen. */
  serviceUrl?: string;
  /** Where language-pack files (dictionary shards …) are served from; relative to the app page, or absolute. Default: the app’s own folder. */
  assetBaseUrl?: string;
  /** A hosted copy of `dict/<language>/` (the project’s GitHub Pages site), tried last when neither the learner’s address nor the app’s own folder has the language. */
  dictionaryFallbackUrl?: string;
  /** The hosted Biblia edition (2026-10-23: rookie2401.github.io/biblia), its own installable app on the same GoLearn account; https only. The reader screen links there. */
  bibliaUrl?: string;
}

export type UrlCheck = { ok: true; url: string } | { ok: false; message: string };

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const isLoopback = (host: string): boolean => LOOPBACK.has(host) || host.endsWith('.localhost');

export function validateServiceUrl(input: string): UrlCheck {
  const raw = input.trim();
  if (!raw) return { ok: false, message: 'Enter the service address.' };
  let u: URL;
  try { u = new URL(raw); } catch { return { ok: false, message: 'That is not a web address (for example https://repository.example.org).' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, message: 'The service address must start with https://.' };
  if (u.username || u.password) return { ok: false, message: 'Do not put a user name or password in the address.' };
  if (u.protocol === 'http:' && !isLoopback(u.hostname)) {
    return { ok: false, message: 'The service address must use https. Plain http is accepted only for localhost (development), because your password travels to this address.' };
  }
  if (u.search || u.hash) return { ok: false, message: 'The service address must not contain a query or a fragment.' };
  return { ok: true, url: u.origin + u.pathname.replace(/\/+$/, '') };
}

/** config.json next to the app. A missing file, a non-JSON answer (a dev server may return index.html) or bad values give {}. */
export async function loadConfig(fetchFn: typeof fetch, url = './config.json'): Promise<AppConfig> {
  try {
    const r = await fetchFn(url, { cache: 'no-store' });
    if (!r.ok) return {};
    const text = await r.text();
    const j = JSON.parse(text) as Record<string, unknown>;
    if (!j || typeof j !== 'object') return {};
    const out: AppConfig = {};
    if (typeof j.serviceUrl === 'string' && validateServiceUrl(j.serviceUrl).ok) out.serviceUrl = (validateServiceUrl(j.serviceUrl) as { url: string }).url;
    if (typeof j.assetBaseUrl === 'string' && j.assetBaseUrl) out.assetBaseUrl = j.assetBaseUrl;
    if (typeof j.dictionaryFallbackUrl === 'string') { const c = validateServiceUrl(j.dictionaryFallbackUrl); if (c.ok) out.dictionaryFallbackUrl = c.url; }
    if (typeof j.bibliaUrl === 'string') { const c = validateServiceUrl(j.bibliaUrl); if (c.ok && c.url.startsWith('https://')) out.bibliaUrl = c.url + '/'; }
    return out;
  } catch { return {}; }
}

/** Learner override, then config.json, then the development default. An override that no longer validates is ignored. */
export function resolveServiceUrl(override: string | undefined, config: AppConfig): string {
  if (override) { const c = validateServiceUrl(override); if (c.ok) return c.url; }
  if (config.serviceUrl) return config.serviceUrl;
  return DEFAULT_SERVICE_URL;
}
