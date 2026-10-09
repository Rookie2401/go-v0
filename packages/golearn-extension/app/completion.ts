/** Which screens are done, computed from what is actually true (not from what was clicked). */
import type { AppContext } from './context';

export const SETUP_IDS: readonly string[] = ['welcome', 'account', 'team', 'pack', 'reader', 'tutorial'];

export type Completion = Record<string, boolean>;

/** Which screens are done. Setup screens by what is actually true; settings screens once opened. */
export async function computeCompletion(ctx: AppContext): Promise<Completion> {
  const [session, progress] = await Promise.all([ctx.state.getSession(), ctx.state.getProgress()]);
  const pack = session?.languageId ? ctx.deps.packs.packFor(session.languageId) : undefined;
  const expired = !!session && Date.parse(session.expiresAt) <= ctx.deps.now().getTime();
  return {
    welcome: progress.visited.includes('welcome'),
    account: !!session && !expired,
    team: !!session && !!session.enrolmentId,
    pack: !!pack && progress.packs[pack.packId]?.ok === true,
    reader: ctx.inExtension || progress.readerAck,
    tutorial: progress.tutorial !== 'pending',
    sync: progress.visited.includes('sync'),
    privacy: progress.visited.includes('privacy'),
    diagnostics: progress.visited.includes('diagnostics'),
  };
}

export const setupComplete = (c: Completion): boolean => SETUP_IDS.every((id) => c[id]);

