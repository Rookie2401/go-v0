/** App shell: navigation (Home · Read · Scripture · My Testimony · Settings) and HashRouter routes. */
import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useApp } from './context';
import { Home } from './pages/Home';
import { Library } from './pages/Library';
import { Settings } from './pages/Settings';
import { TextPage } from './pages/TextPage';
import { Testimony } from './testimony/Testimony';

const NAV: Array<{ to: string; label: string; end?: boolean }> = [
  { to: '/', label: 'Home', end: true },
  { to: '/read', label: 'Read' },
  { to: '/scripture', label: 'Scripture' },
  { to: '/testimony', label: 'My Testimony' },
  { to: '/settings', label: 'Settings' },
];

export function Shell({ children }: { children: ReactNode }) {
  const { user, course } = useApp();
  return (
    <div className="shell">
      <header className="topbar">
        <nav aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>{n.label}</NavLink>
          ))}
        </nav>
        <span className="who muted small" title={course.title}>{user.displayName} · {course.lang.toUpperCase()}</span>
      </header>
      <main>{children}</main>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/read" element={<Library mode="corpus" />} />
      <Route path="/read/:textId" element={<TextPage mode="corpus" />} />
      <Route path="/scripture" element={<Library mode="scripture" />} />
      <Route path="/scripture/:textId" element={<TextPage mode="scripture" />} />
      <Route path="/testimony" element={<Testimony />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <HashRouter>
      <Shell><AppRoutes /></Shell>
    </HashRouter>
  );
}
