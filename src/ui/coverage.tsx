/**
 * Coverage wording. Reading COMPLETION ("Read: 10 of 10 sentences") and vocabulary are deliberately separate
 * statements, and the vocabulary numbers say what they are: shown (you demonstrated it), likely familiar (an
 * estimate from repeated unassisted meetings), met (seen, not shown), new. One explanation line says what the
 * numbers are based on, behind a small disclosure ("What do these numbers mean?") rather than in the page itself.
 */
import { useEffect, useRef, useState } from 'react';
import type { PersonalizedCoverage, ReadingProgress } from '../core';
import { useApp } from './context';
import { pct } from './format';

/** How long after the learner's last event on this page before the numbers are re-read (events arrive in bursts). */
const REFRESH_DEBOUNCE_MS = 300;

const DEGREE_WORD = { all: 'all of it', most: 'most of it', some: 'some of it', little: 'little of it' } as const;

export function ReadingLine({ progress }: { progress: ReadingProgress }) {
  return (
    <p className="coverage__read" data-testid="reading-progress">
      <span>{`Read: ${progress.sentencesViewed} of ${progress.sentencesTotal} sentences`}</span>
      {progress.completedAt && <span> · finished</span>}
      {progress.reportedComprehension && <span> · you said you understood {DEGREE_WORD[progress.reportedComprehension]}</span>}
      {progress.listenedSentences > 0 && <span> · listened to {progress.listenedSentences} {progress.listenedSentences === 1 ? 'sentence' : 'sentences'}</span>}
    </p>
  );
}

export function VocabularyLine({ coverage, withExplanation = true }: { coverage: PersonalizedCoverage; withExplanation?: boolean }) {
  return (
    <div className="coverage__vocab" data-testid="vocabulary-coverage">
      <p>
        <span className="label">Vocabulary</span>{' '}
        <span title="Words you showed you understood without help">shown {pct(coverage.knownLexicalCoverage)}</span>
        {' · '}
        <span title="Met often and without help, but never shown: an estimate, not a fact">likely familiar {pct(coverage.estimatedFamiliarCoverage ?? 0)} (estimate)</span>
        {' · '}
        <span title="Seen at least once, not yet shown or estimated familiar">met {pct(coverage.partialCoverage)}</span>
        {' · '}
        <span title="Not seen before">new {pct(coverage.unseenCoverage)}</span>
      </p>
      {withExplanation && coverage.explanation && (
        <details className="coverage__more">
          <summary>What do these numbers mean?</summary>
          <p className="card__note" data-testid="coverage-explanation">{coverage.explanation}</p>
        </details>
      )}
    </div>
  );
}

/** Reading progress + vocabulary coverage for one text; refreshes when `refreshKey` changes (after a report). */
export function TextProgress({ textId, refreshKey }: { textId: string; refreshKey?: unknown }) {
  const { golearn, userId, bus } = useApp();
  const [tick, setTick] = useState(0);
  const [progress, setProgress] = useState<ReadingProgress | null>(null);
  const [coverage, setCoverage] = useState<PersonalizedCoverage | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([
      golearn.readingProgress(userId, textId).catch(() => null),
      golearn.coverage(userId, textId).catch(() => null),
    ]).then(([p, c]) => { if (live) { setProgress(p); setCoverage(c); } });
    return () => { live = false; };
  }, [golearn, userId, textId, refreshKey, tick]);

  // The learner's own events on this text (sentence views, Understood, the end-of-text report, listening) change these
  // numbers; GoLearn folds them in just after the bus notifies, so re-read a moment after the last one.
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const off = bus.subscribe((e) => {
      if (e.userId !== userId) return;
      const eventText = (e as { textId?: string }).textId;
      if (eventText !== undefined && eventText !== textId) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setTick((n) => n + 1), REFRESH_DEBOUNCE_MS);
    });
    return () => { off(); clearTimeout(timer.current); };
  }, [bus, userId, textId]);
  if (!progress && !coverage) return null;
  return (
    <section className="coverage" aria-label="Your progress with this text">
      {progress && <ReadingLine progress={progress} />}
      {coverage && <VocabularyLine coverage={coverage} />}
    </section>
  );
}
