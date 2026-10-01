/**
 * First run: "Which team are you on?" — the learner picks a country, which fixes the course and the
 * language they will learn. Choosing creates (or updates) the learner and remembers the choice.
 * Gate wraps the app: until a learner exists it shows this screen, then hands over to the app.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { COURSES } from '../core';
import type { AppStore, Course, User } from '../core';
import { DEFAULT_USER_ID } from './prefs';
import { AppProvider } from './context';
import { languageName } from './format';
import { SandboxBanner } from './SandboxBanner';
import type { AppServices } from './context';
import { recallActiveUser, rememberActiveUser, rememberChosenCourse } from './prefs';


/** Put the choice on disk: the first learner is created, an existing one is pointed at the new course. */
export async function chooseTeam(store: AppStore, courseId: string, now = new Date().toISOString()): Promise<{ user: User; course: Course }> {
  const course = (await store.courses.get(courseId)) ?? COURSES.find((c) => c.id === courseId);
  if (!course) throw new Error(`unknown course ${courseId}`);
  await store.courses.put(course);
  const existing = (await store.users.get(recallActiveUser() ?? DEFAULT_USER_ID)) ?? (await store.users.all())[0];
  const user: User = existing ? { ...existing, courseId } : { id: DEFAULT_USER_ID, displayName: 'Learner', courseId, createdAt: now };
  await store.users.put(user);
  rememberChosenCourse(courseId);
  rememberActiveUser(user.id);
  return { user, course };
}

export function TeamSelect({ value, onChange, label = 'Team', id }: { value: string; onChange: (courseId: string) => void; label?: string; id?: string }) {
  return (
    <select id={id} value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      {COURSES.map((c) => <option key={c.id} value={c.id}>{c.country}</option>)}
    </select>
  );
}

export function Onboarding({ store, onChosen }: { store: AppStore; onChosen(user: User, course: Course): void }) {
  const [courseId, setCourseId] = useState(COURSES[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const course = COURSES.find((c) => c.id === courseId) ?? COURSES[0];

  const begin = () => {
    setBusy(true); setError(null);
    chooseTeam(store, courseId).then(
      ({ user, course: c }) => onChosen(user, c),
      (e: unknown) => { setBusy(false); setError(e instanceof Error ? e.message : String(e)); },
    );
  };

  return (
    <>
      <SandboxBanner />
      <main className="page page--narrow home onboarding route-fade">
        <h1 className="home__title">Go</h1>
        <p className="home__subtitle">Which team are you on?</p>
        <div className="home__rule" />
        <div className="onboarding__form">
          <label className="field">
            <span className="label">Team</span>
            <TeamSelect value={courseId} onChange={setCourseId} label="Team" />
          </label>
          <p className="onboarding__lang" role="status">You will be learning {languageName(course)}</p>
          {error && <p role="alert" className="error">{error}</p>}
          <button type="button" className="btn btn--primary" disabled={busy} onClick={begin}>Begin</button>
        </div>
      </main>
    </>
  );
}

export interface GateProps {
  services: AppServices;
  /** null until a team has been chosen. */
  user: User | null;
  course: Course | null;
  children: ReactNode;
}

export function Gate({ services, user, course, children }: GateProps) {
  const [who, setWho] = useState<{ user: User; course: Course } | null>(user && course ? { user, course } : null);
  if (!who) {
    return (
      <Onboarding
        store={services.store}
        onChosen={(u, c) => {
          const enter = () => {
            setWho({ user: u, course: c });
            if (typeof window !== 'undefined' && window.location.hash) window.location.hash = '#/'; // the app opens on Home
          };
          // The course was chosen only now, after startup: its reading ladder (if it has one) goes into the store
          // before Home is shown, so the ladder door is there on the first screen. A failure never blocks the app.
          void services.catalog.install(c.id).then(enter, enter);
        }}
      />
    );
  }
  return <AppProvider services={services} user={who.user} course={who.course}>{children}</AppProvider>;
}
