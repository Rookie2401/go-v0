/**
 * The one file that imports the local-repository package and adapts it to `LocalRepo` (localRepo.ts).
 *
 *  - In the extension the single repository lives in the background worker (it records every lookup into it); this page reaches it with
 *    `connectLocalRepository` over `MSG.localRepo`. Two helpers are added on top: `enrol` / `select` (the learner's choice of a language is made
 *    where the repository is, so the worker's recording follows it) and an `uploadTo` that reports how many of the device's events the account holds.
 *  - In the hosted web app there is no worker: the page opens the repository itself over its own storage area. That code (the whole in-process
 *    service) is a separate chunk, and the extension's options-page build, a single classic script that only ever runs inside the extension,
 *    carries none of it (`__GOLEARN_ANALYSERS__`, the same build-time constant the analyser loader uses).
 */
import { connectLocalRepository } from '../../repository-local/src/proxy';
import { MSG, type ChromeApi, type StorageArea } from '../src/platform';
import { keyValueAreaOf, type LocalRepo } from './localRepo';

declare const __GOLEARN_ANALYSERS__: string | undefined;

type Env = { area: StorageArea; chrome: ChromeApi | undefined };

async function viaWorker(chrome: ChromeApi): Promise<LocalRepo> {
  const send = (message: unknown): Promise<unknown> => chrome.runtime.sendMessage(message);
  const base = connectLocalRepository(send, MSG.localRepo);
  const ask = async (op: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> => {
    const reply = (await send({ type: MSG.localRepo, op, ...extra })) as Record<string, unknown> | undefined;
    if (!reply || reply.ok !== true) throw new Error(typeof reply?.error === 'string' ? reply.error : 'the on-device Repository did not answer');
    return reply;
  };
  return {
    ...base,
    // the worker also uploads in the background right after a sign-in; whichever finishes second sends nothing, so the number shown is
    // what the status reports as uploaded in all, not what this one call happened to send
    async uploadTo(remote) {
      const done = await base.uploadTo(remote);
      let total: number | undefined;
      try { const st = await ask('status'); total = typeof st.uploaded === 'number' ? st.uploaded : undefined; } catch { /* the call's own count stands */ }
      return { ...done, ...(total !== undefined ? { total } : {}) };
    },
    async enrol(input) {
      const r = await ask('enrol', { ...input });
      const e = r.enrolment as { enrolmentId?: unknown } | undefined;
      if (!e || typeof e.enrolmentId !== 'string') throw new Error('the on-device Repository gave no enrolment');
      return { enrolmentId: e.enrolmentId };
    },
    async select(enrolmentId) { await ask('select', { enrolmentId }); },
  };
}

async function viaPage(env: Env): Promise<LocalRepo> {
  if (env.chrome) return viaWorker(env.chrome);
  const { openLocalRepository } = await import('../../repository-local/src/local');
  return await openLocalRepository({ area: keyValueAreaOf(env.area) });
}

async function workerOnly(env: Env): Promise<LocalRepo> {
  if (env.chrome) return viaWorker(env.chrome);
  throw new Error('the on-device Repository is only available inside the extension in this build');
}

/** Opens the on-device Repository: through the worker inside the extension, in the page itself in the hosted web app. */
export const openLocalRepo: (env: Env) => Promise<LocalRepo> =
  typeof __GOLEARN_ANALYSERS__ === 'string' && __GOLEARN_ANALYSERS__ === 'url' ? workerOnly : viaPage;
