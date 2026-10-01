import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { bootstrap } from './app/bootstrap';
import type { BootstrapResult } from './app/bootstrap';
import { App } from './ui/App';
import { Gate } from './ui/Onboarding';
import { SandboxBanner } from './ui/SandboxBanner';
import { applyTheme } from './ui/prefs';

// Set the saved theme before the first paint so a dark-mode reader never flashes light paper.
applyTheme();

// One React root per page, even when the dev server hot-reloads this entry module: creating a second root on the same
// container throws inside React ("removeChild … not a child") and can blank the page mid-session.
const container = document.getElementById('root') as HTMLElement & { __goRoot?: ReturnType<typeof createRoot> };
const root = (container.__goRoot ??= createRoot(container));

function Fatal({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <>
      <SandboxBanner />
      <main className="page page--narrow">
        <h1 className="home__title">Go could not start</h1>
        <div className="home__rule" />
        <p role="alert" className="error">{message}</p>
        <p className="card__note">Your data is stored on this device. Reloading usually helps; if not, the error above says what failed.</p>
      </main>
    </>
  );
}

root.render(<><SandboxBanner /><main className="page"><p className="muted" role="status">Opening Go…</p></main></>);

bootstrap().then(
  ({ services, user, course }: BootstrapResult) => {
    root.render(
      <StrictMode>
        <Gate services={services} user={user} course={course}>
          <App />
        </Gate>
      </StrictMode>,
    );
  },
  (error: unknown) => root.render(<Fatal error={error} />),
);
