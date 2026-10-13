/**
 * Interface preferences of THIS device: how the session screen behaves for the person at the keyboard. They are not
 * learning preferences (nothing about scheduling or planning depends on them) and not personal data, so they live in
 * their own record beside the others instead of in the review preferences.
 *
 *   shortcuts   the one-key shortcuts of a session (1 to 4 answer or grade, Space plays the audio). On by default. Off, every
 *               action is still a button and Enter and Esc still work (they are not character keys) — WCAG 2.1.4.
 *   showClock   the elapsed-time clock in the session header. On by default. Off, nothing ticks on screen — WCAG 2.2.2.
 *   vocabSort   how My vocab is ordered: 'least' (least known first, the default) or 'recent' (most recently encountered first).
 */
import type { AppContext } from '../context';

export const UI_KEY = 'gopractice:ui';

export type VocabSortChoice = 'least' | 'recent';
export interface UiPrefs { shortcuts: boolean; showClock: boolean; vocabSort: VocabSortChoice }
export const DEFAULT_UI: UiPrefs = { shortcuts: true, showClock: true, vocabSort: 'least' };

export async function getUiPrefs(ctx: AppContext): Promise<UiPrefs> {
  try {
    const v = (await ctx.deps.area.get(UI_KEY))[UI_KEY] as Record<string, unknown> | undefined;
    return { shortcuts: v?.shortcuts !== false, showClock: v?.showClock !== false, vocabSort: v?.vocabSort === 'recent' ? 'recent' : 'least' };
  } catch { return { ...DEFAULT_UI }; }
}

export async function patchUiPrefs(ctx: AppContext, patch: Partial<UiPrefs>): Promise<UiPrefs> {
  const next = { ...(await getUiPrefs(ctx)), ...patch };
  await ctx.deps.area.set({ [UI_KEY]: next });
  return next;
}
