/**
 * Revision history of a text's CONTENT. Every import that creates a text or changes its sentences (wording, order,
 * addition, removal) appends one `TransformationRecord` (`tool` = ingest@…) whose description starts with
 * `content version …` and says which sentence keys were added / revived / retired and how many analysis rows were
 * written. `contentHistory` reads those records back for the UI (Settings → Content, version history).
 */
import type { Text, TransformationRecord } from '../core';

/** Prefix of the description of a version record; `contentHistory` recognises records by it. */
export const VERSION_RECORD_PREFIX = 'content version ';

const MAX_KEYS = 20;
const keyList = (keys: string[]): string =>
  keys.length <= MAX_KEYS ? keys.join(', ') : `${keys.slice(0, MAX_KEYS).join(', ')}, … and ${keys.length - MAX_KEYS} more`;

export interface VersionBump {
  from: number; // 0 for the first import
  to: number;
  addedKeys: string[];
  revivedKeys: string[];
  retiredKeys: string[];
  analysisRowsWritten: number;
  sentenceCount: number;
}

/** The description stored in the version record, e.g. `content version 1 → 2: added [a1b2], retired [c3d4]; 14 analysis row(s) written`. */
export function describeVersionBump(b: VersionBump): string {
  if (b.from === 0) {
    return `${VERSION_RECORD_PREFIX}${b.to} (created): ${b.sentenceCount} sentence(s) [${keyList(b.addedKeys)}]; ${b.analysisRowsWritten} analysis row(s) written`;
  }
  const parts: string[] = [];
  if (b.addedKeys.length) parts.push(`added [${keyList(b.addedKeys)}]`);
  if (b.revivedKeys.length) parts.push(`revived [${keyList(b.revivedKeys)}]`);
  if (b.retiredKeys.length) parts.push(`retired [${keyList(b.retiredKeys)}]`);
  if (!parts.length) parts.push('sentence order changed (no sentence added or retired)');
  return `${VERSION_RECORD_PREFIX}${b.from} → ${b.to}: ${parts.join(', ')}; ${b.analysisRowsWritten} analysis row(s) written`;
}

export interface ContentHistoryEntry { version: number; at: string; summary: string }

const VERSION_RE = /^content version (?:\d+ → )?(\d+)\b/;

/**
 * One entry per content version of the text, oldest first: `version` (the version it created), `at` (when the import
 * happened), `summary` (the stored description). A text stored before version records existed gets one synthetic entry
 * for its current version, so the UI always has something honest to show.
 */
export function contentHistory(text: Pick<Text, 'transformations' | 'contentVersion' | 'importedAt'>): ContentHistoryEntry[] {
  const out: ContentHistoryEntry[] = [];
  for (const r of (text.transformations ?? []) as TransformationRecord[]) {
    const m = VERSION_RE.exec(r.description);
    if (!m || !r.tool.startsWith('ingest@')) continue;
    out.push({ version: Number(m[1]), at: r.at, summary: r.description });
  }
  if (!out.length) {
    out.push({ version: text.contentVersion, at: text.importedAt, summary: `content version ${text.contentVersion}: no version records were stored for this text (imported before revision history existed)` });
  }
  return out.sort((a, b) => a.version - b.version);
}
