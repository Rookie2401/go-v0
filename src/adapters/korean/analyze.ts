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
import { type KoConjClass, type KoHost, type KoRealization, koRealize, koSeq, koSeqOfText, koShapeClasses, koSyls, koSylsText } from './conjugate';
import { ENDINGS, type KoEnding } from './endings';
import { candidateStems } from './stems';
import { CHAIN_PARTICLES, FUSED, KO_BOUND_CONTRACTIONS, KO_CLOSED_PREDICATES, KO_CONJUNCTIVE_ADVERBS, KO_CONJUNCTIVE_LEMMAS, KO_COPULA, KO_EXISTENTIAL_LEMMAS, PARTICLES, koParseNumerals, type KoParticle, koAllomorphAgrees, koParticleMayFollow, koResolveFused } from './particles';

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
const ROOT_VERBS: ReadonlyArray<{ lv: string; cls: KoConjClass; voice?: 'Pass' | 'Caus' }> = [{ lv: '하', cls: 'Ha' }, { lv: '스럽', cls: 'B' }];
const ADJ_LIKE_AUX = new Set(['싶', '듯하', '만하', '법하']);
/** Auxiliaries that may be written together with the main verb (보조 용언 붙여 쓰기): after -아/어, and 싶다 / 있다 / 않다 after -고 or -지. */
const ATTACHABLE_AUX: ReadonlyArray<{ stem: string; cls: KoConjClass }> = [
  { stem: '주', cls: 'R' }, { stem: '드리', cls: 'R' }, { stem: '보', cls: 'R' }, { stem: '있', cls: 'R' }, { stem: '버리', cls: 'R' }, { stem: '놓', cls: 'R' },
  { stem: '두', cls: 'R' }, { stem: '내', cls: 'R' }, { stem: '가', cls: 'R' }, { stem: '오', cls: 'R' }, { stem: '대', cls: 'R' }, { stem: '치우', cls: 'R' }, { stem: '싶', cls: 'R' },
];
const AUX_AFTER_GO = new Set(['싶', '있']);
const LIGHT_GLOSS: Readonly<Record<string, string>> = { 하다: '+ 하다: to do', 되다: '+ 되다: passive', 받다: '+ 받다: to receive', 당하다: '+ 당하다: to suffer', 시키다: '+ 시키다: to cause', 스럽다: '+ 스럽다: -ish, -like' };
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
  if (e.id === 'inf' || e.id === 'and') {
    // an auxiliary verb written together with the main verb (해주는, 돼있는, 먹고싶어요): spacing the standard allows for -아/어 + auxiliary
    for (const aux of ATTACHABLE_AUX) {
      if (e.id === 'and' && !AUX_AFTER_GO.has(aux.stem)) continue;
      if (e.id === 'inf' && AUX_AFTER_GO.has(aux.stem) && aux.stem !== '있') continue;
      const syls = koSyls(aux.stem)!;
      if (c.K[q] !== syls[0].l) continue;
      for (const t of parseChain(c, q, { kind: 'stem', syls, cls: aux.cls }, { slot: 0, kind: 'X', exist: false, hon: false, fut: false })) {
        const part: PartRec = { js: q, je: t.hostEnd, text: aux.stem, lemma: aux.stem + '다', pos: 'AUX', tag: 'VX', role: `auxiliary ${aux.stem}다 written together with the verb`, kind: 'component' };
        out.push({ parts: [part, ...t.parts], violations: t.violations, spacing: false });
      }
    }
  }
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

function parseParticles(c: Ctx, q: number, prev: KoParticle | undefined, sound: 'V' | 'L' | 'C' | undefined, depth = 0, host?: string): Array<{ parts: PartRec[]; violations: number }> {
  const mk = `${q}|${prev?.id ?? ''}|${sound ?? ''}|${depth === 0 ? host ?? '' : ''}`;
  const hit = c.pmemo.get(mk);
  if (hit) return hit;
  const out: Array<{ parts: PartRec[]; violations: number }> = [];
  c.pmemo.set(mk, out);
  if (depth > 4 || q >= c.K.length) return out;
  for (const pt of CHAIN_PARTICLES) {
    if (!koParticleMayFollow(prev, pt)) continue;
    if (pt.hosts && !(depth === 0 && host && pt.hosts.includes(host))) continue;
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

interface NounOpts { soundOverride?: 'V' | 'L' | 'C'; allowCopula: boolean; allowXSN?: string; lightNoun?: string; magOnly?: boolean; hostText?: string; rootOnly?: boolean }
/** Derivational noun suffixes productive enough to be read as a split (선생 + 님, 김 + 씨, 문화 + 적); any other lexicon suffix is not offered as a split. */
const PRODUCTIVE_XSN = new Set(['님', '씨', '적', '화', '성', '짜리', '째', '씩', '쯤', '별', '용', '꾼', '측', '상', '간', '분', '께서', '네', '님들']);

/** What may follow a nominal at q: nothing, a derivational suffix, a particle chain, the copula with its endings, or a light verb. */
function nounCont(c: Ctx, q: number, o: NounOpts): Tail[] {
  const out: Tail[] = [];
  const blank = (parts: PartRec[], violations = 0): Tail => ({ hostEnd: q, parts, violations, contracted: false, copulaDrop: false, spacing: false });
  if (q === c.K.length) { out.push(blank([])); return out; }
  const sound = o.soundOverride ?? soundBefore(c, q);
  if (!o.rootOnly) for (const ch of parseParticles(c, q, undefined, sound, 0, o.hostText)) {
    if (o.magOnly && !ch.parts.every((x) => x.particle && MAG_PARTICLES.has(x.particle.id))) continue;
    out.push(blank(ch.parts, ch.violations));
  }
  if (o.magOnly) return out;
  if (o.allowXSN) {
    const u0 = c.sylOf[q];
    for (let n = 1; n <= 2 && u0 + n <= c.units.length; n++) {
      const s = c.units.slice(u0, u0 + n).map((u) => u.ch).join('');
      for (const hit of lookupKoreanStem(s)) {
        // a productive suffix after any noun; another lexicon suffix only between Sino-Korean pieces (형제 + 애, 중요 + 시)
        if (hit.entry.tag !== 'XSN' || (!PRODUCTIVE_XSN.has(s) && !([...o.allowXSN].length >= 2 && hit.entry.hanja && lookupKoreanStem(o.allowXSN).some((h) => !!h.entry.hanja)))) continue;
        if (lookupKoreanStem(o.allowXSN + s).some((h) => !KO_PREDICATE_TAGS.has(h.entry.tag))) continue; // the whole is a headword: no split
        const q2 = c.units[u0 + n - 1].j1;
        const part: PartRec = { js: q, je: q2, text: s, lemma: hit.entry.lemma, pos: 'PART', tag: 'XSN', role: hit.entry.gloss ?? 'noun suffix', kind: 'suffix' };
        for (const t of nounCont(c, q2, { allowCopula: o.allowCopula })) out.push({ ...t, parts: [part, ...t.parts] });
      }
    }
  }
  if (o.allowCopula && !o.rootOnly) {
    const host: KoHost = { kind: 'stem', syls: koSyls('이')!, cls: 'Cop', vowelNoun: sound === 'V' };
    for (const t of parseChain(c, q, host, { slot: 0, kind: 'C', exist: false, hon: false, fut: false })) {
      const cop: PartRec = { js: q, je: t.hostEnd, text: '이', lemma: KO_COPULA.lemma, pos: 'AUX', tag: 'VCP', role: t.copulaDrop ? 'copula 이다 (is), its 이 left out after a vowel' : 'copula 이다 (is)', kind: 'clitic', copula: true };
      out.push({ ...t, parts: [cop, ...t.parts] });
    }
  }
  if (o.lightNoun) {
    for (const { lv, cls, voice } of o.rootOnly ? ROOT_VERBS : LIGHT_VERBS) {
      if (lookupKoreanStem(o.lightNoun + lv).some((h) => KO_PREDICATE_TAGS.has(h.entry.tag))) continue; // the dictionary's own …하다 headword reads it
      const syls = koSyls(lv)!;
      if (c.K[q] !== syls[0].l) continue;
      for (const t of parseChain(c, q, { kind: 'stem', syls, cls }, { slot: 0, kind: o.rootOnly ? 'A' : 'V', exist: false, hon: false, fut: false })) {
        const part: PartRec = { js: q, je: t.hostEnd, text: lv, lemma: lv + '다', pos: o.rootOnly ? 'ADJ' : 'VERB', tag: o.rootOnly ? 'XSA' : 'XSV', role: voice === 'Pass' ? `${lv}다: makes a passive verb of the noun` : voice === 'Caus' ? `${lv}다: makes a causative verb of the noun` : `${lv}다: makes a verb of the noun`, kind: 'suffix', light: voice ?? 'none' };
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
        entry, lemma, pos, gloss: koPredicateGloss(entry), parts, stemKey: stem, stemTag: tag, baseKind: kind, cap, score, sourceId, origin,
        notes: {}, remarks, contracted: t.contracted, stemShows: t.stemShows, extra: {}, order: orderSeq++,
      });
    }
  }
  return out;
}

function nominalReadings(c: Ctx, prefixUnits: number, stemKey: string, entry: KoLexEntry, sourceId: string, origin: AnalysisOrigin): Reading[] {
  const q = c.units[prefixUnits - 1].j1;
  const tag = entry.tag;
  if (tag.startsWith('X') && tag !== 'XR') return [];
  if (tag === 'NP' && (KO_BOUND_CONTRACTIONS.has(entry.lemma) || (entry as { bound?: boolean }).bound) && (entry.lemma === '누' || q !== c.K.length)) return [];
  const isHanja = !isHangulSyllable(stemKey[0]);
  const soundOverride = isHanja ? soundOfWord(entry.lemma) : undefined;
  let conts: Tail[];
  if (tag === 'XR') conts = nounCont(c, q, { allowCopula: false, lightNoun: stemKey, rootOnly: true });
  else if (tag === 'MM' || tag === 'IC') conts = q === c.K.length ? [{ hostEnd: q, parts: [], violations: 0, contracted: false, copulaDrop: false, spacing: false }] : [];
  else if (tag === 'MAJ') conts = q === c.K.length ? [{ hostEnd: q, parts: [], violations: 0, contracted: false, copulaDrop: false, spacing: false }] : nounCont(c, q, { allowCopula: false, magOnly: true }).filter((t) => t.parts.length === 1 && t.parts[0].particle?.id === 'polite');
  else if (tag === 'MAG') conts = nounCont(c, q, { allowCopula: false, magOnly: true, soundOverride });
  else conts = nounCont(c, q, { allowCopula: true, allowXSN: isHanja ? undefined : stemKey, lightNoun: tag === 'NNG' && !isHanja ? stemKey : undefined, soundOverride, hostText: entry.lemma });
  const out: Reading[] = [];
  const lemma = koEntryLemma(entry);
  const pos = koSharedPos(entry);
  for (const t of conts) {
    const parts: PartRec[] = [{ js: 0, je: q, text: stemKey, lemma, pos: pos ?? 'X', tag, role: tag === 'XR' ? 'root' : 'stem', kind: 'stem' }, ...t.parts];
    const remarks: string[] = [];
    let cap: number = t.violations ? CAP.nonStandard : CAP.full;
    if (t.parts.some((x) => x.particle?.cls === 'voc') && prefixUnits === 1) cap = Math.min(cap, CAP.nonStandard);
    if (t.violations) remarks.push('a particle form that does not agree with the final sound of the word before it');
    const light = t.parts.find((x) => x.light);
    if (t.spacing) cap = Math.min(cap, CAP.nonStandard);
    let score = baseScore(entry, prefixUnits, t.parts.length + 1, t.violations);
    if (t.copulaDrop) score -= 0.2;
    const notes: Record<string, string | string[]> = isHanja ? { hanja: stemKey } : {};
    if (!t.parts.length && CLOSED_TAGS.has(tag)) { score += 1.2; notes.context = 'a closed-class word written alone: commoner than a predicate form of the same spelling'; }
    if (light) {
      // noun + 하다 / 되다 / 받다 / 당하다 / 시키다 the dictionary does not list (or a root + 하다 / 스럽다): the derived verb, both parts from the lexicon
      const derived = entry.lemma + light.lemma;
      const adj = tag === 'XR';
      const dEntry: KoLexEntry = { lemma: derived, tag: adj ? 'VA' : 'VV', n: entry.n };
      out.push({
        entry: dEntry, lemma: derived, pos: adj ? 'ADJ' : 'VERB', gloss: entry.gloss ? `${entry.gloss} (${LIGHT_GLOSS[light.lemma] ?? '+ ' + light.lemma})` : undefined, parts,
        stemKey: stemKey + light.text, stemTag: adj ? 'VA' : 'VV', baseKind: adj ? 'A' : 'V', cap, score: score - 0.3, sourceId, origin,
        notes: { ...notes, derived: `${entry.lemma} + ${light.lemma}` }, remarks, contracted: t.contracted, extra: {}, order: orderSeq++,
      });
      continue;
    }
    if (tag === 'XR') continue; // a root is never a word by itself
    const xsn = t.parts[0]?.tag === 'XSN' && !t.parts[0].particle ? t.parts[0] : undefined;
    if (xsn && !KEEP_NOUN_XSN.has(xsn.text)) {
      // noun + derivational suffix (사회 + 적): a derived word of its own
      const derived = entry.lemma + xsn.text;
      const det = xsn.text === '적' && t.parts.length === 1;
      out.push({
        entry: { lemma: derived, tag: det ? 'MM' : 'NNG', n: entry.n }, lemma: derived, pos: det ? 'DET' : 'NOUN', gloss: entry.gloss ? `${entry.gloss} (+ ${xsn.text}: ${xsn.role})` : undefined,
        parts: parts.map((p) => (p === xsn ? { ...p, kind: 'suffix' as const } : p)), stemKey: derived, stemTag: det ? 'MM' : 'NNG', baseKind: t.parts.some((x) => x.copula) ? 'C' : undefined,
        cap: Math.min(cap, CAP.assumed), score: score - 0.2, sourceId, origin, notes: { ...notes, derived: `${entry.lemma} + ${xsn.text}` }, remarks, contracted: t.contracted, extra: {}, order: orderSeq++,
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
  const entry: KoLexEntry = resolved ?? { lemma: f.pron, tag: f.tag as KoLexEntry['tag'] };
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
    score: baseScore(entry, 1, parts.length, 0) + ([...form].length > 1 ? 2 : 0.3), sourceId: lexHit ? KO_SOURCE_IDS.lexicon : KO_SOURCE_IDS.closed, origin: lexHit ? 'dictionary' : 'hand',
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

// ───────────────────────────── compounds, derived words, numerals, derived adverbs ─────────────────────────────

/** One-syllable Sino-Korean heads that build compounds and derived nouns (예산 + 안, 상승 + 률, 저소득 + 층, 통계 + 청). */
const SINO_HEADS = new Set(['안', '률', '율', '층', '청', '애', '권', '성', '화', '적', '자', '가', '식', '용', '비', '료', '원', '장', '부', '소', '실', '학', '론', '계',
  '국', '품', '법', '제', '대', '감', '력', '사', '인', '선', '기', '관', '형', '상', '생', '회', '금', '점', '액', '량', '단', '차', '판', '표', '도', '수', '세', '군', '시', '구', '동', '면', '서', '처', '팀', '업', '난', '주의', '자들']);
/** Suffixes after which the NOUN stays the lemma (사람 + 들, 시 + 쯤, 한 개 + 씩): inflection-like, not a new word. */
/** One-syllable spellings that are particles: never the head of a built compound (상승률 + 이 is a particle, not 이 "tooth"). */
const PARTICLE_LIKE = new Set(['이', '가', '을', '를', '은', '는', '도', '만', '의', '에', '와', '과', '로', '요', '나', '야', '아']);
const KEEP_NOUN_XSN = new Set(['들', '씩', '쯤', '끼리', '님', '씨', '네', '분', '째', '짜리', '별', '마다', '님들', '께서']);

interface Piece { text: string; entry?: KoLexEntry; u0: number; u1: number }

/** The lexicon nominal entries of a span of the token (Hangul or Hanja key). */
function nominalEntries(c: Ctx, u0: number, u1: number): KoLexEntry[] {
  const s = c.units.slice(u0, u1).map((u) => u.ch).join('');
  return lookupKoreanStem(s).map((h) => h.entry).filter((e) => e.tag === 'NNG' || e.tag === 'NNP' || e.tag === 'XSN' || e.tag === 'NNB' || e.tag === 'XR');
}

/**
 * An unlisted compound or derived noun: two or three listed pieces (a noun of two syllables or more, then nouns or one-syllable
 * Sino-Korean heads / lexicon suffixes) and then the usual particle chain, copula or light verb. ONE reading: lemma = the whole compound,
 * `unconfirmed` (the lexicon does not hold it), `notes.compound` naming the pieces, each piece a part, the particle chain kept.
 */
function compoundReadings(c: Ctx): Reading[] {
  const n = c.units.length;
  if (n < 2 || !isHangulSyllable(c.units[0].ch)) return [];
  const out: Reading[] = [];
  const walk = (u0: number, pieces: Piece[]) => {
    if (pieces.length >= 2) {
      const text = pieces.map((p) => p.text).join('');
      const q = c.units[pieces[pieces.length - 1].u1 - 1].j1;
      for (const t of nounCont(c, q, { allowCopula: true, lightNoun: text, hostText: text })) {
        if (out.length >= 4) return;
        out.push(compoundReading(c, pieces, t));
      }
    }
    if (pieces.length >= 3) return;
    for (let u1 = n; u1 > u0; u1--) {
      const len = u1 - u0;
      const s = c.units.slice(u0, u1).map((u) => u.ch).join('');
      const es = nominalEntries(c, u0, u1);
      const first = pieces.length === 0;
      if (first && (len < 2 || u1 === n)) continue;
      const ok = first ? es.some((e) => e.tag === 'NNG' || e.tag === 'NNP' || e.tag === 'XR')
        : len >= 2 ? es.some((e) => e.tag === 'NNG' || e.tag === 'XSN') : PARTICLE_LIKE.has(s) ? false : SINO_HEADS.has(s) || es.some((e) => (e.tag === 'XSN' || e.tag === 'NNG') && !!e.hanja && !KEEP_NOUN_XSN.has(s));
      if (!ok) continue;
      walk(u1, [...pieces, { text: s, entry: es.find((e) => e.tag === 'NNG') ?? es[0], u0, u1 }]);
      if (out.length) return;
    }
  };
  walk(0, []);
  return out;
}

function compoundReading(c: Ctx, pieces: Piece[], t: Tail): Reading {
  const text = pieces.map((p) => p.text).join('');
  const parts: PartRec[] = pieces.map((p, i) => ({
    js: c.units[p.u0].j0, je: c.units[p.u1 - 1].j1, text: p.text, lemma: p.entry ? koEntryLemma(p.entry) : p.text, pos: 'NOUN',
    tag: p.entry?.tag === 'XSN' ? 'XSN' : 'NNG', role: p.entry?.gloss ?? 'noun', kind: i === pieces.length - 1 ? 'head' : 'component',
  }));
  const light = t.parts.find((x) => x.light);
  const glosses = pieces.map((p) => `${p.text} ${p.entry?.gloss ?? '?'}`).join(' | ');
  const base = {
    stemKey: text, cap: Math.min(CAP.unknown, t.violations ? CAP.unknown - 0.05 : CAP.unknown), score: -4 - pieces.length * 0.2 - t.parts.length * 0.1, unconfirmed: true,
    sourceId: KO_SOURCE_IDS.rules, origin: 'rule' as AnalysisOrigin, remarks: ['a compound the lexicon does not list, read through its listed parts'], contracted: t.contracted, extra: {}, order: orderSeq++,
  };
  if (light) {
    const derived = text + light.lemma;
    return { ...base, lemma: derived, pos: light.lemma === '하다' && pieces[0].entry?.tag === 'XR' ? 'ADJ' : 'VERB', parts: [...parts, ...t.parts], stemTag: 'VV', baseKind: 'V',
      notes: { source: 'rule', compound: pieces.map((p) => p.text).join(' + '), derived: `${text} + ${light.lemma}`, glosses } };
  }
  return { ...base, lemma: text, pos: 'NOUN', parts: [...parts, ...t.parts], stemTag: 'NNG', baseKind: t.parts.some((x) => x.copula) ? 'C' : undefined,
    notes: { source: 'rule', compound: pieces.map((p) => p.text).join(' + '), glosses } };
}

/** A Sino-Korean or native numeral of two pieces or more (사만 40,000; 스물다섯 25), then particles. */
function numeralReadings(c: Ctx): Reading[] {
  const out: Reading[] = [];
  for (const num of koParseNumerals(c.key)) {
    const q = c.units[num.length - 1].j1;
    for (const t of nounCont(c, q, { allowCopula: true })) {
      let at = 0;
      const parts: PartRec[] = num.pieces.map((p, i) => {
        const l = [...p].length;
        const r: PartRec = { js: c.units[at].j0, je: c.units[at + l - 1].j1, text: p, lemma: p, pos: 'NUM', tag: 'NR', role: 'numeral', kind: i === num.pieces.length - 1 ? 'head' : 'component' };
        at += l;
        return r;
      });
      const text = num.pieces.join('');
      out.push({
        lemma: text, pos: 'NUM', parts: [...parts, ...t.parts], stemKey: text, stemTag: 'NR', cap: t.violations ? CAP.nonStandard : CAP.full, score: 6 + num.length * 0.1,
        sourceId: KO_SOURCE_IDS.rules, origin: 'rule', notes: { value: String(num.value), numeral: num.kind === 'sino' ? 'Sino-Korean' : 'native Korean' },
        remarks: [], contracted: false, extra: {}, order: orderSeq++, baseKind: t.parts.some((x) => x.copula) ? 'C' : undefined,
      });
      if (out.length >= 2) return out;
    }
  }
  return out;
}

/**
 * An adverb in -이 / -히 the lexicon does not list, derived from its predicate (같다 + -이 → 같이, 거룩하다 + -히 → 거룩히, 빠르다 → 빨리,
 * 가깝다 → 가까이) or from a root (분명 + -히). Below a listed adverb of the same spelling.
 */
function derivedAdverbReadings(c: Ctx): Reading[] {
  const key = c.key;
  const out: Reading[] = [];
  if (key.length < 2 || !/[이히]$/u.test(key)) return out;
  const stemPart = key.slice(0, -1);
  const tries: Array<{ stem: string; via: string }> = [];
  if (key.endsWith('히')) tries.push({ stem: stemPart + '하', via: '-히' }, { stem: stemPart, via: '-히' });
  else {
    tries.push({ stem: stemPart, via: '-이' }, { stem: stemPart + '하', via: '-이' });
    const prev = koSyls(stemPart.slice(-1));
    if (prev && prev[0].t === '') { const s = koSyls(stemPart)!; s[s.length - 1] = { ...s[s.length - 1], t: 'ㅂ' }; tries.push({ stem: koSylsText(s), via: '-이' }); }
  }
  if (key.endsWith('리') && key.length >= 2) {
    const s = koSyls(stemPart);
    if (s && s[s.length - 1].t === 'ㄹ') { s[s.length - 1] = { ...s[s.length - 1], t: '' }; tries.push({ stem: koSylsText(s) + '르', via: '-이' }); }
  }
  for (const { stem, via } of tries) {
    for (const h of lookupKoreanStem(stem)) {
      const e = h.entry;
      if (!(e.tag === 'VA' || (e.tag === 'XR' && stem === stemPart))) continue;
      const base = e.tag === 'XR' ? `${e.lemma}하다` : e.lemma;
      out.push({
        lemma: key, pos: 'ADV', gloss: e.gloss ? `${e.gloss} (adverb in ${via})` : undefined,
        parts: [{ js: 0, je: c.K.length, text: key, lemma: key, pos: 'ADV', tag: 'MAG', role: `adverb from ${base}`, kind: 'stem' }],
        stemKey: key, stemTag: 'MAG', cap: CAP.assumed, score: Math.log10(1 + (e.n ?? 0)) - 0.5, sourceId: KO_SOURCE_IDS.lexicon, origin: 'dictionary',
        notes: { derived: `${base} + ${via}` }, remarks: [], contracted: false, extra: {}, order: orderSeq++,
      });
      return out;
    }
  }
  return out;
}

/**
 * Ranking rules over the whole list (docs/korean/PLAN.md "Confidence and honesty"), applied as score changes so that nothing is removed:
 * a whole function word over its etymology; a listed noun over a nominalised predicate; a common licensed predicate over a one-syllable
 * noun + particle; a 하다-verb over noun + the particle 하고; literary and contracted-quotation endings below ordinary ones; a derived
 * verb below a listed headword.
 */
function rankAdjust(readings: Reading[]): void {
  const isPred = (r: Reading) => KO_PREDICATE_TAGS.has(r.stemTag) && !r.unconfirmed;
  const hasEtn = (r: Reading) => r.parts.some((p) => p.ending?.tag === 'ETN');
  const nounish = (r: Reading) => (r.stemTag === 'NNG' || r.stemTag === 'NNB' || r.stemTag === 'NNP') && !r.unconfirmed && !r.notes.derived;
  const anyPredFull = readings.some((r) => isPred(r) && !hasEtn(r) && r.cap >= CAP.full);
  const maxPredN = Math.max(0, ...readings.filter(isPred).map((r) => r.entry?.n ?? 0));
  const anyNoun = readings.some(nounish);
  const anyHaSplit = readings.some((r) => !r.notes.derived && r.parts.some((p) => p.tag === 'XSV' && p.lemma === '하다'));
  const anyListedWhole = readings.some((r) => !r.unconfirmed && !r.notes.derived && r.entry && r.cap >= CAP.assumed && r.sourceId !== KO_SOURCE_IDS.rules);
  const anyNonLit = readings.some((r) => !r.parts.some((p) => p.ending?.lit));
  for (const r of readings) {
    const whole = r.parts.length === 1 && r.parts[0].kind === 'stem';
    const yoOnly = r.parts.length === 2 && r.parts[1].particle?.id === 'polite';
    // a closed conjunctive adverb always; a lexicon adverb or interjection when the priors do not make it the rarer word by far (보다 "relatively")
    const fw = r.stemTag === 'MAJ' || ((r.stemTag === 'MAG' || (r.stemTag === 'IC' && !/(니다|요)$/u.test(r.lemma))) && !anyNominalOther(r) && (r.entry?.n ?? 0) * 10 >= maxPredN);
    if (fw && (whole || (r.stemTag === 'MAJ' && yoOnly))) {
      r.score += 3; r.notes.context = 'a whole function word outranks its own etymology (a predicate form of the same spelling)';
    }
    if (isPred(r) && hasEtn(r) && anyNoun) { r.score -= 3; r.notes.context = 'a listed noun outranks a nominalised predicate of the same spelling'; }
    if (nounish(r) && r.parts[0].je > 0 && c1(r) && r.parts.length >= 2 && anyPredFull) r.score -= 1;
    if (nounish(r) && yoOnly && anyPredFull) r.score -= 1;
    if (anyHaSplit && r.parts.some((p) => p.particle?.id === 'and-hago')) r.score -= 3;
    if (r.stemTag === 'NNP' && anyPredFull) r.score -= 1;
    if (anyNonLit && r.parts.some((p) => p.ending?.lit)) r.score -= 0.7;
    if (r.parts.some((p) => p.ending?.id === 'hage-ge')) r.score -= 0.5; // the 하게체 command is rare beside the adverbial -게
    if (r.parts.some((p) => p.ending && ['quote-rae', 'quote-dae', 'quote-eurae', 'quote-nyae', 'quote-jae', 'quote-neundae'].includes(p.ending.id))) r.score -= 0.3;
    if (r.notes.derived && r.stemTag === 'VV' && anyListedWhole && r.sourceId !== KO_SOURCE_IDS.rules) r.score -= 1.5;
  }
  function c1(r: Reading): boolean { return [...r.stemKey].length === 1; }
  /** Another reading of the token as a listed noun or determiner (때문 + 에, 이런 DET): a whole adverb or interjection is then no function word over it. */
  function anyNominalOther(r: Reading): boolean { return readings.some((o) => o !== r && !o.unconfirmed && (o.stemTag === 'MM' || (['NNG', 'NNB'].includes(o.stemTag) && o.parts.length >= 2))); }
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
        const verbish = (k === 'V' || (k === 'X' && !ADJ_LIKE_AUX.has(r.stemKey))) && !isExist(r.stemKey);
        add('Tense', verbish ? 'Past' : 'Pres');
      }
    } else if (p.particle) {
      if (p.yo && lastEnding) { set('SpeechLevel', 'Haeyo'); set('VerbForm', 'Fin'); continue; }
      if (p.yo && !lastEnding && r.parts[0]?.kind === 'stem') set('SpeechLevel', 'Haeyo');
      pids.push(p.particle.id);
      for (const [k, v] of Object.entries(p.particle.morph)) add(k, v);
    }
  }
  // a literary final says SpeechLevel=Lit; a literary connective or pre-final before a modern final says Register=Lit
  if (lit) { if (lastEnding?.ending?.tag === 'EF') set('SpeechLevel', 'Lit'); else { set('Register', 'Lit'); if (m.get('SpeechLevel')?.has('Lit')) m.delete('SpeechLevel'); } }
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

/**
 * The gloss of a predicate reading as the card shows it: a descriptive verb's gloss reads as a predicate (춥다 "cold" → "to be cold"),
 * unless it already starts with "to " or the row's gloss is this product's own wording. The one place this is decided.
 */
export function koPredicateGloss(entry: Pick<KoLexEntry, 'tag' | 'gloss' | 'glossOwn'>): string | undefined {
  const g = entry.gloss;
  if (!g || entry.tag !== 'VA' || entry.glossOwn || /^tos/iu.test(g)) return g;
  return 'to be ' + g;
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
  // only a question mark decides: a full stop ends requests (-(으)세요, -아/어요) as well as statements
  const pick = finalPunctuation && /[?？]/u.test(finalPunctuation) ? 'Int' : undefined;
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
      if (KO_PREDICATE_TAGS.has(h.entry.tag) && (KO_EXISTENTIAL_LEMMAS.has(h.entry.lemma) || h.entry.lemma === '아니다')) continue; // closed items
      if ((h.entry.tag === 'MAG' || h.entry.tag === 'MAJ') && KO_CONJUNCTIVE_LEMMAS.has(h.entry.lemma)) continue;
      const k = `${s}|${h.entry.lemma}|${h.entry.tag}|${h.entry.hom ?? 0}|${h.entry.clf ? 1 : 0}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (KO_PREDICATE_TAGS.has(h.entry.tag)) readings.push(...predicateReadings(c, s, h.entry, KO_SOURCE_IDS.lexicon, 'dictionary', ctx, false));
      else if (plainUnits && c.units.slice(0, plainUnits).map((u) => u.ch).join('') === s) readings.push(...nominalReadings(c, plainUnits, s, h.entry, KO_SOURCE_IDS.lexicon, 'dictionary'));
    }
    for (const e of KO_CLOSED_PREDICATES.get(s) ?? []) readings.push(...predicateReadings(c, s, e, KO_SOURCE_IDS.closed, 'hand', ctx, true));
  }
  for (const e of KO_CONJUNCTIVE_ADVERBS) if (c.key === e.lemma || c.key === e.lemma + '요') readings.push(...nominalReadings(c, [...e.lemma].length, e.lemma, e, KO_SOURCE_IDS.closed, 'hand'));
  readings.push(...fusedReadings(c));
  readings.push(...numeralReadings(c));
  if (!readings.some((r) => r.stemTag === 'MAG' && r.parts.length === 1)) readings.push(...derivedAdverbReadings(c));
  // an unlisted compound when nothing licensed reads the token whole (a derivational split or spacing does not count)
  if (!readings.some((r) => !r.unconfirmed && r.cap >= CAP.full && !r.notes.derived)) readings.push(...compoundReadings(c));
  const lexical = readings.length > 0;
  readings.push(...particleOnlyReadings(c, ctx));
  if (!lexical && !readings.length) readings.push(...spacingReadings(c));
  if (!readings.length) readings.push(...unknownReadings(c));
  rankAdjust(readings);
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

