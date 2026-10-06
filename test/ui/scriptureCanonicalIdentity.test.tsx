// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { buildFixtureText, type CatalogText, type LanguageCode } from '../../src/core';
import { AppRoutes, Shell } from '../../src/ui/App';
import { makeHarness, type Mounted } from './harness';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

describe('Scripture canonical identity', () => {
  it.each<[LanguageCode, string]>([['de', 'germany-de'], ['es', 'honduras-es'], ['hi', 'india-hi']])(
    'keeps the complete %s chapter when a same-title seed has different canonical identity', async (lang, courseId) => {
      const full: CatalogText = {
        id: `text:${lang}:complete-1john-1`, lang, title: '1 John 1', chapter: 1160,
        stream: 'scripture', streams: ['scripture'],
        rights: 'verified-public-domain', location: 'library', published: true,
        features: { words: 100, sentences: 10, uniqueForms: 20, meanSentenceWords: 10 },
      };
      const h = await makeHarness({ courseId, library: [full] });
      const seed = await buildFixtureText(h.store, {
        lang, slug: 'seed-1john-1', title: full.title, kind: 'scripture', scripture: { book: '1JN', chapter: 1 },
        sentences: [
          { tokens: [{ surface: 'Test', isWord: true }], verseRefs: ['1JN.1.9'] },
          { tokens: [{ surface: 'Test', isWord: true }], verseRefs: ['JHN.3.16'] },
        ],
      });
      await h.store.texts.put({ ...seed, chapter: { index: 1160 } });
      localStorage.setItem(`go.scripture.open.${lang}`, JSON.stringify(['t:new', 'd:letters', 'b:1JN']));
      mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: '/scripture' });
      // Opening the book mounts its chapter entries even if a division's UI ID changes.
      const head = mounted.container.querySelector<HTMLButtonElement>('[data-group="b:1JN"] button');
      if (head?.getAttribute('aria-expanded') === 'false') head.click();
      const entries = mounted.container.querySelectorAll(`[data-text-id="${full.id}"]`);
      expect(entries).toHaveLength(1);
      expect(entries[0].querySelector('a')?.getAttribute('href')).toContain(encodeURIComponent(full.id));
      const other = mounted.container.querySelector<HTMLButtonElement>('[data-group="other"] button');
      await act(async () => { if (other?.getAttribute('aria-expanded') === 'false') other.click(); });
      const supplemental = mounted.container.querySelector(`[data-group="other"] [data-text-id="${seed.id}"]`);
      expect(supplemental).not.toBeNull();
      expect(mounted.container.querySelector(`[data-group="b:1JN"] [data-text-id="${seed.id}"]`)).toBeNull();
      expect(await h.store.texts.get(seed.id)).toBeDefined();
    },
  );
});
