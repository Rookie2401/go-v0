/**
 * What the learner's own pages say about which letters matter (Alphabet Sprint, website-adaptive selection). GoLearn's content script
 * counts the letters of the pages the learner reads with GoLearn Active, by language, and the extension's worker keeps a decayed total
 * of those counts on this device (packages/golearn-extension/src/background/pageScript.ts): single characters and numbers only, never a
 * word, a sentence, an address or a title. GoReview, inside the extension, asks the worker for one language's counts and turns them into
 * unit counts with the Sprint profile, so the next letters are the ones those pages use most. Outside the extension (the web build) there
 * are no counts and the Sprint uses its starter words alone.
 */
import type { AppContext } from './context';
import { getExtension } from './localBinding';
import { loadSprintProfiles, profileForVariety } from '../../language-packs/src/alphabet-sprint/profiles';

/** The worker's message (packages/golearn-extension/src/platform.ts MSG.pageScript). */
export const PAGE_SCRIPT_MESSAGE = 'golearn:page-script';

export interface PageScriptReply { ok: boolean; counts?: Record<string, number>; pages?: number }

/** Raw character counts for a language from the extension, or undefined (no extension, nothing read yet, or no answer). */
export async function pageCharacterCounts(languageId: string, g: unknown = globalThis): Promise<Record<string, number> | undefined> {
  const ext = getExtension(g as Parameters<typeof getExtension>[0]);
  if (!ext) return undefined;
  try {
    const reply = (await ext.runtime.sendMessage({ type: PAGE_SCRIPT_MESSAGE, languageId })) as PageScriptReply | undefined;
    if (!reply || reply.ok !== true || !reply.counts) return undefined;
    const out: Record<string, number> = {};
    for (const [ch, n] of Object.entries(reply.counts)) if ([...ch].length === 1 && Number.isFinite(n) && n > 0) out[ch] = n;
    return Object.keys(out).length ? out : undefined;
  } catch { return undefined; }
}

/** Character counts as Sprint unit counts: each character is read by the profile (a letter, a mark, a final form …). */
export async function unitCountsFromCharacters(languageId: string, chars: Record<string, number>, varietyId?: string): Promise<Map<string, number> | undefined> {
  const profile = profileForVariety(await loadSprintProfiles(languageId), varietyId);
  if (!profile) return undefined;
  // a character is first matched to the unit written that way (a letter's key or display: 'ב', 'A a', '◌ִ'), else read by the profile
  const direct = new Map<string, string>();
  for (const u of profile.units) {
    if (u.kind === 'rule') continue;
    for (const form of [...u.key.split(' '), u.display, u.display.replace(/◌/g, '')]) {
      const f = form.normalize('NFC').toLowerCase();
      if ([...f].length === 1 && !direct.has(f)) direct.set(f, u.key);
    }
  }
  const out = new Map<string, number>();
  for (const [ch, n] of Object.entries(chars)) {
    const hit = direct.get(ch.normalize('NFC').toLowerCase());
    const keys = hit ? [hit] : profile.dependencies(ch);
    if (!keys) continue;
    for (const key of keys) out.set(key, (out.get(key) ?? 0) + n);
  }
  return out.size ? out : undefined;
}

/** The unit counts the Sprint plans with for a language, or undefined. */
export async function pageCountsFor(ctx: AppContext, languageId: string): Promise<Map<string, number> | undefined> {
  const chars = await pageCharacterCounts(languageId, ctx.deps.win ?? globalThis);
  if (!chars) return undefined;
  const id = await ctx.identity().catch(() => undefined);
  return unitCountsFromCharacters(languageId, chars, id?.languageId === languageId ? id.varietyId : undefined);
}
