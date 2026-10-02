/**
 * German constructions: grammar patterns the reader can name (verb second, the verb-final subordinate clause, the
 * sentence bracket, modal + infinitive, zu-infinitive, relative clause, passive, Konjunktiv …), plus the phrase units
 * and the sentence splitter. Every detector reads the part of speech and the features of the chosen reading
 * (`candidates[0]`) from the analyses in the conventions of docs/PLAN11.md; a feature that is missing or still a union
 * means "do not fire", never "assume". No detector looks at the spelling of a verb form: a periphrastic tense is found
 * through the lemma of the auxiliary and the form of the other verb, a separated verb through `unit`.
 *
 * For every construction that is a bracket (haben … participle, um … zu, relative pronoun … verb) the first two
 * `tokenIndexes` are the opening and the closing piece, so that the distance between them can be measured later.
 * Machine-drafted, not native-reviewed.
 */
import type { AnalysisCandidate, AnalyzedToken, PatternCandidate, RawToken, Span } from '../../core';
import { deLexiconView } from './lexicon';
import { segmentGermanSentences as segment } from './sentences';

export { GERMAN_PHRASE_RULES } from './phrases';

/** Sentence splitting for German (see sentences.ts). */
export function segmentGermanSentences(text: string): Span[] { return segment(text); }

// ───────────────────────────── what each construction says ─────────────────────────────

interface Info { title: string; explanation: string }

export const GERMAN_CONSTRUCTION_INFO: Readonly<Record<string, Info>> = {
  'verb-second-inversion': {
    title: 'Verb second: something else comes first',
    explanation: 'The conjugated verb is always the second element of a main clause. When something other than the subject comes first, the subject moves behind the verb: "Heute gehe ich nach Hause" (today go I home).',
  },
  'verb-final-subordinate': {
    title: 'Subordinate clause: verb last',
    explanation: 'After dass, weil, wenn, ob, als and similar words the conjugated verb goes to the end of its clause: "Ich weiß, dass er heute kommt."',
  },
  'sentence-bracket-perfect': {
    title: 'Perfect: haben or sein + past participle',
    explanation: 'The perfect is made with haben or sein and a past participle. The participle waits at the end of the clause, so the two pieces frame everything between them: "Ich habe gestern einen Freund besucht."',
  },
  pluperfect: {
    title: 'Pluperfect: hatte or war + past participle',
    explanation: 'Hatte or war plus a past participle says something had already happened before another moment in the past: "Er war schon gegangen, als ich kam."',
  },
  future: {
    title: 'Future: werden + infinitive',
    explanation: 'Werden plus an infinitive at the end of the clause talks about the future (or makes a guess): "Ich werde morgen kommen." The present tense with a time word does the same job in everyday German.',
  },
  passive: {
    title: 'Passive: werden + past participle',
    explanation: 'Werden plus a past participle says what is done to the subject: "Das Haus wird gebaut" (the house is being built). The doer, if named, comes with von: "von den Arbeitern".',
  },
  'passive-past': {
    title: 'Passive in the past: wurde + past participle',
    explanation: 'Wurde plus a past participle is the past of the passive: "Das Haus wurde gebaut" (the house was built).',
  },
  'modal-infinitive': {
    title: 'Modal verb + infinitive',
    explanation: 'A modal verb (können, müssen, wollen, sollen, dürfen, mögen) takes a plain infinitive at the end of the clause, with no zu: "Ich muss heute arbeiten."',
  },
  'separable-prefix-verb': {
    title: 'Separable verb: the prefix goes to the end',
    explanation: 'Many verbs have a prefix that splits off and goes to the end of the clause: aufstehen becomes "Ich stehe um sechs Uhr auf." Look for the verb and its prefix as a pair.',
  },
  'zu-infinitive': {
    title: 'Infinitive with zu',
    explanation: 'Many verbs, nouns and adjectives are followed by an infinitive with zu, after a comma when it has more words: "Es ist schön, dich zu sehen." With a separable verb the zu goes inside the word: anzufangen.',
  },
  'um-zu': {
    title: 'um … zu: in order to',
    explanation: '"Um … zu" plus an infinitive says what something is for: "Ich lerne Deutsch, um in Berlin zu arbeiten" (in order to work in Berlin).',
  },
  'relative-clause': {
    title: 'Relative clause',
    explanation: 'A relative pronoun (der, die, das, dem, den …) starts a clause that describes a noun. Its gender and number follow the noun, its case follows its job in the clause, and the verb goes last: "Der Mann, der dort steht, ist mein Vater."',
  },
  'konjunktiv-2-wuerde': {
    title: 'würde + infinitive (would)',
    explanation: 'Würde plus an infinitive says what would happen: "Ich würde gern reisen." It is the everyday replacement for the Konjunktiv II forms of most verbs.',
  },
  'konjunktiv-2': {
    title: 'Konjunktiv II (wäre, hätte, könnte …)',
    explanation: 'The Konjunktiv II is used for wishes, unreal conditions and polite requests: "Wenn ich Zeit hätte, käme ich." (If I had time, I would come.) It is not a past tense.',
  },
  'konjunktiv-1': {
    title: 'Konjunktiv I: reported speech',
    explanation: 'The Konjunktiv I reports what someone said without vouching for it: "Er sagt, er sei krank" (he says he is ill). It is mostly found in newspapers and formal writing.',
  },
  'dative-after-preposition': {
    title: 'Dative after the preposition',
    explanation: 'mit, von, zu, aus, bei, nach, seit (and außer, gegenüber) always take the dative: "von ganzem Herzen", "mit dem Auto".',
  },
  'accusative-after-preposition': {
    title: 'Accusative after the preposition',
    explanation: 'durch, für, gegen, ohne and um always take the accusative: "für den Mann", "ohne mich".',
  },
  'two-way-preposition': {
    title: 'Two-way preposition: place or direction',
    explanation: 'The two-way prepositions (an, auf, in, über, unter, vor, hinter, neben, zwischen) take the dative for position (where?) and the accusative for movement toward a place (where to?): "Ich bin im Haus" / "Ich gehe ins Haus".',
  },
  'genitive-attribute': {
    title: 'Genitive: of …',
    explanation: 'The genitive shows who something belongs to and follows the noun: "das Haus des Mannes" (the man\'s house). In speech von + dative is common instead: "das Haus von dem Mann".',
  },
  'genitive-preposition': {
    title: 'Preposition with the genitive',
    explanation: 'Wegen, trotz, während, statt, innerhalb and similar prepositions take the genitive: "wegen des Wetters". In speech you will often hear the dative instead.',
  },
  'adjective-ending-weak': {
    title: 'Adjective ending after der / die / das',
    explanation: 'After the definite article the adjective ends in -e or -en: "der gute Mann", "mit dem guten Mann".',
  },
  'adjective-ending-strong': {
    title: 'Adjective ending with no article',
    explanation: 'With no article the adjective carries the case ending itself: "guter Wein", "mit gutem Wein".',
  },
  'adjective-ending-mixed': {
    title: 'Adjective ending after ein / kein / mein',
    explanation: 'Ein has no ending in some forms, so the adjective shows it: "ein guter Mann" but "eine gute Frau", and "mit einem guten Mann".',
  },
  'comparative-als': {
    title: 'Comparison: comparative + als',
    explanation: 'A comparative adjective is followed by als: "Er ist größer als ich" (taller than I). For "as … as" use so … wie.',
  },
  'superlative-am': {
    title: 'Superlative with am',
    explanation: 'When the superlative is not followed by a noun it is made with am … -sten: "Sie singt am schönsten." Before a noun it is an ordinary adjective: "der schönste Tag".',
  },
  'negation-kein': {
    title: 'kein: no, not a',
    explanation: '"Kein" negates a noun that has no article or "ein": "Ich habe kein Auto." Use nicht for verbs, adjectives and nouns with der / die / das: "Ich habe das Auto nicht."',
  },
  'es-gibt': {
    title: 'es gibt: there is, there are',
    explanation: '"Es gibt" plus the accusative says that something exists: "Es gibt hier ein Café." The verb is geben, but the meaning is not "gives".',
  },
  'man-impersonal': {
    title: 'man: one, people, you',
    explanation: '"Man" is an impersonal subject and takes a third person singular verb: "Man sagt, dass …" (they say that …). It is not the noun Mann (man).',
  },
  'question-verb-first': {
    title: 'Yes/no question: verb first',
    explanation: 'A question with no question word starts with the verb, then the subject: "Kommst du morgen?"',
  },
  imperative: {
    title: 'Imperative (command)',
    explanation: 'The command form is usually the verb stem with no pronoun: "Komm her!" With Sie the verb comes first and Sie follows it: "Kommen Sie!"',
  },
  'participial-modifier': {
    title: 'Participle as an adjective before the noun',
    explanation: 'A participle can stand before a noun with an adjective ending, and everything between the article and the noun belongs to it: "das gestern gelesene Buch" (the book read yesterday).',
  },
  'reflexive-verb': {
    title: 'Reflexive verb',
    explanation: 'Some verbs always come with a reflexive pronoun: "Ich freue mich", "Er erinnert sich". The pronoun follows the subject: mich, dich, sich, uns, euch, sich.',
  },
  'dative-object-verb': {
    title: 'Verb with a dative object',
    explanation: 'Some verbs take their object in the dative, not the accusative: helfen, danken, gefallen, gehören, folgen. "Ich helfe dem Mann." Learn the case together with the verb.',
  },
  'nominalised-verb': {
    title: 'Verb used as a noun',
    explanation: 'An infinitive can become a noun, with a capital letter and neuter das: "das Lesen" (reading), "beim Essen" (while eating).',
  },
  'modal-particle': {
    title: 'Modal particle',
    explanation: '"Doch", "mal", "ja", "eben", "halt", "wohl" and similar small words colour the tone of a sentence and have no word-for-word translation: "Komm doch mal her!"',
  },
};

/** Every construction key the detector can report. */
export const GERMAN_CONSTRUCTION_KEYS: readonly string[] = Object.keys(GERMAN_CONSTRUCTION_INFO);

// ───────────────────────────── the sentence as the detectors see it ─────────────────────────────

/** A stretch of tokens between two separators (comma, full stop, colon, quotation mark …). */
export interface Clause {
  /** Indexes of the word tokens, in order. */
  words: number[];
  /** The separator tokens in front (concatenated) and after. */
  before: string;
  after: string;
  /** True when a sentence, a quotation or a direct speech begins here. */
  fresh: boolean;
}

export interface Ctx {
  tokens: RawToken[];
  analyses: AnalyzedToken[];
  /** The chosen reading of token i (undefined for punctuation and for a word nothing is known about). */
  c(i: number): AnalysisCandidate | undefined;
  /** Normalized form of token i. */
  n(i: number): string;
  clauses: Clause[];
  clauseOf: number[];
  /** Index of the next / previous word token (-1 when none). */
  next(i: number): number;
  prev(i: number): number;
}

const SEPARATOR = /^[,;:.!?…„“”‚‘’"«»()[\]—–]+$/u;

function isSeparator(tokens: RawToken[], i: number): boolean {
  const t = tokens[i];
  if (t.isWord || !SEPARATOR.test(t.surface)) return false;
  if (t.surface === '.') {
    // the dot of an ordinal or an abbreviation (3. Mai, z. B.) is not a break
    const p = tokens[i - 1];
    const nx = tokens[i + 1];
    if (p && p.end === t.start && /^(\d+|\p{L})$/u.test(p.surface) && nx?.isWord) return false;
  }
  return true;
}

export function makeCtx(tokens: RawToken[], analyses: AnalyzedToken[]): Ctx {
  const clauses: Clause[] = [];
  const clauseOf: number[] = tokens.map(() => -1);
  let cur: Clause = { words: [], before: '', after: '', fresh: true };
  let sepRun = '';
  const close = () => {
    if (cur.words.length) clauses.push(cur);
  };
  for (let i = 0; i < tokens.length; i++) {
    if (isSeparator(tokens, i)) {
      if (cur.words.length) { cur.after += tokens[i].surface; close(); cur = { words: [], before: '', after: '', fresh: false }; sepRun = ''; }
      sepRun += tokens[i].surface;
      cur.before = sepRun;
      cur.fresh = /[.!?…:„»“‚"]/u.test(sepRun);
      continue;
    }
    if (tokens[i].isWord) {
      cur.words.push(i);
      clauseOf[i] = clauses.length;
    }
  }
  close();
  return {
    tokens, analyses, clauses, clauseOf,
    c: (i) => (tokens[i]?.isWord ? analyses[i]?.candidates[0] : undefined),
    n: (i) => tokens[i]?.normalized ?? '',
    next: (i) => { for (let k = i + 1; k < tokens.length; k++) if (tokens[k].isWord) return k; return -1; },
    prev: (i) => { for (let k = i - 1; k >= 0; k--) if (tokens[k].isWord) return k; return -1; },
  };
}

// ───────────────────────────── reading features ─────────────────────────────

const set = (c: AnalysisCandidate | undefined, k: string): string[] => (c?.morph[k] ?? '').split(',').filter(Boolean);
export const has = (c: AnalysisCandidate | undefined, k: string, v: string): boolean => set(c, k).includes(v);
export const exact = (c: AnalysisCandidate | undefined, k: string, v: string): boolean => c?.morph[k] === v;
const verbal = (c: AnalysisCandidate | undefined): c is AnalysisCandidate => c?.pos === 'VERB' || c?.pos === 'AUX';
/** A finite verb; a union that still holds Fin and Inf counts (the reading cannot be anything but finite where the position shows it). */
const finite = (c: AnalysisCandidate | undefined): boolean => verbal(c) && has(c, 'VerbForm', 'Fin') && !has(c, 'VerbForm', 'Part');
/** A verb that can only be finite (no infinitive or participle reading left in the union). */
const surelyFinite = (c: AnalysisCandidate | undefined): boolean => finite(c) && !has(c, 'VerbForm', 'Inf');
/** May be an infinitive (a union "Fin,Inf" counts: the adapter keeps both when no neighbour decides). */
const infinitive = (c: AnalysisCandidate | undefined): boolean => verbal(c) && has(c, 'VerbForm', 'Inf');
const pastParticiple = (c: AnalysisCandidate | undefined): boolean => verbal(c) && has(c, 'VerbForm', 'Part') && !has(c, 'VerbForm', 'Fin') && has(c, 'Tense', 'Past');
const nominal = (c: AnalysisCandidate | undefined): boolean => !!c && ['DET', 'ADJ', 'PRON', 'NOUN', 'PROPN', 'NUM'].includes(c.pos ?? '');
const nounLike = (c: AnalysisCandidate | undefined): boolean => c?.pos === 'NOUN' || c?.pos === 'PROPN';
const subjectPronoun = (c: AnalysisCandidate | undefined): boolean => c?.pos === 'PRON' && has(c, 'PronType', 'Prs') && has(c, 'Case', 'Nom');
/** A noun phrase word whose case the sentence layer decided to be nominative. */
const nominativeWord = (c: AnalysisCandidate | undefined): boolean => !!c && ['DET', 'NOUN', 'PROPN', 'ADJ'].includes(c.pos ?? '') && exact(c, 'Case', 'Nom');

const MODALS = new Set(['können', 'müssen', 'wollen', 'sollen', 'dürfen', 'mögen', 'möchten']);
const DATIVE_VERBS = new Set([
  'helfen', 'danken', 'gefallen', 'gehören', 'folgen', 'antworten', 'passen', 'schmecken', 'fehlen', 'gratulieren', 'begegnen',
  'zuhören', 'glauben', 'vertrauen', 'gelingen', 'dienen', 'drohen', 'gleichen', 'nutzen', 'schaden', 'widersprechen', 'zustimmen', 'wehtun',
]);

/** Prepositions and the case they govern; closed class, written out. */
const ACCUSATIVE_PREPOSITIONS = new Set(['durch', 'für', 'gegen', 'ohne', 'um', 'wider']);
const DATIVE_PREPOSITIONS = new Set(['aus', 'außer', 'bei', 'mit', 'nach', 'seit', 'von', 'zu', 'gegenüber', 'entgegen']);
const TWO_WAY_PREPOSITIONS = new Set(['an', 'auf', 'hinter', 'in', 'neben', 'über', 'unter', 'vor', 'zwischen']);
const GENITIVE_PREPOSITIONS = new Set([
  'wegen', 'trotz', 'während', 'statt', 'anstatt', 'innerhalb', 'außerhalb', 'oberhalb', 'unterhalb', 'aufgrund', 'angesichts', 'infolge',
  'diesseits', 'jenseits', 'mittels', 'bezüglich', 'hinsichtlich', 'anlässlich',
]);
/** A preposition written together with its article: the preposition and the case of the article. */
const CONTRACTIONS: Record<string, [string, 'Acc' | 'Dat']> = {
  am: ['an', 'Dat'], im: ['in', 'Dat'], beim: ['bei', 'Dat'], zum: ['zu', 'Dat'], zur: ['zu', 'Dat'], vom: ['von', 'Dat'],
  vorm: ['vor', 'Dat'], hinterm: ['hinter', 'Dat'], überm: ['über', 'Dat'], unterm: ['unter', 'Dat'], aufm: ['auf', 'Dat'],
  ans: ['an', 'Acc'], ins: ['in', 'Acc'], aufs: ['auf', 'Acc'], fürs: ['für', 'Acc'], ums: ['um', 'Acc'], durchs: ['durch', 'Acc'],
  übers: ['über', 'Acc'], unters: ['unter', 'Acc'], hinters: ['hinter', 'Acc'], vors: ['vor', 'Acc'],
};

const clip = (n: number): number => Math.max(0, Math.min(0.95, Math.round(n * 100) / 100));

function hit(key: string, confidence: number, tokenIndexes: number[], extra = ''): PatternCandidate {
  const info = GERMAN_CONSTRUCTION_INFO[key];
  const seen = new Set<number>();
  const idx = tokenIndexes.filter((i) => (seen.has(i) ? false : (seen.add(i), true)));
  return { key, title: info.title, explanation: extra ? `${info.explanation} ${extra}` : info.explanation, tokenIndexes: idx, confidence: clip(confidence) };
}

type Detector = (ctx: Ctx) => PatternCandidate[];

/** The lowest confidence among the readings a construction rests on. */
const conf = (...cs: Array<AnalysisCandidate | undefined>): number => Math.min(...cs.map((c) => c?.confidence ?? 0.5));

// ───────────────────────────── clause structure ─────────────────────────────

/** Verb second: a fronted element, the conjugated verb, then the subject. */
const verbSecond: Detector = (ctx) => {
  const out: PatternCandidate[] = [];
  ctx.clauses.forEach((cl, ci) => {
    const ws = cl.words;
    const s = ctx.c(ws[0])?.pos === 'CONJ' ? 1 : 0;
    if (s >= ws.length) return;
    const first = ctx.c(ws[s]);
    if (!first || first.pos === 'SCONJ' || first.pos === 'CONJ' || has(first, 'PronType', 'Rel')) return;
    let v = -1;
    for (let k = s; k < ws.length; k++) {
      const c = ctx.c(ws[k]);
      if (!c) return; // a word nothing is known about in front of the verb: cannot tell
      if (finite(c)) { v = k; break; }
    }
    if (v < 0) return;
    const verb = ctx.c(ws[v]);
    if (!verb || has(verb, 'Mood', 'Imp')) return;
    const subjectIndex = ws[v + 1];
    const subject = subjectIndex === undefined ? undefined : ctx.c(subjectIndex);
    if (!subject || !(subjectPronoun(subject) || nominativeWord(subject))) return;
    const base = Math.min(conf(verb, subject), subjectPronoun(subject) ? 0.9 : 0.8);
    if (v === s) {
      // a main clause after a fronted subordinate clause: "Wenn er kommt, gehe ich …"
      const before = ctx.clauses[ci - 1];
      if (!before || cl.before.trim() !== ',' || ctx.c(before.words[0])?.pos !== 'SCONJ') return;
      out.push(hit('verb-second-inversion', base - 0.05, [ws[v], subjectIndex], 'Here the whole clause in front counts as the first element.'));
      return;
    }
    // what stands in front must not be able to be the subject itself
    const f0 = ctx.c(ws[s])!;
    if (nominal(f0) && !has(f0, 'PronType', 'Int') && !(set(f0, 'Case').length > 0 && !has(f0, 'Case', 'Nom'))) return;
    if (v - s > 6) return;
    for (let k = s; k < v; k++) {
      const c = ctx.c(ws[k])!;
      if (c.pos === 'SCONJ' || (c.pos === 'PART' && c.lemma === 'zu')) return;
    }
    out.push(hit('verb-second-inversion', base, [ws[s], ws[v], subjectIndex]));
  });
  return out;
};

/** A subordinate clause: a conjunction (or an indirect question word) and the conjugated verb at the end. */
const subordinate: Detector = (ctx) => {
  const out: PatternCandidate[] = [];
  ctx.clauses.forEach((cl, ci) => {
    const ws = cl.words;
    for (let k = 0; k < ws.length; k++) {
      const c = ctx.c(ws[k]);
      const sconj = c?.pos === 'SCONJ';
      const question = !sconj && k === 0 && ci > 0 && cl.before.trim() === ',' && !!c && has(c, 'PronType', 'Int') && (c.pos === 'ADV' || c.pos === 'PRON');
      if (!sconj && !question) continue;
      let end = ws.length;
      for (let m = k + 1; m < ws.length; m++) if (ctx.c(ws[m])?.pos === 'SCONJ') { end = m; break; }
      const stretch = ws.slice(k, end);
      if (stretch.length < 3) continue;
      const last = ctx.c(stretch[stretch.length - 1]);
      if (!finite(last)) continue;
      // another conjugated verb inside means two clauses run together: not this pattern
      if (stretch.slice(1, -1).some((w) => surelyFinite(ctx.c(w)))) continue;
      if (question && surelyFinite(ctx.c(stretch[1]))) continue;
      out.push(hit('verb-final-subordinate', Math.min(conf(c, last), question ? 0.7 : 0.9), [ws[k], stretch[stretch.length - 1]]));
      k = end - 1;
    }
  });
  return out;
};

/** The word of the clause that completes an auxiliary: the nearest one after it, or before it when the auxiliary closes the clause. */
function partner(ctx: Ctx, ws: number[], pos: number, want: (c: AnalysisCandidate | undefined) => boolean): number | undefined {
  const stop = (c: AnalysisCandidate | undefined) => surelyFinite(c) || c?.pos === 'CONJ';
  const after: number[] = [];
  for (let k = pos + 1; k < ws.length; k++) {
    const c = ctx.c(ws[k]);
    if (want(c)) { after.push(ws[k]); continue; }
    if (stop(c)) break;
  }
  const before: number[] = [];
  for (let k = pos - 1; k >= 0; k--) {
    const c = ctx.c(ws[k]);
    if (want(c)) { before.push(ws[k]); continue; }
    if (stop(c)) break;
  }
  if (pos < ws.length - 1 && after.length) return after[after.length - 1];
  return before[0];
}

/** The sentence bracket: an auxiliary or modal and the participle or infinitive that closes the clause. */
const brackets: Detector = (ctx) => {
  const out: PatternCandidate[] = [];
  const notWerden = (c: AnalysisCandidate | undefined) => pastParticiple(c) && c?.lemma !== 'werden';
  ctx.clauses.forEach((cl) => {
    const ws = cl.words;
    // "ist gebaut worden" is a perfect passive: not a perfect with sein
    const perfectPassive = ws.some((w) => pastParticiple(ctx.c(w)) && ctx.c(w)?.lemma === 'werden');
    ws.forEach((w, pos) => {
      const a = ctx.c(w);
      if (!a || !finite(a) || !a.lemma) return;
      // set-aware: a form that is the same in the indicative and Konjunktiv I ("habe": Mood Ind,Sub) may be the indicative
      const ind = has(a, 'Mood', 'Ind');
      const sub = has(a, 'Mood', 'Sub');
      const pres = has(a, 'Tense', 'Pres') && !has(a, 'Tense', 'Past');
      const past = has(a, 'Tense', 'Past') && !has(a, 'Tense', 'Pres');
      if (a.lemma === 'haben' || a.lemma === 'sein') {
        if (!ind || perfectPassive) return;
        const p = partner(ctx, ws, pos, notWerden);
        if (p === undefined) return;
        const base = conf(a, ctx.c(p)) - (a.lemma === 'sein' ? 0.1 : 0);
        if (pres) out.push(hit('sentence-bracket-perfect', base, [w, p]));
        else if (past) out.push(hit('pluperfect', base, [w, p]));
        return;
      }
      if (a.lemma === 'werden') {
        if (ind && (pres || past)) {
          const pp = partner(ctx, ws, pos, notWerden);
          if (pp !== undefined) { out.push(hit(pres ? 'passive' : 'passive-past', conf(a, ctx.c(pp)), [w, pp])); return; }
          if (pres) {
            const ip = partner(ctx, ws, pos, infinitive);
            if (ip !== undefined) out.push(hit('future', conf(a, ctx.c(ip)), [w, ip]));
          }
        } else if (sub && !ind) {
          const ip = partner(ctx, ws, pos, infinitive);
          if (ip !== undefined) out.push(hit('konjunktiv-2-wuerde', conf(a, ctx.c(ip)), [w, ip]));
        }
        return;
      }
      if (MODALS.has(a.lemma)) {
        const ip = partner(ctx, ws, pos, infinitive);
        if (ip !== undefined) out.push(hit('modal-infinitive', conf(a, ctx.c(ip)), [w, ip]));
      }
    });
  });
  return out;
};

/** A unit whose pieces are written apart (steht … auf): reported once, on the head. */
const separable: Detector = (ctx) => {
  const out: PatternCandidate[] = [];
  ctx.tokens.forEach((t, i) => {
    const c = ctx.c(i);
    const unit = c?.unit;
    if (!t.isWord || !c || !unit || unit.head !== i) return;
    const pieces = [...new Set(unit.pieces)].filter((p) => p !== i && p >= 0 && p < ctx.tokens.length);
    if (!pieces.length) return;
    out.push(hit('separable-prefix-verb', c.confidence, [i, ...pieces], unit.display ? `Here: ${unit.display}.` : ''));
  });
  return out;
};

/** zu + infinitive, um … zu, and the zu inserted inside a separable verb (anzufangen). */
const zuInfinitive: Detector = (ctx) => {
  const out: PatternCandidate[] = [];
  ctx.clauses.forEach((cl) => {
    const ws = cl.words;
    ws.forEach((w, pos) => {
      const c = ctx.c(w);
      if (!c) return;
      if (verbal(c) && has(c, 'VerbForm', 'Inf') && c.parts?.some((p) => p.kind === 'marker' && p.text.toLowerCase() === 'zu')) {
        out.push(hit('zu-infinitive', c.confidence, [w]));
        return;
      }
      if (c.pos !== 'PART' || (c.lemma ?? ctx.n(w)) !== 'zu') return;
      const nx = ws[pos + 1];
      const nc = nx === undefined ? undefined : ctx.c(nx);
      if (!nc || !verbal(nc) || !has(nc, 'VerbForm', 'Inf')) return;
      const first = ctx.c(ws[0])?.pos === 'CONJ' ? 1 : 0;
      const um = first < pos && ctx.n(ws[first]) === 'um';
      out.push(hit(um ? 'um-zu' : 'zu-infinitive', conf(c, nc), um ? [ws[first], nx] : [w, nx]));
    });
  });
  return out;
};

/** A relative clause: a comma, a relative pronoun (maybe behind a preposition), the verb last. */
const relativeClause: Detector = (ctx) => {
  const out: PatternCandidate[] = [];
  ctx.clauses.forEach((cl, ci) => {
    if (ci === 0 || !cl.before.includes(',')) return;
    const ws = cl.words;
    const k = ctx.c(ws[0])?.pos === 'ADP' ? 1 : 0;
    const rel = ctx.c(ws[k]);
    if (!rel || !(rel.pos === 'PRON' || rel.pos === 'DET') || !has(rel, 'PronType', 'Rel') || ws.length < k + 2) return;
    const lastIndex = ws[ws.length - 1];
    const last = ctx.c(lastIndex);
    if (!finite(last)) return;
    const before = ctx.clauses[ci - 1].words;
    const ante = ctx.c(before[before.length - 1]);
    if (!ante || !(nounLike(ante) || ante.pos === 'PRON')) return;
    out.push(hit('relative-clause', conf(rel, last), [ws[k], lastIndex]));
  });
  return out;
};

/** The sentence's own terminator after token i ('' when none). */
function terminatorAfter(ctx: Ctx, i: number): string {
  for (let k = i + 1; k < ctx.tokens.length; k++) {
    const t = ctx.tokens[k];
    if (!t.isWord && /^[.!?…]+$/u.test(t.surface) && !(t.surface === '.' && isSeparator(ctx.tokens, k) === false)) return t.surface;
  }
  return '';
}

const questionVerbFirst: Detector = (ctx) => {
  const out: PatternCandidate[] = [];
  ctx.clauses.forEach((cl) => {
    if (!cl.fresh || cl.words.length < 2) return;
    const v = ctx.c(cl.words[0]);
    const subject = ctx.c(cl.words[1]);
    if (!finite(v) || has(v, 'Mood', 'Imp') || !(subjectPronoun(subject) || nominativeWord(subject))) return;
    if (!terminatorAfter(ctx, cl.words[0]).includes('?')) return;
    out.push(hit('question-verb-first', Math.min(conf(v, subject), 0.9), [cl.words[0], cl.words[1]]));
  });
  return out;
};

const imperative: Detector = (ctx) => {
  const out: PatternCandidate[] = [];
  ctx.clauses.forEach((cl) => {
    const s = ctx.c(cl.words[0])?.pos === 'CONJ' ? 1 : 0;
    const w = cl.words[s];
    const c = w === undefined ? undefined : ctx.c(w);
    if (c && verbal(c) && has(c, 'Mood', 'Imp') && !has(c, 'Mood', 'Ind')) out.push(hit('imperative', c.confidence, [w]));
  });
  return out;
};

/** Konjunktiv II (Mood Sub, Tense Past) and Konjunktiv I (Mood Sub, Tense Pres), only where the reading is unambiguous. */
const konjunktiv: Detector = (ctx) => {
  const out: PatternCandidate[] = [];
  ctx.tokens.forEach((t, i) => {
    const c = ctx.c(i);
    if (!t.isWord || !finite(c) || !exact(c, 'Mood', 'Sub')) return;
    if (exact(c, 'Tense', 'Past') && c!.lemma !== 'werden') out.push(hit('konjunktiv-2', c!.confidence, [i]));
    else if (exact(c, 'Tense', 'Pres')) out.push(hit('konjunktiv-1', c!.confidence, [i]));
  });
  return out;
};

// ───────────────────────────── the noun phrase and what governs it ─────────────────────────────

const sameClause = (ctx: Ctx, a: number, b: number): boolean => a >= 0 && b >= 0 && ctx.clauseOf[a] === ctx.clauseOf[b];

/** Dative, accusative, two-way and genitive prepositions, read from the case the next word shows. */
const prepositions: Detector = (ctx) => {
  const out: PatternCandidate[] = [];
  ctx.tokens.forEach((t, i) => {
    const c = ctx.c(i);
    if (!t.isWord || c?.pos !== 'ADP') return;
    const contraction = CONTRACTIONS[ctx.n(i)];
    const partCase = c.parts?.find((p) => p.kind === 'contracted' && p.pos === 'DET')?.morph?.Case;
    const lemma = contraction ? contraction[0] : (c.lemma ?? ctx.n(i)).toLowerCase();
    const contracted = partCase === 'Acc' || partCase === 'Dat' ? partCase : contraction?.[1];
    const nx = ctx.next(i);
    const together = sameClause(ctx, i, nx);
    const nc = together ? ctx.c(nx) : undefined;
    const kase = contracted ? [contracted] : nominal(nc) ? set(nc, 'Case') : [];
    if (!kase.length) return;
    const idx = together ? [i, nx] : [i];
    const shown = together ? `"${t.surface} ${ctx.tokens[nx].surface}"` : `"${t.surface}"`;
    const sure = kase.length === 1 ? (contracted ? 0.8 : 0.85) : 0.65;
    const base = Math.min(c.confidence, sure);
    if (DATIVE_PREPOSITIONS.has(lemma) && kase.includes('Dat')) out.push(hit('dative-after-preposition', base, idx));
    else if (ACCUSATIVE_PREPOSITIONS.has(lemma) && kase.includes('Acc')) out.push(hit('accusative-after-preposition', base, idx));
    else if (GENITIVE_PREPOSITIONS.has(lemma) && kase.includes('Gen') && !contracted) out.push(hit('genitive-preposition', base, idx));
    else if (TWO_WAY_PREPOSITIONS.has(lemma) && kase.length === 1 && (kase[0] === 'Acc' || kase[0] === 'Dat')) {
      const extra = kase[0] === 'Acc'
        ? `Here the case is accusative: ${shown} says where something is going (movement or direction). With some verbs, warten auf or denken an for example, the accusative is simply part of the verb.`
        : `Here the case is dative: ${shown} says where something is or happens (position).`;
      out.push(hit('two-way-preposition', base - 0.05, idx, extra));
    }
  });
  return out;
};

/** das Haus des Mannes, Annas Haus. */
const genitiveAttribute: Detector = (ctx) => {
  const out: PatternCandidate[] = [];
  ctx.tokens.forEach((t, i) => {
    const c = ctx.c(i);
    if (!t.isWord || !nounLike(c)) return;
    const j = ctx.next(i);
    if (!sameClause(ctx, i, j)) return;
    const d = ctx.c(j);
    if (c!.pos === 'PROPN' && exact(c, 'Case', 'Gen') && d?.pos === 'NOUN') {
      out.push(hit('genitive-attribute', Math.min(conf(c, d), 0.75), [i, j]));
      return;
    }
    if (!d || !(d.pos === 'DET' || d.pos === 'ADJ' || d.pos === 'PRON') || !exact(d, 'Case', 'Gen')) return;
    let k = ctx.next(j);
    for (let step = 0; step < 3 && sameClause(ctx, i, k); step++) {
      const kc = ctx.c(k);
      if (nounLike(kc) && has(kc, 'Case', 'Gen')) { out.push(hit('genitive-attribute', conf(c, d, kc), [i, k, j])); return; }
      if (kc?.pos !== 'ADJ') return;
      k = ctx.next(k);
    }
  });
  return out;
};

/** An attributive adjective whose declension the sentence layer decided. */
const adjectiveEndings: Detector = (ctx) => {
  const out: PatternCandidate[] = [];
  const keys: Record<string, string> = { Weak: 'adjective-ending-weak', Strong: 'adjective-ending-strong', Mixed: 'adjective-ending-mixed' };
  ctx.tokens.forEach((t, i) => {
    const c = ctx.c(i);
    if (!t.isWord || c?.pos !== 'ADJ' || set(c, 'VerbForm').length) return;
    const key = keys[c.morph.Decl ?? ''];
    if (!key) return;
    let k = ctx.next(i);
    for (let guard = 0; guard < 3 && sameClause(ctx, i, k) && ctx.c(k)?.pos === 'ADJ'; guard++) k = ctx.next(k);
    const nc = sameClause(ctx, i, k) ? ctx.c(k) : undefined;
    if (nc?.pos !== 'NOUN') return;
    out.push(hit(key, conf(c, nc), [i, k]));
  });
  return out;
};

const comparativeAls: Detector = (ctx) => {
  const out: PatternCandidate[] = [];
  ctx.tokens.forEach((t, i) => {
    const c = ctx.c(i);
    if (!t.isWord || !c || !(c.pos === 'ADJ' || c.pos === 'ADV') || !has(c, 'Degree', 'Cmp')) return;
    let k = i;
    for (let step = 0; step < 5; step++) {
      const from = k;
      k = ctx.next(k);
      if (k < 0 || ctx.tokens.slice(from + 1, k).some((x) => !x.isWord && /^[.!?…]+$/u.test(x.surface))) return;
      if (finite(ctx.c(k))) return;
      if (ctx.n(k) === 'als') { out.push(hit('comparative-als', Math.min(c.confidence, 0.85), [i, k])); return; }
    }
  });
  return out;
};

/** am schönsten (not "am schönsten Tag", where the superlative is an ordinary adjective before its noun). */
const superlativeAm: Detector = (ctx) => {
  const out: PatternCandidate[] = [];
  ctx.tokens.forEach((t, i) => {
    if (!t.isWord || ctx.n(i) !== 'am') return;
    const nx = ctx.next(i);
    const sc = sameClause(ctx, i, nx) ? ctx.c(nx) : undefined;
    if (!sc || !(sc.pos === 'ADJ' || sc.pos === 'ADV') || !has(sc, 'Degree', 'Sup')) return;
    const after = ctx.next(nx);
    if (sameClause(ctx, i, after) && nounLike(ctx.c(after))) return;
    out.push(hit('superlative-am', Math.min(sc.confidence, 0.85), [i, nx]));
  });
  return out;
};

const negationKein: Detector = (ctx) => {
  const out: PatternCandidate[] = [];
  ctx.tokens.forEach((t, i) => {
    const c = ctx.c(i);
    if (!t.isWord || c?.lemma !== 'kein' || !(c.pos === 'DET' || c.pos === 'PRON')) return;
    let k = ctx.next(i);
    for (let guard = 0; guard < 3 && sameClause(ctx, i, k) && ctx.c(k)?.pos === 'ADJ'; guard++) k = ctx.next(k);
    const noun = sameClause(ctx, i, k) && ctx.c(k)?.pos === 'NOUN' ? k : -1;
    out.push(hit('negation-kein', c.confidence, noun >= 0 ? [i, noun] : [i]));
  });
  return out;
};

/** es gibt: geben with es, and the thing that exists able to be accusative. */
const esGibt: Detector = (ctx) => {
  const out: PatternCandidate[] = [];
  ctx.tokens.forEach((t, i) => {
    const c = ctx.c(i);
    if (!t.isWord || !c || c.lemma !== 'geben' || !finite(c) || !has(c, 'Person', '3') || !has(c, 'Number', 'Sing')) return;
    const p = ctx.prev(i);
    const nx = ctx.next(i);
    let es = -1;
    if (sameClause(ctx, i, p) && ctx.n(p) === 'es') es = p;
    else if (sameClause(ctx, i, nx) && ctx.n(nx) === 'es' && !subjectPronoun(ctx.c(p))) es = nx; // "Gibt es …", "Hier gibt es …"; not "Er gibt es mir"
    if (es < 0) return;
    let k = ctx.next(Math.max(i, es));
    let ok = false;
    for (let step = 0; step < 3 && sameClause(ctx, i, k); step++) {
      const kc = ctx.c(k);
      if (nominal(kc)) { ok = has(kc, 'Case', 'Acc'); break; }
      k = ctx.next(k);
    }
    if (ok) out.push(hit('es-gibt', Math.min(c.confidence, 0.85), [Math.min(i, es), Math.max(i, es)]));
  });
  return out;
};

const manImpersonal: Detector = (ctx) => {
  const out: PatternCandidate[] = [];
  ctx.tokens.forEach((t, i) => {
    const c = ctx.c(i);
    if (!t.isWord || c?.lemma !== 'man' || c.pos !== 'PRON') return;
    let k = ctx.next(i);
    for (let step = 0; step < 4 && sameClause(ctx, i, k); step++) {
      if (finite(ctx.c(k))) { out.push(hit('man-impersonal', c.confidence, [i, k])); return; }
      k = ctx.next(k);
    }
    out.push(hit('man-impersonal', c.confidence, [i]));
  });
  return out;
};

/**
 * Reflexive pronoun and its verb. Sich (or a reading marked Reflex) always counts; mich / dich / uns / euch are also
 * ordinary object pronouns, so they count only for a verb the lexicon lists as reflexive (ich freue mich, not ich sehe dich).
 * A verb the lexicon lists but does not mark as reflexive (Er sieht sich) is not a reflexive verb.
 */
const reflexiveVerb: Detector = (ctx) => {
  const out: PatternCandidate[] = [];
  ctx.tokens.forEach((t, i) => {
    const c = ctx.c(i);
    if (!t.isWord || !c || c.pos !== 'PRON') return;
    const sich = c.lemma === 'sich' || has(c, 'Reflex', 'Yes');
    const alsoReflexive = /reflexive/iu.test(c.role ?? '') || c.notes?.reflexive !== undefined;
    if (!sich && !alsoReflexive) return;
    const ws = ctx.clauses[ctx.clauseOf[i]]?.words ?? [];
    const verb = ws.find((w) => finite(ctx.c(w))) ?? ws.find((w) => verbal(ctx.c(w)));
    if (verb === undefined) return;
    const lemma = ctx.c(verb)?.lemma;
    const entries = lemma ? deLexiconView.verb(lemma.toLocaleLowerCase('de')) : [];
    const listedReflexive = entries.some((e) => e.reflexive);
    if (entries.length ? !listedReflexive : !sich) return;
    out.push(hit('reflexive-verb', c.confidence, [verb, i]));
  });
  return out;
};

/** helfen, danken … with a dative object that is not the object of a preposition. */
const dativeObjectVerb: Detector = (ctx) => {
  const out: PatternCandidate[] = [];
  ctx.tokens.forEach((t, i) => {
    const c = ctx.c(i);
    if (!t.isWord || !verbal(c) || !DATIVE_VERBS.has(c.lemma ?? '')) return;
    const ws = ctx.clauses[ctx.clauseOf[i]]?.words ?? [];
    for (const w of ws) {
      if (w === i) continue;
      const o = ctx.c(w);
      if (!o || !['PRON', 'DET', 'NOUN', 'PROPN'].includes(o.pos ?? '')) continue;
      // decided dative anywhere in the clause; a union that may be dative (and not accusative) only behind the verb
      const dative = exact(o, 'Case', 'Dat') || (w > i && has(o, 'Case', 'Dat') && !has(o, 'Case', 'Acc') && !has(o, 'Case', 'Nom'));
      if (!dative) continue;
      const before = ctx.prev(w);
      if (before >= 0 && sameClause(ctx, w, before) && ctx.c(before)?.pos === 'ADP') continue;
      out.push(hit('dative-object-verb', conf(c, o), [i, w]));
      return;
    }
  });
  return out;
};

/** das Lesen: an infinitive written with a capital as a noun. */
const nominalisedVerb: Detector = (ctx) => {
  const out: PatternCandidate[] = [];
  ctx.tokens.forEach((t, i) => {
    const c = ctx.c(i);
    if (!t.isWord || c?.pos !== 'NOUN' || !c.lemma || !/^\p{Lu}/u.test(t.surface)) return;
    if (!/^\p{Ll}.*(en|ern|eln)$/u.test(c.lemma) || ctx.n(i) !== c.lemma.toLowerCase()) return;
    out.push(hit('nominalised-verb', c.confidence, [i]));
  });
  return out;
};

const modalParticle: Detector = (ctx) => {
  const out: PatternCandidate[] = [];
  ctx.tokens.forEach((t, i) => {
    const c = ctx.c(i);
    if (!t.isWord || c?.pos !== 'PART' || !c.role || c.lemma === 'zu') return;
    out.push(hit('modal-particle', Math.min(c.confidence, 0.8), [i], `Here "${t.surface}" works as a modal particle: ${c.role}.`));
  });
  return out;
};

/** das gestern gelesene Buch: a determiner, a participle with an adjective ending, the noun. */
const participialModifier: Detector = (ctx) => {
  const out: PatternCandidate[] = [];
  ctx.tokens.forEach((t, i) => {
    const c = ctx.c(i);
    if (!t.isWord || !c || !(c.pos === 'ADJ' || c.pos === 'VERB') || !has(c, 'VerbForm', 'Part') || has(c, 'VerbForm', 'Fin') || !set(c, 'Case').length) return;
    const noun = ctx.next(i);
    if (!sameClause(ctx, i, noun) || ctx.c(noun)?.pos !== 'NOUN') return;
    let k = ctx.prev(i);
    for (let step = 0; step < 5 && sameClause(ctx, i, k); step++) {
      const kc = ctx.c(k);
      if (!kc || verbal(kc) && finite(kc)) return;
      if (kc.pos === 'DET') { out.push(hit('participial-modifier', conf(c, kc, ctx.c(noun)), [k, noun, i])); return; }
      k = ctx.prev(k);
    }
  });
  return out;
};

const DETECTORS: readonly Detector[] = [
  verbSecond, subordinate, brackets, separable, zuInfinitive, relativeClause, questionVerbFirst, imperative, konjunktiv,
  prepositions, genitiveAttribute, adjectiveEndings, comparativeAls, superlativeAm, negationKein, esGibt, manImpersonal,
  reflexiveVerb, dativeObjectVerb, nominalisedVerb, modalParticle, participialModifier,
];

/** Every construction in one sentence, in text order. */
export function detectGermanConstructions(tokens: RawToken[], analyses: AnalyzedToken[]): PatternCandidate[] {
  const ctx = makeCtx(tokens, analyses);
  const seen = new Set<string>();
  const out: PatternCandidate[] = [];
  for (const d of DETECTORS) {
    for (const p of d(ctx)) {
      const id = `${p.key}|${p.tokenIndexes.join(',')}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(p);
    }
  }
  return out.sort((a, b) => Math.min(...a.tokenIndexes) - Math.min(...b.tokenIndexes) || a.key.localeCompare(b.key));
}
