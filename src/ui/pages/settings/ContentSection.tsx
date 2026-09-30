/**
 * Settings → Content: preview mode, the in-app importer (choose .json files → validation report with paths and
 * hints → import) and the list of texts with their review status, publication state and reasons.
 */
import { useCallback, useEffect, useId, useState } from 'react';
import type { Corpus, Text } from '../../../core';
import { useApp } from '../../context';
import type { ImportDocView, IngestIssueView } from '../../context';
import { errorText } from './shared';
import { REVIEW_LABEL, isTestimonyText, nameOfLang } from '../../format';
import { readFileText } from '../../files';
import { usePref } from '../../prefs';

/** A validation / import report: one block per document, every finding with its path and how to fix it. */
export function ImportReport({ docs, title }: { docs: ImportDocView[]; title?: string }) {
  return (
    <div className="import-report" data-testid="import-report" aria-label={title ?? 'Import report'}>
      {docs.map((d, i) => {
        const errors = d.issues.filter((x) => x.severity === 'error');
        return (
          <section key={`${d.id}|${i}`} className={`import-doc import-doc--${d.action}`} data-action={d.action} aria-label={`Document ${d.id}`}>
            <h3 className="import-doc__head">
              <span className="import-doc__id">{d.title ?? d.id}</span>
              {d.file && <span className="faint"> · {d.file}</span>}
              {' '}
              <span className={`chip${d.action === 'rejected' || errors.length > 0 ? ' chip--wine' : ''}`}>{actionLabel(d)}</span>
            </h3>
            {d.note && <p className="card__note" data-testid="import-note">{d.note}</p>}
            {d.published === false && (d.unpublishedReasons ?? []).length > 0 && (
              <p className="card__note">Not published: {(d.unpublishedReasons ?? []).join(' ')}</p>
            )}
            {d.analysisCoverage !== undefined && <p className="card__note">Analysis coverage: {Math.round(d.analysisCoverage * 100)}% of the words have an analysis; the rest show “not analysed yet”.</p>}
            {d.issues.length > 0 && (
              <ul className="issues" aria-label={`Findings for ${d.id}`}>
                {d.issues.map((x, k) => <IssueRow key={k} issue={x} />)}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function actionLabel(d: ImportDocView): string {
  const errors = d.issues.filter((x) => x.severity === 'error').length;
  switch (d.action) {
    case 'valid': return errors > 0 ? `${errors} ${errors === 1 ? 'error' : 'errors'}` : 'valid';
    case 'created': return 'imported (new)';
    case 'updated': return `imported (updated${d.sentencesRetired ? `, ${d.sentencesRetired} sentence(s) retired` : ''})`;
    case 'unchanged': return 'unchanged';
    case 'rejected': return 'rejected';
  }
}

function IssueRow({ issue }: { issue: IngestIssueView }) {
  return (
    <li className={`issue issue--${issue.severity}`} data-severity={issue.severity} data-code={issue.code}>
      <code className="issue__path">{issue.path}</code>
      <span className="issue__msg"> {issue.severity === 'warning' ? 'Warning: ' : ''}{issue.message}</span>
      {issue.hint && <span className="issue__hint card__note"> How to fix: {issue.hint}</span>}
    </li>
  );
}

function Importer({ onImported }: { onImported(): void }) {
  const { ingest } = useApp();
  const inputId = useId();
  const [docs, setDocs] = useState<unknown[]>([]);
  const [origins, setOrigins] = useState<string[]>([]);
  const [report, setReport] = useState<ImportDocView[] | null>(null);
  const [result, setResult] = useState<ImportDocView[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (files: File[]) => {
    setError(null); setResult(null); setReport(null); setDocs([]); setOrigins([]);
    if (files.length === 0) return;
    setBusy(true);
    try {
      const good: unknown[] = [];
      const from: string[] = [];
      const parseFailures: ImportDocView[] = [];
      for (const f of files) {
        let parsed: unknown;
        try { parsed = JSON.parse(await readFileText(f)); }
        catch (e) {
          parseFailures.push({
            id: f.name, file: f.name, action: 'rejected',
            issues: [{ path: '$', code: 'invalid-json', severity: 'error', message: `This file is not valid JSON (${errorText(e)}).`, hint: 'Open it in a text editor, or run it through a JSON validator; every text file must be one JSON document (or an array of them).' }],
          });
          continue;
        }
        for (const d of Array.isArray(parsed) ? parsed : [parsed]) { good.push(d); from.push(f.name); }
      }
      const checked = good.length > 0 ? await ingest.validate(good) : [];
      const withFiles = checked.map((c, i) => ({ ...c, file: from[i] }));
      setDocs(good); setOrigins(from);
      setReport([...parseFailures, ...withFiles]);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  const hasErrors = (report ?? []).some((d) => d.action === 'rejected' || d.issues.some((i) => i.severity === 'error'));
  const importable = !!report && docs.length > 0 && !hasErrors;

  const run = async () => {
    setBusy(true); setError(null);
    try {
      const done = await ingest.import(docs);
      setResult(done.map((d, i) => ({ ...d, file: origins[i] })));
      setReport(null); setDocs([]); setOrigins([]);
      onImported();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  return (
    <div className="importer">
      <h3 className="label">Import texts</h3>
      <p className="card__note">Choose one or more <code>.json</code> text files (format version 2). Everything is checked first; a batch with one bad file imports nothing.</p>
      <label className="field" htmlFor={inputId}>
        <span className="label">Text files</span>
        <input id={inputId} type="file" accept=".json,application/json" multiple aria-label="Choose text files to import" onChange={(e) => { const chosen = [...(e.target.files ?? [])]; e.target.value = ''; void choose(chosen); }} />
      </label>
      {busy && <p className="muted" role="status">Working…</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {report && (
        <>
          <ImportReport docs={report} title="Validation report" />
          {hasErrors
            ? <p className="note note--warn" role="status" data-testid="import-blocked">Nothing was imported. Fix the errors above and choose the files again.</p>
            : <p className="note" role="status">No errors. Warnings do not block the import.</p>}
          {docs.length > 0 && (
            <div className="actions">
              <button type="button" className="btn btn--primary" disabled={!importable || busy} onClick={() => { void run(); }}>
                Import {docs.length} {docs.length === 1 ? 'document' : 'documents'}
              </button>
            </div>
          )}
        </>
      )}
      {result && (
        <>
          <p role="status" className="note" data-testid="import-done">Import finished.</p>
          <ImportReport docs={result} title="Import result" />
        </>
      )}
    </div>
  );
}

/** Who reviewed it and when, from the text's own 'review' record (never invented). */
const reviewNote = (t: Text): string | undefined => (t.transformations ?? []).filter((x) => x.tool === 'review').at(-1)?.description;

export function TextList({ refreshKey }: { refreshKey: unknown }) {
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
  if (rows === null) return <p className="muted" role="status">Loading…</p>;
  if (rows.length === 0) return <p className="muted">No texts have been imported yet.</p>;
  return (
    <div className="table-wrap">
      <table className="datatable textlist" aria-label="Texts">
        <thead><tr><th>Text</th><th>Language</th><th>Review</th><th>Published</th><th>Why not</th></tr></thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} data-text-id={t.id} data-published={t.published === true ? 'yes' : 'no'}>
              <th scope="row" lang={t.lang}>{t.title}<span className="faint"> · {corpora.get(t.corpusId)?.title ?? t.kind}</span></th>
              <td data-label="Language">{nameOfLang(t.lang)}</td>
              <td data-label="Review">{REVIEW_LABEL[t.reviewStatus ?? 'unreviewed'] ?? t.reviewStatus}{reviewNote(t) && <span className="faint"> · {reviewNote(t)}</span>}</td>
              <td data-label="Published">{t.published === true ? 'yes' : 'no'}</td>
              <td data-label="Why not">{t.published === true ? '—' : (t.unpublishedReasons ?? []).join(' ') || 'Not published.'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ContentSection() {
  const { startup } = useApp();
  const [preview, setPreview] = usePref('preview');
  const [tick, setTick] = useState(0);
  const onImported = useCallback(() => setTick((n) => n + 1), []);
  const rejected = (startup?.bundledReport ?? []).filter((d) => d.action === 'rejected');
  return (
    <section aria-label="Content">
      <h2 className="section-head">Content</h2>
      <label className="field field--row">
        <span>Preview unreviewed content</span>
        <input type="checkbox" checked={preview} aria-label="Preview unreviewed content" onChange={(e) => setPreview(e.target.checked)} />
      </label>
      <p className="card__note">
        Off by default. When it is on, texts that have not been reviewed or verified are listed (each with the reasons it is held back),
        placeholder audio is allowed, and a banner says so on every screen. Scripture whose wording has not been verified is never shown unless this is on.
      </p>
      <Importer onImported={onImported} />
      {rejected.length > 0 && (
        <div className="note note--warn" role="alert" data-testid="startup-rejected">
          <p><strong>Some built-in texts were not imported at startup.</strong></p>
          <ImportReport docs={rejected} title="Startup import report" />
        </div>
      )}
      {(startup?.warnings ?? []).length > 0 && <ul className="reasons">{startup!.warnings!.map((w) => <li key={w}>{w}</li>)}</ul>}
      <h3 className="label">Texts on this device</h3>
      <TextList refreshKey={tick} />
    </section>
  );
}
