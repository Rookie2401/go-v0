/**
 * Albanian adapter. NFC + lower-case identity; ë/ç are kept (they distinguish words).
 * Confident: lexicon nouns with definiteness (Definite=Def/Ind) and case, verbs listed under their 1sg-present
 * lemma, possessives. Uncertain: the very ambiguous function words e / i / të / më are resolved only from the
 * next word (verb ⇒ clitic/particle, adjective ⇒ linking article); when context is thin they stay ambiguous
 * with low confidence. Unknown words: no candidates.
 */
import type { AnalysisCandidate, ErrorCandidate, LanguageAdapter, PatternCandidate, PronunciationSupport, RawToken, AdapterSupport } from '../core';
import {
  E, Lexicon, hasPos, lexiconAnalyze, makeWordTokenizer, matchPhraseRules, nfc, speechNormalizeGeneric,
  splitSentences, type PhraseRule,
} from './shared';

const LANG = 'sq' as const;
const VERSION = '1';
const ANALYZER = `adapter-${LANG}@${VERSION}`;

const normalize = (s: string) => nfc(s).toLocaleLowerCase('sq');

const ENTRIES = [
  // verbs — lemma = 1sg present
  E('jam', 'AUX', 'to be', ['jam:1s pres', 'je:2s pres', 'është:3s pres', 'isha:1s impf', 'ishte:3s impf', 'qoftë:3s subj']),
  E('kam', 'VERB', 'to have', ['kam:1s pres', 'ka:3s pres', 'kemi:1p pres', 'kisha:1s impf', 'ketë:3s subj']),
  E('kuptoj', 'VERB', 'to understand', ['kuptoj:1s pres', 'kuptoj:1s subj', 'kupton:2s pres', 'kupton:3s pres', 'kuptoja:1s impf']),
  E('besoj', 'VERB', 'to believe', ['besoj:1s pres', 'besoj:1s subj', 'beson:2s pres', 'beson:3s pres', 'besoja:1s impf']),
  E('filloj', 'VERB', 'to begin', ['filloj:1s pres', 'fillova:1s pret']),
  E('fal', 'VERB', 'to forgive', ['fal:1s pres', 'fal:3s pres', 'fali:3s pret', 'falë:3s subj']),
  E('dua', 'VERB', 'to love, to want', ['dua:1s pres', 'do:3s pres', 'deshi:3s pret']),
  E('them', 'VERB', 'to say', ['themi:1p pres']),
  E('mashtroj', 'VERB', 'to deceive', ['mashtrojmë:1p pres']),
  E('rrëfej', 'VERB', 'to confess', ['rrëfejmë:1p pres']),
  E('pastroj', 'VERB', 'to cleanse', ['pastrojë:3s subj']),
  E('humbas', 'VERB', 'to lose, perish', ['humbasë:3s subj']),
  E('jap', 'VERB', 'to give', ['dha:3s pret']),
  // nouns (Definite=Ind/Def = the "article" ending)
  E('mëkat', 'NOUN', 'sin', ['mëkat:m sg indef nom acc', 'mëkati:m sg def nom', 'mëkatin:m sg def acc', 'mëkatet:m pl def nom acc', 'mëkate:m pl indef nom acc']),
  E('zemër', 'NOUN', 'heart', ['zemër:f sg indef nom acc', 'zemra:f sg def nom', 'zemrën:f sg def acc']),
  E('Perëndi', 'PROPN', 'God', ['Perëndi:f sg indef nom acc', 'Perëndia:f sg def nom', 'Perëndinë:f sg def acc']),
  E('botë', 'NOUN', 'world', ['botë:f sg indef nom acc', 'bota:f sg def nom', 'botën:f sg def acc']),
  E('ditë', 'NOUN', 'day', ['ditë:f sg indef nom acc', 'dita:f sg def nom', 'ditën:f sg def acc']),
  E('paqe', 'NOUN', 'peace', ['paqe:f sg indef nom acc', 'paqja:f sg def nom', 'paqen:f sg def acc']),
  E('jetë', 'NOUN', 'life', ['jetë:f sg indef nom acc', 'jeta:f sg def nom', 'jetën:f sg def acc']),
  E('libër', 'NOUN', 'book', ['libër:m sg indef nom acc', 'libri:m sg def nom', 'librin:m sg def acc', 'libra:m pl indef nom acc', 'librat:m pl def nom acc']),
  E('gjë', 'NOUN', 'thing', ['gjë:f sg indef nom acc']),
  E('vërtetë', 'NOUN', 'truth', ['vërtetë:f sg indef nom acc', 'vërteta:f sg def nom']),
  E('padrejtësi', 'NOUN', 'unrighteousness', ['padrejtësi:f sg indef nom acc']),
  E('bir', 'NOUN', 'son', ['bir:m sg indef nom acc', 'biri:m sg def nom', 'birin:m sg def acc']),
  E('Ana', 'PROPN', 'Ana (name)'), E('Pavli', 'PROPN', 'Pavli (name, Paul)'),
  // adjectives
  E('ri', 'ADJ', 'young, new', ['ri:m sg']),
  E('besnik', 'ADJ', 'faithful'),
  E('drejtë', 'ADJ', 'righteous, straight'),
  E('vetëmlindur', 'ADJ', 'only-begotten'),
  E('përjetshëm', 'ADJ', 'eternal', ['përjetshme:f sg']),
  // pronouns, clitics, determiners
  E('unë', 'PRON', 'I', ['unë:1s nom prs']),
  E('ai', 'PRON', 'he', ['ai:3s m nom prs']),
  E('ne', 'PRON', 'we', ['ne:1p nom prs']),
  E('e', 'PRON', 'him/her/it (clitic, object)', ['e:3s acc prs'], { notes: { clitic: 'yes' } }),
  E('e', 'DET', 'the (linking article before noun/adjective)', ['e:art']),
  E('e', 'CONJ', 'and', ['e']),
  E('i', 'PRON', 'them / to him (clitic)', ['i:3p acc prs', 'i:3s dat prs'], { notes: { clitic: 'yes' } }),
  E('i', 'DET', '(adjective article, masc.)', ['i:m sg art']),
  E('më', 'PRON', 'me (clitic)', ['më:1s acc dat prs'], { notes: { clitic: 'yes' } }),
  E('më', 'ADV', 'more', ['më']),
  E('na', 'PRON', 'us (clitic)', ['na:1p acc dat prs'], { notes: { clitic: 'yes' } }),
  E('ma', 'PRON', 'më + e (me it)', ['ma:1s prs'], { notes: { clitic: 'yes', components: ['më', 'e'] } }),
  E('ta', 'PRON', 'të + e (you it)', ['ta:2s prs'], { notes: { clitic: 'yes', components: ['të', 'e'] } }),
  E('të', 'PART', '(subjunctive / infinitive particle)', ['të']),
  E('të', 'DET', '(adjective article before noun/adjective)', ['të:pl art']),
  E('im', 'DET', 'my', ['im:m sg poss', 'tim:m sg poss', 'ime:f sg poss', 'time:f sg poss']),
  E('ynë', 'DET', 'our', ['ynë:m sg poss', 'tonë:f sg poss', 'tona:pl poss']),
  E('tij', 'PRON', 'his', ['tij:3s m poss']),
  E('vetja', 'PRON', 'oneself', ['vetja:f sg def nom', 'veten:f sg def acc']),
  E('gjithë', 'PRON', 'all', ['gjithë:pl']),
  E('kushdo', 'PRON', 'whoever'),
  E('çdo', 'DET', 'every'),
  E('çfarë', 'PRON', 'what', ['çfarë:int']),
  E('një', 'DET', 'a, one', ['një:indef']),
  // adverbs, particles, prepositions
  E('nuk', 'ADV', 'not', ['nuk:neg']),
  E('mos', 'PART', 'not (subjunctive)', ['mos:neg']),
  E('tani', 'ADV', 'now'), E('edhe', 'ADV', 'also'), E('mirë', 'ADV', 'well, good'), E('aq', 'ADV', 'so'), E('shumë', 'ADV', 'very, much'),
  E('si', 'ADV', 'how', ['si:int']), E('pse', 'ADV', 'why', ['pse:int']),
  E('a', 'PART', '(yes/no question marker)', ['a:int']),
  E('po', 'INTJ', 'yes'), E('faleminderit', 'INTJ', 'thank you'), E('përshëndetje', 'INTJ', 'greetings, hello'),
  E('në', 'ADP', 'in, at'), E('për', 'ADP', 'for'), E('me', 'ADP', 'with'), E('nga', 'ADP', 'from'),
  E('te', 'ADP', 'to, at (before a person)'), E('tek', 'ADP', 'to, at (before a person)'),
  // conjunctions
  E('dhe', 'CONJ', 'and'), E('por', 'CONJ', 'but'),
  E('se', 'SCONJ', 'that'), E('që', 'SCONJ', 'that, who'), E('kur', 'SCONJ', 'when'), E('sepse', 'SCONJ', 'because'), E('sa', 'SCONJ', 'so that, as much as'),
];
export const sqLexicon = new Lexicon(ENTRIES, normalize);

const CLITIC_WORDS = new Set(['e', 'i', 'më', 'na', 'ma', 'ta']);

/** Next content word index after skipping clitic pronouns. */
function nextContent(tokens: RawToken[], i: number): number {
  let j = i + 1;
  while (j < tokens.length && tokens[j].isWord && CLITIC_WORDS.has(tokens[j].normalized)) j++;
  return j;
}

function contextual(i: number, tokens: RawToken[], base: AnalysisCandidate[][]): AnalysisCandidate[] {
  const cands = base[i];
  const w = tokens[i].normalized;
  if (cands.length < 2 || !['e', 'i', 'të', 'më'].includes(w)) return cands;
  const pick = (pos: string, conf: number): AnalysisCandidate[] => {
    const idx = cands.findIndex((c) => c.pos === pos);
    if (idx < 0) return cands;
    return [{ ...cands[idx], confidence: conf }, ...cands.filter((_, k) => k !== idx).map((c) => ({ ...c, confidence: Math.min(c.confidence, 0.3) }))];
  };
  const j = nextContent(tokens, i);
  const nextC = base[j] ?? [];
  const nextIsVerb = nextC.some((c) => c.pos === 'VERB' || c.pos === 'AUX');
  const nextIsNominal = nextC.some((c) => c.pos && ['NOUN', 'PROPN', 'ADJ', 'DET', 'PRON'].includes(c.pos));
  if (w === 'e') {
    if (nextIsVerb) return pick('PRON', 0.75);
    if (nextIsNominal && i > 0) return pick('DET', 0.6);
    return cands.map((c, k) => ({ ...c, confidence: k === 0 ? 0.4 : 0.3 }));
  }
  if (w === 'i') {
    if (nextIsVerb) return pick('PRON', 0.75);
    if (nextC.some((c) => c.pos === 'ADJ')) return pick('DET', 0.75);
    return cands.map((c) => ({ ...c, confidence: 0.4 }));
  }
  if (w === 'të') {
    if (nextIsVerb) return pick('PART', 0.85);
    if (nextIsNominal) return pick('DET', 0.7);
    return cands.map((c) => ({ ...c, confidence: 0.4 }));
  }
  if (w === 'më') {
    if (nextIsVerb) return pick('PRON', 0.75);
    return pick('ADV', 0.5);
  }
  return cands;
}

const PHRASES: PhraseRule[] = [
  { pattern: ['kur', 'jam', 'i', 'ri'], display: 'kur isha i ri', gloss: 'when I was young', kind: 'formula',
    variants: [['kur', 'jam', 'i', 'ri']] },
  { pattern: ['filloj', 'të', 'kuptoj'], display: 'filloj të kuptoj', gloss: 'I begin to understand', kind: 'construction',
    variants: [['filloj', 'të', 'kuptoj']] },
  { pattern: ['besoj', 'te', '_'], display: 'besoj te …', gloss: 'to believe in', kind: 'frame',
    variants: [['besoj', ['te', 'tek', 'në'], { slot: true }]] },
];

const PREPS_ACC = new Set(['në', 'me', 'për', 'nga', 'te', 'tek']);

function definiteForm(lemma: string, want: Record<string, string>): string | undefined {
  const entry = sqLexicon.find(lemma);
  return entry ? sqLexicon.formWith(entry, want)?.form : undefined;
}

const SUPPORT: AdapterSupport = {
  tokenization: 'dependable', // Intl.Segmenter('sq'); ë and ç stay inside tokens
  sentenceSegmentation: 'limited',
  lemmatization: 'seed-only', // the lexicon covers the seed corpus only; other words are left unanalysed
  morphology: 'seed-only', // definiteness (the noun-final article) and case for lexicon nouns only
  phraseDetection: 'seed-only',
  productionChecks: 'limited',
  limitations: [
    'Lemmatization is seed-only: the lexicon covers the bundled corpus, so supplied texts will have unanalysed words.',
    'The clitic / article words e, i, të, më are resolved only from the next word; with thin context they stay ambiguous at low confidence.',
    'Verbs are listed under their first-person-present lemma; only the listed forms are recognised.',
    'Production checks: definite noun after te/tek, definite noun before a possessive — only for lexicon nouns.',
  ],
};

export const sqAdapter: LanguageAdapter = {
  lang: LANG,
  name: 'Albanian',
  script: 'Latn',
  version: VERSION,
  support: SUPPORT,

  segmentSentences: (text) => splitSentences(text, { terminators: '.!?…', abbreviations: ['dr', 'p', 'sh', 'etj', 'z', 'znj', 'prof'] }),
  tokenize: makeWordTokenizer({ locale: 'sq', normalize }),
  normalize,
  /** Forgiving search: people type without ë/ç. */
  searchNormalize: (q) => normalize(q).replace(/ë/g, 'e').replace(/ç/g, 'c').trim(),

  analyze: (tokens) => lexiconAnalyze(tokens, sqLexicon, ANALYZER, { contextual }),

  detectPhrases: (tokens, analyses) => matchPhraseRules(tokens, analyses, PHRASES, normalize),

  detectPatterns(tokens, analyses): PatternCandidate[] {
    const out: PatternCandidate[] = [];
    analyses.forEach((a, i) => {
      const c = a.candidates[0];
      if (!c) return;
      if (c.pos === 'NOUN' && c.morph.Definite === 'Def') {
        out.push({ key: 'definite-noun-ending', title: 'Definite noun ending', confidence: c.confidence, tokenIndexes: [i],
          explanation: 'Albanian puts "the" on the end of the noun: zemër → zemra / zemrën, mëkat → mëkati / mëkatin.' });
      }
      if (c.pos === 'PRON' && c.notes?.clitic === 'yes' && c.morph.PronType === 'Prs' && i + 1 < tokens.length && hasPos(analyses[i + 1], 'VERB')) {
        let noun = -1;
        for (let k = i + 2; k < Math.min(tokens.length, i + 5); k++) {
          const n = analyses[k]?.candidates[0];
          if ((n?.pos === 'NOUN' || n?.pos === 'PROPN') && n.morph.Definite === 'Def' && (n.morph.Case ?? '').split(',').includes('Acc')) { noun = k; break; }
        }
        if (noun > 0) {
          out.push({ key: 'clitic-doubling', title: 'Clitic doubling', confidence: Math.min(c.confidence, 0.7), tokenIndexes: [i, i + 1, noun],
            explanation: 'A short pronoun before the verb repeats the object: Perëndia e fali mëkatin — "e" points to "mëkatin".' });
        }
      }
      if (c.pos === 'PART' && tokens[i].normalized === 'të' && hasPos(analyses[nextContent(tokens, i)], 'VERB')) {
        out.push({ key: 'subjunctive-te', title: 'të + verb (subjunctive)', confidence: c.confidence, tokenIndexes: [i, nextContent(tokens, i)],
          explanation: 'After "fillova", "dua" and similar verbs, Albanian uses të + a present-tense verb where English uses "to".' });
      }
      if (c.pos === 'DET' && c.morph.Poss === 'Yes' && i > 0 && analyses[i - 1]?.candidates[0]?.pos === 'NOUN') {
        out.push({ key: 'possessive-after-noun', title: 'Possessive after the noun', confidence: 0.8, tokenIndexes: [i - 1, i],
          explanation: 'The possessive follows a definite noun: zemrën time "my heart" (literally "the heart mine").' });
      }
    });
    return out;
  },

  pronunciation(token): PronunciationSupport {
    const s = token.normalized;
    const notes: string[] = [];
    if (/ë/.test(s)) notes.push('ë is a short, unstressed "uh" vowel.');
    if (/ç/.test(s)) notes.push('ç is "ch" as in church.');
    if (/xh/.test(s)) notes.push('xh is "j" as in jam.');
    if (/q/.test(s)) notes.push('q is a soft "ty" (like a palatal ch).');
    if (/gj/.test(s)) notes.push('gj is a soft "dy" (palatal).');
    if (/dh/.test(s)) notes.push('dh is the voiced "th" of "this"; th is the "th" of "thin".');
    if (/sh/.test(s)) notes.push('sh is "sh"; zh is the "s" of "measure".');
    if (/y/.test(s)) notes.push('y is like German ü / French u.');
    if (/rr/.test(s)) notes.push('rr is a strongly trilled r.');
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

  checkProduction(tokens, analyses, _sentence): ErrorCandidate[] {
    const out: ErrorCandidate[] = [];
    tokens.forEach((t, i) => {
      const n = analyses[i]?.candidates[0];
      if (!t.isWord || !n || n.pos !== 'NOUN' || n.morph.Definite !== 'Ind' || !n.lemma) return;
      const prev = tokens[i - 1];
      const num = n.morph.Number;
      if (!num || num.includes(',')) return;

      // te / tek + noun: the noun is definite ("te libri", not "te libër")
      if (prev && (prev.normalized === 'te' || prev.normalized === 'tek')) {
        const fix = definiteForm(n.lemma, { Definite: 'Def', Case: 'Nom', Number: num });
        out.push({
          category: 'definiteness', tokenIndexes: [i - 1, i], confidence: fix ? 0.8 : 0.6, affectsMeaning: false,
          message: `After "${prev.surface}" the noun takes its definite form.`,
          suggestion: fix ? { start: t.start, end: t.end, replacement: fix } : undefined,
        });
        return;
      }

      // noun + possessive: the noun is definite ("zemrën time", not "zemër time")
      const next = analyses[i + 1]?.candidates[0];
      if (next?.pos === 'DET' && next.morph.Poss === 'Yes') {
        const afterPrepOrVerb = !!prev && (PREPS_ACC.has(prev.normalized) || hasPos(analyses[i - 1], 'VERB'));
        const kase = afterPrepOrVerb ? 'Acc' : i === 0 ? 'Nom' : undefined;
        const fix = kase ? definiteForm(n.lemma, { Definite: 'Def', Case: kase, Number: num }) : undefined;
        out.push({
          category: 'definiteness', tokenIndexes: [i, i + 1], confidence: fix ? 0.75 : 0.6, affectsMeaning: false,
          message: 'A noun followed by a possessive takes its definite form: zemrën time.',
          suggestion: fix ? { start: t.start, end: t.end, replacement: fix } : undefined,
        });
      }
    });
    return out;
  },

  relate(a, b) {
    const na = normalize(a), nb = normalize(b);
    if (na === nb) return 'same';
    const lb = new Set(sqLexicon.lemmasOf(nb));
    return sqLexicon.lemmasOf(na).some((l) => lb.has(l)) ? 'inflection' : 'none';
  },
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
