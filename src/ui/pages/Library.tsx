/** Read (comprehensible input) and Scripture lists: texts by corpus, tags as pathways, personalised band badge. */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Corpus, PersonalizedCoverage, Text } from '../../core';
import { useApp } from '../context';
import { BAND_LABEL, isTestimonyText, pct, textPath } from '../format';

export function Library({ mode }: { mode: 'corpus' | 'scripture' }) {
  const { store, golearn, userId, lang } = useApp();
  const [texts, setTexts] = useState<Text[] | null>(null);
  const [corpora, setCorpora] = useState<Map<string, Corpus>>(new Map());
  const [coverage, setCoverage] = useState<Map<string, PersonalizedCoverage>>(new Map());
  const [tag, setTag] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [rows, cs] = await Promise.all([store.texts.where('lang', lang), store.corpora.all()]);
      const corpusMap = new Map(cs.map((c) => [c.id, c]));
      const wanted = rows
        .filter((t) => !isTestimonyText(t, corpusMap)) // private testimony texts never appear here
        .filter((t) => (mode === 'scripture' ? t.kind === 'scripture' : t.kind !== 'scripture'))
        .sort((a, b) => a.title.localeCompare(b.title));
      if (!live) return;
      setTexts(wanted);
      setCorpora(corpusMap);
      const covs = await Promise.all(wanted.map((t) => golearn.coverage(userId, t.id).catch(() => undefined)));
      if (!live) return;
      const m = new Map<string, PersonalizedCoverage>();
      covs.forEach((c, i) => { if (c) m.set(wanted[i].id, c); });
      setCoverage(m);
    })();
    return () => { live = false; };
  }, [store, golearn, userId, lang, mode]);

  const tags = useMemo(() => [...new Set((texts ?? []).flatMap((t) => t.tags))].sort(), [texts]);
  const visible = useMemo(() => (texts ?? []).filter((t) => !tag || t.tags.includes(tag)), [texts, tag]);
  const byCorpus = useMemo(() => {
    const m = new Map<string, Text[]>();
    for (const t of visible) { const l = m.get(t.corpusId) ?? []; l.push(t); m.set(t.corpusId, l); }
    return [...m.entries()];
  }, [visible]);

  if (texts === null) return <p className="muted" role="status">Loading…</p>;

  return (
    <div className="page">
      <h1>{mode === 'scripture' ? 'Scripture' : 'Read'}</h1>
      {texts.length === 0 && <p className="muted">Nothing in your library for this language yet.</p>}
      {tags.length > 0 && (
        <div className="chips" role="group" aria-label="Pathways">
          <button type="button" className="chip" aria-pressed={tag === null} onClick={() => setTag(null)}>all</button>
          {tags.map((t) => (
            <button key={t} type="button" className="chip" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>{t}</button>
          ))}
        </div>
      )}
      {byCorpus.map(([corpusId, list]) => (
        <section key={corpusId} className="shelf">
          <h2>{corpora.get(corpusId)?.title ?? corpusId}</h2>
          <ul className="list">
            {list.map((t) => {
              const c = coverage.get(t.id);
              return (
                <li key={t.id}>
                  <Link to={textPath(t)} className="row" lang={t.lang}>
                    <span className="row-title">{t.title}</span>
                    <span className="row-meta">
                      {t.staticLevel && <span className="badge">{t.staticLevel}</span>}
                      {t.generated && <span className="badge badge-warn">generated</span>}
                      {t.version && <span className="badge">{t.version}</span>}
                      {c && <span className={`badge band-${c.band}`} title={`${pct(c.knownLexicalCoverage)} of the words are already familiar`}>{BAND_LABEL[c.band]} · {pct(c.knownLexicalCoverage)}</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
