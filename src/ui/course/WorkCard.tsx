/**
 * One work of the ladder: title, author when known, purpose, variety chips, one honest rights line, and — when the learner has
 * imported his own copy — "Your copy · n chapters" linking to the first chapter he has not finished, with the canonical
 * progress line of every chapter. A work is a recommendation: nothing here implies Go supplies it.
 */
import { Link } from 'react-router-dom';
import type { ReadingProgress, Text, Work } from '../../core';
import { ProgressLine } from '../coverage';
import { textPath } from '../format';
import { Disclosure } from '../ui';
import { CopyImporter } from './CopyImporter';
import { pointerOnly, registerChips, rightsDetail, workRightsLine } from './wording';
import './course.css';

/** "3. Chapter title" — but a chapter of Scripture is named by its book and chapter ("Psalms 23"), not by its running number in the Bible. */
export const chapterLabel = (t: Text): string => (t.chapter ? (t.kind === 'scripture' ? (t.chapter.title ?? t.title) : `${t.chapter.index}. ${t.chapter.title ?? t.title}`) : t.title);

/** The first chapter (in order) he has not finished; the first one when all are finished or progress is not known yet. */
export function firstUnfinished(texts: readonly Text[], progress: ReadonlyMap<string, ReadingProgress>): Text | undefined {
  return texts.find((t) => !progress.get(t.id)?.finishedAt) ?? texts[0];
}

export function WorkCard({ work, texts, held, progress, onImported }: {
  work: Work;
  /** The chapters he can open now, in chapter order. */
  texts: Text[];
  /** Chapters that exist but are not published (hidden outside preview mode). */
  held: number;
  progress: ReadonlyMap<string, ReadingProgress>;
  onImported(): void;
}) {
  const chips = registerChips(work);
  const detail = rightsDetail(work);
  const next = firstUnfinished(texts, progress);
  const allDone = texts.length > 0 && texts.every((t) => !!progress.get(t.id)?.finishedAt);
  const personal =texts.length > 0 && texts.every((t) => t.personalCopy === true);
  const copyLabel = `${personal ? 'Your copy' : 'Chapters'} · ${texts.length} ${texts.length === 1 ? 'chapter' : 'chapters'}`;
  return (
    <li className="work" data-work={work.id}>
      <h4 className="work__title">
        <span lang={work.lang}>{work.title}</span>
        {work.author && <span className="work__author" lang={work.lang}> · {work.author}</span>}
        {work.optional && <span className="work__optional"> (optional)</span>}
      </h4>
      {work.purpose.length > 0 && <p className="work__purpose">{work.purpose.join(' · ')}</p>}
      {chips.length > 0 && (
        <ul className="chips work__chips" aria-label="Varieties of the language in this work">
          {chips.map((c) => <li key={c} className="chip">{c}</li>)}
        </ul>
      )}
      <p className="work__rights card__note" data-testid="rights-line">{workRightsLine(work)}</p>
      {detail.length > 0 && (
        <Disclosure label="Where this comes from" lazy className="work__detail">
          <ul className="reasons">{detail.map((d) => <li key={d}>{d}</li>)}</ul>
        </Disclosure>
      )}
      {texts.length > 0 && next && (
        <div className="work__copy" data-testid="work-copy">
          <Link to={textPath(next)} className="work__copy-link">{copyLabel}</Link>
          <span className="work__next card__note">
            {allDone ? ' You have marked every chapter finished.' : <> Next: <span lang={next.lang}>{chapterLabel(next)}</span></>}
          </span>
          <Disclosure label="Chapters" lazy className="work__chapters">
            <ol className="work__chapter-list">
              {texts.map((t) => (
                <li key={t.id}>
                  <Link to={textPath(t)} className="work__chapter" lang={t.lang}>{chapterLabel(t)}</Link>
                  {progress.get(t.id) && <span className="work__chapter-progress card__note"> <ProgressLine progress={progress.get(t.id)!} testId="chapter-progress" /></span>}
                </li>
              ))}
            </ol>
          </Disclosure>
        </div>
      )}
      {held > 0 && (
        <p className="card__note work__held" data-testid="work-held">
          {held} {held === 1 ? 'chapter is' : 'chapters are'} not shown because {held === 1 ? 'it is' : 'they are'} not published yet. <Link to="/settings">Preview mode in Settings</Link> lists them, clearly marked.
        </p>
      )}
      {work.role !== 'audio' && !pointerOnly(work.rights) && (
        <Disclosure label={texts.length > 0 || held > 0 ? 'Add or replace your copy' : 'Add your copy'} lazy className="work__add">
          <CopyImporter work={work} onImported={onImported} />
        </Disclosure>
      )}
    </li>
  );
}
