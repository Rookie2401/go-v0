/**
 * Stage readiness — advice from several signals about whether the learner looks ready to move past a reading stage.
 * Never a lock, a badge or a score. Finishing every text of a stage is NOT a signal and never changes the verdict (the
 * reader's `TextCompleted` is not read here at all). Every threshold lives in policy.ts (`READINESS`, provisional).
 *
 * The stage's texts are the imported texts of the works listed at it (`Text.workId`). Signals:
 *   lexical-coverage        shown-known + likely-familiar share of ALL the stage's imported texts (needs at least one sentence seen)
 *   lookup-rate             lookups per 100 words over the last 300 sentences seen in the stage's texts
 *   sentence-rescue-rate    sentence explanations / English shown per 100 sentences, same window
 *   reported-comprehension  share of the learner's latest text-level report per stage text that says 'all' or 'most' (≥ 3 texts)
 *   reading-pace-trend      not slower (readingPace trend over the stage's texts)
 *   unfamiliar-material     predicted coverage of texts the learner has not opened: of the NEXT stage (90 %), else of this stage (95 %)
 *   retention               of word forms first met ≥ 7 days ago and met again in the last 7 days, the share whose latest recent
 *                           meeting needed no item-targeted help (≥ 30 forms; across all the learner's reading in the language; read from the words' aggregates, so the cost is his vocabulary, not his history)
 *   decoding                pre-reader stage only: DecodingRevealed per 100 words in the window, and no romanization rescue in the last 100 sentences
 *   listening               not available unless reviewed real speech evidence exists for the stage's texts
 *
 * Verdict: `insufficient-data` with fewer than 150 sentences seen in the stage or fewer than four signals with data;
 * `ready-to-advance` when every signal with data is met and lexical-coverage plus lookup-rate or sentence-rescue-rate have data;
 * otherwise `stay`. "Now" for retention is the injected clock, so the same state and clock give the same answer.
 */
import type { LanguageCode, ReadinessSignal, ReadinessSignalKey, Stage, StageReadiness, Text } from '../core';
import { stageMetaId } from '../course/catalog';
import { readingSummary } from './agg';
import type { StoredItem } from './agg';
import type { ReadingUnit } from './activity';
import { readingUnits, stageTextIds } from './activity';
import { analyzeText } from './coverage';
import { paceOf } from './pace';
import { READINESS } from './policy';
import { readingProgressMany } from './progress';
import type { Ctx, StoredEncounter } from './state';
import { cmp, pct1, plural, round1 } from './util';

const NAME: Record<ReadinessSignalKey, string> = {
  'lexical-coverage': 'how much of the stage you already know',
  'lookup-rate': 'how often you look words up',
  'sentence-rescue-rate': 'how often you need a sentence explained',
  'reported-comprehension': 'how much you say you understood',
  'reading-pace-trend': 'your reading pace',
  'unfamiliar-material': 'how new material would read',
  retention: 'how well words come back after a week',
  decoding: 'reading the script without help',
  listening: 'listening to real speech',
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const per100 = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);

/** The stage's texts, in a stable order. */
async function textsOfStage(ctx: Ctx, stageId: string): Promise<Text[]> {
  const ids = [...(await stageTextIds(ctx, stageId))].sort(cmp);
  return (await ctx.store.texts.getMany(ids)).filter((t): t is Text => !!t);
}

/** Token-weighted known + likely-familiar share over several texts (undefined when they hold no words). */
async function weightedCoverage(ctx: Ctx, userId: string, textIds: string[], sentenceIdsOf?: Map<string, string[]>) {
  let tokens = 0;
  let covered = 0;
  for (const id of textIds) {
    const c = (await analyzeText(ctx, userId, id, sentenceIdsOf?.get(id))).coverage;
    tokens += c.wordTokens;
    covered += (c.knownLexicalCoverage + c.estimatedFamiliarCoverage) * c.wordTokens;
  }
  return tokens > 0 ? { value: Math.min(1, covered / tokens), tokens } : undefined;
}

const sig = (key: ReadinessSignalKey, status: ReadinessSignal['status'], target: string, explanation: string, value?: number): ReadinessSignal =>
  ({ key, ...(value !== undefined ? { value } : {}), target, status, explanation });

export async function stageReadiness(ctx: Ctx, userId: string, courseId: string, stageId?: string): Promise<StageReadiness> {
  const stages = (await ctx.store.stages.where('courseId', courseId)).sort((a, b) => a.index - b.index);
  let stage: Stage | undefined;
  if (stageId) stage = stages.find((s) => s.id === stageId);
  else {
    const stored = await ctx.store.meta.get(stageMetaId(userId, courseId));
    stage = stages.find((s) => s.id === stored?.value) ?? stages[0];
  }
  if (!stage) {
    return {
      userId, courseId, stageId: stageId ?? '', signals: [], verdict: 'insufficient-data',
      explanation: stageId ? 'Go does not know this reading stage.' : 'This course has no reading stages, so there is nothing to say about moving on.',
    };
  }
  const next = stages[stages.indexOf(stage) + 1];
  const lang: LanguageCode = stage.lang;
  const R = READINESS;

  const texts = await textsOfStage(ctx, stage.id);
  const textIds = texts.map((t) => t.id);
  const progress = textIds.length > 0 ? await readingProgressMany(ctx, userId, textIds) : new Map();
  const seenSentences = sum(textIds.map((id) => progress.get(id)?.sentencesSeen ?? 0));

  const allUnits = await readingUnits(ctx, userId, { lang, textIds: new Set(textIds) });
  const window: ReadingUnit[] = allUnits.slice(-R.windowSentences);
  const windowWords = sum(window.map((u) => u.words));
  const windowOk = window.length >= R.minWindowSentences && windowWords > 0;
  const tooLittle = `Not enough reading in this stage yet (${plural(window.length, 'sentence')} seen; at least ${R.minWindowSentences} are needed).`;

  const signals: ReadinessSignal[] = [];

  // ── lexical-coverage ──
  {
    const target = `at least ${Math.round(R.lexicalCoverage * 100)} % of the words in this stage's texts shown or likely familiar`;
    const cov = seenSentences > 0 ? await weightedCoverage(ctx, userId, textIds) : undefined;
    if (!cov) signals.push(sig('lexical-coverage', 'insufficient-data', target, textIds.length === 0 ? 'No texts of this stage are imported yet.' : 'You have not read any of this stage yet.'));
    else {
      const met = cov.value >= R.lexicalCoverage;
      signals.push(sig('lexical-coverage', met ? 'met' : 'not-met', target,
        `${pct1(cov.value)} % of the ${plural(cov.tokens, 'word')} in this stage's texts are shown understood or likely familiar (an estimate).`, cov.value));
    }
  }

  // ── lookup-rate and sentence-rescue-rate ──
  {
    const target = `at most ${R.lookupsPer100Words} lookups per 100 words`;
    if (!windowOk) signals.push(sig('lookup-rate', 'insufficient-data', target, tooLittle));
    else {
      const v = round1(per100(sum(window.map((u) => u.lookups)), windowWords));
      signals.push(sig('lookup-rate', v <= R.lookupsPer100Words ? 'met' : 'not-met', target,
        `${v} lookups per 100 words over your last ${plural(window.length, 'sentence')} in this stage.`, v));
    }
  }
  {
    const target = `at most ${R.rescuesPer100Sentences} per 100 sentences`;
    if (!windowOk) signals.push(sig('sentence-rescue-rate', 'insufficient-data', target, tooLittle));
    else {
      const v = round1(per100(window.filter((u) => u.rescued).length, window.length));
      signals.push(sig('sentence-rescue-rate', v <= R.rescuesPer100Sentences ? 'met' : 'not-met', target,
        `A whole sentence was explained or shown in English ${v} times per 100 sentences over your last ${plural(window.length, 'sentence')}.`, v));
    }
  }

  // ── reported-comprehension: the latest text-level report of each stage text's current version ──
  {
    const { share, minReports } = R.reportedComprehension;
    const target = `at least ${Math.round(share * 100)} % of your reports are "all" or "most" (from ${minReports} or more texts)`;
    // The latest whole-text report of each text's CURRENT version (progress.ts applies the version rule); a report about
    // earlier wording is history and is left out, and the explanation says so.
    const degrees: string[] = [];
    let leftOut = 0;
    for (const id of textIds) {
      const p = progress.get(id);
      if (p?.reportedComprehension) degrees.push(p.reportedComprehension);
      else if (p?.reportedEarlierVersion) leftOut += 1;
    }
    const note = leftOut > 0 ? ` ${plural(leftOut, 'report')} about an earlier version of a text ${leftOut === 1 ? 'was' : 'were'} left out.` : '';
    if (degrees.length < minReports) {
      signals.push(sig('reported-comprehension', 'insufficient-data', target, `You have said how much you understood of ${plural(degrees.length, 'text')} in this stage; ${minReports} are needed.${note}`));
    } else {
      const v = degrees.filter((d) => d === 'all' || d === 'most').length / degrees.length;
      signals.push(sig('reported-comprehension', v >= share ? 'met' : 'not-met', target,
        `You said you understood all or most of ${degrees.filter((d) => d === 'all' || d === 'most').length} of ${plural(degrees.length, 'text')} (${pct1(v)} %).${note}`, v));
    }
  }

  // ── reading-pace-trend ──
  {
    const target = 'your pace is not getting slower';
    const pace = paceOf(allUnits);
    if (pace.trend === 'insufficient-data') signals.push(sig('reading-pace-trend', 'insufficient-data', target, 'Not enough timed reading in separate sittings to compare your pace.'));
    else {
      signals.push(sig('reading-pace-trend', pace.trend === 'slower' ? 'not-met' : 'met', target,
        pace.trend === 'slower' ? 'Your last sittings were slower than the ones before. That can mean harder material or a tired day.'
          : pace.trend === 'faster' ? 'Your last sittings were faster than the ones before.' : 'Your pace is about the same as in the sittings before.'));
    }
  }

  // ── unfamiliar-material ──
  {
    const opened = new Set<string>();
    for (const e of await ctx.store.events.where('type', 'TextViewed')) if (e.type === 'TextViewed' && e.userId === userId && e.mode !== 'preview') opened.add(e.textId);
    const unopened = (ts: Text[], seen: (id: string) => number) => ts.filter((t) => !opened.has(t.id) && seen(t.id) === 0);
    const nextTexts = next ? await textsOfStage(ctx, next.id) : [];
    const nextProgress = nextTexts.length > 0 ? await readingProgressMany(ctx, userId, nextTexts.map((t) => t.id)) : new Map();
    const fromNext = unopened(nextTexts, (id) => nextProgress.get(id)?.sentencesSeen ?? 0);
    const fromHere = unopened(texts, (id) => progress.get(id)?.sentencesSeen ?? 0);
    const useNext = fromNext.length > 0;
    const pool = useNext ? fromNext : fromHere;
    const need = useNext ? R.unfamiliarNextStage : R.unfamiliarSameStage;
    const cov = pool.length > 0 ? await weightedCoverage(ctx, userId, pool.map((t) => t.id)) : undefined;
    const target = `at least ${Math.round(need * 100)} % predicted coverage on ${useNext ? 'imported texts of the next stage' : 'texts of this stage'} you have not opened`;
    if (!cov) signals.push(sig('unfamiliar-material', 'not-available', target, 'There are no imported texts you have not opened yet, so there is nothing to forecast.'));
    else {
      signals.push(sig('unfamiliar-material', cov.value >= need ? 'met' : 'not-met', target,
        `Predicted coverage is ${pct1(cov.value)} % on ${plural(pool.length, 'unopened text')} of ${useNext ? 'the next stage' : 'this stage'} (an estimate).`, cov.value));
    }
  }

  // ── retention ──
  {
    const { days, share, minItems } = R.retention;
    const target = `at least ${Math.round(share * 100)} % of words you meet again after a week need no help (from ${minItems} or more words)`;
    const nowMs = Date.parse(ctx.clock());
    const cutoff = new Date(nowMs - days * 86_400_000).toISOString();
    // From the word rows' aggregates (agg.ts): first and last reading meeting and whether the last one needed help.
    // The cost is the learner's vocabulary, not the number of times he has read it.
    let eligible = 0;
    let clean = 0;
    for (const row of await ctx.store.learnerItems.where('userId', userId)) {
      if (row.lang !== lang || row.itemKind !== 'form') continue;
      const r = readingSummary((row as StoredItem).agg);
      if (r.n === 0 || r.firstAt! > cutoff) continue; // never read, or first met less than a week ago
      if (r.lastAt! < cutoff) continue; // not met again this week
      eligible += 1;
      if (!r.lastHelped) clean += 1;
    }
    if (Number.isNaN(nowMs) || eligible < minItems) {
      signals.push(sig('retention', 'insufficient-data', target, `${plural(eligible, 'word')} first met over a week ago ${eligible === 1 ? 'was' : 'were'} met again this week; ${minItems} are needed.`));
    } else {
      const v = clean / eligible;
      signals.push(sig('retention', v >= share ? 'met' : 'not-met', target, `${clean} of ${plural(eligible, 'word')} met again this week after a week or more needed no help (${pct1(v)} %).`, v));
    }
  }

  // ── decoding (the pre-reader stage only) ──
  if (stage.kind === 'pre-reader') {
    const { revealedPer100Words, romanizationRescues, romanizationWindow } = R.decoding;
    const target = `at most ${revealedPer100Words} decodings opened per 100 words, and no romanization in your last ${romanizationWindow} sentences`;
    if (!windowOk) signals.push(sig('decoding', 'insufficient-data', target, tooLittle));
    else {
      const v = round1(per100(sum(window.map((u) => u.decodings)), windowWords));
      const rescues = sum(window.slice(-romanizationWindow).map((u) => u.romanized));
      const met = v <= revealedPer100Words && rescues <= romanizationRescues;
      signals.push(sig('decoding', met ? 'met' : 'not-met', target,
        `You opened the decoding of a word ${v} times per 100 words and used romanization ${plural(rescues, 'time')} in your last ${plural(Math.min(window.length, romanizationWindow), 'sentence')}.`, v));
    }
  }

  // ── listening: only reviewed real speech ever creates listening encounters. Omitted entirely when listening is not part of this version. ──
  if (ctx.listening) {
    const { minSentences, coverage } = R.listening;
    const target = `at least ${Math.round(coverage * 100)} % of the words in the sentences you have heard are understood by ear`;
    const heard = new Map<string, Set<string>>();
    for (const id of textIds) {
      for (const e of (await ctx.store.encounters.where('textId', id)) as StoredEncounter[]) {
        if (e.userId !== userId || e.modality !== 'listening') continue;
        let s = heard.get(id);
        if (!s) heard.set(id, (s = new Set()));
        s.add(e.sentenceId);
      }
    }
    const count = sum([...heard.values()].map((s) => s.size));
    if (count === 0) signals.push(sig('listening', 'not-available', target, 'There is no reviewed real speech for this stage yet.'));
    else if (count < minSentences) signals.push(sig('listening', 'insufficient-data', target, `You have heard ${plural(count, 'sentence')} of real speech in this stage; ${minSentences} are needed.`));
    else {
      let tokens = 0;
      let known = 0;
      for (const [id, s] of heard) {
        const c = (await analyzeText(ctx, userId, id, [...s])).coverage;
        tokens += c.wordTokens;
        known += (c.listeningCoverage ?? 0) * c.wordTokens;
      }
      const v = tokens > 0 ? known / tokens : 0;
      signals.push(sig('listening', v >= coverage ? 'met' : 'not-met', target, `${pct1(v)} % of the words in the ${plural(count, 'sentence')} you have heard are understood by ear (an estimate).`, v));
    }
  }

  // ── verdict ──
  const withData = signals.filter((s) => s.status === 'met' || s.status === 'not-met');
  const has = (k: ReadinessSignalKey) => withData.some((s) => s.key === k);
  const unmet = withData.filter((s) => s.status === 'not-met');
  let verdict: StageReadiness['verdict'];
  let explanation: string;
  if (seenSentences < R.minSentencesSeen || withData.length < R.minSignalsWithData) {
    verdict = 'insufficient-data';
    explanation = `Too early to say. You have seen ${plural(seenSentences, 'sentence')} of ${stage.label} (Go looks at about ${R.minSentencesSeen}) `
      + `and ${withData.length} of ${signals.length} measures have enough reading behind them (it needs ${R.minSignalsWithData}). Keep reading; nothing is asked of you.`;
  } else if (unmet.length === 0 && has('lexical-coverage') && (has('lookup-rate') || has('sentence-rescue-rate'))) {
    verdict = 'ready-to-advance';
    explanation = `On what you have read, you look ready to move past ${stage.label}: every measure that has data is met. This is advice. You can stay as long as you like.`;
  } else {
    verdict = 'stay';
    explanation = unmet.length > 0
      ? `Stay with ${stage.label} a while longer. Not yet: ${unmet.map((s) => NAME[s.key]).join('; ')}. Finishing the books does not change this; reading more does.`
      : `Stay with ${stage.label} a while longer: the measures that would say you are ready (how much you know and how often you need help) do not have enough reading behind them yet.`;
  }
  return { userId, courseId, stageId: stage.id, signals, verdict, explanation };
}
