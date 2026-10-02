/**
 * Devanagari as written: the units a reader's eye takes in (akṣaras), the signs on them, and forms that are the same
 * word in another spelling. Nothing here changes a text; everything is derived from it and can be derived again.
 *
 * MACHINE-DRAFTED from general knowledge of the script (package H1, docs/PLAN12.md); no native speaker has checked
 * the spelling-variant rules or the word lists they use. The exported signatures are final: other packages build
 * against them.
 *
 * Identity. A form's identity is its NFC text, in which the nukta stays a separate sign (ज़ = ज + ़), so ज़ and ज are
 * different forms and nothing here folds them except `hindiSearchForm`, which is for search only.
 */
import { NUKTA_STEMS, NUKTA_SUFFIXES, YA_WORD_PAIRS } from './orth-exceptions';

/** One written unit: a consonant or consonant cluster with its vowel sign and marks, or an independent vowel. */
export interface Akshara {
  text: string;
  /** Offsets within the surface, in UTF-16 code units; the units tile the word exactly. */
  start: number;
  end: number;
  /** The consonant letters in order, each with its nukta when it has one (['प', 'र'] for प्र; ['ज़'] for ज़). Empty for an independent vowel. */
  consonants: string[];
  /** The vowel as written: an independent vowel letter (आ), a vowel sign with ◌ for the consonant (◌ा), or undefined when none is written. */
  vowel?: string;
  /** Signs on the unit by name: 'nukta', 'anusvara', 'chandrabindu', 'visarga', 'virama', 'reph', 'rakar', 'avagraha'. */
  signs: string[];
  /** True when the unit ends in a visible virama: no vowel is written or meant (the त् of सत्). */
  dead: boolean;
}

// ───────────────────────────── characters ─────────────────────────────

export const VIRAMA = '्';
export const NUKTA = '़';
const ZWJ = '‍';
const ZWNJ = '‌';
const SIGN_ORDER = ['nukta', 'reph', 'rakar', 'virama', 'anusvara', 'chandrabindu', 'visarga', 'avagraha'];

const isZw = (ch: string): boolean => ch === ZWJ || ch === ZWNJ;
const isConsonantCode = (c: number): boolean => (c >= 0x0915 && c <= 0x0939) || (c >= 0x0958 && c <= 0x095f) || (c >= 0x0978 && c <= 0x097f);
const isIndependentVowelCode = (c: number): boolean => (c >= 0x0904 && c <= 0x0914) || c === 0x0960 || c === 0x0961 || (c >= 0x0972 && c <= 0x0977);
const isVowelSignCode = (c: number): boolean =>
  c === 0x093a || c === 0x093b || (c >= 0x093e && c <= 0x094c) || c === 0x094e || c === 0x094f ||
  (c >= 0x0955 && c <= 0x0957) || c === 0x0962 || c === 0x0963;
const isMarkCode = (c: number): boolean => c >= 0x0900 && c <= 0x0903;
const isStressCode = (c: number): boolean => c >= 0x0951 && c <= 0x0954;

/** True when the character is a Devanagari consonant letter (precomposed nukta letters included). */
export function isDevanagariConsonant(ch: string): boolean {
  return ch.length > 0 && isConsonantCode(ch.codePointAt(0)!);
}
/** True when the character is an independent vowel letter. */
export function isIndependentVowel(ch: string): boolean {
  return ch.length > 0 && isIndependentVowelCode(ch.codePointAt(0)!);
}
/** True when the character is a dependent vowel sign (matra). */
export function isVowelSign(ch: string): boolean {
  return ch.length > 0 && isVowelSignCode(ch.codePointAt(0)!);
}

function markName(code: number): string | undefined {
  if (code === 0x0901 || code === 0x0900) return 'chandrabindu';
  if (code === 0x0902) return 'anusvara';
  if (code === 0x0903) return 'visarga';
  return undefined;
}

// ───────────────────────────── aksharas ─────────────────────────────

/** The akṣaras of one word (NFC in, offsets into what was given). A character that is not Devanagari is a unit of its own. */
export function aksharas(surface: string): Akshara[] {
  const out: Akshara[] = [];
  const n = surface.length;
  let i = 0;
  while (i < n) {
    const start = i;
    const code = surface.codePointAt(i)!;
    const ch = String.fromCodePoint(code);
    const signs = new Set<string>();
    const consonants: string[] = [];
    let vowel: string | undefined;
    let dead = false;

    if (isConsonantCode(code)) {
      let reph = false;
      let rakar = false;
      for (;;) {
        // one consonant letter with its nukta (a precomposed nukta letter is read as base + nukta)
        const c = surface[i];
        let letter = c.normalize('NFC');
        i++;
        if (letter.length > 1 || (c.codePointAt(0)! >= 0x0958 && c.codePointAt(0)! <= 0x095f)) signs.add('nukta');
        if (surface[i] === NUKTA) { letter += NUKTA; signs.add('nukta'); i++; }
        letter = letter.normalize('NFC');
        const isRa = letter === 'र';
        consonants.push(letter);
        while (i < n && isZw(surface[i])) i++;
        if (surface[i] === VIRAMA) {
          signs.add('virama');
          i++;
          while (i < n && isZw(surface[i])) i++;
          if (i < n && isConsonantCode(surface.codePointAt(i)!)) {
            if (consonants.length === 1 && isRa) reph = true;
            // the next letter joins this cluster; it is a rakar when it is र after a consonant
            if (surface[i] === 'र' && surface[i + 1] !== NUKTA) rakar = true; else rakar = false;
            continue;
          }
          dead = true;
        }
        break;
      }
      if (reph) signs.add('reph');
      if (rakar && consonants.length >= 2 && !dead) signs.add('rakar');
      if (!dead) {
        if (i < n && isVowelSignCode(surface.codePointAt(i)!)) { vowel = '◌' + surface[i]; i++; }
        while (i < n && (isMarkCode(surface.codePointAt(i)!) || isStressCode(surface.codePointAt(i)!))) {
          const m = markName(surface.codePointAt(i)!);
          if (m) signs.add(m);
          i++;
        }
      }
    } else if (isIndependentVowelCode(code)) {
      vowel = ch;
      i += ch.length;
      while (i < n && (isMarkCode(surface.codePointAt(i)!) || isStressCode(surface.codePointAt(i)!))) {
        const m = markName(surface.codePointAt(i)!);
        if (m) signs.add(m);
        i++;
      }
    } else if (code === 0x093d) {
      signs.add('avagraha');
      i += 1;
    } else if (isVowelSignCode(code)) {
      vowel = '◌' + ch; // a stray vowel sign with no consonant to stand on
      i += ch.length;
    } else {
      // a digit, danda, Latin letter, space, ZWJ with nothing before it, a stray mark: a unit of its own
      i += ch.length;
      const m = markName(code);
      if (m) signs.add(m);
      if (code === 0x094d) signs.add('virama');
      if (code === 0x093c) signs.add('nukta');
    }

    const unit: Akshara = {
      text: surface.slice(start, i),
      start,
      end: i,
      consonants,
      signs: SIGN_ORDER.filter((s) => signs.has(s)),
      dead,
    };
    if (vowel !== undefined) unit.vowel = vowel;
    out.push(unit);
  }
  return out;
}

// ───────────────────────────── search form ─────────────────────────────

const NASAL_CONJUNCT_FOLD = /(?<=[ऀ-ॿ])(?<![्‌‍])(?:ङ्(?=[कखगघ])|ञ्(?=[चछजझ])|ण्(?=[टठडढ])|न्(?=[तथदध])|म्(?=[पफबभ]))/g;

/**
 * A form for SEARCH only: zero-width joiners removed, anusvara and the nasal conjunct it stands for folded together,
 * chandrabindu folded to anusvara, the nukta dropped. Never stored as the text and never used as a form's identity.
 */
export function hindiSearchForm(s: string): string {
  let t = s.normalize('NFD').replace(/[‌‍़]/g, '').normalize('NFC');
  t = t.replace(NASAL_CONJUNCT_FOLD, 'ं');
  return t.replace(/ँ/g, 'ं');
}

// ───────────────────────────── spelling variants ─────────────────────────────

/** A stretch of the form with the alternatives it can be written as (options[0] is what is there now). */
interface Pos { start: number; end: number; options: string[] }

const NASAL_STOPS: Readonly<Record<string, string>> = { 'ङ': 'कखगघ', 'ञ': 'चछजझ', 'ण': 'टठडढ', 'न': 'तथदध', 'म': 'पफबभ' };
const STOP_NASAL: Readonly<Record<string, string>> = (() => {
  const m: Record<string, string> = {};
  for (const [nasal, stops] of Object.entries(NASAL_STOPS)) for (const s of stops) m[s] = nasal;
  return m;
})();
/** Vowel signs and independent vowels after which ँ is normally written (nothing rises above the headline). */
const CHANDRABINDU_HOSTS = 'ाुूआउऊ';
/** What may stand before an independent ए / a ये for the y-glide variant. */
const YA_PREV_SIGNS = 'ािीुूोौृॅॉ';
const YA_PREV_VOWELS = 'अआइईउऊओऔ';
const YA_REST = /^(?:ग[ाीे])?$/;
const FIVE_NUKTA = /([कखगजफ])़/g;

function yaPrevOk(f: string, i: number): boolean {
  if (i <= 0) return false;
  const p = f[i - 1];
  if (YA_PREV_SIGNS.includes(p) || YA_PREV_VOWELS.includes(p)) return true;
  return p === NUKTA || (isDevanagariConsonant(p) && f[i - 2] !== VIRAMA);
}

function findPositions(f: string): Pos[] {
  const pos: Pos[] = [];
  const taken: boolean[] = new Array<boolean>(f.length).fill(false);
  const add = (start: number, end: number, options: string[]): void => {
    for (let k = start; k < end; k++) if (taken[k]) return;
    for (let k = start; k < end; k++) taken[k] = true;
    pos.push({ start, end, options });
  };
  for (let i = 0; i < f.length; i++) {
    const c = f[i];
    // y-glide: independent ए after a vowel or consonant <-> य + े ; the nasal mark travels with it
    if (c === 'ए' && yaPrevOk(f, i)) {
      const m = f[i + 1] === 'ँ' || f[i + 1] === 'ं' ? f[i + 1] : '';
      const end = i + 1 + m.length;
      if (YA_REST.test(f.slice(end))) {
        const orig = f.slice(i, end);
        const opts = [orig];
        if (m === '') opts.push('ये');
        else { opts.push(m === 'ँ' ? 'एं' : 'एँ'); opts.push('यें'); }
        add(i, end, opts);
        continue;
      }
    }
    if (c === 'य' && f[i + 1] === 'े' && f[i - 1] !== VIRAMA && yaPrevOk(f, i)) {
      const m = f[i + 2] === 'ँ' || f[i + 2] === 'ं' ? f[i + 2] : '';
      const end = i + 2 + m.length;
      if (YA_REST.test(f.slice(end))) {
        const orig = f.slice(i, end);
        const opts = [orig];
        if (m === '') opts.push('ए');
        else { opts.push('एं'); opts.push('एँ'); if (m === 'ँ') opts.push('यें'); }
        add(i, end, opts);
        continue;
      }
    }
    // nukta on one of the five letters where both spellings circulate
    if (c === NUKTA && i > 0 && 'कखगजफ'.includes(f[i - 1])) {
      add(i - 1, i + 1, [f[i - 1] + NUKTA, f[i - 1]]);
      continue;
    }
    // chandrabindu / anusvara / the nasal conjunct they stand for
    if (c === 'ँ') { add(i, i + 1, ['ँ', 'ं']); continue; }
    if (c === 'ं') {
      const opts = ['ं'];
      if (i > 0 && CHANDRABINDU_HOSTS.includes(f[i - 1])) opts.push('ँ');
      const next = f[i + 1];
      if (next && STOP_NASAL[next] && f[i + 2] !== NUKTA) opts.push(STOP_NASAL[next] + VIRAMA);
      if (opts.length > 1) add(i, i + 1, opts);
      continue;
    }
    if (NASAL_STOPS[c] && f[i + 1] === VIRAMA && NASAL_STOPS[c].includes(f[i + 2] ?? '#') && f[i + 3] !== NUKTA &&
        i > 0 && f[i - 1] !== VIRAMA && !isZw(f[i - 1]) && f.charCodeAt(i - 1) >= 0x0900 && f.charCodeAt(i - 1) <= 0x097f) {
      add(i, i + 2, [c + VIRAMA, 'ं']);
    }
  }
  return pos.sort((a, b) => a.start - b.start);
}

const dropFiveNukta = (s: string): string => s.replace(FIVE_NUKTA, '$1');

const ADD_NUKTA: ReadonlyMap<string, string> = new Map(NUKTA_STEMS.map((stem) => [dropFiveNukta(stem), stem] as const));

/** The word with its conventional nukta restored, when it is a listed word (alone or with an ending). */
function restoreNukta(s: string): string | undefined {
  const d = dropFiveNukta(s);
  for (const suf of NUKTA_SUFFIXES) {
    if (suf && !d.endsWith(suf)) continue;
    const stem = d.slice(0, d.length - suf.length);
    if (!stem) continue;
    if (suf) {
      const last = stem[stem.length - 1];
      if (!isDevanagariConsonant(last) && last !== NUKTA) continue;
    }
    const hit = ADD_NUKTA.get(stem);
    if (hit) { const r = hit + suf; if (r !== s) return r; }
  }
  return undefined;
}

const YA_WORDS: ReadonlyMap<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  const put = (a: string, b: string): void => { const l = m.get(a) ?? []; l.push(b); m.set(a, l); };
  for (const [a, b] of YA_WORD_PAIRS) { put(a.normalize('NFC'), b.normalize('NFC')); put(b.normalize('NFC'), a.normalize('NFC')); }
  return m;
})();

const MAX_POSITIONS = 6;

/** Every form reachable from f by choosing among the alternatives at each position, with the number of changes made. */
function reach(f: string): Map<string, number> {
  const out = new Map<string, number>();
  out.set(f, 0);
  const positions = findPositions(f);
  if (positions.length > MAX_POSITIONS) {
    // too many independent choices: change one place at a time
    for (const p of positions) for (let k = 1; k < p.options.length; k++) {
      const s = f.slice(0, p.start) + p.options[k] + f.slice(p.end);
      if (!out.has(s)) out.set(s, 1);
    }
  } else {
    let acc: Array<{ s: string; cost: number; at: number }> = [{ s: '', cost: 0, at: 0 }];
    for (const p of positions) {
      const next: typeof acc = [];
      for (const a of acc) {
        const gap = f.slice(a.at, p.start);
        p.options.forEach((o, k) => next.push({ s: a.s + gap + o, cost: a.cost + (k === 0 ? 0 : 1), at: p.end }));
      }
      acc = next;
    }
    for (const a of acc) {
      const s = a.s + f.slice(a.at);
      const prev = out.get(s);
      if (prev === undefined || a.cost < prev) out.set(s, a.cost);
    }
  }
  for (const w of YA_WORDS.get(f) ?? []) if (!out.has(w)) out.set(w, 1);
  // a listed word spelled without its nukta: the form with the nukta is also in use
  for (const [s, cost] of [...out.entries()]) {
    const r = restoreNukta(s);
    if (r !== undefined && !out.has(r)) out.set(r, cost + 1);
  }
  return out;
}

/**
 * Other spellings of the same word that are in ordinary use, the given form excluded: हिंदी ↔ हिन्दी (anusvara for a nasal
 * before a consonant of its class), गई ↔ गयी, चाहिए ↔ चाहिये, a nukta present or absent (ज़रूरत ↔ जरूरत), ँ ↔ ं over a long
 * vowel sign (हैं is not हें: only real variants). Returned NFC, most usual first. Empty when there is none.
 *
 * Only pairs that hold in both directions are returned, so the relation is symmetric. The nukta is added back only to
 * words on a short list (see orth-exceptions.ts); it is dropped from क ख ग ज फ always, never from ड़ ढ़.
 */
export function hindiSpellingVariants(form: string): string[] {
  const f = form.normalize('NFC');
  if (!f) return [];
  const result: Array<{ s: string; cost: number }> = [];
  for (const [s, cost] of reach(f)) {
    if (s === f) continue;
    if (reach(s).has(f)) result.push({ s, cost });
  }
  result.sort((a, b) => a.cost - b.cost);
  return result.map((r) => r.s);
}
