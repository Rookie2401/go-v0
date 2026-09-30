/**
 * Read (comprehensible input) and Scripture lists, in Biblia's entry-list format: texts grouped by
 * corpus under tracked headings, pathway tags as segmented pills, the personalised band and coverage
 * as an italic preview line, "generated" as a chip.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Corpus, PersonalizedCoverage, Text } from '../../core';
import { useApp } from '../context';
import { BAND_LABEL, isTestimonyText, pct, textPath } from '../format';
import { BackLink, Topbar } from '../ui';

export function Library({ mode }: { mode: 'corpus' | 'scripture' }) {
  const { store, golearn, userId, lang } = useApp();
  const [texts, setTexts] = useState<Text[] | null>(null);
  const [corpora, setCorpora] = useState<Map<string, Corpus>>(new Map());
  const [coverage, setCoverage] = useState<Map<string, PersonalizedCoverage>>(new Map());
  const [tag, setTag] = useState<string | null>(null);
  const title = mode === 'scripture' ? 'Scripture' : 'Read';

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

  const bar = <Topbar title={title} left={<BackLink to="/" label="Home" />} />;
  if (texts === null) return <div>{bar}<div className="page"><p className="muted" role="status">Loading…</p></div></div>;

  return (
    <div>
      {bar}
      <div className="page page--narrow route-fade">
        {texts.length === 0 && <p className="muted">Nothing in your library for this language yet.</p>}
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
                  return (
                    <li key={t.id}>
                      <Link to={textPath(t)} className="entry entry--text">
                        <span className="entry__title" lang={t.lang}>{t.title}</span>
                        <span className="entry__tags">
                          {t.staticLevel && <span className="lib__meta">{t.staticLevel}</span>}
                          {t.version && <span className="chip">{t.version}</span>}
                          {t.generated && <span className="chip chip--wine">generated</span>}
                        </span>
                        {c && (
                          <span className={`entry__preview band-${c.band}`} title={`${pct(c.knownLexicalCoverage)} of the words are already familiar`}>
                            {BAND_LABEL[c.band]} · {pct(c.knownLexicalCoverage)}
                          </span>
                        )}
                      </Link>
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
