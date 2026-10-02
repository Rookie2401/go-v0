/**
 * Add a personal copy: choose a `.txt` (the exact text of a book), an `.epub` (an unprotected one) or a `.json` (import format v2)
 * → check it → read the plain preview (chapters found, what Go noticed in the text, analysis coverage, whether it will be
 * readable) → confirm → import. Nothing is imported without the explicit confirm; "Cancel" leaves the library untouched.
 *
 *  - `.txt` / `.epub` with a work: converted for that work (title, author and shelf come from it).
 *  - `.txt` / `.epub` without a work (Your Books, Settings → Content): asks for a title first.
 *  - A protected EPUB is refused with the reader's own plain message; protection is never removed.
 *  - The preview offers a way to correct what was found (chapter headings; joining wrapped lines; leaving out licence
 *    boilerplate) and to check again — the text itself is never changed by Go, only by choices the learner makes here.
 * The text never leaves the device.
 */
import { useId, useState } from 'react';
import type { LanguageCode, QualityFlag, QualityReport, Work } from '../../core';
import { documentText, fitsTeamLanguage } from '../../ingest/language';
import type { PlainTextOptions, PlainTextResult } from '../../ingest/plaintext';
import { useApp } from '../context';
import type { ImportDocView } from '../context';
import { readFileBytes, readFileText } from '../files';
import { plainReasons } from '../format';
import { Disclosure } from '../ui';
import { ImportReport } from '../pages/settings/ImportReport';
import { errorText } from '../pages/settings/shared';
import { coverageSentence } from './wording';
import './course.css';

export const STAYS_ON_DEVICE = 'This stays on this device. It is not uploaded, bundled or shared.';
const TEAM_WRITTEN = 'Written by your team: it can be shared with the team from Team Texts.';


type Source = { kind: 'text'; text: string } | { kind: 'epub'; bytes: Uint8Array };

interface Choices {
  /** 'auto', 'none', or a pattern the heading lines must match. */
  chapters: 'auto' | 'none' | 'pattern';
  pattern: string;
  unwrap: boolean;
  stripBoilerplate: boolean;
  /** Heading lines the learner turned off (line numbers), when the converter listed them. */
  droppedHeadings: number[];
}
const DEFAULT_CHOICES: Choices = { chapters: 'auto', pattern: '', unwrap: false, stripBoilerplate: false, droppedHeadings: [] };

interface Heading { line: number; text: string }

type Phase =
  | { kind: 'idle' }
  | { kind: 'needs-title'; file: File; source: Source }
  | { kind: 'preview'; source?: Source; docs: unknown[]; notes: string[]; views: ImportDocView[]; fileName: string; fromText: boolean; quality?: QualityReport; headings: Heading[]; titled?: string }
  | { kind: 'done'; views: ImportDocView[] };

const isText = (f: File) => /\.txt$/i.test(f.name) || f.type === 'text/plain';
const isEpub = (f: File) => /\.epub$/i.test(f.name) || f.type === 'application/epub+zip';
const baseName = (n: string) => n.replace(/\.[^.]+$/, '');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The converter's own quality report. */
export const qualityOf = (result: PlainTextResult): QualityReport | undefined => result.quality;

/** The heading lines the converter detected (1-based line numbers), so that they can be corrected. */
const headingsOf = (result: PlainTextResult): Heading[] => (result.headings ?? []).map((h) => ({ line: h.line, text: h.title ?? h.text }));

const FLAG_ADVICE: Partial<Record<QualityFlag['code'], 'unwrap' | 'boilerplate'>> = { 'hard-wrapped-lines': 'unwrap', 'hyphenated-line-breaks': 'unwrap', boilerplate: 'boilerplate' };

export function CopyImporter({ work, onImported }: { work?: Work; onImported(views: ImportDocView[]): void }) {
  const { ingest, lang, course } = useApp();
  const fileId = useId();
  const noteId = useId();
  const titleId = useId();
  const authorId = useId();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [copyNote, setCopyNote] = useState('');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [choices, setChoices] = useState<Choices>(DEFAULT_CHOICES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [writtenBy, setWrittenBy] = useState<'book' | 'team'>('book');
  const whoName = useId();

  const optionsFor = (titleFor: string | undefined, c: Choices): PlainTextOptions => ({
    lang: lang as LanguageCode,
    ...(work ? { work } : { title: titleFor }),
    ...(!work && writtenBy === 'team' ? { ownership: { kind: 'team-authored' as const, by: `the ${course.country} team` } } : {}),
    ...(copyNote.trim() ? { copyNote: copyNote.trim() } : {}),
    ...(!work && author.trim() ? { author: author.trim() } : {}),
    ...(c.chapters === 'none' ? { chapters: 'none' as const } : c.chapters === 'pattern' && c.pattern.trim() ? { chapters: c.pattern.trim() } : {}),
    ...(c.unwrap ? { unwrap: true } : {}),
    ...(c.stripBoilerplate ? { stripBoilerplate: true } : {}),
  });

  /** Validate documents and move to the preview. Nothing is written. */
  const check = async (docs: unknown[], notes: string[], fileName: string, fromText: boolean, extra: { source?: Source; quality?: QualityReport; headings?: Heading[]; titled?: string } = {}) => {
    const views = docs.length > 0 ? await ingest.validate(docs) : [];
    setPhase({ kind: 'preview', docs, notes, views, fileName, fromText, headings: extra.headings ?? [], ...extra });
  };

  const convert = async (source: Source, fileName: string, titleFor: string | undefined, c: Choices) => {
    let opts = optionsFor(titleFor, c);
    if (c.droppedHeadings.length > 0) opts = { ...opts, headings: headingLinesKept(phase, c.droppedHeadings) };
    const converted = source.kind === 'text' ? ingest.convertPlainText(source.text, opts) : await ingest.convertEpub(source.bytes, opts);
    if (source.kind === 'epub') {
      // an EPUB is only readable once converted: the team's language is checked on its chapters' running text
      const verdict = fitsTeamLanguage(converted.documents.map((d) => documentText(d)).join('\n'), { lang: course.lang, country: course.country });
      if (!verdict.ok) { setError(verdict.message!); return; }
    }
    await check(converted.documents, converted.notes, fileName, true, { source, quality: qualityOf(converted), headings: headingsOf(converted), titled: titleFor });
  };

  const choose = async (files: File[]) => {
    setError(null); setPhase({ kind: 'idle' }); setChoices(DEFAULT_CHOICES);
    const file = files[0];
    if (!file) return;
    setBusy(true);
    try {
      if (isEpub(file)) {
        const source: Source = { kind: 'epub', bytes: await readFileBytes(file) };
        if (source.bytes.length === 0) { setError('That file is empty.'); return; }
        if (work) await convert(source, file.name, undefined, DEFAULT_CHOICES);
        else { setTitle(baseName(file.name)); setPhase({ kind: 'needs-title', file, source }); }
        return;
      }
      const text = await readFileText(file);
      if (isText(file)) {
        if (text.trim() === '') { setError('That file is empty.'); return; }
        const verdict = fitsTeamLanguage(text, { lang: course.lang, country: course.country });
        if (!verdict.ok) { setError(verdict.message!); return; }
        const source: Source = { kind: 'text', text };
        if (work) await convert(source, file.name, undefined, DEFAULT_CHOICES);
        else { setTitle(baseName(file.name)); setPhase({ kind: 'needs-title', file, source }); }
      } else {
        let parsed: unknown;
        try { parsed = JSON.parse(text); } catch (e) { setError(`This file is not valid JSON (${errorText(e)}). Choose a .txt or .epub file with the book, or a Go text file in .json format.`); return; }
        const parsedDocs = Array.isArray(parsed) ? parsed : [parsed];
        for (const d of parsedDocs) {
          const declared = d && typeof d === 'object' ? (d as { lang?: unknown }).lang : undefined;
          const verdict = fitsTeamLanguage(documentText(d), { lang: course.lang, country: course.country }, typeof declared === 'string' ? declared : undefined);
          if (!verdict.ok) { setError(verdict.message!); return; }
        }
        await check(parsedDocs, [], file.name, false);
      }
    } catch (e) { setError(`${errorText(e)} Nothing was imported.`); } finally { setBusy(false); }
  };

  const checkTitled = async () => {
    if (phase.kind !== 'needs-title') return;
    if (title.trim() === '') { setError('Give the text a title first.'); return; }
    setBusy(true); setError(null);
    try { await convert(phase.source, phase.file.name, title.trim(), choices); } catch (e) { setError(`${errorText(e)} Nothing was imported.`); } finally { setBusy(false); }
  };

  /** Check again with the choices made in the preview. */
  const recheck = async (c: Choices) => {
    if (phase.kind !== 'preview' || !phase.source) return;
    setBusy(true); setError(null);
    try { await convert(phase.source, phase.fileName, phase.titled, c); } catch (e) { setError(`${errorText(e)} Nothing was imported.`); } finally { setBusy(false); }
  };

  const confirm = async () => {
    if (phase.kind !== 'preview') return;
    setBusy(true); setError(null);
    try {
      const done = await ingest.import(phase.docs);
      setPhase({ kind: 'done', views: done });
      onImported(done);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  const cancel = () => { setPhase({ kind: 'idle' }); setError(null); setTitle(''); setAuthor(''); setChoices(DEFAULT_CHOICES); };

  return (
    <div className="copy" data-testid="copy-importer">
      {/* Said once: here until a preview is showing, and then in the preview. */}
      {phase.kind !== 'preview' && <p className="card__note">{!work && writtenBy === 'team' ? TEAM_WRITTEN : STAYS_ON_DEVICE}</p>}
      {!work && (
        <div className="field copy__who" role="radiogroup" aria-label="Who wrote this?">
          <span className="label" aria-hidden="true">Who wrote this?</span>
          <label>
            <input type="radio" name={whoName} checked={writtenBy === 'book'} onChange={() => setWrittenBy('book')} />{' '}
            A published book — my own copy (stays on this device)
          </label>
          <label>
            <input type="radio" name={whoName} checked={writtenBy === 'team'} onChange={() => setWrittenBy('team')} />{' '}
            Our team or I wrote it (can be shared with the team)
          </label>
        </div>
      )}
      <label className="field" htmlFor={noteId}>
        <span className="label">About your copy (optional)</span>
        <input id={noteId} type="text" value={copyNote} placeholder="for example: my paperback, 12th printing" onChange={(e) => setCopyNote(e.target.value)} />
      </label>
      <label className="field" htmlFor={fileId}>
        <span className="label">{work ? 'Your copy as a file' : 'A file with the book'}</span>
        <input
          id={fileId} type="file" accept=".txt,.epub,.json,text/plain,application/epub+zip,application/json"
          aria-label={work ? `Choose your copy of ${work.title}` : 'Choose a text file with the text of a book'}
          onChange={(e) => { const chosen = [...(e.target.files ?? [])]; e.target.value = ''; void choose(chosen); }}
        />
      </label>
      <p className="card__note">
        A <code>.txt</code> file with the exact text of the book, or an <code>.epub</code> without copy protection, is split into chapters by Go; the words are never changed.
        A <code>.json</code> file must already be in Go&apos;s text format. A protected file is never opened.
      </p>
      {busy && <p className="muted" role="status">Working…</p>}
      {error && <p role="alert" className="error">{error}</p>}

      {phase.kind === 'needs-title' && (
        <div className="copy__title">
          <label className="field" htmlFor={titleId}>
            <span className="label">Title</span>
            <input id={titleId} type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field" htmlFor={authorId}>
            <span className="label">Author (optional)</span>
            <input id={authorId} type="text" value={author} onChange={(e) => setAuthor(e.target.value)} />
          </label>
          <div className="actions">
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => { void checkTitled(); }}>Check this file</button>
            <button type="button" className="btn btn--quiet" onClick={cancel}>Cancel</button>
          </div>
        </div>
      )}

      {phase.kind === 'preview' && (
        <CopyPreview phase={phase} busy={busy} choices={choices} onChoices={setChoices} onRecheck={(c) => { void recheck(c); }} onConfirm={() => { void confirm(); }} onCancel={cancel} />
      )}

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

/** The heading lines to keep when the learner has turned some off: every listed heading except those. */
function headingLinesKept(phase: Phase, dropped: number[]): number[] {
  const all = phase.kind === 'preview' ? phase.headings.map((h) => h.line) : [];
  return all.filter((l) => !dropped.includes(l));
}

function doneLine(views: ImportDocView[]): string {
  const written = views.filter((v) => v.action === 'created' || v.action === 'updated').length;
  const same = views.filter((v) => v.action === 'unchanged').length;
  const bad = views.filter((v) => v.action === 'rejected').length;
  if (bad > 0) return `Nothing was imported: ${plural(bad, 'document was', 'documents were')} rejected.`;
  if (written === 0 && same > 0) return 'Nothing changed: this copy was already on this device.';
  return `Imported ${plural(written, 'chapter', 'chapters')}.${same > 0 ? ` ${plural(same, 'chapter was', 'chapters were')} already here.` : ''}`;
}

const VERDICT_LINE: Record<QualityReport['verdict'], string> = {
  clean: 'Nothing wrong was found in the text.',
  usable: 'The text is usable. A few things are worth knowing.',
  damaged: 'This text looks damaged. You can still import it, and the decision is yours, but look at what is listed first. Go has changed nothing.',
};
const SEVERITY_WORD: Record<QualityFlag['severity'], string> = { info: 'note', warning: 'warning', serious: 'serious' };

function QualityBlock({ quality }: { quality: QualityReport }) {
  return (
    <section className="copy__quality" aria-label="What Go noticed in the text" data-testid="copy-quality" data-verdict={quality.verdict}>
      <p className={quality.verdict === 'damaged' ? 'note note--warn' : 'card__note'} data-testid="copy-quality-verdict">{VERDICT_LINE[quality.verdict]}</p>
      {quality.flags.length > 0 && (
        <ul className="reasons" aria-label="Findings about the text">
          {quality.flags.map((f) => (
            <li key={f.code} data-code={f.code} data-severity={f.severity}>
              <strong>{SEVERITY_WORD[f.severity]}:</strong> {f.message}{f.count > 1 ? ` (${f.count} places)` : ''}
              {f.sample && <> <span className="faint">for example “{f.sample}”</span></>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CopyPreview({ phase, busy, choices, onChoices, onRecheck, onConfirm, onCancel }: {
  phase: Extract<Phase, { kind: 'preview' }>; busy: boolean; choices: Choices; onChoices(c: Choices): void; onRecheck(c: Choices): void; onConfirm(): void; onCancel(): void;
}) {
  const { views, notes, fromText, quality, headings } = phase;
  const errors = views.reduce((n, v) => n + v.issues.filter((i) => i.severity === 'error').length, 0);
  const warnings = views.reduce((n, v) => n + v.issues.filter((i) => i.severity === 'warning').length, 0);
  const covered = views.filter((v) => v.analysisCoverage !== undefined);
  const coverage = covered.length > 0 ? Math.round((covered.reduce((s, v) => s + (v.analysisCoverage ?? 0), 0) / covered.length) * 100) : undefined;
  const allCovered = covered.length > 0 && covered.every((v) => (v.analysisCoverage ?? 0) >= 1);
  const held = views.filter((v) => v.published === false);
  const n = views.length;
  const blocked = n === 0 || errors > 0 || views.some((v) => v.action === 'rejected');
  const canCorrect = !!phase.source;
  // a text the team wrote (source.rights 'owner-authored') is not "kept on this device only"
  const teamWritten = fromText && phase.docs.length > 0 && phase.docs.every((d) => (d as { source?: { rights?: unknown } } | null)?.source?.rights === 'owner-authored');
  const advice = new Set((quality?.flags ?? []).map((f) => FLAG_ADVICE[f.code]).filter(Boolean));

  let readable: string;
  if (n === 0) readable = 'No: nothing was found to import.';
  else if (blocked) readable = 'No: fix the problems first.';
  else if (held.length === 0) readable = 'Yes, once imported.';
  else readable = `Imported, but held back for now: ${plainReasons(held.flatMap((v) => v.unpublishedReasons ?? [])).join(' ') || 'not published yet.'}`;

  const set = (patch: Partial<Choices>) => onChoices({ ...choices, ...patch });

  return (
    <section className="copy__preview" aria-label="Preview of what will be imported" data-testid="copy-preview">
      <p className="note">{teamWritten ? TEAM_WRITTEN : STAYS_ON_DEVICE}</p>
      <dl className="copy__facts">
        <div><dt>File</dt><dd>{phase.fileName}</dd></div>
        <div><dt>{fromText ? 'Chapters found' : 'Documents'}</dt><dd data-testid="copy-count">{n}</dd></div>
        <div><dt>Problems</dt><dd data-testid="copy-problems">{errors === 0 && warnings === 0 ? 'none' : `${plural(errors, 'error', 'errors')}, ${plural(warnings, 'warning', 'warnings')}`}</dd></div>
        <div><dt>Words with help</dt><dd data-testid="copy-coverage">{coverage === undefined ? 'not measured' : coverageSentence(allCovered ? 1 : Math.min(coverage / 100, 0.99))}</dd></div>
        <div><dt>Readable on this device</dt><dd data-testid="copy-readable">{readable}</dd></div>
      </dl>
      {quality && <QualityBlock quality={quality} />}
      {notes.length > 0 && <ul className="reasons" aria-label="What Go recognised" data-testid="copy-notes">{notes.map((t) => <li key={t}>{t}</li>)}</ul>}

      {canCorrect && phase.source?.kind === 'text' && (
        <Disclosure label="Correct the chapters or the lines" className="copy__correct" defaultOpen={quality?.verdict === 'damaged' || quality?.flags.some((f) => f.code === 'no-chapters-found')}>
          <div data-testid="copy-correct">
            <label className="field">
              <span className="label">Chapters</span>
              <select value={choices.chapters} aria-label="How chapters are found" onChange={(e) => set({ chapters: e.target.value as Choices['chapters'] })}>
                <option value="auto">Find chapter headings automatically</option>
                <option value="none">One chapter only</option>
                <option value="pattern">Headings that match a pattern</option>
              </select>
            </label>
            {choices.chapters === 'pattern' && (
              <label className="field">
                <span className="label">Pattern for a heading line</span>
                <input type="text" value={choices.pattern} aria-label="Pattern for chapter headings" placeholder="for example: PARTE \w+" onChange={(e) => set({ pattern: e.target.value })} />
              </label>
            )}
            {headings.length > 0 && (
              <fieldset className="copy__headings">
                <legend className="label">Lines taken as chapter headings</legend>
                <ul className="plain">
                  {headings.map((h) => (
                    <li key={h.line}>
                      <label>
                        <input
                          type="checkbox" checked={!choices.droppedHeadings.includes(h.line)} aria-label={`Heading on line ${h.line}: ${h.text}`}
                          onChange={(e) => set({ droppedHeadings: e.target.checked ? choices.droppedHeadings.filter((l) => l !== h.line) : [...choices.droppedHeadings, h.line] })}
                        />{' '}
                        <span className="faint">line {h.line}</span> {h.text}
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}
            {advice.has('unwrap') && (
              <label className="field field--row"><span>Join lines that were wrapped by the file</span>
                <input type="checkbox" checked={choices.unwrap} aria-label="Join wrapped lines" onChange={(e) => set({ unwrap: e.target.checked })} />
              </label>
            )}
            {advice.has('boilerplate') && (
              <label className="field field--row"><span>Leave out licence and title-page text that is not the book</span>
                <input type="checkbox" checked={choices.stripBoilerplate} aria-label="Leave out boilerplate" onChange={(e) => set({ stripBoilerplate: e.target.checked })} />
              </label>
            )}
            <div className="actions">
              <button type="button" className="btn btn--small" disabled={busy} onClick={() => onRecheck(choices)}>Check again</button>
            </div>
            <p className="card__note">These choices only decide how the file is cut up. They never change the words.</p>
          </div>
        </Disclosure>
      )}

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
