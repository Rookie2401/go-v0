/**
 * React context exposing the app's services to every component:
 *   { store, bus, adapters, golearn, golisten, gotell, userId, session }
 * plus the active user/course (so components know the target language) and switchers.
 *
 * Components never import engines directly; tests render them inside <AppProvider> with fakes.
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { rememberActiveUser } from './prefs';
import type { AdapterRegistry, AppStore, Course, EventBus, GoLearn, GoListen, GoTell, LanguageCode, User } from '../core';

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
}

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
  backup: BackupApi;
  speech: SpeechApi;
  startup?: StartupInfo;
}

export interface AppContextValue extends AppServices {
  userId: string;
  /** One per reading sitting / app load / user switch; scopes SentenceViewed dedupe. */
  session: string;
  user: User;
  course: Course;
  lang: LanguageCode;
  /** Switch the active learner (loads the user + course rows, starts a new session). */
  selectUser(userId: string): Promise<void>;
  /** Re-read the current user + course rows (after Settings edits them). */
  refreshUser(): Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function newSession(): string {
  return `ses:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

export interface AppProviderProps {
  services: AppServices;
  user: User;
  course: Course;
  /** Fixed session id (tests); default: a fresh one. */
  session?: string;
  children: ReactNode;
}

export function AppProvider({ services, user: initialUser, course: initialCourse, session: fixedSession, children }: AppProviderProps) {
  const [who, setWho] = useState<{ user: User; course: Course }>({ user: initialUser, course: initialCourse });
  const [session, setSession] = useState(fixedSession ?? newSession());
  const { store } = services;

  const load = useCallback(async (userId: string) => {
    const user = await store.users.get(userId);
    if (!user) throw new Error(`unknown user ${userId}`);
    const course = await store.courses.get(user.courseId);
    if (!course) throw new Error(`unknown course ${user.courseId}`);
    return { user, course };
  }, [store]);

  const selectUser = useCallback(async (userId: string) => {
    const next = await load(userId);
    // Another learner may have state computed under an older evidence policy: bring it up to date before showing it.
    await services.golearn.ensureCurrent(userId);
    setWho(next);
    rememberActiveUser(userId);
    setSession(newSession());
  }, [load, services.golearn]);

  const refreshUser = useCallback(async () => {
    setWho(await load(who.user.id));
  }, [load, who.user.id]);

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
    user: who.user,
    course: who.course,
    lang: who.course.lang,
    selectUser,
    refreshUser,
  }), [services, gotell, who, session, selectUser, refreshUser]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const v = useContext(AppContext);
  if (!v) throw new Error('useApp() outside <AppProvider>');
  return v;
}
