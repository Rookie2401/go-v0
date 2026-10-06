/**
 * Read (#/read), organised by book: shelf → book → chapters, as the Scripture page does with testament → division → book →
 * chapters — the same dropdowns (src/ui/disclosure): a button head with a rotating chevron and a height-animated panel, the
 * open state remembered on this device (go.read.open.<lang>), "Continue reading", every chapter an entry row with its
 * progress line.
 *
 * The tree:
 *  - Shelf: one per stage of the course's ladder (Stage.index order; a shelf is a browsing orientation, never a lock), then
 *    "More reading" (texts whose work or stage is not in the course catalogue, and texts with no work), then "Your team’s
 *    texts" and last "Your books". A shelf with nothing to show is not listed.
 *  - Book: one per work (its title; the author on the right). Texts with no work form a book per corpus (the corpus title,
 *    or "Short texts"). The learner's own copies (personalCopy / library location 'personal') are books of "Your books",
 *    the team's own writing (teamText) books of "Your team’s texts": one book per work, or per corpus.
 *  - Chapters: the book's texts in chapter order ("Chapter N" and the text's own title; just the title when it has no
 *    chapter number), each with the shared progress / band line, badges and — in preview mode — its reasons.
 *
 * Data is what the old page used, nothing added: the language's resident texts (useLangTexts, not Scripture) behind the
 * publication gate, and the library rows loaded lazily (library.search, paged; a row whose id is a resident text is the
 * resident one). Unpublished texts appear only in preview mode, each with its badges and reasons. The pathway tags filter
 * which texts are listed; a book with no matching chapter disappears while one is chosen.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CatalogText, LanguageCode, Stage, Text, Work } from '../../core';
import { useApp } from '../context';
import { ProgressLine, useCoverageMany, useReadingProgress } from '../coverage';
// the dropdown parts (and disclosure.css) load before read.css, so this page's own rules win where both apply
import { BookSection, Group } from '../disclosure/Disclosure';
import { BAND_LABEL, awaitedStatement, isVisibleText, languageName, pct, plainReasons, textPath } from '../format';
import { TextBadges, UnpublishedReasons, useLangTexts } from '../library';
import { usePreview } from '../prefs';
import { BackLink, Topbar } from '../ui';
import { NextForYou } from './NextForYou';
import './read.css';

/** Whose copy a text is: the course's own, the learner's own copy of a book, or the team's own writing. */
type Owner = 'course' | 'personal' | 'team';

/** One chapter-sized thing the learner can open, resident in the store or listed in the library. */
interface Entry {
  id: string;
  title: string;
  lang: LanguageCode;
  chapter?: number;
  owner: Owner;
  workId?: string;
  corpusId?: string;
  stageId?: string;
  text?: Text;
  catalog?: CatalogText;
}

interface Book {
  id: string;
  title: string;
  titleLang?: LanguageCode;
  author?: string;
  numbered: boolean;
  entries: Entry[];
}

interface Shelf {
  id: string;
  title: string;
  books: Book[];
}

const openKey = (lang: string) => `go.read.open.${lang}`;
function readOpen(lang: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(openKey(lang));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? new Set(parsed.filter((x): x is string => typeof x === 'string')) : null;
  } catch {
    return null;
  }
}

const OWNER_CHIP: Record<Exclude<Owner, 'course'>, { label: string; title: string }> = {
  personal: { label: 'Your copy', title: 'Your own copy of this book: on this device only, never uploaded or bundled.' },
  team: { label: 'Your team’s text', title: 'Written by your team: not checked by a native speaker unless its review says so.' },
};

const hasChapter = (e: Entry) => e.chapter !== undefined && e.chapter >= 1;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const roleRank = (w: Work) => (w.role === 'spine' ? 0 : 1);

export function ReadPage() {
  const { course, catalog, library, lang, bus, userId } = useApp();
  const navigate = useNavigate();
  const preview = usePreview();
  const { texts: allTexts, corpora } = useLangTexts();
  const [tag, setTag] = useState<string | null>(null);

  // Resident texts (everything but Scripture), behind the publication gate.
  const ofKind = useMemo(() => (allTexts ?? []).filter((t) => t.kind !== 'scripture'), [allTexts]);
  const resident = useMemo(() => ofKind.filter((t) => isVisibleText(t, preview)), [ofKind, preview]);

  // Library texts, opened lazily (paged exactly as the previous page did).
  const [catalogTexts, setCatalogTexts] = useState<CatalogText[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setCatalogReady(false);
    setCatalogError(null);
    setCatalogTexts([]);
    void (async () => {
      const rows: CatalogText[] = [];
      let offset = 0;
      while (true) {
        const page = await library.search({ lang, publishedOnly: !preview, limit: 200, offset });
        rows.push(...page.items.filter((t) => t.stream !== 'scripture' && !(t.streams ?? []).includes('scripture') && (t.published || preview)));
        offset += page.items.length;
        if (page.items.length === 0 || offset >= page.total) break;
      }
      if (live) { setCatalogTexts(rows); setCatalogReady(true); }
    })().catch((e: unknown) => { if (live) { setCatalogTexts([]); setCatalogReady(true); setCatalogError(e instanceof Error ? e.message : 'Could not load available reading.'); } });
    return () => { live = false; };
  }, [library, lang, preview]);
  // A library row whose id is a resident text is the resident one (it carries the learner's progress), whether or not that one is visible.
  const lazy = useMemo(() => {
    const have = new Set(ofKind.map((t) => t.id));
    return catalogTexts.filter((t) => !have.has(t.id));
  }, [catalogTexts, ofKind]);

  // Progress and coverage for the resident texts, the same shared reads as before.
  const textIds = useMemo(() => resident.map((t) => t.id), [resident]);
  const progress = useReadingProgress(textIds);
  const coverage = useCoverageMany(textIds);

  // The course's stages (the shelves) and the works the listed texts belong to (the books).
  const [stages, setStages] = useState<Stage[] | null>(null);
  useEffect(() => {
    let live = true;
    setStages(null);
    void catalog.stages(course.id).then((rows) => { if (live) setStages(rows); }).catch(() => { if (live) setStages([]); });
    return () => { live = false; };
  }, [catalog, course.id]);
  const workIds = useMemo(() => [...new Set([...resident, ...lazy].map((t) => t.workId).filter((id): id is string => !!id))].sort(), [resident, lazy]);
  const workKey = workIds.join('\n');
  const [works, setWorks] = useState<{ key: string | null; byId: Map<string, Work> }>({ key: null, byId: new Map() });
  useEffect(() => {
    let live = true;
    void Promise.all(workIds.map((id) => catalog.work(id).catch(() => undefined))).then((rows) => {
      if (live) setWorks({ key: workKey, byId: new Map(rows.flatMap((w) => (w ? [[w.id, w] as const] : []))) });
    });
    return () => { live = false; };
  }, [catalog, workKey]); // workKey stands for workIds
  const structureReady = stages !== null && works.key === workKey;

  const tags = useMemo(() => [...new Set(resident.flatMap((t) => t.tags ?? []))].sort(), [resident]);
  // A library row has no pathway tags, so choosing one lists the resident texts that carry it.
  const entries = useMemo<Entry[]>(() => [
    ...resident.filter((t) => !tag || (t.tags ?? []).includes(tag)).map((text): Entry => ({
      id: text.id, title: text.title, lang: text.lang, chapter: text.chapter?.index, owner: text.personalCopy ? 'personal' : text.teamText ? 'team' : 'course',
      workId: text.workId, corpusId: text.corpusId, text,
    })),
    ...(tag ? [] : lazy.map((row): Entry => ({
      id: row.id, title: row.title, lang: row.lang, chapter: row.chapter, owner: row.location === 'personal' ? 'personal' : 'course',
      workId: row.workId, stageId: row.stageId, catalog: row,
    }))),
  ], [resident, lazy, tag]);
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

  // shelf → book → chapters. Rebuilt only when its inputs change, so a click on a head leaves every book's entries as they were.
  const shelves = useMemo<Shelf[]>(() => {
    const stageById = new Map((stages ?? []).map((s) => [s.id, s]));
    const shelfOf = (e: Entry, work: Work | undefined): string => {
      if (e.owner === 'personal') return 'personal';
      if (e.owner === 'team') return 'team';
      const stage = stageById.get(work?.stageId ?? e.stageId ?? '');
      return stage ? `s:${stage.key}` : 'other';
    };
    const buckets = new Map<string, Map<string, { work?: Work; corpusId?: string; entries: Entry[] }>>();
    for (const e of entries) {
      const work = e.workId ? works.byId.get(e.workId) : undefined;
      const shelf = shelfOf(e, work);
      const prefix = shelf === 'personal' ? 'p:' : shelf === 'team' ? 't:' : '';
      const key = work ? `${prefix}w:${work.id}` : `${prefix}c:${e.corpusId ?? ''}`;
      const books = buckets.get(shelf) ?? new Map();
      const book = books.get(key) ?? { work, corpusId: work ? undefined : e.corpusId, entries: [] };
      book.entries.push(e);
      books.set(key, book);
      buckets.set(shelf, books);
    }
    const corpusTitle = (id: string | undefined) => {
      const title = id ? corpora.get(id)?.title?.trim() : undefined;
      return title && title !== id ? title : 'Short texts';
    };
    // books of works first (spine first, then the work's order), then the corpus books by title
    const toBooks = (map: Map<string, { work?: Work; corpusId?: string; entries: Entry[] }>): Book[] => [...map.entries()].map(([id, b]) => {
      b.entries.sort((x, y) => (x.chapter ?? Number.MAX_SAFE_INTEGER) - (y.chapter ?? Number.MAX_SAFE_INTEGER) || Number(!!y.text) - Number(!!x.text) || x.title.localeCompare(y.title));
      const book: Book = {
        id: `b:${id}`, title: b.work?.title ?? corpusTitle(b.corpusId), titleLang: b.work?.lang, author: b.work?.author, numbered: b.entries.some(hasChapter), entries: b.entries,
      };
      return { book, work: b.work };
    }).sort((a, b) => (a.work && b.work
      ? roleRank(a.work) - roleRank(b.work) || a.work.order - b.work.order || a.work.title.localeCompare(b.work.title)
      : Number(!a.work) - Number(!b.work) || a.book.title.localeCompare(b.book.title))).map((x) => x.book);
    const out: Shelf[] = [];
    const add = (id: string, title: string) => { const books = buckets.get(id); if (books && books.size > 0) out.push({ id, title, books: toBooks(books) }); };
    for (const s of [...(stages ?? [])].sort((a, b) => a.index - b.index)) add(`s:${s.key}`, s.label);
    add('other', (stages ?? []).length > 0 ? 'More reading' : 'Reading');
    add('team', 'Your team’s texts');
    add('personal', 'Your books');
    return out;
  }, [entries, works, stages, corpora]);

  // Which groups are open: remembered on this device; by default the first shelf and the first book in it.
  const [stored, setStored] = useState<Set<string> | null>(() => readOpen(lang));
  useEffect(() => { setStored(readOpen(lang)); }, [lang]);
  const defaults = useMemo(() => {
    const set = new Set<string>();
    const first = shelves[0];
    if (first) { set.add(first.id); if (first.books[0]) set.add(first.books[0].id); }
    return set;
  }, [shelves]);
  const open = stored ?? defaults;
  // the toggle lives in memoised book sections, so what it reads is read from refs
  const latest = useRef({ defaults, lang });
  latest.current = { defaults, lang };
  const toggle = (id: string) => {
    setStored((prev) => {
      const next = new Set(prev ?? latest.current.defaults);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try { localStorage.setItem(openKey(latest.current.lang), JSON.stringify([...next])); } catch { /* private mode */ }
      return next;
    });
  };

  // Continue reading: the text last viewed (TextViewed), among the texts listed here.
  const [last, setLast] = useState<Entry | null>(null);
  useEffect(() => {
    let alive = true;
    if (byId.size === 0) { setLast(null); return () => { alive = false; }; }
    void bus.history({ userId, types: ['TextViewed'] }).then((events) => {
      for (let i = events.length - 1; i >= 0; i--) {
        const e = byId.get((events[i] as { textId?: string }).textId ?? '');
        if (e) { if (alive) setLast(e); return; }
      }
      if (alive) setLast(null);
    }).catch(() => { if (alive) setLast(null); });
    return () => { alive = false; };
  }, [bus, userId, byId]);
  const lastBook = useMemo(() => {
    if (!last) return undefined;
    for (const s of shelves) for (const b of s.books) if (b.entries.some((e) => e.id === last.id)) return b;
    return undefined;
  }, [last, shelves]);

  const bar = <Topbar title="Reading" left={<BackLink to="/" label="Home" />} />;
  if (allTexts === null) return <div>{bar}<div className="page"><p className="muted" role="status">Loading…</p></div></div>;

  // Nothing visible at all (before any tag): say exactly what is awaited instead of an empty list.
  const awaited = catalogReady && resident.length === 0 && lazy.length === 0 ? awaitedStatement(ofKind, 'corpus', languageName(course)) : null;

  // A library row is opened (made resident) first, then read; a resident text is a plain link.
  const follow = (e: Entry) => (ev: MouseEvent<HTMLAnchorElement>) => {
    if (e.text || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    setOpenError(null);
    void library.open(e.id).then((t) => navigate(textPath(t))).catch((err: unknown) => setOpenError(err instanceof Error ? err.message : 'Could not open this reading.'));
  };
  const hrefOf = (e: Entry) => textPath(e.text ?? { id: e.id, kind: 'story' });

  const chapterRow = (e: Entry): ReactNode => {
    const t = e.text;
    const c = t ? coverage.get(t.id) : undefined;
    const p = t ? progress.get(t.id) : undefined;
    const done = !!p?.finishedAt;
    const chip = e.owner === 'course' ? undefined : OWNER_CHIP[e.owner];
    const label = hasChapter(e) ? `Chapter ${e.chapter}` : '';
    const badged = !!chip || (t ? t.generated || t.published !== true : e.catalog?.published !== true);
    return (
      <div key={e.id} role="listitem" className="entryrow" data-text-id={e.id}>
        <Link to={hrefOf(e)} onClick={follow(e)} className={`entry entry--chapter${done ? ' entry--done' : ''}${last?.id === e.id ? ' entry--at' : ''}`}>
          {label ? (
            <>
              <span className="entry__num">{label}</span>
              <span className="entry__native" lang={e.lang}>{e.title}</span>
            </>
          ) : (
            <span className="entry__num" lang={e.lang}>{e.title}</span>
          )}
          {(c || p) && (
            <span className={`entry__preview${c ? ` band-${c.band}` : ''}`} title={c?.explanation}>
              {p && <ProgressLine progress={p} testId="library-progress" />}
              {p && c && ' · '}
              {c && <>{BAND_LABEL[c.band]} · shown {pct(c.knownLexicalCoverage)}{(c.estimatedFamiliarCoverage ?? 0) > 0 ? ` · likely familiar ${pct(c.estimatedFamiliarCoverage)} (estimate)` : ''}</>}
            </span>
          )}
          {badged && (
            <span className="entry__badges">
              {chip && <span className="chip" title={chip.title}>{chip.label}</span>}
              {t && <TextBadges text={t} />}
              {!t && e.catalog && e.catalog.published !== true && <span className="chip chip--wine" title="Not published; listed in preview mode only.">unpublished</span>}
            </span>
          )}
        </Link>
        {t && <UnpublishedReasons text={t} />}
      </div>
    );
  };

  const bookGroup = (b: Book) => {
    const isOpen = open.has(b.id);
    const lastId = last && b.entries.some((e) => e.id === last.id) ? last.id : undefined;
    return (
      <BookSection key={b.id} open={isOpen} chapters={b.entries} progress={progress} coverage={coverage} lastId={lastId} preview={preview} render={() => (
        <Group
          id={b.id}
          level={3}
          open={isOpen}
          onToggle={toggle}
          title={b.title}
          titleLang={b.titleLang}
          native={b.author}
          meta={plural(b.entries.length, b.numbered ? 'chapter' : 'text', b.numbered ? 'chapters' : 'texts')}
          current={lastBook?.id === b.id}
        >
          {() => <div className="entrylist" role="list" aria-label={`${b.title} chapters`}>{b.entries.map(chapterRow)}</div>}
        </Group>
      )} />
    );
  };

  const hasAny = shelves.length > 0;
  return (
    <div>
      {bar}
      <div className="page page--narrow read disclosure-page route-fade">
        <p className="card__note"><Link to="/curriculum">Reading path</Link> · available stages and material still being prepared</p>
        {!catalogReady && <p className="muted" role="status">Loading reading…</p>}
        {awaited && (
          <div className="awaited" role="status" data-testid="awaited">
            <p className="muted">{awaited.headline}</p>
            {awaited.reasons.length > 0 && <ul className="reasons">{plainReasons(awaited.reasons).map((r) => <li key={r}>{r}</li>)}</ul>}
            {ofKind.length > 0 && !preview && <p className="card__note"><Link to="/settings">Preview mode in Settings</Link> lists them, clearly marked, so they can be reviewed.</p>}
          </div>
        )}
        {catalogError && <p role="alert" className="error read__alert">{catalogError}</p>}
        {openError && <p role="alert" className="error read__alert">{openError}</p>}
        {structureReady && last && (
          <Link className="home__continue" to={hrefOf(last)} onClick={follow(last)}>
            <span className="home__continue-label">Continue reading</span>
            <div className="home__continue-ref" lang={last.lang}>{last.title}</div>
            {lastBook && lastBook.title !== last.title && <div className="home__continue-sub">{lastBook.title}</div>}
          </Link>
        )}
        <NextForYou />
        <p className="card__note"><Link to="/team-texts">Team Texts</Link> · what your team reads</p>
        {(lang === 'th' || lang === 'hi') && <p className="card__note"><Link to="/alphabet">Alphabet</Link> · learn the letters, 10 at a time</p>}
        {tags.length > 0 && (
          <div className="segmented lib__tags" role="group" aria-label="Pathways">
            <button type="button" aria-pressed={tag === null} onClick={() => setTag(null)}>all</button>
            {tags.map((t) => (
              <button key={t} type="button" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>{t}</button>
            ))}
          </div>
        )}
        {structureReady && hasAny && (
          <nav className="lib" aria-label="Books">
            {shelves.map((s) => (
              <Group key={s.id} id={s.id} level={1} open={open.has(s.id)} onToggle={toggle} title={s.title} meta={plural(s.books.length, 'book', 'books')}>
                {s.books.map(bookGroup)}
              </Group>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
