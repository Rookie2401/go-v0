/**
 * Settings → Team sharing: the address of the team's server and, optionally, a contributor key, both kept on this device
 * only (prefs). Reading needs neither a key nor an account; adding texts needs a key from the team's list. They are used
 * only when the learner taps a button (check, fetch, share).
 */
import { useState } from 'react';
import { createTeamClient } from '../../../goread/client';
import { useApp } from '../../context';
import { usePref } from '../../prefs';
import { errorText } from './shared';

export function TeamSharingSection() {
  const { course } = useApp();
  const [server, setServer] = usePref('teamServer');
  const [teamKey, setTeamKey] = usePref('teamKey');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<{ ok: boolean; text: string } | null>(null);
  const address = server.trim();
  const key = teamKey.trim();

  const check = async () => {
    setBusy(true); setAnswer(null);
    try {
      const client = createTeamClient({ baseUrl: address, ...(key ? { key } : {}) });
      const health = await client.health();
      if (!health.ok) { setAnswer({ ok: false, text: health.message || 'The team server did not answer as expected.' }); return; }
      if (!key) { setAnswer({ ok: true, text: 'The team server answers.' }); return; }
      const me = await client.me(course.id);
      setAnswer({ ok: true, text: `You can add texts to the ${course.country} team as ${me.name}.` });
    } catch (e) {
      setAnswer({ ok: false, text: errorText(e) });
    } finally { setBusy(false); }
  };

  return (
    <section aria-label="Team sharing" id="settings-team-sharing" data-settings-section="team-sharing">
      <h2 className="section-head" tabIndex={-1}>Team sharing</h2>
      <p className="card__note">Your team's server holds the texts the team added. Anyone with the app can read any team's texts; adding is open to the people on the team's list. A text once added stays. The address and your key are kept on this device.</p>
      <label className="field">
        <span className="label">Server address</span>
        <input
          type="text" value={server} placeholder="https://…" aria-label="Team server address" autoComplete="off" spellCheck={false}
          onChange={(e) => { setServer(e.target.value); setAnswer(null); }}
        />
      </label>
      <label className="field">
        <span className="label">Contributor key</span>
        <input
          type="password" value={teamKey} aria-label="Your contributor key" autoComplete="off"
          onChange={(e) => { setTeamKey(e.target.value); setAnswer(null); }}
        />
        <span className="card__note">Optional. Ask whoever keeps your team's list. Without a key you can read everything.</span>
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
