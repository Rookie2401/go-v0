/**
 * Reading (comprehensible input) and Scripture lists, in Biblia's entry-list format: texts grouped by
 * corpus under tracked headings, pathway tags as segmented pills, the personalised band and coverage
 * as an italic preview line, badges as chips.
 *
 * Progress per row is the shared `ProgressLine` over the canonical records from `useReadingProgress` (and coverage from
 * `useCoverageMany`): the same wording and the same numbers as Home and the reader. Never "Read" for a count.
 *
 * Publication gate: only published texts are listed. In preview mode unpublished texts are listed too, each with
 * its reasons. When nothing is visible the page says exactly what is awaited instead of showing an empty list.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CatalogText, Text, Work } from '../../core';
import { CANON, runningNumber } from '../../library/canon';
import { scriptureAddress } from '../../course/scriptureIntegrity';
import { useApp } from '../context';
import { BibleAccess } from '../course/BibleAccess';
import { BAND_LABEL, awaitedStatement, plainReasons, isVisibleText, languageName, pct, textPath } from '../format';
import { ProgressLine, useCoverageMany, useReadingProgress } from '../coverage';
import { TextBadges, UnpublishedReasons, useLangTexts } from '../library';
import { usePreview } from '../prefs';
import { BackLink, Topbar } from '../ui';

export function Library({ mode }: { mode: 'corpus' | 'scripture' }) {
  const { course, catalog, library, lang, bus, userId, store } = useApp();
  const navigate = useNavigate();
  const preview = usePreview();
  const { texts: allTexts } = useLangTexts();
  const [tag, setTag] = useState<string | null>(null);
  const title = mode === 'scripture' ? 'Scripture' : 'Reading';

  const ofKind = useMemo(
    () => (allTexts ?? []).filter((t) => (mode === 'scripture' ? t.kind === 'scripture' : t.kind !== 'scripture')).sort((a, b) => a.title.localeCompare(b.title)),
    [allTexts, mode],
  );
  const texts = useMemo(() => ofKind.filter((t) => isVisibleText(t, preview)), [ofKind, preview]);
  const [continueText, setContinueText] = useState<Text | null>(null);
  useEffect(() => {
    let live = true;
    if (mode !== 'corpus' || texts.length === 0) { setContinueText(null); return () => { live = false; }; }
    void bus.history({ userId, types: ['TextViewed'] }).then(async (events) => {
      for (let i = events.length - 1; i >= 0; i--) {
        const t = await store.texts.get((events[i] as { textId?: string }).textId ?? '');
        if (t && texts.some((x) => x.id === t.id)) { if (live) setContinueText(t); return; }
      }
      if (live) setContinueText(null);
    }).catch(() => { if (live) setContinueText(null); });
    return () => { live = false; };
  }, [bus, mode, store, texts, userId]);

  // The resident store is only one part of Reading. Library chapters are opened lazily and belong on this surface too.
  const [catalogTexts, setCatalogTexts] = useState<CatalogText[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [libraryAvailable, setLibraryAvailable] = useState<boolean | null>(mode === 'corpus' ? true : null);
  const [scriptureBook, setScriptureBook] = useState(0);
  useEffect(() => {
    let live = true;
    setCatalogReady(false);
    setCatalogError(null);
    setCatalogTexts([]);
    setLibraryAvailable(mode === 'corpus' ? true : null);
    if (mode === 'scripture') {
      void library.info(lang).then((info) => {
        if (!live) return;
        setLibraryAvailable(!!info);
        if (!info) { setCatalogTexts([]); setCatalogReady(true); return; }
        return (async () => {
          const rows: CatalogText[] = [];
          let offset = 0;
          while (true) {
            const page = await library.search({ lang, stream: 'scripture', publishedOnly: !preview, limit: 200, offset });
            rows.push(...page.items.filter((t) => t.published || preview));
            offset += page.items.length;
            if (page.items.length === 0 || offset >= page.total) break;
          }
          if (live) { setCatalogTexts(rows); setCatalogReady(true); }
        })();
      }).catch((e: unknown) => { if (live) { setCatalogTexts([]); setCatalogReady(true); setCatalogError(e instanceof Error ? e.message : 'Could not load Scripture.'); } });
      return () => { live = false; };
    }
    setLibraryAvailable(true);
    setCatalogReady(false);
    if (mode !== 'corpus') { setCatalogTexts([]); return () => { live = false; }; }
    void (async () => {
      const rows: CatalogText[] = [];
      let offset = 0;
      while (true) {
        const page = await library.search({ lang, ...(course.readsLangs?.length ? { alsoLangs: course.readsLangs } : {}), publishedOnly: !preview, limit: 200, offset });
        rows.push(...page.items.filter((t) => t.stream !== 'scripture' && !(t.streams ?? []).includes('scripture') && (t.published || preview)));
        offset += page.items.length;
        if (page.items.length === 0 || offset >= page.total) break;
      }
      if (live) { setCatalogTexts(rows); setCatalogReady(true); }
    })().catch((e: unknown) => { if (live) { setCatalogTexts([]); setCatalogReady(true); setCatalogError(e instanceof Error ? e.message : 'Could not load available reading.'); } });
    return () => { live = false; };
  }, [library, lang, course.readsLangs, mode, preview]);
  const residentIds = useMemo(() => new Set(texts.map((t) => t.id)), [texts]);
  const lazyTexts = useMemo(() => catalogTexts.filter((t) => !residentIds.has(t.id)), [catalogTexts, residentIds]);

  const textIds = useMemo(() => texts.map((t) => t.id), [texts]);
  const progress = useReadingProgress(textIds);
  const coverage = useCoverageMany(textIds);

  const tags = useMemo(() => [...new Set(texts.flatMap((t) => t.tags ?? []))].sort(), [texts]);
  const visible = useMemo(() => texts.filter((t) => !tag || (t.tags ?? []).includes(tag)), [texts, tag]);
  const visibleLazy = useMemo(() => (tag ? [] : lazyTexts), [lazyTexts, tag]);
  // Chapters of a work (the learner's own copies of the ladder's books) are grouped by work, in chapter order; everything else by corpus as before.
  const [works, setWorks] = useState<Map<string, Work>>(new Map());
  const [stageOrder, setStageOrder] = useState<Map<string, number>>(new Map());
  const [openError, setOpenError] = useState<string | null>(null);
  const workOrder = (id: string | undefined) => {
    const w = id ? works.get(id) : undefined;
    return [w ? (stageOrder.get(w.stageId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER, w?.order ?? Number.MAX_SAFE_INTEGER, w?.role === 'spine' ? 0 : 1, w?.title ?? ''] as const;
  };
  const { plain, byWork } = useMemo(() => {
    const w = new Map<string, Text[]>();
    const rest: Text[] = [];
    for (const t of visible) { if (t.workId) w.set(t.workId, [...(w.get(t.workId) ?? []), t]); else rest.push(t); }
    for (const list of w.values()) list.sort((a, b) => (a.chapter?.index ?? 0) - (b.chapter?.index ?? 0) || a.title.localeCompare(b.title));
    return {
      plain: rest,
      byWork: [...w.entries()].sort(([a], [b]) => {
        const x = workOrder(a), y = workOrder(b);
        return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || x[3].localeCompare(y[3]);
      }),
    };
  }, [visible, works, stageOrder]);
  void byWork;
  const workIds = useMemo(() => [...new Set([...visible.map((t) => t.workId), ...visibleLazy.map((t) => t.workId)].filter((id): id is string => !!id))], [visible, visibleLazy]);
  useEffect(() => {
    let live = true;
    if (workIds.length === 0) return;
    void Promise.all(workIds.map((id) => catalog.work(id))).then((rows) => {
      if (live) setWorks((old) => new Map([...old, ...rows.flatMap((w) => (w ? [[w.id, w] as const] : []))]));
    }).catch(() => undefined);
    return () => { live = false; };
  }, [catalog, workIds]);
  const lazyWorkIds = useMemo(() => [...new Set(lazyTexts.map((t) => t.workId).filter((id): id is string => !!id))], [lazyTexts]);
  useEffect(() => {
    let live = true;
    if (lazyWorkIds.length === 0) return () => { live = false; };
    void Promise.all(lazyWorkIds.map((id) => catalog.work(id))).then((rows) => {
      if (live) setWorks((old) => new Map([...old, ...rows.flatMap((w) => (w ? [[w.id, w] as const] : []))]));
    }).catch(() => undefined);
    return () => { live = false; };
  }, [catalog, lazyWorkIds]);
  useEffect(() => {
    let live = true;
    void catalog.stages(course.id).then((rows) => {
      if (live) setStageOrder(new Map(rows.map((s) => [s.id, s.index])));
    }).catch(() => undefined);
    return () => { live = false; };
  }, [catalog, course.id]);
  const byCorpus = useMemo(() => {
    const m = new Map<string, Text[]>();
    for (const t of plain) { const l = m.get(t.corpusId) ?? []; l.push(t); m.set(t.corpusId, l); }
    return [...m.entries()];
  }, [plain]);
  const lazyOrdered = useMemo(() => [...visibleLazy].sort((a, b) => {
    const x = workOrder(a.workId), y = workOrder(b.workId);
    const xs = a.stageId ? (stageOrder.get(a.stageId) ?? Number.MAX_SAFE_INTEGER) : x[0];
    const ys = b.stageId ? (stageOrder.get(b.stageId) ?? Number.MAX_SAFE_INTEGER) : y[0];
    return xs - ys || x[1] - y[1] || (a.chapter ?? Number.MAX_SAFE_INTEGER) - (b.chapter ?? Number.MAX_SAFE_INTEGER) || a.title.localeCompare(b.title);
  }), [visibleLazy, works, stageOrder]);
  const readingEntries = useMemo(() => [
    ...visible.map((t) => ({ kind: 'resident' as const, text: t, order: workOrder(t.workId), chapter: t.chapter?.index ?? Number.MAX_SAFE_INTEGER })),
    ...lazyOrdered.map((t) => ({ kind: 'catalog' as const, text: t, order: workOrder(t.workId), chapter: t.chapter ?? Number.MAX_SAFE_INTEGER })),
  ].sort((a, b) => {
    const as = 'stageId' in a.text && a.text.stageId ? (stageOrder.get(a.text.stageId) ?? a.order[0]) : a.order[0];
    const bs = 'stageId' in b.text && b.text.stageId ? (stageOrder.get(b.text.stageId) ?? b.order[0]) : b.order[0];
    return as - bs || a.order[1] - b.order[1] || a.order[2] - b.order[2] || a.chapter - b.chapter || a.text.title.localeCompare(b.text.title);
  }), [visible, lazyOrdered, stageOrder, works]);

  const renderRow = (t: Text, titleOf: (t: Text) => string = (x) => x.title) => {
    const c = coverage.get(t.id);
    const p = progress.get(t.id);
    return (
      <li key={t.id}>
        <Link to={textPath(t)} className="entry entry--text">
          <span className="entry__title" lang={t.lang}>{titleOf(t)}</span>
          <span className="entry__tags">
            {t.staticLevel && <span className="lib__meta">{t.staticLevel}</span>}
            {t.version && <span className="chip">{t.version}</span>}
            <TextBadges text={t} />
          </span>
          {(c || p) && (
            <span className={`entry__preview${c ? ` band-${c.band}` : ''}`} title={c?.explanation}>
              {p && <ProgressLine progress={p} testId="library-progress" />}
              {p && c && ' · '}
              {c && <>{BAND_LABEL[c.band]} · shown {pct(c.knownLexicalCoverage)}{(c.estimatedFamiliarCoverage ?? 0) > 0 ? ` · likely familiar ${pct(c.estimatedFamiliarCoverage)} (estimate)` : ''}</>}
            </span>
          )}
        </Link>
        <UnpublishedReasons text={t} />
      </li>
    );
  };
  const openCatalog = async (t: CatalogText) => {
    setOpenError(null);
    try { navigate(textPath(await library.open(t.id))); } catch (e: unknown) { setOpenError(e instanceof Error ? e.message : 'Could not open this reading.'); }
  };

  // Catalog chapter numbers are the canonical running Bible number, so this remains stable when
  // resident starter chapters and lazy chapters are mixed (and across localized titles).
  const scriptureEntries = useMemo(() => {
    const entries: Array<{ kind: 'resident' | 'catalog'; text: Text | CatalogText }> = [
      ...texts.map((text) => ({ kind: 'resident' as const, text })),
      ...lazyTexts.map((text) => ({ kind: 'catalog' as const, text })),
    ];
    const books = CANON.map(([code, chapters]) => ({ code, chapters, rows: [] as Array<{ kind: 'resident' | 'catalog'; text: Text | CatalogText; chapter: number }> }));
    const runningToBook = (n: number | undefined) => {
      if (!n || n < 1) return -1;
      let at = 0;
      for (let i = 0; i < CANON.length; i++) { at += CANON[i][1]; if (n <= at) return i; }
      return -1;
    };
    const canonical = new Map<number, Array<{ kind: 'resident' | 'catalog'; text: Text | CatalogText }>>();
    for (const entry of entries) {
      const text = entry.text;
      const address = scriptureAddress(text);
      const n = address ? runningNumber(address.book, address.chapter) : undefined;
      if (n !== undefined) {
        const at = canonical.get(n) ?? [];
        // The same text may be resident and in the lazy catalogue; suppress only that exact
        // identity. Distinct editions/passages at the same canon position remain reachable.
        if (!at.some((row) => row.text.id === text.id)) at.push(entry);
        canonical.set(n, at);
      }
    }
    for (const [n, rows] of canonical) {
      const book = runningToBook(n);
      if (book >= 0) for (const entry of rows) books[book].rows.push({ ...entry, chapter: n - CANON.slice(0, book).reduce((sum, [, count]) => sum + count, 0) });
    }
    return books.map((book) => {
      const rows = book.rows.sort((a, b) => a.chapter - b.chapter);
      const source = rows.find((row) => /\s\d+$/.test(row.text.title))?.text.title ?? rows[0]?.text.title;
      return { ...book, rows, label: source?.replace(/\s+\d.*$/, '') ?? book.code };
    });
  }, [texts, lazyTexts]);
  const starterTexts = useMemo(() => texts.filter((text) => {
    const address = scriptureAddress(text);
    const n = address ? runningNumber(address.book, address.chapter) : undefined;
    return n === undefined || n < 1;
  }), [texts]);

  const bar = <Topbar title={title} left={<BackLink to="/" label="Home" />} />;
  if (allTexts === null) return <div>{bar}<div className="page"><p className="muted" role="status">Loading…</p></div></div>;

  const awaited = mode === 'corpus' && catalogReady && texts.length === 0 && lazyTexts.length === 0 ? awaitedStatement(ofKind, mode, languageName(course)) : null;

  return (
    <div>
      {bar}
      <div className="page page--narrow route-fade">
        {mode === 'scripture' && <BibleAccess lang={course.lang} />}
        {mode === 'scripture' && !catalogReady && <p className="muted" role="status">Loading Scripture library…</p>}
        {mode === 'scripture' && catalogReady && (libraryAvailable === false || (texts.length === 0 && lazyTexts.length === 0)) && <p className="awaited" role="status">No {languageName(course)} Scripture library is available yet.</p>}
        {awaited && (
          <div className="awaited" role="status" data-testid="awaited">
            <p className="muted">{awaited.headline}</p>
            {awaited.reasons.length > 0 && <ul className="reasons">{plainReasons(awaited.reasons).map((r) => <li key={r}>{r}</li>)}</ul>}
            {ofKind.length > 0 && !preview && <p className="card__note"><Link to="/settings">Preview mode in Settings</Link> lists them, clearly marked, so they can be reviewed.</p>}
          </div>
        )}
        {continueText && mode === 'corpus' && (
          <Link className="home__continue" to={textPath(continueText)}>
            <span className="home__continue-label">Continue reading</span>
            <span className="home__continue-ref" lang={continueText.lang}>{continueText.title}</span>
          </Link>
        )}
        {mode === 'corpus' && <p className="card__note"><Link to="/team-texts">Team Texts</Link> · what your team reads</p>}
        {tags.length > 0 && (
          <div className="segmented lib__tags" role="group" aria-label="Pathways">
            <button type="button" aria-pressed={tag === null} onClick={() => setTag(null)}>all</button>
            {tags.map((t) => (
              <button key={t} type="button" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>{t}</button>
            ))}
          </div>
        )}
        <div className="lib">
          {catalogError && <p role="alert" className="error">{catalogError}</p>}
          {openError && <p role="alert" className="error">{openError}</p>}
          {mode === 'corpus' && readingEntries.length > 0 && (
            <section className="lib__group lib__group--1" data-testid="reading-path">
              <h2 className="lib__head"><span className="lib__title">Reading path</span><span className="lib__meta">{readingEntries.length} {readingEntries.length === 1 ? 'text' : 'texts'}</span></h2>
              <ul className="list entrylist">
                {readingEntries.map((row) => row.kind === 'resident' ? renderRow(row.text) : (
                  <li key={row.text.id} data-text-id={row.text.id}>
                    <button type="button" className="entry entry--text" onClick={() => { void openCatalog(row.text); }}>
                      <span className="entry__title" lang={row.text.lang}>{row.text.title}</span>
                      <span className="entry__tags">{row.text.author && <span className="lib__meta">{row.text.author}</span>}{row.text.chapter !== undefined && <span className="chip">Chapter {row.text.chapter}</span>}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {mode === 'scripture' && catalogReady && (libraryAvailable !== false || texts.length > 0) && (texts.length > 0 || lazyTexts.length > 0) && scriptureEntries.length > 0 && (
            <section className="lib__group lib__group--1" data-testid="scripture-library">
              <h2 className="lib__head"><span className="lib__title">Scripture library</span><span className="lib__meta">{scriptureEntries.filter((book) => book.rows.length > 0).length} books · {scriptureEntries.reduce((sum, book) => sum + new Set(book.rows.map((row) => row.chapter)).size, 0)} chapters</span></h2>
              <label className="field-label" htmlFor="scripture-book">Book</label>
              <select id="scripture-book" value={scriptureBook} onChange={(e) => setScriptureBook(Number(e.target.value))}>
                {scriptureEntries.map((book, i) => <option key={book.code} value={i}>{book.label} · {book.chapters} {book.chapters === 1 ? 'chapter' : 'chapters'}</option>)}
              </select>
              {scriptureEntries.map((book, i) => (
                <details key={book.code} open={i === scriptureBook} className="lib__book">
                  <summary><span>{book.label}</span><span className="lib__meta">{new Set(book.rows.map((row) => row.chapter)).size}/{book.chapters} chapters</span></summary>
                  <ul className="list entrylist">
                    {book.rows.map((row) => row.kind === 'resident' ? renderRow(row.text as Text, () => (row.text as Text).title) : (
                      <li key={row.text.id}><button type="button" className="entry entry--text" onClick={() => { void openCatalog(row.text as CatalogText); }}><span className="entry__title" lang={row.text.lang}>{row.text.title}</span><span className="entry__tags"><span className="chip">Chapter {row.chapter}</span></span></button></li>
                    ))}
                  </ul>
                </details>
              ))}
            </section>
          )}
          {mode === 'scripture' && starterTexts.length > 0 && (
            <section className="lib__group lib__group--1" data-testid="starter-passages">
              <h2 className="lib__head"><span className="lib__title">Starter passages</span><span className="lib__meta">{starterTexts.length} {starterTexts.length === 1 ? 'passage' : 'passages'}</span></h2>
              <ul className="list entrylist">{starterTexts.map((text) => renderRow(text))}</ul>
            </section>
          )}
          {mode === 'corpus' && readingEntries.length === 0 && byCorpus.length > 0 && (
            <section className="lib__group lib__group--1">
              <h2 className="lib__head"><span className="lib__title">Reading</span><span className="lib__meta">{byCorpus.reduce((n, [, rows]) => n + rows.length, 0)} texts</span></h2>
              <ul className="list entrylist">{byCorpus.flatMap(([, rows]) => rows.map((text) => renderRow(text)))}</ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
