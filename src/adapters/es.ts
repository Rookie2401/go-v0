/**
 * Spanish adapter. NFC + lower-case identity, accents preserved (entendía ≠ entendia).
 * Confident: lexicon forms of the course vocabulary (incl. conjugation paradigms of the fixture verbs),
 * gender/number of lexicon nouns and articles, enclitic pronouns on lexicon infinitives.
 * Uncertain / out of scope: unknown words (empty candidates), gerund/imperative clitics (dámelo),
 * syntactic disambiguation beyond the lexicon ("la" is article only here).
 */
import type {
  AnalysisCandidate, AnalyzedToken, ErrorCandidate, LanguageAdapter, PatternCandidate, PhraseCandidate,
  PronunciationSupport, RawToken, AdapterSupport } from '../core';
import {
  E, Lexicon, hasLemma, hasPos, lexiconAnalyze, makeWordTokenizer, matchCase, matchPhraseRules,
  nfc, speechNormalizeGeneric, splitSentences, stripMarks, type PhraseRule,
} from './shared';

const LANG = 'es' as const;
const VERSION = '1';
const ANALYZER = `adapter-${LANG}@${VERSION}`;

const normalize = (s: string) => nfc(s).toLocaleLowerCase('es');

// ── lexicon (tiny: what the bundled corpus and the tests need) ──
const ENTRIES = [
  // verbs
  E('ser', 'AUX', 'to be (essence)', ['ser:inf', 'soy:1s pres', 'eres:2s pres', 'es:3s pres', 'era:1s impf', 'era:3s impf']),
  E('estar', 'AUX', 'to be (state/location)', ['estar:inf', 'estoy:1s pres', 'estás:2s pres', 'está:3s pres']),
  E('tener', 'VERB', 'to have', ['tener:inf', 'tengo:1s pres', 'tienes:2s pres', 'tiene:3s pres', 'tenemos:1p pres', 'tenía:1s impf', 'tenía:3s impf', 'tenga:1s subj', 'tenga:3s subj']),
  E('haber', 'AUX', 'to have (auxiliary)', ['haber:inf', 'he:1s pres', 'ha:3s pres']),
  E('entender', 'VERB', 'to understand', ['entender:inf', 'entiendo:1s pres', 'entiendes:2s pres', 'entiende:3s pres', 'entendía:1s impf', 'entendía:3s impf', 'entendí:1s pret', 'entendió:3s pret']),
  E('creer', 'VERB', 'to believe', ['creer:inf', 'creo:1s pres', 'crees:2s pres', 'cree:3s pres', 'creía:1s impf', 'creía:3s impf']),
  E('perdonar', 'VERB', 'to forgive', ['perdonar:inf', 'perdono:1s pres', 'perdona:3s pres', 'perdona:2s imper', 'perdonó:3s pret', 'perdone:1s subj', 'perdone:3s subj']),
  E('empezar', 'VERB', 'to begin', ['empezar:inf', 'empiezo:1s pres', 'empieza:3s pres', 'empecé:1s pret']),
  E('amar', 'VERB', 'to love', ['amar:inf', 'amo:1s pres', 'ama:3s pres', 'amó:3s pret']),
  E('querer', 'VERB', 'to want', ['querer:inf', 'quiero:1s pres', 'quiere:3s pres']),
  E('decir', 'VERB', 'to say', ['decir:inf', 'dijéremos:1p fsub']),
  E('engañar', 'VERB', 'to deceive', ['engañar:inf', 'engañamos:1p pres']),
  E('confesar', 'VERB', 'to confess', ['confesar:inf', 'confesamos:1p pres', 'confesáremos:1p fsub']),
  E('limpiar', 'VERB', 'to cleanse', ['limpiar:inf', 'limpie:3s subj']),
  E('perder', 'VERB', 'to lose, perish', ['perder:inf', 'pierda:3s subj', 'pierde:3s pres']),
  E('dar', 'VERB', 'to give', ['dar:inf', 'da:3s pres', 'dado:ptcp m sg']),
  // nouns
  E('pecado', 'NOUN', 'sin', ['pecado:m sg', 'pecados:m pl']),
  E('corazón', 'NOUN', 'heart', ['corazón:m sg', 'corazones:m pl']),
  E('Dios', 'PROPN', 'God', ['Dios:m sg']),
  E('día', 'NOUN', 'day', ['día:m sg', 'días:m pl']),
  E('año', 'NOUN', 'year', ['año:m sg', 'años:m pl']),
  E('mundo', 'NOUN', 'world', ['mundo:m sg']),
  E('paz', 'NOUN', 'peace', ['paz:f sg']),
  E('cosa', 'NOUN', 'thing', ['cosa:f sg', 'cosas:f pl']),
  E('verdad', 'NOUN', 'truth', ['verdad:f sg']),
  E('maldad', 'NOUN', 'wickedness', ['maldad:f sg']),
  E('vida', 'NOUN', 'life', ['vida:f sg']),
  E('manera', 'NOUN', 'manner, way', ['manera:f sg']),
  E('hijo', 'NOUN', 'son', ['hijo:m sg', 'hijos:m pl']),
  E('casa', 'NOUN', 'house', ['casa:f sg', 'casas:f pl']),
  E('libro', 'NOUN', 'book', ['libro:m sg', 'libros:m pl']),
  E('Ana', 'PROPN', 'Ana (name)'), E('Pedro', 'PROPN', 'Pedro (name)'),
  // pronouns / determiners
  E('yo', 'PRON', 'I', ['yo:1s nom prs']),
  E('tú', 'PRON', 'you (informal)', ['tú:2s nom prs']),
  E('él', 'PRON', 'he, him', ['él:3s m prs']),
  E('nosotros', 'PRON', 'we', ['nosotros:1p m nom prs']),
  E('nos', 'PRON', 'us (clitic)', ['nos:1p acc dat prs']),
  E('se', 'PRON', 'oneself (reflexive clitic)', ['se:prs']),
  E('qué', 'PRON', 'what', ['qué:int']),
  E('cómo', 'ADV', 'how', ['cómo:int']),
  E('aquel', 'PRON', 'that one', ['aquel:m sg dem']),
  E('el', 'DET', 'the', ['el:m sg def art']),
  E('la', 'DET', 'the', ['la:f sg def art']),
  E('los', 'DET', 'the', ['los:m pl def art']),
  E('las', 'DET', 'the', ['las:f pl def art']),
  E('un', 'DET', 'a, an', ['un:m sg indef art']),
  E('una', 'DET', 'a, an', ['una:f sg indef art']),
  E('unos', 'DET', 'some', ['unos:m pl indef art']),
  E('unas', 'DET', 'some', ['unas:f pl indef art']),
  E('mi', 'DET', 'my', ['mi:sg poss', 'mis:pl poss']),
  E('su', 'DET', 'his/her/their', ['su:sg poss', 'sus:pl poss']),
  E('nuestro', 'DET', 'our', ['nuestro:m sg poss', 'nuestros:m pl poss', 'nuestra:f sg poss', 'nuestras:f pl poss']),
  E('todo', 'DET', 'all, every', ['todo:m sg', 'toda:f sg', 'todos:m pl', 'todas:f pl']),
  E('mismo', 'ADJ', 'same, -self', ['mismo:m sg', 'mismos:m pl']),
  // adjectives / adverbs
  E('joven', 'ADJ', 'young', ['joven:sg']),
  E('fiel', 'ADJ', 'faithful', ['fiel:sg']),
  E('justo', 'ADJ', 'righteous, just', ['justo:m sg']),
  E('eterno', 'ADJ', 'eternal', ['eterno:m sg', 'eterna:f sg']),
  E('unigénito', 'ADJ', 'only-begotten', ['unigénito:m sg']),
  E('tal', 'ADJ', 'such', ['tal:sg']),
  E('no', 'ADV', 'not', ['no:neg']),
  E('ahora', 'ADV', 'now'),
  E('también', 'ADV', 'also'),
  E('bien', 'ADV', 'well'),
  E('sí', 'INTJ', 'yes'),
  E('hola', 'INTJ', 'hello'),
  E('gracias', 'INTJ', 'thank you'),
  // function words
  E('a', 'ADP', 'to, at (personal a)', ['a', 'á']),
  E('al', 'ADP', 'to the (a + el)', ['al'], { notes: { components: ['a', 'el'] } }),
  E('del', 'ADP', 'of the (de + el)', ['del'], { notes: { components: ['de', 'el'] } }),
  E('en', 'ADP', 'in, on'),
  E('con', 'ADP', 'with'),
  E('por', 'ADP', 'by, for'),
  E('para', 'ADP', 'for, in order to'),
  E('de', 'ADP', 'of, from'),
  E('y', 'CONJ', 'and'),
  E('pero', 'CONJ', 'but'),
  E('mas', 'CONJ', 'but (literary)'),
  E('si', 'SCONJ', 'if'),
  E('que', 'SCONJ', 'that'),
  E('porque', 'SCONJ', 'because, for'),
  E('cuando', 'SCONJ', 'when'),
  E('uno', 'NUM', 'one', ['uno:m sg']),
  E('dos', 'NUM', 'two'),
  E('tres', 'NUM', 'three'), E('cuatro', 'NUM', 'four'), E('cinco', 'NUM', 'five'), E('seis', 'NUM', 'six'),
  E('siete', 'NUM', 'seven'), E('ocho', 'NUM', 'eight'), E('nueve', 'NUM', 'nine'), E('diez', 'NUM', 'ten'),
  E('doce', 'NUM', 'twelve'), E('veinte', 'NUM', 'twenty'), E('treinta', 'NUM', 'thirty'),
];

/** Value of the lexicon numerals (for "number above one takes a plural noun"). */
const NUMERAL_VALUE: Record<string, number> = {
  uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, doce: 12, veinte: 20, treinta: 30,
};
export const esLexicon = new Lexicon(ENTRIES, normalize);

const CLITICS = ['me', 'te', 'lo', 'la', 'los', 'las', 'le', 'les', 'nos', 'se'];

function splitClitics(normalized: string): { stem: string; clitics: string[] } | undefined {
  // peel clitics from the right, longest first, at most two (entenderlo, entendernos → entender + nos)
  const clitics: string[] = [];
  let rest = normalized;
  for (let n = 0; n < 2; n++) {
    const c = [...CLITICS].sort((a, b) => b.length - a.length).find((x) => rest.length > x.length + 2 && rest.endsWith(x));
    if (!c) break;
    clitics.unshift(c);
    rest = rest.slice(0, -c.length);
    if (esLexicon.lookup(rest).some((h) => h.form.morph.VerbForm === 'Inf')) return { stem: rest, clitics };
  }
  return undefined;
}

function unknownWord(token: RawToken, _i: number, _tokens: RawToken[], lex: Lexicon): AnalysisCandidate[] {
  const sp = splitClitics(token.normalized);
  if (!sp) return [];
  const hit = lex.lookup(sp.stem).find((h) => h.form.morph.VerbForm === 'Inf');
  if (!hit) return [];
  return [{
    lemma: hit.entry.lemma, pos: 'VERB', morph: { VerbForm: 'Inf' }, gloss: hit.entry.gloss, confidence: 0.85,
    notes: { stem: sp.stem, clitics: sp.clitics, source: 'rule' },
  }];
}

// ── phrases ──
const PHRASES: PhraseRule[] = [
  { pattern: ['cuando', 'ser', 'joven'], display: 'cuando era joven', gloss: 'when I was young', kind: 'formula',
    variants: [['cuando', { gap: 1, only: ['PRON'] }, 'ser', 'joven']] },
  { pattern: ['empezar', 'a', 'entender'], display: 'empezar a entender', gloss: 'to begin to understand', kind: 'construction',
    variants: [['empezar', 'a', 'entender']] },
  { pattern: ['creer', 'en', '_'], display: 'creer en …', gloss: 'to believe in (someone)', kind: 'frame',
    variants: [['creer', 'en', { slot: true }], ['en', { slot: true, pos: ['PRON', 'PROPN'] }, 'creer']] },
];

const DET_NOUN_GUARD = /^h?á?a/u; // el agua, el alma: feminine nouns with stressed a- take "el"

function articleFor(defn: string, gender: string, number: string): string | undefined {
  for (const e of esLexicon.entries) {
    if (e.pos !== 'DET') continue;
    const f = e.forms.find((x) => x.morph.PronType === 'Art' && x.morph.Definite === defn && x.morph.Gender === gender && x.morph.Number === number);
    if (f) return f.form;
  }
  return undefined;
}

const SUPPORT: AdapterSupport = {
  tokenization: 'dependable', // Intl.Segmenter('es'); every token slices the input exactly
  sentenceSegmentation: 'limited', // terminators + a short abbreviation list; an unlisted abbreviation ("Av.") can split a sentence
  lemmatization: 'seed-only', // the lexicon covers the seed corpus only; any other word is left unanalysed (empty candidates), never guessed
  morphology: 'seed-only', // person/number/tense only for the paradigms listed in the lexicon
  phraseDetection: 'seed-only', // three course phrases (cuando era joven, empezar a entender, creer en …)
  productionChecks: 'limited',
  limitations: [
    'Lemmatization is seed-only: the lexicon covers the bundled corpus, so supplied texts will have unanalysed words.',
    'Historical Scripture forms outside the lexicon (á for a, dijéremos, engañamos are listed; others are not) stay unanalysed.',
    'Clitics are split only on lexicon infinitives (entenderlo); gerund and imperative clitics (dámelo) are not analysed.',
    'Production checks: article–noun agreement, de/a + el contraction, yo + conjugation (third-person verb or infinitive), and number above one + singular noun — only for lexicon words.',
    'Sentence splitting does not know every abbreviation.',
  ],
};

export const esAdapter: LanguageAdapter = {
  lang: LANG,
  name: 'Spanish',
  script: 'Latn',
  version: VERSION,
  support: SUPPORT,

  segmentSentences: (text) =>
    splitSentences(text, { terminators: '.!?…', abbreviations: ['sr', 'sra', 'srta', 'dr', 'dra', 'etc', 'pág', 'pp', 'ud', 'uds', 'vs'] }),
  tokenize: makeWordTokenizer({ locale: 'es', normalize }),
  normalize,
  /** Accent-insensitive (people type "corazon") but ñ stays distinct from n. */
  searchNormalize: (q) => {
    const s = normalize(q).replace(/ñ/g, '\u0001');
    return stripMarks(s).replace(/\u0001/g, 'ñ').trim();
  },

  analyze: (tokens): AnalyzedToken[] => lexiconAnalyze(tokens, esLexicon, ANALYZER, { unknown: unknownWord }),

  detectPhrases(tokens, analyses): PhraseCandidate[] {
    return matchPhraseRules(tokens, analyses, PHRASES, normalize);
  },

  detectPatterns(tokens, analyses): PatternCandidate[] {
    const out: PatternCandidate[] = [];
    analyses.forEach((a, i) => {
      const c = a.candidates[0];
      if (!c) return;
      if (c.pos && ['VERB', 'AUX'].includes(c.pos) && c.morph.Tense === 'Imp') {
        out.push({ key: 'imperfect', title: 'Imperfect (pretérito imperfecto)', confidence: c.confidence, tokenIndexes: [i],
          explanation: 'Describes how things used to be or were ongoing in the past: "cuando era joven…", "no entendía".' });
      }
      if (c.pos && ['VERB', 'AUX'].includes(c.pos) && c.morph.Tense === 'Past' && c.morph.Aspect === 'Perf') {
        out.push({ key: 'preterite', title: 'Preterite (pretérito indefinido)', confidence: c.confidence, tokenIndexes: [i],
          explanation: 'A completed event in the past: "empecé a entender", "Dios perdonó".' });
      }
      if (c.notes?.clitics) {
        out.push({ key: 'enclitic-pronoun', title: 'Pronoun attached to the infinitive', confidence: c.confidence, tokenIndexes: [i],
          explanation: 'Object pronouns attach to the end of an infinitive: entender + lo → entenderlo.' });
      }
      if (normalize(tokens[i].surface) === 'a' && i > 0 && hasPos(analyses[i - 1], 'VERB') && i + 1 < tokens.length &&
        (hasPos(analyses[i + 1], 'PROPN') || hasLemma(analyses[i + 1], 'todo'))) {
        out.push({ key: 'personal-a', title: 'Personal "a"', confidence: 0.8, tokenIndexes: [i - 1, i, i + 1],
          explanation: 'Spanish marks a person as direct object with "a": amo a Dios, perdona a todos.' });
      }
    });
    return out;
  },

  pronunciation(token, analysis): PronunciationSupport {
    const s = token.normalized;
    const notes: string[] = [];
    if (/[áéíóú]/.test(s)) notes.push('Stress falls on the accented vowel.');
    else if (/[aeiouns]$/.test(s)) notes.push('No accent mark: stress is on the next-to-last syllable.');
    else notes.push('No accent mark: stress is on the last syllable.');
    if (/(?<!c)h/.test(s)) notes.push('h is silent.');
    if (/ll/.test(s)) notes.push('ll sounds like y in most of Latin America.');
    if (/ñ/.test(s)) notes.push('ñ is like "ny" in canyon.');
    if (/ce|ci|z/.test(s)) notes.push('c (before e/i) and z are pronounced like s in Latin America.');
    if (/j|g[ei]/.test(s)) notes.push('j and g (before e/i) are a breathy h-like sound.');
    if (/qu/.test(s)) notes.push('qu is a k sound; the u is silent.');
    void analysis;
    return { notes };
  },

  speechNormalize: (text, opts) => {
    void opts; // verse markers are stripped in every mode: they are never spoken
    return speechNormalizeGeneric(text, {
      tool: `speech-${LANG}@1`,
      numberToWords: esNumberToWords,
      percentWord: 'por ciento',
      abbreviations: [
        { pattern: /\bSra\./gu, replacement: 'señora', label: 'Sra.' },
        { pattern: /\bSr\./gu, replacement: 'señor', label: 'Sr.' },
        { pattern: /\bDra\./gu, replacement: 'doctora', label: 'Dra.' },
        { pattern: /\bDr\./gu, replacement: 'doctor', label: 'Dr.' },
        { pattern: /\betc\./gu, replacement: 'etcétera', label: 'etc.' },
      ],
    });
  },

  display: { wordSeparator: ' ', showBoundariesOnHighlight: false, fontFamily: 'Georgia, "Times New Roman", serif', lineHeight: 1.7 },

  checkProduction(tokens, analyses, _sentence): ErrorCandidate[] {
    const out: ErrorCandidate[] = [];
    for (let i = 0; i < tokens.length - 1; i++) {
      const a = analyses[i]?.candidates[0];
      const b = analyses[i + 1]?.candidates[0];
      if (!tokens[i].isWord || !tokens[i + 1].isWord) continue;

      // contraction: de el → del, a el → al
      if (tokens[i + 1].normalized === 'el' && ['de', 'a'].includes(tokens[i].normalized)) {
        out.push({
          category: 'morphology', tokenIndexes: [i, i + 1], confidence: 0.9, affectsMeaning: false,
          message: `"${tokens[i].normalized} el" contracts to "${tokens[i].normalized === 'de' ? 'del' : 'al'}".`,
          suggestion: { start: tokens[i].start, end: tokens[i + 1].end, replacement: matchCase(tokens[i].surface, tokens[i].normalized === 'de' ? 'del' : 'al') },
        });
        continue;
      }

      // article–noun agreement
      if (a?.pos === 'DET' && a.morph.PronType === 'Art' && b?.pos === 'NOUN' && !`${a.morph.Gender}${a.morph.Number}${b.morph.Gender}${b.morph.Number}`.includes(',')) {
        const mismatch = (a.morph.Gender && b.morph.Gender && a.morph.Gender !== b.morph.Gender) || (a.morph.Number && b.morph.Number && a.morph.Number !== b.morph.Number);
        const exempt = b.morph.Gender === 'Fem' && b.morph.Number === 'Sing' && DET_NOUN_GUARD.test(tokens[i + 1].normalized);
        if (mismatch && !exempt) {
          const fix = articleFor(a.morph.Definite, b.morph.Gender, b.morph.Number);
          out.push({
            category: 'agreement', tokenIndexes: [i, i + 1], confidence: 0.85, affectsMeaning: false,
            message: `The article should agree with the noun: "${tokens[i + 1].surface}" is ${b.morph.Gender === 'Fem' ? 'feminine' : 'masculine'} ${b.morph.Number === 'Plur' ? 'plural' : 'singular'}.`,
            suggestion: fix ? { start: tokens[i].start, end: tokens[i].end, replacement: matchCase(tokens[i].surface, fix) } : undefined,
          });
        }
      }

      // yo + verb that is not first person
      if (tokens[i].normalized === 'yo') {
        const j = tokens[i + 1].normalized === 'no' ? i + 2 : i + 1;
        const v = analyses[j]?.candidates[0];
        const entry = v?.lemma ? esLexicon.find(v.lemma) : undefined;
        const isVerb = !!v && (v.pos === 'VERB' || v.pos === 'AUX') && !!tokens[j]?.isWord;
        if (isVerb && v.morph.Person && !v.morph.Person.split(',').includes('1') && v.morph.Number === 'Sing') {
          // "yo tiene" → "yo tengo": third-person verb after yo
          const want: Record<string, string> = { Person: '1', Number: 'Sing' };
          for (const k of ['Tense', 'Mood'] as const) if (v.morph[k] && !v.morph[k].includes(',')) want[k] = v.morph[k];
          const fix = entry ? esLexicon.formWith(entry, want) : undefined;
          out.push({
            category: 'conjugation', tokenIndexes: [i, j], confidence: fix ? 0.8 : 0.65, affectsMeaning: false,
            message: '"yo" takes the first-person verb form.',
            suggestion: fix ? { start: tokens[j].start, end: tokens[j].end, replacement: matchCase(tokens[j].surface, fix.form) } : undefined,
          });
        } else if (isVerb && v.morph.VerbForm === 'Inf' && !v.notes?.clitics) {
          // "Yo creer" → "Yo creo": a bare infinitive after yo (only when the verb is in the lexicon)
          const fix = entry ? esLexicon.formWith(entry, { Person: '1', Number: 'Sing', Tense: 'Pres', Mood: 'Ind' }) : undefined;
          out.push({
            category: 'conjugation', tokenIndexes: [i, j], confidence: fix ? 0.8 : 0.65, affectsMeaning: false,
            message: '"yo" needs a conjugated verb, not the infinitive: "yo creo", not "yo creer".',
            suggestion: fix ? { start: tokens[j].start, end: tokens[j].end, replacement: matchCase(tokens[j].surface, fix.form) } : undefined,
          });
        }
      }
    }

    // number above one + singular noun → plural ("cinco año" → "cinco años"); only when the lexicon has the plural
    for (let i = 0; i < tokens.length - 1; i++) {
      const digits = !tokens[i].isWord && /^\p{Nd}+$/u.test(tokens[i].surface);
      const n = digits ? Number(tokens[i].surface) : tokens[i].isWord && analyses[i]?.candidates[0]?.pos === 'NUM' ? NUMERAL_VALUE[tokens[i].normalized] : undefined;
      if (n === undefined || !(n > 1)) continue;
      const b = analyses[i + 1]?.candidates[0];
      if (!tokens[i + 1].isWord || b?.pos !== 'NOUN' || b.morph.Number !== 'Sing' || !b.lemma) continue;
      const entry = esLexicon.find(b.lemma, 'NOUN');
      const plural = entry ? esLexicon.formWith(entry, { Number: 'Plur' }) : undefined;
      if (!plural) continue;
      out.push({
        category: 'agreement', tokenIndexes: [i, i + 1], confidence: 0.85, affectsMeaning: false,
        message: `After a number above one the noun is plural: "${plural.form}".`,
        suggestion: { start: tokens[i + 1].start, end: tokens[i + 1].end, replacement: matchCase(tokens[i + 1].surface, plural.form) },
      });
    }
    return out;
  },

  relate(a, b) {
    const na = normalize(a), nb = normalize(b);
    if (na === nb) return 'same';
    const la = new Set([...esLexicon.lemmasOf(na), ...(splitClitics(na) ? [esLexicon.lookup(splitClitics(na)!.stem)[0]?.entry.lemma] : [])].filter(Boolean));
    const lb = new Set([...esLexicon.lemmasOf(nb), ...(splitClitics(nb) ? [esLexicon.lookup(splitClitics(nb)!.stem)[0]?.entry.lemma] : [])].filter(Boolean));
    for (const l of la) if (lb.has(l)) return 'inflection';
    return 'none';
  },
};

// ── numbers 0–999 999 ──
const U = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const T: Record<number, string> = { 3: 'treinta', 4: 'cuarenta', 5: 'cincuenta', 6: 'sesenta', 7: 'setenta', 8: 'ochenta', 9: 'noventa' };
const H = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function below1000(n: number): string {
  if (n < 30) return U[n];
  if (n < 100) { const u = n % 10; return T[Math.floor(n / 10)] + (u ? ` y ${U[u]}` : ''); }
  if (n === 100) return 'cien';
  const r = n % 100;
  return H[Math.floor(n / 100)] + (r ? ` ${below1000(r)}` : '');
}

export function esNumberToWords(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 999999) return null;
  if (n < 1000) return below1000(n);
  const th = Math.floor(n / 1000);
  const r = n % 1000;
  const head = th === 1 ? 'mil' : `${below1000(th).replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un')} mil`;
  return r ? `${head} ${below1000(r)}` : head;
}
