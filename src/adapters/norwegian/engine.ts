/**
 * The Norwegian adapter factory: one engine, two standards. `src/adapters/nb.ts` (Bokmål, the target of the course) and
 * `src/adapters/nn.ts` (Nynorsk, read receptively) are this function called with 'nb' and 'nn'.
 *
 * MACHINE-DRAFTED, pending native review: every lexicon row, paradigm rule and table under src/adapters/norwegian was written
 * by a model, none of it is checked against Norsk ordbank / Ordbøkene or by a native speaker. The adapter is deterministic and
 * pure. See types.ts for the provenance convention.
 */
/*
 * DELIBERATE CONVENTIONS (the blind holdout, test/adapters/norwegian-holdout.test.ts, annotates these three differently; they are
 * not bugs, and the holdout's disagreement on them is counted as such in the reports):
 *  1. A particle verb's pieces carry the UNIT lemma ("stå opp" on both står and opp, "ta på seg" on ta, på and seg), with the verb
 *     as the unit's head; the ordinary reading (stå, opp) stays behind it. This is how the importer counts the unit once
 *     (AnalysisCandidate.unit) and how the word sheet of either piece shows the whole verb. A holdout that expects the bare lemma
 *     (stå / opp) will miss on every particle verb.
 *  2. ha and bli are AUX only when a participle follows (Vi har endelig funnet, ble ikke frelst: an adverb, or a subject and an
 *     adverb in a question, may stand between); otherwise they are VERB (har to barn, blir lærer). være is always AUX.
 *  3. "som" is PRON (relative: mannen som står) first; SCONJ som ("as", "like") is the second reading and is chosen only after
 *     samme, slik, sånn, like, så. The UD choice of SCONJ for every relative som is not followed.
 */
import type { AdapterSupport, AnalysisSourceInfo, AnalyzedToken, LanguageAdapter, PartOfSpeech, PronunciationSupport, RawToken } from '../../core';
import { speechNormalizeGeneric } from '../shared';
import { analyzeSentence, sourceIds, type Engine } from './analysis';
import { decomposeCompound } from './compounds';
import { detectNorwegianConstructions, detectNorwegianPhrases } from './constructions';
import { familyOf } from './families';
import { olderSpellings, spellingRelation } from './historical';
import { lexiconFor } from './lexicon';
import { checkNorwegianProduction } from './production';
import { transcribe } from './pronunciation';
import { NB_UNITS, NN_UNITS } from './units';
import { NB_VARIETIES, NN_VARIETIES } from './varieties';
import { normalizeNo, segmentSentencesNo, tokenizeNo } from './text';
import type { NoStandard } from './types';

const VERSION = '2'; // 2 (2026-10-08): b1-bridge lexicon additions (62 nouns, 13 verbs, 5 adjectives) and in-place fixes

// ── numbers 0–999 999 ──
const U = ['null', 'en', 'to', 'tre', 'fire', 'fem', 'seks', 'sju', 'åtte', 'ni', 'ti', 'elleve', 'tolv', 'tretten', 'fjorten', 'femten', 'seksten', 'sytten', 'atten', 'nitten'];
const T: Record<number, string> = { 2: 'tjue', 3: 'tretti', 4: 'førti', 5: 'femti', 6: 'seksti', 7: 'sytti', 8: 'åtti', 9: 'nitti' };

function below100(n: number): string {
  if (n < 20) return U[n];
  const u = n % 10;
  return u ? `${T[Math.floor(n / 10)]}${U[u]}` : T[Math.floor(n / 10)];
}
function below1000(n: number): string {
  if (n < 100) return below100(n);
  const h = Math.floor(n / 100);
  const r = n % 100;
  return `${h === 1 ? 'ett' : U[h]} hundre${r ? ` og ${below100(r)}` : ''}`;
}

export function noNumberToWords(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 999999) return null;
  if (n < 1000) return below1000(n);
  const th = Math.floor(n / 1000);
  const r = n % 1000;
  const head = `${th === 1 ? 'ett' : below1000(th)} tusen`;
  return r ? `${head} ${r < 100 ? 'og ' : ''}${below1000(r)}` : head;
}

const ABBR_NB = [
  { pattern: /\bbl\.\s?a\./gu, replacement: 'blant annet', label: 'bl.a.' },
  { pattern: /\bf\.\s?eks\./gu, replacement: 'for eksempel', label: 'f.eks.' },
  { pattern: /\bosv\./gu, replacement: 'og så videre', label: 'osv.' },
  { pattern: /\bdvs\./gu, replacement: 'det vil si', label: 'dvs.' },
  { pattern: /\bm\.\s?fl\./gu, replacement: 'med flere', label: 'm.fl.' },
  { pattern: /\bo\.\s?l\./gu, replacement: 'og lignende', label: 'o.l.' },
  { pattern: /\bca\./gu, replacement: 'cirka', label: 'ca.' },
  { pattern: /\bmv\./gu, replacement: 'med mer', label: 'mv.' },
  { pattern: /\bnr\./gu, replacement: 'nummer', label: 'nr.' },
  { pattern: /\bkl\.\s?(?=\d)/gu, replacement: 'klokka ', label: 'kl.' },
  { pattern: /\bDr\./gu, replacement: 'doktor', label: 'Dr.' },
  { pattern: /\bProf\./gu, replacement: 'professor', label: 'Prof.' },
];
const ABBR_NN = [
  { pattern: /\bm\.\s?a\./gu, replacement: 'mellom anna', label: 'm.a.' },
  { pattern: /\bt\.\s?d\./gu, replacement: 'til dømes', label: 't.d.' },
  { pattern: /\bosb\./gu, replacement: 'og så bortetter', label: 'osb.' },
  { pattern: /\bdvs\./gu, replacement: 'det vil seie', label: 'dvs.' },
  { pattern: /\bca\./gu, replacement: 'cirka', label: 'ca.' },
  { pattern: /\bnr\./gu, replacement: 'nummer', label: 'nr.' },
  { pattern: /\bkl\.\s?(?=\d)/gu, replacement: 'klokka ', label: 'kl.' },
];

const MORPH_WORDS: Record<string, Record<string, string>> = {
  masculine: { Gender: 'Masc' }, feminine: { Gender: 'Fem' }, neuter: { Gender: 'Neut' }, singular: { Number: 'Sing' }, plural: { Number: 'Plur' },
  definite: { Definite: 'Def' }, indefinite: { Definite: 'Ind' }, present: { VerbForm: 'Fin', Tense: 'Pres' }, past: { VerbForm: 'Fin', Tense: 'Past' },
  preterite: { VerbForm: 'Fin', Tense: 'Past' }, participle: { VerbForm: 'Part', Tense: 'Past' }, infinitive: { VerbForm: 'Inf' }, imperative: { VerbForm: 'Fin', Mood: 'Imp' },
  passive: { Voice: 'Pass' }, comparative: { Degree: 'Cmp' }, superlative: { Degree: 'Sup' }, genitive: { Case: 'Gen' }, supine: { VerbForm: 'Part', Tense: 'Past' },
};

export function describeNorwegianMorph(morph: Record<string, string>, pos?: PartOfSpeech): string {
  const w = (k: string): string[] => (morph[k] ?? '').split(',').filter(Boolean);
  const gender: Record<string, string> = { Masc: 'masculine', Fem: 'feminine', Neut: 'neuter' };
  const parts: string[] = [];
  if (pos === 'VERB' || pos === 'AUX') {
    // Mood "Imp,Ind" is a form that is BOTH (gjør, les, kom): it is described by its tense and the imperative is named as the other reading, never as the only one
    const orImp = w('Mood').includes('Imp') && w('Mood').includes('Ind') ? ' or imperative' : '';
    if (w('Mood').includes('Imp') && !orImp) parts.push(w('VerbForm').includes('Inf') ? 'imperative or infinitive' : 'imperative');
    else if (w('VerbForm').includes('Inf') && !w('VerbForm').includes('Fin')) parts.push(w('VerbForm').includes('Part') ? 'infinitive or perfect participle' : 'infinitive');
    else if (w('VerbForm').includes('Part') && !w('VerbForm').includes('Fin')) parts.push('perfect participle');
    else if (w('Tense').includes('Pres')) parts.push(`present tense${orImp}`);
    else if (w('Tense').includes('Past')) parts.push(w('VerbForm').includes('Part') ? 'past tense or perfect participle' : `past tense${orImp}`);
    if (w('Voice').includes('Pass')) parts.push('passive (-s)');
    return parts.join(', ');
  }
  if (w('Gender').length) parts.push(w('Gender').map((g) => gender[g] ?? g).join(' or '));
  if (w('Number').length && !(w('Number').includes('Plur') && w('Number').includes('Sing'))) parts.push(w('Number').includes('Plur') ? 'plural' : 'singular');
  if (w('Definite').length === 1) parts.push(w('Definite')[0] === 'Def' ? 'definite' : 'indefinite');
  if (w('Case').includes('Gen')) parts.push('genitive');
  if (w('Degree').length && w('Degree')[0] !== 'Pos') parts.push(w('Degree')[0] === 'Cmp' ? 'comparative' : 'superlative');
  if (w('Person').length) parts.push(`${w('Person')[0]} person`);
  if (w('Poss').includes('Yes')) parts.push('possessive');
  if (w('Reflex').includes('Yes')) parts.push('reflexive');
  return parts.join(', ');
}

const LEMMA_ALTS: Array<[string, string]> = [['syv', 'sju'], ['tyve', 'tjue'], ['bli', 'verte'], ['bro', 'bru']];

export function makeNorwegianAdapter(std: NoStandard): LanguageAdapter {
  const lex = lexiconFor(std);
  const ids = sourceIds(std, VERSION);
  const analyzer = `adapter-${std}@${VERSION}`;
  const eng: Engine = { std, lex, units: std === 'nb' ? NB_UNITS : NN_UNITS, analyzer, ids };
  const name = std === 'nb' ? 'Norwegian (Bokmål)' : 'Norwegian (Nynorsk)';
  const label = std === 'nb' ? 'Bokmål' : 'Nynorsk';
  const total = lex.stats.nouns + lex.stats.verbs + lex.stats.adjectives + lex.stats.words;

  const SOURCES: Record<string, AnalysisSourceInfo> = {
    [ids.hand]: { id: ids.hand, label: `${label} word list`, origin: 'hand', reviewStatus: 'machine-drafted', version: VERSION },
    [ids.phrases]: { id: ids.phrases, label: `${label} fixed expressions`, origin: 'hand', reviewStatus: 'machine-drafted', version: VERSION },
    [ids.constructions]: { id: ids.constructions, label: `${label} grammar patterns`, origin: 'hand', reviewStatus: 'machine-drafted', version: VERSION },
    [ids.rules]: { id: ids.rules, label: `${label} word-form and sentence rules`, origin: 'rule', reviewStatus: 'machine-drafted', version: VERSION },
  };

  const support: AdapterSupport = {
    tokenization: 'dependable',
    sentenceSegmentation: 'limited',
    lemmatization: 'seed-only',
    morphology: 'limited',
    phraseDetection: 'limited',
    productionChecks: std === 'nb' ? 'limited' : 'none',
    limitations: std === 'nb' ? [
      `Lemmatization is seed-only: the ${label} word list is a machine-drafted seed of about ${total.toLocaleString('en')} entries (nouns, verbs, adjectives, closed classes) that no native speaker has checked against Norsk ordbank; a word outside it gets a reading the rules only infer (a compound, an older spelling, a name guess: marked unconfirmed) or none.`,
      'There is no parser. The sentence layer reads the words around a homograph (an article before a noun, å or a modal before an infinitive, har before a participle); what the neighbours do not decide stays a list of readings, never a guess. Both feminine paradigms (ei bok, boka and en bok, boken) and both past forms (kastet and kasta) are accepted as valid.',
      'Compounds are taken apart only into words the word list knows, with the linking element (-s-, -e-) named; the reading is marked unconfirmed (0.55) and has no gloss. A word the list holds keeps its own entry, and a listed non-compound (bilde, stolen) is never split.',
      'A particle verb (stå opp, finne ut, ta på seg) is put together when the particle stands within four words after the verb in the same clause; the word list of such verbs is short, and a preposition verb that cannot split (se på) is not a unit.',
      'Older spelling (Riksmål efter, nu, sprog; Dano-Norwegian gade, hvad, mig, aa for å) is related to today\'s word without changing the text, and only when the modern spelling is a word the list knows. The period each pair belongs to is the author\'s judgement, not a source.',
      'Production checks are not dependable: they are rules for a few common errors (a Nynorsk form in Bokmål, a Riksmål spelling, min bilen, a missing neuter -t, ikke after the verb in a subordinate clause, og for å) that fire only on their own shape and say nothing when a fact is missing. Pronunciation is a rule-based East Norwegian reference realisation, not a norm, and carries no tone except a few unverified minimal pairs.',
    ] : [
      `Lemmatization is seed-only: the Nynorsk word list is a machine-drafted seed of about ${total.toLocaleString('en')} entries, smaller than the Bokmål list because Nynorsk is read, not written, in this course; no native speaker has checked it against Norsk ordbank.`,
      'There is no parser. The sentence layer reads the words around a homograph; what the neighbours do not decide stays a list of readings. The -a and -e infinitives of Nynorsk (kaste / kasta) are both generated for every -e verb; table cells the recon notes mark unsure carry an unverified flag in the notes of the reading.',
      'Compounds are taken apart only into words the Nynorsk list knows; the reading is marked unconfirmed (0.55) and has no gloss. Older Landsmål and Høgnorsk spelling is related only for aa → å and a handful of listed forms.',
      'Nynorsk writing is not checked: this adapter does not check production. The Bokmål adapter flags Nynorsk forms in Bokmål writing.',
    ],
  };

  const adapter: LanguageAdapter = {
    lang: std,
    name,
    script: 'Latn',
    version: VERSION,
    support,
    sources: SOURCES,
    varieties: std === 'nb' ? NB_VARIETIES : NN_VARIETIES,

    segmentSentences: segmentSentencesNo,
    tokenize: tokenizeNo,
    normalize: normalizeNo,
    /** Keeps æ, ø, å (they distinguish words). */
    searchNormalize: (q) => normalizeNo(q).trim(),

    analyze: (tokens: RawToken[]): AnalyzedToken[] => analyzeSentence(tokens, eng),

    detectPhrases: (tokens, analyses) => detectNorwegianPhrases(tokens, analyses, std),
    detectPatterns: (tokens, analyses) => detectNorwegianConstructions(tokens, analyses, std),

    pronunciation(token): PronunciationSupport {
      const t = transcribe(token.normalized);
      if (!t) return { notes: [] };
      return {
        ipa: t.ipa,
        ipaSource: 'rules', // the adapter's own rule-based IPA: the word sheet shows it, labelled, when no dictionary IPA exists
        transliteration: t.respelling,
        notes: ['variant: east', 'machine-draft (rule-based respelling, not checked by a native speaker)', 'Reference realisation of East Norwegian speech, not a norm: there is no official spoken standard, and speech is not "Bokmål".', ...t.notes],
      };
    },

    speechNormalize: (text) =>
      speechNormalizeGeneric(text, {
        tool: `speech-${std}@1`,
        numberToWords: noNumberToWords,
        percentWord: 'prosent',
        skipOrdinalDot: true,
        abbreviations: std === 'nb' ? ABBR_NB : ABBR_NN,
      }),

    display: { wordSeparator: ' ', showBoundariesOnHighlight: false, fontFamily: 'Georgia, "Times New Roman", serif', lineHeight: 1.7 },

    checkProduction: (tokens, analyses, sentence) => (std === 'nb' ? checkNorwegianProduction(tokens, analyses, sentence) : []),

    relate(a, b) {
      const na = normalizeNo(a);
      const nbForm = normalizeNo(b);
      if (na === nbForm) return 'same';
      const keys = (f: string): Set<string> => {
        const out = new Set<string>();
        for (const r of lex.lookup(f)) out.add(`${r.lemma}|${r.pos}`);
        if (!out.size && f.endsWith('s')) for (const r of lex.lookup(f.slice(0, -1))) if (r.pos === 'NOUN' || r.pos === 'PROPN') out.add(`${r.lemma}|${r.pos}`);
        return out;
      };
      const ka = keys(na);
      const kb = keys(nbForm);
      for (const k of ka) if (kb.has(k)) return 'inflection';
      // an older spelling of the other word
      const old = (f: string): string | undefined => spellingRelation(f, std, { isWord: (x) => lex.has(x) })?.modern;
      const oa = old(na);
      const ob = old(nbForm);
      if ((oa && (oa === nbForm || [...keys(oa)].some((k) => kb.has(k)))) || (ob && (ob === na || [...keys(ob)].some((k) => ka.has(k))))) return 'inflection';
      // a compound and one of its parts
      const lemmasOfParts = (f: string): string[] => {
        const d = decomposeCompound(f, lex);
        return d ? d.parts.filter((p) => p.lemma).map((p) => normalizeNo(p.lemma as string)) : [];
      };
      const lemmaSet = (s: Set<string>): Set<string> => new Set([...s].map((k) => normalizeNo(k.split('|')[0])));
      const partsA = lemmasOfParts(na);
      const partsB = lemmasOfParts(nbForm);
      const la = lemmaSet(ka);
      const lb = lemmaSet(kb);
      if (partsA.some((p) => lb.has(p) || p === nbForm) || partsB.some((p) => la.has(p) || p === na)) return 'component';
      return 'none';
    },

    /**
     * Other headwords a dictionary may file this lemma under: the alternative valid spelling (syv / sju, tyve / tjue), the
     * Nynorsk infinitive in -a (kaste → kasta), and an older spelling the list pairs with it (etter → efter). Both feminine
     * paradigms share one lemma, so there is nothing to list for them.
     */
    lemmaVariants: (lemma, pos): string[] => {
      const out: string[] = [];
      for (const [x, y] of LEMMA_ALTS) { if (lemma === x) out.push(y); if (lemma === y) out.push(x); }
      if (std === 'nn' && (pos === undefined || pos === 'VERB' || pos === 'AUX') && /e$/.test(lemma) && lex.hasLemma(lemma)) out.push(`${lemma.slice(0, -1)}a`);
      if (std === 'nn' && /a$/.test(lemma) && lex.hasLemma(`${lemma.slice(0, -1)}e`)) out.push(`${lemma.slice(0, -1)}e`);
      out.push(...olderSpellings(lemma));
      return [...new Set(out)].filter((v) => v !== lemma);
    },

    morphFromTags(tags) {
      const out: Record<string, string> = {};
      for (const t of tags) {
        const m = MORPH_WORDS[t.toLowerCase()];
        if (m) for (const [k, v] of Object.entries(m)) out[k] = out[k] && out[k] !== v ? [...new Set([...out[k].split(','), v])].sort().join(',') : v;
      }
      return out;
    },

    varietiesFromTags(tags) {
      const out: string[] = [];
      for (const t of tags) {
        const k = t.toLowerCase();
        if (k === 'riksmål' || k === 'riksmal') out.push('nb-riksmal');
        else if (k === 'dano-norwegian') out.push('nb-dano');
        else if (k === 'landsmål' || k === 'landsmal') out.push('nn-landsmal');
        else if (k === 'høgnorsk' || k === 'hognorsk') out.push('nn-hognorsk');
      }
      return out.filter((v) => (std === 'nb' ? v.startsWith('nb-') : v.startsWith('nn-')));
    },

    describeMorph: (morph, pos) => describeNorwegianMorph(morph, pos),
  };

  // concept families (the optional `family` method of the adapter contract, added to core by the registration package)
  return Object.assign(adapter, { family: (lemma: string, pos?: PartOfSpeech) => familyOf(std, lemma, pos) });
}
