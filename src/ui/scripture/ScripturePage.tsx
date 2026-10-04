/**
 * Scripture (#/scripture), laid out as Biblia's Home: the canon as nested disclosures — testament → division → book →
 * chapters — each level a button head with a rotating chevron and a height-animated collapsible, children indented one rung
 * and tied to the parent with a quiet rule, chapters as a vertical list of entries. Which levels are open is remembered on
 * this device (go.scripture.open.<lang>).
 *
 * Data is what the old page used, nothing added: the language's resident Scripture texts (useLangTexts) and the lazily
 * loaded library chapters (library.info / library.search, stream 'scripture'). A chapter is placed by its `scripture.book`
 * and `scripture.chapter` (a library row without that field by its running canon number) — never by parsing its title — and
 * shown by its own title. Every book of the 66-book canon is listed; a book with no chapter in Go is muted and cannot be
 * opened; a chapter that is not in Go is a muted, inert row.
 *
 * Publication gate as before: unpublished texts appear only in preview mode, each with its badges and reasons.
 * Albanian keeps the previous page (ScriptureRoute).
 */
import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CatalogText, LanguageCode, Text } from '../../core';
import { CANON, bookIndex } from '../../library/canon';
import { useApp } from '../context';
import { ProgressLine, useCoverageMany, useReadingProgress } from '../coverage';
// the dropdown parts (and disclosure.css) load before scripture.css, so this page's own rules win where both apply
import { BookSection, Group } from '../disclosure/Disclosure';
import { BAND_LABEL, awaitedStatement, isVisibleText, languageName, pct, plainReasons, textPath } from '../format';
import { TextBadges, UnpublishedReasons, useLangTexts } from '../library';
import { Library } from '../pages/Library';
import { usePreview } from '../prefs';
import { BackLink, Topbar } from '../ui';
import { bookName, bookNameEn, canonTree, isScriptureLang, placeOfRunning } from './canon';
import type { BookNode, DivisionNode, ScriptureLang, TestamentNode } from './canon';
import './scripture.css';

/**
 * The "Bible access" block (src/ui/course/BibleAccess.tsx) belongs to another line of work and is not committed yet. It is
 * shown when the module is present and simply left out when it is not, so this page never depends on an uncommitted file
 * (a clean checkout of the repository must build). `import.meta.glob` returns an empty object for a missing file.
 */
const bibleAccessModules = import.meta.glob<{ BibleAccess?: (p: { lang: LanguageCode }) => ReactNode }>('../course/BibleAccess.tsx', { eager: true });
const BibleAccess = Object.values(bibleAccessModules)[0]?.BibleAccess;

/** The route: every language but Albanian gets the canon tree; Albanian keeps the previous page. */
export function ScriptureRoute() {
  const { lang } = useApp();
  return lang !== 'sq' && isScriptureLang(lang) ? <ScripturePage lang={lang} /> : <Library mode="scripture" />;
}

/** One chapter-sized thing the learner can open, resident in the store or listed in the library. */
interface Entry {
  id: string;
  title: string;
  book: string;
  chapter: number;
  text?: Text;
  catalog?: CatalogText;
}

/** Where a text sits in the canon: its own scripture reference, else (library rows) its running canon number. */
function placeOf(row: Text | CatalogText): { book: string; chapter: number } | undefined {
  const s = (row as { scripture?: { book: string; chapter: number } }).scripture;
  if (s) {
    const i = bookIndex.get(s.book);
    if (i !== undefined && Number.isInteger(s.chapter) && s.chapter >= 1 && s.chapter <= CANON[i][1]) return { book: s.book, chapter: s.chapter };
  }
  const c = (row as { chapter?: number | { index: number } }).chapter;
  const running = typeof c === 'number' ? c : c?.index;
  return running === undefined ? undefined : placeOfRunning(running);
}

const openKey = (lang: string) => `go.scripture.open.${lang}`;
function readOpen(lang: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(openKey(lang));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? new Set(parsed.filter((x): x is string => typeof x === 'string')) : null;
  } catch {
    return null;
  }
}

export function ScripturePage({ lang }: { lang: ScriptureLang }) {
  const { course, library, bus, userId, store } = useApp();
  const navigate = useNavigate();
  const preview = usePreview();
  const { texts: allTexts } = useLangTexts();

  // Resident Scripture texts, behind the publication gate.
  const residentAll = useMemo(() => (allTexts ?? []).filter((t) => t.kind === 'scripture' && t.listeningAssessmentId === undefined), [allTexts]);
  const resident = useMemo(() => residentAll.filter((t) => isVisibleText(t, preview)), [residentAll, preview]);

  // Library chapters, opened lazily (paged exactly as the previous page did).
  const [catalogTexts, setCatalogTexts] = useState<CatalogText[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setCatalogReady(false);
    setCatalogError(null);
    setCatalogTexts([]);
    void library.info(course.lang).then((info) => {
      if (!live) return;
      if (!info) { setCatalogTexts([]); setCatalogReady(true); return; }
      return (async () => {
        const rows: CatalogText[] = [];
        let offset = 0;
        while (true) {
          const page = await library.search({ lang: course.lang, stream: 'scripture', publishedOnly: !preview, limit: 200, offset });
          rows.push(...page.items.filter((t) => t.published || preview));
          offset += page.items.length;
          if (page.items.length === 0 || offset >= page.total) break;
        }
        if (live) { setCatalogTexts(rows); setCatalogReady(true); }
      })();
    }).catch((e: unknown) => { if (live) { setCatalogTexts([]); setCatalogReady(true); setCatalogError(e instanceof Error ? e.message : 'Could not load Scripture.'); } });
    return () => { live = false; };
  }, [library, course.lang, preview]);
  // How many live sentences each resident Scripture text has: a resident text is the library chapter only when it is as long.
  const [residentSentences, setResidentSentences] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    let live = true;
    void Promise.all(residentAll.map(async (t) => [t.id, (await store.sentences.where('textId', t.id)).filter((x) => x.retiredInVersion === undefined).length] as const))
      .then((rows) => { if (live) setResidentSentences(new Map(rows)); })
      .catch(() => { if (live) setResidentSentences(new Map()); });
    return () => { live = false; };
  }, [store, residentAll]);
  // A library row is the resident text's chapter, and is dropped, when it has the same id — or when a resident text has the
  // same canon place, the same title, the same edition (work) AND at least as many sentences (so it is the whole chapter, not
  // a passage of it). Everything else stays listed beside it: a partial seed passage (it can carry the same title as the
  // complete chapter — the bundled 1 John "1:8–9; John 3:16" seed and its complete chapter do), another edition, a chapter
  // whose resident length is not known yet. The resident copy is the one that carries the learner's progress.
  const lazy = useMemo(() => {
    const have = new Set(residentAll.map((t) => t.id));
    const same = (t: CatalogText) => residentAll.some((r) => {
      const a = placeOf(r), b = placeOf(t);
      const n = residentSentences.get(r.id);
      return !!a && !!b && a.book === b.book && a.chapter === b.chapter && r.title.trim() === t.title.trim()
        && (!r.workId || !t.workId || r.workId === t.workId)
        && n !== undefined && n >= (t.features?.sentences ?? Number.POSITIVE_INFINITY);
    });
    return catalogTexts.filter((t) => !have.has(t.id) && !same(t));
  }, [catalogTexts, residentAll, residentSentences]);

  // Progress and coverage for the resident texts, the same shared reads as before.
  const textIds = useMemo(() => resident.map((t) => t.id), [resident]);
  const progress = useReadingProgress(textIds);
  const coverage = useCoverageMany(textIds);

  // id → entry, and book → chapter → entries; a text with no place in the canon goes under "Other passages".
  const { byBook, others, byId } = useMemo(() => {
    const byBook = new Map<string, Map<number, Entry[]>>();
    const others: Entry[] = [];
    const byId = new Map<string, Entry>();
    const all: Entry[] = [
      ...resident.map((text) => ({ id: text.id, title: text.title, text, place: placeOf(text) })),
      ...lazy.map((catalog) => ({ id: catalog.id, title: catalog.title, catalog, place: placeOf(catalog) })),
    ].map(({ place, ...e }) => ({ ...e, book: place?.book ?? '', chapter: place?.chapter ?? 0 }));
    for (const e of all) {
      byId.set(e.id, e);
      if (!e.book) { others.push(e); continue; }
      const chapters = byBook.get(e.book) ?? new Map<number, Entry[]>();
      chapters.set(e.chapter, [...(chapters.get(e.chapter) ?? []), e]);
      byBook.set(e.book, chapters);
    }
    for (const chapters of byBook.values()) for (const list of chapters.values()) list.sort((a, b) => Number(!!b.text) - Number(!!a.text) || a.title.localeCompare(b.title));
    return { byBook, others, byId };
  }, [resident, lazy]);

  const tree = useMemo(() => canonTree(lang), [lang]);
  const availableIn = (b: BookNode) => byBook.get(b.code)?.size ?? 0;
  const booksWith = (books: BookNode[]) => books.filter((b) => availableIn(b) > 0).length;

  // Which groups are open: remembered on this device; by default the testament that has chapters and the first book with chapters.
  const [stored, setStored] = useState<Set<string> | null>(() => readOpen(lang));
  useEffect(() => { setStored(readOpen(lang)); }, [lang]);
  const defaults = useMemo(() => {
    const set = new Set<string>();
    let first = false;
    for (const t of tree) {
      for (const d of t.divisions) {
        for (const b of d.books) {
          if (!byBook.has(b.code)) continue;
          set.add(`t:${t.id}`);
          if (!first) { first = true; set.add(`d:${d.id}`); set.add(`b:${b.code}`); }
        }
      }
    }
    return set;
  }, [tree, byBook]);
  const open = stored ?? defaults;
  const toggle = (id: string) => {
    setStored((prev) => {
      const next = new Set(prev ?? defaults);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try { localStorage.setItem(openKey(lang), JSON.stringify([...next])); } catch { /* private mode */ }
      return next;
    });
  };

  // Continue reading: the chapter last viewed (TextViewed), among the texts listed here.
  const [last, setLast] = useState<Entry | null>(null);
  useEffect(() => {
    let live = true;
    if (byId.size === 0) { setLast(null); return () => { live = false; }; }
    void bus.history({ userId, types: ['TextViewed'] }).then((events) => {
      for (let i = events.length - 1; i >= 0; i--) {
        const e = byId.get((events[i] as { textId?: string }).textId ?? '');
        if (e) { if (live) setLast(e); return; }
      }
      if (live) setLast(null);
    }).catch(() => { if (live) setLast(null); });
    return () => { live = false; };
  }, [bus, userId, byId]);

  const bar = <Topbar title="Scripture" left={<BackLink to="/" label="Home" />} />;
  if (allTexts === null) return <div>{bar}<div className="page"><p className="muted" role="status">Loading…</p></div></div>;

  const hasAny = resident.length > 0 || lazy.length > 0;
  // The previous page also said "no library" when only the library was missing; here a language with resident Scripture still gets its tree.
  const empty = catalogReady && !hasAny;

  // A lazily listed chapter is opened (made resident) first, then read; a resident one is a plain link.
  const follow = (e: Entry) => (ev: MouseEvent<HTMLAnchorElement>) => {
    if (e.text || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    setOpenError(null);
    void library.open(e.id).then((t) => navigate(textPath(t))).catch((err: unknown) => setOpenError(err instanceof Error ? err.message : 'Could not open this chapter.'));
  };
  const hrefOf = (e: Entry) => textPath(e.text ?? { id: e.id, kind: 'scripture' });

  const chapterRow = (e: Entry, label: string): ReactNode => {
    const t = e.text;
    const c = t ? coverage.get(t.id) : undefined;
    const p = t ? progress.get(t.id) : undefined;
    const done = !!p?.finishedAt;
    return (
      <div key={e.id} role="listitem" className="entryrow" data-text-id={e.id}>
        <Link to={hrefOf(e)} onClick={follow(e)} className={`entry entry--chapter${done ? ' entry--done' : ''}${last?.id === e.id ? ' entry--at' : ''}`}>
          <span className="entry__num">{label}</span>
          <span className="entry__native" lang={lang}>{e.title}</span>
          {(c || p) && (
            <span className={`entry__preview${c ? ` band-${c.band}` : ''}`} title={c?.explanation}>
              {p && <ProgressLine progress={p} testId="scripture-progress" />}
              {p && c && ' · '}
              {c && <>{BAND_LABEL[c.band]} · shown {pct(c.knownLexicalCoverage)}{(c.estimatedFamiliarCoverage ?? 0) > 0 ? ` · likely familiar ${pct(c.estimatedFamiliarCoverage)} (estimate)` : ''}</>}
            </span>
          )}
          {t && t.published !== true && <span className="entry__badges"><TextBadges text={t} /></span>}
          {!t && e.catalog && e.catalog.published !== true && (
            <span className="entry__badges"><span className="chip chip--wine" title="Not published; listed in preview mode only.">unpublished</span></span>
          )}
        </Link>
        {t && <UnpublishedReasons text={t} />}
      </div>
    );
  };

  const bookGroup = (b: BookNode) => {
    const chapters = byBook.get(b.code);
    const n = chapters?.size ?? 0;
    const rowsOf = (): ReactNode[] => {
    const rows: ReactNode[] = [];
    if (chapters) {
      for (let ch = 1; ch <= b.chapters; ch++) {
        const list = chapters.get(ch);
        if (list) list.forEach((e) => rows.push(chapterRow(e, `Chapter ${ch}`)));
        else {
          rows.push(
            <div key={`absent:${ch}`} role="listitem" className="entryrow entryrow--absent" data-absent="true">
              <div className="entry entry--chapter entry--absent">
                <span className="entry__num">Chapter {ch}</span>
                <span className="entry__preview">not yet in GoLearn</span>
              </div>
            </div>,
          );
        }
      }
    }
    return rows;
    };
    const isOpen = open.has(`b:${b.code}`);
    return (
      <BookSection key={b.code} open={isOpen} chapters={chapters} progress={progress} coverage={coverage} lastId={last?.id} preview={preview} render={() => (
      <Group
        id={`b:${b.code}`}
        level={3}
        open={isOpen}
        onToggle={toggle}
        title={b.en}
        native={b.native}
        lang={lang}
        expandable={n > 0}
        current={last?.book === b.code}
        meta={n > 0 ? `${n} ${n === 1 ? 'chapter' : 'chapters'} available` : 'not yet in GoLearn'}
      >
        {() => <div className="entrylist" role="list" aria-label={`${b.en} chapters`}>{rowsOf()}</div>}
      </Group>
      )} />
    );
  };
  const divisionGroup = (d: DivisionNode) => (
    <Group key={d.id} id={`d:${d.id}`} level={2} open={open.has(`d:${d.id}`)} onToggle={toggle} title={d.title} native={d.native} lang={lang} meta={`${booksWith(d.books)} of ${d.books.length} books`}>
      {d.books.map(bookGroup)}
    </Group>
  );
  const testamentGroup = (t: TestamentNode) => {
    const books = t.divisions.flatMap((d) => d.books);
    return (
      <Group key={t.id} id={`t:${t.id}`} level={1} open={open.has(`t:${t.id}`)} onToggle={toggle} title={t.title} native={t.native} lang={lang} meta={`${booksWith(books)} of ${books.length} books`}>
        {t.divisions.map(divisionGroup)}
      </Group>
    );
  };

  return (
    <div>
      {bar}
      <div className="page page--narrow scripture disclosure-page route-fade">
        {BibleAccess && <BibleAccess lang={course.lang} />}
        {!catalogReady && <p className="muted" role="status">Loading Scripture library…</p>}
        {empty && residentAll.length === 0 && <p className="awaited" role="status">No {languageName(course)} Scripture library is available yet.</p>}
        {empty && residentAll.length > 0 && (() => {
          const awaited = awaitedStatement(residentAll, 'scripture', languageName(course));
          return (
            <div className="awaited" role="status" data-testid="awaited">
              <p className="muted">{awaited.headline}</p>
              {awaited.reasons.length > 0 && <ul className="reasons">{plainReasons(awaited.reasons).map((r) => <li key={r}>{r}</li>)}</ul>}
              {!preview && <p className="card__note"><Link to="/settings">Preview mode in Settings</Link> lists them, clearly marked, so they can be reviewed.</p>}
            </div>
          );
        })()}
        {catalogError && <p role="alert" className="error scripture__alert">{catalogError}</p>}
        {openError && <p role="alert" className="error scripture__alert">{openError}</p>}
        {catalogReady && !empty && last && (
          <Link className="home__continue" to={hrefOf(last)} onClick={follow(last)}>
            <span className="home__continue-label">Continue reading</span>
            <div className="home__continue-ref" lang={lang}>{last.title}</div>
            {last.book && <div className="home__continue-sub">{bookNameEn(last.book)} · {bookName(lang, last.book)}</div>}
          </Link>
        )}
        {catalogReady && !empty && (
          <nav className="lib" aria-label="Books">
            {tree.map(testamentGroup)}
            {others.length > 0 && (
              <Group id="other" level={1} open={open.has('other')} onToggle={toggle} title="Other passages" native="" lang={lang} meta={`${others.length} ${others.length === 1 ? 'passage' : 'passages'}`}>
                <div className="entrylist" role="list" aria-label="Other passages">{others.map((e) => chapterRow(e, 'Passage'))}</div>
              </Group>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
