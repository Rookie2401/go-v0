/**
 * Settings → Backup and recovery: export this learner's own data to a file (testimonies, versions, drafts, history, optionally
 * recordings) and restore it from a file. Nothing leaves the device except by this explicit export. Restore is
 * merge by default (it never overwrites newer writing); derived progress is rebuilt from the restored history.
 */
import { useId, useState } from 'react';
import { useApp } from '../../context';
import type { BackupCheckView, RestoreView } from '../../context';
import { downloadTextFile, readFileText } from '../../files';
import { errorText } from './shared';

export function BackupSection() {
  const { backup, golearn, userId, user, refreshUser, features } = useApp();
  const inputId = useId();
  const [includeRecordings, setIncludeRecordings] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<{ name: string; data: unknown; check: BackupCheckView } | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [restored, setRestored] = useState<RestoreView | null>(null);

  const doExport = async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      // Listening off: the option is hidden, so nothing may be silently dropped from the file: recordings already on this device go in.
      const data = await backup.exportLearner(userId, { includeRecordings: features.listen ? includeRecordings : true });
      const day = new Date().toISOString().slice(0, 10);
      downloadTextFile(`go-backup-${userId}-${day}.json`, JSON.stringify(data));
      setMessage('Your backup file has been saved to your downloads. Keep it somewhere private: it contains your writing.');
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  const choose = async (f: File | undefined) => {
    setError(null); setMessage(null); setRestored(null); setFile(null); setConfirmReplace(false);
    if (!f) return;
    try {
      const data = JSON.parse(await readFileText(f)) as unknown;
      setFile({ name: f.name, data, check: backup.check(data) });
    } catch (e) {
      setFile({ name: f.name, data: null, check: { ok: false, errors: [`This is not a readable backup file: ${errorText(e)}`] } });
    }
  };

  const doRestore = async () => {
    if (!file?.check.ok) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await backup.restore(file.data, { mode });
      if (result.needsRebuild) await golearn.rebuild(userId);
      await refreshUser().catch(() => undefined);
      setRestored(result);
      setFile(null);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  return (
    <section aria-label="Backup and recovery" id="settings-backup" data-settings-section="backup">
      <h2 className="section-head" tabIndex={-1}>Backup and recovery</h2>
      <p className="card__note">Your writing, versions, drafts and history live only on this device. A backup file is how you move them to another device or keep a safe copy. It covers {user.displayName} only.</p>
      {error && <p role="alert" className="error">{error}</p>}
      {message && <p role="status" className="note">{message}</p>}

      {features.listen && <label className="field field--row"><span>Include my recordings (makes the file much larger)</span>
        <input type="checkbox" checked={includeRecordings} aria-label="Include my recordings" onChange={(e) => setIncludeRecordings(e.target.checked)} />
      </label>}
      <div className="actions">
        <button type="button" className="btn" disabled={busy} onClick={() => { void doExport(); }}>Export my data</button>
      </div>

      <h3 className="label">Restore from a file</h3>
      <label className="field" htmlFor={inputId}>
        <span className="label">Backup file</span>
        <input id={inputId} type="file" accept=".json,application/json" aria-label="Choose a backup file" onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {file && !file.check.ok && (
        <div className="note note--warn" role="alert" data-testid="backup-invalid">
          <p><strong>{file.name} cannot be restored.</strong></p>
          <ul className="reasons">{file.check.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      {file?.check.ok && (
        <div data-testid="backup-valid">
          <p className="note" role="status">{file.name} is a valid backup{file.check.summary ? `: ${file.check.summary}` : ''}.</p>
          {(file.check.warnings ?? []).length > 0 && <ul className="reasons" aria-label="Warnings">{(file.check.warnings ?? []).map((w) => <li key={w}>{w}</li>)}</ul>}
          <p className="card__note">A backup holds your learning data, not this device&rsquo;s settings. On a new device, choose your team first (Go asks when you open it), then restore.</p>
          <label className="field"><span className="label">How to restore</span>
            <select value={mode} aria-label="Restore mode" onChange={(e) => { setMode(e.target.value as 'merge' | 'replace'); setConfirmReplace(false); }}>
              <option value="merge">Merge — add what is missing, never overwrite newer writing</option>
              <option value="replace">Replace — make this learner match the file</option>
            </select>
          </label>
          {mode === 'replace' && (
            <label className="field field--row"><span>I understand this discards what this learner has now</span>
              <input type="checkbox" checked={confirmReplace} aria-label="Confirm replace" onChange={(e) => setConfirmReplace(e.target.checked)} />
            </label>
          )}
          <div className="actions">
            <button type="button" className="btn btn--primary" disabled={busy || (mode === 'replace' && !confirmReplace)} onClick={() => { void doRestore(); }}>Restore</button>
          </div>
        </div>
      )}
      {restored && (
        <div role="status" className="note" data-testid="restore-done">
          <p>Restored.{restored.needsRebuild ? ' Your progress was rebuilt from the restored history.' : ''}</p>
          {restored.summary.length > 0 && <ul className="reasons">{restored.summary.map((s) => <li key={s}>{s}</li>)}</ul>}
        </div>
      )}
    </section>
  );
}
