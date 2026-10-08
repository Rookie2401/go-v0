/**
 * The library runtime: `createLibrary` implements the `Library` contract (core/contracts/library.ts).
 *
 * Browser-safe: it reads a built library over `fetch` (see format.ts for the layout) and the store through the
 * ordinary `AppStore`. Nothing is loaded whole:
 *   - the manifest is one small file; an index shard is fetched and put into the `catalog` table only when a query
 *     can need it (a query for one stream installs only the shards that list that stream); a rebuilt library replaces
 *     the rows of the old one;
 *   - a page is read through the posting lists (postings.ts), never by listing the table;
 *   - a profile is fetched for the one text asked about (a small cache keeps the last few);
 *   - a text's documents are fetched and imported only by `open`.
 * A library that is missing, unreachable or malformed is the normal state: `info` is undefined and everything else
 * works on the texts already in the store.
 */
import type { AdapterRegistry, AppStore, CatalogText, LanguageCode, LexiconSource, Library, LibraryInfo, LibraryQuery, Text, TextProfile } from '../core';
import { LANGUAGES, ids } from '../core';
import { importDocuments } from '../ingest/import';
import type { CorpusDocument } from '../ingest/format';
import { parseManifest, parseShard, safeRelative, type LibraryManifest } from './format';
import { putCatalogRows, removeCatalogRows, searchCatalog } from './postings';
import { indexStoredTexts, profileOfStored } from './store-index';

export interface LibraryDeps {
  store: AppStore;
  adapters: AdapterRegistry;
  /** Where the built library lives (default '/library'); a missing library is the normal state. */
  baseUrl?: string;
  fetch?: typeof fetch;
  lexicon?: (lang: LanguageCode) => LexiconSource | undefined;
  clock?: () => string;
}

type Fetched = { ok: true; value: unknown } | { ok: false; definite: boolean };

interface InstallState { key: string; shards: string[] }
const installKey = (lang: LanguageCode) => `library:inst:${lang}`;

const PROFILE_CACHE = 64;
const protectedAssessment = (text: Text | undefined): boolean => !!text && (text.readingAssessmentId !== undefined || text.listeningAssessmentId !== undefined || text.curriculum?.role === 'assessment');

const langOfTextId = (textId: string): LanguageCode | undefined => {
  const m = /^text:([a-z]+):/.exec(textId);
  return m && (LANGUAGES as readonly string[]).includes(m[1]) ? (m[1] as LanguageCode) : undefined;
};

const isProfile = (v: unknown, textId: string): v is TextProfile => {
  const p = v as Partial<TextProfile> | null;
  return !!p && typeof p === 'object' && p.textId === textId && Array.isArray(p.forms) && Array.isArray(p.lemmas) && Array.isArray(p.phrases) && Array.isArray(p.patterns)
    && typeof p.words === 'number' && !!p.features && typeof p.features.words === 'number';
};

export function createLibrary(deps: LibraryDeps): Library {
  const { store, adapters } = deps;
  const base = (deps.baseUrl ?? '/library').replace(/\/+$/, '');
  const clock = deps.clock ?? (() => new Date().toISOString());
  const doFetch: typeof fetch | undefined = deps.fetch ?? (typeof fetch === 'function' ? fetch : undefined);

  /** One file of the built library. 404 and unparsable bodies are "definitely not there"; a network failure is transient. */
  async function getJson(lang: LanguageCode, relative: string): Promise<Fetched> {
    if (!doFetch || !safeRelative(relative)) return { ok: false, definite: true };
    let res: Response;
    try { res = await doFetch(`${base}/${lang}/${relative}`); } catch { return { ok: false, definite: false }; }
    if (res.status === 404) return { ok: false, definite: true };
    if (!res.ok) return { ok: false, definite: false };
    try { return { ok: true, value: JSON.parse(await res.text()) as unknown }; } catch { return { ok: false, definite: true }; }
  }

  const manifests = new Map<LanguageCode, Promise<LibraryManifest | undefined>>();
  function loadManifest(lang: LanguageCode): Promise<LibraryManifest | undefined> {
    let p = manifests.get(lang);
    if (!p) {
      p = getJson(lang, 'manifest.json').then((r) => {
        if (!r.ok) { if (!r.definite) manifests.delete(lang); return undefined; }
        return parseManifest(r.value, lang);
      });
      manifests.set(lang, p);
    }
    return p;
  }

  // ── installing index shards into the catalog table ──

  const locks = new Map<LanguageCode, Promise<unknown>>();
  const serial = <T,>(lang: LanguageCode, fn: () => Promise<T>): Promise<T> => {
    const run = (locks.get(lang) ?? Promise.resolve()).then(fn, fn);
    locks.set(lang, run.catch(() => undefined));
    return run;
  };

  const shardsFor = (m: LibraryManifest, q?: LibraryQuery): string[] => {
    if (q?.location === 'bundled' || q?.location === 'personal') return [];
    return m.shards.filter((s) => !q?.stream || s.streams.includes(q.stream) || s.stream === q.stream).map((s) => s.file);
  };

  function sync(lang: LanguageCode, q?: LibraryQuery): Promise<void> {
    return serial(lang, async () => {
      // A newly protected resident passage must disappear even before an explicit index refresh.
      const protectedIds = (await store.texts.where('lang', lang)).filter(protectedAssessment).map(text => text.id);
      if (protectedIds.length) await removeCatalogRows(store, protectedIds, clock());
      const m = await loadManifest(lang);
      if (!m) return;
      const key = `${m.id}#${m.digest}`;
      const raw = await store.meta.get(installKey(lang));
      let state: InstallState | undefined;
      try { state = raw ? (JSON.parse(raw.value) as InstallState) : undefined; } catch { state = undefined; }
      const saveState = (s: InstallState) => store.meta.put({ id: installKey(lang), value: JSON.stringify(s), updatedAt: clock() });
      if (!state || state.key !== key) {
        // a new build replaces the rows of the old one
        if (state) {
          const old = (await store.catalog.where('location', 'library')).filter((r) => r.lang === lang).map((r) => r.id);
          await removeCatalogRows(store, old, clock());
        }
        state = { key, shards: [] };
        await saveState(state);
      }
      for (const file of shardsFor(m, q)) {
        if (state.shards.includes(file)) continue;
        const r = await getJson(lang, file);
        if (!r.ok) continue; // not installed; the next query tries again
        const parsed = parseShard(r.value, lang);
        const resident = await store.texts.getMany(parsed.map(row => row.id));
        await putCatalogRows(store, parsed.filter((_, i) => !protectedAssessment(resident[i])), clock());
        state = { key, shards: [...state.shards, file] };
        await saveState(state);
      }
    });
  }

  // ── profiles of library texts ──

  const profiles = new Map<string, TextProfile>();
  const remember = (p: TextProfile) => {
    profiles.delete(p.textId);
    profiles.set(p.textId, p);
    if (profiles.size > PROFILE_CACHE) profiles.delete(profiles.keys().next().value as string);
  };

  async function entry(textId: string): Promise<CatalogText | undefined> {
    if (protectedAssessment(await store.texts.get(textId))) return undefined;
    const row = await store.catalog.get(textId);
    if (row) return row;
    const lang = langOfTextId(textId);
    if (!lang) return undefined;
    await sync(lang); // a text not installed yet: bring in every shard, then look again
    return store.catalog.get(textId);
  }

  const opening = new Map<string, Promise<Text>>();

  async function openText(textId: string): Promise<Text> {
    const stored = await store.texts.get(textId);
    if (stored) {
      if (protectedAssessment(stored)) throw new Error('Protected assessment material cannot open in the ordinary reader');
      return stored;
    }
    const row = await entry(textId);
    if (!row) throw new Error(`open: "${textId}" is not in the library or the catalogue`);
    if (row.location !== 'library' || !row.documentPath) throw new Error(`open: "${textId}" is not a library text (its documents are not in the built library)`);
    const r = await getJson(row.lang, row.documentPath);
    if (!r.ok) throw new Error(`open: the documents of "${textId}" could not be read from the library`);
    const doc = r.value as CorpusDocument;
    if (doc?.readingAssessmentId !== undefined || doc?.curriculum?.role === 'assessment') throw new Error('Protected assessment material cannot open in the ordinary reader');
    if (!doc || typeof doc !== 'object' || typeof doc.id !== 'string' || doc.lang !== row.lang || ids.text(doc.lang, doc.id) !== textId) {
      throw new Error(`open: the document found for "${textId}" is not that text`);
    }
    const report = await importDocuments(store, adapters, [doc], { lexicon: deps.lexicon, clock });
    const d = report.documents[0];
    if (!d || d.action === 'rejected') {
      const why = d?.issues.filter((i) => i.severity === 'error').map((i) => `${i.path || '(document)'}: ${i.message}`).join('; ');
      throw new Error(`open: "${textId}" could not be imported${why ? ` (${why})` : ''}`);
    }
    const text = await store.texts.get(textId);
    if (!text) throw new Error(`open: "${textId}" was not stored`);
    return text;
  }

  return {
    async info(lang): Promise<LibraryInfo | undefined> {
      const m = await loadManifest(lang);
      return m ? { lang, id: m.id, texts: m.texts, works: m.works, words: m.words, builtAt: m.builtAt } : undefined;
    },

    async search(q) {
      const { alsoLangs, ...base } = q;
      const companions = [...new Set(alsoLangs ?? [])].filter((l) => l !== q.lang);
      if (companions.length === 0) {
        await sync(q.lang, base).catch(() => undefined);
        return searchCatalog(store, base, clock());
      }
      // one list over the course language and its companions: the page is cut across the languages in order
      const want = Math.min(200, Math.max(1, Math.floor(q.limit ?? 30)));
      const offset = Math.max(0, Math.floor(q.offset ?? 0));
      let before = 0;
      let total = 0;
      const items: CatalogText[] = [];
      for (const lang of [q.lang, ...companions]) {
        await sync(lang, { ...base, lang }).catch(() => undefined);
        const room = want - items.length;
        const page = await searchCatalog(store, { ...base, lang, offset: Math.max(0, offset - before), limit: Math.max(1, room) }, clock());
        if (room > 0 && offset - before < page.total) items.push(...page.items.slice(0, room));
        before += page.total;
        total += page.total;
      }
      return { total, items };
    },

    entry,

    async profile(textId) {
      // A lazy profile is only authoritative while the text is still absent from this store. Opening the text can
      // import it with a newer adapter/dictionary and learner-specific analyses; never let the in-memory lazy copy
      // shadow that resident measurement.
      const stored = await store.texts.get(textId);
      if (protectedAssessment(stored)) { profiles.delete(textId); return undefined; }
      if (stored) {
        profiles.delete(textId);
        return profileOfStored(store, textId, clock());
      }
      const cached = profiles.get(textId);
      if (cached) return cached;
      const row = await entry(textId);
      if (!row || row.location !== 'library' || !row.profilePath) return undefined;
      const r = await getJson(row.lang, row.profilePath);
      if (!r.ok || !isProfile(r.value, textId)) return undefined;
      remember(r.value);
      return r.value;
    },

    open(textId) {
      let p = opening.get(textId);
      if (!p) {
        p = openText(textId).finally(() => opening.delete(textId));
        opening.set(textId, p);
      }
      return p;
    },

    indexStore: (lang) => indexStoredTexts(store, lang, clock()),
  };
}
