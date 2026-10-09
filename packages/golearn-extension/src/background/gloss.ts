/**
 * Dictionary glosses and grammar explanations through the language-pack runtime, run in the BACKGROUND only.
 *
 * The content script never fetches a shard: it asks (`golearn:gloss`, `golearn:explain`) and renders what comes back as
 * text. Shards are fetched from the configured asset base (the service's address, or the Pages site that serves
 * `dict/<lang>/`), and every shard is kept in `chrome.storage.local` under `pack:shard:<id>` together with the
 * dictionary's required attribution, so a word looked up once works offline and the licence line is never lost.
 */
import { createPackRuntime, type PackRuntime } from '../../../language-packs/src/runtime';
import { packFor } from '../../../language-packs/src/registry';
import type { PackManifest } from '../../../language-packs/src/manifest';
import type { StorageArea } from '../platform';
import {
  cleanText, isLanguageId, type ConstructionExplanation, type ExplainReply, type ExplainRequest, type FeatureExplanation, type GlossReply, type GlossRequest, stringRecord,
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

/** A `fetch` that reads a dictionary file from storage first, and stores what it fetches. Only URLs under `base` are served. */
export function createShardFetch(area: StorageArea, base: string, doFetch: typeof fetch, now: () => number = Date.now): typeof fetch {
  const root = base.replace(/\/+$/, '') + '/';
  return (async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(root)) throw new Error('refusing to fetch outside the dictionary location');
    const id = url.slice(root.length).replace(/\.json$/i, '');
    const key = SHARD_PREFIX + id;
    const hit = (await area.get(key))[key] as ShardRow | undefined;
    if (hit && typeof hit.text === 'string') return new Response(hit.text, { status: 200, headers: { 'content-type': 'application/json' } });
    const res = await doFetch(url);
    if (!res.ok) return res;
    const text = await res.text();
    if (text.length <= MAX_SHARD_CHARS) { try { await area.set({ [key]: { text, at: now(), url } satisfies ShardRow }); } catch { /* storage full: the shard is used this once */ } }
    return new Response(text, { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

const firstSentence = (s: string): string => { const m = /^(.+?[.!?])(\s|$)/u.exec(s); return (m ? m[1] : s).trim(); };

export interface GlossServiceOptions {
  area: StorageArea;
  session: SessionManager;
  fetch: typeof fetch;
  packs?: PackProvider;
  now?: () => number;
}

export function createGlossService(opts: GlossServiceOptions) {
  const packs = opts.packs ?? defaultPacks;
  const runtimes = new Map<string, PackRuntimeLike>();

  /** The asset base: the configured one, else the service address. Without either, nothing can be fetched. */
  async function assetBase(): Promise<string | undefined> {
    const svc = await opts.session.getService();
    return svc?.assetBase ?? svc?.baseUrl;
  }

  async function runtimeFor(languageId: string): Promise<{ rt?: PackRuntimeLike; reason?: GlossReply['reason'] }> {
    const manifest = packs.manifest(languageId);
    if (!manifest || manifest.status !== 'installable') return { reason: 'no-pack' };
    const base = await assetBase();
    if (!base) return { reason: 'no-asset-base' };
    const cacheKey = `${languageId}@${base}`;
    let rt = runtimes.get(cacheKey);
    if (!rt) {
      rt = packs.runtime(languageId, { fetch: createShardFetch(opts.area, base, opts.fetch, opts.now), baseUrl: base });
      if (!rt) return { reason: 'no-pack' };
      runtimes.set(cacheKey, rt);
    }
    return { rt };
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
    const { rt, reason } = await runtimeFor(r.languageId);
    if (!rt) return { ok: true, found: false, senses: [], reason, message: reason === 'no-pack' ? `No pack with a dictionary is installed for ${r.languageId}.` : 'No dictionary location is configured. Open GoLearn setup.' };
    try {
      const g = await rt.gloss(lemma, pos);
      if (!g || !Array.isArray(g.senses) || !g.senses.length) return { ok: true, found: false, senses: [], reason: 'not-found' };
      const senses = [...new Set(g.senses.map((s) => cleanText(s.gloss, 160)).filter((s): s is string => !!s))].slice(0, 6);
      const attribution = cleanText(g.attribution, 200);
      if (attribution) void stampAttribution(r.languageId, attribution);
      return { ok: true, found: senses.length > 0, senses, ...(attribution ? { attribution } : {}), ...(senses.length ? {} : { reason: 'not-found' as const }) };
    } catch {
      return { ok: true, found: false, senses: [], reason: 'offline', message: 'The dictionary could not be reached.' };
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

  return { glossFor, explainFor, packAvailable };
}

export type GlossService = ReturnType<typeof createGlossService>;
