/**
 * "Your path": where a learner is on the ladder (docs/LADDER.md) — browser-safe, over the store and the bundled ladder.
 *
 *   createLadderPath(deps).view(userId, lang, {preview})   Stage 0's status and every unit in order: done / next / later,
 *                                                          with its pipeline state in plain words while it is not published
 *   createLadderPath(deps).next(userId, lang, {preview})   the one next step: Stage 0 (link /start), a unit, "waiting" or "finished"
 *   createLadderPath(deps).source()                        the reader `setLadderPathSource` (golearn/recommend.ts) registers
 *
 * Rules (the owner's):
 *   - the next unit is the first, in ladder order, that the learner has not completed (an explicit `TextCompleted`, or the
 *     reading record's `finishedAt` — the rule GoLearn's recommendations already use) AND may open: published, or preview on;
 *   - an unpublished unit outside preview is skipped for "next" but listed, with the reason it is held back;
 *   - Stage 0 counts as done when the learner has a Stage 0 exit result (any verdict — only the verdict is read, never an answer) or
 *     has completed every Stage 0 scene. Until then the next step is Stage 0 itself. A language without Stage 0 content, or a
 *     ladder that does not start after Stage 0, has no Stage 0 step.
 * Nothing here throws for missing data: a language with no ladder simply has no path.
 */
import type { AppStore, GoLearn, LanguageCode, Stage0Service, Text } from '../core';
import { pipelineSummary } from '../ingest/pipeline';
import { bundledLadder, defaultLadderSource, documentWords } from './bundle';
import type { BundledUnit, LadderSource } from './bundle';
import type { LadderKind, LadderStage } from './types';

/** The groups the learner sees: A1 (a1-1, a1-2), A2 (a2-1, a2-2), B1 bridge. */
export type PathGroupId = 'a1' | 'a2' | 'b1';
export const PATH_GROUPS: ReadonlyArray<{ id: PathGroupId; label: string; stages: readonly LadderStage[] }> = [
  { id: 'a1', label: 'A1', stages: ['a1-1', 'a1-2'] },
  { id: 'a2', label: 'A2', stages: ['a2-1', 'a2-2'] },
  { id: 'b1', label: 'B1 bridge', stages: ['b1-bridge'] },
];
export const groupOfStage = (stage: LadderStage): PathGroupId => PATH_GROUPS.find((g) => g.stages.includes(stage))?.id ?? 'b1';

export type UnitState = 'done' | 'next' | 'later';

export interface PathUnit {
  unitId: string;
  stage: LadderStage;
  kind: LadderKind;
  domain: string;
  title: string;
  /** The Text id; undefined when the unit's text is not in the bundle. */
  textId?: string;
  /** Running words ("about"), when the text is bundled. */
  words?: number;
  state: UnitState;
  /** The Text is on this device (imported). */
  installed: boolean;
  published: boolean;
  /** The learner may open it now: installed and (published, or preview on). */
  openable: boolean;
  /** Where it opens (`/read/<textId>`); present exactly when `openable`. */
  to?: string;
  /** Why it cannot be opened yet, in plain words (never for a published unit). */
  heldBack?: string;
}

export interface PathGroup { id: PathGroupId; label: string; units: PathUnit[] }

export interface Stage0Status {
  /** Stage 0 is part of this learner's path (the ladder follows it and the language has Stage 0 content). */
  applicable: boolean;
  done: boolean;
  /** How it was finished: an exit result ("exit") or every scene completed ("scenes"). */
  by?: 'exit' | 'scenes';
  /** The exit's verdict, when there is one (only the verdict is read). */
  verdict?: 'ready' | 'ready-provisional' | 'not-yet';
  scenesDone: number;
  scenesTotal: number;
}

export interface PathView {
  lang: LanguageCode;
  /** The language has a bundled ladder with at least one unit. */
  hasLadder: boolean;
  stage0: Stage0Status;
  groups: PathGroup[];
  /** The learner has completed every unit that has a text. */
  finished: boolean;
  next: PathNext;
}

export type PathNext =
  | { kind: 'stage0'; to: '/start' }
  | { kind: 'unit'; unit: PathUnit; to: string }
  /** Units remain, but none can be opened now (all held back, preview off). */
  | { kind: 'waiting'; reason: string }
  | { kind: 'finished' }
  | { kind: 'none' };

/** The part of Stage 0's folded state this module reads: which steps are completed, and the verdict of a finished exit — nothing else. */
export interface Stage0Cheap {
  state?(userId: string, lang: LanguageCode): Promise<{
    steps: ReadonlyMap<string, { completed: boolean }>;
    exits: ReadonlyArray<{ finished?: { result: { verdict?: 'ready' | 'ready-provisional' | 'not-yet' } } }>;
  }>;
  pack?(lang: LanguageCode): { path: { steps: ReadonlyArray<{ id: string; kind: string }> } } | undefined;
}

export interface LadderPathDeps {
  store: AppStore;
  golearn?: Pick<GoLearn, 'readingProgressMany'>;
  /**
   * Stage 0. The real service also offers `state` and `pack` (Stage0ServiceImpl): those are the cheap way to ask "is it done", and are used
   * when present; `overview` (which also computes the next scene's coverage) is the fallback.
   */
  stage0?: Pick<Stage0Service, 'available' | 'overview'> & Stage0Cheap;
  /** Default: the real bundle. */
  source?: LadderSource;
}

/** The learner's wording of a unit that cannot be opened yet. Draft → review → corrections → recording → published. */
export function heldBackWords(doc: unknown, text: Pick<Text, 'unpublishedReasons'> | undefined): string {
  const other = text?.unpublishedReasons?.[0];
  if (doc === undefined || doc === null) return other ?? 'waiting for a review by a native speaker';
  const s = pipelineSummary(doc);
  if (!s.hasPipeline) return other ?? 'draft — waiting for a review by a native speaker';
  if (!s.reviewedBy) return s.state === 'in-review' ? 'with a reviewer — waiting for the review to come back' : 'draft — waiting for a review by a native speaker';
  if (s.correctionsPending) return 'reviewed — corrections are being made before it can be used';
  if (s.waitingFor.some((w) => /changed/i.test(w))) return 'its wording changed after the review — waiting for a new review';
  if (s.state !== 'audio-ready' && s.state !== 'published') return `reviewed by ${s.reviewedBy} — waiting for a recording`;
  return other ?? s.waitingFor[0] ?? 'held back — see Settings → Content';
}

const textTo = (t: Pick<Text, 'id' | 'kind'>): string => `${t.kind === 'scripture' ? '/scripture' : '/read'}/${encodeURIComponent(t.id)}`;

export function createLadderPath(deps: LadderPathDeps) {
  const { store } = deps;
  const source = deps.source ?? defaultLadderSource();

  async function stage0Status(userId: string, lang: LanguageCode, ladderStartsAfterStage0: boolean): Promise<Stage0Status> {
    const none: Stage0Status = { applicable: false, done: true, scenesDone: 0, scenesTotal: 0 };
    const s0 = deps.stage0;
    if (!s0 || !ladderStartsAfterStage0) return none;
    try {
      if (!s0.available(lang)) return none;
      if (typeof s0.state === 'function' && typeof s0.pack === 'function') {
        const pack = s0.pack(lang);
        if (!pack) return none;
        const st = await s0.state(userId, lang);
        const scenes = pack.path.steps.filter((x) => x.kind === 'scene');
        const scenesDone = scenes.filter((x) => st.steps.get(x.id)?.completed === true).length;
        const finished = st.exits.filter((x) => x.finished).pop()?.finished?.result;
        const byExit = finished !== undefined;
        const byScenes = scenes.length > 0 && scenesDone === scenes.length;
        return {
          applicable: true, done: byExit || byScenes, ...(byExit ? { by: 'exit' as const } : byScenes ? { by: 'scenes' as const } : {}),
          ...(finished?.verdict ? { verdict: finished.verdict } : {}), scenesDone, scenesTotal: scenes.length,
        };
      }
      const ov = await s0.overview(userId, lang);
      if (!ov.available) return none;
      const scenes = ov.steps.filter((s) => s.step.kind === 'scene');
      const scenesDone = scenes.filter((s) => s.status === 'done' || s.status === 'secure').length;
      const verdict = ov.exit?.verdict; // the verdict only: never an answer, a section or a form
      const byExit = ov.exit !== undefined;
      const byScenes = scenes.length > 0 && scenesDone === scenes.length;
      return {
        applicable: true, done: byExit || byScenes, ...(byExit ? { by: 'exit' as const } : byScenes ? { by: 'scenes' as const } : {}),
        ...(verdict ? { verdict } : {}), scenesDone, scenesTotal: scenes.length,
      };
    } catch { return none; } // Stage 0 that cannot be read must not lock a learner out of the ladder
  }

  /**
   * `readingRecords: false` does not call GoLearn: the reader registered with GoLearn runs INSIDE one of its reads (recommend), and GoLearn's
   * reads are serialised, so calling it back from there would wait for itself. That reader is given the completions (`completed`) instead.
   */
  async function view(userId: string, lang: LanguageCode, opts: { preview?: boolean; readingRecords?: boolean } = {}): Promise<PathView> {
    const preview = opts.preview === true;
    const ladder = bundledLadder(lang, source);
    const empty = (stage0: Stage0Status): PathView => ({ lang, hasLadder: false, stage0, groups: [], finished: false, next: { kind: 'none' } });
    if (!ladder || ladder.units.length === 0) return empty(await stage0Status(userId, lang, true));
    const stage0 = await stage0Status(userId, lang, ladder.after === 'stage0');

    const textIds = ladder.units.map((u) => u.textId).filter((t): t is string => !!t);
    const texts = new Map<string, Text>();
    (await store.texts.getMany(textIds)).forEach((t, i) => { if (t) texts.set(textIds[i]!, t); });
    const completed = new Set<string>();
    for (const e of await store.events.where('type', 'TextCompleted')) {
      if (e.userId === userId && e.lang === lang && e.type === 'TextCompleted') completed.add(e.textId);
    }
    if (deps.golearn && textIds.length && opts.readingRecords !== false) {
      try {
        const records = await deps.golearn.readingProgressMany(userId, textIds.filter((t) => texts.has(t)));
        for (const [id, r] of records) if (r.finishedAt) completed.add(id);
      } catch { /* the explicit completions above still stand */ }
    }

    let nextFound = false;
    const units: PathUnit[] = ladder.units.map((b: BundledUnit) => {
      const text = b.textId ? texts.get(b.textId) : undefined;
      const published = text?.published === true;
      const done = !!b.textId && completed.has(b.textId);
      const openable = !!text && (published || preview);
      let state: UnitState = done ? 'done' : 'later';
      if (!done && !nextFound && stage0.done && openable) { state = 'next'; nextFound = true; }
      const heldBack = published ? undefined
        : !b.textId ? (b.problem?.startsWith('document not bundled') ? 'not written yet' : (b.problem ?? 'this text is not available'))
        : !text ? 'not on this device yet'
        : heldBackWords(b.doc, text);
      const words = b.doc ? documentWords(b.doc) : undefined;
      return {
        unitId: b.unit.id, stage: b.unit.stage, kind: b.unit.kind, domain: b.unit.domain,
        title: b.unit.title ?? b.doc?.title ?? text?.title ?? b.unit.id,
        ...(b.textId ? { textId: b.textId } : {}),
        ...(words ? { words } : {}),
        state, installed: !!text, published, openable,
        ...(openable ? { to: textTo(text!) } : {}),
        ...(heldBack ? { heldBack } : {}),
      };
    });

    const groups: PathGroup[] = PATH_GROUPS
      .map((g) => ({ id: g.id, label: g.label, units: units.filter((u) => g.stages.includes(u.stage)) }))
      .filter((g) => g.units.length > 0);
    const withText = units.filter((u) => u.textId);
    const finished = withText.length > 0 && withText.every((u) => u.state === 'done');
    const nextUnit = units.find((u) => u.state === 'next');
    const next: PathNext = !stage0.done ? { kind: 'stage0', to: '/start' }
      : nextUnit ? { kind: 'unit', unit: nextUnit, to: nextUnit.to! }
      : finished ? { kind: 'finished' }
      : withText.length === 0 ? { kind: 'waiting', reason: 'The units on this path are not written yet.' }
      : { kind: 'waiting', reason: 'The units still ahead of you are drafts waiting for a review by a native speaker and for a recording. Turn on preview in Settings to read them before then.' };
    return { lang, hasLadder: true, stage0, groups, finished, next };
  }

  /** The reader for `setLadderPathSource`: the units not completed, in order, with whether each is published. */
  function pathSource() {
    return async (args: { userId: string; lang: LanguageCode; completed: ReadonlySet<string> }): Promise<
      { steps: Array<{ unitId: string; textId: string; title: string; stage: string; published: boolean }>; finished: boolean } | undefined
    > => {
      const ladder = bundledLadder(args.lang, source);
      if (!ladder || ladder.units.length === 0) return undefined;
      // Stage 0 is the path's first step and has no text id to offer: until it is done, the ladder offers nothing here (/path says why).
      const stage0 = await stage0Status(args.userId, args.lang, ladder.after === 'stage0');
      if (!stage0.done) return undefined;
      const v = await view(args.userId, args.lang, { preview: true, readingRecords: false });
      const done = new Set([...args.completed, ...v.groups.flatMap((g) => g.units).filter((u) => u.state === 'done').map((u) => u.textId!)]);
      const steps = v.groups.flatMap((g) => g.units)
        .filter((u) => u.textId && u.installed && !done.has(u.textId))
        .map((u) => ({ unitId: u.unitId, textId: u.textId!, title: u.title, stage: u.stage, published: u.published }));
      return { steps, finished: steps.length === 0 && v.groups.some((g) => g.units.some((u) => u.textId)) };
    };
  }

  return {
    view,
    async next(userId: string, lang: LanguageCode, opts: { preview?: boolean } = {}): Promise<PathNext> { return (await view(userId, lang, opts)).next; },
    source: pathSource,
  };
}

export type LadderPath = ReturnType<typeof createLadderPath>;
