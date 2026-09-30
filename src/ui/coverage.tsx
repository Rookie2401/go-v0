/**
 * Coverage wording. Reading COMPLETION ("Read: 10 of 10 sentences") and vocabulary are deliberately separate
 * statements, and the vocabulary numbers say what they are: shown (you demonstrated it), likely familiar (an
 * estimate from repeated unassisted meetings), met (seen, not shown), new. One explanation line says what the
 * numbers are based on.
 */
import { useEffect, useState } from 'react';
import type { PersonalizedCoverage, ReadingProgress } from '../core';
import { useApp } from './context';
import { pct } from './format';

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
      {withExplanation && coverage.explanation && <p className="card__note" data-testid="coverage-explanation">{coverage.explanation}</p>}
    </div>
  );
}

/** Reading progress + vocabulary coverage for one text; refreshes when `refreshKey` changes (after a report). */
export function TextProgress({ textId, refreshKey }: { textId: string; refreshKey?: unknown }) {
  const { golearn, userId } = useApp();
  const [progress, setProgress] = useState<ReadingProgress | null>(null);
  const [coverage, setCoverage] = useState<PersonalizedCoverage | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([
      golearn.readingProgress(userId, textId).catch(() => null),
      golearn.coverage(userId, textId).catch(() => null),
    ]).then(([p, c]) => { if (live) { setProgress(p); setCoverage(c); } });
    return () => { live = false; };
  }, [golearn, userId, textId, refreshKey]);
  if (!progress && !coverage) return null;
  return (
    <section className="coverage" aria-label="Your progress with this text">
      {progress && <ReadingLine progress={progress} />}
      {coverage && <VocabularyLine coverage={coverage} />}
    </section>
  );
}
