/**
 * /explore and /explore/:door — the catalogue of a course with streams, a page at a time.
 *
 * The shelves are an orientation ("shelves, not locks"): picking one only narrows the list. Works come from `catalog.findWorks`,
 * twenty at a time with Previous / Next, so the page never holds the catalogue; search matches title and author; the other
 * filters (stream, variety, rights) sit behind a quiet disclosure. A door's page (/explore/history) starts from that door's
 * filter. For a course without streams the route goes home.
 */
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { Stage, Work } from '../../core';
import { useApp } from '../context';
import { PAGE_SIZE, doorsFor, fetchWorks, shelvesOf, useStreams } from '../course/catalogue';
import { ExploreWork } from '../course/ExploreWork';
import { RIGHTS_FILTER, VARIETY_FILTER } from '../course/wording';
import { BackLink, Disclosure, Topbar } from '../ui';
import '../course/course.css';

export function ExplorePage() {
  const { catalog, course } = useApp();
  const { door: doorKey } = useParams();
  const streams = useStreams();
  const [shelves, setShelves] = useState<Stage[]>([]);
  const [shelf, setShelf] = useState<string | null>(null);
  const [stream, setStream] = useState('');
  const [variety, setVariety] = useState('');
  const [rights, setRights] = useState('');
  const [draft, setDraft] = useState('');
  const [text, setText] = useState('');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<{ total: number; items: Work[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const doors = useMemo(() => (streams ? doorsFor(course.id, streams) : []), [streams, course.id]);
  const door = doorKey ? doors.find((d) => d.key === doorKey) : undefined;

  useEffect(() => { let live = true; void shelvesOf(catalog, course.id).then((s) => { if (live) setShelves(s); }); return () => { live = false; }; }, [catalog, course.id]);

  // The filters in force: the door's own, then whatever the learner added. A shelf narrows a door that covers several.
  const filters = useMemo(() => {
    const doorStages = door?.stages ?? [];
    const stages = shelf ? (doorStages.length === 0 || doorStages.includes(shelf) ? [shelf] : []) : doorStages;
    return { stream: door?.stream ?? (stream || undefined), domain: door?.domain, variety: variety || undefined, rights: rights || undefined, text: text || undefined, stages };
  }, [door, shelf, stream, variety, rights, text]);
  const emptyByConstruction = !!door?.stages?.length && !!shelf && !door.stages.includes(shelf);

  useEffect(() => {
    let live = true;
    setError(null);
    if (emptyByConstruction) { setPage({ total: 0, items: [] }); return; }
    setPage(null);
    void fetchWorks(catalog, course.id, filters, offset).then((p) => { if (live) setPage(p); }).catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [catalog, course.id, filters, offset, emptyByConstruction, tick]);

  const resetPaging = <T,>(set: (v: T) => void) => (v: T) => { set(v); setOffset(0); };
  const submit = (e: FormEvent) => { e.preventDefault(); setText(draft.trim()); setOffset(0); };

  const title = door ? door.label : 'Explore';
  const bar = <Topbar title={title} left={<BackLink to="/" label="Home" />} />;
  if (streams === null) return <div>{bar}<div className="page page--narrow"><p className="muted" role="status">Loading…</p></div></div>;
  if (streams.length === 0) return <Navigate to="/" replace />;
  if (doorKey && !door) return <Navigate to="/explore" replace />;

  const filtered = !!(text || stream || variety || rights || shelf);
  const first = page && page.total > 0 ? offset + 1 : 0;
  const last = page ? offset + page.items.length : 0;

  return (
    <div>
      {bar}
      <div className="page page--narrow route-fade explore" data-door={door?.key ?? ''}>
        <p className="course__intro">Shelves, not locks: they only help you browse. Everything is open to you, and what suits you now is worked out from what you have read.</p>

        {shelves.length > 0 && (
          <div className="segmented explore__shelves" role="group" aria-label="Shelves">
            <button type="button" aria-pressed={shelf === null} onClick={() => resetPaging(setShelf)(null)}>all</button>
            {shelves.map((s) => (
              <button key={s.id} type="button" aria-pressed={shelf === s.key} title={s.purpose.join('; ')} onClick={() => resetPaging(setShelf)(shelf === s.key ? null : s.key)}>{s.label}</button>
            ))}
          </div>
        )}

        <form className="explore__search" role="search" onSubmit={submit}>
          <label className="field">
            <span className="label">Search by title or author</span>
            <input type="search" value={draft} aria-label="Search the catalogue" onChange={(e) => setDraft(e.target.value)} />
          </label>
          <button type="submit" className="btn btn--small">Search</button>
          {text && <button type="button" className="btn btn--small btn--quiet" onClick={() => { setDraft(''); setText(''); setOffset(0); }}>Clear</button>}
        </form>

        <Disclosure label="Filters" className="explore__filters">
          {!door?.stream && (
            <label className="field">
              <span className="label">Kind of reading</span>
              <select value={stream} aria-label="Stream" onChange={(e) => resetPaging(setStream)(e.target.value)}>
                <option value="">All</option>
                {streams.filter((s) => s.available && s.kind !== 'personal').map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
          )}
          <label className="field">
            <span className="label">Variety of Spanish</span>
            <select value={variety} aria-label="Variety" onChange={(e) => resetPaging(setVariety)(e.target.value)}>
              <option value="">Any</option>
              {VARIETY_FILTER.map((v) => <option key={v.variety} value={v.variety}>{v.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="label">Rights</span>
            <select value={rights} aria-label="Rights" onChange={(e) => resetPaging(setRights)(e.target.value)}>
              <option value="">Any</option>
              {RIGHTS_FILTER.map((r) => <option key={r.state} value={r.state}>{r.label}</option>)}
            </select>
          </label>
        </Disclosure>

        {error && <p role="alert" className="error">Could not load the catalogue: {error}</p>}
        {!page && !error && <p className="muted" role="status">Loading…</p>}
        {page && page.total === 0 && (
          <p className="muted" role="status" data-testid="explore-empty">
            {filtered ? 'No works match these choices.' : 'Nothing here yet. This fills as texts are added.'}
          </p>
        )}
        {page && page.items.length > 0 && (
          <>
            <p className="card__note" data-testid="explore-range">Showing {first}–{last} of {page.total}</p>
            <ul className="list work-list" aria-label="Works">
              {page.items.map((w) => <ExploreWork key={w.id} work={w} reloadKey={tick} onImported={() => setTick((n) => n + 1)} />)}
            </ul>
            <div className="actions explore__pager">
              <button type="button" className="btn btn--small" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Previous</button>
              <button type="button" className="btn btn--small" disabled={offset + PAGE_SIZE >= page.total} onClick={() => setOffset(offset + PAGE_SIZE)}>Next</button>
            </div>
          </>
        )}
        <p className="card__note"><Link to="/books">Your Books</Link> holds your own copies.</p>
      </div>
    </div>
  );
}
