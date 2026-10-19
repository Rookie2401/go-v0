/** The original seed texts of the bundled corpus (three per language); every other bundled document is a course text. Not a test file. */
import { loadBundledCorpus, type CorpusDocument } from '../../src/ingest';

/** The seed ids of the seven original seed languages; Hebrew's scripture seed is `bible-gen-1` (see SEED_BY_LANG), which is a COURSE text id in German and Spanish, so seed-ness is decided per language. */
export const SEED_IDS: readonly string[] = ['bible-1john-1', 'dialogue-01', 'story-01'];
/** The seed trio of each seed language, in path order. Latin has course texts only (no seed trio). */
export const SEED_BY_LANG: Readonly<Record<string, readonly string[]>> = {
  de: ['bible-1john-1', 'dialogue-01', 'story-01'], el: ['bible-1john-1', 'dialogue-01', 'story-01'], es: ['bible-1john-1', 'dialogue-01', 'story-01'],
  he: ['bible-gen-1', 'dialogue-01', 'story-01'], hi: ['bible-1john-1', 'dialogue-01', 'story-01'], nb: ['bible-1john-1', 'dialogue-01', 'story-01'],
  nn: ['bible-1john-1', 'dialogue-01', 'story-01'], sq: ['bible-1john-1', 'dialogue-01', 'story-01'], th: ['bible-1john-1', 'dialogue-01', 'story-01'],
};
/** Hebrew and Greek: their compiled analysers are seed cores (the full indexes are installed assets), so the coverage bars of the seed tests do not apply to them. */
export const PERIOD_LANGS: readonly string[] = ['he', 'el'];
export const isSeed = (d: Pick<CorpusDocument, 'id' | 'lang'>): boolean => (SEED_BY_LANG[d.lang] ?? SEED_IDS).includes(d.id);
export const loadSeedCorpus = (): CorpusDocument[] => loadBundledCorpus().filter(isSeed);
export const loadCourseCorpus = (): CorpusDocument[] => loadBundledCorpus().filter((d) => !isSeed(d));
