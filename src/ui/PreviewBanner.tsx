/**
 * The preview-mode banner: persistent, on every screen, impossible to mistake for normal use.
 * Preview mode lists texts that have not been reviewed or verified and allows placeholder (non-speech) audio.
 * It is off by default and persisted on this device; turning it off here or in Settings returns to normal use.
 *
 * The banner sticks to the top of the viewport (below the sandbox banner, when there is one); its height is published as
 * `--preview-h`, which index.css adds to `--sandbox-h` as `--banner-h`, so the sticky page headers sit just below the banners
 * instead of sliding underneath.
 */
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from './context';
import { setPref, usePreview } from './prefs';

export function PreviewBanner() {
  const preview = usePreview();
  const { features } = useApp();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = typeof document !== 'undefined' ? document.documentElement : undefined;
    const el = ref.current;
    if (!preview || !el || !root) return;
    const publish = () => root.style.setProperty('--preview-h', `${el.offsetHeight}px`);
    publish();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(publish) : undefined;
    ro?.observe(el);
    window.addEventListener('resize', publish);
    return () => { ro?.disconnect(); window.removeEventListener('resize', publish); root.style.removeProperty('--preview-h'); };
  }, [preview]);

  if (!preview) return null;
  return (
    <div ref={ref} className="preview-banner" role="region" aria-label="Preview mode" data-testid="preview-banner">
      <strong className="preview-banner__title">Preview mode</strong>
      <span className="preview-banner__text">
        Unreviewed content is showing. These texts have not been reviewed or verified{features.listen ? ', and any audio may be placeholder sound, not speech' : ''}. This is not the learner&rsquo;s normal library.
      </span>
      <span className="preview-banner__actions">
        <button type="button" className="btn btn--small" onClick={() => setPref('preview', false)}>Turn off preview</button>
        <Link to="/settings" className="preview-banner__link">Settings</Link>
      </span>
    </div>
  );
}
