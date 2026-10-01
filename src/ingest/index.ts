/**
 * Import pipeline (schema version 2). See docs/IMPORT.md for the document specification and workflow.
 *
 *   validateDocument / validateBatch   -> ValidationIssue[] ({path, code, message, hint, severity})
 *   importDocuments                    -> atomic, repeatable, versioned import; one ImportReport per document
 *   computePublished                   -> the publication gate (published + unpublishedReasons)
 *   applyReview                        -> record a review in a document (pure; the corpus:review CLI wraps it)
 *   contentHistory                     -> the content-version history of a stored Text (from its transformation log)
 *   ingestDocument / ingestAll         -> thin wrappers over importDocuments (throw CorpusValidationError)
 *   loadBundledCorpus                  -> the bundled documents (`data/corpus/<lang>/*.json`)
 *   testimonyDocument                  -> the private-Text document GoTell materializes for a revision
 *   plainTextToDocuments               -> the exact text of a book -> one personal-copy document per chapter
 */
import type { AdapterRegistry, AppStore, Text } from '../core';
import { CorpusValidationError, type CorpusDocument } from './format';
import { importDocuments, type ImportOptions } from './import';

export * from './format';
export { computePublished, contentSignatureOf, type PublicationDecision } from './publish';
export { INGEST_TOOL, IMPORT_ANALYZER, planDocument, collectWordForms, collectUnanalysedForms, dictionaryCandidates, dictionaryView, dictionaryTool, type PlanOptions, type DocumentPlan } from './plan';
export * from './import';
export { plainTextToDocuments, type PlainTextOptions, type PlainTextResult } from './plaintext';
export { epubToDocuments, readEpub, EpubError, type EpubBook, type EpubChapter, type EpubDocumentsResult } from './epub';
export { inspectText, findBoilerplate, looksHardWrapped, QUALITY_VERSION, type QualityOptions, type BoilerplateRange, type QualityFlag, type QualityReport } from './quality';
export { detectHeadings, type Heading } from './headings';
export { contentHistory, describeVersionBump, VERSION_RECORD_PREFIX, type ContentHistoryEntry, type VersionBump } from './history';
export {
  applyReview, isIsoDate, REVIEW_STATUSES, NEEDS_REVIEW_TAG,
  type ReviewOptions, type ReviewRefusal, type ReviewRefusalCode, type ReviewResult,
} from './review';
export * from './testimony';
export * from './migrate';
export { analysisCoverage, type AnalysisCoverage } from '../adapters/shared';

export type IngestOptions = ImportOptions;

/**
 * Import one document and return the stored `Text`. Throws `CorpusValidationError` (nothing written) when the
 * document has validation errors. Thin wrapper over `importDocuments`.
 */
export async function ingestDocument(store: AppStore, registry: AdapterRegistry, doc: CorpusDocument, opts: IngestOptions = {}): Promise<Text> {
  const report = await importDocuments(store, registry, [doc], opts);
  const r = report.documents[0];
  if (r.action === 'rejected') throw new CorpusValidationError(r.id, r.issues);
  return (await store.texts.get(r.textId!))!;
}

/** Import many documents as ONE atomic batch; returns the stored Texts in order. */
export async function ingestAll(store: AppStore, registry: AdapterRegistry, docs: CorpusDocument[], opts: IngestOptions = {}): Promise<Text[]> {
  const report = await importDocuments(store, registry, docs, opts);
  const bad = report.documents.find((d) => d.action === 'rejected' && d.issues.some((i) => i.severity === 'error'));
  if (bad) throw new CorpusValidationError(bad.id, bad.issues);
  const out: Text[] = [];
  for (const r of report.documents) out.push((await store.texts.get(r.textId!))!);
  return out;
}

/** The bundled corpus documents (`data/corpus/<lang>/*.json`), sorted by path for determinism. */
export function loadBundledCorpus(): CorpusDocument[] {
  const modules = import.meta.glob('../../data/corpus/**/*.json', { eager: true, import: 'default' }) as Record<string, CorpusDocument>;
  return Object.keys(modules).sort().map((k) => modules[k]);
}
