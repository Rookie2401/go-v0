/**
 * The light document check of the GoRead server (contract: docs/goread/BACKEND.md, "Two runtimes, one handler").
 *
 * Cheap enough for a Cloudflare Worker (a few ms of CPU): the document's shape and required fields written by hand,
 * its size, id, `lang`, the rights table (generated included, and the verification rule), and the language gate on the
 * first 20,000 characters. It imports NOTHING from the language adapters or from the full validator, so a Worker bundle
 * of it stays small; `check-full.ts` adds `validateBatch` on top for Node.
 */
import type { LanguageCode } from '../../src/core/index.ts';
import { fitsTeamLanguage } from '../../src/ingest/language.ts';

/** The largest document (canonical JSON, bytes) and request body accepted. */
export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
/** How much of the running text the language gate looks at. */
export const LANGUAGE_SAMPLE_CHARS = 20_000;

export interface GoreadCourse { id: string; lang: LanguageCode; country: string }

/** A problem found in a document; the shape of the validator's issue (src/ingest/format.ts `ValidationIssue`). */
export interface CheckIssue { path: string; code: string; message: string; hint: string; severity: 'error' | 'warning' }

export type CheckError = 'wrong-language' | 'not-the-team-language' | 'not-shareable' | 'invalid-document' | 'too-large';

export type CheckResult = { ok: true } | { ok: false; error: CheckError; message: string; issues?: CheckIssue[] };

/** A document check: light on Cloudflare, light then full on Node. */
export type DocumentCheck = (doc: Record<string, unknown>, course: GoreadCourse) => Promise<CheckResult> | CheckResult;

/** The sentence a learner sees for a personal copy (contract, "422 errors"). */
export const PERSONAL_COPY_MESSAGE =
  'Your own copy of a published book stays on your device — it is yours to read, not to redistribute. Texts your team wrote can be shared.';
export const GENERATED_MESSAGE = 'Machine-generated text is not shared with the team. Texts your team wrote can be shared.';
const TEAM_HINT = 'Texts your team wrote can be shared.';

const RIGHTS = ['public-domain', 'licensed', 'owner-authored', 'generated', 'user-private', 'personal-copy', 'unverified'];
const AUTHORSHIP = ['human', 'public-domain', 'licensed', 'generated', 'learner', 'published'];
const KINDS = ['story', 'dialogue', 'nonfiction', 'scripture', 'transcript', 'testimony', 'generated-prep'];
const CORPUS_KINDS = ['comprehensible-input', 'scripture', 'testimony'];
const REVIEWS = ['unreviewed', 'in-review', 'reviewed', 'approved', 'rejected'];
const LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'native'];
const DOC_ID = /^[a-z0-9][a-z0-9-]*$/;
const WORK_SLUG = /^[a-z0-9-]+$/;
const LOCALE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** The running text of a document up to `max` characters (the same paragraphs as `documentText`, without reading past the sample). */
function leadingText(doc: Record<string, unknown>, max: number): string {
  const out: string[] = [];
  let length = 0;
  const sections = Array.isArray(doc.sections) ? doc.sections : [];
  for (const s of sections) {
    const paragraphs = isObj(s) && Array.isArray(s.paragraphs) ? s.paragraphs : [];
    for (const p of paragraphs) {
      const pieces: string[] = [];
      if (typeof p === 'string') pieces.push(p);
      else if (isObj(p) && typeof p.text === 'string') pieces.push(p.text);
      else if (isObj(p) && Array.isArray(p.sentences)) for (const x of p.sentences) if (isObj(x) && typeof x.text === 'string') pieces.push(x.text);
      for (const piece of pieces) {
        out.push(piece);
        length += piece.length + 1;
        if (length >= max) return out.join('\n').slice(0, max);
      }
    }
  }
  return out.join('\n').slice(0, max);
}

/** True when the document carries a verification record: who checked (`by`) and when (`checkedAt`), at `source.verification` or `scripture.verification`. */
function hasVerification(doc: Record<string, unknown>): boolean {
  const ok = (v: unknown): boolean => isObj(v) && isStr(v.by) && isStr(v.checkedAt);
  return ok(isObj(doc.source) ? doc.source.verification : undefined) || ok(isObj(doc.scripture) ? doc.scripture.verification : undefined);
}

/** Why this document may not be shared (the contract's rights table, and generated text whatever its rights); undefined when it may. */
export function notShareableReason(doc: Record<string, unknown>): string | undefined {
  const source = isObj(doc.source) ? doc.source : undefined;
  const corpus = isObj(doc.corpus) ? doc.corpus : undefined;
  if (doc.contentType === 'testimony' || corpus?.kind === 'testimony') {
    return `Personal testimony is private to the learner who made it, so it is not shared with the team. ${TEAM_HINT}`;
  }
  if (doc.generated === true || source?.authorship === 'generated') return GENERATED_MESSAGE;
  switch (source?.rights) {
    case 'owner-authored': return undefined;
    case 'public-domain':
    case 'licensed':
      return hasVerification(doc)
        ? undefined
        : 'Before a public-domain or licensed text can be shared, a verification record must say who checked its rights and wording and when. Until then it stays on your device.';
    case 'personal-copy': return PERSONAL_COPY_MESSAGE;
    case 'user-private': return `This text is private to the learner who made it, so it is not shared with the team. ${TEAM_HINT}`;
    case 'generated': return GENERATED_MESSAGE;
    case 'unverified': return `The rights to this text have not been established, so it is not shared with the team. ${TEAM_HINT}`;
    // anything else is not a rights status at all: the shape check says so (invalid-document)
    default: return undefined;
  }
}

/** The document's shape and required fields, by hand (a subset of the validator's errors; the importer validates fully on every device). */
function shapeIssues(doc: Record<string, unknown>, course: GoreadCourse): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const err = (path: string, code: string, message: string, hint: string): void => { issues.push({ path, code, message, hint, severity: 'error' }); };
  const missing = (path: string): void => err(path, 'missing-field', `${path} is required`, `Add "${path}" — see docs/IMPORT.md.`);
  const oneOf = (path: string, v: unknown, list: readonly string[]): void => {
    if (!list.includes(v as string)) err(path, 'invalid-value', `${path} must be one of ${list.join(', ')}`, 'See docs/IMPORT.md.');
  };

  if (doc.schemaVersion !== 2) err('schemaVersion', 'unsupported-schema-version', 'only schemaVersion 2 can be shared', 'Import the text again with the current app.');
  if (!isStr(doc.id)) missing('id');
  else if (!DOC_ID.test(doc.id)) err('id', 'invalid-id', `id "${doc.id}" is not a valid id`, 'Use lower-case letters, digits and hyphens, starting with a letter or digit.');
  if (!isStr(doc.title)) missing('title');
  if (doc.locale !== undefined && (typeof doc.locale !== 'string' || !LOCALE.test(doc.locale) || doc.locale.split('-')[0] !== course.lang)) {
    err('locale', 'invalid-value', `locale must be a BCP-47 tag beginning with "${course.lang}-"`, 'Use language[-REGION], e.g. "es-HN", or omit it.');
  }
  oneOf('contentType', doc.contentType, KINDS);
  if (typeof doc.generated !== 'boolean') err('generated', 'missing-field', 'generated must be true or false', 'Say whether the text was machine generated.');
  for (const key of ['topics', 'editorialTags', 'prepTargets']) {
    const v = doc[key];
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) err(key, 'missing-field', `${key} must be an array of strings`, `Add "${key}": [].`);
  }
  if (doc.difficulty !== undefined) oneOf('difficulty', doc.difficulty, LEVELS);

  const corpus = doc.corpus;
  if (!isObj(corpus) || !isStr(corpus.id) || !isStr(corpus.title) || !CORPUS_KINDS.includes(corpus.kind as string)) {
    err('corpus', 'invalid-value', 'corpus must be {id, kind, title}', `kind is one of ${CORPUS_KINDS.join(', ')}.`);
  }

  const source = doc.source;
  if (!isObj(source)) missing('source');
  else {
    for (const k of ['id', 'title', 'attribution', 'provenance']) if (!isStr(source[k])) missing(`source.${k}`);
    oneOf('source.rights', source.rights, RIGHTS);
    oneOf('source.authorship', source.authorship, AUTHORSHIP);
  }

  const review = doc.review;
  if (!isObj(review)) missing('review');
  else {
    oneOf('review.status', review.status, REVIEWS);
    if ((review.status === 'reviewed' || review.status === 'approved') && !isStr(review.reviewedBy)) {
      err('review.reviewedBy', 'review-missing-reviewer', `review.status "${String(review.status)}" needs review.reviewedBy`, 'Name the person who reviewed the text.');
    }
  }

  if (doc.contentType === 'scripture') {
    const sc = doc.scripture;
    if (!isObj(sc) || !isStr(sc.translationId) || !isStr(sc.translationName)) {
      err('scripture', 'scripture-translation-missing', 'scripture texts need a "scripture" block identifying the translation', 'Add scripture {translationId, translationName, edition, book, chapter}.');
    }
  }

  if (doc.work !== undefined) {
    const w = doc.work;
    if (!isObj(w)) err('work', 'invalid-value', 'work must be an object {slug, courseId?, chapter?}', 'e.g. {"slug": "el-viajero", "chapter": {"index": 1}}');
    else {
      if (typeof w.slug !== 'string' || !WORK_SLUG.test(w.slug)) err('work.slug', 'invalid-id', 'work.slug must be lower-case letters, digits and hyphens', 'Use the slug of the work in the course ladder.');
      if (w.courseId !== undefined && w.courseId !== course.id) err('work.courseId', 'invalid-value', `work.courseId must be "${course.id}" (the team's course)`, 'Use the course of the same language, or omit it.');
      if (w.chapter !== undefined) {
        const ch = w.chapter;
        if (!isObj(ch) || !isInt(ch.index) || ch.index < 0 || (ch.title !== undefined && !isStr(ch.title))) {
          err('work.chapter', 'invalid-value', 'work.chapter must be {index, title?} with a whole-number index (0 is front matter)', 'e.g. {"index": 3, "title": "A visit"}');
        }
      }
    }
  }

  if (!Array.isArray(doc.sections) || doc.sections.length === 0) {
    err('sections', 'missing-field', 'sections must be a non-empty array', 'Add at least one section with one paragraph.');
    return issues;
  }
  let sentences = 0;
  doc.sections.forEach((s, i) => {
    const sp = `sections[${i}]`;
    if (!isObj(s) || !Array.isArray(s.paragraphs)) { err(sp, 'invalid-value', 'a section needs a "paragraphs" array', 'See docs/IMPORT.md.'); return; }
    s.paragraphs.forEach((p, j) => {
      const pp = `${sp}.paragraphs[${j}]`;
      if (!isObj(p)) { err(pp, 'invalid-value', 'a paragraph must be an object', 'Use {"sentences": [...]} or {"text": "..."}.'); return; }
      if (Array.isArray(p.sentences)) {
        p.sentences.forEach((x, k) => {
          sentences++;
          if (!isObj(x) || !isStr(x.text)) err(`${pp}.sentences[${k}].text`, 'empty-sentence', 'sentence text is missing or blank', 'Every sentence needs text; remove empty entries.');
        });
      } else if (typeof p.text === 'string') {
        sentences++;
        if (!isStr(p.text)) err(`${pp}.text`, 'empty-sentence', 'paragraph text is blank', 'Remove empty paragraphs.');
      } else err(pp, 'invalid-value', 'a paragraph needs "sentences" or "text"', 'Use {"sentences": [...]} or {"text": "..."}.');
    });
  });
  if (sentences === 0) err('sections', 'no-sentences', 'the document has no sentences', 'Add at least one sentence.');
  return issues;
}

const issueSummary = (issues: readonly CheckIssue[]): string => {
  const first = issues.find((i) => i.severity === 'error');
  const more = issues.length > 1 ? ` (and ${issues.length - 1} more)` : '';
  return `This text could not be shared because it is not a valid Go text: ${first ? `${first.path || '(document)'}: ${first.message}` : 'it did not pass the check'}${more}.`;
};

export { issueSummary };

/**
 * The light check. Order: language of the document, language of the text, rights, size, shape. (The id in the address and
 * the body shape are the handler's.) Returns the first refusal.
 */
export function lightCheck(doc: Record<string, unknown>, course: GoreadCourse): CheckResult {
  if (doc.lang !== course.lang) {
    const kind = typeof doc.lang === 'string' ? fitsTeamLanguage('', course, doc.lang).message : undefined;
    return { ok: false, error: 'wrong-language', message: kind ?? `This text must be written in the team's language (${course.lang}); its language is not ${course.lang}.` };
  }
  const language = fitsTeamLanguage(leadingText(doc, LANGUAGE_SAMPLE_CHARS), course, course.lang);
  if (!language.ok) return { ok: false, error: 'not-the-team-language', message: language.message ?? 'This text is not in the team\'s language.' };

  const why = notShareableReason(doc);
  if (why !== undefined) return { ok: false, error: 'not-shareable', message: why };

  if (new TextEncoder().encode(JSON.stringify(doc)).length > MAX_DOCUMENT_BYTES) {
    return { ok: false, error: 'too-large', message: 'This text is too large to share (the limit is 2 MB). Share it a chapter at a time.' };
  }
  const issues = shapeIssues(doc, course);
  if (issues.length > 0) return { ok: false, error: 'invalid-document', message: issueSummary(issues), issues };
  return { ok: true };
}
