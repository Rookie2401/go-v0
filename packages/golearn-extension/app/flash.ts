/**
 * A one-line note carried from one screen to the next: the sign-in page moves on to the languages page the moment the learner is in,
 * and says on arrival who they are signed in as (and what was uploaded). Kept in memory per application context; read once.
 */
import type { AppContext } from './context';

const notes = new WeakMap<AppContext, string>();

export function setFlash(ctx: AppContext, text: string): void { notes.set(ctx, text); }

export function takeFlash(ctx: AppContext): string | undefined {
  const t = notes.get(ctx);
  notes.delete(ctx);
  return t;
}
