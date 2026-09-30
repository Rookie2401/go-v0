import { ids } from '../core';
import type { LanguageCode } from '../core';
import { BASE64_RE, checksumOf } from './format';
import type { BackupFile, BackupIssue } from './types';
import { BACKUP_FORMAT, BACKUP_VERSION } from './types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Collections whose rows must be `{ id: string, userId === file.userId }`. */
const OWNED: Array<[keyof BackupFile['data'], string]> = [
  ['events', 'events'], ['testimonies', 'testimonies'], ['revisions', 'revisions'], ['suggestions', 'suggestions'],
  ['drafts', 'drafts'], ['recordings', 'recordings'],
];
const CONTENT_KEYS = ['texts', 'sections', 'paragraphs', 'sentences', 'tokens', 'analyses', 'rescues', 'phraseOccurrences', 'patternOccurrences'] as const;
const REFERENCE_KEYS = ['corpora', 'sources', 'lemmas', 'phrases', 'patterns'] as const;

function parseIfString(file: unknown): { value: unknown; issue?: BackupIssue } {
  if (typeof file !== 'string') return { value: file };
  try {
    return { value: JSON.parse(file) };
  } catch {
    return {
      value: undefined,
      issue: { code: 'not-json', severity: 'error', message: 'This file is not valid JSON, so it is not a Go backup (or it was cut off while saving). Export a fresh backup from the original device and try again.' },
    };
  }
}

/** Parse a backup given as an object or as the raw JSON text; `issues` are errors that make it unusable. */
export function parseBackup(file: unknown): { file?: BackupFile; issues: BackupIssue[] } {
  const p = parseIfString(file);
  if (p.issue) return { issues: [p.issue] };
  const issues = validateBackup(p.value);
  return { file: issues.some((i) => i.severity === 'error') ? undefined : (p.value as BackupFile), issues };
}

/**
 * Check a backup without touching any store. Returns every problem found; a file is restorable iff none has
 * severity 'error'. Accepts the parsed object or the raw JSON text.
 */
export function validateBackup(file: unknown): BackupIssue[] {
  const issues: BackupIssue[] = [];
  const err = (code: BackupIssue['code'], message: string, path?: string) => issues.push({ code, severity: 'error', message, path });
  const warn = (code: BackupIssue['code'], message: string, path?: string) => issues.push({ code, severity: 'warning', message, path });

  const p = parseIfString(file);
  if (p.issue) return [p.issue];
  const f = p.value;

  if (!isObj(f) || f.format !== BACKUP_FORMAT) {
    err('not-a-backup', `This is not a Go backup file (expected format "${BACKUP_FORMAT}"). Choose the .json file created by "Export backup".`);
    return issues;
  }
  if (typeof f.version !== 'number' || !Number.isInteger(f.version) || f.version < 1) {
    err('unsupported-version', 'The backup has no valid version number, so it cannot be read safely. Export a fresh backup from the original device.', 'version');
    return issues;
  }
  if (f.version > BACKUP_VERSION) {
    err('unsupported-version', `This backup is version ${f.version}, which is newer than this app understands (version ${BACKUP_VERSION}). Update Go on this device, then restore again.`, 'version');
    return issues;
  }
  if (f.version < BACKUP_VERSION) {
    err('unsupported-version', `This backup is version ${f.version}, an older format this app can no longer read. Open it with the Go version that created it and export again.`, 'version');
    return issues;
  }
  if (typeof f.userId !== 'string' || !f.userId) { err('malformed', 'The backup does not say which learner it belongs to (missing "userId").', 'userId'); return issues; }
  if (typeof f.createdAt !== 'string') err('malformed', 'The backup has no creation date.', 'createdAt');
  if (typeof f.checksum !== 'string') { err('malformed', 'The backup has no checksum, so its integrity cannot be checked.', 'checksum'); return issues; }
  const d = f.data;
  if (!isObj(d)) { err('malformed', 'The backup has no data section; the file is incomplete.', 'data'); return issues; }

  // Shape first (checksumOf needs a walkable object), then the checksum, then the detailed rules.
  for (const key of ['events', 'testimonies', 'revisions', 'suggestions', 'drafts', 'recordings', 'meta'] as const) {
    if (!Array.isArray(d[key])) err('malformed', `The backup is missing its "${key}" list; the file is incomplete or damaged.`, `data.${key}`);
  }
  if (!isObj(d.user)) err('malformed', 'The backup is missing the learner row.', 'data.user');
  if (!isObj(d.testimonyContent)) err('malformed', 'The backup is missing "testimonyContent".', 'data.testimonyContent');
  if (!isObj(d.reference)) err('malformed', 'The backup is missing "reference".', 'data.reference');
  if (!isObj(d.assets)) err('malformed', 'The backup is missing "assets".', 'data.assets');
  if (issues.length) return issues;
  const tc = d.testimonyContent as Obj;
  const ref = d.reference as Obj;
  for (const k of CONTENT_KEYS) if (!Array.isArray(tc[k])) err('malformed', `The backup is missing testimonyContent.${k}.`, `data.testimonyContent.${k}`);
  for (const k of REFERENCE_KEYS) if (!Array.isArray(ref[k])) err('malformed', `The backup is missing reference.${k}.`, `data.reference.${k}`);
  if (issues.length) return issues;

  const actual = checksumOf(d as unknown as BackupFile['data']);
  if (actual !== f.checksum) {
    err('bad-checksum', 'The backup failed its integrity check: the file was changed, truncated or corrupted after it was exported. Do not restore it; export a fresh backup from the original device (or use an earlier copy).', 'checksum');
    return issues;
  }

  const userId = f.userId;
  if ((d.user as Obj).id !== userId) err('wrong-learner', `The learner row in the backup (${String((d.user as Obj).id)}) does not match the backup's learner (${userId}).`, 'data.user.id');

  for (const [key] of OWNED) {
    (d[key] as unknown[]).forEach((row, i) => {
      const path = `data.${key}[${i}]`;
      if (!isObj(row) || typeof row.id !== 'string') { err('malformed', `${path} has no id.`, path); return; }
      if (row.userId !== userId) err('wrong-learner', `${path} belongs to another learner (${String(row.userId)}). Restore never writes another learner's data, so the file was rejected.`, `${path}.userId`);
    });
  }
  (d.events as Obj[]).forEach((e, i) => {
    if (isObj(e) && (typeof e.dedupeKey !== 'string' || typeof e.type !== 'string')) err('malformed', `data.events[${i}] is missing its type or dedupeKey.`, `data.events[${i}]`);
  });
  (d.drafts as Obj[]).forEach((row, i) => {
    if (isObj(row) && row.id !== ids.draft(userId, row.lang as LanguageCode)) err('malformed', `data.drafts[${i}] has an unexpected id.`, `data.drafts[${i}].id`);
    if (isObj(row) && (typeof row.seq !== 'number' || typeof row.updatedAt !== 'string')) err('malformed', `data.drafts[${i}] is missing seq/updatedAt.`, `data.drafts[${i}]`);
  });
  (d.meta as Obj[]).forEach((row, i) => {
    if (!isObj(row) || typeof row.id !== 'string' || typeof row.updatedAt !== 'string') err('malformed', `data.meta[${i}] is malformed.`, `data.meta[${i}]`);
  });
  for (const k of [...CONTENT_KEYS.map((x) => [`testimonyContent.${x}`, tc[x]] as const), ...REFERENCE_KEYS.map((x) => [`reference.${x}`, ref[x]] as const)]) {
    (k[1] as unknown[]).forEach((row, i) => {
      if (!isObj(row) || typeof row.id !== 'string') err('malformed', `data.${k[0]}[${i}] has no id.`, `data.${k[0]}[${i}]`);
    });
  }
  if (issues.length) return issues;

  // Content must be private testimony text only, never corpus text.
  (tc.texts as Obj[]).forEach((t, i) => {
    if (t.kind !== 'testimony') err('malformed', `data.testimonyContent.texts[${i}] is not a testimony text (kind "${String(t.kind)}"); backups never carry corpus texts.`, `data.testimonyContent.texts[${i}].kind`);
  });

  // Counts (summary) must agree with the lists.
  const counts = isObj(f.counts) ? f.counts : {};
  for (const [name, n] of Object.entries(counts)) {
    const actualCount = countAt(d, name);
    if (actualCount !== undefined && actualCount !== n) warn('count-mismatch', `The backup summary says ${String(n)} ${name} but the file holds ${actualCount}.`, `counts.${name}`);
  }

  // Assets and dangling references (warnings: the rest of the backup is still restorable).
  const assets = d.assets as Record<string, unknown>;
  for (const [id, a] of Object.entries(assets)) {
    if (!isObj(a) || typeof a.mime !== 'string' || typeof a.base64 !== 'string' || !BASE64_RE.test(a.base64)) {
      err('malformed', `Recording audio "${id}" is not valid base64; the file is damaged.`, `data.assets.${id}`);
    }
  }
  if (f.includesRecordings) {
    (d.recordings as Obj[]).forEach((r, i) => {
      if (typeof r.assetId === 'string' && !(r.assetId in assets)) warn('missing-audio', `Recording ${String(r.id)} has no audio in this backup (the original device no longer had it). Only its details will be restored.`, `data.recordings[${i}]`);
    });
  }
  const texts = new Set((tc.texts as Obj[]).map((t) => t.id as string));
  const testimonies = new Set((d.testimonies as Obj[]).map((t) => t.id as string));
  (d.revisions as Obj[]).forEach((r, i) => {
    if (typeof r.textId === 'string' && !texts.has(r.textId)) warn('dangling-reference', `Revision ${String(r.id)} points at text ${r.textId} which is not in the backup; its saved words will restore but its personal audio/reading view will be missing.`, `data.revisions[${i}].textId`);
    if (typeof r.testimonyId === 'string' && !testimonies.has(r.testimonyId)) warn('dangling-reference', `Revision ${String(r.id)} belongs to a testimony that is not in the backup.`, `data.revisions[${i}].testimonyId`);
  });
  for (const k of ['sections', 'paragraphs', 'sentences', 'tokens', 'rescues', 'phraseOccurrences', 'patternOccurrences'] as const) {
    (tc[k] as Obj[]).forEach((row, i) => {
      if (typeof row.textId === 'string' && !texts.has(row.textId)) err('malformed', `data.testimonyContent.${k}[${i}] belongs to text ${row.textId} which is not in the backup.`, `data.testimonyContent.${k}[${i}]`);
    });
  }
  return issues;
}

function countAt(d: Obj, name: string): number | undefined {
  const parts = name.split('.');
  let cur: unknown = d;
  for (const p of parts) {
    if (!isObj(cur)) return undefined;
    cur = cur[p];
  }
  if (Array.isArray(cur)) return cur.length;
  if (isObj(cur)) return Object.keys(cur).length;
  return undefined;
}
