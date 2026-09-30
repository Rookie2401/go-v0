/**
 * The preview-mode banner: persistent, on every screen, impossible to mistake for normal use.
 * Preview mode lists texts that have not been reviewed or verified and allows placeholder (non-speech) audio.
 * It is off by default and persisted on this device; turning it off here or in Settings returns to normal use.
 */
import { Link } from 'react-router-dom';
import { setPref, usePreview } from './prefs';

export function PreviewBanner() {
  const preview = usePreview();
  if (!preview) return null;
  return (
    <div className="preview-banner" role="region" aria-label="Preview mode" data-testid="preview-banner">
      <strong className="preview-banner__title">Preview mode</strong>
      <span className="preview-banner__text">
        Unreviewed content is showing. These texts have not been reviewed or verified, and any audio may be placeholder sound, not speech. This is not the learner&rsquo;s normal library.
      </span>
      <span className="preview-banner__actions">
        <button type="button" className="btn btn--small" onClick={() => setPref('preview', false)}>Turn off preview</button>
        <Link to="/settings" className="preview-banner__link">Settings</Link>
      </span>
    </div>
  );
}
