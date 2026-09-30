/** Settings: course + learner switch, reading preferences, voice info, vocabulary list, GoListen diagnostics. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LEVEL_ORDER } from '../../core';
import type { Course, GoListenDiagnostics, ItemKind, ItemMarked, LearnerItemState, LearnerLevel, User, VoiceConfig } from '../../core';
import { useApp } from '../context';
import { itemSurface } from '../format';
import { usePref } from '../prefs';
import type { HighlightPref } from '../prefs';

const levelLabel = (l: LearnerLevel) => l.replace(/_/g, ' ');
const levelRank = (l: LearnerLevel) => LEVEL_ORDER.indexOf(l);

export function Settings() {
  return (
    <div className="page settings">
      <h1>Settings</h1>
      <LearnerSection />
      <ReadingSection />
      <VoiceSection />
      <VocabularySection />
      <DiagnosticsSection />
    </div>
  );
}

function LearnerSection() {
  const { store, user, course, selectUser, refreshUser } = useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [name, setName] = useState('');
  const [newCourse, setNewCourse] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [u, c] = await Promise.all([store.users.all(), store.courses.all()]);
    setUsers(u.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    setCourses(c);
    setNewCourse((prev) => prev || c[0]?.id || '');
  }, [store]);
  useEffect(() => { void load(); }, [load, user.id]);

  const run = (fn: () => Promise<void>) => { setError(null); fn().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))); };

  return (
    <section aria-label="Learner and course">
      <h2>Learner and course</h2>
      {error && <p role="alert">{error}</p>}
      <div className="form-grid">
        <label>
          <span className="muted small">Learner</span>
          <select value={user.id} aria-label="Learner" onChange={(e) => run(() => selectUser(e.target.value))}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
          </select>
        </label>
        <label>
          <span className="muted small">Course for this learner</span>
          <select
            value={course.id} aria-label="Course"
            onChange={(e) => run(async () => { await store.users.put({ ...user, courseId: e.target.value }); await refreshUser(); })}
          >
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>
      </div>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || !newCourse) return;
          run(async () => {
            const id = `u-${Date.now().toString(36)}`;
            await store.users.put({ id, displayName: name.trim(), courseId: newCourse, createdAt: new Date().toISOString() });
            setName('');
            await selectUser(id);
            await load();
          });
        }}
      >
        <label>
          <span className="muted small">New learner</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} aria-label="New learner name" />
        </label>
        <label>
          <span className="muted small">Course</span>
          <select value={newCourse} onChange={(e) => setNewCourse(e.target.value)} aria-label="New learner course">
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>
        <button type="submit" className="btn-quiet" disabled={!name.trim()}>Add learner</button>
      </form>
      <p className="muted small">Each learner has their own reading history, vocabulary and testimonies on this device.</p>
    </section>
  );
}

function ReadingSection() {
  const [highlight, setHighlight] = usePref('highlight');
  return (
    <section aria-label="Reading">
      <h2>Reading</h2>
      <label>
        <span className="muted small">Highlight unfamiliar words</span>{' '}
        <select value={highlight} aria-label="Highlighting" onChange={(e) => setHighlight(e.target.value as HighlightPref)}>
          <option value="off">off</option>
          <option value="subtle">subtle</option>
          <option value="strong">strong</option>
        </select>
      </label>
    </section>
  );
}

function VoiceSection() {
  const { golisten, lang, course } = useApp();
  const [voice, setVoice] = useState<VoiceConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setVoice(null); setError(null);
    golisten.resolveVoice(lang, course.id).then((v) => { if (live) setVoice(v); }).catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [golisten, lang, course.id]);

  return (
    <section aria-label="Voice">
      <h2>Voice</h2>
      {error && <p role="alert">{error}</p>}
      {!voice && !error && <p className="muted" role="status">Looking up the voice…</p>}
      {voice && (
        <dl className="kv" data-testid="voice-card">
          <dt>Provider</dt><dd>{voice.providerId}{voice.providerId === 'fixture' && <> <span className="badge badge-warn">fixture audio — not speech</span></>}</dd>
          <dt>Voice</dt><dd>{voice.voiceId}{voice.engine ? ` (${voice.engine})` : ''}</dd>
          <dt>Locale asked for</dt><dd>{voice.requestedLocale}</dd>
          <dt>Locale delivered</dt><dd>{voice.actualLocale}{voice.actualLocale !== voice.requestedLocale && <> <span className="badge">fallback accent</span></>}</dd>
          <dt>Reviewed by a person</dt><dd>{voice.approved ? 'yes' : 'not yet'}{voice.qaNote ? ` — ${voice.qaNote}` : ''}</dd>
        </dl>
      )}
    </section>
  );
}

type KindFilter = Extract<ItemKind, 'form' | 'lemma' | 'phrase'>;

function VocabularySection() {
  const { store, bus, userId, lang, session } = useApp();
  const [rows, setRows] = useState<LearnerItemState[] | null>(null);
  const [kind, setKind] = useState<KindFilter>('form');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(100);

  const load = useCallback(async () => {
    setRows(await store.learnerItems.where('userId', userId));
  }, [store, userId]);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? [])
      .filter((r) => r.lang === lang && r.itemKind === kind && (!q || itemSurface(r.itemId).toLowerCase().includes(q)))
      .sort((a, b) => levelRank(b.reading.level) - levelRank(a.reading.level) || b.encounterCount - a.encounterCount || a.itemId.localeCompare(b.itemId));
  }, [rows, lang, kind, query]);

  const mark = async (r: LearnerItemState, value: 'known' | 'unknown' | 'clear') => {
    await bus.emit<ItemMarked>({ type: 'ItemMarked', userId, lang, surface: 'home', session, dedupeKey: `mark:${r.itemId}:${Date.now().toString(36)}`, itemId: r.itemId, itemKind: r.itemKind, mark: value });
    await load();
  };

  return (
    <section aria-label="Vocabulary">
      <h2>Vocabulary</h2>
      <p className="muted small">Built from what you have actually read, heard and written. Marking a word only adjusts how it is displayed to you; it never erases the evidence.</p>
      <div className="form-grid">
        <label>
          <span className="muted small">Show</span>
          <select value={kind} aria-label="Item kind" onChange={(e) => { setKind(e.target.value as KindFilter); setLimit(100); }}>
            <option value="form">word forms</option>
            <option value="lemma">dictionary words</option>
            <option value="phrase">phrases</option>
          </select>
        </label>
        <label>
          <span className="muted small">Search</span>
          <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(100); }} aria-label="Search vocabulary" />
        </label>
      </div>
      {rows === null ? <p className="muted" role="status">Loading…</p> : visible.length === 0 ? (
        <p className="muted">Nothing here yet. Read a story and your words will collect here.</p>
      ) : (
        <div className="table-wrap">
          <table className="vocab">
            <thead><tr><th>Word</th><th>Reading</th><th>Listening</th><th>Writing</th><th>Met</th><th>Mark</th></tr></thead>
            <tbody>
              {visible.slice(0, limit).map((r) => (
                <tr key={r.id}>
                  <th scope="row" lang={r.lang}>{itemSurface(r.itemId)}</th>
                  <td>{levelLabel(r.reading.level)}</td>
                  <td>{levelLabel(r.listening.level)}</td>
                  <td>{levelLabel(r.writing.level)}</td>
                  <td>{r.encounterCount}</td>
                  <td>
                    <select value={r.manualMark ?? 'clear'} aria-label={`Mark ${itemSurface(r.itemId)}`} onChange={(e) => { void mark(r, e.target.value as 'known' | 'unknown' | 'clear'); }}>
                      <option value="clear">—</option>
                      <option value="known">I know it</option>
                      <option value="unknown">Still learning</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {visible.length > limit && <button type="button" className="btn-quiet" onClick={() => setLimit(limit + 100)}>Show more ({visible.length - limit} left)</button>}
    </section>
  );
}

function DiagnosticsSection() {
  const { golisten, golearn, userId } = useApp();
  const [diag, setDiag] = useState<GoListenDiagnostics | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => { setDiag(await golisten.diagnostics()); }, [golisten]);
  useEffect(() => { load().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))); }, [load]);

  const run = (label: string, fn: () => Promise<string>) => {
    setError(null); setMessage(`${label}…`);
    fn().then((m) => { setMessage(m); return load(); }).catch((e: unknown) => { setMessage(null); setError(e instanceof Error ? e.message : String(e)); });
  };

  return (
    <section aria-label="GoListen diagnostics">
      <h2>Audio diagnostics</h2>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status" className="small">{message}</p>}
      <div className="actions">
        <button type="button" className="btn-quiet" onClick={() => run('Running audio jobs', async () => `Processed ${await golisten.runJobs()} job(s).`)}>Run pending audio jobs</button>
        <button type="button" className="btn-quiet" onClick={() => run('Rebuilding', async () => { await golearn.rebuild(userId); return 'Learning state rebuilt from your history.'; })}>Rebuild learning state</button>
      </div>
      {!diag ? <p className="muted" role="status">Loading…</p> : (
        <>
          <p className="small" data-testid="job-counts">{diag.segments.length} segment(s) · {diag.failedJobs} failed job(s) · {diag.deadJobs} dead job(s)</p>
          {diag.segments.length > 0 && (
            <div className="table-wrap">
              <table className="vocab diag">
                <thead><tr><th>Segment</th><th>Status</th><th>Provider / voice</th><th>Locale (asked → got)</th><th>Alignment</th><th>Validation</th></tr></thead>
                <tbody>
                  {diag.segments.map((s) => (
                    <tr key={s.segmentId} data-status={s.status}>
                      <th scope="row" className="small">{s.segmentId.slice(-14)}</th>
                      <td>{s.status}{s.lastError ? ` — ${s.lastError}` : ''}</td>
                      <td>{s.providerId ?? '—'} / {s.voiceId ?? '—'}</td>
                      <td>{s.requestedLocale ?? '—'} → {s.actualLocale ?? '—'}</td>
                      <td>{s.alignmentMethods.length ? s.alignmentMethods.join(', ') : 'none'}{s.minAlignmentConfidence !== undefined ? ` (≥ ${s.minAlignmentConfidence.toFixed(2)})` : ''}</td>
                      <td>{s.validation ? (s.validation.ok ? 'ok' : s.validation.problems.join('; ')) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
