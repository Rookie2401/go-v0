/**
 * French contextual syntax: shallow dependency relations for ONE sentence, from the adapter's own readings (the FIRST reading of
 * each token: lemma, part of speech, gender, number, person) and word order. Pure rules, no data files, deterministic, and linear in
 * the sentence length (every search looks at a bounded window of words).
 *
 * It is NOT a parser. What it does: determiner / numeral / adjective → noun (agreement in gender and number as evidence, a mismatch
 * lowers the confidence and says so); subject pronoun or subject noun phrase → finite verb (person and number as evidence), also
 * inverted (a-t-il, dit-elle, est-ce); auxiliary → participle; the clitic object pronouns of a verb (me te se nous vous · le la les ·
 * lui leur · y · en, in that fixed order); ne and its second element → verb; preposition → its noun, infinitive or gerund, with the
 * contracted article inside au / du / des; the de-complement of a noun (le livre de Paul) and the prepositional phrase of a verb;
 * relative pronouns (qui subject, que object, dont complement with de, où place or time) → their verb and their antecedent; que and
 * the subordinating words → their clause verb → the verb they follow; infinitive → the verb or preposition that governs it; et / ou /
 * mais between like words.
 * What it does not do: guess. Where order and agreement leave two heads (a prepositional phrase of the verb or of the noun; que as
 * conjunction or relative; me / te as object, indirect object or reflexive) it keeps both (`alternatives`, status 'conflicted'). A
 * word the rules cannot place gets no relation (the card then says "role unknown"). Apposition, comparatives, quotations and
 * dislocation are not attempted. Machine-drafted rules, not checked by a native speaker. A first reading that the context has not
 * yet corrected (a noun read as a verb) misleads it: the notes say so where the rules saw a word with no reading at all.
 */
import type { AnalyzedToken, AnalysisCandidate, RawToken } from '../../core';
import type { ClauseSpan, DependencyRelation, SyntaxAlternative, SyntaxAnalysis, SyntaxRelation } from '../../core/syntax';

const ANALYZER = 'french-syntax@1';

const set = (s: string): Set<string> => new Set(s.split(/\s+/).filter(Boolean));

/** Clitic object pronouns by their written form, with the place in the fixed order: me te se nous vous · le la les · lui leur · y · en. */
const CLITIC_TIER: Readonly<Record<string, number>> = {
  me: 1, 'm\'': 1, te: 1, 't\'': 1, se: 1, 's\'': 1, nous: 1, vous: 1,
  le: 2, la: 2, les: 2, 'l\'': 2, lui: 3, leur: 3, y: 4, en: 5,
};
/** Written forms that can be the subject pronoun of a verb (nous and vous are also objects). */
const SUBJECT_FORMS = set('je j\' tu il elle on ils elles nous vous ce c\' ç\' ça cela ceci');
const SUBJECT_ONLY = set('je j\' tu il elle on ils elles ce c\' ç\' ça cela ceci');
const NEG_SECOND = set('pas plus jamais point guère rien personne');
const COPULA = set('être devenir rester sembler paraître demeurer');
/** Verbs that take an infinitive straight after them. */
const DIRECT_INF = set('vouloir pouvoir devoir savoir aller falloir faire laisser voir entendre sentir oser désirer espérer préférer souhaiter aimer détester adorer compter penser croire sembler paraître venir envoyer valoir');
const STRESSED = set('moi toi soi lui elle eux elles celui celle ceux celles ceci cela ça');
const PREP_INF = set('à au de d\' pour sans par afin avant après');
const ADVERBIAL_PREP_INF = set('pour sans par afin avant après');
const CONJ_BEFORE_QUE = set('parce pour afin bien alors tandis pendant depuis dès avant après sans ainsi tant jusqu\'à lors');
const COMPARATIVE = set('plus moins aussi autant tel même autre');
const SUBORDINATORS = set('quand lorsque lorsqu\' puisque puisqu\' quoique quoiqu\' comme si tandis parce');
const INTERROG_ADV = set('comment pourquoi quand combien où');
const DEGREE_ADV = set('très trop assez si plus moins peu tellement aussi bien tout fort presque');
const RELATIVE_FORMS = set('qui que qu\' dont où lequel laquelle lesquels lesquelles duquel desquels desquelles auquel auxquels');
const CC_SET = set('et ou mais ni');

const NAMES: Record<string, string> = { Masc: 'masculine', Fem: 'feminine', Sing: 'singular', Plur: 'plural', '1': '1st person', '2': '2nd person', '3': '3rd person' };
const q = (s: string): string => `“${s}”`;

interface Wd {
  /** The word's index among the sentence's words. */
  k: number;
  /** The token index. */
  i: number;
  s: string;
  n: string;
  lemma: string;
  pos: string;
  m: Record<string, string>;
  cands: AnalysisCandidate[];
  /** The word is joined to the word before it by a hyphen (donne-le, a-t-il). */
  hy: boolean;
  /** Punctuation before the word: 0 none, 1 a comma, a bracket, a quotation mark or a dash, 2 a full stop, ; : ! ? … */
  brk: 0 | 1 | 2;
  unk: boolean;
}

const feats = (w: Wd, key: string): string[] => (w.m[key] ? w.m[key].split(',') : []);

/** Gender / number agreement of two words where both are known. */
function agree(a: Wd, b: Wd): { ok: boolean; known: boolean; text: string } {
  let ok = true, known = false;
  const shown: string[] = [];
  for (const key of ['Gender', 'Number']) {
    const x = feats(a, key), y = feats(b, key);
    if (!x.length || !y.length) continue;
    known = true;
    const common = x.find((v) => y.includes(v));
    if (common === undefined) ok = false; else shown.push(NAMES[common] ?? common);
  }
  const text = ok ? shown.join(' ') : `${[...feats(a, 'Gender'), ...feats(a, 'Number')].map((v) => NAMES[v] ?? v).join(' ')} against ${[...feats(b, 'Gender'), ...feats(b, 'Number')].map((v) => NAMES[v] ?? v).join(' ')}`;
  return { ok, known, text };
}

const LABELS: Record<DependencyRelation, (h: string) => string> = {
  root: () => 'the main word of the sentence',
  nsubj: (h) => `subject of ${q(h)}`,
  obj: (h) => `direct object of ${q(h)}`,
  iobj: (h) => `indirect object of ${q(h)} (to or for someone)`,
  obl: (h) => `phrase giving place, time, means or a complement for ${q(h)}`,
  nmod: (h) => `noun that completes ${q(h)}`,
  amod: (h) => `adjective describing ${q(h)}`,
  det: (h) => `article or determiner of ${q(h)}`,
  case: (h) => `preposition introducing ${q(h)}`,
  aux: (h) => `auxiliary of ${q(h)}`,
  cop: (h) => `copula linking ${q(h)}`,
  mark: (h) => `word that introduces the clause of ${q(h)}`,
  advmod: (h) => `adverb or negation modifying ${q(h)}`,
  advcl: (h) => `adverbial clause or phrase belonging to ${q(h)}`,
  acl: (h) => `clause describing ${q(h)}`,
  ccomp: (h) => `clause that is the content of ${q(h)}`,
  xcomp: (h) => `infinitive or predicate completing ${q(h)}`,
  conj: (h) => `coordinated with ${q(h)}`,
  cc: (h) => `joins ${q(h)} to the word before it`,
  nummod: (h) => `number of ${q(h)}`,
  appos: (h) => `apposition to ${q(h)}`,
  vocative: (h) => `addressed person (${q(h)})`,
  discourse: (h) => `discourse word with ${q(h)}`,
  expl: (h) => `pronoun that belongs to the verb ${q(h)}`,
  compound: (h) => `part of a compound with ${q(h)}`,
  flat: (h) => `part of the name ${q(h)}`,
  fixed: (h) => `part of the fixed expression with ${q(h)}`,
  clf: (h) => `classifier of ${q(h)}`,
  punct: () => 'punctuation',
  dep: (h) => `attached to ${q(h)}`,
};

function buildWords(tokens: RawToken[], analyses: AnalyzedToken[]): Wd[] {
  const W: Wd[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (!t.isWord) continue;
    const prev = W[W.length - 1];
    let hy = false;
    let brk: 0 | 1 | 2 = 0;
    if (prev) {
      for (let j = prev.i + 1; j < i; j++) {
        const g = tokens[j]!;
        if (g.isWord) continue;
        if (/^[-‐‑]$/u.test(g.surface) && i - prev.i === 2 && tokens[prev.i]!.end === g.start && g.end === t.start) hy = true;
        else if (/[.!?;:…\n]/u.test(g.surface)) brk = 2;
        else if (brk < 1) brk = 1;
      }
    }
    const cands = analyses[i]?.candidates ?? [];
    const c = cands[0];
    const w: Wd = {
      k: W.length, i, s: t.surface, n: t.normalized, lemma: (c?.lemma ?? t.normalized).toLowerCase(), pos: c?.pos ?? 'UNK',
      m: c?.morph ?? {}, cands, hy, brk, unk: !c || !c.pos,
    };
    W.push(w);
  }
  // s' before il / ils is always "si" (s'il vient): never the reflexive pronoun
  for (const w of W) {
    const nx = W[w.k + 1];
    if (w.n === 's\'' && nx && (nx.n === 'il' || nx.n === 'ils') && !nx.hy && nx.brk === 0) { w.pos = 'SCONJ'; w.lemma = 'si'; w.m = {}; }
  }
  return W;
}

export function frenchSyntax(tokens: RawToken[], analyses: AnalyzedToken[]): SyntaxAnalysis | undefined {
  const W = buildWords(tokens, analyses);
  const m = W.length;
  if (!m) return undefined;
  const w = (k: number): Wd => W[k]!;
  const kOfToken = new Map<number, number>(W.map((z) => [z.i, z.k] as const));
  const R: Array<SyntaxRelation | undefined> = new Array<SyntaxRelation | undefined>(m).fill(undefined);
  const notes: string[] = [];
  const spans: ClauseSpan[] = [];

  /** Record a relation unless the word already has one. Indexes here are word indexes (k). */
  const attach = (dep: number, head: number | undefined, relation: DependencyRelation, basis: string[], confidence: number, alts?: Array<{ head?: number; relation: DependencyRelation; confidence: number; why: string }>, conflicted = false): boolean => {
    if (dep < 0 || dep >= m || R[dep] || (head !== undefined && (head < 0 || head >= m || head === dep))) return false;
    const alternatives: SyntaxAlternative[] | undefined = alts?.filter((a) => a.head === undefined || (a.head !== dep && a.head >= 0 && a.head < m)).map((a) => ({
      ...(a.head !== undefined ? { head: w(a.head).i } : {}), relation: a.relation, confidence: a.confidence, why: a.why,
    }));
    R[dep] = {
      dependent: w(dep).i, ...(head !== undefined ? { head: w(head).i } : {}), relation,
      label: relation === 'root' ? LABELS.root('') : LABELS[relation](head !== undefined ? w(head).s : ''),
      basis, confidence: Math.max(0.1, Math.min(0.95, Math.round(confidence * 100) / 100)),
      ...(alternatives?.length ? { alternatives } : {}),
      status: conflicted || alternatives?.length ? 'conflicted' : 'generated',
    };
    return true;
  };

  // ── readings of a word ──
  const isVerbPos = (x: Wd): boolean => x.pos === 'VERB' || x.pos === 'AUX';
  const finite = (x: Wd | undefined): boolean => !!x && isVerbPos(x) && x.m.VerbForm === 'Fin';
  const infinitive = (x: Wd | undefined): boolean => !!x && isVerbPos(x) && x.m.VerbForm === 'Inf';
  const participle = (x: Wd | undefined): boolean => !!x && isVerbPos(x) && x.m.VerbForm === 'Part';
  const partPast = (x: Wd | undefined): boolean => participle(x) && x!.m.Tense === 'Past';
  const partPres = (x: Wd | undefined): boolean => participle(x) && x!.m.Tense === 'Pres';
  const verbal = (x: Wd | undefined): boolean => finite(x) || infinitive(x) || participle(x);
  const hasReading = (x: Wd, ...pos: string[]): boolean => x.cands.some((c) => c.pos !== undefined && pos.includes(c.pos));
  const nominal = (x: Wd | undefined): boolean => !!x && (x.pos === 'NOUN' || x.pos === 'PROPN');
  const npPron = (x: Wd | undefined): boolean => !!x && x.pos === 'PRON' && STRESSED.has(x.n);

  // ── clitic runs: tgt[k] = the verb that the run of clitics, subject pronouns and ne at k leads to (or -1) ──
  const tgt: number[] = new Array<number>(m).fill(-1);
  for (let k = m - 1; k >= 0; k--) {
    const x = w(k);
    if (finite(x) || infinitive(x) || partPres(x)) { tgt[k] = k; continue; }
    const nx = W[k + 1];
    if (!nx || nx.brk > 0 || nx.hy) continue;
    const neg1 = x.n === 'ne' || x.n === 'n\'';
    const link = CLITIC_TIER[x.n] !== undefined || SUBJECT_FORMS.has(x.n) || neg1 || (NEG_SECOND.has(x.n) && k > 0 && (w(k - 1).n === 'ne' || w(k - 1).n === 'n\''));
    if (!link) continue;
    // en before a present participle is the preposition (en mangeant)
    if (x.n === 'en' && partPres(nx)) continue;
    if (tgt[k + 1]! >= 0) tgt[k] = tgt[k + 1]!;
  }
  const clitic = (k: number): boolean => CLITIC_TIER[w(k).n] !== undefined && tgt[k]! >= 0 && tgt[k] !== k;

  // ── verb groups: an auxiliary with the participle it serves ──
  const lexHead: number[] = Array.from({ length: m }, (_, k) => k);
  const isAuxLemma = (x: Wd): boolean => (x.lemma === 'avoir' || x.lemma === 'être') && isVerbPos(x) && (x.m.VerbForm === 'Fin' || x.m.VerbForm === 'Inf' || x.m.VerbForm === 'Part');
  for (let k = m - 1; k >= 0; k--) {
    const x = w(k);
    if (!isAuxLemma(x)) continue;
    // adverbs, the euphonic t and the inverted subject pronoun may stand between the auxiliary and the participle
    let j = k + 1;
    let ok = false;
    for (let steps = 0; j < m && steps < 6; steps++, j++) {
      const y = w(j);
      if (y.brk === 2) break;
      if (partPast(y)) { ok = true; break; }
      if (y.pos === 'ADV' || y.n === 't' || (y.hy && SUBJECT_FORMS.has(y.n)) || y.n === 'ne' || y.n === 'n\'') continue;
      break;
    }
    if (ok && j !== k) {
      // the participle's own group (a eu vu: eu serves vu) is already resolved to the right
      lexHead[k] = lexHead[j]!;
      const mark = x.lemma === 'être' && w(j).m.Tense === 'Past' ? 'être with a past participle: a compound tense (or a passive)' : 'avoir with a past participle: a compound tense';
      attach(k, lexHead[k], 'aux', [`${q(x.s)} is an auxiliary and ${q(w(lexHead[k]!).s)} its participle`, mark], 0.85);
    }
  }

  // ── noun phrases: determiner, numeral and adjective → noun ──
  /** du / des right after a noun, with an ADP reading: the contraction de + le / les (le chien du voisin), not the partitive article. */
  const contractedDe = (k: number): boolean => {
    const x = w(k);
    if ((x.n !== 'du' && x.n !== 'des') || x.pos === 'ADP' || !hasReading(x, 'ADP') || k === 0 || x.brk > 0) return false;
    const p = w(k - 1);
    return nominal(p) || (p.pos === 'ADJ' && !!R[k - 1] && R[k - 1]!.relation === 'amod');
  };
  const detLike = (k: number): boolean => {
    const x = w(k);
    if (contractedDe(k)) return false;
    if (x.pos === 'DET') return !clitic(k);
    // a pronoun-first reading of le / la / les / ce next to a noun: the article reading is kept
    if (x.pos !== 'PRON' || !x.cands.some((c) => c.pos === 'DET') || clitic(k)) return false;
    const nx = W[k + 1];
    return !!nx && nominal(nx);
  };
  const evidence = (dep: Wd, head: Wd, what: string): { basis: string[]; conf: number; conflicted: boolean } => {
    const a = agree(dep, head);
    if (!a.known) return { basis: [`${what}; gender and number could not be checked`], conf: 0.7, conflicted: false };
    if (a.ok) return { basis: [`${what}; both ${a.text}`], conf: 0.85, conflicted: false };
    return { basis: [`${what}; they do not agree (${a.text}), so this attachment is less sure`], conf: 0.5, conflicted: true };
  };
  for (let k = 0; k < m; k++) {
    const x = w(k);
    const isDet = detLike(k);
    const isNum = x.pos === 'NUM' && x.m.NumType !== 'Ord';
    if (!isDet && !isNum) continue;
    // the noun this word begins: over adjectives, adverbs of degree and further numerals
    let j = k + 1;
    let head = -1;
    for (let steps = 0; j < m && steps < 6; steps++, j++) {
      const y = w(j);
      if (y.brk > 0 || y.hy) break;
      if (nominal(y)) { head = j; break; }
      if (y.pos === 'ADJ' || y.pos === 'NUM' || (y.pos === 'ADV' && DEGREE_ADV.has(y.n)) || y.pos === 'DET') continue;
      break;
    }
    if (head < 0) continue;
    const y = w(head);
    if (isDet) {
      const ev = evidence(x, y, `${q(x.s)} stands before the noun ${q(y.s)}`);
      const alts = ['le', 'la', 'les', 'l\''].includes(x.n) && hasReading(y, 'VERB', 'AUX') && y.cands.some((c) => (c.pos === 'VERB' || c.pos === 'AUX') && c.morph.VerbForm === 'Fin')
        ? [{ head, relation: 'obj' as const, confidence: 0.25, why: `${q(x.s)} could be the pronoun and ${q(y.s)} a verb form` }] : undefined;
      attach(k, head, 'det', ev.basis, ev.conf, alts, ev.conflicted);
    } else {
      attach(k, head, 'nummod', [`the number ${q(x.s)} stands before the noun ${q(y.s)}`], 0.8);
    }
    // adjectives and numerals inside the phrase
    for (let p = k + 1; p < head; p++) {
      const z = w(p);
      if (z.pos === 'ADJ') {
        const ev = evidence(z, y, `${q(z.s)} stands between the determiner and the noun ${q(y.s)}`);
        attach(p, head, 'amod', ev.basis, ev.conf, undefined, ev.conflicted);
      } else if (z.pos === 'NUM') attach(p, head, 'nummod', [`the number ${q(z.s)} before the noun ${q(y.s)}`], 0.75);
    }
  }
  // an adjective after its noun (the very next word, or after an adverb of degree), or before a bare noun
  for (let k = 0; k < m; k++) {
    const x = w(k);
    if (x.pos !== 'ADJ' || R[k]) continue;
    let p = k - 1;
    while (p >= 0 && w(p).pos === 'ADV' && DEGREE_ADV.has(w(p).n) && w(p + 1).brk === 0) p--;
    const before = p >= 0 && nominal(w(p)) && w(p + 1).brk === 0 && !w(p + 1).hy ? p : -1;
    let r = k + 1;
    while (r < m && w(r).pos === 'ADV' && DEGREE_ADV.has(w(r).n) && w(r).brk === 0) r++;
    const after = r < m && nominal(w(r)) && w(r).brk === 0 && !R[r] ? r : -1;
    const chosen = before >= 0 ? before : after;
    if (chosen < 0) continue;
    const y = w(chosen);
    const ev = evidence(x, y, `${q(x.s)} ${chosen === before ? 'follows' : 'precedes'} the noun ${q(y.s)}`);
    const other = chosen === before ? after : before;
    const alts = other >= 0 ? [{ head: other, relation: 'amod' as const, confidence: 0.3, why: `${q(x.s)} also stands next to ${q(w(other).s)}` }] : undefined;
    attach(k, chosen, 'amod', ev.basis, ev.conf, alts, ev.conflicted);
  }

  // ── what a search to the left or right may cross ──
  /** The lexical verb of the nearest verb group to the left of word k, in the same clause (-1 when there is none). */
  const verbLeft = (k: number, window = 10): number => {
    for (let p = k - 1, steps = 0; p >= 0 && steps < window; p--, steps++) {
      if (w(p + 1).brk === 2) return -1;
      const y = w(p);
      if (y.pos === 'SCONJ' || (RELATIVE_FORMS.has(y.n) && y.pos === 'PRON')) return -1;
      if (verbal(y) && !(participle(y) && !y.hy && lexHead[p] !== p)) return lexHead[p]!;
    }
    return -1;
  };
  const finiteRight = (k: number, window = 10): number => {
    for (let p = k + 1, steps = 0; p < m && steps < window; p++, steps++) {
      if (w(p).brk === 2) return -1;
      if (finite(w(p))) return lexHead[p]!;
    }
    return -1;
  };
  /** The head a noun phrase word belongs to: a dependent adjective or de-complement leads back to its noun. */
  const climbNp = (k: number): number => {
    let p = k;
    for (let n = 0; n < 6; n++) {
      const r = R[p];
      if (!r || r.head === undefined) break;
      if (r.relation !== 'amod' && r.relation !== 'nmod' && r.relation !== 'nummod' && r.relation !== 'conj') break;
      const hk = kOfToken.get(r.head) ?? -1;
      if (hk < 0 || hk >= p) break;
      p = hk;
    }
    return p;
  };

  // ── prepositions: → the noun (or the gerund) they introduce, and the phrase → what it belongs to ──
  const attachPhrase = (prep: number, head: number): void => {
    const x = w(prep), y = w(head);
    if (R[head]) return;
    const deType = x.n === 'de' || x.n === 'd\'' || x.n === 'du' || x.n === 'des';
    // the word just before the preposition, over adjectives that belong to the same noun
    let p = prep - 1;
    while (p >= 0 && (w(p).pos === 'ADJ' || w(p).pos === 'ADV') && R[p] && w(p + 1).brk === 0) p--;
    const nounBefore = p >= 0 && nominal(w(p)) && w(p + 1).brk === 0 ? p : -1;
    const vLeft = verbLeft(prep);
    const adjBefore = p >= 0 && w(p).pos === 'ADJ' && w(p + 1).brk === 0 ? p : -1;
    if (deType && nounBefore >= 0) {
      const alts = vLeft >= 0 && prep - vLeft <= 4 ? [{ head: vLeft, relation: 'obl' as const, confidence: 0.3, why: `the phrase could belong to the verb ${q(w(vLeft).s)} instead` }] : undefined;
      attach(head, nounBefore, 'nmod', [`${q(x.s)} ${q(y.s)} completes the noun ${q(w(nounBefore).s)} (le livre de Paul)`], 0.75, alts);
      return;
    }
    if (adjBefore >= 0) { attach(head, adjBefore, 'obl', [`${q(x.s)} ${q(y.s)} completes the adjective ${q(w(adjBefore).s)} (content de, difficile à)`], 0.55); return; }
    if (vLeft >= 0) {
      const alts = nounBefore >= 0 && !deType ? [{ head: nounBefore, relation: 'nmod' as const, confidence: 0.4, why: `the phrase could also describe the noun ${q(w(nounBefore).s)} just before it` }] : undefined;
      attach(head, vLeft, 'obl', [`${q(x.s)} ${q(y.s)} follows the verb ${q(w(vLeft).s)}: a complement or an adverbial phrase`], nounBefore >= 0 && !deType ? 0.5 : 0.65, alts);
      return;
    }
    if (nounBefore >= 0) { attach(head, nounBefore, 'nmod', [`${q(x.s)} ${q(y.s)} follows the noun ${q(w(nounBefore).s)}`], 0.5); return; }
    const vRight = finiteRight(head);
    if (vRight >= 0) attach(head, vRight, 'obl', [`the phrase begins the sentence; its verb ${q(w(vRight).s)} comes after it`], 0.5);
  };
  for (let k = 0; k < m; k++) {
    const x = w(k);
    if ((x.pos !== 'ADP' && !contractedDe(k)) || clitic(k) || R[k]) continue;
    let j = k + 1;
    let head = -1;
    for (let steps = 0; j < m && steps < 6; steps++, j++) {
      const y = w(j);
      if (y.brk > 0 || y.hy) break;
      if (nominal(y) || npPron(y)) { head = j; break; }
      if (y.pos === 'ADJ' || y.pos === 'NUM' || y.pos === 'DET' || (y.pos === 'ADV' && DEGREE_ADV.has(y.n))) continue;
      break;
    }
    if (head < 0) continue;
    const comps = (x.pos === 'ADP' ? x.cands[0] : x.cands.find((c) => c.pos === 'ADP'))?.notes?.components;
    const basis = Array.isArray(comps) && comps.length === 2
      ? [`${q(x.s)} is a contraction of ${comps[0]} + ${comps[1]}: the article is inside the word`, `it introduces ${q(w(head).s)}`]
      : [`${q(x.s)} is a preposition and ${q(w(head).s)} the noun it introduces`];
    attach(k, head, 'case', basis, 0.85);
    attachPhrase(k, head);
  }
  // en + a present participle: the gerund (en mangeant)
  for (let k = 0; k + 1 < m; k++) {
    if (w(k).n === 'en' && partPres(w(k + 1)) && !w(k + 1).hy && w(k + 1).brk === 0) {
      attach(k, k + 1, 'mark', [`en with a present participle: the gerund (“while …ing”, “by …ing”)`], 0.8);
      const v = verbLeft(k);
      const vr = v < 0 ? finiteRight(k + 1) : -1;
      const target = v >= 0 ? v : vr;
      if (target >= 0) attach(k + 1, target, 'advcl', [`the gerund ${q(w(k + 1).s)} tells how or when ${q(w(target).s)} happens`], 0.65);
    }
  }

  // ── coordination of nouns, adjectives and adverbs (verbs come later, when the clauses are known) ──
  const klass = (x: Wd): string => (nominal(x) || npPron(x) ? 'N' : x.pos === 'ADJ' ? 'A' : x.pos === 'ADV' ? 'D' : '');
  const coordinate = (c: number, clauseLevel: boolean): void => {
    const cx = w(c);
    if (cx.pos !== 'CONJ' && cx.pos !== 'CCONJ' && !CC_SET.has(cx.n)) return;
    if (!CC_SET.has(cx.n) || R[c]) return;
    if (clauseLevel) {
      // finite verb groups on both sides
      let lp = c - 1;
      let left = -1;
      for (let steps = 0; lp >= 0 && steps < 12; lp--, steps++) {
        if (w(lp + 1).brk === 2) break;
        if (finite(w(lp))) { left = lexHead[lp]!; break; }
      }
      const right = finiteRight(c);
      if (left < 0 || right < 0 || left === right || R[right]) return;
      attach(right, left, 'conj', [`${q(cx.s)} joins two clauses: ${q(w(left).s)} and ${q(w(right).s)}`], 0.6);
      attach(c, right, 'cc', [`${q(cx.s)} comes before the clause of ${q(w(right).s)}`], 0.7);
      return;
    }
    let l = c - 1;
    if (l < 0 || (w(c).brk === 2)) return;
    // a comma before the conjunction ends a list item: the conjunct is still the word before it
    let L = l;
    let cl = klass(w(L));
    if (!cl) return;
    // an adjective or a de-complement that belongs to a noun: coordinate with the noun when the right conjunct is a noun
    let r = c + 1;
    while (r < m && (w(r).pos === 'DET' || w(r).pos === 'NUM' || (w(r).pos === 'ADP' && cl === 'N' && !!R[L] && (R[L]!.relation === 'obl' || R[L]!.relation === 'nmod')) || (w(r).pos === 'ADJ' && klass(w(L)) === 'N' && r + 1 < m && nominal(w(r + 1))) || (w(r).pos === 'ADV' && DEGREE_ADV.has(w(r).n))) && r - c < 5) r++;
    if (r >= m) return;
    const rk = klass(w(r));
    if (!rk) return;
    if (rk !== cl) {
      if (rk === 'N' && cl !== 'N') { L = climbNp(L); cl = klass(w(L)); }
      if (rk !== cl) return;
    }
    if (w(r).brk === 2) return;
    // the right conjunct must not be a noun that is already a complement of a verb on the left unless it is a bare list item
    attach(r, L, 'conj', [`${q(cx.s)} joins ${q(w(L).s)} and ${q(w(r).s)}: two words of the same kind`], 0.7);
    if (!R[c]) attach(c, r, 'cc', [`${q(cx.s)} comes just before ${q(w(r).s)}`], 0.8);
    l = L;
  };
  for (let k = 0; k < m; k++) coordinate(k, false);
  const conjHeads = new Set<number>();
  for (const r of R) if (r?.relation === 'conj' && r.head !== undefined) conjHeads.add(r.head);

  // ── subjects, clitic pronouns, inverted subjects ──
  const personText = (x: Wd): string => `${feats(x, 'Person').map((p) => NAMES[p] ?? p).join(' or ') || 'person unknown'}${feats(x, 'Number').length ? ' ' + feats(x, 'Number').map((p) => NAMES[p] ?? p).join('/') : ''}`;
  /** Persons and numbers a finite word can have, over its readings of the same lemma. */
  const personsOf = (x: Wd): { p: Set<string>; n: Set<string> } => {
    const p = new Set<string>(), nn = new Set<string>();
    for (const c of x.cands) {
      if ((c.pos !== 'VERB' && c.pos !== 'AUX') || (c.lemma ?? '').toLowerCase() !== x.lemma || c.morph.VerbForm !== 'Fin') continue;
      for (const v of (c.morph.Person ?? '').split(',')) if (v) p.add(v);
      for (const v of (c.morph.Number ?? '').split(',')) if (v) nn.add(v);
    }
    if (!p.size) for (const v of feats(x, 'Person')) p.add(v);
    if (!nn.size) for (const v of feats(x, 'Number')) nn.add(v);
    return { p, n: nn };
  };
  /** Agreement of a subject with the finite verb: person and number. */
  const subjectEvidence = (sub: Wd, f: Wd, coordinated: boolean): { basis: string[]; conf: number; conflicted: boolean } => {
    const { p, n: nn } = personsOf(f);
    const sp = feats(sub, 'Person');
    const sn = feats(sub, 'Number');
    const wantP = sp.length ? sp : ['3'];
    let ok = true;
    if (p.size && !wantP.some((v) => p.has(v))) ok = false;
    if (!coordinated && nn.size && sn.length && !sn.some((v) => nn.has(v))) ok = false;
    const what = `${q(sub.s)} stands before the verb ${q(f.s)}`;
    if (!p.size && !nn.size) return { basis: [`${what}; the verb form's person and number are not known`], conf: 0.65, conflicted: false };
    if (ok) return { basis: [`${what}; the verb ending fits (${personText(f)})`], conf: 0.85, conflicted: false };
    return { basis: [`${what}; the verb is ${personText(f)} and the subject does not match, so this is less sure`], conf: 0.5, conflicted: true };
  };
  const relationOfClitic = (run: number[], idx: number, head: number): void => {
    const x = w(run[idx]!);
    const tier = CLITIC_TIER[x.n]!;
    const hv = w(head);
    const order = run.map((r) => CLITIC_TIER[w(r).n]!);
    const inOrder = order.every((t, a) => a === 0 || order[a - 1]! <= t);
    const orderNote = inOrder ? [] : ['the pronouns are not in the usual order (me te se nous vous · le la les · lui leur · y · en)'];
    const penalty = inOrder ? 0 : 0.2;
    const hasAccusative = run.some((r) => CLITIC_TIER[w(r).n] === 2);
    if (x.n === 'se' || x.n === 's\'') {
      const pron = hv.cands.some((c) => c.notes?.pronominal === 'yes');
      attach(run[idx]!, head, 'expl', [`${q(x.s)} goes with the verb ${q(hv.s)}: reflexive or pronominal`, ...orderNote], (pron ? 0.85 : 0.7) - penalty,
        [{ head, relation: 'obj', confidence: 0.2, why: `${q(x.s)} could also be a direct object (him / herself)` }]);
    } else if (tier === 1) {
      if (hasAccusative) attach(run[idx]!, head, 'iobj', [`${q(x.s)} comes before le / la / les: the indirect object (me le donne)`, ...orderNote], 0.8 - penalty);
      else attach(run[idx]!, head, 'obj', [`${q(x.s)} stands before the verb ${q(hv.s)}: an object pronoun`, ...orderNote], 0.65 - penalty, [
        { head, relation: 'iobj', confidence: 0.35, why: `${q(x.s)} is also the indirect object form (to me, to you)` },
        { head, relation: 'expl', confidence: 0.25, why: `${q(x.s)} could be the reflexive pronoun of a pronominal verb` }]);
    } else if (tier === 2) {
      attach(run[idx]!, head, 'obj', [`${q(x.s)} stands before the verb ${q(hv.s)}: the direct object pronoun (him, her, it, them)`, ...orderNote], 0.8 - penalty);
    } else if (tier === 3) {
      attach(run[idx]!, head, 'iobj', [`${q(x.s)} stands before the verb ${q(hv.s)}: the indirect object pronoun (to him, to her, to them)`, ...orderNote], 0.8 - penalty);
    } else if (tier === 4) {
      attach(run[idx]!, head, 'obl', [`y replaces “to / at / in” + a place or a thing already mentioned`, ...orderNote], 0.6 - penalty);
    } else {
      attach(run[idx]!, head, 'obl', [`en replaces “of / from” + something already mentioned, or “some of it”`, ...orderNote], 0.6 - penalty,
        [{ head, relation: 'obj', confidence: 0.35, why: 'en can also stand for the partitive object (j’en veux: I want some)' }]);
    }
  };
  for (let f = 0; f < m; f++) {
    const x = w(f);
    const isFin = finite(x), isInf = infinitive(x) || partPres(x);
    if (!isFin && !isInf) continue;
    const head = lexHead[f]!;
    // the run of clitics, subject pronouns and ne before the verb
    const run: number[] = [];
    for (let j = f - 1; j >= 0 && tgt[j] === f && w(j + 1).brk === 0 && !w(j + 1).hy; j--) run.unshift(j);
    let subject = -1;
    let rest = run;
    if (isFin && run.length && SUBJECT_FORMS.has(w(run[0]!).n)) {
      subject = run[0]!;
      rest = run.slice(1);
    }
    if (isFin && subject < 0) {
      // a noun phrase before the run (le chat dort, Paul ne le voit pas), over its own adjectives and complements
      const start = run.length ? run[0]! : f;
      const p0 = start - 1;
      if (p0 >= 0 && w(start).brk === 0 && !w(start).hy) {
        const p = climbNp(p0);
        const px = w(p);
        if ((nominal(px) || npPron(px)) && !R[p]) {
          const coordinated = conjHeads.has(px.i);
          const ev = subjectEvidence(px, w(f), coordinated);
          attach(p, head, 'nsubj', [...ev.basis, ...(coordinated ? ['the subject is two coordinated nouns, so it counts as plural'] : [])], ev.conf, undefined, ev.conflicted);
        }
      }
    } else if (subject >= 0) {
      const ev = subjectEvidence(w(subject), w(f), false);
      attach(subject, head, 'nsubj', ev.basis, ev.conf, w(subject).n === 'nous' || w(subject).n === 'vous'
        ? [{ head, relation: 'obj', confidence: 0.2, why: `${q(w(subject).s)} can also be an object pronoun` }] : undefined, ev.conflicted);
    }
    const clitics = rest.filter((r) => CLITIC_TIER[w(r).n] !== undefined && clitic(r));
    clitics.forEach((r) => { const idx = clitics.indexOf(r); relationOfClitic(clitics, idx, head); });
    // inverted subject and postposed pronouns: a-t-il, dit-elle, est-ce, donne-le-moi
    let j = f + 1;
    const imperative = x.m.Mood === 'Imp' || (isFin && !x.m.Tense && !x.m.Mood);
    const post: number[] = [];
    while (j < m && w(j).hy) { post.push(j); j++; }
    const hasAcc = post.some((p) => ['le', 'la', 'les', 'l\''].includes(w(p).n));
    for (const p of post) {
      const y = w(p);
      if (y.n === 't') { attach(p, head, 'expl', ['the t between a verb and il, elle or on is only a sound link (a-t-il)'], 0.75); continue; }
      if (isFin && SUBJECT_ONLY.has(y.n) || (isFin && !imperative && SUBJECT_FORMS.has(y.n))) {
        const ev = subjectEvidence(y, x, false);
        attach(p, head, 'nsubj', [`inverted order: the pronoun ${q(y.s)} follows the verb ${q(x.s)}`, ...ev.basis.slice(1)], ev.conf, undefined, ev.conflicted);
        continue;
      }
      if (imperative || !isFin) {
        const tier = CLITIC_TIER[y.n] ?? (y.n === 'moi' || y.n === 'toi' ? 1 : 0);
        if (tier === 2) attach(p, head, 'obj', [`${q(y.s)} after the command ${q(x.s)}: the direct object pronoun`], 0.75);
        else if (tier === 3) attach(p, head, 'iobj', [`${q(y.s)} after the command ${q(x.s)}: the indirect object pronoun`], 0.75);
        else if (tier === 1) attach(p, head, hasAcc ? 'iobj' : 'obj', [`${q(y.s)} after the command ${q(x.s)}: ${hasAcc ? 'the indirect object (donne-le-moi)' : 'an object pronoun'}`], hasAcc ? 0.7 : 0.55,
          hasAcc ? undefined : [{ head, relation: 'iobj', confidence: 0.35, why: 'moi / toi can be indirect (to me, to you)' }]);
        else if (tier === 4 || tier === 5) attach(p, head, 'obl', [`${q(y.s)} after the command ${q(x.s)}`], 0.55);
      }
    }
  }

  // ── negation: ne and its second element ──
  for (let k = 0; k < m; k++) {
    const x = w(k);
    if (x.n !== 'ne' && x.n !== 'n\'') continue;
    const v = tgt[k]!;
    if (v < 0) continue;
    const head = lexHead[v]!;
    attach(k, head, 'advmod', [`${q(x.s)} is the first half of the negation of ${q(w(head).s)}`], 0.85);
    // the second element: the first of pas plus jamais point guère rien personne after the verb group, in the same clause
    const from = Math.max(v, head);
    let found = false;
    for (let p = from + 1, steps = 0; p < m && steps < 8; p++, steps++) {
      if (w(p).brk === 2) break;
      const y = w(p);
      if (NEG_SECOND.has(y.n) && !R[p]) {
        if (y.n === 'rien' || y.n === 'personne') attach(p, head, 'obj', [`${q(y.s)} is a negative pronoun with ne: nothing / no one, the object of ${q(w(head).s)}`], 0.6,
          [{ head, relation: 'nsubj', confidence: 0.2, why: `${q(y.s)} can also be the subject (personne ne vient)` }]);
        else attach(p, head, 'advmod', [`${q(y.s)} is the second half of the negation (ne … ${y.n})`], 0.85);
        found = true;
        break;
      }
      if (y.n === 'que' || y.n === 'qu\'') {
        if (y.cands.some((c) => c.pos === 'ADV') && !R[p]) { attach(p, head, 'advmod', [`ne … que means “only”: que is not the conjunction here`], 0.55); found = true; }
        break;
      }
      if (finite(y) && p > from + 1) break;
    }
    // a negative word before ne: personne ne vient, rien ne change
    if (!found) {
      for (let p = k - 1, steps = 0; p >= 0 && steps < 3; p--, steps++) {
        if (w(p + 1).brk > 0) break;
        const y = w(p);
        if ((y.n === 'rien' || y.n === 'personne' || y.n === 'aucun' || y.n === 'aucune') && !R[p]) { attach(p, head, 'nsubj', [`${q(y.s)} before ne: the subject of the negative clause (${y.s} ne …)`], 0.65); break; }
      }
    }
  }
  // pas, plus, jamais with no ne (spoken style): they modify the verb next to them
  // (handled with the other adverbs below)

  // ── infinitives ──
  for (let k = 0; k < m; k++) {
    const x = w(k);
    if (!infinitive(x) || R[k]) continue;
    // the run of clitics and ne before the infinitive
    let s = k;
    while (s - 1 >= 0 && tgt[s - 1] === k && w(s).brk === 0 && !w(s).hy) s--;
    const q0 = s - 1;
    if (q0 < 0 || w(s).brk > 0) continue;
    const gov = w(q0);
    if (gov.pos === 'ADP' && PREP_INF.has(gov.n) && !R[q0]) {
      attach(q0, k, 'mark', [`${q(gov.s)} introduces the infinitive ${q(x.s)}`], 0.85);
      // what the preposition (and its infinitive) belongs to
      let p = q0 - 1;
      if (gov.n === 'de' || gov.n === 'd\'') { while (p >= 0 && (w(p).n === 'afin' || w(p).n === 'avant') && w(p + 1).brk === 0) p--; }
      const adverbial = ADVERBIAL_PREP_INF.has(gov.n) || (q0 > 0 && (w(q0 - 1).n === 'afin' || w(q0 - 1).n === 'avant'));
      if (adverbial) {
        const v = verbLeft(q0);
        const vr = v < 0 ? finiteRight(k) : -1;
        const target = v >= 0 ? v : vr;
        if (target >= 0) attach(k, target, 'advcl', [`${q(gov.s)} + infinitive gives a purpose, a manner or a time for ${q(w(target).s)}`], 0.7);
      } else {
        // à / de + infinitive: the verb, adjective or noun before the preposition (over a noun phrase that is its object)
        let found = -1;
        let relation: DependencyRelation = 'xcomp';
        let conf = 0.7;
        let alt: Array<{ head?: number; relation: DependencyRelation; confidence: number; why: string }> | undefined;
        for (let b = p, steps = 0; b >= 0 && steps < 8; b--, steps++) {
          if (w(b + 1).brk === 2) break;
          const y = w(b);
          if (verbal(y) && !(participle(y) && lexHead[b] !== b && b < lexHead[b]!)) { found = lexHead[b]!; conf = b === p || (b === p - 1 && w(p).pos === 'ADV') ? 0.8 : 0.6; break; }
          if (y.pos === 'ADJ' && b === p) { found = b; conf = 0.6; break; }
          if (nominal(y) && b === p) {
            const v = verbLeft(b);
            found = b; relation = 'acl'; conf = 0.5;
            if (v >= 0) alt = [{ head: v, relation: 'xcomp', confidence: 0.4, why: `the infinitive could also depend on the verb ${q(w(v).s)} (it persuaded Marie to …)` }];
            break;
          }
        }
        if (found >= 0) attach(k, found, relation, [`${q(gov.s)} + infinitive after ${q(w(found).s)}: it completes its meaning`], conf, alt);
      }
      continue;
    }
    if (verbal(gov) && !gov.hy && w(s).brk === 0) {
      const h = lexHead[q0]!;
      const known = DIRECT_INF.has(w(h).lemma) || DIRECT_INF.has(gov.lemma);
      attach(k, h, 'xcomp', [`the infinitive ${q(x.s)} comes straight after ${q(gov.s)}${known ? ', a verb that takes an infinitive' : ': the rules do not know whether this verb takes an infinitive'}`], known ? 0.85 : 0.55);
    }
  }

  // ── relative pronouns, que, and the subordinating words ──
  const clauseVerb = (k: number, window = 8): number => {
    for (let p = k + 1, steps = 0; p < m && steps < window; p++, steps++) {
      if (w(p).brk === 2) return -1;
      if (finite(w(p))) return p;
    }
    return -1;
  };
  const clauseEnd = (cv: number): number => {
    let e = lexHead[cv]! > cv ? lexHead[cv]! : cv;
    while (e + 1 < m && w(e + 1).brk === 0) e++;
    return Math.min(m - 1, e);
  };
  for (let k = 0; k < m; k++) {
    const x = w(k);
    if (R[k]) continue;
    // qu'est-ce qui / que : the interrogative inversion
    if ((x.n === 'qu\'' || x.n === 'que' || x.n === 'qui') && W[k + 1] && w(k + 1).n === 'est' && W[k + 2]?.n === 'ce' && W[k + 2]?.hy && (W[k + 3]?.n === 'que' || W[k + 3]?.n === 'qu\'' || W[k + 3]?.n === 'qui')) {
      const second = k + 3;
      const cv = clauseVerb(second);
      if (cv >= 0) {
        const isSubj = w(second).n === 'qui';
        attach(k, lexHead[cv], isSubj ? 'nsubj' : 'obj', [`qu’est-ce ${isSubj ? 'qui' : 'que'}: “what” is the ${isSubj ? 'subject' : 'object'} of ${q(w(cv).s)}`], 0.6);
        attach(second, lexHead[cv], 'mark', ['est-ce que / est-ce qui: the question marker'], 0.7);
        attach(k + 1, lexHead[cv], 'mark', ['part of est-ce que: the question marker'], 0.65);
      }
      continue;
    }
    if (!RELATIVE_FORMS.has(x.n) && !SUBORDINATORS.has(x.n) && x.pos !== 'SCONJ') continue;
    // est-ce que after the verb of a question
    if ((x.n === 'que' || x.n === 'qu\'') && k >= 3 && w(k - 1).n === 'ce' && w(k - 1).hy && w(k - 2).n === 'est') {
      const cv = clauseVerb(k);
      if (cv >= 0) { attach(k, lexHead[cv], 'mark', ['est-ce que: the question marker'], 0.75); attach(k - 2, lexHead[cv], 'mark', ['part of est-ce que: the question marker'], 0.65); }
      continue;
    }
    const isRelWord = RELATIVE_FORMS.has(x.n);
    const a = k - 1;
    // the antecedent: the noun phrase just before (over a comma and a de-complement)
    let ant = -1;
    let altAnt = -1;
    if (a >= 0 && w(k).brk < 2) {
      let p = a;
      if (w(p).pos === 'ADP') {
        // dans laquelle, à qui: the phrase before the preposition
        const pp = p - 1;
        if (pp >= 0 && (x.n === 'qui' || /^l?(?:e|a)quel|^lesquel|^auquel|^duquel/u.test(x.n))) {
          const cp = climbNp(pp);
          if (nominal(w(cp)) || npPron(w(cp))) {
            const cv = clauseVerb(k);
            if (cv >= 0) {
              attach(p, k, 'case', [`${q(w(p).s)} introduces the relative pronoun ${q(x.s)}`], 0.8);
              attach(k, lexHead[cv], 'obl', [`${q(w(p).s)} ${q(x.s)}: the relative pronoun after a preposition, a complement of ${q(w(cv).s)}`], 0.6);
              attach(lexHead[cv]!, cp, 'acl', [`the relative clause ${q(w(p).s)} ${q(x.s)} … describes ${q(w(cp).s)}`], 0.7);
              spans.push({ start: w(p).i, end: w(clauseEnd(cv)).i, kind: 'relative', marker: w(k).i, label: `relative clause with “${w(p).s} ${x.s}”` });
            }
            continue;
          }
        }
      } else {
        const cp = climbNp(p);
        p = (nominal(w(p)) || w(p).pos === 'ADJ' || npPron(w(p)) || w(p).n === 'ce' || w(p).n === 'celui') ? p : -1;
        if (p >= 0) {
          const root = nominal(w(cp)) || npPron(w(cp)) ? cp : p;
          ant = root;
          if (root !== p || (R[p]?.relation === 'nmod')) altAnt = root !== p ? p : (R[p]?.head !== undefined ? (kOfToken.get(R[p]!.head!) ?? -1) : -1);
        }
      }
    }
    // que after a verb, an adjective or the first word of a conjunction phrase is the conjunction, not the pronoun
    const prevVerbal = a >= 0 && w(k).brk < 2 && (verbal(w(a)) || (w(a).pos === 'ADJ' && R[a]?.relation === 'xcomp') || (w(a).pos === 'ADJ'));
    const phrase = a >= 0 && CONJ_BEFORE_QUE.has(w(a).n) && (x.n === 'que' || x.n === 'qu\'') && w(a).brk + w(k).brk < 4;
    if ((x.n === 'que' || x.n === 'qu\'') && phrase) {
      const cv = clauseVerb(k);
      if (cv >= 0) {
        attach(a, lexHead[cv], 'mark', [`${q(w(a).s)} que together introduce the clause of ${q(w(cv).s)}`], 0.8);
        attach(k, a, 'fixed', [`que is the second part of “${w(a).s} que”`], 0.8);
        const main = verbLeft(a) >= 0 ? verbLeft(a) : finiteRightAfterComma(cv);
        if (main >= 0 && main !== lexHead[cv]) attach(lexHead[cv]!, main, 'advcl', [`the clause with “${w(a).s} que” belongs to ${q(w(main).s)}`], 0.6);
        spans.push({ start: w(a).i, end: w(clauseEnd(cv)).i, kind: 'subordinate', marker: w(a).i, label: `clause introduced by “${w(a).s} que”` });
      }
      continue;
    }
    if ((x.n === 'que' || x.n === 'qu\'') && !COMPARATIVE.has(w(Math.max(0, a)).n)) {
      if (ant >= 0 && isRelWord && !(prevVerbal && !nominal(w(a)))) {
        const cv = clauseVerb(k);
        if (cv < 0) continue;
        const head = lexHead[cv]!;
        attach(k, head, 'obj', [`que is the relative pronoun: the object of ${q(w(head).s)}, standing for ${q(w(ant).s)}`], 0.7,
          [{ head, relation: 'mark', confidence: 0.3, why: `que could be the conjunction “that” after the noun ${q(w(ant).s)}` }]);
        attach(head, ant, 'acl', [`the relative clause with que describes ${q(w(ant).s)}`], 0.7, altAnt >= 0 ? [{ head: altAnt, relation: 'acl', confidence: 0.3, why: `it could describe ${q(w(altAnt).s)} instead` }] : undefined);
        spans.push({ start: x.i, end: w(clauseEnd(cv)).i, kind: 'relative', marker: x.i, label: `relative clause with “${x.s}”` });
        continue;
      }
      if (a >= 0 && (verbal(w(a)) || w(a).pos === 'ADJ')) {
        const cv = clauseVerb(k);
        if (cv < 0) continue;
        const gov = verbal(w(a)) ? lexHead[a]! : a;
        attach(k, lexHead[cv], 'mark', [`que after ${q(w(a).s)} is the conjunction “that”: it introduces the clause of ${q(w(cv).s)}`], 0.8);
        attach(lexHead[cv]!, gov, 'ccomp', [`the clause with que is what ${q(w(gov).s)} says, thinks or feels`], finite(w(a)) ? 0.8 : 0.6);
        spans.push({ start: x.i, end: w(clauseEnd(cv)).i, kind: 'subordinate', marker: x.i, label: 'clause introduced by “que”' });
        continue;
      }
      // sentence-initial que: a question (Que veux-tu ?) or a wish; the verb comes next
      const cv = clauseVerb(k);
      if (cv >= 0 && a < 0) attach(k, lexHead[cv], 'obj', [`que opens the question: “what”, the object of ${q(w(cv).s)}`], 0.5);
      continue;
    }
    if (x.n === 'qui') {
      const cv = clauseVerb(k);
      if (cv < 0) continue;
      const head = lexHead[cv]!;
      attach(k, head, 'nsubj', [ant >= 0 ? `qui is the relative pronoun: the subject of ${q(w(head).s)}, standing for ${q(w(ant).s)}` : `qui is the subject of ${q(w(head).s)}: “who”`], ant >= 0 ? 0.8 : 0.6);
      if (ant >= 0) {
        attach(head, ant, 'acl', [`the relative clause with qui describes ${q(w(ant).s)}`], 0.75, altAnt >= 0 ? [{ head: altAnt, relation: 'acl', confidence: 0.3, why: `it could describe ${q(w(altAnt).s)} instead` }] : undefined);
        spans.push({ start: x.i, end: w(clauseEnd(cv)).i, kind: 'relative', marker: x.i, label: 'relative clause with “qui”' });
      }
      continue;
    }
    if (x.n === 'dont' || x.n === 'où') {
      const cv = clauseVerb(k);
      if (cv < 0) continue;
      const head = lexHead[cv]!;
      const dont = x.n === 'dont';
      attach(k, head, 'obl', [dont ? `dont stands for “of whom / of which” (de + the antecedent): a complement of ${q(w(head).s)}` : `où stands for a place or a time: ${ant >= 0 ? `where / when ${q(w(ant).s)} …` : 'the question “where”'}`], ant >= 0 ? 0.7 : 0.55);
      if (ant >= 0) {
        attach(head, ant, 'acl', [`the relative clause with ${x.n} describes ${q(w(ant).s)}`], 0.7);
        spans.push({ start: x.i, end: w(clauseEnd(cv)).i, kind: 'relative', marker: x.i, label: `relative clause with “${x.n}”` });
      }
      continue;
    }
    if (/^(?:lequel|laquelle|lesquels|lesquelles|duquel|desquels|desquelles|auquel|auxquels)$/u.test(x.n)) {
      const cv = clauseVerb(k);
      if (cv >= 0) {
        attach(k, lexHead[cv], 'obl', [`${q(x.s)} is a relative pronoun with its preposition inside or before it`], 0.5);
        if (ant >= 0) attach(lexHead[cv]!, ant, 'acl', [`the relative clause with ${q(x.s)} describes ${q(w(ant).s)}`], 0.6);
      }
      continue;
    }
    // other subordinating words: si, quand, lorsque, comme, puisque, parce (que) …
    if (x.pos === 'SCONJ' && x.n !== 'que' && x.n !== 'qu\'') {
      const cv = clauseVerb(k);
      if (cv < 0) continue;
      const head = lexHead[cv]!;
      attach(k, head, 'mark', [`${q(x.s)} introduces the clause of ${q(w(head).s)}`], 0.8);
      const left = verbLeft(k);
      const right = finiteRightAfterComma(cv);
      const initial = left < 0;
      const main = initial ? right : left;
      if (main >= 0 && main !== head) {
        attach(head, main, 'advcl', [initial ? `the clause with ${q(x.s)} opens the sentence; its main verb ${q(w(main).s)} comes after it` : `the clause with ${q(x.s)} belongs to ${q(w(main).s)}`], 0.6,
          !initial && right >= 0 && right !== main ? [{ head: right, relation: 'advcl', confidence: 0.25, why: `it could also belong to the later verb ${q(w(right).s)}` }] : undefined);
      }
      spans.push({ start: x.i, end: w(clauseEnd(cv)).i, kind: 'subordinate', marker: x.i, label: `clause introduced by “${x.s}”` });
    }
  }
  /** The first finite verb group after the next comma that follows verb cv (a subordinate clause that opens the sentence). */
  function finiteRightAfterComma(cv: number): number {
    let comma = false;
    for (let p = cv + 1, steps = 0; p < m && steps < 14; p++, steps++) {
      if (w(p).brk === 2) return -1;
      if (w(p).brk === 1) comma = true;
      if (comma && finite(w(p)) && lexHead[p] !== lexHead[cv]) return lexHead[p]!;
    }
    return -1;
  }

  // ── what is still bare: the objects, the predicates, adverbs ──
  const withSubject = new Set<number>();
  for (const r of R) if (r?.relation === 'nsubj' && r.head !== undefined) withSubject.add(r.head);
  for (let k = 0; k < m; k++) {
    const x = w(k);
    if (R[k] || !(nominal(x) || npPron(x))) continue;
    // the start of the noun phrase: its own determiner, numerals and adjectives
    let s = k;
    while (s - 1 >= 0 && R[s - 1] && R[s - 1]!.head === x.i && !w(s).hy && w(s).brk === 0) s--;
    let b = s - 1;
    // postposed pronouns and the euphonic t after the verb (a-t-il peur: the object follows il)
    while (b > 0 && w(b).hy && R[b]) b--;
    while (b >= 0 && w(b).pos === 'ADV' && w(b + 1).brk === 0 && !R[b]) b--;
    if (b < 0) continue;
    // no punctuation between the verb and the noun phrase
    let clear = true;
    for (let z = b + 1; z <= s; z++) if (w(z).brk > 0) clear = false;
    if (!clear) continue;
    const y = w(b);
    if (!verbal(y) || (participle(y) && lexHead[b] !== b && lexHead[b]! > b)) continue;
    const v = lexHead[b]!;
    const vx = w(v);
    const hasSubject = withSubject.has(vx.i);
    if (COPULA.has(vx.lemma) || COPULA.has(y.lemma)) {
      attach(k, v, 'xcomp', [`${q(x.s)} follows ${q(vx.s)} (be, become, seem): it says what the subject is`], 0.6);
    } else {
      attach(k, v, 'obj', [`${q(x.s)} follows the verb ${q(vx.s)} with no preposition: its direct object`], hasSubject ? 0.7 : 0.5,
        !hasSubject ? [{ head: v, relation: 'nsubj', confidence: 0.3, why: `no subject was found before ${q(vx.s)}: ${q(x.s)} could be an inverted subject` }] : undefined);
    }
  }
  for (let k = 0; k < m; k++) {
    const x = w(k);
    if (R[k] || x.pos !== 'ADJ') continue;
    let b = k - 1;
    while (b >= 0 && w(b).pos === 'ADV' && w(b + 1).brk === 0) b--;
    if (b >= 0 && verbal(w(b)) && COPULA.has(w(lexHead[b]!).lemma) && w(b + 1).brk === 0) {
      attach(k, lexHead[b]!, 'xcomp', [`${q(x.s)} follows ${q(w(lexHead[b]!).s)}: it says what the subject is like`], 0.7);
    }
  }
  for (let k = 0; k < m; k++) {
    const x = w(k);
    if (R[k]) continue;
    if (x.pos === 'ADV') {
      // an adverb of degree before an adjective or an adverb
      const nx = W[k + 1];
      if (nx && nx.brk === 0 && (nx.pos === 'ADJ' || nx.pos === 'ADV') && DEGREE_ADV.has(x.n)) { attach(k, k + 1, 'advmod', [`${q(x.s)} is an adverb of degree before ${q(nx.s)}`], 0.7); continue; }
      const interrogative = INTERROG_ADV.has(x.n) && (k === 0 || x.brk > 0 || W[k - 1]?.pos === 'ADP');
      let target = -1;
      if (interrogative) target = finiteRight(k);
      if (target < 0) { const p = k - 1; if (p >= 0 && w(k).brk === 0 && verbal(w(p))) target = lexHead[p]!; }
      if (target < 0) { for (let p = k + 1, steps = 0; p < m && steps < 3; p++, steps++) { if (w(p).brk > 0 && steps > 0) break; if (verbal(w(p))) { target = lexHead[p]!; break; } } }
      if (target >= 0 && target !== k) attach(k, target, 'advmod', [`${q(x.s)} is an adverb standing next to the verb ${q(w(target).s)}`], 0.55);
      continue;
    }
    if (x.n === 't' && x.hy && k > 0 && verbal(w(k - 1))) { attach(k, lexHead[k - 1]!, 'expl', ['the t between a verb and il, elle or on is only a sound link'], 0.7); continue; }
  }
  // coordination of verbs and clauses, now that the clauses are known
  for (let k = 0; k < m; k++) coordinate(k, true);

  // ── the main word ──
  const rootCandidates = W.filter((z) => finite(z) && lexHead[z.k] === z.k && !R[z.k]);
  const withAux = W.filter((z) => finite(z) && lexHead[z.k] !== z.k).map((z) => lexHead[z.k]!).filter((h) => !R[h]);
  const mains = [...new Set([...rootCandidates.map((z) => z.k), ...withAux])].sort((a, b) => a - b);
  let rootWord = mains[0] ?? -1;
  if (rootWord >= 0) {
    attach(rootWord, undefined, 'root', [`the first verb that no other word depends on: ${q(w(rootWord).s)}`], 0.7);
    if (mains.length > 1) notes.push(`More than one verb is left with no link to the others (${mains.slice(1, 4).map((v) => q(w(v).s)).join(', ')}): the rules did not join them.`);
  } else {
    // no finite verb that stands alone: the first infinitive or the first noun phrase
    const inf = W.find((z) => infinitive(z) && !R[z.k]);
    const first = inf ?? W.find((z) => (nominal(z) || npPron(z)) && !R[z.k]);
    if (first) { rootWord = first.k; attach(first.k, undefined, 'root', [`no finite verb in the sentence: ${q(first.s)} is taken as its main word`], 0.4); }
    notes.push('No finite verb in this sentence: only the first phrase was marked as the main word.');
  }
  // the main clause span
  spans.unshift({ start: w(0).i, end: w(m - 1).i, kind: 'main', label: 'the sentence' });

  // ── checks: loops are dropped, the notes say what was left ──
  for (let k = 0; k < m; k++) {
    let h = R[k]?.head !== undefined ? kOfToken.get(R[k]!.head!) : undefined;
    let steps = 0;
    while (h !== undefined && steps++ <= m) {
      if (h === k) { R[k] = undefined; notes.push(`A relation for ${q(w(k).s)} was dropped: it would have made a loop.`); break; }
      h = R[h]?.head !== undefined ? kOfToken.get(R[h]!.head!) : undefined;
    }
  }
  const unknown = W.filter((z) => z.unk);
  if (unknown.length) notes.push(`No reading for ${unknown.slice(0, 4).map((z) => q(z.s)).join(', ')}${unknown.length > 4 ? ' …' : ''}: no relation is given for ${unknown.length > 1 ? 'them' : 'it'}, and the roles around ${unknown.length > 1 ? 'them are' : 'it are'} less sure.`);
  const loose = W.filter((z) => !R[z.k] && !z.unk && z.pos !== 'INTJ' && z.pos !== 'PART');
  if (loose.length) notes.push(`The rules could not place ${loose.slice(0, 5).map((z) => q(z.s)).join(', ')}${loose.length > 5 ? ' …' : ''}: role unknown.`);
  if (m > 45) notes.push('A long sentence: the rules look at it in one piece and may be less reliable.');
  if (W.some((z) => z.n === 'que' && !R[z.k]) && m > 6) notes.push('Some uses of “que” (comparisons, “ne … que”, “c’est … que”) are not modelled.');

  const attached = W.filter((z) => R[z.k]).length;
  const relations = R.filter((r): r is SyntaxRelation => !!r).sort((a, b) => a.dependent - b.dependent);
  return {
    languageId: 'fr', analyzer: ANALYZER, tokens: tokens.map((t) => t.surface), relations,
    ...(spans.length > 1 ? { clauses: spans } : {}), notes, attached: Math.round((attached / m) * 1000) / 1000,
  };
}
