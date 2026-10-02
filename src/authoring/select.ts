/**
 * Which documents are a course's own controlled texts, in what reading order, and which stage each belongs to.
 * Pure (no file system); the scripts supply the catalogue.
 */
import type { CorpusDocument } from '../ingest/format';
import { NO_STAGE } from './analyse';

/** Course-written: owner-authored or generated text that is not Scripture. */
export const isCourseWritten = (doc: CorpusDocument): boolean =>
  doc.contentType !== 'scripture' && (doc.source.rights === 'owner-authored' || doc.source.rights === 'generated');

/** Order of stage keys: "0", "1", … then "g1"/"s5"-style keys, then other keys, then "open", then '?'. */
export function compareStageKeys(a: string, b: string): number {
  const cls = (k: string): number => (k === NO_STAGE ? 4 : k === 'open' ? 3 : /^\d+$/.test(k) ? 0 : /^[a-z]+\d+$/i.test(k) ? 1 : 2);
  const num = (k: string): number => Number(/(\d+)$/.exec(k)?.[1] ?? 0);
  return cls(a) - cls(b) || num(a) - num(b) || (a < b ? -1 : a > b ? 1 : 0);
}

export type StageOf = (doc: CorpusDocument) => string | undefined;

/** A stage function from a slug → stage map, falling back to `fallback` for a slug the map does not list. */
export function stageOfFromMap(map: Readonly<Record<string, string>>, fallback?: StageOf): StageOf {
  return (doc) => {
    const slug = doc.work?.slug;
    if (slug !== undefined && Object.hasOwn(map, slug)) return map[slug];
    return fallback?.(doc);
  };
}

/** Stage function from a course catalogue's works: the work's slug is the last part of its id, its stage key the last part of its stageId. */
export function stageOfFromWorks(works: ReadonlyArray<{ id: string; stageId: string }>): StageOf {
  const map = new Map(works.map((w) => [w.id.slice(w.id.lastIndexOf(':') + 1), w.stageId.slice(w.stageId.lastIndexOf(':') + 1)] as const));
  return (doc) => (doc.work ? map.get(doc.work.slug) : undefined);
}

/** The course-written documents of a language, in reading order: (stage, work slug, chapter index, id). */
export function selectCourseTexts(docs: readonly CorpusDocument[], lang: string, stageOf: StageOf): CorpusDocument[] {
  const stage = (d: CorpusDocument): string => stageOf(d) || NO_STAGE;
  return docs
    .filter((d) => d.lang === lang && isCourseWritten(d))
    .sort((a, b) =>
      compareStageKeys(stage(a), stage(b))
      || (a.work?.slug ?? '').localeCompare(b.work?.slug ?? '', 'en')
      || (a.work?.chapter?.index ?? 0) - (b.work?.chapter?.index ?? 0)
      || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
