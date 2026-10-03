/**
 * GoTell practice service — the productive-language engine behind GoTellPractice.
 *
 * Reads: the event log (its own Tell* events), GoLearn's receptive state (listKnown / encounters → sentences), saved
 * testimony versions and suggestions. Writes: ONLY append-only events — TellGoalDefined, TellTaskPresented,
 * TellInterventionShown, TellAttemptSubmitted, TellTaskClosed — plus ProductionRecorded for the items of a successful
 * attempt (the same once-per-(item, sentence) rule as My Testimony, classified by the help that was shown). It keeps no
 * table of its own: productive state is folded from the log on every read (state.ts), so a backup/restore of the events
 * restores it exactly, and no Dexie migration is needed.
 *
 * Honesty rules:
 *  - The attempt text is stored exactly as typed. Nothing rewrites it; a repair is a new attempt.
 *  - Every step of help is recorded before the attempt that follows it; an attempt carries the full lineage.
 *  - After a full model, success is P1 at most, in that task and (for RECENT_EXPOSURE_MS) in any other.
 *  - Model wording is labelled with its origin and review status; Scripture is quoted verbatim, never adapted.
 *  - An interpretation provider (LLM) is advisory: validated, stored, never used for a decision.
 */
import { hash, ids } from '../../core';
import type {
  AdapterRegistry, AssistanceStep, DefineGoalResult, DomainEvent, EventBus, GoTellPractice, InterpretationProvider, LanguageAdapter, LanguageCode,
  ModelWording, PracticeTask, ProductionKind, ProductionRecorded, ProductiveGoalState, ScheduleCandidate, SemanticGoal, TellAttemptRecord,
  TellAttemptSubmitted, TellGoalDefined, TellInterventionShown, TellTaskClosed, TellTaskPresented, TestimonyMap, AppStore, GoLearn,
} from '../../core';
import { conceptMatches } from '../concepts';
import { createSourceFinder } from '../sources';
import { bestCandidate, dice, normSet, parse, wordIndexes } from '../text';
import { EVALUATOR, assessLanguage, assessMeaning, errorsOf, outcomeOf } from './assess';
import { catalogGoals, catalogModel, learnerGoal } from './goals';
import { consult } from './interpret';
import { GIVES_WORDING, HINT_LABEL, nextStep, strongestTier } from './ladder';
import type { MetSentence, StepDraft } from './ladder';
import { rankGoals } from './scheduler';
import type { GoalSignals } from './scheduler';
import { effectiveSupport, emptyState, foldStates } from './state';
import type { Spontaneous, TimedAttempt, TimedStep } from './state';

export interface PracticeDeps {
  store: AppStore;
  bus: EventBus;
  adapters: AdapterRegistry;
  golearn: Pick<GoLearn, 'listKnown'>;
  clock: () => string;
  /** The acting user; when set, every call asserts that it is this user. */
  actor?: () => string | undefined;
  interpreter?: InterpretationProvider;
}

const TELL_TYPES = ['TellGoalDefined', 'TellTaskPresented', 'TellInterventionShown', 'TellAttemptSubmitted', 'TellTaskClosed'] as const;
type TellEvent = Extract<DomainEvent, { type: (typeof TELL_TYPES)[number] }>;

const LANG_NAME: Record<LanguageCode, string> = { es: 'Spanish', sq: 'Albanian', th: 'Thai', hi: 'Hindi', de: 'German' };
const SECTION_TITLE: Record<string, string> = {
  background: 'Background', childhood: 'Childhood', 'knowledge-of-christianity': 'What you knew', 'understanding-of-sin': 'Understanding of sin',
  conviction: 'Conviction', repentance: 'Repentance', faith: 'Faith', forgiveness: 'Forgiveness', grace: 'Grace', transformation: 'Transformation',
  'present-faith': 'Faith today', 'why-sharing': 'Why you share',
};
/** Spontaneous use needs a confident meaning match (testimony sentences are long and free). */
const SPONTANEOUS_MIN_CONFIDENCE = 0.7;
/** A testimony sentence this close to a model/frame/gap shown in practice is copied, not spontaneous. */
const COPIED_DICE = 0.8;
const MAX_GAP_ITEMS_PER_CONCEPT = 3;

interface Log {
  events: TellEvent[];
  goalsDefined: SemanticGoal[];
  tasks: Map<string, TellTaskPresented>;
  steps: TellInterventionShown[];
  attempts: TellAttemptSubmitted[];
  closes: Map<string, TellTaskClosed>;
}

interface Receptive {
  /** concept → form/lemma ids of items he has met (reading or listening), most encountered first. */
  byConcept: Map<string, string[]>;
}

export function createPractice(deps: PracticeDeps): GoTellPractice {
  const { store, bus, adapters, golearn, clock } = deps;
  const actor = deps.actor ?? (() => undefined);
  const assertActor = (userId: string) => {
    const a = actor();
    if (a !== undefined && a !== userId) throw new Error('GoTell: not permitted for this user');
  };
  const base = (userId: string, lang: LanguageCode, session: string, dedupeKey: string) => ({ userId, lang, surface: 'testimony' as const, session, dedupeKey, at: clock() });

  // ───────────────────────── reading the log ─────────────────────────

  async function readLog(userId: string, lang?: LanguageCode): Promise<Log> {
    const all = (await bus.history({ userId, types: [...TELL_TYPES] })) as TellEvent[];
    const events = all.filter((e) => e.userId === userId && (!lang || e.lang === lang)).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    const log: Log = { events, goalsDefined: [], tasks: new Map(), steps: [], attempts: [], closes: new Map() };
    const goals = new Map<string, SemanticGoal>();
    for (const e of events) {
      if (e.type === 'TellGoalDefined') { const g = goals.get(e.goal.id); if (!g || e.goal.version > g.version) goals.set(e.goal.id, e.goal); }
      else if (e.type === 'TellTaskPresented') log.tasks.set(e.taskId, e);
      else if (e.type === 'TellInterventionShown') log.steps.push(e);
      else if (e.type === 'TellAttemptSubmitted') log.attempts.push(e);
      else if (e.type === 'TellTaskClosed' && !log.closes.has(e.taskId)) log.closes.set(e.taskId, e);
    }
    log.goalsDefined = [...goals.values()];
    return log;
  }

  const goalsOf = (lang: LanguageCode, log: Log): SemanticGoal[] => [...catalogGoals(lang), ...log.goalsDefined];

  function buildTask(log: Log, taskId: string, goals: SemanticGoal[], adapter: LanguageAdapter, model: ModelWording | undefined, met: (c: string) => MetSentence | undefined): PracticeTask | undefined {
    const t = log.tasks.get(taskId);
    if (!t) return undefined;
    const goal = goals.find((g) => g.id === t.goalId);
    if (!goal) return undefined;
    const assistance = log.steps.filter((s) => s.taskId === taskId).map((s) => s.step);
    const attempts = log.attempts.filter((a) => a.record.taskId === taskId).map((a) => a.record);
    const closed = log.closes.get(taskId);
    const last = attempts[attempts.length - 1];
    const preview = !closed && last?.outcome !== 'success' ? nextStep({ goal, lang: t.lang, adapter, model, last, shown: assistance, metSentence: met, floorRung: t.selection.startRung }) : undefined;
    return {
      taskId, userId: t.userId, lang: t.lang, goal, family: t.family, prompt: t.prompt, ...(t.retellSource ? { retellSource: t.retellSource } : {}),
      presentedAt: t.at, selection: t.selection, assistance, attempts, open: !closed, ...(closed ? { closedAs: closed.outcome } : {}),
      ...(preview ? { nextHint: { kind: preview.kind, label: HINT_LABEL[preview.kind] } } : {}),
    };
  }

  const timedAttempts = (log: Log): TimedAttempt[] => log.attempts.map((a) => ({ at: a.at, record: a.record }));
  const timedSteps = (log: Log): TimedStep[] => log.steps.map((s) => ({ at: s.at, goalId: s.goalId, taskId: s.taskId, step: s.step }));

  // ───────────────────────── GoLearn → GoTell: receptive signals ─────────────────────────

  async function receptive(userId: string, lang: LanguageCode): Promise<Receptive> {
    const rows = [...(await golearn.listKnown(userId, lang, 'reading', 'encountered')), ...(await golearn.listKnown(userId, lang, 'listening', 'encountered'))];
    const byConcept = new Map<string, Array<{ id: string; n: number }>>();
    const seen = new Set<string>();
    for (const r of rows) {
      if (seen.has(r.itemId) || (r.itemKind !== 'form' && r.itemKind !== 'lemma')) continue;
      seen.add(r.itemId);
      const parts = r.itemId.split(':');
      const text = r.itemKind === 'form' ? parts.slice(2).join(':') : parts[2];
      if (!text) continue;
      for (const m of conceptMatches(lang, text)) {
        const list = byConcept.get(m.concept) ?? [];
        list.push({ id: r.itemId, n: r.encounterCount });
        byConcept.set(m.concept, list);
      }
    }
    return { byConcept: new Map([...byConcept].map(([c, xs]) => [c, xs.sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : 1)).map((x) => x.id)])) };
  }

  /** Sentences he has met, per concept (not his own testimony), for "a sentence you have read" and retelling. */
  async function metSentences(userId: string, rec: Receptive, concepts: string[]): Promise<Map<string, MetSentence[]>> {
    const finder = createSourceFinder(store);
    const out = new Map<string, MetSentence[]>();
    for (const c of new Set(concepts)) {
      const list: MetSentence[] = [];
      for (const itemId of (rec.byConcept.get(c) ?? []).slice(0, 4)) {
        for (const s of await finder.forItem(userId, itemId, 3)) {
          if (s.surface === 'testimony' || list.some((x) => x.sentenceId === s.sentenceId)) continue;
          list.push({ concept: c, itemId, textId: s.textId, title: s.textTitle, sentenceId: s.sentenceId, excerpt: s.excerpt, scripture: s.surface === 'scripture' });
        }
      }
      out.set(c, list);
    }
    return out;
  }

  function retellSource(adapter: LanguageAdapter, lang: LanguageCode, goal: SemanticGoal, met: Map<string, MetSentence[]>): MetSentence | undefined {
    const cands = goal.components.flatMap((c) => met.get(c.concept) ?? []);
    return cands.find((s) => assessMeaning(adapter, lang, goal, s.excerpt).success);
  }

  /** The full model: his own last independent success, else the catalog's (unreviewed), else a sentence he has read. */
  function modelFor(goal: SemanticGoal, lang: LanguageCode, log: Log, reading: MetSentence | undefined): ModelWording | undefined {
    const own = [...log.attempts].reverse().find((a) => a.record.goalId === goal.id && a.record.outcome === 'success' && a.record.tier === 'none');
    if (own) return { goalId: goal.id, lang, text: own.record.text, review: 'unreviewed', origin: 'learner-history', note: `Your own words, ${own.at.slice(0, 10)}.` };
    const cat = catalogModel(goal.id, lang);
    if (cat) return cat;
    if (reading) {
      return { goalId: goal.id, lang, text: reading.excerpt, review: 'unreviewed', origin: 'reading', sourceRef: { textId: reading.textId, sentenceId: reading.sentenceId, title: reading.title, scripture: reading.scripture },
        note: reading.scripture ? `Scripture, quoted exactly — ${reading.title}.` : `From "${reading.title}", quoted exactly.` };
    }
    return undefined;
  }

  // ───────────────────────── spontaneous use in saved testimony versions ─────────────────────────

  async function spontaneousUses(userId: string, lang: LanguageCode, goals: SemanticGoal[], log: Log): Promise<Spontaneous[]> {
    const adapter = adapters.get(lang);
    const testimonyId = ids.testimony(userId, lang);
    const revisions = (await store.revisions.where('testimonyId', testimonyId)).filter((r) => r.userId === userId).sort((a, b) => a.number - b.number);
    if (revisions.length === 0) return [];
    const sugs = (await store.suggestions.where('testimonyId', testimonyId)).filter((s) => s.userId === userId);
    const shownWording = log.steps.filter((s) => GIVES_WORDING(s.step.kind)).map((s) => ({ at: s.at, set: normSet(parse(adapter, s.step.content.replace(/___/g, ' '))) }));
    const out: Spontaneous[] = [];
    const found = new Set<string>();
    for (const rev of revisions) {
      for (const sen of rev.sentences) {
        const set = normSet(parse(adapter, sen.text));
        const suggested = sugs.some((s) => s.createdAt <= rev.createdAt && [s.original, s.suggested, s.finalText ?? ''].some((t) => t && dice(set, normSet(parse(adapter, t))) >= 0.5));
        if (suggested) continue;
        const copied = shownWording.some((w) => w.at <= rev.createdAt && dice(set, w.set) >= COPIED_DICE);
        if (copied) continue;
        if (!assessLanguage(adapter, sen.text).noIssuesDetected) continue;
        for (const g of goals) {
          if (found.has(g.id)) continue;
          const m = assessMeaning(adapter, lang, g, sen.text);
          if (!m.success || m.confidence < SPONTANEOUS_MIN_CONFIDENCE) continue;
          found.add(g.id);
          out.push({ at: rev.createdAt, goalId: g.id, revisionId: rev.id, sentenceIndex: sen.index, text: sen.text });
        }
      }
    }
    return out;
  }

  async function computeStates(userId: string, lang: LanguageCode, log: Log, goals: SemanticGoal[]): Promise<Map<string, ProductiveGoalState>> {
    return foldStates(goals, timedAttempts(log), timedSteps(log), await spontaneousUses(userId, lang, goals, log));
  }

  // ───────────────────────── scheduling ─────────────────────────

  async function candidates(userId: string, lang: LanguageCode, log: Log): Promise<{ ranked: ScheduleCandidate[]; rec: Receptive; met: Map<string, MetSentence[]>; goals: SemanticGoal[]; states: Map<string, ProductiveGoalState> }> {
    const adapter = adapters.get(lang);
    const goals = goalsOf(lang, log);
    const states = await computeStates(userId, lang, log, goals);
    const rec = await receptive(userId, lang);
    const met = await metSentences(userId, rec, goals.flatMap((g) => g.components.map((c) => c.concept)));
    const now = clock();
    // concepts said on his own, per goal (for transfer)
    const ownConcepts = new Map<string, Set<string>>();
    for (const a of log.attempts) {
      if (a.record.outcome !== 'success' || a.record.tier !== 'none') continue;
      const set = ownConcepts.get(a.record.goalId) ?? new Set<string>();
      a.record.meaning.covered.forEach((c) => set.add(c.concept));
      ownConcepts.set(a.record.goalId, set);
    }
    const signals: GoalSignals[] = goals.map((goal) => {
      const state = states.get(goal.id) ?? emptyState(goal.id);
      const saidElsewhere = new Set<string>();
      for (const [gid, set] of ownConcepts) if (gid !== goal.id) set.forEach((c) => saidElsewhere.add(c));
      const dayAgo = Date.parse(now) - 24 * 3600_000;
      const failures = log.attempts.filter((a) => a.record.goalId === goal.id && a.record.outcome !== 'success' && Date.parse(a.at) >= dayAgo).length;
      const heavy = log.steps.filter((s) => s.goalId === goal.id && (s.step.tier === 'model' || s.step.tier === 'scaffold')).map((s) => s.at).sort().pop();
      const retell = retellSource(adapter, lang, goal, met);
      return {
        goal, state, saidElsewhere, failuresLast24h: failures,
        inputByConcept: new Map(goal.components.map((c) => [c.concept, (rec.byConcept.get(c.concept)?.length ?? 0) > 0])),
        ...(heavy ? { lastHeavyHelpAt: heavy } : {}),
        ...(retell ? { retellAvailable: { textId: retell.textId, title: retell.title } } : {}),
      };
    });
    return { ranked: rankGoals(signals, now), rec, met, goals, states };
  }

  function promptFor(lang: LanguageCode, goal: SemanticGoal, family: PracticeTask['family'], retell?: { title: string }): string {
    const L = LANG_NAME[lang];
    switch (family) {
      case 'answer-question': return goal.question ? `Answer in ${L}: "${goal.question}" — your answer should say: "${goal.meaning}"` : `Say in ${L}: "${goal.meaning}"`;
      case 'testimony-part': return `Your testimony${goal.section ? ` — ${SECTION_TITLE[goal.section] ?? goal.section}` : ''}. Say in ${L}: "${goal.meaning}"`;
      case 'retell': return `You read this meaning in "${retell?.title ?? 'a text'}". Without looking, say it in ${L} in your own words: "${goal.meaning}"`;
      case 'transfer': return `You can already say each part of this on your own. Put it together in ${L}: "${goal.meaning}"`;
      default: return `Say in ${L}: "${goal.meaning}"`;
    }
  }

  async function emitStep(userId: string, lang: LanguageCode, taskId: string, goalId: string, n: number, draft: StepDraft): Promise<AssistanceStep> {
    const step: AssistanceStep = { ...draft, id: `${taskId}/h${n}`, at: clock() };
    await bus.emit<TellInterventionShown>({ type: 'TellInterventionShown', ...base(userId, lang, `tell:${taskId}`, `tell-step:${step.id}`), taskId, goalId, step });
    return step;
  }

  async function context(userId: string, lang: LanguageCode, log: Log, goal: SemanticGoal) {
    const adapter = adapters.get(lang);
    const rec = await receptive(userId, lang);
    const met = await metSentences(userId, rec, goal.components.map((c) => c.concept));
    const reading = retellSource(adapter, lang, goal, met);
    const model = modelFor(goal, lang, log, reading);
    const metFn = (c: string) => met.get(c)?.[0];
    return { adapter, rec, met, model, metFn };
  }

  async function loadTask(userId: string, taskId: string) {
    assertActor(userId);
    const log = await readLog(userId);
    const t = log.tasks.get(taskId);
    if (!t || t.userId !== userId) throw new Error('GoTell: task not found or not owned by this user');
    const langLog = await readLog(userId, t.lang);
    const goals = goalsOf(t.lang, langLog);
    const goal = goals.find((g) => g.id === t.goalId);
    if (!goal) throw new Error('GoTell: the goal of this task no longer exists');
    const ctx = await context(userId, t.lang, langLog, goal);
    return { t, log: langLog, goals, goal, ...ctx };
  }

  // ───────────────────────── GoTell → GoLearn: production evidence for a success ─────────────────────────

  async function recordProduction(userId: string, lang: LanguageCode, adapter: LanguageAdapter, rec: TellAttemptRecord, kind: ProductionKind) {
    const p = parse(adapter, rec.text);
    const bad = new Set<number>();
    for (const span of rec.language.findings) p.tokens.forEach((tk, i) => { if (tk.start < span.span[1] && tk.end > span.span[0]) bad.add(i); });
    const items = new Map<string, 'form' | 'lemma'>();
    for (const i of wordIndexes(p)) {
      if (bad.has(i)) continue;
      items.set(ids.form(lang, p.tokens[i].normalized), 'form');
      const c = bestCandidate(p.analyses[i]);
      if (c?.lemma) items.set(ids.lemma(lang, c.lemma, c.pos), 'lemma');
    }
    for (const [itemId, itemKind] of items) {
      await bus.emit<ProductionRecorded>({
        type: 'ProductionRecorded', ...base(userId, lang, `tell:${rec.taskId}`, `prod:${userId}:${rec.textHash}:${itemId}`),
        itemId, itemKind, kind, modality: 'writing', sentenceText: rec.text, sentenceHash: rec.textHash,
      });
    }
  }

  // ───────────────────────── the API ─────────────────────────

  const api: GoTellPractice = {
    async goals(userId, lang) {
      assertActor(userId);
      return goalsOf(lang, await readLog(userId, lang));
    },

    async defineGoal(userId, lang, input): Promise<DefineGoalResult> {
      assertActor(userId);
      const r = learnerGoal(input, userId);
      if (!r.ok) return r;
      const log = await readLog(userId, lang);
      const existing = log.goalsDefined.find((g) => g.id === r.goal.id);
      if (existing) return { ok: true, goal: existing };
      await bus.emit<TellGoalDefined>({ type: 'TellGoalDefined', ...base(userId, lang, 'tell:goals', `tell-goal:${userId}:${lang}:${r.goal.id}:v${r.goal.version}`), goal: r.goal });
      return r;
    },

    async next(userId, lang, opts) {
      assertActor(userId);
      let log = await readLog(userId, lang);
      const openIds = [...log.tasks.keys()].filter((id) => !log.closes.has(id));
      const open = openIds[openIds.length - 1];
      if (open) {
        const t = log.tasks.get(open)!;
        if (!opts?.goalId || opts.goalId === t.goalId) return api.task(userId, open);
        await api.close(userId, open); // he chose another meaning: the open task is left, and recorded as left
        log = await readLog(userId, lang);
      }
      const { ranked, met } = await candidates(userId, lang, log);
      const pick = opts?.goalId ? ranked.find((c) => c.goal.id === opts.goalId) : ranked[0];
      if (!pick) return undefined;
      const adapter = adapters.get(lang);
      const retell = pick.family === 'retell' ? retellSource(adapter, lang, pick.goal, met) : undefined;
      const family = pick.family === 'retell' && !retell ? 'express' : pick.family;
      const taskId = `tell:${userId}:${lang}:${log.tasks.size + 1}`;
      const selection = opts?.goalId ? { ...pick.selection, chosenByLearner: true } : pick.selection;
      const presented = await bus.emit<TellTaskPresented>({
        type: 'TellTaskPresented', ...base(userId, lang, `tell:${taskId}`, `tell-task:${taskId}`),
        taskId, goalId: pick.goal.id, goalVersion: pick.goal.version, family, prompt: promptFor(lang, pick.goal, family, retell),
        ...(retell ? { retellSource: { textId: retell.textId, title: retell.title } } : {}), selection,
      });
      if (!presented) return api.next(userId, lang, opts); // another tab created this task first: use it
      return api.task(userId, taskId);
    },

    async task(userId, taskId) {
      assertActor(userId);
      const log = await readLog(userId);
      const t = log.tasks.get(taskId);
      if (!t) return undefined;
      const langLog = await readLog(userId, t.lang);
      const goals = goalsOf(t.lang, langLog);
      const goal = goals.find((g) => g.id === t.goalId);
      if (!goal) return undefined;
      const ctx = await context(userId, t.lang, langLog, goal);
      return buildTask(langLog, taskId, goals, ctx.adapter, ctx.model, ctx.metFn);
    },

    async hint(userId, taskId) {
      const { t, log, goals, goal, adapter, model, metFn } = await loadTask(userId, taskId);
      if (log.closes.has(taskId)) throw new Error('GoTell: this task has ended');
      const shown = log.steps.filter((s) => s.taskId === taskId).map((s) => s.step);
      const attempts = log.attempts.filter((a) => a.record.taskId === taskId);
      const draft = nextStep({ goal, lang: t.lang, adapter, model, last: attempts[attempts.length - 1]?.record, shown, metSentence: metFn, floorRung: t.selection.startRung });
      if (draft) await emitStep(userId, t.lang, taskId, goal.id, shown.length + 1, draft);
      return buildTask(await readLog(userId, t.lang), taskId, goals, adapter, model, metFn)!;
    },

    async submit(userId, taskId, text) {
      const { t, log, goals, goal, adapter, rec, model, metFn } = await loadTask(userId, taskId);
      if (log.closes.has(taskId)) throw new Error('GoTell: this task has ended');
      if (!text.trim()) throw new Error('GoTell: write something first');
      const lang = t.lang;
      const shown = log.steps.filter((s) => s.taskId === taskId).map((s) => s.step);
      const prior = log.attempts.filter((a) => a.record.taskId === taskId).map((a) => a.record);
      const meaning = assessMeaning(adapter, lang, goal, text);
      const language = assessLanguage(adapter, text);
      const errors = errorsOf(goal, meaning, language);
      const outcome = outcomeOf(meaning, language);
      const tier = strongestTier(shown);
      // self-repair: it failed before in this task, and since the first failure nothing that gives wording was shown
      const firstFail = prior.find((a) => a.outcome !== 'success');
      const failAt = firstFail ? log.attempts.find((a) => a.record.attemptId === firstFail.attemptId)!.at : undefined;
      const selfRepair = outcome === 'success' && !!failAt && !log.steps.some((s) => s.taskId === taskId && s.at >= failAt && GIVES_WORDING(s.step.kind));
      const gapItemIds = meaning.missing.flatMap((c) => (rec.byConcept.get(c) ?? []).filter((id) => id.startsWith('form:')).slice(0, MAX_GAP_ITEMS_PER_CONCEPT));
      const advice = await consult(deps.interpreter, { lang, goal, text }, meaning);
      const number = prior.length + 1;
      const attemptId = `${taskId}/a${number}`;
      const at = clock();

      const draft: TellAttemptRecord = {
        attemptId, taskId, goalId: goal.id, goalVersion: goal.version, family: t.family, number, text, textHash: hash(text),
        assistance: shown, tier, afterModel: shown.some((s) => s.kind === 'full-model'), meaning, language, errors, selfRepair, outcome,
        evaluator: { ...EVALUATOR, confidence: Math.round(meaning.confidence * (language.noIssuesDetected ? 1 : 0.95) * 100) / 100,
          ...(advice.advisory ? { advisory: advice.advisory } : {}), ...(advice.rejected ? { advisoryRejected: advice.rejected } : {}) },
        levelBefore: 0, levelAfter: 0, rule: '', gapItemIds,
      };
      // the state change, computed by the same fold that every later read uses
      const goalsNow = goals;
      const before = foldStates(goalsNow, timedAttempts(log), timedSteps(log), []).get(goal.id) ?? emptyState(goal.id);
      const after = foldStates(goalsNow, [...timedAttempts(log), { at, record: draft }], timedSteps(log), []).get(goal.id) ?? emptyState(goal.id);
      const record: TellAttemptRecord = { ...draft, levelBefore: before.level, levelAfter: after.level, rule: after.rule };
      await bus.emit<TellAttemptSubmitted>({ type: 'TellAttemptSubmitted', ...base(userId, lang, `tell:${taskId}`, `tell-attempt:${attemptId}`), at, record });

      if (outcome === 'success') {
        // classified by the support it counts with (a model shown minutes ago in another task makes it a copy)
        const counted = effectiveSupport({ at, record }, timedSteps(log)).tier;
        const kind: ProductionKind = counted === 'model' ? 'copied' : counted === 'scaffold' ? 'assisted' : counted === 'cue' ? (selfRepair ? 'self-repaired' : 'assisted') : 'independent';
        await recordProduction(userId, lang, adapter, record, kind);
        await bus.emit<TellTaskClosed>({ type: 'TellTaskClosed', ...base(userId, lang, `tell:${taskId}`, `tell-close:${taskId}`), taskId, goalId: goal.id, outcome: record.afterModel ? 'model-reproduced' : 'success', finalAttemptId: attemptId });
      }
      return { task: buildTask(await readLog(userId, lang), taskId, goals, adapter, model, metFn)!, attempt: record };
    },

    async close(userId, taskId) {
      assertActor(userId);
      const log = await readLog(userId);
      const t = log.tasks.get(taskId);
      if (!t) throw new Error('GoTell: task not found or not owned by this user');
      if (log.closes.has(taskId)) return;
      await bus.emit<TellTaskClosed>({ type: 'TellTaskClosed', ...base(userId, t.lang, `tell:${taskId}`, `tell-close:${taskId}`), taskId, goalId: t.goalId, outcome: 'abandoned' });
    },

    async states(userId, lang) {
      assertActor(userId);
      const log = await readLog(userId, lang);
      const goals = goalsOf(lang, log);
      const states = await computeStates(userId, lang, log, goals);
      return goals.map((g) => states.get(g.id) ?? emptyState(g.id));
    },

    async schedule(userId, lang) {
      assertActor(userId);
      return (await candidates(userId, lang, await readLog(userId, lang))).ranked;
    },

    async attempts(userId, lang, goalId) {
      assertActor(userId);
      const log = await readLog(userId, lang);
      return log.attempts.map((a) => a.record).filter((r) => !goalId || r.goalId === goalId);
    },

    async testimonyMap(userId, lang): Promise<TestimonyMap> {
      assertActor(userId);
      const log = await readLog(userId, lang);
      const goals = goalsOf(lang, log).filter((g) => g.domain === 'testimony').sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
      const states = await computeStates(userId, lang, log, goalsOf(lang, log));
      const adapter = adapters.get(lang);
      const testimony = await store.testimonies.get(ids.testimony(userId, lang));
      const revs = testimony ? (await store.revisions.where('testimonyId', testimony.id)).filter((r) => r.userId === userId).sort((a, b) => a.number - b.number) : [];
      const current = testimony?.currentRevisionId ? revs.find((r) => r.id === testimony.currentRevisionId) : revs[revs.length - 1];
      const sugs = testimony ? (await store.suggestions.where('testimonyId', testimony.id)).filter((s) => s.userId === userId) : [];
      const nodes = goals.map((goal) => {
        const inTestimony = (current?.sentences ?? []).filter((s) => assessMeaning(adapter, lang, goal, s.text).success).map((s) => {
          const set = normSet(parse(adapter, s.text));
          const own = !sugs.some((x) => [x.original, x.suggested, x.finalText ?? ''].some((tx) => tx && dice(set, normSet(parse(adapter, tx))) >= 0.5));
          return { revisionId: current!.id, sentenceIndex: s.index, text: s.text, own };
        });
        return { goal, state: states.get(goal.id) ?? emptyState(goal.id), inTestimony };
      });
      const lengths = ['short', 'standard', 'full'] as const;
      const rank = { short: 0, standard: 1, full: 2 } as const;
      const deliveries = lengths.map((length) => {
        const ns = nodes.filter((n) => rank[n.goal.delivery ?? 'full'] <= rank[length]);
        return {
          length, goalIds: ns.map((n) => n.goal.id),
          canSayAlone: ns.filter((n) => n.state.level >= 4).map((n) => n.goal.id),
          inTestimony: ns.filter((n) => n.inTestimony.length > 0).map((n) => n.goal.id),
          missing: ns.filter((n) => n.state.level < 4 && n.inTestimony.length === 0).map((n) => n.goal.id),
        };
      });
      return { ...(current ? { revisionId: current.id } : {}), nodes, deliveries };
    },
  };
  return api;
}
