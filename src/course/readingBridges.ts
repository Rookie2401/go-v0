import records from './reading-bridge-works.json';
import type { LanguageCode, Work, WorkRights } from '../core';

export function readingBridgeWorks(lang: LanguageCode): Work[] {
  const rows = (records as unknown as Partial<Record<LanguageCode, Partial<Work>[]>>)[lang] ?? [];
  return rows.map((row) => {
    const sourceRights = row.rights as WorkRights | undefined;
    const canBundle = typeof sourceRights?.canBundle === 'boolean' ? sourceRights.canBundle : false;
    const rights: WorkRights = {
      ...(sourceRights ?? {} as WorkRights),
      copyrightStatus: sourceRights?.copyrightStatus ?? 'unknown',
      permission: sourceRights?.permission ?? 'unknown',
      canBundle,
      userImportOnly: typeof sourceRights?.userImportOnly === 'boolean' ? sourceRights.userImportOnly : !canBundle,
      audiobook: sourceRights?.audiobook ?? 'unknown',
      verified: sourceRights?.verified === true,
    };
    return {
      ...row,
      rights,
      // `purpose` and `bibliographyVerified` are required by Work, but acquired manifests may omit
      // either. Keep their provenance and rights intact; unknown purpose stays explicitly unknown.
      purpose: Array.isArray(row.purpose) ? row.purpose : [],
      bibliographyVerified: row.bibliographyVerified === true,
    } as Work;
  });
}

/** Upgrade existing recommendations without duplicating their catalogue identity or bibliographic facts. */
export function mergeReadingBridgeWorks(base: Work[], lang: LanguageCode): Work[] {
  const additions = new Map(readingBridgeWorks(lang).map((work) => [work.id, work]));
  const merged = base.map((work) => {
    const acquired = additions.get(work.id);
    if (!acquired) return work;
    additions.delete(work.id);
    return { ...work, rights: acquired.rights, bibliographyVerified: acquired.bibliographyVerified,
      edition: acquired.edition, sourceUrl: acquired.sourceUrl, ingestion: acquired.ingestion, readiness: acquired.readiness,
      stageId: acquired.stageId, notes: acquired.notes };
  });
  return [...merged, ...additions.values()];
}
