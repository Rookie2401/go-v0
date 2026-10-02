/** The validation / import report, shared by Settings → Content and the reading-ladder pages. */
import { coverageSentence } from '../../course/wording';
import type { ImportDocView, IngestIssueView } from '../../context';

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
            {d.action === 'valid' && d.published === true && (
              <p className="card__note" data-testid="would-publish">
                {d.personalCopy
                  ? 'Will be readable on this device when imported. It is your own copy: it is not published to anyone else.'
                  : d.teamText
                    ? 'Will be readable on this device when imported. It is your team’s own text: it is not checked by a native speaker unless its review says so, and it is not published beyond your team.'
                    : 'Will be published to learners when imported.'}
              </p>
            )}
            {d.published === false && (d.unpublishedReasons ?? []).length > 0 && (
              <p className="card__note" data-testid={d.action === 'valid' ? 'would-publish' : undefined}>
                {d.action === 'valid' ? 'Will be imported but NOT published to learners yet: ' : 'Not published: '}{(d.unpublishedReasons ?? []).join(' ')}
              </p>
            )}
            {d.analysisCoverage !== undefined && (d.analysisCoverage >= 1
              ? <p className="card__note">{coverageSentence(1)}</p>
              : <p className="card__note">Analysis coverage: {Math.round(d.analysisCoverage * 100)}% of the words have an analysis; the rest show “not analysed yet”.</p>)}
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
