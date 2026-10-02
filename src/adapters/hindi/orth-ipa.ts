/**
 * Aligning a dictionary's IPA transcription of a Hindi word (Wiktionary style: "/kə.məl/", "[kə.mɐl]", ə for the
 * unwritten a, ː for length, a tilde for a nasal vowel) with the word's akṣaras, to learn which unwritten a's are said.
 *
 * MACHINE-DRAFTED (package H1, docs/PLAN12.md). The alignment is deliberately strict: it counts consonants and vowel
 * nuclei and gives up (returns undefined) on any mismatch, so a doubtful transcription never changes a reading.
 */

export interface IpaUnitShape {
  /** 'V' written vowel, 'A' no vowel written, 'M' no vowel written but a nasal or visarga sign, 'D' dead, 'X' not a letter. */
  kind: 'V' | 'A' | 'M' | 'D' | 'X';
  /** Number of consonant letters in the unit. */
  nCons: number;
  nasal: boolean;
  visarga: boolean;
}

export interface IpaUnitResult {
  /** For units without a written vowel: whether the dictionary has a vowel there. */
  said?: boolean;
  /** The part of the transcription that matched this unit. */
  ipa: string;
}

export interface Tok { k: 'C' | 'V' | 'B'; s: string; nasalised: boolean }

const VOWELS = 'aeiouəɐɑæɛɪʊɔɒɨɯyøœʌɜɘɵɤɞɚ';
const DIPHTHONG_SECOND = 'ɪʊ';
const SKIP = 'ˈˌ/[]()⟨⟩  -‿‖|';
const NASAL_CONS = 'mnŋɲɳɴ';

/** Split an IPA string into consonant and vowel tokens; undefined when nothing usable is left. */
export function tokenizeIpa(ipa: string): Tok[] | undefined {
  const t = ipa.normalize('NFD');
  const toks: Tok[] = [];
  let i = 0;
  while (i < t.length) {
    const ch = t[i];
    if (SKIP.includes(ch)) { i++; continue; }
    if (ch === '.') { toks.push({ k: 'B', s: '.', nasalised: false }); i++; continue; }
    // a stray combining mark or length sign with nothing to attach to
    if (/[̀-ͯʰ-˿ːˑ]/.test(ch)) { i++; continue; }
    if (VOWELS.includes(ch)) {
      let s = ch;
      let nasalised = false;
      let long = false;
      let nonSyllabic = false;
      i++;
      while (i < t.length && /[̀-ͯːˑʰʱ˞]/.test(t[i])) {
        if (t[i] === '̃') nasalised = true;
        if (t[i] === 'ː' || t[i] === 'ː') long = true;
        if (t[i] === '̯') nonSyllabic = true;
        s += t[i];
        i++;
      }
      const prev = toks[toks.length - 1];
      if (prev && prev.k === 'V' && !/[ːː]/.test(prev.s) && !long && (DIPHTHONG_SECOND.includes(ch) || nonSyllabic)) {
        prev.s += s;
        prev.nasalised = prev.nasalised || nasalised;
      } else {
        toks.push({ k: 'V', s, nasalised });
      }
      continue;
    }
    // a consonant: base letter, an affricate partner, and its modifiers
    let s = ch;
    i++;
    if ((ch === 't' || ch === 'd') && i < t.length) {
      let j = i;
      if (t[j] === '͡') j++;
      if ('ʃʒɕʑs'.includes(t[j] ?? '#') && (j > i || t[j] === 'ʃ' || t[j] === 'ʒ' || t[j] === 'ɕ' || t[j] === 'ʑ')) { s += t.slice(i, j + 1); i = j + 1; }
    }
    let geminate = false;
    while (i < t.length && /[̀-ͯʰ-˿ːˑ]/.test(t[i])) {
      if (t[i] === 'ː' || t[i] === 'ː') geminate = true; else s += t[i];
      i++;
    }
    toks.push({ k: 'C', s, nasalised: false });
    if (geminate) toks.push({ k: 'C', s, nasalised: false });
  }
  return toks.some((x) => x.k !== 'B') ? toks : undefined;
}

const isNasalCons = (s: string): boolean => NASAL_CONS.includes(s[0]);

/** Align the units with the transcription; undefined when they cannot be matched one for one. */
export function alignIpa(shapes: IpaUnitShape[], ipa: string): IpaUnitResult[] | undefined {
  const toks = tokenizeIpa(ipa);
  if (!toks) return undefined;
  let p = 0;
  const skipB = (): void => { while (p < toks.length && toks[p].k === 'B') p++; };
  const out: IpaUnitResult[] = [];
  for (let u = 0; u < shapes.length; u++) {
    const sh = shapes[u];
    const res: IpaUnitResult = { ipa: '' };
    out.push(res);
    if (sh.kind === 'X') continue;
    for (let c = 0; c < sh.nCons; c++) {
      skipB();
      if (p >= toks.length || toks[p].k !== 'C') return undefined;
      res.ipa += toks[p].s;
      p++;
    }
    if (sh.kind === 'D') { res.said = false; continue; }
    skipB();
    let nucleus: Tok | undefined;
    if (sh.kind === 'V') {
      if (p >= toks.length || toks[p].k !== 'V') return undefined;
      nucleus = toks[p++];
    } else {
      const next = shapes[u + 1];
      const nextIsVowelLetter = next !== undefined && next.kind === 'V' && next.nCons === 0;
      let has = p < toks.length && toks[p].k === 'V';
      // before an independent vowel letter the vowel belongs to that letter unless two vowels stand together
      if (has && nextIsVowelLetter && !(p + 1 < toks.length && toks[p + 1].k === 'V')) has = false;
      res.said = has;
      if (has) nucleus = toks[p++];
    }
    if (nucleus) res.ipa += nucleus.s;
    if (sh.nasal && !(nucleus && nucleus.nasalised)) {
      // the nasal may be written out as a consonant before a stop ("ɦɪn̪.d̪iː")
      let q = p;
      while (q < toks.length && toks[q].k === 'B') q++;
      if (q < toks.length && toks[q].k === 'C' && isNasalCons(toks[q].s)) {
        let r = q + 1;
        while (r < toks.length && toks[r].k === 'B') r++;
        if (r >= toks.length || toks[r].k === 'C') { res.ipa += toks[q].s; p = q + 1; }
      }
    }
    if (sh.visarga) {
      let q = p;
      while (q < toks.length && toks[q].k === 'B') q++;
      if (q < toks.length && toks[q].k === 'C' && (toks[q].s[0] === 'h' || toks[q].s[0] === 'ɦ')) { res.ipa += toks[q].s; p = q + 1; }
    }
  }
  skipB();
  if (p < toks.length) return undefined;
  return out;
}
