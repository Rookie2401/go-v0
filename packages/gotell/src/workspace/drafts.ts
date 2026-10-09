/**
 * Draft helpers that need no DOM: creating an empty draft record, listing drafts (account first, the device when offline),
 * and the small facts the draft list shows.
 */
import type { DraftRecord, DraftStore, PromptCategory, WritingMode, WritingPrompt } from '../types';
import { PROMPT_CATEGORIES } from '../types';
import type { TellEngine, TellHost } from './port';

export interface DraftRow {
  draftId: string;
  title: string;
  kind: string;
  updatedAt: string;
  versions: number;
  mode?: WritingMode;
  /** Where the row came from: the account (and the device) or the device alone. */
  origin: 'account' | 'device';
}

export const MODE_INFO: Record<WritingMode, { label: string; blurb: string; needsPrompt: boolean }> = {
  free: { label: 'Free writing', blurb: 'Write anything you like. No prompt, no target.', needsPrompt: false },
  guided: { label: 'Guided', blurb: 'Pick a prompt with a clear goal and write to it.', needsPrompt: true },
  testimony: { label: 'Testimony', blurb: 'Write the parts of your story that are true for you, in any order.', needsPrompt: true },
  missionary: { label: 'Missionary', blurb: 'Practise what you want to say to the people you serve.', needsPrompt: true },
  narrative: { label: 'Narrative', blurb: 'Tell what happened, as a story.', needsPrompt: false },
  targeted: { label: 'Targeted', blurb: 'Say one specific thing. You describe it in English; that stays on this device.', needsPrompt: true },
};

export const CATEGORY_LABEL: Record<PromptCategory, string> = {
  'personal-background': 'About me',
  'mission-communication': 'Mission',
  testimony: 'Testimony',
  'scripture-theology': 'Scripture',
  general: 'General',
};

/** The category tab a mode opens on ('all' when the mode spans several). */
export function defaultCategory(mode: WritingMode): PromptCategory | 'all' {
  if (mode === 'testimony') return 'testimony';
  if (mode === 'missionary') return 'mission-communication';
  return 'all';
}

export const isMode = (s: string | undefined): s is WritingMode => !!s && (['free', 'guided', 'testimony', 'missionary', 'narrative', 'targeted'] as string[]).includes(s);
export const categoriesOf = (): readonly PromptCategory[] => PROMPT_CATEGORIES;

export function emptyDraft(host: TellHost, engine: TellEngine, input: { mode: WritingMode; prompt?: WritingPrompt }): DraftRecord {
  const at = host.now().toISOString();
  return {
    draftId: `draft-${host.newId()}`, languageId: engine.languageId, ...(engine.varietyId ? { varietyId: engine.varietyId } : {}),
    mode: input.mode, ...(input.prompt ? { promptId: input.prompt.promptId } : {}),
    title: '', text: '', versions: [], assistance: [], createdAt: at, updatedAt: at,
  };
}

/** Creates the draft on the device (never the network) and returns it. */
export async function createDraft(host: TellHost, engine: TellEngine, input: { mode: WritingMode; prompt?: WritingPrompt }): Promise<DraftRecord> {
  const record = emptyDraft(host, engine, input);
  const r = await engine.stores.local.save(record, 0);
  if (!r.ok) throw new Error('This draft already exists on the device.');
  return record;
}

async function rowsFrom(store: DraftStore, local: DraftStore, languageId: string, origin: DraftRow['origin']): Promise<DraftRow[]> {
  const list = await store.list();
  const rows: DraftRow[] = [];
  for (const d of list) {
    if (d.languageId !== languageId) continue;
    let versions = 0;
    let mode: WritingMode | undefined;
    let title = d.title ?? '';
    try {
      const loaded = await local.load(d.docId) ?? await store.load(d.docId);
      if (loaded) { versions = loaded.record.versions.length; mode = loaded.record.mode; title = loaded.record.title || title; }
    } catch { /* the row is still listed */ }
    rows.push({ draftId: d.docId, title, kind: d.kind, updatedAt: d.updatedAt, versions, ...(mode ? { mode } : {}), origin });
  }
  return rows;
}

/** The learner's drafts of this language, newest first. When the account cannot be reached the device's drafts are listed. */
export async function listDrafts(engine: TellEngine): Promise<{ rows: DraftRow[]; note?: string }> {
  const { local, synced } = engine.stores;
  let rows: DraftRow[] = [];
  let note: string | undefined;
  try { rows = await rowsFrom(synced, local, engine.languageId, 'account'); } catch {
    note = 'Your account could not be reached, so only the drafts on this device are listed.';
  }
  try {
    const onDevice = await rowsFrom(local, local, engine.languageId, 'device');
    const known = new Set(rows.map((r) => r.draftId));
    for (const r of onDevice) if (!known.has(r.draftId)) rows.push(r);
  } catch { /* the device list is a supplement */ }
  rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { rows, ...(note ? { note } : {}) };
}
