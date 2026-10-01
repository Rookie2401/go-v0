/**
 * Reads of the catalogue for a course with streams (Spanish): its streams, its doors, the works of a door paged through
 * `catalog.findWorks`, and how much is behind each door. Nothing here loads a catalogue whole: every read is one page.
 *
 * Doors are an orientation. `SPANISH_DOORS` lives with the course data; a course with streams but no door list gets one door per
 * available stream. The listening stream and door are never shown (GoListen is deferred), and neither is a door whose stream is
 * switched off.
 */
import { useEffect, useMemo, useState } from 'react';
import type { CatalogText, CourseCatalog, LanguageCode, Library, Stage, Stream, Work } from '../../core';
import { ids } from '../../core';
import { SPANISH_COURSE_ID, SPANISH_DOORS } from '../../course/spanish';
import { useApp } from '../context';
import { usePreview } from '../prefs';

export const PAGE_SIZE = 20;

export interface Door {
  key: string;
  label: string;
  stream?: string;
  domain?: string;
  /** Shelf keys ('s5', 's6', 's7') the door covers. */
  stages?: readonly string[];
}

/** The streams of a course; empty (never an error) for a course without them or when the catalogue cannot say. */
export async function streamsOf(catalog: CourseCatalog, courseId: string): Promise<Stream[]> {
  try { return typeof catalog.streams === 'function' ? await catalog.streams(courseId) : []; } catch { return []; }
}

/** The shelves of a course (stages of kind 'shelf'): an orientation for browsing, never a sequence and never a lock. */
export async function shelvesOf(catalog: CourseCatalog, courseId: string): Promise<Stage[]> {
  try { return (await catalog.stages(courseId)).filter((s) => s.kind === 'shelf').sort((a, b) => a.index - b.index); } catch { return []; }
}

/** The doors a course offers, only those that point at something this build can show. */
export function doorsFor(courseId: string, streams: readonly Stream[]): Door[] {
  const available = new Set(streams.filter((s) => s.available).map((s) => s.key));
  const base: readonly Door[] = courseId === SPANISH_COURSE_ID
    ? SPANISH_DOORS
    : streams.filter((s) => s.available && s.kind !== 'personal').map((s) => ({ key: s.key, label: s.label, stream: s.key }));
  return base.filter((d) => d.key !== 'listening' && (!d.stream || available.has(d.stream)));
}

export interface WorkFilters {
  stream?: string;
  domain?: string;
  variety?: string;
  rights?: string;
  text?: string;
  /** One shelf key ('s3'), or the shelves a door covers. */
  stages?: readonly string[];
}

/**
 * One page of works. A door that covers several shelves is read shelf by shelf and merged, so the cost of a page is a few small
 * queries, not the catalogue.
 */
export async function fetchWorks(catalog: CourseCatalog, courseId: string, f: WorkFilters, offset: number, limit = PAGE_SIZE): Promise<{ total: number; items: Work[] }> {
  const base = { courseId, ...(f.stream ? { stream: f.stream } : {}), ...(f.domain ? { domain: f.domain } : {}), ...(f.variety ? { variety: f.variety } : {}), ...(f.rights ? { rights: f.rights } : {}), ...(f.text ? { text: f.text } : {}) };
  const stages = f.stages ?? [];
  if (stages.length <= 1) return catalog.findWorks({ ...base, ...(stages[0] ? { stageId: ids.stage(courseId, stages[0]) } : {}), offset, limit });
  const parts = await Promise.all(stages.map((key) => catalog.findWorks({ ...base, stageId: ids.stage(courseId, key), offset: 0, limit: offset + limit })));
  const merged = parts.flatMap((p) => p.items).sort((a, b) => a.order - b.order);
  return { total: parts.reduce((n, p) => n + p.total, 0), items: merged.slice(offset, offset + limit) };
}

/**
 * What stands behind a door: texts the library holds (only published ones outside preview mode, as everywhere) and works the catalogue
 * lists. A listed work is a recommendation, not a text: the two are counted apart so the page never calls a recommendation a text.
 */
export async function countBehind(catalog: CourseCatalog, library: Library, courseId: string, lang: LanguageCode, door: Door, publishedOnly: boolean): Promise<{ texts: number; works: number }> {
  try {
    const works = (await fetchWorks(catalog, courseId, { stream: door.stream, domain: door.domain, stages: door.stages }, 0, 1)).total;
    let texts = 0;
    for (const key of door.stages?.length ? door.stages : [undefined]) {
      texts += (await library.search({ lang, ...(door.stream ? { stream: door.stream } : {}), ...(door.domain ? { domain: door.domain } : {}), ...(key ? { stageId: ids.stage(courseId, key) } : {}), publishedOnly, limit: 1 })).total;
    }
    return { texts, works };
  } catch { return { texts: 0, works: 0 }; }
}

/** The streams of the active course (null while loading, empty for a course without any). */
export function useStreams(): Stream[] | null {
  const { catalog, course } = useApp();
  const [streams, setStreams] = useState<Stream[] | null>(null);
  useEffect(() => {
    let live = true;
    setStreams(null);
    void streamsOf(catalog, course.id).then((s) => { if (live) setStreams(s); });
    return () => { live = false; };
  }, [catalog, course.id]);
  return streams;
}

/** The doors of the active course with how much is behind each (undefined until counted). */
export function useDoors(): { doors: Door[]; counts: Map<string, { texts: number; works: number }> } {
  const { catalog, library, course, lang } = useApp();
  const preview = usePreview();
  const streams = useStreams();
  const doors = useMemo(() => (streams ? doorsFor(course.id, streams) : []), [streams, course.id]);
  const [counts, setCounts] = useState<Map<string, { texts: number; works: number }>>(new Map());
  useEffect(() => {
    let live = true;
    setCounts(new Map());
    void Promise.all(doors.filter((d) => d.key !== 'your-books').map(async (d) => [d.key, await countBehind(catalog, library, course.id, lang, d, !preview)] as const))
      .then((rows) => { if (live) setCounts(new Map(rows)); });
    return () => { live = false; };
  }, [catalog, library, course.id, lang, doors, preview]);
  return { doors, counts };
}

/** Where a door leads. The Bible door is the Scripture library; Your Books is its own page; the rest are catalogue pages. */
export function doorPath(d: Door): string {
  if (d.key === 'your-books') return '/books';
  if (d.key === 'bible') return '/scripture';
  return `/explore/${encodeURIComponent(d.key)}`;
}

/** The catalogue entries of one work that the library holds, in chapter order (the library serves them from its work index). */
export async function libraryChapters(library: Library, lang: LanguageCode, work: Work): Promise<CatalogText[]> {
  try {
    const { items } = await library.search({ lang, workId: work.id, limit: 200 });
    return items.filter((t) => t.workId === work.id);
  } catch { return []; }
}
