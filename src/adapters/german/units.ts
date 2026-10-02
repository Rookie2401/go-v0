/**
 * Separated verbs (package GC, step 3): "Er steht früh auf", "Ich fange mit der Arbeit an", "Kommst du mit?". A finite
 * verb whose lexicon verb has a separable prefix has, among the engine's readings, one per prefix with `prefix.attached
 * === false`. If that prefix stands as a separate word at the END of the verb's clause (the last word, or the word before
 * a closing "zu + infinitive"), both words become one lexical unit: each carries the whole verb as its lemma, the verb
 * is the head, the particle the "separable prefix". If it does not, the detached readings are dropped: the verb is its
 * base verb ("Er steht an der Tür" is stehen + the preposition an). Prefixes of the `dual` kind (um, über, durch …)
 * split only for a verb the lexicon lists as separable, because the engine only offers such readings.
 * A separable-kind particle stranded after a finite verb whose joined form the lexicon does not list is added as an
 * `unconfirmed` reading AFTER the ordinary ones.
 */
import { DE_SOURCE_IDS, addContext, anyLive, cloneR, isFin, isInf, markDown, prefer, settle, verbFinalClause, finiteSlot, type Clause, type R, type Sent, type Tok } from './context';

const NOT_SEPARABLE_HEADS = new Set(['sein', 'haben', 'werden', 'können', 'müssen', 'wollen', 'sollen', 'dürfen', 'mögen']);

/** The word class of a separable prefix standing alone, as the lexicon has it. */
function particlePos(s: Sent, prefix: string): 'ADP' | 'ADV' {
  const plain = s.lex.plain(prefix);
  if (plain.some((p) => p.pos === 'ADP')) return 'ADP';
  if (plain.some((p) => p.pos === 'ADV')) return 'ADV';
  return s.lex.preposition(prefix) ? 'ADP' : 'ADV';
}

/** Where the particle may stand in this clause: the last word, or the word before a closing "zu + infinitive". */
function particleSlots(s: Sent, cl: Clause): Tok[] {
  const w = cl.words;
  const out: Tok[] = [];
  const last = s.toks[w[w.length - 1]];
  out.push(last);
  if (w.length >= 3) {
    const zu = s.toks[w[w.length - 2]];
    if (zu.raw.normalized === 'zu' && anyLive(last, (c) => isInf(c))) out.push(s.toks[w[w.length - 3]]);
  }
  return out;
}

const detachedWith = (r: R, prefix: string): boolean => !!r.prefix && !r.prefix.attached && r.prefix.text === prefix;
const detached = (r: R): boolean => !!r.prefix && !r.prefix.attached;

function makeUnit(v: Tok, p: Tok, lemma: string, role: string): NonNullable<R['c']['unit']> {
  return { head: v.i, pieces: [v.i, p.i], role, display: lemma };
}

function join(s: Sent, v: Tok, p: Tok): boolean {
  const pre = p.raw.normalized;
  const matched = v.rs.filter((r) => !r.down && detachedWith(r, pre));
  if (!matched.length) return false;
  const lemmas: string[] = [];
  for (const r of matched) {
    const lemma = r.c.lemma as string;
    r.c.unit = makeUnit(v, p, lemma, 'head');
    r.c.notes = { ...(r.c.notes ?? {}), unit: lemma, separable: pre };
    addContext(r, `the prefix ${pre} stands apart at the end of the clause: ${lemma}`);
    if (!lemmas.includes(lemma)) lemmas.push(lemma);
  }
  v.rs = v.rs.filter((r) => !detached(r) || matched.includes(r));
  for (const r of v.rs) if (!matched.includes(r) && !r.down) markDown(r);
  v.rs = [...matched, ...v.rs.filter((r) => !matched.includes(r))];
  settle(v);
  const pos = particlePos(s, pre);
  const made: R[] = lemmas.map((lemma) => {
    const base = matched.find((r) => r.c.lemma === lemma) as R;
    const c: R['c'] = {
      lemma, pos, morph: {}, confidence: base.c.confidence,
      notes: { source: 'rule', rule: `separable prefix ${pre} of ${lemma}, standing apart at the end of the clause`, lemmaStatus: 'in the word list', unit: lemma, separable: pre, particleOf: String(v.i) },
      origin: 'rule', sourceId: DE_SOURCE_IDS.rules, role: 'separable prefix', unit: makeUnit(v, p, lemma, 'separable prefix'),
    };
    if (base.c.gloss) c.gloss = base.c.gloss;
    return { c, own: true };
  });
  for (const r of p.rs) if (!r.down) markDown(r);
  for (const r of made) addContext(r, `belongs to ${v.raw.surface}: ${r.c.lemma}`);
  p.rs = [...made, ...p.rs];
  settle(p);
  return true;
}

/** An adverb of measure or degree in front of weg, hin, her …: "Er wohnt weit weg" is no weggehen-type unit. */
const MEASURE = new Set(['weit', 'ganz', 'sehr', 'ziemlich', 'recht', 'so', 'zu', 'viel', 'wenig', 'nah', 'nahe', 'fern', 'kurz', 'lang', 'etwas']);

/**
 * A word of the unambiguously separable prefix list at the END of its clause (or before the closing "zu + infinitive"), after a finite
 * verb the list knows but does not join with it: an unconfirmed unit (prefix + verb, confidence 0.5, no gloss), put first on both words
 * with the ordinary readings right behind it, for the dictionary to decide. Never when the word has another job in the clause: an
 * adjective or noun reading (fest, bereit), a verb reading, an adverb of measure in front of it (weit weg), and never when the only
 * verb is sein, haben, werden or a modal (Er ist weg. Die Tür ist zu. Er will mit.).
 */
function guessUnit(s: Sent, cl: Clause, p: Tok): boolean {
  const pre = p.raw.normalized;
  if (s.lex.prefixKind(pre) !== 'separable' || !p.own) return false;
  if (anyLive(p, (c) => c.pos === 'ADJ' || c.pos === 'NOUN' || c.pos === 'PROPN' || c.pos === 'VERB' || c.pos === 'AUX')) return false;
  const before = s.toks[p.i - 1];
  if (before?.word && MEASURE.has(before.raw.normalized)) return false;
  const slot = finiteSlot(s, cl);
  if (slot < 0) return false;
  const v = s.toks[cl.words[slot]];
  if (!v.own || v.i >= p.i) return false;
  const base = v.rs.filter((r) => !r.down && r.c.pos === 'VERB' && isFin(r.c) && !r.c.unconfirmed && !r.prefix && r.c.lemma && !NOT_SEPARABLE_HEADS.has(r.c.lemma));
  if (!base.length) return false;
  // the finite verb is the clause's only verb: no modal or auxiliary stands beside a participle or infinitive of its own
  if (v.rs.some((r) => !r.down && isFin(r.c) && r.c.lemma && NOT_SEPARABLE_HEADS.has(r.c.lemma))) return false;
  const seen = new Set<string>();
  const vOut: R[] = [];
  for (const r of base) {
    const lemma = `${pre}${r.c.lemma}`;
    const key = `${lemma}|${JSON.stringify(r.c.morph)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const c = cloneR(r).c;
    c.lemma = lemma;
    delete c.gloss;
    c.unconfirmed = true;
    c.confidence = 0.5;
    c.unit = makeUnit(v, p, lemma, 'head');
    c.notes = { source: 'rule', rule: `${r.c.lemma} with the prefix ${pre} stranded at the end of the clause; ${lemma} is not in the word list (a guess)`, lemmaStatus: 'inferred by the rules', unit: lemma, separable: pre };
    c.origin = 'rule';
    c.sourceId = DE_SOURCE_IDS.rules;
    vOut.push({ c, own: true });
  }
  const lemma0 = `${pre}${base[0].c.lemma}`;
  const pc: R['c'] = {
    lemma: lemma0, pos: particlePos(s, pre), morph: {}, confidence: 0.5, unconfirmed: true, role: 'separable prefix',
    notes: { source: 'rule', rule: `the particle ${pre} stranded at the end of the clause, perhaps the prefix of ${lemma0} (not in the word list; a guess)`, lemmaStatus: 'inferred by the rules', unit: lemma0, separable: pre, particleOf: String(v.i) },
    origin: 'rule', sourceId: DE_SOURCE_IDS.rules, unit: makeUnit(v, p, lemma0, 'separable prefix'),
  };
  for (const r of v.rs) if (!r.down) markDown(r);
  for (const r of p.rs) if (!r.down) markDown(r);
  for (const r of vOut) addContext(r, `${pre} stands alone at the end of the clause after ${base[0].c.lemma}: perhaps ${r.c.lemma}, which the word list does not hold (a guess; the dictionary decides)`);
  const pr: R = { c: pc, own: true };
  addContext(pr, `${pre} stands alone at the end of the clause after ${s.toks[v.i].raw.surface}: perhaps the prefix of ${lemma0}, which the word list does not hold (a guess; the dictionary decides)`);
  v.rs = [...vOut, ...v.rs];
  p.rs = [pr, ...p.rs];
  settle(v);
  settle(p);
  return true;
}

/** Put separated verbs together; drop the detached readings that found no prefix. */
export function joinSeparableVerbs(s: Sent): void {
  for (const cl of s.clauses) {
    const final = verbFinalClause(s, cl);
    // a separable verb written as one word (aufsteht) is a finite form only at the end of a subordinate clause: Er umfährt die Baustelle
    if (!final) for (const k of cl.words) prefer(s.toks[k], (r) => !(r.prefix?.attached && isFin(r.c)), 'a separable verb is written as one word only at the end of a subordinate clause; in a main clause its prefix stands apart');
    const verbs = cl.words.map((k) => s.toks[k]).filter((t) => t.own && t.rs.some((r) => detached(r)));
    let done = false;
    if (!final && verbs.length) {
      const slot = finiteSlot(s, cl);
      const slotTok = slot >= 0 ? s.toks[cl.words[slot]] : undefined;
      for (const p of particleSlots(s, cl)) {
        if (!p.own || done) continue;
        const cands = verbs.filter((v) => v.i < p.i && v.rs.some((r) => !r.down && detachedWith(r, p.raw.normalized)));
        const v = cands.find((x) => x === slotTok) ?? cands[0];
        if (v && join(s, v, p)) done = true;
      }
    }
    // a verb whose prefix did not stand apart is its base verb: the detached readings go
    for (const v of verbs) {
      if (v.rs.some((r) => r.c.unit)) continue;
      v.rs = v.rs.filter((r) => !detached(r));
    }
    if (!final && !done && cl.words.length >= 2) {
      for (const p of particleSlots(s, cl)) if (guessUnit(s, cl, p)) break;
    }
  }
  // detached readings on a verb outside any clause (a lone word) are dropped too
  for (const t of s.toks) if (t.word && t.own && !t.rs.some((r) => r.c.unit) && t.rs.some(detached)) t.rs = t.rs.filter((r) => !detached(r));
}
