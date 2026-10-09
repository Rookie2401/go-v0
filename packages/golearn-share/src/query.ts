/**
 * The web share target and deep links deliver a passage as query parameters (`text`, `url`, `title`). This reads them from
 * a location's `search` and, as a fallback, from a query written after the hash route (`#/share?text=…`). Pure; no DOM.
 */
import type { SharedPassage, ShareMechanism } from './mechanism';

export const SHARE_PARAMS = ['text', 'url', 'title'] as const;
export type ShareParams = Partial<Record<(typeof SHARE_PARAMS)[number], string>>;

const queryOf = (s: string): string => {
  const i = s.indexOf('?');
  return i < 0 ? '' : s.slice(i + 1);
};

/** `search` is `location.search`; `hash` is `location.hash`. A parameter in the search wins over the same one in the hash. */
export function readShareParams(search: string, hash = ''): ShareParams {
  const out: ShareParams = {};
  const sources = [search.startsWith('?') ? search.slice(1) : search, queryOf(hash)];
  for (const raw of sources) {
    if (!raw) continue;
    let q: URLSearchParams;
    try { q = new URLSearchParams(raw); } catch { continue; }
    for (const k of SHARE_PARAMS) {
      const v = q.get(k);
      if (out[k] === undefined && typeof v === 'string' && v.trim() !== '') out[k] = v;
    }
  }
  return out;
}

/** The passage a share target / deep link delivered, or undefined when it carried no `text`. */
export function passageFromShareParams(
  params: ShareParams,
  opts: { now: Date; mechanism?: Extract<ShareMechanism, 'web-share-target' | 'deep-link'>; languageHint?: string },
): SharedPassage | undefined {
  if (params.text === undefined) return undefined;
  return {
    text: params.text,
    ...(params.url ? { url: params.url } : {}),
    ...(params.title ? { title: params.title } : {}),
    ...(opts.languageHint ? { languageHint: opts.languageHint } : {}),
    receivedAt: opts.now.toISOString(),
    mechanism: opts.mechanism ?? 'web-share-target',
  };
}

/** A passage the learner pasted into the box themselves: the only way the clipboard is ever read. */
export function pastedPassage(text: string, opts: { now: Date; languageHint?: string }): SharedPassage {
  return { text, ...(opts.languageHint ? { languageHint: opts.languageHint } : {}), receivedAt: opts.now.toISOString(), mechanism: 'clipboard-import' };
}
