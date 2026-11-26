/**
 * The sentence layer of the Arabic analyser: what the NEIGHBOURS of a written word add to the readings arWordCandidates (analyze.ts)
 * gave it. Package C of docs/arabic/PLAN.md.
 *
 * THE CREDIT CONTRACT (binding). The card takes the highest-confidence reading, and every reading of 0.5 or more that is not
 * `unconfirmed` credits its lexeme. So:
 *   - an UNDECIDED word has no reading at 0.5 or more; a DECIDED word has exactly one lexeme at 0.5 or more;
 *   - this layer may REORDER the readings of one lexeme (which cell: case, mood, person) freely;
 *   - it may DECIDE between lexemes only by a rule that is grammatically certain in its window (`decide`): the chosen lexeme goes to
 *     0.80, notes.identity = 'sentence', notes.context says why in plain English, and the lexemes the rule excludes drop to 0.40;
 *   - a rule that is only LIKELY (`prefer`) moves a reading first and adds notes.context, but never lifts one to 0.5;
 *   - it never raises a reading the printed vowels contradict or reach by a spelling fold, and never touches a word whose lexicon is
 *     not loaded (notes.identity = 'partial') except to reorder;
 *   - where rules disagree, or the window is unclear, the word stays as it came.
 * A case or mood the page does not print is a NOTE (notes.case / notes.mood, notes.caseSource / moodSource = 'inferred'), never a
 * morph value; the one exception is the construct state (Definite = Cons), which is a fact of the phrase and is narrowed in `morph`.
 *
 * The rules (each a small function, its window and certainty in its comment):
 *   a  mood particles          لَمْ لَنْ كَيْ لِكَيْ …  + the verb right after is jussive / subjunctive            certain: a verb, not a noun
 *   b  the particles of verbs  قَدْ سَوْفَ  + the word after is a finite verb                                      certain
 *   c  prepositions            فِي عَلَى إِلَى عَنْ مَعَ … + the word after is a noun, genitive, never a finite verb   certain (not مِنْ, حَتَّى)
 *   d  إِنَّ and its sisters   + a noun / pronoun: accusative subject; أَنْ + verb against أَنَّ + noun                 certain when the next word is only one kind
 *   e  كَانَ and its sisters   + subject nominative + predicate accusative                                        a note
 *   f  numbers                 3–10 + plural genitive, 11–99 + singular accusative, 100 and 1000 + singular genitive   certain: no finite singular verb
 *   g  the noun phrase         construct (Definite=Cons, genitive second term), demonstrative, noun + adjective       likely (a note and an order)
 *   h  the verb and its subject  pronoun / noun before the verb, verb + subject + object                           the last is certain (a verb), the rest likely
 *   i  dialect and foreign script (dialect.ts) cap or uncredit every reading in the sentence                         before everything else
 *
 * MACHINE-DRAFTED rules from standard descriptions of Modern Standard Arabic grammar; not reviewed by a native speaker or an Arabist.
 * These are local rules over a window of one or two words, not a parser.
 */
import type { AnalysisCandidate, AnalyzedToken, RawToken } from '../../core/adapters';
import { arWordCandidates } from './analyze';
import { arDialectSignals, arForeignScript } from './dialect';
import * as G from './government';
import { arKeyIsPartial, lookupArabicForm, lookupArabicLemma } from './index-store';
import { arFeaturesOfCode } from './tags';
import { arKey, arLoose, packVocal, tashkilLevel, vocalMatch } from './text';
import { AR_PREFERRED } from './generated/preferences';
import { AR_ANALYZER, AR_SOURCE_IDS } from './version';

type Cand = AnalysisCandidate;

/** A log of the decisions that RAISED a lexeme (rule, word, lemma), kept only while `arRuleLogging(true)`: for audits of how often and how rightly each rule fires. */
export const AR_RULE_LOG: Array<{ rule: string; surface: string; lemma: string; pos: string }> = [];
let LOGGING = false;
let CURRENT_RULE = '';
export function arRuleLogging(on: boolean): void { LOGGING = on; if (on) AR_RULE_LOG.length = 0; }

const SHADDA = '\u0651';
/** The id of a reading's lexeme as the index and the preference table write it ("كَتَبَ|VERB"). */
const lexemeId = (c: Cand): string => `${c.lemma ?? ''}|${c.pos ?? ''}`;
/** Is lexeme `winner` reviewed as preferred over lexeme `loser` (generated/preferences.ts: the loser's row lists the winners)? */
export const arIsPreferredOver = (winner: string, loser: string): boolean => (AR_PREFERRED[loser] ?? []).includes(winner);
/**
 * Among the lexemes still possible for a word, the one that no other remaining lexeme beats by the reviewed table; when that leaves one, it is the word.
 * Otherwise, among NOUN and ADJ lexemes: the one read in its OWN citation form (the stem equals the letters of its head, and it is not a plural cell) beats
 * lexemes read only in another cell (broken plurals: بُرُد "(pl.) of بَرِيد" against بَرْد "cold"); when exactly one lexeme is left that way it is the word.
 * Two lexemes that are both in their citation form (عِلْم / عَلَم) are never chosen between: undefined, and the word stays open.
 */
function settleLexemes(cs: Cand[], surfaceKey: string): { lexeme: string; by: 'preference' | 'citation form' } | undefined {
  const byLex = new Map<string, Cand[]>();
  for (const c of cs) { const k = G.lexemeOf(c); const g = byLex.get(k); if (g) g.push(c); else byLex.set(k, [c]); }
  if (byLex.size < 2) return undefined;
  const ids = new Map([...byLex.entries()].map(([k, g]) => [k, lexemeId(g[0])] as const));
  const alive = [...byLex.keys()].filter((k) => ![...ids.entries()].some(([k2, id2]) => k2 !== k && arIsPreferredOver(id2, ids.get(k)!)));
  if (alive.length === 1) return { lexeme: alive[0], by: 'preference' };
  if (alive.length > 1 && alive.every((k) => byLex.get(k)!.every((c) => G.isPos(c, 'NOUN', 'ADJ')))) {
    const stemOf = (c: Cand): string => {
      const pre = (c.parts ?? []).filter((q) => q.kind === 'prefix').reduce((n, q) => n + arKey(q.text).length, 0);
      const suf = (c.parts ?? []).filter((q) => q.kind === 'suffix').reduce((n, q) => n + arKey(q.text).length, 0);
      return surfaceKey.slice(pre, surfaceKey.length - suf);
    };
    const citation = (c: Cand): boolean => !!c.lemma && arLoose(arKey(c.lemma)) === arLoose(stemOf(c)) && c.morph.PluralType !== 'Broken' && !G.hasVal(c, 'Number', 'Plur');
    const own = alive.filter((k) => byLex.get(k)!.some(citation));
    // measured on the development set (aggregate): this pick was right in 8 of 10 decisions, under the bar of 19 in 20 — it only reorders for now
    if (own.length === 1 && WINDOW_DECIDES.citationForm) return { lexeme: own[0], by: 'citation form' };
  }
  return undefined;
}

/**
 * WHICH WINDOWS DECIDE. A window that decides (a lexeme to 0.75–0.85) must have been audited by hand on a text of its own: at least 20 firings and at
 * least 19 in 20 right (docs: the batch-3 audit of 1,200 words, 2026-11-26). A window that has not earned it only REORDERS: its reading goes first, notes.context
 * says why, and the word stays under 0.5. Flip a flag only with a larger audit.
 *   verbSubjectObject   verb + subject + an ال-noun, at the start of a clause           20 firings, 19 right        decides
 *   subjectVerbPrep     a subject noun, the verb, a preposition                         24 firings, 23 right        decides
 *   verbSubjectOther    verb + subject + a preposition / أن / an adverb                   about 12 firings, 10 right   reorders
 *   passiveWulida       وُلِدَ                                                           17 firings, 16 right        reorders
 *   boyWithAdjective    ولد + a bare adjective: the noun                                 4 firings, 4 right          reorders
 *   constructHeads      after كل / بعض / أي …: a noun                                    about 6 firings, 6 right    reorders
 *   demonstrativeNoun   هذا + a word + a bare adjective: the noun                        3 firings, 3 right          reorders
 *   afterConstructFirst a printed first term + a word: the genitive                      0 firings                   reorders
 *   citationForm        two nouns left: the one in its own citation form (من البرد)       aggregate on the dev set: 10 decisions, 2 wrong   reorders
 */
const WINDOW_DECIDES = { verbSubjectObject: true, subjectVerbPrep: true, verbSubjectOther: false, passiveWulida: false, boyWithAdjective: false, constructHeads: false, demonstrativeNoun: false, afterConstructFirst: false, citationForm: false } as const;

/** A noun with a possessive pronoun written onto it (يَدَهُ): definite by its owner. */
const possessed = (c: Cand): boolean => !!c.parts?.some((q) => q.kind === 'suffix' && /possessive/.test(q.role ?? ''));

/** What the sentence layer lowers an excluded reading to: below the 0.5 that credits a lexeme. */
const EXCLUDED = 0.35; // a set-aside lexeme sits at least 0.25 under a decided one (the product calls a rival within 0.15 a conflict)
/** What a lexeme the sentence decides is raised to (the contract allows 0.75–0.85). */
const DECIDED = 0.8;
/** An undecided word's readings stay at or under this. */
const UNDECIDED = 0.45;
const round2 = (x: number): number => Math.round(x * 100) / 100;
const TANWIN = /[\u064B\u064C\u064D]/;
const CASE_WORD: Record<string, string> = { Nom: 'nominative', Acc: 'accusative', Gen: 'genitive' };
const MOOD_WORD: Record<string, string> = { Ind: 'indicative', Sub: 'subjunctive', Jus: 'jussive' };

/** Appends a plain-English reason to a reading's notes.context (never twice). */
function ctx(c: Cand, text: string): void {
  c.notes = { ...c.notes };
  const old = typeof c.notes.context === 'string' ? c.notes.context : '';
  if (!old.includes(text)) c.notes.context = old ? `${old} ${text}` : text;
}

const cloneCand = (c: Cand): Cand => ({ ...c, morph: { ...c.morph }, ...(c.notes ? { notes: { ...c.notes } } : {}), ...(c.parts ? { parts: c.parts } : {}), ...(c.varieties ? { varieties: [...c.varieties] } : {}) });
const intersect = (a: string[], b: string[]): string[] => a.filter((x) => b.includes(x));

// ───────────────────────────── the sentence ─────────────────────────────

interface Gov { code: 'Nom' | 'Acc' | 'Gen'; why: string }

export class ArSentence {
  readonly n: number;
  readonly keys: string[];
  readonly word: boolean[];
  readonly clause: number[];
  readonly dirty: boolean[];
  /** The case an earlier rule gave a word (a preposition's genitive …), written as a note at the end, with the adjectives that agree. */
  readonly gov = new Map<number, Gov>();
  /** Words the construct rule made a first term (a second construct term may follow a first term that is itself a second). */
  readonly consHead = new Set<number>();
  /** adjective token → the noun it was attached to (rule g), so a governor's case passes on. */
  readonly adjOf = new Map<number, number>();

  /** Tokens whose readings the dialect and foreign-script flags may lower and annotate (also lists handed in as given: lowering and notes are allowed there). */
  flag: boolean[];

  constructor(readonly tokens: readonly RawToken[], readonly cands: Cand[][], readonly edit: boolean[], readonly raise: boolean[], flag?: boolean[]) {
    this.flag = flag ?? edit.slice();
    this.n = tokens.length;
    this.keys = tokens.map((t) => (t.isWord ? arKey(t.surface) : ''));
    this.word = tokens.map((t, i) => t.isWord && cands[i].length > 0);
    this.dirty = tokens.map(() => false);
    let cl = 0;
    this.clause = tokens.map((t) => {
      if (!t.isWord && /[.!?\u061F\u2026\u06D4\n\r\u060C,;\u061B:\u2014\u2013()«»"\u201C\u201D]/.test(t.surface)) cl++;
      return cl;
    });
  }

  // ── windows ──
  /** The next word in the same clause with nothing but spaces between, or -1. */
  next(i: number): number {
    for (let j = i + 1; j < this.n; j++) {
      if (this.tokens[j].isWord) return this.clause[j] === this.clause[i] && this.word[j] ? j : -1;
      if (!/^\s*$/.test(this.tokens[j].surface) || this.clause[j] !== this.clause[i]) return -1;
    }
    return -1;
  }
  prev(i: number): number {
    for (let j = i - 1; j >= 0; j--) {
      if (this.tokens[j].isWord) return this.clause[j] === this.clause[i] && this.word[j] ? j : -1;
      if (!/^\s*$/.test(this.tokens[j].surface) || this.clause[j] !== this.clause[i]) return -1;
    }
    return -1;
  }
  firstInClause(i: number): boolean { return this.prev(i) < 0; }

  // ── readings ──
  any(i: number, pred: (c: Cand) => boolean): boolean { return i >= 0 && i < this.n && this.cands[i].some(pred); }
  top(i: number): Cand | undefined { return this.cands[i]?.[0]; }
  /** The readings that stand for the word: the decided lexeme's, or, for an undecided word, every reading that is not a weak guess. */
  eff(i: number): Cand[] {
    const cs = (this.cands[i] ?? []).filter((c) => !c.unconfirmed && !!c.lemma);
    const sure = cs.filter((c) => c.confidence >= 0.5);
    if (sure.length) { const lex = G.lexemeOf(sure[0]); return cs.filter((c) => G.lexemeOf(c) === lex); }
    return cs.filter((c) => c.confidence >= 0.3);
  }
  /** Every effective reading satisfies `pred` (and there is one). */
  effAll(i: number, pred: (c: Cand) => boolean): boolean { const e = this.eff(i); return e.length > 0 && e.every(pred); }
  partial(i: number): boolean { return this.cands[i].some((c) => c.notes?.identity === 'partial') || (this.keys[i] !== '' && arKeyIsPartial(this.keys[i])); }
  surface(i: number): string { return this.tokens[i].surface; }

  /** Does the page's own spelling agree with the reading? true / false (the printed marks contradict it) / undefined (cannot be compared). */
  pageOk(i: number, c: Cand): boolean | undefined {
    const v = c.notes?.vocalized;
    if (typeof v !== 'string' || !v) return undefined;
    const surf = this.tokens[i].surface;
    if (arKey(v) !== arKey(surf)) return undefined;
    if (tashkilLevel(surf) === 'none') return true;
    try { return vocalMatch(surf, arKey(v), packVocal(v)).compatible; } catch { return undefined; }
  }

  private sort(i: number): void {
    this.cands[i].sort((a, b) => b.confidence - a.confidence); // stable: ties keep the analyser's order
    this.dirty[i] = true;
  }

  // ── a trigger word ──
  /**
   * A reading of word `i` that is one of the words the rule is about. `ok` tests the lemma key. Only a bare particle or one with a
   * conjunction in front (وَ فَ أَ); a particle with a pronoun or an article attached is another thing. `certain`: the analyser put
   * this reading first and credited it, or the spelling is one of the particles nothing else is written like (`safe`).
   */
  trig(i: number, ok: (key: string, c: Cand) => boolean, safe?: ReadonlySet<string>): { c: Cand; certain: boolean; key: string } | undefined {
    const cs = this.cands[i];
    for (const c of cs) {
      if (!c.lemma || c.unconfirmed || G.isPos(c, 'NOUN', 'ADJ', 'PROPN', 'NUM')) continue;
      const key = G.lemmaKeyOf(c);
      if (!ok(key, c) || G.hasSuffix(c) || this.pageOk(i, c) === false) continue;
      const pre = (c.parts ?? []).filter((p) => p.kind === 'prefix');
      if (pre.some((p) => !['وَ', 'فَ', 'أَ'].includes(p.lemma ?? ''))) continue;
      const surfKey = this.keys[i];
      const conj = pre.map((p) => arKey(p.text)).join('');
      // the page wrote one hamza (إن) and the reading has the other (أَنْ): not this word
      const sk0 = surfKey.slice(conj.length);
      if ('أإ'.includes(sk0[0] ?? '-') && 'أإ'.includes(key[0] ?? '-') && sk0[0] !== key[0]) continue;
      const ownSpelling = arLoose(surfKey) === arLoose(`${conj}${key}`);
      // فَقَدْ is also "he lost": a chain with فَ before قَدْ is never certain by its spelling
      const fa = pre.some((p) => p.lemma === 'فَ') && key === 'قد';
      const certain = (cs[0] === c && c.confidence >= 0.5) || (ownSpelling && !!safe && safe.has(key) && !fa);
      return { c, certain, key };
    }
    return undefined;
  }

  // ── operations ──
  /**
   * CERTAIN rule: word `i` is one of the readings that satisfy `keep` (and not another). The others drop to 0.40; when exactly one
   * lexeme is left it is raised to 0.80 with notes.identity = 'sentence'. A partial word is only reordered; a word whose list was
   * handed in by the dictionary is lowered but never raised. Returns whether anything changed.
   */
  decide(i: number, keep: (c: Cand) => boolean, why: string, level = DECIDED): boolean {
    if (!this.edit[i]) return false;
    if (this.partial(i)) return this.prefer(i, keep, why);
    const all = this.cands[i];
    const S = all.filter((c) => keep(c) && this.pageOk(i, c) !== false);
    if (!S.length) return false;
    // a reading reached through a spelling fold (a hamza restored) is the weaker side of a tie with one spelled as written
    const exact = S.filter((c) => c.notes?.spelling !== 'restored');
    let base = exact.length ? exact : S;
    let lex = new Set(base.filter((c) => !c.unconfirmed && !!c.lemma).map(G.lexemeOf));
    // several lexemes left: the reviewed preferences (and, for nouns, a lexeme far commoner than the rest) settle which one the word is
    let settledBy = '';
    if (lex.size > 1) {
      const pick = settleLexemes(base.filter((c) => !c.unconfirmed && !!c.lemma), this.keys[i]);
      if (pick) {
        for (const c of base) if (G.lexemeOf(c) !== pick.lexeme && c.confidence > EXCLUDED) { c.confidence = EXCLUDED; ctx(c, `Set aside: ${pick.by === 'preference' ? 'another reading is reviewed as the preferred one' : 'another noun is read in its own citation form'}.`); }
        base = base.filter((c) => G.lexemeOf(c) === pick.lexeme);
        lex = new Set([pick.lexeme]);
        settledBy = pick.by;
      }
    }
    if (!lex.size) return false;
    let changed = false;
    for (const c of all) {
      if (S.includes(c) || c.confidence <= EXCLUDED) continue;
      c.confidence = EXCLUDED;
      ctx(c, `Set aside: ${why}.`);
      changed = true;
    }
    // a noun window says "a noun", not which: a noun lexeme the word level leads with that is read ONLY as a plural cell (البرد as بَرِيد, the plural بُرُد) while another noun is
    // in its own citation form (بَرْد) does not stay credited
    if (lex.size > 1 && base.every((c) => G.isPos(c, 'NOUN', 'ADJ')) && this.raise[i]) {
      const stem = (c: Cand): string => { const pre = (c.parts ?? []).filter((q) => q.kind === 'prefix').reduce((n, q) => n + arKey(q.text).length, 0); const suf = (c.parts ?? []).filter((q) => q.kind === 'suffix').reduce((n, q) => n + arKey(q.text).length, 0); return this.keys[i].slice(pre, this.keys[i].length - suf); };
      const own = (c: Cand): boolean => !!c.lemma && arLoose(arKey(c.lemma)) === arLoose(stem(c)) && !G.hasVal(c, 'Number', 'Plur') && c.morph.PluralType !== 'Broken';
      const pluralOnly = (k: string): boolean => base.filter((c) => G.lexemeOf(c) === k).every((c) => G.hasVal(c, 'Number', 'Plur') && !G.hasVal(c, 'Number', 'Sing') && !own(c));
      for (const k of lex) {
        if (!pluralOnly(k) || ![...lex].some((o) => o !== k && base.some((c) => G.lexemeOf(c) === o && own(c)))) continue;
        for (const c of base) if (G.lexemeOf(c) === k && c.confidence >= 0.5) { c.confidence = UNDECIDED; ctx(c, 'A noun is expected here; a plural cell does not decide which noun.'); changed = true; }
      }
    }
    if (lex.size === 1 && this.raise[i]) {
      const only = [...lex][0];
      const group = base.filter((c) => G.lexemeOf(c) === only);
      const best = Math.max(...group.map((c) => c.confidence));
      const sure = group.filter((c) => this.pageOk(i, c) === true);
      if (best < level && sure.length) {
        const delta = level - Math.max(...sure.map((c) => c.confidence));
        for (const c of sure) c.confidence = round2(Math.min(0.85, c.confidence + delta));
        changed = true;
      }
      if (best < level) for (const c of sure) if (c.confidence >= 0.5) c.notes = { ...c.notes, identity: 'sentence' };
      if (best < level && sure.length && LOGGING) AR_RULE_LOG.push({ rule: CURRENT_RULE, surface: this.tokens[i].surface, lemma: sure[0].lemma ?? '', pos: sure[0].pos ?? '' });
      const first = (sure.length ? sure : group).sort((a, b) => b.confidence - a.confidence)[0];
      ctx(first, `${why[0].toUpperCase()}${why.slice(1)}${settledBy === 'preference' ? ' (the other readings are reviewed as less likely)' : settledBy === 'citation form' ? ' (the only noun read in its own citation form here)' : ''}.`);
    } else {
      ctx(S.slice().sort((a, b) => b.confidence - a.confidence)[0], `${why[0].toUpperCase()}${why.slice(1)}.`);
    }
    if (changed) this.sort(i);
    return changed;
  }

  /**
   * LIKELY rule: the readings that satisfy `pred` come first. In a decided word only the cells of the decided lexeme change places; in
   * an undecided word another lexeme may come first but stays at 0.45 or less. Never crosses 0.5. Adds notes.context.
   */
  prefer(i: number, pred: (c: Cand) => boolean, why: string): boolean {
    if (!this.edit[i]) return false;
    const cs = this.cands[i];
    const S = cs.filter((c) => pred(c) && this.pageOk(i, c) !== false);
    if (!S.length || S.length === cs.length) return false;
    const top = cs[0];
    const sentence = `${why[0].toUpperCase()}${why.slice(1)}.`;
    if (top.confidence >= 0.5) {
      const lex = G.lexemeOf(top);
      const group = cs.filter((c) => G.lexemeOf(c) === lex);
      const gS = group.filter((c) => S.includes(c));
      if (!gS.length || gS.length === group.length || gS.includes(top)) return false;
      // the confidences stay in the group, handed out again with the preferred cells first
      const confs = group.map((c) => c.confidence).sort((a, b) => b - a);
      const ordered = [...gS, ...group.filter((c) => !gS.includes(c))];
      ordered.forEach((c, k) => { c.confidence = confs[k]; });
      ctx(gS[0], sentence);
      this.sort(i);
      return true;
    }
    const bestS = S.slice().sort((a, b) => b.confidence - a.confidence)[0];
    if (cs.indexOf(bestS) === 0 && !cs.some((c) => c !== bestS && !S.includes(c) && c.confidence >= bestS.confidence)) { ctx(bestS, sentence); return false; }
    const level = Math.min(UNDECIDED, Math.max(bestS.confidence, top.confidence));
    bestS.confidence = round2(level);
    for (const c of cs) if (!S.includes(c) && c.confidence >= level) c.confidence = round2(Math.max(0.05, level - 0.01));
    ctx(bestS, sentence);
    this.sort(i);
    return true;
  }

  /**
   * LIKELY rule inside each lexeme: the cells that satisfy `pred` come first, whatever lexeme leads the word. The readings of one lexeme swap
   * confidences among themselves, so no lexeme overtakes another and nothing crosses 0.5. Used where the rule says which CELL is meant (person,
   * number, gender), never which word.
   */
  preferCell(i: number, pred: (c: Cand) => boolean, why: string): boolean {
    if (!this.edit[i]) return false;
    const groups = new Map<string, Cand[]>();
    for (const c of this.cands[i]) { const k = G.lexemeOf(c); const g = groups.get(k); if (g) g.push(c); else groups.set(k, [c]); }
    let changed = false;
    const sentence = `${why[0].toUpperCase()}${why.slice(1)}.`;
    for (const group of groups.values()) {
      const S = group.filter((c) => pred(c) && this.pageOk(i, c) !== false);
      if (!S.length || S.length === group.length) continue;
      const rest = group.filter((c) => !S.includes(c));
      if (Math.max(...S.map((c) => c.confidence)) >= Math.max(...rest.map((c) => c.confidence))) { ctx(S.slice().sort((a, b) => b.confidence - a.confidence)[0], sentence); continue; }
      const confs = group.map((c) => c.confidence).sort((a, b) => b - a);
      [...S, ...rest].forEach((c, k) => { c.confidence = confs[k]; });
      ctx(S[0], sentence);
      changed = true;
    }
    if (changed) this.sort(i);
    return changed;
  }

  /** Narrows a union value (Person=2,3 → 3) on the readings that satisfy `pred`; a value no reading could take is left alone. */
  narrow(i: number, pred: (c: Cand) => boolean, key: string, allowed: string[], why: string): boolean {
    if (!this.edit[i]) return false;
    let changed = false;
    for (const c of this.cands[i]) {
      if (!pred(c) || !c.morph[key] || !c.morph[key].includes(',')) continue;
      const now = c.morph[key].split(',');
      const next = intersect(now, allowed);
      if (!next.length || next.length === now.length) continue;
      c.morph[key] = next.sort().join(',');
      ctx(c, `${why[0].toUpperCase()}${why.slice(1)}.`);
      changed = true;
    }
    if (changed) this.dirty[i] = true;
    return changed;
  }

  /** Writes an inferred case on the nominal readings of word `i` whose case the page left open (a union that holds it). */
  noteCase(i: number, code: 'Nom' | 'Acc' | 'Gen', why: string): void {
    if (!this.edit[i]) return;
    for (const c of this.cands[i]) {
      if (!(G.isNominal(c) || G.isPos(c, 'PRON')) || !c.morph.Case || !c.morph.Case.includes(',') || !G.valsOf(c, 'Case').includes(code)) continue;
      c.notes = { ...c.notes, case: `inferred: ${CASE_WORD[code]} ${why}`, caseSource: 'inferred' };
      this.dirty[i] = true;
    }
  }
  /** Writes an inferred mood on the imperfect readings of word `i` whose mood the page left open. */
  noteMood(i: number, code: 'Ind' | 'Sub' | 'Jus', why: string): void {
    if (!this.edit[i]) return;
    for (const c of this.cands[i]) {
      if (!G.isImperfect(c) || !c.morph.Mood || !c.morph.Mood.includes(',') || !G.valsOf(c, 'Mood').includes(code)) continue;
      c.notes = { ...c.notes, mood: `inferred: ${MOOD_WORD[code]} ${why}`, moodSource: 'inferred' };
      this.dirty[i] = true;
    }
  }
}

const vocalizedName = (c: Cand | undefined, fallback: string): string => (c?.lemma ? c.lemma : fallback);

// ───────────────────────────── the jussive: which lexeme has this cell ─────────────────────────────

const countOf = (c: Cand): number => (c.lemma && c.pos ? lookupArabicLemma(`${c.lemma}|${c.pos}`)?.[4] ?? 0 : 0);

/**
 * After a particle that puts the verb in the jussive (لَمْ, a prohibition لَا + 2nd person, a condition إِنْ): hollow and defective verbs SHORTEN in the
 * jussive (تَخَفْ from خَافَ, يَبْقَ from بَقِيَ), so the spelling is the jussive of one verb and the indicative of a rarer, geminate one (خَفَّ, بَقَّ).
 * Among the verb readings of word `j`, the lexeme that has a jussive cell on this spelling is chosen when it is the only one (0.80), or when it is at
 * least five times as frequent as every other that has one; otherwise nothing is decided (the order stays).
 */
function chooseJussive(s: ArSentence, j: number, name: string, only: (c: Cand) => boolean = () => true): void {
  const isJus = (c: Cand): boolean => G.isImperfect(c) && G.hasVal(c, 'Mood', 'Jus') && only(c);
  const imp = s.cands[j].filter((c) => isJus(c) && s.pageOk(j, c) !== false);
  if (!imp.length) return;
  const lexes = new Map<string, Cand[]>();
  for (const c of imp) { const g = lexes.get(G.lexemeOf(c)); if (g) g.push(c); else lexes.set(G.lexemeOf(c), [c]); }
  if (lexes.size === 1) { s.decide(j, isJus, `after ${name}: jussive, and only this verb has a jussive cell on this spelling`); return; }
  // the reviewed preferences first, then a verb at least five times as frequent as every other
  const pick = settleLexemes(imp, s.keys[j]);
  if (pick) { s.decide(j, (c) => isJus(c) && G.lexemeOf(c) === pick.lexeme, `after ${name}: jussive, and this verb is reviewed as the likelier of those with a jussive cell on this spelling`); return; }
  const ranked = [...lexes.entries()].map(([k, g]) => [k, Math.max(...g.map(countOf))] as const).sort((x, y) => y[1] - x[1]);
  if (ranked[0][1] > 0 && ranked[0][1] >= 5 * Math.max(ranked[1][1], 1)) s.decide(j, (c) => isJus(c) && G.lexemeOf(c) === ranked[0][0], `after ${name}: jussive, and this is by far the commonest verb with a jussive cell on this spelling`);
}

// ───────────────────────────── rule a: particles that govern a mood ─────────────────────────────

/** The reading is the particle of the table (a spelling with a shadda is another particle: أَنْ against أَنَّ, لَمَّا against لِمَا). */
const isMoodParticle = (key: string, c: Cand): boolean => {
  const spec = G.AR_MOOD_PARTICLES[key];
  if (!spec) return false;
  if (spec.shadda === undefined) return true;
  return (c.lemma ?? '').includes(SHADDA) === spec.shadda;
};

/**
 * لَمْ لَنْ كَيْ لِكَيْ لِئَلَّا … + the word right after. Window: the next word in the clause. CERTAIN for the particles nothing else is
 * written like: the next word is a verb, so a noun reading of it goes (لَنْ يَكْتُبَ: not "a book"); the verb is jussive after لَمْ and
 * subjunctive after the others (a note, or the page's own mark). For أَنْ, حَتَّى, إِذَنْ, لَمَّا, أَلَّا (also other words) only when the
 * next word has no noun reading at all, so that there is nothing to decide, only the mood to note.
 */
function ruleMoodParticles(s: ArSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i]) continue;
    const t = s.trig(i, isMoodParticle, G.AR_SAFE_PARTICLES);
    if (!t) continue;
    const spec = G.AR_MOOD_PARTICLES[t.key];
    const j = s.next(i);
    if (j < 0 || !s.any(j, G.isImperfect)) continue;
    const verbOnly = s.effAll(j, (c) => G.isFiniteVerb(c));
    const name = vocalizedName(t.c, t.key);
    // a question: لِمَ يَكْتُبُ؟ ("why does he write?") is not لَمْ
    if (t.key === 'لم' && !t.certain) continue;
    if (spec.certain && t.certain) {
      s.decide(j, G.isImperfect, `after ${name} the word is a verb, ${spec.moodWord}`);
    } else if (!verbOnly) continue;
    else s.prefer(j, G.isImperfect, `after ${name} a verb stands`);
    s.noteMood(j, spec.mood, `after ${name}`);
    if (spec.mood === 'Jus' && spec.certain && t.certain) chooseJussive(s, j, name);
    // the particle itself: followed by a verb-only word it is the particle (and not the verb or noun it is also spelled like)
    if (verbOnly) s.decide(i, (c) => !!c.lemma && !G.isPos(c, 'NOUN', 'ADJ', 'PROPN', 'NUM', 'VERB') && isMoodParticle(G.lemmaKeyOf(c), c) && !G.hasSuffix(c), `a verb follows, so this is the particle ${name}`);
  }
}

/**
 * لَا + a verb: with a 1st or 3rd person verb it is a negation and the verb is indicative; only a 2nd person verb can be a prohibition
 * (jussive: لَا تَكْتُبْ). A note only: لَا also stands before nouns (لَا شَيْءَ), so no lexeme is decided.
 */
function ruleLa(s: ArSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i]) continue;
    const t = s.trig(i, (k) => k === 'لا');
    if (!t) continue;
    const j = s.next(i);
    if (j < 0) continue;
    if (!s.edit[j]) continue;
    // a prohibition: لَا + a 2nd person verb that is nothing but a verb (لَا تَخَفْ); a word that is also a noun is left
    if (s.any(j, (c) => G.isImperfect(c) && G.valsOf(c, 'Person').includes('2')) && s.effAll(j, (c) => G.isFiniteVerb(c)) && (t.certain || s.keys[i] === 'لا')) chooseJussive(s, j, 'the forbidding لَا');
    for (const c of s.cands[j]) {
      if (!G.isImperfect(c)) continue;
      const persons = G.valsOf(c, 'Person');
      if (persons.length && !persons.includes('2') && c.morph.Mood?.includes(',') && G.valsOf(c, 'Mood').includes('Ind')) {
        c.notes = { ...c.notes, mood: 'inferred: indicative after the negative لَا (only a 2nd person verb can be forbidden)', moodSource: 'inferred' };
        s.dirty[j] = true;
      }
    }
  }
}

// ───────────────────────────── rule b: the particles of the verb ─────────────────────────────

/** قَدْ سَوْفَ + the next word. CERTAIN when the particle is certain: the next word is a finite verb (an imperfect after سَوْفَ), not a noun. */
function ruleVerbParticles(s: ArSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i]) continue;
    const t = s.trig(i, (k) => k in G.AR_VERB_PARTICLES, G.AR_SAFE_PARTICLES);
    if (!t) continue;
    const j = s.next(i);
    if (j < 0) continue;
    const want = t.key === 'سوف' ? G.isImperfect : G.isFiniteVerb;
    if (!s.any(j, want)) continue;
    const name = vocalizedName(t.c, t.key);
    if (t.certain) s.decide(j, want, `after ${name} the word is a verb`);
    else if (!s.effAll(j, (c) => G.isFiniteVerb(c))) continue;
    if (t.key === 'سوف') s.noteMood(j, 'Ind', `after ${name}`);
    else s.noteMood(j, 'Ind', `after ${name}`);
    if (s.effAll(j, (c) => G.isFiniteVerb(c))) s.decide(i, (c) => !!c.lemma && G.lemmaKeyOf(c) === t.key && !G.isPos(c, 'NOUN', 'ADJ', 'VERB', 'PROPN') && !G.hasSuffix(c), `a verb follows, so this is the particle ${name}`);
  }
}

// ───────────────────────────── rule c: prepositions ─────────────────────────────

/**
 * A preposition + the word after it. Window: the next word in the clause. CERTAIN for the prepositions nothing else is written like
 * (فِي عَلَى إِلَى عَنْ مَعَ, and any the analyser credited): a preposition is followed by a noun or pronoun in the genitive, never by a finite
 * verb, so a verb reading of the next word goes. NOT for مِنْ (also مَنْ "who" + verb), مُنْذُ, حَتَّى, which may stand before a verb: there
 * the rule only fires when the next word has no verb reading. The genitive is a note, written at the end with the adjectives that agree.
 */
function rulePrepositions(s: ArSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i]) continue;
    const t = s.trig(i, (k, c) => G.AR_PREPOSITIONS.has(k) && G.isPos(c, 'ADP'), G.AR_SAFE_PREPOSITIONS);
    if (!t) continue;
    const j = s.next(i);
    if (j < 0) continue;
    const name = vocalizedName(t.c, t.key);
    const verbPossible = G.AR_PREPOSITIONS_WITH_VERB.has(t.key) && s.any(j, G.isFiniteVerb);
    if (verbPossible) continue;
    // the next word must have a reading that a preposition can govern (a noun, pronoun, name, number …), or there is nothing to decide
    if (!s.any(j, (c) => !G.isFiniteVerb(c) && !G.isPos(c, 'PART', 'SCONJ', 'CONJ'))) continue;
    if (t.certain) s.decide(j, (c) => !G.isFiniteVerb(c), `after the preposition ${name} stands a noun, not a verb`);
    else s.prefer(j, (c) => !G.isFiniteVerb(c), `after the preposition ${name} a noun is expected`);
    if (s.effAll(j, (c) => G.isNominal(c) || G.isPos(c, 'PRON', 'DET'))) s.gov.set(j, { code: 'Gen', why: `after ${name}` });
  }
}

// ───────────────────────────── rule c2: the words that are always followed by a genitive ─────────────────────────────

/**
 * كُلّ بَعْض جَمِيع مُعْظَم أَحَد … + the word after it. Window: the next word. CERTAIN when the head is a noun the analyser put first or one of
 * the spellings that is nothing else: the word after it is a noun in the genitive (كُلُّ يَوْمٍ), never a finite verb.
 */
function ruleConstructHeads(s: ArSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i]) continue;
    const head = s.cands[i].find((c) => !!c.lemma && !c.unconfirmed && G.AR_CONSTRUCT_HEADS.has(G.lemmaKeyOf(c)) && G.isPos(c, 'NOUN', 'ADJ', 'PRON', 'DET') && !G.hasSuffix(c) && s.pageOk(i, c) !== false);
    if (!head) continue;
    const j = s.next(i);
    if (j < 0 || G.AR_TEEN_KEYS.has(s.keys[j]) || !s.any(j, (c) => !G.isFiniteVerb(c) && !G.isPos(c, 'PART', 'SCONJ', 'CONJ'))) continue;
    const pre = (head.parts ?? []).filter((p) => p.kind === 'prefix');
    const bare = pre.every((p) => ['وَ', 'فَ'].includes(p.lemma ?? ''));
    const certain = bare && (s.cands[i][0] === head && head.confidence >= 0.5 || arLoose(s.keys[i].replace(/^[وف](?=.{3})/, '')) === arLoose(G.lemmaKeyOf(head)));
    if (!certain) continue;
    if (WINDOW_DECIDES.constructHeads) s.decide(j, (c) => !G.isFiniteVerb(c), `after ${head.lemma} stands a noun in the genitive, not a verb`);
    else s.prefer(j, (c) => !G.isFiniteVerb(c), `after ${head.lemma} a noun in the genitive is expected, not a verb`);
    if (s.effAll(j, (c) => G.isNominal(c))) s.gov.set(j, { code: 'Gen', why: `as the second term after ${head.lemma}` });
  }
}

// ───────────────────────────── rule c2b: the lām of command; the noun after a demonstrative ─────────────────────────────

const isLam = (c: Cand): boolean => !!c.parts?.some((q) => q.kind === 'prefix' && arKey(q.text) === 'ل' && /lām/.test(q.role ?? ''));
/**
 * فَلْيَكْتُبْ, وَلْتَكُنْ: a lām written onto an imperfect verb at the START of a clause, alone or after وَ / فَ, is the lām of command (the jussive: "let him write"); the lām
 * of purpose stands after another clause (ذَهَبَ لِيَكْتُبَ). Window: the one word. The readings that cut a lām and a 3rd (or 1st, 2nd) person imperfect with a jussive
 * cell are the word; the other lexemes and the noun readings go; the verb is chosen like any jussive (chooseJussive).
 */
function ruleLamOfCommand(s: ArSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i] || !s.firstInClause(i) || !s.edit[i]) continue;
    const key = s.keys[i];
    if (!/^[وف]?ل[يتنأ]/.test(key) || key.length < 5) continue;
    const lam = (c: Cand): boolean => isLam(c) && G.isImperfect(c) && G.hasVal(c, 'Mood', 'Jus') && (c.parts ?? []).filter((q) => q.kind === 'prefix').every((q) => ['وَ', 'فَ', 'لِ', 'لَ'].includes(q.lemma ?? ''));
    if (!s.any(i, lam)) continue;
    chooseJussive(s, i, 'a lām of command at the start of the clause', lam);
    s.noteMood(i, 'Jus', 'after the lām of command');
  }
}

/**
 * هٰذَا أَمْرٌ مُهِمٌّ: a demonstrative + a word + a bare adjective (not an accusative written with its alif): the word is a NOUN (the sentence "this is an important
 * matter"), never a verb. Window: three words. CERTAIN, 0.75.
 */
function ruleDemonstrativeNoun(s: ArSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i]) continue;
    const t = s.top(i);
    if (!t || !G.isDemonstrative(t) || s.keys[i] === 'ذلك' && false) continue;
    const j = s.next(i);
    const k = j >= 0 ? s.next(j) : -1;
    if (j < 0 || k < 0 || G.isDemonstrative(s.top(j) ?? ({} as Cand))) continue;
    if (!s.any(j, (c) => G.isNounLike(c)) || !s.any(j, G.isFiniteVerb)) continue;
    const bareAdj = s.effAll(k, (c) => G.isPos(c, 'ADJ') && !G.isDefinite(c)) && !s.any(k, (c) => G.isFiniteVerb(c) || G.isPos(c, 'PROPN')) && !/[\u0627\u064B]$/.test(s.surface(k));
    if (!bareAdj) continue;
    const why = `after the demonstrative «${s.surface(i)}» a noun and its adjective: "this is an …" (a nominal sentence), not a verb`;
    if (WINDOW_DECIDES.demonstrativeNoun) s.decide(j, (c) => G.isNounLike(c), why, 0.75); else s.prefer(j, (c) => G.isNounLike(c), why);
  }
}

// ───────────────────────────── rule c3: the relative pronoun ─────────────────────────────

/**
 * الَّذِي الَّتِي الَّذِينَ … + the word after it. Window: the next word. CERTAIN: a relative clause begins with a verb, a pronoun, a definite noun or a
 * preposition; an INDEFINITE noun cannot follow directly (it would have no clause to be the subject of), so a noun reading with no ال, no
 * pronoun suffix and no tanwīn-free construct state goes: الَّذِي كَتَبَ, not "who books".
 */
function ruleRelative(s: ArSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i]) continue;
    const rel = s.cands[i].find((c) => G.isRelative(c) && s.pageOk(i, c) !== false);
    if (!rel || (s.cands[i][0] !== rel && !G.AR_RELATIVES.has(s.keys[i]))) continue;
    const j = s.next(i);
    if (j < 0 || !s.any(j, G.isFiniteVerb)) continue;
    s.decide(j, (c) => !(G.isNominal(c) && !G.isPos(c, 'PROPN') && !G.isDefinite(c) && !G.hasSuffix(c)), `after the relative ${rel.lemma} a clause begins (a verb, a pronoun or a definite noun), not an indefinite noun`);
  }
}

// ───────────────────────────── rule d0: إِنْ / إِنَّ, أَنْ / أَنَّ, لٰكِنْ / لٰكِنَّ ─────────────────────────────

const shaddaIn = (c: Cand): boolean => (c.lemma ?? '').includes(SHADDA);
const isFn = (c: Cand): boolean => G.isPos(c, 'PART', 'SCONJ', 'CONJ', 'ADV') && !G.hasSuffix(c);
/** The light (إِنْ conditional, أَنْ "to", لٰكِنْ) and the heavy (إِنَّ, أَنَّ, لٰكِنَّ, "indeed / that / but" + accusative subject) reading of a lemma key. */
const light = (key: string) => (c: Cand): boolean => isFn(c) && G.lemmaKeyOf(c) === key && !shaddaIn(c);
const heavy = (key: string) => (c: Cand): boolean => isFn(c) && G.lemmaKeyOf(c) === key && shaddaIn(c);
/** Words after which أَنَّ (never أَنْ) follows. غَيْرَ أَنَّ, رَغْمَ أَنَّ, بَيْدَ أَنَّ, حَيْثُ أَنَّ, مَعَ أَنَّ, كَمَا أَنَّ, ذٰلِكَ أَنَّ; إِلَّا أَنَّ unless a subjunctive verb follows. */
const BEFORE_HEAVY_AN = new Set(['غير', 'رغم', 'الا', 'إلا', 'بيد', 'حيث', 'مع', 'كما', 'ذلك']);
/** Prepositions after which أَنْ + a verb (بَعْدَ أَنْ كَتَبَ, قَبْلَ أَنْ يَذْهَبَ). */
const BEFORE_LIGHT_AN = new Set(['بعد', 'قبل', 'منذ', 'مذ', 'الى', 'إلى', 'دون', 'اجل', 'أجل', 'حتى', 'عند', 'لدى']);

/**
 * The heavy and the light particle that are spelled alike. Window: the word before and the word after. CERTAIN in each frame:
 *  إن after a form of قَالَ, or opening a clause before a noun, pronoun or ال-word  → إِنَّ ("indeed");  إن directly before a verb (and no noun reading)  → إِنْ ("if").
 *  أن directly before an imperfect verb, or after بَعْدَ / قَبْلَ / مُنْذُ / إِلَى / دُونَ / مِنْ أَجْلِ before a verb  → أَنْ ("to, that");
 *  أن before a noun, pronoun or ال-word, or after غَيْرَ / رَغْمَ / بَيْدَ / حَيْثُ / مَعَ / كَمَا / ذٰلِكَ  → أَنَّ ("that").
 *  لكن before a noun or pronoun in a clear frame → لٰكِنَّ; before a verb → لٰكِنْ.
 * The word is a spelling the list holds as balanced; the frame is what settles it. Nothing is decided when the next word is both.
 */
function ruleAnInna(s: ArSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i]) continue;
    // the SPELLING says which hamza the page wrote (إن، أن) or none (ان): a loose reading of another word is not this rule's
    const sk = s.keys[i].replace(/^[وف](?=.{2})/, '');
    if (!['إن', 'أن', 'ان', 'لكن'].includes(sk)) continue;
    if (!s.cands[i].some((c) => isFn(c) && ['إن', 'أن', 'لكن'].includes(G.lemmaKeyOf(c)) && s.pageOk(i, c) !== false && !(c.parts ?? []).some((q) => q.kind === 'prefix' && !['وَ', 'فَ'].includes(q.lemma ?? '')))) continue;
    const base = sk;
    const p = s.prev(i), j = s.next(i);
    const pk = p >= 0 ? arLoose(s.keys[p]) : '';
    const says = (x: number): boolean => x >= 0 && s.any(x, (c) => G.lemmaKeyOf(c) === 'قال' && G.isFiniteVerb(c) && c.confidence >= 0.5);
    // قَالَ, or قَالَ + its subject noun: قَالَ الْوَزِيرُ إِنَّ …
    const saying = says(p) || (p >= 0 && says(s.prev(p)) && s.effAll(p, (c) => G.isNounLike(c)));
    const nominalOnly = j >= 0 && s.effAll(j, (c) => G.isNominal(c) || G.isPos(c, 'PRON', 'DET')) && !s.any(j, G.isFiniteVerb);
    const verbOnly = j >= 0 && s.effAll(j, (c) => G.isFiniteVerb(c));
    const impOnly = j >= 0 && s.effAll(j, (c) => G.isImperfect(c));
    const definite = j >= 0 && s.effAll(j, (c) => G.isPos(c, 'PRON', 'DET') || G.isDefinite(c) || G.isPos(c, 'PROPN'));
    if (base === 'إن' || base === 'ان') {
      const bare = base === 'ان';
      if (saying) s.decide(i, heavy('إن'), 'after a verb of saying, إِنَّ ("indeed") opens the quotation');
      else if (p < 0 && nominalOnly && definite) s.decide(i, heavy('إن'), 'a noun, pronoun or ال-word follows at the head of the clause, so this is إِنَّ ("indeed")');
      else if (verbOnly && !bare) {
        s.decide(i, light('إن'), 'a verb follows directly, so this is إِنْ ("if"), not إِنَّ');
        if (impOnly) chooseJussive(s, j, 'the condition إِنْ');
      }
    } else if (base === 'أن' || base === 'ان') {
      const bare = base === 'ان';
      const afterLight = p >= 0 && BEFORE_LIGHT_AN.has(pk) && j >= 0 && s.any(j, G.isFiniteVerb);
      if ((impOnly || afterLight) && !bare) {
        s.decide(i, light('أن'), 'a verb follows, so this is أَنْ ("to, that"), not أَنَّ');
        if (j >= 0) s.noteMood(j, 'Sub', 'after أَنْ');
      } else if (p >= 0 && BEFORE_HEAVY_AN.has(pk) && !s.any(j, G.isFiniteVerb)) s.decide(i, heavy('أن'), `after «${s.surface(p)}» comes أَنَّ ("that") with its accusative subject`);
      else if (nominalOnly && definite && !bare) s.decide(i, heavy('أن'), 'a noun, pronoun or ال-word follows, so this is أَنَّ ("that") with its accusative subject');
    } else if (base === 'لكن') {
      if (nominalOnly && definite) s.decide(i, heavy('لكن'), 'a noun or pronoun follows, so this is لٰكِنَّ ("but") with its accusative subject');
      else if (verbOnly) s.decide(i, light('لكن'), 'a verb follows, so this is لٰكِنْ ("but"), no subject case');
    }
  }
}

// ───────────────────────────── rule d: inna and her sisters ─────────────────────────────

const isInnaReading = (key: string, c: Cand): boolean => {
  if (!G.AR_INNA_LEMMAS.has(key)) return false;
  if (key === 'ليت' || key === 'لعل') return true;
  return (c.lemma ?? '').includes(SHADDA);
};

/**
 * إِنَّ أَنَّ كَأَنَّ لٰكِنَّ لَيْتَ لَعَلَّ + the next word. CERTAIN when the next word has no verb reading and is a noun or pronoun: then the
 * particle is one of the "inna" family and not أَنْ / إِنْ (+ a verb), so the verb readings of the particle go; the noun right after is its
 * subject, ACCUSATIVE (a note). When the next word is a verb-only word and the particle is أَنْ (no shadda): the subjunctive of rule a.
 */
function ruleInna(s: ArSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i]) continue;
    // كَانَ is spelled like كَأَنَّ without its hamza: only the hamza says which
    if (arLoose(s.keys[i]) === 'كان' && s.keys[i] !== 'كأن') continue;
    const t = s.trig(i, isInnaReading);
    if (!t) continue;
    if (arLoose(s.keys[i].replace(/^[وف](?=.{2})/, '')) !== arLoose(t.key)) continue;
    const j = s.next(i);
    if (j < 0) continue;
    if (s.any(j, G.isFiniteVerb)) continue;
    if (!s.effAll(j, (c) => G.isNominal(c) || G.isPos(c, 'PRON', 'DET'))) continue;
    s.decide(i, (c) => !!c.lemma && isInnaReading(G.lemmaKeyOf(c), c) && !G.isPos(c, 'NOUN', 'ADJ', 'VERB') && !G.hasSuffix(c), `a noun follows, so this is إِنَّ or one of its sisters (not أَنْ or a verb)`);
    s.gov.set(j, { code: 'Acc', why: `as the subject after ${vocalizedName(t.c, t.key)}` });
  }
}

// ───────────────────────────── rule e: kāna ─────────────────────────────

const isKana = (key: string, c: Cand): boolean => key in G.AR_KANA_LEMMAS && G.isFiniteVerb(c);

/**
 * كَانَ and its sisters (أَصْبَحَ صَارَ ظَلَّ بَاتَ لَيْسَ …) + a subject + a predicate. Window: two nominal words after the verb, the first
 * definite or a construct. The subject stays nominative and the predicate is ACCUSATIVE (notes). Nothing is decided.
 */
function ruleKana(s: ArSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i]) continue;
    const t = s.trig(i, isKana);
    if (!t) continue;
    const j = s.next(i);
    const k = j >= 0 ? s.next(j) : -1;
    if (j < 0 || k < 0) continue;
    const nominalWord = (x: number): boolean => s.effAll(x, (c) => G.isNominal(c));
    if (!nominalWord(j) || !nominalWord(k)) continue;
    if (!s.effAll(j, (c) => G.isDefinite(c) || G.hasSuffix(c))) continue;
    const name = vocalizedName(t.c, t.key);
    s.gov.set(j, { code: 'Nom', why: `as the subject of ${name}` });
    s.gov.set(k, { code: 'Acc', why: `as the predicate of ${name}` });
  }
}

// ───────────────────────────── rule f: numbers ─────────────────────────────

/**
 * A number + its counted noun. Window: the number (two words for 11–19: أَحَدَ عَشَرَ) and the next word. 3–10: a genitive PLURAL noun (the
 * number's gender is the opposite of the noun's); 11–99: an ACCUSATIVE SINGULAR noun; 100, 1000, million: a genitive singular. CERTAIN for
 * one thing: a finite singular verb cannot be the counted word (ثَلَاثَةُ كُتُبٍ: "books", not "he wrote"), so it goes; the plural or singular
 * reading is then put first and the case is a note.
 */
function ruleNumbers(s: ArSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i]) continue;
    const nw = G.AR_NUMBER_WORDS[s.keys[i]];
    if (!nw || !s.any(i, (c) => G.isPos(c, 'NUM', 'ADJ', 'NOUN'))) continue;
    const before = s.prev(i);
    if (G.isTeenSecond(s.keys[i], before >= 0 ? s.keys[before] : undefined)) continue;
    let last = i;
    let teen = false;
    if (G.AR_TEEN_UNITS.has(s.keys[i])) {
      const j = s.next(i);
      if (j >= 0 && G.AR_TEEN_KEYS.has(s.keys[j])) { last = j; teen = true; }
    }
    if (nw.kind === 'one' || nw.kind === 'two') { if (!teen) continue; }
    const k = s.next(last);
    if (k < 0 || !s.any(k, G.isNominal)) continue;
    const plural = !teen && (nw.kind === 'few' || nw.kind === 'thousands');
    const name = s.surface(i) + (teen ? ` ${s.surface(last)}` : '');
    s.decide(k, (c) => !(G.isFiniteVerb(c) && !G.hasVal(c, 'Number', 'Plur')), `after the number ${name} stands the counted noun, not a verb`);
    const wantNumber = plural ? 'Plur' : 'Sing';
    s.preferCell(k, (c) => G.isNominal(c) && (G.hasVal(c, 'Number', wantNumber) || (plural && G.hasVal(c, 'Number', 'Coll'))), `the counted noun after ${name} is ${plural ? 'plural' : 'singular'}`);
    s.gov.set(k, plural || nw.kind === 'hundred' || nw.kind === 'thousand' ? { code: 'Gen', why: `as the counted noun after ${name}` } : { code: 'Acc', why: `as the counted noun after ${name}` });
  }
}

// ───────────────────────────── rule g: the noun phrase ─────────────────────────────

/** Written tanwīn on the last letter of the page's word. */
const hasTanwin = (s: ArSentence, i: number): boolean => TANWIN.test(s.surface(i));

/** A noun (or adjective) a construct first term can be: no article, no pronoun, no tanwīn, and never a verb. */
function isFirstTermCandidate(s: ArSentence, j: number): boolean {
  if (hasTanwin(s, j)) return false;
  return s.effAll(j, (c) => G.isNominal(c) && !G.isPos(c, 'PROPN', 'NUM') && !G.isDefinite(c) && !G.hasSuffix(c) && (!c.morph.Definite || G.hasVal(c, 'Definite', 'Cons')));
}
/** A second term: a definite noun or adjective (ال, or a noun with its own possessive pronoun). */
function isSecondTerm(s: ArSentence, k: number): boolean {
  return s.effAll(k, (c) => G.isNominal(c) && !G.isPos(c, 'NUM') && (G.hasArticle(c) || (G.hasSuffix(c) && c.morph.Definite === 'Cons')) && !G.hasPreposition(c));
}

/**
 * The construct (iḍāfa): a noun without ال or tanwīn directly before a definite noun, كِتَابُ الطَّالِبِ. Window: two words, right to left so
 * that a chain (كِتَابُ مُدِيرِ الْجَامِعَةِ) is found whole. LIKELY, not decided: the first term takes Definite = Cons (the one morph value
 * this layer narrows, since it is a fact of the phrase, not of the vowels), the second term is genitive (a note when no ending is printed).
 * Not when the first word has a verb reading left (فَتَحَ الْبَابَ: a verb and its object), is a name, is a number or has tanwīn.
 */
function ruleConstruct(s: ArSentence): void {
  for (let j = s.n - 1; j >= 0; j--) {
    if (!s.word[j]) continue;
    const k = s.next(j);
    if (k < 0 || !s.edit[j]) continue;
    if (!isFirstTermCandidate(s, j)) continue;
    const second = isSecondTerm(s, k) || s.consHead.has(k);
    if (!second) continue;
    // a preposition before the first term has already made it a noun; nothing else to check
    s.consHead.add(j);
    for (const c of s.cands[j]) {
      if (!G.isNominal(c)) continue;
      if (c.morph.Definite && c.morph.Definite !== 'Cons' && c.morph.Definite.includes('Cons')) c.morph.Definite = 'Cons';
      ctx(c, `First term of a construct: it has no ال or tanwīn and the definite noun «${s.surface(k)}» follows (the second term is genitive).`);
    }
    s.dirty[j] = true;
    if (!s.gov.has(k)) s.gov.set(k, { code: 'Gen', why: `as the second term of a construct after «${s.surface(j)}»` });
  }
}

/** The demonstrative before a definite noun: هٰذَا الْكِتَابُ "this book"; before an indefinite word it is a pronoun: هٰذَا كِتَابٌ "this is a book". */
function ruleDemonstrative(s: ArSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i] || !s.edit[i]) continue;
    const d = s.cands[i].find((c) => G.isDemonstrative(c));
    if (!d || !s.cands[i][0] || !G.isDemonstrative(s.cands[i][0])) continue;
    const j = s.next(i);
    if (j < 0 || !s.any(j, G.isNominal)) continue;
    const definite = s.effAll(j, (c) => G.isNominal(c) && G.isDefinite(c));
    const fem = (c: Cand): boolean => G.hasVal(c, 'Gender', 'Fem');
    const gender = G.demonstrativeGender(s.keys[i]) ?? d.morph.Gender;
    const nounGenders = s.eff(j).map((c) => c.morph.Gender).filter(Boolean);
    const agreed = !gender || !nounGenders.length || s.eff(j).some((c) => !c.morph.Gender || (gender === 'Fem' ? fem(c) : !fem(c) || G.hasVal(c, 'Number', 'Plur')));
    if (!agreed) continue;
    if (definite) {
      ctx(d, `Demonstrative before the definite noun «${s.surface(j)}»: "this/that + noun" (the noun keeps ال).`);
    } else {
      ctx(d, `Demonstrative before the indefinite word «${s.surface(j)}»: "this is …" (a sentence), not "this …".`);
    }
    s.dirty[i] = true;
  }
}

/** Agreement of an adjective reading with the noun reading before it: definiteness, then gender and number (a non-human plural takes a feminine singular adjective). */
export function arAdjectiveAgrees(noun: Cand, adj: Cand): boolean {
  if (!G.isNominal(noun) || !G.isPos(adj, 'ADJ')) return false;
  if (G.isDefinite(noun) !== G.isDefinite(adj)) return false;
  const nn = G.valsOf(noun, 'Number'), an = G.valsOf(adj, 'Number');
  const ng = G.valsOf(noun, 'Gender'), ag = G.valsOf(adj, 'Gender');
  const plural = nn.includes('Plur') && !nn.includes('Sing');
  if (plural) {
    if (an.length && !(an.includes('Plur') || (an.includes('Sing') && (!ag.length || ag.includes('Fem'))))) return false;
    return true;
  }
  if (nn.length && an.length && !intersect(nn, an).length) return false;
  if (ng.length && ag.length && !intersect(ng, ag).length) return false;
  return true;
}

/**
 * A noun + an adjective: كِتَابٌ جَدِيدٌ, الطَّالِبُ الْمُجْتَهِدُ. Window: two words. LIKELY (a note and, in an undecided word, an order): the adjective
 * agrees in definiteness (both with ال or both without), gender and number. A word after a construct's second term is not attached (it
 * may describe either). The case a governor gave the noun passes to the adjectives that agree (applied at the end).
 */
function ruleNounAdjective(s: ArSentence): void {
  for (let j = 0; j < s.n; j++) {
    if (!s.word[j]) continue;
    const k = s.next(j);
    if (k < 0 || s.consHead.has(j)) continue;
    const nouns = s.eff(j).filter((c) => G.isNounLike(c) && !G.isPos(c, 'PROPN'));
    if (!nouns.length || !s.effAll(j, G.isNominal)) continue;
    if (s.prev(j) >= 0 && s.consHead.has(s.prev(j))) continue;
    const agree = (c: Cand): boolean => nouns.some((n) => arAdjectiveAgrees(n, c));
    if (!s.any(k, (c) => G.isPos(c, 'ADJ') && agree(c))) continue;
    // an adjective that is also a definite noun after a definite noun might be the object of a verb before: only reorder
    const both = s.effAll(j, (c) => G.isDefinite(c)) && s.any(k, (c) => G.isPos(c, 'ADJ') && G.isDefinite(c) && agree(c));
    (both ? s.prefer.bind(s) : s.preferCell.bind(s))(k, (c: Cand) => G.isPos(c, 'ADJ') && agree(c), `it agrees with «${s.surface(j)}» in definiteness, gender and number: an adjective describing it`);
    s.adjOf.set(k, j);
  }
}

// ───────────────────────────── rule h: the verb and its subject ─────────────────────────────

const personOf = (c: Cand): string[] => G.valsOf(c, 'Person');

/**
 * An independent pronoun right before a verb is its subject: أَنْتَ تَكْتُبُ, هُمْ يَكْتُبُونَ. Window: pronoun + next word. LIKELY: the verb's
 * person, number and gender must agree, so a reading that agrees comes first and a union (Person=2,3) is narrowed. After a vocative
 * (يَا …) a verb that may be 2nd or 3rd person is 2nd.
 */
function rulePronounSubject(s: ArSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i]) continue;
    const p = s.top(i);
    if (!p || !G.isIndependentPronoun(p)) continue;
    const j = s.next(i);
    if (j < 0 || !s.any(j, G.isFiniteVerb)) continue;
    const pf = G.personalFeatures(p);
    const P = pf.Person ? pf.Person.split(',') : [], N = pf.Number ? pf.Number.split(',') : [], Gd = pf.Gender ? pf.Gender.split(',') : [];
    const agrees = (c: Cand): boolean => G.isFiniteVerb(c)
      && (!P.length || !personOf(c).length || intersect(P, personOf(c)).length > 0)
      && (!N.length || !G.valsOf(c, 'Number').length || intersect(N, G.valsOf(c, 'Number')).length > 0)
      && (!Gd.length || !G.valsOf(c, 'Gender').length || intersect(Gd, G.valsOf(c, 'Gender')).length > 0);
    const why = `the pronoun «${s.surface(i)}» before the verb is its subject: person, number and gender agree`;
    s.preferCell(j, agrees, why);
    s.narrow(j, G.isFiniteVerb, 'Person', P, why);
    s.narrow(j, G.isFiniteVerb, 'Number', N, why);
    if (Gd.length) s.narrow(j, G.isFiniteVerb, 'Gender', Gd, why);
  }
}

/** The word is a noun that can be a subject: a definite noun or construct, a singular or plural, not a pronoun or an adjective only. */
const subjectNoun = (s: ArSentence, i: number): Cand | undefined => {
  if (!s.effAll(i, (c) => G.isNounLike(c) && !G.isPos(c, 'NUM'))) return undefined;
  return s.eff(i).find((c) => G.isNounLike(c));
};

/**
 * A subject noun BEFORE its verb at the start of a clause: الطَّالِبَةُ تَكْتُبُ. Window: the first word of the clause + the next. LIKELY: the verb agrees
 * with it completely (3rd person; gender and number of the noun, a non-human plural takes the feminine singular), so the reading that agrees comes
 * first, تَكْتُبُ (you / she) is narrowed to 3rd person, and a verb reading wins over a noun homograph (الطَّالِبُ كَتَبَ, not "books").
 */
function ruleSubjectBeforeVerb(s: ArSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i] || !s.firstInClause(i)) continue;
    const noun = subjectNoun(s, i);
    if (!noun || !(G.isDefinite(noun) || G.hasSuffix(noun))) continue;
    const j = s.next(i);
    if (j < 0 || !s.any(j, (c) => G.isFiniteVerb(c) && personOf(c).includes('3'))) continue;
    const nn = G.valsOf(noun, 'Number'), ng = noun.morph.Gender;
    const plural = nn.includes('Plur') && !nn.includes('Sing');
    const agrees = (c: Cand): boolean => G.isFiniteVerb(c) && personOf(c).includes('3')
      && (plural ? G.hasVal(c, 'Number', 'Plur') || (G.hasVal(c, 'Number', 'Sing') && !G.valsOf(c, 'Gender').includes('Masc')) || !G.valsOf(c, 'Number').length
        : (!nn.length || !G.valsOf(c, 'Number').length || nn.some((x) => G.hasVal(c, 'Number', x)))
          && (!ng || ng.includes(',') || !G.valsOf(c, 'Gender').length || G.hasVal(c, 'Gender', ng)));
    const why = `the verb after the subject «${s.surface(i)}» agrees with it (3rd person${!plural && ng && !ng.includes(',') ? `, ${ng === 'Fem' ? 'feminine' : 'masculine'}` : ''})`;
    const k = s.next(j);
    const object = k >= 0 && s.effAll(k, (c) => G.isNominal(c) && (G.isDefinite(c) || G.hasSuffix(c))) && !s.any(k, (c) => G.isFiniteVerb(c));
    // verb, then an object: the word after the subject is a verb (S V O); otherwise only the cell is chosen
    if (object) s.prefer(j, agrees, why); else s.preferCell(j, agrees, why);
    s.narrow(j, G.isFiniteVerb, 'Person', ['3'], why);
    if (!plural && ng && !ng.includes(',')) s.narrow(j, G.isFiniteVerb, 'Gender', [ng], why);
  }
}

/**
 * The verb readings that satisfy `keep` are the word; the noun readings go. When several verb LEXEMES remain (أَمَرَ / أَمَّرَ), the reviewed preferences
 * (generated/preferences.ts) settle them if exactly one is not beaten; otherwise the verbs stay open between themselves.
 */
function decideVerb(s: ArSentence, i: number, keep: (c: Cand) => boolean, why: string, level: number): void {
  s.decide(i, keep, why, level);
}

/** Words after which a clause (so a verb) can begin: a conjunction or particle written as a word of its own. */
const CLAUSE_OPENERS = new Set(['ثم', 'قد', 'لقد', 'اذا', 'إذا', 'لما', 'حين', 'عندما', 'حيث', 'لكن', 'بينما', 'فقد', 'وقد']);
const PREP_LOOSE: ReadonlySet<string> = new Set([...G.AR_PREPOSITIONS.keys()].map((k) => arLoose(k)));
const ADVERBS_AFTER = new Set(['اليوم', 'غدا', 'أمس', 'امس', 'الان', 'الآن', 'أيضا', 'ايضا', 'هناك', 'هنا', 'جدا', 'دائما']);
/** A clause can begin at word `i`: the start of the clause, a clause opener before it, or أَنْ after بَعْدَ / قَبْلَ / مُنْذُ. */
function clauseStartsAt(s: ArSentence, i: number): boolean {
  const p = s.prev(i);
  if (p < 0) return true;
  const pk = s.keys[p];
  if (CLAUSE_OPENERS.has(pk) || CLAUSE_OPENERS.has(arLoose(pk))) return true;
  const pp = s.prev(p);
  return pp >= 0 && ['ان', 'أن'].includes(arLoose(pk)) === true && ['بعد', 'قبل', 'منذ', 'مذ'].includes(s.keys[pp]);
}
/** What a construct phrase cannot continue with: a preposition, أَنْ / إِنْ / بِأَنْ, a definite noun with ال (an object), an adverb. */
function afterSubjectOk(s: ArSentence, k: number): boolean {
  if (k < 0) return false;
  const key = s.keys[k];
  if (PREP_LOOSE.has(arLoose(key)) && s.any(k, (c) => G.isPos(c, 'ADP'))) return true;
  if (['ان', 'أن', 'إن', 'بان', 'بأن', 'لان', 'لأن', 'ان'].includes(key) || ['ان'].includes(arLoose(key))) return true;
  if (ADVERBS_AFTER.has(key)) return true;
  return s.effAll(k, (c) => G.isPos(c, 'NOUN') && (G.isDefinite(c) || possessed(c)));
}

/**
 * verb + subject + something a construct phrase cannot continue with: كَتَبَ الطَّالِبُ الدَّرْسَ, ذَهَبَ الرَّجُلُ إِلَى …, أَمَرَ الرَّئِيسُ بِـ …
 * Window: a word at the start of a clause (or after قَدْ, ثُمَّ, إِذَا, لَمَّا, حِينَ, عِنْدَمَا, or أَنْ after بَعْدَ), a definite noun or a name, and then a
 * preposition, أَنْ / إِنْ, an ال-noun, or an adverb. CERTAIN for the first word: it is a verb (0.80 when the third word is another ال-noun, 0.75 for
 * the others), so its noun readings go. Also a verb right after a definite subject noun at the start of the clause (اَلرَّجُلُ ذَهَبَ إِلَى …).
 * NOT decided: the same words without a third (أَمْرُ الرَّئِيسِ can be "the president's order") or with a bare indefinite noun or an adjective.
 * The verb is singular and 3rd person whatever the number of the subject; the subject's gender is the verb's.
 */
function ruleVerbSubjectObject(s: ArSentence): void {
  const verb3 = (c: Cand): boolean => G.isFiniteVerb(c) && personOf(c).includes('3');
  const word = (c: Cand): boolean => G.isPos(c, 'NOUN', 'ADJ') && G.isDefinite(c);
  const subjectLike = (x: number): boolean => x >= 0 && !s.any(x, G.isFiniteVerb) && (s.effAll(x, word) || s.effAll(x, (c) => G.isPos(c, 'PROPN')));
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i] || !s.any(i, verb3)) continue;
    const j = s.next(i);
    const k = j >= 0 ? s.next(j) : -1;
    // S V + a preposition: the subject noun came first
    const p = s.prev(i);
    if (p >= 0 && s.firstInClause(p) && s.effAll(p, word) && !s.any(p, G.isFiniteVerb) && j >= 0 && PREP_LOOSE.has(arLoose(s.keys[j])) && s.any(j, (c) => G.isPos(c, 'ADP'))) {
      if (WINDOW_DECIDES.subjectVerbPrep) decideVerb(s, i, verb3, `a definite subject «${s.surface(p)}» before it and a preposition after it: this is its verb`, 0.75);
      else s.prefer(i, verb3, `a definite subject «${s.surface(p)}» before it and a preposition after it: this is likely its verb`);
      s.narrow(i, G.isFiniteVerb, 'Person', ['3'], 'the verb after its subject is 3rd person');
      continue;
    }
    if (!clauseStartsAt(s, i) || !subjectLike(j) || !afterSubjectOk(s, k)) continue;
    // verb + subject + preposition + noun + a bare predicate (طَلَبُ الطَّالِبِ فِي الِامْتِحَانِ صَعْبٌ): a noun phrase with its predicate, not a verb; a bare noun in the
    // accusative (written with its alif: كِتَابًا) would be an object and leaves the verb
    if (PREP_LOOSE.has(arLoose(s.keys[k]))) {
      const m = s.next(k), n = m >= 0 ? s.next(m) : -1;
      if (n >= 0 && s.any(n, (c) => G.isNominal(c) && !G.isDefinite(c)) && !s.any(n, (c) => G.isPos(c, 'ADP', 'ADV', 'PART', 'CONJ', 'SCONJ')) && !/[\u0627\u064B]$/.test(s.surface(n).replace(/[\u064B-\u0652]+$/, (x) => (x.includes('\u064B') ? '\u064B' : ''))) ) continue;
    }
    const objectNoun = s.effAll(k, (c) => G.isPos(c, 'NOUN') && (G.isDefinite(c) || possessed(c))) && s.effAll(j, (c) => G.isPos(c, 'NOUN') && G.isDefinite(c)) && !PREP_LOOSE.has(arLoose(s.keys[k]));
    const whyA = `a verb, then the subject «${s.surface(j)}» and «${s.surface(k)}», which a construct phrase cannot continue with: the first word is the verb`;
    if (objectNoun ? WINDOW_DECIDES.verbSubjectObject : WINDOW_DECIDES.verbSubjectOther) decideVerb(s, i, verb3, whyA, objectNoun ? DECIDED : 0.75);
    else s.prefer(i, verb3, whyA.replace('is the verb', 'is likely the verb'));
    const subj = s.eff(j)[0];
    const ng = subj?.morph.Gender;
    const why = `the verb before its subject «${s.surface(j)}» is singular`;
    s.narrow(i, G.isFiniteVerb, 'Person', ['3'], why);
    s.preferCell(i, (c) => verb3(c) && (!G.valsOf(c, 'Number').length || G.hasVal(c, 'Number', 'Sing')) && (!ng || ng.includes(',') || !G.valsOf(c, 'Gender').length || G.hasVal(c, 'Gender', ng)), why);
    s.gov.set(j, { code: 'Nom', why: `as the subject of «${s.surface(i)}»` });
    if (objectNoun) s.gov.set(k, { code: 'Acc', why: `as the object of «${s.surface(i)}»` });
  }
}

/**
 * The first term of a construct that the page itself shows (a ḍamma and no tanwīn printed, Definite=Cons): the word after it is its genitive, a
 * noun, never a verb. Window: the next word. CERTAIN, 0.75. A noun with a pronoun suffix is not a first term (كِتَابُهُ وَضَعَ …).
 */
function ruleAfterConstructFirst(s: ArSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i] || tashkilLevel(s.surface(i)) === 'none' || TANWIN.test(s.surface(i))) continue;
    const t = s.top(i);
    if (!t || t.confidence < 0.5 || !G.isNounLike(t) || t.morph.Definite !== 'Cons' || G.hasSuffix(t) || G.hasArticle(t) || s.pageOk(i, t) !== true) continue;
    const j = s.next(i);
    if (j < 0 || !s.any(j, (c) => G.isNounLike(c)) || !s.any(j, G.isFiniteVerb)) continue;
    const whyC = `after the first term of a construct («${s.surface(i)}») stands a noun in the genitive, not a verb`;
    if (WINDOW_DECIDES.afterConstructFirst) s.decide(j, (c) => !G.isFiniteVerb(c) && !G.isPos(c, 'PART', 'SCONJ', 'CONJ'), whyC, 0.75); else s.prefer(j, (c) => !G.isFiniteVerb(c) && !G.isPos(c, 'PART', 'SCONJ', 'CONJ'), whyC);
    s.gov.set(j, { code: 'Gen', why: `as the second term of a construct after «${s.surface(i)}»` });
  }
}

/**
 * وُلِدَ: "was born", the passive of وَلَدَ, spelled like وَلَد "a boy". Window: the word and the one after it. CERTAIN (0.75) as the verb at the start of
 * a clause, or after وَقَدْ / حَيْثُ / a name, when a name, an ال-noun, فِي, عَامَ or سَنَةَ follows: "born in …". As the noun (not decided here) after a
 * number or before a bare adjective: that is the number rule and the adjective rule's; a bare adjective after it takes the NOUN (ولد صغير).
 */
function ruleWulida(s: ArSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i] || s.keys[i] !== 'ولد') continue;
    const j = s.next(i);
    if (j < 0) continue;
    // وَلَدَ (not وَلَّدَ "generated"): the passive وُلِدَ is the verb of birth
    const verbs = (c: Cand): boolean => !!c.lemma && G.lemmaKeyOf(c) === 'ولد' && G.isPos(c, 'VERB') && !c.lemma.includes(SHADDA);
    if (!s.any(i, verbs)) continue;
    // the noun: a bare adjective follows (a small boy)
    if (s.effAll(j, (c) => G.isPos(c, 'ADJ') && !G.isDefinite(c)) && !s.any(j, (c) => G.isFiniteVerb(c) || G.isPos(c, 'PROPN')) && !TANWIN.test(s.surface(j))) {
      const whyB = 'a bare adjective follows: this is the noun "boy" with its adjective';
      if (WINDOW_DECIDES.boyWithAdjective) s.decide(i, (c) => !G.isFiniteVerb(c), whyB, 0.75); else s.prefer(i, (c) => !G.isFiniteVerb(c), whyB);
      continue;
    }
    const p = s.prev(i);
    const pk = p >= 0 ? s.keys[p] : '';
    const startsOk = p < 0 || pk === 'حيث' || pk === 'وقد' || pk === 'قد' || s.effAll(p, (c) => G.isPos(c, 'PROPN'));
    const k = s.next(j);
    const nextOk = ['في', 'عام', 'سنة'].includes(s.keys[j]) || (s.any(j, (c) => G.isPos(c, 'PROPN')) && !s.any(j, G.isFiniteVerb)) || (s.effAll(j, (c) => G.isPos(c, 'NOUN', 'ADJ') && G.isDefinite(c)) && afterSubjectOk(s, k));
    if (!startsOk || !nextOk) continue;
    if (WINDOW_DECIDES.passiveWulida) { if (s.decide(i, verbs, 'born: a passive perfect', 0.75)) s.preferCell(i, (c) => G.hasVal(c, 'Voice', 'Pass'), 'born: a passive perfect'); }
    else { s.prefer(i, verbs, 'born: a passive perfect'); s.preferCell(i, (c) => G.hasVal(c, 'Voice', 'Pass'), 'born: a passive perfect'); }
  }
}

/** After a vocative (يَا + a noun) a verb that may be 2nd or 3rd person (تَكْتُبُ) is 2nd person. Window: the clause. */
function ruleVocative(s: ArSentence): void {
  for (let i = 0; i < s.n; i++) {
    if (!s.word[i]) continue;
    const t = s.trig(i, (k) => k === 'يا');
    if (!t) continue;
    for (let j = s.next(i); j >= 0; j = s.next(j)) {
      if (s.any(j, (c) => G.isImperfect(c) && personOf(c).includes('2') && personOf(c).includes('3'))) {
        s.narrow(j, G.isFiniteVerb, 'Person', ['2'], `after the vocative «يَا …» the verb addresses «you»`);
        s.preferCell(j, (c) => G.isFiniteVerb(c) && personOf(c).includes('2'), 'after the vocative the verb addresses «you»');
        break;
      }
    }
  }
}

// ───────────────────────────── the cases a governor gave ─────────────────────────────

/** Writes the cases the rules registered, and passes each to the adjectives that agree with the noun (and past a demonstrative to its noun). */
function applyCases(s: ArSentence): void {
  const done = new Set<number>();
  for (const [i, g] of s.gov) {
    let head = i;
    const t = s.top(i);
    if (t && G.isDemonstrative(t) && s.next(i) >= 0) head = s.next(i);
    if (done.has(head)) continue;
    done.add(head);
    s.noteCase(head, g.code, g.why);
    // the adjectives that follow and agree take the same case
    let cur = head;
    for (let k = s.next(cur); k >= 0 && s.adjOf.get(k) === cur; k = s.next(k)) {
      done.add(k);
      s.noteCase(k, g.code, `as the adjective of «${s.surface(head)}»`);
      cur = k;
    }
  }
}

// ───────────────────────────── the sentence as a whole ─────────────────────────────

/** Writes the dialect flag on every reading of a sentence: capped, marked, nothing credited. */
function flagDialect(s: ArSentence, idx: number[], variety: string, markers: string[]): void {
  for (const i of idx) {
    if (!s.flag[i]) continue;
    // a word the lexicon has no reading for still shows what the sentence is: one uncredited reading without a lemma
    if (!s.cands[i].length && s.raise[i]) {
      s.cands[i].push({ morph: {}, confidence: 0.2, unconfirmed: true, origin: 'rule', sourceId: AR_SOURCE_IDS.rules, notes: { source: 'rule', role: 'dialect sentence' } });
    }
    for (const c of s.cands[i]) {
      if (c.confidence > UNDECIDED) c.confidence = UNDECIDED;
      c.notes = { ...c.notes, variety: 'dialect?', dialect: variety, dialectMarkers: markers.join(' '), context: 'dialect sentence: not read as Standard Arabic' };
    }
    s.dirty[i] = true;
  }
}

/** Writes the foreign-script flag: every reading unconfirmed and at 0.35 or less, so nothing is credited. */
function flagForeign(s: ArSentence, idx: number[], reason: string): void {
  for (const i of idx) {
    if (!s.flag[i]) continue;
    for (const c of s.cands[i]) {
      c.unconfirmed = true;
      if (c.confidence > 0.35) c.confidence = 0.35;
      c.notes = { ...c.notes, context: `not Arabic (${reason})`, notArabic: reason };
    }
    s.dirty[i] = true;
  }
}

/** The invariant of the credit contract: no more than one lexeme at 0.5 or more in a word. */
function enforce(s: ArSentence): void {
  for (let i = 0; i < s.n; i++) {
    const cs = s.cands[i];
    if (!cs.length) continue;
    const credited = cs.filter(G.isCredited);
    if (credited.length < 2) continue;
    const lexes = [...new Set(credited.map(G.lexemeOf))];
    if (lexes.length < 2) continue;
    const best = credited.slice().sort((a, b) => b.confidence - a.confidence)[0];
    const keep = G.lexemeOf(best);
    for (const c of credited) if (G.lexemeOf(c) !== keep) { c.confidence = Math.min(c.confidence, UNDECIDED); ctx(c, 'Another reading is preferred here.'); }
    s.dirty[i] = true;
  }
}

/** The sentence indexes of a token list: a break after . ! ? ؟ … or a line break. */
function sentenceGroups(tokens: readonly RawToken[]): number[][] {
  const groups: number[][] = [];
  let cur: number[] = [];
  tokens.forEach((t, i) => {
    cur.push(i);
    if (!t.isWord && /[.!?\u061F\u2026\u06D4\n\r]/.test(t.surface)) { groups.push(cur); cur = []; }
  });
  if (cur.length) groups.push(cur);
  return groups;
}

const dialectOptions = {
  isStandardKey: (key: string): boolean => lookupArabicForm(key).some((h) => !h.viaLoose),
  isImperfectKey: (key: string): boolean => lookupArabicForm(key).some((h) => h.lemma[2] === 'VERB' && arFeaturesOfCode(h.code, h.lemma[2], h.lemma[3]).morph.Aspect === 'Imp'),
};

/** The sentence layer over readings already made: the lists in `base` are copied and ordered; the input is never changed. */
export function orderArSentence(tokens: readonly RawToken[], base: readonly Cand[][], opts: { varietyId?: string; edit?: boolean[]; raise?: boolean[]; flag?: boolean[] } = {}): Cand[][] {
  const cands = base.map((cs) => cs.map(cloneCand));
  const edit = tokens.map((_, i) => opts.edit?.[i] ?? true);
  const raise = tokens.map((_, i) => opts.raise?.[i] ?? true);
  const s = new ArSentence(tokens, cands, edit, raise, tokens.map((_, i) => opts.flag?.[i] ?? edit[i]));
  for (const group of sentenceGroups(tokens)) {
    const wordsIn = group.filter((i) => tokens[i].isWord);
    if (!wordsIn.some((i) => cands[i].length > 0)) continue;
    const sub = group.map((i) => tokens[i]);
    const foreign = arForeignScript(sub);
    if (foreign) { flagForeign(s, wordsIn, foreign); wordsIn.forEach((i) => { s.edit[i] = false; }); continue; }
    if (opts.varietyId !== 'ar-cla') {
      const dia = arDialectSignals(sub, dialectOptions);
      if (dia) {
        flagDialect(s, wordsIn, dia.variety, dia.markers);
        wordsIn.forEach((i) => { s.edit[i] = false; });
      }
    }
  }
  CURRENT_RULE = 'ruleAnInna'; ruleAnInna(s);
  CURRENT_RULE = 'ruleMoodParticles'; ruleMoodParticles(s);
  CURRENT_RULE = 'ruleLa'; ruleLa(s);
  CURRENT_RULE = 'ruleVerbParticles'; ruleVerbParticles(s);
  CURRENT_RULE = 'rulePrepositions'; rulePrepositions(s);
  CURRENT_RULE = 'ruleConstructHeads'; ruleConstructHeads(s);
  CURRENT_RULE = 'ruleLamOfCommand'; ruleLamOfCommand(s);
  CURRENT_RULE = 'ruleDemonstrativeNoun'; ruleDemonstrativeNoun(s);
  CURRENT_RULE = 'ruleRelative'; ruleRelative(s);
  CURRENT_RULE = 'ruleInna'; ruleInna(s);
  CURRENT_RULE = 'ruleKana'; ruleKana(s);
  CURRENT_RULE = 'ruleNumbers'; ruleNumbers(s);
  CURRENT_RULE = 'ruleVerbSubjectObject'; ruleVerbSubjectObject(s);
  CURRENT_RULE = 'ruleAfterConstructFirst'; ruleAfterConstructFirst(s);
  CURRENT_RULE = 'ruleWulida'; ruleWulida(s);
  CURRENT_RULE = 'ruleDemonstrative'; ruleDemonstrative(s);
  CURRENT_RULE = 'ruleNounAdjective'; ruleNounAdjective(s);
  CURRENT_RULE = 'ruleConstruct'; ruleConstruct(s);
  CURRENT_RULE = 'rulePronounSubject'; rulePronounSubject(s);
  CURRENT_RULE = 'ruleSubjectBeforeVerb'; ruleSubjectBeforeVerb(s);
  CURRENT_RULE = 'ruleVocative'; ruleVocative(s);
  applyCases(s);
  enforce(s);
  return s.cands;
}

/** The analyser: the context-free readings of every word token (analyze.ts), ordered by the sentence. */
export function arAnalyze(tokens: RawToken[], opts?: { varietyId?: string }): AnalyzedToken[] {
  const base = tokens.map((t) => (t.isWord ? arWordCandidates(t) : []));
  const ordered = orderArSentence(tokens, base, { varietyId: opts?.varietyId });
  return tokens.map((t, i) => ({ token: t, candidates: t.isWord ? ordered[i] : [], analyzer: AR_ANALYZER }));
}

/**
 * The adapter's `refine` (core/adapters.ts): the same ordering after the importer put a dictionary's readings on some tokens. For a token
 * of this analyser the readings are made again from the word (nothing depends on an earlier ordering); a list handed in by the dictionary is
 * taken as it is and may only be reordered or lowered, never raised; a token of another analyser, or one in `given`, is not touched.
 */
export function arRefine(tokens: RawToken[], analyzed: AnalyzedToken[], analyzers: ReadonlySet<string>, given?: ReadonlySet<number>): AnalyzedToken[] {
  const own = (i: number): boolean => analyzed[i].analyzer === AR_ANALYZER && analyzers.has(AR_ANALYZER) && !given?.has(i);
  const editable = (i: number): boolean => tokens[i].isWord && !given?.has(i) && analyzers.has(analyzed[i].analyzer);
  const base = tokens.map((t, i) => (!t.isWord ? [] : own(i) ? arWordCandidates(t) : analyzed[i].candidates));
  // a list handed in (`given`) of this analyser is not made again and no rule moves it, but the sentence flags may lower and annotate it
  const flaggable = (i: number): boolean => tokens[i].isWord && analyzers.has(analyzed[i].analyzer);
  const ordered = orderArSentence(tokens, base, { edit: tokens.map((_, i) => editable(i)), raise: tokens.map((_, i) => own(i)), flag: tokens.map((_, i) => flaggable(i)) });
  const flagged = (i: number): boolean => ordered[i].some((c) => c.notes?.variety === 'dialect?' || typeof c.notes?.notArabic === 'string');
  return tokens.map((_, i) => (editable(i) ? { ...analyzed[i], candidates: ordered[i] } : flaggable(i) && flagged(i) ? { ...analyzed[i], candidates: ordered[i] } : analyzed[i]));
}
