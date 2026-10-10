/**
 * Thai contextual syntax (Linguistic Engine V2, Stage 4): shallow, rule-based dependencies over the adapter's readings.
 *
 * Thai has no inflection and no spaces, so the only evidence is word order, the part of speech and role the word list gives,
 * and a handful of function words (aspect and modal markers, classifiers, prepositions, final particles). The shape of the
 * rules: the sentence is cut into clauses at the words that open one (ว่า, ที่ + clause, ถ้า, เมื่อ, แต่, และ + clause, …);
 * each clause is cut into noun phrases (head noun first, then compound nouns, adjectives, number + classifier, demonstratives)
 * and single words; the first verb is the predicate; a bare noun phrase before it is the subject, one after it the object (or an
 * oblique after a verb of motion); later verbs are serial verbs; aspect words are `aux`; final particles are `discourse`.
 *
 * Honesty: a word the word list does not know gets NO relation, except where a function word fixes its place (the word after a
 * verb-taking marker such as กำลัง or จะ is a verb, the word after a preposition is its noun): those relations carry a low
 * confidence and say so in `basis`. Where the order cannot decide (which verb a preposition phrase belongs to, a noun that is
 * also a verb, an adjective that may be a modifier or the predicate) the relation keeps its other readings in `alternatives`
 * and has status 'conflicted'. Every relation has a non-empty `basis`. Machine-drafted, no native-speaker review.
 *
 * Imports: values only from ../../core/syntax (the adapter bundle must not pull course.ts); types may come from ../../core.
 */
import type { AnalysisCandidate, AnalyzedToken, RawToken } from '../../core';
import type { ClauseSpan, DependencyRelation, SyntaxAlternative, SyntaxAnalysis, SyntaxRelation } from '../../core/syntax';

export const THAI_SYNTAX_ANALYZER = 'syntax-th@1';

// ───────────────────────────── word classes ─────────────────────────────

type Cat =
  | 'N' | 'PRON' | 'LOC' | 'V' | 'COP' | 'GIVE' | 'ADJ' | 'NUM' | 'CLF' | 'DET' | 'ADV' | 'AUX' | 'ASP' | 'NEG' | 'FIN' | 'ADVL'
  | 'RES' | 'REDUP' | 'ADP' | 'CONJ' | 'SCONJ' | 'INTJ' | 'UNK';

interface W {
  /** token index in the sentence */
  i: number;
  s: string;
  cat: Cat;
  /** other classes the word list also gives the surface (noun and verb, noun and classifier …) */
  alts: Cat[];
  role: string;
  /** a space or punctuation mark stands before this word */
  gap: boolean;
  /** the word list knows it */
  known: boolean;
  /** an auxiliary read as the main verb because the clause has no other */
  promoted?: boolean;
  /** a verb read from an unknown word by its position after a verb-taking marker */
  inferred?: boolean;
}

const DIGITS = /^[\d๐-๙]+$/u;
const COP = new Set(['เป็น', 'คือ']);
const LOC = new Set(['ที่นี่', 'ที่นั่น', 'ที่โน่น', 'ที่ไหน']);
const FINAL = new Set(['ครับ', 'ค่ะ', 'คะ', 'นะ', 'ไหม', 'มั้ย', 'เหรอ', 'สิ', 'ซิ', 'ซะ', 'เถอะ', 'หรอก', 'ล่ะ', 'ละ', 'น่ะ', 'แหละ', 'จ้ะ', 'จ๊ะ', 'ฮะ', 'เด้อ', 'เลย', 'จ้า', 'เนอะ']);
const QUESTION_PARTICLES = new Set(['ไหม', 'มั้ย', 'เหรอ']);
const POLITE = new Set(['ครับ', 'ค่ะ', 'คะ', 'ฮะ']);
const NEG = new Set(['ไม่', 'มิ', 'บ่']);
const ASPECT_ADV = new Set(['แล้ว', 'ยัง', 'เพิ่ง']);
const PRE_DET = new Set(['ทุก', 'บาง', 'หลาย', 'ทั้ง', 'แต่ละ', 'กี่']);
const POST_DET = new Set(['นี้', 'นั้น', 'โน้น']);
const LINKING = new Set(['รู้สึก', 'ดู', 'กลาย', 'ทำให้', 'เริ่ม', 'ยัง', 'กลายเป็น', 'ดูเหมือน']);
/** auxiliaries that can only stand before a verb (not ได้ / อยู่ / ถูก, which also take a noun) */
const PURE_VERB_AUX = new Set(['จะ', 'กำลัง', 'ต้อง', 'ควร', 'อาจ', 'คง', 'เคย', 'อยาก', 'น่าจะ', 'ทรง', 'อย่า', 'เพิ่ง']);
const REL_N = new Set(['หน้า', 'หลัง', 'ข้าง', 'ริม', 'ทาง', 'กลาง', 'รอบ', 'ท้าย', 'ใกล้', 'ไกล']);
const POST_ADV = new Set(['กัน', 'ด้วย', 'เอง', 'อีก', 'มาก', 'นัก', 'จัง', 'มากมาย', 'ทั้งสิ้น', 'เสมอ', 'เท่านั้น', 'แค่', 'เพียง']);
const DEGREE = new Set(['มาก', 'นัก', 'จัง', 'ที่สุด', 'เกินไป', 'หน่อย', 'นิด', 'ขึ้น']);
const TIME_ADV = new Set(['วันนี้', 'พรุ่งนี้', 'เมื่อวาน', 'ตอนนี้', 'ทุกวัน', 'เดี๋ยวนี้', 'วันหนึ่ง']);
const TIME_N = new Set(['ตอน', 'วัน', 'เช้า', 'เย็น', 'บ่าย', 'คืน', 'ค่ำ', 'สาย', 'เที่ยง', 'ปี', 'เดือน', 'สัปดาห์', 'อาทิตย์', 'ชั่วโมง', 'นาที', 'ฤดู', 'เวลา', 'ยาม', 'ครั้ง']);
/** verbs that take a clause after ว่า */
const SAYING = new Set(['พูด', 'บอก', 'ถาม', 'ตอบ', 'คิด', 'รู้', 'เห็น', 'เชื่อ', 'จำ', 'หวัง', 'เข้าใจ', 'สารภาพ', 'กลัว', 'ฝัน', 'เล่า', 'แจ้ง', 'สัญญา', 'รับรอง', 'ได้ยิน', 'ทราบ', 'รู้สึก', 'สังเกต', 'เห็นว่า', 'ประกาศ', 'กล่าว', 'รับสั่ง', 'ตกลง', 'สงสัย', 'ยืนยัน']);
const SPEECH = new Set(['พูด', 'บอก', 'ถาม', 'ตอบ', 'เล่า', 'แจ้ง', 'สัญญา', 'กล่าว', 'รับสั่ง', 'ประกาศ']);
/** verbs of motion and posture: a bare noun after them is a place, not an object */
const MOTION = new Set(['ไป', 'มา', 'เข้า', 'ออก', 'กลับ', 'ถึง', 'เดิน', 'วิ่ง', 'ขึ้น', 'ลง', 'ผ่าน', 'เสด็จ', 'ข้าม']);
const INTRANS = new Set([...MOTION, 'นอน', 'นั่ง', 'ยืน', 'ตื่น', 'หัวเราะ', 'ยิ้ม', 'พินาศ', 'หลับ', 'ร้องไห้', 'ตก', 'อยู่', 'ลอย', 'หยุด', 'กลิ้ง', 'ร้อง', 'จบ', 'เสร็จ', 'พัก']);
/** a verb right after another verb that adds a direction or a result (`compound`), not a second action */
const DIRECTIONAL = new Set(['มา', 'ไป', 'ขึ้น', 'ลง', 'เข้า', 'ออก', 'กลับ', 'เสร็จ', 'จบ', 'ผ่าน', 'อยู่', 'ต่อ', 'ทัน', 'ได้', 'เป็น']);
const PUNCT_RE = /^[\p{P}\p{S}]+$/u;

const POS_CAT: Record<string, Cat> = {
  NOUN: 'N', PROPN: 'N', PRON: 'PRON', VERB: 'V', ADJ: 'ADJ', NUM: 'NUM', CLF: 'CLF', DET: 'DET', ADV: 'ADV', AUX: 'AUX', ADP: 'ADP',
  CONJ: 'CONJ', SCONJ: 'SCONJ', INTJ: 'INTJ',
};

function catOfCandidate(c: AnalysisCandidate, s: string): Cat {
  if (c.pos === 'PART') {
    if (NEG.has(s) || c.role === 'negation') return 'NEG';
    if (s === 'ไว้') return 'RES';
    if (s === 'ก็') return 'ADVL';
    if (FINAL.has(s) || /particle$/u.test(c.role ?? '')) return 'FIN';
    return 'FIN';
  }
  return (c.pos && POS_CAT[c.pos]) || 'UNK';
}

function classify(tokens: RawToken[], analyses: AnalyzedToken[]): { words: W[]; punct: number[] } {
  const words: W[] = [];
  const punct: number[] = [];
  for (let t = 0; t < tokens.length; t++) {
    const tok = tokens[t];
    const s = tok.normalized || tok.surface;
    const isNum = DIGITS.test(s);
    if (!tok.isWord && !isNum) {
      if (PUNCT_RE.test(s)) punct.push(t);
      continue;
    }
    const cands = analyses[t]?.candidates ?? [];
    const c = cands[0];
    let cat: Cat = isNum ? 'NUM' : c ? catOfCandidate(c, s) : 'UNK';
    const alts: Cat[] = [];
    for (const o of cands.slice(1)) {
      const k = catOfCandidate(o, s);
      if (k !== cat && !alts.includes(k)) alts.push(k);
    }
    if (!isNum) {
      if (s === 'ๆ') cat = 'REDUP';
      else if (COP.has(s)) cat = 'COP';
      else if (LOC.has(s)) cat = 'LOC';
      else if (s === 'ให้') cat = 'GIVE';
      else if (s === 'ว่า') cat = 'SCONJ';
      else if (s === 'อย่าง') cat = 'ADP';
      else if (s === 'ขณะ') cat = 'SCONJ';
      else if (s === 'จึง') cat = 'ADVL';
      else if (s === 'ทุกวัน') cat = 'ADV';
      else if (ASPECT_ADV.has(s)) cat = 'ASP';
      else if (cat === 'ADV' && TIME_ADV.has(s)) cat = 'ADV';
    }
    const prev = tokens[t - 1];
    const gap = !!prev && (prev.end < tok.start || (!prev.isWord && PUNCT_RE.test(prev.normalized || prev.surface)));
    words.push({ i: t, s, cat, alts, role: c?.role ?? '', gap, known: !!c });
  }
  // a word the list gives as classifier and as preposition / noun, standing where no classifier can (not after a number or a noun)
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    if (w.cat !== 'CLF' || (!w.alts.includes('ADP') && !w.alts.includes('N'))) continue;
    const pv = words[k - 1];
    if (pv && !w.gap && (pv.cat === 'NUM' || pv.cat === 'N' || pv.cat === 'DET')) continue;
    w.cat = w.alts.includes('ADP') ? 'ADP' : 'N';
  }
  // ถูก / โดน: the passive marker before a verb (or a doer + verb), otherwise "cheap; correct" / "to touch"
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    if ((w.s !== 'ถูก' && w.s !== 'โดน') || !(w.cat === 'AUX' || w.alts.includes('AUX'))) continue;
    const n1 = words[k + 1];
    const n2 = words[k + 2];
    const passive = !!n1 && !n1.gap && (n1.cat === 'V' || n1.cat === 'UNK' || (isNominal(n1) && !!n2 && !n2.gap && (n2.cat === 'V' || n2.cat === 'UNK')));
    if (passive) { w.cat = 'AUX'; w.role = 'passive marker'; }
  }
  // ของ: "of" before a noun or pronoun, otherwise the noun "thing"
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    if (w.s !== 'ของ') continue;
    const nx = words[k + 1];
    if (nx && !nx.gap && (nx.cat === 'N' || nx.cat === 'PRON' || nx.cat === 'LOC') && k > 0) w.cat = 'ADP';
    else { w.alts = [...new Set<Cat>([...w.alts, w.cat])]; w.cat = 'N'; w.role = 'thing'; }
  }
  // ด้วย before a noun phrase is "with / by"; ด้วย alone (or before กัน) is "also / together"
  for (let k = 0; k + 1 < words.length; k++) { const w = words[k]; const nx = words[k + 1]; if (w.s === 'ด้วย' && !nx.gap && (nx.cat === 'N' || nx.cat === 'PRON' || nx.cat === 'LOC')) w.cat = 'ADP'; }
  // ของเล่น / ของกิน / ของใช้: one compound noun, written ของ + verb
  for (let k = 0; k + 1 < words.length; k++) if (words[k].s === 'ของ' && ['เล่น', 'กิน', 'ใช้'].includes(words[k + 1].s) && !words[k + 1].gap && words[k].cat === 'N') { words[k + 1].cat = 'N'; words[k + 1].alts = ['V']; }
  // ไม่นาน "soon" is one adverbial
  for (let k = 0; k + 1 < words.length; k++) if (words[k].s === 'ไม่' && words[k + 1].s === 'นาน' && !words[k + 1].gap) { words[k].cat = 'ADV'; words[k + 1].cat = 'ADV'; }
  return { words, punct };
}

// ───────────────────────────── relation builder ─────────────────────────────

class Builder {
  rels = new Map<number, SyntaxRelation>();
  notes: string[] = [];
  add(dep: W, head: W | undefined, relation: DependencyRelation, label: string, basis: string[], confidence: number, alts?: SyntaxAlternative[]): void {
    const r: SyntaxRelation = {
      dependent: dep.i, relation, label, basis: basis.length ? basis : ['word order'], confidence: Math.round(confidence * 100) / 100,
      status: alts && alts.length ? 'conflicted' : 'generated',
    };
    if (head) r.head = head.i;
    if (alts && alts.length) r.alternatives = alts;
    this.rels.set(dep.i, r);
  }
  has(dep: W): boolean { return this.rels.has(dep.i); }
  drop(dep: W): void { this.rels.delete(dep.i); }
}

const alt = (head: W | undefined, relation: DependencyRelation, confidence: number, why: string): SyntaxAlternative => ({
  ...(head ? { head: head.i } : {}), relation, confidence, why,
});

// ───────────────────────────── noun phrases ─────────────────────────────

interface Mod { dep: W; head: W; relation: DependencyRelation; label: string; basis: string[]; conf: number; alts?: SyntaxAlternative[] }
interface NP { kind: 'NP'; head: W; from: number; to: number; mods: Mod[]; quant: boolean; trailingAdj?: Mod; members: W[] }
interface PP { kind: 'PP'; adp: W; np?: NP; unk?: W; manner?: W }
interface WC { kind: 'W'; w: W }
type Chunk = NP | PP | WC;

const isNominal = (w: W | undefined): boolean => !!w && (w.cat === 'N' || w.cat === 'PRON' || w.cat === 'LOC');

function nominalStart(u: W[], j: number): boolean {
  const w = u[j];
  if (!w) return false;
  if (isNominal(w)) return true;
  if (w.cat === 'DET' && PRE_DET.has(w.s) && u[j + 1] && !u[j + 1].gap && (isNominal(u[j + 1]) || u[j + 1].cat === 'NUM')) return true;
  if (w.cat === 'NUM' && u[j + 1]?.cat === 'CLF' && !u[j + 1].gap) return true;
  if (w.cat === 'CLF' && u[j + 1] && !u[j + 1].gap && (u[j + 1].cat === 'ADJ' || u[j + 1].cat === 'DET')) return true;
  return false;
}

function buildNP(u: W[], k: number): NP | undefined {
  if (!nominalStart(u, k)) return undefined;
  const mods: Mod[] = [];
  const members: W[] = [];
  const pre: W[] = [];
  let j = k;
  while (u[j] && u[j].cat === 'DET' && PRE_DET.has(u[j].s) && j + 1 < u.length) { pre.push(u[j]); members.push(u[j]); j++; }
  let head: W;
  let quant = false;
  const first = u[j];
  if (first.cat === 'NUM' && u[j + 1]?.cat === 'CLF') {
    head = u[j + 1]; quant = true;
    members.push(first, head);
    mods.push({ dep: first, head, relation: 'nummod', label: `number counting '${head.s}'`, basis: ['a number before a classifier'], conf: 0.8 });
    j += 2;
  } else if (first.cat === 'CLF') {
    head = first; quant = true; members.push(first); j++;
  } else if (first.cat === 'NUM') {
    return undefined;
  } else {
    head = first; members.push(first); j++;
    // คุณ + noun: a title (คุณแม่ "Mother", คุณครู "teacher")
    if (first.s === 'คุณ' && u[j] && !u[j].gap && u[j].cat === 'N') {
      const core = u[j];
      mods.push({ dep: first, head: core, relation: 'compound', label: `title before '${core.s}'`, basis: ['คุณ + noun is a polite title (คุณแม่, คุณครู)'], conf: 0.7 });
      members.push(core); head = core; j++;
    }
    // ความ / การ + word: the nominalising prefix belongs to the word it makes a noun of
    if ((first.s === 'ความ' || first.s === 'การ') && u[j] && !u[j].gap && (u[j].cat === 'ADJ' || u[j].cat === 'V' || u[j].cat === 'N')) {
      const core = u[j];
      mods.push({ dep: first, head: core, relation: 'compound', label: `noun-forming prefix of '${core.s}'`, basis: [`${first.s} turns the word after it into a noun`], conf: 0.75 });
      members.push(core); head = core; j++;
    }
  }
  for (const d of pre) mods.push({ dep: d, head, relation: 'det', label: `determiner of '${head.s}'`, basis: ['a quantity word before the noun'], conf: 0.75 });
  let lastNoun = head;
  let trailingAdj: Mod | undefined;
  const headPron = head.cat === 'PRON' && !quant;
  while (j < u.length) {
    const w = u[j];
    if (w.gap) break;
    if (w.cat === 'N' && REL_N.has(w.s) && REL_N.has(head.s) === false && j > k) break;
    if (w.cat === 'N' && w.alts.includes('CLF') && u[j + 1] && !u[j + 1].gap && u[j + 1].cat === 'NUM' && !headPron) {
      mods.push({ dep: w, head, relation: 'clf', label: `classifier of '${head.s}'`, basis: ['a classifier before the number (ชิ้นหนึ่ง "one piece")'], conf: 0.6 });
      members.push(w); j++;
      continue;
    }
    if (w.cat === 'N' && head.s === 'ของ' && ['เล่น', 'กิน', 'ใช้'].includes(w.s)) {
      mods.push({ dep: w, head, relation: 'compound', label: `part of the compound noun ของ${w.s}`, basis: [`ของ${w.s} is one noun ("toy / food / tool")`], conf: 0.75 });
      members.push(w); j++;
      continue;
    }
    if (w.cat === 'N' && !headPron && w.s !== 'ของ' || (w.cat === 'LOC' && !headPron)) {
      mods.push({ dep: w, head, relation: 'nmod', label: `noun modifying '${head.s}'`, basis: ['a bare noun after a noun modifies it (compound or "of")'], conf: 0.6 });
      lastNoun = w; members.push(w); trailingAdj = undefined; j++;
      continue;
    }
    if (w.cat === 'PRON' && !headPron && !quant && w.role === 'question word') {
      mods.push({ dep: w, head, relation: 'det', label: `"what / which" asking about '${head.s}'`, basis: ['a question word right after a noun asks which one: เรื่องอะไร "what matter"'], conf: 0.7 });
      members.push(w); j++;
      break;
    }
    if (w.cat === 'PRON' && !headPron && !quant) {
      mods.push({ dep: w, head, relation: 'nmod', label: `pronoun after '${head.s}' (possessor, or part of พวกเรา)`, basis: ['a bare pronoun after a noun is its possessor'], conf: 0.55 });
      members.push(w); j++;
      break;
    }
    if (w.cat === 'ADJ' && !headPron) {
      const m: Mod = { dep: w, head: lastNoun, relation: 'amod', label: `adjective describing '${lastNoun.s}'`, basis: ['an adjective or stative verb after the noun describes it'], conf: 0.7 };
      mods.push(m); trailingAdj = m; members.push(w); j++;
      continue;
    }
    if (w.cat === 'ADV' && TIME_ADV.has(w.s) && TIME_N.has(head.s) && !trailingAdj) {
      mods.push({ dep: w, head, relation: 'nmod', label: `time word completing '${head.s}'`, basis: [`'${head.s}' + a time word (วันพรุ่งนี้ "tomorrow")`], conf: 0.65 });
      members.push(w); j++;
      continue;
    }
    if (w.cat === 'ADV' && DEGREE.has(w.s) && trailingAdj) {
      mods.push({ dep: w, head: trailingAdj.dep, relation: 'advmod', label: `degree word of '${trailingAdj.dep.s}'`, basis: ['a degree word after an adjective'], conf: 0.7 });
      members.push(w); j++;
      continue;
    }
    if (w.cat === 'NUM' && !headPron && !quant) {
      const nx = u[j + 1];
      if (nx && nx.cat === 'CLF' && !nx.gap) {
        mods.push({ dep: w, head, relation: 'nummod', label: `number counting '${head.s}'`, basis: ['noun + number + classifier: the number follows the noun it counts'], conf: 0.8 });
        mods.push({ dep: nx, head, relation: 'clf', label: `classifier of '${head.s}'`, basis: ['the classifier right after the number'], conf: 0.8 });
        members.push(w, nx); trailingAdj = undefined; j += 2;
        continue;
      }
      mods.push({ dep: w, head, relation: 'nummod', label: `number counting '${head.s}'`, basis: ['a number right after the noun; no classifier (a unit noun such as วัน or ครั้ง takes none)'], conf: 0.6 });
      members.push(w); j++;
      continue;
    }
    if (w.cat === 'CLF' && !headPron && !quant) {
      mods.push({ dep: w, head, relation: 'clf', label: `classifier of '${head.s}'`, basis: ['a classifier right after the noun (with a demonstrative or on its own)'], conf: 0.65 });
      members.push(w); j++;
      continue;
    }
    if (w.cat === 'DET' && POST_DET.has(w.s)) {
      mods.push({ dep: w, head, relation: 'det', label: `"this / that" pointing at '${head.s}'`, basis: ['a demonstrative (นี้ นั้น โน้น) follows the noun and its classifier'], conf: 0.85 });
      members.push(w); trailingAdj = undefined; j++;
      continue;
    }
    // noun + verb + demonstrative: the verb is part of the noun phrase (วันหยุดนี้ "this holiday")
    if (w.cat === 'V' && !headPron && u[j + 1] && !u[j + 1].gap && u[j + 1].cat === 'DET' && POST_DET.has(u[j + 1].s)) {
      mods.push({
        dep: w, head, relation: 'acl', label: `verb inside the noun phrase '${head.s} … ${u[j + 1].s}'`, basis: ['noun + verb + นี้/นั้น: the demonstrative closes a noun phrase, so the verb describes the noun'], conf: 0.5,
        alts: [alt(undefined, 'root', 0.4, 'the verb may be the predicate of the sentence')],
      });
      members.push(w); j++;
      continue;
    }
    if (w.cat === 'ADP' && w.s === 'ของ' && !headPron && u[j + 1] && !u[j + 1].gap && isNominal(u[j + 1])) {
      const poss = buildNP(u, j + 1);
      if (poss) {
        mods.push({ dep: poss.head, head, relation: 'nmod', label: `possessor of '${head.s}'`, basis: ['ของ + noun after a noun = "of / belonging to"'], conf: 0.8 });
        mods.push({ dep: w, head: poss.head, relation: 'case', label: `"of" marking '${poss.head.s}'`, basis: ['ของ before a noun phrase'], conf: 0.85 });
        mods.push(...poss.mods);
        members.push(w, ...poss.members);
        j = poss.to;
        break;
      }
    }
    break;
  }
  // coordination of noun phrases: NP และ/หรือ NP
  const cj = u[j];
  if (cj && cj.cat === 'CONJ' && (cj.s === 'และ' || cj.s === 'หรือ') && !cj.gap && !trailingAdj && u[j + 1] && !u[j + 1].gap && nominalStart(u, j + 1)) {
    const np2 = buildNP(u, j + 1);
    if (np2) {
      mods.push({ dep: np2.head, head, relation: 'conj', label: `coordinated with '${head.s}'`, basis: [`${cj.s} joins two noun phrases`], conf: 0.75 });
      mods.push({ dep: cj, head: np2.head, relation: 'cc', label: `"${cj.s}" joining '${head.s}' and '${np2.head.s}'`, basis: ['the conjunction stands before the second conjunct'], conf: 0.8 });
      mods.push(...np2.mods);
      members.push(cj, ...np2.members);
      return { kind: 'NP', head, from: k, to: np2.to, mods, quant, members };
    }
  }
  const np: NP = { kind: 'NP', head, from: k, to: j, mods, quant, members };
  if (trailingAdj) {
    const at = u.indexOf(trailingAdj.dep);
    if (at >= 0 && u.slice(at + 1, j).every((x) => x.cat === 'ADV' && DEGREE.has(x.s))) np.trailingAdj = trailingAdj;
  }
  return np;
}

// ───────────────────────────── clause segmentation ─────────────────────────────

type Kind = 'main' | 'advcl' | 'ccomp' | 'relcl' | 'coord';
interface Clause {
  ranges: Array<[number, number]>;
  kind: Kind;
  marker?: W;
  /** the noun a relative clause describes */
  antecedent?: W;
  head?: W;
  /** how the marker attaches (mark / cc) */
  markerRel?: 'mark' | 'cc';
  markerWhy?: string;
  /** the tokens, once cut */
  units?: W[];
  /** a clause from a pause between two clauses, with no marker */
  bare?: boolean;
  complement?: boolean;
}

const SUB_ALWAYS = new Set(['ถ้า', 'หาก', 'แม้', 'แม้ว่า', 'เพราะ', 'จน', 'ครั้น', 'เมื่อ']);
const SUB_TEST = new Set(['เพื่อ', 'ก่อน', 'หลัง', 'ระหว่าง', 'ตั้งแต่', 'ขณะ']);
const REL = new Set(['ที่', 'ซึ่ง', 'อัน']);

/** After at most one noun group, does a predicate start? (decides whether a connective opens a clause) */
function clausalAhead(W: W[], k: number, adjOk: boolean, strictV = false, lenient = false): boolean {
  let sawNom = false;
  let seenN = 0;
  for (let j = k; j < W.length; j++) {
    const w = W[j];
    if (j > k && w.gap && sawNom && !adjOk) return false;
    switch (w.cat) {
      case 'V': case 'COP': case 'GIVE': case 'NEG': return strictV && sawNom && w.cat === 'V' && seenN > 0 ? false : true;
      case 'AUX': return true;
      case 'N': case 'PRON': case 'LOC': sawNom = true; seenN++; continue;
      case 'UNK': if (lenient && sawNom) return true; continue;
      case 'DET': case 'NUM': case 'CLF': case 'ADV': case 'ADVL': case 'ASP': continue;
      case 'ADJ': if (j === k || (adjOk && sawNom)) return true; continue;
      case 'ADP': if (w.s === 'ของ') continue; return false;
      case 'SCONJ': return sawNom && REL.has(w.s);
      default: return false;
    }
  }
  return false;
}

function hasPredicate(units: W[]): boolean {
  return units.some((w, i) => (w.cat === 'V' && !(units[i - 1]?.cat === 'N' && units[i + 1]?.cat === 'DET' && POST_DET.has(units[i + 1].s))) || w.cat === 'COP' || w.cat === 'AUX' || w.cat === 'GIVE' || w.cat === 'INTJ' || (w.cat === 'ADJ' && (i === 0 || units[i - 1].cat !== 'N')));
}

function segment(W: W[], B: Builder): Clause[] {
  const clauses: Clause[] = [{ ranges: [[0, 0]], kind: 'main' }];
  let cur = clauses[0];
  let sawMain = false;
  const ownUnits = (c: Clause, upTo: number): W[] => c.ranges.flatMap(([a, b], ri) => W.slice(a, ri === c.ranges.length - 1 ? upTo : b));
  const open = (kind: Kind, at: number, marker?: W, extra: Partial<Clause> = {}): void => {
    cur.ranges[cur.ranges.length - 1][1] = at;
    if (cur.kind === 'main' && cur.ranges.some(([a, b]) => b > a)) sawMain = true;
    const start = marker ? at + 1 : at;
    cur = { ranges: [[start, start]], kind, ...(marker ? { marker } : {}), ...extra };
    clauses.push(cur);
  };
  for (let k = 0; k < W.length; k++) {
    const w = W[k];
    const prev = W[k - 1];
    if (!w) continue;
    // a pause between two clauses
    if (k > 0 && w.gap && (hasPredicate(ownUnits(cur, k)) || (cur.kind === 'advcl' && !sawMain && ownUnits(cur, k).length >= 2)) && clausalAhead(W, k, true) && !SUB_ALWAYS.has(w.s) && !(w.cat === 'CONJ')) {
      open(sawMain || cur.kind === 'main' ? 'coord' : 'main', k, undefined, { bare: true });
      continue;
    }
    if (w.cat === 'SCONJ' && w.s === 'ว่า') {
      if (prev && (prev.s === 'เพราะ' || prev.s === 'แม้')) continue;
      const said = prev && (SAYING.has(prev.s) || (prev.cat === 'ASP' || prev.s === 'ได้') && W[k - 2] && SAYING.has(W[k - 2].s));
      if (said || (k > 0 && clausalAhead(W, k + 1, true))) {
        open('ccomp', k, w, { markerRel: 'mark', markerWhy: said ? `ว่า after '${prev?.s}' (a verb of saying or knowing) opens what was said` : 'ว่า followed by a clause opens a "that"-clause' });
        continue;
      }
      continue;
    }
    if (w.cat === 'SCONJ' && REL.has(w.s)) {
      const nx = W[k + 1];
      if (nx && !nx.gap && k > 0 && (clausalAhead(W, k + 1, true) || nx.cat === 'ADJ' || nx.cat === 'V' || (prev && TIME_N.has(prev.s) && isNominal(nx)))) {
        const pv = prev;
        const nounBefore = pv && (pv.cat === 'N' || pv.cat === 'PRON' || pv.cat === 'LOC' || pv.cat === 'CLF' || (pv.cat === 'DET' && W[k - 2] && isNominal(W[k - 2])));
        if (nounBefore) open('relcl', k, w, { markerRel: 'mark', markerWhy: `${w.s} after a noun starts a clause that describes it (relative clause)`, antecedent: pv });
        else open('ccomp', k, w, { markerRel: 'mark', markerWhy: `${w.s} after '${pv?.s}' introduces what it is about (complement clause)`, complement: true });
        continue;
      }
      // ที่ + noun: "at" — a preposition
      if (w.s === 'ที่') { w.cat = 'ADP'; w.role = 'preposition (at)'; }
      continue;
    }
    if ((SUB_ALWAYS.has(w.s) && (w.cat === 'SCONJ' || w.cat === 'CONJ')) && !(prev && prev.s === 'เพราะ' && w.s === 'ว่า')) {
      open('advcl', k, w, { markerRel: 'mark', markerWhy: `${w.s} opens a subordinate clause` });
      continue;
    }
    if ((w.cat === 'SCONJ' || w.cat === 'ADP') && SUB_TEST.has(w.s)) {
      if (clausalAhead(W, k + 1, false, w.s === 'ระหว่าง' || w.s === 'ตั้งแต่')) {
        open('advcl', k, w, { markerRel: 'mark', markerWhy: `${w.s} before a clause ("before / after / in order that …")` });
        continue;
      }
      continue;
    }
    if (w.cat === 'CONJ' && (w.s === 'แต่' || w.s === 'และ' || w.s === 'หรือ' || w.s === 'ส่วน' || w.s === 'ดังนั้น' || w.s === 'อนึ่ง')) {
      if (k > 0 && hasPredicate(ownUnits(cur, k)) && clausalAhead(W, k + 1, w.s === 'แต่' || w.s === 'ส่วน', false, w.s === 'แต่')) {
        open('coord', k, w, { markerRel: 'cc', markerWhy: `${w.s} joins this clause to the one before` });
        continue;
      }
      continue;
    }
    if (w.cat === 'ASP' && w.s === 'แล้ว' && k > 0 && W[k + 1] && !W[k + 1].gap && (W[k + 1].cat === 'V') && hasPredicate(ownUnits(cur, k))) {
      open('coord', k, w, { markerRel: 'cc', markerWhy: 'แล้ว between two actions = "and then"' });
      continue;
    }
  }
  cur.ranges[cur.ranges.length - 1][1] = W.length;
  // relative clause that ends where the main predicate group begins: ทุกคนที่เชื่อ … จะไม่พินาศ
  const PRE_AUX = new Set(['จะ', 'กำลัง', 'ต้อง', 'ควร', 'อาจ', 'คง', 'เคย']);
  for (let ci = 1; ci < clauses.length; ci++) {
    const c = clauses[ci];
    if (c.kind !== 'relcl') continue;
    const [a, b] = c.ranges[0];
    let predSeen = false;
    for (let k = a; k < b; k++) {
      const w = W[k];
      if (w.cat === 'V' || (w.cat === 'ADJ' && k === a)) predSeen = true;
      else if (predSeen && ((w.cat === 'AUX' && PRE_AUX.has(w.s)) || w.cat === 'GIVE') && !w.gap) {
        let n = k + 1;
        if (w.cat === 'GIVE' && W[n] && isNominal(W[n])) n++;
        while (W[n] && (W[n].cat === 'NEG' || W[n].cat === 'AUX' || W[n].cat === 'ADV')) n++;
        if (W[n] && (W[n].cat === 'V' || W[n].cat === 'ADJ')) {
          const host = clauses[ci - 1];
          c.ranges[0] = [a, k];
          host.ranges.push([k, b]);
          break;
        }
      }
    }
  }
  void B;
  return clauses;
}

// ───────────────────────────── one clause ─────────────────────────────

interface ClauseCtx {
  B: Builder;
  npHeadOf: Map<number, W>;
  /** final particles and interjections, attached once the clause tree is known */
  finals: Array<{ w: W; head: W }>;
}

const hasV = (w: W): boolean => w.alts.includes('V');

function auxLabel(w: W, head: W): string {
  const r = w.role ? ` (${w.role})` : '';
  return `${w.cat === 'ASP' ? 'aspect' : 'aspect / modal'} marker '${w.s}'${r} on '${head.s}'`;
}

function parseClause(units: W[], ctx: ClauseCtx, nextIsMarker = false, subordinate = false): W | undefined {
  const B = ctx.B;
  // chunks
  const chunks: Chunk[] = [];
  for (let j = 0; j < units.length;) {
    const u = units[j];
    const np = buildNP(units, j);
    if (np) { chunks.push(np); for (const m of np.members) ctx.npHeadOf.set(m.i, np.head); j = np.to; continue; }
    if (u.cat === 'ADP') {
      const nx = units[j + 1];
      if (nx && !nx.gap && nominalStart(units, j + 1)) {
        const np2 = buildNP(units, j + 1)!;
        for (const m of np2.members) ctx.npHeadOf.set(m.i, np2.head);
        chunks.push({ kind: 'PP', adp: u, np: np2 });
        j = np2.to;
        continue;
      }
      if (nx && !nx.gap && nx.cat === 'UNK') { chunks.push({ kind: 'PP', adp: u, unk: nx }); j += 2; continue; }
      if (u.s === 'อย่าง' && nx && !nx.gap && (nx.cat === 'ADJ' || (nx.cat === 'V' && !(units[j + 2] && !units[j + 2].gap && nominalStart(units, j + 2))))) { chunks.push({ kind: 'PP', adp: u, manner: nx }); j += 2; continue; }
    }
    chunks.push({ kind: 'W', w: u });
    j++;
  }
  const isW = (c: Chunk | undefined, ...cats: Cat[]): c is WC => !!c && c.kind === 'W' && cats.includes(c.w.cat);
  const npAt = (c: Chunk | undefined): NP | undefined => (c && c.kind === 'NP' && !c.quant ? c : undefined);

  // ── 1. the predicate
  let p = -1;
  let predW: W | undefined;
  let predNote: string[] = [];
  let copNP: NP | undefined;
  let predAlts: SyntaxAlternative[] = [];
  for (let q = 0; q < chunks.length && p < 0; q++) {
    const c = chunks[q];
    if (c.kind === 'W' && (c.w.cat === 'V' || c.w.cat === 'GIVE' || c.w.cat === 'COP')) { p = q; predW = c.w; }
    else if (q >= 1 && c.kind === 'W' && c.w.cat === 'UNK' && inferAfterSubject(chunks, q)) {
      p = q; predW = c.w; c.w.inferred = true; c.w.cat = 'V';
      predNote = ['unknown word between a subject and an object noun phrase: read as the verb by position only'];
      predAlts = [alt(undefined, 'dep', 0.3, `'${c.w.s}' may be part of a noun phrase instead`)];
    }
  }
  if (p >= 0 && predW && predW.cat === 'COP') {
    const nx = npAt(chunks[p + 1]);
    if (nx) { copNP = nx; }
  }
  if (p < 0) {
    // an adjective that stands alone (after a pronoun, a marker, a preposition phrase)
    for (let q = 0; q < chunks.length; q++) {
      const c = chunks[q];
      if (c.kind === 'W' && c.w.cat === 'ADJ' && !(chunks[q - 1]?.kind === 'W' && (chunks[q - 1] as WC).w.cat === 'UNK')) { p = q; predW = c.w; predNote = ['a stative verb (adjective) with no other verb in the clause is the predicate']; break; }
    }
  }
  if (p < 0) {
    // an unknown word right after a verb-taking marker is the verb
    for (let q = 1; q < chunks.length; q++) {
      const c = chunks[q];
      const b = chunks[q - 1];
      const pb = chunks[q - 2];
      const afterPassive = b.kind === 'NP' && !b.quant && !!pb && pb.kind === 'W' && pb.w.role === 'passive marker';
      if (c.kind === 'W' && c.w.cat === 'UNK' && !c.w.gap && ((b.kind === 'W' && (b.w.cat === 'AUX' || b.w.cat === 'ASP') && PURE_VERB_AUX.has(b.w.s)) || afterPassive)) {
        p = q; predW = c.w; c.w.inferred = true; c.w.cat = 'V';
        predAlts = [alt(undefined, 'dep', 0.3, `'${c.w.s}' may be a noun or part of a noun phrase; its class is not in the word list`)];
        predNote = [afterPassive ? 'unknown word after a passive marker and its doer: read as the verb' : `unknown word read as the verb: '${(b as WC).w.s}' (${(b as WC).w.role || 'a marker'}) can only stand before a verb`];
        break;
      }
    }
  }
  if (p < 0 && subordinate) {
    // inside a clause a marker opened (เมื่อ / ว่า / ที่ …): subject noun phrase + unknown word, then a preposition phrase or the end
    for (let q = 1; q < chunks.length; q++) {
      const c = chunks[q];
      const b = chunks[q - 1];
      const a = chunks[q + 1];
      if (c.kind === 'W' && c.w.cat === 'UNK' && !c.w.gap && b.kind === 'NP' && !b.quant && (!a || a.kind === 'PP' || (a.kind === 'W' && (a.w.cat === 'FIN' || a.w.cat === 'ASP')))) {
        p = q; predW = c.w; c.w.inferred = true; c.w.cat = 'V';
        predNote = ['unknown word after the subject of a subordinate clause: read as the verb by position only'];
        predAlts = [alt(undefined, 'dep', 0.3, `'${c.w.s}' may be part of a noun phrase instead`)];
        break;
      }
    }
  }
  if (p < 0 && nextIsMarker) {
    // pronoun + unknown word, then a clause marker (ฉันพอใจที่…): the unknown word is the verb
    for (let q = 1; q < chunks.length; q++) {
      const c = chunks[q];
      const b = chunks[q - 1];
      if (c.kind === 'W' && c.w.cat === 'UNK' && !c.w.gap && q === chunks.length - 1 && b.kind === 'NP' && b.head.cat === 'PRON' && !b.quant) {
        p = q; predW = c.w; c.w.inferred = true; c.w.cat = 'V';
        predNote = ['unknown word between a pronoun subject and a ที่ / ว่า clause: read as the verb by position only'];
        predAlts = [alt(undefined, 'dep', 0.3, `'${c.w.s}' may be part of a noun phrase instead`)];
        break;
      }
    }
  }
  if (p < 0) {
    // the last of a run of auxiliaries is the verb when the clause has no other (ไม่ได้อยู่ใน…, ได้ของ…)
    for (let q = chunks.length - 1; q >= 0; q--) {
      const c = chunks[q];
      if (c.kind === 'W' && c.w.cat === 'AUX' && (c.w.s === 'อยู่' || c.w.s === 'ได้' || c.w.s === 'อยาก')) {
        const after = chunks[q + 1];
        if (!after || after.kind === 'NP' || after.kind === 'PP' || (after.kind === 'W' && after.w.cat === 'UNK') || (after.kind === 'W' && (after.w.cat === 'FIN' || after.w.cat === 'ADV' || after.w.cat === 'ASP'))) {
          p = q; predW = c.w; c.w.promoted = true;
          predNote = [`'${c.w.s}' is an auxiliary but nothing else in the clause can be the verb, so it is read as the verb`];
          predAlts = [alt(undefined, 'aux', 0.35, `'${c.w.s}' as a plain auxiliary needs a verb the clause does not have`)];
          break;
        }
      }
    }
  }
  if (p < 0) {
    // a noun that is also a verb, after a subject noun phrase
    for (let q = 1; q < chunks.length; q++) {
      const c = chunks[q];
      if (c.kind === 'NP' && !c.quant && hasV(c.head) && chunks[q - 1].kind === 'NP' && c.head.i === c.members[0].i) {
        p = q; predW = c.head; predNote = [`'${c.head.s}' is also a verb, and a clause needs one: read as the predicate after the subject`];
        predAlts = [alt(undefined, 'dep', 0.35, `'${c.head.s}' as a noun (a second noun phrase) is the other reading`)];
        break;
      }
    }
  }
  let adjFromNP: Mod | undefined;
  if (p < 0) {
    // a noun phrase that ends in an adjective: the adjective may be the predicate (ท้องฟ้าใส)
    for (let q = 0; q < chunks.length; q++) {
      const c = chunks[q];
      if (c.kind === 'NP' && c.trailingAdj && !c.quant) { adjFromNP = c.trailingAdj; predW = c.trailingAdj.dep; p = q; predNote = ['noun + adjective with no verb in the clause: the adjective is read as the predicate']; break; }
    }
  }
  const finals = chunks.filter((c): c is WC => c.kind === 'W' && (c.w.cat === 'FIN' || c.w.cat === 'INTJ'));
  const addFinals = (head: W): void => { for (const f of finals) if (f.w !== head) ctx.finals.push({ w: f.w, head }); };

  // ── no predicate at all
  if (p < 0 || !predW) {
    const firstNP = chunks.find((c): c is NP => c.kind === 'NP');
    if (!firstNP) {
      const intj = finals.find((f) => f.w.cat === 'INTJ');
      if (!intj) return undefined;
      addFinals(intj.w);
      return intj.w;
    }
    for (const c of chunks) if (c.kind === 'NP') attachNPMods(B, c);
    addFinals(firstNP.head);
    return firstNP.head;
  }

  // the predicate of this clause (for copular clauses the predicate noun)
  let root: W = predW;
  let rootChunk = p;
  const consumed = new Set<number>();
  consumed.add(p);
  for (const c of chunks) if (c.kind === 'NP') { if (!(adjFromNP && c.trailingAdj === adjFromNP)) attachNPMods(B, c); else attachNPMods(B, c, adjFromNP); }
  if (copNP) {
    root = copNP.head;
    rootChunk = p + 1;
    consumed.add(p + 1);
    B.add(predW, copNP.head, 'cop', `"to be": links the subject to '${copNP.head.s}'`, [`${predW.s} + noun phrase = "X is Y"; the noun phrase is the predicate`], 0.8);
  }
  if (adjFromNP) {
    predAlts = [alt(adjFromNP.head, 'amod', 0.4, `no other verb in the clause: '${predW.s}' may instead be an adjective inside the noun phrase`)];
  }
  void rootChunk;

  // ── 2. before the predicate
  const pending: W[] = [];
  const preNPs: NP[] = [];
  const prePPs: PP[] = [];
  let passive = false;
  const agents: NP[] = [];
  const subjStart = adjFromNP ? p : p;
  for (let q = 0; q < subjStart; q++) {
    const c = chunks[q];
    if (c.kind === 'NP') {
      if (c.quant) continue;
      if (passive) agents.push(c); else preNPs.push(c);
    } else if (c.kind === 'PP') prePPs.push(c);
    else {
      const w = c.w;
      if (w.cat === 'AUX' || w.cat === 'ASP' || w.cat === 'NEG' || w.cat === 'ADV' || w.cat === 'ADVL') {
        if (w.role === 'passive marker') passive = true;
        pending.push(w);
      }
    }
  }
  if (adjFromNP) {
    // the noun phrase that held the adjective is the subject (its other members are attached above)
    const c = chunks[p] as NP;
    preNPs.push(c);
  }
  // the NP chunks that came before the predicate
  if (preNPs.length) {
    const nonTime = preNPs.filter((c) => !TIME_N.has(c.head.s));
    const subj = nonTime.length ? nonTime[nonTime.length - 1] : (preNPs.length === 1 && !adjFromNP ? undefined : preNPs[preNPs.length - 1]);
    const tgt = copNP ? copNP.head : predW;
    for (const c of preNPs) {
      if (c === subj) {
        const alts: SyntaxAlternative[] = [];
        const word = c.head.cat === 'PRON' ? 'pronoun' : 'noun';
        B.add(c.head, tgt, 'nsubj', `subject of '${tgt.s}'`, [`a ${word} phrase before the verb is its subject (Thai is subject-verb-object)`], c.head.cat === 'PRON' ? 0.8 : 0.75, alts);
      } else if (TIME_N.has(c.head.s)) {
        B.add(c.head, tgt, 'obl', `time phrase of '${tgt.s}'`, [`'${c.head.s}' is a time word: a time phrase before the subject is an adverbial`], 0.65);
      } else {
        B.add(c.head, tgt, 'obl', `fronted phrase of '${tgt.s}'`, ['a second noun phrase before the subject: a topic, read as an adverbial'], 0.4, [alt(tgt, 'nsubj', 0.35, 'it may be the subject and the other noun phrase a topic')]);
      }
    }
  }
  for (const c of agents) {
    B.add(c.head, predW, 'obl', `doer in the passive of '${predW.s}'`, ['the noun phrase between ถูก / โดน and the verb is who did it'], 0.7);
  }
  const target = copNP ? copNP.head : predW;
  for (const c of prePPs) attachPP(B, c, target, undefined, undefined, 'fronted');
  // pre-verbal markers
  const flushPending = (to: W, list: W[]): void => {
    for (const w of list) attachMarker(B, w, to);
  };
  flushPending(target, pending);

  // ── 3. predicate relations for the unknown / promoted / adjective cases are added by the caller (root / conj / …)
  ctxSetPredNote(ctx, root, predNote, predAlts);

  // ── 4. after the predicate
  let last: W = predW;
  const chain: W[] = [predW];
  const objTaken = new Set<number>();
  const nominalsSeen: W[] = [];
  let pend: W[] = [];
  let prevConj: W | undefined;
  let prevNPChunk: NP | undefined;
  let pendingAgents: NP[] = [];
  let afterDir = false;
  for (const c of copNP ? [copNP] : []) nominalsSeen.push(c.head);
  const start = copNP ? p + 2 : adjFromNP ? p + 1 : p + 1;
  if (adjFromNP) {
    // anything in the same chunk after the adjective cannot exist (the adjective is the chunk's last member)
  }
  let q = start;
  const flushPend = (to: W): void => { flushPending(to, pend); pend = []; for (const a of pendingAgents) B.add(a.head, to, 'obl', `doer in the passive of '${to.s}'`, ['the noun phrase between ถูก / โดน and the verb is who did it'], 0.7); pendingAgents = []; };
  const ahead = (from: number): Chunk | undefined => chunks[from];
  const lookVerbal = (from: number): number => {
    // index of the next verbal chunk after markers, or -1
    let r = from;
    while (chunks[r] && chunks[r].kind === 'W') {
      const cw = (chunks[r] as WC).w;
      if (cw.cat === 'V' || cw.cat === 'ADJ' || cw.cat === 'GIVE') return r;
      if (cw.cat === 'NEG' || cw.cat === 'AUX' || cw.cat === 'ASP' || cw.cat === 'ADV' || cw.cat === 'ADVL') { r++; continue; }
      return -1;
    }
    return -1;
  };
  const objectOf = (c: NP): void => {
    const host = last;
    if (afterDir) {
      afterDir = false;
      B.add(c.head, host, 'obl', `place or goal of '${host.s}'`, ['a noun phrase right after a direction word (ไป มา เข้า ออก ลง …) is where the action goes'], 0.55);
    } else if (REL_N.has(c.head.s) && c.mods.some((m) => m.relation === 'nmod' && m.head === c.head)) {
      const nb = prevNPChunk && chunks[q - 1] === prevNPChunk ? prevNPChunk.head : undefined;
      B.add(c.head, host, 'obl', `place of '${host.s}'`, [`'${c.head.s}' is a place word (front, side, back …): a phrase with it tells where`], 0.55, nb ? [alt(nb, 'nmod', 0.3, `the phrase may describe the noun '${nb.s}' just before it`)] : []);
    } else if (INTRANS.has(host.s)) {
      const alts = MOTION.has(host.s) ? [alt(host, 'obj', 0.35, `'${host.s}' can also be read as taking its goal as a direct object`)] : [];
      B.add(c.head, host, 'obl', `place or goal of '${host.s}'`, [`'${host.s}' is a verb of motion or posture: the bare noun after it is where, not a direct object`], 0.6, alts);
    } else if (host.cat === 'N' || host === copNP?.head) {
      B.add(c.head, host, 'nmod', `noun modifying '${host.s}'`, ['a noun after the predicate noun'], 0.4);
    } else if (!objTaken.has(host.i)) {
      objTaken.add(host.i);
      B.add(c.head, host, 'obj', `object of '${host.s}'`, [`the bare noun phrase right after the verb '${host.s}' is what it acts on`], c.head.cat === 'PRON' ? 0.7 : 0.75);
    } else if (TIME_N.has(c.head.s)) {
      B.add(c.head, host, 'obl', `time phrase of '${host.s}'`, ['a time word after the object'], 0.6);
    } else {
      const firstObj = [...B.rels.values()].find((r) => r.relation === 'obj' && r.head === host.i);
      if (firstObj && host.cat === 'GIVE') {
        firstObj.relation = 'iobj'; firstObj.label = `recipient of '${host.s}'`; firstObj.basis = [`ให้ as the verb "give" takes the receiver first, then the thing given`];
        B.add(c.head, host, 'obj', `thing given by '${host.s}'`, ['the second bare noun phrase after "give" is the thing given'], 0.6);
        nominalsSeen.push(c.head);
        return;
      }
      B.add(c.head, host, 'obl', `second noun phrase of '${host.s}'`, [`'${host.s}' already has an object; a second bare noun phrase is an adverbial or a second object`], 0.4, [
        ...(firstObj ? [alt(host, 'obj', 0.3, 'it may be the object, the first one a recipient')] : []),
      ]);
    }
    nominalsSeen.push(c.head);
  };
  const tryComplement = (from: number, host: W, mark?: W): number => {
    // [NP] [markers] V/ADJ after ให้ / ทำให้: a clause "so that …"
    let r = from;
    let subj: NP | undefined;
    if (npAt(chunks[r])) { subj = chunks[r] as NP; r++; }
    const markers: W[] = [];
    while (isW(chunks[r], 'NEG', 'AUX', 'ASP', 'ADV', 'ADVL', 'UNK')) {
      const mw = (chunks[r] as WC).w;
      // อยู่ / ได้ with no verb after it is itself the verb (ให้เราอยู่ใกล้…)
      if (mw.cat === 'AUX' && (mw.s === 'อยู่' || mw.s === 'ได้') && !isW(chunks[r + 1], 'V', 'ADJ')) break;
      if (mw.cat !== 'UNK') markers.push(mw);
      r++;
    }
    const v = chunks[r];
    if (v && v.kind === 'W' && v.w.cat === 'AUX' && (v.w.s === 'อยู่' || v.w.s === 'ได้')) v.w.promoted = true;
    if (!(v && v.kind === 'W' && (v.w.cat === 'V' || v.w.cat === 'ADJ' || v.w.promoted))) return -1;
    const pw = v.w;
    if (subj) {
      B.add(pw, host, 'ccomp', `clause that '${host.s}' sets up`, [mark ? `${mark.s} + noun + verb: let / make a clause happen` : `${host.s} + noun + verb: the clause is what is caused`], 0.65, [
        alt(host, 'xcomp', 0.3, 'the verb may be a plain serial verb of the host'),
      ]);
      B.add(subj.head, pw, 'nsubj', `subject of '${pw.s}'`, [`the noun phrase after ${mark ? mark.s : host.s} is who / what does the following verb`], 0.7);
    } else {
      B.add(pw, host, 'xcomp', `verb that '${host.s}' sets up`, [mark ? `${mark.s} + verb: "so as to / until"` : `${host.s} + verb: serial verb`], 0.6);
    }
    if (mark) B.add(mark, pw, 'mark', `"${mark.s}" introducing '${pw.s}'`, [`${mark.s} before a verb or a noun + verb introduces a clause (let / make / so that)`], 0.7);
    for (const m of markers) attachMarker(B, m, pw);
    chain.push(pw);
    last = pw;
    return r + 1;
  };
  // p itself may be ให้ / ทำให้ with a complement
  if (predW.cat === 'GIVE') {
    const nx = tryComplement(start, predW, undefined);
    if (nx >= 0) q = nx;
  } else if (predW.s === 'ทำให้') {
    const nx = tryComplement(start, predW, undefined);
    if (nx >= 0) q = nx;
  }
  for (; q < chunks.length; q++) {
    const c = chunks[q];
    if (c.kind === 'NP') {
      if (c.quant) {
        const target2 = [...nominalsSeen].reverse().find((n) => n.cat !== 'PRON') ?? nominalsSeen[nominalsSeen.length - 1];
        if (target2) {
          for (const m of c.mods) if (m.relation === 'nummod') B.add(m.dep, target2, 'nummod', `number counting '${target2.s}'`, ['number + classifier after the noun phrase it counts (the nearest noun, not a pronoun)'], 0.55);
          B.add(c.head, target2, 'clf', `classifier of '${target2.s}'`, ['the classifier of a number that follows its noun phrase'], 0.55);
          if (c.mods.some((m) => m.relation !== 'nummod')) { /* attached by attachNPMods */ }
        }
        prevNPChunk = c;
        continue;
      }
      if (passive && isW(ahead(q + 1), 'V')) { pendingAgents.push(c); continue; }
      objectOf(c);
      afterDir = false;
      prevNPChunk = c;
      continue;
    }
    if (c.kind === 'PP') {
      attachPP(B, c, last, chain.length > 1 ? chain[0] : undefined, prevNPChunk && chunks[q - 1] === prevNPChunk ? prevNPChunk.head : undefined, 'after');
      prevNPChunk = undefined;
      continue;
    }
    const w = c.w;
    switch (w.cat) {
      case 'V': case 'ADJ': case 'COP': {
        if (w.cat === 'COP') { /* copula after the predicate: read as a verb */ }
        if (w.cat === 'ADJ') {
          const before = chunks[q - 1];
          if (before && before.kind === 'W' && before.w.cat === 'UNK') {
            const t = [...nominalsSeen].reverse().find((n) => n.cat !== 'PRON');
            if (t) { B.add(w, t, 'amod', `adjective describing '${t.s}'`, [`an adjective after the unknown word '${before.w.s}' is read as describing the nearest noun before it`], 0.4); break; }
          }
          // ADJ right after the verb: how it is done / the result
          if (LINKING.has(last.s) || last.cat === 'ADJ') B.add(w, last, 'xcomp', `state that '${last.s}' leads to or reports`, [last.cat === 'ADJ' ? 'a stative word right after a stative predicate is a second predicate (สบายดี)' : `'${last.s}' is a linking verb (feel, seem, become): the stative word after it is its complement`], 0.6, [alt(last, 'advmod', 0.3, 'it may instead say how the action is done')]);
          else B.add(w, last, 'advmod', `how or in what state '${last.s}' happens`, ['a stative word right after a verb says how it is done'], 0.5, [alt(last, 'xcomp', 0.4, 'it may be a second predicate (serial stative verb)')]);
          flushPend(w);
          break;
        }
        const dir = DIRECTIONAL.has(w.s);
        if (dir) {
          B.add(w, last, 'compound', `direction or result added to '${last.s}'`, [`serial verb rule 1: '${w.s}' right after a verb adds a direction or an end point`], 0.7, [alt(last, 'xcomp', 0.3, 'it may be read as a second verb')]);
        } else {
          B.add(w, last, 'xcomp', `second verb in a chain with '${last.s}'`, [`serial verb rule 2: another verb after '${last.s}' (with or without an object between) is a second action`], 0.6, [alt(chain[0], 'conj', 0.3, 'two actions may be read as coordinated')]);
        }
        flushPend(w);
        chain.push(w);
        if (dir) afterDir = true; else last = w;
        if (w.s === 'ทำให้') { const nx = tryComplement(q + 1, w, undefined); if (nx >= 0) q = nx - 1; }
        break;
      }
      case 'GIVE': {
        const nx = tryComplement(q + 1, last, w);
        if (nx >= 0) { q = nx - 1; break; }
        const np = npAt(chunks[q + 1]);
        if (np) {
          B.add(w, np.head, 'case', `"for / to" marking '${np.head.s}'`, ['ให้ before a noun phrase after a verb = "for / to (someone)"'], 0.7, [alt(last, 'xcomp', 0.25, 'ให้ may also be the verb "give"')]);
          B.add(np.head, last, 'obl', `recipient of '${last.s}'`, ['the person ให้ marks is who it is done for'], 0.7);
          nominalsSeen.push(np.head);
          prevNPChunk = np;
          q++;
        } else {
          B.add(w, last, 'dep', `"give / for" attached to '${last.s}'`, ['ให้ with nothing recognisable after it: attached, relation not decided'], 0.3);
        }
        break;
      }
      case 'AUX': case 'ASP': {
        const v = lookVerbal(q + 1);
        if (v >= 0 && w.cat === 'AUX') { pend.push(w); break; }
        if (w.role === 'passive marker') { pend.push(w); passive = true; break; }
        if (v >= 0) { pend.push(w); break; }
        attachMarker(B, w, w.cat === 'ASP' ? chain[0] : last);
        break;
      }
      case 'NEG': case 'ADVL': {
        const v = lookVerbal(q + 1);
        if (v >= 0) pend.push(w); else attachMarker(B, w, last);
        break;
      }
      case 'ADV': {
        const v = lookVerbal(q + 1);
        if (v >= 0 && !DEGREE.has(w.s) && !POST_ADV.has(w.s) && (chunks[v] as WC).w.cat !== 'ADJ') pend.push(w); else attachMarker(B, w, last);
        break;
      }
      case 'RES': B.add(w, last, 'aux', `resultative marker 'ไว้' on '${last.s}'`, ['ไว้ after a verb: the result is kept / left in place'], 0.6); break;
      case 'FIN': case 'INTJ': break; // finals handled below
      case 'NUM': case 'CLF': case 'DET': {
        const t = [...nominalsSeen].reverse().find((n) => n.cat !== 'PRON') ?? nominalsSeen[nominalsSeen.length - 1];
        if (t) {
          const rel: DependencyRelation = w.cat === 'NUM' ? 'nummod' : w.cat === 'CLF' ? 'clf' : 'det';
          B.add(w, t, rel, `${rel === 'nummod' ? 'number' : rel === 'clf' ? 'classifier' : 'determiner'} of '${t.s}'`, [`a loose ${rel === 'det' ? 'determiner' : 'number or classifier'} is read as belonging to the nearest noun before it`], 0.4);
        }
        break;
      }
      case 'CONJ': {
        const nxt = chunks[q + 1];
        const conjunct = nxt && nxt.kind === 'NP' ? nxt.head : nxt && nxt.kind === 'W' && (nxt.w.cat === 'ADJ' || nxt.w.cat === 'V') ? nxt.w : undefined;
        const prior = prevConj ?? (chunks[q - 1] && chunks[q - 1].kind === 'NP' ? (chunks[q - 1] as NP).head : chunks[q - 1] && chunks[q - 1].kind === 'W' ? (chunks[q - 1] as WC).w : undefined);
        if (conjunct && prior && w.s !== 'จึง') {
          if (!B.has(conjunct)) B.add(conjunct, prior, 'conj', `coordinated with '${prior.s}'`, [`${w.s} joins it to '${prior.s}'`], 0.55);
          B.add(w, conjunct, 'cc', `"${w.s}" joining '${prior.s}' and '${conjunct.s}'`, ['the conjunction stands before the second conjunct'], 0.7);
        } else if (w.s === 'จึง' || w.s === 'ส่วน') {
          B.add(w, last, 'advmod', `"${w.s}" (${w.role || 'connective'}) in the clause of '${last.s}'`, ['a connective inside the clause'], 0.5);
        }
        break;
      }
      case 'ADP': {
        if (w.s === 'ก่อน' || w.s === 'หลัง' || w.s === 'ต่อ') {
          B.add(w, last, 'advmod', `"${w.s}" (time word) with '${last.s}'`, ['a time preposition with no noun phrase after it is an adverb'], 0.4);
        } else {
          B.add(w, last, 'advmod', `"${w.s}" with no noun phrase after it`, ['a preposition with no recognisable noun after it: read as an adverb'], 0.35);
        }
        break;
      }
      case 'REDUP': break; // handled globally
      default: break;
    }
    if (w.cat === 'NEG' || w.cat === 'ADV' || w.cat === 'ADVL' || w.cat === 'AUX' || w.cat === 'ASP') prevNPChunk = undefined;
    prevConj = undefined;
  }
  // markers that never met a verb
  for (const w of pend) attachMarker(B, w, last);
  addFinals(root);
  void consumed;
  return root;
}

/** subject noun phrase + unknown word + object noun phrase: the unknown word is the verb (by position only) */
function inferAfterSubject(chunks: Chunk[], q: number): boolean {
  const c = chunks[q];
  const b = chunks[q - 1];
  const a = chunks[q + 1];
  if (!(c.kind === 'W') || c.w.gap || b.kind !== 'NP' || b.quant) return false;
  if (!(b.head.cat === 'PRON' || q === 1)) return false;
  if (a && a.kind === 'W' && a.w.cat === 'GIVE' && !a.w.gap && b.head.cat !== 'PRON') return true;
  return !!a && a.kind === 'NP' && !a.quant && !a.members[0].gap;
}

function ctxSetPredNote(ctx: ClauseCtx, root: W, note: string[], alts: SyntaxAlternative[]): void {
  predInfo.set(root.i, { note, alts });
  void ctx;
}
const predInfo = new Map<number, { note: string[]; alts: SyntaxAlternative[] }>();

function attachNPMods(B: Builder, np: NP, skip?: Mod): void {
  for (const m of np.mods) {
    if (m === skip) continue;
    B.add(m.dep, m.head, m.relation, m.label, m.basis, m.conf, m.alts);
  }
}

function attachFinal(B: Builder, w: W, to: W): void {
  if (w.cat === 'INTJ') { B.add(w, to, 'discourse', `interjection in the sentence of '${to.s}'`, ['an interjection'], 0.6); return; }
  const q = QUESTION_PARTICLES.has(w.s);
  const label = POLITE.has(w.s) ? `polite particle ${w.s} ending the sentence` : q ? `question particle ${w.s}: makes it a yes/no question` : `final particle ${w.s}${w.role ? ` (${w.role})` : ''}`;
  const basis = POLITE.has(w.s) ? ['a polite particle stands last and marks the speaker’s politeness (no grammatical role)']
    : q ? [`${w.s} at the end of a sentence turns it into a yes/no question`] : ['a sentence-final particle adds mood, not content'];
  B.add(w, to, 'discourse', label, basis, 0.85);
}

function attachMarker(B: Builder, w: W, to: W): void {
  if (B.has(w)) return;
  switch (w.cat) {
    case 'AUX': case 'ASP':
      B.add(w, to, 'aux', auxLabel(w, to), [w.role ? `${w.s} is a ${w.role}; it stands next to the verb it marks` : `${w.s} is an auxiliary next to the verb it marks`], 0.8);
      break;
    case 'NEG':
      B.add(w, to, 'advmod', `negation of '${to.s}'`, ['ไม่ before a verb or adjective negates it'], 0.85);
      break;
    case 'ADVL':
      B.add(w, to, 'advmod', w.s === 'ก็' ? `linking particle ก็ with '${to.s}'` : `result connective "${w.s}" in the clause of '${to.s}'`, [w.s === 'ก็' ? 'ก็ links the clause to what came before ("so, also")' : `${w.s} (${w.role || 'connective'}) inside the clause`], 0.6);
      break;
    case 'ADV':
      B.add(w, to, 'advmod', `${w.role ? `${w.role} ` : 'adverb '}"${w.s}" modifying '${to.s}'`, ['an adverb next to the verb modifies it'], DEGREE.has(w.s) ? 0.75 : 0.65);
      break;
    default:
      break;
  }
}

function attachPP(B: Builder, c: PP, last: W, first: W | undefined, nounBefore: W | undefined, where: 'after' | 'fronted'): void {
  const alts: SyntaxAlternative[] = [];
  if (nounBefore && where === 'after') alts.push(alt(nounBefore, 'nmod', 0.35, `the phrase may modify the noun '${nounBefore.s}' just before it`));
  if (nounBefore && where === 'after' && c.adp.s === 'กับ' && c.np) alts.push(alt(nounBefore, 'conj', 0.4, `กับ may mean "and": '${c.np.head.s}' coordinated with '${nounBefore.s}'`));
  if (first && first.i !== last.i && where === 'after') alts.push(alt(first, 'obl', 0.3, `the phrase may belong to the first verb '${first.s}' instead of the last`));
  if (c.np) {
    B.add(c.adp, c.np.head, 'case', `preposition "${c.adp.s}" marking '${c.np.head.s}'`, [`${c.adp.s}${c.adp.role ? ` (${c.adp.role})` : ''} stands before its noun phrase`], 0.85);
    B.add(c.np.head, last, 'obl', `${c.adp.s}-phrase of '${last.s}'`, where === 'fronted' ? ['a preposition phrase before the verb modifies it'] : [`a preposition phrase after '${last.s}' tells where, when, with whom or for whom`], 0.7, alts);
    attachNPMods(B, c.np);
  } else if (c.manner) {
    B.add(c.adp, c.manner, 'mark', `"อย่าง" making '${c.manner.s}' an adverb of manner`, ['อย่าง + adjective = "in a … way"'], 0.8);
    B.add(c.manner, last, 'advmod', `manner of '${last.s}'`, ['อย่าง + adjective is an adverbial: how the action is done'], 0.7, alts.filter((a) => a.relation !== 'nmod'));
  } else if (c.unk) {
    B.add(c.adp, c.unk, 'case', `preposition "${c.adp.s}" before the unknown word '${c.unk.s}'`, [`${c.adp.s} stands before a noun phrase; the next word is not in the word list`], 0.6);
    B.add(c.unk, last, 'obl', `${c.adp.s}-phrase of '${last.s}'`, [`the unknown word '${c.unk.s}' follows the preposition '${c.adp.s}', so it is read as its noun (position only)`], 0.4, alts);
  }
}

// ───────────────────────────── the whole sentence ─────────────────────────────

export function thaiSyntax(tokens: RawToken[], analyses: AnalyzedToken[]): SyntaxAnalysis {
  const surfaces = tokens.map((t) => t.surface);
  const { words: W, punct } = classify(tokens, analyses);
  const B = new Builder();
  const out: SyntaxAnalysis = { languageId: 'th', analyzer: THAI_SYNTAX_ANALYZER, tokens: surfaces, relations: [], notes: [], attached: 0 };
  if (!W.length) return out;
  predInfo.clear();
  const ctx: ClauseCtx = { B, npHeadOf: new Map(), finals: [] };
  const clauses = segment(W, B);
  // vocative: a name or kin word, then a comma, then a clause with its own subject
  let vocative: W | undefined;
  {
    const first = W[0];
    const nextTok = tokens[first.i + 1];
    if (first && (first.cat === 'N' || first.cat === 'PRON') && nextTok && !nextTok.isWord && (nextTok.surface === ',' || nextTok.surface === '،') && W.length > 1 &&
      (/kin term/u.test(first.role) || first.s === 'คุณ' || (first.known && first.cat === 'N' && first.role === ''))) {
      vocative = first;
    }
  }
  // parse each clause
  for (const c of clauses) {
    c.units = c.ranges.flatMap(([a, b]) => W.slice(a, b)).filter((w) => w !== vocative);
    const nx = clauses[clauses.indexOf(c) + 1];
    c.head = c.units.length ? parseClause(c.units, ctx, !!nx && (nx.kind === 'ccomp' || nx.kind === 'relcl'), c.kind !== 'main' && !c.bare) : undefined;
  }
  // the root clause
  const spine = clauses.filter((c) => c.head);
  const rootClause = spine.find((c) => c.kind === 'main') ?? spine[0];
  const rootHead = rootClause?.head;
  if (rootClause && rootHead) {
    const info = predInfo.get(rootHead.i);
    if (!B.has(rootHead) || !B.rels.get(rootHead.i)) {
      B.add(rootHead, undefined, 'root', 'the main word of the sentence', info?.note.length ? ['the first verb is the predicate', ...info.note] : ['the first verb of the first main clause is the predicate'], info?.note.length ? 0.5 : 0.8, info?.alts);
    }
  }
  const rootClauseIdx = rootClause ? clauses.indexOf(rootClause) : -1;
  clauses.forEach((c, ci) => {
    const h = c.head;
    if (!h) {
      if (c.marker) out.notes.push(`'${c.marker.s}' opens a clause with no predicate the rules can find, so it is left unattached.`);
      return;
    }
    if (c === rootClause) {
      if (c.marker && c.markerRel === 'mark') B.add(c.marker, h, 'mark', `"${c.marker.s}" introducing '${h.s}'`, [c.markerWhy ?? 'subordinating word'], 0.7);
      if (c.marker && c.markerRel === 'cc') B.add(c.marker, h, 'cc', `"${c.marker.s}" joining '${h.s}'`, [c.markerWhy ?? 'coordinating word'], 0.7);
      return;
    }
    const info = predInfo.get(h.i);
    const extra = info?.note ?? [];
    const baseAlts = info?.alts ?? [];
    let gov: W | undefined;
    let rel: DependencyRelation = 'dep';
    let label = '';
    let why: string[] = [];
    let conf = 0.65;
    const alts: SyntaxAlternative[] = [...baseAlts];
    if (c.kind === 'ccomp') {
      const mi = c.marker ? W.indexOf(c.marker) : ci;
      let g: W | undefined;
      for (let k = mi - 1; k >= 0; k--) { const w = W[k]; if ((w.cat === 'V' || w.cat === 'ADJ' || w.promoted) && w.i !== h.i) { g = w; break; } }
      if (!g) for (let k = mi - 1; k >= 0; k--) if (W[k].cat === 'N') { g = W[k]; break; }
      gov = g; rel = 'ccomp';
      label = `clause that '${g?.s ?? '?'}' reports or is about`;
      why = [c.markerWhy ?? 'complement clause', `attached to the nearest verb before the marker, '${g?.s ?? '?'}'`];
      conf = c.complement ? 0.6 : 0.75;
    } else if (c.kind === 'relcl') {
      gov = c.antecedent ? ctx.npHeadOf.get(c.antecedent.i) ?? c.antecedent : undefined;
      rel = 'acl';
      label = `clause describing '${gov?.s ?? '?'}'`;
      why = [c.markerWhy ?? 'relative clause'];
      conf = 0.7;
    } else if (c.kind === 'advcl') {
      const before = [...clauses.slice(0, ci)].reverse().find((x) => x.head && x.kind !== 'ccomp' && x.kind !== 'relcl');
      const after = clauses.slice(ci + 1).find((x) => x.head && (x.kind === 'main' || x.kind === 'coord'));
      const g = before ?? after ?? (rootClauseIdx >= 0 && rootClauseIdx !== ci ? clauses[rootClauseIdx] : undefined);
      gov = g?.head; rel = 'advcl';
      label = `adverbial clause of '${gov?.s ?? '?'}'`;
      why = [c.markerWhy ?? 'subordinate clause', `attached to the clause ${before ? 'before it' : 'after it'}`];
      conf = 0.65;
      if (before && after && before.head && after.head && before.head !== after.head) alts.push(alt(after.head, 'advcl', 0.3, 'it may belong to the clause after it'));
    } else {
      const before = [...clauses.slice(0, ci)].reverse().find((x) => x.head && x.kind !== 'ccomp' && x.kind !== 'relcl');
      gov = before?.head ?? (rootHead !== h ? rootHead : undefined);
      rel = 'conj';
      const mi2 = c.marker ? W.indexOf(c.marker) : -1;
      if (mi2 > 0 && gov) { for (let k = mi2 - 1; k >= 0; k--) { if (W[k].cat === 'V' && W[k] !== gov && W[k].i !== h.i) { alts.push(alt(W[k], 'conj', 0.3, `a coordinated verb may join the nearest verb before it, '${W[k].s}', rather than the first`)); break; } if (W[k] === gov) break; } }
      label = `clause coordinated with '${gov?.s ?? '?'}'`;
      why = [c.markerWhy ?? (c.bare ? 'two clauses side by side (a pause between them)' : 'coordinate clause')];
      conf = c.bare ? 0.5 : 0.7;
    }
    if (!gov) { out.notes.push(`The clause with '${h.s}' has nothing the rules can attach it to.`); return; }
    if (extra.length) why = [...why, ...extra];
    B.add(h, gov, rel, label, why, extra.length ? Math.min(conf, 0.5) : conf, alts);
    if (c.marker && c.markerRel === 'mark') B.add(c.marker, h, 'mark', `"${c.marker.s}" introducing '${h.s}'`, [c.markerWhy ?? 'subordinating word'], 0.75);
    else if (c.marker && c.markerRel === 'cc') B.add(c.marker, h, 'cc', `"${c.marker.s}" joining '${h.s}' to '${gov.s}'`, [c.markerWhy ?? 'coordinating word'], 0.75);
  });
  for (const f of ctx.finals) {
    const own = clauses.find((c) => c.head === f.head);
    const embedded = !!own && (own.kind === 'ccomp' || own.kind === 'relcl' || own.kind === 'advcl') && own !== rootClause;
    attachFinal(B, f.w, POLITE.has(f.w.s) && embedded && rootHead ? rootHead : f.head);
  }
  // ว่า after เพราะ / แม้ ("because": one fixed expression)
  for (let k = 1; k < W.length; k++) {
    if (W[k].s === 'ว่า' && (W[k - 1].s === 'เพราะ' || W[k - 1].s === 'แม้') && !W[k].gap) B.add(W[k], W[k - 1], 'fixed', `part of the fixed "${W[k - 1].s}ว่า"`, [`${W[k - 1].s}ว่า is one connective written in two words`], 0.8);
  }
  // naming ว่า: ตั้งชื่อแมวว่าเจ้าขาว
  for (let k = 1; k + 1 < W.length; k++) {
    const w = W[k];
    if (w.s !== 'ว่า' || B.has(w) || w.cat !== 'SCONJ') continue;
    const nx = W[k + 1];
    const head = ctx.npHeadOf.get(nx.i);
    if (head && !B.has(head)) {
      let g: W | undefined;
      for (let m = k - 1; m >= 0; m--) if (W[m].cat === 'V') { g = W[m]; break; }
      if (g) {
        B.add(w, head, 'case', `"as / named" marking '${head.s}'`, ['ว่า before a bare noun phrase = "(named / called) as"'], 0.55);
        B.add(head, g, 'obl', `name or title given by '${g.s}'`, ['ว่า + a noun phrase after a verb of naming'], 0.5);
      }
    }
  }
  // the repetition mark ๆ: part of the word before it
  for (let k = 1; k < W.length; k++) {
    if (W[k].cat === 'REDUP' && !B.has(W[k])) B.add(W[k], W[k - 1], 'compound', `repetition mark: say '${W[k - 1].s}' twice`, ['ๆ repeats the word before it'], 0.8);
  }
  // fixed expressions
  for (let k = 0; k + 1 < W.length; k++) if (W[k].s === 'ไม่' && W[k + 1].s === 'นาน' && !W[k + 1].gap && B.has(W[k + 1])) {
    B.add(W[k], W[k + 1], 'advmod', 'negation of "นาน" (ไม่นาน = soon)', ['ไม่นาน "not long" is one time adverbial'], 0.8);
  }
  for (let k = 0; k + 2 < W.length; k++) {
    if (W[k].s === 'หลัง' && W[k + 1].s === 'จาก' && W[k + 2].s === 'นั้น') {
      B.add(W[k + 1], W[k], 'fixed', 'part of the fixed "หลังจากนั้น" (after that)', ['หลังจากนั้น is one adverbial expression'], 0.7);
      B.add(W[k + 2], W[k], 'fixed', 'part of the fixed "หลังจากนั้น" (after that)', ['หลังจากนั้น is one adverbial expression'], 0.7);
      const g = rootHead;
      if (g && g !== W[k]) B.add(W[k], g, 'advmod', `"after that" modifying '${g.s}'`, ['a fixed time adverbial'], 0.6);
    }
  }
  for (let k = 0; k + 1 < W.length; k++) {
    if (W[k].s === 'ด้วย' && W[k + 1].s === 'กัน' && !W[k + 1].gap && B.has(W[k])) B.add(W[k + 1], W[k], 'fixed', 'part of the fixed "ด้วยกัน" (together)', ['ด้วยกัน = together'], 0.7);
  }
  // vocative
  if (vocative && rootHead) B.add(vocative, rootHead, 'vocative', `person addressed: '${vocative.s}'`, ['a name or kin word followed by a comma at the start of the sentence addresses someone'], 0.55, [alt(rootHead, 'nsubj', 0.35, 'it may be the subject of the sentence')]);
  // punctuation
  for (const t of punct) {
    const to = rootHead;
    if (!to) continue;
    out.relations.push({ dependent: t, head: to.i, relation: 'punct', label: 'punctuation', basis: ['punctuation attaches to the main word'], confidence: 0.9, status: 'generated' });
  }
  // clause spans
  const spans: ClauseSpan[] = [];
  for (const c of clauses) {
    if (!c.units?.length) continue;
    const all = [...c.units, ...(c.marker ? [c.marker] : [])];
    const start = Math.min(...all.map((w) => w.i));
    const end = Math.max(...all.map((w) => w.i));
    const kind: ClauseSpan['kind'] = c.kind === 'main' ? 'main' : c.kind === 'relcl' ? 'relative' : c.kind === 'coord' ? 'coordinate' : c.kind === 'ccomp' ? (c.marker && W[W.indexOf(c.marker) - 1] && SPEECH.has(W[W.indexOf(c.marker) - 1].s) ? 'quote' : 'subordinate') : 'subordinate';
    const labelOf: Record<Kind, string> = { main: 'main clause', advcl: 'adverbial clause', ccomp: 'complement clause', relcl: 'relative clause', coord: 'coordinated clause' };
    spans.push({ start, end, kind, ...(c.marker ? { marker: c.marker.i } : {}), label: `${labelOf[c.kind]}${c.head ? ` around '${c.head.s}'` : ''}` });
  }
  if (spans.length) out.clauses = spans;
  // collect
  const wordRels = [...B.rels.values()];
  out.relations.push(...wordRels);
  out.relations.sort((a, b) => a.dependent - b.dependent);
  const wordIdx = W.filter((w) => !DIGITS.test(w.s) || tokens[w.i].isWord);
  const attachedN = wordIdx.filter((w) => B.rels.has(w.i)).length;
  out.attached = wordIdx.length ? Math.round((attachedN / wordIdx.length) * 1000) / 1000 : 0;
  const loose = wordIdx.filter((w) => !B.rels.has(w.i));
  if (loose.length) {
    const unknown = loose.filter((w) => !w.known);
    const other = loose.filter((w) => w.known);
    if (unknown.length) out.notes.push(`Not in the word list, so no relation: ${unknown.map((w) => w.s).join(' ')}.`);
    if (other.length) out.notes.push(`The rules could not place: ${other.map((w) => w.s).join(' ')}.`);
  }
  if (!rootHead) out.notes.push('No predicate or noun phrase the rules recognise: no root.');
  if (W.length > 40) out.notes.push('A long sentence (over 40 words): the clause cuts are less reliable.');
  return out;
}
