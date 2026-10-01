/**
 * /books — Your Books: the learner's own lawful copies. Add one (a .txt or an unprotected .epub: title, author, file → a
 * preview with what Go noticed in the text → confirm) and read what is already here. Everything is labelled "Your copy" and
 * stays on this device; nothing is uploaded, bundled or shared. Works for any course (the language is the learner's).
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Text } from '../../core';
import { CopyImporter } from '../course/CopyImporter';
import { chapterLabel } from '../course/WorkCard';
import { isVisibleText, textPath } from '../format';
import { useLangTexts } from '../library';
import { usePreview } from '../prefs';
import { BackLink, Disclosure, Topbar } from '../ui';
import '../course/course.css';

const SHOWN = 50;

/** A "book" of the learner's own: the chapters of one source, in chapter order. */
interface Book { key: string; title: string; texts: Text[] }

function groupBooks(texts: Text[]): Book[] {
  const byKey = new Map<string, Text[]>();
  for (const t of texts) { const k = t.workId ?? t.sourceId; byKey.set(k, [...(byKey.get(k) ?? []), t]); }
  return [...byKey.entries()].map(([key, list]): Book => {
    const sorted = [...list].sort((a, b) => (a.chapter?.index ?? 0) - (b.chapter?.index ?? 0) || a.title.localeCompare(b.title));
    // Chapter titles read "<book> — <heading>": the book's own title is what comes before the dash.
    const title = sorted[0].title.split(' — ')[0];
    return { key, title, texts: sorted };
  }).sort((a, b) => a.title.localeCompare(b.title));
}

export function BooksPage() {
  const preview = usePreview();
  const [tick, setTick] = useState(0);
  const { texts: all } = useLangTexts(tick);
  const books = useMemo(() => groupBooks((all ?? []).filter((t) => t.personalCopy === true && isVisibleText(t, preview))), [all, preview]);
  const bar = <Topbar title="Your Books" left={<BackLink to="/" label="Home" />} />;

  return (
    <div>
      {bar}
      <div className="page page--narrow route-fade books">
        <p className="course__intro">Books you own, to read here with the same help as everything else. Your copy stays on this device: it is not uploaded, bundled or shared.</p>
        <Disclosure label="Add a book" headingLevel={2} defaultOpen={books.length === 0} className="books__add">
          <CopyImporter onImported={() => setTick((n) => n + 1)} />
        </Disclosure>

        <h2 className="section-head">On this device</h2>
        {all === null && <p className="muted" role="status">Loading…</p>}
        {all !== null && books.length === 0 && <p className="muted" data-testid="books-empty">No books yet. Add one above.</p>}
        <ul className="list work-list" aria-label="Your books">
          {books.slice(0, SHOWN).map((b) => (
            <li key={b.key} className="work" data-book={b.key}>
              <h3 className="work__title" lang={b.texts[0].lang}>{b.title}</h3>
              <p className="work__copy">
                <Link to={textPath(b.texts[0])} className="work__copy-link">Your copy · {b.texts.length} {b.texts.length === 1 ? 'chapter' : 'chapters'}</Link>
              </p>
              {b.texts.length > 1 && (
                <Disclosure label="Chapters" lazy className="work__chapters">
                  <ol className="work__chapter-list">
                    {b.texts.map((t) => <li key={t.id}><Link to={textPath(t)} className="work__chapter" lang={t.lang}>{chapterLabel(t)}</Link></li>)}
                  </ol>
                </Disclosure>
              )}
            </li>
          ))}
        </ul>
        {books.length > SHOWN && <p className="card__note">Showing the first {SHOWN} of {books.length} books.</p>}
      </div>
    </div>
  );
}
