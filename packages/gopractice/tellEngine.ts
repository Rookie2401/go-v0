/**
 * The one file that wires GoTell's real modules (engine, prompts, profile, documents, evidence, privacy) and the language
 * pack runtime to the `TellEngine` port the writing screens use. The screens know the port only; a test passes a fake
 * through `tellOverrides.engine`.
 *
 * Storage: the learner's own area (`u:<learner>:` prefix, the same one the shell's queue and event log live in) holds the
 * device copies of drafts (`doc:*`, kept by the sync package's dirty-tracked local documents) and two GoTell keys:
 *   gotell:remote-consent     boolean            the remote-assistance switch (off by default; no provider is wired); each change also writes a
 *                                                ConsentGiven / ConsentWithdrawn event, scope gotell:remote-assistance
 *   gotell:save-requested     string[]           draft ids the learner saved while the account could not be reached
 */
import { createAnalyzer, createAssistance, judgeAuthorship, stepsForSentence } from '../gotell/src/engine';
import type { Analyzer } from '../gotell/src/engine';
import {
  createDraftStore, createLocalDraftStore, createSyncingDraftStore, diffVersions, exportDraft, exportFileName, newVersion, restoreVersion, splitSentences,
} from '../gotell/src/documents';
import type { SentenceJudge } from '../gotell/src/documents';
import { correctionAccepted, correctionRejected, sentenceKeyOf, writingEvidence } from '../gotell/src/evidence';
import { buildWriterProfile } from '../gotell/src/profile';
import { PROMPTS, guidanceFor, guidancePackFor, promptById, promptsFor, selectPrompt } from '../gotell/src/prompts';
import { createRemoteConsent, deleteDraft, exportLearnerWriting, forgetDevice, privacyStatement } from '../gotell/src/privacy';
import type { DiffLine, DraftExportFormat, FileOut, PromptGuidance, TellEngine } from '../gotell/src/workspace/port';
import type { AssistanceLevel, AssistanceStep, DraftVersion, Identity as TellIdentity, SentenceVersion } from '../gotell/src/types';
import { createPackRuntime, packFor } from '../language-packs/src';
import type { AppContext } from './context';
import type { Identity } from './ports';

const CONSENT_KEY = 'gotell:remote-consent';
const REQUESTED_KEY = 'gotell:save-requested';

const MIME: Record<DraftExportFormat, string> = { json: 'application/json;charset=utf-8', text: 'text/plain;charset=utf-8', markdown: 'text/markdown;charset=utf-8' };

export async function createTellEngine(ctx: AppContext, id: Identity): Promise<TellEngine> {
  const data = await ctx.data();
  if (!data) throw new Error('Sign in to use the writing workspace.');
  const { api } = await ctx.api();
  const area = data.area;
  const now = (): Date => ctx.deps.now();
  const identity: TellIdentity = {
    learnerId: id.learnerId, enrolmentId: id.enrolmentId, deviceId: id.deviceId, languageId: id.languageId, ...(id.varietyId ? { varietyId: id.varietyId } : {}),
  };

  // ── drafts: the device copy (autosave) and the combined store (Save) ──
  const remote = createDraftStore({ api, identity, now });
  const local = createLocalDraftStore(area, { identity, now });
  const syncing = createSyncingDraftStore({ local, remote, now });
  const requested = async (): Promise<string[]> => {
    const v = (await area.get(REQUESTED_KEY))[REQUESTED_KEY];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  };
  const setRequested = async (ids: string[]): Promise<void> => { if (ids.length) await area.set({ [REQUESTED_KEY]: [...new Set(ids)] }); else await area.remove(REQUESTED_KEY); };
  const synced: TellEngine['stores']['synced'] = {
    list: () => syncing.list(),
    load: (draftId) => syncing.load(draftId),
    async save(record, expectedRevision) {
      const r = await syncing.save(record, expectedRevision);
      // a Save the account has not accepted yet is remembered, so it is sent when the learner is next online
      const waiting = (await syncing.pendingPush()).includes(record.draftId);
      const ids = await requested();
      await setRequested(waiting ? [...ids, record.draftId] : ids.filter((x) => x !== record.draftId));
      return r;
    },
    async remove(draftId) {
      await syncing.remove(draftId);
      await setRequested((await requested()).filter((x) => x !== draftId));
    },
    conflicts: () => syncing.conflicts(),
    pendingPush: () => syncing.pendingPush(),
  };

  // ── checking ──
  const manifest = packFor(id.languageId);
  let analyzer: Analyzer | undefined;
  let analysisUnavailableReason: string | undefined;
  if (!manifest) analysisUnavailableReason = `There is no language pack for ${id.languageId}, so nothing can be checked yet. You can still write and save.`;
  else if (manifest.status !== 'installable') analysisUnavailableReason = `The ${manifest.identity.name} pack is not installable yet, so nothing can be checked. You can still write and save.`;
  else {
    const runtime = createPackRuntime(manifest, { fetch: ctx.deps.fetch, baseUrl: ctx.deps.config.assetBaseUrl ?? './' });
    analyzer = createAnalyzer({ languageId: id.languageId, runtime, manifest, now });
    if (!analyzer.hasChecker) { analysisUnavailableReason = `The ${manifest.identity.name} pack has no checker yet, so nothing can be checked. You can still write and save.`; analyzer = undefined; }
  }
  // the remote-assistance switch: off unless the stored value is the boolean true; switching writes ConsentGiven / ConsentWithdrawn
  // (scope gotell:remote-assistance) through the shell's event queue, and the ladder reads the gate on every call
  const remoteConsent = createRemoteConsent({
    identity, appVersion: ctx.deps.appVersion, initial: (await area.get(CONSENT_KEY))[CONSENT_KEY],
    persist: (on) => area.set({ [CONSENT_KEY]: on }), record: (events) => ctx.record(events), now, newId: () => ctx.deps.newId(),
  });
  const assistance = analyzer ? createAssistance({ analyzer, consent: remoteConsent.gate, now }) : undefined;

  const pack = guidancePackFor(id.languageId);
  const labelOf = (unitId: string): string => unitId.split(':')[2] ?? unitId;

  // authorship: per sentence, from the steps shown FOR THAT SENTENCE; a sentence carried over unchanged keeps what it had
  const judgeFor = (steps: readonly AssistanceStep[]): SentenceJudge => (sentence, prior: SentenceVersion | undefined, index) => {
    const levelsOf = (xs: readonly AssistanceStep[]): AssistanceLevel[] => [...new Set(xs.map((s) => s.level))].sort((a, b) => a - b);
    const authorship = judgeAuthorship(sentence, steps, { sentenceIndex: index, ...(prior ? { previous: prior.text } : {}) });
    if (prior && prior.text.normalize('NFC').trim() === sentence.normalize('NFC').trim() && authorship === 'independent') return { authorship: prior.authorship, assistance: [...prior.assistance] };
    if (authorship === 'independent') return { authorship, assistance: [] };
    const mine = levelsOf(stepsForSentence(steps, sentence, index));
    return { authorship, assistance: mine.length ? mine : levelsOf(steps) };
  };

  const toLines = (before: DraftVersion, text: string): DiffLine[] => {
    const current: DraftVersion = { ...before, text, sentences: splitSentences(text).map((s) => ({ text: s, authorship: 'independent' as const, assistance: [], at: before.at })) };
    const out: DiffLine[] = [];
    for (const e of diffVersions(before, current).entries) {
      if (e.kind === 'unchanged') out.push({ kind: 'same', text: e.after!.text });
      else if (e.kind === 'removed') out.push({ kind: 'removed', text: e.before!.text });
      else if (e.kind === 'added') out.push({ kind: 'added', text: e.after!.text });
      else out.push({ kind: 'removed', text: e.before!.text }, { kind: 'added', text: e.after!.text });
    }
    return out;
  };

  const engine: TellEngine = {
    languageId: id.languageId,
    ...(id.varietyId ? { varietyId: id.varietyId } : {}),
    analysisAvailable: !!analyzer,
    ...(analysisUnavailableReason ? { analysisUnavailableReason } : {}),

    prompts: (opts) => promptsFor({ languageId: id.languageId, mode: opts.mode, ...(opts.category ? { category: opts.category } : {}), ...(opts.teamId ? { teamId: opts.teamId } : {}) }, PROMPTS),
    promptById: (promptId) => promptById(promptId, PROMPTS),
    suggestPrompt(profile, opts) {
      const candidates = promptsFor({ languageId: id.languageId, mode: opts.mode, ...(opts.category ? { category: opts.category } : {}), ...(opts.teamId ? { teamId: opts.teamId } : {}) }, PROMPTS);
      const pick = selectPrompt(candidates, profile, opts.mode, { avoid: opts.exclude ?? [], random: ctx.deps.random });
      return pick ? { prompt: pick.prompt, reason: pick.reason } : undefined;
    },
    guidance({ prompt, intent, profile }): PromptGuidance {
      const lines: string[] = [];
      const familiarWords: string[] = [];
      const frames: string[] = [...(prompt?.frames ?? [])];
      if (prompt && profile) {
        const g = guidanceFor(prompt, profile, pack);
        lines.push(g.lead, ...g.suggestions, ...g.watchFor.map((w) => `Watch for ${w.constructionId}. ${w.why}`));
        familiarWords.push(...g.vocabulary.map((v) => v.label));
        lines.push(...g.honesty);
      }
      if (intent !== undefined && intent.trim()) {
        // GoTell does not translate: the English stays here, and what is offered is the writer's own words and a pack pattern
        lines.push('GoTell does not translate your English. Below are words you have used yourself and a pattern from the language pack; build the sentence from them.');
        for (const unitId of (profile?.productive ?? []).filter((u) => u.startsWith('lemma:')).slice(0, 8)) familiarWords.push(labelOf(unitId));
        for (const pat of pack.tutorialPatterns?.() ?? []) frames.push(`${pat.example} (${pat.gloss})`);
      }
      return { lines, familiarWords: [...new Set(familiarWords)], frames: [...new Set(frames)] };
    },
    buildProfile: (source, ident) => buildWriterProfile(source, ident, now().toISOString()),

    async analyze(draftId, text, profile) {
      if (!analyzer) throw new Error(analysisUnavailableReason ?? 'Checking is not available.');
      return analyzer.analyzeDraft(draftId, text, profile);
    },
    async assist(analysis, req, prior) {
      if (!assistance) return { ok: false, reason: analysisUnavailableReason ?? 'Checking is not available.' };
      const r = await assistance.step(analysis, req, prior);
      if ('refused' in r) return { ok: false, reason: r.reason };
      return { ok: true, step: r };
    },

    stores: { local, synced },
    newVersion: (input) => newVersion(input.record, input.text, judgeFor(input.record.assistance), input.deviceId, input.at, input.note),
    diff: (version, currentText) => toLines(version, currentText),
    restore: (record, versionId, at, deviceId) => restoreVersion(record, versionId, deviceId, at),
    exportDraft: (record, format): FileOut => ({ filename: exportFileName(record, format), mime: MIME[format], content: exportDraft(record, format) }),
    deleteDraft: async (draftId) => {
      const r = await deleteDraft(synced, draftId);
      if (!r.ok) throw new Error(r.message);
    },

    saveEvidence(input) {
      return writingEvidence(input.record, input.version, input.identity, input.at, {
        ...(input.analysis ? { analysis: input.analysis } : {}), ...(manifest ? { packId: manifest.packId } : {}),
      });
    },
    correctionEvidence(input) {
      const c = input.correction;
      const build = input.outcome === 'accepted' ? correctionAccepted : correctionRejected;
      const event = build({
        correctionId: c.correctionId, issueIds: [...c.issueIds], categories: [...new Set(input.issues.map((i) => i.category))],
        ...(c.meaningChange ? { meaningChange: c.meaningChange } : {}), draftId: input.draftId, sentenceKey: sentenceKeyOf(c.original),
      }, input.identity, input.at);
      const what = input.outcome === 'accepted' ? 'accepted' : 'rejected';
      return {
        events: [event],
        summary: [
          `Recorded that you ${what} a correction (${[...new Set(input.issues.map((i) => i.category))].join(', ') || 'no category'}). Only the kind of correction and a hash of the sentence were recorded, never the sentence.`,
          'This is a decision you made, not evidence that you can produce the sentence yourself.',
        ],
      };
    },

    privacy: {
      statement: () => { const s = privacyStatement(); return { title: s.title, sections: s.sections.map((x) => ({ heading: x.heading, points: [...x.points] })) }; },
      async exportAll() {
        const r = await exportLearnerWriting(api, { now });
        if (!r.ok) throw new Error(r.message);
        const day = now().toISOString().slice(0, 10);
        return { filename: `gotell-writing-${day}.json`, mime: MIME.json, content: r.json };
      },
      async cleanDevice() {
        const r = await forgetDevice(area);
        await setRequested([]);
        return { removed: r.drafts };
      },
      remote: {
        providerName: () => undefined, // no remote assistant is wired in this build
        consent: () => remoteConsent.value(),
        setConsent: (on) => remoteConsent.set(on),
      },
    },
    async flushPending() {
      const ids = await requested();
      let sent = 0;
      for (const draftId of ids) {
        try {
          const loaded = await local.load(draftId);
          if (!loaded) continue;
          await synced.save(loaded.record, loaded.revision);
          if (!(await syncing.pendingPush()).includes(draftId)) sent += 1;
        } catch { /* still waiting */ }
      }
      return { sent, waiting: (await requested()).length };
    },
  };
  return engine;
}
