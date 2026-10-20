/**
 * GhostEditor - the testimony textarea with a faint hint behind it (docs/GOTELL-GUIDED.md, Package C).
 *
 * Two layers share one box. Behind: a backdrop (aria-hidden) that mirrors the textarea's font, padding, wrapping and
 * scroll and draws the text, with the words that were supplied from an English parenthetical in italics and, at the
 * caret, the hint ("ghost"). In front: the real textarea, whose own text is transparent but whose caret is visible.
 * The hint is NEVER part of the text: no key accepts it, nothing is inserted, the learner types every letter.
 *
 * Range bookkeeping (`assist`) is shifted here on every edit with the engine's own arithmetic, so a parent only ever
 * sees a text together with the assist that describes it.
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { ChangeEvent, SyntheticEvent } from 'react';
import { editBetween, shiftAssist } from '../../gotell/predict';
import type { Range, TextAssist } from '../../gotell/predict';

export interface GhostView {
  /** What the hint shows after the caret. */
  completion: string;
  /** 'new' = a word the learner has not met: a visibly different hint (dotted underline). */
  style: 'known' | 'new';
}

export interface GhostEditorProps {
  value: string;
  assist: TextAssist;
  /** The learner typed: the new text, the assist shifted across the edit, and where the caret is now. */
  onChange(next: { text: string; assist: TextAssist; caret: number }): void;
  lang: string;
  ghost: GhostView | null;
  /** The caret moved (never called between compositionstart and compositionend). */
  onCaret?(offset: number): void;
  /** An input method is composing (Hindi / Thai / ...): the parent must not predict until it ends. */
  onComposition?(active: boolean): void;
  onBlur?(): void;
  /** Put the caret here (a new `id` each time it must be applied, e.g. after the editor rewrote the text). */
  selection?: { offset: number; id: number } | null;
  readOnly?: boolean;
  rows?: number;
  ariaLabel?: string;
  ariaBusy?: boolean;
}

/** The backdrop's children: plain text, supplied words in `<i class="supplied">`, and the hint at `caret`. */
function backdropNodes(value: string, supplied: readonly Range[], caret: number, ghost: GhostView | null) {
  const ranges = [...supplied]
    .map((r) => ({ start: Math.max(0, r.start), end: Math.min(value.length, r.end) }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);
  const out: React.ReactNode[] = [];
  let key = 0;
  let ghostDone = !ghost || caret < 0 || caret > value.length;
  const piece = (a: number, b: number, italic: boolean) => {
    const wrap = (text: string) => {
      if (!text) return;
      out.push(italic ? <i key={key++} className="supplied">{text}</i> : text);
    };
    if (!ghostDone && caret >= a && caret <= b) {
      wrap(value.slice(a, caret));
      out.push(<span key={key++} className={ghost!.style === 'new' ? 'ghost ghost--new' : 'ghost'} data-ghost={ghost!.style}>{ghost!.completion}</span>);
      ghostDone = true;
      wrap(value.slice(caret, b));
    } else wrap(value.slice(a, b));
  };
  let pos = 0;
  for (const r of ranges) {
    if (r.start < pos) continue; // overlapping ranges: the first wins
    if (r.start > pos) piece(pos, r.start, false);
    piece(r.start, r.end, true);
    pos = r.end;
  }
  piece(pos, value.length, false);
  return out;
}

export function GhostEditor(props: GhostEditorProps) {
  const { value, assist, onChange, lang, ghost, onCaret, onComposition, onBlur, selection, readOnly, rows = 8, ariaLabel, ariaBusy } = props;
  const area = useRef<HTMLTextAreaElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const [caret, setCaret] = useState(0);
  const reported = useRef(-1);

  const reportCaret = useCallback((offset: number) => {
    setCaret(offset);
    if (composing.current || offset === reported.current) return;
    reported.current = offset;
    onCaret?.(offset);
  }, [onCaret]);

  const syncScroll = useCallback(() => {
    const a = area.current;
    const b = back.current;
    if (a && b) { b.scrollTop = a.scrollTop; b.scrollLeft = a.scrollLeft; }
  }, []);

  // The text can grow (the hint, a rewrite) without the textarea scrolling: keep the backdrop in step after every render.
  useLayoutEffect(syncScroll);

  useLayoutEffect(() => {
    const a = area.current;
    if (!a || !selection) return;
    const at = Math.min(selection.offset, a.value.length);
    try { a.setSelectionRange(at, at); } catch { /* not selectable (detached) */ }
    reported.current = at;
    setCaret(at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection?.id]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    const at = e.target.selectionStart ?? text.length;
    const next = shiftAssist(assist, editBetween(value, text));
    reported.current = at;
    setCaret(at);
    onChange({ text, assist: next, caret: at });
  };

  const handleSelect = (e: SyntheticEvent<HTMLTextAreaElement>) => {
    const a = e.currentTarget;
    if (a.selectionStart === a.selectionEnd) reportCaret(a.selectionStart);
  };

  const shown = ghost && !composing.current && !readOnly ? ghost : null;
  const at = Math.min(caret, value.length);

  return (
    <div className="ghost-editor" data-has-ghost={shown ? 'true' : 'false'}>
      <div ref={back} className="ghost-editor__backdrop" aria-hidden="true" lang={lang} data-testid="ghost-backdrop">
        {backdropNodes(value, assist.supplied, at, shown)}
        {'​'}
      </div>
      <textarea
        ref={area} className="editor" lang={lang} rows={rows} value={value} spellCheck={false}
        aria-label={ariaLabel} aria-busy={ariaBusy} readOnly={readOnly} placeholder=""
        onChange={handleChange}
        onSelect={handleSelect}
        onKeyUp={handleSelect}
        onClick={handleSelect}
        onFocus={handleSelect}
        onScroll={syncScroll}
        onBlur={() => onBlur?.()}
        onCompositionStart={() => { composing.current = true; onComposition?.(true); }}
        onCompositionEnd={(e) => {
          composing.current = false;
          onComposition?.(false);
          const a = e.currentTarget;
          reported.current = -1;
          reportCaret(a.selectionStart);
        }}
      />
    </div>
  );
}
