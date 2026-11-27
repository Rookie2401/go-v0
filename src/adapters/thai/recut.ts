/**
 * Thai re-cutting (deck-gate follow-up, adapter-th@5). ICU's dictionary cuts Thai text into pieces, and where its own word
 * list stops it leaves fragments (มาส + อง for มา + สอง), cuts a compound the course teaches as one word (ครัว + เรือน),
 * or joins across a word boundary (ว่าย + อด + ขาย for ว่า + ยอดขาย). A piece of a longer word carded as a word of its own
 * is a wrong card, so the tokens are checked here against two word lists: the course list (`known`) and the installed
 * dictionary's headwords (`inDictionary`).
 *
 * A piece costs 1 when the course list (or its compound list) knows it, 2.2 when only the dictionary has it (3.2 when it is
 * two letters or fewer), and cannot be a piece when nobody has it. The rules:
 *  1. The complementizer: a token that begins ว่า right after a verb of saying or knowing (ชี้ว่าการนอน, เชื่อว่ายอดขาย) is cut
 *     after ว่า and the rest re-cut, when that costs less than keeping ICU's token (with a bias for the cut: after such a verb
 *     the word is "that").
 *  2. A stretch: every piece the course list does not know, with the piece on each side of it. The cheapest cut of the stretch
 *     into pieces somebody has replaces ICU's cut when it is at least 1 cheaper (ครัว + เรือน -> ครัวเรือน, พอก + ลับ -> พอ + กลับ,
 *     มาส + อง + วัน -> มา + สอง + วัน). Where another cut costs about the same as the one kept (within 0.5) the pieces that
 *     differ are marked `cutDoubt`: the sentence cannot decide that cut, and the analyzer gives such a token only unconfirmed
 *     readings (no card).
 *  3. A stretch nobody can cut (a loanword's fragments: เม็ก + ซิ + กัน): it is left as ICU cut it, but the short pieces beside
 *     a piece nobody has are marked `cutDoubt`.
 * Never invents a word: every piece it makes is a word of one of the two lists.
 */
import type { RawToken } from '../../core';

/** A token whose cut ICU and the rules could not settle: the analyzer reads it with unconfirmed (card-less) readings only. */
export interface ThaiDoubtToken extends RawToken { cutDoubt: true }
export const isDoubtToken = (t: RawToken): t is ThaiDoubtToken => (t as Partial<ThaiDoubtToken>).cutDoubt === true;

/**
 * Verbs of saying, knowing and thinking: a word after them that begins ว่า is the complementizer ว่า "that", which ICU joins
 * to what follows (ชี้ว่าการนอน -> ว่าการ + นอน, เชื่อว่ายอดขาย -> ว่าย + อด + ขาย).
 */
export const SAYING_VERBS: ReadonlySet<string> = new Set(['กล่าว', 'บอก', 'พูด', 'เชื่อ', 'คิด', 'คาด', 'ชี้', 'แจ้ง', 'ระบุ', 'เปิดเผย',
  'ประกาศ', 'ยืนยัน', 'รายงาน', 'เห็น', 'รู้', 'ทราบ', 'หวัง', 'นึก', 'สงสัย', 'เข้าใจ', 'เตือน', 'อ้าง', 'ย้ำ', 'ตอบ', 'ถาม', 'เล่า',
  'สัญญา', 'ยอมรับ', 'มั่นใจ', 'เชื่อมั่น', 'ปรากฏ', 'พบ', 'เสนอ', 'แสดง', 'สรุป', 'แถลง', 'รับรอง', 'ทำนาย', 'พิสูจน์', 'ยืนกราน', 'ตกลง']);

const THAI_PIECE = /^[ก-๛]+$/u;
const NOT_INITIAL = /^[ะัาำิีึืฺุู็่้๊๋์ๅ]/u;
const NOT_FINAL = /[เแโใไ]$/u;
const DICT_ONLY_COST = 2.2;
/** A dictionary headword of this many consonants or more is a true compound (ครัวเรือน, ท้องถิ่น); a shorter one (มีชีวิต, กินข้าว, ตากลม) may be two course words. */
const LONG_HEADWORD_CONSONANTS = 6;
const LONG_DICT_COST = 1.7;
const SHORT_DICT_PENALTY = 1;
/** Another cut this close in cost to the cut kept leaves the pieces that differ in doubt. */
const DOUBT_BAND = 0.5;
/** A cut must be this much cheaper than ICU's to replace it. */
const RECUT_MARGIN = 1.5;
/** After a verb of saying the cut at ว่า is favoured by this much. */
const COMPLEMENTIZER_BIAS = 1.5;
/** Dictionary compounds the course teaches as their parts (the ladder plan lists them as ICU tokens, data/ladder/th/PLAN.md; the two context-split words of thai/text.ts): never joined. */
const KEEP_SPLIT: ReadonlySet<string> = new Set<string>([
  'ความดัน', 'ความหมาย', 'คิดว่า', 'ค่อนข้าง', 'จนกระทั่ง', 'ชานชาลา', 'ตะวันออก', 'ตัดสินใจ', 'ทันสมัย', 'นิดหน่อย', 'น้ำขัง', 'น้ำท่วม', 'ผู้สนับสนุน', 'ผู้อำนวยการ', 'ผู้โดยสาร', 'ผู้ใหญ่บ้าน', 'พระวจนะ', 'พักผ่อน', 'รถกระบะ', 'แตกต่าง', 'แต่งตัว', 'แปรงฟัน', 'ใบอนุญาต', 'ไฟดับ', 'เกล็ดเลือด', 'ห้างสรรพสินค้า', 'ตากลม', 'หน้าที่',
]);
/**
 * Compounds the ladder plan teaches as their parts (so ICU's cut stays), whose parts mean something else alone: เหลือ "to remain"
 * in ช่วยเหลือ "to help", ชาน in ชานชาลา "platform". The pieces stay tokens, but the cut is marked in doubt: no card is made from them.
 */
const MISLEADING_PARTS: readonly string[] = ['ช่วยเหลือ', 'ชานชาลา'];
const COMPLEMENTIZER = 'ว่า';

export interface RecutDeps {
  /** The course word list, on a normalized form. */
  known: (normalized: string) => boolean;
  /** The course's multi-piece words (compound and pinned lists), on a normalized form. */
  compound: (normalized: string) => boolean;
  /** The installed dictionary's headwords, on a normalized form. */
  inDictionary: (normalized: string) => boolean;
  normalize: (s: string) => string;
}

const consonants = (s: string): number => [...s].filter((c) => c >= 'ก' && c <= 'ฮ').length;

type Cut = { cost: number; at: number[] };

/** Marks the pieces of a MISLEADING_PARTS compound (ICU's contiguous tokens that spell it) as in doubt. */
function flagMisleadingParts(toks: RawToken[], d: RecutDeps): RawToken[] {
  const out = toks.slice();
  for (const word of MISLEADING_PARTS) {
    for (let i = 0; i < out.length; i++) {
      let j = i, spelled = '';
      while (j < out.length && THAI_PIECE.test(out[j].surface) && (j === i || out[j - 1].end === out[j].start) && word.startsWith(spelled + d.normalize(out[j].surface))) { spelled += d.normalize(out[j].surface); j++; }
      if (spelled === word && j - i >= 2) for (let k = i; k < j; k++) out[k] = { ...out[k], cutDoubt: true } as ThaiDoubtToken;
    }
  }
  return out;
}

export function recutThai(text: string, toks: RawToken[], d: RecutDeps): RawToken[] {
  const isPiece = (t: RawToken | undefined): t is RawToken => !!t && t.isWord && THAI_PIECE.test(t.surface);
  const courseWord = (n: string) => d.known(n) || d.compound(n) || n === 'ๆ';
  const cost = (surface: string, join = false): number => {
    if (NOT_INITIAL.test(surface) || NOT_FINAL.test(surface)) return Infinity;
    const n = d.normalize(surface);
    if (join && KEEP_SPLIT.has(n)) return Infinity;
    if (courseWord(n)) return 1;
    if (d.inDictionary(n)) return consonants(n) >= LONG_HEADWORD_CONSONANTS ? LONG_DICT_COST : DICT_ONLY_COST + ([...n].length <= 2 ? SHORT_DICT_PENALTY : 0);
    return Infinity;
  };
  /** The three cheapest cuts of `r` (the offset after each piece), cheapest first; empty when nobody can cut it. */
  const bestCuts = (r: string): Cut[] => {
    const n = r.length;
    const memo: Cut[][] = new Array(n + 1);
    memo[n] = [{ cost: 0, at: [] }];
    for (let i = n - 1; i >= 0; i--) {
      const all: Cut[] = [];
      for (let j = i + 1; j <= Math.min(n, i + 24); j++) {
        const c = cost(r.slice(i, j), true);
        if (!isFinite(c)) continue;
        for (const rest of memo[j]) all.push({ cost: c + rest.cost, at: [j, ...rest.at] });
      }
      all.sort((a, b) => a.cost - b.cost);
      memo[i] = all.slice(0, 3);
    }
    return memo[0];
  };
  const tok = (a: number, b: number): RawToken => {
    const surface = text.slice(a, b);
    return { surface, start: a, end: b, isWord: true, normalized: d.normalize(surface) };
  };
  const doubtOf = (t: RawToken): RawToken => ({ ...t, cutDoubt: true } as ThaiDoubtToken);
  const weak = (t: RawToken) => isPiece(t) && !courseWord(t.normalized) && !(t.normalized.length > 1 && t.normalized.endsWith('ๆ'));
  const fixed = new Set<RawToken>();
  /**
   * Two adjacent course words that can also be cut the other way into two course words (มาก + อด / มา + กอด, ไม่รู้ + สึก / ไม่ + รู้สึก)
   * and no cut is better by its words: the sentence has to decide, so both pieces are marked in doubt.
   */
  const flagAmbiguousPairs = (toks2: RawToken[]): RawToken[] => toks2.map((t, i) => {
    if (!isPiece(t) || isDoubtToken(t) || fixed.has(t) || !courseWord(t.normalized)) return t;
    for (const other of [toks2[i - 1], toks2[i + 1]]) {
      if (!isPiece(other) || fixed.has(other) || !courseWord(other.normalized) || !(glued(other, t) || glued(t, other))) continue;
      const [p, q] = other === toks2[i - 1] ? [other, t] : [t, other];
      const s = d.normalize(text.slice(p.start, q.end)), cutAt = d.normalize(text.slice(p.start, p.end)).length;
      for (let k = 1; k < s.length; k++) {
        if (k !== cutAt && courseWord(s.slice(0, k)) && courseWord(s.slice(k)) && !KEEP_SPLIT.has(s.slice(0, k)) && !KEEP_SPLIT.has(s.slice(k))) return doubtOf(t);
      }
    }
    return t;
  });
  const glued = (a: RawToken | undefined, b: RawToken | undefined) => !!a && !!b && a.end === b.start;

  // 1. the complementizer after a verb of saying
  const work = toks.slice();
  for (let i = 1; i < work.length; i++) {
    const t = work[i], prev = work[i - 1];
    if (!isPiece(t) || [...t.normalized].length <= 2 || !t.normalized.startsWith(COMPLEMENTIZER) || !isPiece(prev) || !glued(prev, t) || !SAYING_VERBS.has(prev.normalized)) continue;
    let j = i + 1; // the token and up to two Thai pieces glued to it
    while (j < work.length && j < i + 3 && isPiece(work[j]) && glued(work[j - 1], work[j])) j++;
    const from = t.start, to = work[j - 1].end, r = text.slice(from, to);
    const split = from + COMPLEMENTIZER.length;
    const rest = bestCuts(text.slice(split, to));
    const uncut = bestCuts(r)[0];
    if (!rest.length || !uncut || cost(COMPLEMENTIZER) + rest[0].cost - COMPLEMENTIZER_BIAS > uncut.cost) continue;
    const head = tok(from, split);
    fixed.add(head);
    const pieces: RawToken[] = [head];
    let a = split;
    for (const e of rest[0].at) { pieces.push(tok(a, split + e)); a = split + e; }
    work.splice(i, j - i, ...pieces);
    i += pieces.length - 1;
  }

  // 2 and 3. stretches around the pieces the course list does not know
  const include = work.map(() => false);
  work.forEach((t, k) => {
    if (!weak(t) || fixed.has(t)) return;
    for (const m of [k - 1, k, k + 1]) {
      const u = work[m];
      if (isPiece(u) && !fixed.has(u) && (m === k || glued(m < k ? u : t, m < k ? t : u))) include[m] = true;
    }
  });
  /** Two cuts cross when each has a boundary the other lacks (มาก|อด and มา|กอด); a cut that only splits the other further (ออก|จาก, ออกจาก) is no rival. */
  const crosses = (a: number[], b: number[]) => a.some((x) => !b.includes(x)) && b.some((x) => !a.includes(x));
  const out: RawToken[] = [];
  for (let i = 0; i < work.length; ) {
    if (!include[i]) { out.push(work[i]); i++; continue; }
    let b = i;
    while (b + 1 < work.length && include[b + 1] && glued(work[b], work[b + 1])) b++;
    const stretch = work.slice(i, b + 1);
    const from = stretch[0].start, to = stretch[stretch.length - 1].end, r = text.slice(from, to);
    const icuAt = stretch.map((t) => t.end - from);
    const icuCost = stretch.reduce((s, t) => s + cost(t.surface), 0);
    const cuts = bestCuts(r);
    const key = (at: number[]) => at.join(',');
    /** A piece the new cut makes from several of ICU's pieces must hold a piece the course does not know and either a course word or a fragment nobody has (อับ + ราม stay two pieces of a name; ผลก + ระ + ทบ is ผลกระทบ) ; course words alone are not joined (ความ + หมาย, ตะวัน + ออก are taught as their parts). */
    const joinsKnownWord = (at: number[]) => at.every((e, k) => {
      const s0 = k ? at[k - 1] : 0;
      const inside = stretch.filter((t) => t.start - from >= s0 && t.end - from <= e);
      return inside.length < 2 || (inside.some((t) => !courseWord(t.normalized)) && inside.some((t) => courseWord(t.normalized) || !isFinite(cost(t.surface))));
    });
    const spansOf = (at: number[]) => at.map((e, k) => `${k ? at[k - 1] : 0}:${e}`);
    const build = (at: number[], doubtful: Set<string>): RawToken[] =>
      at.map((e, k) => { const s = k ? at[k - 1] : 0; const t = tok(from + s, from + e); return doubtful.has(`${s}:${e}`) ? doubtOf(t) : t; });
    if (!cuts.length) {
      // nobody has a cut of the stretch: a short piece beside a piece nobody has is probably a fragment of it
      const unknown = stretch.map((t) => !isFinite(cost(t.surface)));
      stretch.forEach((t, k) => out.push(!unknown[k] && (unknown[k - 1] || unknown[k + 1]) && [...t.normalized].length <= 3 ? doubtOf(t) : t));
      i = b + 1; continue;
    }
    const best = cuts[0];
    let keptAt = icuAt, keptCost = icuCost;
    if (key(best.at) !== key(icuAt) && !icuAt.every((x) => best.at.includes(x)) && best.cost + RECUT_MARGIN <= icuCost && joinsKnownWord(best.at)) { keptAt = best.at; keptCost = best.cost; }
    const rival = cuts.find((c) => c.cost <= keptCost + DOUBT_BAND && crosses(c.at, keptAt));
    const theirs = new Set(rival ? spansOf(rival.at) : []);
    const doubtful = new Set(rival ? spansOf(keptAt).filter((s) => !theirs.has(s)) : []);
    if (keptAt === icuAt && !doubtful.size) out.push(...stretch);
    else out.push(...(keptAt === icuAt ? stretch.map((t) => (doubtful.has(`${t.start - from}:${t.end - from}`) ? doubtOf(t) : t)) : build(keptAt, doubtful)));
    i = b + 1;
  }
  return flagAmbiguousPairs(flagMisleadingParts(out, d));
}
