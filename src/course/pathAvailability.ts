import type { CatalogText, CourseCatalog, Library, Stage, Text, Work } from '../core';
import { getStageContract } from './curriculumPolicy';

export interface PathStage {
  stage: Stage;
  works: Work[];
  texts: CatalogText[];
  heldTexts: Text[];
  publishedWorks: number;
  tokens: number;
  available: boolean;
}
/** Uses actual accessible rows, never the existence of a catalogue recommendation. */
export async function loadCoursePath(catalog: CourseCatalog, library: Library, courseId: string): Promise<PathStage[]> {
  const [stages, works] = await Promise.all([catalog.stages(courseId), catalog.works(courseId)]);
  const eligibleWorks = new Map(works.filter(w => w.role !== 'scripture' && w.role !== 'audio').map(w => [w.id, w]));
  const candidates: CatalogText[] = [];
  let offset = 0;
  if (stages.length) while (true) {
    const page = await library.search({ lang: stages[0].lang, publishedOnly: true, limit: 200, offset });
    candidates.push(...page.items);
    offset += page.items.length;
    if (!page.items.length || offset >= page.total) break;
  }
  return Promise.all(stages.map(async stage => {
    const stageWorks = [...eligibleWorks.values()].filter(w => w.stageId === stage.id);
    const stageWorkIds = new Set(stageWorks.map(w => w.id));
    // Canonical Work placement also recovers older accessible rows with no cached stageId.
    const texts = candidates.filter(t => t.published && t.stream !== 'scripture' && !t.streams?.includes('scripture')
      && t.location !== 'personal' && !!t.workId && stageWorkIds.has(t.workId));
    const resident = (await Promise.all(stageWorks.map(w => catalog.textsOf(w.id)))).flat();
    const heldTexts = resident.filter(t => !t.published && !t.readingAssessmentId && !t.listeningAssessmentId);
    return { stage: { ...stage, contract: stage.contract ?? getStageContract(stage) }, works: stageWorks, texts, heldTexts,
      publishedWorks: new Set(texts.map(t => t.workId)).size, tokens: texts.reduce((n, t) => n + t.features.words, 0), available: texts.length > 0 };
  }));
}
