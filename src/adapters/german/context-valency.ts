/**
 * A verb that takes the dative decides a phrase that could be dative (package GC, batch 3). The lexicon marks such verbs `[dat]`
 * (`DeVerb.governs === 'dat'`: gehören, helfen, danken, gefallen, folgen …); nothing is invented for a verb the list does not mark.
 * When a verb of the clause is marked, the clause has no phrase or pronoun that is dative already, and exactly one noun phrase could
 * be dative (it is not governed by a preposition), that phrase is the dative: "Die Bücher gehören meiner Schwester." A verb that is
 * not marked (geben: der Frau stays dative-or-genitive) decides nothing; two candidates decide nothing.
 */
import { anyLive, cellsOf, norm, type Phrase, type Sent, type Tok } from './context';

const isDativeOnly = (t: Tok): boolean => {
  const rs = t.rs.filter((r) => !r.down && (r.c.pos === 'NOUN' || r.c.pos === 'PRON' || r.c.pos === 'DET'));
  return rs.length > 0 && rs.every((r) => (cellsOf(r) ?? []).length > 0 && (cellsOf(r) ?? []).every((x) => x.c === 'D'));
};

/** Mark the dative object phrase of a dative verb; returns whether any phrase was forced. */
export function decideDatives(s: Sent): boolean {
  let changed = false;
  s.clauses.forEach((cl) => {
    const words = cl.words.map((k) => s.toks[k]);
    const verbs = words.filter((t) => t.rs.some((r) => !r.down && (r.c.pos === 'VERB' || r.c.pos === 'AUX') && r.c.lemma && s.lex.verb(norm(r.c.lemma)).some((v) => v.governs === 'dat')));
    if (!verbs.length) return;
    // a dative already in the clause (mir, ihm, dem Kind): the verb has its object
    if (words.some((t) => isDativeOnly(t))) return;
    const inClause = new Set(cl.words);
    const candidates: Phrase[] = s.phrases.filter((run) => inClause.has(run.noun.i) && !run.prep && !run.contraction
      && run.noun.rs.some((r) => !r.down && (r.c.pos === 'NOUN' || r.c.notes?.nominalization) && (cellsOf(r) ?? []).some((x) => x.c === 'D')));
    if (candidates.length !== 1 || candidates[0].noun.frozen) return;
    const run = candidates[0];
    if (anyLive(run.noun, (c) => c.pos === 'PROPN')) return;
    const why = `${verbs[0].raw.surface} takes a dative object and no other phrase of the clause can be dative: ${run.noun.raw.surface} is the dative`;
    if (run.force?.why !== why) { run.force = { cases: ['D'], why }; changed = true; }
  });
  return changed;
}
