/**
 * Dictionary glosses and grammar explanations through the language-pack runtime, run in the BACKGROUND only.
 *
 * The content script never fetches a shard: it asks (`golearn:gloss`, `golearn:explain`) and renders what comes back as
 * text. Where a language's shards are read from is worked out per language (see `locate`): the learner's dictionary
 * address, then the extension's own `app/` folder, then the hosted copy named in the extension's own `app/config.json`
 * (`dictionaryFallbackUrl`: data, never code). Every shard is kept in `chrome.storage.local` under `pack:shard:<id>` together
 * with the dictionary's required attribution, so a word looked up once works offline and the licence line is never lost.
 */
import { createPackRuntime, type PackRuntime } from '../../../language-packs/src/runtime';
import { packFor } from '../../../language-packs/src/registry';
import type { PackManifest } from '../../../language-packs/src/manifest';
import type { StorageArea } from '../platform';
import {
  cleanText, isLanguageId, type ConstructionExplanation, type EntryReply, type EntryRequest, type ExplainReply, type ExplainRequest, type FeatureExplanation, type GlossReply, type GlossRequest, stringRecord,
} from '../protocol';
import type { SessionManager } from './session';

export const SHARD_PREFIX = 'pack:shard:';
const MAX_SHARD_CHARS = 3_000_000;

/** The slice of a pack runtime this module uses (the real one satisfies it; tests pass a fake). */
export type PackRuntimeLike = Pick<PackRuntime, 'gloss'> & { readonly manifest: PackManifest };
export interface PackProvider {
  manifest(languageId: string): PackManifest | undefined;
  runtime(languageId: string, deps: { fetch: typeof fetch; baseUrl: string }): PackRuntimeLike | undefined;
}

/** The real packs: installable ones only. */
export const defaultPacks: PackProvider = {
  manifest: (id) => packFor(id),
  runtime: (id, deps) => { const m = packFor(id); return m && m.status === 'installable' ? createPackRuntime(m, deps) : undefined; },
};

interface ShardRow { text: string; at: number; url: string; attribution?: string }

/** A shard `fetch` that also counts the fetches that failed for reasons of connection (a thrown error, a 5xx): the pack runtime swallows them, so this is how a gloss learns it was offline (audit O-07). */
export type ShardFetch = typeof fetch & {
  failures: number;
  /** Fetch from the network even when the file is cached (and keep what comes back): how a location is checked before it is trusted. */
  network(url: string): Promise<Response>;
};

/** A `fetch` that reads a dictionary file from storage first, and stores what it fetches. Only URLs under `base` are served. */
export function createShardFetch(area: StorageArea, base: string, doFetch: typeof fetch, now: () => number = Date.now): ShardFetch {
  const root = base.replace(/\/+$/, '') + '/';
  const load = async (input: RequestInfo | URL, useCache: boolean): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(root)) throw new Error('refusing to fetch outside the dictionary location');
    const id = url.slice(root.length).replace(/\.json$/i, '');
    const key = SHARD_PREFIX + id;
    if (useCache) {
      const hit = (await area.get(key))[key] as ShardRow | undefined;
      if (hit && typeof hit.text === 'string') return new Response(hit.text, { status: 200, headers: { 'content-type': 'application/json' } });
    }
    let res: Response;
    try { res = await doFetch(url); } catch (e) { shardFetch.failures += 1; throw e; }
    if (!res.ok) { if (res.status >= 500) shardFetch.failures += 1; return res; }
    const text = await res.text();
    if (text.length <= MAX_SHARD_CHARS) { try { await area.set({ [key]: { text, at: now(), url } satisfies ShardRow }); } catch { /* storage full: the shard is used this once */ } }
    return new Response(text, { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const shardFetch = ((input: RequestInfo | URL): Promise<Response> => load(input, true)) as ShardFetch;
  shardFetch.network = (url) => load(url, false);
  shardFetch.failures = 0;
  return shardFetch;
}

/** Where a language's meanings are read from: the learner's dictionary address, this extension's own files, or the hosted copy. */
export type DictionarySource = 'configured' | 'extension' | 'hosted';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
/** The hosted copy's address from config.json: https, or http on localhost; anything else is ignored. Returned with a trailing slash. */
export function cleanFallbackUrl(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  try {
    const u = new URL(v.trim());
    const loopback = LOOPBACK_HOSTS.has(u.hostname) || u.hostname.endsWith('.localhost');
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback)) return undefined;
    if (u.username || u.password || u.search || u.hash) return undefined;
    return u.origin + u.pathname.replace(/\/+$/, '') + '/';
  } catch { return undefined; }
}

const firstSentence = (s: string): string => { const m = /^(.+?[.!?])(\s|$)/u.exec(s); return (m ? m[1] : s).trim(); };

export interface GlossServiceOptions {
  area: StorageArea;
  session: SessionManager;
  fetch: typeof fetch;
  packs?: PackProvider;
  now?: () => number;
  /** `chrome.runtime.getURL`: the extension's own files (its `app/` folder and `app/config.json`). Absent outside an extension. */
  getURL?: (path: string) => string | undefined;
}

interface Located { base?: string; source?: DictionarySource; reason?: 'no-asset-base' | 'offline'; message?: string }

export function createGlossService(opts: GlossServiceOptions) {
  const packs = opts.packs ?? defaultPacks;
  const runtimes = new Map<string, PackRuntimeLike>();
  const shardFetches = new Map<string, ShardFetch>();
  /** The location chosen for a language, kept for the worker's lifetime (a failed search is made again next time). */
  const located = new Map<string, Promise<Located>>();
  let fallbackRead: Promise<string | undefined> | undefined;

  const shardFetchFor = (base: string): ShardFetch => {
    let f = shardFetches.get(`base@${base}`);
    if (!f) { f = createShardFetch(opts.area, base, opts.fetch, opts.now); shardFetches.set(`base@${base}`, f); }
    return f;
  };

  /** The hosted copy's address: read ONCE from the extension's own app/config.json (the address is data, never code). */
  function readFallback(): Promise<string | undefined> {
    fallbackRead ??= (async () => {
      const url = opts.getURL?.('app/config.json');
      if (!url) return undefined;
      try {
        const res = await opts.fetch(url);
        if (!res.ok) return undefined;
        return cleanFallbackUrl((JSON.parse(await res.text()) as { dictionaryFallbackUrl?: unknown } | null)?.dictionaryFallbackUrl);
      } catch { return undefined; }
    })();
    return fallbackRead;
  }

  /** The candidate locations in order; the hosted one is read lazily, only when the first two did not answer. */
  async function* candidates(): AsyncGenerator<{ source: DictionarySource; base: string }> {
    const svc = await opts.session.getService();
    const configured = svc?.assetBase ?? svc?.baseUrl;
    if (configured) yield { source: 'configured', base: configured };
    const own = opts.getURL?.('app/');
    if (own) yield { source: 'extension', base: own };
    const hosted = await readFallback();
    if (hosted) yield { source: 'hosted', base: hosted };
  }

  /** Which location serves this language: the first whose `dict/<lang>/manifest.json` answers 200 (fetched through the caching shard fetch). */
  async function locate(languageId: string, manifest: PackManifest): Promise<Located> {
    const rel = manifest.lexical?.dictionary?.baseUrl?.replace(/^\/+|\/+$/g, '');
    const tried: Array<{ source: DictionarySource; base: string }> = [];
    let unreachable = false;
    for await (const c of candidates()) {
      tried.push(c);
      if (!rel) return { base: c.base, source: c.source }; // a pack that declares no dictionary has nothing to check
      try {
        const res = await shardFetchFor(c.base).network(`${c.base.replace(/\/+$/, '')}/${rel}/manifest.json`);
        if (res.ok) return { base: c.base, source: c.source };
        if (res.status >= 500) unreachable = true;
      } catch { unreachable = true; }
    }
    if (rel) {
      // nothing answered right now: a dictionary read before is still on this device, and its row remembers where it came from
      const key = `${SHARD_PREFIX}${rel}/manifest`;
      try {
        const row = (await opts.area.get(key))[key] as ShardRow | undefined;
        const hit = row && typeof row.url === 'string' ? tried.find((c) => row.url.startsWith(c.base.replace(/\/+$/, '') + '/')) : undefined;
        if (hit) return { base: hit.base, source: hit.source };
      } catch { /* no memory of one */ }
    }
    if (!tried.length) return { reason: 'no-asset-base', message: 'No dictionary location is configured. Open GoLearn setup.' };
    if (unreachable) return { reason: 'offline', message: 'The dictionary could not be reached.' };
    return { reason: 'no-asset-base', message: `No dictionary location has ${languageId}. Open GoLearn setup.` };
  }

  async function runtimeFor(languageId: string): Promise<{ rt?: PackRuntimeLike; reason?: GlossReply['reason']; message?: string; source?: DictionarySource }> {
    const manifest = packs.manifest(languageId);
    if (!manifest || manifest.status !== 'installable') return { reason: 'no-pack' };
    let loc = located.get(languageId);
    if (!loc) {
      const mine = locate(languageId, manifest);
      loc = mine;
      located.set(languageId, mine);
      const forget = (): void => { if (located.get(languageId) === mine) located.delete(languageId); };
      void mine.then((l) => { if (!l.base) forget(); }, forget);
    }
    const { base, source, reason, message } = await loc;
    if (!base) return { reason, message };
    const cacheKey = `${languageId}@${base}`;
    let rt = runtimes.get(cacheKey);
    if (!rt) {
      const shardFetch = shardFetchFor(base);
      rt = packs.runtime(languageId, { fetch: shardFetch, baseUrl: base });
      if (!rt) return { reason: 'no-pack' };
      shardFetches.set(cacheKey, shardFetch);
      runtimes.set(cacheKey, rt);
    }
    return { rt, source };
  }

  async function stampAttribution(languageId: string, attribution: string): Promise<void> {
    try {
      const all = await opts.area.get(null);
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(all)) {
        if (!k.startsWith(SHARD_PREFIX) || !k.includes(`/${languageId}/`)) continue;
        const row = v as ShardRow;
        if (row && row.attribution !== attribution) patch[k] = { ...row, attribution };
      }
      if (Object.keys(patch).length) await opts.area.set(patch);
    } catch { /* the attribution also travels with every reply */ }
  }

  async function glossFor(raw: unknown): Promise<GlossReply> {
    const r = (raw ?? {}) as Partial<GlossRequest>;
    const lemma = cleanText(r.lemma, 80);
    if (!lemma || !isLanguageId(r.languageId)) return { ok: false, found: false, senses: [], reason: 'error', message: 'Not a valid gloss request.' };
    const pos = typeof r.pos === 'string' && /^[A-Za-z]{1,8}$/.test(r.pos) ? r.pos : undefined;
    const forms = Array.isArray(r.forms) ? r.forms.map((f) => cleanText(f, 80)).filter((f): f is string => !!f).slice(0, 8) : [];
    const { rt, reason, message, source } = await runtimeFor(r.languageId);
    if (!rt) return { ok: true, found: false, senses: [], reason, message: reason === 'no-pack' ? `No pack with a dictionary is installed for ${r.languageId}.` : message ?? 'No dictionary location is configured. Open GoLearn setup.' };
    const from = source ? { source } : {};
    const counter = [...shardFetches.entries()].find(([k]) => runtimes.get(k) === rt)?.[1];
    const failuresBefore = counter?.failures ?? 0;
    try {
      const g = await rt.gloss(lemma, pos, forms);
      if (!g || !Array.isArray(g.senses) || !g.senses.length) {
        // the runtime swallowed a failed shard fetch: say "offline" (try again) rather than "not in the dictionary"
        if (counter && counter.failures > failuresBefore) return { ok: true, found: false, senses: [], reason: 'offline', message: 'The dictionary could not be reached.', ...from };
        return { ok: true, found: false, senses: [], reason: 'not-found', ...from };
      }
      const senses = [...new Set(g.senses.map((s) => cleanText(s.gloss, 160)).filter((s): s is string => !!s))].slice(0, 6);
      const attribution = cleanText(g.attribution, 200);
      if (attribution) void stampAttribution(r.languageId, attribution);
      return { ok: true, found: senses.length > 0, senses, ...(attribution ? { attribution } : {}), ...(senses.length ? {} : { reason: 'not-found' as const }), ...from };
    } catch {
      return { ok: true, found: false, senses: [], reason: 'offline', message: 'The dictionary could not be reached.', ...from };
    }
  }

  /** Feature and construction explanations from the pack manifest (data in the bundle: no fetch needed). */
  function explainFor(raw: unknown): ExplainReply {
    const r = (raw ?? {}) as Partial<ExplainRequest>;
    const none: ExplainReply = { ok: true, features: [], constructions: [], source: 'none' };
    if (!isLanguageId(r.languageId)) return { ...none, ok: false };
    const manifest = packs.manifest(r.languageId);
    if (!manifest) return none;
    const feats = stringRecord(r.features) ?? {};
    const features: FeatureExplanation[] = [];
    for (const [key, value] of Object.entries(feats)) {
      const f = manifest.grammar.features.find((x) => x.key === key);
      if (!f) { features.push({ key, value, label: key }); continue; }
      const names = value.split(',').map((v) => v.trim()).filter(Boolean).map((v) => f.values[v]).filter((n): n is string => !!n);
      features.push({ key, value, label: f.label, ...(names.length ? { brief: `${names.join(' or ')}` } : {}), explanation: f.explain });
    }
    const ids = Array.isArray(r.constructionIds) ? r.constructionIds.filter((i): i is string => typeof i === 'string' && /^[a-z0-9-]{1,60}$/.test(i)).slice(0, 12) : [];
    const constructions: ConstructionExplanation[] = [];
    for (const id of ids) {
      const c = manifest.grammar.constructions.find((x) => x.id === id);
      if (c) constructions.push({ id, title: c.label, brief: firstSentence(c.explain), explanation: c.explain });
    }
    return { ok: true, features, constructions, source: features.some((f) => f.explanation) || constructions.length ? 'pack' : 'none' };
  }

  /** Whether an installable pack exists for the language (the card says so when it does not). */
  const packAvailable = (languageId: string): boolean => packs.manifest(languageId)?.status === 'installable';

  /**
   * Level 2: the dictionary's full record of a lemma (the `full/` shards: inflection table, etymology, IPA, audio, relations),
   * through the same location resolution as a gloss. A pack runtime without `entry()` (an older build) says so honestly.
   */
  async function entryFor(raw: unknown): Promise<EntryReply> {
    const r = (raw ?? {}) as Partial<EntryRequest>;
    const lemma = cleanText(r.lemma, 80);
    if (!lemma || !isLanguageId(r.languageId)) return { ok: false, found: false, records: [], reason: 'error', message: 'Not a valid entry request.' };
    const pos = typeof r.pos === 'string' && /^[A-Za-z]{1,8}$/.test(r.pos) ? r.pos : undefined;
    const forms = Array.isArray(r.forms) ? r.forms.map((f) => cleanText(f, 80)).filter((f): f is string => !!f).slice(0, 8) : [];
    const { rt, reason, message, source } = await runtimeFor(r.languageId);
    const from = source ? { source } : {};
    if (!rt) return { ok: true, found: false, records: [], reason, message: message ?? (reason === 'no-pack' ? `No pack with a dictionary is installed for ${r.languageId}.` : 'No dictionary location is configured.') };
    const entry = (rt as Partial<PackRuntime>).entry;
    if (typeof entry !== 'function') return { ok: true, found: false, records: [], reason: 'no-full-records', message: 'This build has no full dictionary records.', ...from };
    try {
      const got = await entry.call(rt, lemma, pos, forms);
      if (!got || !Array.isArray(got.records) || !got.records.length) return { ok: true, found: false, records: [], reason: 'not-found', ...from };
      const attribution = cleanText(got.attribution, 200);
      return { ok: true, found: true, records: got.records.slice(0, 6), ...(attribution ? { attribution } : {}), ...from };
    } catch {
      return { ok: true, found: false, records: [], reason: 'offline', message: 'The dictionary could not be reached.', ...from };
    }
  }

  return { glossFor, entryFor, explainFor, packAvailable };
}

export type GlossService = ReturnType<typeof createGlossService>;
