/** Which screens are done, computed from what is actually true (not from what was clicked). */
import type { AppContext } from './context';

/**
 * The steps that finish setup, in order. The account is not among them: it is optional, last, and only keeps progress across devices.
 * (Welcome, choose a language, install its pack, the orientation, the reader.)
 */
export const SETUP_IDS: readonly string[] = ['welcome', 'language', 'pack', 'tutorial', 'reader'];

export type Completion = Record<string, boolean>;

/** Which screens are done. Setup screens by what is actually true; settings screens once opened. */
export async function computeCompletion(ctx: AppContext): Promise<Completion> {
  const [session, progress, active] = await Promise.all([ctx.state.getSession(), ctx.state.getProgress(), ctx.activeLanguage()]);
  const pack = active?.languageId ? ctx.deps.packs.packFor(active.languageId) : undefined;
  const expired = !!session && Date.parse(session.expiresAt) <= ctx.deps.now().getTime();
  return {
    welcome: progress.visited.includes('welcome'),
    language: !!active,
    pack: !!pack && progress.packs[pack.packId]?.ok === true,
    tutorial: progress.tutorial !== 'pending',
    reader: ctx.inExtension || progress.readerAck,
    account: !!session && !expired,
    sync: progress.visited.includes('sync'),
    privacy: progress.visited.includes('privacy'),
    diagnostics: progress.visited.includes('diagnostics'),
  };
}

export const setupComplete = (c: Completion): boolean => SETUP_IDS.every((id) => c[id]);
