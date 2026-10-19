/**
 * Written pronunciation aids for a Greek word, in three stated CONVENTIONS, each named as what it is: a scholarly or classroom
 * convention, not a recording of how anyone spoke.
 *   modern     the Modern Greek sound values (ɛ, i for η/ι/υ/ει/οι, v for β, ð for δ, θ, ɣ for γ, x for χ): the only values a voice can speak
 *   koine      a reconstructed first-century pronunciation of the Buth / Horrocks kind (η e, ει = ι i, υ = οι y, αι e, β v, δ ð, γ ɣ …)
 *   erasmian   the classroom convention for Attic (η ē, ει ei, οι oi, υ ü, β b, δ d, γ g, χ kh, θ th; aspirated breathing h-)
 * Letter by letter with the common digraphs; accents are not marked. Exactness is not claimed: the notes say so.
 */
import { bare } from './text';

export type GreekScheme = 'modern' | 'koine' | 'erasmian';

const DIGRAPHS: Record<GreekScheme, Record<string, string>> = {
  modern: { αι: 'e', ει: 'i', οι: 'i', υι: 'i', ου: 'u', αυ: 'av', ευ: 'ev', ηυ: 'iv', γγ: 'ng', γκ: 'ng', γχ: 'nkh', γξ: 'nks', μπ: 'b', ντ: 'd', τσ: 'ts', τζ: 'dz' },
  koine: { αι: 'e', ει: 'i', οι: 'y', υι: 'y', ου: 'u', αυ: 'av', ευ: 'ev', ηυ: 'ev', γγ: 'ng', γκ: 'ng', γχ: 'nkh', γξ: 'nks' },
  erasmian: { αι: 'ai', ει: 'ei', οι: 'oi', υι: 'ui', ου: 'ou', αυ: 'au', ευ: 'eu', ηυ: 'ēu', γγ: 'ng', γκ: 'nk', γχ: 'nkh', γξ: 'nx' },
};
const LETTERS: Record<GreekScheme, Record<string, string>> = {
  modern: { α: 'a', β: 'v', γ: 'ɣ', δ: 'ð', ε: 'e', ζ: 'z', η: 'i', θ: 'θ', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'ks', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'i', φ: 'f', χ: 'x', ψ: 'ps', ω: 'o' },
  koine: { α: 'a', β: 'v', γ: 'ɣ', δ: 'ð', ε: 'e', ζ: 'z', η: 'e', θ: 'θ', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'ks', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'x', ψ: 'ps', ω: 'o' },
  erasmian: { α: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', ζ: 'zd', η: 'ē', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'ü', φ: 'ph', χ: 'kh', ψ: 'ps', ω: 'ō' },
};
export const SCHEME_NOTE: Record<GreekScheme, string> = {
  modern: 'Modern Greek values: η ι υ ει οι all i, β v, δ ð (as in "this"), γ a soft g, χ as in Scottish "loch". The only pronunciation a voice can play.',
  koine: 'A reconstructed first-century (Koine) pronunciation after Buth and Horrocks: η e, ει = ι, υ = οι (ü), αι e; β δ γ already fricatives. A scholarly convention.',
  erasmian: 'The Erasmian classroom convention for Attic: every vowel and diphthong kept apart, β b, δ d, γ g, θ φ χ aspirated stops, rough breathing h-. Not how any Greek spoke.',
};

/** Transliterate in one scheme. Accents are dropped; a rough breathing gives h- in the Erasmian scheme only. */
export function transliterateGreek(surface: string, scheme: GreekScheme): string {
  const nfd = surface.normalize('NFD').toLowerCase();
  const rough = /^[Ͱ-Ͽ]̔|^[Ͱ-Ͽ][̀-ͯ]*̔/.test(nfd) || /^[Ͱ-Ͽ][̀-ͯ]*̔/.test(nfd);
  const b = bare(surface);
  let out = scheme === 'erasmian' && rough ? 'h' : '';
  for (let i = 0; i < b.length; ) {
    const two = b.slice(i, i + 2);
    const d = DIGRAPHS[scheme][two];
    if (d) { out += d; i += 2; continue; }
    out += LETTERS[scheme][b[i]] ?? b[i];
    i++;
  }
  return out;
}

export interface GreekPronunciation { transliteration: string; notes: string[] }

/** The three conventions, the Modern one first (it is what the voice says); the notes name each. */
export function greekPronunciation(surface: string, period?: string): GreekPronunciation {
  const modern = transliterateGreek(surface, 'modern');
  const koine = transliterateGreek(surface, 'koine');
  const erasmian = transliterateGreek(surface, 'erasmian');
  const notes: string[] = [];
  const ancient = period && period !== 'el-mod';
  if (ancient) {
    notes.push(`Koine (reconstructed): ${koine}. ${SCHEME_NOTE.koine}`);
    notes.push(`Erasmian (classroom): ${erasmian}. ${SCHEME_NOTE.erasmian}`);
    notes.push(`Modern: ${modern}. ${SCHEME_NOTE.modern}`);
    notes.push('There is no voice for ancient Greek: any playback uses a Modern Greek voice and is labelled as such.');
  } else {
    notes.push(SCHEME_NOTE.modern);
  }
  return { transliteration: ancient ? koine : modern, notes };
}
