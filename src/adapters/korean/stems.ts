/**
 * The stems an 어절 may begin with (docs/korean/PLAN.md "Analysis" step 1): every syllable prefix of the key, and for each prefix the
 * stems its LAST syllable may hide once an ending has fused with it or changed it. The shard loader calls this to know which shards to
 * load before an analysis, so it imports nothing but hangul arithmetic (never analyze.ts).
 *
 * Undone, on the last syllable of a prefix:
 *   a final added by an ending (갔 → 가, 한 → 하, 할 → 하, 삽 → 사, 감 → 가) and a ㄹ dropped before one (사 / 산 / 삽 → 살, 삶 → 살);
 *   the contractions (봐 → 보, 줘 → 주, 돼 → 되, 해 → 하, 셔 → 시, 져 → 지, 켜 → 키, 써 → 쓰, 바빠 → 바쁘, 퍼 → 푸);
 *   the irregular alternations: ㄷ → ㄹ (들 → 듣), ㅂ → 우 (추워 / 추우 / 추운 → 춥, 도와 → 돕), ㅅ dropped (지(어) → 짓),
 *   ㅎ dropped (하얘 / 하야 / 하얀 → 하얗, 그래 → 그렇, 누레 → 누렇), 르 → ㄹㄹ (몰라 → 모르, 불러 → 부르).
 * Bounded: at most 40 stems, plain prefixes first.
 */
import { compose, decompose, FINALS, LEADS, VOWELS, isHangulSyllable } from './hangul';

export const KO_MAX_STEMS = 40;
const INVISIBLE = /[­​-‍⁠﻿]/gu;

const LI = new Map(LEADS.map((c, i) => [c, i]));
const VI = new Map(VOWELS.map((c, i) => [c, i]));
const FI = new Map(FINALS.map((c, i) => [c, i]));
const syl = (l: string, v: string, t: string): string => compose(LI.get(l)!, VI.get(v)!, FI.get(t) ?? 0);

/** Vowel undone after a contraction or ㅡ deletion: the stem's vowel the written one may come from. */
const CONTRACTED: Readonly<Record<string, readonly string[]>> = {
  ㅘ: ['ㅗ'], ㅝ: ['ㅜ'], ㅙ: ['ㅚ'], ㅕ: ['ㅣ'], ㅓ: ['ㅡ', 'ㅜ'], ㅏ: ['ㅡ'], ㅐ: ['ㅏ'],
};
/** ㅎ-irregular a-eo vowels and the stem vowel behind each. */
const H_AEO: Readonly<Record<string, readonly string[]>> = { ㅒ: ['ㅑ'], ㅐ: ['ㅏ', 'ㅓ'], ㅔ: ['ㅓ'], ㅖ: ['ㅕ'] };
const FUSABLE = new Set(['ㅆ', 'ㄴ', 'ㄹ', 'ㅁ', 'ㅂ']);

export function candidateStems(key: string): string[] {
  const k = key.replace(INVISIBLE, '');
  const chars = [...k];
  const plain: string[] = [];
  const variants: string[][] = [];
  for (let i = 1; i <= chars.length; i++) {
    const prefix = chars.slice(0, i).join('');
    plain.push(prefix);
    const vs: string[] = [];
    variants.push(vs);
    const lastCh = chars[i - 1];
    if (!isHangulSyllable(lastCh)) continue;
    const d = decompose(lastCh)!;
    const l = LEADS[d.l], v = VOWELS[d.v], t = FINALS[d.t];
    const q = chars.slice(0, i - 1).join('');
    const prevCh = chars[i - 2];
    const nextCh = chars[i];
    const push = (s: string) => { if (s && s !== prefix) vs.push(s); };
    const tOpen = t === '' || FUSABLE.has(t);
    // a final that came from an ending, or a dropped ㄹ
    if (t !== '') push(q + syl(l, v, ''));
    if (t === '' || t === 'ㄴ' || t === 'ㄹ' || t === 'ㅂ' || t === 'ㅁ') push(q + syl(l, v, 'ㄹ'));
    if (t === 'ㄻ') push(q + syl(l, v, 'ㄹ'));
    // ㄷ → ㄹ
    if (t === 'ㄹ') push(q + syl(l, v, 'ㄷ'));
    // contractions and ㅡ deletion
    if (t === '' || t === 'ㅆ') {
      for (const sv of CONTRACTED[v] ?? []) push(q + syl(l, sv, ''));
      if (v === 'ㅔ' && l === 'ㅅ') push(q + syl(l, 'ㅣ', '')); // 계세요 → 계시
      if (v === 'ㅖ' && l === 'ㄴ') push(q + syl(l, 'ㅣ', '')); // 아녜요 → 아니
      if (v === 'ㅘ' && l === 'ㄴ') push(q + syl(l, 'ㅗ', 'ㅎ')); // 놔 → 놓
      for (const sv of H_AEO[v] ?? []) push(q + syl(l, sv, 'ㅎ'));
    }
    // ㅎ dropped before 으-endings: 하야, 하얀, 그러, 그런
    if ((v === 'ㅑ' || v === 'ㅏ' || v === 'ㅓ' || v === 'ㅕ') && tOpen && t !== 'ㅆ') push(q + syl(l, v, 'ㅎ'));
    // ㅂ → 우 / 워 / 와: the syllable before gets its ㅂ back
    if (l === 'ㅇ' && (v === 'ㅝ' || v === 'ㅘ' || v === 'ㅜ') && tOpen && prevCh && isHangulSyllable(prevCh)) {
      const p = decompose(prevCh)!;
      if (p.t === 0) push(chars.slice(0, i - 2).join('') + syl(LEADS[p.l], VOWELS[p.v], 'ㅂ'));
    }
    // ㅅ dropped before a vowel: 지(어) → 짓, 나(아) → 낫
    if (t === '' && nextCh && isHangulSyllable(nextCh) && LEADS[decompose(nextCh)!.l] === 'ㅇ') push(q + syl(l, v, 'ㅅ'));
    // 르 → ㄹㄹ: 몰라 → 모르, 불렀 → 부르
    if (l === 'ㄹ' && (v === 'ㅏ' || v === 'ㅓ') && (t === '' || t === 'ㅆ') && prevCh && isHangulSyllable(prevCh)) {
      const p = decompose(prevCh)!;
      if (FINALS[p.t] === 'ㄹ') push(chars.slice(0, i - 2).join('') + syl(LEADS[p.l], VOWELS[p.v], '') + '르');
    }
  }
  const out: string[] = [];
  const seen = new Set<string>();
  const take = (s: string) => { if (out.length < KO_MAX_STEMS && !seen.has(s)) { seen.add(s); out.push(s); } };
  for (const p of plain) take(p);
  // variants by prefix length, shortest first (stems are short; endings long)
  for (const vs of variants) for (const s of vs) take(s);
  return out;
}
