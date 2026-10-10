/**
 * Builds the `TellHost` the workspace sees from the shell's context. This is the only place the workspace touches the
 * shell: the Repository API, the learner's local event log (for goal preferences) and the offline queue.
 */
import type { GoEvent } from '../../../repository-contract/src';
import type { FileOut, SubmitReport, TellHost, WorkspaceApi } from '../../../gotell/src/workspace/port';
import type { AppContext } from '../../context';
import type { Identity } from '../../ports';
import { browserDownload, tellOverrides } from './overrides';

/** The workspace reads the learner's writing events and preferences, nothing else from the log. */
const WRITING_KINDS = new Set<string>(['PreferenceChanged', 'DraftSaved', 'SentenceSubmitted', 'CorrectionAccepted', 'CorrectionRejected', 'ProductionRecorded']);

const realTimers = { set: (fn: () => void, ms: number): unknown => setTimeout(fn, ms), clear: (h: unknown): void => clearTimeout(h as ReturnType<typeof setTimeout>) };

export async function makeHost(ctx: AppContext, id: Identity): Promise<TellHost> {
  const { api } = await ctx.api();
  const workspaceApi = api as WorkspaceApi;
  return {
    identity: {
      learnerId: id.learnerId, enrolmentId: id.enrolmentId, deviceId: id.deviceId, languageId: id.languageId,
      ...(id.varietyId ? { varietyId: id.varietyId } : {}), email: id.email,
    },
    appVersion: ctx.deps.appVersion,
    now: () => ctx.deps.now(),
    newId: () => ctx.deps.newId(),
    api: workspaceApi,
    async submit(events: GoEvent[]): Promise<SubmitReport> {
      const report: SubmitReport = { sent: 0, queued: 0, refused: [] };
      const data = await ctx.data();
      for (const e of events) {
        if (e.kind === 'ProductionRecorded' && typeof workspaceApi.submitWriting === 'function') {
          try {
            const r = await workspaceApi.submitWriting({ observation: e });
            if (r.ok) { report.sent += 1; if (data) await data.log.append(data.learnerId, [e]); continue; }
          } catch { /* offline or refused: the queue below keeps it */ }
        }
        const recorded = await ctx.record([e]);
        report.queued += recorded.queued;
        report.refused.push(...recorded.refused);
      }
      return report;
    },
    async events() {
      const all = await ctx.events(id.languageId);
      return all.filter((e) => WRITING_KINDS.has(e.kind));
    },
    async syncLine() {
      // no account: the drafts are kept on this device, and there is nothing to be offline from
      if ((await ctx.mode()) === 'device') return { text: 'On this device only. Drafts are saved here.', online: true };
      const v = await ctx.syncView();
      const s = v.status;
      const online = s ? s.online : true;
      const waiting = s?.pending ? `${s.pending} waiting to be sent` : 'nothing waiting';
      return { text: online ? `Online. ${waiting}.` : `Offline. Drafts stay on this device and are sent later; ${waiting}.`, online };
    },
    timers: tellOverrides.timers ?? realTimers,
    download: (file: FileOut) => (tellOverrides.download ?? browserDownload)(file),
  };
}
