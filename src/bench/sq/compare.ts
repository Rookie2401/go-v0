/**
 * Compare an Albanian adapter with a Universal Dependencies treebank. Pure: sentences in, numbers out. The script
 * (`scripts/sq-eval-ud.mts`) does the reading and the printing; `report.ts` formats a result.
 *
 * The adapter is any `LanguageAdapter` (here: only what is used is required), so the comparison does not depend on
 * which Albanian engine is installed.
 *
 * What the numbers mean (each is a count `n` of `of`, never a bare percentage):
 *
 *   TOKENS    The adapter tokenizes `sentence.text`. Both sides keep only CONTENT tokens: a token with a letter in it
 *             that is not tagged PUNCT. Punctuation and numerals are excluded on both sides (the adapter's tokenizer
 *             does not call a numeral a word). A treebank token counts as matched when the adapter has a word token
 *             with exactly the same start and end offsets.
 *             sentencesExact    sentences whose two token sets are equal
 *             precision         matched / adapter word tokens      recall   matched / treebank content tokens
 *   MULTIWORD For every treebank multiword token (ta = të + e, t'i, s'ka ...), out of ALL of them:
 *             oneToken     the adapter has one token with the same offsets
 *             partsFirst   ... and its FIRST reading carries `parts` with as many parts as the treebank has words
 *             partsAny     ... or ANY reading does
 *             lemmasFirst  ... and the parts' lemmas equal the treebank words' lemmas (both normalized by the adapter)
 *             lemmasAny    the same for any reading with the right number of parts
 *             so oneToken >= partsFirst >= lemmasFirst, and nothing is hidden by a smaller denominator.
 *   WORDS     Only where the boundaries agree. A multiword token is compared through its FIRST component word; the
 *             multiword tokens are reported on their own, above. Each measure is given for the FIRST reading and for
 *             ANY reading:
 *             pos       strict: equal UPOS (the adapter's CONJ is read as CCONJ). lenient: also counts AUX/VERB and
 *                       CCONJ/CONJ/SCONJ as agreeing (the treebank and the adapter draw those lines differently);
 *                       the confusion table lists every disagreement and says which pairs are the tolerated ones.
 *             lemma     equal after `adapter.normalize`. This is "lemma equal", NOT "lemma correct": a treebank's
 *                       lemma conventions (and STAF's lemmas are automatic) may differ from the adapter's, so the
 *                       most frequent differing pairs are listed for a person to read.
 *             features  for each of Case, Number, Gender, Definite, Person, Tense, Mood, Voice, VerbForm, PronType,
 *                       Poss, Degree: among the words where the treebank states the feature and the adapter states it
 *                       (first reading; or at least one reading), the share where the value lists INTERSECT. The
 *                       adapter writes an undecided feature as a comma union ("Gen,Dat,Abl"), so a union that contains
 *                       the treebank's value does not contradict it. An absent feature is not counted.
 *   COVERAGE  Over the adapter's word tokens: with no reading, with only `unconfirmed` readings, with a confident
 *             (not unconfirmed) reading.
 *
 * SPLIT. Sentences are split dev / test by FNV-1a of `sent_id` (even = dev). `dev` may be looked at and tuned on;
 * `test` is reported as it comes: its examples are refused (`show` > 0 throws), and so are the tables that print
 * words from it (the lemma disagreements, the multiword forms), which are withheld from the result. The part-of-speech
 * confusion table is kept: it names categories, not words.
 *
 * A treebank is not ground truth (see the script's header): these numbers say how far the adapter and a treebank
 * agree, and where, not how correct the adapter is.
 */
import type { AnalysisCandidate, AnalyzedToken, LanguageAdapter, RawToken } from '../../core';
import type { UdSentence, UdToken } from './conllu';

export type ComparableAdapter = Pick<LanguageAdapter, 'lang' | 'name' | 'version' | 'tokenize' | 'analyze' | 'normalize'>;

export type Split = 'dev' | 'test';

export const COMPARED_FEATURES = ['Case', 'Number', 'Gender', 'Definite', 'Person', 'Tense', 'Mood', 'Voice', 'VerbForm', 'PronType', 'Poss', 'Degree'] as const;

export interface Rate { n: number; of: number }
export const newRate = (): Rate => ({ n: 0, of: 0 });
export const pct = (r: Rate): string => (r.of === 0 ? 'n/a' : `${((100 * r.n) / r.of).toFixed(1)}%`);
const tally = (r: Rate, hit: boolean): void => { r.of++; if (hit) r.n++; };

export interface PosConfusion { gold: string; adapter: string; count: number; kind: 'tolerated' | 'error' }
export interface Disagreement { gold: string; adapter: string; count: number }
export interface MultiwordRow {
  /** The form as written in the treebank (first spelling met). */
  form: string;
  count: number;
  oneToken: number;
  partsFirst: number;
  lemmasFirst: number;
  /** What the adapter said, most common first: "parts të/të + e/e", "tokens: t | ' | i", "no reading" ... with counts. */
  said: Array<{ what: string; count: number }>;
}
export interface Example { kind: 'tokens' | 'multiword' | 'pos' | 'lemma' | 'feature' | 'coverage'; sentId: string; text: string; detail: string }

export interface CompareOptions {
  split: Split;
  /** Number of examples to collect per kind (dev only; throws for the test split). */
  show?: number;
  /** Name of the treebank, carried into the result. */
  name?: string;
}

export interface CompareResult {
  name?: string;
  split: Split;
  adapter: { lang: string; name: string; version: string };
  sentencesTotal: number;
  sentences: number;
  tokens: {
    sentencesExact: Rate;
    treebankTokens: number;
    adapterTokens: number;
    matched: number;
    precision: Rate;
    recall: Rate;
    /** Harmonic mean of precision and recall; 0 when either has no denominator. */
    f1: number;
  };
  multiword: {
    total: number;
    oneToken: Rate;
    partsFirst: Rate;
    partsAny: Rate;
    lemmasFirst: Rate;
    lemmasAny: Rate;
    table: MultiwordRow[];
  };
  words: {
    aligned: number;
    alignedMultiword: number;
    pos: { first: Rate; any: Rate; firstLenient: Rate; anyLenient: Rate; confusion: PosConfusion[] };
    lemma: { first: Rate; any: Rate; disagreements: Disagreement[] };
    features: Record<string, { first: Rate; any: Rate }>;
  };
  coverage: { words: number; none: number; onlyUnconfirmed: number; confident: number };
  /** True for the test split: the tables that would print its words are empty by design. */
  tablesWithheld: boolean;
  examples: Example[];
}

// ───────────────────────────── helpers ─────────────────────────────

/** FNV-1a, 32 bit. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** The split a sentence belongs to: even hash = dev. Stable for a given `sent_id`. */
export const splitOf = (sentId: string): Split => (fnv1a(sentId) % 2 === 0 ? 'dev' : 'test');

const HAS_LETTER = /\p{L}/u;

/** A treebank token the comparison looks at: a letter in it, and not a lone PUNCT word. */
export const isContentToken = (t: UdToken): boolean =>
  HAS_LETTER.test(t.form) && !(t.words.length === 1 && t.words[0].upos === 'PUNCT');

const isAdapterWord = (t: RawToken): boolean => t.isWord && HAS_LETTER.test(t.surface);

/** The adapter's part-of-speech tags are UD names already, except the older CONJ (and CLF, which UD has no tag for). */
export function toUpos(pos: string | undefined): string | undefined {
  if (pos === undefined) return undefined;
  if (pos === 'CONJ') return 'CCONJ';
  if (pos === 'CLF') return 'X';
  return pos;
}

const TOLERATED_GROUPS: string[][] = [['AUX', 'VERB'], ['CCONJ', 'SCONJ', 'CONJ']];
const tolerated = (a: string, b: string): boolean => a !== b && TOLERATED_GROUPS.some((g) => g.includes(a) && g.includes(b));

const values = (v: string | undefined): string[] | undefined => (v === undefined || v === '' ? undefined : v.split(',').map((x) => x.trim()));
const intersects = (a: string[], b: string[]): boolean => a.some((x) => b.includes(x));

const bump = <K>(m: Map<K, number>, k: K): void => { m.set(k, (m.get(k) ?? 0) + 1); };

const spanKey = (start: number, end: number): string => `${start}-${end}`;

function saidOf(tok: UdToken, raw: RawToken[], analyzed: AnalyzedToken[], aligned: number | undefined): string {
  if (aligned === undefined) {
    const over = raw.filter((r) => r.start < tok.end && r.end > tok.start);
    return over.length ? `tokens: ${over.map((r) => r.surface).join(' | ')}` : 'no adapter token';
  }
  const first = analyzed[aligned]?.candidates[0];
  if (!first) return 'no reading';
  if (first.parts?.length) return `parts ${first.parts.map((p) => `${p.text}/${p.lemma ?? '?'}`).join(' + ')}`;
  return `one word, no parts (lemma ${first.lemma ?? '?'})`;
}

// ───────────────────────────── the comparison ─────────────────────────────

export function compareWithTreebank(sentences: readonly UdSentence[], adapter: ComparableAdapter, opts: CompareOptions): CompareResult {
  const show = opts.show ?? 0;
  if (show > 0 && opts.split === 'test') {
    throw new Error('examples are refused for the held-out test split: its failures are not to be looked at');
  }
  const norm = (s: string): string => adapter.normalize(s);

  const mine = sentences.filter((s) => splitOf(s.id) === opts.split);

  const tokens = { sentencesExact: newRate(), treebankTokens: 0, adapterTokens: 0, matched: 0 };
  const mw = { total: 0, oneToken: newRate(), partsFirst: newRate(), partsAny: newRate(), lemmasFirst: newRate(), lemmasAny: newRate() };
  const mwRows = new Map<string, { form: string; count: number; oneToken: number; partsFirst: number; lemmasFirst: number; said: Map<string, number> }>();
  const pos = { first: newRate(), any: newRate(), firstLenient: newRate(), anyLenient: newRate() };
  const confusion = new Map<string, number>();
  const lemma = { first: newRate(), any: newRate() };
  const lemmaPairs = new Map<string, number>();
  const features: Record<string, { first: Rate; any: Rate }> = {};
  for (const f of COMPARED_FEATURES) features[f] = { first: newRate(), any: newRate() };
  const coverage = { words: 0, none: 0, onlyUnconfirmed: 0, confident: 0 };
  let aligned = 0;
  let alignedMultiword = 0;
  const examples: Example[] = [];
  const perKind = new Map<string, number>();
  const note = (kind: Example['kind'], s: UdSentence, detail: string): void => {
    if (show <= 0 || (perKind.get(kind) ?? 0) >= show) return;
    bump(perKind, kind);
    examples.push({ kind, sentId: s.id, text: s.text, detail });
  };

  for (const s of mine) {
    const raw = adapter.tokenize(s.text);
    const analyzed = adapter.analyze(raw);
    const adIndex = new Map<string, number>();
    raw.forEach((t, i) => { if (isAdapterWord(t)) adIndex.set(spanKey(t.start, t.end), i); });

    // coverage over the adapter's own word tokens
    for (const i of adIndex.values()) {
      const cands = analyzed[i]?.candidates ?? [];
      coverage.words++;
      if (cands.length === 0) coverage.none++;
      else if (cands.every((c) => c.unconfirmed)) coverage.onlyUnconfirmed++;
      else coverage.confident++;
      if (cands.length === 0) note('coverage', s, `no reading for "${raw[i].surface}"`);
    }

    // tokens
    const gold = s.tokens.filter(isContentToken);
    let matched = 0;
    for (const t of gold) if (adIndex.has(spanKey(t.start, t.end))) matched++;
    tokens.treebankTokens += gold.length;
    tokens.adapterTokens += adIndex.size;
    tokens.matched += matched;
    const exact = matched === gold.length && gold.length === adIndex.size;
    tally(tokens.sentencesExact, exact);
    if (!exact) {
      note('tokens', s, `treebank: ${gold.map((t) => t.form).join(' | ')}  adapter: ${[...adIndex.values()].map((i) => raw[i].surface).join(' | ')}`);
    }

    // multiword tokens, then words
    for (const t of gold) {
      const ai = adIndex.get(spanKey(t.start, t.end));
      const cands: AnalysisCandidate[] = ai === undefined ? [] : analyzed[ai]?.candidates ?? [];

      if (t.multiword) {
        mw.total++;
        const goldLemmas = t.words.map((w) => (w.lemma === undefined ? undefined : norm(w.lemma)));
        const rightParts = (c: AnalysisCandidate): boolean => c.parts?.length === t.words.length;
        const lemmasOk = (c: AnalysisCandidate): boolean =>
          rightParts(c) && c.parts!.every((p, k) => goldLemmas[k] !== undefined && p.lemma !== undefined && norm(p.lemma) === goldLemmas[k]);
        const one = ai !== undefined;
        const pf = one && cands.length > 0 && rightParts(cands[0]);
        const pa = one && cands.some(rightParts);
        const lf = one && cands.length > 0 && lemmasOk(cands[0]);
        const la = one && cands.some(lemmasOk);
        tally(mw.oneToken, one); tally(mw.partsFirst, pf); tally(mw.partsAny, pa); tally(mw.lemmasFirst, lf); tally(mw.lemmasAny, la);

        const key = norm(t.form);
        const row = mwRows.get(key) ?? { form: t.form, count: 0, oneToken: 0, partsFirst: 0, lemmasFirst: 0, said: new Map<string, number>() };
        row.count++; if (one) row.oneToken++; if (pf) row.partsFirst++; if (lf) row.lemmasFirst++;
        bump(row.said, saidOf(t, raw, analyzed, ai));
        mwRows.set(key, row);
        if (!lf) note('multiword', s, `${t.form} = ${t.words.map((w) => `${w.form}/${w.lemma ?? '_'}`).join(' + ')}  adapter: ${saidOf(t, raw, analyzed, ai)}`);
      }

      if (ai === undefined) continue;
      aligned++;
      if (t.multiword) alignedMultiword++;
      const w = t.words[0];
      const c0 = cands[0];

      // part of speech
      if (w.upos !== undefined) {
        const g = w.upos;
        const a0 = toUpos(c0?.pos);
        const strictFirst = a0 === g;
        const lenientFirst = strictFirst || (a0 !== undefined && tolerated(g, a0));
        const strictAny = cands.some((c) => toUpos(c.pos) === g);
        const lenientAny = strictAny || cands.some((c) => { const a = toUpos(c.pos); return a !== undefined && tolerated(g, a); });
        tally(pos.first, strictFirst); tally(pos.firstLenient, lenientFirst);
        tally(pos.any, strictAny); tally(pos.anyLenient, lenientAny);
        if (!strictFirst) {
          bump(confusion, `${g}\u0000${a0 ?? '(none)'}`);
          if (!lenientFirst) note('pos', s, `${t.form}: treebank ${g}, adapter ${a0 ?? '(no reading)'}`);
        }
      }

      // lemma
      if (w.lemma !== undefined) {
        const g = norm(w.lemma);
        const eqFirst = c0?.lemma !== undefined && norm(c0.lemma) === g;
        const eqAny = cands.some((c) => c.lemma !== undefined && norm(c.lemma) === g);
        tally(lemma.first, eqFirst); tally(lemma.any, eqAny);
        if (!eqFirst && c0?.lemma !== undefined) {
          bump(lemmaPairs, `${g}\u0000${norm(c0.lemma)}`);
          note('lemma', s, `${t.form}: treebank lemma ${g}, adapter lemma ${norm(c0.lemma)}`);
        }
      }

      // features
      for (const f of COMPARED_FEATURES) {
        const gv = values(w.feats[f]);
        if (!gv) continue;
        const av0 = values(c0?.morph[f]);
        if (av0) {
          const ok = intersects(gv, av0);
          tally(features[f].first, ok);
          if (!ok) note('feature', s, `${t.form}: ${f} treebank ${gv.join(',')}, adapter ${av0.join(',')}`);
        }
        const stated = cands.map((c) => values(c.morph[f])).filter((v): v is string[] => v !== undefined);
        if (stated.length) tally(features[f].any, stated.some((v) => intersects(gv, v)));
      }
    }
  }

  const withheld = opts.split === 'test';
  const top = <T extends { count: number }>(rows: T[]): T[] => rows.sort((a, b) => b.count - a.count);

  const precision: Rate = { n: tokens.matched, of: tokens.adapterTokens };
  const recall: Rate = { n: tokens.matched, of: tokens.treebankTokens };
  const p = precision.of ? precision.n / precision.of : 0;
  const r = recall.of ? recall.n / recall.of : 0;

  return {
    name: opts.name,
    split: opts.split,
    adapter: { lang: adapter.lang, name: adapter.name, version: adapter.version },
    sentencesTotal: sentences.length,
    sentences: mine.length,
    tokens: {
      sentencesExact: tokens.sentencesExact,
      treebankTokens: tokens.treebankTokens,
      adapterTokens: tokens.adapterTokens,
      matched: tokens.matched,
      precision, recall,
      f1: p + r === 0 ? 0 : (2 * p * r) / (p + r),
    },
    multiword: {
      ...mw,
      table: withheld ? [] : top([...mwRows.values()].map((row) => ({
        form: row.form, count: row.count, oneToken: row.oneToken, partsFirst: row.partsFirst, lemmasFirst: row.lemmasFirst,
        said: top([...row.said].map(([what, count]) => ({ what, count }))),
      }))),
    },
    words: {
      aligned, alignedMultiword,
      pos: {
        ...pos,
        confusion: top([...confusion].map(([k, count]): PosConfusion => {
          const [gold, ad] = k.split('\u0000');
          return { gold, adapter: ad, count, kind: tolerated(gold, ad) ? 'tolerated' : 'error' };
        })),
      },
      lemma: {
        ...lemma,
        disagreements: withheld ? [] : top([...lemmaPairs].map(([k, count]): Disagreement => {
          const [gold, ad] = k.split('\u0000');
          return { gold, adapter: ad, count };
        })),
      },
      features,
    },
    coverage,
    tablesWithheld: withheld,
    examples,
  };
}
