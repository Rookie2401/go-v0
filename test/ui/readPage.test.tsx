// @vitest-environment jsdom
// The Read page, organised by book: shelf (a stage of the course's ladder) → book (a work) → chapters, with the same dropdowns
// as the Scripture page. German is the language under test: its catalogue has the shelves and the works; texts are seeded here.
import { afterEach, describe, expect, it } from 'vitest';
import type { Text, TextViewed } from '../../src/core';
import { buildFixtureText, ids } from '../../src/core';
import { GERMAN_COURSE_ID, GERMAN_STREAMS } from '../../src/course/german';
import { AppRoutes, Shell } from '../../src/ui/App';
import type { Harness, Mounted } from './harness';
import { byLabel, catalogText, check, click, makeHarness, q, qa } from './harness';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });
const app = () => <Shell><AppRoutes /></Shell>;
const german = (o: Parameters<typeof makeHarness>[0] = {}) => makeHarness({ courseId: GERMAN_COURSE_ID, streams: GERMAN_STREAMS, ...o });

const TOKENS = [{ surface: 'Im' }, { surface: 'Anfang' }, { surface: '.', isWord: false }];
const work = (slug: string) => ids.work(GERMAN_COURSE_ID, slug);
const WEG1 = work('weg-1');
const WEG2 = work('weg-2');
const GUERBER = work('guerber-maerchen-und-erzaehlungen');
const EMIL = work('kaestner-emil');

/** A seeded German story: the fixture builder does not know works, chapters or ownership, so those are set on the stored row. */
async function seed(h: Harness, slug: string, title: string, o: { workId?: string; chapter?: number; tags?: string[]; published?: boolean; personalCopy?: boolean; teamText?: boolean } = {}): Promise<Text> {
  const t = await buildFixtureText(h.store, { lang: 'de', slug, title, sentences: [{ tokens: TOKENS }], tags: o.tags, published: o.published });
  const row: Text = {
    ...t,
    ...(o.workId ? { workId: o.workId } : {}),
    ...(o.chapter !== undefined ? { chapter: { index: o.chapter } } : {}),
    ...(o.personalCopy ? { personalCopy: true } : {}),
    ...(o.teamText ? { teamText: true } : {}),
  };
  await h.store.texts.put(row);
  return row;
}

const group = (id: string) => q(mounted!.container, `[data-group="${id}"]`)!;
const head = (id: string) => q<HTMLButtonElement>(group(id), ':scope > button.lib__head')!;
const rows = (id: string) => qa<HTMLAnchorElement>(group(id), 'a.entry--chapter');
const book = (workId: string, prefix = '') => `b:${prefix}w:${workId}`;
const nav = () => q(mounted!.container, 'nav.lib[aria-label="Books"]')!;
const shelfTitles = () => qa(nav(), '.lib__group--1 > button .lib__title').map((x) => x.textContent);

async function turnPreviewOn(h: Harness) {
  mounted = await h.mount(app(), { router: '/settings' });
  await check(byLabel<HTMLInputElement>(mounted.container, 'Preview unreviewed content'));
  await mounted.unmount();
  mounted = undefined;
}

describe('Read page (German): shelf → book → chapters', () => {
  it('lists the shelves in stage order, the books under them and each book\'s chapters in chapter order, with their own titles', async () => {
    const h = await german();
    await seed(h, 'weg-1-02', 'Anna kauft Brot', { workId: WEG1, chapter: 2 });
    const first = await seed(h, 'weg-1-01', 'Anna und das Buch', { workId: WEG1, chapter: 1 });
    await seed(h, 'weg-2-01', 'Am Montag', { workId: WEG2, chapter: 1 });
    await seed(h, 'guerber-01', 'Der Froschkönig', { workId: GUERBER, chapter: 1 });
    await seed(h, 'kurz-01', 'Ein kurzer Text');
    mounted = await h.mount(app(), { router: '/read' });
    expect(nav()).not.toBeNull();

    // shelves: the course's stages in index order, then what has no stage or no work
    expect(shelfTitles()).toEqual(['Controlled German', 'First readers', 'More reading']);
    expect(qa(nav(), '.lib__group--1 > button .lib__meta').map((x) => x.textContent)).toEqual(['2 books', '1 book', '1 book']);

    // books under their shelf: the works' titles in the work order, the author on the right
    expect(qa(group('s:s0'), '.lib__group--3 > button .lib__title').map((x) => x.textContent)).toEqual(['Weg 1 — Erste Schritte', 'Weg 2 — Tage und Orte']);
    expect(q(group(book(GUERBER)), '.lib__title')!.textContent).toBe('Märchen und Erzählungen für Anfänger');
    expect(q(group(book(GUERBER)), '.lib__native')!.textContent).toBe('H. A. Guerber');
    expect(q(group(book(WEG1)), '.lib__meta')!.textContent).toBe('2 chapters');
    expect(q(group(book(GUERBER)), '.lib__meta')!.textContent).toBe('1 chapter');

    // default: the first shelf and its first book are open, the rest closed; a closed book has not mounted its rows
    expect(head('s:s0').getAttribute('aria-expanded')).toBe('true');
    expect(head(book(WEG1)).getAttribute('aria-expanded')).toBe('true');
    expect(head(book(WEG2)).getAttribute('aria-expanded')).toBe('false');
    expect(head('s:s1').getAttribute('aria-expanded')).toBe('false');
    expect(qa(group(book(WEG2)), '.entry')).toHaveLength(0);

    // chapters in chapter order (seeded 2 then 1): "Chapter N" and the chapter's own title
    const a = rows(book(WEG1));
    expect(a.map((x) => `${x.querySelector('.entry__num')!.textContent}|${x.querySelector('.entry__native')!.textContent}`)).toEqual([
      'Chapter 1|Anna und das Buch', 'Chapter 2|Anna kauft Brot',
    ]);
    expect(a[0].getAttribute('href')).toBe(`/read/${encodeURIComponent(first.id)}`);
    expect(q(group(book(WEG1)), '.entrylist[role="list"]')).not.toBeNull();
    expect(qa(group(book(WEG1)), '[role="listitem"]')).toHaveLength(2);
    // the shared progress line
    expect(q(a[0], '[data-testid="library-progress"]')!.textContent).toMatch(/^Seen 0 of 1 sentences?/);

    // opening another book and another shelf mounts them
    await click(head(book(WEG2)));
    expect(rows(book(WEG2)).map((x) => x.querySelector('.entry__native')!.textContent)).toEqual(['Am Montag']);
    await click(head('s:s1'));
    await click(head(book(GUERBER)));
    expect(rows(book(GUERBER)).map((x) => x.querySelector('.entry__native')!.textContent)).toEqual(['Der Froschkönig']);

    // a text with no work sits in a book per corpus, shown by its title alone (no chapter number)
    await click(head('other'));
    await click(head('b:c:ci-de'));
    expect(q(group('b:c:ci-de'), '.lib__title')!.textContent).toBe('Short texts');
    expect(q(group('b:c:ci-de'), '.lib__meta')!.textContent).toBe('1 text');
    const short = rows('b:c:ci-de');
    expect(short).toHaveLength(1);
    expect(q(short[0], '.entry__num')!.textContent).toBe('Ein kurzer Text');
    expect(q(short[0], '.entry__native')).toBeNull();
  });
});

describe('open state', () => {
  it('toggles aria-expanded and the chevron, and remembers the open set on this device', async () => {
    const h = await german();
    await seed(h, 'weg-1-01', 'Anna und das Buch', { workId: WEG1, chapter: 1 });
    await seed(h, 'weg-2-01', 'Am Montag', { workId: WEG2, chapter: 1 });
    mounted = await h.mount(app(), { router: '/read' });
    const chev = () => q(head(book(WEG1)), '.lib__chev')!;
    expect(chev().getAttribute('aria-hidden')).toBe('true');
    expect(chev().classList.contains('lib__chev--open')).toBe(true);
    expect(group(book(WEG1)).querySelector('.collapsible')!.getAttribute('data-open')).toBe('true');
    await click(head(book(WEG1)));
    expect(head(book(WEG1)).getAttribute('aria-expanded')).toBe('false');
    expect(chev().classList.contains('lib__chev--open')).toBe(false);
    expect(group(book(WEG1)).querySelector('.collapsible')!.getAttribute('data-open')).toBe('false');
    await click(head(book(WEG2)));
    const saved = JSON.parse(localStorage.getItem('go.read.open.de')!) as string[];
    expect(saved).toEqual(expect.arrayContaining(['s:s0', book(WEG2)]));
    expect(saved).not.toContain(book(WEG1));
    // a fresh mount restores it (Weg 1 stays closed, Weg 2 open)
    await mounted.unmount();
    mounted = await h.mount(app(), { router: '/read' });
    expect(head(book(WEG1)).getAttribute('aria-expanded')).toBe('false');
    expect(head(book(WEG2)).getAttribute('aria-expanded')).toBe('true');
    expect(rows(book(WEG2))).toHaveLength(1);
    // the open set is kept per language
    expect(localStorage.getItem('go.read.open.es')).toBeNull();
  });
});

describe('publication gate', () => {
  it('hides an unpublished text without preview and shows it, badged and with its reasons, in preview mode', async () => {
    const h = await german();
    await seed(h, 'weg-1-01', 'Anna und das Buch', { workId: WEG1, chapter: 1 });
    await seed(h, 'weg-1-02', 'Anna kauft Brot', { workId: WEG1, chapter: 2, published: false });
    mounted = await h.mount(app(), { router: '/read' });
    expect(mounted.container.textContent).not.toContain('Anna kauft Brot');
    expect(q(group(book(WEG1)), '.lib__meta')!.textContent).toBe('1 chapter');
    expect(q(mounted.container, 'ul.reasons')).toBeNull();
    await mounted.unmount();
    mounted = undefined;

    await turnPreviewOn(h);
    mounted = await h.mount(app(), { router: '/read' });
    expect(q(group(book(WEG1)), '.lib__meta')!.textContent).toBe('2 chapters');
    const a = rows(book(WEG1));
    expect(a).toHaveLength(2);
    expect(a[1].querySelector('.entry__native')!.textContent).toBe('Anna kauft Brot');
    expect(a[1].textContent).toContain('unpublished');
    const reasons = q(group(book(WEG1)), 'ul.reasons[aria-label="Why Anna kauft Brot is not published"]')!;
    expect(reasons.textContent).not.toBe('');
    // the published chapter carries neither
    expect(q(a[0], '.chip')).toBeNull();
  });
});

describe('library texts', () => {
  it('lists lazily loaded texts under their work, opens one on click, lets the resident text win a shared id and leaves Scripture out', async () => {
    const h = await german({
      library: [
        catalogText({ id: 'text:de:weg-2-02', lang: 'de', title: 'Am Dienstag', stream: 'acquisition', workId: WEG2, chapter: 2 }),
        catalogText({ id: 'text:de:weg-2-01', lang: 'de', title: 'Montag (Bibliothek)', stream: 'acquisition', workId: WEG2, chapter: 1 }), // the resident one is listed instead
        catalogText({ id: 'text:de:bible-gen-1', lang: 'de', title: '1. Mose 1', stream: 'scripture', streams: ['scripture'], chapter: 1 }),
      ],
    });
    await seed(h, 'weg-2-01', 'Am Montag', { workId: WEG2, chapter: 1 });
    mounted = await h.mount(app(), { router: '/read' });
    expect(mounted.container.textContent).not.toContain('1. Mose 1');
    expect(mounted.container.textContent).not.toContain('Montag (Bibliothek)');
    expect(q(group(book(WEG2)), '.lib__meta')!.textContent).toBe('2 chapters');
    await click(head(book(WEG2)));
    expect(rows(book(WEG2)).map((x) => `${x.querySelector('.entry__num')!.textContent}|${x.querySelector('.entry__native')!.textContent}`)).toEqual([
      'Chapter 1|Am Montag', 'Chapter 2|Am Dienstag',
    ]);
    await click(rows(book(WEG2))[1]);
    expect(h.library.opened).toEqual(['text:de:weg-2-02']);
  });
});

describe('pathway tags', () => {
  it('narrow the books: a book with no matching chapter disappears while a tag is chosen', async () => {
    const h = await german({ library: [catalogText({ id: 'text:de:weg-2-02', lang: 'de', title: 'Am Dienstag', stream: 'acquisition', workId: WEG2, chapter: 2 })] });
    await seed(h, 'weg-1-01', 'Anna und das Buch', { workId: WEG1, chapter: 1, tags: ['daily-life'] });
    await seed(h, 'weg-1-02', 'Anna kauft Brot', { workId: WEG1, chapter: 2 });
    await seed(h, 'guerber-01', 'Der Froschkönig', { workId: GUERBER, chapter: 1, tags: ['church'] });
    mounted = await h.mount(app(), { router: '/read' });
    const pills = () => qa<HTMLButtonElement>(mounted!.container, '[role="group"][aria-label="Pathways"] button');
    expect(pills().map((b) => b.textContent)).toEqual(['all', 'church', 'daily-life']);
    expect(qa(nav(), '[data-group^="b:"]')).toHaveLength(3); // Weg 1, Weg 2 (library row), Guerber
    await click(pills().find((b) => b.textContent === 'daily-life')!);
    expect(qa(nav(), '[data-group^="b:"]').map((g) => g.getAttribute('data-group'))).toEqual([book(WEG1)]);
    expect(shelfTitles()).toEqual(['Controlled German']);
    expect(rows(book(WEG1)).map((x) => x.querySelector('.entry__native')!.textContent)).toEqual(['Anna und das Buch']);
    expect(pills().find((b) => b.textContent === 'daily-life')!.getAttribute('aria-pressed')).toBe('true');
    await click(pills()[0]);
    expect(qa(nav(), '[data-group^="b:"]')).toHaveLength(3);
    expect(rows(book(WEG1))).toHaveLength(2);
  });
});

describe('continue reading', () => {
  it('links to the text last viewed, with its book', async () => {
    const h = await german();
    const a = await seed(h, 'weg-1-01', 'Anna und das Buch', { workId: WEG1, chapter: 1 });
    const b = await seed(h, 'weg-2-01', 'Am Montag', { workId: WEG2, chapter: 1 });
    for (const [i, t] of [a, b].entries()) {
      await h.bus.emit<TextViewed>({ type: 'TextViewed', userId: 'u1', lang: 'de', surface: 'corpus', session: 'ses-test', dedupeKey: `tv:${i}`, textId: t.id, at: `2026-02-0${i + 1}T10:00:00.000Z` });
    }
    mounted = await h.mount(app(), { router: '/read' });
    const cont = q<HTMLAnchorElement>(mounted.container, 'a.home__continue')!;
    expect(cont.querySelector('.home__continue-label')!.textContent).toBe('Continue reading');
    expect(cont.textContent).toContain('Am Montag');
    expect(q(cont, '.home__continue-sub')!.textContent).toBe('Weg 2 — Tage und Orte');
    expect(cont.getAttribute('href')).toBe(`/read/${encodeURIComponent(b.id)}`);
    // the book it is in is marked
    expect(group(book(WEG2)).classList.contains('lib__group--current')).toBe(true);
    expect(group(book(WEG1)).classList.contains('lib__group--current')).toBe(false);
  });

  it('is absent when nothing has been viewed', async () => {
    const h = await german();
    await seed(h, 'weg-1-01', 'Anna und das Buch', { workId: WEG1, chapter: 1 });
    mounted = await h.mount(app(), { router: '/read' });
    expect(q(mounted.container, 'a.home__continue')).toBeNull();
  });
});

describe('when nothing is visible', () => {
  it('says what is awaited instead of an empty list (no texts at all)', async () => {
    const h = await german();
    mounted = await h.mount(app(), { router: '/read' });
    const awaited = q(mounted.container, '[data-testid="awaited"]')!;
    expect(awaited.textContent).toContain('No stories or dialogues in German have been imported yet');
    expect(q(mounted.container, 'nav.lib')).toBeNull();
    expect(q(mounted.container, 'a[href="/team-texts"]')).not.toBeNull();
  });

  it('says what is awaited when the only texts are unpublished, and points to preview mode', async () => {
    const h = await german();
    await seed(h, 'weg-1-01', 'Anna und das Buch', { workId: WEG1, chapter: 1, published: false });
    mounted = await h.mount(app(), { router: '/read' });
    const awaited = q(mounted.container, '[data-testid="awaited"]')!;
    expect(awaited.textContent).toContain('1 text is imported but awaiting');
    expect(q(awaited, 'a[href="/settings"]')).not.toBeNull();
    expect(q(mounted.container, 'nav.lib')).toBeNull();
  });
});

describe('the learner\'s own books and the team\'s texts', () => {
  it('lists the learner\'s copies under "Your books" (last), one book per work, each chapter labelled "Your copy"', async () => {
    const h = await german();
    await seed(h, 'weg-1-01', 'Anna und das Buch', { workId: WEG1, chapter: 1 });
    await seed(h, 'emil-02', 'Zweites Kapitel', { workId: EMIL, chapter: 2, personalCopy: true });
    await seed(h, 'emil-01', 'Erstes Kapitel', { workId: EMIL, chapter: 1, personalCopy: true });
    mounted = await h.mount(app(), { router: '/read' });
    // not under the work's own shelf: the shelf of Young readers is not listed, "Your books" is, and last
    expect(shelfTitles()).toEqual(['Controlled German', 'Your books']);
    expect(q(group('personal'), '.lib__meta')!.textContent).toBe('1 book');
    const id = book(EMIL, 'p:');
    expect(q(group(id), '.lib__title')!.textContent).toBe('Emil und die Detektive');
    expect(q(group(id), '.lib__native')!.textContent).toBe('Erich Kästner');
    await click(head('personal'));
    await click(head(id));
    const a = rows(id);
    expect(a.map((x) => `${x.querySelector('.entry__num')!.textContent}|${x.querySelector('.entry__native')!.textContent}`)).toEqual([
      'Chapter 1|Erstes Kapitel', 'Chapter 2|Zweites Kapitel',
    ]);
    for (const x of a) expect(qa(x, '.entry__badges .chip').map((c) => c.textContent)).toEqual(['Your copy']);
    // the course's own texts carry no such label
    expect(qa(rows(book(WEG1))[0], '.chip')).toHaveLength(0);
  });

  it('lists the team\'s own texts on their own shelf, each labelled "Your team’s text"', async () => {
    const h = await german();
    await seed(h, 'weg-1-01', 'Anna und das Buch', { workId: WEG1, chapter: 1 });
    await seed(h, 'team-01', 'Unser Gemeindebrief', { teamText: true });
    await seed(h, 'emil-01', 'Erstes Kapitel', { workId: EMIL, chapter: 1, personalCopy: true });
    mounted = await h.mount(app(), { router: '/read' });
    expect(shelfTitles()).toEqual(['Controlled German', 'Your team’s texts', 'Your books']);
    const id = 'b:t:c:ci-de';
    await click(head('team'));
    await click(head(id));
    const a = rows(id);
    expect(a).toHaveLength(1);
    expect(q(a[0], '.entry__num')!.textContent).toBe('Unser Gemeindebrief');
    expect(qa(a[0], '.entry__badges .chip').map((c) => c.textContent)).toEqual(['Your team’s text']);
    expect(mounted.container.textContent).not.toContain('Your copy · ');
  });

  it('lists a personal library row under "Your books" with the same label', async () => {
    const h = await german({ library: [catalogText({ id: 'text:de:emil-01', lang: 'de', title: 'Erstes Kapitel', stream: 'personal', workId: EMIL, chapter: 1, location: 'personal' })] });
    await seed(h, 'weg-1-01', 'Anna und das Buch', { workId: WEG1, chapter: 1 });
    mounted = await h.mount(app(), { router: '/read' });
    expect(shelfTitles()).toEqual(['Controlled German', 'Your books']);
    await click(head('personal'));
    await click(head(book(EMIL, 'p:')));
    expect(qa(rows(book(EMIL, 'p:'))[0], '.entry__badges .chip').map((c) => c.textContent)).toEqual(['Your copy']);
  });
});

describe('a course without a ladder', () => {
  it('has one shelf, "Reading", with a book per corpus', async () => {
    const es = await makeHarness();
    es.services.catalog = { ...es.services.catalog, stages: async () => [] }; // whatever shelves the Spanish catalogue has today: this course has none
    await (await import('./fixtures')).seedStory(es.store);
    mounted = await es.mount(app(), { router: '/read' });
    expect(shelfTitles()).toEqual(['Reading']);
    expect(qa(nav(), '[data-group^="b:c:"]')).toHaveLength(1);
  });
});
