/**
 * Revised Romanization (국어의 로마자 표기법) of Korean.
 *
 * `koRomanize` romanizes a string that is ALREADY a pronunciation respelling: a per-jamo mapping (leads g kk n d tt r m b pp s ss
 * '' j jj ch k t p h; vowels a ae ya yae eo e yeo ye o wa wae oe yo u wo we wi yu eu ui i; finals k n t l m p ng; ㄹ is r before a
 * vowel and l otherwise, ㄹㄹ is ll). `koRomanizeWord` romanizes a SPELLING by way of its pronunciation, following RR's own
 * rule: sound changes between letters are shown (신라 → Silla, 종로 → Jongno, 백마 → Baengma, 한국어 → hangugeo, 좋고 → joko), but
 * tensification is not (학교 → hakgyo, 압구정 → apgujeong), and ㅢ stays ui. No capitalisation, no hyphens.
 */
import { romanizeRespelling } from './hangul';
import { koRomanizationRespelling } from './pronunciation';

export { KO_ROMANIZATION_SCHEME } from './pronunciation';

export const koRomanize = (hangul: string): string => romanizeRespelling(hangul);

/**
 * Revised Romanization (2000). `nominal` (default false = the general rule: 좋고 joko, 잡혀 japyeo, 닫히다 dachida): pass true for a noun, proper
 * noun, pronoun or numeral to apply the 체언 exception that keeps the h after ㄱ ㄷ ㅂ (묵호 mukho, 집현전 jiphyeonjeon). Which examples are
 * from the rules text and which inferred is listed at `PronounceOptions.nominal`.
 */
export function koRomanizeWord(word: string, opts?: { nextWord?: string; verbStem?: boolean | number; nominal?: boolean; tenseAfter?: number[]; boundaries?: number[] }): string {
  return romanizeRespelling(koRomanizationRespelling(word, opts));
}
