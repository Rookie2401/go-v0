/**
 * Add a personal copy: choose a `.txt` (the exact text of a book) or a `.json` (import format v2) → check it → read the plain
 * preview → confirm → import. Nothing is imported without the explicit confirm; "Cancel" leaves the library untouched.
 *
 *  - `.txt` with a work: `ingest.convertPlainText(text, { lang, work, copyNote })` (title, author and stage come from the work).
 *  - `.txt` without a work (Settings → Content): asks for a title first.
 *  - `.json`: the documents as they are.
 * Either way the documents go through `ingest.validate` first and the preview says what was found, what is wrong, how much of
 * the text has word help, and whether it will be readable. The text never leaves the device.
 */
import { useId, useState } from 'react';
import type { Work } from '../../core';
import { useApp } from '../context';
import type { ImportDocView } from '../context';
import { readFileText } from '../files';
import { plainReasons } from '../format';
import { Disclosure } from '../ui';
import { ImportReport } from '../pages/settings/ImportReport';
import { errorText } from '../pages/settings/shared';
import { coverageSentence } from './wording';
import './course.css';

export const STAYS_ON_DEVICE = 'This stays on this device. It is not uploaded, bundled or shared.';

type Phase =
  | { kind: 'idle' }
  | { kind: 'needs-title'; file: File; text: string }
  | { kind: 'preview'; docs: unknown[]; notes: string[]; views: ImportDocView[]; fileName: string; fromText: boolean }
  | { kind: 'done'; views: ImportDocView[] };

const isText = (f: File) => /\.txt$/i.test(f.name) || f.type === 'text/plain';
const baseName = (n: string) => n.replace(/\.[^.]+$/, '');

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function CopyImporter({ work, onImported }: { work?: Work; onImported(): void }) {
  const { ingest, lang } = useApp();
  const fileId = useId();
  const noteId = useId();
  const titleId = useId();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [copyNote, setCopyNote] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Validate documents and move to the preview. Nothing is written. */
  const check = async (docs: unknown[], notes: string[], fileName: string, fromText: boolean) => {
    const views = docs.length > 0 ? await ingest.validate(docs) : [];
    setPhase({ kind: 'preview', docs, notes, views, fileName, fromText });
  };

  const convert = async (text: string, fileName: string, titleFor?: string) => {
    if (text.trim() === '') { setError('That file is empty.'); return; }
    const converted = ingest.convertPlainText(text, {
      lang,
      ...(work ? { work } : { title: titleFor }),
      ...(copyNote.trim() ? { copyNote: copyNote.trim() } : {}),
    });
    await check(converted.documents, converted.notes, fileName, true);
  };

  const choose = async (files: File[]) => {
    setError(null); setPhase({ kind: 'idle' });
    const file = files[0];
    if (!file) return;
    setBusy(true);
    try {
      const text = await readFileText(file);
      if (isText(file)) {
        if (work) await convert(text, file.name);
        else { setTitle(baseName(file.name)); setPhase({ kind: 'needs-title', file, text }); }
      } else {
        let parsed: unknown;
        try { parsed = JSON.parse(text); } catch (e) { setError(`This file is not valid JSON (${errorText(e)}). Choose a .txt file with the text of the book, or a Go text file in .json format.`); return; }
        await check(Array.isArray(parsed) ? parsed : [parsed], [], file.name, false);
      }
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  const checkTitled = async () => {
    if (phase.kind !== 'needs-title') return;
    if (title.trim() === '') { setError('Give the text a title first.'); return; }
    setBusy(true); setError(null);
    try { await convert(phase.text, phase.file.name, title.trim()); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  const confirm = async () => {
    if (phase.kind !== 'preview') return;
    setBusy(true); setError(null);
    try {
      const done = await ingest.import(phase.docs);
      setPhase({ kind: 'done', views: done });
      onImported();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  const cancel = () => { setPhase({ kind: 'idle' }); setError(null); setTitle(''); };

  return (
    <div className="copy" data-testid="copy-importer">
      {/* Said once: here until a preview is showing, and then in the preview. */}
      {phase.kind !== 'preview' && <p className="card__note">{STAYS_ON_DEVICE}</p>}
      <label className="field" htmlFor={noteId}>
        <span className="label">About your copy (optional)</span>
        <input id={noteId} type="text" value={copyNote} placeholder="for example: my paperback, 12th printing" onChange={(e) => setCopyNote(e.target.value)} />
      </label>
      <label className="field" htmlFor={fileId}>
        <span className="label">{work ? 'Your copy as a file' : 'A text file'}</span>
        <input
          id={fileId} type="file" accept=".txt,.json,text/plain,application/json"
          aria-label={work ? `Choose your copy of ${work.title}` : 'Choose a text file with the text of a book'}
          onChange={(e) => { const chosen = [...(e.target.files ?? [])]; e.target.value = ''; void choose(chosen); }}
        />
      </label>
      <p className="card__note">A <code>.txt</code> file with the exact text of the book is split into chapters by Go; the words are never changed. A <code>.json</code> file must already be in Go&apos;s text format.</p>
      {busy && <p className="muted" role="status">Working…</p>}
      {error && <p role="alert" className="error">{error}</p>}

      {phase.kind === 'needs-title' && (
        <div className="copy__title">
          <label className="field" htmlFor={titleId}>
            <span className="label">Title</span>
            <input id={titleId} type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="actions">
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => { void checkTitled(); }}>Check this file</button>
            <button type="button" className="btn btn--quiet" onClick={cancel}>Cancel</button>
          </div>
        </div>
      )}

      {phase.kind === 'preview' && <CopyPreview phase={phase} busy={busy} onConfirm={() => { void confirm(); }} onCancel={cancel} />}

      {phase.kind === 'done' && (
        <>
          <p role="status" className="note" data-testid="copy-done">
            {doneLine(phase.views)}
          </p>
          <ImportReport docs={phase.views} title="Import result" />
        </>
      )}
    </div>
  );
}

function doneLine(views: ImportDocView[]): string {
  const written = views.filter((v) => v.action === 'created' || v.action === 'updated').length;
  const same = views.filter((v) => v.action === 'unchanged').length;
  const bad = views.filter((v) => v.action === 'rejected').length;
  if (bad > 0) return `Nothing was imported: ${plural(bad, 'document was', 'documents were')} rejected.`;
  if (written === 0 && same > 0) return 'Nothing changed: this copy was already on this device.';
  return `Imported ${plural(written, 'chapter', 'chapters')}.${same > 0 ? ` ${plural(same, 'chapter was', 'chapters were')} already here.` : ''}`;
}

function CopyPreview({ phase, busy, onConfirm, onCancel }: {
  phase: Extract<Phase, { kind: 'preview' }>; busy: boolean; onConfirm(): void; onCancel(): void;
}) {
  const { views, notes, fromText } = phase;
  const errors = views.reduce((n, v) => n + v.issues.filter((i) => i.severity === 'error').length, 0);
  const warnings = views.reduce((n, v) => n + v.issues.filter((i) => i.severity === 'warning').length, 0);
  const covered = views.filter((v) => v.analysisCoverage !== undefined);
  const coverage = covered.length > 0 ? Math.round((covered.reduce((s, v) => s + (v.analysisCoverage ?? 0), 0) / covered.length) * 100) : undefined;
  const held = views.filter((v) => v.published === false);
  const allCovered = covered.length > 0 && covered.every((v) => (v.analysisCoverage ?? 0) >= 1);
  const n = views.length;
  const blocked = n === 0 || errors > 0 || views.some((v) => v.action === 'rejected');

  let readable: string;
  if (n === 0) readable = 'No: nothing was found to import.';
  else if (blocked) readable = 'No: fix the problems first.';
  else if (held.length === 0) readable = 'Yes, once imported.';
  else readable = `Imported, but held back for now: ${plainReasons(held.flatMap((v) => v.unpublishedReasons ?? [])).join(' ') || 'not published yet.'}`;

  return (
    <section className="copy__preview" aria-label="Preview of what will be imported" data-testid="copy-preview">
      <p className="note">{STAYS_ON_DEVICE}</p>
      <dl className="copy__facts">
        <div><dt>File</dt><dd>{phase.fileName}</dd></div>
        <div><dt>{fromText ? 'Chapters found' : 'Documents'}</dt><dd data-testid="copy-count">{n}</dd></div>
        <div><dt>Problems</dt><dd data-testid="copy-problems">{errors === 0 && warnings === 0 ? 'none' : `${plural(errors, 'error', 'errors')}, ${plural(warnings, 'warning', 'warnings')}`}</dd></div>
        <div><dt>Words with help</dt><dd data-testid="copy-coverage">{coverage === undefined ? 'not measured' : coverageSentence(allCovered ? 1 : Math.min(coverage / 100, 0.99))}</dd></div>
        <div><dt>Readable on this device</dt><dd data-testid="copy-readable">{readable}</dd></div>
      </dl>
      {notes.length > 0 && <ul className="reasons" aria-label="What Go recognised" data-testid="copy-notes">{notes.map((t) => <li key={t}>{t}</li>)}</ul>}
      {n > 0 && (
        <Disclosure label={fromText ? 'Chapter by chapter' : 'Document by document'} defaultOpen={errors > 0} className="copy__report">
          <ImportReport docs={views} title="Validation report" />
        </Disclosure>
      )}
      <div className="actions">
        <button type="button" className="btn btn--primary" disabled={blocked || busy} onClick={onConfirm}>
          Import {n} {fromText ? (n === 1 ? 'chapter' : 'chapters') : (n === 1 ? 'document' : 'documents')}
        </button>
        <button type="button" className="btn btn--quiet" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
      {blocked && n > 0 && <p className="note note--warn" role="status" data-testid="copy-blocked">Nothing will be imported until the problems above are fixed.</p>}
    </section>
  );
}
