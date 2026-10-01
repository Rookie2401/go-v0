/**
 * React context exposing the app's services to every component:
 *   { store, bus, adapters, golearn, golisten, gotell, userId, session }
 * plus the active user/course (so components know the target language) and switchers.
 *
 * Components never import engines directly; tests render them inside <AppProvider> with fakes.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { rememberActiveUser } from './prefs';
import { newSession, sittingSession, touchSitting } from './sitting';
import type { AdapterRegistry, AppStore, Course, CourseCatalog, EventBus, GoLearn, GoListen, GoTell, LanguageCode, LexiconSource, ProviderAvailability, Text, User } from '../core';
import type { PlainTextOptions, PlainTextResult } from '../ingest/plaintext';

export { newSession };

/** One validation finding, as the importer UI shows it (path + what is wrong + how to fix it). */
export interface IngestIssueView {
  path: string;
  code: string;
  message: string;
  hint?: string;
  severity: 'error' | 'warning';
}

/** One document in a validation or import report. `action: 'valid'` = checked, nothing written yet. */
export interface ImportDocView {
  id: string;
  title?: string;
  /** Which file it came from (importer UI). */
  file?: string;
  action: 'valid' | 'created' | 'updated' | 'unchanged' | 'rejected';
  contentVersion?: number;
  published?: boolean;
  unpublishedReasons?: string[];
  issues: IngestIssueView[];
  analysisCoverage?: number;
  sentencesAdded?: number;
  sentencesRetired?: number;
  /** Set on a valid document that was rejected only because another document in its batch had errors. */
  note?: string;
}

/** The importer, as the UI sees it (bootstrap binds it to `src/ingest` with the store and adapters). */
export interface IngestApi {
  /** Validate a batch without writing anything. */
  validate(docs: unknown[]): Promise<ImportDocView[]>;
  /** Validate everything, then import all-or-nothing. A batch with one bad document imports nothing. */
  import(docs: unknown[]): Promise<ImportDocView[]>;
  /** Content-version history of a stored text (bootstrap binds it to `contentHistory` in src/ingest). Absent ⇒ only the current version is shown. */
  history?(text: Text): ContentHistoryView[];
  /** The exact text of a book as import documents (a personal copy). Never alters the text; bootstrap binds it to `plainTextToDocuments`. */
  convertPlainText(text: string, opts: PlainTextOptions): PlainTextResult;
}

export interface ContentHistoryView { version: number; at: string; summary: string }

export interface BackupCheckView { ok: boolean; errors: string[]; /** Reported but they do not block a restore. */ warnings?: string[]; summary?: string }
export interface RestoreView { needsRebuild: boolean; summary: string[] }

/** Backup / restore, as the UI sees it (bootstrap binds it to `src/backup` with the store). */
export interface BackupApi {
  /** Returns the JSON-serialisable backup file for one learner. */
  exportLearner(userId: string, opts?: { includeRecordings?: boolean }): Promise<unknown>;
  check(file: unknown): BackupCheckView;
  restore(file: unknown, opts?: { mode?: 'merge' | 'replace' }): Promise<RestoreView>;
}

/** Speech-provider configuration, as the UI sees it (bootstrap binds it to `src/golisten`). */
export interface SpeechApi {
  azure(): { configured: boolean; remembered: boolean; region?: string };
  /** Builds the Azure provider from a key + region supplied now. Persists them only when `remember` is true. */
  configureAzure(input: { key: string; region: string; remember: boolean }): Promise<void>;
  /** Removes remembered credentials and switches the Azure provider off. */
  forgetAzure(): void;
  /**
   * Status of this app's own speech service (the same-origin proxy backed by server-side environment variables; no
   * key ever reaches the browser). undefined = no such service on this deployment. `missing-credentials` carries the
   * instruction to show. Resolves once the startup check has finished.
   */
  proxy?(): Promise<ProviderAvailability | undefined>;
  /** "Check again": after the server's .env.local was fixed and it was restarted. Forgets a remembered auth failure, re-asks, and retries audio jobs that died. */
  recheck?(): Promise<ProviderAvailability | undefined>;
}

export interface StartupInfo {
  /** Report of importing the bundled corpus at startup (undefined when it was skipped as unchanged). */
  bundledReport?: ImportDocView[];
  /** GoLearn rebuilt derived state for the active learner at startup (policy version changed). */
  policyRebuilt?: boolean;
  /** Startup problems that did not stop the app (bundled documents rejected, etc.). */
  warnings?: string[];
}

export interface AppServices {
  store: AppStore;
  bus: EventBus;
  adapters: AdapterRegistry;
  golearn: GoLearn;
  golisten: GoListen;
  gotell: GoTell;
  ingest: IngestApi;
  /** The reading ladder of a course (stages, works, the learner's own copies). A course without a ladder has no stages. */
  catalog: CourseCatalog;
  /** The installed dictionary of a language, or undefined when there is none. Lazy: no request until it is first asked something. */
  lexicon(lang: LanguageCode): LexiconSource | undefined;
  backup: BackupApi;
  speech: SpeechApi;
  startup?: StartupInfo;
}

export interface AppContextValue extends AppServices {
  userId: string;
  /** One per reading SITTING (kept across reloads for 30 minutes of inactivity, see sitting.ts); scopes SentenceViewed dedupe. */
  session: string;
  /**
   * The session id to use for an event emitted NOW: the learner's sitting-stable id, or — if more than 30 minutes have
   * passed since their last activity — a new one (the `session` field above then follows). Emitters of view events call
   * this at emission so a second sitting in a page that stayed open is never deduped into the first.
   */
  currentSession(): string;
  user: User;
  course: Course;
  lang: LanguageCode;
  /** Switch the active learner (loads the user + course rows, starts a new session). */
  selectUser(userId: string): Promise<void>;
  /** Re-read the current user + course rows (after Settings edits them). */
  refreshUser(): Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export interface AppProviderProps {
  services: AppServices;
  user: User;
  course: Course;
  /** Fixed session id (tests); default: the learner's sitting-stable id. */
  session?: string;
  children: ReactNode;
}

export function AppProvider({ services, user: initialUser, course: initialCourse, session: fixedSession, children }: AppProviderProps) {
  const [who, setWho] = useState<{ user: User; course: Course }>({ user: initialUser, course: initialCourse });
  const [session, setSession] = useState(() => fixedSession ?? sittingSession(initialUser.id));
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const { store } = services;

  const load = useCallback(async (userId: string) => {
    const user = await store.users.get(userId);
    if (!user) throw new Error(`unknown user ${userId}`);
    const course = await store.courses.get(user.courseId);
    if (!course) throw new Error(`unknown course ${user.courseId}`);
    // A learner on another course (or a changed team): its ladder goes into the store before the UI shows it. Idempotent;
    // a course without a ladder is a no-op, and a failure here never stops the switch.
    try { await services.catalog.install(course.id); } catch { /* the ladder pages say what is missing */ }
    return { user, course };
  }, [store, services.catalog]);

  const selectUser = useCallback(async (userId: string) => {
    const next = await load(userId);
    // Another learner may have state computed under an older evidence policy: bring it up to date before showing it.
    await services.golearn.ensureCurrent(userId);
    setWho(next);
    rememberActiveUser(userId);
    setSession(fixedSession ?? sittingSession(userId));
  }, [load, services.golearn, fixedSession]);

  const refreshUser = useCallback(async () => {
    setWho(await load(who.user.id));
  }, [load, who.user.id]);

  const activeUserId = who.user.id;
  const currentSession = useCallback((): string => {
    if (fixedSession) return fixedSession;
    const id = sittingSession(activeUserId); // the stored id while the last activity is < 30 min old, else a new one
    if (id !== sessionRef.current) { sessionRef.current = id; setSession(id); }
    return id;
  }, [fixedSession, activeUserId]);

  // Every event appended for this learner is activity: it keeps the sitting (and its session id) alive.
  useEffect(() => services.bus.subscribe((e) => { if (e.userId === activeUserId) touchSitting(activeUserId, currentSession()); }), [services.bus, activeUserId, currentSession]);

  // GoTell can bind itself to one learner (every accessor then asserts ownership): testimony is private.
  const gotell = useMemo<GoTell>(() => {
    const g = services.gotell as GoTell & { forUser?: (userId: string) => GoTell };
    return typeof g.forUser === 'function' ? g.forUser(who.user.id) : services.gotell;
  }, [services.gotell, who.user.id]);

  const value = useMemo<AppContextValue>(() => ({
    ...services,
    gotell,
    userId: who.user.id,
    session,
    currentSession,
    user: who.user,
    course: who.course,
    lang: who.course.lang,
    selectUser,
    refreshUser,
  }), [services, gotell, who, session, currentSession, selectUser, refreshUser]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const v = useContext(AppContext);
  if (!v) throw new Error('useApp() outside <AppProvider>');
  return v;
}
