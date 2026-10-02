/**
 * The subject, wherever it stands, fixes the finite verb (package GC, batch 2), and the relative pronoun takes gender and
 * number from the noun it refers to. The rules, clause by clause (a "field" is the clause plus, when its verb comes right after
 * clauses inserted behind the subject, the fragment in front of them: "Die Kinder, die im Garten spielten, lachten laut"):
 *   1. a nominative-only personal pronoun in the field (ich, du, er, wir, man) is the subject wherever it stands; ihr, sie, es,
 *      Sie are taken only directly in front of or behind the verb (they are not nominative-only);
 *   2. else a noun phrase that can be nominative and agrees in number with the verb is the subject when it is the only
 *      candidate in the field (a name or another nominative pronoun counts as a candidate too, so "Gestern sah Paul Kinder"
 *      stays open); it is narrowed to the nominative and its determiner follows (settlePhrases);
 *   3. two candidates: neither is narrowed in case;
 *   4. a finite verb is first or second person only with its pronoun in the clause, so with no such pronoun a form that is
 *      "1 or 3" or "2 or 3" is third person (the imperative aside; a verb at the head of its clause is left open, a clause
 *      that continues a coordination inherits the subject of the clause before, and when that is unknown stays open);
 *   5. the relative pronoun is the subject of its clause when nothing else can be.
 * Nothing here narrows the case of an undecided phrase and nothing asserts a person the clause does not support.
 */
import {
  addContext, anyLive, applyCells, cellsOf, feat, finiteSlot, has, headWord, isFin, isVerbal, lexicalGender, markDown, matrixFragment, prefer, settle, top, verbFinalClause,
  type C, type Clause, type Phrase, type R, type Sent, type Tok,
} from './context';
import type { DeCell } from './types';

export interface Subj { persons: string[]; numbers: string[]; why: string; tok?: Tok; phrase?: Phrase; kind: 'pronoun' | 'phrase' | 'name' | 'relative' | 'inherited' | 'default' | 'clause' }

const PERSON_NAME: Record<string, string> = { '1': 'first person', '2': 'second person', '3': 'third person' };
const NUMBER_NAME: Record<string, string> = { Sing: 'singular', Plur: 'plural' };
const STRICT = new Set(['ich', 'du', 'er', 'wir', 'man', 'wer']);
const COORDINATORS = new Set(['und', 'oder', 'aber', 'sondern', 'denn']);
const order = (xs: Iterable<string>, ref: readonly string[]): string[] => ref.filter((x) => new Set(xs).has(x));
const joinSet = (xs: string[], ys: string[]): string[] => xs.filter((x) => ys.includes(x));

function subjectText(persons: string[], numbers: string[]): string {
  const p = persons.length === 1 ? PERSON_NAME[persons[0]] : persons.length === 2 ? `${PERSON_NAME[persons[0]]} or ${PERSON_NAME[persons[1]]}` : '';
  const n = numbers.length === 1 ? NUMBER_NAME[numbers[0]] : '';
  return [p, n].filter(Boolean).join(' ');
}

/** A nominative personal pronoun (or man …) as the subject: its person and number, the formal Sie counted as third person plural. */
export function pronounSubject(t: Tok | undefined): Subj | undefined {
  if (!t || !t.word) return undefined;
  // wer and was (question or free relative) in the nominative are third person singular subjects
  const wh = t.raw.normalized === 'wer' || t.raw.normalized === 'was';
  const rs = t.rs.filter((r) => !r.down && r.c.pos === 'PRON' && has(r.c, 'Case', 'Nom')
    && (((has(r.c, 'PronType', 'Prs') || has(r.c, 'PronType', 'Ind')) && r.c.morph.Person) || (wh && (has(r.c, 'PronType', 'Int') || has(r.c, 'PronType', 'Rel')))));
  if (!rs.length) return undefined;
  const persons = new Set<string>();
  const numbers = new Set<string>();
  if (wh) { persons.add('3'); numbers.add('Sing'); }
  for (const r of rs) {
    if (wh) continue;
    if (has(r.c, 'Polite', 'Form')) { persons.add('3'); numbers.add('Plur'); continue; }
    for (const p of feat(r.c, 'Person')) persons.add(p);
    for (const n of feat(r.c, 'Number')) numbers.add(n);
  }
  const P = order(persons, ['1', '2', '3']);
  const N = order(numbers, ['Sing', 'Plur']);
  return { persons: P, numbers: N, why: `the subject ${t.raw.surface}: ${subjectText(P, N) || 'person and number'}`, tok: t, kind: 'pronoun' };
}

const strictPronoun = (t: Tok): boolean => STRICT.has(t.raw.normalized) && !!pronounSubject(t);

/** The finite readings of a token fit a subject when person and number agree; the imperative fits when `keepImperative`. */
function fitsSubject(c: C, sub: Pick<Subj, 'persons' | 'numbers'>, keepImperative: boolean): boolean {
  if (!isVerbal(c) || !isFin(c)) return false;
  if (keepImperative && has(c, 'Mood', 'Imp')) return true;
  const P = feat(c, 'Person');
  const N = feat(c, 'Number');
  return (!P.length || joinSet(P, sub.persons).length > 0) && (!N.length || joinSet(N, sub.numbers).length > 0);
}

/** Keep, in front, the finite readings that agree with the subject; narrow their person and number to what the subject allows. */
function agreeWithSubject(t: Tok, sub: Subj, keepImperative = false): boolean {
  if (!t.rs.some((r) => !r.down && fitsSubject(r.c, sub, keepImperative))) return false;
  prefer(t, (r) => fitsSubject(r.c, sub, keepImperative), sub.why);
  for (const r of t.rs) {
    if (r.down || !r.own || !fitsSubject(r.c, sub, keepImperative) || has(r.c, 'Mood', 'Imp')) continue;
    const P = feat(r.c, 'Person');
    const N = feat(r.c, 'Number');
    const p2 = P.length ? joinSet(P, sub.persons) : P;
    const n2 = N.length ? joinSet(N, sub.numbers) : N;
    if (p2.join() !== P.join() || n2.join() !== N.join()) {
      r.c.morph = { ...r.c.morph };
      if (p2.length) r.c.morph.Person = p2.join(',');
      if (n2.length) r.c.morph.Number = n2.join(',');
      addContext(r, sub.why);
    }
  }
  return true;
}

/** sie kommt / sie kommen: the pronoun's own readings follow the number of the verb. */
function pronounFollowsVerb(sub: Subj, v: Tok): void {
  const t = sub.tok;
  const verb = top(v)?.c;
  if (!t || !verb || !isFin(verb)) return;
  const nums = feat(verb, 'Number');
  if (nums.length !== 1) return;
  const readings = t.rs.filter((r) => !r.down && r.c.pos === 'PRON' && has(r.c, 'Case', 'Nom'));
  if (readings.length < 2) return;
  const fits = (r: R): boolean => {
    if (!(r.c.pos === 'PRON' && has(r.c, 'Case', 'Nom'))) return true;
    if (has(r.c, 'Polite', 'Form')) return nums[0] === 'Plur';
    const n = feat(r.c, 'Number');
    return !n.length || n.includes(nums[0]);
  };
  prefer(t, fits, `agrees with the ${NUMBER_NAME[nums[0]]} verb ${v.raw.surface}`);
}

// ───────────────────────────── the fields ─────────────────────────────

const isCoordinated = (s: Sent, cl: Clause): boolean => cl.lead >= 0 || COORDINATORS.has(s.toks[cl.words[0]].raw.normalized);

/** A noun phrase or a name or another pronoun that could be the subject: the candidates the rule counts. */
function candidates(s: Sent, words: number[], skip: Tok | undefined): { phrases: Phrase[]; others: Tok[] } {
  const phrases: Phrase[] = [];
  const inPhrase = new Set<number>();
  for (const run of s.phrases) {
    if (!words.includes(run.noun.i)) continue;
    for (const m of [run.contraction, run.det, ...run.adjs, run.noun, run.prep]) if (m) inPhrase.add(m.i);
    if (run.prep || run.contraction) continue; // governed: not nominative
    // wie Haremsfrauen, als Kind: a phrase after the comparison word takes the case of what it is compared with, it is no candidate of its own
    const firstOf = run.det ?? run.adjs[0] ?? run.noun;
    if (['wie', 'als'].includes(s.toks[firstOf.i - 1]?.raw.normalized ?? '')) continue;
    const nomCapable = run.noun.rs.some((r) => !r.down && (r.c.pos === 'NOUN' || r.c.notes?.nominalization) && (cellsOf(r) ?? []).some((x) => x.c === 'N'));
    if (nomCapable) phrases.push(run);
  }
  const others: Tok[] = [];
  for (const k of words) {
    const t = s.toks[k];
    if (t === skip || inPhrase.has(k) || !t.word) continue;
    const name = t.cap && anyLive(t, (c) => c.pos === 'PROPN') && !anyLive(t, (c) => c.pos === 'NOUN');
    const pron = anyLive(t, (c) => c.pos === 'PRON' && has(c, 'Case', 'Nom') && !has(c, 'PronType', 'Rel'));
    if (name || pron) others.push(t);
  }
  return { phrases, others };
}

const numbersOf = (r: R): string[] => order(new Set((cellsOf(r) ?? []).filter((x) => x.c === 'N').map((x) => (x.g === 'p' ? 'Plur' : 'Sing'))), ['Sing', 'Plur']);

/** The noun phrase as the subject: its noun narrowed to the nominative and to the numbers the verb allows. */
function narrowToNominative(s: Sent, run: Phrase, nums: string[], verb: string): string[] {
  const noun = run.noun;
  const roles = noun.rs.filter((r) => !r.down && (r.c.pos === 'NOUN' || r.c.notes?.nominalization));
  const keep = (cells: DeCell[]): DeCell[] => cells.filter((x) => x.c === 'N' && (!nums.length || nums.includes(x.g === 'p' ? 'Plur' : 'Sing')));
  const left: string[] = [];
  for (const r of roles) {
    const cells = cellsOf(r) ?? [];
    const k = keep(cells);
    if (!k.length) { markDown(r); continue; }
    if (r.own && k.length !== cells.length) applyCells(r, k, r.c.pos === 'NOUN' ? lexicalGender(s.lex, r.c.lemma) : undefined);
    addContext(r, `the only noun phrase that can be the subject of ${verb}: nominative ${k.every((x) => x.g === 'p') ? 'plural' : k.every((x) => x.g !== 'p') ? 'singular' : ''}`.trim());
    left.push(...numbersOf(r));
  }
  settle(noun);
  return order(new Set(left), ['Sing', 'Plur']);
}

function verbNumbers(t: Tok): string[] {
  const nums = new Set<string>();
  for (const r of t.rs) if (!r.down && isFin(r.c) && !has(r.c, 'Mood', 'Imp')) for (const n of feat(r.c, 'Number')) nums.add(n);
  return order(nums, ['Sing', 'Plur']);
}

/** The relative pronoun that opens the clause (after a preposition at most), if any. */
function relativePronoun(s: Sent, cl: Clause): Tok | undefined {
  if (!/,/.test(cl.open) || !verbFinalClause(s, cl)) return undefined;
  for (const k of cl.words.slice(0, 2)) {
    const t = s.toks[k];
    if (t.rs.some((r) => !r.down && r.c.pos === 'PRON' && has(r.c, 'PronType', 'Rel'))) return t;
  }
  return undefined;
}

function relativeSubject(t: Tok): Subj | undefined {
  const rs = t.rs.filter((r) => !r.down && r.c.pos === 'PRON' && has(r.c, 'PronType', 'Rel') && has(r.c, 'Case', 'Nom'));
  if (!rs.length) return undefined;
  const numbers = order(new Set(rs.flatMap((r) => feat(r.c, 'Number'))), ['Sing', 'Plur']);
  return { persons: ['3'], numbers: numbers.length ? numbers : ['Sing', 'Plur'], why: `the relative pronoun ${t.raw.surface} is the subject: third person`, tok: t, kind: 'relative' };
}

/** A name (or a full name) filling the field in front of the verb: third person singular. */
function nameSubject(s: Sent, cl: Clause, slot: number): Subj | undefined {
  if (slot < 1) return undefined;
  const before = cl.words.slice(0, slot).map((k) => s.toks[k]);
  if (before.length && before.every((t) => t.cap && anyLive(t, (c) => c.pos === 'PROPN') && !anyLive(t, (c) => c.pos === 'NOUN'))) {
    return { persons: ['3'], numbers: ['Sing'], why: `the subject ${before.map((t) => t.raw.surface).join(' ')}: a name, third person singular`, tok: before[before.length - 1], kind: 'name' };
  }
  return undefined;
}

/** Find the subject of the clause's finite verb and let it decide the verb; returns what was found (for the clauses that continue it). */
export function decideSubjects(s: Sent): void {
  const subjAt: Array<Subj | undefined> = [];
  s.clauses.forEach((cl, ci) => {
    const final = verbFinalClause(s, cl);
    const slot = finiteSlot(s, cl);
    if (slot < 0) { subjAt[ci] = undefined; return; }
    const slotTok = s.toks[cl.words[slot]];
    const frag = matrixFragment(s, ci);
    const words = frag >= 0 ? [...s.clauses[frag].words, ...cl.words] : cl.words;
    const rel = relativePronoun(s, cl);
    const w = cl.words;
    let sub: Subj | undefined;

    // 1. a nominative-only pronoun, wherever it stands; else ihr / sie / es / Sie directly next to the verb
    const strict = words.map((k) => s.toks[k]).filter(strictPronoun);
    if (strict.length) {
      const adjacent = strict.find((t) => t.i === w[slot - 1] || t.i === w[slot + 1]);
      sub = pronounSubject(adjacent ?? strict[0]);
    } else if (final) {
      for (let k = 1; k < Math.min(3, w.length - 1); k++) {
        const p = pronounSubject(s.toks[w[k]]);
        if (p) { sub = p; break; }
        if (!anyLive(s.toks[w[k]], (c) => c.pos === 'ADV' || c.pos === 'PART')) break;
      }
    } else {
      sub = pronounSubject(s.toks[w[slot - 1]]) ?? pronounSubject(s.toks[w[slot + 1]]);
    }

    const lead = isCoordinated(s, cl);
    const effective = slot - (COORDINATORS.has(s.toks[w[0]].raw.normalized) && cl.lead < 0 ? 1 : 0);
    // a verb first, as a command (Bring gute Laune mit!), or right after a subject clause (wer keine hat, muss Strafe zahlen): the noun phrase behind it is no subject
    const prevClause = ci > 0 ? s.clauses[ci - 1] : undefined;
    const subjectClauseBefore = slot === 0 && !!prevClause && /,/.test(cl.open) && verbFinalClause(s, prevClause) && ['wer', 'was', 'dass', 'daß', 'ob'].includes(headWord(s, prevClause).raw.normalized);
    const commandHead = slot === 0 && cl.first && !final && s.endMark !== '?' && slotTok.rs.some((r) => !r.down && has(r.c, 'Mood', 'Imp') && isVerbal(r.c));
    // 2./3. a noun phrase, when it is the only candidate (after a coordinating und with the verb right behind it, a noun phrase is the object: the subject is the one before)
    // a verb first after a comma, with no subject of its own and no imperative reading, continues the subject of the clause before (… schloß die Augen, ließ erst ab)
    const asyndetic = !lead && !cl.first && /,/.test(cl.open) && slot === 0 && !final && s.endMark !== '?' && !subjectClauseBefore && frag < 0
      && !!prevClause && !verbFinalClause(s, prevClause) && finiteSlot(s, prevClause) >= 0
      && !slotTok.rs.some((r) => !r.down && has(r.c, 'Mood', 'Imp') && isVerbal(r.c));
    let own = !!sub || subjectClauseBefore;
    if (!sub && !(lead && effective === 0) && !asyndetic && !subjectClauseBefore && !commandHead) {
      // wer is nominative only, so it counts as a candidate; der / die / das (relative) are not nominative only and do not
      const { phrases, others } = candidates(s, words, rel && rel.raw.normalized !== 'wer' ? rel : undefined);
      own = phrases.length + others.length > 0;
      const vn = verbNumbers(slotTok);
      const agreeing = phrases.filter((run) => !vn.length || joinSet(order(new Set(run.noun.rs.filter((r) => !r.down).flatMap(numbersOf)), ['Sing', 'Plur']), vn).length > 0);
      if (others.length === 0 && agreeing.length === 1) {
        const run = agreeing[0];
        const nums = narrowToNominative(s, run, vn, slotTok.raw.surface);
        sub = { persons: ['3'], numbers: nums.length ? nums : vn.length ? vn : ['Sing', 'Plur'], why: `the subject ${run.noun.raw.surface}: ${nums.length === 1 ? `${NUMBER_NAME[nums[0]]} ` : ''}noun phrase, third person`, tok: run.noun, phrase: run, kind: 'phrase' };
      } else {
        sub = nameSubject(s, cl, slot);
        if (sub) own = true;
      }
      if (!sub && rel && !own) sub = relativeSubject(rel);
    }

    // 4. no pronoun for the first or second person: third person; a coordinated clause shares the subject before it
    if (!sub) {
      if (subjectClauseBefore && !own) {
        sub = undefined;
      } else if (subjectClauseBefore) {
        // Wer das sagt, lügt. Dass er kommt, freut mich.: the clause before is the subject, third person singular
        sub = { persons: ['3'], numbers: ['Sing'], why: `the clause before (${s.toks[headWord(s, prevClause as Clause).i].raw.surface} …) is the subject: third person singular`, kind: 'clause' };
      } else if ((lead || asyndetic) && !own) {
        // the nearest clause before that has a finite verb of its own and is no subordinate clause (an infinitive clause with um … zu has none)
        let prev: Subj | undefined;
        for (let j = ci - 1; j >= 0; j--) {
          const cj = s.clauses[j];
          if (verbFinalClause(s, cj) || finiteSlot(s, cj) < 0) continue;
          prev = subjAt[j];
          break;
        }
        if (prev) sub = { ...prev, why: `the subject is shared with the clause before, across ${lead ? s.toks[cl.lead >= 0 ? cl.lead : w[0]].raw.surface : 'the comma'} (${prev.why})`, kind: 'inherited' };
      } else if (own && effective > 0 && frag < 0 && !words.some((k) => s.toks[k].raw.normalized === 'ihr' && anyLive(s.toks[k], (c) => c.pos === 'PRON' && has(c, 'Case', 'Nom')))) {
        sub = { persons: ['3'], numbers: ['Sing', 'Plur'], why: 'no ich, wir, du or ihr in the clause: a finite verb is first or second person only with its pronoun, so third person', kind: 'default' };
      }
    }
    subjAt[ci] = sub;
    if (!sub) return;
    if (agreeWithSubject(slotTok, sub, sub.kind === 'default')) {
      const st = sub.tok;
      // Ihr kommt: the pronoun next to its finite verb is the nominative one
      if (sub.kind === 'pronoun' && st && st.rs.some((r) => !r.down && r.c.pos === 'PRON' && has(r.c, 'Case', 'Nom'))) prefer(st, (r) => r.c.pos === 'PRON' && has(r.c, 'Case', 'Nom'), `the subject of ${slotTok.raw.surface}`);
      if (sub.kind === 'pronoun') pronounFollowsVerb(sub, slotTok);
    }
  });
}

// ───────────────────────────── the relative pronoun ─────────────────────────────

const gKeys = (rs: R[]): Set<string> => new Set(rs.flatMap((r) => (cellsOf(r) ?? []).map((x) => x.g)));

/** The relative pronoun takes gender and number (never case) from the noun it refers to. */
export function decideRelatives(s: Sent): void {
  s.clauses.forEach((cl, ci) => {
    const t = relativePronoun(s, cl);
    if (!t || t.frozen || ci === 0) return;
    const mine = t.rs.filter((r) => !r.down && r.c.pos === 'PRON' && has(r.c, 'PronType', 'Rel') && cellsOf(r));
    if (!mine.length) return;
    const myG = gKeys(mine);
    const prevWords = new Set(s.clauses[ci - 1].words);
    const cands = s.phrases.filter((run) => prevWords.has(run.noun.i)).sort((a, b) => b.noun.i - a.noun.i).slice(0, 2);
    const agreeing = cands.filter((run) => {
      const g = gKeys(run.noun.rs.filter((r) => !r.down && (r.c.pos === 'NOUN' || r.c.notes?.nominalization)));
      return [...g].some((x) => myG.has(x));
    });
    if (!agreeing.length) return;
    const allowed = new Set<string>();
    for (const run of agreeing) for (const g of gKeys(run.noun.rs.filter((r) => !r.down && (r.c.pos === 'NOUN' || r.c.notes?.nominalization)))) allowed.add(g);
    const names = agreeing.map((r) => r.noun.raw.surface).join(' or ');
    for (const r of mine) {
      const cells = cellsOf(r) as DeCell[];
      const k = cells.filter((x) => allowed.has(x.g));
      if (!k.length || k.length === cells.length || !r.own) continue;
      applyCells(r, k);
      addContext(r, `relative pronoun: gender and number come from its antecedent ${names}, the case from its job in its own clause`);
    }
    const left = t.rs.filter((r) => !r.down && r.c.pos === 'PRON' && has(r.c, 'PronType', 'Rel'));
    void left;
  });
}
