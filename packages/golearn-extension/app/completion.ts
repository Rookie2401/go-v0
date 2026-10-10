/** Which screens are done, computed from what is actually true (not from what was clicked). */
import type { AppContext } from './context';

/**
 * What finishes setup: at least one language chosen and its pack installed (and verified). Nothing else is required; the account is
 * optional and the reader integration is an advanced screen.
 */
export const SETUP_IDS: readonly string[] = ['language', 'pack'];

export type Completion = Record<string, boolean>;

/** Which screens are done. Setup by what is actually true; `languages` is the whole of setup; the advanced screens by being opened. */
export async function computeCompletion(ctx: AppContext): Promise<Completion> {
  const [session, progress, active] = await Promise.all([ctx.state.getSession(), ctx.state.getProgress(), ctx.activeLanguage()]);
  const pack = active?.languageId ? ctx.deps.packs.packFor(active.languageId) : undefined;
  const expired = !!session && Date.parse(session.expiresAt) <= ctx.deps.now().getTime();
  const language = !!active;
  const installed = !!pack && progress.packs[pack.packId]?.ok === true;
  return {
    languages: language && installed,
    language,
    pack: installed,
    account: !!session && !expired,
    reader: ctx.inExtension || progress.readerAck,
    sync: progress.visited.includes('sync'),
    privacy: progress.visited.includes('privacy'),
    diagnostics: progress.visited.includes('diagnostics'),
  };
}

export const setupComplete = (c: Completion): boolean => SETUP_IDS.every((id) => c[id]);
