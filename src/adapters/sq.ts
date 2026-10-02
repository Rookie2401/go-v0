/**
 * Albanian adapter (course target: Standard Albanian, `sq`). NFC + lower-case identity; ë and ç are kept (they
 * distinguish words), digraphs (dh, gj, ll, nj, rr, sh, th, xh, zh) are single letters of the alphabet.
 *
 * Layers, in the order a token meets them (docs/PLAN13.md, docs/albanian/):
 *   the closed classes and the word list (albanian/function-*.ts, lexicon-*.ts: nouns with gender, definite form and
 *   plural; verbs with their principal parts; adjectives with or without a linking article) → the word-form engine
 *   (albanian/morphology.ts: every context-free reading of a written form, fused short pronouns taken apart, a word
 *   typed without ë / ç, a Gheg or older form related to its Standard equivalent, and only then a guess by ending) →
 *   the agreement of sources (albanian/disputed.ts, generated: a reading the UniParser analyzer, Wiktionary and the
 *   treebanks do not agree on is kept at low confidence) → the sentence layer (albanian/sentence.ts: the linking
 *   article and its adjective as one unit, e / i / të / u / do / po / pa / më by their neighbours, case after a
 *   preposition, kam / jam + participle) → phrase units and constructions (albanian/phrases.ts, constructions.ts) and
 *   checks on the learner's own Albanian (albanian/production.ts).
 * Confident: closed-class words, words of the list and their generated forms where the sources agree. Uncertain, and
 * said so: every competing reading the sentence does not decide (kept, none presented as certain), a reading the
 * sources dispute, a word outside the list (`unconfirmed`, no gloss), a form that is not Standard spelling as written.
 * There is no parser. All of the data is machine-drafted; no native speaker has checked it.
 */
import type {
  AdapterSupport, AnalysisSourceInfo, AnalyzedToken, LanguageAdapter, PronunciationSupport, RawToken,
} from '../core';
import { makeWordTokenizer, matchPhraseRules, speechNormalizeGeneric } from './shared';
import { SQ_ANALYZER, SQ_SOURCE_IDS, SQ_VERSION, sqAnalyze, sqCandidates } from './albanian/analyze';
import { detectSqConstructions } from './albanian/constructions';
import { describeSqMorph } from './albanian/describe';
import { SQ_LEXEMES, analyzeSqForm } from './albanian/morphology';
import { SQ_LETTERS, sqLetters, sqNormalize, sqSearchNormalize } from './albanian/orthography';
import { SQ_PHRASE_RULES } from './albanian/phrases';
import { checkSqProduction } from './albanian/production';
import { orderSqSentence } from './albanian/sentence';
import { segmentSqSentences } from './albanian/sentences';
import { sqMorphFromTags } from './albanian/tags';
import { SQ_VARIETIES, sqVarietiesFromTags } from './albanian/varieties';

const LANG = 'sq' as const;
const VERSION = SQ_VERSION;
const ANALYZER = SQ_ANALYZER;

export { SQ_SOURCE_IDS };

const SOURCES: Record<string, AnalysisSourceInfo> = {
  [SQ_SOURCE_IDS.hand]: { id: SQ_SOURCE_IDS.hand, label: 'Course word list', origin: 'hand', reviewStatus: 'machine-drafted', version: VERSION },
  [SQ_SOURCE_IDS.rules]: { id: SQ_SOURCE_IDS.rules, label: 'Albanian word-form and sentence rules', origin: 'rule', reviewStatus: 'machine-drafted', version: VERSION },
  [SQ_SOURCE_IDS.phrases]: { id: SQ_SOURCE_IDS.phrases, label: 'Course phrase list', origin: 'hand', reviewStatus: 'machine-drafted', version: VERSION },
  [SQ_SOURCE_IDS.constructions]: { id: SQ_SOURCE_IDS.constructions, label: 'Course grammar patterns', origin: 'hand', reviewStatus: 'machine-drafted', version: VERSION },
};

const LEMMAS = SQ_LEXEMES.length;

const SUPPORT: AdapterSupport = {
  tokenization: 'dependable', // Intl.Segmenter('sq'); ë and ç stay inside tokens; an apostrophe form (t'i, s'jam) is one token
  sentenceSegmentation: 'limited', // terminators and a list of abbreviations; an unlisted abbreviation can split a sentence
  lemmatization: 'seed-only', // a machine-drafted word list; any other word gets a guess by its ending (unconfirmed) or nothing
  morphology: 'limited', // every reading of a listed word's forms; the sentence narrows some; not measured on running prose by a reviewer
  phraseDetection: 'limited',
  productionChecks: 'limited',
  limitations: [
    `Lemmatization is seed-only: the word list is a machine-drafted seed of about ${LEMMAS.toLocaleString('en')} words (nouns, names, verbs, adjectives, adverbs) plus the closed classes, which no native speaker has checked; a word outside it gets a reading the rules only infer from its ending (marked unconfirmed, no gloss) or none.`,
    'Every generated reading was compared with other sources (the UniParser Albanian analyzer, Wiktionary\'s Albanian tables, two small treebanks). Where they do not agree, or where no other source knows the reading, it is kept at low confidence and shown as uncertain; the differences are listed in data/review/sq/source-agreement.json for a reviewer. Agreement between sources is not a native speaker\'s review.',
    'There is no parser. The sentence layer reads the neighbouring words (the linking article and its adjective, a short pronoun before a verb, the particle të, the case a preposition governs, kam / jam before a participle); what they do not decide stays a union (Case "Nom,Acc") or a list of competing readings, never a guess.',
    'The very ambiguous little words e, i, të, së, u, më, do, po, pa keep every reading; none is presented as certain unless the sentence decides it.',
    'Fused short pronouns (ma, ta, ia, t\'i, m\'u …) are taken apart only into pairs the lists state; a cluster outside the lists has no reading.',
    'A Gheg or pre-standard form is related to its Standard equivalent without changing the text, and only when the Standard form is a word the list knows. Gheg is not analysed as a variety of its own.',
    'Production checks are rules for the commonest learner errors; each fires only on its own unambiguous shape and says nothing when a fact is missing. There are no idiomaticity checks: they need native data that does not exist yet.',
  ],
};

/** The lemmas the word list knows for a written form as it stands (no respelling, no guess). */
function lemmasOf(form: string): Set<string> {
  const out = new Set<string>();
  for (const r of analyzeSqForm(sqNormalize(form))) if (r.lemmaKnown && !r.relation) out.add(`${r.lemma}|${r.pos === 'AUX' ? 'VERB' : r.pos}`);
  return out;
}

const LETTER_HINT = new Map(SQ_LETTERS.map((l) => [l.letter, l]));
/** Letters an English reader does not sound as written. */
const TAUGHT = ['ë', 'ç', 'c', 'dh', 'gj', 'j', 'll', 'nj', 'q', 'rr', 'sh', 'th', 'x', 'xh', 'y', 'zh'];

const ARTICLE_LEMMA = /^(?:i|e|të|së) (.+)$/u;

export const sqAdapter: LanguageAdapter = {
  lang: LANG,
  name: 'Albanian',
  script: 'Latn',
  version: VERSION,
  support: SUPPORT,
  sources: SOURCES,
  varieties: SQ_VARIETIES,

  segmentSentences: segmentSqSentences,
  tokenize: makeWordTokenizer({ locale: 'sq', normalize: sqNormalize }),
  normalize: sqNormalize,
  /** Forgiving search: people type without ë / ç. */
  searchNormalize: sqSearchNormalize,

  analyze: (tokens: RawToken[]): AnalyzedToken[] => sqAnalyze(tokens),

  /**
   * The same ordering as `analyze`, after the importer put a dictionary's readings on some tokens. A token of this
   * adapter starts again from its context-free readings; any other token brings its readings as they are, and its
   * neighbours read them like ours. A token whose analyzer is not in `analyzers`, and a token named in `given`, is
   * returned exactly as it came.
   */
  refine: (tokens, analyzed, analyzers, given): AnalyzedToken[] => {
    const own = (i: number): boolean => analyzed[i].analyzer === ANALYZER && analyzers.has(ANALYZER) && !given?.has(i);
    const base = tokens.map((t, i) => (!t.isWord ? [] : own(i) ? sqCandidates(t.normalized) : analyzed[i].candidates));
    const ordered = orderSqSentence(tokens, base);
    return tokens.map((t, i) => {
      if (!t.isWord || given?.has(i) || !analyzers.has(analyzed[i].analyzer)) return analyzed[i];
      return { ...analyzed[i], candidates: ordered[i] };
    });
  },

  detectPhrases: (tokens, analyses) => matchPhraseRules(tokens, analyses, SQ_PHRASE_RULES, sqNormalize),

  detectPatterns: (tokens, analyses) => detectSqConstructions(tokens, analyses),

  /** One line for each letter of the word that is not sounded as an English reader expects; a digraph is one letter. */
  pronunciation(token): PronunciationSupport {
    const letters = new Set(sqLetters(token.normalized));
    const notes: string[] = [];
    for (const l of TAUGHT) {
      const info = LETTER_HINT.get(l);
      if (letters.has(l) && info) notes.push(`${l}: ${info.hint}.`);
    }
    return { notes };
  },

  speechNormalize: (text) =>
    speechNormalizeGeneric(text, {
      tool: `speech-${LANG}@1`,
      numberToWords: sqNumberToWords,
      percentWord: 'përqind',
      abbreviations: [
        { pattern: /\bp\.\s?sh\./gu, replacement: 'për shembull', label: 'p.sh.' },
        { pattern: /\betj\./gu, replacement: 'e të tjera', label: 'etj.' },
        { pattern: /\bDr\./gu, replacement: 'doktor', label: 'Dr.' },
      ],
    }),

  display: { wordSeparator: ' ', showBoundariesOnHighlight: false, fontFamily: 'Georgia, "Times New Roman", serif', lineHeight: 1.7 },

  checkProduction: (tokens, analyses, sentence) => checkSqProduction(tokens, analyses, sentence),

  /** 'same' | 'inflection' (the word list knows both forms under one lemma, as they are written) | 'none'. */
  relate(a, b) {
    if (sqNormalize(a) === sqNormalize(b)) return 'same';
    const lb = lemmasOf(b);
    for (const l of lemmasOf(a)) if (lb.has(l)) return 'inflection';
    return 'none';
  },

  /**
   * Other headwords a dictionary may file this lemma under: an adjective cited here with its linking article ("i mirë")
   * is "mirë" there. Asked for only when the lemma has no entry of its own; the reading keeps its lemma.
   */
  lemmaVariants: (lemma): string[] => {
    const m = ARTICLE_LEMMA.exec(lemma);
    return m ? [m[1]] : [];
  },

  morphFromTags: sqMorphFromTags,
  varietiesFromTags: sqVarietiesFromTags,
  describeMorph: (morph, pos) => describeSqMorph(morph, pos),
};

// ── numbers 0–999 999 ──
const U = ['zero', 'një', 'dy', 'tre', 'katër', 'pesë', 'gjashtë', 'shtatë', 'tetë', 'nëntë', 'dhjetë', 'njëmbëdhjetë', 'dymbëdhjetë', 'trembëdhjetë', 'katërmbëdhjetë', 'pesëmbëdhjetë', 'gjashtëmbëdhjetë', 'shtatëmbëdhjetë', 'tetëmbëdhjetë', 'nëntëmbëdhjetë'];
const T: Record<number, string> = { 2: 'njëzet', 3: 'tridhjetë', 4: 'dyzet', 5: 'pesëdhjetë', 6: 'gjashtëdhjetë', 7: 'shtatëdhjetë', 8: 'tetëdhjetë', 9: 'nëntëdhjetë' };

function below100(n: number): string {
  if (n < 20) return U[n];
  const u = n % 10;
  return u ? `${T[Math.floor(n / 10)]} e ${U[u]}` : T[Math.floor(n / 10)];
}
function below1000(n: number): string {
  if (n < 100) return below100(n);
  const h = Math.floor(n / 100);
  const r = n % 100;
  return `${h === 1 ? 'njëqind' : `${U[h]}qind`}${r ? ` e ${below100(r)}` : ''}`;
}
export function sqNumberToWords(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 999999) return null;
  if (n < 1000) return below1000(n);
  const th = Math.floor(n / 1000);
  const r = n % 1000;
  const head = th === 1 ? 'një mijë' : `${below1000(th)} mijë`;
  return r ? `${head} e ${below1000(r)}` : head;
}
