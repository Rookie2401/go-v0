/**
 * Read (comprehensible input) and Scripture lists, in Biblia's entry-list format: texts grouped by
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
import { Link } from 'react-router-dom';
import type { Text, Work } from '../../core';
import { useApp } from '../context';
import { chapterLabel } from '../course/WorkCard';
import { BAND_LABEL, awaitedStatement, plainReasons, isVisibleText, languageName, pct, textPath } from '../format';
import { ProgressLine, useCoverageMany, useReadingProgress } from '../coverage';
import { TextBadges, UnpublishedReasons, useLangTexts } from '../library';
import { usePreview } from '../prefs';
import { BackLink, Topbar } from '../ui';

export function Library({ mode }: { mode: 'corpus' | 'scripture' }) {
  const { course, catalog } = useApp();
  const preview = usePreview();
  const { texts: allTexts, corpora } = useLangTexts();
  const [tag, setTag] = useState<string | null>(null);
  const title = mode === 'scripture' ? 'Scripture' : 'Read';

  const ofKind = useMemo(
    () => (allTexts ?? []).filter((t) => (mode === 'scripture' ? t.kind === 'scripture' : t.kind !== 'scripture')).sort((a, b) => a.title.localeCompare(b.title)),
    [allTexts, mode],
  );
  const texts = useMemo(() => ofKind.filter((t) => isVisibleText(t, preview)), [ofKind, preview]);

  const textIds = useMemo(() => texts.map((t) => t.id), [texts]);
  const progress = useReadingProgress(textIds);
  const coverage = useCoverageMany(textIds);

  const tags = useMemo(() => [...new Set(texts.flatMap((t) => t.tags ?? []))].sort(), [texts]);
  const visible = useMemo(() => texts.filter((t) => !tag || (t.tags ?? []).includes(tag)), [texts, tag]);
  // Chapters of a work (the learner's own copies of the ladder's books) are grouped by work, in chapter order; everything else by corpus as before.
  const { plain, byWork } = useMemo(() => {
    const w = new Map<string, Text[]>();
    const rest: Text[] = [];
    for (const t of visible) { if (t.workId) w.set(t.workId, [...(w.get(t.workId) ?? []), t]); else rest.push(t); }
    for (const list of w.values()) list.sort((a, b) => (a.chapter?.index ?? 0) - (b.chapter?.index ?? 0) || a.title.localeCompare(b.title));
    return { plain: rest, byWork: [...w.entries()] };
  }, [visible]);
  const workIds = useMemo(() => byWork.map(([id]) => id), [byWork]);
  const [works, setWorks] = useState<Map<string, Work>>(new Map());
  useEffect(() => {
    let live = true;
    if (workIds.length === 0) return;
    void Promise.all(workIds.map((id) => catalog.work(id))).then((rows) => {
      if (live) setWorks(new Map(rows.flatMap((w) => (w ? [[w.id, w] as const] : []))));
    }).catch(() => undefined);
    return () => { live = false; };
  }, [catalog, workIds]);
  const byCorpus = useMemo(() => {
    const m = new Map<string, Text[]>();
    for (const t of plain) { const l = m.get(t.corpusId) ?? []; l.push(t); m.set(t.corpusId, l); }
    return [...m.entries()];
  }, [plain]);

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

  const bar = <Topbar title={title} left={<BackLink to="/" label="Home" />} />;
  if (allTexts === null) return <div>{bar}<div className="page"><p className="muted" role="status">Loading…</p></div></div>;

  const awaited = texts.length === 0 ? awaitedStatement(ofKind, mode, languageName(course)) : null;

  return (
    <div>
      {bar}
      <div className="page page--narrow route-fade">
        {awaited && (
          <div className="awaited" role="status" data-testid="awaited">
            <p className="muted">{awaited.headline}</p>
            {awaited.reasons.length > 0 && <ul className="reasons">{plainReasons(awaited.reasons).map((r) => <li key={r}>{r}</li>)}</ul>}
            {ofKind.length > 0 && !preview && <p className="card__note"><Link to="/settings">Preview mode in Settings</Link> lists them, clearly marked, so they can be reviewed.</p>}
          </div>
        )}
        {tags.length > 0 && (
          <div className="segmented lib__tags" role="group" aria-label="Pathways">
            <button type="button" aria-pressed={tag === null} onClick={() => setTag(null)}>all</button>
            {tags.map((t) => (
              <button key={t} type="button" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>{t}</button>
            ))}
          </div>
        )}
        <div className="lib">
          {byCorpus.map(([corpusId, list]) => (
            <section key={corpusId} className="lib__group lib__group--1">
              <h2 className="lib__head">
                <span className="lib__title">{corpora.get(corpusId)?.title ?? corpusId}</span>
                <span className="lib__meta">{list.length} {list.length === 1 ? 'text' : 'texts'}</span>
              </h2>
              <ul className="list entrylist">
                {list.map((t) => renderRow(t))}
              </ul>
            </section>
          ))}
          {byWork.map(([workId, list]) => (
            <section key={workId} className="lib__group lib__group--1" data-work={workId}>
              <h2 className="lib__head">
                <span className="lib__title" lang={works.get(workId)?.lang}>{works.get(workId)?.title ?? 'Your copy'}</span>
                <span className="lib__meta">{list.every((t) => t.personalCopy) ? 'Your copy · ' : ''}{list.length} {list.length === 1 ? 'chapter' : 'chapters'}</span>
              </h2>
              <ul className="list entrylist">
                {list.map((t) => renderRow(t, chapterLabel))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
