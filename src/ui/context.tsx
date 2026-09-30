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

export interface AppServices {
  store: AppStore;
  bus: EventBus;
  adapters: AdapterRegistry;
  golearn: GoLearn;
  golisten: GoListen;
  gotell: GoTell;
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
    setWho(await load(userId));
    rememberActiveUser(userId);
    setSession(newSession());
  }, [load]);

  const refreshUser = useCallback(async () => {
    setWho(await load(who.user.id));
  }, [load, who.user.id]);

  const value = useMemo<AppContextValue>(() => ({
    ...services,
    userId: who.user.id,
    session,
    user: who.user,
    course: who.course,
    lang: who.course.lang,
    selectUser,
    refreshUser,
  }), [services, who, session, selectUser, refreshUser]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const v = useContext(AppContext);
  if (!v) throw new Error('useApp() outside <AppProvider>');
  return v;
}
