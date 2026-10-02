/**
 * The noun phrase (package GC, step 2): [preposition or contraction]? [determiner]? [adjective]* noun. The cells (case,
 * gender, number) of its members are intersected; the adjective's declension follows from the determiner (weak after
 * der / dieser / jeder, mixed after ein / kein / mein, strong with none); a preposition restricts the case to what it
 * governs. The narrowed result is written back into every member. When the intersection is EMPTY (a learner's mistake,
 * a word the list lacks) every member stays as the engine gave it: agreement is never forced. What the sentence does not
 * decide stays a union: "Die Frau sieht die Tochter" leaves both nouns "nominative or accusative".
 */
import type { DeCase, DeCell, DeLexiconView } from './types';
import {
  addNote, anyLive, applyCells, cellsOf, demote, has, isVerbal, lexicalGender, finiteSlot, markDown, norm, pairKey, prefer, settle, top,
  verbFinalClause, matrixFragment, replaceContext, type Phrase, type R, type Sent, type Tok,
} from './context';

type Decl = 'st' | 'wk' | 'mx';
type Role = 'det' | 'adj' | 'noun';

const CASE_NAME: Record<DeCase, string> = { N: 'nominative', A: 'accusative', D: 'dative', G: 'genitive' };
const GENDER_NAME = { m: 'masculine', f: 'feminine', n: 'neuter' } as const;

/** "masculine accusative singular", "dative plural", "nominative or accusative" … as plain words. */
export function describeCells(cells: readonly DeCell[]): string {
  const cases = (['N', 'A', 'D', 'G'] as const).filter((c) => cells.some((x) => x.c === c)).map((c) => CASE_NAME[c]);
  const genders = (['m', 'f', 'n'] as const).filter((g) => cells.some((x) => x.g === g)).map((g) => GENDER_NAME[g]);
  const sing = cells.some((x) => x.g !== 'p');
  const plur = cells.some((x) => x.g === 'p');
  const num = sing && plur ? '' : sing ? 'singular' : plur ? 'plural' : '';
  return [genders.length === 3 ? '' : genders.join(' or '), cases.join(' or '), num].filter(Boolean).join(' ');
}

const casesText = (keys: ReadonlySet<string>): string => (['N', 'A', 'D', 'G'] as const).filter((c) => [...keys].some((k) => k[0] === c)).map((c) => CASE_NAME[c]).join(' or ');

/** Words that may stand between the determiner and the adjective without belonging to either (ein sehr guter Mann). */
const TRANSPARENT = new Set(['sehr', 'besonders', 'ziemlich', 'recht', 'wirklich', 'äußerst', 'so', 'überaus', 'höchst', 'extrem', 'total', 'richtig', 'unglaublich', 'wunderbar']);
/** Prepositions that may also follow their noun; the case after them is not claimed. */
const MAYBE_POSTPOSITION = new Set(['entlang', 'gegenüber', 'zuliebe', 'entgegen', 'halber']);

function declOf(lex: DeLexiconView, t: Tok, r: R): Decl | undefined {
  return lex.closed(t.raw.normalized).find((f) => f.lemma === r.c.lemma && f.pos === r.c.pos && f.governsDecl)?.governsDecl;
}

function roleReadings(t: Tok, role: Role): R[] {
  const rs = t.rs.filter((r) => !r.down && cellsOf(r));
  if (role === 'noun') return rs.filter((r) => r.c.pos === 'NOUN' || (r.c.pos === 'ADJ' && !!r.c.notes?.nominalization));
  if (role === 'adj') return rs.filter((r) => r.c.pos === 'ADJ' || (isVerbal(r.c) && r.c.morph.VerbForm === 'Part'));
  const dets = rs.filter((r) => r.c.pos === 'DET');
  if (dets.length) return dets;
  const pron = rs.filter((r) => r.c.pos === 'PRON' && (has(r.c, 'PronType', 'Dem') || has(r.c, 'PronType', 'Ind') || has(r.c, 'PronType', 'Int'))
    && !has(r.c, 'PronType', 'Rel') && !has(r.c, 'PronType', 'Prs'));
  if (pron.length) return pron;
  return rs.filter((r) => r.c.pos === 'NUM');
}

type Run = Phrase;

/** The parts of a reading's context this step writes (and writes anew when the phrase is settled again). */
const MY_CONTEXT = /^(after |agrees with |the phrase does not fit|at the start of a clause|in the pre-field|\S+ takes a dative object|\S+ = \S+ \+ )/;

const unitBound = (t: Tok): boolean => !!top(t)?.c.unit;

/** The members of the noun phrase that ends at `noun`, found by looking left. */
function runAt(s: Sent, noun: Tok): Run {
  const run: Run = { adjs: [], noun };
  let j = noun.i - 1;
  let leftmost = noun.i;
  const idxs: Tok[] = [];
  const word = (k: number): Tok | undefined => (k >= 0 && s.toks[k].word ? s.toks[k] : undefined);
  for (let guard = 0; guard < 8 && j >= 0; guard++) {
    const t = s.toks[j];
    if (!t.word) {
      // a comma between two adjectives (der große, starke Mann)
      const before = word(j - 1);
      if (t.raw.surface === ',' && before && roleReadings(before, 'adj').length && !roleReadings(before, 'det').length) { j--; continue; }
      break;
    }
    // a cardinal number between the determiner or preposition and the noun belongs to neither (um sieben Uhr, die zwei Männer)
    if (anyLive(t, (c) => c.pos === 'NUM') && !anyLive(t, (c) => c.pos === 'DET') && !s.lex.contraction(t.raw.normalized)) { leftmost = t.i; run.numeral = true; j--; continue; }
    const isAdj = roleReadings(t, 'adj').length > 0;
    const isDet = roleReadings(t, 'det').length > 0;
    if (s.lex.contraction(t.raw.normalized) && anyLive(t, (c) => c.pos === 'ADP')) { run.contraction = t; break; }
    if (isAdj && !isDet) { idxs.unshift(t); j--; continue; }
    if (isDet && !isAdj) { run.det = t; break; }
    if (isAdj && isDet) {
      // viele, andere, ganze …: a determiner when nothing determiner-like stands left of it, else an adjective
      const left = word(j - 1);
      if (left && roleReadings(left, 'det').length && !s.lex.contraction(left.raw.normalized)) { idxs.unshift(t); j--; continue; }
      run.det = t; break;
    }
    if (TRANSPARENT.has(t.raw.normalized) && t.rs.some((r) => r.c.pos === 'ADV')) { idxs.unshift(t); j--; continue; }
    break;
  }
  while (idxs.length && !roleReadings(idxs[0], 'adj').length) idxs.shift();
  run.adjs = idxs.filter((t) => roleReadings(t, 'adj').length > 0);
  // the preposition stands directly in front of the determiner or of the first adjective
  if (!run.contraction) {
    const first = run.det ?? idxs[0] ?? noun;
    const p = s.toks[Math.min(first.i, leftmost) - 1];
    if (p && p.word && !unitBound(p) && s.lex.preposition(p.raw.normalized) && anyLive(p, (c) => c.pos === 'ADP')) run.prep = p;
  }
  return run;
}

function contractionCells(lex: DeLexiconView, t: Tok): DeCell[] {
  const con = lex.contraction(t.raw.normalized);
  if (!con) return [];
  const art = lex.closed(norm(con.article)).find((f) => f.pos === 'DET' && f.lemma === 'der');
  return (art?.cells ?? [con.cell]).filter((x) => x.c === con.cell.c).map((x) => ({ ...x }));
}

function surfaces(ts: Tok[]): string {
  const sorted = [...ts].sort((a, b) => a.i - b.i);
  if (sorted.length === 1) return sorted[0].raw.surface;
  const adjacent = sorted.every((t, k) => k === 0 || t.i === sorted[k - 1].i + 1);
  return adjacent ? sorted.map((t) => t.raw.surface).join(' ') : `${sorted[0].raw.surface} … ${sorted[sorted.length - 1].raw.surface}`;
}

function agree(s: Sent, run: Run): void {
  const lex = s.lex;
  const members: Tok[] = [...(run.contraction ? [run.contraction] : []), ...(run.det ? [run.det] : []), ...run.adjs, run.noun];
  if (members.length < 2 && !run.prep) return;
  // the declension the adjectives take
  let decl: Decl = 'st';
  if (run.contraction) decl = 'wk';
  else if (run.det) {
    const det = run.det;
    decl = roleReadings(det, 'det').map((r) => declOf(lex, det, r)).find((d) => d) ?? 'st';
  }
  // the cells each member allows
  const roleOf = (t: Tok): Role => (t === run.noun ? 'noun' : t === run.det || t === run.contraction ? 'det' : 'adj');
  const allows = new Map<Tok, Map<R, DeCell[]>>();
  for (const t of members) {
    const m = new Map<R, DeCell[]>();
    if (t === run.contraction) {
      const cc = contractionCells(lex, t);
      for (const r of t.rs.filter((x) => !x.down && x.c.pos === 'ADP')) m.set(r, cc);
    } else {
      for (const r of roleReadings(t, roleOf(t))) {
        let cells = cellsOf(r) as DeCell[];
        if (roleOf(t) === 'adj' || r.c.pos === 'ADJ' || cells.some((x) => x.decl)) {
          const withDecl = cells.filter((x) => x.decl);
          if (withDecl.length) cells = withDecl.filter((x) => x.decl === decl);
        }
        m.set(r, cells);
      }
    }
    allows.set(t, m);
  }
  let allowed: Set<string> | undefined;
  for (const m of allows.values()) {
    const u = new Set<string>();
    for (const cells of m.values()) for (const x of cells) u.add(pairKey(x));
    allowed = allowed ? new Set([...allowed].filter((k) => u.has(k))) : u;
  }
  if (!allowed || allowed.size === 0) return;
  // what a rule decided about the case of the whole phrase is remembered, so that settling the phrase again keeps saying why
  const reasons = run.reasons ?? (run.reasons = []);
  const remember = (x: string): void => { if (!reasons.includes(x)) reasons.push(x); };
  // a noun phrase that opens a clause is not genitive when another case fits: a genitive attribute follows its noun (Der Lehrer liest …)
  if (!run.prep && !run.contraction && opensMainClause(s, run)) {
    const noGen = new Set([...allowed].filter((k) => k[0] !== 'G'));
    if (noGen.size > 0 && noGen.size < allowed.size) { allowed = noGen; remember('at the start of a clause a noun phrase is not genitive (a genitive attribute follows its noun)'); }
  }
  // the pre-field holds one constituent: a noun phrase that follows another noun phrase before the finite verb is its genitive attribute
  if (!run.prep && !run.contraction && inPrefieldAfterNoun(s, run)) {
    const gen = new Set([...allowed].filter((k) => k[0] === 'G'));
    if (gen.size > 0 && gen.size < allowed.size) { allowed = gen; remember('in the pre-field one constituent stands: a noun phrase that follows another noun phrase there is its genitive attribute'); }
  }
  // a case a later step decided for the whole phrase (the dative object of a verb that takes the dative)
  if (run.force) {
    const forced = new Set([...allowed].filter((k) => run.force?.cases.includes(k[0] as DeCase)));
    if (forced.size > 0 && forced.size < allowed.size) { allowed = forced; remember(run.force.why); }
  }
  let prepNote: string | undefined;
  /** The phrase agrees among itself but not with what the preposition governs (a learner's mistake: mit den Mann). */
  let conflict: { prep: string; text: string } | undefined;
  // bis Montag ist: before a bare noun, a word that is also a conjunction governs nothing unless the noun ends the clause
  const bareAfterConjunction = !!run.prep && members.length === 1 && !run.numeral && anyLive(run.prep, (c) => c.pos === 'SCONJ' || c.pos === 'CONJ')
    && s.clauses[s.clauseOf[run.noun.i]]?.words.slice(-1)[0] !== run.noun.i;
  if (run.prep && !bareAfterConjunction) {
    const info = lex.preposition(run.prep.raw.normalized);
    // um seines Namens willen: um … willen takes the genitive, whatever um governs alone
    const circumposition = run.prep.raw.normalized === 'um' && s.toks[run.noun.i + 1]?.raw.normalized === 'willen';
    const cases = info && !circumposition && !MAYBE_POSTPOSITION.has(run.prep.raw.normalized) ? info.cases : undefined;
    if (cases) {
      const restricted = new Set([...allowed].filter((k) => cases.includes(k[0] as DeCase)));
      if (restricted.size) {
        allowed = restricted;
        prepNote = `after ${run.prep.raw.surface}: ${casesText(allowed)}`;
      } else if (!anyLive(run.prep, (c) => c.pos === 'SCONJ' || c.pos === 'CONJ' || c.pos === 'ADV')) {
        // the phrase agrees among itself (allowed is not empty) but not with the preposition: keep the agreement, say the preposition does not fit
        conflict = { prep: run.prep.raw.surface, text: `${run.prep.raw.surface} takes the ${[...new Set(cases)].map((c) => CASE_NAME[c]).join(' or ')}` };
      }
    }
  }
  const fin = allowed;
  // seit einem Jahr, während des Tages: a word that is also a conjunction is the preposition when a noun phrase in its case follows
  if (run.prep && prepNote && (members.length > 1 || run.numeral) && !run.prep.frozen) prefer(run.prep, (r) => r.c.pos === 'ADP', `before a noun phrase in the case it governs (${casesText(fin)}): the preposition`);
  // bis Montag, seit Montag: a bare noun that ends its clause after such a word makes it a preposition (a conjunction needs a verb after it)
  if (run.prep && prepNote && members.length === 1 && !run.numeral && !run.prep.frozen) {
    const cl = s.clauses[s.clauseOf[run.noun.i]];
    if (cl && cl.words[cl.words.length - 1] === run.noun.i) prefer(run.prep, (r) => r.c.pos === 'ADP', `before a noun that ends the clause, in the case it governs (${casesText(fin)}): the preposition`);
  }
  const gender = lexicalGender(lex, top(run.noun)?.c.lemma);
  for (const t of members) {
    if (t.frozen) continue;
    const role = roleOf(t);
    const m = allows.get(t) as Map<R, DeCell[]>;
    const partners = surfaces(members.filter((x) => x !== t));
    for (const [r, cells] of m) {
      const narrowed = cells.filter((x) => fin.has(pairKey(x)));
      if (!narrowed.length) { if (!r.down) markDown(r); continue; }
      const before = cellsOf(r) as DeCell[];
      const changed = narrowed.length !== before.length;
      const why: string[] = [];
      for (const x of reasons) why.push(x);
      if (prepNote) why.push(prepNote);
      const carrier = run.det ?? run.contraction ?? run.noun;
      if (conflict && (t === run.det || t === run.noun)) why.push(`the phrase does not fit the case after ${conflict.prep}: ${conflict.text}, but ${surfaces(members)} is ${describeCells(narrowed)}`);
      if (members.length > 1 && t !== run.contraction) why.push(`agrees with ${partners}: ${describeCells(narrowed)}`);
      if (t === run.contraction) {
        const con = lex.contraction(t.raw.normalized);
        if (con) why.push(`${t.raw.surface} = ${con.preposition} + ${con.article}: ${describeCells(narrowed)}`);
        replaceContext(r, why, MY_CONTEXT);
        continue;
      }
      if (r.own && changed) applyCells(r, narrowed, role === 'noun' ? gender : undefined);
      if (conflict && t === carrier) addNote(r.c, 'governmentConflict', run.prep ? (lex.preposition(run.prep.raw.normalized)?.form ?? norm(conflict.prep)) : conflict.prep);
      replaceContext(r, why, MY_CONTEXT);
    }
    // readings of the member that cannot be part of the phrase move behind it
    if (t !== run.contraction && (members.length > 1 || run.prep)) {
      const inRole = new Set(m.keys());
      const why = role === 'det' ? 'an article or pronoun before a noun phrase' : role === 'adj' ? 'an adjective before a noun' : 'a noun in a noun phrase';
      if (!demote(t, (r) => !inRole.has(r), why)) settle(t);
    } else settle(t);
  }
}

/** Does this phrase follow another noun phrase inside the pre-field of a main clause (in front of the finite verb)? */
function inPrefieldAfterNoun(s: Sent, run: Run): boolean {
  const first = run.det ?? run.adjs[0] ?? run.noun;
  const prev = s.toks[first.i - 1];
  if (!prev || !prev.word || !roleReadings(prev, 'noun').length) return false;
  const ci = s.clauseOf[first.i];
  if (ci < 0 || ci !== s.clauseOf[prev.i]) return false;
  const cl = s.clauses[ci];
  if (verbFinalClause(s, cl)) return false;
  const slot = finiteSlot(s, cl);
  if (slot >= 0) return cl.words.indexOf(run.noun.i) < slot;
  return s.clauses.some((_, k) => matrixFragment(s, k) === ci);
}

/** Does this phrase open a main clause (its verb comes after it, or after the clauses inserted behind it)? */
function opensMainClause(s: Sent, run: Run): boolean {
  const first = run.det ?? run.adjs[0] ?? run.noun;
  const ci = s.clauseOf[first.i];
  const cl = s.clauses[ci];
  if (!cl || cl.words[0] !== first.i || verbFinalClause(s, cl)) return false;
  if (finiteSlot(s, cl) >= 1) return true;
  // Die Kinder, die im Garten spielten, lachten: the fragment in front of the inserted clause
  return s.clauses.some((_, k) => matrixFragment(s, k) === ci);
}

/** Settle every noun phrase again with the cells its members have now: what narrowed one member narrows all of them. */
export function settlePhrases(s: Sent): void {
  for (const run of s.phrases) agree(s, run);
}

/** Run the noun-phrase step over a sentence. */
export function agreeNounPhrases(s: Sent): void {
  s.phrases = [];
  const seen = new Set<number>();
  for (const t of s.toks) {
    if (!t.word || seen.has(t.i)) continue;
    if (!roleReadings(t, 'noun').length) continue;
    const run = runAt(s, t);
    for (const m of [run.contraction, run.det, ...run.adjs, run.noun]) if (m) seen.add(m.i);
    // a word that stood alone as a noun (Andere, a nominalised adjective) and is now the adjective of this phrase is not a phrase of its own
    s.phrases = s.phrases.filter((p) => ![run.det, run.contraction, ...run.adjs].includes(p.noun));
    s.phrases.push(run);
    agree(s, run);
  }
}
