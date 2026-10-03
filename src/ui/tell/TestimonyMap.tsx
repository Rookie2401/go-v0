/**
 * The testimony as a semantic graph (shown on My Testimony): the meanings of a testimony in story order, which of them are
 * in the saved version (and whether in his own words), which he can say on his own, and what the 30-second, two-minute and
 * full deliveries still lack. Loaded only when opened; read-only.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GoTellPractice, LanguageCode, TestimonyMap } from '../../core';
import { LEVEL_TEXT } from './Practice';
import './tell.css';

const LENGTH_TEXT = { short: '30-second version', standard: 'Two-minute version', full: 'The full story' } as const;

export function TestimonyMapPanel({ practice, userId, lang, revisionKey }: { practice: GoTellPractice; userId: string; lang: LanguageCode; revisionKey?: string }) {
  const [map, setMap] = useState<TestimonyMap | null>(null);
  useEffect(() => {
    let live = true;
    void practice.testimonyMap(userId, lang).then((m) => { if (live) setMap(m); }, () => { if (live) setMap(null); });
    return () => { live = false; };
  }, [practice, userId, lang, revisionKey]);
  if (!map) return <p className="muted" role="status">Loading…</p>;
  return (
    <div className="tell-map" data-testid="testimony-map">
      <ul className="tell-map__deliveries" aria-label="Deliveries">
        {map.deliveries.map((d) => (
          <li key={d.length}>
            <strong>{LENGTH_TEXT[d.length]}:</strong> {d.goalIds.length} parts — {d.canSayAlone.length} you can say on your own, {d.inTestimony.length} in your saved version{d.missing.length ? `, ${d.missing.length} still to work on` : ''}.
          </li>
        ))}
      </ul>
      <ol className="tell-map__nodes" aria-label="Parts of a testimony">
        {map.nodes.map((n) => (
          <li key={n.goal.id} className="tell-map__node" data-goal-id={n.goal.id}>
            <span>{n.goal.meaning}</span>
            <span className="chips">
              <span className="chip">P{n.state.level} · {LEVEL_TEXT[n.state.level]}</span>
              {n.inTestimony.length > 0 && <span className="chip">{n.inTestimony.some((s) => s.own) ? 'in your testimony, your words' : 'in your testimony, with suggestions'}</span>}
            </span>
          </li>
        ))}
      </ol>
      <p className="card__note">These are meanings, not wording: your testimony is yours to word. The parts are recognised by GoTell's word lists, which can miss what you wrote another way.</p>
      <Link className="btn btn--small" to="/tell">Practise saying parts of it</Link>
    </div>
  );
}
