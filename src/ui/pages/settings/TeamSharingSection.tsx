/**
 * Settings → Team sharing: the address of the team's server and the team code, kept on this device only (prefs). They are
 * sent nowhere but to that server, and only when the learner taps a button (check, fetch, share).
 */
import { useState } from 'react';
import { createTeamClient } from '../../../goread/client';
import { usePref } from '../../prefs';
import { errorText } from './shared';

export function TeamSharingSection() {
  const [server, setServer] = usePref('teamServer');
  const [code, setCode] = usePref('teamCode');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<{ ok: boolean; text: string } | null>(null);
  const address = server.trim();

  const check = async () => {
    setBusy(true); setAnswer(null);
    try {
      const health = await createTeamClient({ baseUrl: address, code }).health();
      setAnswer(health.ok ? { ok: true, text: 'The team server answers.' } : { ok: false, text: health.message || 'The team server did not answer as expected.' });
    } catch (e) {
      setAnswer({ ok: false, text: errorText(e) });
    } finally { setBusy(false); }
  };

  return (
    <section aria-label="Team sharing" id="settings-team-sharing" data-settings-section="team-sharing">
      <h2 className="section-head" tabIndex={-1}>Team sharing</h2>
      <p className="card__note">Your team's server lets everyone on the team fetch the texts the team added. The address and the code stay on this device.</p>
      <label className="field">
        <span className="label">Server address</span>
        <input
          type="text" value={server} placeholder="https://…" aria-label="Team server address" autoComplete="off" spellCheck={false}
          onChange={(e) => { setServer(e.target.value); setAnswer(null); }}
        />
      </label>
      <label className="field">
        <span className="label">Team code</span>
        <input
          type="password" value={code} aria-label="Team code" autoComplete="off"
          onChange={(e) => { setCode(e.target.value); setAnswer(null); }}
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
