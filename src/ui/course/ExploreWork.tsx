/**
 * One work in the catalogue pages: title, author, region and era when known, one honest rights line from `rights.state`, and what
 * the learner can do — read it (when texts exist: his own copy, or chapters the library holds) or add his own copy.
 * A work is a recommendation unless texts exist; nothing here implies Go supplies a book.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CatalogText, Text, Work } from '../../core';
import { useApp } from '../context';
import { isVisibleText, textPath } from '../format';
import { usePreview } from '../prefs';
import { Disclosure } from '../ui';
import { libraryChapters } from './catalogue';
import { CopyImporter } from './CopyImporter';
import { chapterLabel } from './WorkCard';
import { pointerOnly, stateRightsLine } from './wording';
import './course.css';

export function ExploreWork({ work, reloadKey, onImported }: { work: Work; reloadKey: number; onImported(): void }) {
  const { catalog, library, lang } = useApp();
  const preview = usePreview();
  const navigate = useNavigate();
  const [stored, setStored] = useState<Text[] | null>(null);
  const [inLibrary, setInLibrary] = useState<CatalogText[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const own = (await catalog.textsOf(work.id)).filter((t) => isVisibleText(t, preview));
      // Chapters the library holds that are not in the store yet: only worth asking when the work says some were ingested.
      const held = work.ingestion === 'ingested' || work.ingestion === 'bundled' ? await libraryChapters(library, lang, work) : [];
      const have = new Set(own.map((t) => t.id));
      if (live) { setStored(own); setInLibrary(held.filter((t) => !have.has(t.id) && (preview || t.published))); }
    })().catch(() => { if (live) { setStored([]); setInLibrary([]); } });
    return () => { live = false; };
  }, [catalog, library, lang, work, preview, reloadKey]);

  const open = async (id: string) => {
    setError(null);
    try { navigate(textPath(await library.open(id))); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const where = [work.region, work.era].filter(Boolean).join(' · ');
  const personal = !!stored && stored.length > 0 && stored.every((t) => t.personalCopy === true);
  // a text written for the course is not something to add a copy of; neither is a work whose source forbids use inside an app
  const copyAllowed = work.rights.state !== 'course-authored' && !pointerOnly(work.rights);
  const teamOwn = !personal && !!stored && stored.length > 0 && stored.every((t) => t.teamText === true);
  const readLabel = stored && stored.length > 0 ? `${personal ? 'Your copy' : teamOwn ? 'Your team’s text' : 'Read'} · ${stored.length} ${stored.length === 1 ? 'chapter' : 'chapters'}` : undefined;

  return (
    <li className="work explore-work" data-work={work.id}>
      <h3 className="work__title">
        <span lang={work.lang}>{work.title}</span>
        {work.author && <span className="work__author" lang={work.lang}> · {work.author}</span>}
      </h3>
      {where && <p className="work__purpose" data-testid="work-where">{where}</p>}
      <p className="work__rights card__note" data-testid="rights-line">{stateRightsLine(work)}</p>
      {work.notes && work.rights.state === 'course-authored' && <p className="card__note">{work.notes}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <div className="work__copy" data-testid="work-actions">
        {readLabel && stored && stored[0] && <Link to={textPath(stored[0])} className="work__copy-link">{readLabel}</Link>}
        {!readLabel && inLibrary.length > 0 && (
          <button type="button" className="btn btn--small" onClick={() => { void open(inLibrary[0].id); }}>
            Read · {inLibrary.length} {inLibrary.length === 1 ? 'chapter' : 'chapters'}
          </button>
        )}
        {stored && stored.length > 1 && (
          <Disclosure label="Chapters" lazy className="work__chapters">
            <ol className="work__chapter-list">
              {stored.map((t) => <li key={t.id}><Link to={textPath(t)} className="work__chapter" lang={t.lang}>{chapterLabel(t)}</Link></li>)}
            </ol>
          </Disclosure>
        )}
      </div>
      {copyAllowed && (
        <Disclosure label={stored && stored.length > 0 ? 'Add or replace your copy' : 'Add your copy'} lazy className="work__add">
          <CopyImporter work={work} onImported={onImported} />
        </Disclosure>
      )}
    </li>
  );
}
