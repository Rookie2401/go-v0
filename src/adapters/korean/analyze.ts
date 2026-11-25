/**
 * Token-local analysis of one 어절 (docs/korean/PLAN.md "Analysis"): candidate stems → lexicon lookup → the stem's junction forms
 * (conjugate.ts) and the ending chain (endings.ts), or a nominal with its particle chain (particles.ts), the copula, a light verb or a
 * fused pronoun form. Readings are ordered by score and given confidences that strictly fall down the list (the card takes the highest).
 *
 * Everything is matched at JAMO level on the key (compound finals split), so a syllable that two morphemes share (갔, 봐, 해, 삽, 간,
 * 셨) is found as such: both parts' spans cover it and both carry morph.Fused=Yes. Spans are offsets into the ORIGINAL surface: an NFD
 * word or a zero-width character inside a word gives spans that index the string the caller passed.
 *
 * Homonyms (PLAN "Identities"): the lemma is always `koEntryLemma(entry)` and the part of speech `koSharedPos(entry)`. In a BALANCED
 * set the members the form allows are counted; one left → its numbered reading; several → first an UNDECIDED reading (bare lemma,
 * confidence 0.80) and then each numbered reading (0.62, 0.61 …). In a set with a MAIN entry, an 'other' entry is a reading only when the
 * main one cannot give the form (or gives it by another analysis); otherwise it is named in `notes.otherEntries`.
 *
 * Sentence-level reordering is not done here (korean/sentence.ts).
 */
import type { AnalysisCandidate, AnalysisOrigin, AnalyzedToken, PartOfSpeech, RawToken, WordPart } from '../../core';
import { VOWELS, isHangulSyllable, koNormalize, originalSpan, scriptOf, syllablesOf } from './hangul';
import {
  type KoLexEntry, KO_PREDICATE_TAGS, koEntryLemma, koHomonymSetKey, koLexiconGeneration, koSharedPos, lookupKoreanStem,
} from './index-store';
import { KO_ANALYZER, KO_SOURCE_IDS } from './version';
import { type KoConjClass, type KoHost, type KoRealization, koRealize, koSeq, koSeqOfText, koShapeClasses, koSyls } from './conjugate';
import { ENDINGS, type KoEnding } from './endings';
import { candidateStems } from './stems';
import { CHAIN_PARTICLES, FUSED, KO_CLOSED_PREDICATES, KO_COPULA, KO_EXISTENTIAL_LEMMAS, PARTICLES, type KoParticle, koAllomorphAgrees, koParticleMayFollow, koResolveFused } from './particles';

// ───────────────────────────── tables ─────────────────────────────

export const KO_CLASS_NAMES: Readonly<Record<string, string>> = {
  NNG: '일반 명사', NNP: '고유 명사', NNB: '의존 명사', NP: '대명사', NR: '수사', VV: '동사', VA: '형용사', VX: '보조 용언',
  VCP: '긍정 지정사', VCN: '부정 지정사', MM: '관형사', MAG: '일반 부사', MAJ: '접속 부사', IC: '감탄사',
  XPN: '접두사', XSN: '명사 파생 접미사', XSV: '동사 파생 접미사', XSA: '형용사 파생 접미사',
};
const IRREGULAR_NOTES: Readonly<Record<string, string>> = {
  D: 'ㄷ-irregular: ㄷ becomes ㄹ before a vowel (듣 → 들어)', B: 'ㅂ-irregular: ㅂ becomes 우 before a vowel (춥 → 추워)',
  S: 'ㅅ-irregular: ㅅ drops before a vowel (짓 → 지어)', H: 'ㅎ-irregular: ㅎ drops (하얗 → 하얀, 하얘)',
  Reu: '르-irregular: 르 becomes ㄹㄹ before 아/어 (모르 → 몰라)', Reo: '러-irregular: 러 instead of 어 (이르 → 이르러)',
  U: '우-irregular: 우 drops before 어 (푸 → 퍼)', Ha: '하다: 하 + 여 → 해 or 하여', L: 'ㄹ drops before ㄴ, ㅂ, ㅅ, 오 and ㄹ (살 → 사는, 삽니다)',
  Eu: 'ㅡ drops before 아/어 (쓰 → 써)',
};
const LIGHT_VERBS: ReadonlyArray<{ lv: string; cls: KoConjClass; voice?: 'Pass' | 'Caus' }> = [
  { lv: '하', cls: 'Ha' }, { lv: '되', cls: 'R', voice: 'Pass' }, { lv: '시키', cls: 'R', voice: 'Caus' }, { lv: '받', cls: 'R', voice: 'Pass' }, { lv: '당하', cls: 'Ha', voice: 'Pass' },
];
const ADJ_LIKE_AUX = new Set(['싶', '듯하', '만하', '법하']);
const VOWEL_SET = new Set(VOWELS);
const CLOSED_TAGS = new Set(['MM', 'MAG', 'NP', 'NR', 'IC', 'MAJ']);
const INVISIBLE = new Set(['­', '​', '‌', '‍', '⁠', '﻿']);
const MAG_PARTICLES = new Set(['also', 'only', 'topic', 'polite', 'until']);
const OVERRIDE_KEYS = new Set(['VerbForm', 'Mood', 'SpeechLevel', 'Connective']);
const CAP = { full: 0.92, assumed: 0.8, nonStandard: 0.6, unknown: 0.45, unknownPred: 0.3, undecided: 0.8, numbered: 0.62 } as const;

type Kind = 'V' | 'A' | 'C' | 'X' | 'P' | 'R' | 'L';
interface St { slot: number; kind: Kind; exist: boolean; hon: boolean; fut: boolean }

interface PartRec {
  js: number; je: number; text: string; lemma: string; pos?: PartOfSpeech; tag: string; role: string; kind: NonNullable<WordPart['kind']>;
  morph?: Record<string, string>; ending?: KoEnding; particle?: KoParticle; kindAt?: Kind; yo?: boolean; light?: 'Pass' | 'Caus' | 'none'; copula?: boolean;
}
interface Tail { hostEnd: number; parts: PartRec[]; violations: number; contracted: boolean; stemShows?: string; copulaDrop: boolean; spacing: boolean }

interface Unit { ch: string; start: number; end: number; j0: number; j1: number }
interface Ctx {
  surface: string; key: string; units: Unit[]; K: string[]; sylOf: number[]; boundary: boolean[];
  memo: Map<string, Tail[]>; pmemo: Map<string, Array<{ parts: PartRec[]; violations: number }>>;
}

// ───────────────────────────── context ─────────────────────────────

function makeCtx(surface: string): Ctx {
  const { key, map } = koNormalize(surface);
  const units: Unit[] = [];
  const K: string[] = [];
  const sylOf: number[] = [];
  let i = 0;
  while (i < key.length) {
    const ch = String.fromCodePoint(key.codePointAt(i)!);
    const [start, end0] = originalSpan(map, i, i + ch.length);
    let end = end0;
    while (end > start + 1 && INVISIBLE.has(surface[end - 1])) end--; // the map covers invisible characters; a span does not end on one
    i += ch.length;
    if (INVISIBLE.has(ch)) continue;
    const seq = koSeqOfText(ch);
    const u: Unit = { ch, start, end, j0: K.length, j1: K.length + seq.length };
    for (const j of seq) { K.push(j); sylOf.push(units.length); }
    units.push(u);
  }
  const boundary = new Array<boolean>(K.length + 1).fill(false);
  for (const u of units) { boundary[u.j0] = true; boundary[u.j1] = true; }
  if (!units.length) boundary[0] = true;
  return { surface, key: units.map((u) => u.ch).join(''), units, K, sylOf, boundary, memo: new Map(), pmemo: new Map() };
}

const matchAt = (c: Ctx, p: number, seq: readonly string[]): boolean => {
  if (p + seq.length > c.K.length) return false;
  for (let i = 0; i < seq.length; i++) if (c.K[p + i] !== seq[i]) return false;
  return c.boundary[p + seq.length];
};
const soundBefore = (c: Ctx, q: number): 'V' | 'L' | 'C' | undefined => {
  if (q <= 0) return undefined;
  const j = c.K[q - 1];
  if (VOWEL_SET.has(j)) return 'V';
  if (j === 'ㄹ') return 'L';
  return isHangulSyllable(c.units[c.sylOf[q - 1]].ch) ? 'C' : undefined;
};
function soundOfWord(w: string): 'V' | 'L' | 'C' | undefined {
  const seq = koSeqOfText(w);
  const j = seq[seq.length - 1];
  if (!j || !isHangulSyllable([...w].pop()!)) return undefined;
  return VOWEL_SET.has(j) ? 'V' : j === 'ㄹ' ? 'L' : 'C';
}

// ───────────────────────────── the ending chain ─────────────────────────────

function predOk(e: KoEnding, st: St): boolean {
  const k = st.kind;
  if (e.tag === 'EP') {
    if (k === 'R' || k === 'L') return false;
    if ((e.slot ?? 0) <= st.slot) return false;
    if (e.id === 'p-pass' && st.slot !== 0) return false;
  }
  let ok = e.pred.includes(k) || (k === 'X' && (e.pred.includes('V') || e.pred.includes('A'))) || (!!e.exist && st.exist && (k === 'A' || k === 'X'));
  if (e.noHon && st.hon) ok = false;
  if (e.noFut && st.fut) ok = false;
  return ok;
}

const hostKey = (h: KoHost): string => (h.kind === 'fixed' ? `F${h.noEu ? 1 : 0}` : `S${h.syls.map((x) => x.l + x.v + x.t).join('.')}|${h.cls}|${h.vowelNoun ? 1 : 0}${h.honSi ? 1 : 0}`);

function parseChain(c: Ctx, p: number, host: KoHost, st: St, depth = 0): Tail[] {
  const mk = `${p}|${hostKey(host)}|${st.slot}|${st.kind}|${st.exist ? 1 : 0}${st.hon ? 1 : 0}${st.fut ? 1 : 0}`;
  const hit = c.memo.get(mk);
  if (hit) return hit;
  const out: Tail[] = [];
  c.memo.set(mk, out);
  if (depth > 6 || p >= c.K.length) return out;
  for (const e of ENDINGS) {
    if (!predOk(e, st)) continue;
    for (const f of e.forms) {
      for (const r of koRealize(host, f)) {
        const syls = e.pending ? r.syls.slice(0, -1) : r.syls;
        const seq = koSeq(syls);
        if (!matchAt(c, p, seq)) continue;
        const q = p + seq.length;
        const stemShows = host.kind === 'stem' && depth === 0 ? r.shows : undefined;
        if (e.tag === 'EP') {
          if (r.copulaDrop) continue;
          const nextHost: KoHost = e.pending ? { kind: 'stem', syls: [r.syls[r.syls.length - 1]], cls: 'R' } : { kind: 'fixed', noEu: e.id === 'p-humble' };
          const nst: St = {
            slot: e.slot ?? st.slot,
            kind: e.id === 'p-past' || e.id === 'p-pqp' || e.id === 'p-fut' || e.id === 'p-must' ? 'P' : e.id === 'p-retro' ? 'R' : e.id === 'p-humble' ? 'L' : e.id === 'p-pass' ? 'V' : st.kind,
            exist: st.exist, hon: st.hon || e.id === 'p-hon', fut: st.fut || e.id === 'p-fut' || e.id === 'p-must',
          };
          for (const t of parseChain(c, q, nextHost, nst, depth + 1)) {
            const part = endingPart(e, r, p + r.endStart, e.pending ? t.hostEnd : q, st.kind);
            out.push({ hostEnd: p + r.hostEnd, parts: [part, ...t.parts], violations: t.violations, contracted: t.contracted || !!r.contracted, stemShows: stemShows ?? t.stemShows, copulaDrop: t.copulaDrop || !!r.copulaDrop, spacing: t.spacing });
          }
        } else {
          if (r.copulaDrop && e.morph.Honorific) continue;
          const part = endingPart(e, r, p + r.endStart, q, st.kind);
          for (const k of afterFinal(c, q, e)) {
            out.push({ hostEnd: p + r.hostEnd, parts: [part, ...k.parts], violations: k.violations, contracted: !!r.contracted, stemShows, copulaDrop: !!r.copulaDrop, spacing: k.spacing });
          }
        }
        if (out.length > 24) return out;
      }
    }
  }
  return out;
}

function endingPart(e: KoEnding, r: KoRealization, js: number, je: number, kindAt: Kind): PartRec {
  return { js, je, text: `-${r.label}${e.tag === 'EP' ? '-' : ''}`, lemma: e.cite, pos: 'PART', tag: e.tag, role: e.role, kind: 'suffix', ending: e, kindAt, morph: { ...e.morph } };
}

function yoPart(js: number, je: number): PartRec {
  const p = PARTICLES.polite;
  return { js, je, text: '요', lemma: p.family, pos: 'ADP', tag: p.tag, role: p.role, kind: 'suffix', particle: p, yo: true };
}

function afterFinal(c: Ctx, q: number, e: KoEnding): Array<{ parts: PartRec[]; violations: number; spacing: boolean }> {
  const out: Array<{ parts: PartRec[]; violations: number; spacing: boolean }> = [];
  if (q === c.K.length) { out.push({ parts: [], violations: 0, spacing: false }); return out; }
  if (e.yo) {
    const yo = koSeqOfText('요');
    if (matchAt(c, q, yo) && q + yo.length === c.K.length) out.push({ parts: [yoPart(q, q + yo.length)], violations: 0, spacing: false });
  }
  if (e.after === 'nominal') {
    for (const t of nounCont(c, q, { allowCopula: true })) out.push({ parts: t.parts, violations: t.violations, spacing: false });
  } else if (e.after) {
    for (const id of e.after) {
      const pt = PARTICLES[id];
      for (const f of pt.forms) {
        const seq = koSeqOfText(f.text);
        if (matchAt(c, q, seq) && q + seq.length === c.K.length) {
          const s = soundBefore(c, q);
          const v = s && !koAllomorphAgrees(f.after, s) ? 1 : 0;
          out.push({ parts: [particlePart(pt, f.text, q, q + seq.length, v > 0)], violations: v, spacing: false });
        }
      }
    }
  }
  if (e.tag === 'ETM') {
    // an adnominal and a bound noun written together (할수, 먹을것을): allowed, at the confidence of a spacing the standard does not allow
    const u0 = c.sylOf[q];
    for (let n = 1; n <= 3 && u0 + n <= c.units.length; n++) {
      const s = c.units.slice(u0, u0 + n).map((u) => u.ch).join('');
      for (const hit of lookupKoreanStem(s)) {
        if (hit.entry.tag !== 'NNB') continue;
        const q2 = c.units[u0 + n - 1].j1;
        const head: PartRec = { js: q, je: q2, text: s, lemma: koEntryLemma(hit.entry), pos: koSharedPos(hit.entry), tag: 'NNB', role: hit.entry.gloss ?? 'bound noun', kind: 'component' };
        for (const t of nounCont(c, q2, { soundOverride: undefined, allowCopula: true })) out.push({ parts: [head, ...t.parts], violations: t.violations, spacing: true });
      }
    }
  }
  return out;
}

// ───────────────────────────── particles and nominals ─────────────────────────────

function particlePart(pt: KoParticle, text: string, js: number, je: number, violation: boolean): PartRec {
  return {
    js, je, text, lemma: pt.family, pos: pt.cls === 'plural' ? 'PART' : 'ADP', tag: pt.tag, role: violation ? `${pt.role} (non-standard form after this host)` : pt.role,
    kind: 'suffix', particle: pt, morph: { ...pt.morph },
  };
}

function parseParticles(c: Ctx, q: number, prev: KoParticle | undefined, sound: 'V' | 'L' | 'C' | undefined, depth = 0): Array<{ parts: PartRec[]; violations: number }> {
  const mk = `${q}|${prev?.id ?? ''}|${sound ?? ''}`;
  const hit = c.pmemo.get(mk);
  if (hit) return hit;
  const out: Array<{ parts: PartRec[]; violations: number }> = [];
  c.pmemo.set(mk, out);
  if (depth > 4 || q >= c.K.length) return out;
  for (const pt of CHAIN_PARTICLES) {
    if (!koParticleMayFollow(prev, pt)) continue;
    for (const f of pt.forms) {
      const seq = koSeqOfText(f.text);
      if (!matchAt(c, q, seq)) continue;
      const q2 = q + seq.length;
      const v = sound && !koAllomorphAgrees(f.after, sound) ? 1 : 0;
      const part = particlePart(pt, f.text, q, q2, v > 0);
      if (q2 === c.K.length) out.push({ parts: [part], violations: v });
      else for (const t of parseParticles(c, q2, pt, soundBefore(c, q2), depth + 1)) out.push({ parts: [part, ...t.parts], violations: v + t.violations });
    }
  }
  return out;
}

interface NounOpts { soundOverride?: 'V' | 'L' | 'C'; allowCopula: boolean; allowXSN?: string; lightNoun?: string; magOnly?: boolean }
/** Derivational noun suffixes productive enough to be read as a split (선생 + 님, 김 + 씨, 문화 + 적); any other lexicon suffix is not offered as a split. */
const PRODUCTIVE_XSN = new Set(['님', '씨', '적', '화', '성', '짜리', '째', '씩', '쯤', '별', '용', '꾼', '측', '상', '간', '분', '께서', '네', '님들']);

/** What may follow a nominal at q: nothing, a derivational suffix, a particle chain, the copula with its endings, or a light verb. */
function nounCont(c: Ctx, q: number, o: NounOpts): Tail[] {
  const out: Tail[] = [];
  const blank = (parts: PartRec[], violations = 0): Tail => ({ hostEnd: q, parts, violations, contracted: false, copulaDrop: false, spacing: false });
  if (q === c.K.length) { out.push(blank([])); return out; }
  const sound = o.soundOverride ?? soundBefore(c, q);
  for (const ch of parseParticles(c, q, undefined, sound)) {
    if (o.magOnly && !ch.parts.every((x) => x.particle && MAG_PARTICLES.has(x.particle.id))) continue;
    out.push(blank(ch.parts, ch.violations));
  }
  if (o.magOnly) return out;
  if (o.allowXSN) {
    const u0 = c.sylOf[q];
    for (let n = 1; n <= 2 && u0 + n <= c.units.length; n++) {
      const s = c.units.slice(u0, u0 + n).map((u) => u.ch).join('');
      for (const hit of lookupKoreanStem(s)) {
        if (hit.entry.tag !== 'XSN' || !PRODUCTIVE_XSN.has(s)) continue;
        if (lookupKoreanStem(o.allowXSN + s).some((h) => !KO_PREDICATE_TAGS.has(h.entry.tag))) continue; // the whole is a headword: no split
        const q2 = c.units[u0 + n - 1].j1;
        const part: PartRec = { js: q, je: q2, text: s, lemma: hit.entry.lemma, pos: 'PART', tag: 'XSN', role: hit.entry.gloss ?? 'noun suffix', kind: 'suffix' };
        for (const t of nounCont(c, q2, { allowCopula: o.allowCopula })) out.push({ ...t, parts: [part, ...t.parts] });
      }
    }
  }
  if (o.allowCopula) {
    const host: KoHost = { kind: 'stem', syls: koSyls('이')!, cls: 'Cop', vowelNoun: sound === 'V' };
    for (const t of parseChain(c, q, host, { slot: 0, kind: 'C', exist: false, hon: false, fut: false })) {
      const cop: PartRec = { js: q, je: t.hostEnd, text: '이', lemma: KO_COPULA.lemma, pos: 'AUX', tag: 'VCP', role: t.copulaDrop ? 'copula 이다 (is), its 이 left out after a vowel' : 'copula 이다 (is)', kind: 'clitic', copula: true };
      out.push({ ...t, parts: [cop, ...t.parts] });
    }
  }
  if (o.lightNoun) {
    for (const { lv, cls, voice } of LIGHT_VERBS) {
      if (lookupKoreanStem(o.lightNoun + lv).some((h) => KO_PREDICATE_TAGS.has(h.entry.tag))) continue; // the dictionary's own …하다 headword reads it
      const syls = koSyls(lv)!;
      if (c.K[q] !== syls[0].l) continue;
      for (const t of parseChain(c, q, { kind: 'stem', syls, cls }, { slot: 0, kind: 'V', exist: false, hon: false, fut: false })) {
        const part: PartRec = { js: q, je: t.hostEnd, text: lv, lemma: lv + '다', pos: 'VERB', tag: 'XSV', role: voice === 'Pass' ? `${lv}다: makes a passive verb of the noun` : voice === 'Caus' ? `${lv}다: makes a causative verb of the noun` : `${lv}다: makes a verb of the noun`, kind: 'suffix', light: voice ?? 'none' };
        out.push({ ...t, parts: [part, ...t.parts] });
      }
    }
  }
  return out;
}

// ───────────────────────────── readings ─────────────────────────────

interface Reading {
  entry?: KoLexEntry; lemma: string; pos?: PartOfSpeech; gloss?: string; parts: PartRec[]; stemKey: string; stemTag: string;
  baseKind?: Kind; cap: number; score: number; unconfirmed?: boolean; sourceId: string; origin: AnalysisOrigin;
  notes: Record<string, string | string[]>; remarks: string[]; contracted: boolean; stemShows?: string; extra: Record<string, string>; order: number;
}

const kindOfTag = (tag: string): Kind => (tag === 'VA' ? 'A' : tag === 'VX' ? 'X' : tag === 'VCP' || tag === 'VCN' ? 'C' : 'V');
const isExist = (stem: string): boolean => /[있없밌]$/u.test(stem) || stem === '계시';

let orderSeq = 0;
function baseScore(entry: KoLexEntry | undefined, stemSyl: number, nMorph: number, violations: number): number {
  return Math.log10(1 + (entry?.n ?? 0)) + 0.3 * stemSyl - 0.35 * nMorph + (violations ? 0 : 0.5);
}

function predicateReadings(c: Ctx, stem: string, entry: KoLexEntry, sourceId: string, origin: AnalysisOrigin, ctx: { prevIsLatinOrDigit?: boolean }, closed: boolean): Reading[] {
  const syls = koSyls(stem);
  if (!syls) return [];
  const out: Reading[] = [];
  const tag = entry.tag;
  const kind = kindOfTag(tag);
  const exist = isExist(stem);
  let classes: KoConjClass[];
  let assumed = false;
  if (tag === 'VCP') classes = ['Cop'];
  else if (tag === 'VCN') classes = ['Neg'];
  else if (entry.irr) classes = [entry.irr];
  else if (stem.endsWith('하')) classes = ['Ha'];
  else {
    const shapes = koShapeClasses(stem);
    classes = ['R', ...shapes];
    assumed = shapes.length > 0;
  }
  const standaloneCopula = tag === 'VCP';
  for (const cls of classes) {
    // a verb that is itself honorific and ends in that 시 (계시다, 주무시다, 시장하시다): 시 + 어요 → 세요
    const honSi = stem.endsWith('시') && /honorific/iu.test(entry.gloss ?? '');
    const host: KoHost = { kind: 'stem', syls, cls, vowelNoun: standaloneCopula ? !!ctx.prevIsLatinOrDigit : undefined, honSi };
    for (const t of parseChain(c, 0, host, { slot: 0, kind, exist, hon: false, fut: false })) {
      const lemma = koEntryLemma(entry);
      const pos = koSharedPos(entry);
      const parts: PartRec[] = [];
      let split = false;
      // a …하다 / …되다 headword whose noun the lexicon holds: 공부 + 하
      for (const { lv } of LIGHT_VERBS) {
        if (stem.length > lv.length && stem.endsWith(lv) && !closed) {
          const noun = stem.slice(0, -lv.length);
          const nh = lookupKoreanStem(noun).find((h) => h.entry.tag === 'NNG');
          if (nh) {
            const nEnd = c.units[[...noun].length - 1]?.j1 ?? 0;
            if (nEnd <= t.hostEnd) {
              parts.push({ js: 0, je: nEnd, text: noun, lemma: koEntryLemma(nh.entry), pos: koSharedPos(nh.entry), tag: nh.entry.tag, role: nh.entry.gloss ?? 'noun', kind: 'stem' });
              parts.push({ js: nEnd, je: t.hostEnd, text: lv, lemma: lv + '다', pos: 'VERB', tag: 'XSV', role: `verb-forming ${lv}다`, kind: 'suffix' });
              split = true;
            }
          }
          break;
        }
      }
      if (!split) parts.push({ js: 0, je: t.hostEnd, text: stem, lemma, pos, tag, role: 'stem', kind: 'stem' });
      parts.push(...t.parts);
      const remarks: string[] = [];
      let cap: number = t.violations ? CAP.nonStandard : CAP.full;
      if (assumed) { cap = Math.min(cap, CAP.assumed); remarks.push(cls === 'R' ? `the source gives no conjugation table: read as regular (the stem could also be ${koShapeClasses(stem).join(' or ')}-irregular)` : `the source gives no conjugation table: read as ${IRREGULAR_NOTES[cls] ?? cls}`); }
      if (t.spacing) { cap = Math.min(cap, CAP.nonStandard); remarks.push('an adnominal and a bound noun written as one word (standard spacing writes them apart)'); }
      let score = baseScore(entry, [...stem].length, t.parts.length + 1, t.violations);
      if (tag === 'VX') score -= 1.5;
      if (t.parts.some((x) => x.ending?.id === 'p-pass')) score -= 0.5;
      if (standaloneCopula) { if (ctx.prevIsLatinOrDigit) score += 3; else { cap = Math.min(cap, CAP.nonStandard); score -= 1; remarks.push('the copula written apart from its noun'); } }
      out.push({
        entry, lemma, pos, gloss: entry.gloss, parts, stemKey: stem, stemTag: tag, baseKind: kind, cap, score, sourceId, origin,
        notes: {}, remarks, contracted: t.contracted, stemShows: t.stemShows, extra: {}, order: orderSeq++,
      });
    }
  }
  return out;
}

function nominalReadings(c: Ctx, prefixUnits: number, stemKey: string, entry: KoLexEntry, sourceId: string, origin: AnalysisOrigin): Reading[] {
  const q = c.units[prefixUnits - 1].j1;
  const tag = entry.tag;
  if (tag.startsWith('X')) return [];
  const isHanja = !isHangulSyllable(stemKey[0]);
  const soundOverride = isHanja ? soundOfWord(entry.lemma) : undefined;
  let conts: Tail[];
  if (tag === 'MM' || tag === 'IC' || tag === 'MAJ') conts = q === c.K.length ? [{ hostEnd: q, parts: [], violations: 0, contracted: false, copulaDrop: false, spacing: false }] : [];
  else if (tag === 'MAG') conts = nounCont(c, q, { allowCopula: false, magOnly: true, soundOverride });
  else conts = nounCont(c, q, { allowCopula: true, allowXSN: isHanja ? undefined : stemKey, lightNoun: tag === 'NNG' && !isHanja ? stemKey : undefined, soundOverride });
  const out: Reading[] = [];
  const lemma = koEntryLemma(entry);
  const pos = koSharedPos(entry);
  for (const t of conts) {
    const parts: PartRec[] = [{ js: 0, je: q, text: stemKey, lemma, pos, tag, role: 'stem', kind: 'stem' }, ...t.parts];
    const remarks: string[] = [];
    let cap: number = t.violations ? CAP.nonStandard : CAP.full;
    if (t.parts.some((x) => x.particle?.cls === 'voc') && prefixUnits === 1) cap = Math.min(cap, CAP.nonStandard);
    if (t.violations) remarks.push('a particle form that does not agree with the final sound of the word before it');
    const light = t.parts.find((x) => x.light);
    if (t.spacing) cap = Math.min(cap, CAP.nonStandard);
    let score = baseScore(entry, prefixUnits, t.parts.length + 1, t.violations);
    if (t.copulaDrop) score -= 0.2;
    const notes: Record<string, string | string[]> = isHanja ? { hanja: stemKey } : {};
    if (!t.parts.length && CLOSED_TAGS.has(tag)) { score += 0.6; notes.context = 'a closed-class word written alone: commoner than a predicate form of the same spelling'; }
    if (light) {
      // noun + 하다 / 되다 / 받다 / 당하다 / 시키다 the dictionary does not list: the derived verb, both parts from the lexicon
      const derived = entry.lemma + light.lemma;
      const dEntry: KoLexEntry = { lemma: derived, tag: 'VV', n: entry.n };
      out.push({
        entry: dEntry, lemma: derived, pos: 'VERB', parts, stemKey: stemKey + light.text, stemTag: 'VV', baseKind: 'V', cap, score: score - 0.3, sourceId, origin,
        notes: { ...notes, derived: `${entry.lemma} + ${light.lemma}` }, remarks, contracted: t.contracted, extra: {}, order: orderSeq++,
      });
      continue;
    }
    const r: Reading = {
      entry, lemma, pos, gloss: entry.gloss, parts, stemKey, stemTag: tag, baseKind: t.parts.some((x) => x.copula) ? 'C' : undefined, cap, score, sourceId, origin,
      notes, remarks, contracted: t.contracted, extra: {}, order: orderSeq++,
    };
    out.push(r);
  }
  return out;
}

function fusedReadings(c: Ctx): Reading[] {
  const out: Reading[] = [];
  const key = c.key;
  const withYo = key.endsWith('요') && FUSED[key.slice(0, -1)] ? key.slice(0, -1) : undefined;
  const form = FUSED[key] ? key : withYo;
  if (!form) return out;
  const f = FUSED[form];
  const pt = PARTICLES[f.particle];
  const resolved = koResolveFused(f, lookupKoreanStem);
  const any = lookupKoreanStem(f.pron).some((h) => h.entry.lemma === f.pron && h.entry.tag === f.tag);
  if (!resolved && any) return out; // the lexicon has the word but no entry with this meaning: never guess a homonym
  const lexHit = resolved;
  const entry: KoLexEntry = resolved ?? { lemma: f.pron, tag: 'NP' };
  const span = (a: number, b: number): [number, number] => [c.units[a].j0, c.units[b - 1].j1];
  const [p0, p1] = span(f.pronSpan[0], f.pronSpan[1]);
  const [q0, q1] = span(f.partSpan[0], f.partSpan[1]);
  const parts: PartRec[] = [
    { js: p0, je: p1, text: f.pron, lemma: koEntryLemma(entry), pos: koSharedPos(entry) ?? 'PRON', tag: entry.tag, role: 'stem', kind: 'stem', morph: { Contracted: 'Yes' } },
    { ...particlePart(pt, f.text, q0, q1, false), morph: { ...pt.morph, Contracted: 'Yes' } },
  ];
  if (withYo) { const j = c.units[c.units.length - 1]; parts.push(yoPart(j.j0, j.j1)); }
  out.push({
    entry, lemma: koEntryLemma(entry), pos: koSharedPos(entry) ?? 'PRON', gloss: entry.gloss, parts, stemKey: f.pron, stemTag: entry.tag, cap: CAP.full,
    score: baseScore(entry, 1, parts.length, 0) + 2, sourceId: lexHit ? KO_SOURCE_IDS.lexicon : KO_SOURCE_IDS.closed, origin: lexHit ? 'dictionary' : 'hand',
    notes: { fused: `${form} = ${f.pron} + ${pt.family}` }, remarks: [], contracted: true, extra: {}, order: orderSeq++,
  });
  return out;
}

function particleOnlyReadings(c: Ctx, ctx: { prevKey?: string; prevIsLatinOrDigit?: boolean }): Reading[] {
  const sound = !ctx.prevIsLatinOrDigit && ctx.prevKey ? soundOfWord(ctx.prevKey) : undefined;
  const out: Reading[] = [];
  for (const ch of parseParticles(c, 0, undefined, sound)) {
    const first = ch.parts[0].particle!;
    if (first.cls === 'plural') continue;
    const after = !!ctx.prevIsLatinOrDigit;
    out.push({
      lemma: first.family, pos: 'ADP', parts: ch.parts, stemKey: '', stemTag: first.tag,
      cap: after && !ch.violations ? CAP.full : CAP.nonStandard, score: (after ? 8 : -2) - 0.35 * ch.parts.length,
      sourceId: KO_SOURCE_IDS.closed, origin: 'hand', notes: { host: 'the token before' },
      remarks: after ? [] : ['a particle written apart from the word it belongs to'], contracted: false, extra: {}, order: orderSeq++,
    });
  }
  return out;
}

function unknownReadings(c: Ctx): Reading[] {
  const out: Reading[] = [];
  // 1. an unknown nominal and a licensed chain after it (the shortest stem whose rest is a chain)
  for (let i = 1; i < c.units.length && out.length < 2; i++) {
    const q = c.units[i - 1].j1;
    const stemKey = c.units.slice(0, i).map((u) => u.ch).join('');
    const conts = nounCont(c, q, { allowCopula: true });
    if (!conts.length) continue;
    const t = conts.sort((a, b) => a.violations - b.violations || a.parts.length - b.parts.length)[0];
    out.push({
      lemma: stemKey, pos: 'NOUN', parts: [{ js: 0, je: q, text: stemKey, lemma: stemKey, pos: 'NOUN', tag: 'NNG', role: 'stem (not in the lexicon)', kind: 'stem' }, ...t.parts],
      stemKey, stemTag: 'NNG', baseKind: t.parts.some((x) => x.copula) ? 'C' : undefined, cap: CAP.unknown - 0.01 * out.length, score: -10 - i, unconfirmed: true,
      sourceId: KO_SOURCE_IDS.rules, origin: 'rule', notes: { source: 'rule' }, remarks: ['the word is not in the lexicon: only the particles or endings after it are explained'], contracted: false, extra: {}, order: orderSeq++,
    });
    break;
  }
  if (!out.length && c.units.length) {
    out.push({
      lemma: c.key, pos: 'X', parts: [], stemKey: c.key, stemTag: '', cap: CAP.unknown, score: -20, unconfirmed: true, sourceId: KO_SOURCE_IDS.rules, origin: 'rule',
      notes: { source: 'rule' }, remarks: ['the word is not in the lexicon'], contracted: false, extra: {}, order: orderSeq++,
    });
  }
  return out;
}


/**
 * Nonstandard spacing: a token no single analysis explains, read as two or three known words written together (먹을수있어요 = 먹을 + 수 +
 * 있어요). Every piece must have a confident reading of its own; the first piece's lemma is the reading's, every piece is in the parts.
 */
function spacingReadings(c: Ctx): Reading[] {
  if (c.units.length < 2 || c.units.length > 12) return [];
  const sub = (a: number, b: number) => c.surface.slice(c.units[a].start, c.units[b - 1].end);
  const best = (a: number, b: number): AnalysisCandidate | undefined => {
    const all = koAnalyzeToken(sub(a, b));
    if (b - a === 1) return all.find((x) => !x.unconfirmed && String(x.notes?.koPos ?? '').startsWith('NNB'));
    const r = all[0];
    return r && !r.unconfirmed && r.pos !== 'ADP' && r.confidence >= 0.8 ? r : undefined;
  };
  const splits = (a: number, depth: number): Array<Array<{ a: number; b: number; r: AnalysisCandidate }>> => {
    const out: Array<Array<{ a: number; b: number; r: AnalysisCandidate }>> = [];
    if (depth > 3) return out;
    for (let b = c.units.length; b > a; b--) {
      if (a === 0 && b === c.units.length) continue;
      const r = best(a, b);
      if (!r) continue;
      if (b === c.units.length) out.push([{ a, b, r }]);
      else for (const rest of splits(b, depth + 1)) out.push([{ a, b, r }, ...rest]);
      if (out.length) break;
    }
    return out;
  };
  const found = splits(0, 1)[0];
  if (!found || found.length < 2) return [];
  const parts: PartRec[] = [];
  for (const piece of found) {
    const off = c.units[piece.a].start;
    const tags = String(piece.r.notes?.koPos ?? '').split('+');
    for (const [wi, wp] of (piece.r.parts ?? [{ text: sub(piece.a, piece.b), start: 0, end: sub(piece.a, piece.b).length, lemma: piece.r.lemma, pos: piece.r.pos, role: 'word', kind: 'stem' as const }]).entries()) {
      const start = off + wp.start, end = off + wp.end;
      const u0 = c.units.findIndex((u) => u.start >= start), u1 = c.units.reduce((x, u, i) => (u.end <= end ? i : x), u0);
      parts.push({ js: c.units[u0].j0, je: c.units[Math.max(u0, u1)].j1, text: wp.text, lemma: wp.lemma ?? wp.text, pos: wp.pos, tag: tags[wi] ?? '', role: wp.role ?? '', kind: wp.kind === 'stem' ? 'component' : (wp.kind ?? 'suffix'), morph: wp.morph ? { ...wp.morph } : undefined });
    }
  }
  const head = found[0].r;
  return [{
    lemma: head.lemma ?? '', pos: head.pos, gloss: head.gloss, parts, stemKey: '', stemTag: String(head.notes?.koClass ? head.notes.koPos ?? '' : '').split('+')[0], cap: CAP.nonStandard, score: -5,
    sourceId: head.sourceId ?? KO_SOURCE_IDS.lexicon, origin: head.origin ?? 'dictionary', notes: { spacing: 'written without spaces', pieces: found.map((x) => `${x.r.lemma}`).join(' + ') },
    remarks: ['several words written without the spaces the standard puts between them'], contracted: false, extra: { ...head.morph }, order: orderSeq++,
  }];
}

// ───────────────────────────── features ─────────────────────────────

function computeMorph(r: Reading): Record<string, string> {
  const m = new Map<string, Set<string>>();
  const add = (k: string, v: string) => { const s = m.get(k) ?? new Set<string>(); for (const x of v.split(',')) s.add(x); m.set(k, s); };
  const set = (k: string, v: string) => m.set(k, new Set(v.split(',')));
  const stemTag = r.stemTag;
  if (stemTag === 'VA') add('VerbType', r.sourceId === KO_SOURCE_IDS.closed && r.entry && KO_EXISTENTIAL_LEMMAS.has(r.entry.lemma) ? 'Exist' : 'Descriptive');
  if (stemTag === 'VCP') { add('VerbType', 'Cop'); add('Polarity', 'Pos'); }
  if (stemTag === 'VCN') { add('VerbType', 'Cop'); add('Polarity', 'Neg'); }
  if (stemTag === 'NNB') add('NounType', r.entry?.clf ? 'Clf' : 'Bound');
  if (r.entry?.voice) add('Voice', r.entry.voice);
  const pids: string[] = [];
  let lit = false, lastEnding: PartRec | undefined;
  for (const p of r.parts) {
    if (p.copula) { add('VerbType', 'Cop'); add('Polarity', 'Pos'); }
    if (p.light && p.light !== 'none') add('Voice', p.light);
    if (p.ending) {
      const e = p.ending;
      if (e.tag !== 'EP') lastEnding = p;
      if (e.lit) lit = true;
      if (e.id === 'p-pass' && r.baseKind !== 'A') add('Voice', 'Pass');
      for (const [k, v] of Object.entries(e.morph)) (OVERRIDE_KEYS.has(k) ? set : add)(k, v);
      if (e.id === 'adn-n') {
        const k = p.kindAt;
        const verbish = k === 'V' || (k === 'X' && !ADJ_LIKE_AUX.has(r.stemKey));
        add('Tense', verbish ? 'Past' : 'Pres');
      }
    } else if (p.particle) {
      if (p.yo && lastEnding) { set('SpeechLevel', 'Haeyo'); set('VerbForm', 'Fin'); continue; }
      if (p.yo && !lastEnding && r.parts[0]?.kind === 'stem') set('SpeechLevel', 'Haeyo');
      pids.push(p.particle.id);
      for (const [k, v] of Object.entries(p.particle.morph)) add(k, v);
    }
  }
  if (lit) set('SpeechLevel', 'Lit');
  if (pids.length) set('Particle', pids.join('+'));
  if (r.stemShows) add('Irregular', r.stemShows);
  if (r.contracted) add('Contracted', 'Yes');
  for (const [k, v] of Object.entries(r.extra)) set(k, v);
  const out: Record<string, string> = {};
  for (const [k, s] of [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const vals = [...s].filter(Boolean);
    if (vals.length) out[k] = k === 'Particle' ? vals.join('+') : vals.sort().join(',');
  }
  return out;
}

// ───────────────────────────── homonyms ─────────────────────────────

const sig = (r: Reading): string => r.parts.slice(1).map((p) => `${p.ending?.id ?? p.particle?.id ?? p.lemma}:${p.text}:${p.js}:${p.je}`).join('|') + `#${r.parts[0]?.je ?? 0}`;

function resolveHomonyms(readings: Reading[]): Reading[] {
  const groups = new Map<string, Reading[]>();
  const rest: Reading[] = [];
  for (const r of readings) {
    if (r.entry?.set && r.entry.hom) {
      const k = koHomonymSetKey(r.entry);
      groups.set(k, [...(groups.get(k) ?? []), r]);
    } else rest.push(r);
  }
  const out = [...rest];
  for (const g of groups.values()) {
    const mains = g.filter((r) => r.entry!.set === 'main');
    const others = g.filter((r) => r.entry!.set === 'other');
    const balanced = g.filter((r) => r.entry!.set === 'balanced');
    if (mains.length || others.length) {
      if (mains.length) {
        const mainSigs = new Set(mains.map(sig));
        const proven = others.filter((r) => !mainSigs.has(sig(r)));
        const listed = new Map<string, KoLexEntry>();
        for (const r of others) if (!proven.includes(r)) listed.set(koEntryLemma(r.entry!), r.entry!);
        for (const h of lookupKoreanStem(mains[0].stemKey)) if (h.entry.set === 'other' && koHomonymSetKey(h.entry) === koHomonymSetKey(mains[0].entry!)) listed.set(koEntryLemma(h.entry), h.entry);
        for (const m of mains) if (listed.size) m.notes.otherEntries = [...listed.values()].map((e) => `${koEntryLemma(e)}${e.hanja ? ' ' + e.hanja : ''}`).join('; ');
        out.push(...mains, ...proven.map((r) => ({ ...r, score: r.score - 0.5 })));
      } else out.push(...others);
    }
    if (balanced.length) {
      // which members license THIS analysis of the form: one → its numbered reading; several → the undecided reading, then each numbered
      const bySig = new Map<string, Reading[]>();
      for (const r of balanced) bySig.set(sig(r), [...(bySig.get(sig(r)) ?? []), r]);
      for (const rs of bySig.values()) {
        const entries: KoLexEntry[] = [];
        for (const r of rs) if (!entries.some((e) => e.hom === r.entry!.hom)) entries.push(r.entry!);
        if (entries.length === 1) { out.push(...rs); continue; }
        const byNumber = [...entries].sort((a, b) => (a.hom ?? 0) - (b.hom ?? 0));
        const best = rs.reduce((a, b) => (b.score > a.score ? b : a));
        out.push({
          ...best, lemma: best.entry!.lemma, gloss: byNumber.map((e) => e.gloss ?? '?').join(' / '), entry: { ...best.entry!, set: undefined, hom: undefined },
          cap: best.cap, score: best.score + 0.01, order: orderSeq++,
          notes: { ...best.notes, homonym: 'undecided', homonyms: byNumber.map((e) => `${koEntryLemma(e)} ${e.gloss ?? ''}`.trim()).join(' | ') },
          parts: best.parts.map((p, i) => (i === 0 && p.kind === 'stem' ? { ...p, lemma: best.entry!.lemma } : p)),
        });
        // numbered readings, in the lexicon's order (count, then number)
        for (const r of rs) { const idx = entries.findIndex((e) => e.hom === r.entry!.hom); out.push({ ...r, cap: Math.min(r.cap, CAP.numbered - 0.01 * idx), score: r.score - 100 }); }
      }
    }
  }
  return out;
}

// ───────────────────────────── confidence and output ─────────────────────────────

function finish(c: Ctx, readings: Reading[]): AnalysisCandidate[] {
  // dedupe: the same lemma, class and features: keep the analysis with fewer parts, then the better score
  const best = new Map<string, { r: Reading; morph: Record<string, string> }>();
  for (const r of readings) {
    const morph = computeMorph(r);
    const k = `${r.lemma}|${r.pos ?? ''}|${r.stemTag}|${r.unconfirmed ? 1 : 0}|${JSON.stringify(morph)}|${r.notes.homonym ?? ''}`;
    const prev = best.get(k);
    if (!prev || r.parts.length < prev.r.parts.length || (r.parts.length === prev.r.parts.length && (r.cap > prev.r.cap || (r.cap === prev.r.cap && r.score > prev.r.score)))) best.set(k, { r, morph });
  }
  const list = [...best.values()].sort((a, b) => b.r.cap - a.r.cap || b.r.score - a.r.score || a.r.order - b.r.order).slice(0, 10);
  // confidences: strictly falling; nothing ≥ 0.85 while a different lemma is within 0.15
  const conf = (top: number) => {
    const cs: number[] = [];
    list.forEach((x, i) => { cs.push(i === 0 ? Math.min(x.r.cap, top) : Math.max(0.05, Math.min(x.r.cap, cs[i - 1] - 0.01))); });
    return cs;
  };
  let cs = conf(1);
  if (cs.length > 1 && cs[0] >= 0.85 && list.some((x, i) => i > 0 && (x.r.lemma !== list[0].r.lemma || x.r.pos !== list[0].r.pos) && cs[i] > cs[0] - 0.15)) cs = conf(0.84);
  return list.map(({ r, morph }, i) => toCandidate(c, r, morph, Math.round(cs[i] * 100) / 100));
}

function toCandidate(c: Ctx, r: Reading, morph: Record<string, string>, confidence: number): AnalysisCandidate {
  const spans = r.parts.map((p) => {
    if (p.je <= p.js) {
      const u = c.sylOf[p.js];
      const at = u === undefined ? c.surface.length : c.units[u].start;
      return { u0: -1, u1: -1, start: at, end: at };
    }
    const u0 = c.sylOf[p.js], u1 = c.sylOf[p.je - 1];
    return { u0, u1, start: c.units[u0].start, end: c.units[u1].end };
  });
  const parts: WordPart[] = r.parts.map((p, i) => {
    const s = spans[i];
    const fused = s.u0 >= 0 && spans.some((o, j) => j !== i && o.u0 >= 0 && o.u0 <= s.u1 && s.u0 <= o.u1);
    const pm: Record<string, string> = { ...(p.morph ?? {}) };
    if (fused) pm.Fused = 'Yes';
    return {
      text: p.text, start: s.start, end: s.end, lemma: p.lemma, ...(p.pos ? { pos: p.pos } : {}), ...(Object.keys(pm).length ? { morph: pm } : {}), role: p.role, kind: p.kind,
    };
  });
  const notes: Record<string, string | string[]> = { ...r.notes };
  const tags = r.parts.map((p) => p.tag).filter(Boolean);
  if (tags.length) notes.koPos = tags.join('+');
  if (KO_CLASS_NAMES[r.stemTag]) notes.koClass = KO_CLASS_NAMES[r.stemTag];
  if (r.stemKey) notes.stem = r.stemKey;
  if (r.entry?.hom && r.entry.set !== 'main' && notes.homonym === undefined) notes.homonym = String(r.entry.hom);
  if (morph.Irregular) notes.irregular = IRREGULAR_NOTES[morph.Irregular] ?? morph.Irregular;
  const fin = [...r.parts].reverse().find((p) => p.ending && p.ending.tag !== 'EP');
  if (fin) notes.ending = fin.ending!.cite;
  if (fin?.ending?.moods && !r.parts.some((p) => p.yo && p.js >= fin.je)) {
    const marked = r.parts.some((p) => p.ending && ['p-past', 'p-pqp', 'p-fut', 'p-must'].includes(p.ending.id));
    const descriptive = fin.kindAt === 'A' || fin.kindAt === 'C' || fin.kindAt === 'P' || (fin.kindAt === 'X' && ADJ_LIKE_AUX.has(r.stemKey));
    const moods = fin.ending.moods.filter((m) => !((marked || descriptive) && (m === 'Imp' || m === 'Prop')));
    notes.moods = [...moods];
    notes.sentenceType = koSentenceTypeWords(moods);
  }
  if (r.sourceId === KO_SOURCE_IDS.closed && r.entry && KO_EXISTENTIAL_LEMMAS.has(r.entry.lemma)) notes.honorific = r.entry.lemma === '있다' ? '계시다 (of a person one honours: be), 있으시다 (have)' : '안 계시다 (of a person one honours), 없으시다 (not have)';
  if (r.entry?.glossOwn) notes.glossOwn = 'yes';
  if (r.remarks.length) notes.remark = r.remarks;
  const cand: AnalysisCandidate = {
    lemma: r.lemma, ...(r.pos ? { pos: r.pos } : {}), morph, notes, confidence, ...(r.gloss && !r.unconfirmed ? { gloss: r.gloss } : {}),
    ...(parts.length ? { parts } : {}), origin: r.origin, sourceId: r.sourceId, ...(r.unconfirmed ? { unconfirmed: true } : {}),
  };
  return cand;
}

// ───────────────────────────── sentence type ─────────────────────────────

const MOOD_WORDS: Readonly<Record<string, string>> = { Ind: 'statement', Int: 'question', Imp: 'command', Prop: 'suggestion' };
/** "statement, question, command or suggestion" */
export function koSentenceTypeWords(moods: readonly string[]): string {
  const w = moods.map((m) => MOOD_WORDS[m] ?? m);
  return w.length <= 1 ? (w[0] ?? '') : `${w.slice(0, -1).join(', ')} or ${w[w.length - 1]}`;
}

/**
 * For the sentence layer: a reading whose ending does not decide the sentence type (notes.moods) gets its Mood from the sentence's final
 * punctuation: '?' → Int; '!' or '.' → Ind when a statement is allowed. Returns the Mood set, or undefined when the punctuation does not
 * decide (the reading is left without a Mood). The candidate is changed in place.
 */
export function koMoodFromPunctuation(candidate: AnalysisCandidate, finalPunctuation: string | undefined): string | undefined {
  const moods = candidate.notes?.moods;
  if (!Array.isArray(moods) || !moods.length || candidate.morph.Mood) return undefined;
  const pick = finalPunctuation && /[?？]/u.test(finalPunctuation) ? 'Int' : finalPunctuation && /[.!。！]/u.test(finalPunctuation) ? 'Ind' : undefined;
  if (!pick || !moods.includes(pick)) return undefined;
  candidate.morph.Mood = pick;
  return pick;
}

// ───────────────────────────── public API ─────────────────────────────

const CACHE_MAX = 4000;
const cache = new Map<string, AnalysisCandidate[]>();
let cacheGen = -1;
/** Clears the analysis cache (it also clears itself whenever the installed lexicons change: index-store `koLexiconGeneration`). */
export function koClearAnalysisCache(): void { cache.clear(); }

const clone = (xs: AnalysisCandidate[]): AnalysisCandidate[] => xs.map((x) => structuredClone(x));

/**
 * The readings of one 어절, best first (`key` may be the surface itself: NFD, invisible characters and all; spans index it).
 * `ctx.prevIsLatinOrDigit`: the token before touches this one and is Latin letters or digits (KBS가, 2024년), so a particle-only or
 * copula-only token belongs to it. `ctx.prevKey`: the key of the token before, to check a particle written apart against it.
 */
export function koAnalyzeToken(key: string, ctx: { prevKey?: string; prevIsLatinOrDigit?: boolean } = {}): AnalysisCandidate[] {
  const gen = koLexiconGeneration(); // changes on every install, replacement and removal, so a reinstalled id never serves stale readings
  if (gen !== cacheGen) { cache.clear(); cacheGen = gen; }
  const ck = `${key}\u0000${ctx.prevIsLatinOrDigit ? 1 : 0}\u0000${ctx.prevKey ?? ''}`;
  const hit = cache.get(ck);
  if (hit) { cache.delete(ck); cache.set(ck, hit); return clone(hit); }
  const out = analyzeUncached(key, ctx);
  cache.set(ck, out);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return clone(out);
}

function analyzeUncached(surface: string, ctx: { prevKey?: string; prevIsLatinOrDigit?: boolean }): AnalysisCandidate[] {
  const c = makeCtx(surface);
  if (!c.units.length) return [];
  if (!c.units.some((u) => isHangulSyllable(u.ch) || scriptOf(u.ch) === 'hanja')) return [];
  const readings: Reading[] = [];
  const stems = candidateStems(c.key);
  const seen = new Set<string>();
  for (const s of stems) {
    const plainUnits = c.key.startsWith(s) ? [...s].length : 0;
    const hits = lookupKoreanStem(s);
    for (const h of hits) {
      if (KO_PREDICATE_TAGS.has(h.entry.tag) && KO_EXISTENTIAL_LEMMAS.has(h.entry.lemma)) continue;
      const k = `${s}|${h.entry.lemma}|${h.entry.tag}|${h.entry.hom ?? 0}|${h.entry.clf ? 1 : 0}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (KO_PREDICATE_TAGS.has(h.entry.tag)) readings.push(...predicateReadings(c, s, h.entry, KO_SOURCE_IDS.lexicon, 'dictionary', ctx, false));
      else if (plainUnits && c.units.slice(0, plainUnits).map((u) => u.ch).join('') === s) readings.push(...nominalReadings(c, plainUnits, s, h.entry, KO_SOURCE_IDS.lexicon, 'dictionary'));
    }
    for (const e of KO_CLOSED_PREDICATES.get(s) ?? []) readings.push(...predicateReadings(c, s, e, KO_SOURCE_IDS.closed, 'hand', ctx, true));
  }
  readings.push(...fusedReadings(c));
  const lexical = readings.length > 0;
  readings.push(...particleOnlyReadings(c, ctx));
  if (!lexical && !readings.length) readings.push(...spacingReadings(c));
  if (!readings.length) readings.push(...unknownReadings(c));
  // a noun + derivational suffix split is offered only when nothing reads the token whole
  const hasXsn = (r: Reading) => r.parts.some((x) => x.tag === 'XSN' && !x.particle);
  if (readings.some((r) => !hasXsn(r) && !r.unconfirmed && r.cap >= CAP.assumed)) for (let i = readings.length - 1; i >= 0; i--) if (hasXsn(readings[i])) readings.splice(i, 1);
  if (!readings.length) readings.push(...spacingReadings(c));
  const resolved = resolveHomonyms(readings);
  // an auxiliary reading stands below its main verb (the sentence layer promotes it after -아/어, -고, -지 …)
  for (const r of resolved) if (r.stemTag === 'VX' && resolved.some((o) => o.stemTag !== 'VX' && !o.unconfirmed && (o.entry || o.parts.some((x) => x.particle)))) r.cap = Math.min(r.cap, 0.7);
  return finish(c, resolved);
}

/** Token-local analysis of a token list (sentence-level ordering is korean/sentence.ts's). */
export function koAnalyzeTokens(tokens: RawToken[]): AnalyzedToken[] {
  return tokens.map((token, i) => {
    if (!token.isWord) return { token, candidates: [], analyzer: KO_ANALYZER };
    const prev = i > 0 ? tokens[i - 1] : undefined;
    const touching = !!prev && prev.end === token.start;
    const prevCh = prev ? [...prev.surface].pop() ?? '' : '';
    const prevIsLatinOrDigit = touching && (scriptOf(prevCh) === 'latin' || scriptOf(prevCh) === 'digit');
    const candidates = koAnalyzeToken(token.surface, { prevKey: prev?.isWord ? prev.normalized : undefined, prevIsLatinOrDigit });
    const syllables = syllablesOf(token.surface);
    if (syllables.length) for (const c of candidates) c.syllables = syllables;
    return { token, candidates, analyzer: KO_ANALYZER };
  });
}

