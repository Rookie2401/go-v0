/**
 * Catalogue rows for the texts already in the store (the bundled corpus and the learner's own copies), and the cached
 * profiles of those texts. Cost of a run is proportional to the texts that changed since the last one: each text has a
 * fingerprint (its catalogue facts, content version and analyzers); only a text whose fingerprint differs is measured.
 */
import type { AppStore, CatalogText, ContentSource, LanguageCode, RightsState, Text, TextProfile, Work } from '../core';
import { hash } from '../core';
import { analyzerKeyOf, measureStoredText } from './measure';
import { putCatalogRows, removeCatalogRows } from './postings';

const PROFILE_VERSION = 1;
export const profileCacheKey = (textId: string) => `library:profile:${textId}`;
const fingerprintKey = (textId: string) => `library:fp:${textId}`;

interface CachedProfile { v: number; cv: number; an: string[]; p: TextProfile }

const compact = <T extends object>(o: T): T => {
  const out = { ...o } as Record<string, unknown>;
  for (const k of Object.keys(out)) if (out[k] === undefined || (Array.isArray(out[k]) && (out[k] as unknown[]).length === 0)) delete out[k];
  return out as T;
};

/**
 * The rights state a catalogue row shows. A work's own state (set by a person) wins. Without one it is read from the
 * source conservatively: "public-domain" and "licensed" count as verified only for a published text (the publication
 * gate already insisted that rights were established); everything else is "rights-unverified".
 */
export function rightsStateOf(text: Text, source: ContentSource | undefined, work: Work | undefined): RightsState {
  if (work?.rights.state) return work.rights.state;
  if (text.personalCopy || source?.rights === 'personal-copy' || source?.rights === 'user-private') return 'user-supplied';
  if (source?.rights === 'owner-authored' || source?.rights === 'generated') return 'course-authored';
  if (text.published && source?.rights === 'public-domain') return 'verified-public-domain';
  if (text.published && source?.rights === 'licensed') return 'verified-open-licence';
  return 'rights-unverified';
}

/** The catalogue row of a stored text, without its features. */
export function baseRowOf(text: Text, source: ContentSource | undefined, work: Work | undefined): Omit<CatalogText, 'features'> {
  const personal = text.personalCopy === true || source?.rights === 'personal-copy';
  const streams = [...new Set([...(personal ? ['personal'] : []), ...(work?.streams ?? text.streams ?? [])])];
  const stream = personal ? 'personal' : text.kind === 'scripture' ? 'scripture' : (streams[0] ?? 'library');
  return compact({
    id: text.id, lang: text.lang, title: text.title, workId: text.workId, chapter: text.chapter?.index,
    author: source?.author ?? work?.author, stream, streams: streams.length > 1 ? streams : undefined, stageId: work?.stageId,
    domains: work?.domains ?? text.domains, variety: text.variety ?? work?.variety, region: work?.region, era: work?.era, genre: work?.genre,
    rights: rightsStateOf(text, source, work), location: personal ? 'personal' as const : 'bundled' as const, published: text.published,
  });
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The cached profile of a stored text when it is still valid for its content version and analyzers. */
export async function cachedProfile(store: AppStore, text: Text): Promise<TextProfile | undefined> {
  const row = await store.meta.get(profileCacheKey(text.id));
  if (!row) return undefined;
  try {
    const c = JSON.parse(row.value) as CachedProfile;
    return c.v === PROFILE_VERSION && c.cv === text.contentVersion && sameList(c.an, analyzerKeyOf(text)) ? c.p : undefined;
  } catch { return undefined; }
}

export async function cacheProfile(store: AppStore, text: Text, profile: TextProfile, now: string): Promise<void> {
  const value: CachedProfile = { v: PROFILE_VERSION, cv: text.contentVersion, an: analyzerKeyOf(text), p: profile };
  await store.meta.put({ id: profileCacheKey(text.id), value: JSON.stringify(value), updatedAt: now });
}

/** The profile of a stored text: the cached one when valid, else measured now and cached. Undefined when the text is not stored. */
export async function profileOfStored(store: AppStore, textId: string, now: string): Promise<TextProfile | undefined> {
  const text = await store.texts.get(textId);
  if (!text) return undefined;
  const hit = await cachedProfile(store, text);
  if (hit) return hit;
  const m = await measureStoredText(store, textId);
  if (!m) return undefined;
  await cacheProfile(store, text, m.profile, now);
  return m.profile;
}

/**
 * (Re)index the texts of one language that are in the store. A text whose catalogue row is a library row (it was opened
 * from the built library) is left alone. Returns the number of rows added, changed or removed.
 */
export async function indexStoredTexts(store: AppStore, lang: LanguageCode, now: string): Promise<number> {
  // A listening-assessment text is protected material: it never enters the library index (and a row that an earlier
  // index wrote for one is removed below, because the text is then "no longer in the store" as far as the index goes).
  const resident = await store.texts.where('lang', lang);
  const protectedIds = new Set(resident.filter(t => t.listeningAssessmentId !== undefined || t.readingAssessmentId !== undefined || t.curriculum?.role === 'assessment').map(t => t.id));
  const texts = resident.filter(t => !protectedIds.has(t.id));
  const existing = await store.catalog.getMany(texts.map((t) => t.id));
  const prints = await store.meta.getMany(texts.map((t) => fingerprintKey(t.id)));
  const sources = new Map<string, ContentSource | undefined>();
  const works = new Map<string, Work | undefined>();

  const todo: Array<{ text: Text; base: Omit<CatalogText, 'features'>; print: string }> = [];
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    if (existing[i]?.location === 'library') continue;
    if (!sources.has(text.sourceId)) sources.set(text.sourceId, await store.sources.get(text.sourceId));
    if (text.workId && !works.has(text.workId)) works.set(text.workId, await store.works.get(text.workId));
    const base = baseRowOf(text, sources.get(text.sourceId), text.workId ? works.get(text.workId) : undefined);
    const print = hash(`${JSON.stringify(base)}|${text.contentVersion}|${analyzerKeyOf(text).join(',')}`);
    if (existing[i] && prints[i]?.value === print) continue;
    todo.push({ text, base, print });
  }

  const rows: CatalogText[] = [];
  for (const { text, base } of todo) {
    const m = await measureStoredText(store, text.id);
    if (!m) continue;
    await cacheProfile(store, text, m.profile, now);
    rows.push({ ...base, features: m.features });
  }
  if (rows.length) {
    await putCatalogRows(store, rows, now);
    await store.meta.bulkPut(todo.filter((t) => rows.some((r) => r.id === t.text.id)).map((t) => ({ id: fingerprintKey(t.text.id), value: t.print, updatedAt: now })));
  }

  // rows of texts that are no longer in the store
  const here = new Set(texts.map((t) => t.id));
  const stale: string[] = (await store.catalog.getMany([...protectedIds])).filter((row): row is CatalogText => !!row).map(row => row.id);
  for (const location of ['bundled', 'personal'] as const) {
    for (const r of await store.catalog.where('location', location)) if (r.lang === lang && !here.has(r.id) && !stale.includes(r.id)) stale.push(r.id);
  }
  if (stale.length) {
    await removeCatalogRows(store, stale, now);
    for (const id of stale) { await store.meta.delete(fingerprintKey(id)); await store.meta.delete(profileCacheKey(id)); }
  }
  return rows.length + stale.length;
}
