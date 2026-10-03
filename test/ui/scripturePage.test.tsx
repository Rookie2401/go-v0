// @vitest-environment jsdom
// The Scripture page as Biblia's Home: the canon as nested disclosures (testament → division → book → chapters).
// German is the language under test (five bundled chapters, seeded here); Albanian keeps the previous page.
import { afterEach, describe, expect, it } from 'vitest';
import type { TextViewed } from '../../src/core';
import { buildFixtureText } from '../../src/core';
import { GERMAN_COURSE_ID, GERMAN_STREAMS } from '../../src/course/german';
import { CANON, runningNumber } from '../../src/library/canon';
import { AppRoutes, Shell } from '../../src/ui/App';
import { BOOK_NAMES, SCRIPTURE_LANGS, bookName, canonTree, placeOfRunning } from '../../src/ui/scripture/canon';
import type { Harness, Mounted } from './harness';
import { byLabel, catalogText, check, click, makeHarness, q, qa } from './harness';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });
const app = () => <Shell><AppRoutes /></Shell>;
const german = (o: Parameters<typeof makeHarness>[0] = {}) => makeHarness({ courseId: GERMAN_COURSE_ID, streams: GERMAN_STREAMS, ...o });

const TOKENS = [{ surface: 'Im' }, { surface: 'Anfang' }, { surface: '.', isWord: false }];
const seed = (h: Harness, slug: string, title: string, book: string, chapter: number, o: { published?: boolean } = {}) =>
  buildFixtureText(h.store, { lang: 'de', slug, title, kind: 'scripture', version: 'Luther 1912', scripture: { book, chapter }, sentences: [{ tokens: TOKENS }], ...o });
/** The five bundled German chapters (the last is a partial chapter with its own title). */
async function seedFive(h: Harness) {
  const rows = [
    await seed(h, 'gen-1', '1. Mose 1', 'GEN', 1),
    await seed(h, 'psa-23', 'Psalm 23', 'PSA', 23),
    await seed(h, 'mat-5', 'Matthäus 5', 'MAT', 5),
    await seed(h, 'jhn-3', 'Johannes 3', 'JHN', 3),
    await seed(h, '1jn-1', '1. Johannes 1,8–9; Johannes 3,16', '1JN', 1),
  ];
  return Object.fromEntries(rows.map((t) => [t.scripture!.book, t]));
}
const group = (id: string) => q(mounted!.container, `[data-group="${id}"]`)!;
const head = (id: string) => q<HTMLButtonElement>(group(id), ':scope > button.lib__head')!;
const links = (id: string) => qa<HTMLAnchorElement>(group(id), 'a.entry--chapter');

async function turnPreviewOn(h: Harness) {
  mounted = await h.mount(app(), { router: '/settings' });
  await check(byLabel<HTMLInputElement>(mounted.container, 'Preview unreviewed content'));
  await mounted.unmount();
  mounted = undefined;
}

describe('Scripture page (German): the canon as nested disclosures', () => {
  it('lists both testaments, their divisions and all 66 books, with the English name beside the native one', async () => {
    const h = await german();
    await seedFive(h);
    mounted = await h.mount(app(), { router: '/scripture' });
    const nav = q(mounted.container, 'nav.lib[aria-label="Books"]')!;
    expect(nav).not.toBeNull();
    expect(qa(nav, '[data-group^="t:"] > button .lib__title').map((x) => x.textContent)).toEqual(['Old Testament', 'New Testament']);
    expect(qa(nav, '[data-group^="t:"] > button .lib__native').map((x) => x.textContent)).toEqual(['Altes Testament', 'Neues Testament']);
    expect(qa(nav, '[data-group^="d:"] > button .lib__title').map((x) => x.textContent)).toEqual(
      ['Pentateuch', 'Historical books', 'Poetry and wisdom', 'Major prophets', 'Minor prophets', 'Histories', 'Epistles']);
    expect(qa(nav, '[data-group^="b:"]')).toHaveLength(66);
    // the head carries English and native side by side (and the native name's language)
    const gen = group('b:GEN');
    expect(q(gen, '.lib__title')!.textContent).toBe('Genesis');
    expect(q(gen, '.lib__native')!.textContent).toBe('1. Mose');
    expect(q(gen, '.lib__native')!.getAttribute('lang')).toBe('de');
    // the meta says how much of each level is in Go
    expect(q(group('t:OT'), '.lib__meta')!.textContent).toBe('2 of 39 books');
    expect(q(group('t:NT'), '.lib__meta')!.textContent).toBe('3 of 27 books');
    expect(q(group('b:PSA'), '.lib__meta')!.textContent).toBe('1 chapter available');
  });

  it('opens the testament that has chapters and the first book with chapters; the rest open on a click, to their chapters as links with native titles', async () => {
    const h = await german();
    const t = await seedFive(h);
    mounted = await h.mount(app(), { router: '/scripture' });
    expect(head('t:OT').getAttribute('aria-expanded')).toBe('true');
    expect(head('t:NT').getAttribute('aria-expanded')).toBe('true');
    expect(head('d:law').getAttribute('aria-expanded')).toBe('true');
    expect(head('b:GEN').getAttribute('aria-expanded')).toBe('true');
    expect(head('d:poetry').getAttribute('aria-expanded')).toBe('false');
    expect(head('b:PSA').getAttribute('aria-expanded')).toBe('false');
    // Genesis lists every chapter the canon gives it: one available link, 49 muted rows
    const gen = qa(group('b:GEN'), '.entrylist[role="list"] [role="listitem"]');
    expect(gen).toHaveLength(50);
    expect(links('b:GEN').map((a) => a.querySelector('.entry__native')!.textContent)).toEqual(['1. Mose 1']);
    expect(qa(group('b:GEN'), '.entry--absent')).toHaveLength(49);
    expect(qa(group('b:GEN'), '.entry--absent')[0].textContent).toContain('not yet in GoLearn');

    // Psalms, Matthew, 1 John: open the division, then the book
    for (const [div, book, title, id] of [['d:poetry', 'b:PSA', 'Psalm 23', t.PSA.id], ['d:histories', 'b:MAT', 'Matthäus 5', t.MAT.id], ['d:epistles', 'b:1JN', '1. Johannes 1,8–9; Johannes 3,16', t['1JN'].id]] as const) {
      if (head(div).getAttribute('aria-expanded') !== 'true') await click(head(div));
      await click(head(book));
      expect(head(book).getAttribute('aria-expanded')).toBe('true');
      const a = links(book);
      expect(a).toHaveLength(1);
      expect(a[0].querySelector('.entry__native')!.textContent).toBe(title);
      expect(a[0].getAttribute('href')).toBe(`/scripture/${encodeURIComponent(id)}`);
    }
    // a partial passage sits under its own book and chapter, shown by its own title
    expect(q(links('b:1JN')[0], '.entry__num')!.textContent).toBe('Chapter 1');
    // the preview line is the shared progress wording
    expect(q(links('b:GEN')[0], '[data-testid="scripture-progress"]')!.textContent).toMatch(/^Seen 0 of 1 sentences?/);
    // John is placed by scripture.book/chapter: Chapter 3 of 21
    await click(head('b:JHN'));
    expect(qa(group('b:JHN'), '[role="listitem"]')).toHaveLength(21);
    expect(q(links('b:JHN')[0], '.entry__num')!.textContent).toBe('Chapter 3');
  });

  it('lists a book that has no chapter in Go muted and not expandable (Exodus / 2. Mose)', async () => {
    const h = await german();
    await seedFive(h);
    mounted = await h.mount(app(), { router: '/scripture' });
    const exo = group('b:EXO');
    expect(exo.classList.contains('lib__group--empty')).toBe(true);
    expect(q(exo, ':scope > button')).toBeNull();
    expect(q(exo, '[aria-expanded]')).toBeNull();
    expect(q(exo, '.lib__title')!.textContent).toBe('Exodus');
    expect(q(exo, '.lib__native')!.textContent).toBe('2. Mose');
    expect(q(exo, '.lib__meta')!.textContent).toBe('not yet in GoLearn');
    expect(qa(exo, '.entry, a')).toHaveLength(0);
    await click(q(exo, '.lib__head'));
    expect(qa(exo, '.entry')).toHaveLength(0);
  });
});

describe('open state', () => {
  it('toggles aria-expanded and the chevron, and remembers the open set on this device', async () => {
    const h = await german();
    await seedFive(h);
    mounted = await h.mount(app(), { router: '/scripture' });
    const chev = () => q(head('b:GEN'), '.lib__chev')!;
    expect(chev().getAttribute('aria-hidden')).toBe('true');
    expect(chev().classList.contains('lib__chev--open')).toBe(true);
    expect(group('b:GEN').querySelector('.collapsible')!.getAttribute('data-open')).toBe('true');
    await click(head('b:GEN'));
    expect(head('b:GEN').getAttribute('aria-expanded')).toBe('false');
    expect(chev().classList.contains('lib__chev--open')).toBe(false);
    expect(group('b:GEN').querySelector('.collapsible')!.getAttribute('data-open')).toBe('false');
    await click(head('d:poetry'));
    await click(head('b:PSA'));
    const saved = JSON.parse(localStorage.getItem('go.scripture.open.de')!) as string[];
    expect(saved).toEqual(expect.arrayContaining(['t:OT', 'd:poetry', 'b:PSA']));
    expect(saved).not.toContain('b:GEN');
    // a fresh mount restores it (Genesis stays closed, Psalms open)
    await mounted.unmount();
    mounted = await h.mount(app(), { router: '/scripture' });
    expect(head('b:GEN').getAttribute('aria-expanded')).toBe('false');
    expect(head('b:PSA').getAttribute('aria-expanded')).toBe('true');
    expect(links('b:PSA')).toHaveLength(1);
  });

  it('keeps the open set per language', async () => {
    const h = await german();
    await seedFive(h);
    localStorage.setItem('go.scripture.open.es', JSON.stringify(['b:GEN']));
    mounted = await h.mount(app(), { router: '/scripture' });
    expect(head('b:GEN').getAttribute('aria-expanded')).toBe('true');
    await click(head('b:GEN'));
    expect(JSON.parse(localStorage.getItem('go.scripture.open.es')!)).toEqual(['b:GEN']);
    expect(localStorage.getItem('go.scripture.open.de')).not.toBeNull();
  });
});

describe('publication gate', () => {
  it('hides an unpublished Scripture text without preview and shows it, badged and with its reasons, in preview mode', async () => {
    const h = await german();
    await seed(h, 'gen-1', '1. Mose 1', 'GEN', 1);
    await seed(h, 'jhn-3', 'Johannes 3', 'JHN', 3, { published: false });
    mounted = await h.mount(app(), { router: '/scripture' });
    expect(mounted.container.textContent).not.toContain('Johannes 3');
    expect(q(group('b:JHN'), ':scope > button')).toBeNull();
    expect(q(group('b:JHN'), '.lib__meta')!.textContent).toBe('not yet in GoLearn');
    expect(q(mounted.container, 'ul.reasons')).toBeNull();
    await mounted.unmount();
    mounted = undefined;

    await turnPreviewOn(h);
    mounted = await h.mount(app(), { router: '/scripture' });
    await click(head('d:histories'));
    await click(head('b:JHN'));
    const a = links('b:JHN');
    expect(a).toHaveLength(1);
    expect(a[0].querySelector('.entry__native')!.textContent).toBe('Johannes 3');
    expect(a[0].textContent).toContain('unpublished');
    const reasons = q(group('b:JHN'), 'ul.reasons[aria-label="Why Johannes 3 is not published"]')!;
    expect(reasons.textContent).not.toBe('');
    // the published chapter carries neither
    expect(q(links('b:GEN')[0], '.chip')).toBeNull();
  });
});

describe('library chapters', () => {
  it('lists lazily loaded chapters under their running canon place, opens one on click, and lets the resident text win a shared id', async () => {
    const psa23 = runningNumber('PSA', 23)!;
    const h = await german({
      library: [
        catalogText({ id: 'text:de:bible-psa-23', lang: 'de', title: 'Psalm 23 (Bibliothek)', stream: 'scripture', streams: ['scripture'], chapter: psa23, rights: 'verified-public-domain' }),
        catalogText({ id: 'text:de:bible-psa-24', lang: 'de', title: 'Psalm 24', stream: 'scripture', streams: ['scripture'], chapter: psa23 + 1, rights: 'verified-public-domain' }),
        // Same canonical catalog ID: the resident text wins and is listed only once.
        catalogText({ id: 'text:de:gen-1', lang: 'de', title: '1. Mose 1', stream: 'scripture', streams: ['scripture'], chapter: 1, rights: 'verified-public-domain' }),
      ],
    });
    await seed(h, 'gen-1', '1. Mose 1', 'GEN', 1); // id text:de:gen-1, also in the library: the resident one is listed
    mounted = await h.mount(app(), { router: '/scripture' });
    expect(links('b:GEN').map((a) => a.querySelector('.entry__native')!.textContent)).toEqual(['1. Mose 1']);
    await click(head('d:poetry'));
    await click(head('b:PSA'));
    expect(links('b:PSA').map((a) => `${a.querySelector('.entry__num')!.textContent}|${a.querySelector('.entry__native')!.textContent}`)).toEqual([
      'Chapter 23|Psalm 23 (Bibliothek)', 'Chapter 24|Psalm 24',
    ]);
    expect(q(group('b:PSA'), '.lib__meta')!.textContent).toBe('2 chapters available');
    await click(links('b:PSA')[1]);
    expect(h.library.opened).toEqual(['text:de:bible-psa-24']);
  });
});

describe('the same chapter in the library under another id', () => {
  it('lists a complete chapter once, but keeps a partial passage and another edition beside it', async () => {
    const gen1 = runningNumber('GEN', 1)!;
    const jn1 = runningNumber('1JN', 1)!;
    const h = await german({
      library: [
        // the complete chapter the resident text already is: same place, same title, same work → listed once (the resident copy)
        catalogText({ id: 'text:de:luther-gen-1', lang: 'de', title: '1. Mose 1', workId: 'work:germany-de:lutherbibel-1912', stream: 'scripture', streams: ['scripture'], chapter: gen1, rights: 'verified-public-domain' }),
        // another edition of the same chapter: a different work → listed beside it
        catalogText({ id: 'text:de:elb-gen-1', lang: 'de', title: '1. Mose 1', workId: 'work:germany-de:elberfelder-1905', stream: 'scripture', streams: ['scripture'], chapter: gen1, rights: 'verified-public-domain' }),
        // the complete chapter beside a partial seed passage with its own title → listed beside it
        catalogText({ id: 'text:de:luther-1jn-1', lang: 'de', title: '1. Johannes 1', workId: 'work:germany-de:lutherbibel-1912', stream: 'scripture', streams: ['scripture'], chapter: jn1, rights: 'verified-public-domain' }),
      ],
    });
    const gen = await buildFixtureText(h.store, { lang: 'de', slug: 'gen-1', title: '1. Mose 1', kind: 'scripture', version: 'Luther 1912', scripture: { book: 'GEN', chapter: 1 }, sentences: [{ tokens: TOKENS }] });
    await h.store.texts.put({ ...gen, workId: 'work:germany-de:lutherbibel-1912' });
    await seed(h, '1jn-1', '1. Johannes 1,8–9; Johannes 3,16', '1JN', 1);
    mounted = await h.mount(app(), { router: '/scripture' });
    expect(links('b:GEN').map((a) => a.getAttribute('href'))).toEqual([
      `/scripture/${encodeURIComponent(gen.id)}`, `/scripture/${encodeURIComponent('text:de:elb-gen-1')}`,
    ]);
    if (head('t:NT').getAttribute('aria-expanded') !== 'true') await click(head('t:NT'));
    if (head('d:epistles').getAttribute('aria-expanded') !== 'true') await click(head('d:epistles'));
    await click(head('b:1JN'));
    expect(links('b:1JN').map((a) => a.querySelector('.entry__native')!.textContent)).toEqual(['1. Johannes 1,8–9; Johannes 3,16', '1. Johannes 1']); // the resident passage first
  });
});

describe('continue reading', () => {
  it('links to the chapter last viewed', async () => {
    const h = await german();
    const t = await seedFive(h);
    for (const [i, book] of (['GEN', 'PSA'] as const).entries()) {
      await h.bus.emit<TextViewed>({ type: 'TextViewed', userId: 'u1', lang: 'de', surface: 'scripture', session: 'ses-test', dedupeKey: `tv:${i}`, textId: t[book].id, at: `2026-02-0${i + 1}T10:00:00.000Z` });
    }
    mounted = await h.mount(app(), { router: '/scripture' });
    const cont = q<HTMLAnchorElement>(mounted.container, 'a.home__continue')!;
    expect(cont.querySelector('.home__continue-label')!.textContent).toBe('Continue reading');
    expect(cont.textContent).toContain('Psalm 23');
    expect(cont.getAttribute('href')).toBe(`/scripture/${encodeURIComponent(t.PSA.id)}`);
  });
});

/** The Bible access block is another line of work's module; the page shows it only when that module exists. */
const hasBibleAccess = Object.keys(import.meta.glob('../../src/ui/course/BibleAccess.tsx')).length > 0;

describe('Albanian keeps the previous page', () => {
  it('shows the Bible access block and no canon tree', async () => {
    const h = await makeHarness({ courseId: 'albania-sq' });
    mounted = await h.mount(app(), { router: '/scripture' });
    if (hasBibleAccess) expect(q(mounted.container, '[data-testid="bible-access"]')).not.toBeNull();
    expect(q(mounted.container, 'nav.lib[aria-label="Books"]')).toBeNull();
    expect(q(mounted.container, '.scripture')).toBeNull();
  });
});

describe('the empty state', () => {
  it('says what is awaited when a language has no Scripture, with the Bible access block above', async () => {
    const h = await makeHarness({ courseId: 'thailand-th' });
    mounted = await h.mount(app(), { router: '/scripture' });
    if (hasBibleAccess) expect(q(mounted.container, '[data-testid="bible-access"]')).not.toBeNull();
    expect(q(mounted.container, 'nav.lib')).toBeNull();
    expect(mounted.container.textContent).toContain('No Thai Scripture library is available yet.');
  });
});

describe('the canon table', () => {
  it('has 66 books, each named in English and in all four languages, with the chapter counts of src/library/canon.ts', () => {
    expect(BOOK_NAMES.size).toBe(66);
    expect(CANON).toHaveLength(66);
    for (const [code] of CANON) {
      const n = BOOK_NAMES.get(code);
      expect(n, code).toBeDefined();
      for (const k of ['en', 'es', 'de', 'hi', 'th'] as const) {
        expect(n![k].trim(), `${code} ${k}`).not.toBe('');
        expect(n![k], `${code} ${k}`).not.toMatch(/[​\s]$|^\s|​/);
      }
    }
    for (const lang of SCRIPTURE_LANGS) {
      const tree = canonTree(lang);
      expect(tree.map((t) => t.divisions.length)).toEqual([5, 2]);
      expect(tree.map((t) => t.divisions.reduce((n, d) => n + d.books.length, 0))).toEqual([39, 27]);
      const books = tree.flatMap((t) => t.divisions.flatMap((d) => d.books));
      expect(books.map((b) => [b.code, b.chapters])).toEqual(CANON.map(([c, n]) => [c, n]));
      for (const b of books) {
        expect(b.native).toBe(bookName(lang, b.code));
        expect(b.en).toBe(BOOK_NAMES.get(b.code)!.en);
      }
      for (const t of tree) {
        expect(t.native.trim()).not.toBe('');
        for (const d of t.divisions) expect(d.native.trim()).not.toBe('');
      }
    }
    // the New Testament has Biblia's two divisions, Revelation among the letters
    const nt = canonTree('de')[1];
    expect(nt.divisions.map((d) => d.id)).toEqual(['histories', 'epistles']);
    expect(nt.divisions[0].books.map((b) => b.code)).toEqual(['MAT', 'MRK', 'LUK', 'JHN', 'ACT']);
    expect(nt.divisions[1].books.at(-1)!.code).toBe('REV');
    expect(canonTree('de')[0].divisions.map((d) => d.books.length)).toEqual([5, 12, 5, 5, 12]);
  });

  it('uses each edition\'s own names and maps a running number back to its book and chapter', () => {
    expect(bookName('de', 'GEN')).toBe('1. Mose');
    expect(bookName('es', 'GEN')).toBe('Génesis');
    expect(bookName('hi', 'PSA')).toBe('भजन संहिता');
    expect(bookName('th', 'GEN')).toBe('ปฐมกาล');
    expect(bookName('es', 'XXX')).toBe('XXX');
    expect(placeOfRunning(1)).toEqual({ book: 'GEN', chapter: 1 });
    expect(placeOfRunning(1189)).toEqual({ book: 'REV', chapter: 22 });
    expect(placeOfRunning(0)).toBeUndefined();
    expect(placeOfRunning(1190)).toBeUndefined();
    expect(placeOfRunning(runningNumber('1JN', 5)!)).toEqual({ book: '1JN', chapter: 5 });
  });
});
