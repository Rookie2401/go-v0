/**
 * GoRead → Team Texts (/team-texts): what the team reads. Anyone on this device adds a text here (a Go `.json` text, or a
 * book from a `.txt` / `.epub`) and it joins the shelf of the course's language. There is no server: "the team" is every
 * learner on this device, and what is added stays here. A text in another language is turned away by both importers.
 *
 * The record of what the team added is one `store.meta` row per language, id `goread:<lang>`, whose value is a JSON array of
 * `{ textId, by, at }` (by = the learner's display name, at = ISO time). The list below is that record joined with the texts
 * that still exist.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ids } from '../../core';
import type { AppStore, LanguageCode, Text } from '../../core';
import { CopyImporter } from '../course/CopyImporter';
import { useApp } from '../context';
import type { ImportDocView } from '../context';
import { formatDate, languageName, textPath } from '../format';
import { useLangTexts } from '../library';
import { BackLink, Disclosure, Topbar } from '../ui';
import { JsonImporter } from './JsonImporter';
import '../course/course.css';

/** One line of the record: which text, who added it, when. */
export interface TeamTextEntry { textId: string; by: string; at: string }

/** The `store.meta` row id that holds a language's record. */
export const teamTextsMetaId = (lang: LanguageCode) => `goread:${lang}`;

function parseEntries(value: string | undefined): TeamTextEntry[] {
  if (!value) return [];
  try {
    const raw: unknown = JSON.parse(value);
    if (!Array.isArray(raw)) return [];
    return raw.filter((e): e is TeamTextEntry => !!e && typeof e === 'object'
      && typeof (e as TeamTextEntry).textId === 'string' && typeof (e as TeamTextEntry).by === 'string' && typeof (e as TeamTextEntry).at === 'string');
  } catch { return []; }
}

/** The record of a language, oldest first. */
export async function readTeamTexts(store: Pick<AppStore, 'meta'>, lang: LanguageCode): Promise<TeamTextEntry[]> {
  return parseEntries((await store.meta.get(teamTextsMetaId(lang)))?.value);
}

/**
 * Note that these imported documents are now the team's: one entry per created / updated / unchanged document, de-duplicated
 * by text id (an entry already there keeps its original `by` and `at`). Rejected documents leave no entry.
 */
export async function recordTeamImport(store: Pick<AppStore, 'meta'>, lang: LanguageCode, views: ImportDocView[], by: string, now: string = new Date().toISOString()): Promise<void> {
  const entries = await readTeamTexts(store, lang);
  const known = new Set(entries.map((e) => e.textId));
  let changed = false;
  for (const v of views) {
    if (v.action !== 'created' && v.action !== 'updated' && v.action !== 'unchanged') continue;
    const textId = ids.text(lang, v.id);
    if (known.has(textId)) continue;
    known.add(textId);
    entries.push({ textId, by, at: now });
    changed = true;
  }
  if (!changed) return;
  await store.meta.put({ id: teamTextsMetaId(lang), value: JSON.stringify(entries), updatedAt: now });
}

/** A "book" the team added: the chapters of one source, in chapter order, with who added it first and when. */
interface TeamBook { key: string; title: string; texts: Text[]; by: string; at: string }

function groupBooks(texts: Text[], added: Map<string, TeamTextEntry>): TeamBook[] {
  const byKey = new Map<string, Text[]>();
  for (const t of texts) { const k = t.workId ?? t.sourceId; byKey.set(k, [...(byKey.get(k) ?? []), t]); }
  return [...byKey.entries()].map(([key, list]): TeamBook => {
    const sorted = [...list].sort((a, b) => (a.chapter?.index ?? 0) - (b.chapter?.index ?? 0) || a.title.localeCompare(b.title));
    const first = sorted.map((t) => added.get(t.id)).filter((e): e is TeamTextEntry => !!e).sort((a, b) => a.at.localeCompare(b.at))[0];
    // Chapter titles read "<book> — <heading>": the book's own title is what comes before the dash.
    return { key, title: sorted[0].title.split(' — ')[0], texts: sorted, by: first?.by ?? '', at: first?.at ?? '' };
  }).sort((a, b) => a.title.localeCompare(b.title));
}

export function TeamTextsPage() {
  const { store, user, course, lang } = useApp();
  const [tick, setTick] = useState(0);
  const { texts: all } = useLangTexts(tick);
  const [entries, setEntries] = useState<TeamTextEntry[] | null>(null);
  const [existing, setExisting] = useState<Set<string> | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const rows = await readTeamTexts(store, lang);
      const found = await store.texts.getMany(rows.map((e) => e.textId));
      if (!live) return;
      setEntries(rows);
      setExisting(new Set(rows.filter((_, i) => found[i] !== undefined).map((e) => e.textId)));
    })().catch(() => { if (live) { setEntries([]); setExisting(new Set()); } });
    return () => { live = false; };
  }, [store, lang, tick]);

  const onImported = useCallback((views: ImportDocView[]) => {
    void recordTeamImport(store, lang, views, user.displayName)
      .catch(() => undefined)
      .finally(() => setTick((n) => n + 1));
  }, [store, lang, user.displayName]);

  const loading = all === null || entries === null || existing === null;
  const books = useMemo(() => {
    if (all === null || entries === null || existing === null) return [];
    const added = new Map<string, TeamTextEntry>();
    for (const e of entries) if (existing.has(e.textId)) added.set(e.textId, e);
    return groupBooks(all.filter((t) => t.lang === course.lang && added.has(t.id)), added);
  }, [all, entries, existing, course.lang]);

  return (
    <div>
      <Topbar title="Team Texts" left={<BackLink to="/" label="Home" />} />
      <div className="page page--narrow route-fade team-texts">
        <p className="course__intro">
          What the {course.country} team reads, in {languageName(course)}. Anything added here stays on this device and is shared with every learner on it.
        </p>

        <section aria-label="Add a text">
          <h2 className="section-head">Add a text</h2>
          <JsonImporter onImported={onImported} />
          <Disclosure label="Add a book from a text file" headingLevel={3} lazy className="copy__disclosure">
            <CopyImporter onImported={onImported} />
          </Disclosure>
        </section>

        <section aria-label="Team texts">
          <h2 className="section-head">Team texts</h2>
          {loading && <p className="muted" role="status">Loading…</p>}
          {!loading && books.length === 0 && <p className="muted" data-testid="team-texts-empty">Nothing yet. Add the first text above.</p>}
          <ul className="list work-list" aria-label="Texts added by the team">
            {books.map((b) => (
              <li key={b.key} className="work" data-book={b.key}>
                <h3 className="work__title" lang={b.texts[0].lang}>{b.title}</h3>
                <p className="work__copy">
                  <Link to={textPath(b.texts[0])} className="work__copy-link">{b.texts.length} {b.texts.length === 1 ? 'chapter' : 'chapters'}</Link>
                </p>
                <span className="work__added">Added by {b.by || 'a learner'} · {b.at ? formatDate(b.at) : 'earlier'}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
