/**
 * The parts of Home that only a course with streams has: "Best next reads" (a few texts ranked for THIS learner by
 * `golearn.rankLibrary`, each with its one-line reason and its personal difficulty in words) and the doors into the catalogue.
 * Courses without streams never mount these. Nothing here is a score, a lock or a list of the whole catalogue.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CatalogText, LanguageCode, RankCandidate, RankedText } from '../../core';
import { useApp } from '../context';
import { textPath } from '../format';
import { usePreview } from '../prefs';
import { doorPath, useDoors, streamsOf } from './catalogue';
import type { Door } from './catalogue';
import { DIFFICULTY_WORD } from './wording';
import './course.css';

const BEST_LIMIT = 5;

interface Pick { ranked: RankedText; text: CatalogText }

/** Few dozen at most: a ranking is for a handful of suggestions, never for the catalogue. */
const MAX_CANDIDATES = 40;

/**
 * Candidates from the course's available reading streams, merged fairly and capped before profiling.
 * Unpublished texts only in preview mode. Scripture has its own door.
 */
async function candidatePage(args: { library: ReturnType<typeof useApp>['library']; lang: LanguageCode; alsoLangs?: LanguageCode[]; interests: string[]; streamKeys: Set<string>; preview: boolean }): Promise<CatalogText[]> {
  const { library, lang, alsoLangs, interests, streamKeys, preview } = args;
  const base = { lang, ...(alsoLangs?.length ? { alsoLangs } : {}), publishedOnly: !preview };
  const keys = [...new Set([...interests.filter((i) => streamKeys.has(i)), ...streamKeys])];
  // Short texts remain discoverable even when a stream's first page is a long classic.
  // Length is a sampling tool, never a language-level claim or a reading gate.
  const pages = await Promise.all(keys.flatMap((stream) => [
    library.search({ ...base, stream, maxWords: 300, limit: 20 }),
    library.search({ ...base, stream, limit: MAX_CANDIDATES }),
  ]));
  const seen = new Map<string, CatalogText>();
  // Round-robin representation keeps a large collection from swallowing smaller reading streams.
  for (let i = 0; i < MAX_CANDIDATES && seen.size < MAX_CANDIDATES; i++) {
    for (const p of pages) {
      const t = p.items[i];
      if (t && t.stream !== 'scripture' && !(t.streams ?? []).includes('scripture') && (preview || t.published) && !seen.has(t.id)) seen.set(t.id, t);
      if (seen.size === MAX_CANDIDATES) break;
    }
  }
  return [...seen.values()].slice(0, MAX_CANDIDATES);
}

export function BestNextReads({ onCount }: { onCount?: (shown: number) => void }) {
  const { library, catalog, golearn, userId, user, lang, course } = useApp();
  const preview = usePreview();
  const navigate = useNavigate();
  const [picks, setPicks] = useState<Pick[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const interests = useMemo(() => user.interests ?? [], [user.interests]);

  useEffect(() => {
    let live = true;
    setPicks(null);
    void (async () => {
      await golearn.settled();
      const streams = await streamsOf(catalog, course.id);
      const streamKeys = new Set(streams.filter((s) => s.available && s.kind !== 'scripture' && s.kind !== 'personal' && s.key !== 'listening').map((s) => s.key));
      const items = await candidatePage({ library, lang, alsoLangs: course.readsLangs, interests, streamKeys, preview });
      if (items.length === 0) { if (live) setPicks([]); return; }
      const profiles = await Promise.all(items.map((t) => library.profile(t.id)));
      let read = new Set<string>();
      try { read = new Set([...(await golearn.readingProgressMany(userId, items.map((t) => t.id))).entries()].filter(([, p]) => !!p.finishedAt).map(([id]) => id)); } catch { /* unread is the safe default */ }
      const candidates: RankCandidate[] = [];
      items.forEach((t, i) => {
        const profile = profiles[i];
        if (!profile) return; // a text without a profile cannot be scored, so it is not suggested
        candidates.push({
          profile, workId: t.workId, stream: t.stream, domains: t.domains, variety: t.variety, author: t.author, controlled: t.stream === 'acquisition',
          published: t.published, rights: t.rights, alreadyRead: read.has(t.id),
        });
      });
      if (candidates.length === 0) { if (live) setPicks([]); return; }
      const ranked = await golearn.rankLibrary(userId, candidates, { interests, targetVariety: course.variety?.target, limit: BEST_LIMIT });
      const byId = new Map(items.map((t) => [t.id, t]));
      const out = ranked.slice(0, BEST_LIMIT).flatMap((r) => { const text = byId.get(r.textId); return text ? [{ ranked: r, text }] : []; });
      if (live) setPicks(out);
    })().catch(() => { if (live) setPicks([]); }); // no ranking is not an error the learner can act on: the section simply is not shown
    return () => { live = false; };
  }, [library, catalog, golearn, userId, lang, interests, preview, course.id, course.readsLangs, course.variety?.target]);

  useEffect(() => { if (picks) onCount?.(picks.length); }, [picks, onCount]);

  const open = async (t: CatalogText) => {
    setError(null);
    try { navigate(textPath(await library.open(t.id))); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  if (!picks || picks.length === 0) return null;
  return (
    <section aria-label="Best next reads" data-testid="best-next">
      <h2 className="home__list-divider">Best next reads</h2>
      {error && <p role="alert" className="error">{error}</p>}
      <ul className="home__list best-reads">
        {picks.map(({ ranked, text }) => (
          <li key={text.id} data-text-id={text.id}>
            <button type="button" className="home__entry best-reads__entry" onClick={() => { void open(text); }}>
              <span className="home__entry-body">
                <span className="home__entry-name" lang={text.lang}>{text.title}</span>
                <span className="home__entry-sub">{text.author ? `${text.author} · ` : ''}{DIFFICULTY_WORD[ranked.profile.personal.label]}</span>
                {ranked.reasons[0] && <span className="entry__preview" data-testid="best-reason">{ranked.reasons[0]}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="card__note best-reads__note">These are estimates from what you have read so far. Nothing is locked; read what you like.</p>
    </section>
  );
}

/** The doors into the catalogue, then Your Books. A door with nothing behind it says so plainly instead of hiding. */
export function Doors() {
  const { doors, counts } = useDoors();
  if (doors.length === 0) return null;
  const subOf = (d: Door): string => {
    const n = counts.get(d.key);
    if (n === undefined) return '';
    if (n.texts > 0) return `${n.texts} ${n.texts === 1 ? 'text' : 'texts'}`;
    // Listed works are recommendations: the learner brings his own copy.
    return n.works > 0 ? `${n.works} ${n.works === 1 ? 'book' : 'books'} listed` : 'Nothing here yet';
  };
  return (
    <section aria-label="Explore">
      <h2 className="home__list-divider">Explore</h2>
      <nav className="home__list doors" aria-label="Doors">
        {doors.filter((d) => d.key !== 'bible').map((d) => (
          <Link key={d.key} to={doorPath(d)} className="home__entry door" data-door={d.key}>
            <span className="home__entry-body">
              <span className="home__entry-name">{d.label}</span>
              {d.key === 'your-books'
                ? <span className="home__entry-sub">Your own copies, on this device</span>
                : subOf(d) && <span className="home__entry-sub" data-testid={`door-sub-${d.key}`}>{subOf(d)}</span>}
            </span>
          </Link>
        ))}
      </nav>
      <p className="card__note"><Link to="/explore">Browse by shelf</Link></p>
    </section>
  );
}
