/**
 * The listening session of one text, as the Reader's ListenBar uses it. This is what the standalone session page (`/listen/:textId`,
 * now removed) did, moved into a hook: the page's logic, not a second copy of it.
 *
 *  - the honest state of the text's audio (`golearn.listening.audioStatus`), asked once per text;
 *  - the listening mode: Listen only / Read + listen / Listen first, which are the Player's transcript modes under their plain
 *    names (hidden / visible / reveal-after). The mode is READ FROM the Player, so the bar and the Player's own transcript picker
 *    never disagree;
 *  - the text's listening progress (`listeningProgress`: the same crediting as always), refreshed only when a pass of this text
 *    completes, never on a position tick;
 *  - the switch to Read + listen, which is the old "open text and word support" hand-off: the position is saved, then the
 *    transcript reveal is recorded (`revealForHandoff`: TranscriptRevealed, the sentence-level help), and only then does the text show.
 *
 * Nothing here credits anything. Crediting stays in the Player's machine, the listening emitter and GoLearn's `evidence@8`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { AudioStatus } from '../../core';
import type { TranscriptMode } from '../../golisten';
import { listeningProgress } from '../../golisten/progress';
import type { ListeningProgress } from '../../golisten/progress';
import { useApp, useListening } from '../context';
import { usePreview } from '../prefs';
import type { PlayerControls } from '../player/Player';

export type ListenMode = 'only' | 'read-listen' | 'listen-first';

export const MODE_LABELS: Record<ListenMode, string> = { only: 'Listen only', 'read-listen': 'Read + listen', 'listen-first': 'Listen first' };

export const modeOfTranscript = (t: TranscriptMode): ListenMode => (t === 'visible' ? 'read-listen' : t === 'hidden' ? 'only' : 'listen-first');
export const transcriptOfMode = (m: ListenMode): TranscriptMode => (m === 'read-listen' ? 'visible' : m === 'listen-first' ? 'reveal-after' : 'hidden');

/** A recording the learner can play (reviewed, or only previewable). Anything else (nothing, generating, failed, stale) is not a session. */
export const isPlayableStatus = (s: AudioStatus | null | undefined): s is AudioStatus => !!s && (s.state === 'ready' || s.state === 'preview-only');

/** Reviewed human speech: the only audio that is listening evidence. */
export const isEvidenceStatus = (s: AudioStatus | null | undefined): boolean => !!s && s.state === 'ready' && s.evidenceEligible === true;

export interface ListenSession {
  /** undefined while GoListen is being asked; null when it could not answer. */
  status: AudioStatus | null | undefined;
  progress: ListeningProgress | null;
  /** The Player's imperative handle: the bar fills it through `<Player controlRef>`. */
  controls: MutableRefObject<PlayerControls | null>;
  /** Switch to a mode. Read + listen from a hidden transcript saves the position and records the reveal first; it can fail, and says so. */
  choose(next: ListenMode, current: ListenMode | undefined): Promise<void>;
  pending: boolean;
  error: string | null;
}

export function useListenSession(textId: string, enabled: boolean): ListenSession {
  const { store, bus, userId } = useApp();
  const listening = useListening();
  const preview = usePreview();
  const [status, setStatus] = useState<AudioStatus | null | undefined>(enabled ? undefined : null);
  const [progress, setProgress] = useState<ListeningProgress | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controls = useRef<PlayerControls | null>(null);

  // One question per text (and per preview setting): is there a recording, and what is it worth?
  useEffect(() => {
    if (!enabled) { setStatus(null); return; }
    let live = true;
    setStatus(undefined);
    void Promise.resolve()
      .then(() => listening.audioStatus(textId, { preview }))
      .then((st) => { if (live) setStatus(st ?? null); }, () => { if (live) setStatus(null); });
    return () => { live = false; };
  }, [enabled, listening, textId, preview]);

  const playable = isPlayableStatus(status);
  useEffect(() => {
    if (!enabled || !playable) { setProgress(null); return; }
    let live = true;
    void listeningProgress(store, userId, textId).then((p) => { if (live) setProgress(p); }, () => undefined);
    return () => { live = false; };
  }, [enabled, playable, store, userId, textId]);

  // Refresh only when this text's completed exposure is recorded. Position ticks are navigation checkpoints and must never
  // trigger an event-log scan or be presented as heard progress.
  useEffect(() => {
    if (!enabled || !playable) return undefined;
    return bus.subscribe((event) => {
      if (event.type !== 'AudioSegmentCompleted' || event.userId !== userId || event.textId !== textId) return;
      void listeningProgress(store, userId, textId).then(setProgress).catch(() => undefined);
    });
  }, [enabled, playable, bus, store, userId, textId]);

  const choose = useCallback(async (next: ListenMode, current: ListenMode | undefined) => {
    const c = controls.current;
    if (!c || next === current) return;
    setError(null);
    if (next !== 'read-listen') { c.setTranscriptMode(transcriptOfMode(next)); return; }
    setPending(true);
    try {
      // Where the learner paused is persisted before the text shows, and the reveal is recorded as the transcript help it is.
      await c.savePosition();
      await c.revealForHandoff();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your listening position. Try again.');
    } finally {
      setPending(false);
    }
  }, []);

  return { status, progress, controls, choose, pending, error };
}
