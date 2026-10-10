/**
 * Albanian contextual syntax (Linguistic Engine V2, Stage 4): shallow dependencies between the words of one sentence, from the
 * adapter's own readings. Rule-based, deterministic, a few microseconds per word; docs/ecosystem/linguistics/SYNTAX-sq.md has the
 * rules, their bases, what is not modelled and the measured numbers.
 *
 * How it works, in the order the rules run:
 *   1. every word is classified from its reading (syntax-core.ts), keeping the Case / Number / Gender / Person it may have;
 *   2. noun phrases (syntax-np.ts): determiners, numbers, the linking article + adjective or possessive that agrees with its
 *      noun, a genitive with its article, prepositions, "and" between phrases;
 *   3. the sentence is cut into clauses at punctuation, at subordinating words (se, që, sepse, kur …) and at "and" between two
 *      verbs; in each clause the verbs are grouped (kam / jam + participle = auxiliary + verb; modal + të + verb = a chain;
 *      jam + a predicate = copula);
 *   4. inside a clause: the subject is the nominative that agrees with the verb in person and number; the object is the
 *      accusative; the dative is the indirect object; a short pronoun is the object itself or only repeats a noun (clitic
 *      doubling); prepositional phrases and adverbs go to the verb or the predicate; negation, "po", "do", "të", "a" are attached;
 *   5. the clauses are linked: subordinate to the clause they belong to (by their marker), coordinate to the first, a lone
 *      noun between commas is a vocative or an apposition.
 * Where the forms or the order cannot decide (a noun that is nominative and accusative at once, two nouns an article agrees
 * with, a short pronoun më / të / na / ju that is accusative or dative) the other possibility stays in `alternatives`.
 * A word without a reading, or one the rules cannot place, gets no relation and the sentence says so in `notes`.
 * Machine-drafted rules; no native speaker has checked them.
 */
import type { RawToken, AnalyzedToken } from '../../core';
import type { ClauseSpan, DependencyRelation, SyntaxAlternative, SyntaxAnalysis } from '../../core/syntax';
import { buildNPs } from './syntax-np';
import {
  PUNCT_BOUNDARY, reread, vals, agrees, caseText, classify, isPunct, isSubMarkerWord, isWhMarkerWord, makeState, personText,
  type State, type W,
} from './syntax-core';

export const SQ_SYNTAX_ANALYZER = 'sq-syntax-rules@1';

/** Pairs [subject, predicate] of a copular clause whose two sides are both nouns: the order is the only thing that says which is which. */
const SWAPS = new WeakMap<State, Array<[number, number]>>();

interface Group {
  head: number;
  /** The finite verb that carries person and number (the auxiliary of kam + participle, the copula). */
  fin?: number;
  first: number;
  aux?: number;
  cop?: number;
  pc?: number;
  marks: number[];
  parent?: Group;
  prel?: DependencyRelation;
  purpose?: boolean;
  /** Introduced by duke / pa / me: a non-finite adverbial clause. */
  nonfin?: boolean;
}

interface Seg {
  words: number[];
  marker?: number;
  mk?: 'sub' | 'coord';
  fixed: number[];
  groups: Group[];
  head?: number;
  /** Words that get their relation from the link stage (the head, a copula's predicate), not from the clause rules. */
  claimed: Set<number>;
}

const CONTROL = new Set(['dua', 'mund', 'duhet', 'filloj', 'vazhdoj', 'provoj', 'arrij', 'mësoj', 'di', 'dëshiroj', 'mundem', 'përpiqem', 'kam', 'lejoj', 'ndalem', 'pëlqej']);
const SAY = new Set(['them', 'pyes', 'shkruaj', 'përgjigjem', 'thërras', 'bërtas', 'tregoj']);
const SUBJ_POST = new Set(['bie', 'vij', 'dal', 'hyj', 'ndodh', 'mungon', 'mjafton', 'duhet', 'mbetem', 'arrij', 'lind', 'vdes']);
const SKIP_BEFORE_VERB = new Set(['clitic', 'neg', 'uvoice', 'adv', 'qpart']);
const WH_SUB_ADV = new Set(['pse', 'sa', 'si', 'ku', 'kur']);
const nomOnly = (w: W): boolean => w.nomStrong;
/** A first / second person pronoun whose person agrees with the verb: its accusative forms differ (mua, ty) or fail the agreement, so the form can only be the subject. */
const strongSubject = (w: W): boolean => nomOnly(w) || (w.k === 'pron' && w.persons.length > 0 && w.persons.every((p) => p === '1' || p === '2'));
const nomOk = (w: W): boolean => w.cases.length === 0 || w.cases.includes('Nom');
const accOk = (w: W): boolean => w.cases.length === 0 || w.cases.includes('Acc');
const datOnly = (w: W): boolean => w.cases.length > 0 && w.cases.includes('Dat') && !w.cases.includes('Nom') && !w.cases.includes('Acc');

// ───────────────────────────── 1. clauses ─────────────────────────────

function segment(st: State): Seg[] {
  const { tokens, W } = st;
  const segs: Seg[] = [];
  const fresh = (): Seg => ({ words: [], fixed: [], groups: [], claimed: new Set() });
  let cur = fresh();
  const flush = (): void => { if (cur.words.length) segs.push(cur); cur = fresh(); };
  const verbal = (i: number): boolean => W[i]?.k === 'verb' || W[i]?.k === 'ptcp';
  const hasVerb = (): boolean => cur.words.some(verbal);
  const verbAhead = (from: number): boolean => {
    for (let j = from; j < tokens.length && tokens[j].isWord; j++) {
      if (isSubMarkerWord(tokens[j].normalized)) return false;
      if (verbal(j)) return true;
    }
    return false;
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t.isWord) { if (PUNCT_BOUNDARY.test(t.surface)) flush(); continue; }
    const w = W[i];
    if (!w) { cur.words.push(i); continue; }
    // "në qoftë se" = if: three words, one conjunction
    if (w.s === 'në' && tokens[i + 1]?.normalized === 'qoftë' && tokens[i + 2]?.normalized === 'se') {
      flush();
      cur.fixed = [i, i + 1];
      cur.marker = i + 2;
      cur.mk = 'sub';
      cur.words.push(i, i + 1, i + 2);
      W[i]!.k = 'other'; W[i + 1]!.k = 'other';
      i += 2;
      continue;
    }
    const markerAtStart = cur.marker !== undefined && cur.words.length === 1;
    let mk: 'sub' | 'coord' | undefined;
    if (isSubMarkerWord(w.s) && w.k !== 'noun' && w.k !== 'verb') mk = 'sub';
    else if (isWhMarkerWord(w.s) && w.wh && (hasVerb() || (w.s === 'sa' && cur.words.length === 0 && segs.length > 0))) mk = 'sub';
    else if (w.k === 'cc' && ['dhe', 'por', 'ose'].includes(w.s)) {
      if (cur.words.length === 0) mk = 'coord';
      else if (hasVerb() && verbAhead(i + 1)) mk = 'coord';
    }
    if (mk && !markerAtStart) {
      if (cur.words.length) flush();
      cur.marker = i; cur.mk = mk;
    }
    cur.words.push(i);
  }
  flush();
  return segs;
}

function groupsOf(st: State, seg: Seg): void {
  const { W } = st;
  const ws = seg.words;
  const vs = ws.filter((i) => W[i]!.k === 'verb' || W[i]!.k === 'ptcp');
  const used = new Set<number>();
  for (let a = 0; a < vs.length; a++) {
    const v = vs[a];
    if (used.has(v)) continue;
    const w = W[v]!;
    const g: Group = { head: v, ...(w.k === 'verb' ? { fin: v } : {}), first: v, marks: [] };
    if (w.k === 'verb' && (w.lemma === 'kam' || w.lemma === 'jam')) {
      const nx = vs[a + 1];
      if (nx !== undefined && W[nx]!.k === 'ptcp' && ws.filter((j) => j > v && j < nx).every((j) => SKIP_BEFORE_VERB.has(W[j]!.k)) && nx - v <= 3) {
        g.aux = v; g.head = nx; used.add(nx);
      } else if (w.lemma === 'jam') g.cop = v;
    }
    // particles and "for" before the verb: të, do, po
    const pos = ws.indexOf(g.first);
    for (let q = pos - 1; q >= 0; q--) {
      const k = W[ws[q]]!.k;
      if (k === 'te' || k === 'fut' || k === 'prog') g.marks.push(ws[q]);
      else if (W[ws[q]]!.s === 'për' && k === 'adp' && g.marks.length && W[g.marks[g.marks.length - 1]]!.k === 'te') { g.marks.push(ws[q]); g.purpose = true; }
      else if (!SKIP_BEFORE_VERB.has(k)) break;
    }
    if (pos > 0 && ['duke', 'pa', 'me'].includes(W[ws[pos - 1]]!.s) && !g.marks.length) { g.marks.push(ws[pos - 1]); g.nonfin = true; }
    seg.groups.push(g);
  }
  seg.groups.forEach((g, k) => {
    if (k === 0) return;
    const prev = seg.groups[k - 1];
    if (g.marks.some((m) => W[m]!.k === 'te') || g.nonfin) {
      g.parent = prev;
      const pl = W[prev.fin ?? prev.head]!.lemma;
      g.prel = g.purpose || g.nonfin ? 'advcl' : CONTROL.has(pl) ? 'xcomp' : 'ccomp';
    } else { g.parent = seg.groups[0]; g.prel = 'dep'; }
  });
}

/** The predicate a copula links to its subject: an adjective, an adverb, the noun of a prepositional phrase, or a noun phrase. */
function resolveCopula(st: State, seg: Seg, g: Group): void {
  const { W, tokens } = st;
  const v = g.cop!;
  const ws = seg.words;
  const pos = ws.indexOf(v);
  let q = pos + 1;
  while (q < ws.length - 1 && W[ws[q]]!.k === 'adv' && !W[ws[q]]!.wh && (W[ws[q + 1]]!.k === 'art' || W[ws[q + 1]]!.k === 'adj')) q++;
  const x = ws[q];
  let whBefore: number | undefined;
  for (let j = pos - 1; j >= 0; j--) { const w = W[ws[j]]!; if (w.wh && (w.k === 'pron' || w.k === 'adv')) { whBefore = ws[j]; break; } }
  let pc: number | undefined;
  let why = '';
  if (whBefore !== undefined) { pc = whBefore; why = `'${tokens[whBefore].surface}' is a question word before '${tokens[v].surface}': it is what the question asks about, and the noun after the verb is the subject`; }
  else if (x !== undefined) {
    const w = W[x]!;
    if (w.k === 'art' && w.unit) { pc = w.unit.head; why = `'${tokens[x].surface} ${tokens[w.unit.head].surface}' (article + adjective) directly after '${tokens[v].surface}' is what is said about the subject`; }
    else if (w.k === 'adj' && !w.unit) { pc = x; why = `the adjective '${tokens[x].surface}' directly after '${tokens[v].surface}' is what is said about the subject`; }
    else if (w.k === 'adp' && st.startAt.get(x + 1) !== undefined) { pc = st.startAt.get(x + 1); why = `the phrase '${tokens[x].surface} ${tokens[pc!].surface}' after '${tokens[v].surface}' says where / what / from where the subject is`; }
    else if (st.startAt.get(x) !== undefined && !st.np.get(st.startAt.get(x)!)!.inner && st.np.get(st.startAt.get(x)!)!.pp === undefined) {
      const nh = st.startAt.get(x)!;
      const preNP = ws.slice(0, pos).some((j) => { const n = st.np.get(j); return n && !n.inner && n.pp === undefined; });
      const after = ws[ws.indexOf(st.np.get(nh)!.end) + 1];
      const aw = after === undefined ? undefined : W[after];
      const later = !preNP && aw ? (aw.k === 'adp' && st.startAt.get(after + 1) !== undefined ? st.startAt.get(after + 1) : aw.k === 'art' && aw.unit ? aw.unit.head : aw.k === 'adj' ? after : aw.k === 'adv' && !aw.wh ? after : undefined) : undefined;
      if (later !== undefined) { pc = later; why = `the noun phrase '${tokens[nh].surface}' right after '${tokens[v].surface}' is the subject (question order) and '${tokens[later].surface}' says where or how it is`; }
      else { pc = nh; why = `the noun phrase '${tokens[nh].surface}' after '${tokens[v].surface}' is what the subject is`; }
    }
    else if (w.k === 'adv' && !w.wh) { pc = x; why = `the adverb '${tokens[x].surface}' after '${tokens[v].surface}' says where or how the subject is`; }
  }
  if (pc === undefined || pc === v) return;
  g.pc = pc; g.head = pc;
  seg.claimed.add(pc);
  st.put(v, pc, 'cop', [`'${tokens[v].surface}' is a form of 'jam' (to be) linking a subject to '${tokens[pc].surface}'`, why], 0.9);
}

// ───────────────────────────── 2. what a clause holds ─────────────────────────────

const govGroup = (seg: Seg, idx: number): Group | undefined => {
  let best: Group | undefined;
  for (const g of seg.groups) if (g.first < idx) best = g;
  return best ?? seg.groups[0];
};

function addBasis(st: State, dep: number, line: string): void {
  const r = st.rel.get(dep);
  if (r) r.basis.push(line);
}

function clause(st: State, seg: Seg): void {
  const { W, tokens } = st;
  const ws = seg.words;
  groupsOf(st, seg);
  for (const g of seg.groups) if (g.cop !== undefined) resolveCopula(st, seg, g);
  const G = seg.groups;
  const g0 = G[0];
  const word = (i: number): string => `'${tokens[i].surface}'`;
  if (seg.marker !== undefined) seg.claimed.add(seg.marker);
  for (const f of seg.fixed) seg.claimed.add(f);
  // an article + adjective that nothing else claimed and that does not follow "to be" is a noun phrase: "e vërteta" (the truth)
  for (const a of ws) {
    const aw = W[a]!;
    if (aw.k !== 'art' || !aw.unit || st.has(aw.unit.head) || seg.claimed.has(aw.unit.head)) continue;
    const u = aw.unit.head;
    const before = ws.slice(0, ws.indexOf(a)).reverse().find((j) => W[j]!.k !== 'adv');
    if (before !== undefined && W[before]!.k === 'verb' && W[before]!.lemma === 'jam') continue;
    if (st.np.has(u)) continue;
    W[u]!.k = 'noun'; W[u]!.nums = []; W[u]!.genders = [];
    st.np.set(u, { h: u, start: a, end: u });
    st.headOf.set(a, u); st.headOf.set(u, u); st.startAt.set(a, u);
    st.put(a, u, 'det', [`'${tokens[a].surface}' is the linking article of '${tokens[u].surface}', which stands as a noun here (the + adjective)`], 0.8);
  }

  // ── no verb: the head is the first noun phrase (or the predicate-like word) ──
  const tops = ws.filter((i) => { const h = st.np.get(i); return h && !h.inner && h.pp === undefined && !seg.claimed.has(i); });
  const ppHeads = ws.filter((i) => { const h = st.np.get(i); return h && !h.inner && h.pp !== undefined && !seg.claimed.has(i); });
  if (!g0) {
    seg.head = tops[0] ?? ppHeads[0] ?? ws.find((i) => W[i]!.k === 'adj' && !st.has(i)) ?? ws.find((i) => W[i]!.k === 'intj') ?? ws.find((i) => W[i]!.k === 'adv' && !W[i]!.wh)
      ?? ws.find((i) => W[i]!.wh && W[i]!.k !== 'sconj') ?? ws.find((i) => !['qpart', 'prog', 'neg', 'cc', 'edhe', 'other', 'sconj', 'none'].includes(W[i]!.k) && !st.has(i));
    if (seg.head !== undefined) seg.claimed.add(seg.head);
  } else seg.head = g0.head;
  if (seg.head !== undefined) seg.claimed.add(seg.head);
  const headOfSeg = seg.head;
  for (const f of seg.fixed) if (seg.marker !== undefined) st.put(f, seg.marker, 'fixed', ['part of the fixed conjunction "në qoftë se" (if)'], 0.8);

  // ── groups: auxiliaries, particles, chains ──
  for (const g of G) {
    if (g.aux !== undefined) st.put(g.aux, g.head, 'aux', [`'${tokens[g.aux].surface}' (${W[g.aux]!.lemma}) with the participle '${tokens[g.head].surface}' makes the perfect / passive: the participle carries the meaning`], 0.9);
    for (const m of g.marks) {
      const w = W[m]!;
      const why = w.s === 'duke' ? `'duke' + participle: "while doing"` : w.s === 'pa' && w.k !== 'te' ? `'pa' + participle: "without doing"` : w.s === 'me' && w.k !== 'te' ? `'me' + verb: "by doing" / "with …ing"` : w.k === 'te' ? `'${tokens[m].surface}' is the particle të before a verb (subjunctive / "to …")` : w.k === 'fut' ? `'${tokens[m].surface}' + të + verb is the future` : w.k === 'prog' ? `'po' before a verb marks an action in progress` : `'${tokens[m].surface}' + 'të' + verb is a purpose phrase ("in order to")`;
      st.put(m, g.head, 'mark', [why], 0.88);
    }
    if (g.parent && g.prel) {
      const pr = g.prel;
      const ph = g.parent.head;
      const plemma = W[g.parent.fin ?? g.parent.head]!.lemma;
      const nominalPred = g.parent.pc !== undefined && W[g.parent.pc]!.k !== 'verb';
      const rel: DependencyRelation = pr === 'advcl' && nominalPred ? 'acl' : pr;
      const alts: SyntaxAlternative[] = pr === 'xcomp' ? [{ head: ph, relation: 'ccomp', confidence: 0.2, why: 'a të-clause can also be a full object clause' }]
        : pr === 'ccomp' ? [{ head: ph, relation: 'xcomp', confidence: 0.2, why: "'" + plemma + "' is not on the list of verbs that share their subject with the verb after të" }] : [];
      const basis = pr === 'dep' ? [`${word(g.head)} is a second verb in the same clause with no të, no 'and' and no punctuation before it`]
        : [`${word(g.head)} follows ${word(ph)} with the particle të`, pr === 'xcomp' ? `'${plemma}' is a verb that takes a të-verb as its complement` : pr === 'ccomp' ? `'${plemma}' takes a clause as its object` : 'a purpose phrase (për të + verb) modifies the clause'];
      g.parent && st.put(g.head, ph, rel, basis, pr === 'dep' ? 0.3 : 0.75, alts, pr === 'dep' ? 'second verb of the clause (parataxis in Universal Dependencies)' : undefined);
    }
  }
  const mover = G.length ? G[0] : undefined;

  // ── the verb group the agreement is taken from ──
  const finOf = (g: Group | undefined): W | undefined => {
    if (!g) return undefined;
    const direct = g.fin ?? g.aux ?? g.cop;
    if (direct !== undefined && W[direct]!.persons.length) return W[direct];
    for (const h of G) if (h.fin !== undefined && W[h.fin]!.persons.length) return W[h.fin];
    return direct !== undefined ? W[direct] : W[g.head];
  };
  const fin = finOf(mover);
  const verbLemma = mover ? W[mover.fin ?? mover.aux ?? mover.head]!.lemma : '';
  const firstTok = mover ? Math.min(...G.map((g) => g.first)) : ws[0];
  const hasConj = (h: number): boolean => [...st.rel.values()].some((r) => r.relation === 'conj' && r.head === h);

  // ── subject ──
  let subj: number | undefined;
  const used = new Set<number>(seg.claimed);
  if (mover && mover.head !== undefined) {
    const cands = tops.filter((h) => !used.has(h) && W[h]!.k !== 'clitic');
    const okAgree = (h: number): boolean => agrees(W[h]!, fin, hasConj(h));
    const nomCands = cands.filter((h) => nomOk(W[h]!) && !(W[h]!.wh && W[h]!.cases.length === 0 && W[h]!.k === 'pron'));
    const agree = nomCands.filter(okAgree);
    const pre = agree.filter((h) => h < firstTok);
    const post = agree.filter((h) => h > firstTok);
    let pickAlts: SyntaxAlternative[] = [];
    let conf = 0.85;
    const strongPre = pre.filter((h) => strongSubject(W[h]!));
    const strongPost = post.filter((h) => strongSubject(W[h]!));
    if (strongPre.length) subj = strongPre[strongPre.length - 1];
    else if (strongPost.length && !pre.length) subj = strongPost[0];
    else if (strongPost.length) { subj = strongPost[0]; conf = 0.6; }
    else if (pre.length) { subj = pre[pre.length - 1]; conf = 0.75; }
    else if (post.length) {
      if (SUBJ_POST.has(verbLemma)) { subj = post[0]; conf = 0.65; }
      else if (nomCands.length === 1 && !cands.some((h) => h !== post[0] && accOk(W[h]!) && h > firstTok)) { /* a lone post-verbal nominative-or-accusative: object, see below */ }
    }
    if (subj !== undefined) {
      const sw = W[subj]!;
      const others = agree.filter((h) => h !== subj && accOk(W[h]!) && !nomOnly(W[h]!));
      if (!nomOnly(sw) && accOk(sw)) {
        pickAlts = [{ head: mover.head, relation: 'obj', confidence: 0.2, why: `'${tokens[subj].surface}' also has an accusative reading (the nominative and accusative of an indefinite noun are the same)` }];
        conf = Math.min(conf, 0.7);
      }
      if (others.length) conf = Math.min(conf, 0.7);
      const before = subj < firstTok;
      st.put(subj, mover.head, 'nsubj', [
        `'${tokens[subj].surface}' can be nominative (${caseText(sw)})`,
        `it agrees with '${tokens[fin ? fin.i : mover.head].surface}': ${personText(sw)} ${sw.k === 'noun' ? '(a noun is third person)' : ''}`.trim(),
        before ? 'it stands before the verb (the usual order)' : 'it stands after the verb',
      ], conf, pickAlts);
      used.add(subj);
    } else if (nomCands.length && !agree.length) {
      const h = nomCands[0];
      if (nomOnly(W[h]!) && !accOk(W[h]!)) {
        st.put(h, mover.head, 'nsubj', [`'${tokens[h].surface}' is the only nominative, but it does not agree with '${tokens[fin ? fin.i : mover.head].surface}' in person or number (a wrong reading is possible)`], 0.35, [{ head: mover.head, relation: 'dep', confidence: 0.3, why: 'the agreement fails, so the noun may belong to another structure' }]);
        used.add(h); subj = h;
      }
    }
  }
  const head0 = mover?.head ?? headOfSeg;
  if (mover?.cop !== undefined && mover.pc !== undefined && subj !== undefined && subj < mover.pc && W[subj]!.k === 'noun' && W[mover.pc]!.k === 'noun') (SWAPS.get(st) ?? SWAPS.set(st, []).get(st)!).push([subj, mover.pc]);

  // ── objects ──
  const argHead = (h: number): number => (h > firstTok ? govGroup(seg, h)?.head : undefined) ?? head0 ?? headOfSeg!;
  const accClitic = ws.some((i) => { const own = vals(W[i]!.c?.morph.Case); return W[i]!.k === 'clitic' && own.length === 1 && own[0] === 'Acc'; });
  const rest = tops.filter((h) => !used.has(h) && W[h]!.k !== 'clitic');
  let objNP: number | undefined;
  let iobjNP: number | undefined;
  if (mover && head0 !== undefined) {
    const subjPos = subj !== undefined ? subj : firstTok;
    const dative = rest.filter((h) => datOnly(W[h]!) && !W[h]!.wh);
    for (const h of dative) {
      if (iobjNP === undefined) {
        iobjNP = h;
        const cl = ws.some((i) => W[i]!.k === 'clitic' && W[i]!.cases.includes('Dat'));
        st.put(h, argHead(h), 'iobj', [`'${tokens[h].surface}' has the dative form (${caseText(W[h]!)}) and no preposition before it`, cl ? 'a short dative pronoun before the verb repeats it (clitic doubling)' : ''], cl ? 0.85 : 0.7, cl ? [] : [{ head: head0, relation: 'obl', confidence: 0.25, why: 'a dative form without a doubling pronoun can also be a possessor or an adverbial' }]);
      } else st.put(h, argHead(h), 'obl', [`a second dative form '${tokens[h].surface}' after the indirect object`], 0.45);
      used.add(h);
    }
    const namePred = verbLemma === 'quhem' && subj !== undefined ? rest.find((h) => h > firstTok && nomOk(W[h]!)) : undefined;
    if (namePred !== undefined) { st.put(namePred, argHead(namePred), 'xcomp', [`'${tokens[namePred].surface}' is the name after 'quhem' (I am called …): a nominative that completes the verb`], 0.7, [{ head: head0, relation: 'obj', confidence: 0.2, why: 'the form may also be an accusative' }]); used.add(namePred); }
    const accC = rest.filter((h) => !used.has(h) && accOk(W[h]!));
    for (const h of accC) {
      const w = W[h]!;
      const hasEvery = [...st.rel.values()].some((r) => r.head === h && r.relation === 'det' && tokens[r.dependent].normalized === 'çdo');
      const preverbal = h < Math.min(subjPos, firstTok) || (h < firstTok && subj !== undefined && h < subj);
      if (hasEvery) {
        st.put(h, argHead(h), 'obl', [`'${tokens[h].surface}' with çdo (every) is an adverbial of time (\"every day\")`], 0.8);
      } else if (objNP === undefined && preverbal && !accClitic && !(w.cases.length === 0)) {
        st.put(h, argHead(h), 'obl', [`'${tokens[h].surface}' is accusative and stands first, before the subject, with no short pronoun repeating it: a fronted adverbial (a time or place)`], 0.6, [{ head: head0, relation: 'obj', confidence: 0.3, why: 'a fronted accusative can be the object when the verb is transitive' }]);
      } else if (objNP === undefined) {
        objNP = h;
        const nomToo = w.cases.includes('Nom');
        const alts: SyntaxAlternative[] = nomToo && subj !== undefined && h > firstTok ? [{ head: head0, relation: 'nsubj', confidence: subj < firstTok ? 0.15 : 0.35, why: `'${tokens[h].surface}' also has a nominative reading (indefinite nominative = accusative); the order puts the subject first` }]
          : nomToo && subj === undefined ? [{ head: head0, relation: 'nsubj', confidence: 0.35, why: `'${tokens[h].surface}' also has a nominative reading and the verb has no other subject here` }] : [];
        st.put(h, argHead(h), 'obj', [`'${tokens[h].surface}' can be accusative (${caseText(w)}) and is not the subject`, preverbal ? 'it stands before the verb; a short pronoun repeats it (clitic doubling)' : 'it follows the verb'], nomToo ? 0.7 : 0.85, alts);
      } else {
        st.put(h, argHead(h), 'obl', [`'${tokens[h].surface}' is a second accusative noun phrase in the clause: an adverbial of time or manner`], 0.5, [{ head: head0, relation: 'iobj', confidence: 0.15, why: 'a second noun phrase after the object can also be an indirect object' }]);
      }
      used.add(h);
    }
    for (const h of rest) {
      if (used.has(h)) continue;
      st.put(h, argHead(h), 'obl', [`'${tokens[h].surface}' (${caseText(W[h]!)}) is a noun phrase that is neither subject nor object`], 0.4);
      used.add(h);
    }
  } else {
    // no verb: the other noun phrases are not arguments of anything we can name
    for (const h of rest) used.add(h);
  }

  // ── short pronouns ──
  const clitics = ws.filter((i) => W[i]!.k === 'clitic' && !st.has(i));
  clitics.forEach((q, idx) => {
    const w = W[q]!;
    const g = G.find((x) => x.first > q) ?? G[G.length - 1];
    if (!g) return;
    const hd = g.head;
    const nextIsClitic = clitics[idx + 1] === q + 1 || (idx + 1 < clitics.length && ws.indexOf(clitics[idx + 1]) === ws.indexOf(q) + 1);
    const prevIsClitic = idx > 0 && ws.indexOf(clitics[idx - 1]) === ws.indexOf(q) - 1;
    const parts = w.c?.parts;
    const c1 = parts?.length ? parts[0].morph?.Case : undefined;
    const own = vals(w.c?.morph.Case);
    const cases = parts?.length && c1 ? [c1] : own.length ? own : w.cases;
    const cluster = parts && parts.length > 1 ? ` (the written form ${tokens[q].surface} is two short pronouns fused)` : '';
    const pnum = w.nums[0];
    const objAgree = objNP !== undefined && (pnum === undefined || W[objNP]!.nums.length === 0 || W[objNP]!.nums.includes(pnum));
    const only = (c: string): boolean => cases.length === 1 && cases[0] === c;
    const accAlt = only('Dat') && iobjNP === undefined && objNP !== undefined && (hasConj(objNP) || (W[objNP]!.nums.length === 1 && W[objNP]!.nums[0] === 'Plur')) && w.alts.some((c) => c.morph.Clitic === 'Yes' && c.morph.Case === 'Acc' && c.confidence >= (w.c?.confidence ?? 1) - 0.1);
    if (accAlt) { st.put(q, hd, 'expl', [`'${tokens[q].surface}' is the plural accusative short pronoun (them) and the plural object '${tokens[objNP!].surface}' is in the clause: it repeats it (clitic doubling)`], 0.6, [{ head: hd, relation: 'iobj', confidence: 0.35, why: `'${tokens[q].surface}' is also the dative singular (to him / her)` }]); addBasis(st, objNP!, `doubled by the short pronoun '${tokens[q].surface}' (clitic doubling)`); }
    else if (only('Dat') || (parts && parts.length > 1 && cases[0] === 'Dat')) {
      if (iobjNP !== undefined) { st.put(q, hd, 'expl', [`'${tokens[q].surface}' is a dative short pronoun and the dative noun '${tokens[iobjNP].surface}' is in the clause: it only repeats it (clitic doubling)${cluster}`], 0.8); addBasis(st, iobjNP, `doubled by the short pronoun '${tokens[q].surface}' (clitic doubling)`); }
      else st.put(q, hd, 'iobj', [`'${tokens[q].surface}' is a dative short pronoun (to him / her / them) and no noun of the clause repeats it${cluster}`], 0.8, parts && parts.length > 1 ? [{ head: hd, relation: 'obj', confidence: 0.3, why: `${tokens[q].surface} also contains an accusative pronoun (e / i)` }] : []);
    } else if (only('Acc')) {
      if (objNP !== undefined && objAgree) { st.put(q, hd, 'expl', [`'${tokens[q].surface}' is an accusative short pronoun and the object '${tokens[objNP].surface}' is in the clause: it only repeats it (clitic doubling)`], 0.8); addBasis(st, objNP, `doubled by the short pronoun '${tokens[q].surface}' (clitic doubling)`); }
      else st.put(q, hd, 'obj', [`'${tokens[q].surface}' is an accusative short pronoun (him / her / it / them) and no noun of the clause repeats it`], 0.8, objNP !== undefined ? [{ head: hd, relation: 'expl', confidence: 0.3, why: `it may repeat '${tokens[objNP].surface}', but their number differs` }] : []);
    } else {
      // më / të / na / ju: accusative or dative
      if (nextIsClitic) st.put(q, hd, 'iobj', [`'${tokens[q].surface}' is the first of two short pronouns; the dative comes before the accusative`], 0.7, [{ head: hd, relation: 'obj', confidence: 0.3, why: 'më / të / na / ju are accusative as well' }]);
      else if (prevIsClitic) st.put(q, hd, 'obj', [`'${tokens[q].surface}' is the second of two short pronouns; the accusative comes after the dative`], 0.7);
      else if (objNP !== undefined) st.put(q, hd, 'iobj', [`'${tokens[q].surface}' (me / you / us) is accusative or dative; the clause already has an object '${tokens[objNP].surface}', so it is the indirect object`], 0.8, [{ head: hd, relation: 'obj', confidence: 0.2, why: `'${tokens[objNP].surface}' could be an adverbial instead` }]);
      else if (iobjNP !== undefined) st.put(q, hd, 'obj', [`'${tokens[q].surface}' is accusative or dative; the clause already has the indirect object '${tokens[iobjNP].surface}'`], 0.7);
      else st.put(q, hd, 'obj', [`'${tokens[q].surface}' is accusative or dative and the clause has no other object`], 0.65, [{ head: hd, relation: 'iobj', confidence: 0.35, why: 'with a verb that takes only a dative (a person) it would be the indirect object' }]);
    }
  });

  // ── prepositional phrases ──
  for (const h of ppHeads) {
    if (st.has(h)) continue;
    const np = st.np.get(h)!;
    const g = govGroup(seg, np.pp!);
    const target = g?.head ?? headOfSeg;
    if (target === undefined || target === h) continue;
    const prevW = ws[ws.indexOf(np.pp!) - 1];
    const follows = prevW !== undefined && st.headOf.get(prevW) !== undefined && prevW === np.pp! - 1 && prevW !== target;
    const nounBefore = follows ? st.headOf.get(prevW) : undefined;
    const alts: SyntaxAlternative[] = nounBefore !== undefined && nounBefore !== subj && nounBefore !== target && W[nounBefore]!.k === 'noun' ? [{ head: nounBefore, relation: 'nmod', confidence: 0.25, why: `the phrase also follows the noun '${tokens[nounBefore].surface}' directly` }] : [];
    st.put(h, target, 'obl', [`'${tokens[np.pp!].surface} ${tokens[h].surface}' is a prepositional phrase; it is attached to the ${g?.pc !== undefined ? 'predicate' : 'verb'} '${tokens[target].surface}'`], 0.7, alts);
  }

  // ── small words ──
  for (const i of ws) {
    if (st.has(i) || seg.claimed.has(i)) continue;
    const w = W[i]!;
    const nextGroup = G.find((g) => g.first > i);
    const tgt = (nextGroup ?? govGroup(seg, i))?.head ?? headOfSeg;
    switch (w.k) {
      case 'adp': if (W[i + 1]?.k === 'te' && !st.has(i + 1)) break; if (tgt !== undefined) st.put(i, tgt, 'advmod', [`'${tokens[i].surface}' has no noun phrase after it, so it works as an adverb ('nga jeni' = where are you from)`], 0.5); break;
      case 'adj': if (tgt !== undefined && !w.unit) st.put(i, tgt, 'advmod', [`the adjective form '${tokens[i].surface}' stands after the verb with no noun to describe: used as an adverb (well, good)`], 0.5, [{ head: tgt, relation: 'amod', confidence: 0.2, why: 'it may describe a noun the rules did not see' }]); break;
      case 'neg':
        if (tgt !== undefined) st.put(i, tgt, 'advmod', [`'${tokens[i].surface}' is the negation of the predicate '${tokens[tgt].surface}'`], 0.85);
        break;
      case 'adv': {
        const nx = ws[ws.indexOf(i) + 1];
        const nw = nx === undefined ? undefined : W[nx];
        const adjNext = nw && nx === i + 1 && ((nw.k === 'art' && nw.unit) || nw.k === 'adj' || (nw.k === 'adv' && !nw.wh)) ? (nw.unit ? nw.unit.head : nx) : undefined;
        const to = adjNext ?? (govGroup(seg, i)?.head ?? headOfSeg);
        if (to !== undefined) st.put(i, to, 'advmod', [adjNext !== undefined ? `'${tokens[i].surface}' stands directly before the adjective or adverb it modifies` : `'${tokens[i].surface}' is an adverb of the ${govGroup(seg, i)?.pc !== undefined ? 'predicate' : 'verb'} '${tokens[to].surface}'`], 0.75);
        break;
      }
      case 'edhe': {
        const nx = ws[ws.indexOf(i) + 1];
        const to = nx !== undefined ? (st.startAt.get(nx) ?? nx) : headOfSeg;
        if (to !== undefined) st.put(i, to, 'advmod', [`'edhe' (also / even) stands directly before '${tokens[to].surface}'`], 0.7);
        break;
      }
      case 'uvoice': if (tgt !== undefined) st.put(i, tgt, 'expl', [`'u' before a verb marks the non-active (passive / reflexive) form`], 0.7); break;
      case 'qpart': case 'intj': if (headOfSeg !== undefined && headOfSeg !== i) st.put(i, headOfSeg, 'discourse', [w.k === 'qpart' ? `'a' at the start of a clause turns it into a yes / no question` : `'${tokens[i].surface}' is an interjection / reply word`], 0.8); break;
      case 'prog': case 'other':
        if (headOfSeg !== undefined && headOfSeg !== i) st.put(i, headOfSeg, w.s === 'ja' ? 'advmod' : 'discourse', [w.s === 'ja' ? `'ja' (here is …) points at the noun` : `'${tokens[i].surface}' is a reply / emphasis word`], 0.6);
        break;
      case 'te': {
        if (i > 0 && W[i - 1]?.k === 'adp' && !st.has(i - 1)) {
          const to2 = govGroup(seg, i)?.head ?? headOfSeg;
          if (to2 !== undefined && st.put(i, to2, 'obl', [`after the preposition '${tokens[i - 1].surface}' the form '${tokens[i].surface}' is the pronoun him / her / them, not the verb particle`], 0.6)) st.put(i - 1, i, 'case', [`'${tokens[i - 1].surface}' is a preposition with the pronoun '${tokens[i].surface}' after it`], 0.8);
          break;
        }
        const to = nextGroup?.head;
        if (to !== undefined) st.put(i, to, 'mark', [`'${tokens[i].surface}' is the particle të before the verb '${tokens[to].surface}'`], 0.7);
        break;
      }
      case 'sconj': if (headOfSeg !== undefined && headOfSeg !== i) st.put(i, headOfSeg, 'mark', [`'${tokens[i].surface}' is a subordinating word`], 0.6); break;
      case 'cc': {
        const nx = ws[ws.indexOf(i) + 1];
        if (!['dhe', 'por', 'ose', 'e'].includes(w.s) && headOfSeg !== undefined && headOfSeg !== i) { st.put(i, headOfSeg, 'mark', [`'${tokens[i].surface}' is a connecting word that opens the clause`], 0.5); break; }
        const to = nx !== undefined ? (st.startAt.get(nx) ?? nx) : headOfSeg;
        if (to !== undefined && to !== i) st.put(i, to, 'cc', [`'${tokens[i].surface}' (and / but) before '${tokens[to].surface}'`], 0.5);
        break;
      }
      default: break;
    }
  }
}

// ───────────────────────────── 3. linking the clauses ─────────────────────────────

function link(st: State, segs: Seg[]): number | undefined {
  const { W, tokens } = st;
  const headed = segs.filter((s) => s.head !== undefined);
  if (!headed.length) return undefined;
  const isVerbal = (s: Seg): boolean => s.groups.length > 0;
  const verbalSegs = headed.filter(isVerbal);
  const reportingOnly = verbalSegs.length > 0 && verbalSegs.every((s) => s.mk === undefined && SAY.has(W[s.groups[0].fin ?? s.groups[0].head]!.lemma) && [...st.rel.values()].some((r) => r.relation === 'nsubj' && r.head === s.head)) && headed.some((s) => !isVerbal(s));
  const fragmentRoot = reportingOnly ? headed.find((s) => !isVerbal(s) && W[s.head!]!.k !== 'intj' && W[s.head!]!.k !== 'noun' || (!isVerbal(s) && W[s.head!]!.k === 'noun' && !(W[s.head!]!.c?.pos === 'PROPN' || W[s.head!]!.defs.includes('Ind')))) ?? headed.find((s) => !isVerbal(s)) : undefined;
  const root = fragmentRoot ?? headed.find((s) => isVerbal(s) && s.mk !== 'sub' && s.mk !== 'coord') ?? headed.find((s) => isVerbal(s)) ?? headed[0];
  const rootHead = root.head!;
  st.put(rootHead, undefined, 'root', ['the main clause: the first verb that is not introduced by a subordinating word or an "and"'], 0.9, undefined, 'the main word of the sentence');
  const idx = (s: Seg): number => segs.indexOf(s);
  const conjFirst = (a: number): number => { let x = a; for (let n = 0; n < 20; n++) { const r = st.rel.get(x); if (r?.relation === 'conj' && r.head !== undefined) x = r.head; else break; } return x; };
  const lastWord = (s: Seg): number => s.words[s.words.length - 1];

  for (const s of headed) {
    if (s === root) continue;
    const h = s.head!;
    const i = idx(s);
    const prevHeaded = [...headed].filter((x) => idx(x) < i).pop();
    const nextMain = headed.find((x) => idx(x) > i && isVerbal(x) && x.mk !== 'sub');
    const markerW = s.marker !== undefined ? W[s.marker]! : undefined;

    if (isVerbal(s) && s.mk === 'sub' && markerW) {
      const prevVerbal = [...headed].filter((x) => idx(x) < i && isVerbal(x)).pop();
      const matrix = prevVerbal ?? nextMain ?? root;
      const mh = matrix.head!;
      const m = markerW.s;
      const lastBefore = prevHeaded ? lastWord(prevHeaded) : undefined;
      const nounBefore = lastBefore !== undefined && st.headOf.get(lastBefore) !== undefined && W[st.headOf.get(lastBefore)!]!.k !== 'verb' ? st.headOf.get(lastBefore) : undefined;
      let rel: DependencyRelation = 'advcl';
      let why = '';
      let alts: SyntaxAlternative[] = [];
      if (s.fixed.length) { rel = 'advcl'; why = `'${s.fixed.map((f) => tokens[f].surface).join(' ')} ${tokens[s.marker!].surface}' is the conjunction "if"`; }
      else if (m === 'se') { rel = 'ccomp'; why = `'se' (that) introduces the clause that says what is thought, said or known`; alts = [{ head: mh, relation: 'advcl', confidence: 0.2, why: "'se' can also give a reason" }]; }
      else if (m === 'që') {
        if (nounBefore !== undefined) { rel = 'acl'; why = `'që' (who / which / that) follows the noun '${tokens[nounBefore].surface}': a relative clause`; alts = [{ head: mh, relation: 'ccomp', confidence: 0.25, why: "'që' can also introduce a complement clause" }]; }
        else { rel = 'ccomp'; why = `'që' introduces a clause that completes the verb`; alts = [{ head: mh, relation: 'advcl', confidence: 0.3, why: "'që' can also give a purpose or a reason" }]; }
      } else if (m === 'sa') { rel = 'advcl'; why = "'sa' (so that / as much as) introduces a clause of result or degree"; }
      else if (isWhMarkerWord(m)) { rel = W[mh]!.k === 'verb' || W[mh]!.k === 'ptcp' ? 'ccomp' : 'advcl'; why = `'${m}' opens an indirect question`; }
      else { rel = 'advcl'; why = `'${tokens[s.marker!].surface}' introduces an adverbial clause (time, reason, condition)`; }
      const target = rel === 'acl' ? nounBefore! : mh;
      st.put(h, target, rel, [why, prevVerbal ? 'it follows the clause it belongs to' : 'it comes first, so it belongs to the main clause after it'], rel === 'acl' ? 0.7 : 0.7, alts.map((a) => ({ ...a, head: a.head })));
      if (s.marker !== undefined && !st.has(s.marker)) {
        if (WH_SUB_ADV.has(m) && markerW.wh) st.put(s.marker, h, 'advmod', [`'${tokens[s.marker].surface}' is a question word inside its clause`], 0.7);
        else if (!s.fixed.length) st.put(s.marker, h, 'mark', [`'${tokens[s.marker].surface}' introduces the clause`], 0.88);
        else { st.put(s.marker, h, 'mark', [`'${tokens[s.marker].surface}' ends the three-word conjunction "në qoftë se"`], 0.8); for (const f of s.fixed) st.put(f, s.marker, 'fixed', ['part of the fixed conjunction "në qoftë se" (if)'], 0.8); }
      }
      continue;
    }
    if (s.mk === 'coord' || (s.marker !== undefined && W[s.marker]?.k === 'cc')) {
      const prevVerbalSeg = isVerbal(s) ? [...headed].filter((x) => idx(x) < i && isVerbal(x)).pop() : undefined;
      const to = prevVerbalSeg ? conjFirst(prevVerbalSeg.head!) : prevHeaded ? conjFirst(prevHeaded.head!) : rootHead;
      if (st.put(h, to, 'conj', [`'${tokens[s.marker!].surface}' joins this to the clause or phrase before it`, isVerbal(s) ? 'both have a verb' : 'neither has its own verb'], 0.75) && s.marker !== undefined) st.put(s.marker, h, 'cc', [`'${tokens[s.marker].surface}' (and / but) opens the coordinated part`], 0.9);
      continue;
    }
    if (isVerbal(s)) { st.put(h, rootHead, 'dep', ['a second main clause after punctuation (a reporting clause such as "thotë Marku", or a clause added with a comma)'], 0.4, undefined, 'second main clause (parataxis in Universal Dependencies)'); continue; }

    // verbless fragments: a list, a vocative, an apposition, a reply word, an adverb
    const w = W[h]!;
    const prevSeg = prevHeaded;
    const endsInNP = prevSeg ? st.headOf.get(lastWord(prevSeg)) : undefined;
    const hasCcInside = s.words.some((j) => W[j]!.k === 'cc');
    if (w.k === 'noun' && endsInNP !== undefined && hasCcInside && st.np.get(endsInNP) && W[endsInNP]!.k === 'noun') {
      const first = conjFirst(endsInNP);
      if (st.put(h, first, 'conj', ['a comma separates the items of a list that ends with "and"'], 0.75)) {
        for (const r of st.rel.values()) if (r.relation === 'conj' && r.head === h) r.head = first;
        continue;
      }
    }
    if (st.np.get(h)?.pp !== undefined) {
      const verbalSeg = [...headed].filter((x) => isVerbal(x) && x !== s).sort((a, b) => Math.abs(idx(a) - i) - Math.abs(idx(b) - i))[0];
      if (verbalSeg) { st.put(h, verbalSeg.head!, 'obl', [`'${tokens[st.np.get(h)!.pp!].surface} ${tokens[h].surface}' is a prepositional phrase set off by a comma: it belongs to the nearest clause`], 0.6); continue; }
    }
    const vocativeForm = w.k === 'noun' && (w.c?.pos === 'PROPN' || w.defs.length === 0 || w.defs.includes('Ind'));
    if (w.k === 'noun' && !vocativeForm && st.np.get(h)?.pp === undefined) { st.put(h, rootHead, 'dep', [`'${tokens[h].surface}' is a definite noun phrase standing alone between punctuation (a quoted fragment), not a form of address`], 0.3); continue; }
    if (w.k === 'noun' && (st.np.get(h)?.pp === undefined)) {
      const nounBeforeComma = endsInNP !== undefined && W[endsInNP]!.k === 'noun' && !!prevSeg && isVerbal(prevSeg) && lastWord(prevSeg) === (st.np.get(endsInNP)?.end ?? -1);
      if (nounBeforeComma && W[h]!.cases.some((c) => c === 'Nom') && W[endsInNP!]!.cases.includes('Nom')) {
        st.put(h, endsInNP, 'appos', [`'${tokens[h].surface}' is a name or noun between commas right after the noun phrase '${tokens[endsInNP!].surface}': it renames it`], 0.55, [{ head: rootHead, relation: 'vocative', confidence: 0.35, why: 'a name between commas can also be the person spoken to' }]);
      } else st.put(h, rootHead, 'vocative', [`'${tokens[h].surface}' is a noun or name between commas, alone, beside a clause: the person addressed`], 0.7, nounBeforeComma ? [{ head: endsInNP, relation: 'appos', confidence: 0.3, why: 'it could also rename the noun before it' }] : []);
      continue;
    }
    if (w.k === 'intj' || w.k === 'qpart' || w.k === 'prog' || w.k === 'other') { st.put(h, rootHead, 'discourse', [`'${tokens[h].surface}' is a reply or greeting word beside the clause`], 0.7); continue; }
    if (w.k === 'adv' || w.k === 'adj') { st.put(h, rootHead, 'advmod', [`'${tokens[h].surface}' is an adverb (or adjective used as one) beside the clause`], 0.55); continue; }
    st.put(h, rootHead, 'dep', [`a fragment between punctuation that the rules cannot place`], 0.3);
  }
  for (const s of headed) {
    if (s.marker === undefined || st.has(s.marker)) continue;
    const mw = W[s.marker]!;
    const to = s.head!;
    if (to === s.marker) continue;
    if (mw.k === 'cc') st.put(s.marker, to, 'cc', [`'${tokens[s.marker].surface}' opens this part of the sentence`], 0.7);
    else if (WH_SUB_ADV.has(mw.s) && mw.wh) st.put(s.marker, to, 'advmod', [`'${tokens[s.marker].surface}' is a question word inside its clause`], 0.7);
    else st.put(s.marker, to, 'mark', [`'${tokens[s.marker].surface}' introduces the clause`], 0.75);
  }
  return rootHead;
}

/**
 * A clause with no verb in which a noun reading and a finite-verb reading of one word weigh the same (kisha = the church / I had):
 * the verb reading is taken, because a clause needs one. Only for a word whose first reading is a noun; function words are never re-read.
 */
function rescueVerbs(st: State): void {
  const { W, tokens } = st;
  // "Të dua" (I love you): the particle të cannot open a sentence, a short pronoun can
  const first = st.words[0];
  if (first !== undefined && W[first]!.k === 'te' && W[first + 1]?.k === 'verb') {
    const alt = W[first]!.alts.find((c) => c.pos === 'PRON' && c.morph.Clitic === 'Yes');
    if (alt) { reread(tokens[first], W[first]!, alt); st.notes.push(`'${tokens[first].surface}' opens the sentence, so it is read as the short pronoun (you), not the particle të`); }
  }
  // "të mos humbasë": a short pronoun të that opens a chain of short pronouns / mos before a subjunctive-only verb is the particle
  for (const i of st.words) {
    const w = W[i]!;
    if (w.s !== 'të' || w.k !== 'clitic') continue;
    let j = i + 1;
    while (W[j] && tokens[j].isWord && (W[j]!.k === 'clitic' || W[j]!.k === 'neg')) j++;
    const verb = W[j];
    if (!verb || verb.k !== 'verb' || verb.c?.morph.Mood !== 'Sub') continue;
    let k = i - 1;
    while (W[k] && tokens[k].isWord && W[k]!.k === 'clitic') k--;
    if (W[k] && tokens[k].isWord && (W[k]!.k === 'te' || W[k]!.k === 'fut')) continue;
    const alt = w.alts.find((c) => c.pos === 'PART' && c.lemma === 'të');
    if (alt) reread(tokens[i], w, alt);
  }
  for (const seg of segment(st)) {
    if (seg.words.length < 2 || seg.words.some((i) => W[i]!.k === 'verb' || W[i]!.k === 'ptcp')) continue;
    for (const i of seg.words) {
      const w = W[i]!;
      if (w.k !== 'noun' || !w.c) continue;
      const alt = w.alts.find((c) => (c.pos === 'VERB' || c.pos === 'AUX') && c.morph.VerbForm === 'Fin' && c.confidence >= w.c!.confidence - 0.05);
      if (!alt) continue;
      reread(tokens[i], w, alt);
      st.notes.push(`'${tokens[i].surface}' is read as a verb because its clause has no other verb and the noun and verb readings weigh the same`);
      break;
    }
  }
}

// ───────────────────────────── entry ─────────────────────────────

export function sqSyntax(tokens: RawToken[], analyses: AnalyzedToken[]): SyntaxAnalysis {
  const W = classify(tokens, analyses);
  const st = makeState(tokens, W);
  rescueVerbs(st);
  buildNPs(st);
  const segs = segment(st);
  for (const s of segs) clause(st, s);
  const rootHead = link(st, segs);
  // two nouns on either side of "to be": keep the other order as an alternative
  for (const [a, b] of SWAPS.get(st) ?? []) {
    const ra = st.rel.get(a);
    const rb = st.rel.get(b);
    if (!ra || !rb || ra.relation !== 'nsubj') continue;
    const cop = [...st.rel.values()].find((r) => r.relation === 'cop' && r.head === b)?.dependent ?? b;
    const why = `'${tokens[a].surface}' and '${tokens[b].surface}' are both nouns on either side of '${tokens[cop].surface}': the word order (subject first) is the only thing that says which is the subject`;
    ra.alternatives = [...(ra.alternatives ?? []), { ...(rb.head !== undefined ? { head: rb.head } : {}), relation: rb.relation, confidence: 0.3, why }];
    rb.alternatives = [...(rb.alternatives ?? []), { head: a, relation: 'nsubj', confidence: 0.3, why }];
    ra.status = 'conflicted'; rb.status = 'conflicted';
  }

  // a linking article whose adjective was placed by another rule (a predicate, a conjunct)
  for (const i of st.words) { const w = W[i]!; if (w.k === 'art' && w.unit && !st.has(i) && st.has(w.unit.head)) st.put(i, w.unit.head, 'det', [`'${tokens[i].surface}' is the linking article of '${tokens[w.unit.head].surface}'`], 0.85); }

  // a connecting or reply word alone between punctuation ("Pra," "Po,") has no clause to head: it hangs on the main word
  if (rootHead !== undefined) {
    for (const s of segs) {
      if (s.head !== undefined) continue;
      for (const i of s.words) if (!st.has(i) && W[i]!.c) st.put(i, rootHead, 'discourse', [`'${tokens[i].surface}' is a connecting or reply word standing alone between punctuation`], 0.55);
    }
  }

  // punctuation goes to the head of the clause it closes (or opens)
  if (rootHead !== undefined) {
    tokens.forEach((t, i) => {
      if (t.isWord || !isPunct(t)) return;
      const before = [...segs].filter((s) => s.words[s.words.length - 1] < i && s.head !== undefined).pop();
      const after = segs.find((s) => s.words[0] > i && s.head !== undefined);
      const s = before ?? after;
      st.put(i, s?.head ?? rootHead, 'punct', ['punctuation next to the clause'], 0.9);
    });
  }

  // anything still without a relation is left alone, and said so
  const notes: string[] = [];
  const unattached = st.words.filter((i) => !st.has(i));
  for (const i of unattached) {
    const w = W[i]!;
    notes.push(w.c ? `'${tokens[i].surface}': no rule placed this ${w.k === 'other' ? 'word' : w.k} word, so it has no relation` : `'${tokens[i].surface}': the adapter has no reading for this word, so it has no relation`);
  }
  if (st.words.length > 45) notes.push('long sentence: the rules read it clause by clause and can miss links between distant clauses');
  const attached = st.words.length ? (st.words.length - unattached.length) / st.words.length : 0;

  const clauses: ClauseSpan[] = [];
  for (const s of segs) {
    if (s.head === undefined || !s.groups.length) continue;
    const r = st.rel.get(s.head);
    const kind: ClauseSpan['kind'] = r?.relation === 'root' ? 'main' : r?.relation === 'acl' ? 'relative' : s.mk === 'coord' || r?.relation === 'conj' ? 'coordinate' : s.mk === 'sub' ? 'subordinate' : 'main';
    clauses.push({ start: Math.min(...s.words), end: Math.max(...s.words), kind, ...(s.marker !== undefined ? { marker: s.marker } : {}), label: kind === 'main' ? 'main clause' : kind === 'relative' ? 'relative clause' : kind === 'coordinate' ? 'coordinated clause' : 'subordinate clause' });
  }

  return {
    languageId: 'sq', analyzer: SQ_SYNTAX_ANALYZER, tokens: tokens.map((t) => t.surface),
    relations: [...st.rel.values()].sort((a, b) => a.dependent - b.dependent), clauses, notes, attached,
  };
}
