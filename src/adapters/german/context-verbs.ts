/**
 * Verb forms in their clause (package GC, step 4). What the neighbours decide is decided; the rest stays a union.
 *  - a subject pronoun fixes person and number of the finite verb (ich → 1 Sing, er / sie / es / man → 3 Sing, wir → 1 Plur,
 *    ihr → 2 Plur, sie / Sie with a plural verb → 3 Plur); a plural or singular noun phrase that fills the whole field in
 *    front of the verb does the same;
 *  - the verb in the finite position (second in a main clause, last in a subordinate one) is finite, and where another
 *    reading of a word elsewhere in the clause is not finite (an infinitive, a participle, an adjective) that is the reading;
 *  - at the end of a clause with a modal or werden, or after zu, it is the infinitive; with haben / sein it is the participle
 *    (with werden, where infinitive and participle are spelled alike, it stays open);
 *  - a verb-first clause with no subject after it is the imperative;
 *  - sein, werden and the modal verbs are auxiliaries (pos AUX) always, haben only when a participle of its clause depends on it.
 * Nothing is guessed: a reading that no neighbour decides stays where the engine put it.
 */
import {
  addContext, addNote, anyLive, markDown, feat, finiteSlot, has, isFin, isInf, isNounLike, isPart, isVerbal, prefer, settle, top, verbFinalClause,
  type C, type Clause, type R, type Sent, type Tok,
} from './context';

const MODALS = new Set(['können', 'müssen', 'wollen', 'sollen', 'dürfen', 'mögen', 'möchten']);
const COORDINATORS = new Set(['und', 'oder', 'aber', 'sondern']);

const PERSON_NAME: Record<string, string> = { '1': 'first person', '2': 'second person', '3': 'third person' };
const NUMBER_NAME: Record<string, string> = { Sing: 'singular', Plur: 'plural' };

interface Subj { persons: string[]; numbers: string[]; why: string; tok: Tok }

const order = (xs: Iterable<string>, ref: readonly string[]): string[] => ref.filter((x) => new Set(xs).has(x));

function subjectText(persons: string[], numbers: string[]): string {
  const p = persons.length === 1 ? PERSON_NAME[persons[0]] : persons.length === 2 ? `${PERSON_NAME[persons[0]]} or ${PERSON_NAME[persons[1]]}` : '';
  const n = numbers.length === 1 ? NUMBER_NAME[numbers[0]] : '';
  return [p, n].filter(Boolean).join(' ');
}

/** A nominative personal pronoun (or man, jemand …) as the subject: its person and number, the formal Sie counted as third person plural. */
function pronounSubject(t: Tok | undefined): Subj | undefined {
  if (!t || !t.word) return undefined;
  const rs = t.rs.filter((r) => !r.down && r.c.pos === 'PRON' && has(r.c, 'Case', 'Nom') && (has(r.c, 'PronType', 'Prs') || has(r.c, 'PronType', 'Ind')) && r.c.morph.Person);
  if (!rs.length) return undefined;
  const persons = new Set<string>();
  const numbers = new Set<string>();
  for (const r of rs) {
    if (has(r.c, 'Polite', 'Form')) { persons.add('3'); numbers.add('Plur'); continue; }
    for (const p of feat(r.c, 'Person')) persons.add(p);
    for (const n of feat(r.c, 'Number')) numbers.add(n);
  }
  const P = order(persons, ['1', '2', '3']);
  const N = order(numbers, ['Sing', 'Plur']);
  return { persons: P, numbers: N, why: `the subject ${t.raw.surface}: ${subjectText(P, N) || 'person and number'}`, tok: t };
}

/** The noun phrase that fills the whole field in front of the finite verb: its head noun's number, when the sentence has settled it. */
function nounSubject(s: Sent, cl: Clause, slot: number): Subj | undefined {
  if (slot < 1 || verbFinalClause(s, cl)) return undefined;
  // a name (or a full name) fills the field in front of the verb: third person singular
  const before = cl.words.slice(0, slot).map((k) => s.toks[k]);
  if (before.length && before.every((t) => t.cap && anyLive(t, (c) => c.pos === 'PROPN') && !anyLive(t, (c) => c.pos === 'NOUN'))) {
    return { persons: ['3'], numbers: ['Sing'], why: `the subject ${before.map((t) => t.raw.surface).join(' ')}: a name, third person singular`, tok: before[before.length - 1] };
  }
  const head = s.toks[cl.words[slot - 1]];
  if (!head.cap || !anyLive(head, (c) => c.pos === 'NOUN')) return undefined;
  // everything in front of the verb must be this noun phrase: determiner / adjectives / noun, nothing else
  for (let w = 0; w < slot - 1; w++) {
    const t = s.toks[cl.words[w]];
    if (!anyLive(t, (c) => c.pos === 'DET' || c.pos === 'ADJ' || (isVerbal(c) && has(c, 'VerbForm', 'Part')))) return undefined;
  }
  const rs = head.rs.filter((r) => !r.down && r.c.pos === 'NOUN');
  if (!rs.every((r) => has(r.c, 'Case', 'Nom'))) return undefined;
  const numbers = new Set(rs.flatMap((r) => feat(r.c, 'Number')));
  if (numbers.size !== 1) return undefined;
  const n = [...numbers][0];
  return { persons: ['3'], numbers: [n], why: `the subject ${head.raw.surface}: ${NUMBER_NAME[n]} noun, third person`, tok: head };
}

/** A relative pronoun that can be the subject of its clause: the verb is third person (a pronoun subject elsewhere in the clause was looked for first). */
function relativeSubject(t: Tok | undefined): Subj | undefined {
  if (!t || !t.word) return undefined;
  const rs = t.rs.filter((r) => !r.down && r.c.pos === 'PRON' && has(r.c, 'PronType', 'Rel') && has(r.c, 'Case', 'Nom'));
  if (!rs.length) return undefined;
  const numbers = order(new Set(rs.flatMap((r) => feat(r.c, 'Number'))), ['Sing', 'Plur']);
  return { persons: ['3'], numbers: numbers.length ? numbers : ['Sing', 'Plur'], why: `the relative pronoun ${t.raw.surface} is the subject: third person`, tok: t };
}

function findSubject(s: Sent, cl: Clause, slot: number): Subj | undefined {
  const w = cl.words;
  if (verbFinalClause(s, cl)) {
    // dass ich …, weil er …: the pronoun directly after the conjunction (or after one more small word)
    for (let k = 1; k < Math.min(3, w.length - 1); k++) {
      const sub = pronounSubject(s.toks[w[k]]);
      if (sub) return sub;
      if (!anyLive(s.toks[w[k]], (c) => c.pos === 'ADV' || c.pos === 'PART')) break;
    }
    return relativeSubject(s.toks[w[0]]);
  }
  if (slot < 0) return undefined;
  return pronounSubject(s.toks[w[slot - 1]]) ?? pronounSubject(s.toks[w[slot + 1]]) ?? nounSubject(s, cl, slot);
}

const joinSet = (xs: string[], ys: string[]): string[] => xs.filter((x) => ys.includes(x));

/** Keep, in front, the finite readings that agree with the subject; narrow their person and number to what the subject allows. */
function agreeWithSubject(t: Tok, sub: Subj): boolean {
  const fits = (c: C): boolean => {
    if (!isVerbal(c) || !isFin(c)) return false;
    const P = feat(c, 'Person');
    const N = feat(c, 'Number');
    return (!P.length || joinSet(P, sub.persons).length > 0) && (!N.length || joinSet(N, sub.numbers).length > 0);
  };
  if (!t.rs.some((r) => !r.down && fits(r.c))) return false;
  prefer(t, (r) => fits(r.c), sub.why);
  for (const r of t.rs) {
    if (r.down || !r.own || !fits(r.c)) continue;
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
  if (!verb || !isFin(verb)) return;
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

const lemmaOfSlot = (t: Tok | undefined): string[] => (t ? [...new Set(t.rs.filter((r) => !r.down && isFin(r.c) && r.c.lemma).map((r) => r.c.lemma as string))] : []);

function decideClause(s: Sent, cl: Clause): void {
  const w = cl.words;
  const final = verbFinalClause(s, cl);
  const slot = finiteSlot(s, cl);
  const slotTok = slot >= 0 ? s.toks[w[slot]] : undefined;

  // ── the finite verb and its subject
  let subject: Subj | undefined;
  if (slotTok) {
    subject = findSubject(s, cl, slot);
    if (subject) {
      if (agreeWithSubject(slotTok, subject)) {
        const st = subject.tok;
        // Ihr kommt: the pronoun in front of its finite verb is the nominative one
        if (st.rs.some((r) => !r.down && r.c.pos === 'PRON' && has(r.c, 'Case', 'Nom'))) prefer(st, (r) => r.c.pos === 'PRON' && has(r.c, 'Case', 'Nom'), `the subject of ${slotTok.raw.surface}`);
        pronounFollowsVerb(subject, slotTok);
      }
    } else if (slot === 0 && cl.first && !final && s.endMark !== '?') {
      // verb first, no subject after it: a command (Komm doch mal her! Gib mir das Buch.)
      const isCommand = (r: R): boolean => isVerbal(r.c) && has(r.c, 'Mood', 'Imp');
      const nx = s.toks[w[1]];
      const subjectFollows = !!pronounSubject(nx);
      if (!subjectFollows && slotTok.rs.some((r) => !r.down && isCommand(r))) prefer(slotTok, isCommand, 'a verb first with no subject after it: a command');
    }
  }

  // ── infinitive and participle
  const aux = lemmaOfSlot(slotTok);
  const modal = aux.some((l) => MODALS.has(l));
  const werden = aux.includes('werden');
  const perfect = aux.includes('haben') || aux.includes('sein');
  for (let k = 0; k < w.length; k++) {
    const t = s.toks[w[k]];
    const after = k > 0 ? s.toks[w[k - 1]] : undefined;
    const endish = k === w.length - 1 || (final && k === w.length - 2);
    const hasInf = t.rs.some((r) => !r.down && isInf(r.c));
    const hasPart = t.rs.some((r) => !r.down && isPart(r.c));
    if (after && after.raw.normalized === 'zu' && hasInf) {
      prefer(t, (r) => isInf(r.c), 'after zu: the infinitive');
      continue;
    }
    if (!endish || k === slot) continue;
    if (modal && hasInf) prefer(t, (r) => isInf(r.c), `with the modal verb ${s.toks[w[slot]].raw.surface} at the end of the clause: the infinitive`);
    else if (perfect && hasPart) prefer(t, (r) => isPart(r.c), `with ${s.toks[w[slot]].raw.surface} at the end of the clause: the past participle`);
    else if (werden && hasPart && !hasInf) prefer(t, (r) => isPart(r.c), `with ${s.toks[w[slot]].raw.surface}: the past participle`);
    else if (werden && hasInf && !hasPart) prefer(t, (r) => isInf(r.c), `with ${s.toks[w[slot]].raw.surface} at the end of the clause: the infinitive`);
  }
  // ── words that are not in the finite position: where another reading is not finite, that is the reading
  if (slotTok) {
    for (let k = 0; k < w.length; k++) {
      if (k === slot) continue;
      const t = s.toks[w[k]];
      if (!t.word) continue;
      const prevTok = k > 0 ? s.toks[w[k - 1]] : undefined;
      if (prevTok && COORDINATORS.has(prevTok.raw.normalized)) continue; // wir essen und trinken: a second finite verb
      if (cl.lead >= 0 && k === 0) continue;
      if (t.rs.some((r) => !r.down && isFin(r.c)) && t.rs.some((r) => !r.down && !isFin(r.c))) {
        // the word is the finite verb of the clause only in the finite position
        const preferNonFinite = prefer(t, (r) => !isFin(r.c), 'not in the position of the finite verb');
        void preferNonFinite;
      }
    }
  }

  // wir gehen nach Hause / sie gehen: an infinitive-looking form in the finite position with no subject word stays as it was
}

// ───────────────────────────── auxiliaries and their roles ─────────────────────────────

const ALWAYS_AUX = new Set(['sein', 'werden', ...MODALS]);
const WUERDE = new Set(['würde', 'würdest', 'würden', 'würdet']);

function labelAuxiliaries(s: Sent): void {
  for (const cl of s.clauses) {
    const final = verbFinalClause(s, cl);
    const slot = finiteSlot(s, cl);
    for (let k = 0; k < cl.words.length; k++) {
      const t = s.toks[cl.words[k]];
      if (!t.own) continue;
      for (const r of t.rs) {
        const lemma = r.c.lemma;
        if (r.c.pos !== 'VERB' || !lemma || r.c.unit) continue;
        if (ALWAYS_AUX.has(lemma)) r.c.pos = 'AUX';
      }
      // ist gebaut worden: worden is the passive auxiliary of the participle before it
      if (top(t) && isPart(top(t)?.c) && top(t)?.c.lemma === 'werden') {
        const before = cl.words.slice(0, k).map((x) => s.toks[x]).reverse().find((p) => isPart(top(p)?.c) && top(p)?.c.lemma !== 'werden');
        if (before) for (const r of t.rs) if (r.c.lemma === 'werden') r.c.role = `passive auxiliary of ${top(before)?.c.lemma}`;
      }
      if (!t.rs.some((r) => !r.down && isFin(r.c) && r.c.lemma && (ALWAYS_AUX.has(r.c.lemma) || r.c.lemma === 'haben'))) continue;
      if (k !== slot && !(final && k === cl.words.length - 1)) continue;
      // the partner: the last word after (or, in a subordinate clause, before) the auxiliary that is a participle or an infinitive
      const partners = cl.words.map((x) => s.toks[x]).filter((p) => p !== t && p.i !== t.i);
      const parts = [...partners].reverse().filter((p) => { const f = top(p)?.c; return !!f && isPart(f) && f.lemma !== t.rs[0]?.c.lemma; });
      // ist gebaut worden: the participle of the verb is the one before worden
      const part = parts.find((p) => top(p)?.c.lemma !== 'werden') ?? parts[0];
      const perfectOf = parts[0] && top(parts[0])?.c.lemma === 'werden' ? 'werden' : top(part ?? parts[0])?.c.lemma;
      const inf = [...partners].reverse().find((p) => { const f = top(p)?.c; return !!f && isInf(f); });
      for (const r of t.rs) {
        const lemma = r.c.lemma;
        if (!lemma || !isVerbal(r.c) || r.c.unit) continue;
        const fin = isFin(r.c);
        if (lemma === 'haben') {
          if (part && fin) { r.c.pos = 'AUX'; r.c.role = `perfect auxiliary of ${perfectOf}`; }
        } else if (lemma === 'sein') {
          if (part && fin) r.c.role = `perfect auxiliary of ${perfectOf}`;
        } else if (lemma === 'werden') {
          const wuerde = WUERDE.has(t.raw.normalized) && has(r.c, 'Mood', 'Sub');
          if (inf && fin) r.c.role = wuerde ? `würde + infinitive of ${top(inf)?.c.lemma}` : `future auxiliary of ${top(inf)?.c.lemma}`;
          else if (part && fin) r.c.role = `passive auxiliary of ${top(part)?.c.lemma}`;
        } else if (MODALS.has(lemma) && inf && fin) {
          r.c.role = `modal verb with ${top(inf)?.c.lemma}`;
        }
      }
    }
  }
}

// ───────────────────────────── Konjunktiv twins ─────────────────────────────

const MOOD_KEYS = (c: C): string => JSON.stringify({ ...c.morph, Mood: undefined });

const SAYING = new Set(['sagen', 'meinen', 'behaupten', 'erklären', 'berichten', 'erzählen', 'fragen', 'antworten', 'glauben', 'denken', 'schreiben', 'hoffen', 'fürchten']);

/** The verb of saying or thinking a clause reports after (across a comma or a colon, or as a dass / ob clause governed by one), or undefined. */
function reportedAfter(s: Sent, t: Tok): string | undefined {
  const ci = s.clauseOf[t.i];
  const cl = s.clauses[ci];
  if (!cl || ci <= 0 || !/[,:]/.test(cl.open)) return undefined;
  for (let k = ci - 1; k >= 0 && k >= ci - 3; k--) {
    const prev = s.clauses[k];
    if (/[.!?…]/.test(prev.close)) return undefined;
    for (let w = 0; w < prev.words.length; w++) {
      const v = s.toks[prev.words[w]];
      if (v.rs.some((r) => !r.down && isVerbal(r.c) && r.c.lemma && SAYING.has(r.c.lemma))) return v.raw.surface;
      // es heißt, …
      if (v.rs.some((r) => !r.down && isVerbal(r.c) && r.c.lemma === 'heißen') && w > 0 && s.toks[prev.words[w - 1]].raw.normalized === 'es') return `es ${v.raw.surface}`;
    }
    if (!/,/.test(s.clauses[k + 1].open)) break;
  }
  return undefined;
}

/** A wenn clause, or another unambiguous Konjunktiv II in the sentence: the unreal mood is in play. */
function unrealAround(s: Sent, t: Tok): string | undefined {
  const cl = s.clauses[s.clauseOf[t.i]];
  const first = cl ? s.toks[cl.words[0]].raw.normalized : '';
  if (first === 'wenn' || first === 'falls') return `in a ${first} clause`;
  const other = s.toks.find((o) => o.word && o !== t && o.rs.some((r) => !r.down && isFin(r.c) && r.c.morph.Mood === 'Sub' && r.c.morph.Tense === 'Past'));
  return other ? `beside the Konjunktiv II ${other.raw.surface}` : undefined;
}

/**
 * Two readings of one verb that differ only in Ind / Sub (wir gehen, ich habe: indicative and Konjunktiv I are spelled alike;
 * machte, wir gingen: preterite and Konjunktiv II). By default the indicative is the reading and the subjunctive stays behind it
 * (at most 0.3, with its reason); in reported speech (Konjunktiv I) or in a wenn clause / beside another Konjunktiv II
 * (Konjunktiv II) they stay one reading with `Mood: 'Ind,Sub'`.
 */
function decideMoodTwins(s: Sent, t: Tok): void {
  const rs = t.rs;
  for (let a = 0; a < rs.length; a++) {
    const x = rs[a];
    if (!x.own || !isFin(x.c) || x.c.morph.Mood !== 'Ind') continue;
    const b = rs.findIndex((y, k) => k !== a && y.own && isFin(y.c) && y.c.morph.Mood === 'Sub' && y.c.lemma === x.c.lemma && y.c.pos === x.c.pos
      && !!y.down === !!x.down && !!y.late === !!x.late && MOOD_KEYS(y.c) === MOOD_KEYS(x.c) && JSON.stringify(y.prefix) === JSON.stringify(x.prefix)
      && JSON.stringify(y.c.unit) === JSON.stringify(x.c.unit));
    if (b < 0) continue;
    const y = rs[b];
    const past = x.c.morph.Tense === 'Past';
    const kind = past ? 'Konjunktiv II' : 'Konjunktiv I';
    const reason = past ? unrealAround(s, t) : (() => { const v = reportedAfter(s, t); return v ? `reported speech after ${v}` : undefined; })();
    if (reason) {
      x.c.morph = { ...x.c.morph, Mood: 'Ind,Sub' };
      const rule = x.c.notes?.rule;
      if (typeof rule === 'string') addNote(x.c, 'rule', `${rule}; the indicative and the ${kind} are spelled alike`);
      addContext(x, `${reason}: the form is indicative or ${kind}`);
      rs.splice(b, 1);
    } else {
      // the indicative first; the subjunctive of the same spelling stays right behind it
      markDown(y);
      y.c.confidence = Math.min(y.c.confidence, 0.3);
      addContext(y, past
        ? 'the same form is also Konjunktiv II, which is used for wishes and unreal conditions (wenn …, würde …); here the indicative is read'
        : 'the same form is also Konjunktiv I, which is used in reported speech; here the indicative is read');
      rs.splice(b, 1);
      rs.splice(a + 1, 0, y);
    }
  }
}

/** The step, over a whole sentence. */
export function decideVerbs(s: Sent): void {
  for (const cl of s.clauses) decideClause(s, cl);
  labelAuxiliaries(s);
  for (const t of s.toks) if (t.word && t.own) { decideMoodTwins(s, t); settle(t); }
  void isNounLike;
}
