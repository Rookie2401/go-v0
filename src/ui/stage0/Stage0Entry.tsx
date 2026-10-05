/**
 * The Home entry for Stage 0 — first in the list, so a learner who knows nothing of the language has a way in.
 * Shown only when Stage 0 exists for the course language.
 */
import { Link } from 'react-router-dom';
import { useApp } from '../context';
import { I } from '../ui';

export function Stage0Entry() {
  const { stage0, lang } = useApp();
  if (!stage0?.available(lang)) return null;
  return (
    <Link to="/start" className="home__entry" data-testid="stage0-entry">
      <span className="home__entry-body">
        <span className="home__entry-name">Start from zero</span>
        <span className="home__entry-sub">New to the language? Sounds, letters and your first sentences</span>
      </span>
      <span className="home__entry-go" aria-hidden="true">{I.chevronRight}</span>
    </Link>
  );
}
