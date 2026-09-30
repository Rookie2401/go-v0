/**
 * Home — a centred doorway in Biblia's format: tracked title, italic subtitle, a short rule, a
 * "Continue" card when there is something to pick up (the last text read, or the testimony), the
 * entries (Read · Scripture · My Testimony), then GoLearn's recommendations with personalised
 * coverage as further entries, and quiet links at the bottom.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PersonalizedCoverage, Recommendation, Text, TextViewed } from '../../core';
import { useApp } from '../context';
import { BAND_LABEL, REASON_LABEL, isTestimonyText, pct, teamLabel, textPath } from '../format';
import { I } from '../ui';


interface Item { rec: Recommendation; text?: Text; coverage?: PersonalizedCoverage }
type Resume = { kind: 'text'; text: Text; corpus?: string; at: string } | { kind: 'testimony'; number: number; at: string };

const ENTRIES: Array<{ to: string; name: string; sub: string }> = [
  { to: '/read', name: 'Read', sub: 'Stories and dialogues' },
  { to: '/scripture', name: 'Scripture', sub: 'The Bible, prepared for you' },
  { to: '/testimony', name: 'My Testimony', sub: 'Write it in your own words' },
];

export function Home() {
  const { store, bus, golearn, userId, lang, user, course } = useApp();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);

  useEffect(() => {
    let live = true;
    setItems(null);
    void (async () => {
      const recs = await golearn.recommend(userId, { limit: 5 });
      const [rows, corpora] = await Promise.all([store.texts.getMany(recs.map((r) => r.textId ?? '')), store.corpora.all()]);
      const corpusMap = new Map(corpora.map((c) => [c.id, c]));
      // A recommendation that points at a private testimony text never shows that text: the rehearsal
      // suggestion keeps its generic card linking to /testimony; any other reason is dropped.
      const kept: Item[] = [];
      for (let i = 0; i < recs.length; i++) {
        const text = rows[i];
        if (text && isTestimonyText(text, corpusMap)) {
          if (recs[i].reason === 'rehearse-testimony') kept.push({ rec: recs[i] });
          continue;
        }
        kept.push({ rec: recs[i], text });
      }
      const covs = await Promise.all(kept.map((k) => (k.text ? golearn.coverage(userId, k.text.id).catch(() => undefined) : undefined)));
      if (live) setItems(kept.map((k, i) => ({ ...k, coverage: covs[i] })));
    })().catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [store, golearn, userId]);

  // What to continue: the most recent of the last text opened and the latest saved testimony version.
  useEffect(() => {
    let live = true;
    setResume(null);
    void (async () => {
      const [views, corpora, revisions] = await Promise.all([
        bus.history({ userId, types: ['TextViewed'] }),
        store.corpora.all(),
        store.revisions.where('userId', userId),
      ]);
      const corpusMap = new Map(corpora.map((c) => [c.id, c]));
      let best: Resume | null = null;
      for (let i = views.length - 1; i >= 0; i--) {
        const view = views[i] as TextViewed;
        const text = await store.texts.get(view.textId);
        if (!text || text.lang !== lang || isTestimonyText(text, corpusMap)) continue;
        best = { kind: 'text', text, corpus: corpusMap.get(text.corpusId)?.title, at: view.at };
        break;
      }
      const latest = revisions.filter((r) => r.lang === lang).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (latest && (!best || latest.createdAt > best.at)) best = { kind: 'testimony', number: latest.number, at: latest.createdAt };
      if (live) setResume(best);
    })().catch(() => { /* a missing history only means no Continue card */ });
    return () => { live = false; };
  }, [store, bus, userId, lang]);

  return (
    <div className="page home route-fade">
      <h1 className="home__title">Go</h1>
      <p className="home__subtitle">Welcome, {user.displayName}</p>
      <p className="home__course label">{teamLabel(course)}</p>
      <div className="home__rule" />

      {resume && (
        <Link className="home__continue" to={resume.kind === 'text' ? textPath(resume.text) : '/testimony'}>
          <span className="home__continue-label">{resume.kind === 'text' ? 'Continue reading' : 'Continue your testimony'}</span>
          <div className="home__continue-ref" lang={resume.kind === 'text' ? resume.text.lang : undefined}>{resume.kind === 'text' ? resume.text.title : `Version ${resume.number}`}</div>
          <div className="home__continue-sub">{resume.kind === 'text' ? resume.corpus ?? (resume.text.kind === 'scripture' ? 'Scripture' : 'Read') : 'Rehearse it, or write the next version'}</div>
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
      {items === null && !error && <p className="muted" role="status">Looking at what you have read…</p>}
      {items && items.length === 0 && <p className="muted">Nothing to suggest yet. Open a story to begin.</p>}
      <ul className="list home__list">
        {items?.map(({ rec, text, coverage }, i) => {
          const to = rec.reason === 'rehearse-testimony' ? '/testimony' : text ? textPath(text) : undefined;
          const body = (
            <>
              <span className="home__entry-body">
                <span className="home__entry-name" lang={text?.lang}>{text?.title ?? REASON_LABEL[rec.reason] ?? rec.reason}</span>
                <span className="home__entry-sub">
                  {REASON_LABEL[rec.reason] ?? rec.reason}
                  {coverage && <> · <span className={`band-${coverage.band}`}>{BAND_LABEL[coverage.band]} · {pct(coverage.knownLexicalCoverage)} familiar</span></>}
                </span>
                <span className="entry__preview">{rec.explanation}</span>
              </span>
              {text?.generated && <span className="chip chip--wine">generated</span>}
            </>
          );
          return (
            <li key={`${rec.reason}-${rec.textId ?? rec.testimonyId ?? i}`}>
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
