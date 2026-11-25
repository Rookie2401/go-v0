/**
 * Korean stem alternation: given a predicate stem (or a pre-final ending that a further ending attaches to) and its conjugation class,
 * the JUNCTION forms an ending attaches to, worked at jamo level with hangul.ts arithmetic (docs/korean/PLAN.md "Analysis" step 2).
 *
 * Three junction bases, named after the ending families they serve:
 *   bare  before a consonant-initial ending that takes no 으 (-고, -지, -다, -게, -는, -네): the stem as it is, except that a ㄹ-final
 *         stem drops its ㄹ before ㄴ and ㅅ (사는, 사네);
 *   eu    before an ending written -(으)X: 으 after a consonant-final stem, none after a vowel or ㄹ; a ㄹ-final stem drops its ㄹ before
 *         ㄴ, ㄹ, ㅂ, ㅅ and 오 (사니, 살, 삽시다, 사세요, 사오) and keeps it before ㅁ (삶), 며, 면, 러, 려 …;
 *   a-eo  the infinitive: 아 after ㅏ ㅗ ㅑ ㅘ in the last syllable, 어 otherwise; the vowel contractions (가, 서, 봐 / 보아, 줘 / 주어,
 *         마셔 / 마시어, 돼 / 되어, 보내 / 보내어, 해 / 하여), ㅡ deletion (써, 바빠) and the irregular classes.
 * and a fourth attachment, `cv`, for the endings that pick an allomorph by the BARE stem's last sound (-습니다 / -ㅂ니다, -는다 / -ㄴ다).
 *
 * The irregular class is the LEXICON's (`KoLexEntry.irr`); a shape alone never makes a stem irregular. 'Cop' and 'Neg' are the
 * copulas 이다 and 아니다, whose a-eo forms (이에요, 이어, 여; 아니에요, 아니어) are their own.
 *
 * Every result says where the host's material ends and where the ending's begins, as offsets into the jamo sequence of the result
 * (`koSeq`: compound finals split into their two consonants), so that a syllable shared by both (갔, 봐, 해, 삽, 간) is known.
 */
import { compose, decompose, COMPOUND_FINALS, FINALS, LEADS, VOWELS } from './hangul';
import type { KoIrregular } from './index-store';
import type { KoEnding, KoEndingForm } from './endings';

/** One syllable as compatibility jamo; `t` is '' for none and may be a compound final (ㄺ). */
export interface KoSyl { l: string; v: string; t: string }
export type KoConjClass = KoIrregular | 'Cop' | 'Neg';

const LI = new Map(LEADS.map((c, i) => [c, i]));
const VI = new Map(VOWELS.map((c, i) => [c, i]));
const FI = new Map(FINALS.map((c, i) => [c, i]));
const COMPOUND_BY_PARTS = new Map(Object.entries(COMPOUND_FINALS).map(([k, [a, b]]) => [a + b, k]));

/** The syllables of a Hangul string, or undefined when any character is not a precomposed syllable. */
export function koSyls(s: string): KoSyl[] | undefined {
  const out: KoSyl[] = [];
  for (const ch of s) {
    const d = decompose(ch);
    if (!d) return undefined;
    out.push({ l: LEADS[d.l], v: VOWELS[d.v], t: FINALS[d.t] });
  }
  return out;
}
export const koSylText = (x: KoSyl): string => compose(LI.get(x.l)!, VI.get(x.v)!, FI.get(x.t) ?? 0);
export const koSylsText = (xs: readonly KoSyl[]): string => xs.map(koSylText).join('');

/** The jamo of one syllable with a compound final split (닭 → ㄷ ㅏ ㄹ ㄱ), so that 살 + ㅁ and 삶 compare equal. */
export function koSylJamo(x: KoSyl): string[] {
  const c = COMPOUND_FINALS[x.t];
  return c ? [x.l, x.v, c[0], c[1]] : x.t ? [x.l, x.v, x.t] : [x.l, x.v];
}
export function koSeq(xs: readonly KoSyl[]): string[] {
  const out: string[] = [];
  for (const x of xs) for (const j of koSylJamo(x)) out.push(j);
  return out;
}
/** The jamo sequence of any string: a syllable splits as `koSylJamo`, any other character is one unit. */
export function koSeqOfText(s: string): string[] {
  const out: string[] = [];
  for (const ch of s) {
    const d = decompose(ch);
    if (!d) { out.push(ch); continue; }
    for (const j of koSylJamo({ l: LEADS[d.l], v: VOWELS[d.v], t: FINALS[d.t] })) out.push(j);
  }
  return out;
}

const isConsonantJamo = (c: string): boolean => { const x = c.charCodeAt(0); return c.length === 1 && x >= 0x3131 && x <= 0x314e; };

/** An ending tail: an optional leading consonant that becomes the host's final (ㅆ, ㄴ, ㄹ, ㅁ, ㅂ), then whole syllables. */
export interface KoTail { head?: string; syls: KoSyl[] }
const tailCache = new Map<string, KoTail>();
export function koTail(tail: string): KoTail {
  let t = tailCache.get(tail);
  if (t) return t;
  const head = tail && isConsonantJamo(tail[0]) ? tail[0] : undefined;
  const syls = koSyls(head ? tail.slice(1) : tail);
  if (!syls) throw new Error(`korean ending tail is not Hangul: ${tail}`);
  t = head ? { head, syls } : { syls };
  tailCache.set(tail, t);
  return t;
}

/** base + tail; a leading consonant of the tail becomes the base's final (an open syllable, or ㄹ + ㅁ → ㄻ). undefined when it cannot. */
export function koAppend(base: readonly KoSyl[], tail: KoTail): KoSyl[] | undefined {
  const out = base.map((x) => ({ ...x }));
  if (tail.head) {
    const last = out[out.length - 1];
    if (!last) return undefined;
    if (last.t === '') last.t = tail.head;
    else if (last.t === 'ㄹ' && COMPOUND_BY_PARTS.has('ㄹ' + tail.head) && tail.head === 'ㅁ') last.t = COMPOUND_BY_PARTS.get('ㄹ' + tail.head)!;
    else return undefined;
  }
  for (const s of tail.syls) out.push({ ...s });
  return out;
}

/** The allomorph label: 으 + ㄴ → 은, 어 + ㅆ → 었, '' + ㄴ → ㄴ. */
function joinLabel(lead: string, tail: string): string {
  if (!lead) return tail;
  const a = koSyls(lead)!;
  const r = koAppend(a, koTail(tail));
  return r ? koSylsText(r) : lead + tail;
}

/** Host of an ending: a stem (or a vowel-final pre-final ending, 시 or 더, still open to contraction), or a FIXED consonant-final pre-final (었, 겠, 옵) that never alternates. */
export type KoHost =
  | { kind: 'stem'; syls: KoSyl[]; cls: KoConjClass; vowelNoun?: boolean; honSi?: boolean }
  | { kind: 'fixed'; noEu?: boolean };

export interface KoRealization {
  /** The host as realised (absent for a fixed host) and the ending's material. */
  syls: KoSyl[];
  /** Offset in koSeq(syls) where the host's material ends. */
  hostEnd: number;
  /** Offset in koSeq(syls) where the ending's material starts; below hostEnd when the two share a syllable. */
  endStart: number;
  /** The ending's allomorph as realised, as its own syllables: 었, 으면, ㅂ니다, 아요, 여. */
  label: string;
  contracted?: boolean;
  /** The alternation the form shows: D B S H Reu Reo U Ha (the lexicon's classes), L (ㄹ dropped), Eu (ㅡ deleted). */
  shows?: string;
  /** The copula's 이 left out after a vowel-final noun (의사다). */
  copulaDrop?: boolean;
}

const seqLen = (xs: readonly KoSyl[]): number => { let n = 0; for (const x of xs) n += koSylJamo(x).length; return n; };
const A_HARMONY = new Set(['ㅏ', 'ㅗ', 'ㅑ', 'ㅘ']);
export const koHarmony = (v: string): 'ㅏ' | 'ㅓ' => (A_HARMONY.has(v) ? 'ㅏ' : 'ㅓ');
const DEMONSTRATIVE_H = ['그렇', '이렇', '저렇', '어떻', '아무렇'];
/** Honorific verbs that end in the honorific 시 itself: 계시 + 어요 → 계세요 as 시 + 어요 → 세요 (also 계셔요). 마시다, 모시다 are not among them. */
export const KO_HONORIFIC_SI_STEMS: ReadonlySet<string> = new Set(['계시', '주무시', '잡수시', '드시', '편찮으시', '돌아가시', '좌정하시', '진지잡수시']);
const HON_SI = KO_HONORIFIC_SI_STEMS;

function withLast(stem: readonly KoSyl[], last: Partial<KoSyl>): KoSyl[] {
  const out = stem.map((x) => ({ ...x }));
  Object.assign(out[out.length - 1], last);
  return out;
}

/** The ㄹ of a ㄹ-final stem drops before this eu-tail: ㄴ ㄹ ㅂ as a final, a syllable led by ㄴ or ㅅ, or 오 / 옵. */
function dropsL(t: KoTail): boolean {
  if (t.head) return t.head === 'ㄴ' || t.head === 'ㄹ' || t.head === 'ㅂ';
  const f = t.syls[0];
  return !!f && (f.l === 'ㄴ' || f.l === 'ㅅ' || (f.l === 'ㅇ' && f.v === 'ㅗ'));
}

interface Base { syls: KoSyl[]; hostEnd: number; endStart: number; label: string; contracted?: boolean; shows?: string; copulaDrop?: boolean }

function aeoBases(stem: readonly KoSyl[], cls: KoConjClass, tail: KoTail, vowelNoun: boolean, honSi = false): Base[] {
  const n = stem.length;
  const last = stem[n - 1];
  const prev = n > 1 ? stem[n - 2] : undefined;
  const len = seqLen(stem);
  const beforeYo = !tail.head && tail.syls.length === 1 && tail.syls[0].l === 'ㅇ' && tail.syls[0].v === 'ㅛ' && tail.syls[0].t === '';
  const plus = (v: string, label: string, extra: Partial<Base> = {}): Base => ({ syls: [...stem.map((x) => ({ ...x })), { l: 'ㅇ', v, t: '' }], hostEnd: len, endStart: len, label, ...extra });
  const fuse = (syls: KoSyl[], label: string, extra: Partial<Base> = {}): Base => { const l = seqLen(syls); return { syls, hostEnd: l, endStart: l - 1, label, contracted: true, ...extra }; };

  if (cls === 'Cop' || cls === 'Neg') {
    const out: Base[] = [plus('ㅓ', '어')];
    if (beforeYo) out.push(plus('ㅔ', '에'));
    if (cls === 'Cop' ? vowelNoun : true) {
      out.push(fuse(withLast(stem, { v: 'ㅕ' }), '어'));
      if (beforeYo) out.push(fuse(withLast(stem, { v: 'ㅖ' }), '에'));
    }
    return out;
  }
  if (cls === 'Ha' && last.l === 'ㅎ' && last.v === 'ㅏ' && last.t === '') {
    return [fuse(withLast(stem, { v: 'ㅐ' }), '여', { shows: 'Ha' }), plus('ㅕ', '여', { shows: 'Ha' })];
  }
  if (cls === 'D' && last.t === 'ㄷ') {
    const s = withLast(stem, { t: 'ㄹ' });
    const h = koHarmony(last.v);
    return [{ syls: [...s, { l: 'ㅇ', v: h, t: '' }], hostEnd: len, endStart: len, label: h === 'ㅏ' ? '아' : '어', shows: 'D' }];
  }
  if (cls === 'B' && last.t === 'ㅂ') {
    const s = withLast(stem, { t: '' });
    const wa = n === 1 && last.v === 'ㅗ' && (last.l === 'ㄷ' || last.l === 'ㄱ');
    const syls = [...s, { l: 'ㅇ', v: wa ? 'ㅘ' : 'ㅝ', t: '' }];
    const l = seqLen(syls);
    return [{ syls, hostEnd: l, endStart: l - 1, label: wa ? '아' : '어', shows: 'B' }];
  }
  if (cls === 'S' && last.t === 'ㅅ') {
    const s = withLast(stem, { t: '' });
    const h = koHarmony(last.v);
    const l = seqLen(s);
    return [{ syls: [...s, { l: 'ㅇ', v: h, t: '' }], hostEnd: l, endStart: l, label: h === 'ㅏ' ? '아' : '어', shows: 'S' }];
  }
  if (cls === 'H' && last.t === 'ㅎ') {
    const text = koSylsText(stem.slice(-2));
    const v = last.v === 'ㅑ' ? 'ㅒ' : last.v === 'ㅕ' ? 'ㅖ' : last.v === 'ㅓ' ? (DEMONSTRATIVE_H.some((d) => text.endsWith(d)) ? 'ㅐ' : 'ㅔ') : 'ㅐ';
    const syls = withLast(stem, { v, t: '' });
    const l = seqLen(syls);
    return [{ syls, hostEnd: l, endStart: l - 1, label: koHarmony(last.v) === 'ㅏ' ? '아' : '어', shows: 'H' }];
  }
  if (cls === 'Reu' && prev && last.l === 'ㄹ' && last.v === 'ㅡ' && last.t === '' && prev.t === '') {
    const h = koHarmony(prev.v);
    const syls = stem.map((x) => ({ ...x }));
    syls[n - 2].t = 'ㄹ';
    syls[n - 1] = { l: 'ㄹ', v: h, t: '' };
    const l = seqLen(syls);
    return [{ syls, hostEnd: l, endStart: l - 1, label: h === 'ㅏ' ? '아' : '어', shows: 'Reu' }];
  }
  if (cls === 'Reo' && last.l === 'ㄹ' && last.v === 'ㅡ' && last.t === '') {
    return [{ syls: [...stem.map((x) => ({ ...x })), { l: 'ㄹ', v: 'ㅓ', t: '' }], hostEnd: len, endStart: len, label: '러', shows: 'Reo' }];
  }
  if (cls === 'U' && last.v === 'ㅜ' && last.t === '') {
    return [fuse(withLast(stem, { v: 'ㅓ' }), '어', { shows: 'U', contracted: false })];
  }
  // regular
  if (last.t === 'ㅎ' && last.l === 'ㄴ' && last.v === 'ㅗ') return [plus('ㅏ', '아'), fuse(withLast(stem, { v: 'ㅘ', t: '' }), '아')]; // 놓아 / 놔
  if (koSylsText(stem) === '말') return [plus('ㅏ', '아'), fuse(withLast(stem, { t: '' }), '아')]; // 말다: 말아 / 마 (마, 마라, 마요)
  if (last.t) { const h = koHarmony(last.v); return [plus(h, h === 'ㅏ' ? '아' : '어')]; }
  switch (last.v) {
    case 'ㅏ': return [fuse(stem.map((x) => ({ ...x })), '아')];
    case 'ㅓ': case 'ㅕ': return [fuse(stem.map((x) => ({ ...x })), '어')];
    case 'ㅐ': case 'ㅔ': case 'ㅒ': case 'ㅖ': return [fuse(stem.map((x) => ({ ...x })), '어'), plus('ㅓ', '어')];
    case 'ㅗ': return last.l === 'ㅇ' ? [fuse(withLast(stem, { v: 'ㅘ' }), '아')] : [fuse(withLast(stem, { v: 'ㅘ' }), '아'), plus('ㅏ', '아')];
    case 'ㅜ': return [fuse(withLast(stem, { v: 'ㅝ' }), '어'), plus('ㅓ', '어')];
    case 'ㅚ': return [fuse(withLast(stem, { v: 'ㅙ' }), '어'), plus('ㅓ', '어')];
    case 'ㅣ': return [fuse(withLast(stem, { v: 'ㅕ' }), '어'), plus('ㅓ', '어'), ...(beforeYo && last.l === 'ㅅ' && (honSi || HON_SI.has(koSylsText(stem))) ? [fuse(withLast(stem, { v: 'ㅔ' }), '어')] : [])];
    case 'ㅡ': {
      const h = prev ? koHarmony(prev.v) : 'ㅓ';
      return [fuse(withLast(stem, { v: h }), h === 'ㅏ' ? '아' : '어', { shows: 'Eu' })];
    }
    default: { const h = koHarmony(last.v); return [plus(h, h === 'ㅏ' ? '아' : '어')]; }
  }
}

function euBases(stem: readonly KoSyl[], cls: KoConjClass, tail: KoTail, vowelNoun: boolean): Array<Base & { eu: boolean }> {
  const last = stem[stem.length - 1];
  const len = seqLen(stem);
  const keep = (eu: boolean, extra: Partial<Base> = {}) => ({ syls: stem.map((x) => ({ ...x })), hostEnd: len, endStart: len, label: '', eu, ...extra });
  const out: Array<Base & { eu: boolean }> = [];
  if (cls === 'Cop' && vowelNoun && !tail.head) out.push({ syls: [], hostEnd: 0, endStart: 0, label: '', eu: false, copulaDrop: true });
  if (cls === 'D' && last.t === 'ㄷ') { out.push({ syls: withLast(stem, { t: 'ㄹ' }), hostEnd: len, endStart: len, label: '', eu: true, shows: 'D' }); return out; }
  if (cls === 'B' && last.t === 'ㅂ') {
    const syls = [...withLast(stem, { t: '' }), { l: 'ㅇ', v: 'ㅜ', t: '' }];
    const l = seqLen(syls);
    out.push({ syls, hostEnd: l, endStart: l, label: '', eu: false, shows: 'B' });
    return out;
  }
  if (cls === 'S' && last.t === 'ㅅ') { const s = withLast(stem, { t: '' }); const l = seqLen(s); out.push({ syls: s, hostEnd: l, endStart: l, label: '', eu: true, shows: 'S' }); return out; }
  if (cls === 'H' && last.t === 'ㅎ') { const s = withLast(stem, { t: '' }); const l = seqLen(s); out.push({ syls: s, hostEnd: l, endStart: l, label: '', eu: false, shows: 'H' }); return out; }
  if (last.t === '') out.push(keep(false));
  else if (last.t === 'ㄹ') {
    if (dropsL(tail)) { const s = withLast(stem, { t: '' }); const l = seqLen(s); out.push({ syls: s, hostEnd: l, endStart: l, label: '', eu: false, shows: 'L' }); }
    else out.push(keep(false));
  } else out.push(keep(true));
  return out;
}

const EU: KoSyl = { l: 'ㅇ', v: 'ㅡ', t: '' };
const EO: KoSyl = { l: 'ㅇ', v: 'ㅓ', t: '' };

const realCache = new Map<string, KoRealization[]>();
const hostSig = (h: KoHost): string => (h.kind === 'fixed' ? `F${h.noEu ? 1 : 0}` : `S${koSylsText(h.syls)}|${h.cls}|${h.vowelNoun ? 1 : 0}${h.honSi ? 1 : 0}`);

/** Every way this ending form is realised on this host. */
export function koRealize(host: KoHost, form: KoEndingForm): KoRealization[] {
  const key = `${hostSig(host)}\u0000${form.attach}\u0000${form.tail ?? ''}\u0000${(form.c ?? []).join(',')}\u0000${form.v ?? ''}\u0000${form.onlyAfter ?? ''}`;
  const hit = realCache.get(key);
  if (hit) return hit;
  const out = realizeUncached(host, form);
  if (realCache.size > 20000) realCache.clear();
  realCache.set(key, out);
  return out;
}

function realizeUncached(host: KoHost, form: KoEndingForm): KoRealization[] {
  const out: KoRealization[] = [];
  const add = (base: KoSyl[], hostEnd: number, endStart: number, tailText: string, label: string, extra: Partial<KoRealization> = {}) => {
    const r = koAppend(base, koTail(tailText));
    if (!r) return;
    out.push({ syls: r, hostEnd, endStart, label, ...extra });
  };
  if (host.kind === 'fixed') {
    // a consonant-final pre-final ending (었 겠 옵) that never alternates
    switch (form.attach) {
      case 'bare': if (!form.onlyAfter || form.onlyAfter === 'C') add([], 0, 0, form.tail ?? '', form.tail ?? ''); break;
      case 'eu': if (host.noEu) { if (!koTail(form.tail ?? '').head) add([], 0, 0, form.tail ?? '', form.tail ?? ''); } else add([EU], 0, 0, form.tail ?? '', joinLabel('으', form.tail ?? '')); break;
      case 'aeo': if (!host.noEu) add([EO], 0, 0, form.tail ?? '', joinLabel('어', form.tail ?? '')); break;
      case 'cv': for (const c of form.c ?? []) add([], 0, 0, c, c); break;
    }
    return out;
  }
  const { syls: stem, cls } = host;
  if (!stem.length && cls !== 'Cop') return out;
  const last = stem[stem.length - 1];
  const len = seqLen(stem);
  const vowelNoun = !!host.vowelNoun;
  switch (form.attach) {
    case 'bare': {
      const tail = form.tail ?? '';
      const t = koTail(tail);
      const isC = last.t !== '' && last.t !== 'ㄹ';
      if (form.onlyAfter === 'C' && !isC) break;
      if (form.onlyAfter === 'V' && isC) break;
      if (cls === 'Cop' && vowelNoun && !t.head) add([], 0, 0, tail, tail, { copulaDrop: true });
      if (last.t === 'ㄹ' && !t.head && t.syls[0] && (t.syls[0].l === 'ㄴ' || t.syls[0].l === 'ㅅ')) {
        const s = withLast(stem, { t: '' });
        const l = seqLen(s);
        add(s, l, l, tail, tail, { shows: 'L' });
      } else add(stem.map((x) => ({ ...x })), len, len, tail, tail);
      break;
    }
    case 'cv': {
      if (last.t === '') { if (form.v !== undefined) add(stem.map((x) => ({ ...x })), len, len, form.v, form.v); }
      else if (last.t === 'ㄹ') { if (form.v !== undefined) { const s = withLast(stem, { t: '' }); const l = seqLen(s); add(s, l, l, form.v, form.v, { shows: 'L' }); } }
      else for (const c of form.c ?? []) add(stem.map((x) => ({ ...x })), len, len, c, c);
      break;
    }
    case 'eu': {
      const tail = form.tail ?? '';
      const t = koTail(tail);
      for (const b of euBases(stem, cls, t, vowelNoun)) {
        const base = b.eu ? [...b.syls, EU] : b.syls;
        add(base, b.hostEnd, b.endStart, tail, joinLabel(b.eu ? '으' : '', tail), { ...(b.shows ? { shows: b.shows } : {}), ...(b.copulaDrop ? { copulaDrop: true } : {}) });
      }
      break;
    }
    case 'aeo': {
      const tail = form.tail ?? '';
      const t = koTail(tail);
      for (const b of aeoBases(stem, cls, t, vowelNoun, !!host.honSi)) {
        add(b.syls, b.hostEnd, b.endStart, tail, joinLabel(b.label, tail), { ...(b.contracted ? { contracted: true } : {}), ...(b.shows ? { shows: b.shows } : {}) });
      }
      break;
    }
  }
  return out;
}

/** The three junction bases of a stem as text (for display and tests): bare, eu (before -(으)면), a-eo (the infinitive forms). */
export function koJunctionBases(stem: string, cls: KoConjClass): { bare: string; eu: string[]; aeo: string[] } {
  const syls = koSyls(stem);
  if (!syls) return { bare: stem, eu: [], aeo: [] };
  const host: KoHost = { kind: 'stem', syls, cls };
  return {
    bare: stem,
    eu: koRealize(host, { attach: 'eu', tail: '면' }).map((r) => koSylsText(r.syls).slice(0, -1)),
    aeo: koRealize(host, { attach: 'aeo', tail: '' }).map((r) => koSylsText(r.syls)),
  };
}

/**
 * Generation: the written forms of `stem` (of class `cls`) followed by the ending chain, in order (pre-final endings first). A pre-final
 * ending that is vowel-final (시, 더, 지 of -아/어지-) stays open to contraction with the next ending (시 + 었 → 셨, 시 + 어 → 셔); a
 * consonant-final one (었, 겠, 옵) is fixed. A trailing polite 요 is written with `{ yo: true }`.
 */
export function koGenerate(stem: string, cls: KoConjClass, chain: readonly KoEnding[], opts: { yo?: boolean; vowelNoun?: boolean; honSi?: boolean } = {}): string[] {
  const syls = koSyls(stem);
  if (!syls) return [];
  let states: Array<{ done: KoSyl[]; host: KoHost | null }> = [{ done: [], host: { kind: 'stem', syls, cls, vowelNoun: opts.vowelNoun, honSi: opts.honSi } }];
  for (const e of chain) {
    const next: typeof states = [];
    for (const st of states) {
      if (!st.host) continue;
      for (const f of e.forms) for (const r of koRealize(st.host, f)) {
        if (e.pending) next.push({ done: [...st.done, ...r.syls.slice(0, -1)], host: { kind: 'stem', syls: [r.syls[r.syls.length - 1]], cls: 'R' } });
        else if (e.tag === 'EP') next.push({ done: [...st.done, ...r.syls], host: { kind: 'fixed', noEu: e.id === 'p-humble' } });
        else next.push({ done: [...st.done, ...r.syls], host: null });
      }
    }
    states = next;
  }
  const out = new Set<string>();
  for (const st of states) if (!st.host) out.add(koSylsText(st.done) + (opts.yo ? '요' : ''));
  return [...out];
}

/**
 * The conjugation class shown by a dictionary's infinitive and sequential forms (Wiktionary: "infinitive 들어, sequential 들으니"): the
 * class whose generated infinitive and sequential forms include every form given. Regular wins when it fits; undefined when none does.
 * The lexicon build may use this so that the class it records and the class this engine conjugates by are derived the same way.
 */
export function koDeriveClass(lemma: string, infinitives: readonly string[], sequentials: readonly string[]): KoIrregular | undefined {
  if (!lemma.endsWith('다') || lemma.length < 2) return undefined;
  const stem = lemma.slice(0, -1);
  const syls = koSyls(stem);
  if (!syls) return undefined;
  const last = syls[syls.length - 1];
  const tries: KoIrregular[] = [];
  if (last.l === 'ㅎ' && last.v === 'ㅏ' && last.t === '') tries.push('Ha');
  tries.push('R');
  if (last.t === 'ㄷ') tries.push('D');
  if (last.t === 'ㅂ') tries.push('B');
  if (last.t === 'ㅅ') tries.push('S');
  if (last.t === 'ㅎ') tries.push('H');
  if (last.l === 'ㄹ' && last.v === 'ㅡ' && last.t === '') tries.push('Reu', 'Reo');
  if (last.v === 'ㅜ' && last.t === '') tries.push('U');
  const inf: KoEndingForm = { attach: 'aeo', tail: '' };
  const seq: KoEndingForm = { attach: 'eu', tail: '니' };
  for (const cls of tries) {
    const host: KoHost = { kind: 'stem', syls, cls };
    const gi = new Set(koRealize(host, inf).map((r) => koSylsText(r.syls)));
    const gs = new Set(koRealize(host, seq).map((r) => koSylsText(r.syls)));
    if (infinitives.every((f) => gi.has(f)) && sequentials.every((f) => gs.has(f))) return cls;
  }
  return undefined;
}

/** The irregular classes a stem's SHAPE allows (used only when the lexicon gives no class). */
export function koShapeClasses(stem: string): KoIrregular[] {
  const syls = koSyls(stem);
  if (!syls) return [];
  const last = syls[syls.length - 1];
  const out: KoIrregular[] = [];
  if (last.t === 'ㄷ') out.push('D');
  if (last.t === 'ㅂ') out.push('B');
  if (last.t === 'ㅅ') out.push('S');
  if (last.t === 'ㅎ') out.push('H');
  if (last.l === 'ㄹ' && last.v === 'ㅡ' && last.t === '' && syls.length > 1) out.push('Reu', 'Reo');
  if (koSylsText(syls) === '푸') out.push('U');
  return out;
}
