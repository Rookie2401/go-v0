/**
 * Albanian constructions: grammar patterns the reader can name (the definite ending, the linking article, clitic
 * doubling and clusters, the subjunctive, the future, the perfect, the non-active, the admirative …), as learner items
 * the learner can meet, count and review. Package Q9a. Machine-drafted, not checked by a native speaker.
 *
 * What a detector reads: the part of speech, the features and the `unit` / `parts` / `notes` of the readings the
 * sentence layer left (`sqAnalyze`). It never changes a reading and never looks at the spelling of a verb form, with
 * three exceptions that are written down where they happen: `mund` / `duhet` / `duhej` (the modal verbs are not in
 * the word list yet: the reading the engine gives them is a different verb, so the form is what is read), `qoftë`
 * (see optative) and the comparison words `se` / `sesa` (`sesa` is not in the word list).
 *
 * Honesty rules, in code (`use`, `hit`):
 *  - a pattern never gets a higher confidence than the lowest of the readings it relies on;
 *  - a reading with `notes.disputed` (the word list and the UniParser analyzer differ) or `unconfirmed` (a rule's
 *    guess at a word the list does not have) caps the pattern at 0.5;
 *  - a reading that stands first while another reading of the same token, not ruled out by the sentence, would not fit
 *    the pattern caps it at 0.55 (libri = "the book" or "of a book");
 *  - a little word with several readings (të, u, po …) is used only when the sentence layer decided it (it has
 *    `notes.context`) or when nothing else is left: an undecided "të shoh" is "I see you" or "(that) I see", and
 *    stays unnamed;
 *  - a reading that is not first is used only where the shape of the pattern leaves no other choice (a participle
 *    after kam or duke, "kisha" before a participle), and then it is capped at 0.55.
 * For every bracket pattern (auxiliary … participle, për … të … participle) the first token indexes are the pieces in
 * sentence order, so that their distance can be measured later.
 */
import type { AnalysisCandidate, AnalyzedToken, PatternCandidate, RawToken } from '../../core';
import { SQ_CLUSTERS } from './clitics';

// ───────────────────────────── the catalogue ─────────────────────────────

export interface SqConstruction {
  /** The key of the learner item (`pattern:sq:<key>`). */
  key: string;
  title: string;
  /** Plain English, one or two sentences, with one short Albanian example and its meaning. */
  explanation: string;
  /** The course stage (0–9) where the pattern is first taught. */
  stage: number;
  /** An Albanian sentence that shows the pattern, a dash, its meaning. The detector finds the key in the Albanian part. */
  example: string;
}

export const SQ_CONSTRUCTIONS: readonly SqConstruction[] = [
  // ── stages 0–1: the ending, the linking article, negation, the question
  {
    key: 'definite-noun-ending', stage: 0, title: 'Definite noun ending',
    explanation: 'Albanian puts "the" on the end of the noun: libër (a book) becomes libri or librin (the book). The ending also shows the noun\'s case.',
    example: 'Libri është mbi tavolinë. — The book is on the table.',
  },
  {
    key: 'linking-article-adjective', stage: 1, title: 'Linking article + adjective',
    explanation: 'Many adjectives are written with a small word in front (i, e, të, së) that agrees with the noun before it. Learn the pair as one word: djali i mirë (the good boy), vajza e mirë (the good girl).',
    example: 'Djali i mirë ka një libër. — The good boy has a book.',
  },
  {
    key: 'negation-nuk', stage: 1, title: 'Negation with nuk / s\'',
    explanation: 'Nuk, often shortened to s\' and written onto the next word, puts a verb in the negative: Nuk punoj (I do not work), S\'jam i ri (I am not young).',
    example: 'Nuk punoj sot. — I am not working today.',
  },
  {
    key: 'question-a', stage: 1, title: 'Yes / no question with a',
    explanation: 'A at the start of a sentence turns it into a yes / no question: A vjen ai? (Is he coming?)',
    example: 'A vjen ai? — Is he coming?',
  },
  // ── stages 2–3: the small words around the verb, possessives, the genitive, case after a preposition
  {
    key: 'nominative-after-preposition', stage: 2, title: 'Nominative after nga / te / tek',
    explanation: 'Nga, te and tek are followed by the noun in the nominative, the form it has as a subject: Ajo vjen nga shkolla (she comes from school), Shkoj te mjeku (I go to the doctor\'s).',
    example: 'Unë shkoj te mjeku. — I am going to the doctor\'s.',
  },
  {
    key: 'object-pronoun-before-verb', stage: 2, title: 'Short object pronoun before the verb',
    explanation: 'The short object pronouns (më, të, e, i, na, ju, u) stand directly in front of the conjugated verb, not after it: Ai më pa (he saw me).',
    example: 'Ai më pa. — He saw me.',
  },
  {
    key: 'possessive-after-noun', stage: 2, title: 'Possessive after the noun',
    explanation: 'The possessive follows a noun that carries the definite ending: zemrën time (my heart), libri im (my book).',
    example: 'Libri im është mbi tavolinë. — My book is on the table.',
  },
  {
    key: 'clitic-doubling', stage: 3, title: 'Clitic doubling',
    explanation: 'A short pronoun before the verb repeats the object that follows it: Ai e pa djalin (he saw the boy), where "e" and "djalin" are the same person. The same happens with an indirect object: I dhashë djalit librin (I gave the boy the book).',
    example: 'Ai e pa djalin. — He saw the boy.',
  },
  {
    key: 'subjunctive-te', stage: 3, title: 'të + verb (subjunctive)',
    explanation: 'After verbs like "begin" or "want", Albanian uses të + a verb in the subjunctive where English uses "to": Fillova të kuptoj (I began to understand).',
    example: 'Fillova të kuptoj. — I began to understand.',
  },
  {
    key: 'future', stage: 3, title: 'Future: do të + verb',
    explanation: 'Do të plus a verb says what will happen: Ai do të punojë nesër (he will work tomorrow).',
    example: 'Ai do të punojë nesër. — He will work tomorrow.',
  },
  {
    key: 'modal-te', stage: 3, title: 'mund të / duhet të',
    explanation: 'Mund të (can, may) and duhet të (must, have to) take të + a verb, like "want" and "begin": Mund të vij nesër (I can come tomorrow), Duhet të punoj (I must work).',
    example: 'Mund të vij nesër. — I can come tomorrow.',
  },
  {
    key: 'progressive-po', stage: 3, title: 'Progressive with po',
    explanation: 'Po before a present or imperfect verb says that the action is going on: Po lexoj (I am reading), Ai po lexonte (he was reading).',
    example: 'Ai po lexon librin. — He is reading the book.',
  },
  {
    key: 'negation-mos', stage: 3, title: 'mos: not, in a command or a subjunctive',
    explanation: 'Mos is the negative of a command and of a verb after të; nuk is the negative of the indicative: Mos shko! (Do not go!), Dua të mos shkoj (I want not to go).',
    example: 'Mos shko! — Do not go!',
  },
  {
    key: 'genitive-linking-article', stage: 3, title: 'Genitive with a linking article',
    explanation: 'To say "X of Y", Albanian puts a small linking word (i, e, të, së) after the first noun and the second noun in the genitive: libri i djalit (the boy\'s book), shtëpia e vajzës (the girl\'s house).',
    example: 'Libri i djalit është mbi tavolinë. — The boy\'s book is on the table.',
  },
  {
    key: 'ablative-after-preposition', stage: 3, title: 'Ablative after prej / larg / afër …',
    explanation: 'Prej, larg, afër, pranë, para, pas and some other prepositions take the ablative, which usually looks like the genitive and dative form: Ai jeton larg qytetit (he lives far from the city).',
    example: 'Ajo jeton larg qytetit. — She lives far from the city.',
  },
  // ── stages 4–6: compound tenses, the non-active, clusters, relative clauses, the participle phrases
  {
    key: 'perfect', stage: 4, title: 'Perfect: kam + participle',
    explanation: 'Kam plus a participle says what has happened: Kam punuar (I have worked), Ai ka ardhur (he has come).',
    example: 'Ai ka ardhur. — He has come.',
  },
  {
    key: 'comparative', stage: 4, title: 'Comparative: më + adjective',
    explanation: 'Më before an adjective means "more": më i madh (bigger). "Than" is se or sesa: Ai është më i madh se unë (he is bigger than I am).',
    example: 'Ai është më i madh se unë. — He is bigger than I am.',
  },
  {
    key: 'pluperfect', stage: 5, title: 'Pluperfect: kisha + participle',
    explanation: 'The imperfect of kam plus a participle says what had already happened: Kisha punuar (I had worked), Ata kishin punuar (they had worked).',
    example: 'Ata kishin punuar. — They had worked.',
  },
  {
    key: 'superlative', stage: 5, title: 'Superlative: definite noun + më + adjective',
    explanation: 'A noun with the definite ending, then më and the adjective, gives the superlative: shoku më i mirë (the best friend).',
    example: 'Ky është shoku më i mirë. — This is the best friend.',
  },
  {
    key: 'non-active-present', stage: 5, title: 'Non-active verb (-hem, -em)',
    explanation: 'Non-active verbs have their own endings (-hem, -hesh, -het, or -em, -esh, -et) and often mean that the subject does the action to itself: lahem (I wash myself), Ai lahet çdo ditë (he washes every day).',
    example: 'Ai lahet çdo ditë. — He washes every day.',
  },
  {
    key: 'non-active-u', stage: 5, title: 'Non-active aorist with u',
    explanation: 'U before a verb in the aorist gives it a non-active meaning: Unë u lava (I washed myself).',
    example: 'Unë u lava. — I washed myself.',
  },
  {
    key: 'clitic-cluster', stage: 5, title: 'Fused clitic cluster (ma, ta, ia …)',
    explanation: 'Two short pronouns can be written as one word: ma = më + e (it to me), ia = i + e (it to him or her). When they are not fused (na e) they stay two words.',
    example: 'Ma dha. — He gave it to me.',
  },
  {
    key: 'gerund-duke', stage: 5, title: 'duke + participle',
    explanation: 'Duke plus a participle says that something goes on at the same time as the main action: Ai punon duke dëgjuar muzikë (he works while listening to music).',
    example: 'Ai punon duke dëgjuar muzikë. — He works while listening to music.',
  },
  {
    key: 'relative-clause', stage: 6, title: 'Relative clause: që / i cili',
    explanation: 'Që after a noun, or a form of cili with its small word in front, starts a clause that describes the noun: Libri që lexoj është i mirë (the book that I read is good).',
    example: 'Libri që lexoj është i mirë. — The book that I am reading is good.',
  },
  {
    key: 'purpose-per-te', stage: 6, title: 'për të + participle (purpose)',
    explanation: 'Për të plus a participle says what something is for: Punoj për të jetuar (I work in order to live).',
    example: 'Ai punon për të jetuar. — He works in order to live.',
  },
  {
    key: 'imperative-pronoun', stage: 6, title: 'Command with a short pronoun',
    explanation: 'In a command a short pronoun can stand before the verb (Më thuaj, tell me) or be written onto the end of it: Jepma! (give it to me), Thuaji! (tell him).',
    example: 'Më thuaj. — Tell me.',
  },
  // ── stages 7–9: the moods of surprise and wishing, pa / me të + participle, the conditional
  {
    key: 'admirative', stage: 7, title: 'Admirative',
    explanation: 'The admirative is a mood for surprise or for something just found out: Ai qenka i madh (he turns out to be big).',
    example: 'Ai qenka i madh. — He turns out to be big.',
  },
  {
    key: 'optative', stage: 8, title: 'Optative: wishes',
    explanation: 'The optative is a mood for wishes and blessings: Qofsh i lumtur! (may you be happy).',
    example: 'Qofsh i lumtur! — May you be happy!',
  },
  {
    key: 'without-pa', stage: 8, title: 'pa + participle (without doing)',
    explanation: 'Pa plus a participle means "without doing": Ai iku pa folur (he left without speaking).',
    example: 'Ai iku pa folur. — He left without speaking.',
  },
  {
    key: 'as-soon-me-te', stage: 9, title: 'me të + participle (as soon as)',
    explanation: 'Me të plus a participle means "as soon as" or "on doing": Me të mbaruar punën, shkova në shtëpi (as soon as I finished the work, I went home).',
    example: 'Me të mbaruar punën, shkova në shtëpi. — As soon as I finished the work, I went home.',
  },
  {
    key: 'conditional', stage: 9, title: 'Conditional: do të + imperfect',
    explanation: 'Do të plus the imperfect says what would happen: Ai do të punonte (he would work).',
    example: 'Ai do të punonte. — He would work.',
  },
];

const INFO: ReadonlyMap<string, SqConstruction> = new Map(SQ_CONSTRUCTIONS.map((c) => [c.key, c]));

// ───────────────────────────── the sentence as the detectors see it ─────────────────────────────

interface Ctx {
  tokens: RawToken[];
  analyses: AnalyzedToken[];
}

const cands = (cx: Ctx, i: number): AnalysisCandidate[] => (cx.tokens[i]?.isWord ? cx.analyses[i]?.candidates ?? [] : []);
const norm = (cx: Ctx, i: number): string => cx.tokens[i]?.normalized ?? '';
const isWord = (cx: Ctx, i: number): boolean => cx.tokens[i]?.isWord === true;
/** The next token when it is a word (a comma, a full stop or a dash in between ends the neighbourhood), else -1. */
const adj = (cx: Ctx, i: number): number => (isWord(cx, i + 1) ? i + 1 : -1);
/** The word before this token, or -1: only directly before, with nothing written between. */
const before = (cx: Ctx, i: number): number => (isWord(cx, i - 1) ? i - 1 : -1);

const vals = (v: string | undefined): string[] => (v ? v.split(',') : []);
const has = (c: AnalysisCandidate | undefined, k: string, v: string): boolean => vals(c?.morph[k]).includes(v);
const exact = (c: AnalysisCandidate | undefined, k: string, v: string): boolean => c?.morph[k] === v;
const agree = (a: string | undefined, b: string | undefined): boolean => a === undefined || b === undefined || vals(a).some((x) => vals(b).includes(x));
const verbal = (c: AnalysisCandidate): boolean => c.pos === 'VERB' || c.pos === 'AUX';
const finite = (c: AnalysisCandidate): boolean => verbal(c) && (c.morph.VerbForm === 'Fin' || (c.morph.VerbForm === undefined && (c.morph.Tense !== undefined || c.morph.Mood !== undefined)));
const participle = (c: AnalysisCandidate): boolean => verbal(c) && c.morph.VerbForm === 'Part';
const clitic = (c: AnalysisCandidate): boolean => c.pos === 'PRON' && c.morph.Clitic === 'Yes';
const noun = (c: AnalysisCandidate): boolean => c.pos === 'NOUN' || c.pos === 'PROPN';
const particle = (c: AnalysisCandidate, lemma: string): boolean => c.pos === 'PART' && c.lemma === lemma;
/** A fused token whose first piece is the particle të (ta = të + e, t'i, t'ia, t'u). */
const fusedTe = (c: AnalysisCandidate): boolean => c.pos === 'PART' && c.lemma === 'të' && (c.parts?.length ?? 0) > 1;
const teReading = (c: AnalysisCandidate): boolean => particle(c, 'të');

/** A reading used by a pattern, with the highest confidence the pattern may claim because of it. */
interface Use { c: AnalysisCandidate; cap: number }

interface UseOptions {
  /** The pattern's shape leaves no other reading: take it even when it is not first (capped at 0.55). */
  loose?: boolean;
  /** A little word with rivals: only when the sentence layer decided it. */
  decided?: boolean;
}

/**
 * The reading of token i that satisfies `pred`: the first one (the chosen reading) unless `loose`. Its cap is its own
 * confidence, 0.55 when another reading the sentence did not rule out (confidence above 0.4) would not satisfy `pred`,
 * and 0.5 when it is disputed or unconfirmed.
 */
function use(cx: Ctx, i: number, pred: (c: AnalysisCandidate) => boolean, opts: UseOptions = {}): Use | undefined {
  const list = cands(cx, i);
  const k = list.findIndex(pred);
  if (k < 0 || (k > 0 && !opts.loose)) return undefined;
  const c = list[k];
  const rival = list.some((r, j) => j !== k && r.confidence > 0.4 && !pred(r));
  if (rival && opts.decided && c.notes?.context === undefined) return undefined;
  let cap = c.confidence;
  if (rival) cap = Math.min(cap, 0.55);
  if (c.notes?.disputed !== undefined || c.unconfirmed === true) cap = Math.min(cap, 0.5);
  return { c, cap };
}

const clip = (n: number): number => Math.max(0, Math.min(0.95, Math.round(n * 100) / 100));

/** The pattern, at the lowest cap among the readings it relies on. `extra` is added to the explanation. */
function hit(key: string, uses: Array<Use | { cap: number }>, tokenIndexes: number[], extra = ''): PatternCandidate {
  const info = INFO.get(key);
  if (!info) throw new Error(`sq construction "${key}" is not in the catalogue`);
  const seen = new Set<number>();
  const idx = tokenIndexes.filter((i) => (seen.has(i) ? false : (seen.add(i), true))).sort((a, b) => a - b);
  return {
    key, title: info.title, explanation: extra ? `${info.explanation} ${extra}` : info.explanation, tokenIndexes: idx,
    confidence: clip(Math.min(...uses.map((u) => u.cap))),
  };
}

/** What a pattern may claim from a token it reads only by its written form: the best of its readings, 0.5 if that one is disputed or unconfirmed. */
function tokenCap(cx: Ctx, i: number): number {
  const list = cands(cx, i);
  if (list.length === 0) return 0.5;
  const top = list.reduce((a, b) => (b.confidence > a.confidence ? b : a));
  return top.notes?.disputed !== undefined || top.unconfirmed === true ? Math.min(top.confidence, 0.5) : top.confidence;
}

type Detector = (cx: Ctx) => PatternCandidate[];

/** Index of the first token at or after j that is a word and is not skipped; -1 when a break or the end comes first. */
function skipTo(cx: Ctx, j: number, skip: (k: number) => boolean): number {
  let k = j;
  while (isWord(cx, k) && skip(k)) k++;
  return isWord(cx, k) ? k : -1;
}

/** A short object pronoun as the chosen reading, or a fused cluster of them. */
const shortAt = (cx: Ctx, k: number): boolean => {
  const c = cands(cx, k)[0];
  return c !== undefined && clitic(c) && (cands(cx, k).length === 1 || c.notes?.context !== undefined || c.parts !== undefined);
};
const negationAt = (cx: Ctx, k: number): boolean => ['nuk', "s'", 'mos'].includes(norm(cx, k)) && cands(cx, k)[0]?.pos === 'PART';
const finiteVerb = (cx: Ctx, k: number): Use | undefined => (k < 0 ? undefined : use(cx, k, finite));
const participleAt = (cx: Ctx, k: number): Use | undefined => (k < 0 ? undefined : use(cx, k, participle, { loose: true }));

// ───────────────────────────── nouns and the linking article ─────────────────────────────

const definiteEnding: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  cx.tokens.forEach((_, i) => {
    const u = use(cx, i, (c) => c.pos === 'NOUN' && exact(c, 'Definite', 'Def'));
    if (u) out.push(hit('definite-noun-ending', [u], [i]));
  });
  return out;
};

/** The unit the sentence layer formed: the article piece and the adjective, ordinal or possessive that heads it. */
const linkingArticleAdjective: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  cx.tokens.forEach((_, i) => {
    const head = use(cx, i, (c) => c.unit?.head === i && c.unit.role === 'head' && c.unit.pieces.length === 2 && c.unit.pieces[1] === i);
    if (!head) return;
    const a = (head.c.unit as NonNullable<AnalysisCandidate['unit']>).pieces[0];
    const art = use(cx, a, (c) => c.unit?.head === i && c.unit.role === 'linking article');
    if (art) out.push(hit('linking-article-adjective', [head, art], [a, i]));
  });
  return out;
};

const genitiveLinkingArticle: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  cx.tokens.forEach((_, a) => {
    const art = use(cx, a, (c) => c.role === 'genitive linking article');
    if (!art) return;
    // the noun before it (possessives and article + adjective units may stand between: djali im i mirë i babait)
    let p = before(cx, a);
    while (p >= 0 && (cands(cx, p)[0]?.unit !== undefined || has(cands(cx, p)[0], 'Poss', 'Yes'))) p = before(cx, p);
    const head = p < 0 ? undefined : use(cx, p, noun);
    // the noun after it, in the genitive: only a word that a determiner or number may precede
    let g = adj(cx, a);
    while (g >= 0 && cands(cx, g)[0] !== undefined && ((cands(cx, g)[0].pos === 'DET' && !exact(cands(cx, g)[0], 'PronType', 'Art')) || cands(cx, g)[0].pos === 'NUM')) g = adj(cx, g);
    const gen = g < 0 ? undefined : use(cx, g, (c) => noun(c) && exact(c, 'Case', 'Gen'));
    if (head && gen) out.push(hit('genitive-linking-article', [art, head, gen], [p, a, g]));
  });
  return out;
};

const possessiveAfterNoun: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  cx.tokens.forEach((_, i) => {
    const poss = use(cx, i, (c) => c.pos === 'DET' && exact(c, 'Poss', 'Yes'));
    const p = before(cx, i);
    const head = poss && p >= 0 ? use(cx, p, (c) => c.pos === 'NOUN' && exact(c, 'Definite', 'Def')) : undefined;
    if (poss && head) out.push(hit('possessive-after-noun', [poss, head], [p, i]));
  });
  return out;
};

const nominativeAfterPreposition: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  cx.tokens.forEach((_, i) => {
    const prep = use(cx, i, (c) => c.pos === 'ADP' && c.notes?.governs === 'Nom');
    const head = prep ? headAfterPreposition(cx, i, (c) => noun(c) && exact(c, 'Case', 'Nom')) : undefined;
    if (prep && head) out.push(hit('nominative-after-preposition', [prep, head.u], [i, head.i]));
  });
  return out;
};

const ablativeAfterPreposition: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  cx.tokens.forEach((_, i) => {
    const prep = use(cx, i, (c) => c.pos === 'ADP' && c.notes?.governs === 'Abl');
    const head = prep ? headAfterPreposition(cx, i, (c) => noun(c) && exact(c, 'Case', 'Abl')) : undefined;
    if (prep && head) out.push(hit('ablative-after-preposition', [prep, head.u], [i, head.i]));
  });
  return out;
};

/** The noun phrase's head after a preposition: determiners, numbers and article + adjective units stand before it. */
function headAfterPreposition(cx: Ctx, prep: number, pred: (c: AnalysisCandidate) => boolean): { i: number; u: Use } | undefined {
  let k = adj(cx, prep);
  while (k >= 0) {
    const top = cands(cx, k)[0];
    if (!top) return undefined;
    if (top.unit !== undefined || (top.pos === 'DET' && !exact(top, 'PronType', 'Art')) || top.pos === 'NUM') { k = adj(cx, k); continue; }
    const u = use(cx, k, pred);
    return u ? { i: k, u } : undefined;
  }
  return undefined;
}

// ───────────────────────────── short pronouns ─────────────────────────────

const objectPronounBeforeVerb: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  cx.tokens.forEach((_, i) => {
    const pron = use(cx, i, (c) => clitic(c) && c.parts === undefined, { decided: true });
    if (!pron) return;
    const v = skipTo(cx, i + 1, (k) => shortAt(cx, k));
    const verb = finiteVerb(cx, v);
    if (verb) out.push(hit('object-pronoun-before-verb', [pron, verb], [i, v]));
  });
  return out;
};

/** The make-up of a fused token in plain words: "ma = më + e (to me + it / him / her)". */
function makeUp(form: string, parts: NonNullable<AnalysisCandidate['parts']>): string {
  const roles = parts.map((p) => p.role ?? '');
  const known = SQ_CLUSTERS.find((c) => c.form === form && c.roles.length === roles.length && c.roles.every((r, k) => r === roles[k]));
  if (!known) return '';
  return `Here: ${form} = ${known.components.join(' + ')}.`;
}

const cliticCluster: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  cx.tokens.forEach((_, i) => {
    // only fused pronouns: the pieces are short pronouns, a particle (ta = të + e) or the non-active u; not s'jam / s'e,
    // not a command with a pronoun written on it (jepma)
    const u = use(cx, i, (c) => (c.parts?.length ?? 0) > 1
      && c.parts?.some((p) => p.pos === 'PRON') === true
      && !c.parts?.some((p) => p.pos === 'VERB' || p.pos === 'AUX' || p.lemma === 'nuk' || p.lemma === 'çfarë'));
    if (u) out.push(hit('clitic-cluster', [u], [i], makeUp(norm(cx, i), u.c.parts ?? [])));
  });
  return out;
};

/**
 * A short pronoun before a finite verb that repeats the definite object (Acc) or the indirect object (Dat) after the
 * verb, or a long pronoun (mua, ty, atë). The pronoun and the object must agree in number; a noun whose case is still
 * a union that merely contains the case (djalit: Gen, Dat or Abl) is accepted at 0.55 at most.
 */
const cliticDoubling: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  cx.tokens.forEach((_, i) => {
    const list = cands(cx, i);
    if (list.length === 0 || !clitic(list[0])) return;
    const first = use(cx, i, (c) => clitic(c), { decided: true });
    if (!first) return;
    // what the pronoun (or each pronoun of a cluster) can stand for
    const feats: Array<Record<string, string>> = [];
    for (const c of list) {
      if (!clitic(c) || (c.confidence <= 0.4 && c !== list[0])) continue;
      if (c.parts) for (const p of c.parts) { if (p.pos === 'PRON' && p.morph) feats.push(p.morph); } else feats.push(c.morph);
    }
    const v = skipTo(cx, i + 1, (k) => shortAt(cx, k));
    const verb = finiteVerb(cx, v);
    if (!verb) return;
    // the object: within four words after the verb, not inside a preposition phrase, not beyond another verb
    let k = adj(cx, v);
    for (let n = 0; n < 4 && k >= 0; n++, k = adj(cx, k)) {
      const top = cands(cx, k)[0];
      if (!top || finite(top) || top.pos === 'ADP' || top.pos === 'SCONJ' || top.pos === 'CONJ') break;
      const object = use(cx, k, (c) => {
        if (c.pos === 'NOUN' && exact(c, 'Definite', 'Def')) {
          return feats.some((f) => (f.Person === undefined || f.Person === '3') && agree(f.Number, c.morph.Number) && vals(f.Case).some((x) => (x === 'Acc' || x === 'Dat') && vals(c.morph.Case).includes(x)));
        }
        if (c.pos === 'PRON' && !clitic(c) && exact(c, 'PronType', 'Prs') && c.morph.Person !== undefined) {
          return feats.some((f) => f.Person === c.morph.Person && agree(f.Number, c.morph.Number) && vals(f.Case).some((x) => (x === 'Acc' || x === 'Dat') && vals(c.morph.Case).includes(x)));
        }
        return false;
      });
      if (!object) continue;
      // a case that is still a union is not decided by the sentence
      const open = vals(object.c.morph.Case).length > 1 && object.c.pos === 'NOUN';
      out.push(hit('clitic-doubling', [first, verb, open ? { cap: 0.55 } : object], [i, v, k]));
      break;
    }
  });
  return out;
};

/** A command with a pronoun written onto it (jepma, merre, thuaji), or a short pronoun right before a command (më thuaj). */
const imperativePronoun: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  cx.tokens.forEach((_, i) => {
    const written = use(cx, i, (c) => verbal(c) && exact(c, 'Mood', 'Imp') && (c.parts?.length ?? 0) > 1 && c.parts?.[0].pos !== 'PRON' && c.parts?.slice(1).every((p) => p.kind === 'clitic') === true);
    if (written) { out.push(hit('imperative-pronoun', [written], [i])); return; }
    const pron = use(cx, i, (c) => clitic(c), { decided: true });
    if (!pron) return;
    const p = before(cx, i);
    if (p >= 0 && (negationAt(cx, p) || cands(cx, p)[0]?.pos === 'PART')) return; // mos më thuaj / të më thuash: not a plain command
    const v = skipTo(cx, i + 1, (k) => shortAt(cx, k));
    const verb = v < 0 ? undefined : use(cx, v, (c) => verbal(c) && exact(c, 'Mood', 'Imp') && c.parts === undefined);
    if (verb) out.push(hit('imperative-pronoun', [pron, verb], [i, v]));
  });
  return out;
};

// ───────────────────────────── të: subjunctive, future, conditional, modal ─────────────────────────────

const MODAL_FORMS = new Set(['mund', 'duhet', 'duhej']);
const MODAL_LEMMAS = new Set(['mund', 'duhet']);

/**
 * What stands in front of the verb after të: mos and short pronouns (të mos e shoh). Returns the verb's index.
 * A fused tokens (ta, t'i) already holds its pronoun: the verb is the next word.
 */
const verbAfterTe = (cx: Ctx, te: number, fused: boolean): number => skipTo(cx, te + 1, (k) => !fused && (shortAt(cx, k) || norm(cx, k) === 'mos'));

/** The imperfect: Tense Imp (the forms are the same in the indicative and the subjunctive). */
const imperfect = (c: AnalysisCandidate): boolean => finite(c) && exact(c, 'Tense', 'Imp');

const teClauses: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  cx.tokens.forEach((_, i) => {
    const te = use(cx, i, teReading, { decided: true });
    if (!te) return;
    const fused = fusedTe(te.c);
    const v = verbAfterTe(cx, i, fused);
    if (v < 0) return;
    const p = before(cx, i);
    const pw = p < 0 ? '' : norm(cx, p);
    const prev = p < 0 ? undefined : cands(cx, p)[0];
    if (pw === 'për' || pw === 'me') return; // për të / me të + participle: other patterns
    const subj = use(cx, v, (c) => finite(c) && (has(c, 'Mood', 'Sub') || imperfect(c)));
    if (!subj) return;
    // do të: the future, or with the imperfect the conditional
    if (pw === 'do' && prev !== undefined && particle(prev, 'do')) {
      const doU = use(cx, p, (c) => particle(c, 'do'));
      if (!doU) return;
      if (imperfect(subj.c)) out.push(hit('conditional', [doU, te, subj], [p, i, v]));
      else if (has(subj.c, 'Tense', 'Pres')) out.push(hit('future', [doU, te, subj], [p, i, v]));
      return;
    }
    if (pw === 'do') return; // do is the verb dua here, or a particle nothing confirms
    // mund të / duhet të: found by the written form (the word list has no mund / duhet yet: the engine reads them as
    // forms of mundem and dua, which are other verbs), so the confidence is capped at 0.7
    const modalByLemma = p >= 0 && cands(cx, p).some((c) => c.lemma !== undefined && MODAL_LEMMAS.has(c.lemma));
    if (p >= 0 && (MODAL_FORMS.has(pw) || modalByLemma)) {
      out.push(hit('modal-te', [te, subj, { cap: 0.7 }], [p, i, v]));
      return;
    }
    out.push(hit('subjunctive-te', [te, subj], [i, v]));
  });
  return out;
};

// ───────────────────────────── negation and the little words before a verb ─────────────────────────────

const negationNuk: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  cx.tokens.forEach((_, i) => {
    // nuk + (pronouns) + verb
    const nuk = use(cx, i, (c) => particle(c, 'nuk') && c.parts === undefined);
    if (nuk) {
      const v = skipTo(cx, i + 1, (k) => shortAt(cx, k));
      const verb = finiteVerb(cx, v);
      if (verb) out.push(hit('negation-nuk', [nuk, verb], [i, v]));
      return;
    }
    // s'jam, s'kam: the one token holds nuk and the verb; s'e pashë: nuk and a pronoun, the verb after
    const fused = use(cx, i, (c) => c.parts?.[0]?.lemma === 'nuk' && (c.parts.length ?? 0) > 1 && (verbal(c) || clitic(c)));
    if (!fused) return;
    if (verbal(fused.c)) { out.push(hit('negation-nuk', [fused], [i])); return; }
    const v = skipTo(cx, i + 1, (k) => shortAt(cx, k));
    const verb = finiteVerb(cx, v);
    if (verb) out.push(hit('negation-nuk', [fused, verb], [i, v]));
  });
  return out;
};

const negationMos: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  cx.tokens.forEach((_, i) => {
    const mos = use(cx, i, (c) => particle(c, 'mos'));
    if (!mos) return;
    const v = skipTo(cx, i + 1, (k) => shortAt(cx, k));
    // a command, a subjunctive or a wish: no indicative reading left
    const verb = v < 0 ? undefined : use(cx, v, (c) => finite(c) && vals(c.morph.Mood).some((m) => m === 'Imp' || m === 'Sub' || m === 'Opt') && !has(c, 'Mood', 'Ind'));
    if (verb) out.push(hit('negation-mos', [mos, verb], [i, v]));
  });
  return out;
};

const progressive: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  cx.tokens.forEach((_, i) => {
    const po = use(cx, i, (c) => particle(c, 'po'), { decided: true });
    if (!po) return;
    const v = skipTo(cx, i + 1, (k) => shortAt(cx, k));
    const verb = v < 0 ? undefined : use(cx, v, (c) => finite(c) && (exact(c, 'Tense', 'Pres') || exact(c, 'Tense', 'Imp')) && (c.morph.Mood === undefined || has(c, 'Mood', 'Ind')));
    if (verb) out.push(hit('progressive-po', [po, verb], [i, v]));
  });
  return out;
};

/** A yes / no question: a at the start of the sentence or of a clause, then the verb (pronouns and nuk may stand between). */
const questionA: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  cx.tokens.forEach((_, i) => {
    if (isWord(cx, i - 1)) return;
    const a = use(cx, i, (c) => particle(c, 'a'));
    if (!a) return;
    const v = skipTo(cx, i + 1, (k) => shortAt(cx, k) || negationAt(cx, k));
    const verb = finiteVerb(cx, v);
    if (verb) out.push(hit('question-a', [a, verb], [i, v]));
  });
  return out;
};

// ───────────────────────────── participles ─────────────────────────────

const gerundDuke: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  cx.tokens.forEach((_, i) => {
    const duke = use(cx, i, (c) => particle(c, 'duke'));
    if (!duke) return;
    const k = skipTo(cx, i + 1, (j) => shortAt(cx, j));
    const ptc = participleAt(cx, k);
    if (ptc) out.push(hit('gerund-duke', [duke, ptc], [i, k]));
  });
  return out;
};

/** për të + participle: për, then të (or ta, t'u …), then the participle. */
const purposePerTe: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  cx.tokens.forEach((_, i) => {
    const per = use(cx, i, (c) => c.pos === 'ADP' && c.lemma === 'për');
    const t = per ? adj(cx, i) : -1;
    const te = t < 0 ? undefined : use(cx, t, teReading);
    if (!per || !te) return;
    const k = skipTo(cx, t + 1, (j) => !fusedTe(te.c) && (shortAt(cx, j) || norm(cx, j) === 'mos'));
    const ptc = participleAt(cx, k);
    if (ptc) out.push(hit('purpose-per-te', [per, te, ptc], [i, t, k]));
  });
  return out;
};

const withoutPa: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  cx.tokens.forEach((_, i) => {
    const pa = use(cx, i, (c) => particle(c, 'pa'), { decided: true });
    if (!pa) return;
    const k = skipTo(cx, i + 1, (j) => shortAt(cx, j));
    const ptc = participleAt(cx, k);
    if (ptc) out.push(hit('without-pa', [pa, ptc], [i, k]));
  });
  return out;
};

/** me të + participle. Nothing in the sentence layer decides this të; a pronoun cannot stand directly before a participle, so the shape does. */
const asSoonMeTe: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  cx.tokens.forEach((_, i) => {
    const me = use(cx, i, (c) => c.pos === 'ADP' && c.lemma === 'me');
    const t = me ? adj(cx, i) : -1;
    const te = t < 0 ? undefined : use(cx, t, teReading);
    if (!me || !te) return;
    const ptc = participleAt(cx, adj(cx, t));
    if (ptc) out.push(hit('as-soon-me-te', [me, te, ptc], [i, t, adj(cx, t)]));
  });
  return out;
};

/** kam / kisha + participle (an adverb may stand between: kam tashmë punuar). */
const perfect: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  const find = (key: 'perfect' | 'pluperfect', tense: string, i: number): void => {
    // "kisha" is also the noun kishë (church): the participle after it is what decides, so the reading is taken loosely
    const aux = use(cx, i, (c) => verbal(c) && c.lemma === 'kam' && finite(c) && exact(c, 'Tense', tense) && (c.morph.Mood === undefined || has(c, 'Mood', 'Ind')), { loose: key === 'pluperfect' });
    if (!aux) return;
    let k = adj(cx, i);
    if (k >= 0 && cands(cx, k)[0]?.pos === 'ADV') k = adj(cx, k);
    const ptc = participleAt(cx, k);
    if (ptc) out.push(hit(key, [aux, ptc], [i, k]));
  };
  cx.tokens.forEach((_, i) => { find('perfect', 'Pres', i); find('pluperfect', 'Imp', i); });
  return out;
};

// ───────────────────────────── non-active, moods ─────────────────────────────

/** Forms that look non-active and are not: duhet is a verb of its own (see the modal pattern), mund is not a form of mundem. */
const NOT_NON_ACTIVE = new Set(['duhet', 'duhen', 'duhej', 'mund']);

const nonActivePresent: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  cx.tokens.forEach((_, i) => {
    if (NOT_NON_ACTIVE.has(norm(cx, i))) return;
    const u = use(cx, i, (c) => finite(c) && exact(c, 'Voice', 'Mid') && has(c, 'Tense', 'Pres'));
    if (u) out.push(hit('non-active-present', [u], [i]));
  });
  return out;
};

/** u before an aorist. A fused m'u / t'u holds the same u. The word list gives many aorists only with their active ending, which the non-active shares. */
const nonActiveU: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  cx.tokens.forEach((_, i) => {
    const u = use(cx, i, (c) => (particle(c, 'u') && c.parts === undefined) || c.parts?.some((p) => p.pos === 'PART' && p.lemma === 'u') === true, { decided: true });
    if (!u) return;
    const k = adj(cx, i);
    const verb = k < 0 ? undefined : use(cx, k, (c) => finite(c) && has(c, 'Tense', 'Past'));
    if (verb) out.push(hit('non-active-u', [u, verb], [i, k]));
  });
  return out;
};

const admirative: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  cx.tokens.forEach((_, i) => {
    const u = use(cx, i, (c) => finite(c) && exact(c, 'Mood', 'Adm'));
    if (u) out.push(hit('admirative', [u], [i]));
  });
  return out;
};

/**
 * The optative (qofsh, qoftë, qofsha). "Qoftë" is also the word of "në qoftë se" (if) and "qoftë … qoftë" (whether … or),
 * which are not wishes: it is left out there.
 */
const optative: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  const count = (w: string): number => cx.tokens.filter((t) => t.isWord && t.normalized === w).length;
  cx.tokens.forEach((_, i) => {
    const u = use(cx, i, (c) => finite(c) && exact(c, 'Mood', 'Opt'));
    if (!u) return;
    if (norm(cx, i) === 'qoftë') {
      const n = adj(cx, i);
      if (norm(cx, i - 1) === 'në' || (n >= 0 && norm(cx, n) === 'se') || count('qoftë') > 1) return;
    }
    out.push(hit('optative', [u], [i]));
  });
  return out;
};

// ───────────────────────────── comparison and relative clauses ─────────────────────────────

/** më + adjective (with or without its linking article), and the superlative when a definite noun stands right before më. */
const comparison: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  cx.tokens.forEach((_, m) => {
    const more = use(cx, m, (c) => c.pos === 'ADV' && c.lemma === 'më', { decided: true });
    if (!more) return;
    const j = adj(cx, m);
    if (j < 0) return;
    const top = cands(cx, j)[0];
    let art: Use | undefined;
    let a = j;
    if (top?.unit?.role === 'linking article') {
      art = use(cx, j, (c) => c.unit?.role === 'linking article');
      a = top.unit.head;
    }
    const adjective = use(cx, a, (c) => c.pos === 'ADJ' && (art === undefined || c.unit?.role === 'head'));
    if (!adjective || (art === undefined && top?.pos !== 'ADJ')) return;
    const idx = art ? [m, j, a] : [m, a];
    const uses: Use[] = art ? [more, art, adjective] : [more, adjective];
    // se / sesa after the adjective: "than" (sesa is not in the word list, so the written form is read)
    const t = adj(cx, a);
    if (t >= 0 && (norm(cx, t) === 'se' || norm(cx, t) === 'sesa')) idx.push(t);
    const p = before(cx, m);
    const head = p < 0 ? undefined : use(cx, p, (c) => c.pos === 'NOUN' && exact(c, 'Definite', 'Def'));
    if (head) out.push(hit('superlative', [...uses, head], [p, ...idx]));
    else out.push(hit('comparative', uses, idx));
  });
  return out;
};

const ARTICLE_FORMS = new Set(['i', 'e', 'të', 'së']);

/** A relative clause: që after a noun, or i / e / të / së + cili, with a verb after it. */
const relativeClause: Detector = (cx) => {
  const out: PatternCandidate[] = [];
  const antecedent = (k: number): Use | undefined => (k < 0 ? undefined : use(cx, k, (c) => noun(c) || (c.pos === 'PRON' && !clitic(c)) || (c.pos === 'DET' && exact(c, 'PronType', 'Dem'))));
  cx.tokens.forEach((_, i) => {
    let rel: Use | undefined;
    let ante = -1;
    let first = i;
    const que = norm(cx, i) === 'që' ? use(cx, i, (c) => c.pos === 'PRON' && c.lemma === 'që' && has(c, 'PronType', 'Rel')) : undefined;
    if (que) { rel = que; ante = before(cx, i); }
    else {
      const cili = use(cx, i, (c) => c.pos === 'PRON' && c.lemma === 'cili' && has(c, 'PronType', 'Rel'));
      const art = i - 1;
      if (cili && isWord(cx, art) && ARTICLE_FORMS.has(norm(cx, art))) {
        rel = cili;
        first = art;
        // the antecedent: the word before the article, a comma may stand between (Burri, i cili punon)
        let a = art - 1;
        if (a >= 0 && !isWord(cx, a) && cx.tokens[a].surface.trim() === ',') a--;
        ante = isWord(cx, a) ? a : -1;
      }
    }
    if (!rel) return;
    const head = antecedent(ante);
    const v = skipTo(cx, i + 1, (k) => shortAt(cx, k) || negationAt(cx, k));
    const verb = finiteVerb(cx, v);
    // the small word in front of cili is read by its written form: the sentence layer reads it as a pronoun, so the
    // pattern leans on that token no harder than the best (or the disputed) reading it has
    const small = first === i ? undefined : { cap: tokenCap(cx, first) };
    if (head && verb) out.push(hit('relative-clause', small ? [rel, head, verb, small] : [rel, head, verb], [ante, first, i, v]));
  });
  return out;
};

// ───────────────────────────── the detector ─────────────────────────────

const DETECTORS: readonly Detector[] = [
  definiteEnding, linkingArticleAdjective, genitiveLinkingArticle, possessiveAfterNoun, nominativeAfterPreposition,
  ablativeAfterPreposition, objectPronounBeforeVerb, cliticCluster, cliticDoubling, imperativePronoun, teClauses, negationNuk,
  negationMos, progressive, questionA, gerundDuke, purposePerTe, withoutPa, asSoonMeTe, perfect, nonActivePresent, nonActiveU,
  admirative, optative, comparison, relativeClause,
];

/**
 * Every construction of the catalogue that the sentence shows. Each detector reads the chosen readings
 * (`candidates[0]`) and, where the shape of a pattern leaves no other choice, a later reading (see `use`).
 */
export function detectSqConstructions(tokens: RawToken[], analyses: AnalyzedToken[]): PatternCandidate[] {
  const cx: Ctx = { tokens, analyses };
  const found = DETECTORS.flatMap((d) => d(cx));
  // "kisha" before a participle is the verb (I had), taken loosely over the noun kishë (the church): the noun reading is
  // not a definite ending here
  const aux = new Set(found.filter((p) => p.key === 'pluperfect' && cands(cx, p.tokenIndexes[0])[0]?.pos === 'NOUN').map((p) => p.tokenIndexes[0]));
  const out = found.filter((p) => !(p.key === 'definite-noun-ending' && aux.has(p.tokenIndexes[0])));
  return out.sort((a, b) => a.tokenIndexes[0] - b.tokenIndexes[0] || a.key.localeCompare(b.key));
}
