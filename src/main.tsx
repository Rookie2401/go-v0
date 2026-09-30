import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { bootstrap } from './app/bootstrap';
import type { BootstrapResult } from './app/bootstrap';
import { App } from './ui/App';
import { AppProvider } from './ui/context';

const root = createRoot(document.getElementById('root')!);

function Fatal({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <main className="page">
      <h1>Go could not start</h1>
      <p role="alert">{message}</p>
      <p className="muted small">Your data is stored on this device. Reloading usually helps; if not, the error above says what failed.</p>
    </main>
  );
}

root.render(<main className="page"><p className="muted" role="status">Opening Go…</p></main>);

bootstrap().then(
  ({ services, user, course }: BootstrapResult) => {
    root.render(
      <StrictMode>
        <AppProvider services={services} user={user} course={course}>
          <App />
        </AppProvider>
      </StrictMode>,
    );
  },
  (error: unknown) => root.render(<Fatal error={error} />),
);
