/**
 * "Next for you" on the Reading page: the first few of `golearn.recommend` — the ladder's next unit while the path lasts, then
 * the whole library ranked for this learner (src/golearn/candidates.ts, rank.ts, recommend.ts). Each with its one-line reason.
 * Listening-only and testimony suggestions belong to their own pages and are left out here. When nothing can be offered the
 * section is not shown: the shelves below are always there.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Recommendation } from '../../core';
import { useApp } from '../context';
import { textPath } from '../format';
import { usePref, usePreview } from '../prefs';
import { hasLadder } from './hasLadder';
import '../course/course.css'; // the best-reads entry styles

const SHOWN = 3;

interface Pick { rec: Recommendation; textId: string; title: string }


export function NextForYou() {
  const { golearn, stage0, userId, lang, user, store, library, bus } = useApp();
  const preview = usePreview();
  const [challenge] = usePref('challenge');
  const navigate = useNavigate();
  const [picks, setPicks] = useState<Pick[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // Stage 0 not finished: its next step comes first. A note: what the engine says when it has no text to offer.
  const [start, setStart] = useState<{ title: string; why?: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Finishing a text changes what comes next.
  useEffect(() => bus.subscribe((e) => { if (e.userId === userId && (e.type === 'TextCompleted' || e.type === 'Stage0StepCompleted' || e.type === 'Stage0ExitFinished')) setTick((n) => n + 1); }), [bus, userId]);

  useEffect(() => {
    let live = true;
    void (async () => {
      await golearn.settled();
      let first: { title: string; why?: string } | null = null;
      if (stage0?.available(lang)) {
        const ov = await stage0.overview(userId, lang).catch(() => undefined);
        const step = ov?.next ? ov.steps.find((s) => s.step.id === ov.next!.id) : undefined;
        if (ov?.next) first = { title: step?.title ?? 'Start from zero', ...(ov.nextReason ? { why: ov.nextReason } : {}) };
      }
      if (live) setStart(first); // shown at once: the engine's answer can take a while
      const recs = await golearn.recommend(userId, { limit: SHOWN + 5, includeUnpublished: preview, lang, interests: user.interests ?? [], challenge });
      // two hard ladder units in a row: Stage 0's recall card (its home), with the engine's reason (R4)
      const recall = recs.find((r) => r.reason === 'stage0-recall');
      if (recall && !first && stage0?.available(lang)) { first = { title: 'Refresh your first words', why: recall.explanation }; if (live) setStart(first); }
      const out: Pick[] = [];
      for (const rec of recs) {
        if (out.length === SHOWN) break;
        if (!rec.textId || rec.reason === 'listen-to-read-text' || out.some((p) => p.textId === rec.textId)) continue;
        const text = await store.texts.get(rec.textId);
        const row = text ? undefined : await store.catalog.get(rec.textId);
        const title = text?.title ?? row?.title;
        if (!title) continue; // nothing to show it by: not offered
        out.push({ rec, textId: rec.textId, title });
      }
      if (live) { setPicks(out); setNote(out.length === 0 && !first ? recs.find((r) => !r.textId && r.reason !== 'rehearse-testimony' && r.reason !== 'stage0-recall')?.explanation ?? null : null); }
    })().catch(() => { if (live) { setPicks([]); setNote(null); } }); // no suggestion is not an error the learner can act on
    return () => { live = false; };
  }, [golearn, stage0, userId, lang, user.interests, preview, challenge, store, tick]);

  const open = (p: Pick) => {
    setError(null);
    void (async () => {
      const resident = await store.texts.get(p.textId);
      navigate(textPath(resident ?? await library.open(p.textId)));
    })().catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not open this reading.'));
  };

  if (!start && (!picks || (picks.length === 0 && !note))) return null;
  return (
    <section aria-label="Next for you" data-testid="next-for-you">
      <h2 className="home__list-divider">Next for you</h2>
      {error && <p role="alert" className="error read__alert">{error}</p>}
      {(start || (picks?.length ?? 0) > 0) && <ul className="home__list best-reads">
        {start && (
          <li data-reason="stage0">
            <Link to="/start" className="home__entry best-reads__entry" data-testid="next-stage0">
              <span className="home__entry-body">
                <span className="home__entry-name">Start from zero: {start.title}</span>
                <span className="entry__preview">{start.why ?? 'The sounds, the letters and your first few hundred words come before the reading below.'}</span>
              </span>
            </Link>
          </li>
        )}
        {(picks ?? []).map((p) => (
          <li key={p.textId} data-text-id={p.textId} data-reason={p.rec.reason}>
            <button type="button" className="home__entry best-reads__entry" onClick={() => open(p)}>
              <span className="home__entry-body">
                <span className="home__entry-name" lang={lang}>{p.title}</span>
                <span className="entry__preview" data-testid="next-reason">{p.rec.explanation}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>}
      {picks === null && <p className="card__note" role="status" data-testid="next-pending">Looking for your next texts…</p>}
      {note && <p className="card__note" data-testid="next-note">{note}</p>}
      <p className="card__note best-reads__note">
        Suggestions from what you have read so far. Nothing is locked; read what you like.
        {hasLadder(lang) && <> · <Link to="/path">Your path</Link></>}
      </p>
    </section>
  );
}
