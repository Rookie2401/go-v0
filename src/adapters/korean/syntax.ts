/**
 * Korean shallow syntax: dependency relations between the words of ONE sentence, from the first reading of each word (core/syntax.ts,
 * Universal Dependencies names). Korean is head-final: a word's head is to its right, and the particle on a noun says its job. The rules,
 * and nothing more:
 *   - a noun phrase with a particle attaches to the NEXT predicate of its clause: 이/가 → subject (nsubj), 을/를 → object (obj), 은/는 →
 *     topic (dep: the topic is what the sentence is about and need not be its subject; the subject reading is kept as an alternative),
 *     에 / 에서 / (으)로 / 에게 / 부터 / 까지 … → an adverbial phrase (obl), 이/가 before 되다 / 아니다 → the complement (dep);
 *     when an adnominal predicate stands between it and the main one, the main one is kept as the alternative head;
 *   - a noun with 의 → nmod of the next noun; a determiner → det of the next noun; an adnominal predicate (-는, -(으)ㄴ, -(으)ㄹ, -던) →
 *     acl of the next noun (the clause describes it); a numeral → nummod of the counter or noun after it; a counter → clf of the noun
 *     before it;
 *   - an adverb → advmod of the next predicate (안 / 못: the negation of it); an auxiliary after its connective form → aux of the main
 *     verb; any other connective form → advcl of the next predicate;
 *   - a particle written alone after a Latin or digit token → case of that token;
 *   - the root: the last predicate of the sentence with a sentence-final ending (else the last predicate).
 * Every relation names what it relied on. A word the rules cannot attach has no relation. No parser is claimed. MACHINE-DRAFTED; not
 * reviewed by a native speaker.
 */
import type { AnalysisCandidate, AnalyzedToken, RawToken } from '../../core';
import type { DependencyRelation, SyntaxAlternative, SyntaxAnalysis, SyntaxRelation } from '../../core/syntax';
import { koBareLemma } from './index-store';

export const KO_SYNTAX_ANALYZER = 'syntax-ko@1';
type Cand = AnalysisCandidate;

const PRED = new Set(['VERB', 'ADJ', 'AUX']);
const NOM = new Set(['NOUN', 'PROPN', 'PRON', 'NUM', 'CLF']);
const DIGITS = /^[0-9０-９]+(?:[.,][0-9]+)*$/u;
const OBL = new Set(['to', 'at', 'by', 'to-person', 'to-person-hante', 'to-person-hon', 'from-person', 'from-person-hante', 'from', 'until', 'than', 'like', 'like-gati', 'and', 'and-hago', 'and-rang', 'capacity', 'means', 'from-at', 'toward-person', 'onto', 'onto-person']);
const PARTICLE_WORDS: Record<string, string> = {
  to: '에 (place, time, destination)', at: '에서 (where it happens; from)', by: '(으)로 (direction, means)', 'to-person': '에게 (to a person)',
  'to-person-hante': '한테 (to a person)', 'to-person-hon': '께 (to someone honoured)', 'from-person': '에게서 (from a person)', 'from-person-hante': '한테서 (from a person)',
  from: '부터 (from)', until: '까지 (until, up to)', than: '보다 (than)', like: '처럼 (like)', 'like-gati': '같이 (like)', and: '와/과 (with)', 'and-hago': '하고 (with)',
  'and-rang': '(이)랑 (with)', capacity: '(으)로서 (as)', means: '(으)로써 (by means of)', 'from-at': '에서부터 (from)', 'toward-person': '에게로 (toward)', onto: '에다(가) (onto)', 'onto-person': '한테다(가) (to)',
};

const top = (a: AnalyzedToken | undefined, t: RawToken | undefined): Cand | undefined => (t?.isWord ? a?.candidates[0] : undefined);
const isPred = (c: Cand | undefined): boolean => !!c && !!c.pos && PRED.has(c.pos) && !c.unconfirmed;
const isNom = (c: Cand | undefined): boolean => !!c && !!c.pos && NOM.has(c.pos);
const particles = (c: Cand | undefined): string[] => (c?.morph.Particle ? c.morph.Particle.split('+') : []);
const caseParticle = (c: Cand | undefined): string | undefined => particles(c).filter((p) => p !== 'plural' && p !== 'polite')[0];
const lemmaOf = (c: Cand | undefined): string => (c?.lemma ? koBareLemma(c.lemma) : '');
const isAux = (c: Cand | undefined): boolean => c?.pos === 'AUX' && String(c.notes?.koPos ?? '').startsWith('VX');

/** The shallow dependency relations of one sentence, or undefined when no word has a reading. */
export function koSyntax(tokens: RawToken[], analyses: AnalyzedToken[]): SyntaxAnalysis | undefined {
  const n = tokens.length;
  const c = (i: number): Cand | undefined => top(analyses[i], tokens[i]);
  const surf = (i: number): string => tokens[i].surface;
  const words = tokens.map((t, i) => (t.isWord && c(i) ? i : -1)).filter((i) => i >= 0);
  if (!words.length) return undefined;
  const clause: number[] = [];
  let cl = 0;
  for (let i = 0; i < n; i++) { if (!tokens[i].isWord && !DIGITS.test(tokens[i].surface) && /[,;:—–()「」『』"“”]/u.test(tokens[i].surface)) cl++; clause.push(cl); }

  const rels = new Map<number, SyntaxRelation>();
  const notes: string[] = [];
  const attach = (dep: number, head: number | undefined, relation: DependencyRelation, label: string, basis: string[], confidence: number, alternatives?: SyntaxAlternative[]): void => {
    if (rels.has(dep) || dep === head) return;
    rels.set(dep, { dependent: dep, ...(head !== undefined ? { head } : {}), relation, label, basis, confidence: Math.min(confidence, c(dep)?.unconfirmed ? 0.5 : 1), ...(alternatives?.length ? { alternatives } : {}), status: 'generated' });
  };
  /** The next predicate in the clause after i, and the next one that is not an adnominal (for the alternative). */
  const nextPred = (i: number, finiteOnly = false): number => {
    for (let j = i + 1; j < n && clause[j] === clause[i]; j++) { const x = c(j); if (isPred(x) && !isAux(x) && (!finiteOnly || x!.morph.VerbForm !== 'Adn')) return j; }
    return -1;
  };
  const nextNoun = (i: number): number => {
    const j = i + 1;
    return j < n && clause[j] === clause[i] && isNom(c(j)) ? j : -1;
  };

  // ── the root ──
  const preds = words.filter((i) => isPred(c(i)) || c(i)?.morph.VerbType === 'Cop');
  const finals = preds.filter((i) => c(i)!.morph.VerbForm === 'Fin');
  let root = finals.length ? finals[finals.length - 1] : preds.length ? preds[preds.length - 1] : undefined;
  if (root !== undefined && isAux(c(root))) {
    // an auxiliary is the aux of its main verb; the main verb is the root
    for (let j = root - 1; j >= 0; j--) if (isPred(c(j)) && !isAux(c(j))) { root = j; break; }
  }
  if (root !== undefined) rels.set(root, { dependent: root, relation: 'root', label: 'the main predicate of the sentence', basis: [finals.length ? 'the last predicate with a sentence-final ending' : 'the last predicate the rules found'], confidence: 0.7, status: 'generated' });

  for (const i of words) {
    const x = c(i)!;
    const j = i + 1 < n ? i + 1 : -1;
    // a particle written alone, after a Latin or digit token
    if (x.pos === 'ADP' && i > 0 && tokens[i - 1].end === tokens[i].start) {
      attach(i, i - 1, 'case', `particle of «${surf(i - 1)}»`, [`${surf(i)} is written straight after ${surf(i - 1)}, which is not Hangul`], 0.8);
      continue;
    }
    // an auxiliary after its connective form
    if (isAux(x) && i > 0 && isPred(c(i - 1)) && c(i - 1)!.morph.VerbForm === 'Conn') {
      attach(i, i - 1, 'aux', `auxiliary of «${surf(i - 1)}»`, [`${lemmaOf(x)} after the connective form ${surf(i - 1)} is an auxiliary predicate`], 0.8);
      continue;
    }
    if (isNom(x) || x.morph.VerbType === 'Cop') {
      const p = caseParticle(x);
      const nn = nextNoun(i);
      if (x.pos === 'NUM' && nn >= 0) { attach(i, nn, 'nummod', `number of «${surf(nn)}»`, ['a numeral straight before a counter or noun'], 0.75); continue; }
      if (x.pos === 'CLF' && i > 0 && isNom(c(i - 1)) && c(i - 1)!.pos !== 'NUM' && clause[i - 1] === clause[i]) { attach(i, i - 1, 'clf', `counter of «${surf(i - 1)}»`, ['a counter after the noun it counts'], 0.6); continue; }
      if (p === 'of' && nn >= 0) { attach(i, nn, 'nmod', `belongs to «${surf(nn)}» (의)`, ['the particle 의 links a noun to the noun after it'], 0.8); continue; }
      if (x.morph.VerbType === 'Cop' && i !== root) {
        const h = nextPred(i);
        if (h >= 0 && x.morph.VerbForm === 'Conn') { attach(i, h, 'advcl', `clause joined to «${surf(h)}»`, [`a noun with the copula and the connective ${String(x.notes?.ending ?? '')}`], 0.6); continue; }
        if (x.morph.VerbForm === 'Adn' && nn >= 0) { attach(i, nn, 'acl', `describes «${surf(nn)}»`, ['a noun with the copula in its adnominal form'], 0.6); continue; }
      }
      if (i === root) continue;
      const h = nextPred(i);
      if (h < 0) {
        if (!p && nn >= 0) attach(i, nn, 'compound', `noun before «${surf(nn)}»`, ['two nouns written apart with no particle between them'], 0.4);
        continue;
      }
      const main = c(h)!.morph.VerbForm === 'Adn' ? nextPred(i, true) : -1;
      const alt = (rel: DependencyRelation): SyntaxAlternative[] => (main >= 0 ? [{ head: main, relation: rel, confidence: 0.35, why: `${surf(h)} describes a noun; ${surf(i)} may belong to the main predicate ${surf(main)} instead` }] : []);
      const via = p ? `the particle on ${surf(i)}` : `${surf(i)} has no particle`;
      if (x.morph.Complement === 'Yes') attach(i, h, 'dep', `complement of «${surf(h)}» (what one ${lemmaOf(c(h)) === '되다' ? 'becomes' : 'is not'})`, ['이/가 before 되다 or 아니다 marks the complement'], 0.75);
      else if (p === 'subject' || p === 'subject-hon') attach(i, h, 'nsubj', `subject of «${surf(h)}»`, [`${via}: 이/가 (or 께서) marks the subject`, 'a noun phrase attaches to the next predicate (Korean is head-final)'], 0.7, alt('nsubj'));
      else if (p === 'object') attach(i, h, 'obj', `object of «${surf(h)}»`, [`${via}: 을/를 marks the object`, 'a noun phrase attaches to the next predicate (Korean is head-final)'], 0.7, alt('obj'));
      else if (p === 'topic' || p === 'as-for') attach(i, h, 'dep', `topic: what «${surf(h)}» is said about`, [`${via}: 은/는 marks the topic (or a contrast), which need not be the subject`], 0.6, [{ head: h, relation: 'nsubj', confidence: 0.45, why: 'a topic is often also the subject' }, ...alt('dep')]);
      else if (p && OBL.has(p)) attach(i, h, 'obl', `adverbial phrase of «${surf(h)}»: ${PARTICLE_WORDS[p] ?? p}`, [`${via}: ${PARTICLE_WORDS[p] ?? p}`], 0.65, alt('obl'));
      else if (!p && x.pos !== 'PRON' && nn >= 0) attach(i, nn, 'compound', `noun before «${surf(nn)}»`, ['two nouns written apart with no particle between them'], 0.4);
      continue;
    }
    if (x.pos === 'DET') { const nn = nextNoun(i); if (nn >= 0) attach(i, nn, 'det', `determiner of «${surf(nn)}»`, ['a determiner stands straight before its noun'], 0.8); continue; }
    if (x.pos === 'ADV') {
      const h = j >= 0 && clause[j] === clause[i] && isPred(c(j)) ? j : nextPred(i);
      if (h >= 0) {
        const neg = (x.lemma === '안' || x.lemma === '못') && h === i + 1;
        attach(i, h, 'advmod', neg ? `negation of «${surf(h)}»` : `adverb of «${surf(h)}»`, [neg ? `${x.lemma} straight before a predicate negates it` : 'an adverb attaches to the next predicate'], neg ? 0.85 : 0.55);
      }
      continue;
    }
    if (isPred(x) && i !== root) {
      if (x.morph.VerbForm === 'Adn') { const nn = nextNoun(i); if (nn >= 0) { attach(i, nn, 'acl', `describes «${surf(nn)}»`, [`the adnominal ending ${String(x.notes?.ending ?? '')} makes the clause describe the noun after it`], 0.75); continue; } }
      if (x.morph.VerbForm === 'Conn') {
        const h = nextPred(i);
        const nextAux = i + 1 < n && isAux(c(i + 1));
        if (!nextAux && h >= 0) attach(i, h, 'advcl', `clause joined to «${surf(h)}»`, [`the connective ending ${String(x.notes?.ending ?? '')}${x.morph.Connective ? ` (${x.morph.Connective})` : ''}`], 0.6);
        else if (!nextAux && root !== undefined && root > i) attach(i, root, 'advcl', `clause joined to «${surf(root)}»`, [`the connective ending ${String(x.notes?.ending ?? '')}`], 0.5);
      }
    }
  }

  const attached = words.filter((i) => rels.has(i)).length;
  const loose = words.filter((i) => !rels.has(i));
  if (loose.length) notes.push(`No relation found for: ${loose.map(surf).join(', ')}.`);
  notes.push('Shallow rules over the particles and endings (Korean is head-final): not a parser; machine-drafted, not reviewed by a native speaker.');
  return {
    languageId: 'ko', analyzer: KO_SYNTAX_ANALYZER, tokens: tokens.map((t) => t.surface),
    relations: [...rels.values()].sort((a, b) => a.dependent - b.dependent), notes, attached: words.length ? attached / words.length : 0,
  };
}
