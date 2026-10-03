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
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CatalogText, LanguageCode, Text } from '../../core';
import { CANON, bookIndex } from '../../library/canon';
import { useApp } from '../context';
import { BibleAccess } from '../course/BibleAccess';
import { ProgressLine, useCoverageMany, useReadingProgress } from '../coverage';
import { BAND_LABEL, isVisibleText, languageName, pct, textPath } from '../format';
import { TextBadges, UnpublishedReasons, useLangTexts } from '../library';
import { Library } from '../pages/Library';
import { usePreview } from '../prefs';
import { BackLink, Topbar } from '../ui';
import { bookName, bookNameEn, canonTree, isScriptureLang, placeOfRunning } from './canon';
import type { BookNode, DivisionNode, ScriptureLang, TestamentNode } from './canon';
import './scripture.css';

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
  const { course, library, bus, userId } = useApp();
  const navigate = useNavigate();
  const preview = usePreview();
  const { texts: allTexts } = useLangTexts();

  // Resident Scripture texts, behind the publication gate.
  const residentAll = useMemo(() => (allTexts ?? []).filter((t) => t.kind === 'scripture'), [allTexts]);
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
  // A library row is dropped when it is a resident text (same id), or the same chapter under the same title as one, or the chapter a resident
  // text carries by its running canon number: the resident copy is the one that has the learner's progress. A partial passage with its own title stays.
  const lazy = useMemo(() => {
    const have = new Set(residentAll.map((t) => t.id));
    const key = (p: { book: string; chapter: number }, title: string) => `${p.book}:${p.chapter}:${title}`;
    const same = new Set(resident.flatMap((t) => { const p = placeOf(t); return p ? [key(p, t.title)] : []; }));
    const running = new Set(resident.flatMap((t) => (t.chapter?.index !== undefined ? [t.chapter.index] : [])));
    return catalogTexts.filter((t) => {
      const p = placeOf(t);
      return !have.has(t.id) && !(p && same.has(key(p, t.title))) && !(t.chapter !== undefined && running.has(t.chapter));
    });
  }, [catalogTexts, residentAll, resident]);

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
      <div className="page page--narrow scripture route-fade">
        <BibleAccess lang={course.lang} />
        {!catalogReady && <p className="muted" role="status">Loading Scripture library…</p>}
        {empty && <p className="awaited" role="status">No {languageName(course)} Scripture library is available yet.</p>}
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

const CHEVRON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
);

/**
 * One book's group, re-rendered only when what it shows changes: its own open state, its chapters, the learner's progress
 * and coverage, the chapter last read, preview mode. Clicking one book then renders that book, not all 66 with their rows,
 * so the opening animation starts at once.
 */
const BookSection = memo(
  function BookSection({ render }: { open: boolean; chapters: unknown; progress: unknown; coverage: unknown; lastId?: string; preview: boolean; render: () => ReactNode }) {
    return <>{render()}</>;
  },
  (a, b) => a.open === b.open && a.chapters === b.chapters && a.progress === b.progress && a.coverage === b.coverage && a.lastId === b.lastId && a.preview === b.preview,
);

/**
 * Height-animated disclosure: grid-template-rows 0fr <-> 1fr; `inert` keeps a collapsed panel out of tab and
 * assistive-technology reach. Content that is mounted on opening is first laid out closed and opened on the next frame,
 * so the panel always grows from nothing instead of appearing at its full height.
 */
function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  const [shown, setShown] = useState(open);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open) { setShown(false); return; }
    // lay the newly mounted content out CLOSED (a forced layout read), then open it in the same task, before paint:
    // the browser has a closed starting point to transition from, without waiting for animation frames
    ref.current?.getBoundingClientRect();
    setShown(true);
  }, [open]);
  const isOpen = open && shown;
  return (
    <div ref={ref} className="collapsible" data-open={isOpen ? 'true' : 'false'}>
      <div className="collapsible__inner" inert={!isOpen}>{children}</div>
    </div>
  );
}

/** One disclosure rung: a button head with a rotating (decorative) chevron and height-animated children. A group that cannot be opened is a muted, non-interactive head. */
function Group({ id, level, open, onToggle, title, native, lang, meta, current, expandable = true, children }: {
  id: string; level: 1 | 2 | 3; open: boolean; onToggle: (id: string) => void; title: string; native: string; lang: LanguageCode; meta?: string; current?: boolean; expandable?: boolean; children: ReactNode | (() => ReactNode);
}) {
  // A book's chapter list is mounted on first opening and then kept (so the collapse can animate); every group above it is always mounted.
  const seen = useRef(open);
  if (open && expandable) seen.current = true;
  const head = (
    <>
      <span className={`lib__chev${open && expandable ? ' lib__chev--open' : ''}${expandable ? '' : ' lib__chev--none'}`} aria-hidden="true">{CHEVRON}</span>
      <span className="lib__title">{title}</span>
      {native && <span className="lib__native" lang={lang}>{native}</span>}
      {meta && <span className="lib__meta">{meta}</span>}
    </>
  );
  return (
    <div className={`lib__group lib__group--${level}${current ? ' lib__group--current' : ''}${expandable ? '' : ' lib__group--empty'}`} data-group={id}>
      {expandable ? (
        <button type="button" className="lib__head" aria-expanded={open} onClick={() => onToggle(id)}>{head}</button>
      ) : (
        <div className="lib__head lib__head--static" data-unavailable="true">{head}</div>
      )}
      {expandable && <Collapsible open={open}><div className="lib__children">{level < 3 || seen.current ? (typeof children === 'function' ? children() : children) : null}</div></Collapsible>}
    </div>
  );
}
