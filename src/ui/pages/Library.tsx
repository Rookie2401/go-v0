/**
 * Read (comprehensible input) and Scripture lists, in Biblia's entry-list format: texts grouped by
 * corpus under tracked headings, pathway tags as segmented pills, the personalised band and coverage
 * as an italic preview line, badges as chips.
 *
 * Publication gate: only published texts are listed. In preview mode unpublished texts are listed too, each with
 * its reasons. When nothing is visible the page says exactly what is awaited instead of showing an empty list.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PersonalizedCoverage, ReadingProgress, Text } from '../../core';
import { useApp } from '../context';
import { BAND_LABEL, awaitedStatement, plainReasons, isVisibleText, languageName, pct, textPath } from '../format';
import { TextBadges, UnpublishedReasons, useLangTexts } from '../library';
import { usePreview } from '../prefs';
import { BackLink, Topbar } from '../ui';

export function Library({ mode }: { mode: 'corpus' | 'scripture' }) {
  const { golearn, userId, lang, course } = useApp();
  const preview = usePreview();
  const { texts: allTexts, corpora } = useLangTexts();
  const [coverage, setCoverage] = useState<Map<string, PersonalizedCoverage>>(new Map());
  const [progress, setProgress] = useState<Map<string, ReadingProgress>>(new Map());
  const [tag, setTag] = useState<string | null>(null);
  const title = mode === 'scripture' ? 'Scripture' : 'Read';

  const ofKind = useMemo(
    () => (allTexts ?? []).filter((t) => (mode === 'scripture' ? t.kind === 'scripture' : t.kind !== 'scripture')).sort((a, b) => a.title.localeCompare(b.title)),
    [allTexts, mode],
  );
  const texts = useMemo(() => ofKind.filter((t) => isVisibleText(t, preview)), [ofKind, preview]);

  useEffect(() => {
    let live = true;
    setCoverage(new Map()); setProgress(new Map());
    void (async () => {
      const [covs, progs] = await Promise.all([
        Promise.all(texts.map((t) => golearn.coverage(userId, t.id).catch(() => undefined))),
        Promise.all(texts.map((t) => golearn.readingProgress(userId, t.id).catch(() => undefined))),
      ]);
      if (!live) return;
      const cm = new Map<string, PersonalizedCoverage>();
      covs.forEach((c, i) => { if (c) cm.set(texts[i].id, c); });
      const pm = new Map<string, ReadingProgress>();
      progs.forEach((p, i) => { if (p) pm.set(texts[i].id, p); });
      setCoverage(cm); setProgress(pm);
    })();
    return () => { live = false; };
  }, [golearn, userId, lang, texts]);

  const tags = useMemo(() => [...new Set(texts.flatMap((t) => t.tags ?? []))].sort(), [texts]);
  const visible = useMemo(() => texts.filter((t) => !tag || (t.tags ?? []).includes(tag)), [texts, tag]);
  const byCorpus = useMemo(() => {
    const m = new Map<string, Text[]>();
    for (const t of visible) { const l = m.get(t.corpusId) ?? []; l.push(t); m.set(t.corpusId, l); }
    return [...m.entries()];
  }, [visible]);

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
                {list.map((t) => {
                  const c = coverage.get(t.id);
                  const p = progress.get(t.id);
                  return (
                    <li key={t.id}>
                      <Link to={textPath(t)} className="entry entry--text">
                        <span className="entry__title" lang={t.lang}>{t.title}</span>
                        <span className="entry__tags">
                          {t.staticLevel && <span className="lib__meta">{t.staticLevel}</span>}
                          {t.version && <span className="chip">{t.version}</span>}
                          <TextBadges text={t} />
                        </span>
                        {(c || p) && (
                          <span className={`entry__preview${c ? ` band-${c.band}` : ''}`} title={c?.explanation}>
                            {p && <>Read {p.sentencesViewed} of {p.sentencesTotal}</>}
                            {p && c && ' · '}
                            {c && <>{BAND_LABEL[c.band]} · shown {pct(c.knownLexicalCoverage)}{(c.estimatedFamiliarCoverage ?? 0) > 0 ? ` · likely familiar ${pct(c.estimatedFamiliarCoverage)} (estimate)` : ''}</>}
                          </span>
                        )}
                      </Link>
                      <UnpublishedReasons text={t} />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
