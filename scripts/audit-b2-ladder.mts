/// <reference types="node" />
/**
 * B2-ladder measurement probe (audit, READ-ONLY on the repository; writes only data/research/audit-b2/, which is git-ignored).
 *
 *   npx vite-node scripts/audit-b2-ladder.mts [-- es de sq th hi]
 *
 * Question: starting from zero, how far does the reading ladder of each course carry a learner in vocabulary and known-word
 * coverage? For each language it walks the texts in LEARNER ORDER and tracks, cumulatively, running words, distinct lemmas
 * and the share of every text's words whose lemma the learner has already met >= 3 times (and >= 1 time) in EARLIER texts.
 *
 * LEARNER ORDER (discovered from the code, not invented):
 *   1. Stage 0 ("Start from zero", #/start): the steps of data/stage0/<lang>/path.json in order - a scene is read as a text
 *      (src/stage0/documents.ts: sceneDocument), a sounds step contributes its example words. Review steps repeat a scene (no
 *      new text); exit forms are held-out and are not exposure. Stage 0 content is AI-drafted and never published.
 *   2. The course ladder: the stages / shelves of src/course/<course>.ts in `index` order. Inside a stage the works sort exactly as
 *      src/course/catalog.ts does (byStageThenWork): spine works first, then `work.order`, then id; inside a work the texts by
 *      chapter index (CatalogText.chapter / Document.work.chapter.index), then title, then id.
 *   3. Texts come from two places that the catalogue joins by workId: the bundled documents (data/corpus/<lang>/*.json, loaded
 *      with loadBundledCorpus) and the built library (public/library/<lang>: manifest -> index shards -> t/ documents).
 *      Bundled fixtures with no work (dialogue-01, story-01) and the bundled Bible samples (bible-*, also in the library or
 *      unverified) are left out and counted.
 *
 * ANALYSIS: the real adapter (createAdapterRegistry): adapter.tokenize on each declared sentence (raw paragraphs go through
 * adapter.segmentSentences first), adapter.analyze, FIRST candidate's lemma (lowercased); a word token with no candidate counts
 * as its normalized form. PROPN and numerals count as KNOWN and are not added to the lemma inventory. Note this is the adapter
 * alone (a rule + seed-lexicon analysis): the app's importer additionally consults the installed dictionary, so inflected forms
 * that the adapter cannot lemmatize are counted as separate "lemmas" here (this UNDER-states known coverage for es/de/sq/hi).
 * A form-level coverage (normalized surface form met >= 3 times) is reported next to it as a lemmatiser-free lower bound.
 *
 * WALKS (same order, different filters; coverage and cumulative counts are recomputed for each):
 *   all           every text in order (preview mode: unpublished drafts included)
 *   published     only texts a learner sees outside preview mode (Text.published: computePublished, row.published)
 *   all-secular   `all` without the scripture stream
 *   pub-secular   `published` without the scripture stream
 */
import fs from 'node:fs';
import path from 'node:path';
import { COURSES, createMemoryStore, ids } from '../src/core';
import type { CatalogText, LanguageCode, Work } from '../src/core';
import { createAdapterRegistry } from '../src/adapters';
import { createCourseCatalog } from '../src/course';
import { computePublished, loadBundledCorpus } from '../src/ingest';
import type { CorpusDocument } from '../src/ingest';
import { parseManifest, parseShard } from '../src/library/format';
import { bundledStage0 } from '../src/stage0/content';
import { sceneDocument } from '../src/stage0/documents';

const args = process.argv.slice(2).filter((a) => a !== '--');
const LANGS = (args.length ? args : ['es', 'de', 'sq', 'th', 'hi']) as LanguageCode[]; // nb (or nn) on request: pass it as an argument
const OUT = path.resolve('data/research/audit-b2');
fs.mkdirSync(OUT, { recursive: true });
const adapters = createAdapterRegistry();
const WARMUP_WORDS = 2000; // cliffs are looked for after this many running words (the first texts must be new by definition)
const MILESTONES = [500, 1000, 2000, 3250, 3750, 5000, 8000];

// ───────────────────────────── entries ─────────────────────────────

interface Entry {
  id: string; title: string; kind: 'stage0-scene' | 'stage0-sounds' | 'bundled' | 'library';
  stageKey: string; stageIndex: number; workId?: string; workRank: number; chapter: number;
  stream: string; scripture: boolean; published: boolean; rights: string; unpublishedReasons?: string[];
  load: () => CorpusDocument;
}

const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, 'utf8'));
const isScriptureDoc = (d: CorpusDocument): boolean => d.contentType === 'scripture';

// ───────────────────────────── analysis ─────────────────────────────

const intern = new Map<string, number>();
const idOf = (s: string): number => { let i = intern.get(s); if (i === undefined) { i = intern.size; intern.set(s, i); } return i; };

interface Stat {
  words: number; auto: number; noLemma: number;
  lemmas: Int32Array; lemmaCounts: Int32Array; // interned lemma ids and their counts (auto tokens excluded)
  forms: Int32Array; formCounts: Int32Array;   // interned normalized forms (auto tokens excluded)
}

function analyse(lang: LanguageCode, doc: CorpusDocument): Stat {
  const a = adapters.get(lang);
  const lem = new Map<number, number>();
  const frm = new Map<number, number>();
  let words = 0, auto = 0, noLemma = 0;
  const sentences: string[] = [];
  for (const sec of doc.sections) for (const p of sec.paragraphs as unknown as Array<{ sentences?: Array<{ text: string }>; text?: string }>) {
    if (Array.isArray(p.sentences)) for (const s of p.sentences) sentences.push(s.text);
    else if (typeof p.text === 'string') for (const sp of a.segmentSentences(p.text)) sentences.push(sp.text);
  }
  for (const s of sentences) {
    const toks = a.tokenize(s);
    const an = a.analyze(toks);
    for (const x of an) {
      if (!x.token.isWord) continue;
      words++;
      const c = x.candidates[0];
      const norm = x.token.normalized.toLowerCase();
      if (c?.pos === 'PROPN' || c?.pos === 'NUM' || /^\p{N}+$/u.test(norm)) { auto++; continue; }
      if (!c?.lemma) noLemma++;
      const l = idOf('l:' + (c?.lemma ?? norm).normalize('NFC').toLowerCase());
      const f = idOf('f:' + norm);
      lem.set(l, (lem.get(l) ?? 0) + 1);
      frm.set(f, (frm.get(f) ?? 0) + 1);
    }
  }
  return {
    words, auto, noLemma,
    lemmas: Int32Array.from(lem.keys()), lemmaCounts: Int32Array.from(lem.values()),
    forms: Int32Array.from(frm.keys()), formCounts: Int32Array.from(frm.values()),
  };
}

// ───────────────────────────── walking ─────────────────────────────

interface Row {
  n: number; id: string; title: string; kind: Entry['kind']; stage: string; workId?: string; stream: string; scripture: boolean; published: boolean; rights: string;
  words: number; cumWords: number; newLemmas: number; newPer100: number; cumLemmas: number; cumLemmas3: number;
  cov3: number; cov1: number; covForm3: number; autoShare: number; noLemmaShare: number;
}

const round = (x: number, d = 4) => Number(x.toFixed(d));
const quantile = (xs: number[], q: number): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q; const lo = Math.floor(pos); const hi = Math.ceil(pos);
  return round(s[lo] + (s[hi] - s[lo]) * (pos - lo));
};

/** Lemma ids of the N most frequent lemmas of a language's own corpus (a corpus-internal proxy for "core vocabulary"; no external frequency list exists in the repo). */
const CORE_SIZES = [1000, 3000, 5000];
interface Snapshot { stage: string; core: Record<string, number> }

function walk(entries: Entry[], stats: Map<string, Stat>, cores: Array<{ n: number; ids: Int32Array }>, snaps: Snapshot[]): Row[] {
  const seenL = new Int32Array(intern.size + 1);
  const seenF = new Int32Array(intern.size + 1);
  let cumWords = 0, cumLemmas = 0, cumLemmas3 = 0;
  const rows: Row[] = [];
  entries.forEach((e, n) => {
    const st = stats.get(e.id)!;
    let k3 = st.auto, k1 = st.auto, f3 = st.auto, fresh = 0;
    for (let i = 0; i < st.lemmas.length; i++) {
      const s = seenL[st.lemmas[i]];
      if (s >= 3) k3 += st.lemmaCounts[i];
      if (s >= 1) k1 += st.lemmaCounts[i]; else fresh++;
    }
    for (let i = 0; i < st.forms.length; i++) if (seenF[st.forms[i]] >= 3) f3 += st.formCounts[i];
    const w = Math.max(1, st.words);
    for (let i = 0; i < st.lemmas.length; i++) {
      const id = st.lemmas[i];
      const before = seenL[id];
      seenL[id] = before + st.lemmaCounts[i];
      if (before === 0) cumLemmas++;
      if (before < 3 && seenL[id] >= 3) cumLemmas3++;
    }
    for (let i = 0; i < st.forms.length; i++) seenF[st.forms[i]] += st.formCounts[i];
    cumWords += st.words;
    const nextStage = entries[n + 1]?.stageKey;
    if (nextStage !== e.stageKey) {
      const core: Record<string, number> = {};
      for (const c of cores) { let m = 0; for (const id of c.ids) if (seenL[id] >= 3) m++; core[String(c.n)] = m; }
      snaps.push({ stage: e.stageKey, core });
    }
    rows.push({
      n, id: e.id, title: e.title, kind: e.kind, stage: e.stageKey, workId: e.workId, stream: e.stream, scripture: e.scripture, published: e.published, rights: e.rights,
      words: st.words, cumWords, newLemmas: fresh, newPer100: round((fresh * 100) / w, 2), cumLemmas, cumLemmas3,
      cov3: round(k3 / w), cov1: round(k1 / w), covForm3: round(f3 / w), autoShare: round(st.auto / w), noLemmaShare: round(st.noLemma / w),
    });
  });
  return rows;
}

interface StageSummary {
  stage: string; texts: number; publishedTexts: number; words: number; publishedWords: number; pctWordsPublished: number | null; scriptureWords: number;
  cumWordsEnd: number; cumLemmasEnd: number; cumLemmas3End: number;
  medianCov3: number | null; p10Cov3: number | null; medianCov1: number | null; medianCovForm3: number | null; wwCov3: number | null; wwCov1: number | null; wwCovForm3: number | null;
  newPer100: number | null; pctWordsBelow90: number | null; pctWordsBelow95: number | null;
  /** how many of the corpus-internal top-N lemmas have been met >= 3 times by the end of this stage */
  coreMet3?: Record<string, number>;
}

function summarise(rows: Row[], stageOrder: string[], snaps: Snapshot[]): { stages: StageSummary[]; overall: Record<string, unknown> } {
  const stages: StageSummary[] = [];
  for (const key of stageOrder) {
    const r = rows.filter((x) => x.stage === key);
    if (!r.length) { stages.push({ stage: key, texts: 0, publishedTexts: 0, words: 0, publishedWords: 0, pctWordsPublished: null, scriptureWords: 0, cumWordsEnd: 0, cumLemmasEnd: 0, cumLemmas3End: 0, medianCov3: null, p10Cov3: null, medianCov1: null, medianCovForm3: null, wwCov3: null, wwCov1: null, wwCovForm3: null, newPer100: null, pctWordsBelow90: null, pctWordsBelow95: null }); continue; }
    const words = r.reduce((n, x) => n + x.words, 0);
    const pubWords = r.reduce((n, x) => n + (x.published ? x.words : 0), 0);
    const ww = (f: (x: Row) => number) => round(r.reduce((n, x) => n + f(x) * x.words, 0) / Math.max(1, words));
    const last = r[r.length - 1];
    stages.push({
      stage: key, texts: r.length, publishedTexts: r.filter((x) => x.published).length, words, publishedWords: pubWords, pctWordsPublished: words ? round((100 * pubWords) / words, 1) : null,
      scriptureWords: r.reduce((n, x) => n + (x.scripture ? x.words : 0), 0), cumWordsEnd: last.cumWords, cumLemmasEnd: last.cumLemmas, cumLemmas3End: last.cumLemmas3,
      medianCov3: quantile(r.map((x) => x.cov3), 0.5), p10Cov3: quantile(r.map((x) => x.cov3), 0.1), medianCov1: quantile(r.map((x) => x.cov1), 0.5), medianCovForm3: quantile(r.map((x) => x.covForm3), 0.5),
      wwCov3: ww((x) => x.cov3), wwCov1: ww((x) => x.cov1), wwCovForm3: ww((x) => x.covForm3),
      newPer100: round((r.reduce((n, x) => n + x.newLemmas, 0) * 100) / Math.max(1, words), 2),
      pctWordsBelow90: round((100 * r.filter((x) => x.cov3 < 0.9).reduce((n, x) => n + x.words, 0)) / Math.max(1, words), 1),
      pctWordsBelow95: round((100 * r.filter((x) => x.cov3 < 0.95).reduce((n, x) => n + x.words, 0)) / Math.max(1, words), 1),
      coreMet3: snaps.find((x) => x.stage === key)?.core,
    });
  }
  const after = rows.filter((x) => x.cumWords - x.words >= WARMUP_WORDS);
  const firstBelow = (t: number) => { const r = rows.find((x) => x.cov3 < t); return r ? { n: r.n, id: r.id, stage: r.stage, cumWordsBefore: r.cumWords - r.words, cov3: r.cov3 } : null; };
  const firstBelowAfter = (t: number) => { const r = after.find((x) => x.cov3 < t); return r ? { n: r.n, id: r.id, stage: r.stage, cumWordsBefore: r.cumWords - r.words, cov3: r.cov3 } : null; };
  const milestones: Record<string, { cumWords: number; stage: string; text: string } | null> = {};
  const milestones3: Record<string, { cumWords: number; stage: string; text: string } | null> = {};
  for (const m of MILESTONES) {
    const a = rows.find((x) => x.cumLemmas >= m); milestones[String(m)] = a ? { cumWords: a.cumWords, stage: a.stage, text: a.id } : null;
    const b = rows.find((x) => x.cumLemmas3 >= m); milestones3[String(m)] = b ? { cumWords: b.cumWords, stage: b.stage, text: b.id } : null;
  }
  const big = stages.filter((s) => s.words >= 5000 && s.wwCov3 !== null);
  const lastAtLeast = (t: number) => { const s = [...big].reverse().find((x) => (x.wwCov3 ?? 0) >= t); return s ? { stage: s.stage, cumWordsEnd: s.cumWordsEnd, cumLemmas3End: s.cumLemmas3End } : null; };
  const firstStageBelow = (t: number) => { const s = big.find((x, i) => i > 0 && (x.wwCov3 ?? 1) < t); return s ? { stage: s.stage, wwCov3: s.wwCov3, cumWordsBefore: s.cumWordsEnd - s.words } : null; };
  // coverage by running-words bucket (where in the volume of reading the learner is)
  const EDGES = [0, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000, 2000000, Infinity];
  const curve = [];
  for (let b = 0; b < EDGES.length - 1; b++) {
    const r = rows.filter((x) => x.cumWords - x.words >= EDGES[b] && x.cumWords - x.words < EDGES[b + 1]);
    if (!r.length) continue;
    const w = r.reduce((n, x) => n + x.words, 0);
    curve.push({ fromWords: EDGES[b], toWords: EDGES[b + 1] === Infinity ? null : EDGES[b + 1], texts: r.length, words: w, wwCov3: round(r.reduce((n, x) => n + x.cov3 * x.words, 0) / Math.max(1, w)),
      wwCov1: round(r.reduce((n, x) => n + x.cov1 * x.words, 0) / Math.max(1, w)), pctWordsBelow90: round((100 * r.filter((x) => x.cov3 < 0.9).reduce((n, x) => n + x.words, 0)) / Math.max(1, w), 1),
      stages: [...new Set(r.map((x) => x.stage))].join(',') });
  }
  // trailing window of ~5,000 running words: the first window at >= 90 / 95 %, and the point after which no window falls below it again
  const WINDOW = 5000, MINWIN = 2500;
  const win: Array<{ i: number; cov: number }> = [];
  { let j = 0, sumW = 0, sumK = 0;
    rows.forEach((x, i) => {
      sumW += x.words; sumK += x.cov3 * x.words;
      while (j < i && sumW - rows[j].words >= WINDOW) { sumW -= rows[j].words; sumK -= rows[j].cov3 * rows[j].words; j++; }
      if (sumW >= MINWIN) win.push({ i, cov: sumK / sumW });
    }); }
  const at = (i: number) => ({ n: rows[i].n, text: rows[i].id, stage: rows[i].stage, cumWords: rows[i].cumWords, cumLemmas: rows[i].cumLemmas, cumLemmas3: rows[i].cumLemmas3 });
  const firstReach = (t: number) => { const w = win.find((x) => x.cov >= t); return w ? at(w.i) : null; };
  const sustainedFrom = (t: number) => { let lastBad = -1; win.forEach((x, k) => { if (x.cov < t) lastBad = k; }); if (lastBad === win.length - 1) return null; const w = win[lastBad + 1]; return w ? at(w.i) : null; };
  const lowWindows = (t: number) => win.length ? round((100 * win.filter((x) => x.cov < t).length) / win.length, 1) : null;
  const last = rows[rows.length - 1];
  const afterRows = after.length ? after : [];
  return {
    stages,
    overall: {
      texts: rows.length, words: last?.cumWords ?? 0, distinctLemmas: last?.cumLemmas ?? 0, lemmasMet3x: last?.cumLemmas3 ?? 0,
      publishedTexts: rows.filter((x) => x.published).length, publishedWords: rows.reduce((n, x) => n + (x.published ? x.words : 0), 0),
      wwCov3: round(rows.reduce((n, x) => n + x.cov3 * x.words, 0) / Math.max(1, last?.cumWords ?? 1)),
      afterWarmup: {
        texts: afterRows.length, words: afterRows.reduce((n, x) => n + x.words, 0),
        medianCov3: quantile(afterRows.map((x) => x.cov3), 0.5), p10Cov3: quantile(afterRows.map((x) => x.cov3), 0.1),
        textsBelow90: afterRows.filter((x) => x.cov3 < 0.9).length, textsBelow95: afterRows.filter((x) => x.cov3 < 0.95).length,
        pctTextsBelow90: afterRows.length ? round((100 * afterRows.filter((x) => x.cov3 < 0.9).length) / afterRows.length, 1) : null,
        pctTextsBelow95: afterRows.length ? round((100 * afterRows.filter((x) => x.cov3 < 0.95).length) / afterRows.length, 1) : null,
      },
      firstTextBelow90Anywhere: firstBelow(0.9), firstTextBelow90AfterWarmup: firstBelowAfter(0.9), firstTextBelow95AfterWarmup: firstBelowAfter(0.95),
      trailing5kWindow: { windows: win.length, pctWindowsBelow90: lowWindows(0.9), pctWindowsBelow95: lowWindows(0.95), firstReach90: firstReach(0.9), firstReach95: firstReach(0.95), sustained90From: sustainedFrom(0.9), sustained95From: sustainedFrom(0.95) },
      curve,
      milestonesDistinctLemmas: milestones, milestonesLemmasMet3x: milestones3,
      lastStageWithWwCov3AtLeast90: lastAtLeast(0.9), lastStageWithWwCov3AtLeast95: lastAtLeast(0.95), firstBigStageBelow90: firstStageBelow(0.9), firstBigStageBelow95: firstStageBelow(0.95),
    },
  };
}

// ───────────────────────────── per language ─────────────────────────────

const t00 = performance.now();
const allSummaries: Record<string, unknown> = {};
for (const lang of LANGS) {
  const t0 = performance.now();
  const course = COURSES.find((c) => c.lang === lang)!;
  const store = createMemoryStore();
  const cat = createCourseCatalog({ store });
  await cat.install(course.id);
  const stages = await cat.stages(course.id);
  const works = await cat.works(course.id); // already in catalogue order: stage index, spine first, work.order, id
  const workRank = new Map<string, number>(works.map((w, i) => [w.id, i]));
  const workById = new Map<string, Work>(works.map((w) => [w.id, w]));
  const stageIdx = new Map(stages.map((s) => [s.id, s.index]));
  const stageKeyOf = (id: string) => stages.find((s) => s.id === id)?.key ?? '?';
  const stageOrder = ['stage0', ...stages.map((s) => s.key), 'unplaced'];

  const entries: Entry[] = [];
  const excluded: Record<string, number> = { 'bundled fixture without a work (dialogue-01 / story-01)': 0, 'bundled Bible sample (bible-*)': 0, 'library row not in the catalogue (no work / unknown work)': 0 };

  // 1. Stage 0
  const pack = bundledStage0().packs.get(lang);
  const world = bundledStage0().world;
  if (pack) {
    for (const step of pack.path.steps) {
      if (step.kind === 'scene' && step.ref && pack.scenes.has(step.ref)) {
        const scene = pack.scenes.get(step.ref)!;
        const doc = sceneDocument(scene, world);
        entries.push({ id: `stage0:${scene.id}`, title: scene.title.en, kind: 'stage0-scene', stageKey: 'stage0', stageIndex: -1, workRank: -1, chapter: entries.length, stream: 'stage0', scripture: false,
          published: computePublished(doc).published, rights: 'owner-authored', unpublishedReasons: computePublished(doc).unpublishedReasons, load: () => doc });
      } else if (step.kind === 'sounds' && step.ref && pack.sounds.has(step.ref)) {
        const snd = pack.sounds.get(step.ref)!;
        const words = (snd as unknown as { words?: Array<{ text: string; en?: string }> }).words ?? [];
        const doc = { sections: [{ paragraphs: [{ sentences: words.map((w) => ({ text: w.text })) }] }] } as unknown as CorpusDocument;
        entries.push({ id: `stage0:${snd.id}`, title: snd.title.en, kind: 'stage0-sounds', stageKey: 'stage0', stageIndex: -1, workRank: -1, chapter: entries.length, stream: 'stage0', scripture: false,
          published: false, rights: 'owner-authored', unpublishedReasons: ['Stage 0 sound-step word list: AI-drafted, unreviewed; shown only inside Stage 0'], load: () => doc });
      }
    }
  }

  // 2. bundled documents
  for (const d of loadBundledCorpus().filter((x) => x.lang === lang)) {
    const wslug = d.work?.slug;
    if (d.id.startsWith('bible-')) { excluded['bundled Bible sample (bible-*)']++; continue; }
    if (!wslug) { excluded['bundled fixture without a work (dialogue-01 / story-01)']++; continue; }
    const workId = ids.work(course.id, wslug);
    const w = workById.get(workId);
    const dec = computePublished(d);
    entries.push({ id: ids.text(lang, d.id), title: d.title, kind: 'bundled', stageKey: w ? stageKeyOf(w.stageId) : 'unplaced', stageIndex: w ? (stageIdx.get(w.stageId) ?? 1e6) : 1e6,
      workId, workRank: w ? (workRank.get(workId) ?? 1e9) : 1e9, chapter: d.work?.chapter?.index ?? Number.POSITIVE_INFINITY,
      stream: ((d as unknown as { streams?: string[] }).streams ?? ['library'])[0] ?? 'library', scripture: isScriptureDoc(d), published: dec.published, rights: d.source?.rights ?? 'unknown', unpublishedReasons: dec.unpublishedReasons, load: () => d });
  }

  // 3. built library
  const root = path.resolve('public/library', lang);
  const manifest = parseManifest(readJson(path.join(root, 'manifest.json')), lang)!;
  const rows: CatalogText[] = manifest.shards.flatMap((s) => parseShard(readJson(path.join(root, s.file)), lang));
  let publishedMismatch = 0;
  for (const r of rows) {
    const w = r.workId ? workById.get(r.workId) : undefined;
    if (!w) { excluded['library row not in the catalogue (no work / unknown work)']++; continue; }
    entries.push({ id: r.id, title: r.title, kind: 'library', stageKey: stageKeyOf(w.stageId), stageIndex: stageIdx.get(w.stageId) ?? 1e6, workId: r.workId, workRank: workRank.get(r.workId!) ?? 1e9,
      chapter: r.chapter ?? Number.POSITIVE_INFINITY, stream: r.stream, scripture: r.stream === 'scripture' || (r.streams ?? []).includes('scripture'), published: r.published, rights: r.rights,
      load: () => readJson(path.join(root, r.documentPath!)) as CorpusDocument });
  }

  // order: stage0 first (path order), then stage index, then catalogue work rank, then chapter, title, id
  entries.sort((a, b) => {
    if ((a.stageIndex === -1) !== (b.stageIndex === -1)) return a.stageIndex === -1 ? -1 : 1;
    if (a.stageIndex === -1) return a.chapter - b.chapter;
    return a.stageIndex - b.stageIndex || a.workRank - b.workRank
      || (a.chapter === b.chapter ? 0 : a.chapter < b.chapter ? -1 : 1) || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0) || (a.id < b.id ? -1 : 1);
  });

  // analyse every entry once
  const stats = new Map<string, Stat>();
  for (const e of entries) {
    const doc = e.load();
    if (e.kind === 'library') { const dec = computePublished(doc); if (dec.published !== e.published) publishedMismatch++; if (!e.published && !e.unpublishedReasons) e.unpublishedReasons = dec.unpublishedReasons; }
    stats.set(e.id, analyse(lang, doc));
  }
  const lemmaAvailable = [...stats.values()].reduce((n, s) => n + s.words, 0);

  const defs: Array<[string, (e: Entry) => boolean]> = [
    ['all', () => true],
    ['published', (e) => e.published],
    ['all-secular', (e) => !e.scripture],
    ['pub-secular', (e) => e.published && !e.scripture],
  ];
  // corpus-internal core vocabulary: the most frequent lemmas over the non-scripture texts (all texts when the language has < 150k secular words)
  const freqOf = (pick: (e: Entry) => boolean) => {
    const f = new Map<number, number>();
    for (const e of entries) if (pick(e)) { const st = stats.get(e.id)!; for (let i = 0; i < st.lemmas.length; i++) f.set(st.lemmas[i], (f.get(st.lemmas[i]) ?? 0) + st.lemmaCounts[i]); }
    return f;
  };
  const secularWords = entries.filter((e) => !e.scripture).reduce((n, e) => n + stats.get(e.id)!.words, 0);
  const coreBasis = secularWords >= 150000 ? 'top-N lemmas of the non-scripture texts (corpus-internal proxy)' : 'not computed (secular corpus < 150k words)';
  const freq = freqOf(secularWords >= 150000 ? (e) => !e.scripture : () => true);
  const ranked = [...freq].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  // a corpus-internal ranking is meaningless for a small secular corpus (it would only echo what was read): core figures are produced only when there are >= 150k secular words
  const cores = (secularWords >= 150000 ? CORE_SIZES : []).filter((n) => n <= ranked.length).map((n) => ({ n, ids: Int32Array.from(ranked.slice(0, n)) }));
  const walks: Record<string, { summary: ReturnType<typeof summarise>; rows: Row[] }> = {};
  for (const [name, f] of defs) {
    const snaps: Snapshot[] = [];
    const r = walk(entries.filter(f), stats, cores, snaps);
    walks[name] = { summary: summarise(r, stageOrder.filter((s) => r.some((x) => x.stage === s)), snaps), rows: r };
  }

  // composition by stage (what exists, whatever the filter)
  const unplacedCount = entries.filter((e) => e.stageKey === 'unplaced').length;
  const reasons = new Map<string, number>();
  for (const e of entries) if (!e.published) for (const x of e.unpublishedReasons ?? ['(reason not captured)']) { const k = x.slice(0, 110); reasons.set(k, (reasons.get(k) ?? 0) + 1); }
  const out = {
    lang, course: course.id, builtAt: manifest.builtAt, generatedAt: new Date().toISOString(),
    order: 'Stage 0 path (data/stage0/<lang>/path.json) -> catalogue stages by index -> works by byStageThenWork (spine, order, id) -> chapter index; bundled + library joined by workId',
    coreVocabularyBasis: coreBasis, coreSizes: cores.map((c) => c.n),
    entries: entries.length, totalWordsAdapterTokens: lemmaAvailable, excluded, unplacedCount, publishedRowMismatchVsComputePublished: publishedMismatch,
    lemmaResolution: { wordsTotal: lemmaAvailable, noLemmaShare: round([...stats.values()].reduce((n, s) => n + s.noLemma, 0) / Math.max(1, lemmaAvailable)), autoShare: round([...stats.values()].reduce((n, s) => n + s.auto, 0) / Math.max(1, lemmaAvailable)) },
    unpublishedTexts: entries.filter((e) => !e.published).map((e) => ({ id: e.id, stage: e.stageKey, kind: e.kind, words: stats.get(e.id)!.words, reason: (e.unpublishedReasons ?? [])[0]?.slice(0, 140) })),
    unpublishedReasonsTop: [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => ({ reason: k, texts: v })),
    walks: Object.fromEntries(Object.entries(walks).map(([k, v]) => [k, { summary: v.summary, rows: v.rows }])),
  };
  fs.writeFileSync(path.join(OUT, `${lang}.json`), JSON.stringify(out));
  allSummaries[lang] = { lang, entries: entries.length, excluded, unplacedCount, publishedMismatch, lemmaResolution: out.lemmaResolution, unpublishedReasonsTop: out.unpublishedReasonsTop, walks: Object.fromEntries(Object.entries(walks).map(([k, v]) => [k, v.summary])) };
  console.log(`${lang}: ${entries.length} texts, ${lemmaAvailable} words, ${((performance.now() - t0) / 1000).toFixed(1)}s; publishedMismatch=${publishedMismatch}; unplaced=${unplacedCount}`);
  intern.clear(); // ids are per language
}
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(allSummaries, null, 1));

// markdown summary tables
const pct = (x: number | null) => (x === null ? '-' : (x * 100).toFixed(1));
let md = '# B2 ladder measurement (generated by scripts/audit-b2-ladder.mts)\n\nCoverage = share of a text\'s words whose lemma was met >= 3 times in earlier texts (PROPN and numerals count as known). cumL = distinct lemmas met so far; cumL3 = lemmas met >= 3 times.\n';
for (const [lang, s] of Object.entries(allSummaries) as Array<[string, any]>) {
  for (const w of ['all', 'published', 'all-secular', 'pub-secular']) {
    const sum = s.walks[w];
    md += `\n## ${lang} - walk "${w}" (${sum.overall.texts} texts, ${sum.overall.words} words, ${sum.overall.distinctLemmas} lemmas, ${sum.overall.lemmasMet3x} met 3x, ${sum.overall.publishedTexts} published texts)\n\n`;
    const o = sum.overall;
    md += `Trailing 5k-word window: first >=90% at ${o.trailing5kWindow.firstReach90 ? o.trailing5kWindow.firstReach90.cumWords + ' words (' + o.trailing5kWindow.firstReach90.stage + ')' : 'never'}; first >=95% at ${o.trailing5kWindow.firstReach95 ? o.trailing5kWindow.firstReach95.cumWords + ' words (' + o.trailing5kWindow.firstReach95.stage + ')' : 'never'}; windows below 90%: ${o.trailing5kWindow.pctWindowsBelow90}%.\n\n`;
    md += 'Coverage by running-words bucket (ww cov3 / % words in texts < 90%): ' + o.curve.map((c: any) => c.fromWords + '+: ' + (c.wwCov3 * 100).toFixed(1) + '/' + c.pctWordsBelow90).join('; ') + '\n\n';
    md += '| stage | texts | words | %pub words | cumWords | cumL | cumL3 | med cov3 | p10 cov3 | ww cov3 | ww cov1 | ww form3 | new/100w | %words<90 |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
    for (const st of sum.stages as any[]) md += `| ${st.stage} | ${st.texts} | ${st.words} | ${st.pctWordsPublished ?? '-'} | ${st.cumWordsEnd} | ${st.cumLemmasEnd} | ${st.cumLemmas3End} | ${pct(st.medianCov3)} | ${pct(st.p10Cov3)} | ${pct(st.wwCov3)} | ${pct(st.wwCov1)} | ${pct(st.wwCovForm3)} | ${st.newPer100 ?? '-'} | ${st.pctWordsBelow90 ?? '-'} |\n`;
  }
}
fs.writeFileSync(path.join(OUT, 'summary.md'), md);
console.log(`done in ${((performance.now() - t00) / 1000).toFixed(0)}s -> ${OUT}`);
