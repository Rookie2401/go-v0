/**
 * German adapter. NFC + lower-case identity (whole words: compounds keep their own form identity).
 * Confident: lexicon forms with case/gender for articles, possessives and nouns; strong/weak/irregular
 * verb class in notes; separable prefix detection across the sentence (fing … an → anfangen).
 * Uncertain: compound decomposition (rule-based, low confidence, only when every part is a lexicon noun);
 * case of ambiguous article forms is reported as a union (Case=Dat,Gen,Nom), not guessed.
 */
import type { AnalysisCandidate, ErrorCandidate, LanguageAdapter, PatternCandidate, PronunciationSupport, RawToken, AdapterSupport } from '../core';
import {
  E, Lexicon, hasPos, lexiconAnalyze, makeWordTokenizer, matchCase, matchPhraseRules, nfc, speechNormalizeGeneric,
  splitSentences, type PhraseRule,
} from './shared';

const LANG = 'de' as const;
const VERSION = '1';
const ANALYZER = `adapter-${LANG}@${VERSION}`;

const normalize = (s: string) => nfc(s).toLocaleLowerCase('de');

const STRONG = { class: 'strong' };
const WEAK = { class: 'weak' };
const IRREG = { class: 'irregular' };

const ENTRIES = [
  // verbs
  E('sein', 'AUX', 'to be', ['sein:inf', 'bin:1s pres', 'bist:2s pres', 'ist:3s pres', 'sind:1p pres', 'sind:3p pres', 'war:1s past', 'war:3s past'], { notes: IRREG }),
  E('haben', 'VERB', 'to have', ['haben:inf', 'haben:1p pres', 'haben:3p pres', 'habe:1s pres', 'hast:2s pres', 'hat:3s pres', 'hatte:1s past', 'hatte:3s past'], { notes: IRREG }),
  E('verstehen', 'VERB', 'to understand', ['verstehen:inf', 'verstehen:1p pres', 'verstehen:3p pres', 'verstehe:1s pres', 'verstehst:2s pres', 'versteht:3s pres', 'verstand:1s past', 'verstand:3s past'], { notes: STRONG }),
  E('glauben', 'VERB', 'to believe', ['glauben:inf', 'glauben:1p pres', 'glauben:3p pres', 'glaube:1s pres', 'glaubst:2s pres', 'glaubt:3s pres', 'glaubte:1s past', 'glaubte:3s past'], { notes: WEAK }),
  E('anfangen', 'VERB', 'to begin', ['anfangen:inf', 'anzufangen:inf', 'fange:1s pres', 'fängst:2s pres', 'fängt:3s pres', 'fing:1s past', 'fing:3s past', 'angefangen:ptcp'], { notes: { class: 'strong', separable: 'an' } }),
  E('vergeben', 'VERB', 'to forgive', ['vergeben:inf', 'vergeben:1p pres', 'vergeben:3p pres', 'vergebe:1s pres', 'vergibst:2s pres', 'vergibt:3s pres', 'vergab:1s past', 'vergab:3s past'], { notes: STRONG }),
  E('lieben', 'VERB', 'to love', ['lieben:inf', 'liebe:1s pres', 'liebst:2s pres', 'liebt:3s pres', 'geliebt:ptcp'], { notes: WEAK }),
  E('wollen', 'AUX', 'to want', ['wollen:inf', 'will:1s pres', 'will:3s pres'], { notes: IRREG }),
  E('gehen', 'VERB', 'to go; geht es dir = how are you', ['gehen:inf', 'geht:3s pres'], { notes: STRONG }),
  E('sagen', 'VERB', 'to say', ['sagen:inf', 'sagen:1p pres', 'sagen:3p pres', 'sage:1s pres'], { notes: WEAK }),
  E('bekennen', 'VERB', 'to confess', ['bekennen:inf', 'bekennen:1p pres'], { notes: IRREG }),
  E('verführen', 'VERB', 'to lead astray, deceive', ['verführen:inf', 'verführen:1p pres'], { notes: WEAK }),
  E('reinigen', 'VERB', 'to cleanse', ['reinigen:inf', 'reinigt:3s pres'], { notes: WEAK }),
  E('geben', 'VERB', 'to give', ['geben:inf', 'gab:1s past', 'gab:3s past'], { notes: STRONG }),
  E('verlieren', 'VERB', 'to lose, perish', ['verlieren:inf', 'verloren:ptcp'], { notes: STRONG }),
  E('werden', 'AUX', 'to become; passive auxiliary', ['werden:inf', 'werden:1p pres', 'werden:3p pres', 'wird:3s pres'], { notes: IRREG }),
  // nouns
  E('Herz', 'NOUN', 'heart', ['Herz:n sg nom acc', 'Herzen:n sg dat', 'Herzen:n pl nom acc dat gen']),
  E('Sünde', 'NOUN', 'sin', ['Sünde:f sg nom acc dat gen', 'Sünden:f pl nom acc dat gen']),
  E('Gott', 'PROPN', 'God', ['Gott:m sg nom acc dat']),
  E('Friede', 'NOUN', 'peace', ['Friede:m sg nom', 'Frieden:m sg nom acc dat']),
  E('Welt', 'NOUN', 'world', ['Welt:f sg nom acc dat gen', 'Welten:f pl nom acc dat gen']),
  E('Sohn', 'NOUN', 'son', ['Sohn:m sg nom acc dat']),
  E('Wahrheit', 'NOUN', 'truth', ['Wahrheit:f sg nom acc dat gen']),
  E('Leben', 'NOUN', 'life', ['Leben:n sg nom acc dat']),
  E('Tag', 'NOUN', 'day', ['Tag:m sg nom acc dat', 'Tages:m sg gen', 'Tage:m pl nom acc gen']),
  E('Untugend', 'NOUN', 'unrighteousness', ['Untugend:f sg nom acc dat gen']),
  E('Haus', 'NOUN', 'house', ['Haus:n sg nom acc', 'Häuser:n pl nom acc gen']),
  E('Wort', 'NOUN', 'word', ['Wort:n sg nom acc', 'Worte:n pl nom acc gen']),
  E('Mann', 'NOUN', 'man', ['Mann:m sg nom acc dat', 'Männer:m pl nom acc gen']),
  E('Anna', 'PROPN', 'Anna (name)'), E('Paul', 'PROPN', 'Paul (name)'),
  // articles, determiners
  E('der', 'DET', 'the', [
    'der:m sg nom def art', 'der:f sg dat def art', 'der:f sg gen def art', 'der:pl gen def art',
    'die:f sg nom def art', 'die:f sg acc def art', 'die:pl nom def art', 'die:pl acc def art',
    'das:n sg nom def art', 'das:n sg acc def art', 'dem:m sg dat def art', 'dem:n sg dat def art',
    'den:m sg acc def art', 'den:pl dat def art', 'des:m sg gen def art', 'des:n sg gen def art',
  ]),
  E('der', 'PRON', 'who, which (relative)', ['die:pl nom rel']),
  E('ein', 'DET', 'a, an', [
    'ein:m sg nom indef art', 'ein:n sg nom indef art', 'ein:n sg acc indef art', 'eine:f sg nom indef art', 'eine:f sg acc indef art',
    'einen:m sg acc indef art', 'einem:m sg dat indef art', 'einem:n sg dat indef art', 'einer:f sg dat indef art', 'einer:f sg gen indef art',
    'eines:m sg gen indef art', 'eines:n sg gen indef art',
  ]),
  E('kein', 'DET', 'no, not any', ['kein:m sg nom', 'keine:f sg nom acc', 'keine:pl nom acc', 'keinen:m sg acc', 'keinem:m sg dat', 'keiner:f sg dat']),
  E('mein', 'DET', 'my', ['mein:m sg nom poss', 'meine:f sg nom acc poss', 'meine:pl nom acc poss', 'meinen:m sg acc poss', 'meinen:pl dat poss', 'meinem:m sg dat poss', 'meinem:n sg dat poss', 'meiner:f sg dat poss']),
  E('unser', 'DET', 'our', ['unsre:f sg nom acc poss', 'unsre:pl nom acc poss', 'unsere:f sg nom acc poss', 'unsere:pl nom acc poss']),
  E('sein', 'DET', 'his', ['seinen:m sg acc poss', 'seinen:pl dat poss', 'seine:f sg nom acc poss', 'seinem:m sg dat poss']),
  E('alle', 'PRON', 'all, everyone', ['alle:pl nom acc', 'allen:pl dat', 'aller:pl gen', 'aller:f sg dat gen']),
  // pronouns
  E('ich', 'PRON', 'I', ['ich:1s nom prs']),
  E('du', 'PRON', 'you (sg, informal)', ['du:2s nom prs']),
  E('er', 'PRON', 'he', ['er:3s m nom prs']),
  E('sie', 'PRON', 'she, they', ['sie:3s f nom acc prs', 'sie:3p nom acc prs']),
  E('es', 'PRON', 'it', ['es:3s n nom acc prs']),
  E('wir', 'PRON', 'we', ['wir:1p nom prs']),
  E('mir', 'PRON', 'me (dative)', ['mir:1s dat prs']),
  E('dir', 'PRON', 'you (dative)', ['dir:2s dat prs']),
  E('uns', 'PRON', 'us', ['uns:1p acc dat prs']),
  E('ihn', 'PRON', 'him', ['ihn:3s m acc prs']),
  E('etwas', 'PRON', 'something'),
  E('was', 'PRON', 'what', ['was:int']),
  E('selbst', 'ADV', 'oneself, even'),
  // adjectives
  E('jung', 'ADJ', 'young'),
  E('gut', 'ADJ', 'good, well'),
  E('treu', 'ADJ', 'faithful'),
  E('gerecht', 'ADJ', 'righteous'),
  E('ewig', 'ADJ', 'eternal', ['ewige:n sg acc', 'ewige:m sg nom']),
  E('eingeboren', 'ADJ', 'only-begotten', ['eingeborenen:m sg acc']),
  E('ganz', 'ADJ', 'whole, all', ['ganzem:m sg dat', 'ganzem:n sg dat']),
  // adverbs
  E('jetzt', 'ADV', 'now'), E('heute', 'ADV', 'today'), E('dann', 'ADV', 'then'), E('gestern', 'ADV', 'yesterday'),
  E('oft', 'ADV', 'often'), E('manchmal', 'ADV', 'sometimes'), E('morgen', 'ADV', 'tomorrow'),
  E('auch', 'ADV', 'also'),
  E('nicht', 'ADV', 'not', ['nicht:neg']),
  E('also', 'ADV', 'thus, so'),
  E('wie', 'ADV', 'how', ['wie:int']),
  E('warum', 'ADV', 'why', ['warum:int']),
  E('so', 'ADV', 'so, thus'),
  // prepositions & particles
  E('an', 'ADP', 'at, on; (believe) in'),
  E('in', 'ADP', 'in'),
  E('mit', 'ADP', 'with'), E('von', 'ADP', 'from, of'), E('aus', 'ADP', 'out of'), E('bei', 'ADP', 'at, with'),
  E('nach', 'ADP', 'after, to'), E('seit', 'ADP', 'since'), E('auf', 'ADP', 'on, upon'), E('für', 'ADP', 'for'),
  E('zu', 'ADP', 'to, at', ['zu']),
  E('zu', 'PART', 'to (infinitive marker)', ['zu']),
  // conjunctions
  E('und', 'CONJ', 'and'), E('aber', 'CONJ', 'but'), E('sondern', 'CONJ', 'but rather'), E('oder', 'CONJ', 'or'),
  E('als', 'SCONJ', 'when, as'),
  E('dass', 'SCONJ', 'that', ['dass', 'daß']),
  E('wenn', 'SCONJ', 'if, when'), E('weil', 'SCONJ', 'because'),
  // interjections
  E('hallo', 'INTJ', 'hello'), E('ja', 'INTJ', 'yes'), E('danke', 'INTJ', 'thanks'),
];
export const deLexicon = new Lexicon(ENTRIES, normalize);

// ── compounds (rule-based, low confidence) ──
const LINKS = ['', 's', 'n', 'en', 'e', 'es'];
const NOUN_PARTS = new Map<string, string>(); // normalized form → normalized lemma
for (const e of ENTRIES) {
  if (e.pos !== 'NOUN' && e.pos !== 'PROPN') continue;
  for (const f of e.forms) NOUN_PARTS.set(normalize(f.form), normalize(e.lemma));
}

function decompose(normalized: string, depth = 0): string[] | undefined {
  if (depth > 2) return undefined;
  for (let k = 3; k <= normalized.length - 3; k++) {
    const left = normalized.slice(0, k);
    for (const link of LINKS) {
      if (link && !left.endsWith(link)) continue;
      const head = link ? left.slice(0, -link.length) : left;
      const lemma = NOUN_PARTS.get(head);
      if (!lemma || head.length < 3) continue;
      const rest = normalized.slice(k);
      const restLemma = NOUN_PARTS.get(rest);
      if (restLemma) return [lemma, restLemma];
      const deeper = decompose(rest, depth + 1);
      if (deeper) return [lemma, ...deeper];
    }
  }
  return undefined;
}

function unknownWord(token: RawToken): AnalysisCandidate[] {
  if (!/^\p{Lu}/u.test(token.surface)) return [];
  const parts = decompose(token.normalized);
  if (!parts) return [];
  return [{
    pos: 'NOUN', morph: {}, confidence: 0.35, gloss: `compound of ${parts.join(' + ')}`,
    notes: { components: parts, source: 'rule' },
  }];
}

function contextual(i: number, tokens: RawToken[], base: AnalysisCandidate[][]): AnalysisCandidate[] {
  const cands = base[i];
  const t = tokens[i];
  const reorder = (pos: string, conf: number) => {
    const idx = cands.findIndex((c) => c.pos === pos);
    if (idx <= 0) return cands;
    return [{ ...cands[idx], confidence: conf }, ...cands.filter((_, k) => k !== idx).map((c) => ({ ...c, confidence: Math.min(c.confidence, 0.35) }))];
  };
  if (t.normalized === 'die' && cands.length > 1 && tokens[i - 1]?.surface === ',') return reorder('PRON', 0.7);
  if (t.normalized === 'zu' && cands.length > 1) {
    const next = base[i + 1]?.[0];
    if (next && (next.morph.VerbForm ?? '').split(',').includes('Inf')) return reorder('PART', 0.85);
    return reorder('ADP', 0.7);
  }
  if (t.normalized === 'an') {
    for (let j = i - 1; j >= 0; j--) {
      const c = base[j]?.[0];
      if (c && c.pos === 'VERB' && c.notes?.separable === 'an' && c.morph.VerbForm !== 'Inf') {
        const next = tokens[i + 1];
        if (!next || !next.isWord || next.normalized === 'zu') {
          return [
            { lemma: 'anfangen', pos: 'VERB', morph: {}, gloss: 'to begin (separable particle)', confidence: 0.8, notes: { separable: 'an', particleOf: String(j), source: 'rule' } },
            ...cands.map((c) => ({ ...c, confidence: 0.3 })),
          ];
        }
        break;
      }
    }
  }
  return cands;
}

// ── phrases ──
const PHRASES: PhraseRule[] = [
  { pattern: ['als', '_', 'jung', 'sein'], display: 'als ich jung war', gloss: 'when I was young', kind: 'formula',
    variants: [['als', { slot: true, pos: ['PRON'] }, 'jung', 'sein']] },
  { pattern: ['anfangen', 'zu', 'verstehen'], display: 'anfangen … zu verstehen', gloss: 'to begin to understand', kind: 'construction',
    variants: [['anfangen', { gap: 8 }, 'zu', 'verstehen']] },
  { pattern: ['glauben', 'an', '_'], display: 'glauben an …', gloss: 'to believe in', kind: 'frame',
    variants: [['glauben', { gap: 4 }, 'an', { slot: true }], ['an', { slot: true, pos: ['PRON', 'PROPN', 'NOUN'] }, 'glauben']] },
];

const DATIVE_PREPS = new Set(['mit', 'zu', 'von', 'aus', 'bei', 'nach', 'seit']);
const FRONT_ADVERBS = new Set(['jetzt', 'heute', 'dann', 'morgen', 'gestern', 'oft', 'manchmal']);
const NOM_PRONOUNS = new Set(['ich', 'du', 'er', 'sie', 'es', 'wir']);
const SUBORDINATORS = new Set(['als', 'dass', 'daß', 'wenn', 'weil', 'warum', 'ob']);

function dativeArticle(lemma: string, gender: string, number: string): string | undefined {
  const entry = deLexicon.find(lemma, 'DET');
  if (!entry) return undefined;
  return entry.forms.find((f) => (f.morph.Case ?? '').split(',').includes('Dat') && f.morph.Gender === gender && f.morph.Number === number)?.form;
}

const SUPPORT: AdapterSupport = {
  tokenization: 'dependable', // Intl.Segmenter('de'); whole words (compounds stay one token)
  sentenceSegmentation: 'limited', // terminators, ordinal dot (3. Mai) and a short abbreviation list
  lemmatization: 'seed-only', // the lexicon covers the seed corpus only; other words are unanalysed unless a capitalised compound of lexicon nouns
  morphology: 'seed-only', // case/gender for the listed articles, possessives, nouns; ambiguous forms report a union, not a guess
  phraseDetection: 'seed-only',
  productionChecks: 'limited',
  limitations: [
    'Lemmatization is seed-only: the lexicon covers the bundled corpus, so supplied texts will have unanalysed words.',
    'Compound decomposition is a low-confidence rule that only fires when every part is a lexicon noun.',
    'Separable-prefix detection covers anfangen (an); other separable verbs are not analysed.',
    'Adjective endings and verb paradigms outside the lexicon are not analysed.',
    'Production checks: noun capitalisation, dative article after a dative preposition, verb-second after a fronted adverb — only for lexicon words.',
  ],
};

export const deAdapter: LanguageAdapter = {
  lang: LANG,
  name: 'German',
  script: 'Latn',
  version: VERSION,
  support: SUPPORT,

  segmentSentences: (text) =>
    splitSentences(text, { terminators: '.!?…', ordinalDot: true, abbreviations: ['dr', 'nr', 'usw', 'bzw', 'ca', 'vgl', 'etc', 'str', 'prof', 'ggf', 'evtl'] }),
  tokenize: makeWordTokenizer({ locale: 'de', normalize }),
  normalize,
  /** Keeps umlauts (ü ≠ u): they distinguish words. */
  searchNormalize: (q) => normalize(q).trim(),

  analyze: (tokens) => lexiconAnalyze(tokens, deLexicon, ANALYZER, { unknown: unknownWord, contextual }),

  detectPhrases: (tokens, analyses) => matchPhraseRules(tokens, analyses, PHRASES, normalize),

  detectPatterns(tokens, analyses): PatternCandidate[] {
    const out: PatternCandidate[] = [];
    // separable prefix verb
    analyses.forEach((a, j) => {
      const c = a.candidates[0];
      const v = c?.notes?.particleOf;
      if (typeof v === 'string') {
        out.push({
          key: 'separable-prefix-verb', title: 'Separable-prefix verb', confidence: c.confidence, tokenIndexes: [Number(v), j],
          explanation: 'The prefix splits off and goes to the end of the clause: anfangen → "Ich fing an, …". Look for the verb and its prefix together.',
        });
      }
    });
    // verb-final subordinate clause
    tokens.forEach((t, i) => {
      if (!SUBORDINATORS.has(t.normalized) || !t.isWord) return;
      let end = i + 1;
      while (end < tokens.length && tokens[end].surface !== ',' && !/^[.!?…]$/.test(tokens[end].surface)) end++;
      const last = end - 1;
      if (last > i && hasPos(analyses[last], 'VERB', 'AUX')) {
        out.push({
          key: 'verb-final-subordinate', title: 'Subordinate clause: verb last', confidence: 0.85, tokenIndexes: [i, last],
          explanation: 'After als / dass / warum / wenn the conjugated verb moves to the end of its clause.',
        });
      }
    });
    // dative after preposition
    tokens.forEach((t, i) => {
      if (!DATIVE_PREPS.has(t.normalized)) return;
      const next = analyses[i + 1]?.candidates[0];
      if (next && (next.morph.Case ?? '').split(',').includes('Dat') && ['DET', 'ADJ'].includes(next.pos ?? '')) {
        out.push({
          key: 'dative-after-preposition', title: 'Dative after the preposition', confidence: 0.75, tokenIndexes: [i, i + 1],
          explanation: 'mit, von, zu, aus, bei, nach, seit always take the dative case: von ganzem Herzen.',
        });
      }
    });
    return out;
  },

  pronunciation(token): PronunciationSupport {
    const s = token.normalized;
    const notes: string[] = [];
    if (/ch/.test(s)) notes.push('ch: after a, o, u, au it is a back "ach" sound; after other vowels and consonants a front "ich" sound.');
    if (/sch/.test(s)) notes.push('sch is like English sh.');
    if (/^(sp|st)/.test(s)) notes.push('At the start of a word, sp/st are pronounced shp/sht.');
    if (/[äöü]/.test(s)) notes.push('ä, ö, ü are distinct vowels (umlauts); they change the word.');
    if (/ß/.test(s)) notes.push('ß is a sharp s (ss).');
    if (/(?<!e)i?e(?!i)/.test(s) && /ie/.test(s)) notes.push('ie is a long "ee".');
    if (/ei/.test(s)) notes.push('ei sounds like English "eye".');
    if (/w/.test(s)) notes.push('w is pronounced like English v; v is usually f.');
    if (/z/.test(s)) notes.push('z is pronounced ts.');
    return { notes };
  },

  speechNormalize: (text) =>
    speechNormalizeGeneric(text, {
      tool: `speech-${LANG}@1`,
      numberToWords: deNumberToWords,
      percentWord: 'Prozent',
      skipOrdinalDot: true,
      abbreviations: [
        { pattern: /\bz\.\s?B\./gu, replacement: 'zum Beispiel', label: 'z. B.' },
        { pattern: /\bd\.\s?h\./gu, replacement: 'das heißt', label: 'd. h.' },
        { pattern: /\busw\./gu, replacement: 'und so weiter', label: 'usw.' },
        { pattern: /\bbzw\./gu, replacement: 'beziehungsweise', label: 'bzw.' },
        { pattern: /\bca\./gu, replacement: 'circa', label: 'ca.' },
        { pattern: /\bDr\./gu, replacement: 'Doktor', label: 'Dr.' },
        { pattern: /\bNr\./gu, replacement: 'Nummer', label: 'Nr.' },
      ],
    }),

  display: { wordSeparator: ' ', showBoundariesOnHighlight: false, fontFamily: 'Georgia, "Times New Roman", serif', lineHeight: 1.7 },

  checkProduction(tokens, analyses, _sentence): ErrorCandidate[] {
    const out: ErrorCandidate[] = [];

    // nouns are capitalised
    tokens.forEach((t, i) => {
      const cands = analyses[i]?.candidates ?? [];
      if (!t.isWord || !cands.length || !cands.every((c) => c.pos === 'NOUN' || c.pos === 'PROPN')) return;
      if (t.surface[0] === t.surface[0].toLowerCase() && t.surface[0] !== t.surface[0].toUpperCase()) {
        out.push({
          category: 'spelling', tokenIndexes: [i], confidence: 0.85, affectsMeaning: false,
          message: 'German nouns are written with a capital letter.',
          suggestion: { start: t.start, end: t.end, replacement: t.surface[0].toUpperCase() + t.surface.slice(1) },
        });
      }
    });

    // article after a dative preposition
    tokens.forEach((t, i) => {
      if (!DATIVE_PREPS.has(t.normalized)) return;
      const art = analyses[i + 1]?.candidates[0];
      const noun = analyses[i + 2]?.candidates[0];
      if (!art || art.pos !== 'DET' || !art.morph.Case) return;
      if (art.morph.Case.split(',').includes('Dat')) return;
      let suggestion: ErrorCandidate['suggestion'];
      if (noun && noun.pos === 'NOUN' && noun.morph.Gender && noun.morph.Number && !noun.morph.Number.includes(',') && !noun.morph.Gender.includes(',') && art.lemma) {
        const fix = dativeArticle(art.lemma, noun.morph.Gender, noun.morph.Number);
        if (fix) suggestion = { start: tokens[i + 1].start, end: tokens[i + 1].end, replacement: matchCase(tokens[i + 1].surface, fix) };
      }
      out.push({
        category: 'case', tokenIndexes: [i, i + 1], confidence: suggestion ? 0.8 : 0.6, affectsMeaning: false,
        message: `"${t.surface}" takes the dative: "${tokens[i + 1].surface}" is not a dative form.`,
        suggestion,
      });
    });

    // verb-second: fronted adverb + subject pronoun + finite verb → verb must come second
    if (tokens.length >= 3 && FRONT_ADVERBS.has(tokens[0].normalized) && NOM_PRONOUNS.has(tokens[1].normalized)) {
      const v = analyses[2]?.candidates[0];
      if (v && (v.pos === 'VERB' || v.pos === 'AUX') && v.morph.Person) {
        const last = tokens[2];
        out.push({
          category: 'word-order', tokenIndexes: [0, 1, 2], confidence: 0.7, affectsMeaning: false,
          message: 'In a main clause the conjugated verb is the second element: "Jetzt glaube ich".',
          suggestion: { start: tokens[0].start, end: last.end, replacement: `${tokens[0].surface} ${last.surface} ${tokens[1].surface}` },
        });
      }
    }
    return out;
  },

  relate(a, b) {
    const na = normalize(a), nb = normalize(b);
    if (na === nb) return 'same';
    const la = deLexicon.lemmasOf(na), lb = new Set(deLexicon.lemmasOf(nb));
    if (la.some((l) => lb.has(l))) return 'inflection';
    const ca = decompose(na), cb = decompose(nb);
    const lemmasB = new Set([nb, ...deLexicon.lemmasOf(nb).map(normalize)]);
    const lemmasA = new Set([na, ...deLexicon.lemmasOf(na).map(normalize)]);
    if (ca && ca.some((p) => lemmasB.has(p))) return 'component';
    if (cb && cb.some((p) => lemmasA.has(p))) return 'component';
    return 'none';
  },
};

// ── numbers 0–999 999 ──
const U = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
const T: Record<number, string> = { 2: 'zwanzig', 3: 'dreißig', 4: 'vierzig', 5: 'fünfzig', 6: 'sechzig', 7: 'siebzig', 8: 'achtzig', 9: 'neunzig' };

function below100(n: number): string {
  if (n < 20) return U[n];
  const u = n % 10;
  const t = T[Math.floor(n / 10)];
  return u ? `${u === 1 ? 'ein' : U[u]}und${t}` : t;
}
function below1000(n: number): string {
  if (n < 100) return below100(n);
  const h = Math.floor(n / 100);
  const r = n % 100;
  return `${h === 1 ? 'ein' : U[h]}hundert${r ? below100(r) : ''}`;
}

export function deNumberToWords(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 999999) return null;
  if (n < 1000) return below1000(n);
  const th = Math.floor(n / 1000);
  const r = n % 1000;
  const head = `${th === 1 ? 'ein' : below1000(th).replace(/eins$/, 'ein')}tausend`;
  return r ? `${head}${below1000(r)}` : head;
}
