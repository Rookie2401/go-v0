/**
 * Thai text basics shared by the adapter and the prose splitter: normalisation, the compound list the
 * segmenter is repaired with, the tokenizer, and the base sentence-break rules. No lexical knowledge here.
 */
import type { RawToken, Span } from '../../core';
import { makeWordTokenizer, nfc } from '../shared';

export const normalizeThai = (s: string) => nfc(s).replace(/ํา/gu, 'ำ').replace(/[​﻿]/gu, '');

/** Words ICU splits but the course treats as one lexical unit (matched on ICU's own pieces of the word). */
const BASE_COMPOUNDS = ['นิรันดร์', 'พระบุตร', 'ตอนนี้', 'ทุกคน', 'วันหนึ่ง', 'หลอกลวง', 'สัตย์ซื่อ', 'ทั้งสิ้น',
  'ผู้หญิง', 'โรงพยาบาล', 'ผลไม้', 'วันนี้', 'พรุ่งนี้', 'เมื่อวาน', 'พระเยซู', 'พระคัมภีร์', 'คริสตจักร', 'น่าจะ', 'ดังนั้น', 'ดังนี้', 'ของขวัญ'];

/**
 * Words that stay ONE token wherever they stand in the text (adapter-th@4). ICU cuts these differently from one context to
 * the next (ซิม is one token alone and ซิ + ม in ซื้อซิมที่ร้าน; โอเคครับ is โอ + เค + ครับ; คุณไปเหรอคะ is เห + รอ), or into
 * junk pieces in every context (ศิษยาภิบาล → ศิษ ยา ภิ บาล, มิชชันนารี → มิช ชัน นารี), so the ICU pieces cannot be matched as
 * for BASE_COMPOUNDS: the text itself is searched, and an occurrence not glued to a following vowel or tone mark (ซิมา is
 * ซิ + มา) and not preceded by a leading vowel (the เ of เซิม is part of ซ) becomes one token. Loanwords and names the
 * Thai ladder plan (data/ladder/th/PLAN.md, sections 6-7) found unstable, the tens (one NUM token each, so ยี่สิบห้า is
 * ยี่สิบ + ห้า in every context) and the three Scripture words the lexicon holds whole (พระบิดา, พระวจนะ, พระวิญญาณ: one
 * lemma in a ladder unit as it already is in the OTCV). NOT here: compounds the plan lists as their parts (รถ + สอง + แถว,
 * ผู้ใหญ่ + บ้าน, ไม่ + เป็นไร …); a pinned word must have a lexicon row (lexicon-ladder.ts, lexicon-bible.ts).
 */
export const THAI_PINNED = [
  // the plan's ICU-unstable everyday loanwords
  'ซิมการ์ด', 'ซิม', 'แชท', 'โอเค', 'เหรอ', 'ไซส์',
  // church and mission words, junk pieces in every context
  'ศิษยาภิบาล', 'มิชชันนารี', 'อีสเตอร์', 'บัพติศมา', 'ฟาริสี',
  // names a ladder text may need (the plan lists them under "avoided")
  'สะมาเรีย', 'เยริโค', 'เยรีโค', 'อับราฮัม', 'เปโตร', 'ดาวิด', 'เอมี่', 'มาร์ค', 'สมชาย',
  // the Father, the Word and the Spirit as one lemma, as in the OTCV
  'พระบิดา', 'พระวจนะ', 'พระวิญญาณ',
  // the tens: one NUM token each (สิบเอ็ด is สิบ + เอ็ด, both NUM)
  'ยี่สิบ', 'สามสิบ', 'สี่สิบ', 'ห้าสิบ', 'หกสิบ', 'เจ็ดสิบ', 'แปดสิบ', 'เก้าสิบ',
];

/** Words ICU splits but the course treats as one lexical unit: BASE_COMPOUNDS and THAI_PINNED. */
export const THAI_COMPOUNDS: string[] = [...BASE_COMPOUNDS, ...THAI_PINNED];

const icuTokenize = makeWordTokenizer({ locale: 'th', normalize: normalizeThai, compounds: BASE_COMPOUNDS });

const PIN_AFTER_MARK = 'ะัาำิีึืฺุู็่้๊๋์ํ';
const PINNED_RE = new RegExp(
  '(?<![เแโใไ])(?:' + [...THAI_PINNED].sort((a, b) => b.length - a.length).join('|') + ')(?![' + PIN_AFTER_MARK + '])', 'gu');

/**
 * ICU's tokens, except that every occurrence of a THAI_PINNED word is one token. The text between two pinned words keeps the
 * tokens ICU gave it in the whole text where its edges are also token edges there (ICU saw the context); where a token of
 * ICU's runs across an edge (แช|ทก|ลุ่ม around the pinned แชท) that stretch is segmented on its own (กลุ่ม).
 */
function icuWithPins(text: string): RawToken[] {
  const hits = [...text.matchAll(PINNED_RE)];
  const whole = icuTokenize(text);
  if (!hits.length) return whole;
  const out: RawToken[] = [];
  const cuts = (at: number) => !whole.some((t) => t.start < at && at < t.end); // no ICU token runs across `at`
  const gap = (a: number, b: number) => {
    if (b <= a) return;
    if (cuts(a) && cuts(b)) { out.push(...whole.filter((t) => t.start >= a && t.end <= b)); return; }
    for (const t of icuTokenize(text.slice(a, b))) out.push({ ...t, start: t.start + a, end: t.end + a });
  };
  let at = 0;
  for (const m of hits) {
    const start = m.index ?? 0, end = start + m[0].length;
    gap(at, start);
    out.push({ surface: m[0], start, end, isWord: true, normalized: normalizeThai(m[0]) });
    at = end;
  }
  gap(at, text.length);
  return out;
}

/**
 * ICU joins across a word boundary here: ครูให้การบ้าน is ให้การ + บ้าน ("to testify" + "house"), never ให้ + การบ้าน
 * ("to give" + "homework"). A pair of ICU tokens that is always the second reading is cut again at the right place.
 */
const REPAIRS: ReadonlyArray<{ first: string; second: string; cut: number }> = [
  { first: 'ให้การ', second: 'บ้าน', cut: 'ให้'.length },
  // ICU reads คุณมีหน้าที่อะไร as มีหน้า ("to have a face") + ที่; after มี the word is หน้าที่ "duty" (adapter-th@4)
  { first: 'มีหน้า', second: 'ที่', cut: 'มี'.length },
];

/**
 * ICU also JOINS across a word boundary where a beginner needs the pieces. Each rule below cuts a token it makes, by its
 * neighbours (adapter-th@4); where the neighbours show the other reading the token stays whole:
 *  - หน้าที่ is "duty" after มี / ทำ / เป็น / ตาม … and before ของ / คือ / หลัก …; anywhere else (ไปหน้าที่ตลาด, ผมเห็นหน้าที่ครู)
 *    it is หน้า + ที่ ("in front of; the place that");
 *  - ตากลม is "to take the air" after ไป / นั่ง / ออก / มา; anywhere else it is ตา + กลม ("round eyes").
 * Both whole tokens are lexicon words (lexicon-ladder.ts).
 */
const WORD_MARK = String.fromCharCode(0x200b);
const DUTY_BEFORE = new Set(['มี', 'ไม่มี', 'ทำ', 'เป็น', 'ตาม', 'ปฏิบัติ', 'รับ', 'ละเลย', 'มอบ', 'ขาด', 'หมด', 'สิ้น', 'ผิด']);
const DUTY_AFTER = new Set(['ของ', 'คือ', 'หลัก', 'ประจำ', 'ต่อ']);
const AIR_BEFORE = new Set(['ไป', 'นั่ง', 'ออก', 'มา', 'ออกไป']);
const CONTEXT_SPLITS: ReadonlyArray<{ word: string; cut: number; keep: (prev: string, next: string) => boolean }> = [
  { word: 'หน้าที่', cut: 'หน้า'.length, keep: (p, n) => DUTY_BEFORE.has(p) || DUTY_AFTER.has(n) },
  { word: 'ตากลม', cut: 'ตา'.length, keep: (p) => AIR_BEFORE.has(p) },
];

export const thaiTokenize: (text: string) => RawToken[] = (text) => {
  const out = icuWithPins(text);
  for (let i = 0; i < out.length; i++) {
    const rule = CONTEXT_SPLITS.find((x) => x.word === out[i].normalized);
    if (!rule) continue;
    // a text with the publisher's U+200B word marks has already decided where the words end
    if (text[out[i].start - 1] === WORD_MARK || text[out[i].end] === WORD_MARK) continue;
    const near = (a: RawToken | undefined, from: number, to: number) => (a?.isWord && /^s*$/u.test(text.slice(from, to)) ? a.normalized : '');
    const prev = near(out[i - 1], out[i - 1]?.end ?? 0, out[i].start);
    const next = near(out[i + 1], out[i].end, out[i + 1]?.start ?? 0);
    if (rule.keep(prev, next)) continue;
    const t = out[i], mid = t.start + rule.cut;
    const left = text.slice(t.start, mid), right = text.slice(mid, t.end);
    out.splice(i, 1,
      { surface: left, start: t.start, end: mid, isWord: true, normalized: normalizeThai(left) },
      { surface: right, start: mid, end: t.end, isWord: true, normalized: normalizeThai(right) });
  }
  for (let i = 0; i + 1 < out.length; i++) {
    const r = REPAIRS.find((x) => out[i].normalized === x.first && out[i + 1].normalized === x.second && out[i].end === out[i + 1].start);
    if (!r) continue;
    const a = out[i], b = out[i + 1];
    const mid = a.start + r.cut;
    const left = text.slice(a.start, mid), right = text.slice(mid, b.end);
    out.splice(i, 2,
      { surface: left, start: a.start, end: mid, isWord: true, normalized: normalizeThai(left) },
      { surface: right, start: mid, end: b.end, isWord: true, normalized: normalizeThai(right) });
  }
  return out;
};

const THAI_PIECE = /^[ก-๛]+$/u;
/** U+200B, the publisher's word mark (written by code point: no invisible character sits in this file), and the byte-order mark. */
const ZWSP = String.fromCharCode(0x200b);
const CHUNK_CUTS = new RegExp('[\\s' + ZWSP + String.fromCharCode(0xfeff) + ']', 'u');

/**
 * A word token that is one whole U+200B-delimited chunk of the text which the word list does not know (set only on texts
 * that carry U+200B word marks, e.g. the Open Thai Common Version). The analyzer reads such a token as a name candidate.
 */
export interface ThaiChunkToken extends RawToken { chunk: 'unlisted' }
export const isChunkToken = (t: RawToken): t is ThaiChunkToken => (t as Partial<ThaiChunkToken>).chunk === 'unlisted';

/**
 * The tokenizer for running text. Text WITHOUT U+200B is segmented exactly as `thaiTokenize` does it. Text that marks its
 * word boundaries with U+200B (the Biblica OTCV: 1,189 of 1,189 chapters) carries the publisher's own word division, and
 * ICU's dictionary splits what the publisher kept whole, above all names (อับราม -> อับ|ราม, เบธเอล -> เบธ|เอล, โสโดม ->
 * โส|โดม). The chunk stays one token when the word list knows the whole chunk, or when ICU cuts it into pieces that are NOT
 * all known words and do not all look like words of their own: a piece of fewer than three characters, a last piece เอล or
 * a piece ending in ห์ is a name's fragment (อับ|ราม, โท|บี|ยาห์, เนธัน|เอล). Pieces that are all known (พระ|เจ้า), or all
 * of a word's length (โกรธ|เกรี้ยว, ย่าง|ก้าว: an ordinary compound the list lacks), keep the ICU split as ever.
 * `known` answers for a normalized form.
 */
export function makeThaiTokenizer(known: (normalized: string) => boolean): (text: string) => RawToken[] {
  const isKnown = (t: RawToken) => known(t.normalized) || THAI_COMPOUNDS.includes(t.normalized) || t.normalized === 'ๆ';
  /**
   * The repetition mark. Written with a space (ช้า ๆ) it is a token of its own; glued to a word the list knows (เด็กๆ, ช้าๆ) the
   * two stay ONE token, which the analyzer reads as the stem; glued to a word the list does NOT know (ว่าวๆ) ICU makes one
   * unreadable token, which would count as a lemma of its own (ว่าวๆ) apart from the word itself: it is cut into the stem and
   * ๆ, exactly as if it were written with a space.
   */
  const splitRepeat = (toks: RawToken[]): RawToken[] => toks.flatMap((t) => {
    if (!t.isWord || t.normalized.length < 2 || !t.surface.endsWith('ๆ')) return [t];
    const stem = t.surface.slice(0, -1);
    if (!THAI_PIECE.test(stem) || known(normalizeThai(stem)) || THAI_COMPOUNDS.includes(normalizeThai(stem))) return [t];
    return [
      { surface: stem, start: t.start, end: t.end - 1, isWord: true, normalized: normalizeThai(stem) },
      { surface: 'ๆ', start: t.end - 1, end: t.end, isWord: true, normalized: 'ๆ' },
    ];
  });
  return (text) => {
    const base = splitRepeat(thaiTokenize(text));
    if (!text.includes(ZWSP)) return base;
    const chunkOf = (at: number): [number, number] => {
      let a = at; while (a > 0 && !CHUNK_CUTS.test(text[a - 1])) a--;
      let b = at; while (b < text.length && !CHUNK_CUTS.test(text[b])) b++;
      return [a, b];
    };
    const out: RawToken[] = [];
    for (let i = 0; i < base.length; ) {
      const t = base[i];
      if (!t.isWord || !THAI_PIECE.test(t.surface)) { out.push(t); i++; continue; }
      const [a, b] = chunkOf(t.start);
      // the pieces of this chunk that are word tokens of plain Thai letters, up to the first token of another kind
      let j = i;
      while (j < base.length && base[j].end <= b && base[j].isWord && THAI_PIECE.test(base[j].surface)) j++;
      const run = base.slice(i, j);
      // the run is the whole word of the chunk: nothing but punctuation (quotation marks, brackets) lies beside it in the chunk
      const beside = base.filter((x) => x.start >= a && x.end <= b && (x.end <= run[0].start || x.start >= run[run.length - 1].end));
      const whole = beside.every((x) => !x.isWord);
      const fragmentary = run.some((p) => p.normalized.length < 3 || p.normalized.endsWith('ห์')) || run[run.length - 1].normalized === 'เอล';
      const joined = run.length >= 2 ? text.slice(run[0].start, run[run.length - 1].end) : '';
      if (whole && run.length >= 2 && (known(normalizeThai(joined)) || (fragmentary && run.some((p) => !isKnown(p))))) {
        const start = run[0].start, end = run[run.length - 1].end;
        const surface = text.slice(start, end);
        const token: RawToken = { surface, start, end, isWord: true, normalized: normalizeThai(surface) };
        out.push(known(token.normalized) ? token : { ...token, chunk: 'unlisted' } as ThaiChunkToken);
      } else if (whole && run.length === 1 && !isKnown(run[0])) {
        out.push({ ...run[0], chunk: 'unlisted' } as ThaiChunkToken);
      } else out.push(...run);
      i = j;
    }
    return out;
  };
}

/** Final particles after which a single space ends a reading unit. */
export const SENTENCE_FINAL_PARTICLES = ['ครับ', 'ค่ะ', 'คะ', 'นะ', 'จ้ะ', 'จ๊ะ', 'ฮะ', 'เหรอ', 'ล่ะ'];

/** Words of address: "พี่ครับ", "คุณครูคะ" call someone; the particle there does not end a sentence. */
const ADDRESS_TERMS = new Set([
  'พี่', 'น้อง', 'ลุง', 'ป้า', 'น้า', 'อา', 'ตา', 'ยาย', 'ปู่', 'ย่า', 'คุณ', 'หนู', 'แม่', 'พ่อ', 'ครู', 'อาจารย์', 'หมอ', 'ท่าน',
  'คุณครู', 'คุณแม่', 'คุณพ่อ', 'คุณหมอ', 'คุณลุง', 'คุณป้า', 'คุณน้า', 'คุณอา', 'คุณตา', 'คุณยาย', 'คุณปู่', 'คุณย่า',
]);

const OPEN_TO_CLOSE: Record<string, string> = { '(': ')', '[': ']', '{': '}', '«': '»', '“': '”', '‘': '’', '「': '」', '『': '』', '《': '》' };
const CLOSERS = new Set(Object.values(OPEN_TO_CLOSE));

/**
 * Index ranges [open, close] of quotation marks and brackets that open and close on the same line. An unpaired mark
 * is ignored; a pair never spans a line break.
 */
export function pairedRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let stack: Array<{ close: string; at: number }> = [];
  let quoteOpen = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n' || ch === '\r') { stack = []; quoteOpen = -1; continue; }
    if (ch === '"') {
      if (quoteOpen < 0) quoteOpen = i; else { ranges.push([quoteOpen, i]); quoteOpen = -1; }
    } else if (OPEN_TO_CLOSE[ch]) {
      stack.push({ close: OPEN_TO_CLOSE[ch], at: i });
    } else if (CLOSERS.has(ch)) {
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].close === ch) { ranges.push([stack[k].at, i]); stack.length = k; break; }
      }
    }
  }
  return ranges;
}

/** A bracket or quotation pair of at most this many word tokens, without terminal punctuation, is one short phrase. */
const SHORT_PAIR_WORDS = 6;

// ── deterministic hazards of the full stop ──
const THAI_ABBREV_GROUPS = /(?:^|[^ก-๙])((?:[ก-ฮ]{1,3}\.)+)$/u;
const THAI_TITLES = new Set(['ดร.', 'นพ.', 'พญ.', 'รศ.', 'ผศ.']); // one group with two letters or more: only these
const LATIN_DOTTED = /(?:^|[^A-Za-z])(?:[A-Za-z]\.){2,}$/u; // a.m. p.m. e.g. i.e. U.S.
const LATIN_TITLES = /(?:^|[^A-Za-z])(?:Dr|Mr|Mrs|Ms|Prof|Jr|Sr|St|vs)\.$/iu;
const LIST_MARKER = /^(?:[0-9๐-๙]{1,3}|[A-Za-z]|[ก-ฮ])$/u;

/**
 * The text up to and including the full stop at index `dot` ends in an abbreviation: Thai letters with dots (พ.ศ.
 * ร.ร. ก.ค. พล.อ., one consonant such as ก. น. ม.; ดร. นพ. รศ. ผศ.) or Latin ones (Dr. Mr. a.m. p.m. e.g.). Such a
 * stop never ends a reading unit. A word of two or three letters with one dot (นก.) is not taken for one.
 */
export function endsInAbbreviation(text: string, dot: number): boolean {
  const upto = text.slice(Math.max(0, dot - 24), dot + 1);
  const thai = THAI_ABBREV_GROUPS.exec(upto);
  if (thai) {
    const groups = thai[1].split('.').filter(Boolean);
    if (groups.length >= 2) return true;
    if (groups[0].length === 1) return true;
    if (THAI_TITLES.has(thai[1])) return true;
  }
  return LATIN_DOTTED.test(upto) || LATIN_TITLES.test(upto);
}

/**
 * Thai sentence breaks (heuristic, conservative — a wrong split is worse than a long sentence):
 *  - a newline always breaks (a hard-wrapped book therefore breaks inside sentences: a known limit);
 *  - . ? ! … followed by space/end breaks, except: a full stop that closes an abbreviation (พ.ศ. ดร. น. Dr. a.m.),
 *    the stop of a list marker at the start of a unit (1. ๑. ก.), and an ellipsis (… ... ....), which ends a unit
 *    only at the end of the text, possibly followed by closing quotation marks; a dot between digits (10.30, 3.5) is
 *    never followed by a space, so it never breaks;
 *  - ฯ and ฯลฯ do not break by themselves (กรุงเทพฯ ใหญ่ is one unit);
 *  - two or more spaces break;
 *  - a single space after a sentence-final particle (ครับ ค่ะ คะ นะ …) breaks, except inside a bracket or quotation
 *    pair that holds no terminal punctuation, and after a bare form of address at the start of a unit (พี่ครับ ช่วย…).
 * A lone space elsewhere is a clause pause and does NOT split. Very long spans are divided further by
 * segmentThaiProse (prose.ts).
 */
export function segmentThaiSentences(text: string): Span[] {
  const spans: Span[] = [];
  let start = 0;
  const push = (a: number, b: number) => {
    while (a < b && /\s/u.test(text[a])) a++;
    while (b > a && /\s/u.test(text[b - 1])) b--;
    if (b > a) spans.push({ start: a, end: b, text: text.slice(a, b) });
  };
  const ranges = pairedRanges(text);
  /**
   * Inside a pair whose content is a single short phrase, never cut: no terminal punctuation and at most
   * SHORT_PAIR_WORDS word tokens (a longer quotation may hold several sentences, which is not decided by rule).
   */
  const insideShortPair = (at: number) =>
    ranges.some(([a, b]) => {
      if (at <= a || at >= b) return false;
      const inner = text.slice(a + 1, b);
      return !/[.?!…]/u.test(inner) && thaiTokenize(inner).filter((t) => t.isWord).length <= SHORT_PAIR_WORDS;
    });
  /** The unit so far is only a form of address plus the particle: พี่ครับ, คุณครูคะ. */
  const isAddress = (before: string) => {
    const words = thaiTokenize(before).filter((t) => t.isWord).map((t) => t.normalized);
    return words.length >= 2 && words.length <= 3 && SENTENCE_FINAL_PARTICLES.includes(words[words.length - 1])
      && words.slice(0, -1).every((w) => ADDRESS_TERMS.has(w));
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\n' || ch === '\r') {
      let j = i;
      while (j < text.length && (text[j] === '\n' || text[j] === '\r')) j++;
      push(start, i); start = j; i = j; continue;
    }
    if ('.?!…'.includes(ch)) {
      let j = i;
      while (j < text.length && '.?!…'.includes(text[j])) j++;
      const run = text.slice(i, j);
      let k = j;
      while (k < text.length && '"\'”’)»'.includes(text[k])) k++;
      const ellipsis = /^[.…]+$/u.test(run) && (run.includes('…') || run.length >= 2);
      let ends = k >= text.length || /\s/u.test(text[k]);
      if (ends && ellipsis) ends = k >= text.length; // "…" ends a unit only at the end of the text
      else if (ends && run === '.') {
        if (endsInAbbreviation(text, i)) ends = false;
        else if (LIST_MARKER.test(text.slice(start, i).trim())) ends = false; // "1." at the start of a unit
      }
      if (ends) { push(start, k); start = k; }
      i = k; continue;
    }
    if (ch === ' ' || ch === ' ' || ch === '\t') {
      let j = i;
      while (j < text.length && (text[j] === ' ' || text[j] === ' ' || text[j] === '\t')) j++;
      const before = text.slice(start, i);
      let cut = j - i >= 2;
      if (!cut && SENTENCE_FINAL_PARTICLES.some((p) => before.endsWith(p))) cut = !insideShortPair(i) && !isAddress(before);
      if (cut) { push(start, i); start = j; }
      i = j; continue;
    }
    i++;
  }
  push(start, text.length);
  return spans;
}
