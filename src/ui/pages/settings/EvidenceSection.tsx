/**
 * Settings → Advanced → Evidence: what counts toward your progress and what was left out. Runs GoLearn's evidence audit,
 * lists the excluded events (never deleted from your history) and lets you rebuild derived progress from history.
 */
import { useState } from 'react';
import type { EvidenceAudit } from '../../../core';
import { useApp } from '../../context';
import { errorText } from './shared';

const REASON_LABEL: Record<EvidenceAudit['excluded'][number]['reason'], string> = {
  'non-speech-audio': 'placeholder (non-speech) audio',
  'unreviewed-voice': 'a voice nobody has auditioned',
  'unknown-asset': 'audio that could not be identified',
  'synthetic-audio': 'synthetic voice (exposure only)',
  'machine-checked-audio': 'audio awaiting human review',
  'rights-not-cleared': 'audio without approved playback rights',
  'stale-text-binding': 'audio bound to older wording or edition',
  'insufficient-audible-coverage': 'less than 80% of the playable audio heard',
  'sentence-mismatch': 'audio linked to different sentence identities',
  'assessment-material': 'protected assessment material (never training evidence)',
};

export function EvidenceSection() {
  const { golearn, userId, features } = useApp();
  const [audit, setAudit] = useState<EvidenceAudit | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = (label: string, fn: () => Promise<string | void>) => {
    setBusy(true); setError(null); setMessage(`${label}…`);
    fn().then((m) => { setMessage(m ?? null); }).catch((e: unknown) => { setMessage(null); setError(errorText(e)); }).finally(() => setBusy(false));
  };

  const grouped = new Map<string, number>();
  for (const x of audit?.excluded ?? []) grouped.set(x.reason, (grouped.get(x.reason) ?? 0) + 1);

  return (
    <section aria-label="Evidence">
      <h3 className="subsection-head">Evidence</h3>
      <p className="card__note">
        Progress is worked out from your history by fixed rules: opening{features.listen ? ' or hearing' : ''} something is exposure, not understanding; help is recorded as help;
        {features.listen ? ' only reviewed real speech counts for listening.' : ''} Nothing is ever deleted from your history; events that do not count are listed here.
      </p>
      {error && <p role="alert" className="error">{error}</p>}
      {message && <p role="status" className="note">{message}</p>}
      <div className="actions">
        <button type="button" className="btn btn--small" disabled={busy} onClick={() => run('Checking your history', async () => { setAudit(await golearn.auditEvidence(userId)); })}>Check evidence</button>
        <button type="button" className="btn btn--small" disabled={busy} onClick={() => run('Rebuilding', async () => { await golearn.rebuild(userId); return 'Learning state rebuilt from your history.'; })}>Rebuild learning state</button>
      </div>
      {audit && (
        <div data-testid="evidence-audit">
          <p>
            Rules {audit.policyVersion}. {audit.totalEvents} events in your history; {audit.excluded.length === 0 ? 'none are excluded.' : `${audit.excluded.length} ${audit.excluded.length === 1 ? 'does' : 'do'} not count.`}
          </p>
          {grouped.size > 0 && (
            <ul className="reasons" aria-label="Excluded events by reason">
              {[...grouped.entries()].map(([reason, n]) => <li key={reason}>{n} from {REASON_LABEL[reason as keyof typeof REASON_LABEL] ?? reason}</li>)}
            </ul>
          )}
          {audit.excluded.length > 0 && (
            <div className="table-wrap">
              <table className="datatable" aria-label="Excluded events">
                <thead><tr><th>Event</th><th>Type</th><th>Why it does not count</th></tr></thead>
                <tbody>
                  {audit.excluded.slice(0, 50).map((x) => (
                    <tr key={x.eventId}><th scope="row">{x.eventId.slice(-12)}</th><td data-label="Type">{x.type}</td><td data-label="Why">{REASON_LABEL[x.reason] ?? x.reason}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {audit.excluded.length > 50 && <p className="card__note">Showing 50 of {audit.excluded.length}.</p>}
        </div>
      )}
    </section>
  );
}
