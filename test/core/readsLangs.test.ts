/**
 * Companion languages (`Course.readsLangs`): the Norway course reads Nynorsk beside Bokmål, and the five older courses
 * read exactly their own language. The helpers are the single place that decides it; the library, the voice plan and the
 * language check are tested here against them.
 */
import { describe, expect, it } from 'vitest';
import { COURSES, LANGUAGES, courseForLang, courseLangs, courseReads, createMemoryStore, ids, type AppStore, type CatalogText, type LanguageCode } from '../../src/core';
import { createLibrary, putCatalogRows } from '../../src/library';
import { fitsTeamLanguage } from '../../src/ingest/language';
import { FakeSpeechProvider, makeEnv } from '../golisten/support';
import { catalogRow, clock, registry } from '../library/helpers';

const norway = COURSES.find((c) => c.id === 'norway-nb')!;

describe('courseReads / courseLangs', () => {
  it('the Norway course reads Bokmål (its own language) and Nynorsk (a companion), nothing else', () => {
    expect(norway.lang).toBe('nb');
    expect(norway.readsLangs).toEqual(['nn']);
    expect(courseReads(norway, 'nb')).toBe(true);
    expect(courseReads(norway, 'nn')).toBe(true);
    for (const l of LANGUAGES.filter((x) => x !== 'nb' && x !== 'nn')) expect(courseReads(norway, l), l).toBe(false);
    expect(courseLangs(norway)).toEqual(['nb', 'nn']);
  });

  it('a course without readsLangs reads exactly its own language (the five older courses are unchanged)', () => {
    for (const c of COURSES.filter((x) => x.id !== 'norway-nb')) {
      expect(c.readsLangs, c.id).toBeUndefined();
      expect(courseLangs(c), c.id).toEqual([c.lang]);
      for (const l of LANGUAGES) expect(courseReads(c, l), `${c.id} ${l}`).toBe(l === c.lang);
    }
  });

  it('the courses keep their positions as new ones are appended (Norway, then Hebrew, Greek and Latin in October 2026), and no language has two courses', () => {
    expect(COURSES.map((c) => c.id)).toEqual(['honduras-es', 'albania-sq', 'thailand-th', 'india-hi', 'germany-de', 'norway-nb', 'hebrew', 'greek', 'latin-la']);
    expect(courseForLang('nb').id).toBe('norway-nb');
    expect(new Set(COURSES.map((c) => c.lang)).size).toBe(COURSES.length);
  });
});

describe('the language check for a team that reads a companion language', () => {
  const NYNORSK = 'Det var ein stille ettermiddag i bygda, og borna leika på plassen medan mødrene snakka med naboane. Bestefaren sette seg under treet og byrja å fortelje ei soge som alle kjende, '
    + 'men som ingen vart lei av å høyre. Då han var ferdig, klappa folk, og ei lita jente spurde om han kunne fortelje henne ein gong til dagen etter, fordi ho ville lære henne utanåt.';
  const team = { lang: norway.lang, country: norway.country, readsLangs: norway.readsLangs };

  it('accepts Nynorsk for the Norway team, and turns it away for a team without the companion', () => {
    expect(fitsTeamLanguage(NYNORSK, team).ok).toBe(true);
    expect(fitsTeamLanguage(NYNORSK, team, 'nn').ok).toBe(true);
    expect(fitsTeamLanguage(NYNORSK, { lang: 'nb', country: 'Norway' }, 'nn').ok).toBe(false);
  });
});

describe('library search over the course language and its companions', () => {
  const lib = (store: AppStore) => createLibrary({ store, adapters: registry, clock, fetch: (async () => new Response('', { status: 404 })) as typeof fetch });
  const row = (lang: LanguageCode, n: number): CatalogText => catalogRow(n, { lang, id: ids.text(lang, `obra-${n}`) });

  it('one list, the course language first; paging crosses the languages; no alsoLangs = one language as before', async () => {
    const store = createMemoryStore();
    await putCatalogRows(store, [row('nb', 1), row('nb', 2), row('nb', 3), row('nn', 4), row('nn', 5)], clock());
    const l = lib(store);
    const ids_ = (r: { items: CatalogText[] }) => r.items.map((x) => x.id);
    const all = await l.search({ lang: 'nb', alsoLangs: ['nn'], limit: 200 });
    expect(all.total).toBe(5);
    expect(all.items.map((x) => x.lang)).toEqual(['nb', 'nb', 'nb', 'nn', 'nn']);
    const page1 = await l.search({ lang: 'nb', alsoLangs: ['nn'], limit: 2, offset: 0 });
    const page2 = await l.search({ lang: 'nb', alsoLangs: ['nn'], limit: 2, offset: 2 });
    const page3 = await l.search({ lang: 'nb', alsoLangs: ['nn'], limit: 2, offset: 4 });
    expect([...ids_(page1), ...ids_(page2), ...ids_(page3)]).toEqual(ids_(all));
    expect([page1.total, page2.total, page3.total]).toEqual([5, 5, 5]);
    expect(page2.items.map((x) => x.lang)).toEqual(['nb', 'nn']);
    const own = await l.search({ lang: 'nb', limit: 200 });
    expect(own.total).toBe(3);
    expect(own.items.every((x) => x.lang === 'nb')).toBe(true);
  });
});

describe('the voice plan for a companion language', () => {
  /** A provider that has Bokmål voices only (like Azure, which has no Nynorsk voice). */
  class BokmalOnly extends FakeSpeechProvider {
    override listVoices(lang: LanguageCode) { return lang === 'nn' ? Promise.resolve([]) : super.listVoices(lang); }
  }

  it('is voiced in its own locale when the provider has a voice for it', async () => {
    const { gl } = await makeEnv({ providers: [new FakeSpeechProvider()] });
    const v = await gl.resolveVoice('nn');
    expect(v).toMatchObject({ lang: 'nn', courseId: 'norway-nb', requestedLocale: 'nn-NO', actualLocale: 'nn-NO' });
    expect(v.qaNote ?? '').not.toMatch(/accent is not/);
  });

  it('borrows the course language voice when the provider has none, and says so', async () => {
    const { gl } = await makeEnv({ providers: [new BokmalOnly()] });
    const v = await gl.resolveVoice('nn');
    expect(v).toMatchObject({ lang: 'nn', courseId: 'norway-nb', requestedLocale: 'nn-NO', actualLocale: 'nb-NO' });
    expect(v.qaNote).toMatch(/No nn voice/);
    expect(v.qaNote).toMatch(/Fallback accent/);
  });

  it('refuses a language the course does not read', async () => {
    const { gl } = await makeEnv({ providers: [new FakeSpeechProvider()] });
    await expect(gl.resolveVoice('nn', 'honduras-es')).rejects.toThrow(/not nn/);
  });
});
