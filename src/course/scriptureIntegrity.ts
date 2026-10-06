import { CANON, runningNumber } from '../library/canon';

export interface ScriptureAddress { book: string; chapter: number }
export interface ScriptureRow {
  id: string;
  lang: string;
  workId?: string;
  chapter?: number | { index: number };
  scripture?: ScriptureAddress & { translationId?: string; edition?: string };
}

/** Explicit references take precedence. Invalid explicit metadata must not fall back to a different book. */
export function scriptureAddress(row: ScriptureRow): ScriptureAddress | undefined {
  if (row.scripture) return runningNumber(row.scripture.book, row.scripture.chapter) === undefined
    ? undefined : { book: row.scripture.book, chapter: row.scripture.chapter };
  let n = typeof row.chapter === 'number' ? row.chapter : row.chapter?.index;
  if (n === undefined || !Number.isInteger(n) || n < 1) return undefined;
  for (const [book, chapters] of CANON) {
    if (n <= chapters) return { book, chapter: n };
    n -= chapters;
  }
  return undefined;
}

export function canonicalScriptureKey(row: ScriptureRow): string | undefined {
  const address = scriptureAddress(row);
  const edition = row.scripture?.translationId && row.scripture?.edition
    ? `${row.scripture.translationId}:${row.scripture.edition}` : row.workId;
  return address && edition ? JSON.stringify([row.lang, edition, address.book, address.chapter]) : undefined;
}

export function parseVerseRef(ref: string): (ScriptureAddress & { verse: number }) | undefined {
  const match = /^([1-3]?[A-Z]{2,3})\.([1-9]\d*)\.([1-9]\d*)$/.exec(ref);
  if (!match || runningNumber(match[1], Number(match[2])) === undefined) return undefined;
  return { book: match[1], chapter: Number(match[2]), verse: Number(match[3]) };
}

/** A cross-book/chapter excerpt remains a separately addressable passage, never a canonical chapter replacement. */
export function isSupplementalScripture(row: ScriptureRow, refs: readonly string[]): boolean {
  const address = scriptureAddress(row);
  return refs.some((ref) => {
    const verse = parseVerseRef(ref);
    return !verse || !address || verse.book !== address.book || verse.chapter !== address.chapter;
  });
}

/** Title and sentence count cannot prove wording equality. Only the same published text identity may be suppressed. */
export function sameScriptureText(a: ScriptureRow, b: ScriptureRow): boolean {
  return a.id === b.id && a.lang === b.lang;
}

/** Validate a canonical chapter's ordered verse addresses without imposing translation-specific verse counts. */
export function scriptureChapterIssues(row: ScriptureRow, refs: readonly string[]): string[] {
  const issues: string[] = [];
  const address = scriptureAddress(row);
  if (!address) issues.push('invalid canonical chapter');
  if (!canonicalScriptureKey(row)) issues.push('missing edition identity');
  const seen = new Set<string>();
  let previous = 0;
  for (const ref of refs) {
    const verse = parseVerseRef(ref);
    if (!verse) { issues.push(`invalid verse: ${ref}`); continue; }
    if (!address || verse.book !== address.book || verse.chapter !== address.chapter) issues.push(`cross-chapter verse: ${ref}`);
    if (seen.has(ref)) issues.push(`duplicate verse: ${ref}`);
    if (verse.verse <= previous) issues.push(`verse order: ${ref}`);
    previous = verse.verse;
    seen.add(ref);
  }
  return issues;
}
