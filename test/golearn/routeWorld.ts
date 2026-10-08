/**
 * A small imaginary learner for the route tests (R4): one completed text, five known words, and a synthetic whole library that
 * `recommend()` ranks. Built for Spanish AND German so that what the shipped courses are offered can be pinned
 * (routeGolden.test.ts) and the new route rules can be shown to change only what they say they change.
 */
import { buildFixtureText, ids } from '../../src/core';
import type { CatalogText, TextProfile } from '../../src/core';
import { putCatalogRows, searchCatalog } from '../../src/library/postings';
import type { CatalogPager } from '../../src/golearn/candidates';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { t } from './courseFixtures';

export const U = 'u1';
export type RouteLang = 'es' | 'de';
export const COURSE_OF: Record<RouteLang, string> = { es: 'honduras-es', de: 'germany-de' };

/** The words the learner knows, as forms and as lemmas. */
export const KNOWN_WORDS = [['hijo', 'NOUN'], ['casa', 'NOUN'], ['agua', 'NOUN'], ['y', 'CCONJ'], ['sol', 'NOUN']] as const;

export interface RouteWorld {
  h: Harness;
  lang: RouteLang;
  idOf(slug: string): string;
  row(slug: string, over?: Partial<CatalogText>): CatalogText;
  /** `known` per cent of the 100 words are known lemmas, the rest one unknown lemma. */
  at(slug: string, known: number): TextProfile;
  /** A profile from [lemma key, count] parts (forms are the lemma words). */
  prof(slug: string, parts: Array<[string, number]>): TextProfile;
  /** Puts catalogue rows and returns the whole-library deps for them (profiles by text id). */
  catalogue(list: Array<{ row: CatalogText; profile: TextProfile }>): Promise<{ pager: CatalogPager; profileOf: (id: string) => Promise<TextProfile | undefined> }>;
  entry(slug: string, known: number, over?: Partial<CatalogText>): { row: CatalogText; profile: TextProfile };
}

export async function routeWorld(lang: RouteLang = 'es', opts: { base?: boolean } = {}): Promise<RouteWorld> {
  const h = createHarness();
  const course = COURSE_OF[lang];
  await h.seed(U, course);
  const idOf = (slug: string) => ids.text(lang, slug);
  const row = (slug: string, over: Partial<CatalogText> = {}): CatalogText => ({
    id: idOf(slug), lang, title: `Text ${slug}`, workId: ids.work(course, `w-${slug}`), stream: 'library', domains: ['history'],
    rights: 'verified-public-domain', location: 'library', published: true,
    features: { words: 800, sentences: 60, uniqueForms: 300, meanSentenceWords: 13 }, ...over,
  });
  const profileOf = (id: string, parts: Array<[string, number]>): TextProfile => {
    const words = parts.reduce((n, [, c]) => n + c, 0);
    return {
      textId: id, lang, analyzers: ['adapter-test@1'], words,
      forms: parts.map(([k, n]) => [k.split(':')[0], n] as [string, number]),
      lemmas: parts.map(([k, n]) => [`lemma:${lang}:${k}`, n] as [string, number]),
      phrases: [], patterns: [],
      features: { words, sentences: 10, uniqueForms: parts.length, meanSentenceWords: 10 },
    };
  };
  const at = (slug: string, known: number): TextProfile => profileOf(idOf(slug), [['hijo:NOUN', known], [`rio${slug.length}${slug}:NOUN`, 100 - known]]);
  const pager: CatalogPager = (q) => searchCatalog(h.store, q);
  const world: RouteWorld = {
    h, lang, idOf, row, at, prof: (slug, parts) => profileOf(idOf(slug), parts),
    async catalogue(list) {
      await putCatalogRows(h.store, list.map((x) => x.row));
      const byId = new Map(list.map((x) => [x.row.id, x.profile]));
      return { pager, profileOf: async (id) => byId.get(id) };
    },
    entry: (slug, known, over) => ({ row: row(slug, over), profile: at(slug, known) }),
  };
  if (opts.base !== false) {
    const base = idOf('base');
    await buildFixtureText(h.store, { lang, slug: 'base', kind: 'story', title: 'base', sentences: [{ tokens: [t('sol', 'sol', 'NOUN'), t('habla', 'hablar', 'VERB')] }, { tokens: [t('sol', 'sol', 'NOUN')] }] });
    await h.understood(U, lang, base, [0, 1], 'a');
    await h.complete(U, lang, base, 'a');
    await putCatalogRows(h.store, [row('base', { id: base })]);
    for (const [w, pos] of KNOWN_WORDS) {
      await h.mark(U, lang, ids.form(lang, w), 'known', 'form');
      await h.mark(U, lang, `lemma:${lang}:${w}:${pos}`, 'known', 'lemma');
    }
  }
  return world;
}

/** A ladder unit already in the store: a short text with a few tokens. */
export async function ladderUnit(w: RouteWorld, slug: string, words: string[] = ['sol', 'sol', 'agua']) {
  await buildFixtureText(w.h.store, { lang: w.lang, slug, kind: 'story', title: `Unit ${slug}`, sentences: words.map((x) => ({ tokens: [t(x, x, 'NOUN')] })) });
  return w.idOf(slug);
}
