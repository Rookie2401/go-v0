/**
 * What a pack REALLY supports, as one report per language: read from the pack's manifest, from the analyser's own
 * `support` statement and limitations, from GoListen's voice registry, and from a few live probes that are run every time
 * the report is built (so that a script-handling claim that stops being true is reported as `works: false`, never
 * silently kept). Nothing here is hand-asserted capability: a feature is `supported` only when the manifest declares it
 * AND the analyser the runtime bundles does not say 'none' for it.
 *
 * LEMMA QUALITY is derived, not copied (2026-11-13). An analyser states the level of its OWN word list ('seed-only' for every one of
 * them), which says nothing of the dictionary, the form indexes or the measurements that also stand behind a lemma. The report keeps
 * that statement as `lemma.analyserLevel` and derives `lemma.quality` from the evidence table (evidence.ts), by this rule and no other:
 *
 *   none         the pack does not declare lemmas, or no analyser is bundled, or the analyser says 'none'
 *   dependable   the analyser itself says so; or EVERY measurement against a human-annotated treebank on record is at least
 *                DEPENDABLE_ACCURACY % (strict, first reading), and one of them scored at least DEPENDABLE_MIN_ITEMS words
 *   limited      the analyser says so; or a lemma can come from a source beyond the hand word list: the form index of the pack's
 *                declared dictionary, an attested form index, the analyser's own large lexicon
 *   seed-only    none of the above: lemmas come from a small hand word list and the closed classes
 *
 * A figure measured against AI-written labels never raises the level (it is agreement with a machine, and the note says so); it is
 * reported beside it. Review is not evidence either: `reviewStatus` stays what the manifest says whatever the figures are.
 *
 *   packCapabilities('de')   the report; undefined for a language with no pack
 *   allPackCapabilities()    every pack, in registry order
 *
 * Audio is NOT read here: this package may not reach GoListen (test/audit/conformance.structure.test.ts keeps GoListen out of
 * every entry but the content script). The report takes an optional `audio` provider; the extension's capability view
 * (packages/golearn-extension/src/language/capabilities.ts) supplies one from GoListen's voice registry and its own
 * availability function. Without a provider `audio` is absent, never invented.
 *
 * The report is data: the setup page can show it, the reader can use it to decide what to offer, and the tests compare
 * it with the manifest and the adapter (test/language-packs/capabilities.test.ts).
 */
import type { LanguageAdapter, SupportLevel } from '../../../src/core';
import { evidenceFor, type LemmaMeasurement, type LemmaSource, type PackEvidence } from './evidence';
import { levelOf, type PackLevel, type PackManifest, type ReviewStatus } from './manifest';
import { PACKS } from './registry';
import { builtInAdapter } from './runtime';

export type Quality = 'dependable' | 'limited' | 'none';

export interface ScriptHandlingItem {
  /** Stable id of the claim ('digraphs-stay-whole', 'grapheme-clusters', 'word-segmentation' …). */
  id: string;
  /** What is claimed, in plain words. */
  claim: string;
  /** True when the live probe confirmed it just now. A claim that fails is reported, not dropped. */
  works: boolean;
  /** What the probe looked at. */
  evidence: string;
}

/** What GoListen holds for a language (filled by the extension's view; this package does not import GoListen). */
export interface AudioCapability {
  /** Recordings registered in GoListen for this language (a demonstration asset counts, and is named in `gaps`). */
  recordings: number;
  /** GoListen has a device-voice template for the language (a voice appears only if the device offers a strictly matching one). */
  deviceVoiceTemplate: boolean;
  /** Remote (Azure) voices registered; each plays only with the learner's consent and a key. */
  remoteVoices: string[];
  /** Per-letter pronunciation notes from GoListen (Albanian only today). */
  phoneticNotes: boolean;
  /** Synthetic or demonstration audio is never listening evidence. */
  listeningEvidence: false;
  /** What GoListen itself says is missing. */
  gaps: string[];
}

export interface PackCapabilities {
  languageId: string;
  packId: string;
  version: string;
  level: PackLevel;
  reviewStatus: ReviewStatus;
  /** 'adapter' when the runtime bundles a real analyser; 'none' when the pack falls back to the browser segmenter only. */
  analyzer: 'adapter' | 'none';
  analyzerId: string;
  tokenization: { quality: Quality; method: 'adapter' | 'intl'; note: string };
  sentenceSegmentation: { quality: Quality; note: string };
  lemma: {
    supported: boolean;
    /** Derived from the evidence (see the header); never lower than what the analyser states for its own word list. */
    quality: SupportLevel;
    /** What the analyser states for its own word list and rules. */
    analyserLevel: SupportLevel;
    /** What a lemma can come from beyond the hand word list (empty: the hand list and the closed classes only). */
    sources: LemmaSource[];
    /** Every measurement of first-reading lemma accuracy on record, with what it was scored against. */
    measured: LemmaMeasurement[];
    note: string;
  };
  /** The dictionary the pack declares (meanings; its form index is a lemma source when the evidence lists it). */
  dictionary: { declared: boolean; id?: string; entries?: number; licence?: string; attribution?: string; note: string };
  morphology: {
    supported: boolean;
    quality: SupportLevel;
    /** Features the pack's grammar tables explain to the learner (empty when no analyser is bundled: nothing is analysed to explain). */
    explained: string[];
    /** Features the analyser really wrote on the top readings of the pack's own validation sentences. */
    observed: string[];
    note: string;
  };
  phrases: { supported: boolean; quality: SupportLevel };
  constructions: { supported: boolean; explained: string[] };
  /** Dependency roles / syntactic functions: no analyser gives them. */
  syntaxRoles: { supported: false; note: string };
  /** Production checking (GoTell): offered only when the pack's manifest declares it. */
  checker: { offered: boolean; quality: SupportLevel; adapterLevel: SupportLevel; scope: string[]; note: string };
  scriptHandling: { script: string; items: ScriptHandlingItem[] };
  /** Present only when the caller supplied an audio provider (see the header). */
  audio?: AudioCapability;
  /** The analyser's own plain statements of what it does not do. */
  limitations: string[];
}

// ───────────────────────────── helpers ─────────────────────────────

const qualityOf = (l: SupportLevel | undefined): Quality => (l === 'dependable' ? 'dependable' : l === 'limited' ? 'limited' : 'none');

/** The bar for 'dependable' lemmas: every human-treebank measurement at least this accurate, one of them over at least this many words. */
export const DEPENDABLE_ACCURACY = 95;
export const DEPENDABLE_MIN_ITEMS = 10_000;

const LEVEL_RANK: Readonly<Record<SupportLevel, number>> = { none: 0, 'seed-only': 1, limited: 2, dependable: 3 };
const n = (x: number): string => x.toLocaleString('en');
const pct = (x: number): string => `${x.toFixed(1)}%`;
const andList = (xs: string[]): string => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The lemma level the evidence supports, given what the analyser states for its own word list (never lower than that). */
export function deriveLemmaQuality(stated: SupportLevel, evidence: PackEvidence): SupportLevel {
  if (stated === 'none') return 'none';
  const human = evidence.lemmaMeasurements.filter((m) => m.goldKind === 'human-treebank');
  const dependable = human.length > 0 && human.every((m) => m.lemmaAccuracy >= DEPENDABLE_ACCURACY) && human.some((m) => m.items >= DEPENDABLE_MIN_ITEMS);
  const derived: SupportLevel = dependable ? 'dependable' : evidence.lemmaSources.length > 0 ? 'limited' : 'seed-only';
  return LEVEL_RANK[derived] > LEVEL_RANK[stated] ? derived : stated;
}

/** "95.6% on the Latin New Testament (Clementine Vulgate) against the PROIEL treebank (104,345 words)". */
export const measurementPhrase = (m: LemmaMeasurement): string => `${pct(m.lemmaAccuracy)} on ${m.corpus} against ${m.gold} (${n(m.items)} words)`;

/** One sentence on what has been measured: human treebanks first, then AI-labelled sets, named for what they are; or that nothing has. */
export function measuredSentence(measured: readonly LemmaMeasurement[]): string {
  const human = measured.filter((m) => m.goldKind === 'human-treebank');
  const ai = measured.filter((m) => m.goldKind === 'ai-labelled');
  const parts: string[] = [];
  if (human.length) parts.push(`The first reading had the right lemma ${andList(human.map(measurementPhrase))}.`);
  if (ai.length) parts.push(`${human.length ? 'It also agreed' : 'Its first reading agreed'} with AI-written labels that nobody has checked on ${andList(ai.map((m) => `${pct(m.lemmaAccuracy)} of ${n(m.items)} words of ${m.corpus}`))}: agreement with a machine, not a measure of correctness.`);
  if (!parts.length) parts.push('Lemma accuracy has not been measured on running text.');
  return parts.join(' ');
}

const sourcePhrase = (s: LemmaSource): string => `${s.label}${s.size ? ` (${n(s.size.count)} ${s.size.unit})` : ''}`;

const SYNTAX_NOTE = 'No analyser gives dependency roles or syntactic functions (subject, object, modifier): a card says "role: not available from this analyser". A few function words carry a plain description of their own job (a linking article, a relative pronoun, a separable prefix, a first-person pronoun); that is a word description, not a parse. Phrase units and construction ids are listed patterns, not a parse.';

// ───────────────────────────── script-handling probes ─────────────────────────────

interface Probe { id: string; claim: string; evidence: string; run: (a: LanguageAdapter) => boolean }

const words = (a: LanguageAdapter, s: string) => a.tokenize(s).filter((t) => t.isWord).map((t) => t.surface);
const analyseWord = (a: LanguageAdapter, sentence: string, surface: string) => {
  const toks = a.tokenize(sentence);
  const an = a.analyze(toks);
  const i = toks.findIndex((t) => t.isWord && t.surface === surface);
  return { toks, an, i, top: i >= 0 ? an[i].candidates[0] : undefined };
};
const graphemeEdges = (s: string): Set<number> => {
  const seg = new Intl.Segmenter('und', { granularity: 'grapheme' });
  const edges = new Set<number>([s.length]);
  for (const g of seg.segment(s)) edges.add(g.index);
  return edges;
};

/** One probe list per language; each is a claim a person could verify by hand, run through the real analyser. */
const PROBES: Readonly<Record<string, Probe[]>> = {
  sq: [
    {
      id: 'digraphs-stay-whole',
      claim: 'The Albanian digraphs and ë / ç never split a word: dh, gj, ll, nj, rr, sh, th, xh, zh stay inside their tokens.',
      evidence: 'dhëmb gjuhë llambë njeri rrugë shkollë thotë xhaketë zhurmë tokenised into nine whole words',
      run: (a) => { const w = words(a, 'dhëmb gjuhë llambë njeri rrugë shkollë thotë xhaketë zhurmë'); return w.length === 9 && w[0] === 'dhëmb' && w[8] === 'zhurmë'; },
    },
    {
      id: 'clitic-clusters',
      claim: 'A fused clitic pair (ma, ia …) is read as one word and taken apart into its two pronouns.',
      evidence: 'ma in "Nëna ma dha librin." has a reading with two parts',
      run: (a) => (analyseWord(a, 'Nëna ma dha librin.', 'ma').top?.parts?.length ?? 0) === 2,
    },
  ],
  es: [
    {
      id: 'attached-clitics',
      claim: 'Pronouns attached to a verb (dámelo, dártelo) are read as the verb plus its pronouns.',
      evidence: 'dámelo has a reading with three parts (dá, me, lo)',
      run: (a) => (analyseWord(a, 'Dámelo, por favor.', 'Dámelo').top?.parts?.length ?? 0) >= 3,
    },
    {
      id: 'accents-and-inverted-marks',
      claim: 'Accented letters, ñ and the inverted marks ¿ ¡ stay inside the right tokens (está is not esta).',
      evidence: '¿Cómo está la niña? tokenises to Cómo, está, la, niña; esta and está get different readings',
      run: (a) => {
        const w = words(a, '¿Cómo está la niña?');
        const e = analyseWord(a, 'Esta mesa es grande.', 'Esta').top;
        const s = analyseWord(a, 'El libro está en la mesa.', 'está').top;
        return w.join(' ') === 'Cómo está la niña' && !!e && !!s && e.lemma !== s.lemma;
      },
    },
  ],
  de: [
    {
      id: 'compounds',
      claim: 'A compound is one token and its parts are reported beside it.',
      evidence: 'Wohnzimmer is one token with parts Wohn + zimmer',
      run: (a) => (analyseWord(a, 'Das Wohnzimmer ist groß.', 'Wohnzimmer').top?.parts?.length ?? 0) >= 2,
    },
    {
      id: 'separable-verbs',
      claim: 'A separable verb split across the clause (steht … auf) is put together as aufstehen.',
      evidence: 'the construction separable-prefix-verb covers steht and auf in "Er steht früh auf."',
      run: (a) => { const t = a.tokenize('Er steht früh auf.'); return a.detectPatterns(t, a.analyze(t)).some((p) => p.key === 'separable-prefix-verb'); },
    },
  ],
  hi: [
    {
      id: 'grapheme-clusters',
      claim: 'Matras, nukta, chandrabindu and virama stay inside their tokens: no token starts or ends inside a grapheme cluster.',
      evidence: 'पढ़ता विद्यार्थी हूँ मेज़ tokenised with every boundary on a grapheme boundary',
      run: (a) => {
        const text = 'पढ़ता विद्यार्थी हूँ मेज़ में';
        const edges = graphemeEdges(text);
        const toks = a.tokenize(text).filter((t) => t.isWord);
        return toks.length === 5 && toks.every((t) => edges.has(t.start) && edges.has(t.end));
      },
    },
    {
      id: 'sentence-end-danda',
      claim: 'The danda ( । ) ends a sentence.',
      evidence: 'two danda-ended sentences are split into two',
      run: (a) => a.segmentSentences('मैं घर में हूँ। वह स्कूल जाता है।').length === 2,
    },
  ],
  nb: [
    {
      id: 'ae-oe-aa-stay-whole',
      claim: 'æ, ø and å are letters of their own: they stay inside their words, and stand alone as words, in the tokens.',
      evidence: 'Bøkene ligger på bordet, og æ ø å. is tokenised into eight words, with Bøkene, på and the three letters whole',
      run: (a) => { const w = words(a, 'Bøkene ligg på bordet, og æ ø å.'); return w.length === 8 && w[0] === 'Bøkene' && w[2] === 'på' && w.slice(5).join('') === 'æøå'; },
    },
    {
      id: 'particle-verbs',
      claim: 'A particle verb split by other words (står … opp) is put together as one unit.',
      evidence: 'the construction particle-verb covers står and opp in "Hun står opp klokka sju."',
      run: (a) => { const t = a.tokenize('Hun står opp klokka sju.'); return a.detectPatterns(t, a.analyze(t)).some((p) => p.key === 'particle-verb'); },
    },
  ],
  nn: [
    {
      id: 'ae-oe-aa-stay-whole',
      claim: 'æ, ø and å are letters of their own: they stay inside their words, and stand alone as words, in the tokens.',
      evidence: 'Bøkene ligger på bordet, og æ ø å. is tokenised into eight words, with Bøkene, på and the three letters whole',
      run: (a) => { const w = words(a, 'Bøkene ligg på bordet, og æ ø å.'); return w.length === 8 && w[0] === 'Bøkene' && w[2] === 'på' && w.slice(5).join('') === 'æøå'; },
    },
    {
      id: 'particle-verbs',
      claim: 'A particle verb split by other words (står … opp) is put together as one unit.',
      evidence: 'the construction particle-verb covers står and opp in "Ho står opp klokka sju."',
      run: (a) => { const t = a.tokenize('Ho står opp klokka sju.'); return a.detectPatterns(t, a.analyze(t)).some((p) => p.key === 'particle-verb'); },
    },
  ],
  th: [
    {
      id: 'word-segmentation',
      claim: 'A run of Thai with no spaces is cut into words (ICU dictionary segmentation plus a short compound list); it is limited and unmeasured on prose.',
      evidence: 'ฉันกินข้าวที่บ้านทุกวัน becomes ฉัน กิน ข้าว ที่ บ้าน ทุก วัน with no space added to the text',
      run: (a) => words(a, 'ฉันกินข้าวที่บ้านทุกวัน').join(' ') === 'ฉัน กิน ข้าว ที่ บ้าน ทุก วัน',
    },
    {
      id: 'tone-decoding',
      claim: 'A written word is decoded into syllables with consonant class and tone-mark notes, and says so when the spelling does not decide the tone.',
      evidence: 'decode() returns syllables for ข้าว',
      run: (a) => typeof a.decode === 'function' && a.decode('ข้าว').length > 0,
    },
  ],
  la: [
    {
      id: 'ligatures-and-macrons-stay-whole',
      claim: 'The ae and oe ligatures (æ, œ) and macrons stay inside their words, and a word is found whichever way it is spelled.',
      evidence: 'Cælum et terra, caelum et terra and Cælum with a macron are tokenised into three words each, and cælum and caelum fold to the same key',
      run: (a) => words(a, 'Cælum et terra, caelum et terra.').length === 6 && a.normalize('cælum') === a.normalize('caelum'),
    },
    {
      id: 'enclitic-que-ne',
      claim: 'A trailing -que or -ne is read as its own word joined to the word before it, so the word itself is still found.',
      evidence: 'the reading of terraque has the lemma terra',
      run: (a) => { const t = a.tokenize('terraque'); return a.analyze(t).some((x) => x.token.isWord && x.candidates.some((c) => c.lemma === 'terra')); },
    },
  ],
};

// ───────────────────────────── the report ─────────────────────────────

const has = (m: PackManifest, cap: string): boolean => m.analyzer.capabilities.includes(cap);

/** Features the analyser really wrote on the top readings of the pack's own validation sentences. */
function observedFeatures(a: LanguageAdapter, m: PackManifest): string[] {
  const keys = new Set<string>();
  for (const c of m.validation) {
    if (!c.sentence) continue;
    const toks = a.tokenize(c.sentence);
    for (const x of a.analyze(toks)) {
      const top = x.candidates[0];
      for (const [k, v] of Object.entries(top?.morph ?? {})) if (typeof v === 'string' && v) keys.add(k);
    }
  }
  return [...keys].sort();
}

export type AudioProvider = (languageId: string) => AudioCapability;

export function capabilitiesOf(m: PackManifest, adapter: LanguageAdapter | undefined, audio?: AudioProvider): PackCapabilities {
  const s = adapter?.support;
  const declared = (cap: string, level: SupportLevel | undefined): boolean => has(m, cap) && !!adapter && level !== undefined && level !== 'none';
  const lemmaOk = declared('lemma', s?.lemmatization);
  const morphOk = declared('morphology', s?.morphology);
  const phrasesOk = declared('phrases', s?.phraseDetection);
  const constructionsOk = has(m, 'constructions') && !!adapter;
  const checkerOffered = declared('production-checks', s?.productionChecks);
  const limitations = s?.limitations ?? [];
  const probes = adapter ? PROBES[m.languageId] ?? [] : [];

  const evidence = evidenceFor(m.languageId);
  const dict = m.lexical.dictionary;
  // a dictionary form index is a lemma source only while the pack still declares that dictionary
  const sources = lemmaOk ? evidence.lemmaSources.filter((x) => x.kind !== 'dictionary-forms-index' || (!!dict && dict.id === x.id)) : [];
  const measured = lemmaOk ? evidence.lemmaMeasurements : [];
  const lemmaQuality: SupportLevel = lemmaOk ? deriveLemmaQuality(s!.lemmatization, { lemmaSources: sources, lemmaMeasurements: measured }) : 'none';
  const lemmaNote = !adapter
    ? 'No analyser is bundled for this language: nothing is lemmatised.'
    : !lemmaOk
      ? 'The pack does not declare lemmatisation.'
      : lemmaQuality === 'seed-only'
        ? `Seed-only: lemmas come from a small machine-drafted word list and the closed classes; any other word gets an inferred (unconfirmed) reading or none. ${measuredSentence(measured)}`
        : sources.length
          ? `${lemmaQuality === 'dependable' ? 'Dependable' : 'Limited'}: a lemma comes from the pack’s hand word list and the closed classes, and for other words from ${andList(sources.map(sourcePhrase))}; a word none of them holds gets an inferred (unconfirmed) reading or none. ${measuredSentence(measured)} The analyser states ‘${s!.lemmatization}’ for its own word list.`
          : `Lemmatisation is ${lemmaQuality}. ${measuredSentence(measured)}`;
  const dictionary: PackCapabilities['dictionary'] = dict
    ? { declared: true, id: dict.id, entries: dict.entries, licence: dict.licence, attribution: dict.attribution,
      note: `Meanings come from ${dict.id} (${n(dict.entries)} entries, ${dict.licence}); the installer checks the files, and every gloss is shown with its attribution. Nobody has reviewed the entries for this pack.` }
    : { declared: false, note: 'The pack declares no dictionary: meanings come from the pack’s own word list and, where the analyser reads a form index, from that index.' };
  const morphNote = !adapter
    ? 'No analyser is bundled for this language.'
    : !morphOk
      ? (m.languageId === 'th' ? 'Thai has no inflection to analyse: a reading carries a lemma and a part of speech only.' : 'The pack does not declare morphology.')
      : `Morphology is ${s!.morphology}: every reading of a form with its feature cells; the sentence narrows some; not measured on running prose.`;

  return {
    languageId: m.languageId,
    packId: m.packId,
    version: m.version,
    level: levelOf(m),
    reviewStatus: m.rights.reviewStatus,
    analyzer: adapter ? 'adapter' : 'none',
    analyzerId: adapter ? `adapter-${adapter.lang}@${adapter.version}` : 'intl-tokenize@1',
    tokenization: adapter
      ? { quality: qualityOf(s!.tokenization), method: m.segmentation.method, note: m.segmentation.notes }
      : { quality: 'limited', method: 'intl', note: 'No analyser is bundled: words are split by the browser’s segmenter only.' },
    sentenceSegmentation: adapter
      ? { quality: qualityOf(s!.sentenceSegmentation), note: `Sentence boundaries by the ${m.sentenceBoundaries.method}; an unlisted abbreviation can split a sentence.` }
      : { quality: 'limited', note: 'No analyser is bundled: sentences are split by the browser’s segmenter only.' },
    lemma: { supported: lemmaOk, quality: lemmaQuality, analyserLevel: lemmaOk ? s!.lemmatization : 'none', sources: sources.map((x) => ({ ...x, ...(x.size ? { size: { ...x.size } } : {}) })), measured: measured.map((x) => ({ ...x })), note: lemmaNote },
    dictionary,
    morphology: {
      supported: morphOk,
      quality: morphOk ? s!.morphology : 'none',
      explained: adapter ? m.grammar.features.map((f) => f.key) : [],
      observed: adapter && morphOk ? observedFeatures(adapter, m) : [],
      note: morphNote,
    },
    phrases: { supported: phrasesOk, quality: phrasesOk ? s!.phraseDetection : 'none' },
    constructions: { supported: constructionsOk, explained: adapter ? m.grammar.constructions.map((c) => c.id) : [] },
    syntaxRoles: { supported: false, note: SYNTAX_NOTE },
    checker: {
      offered: checkerOffered,
      quality: checkerOffered ? s!.productionChecks : 'none',
      adapterLevel: s?.productionChecks ?? 'none',
      scope: limitations.filter((l) => /^Production checks/u.test(l)),
      note: checkerOffered
        ? 'The pack declares production checking; each rule fires only on its own unambiguous shape and an empty result never means the sentence is correct.'
        : adapter && s!.productionChecks !== 'none'
          ? `The analyser has production-check rules (${s!.productionChecks}), but this pack does not offer them: nothing is checked.`
          : 'No production checking.',
    },
    scriptHandling: {
      script: m.scriptId,
      items: probes.map((p) => {
        let works = false;
        try { works = adapter ? p.run(adapter) : false; } catch { works = false; }
        return { id: p.id, claim: p.claim, works, evidence: p.evidence };
      }),
    },
    ...(audio ? { audio: audio(m.languageId) } : {}),
    limitations: [...limitations],
  };
}

/** The capability report of a language's pack; undefined when no pack exists for it. */
export function packCapabilities(languageId: string, audio?: AudioProvider): PackCapabilities | undefined {
  const m = Object.prototype.hasOwnProperty.call(PACKS, languageId) ? PACKS[languageId] : undefined;
  return m ? capabilitiesOf(m, builtInAdapter(languageId), audio) : undefined;
}

/** Every pack's report, in registry order. */
export function allPackCapabilities(audio?: AudioProvider): PackCapabilities[] {
  return Object.keys(PACKS).map((l) => packCapabilities(l, audio)!);
}
