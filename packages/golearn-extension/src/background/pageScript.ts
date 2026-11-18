/**
 * The letters of the learner's pages, for Alphabet Sprint (packages/goreview/app/alphabetPage.ts). GoLearn Active's scan counts the
 * characters of the words it reads, by language (content/active.ts), and sends the counts here; GoReview asks for one language's totals
 * to choose the letters the learner's own pages use most.
 *
 * What is kept: per language, a count for each single character, the number of batches added, and when. Nothing else: no word, no
 * sentence, no address, no title, no tab. Older counts fade (each new batch scales the totals by DECAY), at most MAX_CHARS characters a
 * language are kept, and "Clear local data" removes them with the rest of the device's data. Kept in the extension's own storage on this
 * device; never sent to the service.
 */
import type { StorageArea } from '../platform';

export const PAGE_SCRIPT_KEY = 'golearn:page-script:v1';
const DECAY = 0.9;
const MAX_CHARS = 400;
const MAX_LANGUAGES = 20;
const MAX_BATCH_CHARS = 600;
const LANG = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/;

interface LanguageCounts { counts: Record<string, number>; batches: number; at: number }
type Store = Record<string, LanguageCounts>;

function clean(raw: unknown): Store {
  const out: Store = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [lang, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!LANG.test(lang) || !v || typeof v !== 'object') continue;
    const counts: Record<string, number> = {};
    for (const [ch, n] of Object.entries((v as LanguageCounts).counts ?? {})) if ([...ch].length === 1 && typeof n === 'number' && Number.isFinite(n) && n > 0) counts[ch] = n;
    out[lang] = { counts, batches: Number((v as LanguageCounts).batches) || 0, at: Number((v as LanguageCounts).at) || 0 };
  }
  return out;
}

export function createPageScriptStore(area: StorageArea, now: () => number = Date.now) {
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => { const run = chain.then(fn, fn); chain = run.catch(() => undefined); return run; };
  const read = async (): Promise<Store> => clean((await area.get(PAGE_SCRIPT_KEY))[PAGE_SCRIPT_KEY]);

  return {
    /** Adds a batch of character counts for a language (from a content script). Anything malformed is dropped, not stored. */
    add(languageId: unknown, counts: unknown): Promise<{ ok: boolean }> {
      if (typeof languageId !== 'string' || !LANG.test(languageId) || !counts || typeof counts !== 'object') return Promise.resolve({ ok: false });
      const batch = Object.entries(counts as Record<string, unknown>)
        .filter(([ch, n]) => [...ch].length === 1 && /[\p{L}\p{M}]/u.test(ch) && typeof n === 'number' && Number.isFinite(n) && n > 0)
        .slice(0, MAX_BATCH_CHARS) as Array<[string, number]>;
      if (!batch.length) return Promise.resolve({ ok: false });
      return serial(async () => {
        const store = await read();
        const cur = store[languageId] ?? { counts: {}, batches: 0, at: 0 };
        const next: Record<string, number> = {};
        for (const [ch, n] of Object.entries(cur.counts)) next[ch] = n * DECAY;
        for (const [ch, n] of batch) next[ch] = (next[ch] ?? 0) + Math.min(n, 100_000);
        const kept = Object.entries(next).filter(([, n]) => n >= 0.5).sort((a, b) => b[1] - a[1]).slice(0, MAX_CHARS);
        store[languageId] = { counts: Object.fromEntries(kept.map(([ch, n]) => [ch, Math.round(n * 100) / 100])), batches: cur.batches + 1, at: now() };
        const langs = Object.entries(store).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_LANGUAGES);
        await area.set({ [PAGE_SCRIPT_KEY]: Object.fromEntries(langs) });
        return { ok: true };
      });
    },
    /** One language's counts (for GoReview, an extension page). */
    async get(languageId: unknown): Promise<{ ok: boolean; counts?: Record<string, number>; pages?: number }> {
      if (typeof languageId !== 'string') return { ok: false };
      const base = languageId.split('-')[0];
      const store = await read();
      const hit = store[languageId] ?? store[base];
      return hit ? { ok: true, counts: hit.counts, pages: hit.batches } : { ok: true };
    },
    clear: (): Promise<void> => area.remove(PAGE_SCRIPT_KEY),
  };
}
