/** The original seed texts of the bundled corpus (three per language); every other bundled document is a course text. Not a test file. */
import { loadBundledCorpus, type CorpusDocument } from '../../src/ingest';

export const SEED_IDS: readonly string[] = ['bible-1john-1', 'dialogue-01', 'story-01'];
export const isSeed = (d: Pick<CorpusDocument, 'id'>): boolean => SEED_IDS.includes(d.id);
export const loadSeedCorpus = (): CorpusDocument[] => loadBundledCorpus().filter(isSeed);
export const loadCourseCorpus = (): CorpusDocument[] => loadBundledCorpus().filter((d) => !isSeed(d));
