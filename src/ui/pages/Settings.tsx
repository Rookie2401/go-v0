/**
 * Settings: course + learner switch, reading preferences, Content (preview, importer, text list), Speech (provider,
 * Azure key, voices and their review), Language support, vocabulary list, Evidence, Backup, GoListen diagnostics.
 */
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { LEVEL_ORDER } from '../../core';
import type { Course, GoListenDiagnostics, ItemKind, ItemMarked, LearnerItemState, LearnerLevel, User } from '../../core';
import { useApp } from '../context';
import { itemSurface, languageName } from '../format';
import { TeamSelect } from '../Onboarding';
import { FONT_SIZE_RANGE, rememberChosenCourse, usePref } from '../prefs';
import type { HighlightPref, ThemePref } from '../prefs';
import { BackLink, I, IconBtn, Topbar } from '../ui';
import { BackupSection } from './settings/BackupSection';
import { ContentSection } from './settings/ContentSection';
import { EvidenceSection } from './settings/EvidenceSection';
import { LanguageSupportSection } from './settings/LanguageSupportSection';
import { SpeechSection } from './settings/SpeechSection';

const levelLabel = (l: LearnerLevel) => l.replace(/_/g, ' ');
const levelRank = (l: LearnerLevel) => LEVEL_ORDER.indexOf(l);
/** Learner level → the dot colour Biblia uses for vocabulary status (met → recognised → familiar → known). */
const dotClass = (l: LearnerLevel) => {
  const r = levelRank(l);
  return r >= 7 ? 'known' : r >= 4 ? 'familiar' : r >= 2 ? 'recognized' : 'new';
};

export function Settings() {
  const { user, course } = useApp();
  return (
    <div>
      <Topbar
        title="Settings"
        left={<BackLink to="/" label="Home" />}
        right={<IconBtn label="Vocabulary" to="/vocabulary">{I.vocab}</IconBtn>}
      />
      <div className="page page--narrow settings route-fade">
        <p className="who label" title={course.title}>{user.displayName} · {course.lang.toUpperCase()}</p>
        <LearnerSection />
        <ReadingSection />
        <ContentSection />
        <SpeechSection />
        <LanguageSupportSection />
        <VocabularySection />
        <EvidenceSection />
        <BackupSection />
        <DiagnosticsSection />
      </div>
    </div>
  );
}

export function VocabularyPage() {
  return (
    <div>
      <Topbar title="Vocabulary" left={<BackLink to="/" label="Home" />} right={<IconBtn label="Settings" to="/settings">{I.settings}</IconBtn>} />
      <div className="page page--narrow settings route-fade">
        <VocabularySection />
      </div>
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
      <h2 className="section-head">Learner and course</h2>
      {error && <p role="alert" className="error">{error}</p>}
      <label className="field">
        <span className="label">Learner</span>
        <select value={user.id} aria-label="Learner" onChange={(e) => run(() => selectUser(e.target.value))}>
          {users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="label">Team</span>
        <TeamSelect
          value={course.id}
          onChange={(courseId) => run(async () => { await store.users.put({ ...user, courseId }); rememberChosenCourse(courseId); await refreshUser(); })}
        />
        <span className="card__note">You are learning {languageName(course)}. Your progress is kept per language, so switching teams loses nothing.</span>
      </label>
      <form
        className="settings__new"
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
        <label className="field">
          <span className="label">New learner</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} aria-label="New learner name" />
        </label>
        <label className="field">
          <span className="label">Course</span>
          <select value={newCourse} onChange={(e) => setNewCourse(e.target.value)} aria-label="New learner course">
            {courses.map((c) => <option key={c.id} value={c.id}>{c.country}</option>)}
          </select>
        </label>
        <button type="submit" className="btn btn--small" disabled={!name.trim()}>Add learner</button>
      </form>
      <p className="card__note">Each learner has their own reading history, vocabulary and testimonies on this device.</p>
    </section>
  );
}

const HIGHLIGHTS: HighlightPref[] = ['off', 'subtle', 'strong'];
const THEMES: ThemePref[] = ['auto', 'light', 'dark'];

function ReadingSection() {
  const [highlight, setHighlight] = usePref('highlight');
  const [fontSize, setFontSize] = usePref('fontSize');
  const [theme, setTheme] = usePref('theme');
  const sizeId = useId();
  return (
    <section aria-label="Reading">
      <h2 className="section-head">Reading</h2>
      <div className="field">
        <span className="label">Highlight unfamiliar words</span>
        <div className="segmented" role="group" aria-label="Highlighting">
          {HIGHLIGHTS.map((h) => (
            <button key={h} type="button" aria-pressed={highlight === h} onClick={() => setHighlight(h)}>{h}</button>
          ))}
        </div>
      </div>
      <div className="field field--row">
        <label htmlFor={sizeId}>Text size</label>
        <input
          id={sizeId} type="range" min={FONT_SIZE_RANGE.min} max={FONT_SIZE_RANGE.max} step={1} value={fontSize}
          aria-valuetext={`${fontSize} pixels`} onChange={(e) => setFontSize(Number(e.target.value))}
        />
      </div>
      <div className="field">
        <span className="label" id={`${sizeId}-theme`}>Theme</span>
        <div className="segmented" role="group" aria-labelledby={`${sizeId}-theme`}>
          {THEMES.map((t) => (
            <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)}>{t}</button>
          ))}
        </div>
      </div>
    </section>
  );
}

type KindFilter = Extract<ItemKind, 'form' | 'lemma' | 'phrase'>;

function VocabularySection() {
  const { store, bus, golearn, userId, lang, session } = useApp();
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

  // "Why?": every state shown here can be explained from the history.
  const [why, setWhy] = useState<Record<string, string>>({});
  const explain = async (itemId: string) => {
    try { setWhy((w) => ({ ...w, [itemId]: '…' })); const e = await golearn.explainItem(userId, itemId); setWhy((w) => ({ ...w, [itemId]: e.summary })); }
    catch (err) { setWhy((w) => ({ ...w, [itemId]: err instanceof Error ? err.message : String(err) })); }
  };

  return (
    <section aria-label="Vocabulary" id="vocabulary">
      <h2 className="section-head">Vocabulary</h2>
      <p className="card__note">Built from what you have actually read, heard and written. Marking a word only adjusts how it is displayed to you; it never erases the evidence.</p>
      <label className="field">
        <span className="label">Show</span>
        <select value={kind} aria-label="Item kind" onChange={(e) => { setKind(e.target.value as KindFilter); setLimit(100); }}>
          <option value="form">word forms</option>
          <option value="lemma">dictionary words</option>
          <option value="phrase">phrases</option>
        </select>
      </label>
      <label className="field">
        <span className="label">Search</span>
        <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(100); }} aria-label="Search vocabulary" />
      </label>
      {rows === null ? <p className="muted" role="status">Loading…</p> : visible.length === 0 ? (
        <p className="muted">Nothing here yet. Read a story and your words will collect here.</p>
      ) : (
        <div className="table-wrap">
          <table className="vocab">
            <thead><tr><th>Word</th><th>Reading</th><th>Listening</th><th>Writing</th><th>Met</th><th>Mark</th><th>Why</th></tr></thead>
            <tbody>
              {visible.slice(0, limit).map((r) => (
                <VocabRow key={r.id} r={r} why={why[r.itemId]} onWhy={() => { void explain(r.itemId); }} onMark={(v) => { void mark(r, v); }} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {visible.length > limit && <button type="button" className="btn btn--small btn--quiet" onClick={() => setLimit(limit + 100)}>Show more ({visible.length - limit} left)</button>}
    </section>
  );
}

/** One vocabulary row; "likely familiar (estimate)" is an estimate and is never shown as known. */
function VocabRow({ r, why, onWhy, onMark }: { r: LearnerItemState; why?: string; onWhy(): void; onMark(v: 'known' | 'unknown' | 'clear'): void }) {
  const estimate = r.reading.estimatedFamiliar && levelRank(r.reading.level) < levelRank('recognized');
  return (
    <>
      <tr className="vocab__row">
        <th scope="row" lang={r.lang}><span className={`vocab__dot vocab__dot--${dotClass(r.reading.level)}`} aria-hidden="true" />{itemSurface(r.itemId)}</th>
        <td data-label="Reading">{levelLabel(r.reading.level)}{estimate && <span className="faint"> · likely familiar (estimate)</span>}</td>
        <td data-label="Listening">{levelLabel(r.listening.level)}</td>
        <td data-label="Writing">{levelLabel(r.writing.level)}</td>
        <td data-label="Met">{r.encounterCount}</td>
        <td>
          <select value={r.manualMark ?? 'clear'} aria-label={`Mark ${itemSurface(r.itemId)}`} onChange={(e) => onMark(e.target.value as 'known' | 'unknown' | 'clear')}>
            <option value="clear">—</option>
            <option value="known">I know it</option>
            <option value="unknown">Still learning</option>
          </select>
        </td>
        <td><button type="button" className="btn btn--small btn--quiet" aria-label={`Why ${itemSurface(r.itemId)}?`} onClick={onWhy}>Why?</button></td>
      </tr>
      {why && <tr className="vocab__why"><td colSpan={7} className="card__prov" data-testid="vocab-why">{why}</td></tr>}
    </>
  );
}

function DiagnosticsSection() {
  const { golisten } = useApp();
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
      <h2 className="section-head">Audio diagnostics</h2>
      {error && <p role="alert" className="error">{error}</p>}
      {message && <p role="status" className="note">{message}</p>}
      <div className="actions">
        <button type="button" className="btn btn--small" onClick={() => run('Running audio jobs', async () => `Processed ${await golisten.runJobs()} job(s).`)}>Run pending audio jobs</button>
      </div>
      {!diag ? <p className="muted" role="status">Loading…</p> : (
        <>
          <p className="card__note" data-testid="job-counts">{diag.segments.length} segment(s) · {diag.failedJobs} failed job(s) · {diag.deadJobs} dead job(s)</p>
          {diag.segments.length > 0 && (
            <div className="table-wrap prose">
              <table className="vocab diag">
                <thead><tr><th>Segment</th><th>Status</th><th>Provider / voice</th><th>Locale (asked → got)</th><th>Alignment</th><th>Validation</th></tr></thead>
                <tbody>
                  {diag.segments.map((s) => (
                    <tr key={s.segmentId} data-status={s.status}>
                      <th scope="row">{s.segmentId.slice(-14)}</th>
                      <td data-label="Status">{s.status}{s.lastError ? ` — ${s.lastError}` : ''}</td>
                      <td data-label="Provider / voice">{s.providerId ?? '—'} / {s.voiceId ?? '—'}</td>
                      <td data-label="Locale">{s.requestedLocale ?? '—'} → {s.actualLocale ?? '—'}</td>
                      <td data-label="Alignment">{s.alignmentMethods.length ? s.alignmentMethods.join(', ') : 'none'}{s.minAlignmentConfidence !== undefined ? ` (≥ ${s.minAlignmentConfidence.toFixed(2)})` : ''}</td>
                      <td data-label="Validation">{s.validation ? (s.validation.ok ? 'ok' : s.validation.problems.join('; ')) : '—'}</td>
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
