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

/**
 * Two screens. The first shows the name and one choice: "Select your team". The second lists the five teams, each
 * with its country and the language it learns; choosing one creates the learner and goes on to the app.
 */
export function Onboarding({ store, onChosen }: { store: AppStore; onChosen(user: User, course: Course): void }) {
  const [step, setStep] = useState<'welcome' | 'team'>('welcome');
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = chosen !== null && !error;

  const begin = (courseId: string) => {
    setChosen(courseId); setError(null);
    chooseTeam(store, courseId).then(
      ({ user, course: c }) => onChosen(user, c),
      (e: unknown) => { setChosen(null); setError(e instanceof Error ? e.message : String(e)); },
    );
  };

  return (
    <>
      <SandboxBanner />
      <main className="page page--narrow home onboarding route-fade">
        <h1 className="home__title">Go</h1>
        {step === 'welcome' ? (
          <>
            <p className="home__subtitle">Learn the language of the people you are going to.</p>
            <div className="home__rule" />
            <div className="onboarding__form">
              <button type="button" className="btn btn--primary" onClick={() => setStep('team')}>Select your team</button>
            </div>
          </>
        ) : (
          <>
            <p className="home__subtitle">Which team are you on?</p>
            <div className="home__rule" />
            <ul className="onboarding__teams" aria-label="Teams">
              {COURSES.map((c) => (
                <li key={c.id}>
                  <button
                    type="button" className={`onboarding__team${chosen === c.id ? ' onboarding__team--chosen' : ''}`} aria-label={c.country}
                    disabled={busy} onClick={() => begin(c.id)}
                  >
                    <span className="onboarding__country">{c.country}</span>
                    <span className="onboarding__lang">{languageName(c)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {error && <p role="alert" className="error">{error}</p>}
            {busy && <p className="card__note" role="status" data-testid="preparing">Preparing your texts…</p>}
            {!busy && <button type="button" className="btn btn--quiet onboarding__back" onClick={() => setStep('welcome')}>Back</button>}
          </>
        )}
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
          // The course was chosen only now, after startup: its built-in texts, its reading ladder (if it has one) and its
          // library index go into the store before Home is shown, so the first screen is complete. A failure never blocks the app.
          const ready = services.content ? services.content.ensureCourse(c.id) : services.catalog.install(c.id);
          void ready.then(enter, enter);
        }}
      />
    );
  }
  return <AppProvider services={services} user={who.user} course={who.course}>{children}</AppProvider>;
}
