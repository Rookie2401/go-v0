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
import { settlePhrases } from './agreement';
import { decideRelatives, decideSubjects, pronounSubject } from './context-subject';
import { decideDatives } from './context-valency';
import {
  addContext, addNote, anyLive, cloneR, markDown, norm, finiteSlot, has, isFin, isInf, isNounLike, isPart, isVerbal, prefer, settle, top, verbFinalClause,
  type C, type Clause, type R, type Sent, type Tok,
} from './context';

const MODALS = new Set(['können', 'müssen', 'wollen', 'sollen', 'dürfen', 'mögen', 'möchten']);
const COORDINATORS = new Set(['und', 'oder', 'aber', 'sondern', 'denn']);

const lemmaOfSlot = (t: Tok | undefined): string[] => (t ? [...new Set(t.rs.filter((r) => !r.down && isFin(r.c) && r.c.lemma).map((r) => r.c.lemma as string))] : []);

/** A reading of a function word or adverb (mehr, bitte, weg, los, halt …): a word that has one never takes the imperative reading. */
const ordinaryWord = (c: C): boolean => !!c.pos && ['ADV', 'DET', 'PRON', 'ADP', 'CONJ', 'SCONJ', 'PART', 'INTJ', 'NUM'].includes(c.pos);

const isImp = (c: C): boolean => isVerbal(c) && has(c, 'Mood', 'Imp');

/**
 * An imperative needs the verb at the head of its clause (after at most an interjection, bitte or a coordinating und), in a
 * clause that does not end in its verb; a word that is also an ordinary function word or adverb (mehr, bitte, weg, los, halt)
 * takes it only when an article or pronoun follows (Halt die Klappe!), never otherwise (Je mehr du liest, Mehr Licht!, Lies mehr!).
 */
function demoteStrayImperatives(s: Sent, cl: Clause): void {
  const w = cl.words;
  const final = verbFinalClause(s, cl);
  for (let k = 0; k < w.length; k++) {
    const t = s.toks[w[k]];
    if (!t.rs.some((r) => !r.down && isImp(r.c)) || !t.rs.some((r) => !r.down && !isImp(r.c))) continue;
    const before = w.slice(0, k).map((x) => s.toks[x]);
    const atHead = !final && before.every((b) => COORDINATORS.has(b.raw.normalized) || b.raw.normalized === 'bitte' || (b.rs.length > 0 && b.rs.every((r) => r.c.pos === 'INTJ')));
    if (!atHead) { prefer(t, (r) => !isImp(r.c), final ? 'a verb-final clause has no imperative' : 'an imperative stands at the head of its clause: not here'); continue; }
    if (t.rs.some((r) => !r.down && ordinaryWord(r.c))) {
      const next = s.toks[w[k + 1]];
      const object = !!next && anyLive(next, (c) => c.pos === 'DET' || (c.pos === 'PRON' && has(c, 'PronType', 'Prs')));
      if (!object) prefer(t, (r) => !isImp(r.c), 'a function word or adverb, not the imperative of the verb it is spelled like');
    }
  }
}

function decideClause(s: Sent, cl: Clause): void {
  const w = cl.words;
  const final = verbFinalClause(s, cl);
  const slot = finiteSlot(s, cl);
  const slotTok = slot >= 0 ? s.toks[w[slot]] : undefined;

  // ── a verb first with no subject after it: a command (the subject itself was decided before: decideSubjects)
  if (slotTok) {
    if (slot === 0 && cl.first && !final && s.endMark !== '?' && !pronounSubject(s.toks[w[1]])) {
      // verb first, no subject after it: a command (Komm doch mal her! Gib mir das Buch.)
      const isCommand = (r: R): boolean => isVerbal(r.c) && has(r.c, 'Mood', 'Imp');
      const objectNext = !!w[1] && anyLive(s.toks[w[1]], (c) => c.pos === 'DET' || (c.pos === 'PRON' && has(c, 'PronType', 'Prs')));
      if (slotTok.rs.some((r) => !r.down && isCommand(r)) && (objectNext || !slotTok.rs.some((r) => !r.down && ordinaryWord(r.c)))) prefer(slotTok, isCommand, 'a verb first with no subject after it: a command');
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
  // ── a form in -t with an unstressed prefix that the list does not hold (verwandelt), last in a clause that has its finite verb
  // already, is the participle: a predicative participle needs no auxiliary (… fand er sich verwandelt)
  if (slotTok && !final && slot < w.length - 1) {
    const last = s.toks[w[w.length - 1]];
    const before = s.toks[w[w.length - 2]];
    const live = last.rs.filter((r) => !r.down);
    if (last.own && !last.frozen && !COORDINATORS.has(before.raw.normalized) && live.length > 0 && live.every((r) => isFin(r.c) && r.c.unconfirmed)
      && /^(be|emp|ent|er|ge|miss|ver|zer)\p{L}{3,}t$/u.test(last.raw.normalized) && slotTok.rs.some((r) => !r.down && isFin(r.c) && !r.c.unconfirmed)) {
      const part = cloneR(live[0]);
      part.c.morph = { VerbForm: 'Part', Tense: 'Past' };
      part.c.confidence = Math.min(0.4, live[0].c.confidence);
      part.c.notes = { ...(part.c.notes ?? {}), rule: `guessed past participle of ${part.c.lemma} (a form in -t with the unstressed prefix, in a clause that already has its finite verb)` };
      last.rs.unshift(part);
      prefer(last, (r) => r === part, `the clause has its finite verb (${slotTok.raw.surface}) already: a predicative participle`);
    }
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
      // a participle in a coordinated fragment without a finite verb of its own belongs to the same auxiliary (hat … abgeschickt, sondern weggeworfen)
      const ci = s.clauseOf[t.i];
      for (let j = ci + 1; j < s.clauses.length; j++) {
        const next = s.clauses[j];
        if (!(next.lead >= 0 || COORDINATORS.has(s.toks[next.words[0]].raw.normalized)) || finiteSlot(s, next) >= 0 || verbFinalClause(s, next)) break;
        partners.push(...next.words.map((x) => s.toks[x]));
      }
      const parts = [...partners].reverse().filter((p) => { const f = top(p)?.c; return !!f && isPart(f) && f.lemma !== t.rs[0]?.c.lemma; });
      // ist gebaut worden: the participle of the verb is the one before worden
      const part = parts.find((p) => top(p)?.c.lemma !== 'werden') ?? parts[0];
      // the verbs of the participles, in text order; a verb the list does not hold says so
      const named = [...parts].reverse().filter((p) => top(p)?.c.lemma !== 'werden').map((p) => { const c = top(p)?.c; return c?.unconfirmed ? `${c.lemma} (a verb not in the word list)` : c?.lemma; });
      const perfectOf = parts[0] && top(parts[0])?.c.lemma === 'werden' ? 'werden' : [...new Set(named)].join(' and ');
      const inf = [...partners].reverse().find((p) => { const f = top(p)?.c; return !!f && isInf(f); });
      for (const r of t.rs) {
        const lemma = r.c.lemma;
        if (!lemma || !isVerbal(r.c) || r.c.unit) continue;
        const fin = isFin(r.c);
        if (lemma === 'haben') {
          if (part && fin) { r.c.pos = 'AUX'; r.c.role = `perfect auxiliary of ${perfectOf}`; }
        } else if (lemma === 'sein') {
          if (part && fin) {
            // sein + the participle of a verb that makes its perfect with haben only (öffnen) is the state passive, the result of the action
            const pc = top(part)?.c;
            const rows = pc && !pc.unconfirmed && pc.lemma ? s.lex.verb(norm(pc.lemma)) : [];
            if (perfectOf !== 'werden' && rows.length > 0 && rows.every((v) => v.aux === 'haben')) {
              r.c.role = `state passive: sein + participle says the result of ${pc?.lemma}`;
              addNote(r.c, 'voice', 'state-passive');
            } else r.c.role = `perfect auxiliary of ${perfectOf}`;
          }
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
  if (first === 'als' && cl && ['ob', 'wenn'].includes(s.toks[cl.words[1]]?.raw.normalized ?? '')) return `in an als ${s.toks[cl.words[1]].raw.normalized} clause`;
  // another verb that can only be Konjunktiv II (hätte, käme, würde): a form that is also the preterite does not count
  const other = s.toks.find((o) => {
    if (!o.word || o === t) return false;
    // a reading a dictionary put on the word (Garten as a form of garen) is no evidence of the unreal mood; the engine's own are
    const fin = o.rs.filter((r) => !r.down && (r.own || r.c.origin !== 'dictionary') && isFin(r.c) && !has(r.c, 'Mood', 'Imp'));
    return fin.length > 0 && fin.every((r) => r.c.morph.Mood === 'Sub' && r.c.morph.Tense === 'Past');
  });
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

/**
 * A word that is also an uninflected word of the list (bitte), in a clause with no subject pronoun, where every third-person
 * finite reading is Konjunktiv I (bitten: er bittet, Konjunktiv I er bitte): outside reported speech that is the uninflected word,
 * before a noun phrase can be taken as its subject (Ein Brot, bitte. Zwei Kaffee bitte! — not "the bread would ask").
 * A word heading a clause of more than one word is left to the imperative rules (Bitte ihn um Hilfe!).
 */
function demoteStrayKonjunktivI(s: Sent, cl: Clause): void {
  const w = cl.words;
  if (w.some((k) => pronounSubject(s.toks[k]))) return;
  for (let k = 0; k < w.length; k++) {
    const t = s.toks[w[k]];
    if (!t.word || (k === 0 && w.length > 1) || !t.rs.some((r) => !r.down && ordinaryWord(r.c))) continue;
    const third = t.rs.filter((r) => !r.down && isFin(r.c) && !has(r.c, 'Mood', 'Imp') && has(r.c, 'Person', '3'));
    if (!third.length || !third.every((r) => r.c.morph.Mood === 'Sub' && r.c.morph.Tense === 'Pres') || reportedAfter(s, t)) continue;
    prefer(t, (r) => ordinaryWord(r.c), 'no subject pronoun and no reported speech: the uninflected word, not the Konjunktiv I of the verb it is spelled like');
  }
}

/** The step, over a whole sentence. */
export function decideVerbs(s: Sent): void {
  for (const cl of s.clauses) { demoteStrayImperatives(s, cl); demoteStrayKonjunktivI(s, cl); }
  decideRelatives(s);
  if (decideDatives(s)) settlePhrases(s);
  decideSubjects(s);
  for (const cl of s.clauses) decideClause(s, cl);
  settlePhrases(s);
  labelAuxiliaries(s);
  for (const t of s.toks) if (t.word && t.own) { decideMoodTwins(s, t); settle(t); }
  void isNounLike;
}
