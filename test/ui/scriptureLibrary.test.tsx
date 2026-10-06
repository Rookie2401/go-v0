// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { CatalogText } from '../../src/core';
import { CANON } from '../../src/library/canon';
import { AppRoutes, Shell } from '../../src/ui/App';
import { buildFixtureText } from '../../src/core';
import { button, click, makeHarness, q, qa, type Mounted } from './harness';
import { seedJohn } from './fixtures';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

function fullScripture(lang: 'es' | 'th' | 'sq' = 'es'): CatalogText[] {
  const rows: CatalogText[] = [];
  let running = 0;
  for (const [book, chapters] of CANON) {
    for (let chapter = 1; chapter <= chapters; chapter++) {
      running++;
      rows.push({
        id: `text:${lang}:bible-${book.toLowerCase()}-${chapter}`, lang, title: `${book} ${chapter}`,
        chapter: running, stream: 'scripture', streams: ['scripture'], rights: 'verified-public-domain',
        location: 'library', published: true, features: { words: 100, sentences: 100, uniqueForms: 10, meanSentenceWords: 1 },
      });
    }
  }
  return rows;
}

function availableChapterCount(container: HTMLElement): number {
  return qa(container, 'nav[aria-label="Books"] .lib__group--3 > .lib__head .lib__meta')
    .reduce((sum, node) => sum + Number(node.textContent?.match(/^(\d+) chapters? available$/)?.[1] ?? 0), 0);
}

describe('full Scripture directory', () => {
  it('shows all canonical metadata and opens Revelation 22 lazily', async () => {
    const rows = fullScripture();
    const h = await makeHarness({ library: rows });
    await seedJohn(h.store); // resident starter chapter overlaps a lazy chapter by canonical reference
    mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: '/scripture' });

    expect(qa(mounted.container, 'nav[aria-label="Books"] .lib__group--3')).toHaveLength(66);
    expect(availableChapterCount(mounted.container)).toBe(1189);

    await click(button(mounted.container, /New Testament/));
    await click(button(mounted.container, /^Epistles/));
    await click(button(mounted.container, /^Revelation/));
    const revelation22 = qa<HTMLAnchorElement>(mounted.container, 'a.entry--chapter').find((link) => link.textContent?.includes('REV 22'))!;
    expect(revelation22).toBeTruthy();
    await click(revelation22);
    expect(h.library.opened).toContain('text:es:bible-rev-22');
  });

  it('shows the full Thai directory without resident Scripture rows', async () => {
    const h = await makeHarness({ courseId: 'thailand-th', library: fullScripture('th') });
    mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: '/scripture' });
    expect(qa(mounted.container, 'nav[aria-label="Books"] .lib__group--3')).toHaveLength(66);
    expect(availableChapterCount(mounted.container)).toBe(1189);
    expect(q(mounted.container, '[data-testid="starter-passages"]')).toBeNull();
  });

  it('keeps a distinct resident Albanian passage beside a lazy row at the same canon position', async () => {
    const rows = fullScripture('sq');
    const h = await makeHarness({ courseId: 'albania-sq', library: rows });
    const resident = await buildFixtureText(h.store, {
      lang: 'sq', slug: 'starter-john-3', title: 'Ungjilli · Gjoni 3:16', kind: 'scripture',
      scripture: { book: 'JHN', chapter: 3 },
      sentences: [{ tokens: [{ surface: 'Sepse', lemma: 'sepse' }] }],
    });
    await h.store.texts.put({ ...resident, published: true });
    mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: '/scripture' });

    expect(mounted.container.textContent).toContain('Ungjilli · Gjoni 3:16');
    expect(mounted.container.textContent).toContain('JHN 3');
    expect(mounted.container.textContent).toContain('1189 chapters');
  });
});

describe('a bundled sample of a chapter the library holds whole', () => {
  const libraryRow = (slug: string, title: string, chapter: number, sentences: number): CatalogText => ({
    id: `text:de:${slug}`, lang: 'de', title, chapter, stream: 'scripture', streams: ['scripture'], rights: 'verified-public-domain',
    location: 'library', published: true, features: { words: 100, sentences, uniqueForms: 10, meanSentenceWords: 1 },
  });
  const sample = (h: Awaited<ReturnType<typeof makeHarness>>, slug: string, title: string, book: string, chapter: number, verses: number[]) => buildFixtureText(h.store, {
    lang: 'de', slug, title, kind: 'scripture', scripture: { book, chapter },
    sentences: verses.map((v) => ({ tokens: [{ surface: 'Wort' }], verseRefs: [`${book}.${chapter}.${v}`] })),
  });

  it('lists the chapter once, as the library chapter; a sample the library chapter does not cover, and an excerpt across chapters, stay', async () => {
    const h = await makeHarness({
      courseId: 'germany-de',
      library: [libraryRow('bible-gen-1-complete', '1. Mose 1', 1, 31), libraryRow('bible-psa-1-complete', 'Psalm 1', 479, 2), libraryRow('bible-1john-1-complete', '1. Johannes 1', 1160, 10)],
    });
    const gen = await sample(h, 'bible-gen-1', '1. Mose 1', 'GEN', 1, [1, 2, 3]);
    const psa = await sample(h, 'bible-psa-1', 'Psalm 1', 'PSA', 1, [1, 2, 3, 4, 5, 6]); // longer than the library's two sentences
    const john = await buildFixtureText(h.store, {
      lang: 'de', slug: 'bible-1john-1', title: '1. Johannes 1,8–9; Johannes 3,16', kind: 'scripture', scripture: { book: '1JN', chapter: 1 },
      sentences: [{ tokens: [{ surface: 'Wort' }], verseRefs: ['1JN.1.8'] }, { tokens: [{ surface: 'Wort' }], verseRefs: ['JHN.3.16'] }],
    });
    localStorage.setItem('go.scripture.open.de', JSON.stringify(['t:old', 'd:law', 'b:GEN', 't:new', 'd:letters', 'b:1JN', 'd:writings', 'b:PSA', 'other']));
    mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: '/scripture' });
    const rows = (id: string) => mounted!.container.querySelectorAll(`[data-text-id="${id}"]`).length;
    expect(rows('text:de:bible-gen-1-complete')).toBe(1);
    expect(rows(gen.id)).toBe(0); // the sample is not listed beside the complete chapter
    expect(rows(psa.id)).toBe(1); // the library chapter has fewer sentences than the sample has verses: nothing is hidden by a shorter text
    expect(rows(john.id)).toBe(1); // a cross-chapter excerpt is its own passage
    expect(await h.store.texts.get(gen.id)).toBeDefined(); // hidden from the list only; nothing is deleted
  });
});
