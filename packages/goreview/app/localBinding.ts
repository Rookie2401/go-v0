/**
 * The one file that imports the local-repository package and adapts it to `LocalRepo` (localRepo.ts), for GoReview running as a page of the
 * GoLearn extension (`chrome-extension://<id>/review/index.html`). The page holds no repository of its own: the extension's background worker
 * owns the single copy of the device's data, and this page reaches it with `connectLocalRepository` over `MSG.localRepo`. Where there is no
 * extension (the hosted copy, a plain tab) `getExtension` returns undefined and the app needs an account.
 */
import { connectLocalRepository } from '../../repository-local/src/proxy';
import type { LocalRepo } from './localRepo';

/** The slice of the extension API this page uses. */
export interface ExtensionApi {
  runtime: { id?: string; sendMessage(message: unknown): Promise<unknown>; getURL?(path: string): string };
}

/** The message names are the extension's own (packages/golearn-extension/src/platform.ts `MSG`); this page only sends them. */
const MSG = {
  localRepo: 'golearn:local-repo',
  connect: 'golearn:connect',
  disconnect: 'golearn:disconnect',
} as const;

interface GlobalLike {
  chrome?: { runtime?: Partial<ExtensionApi['runtime']> };
  location?: { protocol?: string };
}

/** The extension API, only when this page really is an extension page (an ordinary tab also has a `chrome` object, without `runtime.id`). */
export function getExtension(g: GlobalLike = globalThis as unknown as GlobalLike): ExtensionApi | undefined {
  const r = g.chrome?.runtime;
  if (!r || typeof r.id !== 'string' || !r.id || typeof r.sendMessage !== 'function') return undefined;
  const protocol = g.location?.protocol;
  if (protocol !== undefined && protocol !== 'chrome-extension:' && protocol !== 'moz-extension:') return undefined;
  return { runtime: r as ExtensionApi['runtime'] };
}

export function localRepoFor(ext: ExtensionApi): LocalRepo {
  const send = (message: unknown): Promise<unknown> => ext.runtime.sendMessage(message);
  const base = connectLocalRepository(send, MSG.localRepo);
  const ask = async (op: string): Promise<Record<string, unknown>> => {
    const reply = (await send({ type: MSG.localRepo, op })) as Record<string, unknown> | undefined;
    if (!reply || reply.ok !== true) throw new Error(typeof reply?.error === 'string' ? reply.error : 'the on-device Repository did not answer');
    return reply;
  };
  return {
    ...base,
    // the worker also uploads by itself right after it signs in; whichever finishes second sends nothing, so report what the status says is uploaded
    async uploadTo(remote) {
      const done = await base.uploadTo(remote);
      let total: number | undefined;
      try { const st = await ask('status'); total = typeof st.uploaded === 'number' ? st.uploaded : undefined; } catch { /* the call's own count stands */ }
      return { ...done, ...(total !== undefined ? { total } : {}) };
    },
    async connectAccount(input) {
      try {
        const r = (await send({ type: MSG.connect, ...input })) as { ok?: boolean; message?: string; error?: string } | undefined;
        if (r && r.ok === true) return { ok: true };
        if (!r) return { ok: false, message: 'The extension did not answer.' };
        return { ok: false, message: typeof r.message === 'string' && r.message ? r.message : 'The extension could not sign you in.', ...(typeof r.error === 'string' && r.error ? { code: r.error } : {}) };
      } catch { return { ok: false, message: 'The extension did not answer.' }; }
    },
    async disconnectAccount() { try { await send({ type: MSG.disconnect }); } catch { /* the page's own session is dropped anyway */ } },
    async activeLanguageId() {
      try { const st = await ask('status'); return typeof st.languageId === 'string' ? st.languageId : undefined; } catch { return undefined; }
    },
  };
}
