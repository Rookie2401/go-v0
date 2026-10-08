/**
 * ListenBar: listening, inside the Reader, for every text. GoListen is GoLearn's listening subsystem and runs alongside GoLearn's
 * parsing of every text; it has no doorway of its own. This one bar is how a learner meets it.
 *
 *  - A reviewed recording exists (audio status `ready` and `evidenceEligible`): the three modes the session player had, under their
 *    plain names. Listen only (text hidden), Read + listen (text shown), Listen first (text hidden until it has been heard;
 *    showing it records the transcript help, exactly as the session player's hand-off did), then the Player: speed, replay,
 *    seeking, checkpoints, and the same crediting (observed audible coverage of at least 80 % of a sentence). Nothing synthetic is
 *    ever credited. All of that is the Player and the listening emitter, unchanged; this component only lays them out.
 *  - Only preview or unreviewed audio exists: it plays in the same Player, with its own "not counted" label, as practice.
 *  - No recording exists: the computer-voice practice bar is what the learner sees (ListenPractice, the no-recording branch),
 *    and nothing is asked of GoListen again.
 *  - Listening switched off: the practice bar only, and GoListen is never touched.
 *
 * `?listen=1` in the URL (old `/listen/:textId` links and `listen-to-read-text` recommendations) opens the bar in Listen first. Otherwise a
 * text opens in Read + listen: the text is what the learner came for, so a mode chosen on one text does not hide the next one.
 *
 * It renders a fragment so the Player's own `<section>` stays a direct child of `.reader__main`, where the stylesheet pins it.
 */
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useLocation } from 'react-router-dom';
import type { LanguageCode } from '../../core';
import { Player } from '../player/Player';
import type { PlayerChange } from '../player/Player';
import { MODE_LABELS, isEvidenceStatus, isPlayableStatus, modeOfTranscript, useListenSession } from '../listen/useListenSession';
import type { ListenMode } from '../listen/useListenSession';
import { ListenPractice } from './ListenPractice';
import type { ListenPracticeSentence } from './ListenPractice';
import { useListenEnabled } from './useListen';

export interface ListenBarProps {
  textId: string;
  lang: LanguageCode;
  sentences: readonly ListenPracticeSentence[];
  /** The Player's changes (which sentence is playing, which are concealed), for the Reader to mark. */
  onChange?: (info: PlayerChange) => void;
  /** Test/host override of "was this opened for listening?" (default: `?listen=1`). */
  listenFirst?: boolean;
}

const MODES: ListenMode[] = ['only', 'read-listen', 'listen-first'];

/** Statuses in which GoListen has nothing to play and nothing in progress: the device voice is the whole bar. */
const NOTHING_TO_PLAY = new Set(['unavailable', 'not-generated']);

export function ListenBar({ textId, lang, sentences, onChange, listenFirst }: ListenBarProps): ReactElement {
  const listenOn = useListenEnabled();
  const { search } = useLocation();
  const asked = listenFirst ?? new URLSearchParams(search).get('listen') === '1';
  const session = useListenSession(textId, listenOn);
  const { status, progress, controls, pending, error } = session;

  // The mode is the Player's own transcript mode under its plain name, so this bar and the Player's transcript picker never disagree.
  const [mode, setMode] = useState<ListenMode | undefined>(undefined);
  const eligible = isEvidenceStatus(status);
  // Show the Player for every state in which this text has audio or is getting it; a text with none shows the device voice alone.
  const showPlayer = listenOn && !!status && !NOTHING_TO_PLAY.has(status.state);
  const showModes = listenOn && isPlayableStatus(status);
  const shownMode: ListenMode | undefined = mode ?? (asked && showModes ? 'listen-first' : undefined);

  return (
    <>
      {showModes && (
        <div className="listenbar" data-testid="listen-bar" data-listen-mode={shownMode ?? ''} data-evidence={eligible ? 'yes' : 'no'}>
          <div className="segmented" role="group" aria-label="Listening mode">
            {MODES.map((m) => (
              <button
                key={m} type="button" aria-pressed={shownMode === m} disabled={pending}
                onClick={() => { void session.choose(m, shownMode); }}
              >{MODE_LABELS[m]}</button>
            ))}
          </div>
          {pending && <p role="status" className="muted">Saving your listening position…</p>}
          {error && <p role="alert" className="error" data-testid="listen-handoff-error">{error}</p>}
          {progress && (
            <div className="card__note" data-testid="listen-progress">
              <p>Heard: {progress.completedExposureSentences} of {progress.sentencesTotal} sentences. Hearing a passage does not by itself show understanding.</p>
              {progress.masteryEligibleSentences === 0 && <p>This recording has not been reviewed for listening evidence.</p>}
              <details>
                <summary>About listening progress</summary>
                <p>Exposure counts only after at least 80% of a sentence was audibly played. A separate audio-quality and source review determines whether listening evidence is eligible. Neither measure is a comprehension score.</p>
                <p>Quality-eligible sentences: {progress.masteryEligibleSentences}. Sources: {progress.sources.length ? progress.sources.join(', ') : 'none recorded'}.</p>
              </details>
            </div>
          )}
        </div>
      )}
      {showPlayer && (
        <Player
          key={`player:${textId}`} textId={textId} allowSynthesis={false}
          controlRef={controls}
          defaultTranscriptMode={asked ? 'reveal-after' : 'visible'}
          onChange={(info) => { setMode(modeOfTranscript(info.state.transcriptMode)); onChange?.(info); }}
        />
      )}
      {/* the device voice stays available while the audio status is still being asked (a library text's status can take a while and
          must never leave the learner with no listening at all); it steps aside only once a reviewed recording is known to exist */}
      <ListenPractice lang={lang} sentences={sentences} hidden={eligible} />
    </>
  );
}
