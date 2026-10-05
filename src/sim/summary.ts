/** Summary and fluff figures of one run, and the Markdown report of several. Pure functions over `SimRun`. */
import { MILESTONES } from './types';
import type { SimRow, SimRun } from './types';

const round = (x: number, d = 4) => Number(x.toFixed(d));
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)} %`;
const int = (x: number) => Math.round(x).toLocaleString('en-US');

export const WINDOW_WORDS = 5000;
export const WINDOW_MIN_WORDS = 2500;
/** A text has to be at least this long to enter the lowest-yield ranking (a 40-word text proves nothing). */
export const MIN_RANK_WORDS = 300;

export interface WindowPoint { n: number; textId: string; cumWords: number; cumKnown: number }

/** First point at which the trailing ~5,000-word window of texts reaches the coverage (the probe's rule, over cov3). */
export function firstWindowReaching(rows: readonly SimRow[], threshold: number): WindowPoint | null {
  let j = 0, sumW = 0, sumK = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    sumW += r.words; sumK += r.cov3 * r.words;
    while (j < i && sumW - rows[j]!.words >= WINDOW_WORDS) { sumW -= rows[j]!.words; sumK -= rows[j]!.cov3 * rows[j]!.words; j++; }
    if (sumW >= WINDOW_MIN_WORDS && sumK / sumW >= threshold) return { n: r.n, textId: r.textId, cumWords: r.cumWords, cumKnown: r.cumKnown };
  }
  return null;
}

export interface LowYieldText { n: number; textId: string; title: string; kind: string; words: number; newKnown: number; newLemmasMet: number; yieldPer1000: number; cov3: number; lowYield: boolean; reread: boolean }
export interface WorkCost { work: string; kind: string; texts: number; words: number; newKnown: number; wordsPerNewKnown: number | null }

export interface RunSummary {
  lang: string;
  mode: string;
  stop: SimRun['stop'];
  elapsedSec: number;
  texts: number;
  textsAfterStage0: number;
  words: number;
  wordsAfterStage0: number;
  knownLemmas: number;
  metLemmas: number;
  /** cumulative words when known lemmas first reached N (null: never) */
  milestones: Record<string, number | null>;
  firstWindow95: WindowPoint | null;
  firstWindow90: WindowPoint | null;
  /** share of words read in texts whose pre-reading coverage was below 90 % / 80 % (all rows; and after Stage 0 only) */
  assisted: { lt90: number; lt80: number; lt90AfterStage0: number; lt80AfterStage0: number };
  scriptureShare: number;
  distinctWorks: number;
  meanLookupsPer100: number;
  wordsBySource: Record<string, number>;
  fluff: {
    wordsPerNewKnownLemma: number | null;
    rereads: { texts: number; words: number };
    duplicates: { texts: number; words: number; identicalTexts: number; examples: Array<{ textId: string; twinOf?: string; dupWords: number; words: number }> };
    foreign: { words: number; share: number; byLanguage: Record<string, number>; examples: Array<{ textId: string; title: string; foreignWords: number; words: number; foreign: Record<string, number> }> };
    ladderNoNewLemma: { units: number; words: number; withoutKnownGain: number };
    lowYield: { flaggedTexts: number; flaggedWords: number };
    top20: LowYieldText[];
    top20Words: number;
    worstWorks: WorkCost[];
  };
}

export function summarise(run: SimRun): RunSummary {
  const rows = run.rows;
  const main = rows.filter((r) => r.phase === 'main');
  const words = rows.reduce((n, r) => n + r.words, 0);
  const wordsMain = main.reduce((n, r) => n + r.words, 0);
  const last = rows[rows.length - 1];
  const share = (pick: (r: SimRow) => boolean, of: readonly SimRow[], total: number) => (total ? of.filter(pick).reduce((n, r) => n + r.words, 0) / total : 0);
  const bySource: Record<string, number> = {};
  for (const r of rows) bySource[r.kind] = (bySource[r.kind] ?? 0) + r.words;
  const works = new Set(main.map((r) => r.workId ?? r.textId));

  // ── fluff ──
  const reread = main.filter((r) => r.reread); // Stage 0's review steps repeat a scene by design: not counted
  const dupTexts = rows.filter((r) => r.words > 0 && (r.twinOf !== undefined || r.dupWords / r.words >= 0.5));
  const foreignWords = rows.reduce((n, r) => n + r.foreignWords, 0);
  const byLang: Record<string, number> = {};
  for (const r of rows) for (const [l, n] of Object.entries(r.foreign ?? {})) byLang[l] = (byLang[l] ?? 0) + n;
  const ladder = rows.filter((r) => r.kind === 'ladder');
  const noNew = ladder.filter((r) => r.newLemmasMet === 0);
  const noGain = ladder.filter((r) => r.newKnown === 0);
  const ranked = main.filter((r) => r.words >= MIN_RANK_WORDS)
    .sort((a, b) => a.yieldPer1000 - b.yieldPer1000 || b.words - a.words || a.n - b.n)
    .slice(0, 20)
    .map((r): LowYieldText => ({ n: r.n, textId: r.textId, title: r.title, kind: r.kind, words: r.words, newKnown: r.newKnown, newLemmasMet: r.newLemmasMet, yieldPer1000: r.yieldPer1000, cov3: r.cov3, lowYield: r.lowYield, reread: r.reread }));
  const perWork = new Map<string, WorkCost>();
  for (const r of main) {
    const key = r.workId ?? r.textId;
    let w = perWork.get(key);
    if (!w) perWork.set(key, (w = { work: key, kind: r.kind, texts: 0, words: 0, newKnown: 0, wordsPerNewKnown: null }));
    w.texts += 1; w.words += r.words; w.newKnown += r.newKnown;
  }
  for (const w of perWork.values()) w.wordsPerNewKnown = w.newKnown ? round(w.words / w.newKnown, 1) : null;
  const worstWorks = [...perWork.values()].filter((w) => w.words >= 5000)
    .sort((a, b) => (b.wordsPerNewKnown ?? Number.MAX_SAFE_INTEGER) - (a.wordsPerNewKnown ?? Number.MAX_SAFE_INTEGER) || b.words - a.words).slice(0, 10);

  return {
    lang: run.lang, mode: run.mode, stop: run.stop, elapsedSec: round(run.elapsedMs / 1000, 1),
    texts: rows.length, textsAfterStage0: main.length, words, wordsAfterStage0: wordsMain,
    knownLemmas: last?.cumKnown ?? 0, metLemmas: last?.cumMet ?? 0, milestones: run.milestones,
    firstWindow95: firstWindowReaching(rows, 0.95), firstWindow90: firstWindowReaching(rows, 0.9),
    assisted: {
      lt90: round(share((r) => r.cov3 < 0.9, rows, words)), lt80: round(share((r) => r.cov3 < 0.8, rows, words)),
      lt90AfterStage0: round(share((r) => r.cov3 < 0.9, main, wordsMain)), lt80AfterStage0: round(share((r) => r.cov3 < 0.8, main, wordsMain)),
    },
    scriptureShare: words ? round(rows.filter((r) => r.scripture).reduce((n, r) => n + r.words, 0) / words) : 0,
    distinctWorks: works.size,
    meanLookupsPer100: words ? round(rows.reduce((n, r) => n + r.lookups, 0) * 100 / words, 2) : 0,
    wordsBySource: bySource,
    fluff: {
      wordsPerNewKnownLemma: last && last.cumKnown ? round(words / last.cumKnown, 1) : null,
      rereads: { texts: reread.length, words: reread.reduce((n, r) => n + r.words, 0) },
      duplicates: {
        texts: dupTexts.length, words: dupTexts.reduce((n, r) => n + r.words, 0), identicalTexts: rows.filter((r) => r.twinOf !== undefined).length,
        examples: dupTexts.slice(0, 10).map((r) => ({ textId: r.textId, ...(r.twinOf ? { twinOf: r.twinOf } : {}), dupWords: r.dupWords, words: r.words })),
      },
      foreign: {
        words: foreignWords, share: words ? round(foreignWords / words) : 0, byLanguage: byLang,
        examples: rows.filter((r) => r.foreignWords > 0).sort((a, b) => b.foreignWords - a.foreignWords).slice(0, 10)
          .map((r) => ({ textId: r.textId, title: r.title, foreignWords: r.foreignWords, words: r.words, foreign: r.foreign ?? {} })),
      },
      ladderNoNewLemma: { units: noNew.length, words: noNew.reduce((n, r) => n + r.words, 0), withoutKnownGain: noGain.length },
      lowYield: { flaggedTexts: rows.filter((r) => r.lowYield).length, flaggedWords: rows.filter((r) => r.lowYield).reduce((n, r) => n + r.words, 0) },
      top20: ranked, top20Words: ranked.reduce((n, r) => n + r.words, 0), worstWorks,
    },
  };
}

// ───────────────────────────── Markdown ─────────────────────────────

const cell = (s: string) => s.replace(/\|/g, '/').replace(/\s+/g, ' ');
const at = (p: WindowPoint | null) => (p ? `${int(p.cumWords)} words (${int(p.cumKnown)} lemmas known)` : 'never');
const ms = (v: number | null | undefined) => (v === null || v === undefined ? 'not reached' : int(v));

export function renderReport(runs: ReadonlyArray<{ run: SimRun; summary: RunSummary }>, generatedAt: string): string {
  let md = '# Simulated learner (generated by scripts/simulate-learner.mts)\n\n';
  md += `Generated ${generatedAt}. A deterministic learner (known = a lemma met >= 3 times; proper nouns and numerals known) asks the app's real engine what to read next, `
    + 'reads it as the reader does, and the events are folded by the real GoLearn. READING only; it does not say whether a person reaches B2. '
    + '"normal" = what the app opens outside preview (published); "preview" = as if every draft had been reviewed and recorded.\n\n';

  md += '## All runs\n\n| lang | mode | stop | texts | words | known lemmas | words at 1,000 / 2,000 / 3,250 / 5,000 / 8,000 known | 5k window >= 95 % at | assisted < 90 % / < 80 % | Scripture | works | words per known lemma |\n|---|---|---|---:|---:|---:|---|---|---|---:|---:|---:|\n';
  for (const { run, summary: s } of runs) {
    md += `| ${run.lang} | ${run.mode} | ${s.stop.reason} | ${int(s.texts)} | ${int(s.words)} | ${int(s.knownLemmas)} | ${MILESTONES.map((m) => ms(s.milestones[String(m)])).join(' / ')} | ${s.firstWindow95 ? int(s.firstWindow95.cumWords) : 'never'} | ${pct(s.assisted.lt90)} / ${pct(s.assisted.lt80)} | ${pct(s.scriptureShare)} | ${s.distinctWorks} | ${s.fluff.wordsPerNewKnownLemma ?? '-'} |\n`;
  }

  for (const { run, summary: s } of runs) {
    md += `\n## ${run.lang} - ${run.mode}\n\n`;
    md += `Stopped: **${s.stop.reason}** (${s.stop.detail}). ${int(s.texts)} texts (${int(s.textsAfterStage0)} after Stage 0), ${int(s.words)} words, in ${s.elapsedSec} s.\n\n`;
    md += '| measure | value |\n|---|---|\n';
    md += `| known lemmas / lemmas met | ${int(s.knownLemmas)} / ${int(s.metLemmas)} |\n`;
    for (const m of MILESTONES) md += `| cumulative words at ${int(m)} known lemmas | ${ms(s.milestones[String(m)])} |\n`;
    md += `| first trailing 5,000-word window >= 95 % coverage | ${at(s.firstWindow95)} |\n`;
    md += `| first trailing 5,000-word window >= 90 % coverage | ${at(s.firstWindow90)} |\n`;
    md += `| words read at < 90 % / < 80 % coverage (all rows) | ${pct(s.assisted.lt90)} / ${pct(s.assisted.lt80)} |\n`;
    md += `| the same, after Stage 0 only | ${pct(s.assisted.lt90AfterStage0)} / ${pct(s.assisted.lt80AfterStage0)} |\n`;
    md += `| Scripture share of words | ${pct(s.scriptureShare)} |\n`;
    md += `| distinct works (after Stage 0) | ${s.distinctWorks} |\n`;
    md += `| lookups per 100 words (mean) | ${s.meanLookupsPer100} |\n`;
    md += `| words by source | ${Object.entries(s.wordsBySource).map(([k, v]) => `${k} ${int(v)}`).join(', ')} |\n`;
    if (run.stage0) md += `| Stage 0 | ${run.stage0.steps} steps, ${run.stage0.lemmas} lemmas, ${pct(run.stage0.knownShare)} known at the exit, verdict ${run.stage0.verdict} |\n`;
    const f = s.fluff;
    md += `| words read per known lemma (overall) | ${f.wordsPerNewKnownLemma ?? '-'} |\n`;
    md += `| rereads | ${f.rereads.texts} texts, ${int(f.rereads.words)} words |\n`;
    md += `| duplicated texts (identical, or >= 50 % of paragraphs read before under another id) | ${f.duplicates.texts} texts (${f.duplicates.identicalTexts} identical), ${int(f.duplicates.words)} words |\n`;
    md += `| passages not in the target language | ${int(f.foreign.words)} words (${pct(f.foreign.share, 2)}) ${Object.entries(f.foreign.byLanguage).map(([k, v]) => `${k} ${int(v)}`).join(', ')} |\n`;
    md += `| ladder units that added no new lemma | ${f.ladderNoNewLemma.units} units, ${int(f.ladderNoNewLemma.words)} words (${f.ladderNoNewLemma.withoutKnownGain} taught no known lemma) |\n`;
    md += `| low-yield texts (cov >= 99.5 %, < 1 known lemma per 1,000 words, a better alternative was recommended) | ${f.lowYield.flaggedTexts} texts, ${int(f.lowYield.flaggedWords)} words |\n`;
    if (run.skipped.length) {
      const by = new Map<string, number>();
      for (const k of run.skipped) by.set(k.reason, (by.get(k.reason) ?? 0) + 1);
      md += `| recommendations skipped | ${[...by].map(([k, v]) => `${k} x${v}`).join(', ')} |\n`;
    }

    md += `\nThe 20 lowest-yield texts (known lemmas gained per 1,000 words, texts of >= ${MIN_RANK_WORDS} words); together they cost **${int(f.top20Words)}** words.\n\n`;
    md += '| # | text | source | words | cov before | new known | per 1,000 w | flags |\n|---:|---|---|---:|---:|---:|---:|---|\n';
    for (const t of f.top20) md += `| ${t.n} | ${cell(t.title)} (${cell(t.textId)}) | ${t.kind} | ${int(t.words)} | ${pct(t.cov3)} | ${t.newKnown} | ${t.yieldPer1000} | ${[t.lowYield ? 'low-yield' : '', t.reread ? 'reread' : ''].filter(Boolean).join(', ')} |\n`;
    if (f.worstWorks.length) {
      md += '\nWorks that cost the most words per known lemma gained (works of >= 5,000 words):\n\n| work | source | texts | words | new known | words per known lemma |\n|---|---|---:|---:|---:|---:|\n';
      for (const w of f.worstWorks) md += `| ${cell(w.work)} | ${w.kind} | ${w.texts} | ${int(w.words)} | ${w.newKnown} | ${w.wordsPerNewKnown ?? 'none gained'} |\n`;
    }
    if (f.duplicates.examples.length) {
      md += '\nDuplicates:\n\n| text | identical to | duplicated words | words |\n|---|---|---:|---:|\n';
      for (const d of f.duplicates.examples) md += `| ${cell(d.textId)} | ${d.twinOf ? cell(d.twinOf) : '-'} | ${int(d.dupWords)} | ${int(d.words)} |\n`;
    }
    if (f.foreign.examples.length) {
      md += '\nNot in the target language:\n\n| text | foreign words | words | language(s) |\n|---|---:|---:|---|\n';
      for (const d of f.foreign.examples) md += `| ${cell(d.title)} (${cell(d.textId)}) | ${int(d.foreignWords)} | ${int(d.words)} | ${Object.keys(d.foreign).join(', ')} |\n`;
    }
    md += `\nSubstitutions in this run: ${run.substitutions.join(' ')}\n`;
  }
  return md;
}
