// @vitest-environment node
/**
 * The common-word sweep (package W): the commonest Korean words, each with the first reading a careful teacher would give, checked
 * bare (the token analysis) and in ordinary sentences (the whole adapter, the sentence layer included), under BOTH lexicon states: the
 * compiled core alone, and the core with every shard (the shard state is skipped when public/lexicon/ko is not built).
 *
 * The table is test/adapters/korean/common-words.table.json:
 *   entries     hand-written: { w, bare, s: [{ t, at, want, shardsOnly? }], note?, shardsOnly? }
 *   blocks      hand-written sentences with several checked tokens (B: numerals before counters and their look-alikes;
 *               C: noun + noun written with a space): { blk, t, chk: [{ at, want }] }
 *   frameNouns  generated from the lexicon (noun, classes, count): every noun and pronoun of the entries and the commonest lexicon nouns;
 *               the test builds noun + 이/가, 을/를, 은/는, 도, 에, 의, 만 (the pack's own allomorph rule) and reads each form bare and
 *               inside a neutral sentence frame; the first reading must be THAT noun with that particle in its chain.
 *   known, frameKnown  the checks that fail today and have not been fixed: run as expected failures (the test fails when one of them
 *               starts passing, so the lists only shrink) and every other wrong reading fails the test.
 * An expected reading: { lemma (bare headword), pos (shared part of speech), means (English keyword(s): ANY one must appear, as a word,
 * in the gloss or the notes; the notes that only list OTHER entries are not read), undecided? } or { anyOf: [reading, …] }.
 * `undecided: true` asks for the undecided reading of a balanced set; without it the undecided reading is wrong.
 * KO_SWEEP_OUT=<file> writes every check with its first two readings, for the report.
 */
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { AnalysisCandidate } from '../../../src/core';
import { koAdapter } from '../../../src/adapters/ko';
import { installKoreanLexicon, koBareLemma, lookupKoreanStem, type KoLexicon } from '../../../src/adapters/korean/index-store';
import { koAnalyzeToken, koClearAnalysisCache } from '../../../src/adapters/korean/analyze';
import { PARTICLES, koAllomorphAgrees } from '../../../src/adapters/korean/particles';
import { decompose, FINALS, isHangulSyllable } from '../../../src/adapters/korean/hangul';

type One = { lemma: string; pos: string; means: string | string[]; undecided?: boolean };
type Want = One | { anyOf: One[] };
interface Entry { w: string; bare: Want; s: Array<{ t: string; at: string; want: Want; shardsOnly?: boolean; twoSidedOk?: boolean }>; note?: string; shardsOnly?: boolean }
interface Block { blk: string; t: string; chk: Array<{ at: string; want: Want; shardsOnly?: boolean }> }
interface TwoSided { w: string; bare?: 'undecided' | 'noun' | 'pred' | 'whole'; bareCore?: 'undecided' | 'noun' | 'pred' | 'whole'; counts?: Record<string, string>; s: Array<{ side: 'noun' | 'pred' | 'whole'; t: string; at: string; want: Array<{ lemma: string; pos: string }>; shardsOnly?: boolean; twoSidedOk?: boolean }>; note?: string }
interface Table { predicateBare?: string[]; known: string[]; frameKnown: string[]; twoSidedKnown: string[]; entries: Entry[]; blocks: Block[]; frameNouns: Array<[string, string, number]>; twoSided: TwoSided[] }

const TABLE = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'common-words.table.json'), 'utf8')) as Table;
const SHARDS = path.resolve(__dirname, '../../../public/lexicon/ko/standard');
const HAVE_SHARDS = fs.existsSync(path.join(SHARDS, 'manifest.json'));

// ───────────────────────────── matching ─────────────────────────────

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
/** The text a meaning keyword is looked for in: the gloss and the notes, but not the notes that name OTHER entries or the reason of a move. */
function meaningText(c: AnalysisCandidate, undecided: boolean): string {
  const n = { ...(c.notes ?? {}) } as Record<string, unknown>;
  for (const k of ['otherEntries', 'context', 'credit', 'koPos', 'koClass', 'stem']) delete n[k];
  if (!undecided) delete n.homonyms;
  return `${c.gloss ?? ''} ${Object.values(n).map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(' ')}`;
}
function matchOne(c: AnalysisCandidate | undefined, w: One): boolean {
  if (!c || c.unconfirmed || !c.lemma) return false;
  if (koBareLemma(c.lemma) !== w.lemma || c.pos !== w.pos) return false;
  const und = c.notes?.homonym === 'undecided';
  if (!!w.undecided !== und) return false;
  const kws = Array.isArray(w.means) ? w.means : [w.means];
  const text = meaningText(c, !!w.undecided);
  return kws.some((k) => new RegExp(`(?<![a-z])${esc(k)}(?:s|es)?(?![a-z])`, 'iu').test(text));
}
const matches = (c: AnalysisCandidate | undefined, w: Want): boolean => ('anyOf' in w ? w.anyOf.some((x) => matchOne(c, x)) : matchOne(c, w));
/** Not right, but undecided: the set's undecided reading of the wanted word first, or the wanted reading creditable beside another first. */
function undecidedFor(top: AnalysisCandidate | undefined, all: AnalysisCandidate[], w: Want): boolean {
  if (!top || matches(top, w)) return false;
  const lemmas = ('anyOf' in w ? w.anyOf : [w]).map((x) => x.lemma);
  if (top.notes?.homonym === 'undecided' && top.lemma && lemmas.includes(koBareLemma(top.lemma))) return true;
  return creditable(top) && all.some((c) => c !== top && creditable(c) && matches(c, w));
}
const showWant = (w: Want): string => ('anyOf' in w ? w.anyOf.map(showWant).join(' or ') : `${w.lemma}/${w.pos}/${[w.means].flat().join(',')}${w.undecided ? '/undecided' : ''}`);
const showGot = (c: AnalysisCandidate | undefined): string => (c ? `${c.lemma}/${c.pos}/${(c.gloss ?? '').slice(0, 40)}${c.notes?.homonym === 'undecided' ? '/undecided' : ''}${c.unconfirmed ? '/unconfirmed' : ''} ${c.confidence}` : '(none)');

function sentenceReading(t: string, at: string): { top?: AnalysisCandidate; second?: AnalysisCandidate; all: AnalysisCandidate[] } {
  const tokens = koAdapter.tokenize(t);
  const out = koAdapter.analyze(tokens);
  const a = out.find((x) => x.token.isWord && x.token.surface === at);
  if (!a) throw new Error(`"${at}" is not a token of "${t}" (tokens: ${tokens.filter((x) => x.isWord).map((x) => x.surface).join(' ')})`);
  return { top: a.candidates[0], second: a.candidates[1], all: a.candidates };
}

// ───────────────────────────── the noun frames ─────────────────────────────

/** Particle ids of the frames, and the sentence each frame writes (the place frame only for common and proper nouns). */
export const FRAMES: ReadonlyArray<{ id: string; particle: string; sentence: (f: string) => string; classes?: readonly string[] }> = [
  { id: 'subject', particle: 'subject', sentence: (f) => `${f} 있어요.` },
  { id: 'object', particle: 'object', sentence: (f) => `${f} 봤어요.` },
  { id: 'topic', particle: 'topic', sentence: (f) => `${f} 좋아요.` },
  { id: 'also', particle: 'also', sentence: (f) => `${f} 있어요.` },
  { id: 'place', particle: 'to', sentence: (f) => `${f} 있어요.`, classes: ['NOUN', 'PROPN'] },
  { id: 'genitive', particle: 'of', sentence: (f) => `${f} 이름을 알아요.` },
  { id: 'only', particle: 'only', sentence: (f) => `${f} 있어요.` },
];
/** The subject forms a pronoun takes in place of pronoun + 가 (내가, not 나가). */
const SUBJECT_FORM: Readonly<Record<string, string>> = { 나: '내가', 저: '제가', 너: '네가', 누구: '누가' };
function hostSound(word: string): 'V' | 'L' | 'C' {
  const last = [...word].pop() ?? '';
  const d = isHangulSyllable(last) ? decompose(last) : undefined;
  if (!d || d.t === 0) return 'V';
  return FINALS[d.t] === 'ㄹ' ? 'L' : 'C';
}
export function nounForm(noun: string, particle: string): string {
  if (particle === 'subject' && SUBJECT_FORM[noun]) return SUBJECT_FORM[noun];
  const p = PARTICLES[particle];
  const f = p.forms.find((x) => koAllomorphAgrees(x.after, hostSound(noun)));
  return noun + (f?.text ?? p.forms[0].text);
}
/** A written form the installed lexicon holds as a headword of its own (a noun, adverb, determiner …; predicates are keyed by stem). */
const isHeadword = (form: string): boolean => lookupKoreanStem(form).some((h) => h.entry.lemma === form);
/** A frame's BARE form that is two-sided (block T's rule): the noun + particle reading and a reading of another, COUNTED word both creditable. */
function frameBareTwoSided(cs: AnalysisCandidate[], noun: string, classes: string[], particle: string): boolean {
  if (!cs[0] || !creditable(cs[0])) return false;
  const nounSide = (c: AnalysisCandidate) => frameOk(c, noun, classes, particle);
  const rival = (c: AnalysisCandidate) => !!c.lemma && koBareLemma(c.lemma) !== noun && !c.unconfirmed && rowCount(c) > 0;
  const cred = cs.filter(creditable);
  return (nounSide(cs[0]) || rival(cs[0])) && cred.some(nounSide) && cred.some(rival);
}
function frameOk(c: AnalysisCandidate | undefined, noun: string, classes: string[], particle: string): boolean {
  if (!c || c.unconfirmed || !c.lemma || koBareLemma(c.lemma) !== noun || !classes.includes(c.pos ?? '')) return false;
  return String(c.morph.Particle ?? '').split('+').includes(particle);
}

// ───────────────────────────── running ─────────────────────────────

// ───────────────────────────── block T: two-sided surfaces ─────────────────────────────
// A written form that is both noun + particle and a predicate form (or a whole listed word). Each sentence names its side; the first
// reading must be that side's word (lemma and part of speech; the noun side also with a particle in its chain; the homonym is not
// checked). The bare token: when two sides each have a word the lexicon counts it decides nothing, and it is right when the first reading
// is not creditable (below 0.5 or unconfirmed) or when the creditable readings hold two sides (one confident side alone is a "confident
// single guess", wrong); when only one side's word is counted (달을: the rival 닫다² is uncounted), that side read confidently is right.
const PRED_POS = new Set(['VERB', 'ADJ', 'AUX']);
const NOM_POS = new Set(['NOUN', 'PRON', 'PROPN', 'NUM', 'CLF', 'ADV']);
const creditable = (c: AnalysisCandidate): boolean => !c.unconfirmed && c.confidence >= 0.5;
/** A nominal reading with a particle in its chain, or with the copula after it (자라 + 이고 → 자라고). */
const hostsParticle = (c: AnalysisCandidate): boolean => !!c.morph.Particle || (c.parts ?? []).some((p) => p.lemma === '이다');
/** The side a reading of the bare surface stands for, by its class: a predicate form, the whole word, or a nominal + particle. */
function sideOf(c: AnalysisCandidate, e: TwoSided): string | undefined {
  if (!c.lemma) return undefined;
  if (PRED_POS.has(c.pos ?? '')) return 'pred';
  if (!NOM_POS.has(c.pos ?? '')) return undefined;
  if (koBareLemma(c.lemma) === e.w) return 'whole';
  return hostsParticle(c) ? 'noun' : undefined;
}
/** The noun side needs the particle in the chain, except where the surface is the noun itself (산 위에, 가게 앞에서, 운전할 줄). */
const tMatch = (c: AnalysisCandidate | undefined, side: string, want: Array<{ lemma: string; pos: string }>, surface: string): boolean =>
  !!c && !c.unconfirmed && !!c.lemma && want.some((w) => w.lemma === koBareLemma(c.lemma!) && w.pos === c.pos) && (side !== 'noun' || koBareLemma(c.lemma) === surface || hostsParticle(c));

/** The count of a reading's own lexicon row (lemma, homonym number; a predicate by its predicate rows); a closed-table word counts as common. */
function rowCount(c: AnalysisCandidate): number {
  if (!c.lemma) return 0;
  if (c.sourceId !== 'kaikki-ko-lexicon') return 1000;
  const bare = koBareLemma(c.lemma);
  const m = /[⁰¹²³⁴-⁹]+$/u.exec(c.lemma);
  const hom = m ? Number([...m[0]].map((ch) => '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(ch)).join('')) : undefined;
  const PT = ['VV', 'VA', 'VX'];
  const hits = PRED_POS.has(c.pos ?? '') ? PT.flatMap((t) => lookupKoreanStem(bare.endsWith('다') ? bare.slice(0, -1) : bare).filter((h) => h.entry.tag === t)) : lookupKoreanStem(bare);
  return Math.max(0, ...hits.map((h) => h.entry).filter((r) => r.lemma === bare && (hom === undefined || r.hom === hom)).map((r) => r.n ?? 0));
}
/** Two-sided, both creditable (the owner's rule: an undecided result counts as fixed): the wanted reading is creditable among the readings
 * and the first reading is a creditable reading of another word. */
const bothCreditable = (all: AnalysisCandidate[], isWanted: (c: AnalysisCandidate) => boolean): boolean =>
  !!all[0] && creditable(all[0]) && !isWanted(all[0]) && all.some((c) => creditable(c) && isWanted(c));
/** The pack's own rule grants these bare forms the predicate alone (the predicate at least four times commoner and the noun counted under 30,
 * or the noun's rows faint): a confident predicate reading of the bare form is the pack's rule, not a fix (table.predicateBare). */
const PRED_BARE = new Set<string>(TABLE.predicateBare ?? []);
const predicateBareOk = (form: string, c: AnalysisCandidate | undefined): boolean => PRED_BARE.has(form) && !!c && creditable(c) && PRED_POS.has(c.pos ?? '');

export interface CheckResult { id: string; kind: 'entry' | 'block' | 'frame' | 'frameSkip' | 'T'; w: string; where: string; want: string; got: string; second: string; context?: string; ok: boolean; und?: boolean }

function runAll(state: 'core' | 'shards'): CheckResult[] {
  const out: CheckResult[] = [];
  const push = (r: Omit<CheckResult, 'id'> & { idBase: string }) => { const { idBase, ...rest } = r; out.push({ id: `${idBase}@${state}`, ...rest }); };
  for (const e of TABLE.twoSided ?? []) {
    const cs = koAnalyzeToken(e.w);
    const sides = new Set(cs.filter(creditable).map((c) => sideOf(c, e) ?? `other:${c.lemma}/${c.pos}`));
    // undecided only when two sides each have a counted word (e.bare, derived from the lexicon counts when the table is built);
    // otherwise the counted side, read confidently, is right
    const expect = (state === 'core' ? e.bareCore ?? e.bare : e.bare) ?? 'undecided';
    const okBare = expect === 'undecided'
      ? !cs[0] || !creditable(cs[0]) || [...sides].filter((s) => !s.startsWith('other')).length >= 2
      : !!cs[0] && creditable(cs[0]) && sideOf(cs[0], e) === expect;
    const okBare2 = okBare || predicateBareOk(e.w, cs[0]);
    push({ idBase: `T|${e.w}|bare`, kind: 'T', w: e.w, where: `${expect === 'undecided' ? 'undecided' : `${expect}-side`} bare`, want: expect, got: showGot(cs[0]), second: showGot(cs[1]), context: [...sides].join(' '), ok: okBare2 });
    e.s.forEach((s, k) => {
      if (state === 'core' && s.shardsOnly) return;
      const r = sentenceReading(s.t, s.at);
      push({ idBase: `T|${e.w}|s${k}`, kind: 'T', w: e.w, where: `${s.side} ${s.t}`, want: s.want.map((w) => `${w.lemma}/${w.pos}`).join(' or '), got: showGot(r.top), second: showGot(r.second), context: r.top?.notes?.context ? String(r.top.notes.context) : undefined, ok: tMatch(r.top, s.side, s.want, s.at) || (!!s.twoSidedOk && bothCreditable(r.all, (c) => tMatch(c, s.side, s.want, s.at))), und: !tMatch(r.top, s.side, s.want, s.at) && bothCreditable(r.all, (c) => tMatch(c, s.side, s.want, s.at)) });
    });
  }
  if (process.env.KO_SWEEP_ONLY === 'T') return out;
  for (const e of TABLE.entries) {
    if (state === 'core' && e.shardsOnly) continue;
    const cs = koAnalyzeToken(e.w);
    push({ idBase: `${e.w}|bare`, kind: 'entry', w: e.w, where: 'bare', want: showWant(e.bare), got: showGot(cs[0]), second: showGot(cs[1]), ok: matches(cs[0], e.bare), und: undecidedFor(cs[0], cs, e.bare) });
    e.s.forEach((s, k) => {
      if (state === 'core' && s.shardsOnly) return;
      const r = sentenceReading(s.t, s.at);
      push({ idBase: `${e.w}|s${k}`, kind: 'entry', w: e.w, where: `${s.t} @${s.at}`, want: showWant(s.want), got: showGot(r.top), second: showGot(r.second), context: r.top?.notes?.context ? String(r.top.notes.context) : undefined, ok: matches(r.top, s.want) || (!!s.twoSidedOk && bothCreditable(r.all, (c) => matches(c, s.want))), und: undecidedFor(r.top, r.all, s.want) });
    });
  }
  for (const b of TABLE.blocks) b.chk.forEach((c) => {
    if (state === 'core' && c.shardsOnly) return;
    const r = sentenceReading(b.t, c.at);
    push({ idBase: `${b.blk}|${b.t}|${c.at}`, kind: 'block', w: c.at, where: `${b.blk}: ${b.t} @${c.at}`, want: showWant(c.want), got: showGot(r.top), second: showGot(r.second), context: r.top?.notes?.context ? String(r.top.notes.context) : undefined, ok: matches(r.top, c.want), und: undecidedFor(r.top, r.all, c.want) });
  });
  for (const [noun, cls, n] of TABLE.frameNouns) {
    const classes = cls.split('+');
    // a noun the compiled core does not hold is unconfirmed with the core alone: it is checked with the shards only
    if (state === 'core' && !isHeadword(noun)) { push({ idBase: `F|${noun}|core-skip`, kind: 'frameSkip', w: noun, where: `${noun} is not in the compiled core`, want: '', got: '', second: '', ok: true }); continue; }
    for (const fr of FRAMES) {
      if (fr.classes && !classes.some((c) => fr.classes!.includes(c))) continue;
      const form = nounForm(noun, fr.particle);
      // the form is itself a headword (시 + 도 = 시도 "attempt", 그 + 만 = 그만): a real ambiguity, not scored; listed apart
      if (isHeadword(form)) { push({ idBase: `F|${noun}|${fr.id}|skip`, kind: 'frameSkip', w: noun, where: `${fr.id} ${form} is a headword`, want: '', got: '', second: '', ok: true }); continue; }
      const want = `${noun}/${cls} + ${fr.particle} (count ${n})`;
      const bare = koAnalyzeToken(form);
      push({ idBase: `F|${noun}|${fr.id}|bare`, kind: 'frame', w: noun, where: `${fr.id} bare ${form}`, want, got: showGot(bare[0]), second: showGot(bare[1]), ok: frameOk(bare[0], noun, classes, fr.particle) || predicateBareOk(form, bare[0]) || frameBareTwoSided(bare, noun, classes, fr.particle), und: !frameOk(bare[0], noun, classes, fr.particle) && frameBareTwoSided(bare, noun, classes, fr.particle) });
      const t = fr.sentence(form);
      const r = sentenceReading(t, form);
      push({ idBase: `F|${noun}|${fr.id}|sent`, kind: 'frame', w: noun, where: `${fr.id} ${t}`, want, got: showGot(r.top), second: showGot(r.second), context: r.top?.notes?.context ? String(r.top.notes.context) : undefined, ok: frameOk(r.top, noun, classes, fr.particle), und: !frameOk(r.top, noun, classes, fr.particle) && r.all.some((c) => creditable(c) && frameOk(c, noun, classes, fr.particle)) && !!r.top && creditable(r.top) });
    }
  }
  return out;
}

function verdict(state: 'core' | 'shards', results: CheckResult[]): void {
  if (process.env.KO_SWEEP_OUT) {
    const f = process.env.KO_SWEEP_OUT.replace(/\.json$/u, `.${state}.json`);
    fs.writeFileSync(f, JSON.stringify(results), 'utf8');
  }
  const known = new Set([...TABLE.known, ...TABLE.frameKnown, ...(TABLE.twoSidedKnown ?? [])]);
  const wrong = results.filter((r) => !r.ok && !known.has(r.id));
  const healed = results.filter((r) => r.ok && known.has(r.id));
  const line = (r: CheckResult) => `${r.w} | ${r.where} | wanted ${r.want} | got ${r.got} | second ${r.second} | ${state}`;
  if (wrong.length) console.log(`WRONG first readings not in "known" (${wrong.length}):\n${wrong.map(line).join('\n')}`);
  if (healed.length) console.log(`"known" failures that now PASS (${healed.length}): remove them from the table:\n${healed.map((r) => r.id).join('\n')}`);
  const fails = results.filter((r) => !r.ok).length;
  console.log(`common words, ${state}: ${results.length} checks, ${fails} wrong (${wrong.length} unexpected, ${healed.length} known now passing)`);
  expect(wrong.map(line)).toEqual([]);
  expect(healed.map((r) => r.id)).toEqual([]);
}

describe('the common-word sweep', () => {
  it('the table is well formed: unique words, every sentence 3 to 7 words, the checked token in its sentence', () => {
    const ws = TABLE.entries.map((e) => e.w);
    expect(ws.length).toBe(new Set(ws).size);
    for (const e of TABLE.entries) for (const s of e.s) {
      const n = s.t.replace(/[.?!,]/gu, ' ').split(/\s+/u).filter(Boolean).length;
      expect(n, s.t).toBeGreaterThanOrEqual(2);
      expect(n, s.t).toBeLessThanOrEqual(7);
    }
  });

  it('with the compiled core alone', () => {
    koClearAnalysisCache();
    verdict('core', runAll('core'));
  }, 900_000);

  it.skipIf(!HAVE_SHARDS)('with the core and every shard', () => {
    for (const f of fs.readdirSync(SHARDS)) if (f.endsWith('.json.gz')) installKoreanLexicon(JSON.parse(gunzipSync(fs.readFileSync(path.join(SHARDS, f))).toString('utf8')) as KoLexicon);
    koClearAnalysisCache();
    verdict('shards', runAll('shards'));
  }, 900_000);
});
