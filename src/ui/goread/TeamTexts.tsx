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
import { createTeamClient } from '../../goread/client';
import { shareableText } from '../../goread/sharing';
import { fetchTeamTexts, shareBook } from '../../goread/sync';
import { CopyImporter } from '../course/CopyImporter';
import { useApp } from '../context';
import type { ImportDocView } from '../context';
import { formatDate, languageName, textPath } from '../format';
import { useLangTexts } from '../library';
import { usePref } from '../prefs';
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

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The server's host for display ("Team server: example.org"); the address as typed when it does not parse. */
function serverHost(address: string): string {
  try { return new URL(address).host || address; } catch { return address; }
}

/** What a fetch or a share said, as one line each. */
interface Outcome { ok: boolean; text: string }
type Verdict = { ok: true } | { ok: false; reason: string };

function shareOutcomes(r: { shared: string[]; alreadyThere?: string[]; refused: Array<{ id: string; reason: string }> }): Outcome[] {
  const out: Outcome[] = [];
  const there = r.alreadyThere?.length ?? 0;
  const line = [r.shared.length > 0 ? 'Shared with the team.' : '', there > 0 ? `${there} already on the team's shelf.` : ''].filter(Boolean).join(' ');
  if (line) out.push({ ok: true, text: line });
  const reasons = [...new Set(r.refused.map((x) => x.reason))];
  if (reasons.length > 0) out.push({ ok: false, text: reasons.join(' ') });
  if (out.length === 0) out.push({ ok: false, text: 'Nothing was shared.' });
  return out;
}

function Outcomes({ list }: { list: Outcome[] | undefined }) {
  if (!list) return null;
  return (
    <>
      {list.map((o, i) => (o.ok
        ? <p key={i} role="status" className="note team-share__result">{o.text}</p>
        : <p key={i} role="alert" className="error team-share__result">{o.text}</p>))}
    </>
  );
}

/** The share control of one book row: a button, or (when the first chapter may not be shared) the reason why. */
function BookShare({ book, verdict, busy, outcome, onShare }: { book: TeamBook; verdict: Verdict | undefined; busy: boolean; outcome: Outcome[] | undefined; onShare(): void }) {
  if (!verdict) return null;
  if (!verdict.ok) return <span className="work__noshare muted">{verdict.reason}</span>;
  return (
    <>
      <button type="button" className="btn btn--small btn--quiet work__share" aria-label={`Share ${book.title} with the team`} disabled={busy} onClick={onShare}>Share</button>
      <Outcomes list={outcome} />
    </>
  );
}

export function TeamTextsPage() {
  const { store, user, course, lang, ingest } = useApp();
  const [tick, setTick] = useState(0);
  const [server] = usePref('teamServer');
  const address = server.trim();
  const [keyPref] = usePref('teamKey');
  const key = keyPref.trim();
  const client = useMemo(() => (address ? createTeamClient({ baseUrl: address, ...(key ? { key } : {}) }) : null), [address, key]);
  /** Adding to the team's shelf needs a contributor key; reading and fetching do not. */
  const canShare = !!client && !!key;
  const [fetching, setFetching] = useState(false);
  const [fetched, setFetched] = useState<Outcome[] | undefined>(undefined);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [shared, setShared] = useState<Record<string, Outcome[]>>({});
  const [sharing, setSharing] = useState<string | null>(null);
  const [offer, setOffer] = useState<{ ids: string[]; outcome?: Outcome[] } | null>(null);
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
    const kept = views.filter((v) => v.action === 'created' || v.action === 'updated' || v.action === 'unchanged').map((v) => ids.text(lang, v.id));
    setOffer(kept.length > 0 ? { ids: kept } : null);
    void recordTeamImport(store, lang, views, user.displayName)
      .catch(() => undefined)
      .finally(() => setTick((n) => n + 1));
  }, [store, lang, user.displayName]);

  const fetchTexts = async () => {
    if (!client) return;
    setFetching(true); setFetched(undefined);
    try {
      const r = await fetchTeamTexts({ client, course: course.id, lang, store, ingest, recordTeamImport });
      const out: Outcome[] = [{ ok: true, text: `${plural(r.imported, 'new text', 'new texts')} fetched, ${r.skipped} already here.` }];
      if (r.failed.length > 0) out.push({ ok: false, text: `${plural(r.failed.length, 'text', 'texts')} could not be added: ${r.failed.map((f) => f.message).join(' ')}` });
      setFetched(out);
    } catch (e) {
      setFetched([{ ok: false, text: errorMessage(e) }]);
    } finally { setFetching(false); setTick((n) => n + 1); }
  };

  const share = async (textIds: string[]): Promise<Outcome[]> => {
    if (!client) return [{ ok: false, text: 'No team server is set.' }];
    try { return shareOutcomes(await shareBook({ client, course: course.id, store, textIds })); }
    catch (e) { return [{ ok: false, text: errorMessage(e) }]; }
  };

  const loading = all === null || entries === null || existing === null;
  const books = useMemo(() => {
    if (all === null || entries === null || existing === null) return [];
    const added = new Map<string, TeamTextEntry>();
    for (const e of entries) if (existing.has(e.textId)) added.set(e.textId, e);
    return groupBooks(all.filter((t) => t.lang === course.lang && added.has(t.id)), added);
  }, [all, entries, existing, course.lang]);

  // Which books may be shared: asked of the first chapter, and only when there is a server to share with.
  useEffect(() => {
    if (!canShare) { setVerdicts({}); return; }
    let live = true;
    void (async () => {
      const next: Record<string, Verdict> = {};
      for (const b of books) {
        try { next[b.key] = await shareableText(store, b.texts[0]); }
        catch (e) { next[b.key] = { ok: false, reason: errorMessage(e) }; }
      }
      if (live) setVerdicts(next);
    })();
    return () => { live = false; };
  }, [canShare, books, store]);

  return (
    <div>
      <Topbar title="Team Texts" left={<BackLink to="/" label="Home" />} />
      <div className="page page--narrow route-fade team-texts">
        <p className="course__intro">
          What the {course.country} team reads, in {languageName(course)}. Anything added here stays on this device and is shared with every learner on it.
        </p>

        {client ? (
          <div className="team-share" data-testid="team-server-line">
            <p className="card__note">Team server: <span className="team-share__host">{serverHost(address)}</span></p>
            <div className="actions">
              <button type="button" className="btn btn--small" disabled={fetching} onClick={() => { void fetchTexts(); }}>{fetching ? 'Fetching…' : 'Fetch team texts'}</button>
            </div>
            <Outcomes list={fetched} />
            {!key && <p className="muted" data-testid="team-no-key">To add texts to the team's shelf you need a contributor key (Settings → Team sharing).</p>}
          </div>
        ) : (
          <p className="muted" data-testid="team-no-server">To share texts with your team on other devices, set a team server in Settings → Team sharing.</p>
        )}

        <section aria-label="Add a text">
          <h2 className="section-head">Add a text</h2>
          <JsonImporter onImported={onImported} />
          <Disclosure label="Add a book from a text file" headingLevel={3} lazy className="copy__disclosure">
            <CopyImporter onImported={onImported} />
          </Disclosure>
          {canShare && offer && (
            <div className="team-share team-share--offer" data-testid="team-share-offer">
              {!offer.outcome?.some((o) => o.ok) && (
                <>
                  <p className="card__note">Share these {plural(offer.ids.length, 'text', 'texts')} with the team?</p>
                  <div className="actions">
                    <button
                      type="button" className="btn btn--small" disabled={sharing === 'offer'}
                      onClick={() => { const sent = offer.ids; setSharing('offer'); void share(sent).then((outcome) => { setOffer({ ids: sent, outcome }); setSharing(null); }); }}
                    >Share with the team</button>
                  </div>
                </>
              )}
              <Outcomes list={offer.outcome} />
            </div>
          )}
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
                {canShare && <BookShare book={b} verdict={verdicts[b.key]} busy={sharing === b.key} outcome={shared[b.key]} onShare={() => {
                  setSharing(b.key); setShared((m) => ({ ...m, [b.key]: [] }));
                  void share(b.texts.map((t) => t.id)).then((outcome) => { setShared((m) => ({ ...m, [b.key]: outcome })); setSharing(null); });
                }} />}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
