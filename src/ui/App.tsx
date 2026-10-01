/**
 * App shell and HashRouter routes. There is no persistent navigation strip: Home is the doorway
 * (Read · Scripture · My Testimony · Settings · Vocabulary) and every inner page carries its own
 * quiet Topbar with a way back.
 */
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Home } from './pages/Home';
import { Library } from './pages/Library';
import { Settings, VocabularyPage } from './pages/Settings';
import { TextPage } from './pages/TextPage';
import { PreviewBanner } from './PreviewBanner';
import { SandboxBanner } from './SandboxBanner';
import { applyTheme, usePref } from './prefs';
import { Testimony } from './testimony/Testimony';

export function Shell({ children }: { children: ReactNode }) {
  const [theme] = usePref('theme');
  useEffect(() => { applyTheme(theme); }, [theme]);
  return (
    <div className="shell">
      <SandboxBanner />
      <PreviewBanner />
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
      <Route path="/vocabulary" element={<VocabularyPage />} />
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
