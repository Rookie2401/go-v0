/**
 * Progress and coverage, in ONE place. Home (the Continue card and every recommendation row), the library rows, the
 * reader's progress block and the preparation panel all read through these hooks and render through these components;
 * no other code fetches or formats progress.
 *
 *  - `useReadingProgress(textIds)`  the canonical `ReadingProgress` records (golearn.readingProgressMany) for a set of
 *    texts, as a Map. Every read is issued AFTER `golearn.settled()` (a read never observes a half-applied fold), and is
 *    repeated, again after `settled()`, whenever a bus event for the active learner (about one of these texts, or about
 *    nothing text-specific) arrives, and whenever the learner or the language changes. There is no timer.
 *  - `useCoverage(textId)` / `useCoverageMany(textIds)`  the vocabulary coverage, same rules.
 *  - `ProgressLine`  the one rendering of a record. Wording is identical on every surface and built only from the record:
 *      "Seen x of y sentences"                              reading EXPOSURE of this version's live sentences; never "Read"
 *      "Understood x of y (your report)"                    when sentencesUnderstood > 0
 *      "Finished"                                           only when `finishedAt` (this content version) is set
 *      "Finished an earlier version — the text has changed since"   when only `finishedEarlierVersion` is set
 *      "you said you understood <degree> of an earlier version"   a whole-text report that exists only about earlier wording
 *      "n more seen in an earlier version"                  exposure against sentences the text no longer has (history)
 *    and, whenever the text is finished (this or an earlier version) with Seen < total, an explanation of why the two
 *    can differ ("Why?"): a real disclosure in the reader, a title on the line inside list rows that are links.
 *  - Vocabulary: shown (you demonstrated it) / likely familiar (an estimate) / met (seen, not shown) / new, with one
 *    explanation behind a small disclosure ("What do these numbers mean?").
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PersonalizedCoverage, ReadingProgress } from '../core';
import { useApp } from './context';
import { pct } from './format';

const DEGREE_WORD = { all: 'all of it', most: 'most of it', some: 'some of it', little: 'little of it' } as const;

// ───────────────────────── wording (pure) ─────────────────────────

/** "Seen 2 of 3 sentences" — exposure. The word "Read" is never used for this count. */
export const seenText = (p: Pick<ReadingProgress, 'sentencesSeen' | 'sentencesTotal'>): string => `Seen ${p.sentencesSeen} of ${p.sentencesTotal} sentences`;
/** "Understood 1 of 3 (your report)" — the learner's own report. */
export const understoodText = (p: Pick<ReadingProgress, 'sentencesUnderstood' | 'sentencesTotal'>): string => `Understood ${p.sentencesUnderstood} of ${p.sentencesTotal} (your report)`;

export const FINISHED_EARLIER_TEXT = 'Finished an earlier version — the text has changed since';
/** Finished with fewer sentences recorded as seen than the text has: say plainly that finishing is his own mark. */
export const FINISHED_BY_MARK_TEXT = 'Finished (your mark)';
/** Why "Finished" and "Seen" can disagree. Shown on every surface whenever a finished text has Seen < total. */
export const FINISHED_EXPLANATION = 'You marked this text finished. “Seen” counts sentences that stayed on screen long enough in this version, so the two can differ.';

/** The parts of the progress line, in order. Built only from the canonical record. */
export function progressParts(p: ReadingProgress): string[] {
  const parts = [seenText(p)];
  if (p.sentencesUnderstood > 0) parts.push(understoodText(p));
  // Finished is the learner's own statement, independent of the Seen count. When the two differ the label says so on
  // every surface, in the text itself (a hover title is not enough on touch screens); the full explanation is one tap
  // away in the reader.
  if (p.finishedAt) parts.push(p.sentencesSeen < p.sentencesTotal ? FINISHED_BY_MARK_TEXT : 'Finished');
  else if (p.finishedEarlierVersion) parts.push(FINISHED_EARLIER_TEXT);
  // A whole-text report is about one version of the wording. This version's own report is shown by the reader beside the line;
  // a report that exists only about EARLIER wording is history, said to be exactly that and never as understanding of the
  // text as it reads now.
  if (!p.reportedComprehension && p.reportedEarlierVersion) parts.push(`you said you understood ${p.reportedEarlierVersion.degree} of an earlier version`);
  const earlier = p.earlierVersions?.sentencesSeen ?? 0;
  if (earlier > 0) parts.push(`${earlier} more seen in an earlier version`);
  return parts;
}

/** "Seen 3 of 4 sentences · Understood 2 of 4 (your report) · Finished" */
export const progressSummary = (p: ReadingProgress): string => progressParts(p).join(' · ');

/** Finished (this or an earlier version) with fewer sentences seen than the text has: the line needs its explanation. */
export const needsFinishedExplanation = (p: ReadingProgress): boolean => !!(p.finishedAt || p.finishedEarlierVersion) && p.sentencesSeen < p.sentencesTotal;

// ───────────────────────── reads ─────────────────────────

const NO_PROGRESS: ReadonlyMap<string, ReadingProgress> = new Map();
const NO_COVERAGE: ReadonlyMap<string, PersonalizedCoverage> = new Map();

/**
 * Shared engine of the hooks: read for `textIds` once the folds have settled, again after every relevant bus event of the
 * active learner (coalesced: events arriving during a read cause exactly one more read), and again when the learner, the
 * language or the set of texts changes. What was read for another learner / language / set is never returned.
 */
function useSettledRead<T>(textIds: readonly string[], read: (ids: string[]) => Promise<T>, empty: T): T {
  const { golearn, bus, userId, lang } = useApp();
  const idsKey = useMemo(() => [...new Set(textIds)].sort().join('\n'), [textIds]);
  const owner = `${userId}|${lang}|${idsKey}`;
  const [state, setState] = useState<{ owner: string; value: T } | null>(null);
  const readRef = useRef(read);
  readRef.current = read;

  useEffect(() => {
    const ids = idsKey ? idsKey.split('\n') : [];
    const wanted = new Set(ids);
    let live = true;
    let running = false;
    let again = false;
    const run = async (): Promise<void> => {
      if (running) { again = true; return; }
      running = true;
      try {
        do {
          again = false;
          await golearn.settled();
          const value = await readRef.current(ids);
          if (live) setState({ owner, value });
        } while (again && live);
      } catch { /* keep what is on screen; the next event or visit reads again */ } finally { running = false; }
    };
    void run();
    const off = bus.subscribe((e) => {
      if (e.userId !== userId) return;
      const eventText = (e as { textId?: string }).textId;
      if (eventText !== undefined && !wanted.has(eventText)) return;
      void run();
    });
    return () => { live = false; off(); };
  }, [golearn, bus, userId, lang, idsKey, owner]);

  return state && state.owner === owner ? state.value : empty;
}

/** The canonical progress records of these texts (empty until the first settled read). */
export function useReadingProgress(textIds: readonly string[]): ReadonlyMap<string, ReadingProgress> {
  const { golearn, userId } = useApp();
  return useSettledRead<ReadonlyMap<string, ReadingProgress>>(textIds, async (ids) => {
    if (ids.length === 0) return new Map<string, ReadingProgress>();
    try {
      return await golearn.readingProgressMany(userId, ids);
    } catch {
      // One unreadable text must not hide the others: ask for each on its own.
      const rows = await Promise.all(ids.map((id) => golearn.readingProgress(userId, id).then((p) => [id, p] as const, () => undefined)));
      return new Map(rows.filter((r): r is readonly [string, ReadingProgress] => !!r));
    }
  }, NO_PROGRESS);
}

/** Vocabulary coverage of these texts, read after the folds settled. */
export function useCoverageMany(textIds: readonly string[]): ReadonlyMap<string, PersonalizedCoverage> {
  const { golearn, userId } = useApp();
  return useSettledRead<ReadonlyMap<string, PersonalizedCoverage>>(textIds, async (ids) => {
    const rows = await Promise.all(ids.map((id) => golearn.coverage(userId, id).then((c) => [id, c] as const, () => undefined)));
    return new Map(rows.filter((r): r is readonly [string, PersonalizedCoverage] => !!r));
  }, NO_COVERAGE);
}

/** Vocabulary coverage of one text (null until the first settled read). */
export function useCoverage(textId: string): PersonalizedCoverage | null {
  const ids = useMemo(() => [textId], [textId]);
  return useCoverageMany(ids).get(textId) ?? null;
}

// ───────────────────────── rendering ─────────────────────────

/**
 * THE progress line. `explain="disclosure"` (the reader, the preparation panel) gives the finished-vs-seen explanation as a
 * real <details>; `"title"` (rows that are links: Home and the library) puts it on the line as a title, since a disclosure
 * cannot live inside a link. The element with `data-testid` holds exactly the progress sentence, nothing else.
 */
export function ProgressLine({ progress, testId = 'reading-progress', explain = 'title' }: { progress: ReadingProgress; testId?: string; explain?: 'title' | 'disclosure' }) {
  const why = needsFinishedExplanation(progress);
  return (
    <span className="progress" title={why && explain === 'title' ? FINISHED_EXPLANATION : undefined}>
      <span className="progress__text" data-testid={testId}>{progressSummary(progress)}</span>
      {why && explain === 'title' && <span className="progress__why" data-testid={`${testId}-why`} title={FINISHED_EXPLANATION}>Why?</span>}
      {why && explain === 'disclosure' && (
        <details className="progress__more">
          <summary>Why?</summary>
          <p className="card__note" data-testid={`${testId}-why`}>{FINISHED_EXPLANATION}</p>
        </details>
      )}
    </span>
  );
}

/** What only the reader adds beside the progress line: the learner's own text-level report and real, reviewed listening. */
function ReaderExtras({ progress }: { progress: ReadingProgress }) {
  const parts: string[] = [];
  if (progress.reportedComprehension) parts.push(`you said you understood ${DEGREE_WORD[progress.reportedComprehension]}`);
  if (progress.listenedSentences > 0) parts.push(`listened to ${progress.listenedSentences} ${progress.listenedSentences === 1 ? 'sentence' : 'sentences'}`);
  if (parts.length === 0) return null;
  return <span data-testid="reading-extras"> · {parts.join(' · ')}</span>;
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

/**
 * The reader's progress block: the progress line for `progress` (the record the Reader itself reads through
 * `useReadingProgress`, so it is fetched once) and the settled vocabulary coverage of the text.
 */
export function TextProgress({ textId, progress }: { textId: string; progress?: ReadingProgress }) {
  const coverage = useCoverage(textId);
  if (!progress && !coverage) return null;
  return (
    <section className="coverage" aria-label="Your progress with this text">
      {progress && (
        <div className="coverage__read">
          <ProgressLine progress={progress} explain="disclosure" />
          <ReaderExtras progress={progress} />
        </div>
      )}
      {coverage && <VocabularyLine coverage={coverage} />}
    </section>
  );
}
