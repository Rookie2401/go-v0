/**
 * Greek adapter, `el`: ONE language whose periods are varieties (greek/varieties.ts): Homeric (el-hom) and Attic (el-att) from the
 * Wiktionary Ancient Greek tables (whose headers name the dialect), Koine (el-koi) from MorphGNT over the SBL Greek New Testament,
 * Medieval (recognised from labels only) and Modern (el-mod) from the Wiktionary Modern Greek tables. The default target of the
 * course is Modern Greek; a learner may target Koine, Attic or Homeric instead, and the sentence itself decides the period it is
 * read in (greek/analyze.ts `sentencePeriod`): polytonic marks make it ancient, the words' readings say which stage, and the
 * preference only breaks ties.
 *
 * Confident: a form MorphGNT reads in the New Testament (the source's reading of that very word), a form a table lists. Uncertain,
 * and said so: a form matched without its diacritics, a form with several readings the sentence does not decide. Absent: a word no
 * index knows gets no reading; there is no parser; nothing has been reviewed by a classicist or a native speaker. The compiled core
 * holds the closed classes and the commonest New Testament lemmas only; the full indexes are assets a host installs.
 */
import type { AdapterSupport, AnalysisSourceInfo, LanguageAdapter, PronunciationSupport, VariantSet } from '../core';
import { speechNormalizeGeneric } from './shared';
import { EL_ANALYZER, EL_SOURCE_IDS, EL_VERSION, elAnalyze, elCandidates, orderElSentence } from './greek/analyze';
import { describeElMorph } from './greek/describe';
import { KOINE_CORE } from './greek/generated/koine-core';
import { installGreekIndex, installedGreekIndexes, lookupGreekForm } from './greek/index-store';
import { elNumberToWords } from './greek/numbers';
import { elParadigm, elVariants } from './greek/paradigm';
import { greekPronunciation } from './greek/pronunciation';
import { checkElProduction } from './greek/production';
import { elFeaturesFromTableTags, elMorphFromTags } from './greek/tags';
import { elNormalize, elSearchNormalize, elSegmentSentences, elTokenize } from './greek/text';
import { EL_VARIETIES, elVarietiesFromTags } from './greek/varieties';

installGreekIndex(KOINE_CORE);

export { EL_ANALYZER, EL_SOURCE_IDS, EL_VERSION };

const SOURCES: Record<string, AnalysisSourceInfo> = {
  [EL_SOURCE_IDS.morphgnt]: { id: EL_SOURCE_IDS.morphgnt, label: 'MorphGNT over the SBL Greek New Testament', origin: 'dictionary', reviewStatus: 'external', licence: 'CC BY-SA 3.0 (morphology); text CC BY 4.0; glosses Dodson / Abbott-Smith / Strong’s (public domain)', version: KOINE_CORE.built },
  [EL_SOURCE_IDS.kaikkiGrc]: { id: EL_SOURCE_IDS.kaikkiGrc, label: 'Wiktionary Ancient Greek tables and dialectal forms, via kaikki.org', origin: 'dictionary', reviewStatus: 'external', licence: 'CC BY-SA 4.0' },
  [EL_SOURCE_IDS.kaikkiEl]: { id: EL_SOURCE_IDS.kaikkiEl, label: 'Wiktionary Modern Greek tables, via kaikki.org', origin: 'dictionary', reviewStatus: 'external', licence: 'CC BY-SA 4.0' },
  [EL_SOURCE_IDS.rules]: { id: EL_SOURCE_IDS.rules, label: 'Greek spelling and period rules', origin: 'rule', reviewStatus: 'machine-drafted', version: EL_VERSION },
};

const SUPPORT: AdapterSupport = {
  tokenization: 'dependable',
  sentenceSegmentation: 'limited',
  lemmatization: 'seed-only', // the compiled analyser holds a SEED: the closed classes and the commonest New Testament words; the full indexes are installed assets
  morphology: 'limited',
  phraseDetection: 'none',
  productionChecks: 'seed-only',
  limitations: [
    'Four periods are analysed from external sources, none made here: Koine from MorphGNT’s reading of every word of the SBL Greek New Testament; Homeric and Attic from the Wiktionary Ancient Greek inflection tables (Attic unless the table header says Epic, Ionic, Doric, Koine or Byzantine) and dialectal alternative forms; Modern Greek from the Wiktionary Modern Greek tables. Medieval (Byzantine) Greek is recognised from labels only. Nothing has been reviewed by a classicist or a native speaker.',
    `Lemmatization is seed-only in the compiled analyser: it carries a compact core of the New Testament index (${KOINE_CORE.stats?.lemmas ?? 0} lemmas: the closed classes and the commonest words, ${Math.round(((KOINE_CORE.stats?.tokenCoverage as number) ?? 0) * 100)} % of the New Testament’s words). The full Koine, Ancient and Modern indexes are assets the reader installs when Greek is loaded; until then a word outside the core has no reading.`,
    'A form is matched with its diacritics first; a monotonic or unaccented spelling reaches the polytonic forms with the same letters (and the other way round) at lower confidence, and the reading says its accents were inferred. A form no table or text holds has no reading; nothing is guessed from the letters.',
    'There is no parser. The sentence decides only the PERIOD it is read in (polytonic marks → ancient; the words’ readings say which stage; a tie → the declared or targeted variety, else Koine for a text of New Testament words, else Attic; monotonic → Modern). A form with several readings in one period keeps them all; none is presented as certain.',
    'Pronunciation is written in three stated conventions (Modern; a reconstructed Koine after Buth and Horrocks; the Erasmian classroom convention), none claimed as how anyone spoke. There is no voice for ancient Greek: a Modern Greek voice, labelled as such, is the only playback.',
    'Production checks are four rules (final sigma, polytonic spelling in a Modern draft, Modern spelling in an ancient draft, a form of another period); they say nothing about anything else.',
    'The Perseus Ancient Greek Dependency Treebank is downloaded as the agreement source for the Attic and Homeric readings but not yet consulted (docs/PLAN14.md P2).',
  ],
};

function lemmaKeys(form: string): Set<string> {
  const out = new Set<string>();
  for (const h of lookupGreekForm(elNormalize(form))) out.add(`${h.row[0]}|${h.index.id.replace(/-core$/, '')}`);
  return out;
}

export const elAdapter: LanguageAdapter = {
  lang: 'el',
  name: 'Greek',
  script: 'Grek',
  version: EL_VERSION,
  support: SUPPORT,
  sources: SOURCES,
  varieties: EL_VARIETIES,

  segmentSentences: elSegmentSentences,
  tokenize: elTokenize,
  normalize: elNormalize,
  searchNormalize: elSearchNormalize,

  analyze: (tokens, opts) => elAnalyze(tokens, opts),
  refine: (tokens, analyzed, analyzers, given) => {
    const own = (i: number): boolean => analyzed[i].analyzer === EL_ANALYZER && analyzers.has(EL_ANALYZER) && !given?.has(i);
    const base = tokens.map((t, i) => (!t.isWord ? [] : own(i) ? elCandidates(t) : analyzed[i].candidates));
    const ordered = orderElSentence(tokens, base);
    return tokens.map((t, i) => (!t.isWord || given?.has(i) || !analyzers.has(analyzed[i].analyzer) ? analyzed[i] : { ...analyzed[i], candidates: ordered[i] }));
  },

  detectPhrases: () => [],
  detectPatterns: () => [],

  pronunciation(token, analysis): PronunciationSupport {
    const period = typeof analysis?.candidates[0]?.notes?.period === 'string' ? analysis.candidates[0].notes.period : undefined;
    const p = greekPronunciation(token.surface, period);
    return { transliteration: p.transliteration, notes: p.notes };
  },

  speechNormalize: (text, opts) => speechNormalizeGeneric(text, { tool: 'speech-el@1', numberToWords: elNumberToWords, percentWord: 'τοις εκατό', abbreviations: [], ...(opts ?? {}) }),

  display: { wordSeparator: ' ', showBoundariesOnHighlight: false, fontFamily: '"Gentium Plus", "Galatia SIL", "Noto Serif", Georgia, serif', lineHeight: 1.8 },

  checkProduction: (tokens, analyses, sentence, opts) => checkElProduction(tokens, analyses, sentence, opts),

  relate(a, b) {
    if (elNormalize(a) === elNormalize(b)) return 'same';
    const lb = lemmaKeys(b);
    for (const k of lemmaKeys(a)) if (lb.has(k)) return 'inflection';
    return 'none';
  },

  morphFromTags: elMorphFromTags,
  varietiesFromTags: elVarietiesFromTags,
  featuresFromTableTags: (tags, pos) => elFeaturesFromTableTags(tags, pos),
  describeMorph: (morph, pos) => describeElMorph(morph, pos),
  paradigm: (lemma, pos) => elParadigm(lemma, pos),
  variants: (lemma, pos, surface): VariantSet | undefined => elVariants(lemma, pos, surface),
};

export const elInstalledIndexes = (): string[] => installedGreekIndexes().map((i) => i.id);
