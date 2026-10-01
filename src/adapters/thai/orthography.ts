/**
 * Thai orthography engine: a rule-based syllable and tone decoder (pure, synchronous, no dependencies).
 *
 * How it works. A written word is cut into syllables by enumerating every way the letters can be read (initial,
 * vowel, final, silent letters) and keeping the plausible ones. One parse that covers the whole word as a single
 * syllable is trusted. Longer words are trusted only when every syllable has a written vowel and no other reading
 * competes; anything decided by a guess (an unwritten vowel, a cluster that could be two syllables, a carried class,
 * a Pali-looking spelling) carries a lower confidence. The tone rules themselves are the standard class + live/dead +
 * tone-mark table. A confident wrong tone is the one unacceptable outcome, so every doubt lowers confidence or drops
 * the tone.
 *
 * Romanization is Royal Institute style (RTGS) without tone marks, one string per syllable. `ipa` is a per-syllable
 * best-effort phonemic string with tone letters, without slashes.
 */
import type { SyllableAnalysis } from '../../core';
import { THAI_ORTH_EXCEPTIONS, THAI_ORTH_SETTLED, THAI_ORTH_SPLITS } from './orth-exceptions';

export type ThaiTone = NonNullable<SyllableAnalysis['tone']>;
type Cls = NonNullable<SyllableAnalysis['initialClass']>;
type Sound = 'k' | 'p' | 't' | 'm' | 'n' | 'ŋ' | 'j' | 'w';
type Ending = SyllableAnalysis['ending'];
type InitKind = 'single' | 'ho' | 'o' | 'cluster' | 'pseudo' | 'tho' | 'forced';
type FinalMode = 'none' | 'optional' | 'required';

// ───────────────────────────── letters and tables ─────────────────────────────

const SARA_A = 'ะ'; // ะ
const MAI_HAN_AKAT = 'ั'; // ั
const SARA_AA = 'า'; // า
const SARA_AM = 'ำ'; // ำ
const SARA_I = 'ิ'; // ิ
const SARA_II = 'ี'; // ี
const SARA_UE = 'ึ'; // ึ
const SARA_UEE = 'ื'; // ื
const SARA_U = 'ุ'; // ุ
const SARA_UU = 'ู'; // ู
const PHINTHU = 'ฺ'; // ฺ
const MAITAIKHU = '็'; // ็
const MAI_EK = '่'; // ่
const MAI_THO = '้'; // ้
const MAI_TRI = '๊'; // ๊
const MAI_CHATTAWA = '๋'; // ๋
const THANTHAKHAT = '์'; // ์
const MAI_YAMOK = 'ๆ'; // ๆ
const PAIYAN_NOI = 'ฯ'; // ฯ

const LEADING_VOWELS = 'เแโใไ';
const MID_CLASS = 'กจดตฎฏบปอ';
const HIGH_CLASS = 'ขฃฉฐถผฝศษสห';
const SONORANTS = 'งญนมยรลว';
const TONE_MARKS = MAI_EK + MAI_THO + MAI_TRI + MAI_CHATTAWA;
const VOWEL_MARKS = MAI_HAN_AKAT + SARA_I + SARA_II + SARA_UE + SARA_UEE + SARA_U + SARA_UU + MAITAIKHU;
const SIGNS = MAI_YAMOK + PAIYAN_NOI;
const TRUE_CLUSTERS: ReadonlySet<string> = new Set([
  'กร', 'กล', 'กว', 'ขร', 'ขล', 'ขว', 'คร', 'คล', 'คว', 'ตร', 'ปร', 'ปล', 'พร', 'พล', 'ผล', 'บร', 'บล', 'ดร', 'ฟร', 'ฟล',
]);
const PSEUDO_SILENT_RO: ReadonlySet<string> = new Set(['จร', 'สร', 'ศร', 'ซร']);
const OA_NAM: ReadonlySet<string> = new Set(['อย่า', 'อยู่', 'อย่าง', 'อยาก']);
/** Letters that mark Pali / Sanskrit spellings, whose readings often break the rules. */
const BOOKISH = /[ฆฌฎฏฐฑฒศษฬฤฦ์]/;

const has = (set: string, ch: string): boolean => ch.length === 1 && set.includes(ch);

const FINAL_GROUPS: ReadonlyArray<readonly [Sound, string]> = [
  ['k', 'กขคฆ'],
  ['t', 'จชซฎฏฐฑฒดตถทธศษส'],
  ['p', 'บปพฟภ'],
  ['n', 'นณญรลฬ'],
  ['m', 'ม'],
  ['ŋ', 'ง'],
  ['j', 'ย'],
  ['w', 'ว'],
];
const FINAL_SOUND = new Map<string, Sound>();
for (const [snd, letters] of FINAL_GROUPS) for (const ch of letters) FINAL_SOUND.set(ch, snd);

const FINAL_IPA: Readonly<Record<Sound, string>> = { k: 'k̚', p: 'p̚', t: 't̚', m: 'm', n: 'n', ŋ: 'ŋ', j: 'j', w: 'w' };
const FINAL_ROM: Readonly<Record<Sound, string>> = { k: 'k', p: 'p', t: 't', m: 'm', n: 'n', ŋ: 'ng', j: 'i', w: 'o' };
const LIVE_SOUNDS = 'mnŋjw';

const INITIAL_GROUPS: ReadonlyArray<readonly [string, string, string]> = [
  ['k', 'k', 'ก'], ['kʰ', 'kh', 'ขฃคฅฆ'], ['ŋ', 'ng', 'ง'], ['t͡ɕ', 'ch', 'จ'], ['t͡ɕʰ', 'ch', 'ฉชฌ'],
  ['s', 's', 'ซศษส'], ['j', 'y', 'ญย'], ['d', 'd', 'ฎด'], ['t', 't', 'ฏต'], ['tʰ', 'th', 'ฐฑฒถทธ'],
  ['n', 'n', 'ณน'], ['b', 'b', 'บ'], ['p', 'p', 'ป'], ['pʰ', 'ph', 'ผพภ'], ['f', 'f', 'ฝฟ'], ['m', 'm', 'ม'],
  ['r', 'r', 'ร'], ['l', 'l', 'ลฬ'], ['w', 'w', 'ว'], ['h', 'h', 'หฮ'], ['ʔ', '', 'อ'],
];
const INITIAL_SOUND = new Map<string, { ipa: string; rom: string }>();
for (const [ipa, rom, letters] of INITIAL_GROUPS) for (const ch of letters) INITIAL_SOUND.set(ch, { ipa, rom });

interface Nucleus {
  long: boolean;
  ipa: string;
  rom: string;
}
/** Vowel patterns as written (◌ = the consonant position) with length, IPA and Royal Institute spelling. */
const NUCLEI: Readonly<Record<string, Nucleus>> = {
  'implicit-o': { long: false, ipa: 'o', rom: 'o' },
  'implicit-a': { long: false, ipa: 'a', rom: 'a' },
  '◌ะ': { long: false, ipa: 'a', rom: 'a' },
  '◌ั': { long: false, ipa: 'a', rom: 'a' },
  '◌า': { long: true, ipa: 'aː', rom: 'a' },
  '◌ำ': { long: false, ipa: 'a', rom: 'a' },
  '◌ิ': { long: false, ipa: 'i', rom: 'i' },
  '◌ี': { long: true, ipa: 'iː', rom: 'i' },
  '◌ึ': { long: false, ipa: 'ɯ', rom: 'ue' },
  '◌ื': { long: true, ipa: 'ɯː', rom: 'ue' },
  '◌ือ': { long: true, ipa: 'ɯː', rom: 'ue' },
  '◌ุ': { long: false, ipa: 'u', rom: 'u' },
  '◌ู': { long: true, ipa: 'uː', rom: 'u' },
  '◌็อ': { long: false, ipa: 'ɔ', rom: 'o' },
  '◌อ': { long: true, ipa: 'ɔː', rom: 'o' },
  '◌ัวะ': { long: false, ipa: 'ua', rom: 'ua' },
  '◌ัว': { long: true, ipa: 'ua', rom: 'ua' },
  '◌ว◌': { long: true, ipa: 'ua', rom: 'ua' },
  '◌รร': { long: false, ipa: 'a', rom: 'a' },
  'เ◌ะ': { long: false, ipa: 'e', rom: 'e' },
  'เ◌็': { long: false, ipa: 'e', rom: 'e' },
  'เ◌': { long: true, ipa: 'eː', rom: 'e' },
  'แ◌ะ': { long: false, ipa: 'ɛ', rom: 'ae' },
  'แ◌็': { long: false, ipa: 'ɛ', rom: 'ae' },
  'แ◌': { long: true, ipa: 'ɛː', rom: 'ae' },
  'โ◌ะ': { long: false, ipa: 'o', rom: 'o' },
  'โ◌': { long: true, ipa: 'oː', rom: 'o' },
  'เ◌าะ': { long: false, ipa: 'ɔ', rom: 'o' },
  'เ◌อะ': { long: false, ipa: 'ɤ', rom: 'oe' },
  'เ◌อ': { long: true, ipa: 'ɤː', rom: 'oe' },
  'เ◌ิ': { long: true, ipa: 'ɤː', rom: 'oe' },
  'เ◌ียะ': { long: false, ipa: 'ia', rom: 'ia' },
  'เ◌ีย': { long: true, ipa: 'ia', rom: 'ia' },
  'เ◌ือะ': { long: false, ipa: 'ɯa', rom: 'uea' },
  'เ◌ือ': { long: true, ipa: 'ɯa', rom: 'uea' },
  'เ◌า': { long: false, ipa: 'a', rom: 'a' },
  'ใ◌': { long: false, ipa: 'a', rom: 'a' },
  'ไ◌': { long: false, ipa: 'a', rom: 'a' },
  'ไ◌ย': { long: false, ipa: 'a', rom: 'a' },
};

const TONE_LETTERS: Readonly<Record<ThaiTone, string>> = {
  mid: '˧',
  low: '˨˩',
  falling: '˥˩',
  high: '˦˥',
  rising: '˩˩˦',
};
const MARK_NAME: Readonly<Record<string, string>> = {
  [MAI_EK]: 'mai ek',
  [MAI_THO]: 'mai tho',
  [MAI_TRI]: 'mai tri',
  [MAI_CHATTAWA]: 'mai chattawa',
};

const isConsonant = (ch: string): boolean => {
  if (ch.length !== 1) return false;
  const c = ch.charCodeAt(0);
  return c >= 0x0e01 && c <= 0x0e2e && c !== 0x0e24 && c !== 0x0e26;
};
const isCombining = (ch: string): boolean => {
  if (ch.length !== 1) return false;
  const c = ch.charCodeAt(0);
  return c === 0x0e31 || (c >= 0x0e34 && c <= 0x0e3a) || (c >= 0x0e47 && c <= 0x0e4e);
};
const classOf = (ch: string): Cls => (has(MID_CLASS, ch) ? 'mid' : has(HIGH_CLASS, ch) ? 'high' : 'low');
const isPlainThai = (s: string): boolean => {
  if (s.length === 0) return false;
  let consonants = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (!((c >= 0x0e01 && c <= 0x0e3a) || (c >= 0x0e40 && c <= 0x0e4e))) return false;
    if (isConsonant(s.charAt(i))) consonants++;
  }
  return consonants > 0 || /[ฤฦ]/.test(s);
};

// ───────────────────────────── candidate syllables ─────────────────────────────

interface Cand {
  start: number;
  end: number; // after silent letters, before trailing signs
  lead: string; // leading vowel letter or ''
  initial: string; // initial consonant letters as written
  initialKind: InitKind;
  initialCls: Cls;
  key: string; // nucleus key ('implicit-o', 'implicit-a', 'rue', 'rue-long', or the written pattern)
  long: boolean;
  final?: string;
  finalSound?: Sound; // from a written final
  endSound?: Sound; // implied by the vowel (ำ → m, ใ ไ → j, เ◌า → w, รร → n)
  silent: string; // silent letters absorbed (thanthakhat groups, silent ร)
  toneMark?: string;
  penalty: number;
  roHan: boolean;
  pseudoFinal: boolean;
}
interface Init {
  letters: string;
  kind: InitKind;
  cls: Cls;
  q0: number;
}
interface VOpt {
  key: string;
  long: boolean;
  vEnd: number;
  finals: FinalMode;
  endSound?: Sound;
}
interface FinalOpt {
  end: number;
  final?: string;
  finalSound?: Sound;
  silent: string;
  pseudoFinal?: boolean;
}
interface ParseOpts {
  /** Respelling only: index of the consonant whose phinthu joins it to the next consonant. */
  forcedPair?: number;
}

const endsWord = (s: string, k: number): boolean => {
  for (let j = k; j < s.length; j++) if (!has(SIGNS, s.charAt(j))) return false;
  return true;
};

/** A letter can be a final only when nothing attaches to it as an initial (no mark or spacing vowel after it). */
function isFinalLetter(s: string, r: number): boolean {
  const ch = s.charAt(r);
  if (!FINAL_SOUND.has(ch)) return false;
  const nx = s.charAt(r + 1);
  if (nx !== '' && (isCombining(nx) || nx === SARA_A || nx === SARA_AA || nx === SARA_AM)) return false;
  return true;
}

/** Silent letters ending in thanthakhat: X์, Xิ์ (ศักดิ์), and ทร์ / ตร์ (จันทร์). Returns the index after them. */
function silentRun(s: string, r: number): number {
  let k = r;
  for (;;) {
    const c = s.charAt(k);
    if (!isConsonant(c)) break;
    if ((c === 'ท' || c === 'ต') && s.charAt(k + 1) === 'ร' && s.charAt(k + 2) === THANTHAKHAT) {
      k += 3;
    } else if (s.charAt(k + 1) === THANTHAKHAT) {
      k += 2;
    } else if (has(VOWEL_MARKS, s.charAt(k + 1)) && s.charAt(k + 2) === THANTHAKHAT) {
      k += 3;
    } else {
      break;
    }
  }
  return k;
}

function finalOptions(s: string, r0: number, mode: FinalMode): FinalOpt[] {
  const res: FinalOpt[] = [];
  const r1 = silentRun(s, r0);
  const silentBefore = s.slice(r0, r1);
  if (mode !== 'required') res.push({ end: r1, silent: silentBefore });
  if (mode !== 'none' && isFinalLetter(s, r1)) {
    const ch = s.charAt(r1);
    const snd = FINAL_SOUND.get(ch);
    const r2 = silentRun(s, r1 + 1);
    res.push({ end: r2, final: ch, finalSound: snd, silent: silentBefore + s.slice(r1 + 1, r2) });
    // a silent ร closing the word after ก ต ท (จักร มิตร บุตร)
    if (has('กตท', ch) && s.charAt(r1 + 1) === 'ร' && endsWord(s, r1 + 2)) {
      res.push({ end: r1 + 2, final: ch, finalSound: snd, silent: silentBefore + 'ร', pseudoFinal: true });
    }
  }
  return res;
}

function vowelOptions(s: string, lead: string, mv: string, q: number): VOpt[] {
  const ch = s.charAt(q);
  const ch2 = s.charAt(q + 1);
  const o: VOpt[] = [];
  const push = (key: string, long: boolean, vEnd: number, finals: FinalMode, endSound?: Sound): void => {
    o.push({ key, long, vEnd, finals, endSound });
  };
  switch (lead) {
    case '':
      if (mv === '') {
        if (ch === SARA_A) push('◌ะ', false, q + 1, 'none');
        else if (ch === SARA_AA) push('◌า', true, q + 1, 'optional');
        else if (ch === SARA_AM) push('◌ำ', false, q + 1, 'none', 'm');
        else if (ch === 'อ') push('◌อ', true, q + 1, 'optional');
        else if (ch === 'ว' && isConsonant(ch2)) push('◌ว◌', true, q + 1, 'required');
        else if (ch === 'ร' && ch2 === 'ร') {
          push('◌รร', false, q + 2, 'required');
          push('◌รร', false, q + 2, 'none', 'n');
        }
      } else if (mv === MAI_HAN_AKAT) {
        if (ch === 'ว') {
          if (ch2 === SARA_A) push('◌ัวะ', false, q + 2, 'none');
          else push('◌ัว', true, q + 1, 'none');
        } else {
          push('◌ั', false, q, 'required');
        }
      } else if (mv === SARA_I) push('◌ิ', false, q, 'optional');
      else if (mv === SARA_II) push('◌ี', true, q, 'optional');
      else if (mv === SARA_UE) push('◌ึ', false, q, 'optional');
      else if (mv === SARA_UEE) {
        if (ch === 'อ') push('◌ือ', true, q + 1, 'none');
        else push('◌ื', true, q, 'optional');
      } else if (mv === SARA_U) push('◌ุ', false, q, 'optional');
      else if (mv === SARA_UU) push('◌ู', true, q, 'optional');
      else if (mv === MAITAIKHU && ch === 'อ') push('◌็อ', false, q + 1, 'optional');
      break;
    case 'เ':
      if (mv === '') {
        if (ch === SARA_A) push('เ◌ะ', false, q + 1, 'none');
        else if (ch === SARA_AA) {
          if (ch2 === SARA_A) push('เ◌าะ', false, q + 2, 'none');
          else push('เ◌า', false, q + 1, 'none', 'w');
        } else {
          if (ch === 'อ') {
            if (ch2 === SARA_A) push('เ◌อะ', false, q + 2, 'none');
            else push('เ◌อ', true, q + 1, 'none');
          }
          push('เ◌', true, q, 'optional');
        }
      } else if (mv === MAITAIKHU) push('เ◌็', false, q, 'required');
      else if (mv === SARA_I) push('เ◌ิ', true, q, 'optional');
      else if (mv === SARA_II && ch === 'ย') {
        if (ch2 === SARA_A) push('เ◌ียะ', false, q + 2, 'none');
        else push('เ◌ีย', true, q + 1, 'optional');
      } else if (mv === SARA_UEE && ch === 'อ') {
        if (ch2 === SARA_A) push('เ◌ือะ', false, q + 2, 'none');
        else push('เ◌ือ', true, q + 1, 'optional');
      }
      break;
    case 'แ':
      if (mv === '') {
        if (ch === SARA_A) push('แ◌ะ', false, q + 1, 'none');
        else push('แ◌', true, q, 'optional');
      } else if (mv === MAITAIKHU) push('แ◌็', false, q, 'required');
      break;
    case 'โ':
      if (mv === '') {
        if (ch === SARA_A) push('โ◌ะ', false, q + 1, 'none');
        else push('โ◌', true, q, 'optional');
      }
      break;
    case 'ใ':
      if (mv === '') push('ใ◌', false, q, 'none', 'j');
      break;
    case 'ไ':
      if (mv === '') {
        push('ไ◌', false, q, 'none', 'j');
        const nx = s.charAt(q + 1);
        if (ch === 'ย' && !isCombining(nx) && nx !== SARA_A && nx !== SARA_AA && nx !== SARA_AM) {
          push('ไ◌ย', false, q + 1, 'none', 'j');
        }
      }
      break;
    default:
      break;
  }
  return o;
}

function initialOptions(s: string, p: number, opt: ParseOpts): Init[] {
  const c1 = s.charAt(p);
  const c2 = s.charAt(p + 1);
  const forced = opt.forcedPair === p;
  const res: Init[] = [];
  if (!forced) res.push({ letters: c1, kind: 'single', cls: classOf(c1), q0: p + 1 });
  if (!isConsonant(c2)) return res;
  if (c2 === 'ร' && s.charAt(p + 2) === 'ร' && !forced) return res; // รร is a vowel, not a cluster
  const pair = c1 + c2;
  const q0 = p + 2;
  if (c1 === 'ห' && has(SONORANTS, c2)) res.push({ letters: pair, kind: 'ho', cls: 'high', q0 });
  else if (c1 === 'อ' && c2 === 'ย') res.push({ letters: pair, kind: 'o', cls: 'mid', q0 });
  else if (TRUE_CLUSTERS.has(pair)) res.push({ letters: pair, kind: 'cluster', cls: classOf(c1), q0 });
  else if (PSEUDO_SILENT_RO.has(pair)) res.push({ letters: pair, kind: 'pseudo', cls: classOf(c1), q0 });
  else if (pair === 'ทร') res.push({ letters: pair, kind: 'tho', cls: 'low', q0 });
  else if (forced) res.push({ letters: pair, kind: 'forced', cls: classOf(c1), q0 });
  return res;
}

/** True when the lone consonant at p could instead start a cluster or a leading ห / อ pair. */
function splitsPair(s: string, p: number): boolean {
  const c1 = s.charAt(p);
  const c2 = s.charAt(p + 1);
  if (!isConsonant(c2)) return false;
  return TRUE_CLUSTERS.has(c1 + c2) || (c1 === 'ห' && has(SONORANTS, c2)) || (c1 === 'อ' && c2 === 'ย');
}

function afterInitial(s: string, i: number, lead: string, init: Init, out: Cand[]): void {
  let q = init.q0;
  let mv = '';
  let tone = '';
  while (q < s.length && isCombining(s.charAt(q))) {
    const m = s.charAt(q);
    if (has(TONE_MARKS, m)) {
      if (tone) return;
      tone = m;
    } else if (has(VOWEL_MARKS, m)) {
      if (mv) return;
      mv = m;
    } else {
      return; // thanthakhat, phinthu, nikhahit directly after an initial: not decoded
    }
    q++;
  }
  const make = (key: string, long: boolean, f: FinalOpt, endSound: Sound | undefined, penalty: number): void => {
    const c2 = init.letters.charAt(1);
    if (init.kind === 'o' && !OA_NAM.has(s.slice(i, f.end))) return;
    if (key === 'implicit-o') {
      if (f.finalSound === 'j' || f.finalSound === 'w') return;
      if (init.kind === 'pseudo' || init.kind === 'o') return;
      if (init.kind === 'tho' && f.final !== 'ง') return;
      if ((init.kind === 'cluster' || init.kind === 'forced') && c2 === 'ว') return;
      // อ or ว as the start of a later syllable never carries an unwritten vowel
      if (init.kind === 'single' && i > 0 && (init.letters === 'อ' || init.letters === 'ว')) return;
    }
    if (key === '◌ว◌' && (f.finalSound === 'w' || c2 === 'ว')) return;
    out.push({
      start: i,
      end: f.end,
      lead,
      initial: init.letters,
      initialKind: init.kind,
      initialCls: init.cls,
      key,
      long,
      final: f.final,
      finalSound: f.finalSound,
      endSound,
      silent: f.silent,
      toneMark: tone || undefined,
      penalty,
      roHan: key === '◌รร',
      pseudoFinal: f.pseudoFinal === true,
    });
  };

  for (const v of vowelOptions(s, lead, mv, q)) {
    for (const f of finalOptions(s, v.vEnd, v.finals)) make(v.key, v.long, f, v.endSound, v.key === '◌รร' ? 0.5 : 0);
  }
  if (lead === '' && mv === '') {
    // no vowel written: o between two consonants (คน, นก), or a short a on a lone consonant (the ส of สบาย)
    for (const f of finalOptions(s, q, 'required')) make('implicit-o', false, f, undefined, 0.5);
    const nx = s.charAt(q);
    if (tone === '' && init.kind === 'single' && (isConsonant(nx) || has(LEADING_VOWELS, nx) || nx === 'ฤ' || nx === 'ฦ')) {
      make('implicit-a', false, { end: q, silent: '' }, undefined, splitsPair(s, i) ? 2 : 3);
    }
  }
}

function rueCand(s: string, i: number): Cand {
  const long = s.charAt(i + 1) === 'ๅ';
  return {
    start: i,
    end: i + (long ? 2 : 1),
    lead: '',
    initial: s.charAt(i),
    initialKind: 'single',
    initialCls: 'low',
    key: long ? 'rue-long' : 'rue',
    long,
    silent: '',
    penalty: 0,
    roHan: false,
    pseudoFinal: false,
  };
}

function candidatesAt(s: string, i: number, opt: ParseOpts): Cand[] {
  const out: Cand[] = [];
  let p = i;
  let lead = '';
  if (has(LEADING_VOWELS, s.charAt(i))) {
    lead = s.charAt(i);
    p = i + 1;
  }
  const c1 = s.charAt(p);
  if (c1 === '') return out;
  if (lead === '' && (c1 === 'ฤ' || c1 === 'ฦ')) return [rueCand(s, i)];
  if (!isConsonant(c1)) return out;
  for (const init of initialOptions(s, p, opt)) afterInitial(s, i, lead, init, out);
  const seen = new Set<string>();
  return out.filter((c) => {
    const k = [c.end, c.key, c.initial, c.initialKind, c.final ?? '', c.toneMark ?? '', c.silent, c.endSound ?? '', c.pseudoFinal].join('|');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ───────────────────────────── parses ─────────────────────────────

interface Parse {
  cands: Cand[];
  spans: number[]; // end of each syllable including trailing signs
  penalty: number;
}
const PARSE_LIMIT = 120;

function enumerateParses(s: string, opt: ParseOpts): { parses: Parse[]; overflow: boolean } {
  const n = s.length;
  const none = { parses: [] as Parse[], overflow: false };
  if (n === 0 || has(SIGNS, s.charAt(0))) return none;
  const cache = new Map<number, Cand[]>();
  const candsAt = (i: number): Cand[] => {
    let c = cache.get(i);
    if (!c) {
      c = candidatesAt(s, i, opt);
      cache.set(i, c);
    }
    return c;
  };
  const skipSigns = (e: number): number => {
    let k = e;
    while (k < n && has(SIGNS, s.charAt(k))) k++;
    return k;
  };
  const okMemo = new Map<number, boolean>();
  const canFinish = (i: number): boolean => {
    if (i === n) return true;
    const memo = okMemo.get(i);
    if (memo !== undefined) return memo;
    let r = false;
    for (const c of candsAt(i)) {
      const e = skipSigns(c.end);
      if (c.key === 'implicit-a' && e >= n) continue;
      if (canFinish(e)) {
        r = true;
        break;
      }
    }
    okMemo.set(i, r);
    return r;
  };
  const parses: Parse[] = [];
  let overflow = false;
  const acc: Cand[] = [];
  const spans: number[] = [];
  const walk = (i: number, pen: number): void => {
    if (overflow) return;
    if (i === n) {
      if (parses.length >= PARSE_LIMIT) {
        overflow = true;
        return;
      }
      parses.push({ cands: [...acc], spans: [...spans], penalty: pen });
      return;
    }
    for (const c of candsAt(i)) {
      const e = skipSigns(c.end);
      if (c.key === 'implicit-a' && e >= n) continue;
      if (!canFinish(e)) continue;
      acc.push(c);
      spans.push(e);
      walk(e, pen + c.penalty);
      acc.pop();
      spans.pop();
    }
  };
  walk(0, 0);
  return { parses, overflow };
}

// ───────────────────────────── tone rules ─────────────────────────────

function toneOf(cls: Cls, ending: Ending, long: boolean, mark: string | undefined): { tone?: ThaiTone; rule: string } {
  const who = `${cls}-class consonant`;
  if (mark) {
    const name = MARK_NAME[mark] ?? 'tone mark';
    let tone: ThaiTone | undefined;
    if (mark === MAI_EK) tone = cls === 'low' ? 'falling' : 'low';
    else if (mark === MAI_THO) tone = cls === 'low' ? 'high' : 'falling';
    else if (mark === MAI_TRI) tone = cls === 'mid' ? 'high' : undefined;
    else if (mark === MAI_CHATTAWA) tone = cls === 'mid' ? 'rising' : undefined;
    if (!tone) return { rule: `${who} + ${name}: this mark is only expected after a mid-class consonant, so Go gives no tone` };
    return { tone, rule: `${who} + ${name} → ${tone} tone` };
  }
  if (ending === 'dead') {
    if (cls === 'low') {
      const tone: ThaiTone = long ? 'falling' : 'high';
      return { tone, rule: `${who}, dead syllable with a ${long ? 'long' : 'short'} vowel → ${tone} tone` };
    }
    return { tone: 'low', rule: `${who}, dead syllable → low tone` };
  }
  const tone: ThaiTone = cls === 'high' ? 'rising' : 'mid';
  const how = ending === 'open' ? 'long open vowel (counts as live)' : 'live syllable';
  return { tone, rule: `${who}, ${how} → ${tone} tone` };
}

// ───────────────────────────── building a syllable ─────────────────────────────

type Draft = Omit<SyllableAnalysis, 'confidence'> & { _cand: Cand; _carried: boolean };

function initialSound(c: Cand): { ipa: string; rom: string } {
  const one = (ch: string): { ipa: string; rom: string } => INITIAL_SOUND.get(ch) ?? { ipa: '', rom: '' };
  switch (c.initialKind) {
    case 'ho':
      return one(c.initial.charAt(1));
    case 'o':
      return one('ย');
    case 'pseudo':
      return one(c.initial.charAt(0));
    case 'tho':
      return { ipa: 's', rom: 's' };
    case 'cluster':
    case 'forced': {
      const a = one(c.initial.charAt(0));
      const b = one(c.initial.charAt(1));
      return { ipa: a.ipa + b.ipa, rom: a.rom + b.rom };
    }
    default:
      return one(c.initial);
  }
}

/** Turn one candidate into a syllable. `src` is the string the offsets index; `prev` enables the class carry-over. */
function makeDraft(c: Cand, src: string, spanEnd: number, prev: Cand | undefined): Draft {
  const isRue = c.key === 'rue' || c.key === 'rue-long';
  const snd = c.finalSound ?? c.endSound;
  const ending: Ending = isRue ? (c.long ? 'open' : 'dead') : snd ? (has(LIVE_SOUNDS, snd) ? 'live' : 'dead') : c.long ? 'open' : 'dead';

  let cls = c.initialCls;
  let carried = false;
  if (
    prev &&
    prev.key === 'implicit-a' &&
    prev.initialKind === 'single' &&
    prev.initialCls !== 'low' &&
    c.initialKind === 'single' &&
    has(SONORANTS, c.initial)
  ) {
    cls = prev.initialCls;
    carried = true;
  }

  let tone: ThaiTone | undefined;
  let rule: string;
  if (isRue) {
    rule = 'ฤ is read ri, rue or roe depending on the word, so Go gives no tone';
  } else {
    const t = toneOf(cls, ending, c.long, c.toneMark);
    tone = t.tone;
    rule = t.rule;
    if (c.endSound && !c.final && c.key !== '◌รร') rule += ' (a short vowel that ends in a sonorant, so the syllable is live)';
    if (carried && prev) rule = carryRule(prev.initial.charAt(0), rule);
  }

  let ipa: string | undefined;
  let romanization: string | undefined;
  let vowelSound: string | undefined;
  if (!isRue) {
    const ini = initialSound(c);
    let nuc = NUCLEI[c.key] ?? NUCLEI['implicit-a'];
    if (c.key === 'เ◌' && c.final === 'ย') nuc = { long: true, ipa: 'ɤː', rom: 'oe' }; // เลย เคย เฉย: ɤː + j
    const fin = snd ? FINAL_IPA[snd] : '';
    ipa = ini.ipa + nuc.ipa + fin + (tone ? TONE_LETTERS[tone] : '');
    romanization = ini.rom + nuc.rom + (snd ? FINAL_ROM[snd] : '');
    vowelSound = nuc.rom;
  }

  const d: Draft = {
    text: src.slice(c.start, spanEnd),
    start: c.start,
    end: spanEnd,
    initial: c.initial,
    initialClass: cls,
    vowel: isRue ? c.initial + (c.long ? 'ๅ' : '') : c.key.startsWith('implicit') ? '◌' : c.key,
    vowelLength: c.long ? 'long' : 'short',
    ending,
    rule,
    _cand: c,
    _carried: carried,
  };
  if (c.initialKind === 'ho' || c.initialKind === 'o' || c.initialKind === 'cluster' || c.initialKind === 'forced') d.cluster = c.initial;
  if (c.final) d.final = c.final;
  if (snd) d.finalSound = snd;
  if (c.toneMark) d.toneMark = c.toneMark;
  if (tone) d.tone = tone;
  if (ipa !== undefined) d.ipa = ipa;
  if (romanization !== undefined) d.romanization = romanization;
  if (vowelSound !== undefined) d.vowelSound = vowelSound;
  // a carried class is read as if an unwritten ห stood before the letter: show that spelling
  if (carried) d.respelled = c.lead + 'ห' + src.slice(c.start + c.lead.length, spanEnd);
  return d;
}

/**
 * Explain a class that carries over from the syllable before ("the class of ข carries over: read as high class; live
 * syllable → rising tone"). `base` is the tone sentence, which starts with "<class>-class consonant".
 */
function carryRule(from: string | undefined, base: string): string {
  const m = /^(mid|high|low)-class consonant(?:, | \+ )(.*)$/.exec(base);
  if (!m) return base;
  const why = from ? `the class of ${from} carries over` : 'an unwritten ห stands before this letter';
  return `${why}: read as ${m[1]} class; ${m[2]}`;
}

function draftsOf(s: string, parse: Parse): Draft[] {
  return parse.cands.map((c, k) => makeDraft(c, s, parse.spans[k], k > 0 ? parse.cands[k - 1] : undefined));
}

function finish(d: Draft, confidence: number): SyllableAnalysis {
  const { _cand, _carried, ...rest } = d;
  void _cand;
  void _carried;
  return { ...rest, confidence: Math.round(confidence * 100) / 100 };
}

// ───────────────────────────── decoding by rule ─────────────────────────────

function pickBest(parses: Parse[]): Parse {
  let best = parses[0];
  for (const p of parses) {
    if (p.penalty < best.penalty - 1e-9 || (Math.abs(p.penalty - best.penalty) < 1e-9 && p.cands.length < best.cands.length)) best = p;
  }
  return best;
}

function decodeByRules(surface: string): SyllableAnalysis[] {
  if (!isPlainThai(surface)) return [];
  const { parses, overflow } = enumerateParses(surface, {});
  if (parses.length === 0) return [];
  const best = pickBest(parses);
  const drafts = draftsOf(surface, best);
  const mono = drafts.length === 1;
  const core = surface.replace(/[ๆฯ]/g, '');

  // Other readings that compete with the chosen one (a lone-consonant syllable costs 3, a split cluster 2).
  const altDrafts = parses.filter((p) => p !== best && p.penalty - best.penalty < 3).map((p) => draftsOf(surface, p));
  const sameSyllable = (a: Draft, b: Draft): boolean => a.start === b.start && a.end === b.end && a.tone === b.tone;

  const implicitInside = !mono && best.cands.some((c) => c.key === 'implicit-o' || c.key === 'implicit-a' || c.roHan);
  const last = best.cands[best.cands.length - 1];
  const shortOpenEnd = !mono && !last.final && !last.endSound && !last.long && last.key !== 'rue';
  const bookish = !mono && BOOKISH.test(core);
  // Indic loans: a syllable-final letter other than the plain native finals may also start a hidden linking syllable
  // (ราชการ = ราด-ชะ-กาน, สารภาพ = สา-ระ-พาบ). The spelling cannot say, so the whole word is not confident.
  const hiddenLink = best.cands.slice(0, -1).some((c) => c.final !== undefined && !has('กดบงนมยว', c.final));
  // ◌ำ followed by a low sonorant: the class is passed on in ตำรวจ, สำเร็จ, but not in สำนัก, อำนาจ.
  const amClass = best.cands.some((c, k) => {
    const nx = best.cands[k + 1];
    if (!nx || c.key !== '◌ำ' || c.initialCls === 'low') return false;
    if (nx.initialKind !== 'single' || !has(SONORANTS, nx.initial)) return false;
    return drafts[k + 1].ending === 'dead' || c.initialCls === 'high';
  });

  return drafts.map((d) => {
    const c = d._cand;
    let conf: number;
    if (c.key.startsWith('rue')) conf = 0.4;
    else if (!d.tone) conf = 0.4;
    else if (mono) conf = c.key === 'implicit-o' ? 0.85 : 0.95;
    else conf = c.key === 'implicit-a' ? 0.6 : c.key === 'implicit-o' ? 0.7 : 0.9;
    if (c.roHan) conf = Math.min(conf, 0.7);
    if (c.pseudoFinal) conf = Math.min(conf, 0.72);
    if (d._carried) conf = Math.min(conf, 0.75);
    if (implicitInside || bookish || shortOpenEnd) conf = Math.min(conf, 0.72);
    if (hiddenLink || amClass) conf = Math.min(conf, 0.6);
    if (mono) {
      // another one-syllable reading of the same letters with a different tone
      if (altDrafts.some((a) => a.length === 1 && a[0].tone !== d.tone)) conf = Math.min(conf, 0.55);
    } else if (altDrafts.some((a) => !a.some((x) => sameSyllable(x, d)))) {
      conf = Math.min(conf, 0.55);
    }
    if (overflow) conf = Math.min(conf, 0.5);
    return finish(d, conf);
  });
}

// ───────────────────────────── exports: decoding ─────────────────────────────

/** Reviewed words: irregular spellings carry a note; settled ones are read correctly by the rules but only as a guess. */
const LISTED = new Map<string, { respelling: string; note?: string; split?: string }>();
for (const e of THAI_ORTH_SETTLED) LISTED.set(e.surface, { respelling: e.respelling, split: THAI_ORTH_SPLITS[e.surface] });
for (const e of THAI_ORTH_EXCEPTIONS) LISTED.set(e.surface, { respelling: e.respelling, note: e.note, split: THAI_ORTH_SPLITS[e.surface] });

/** Decode one written Thai word by rule (+ reviewed exception list). Never guesses silently: see PLAN5 §A. */
export function decodeThai(surface: string): SyllableAnalysis[] {
  const ex = LISTED.get(surface);
  if (ex) {
    const r = respell(surface, ex.respelling, undefined, { listed: true, note: ex.note, split: ex.split });
    if (r.length > 0) return r;
  }
  return decodeByRules(surface);
}

/** One respelling syllable: phinthu (ฺ) joins its consonant to the next one as an initial pair. */
function parseRespellingPart(part: string): { cand: Cand; str: string } | undefined {
  const idx = part.indexOf(PHINTHU);
  let str = part;
  let forcedPair: number | undefined;
  if (idx >= 0) {
    str = part.slice(0, idx) + part.slice(idx + 1);
    if (str.includes(PHINTHU)) return undefined;
    forcedPair = idx - 1;
  }
  if (!isPlainThai(str)) return undefined;
  const found = candidatesAt(str, 0, { forcedPair })
    .filter((c) => c.key !== 'implicit-a' && (c.end === str.length || endsWord(str, c.end)))
    .sort((a, b) => a.penalty - b.penalty);
  if (found.length === 0) return undefined;
  const top = found[0];
  const topTone = makeDraft(top, str, str.length, undefined).tone;
  for (const other of found.slice(1)) {
    if (other.penalty - top.penalty > 1e-9) break;
    if (makeDraft(other, str, str.length, undefined).tone !== topTone) return undefined;
  }
  return { cand: top, str };
}

function splitIpa(ipa: string): string[] {
  return ipa
    .replace(/[/[\]]/g, ' ')
    .split(/[.\s]+/)
    .filter((x) => x.length > 0);
}

/**
 * Decode a dictionary's phonemic respelling ("ขะ-หฺนม"), which is regular by construction, and lay the result over
 * the written word. `ipa` (when given) is the authority for tone; a disagreement lowers confidence and is flagged.
 * Syllables are laid over `surface` when the rule decode has the same syllable count (or the respelling is one
 * syllable); otherwise every syllable spans the whole word and its `text` is the respelling part.
 */
export function decodeThaiRespelling(surface: string, respelling: string, ipa?: string): SyllableAnalysis[] {
  return respell(surface, respelling, ipa, {});
}

type Written = Pick<SyllableAnalysis, 'initial' | 'cluster' | 'final' | 'vowel' | 'vowelLength' | 'rule'>;

/** The letters of one written part of a listed word, read on its own; undefined when it is not a readable syllable. */
function decodeWrittenPart(part: string): Written | undefined {
  if (!isPlainThai(part)) return undefined;
  if (part.length === 1 && isConsonant(part)) return { initial: part, vowel: '◌', vowelLength: 'short' }; // the ร of สารภาพ
  const found = candidatesAt(part, 0, {})
    .filter((c) => c.end === part.length || endsWord(part, c.end))
    .sort((a, b) => a.penalty - b.penalty);
  return found.length > 0 ? makeDraft(found[0], part, part.length, undefined) : undefined;
}

function respell(
  surface: string,
  respelling: string,
  ipa: string | undefined,
  listed: { listed?: boolean; note?: string; split?: string },
): SyllableAnalysis[] {
  const parts = respelling
    .split(/[-–—]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0 || surface.length === 0) return [];
  const parsed: Array<{ cand: Cand; str: string }> = [];
  for (const part of parts) {
    const r = parseRespellingPart(part);
    if (!r) return [];
    parsed.push(r);
  }
  const drafts = parsed.map((r) => makeDraft(r.cand, r.str, r.str.length, undefined));

  const ruleSyl = decodeByRules(surface);
  const single = drafts.length === 1;
  // the rules agree with the respelling when they give the same syllables with the same tone, length and final
  // (the class is not compared: a carried class and a respelled ห differ in name only, never in tone)
  const agrees =
    ruleSyl.length === drafts.length &&
    drafts.every((d, k) => d.tone === ruleSyl[k].tone && d.vowelLength === ruleSyl[k].vowelLength && d.finalSound === ruleSyl[k].finalSound);

  // where each syllable sits in the written word, and (when that is known) which written letters it is made of
  let spans: Array<[number, number]> | undefined;
  let written: Array<Written | undefined> | undefined;
  if (listed.split) {
    const writ = listed.split.split('-');
    if (writ.length === drafts.length && writ.join('') === surface) {
      let at = 0;
      spans = writ.map((w) => {
        const s0 = at;
        at += w.length;
        return [s0, at];
      });
      written = writ.map(decodeWrittenPart);
    }
  }
  // a reviewed word trusts the rule spans only when the rules agree; a bare respelling when the counts match
  if (!spans && (listed.listed ? agrees : ruleSyl.length === drafts.length)) {
    spans = ruleSyl.map((r) => [r.start, r.end]);
    if (agrees) written = ruleSyl;
  }

  const ipaTones = ipa ? tonesFromIpa(ipa) : [];
  const ipaParts = ipa ? splitIpa(ipa) : [];
  const ipaUsable = ipaTones.length === drafts.length && ipaParts.length === drafts.length;

  const irregular = listed.note !== undefined || !agrees;

  return drafts.map((d, k) => {
    let confidence = 0.92;
    let tone = d.tone;
    let rule = d.rule ?? '';
    const w = written?.[k];
    if (w) {
      const spelledPair = d._cand.initialKind === 'ho' && w.initial !== undefined && !w.initial.startsWith('ห');
      if (spelledPair) {
        // the respelling makes the ห explicit; the written word has none, so the class is carried over
        const own = w.rule;
        rule = own !== undefined && own.includes('carries over') ? own : carryRule(written?.[k - 1]?.initial?.charAt(0), rule);
      }
    }
    let dictIpa = d.ipa;
    let isIrregular = irregular;
    if (ipaUsable) {
      dictIpa = ipaParts[k];
      const it = ipaTones[k];
      if (it !== undefined) {
        if (tone === undefined || it === tone) {
          tone = it;
          confidence = 0.95;
        } else {
          rule += `; the dictionary's IPA gives ${it} tone, which is used`;
          tone = it;
          isIrregular = true;
          confidence = 0.7;
        }
      }
    }
    if (listed.note !== undefined) rule += `. Irregular spelling: ${listed.note}`;
    else if (listed.listed && isIrregular) rule += '. Spoken form from the reviewed word list';
    const out = finish(d, confidence);
    const syl: SyllableAnalysis = { ...out, rule };
    if (tone) syl.tone = tone;
    if (dictIpa !== undefined) syl.ipa = dictIpa;
    if (isIrregular) syl.irregular = true;
    if (spans) {
      const [s0, s1] = spans[k];
      syl.start = s0;
      syl.end = s1;
      syl.text = surface.slice(s0, s1);
    } else {
      syl.start = 0;
      syl.end = surface.length;
      syl.text = single ? surface : parsed[k].str;
    }
    if (w) {
      // initial, cluster and final describe the written letters; class, tone and sounds stay those of the respelling
      if (w.initial !== undefined) syl.initial = w.initial;
      if (w.cluster) syl.cluster = w.cluster;
      else delete syl.cluster;
      if (w.final) syl.final = w.final;
      else delete syl.final;
      if (w.vowel !== undefined && w.vowelLength === syl.vowelLength) syl.vowel = w.vowel;
    }
    if (syl.text !== parsed[k].str) syl.respelled = parsed[k].str;
    else delete syl.respelled;
    return syl;
  });
}

// ───────────────────────────── IPA tones ─────────────────────────────

const IPA_TONES: ReadonlyMap<string, ThaiTone> = new Map<string, ThaiTone>([
  ['˧', 'mid'],
  ['˧˧', 'mid'],
  ['˨˩', 'low'],
  ['˥˩', 'falling'],
  ['˦˥', 'high'],
  ['˥', 'high'],
  ['˩˩˦', 'rising'],
  ['˩˦', 'rising'],
  ['˨˦', 'rising'],
]);

/** Tones read off IPA tone letters, one per syllable ("/kʰa˨˩.nom˩˩˦/" → ["low", "rising"]). */
export function tonesFromIpa(ipa: string): Array<ThaiTone | undefined> {
  return splitIpa(ipa).map((syl) => {
    const runs = syl.match(/[˥-˩]+/g);
    if (!runs || runs.length !== 1) return undefined;
    return IPA_TONES.get(runs[0]);
  });
}

// ───────────────────────────── features ─────────────────────────────

/** The writing-system items a decoded word exercises (feature keys for ids.orth('th', key)). */
export function thaiOrthFeatures(syllables: SyllableAnalysis[]): string[] {
  const keys = new Set<string>();
  for (const s of syllables) {
    if (s.confidence < 0.6) continue;
    if (s.initialClass) keys.add(`class:${s.initialClass}`);
    if (s.vowel) keys.add(`vowel:${s.vowel}`);
    if (s.finalSound) keys.add(`final:${s.finalSound}`);
    keys.add(`ending:${s.ending === 'dead' ? 'dead' : 'live'}`);
    if (s.toneMark) {
      const name = MARK_NAME[s.toneMark];
      if (name) keys.add(`mark:${name.replace(' ', '-')}`);
    }
    if (s.tone && s.initialClass) {
      let how: string | undefined;
      if (s.toneMark) how = MARK_NAME[s.toneMark]?.replace(' ', '-');
      else if (s.ending === 'dead') how = s.vowelLength === 'long' ? 'dead-long' : 'dead-short';
      else how = 'live';
      if (how) keys.add(`rule:${s.initialClass}+${how}=${s.tone}`);
    }
    if (s.cluster) {
      const first = s.cluster.charAt(0);
      if (first === 'ห') keys.add('lead:ho-nam');
      else if (first === 'อ') keys.add('lead:o-nam');
      else keys.add(`cluster:${s.cluster}`);
    }
    if (s.text.includes(THANTHAKHAT)) keys.add('sign:thanthakhat');
    if (s.text.includes(MAI_YAMOK)) keys.add('sign:mai-yamok');
    if (s.text.includes('รร')) keys.add('special:ro-han');
    if (s.text.includes('ฤ')) keys.add('special:rue');
    if (s.irregular) keys.add('irregular');
  }
  return [...keys];
}

const TONE_WORD: Readonly<Record<string, string>> = { mid: 'mid', low: 'low', falling: 'falling', high: 'high', rising: 'rising' };
const CLASS_LETTERS: Readonly<Record<string, string>> = {
  mid: 'ก จ ด ต ฎ ฏ บ ป อ',
  high: 'ข ฃ ฉ ฐ ถ ผ ฝ ศ ษ ส ห',
  low: 'all the other consonants',
};
const FINAL_LABEL: Readonly<Record<string, string>> = {
  k: 'final k sound (ก ข ค ฆ), a stop',
  t: 'final t sound (จ ช ซ ด ต ถ ท ศ ษ ส and similar), a stop',
  p: 'final p sound (บ ป พ ฟ ภ), a stop',
  m: 'final m sound (ม)',
  n: 'final n sound (น ณ ญ ร ล ฬ)',
  ŋ: 'final ng sound (ง)',
  j: 'final y sound (ย)',
  w: 'final w sound (ว)',
};

/** Human label of an orth feature key ("rule:low+dead-short=high" → "low-class consonant, short dead syllable → high tone"). */
export function describeThaiOrthFeature(key: string): string {
  const colon = key.indexOf(':');
  const kind = colon < 0 ? key : key.slice(0, colon);
  const val = colon < 0 ? '' : key.slice(colon + 1);
  switch (kind) {
    case 'class':
      return CLASS_LETTERS[val] ? `${val}-class consonant (${CLASS_LETTERS[val]})` : key;
    case 'vowel': {
      if (val === '◌') return 'no vowel written: an o between two consonants, or a short a on its own';
      const n = NUCLEI[val];
      return n ? `the vowel ${val} (${n.long ? 'long' : 'short'})` : `the vowel ${val}`;
    }
    case 'final':
      return FINAL_LABEL[val] ?? key;
    case 'ending':
      if (val === 'live') return 'live syllable: a long vowel, or a final m, n, ng, y or w';
      if (val === 'dead') return 'dead syllable: a short vowel with no final, or a final k, p or t';
      return key;
    case 'mark': {
      const marks: Record<string, string> = {
        'mai-ek': 'tone mark mai ek ( ่ )',
        'mai-tho': 'tone mark mai tho ( ้ )',
        'mai-tri': 'tone mark mai tri ( ๊ )',
        'mai-chattawa': 'tone mark mai chattawa ( ๋ )',
      };
      return marks[val] ?? key;
    }
    case 'rule': {
      const m = /^(mid|high|low)\+(live|dead-short|dead-long|mai-ek|mai-tho|mai-tri|mai-chattawa)=(mid|low|falling|high|rising)$/.exec(val);
      if (!m) return key;
      const [, cls, how, tone] = m;
      const t = TONE_WORD[tone];
      if (how === 'live') return `${cls}-class consonant, live syllable → ${t} tone`;
      if (how === 'dead-short') return `${cls}-class consonant, short dead syllable → ${t} tone`;
      if (how === 'dead-long') return `${cls}-class consonant, long dead syllable → ${t} tone`;
      return `${cls}-class consonant with ${how.replace('-', ' ')} → ${t} tone`;
    }
    case 'lead':
      if (val === 'ho-nam') return 'a silent ห in front of a low consonant: the syllable takes the high class';
      if (val === 'o-nam') return 'อ in front of ย (อย่า, อยู่, อย่าง, อยาก): the syllable takes the mid class';
      return key;
    case 'cluster':
      return `consonant cluster ${val}: both letters are said`;
    case 'sign':
      if (val === 'thanthakhat') return 'thanthakhat ( ์ ): the letter under it is not said';
      if (val === 'mai-yamok') return 'mai yamok ( ๆ ): say the word before it twice';
      return key;
    case 'special':
      if (val === 'ro-han') return 'รร: a short a before a final, or an at the end of a syllable';
      if (val === 'rue') return 'ฤ: read ri, rue or roe depending on the word';
      return key;
    case 'irregular':
      return 'a spelling the usual rules do not predict';
    default:
      return key;
  }
}
