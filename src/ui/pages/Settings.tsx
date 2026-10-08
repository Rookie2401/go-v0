/**
 * Settings, in clear sections with an in-page section nav at the top:
 *   You (learner, team) · Reading (highlight, text size, theme) · Backup and recovery · Content (preview toggle, importer,
 *   texts with review status / published / reasons / version history) · Speech (availability first) · Vocabulary ·
 *   Advanced (COLLAPSED: evidence audit and rebuild, audio diagnostics, direct Azure key, development fixture switch,
 *   language-support table).
 * Everything the learner needs day to day — preferences, team, backup — is reachable without opening Advanced.
 */
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { COURSES, LEVEL_ORDER } from '../../core';
import type { Course, GoListenDiagnostics, ItemKind, ItemMarked, LearnerItemState, LearnerLevel, User } from '../../core';
import { useApp, useListening } from '../context';
import { itemSurface, languageName } from '../format';
import { TeamSelect } from '../Onboarding';
import { PractiseButton } from './Practice';
import { FONT_SIZE_RANGE, rememberChosenCourse, usePref } from '../prefs';
import type { ChallengePref, HighlightPref, ThemePref } from '../prefs';
import { BackLink, Disclosure, I, IconBtn, Topbar } from '../ui';
import { BackupSection } from './settings/BackupSection';
import { ContentSection } from './settings/ContentSection';
import { EvidenceSection } from './settings/EvidenceSection';
import { LanguageSupportSection } from './settings/LanguageSupportSection';
import { AdvancedSpeechControls, SpeechSection } from './settings/SpeechSection';
import { TeamSharingSection } from './settings/TeamSharingSection';

/** One sentence whose audio failed for good (GoListen's diagnostics(textId).failedSentences). */
interface FailedSentenceView { sentenceId: string; index: number; text: string; error: string; attempts?: number }

const levelLabel = (l: LearnerLevel) => l.replace(/_/g, ' ');
const levelRank = (l: LearnerLevel) => LEVEL_ORDER.indexOf(l);
/** Learner level → the dot colour Biblia uses for vocabulary status (met → recognised → familiar → known). */
const dotClass = (l: LearnerLevel) => {
  const r = levelRank(l);
  return r >= 7 ? 'known' : r >= 4 ? 'familiar' : r >= 2 ? 'recognized' : 'new';
};

/** The sections, in page order. `id` matches the section's data-settings-section attribute. */
export const SETTINGS_SECTIONS = [
  { id: 'you', label: 'You' },
  { id: 'team-sharing', label: 'Team sharing' },
  { id: 'reading', label: 'Reading' },
  { id: 'backup', label: 'Backup and recovery' },
  { id: 'content', label: 'Content' },
  { id: 'speech', label: 'Speech' },
  { id: 'vocabulary', label: 'Vocabulary' },
  { id: 'advanced', label: 'Advanced' },
] as const;

/** Scroll a section into view and move keyboard focus to its heading. (The page uses hash routing, so plain #anchors would navigate away.) */
function jumpTo(id: string): void {
  const el = document.querySelector<HTMLElement>(`[data-settings-section="${id}"]`);
  if (!el) return;
  el.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  (el.querySelector<HTMLElement>('[tabindex="-1"]') ?? el.querySelector<HTMLElement>('.disclosure__btn'))?.focus({ preventScroll: true });
}

function SectionNav() {
  const { features } = useApp();
  return (
    <nav className="settings__nav" aria-label="Settings sections">
      <ul>
        {SETTINGS_SECTIONS.filter((s) => features.listen || s.id !== 'speech').map((s) => (
          <li key={s.id}>
            <button type="button" className="settings__nav-btn" data-section={s.id} onClick={() => jumpTo(s.id)}>{s.label}</button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Settings() {
  const { user, course, features } = useApp();
  const [speechTick, setSpeechTick] = useState(0);
  return (
    <div>
      <Topbar
        title="Settings"
        left={<BackLink to="/" label="Home" />}
        right={<IconBtn label="Vocabulary" to="/vocabulary">{I.vocab}</IconBtn>}
      />
      <div className="page page--narrow settings route-fade">
        <p className="who label" title={course.title}>{user.displayName} · {course.lang.toUpperCase()}</p>
        <SectionNav />
        <LearnerSection />
        <TeamSharingSection />
        <ReadingSection />
        <BackupSection />
        <ContentSection />
        {features.listen && <SpeechSection refreshKey={speechTick} />}
        <VocabularySection />
        <AdvancedSection onSpeechChanged={() => setSpeechTick((n) => n + 1)} />
      </div>
    </div>
  );
}

export function VocabularyPage() {
  return (
    <div>
      <Topbar title="Vocabulary" left={<BackLink to="/" label="Home" />} right={<IconBtn label="Settings" to="/settings">{I.settings}</IconBtn>} />
      <div className="page page--narrow settings route-fade">
        <VocabularySection collapsed={false} />
      </div>
    </div>
  );
}

function LearnerSection() {
  const { store, user, course, selectUser, refreshUser } = useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const u = await store.users.all();
    setUsers(u.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }, [store]);
  useEffect(() => { void load(); }, [load, user.id]);

  // The team being switched to, from the choice until refreshUser resolves (it installs the course's texts: seconds, not instants).
  const [switching, setSwitching] = useState<Course | null>(null);
  const run = (fn: () => Promise<void>, settled?: () => void) => {
    setError(null);
    fn().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))).finally(settled);
  };

  return (
    <section aria-label="You" id="settings-you" data-settings-section="you">
      <h2 className="section-head" tabIndex={-1}>You</h2>
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
          value={switching?.id ?? course.id}
          onChange={(courseId) => {
            setSwitching(COURSES.find((c) => c.id === courseId) ?? null);
            run(async () => { await store.users.put({ ...user, courseId }); rememberChosenCourse(courseId); await refreshUser(); }, () => setSwitching(null));
          }}
        />
        {switching && <span className="card__note" role="status">Switching to the {switching.country} team…</span>}
        <span className="card__note">You are learning {languageName(course)}. Your progress is kept per language, so switching teams loses nothing.</span>
      </label>
      <form
        className="settings__new"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          run(async () => {
            const id = `u-${Date.now().toString(36)}`;
            // a new learner joins the team chosen above; the team can be changed for them afterwards
            await store.users.put({ id, displayName: name.trim(), courseId: course.id, createdAt: new Date().toISOString() });
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
        <button type="submit" className="btn btn--small" disabled={!name.trim()}>Add learner</button>
      </form>
      <p className="card__note">A new learner joins the {course.country} team. Each learner has their own reading history, vocabulary and testimonies on this device.</p>
    </section>
  );
}

const HIGHLIGHTS: HighlightPref[] = ['off', 'subtle', 'strong'];
const THEMES: ThemePref[] = ['auto', 'light', 'dark'];
/** The three answers to "How hard should suggestions be?", each with what it asks of the learner. */
const CHALLENGES: ReadonlyArray<{ id: ChallengePref; label: string; hint: string }> = [
  { id: 'easy', label: 'easy', hint: 'about 97 % known: very few new words per text' },
  { id: 'steady', label: 'steady', hint: 'about 93 % known (the default)' },
  { id: 'stretch', label: 'stretch', hint: 'about 88 % known: more new words per text' },
];

function ReadingSection() {
  const [highlight, setHighlight] = usePref('highlight');
  const [challenge, setChallenge] = usePref('challenge');
  const [fontSize, setFontSize] = usePref('fontSize');
  const [theme, setTheme] = usePref('theme');
  const sizeId = useId();
  return (
    <section aria-label="Reading" id="settings-reading" data-settings-section="reading">
      <h2 className="section-head" tabIndex={-1}>Reading</h2>
      <div className="field">
        <span className="label">Highlight unfamiliar words</span>
        <div className="segmented" role="group" aria-label="Highlighting">
          {HIGHLIGHTS.map((h) => (
            <button key={h} type="button" aria-pressed={highlight === h} onClick={() => setHighlight(h)}>{h}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="label">How hard should suggestions be?</span>
        <div className="segmented" role="group" aria-label="How hard should suggestions be?">
          {CHALLENGES.map((c) => (
            <button key={c.id} type="button" aria-pressed={challenge === c.id} title={c.hint} onClick={() => setChallenge(c.id)}>{c.label}</button>
          ))}
        </div>
        <p className="card__note" data-testid="challenge-hint">{CHALLENGES.find((c) => c.id === challenge)!.hint}. This only changes which texts are suggested; you can read anything.</p>
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

/**
 * The vocabulary table. In Settings it sits in a collapsed disclosure whose summary carries the count ("Vocabulary table (212 words)");
 * on its own page (/vocabulary) it is shown open.
 */
function VocabularySection({ collapsed = true }: { collapsed?: boolean } = {}) {
  const { store, bus, golearn, userId, lang, session, features } = useApp();
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

  const wordCount = useMemo(() => (rows ?? []).filter((r) => r.lang === lang && r.itemKind === 'form').length, [rows, lang]);

  const table = (
    <>
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
            <thead><tr><th>Word</th><th>Reading</th>{features.listen && <th>Listening</th>}<th>Writing</th><th>Met</th><th>Mark</th><th>Why</th></tr></thead>
            <tbody>
              {visible.slice(0, limit).map((r) => (
                <VocabRow key={r.id} r={r} listen={features.listen} why={why[r.itemId]} onWhy={() => { void explain(r.itemId); }} onMark={(v) => { void mark(r, v); }} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {visible.length > limit && <button type="button" className="btn btn--small btn--quiet" onClick={() => setLimit(limit + 100)}>Show more ({visible.length - limit} left)</button>}
    </>
  );

  return (
    <section aria-label="Vocabulary" id="vocabulary" data-settings-section="vocabulary">
      <h2 className="section-head" tabIndex={-1}>Vocabulary</h2>
      <p className="card__note">Built from what you have actually read{features.listen ? ', heard' : ''} and written. Marking a word only adjusts how it is displayed to you; it never erases the evidence.</p>
      {collapsed
        ? <Disclosure headingLevel={3} className="vocab__disclosure" label={rows === null ? 'Vocabulary table' : `Vocabulary table (${wordCount} ${wordCount === 1 ? 'word' : 'words'})`}>{table}</Disclosure>
        : table}
    </section>
  );
}

/** One vocabulary row; "likely familiar (estimate)" is an estimate and is never shown as known. */
function VocabRow({ r, why, listen, onWhy, onMark }: { r: LearnerItemState; listen: boolean; why?: string; onWhy(): void; onMark(v: 'known' | 'unknown' | 'clear'): void }) {
  const estimate = r.reading.estimatedFamiliar && levelRank(r.reading.level) < levelRank('recognized');
  return (
    <>
      <tr className="vocab__row">
        <th scope="row" lang={r.lang}><span className={`vocab__dot vocab__dot--${dotClass(r.reading.level)}`} aria-hidden="true" />{itemSurface(r.itemId)}</th>
        <td data-label="Reading">{levelLabel(r.reading.level)}{estimate && <span className="faint"> · likely familiar (estimate)</span>}</td>
        {listen && <td data-label="Listening">{levelLabel(r.listening.level)}</td>}
        <td data-label="Writing">{levelLabel(r.writing.level)}</td>
        <td data-label="Met">{r.encounterCount}</td>
        <td>
          <select value={r.manualMark ?? 'clear'} aria-label={`Mark ${itemSurface(r.itemId)}`} onChange={(e) => onMark(e.target.value as 'known' | 'unknown' | 'clear')}>
            <option value="clear">—</option>
            <option value="known">I know it</option>
            <option value="unknown">Still learning</option>
          </select>
        </td>
        <td><button type="button" className="btn btn--small btn--quiet" aria-label={`Why ${itemSurface(r.itemId)}?`} onClick={onWhy}>Why?</button> <PractiseButton itemId={r.itemId} itemKind={r.itemKind} word={itemSurface(r.itemId)} /></td>
      </tr>
      {why && <tr className="vocab__why"><td colSpan={listen ? 7 : 6} className="card__prov" data-testid="vocab-why">{why}</td></tr>}
    </>
  );
}

/**
 * Advanced: collapsed by default, mounted on first open. For checking and repairing, not for everyday use. Nothing here
 * is needed to read, listen or write; everything that used to be on this page is still here.
 */
function AdvancedSection({ onSpeechChanged }: { onSpeechChanged(): void }) {
  const { features } = useApp();
  return (
    <section aria-label="Advanced" id="settings-advanced" data-settings-section="advanced" className="advanced">
      <Disclosure headingLevel={2} lazy label="Advanced" className="advanced__disclosure">
        <p className="card__note">For checking and repairing, not for everyday use: what counts as evidence{features.listen ? ', audio jobs, a directly entered speech key,' : ''} and what each language can honestly do.</p>
        <EvidenceSection />
        {features.listen && <DiagnosticsSection />}
        {features.listen && (
          <section aria-label="Speech: direct key and development">
            <h3 className="subsection-head">Speech: direct key and development</h3>
            <AdvancedSpeechControls onChanged={onSpeechChanged} />
          </section>
        )}
        <LanguageSupportSection />
      </Disclosure>
    </section>
  );
}

function DiagnosticsSection() {
  const { store } = useApp();
  const golisten = useListening(); // GoLearn's listening subsystem (golearn.listening)
  const [diag, setDiag] = useState<GoListenDiagnostics | null>(null);
  const [failed, setFailed] = useState<Array<{ textTitle: string; sentences: FailedSentenceView[] }>>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setDiag(await golisten.diagnostics());
    // Which sentences failed and why (partial generation): ask per text that has a failed segment.
    const segs = (await store.audioSegments.all()).filter((s) => s.status === 'failed');
    const textIds = [...new Set(segs.map((s) => s.textId))].slice(0, 8);
    const out: Array<{ textTitle: string; sentences: FailedSentenceView[] }> = [];
    for (const textId of textIds) {
      const d = (await golisten.diagnostics(textId)) as GoListenDiagnostics & { failedSentences?: FailedSentenceView[] };
      if (d.failedSentences?.length) out.push({ textTitle: (await store.texts.get(textId))?.title ?? textId, sentences: d.failedSentences });
    }
    setFailed(out);
  }, [golisten, store]);
  useEffect(() => { load().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))); }, [load]);

  const run = (label: string, fn: () => Promise<string>) => {
    setError(null); setMessage(`${label}…`);
    fn().then((m) => { setMessage(m); return load(); }).catch((e: unknown) => { setMessage(null); setError(e instanceof Error ? e.message : String(e)); });
  };

  return (
    <section aria-label="GoListen diagnostics">
      <h3 className="subsection-head">Audio diagnostics</h3>
      {error && <p role="alert" className="error">{error}</p>}
      {message && <p role="status" className="note">{message}</p>}
      <div className="actions">
        <button type="button" className="btn btn--small" onClick={() => run('Running audio jobs', async () => `Processed ${await golisten.runJobs()} job(s).`)}>Run pending audio jobs</button>
      </div>
      {!diag ? <p className="muted" role="status">Loading…</p> : (
        <>
          <p className="card__note" data-testid="job-counts">{diag.segments.length} segment(s) · {diag.failedJobs} failed job(s) · {diag.deadJobs} dead job(s)</p>
          {failed.map((f) => (
            <div key={f.textTitle} data-testid="failed-sentences">
              <h4 className="label">Sentences whose audio failed: {f.textTitle}</h4>
              <ul className="reasons" aria-label={`Failed sentences in ${f.textTitle}`}>
                {f.sentences.map((s) => <li key={s.sentenceId}>Sentence {s.index + 1}: <span lang="und">{s.text}</span> — {s.error}{s.attempts ? ` (${s.attempts} attempts)` : ''}</li>)}
              </ul>
              <p className="card__note">The sentences that did get audio can still be played.</p>
            </div>
          ))}
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
