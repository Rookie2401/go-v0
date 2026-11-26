/// <reference types="node" />
/**
 * npm run ko:deck-audit [-- --write] [-- --limit N]: the DECK AUDIT of the Korean review gate (docs/korean/DECK-AUDIT.md).
 *
 * It builds the decks the way GoReview would, from ordinary Korean, and checks EVERY card that would be admitted:
 *   path   a sentence → the page scan's own naming of its words (`wordsOfText`: the same function GoLearn Active and Reading Analysis call) → the unit a
 *          word credits (a lemma id, or only its form id when the gate holds the reading back) → the pack facts GoReview builds a card from
 *          (`createFactsProvider`, the provider packFactsFor makes for the pack) → admitted when the facts are not invalidated / conflicted /
 *          requires-review (recoveredCandidates.ts:135) and have an English meaning (the recognition card is built from it).
 *   WITHOUT the gate and WITH it are two runs of the same path over the same analyser (the gate's marks stripped, or applied).
 *   judged against the treebank's gold (scripts/ko-eval.mts `deriveGold`: the primary headword and its LENIENT alternatives) for the development
 *   sentences, and against the sweep's own wanted headwords (test/adapters/korean/common-words.table.json) for the sweep sentences.
 *
 * What counts as FALSE (part 1, "real"): an admitted card whose headword is not the gold headword and not one of its lenient alternatives.
 * Part 2, "by convention": counted false only against the PRIMARY gold headword but a lenient alternative (a compound part, the base noun of a 하다 verb,
 * a noun before 적, the unprefixed word) which is itself a real word of the lexicon with a meaning; they are listed apart.
 * UNKNOWN or FRAGMENT: an admitted card whose headword is not a listed entry of the lexicon, or has no meaning.
 *
 * No threshold is fitted: the band (0.15) and the floor (0.5) are the product's own. The development sentences are reported in two halves (first half,
 * second half by sentence order) so that anything later fitted on the first is judged on the second. The test part of the treebank is never opened.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { AnalysisCandidate, AnalyzedToken, LanguageAdapter, RawToken } from '../src/core';
import { koAdapter } from '../src/adapters/ko';
import { koReviewGate, koHeadwordListed, koEntryOf, PARTICLE_FORMS, CLOSING } from '../src/adapters/korean/review-gate';
import readline from 'node:readline';
import { KO_CORE } from '../src/adapters/korean/generated/core';
import { koBareLemma, koEntryLemma, koSharedPos, lookupKoreanStem } from '../src/adapters/korean/index-store';
import { createKoreanShardLoader } from '../src/adapters/korean/shards';
import { wordsOfText } from '../packages/golearn-extension/src/active/scan';
import { createFactsProvider } from '../packages/goreview/src';
import { createPackRuntime, koreanManifest } from '../packages/language-packs/src';
import { deriveGold, parseConllu, type GoldSentence } from './ko-eval.mts';

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
export const DEV_PATH = path.join(ROOT, 'data/raw/ud-ko/ko_kaist-ud-dev.conllu');
export const TRAIN_PATH = path.join(ROOT, 'data/raw/ud-ko/ko_kaist-ud-train.conllu');
export const TABLE_PATH = path.join(ROOT, 'test/adapters/korean/common-words.table.json');

// ───────────────────────────── the analyser, gated and ungated ─────────────────────────────
const cleaned = (c: AnalysisCandidate): AnalysisCandidate => {
  if (c.notes?.reviewGate !== 'yes' && c.notes?.reviewKind === undefined) return c;
  const { reviewStatus: _s, reviewReason: _r, reviewGate: _g, reviewKind: _k, reviewRivals: _v, ...notes } = c.notes;
  return { ...c, notes };
};
const wrap = (gated: boolean): LanguageAdapter => new Proxy(koAdapter, {
  get(t, p, r) {
    if (p === 'analyze') return (tokens: RawToken[], o?: Parameters<LanguageAdapter['analyze']>[1]): AnalyzedToken[] => {
      const an = t.analyze(tokens, o).map((a) => ({ ...a, candidates: a.candidates.map(cleaned) }));
      if (gated) koReviewGate(tokens, an);
      return an;
    };
    return Reflect.get(t, p, r);
  },
}) as LanguageAdapter;
export const GATED = wrap(true);
export const UNGATED = wrap(false);

// ───────────────────────────── the sentences ─────────────────────────────
export interface AuditSentence { text: string; gold?: GoldSentence; wants?: Array<{ at: string; lemmas: string[]; means: string[] }> }

export function sweepSentences(): AuditSentence[] {
  const t = JSON.parse(fs.readFileSync(TABLE_PATH, 'utf8'));
  const lemmasOf = (w: unknown): string[] => {
    if (!w) return [];
    const x = w as { anyOf?: unknown[]; lemma?: string } | unknown[];
    if (Array.isArray(x)) return x.flatMap(lemmasOf);
    if (x.anyOf) return x.anyOf.flatMap(lemmasOf);
    return x.lemma ? [koBareLemma(x.lemma)] : [];
  };
  const meansOf = (w: unknown): string[] => {
    if (!w) return [];
    const x = w as { anyOf?: unknown[]; means?: string[] } | unknown[];
    if (Array.isArray(x)) return x.flatMap(meansOf);
    if (x.anyOf) return x.anyOf.flatMap(meansOf);
    return x.means ?? [];
  };
  const byText = new Map<string, Array<{ at: string; lemmas: string[]; means: string[] }>>();
  const add = (text: string | undefined, at: string | undefined, want: unknown): void => {
    if (!text) return;
    const list = byText.get(text) ?? byText.set(text, []).get(text)!;
    if (at) list.push({ at, lemmas: lemmasOf(want), means: meansOf(want) });
  };
  for (const e of t.entries) for (const s of e.s ?? []) add(s.t, s.at, s.want);
  for (const b of t.blocks) { add(b.t, undefined, undefined); for (const c of b.chk ?? []) add(b.t, c.at, c.want); }
  for (const e of t.twoSided) for (const s of e.s ?? []) add(s.t, s.at, s.want);
  return [...byText].map(([text, wants]) => ({ text, wants }));
}

export const DATA_PRESENT = fs.existsSync(DEV_PATH) && fs.existsSync(TRAIN_PATH);
export function devSentences(): GoldSentence[] { return parseConllu(fs.readFileSync(DEV_PATH, 'utf8')); }
function trainForms(): Set<string> { const s = new Set<string>(); for (const g of parseConllu(fs.readFileSync(TRAIN_PATH, 'utf8'))) for (const r of g.rows) s.add(r.form); return s; }

// ───────────────────────────── the facts a card is made from ─────────────────────────────
const diskFetch = (async (input: RequestInfo | URL) => {
  const file = path.join(PUBLIC, decodeURIComponent(new URL(String(input), 'http://assets.local/').pathname));
  return fs.existsSync(file) && fs.statSync(file).isFile() ? new Response(fs.readFileSync(file)) : new Response('not found', { status: 404 });
}) as typeof fetch;

export async function loadShards(texts: string[]): Promise<void> {
  const loader = await createKoreanShardLoader({
    async fetchJson(p) { return JSON.parse(fs.readFileSync(path.join(PUBLIC, p), 'utf8')); },
    async fetchBytes(p) { return new Uint8Array(fs.readFileSync(path.join(PUBLIC, decodeURIComponent(p)))); },
  }, { base: 'lexicon/ko/standard' });
  const keys = new Set<string>();
  for (const t of texts) for (const w of koAdapter.tokenize(t)) if (w.isWord) keys.add(w.normalized);
  const all = [...keys];
  for (let i = 0; i < all.length; i += 400) await loader.ensure(all.slice(i, i + 400));
}

function providers() {
  const manifest = koreanManifest();
  const runtime = createPackRuntime(manifest, { fetch: diskFetch, baseUrl: 'http://assets.local/' });
  const make = (adapter: LanguageAdapter) => createFactsProvider({ unit: async () => undefined, pack: { manifest, runtime }, adapter: adapter as never });
  return { with: make(GATED), without: make(UNGATED) };
}

// ───────────────────────────── the audit ─────────────────────────────
export interface Card { sentence: string; surface: string; lemma: string; pos: string; unit: string }
export interface FalseCard extends Card { gold: string; alts: string[]; part: 1 | 2; why: string; rule?: string; parts?: string; goldListed?: boolean; goldRival?: boolean }
export interface Held { surface: string; lemma: string; reason: string }
export interface Figures {
  sentences: number; tokens: number; judged: number; credited: number;
  unitsWithout: number; unitsWith: number; admittedOccurrencesWithout: number; admittedOccurrencesWith: number;
  falseWithout: number; falseWith: FalseCard[]; byConvention: FalseCard[]; unknown: Card[];
  held: Map<string, number>; heldWords: Map<string, number>;
  /** admitted occurrences and false ones by the reading's confidence (two decimals), by whether the token is a whole 어절 and by part of speech: where a stricter test could cut */
  byConf: Map<string, { n: number; bad: number }>; byPos: Map<string, { n: number; bad: number }>;
  /** (iii) the sweep's wanted meaning keywords against the first meaning the card shows */
  meaningChecked: number; meaningMiss: Array<Card & { shown: string; wanted: string[] }>;
  /** form cards (form:ko:...) the facts provider admits WITHOUT the form rule (packFacts.ts: no Korean form unit is a card), and how many read another headword than the gold one */
  formWithout: number; formFalseWithout: number;
  /** every admitted lemma card with the first meaning it shows and how often it occurred */
  cards: Map<string, { n: number; shown: string }>;
  /** T-A' (measured only): the occurrences T-A holds that the rare-rival test would release, and what they would add */
  aPrime: { releasedOcc: number; releasedUnits: Set<string>; releasedWords: Map<string, number>; part1Added: FalseCard[]; heldByA: number };
  /** the forms held as 'two-words': surface -> chosen and rival headword with their counts */
  twoWords: Map<string, { n: number; a: string; b: string; na: number; nb: number }>;
  /** MEASURED ONLY: a particle-spelled token that follows a closing quote / bracket / number / Latin letters after ONE space (the treebank's own spacing): how many admitted occurrences, and how many of them were false */
  spacedParticle: { n: number; bad: number; badSurfaces: Map<string, number>; okSurfaces: Map<string, number> };
  /** the meaning hold (kind 'meaning-unreviewed'): occurrences, units, how many of the occurrences are entries of the compiled core, and the commonest words */
  meaningHold: { occ: number; coreOcc: number; units: Set<string>; coreUnits: Set<string>; words: Map<string, number> };
  /** part 2 by rule (lenient, i..v) */
  byRule: Map<string, FalseCard[]>;
  /** the four test modes over the admitted occurrences: base gate, + T-A, + T-C, + both */
  modes: Record<string, { occ: number; units: Set<string>; part1: FalseCard[]; heldWords: Map<string, number>; meaningChecked?: number }>;
}

const REASONS: Array<[RegExp, string]> = [
  [/not a listed word/, 'not a listed headword (fragment, name, unattested compound)'],
  [/no English meaning/, 'no English meaning'],
  [/below the confidence/, 'below the credit floor'],
  [/several words/, 'undecided homonym'],
  [/two different words/, 'two-sided form (a rival within the band)'],
  [/known to read wrongly/, 'known-limits list'],
];
const KIND_LABEL: Record<string, string> = {
  'meaning-unreviewed': 'the first meaning is unchecked (multi flag): the meaning hold',
  unlisted: 'not a listed headword (fragment, name, unattested compound)', 'no-meaning': 'no English meaning', 'low-confidence': 'below the card floor (0.8)',
  'undecided-entry': 'undecided homonym', 'two-words': 'two-sided form (a rival within the band)', 'known-limit': 'known-limits list', 'other-listed-word': 'another listed word could be meant (T-A)',
};
const reasonOf = (text: string | undefined): string => REASONS.find(([re]) => re.test(text ?? ''))?.[1] ?? 'other';
const BAD = new Set(['invalidated', 'conflicted', 'requires-review']);
const PRED = new Set(['VERB', 'ADJ', 'AUX']);
const stemOf = (l: string): string => (l.length > 1 && l.endsWith('다') ? l.slice(0, -1) : l);
/** The priors-corpus count of a spelling (the lexicon's n, the largest over its entries): the count the sentence layer's rare-rival test reads. 0 = unseen: rare. */
export function countOf(lemma: string): number {
  const bare = koBareLemma(lemma);
  let n = 0;
  for (const key of [bare, stemOf(bare)]) for (const h of lookupKoreanStem(key)) if (koBareLemma(h.entry.lemma) === bare) n = Math.max(n, h.entry.n ?? 0);
  return n;
}
/** The pack's rare-rival test: a rival is rare when its count is under 30 AND under a quarter of the chosen headword's count (no count = rare). */
const isRare = (nRival: number, nChosen: number): boolean => !(nRival >= 30 || nRival >= nChosen / 4) || nRival === 0;
export const RULE_TEXT: Record<string, string> = {
  lenient: 'the treebank\'s own lenient alternative (a compound part, the base noun of a 하다 verb, a noun before 적, the unprefixed word)',
  i: '(i) a listed compound verb whose first verb is the gold lemma (the treebank cuts at the first verb)',
  ii: '(ii) a listed adverb in 이 / 히 / 리 whose base is the gold lemma',
  iii: '(iii) the gold lemma is not a listed word and the card\'s listed headword starts the written form (a gold artefact of deriving stem + 다 from a contracted form)',
  iv: '(iv) the nominalisation in ㅁ / 기 of the very verb the card names (울림이었다 → 울리다); the auditor may rule either way',
  v: '(v) a noun whose gold lemma is the noun plus a fused particle (때문에 → 때문)',
};
/** Does some candidate reading of this written form name this bare headword? (the analyser's own conjugation, in reverse) */
const readsAs = (written: string, headword: string): boolean => {
  try { return koAdapter.analyze(koAdapter.tokenize(written)).some((a) => a.candidates.some((c) => koBareLemma(c.lemma ?? '') === headword)); } catch { return false; }
};
/** A listed compound verb A + B (B a listed predicate) whose first verb A, in its conjugated stem (가져, 살펴, 따라), is the gold lemma: 가져가다 / 가지다. */
const firstVerbIs = (lemma: string, g: string): boolean => {
  for (let k = 1; k <= lemma.length - 2; k++) {
    const second = lemma.slice(k);
    if (!second.endsWith('다') || !koHeadwordListed(second, 'VERB') && !koHeadwordListed(second, 'ADJ')) continue;
    const first = lemma.slice(0, k);
    if (stemOf(g) === first || readsAs(first + '서', g)) return true;
  }
  return false;
};
/** Why a card whose headword is not the gold headword is still a real word of the sentence under a defensible analysis; undefined = not one of the rules (part 1). */
function conventionRule(card: { lemma: string; pos: string; surface: string; nominal: boolean }, gold: { lemma: string; pos?: string }): string | undefined {
  const lemma = card.lemma; const g = gold.lemma;
  if (PRED.has(card.pos) && g.endsWith('다') && lemma.endsWith('다') && lemma.length > g.length - 1 && koHeadwordListed(lemma, card.pos) && (stemOf(lemma).startsWith(stemOf(g)) || firstVerbIs(lemma, g))) return 'i';
  if (card.pos === 'ADV' && /[이히리]$/u.test(lemma) && (lemma.slice(0, -1) === g || lemma.slice(0, -1) === stemOf(g) || (g.endsWith('하다') && lemma.slice(0, -1) === g.slice(0, -2)) || readsAs(lemma.slice(0, -1) + '라서', g)) && koHeadwordListed(lemma, card.pos)) return 'ii';
  if (card.pos === 'NOUN' && g.startsWith(lemma) && g.length - lemma.length <= 2 && g.length > lemma.length) return 'v';
  if (PRED.has(card.pos) && card.nominal && gold.pos === 'NOUN') return 'iv';
  if (!koHeadwordListed(g, undefined) && koHeadwordListed(lemma, card.pos) && card.surface[0] === lemma[0]) return 'iii';
  return undefined;
}

export async function runAudit(sentences: AuditSentence[], opts: { trainForms?: Set<string> } = {}): Promise<Figures> {
  const f = providers();
  const admitCache = { with: new Map<string, string | undefined>(), without: new Map<string, string | undefined>() };
  const shownCache = new Map<string, string>();
  const formSeen = new Set<string>();
  /** undefined = admitted; else the reason it is not */
  const admit = async (which: 'with' | 'without', unit: string): Promise<string | undefined> => {
    const cache = admitCache[which];
    if (cache.has(unit)) return cache.get(unit);
    const facts = await f[which].factsFor(unit, 'ko');
    let why: string | undefined;
    if (!facts) why = 'no facts';
    else if (BAD.has(facts.status)) why = `facts ${facts.status}`;
    else if (!facts.glosses.length) why = 'no English meaning';
    else if (!facts.unit.provenance?.ref?.startsWith('goreview-facts:pack-derived@')) why = 'not pack-derived';
    cache.set(unit, why);
    if (which === 'with' && !why && facts) shownCache.set(unit, facts.glosses[0] ?? '');
    return why;
  };
  const fig: Figures = { sentences: sentences.length, tokens: 0, judged: 0, credited: 0, unitsWithout: 0, unitsWith: 0, admittedOccurrencesWithout: 0, admittedOccurrencesWith: 0,
    falseWithout: 0, falseWith: [], byConvention: [], unknown: [], held: new Map(), heldWords: new Map(), byConf: new Map(), byPos: new Map(), meaningChecked: 0, meaningMiss: [], formWithout: 0, formFalseWithout: 0, cards: new Map(), byRule: new Map(), meaningHold: { occ: 0, coreOcc: 0, units: new Set<string>(), coreUnits: new Set<string>(), words: new Map() }, spacedParticle: { n: 0, bad: 0, badSurfaces: new Map(), okSurfaces: new Map() }, aPrime: { releasedOcc: 0, releasedUnits: new Set<string>(), releasedWords: new Map(), part1Added: [], heldByA: 0 }, twoWords: new Map(), modes: Object.fromEntries(['base', 'A', 'C', 'AC'].map((m) => [m, { occ: 0, units: new Set<string>(), part1: [], heldWords: new Map() }])) };
  const unitsWithout = new Set<string>(); const unitsWith = new Set<string>();
  const train = opts.trainForms ?? new Set<string>();
  const bump = (m: Map<string, number>, k: string): void => { m.set(k, (m.get(k) ?? 0) + 1); };

  for (const s of sentences) {
    const text = s.text.normalize('NFC');
    const toks = koAdapter.tokenize(text);
    const words = toks.filter((t) => t.isWord && /\p{L}/u.test(t.surface));
    fig.tokens += words.length;
    const wUn = wordsOfText(text, UNGATED, 'ko');
    const wGa = wordsOfText(text, GATED, 'ko');
    const gaByStart = new Map(wGa.map((w) => [w.start, w]));
    const analyses = GATED.analyze(toks);
    const goldAt = new Map<number, { lemma?: string; alts: string[]; excluded?: string; pos?: string; tags: string[] }>();
    if (s.gold) {
      let cursor = 0;
      for (const row of s.gold.rows) {
        const at = text.indexOf(row.form, cursor);
        if (at < 0) continue;
        cursor = at + row.form.length;
        const g = deriveGold(row, text, train);
        const head = words.find((t) => t.start === at);
        if (head) goldAt.set(head.start, { lemma: g.lemma, alts: g.alts, excluded: g.excluded, pos: g.pos, tags: g.tags });
      }
    }
    const wantAt = new Map<string, { lemmas: string[]; means: string[] }>();
    for (const w of s.wants ?? []) wantAt.set(w.at, w);

    for (const u of wUn) {
      const unitU = u.readings[0];
      if (!unitU) continue; // not creditable even without the gate
      fig.credited++;
      const g = gaByStart.get(u.start)!;
      const a = analyses.find((x) => x.token.start === u.start)!;
      const best = a.candidates.reduce((m, c) => (c.confidence > m.confidence ? c : m), a.candidates[0]);
      const lemma = koBareLemma(best.lemma ?? '');
      // WITHOUT the gate
      const whyU = await admit('without', unitU);
      const admittedU = !whyU;
      if (admittedU) { fig.admittedOccurrencesWithout++; unitsWithout.add(unitU); }
      // WITH the gate: the unit the gated scan credits, then the facts of the gated provider
      const unitG = g.ids.find((id) => id.startsWith('lemma:'));
      let admittedG = false; let heldWhy = '';
      if (!unitG) heldWhy = KIND_LABEL[String(best.notes?.reviewKind ?? '')] ?? reasonOf(best.notes?.reviewReason as string | undefined);
      else {
        const whyG = await admit('with', unitG);
        if (whyG && best.notes?.reviewKind === 'meaning-unreviewed') heldWhy = KIND_LABEL['meaning-unreviewed'];
        else if (whyG) heldWhy = whyG.startsWith('facts requires-review') ? 'facts: the lemma read alone is held by the gate' : `facts: ${whyG}`;
        else admittedG = true;
      }
      if (admittedG) { fig.admittedOccurrencesWith++; unitsWith.add(unitG!); const cc = fig.cards.get(unitG!) ?? { n: 0, shown: shownCache.get(unitG!) ?? '' }; cc.n++; fig.cards.set(unitG!, cc); }
      else if (admittedU) {
        bump(fig.held, heldWhy || 'other'); bump(fig.heldWords, `${u.surface} → ${lemma}`);
        if (heldWhy === KIND_LABEL['meaning-unreviewed']) {
          const mh = fig.meaningHold; mh.occ++; mh.units.add(unitU); bump(mh.words, `${u.surface} → ${lemma}`);
          const e = koEntryOf(best.lemma, best.pos);
          const inCore = !!e && Object.values(KO_CORE.entries).some((rows) => rows.some((r) => r.lemma === e.lemma && r.tag === e.tag && r.hom === e.hom && !!r.multi));
          if (inCore) { mh.coreOcc++; mh.coreUnits.add(unitU); }
        }
      }
      // judged?
      const gold = goldAt.get(u.start);
      const wantObj = wantAt.get(u.surface);
      const want = wantObj?.lemmas;
      let verdict: { ok: boolean; part?: 1 | 2; gold: string; alts: string[]; why: string; rule?: string; goldListed?: boolean } | undefined;
      const nominal = !!best.parts?.some((p) => /nominali/i.test(p.role ?? ''));
      // the gold head is a FUNCTION morpheme (a particle j*, an ending e*, a suffix, or the copula alone): a content card for it is false whatever its lemma string says
      const isFunction = !!gold && ((!!gold.excluded?.startsWith('the 어절 is a bare particle') && gold.tags.every((t) => /^(j|e|xs)/u.test(t))) || (gold.tags[0] === 'jp' && gold.tags.every((t) => t === 'jp' || t.startsWith('e'))));
      const notAWord = !!gold?.excluded && /^(punctuation|symbol|foreign)/u.test(gold.excluded);
      if (isFunction) verdict = { ok: false, part: 1, gold: `(function morpheme ${gold!.tags.join('+')})`, alts: [], why: 'the gold head is a function morpheme (a particle, an ending, a suffix or the copula alone), not a word to drill', rule: 'function' };
      else if (notAWord) verdict = { ok: false, part: 1, gold: `(${gold!.excluded})`, alts: [], why: 'the treebank does not treat this token as a word', rule: 'not-a-word' };
      else if (gold && !gold.excluded && gold.lemma) {
        const ok = lemma === gold.lemma; const lenient = gold.alts.includes(lemma);
        const group = (p?: string): string => (PRED.has(p ?? '') ? 'pred' : 'other');
        const clash = ok && !!gold.pos && !!best.pos && group(gold.pos) !== group(best.pos);
        verdict = clash ? { ok: false, part: 1, gold: `${gold.lemma} (${gold.pos})`, alts: [], why: `the lemma string is the gold one but the class cannot be: gold ${gold.pos}, card ${best.pos}`, rule: 'class', goldListed: true }
          : ok ? { ok: true, gold: gold.lemma, alts: gold.alts, why: '' }
          : lenient ? { ok: false, part: 2, rule: 'lenient', gold: gold.lemma, alts: gold.alts, why: RULE_TEXT.lenient }
            : (() => {
              const rule = conventionRule({ lemma, pos: best.pos ?? '', surface: u.surface, nominal }, { lemma: gold.lemma!, pos: gold.pos });
              const goldListed = koHeadwordListed(gold.lemma, undefined);
              return rule ? { ok: false as const, part: 2 as const, rule, gold: gold.lemma!, alts: gold.alts, why: RULE_TEXT[rule] }
                : { ok: false as const, part: 1 as const, gold: gold.lemma!, alts: gold.alts, why: 'the headword is not the word in the sentence', goldListed };
            })();
      } else if (want?.length) {
        verdict = want.includes(lemma) ? { ok: true, gold: want.join('/'), alts: [], why: '' } : { ok: false, part: 1, gold: want.join('/'), alts: [], why: 'not the headword the sweep expects' };
      }
      if (verdict) fig.judged++;
      if (!admittedG && admittedU) {
        const kind = String(best.notes?.reviewKind ?? '');
        const rivalNames = (Array.isArray(best.notes?.reviewRivals) ? best.notes!.reviewRivals as string[] : []).map(koBareLemma);
        if (kind === 'two-words' && rivalNames.length) {
          const rec = fig.twoWords.get(u.surface) ?? { n: 0, a: lemma, b: rivalNames[0], na: countOf(lemma), nb: countOf(rivalNames[0]) };
          rec.n++; fig.twoWords.set(u.surface, rec);
        }
        if (kind === 'other-listed-word') {
          fig.aPrime.heldByA++;
          const nChosen = countOf(lemma);
          if (rivalNames.length > 0 && rivalNames.every((r) => isRare(countOf(r), nChosen))) {
            fig.aPrime.releasedOcc++; fig.aPrime.releasedUnits.add(unitU); bump(fig.aPrime.releasedWords, `${u.surface} → ${lemma}`);
            if (verdict && !verdict.ok && verdict.part === 1) fig.aPrime.part1Added.push({ sentence: text, surface: u.surface, lemma: best.lemma ?? '', pos: best.pos ?? '', unit: unitU, gold: verdict.gold, alts: verdict.alts, part: 1, why: verdict.why });
          }
        }
      }
      // the form card the written form would make, WITHOUT the form rule: its facts are the form read alone
      const formUnit = u.ids[0];
      if (!formSeen.has(formUnit)) {
        formSeen.add(formUnit);
        const ff = await f.without.factsFor(formUnit, 'ko');
        if (ff && !BAD.has(ff.status) && ff.glosses.length) {
          fig.formWithout++;
          const fl = koBareLemma(ff.lemma ?? '');
          if (verdict && fl !== lemma && fl !== (gold?.lemma ?? '') && !(gold?.alts ?? []).includes(fl) && !(want ?? []).includes(fl)) fig.formFalseWithout++;
        }
      }
      const card: Card = { sentence: text, surface: u.surface, lemma: best.lemma ?? '', pos: best.pos ?? '', unit: unitG ?? unitU };
      const partsText = (best.parts ?? []).map((p) => (p.lemma && p.lemma !== p.text ? `${p.text}(${p.lemma})` : p.text)).join(' + ');
      if (verdict && !verdict.ok && admittedU) fig.falseWithout++;
      if (admittedG && wantObj?.means.length && wantObj.lemmas.includes(lemma)) {
        fig.meaningChecked++;
        const shown = (shownCache.get(unitG!) ?? '').toLowerCase();
        if (!wantObj.means.some((k) => shown.includes(k.toLowerCase()))) fig.meaningMiss.push({ ...card, shown, wanted: wantObj.means });
      }
      if (admittedG && PARTICLE_FORMS.has(u.surface)) {
        const ix = toks.findIndex((t) => t.start === u.start);
        const prev = toks[ix - 1];
        if (prev && prev.end < u.start && text.slice(prev.end, u.start) === ' ' && (!prev.isWord || /^[A-Za-z]+$/u.test(prev.surface)) && CLOSING.test(prev.surface)) {
          const sp = fig.spacedParticle; sp.n++;
          const isBad = !!verdict && !verdict.ok && verdict.part === 1;
          if (isBad) { sp.bad++; bump(sp.badSurfaces, u.surface); } else bump(sp.okSurfaces, u.surface);
        }
      }
      if (admittedG) {
        const bad = !!(verdict && !verdict.ok && verdict.part === 1);
        for (const [m, k] of [[fig.byConf, best.confidence.toFixed(2)], [fig.byPos, best.pos ?? '?']] as const) { const v = m.get(k) ?? { n: 0, bad: 0 }; v.n++; if (bad) v.bad++; m.set(k, v); }
        if (!koHeadwordListed(best.lemma, best.pos)) fig.unknown.push(card);
        const fc: FalseCard | undefined = verdict && !verdict.ok ? { ...card, gold: verdict.gold, alts: verdict.alts, part: verdict.part!, why: verdict.why, rule: verdict.rule, parts: partsText, goldListed: verdict.goldListed, goldRival: verdict.part === 1 ? a.candidates.some((c) => koBareLemma(c.lemma ?? '') === verdict!.gold) : undefined } : undefined;
        if (fc) {
          (fc.part === 2 ? fig.byConvention : fig.falseWith).push(fc);
          if (fc.part === 2) { const l = fig.byRule.get(fc.rule!) ?? []; l.push(fc); fig.byRule.set(fc.rule!, l); }
        }
        // T-C (a copula that is not written) is measured only, not in the product
        const aHit = false; // T-A (another listed word could be meant) is IN the product now (the gate's otherListedWord option); only T-C is still measured as an extra
        const cHit = !!best.parts?.some((p) => p.lemma === '이다' && p.text === '이' && !u.surface.includes('이'));
        for (const [m, held] of [['base', false], ['A', aHit], ['C', cHit], ['AC', aHit || cHit]] as const) {
          const M = fig.modes[m];
          if (held) { bump(M.heldWords, `${u.surface} → ${lemma}`); continue; }
          M.occ++; M.units.add(unitG!);
          if (fc && fc.part === 1) M.part1.push(fc);
        }
      }
    }
  }
  fig.unitsWithout = unitsWithout.size; fig.unitsWith = unitsWith.size;
  return fig;
}

// ───────────────────────────── the meaning checks ─────────────────────────────
export type Verdict = 'SAME' | 'CONSTRUCTION' | 'WRONG';
export interface FlagRow { unit: string; head: string; entry: string; cls: string; shown: string; lexicon: string; verdict: Verdict; n: number }
export interface MeaningReport {
  checked: number;
  sameFlags: FlagRow[]; classFlags: FlagRow[]; marginal: string[]; firstSenseDiffers: number; glossOwn: number;
  /** joined to the extract's senses: by etymology number, then by Hanja/part of speech/first gloss; this product's own rows (counted apart, by name); not joined */
  joinedEty: number; joinedGloss: number; own: string[]; unjoined: string[];
}
const MARGINAL = new Set(['archaic', 'obsolete', 'dated', 'rare', 'dialectal', 'dialect', 'historical', 'uncommon', 'North Korea', 'Jeju']);
const KAIKKI_POS: Record<string, string[]> = { NOUN: ['noun'], PROPN: ['name', 'noun'], PRON: ['pron'], NUM: ['num'], VERB: ['verb'], ADJ: ['adj'], AUX: ['verb', 'adj'], ADV: ['adv'], DET: ['det'], CLF: ['noun'], CONJ: ['conj'], INTJ: ['intj'] };
const KAIKKI_PATH = path.join(ROOT, 'data/raw/kaikki-ko/kaikki.org-dictionary-Korean.jsonl');

/**
 * (i) SAME ENTRY: the first meaning the card shows is the first meaning of the entry the unit names (the lexicon's gloss for that entry, or the dictionary's
 * first sense for a numbered lemma); (ii) CLASS: a predicate shows a predicate gloss ("to …", "to be …"), a noun does not; MARGINAL: the first sense of the source
 * entry (data/raw/kaikki-ko, joined by word + part of speech + etymology number = the entry's homonym number) carries a tag such as archaic / dialectal / rare while a
 * later sense of that entry has none, and the gloss is the source's own (not a hand override).
 */
export async function meaningAudit(cards: Map<string, { n: number; shown: string }>): Promise<MeaningReport> {
  const manifest = koreanManifest();
  const runtime = createPackRuntime(manifest, { fetch: diskFetch, baseUrl: 'http://assets.local/' });
  const rep: MeaningReport = { checked: 0, sameFlags: [], classFlags: [], marginal: [], firstSenseDiffers: 0, glossOwn: 0, joinedEty: 0, joinedGloss: 0, own: [], unjoined: [] };
  const wanted = new Set<string>();
  const parsed = new Map<string, { L: string; pos: string; bare: string }>();
  for (const unit of cards.keys()) {
    const m = /^lemma:ko:(.*):([A-Z]+)$/u.exec(unit);
    if (!m) continue;
    parsed.set(unit, { L: m[1], pos: m[2], bare: koBareLemma(m[1]) });
    wanted.add(koBareLemma(m[1]));
  }
  const kaikki = new Map<string, Array<{ pos: string; ety?: number; hanja: string[]; senses: Array<{ gloss: string; tags: string[] }> }>>();
  if (fs.existsSync(KAIKKI_PATH)) {
    const rl = readline.createInterface({ input: fs.createReadStream(KAIKKI_PATH) });
    for await (const line of rl) {
      const at = line.indexOf('"word": "');
      if (at < 0) continue;
      const word = line.slice(at + 9, line.indexOf('"', at + 9));
      if (!wanted.has(word)) continue;
      try {
        const j = JSON.parse(line) as { pos: string; etymology_number?: number; senses?: Array<{ glosses?: string[]; tags?: string[] }>; etymology_text?: string; head_templates?: Array<{ expansion?: string }> };
        const hanja = [...(JSON.stringify(j.head_templates ?? []) + (j.etymology_text ?? '')).matchAll(/[\u3400-\u9fff]+/gu)].map((m) => m[0]);
        const list = kaikki.get(word) ?? []; kaikki.set(word, list);
        list.push({ pos: j.pos, ety: j.etymology_number, hanja, senses: (j.senses ?? []).filter((x) => x.glosses?.length).map((x) => ({ gloss: x.glosses!.join('; '), tags: x.tags ?? [] })) });
      } catch { /* a line the extract made badly is not joined */ }
    }
  }
  const words = (x: string): string[] => x.toLowerCase().replace(/\([^)]*\)/gu, ' ').split(/[^a-z]+/u).filter((w) => w.length >= 4 && !['to', 'be', 'being', 'that', 'with', 'something', 'someone', 'used', 'from', 'this', 'one'].includes(w));
  const alike = (a: string, b: string): boolean => { const x = a.toLowerCase(); const y = b.toLowerCase(); if (!x || !y) return false; if (x === y || x.includes(y) || y.includes(x)) return true; const wb = new Set(words(b)); return words(a).some((w) => wb.has(w)); };
  for (const [unit, c] of cards) {
    const p = parsed.get(unit); if (!p) continue;
    rep.checked++;
    const shown = c.shown.trim();
    const hits = [p.bare, stemOf(p.bare)].flatMap((k) => lookupKoreanStem(k)).filter((h) => koEntryLemma(h.entry) === p.L && (koSharedPos(h.entry) === p.pos || (PRED.has(p.pos) && PRED.has(koSharedPos(h.entry) ?? '')))).map((h) => h.entry);
    const entry = hits[0];
    const label = p.L + (entry?.hom !== undefined ? ` (entry ${entry.hom}${entry.set === 'main' ? ', the main entry' : ''})` : ' (alone in its class)');
    const row = (lexicon: string, verdict: Verdict): FlagRow => ({ unit, head: p.L, entry: label, cls: p.pos, shown, lexicon, verdict, n: c.n });
    const construction = p.pos === 'AUX' || /\(-/u.test(shown) || !!entry?.bound;
    // (i) same entry
    let sameOk = !entry;
    if (entry) {
      const lex = (entry.gloss ?? '').toLowerCase(); const s0 = shown.toLowerCase();
      sameOk = !!lex && (s0 === lex || s0.startsWith(lex) || lex.startsWith(s0));
      if (!sameOk) {
        const dict = await runtime.gloss(p.L, p.pos, [p.L]);
        const first = (dict?.senses?.[0]?.gloss ?? '').toLowerCase();
        sameOk = !!first && (s0 === first || s0.endsWith(first) || first.endsWith(s0));
      }
      if (!sameOk) rep.sameFlags.push(row(entry.gloss ?? '', construction ? 'CONSTRUCTION' : alike(shown, entry.gloss ?? '') ? 'SAME' : 'WRONG'));
      if (entry.glossOwn) rep.glossOwn++;
    }
    // (ii) class fit
    const predicateGloss = /^(\(.*?\)\s*)?(to |not to |be |being )/i.test(shown) || /\bto be\b/i.test(shown);
    if (PRED.has(p.pos) && !predicateGloss) rep.classFlags.push(row(entry?.gloss ?? '', construction ? 'CONSTRUCTION' : /^=/u.test(shown) || alike(shown, entry?.gloss ?? '') ? 'SAME' : 'WRONG'));
    else if (!PRED.has(p.pos) && p.pos !== 'ADV' && /^to /i.test(shown)) rep.classFlags.push(row(entry?.gloss ?? '', 'WRONG'));
    // the source's senses: this product's own row, else join by etymology number, else by Hanja + part of speech + first gloss
    if (entry?.own) { rep.own.push(unit); continue; }
    const pool = (kaikki.get(p.bare) ?? []).filter((e) => (KAIKKI_POS[p.pos] ?? []).includes(e.pos) && e.senses.length);
    let e0 = pool.find((e) => entry?.hom !== undefined && e.ety === entry.hom) ?? (entry?.hom === undefined ? pool[0] : undefined);
    if (e0) rep.joinedEty++;
    if (!e0 && entry) {
      const g0 = (entry.gloss ?? '').toLowerCase().slice(0, 14);
      e0 = pool.find((e) => (!entry.hanja || e.hanja.includes(entry.hanja)) && e.senses.some((x) => g0 && x.gloss.toLowerCase().includes(g0.slice(0, 10))));
      if (e0) rep.joinedGloss++;
    }
    if (!e0) { rep.unjoined.push(unit); continue; }
    const first = e0.senses[0];
    if (entry && !entry.glossOwn && first.gloss.toLowerCase().slice(0, 20) !== (entry.gloss ?? '').toLowerCase().slice(0, 20) && !(entry.gloss ?? '').toLowerCase().startsWith(first.gloss.toLowerCase().slice(0, 12))) rep.firstSenseDiffers++;
    if (entry && !entry.glossOwn && (entry.gloss ?? '').toLowerCase().startsWith(first.gloss.toLowerCase().slice(0, 10)) && first.tags.some((t) => MARGINAL.has(t)) && e0.senses.slice(1).some((x) => !x.tags.some((t) => MARGINAL.has(t)))) {
      rep.marginal.push(`${unit}: first sense "${first.gloss}" is tagged ${first.tags.join('/')}; a later sense "${e0.senses.find((x, i) => i > 0 && !x.tags.some((t) => MARGINAL.has(t)))!.gloss}" is not (${c.n}x)`);
    }
  }
  return rep;
}

// ───────────────────────────── the report ─────────────────────────────
export function summary(name: string, fig: Figures): string[] {
  const top = [...fig.heldWords].sort((a, b) => b[1] - a[1]).slice(0, 20);
  const reasons = [...fig.held].sort((a, b) => b[1] - a[1]);
  const heldN = fig.admittedOccurrencesWithout - fig.admittedOccurrencesWith;
  const L: string[] = [];
  L.push(`### ${name}`, '', `${fig.sentences} sentences, ${fig.tokens} words read, ${fig.credited} credited to a lemma without the gate, ${fig.judged} of them judged against a gold or wanted headword.`, '',
    '| | without the gate | with the gate |', '|---|---|---|',
    `| distinct units admitted to a deck | ${fig.unitsWithout} | ${fig.unitsWith} |`,
    `| admitted occurrences | ${fig.admittedOccurrencesWithout} | ${fig.admittedOccurrencesWith} |`,
    `| FALSE cards (part 1: a real mismatch) | ${fig.falseWithout} (all false, with or without convention) | ${fig.falseWith.length} |`,
    `| cards false only by annotation convention (part 2) | | ${fig.byConvention.length} |`,
    `| unknown or fragment cards | | ${fig.unknown.length} |`,
    `| form cards (form:ko:...) admitted | ${fig.formWithout} (${fig.formFalseWithout} read another headword than the gold one) | 0 (no Korean form unit is a card: packFacts.ts) |`,
    `| first meaning vs the sweep's wanted keywords | | ${fig.meaningMiss.length} misses of ${fig.meaningChecked} checked |`, '',
    `Held back: ${heldN} admitted occurrences (${fig.admittedOccurrencesWithout ? (100 * heldN / fig.admittedOccurrencesWithout).toFixed(1) : '0'} %). By reason:`, '', ...reasons.map(([k, n]) => `- ${k}: ${n}`), '',
    'The twenty commonest words held back (surface → headword: occurrences):', '', ...top.map(([k, n]) => `- ${k}: ${n}`), '');
  L.push('Admitted occurrences and part-1 false ones, by the reading confidence and by part of speech (where a stricter test could cut):', '', ...[...fig.byConf].sort().map(([k, v]) => `- ${k}: ${v.n} admitted, ${v.bad} false`), ...[...fig.byPos].sort().map(([k, v]) => `- ${k}: ${v.n} admitted, ${v.bad} false`), '');
  const bc = [...fig.byRule].map(([r, l]) => [r, l.length] as const).sort();
  L.push('Part 2 by rule (every item is listed below under its rule, for the auditor to challenge):', '', ...bc.map(([r, n]) => `- ${RULE_TEXT[r]}: ${n}`), '');
  for (const [r, l] of [...fig.byRule].sort()) L.push(`Part 2, rule ${r === 'lenient' ? 'lenient' : r}: ${l.length}`, '', ...l.slice(0, 40).map((c) => `- ${c.surface} -> ${c.lemma} (${c.pos}), gold ${c.gold}: ${c.sentence}`), l.length > 40 ? `- ... and ${l.length - 40} more` : '', '');
  const base = fig.modes.base;
  const sp = fig.spacedParticle;
  const mh = fig.meaningHold;
  L.push(`The meaning hold (kind meaning-unreviewed, last rule): ${mh.occ} admitted occurrences held (${(100 * mh.occ / Math.max(1, fig.admittedOccurrencesWithout)).toFixed(1)} % of those admitted without the gate), ${mh.units.size} units; of these ${mh.coreOcc} occurrences and ${mh.coreUnits.size} units are entries of the compiled core (they come back when the model review clears the flag). The twenty commonest words it holds:`, '', ...[...mh.words].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, n]) => `- ${k}: ${n}`), '');
  L.push(`Measured only, NOT in the product: a particle-spelled token after a closing quote, bracket, number or Latin letters with ONE space before it (the treebank's own spacing: '…' 의, 1 % 가). ${sp.n} admitted occurrences; ${sp.bad} of them are part-1 false cards (${[...sp.badSurfaces].map(([k, n]) => k + ' ' + n).join(', ') || 'none'}); the other ${sp.n - sp.bad} are right (${[...sp.okSurfaces].map(([k, n]) => k + ' ' + n).join(', ') || 'none'}).`, '');
  const ap = fig.aPrime;
  const aUnitsAfter = new Set([...base.units, ...ap.releasedUnits]);
  L.push("T-A' (measured only; the rival counts only if its lexicon count is at least 30 or at least a quarter of the chosen headword's; no count = rare):", '',
    `- T-A holds ${ap.heldByA} admitted occurrences; T-A' would release ${ap.releasedOcc} of them (${ap.heldByA ? (100 * ap.releasedOcc / ap.heldByA).toFixed(1) : '0'} %) and ${[...ap.releasedUnits].filter((u) => !base.units.has(u)).length} distinct units.`,
    `- with T-A': ${base.occ + ap.releasedOcc} admitted occurrences (T-A: ${base.occ}), ${aUnitsAfter.size} units (T-A: ${base.units.size}); held back in total ${fig.admittedOccurrencesWithout - base.occ - ap.releasedOcc} occurrences (T-A: ${fig.admittedOccurrencesWithout - base.occ}); by kind: another listed word could be meant ${ap.heldByA - ap.releasedOcc} (T-A: ${ap.heldByA}), the other kinds as in the table above.`,
    `- part-1 cards with T-A': ${base.part1.length + ap.part1Added.length} (T-A: ${base.part1.length}); the ones T-A' lets back in: ${ap.part1Added.length ? ap.part1Added.map((c) => `${c.surface} -> ${c.lemma} (gold ${c.gold})`).join('; ') : 'none'}`, '',
    "The twenty commonest forms T-A holds that T-A' would release:", '', ...[...ap.releasedWords].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, n]) => `- ${k}: ${n}`), '',
    "The twenty commonest forms held as 'two-words' (rule (c), which stays): form: chosen headword (count) beside rival headword (count):", '',
    ...[...fig.twoWords].sort((a, b) => b[1].n - a[1].n).slice(0, 20).map(([k, v]) => `- ${k} (${v.n}x): ${v.a} (${v.na}) beside ${v.b} (${v.nb})`), '');
  L.push('The product (T-A on) and, measured only, T-C (a reading built on an unwritten copula). Part-1 cards left, and what T-C would hold beyond the product:', '', '| | part-1 cards | admitted occurrences | extra held (occ, share) | extra units held |', '|---|---|---|---|---|',
    ...(['base', 'C'] as const).map((m) => { const M = fig.modes[m]; const extra = base.occ - M.occ; return `| ${m === 'base' ? 'the product (gate with T-A)' : 'T-C in addition'} | ${M.part1.length} | ${M.occ} | ${extra} (${base.occ ? (100 * extra / base.occ).toFixed(1) : '0'} %) | ${base.units.size - M.units.size} |`; }), '');
  L.push('The twenty commonest words T-C would newly hold:', '', ...[...fig.modes.C.heldWords].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, n]) => `- ${k}: ${n}`), '');
  const ac = fig.modes.base.part1;
  L.push(`Residual part 1 in the product (${ac.length}): the headword is not the word in the sentence. Kind: [gold unlisted] the right word is not a listed word, so no test over the lexicon can name it; [right word was a rival] the right headword was another candidate of the token; [never produced] the right headword was not a candidate at all.`, '',
    ...ac.map((c) => `- [${c.goldListed === false ? 'gold unlisted' : c.goldRival ? 'right word was a rival' : 'never produced'}] ${c.surface} -> ${c.lemma} (${c.pos}) = ${c.parts || '?'}; gold ${c.gold}: ${c.sentence}`), '');
  const kinds = { unlisted: ac.filter((c) => c.goldListed === false).length, rival: ac.filter((c) => c.goldListed !== false && c.goldRival).length, never: ac.filter((c) => c.goldListed !== false && !c.goldRival).length };
  L.push(`Residual kinds: ${kinds.unlisted} gold unlisted (no lexicon test can catch these), ${kinds.rival} right word was a rival candidate, ${kinds.never} never produced.`, '');
  if (fig.meaningMiss.length) L.push('Meaning misses (word, meaning shown, meaning wanted), counted as part-1 false cards:', '', ...fig.meaningMiss.map((c) => `- ${c.surface} -> ${c.lemma}: shown "${c.shown}", wanted ${c.wanted.join('/')}`), '');
  const why = new Map<string, FalseCard[]>();
  for (const c of fig.falseWith) { const k = c.rule === 'function' ? 'gold head is a function morpheme' : c.rule === 'class' ? 'same lemma string, a class gold cannot share' : c.rule === 'not-a-word' ? 'the treebank does not treat it as a word' : 'the headword is not the word in the sentence'; (why.get(k) ?? why.set(k, []).get(k)!).push(c); }
  L.push('Part 1 by finding:', '', ...[...why].map(([k, l]) => `- ${k}: ${l.length}${l.length ? ' (commonest: ' + [...l.reduce((m, c) => m.set(c.surface, (m.get(c.surface) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k2, n]) => k2 + ' ' + n).join(', ') + ')' : ''}`), '');
  if (fig.falseWith.length) { L.push('Part 1, real false cards:', '', ...fig.falseWith.map((c) => `- ${c.surface} → ${c.lemma} (${c.pos}), gold ${c.gold}: ${c.sentence}`), ''); }
  if (fig.byConvention.length) { L.push('Part 2, false only by convention (gold, then the lenient alternatives):', '', ...fig.byConvention.slice(0, 60).map((c) => `- ${c.surface} → ${c.lemma} (${c.pos}), gold ${c.gold}, alternatives ${c.alts.join(', ') || '-'}: ${c.sentence}`), fig.byConvention.length > 60 ? `- … and ${fig.byConvention.length - 60} more` : '', ''); }
  if (fig.unknown.length) { L.push('Unknown or fragment cards:', '', ...fig.unknown.slice(0, 40).map((c) => `- ${c.surface} → ${c.lemma} (${c.pos}): ${c.sentence}`), ''); }
  return L;
}

if (!process.env.VITEST) {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const li = args.indexOf('--limit');
  const limit = li >= 0 ? Number(args[li + 1]) : Infinity;
  const sweep = sweepSentences();
  const dev = DATA_PRESENT ? devSentences().slice(0, limit) : [];
  const half = Math.ceil(dev.length / 2);
  await loadShards([...sweep.map((s) => s.text), ...dev.map((d) => d.text)]);
  const train = DATA_PRESENT ? trainForms() : new Set<string>();
  const out: string[] = ['# Korean deck audit', '', 'Generated by `npm run ko:deck-audit -- --write`. Method: the header of scripts/ko-deck-audit.mts. No threshold is fitted (band 0.15 and floor 0.5 are the product\'s own); the development sentences are given in two halves. The treebank\'s test part is never opened.', ''];
  const sweepFig = await runAudit(sweep);
  const devFigs: Figures[] = [];
  out.push(...summary('Sweep sentences', sweepFig));
  if (dev.length) {
    const first = await runAudit(dev.slice(0, half).map((g) => ({ text: g.text, gold: g })), { trainForms: train });
    const second = await runAudit(dev.slice(half).map((g) => ({ text: g.text, gold: g })), { trainForms: train });
    devFigs.push(first, second);
    out.push(...summary(`Development, first half (${half} sentences)`, first), ...summary(`Development, second half (${dev.length - half} sentences)`, second));
  }
  const merged = new Map<string, { n: number; shown: string }>();
  for (const fg of [sweepFig, ...devFigs]) for (const [k, v] of fg.cards) { const c = merged.get(k) ?? { n: 0, shown: v.shown }; c.n += v.n; merged.set(k, c); }
  const allCards = new Map<string, { n: number; shown: string }>();
  for (const [k, v] of merged) allCards.set(k, v);
  const mr = await meaningAudit(allCards);
  const un = new Set(mr.unjoined); const own = new Set(mr.own);
  const top = [...merged].sort((a, b) => b[1].n - a[1].n).slice(0, 300);
  out.push('### The 300 commonest admitted cards, with the first meaning each shows', '', 'All are LEMMA cards (no Korean form card is admitted). No machine check proves that a meaning fits the word: a person must read this list. [UNJOINED] marks a card whose source entry could not be joined to the extract\'s senses (read these first); [OWN ROW] a row of this product\'s own supplement.', '',
    ...top.map(([k, v]) => `- lemma card ${k.replace(/^lemma:ko:/u, '')} (${v.n}x): ${v.shown}${un.has(k) ? ' [UNJOINED]' : own.has(k) ? ' [OWN ROW]' : ''}`), '');
  const topUnjoined = top.filter(([k]) => un.has(k)).length;
  // verdicts the heuristic could not give, read by hand (every flag was read; these are the ones whose first verdict was changed or needs a word)
  const BY_HAND: Record<string, [Verdict, string]> = {
    '더구나': ['SAME', 'read by hand: "moreover" and "also" are both meanings of 더구나'],
    '독립되다': ['SAME', 'read by hand: the meaning is right but it is worded as an adjective ("independent") for a verb'],
    '발표되다': ['SAME', 'read by hand: right ("be announced"), worded as a participle ("reported")'],
    '갖다': ['SAME', 'read by hand: a cross-reference gloss "= 가지다: to have", the same meaning'],
  };
  const flagLine = (r: FlagRow): string => { const h = BY_HAND[r.head]; return `- ${r.entry} | ${r.cls} | shown: ${r.shown} | lexicon entry: ${r.lexicon} | ${h ? h[0] : r.verdict} (${r.n}x)${h ? ` — ${h[1]}` : ''}`; };
  out.push('### Meaning checks, over every admitted lemma card of the three runs', '', `${mr.checked} cards. SAME-ENTRY flags: ${mr.sameFlags.length}. CLASS-FIT flags: ${mr.classFlags.length}. Marginal first sense (a source tag such as archaic on the first sense, none on a later one): ${mr.marginal.length}.`,
    `Join to the extract's senses: ${mr.joinedEty} by word + part of speech + etymology number, ${mr.joinedGloss} more by Hanja + part of speech + first gloss; ${mr.own.length} are this product's own rows (no source sense: counted apart, listed by name below); ${mr.unjoined.length} remain unjoined, ${topUnjoined} of them in the 300-card list (marked). Cards whose gloss is a hand override (glossOwn): ${mr.glossOwn}; whose gloss differs from the source's first sense without being an override: ${mr.firstSenseDiffers}.`, '',
    'Verdicts: SAME (the two say the same thing in different words), CONSTRUCTION (an auxiliary\'s or bound noun\'s construction gloss for that same entry), WRONG (another entry\'s or a wrong meaning; a WRONG is a part-1 false card).', '',
    'Same-entry flags, one line each (headword with entry label | class | first meaning shown | lexicon entry\'s gloss | verdict):', '', ...mr.sameFlags.map(flagLine), '',
    'Class-fit flags, one line each:', '', ...mr.classFlags.map(flagLine), '', 'Marginal first sense:', '', ...mr.marginal.map((x) => `- ${x}`), '',
    `This product's own rows among the admitted cards (${mr.own.length}): ${mr.own.map((u) => u.replace(/^lemma:ko:/u, '')).join(', ')}`, '',
    `Unjoined (${mr.unjoined.length}): ${mr.unjoined.map((u) => u.replace(/^lemma:ko:/u, '')).join(', ')}`, '');
  const text = out.join('\n');
  console.log(text);
  if (write) fs.writeFileSync(path.join(ROOT, 'docs/korean/DECK-AUDIT.md'), text);
}
