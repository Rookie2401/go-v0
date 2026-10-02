/**
 * Settings → Content: preview mode stays visible (the importers moved to Team Texts on the Home page); the long list of texts (review status, publication state, plain reasons, content-version history from
 * `ingest.history`, bound to `contentHistory` in src/ingest; without it the current version is all that is shown) sits in a
 * collapsed disclosure whose summary carries the count: "Texts on this device (16)".
 */
import { useEffect, useState } from 'react';
import type { Corpus, Text } from '../../../core';
import { useApp } from '../../context';
import { Disclosure } from '../../ui';
import { ImportReport } from './ImportReport';
import { REVIEW_LABEL, formatDate, isTestimonyText, nameOfLang, plainReasons } from '../../format';
import { usePref } from '../../prefs';

export { ImportReport };

/** Who reviewed it and when, from the text's own 'review' record (never invented). */
const reviewNote = (t: Text): string | undefined => (t.transformations ?? []).filter((x) => x.tool === 'review').at(-1)?.description;

/** The versions of one text: "Version 3" and, when the importer recorded them, what each import changed. */
export function VersionHistory({ text }: { text: Text }) {
  const { ingest } = useApp();
  let entries: Array<{ version: number; at: string; summary: string }> = [];
  try { entries = ingest.history?.(text) ?? []; } catch { entries = []; }
  if (entries.length === 0) return <span data-testid="version-current">Version {text.contentVersion}</span>;
  return (
    <details className="versions" data-testid="version-history">
      <summary>Version {text.contentVersion} · {entries.length} {entries.length === 1 ? 'entry' : 'entries'}</summary>
      <ol className="versions__list" aria-label={`Version history of ${text.title}`}>
        {entries.map((e) => (
          <li key={`${e.version}|${e.at}`} data-version={e.version}>
            <strong>Version {e.version}</strong> <span className="faint">{formatDate(e.at)}</span>
            <span className="card__note"> {e.summary}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

/** Why a text is held back, in plain words; the importer's full wording (with how to fix it) one click away. */
function WhyNot({ text }: { text: Text }) {
  if (text.published === true) return <>—</>;
  const raw = text.unpublishedReasons ?? [];
  if (raw.length === 0) return <>Not published.</>;
  const plain = plainReasons(raw);
  const full = raw.join(' ');
  return (
    <>
      {plain.join(' ')}
      {full !== plain.join(' ') && <details className="reasons-full"><summary>How to fix</summary><span className="card__note">{full}</span></details>}
    </>
  );
}

/** Every non-private text on this device, with its corpora; null while loading. */
function useTextRows(refreshKey: unknown): { rows: Text[] | null; corpora: Map<string, Corpus> } {
  const { store } = useApp();
  const [rows, setRows] = useState<Text[] | null>(null);
  const [corpora, setCorpora] = useState<Map<string, Corpus>>(new Map());
  useEffect(() => {
    let live = true;
    void Promise.all([store.texts.all(), store.corpora.all()]).then(([texts, cs]) => {
      if (!live) return;
      const map = new Map(cs.map((c) => [c.id, c]));
      setCorpora(map);
      setRows(texts.filter((t) => !isTestimonyText(t, map)).sort((a, b) => a.lang.localeCompare(b.lang) || a.title.localeCompare(b.title)));
    });
    return () => { live = false; };
  }, [store, refreshKey]);
  return { rows, corpora };
}

function TextTable({ rows, corpora }: { rows: Text[] | null; corpora: Map<string, Corpus> }) {
  if (rows === null) return <p className="muted" role="status">Loading…</p>;
  if (rows.length === 0) return <p className="muted">No texts have been imported yet.</p>;
  return (
    <div className="table-wrap">
      <table className="datatable textlist" aria-label="Texts">
        <thead><tr><th>Text</th><th>Language</th><th>Review</th><th>Published</th><th>Why not</th><th>Version</th></tr></thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} data-text-id={t.id} data-published={t.published === true ? 'yes' : 'no'}>
              <th scope="row" lang={t.lang}>{t.title}<span className="faint"> · {corpora.get(t.corpusId)?.title ?? t.kind}</span></th>
              <td data-label="Language">{nameOfLang(t.lang)}</td>
              <td data-label="Review">{REVIEW_LABEL[t.reviewStatus ?? 'unreviewed'] ?? t.reviewStatus}{reviewNote(t) && <span className="faint"> · {reviewNote(t)}</span>}</td>
              <td data-label="Published">{t.published === true ? 'yes' : 'no'}</td>
              <td data-label="Why not"><WhyNot text={t} /></td>
              <td data-label="Version"><VersionHistory text={t} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Texts on this device (16)": the long table, collapsed. */
export function TextList({ refreshKey }: { refreshKey: unknown }) {
  const { rows, corpora } = useTextRows(refreshKey);
  return (
    <Disclosure headingLevel={3} className="textlist__disclosure" label={rows === null ? 'Texts on this device' : `Texts on this device (${rows.length})`}>
      <TextTable rows={rows} corpora={corpora} />
    </Disclosure>
  );
}

export function ContentSection() {
  const { startup, features } = useApp();
  const [preview, setPreview] = usePref('preview');
  const rejected = (startup?.bundledReport ?? []).filter((d) => d.action === 'rejected');
  return (
    <section aria-label="Content" id="settings-content" data-settings-section="content">
      <h2 className="section-head" tabIndex={-1}>Content</h2>
      <label className="field field--row">
        <span>Preview unreviewed content</span>
        <input type="checkbox" checked={preview} aria-label="Preview unreviewed content" onChange={(e) => setPreview(e.target.checked)} />
      </label>
      <p className="card__note">
        Off by default. When it is on, texts that have not been reviewed or verified are listed (each with the reasons it is held back),{' '}
        {features.listen ? 'placeholder audio is allowed, ' : ''}and a banner says so on every screen. Scripture whose wording has not been verified is never shown unless this is on.
      </p>
      <p className="card__note">To add texts for your team, use Team Texts on the Home page.</p>
      {rejected.length > 0 && (
        <div className="note note--warn" role="alert" data-testid="startup-rejected">
          <p><strong>Some built-in texts were not imported at startup.</strong></p>
          <ImportReport docs={rejected} title="Startup import report" />
        </div>
      )}
      {(startup?.warnings ?? []).length > 0 && <ul className="reasons">{startup!.warnings!.map((w) => <li key={w}>{w}</li>)}</ul>}
      <TextList refreshKey={null} />
    </section>
  );
}
