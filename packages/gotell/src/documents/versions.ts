/**
 * Versions are append-only history. `newVersion` adds one and never touches an earlier one; `restoreVersion` makes a NEW
 * version equal to an old text; nothing here deletes or rewrites history. Authorship is judged per sentence by a function
 * the caller supplies (it knows which help was shown for which sentence); `judgeFromAssistance` is a conservative default.
 */
import { deviceShortHash } from '../../../repository-sync/src';
import { stepsForSentence } from '../engine/authorship';
import type { AssistanceLevel, AssistanceStep, Authorship, DraftRecord, DraftVersion, SentenceVersion } from '../types';
import { normalizeSentence, splitSentences, textHash } from './text';
import { toIso, type TimeSource } from './time';

export interface SentenceJudgement { authorship: Authorship; assistance: AssistanceLevel[] }
/**
 * `prior` is the sentence of the previous version this one most likely continues: the identical sentence when the text is
 * unchanged (so a carried-over sentence can keep its authorship), else the sentence at the same position (a revision).
 */
export type SentenceJudge = (sentenceText: string, prior: SentenceVersion | undefined, index: number) => SentenceJudgement;

const same = (a: string, b: string): boolean => normalizeSentence(a) === normalizeSentence(b);

function priorFor(prev: DraftVersion | undefined, sentence: string, index: number, used: Set<number>): SentenceVersion | undefined {
  if (!prev) return undefined;
  const hit = prev.sentences.findIndex((s, i) => !used.has(i) && same(s.text, sentence));
  if (hit >= 0) { used.add(hit); return prev.sentences[hit]; }
  const at = prev.sentences[index];
  return at && !used.has(index) ? at : undefined;
}

/**
 * Appends an immutable version. The input record is not modified; the returned record shares nothing with it. `assistance`
 * is reset to [] for the next round. A version is always appended, even for identical text (see `isUnchanged`).
 */
export function newVersion(record: DraftRecord, text: string, judge: SentenceJudge, deviceId: string, now: TimeSource, note?: string): DraftRecord {
  const base = structuredClone(record);
  const at = toIso(now);
  const prev = base.versions[base.versions.length - 1];
  const used = new Set<number>();
  const sentences: SentenceVersion[] = splitSentences(text).map((s, i) => {
    const prior = priorFor(prev, s, i, used);
    const j = judge(s, prior, i);
    const carried = !!prior && same(prior.text, s) && prior.authorship === j.authorship;
    return { text: s, authorship: j.authorship, assistance: [...j.assistance], at: carried ? prior.at : at };
  });
  const hash = textHash(text);
  const version: DraftVersion = {
    versionId: `v${base.versions.length + 1}-${deviceShortHash(deviceId)}-${hash}`, at, text, textHash: hash, deviceId, sentences,
    ...(note !== undefined ? { note } : {}),
  };
  return { ...base, text, versions: [...base.versions, version], assistance: [], updatedAt: at };
}

export const isUnchanged = (record: DraftRecord, text: string): boolean => {
  const last = record.versions[record.versions.length - 1];
  return !!last && last.text === text;
};

const LEVEL_ORDER = (steps: AssistanceStep[]): AssistanceLevel[] => [...new Set(steps.map((s) => s.level))].sort((a, b) => a - b);
const stripEnd = (s: string): string => normalizeSentence(s).replace(/[\s.!?…。！？।॥؟"'”’»)\]]+$/u, '').toLowerCase();

/**
 * A conservative default judge. A sentence equal to what a step showed is attributed to that step (level 6/5 → copied-from-
 * model; level 4 → revised-after-feedback; a remote assistant's wording → ai-generated; the learner's own earlier sentence →
 * reproduced-later). A sentence carried over unchanged keeps its earlier authorship. Any other new or changed sentence is judged
 * from the steps that touched it: a step records the sentence it was shown for (`sentenceIndex` / `sentenceHash`), so a sentence no
 * step touched is independent even when help was shown for its neighbour. A step with no sentence reference (a legacy record)
 * is assumed to touch every sentence of the round (level 4+ → revised-after-feedback, else after-hint).
 */
export function judgeFromAssistance(steps: readonly AssistanceStep[]): SentenceJudge {
  const lines = (s: AssistanceStep): string[] => [s.content, ...s.content.split(/\r?\n/u)].map(stripEnd).filter(Boolean);
  const everything = LEVEL_ORDER([...steps]);
  return (sentence, prior, index) => {
    const all = LEVEL_ORDER(stepsForSentence(steps, sentence, index));
    const levelsShown = all.length ? all : everything;
    const key = stripEnd(sentence);
    const shown = steps.filter((s) => s.level >= 4 && lines(s).includes(key));
    if (shown.length) {
      const top = shown.reduce((m, s) => (s.level > m.level ? s : m));
      if (shown.some((s) => s.source === 'remote-assistant')) return { authorship: 'ai-generated', assistance: levelsShown };
      if (shown.every((s) => s.source === 'learner-own-sentence' || s.review === 'learner-own')) return { authorship: 'reproduced-later', assistance: levelsShown };
      return { authorship: top.level >= 5 ? 'copied-from-model' : 'revised-after-feedback', assistance: levelsShown };
    }
    if (prior && same(prior.text, sentence)) return { authorship: prior.authorship, assistance: [] };
    if (!all.length) return { authorship: 'independent', assistance: [] };
    return { authorship: all[all.length - 1] >= 4 ? 'revised-after-feedback' : 'after-hint', assistance: all };
  };
}

// ───────────────────────────── diff ─────────────────────────────

export type SentenceDiffKind = 'added' | 'removed' | 'changed' | 'unchanged';
export interface SentenceDiff {
  kind: SentenceDiffKind;
  before?: SentenceVersion;
  after?: SentenceVersion;
  beforeIndex?: number;
  afterIndex?: number;
}
export interface VersionDiff { entries: SentenceDiff[]; added: number; removed: number; changed: number; unchanged: number }

/** Per-sentence diff of two versions: an LCS on sentence text; between matches, removed/added sentences pair up as changed. */
export function diffVersions(a: DraftVersion, b: DraftVersion): VersionDiff {
  const x = a.sentences; const y = b.sentences;
  const n = x.length; const m = y.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = same(x[i].text, y[j].text) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);

  const entries: SentenceDiff[] = [];
  let gapA: number[] = []; let gapB: number[] = [];
  const flush = (): void => {
    const k = Math.min(gapA.length, gapB.length);
    for (let t = 0; t < k; t++) entries.push({ kind: 'changed', before: x[gapA[t]], after: y[gapB[t]], beforeIndex: gapA[t], afterIndex: gapB[t] });
    for (const i of gapA.slice(k)) entries.push({ kind: 'removed', before: x[i], beforeIndex: i });
    for (const j of gapB.slice(k)) entries.push({ kind: 'added', after: y[j], afterIndex: j });
    gapA = []; gapB = [];
  };
  let i = 0; let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && same(x[i].text, y[j].text)) {
      flush();
      entries.push({ kind: 'unchanged', before: x[i], after: y[j], beforeIndex: i, afterIndex: j });
      i++; j++;
    } else if (j >= m || (i < n && lcs[i + 1][j] >= lcs[i][j + 1])) gapA.push(i++);
    else gapB.push(j++);
  }
  flush();
  const count = (k: SentenceDiffKind): number => entries.filter((e) => e.kind === k).length;
  return { entries, added: count('added'), removed: count('removed'), changed: count('changed'), unchanged: count('unchanged') };
}

// ───────────────────────────── restore ─────────────────────────────

/**
 * Restoring is writing: it appends a NEW version with the old text (and the old sentences' authorship), and the current text
 * becomes that text. Every version, including the one it was restored from, stays.
 */
export function restoreVersion(record: DraftRecord, versionId: string, deviceId: string, now: TimeSource): DraftRecord {
  const old = record.versions.find((v) => v.versionId === versionId);
  if (!old) throw new Error(`No version "${versionId}" in draft "${record.draftId}".`);
  const base = structuredClone(record);
  const at = toIso(now);
  const version: DraftVersion = {
    versionId: `v${base.versions.length + 1}-${deviceShortHash(deviceId)}-${old.textHash || textHash(old.text)}`, at, text: old.text, textHash: old.textHash || textHash(old.text), deviceId,
    sentences: structuredClone(old.sentences), note: `Restored from ${old.versionId}`,
  };
  return { ...base, text: old.text, versions: [...base.versions, version], assistance: [], updatedAt: at };
}

// ───────────────────────────── export ─────────────────────────────

export type ExportFormat = 'json' | 'text' | 'markdown';

/** json: the whole record (every version). text / markdown: the current text under a header (title, language, date, version count). */
export function exportDraft(record: DraftRecord, format: ExportFormat): string {
  if (format === 'json') return JSON.stringify(record, null, 2);
  const title = record.title || 'Untitled draft';
  const lang = record.varietyId ? `${record.languageId} (${record.varietyId})` : record.languageId;
  const date = record.updatedAt.slice(0, 10);
  const n = record.versions.length;
  if (format === 'markdown') return `# ${title}\n\n*Language: ${lang} · Date: ${date} · Versions: ${n}*\n\n${record.text}\n`;
  return `${title}\nLanguage: ${lang}\nDate: ${date}\nVersions: ${n}\n\n${record.text}\n`;
}

export const exportFileName = (record: DraftRecord, format: ExportFormat): string => {
  const slug = (record.title || 'draft').normalize('NFC').replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || 'draft';
  return `${slug}.${format === 'json' ? 'json' : format === 'markdown' ? 'md' : 'txt'}`;
};
