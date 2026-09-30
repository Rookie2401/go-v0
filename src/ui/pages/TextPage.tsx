/** /read/:textId and /scripture/:textId — the shared Reader with the Player (and, for scripture, preparation). */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ScriptureReadiness, Text } from '../../core';
import { useApp } from '../context';
import { BAND_LABEL, isTestimonyText, pct, textPath } from '../format';
import { Player } from '../player/Player';
import type { PlayerChange } from '../player/Player';
import { Reader } from '../reader/Reader';
import { BackLink, Topbar } from '../ui';

export function TextPage({ mode }: { mode: 'corpus' | 'scripture' }) {
  const { textId = '' } = useParams();
  const [info, setInfo] = useState<PlayerChange | undefined>();
  const onChange = useCallback((i: PlayerChange) => setInfo(i), []);
  const back = mode === 'scripture' ? '/scripture' : '/read';
  const backLabel = mode === 'scripture' ? 'Scripture' : 'Library';
  const { store } = useApp();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    setAllowed(null);
    void (async () => {
      const text = await store.texts.get(textId);
      const corpus = text ? await store.corpora.get(text.corpusId) : undefined;
      if (live) setAllowed(!text || !isTestimonyText(text, corpus ? new Map([[corpus.id, corpus]]) : undefined));
    })();
    return () => { live = false; };
  }, [store, textId]);

  if (allowed === null) return <div><Topbar title={backLabel} left={<BackLink to={back} label={backLabel} />} /><div className="page"><p className="muted" role="status">Loading…</p></div></div>;
  if (allowed === false) {
    return (
      <div>
        <Topbar title={backLabel} left={<BackLink to={back} label={backLabel} />} />
        <div className="page"><p role="alert">This text is not in your library.</p></div>
      </div>
    );
  }

  return (
    <Reader
      key={`reader:${textId}`}
      textId={textId}
      mode={mode}
      activeSentenceId={info?.state.playing ? info.segment?.sentenceIds[0] : undefined}
      concealed={info?.concealed}
      before={mode === 'scripture' ? <PreparePanel textId={textId} /> : undefined}
      bar={<Player key={`player:${textId}`} textId={textId} onChange={onChange} />}
    />
  );
}

/** "Prepare this passage": what GoLearn says you need before this passage, and which texts supply it. */
export function PreparePanel({ textId }: { textId: string }) {
  const { store, golearn, userId } = useApp();
  const [open, setOpen] = useState(false);
  const [readiness, setReadiness] = useState<ScriptureReadiness | null>(null);
  const [prepTexts, setPrepTexts] = useState<Map<string, Text>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setOpen(false); setReadiness(null); setError(null); }, [textId, userId]);

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (readiness) return;
    try {
      const r = await golearn.scriptureReadiness(userId, textId);
      const rows = await store.texts.getMany(r.preparatoryTexts.map((p) => p.textId));
      const found = rows.filter((t): t is Text => !!t);
      setPrepTexts(new Map(found.map((t) => [t.id, t])));
      const hidden = new Set(found.filter((t) => isTestimonyText(t)).map((t) => t.id)); // never offer private testimony texts
      setReadiness({ ...r, preparatoryTexts: r.preparatoryTexts.filter((p) => !hidden.has(p.textId)) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="prepare" aria-label="Prepare this passage">
      <button type="button" className="btn btn--small btn--quiet" aria-expanded={open} onClick={() => { void toggle(); }}>Prepare this passage</button>
      {open && error && <p role="alert" className="error">Could not prepare: {error}</p>}
      {open && !readiness && !error && <p className="muted" role="status">Checking what you already know…</p>}
      {open && readiness && (
        <div className="prepare-body">
          <p className="card__text">
            <span className={`label band-${readiness.coverage.band}`}>{BAND_LABEL[readiness.coverage.band]}</span>{' '}
            You already recognise {pct(readiness.coverage.knownLexicalCoverage)} of the words here; {pct(readiness.coverage.partialCoverage)} you have met but do not yet know; {pct(readiness.coverage.unseenCoverage)} are new to you.
          </p>
          {readiness.prerequisites.length > 0 && (
            <div className="card__section">
              <h3 className="label">Worth learning first</h3>
              <ul className="chips">
                {readiness.prerequisites.slice(0, 12).map((p) => <li key={p.itemId} className="chip">{p.surface}</li>)}
              </ul>
            </div>
          )}
          {readiness.preparatoryTexts.length > 0 ? (
            <div className="card__section">
              <h3 className="label">Texts that will prepare you</h3>
              <ul className="list entrylist">
                {readiness.preparatoryTexts.map((p) => {
                  const t = prepTexts.get(p.textId);
                  return (
                    <li key={p.textId}>
                      <Link className="entry entry--text" to={t ? textPath(t) : `/read/${encodeURIComponent(p.textId)}`}>
                        <span className="entry__title" lang={t?.lang}>{t?.title ?? p.textId}</span>
                        <span className="entry__tags">
                          {(p.generated || t?.generated) && <span className="chip chip--wine">generated</span>}
                          <span className="lib__meta">covers {p.covers.length}</span>
                        </span>
                        <span className={`entry__preview band-${p.band}`}>{BAND_LABEL[p.band]}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="muted">No preparatory text in your library covers these yet.</p>
          )}
        </div>
      )}
    </section>
  );
}
