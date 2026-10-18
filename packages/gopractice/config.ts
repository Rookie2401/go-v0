/**
 * Service address and application configuration. The address must be https, or http on a loopback host (development);
 * a learner's password is sent to this address and nowhere else, so a plain-http remote address is refused outright.
 */
import type { ApiResult } from '../repository-service/src/api';

export const DEFAULT_SERVICE_URL = 'http://127.0.0.1:8790';

export interface AppConfig {
  /** Default service address (from config.json next to the app); the learner may override it in Settings or at sign-in. */
  serviceUrl?: string;
  /** The extension's GoPractice page, for the hosted copy to point at (it cannot know the extension's id by itself). */
  extensionUrl?: string;
  /** Where audio files for recorded stimuli are served from; relative to the app page, or absolute. */
  assetBaseUrl?: string;
  /** Absolute speech proxy endpoint. Relative paths use the current origin, which is wrong for the extension page. */
  speechProxyBase?: string;
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

/** Speech text may leave the device only through an explicitly configured secure or local proxy. */
export function validateSpeechProxyBase(input: string): UrlCheck {
  const raw = input.trim();
  if (!raw) return { ok: false, message: 'Enter the speech proxy address.' };
  let u: URL;
  try { u = new URL(raw); } catch { return { ok: false, message: 'The speech proxy must be an absolute https address (or localhost for development).' }; }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && isLoopback(u.hostname))) {
    return { ok: false, message: 'The speech proxy must use https. Plain http is accepted only for localhost (development).' };
  }
  if (u.username || u.password || u.search || u.hash) return { ok: false, message: 'The speech proxy address must not contain credentials, a query or a fragment.' };
  return { ok: true, url: u.origin + u.pathname.replace(/\/+$/, '') };
}

/** config.json next to the app. A missing file, a non-JSON answer (a dev server may return index.html) or bad values give {}. */
export async function loadConfig(fetchFn: typeof fetch, url = './config.json'): Promise<AppConfig> {
  try {
    const r = await fetchFn(url, { cache: 'no-store' });
    if (!r.ok) return {};
    const j = JSON.parse(await r.text()) as Record<string, unknown>;
    if (!j || typeof j !== 'object') return {};
    const out: AppConfig = {};
    if (typeof j.serviceUrl === 'string') { const c = validateServiceUrl(j.serviceUrl); if (c.ok) out.serviceUrl = c.url; }
    if (typeof j.assetBaseUrl === 'string' && j.assetBaseUrl) out.assetBaseUrl = j.assetBaseUrl;
    if (typeof j.speechProxyBase === 'string' && j.speechProxyBase) { const c = validateSpeechProxyBase(j.speechProxyBase); if (c.ok) out.speechProxyBase = c.url; }
    if (typeof j.extensionUrl === 'string' && /^(https:|chrome-extension:)/.test(j.extensionUrl)) out.extensionUrl = j.extensionUrl;
    return out;
  } catch { return {}; }
}

/** Learner override, then config.json, then the development default. An override that no longer validates is ignored. */
export function resolveServiceUrl(override: string | undefined, config: AppConfig): string {
  if (override) { const c = validateServiceUrl(override); if (c.ok) return c.url; }
  if (config.serviceUrl) return config.serviceUrl;
  return DEFAULT_SERVICE_URL;
}

// ───────────────────────────── plain-language failures ─────────────────────────────

export type Refused = Extract<ApiResult<unknown>, { ok: false }>;

export function explainFailure(r: Refused, mode: 'signin' | 'request' = 'request'): string {
  if (r.status === 429) return 'Too many attempts. Wait a few minutes and try again.';
  if (r.status === 403 && r.error === 'email-unverified') return r.message || 'Confirm your email address first: open the link in the email GoLearn sent you, or ask for it again below.';
  if (r.status === 401 || r.status === 403) return mode === 'signin' ? 'That email and password were not accepted.' : 'The service no longer accepts this sign-in. Sign in again.';
  if (r.status === 409) return r.message || 'The item changed elsewhere. Reload it and try again.';
  if (r.status === 400 || r.status === 422) return r.message || 'The service did not accept that request.';
  return r.message || `The service answered ${r.status}.`;
}
