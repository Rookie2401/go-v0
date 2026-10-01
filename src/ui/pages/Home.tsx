/**
 * Home — a centred doorway in Biblia's format: tracked title, italic subtitle, a short rule, a
 * "Continue" card when there is something to pick up (the last text read, or the testimony), the
 * entries (Read · Scripture · My Testimony), then GoLearn's recommendations with personalised
 * coverage as further entries, and quiet links at the bottom.
 *
 * Progress (the Continue card AND every recommendation row) is read through `useReadingProgress` and drawn by the shared
 * `ProgressLine`: the same record, wording and numbers as the library and the reader. Nothing here fetches or formats progress.
 *
 * Recommendations follow the learner's actual state (first text; next input / reread / listen after a
 * completion); input always comes before testimony rehearsal, and the page never says "Open a story to begin"
 * to someone who has already finished a text.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Recommendation, Text, TextViewed } from '../../core';
import { useApp } from '../context';
import { ProgressLine, useCoverageMany, useReadingProgress } from '../coverage';
import { BAND_LABEL, INPUT_REASONS, REASON_LABEL, awaitedStatement, isTestimonyText, isVisibleText, languageName, pct, plainReason, plainReasons, teamLabel, textPath } from '../format';
import { useLangTexts } from '../library';
import { usePreview } from '../prefs';
import { I } from '../ui';


interface Item { rec: Recommendation; text?: Text }
type Resume = { kind: 'text'; text: Text; corpus?: string; label: string } | { kind: 'testimony'; number: number };
interface LastRead { text: Text; corpus?: string }

const ENTRIES: Array<{ to: string; name: string; sub: string }> = [
  { to: '/read', name: 'Read', sub: 'Stories and dialogues' },
  { to: '/scripture', name: 'Scripture', sub: 'The Bible, prepared for you' },
  { to: '/testimony', name: 'My Testimony', sub: 'Write it in your own words' },
];

/** Input first, the testimony rehearsal last, whatever order the engine returned (defence in depth). */
const isRehearsal = (r: Recommendation) => r.reason === 'rehearse-testimony';

export function Home() {
  const { store, bus, golearn, userId, lang, user, course } = useApp();
  const preview = usePreview();
  const { texts: allTexts } = useLangTexts();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRead, setLastRead] = useState<LastRead | null>(null);
  const [latestVersion, setLatestVersion] = useState<number | null>(null);
  const [corpusTitles, setCorpusTitles] = useState<Map<string, string>>(new Map());
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    let live = true;
    setItems(null); setError(null);
    void (async () => {
      await golearn.settled(); // recommendations are computed from settled state
      const recs = await golearn.recommend(userId, { limit: 5, includeUnpublished: preview, lang });
      const [rows, corpora] = await Promise.all([store.texts.getMany(recs.map((r) => r.textId ?? '')), store.corpora.all()]);
      const corpusMap = new Map(corpora.map((c) => [c.id, c]));
      // A recommendation that points at a private testimony text never shows that text: the rehearsal
      // suggestion keeps its generic card linking to /testimony; any other reason is dropped. Unpublished texts
      // are dropped outside preview even if the engine offered them.
      const kept: Item[] = [];
      for (let i = 0; i < recs.length; i++) {
        const text = rows[i];
        if (text && isTestimonyText(text, corpusMap)) {
          if (recs[i].reason === 'rehearse-testimony') kept.push({ rec: recs[i] });
          continue;
        }
        if (text && !isVisibleText(text, preview)) continue;
        kept.push({ rec: recs[i], text });
      }
      const ordered = [...kept.filter((k) => !isRehearsal(k.rec)), ...kept.filter((k) => isRehearsal(k.rec))];
      if (live) setItems(ordered);
    })().catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [store, golearn, userId, lang, preview]);

  // Has this learner finished a text in this language? (Decides the empty-state wording.)
  useEffect(() => {
    let live = true;
    setCompleted(false);
    void bus.history({ userId, types: ['TextCompleted'] }).then((ev) => { if (live) setCompleted(ev.some((e) => e.lang === lang)); }).catch(() => undefined);
    return () => { live = false; };
  }, [bus, userId, lang]);

  // What the learner last read, and the latest saved testimony version (the Continue card chooses between them below).
  useEffect(() => {
    let live = true;
    setLastRead(null); setLatestVersion(null);
    void (async () => {
      const [views, corpora, revisions] = await Promise.all([
        bus.history({ userId, types: ['TextViewed'] }),
        store.corpora.all(),
        store.revisions.where('userId', userId),
      ]);
      const corpusMap = new Map(corpora.map((c) => [c.id, c]));
      setCorpusTitles(new Map(corpora.map((c) => [c.id, c.title])));
      let best: LastRead | null = null;
      for (let i = views.length - 1; i >= 0; i--) {
        const view = views[i] as TextViewed;
        const text = await store.texts.get(view.textId);
        if (!text || text.lang !== lang || isTestimonyText(text, corpusMap) || !isVisibleText(text, preview)) continue;
        best = { text, corpus: corpusMap.get(text.corpusId)?.title };
        break;
      }
      const latest = revisions.filter((r) => r.lang === lang).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (live) { setLastRead(best); setLatestVersion(latest ? latest.number : null); }
    })().catch(() => { /* a missing history only means no Continue card */ });
    return () => { live = false; };
  }, [store, bus, userId, lang, preview]);

  // Input stays prominent: the first recommended text to read or listen to, else the last text read, and the
  // testimony only when there is no input at all. (The testimony keeps its entry and its rehearsal suggestion.)
  const resume = useMemo<Resume | null>(() => {
    if (items === null) return null;
    const pick = items.find((i) => i.text && i.rec.textId && INPUT_REASONS.has(i.rec.reason));
    if (pick?.text) {
      const isLast = lastRead?.text.id === pick.text.id;
      return {
        kind: 'text', text: pick.text, corpus: corpusTitles.get(pick.text.corpusId),
        label: isLast ? 'Continue reading' : pick.rec.reason === 'first-text' ? 'Start reading' : 'Read next',
      };
    }
    if (lastRead) return { kind: 'text', text: lastRead.text, corpus: lastRead.corpus, label: 'Continue reading' };
    if (latestVersion !== null) return { kind: 'testimony', number: latestVersion };
    return null;
  }, [items, lastRead, latestVersion, corpusTitles]);

  // Where the learner is in the Continue card's text and in every recommended text: the canonical records and the coverage,
  // read once the folds have settled and re-read after the learner's events (one hook for the whole page).
  const resumeTextId = resume?.kind === 'text' ? resume.text.id : null;
  const itemTextIds = useMemo(() => (items ?? []).flatMap((i) => (i.text ? [i.text.id] : [])), [items]);
  const progressIds = useMemo(() => (resumeTextId ? [...itemTextIds, resumeTextId] : itemTextIds), [itemTextIds, resumeTextId]);
  const progress = useReadingProgress(progressIds);
  const coverage = useCoverageMany(itemTextIds);
  const resumeProgress = resumeTextId ? progress.get(resumeTextId) : undefined;

  const heldBack = (allTexts ?? []).some((t) => t.published !== true);
  const emptyNote = useMemo(() => {
    if (items === null || items.length > 0) return null;
    const corpusTexts = (allTexts ?? []).filter((t) => t.kind !== 'scripture');
    const visibleCorpus = corpusTexts.filter((t) => isVisibleText(t, preview));
    if (allTexts !== null && visibleCorpus.length === 0) {
      const a = awaitedStatement(corpusTexts, 'corpus', languageName(course));
      return { text: plainReason(a.headline), reasons: plainReasons(a.reasons) };
    }
    if (completed) return { text: `You have finished everything currently available in ${languageName(course)}. New texts appear here as soon as they are published.`, reasons: [] };
    return { text: 'Nothing to suggest yet. Open a story to begin.', reasons: [] };
  }, [items, allTexts, preview, completed, course]);

  return (
    <div className="page home route-fade">
      <h1 className="home__title">Go</h1>
      <p className="home__subtitle">Welcome, {user.displayName}</p>
      <p className="home__course label">{teamLabel(course)}</p>
      <div className="home__rule" />

      {resume && (
        <Link className="home__continue" to={resume.kind === 'text' ? textPath(resume.text) : '/testimony'}>
          <span className="home__continue-label">{resume.kind === 'text' ? resume.label : 'Continue your testimony'}</span>
          <div className="home__continue-ref" lang={resume.kind === 'text' ? resume.text.lang : undefined}>{resume.kind === 'text' ? resume.text.title : `Version ${resume.number}`}</div>
          <div className="home__continue-sub">{resume.kind === 'text' ? resume.corpus ?? (resume.text.kind === 'scripture' ? 'Scripture' : 'Read') : 'Rehearse it, or write the next version'}</div>
          {resume.kind === 'text' && resumeProgress && <div className="home__continue-sub"><ProgressLine progress={resumeProgress} testId="continue-progress" /></div>}
        </Link>
      )}

      <nav className="home__list" aria-label="Start here">
        {ENTRIES.map((e) => (
          <Link key={e.to} to={e.to} className="home__entry">
            <span className="home__entry-body">
              <span className="home__entry-name">{e.name}</span>
              <span className="home__entry-sub">{e.sub}</span>
            </span>
            <span className="home__entry-go" aria-hidden="true">{I.chevronRight}</span>
          </Link>
        ))}
      </nav>

      <h2 className="home__list-divider">For you today</h2>
      {error && <p role="alert" className="error">Could not load recommendations: {error}</p>}
      {items === null && !error && <p className="muted" role="status">Looking at where you are…</p>}
      {emptyNote && (
        <div className="home__empty" data-testid="home-empty">
          <p className="muted">{emptyNote.text}</p>
          {emptyNote.reasons.length > 0 && <ul className="reasons">{emptyNote.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
          {heldBack && !preview && <p className="card__note">Development samples exist but are not reviewed yet. <Link to="/settings">Preview mode in Settings</Link> shows them, clearly marked.</p>}
        </div>
      )}
      <ul className="list home__list">
        {items?.map(({ rec, text }, i) => {
          const itemProgress = text ? progress.get(text.id) : undefined;
          const itemCoverage = text ? coverage.get(text.id) : undefined;
          const key = `${rec.reason}-${rec.textId ?? rec.testimonyId ?? i}`;
          const rehearse = rec.reason === 'rehearse-testimony';
          // No text to open and not the testimony: this is a note (nothing published yet, everything read), not a
          // recommendation — only its explanation, as plain text.
          if (!rehearse && !rec.textId) {
            return (
              <li key={key} data-reason={rec.reason}>
                <p className="home__note muted" data-testid="home-note">{plainReason(rec.explanation)}</p>
              </li>
            );
          }
          const to = rehearse ? '/testimony' : text ? textPath(text) : undefined;
          const label = REASON_LABEL[rec.reason] ?? rec.reason;
          const body = (
            <>
              <span className="home__entry-body">
                {/* One title: the text's own title with the reason under it, or (no text) the reason as the title. */}
                <span className="home__entry-name" lang={text?.lang}>{text?.title ?? label}</span>
                {text && (
                  <span className="home__entry-sub">
                    {label}
                    {itemProgress && <> · <ProgressLine progress={itemProgress} testId="item-progress" /></>}
                    {itemCoverage && <> · <span className={`band-${itemCoverage.band}`}>{BAND_LABEL[itemCoverage.band]} · shown {pct(itemCoverage.knownLexicalCoverage)}</span></>}
                  </span>
                )}
                <span className="entry__preview">{plainReason(rec.explanation)}</span>
              </span>
              {text?.generated && <span className="chip chip--wine">generated</span>}
              {text && text.published !== true && <span className="chip chip--wine">unpublished</span>}
            </>
          );
          return (
            <li key={key} data-reason={rec.reason}>
              {to ? <Link to={to} className="home__entry">{body}</Link> : <div className="home__entry">{body}</div>}
            </li>
          );
        })}
      </ul>

      <p className="home__links">
        <Link to="/settings">Settings</Link>
        <Link to="/vocabulary">Vocabulary</Link>
      </p>
    </div>
  );
}
