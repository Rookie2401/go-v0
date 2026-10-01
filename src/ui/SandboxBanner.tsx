/**
 * The sandbox banner: persistent, on every screen (including first-run and start-up failures), impossible to mistake for
 * the learner's library. Rendered only when the page was opened with `?sandbox=<name>` (see sandbox.ts).
 * It sticks to the top; its height is published as `--sandbox-h` so the preview banner and the sticky page headers sit
 * just below it (index.css adds it to `--banner-h`).
 */
import { useEffect, useRef, useState } from 'react';
import { activeSandbox, normalAppHref } from './sandbox';

export function SandboxBanner() {
  const name = activeSandbox();
  const ref = useRef<HTMLDivElement>(null);
  // The link keeps the hash the learner navigated to (the router uses it). The router navigates with history.pushState, which
  // fires no event, so the link is refreshed whenever it is about to be used (hover, focus, click) as well as on hashchange / popstate.
  const [href, setHref] = useState(() => normalAppHref());
  const refresh = () => setHref(normalAppHref());
  useEffect(() => {
    window.addEventListener('hashchange', refresh);
    window.addEventListener('popstate', refresh);
    return () => { window.removeEventListener('hashchange', refresh); window.removeEventListener('popstate', refresh); };
  }, []);

  useEffect(() => {
    const root = typeof document !== 'undefined' ? document.documentElement : undefined;
    const el = ref.current;
    if (!name || !el || !root) return;
    const publish = () => root.style.setProperty('--sandbox-h', `${el.offsetHeight}px`);
    publish();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(publish) : undefined;
    ro?.observe(el);
    window.addEventListener('resize', publish);
    return () => { ro?.disconnect(); window.removeEventListener('resize', publish); root.style.removeProperty('--sandbox-h'); };
  }, [name]);

  if (!name) return null;
  return (
    <div ref={ref} className="sandbox-banner" role="region" aria-label="Sandbox" data-testid="sandbox-banner">
      <span className="sandbox-banner__text">Sandbox “{name}” — separate test data, not your library</span>
      <a
        className="sandbox-banner__link" href={href}
        onMouseEnter={refresh} onFocus={refresh}
        onClick={(e) => { e.currentTarget.href = normalAppHref(); }} // the browser follows the href as it is NOW, not as last rendered
      >Open the normal app</a>
    </div>
  );
}
