/**
 * Hebrew adapter, `he`: ONE language whose periods are varieties (hebrew/varieties.ts): Biblical Hebrew (he-bib, analysed from the
 * Open Scriptures Hebrew Bible morphology over the Tanakh), Modern Hebrew (he-mod, analysed from the Wiktionary tables via
 * kaikki.org), Mishnaic and Medieval Hebrew (recognised from labels only), and Biblical Aramaic beside them as a heritage
 * language. The default target of the course is Modern Hebrew; a learner may target Biblical Hebrew instead, and the sentence
 * itself decides which period it is read in (hebrew/analyze.ts `sentencePeriod`): the preference only breaks ties.
 *
 * What is confident: a form the Tanakh index holds as written (the source's own reading of that word of the Bible), a form a
 * Wiktionary table lists. What is uncertain, and said so: an unpointed form matched to pointed Biblical forms through its
 * consonants (the points are inferred), a prefix cut off by rule, a form with several readings the sentence does not decide.
 * What is absent: a word no index knows gets no reading at all; there is no parser; nothing has been reviewed by a Hebrew
 * scholar or a native speaker. The compiled core holds the closed classes and the commonest Biblical lemmas only; the full
 * indexes are assets a host installs (hebrew/index-store.ts).
 */
import type { AdapterSupport, AnalysisSourceInfo, LanguageAdapter, PronunciationSupport, VariantSet } from '../core';
import { speechNormalizeGeneric } from './shared';
import { HE_ANALYZER, HE_SOURCE_IDS, HE_VERSION, heAnalyze, heCandidates, orderHeSentence } from './hebrew/analyze';
import { describeHeMorph } from './hebrew/describe';
import { BIBLICAL_CORE } from './hebrew/generated/biblical-core';
import { installHebrewIndex, installedHebrewIndexes, lemmaStem, lookupHebrewForm } from './hebrew/index-store';
import { heNumberToWords } from './hebrew/numbers';
import { heParadigm, heVariants } from './hebrew/paradigm';
import { transliterateHebrew } from './hebrew/pronunciation';
import { checkHeProduction } from './hebrew/production';
import { heFeaturesFromTableTags, heMorphFromTags } from './hebrew/tags';
import { heNormalize, heSearchNormalize, heSegmentSentences, heTokenize, isPointed } from './hebrew/text';
import { HE_VARIETIES, heVarietiesFromTags } from './hebrew/varieties';

installHebrewIndex(BIBLICAL_CORE);

export { HE_ANALYZER, HE_SOURCE_IDS, HE_VERSION };

const SOURCES: Record<string, AnalysisSourceInfo> = {
  [HE_SOURCE_IDS.oshb]: {
    id: HE_SOURCE_IDS.oshb, label: 'Open Scriptures Hebrew Bible morphology (Tanakh, aligned to the Miqra according to the Masorah)', origin: 'dictionary',
    reviewStatus: 'external', licence: 'CC BY 4.0 (morphology); text CC BY-SA 4.0; glosses BDB / Strong’s (public domain)', version: BIBLICAL_CORE.built,
  },
  [HE_SOURCE_IDS.kaikki]: {
    id: HE_SOURCE_IDS.kaikki, label: 'Wiktionary Hebrew inflection tables, via kaikki.org', origin: 'dictionary', reviewStatus: 'external', licence: 'CC BY-SA 4.0',
  },
  [HE_SOURCE_IDS.rules]: { id: HE_SOURCE_IDS.rules, label: 'Hebrew prefix and spelling rules', origin: 'rule', reviewStatus: 'machine-drafted', version: HE_VERSION },
};

const SUPPORT: AdapterSupport = {
  tokenization: 'dependable', // Intl.Segmenter('he'): a pointed, accented word stays whole; the maqaf is its own token, as in the source alignment
  sentenceSegmentation: 'limited', // sof pasuq, . ! ? and line breaks; a Modern abbreviation with a full stop can split a sentence
  lemmatization: 'seed-only', // the compiled analyser holds a SEED: the closed classes and the commonest Biblical words; the full indexes are installed assets
  morphology: 'limited', // the sources' own readings; a form with several readings is narrowed only by the period of the sentence
  phraseDetection: 'none',
  productionChecks: 'seed-only',
  limitations: [
    'Two periods are analysed: Biblical Hebrew, from the Open Scriptures Hebrew Bible morphology of every word of the Tanakh (a scholarly reading of that very word, not an analysis made here), and Modern Hebrew, from the Wiktionary inflection tables via kaikki.org. Mishnaic and Medieval Hebrew are recognised from dictionary labels only. Nothing has been reviewed by a Hebrew scholar or a native speaker.',
    `Lemmatization is seed-only in the compiled analyser: it carries a compact core of the Tanakh index (${BIBLICAL_CORE.stats?.lemmas ?? 0} lemmas: the closed classes and the commonest words, ${Math.round(((BIBLICAL_CORE.stats?.tokenCoverage as number) ?? 0) * 100)} % of the Bible's words). The full Biblical and Modern indexes are assets the reader installs when Hebrew is loaded; until then a word outside the core has no reading.`,
    'An unpointed word is matched to the pointed Biblical forms that share its consonants: such a reading says that its points were inferred, and it is less confident. A Modern form the tables do not list (most ktiv male spellings of rarer words, slang, names) has no reading; nothing is guessed from the letters alone.',
    'A prefix (וְ בְּ לְ כְּ מִ הַ שֶׁ הֲ) is cut off by rule only when the rest is a form a source knows; the reading is then marked as made by rule at low confidence.',
    'There is no parser. The sentence decides only the PERIOD it is read in (cantillation → Biblical; else the period most readings belong to; a tie → the declared or targeted variety; else Modern). A form with several readings in one period keeps them all; none is presented as certain.',
    'The Aramaic chapters of Daniel and Ezra are read with their own Aramaic morphology and tagged as Biblical Aramaic, a heritage language: never credited to Hebrew.',
    'Pronunciation: a written transliteration of a pointed form in a general scheme with Modern Israeli letter values; an unpointed word gets none. There is no voice for Biblical Hebrew: a Modern Hebrew voice, labelled as such, is the only playback.',
    'Production checks are three rules (final letters at the end of a word, final letters inside a word, a narrative form of the other period as a register note); they say nothing about anything else.',
  ],
};

/** The lemma ids a form is read with across the installed indexes, as "<lemma id>|<source>" keys. */
function lemmaKeys(form: string): Set<string> {
  const out = new Set<string>();
  for (const h of lookupHebrewForm(heNormalize(form))) out.add(`${lemmaStem(h.row[0])}|${h.index.id}`);
  return out;
}

export const heAdapter: LanguageAdapter = {
  lang: 'he',
  name: 'Hebrew',
  script: 'Hebr',
  version: HE_VERSION,
  support: SUPPORT,
  sources: SOURCES,
  varieties: HE_VARIETIES,

  segmentSentences: heSegmentSentences,
  tokenize: heTokenize,
  normalize: heNormalize,
  searchNormalize: heSearchNormalize,

  analyze: (tokens, opts) => heAnalyze(tokens, opts),

  /** The same ordering as `analyze` after the importer put a dictionary's readings on some tokens (see sq.ts for the contract). */
  refine: (tokens, analyzed, analyzers, given) => {
    const own = (i: number): boolean => analyzed[i].analyzer === HE_ANALYZER && analyzers.has(HE_ANALYZER) && !given?.has(i);
    const base = tokens.map((t, i) => (!t.isWord ? [] : own(i) ? heCandidates(t) : analyzed[i].candidates));
    const ordered = orderHeSentence(tokens, base);
    return tokens.map((t, i) => (!t.isWord || given?.has(i) || !analyzers.has(analyzed[i].analyzer) ? analyzed[i] : { ...analyzed[i], candidates: ordered[i] }));
  },

  detectPhrases: () => [],
  detectPatterns: () => [],

  pronunciation(token): PronunciationSupport {
    const tr = transliterateHebrew(token.surface);
    if (!tr) {
      return isPointed(token.surface) ? { notes: [] } : { notes: ['Unpointed: the vowels are not written, so the spelling alone does not give the pronunciation. A dictionary pronunciation or the pointed form is needed.'] };
    }
    return { transliteration: tr.text, notes: tr.notes };
  },

  speechNormalize: (text, opts) => speechNormalizeGeneric(text, { tool: `speech-he@1`, numberToWords: heNumberToWords, percentWord: 'אחוז', abbreviations: [], ...(opts ?? {}) }),

  display: { wordSeparator: ' ', showBoundariesOnHighlight: false, fontFamily: '"SBL Hebrew", "Ezra SIL", "Taamey Frank CLM", "David Libre", "Noto Serif Hebrew", serif', lineHeight: 2.0 },

  checkProduction: (tokens, analyses, sentence, opts) => checkHeProduction(tokens, analyses, sentence, opts),

  relate(a, b) {
    if (heNormalize(a) === heNormalize(b)) return 'same';
    const lb = lemmaKeys(b);
    for (const k of lemmaKeys(a)) if (lb.has(k)) return 'inflection';
    return 'none';
  },

  morphFromTags: heMorphFromTags,
  varietiesFromTags: heVarietiesFromTags,
  featuresFromTableTags: (tags, pos) => heFeaturesFromTableTags(tags, pos),
  describeMorph: (morph, pos) => describeHeMorph(morph, pos),

  paradigm: (lemma, pos) => heParadigm(lemma, pos),
  variants: (lemma, pos, surface): VariantSet | undefined => heVariants(lemma, pos, surface),
};

/** For hosts and tests: which indexes are installed (the core always; the full assets when the host added them). */
export const heInstalledIndexes = (): string[] => installedHebrewIndexes().map((i) => i.id);
