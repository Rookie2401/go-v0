/**
 * How a DraftRecord sits inside a PrivateDocument. The `body` is the JSON of the record with a fixed key order (so the
 * same record always encodes to the same string and "same content" can be detected by comparing bodies). Decoding is
 * lenient on purpose: a body written by an older client (plain text, or JSON of another shape) never fails to open; it
 * becomes `{ text: body, versions: [] }`, and the learner's words are never lost to a parser.
 */
import type { PrivateDocument } from '../../../repository-contract/src';
import { WRITING_MODES } from '../types';
import type { AssistanceLevel, AssistanceStep, Authorship, DraftRecord, DraftVersion, SentenceVersion, WritingMode } from '../types';
import { AUTHORSHIP } from '../types';

export type DocumentKind = 'draft' | 'testimony';

/** testimony mode → the `testimony` document kind; everything else is a `draft`. */
export const kindOf = (record: Pick<DraftRecord, 'mode'>): DocumentKind => (record.mode === 'testimony' ? 'testimony' : 'draft');

/** The server limits a title to 300 characters; the record keeps the full title. */
export const documentTitle = (title: string): string => (title.length > 300 ? title.slice(0, 300) : title);

const LEVELS: readonly number[] = [1, 2, 3, 4, 5, 6];

function canonSentence(s: SentenceVersion): SentenceVersion {
  return { text: s.text, authorship: s.authorship, assistance: [...s.assistance], at: s.at };
}

function canonVersion(v: DraftVersion): DraftVersion {
  return {
    versionId: v.versionId, at: v.at, text: v.text, textHash: v.textHash, deviceId: v.deviceId,
    sentences: v.sentences.map(canonSentence), ...(v.note !== undefined ? { note: v.note } : {}),
  };
}

function canonStep(a: AssistanceStep): AssistanceStep {
  return { level: a.level, content: a.content, revealedUnitIds: [...a.revealedUnitIds], source: a.source, ...(a.review !== undefined ? { review: a.review } : {}),
    ...(a.sentenceIndex !== undefined ? { sentenceIndex: a.sentenceIndex } : {}), ...(a.sentenceHash !== undefined ? { sentenceHash: a.sentenceHash } : {}), at: a.at };
}

/** A copy of the record with its keys in the canonical order. */
export function canonicalRecord(r: DraftRecord): DraftRecord {
  return {
    draftId: r.draftId, languageId: r.languageId, ...(r.varietyId !== undefined ? { varietyId: r.varietyId } : {}), mode: r.mode,
    ...(r.promptId !== undefined ? { promptId: r.promptId } : {}), title: r.title, text: r.text,
    versions: r.versions.map(canonVersion), assistance: r.assistance.map(canonStep), createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export const encodeRecord = (r: DraftRecord): string => JSON.stringify(canonicalRecord(r));

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);

function readSentence(v: unknown, fallbackAt: string): SentenceVersion | undefined {
  if (!isObj(v) || typeof v.text !== 'string') return undefined;
  const authorship = (AUTHORSHIP as readonly string[]).includes(String(v.authorship)) ? (v.authorship as Authorship) : 'independent';
  const assistance = Array.isArray(v.assistance) ? v.assistance.filter((l): l is AssistanceLevel => LEVELS.includes(l as number)) : [];
  return { text: v.text, authorship, assistance, at: str(v.at, fallbackAt) };
}

function readVersion(v: unknown, fallbackAt: string): DraftVersion | undefined {
  if (!isObj(v) || typeof v.versionId !== 'string' || typeof v.text !== 'string') return undefined;
  const at = str(v.at, fallbackAt);
  const sentences = Array.isArray(v.sentences) ? v.sentences.map((s) => readSentence(s, at)).filter((s): s is SentenceVersion => !!s) : [];
  return { versionId: v.versionId, at, text: v.text, textHash: str(v.textHash), deviceId: str(v.deviceId), sentences, ...(typeof v.note === 'string' ? { note: v.note } : {}) };
}

function readStep(v: unknown): AssistanceStep | undefined {
  if (!isObj(v) || !LEVELS.includes(v.level as number)) return undefined;
  return {
    level: v.level as AssistanceLevel, content: str(v.content), revealedUnitIds: Array.isArray(v.revealedUnitIds) ? v.revealedUnitIds.filter((x): x is string => typeof x === 'string') : [],
    source: (['adapter-checker', 'pack-grammar', 'pack-sentence', 'learner-own-sentence', 'remote-assistant', 'none'] as const).find((s) => s === v.source) ?? 'none',
    ...(v.review === 'unreviewed' || v.review === 'reviewed' || v.review === 'learner-own' ? { review: v.review } : {}),
    ...(typeof v.sentenceIndex === 'number' && Number.isInteger(v.sentenceIndex) && v.sentenceIndex >= 0 ? { sentenceIndex: v.sentenceIndex } : {}),
    ...(typeof v.sentenceHash === 'string' ? { sentenceHash: v.sentenceHash } : {}), at: str(v.at),
  };
}

type DocLike = Pick<PrivateDocument, 'docId' | 'languageId' | 'kind' | 'title' | 'updatedAt' | 'body'>;

/** A body from an older client: the whole body is the text. */
export function legacyRecord(doc: DocLike): DraftRecord {
  return {
    draftId: doc.docId, languageId: doc.languageId, mode: doc.kind === 'testimony' ? 'testimony' : 'free', title: doc.title ?? '',
    text: doc.body, versions: [], assistance: [], createdAt: doc.updatedAt, updatedAt: doc.updatedAt,
  };
}

/**
 * Parses and validates a document body. The document's own id, language and title fill whatever the body lacks; the
 * document id always wins over a `draftId` inside the body (a conflict copy is a new document).
 */
export function decodeBody(doc: DocLike): DraftRecord {
  let parsed: unknown;
  try { parsed = JSON.parse(doc.body); } catch { return legacyRecord(doc); }
  if (!isObj(parsed) || typeof parsed.text !== 'string') return legacyRecord(doc);
  const updatedAt = str(parsed.updatedAt, doc.updatedAt);
  const createdAt = str(parsed.createdAt, updatedAt);
  const versions = Array.isArray(parsed.versions) ? parsed.versions.map((v) => readVersion(v, createdAt)).filter((v): v is DraftVersion => !!v) : [];
  const assistance = Array.isArray(parsed.assistance) ? parsed.assistance.map(readStep).filter((s): s is AssistanceStep => !!s) : [];
  const mode: WritingMode = (WRITING_MODES as readonly string[]).includes(String(parsed.mode)) ? (parsed.mode as WritingMode) : doc.kind === 'testimony' ? 'testimony' : 'free';
  return {
    draftId: doc.docId, languageId: str(parsed.languageId, doc.languageId), ...(typeof parsed.varietyId === 'string' ? { varietyId: parsed.varietyId } : {}),
    mode, ...(typeof parsed.promptId === 'string' ? { promptId: parsed.promptId } : {}), title: str(parsed.title, doc.title ?? ''),
    text: parsed.text, versions, assistance, createdAt, updatedAt,
  };
}

/** The document that holds a record. `revision` and `deviceId` are the caller's to state. */
export function toDocument(record: DraftRecord, who: { learnerId: string; deviceId: string }, revision: number, updatedAt: string): PrivateDocument {
  return {
    docId: record.draftId, learnerId: who.learnerId, languageId: record.languageId, kind: kindOf(record),
    ...(record.title ? { title: documentTitle(record.title) } : {}), body: encodeRecord(record), revision, deviceId: who.deviceId, updatedAt,
  };
}
