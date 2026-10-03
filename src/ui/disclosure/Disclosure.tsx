/**
 * The dropdown parts shared by the Scripture page and the Read page: a disclosure rung (`Group`: a button head with a
 * rotating decorative chevron and height-animated children), the height-animated panel (`Collapsible`) and the memo wrapper
 * (`BookSection`) that keeps one book from re-rendering when another is clicked. The rules are in disclosure.css, scoped
 * under `.disclosure-page`: a page that uses these parts puts that class on its root.
 */
import { memo, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { LanguageCode } from '../../core';
import './disclosure.css';

const CHEVRON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
);

/**
 * One book's group, re-rendered only when what it shows changes: its own open state, its chapters, the learner's progress
 * and coverage, the chapter last read, preview mode. Clicking one book then renders that book, not all 66 with their rows,
 * so the opening animation starts at once.
 */
export const BookSection = memo(
  function BookSection({ render }: { open: boolean; chapters: unknown; progress: unknown; coverage: unknown; lastId?: string; preview: boolean; render: () => ReactNode }) {
    return <>{render()}</>;
  },
  (a, b) => a.open === b.open && a.chapters === b.chapters && a.progress === b.progress && a.coverage === b.coverage && a.lastId === b.lastId && a.preview === b.preview,
);

/**
 * Height-animated disclosure: grid-template-rows 0fr <-> 1fr; `inert` keeps a collapsed panel out of tab and
 * assistive-technology reach. Content that is mounted on opening is first laid out closed and opened on the next frame,
 * so the panel always grows from nothing instead of appearing at its full height.
 */
export function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  const [shown, setShown] = useState(open);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open) { setShown(false); return; }
    // lay the newly mounted content out CLOSED (a forced layout read), then open it in the same task, before paint:
    // the browser has a closed starting point to transition from, without waiting for animation frames
    ref.current?.getBoundingClientRect();
    setShown(true);
  }, [open]);
  const isOpen = open && shown;
  return (
    <div ref={ref} className="collapsible" data-open={isOpen ? 'true' : 'false'}>
      <div className="collapsible__inner" inert={!isOpen}>{children}</div>
    </div>
  );
}

/** One disclosure rung: a button head with a rotating (decorative) chevron and height-animated children. A group that cannot be opened is a muted, non-interactive head. */
export function Group({ id, level, open, onToggle, title, titleLang, native, lang, meta, current, expandable = true, children }: {
  id: string; level: 1 | 2 | 3; open: boolean; onToggle: (id: string) => void; title: string; /** language of the title, when it is not the app's own (a book's title in the course language) */ titleLang?: LanguageCode;
  native?: string; lang?: LanguageCode; meta?: string; current?: boolean; expandable?: boolean; children: ReactNode | (() => ReactNode);
}) {
  // A book's chapter list (level 3) is mounted on first opening and then kept (so the collapse can animate); every group above it is always mounted.
  const seen = useRef(open);
  if (open && expandable) seen.current = true;
  const head = (
    <>
      <span className={`lib__chev${open && expandable ? ' lib__chev--open' : ''}${expandable ? '' : ' lib__chev--none'}`} aria-hidden="true">{CHEVRON}</span>
      <span className="lib__title" lang={titleLang}>{title}</span>
      {native && <span className="lib__native" lang={lang}>{native}</span>}
      {meta && <span className="lib__meta">{meta}</span>}
    </>
  );
  return (
    <div className={`lib__group lib__group--${level}${current ? ' lib__group--current' : ''}${expandable ? '' : ' lib__group--empty'}`} data-group={id}>
      {expandable ? (
        <button type="button" className="lib__head" aria-expanded={open} onClick={() => onToggle(id)}>{head}</button>
      ) : (
        <div className="lib__head lib__head--static" data-unavailable="true">{head}</div>
      )}
      {expandable && <Collapsible open={open}><div className="lib__children">{level < 3 || seen.current ? (typeof children === 'function' ? children() : children) : null}</div></Collapsible>}
    </div>
  );
}
