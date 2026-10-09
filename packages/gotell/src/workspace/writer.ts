/**
 * One writing session: the DOM-free logic behind the writer screen. It owns the draft record, the text, the analysis of
 * that text, the assistance ladder per issue and the accept / reject decisions, and talks to the world only through the
 * `TellEngine` port and the `TellHost`.
 *
 * Rules it enforces (the screen cannot bypass them):
 *  - autosave writes the device store only; the account (the Repository) is reached by Save alone;
 *  - the ladder goes in order, one step per request; Level 6 (a model) needs an explicit confirmation and may be refused;
 *  - nothing changes the text but the learner (typing, accept, restore); accept replaces exactly one sentence and a
 *    correction that changes the meaning is never accepted without a second, explicit confirmation;
 *  - the text before an accepted correction or a restore stays in the version history;
 *  - an analysis is valid for the exact text it was made from; once the text differs it is shown as out of date.
 */
import { validateEvent } from '../../../repository-contract/src';
import { summariseCoverage } from '../engine/coverage';
import type { CoverageSummary } from '../engine/coverage';
import { sentenceScopeHash } from '../engine/text';
import type {
  AssistanceLevel, AssistanceStep, Correction, DraftAnalysis, DraftRecord, DraftVersion, Issue, ProfileSource, SentenceAnalysis, WriterProfile, WritingEvidence,
} from '../types';
import type { DiffLine, DraftExportFormat, FileOut, TellEngine, TellHost } from './port';
import { profileSourceFor } from './profileSource';

export const AUTOSAVE_MS = 3000;
export const LADDER: ReadonlyArray<{ level: AssistanceLevel; label: string; verb: string }> = [
  { level: 1, label: 'Identify', verb: 'Show me where to look' },
  { level: 2, label: 'Hint', verb: 'Give me a hint' },
  { level: 3, label: 'Suggest', verb: 'Suggest what to try' },
  { level: 4, label: 'Show correction', verb: 'Show the corrected sentence' },
  { level: 5, label: 'Alternatives', verb: 'Show other ways to say it' },
  { level: 6, label: 'Model expression', verb: 'Show a model' },
];

export type SaveState = 'device-only' | 'saved' | 'unsaved' | 'new';

export interface IssueView {
  issue: Issue;
  sentenceIndex: number;
  /** Open, or rejected (kept visible, muted). */
  state: 'open' | 'rejected';
  steps: AssistanceStep[];
  /** The next ladder level this issue can ask for (undefined at the top or when the analysis is out of date). */
  nextLevel: AssistanceLevel | undefined;
  /** Refusals by level, shown instead of a step. */
  refusals: Partial<Record<AssistanceLevel, string>>;
  /** The correction the issue belongs to (shown after Level 4 only). */
  correction?: Correction;
  canRespond: boolean;
}

export interface WriterView {
  loaded: boolean;
  notFound: boolean;
  record: DraftRecord;
  text: string;
  title: string;
  dirty: boolean;
  saveState: SaveState;
  analysis?: DraftAnalysis;
  analysing: boolean;
  analysisError?: string;
  /** The analysis was made from different text than the one in the editor. */
  stale: boolean;
  /** Distinct checker-coverage lines of the analysed sentences (the whole statements). */
  coverage: string[];
  /** The same statement as one line plus its details (what the screen shows). */
  coverageSummary?: CoverageSummary;
  issues: IssueView[];
  accepted: Array<{ correctionId: string; sentenceIndex: number }>;
  lastEvidence?: WritingEvidence;
  versions: DraftVersion[];
  status: { text: string; kind: 'info' | 'ok' | 'error' };
  /** Another device changed the draft: the other version is open here and the learner's own text was kept as a separate draft. */
  conflict?: { reason: string; copyId?: string };
}

export type WriterResult = { ok: true; message?: string } | { ok: false; message: string; needsConfirmation?: string };

const blankRecord = (draftId: string, languageId: string, at: string): DraftRecord => ({
  draftId, languageId, mode: 'free', title: '', text: '', versions: [], assistance: [], createdAt: at, updatedAt: at,
});

/** Where each sentence of an analysis starts in the analysed text (undefined when the text no longer holds it). */
export function sentenceOffsets(text: string, sentences: readonly SentenceAnalysis[]): Array<number | undefined> {
  const out: Array<number | undefined> = [];
  let pos = 0;
  for (const s of sentences) {
    const at = s.text ? text.indexOf(s.text, pos) : -1;
    if (at < 0) { out.push(undefined); continue; }
    out.push(at);
    pos = at + s.text.length;
  }
  return out;
}

export interface WriterSession {
  view(): WriterView;
  onChange(cb: () => void): () => void;
  /** Called when the text was replaced by the session (accept, restore), so the editor can show it. */
  onTextReplaced(cb: (text: string) => void): () => void;
  load(): Promise<WriterView>;
  setText(text: string): void;
  setTitle(title: string): void;
  autosave(): Promise<WriterResult>;
  save(): Promise<WriterResult>;
  analyse(): Promise<WriterResult>;
  /** The writer profile (built once, on first need); undefined when it cannot be built. */
  profile(): Promise<WriterProfile | undefined>;
  canRequest(issueId: string, level: AssistanceLevel): boolean;
  assist(issueId: string, level: AssistanceLevel, opts?: { confirmed?: boolean }): Promise<WriterResult>;
  /** A model for a whole sentence of a targeted expression (no issue needed). */
  modelForSentence(sentenceIndex: number, opts?: { confirmed?: boolean }): Promise<WriterResult & { step?: AssistanceStep }>;
  accept(correctionId: string, opts?: { confirmMeaningChange?: boolean }): Promise<WriterResult>;
  reject(correctionId: string): Promise<WriterResult>;
  diffAgainstCurrent(versionId: string): DiffLine[];
  restore(versionId: string): Promise<WriterResult>;
  exportAs(format: DraftExportFormat): WriterResult & { file?: FileOut };
  remove(): Promise<WriterResult>;
  dispose(): void;
}

export interface WriterDeps {
  engine: TellEngine;
  host: TellHost;
  draftId: string;
  /** Where the profile is read from; the default reads the host's Repository API and writing events. */
  profileSource?: ProfileSource;
}

export function createWriterSession(deps: WriterDeps): WriterSession {
  const { engine, host, draftId } = deps;
  const nowIso = (): string => host.now().toISOString();
  const listeners = new Set<() => void>();
  const textListeners = new Set<(t: string) => void>();
  let disposed = false;

  let record: DraftRecord = blankRecord(draftId, engine.languageId, nowIso());
  let text = '';
  let title = '';
  let loaded = false;
  let notFound = false;
  let dirty = false;
  let saveState: SaveState = 'new';
  let analysis: DraftAnalysis | undefined;
  let analysedText: string | undefined;
  let analysing = false;
  let analysisError: string | undefined;
  const shown = new Map<string, AssistanceStep[]>();
  const refusals = new Map<string, Partial<Record<AssistanceLevel, string>>>();
  const rejectedIssues = new Set<string>();
  const accepted: Array<{ correctionId: string; sentenceIndex: number }> = [];
  let lastEvidence: WritingEvidence | undefined;
  let status: WriterView['status'] = { text: '', kind: 'info' };
  let conflict: WriterView['conflict'];
  let profile: WriterProfile | undefined;
  let profileTried = false;
  let timer: unknown;
  let working = Promise.resolve();

  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = working.then(fn, fn);
    working = run.then(() => undefined, () => undefined);
    return run;
  };
  const emit = (): void => { for (const l of [...listeners]) { try { l(); } catch { /* a view must not break the session */ } } };
  const say = (t: string, kind: 'info' | 'ok' | 'error' = 'info'): void => { status = { text: t, kind }; };
  const identity = (): TellHost['identity'] => host.identity;
  const lastVersionText = (): string | undefined => record.versions[record.versions.length - 1]?.text;
  const stale = (): boolean => analysis !== undefined && analysedText !== text;
  /** The highest ladder level dealt with for an issue: shown, or refused (a refused step is not retried, the ladder moves on). */
  const progress = (issueId: string): number => Math.max(0, ...(shown.get(issueId) ?? []).map((s) => s.level), ...Object.keys(refusals.get(issueId) ?? {}).map(Number));

  function issueViews(): IssueView[] {
    if (!analysis) return [];
    const fresh = !stale();
    const out: IssueView[] = [];
    for (const s of analysis.sentences) {
      for (const issue of s.issues) {
        const steps = shown.get(issue.issueId) ?? [];
        const top = progress(issue.issueId);
        const correction = steps.some((x) => x.level >= 4) ? s.corrections.find((c) => c.issueIds.includes(issue.issueId)) : undefined;
        const state = rejectedIssues.has(issue.issueId) ? 'rejected' : 'open';
        out.push({
          issue, sentenceIndex: s.index, state, steps, refusals: refusals.get(issue.issueId) ?? {},
          nextLevel: fresh && top < 6 ? ((top + 1) as AssistanceLevel) : undefined,
          ...(correction ? { correction } : {}),
          canRespond: fresh && !!correction && state === 'open',
        });
      }
    }
    return out;
  }

  const session: WriterSession = {
    view() {
      return {
        loaded, notFound, record, text, title, dirty, saveState,
        ...(analysis ? { analysis } : {}), analysing, ...(analysisError ? { analysisError } : {}), stale: stale(),
        coverage: analysis ? [...new Set(analysis.sentences.map((s) => s.checkerCoverage).filter(Boolean))] : [],
        ...(analysis ? { coverageSummary: summariseCoverage(analysis.sentences, analysis.languageId) } : {}),
        issues: issueViews(), accepted: [...accepted], ...(lastEvidence ? { lastEvidence } : {}),
        versions: record.versions, status, ...(conflict ? { conflict } : {}),
      };
    },
    onChange(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
    onTextReplaced(cb) { textListeners.add(cb); return () => { textListeners.delete(cb); }; },

    async load() {
      let synced: Awaited<ReturnType<typeof engine.stores.synced.load>>;
      let local: Awaited<ReturnType<typeof engine.stores.local.load>>;
      try { synced = await engine.stores.synced.load(draftId); } catch { synced = undefined; }
      try { local = await engine.stores.local.load(draftId); } catch { local = undefined; }
      if (disposed) return session.view();
      if (!synced && !local) { notFound = true; loaded = true; say('This draft was not found on this device or in your account.', 'error'); emit(); return session.view(); }
      const pick = local && (!synced || local.record.updatedAt >= synced.record.updatedAt) ? local.record : synced!.record;
      record = pick; text = pick.text; title = pick.title;
      saveState = synced ? (pick === synced.record ? 'saved' : 'unsaved') : 'device-only';
      if (record.versions.length === 0 && !synced) saveState = text ? 'unsaved' : 'new';
      loaded = true;
      say(synced ? '' : 'This draft is on this device. Save sends it to your account.', 'info');
      emit();
      return session.view();
    },

    setText(next) {
      if (next === text) return;
      text = next; dirty = true;
      if (saveState === 'saved') saveState = 'unsaved';
      host.timers.clear(timer);
      timer = host.timers.set(() => { void session.autosave(); }, AUTOSAVE_MS);
      emit();
    },
    setTitle(next) {
      if (next === title) return;
      title = next; dirty = true;
      host.timers.clear(timer);
      timer = host.timers.set(() => { void session.autosave(); }, AUTOSAVE_MS);
    },

    autosave: () => serial(async () => {
      host.timers.clear(timer);
      if (!loaded || notFound || !dirty) return { ok: true as const };
      const next: DraftRecord = { ...record, text, title, updatedAt: nowIso() };
      try {
        let r = await engine.stores.local.save(next, await currentRev());
        if (!r.ok) r = await engine.stores.local.save(next, r.current.revision); // the device copy is ours alone: last writer wins
        if (!r.ok) return { ok: false as const, message: 'The draft could not be kept on this device.' };
        record = next; dirty = false;
        say('Kept on this device.', 'info');
        emit();
        return { ok: true as const };
      } catch (e) {
        say(`Autosave failed: ${e instanceof Error ? e.message : String(e)}. Your text is still in the editor.`, 'error');
        emit();
        return { ok: false as const, message: 'Autosave failed.' };
      }
    }),

    save: () => serial(async () => {
      if (!loaded || notFound) return { ok: false as const, message: 'There is no draft to save.' };
      if (!text.trim()) { say('Write something first.', 'error'); emit(); return { ok: false as const, message: 'Write something first.' }; }
      host.timers.clear(timer);
      const unchanged = text === lastVersionText() && record.assistance.length === 0;
      let next = record;
      if (!unchanged) {
        next = engine.newVersion({ record: { ...record, text, title, updatedAt: nowIso() }, text, at: nowIso(), deviceId: identity().deviceId });
        next = { ...next, title, text };
      } else next = { ...record, title, text, updatedAt: nowIso() };
      const version = next.versions[next.versions.length - 1];
      record = next; dirty = false;
      // the synced store writes the device first and then tries the account, so a failing network never costs the text
      let where: 'account' | 'device' = 'account';
      try {
        const r = await engine.stores.synced.save(record, await currentRev());
        if (r.ok) {
          saveState = (await waiting()) ? 'device-only' : 'saved';
          where = saveState === 'saved' ? 'account' : 'device';
          conflict = undefined;
        } else {
          const copy = engine.stores.synced.conflicts?.().filter((c) => c.draftId === draftId).pop();
          if ((r.current as { deleted?: boolean }).deleted) {
            saveState = 'device-only';
            conflict = { reason: 'The draft was deleted on another device. Your text is kept on this device.' };
            say(conflict.reason, 'error');
          } else {
            record = r.current.record; title = record.title;
            replaceText(record.text); dirty = false; saveState = 'saved';
            analysis = undefined; analysedText = undefined; shown.clear(); refusals.clear(); rejectedIssues.clear();
            conflict = { reason: 'Another device changed this draft.', ...(copy ? { copyId: copy.copyId } : {}) };
            say(`Another device changed this draft. This window now shows the other version; ${copy ? 'your own text was kept as a separate draft' : 'your text was kept on this device'}.`, 'error');
          }
          emit();
          return { ok: false as const, message: conflict.reason };
        }
      } catch { where = 'device'; saveState = 'device-only'; }
      if (unchanged || !version) {
        say(where === 'account' ? 'Saved. Nothing changed since the last version, so no new version was made.' : 'Kept on this device; it will reach your account when you are online.', where === 'account' ? 'ok' : 'info');
        emit();
        return { ok: true as const };
      }
      const ev = engine.saveEvidence({
        identity: identity(), appVersion: host.appVersion, at: nowIso(), record, version, mode: record.mode, ...(analysis && !stale() ? { analysis } : {}),
      });
      lastEvidence = ev;
      const report = await submit(ev);
      say(`${where === 'account' ? 'Saved' : 'Kept on this device'} as version ${record.versions.length}. ${report}`, where === 'account' ? 'ok' : 'info');
      emit();
      return { ok: true as const };
    }),

    analyse: () => serial(async () => {
      if (!loaded || notFound) return { ok: false as const, message: 'There is no draft to check.' };
      if (!text.trim()) { say('Write something first; there is nothing to check yet.', 'error'); emit(); return { ok: false as const, message: 'Nothing to check.' }; }
      if (!engine.analysisAvailable) {
        analysisError = engine.analysisUnavailableReason ?? 'Checking is not available for this language yet. You can still write and save.';
        say(analysisError, 'error'); emit();
        return { ok: false as const, message: analysisError };
      }
      analysing = true; analysisError = undefined; emit();
      try {
        const run = await engine.analyze(draftId, text, await session.profile());
        analysis = run; analysedText = text;
        shown.clear(); refusals.clear(); rejectedIssues.clear();
        const n = run.sentences.reduce((a, s) => a + s.issues.length, 0);
        say(n ? `Checked ${run.sentences.length} sentence(s): ${n} place(s) to look at. Your text was not changed.` : `Checked ${run.sentences.length} sentence(s): nothing found. That means the checker saw nothing, not that the text is correct. Your text was not changed.`, 'info');
      } catch (e) {
        analysisError = `The check could not run: ${e instanceof Error ? e.message : String(e)}. Your text is unchanged.`;
        say(analysisError, 'error');
      } finally { analysing = false; }
      emit();
      return analysisError ? { ok: false as const, message: analysisError } : { ok: true as const };
    }),

    async profile() {
      if (!profileTried) {
        profileTried = true;
        const id = identity();
        try {
          profile = await engine.buildProfile(deps.profileSource ?? profileSourceFor(host), {
            learnerId: id.learnerId, enrolmentId: id.enrolmentId, deviceId: id.deviceId, languageId: id.languageId, ...(id.varietyId ? { varietyId: id.varietyId } : {}),
          });
        } catch { profile = undefined; }
      }
      return profile;
    },

    canRequest(issueId, level) {
      if (!analysis || stale()) return false;
      const top = progress(issueId);
      return level === top + 1 && level <= 6 && !!findIssue(issueId);
    },

    assist: (issueId, level, opts) => serial(async () => {
      const found = findIssue(issueId);
      if (!analysis || !found) return { ok: false as const, message: 'That issue is not part of the current check.' };
      if (stale()) return { ok: false as const, message: 'The text changed since the check. Check it again first.' };
      if (!session.canRequest(issueId, level)) return { ok: false as const, message: 'Help comes one step at a time, in order.' };
      if (level === 6 && !opts?.confirmed) {
        return { ok: false as const, message: 'A model sentence is the last step. Confirm that you want to see one.', needsConfirmation: 'Showing a model means you did not write this part yourself. Show it anyway?' };
      }
      const prior = shown.get(issueId) ?? [];
      let outcome;
      try { outcome = await engine.assist(analysis, { draftId, sentenceIndex: found.sentence.index, issueId, level, at: nowIso() }, prior); } catch (e) {
        return { ok: false as const, message: `Help could not be produced: ${e instanceof Error ? e.message : String(e)}` };
      }
      if (!outcome.ok || outcome.step.source === 'none') {
        const reason = outcome.ok ? outcome.step.content : outcome.reason;
        refusals.set(issueId, { ...(refusals.get(issueId) ?? {}), [level]: reason });
        say(`Step ${level} was not given: ${reason}`, 'info');
        emit();
        return { ok: false as const, message: reason };
      }
      // each step is tied to the sentence it was shown for, so authorship is judged per sentence
      const step = forSentence(outcome.step, found.sentence);
      shown.set(issueId, [...prior, step]);
      record = { ...record, assistance: [...record.assistance, step] };
      dirty = true;
      say('', 'info');
      emit();
      return { ok: true as const };
    }),

    modelForSentence: (sentenceIndex, opts) => serial(async () => {
      if (!analysis || stale()) return { ok: false as const, message: 'Check the text first.' };
      if (!opts?.confirmed) return { ok: false as const, message: 'Confirm that you want a model.', needsConfirmation: 'Showing a model means you did not write this part yourself. Show it anyway?' };
      let outcome;
      try { outcome = await engine.assist(analysis, { draftId, sentenceIndex, level: 6, at: nowIso() }, []); } catch (e) {
        return { ok: false as const, message: `A model could not be produced: ${e instanceof Error ? e.message : String(e)}` };
      }
      if (!outcome.ok || outcome.step.source === 'none') {
        const reason = outcome.ok ? outcome.step.content : outcome.reason;
        say(`No model was given: ${reason}`, 'info'); emit();
        return { ok: false as const, message: reason };
      }
      const sentence = analysis.sentences.find((s) => s.index === sentenceIndex);
      const step = sentence ? forSentence(outcome.step, sentence) : outcome.step;
      record = { ...record, assistance: [...record.assistance, step] };
      dirty = true; emit();
      return { ok: true as const, step };
    }),

    accept: (correctionId, opts) => serial(async () => {
      const f = findCorrection(correctionId);
      if (!analysis || !f) return { ok: false as const, message: 'That correction is not part of the current check.' };
      if (stale()) return { ok: false as const, message: 'The text changed since the check. Check it again first.' };
      const { correction: c, sentence } = f;
      const levelShown = topLevelFor(c);
      if (levelShown < 4) return { ok: false as const, message: 'Show the corrected sentence first.' };
      if (c.issueIds.every((id) => rejectedIssues.has(id))) return { ok: false as const, message: 'You rejected this correction.' };
      if (c.meaningChange && !opts?.confirmMeaningChange) {
        return { ok: false as const, message: 'This correction changes the meaning.', needsConfirmation: `This changes the meaning: ${c.meaningChange}. Accept anyway?` };
      }
      const offsets = sentenceOffsets(text, analysis.sentences);
      const start = offsets[analysis.sentences.indexOf(sentence)];
      if (start === undefined) return { ok: false as const, message: 'The sentence is no longer in the text. Check it again.' };
      // the text before the change stays in the history
      if (text.trim() && text !== lastVersionText()) await snapshot('Before accepting a correction');
      const next = text.slice(0, start) + c.suggested + text.slice(start + sentence.text.length);
      const issues = sentence.issues.filter((i) => c.issueIds.includes(i.issueId));
      replaceText(next);
      accepted.push({ correctionId: c.correctionId, sentenceIndex: sentence.index });
      // the replaced sentence is no longer what the check looked at: its markers go, the others stay valid
      analysis = { ...analysis, sentences: analysis.sentences.map((s) => (s === sentence ? { ...s, text: c.suggested, issues: [], corrections: [] } : s)) };
      analysedText = next;
      const ev = engine.correctionEvidence({
        identity: identity(), appVersion: host.appVersion, at: nowIso(), draftId, mode: record.mode, outcome: 'accepted', correction: c, issues, levelShown,
      });
      const report = await submit(ev);
      lastEvidence = ev;
      say(`Sentence ${sentence.index + 1} replaced. The earlier wording is in your versions. ${report}`, 'ok');
      emit();
      return { ok: true as const };
    }),

    reject: (correctionId) => serial(async () => {
      const f = findCorrection(correctionId);
      if (!analysis || !f) return { ok: false as const, message: 'That correction is not part of the current check.' };
      const { correction: c, sentence } = f;
      const levelShown = topLevelFor(c);
      if (levelShown < 4) return { ok: false as const, message: 'Show the corrected sentence first.' };
      for (const id of c.issueIds) rejectedIssues.add(id);
      const issues = sentence.issues.filter((i) => c.issueIds.includes(i.issueId));
      const ev = engine.correctionEvidence({
        identity: identity(), appVersion: host.appVersion, at: nowIso(), draftId, mode: record.mode, outcome: 'rejected', correction: c, issues, levelShown,
      });
      const report = await submit(ev);
      lastEvidence = ev;
      say(`Correction rejected. The marker stays, muted. ${report}`, 'info');
      emit();
      return { ok: true as const };
    }),

    diffAgainstCurrent(versionId) {
      const v = record.versions.find((x) => x.versionId === versionId);
      return v ? engine.diff(v, text) : [];
    },

    restore: (versionId) => serial(async () => {
      const v = record.versions.find((x) => x.versionId === versionId);
      if (!v) return { ok: false as const, message: 'That version does not exist.' };
      if (text.trim() && text !== lastVersionText()) await snapshot('Before restoring an older version');
      const next = engine.restore(record, versionId, nowIso(), identity().deviceId);
      record = { ...next, assistance: next.assistance ?? [] };
      replaceText(record.text);
      analysis = undefined; analysedText = undefined; shown.clear(); refusals.clear(); rejectedIssues.clear();
      dirty = true;
      await persist();
      say(`Restored as version ${record.versions.length}. The older versions are still there.`, 'ok');
      emit();
      return { ok: true as const };
    }),

    exportAs(format) {
      if (!loaded || notFound) return { ok: false as const, message: 'There is no draft to export.' };
      const file = engine.exportDraft({ ...record, text, title }, format);
      return { ok: true as const, file };
    },

    remove: () => serial(async () => {
      host.timers.clear(timer);
      try { await engine.deleteDraft(draftId); } catch (e) {
        say(`The draft could not be deleted: ${e instanceof Error ? e.message : String(e)}`, 'error'); emit();
        return { ok: false as const, message: 'The draft could not be deleted.' };
      }
      dirty = false; notFound = true;
      return { ok: true as const };
    }),

    dispose() { disposed = true; host.timers.clear(timer); listeners.clear(); textListeners.clear(); },
  };

  // ───────────── helpers ─────────────

  /** The step, tied to the sentence it was shown for (an engine that already did so keeps its own values). */
  function forSentence(step: AssistanceStep, sentence: SentenceAnalysis): AssistanceStep {
    return { ...step, sentenceIndex: step.sentenceIndex ?? sentence.index, sentenceHash: step.sentenceHash ?? sentenceScopeHash(sentence.text) };
  }
  function findIssue(issueId: string): { issue: Issue; sentence: SentenceAnalysis } | undefined {
    for (const s of analysis?.sentences ?? []) { const issue = s.issues.find((i) => i.issueId === issueId); if (issue) return { issue, sentence: s }; }
    return undefined;
  }
  function findCorrection(correctionId: string): { correction: Correction; sentence: SentenceAnalysis } | undefined {
    for (const s of analysis?.sentences ?? []) { const correction = s.corrections.find((c) => c.correctionId === correctionId); if (correction) return { correction, sentence: s }; }
    return undefined;
  }
  function topLevelFor(c: Correction): number {
    return Math.max(0, ...c.issueIds.flatMap((id) => (shown.get(id) ?? []).map((s) => s.level)));
  }
  function replaceText(next: string): void {
    text = next; dirty = true;
    if (saveState === 'saved') saveState = 'unsaved';
    for (const l of [...textListeners]) { try { l(next); } catch { /* */ } }
  }

  /** A version of the CURRENT text, so a change the learner asked for never loses what was there. The pending assistance stays pending. */
  async function snapshot(note: string): Promise<void> {
    const pending = record.assistance;
    const made = engine.newVersion({ record: { ...record, text, title, updatedAt: nowIso() }, text, at: nowIso(), deviceId: identity().deviceId, note });
    record = { ...made, text, title, assistance: pending };
    await persist();
  }

  async function currentRev(): Promise<number> {
    try { return (await engine.stores.local.load(draftId))?.revision ?? 0; } catch { return 0; }
  }
  async function waiting(): Promise<boolean> {
    try { return !!(await engine.stores.synced.pendingPush?.())?.includes(draftId); } catch { return false; }
  }

  /** Keeps the record on the DEVICE only. Accepting a correction or restoring a version changes the draft, but only Save reaches the account. */
  async function persist(): Promise<void> {
    try {
      let r = await engine.stores.local.save(record, await currentRev());
      if (!r.ok) r = await engine.stores.local.save(record, r.current.revision);
      if (r.ok) { dirty = false; saveState = 'unsaved'; }
    } catch { /* the text is still in the editor and the next autosave tries again */ }
  }

  async function submit(ev: WritingEvidence): Promise<string> {
    const clean = ev.events.filter((e) => validateEvent(e).length === 0);
    const dropped = ev.events.length - clean.length;
    if (!clean.length) return dropped ? 'The evidence was not sent: it did not validate.' : '';
    const r = await host.submit(clean);
    const parts: string[] = [];
    if (r.sent) parts.push(`${r.sent} observation(s) sent`);
    if (r.queued) parts.push(`${r.queued} waiting to be sent`);
    if (r.refused.length || dropped) parts.push(`${r.refused.length + dropped} refused`);
    return parts.length ? `Evidence: ${parts.join(', ')}.` : '';
  }

  return session;
}
