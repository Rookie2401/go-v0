/**
 * /read/:textId and /scripture/:textId — the shared Reader with the Player (and, for scripture, preparation).
 *
 * Gatekeeping happens here so a deep link cannot bypass the library: private testimony texts never open; a text
 * of another language than the learner's current course does not open (progress is kept per language); an
 * unpublished text opens only in preview mode.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { LanguageCode, ScriptureReadiness, Text, TextViewed } from '../../core';
import { useApp } from '../context';
import { ProgressLine, VocabularyLine, useCoverage, useReadingProgress } from '../coverage';
import { useEmitter } from '../events';
import { BAND_LABEL, isTestimonyText, nameOfLang, plainReasons, textPath } from '../format';
import { Player } from '../player/Player';
import type { PlayerChange } from '../player/Player';
import { usePreview } from '../prefs';
import { useReadingOverlay } from '../reader/readingGate';
import { Reader } from '../reader/Reader';
import { BackLink, Topbar } from '../ui';

type Gate = { state: 'loading' } | { state: 'ok' } | { state: 'missing' } | { state: 'language'; textLang: LanguageCode } | { state: 'unpublished'; reasons: string[] };

export function TextPage({ mode }: { mode: 'corpus' | 'scripture' }) {
  const { textId = '' } = useParams();
  const [info, setInfo] = useState<PlayerChange | undefined>();
  const onChange = useCallback((i: PlayerChange) => setInfo(i), []);
  const back = mode === 'scripture' ? '/scripture' : '/read';
  const backLabel = mode === 'scripture' ? 'Scripture' : 'Library';
  const { store, lang } = useApp();
  const preview = usePreview();
  const [gate, setGate] = useState<Gate>({ state: 'loading' });
  useEffect(() => {
    let live = true;
    setGate({ state: 'loading' });
    void (async () => {
      const text = await store.texts.get(textId);
      const corpus = text ? await store.corpora.get(text.corpusId) : undefined;
      let next: Gate;
      if (!text || isTestimonyText(text, corpus ? new Map([[corpus.id, corpus]]) : undefined)) next = { state: 'missing' };
      else if (text.lang !== lang) next = { state: 'language', textLang: text.lang };
      else if (text.published !== true && !preview) next = { state: 'unpublished', reasons: plainReasons(text.unpublishedReasons ?? []) };
      else next = { state: 'ok' };
      if (live) setGate(next);
    })();
    return () => { live = false; };
  }, [store, textId, lang, preview]);

  const bar = <Topbar title={backLabel} left={<BackLink to={back} label={backLabel} />} />;
  if (gate.state === 'loading') return <div>{bar}<div className="page"><p className="muted" role="status">Loading…</p></div></div>;
  if (gate.state === 'missing') return <div>{bar}<div className="page"><p role="alert">This text is not in your library.</p></div></div>;
  if (gate.state === 'language') {
    return (
      <div>
        {bar}
        <div className="page">
          <p role="alert">This text is in {nameOfLang(gate.textLang)}, not the language you are learning. Switch team in Settings to read it; your progress is kept for each language.</p>
        </div>
      </div>
    );
  }
  if (gate.state === 'unpublished') {
    return (
      <div>
        {bar}
        <div className="page" data-testid="unpublished-gate">
          <p role="alert">This text is not published yet, so it is not available for reading.</p>
          {gate.reasons.length > 0 && <ul className="reasons">{gate.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
          <p className="card__note">Preview mode in Settings shows unreviewed texts, clearly marked.</p>
        </div>
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

/** The panel's band, progress line and vocabulary line: the same hooks and the same line as the reader's own block, so the two never disagree. */
function PrepareProgress({ textId, readiness }: { textId: string; readiness: ScriptureReadiness }) {
  const progress = useReadingProgress(useMemo(() => [textId], [textId])).get(textId);
  const live = useCoverage(textId);
  const coverage = live ?? readiness.coverage;
  return (
    <>
      <p className="card__text"><span className={`label band-${coverage.band}`}>{BAND_LABEL[coverage.band]}</span></p>
      {progress && <div className="coverage__read"><ProgressLine progress={progress} explain="disclosure" testId="prepare-progress" /></div>}
      <VocabularyLine coverage={coverage} withExplanation={false} />
    </>
  );
}

const GAP_LABEL = { unseen: 'new', exposed: 'met, not shown', 'needed-help': 'needed help' } as const;

/**
 * "Prepare this passage": what GoLearn says you need before this passage, and which texts supply it.
 *
 * Opening it is a PREVIEW, not reading: it emits at most one TextViewed (mode 'preview') per sitting, counts nothing, and
 * pauses sentence-view detection in the Reader for as long as it is open (the passage behind it is not being read).
 */
export function PreparePanel({ textId }: { textId: string }) {
  const { store, golearn, userId } = useApp();
  const emitter = useEmitter();
  const preview = usePreview();
  const [open, setOpen] = useState(false);
  const [readiness, setReadiness] = useState<ScriptureReadiness | null>(null);
  const [prepTexts, setPrepTexts] = useState<Map<string, Text>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setOpen(false); setReadiness(null); setError(null); }, [textId, userId, preview]);
  useReadingOverlay('prepare', open);

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    // Displayed, not read: one preview record per sitting, never an exposure.
    void store.texts.get(textId).then((t) => emitter.emit<TextViewed>(t?.kind === 'scripture' ? 'scripture' : 'corpus', {
      type: 'TextViewed', textId, mode: 'preview', contentVersion: t?.contentVersion, dedupeKey: (session) => `textviewed-preview:${userId}:${session}:${textId}`,
    }), () => undefined).catch(() => undefined);
    if (readiness) return;
    try {
      await golearn.settled(); // the numbers shown are read after every emitted event has been folded in
      const r = await golearn.scriptureReadiness(userId, textId, undefined, { includeUnpublished: preview });
      const rows = await store.texts.getMany(r.preparatoryTexts.map((p) => p.textId));
      const found = rows.filter((t): t is Text => !!t);
      setPrepTexts(new Map(found.map((t) => [t.id, t])));
      // Never offer private testimony texts, nor unpublished ones outside preview.
      const hidden = new Set(found.filter((t) => isTestimonyText(t) || (t.published !== true && !preview)).map((t) => t.id));
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
          <PrepareProgress textId={textId} readiness={readiness} />
          {(readiness.gaps ?? []).length > 0 && (
            <div className="card__section">
              <h3 className="label">Not yet shown</h3>
              <ul className="chips" aria-label="Gaps in this passage">
                {readiness.gaps.slice(0, 16).map((g) => <li key={g.itemId} className="chip" title={GAP_LABEL[g.status]}>{g.surface} <span className="faint">· {GAP_LABEL[g.status]}</span></li>)}
              </ul>
            </div>
          )}
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
            <p className="muted" data-testid="prepare-limitation">{readiness.limitation ?? 'No preparatory text in your library covers these yet.'}</p>
          )}
          {readiness.preparatoryTexts.length > 0 && !readiness.corpusCanPrepare && readiness.limitation && <p className="card__note">{readiness.limitation}</p>}
        </div>
      )}
    </section>
  );
}
