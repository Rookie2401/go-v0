/**
 * The simulation loop. A deterministic learner (learner.ts) asks the app's real engine what to read, reads it, and the events it
 * emits are the ones the reader emits, so GoLearn folds them exactly as for a real student.
 *
 *   Stage 0 first        every scene of the path in order (lineSeen / gloss for an unknown word / English for a check the
 *                        learner cannot do / answerCheck / completeStep), sounds steps as their example words, then an exit
 *                        verdict: 'ready' when >= 80 % of Stage 0's lemmas are known, else 'ready-provisional'.
 *   then, in a loop      recommend(limit 5) -> the FIRST recommendation the learner may open (not testimony, not listening-only,
 *                        not unpublished outside preview, openable) -> read it -> repeat.
 *
 * READING a text, sentence by sentence, as src/ui/reader/Reader.tsx does it:
 *   SentenceViewed (word token ids)                           always
 *   TokenHelpOpened level 1 (the word sheet's gloss)           for every word whose lemma the learner does not know yet
 *   ComprehensionReported sentence, degree 'all'               always; "understood without help" when >= 95 % of the sentence's
 *                                                              words were known (the unknown ones were still looked up), else
 *                                                              "understood with help" (counted in the row, not a different event)
 *   TextCompleted                                              at the end
 * The learner learns while reading: a lemma that reaches its third encounter inside a sentence is known from the next sentence.
 */
import type { LanguageCode, Recommendation, Sentence, Text, Token } from '../core';
import type {
  ComprehensionReported, SentenceViewed, Stage0ExitFinished, TextCompleted, TextViewed, TokenHelpOpened,
} from '../core';
import { isScripture } from '../golearn/candidates';
import { sceneTextId } from '../stage0/documents';
import type { Stage0ServiceImpl } from '../stage0';
import { FluffTracker } from './fluff';
import type { ParagraphIn } from './fluff';
import { LemmaIndex, SimLearner, analyseSentence } from './learner';
import type { SimWord } from './learner';
import { MILESTONES } from './types';
import type { SimEngine, SimOptions, SimRow, SimRun, SkipRecord, SourceKind, StopReason } from './types';

/** A sentence counts as understood without help when at least this share of its words was known. */
export const NO_HELP_SHARE = 0.95;
/** Stage 0 is 'ready' when at least this share of its lemmas is known. */
export const STAGE0_READY_SHARE = 0.8;
/** Between two texts the clock jumps this far: more than GoLearn's sitting gap (30 min), so each text is its own sitting. */
const SITTING_JUMP_MINUTES = 45;
/**
 * The simulated reading pace (words per calendar day) that turns words read into elapsed days for forgetting: about 20 to 30 minutes
 * of reading a day for a learner at this stage. An assumption of the model, overridable (`wordsPerDay`, `--words-per-day`).
 */
export const SIM_WORDS_PER_DAY = 2000;
const DAY_MINUTES = 1440;

// ───────────────────────────── analysing a stored text ─────────────────────────────

interface WordAct { token: Token; lemma: number }
interface SentenceAct { sentence: Sentence; words: SimWord[]; acts: WordAct[]; paragraphId: string }
interface Analysed {
  text: Text;
  sentences: SentenceAct[];
  words: SimWord[];
  paragraphs: ParagraphIn[];
}

async function analyseStored(engine: SimEngine, lemmas: LemmaIndex, textId: string): Promise<Analysed> {
  const { store } = engine;
  const text = await store.texts.get(textId);
  if (!text) throw new Error(`the text ${textId} is not in the store`);
  const adapter = engine.adapters.get(text.lang);
  const live = (await store.sentences.where('textId', textId)).filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
  const bySentence = new Map<string, Map<number, Token>>();
  for (const t of await store.tokens.where('textId', textId)) {
    let m = bySentence.get(t.sentenceId);
    if (!m) bySentence.set(t.sentenceId, (m = new Map()));
    m.set(t.index, t);
  }
  const sentences: SentenceAct[] = [];
  const all: SimWord[] = [];
  const paraText = new Map<string, { text: string[]; words: number }>();
  const paraOrder: string[] = [];
  for (const s of live) {
    const words = analyseSentence(adapter, s.text, lemmas);
    const toks = bySentence.get(s.id);
    const acts: WordAct[] = [];
    for (const w of words) { const t = toks?.get(w.tokenIndex); if (t) acts.push({ token: t, lemma: w.lemma }); }
    sentences.push({ sentence: s, words, acts, paragraphId: s.paragraphId });
    all.push(...words);
    let p = paraText.get(s.paragraphId);
    if (!p) { paraText.set(s.paragraphId, (p = { text: [], words: 0 })); paraOrder.push(s.paragraphId); }
    p.text.push(s.text); p.words += words.length;
  }
  const paragraphs = paraOrder.map((id) => ({ text: paraText.get(id)!.text.join(' '), words: paraText.get(id)!.words }));
  return { text, sentences, words: all, paragraphs };
}

// ───────────────────────────── emitters ─────────────────────────────

interface SentenceEvent {
  act: SentenceAct;
  /** Words whose lemma the learner did not know before this sentence. */
  unknown: WordAct[];
}
interface Emitter {
  opened(): Promise<void>;
  sentence(e: SentenceEvent): Promise<void>;
  completed(): Promise<void>;
}

/** What the reader emits (src/ui/reader/Reader.tsx), through the event bus. */
function readerEmitter(engine: SimEngine, text: Text, session: string): Emitter {
  const { userId, lang, bus } = engine;
  const surface = text.kind === 'scripture' ? 'scripture' : 'corpus';
  const base = (dedupeKey: string) => ({ userId, lang, surface, session, dedupeKey }) as const;
  return {
    async opened() {
      await bus.emit<TextViewed>({ type: 'TextViewed', ...base(`textviewed:${userId}:${session}:${text.id}`), textId: text.id, mode: 'open', contentVersion: text.contentVersion });
    },
    async sentence({ act, unknown }) {
      const sid = act.sentence.id;
      await bus.emit<SentenceViewed>({
        type: 'SentenceViewed', ...base(`view:${userId}:${session}:${sid}`), textId: text.id, sentenceId: sid,
        tokenIds: act.acts.map((a) => a.token.id), dwellMs: 2000, contentVersion: text.contentVersion,
      });
      for (const u of unknown) {
        await bus.emit<TokenHelpOpened>({ type: 'TokenHelpOpened', ...base(`help:${userId}:${session}:${u.token.id}`), sentenceId: sid, tokenId: u.token.id, itemId: u.token.formId, level: 1 });
      }
      if (act.words.length > 0) {
        // "with help" and "without help" are both the learner's own "Understood" press; the help events above are the difference
        await bus.emit<ComprehensionReported>({
          type: 'ComprehensionReported', ...base(`understood:${userId}:${session}:${sid}`), textId: text.id, sentenceIds: [sid], modality: 'reading', scope: 'sentence', degree: 'all',
          contentVersion: text.contentVersion,
        });
      }
    },
    async completed() {
      await bus.emit<TextCompleted>({ type: 'TextCompleted', ...base(`textcompleted:${userId}:${session}:${text.id}:v${text.contentVersion}`), textId: text.id, contentVersion: text.contentVersion });
    },
  };
}

/** What the Stage 0 page emits for a scene (src/stage0/service.ts): lineSeen, gloss for an unknown word, completeStep. */
function stage0Emitter(engine: SimEngine, s0: Stage0ServiceImpl, stepId: string, lines: Map<string, boolean>): Emitter {
  const { userId, lang } = engine;
  return {
    async opened() { /* the Stage 0 page does not emit TextViewed */ },
    async sentence({ act, unknown }) {
      const lineId = act.sentence.key;
      lines.set(lineId, unknown.length === 0);
      await s0.lineSeen(userId, lang, stepId, lineId);
      for (const u of unknown) await s0.supportUsed(userId, lang, stepId, 'gloss', [lineId], { tokenId: u.token.id, itemId: u.token.formId });
    },
    async completed() { await s0.completeStep(userId, lang, stepId); },
  };
}

// ───────────────────────────── reading one text ─────────────────────────────

interface ReadResult {
  words: number; sentences: number; cov3: number; covRead: number; lookups: number;
  withHelp: number; withoutHelp: number; newMet: number; newKnown: number;
}

interface Tally { cumWords: number; milestones: Record<string, number | null>; learner: SimLearner; wordsPerDay: number }

/** The learner's simulated day: the words read so far at the reading pace. Called before anything is judged against the clock. */
const syncDay = (tally: Tally) => tally.learner.advanceTo(tally.cumWords / tally.wordsPerDay);

async function readAnalysed(a: Analysed, emitter: Emitter, tally: Tally): Promise<ReadResult> {
  const { learner } = tally;
  syncDay(tally);
  const cov3 = learner.coverage(a.words);
  let lookups = 0, withHelp = 0, withoutHelp = 0, newMet = 0, newKnown = 0, knownAtRead = 0, seen = 0;
  await emitter.opened();
  for (const act of a.sentences) {
    const unknown = act.acts.filter((w) => !learner.isKnown(w.lemma));
    const unknownCount = act.words.filter((w) => !learner.isKnown(w.lemma)).length;
    const n = act.words.length;
    const noHelp = n === 0 || (n - unknownCount) / n >= NO_HELP_SHARE;
    await emitter.sentence({ act, unknown });
    lookups += unknownCount;
    knownAtRead += n - unknownCount;
    if (n > 0) { if (noHelp) withoutHelp += 1; else withHelp += 1; }
    for (const w of act.words) {
      const r = learner.meet(w.lemma);
      seen += 1;
      if (r.first) newMet += 1;
      if (r.becameKnown) {
        newKnown += 1;
        for (const m of MILESTONES) if (tally.milestones[String(m)] === null && learner.known >= m) tally.milestones[String(m)] = tally.cumWords + seen;
      }
    }
  }
  await emitter.completed();
  const words = a.words.length;
  tally.cumWords += words;
  return { words, sentences: a.sentences.length, cov3, covRead: words ? knownAtRead / words : 1, lookups, withHelp, withoutHelp, newMet, newKnown };
}

// ───────────────────────────── the run ─────────────────────────────

const short = (s: string, n = 200) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const round = (x: number, d = 4) => Number(x.toFixed(d));

/** The lemma key of a profile's lemma item id ("lemma:es:comer:VERB" -> "comer"), in the learner's own spelling. */
export function lemmaKeyOfItem(itemId: string, lang: LanguageCode): string | undefined {
  const prefix = `lemma:${lang}:`;
  if (!itemId.startsWith(prefix)) return undefined;
  let rest = itemId.slice(prefix.length);
  const i = rest.lastIndexOf(':');
  if (i > 0 && /^[A-Z]+$/.test(rest.slice(i + 1))) rest = rest.slice(0, i);
  return rest.normalize('NFC').toLowerCase();
}

export async function runSimulation(engine: SimEngine, options: SimOptions): Promise<SimRun> {
  const t0 = Date.now();
  const { lang } = engine;
  const lemmas = new LemmaIndex();
  const decay = options.decay !== false;
  const wordsPerDay = options.wordsPerDay ?? SIM_WORDS_PER_DAY;
  if (!(wordsPerDay > 0)) throw new Error('wordsPerDay must be positive');
  const learner = new SimLearner({ decay });
  const fluff = new FluffTracker(lang);
  const rows: SimRow[] = [];
  const skipped: SkipRecord[] = [];
  const tally: Tally = { cumWords: 0, milestones: Object.fromEntries(MILESTONES.map((m) => [String(m), null])), learner, wordsPerDay };
  const readBefore = new Set<string>();
  let stage0Info: SimRun['stage0'];
  const timing = { recommendMs: 0, openMs: 0, stage0Ms: 0, readMs: 0 };

  const push = (r: Omit<SimRow, 'n' | 'cumWords' | 'cumKnown' | 'cumMet'>): SimRow => {
    const row: SimRow = {
      ...r, n: rows.length + 1, cumWords: tally.cumWords, cumKnown: learner.known, cumMet: learner.met,
      // forgetting: what the learner still stands on at the end of this text, and what has decayed (cumKnown stays the lifetime count)
      cumKnownNow: learner.knownNow, cumDecayed: learner.decayedNow, simDay: round(learner.today, 2),
    };
    rows.push(row);
    options.onRow?.(row);
    return row;
  };
  const statsOf = (id: string, a: Analysed) => {
    const f = fluff.analyse(id, a.paragraphs);
    return {
      dupWords: f.dupWords, ...(f.twinOf ? { twinOf: f.twinOf } : {}), ...(f.dupOf.length ? { dupOf: f.dupOf.slice(0, 5) } : {}),
      foreignWords: f.foreignWords, ...(f.foreignWords ? { foreign: f.foreign } : {}),
    };
  };
  const rowCore = (r: ReadResult) => ({
    words: r.words, sentences: r.sentences, cov3: round(r.cov3), covRead: round(r.covRead), lookups: r.lookups,
    lookupsPer100: r.words ? round((r.lookups * 100) / r.words, 2) : 0, sentencesWithHelp: r.withHelp, sentencesWithoutHelp: r.withoutHelp,
    newLemmasMet: r.newMet, newKnown: r.newKnown, yieldPer1000: r.words ? round((r.newKnown * 1000) / r.words, 3) : 0,
  });

  // ── Stage 0 ──
  const tS0 = Date.now();
  const s0 = engine.stage0;
  if (s0 && s0.available(lang)) {
    const pack = s0.pack(lang)!;
    await s0.ensureTexts(lang);
    const stage0Lemmas = new Set<number>();
    for (const step of pack.path.steps) {
      if ((step.kind === 'scene' || step.kind === 'review') && step.ref && pack.scenes.has(step.ref)) {
        const scene = pack.scenes.get(step.ref)!;
        const textId = sceneTextId(lang, scene);
        const a = await analyseStored(engine, lemmas, textId);
        for (const w of a.words) if (w.lemma >= 0) stage0Lemmas.add(w.lemma);
        const reread = readBefore.has(textId);
        const lines = new Map<string, boolean>();
        const rr = await readAnalysed(a, stage0Emitter(engine, s0, step.id, lines), tally);
        if (step.kind === 'scene') {
          // the scene's comprehension checks: right answers always (the learner is simulated, not tested); English first when a line was not all known
          for (const check of scene.checks) {
            const clear = check.lines.every((l) => lines.get(l) !== false);
            if (!clear) await s0.supportUsed(engine.userId, lang, step.id, 'english', check.lines);
            await s0.answerCheck(engine.userId, lang, step.id, check.id, check.answer, 'read', 'none');
          }
        }
        readBefore.add(textId);
        push({
          phase: 'stage0', textId, title: a.text.title, kind: 'stage0', step: step.id, scripture: false, published: a.text.published, ...rowCore(rr), reread,
          reason: 'stage0-path', explanation: `Stage 0 ${step.kind} ${step.id}`, ...statsOf(textId, a), lowYield: false,
        });
        engine.clock.jumpMinutes(2);
      } else if (step.kind === 'sounds' && step.ref && pack.sounds.has(step.ref)) {
        const snd = pack.sounds.get(step.ref)!;
        const adapter = engine.adapters.get(lang);
        let n = 0, newMet = 0, newKnown = 0;
        for (const w of snd.words) {
          for (const x of analyseSentence(adapter, w.text, lemmas)) {
            n += 1;
            if (x.lemma >= 0) stage0Lemmas.add(x.lemma);
            const r = learner.meet(x.lemma);
            if (r.first) newMet += 1;
            if (r.becameKnown) newKnown += 1;
          }
        }
        tally.cumWords += n;
        await s0.completeStep(engine.userId, lang, step.id);
        push({
          phase: 'stage0', textId: `stage0:${snd.id}`, title: snd.title.en, kind: 'stage0', step: step.id, scripture: false, published: false,
          words: n, sentences: snd.words.length, cov3: 0, covRead: 0, lookups: 0, lookupsPer100: 0, sentencesWithHelp: 0, sentencesWithoutHelp: 0,
          newLemmasMet: newMet, newKnown, yieldPer1000: n ? round((newKnown * 1000) / n, 3) : 0, reread: false, reason: 'stage0-path',
          explanation: `Stage 0 sounds step ${step.id} (its example words)`, dupWords: 0, foreignWords: 0, lowYield: false,
        });
        engine.clock.jumpMinutes(2);
      }
    }
    // the exit: the learner is simulated, so its verdict is the sim's own (>= 80 % of Stage 0's lemmas known)
    let knownLemmas = 0;
    for (const l of stage0Lemmas) if (learner.isKnown(l)) knownLemmas += 1;
    const share = stage0Lemmas.size ? knownLemmas / stage0Lemmas.size : 1;
    const verdict = share >= STAGE0_READY_SHARE ? 'ready' : 'ready-provisional';
    try {
      const started = await s0.startExit(engine.userId, lang, { microphone: false });
      const at = engine.clock.now();
      await engine.bus.emit<Stage0ExitFinished>({
        type: 'Stage0ExitFinished', userId: engine.userId, lang, surface: 'home', session: `stage0:${lang}:sim`, dedupeKey: `${started.attemptId}:finished`,
        stepId: 'exit', attemptId: started.attemptId,
        result: {
          attemptId: started.attemptId, formId: started.formId, startedAt: at, finishedAt: at, unseen: started.unseen, sections: [], verdict,
          verdictDetail: `Simulated learner: ${knownLemmas} of ${stage0Lemmas.size} Stage 0 lemmas known (${Math.round(share * 100)} %).`,
        },
      });
      stage0Info = { steps: pack.path.steps.length, lemmas: stage0Lemmas.size, knownShare: round(share), verdict };
    } catch {
      stage0Info = { steps: pack.path.steps.length, lemmas: stage0Lemmas.size, knownShare: round(share), verdict: 'not-run' };
    }
    engine.clock.jumpMinutes(decay ? Math.max(SITTING_JUMP_MINUTES, Math.round((tally.cumWords / wordsPerDay) * DAY_MINUTES)) : SITTING_JUMP_MINUTES);
  }
  timing.stage0Ms = Date.now() - tS0;

  // ── the loop ──
  let stop: { reason: StopReason; detail: string } | undefined;
  const failed = new Set<string>();
  let lastPicked: string | undefined;
  let streak = 0;
  let mainTexts = 0;
  const limit = options.limit ?? 5;

  while (!stop) {
    if (tally.cumWords >= options.maxWords) { stop = { reason: 'max-words', detail: `${tally.cumWords} words read (budget ${options.maxWords})` }; break; }
    if (mainTexts >= options.maxTexts) { stop = { reason: 'max-texts', detail: `${mainTexts} texts read after Stage 0 (budget ${options.maxTexts})` }; break; }
    if (Date.now() - t0 > options.maxMinutes * 60_000) { stop = { reason: 'max-minutes', detail: `${options.maxMinutes} minutes of wall time` }; break; }

    // a student who declines everything on the first screen scrolls further before giving up: first `limit`, then up to 50
    let recs: Recommendation[] = [];
    let chosen: { rec: Recommendation; a: Analysed } | undefined;
    for (const ask of [limit, Math.max(limit, 50)]) {
    if (chosen || (ask !== limit && ask <= recs.length)) break;
    const tRec = Date.now();
    recs = await engine.recommend({ limit: ask, includeUnpublished: options.includeUnpublished });
    timing.recommendMs += Date.now() - tRec;
    const tOpen = Date.now();
    for (const rec of recs) {
      if (!rec.textId) { skipped.push({ afterRow: rows.length, reason: rec.reason === 'rehearse-testimony' ? 'testimony' : 'note-without-text', detail: short(rec.explanation, 120) }); continue; }
      if (rec.reason === 'listen-to-read-text') { skipped.push({ afterRow: rows.length, textId: rec.textId, reason: 'listening-only' }); continue; }
      if (options.skipRereads && readBefore.has(rec.textId)) { skipped.push({ afterRow: rows.length, textId: rec.textId, reason: 'declined-reread' }); continue; }
      if (failed.has(rec.textId)) { skipped.push({ afterRow: rows.length, textId: rec.textId, reason: 'cannot-open (earlier failure)' }); continue; }
      try {
        const text = await engine.openText(rec.textId);
        if (!options.includeUnpublished && !text.published) { failed.add(rec.textId); skipped.push({ afterRow: rows.length, textId: rec.textId, reason: 'unpublished-outside-preview' }); continue; }
        const a = await analyseStored(engine, lemmas, rec.textId);
        chosen = { rec, a };
        break;
      } catch (e) {
        failed.add(rec.textId);
        skipped.push({ afterRow: rows.length, textId: rec.textId, reason: 'cannot-open', detail: short(e instanceof Error ? e.message : String(e), 160) });
      }
    }
    timing.openMs += Date.now() - tOpen;
    }
    if (!chosen) { stop = { reason: 'no-openable-recommendation', detail: recs.length ? `${recs.length} recommendation(s), none the learner may open` : 'the engine recommended nothing' }; break; }

    const { rec, a } = chosen;
    const textId = rec.textId!;
    streak = textId === lastPicked ? streak + 1 : 1;
    lastPicked = textId;
    if (streak >= 3) { stop = { reason: 'same-text-3-in-a-row', detail: `${textId} was recommended 3 times in a row` }; break; }

    // what the catalogue and the ladder say about it
    const catRow = await engine.store.catalog.get(textId);
    const unit = engine.ladder?.get(textId);
    const scripture = a.text.kind === 'scripture' || (catRow ? isScripture(catRow) : false);
    const kind: SourceKind = scripture ? 'scripture' : unit ? 'ladder' : catRow?.location === 'library' ? 'library' : 'bundled';
    const domain = unit?.domain ?? catRow?.domains?.[0] ?? catRow?.genre ?? catRow?.stream ?? a.text.kind;

    // would another recommendation have taught more? (only worth asking when this one will teach almost nothing)
    let better: SimRow['better'];
    syncDay(tally);
    const covBefore = learner.coverage(a.words);
    if (covBefore >= 0.995 && engine.profileOf) {
      for (const other of recs) {
        if (!other.textId || other.textId === textId || other.reason === 'listen-to-read-text') continue;
        const p = await engine.profileOf(other.textId).catch(() => undefined);
        if (!p || p.words <= 0) continue;
        let unknownTypes = 0, unknownTokens = 0;
        for (const [itemId, count] of p.lemmas) {
          const key = lemmaKeyOfItem(itemId, lang);
          const id = key === undefined ? undefined : lemmas.find(key);
          if (id === undefined ? true : !learner.isKnown(id)) { unknownTypes += 1; unknownTokens += count; }
        }
        const est = 1 - unknownTokens / p.words;
        if (est >= 0.9 && unknownTypes >= 10 && (!better || unknownTypes > better.unknownLemmas)) better = { textId: other.textId, estCoverage: round(est, 3), unknownLemmas: unknownTypes };
      }
    }

    const tRead = Date.now();
    const session = `sim:${rows.length + 1}`;
    const reread = readBefore.has(textId);
    const rr = await readAnalysed(a, readerEmitter(engine, a.text, session), tally);
    readBefore.add(textId);
    timing.readMs += Date.now() - tRead;
    mainTexts += 1;
    const core = rowCore(rr);
    push({
      phase: 'main', textId, title: a.text.title, kind, ...(a.text.workId ? { workId: a.text.workId } : {}), domain, scripture, published: a.text.published, ...core, reread,
      reason: rec.reason, explanation: short(rec.explanation), ...statsOf(textId, a),
      lowYield: rr.cov3 >= 0.995 && core.yieldPer1000 < 1 && rr.words >= 200 && better !== undefined, ...(better ? { better } : {}),
    });
    // with decay on, the app's own clock follows the reading pace too (so what GoLearn derives from time sees the same weeks); off: the earlier 45 minutes
    engine.clock.jumpMinutes(decay ? Math.max(SITTING_JUMP_MINUTES, Math.round((rr.words / wordsPerDay) * DAY_MINUTES)) : SITTING_JUMP_MINUTES);
  }

  return {
    lang, mode: options.includeUnpublished ? 'preview' : 'normal',
    options: { includeUnpublished: options.includeUnpublished, maxWords: options.maxWords, maxTexts: options.maxTexts, maxMinutes: options.maxMinutes, limit, ...(options.skipRereads ? { skipRereads: true } : {}), decay, wordsPerDay },
    substitutions: engine.substitutions, stop, rows, skipped, milestones: tally.milestones, ...(stage0Info ? { stage0: stage0Info } : {}), elapsedMs: Date.now() - t0, timing,
  };
}
