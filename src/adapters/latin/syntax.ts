/**
 * Shallow dependency relations for one Latin sentence (Linguistic Engine V2, Stage 4). Latin word order is free, so the rules read
 * CASE ENDINGS and AGREEMENT, not position: a nominative noun is the subject of the finite verb of its clause, an accusative the
 * object, a dative the indirect object, a genitive modifies a neighbouring noun, an ablative is an adverbial phrase, a preposition
 * is attached to the noun in the case it governs, an adjective to the noun it agrees with in case and number.
 *
 * The sentence is cut into clauses at commas, colons and semicolons. A clause that opens with ut, cum, quod, si ... hangs on the
 * main verb as an adverbial clause; one that opens with a relative pronoun describes the noun before it; one that opens with et,
 * sed, autem is coordinated with the main clause. What the rules cannot decide (a neuter nominative / accusative, an adjective with
 * two nouns it could agree with) keeps its alternatives. A word the rules cannot attach has no relation. This is not a parser.
 */
import type { AnalysisCandidate, AnalyzedToken, RawToken } from '../../core';
import type { ClauseSpan, DependencyRelation, SyntaxAlternative, SyntaxAnalysis, SyntaxRelation } from '../../core/syntax';
import { LA_ANALYZER } from './version';

const SUBORDINATORS = new Set(['ut', 'cum', 'quod', 'quia', 'quoniam', 'si', 'nisi', 'ne', 'dum', 'ubi', 'postquam', 'quamvis', 'quamquam', 'donec', 'priusquam', 'antequam', 'sicut', 'quasi', 'quin', 'quo', 'quomodo', 'etsi', 'dummodo']);
const COORD = new Set(['et', 'ac', 'atque', 'sed', 'autem', 'aut', 'vel', 'enim', 'nam', 'tamen', 'igitur', 'ergo', 'at', 'neque', 'nec']);
const RELATIVE = new Set(['qui', 'quicumque']);

const isFin = (c: AnalysisCandidate): boolean => (c.pos === 'VERB' || c.pos === 'AUX') && (c.morph.VerbForm ?? '').split(',').includes('Fin');
const isInf = (c: AnalysisCandidate): boolean => (c.pos === 'VERB' || c.pos === 'AUX') && (c.morph.VerbForm ?? '').split(',').includes('Inf');
const isNominalHead = (c: AnalysisCandidate): boolean => c.pos === 'NOUN' || c.pos === 'PROPN' || c.pos === 'PRON';
const isModifier = (c: AnalysisCandidate): boolean => c.pos === 'ADJ' || c.pos === 'DET' || c.pos === 'NUM' || ((c.pos === 'VERB' || c.pos === 'AUX') && (c.morph.VerbForm ?? '').split(',').some((v) => v === 'Part' || v === 'Gdv'));
const caseIn = (c: AnalysisCandidate, k: string): boolean => (c.morph.Case ?? '').split(',').includes(k);
const overlaps = (a?: string, b?: string): boolean => !a || !b || a.split(',').some((x) => b.split(',').includes(x));

export function latinSyntax(tokens: RawToken[], analyses: AnalyzedToken[]): SyntaxAnalysis {
  const best = (i: number): AnalysisCandidate | undefined => analyses[i]?.candidates[0];
  const word = (i: number): boolean => !!tokens[i]?.isWord;
  const relations: SyntaxRelation[] = [];
  const clauses: ClauseSpan[] = [];
  const attached = new Set<number>();
  const notes: string[] = ['Latin word order is free, so the relations are read from case endings and agreement, clause by clause between punctuation marks.'];

  const add = (dependent: number, head: number | undefined, relation: DependencyRelation, label: string, basis: string[], confidence: number, alternatives?: SyntaxAlternative[]): void => {
    if (attached.has(dependent)) return;
    attached.add(dependent);
    relations.push({ dependent, ...(head !== undefined ? { head } : {}), relation, label, basis, confidence: Math.round(confidence * 100) / 100, ...(alternatives?.length ? { alternatives } : {}), status: 'generated' });
  };

  // ── clauses: cut at , ; : . ! ?
  const segs: Array<[number, number]> = [];
  let start = 0;
  for (let i = 0; i <= tokens.length; i++) {
    if (i === tokens.length || (!tokens[i].isWord && /^[,;:.!?]$/.test(tokens[i].surface))) {
      if (i > start) segs.push([start, i - 1]);
      start = i + 1;
    }
  }
  const wordsIn = (s: [number, number]): number[] => { const r: number[] = []; for (let i = s[0]; i <= s[1]; i++) if (word(i)) r.push(i); return r; };

  interface Seg { span: [number, number]; words: number[]; verb?: number; aux?: number; kind: ClauseSpan['kind']; marker?: number }
  const info: Seg[] = segs.map((span) => {
    const words = wordsIn(span);
    const lead = words[0];
    const leadC = lead !== undefined ? analyses[lead]?.candidates : undefined;
    const sub = leadC?.find((c) => c.lemma && SUBORDINATORS.has(c.lemma) && c.pos === 'SCONJ');
    const rel = leadC?.[0]?.pos === 'PRON' && !!leadC[0].lemma && RELATIVE.has(leadC[0].lemma);
    const coord = leadC?.find((c) => c.lemma && COORD.has(c.lemma) && (c.pos === 'CONJ' || c.pos === 'ADV'));
    const kind: ClauseSpan['kind'] = sub ? 'subordinate' : rel ? 'relative' : coord ? 'coordinate' : 'main';
    let verb = words.find((i) => { const c = best(i); return c && isFin(c); });
    let aux: number | undefined;
    // a perfect passive / -urus periphrasis: the participle is the verb, sum its auxiliary
    if (verb !== undefined && best(verb)?.lemma === 'sum') {
      const p = words.find((i) => { const c = best(i); return c && (c.pos === 'VERB' || c.pos === 'AUX') && (c.morph.VerbForm ?? '').split(',').includes('Part') && caseIn(c, 'Nom') && ['Perf', 'Fut'].includes(c.morph.Tense ?? ''); });
      if (p !== undefined) { aux = verb; verb = p; }
    }
    return { span, words, verb, aux, kind, marker: sub || rel || coord ? lead : undefined };
  });
  if (!info.length) return { languageId: 'la', analyzer: LA_ANALYZER, tokens: tokens.map((t) => t.surface), relations: [], notes: ['No words to analyse.'], attached: 0 };

  const mainSeg = info.find((s) => s.kind === 'main' && s.verb !== undefined) ?? info.find((s) => s.verb !== undefined) ?? info[0];
  const root = mainSeg.verb ?? mainSeg.words.find((i) => { const c = best(i); return c && (isInf(c) || isNominalHead(c)); });
  if (root !== undefined) add(root, undefined, 'root', 'the main word of the sentence', mainSeg.verb !== undefined ? ['the finite verb of the first main clause'] : ['no finite verb: the first noun or infinitive'], 0.6);

  for (const seg of info) {
    clauses.push({ start: seg.span[0], end: seg.span[1], kind: seg.kind === 'main' && seg !== mainSeg ? 'coordinate' : seg.kind, ...(seg.marker !== undefined ? { marker: seg.marker } : {}), label: seg === mainSeg ? 'main clause' : seg.kind === 'subordinate' ? 'subordinate clause' : seg.kind === 'relative' ? 'relative clause' : 'coordinate clause' });
    const verb = seg === mainSeg ? root : seg.verb;
    const words = seg.words;

    // the clause verb hangs on the main verb
    if (seg !== mainSeg && verb !== undefined && root !== undefined && verb !== root) {
      if (seg.kind === 'subordinate') add(verb, root, 'advcl', 'adverbial clause (when, because, so that, if ...)', [`the clause opens with "${tokens[seg.marker as number].surface}"`], 0.55);
      else if (seg.kind === 'relative') {
        const noun = [...words].reverse().length ? ([...mainSeg.words].reverse().find((i) => i < words[0] && best(i) && isNominalHead(best(i) as AnalysisCandidate))) : undefined;
        add(verb, noun ?? root, noun !== undefined ? 'acl' : 'advcl', noun !== undefined ? 'relative clause describing the noun before it' : 'relative clause', ['the clause opens with a relative pronoun'], 0.5);
      } else add(verb, root, 'conj', 'coordinated clause', ['a clause joined to the main clause'], 0.5);
    }
    if (seg.marker !== undefined && verb !== undefined) {
      const m = best(seg.marker);
      if (seg.kind === 'subordinate') add(seg.marker, verb, 'mark', 'word that introduces the clause', ['a subordinating conjunction at the start of the clause'], 0.7);
      else if (seg.kind === 'coordinate' && m) add(seg.marker, verb, 'cc', 'coordinating word', ['a coordinating word at the start of the clause'], 0.6);
    }

    const vc = verb !== undefined ? best(verb) : undefined;
    if (seg.aux !== undefined && verb !== undefined) add(seg.aux, verb, 'aux', 'auxiliary: sum with the participle makes the perfect passive (or the -urus future)', ['a participle in the nominative and a finite form of sum'], 0.6);
    // an undeclined name next to a noun (filiis Israel, domus David) hangs on that noun
    for (let k = 1; k < words.length; k++) {
      const c = best(words[k]);
      const p = best(words[k - 1]);
      if (c && c.pos === 'PROPN' && c.notes?.indeclinable === 'yes' && p && (p.pos === 'NOUN' || p.pos === 'PROPN')) add(words[k], words[k - 1], 'nmod', `name next to "${tokens[words[k - 1]].surface}" (genitive or apposition)`, ['an undeclined name directly after a noun'], 0.5);
    }
    // governed noun phrases: preposition -> noun
    for (let k = 0; k < words.length; k++) {
      const i = words[k];
      const c = best(i);
      if (!c || c.pos !== 'ADP') continue;
      const gov = Array.isArray(c.notes?.governs) ? c.notes.governs : [];
      for (let m = k + 1; m < Math.min(words.length, k + 4); m++) {
        const j = words[m];
        const d = best(j);
        if (!d) break;
        if (isNominalHead(d) && gov.some((g) => caseIn(d, g))) {
          add(i, j, 'case', `preposition: governs the ${gov.join(' / ')}`, [`"${tokens[i].surface}" is followed by a noun in the case it governs`], 0.7);
          if (verb !== undefined) add(j, verb, 'obl', 'adverbial phrase (place, time, manner, means)', [`a noun after the preposition "${tokens[i].surface}"`], 0.55);
          break;
        }
        if (!isModifier(d)) break;
      }
    }
    const governedNoun = (i: number): boolean => relations.some((r) => r.dependent === i && r.relation === 'obl');

    // verb arguments
    if (verb !== undefined && vc) {
      const subjCand = words.filter((i) => { const c = best(i); return c && isNominalHead(c) && caseIn(c, 'Nom') && !attached.has(i) && overlaps(c.morph.Number, vc.morph.Number); });
      const subj = subjCand.find((i) => !(best(i) && caseIn(best(i) as AnalysisCandidate, 'Acc') && subjCand.length > 1 && i !== subjCand[0])) ?? subjCand[0];
      if (subj !== undefined && subj !== verb) {
        const c = best(subj) as AnalysisCandidate;
        const amb = caseIn(c, 'Acc');
        add(subj, verb, 'nsubj', `subject of "${tokens[verb].surface}"`, [`nominative${amb ? ' (the form is also accusative)' : ''} and agrees in number with the verb`], amb ? 0.45 : 0.65, amb ? [{ head: verb, relation: 'obj', confidence: 0.3, why: 'a neuter noun has the same form in the nominative and the accusative' }] : undefined);
      }
      const rest = words.filter((i) => !attached.has(i));
      for (const i of rest) {
        const c = best(i);
        if (!c || !isNominalHead(c) || governedNoun(i)) continue;
        const subjectDone = relations.some((r) => r.relation === 'nsubj' && r.head === verb);
        if (caseIn(c, 'Nom') && !caseIn(c, 'Acc') && vc.lemma === 'sum' && subjectDone) { add(i, verb, 'xcomp', 'predicate noun of sum', ['a second nominative with the verb sum'], 0.45); continue; }
        if (caseIn(c, 'Nom') && caseIn(c, 'Acc') && subjectDone && vc.lemma === 'sum') { add(i, verb, 'xcomp', 'predicate noun of sum', ['the subject is taken: a second nominative with sum'], 0.4, [{ head: verb, relation: 'obj', confidence: 0.2, why: 'the form is also accusative' }]); continue; }
        if (caseIn(c, 'Acc') && (!caseIn(c, 'Nom') || subjectDone) && vc.lemma !== 'sum') {
          const infAfter = words.find((j) => j > i && best(j) && isInf(best(j) as AnalysisCandidate));
          if (infAfter !== undefined) { add(i, infAfter, 'nsubj', `subject of the infinitive "${tokens[infAfter].surface}"`, ['accusative before an infinitive: accusative + infinitive'], 0.55); continue; }
          add(i, verb, 'obj', `direct object of "${tokens[verb].surface}"`, [caseIn(c, 'Nom') ? 'accusative (the form is also nominative, but the subject is already taken), not governed by a preposition' : 'accusative case, not governed by a preposition'], caseIn(c, 'Nom') ? 0.5 : 0.6);
        } else if (caseIn(c, 'Dat') && !caseIn(c, 'Abl')) add(i, verb, 'iobj', `indirect object of "${tokens[verb].surface}"`, ['dative case'], 0.55);
        else if (caseIn(c, 'Dat') && caseIn(c, 'Abl')) add(i, verb, 'obl', 'adverbial phrase (dative or ablative)', ['a form that is both dative and ablative'], 0.4);
        else if (caseIn(c, 'Abl') && !caseIn(c, 'Nom') && !caseIn(c, 'Acc')) add(i, verb, 'obl', 'adverbial phrase (means, time, manner)', ['ablative case, not governed by a preposition'], 0.55);
        else if (caseIn(c, 'Voc') && !caseIn(c, 'Nom')) add(i, verb, 'vocative', 'person addressed', ['vocative case'], 0.5);
        else if (caseIn(c, 'Nom') && vc.lemma === 'sum') add(i, verb, 'xcomp', 'predicate noun of sum', ['a second nominative with the verb sum'], 0.45);
      }
      // infinitives depend on a verb
      for (const i of words) {
        const c = best(i);
        if (!c || attached.has(i) || !isInf(c) || i === verb) continue;
        add(i, verb, 'xcomp', 'infinitive that completes the verb', ['an infinitive in the clause of a finite verb'], 0.5);
      }
    }

    // modifiers: genitives, adjectives, adverbs, conjunctions
    for (let k = 0; k < words.length; k++) {
      const i = words[k];
      const c = best(i);
      if (!c || attached.has(i)) continue;
      if (isNominalHead(c) && caseIn(c, 'Gen') && !caseIn(c, 'Nom')) {
        const head = [...words.slice(0, k)].reverse().find((j) => best(j) && isNominalHead(best(j) as AnalysisCandidate)) ?? words.slice(k + 1).find((j) => best(j) && isNominalHead(best(j) as AnalysisCandidate));
        if (head !== undefined) add(i, head, 'nmod', `genitive: "of ${tokens[i].surface}" modifying "${tokens[head].surface}"`, ['genitive case next to a noun'], 0.5);
        continue;
      }
      if (isModifier(c)) {
        const near = words.filter((j) => j !== i && Math.abs(words.indexOf(j) - k) <= 3 && best(j) && isNominalHead(best(j) as AnalysisCandidate));
        const agree = near.filter((j) => {
          const d = best(j) as AnalysisCandidate;
          return overlaps(c.morph.Case, d.morph.Case) && overlaps(c.morph.Number, d.morph.Number) && overlaps(c.morph.Gender, d.morph.Gender);
        });
        agree.sort((a, b) => Math.abs(words.indexOf(a) - k) - Math.abs(words.indexOf(b) - k));
        if (agree.length) {
          const rel: DependencyRelation = c.pos === 'DET' ? 'det' : c.pos === 'NUM' ? 'nummod' : 'amod';
          add(i, agree[0], rel, `describes "${tokens[agree[0]].surface}"`, ['agrees with it in case, number and gender'], 0.6, agree.length > 1 ? [{ head: agree[1], relation: rel, confidence: 0.3, why: `"${tokens[agree[1]].surface}" agrees as well` }] : undefined);
        } else if (verb !== undefined && isNominalHead(c) === false && caseIn(c, 'Nom')) add(i, verb, 'xcomp', 'predicate adjective', ['a nominative adjective with no noun to agree with'], 0.4);
        continue;
      }
      if (c.pos === 'ADV' && verb !== undefined) add(i, verb, 'advmod', 'adverb', ['an adverb modifies the verb of its clause'], 0.5);
      else if ((c.pos === 'CONJ') && i !== seg.marker) {
        const next = words.find((j) => j > i && !attached.has(j));
        const prev = [...words].reverse().find((j) => j < i && best(j) && (isNominalHead(best(j) as AnalysisCandidate) || isFin(best(j) as AnalysisCandidate) || isModifier(best(j) as AnalysisCandidate)));
        if (next !== undefined) add(i, next, 'cc', 'coordinating word', ['joins the word before it to the word after it'], 0.55);
        if (next !== undefined && prev !== undefined && !attached.has(next)) {
          const a = best(next);
          const b = best(prev);
          if (a && b && a.pos === b.pos) add(next, prev, 'conj', `coordinated with "${tokens[prev].surface}"`, ['joined by a conjunction to a word of the same kind'], 0.5);
        }
      }
    }
  }

  const wordCount = tokens.filter((t) => t.isWord).length;
  const unattached = tokens.map((t, i) => (t.isWord && !attached.has(i) ? t.surface : '')).filter(Boolean);
  if (unattached.length) notes.push(`No relation was found for: ${unattached.slice(0, 8).join(', ')}${unattached.length > 8 ? ' ...' : ''}.`);
  return { languageId: 'la', analyzer: LA_ANALYZER, tokens: tokens.map((t) => t.surface), relations: relations.sort((a, b) => a.dependent - b.dependent), clauses, notes, attached: wordCount ? Math.round((attached.size / wordCount) * 1000) / 1000 : 0 };
}
