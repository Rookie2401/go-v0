/**
 * GoRead → Team Texts: the in-app importer for Go text files (`.json`, format version 2). Choose files → validation
 * report with paths and hints → import. Before the validator sees a document, the team's language is checked: a text
 * marked with or written in another language is turned away with a kind sentence, and nothing of that batch imports.
 * (Moved here from Settings → Content.)
 */
import { useId, useState } from 'react';
import type { LanguageCode } from '../../core';
import { documentText, fitsTeamLanguage } from '../../ingest/language';
import { useApp } from '../context';
import type { ImportDocView } from '../context';
import { readFileText } from '../files';
import { ImportReport } from '../pages/settings/ImportReport';
import { errorText } from '../pages/settings/shared';

/** The language verdict on one parsed document, as the report shows it. */
export function teamLanguageIssue(doc: unknown, file: string, team: { lang: LanguageCode; country: string }): ImportDocView | undefined {
  const d = doc && typeof doc === 'object' ? (doc as { id?: unknown; lang?: unknown }) : {};
  const verdict = fitsTeamLanguage(documentText(doc), team, typeof d.lang === 'string' ? d.lang : undefined);
  if (verdict.ok) return undefined;
  return {
    id: typeof d.id === 'string' ? d.id : file, file, action: 'rejected',
    issues: [{ path: 'lang', code: 'not-the-team-language', severity: 'error', message: verdict.message!, hint: `The ${team.country} team's texts are in ${team.lang === 'es' ? 'Spanish' : team.lang === 'de' ? 'German' : team.lang === 'sq' ? 'Albanian' : team.lang === 'th' ? 'Thai' : 'Hindi'}. Choose a text in that language.` }],
  };
}

export function JsonImporter({ onImported }: { onImported(views: ImportDocView[]): void }) {
  const { ingest, course } = useApp();
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
      const failures: ImportDocView[] = [];
      for (const f of files) {
        let parsed: unknown;
        try { parsed = JSON.parse(await readFileText(f)); }
        catch (e) {
          failures.push({
            id: f.name, file: f.name, action: 'rejected',
            issues: [{ path: '$', code: 'invalid-json', severity: 'error', message: `This file is not valid JSON (${errorText(e)}).`, hint: 'Open it in a text editor, or run it through a JSON validator; every text file must be one JSON document (or an array of them).' }],
          });
          continue;
        }
        for (const d of Array.isArray(parsed) ? parsed : [parsed]) {
          // the team's language first: a text in another language is turned away before anything else is checked
          const turnedAway = teamLanguageIssue(d, f.name, { lang: course.lang, country: course.country });
          if (turnedAway) { failures.push(turnedAway); continue; }
          good.push(d); from.push(f.name);
        }
      }
      const checked = good.length > 0 ? await ingest.validate(good) : [];
      const withFiles = checked.map((c, i) => ({ ...c, file: from[i] }));
      setDocs(good); setOrigins(from);
      setReport([...failures, ...withFiles]);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  const hasErrors = (report ?? []).some((d) => d.action === 'rejected' || d.issues.some((i) => i.severity === 'error'));
  const importable = !!report && docs.length > 0 && !hasErrors;

  const run = async () => {
    setBusy(true); setError(null);
    try {
      const done = await ingest.import(docs);
      const views = done.map((d, i) => ({ ...d, file: origins[i] }));
      setResult(views);
      setReport(null); setDocs([]); setOrigins([]);
      onImported(views);
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
