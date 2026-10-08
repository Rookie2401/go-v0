/**
 * Practice listening in the reader (audit 2026-10-07 section 4.4 item 14). The reader's text can be heard in the device's own
 * computer voice, sentence by sentence or read along, so a learner has the sound of the language before any recording exists.
 *
 *  - It is practice and says so: "Computer voice, practice only: not counted as listening."
 *  - It emits nothing. It reads no listening state and writes no event, encounter or progress; GoLearn never hears of it.
 *  - A reviewed human recording wins: when GoListen reports one for this text (`evidenceEligible`), this control is not shown.
 *    With listening switched off the reader never asks GoListen anything, so the control is simply there.
 *  - A device with no voice for the language gets disabled buttons and one plain note, as Stage 0 does.
 *
 * It is the no-recording branch of the reader's ListenBar (src/ui/reader/ListenBar.tsx), which asks GoListen and passes the answer
 * in as `hidden`. The per-sentence "Hear it" buttons are portalled into each sentence's own action span.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { createPortal } from 'react-dom';
import type { LanguageCode } from '../../core';
import { stage0Config } from '../../stage0/lang';
import { PRACTICE_LABEL, PRACTICE_RATES, speakable, useDevicePractice } from './useListen';

export interface ListenPracticeSentence { id: string; index: number; text: string }
export interface ListenPracticeProps {
  lang: LanguageCode;
  sentences: readonly ListenPracticeSentence[];
  /**
   * The ListenBar's decision: true while GoListen has not yet answered, and when a reviewed recording exists (the recording wins).
   * This component asks GoListen nothing itself; it is the bar's no-recording branch.
   */
  hidden: boolean;
}

export function ListenPractice({ lang, sentences, hidden }: ListenPracticeProps): ReactElement | null {
  const practice = useDevicePractice(lang);
  const barRef = useRef<HTMLDivElement>(null);
  const [hosts, setHosts] = useState<ReadonlyMap<string, HTMLElement>>(new Map());

  const sentenceKey = sentences.map((s) => s.id).join('|');
  const { stop } = practice;
  useEffect(() => { if (hidden) stop(); }, [hidden, stop]);

  // Mark the sentence being said, and keep it in view while reading along (an attribute React does not manage).
  const root = () => barRef.current?.closest('article.reader') ?? null;
  useEffect(() => {
    const el = root();
    if (!el) return;
    const on = practice.current ? [...el.querySelectorAll('[data-sentence-id]')].find((e) => e.getAttribute('data-sentence-id') === practice.current) : undefined;
    el.querySelectorAll('[data-practice="on"]').forEach((e) => e.removeAttribute('data-practice'));
    if (on) {
      on.setAttribute('data-practice', 'on');
      if (practice.along) (on as HTMLElement).scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }
  }, [practice.current, practice.along]);

  // One host span per sentence, inside the sentence's own action span.
  const available = practice.available;
  useLayoutEffect(() => {
    const el = root();
    if (hidden || !available || !el) { setHosts(new Map()); return; }
    const made = new Map<string, HTMLElement>();
    const ids = new Set(sentences.map((s) => s.id));
    el.querySelectorAll('[data-sentence-id]').forEach((s) => {
      const id = s.getAttribute('data-sentence-id')!;
      const actions = s.querySelector('.sent-actions');
      if (!ids.has(id) || !actions) return;
      const host = document.createElement('span');
      host.setAttribute('data-practice-host', id);
      actions.append(host);
      made.set(id, host);
    });
    setHosts(made);
    return () => { made.forEach((h) => h.remove()); };
  }, [hidden, available, sentenceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (hidden) return null;

  const items = sentences.map((s) => ({ id: s.id, text: s.text }));
  const name = stage0Config(lang)?.name ?? lang;
  const nobody = !available;

  return (
    <div ref={barRef} className="listen-practice" data-testid="listen-practice" role="group" aria-label="Practice with the computer voice">
      <button
        type="button" className="btn btn--small btn--quiet" data-testid="practice-along" disabled={nobody} aria-pressed={practice.along}
        onClick={() => { if (practice.along) practice.stop(); else practice.playAlong(items); }}
      >{practice.along ? 'Stop reading along' : 'Read along (practice)'}</button>
      {nobody && (
        <button type="button" className="btn btn--small btn--quiet" data-testid="practice-hear-off" disabled>Hear it (practice)</button>
      )}
      {!nobody && (
        <button type="button" className="btn btn--small btn--quiet" data-testid="practice-slow" aria-pressed={practice.slow} onClick={() => practice.setSlow(!practice.slow)}>
          Slow ({PRACTICE_RATES.slow})
        </button>
      )}
      {nobody
        ? <p className="note muted" data-testid="practice-unavailable">This device has no {name} computer voice, so there is no practice sound here. Reading is not affected.</p>
        : <p className="note muted" data-testid="practice-label">{PRACTICE_LABEL}</p>}
      {[...hosts].map(([id, host]) => {
        const s = sentences.find((x) => x.id === id);
        if (!s || !speakable(s.text)) return null;
        return createPortal(
          <button
            type="button" className="sent__btn sent__hear" data-testid={`practice-hear-${s.index}`}
            aria-label={`Hear it (practice): sentence ${s.index + 1}`} title="Hear it (practice): computer voice, not counted as listening"
            onClick={() => practice.playOne({ id: s.id, text: s.text })}
          >Hear it</button>,
          host,
          id,
        );
      })}
    </div>
  );
}
