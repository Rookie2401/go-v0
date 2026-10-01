/**
 * Fixtures for the course-level reading model (forecast, pace, readiness, history): a small imaginary "book" in Spanish
 * (explicit tokens, no real adapter) whose texts carry `workId` + `chapter`, plus the ladder rows to hang them on.
 */
import { buildFixtureText, ids } from '../../src/core';
import type { AppStore, FixtureSentence, FixtureToken, LanguageCode, Stage, Work } from '../../src/core';
import { DEFAULT_ASSISTANCE } from '../../src/core';

export const t = (surface: string, lemma?: string, pos?: FixtureToken['pos'], gloss?: string): FixtureToken => ({ surface, lemma, pos, gloss });

export const COURSE = 'honduras-es';

export const stageRow = (index: number, key: string, kind: Stage['kind'] = 'grade', lang: LanguageCode = 'es'): Stage => ({
  id: ids.stage(COURSE, key), courseId: COURSE, lang, index, key, label: kind === 'pre-reader' ? 'Stage 0' : `Grade ${index}`, kind, purpose: ['test'],
  assistance: { ...DEFAULT_ASSISTANCE },
});

export const workRow = (slug: string, stageKey: string, role: Work['role'] = 'spine', order = 0, lang: LanguageCode = 'es'): Work => ({
  id: ids.work(COURSE, slug), courseId: COURSE, lang, stageId: ids.stage(COURSE, stageKey), role, order, title: `Book ${slug}`, purpose: [],
  rights: { copyrightStatus: 'unknown', permission: 'unknown', canBundle: false, userImportOnly: true, audiobook: 'unknown', verified: false },
  bibliographyVerified: false,
});

/** A text of a work: one chapter. Sentences are given as token lists; `separator` defaults to a space. */
export async function buildChapter(
  store: AppStore, o: { slug: string; work?: string; chapter?: number; lang?: LanguageCode; title?: string; sentences: FixtureSentence[] },
) {
  const lang = o.lang ?? 'es';
  const text = await buildFixtureText(store, { lang, slug: o.slug, title: o.title ?? o.slug, kind: 'story', sentences: o.sentences });
  if (o.work) {
    await store.texts.put({ ...text, workId: ids.work(COURSE, o.work), ...(o.chapter !== undefined ? { chapter: { index: o.chapter, title: `Chapter ${o.chapter}` } } : {}) });
  }
  return ids.text(lang, o.slug);
}

/** `n` sentences of three known-looking filler words, to pad a text to a size. */
export const filler = (n: number, words: string[] = ['sol', 'luna', 'mar']): FixtureSentence[] =>
  Array.from({ length: n }, () => ({ tokens: words.map((w) => t(w, w, 'NOUN')) }));
