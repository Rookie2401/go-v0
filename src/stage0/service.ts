/**
 * Stage 0 service — the only thing the Stage 0 UI calls.
 *
 * Writes only events. Stage 0's own facts go in Stage0* events (folded by state.ts); every ordinary act also reaches GoLearn
 * as its ordinary event, so GoLearn's evidence rules decide what it is worth:
 *   a line read                    SentenceViewed (exposure)
 *   English opened                 EnglishRescueRevealed (scope sentence)
 *   a word's gloss opened          TokenHelpOpened (level 1)
 *   romanization / decoding shown  DecodingRevealed (romanization flagged)
 *   a check right, nothing opened  ComprehensionReported degree all — reading, or listening only with a NATIVE recording
 *                                  (a computer voice is practice: no listening report is sent)
 *   a production accepted          ProductionRecorded (copied / assisted / independent, by what was on screen)
 * Exit-gate answers never reach GoLearn (protected material: no encounters, no mastery).
 */
import { hash, ids } from '../core';
import type {
  AdapterRegistry, AppStore, DecodingRevealed, EnglishRescueRevealed, EventBus, LanguageCode, ProductionKind, ProductionRecorded, SentenceViewed,
  ComprehensionReported, Stage0AudioSource, Stage0Channel, Stage0CheckAnswered, Stage0DecodeAnswered, Stage0ExitAnswered, Stage0ExitFinished,
  Stage0ExitResult, Stage0ExitSection, Stage0ExitStarted, Stage0Meters, Stage0PathStep, Stage0ProductionAttempted, Stage0Service,
  Stage0PathOverridden, Stage0SettingsChanged, Stage0SpeakingRecorded, Stage0StepCompleted, Stage0StepView, Stage0Support, Stage0SupportUsed, TokenHelpOpened, UserRecordingCreated,
  NoteOpened, GoLearn,
} from '../core';
import { importDocuments } from '../ingest';
import type { Stage0Pack, Stage0World } from './content';
import { bundledStage0, stepTitle } from './content';
import { lineSentenceId, sceneDocument, sceneTextId } from './documents';
import { pathCoverage } from './coverage';
import { chooseForm, ladderOpening, scoreExit, unavailableSections } from './exit';
import { presentation as decidePresentation } from './fading';
import { featuresOfWord, wordsOf } from './features';
import { matchAnswer } from './match';
import { STAGE0_TYPES, checksSecure, foldStage0, supportsInVisit } from './state';
import type { Stage0State } from './state';
import type { Stage0Overview } from '../core';

export interface Stage0Deps {
  store: AppStore;
  bus: EventBus;
  adapters: AdapterRegistry;
  clock?: () => string;
  actor?: () => string | undefined;
  /** Personal coverage of the next scene (optional): which of its words this learner has met, per GoLearn. */
  golearn?: Pick<GoLearn, 'queryItems'>;
  /** Content packs (tests inject their own); default: the bundled data/stage0. */
  content?: { world?: Stage0World; packs: Map<LanguageCode, Stage0Pack> };
}

export interface Stage0ServiceImpl extends Stage0Service {
  forUser(userId: string): Stage0ServiceImpl;
  pack(lang: LanguageCode): Stage0Pack | undefined;
  world(): Stage0World | undefined;
  state(userId: string, lang: LanguageCode): Promise<Stage0State>;
}

const EXIT_STEP = 'exit';

/** Constructions met, recognized (a scene representing it understood unaided throughout) and produced (accepted, no model). */
function constructionMeter(p: Stage0Pack, st: Stage0State): Stage0Meters['constructions'] {
  const kinds = new Set(['construction', 'grammar']);
  const ids = new Set(p.coverage.filter((c) => kinds.has(c.kind)).map((c) => c.id));
  const met = new Set<string>();
  const recognized = new Set<string>();
  const produced = new Set<string>();
  for (const step of p.path.steps) {
    const facts = st.steps.get(step.id);
    const scene = step.ref ? p.scenes.get(step.ref) : undefined;
    if (!facts || !scene) continue;
    const reps = (scene.represents ?? []).filter((r) => ids.has(r));
    reps.forEach((r) => met.add(r));
    if (scene.checks.length && scene.checks.every((c) => { const a = facts.checks.get(c.id); return a?.correct && !a.rescuedBefore; })) reps.forEach((r) => recognized.add(r));
    for (const t of scene.production ?? []) {
      if (t.kind === 'copy') continue;
      if (!(facts.production.get(t.id) ?? []).some((a) => a.accepted && !a.shown.includes('model'))) continue;
      for (const b of t.basedOn) if (ids.has(b)) produced.add(b);
    }
  }
  return { met: met.size, recognized: recognized.size, produced: produced.size, total: ids.size };
}

/**
 * Production as retrieval: among scenes already done, a non-copy task he has not yet produced without a model, preferring the
 * one whose constructions recur in the most scenes (the most practised but not yet retrieved).
 */
function retrievalTask(p: Stage0Pack, st: Stage0State, views: Stage0StepView[]): Stage0Overview['retrieval'] {
  const reps = new Map<string, number>();
  for (const s of p.scenes.values()) for (const r of s.represents ?? []) reps.set(r, (reps.get(r) ?? 0) + 1);
  let best: { score: number; out: NonNullable<Stage0Overview['retrieval']> } | undefined;
  for (const v of views) {
    if (v.step.kind !== 'scene' || (v.status !== 'done' && v.status !== 'secure')) continue;
    const scene = p.scenes.get(v.step.ref ?? '');
    for (const t of scene?.production ?? []) {
      if (t.kind === 'copy' || t.kind === 'choose') continue;
      const attempts = st.steps.get(v.step.id)?.production.get(t.id) ?? [];
      if (attempts.some((a) => a.accepted && !a.shown.includes('model'))) continue;
      const score = t.basedOn.reduce((n, b) => n + (reps.get(b) ?? 0), 0) + (attempts.length ? 1 : 0);
      if (!best || score > best.score) best = { score, out: { stepId: v.step.id, taskId: t.id, prompt: t.prompt, why: attempts.length ? 'You tried this before with help; now from memory.' : 'You have met this several times; now say it yourself.' } };
    }
  }
  return best?.out;
}

export function createStage0(deps: Stage0Deps): Stage0ServiceImpl {
  const { store, bus, adapters } = deps;
  const clock = deps.clock ?? (() => new Date().toISOString());
  const content = deps.content ?? bundledStage0();
  const featureTotals = new Map<LanguageCode, number>();

  const build = (actor: () => string | undefined): Stage0ServiceImpl => {
    const assertActor = (userId: string) => {
      const a = actor();
      if (a !== undefined && a !== userId) throw new Error('Stage 0: not permitted for this user');
    };
    const pack = (lang: LanguageCode): Stage0Pack => {
      const p = content.packs.get(lang);
      if (!p) throw new Error(`Stage 0: no content for ${lang}`);
      return p;
    };
    const session = (lang: LanguageCode) => `stage0:${lang}:${clock().slice(0, 10)}`;
    const base = (userId: string, lang: LanguageCode, dedupeKey: string, surface: 'corpus' | 'home' = 'home') => ({ userId, lang, surface, session: session(lang), dedupeKey, at: clock() });
    const unique = (userId: string, what: string) => `stage0:${what}:${userId}:${clock()}:${Math.random().toString(36).slice(2, 8)}`;
    const stepOf = (lang: LanguageCode, stepId: string): { step: Stage0PathStep; index: number } => {
      const steps = pack(lang).path.steps;
      const index = steps.findIndex((s) => s.id === stepId);
      if (index < 0) throw new Error(`Stage 0: no step "${stepId}" in ${lang}`);
      return { step: steps[index], index };
    };
    const sceneOfStep = (lang: LanguageCode, stepId: string) => {
      const { step } = stepOf(lang, stepId);
      const scene = step.ref ? pack(lang).scenes.get(step.ref) : undefined;
      if (!scene) throw new Error(`Stage 0: step "${stepId}" is not a scene`);
      return scene;
    };
    const readState = async (userId: string, lang: LanguageCode): Promise<Stage0State> =>
      foldStage0(lang, await bus.history({ userId, types: [...STAGE0_TYPES] }));
    const totalFeatures = (lang: LanguageCode): number => {
      let n = featureTotals.get(lang);
      if (n === undefined) {
        const p = pack(lang);
        const a = adapters.get(lang);
        const set = new Set<string>();
        for (const s of p.scenes.values()) for (const l of s.lines) for (const w of wordsOf(a, lang, l.text)) w.features.forEach((f) => set.add(f));
        for (const s of p.sounds.values()) for (const w of s.words) featuresOfWord(a, lang, w.text).forEach((f) => set.add(f));
        n = set.size;
        featureTotals.set(lang, n);
      }
      return n;
    };

    const stepView = (p: Stage0Pack, st: Stage0State, step: Stage0PathStep): Stage0StepView => {
      const facts = st.steps.get(step.id);
      const title = stepTitle(p, step);
      if (step.kind === 'exit') {
        const done = st.exits.filter((x) => x.finished);
        const last = done[done.length - 1]?.finished?.result;
        if (!last) return { step, title, status: st.exits.length ? 'started' : 'new', detail: st.exits.length ? 'Started, not finished.' : 'When you feel ready: new material, to see whether you can learn from real texts now.' };
        const ok = last.verdict === 'ready' || last.verdict === 'ready-provisional';
        return { step, title, status: ok ? 'secure' : 'done', detail: last.verdictDetail ?? '' };
      }
      if (!facts || facts.events === 0) return { step, title, status: 'new', detail: step.kind === 'review' ? 'Not yet.' : 'New.' };
      if (step.kind === 'sounds') {
        const sound = p.sounds.get(step.ref!);
        const all = sound?.checks ?? [];
        const right = all.filter((c) => { const a = facts.decodes.get(c.id); return a?.correct && !a.transliterationShown; }).length;
        const secure = facts.completed && all.length > 0 && right === all.length;
        return { step, title, status: secure ? 'secure' : facts.completed ? 'done' : 'started', detail: `${right} of ${all.length} read right on your own.` };
      }
      const scene = p.scenes.get(step.ref!);
      const all = scene?.checks ?? [];
      // A scene counts toward the exit only when its checks are SECURE: every comprehension check's latest answer is right
      // (the step player asks a wrong one again). A step finished or left with one still wrong stays "started" and is marked.
      const cs = checksSecure({ checks: all }, facts);
      const counts = facts.completed && cs.secure;
      const notSecure = !cs.secure && (facts.completed || facts.checks.size > 0);
      const unaided = all.filter((c) => { const a = facts.checks.get(c.id); return a?.correct && !a.rescuedBefore; }).length;
      const tasks = scene?.production ?? [];
      const made = tasks.filter((t) => facts.production.get(t.id)?.some((x) => x.accepted)).length;
      const secure = counts && all.length > 0 && unaided === all.length && made === tasks.length;
      const detail = notSecure
        ? `Not secure yet: ${cs.right} of ${cs.total} questions answered right. It does not count toward the check until every question is right — open it and try the questions again.`
        : `${unaided} of ${all.length} understood without English${tasks.length ? `; ${made} of ${tasks.length} said yourself` : ''}.`;
      return { step, title, status: secure ? 'secure' : counts ? 'done' : 'started', detail, checksSecure: cs.secure, counts, notSecure };
    };

    const api: Stage0ServiceImpl = {
      forUser: (userId: string) => build(() => userId),
      pack: (lang) => content.packs.get(lang),
      world: () => content.world,
      state: async (userId, lang) => { assertActor(userId); return readState(userId, lang); },

      available: (lang) => (content.packs.get(lang)?.path.steps.length ?? 0) > 0,

      async ensureTexts(lang) {
        const p = content.packs.get(lang);
        if (!p) return;
        const docs = [...p.scenes.values()].sort((a, b) => (a.id < b.id ? -1 : 1)).map((s) => sceneDocument(s, content.world));
        const signature = `stage0@1|${hash(JSON.stringify(docs))}|${adapters.get(lang).version}`;
        const metaId = `stage0-texts:${lang}`;
        const last = await store.meta.get(metaId);
        if (last?.value === signature) return;
        const report = await importDocuments(store, adapters, docs, { clock });
        if (report.ok) await store.meta.put({ id: metaId, value: signature, updatedAt: clock() });
        else throw new Error(`Stage 0: the importer refused the ${lang} scenes: ${report.documents.filter((d) => d.action === 'rejected').map((d) => `${d.id}: ${d.issues.map((i) => i.message).join('; ')}`).join(' | ')}`);
      },

      async overview(userId, lang) {
        assertActor(userId);
        const p = content.packs.get(lang);
        const emptyMeters: Stage0Meters = { decoding: { secure: 0, met: 0, total: 0 }, readingIndependence: { unaided: 0, answered: 0 }, listening: { native: { correct: 0, answered: 0 }, computerVoice: { correct: 0, answered: 0 } }, production: {}, speaking: { recorded: 0 }, constructions: { met: 0, recognized: 0, produced: 0, total: 0 }, supportDependence: { english: 0, transliteration: 0, window: 0 } };
        if (!p) return { lang, available: false, contentStatus: 'No Stage 0 for this language yet.', steps: [], meters: emptyMeters, after: [], ladder: { open: false } };
        const st = await readState(userId, lang);
        const steps = p.path.steps.map((s) => stepView(p, st, s));
        // Continue: the first step not yet begun or in progress; a step left "not secure yet" comes back after those, before the check.
        const open = (s: Stage0StepView) => s.status === 'new' || s.status === 'started';
        const next = steps.find((s) => s.step.kind !== 'exit' && open(s) && !s.notSecure) ?? steps.find((s) => s.notSecure) ?? steps.find(open);
        const items = [...p.scenes.values(), ...p.sounds.values(), ...p.exits.values()];
        const reviewed = items.filter((x) => x.provenance.review.status === 'reviewed').length;
        const contentStatus = reviewed === items.length ? 'Reviewed by a native speaker.' : reviewed === 0
          ? 'Draft: written with the help of an AI model and not yet checked by a native speaker. It may contain mistakes; it will be corrected after review.'
          : `Partly reviewed: ${reviewed} of ${items.length} pieces checked by a native speaker; the rest are AI-assisted drafts.`;
        const lastExit = st.exits.filter((x) => x.finished).pop()?.finished?.result;
        const retrieval = retrievalTask(p, st, steps);
        let nextCoverage: Stage0Overview['nextCoverage'];
        const nextScene = next?.step.kind === 'scene' && next.step.ref ? p.scenes.get(next.step.ref) : undefined;
        if (nextScene) {
          const cov = pathCoverage(p, adapters.get(lang), content.world).find((c) => c.stepId === next!.step.id);
          let personal: number | undefined;
          if (deps.golearn) {
            const words = nextScene.lines.flatMap((l) => wordsOf(adapters.get(lang), lang, l.text));
            if (words.length) {
              const ks = await deps.golearn.queryItems(userId, words.map((w) => ({ itemId: ids.form(lang, w.normalized), lang })));
              personal = ks.filter((k) => k.exists && k.encounterCount > 0).length / words.length;
            }
          }
          if (cov) nextCoverage = { curriculum: cov.coverage, ...(personal !== undefined ? { personal } : {}) };
        }
        return {
          lang, available: true, contentStatus, steps,
          ...(next ? { next: next.step, nextReason: next.notSecure ? 'Not secure yet: try its questions again.' : next.status === 'started' ? 'You started this one.' : 'Next on the path.' } : {}),
          ladder: ladderOpening(st),
          meters: { ...st.meters, decoding: { ...st.meters.decoding, total: totalFeatures(lang) }, constructions: constructionMeter(p, st) },
          ...(st.speakerForm ? { speakerForm: st.speakerForm } : {}),
          ...(lastExit ? { exit: lastExit } : {}),
          after: p.path.next ?? [],
          ...(retrieval ? { retrieval } : {}),
          ...(nextCoverage ? { nextCoverage } : {}),
        };
      },

      scene: (lang, id) => content.packs.get(lang)?.scenes.get(id),
      soundStep: (lang, id) => content.packs.get(lang)?.sounds.get(id),

      async sceneText(lang, sceneId) {
        const scene = content.packs.get(lang)?.scenes.get(sceneId);
        if (!scene) return undefined;
        const textId = sceneTextId(lang, scene);
        if (!(await store.texts.get(textId))) return undefined;
        return { textId, sentenceIds: Object.fromEntries(scene.lines.map((l) => [l.id, lineSentenceId(lang, scene, l.id)])) };
      },

      async presentation(userId, lang, stepId, audio = 'none') {
        assertActor(userId);
        const { step, index } = stepOf(lang, stepId);
        const scene = step.ref ? pack(lang).scenes.get(step.ref) : undefined;
        return decidePresentation({ lang, adapter: adapters.get(lang), state: await readState(userId, lang), step, stepIndex: index, ...(scene ? { scene } : {}), audio });
      },

      async setSpeakerForm(userId, lang, form) {
        assertActor(userId);
        await bus.emit<Stage0SettingsChanged>({ type: 'Stage0SettingsChanged', ...base(userId, lang, unique(userId, 'settings')), stepId: 'settings', speakerForm: form });
      },

      async lineSeen(userId, lang, stepId, lineId) {
        assertActor(userId);
        const scene = sceneOfStep(lang, stepId);
        const textId = sceneTextId(lang, scene);
        const sentenceId = lineSentenceId(lang, scene, lineId);
        const [text, tokens] = await Promise.all([store.texts.get(textId), store.tokens.where('sentenceId', sentenceId)]);
        if (!text) return; // texts not imported yet: nothing to attach the exposure to
        await bus.emit<SentenceViewed>({
          type: 'SentenceViewed', ...base(userId, lang, `stage0-view:${userId}:${session(lang)}:${sentenceId}`, 'corpus'),
          textId, sentenceId, tokenIds: tokens.sort((a, b) => a.index - b.index).map((t) => t.id), dwellMs: 2000, contentVersion: text.contentVersion,
        });
      },

      async supportUsed(userId, lang, stepId, support, lineIds, detail) {
        assertActor(userId);
        const { step } = stepOf(lang, stepId);
        await bus.emit<Stage0SupportUsed>({ type: 'Stage0SupportUsed', ...base(userId, lang, unique(userId, 'support')), stepId, support, lineIds, ...(detail?.features ? { features: detail.features } : {}) });
        const scene = step.ref ? pack(lang).scenes.get(step.ref) : undefined;
        if (!scene || !(await store.texts.get(sceneTextId(lang, scene)))) return;
        const textId = sceneTextId(lang, scene);
        const sentenceIds = lineIds.map((l) => lineSentenceId(lang, scene, l));
        if (support === 'english') {
          await bus.emit<EnglishRescueRevealed>({ type: 'EnglishRescueRevealed', ...base(userId, lang, unique(userId, 'rescue'), 'corpus'), textId, sentenceIds, scope: 'sentence' });
        } else if (support === 'gloss' && detail?.tokenId && detail.itemId) {
          await bus.emit<TokenHelpOpened>({ type: 'TokenHelpOpened', ...base(userId, lang, unique(userId, 'gloss'), 'corpus'), sentenceId: sentenceIds[0], tokenId: detail.tokenId, itemId: detail.itemId, level: 1 });
        } else if (support === 'transliteration' && detail?.tokenId && detail.itemId) {
          await bus.emit<DecodingRevealed>({ type: 'DecodingRevealed', ...base(userId, lang, unique(userId, 'roman'), 'corpus'), sentenceId: sentenceIds[0], tokenId: detail.tokenId, itemId: detail.itemId, features: detail.features ?? [], romanization: true });
        } else if (support === 'note') {
          await bus.emit<NoteOpened>({ type: 'NoteOpened', ...base(userId, lang, unique(userId, 'note'), 'corpus'), textId, noteId: `${scene.id}:${detail?.itemId ?? 'note'}`, ...(sentenceIds[0] ? { sentenceId: sentenceIds[0] } : {}), kind: 'grammar' });
        }
      },

      async answerCheck(userId, lang, stepId, checkId, choice, channel, audio) {
        assertActor(userId);
        const scene = sceneOfStep(lang, stepId);
        const check = scene.checks.find((c) => c.id === checkId);
        if (!check) throw new Error(`Stage 0: no check "${checkId}"`);
        const state = await readState(userId, lang);
        const used = supportsInVisit(state, stepId, check.lines);
        const supportsBefore = [...new Set(used.map((u) => u.support))] as Stage0Support[];
        const rescuedBefore = supportsBefore.includes('english');
        const correct = choice === check.answer;
        const sawTransliteration = supportsBefore.includes('transliteration');
        const unaidedFeatures = channel === 'read' && correct && !rescuedBefore && !sawTransliteration
          ? [...new Set(check.lines.flatMap((id) => { const l = scene.lines.find((x) => x.id === id); return l ? wordsOf(adapters.get(lang), lang, l.text).flatMap((w) => w.features) : []; }))]
          : [];
        await bus.emit<Stage0CheckAnswered>({
          type: 'Stage0CheckAnswered', ...base(userId, lang, unique(userId, 'check')), stepId, sceneId: scene.id, checkId, lineIds: check.lines,
          choice, correct, channel, audio, rescuedBefore, supportsBefore, unaidedFeatures,
        });
        // GoLearn: understood with nothing opened. Listening only when the audio was a reviewed native recording.
        const byEar = channel === 'listen-only' || (channel === 'listen-first' && !supportsBefore.includes('transcript'));
        if (correct && !rescuedBefore && (!byEar || audio === 'native')) {
          const text = await store.texts.get(sceneTextId(lang, scene));
          if (text) {
            const sentenceIds = check.lines.map((l) => lineSentenceId(lang, scene, l));
            await bus.emit<ComprehensionReported>({
              type: 'ComprehensionReported', ...base(userId, lang, `stage0-cr:${userId}:${session(lang)}:${byEar ? 'l' : 'r'}:${sentenceIds.join(',')}`, 'corpus'),
              textId: text.id, sentenceIds, modality: byEar ? 'listening' : 'reading', scope: 'sentence', degree: 'all', contentVersion: text.contentVersion,
            });
          }
        }
        return { correct, rescued: rescuedBefore };
      },

      async answerDecode(userId, lang, stepId, checkId, answer, transliterationShown, audio) {
        assertActor(userId);
        const { step } = stepOf(lang, stepId);
        const sound = step.ref ? pack(lang).sounds.get(step.ref) : undefined;
        const check = sound?.checks.find((c) => c.id === checkId);
        if (!check) throw new Error(`Stage 0: no decode check "${checkId}"`);
        const correct = check.kind === 'segment'
          ? Array.isArray(answer) && JSON.stringify([...answer].sort((a, b) => a - b)) === JSON.stringify(check.boundaries)
          : answer === check.answer;
        await bus.emit<Stage0DecodeAnswered>({
          type: 'Stage0DecodeAnswered', ...base(userId, lang, unique(userId, 'decode')), stepId, checkId, kind: check.kind, word: check.word,
          features: check.kind === 'segment' ? [] : featuresOfWord(adapters.get(lang), lang, check.word), correct, transliterationShown, audio,
        });
        return { correct };
      },

      async submitProduction(userId, lang, stepId, taskId, text, shown) {
        assertActor(userId);
        const scene = sceneOfStep(lang, stepId);
        const task = scene.production?.find((t) => t.id === taskId);
        if (!task) throw new Error(`Stage 0: no task "${taskId}"`);
        const state = await readState(userId, lang);
        const m = matchAnswer(lang, text, task.accept, state.speakerForm);
        await bus.emit<Stage0ProductionAttempted>({
          type: 'Stage0ProductionAttempted', ...base(userId, lang, unique(userId, 'prod')), stepId, taskId, kind: task.kind, text, accepted: m.accepted,
          ...(m.matched ? { matched: m.matched } : {}), shown,
        });
        if (m.accepted && !m.spellingNote) {
          const independent = ['recall', 'answer', 'describe', 'retell'].includes(task.kind) && !shown.includes('model') && !shown.includes('english');
          const kind: ProductionKind = task.kind === 'copy' ? 'copied' : independent ? 'independent' : 'assisted';
          const adapter = adapters.get(lang);
          const textHash = hash(text);
          for (const w of wordsOf(adapter, lang, text)) {
            if (m.personal?.some((x) => x.toLowerCase().includes(w.normalized.toLowerCase()))) continue; // his own name is not language evidence
            const items: Array<[string, 'form' | 'lemma']> = [[ids.form(lang, w.normalized), 'form']];
            if (w.lemma) items.push([ids.lemma(lang, w.lemma, w.pos as never), 'lemma']);
            for (const [itemId, itemKind] of items) {
              await bus.emit<ProductionRecorded>({
                type: 'ProductionRecorded', ...base(userId, lang, `prod:${userId}:${textHash}:${itemId}`, 'corpus'),
                itemId, itemKind, kind, modality: 'writing', sentenceText: text, sentenceHash: textHash,
              });
            }
          }
        }
        const feedback = m.accepted ? (m.spellingNote ?? 'Yes — you said it.') : (m.spellingNote ?? 'Not quite yet. Look at the sentences again, then try once more.');
        return { accepted: m.accepted, ...(m.matched ? { matched: m.matched } : {}), feedback };
      },

      async recordSpeaking(userId, lang, stepId, itemId, recordingId, selfCheck) {
        assertActor(userId);
        await bus.emit<Stage0SpeakingRecorded>({ type: 'Stage0SpeakingRecorded', ...base(userId, lang, unique(userId, 'speak')), stepId, itemId, ...(recordingId ? { recordingId } : {}), selfCheck });
        if (recordingId) {
          await bus.emit<UserRecordingCreated>({ type: 'UserRecordingCreated', ...base(userId, lang, `stage0-rec:${recordingId}`), recordingId, targetText: itemId });
        }
      },

      async completeStep(userId, lang, stepId) {
        assertActor(userId);
        stepOf(lang, stepId);
        await bus.emit<Stage0StepCompleted>({ type: 'Stage0StepCompleted', ...base(userId, lang, unique(userId, 'done')), stepId });
      },

      async overridePath(userId, lang) {
        assertActor(userId);
        pack(lang);
        await bus.emit<Stage0PathOverridden>({ type: 'Stage0PathOverridden', ...base(userId, lang, unique(userId, 'override')), stepId: 'override' });
      },

      exitForm: (lang, formId) => content.packs.get(lang)?.exits.get(formId),

      async startExit(userId, lang, opts) {
        assertActor(userId);
        const p = pack(lang);
        const st = await readState(userId, lang);
        const chosen = chooseForm(p, st);
        if (!chosen) throw new Error(`Stage 0: no exit form for ${lang}`);
        const attemptId = `stage0-exit:${userId}:${lang}:${st.exits.length + 1}`;
        const unavailable = unavailableSections(chosen.form, { microphone: opts?.microphone ?? false });
        await bus.emit<Stage0ExitStarted>({ type: 'Stage0ExitStarted', ...base(userId, lang, attemptId), stepId: EXIT_STEP, attemptId, formId: chosen.form.id, unseen: chosen.unseen, unavailable });
        return { attemptId, formId: chosen.form.id, unseen: chosen.unseen, unavailable };
      },

      async answerExit(userId, lang, attemptId, section, itemId, answer) {
        assertActor(userId);
        const st = await readState(userId, lang);
        const attempt = st.exits.find((x) => x.started.attemptId === attemptId);
        if (!attempt) throw new Error('Stage 0: no such exit attempt for this learner');
        if (attempt.finished) throw new Error('Stage 0: this exit attempt is finished');
        const form = pack(lang).exits.get(attempt.started.formId)!;
        let correct: boolean | undefined;
        let accepted: boolean | undefined;
        if (section === 'reading' || section === 'listening') {
          const check = form[section].checks.find((c) => c.id === itemId);
          if (!check) throw new Error(`Stage 0: no ${section} item "${itemId}"`);
          correct = answer.choice === check.answer;
        } else if (section === 'decoding') {
          const check = form.decoding?.find((c) => c.id === itemId);
          if (!check) throw new Error(`Stage 0: no decoding item "${itemId}"`);
          correct = check.kind === 'segment' ? JSON.stringify([...(answer.boundaries ?? [])].sort((a, b) => a - b)) === JSON.stringify(check.boundaries) : answer.choice === check.answer;
        } else if (section === 'writing') {
          const task = form.writing.find((t) => t.id === itemId);
          if (!task) throw new Error(`Stage 0: no writing item "${itemId}"`);
          accepted = matchAnswer(lang, answer.text ?? '', task.accept, st.speakerForm).accepted;
        }
        await bus.emit<Stage0ExitAnswered>({
          type: 'Stage0ExitAnswered', ...base(userId, lang, unique(userId, 'exit-answer')), stepId: EXIT_STEP, attemptId, section, itemId,
          ...(correct !== undefined ? { correct } : {}), ...(accepted !== undefined ? { accepted } : {}),
          ...(answer.text !== undefined ? { text: answer.text } : {}), ...(answer.recordingId ? { recordingId: answer.recordingId } : {}),
          ...(answer.selfCheck ? { selfCheck: answer.selfCheck } : {}), ...(answer.lookups !== undefined ? { lookups: answer.lookups } : {}),
        });
        return { ...(correct !== undefined ? { correct } : {}), ...(accepted !== undefined ? { accepted } : {}) };
      },

      async finishExit(userId, lang, attemptId): Promise<Stage0ExitResult> {
        assertActor(userId);
        const st = await readState(userId, lang);
        const attempt = st.exits.find((x) => x.started.attemptId === attemptId);
        if (!attempt) throw new Error('Stage 0: no such exit attempt for this learner');
        if (attempt.finished) return attempt.finished.result;
        const form = pack(lang).exits.get(attempt.started.formId)!;
        const result = { ...scoreExit(lang, form, attempt), finishedAt: clock() };
        await bus.emit<Stage0ExitFinished>({ type: 'Stage0ExitFinished', ...base(userId, lang, `${attemptId}:finished`), stepId: EXIT_STEP, attemptId, result });
        return result;
      },
    };
    return api;
  };
  return build(deps.actor ?? (() => undefined));
}

export type { Stage0AudioSource, Stage0Channel, Stage0ExitSection };
