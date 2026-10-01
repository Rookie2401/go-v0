/**
 * Settings → You → "More of": subjects and streams the learner would like to see more of. Stored as `User.interests` and used by the
 * ranking as a gentle preference. It never narrows anything: unchosen kinds of reading stay available and still appear.
 * Shown only for a course with streams.
 */
import { useState } from 'react';
import { useApp } from '../../context';
import { useStreams } from '../../course/catalogue';
import { errorText } from './shared';

/** Subjects a learner can ask for more of, beside the streams. Each is a `domain` on works and texts. */
export const INTEREST_SUBJECTS: Array<{ key: string; label: string }> = [
  { key: 'history', label: 'History' },
  { key: 'science', label: 'Science' },
  { key: 'engineering', label: 'Engineering' },
  { key: 'theology', label: 'Theology' },
  { key: 'biography', label: 'Biography' },
];

export function InterestsSection() {
  const { store, user, refreshUser } = useApp();
  const streams = useStreams();
  const [error, setError] = useState<string | null>(null);
  const chosen = new Set(user.interests ?? []);
  if (!streams || streams.length === 0) return null;

  const kinds = streams.filter((s) => s.available && s.kind !== 'personal').map((s) => ({ key: s.key, label: s.label }));
  const toggle = async (key: string) => {
    setError(null);
    const next = new Set(chosen);
    if (next.has(key)) next.delete(key); else next.add(key);
    try { await store.users.put({ ...user, interests: [...next] }); await refreshUser(); } catch (e) { setError(errorText(e)); }
  };

  return (
    <fieldset className="interests" aria-label="More of" data-testid="interests">
      <legend className="label">More of</legend>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="segmented interests__group" role="group" aria-label="Kinds of reading">
        {kinds.map((k) => <button key={k.key} type="button" aria-pressed={chosen.has(k.key)} onClick={() => { void toggle(k.key); }}>{k.label}</button>)}
      </div>
      <div className="segmented interests__group" role="group" aria-label="Subjects">
        {INTEREST_SUBJECTS.map((k) => <button key={k.key} type="button" aria-pressed={chosen.has(k.key)} onClick={() => { void toggle(k.key); }}>{k.label}</button>)}
      </div>
      <p className="card__note">Choose what you would like to see more of. This only adds to your suggestions; it never hides anything and you can read any of it.</p>
    </fieldset>
  );
}
