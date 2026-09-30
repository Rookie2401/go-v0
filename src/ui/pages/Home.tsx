/** Home: recommendations from GoLearn + personalised coverage of the recommended texts. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PersonalizedCoverage, Recommendation, Text } from '../../core';
import { useApp } from '../context';
import { BAND_LABEL, REASON_LABEL, isTestimonyText, pct, textPath } from '../format';

interface Item { rec: Recommendation; text?: Text; coverage?: PersonalizedCoverage }

export function Home() {
  const { store, golearn, userId, user, course } = useApp();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="page">
      <h1>Welcome, {user.displayName}</h1>
      <p className="muted">{course.title}</p>

      <nav className="tiles" aria-label="Start here">
        <Link to="/read" className="tile"><strong>Read</strong><span className="muted small">Stories and dialogues</span></Link>
        <Link to="/scripture" className="tile"><strong>Scripture</strong><span className="muted small">The Bible, prepared for you</span></Link>
        <Link to="/testimony" className="tile"><strong>My Testimony</strong><span className="muted small">Write it in your own words</span></Link>
      </nav>

      <h2>For you today</h2>
      {error && <p role="alert">Could not load recommendations: {error}</p>}
      {items === null && !error && <p className="muted" role="status">Looking at what you have read…</p>}
      {items && items.length === 0 && <p className="muted">Nothing to suggest yet. Open a story to begin.</p>}
      <ul className="list">
        {items?.map(({ rec, text, coverage }, i) => {
          const to = rec.reason === 'rehearse-testimony' ? '/testimony' : text ? textPath(text) : undefined;
          const body = (
            <>
              <span className="row-title">{text?.title ?? REASON_LABEL[rec.reason] ?? rec.reason}</span>
              <span className="row-meta">
                <span className="badge">{REASON_LABEL[rec.reason] ?? rec.reason}</span>
                {coverage && <span className={`badge band-${coverage.band}`}>{BAND_LABEL[coverage.band]} · {pct(coverage.knownLexicalCoverage)} familiar</span>}
                {text?.generated && <span className="badge badge-warn">generated</span>}
              </span>
              <span className="muted small">{rec.explanation}</span>
            </>
          );
          return <li key={`${rec.reason}-${rec.textId ?? rec.testimonyId ?? i}`}>{to ? <Link to={to} className="row col">{body}</Link> : <div className="row col">{body}</div>}</li>;
        })}
      </ul>
    </div>
  );
}
