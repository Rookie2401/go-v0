/** /read/:textId and /scripture/:textId — the shared Reader with the Player (and, for scripture, preparation). */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ScriptureReadiness, Text } from '../../core';
import { useApp } from '../context';
import { BAND_LABEL, pct, textPath } from '../format';
import { Player } from '../player/Player';
import type { PlayerChange } from '../player/Player';
import { Reader } from '../reader/Reader';

export function TextPage({ mode }: { mode: 'corpus' | 'scripture' }) {
  const { textId = '' } = useParams();
  const [info, setInfo] = useState<PlayerChange | undefined>();
  const onChange = useCallback((i: PlayerChange) => setInfo(i), []);
  const back = mode === 'scripture' ? '/scripture' : '/read';

  return (
    <div className="page page-text">
      <p className="crumbs"><Link to={back}>← {mode === 'scripture' ? 'Scripture' : 'Library'}</Link></p>
      {mode === 'scripture' && <PreparePanel textId={textId} />}
      <Player key={`player:${textId}`} textId={textId} onChange={onChange} />
      <Reader
        key={`reader:${textId}`}
        textId={textId}
        mode={mode}
        activeSentenceId={info?.state.playing ? info.segment?.sentenceIds[0] : undefined}
        concealed={info?.concealed}
      />
    </div>
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
      setPrepTexts(new Map(rows.filter((t): t is Text => !!t).map((t) => [t.id, t])));
      setReadiness(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="prepare" aria-label="Prepare this passage">
      <button type="button" className="btn-quiet" aria-expanded={open} onClick={() => { void toggle(); }}>Prepare this passage</button>
      {open && error && <p role="alert">Could not prepare: {error}</p>}
      {open && !readiness && !error && <p className="muted" role="status">Checking what you already know…</p>}
      {open && readiness && (
        <div className="prepare-body">
          <p>
            <span className={`badge band-${readiness.coverage.band}`}>{BAND_LABEL[readiness.coverage.band]}</span>{' '}
            You already recognise {pct(readiness.coverage.knownLexicalCoverage)} of the words here; {pct(readiness.coverage.unseenCoverage)} are new to you.
          </p>
          {readiness.prerequisites.length > 0 && (
            <>
              <h3>Worth learning first</h3>
              <ul className="chips">
                {readiness.prerequisites.slice(0, 12).map((p) => <li key={p.itemId} className="chip">{p.surface}</li>)}
              </ul>
            </>
          )}
          {readiness.preparatoryTexts.length > 0 ? (
            <>
              <h3>Texts that will prepare you</h3>
              <ul className="list">
                {readiness.preparatoryTexts.map((p) => {
                  const t = prepTexts.get(p.textId);
                  return (
                    <li key={p.textId}>
                      <Link className="row" to={t ? textPath(t) : `/read/${encodeURIComponent(p.textId)}`}>
                        <span className="row-title">{t?.title ?? p.textId}</span>
                        <span className="row-meta">
                          <span className={`badge band-${p.band}`}>{BAND_LABEL[p.band]}</span>
                          {(p.generated || t?.generated) && <span className="badge badge-warn">generated</span>}
                          <span className="muted small">covers {p.covers.length}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="muted">No preparatory text in your library covers these yet.</p>
          )}
        </div>
      )}
    </section>
  );
}
