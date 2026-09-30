/**
 * Shared chrome, ported from Biblia: the stroke icon set, Topbar / BackLink / IconBtn, and the
 * height-animated Collapsible. Quiet chrome — the text is the thing on the page.
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const I = {
  back: <svg viewBox="0 0 24 24" {...stroke}><path d="M15 6l-6 6 6 6" /></svg>,
  close: <svg viewBox="0 0 24 24" {...stroke}><path d="M6 6l12 12M18 6L6 18" /></svg>,
  settings: <svg viewBox="0 0 24 24" {...stroke}><path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h8M16 17h4" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="14" cy="17" r="2" /></svg>,
  list: <svg viewBox="0 0 24 24" {...stroke}><path d="M5 7h14M5 12h14M5 17h9" /></svg>,
  vocab: <svg viewBox="0 0 24 24" {...stroke}><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3z" /><path d="M5 4v16a3 3 0 0 1 3-3h11" /><path d="M9 9h6" /></svg>,
  chevron: <svg viewBox="0 0 24 24" {...stroke}><path d="M8 10l4 4 4-4" /></svg>,
  chevronRight: <svg viewBox="0 0 24 24" {...stroke}><path d="M9 6l6 6-6 6" /></svg>,
  check: <svg viewBox="0 0 24 24" {...stroke}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  english: <svg viewBox="0 0 24 24" {...stroke}><path d="M4 6h9M8.5 4v2M6 6c.6 3.4 2.6 5.6 6 6.8M11 6c-.6 3.4-3 5.8-7 7M13.5 20l3.5-8 3.5 8M14.8 17h4.4" /></svg>,
  mic: <svg viewBox="0 0 24 24" {...stroke}><rect x="9" y="4" width="6" height="10" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v3" /></svg>,
  // player
  play: <svg viewBox="0 0 24 24" {...stroke}><path d="M8 5.5v13l10.5-6.5z" /></svg>,
  pause: <svg viewBox="0 0 24 24" {...stroke}><path d="M9 6v12M15 6v12" /></svg>,
  prev: <svg viewBox="0 0 24 24" {...stroke}><path d="M7 6v12M18 6l-9 6 9 6z" /></svg>,
  next: <svg viewBox="0 0 24 24" {...stroke}><path d="M17 6v12M6 6l9 6-9 6z" /></svg>,
  replay: <svg viewBox="0 0 24 24" {...stroke}><path d="M5 12a7 7 0 1 0 2.1-5" /><path d="M5 4.5V9h4.5" /></svg>,
  loop: <svg viewBox="0 0 24 24" {...stroke}><path d="M17 3.5l3 3-3 3M20 6.5H8a4 4 0 0 0-4 4M7 20.5l-3-3 3-3M4 17.5h12a4 4 0 0 0 4-4" /></svg>,
  prevPara: <svg viewBox="0 0 24 24" {...stroke}><path d="M11 6l-6 6 6 6M19 6l-6 6 6 6" /></svg>,
  nextPara: <svg viewBox="0 0 24 24" {...stroke}><path d="M5 6l6 6-6 6M13 6l6 6-6 6" /></svg>,
  dot: <svg viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="12" r="5" /></svg>,
  stop: <svg viewBox="0 0 24 24" {...stroke}><rect x="7" y="7" width="10" height="10" rx="1.5" /></svg>,
};

export function Topbar({ title, left, right }: { title: ReactNode; left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="topbar">
      {left}
      <div className="topbar__title">{title}</div>
      <div className="topbar__spacer" />
      {right}
    </header>
  );
}

export function BackLink({ to = '/', label = 'Back' }: { to?: string; label?: string }) {
  return (
    <Link to={to} className="iconbtn" aria-label={label} title={label}>
      {I.back}
    </Link>
  );
}

export interface IconBtnProps {
  onClick?: () => void;
  label: string;
  /** When defined the button is a toggle and exposes aria-pressed. */
  active?: boolean;
  children: ReactNode;
  to?: string;
  disabled?: boolean;
  className?: string;
  title?: string;
}

export function IconBtn({ onClick, label, active, children, to, disabled, className, title }: IconBtnProps) {
  const cls = `iconbtn${active ? ' iconbtn--active' : ''}${className ? ` ${className}` : ''}`;
  if (to) return <Link to={to} className={cls} aria-label={label} title={title ?? label}>{children}</Link>;
  return (
    <button type="button" className={cls} onClick={onClick} aria-label={label} title={title ?? label} aria-pressed={active} disabled={disabled}>
      {children}
    </button>
  );
}

/**
 * Height-animated disclosure (from the Classical Library). Content stays mounted so it can animate
 * both ways; `inert` keeps a collapsed panel out of tab and assistive-technology reach.
 */
export function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className="collapsible" data-open={open ? 'true' : 'false'}>
      <div className="collapsible__inner" inert={!open}>
        {children}
      </div>
    </div>
  );
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}
