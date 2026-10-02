/**
 * Settings → Team sharing: the address of the team's server, kept on this device only (prefs). It is used only when the
 * learner taps a button (check, fetch, share). There is no code: the team is the course the learner chose.
 */
import { useState } from 'react';
import { createTeamClient } from '../../../goread/client';
import { usePref } from '../../prefs';
import { errorText } from './shared';

export function TeamSharingSection() {
  const [server, setServer] = usePref('teamServer');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<{ ok: boolean; text: string } | null>(null);
  const address = server.trim();

  const check = async () => {
    setBusy(true); setAnswer(null);
    try {
      const health = await createTeamClient({ baseUrl: address }).health();
      setAnswer(health.ok ? { ok: true, text: 'The team server answers.' } : { ok: false, text: health.message || 'The team server did not answer as expected.' });
    } catch (e) {
      setAnswer({ ok: false, text: errorText(e) });
    } finally { setBusy(false); }
  };

  return (
    <section aria-label="Team sharing" id="settings-team-sharing" data-settings-section="team-sharing">
      <h2 className="section-head" tabIndex={-1}>Team sharing</h2>
      <p className="card__note">Your team's server holds the texts the team added. Anyone with the app can join any team, read its texts and add to them; a text once added stays. The address is kept on this device.</p>
      <label className="field">
        <span className="label">Server address</span>
        <input
          type="text" value={server} placeholder="https://…" aria-label="Team server address" autoComplete="off" spellCheck={false}
          onChange={(e) => { setServer(e.target.value); setAnswer(null); }}
        />
      </label>
      <div className="actions">
        <button type="button" className="btn btn--small" disabled={!address || busy} onClick={() => { void check(); }}>Check the server</button>
      </div>
      {!address && <p className="muted">No team server set. Team Texts stays on this device.</p>}
      {answer?.ok && <p role="status" className="note">{answer.text}</p>}
      {answer && !answer.ok && <p role="alert" className="error">{answer.text}</p>}
    </section>
  );
}
