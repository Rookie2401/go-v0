/**
 * Korean adapter, `ko` (Modern Standard Korean, the Seoul standard). Design, identities and sources: docs/korean/PLAN.md.
 *
 * Layers, in the order a token meets them:
 *   the text (korean/hangul.ts, korean/text.ts): one token per piece of an 어절 (Hangul and Hanja; digits and Latin letters apart), offsets
 *   into the page's own text, a key in NFC that never replaces the text;
 *   → the stem lexicon (korean/index-store.ts): the Wiktionary Korean headwords via kaikki.org (CC BY-SA 4.0), a compiled CORE of the closed
 *     classes and the commonest words installed here, the rest SHARDS a host loads for the words it is about to read (korean/shards.ts);
 *   → the token analysis (korean/analyze.ts): candidate stems, the stem's junction forms by its own conjugation class, the particle or ending
 *     chain from closed hand tables, the copula, light verbs, fused pronouns; homonyms kept apart (눈¹, 눈²) and an undecided one named;
 *   → the sentence (korean/sentence.ts): auxiliaries after a connective form, homonyms by a cue word, counters after numbers, 안 / 한 / 저 and
 *     the other bare look-alikes, the complement particle, the sentence type from a question mark; it only REORDERS, lowers and marks;
 *   → grammar constructions, fixed phrases and shallow syntax (korean/constructions.ts, phrases.ts, syntax.ts);
 *   → pronunciation (korean/pronunciation.ts) with what only the analysis knows (the stem, the prospective ending, a noun or a predicate).
 * What is confident: a stem the lexicon holds with every step of its chain licensed. What is uncertain, and said so: several readings
 * (all are kept), a homonym the sentence does not decide (the undecided reading), a stem with no conjugation table, a non-standard form.
 * What is absent: a parser and a statistical model; a stem the lexicon does not hold is unconfirmed and explains its endings only.
 * Nothing has been reviewed by a native speaker.
 */
import type { AdapterSupport, AnalysisCandidate, AnalysisSourceInfo, AnalyzedToken, LanguageAdapter, PronunciationSupport, RawToken } from '../core';
import { KO_ANALYZER, KO_ANALYZER_VERSION, KO_SOURCE_IDS } from './korean/version';
import { koKey, syllablesOf, decompose, isHangulSyllable, FINALS } from './korean/hangul';
import { koSearchNormalize, koSegmentSentences, koTokenize } from './korean/text';
import { installKoreanLexicon, koBareLemma, koStemKey, lookupKoreanStem } from './korean/index-store';
import { KO_CORE } from './korean/generated/core';
import { koAnalyzeToken } from './korean/analyze';
import { describeKoMorph } from './korean/describe';
import { koAnalyze, koRefine } from './korean/sentence';
import { detectKoPatterns } from './korean/constructions';
import { detectKoPhrases } from './korean/phrases';
import { koSyntax } from './korean/syntax';
import { checkKoProduction } from './korean/production';
import { koSpeechNormalize } from './korean/speech';
import { koPronunciation, koStandardPronunciation, KO_ROMANIZATION_SCHEME } from './korean/pronunciation';
import { koFeaturesFromTableTags, koParadigm } from './korean/paradigm';
import { koCellsFor, koMorphFromTags } from './korean/tags';

installKoreanLexicon(KO_CORE);

export { KO_ANALYZER, KO_ANALYZER_VERSION, KO_SOURCE_IDS };

const SOURCES: Record<string, AnalysisSourceInfo> = {
  [KO_SOURCE_IDS.lexicon]: { id: KO_SOURCE_IDS.lexicon, label: 'Wiktionary Korean entries, via kaikki.org (stem lexicon: class, conjugation class, first gloss, Hanja)', origin: 'dictionary', reviewStatus: 'external', licence: 'CC BY-SA 4.0', version: KO_CORE.built },
  [KO_SOURCE_IDS.closed]: { id: KO_SOURCE_IDS.closed, label: 'Korean particles, endings, copulas and auxiliaries (closed tables written for this product)', origin: 'hand', reviewStatus: 'machine-drafted', version: KO_ANALYZER_VERSION },
  [KO_SOURCE_IDS.rules]: { id: KO_SOURCE_IDS.rules, label: 'Korean word-form and sentence rules (Hangul arithmetic, stem alternations, chains, context ordering)', origin: 'rule', reviewStatus: 'machine-drafted', version: KO_ANALYZER_VERSION },
  [KO_SOURCE_IDS.constructions]: { id: KO_SOURCE_IDS.constructions, label: 'Korean grammar constructions (-고 있다, -(으)ㄹ 수 있다 …)', origin: 'hand', reviewStatus: 'machine-drafted', version: KO_ANALYZER_VERSION },
  [KO_SOURCE_IDS.phrases]: { id: KO_SOURCE_IDS.phrases, label: 'Korean fixed expressions (a dictionary headword, or a particle + verb form used as a postposition)', origin: 'hand', reviewStatus: 'machine-drafted', version: KO_ANALYZER_VERSION },
  [KO_SOURCE_IDS.priors]: { id: KO_SOURCE_IDS.priors, label: 'Spelling counts from the UD Korean-Kaist treebank (train split), for the order of readings only', origin: 'dictionary', reviewStatus: 'external', licence: 'CC BY-SA 4.0' },
};

const SUPPORT: AdapterSupport = {
  tokenization: 'dependable',
  sentenceSegmentation: 'limited',
  lemmatization: 'seed-only',
  morphology: 'limited',
  phraseDetection: 'seed-only',
  productionChecks: 'seed-only',
  limitations: [
    // figures: docs/korean/INDEX.md as built on 2026-11-25 ("Shards and core"); the core's own counts are read from the compiled core
    `Lemmatization is seed-only in the compiled analyser: it carries a compact CORE of the Wiktionary stem lexicon (${(KO_CORE.stats?.entries ?? 0).toLocaleString('en')} entries in ${(KO_CORE.stats?.sets ?? 0).toLocaleString('en')} spellings: every closed-class word, a reviewed list of everyday spellings, then the commonest open-class headwords; its headwords cover 73.8 % of the running words of the priors treebank, 94.6 % of those the full lexicon covers). The SHARDS add the rest of the lexicon (37,007 rows in all: rarer words, most names, Sino-Korean compounds), an asset a host loads for the words about to be read; until a word's shard has loaded, a word outside the core is unconfirmed: its particles and endings are explained and the stem is offered as written, with no meaning.`,
    'Korean is read by rules written for this product over that lexicon, not by a statistical analyser: candidate stems, the stem’s conjugation class from the source’s own table, and closed tables of particles and endings read as a chain. A stem with no conjugation table is read in every class its shape allows and none is presented as certain. Nothing has been reviewed by a native speaker or a Korean linguist.',
    'Homonyms are separate words numbered as the dictionary numbers them (눈¹ eye, 눈² snow). Of the 2,496 spellings with two or more entries, 466 have a main entry (405 reviewed by line, 61 automatic) and 2,030 are balanced (362 by a reviewed line, 1,668 by default, unreviewed): a balanced word the sentence does not decide is shown as UNDECIDED with every candidate named, and a few sure cue words decide (눈이 와요: snow).',
    'The sentence layer is local rules, not a parser: auxiliaries after a connective form, counters after numbers, homonyms by a cue word, the complement particle before 되다 / 아니다, a question mark. A form whose ending leaves the sentence type open (해요체 -아/어요) is a question only before a question mark; otherwise no sentence type is asserted.',
    'Spellings are counted from one treebank of 1990s expository prose (UD Korean-Kaist, train): the counts order readings and never decide between homonyms; they are not a frequency list of the language.',
    'Proper names are the weakest part (about 44 % covered); numerals written in digits are read as digits (whether a number is said with native or Sino-Korean numerals is noted for the commonest counters only).',
    'Pronunciation: the standard pronunciation as a Hangul respelling by rule (the dictionary’s own respelling where it has one) and Revised Romanization (2000) of it, a supplementary aid and never an identity. No audio of its own.',
    'Fixed expressions are a handful: one dictionary headword (그럼에도 불구하고) and six particle + verb frames used as postpositions (-에 대해, -에 관해, -(으)로 인해, -에 의해, -에도 불구하고, -에 따라). Production checks are one rule (the particle form after a consonant or a vowel); an empty result means nothing was found, never that the Korean is right.',
  ],
};

// ───────────────────────────── neighbours for pronunciation ─────────────────────────────

/** The neighbours of a token, recorded by `analyze` (the contract gives `pronunciation` the token alone); a token from elsewhere has none. */
const NEIGHBOURS = new WeakMap<RawToken, { next?: string; prev?: string; prevProspective?: boolean }>();

function recordNeighbours(tokens: RawToken[], analyzed: AnalyzedToken[]): void {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t.isWord) continue;
    const n = tokens[i + 1];
    const p = tokens[i - 1];
    const spaced = (a: RawToken, b: RawToken) => a.end < b.start; // a space (the tokens hold no whitespace)
    const info: { next?: string; prev?: string; prevProspective?: boolean } = {};
    if (n?.isWord && spaced(t, n)) info.next = n.surface;
    if (p?.isWord && spaced(p, t)) {
      info.prev = p.surface;
      const pc = analyzed[i - 1]?.candidates[0];
      info.prevProspective = !!pc && pc.morph.VerbForm === 'Adn' && pc.morph.Aspect === 'Prosp';
    }
    NEIGHBOURS.set(t, info);
  }
}

const NOMINAL = new Set(['NOUN', 'PROPN', 'PRON', 'NUM']);
const PREDICATE = new Set(['VERB', 'ADJ', 'AUX']);
const keyLen = (s: string): number => [...koKey(s)].length;

/** What only the analysis knows, for the pronunciation rules (PLAN "Pronunciation"). */
export function koPronunciationOptions(token: RawToken, c: AnalysisCandidate | undefined): { verbStem?: number; tenseAfter?: number[]; nominal?: boolean; boundaries?: number[]; dictionary?: string } {
  if (!c || c.unconfirmed) return {};
  const surface = token.surface;
  const parts = c.parts ?? [];
  const key = [...koKey(surface)];
  const out: { verbStem?: number; tenseAfter?: number[]; nominal?: boolean; boundaries?: number[]; dictionary?: string } = {};
  if (c.pos && NOMINAL.has(c.pos)) out.nominal = true;
  if (c.pos && PREDICATE.has(c.pos)) {
    // the last syllable of the stem: the last part that is a predicate (a stem, or the 하 of a 하다 headword read as noun + 하)
    const stem = [...parts].reverse().find((p) => p.pos && PREDICATE.has(p.pos) && (p.kind === 'stem' || p.kind === 'suffix' || p.kind === 'component'));
    if (stem && stem.end > 0) out.verbStem = keyLen(surface.slice(0, stem.end)) - 1;
  }
  // the prospective -(으)ㄹ inside the word, when more follows it: the next plain lead is tensed (갈게 [갈께])
  const tense: number[] = [];
  for (const p of parts) {
    if (!p.lemma || !/^-(\(으\))?ㄹ/u.test(p.lemma)) continue;
    const at = keyLen(surface.slice(0, p.start));
    const syl = key[at];
    const d = syl && isHangulSyllable(syl) ? decompose(syl) : undefined;
    if (d && FINALS[d.t] === 'ㄹ' && at + 1 < key.length) tense.push(at);
  }
  if (parts.length) out.tenseAfter = tense;
  // a full morpheme starting inside the word: the second noun of a compound read through its parts, what follows a prefix
  const bounds: number[] = [];
  parts.forEach((p, k) => {
    if (k === 0) return;
    const prev = parts[k - 1];
    if (p.kind === 'component' || p.kind === 'head' || prev.kind === 'prefix') { const at = keyLen(surface.slice(0, p.start)); if (at > 0 && !bounds.includes(at)) bounds.push(at); }
  });
  if (bounds.length) out.boundaries = bounds;
  // the dictionary's own respelling, for a headword written as it is (학교, 읽다)
  const bareLemma = c.lemma ? koBareLemma(c.lemma) : '';
  if (bareLemma && koKey(surface) === bareLemma) {
    const tag = String(c.notes?.koPos ?? '').split('+')[0];
    const row = lookupKoreanStem(koStemKey(bareLemma, tag)).map((h) => h.entry).find((e) => e.lemma === bareLemma && e.tag === tag && e.pron);
    if (row?.pron) out.dictionary = row.pron;
  }
  return out;
}

function koPronunciationOf(token: RawToken, analysis: AnalyzedToken | undefined): PronunciationSupport {
  const c = analysis?.candidates[0];
  const nb = NEIGHBOURS.get(token) ?? (analysis ? NEIGHBOURS.get(analysis.token) : undefined) ?? {};
  const o = koPronunciationOptions(token, c);
  // after the prospective -(으)ㄹ of the word before, the plain first consonant is tensed across the space (할 수 [할 쑤], 갈 것 [갈 껃])
  const prevProspective = !!(nb.prev && nb.prevProspective);
  const opts = { ...o, ...(nb.next ? { nextWord: nb.next } : {}), ...(prevProspective ? { prevProspective: true } : {}) };
  const out = koPronunciation(token.surface, opts);
  if (!out.transliteration) return out;
  const notes = [...(out.notes ?? [])];
  const said = o.dictionary ? koKey(o.dictionary).replace(/[[\]\s]/gu, '') : koStandardPronunciation(token.surface, opts);
  notes.unshift(`Pronounced [${said}] (the standard pronunciation${o.dictionary ? ', as the dictionary gives it' : ', by rule'}); spelling, pronunciation and romanization are three different things.`);
  if (prevProspective) {
    const { dictionary: _d, ...ruleOpts } = opts;
    const here = koStandardPronunciation(token.surface, ruleOpts);
    const alone = koStandardPronunciation(token.surface, { ...ruleOpts, prevProspective: false });
    if (here !== alone) notes.splice(1, 0, `After ${nb.prev} (the prospective -(으)ㄹ) it is said [${here}]: the first consonant is tensed across the space.`);
  }
  if (!notes.some((n) => n.includes(KO_ROMANIZATION_SCHEME))) notes.push(`Romanization: ${KO_ROMANIZATION_SCHEME}.`);
  return { ...out, notes };
}

// ───────────────────────────── the adapter ─────────────────────────────

/** The confirmed lemmas a written form is read with (any reading the lexicon vouches for). */
function lemmasOf(form: string): Set<string> {
  return new Set(koAnalyzeToken(form).filter((c) => c.lemma && !c.unconfirmed && c.confidence >= 0.5).map((c) => `${c.lemma}|${c.pos ?? ''}`));
}

export const koAdapter: LanguageAdapter = {
  lang: 'ko',
  name: 'Korean',
  script: 'Hang',
  version: KO_ANALYZER_VERSION,
  support: SUPPORT,
  sources: SOURCES,

  segmentSentences: koSegmentSentences,
  tokenize: koTokenize,
  normalize: koKey,
  searchNormalize: koSearchNormalize,
  /** A numbered homonym (눈²) is filed by the dictionary under its bare headword too (src/dict/korean.ts). */
  lemmaVariants: (lemma) => { const b = koBareLemma(lemma); return b !== lemma ? [b] : []; },

  analyze: (tokens) => {
    const out = koAnalyze(tokens);
    recordNeighbours(tokens, out);
    return out;
  },
  /** The same ordering as `analyze` after the importer put a dictionary's readings on some tokens (contract: core/adapters.ts). */
  refine: (tokens, analyzed, analyzers, given) => {
    const out = koRefine(tokens, analyzed, analyzers, given);
    recordNeighbours(tokens, out);
    return out;
  },

  detectPhrases: (tokens, analyses) => detectKoPhrases(tokens, analyses),
  detectPatterns: (tokens, analyses) => detectKoPatterns(tokens, analyses),
  /** Shallow dependency relations from the particles and endings (korean/syntax.ts); not a parser. */
  syntax: (tokens, analyses) => koSyntax(tokens, analyses),

  pronunciation: (token, analysis) => koPronunciationOf(token, analysis),
  speechNormalize: (text, opts) => koSpeechNormalize(text, opts),

  display: { wordSeparator: ' ', showBoundariesOnHighlight: false, fontFamily: '"Noto Sans KR", "Noto Serif KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif', lineHeight: 1.7 },

  checkProduction: (tokens, analyses, sentence) => checkKoProduction(tokens, analyses, sentence),

  relate(a, b) {
    if (koKey(a) === koKey(b)) return 'same';
    const lb = lemmasOf(b);
    for (const id of lemmasOf(a)) if (lb.has(id)) return 'inflection';
    return 'none';
  },

  /** The jamo of each syllable (Hangul arithmetic; no dictionary needed). */
  decode: (surface) => syllablesOf(surface),
  describeMorph: (morph, pos) => describeKoMorph(morph, pos) ?? '',

  /** "All forms": generated by rule from the lexicon row, aligned with the dictionary's own table (korean/paradigm.ts, korean/tags.ts). */
  paradigm: (lemma, pos, hint) => koParadigm(lemma, pos, hint),
  featuresFromTableTags: (tags, pos, form) => koFeaturesFromTableTags(tags, pos, form),
  morphFromTags: koMorphFromTags,
  cellsFor: (paradigm, features, surface) => koCellsFor(paradigm, features, surface),
};
