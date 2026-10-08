/**
 * Norwegian constructions and fixed phrases. MACHINE-DRAFTED, pending native review. Every detector reads the chosen reading
 * (`candidates[0]`) of each token; a feature that is missing or a union means "do not fire", never "assume". There is no parser:
 * a detector looks at a short window of words and fires only on its own recognisable shape.
 *
 * Keys: v2-main-clause, inversion-after-adverbial, subordinate-ikke-before-verb, yes-no-question, wh-question,
 * double-definiteness, postposed-possessive, sin-reflexive, perfect-har, modal-bare-infinitive, infinitive-marker-aa,
 * s-passive, bli-passive, da-vs-naar, comparison, particle-verb.
 */
import type { AnalysisCandidate, AnalyzedToken, PatternCandidate, PhraseCandidate, RawToken } from '../../core';
import { matchPhraseRules, type PhraseRule } from '../shared';
import { normalizeNo } from './text';
import type { NoStandard } from './types';

interface Info { title: string; explanation: string }

export const NORWEGIAN_CONSTRUCTION_INFO: Readonly<Record<string, Info>> = {
  'v2-main-clause': {
    title: 'Verb second: the verb is the second element',
    explanation: 'In a main clause the conjugated verb comes second: "Jeg bor i Oslo." The subject normally comes first, but another element can come first (see inversion).',
  },
  'inversion-after-adverbial': {
    title: 'Something else first: the subject follows the verb',
    explanation: 'When a time or place word starts the sentence, the verb still comes second and the subject moves behind it: "I morgen kommer jeg" (tomorrow come I).',
  },
  'subordinate-ikke-before-verb': {
    title: 'Subordinate clause: ikke before the verb',
    explanation: 'In a clause started by at, fordi, hvis, når and similar words, the subject and then ikke come before the verb: "Jeg vet at han ikke kommer." In a main clause ikke comes after the verb.',
  },
  'yes-no-question': {
    title: 'Yes/no question: the verb comes first',
    explanation: 'A question that wants ja or nei starts with the conjugated verb: "Kommer du i morgen?"',
  },
  'wh-question': {
    title: 'Question word first, then the verb',
    explanation: 'A question with hvem, hva, hvor, hvorfor, hvordan or når starts with the question word and the verb comes second: "Hvorfor kommer du ikke?"',
  },
  'double-definiteness': {
    title: 'Double definiteness: den store bilen',
    explanation: 'With an adjective the noun keeps its definite ending and a word (den, det, de) comes in front as well: "den store bilen", "det nye huset", "de gamle husene".',
  },
  'postposed-possessive': {
    title: 'The possessive after the noun: bilen min',
    explanation: 'The usual way to say "my car" is the definite noun followed by the possessive: "bilen min", "mora mi". Before the noun the noun is indefinite: "min bil". Never "min bilen".',
  },
  'sin-reflexive': {
    title: 'sin, si, sitt, sine: his own, her own',
    explanation: 'Sin/si/sitt/sine point back to the subject of the same clause: "Han tok bilen sin" (his own car). "Han tok bilen hans" means someone else\'s. They agree with the thing owned, not with the owner.',
  },
  'perfect-har': {
    title: 'Perfect tense: har + participle',
    explanation: 'The perfect is made with har (hadde for the past perfect) and the participle: "Jeg har spist." For a few verbs of movement er is also possible (er kommet), but har is the default.',
  },
  'modal-bare-infinitive': {
    title: 'Modal verb + infinitive without å',
    explanation: 'After kan, skal, vil, må, bør the infinitive stands without å: "Jeg kan svømme", "Du må komme."',
  },
  'infinitive-marker-aa': {
    title: 'å + infinitive',
    explanation: 'The infinitive marker å goes before the infinitive after most other verbs and in phrases such as "for å": "Jeg liker å lese." Not to be confused with og (and).',
  },
  's-passive': {
    title: 'The s-passive: leses, finnes',
    explanation: 'A verb with -s says what is done to something: "Boka leses av mange." Some -s verbs are not passive at all (synes, finnes, trives).',
  },
  'bli-passive': {
    title: 'The bli-passive: blir + participle',
    explanation: '"Boken blir lest" (is being read), "Huset ble bygd" (was built). Bli + participle is the usual passive for single events.',
  },
  'da-vs-naar': {
    title: 'da or når?',
    explanation: 'Da is used for one event in the past ("Da jeg var liten …"); når for repeated events, the present, the future and in questions ("Når jeg er trøtt, sover jeg").',
  },
  comparison: {
    title: 'Comparison: -ere, -est, mer, mest',
    explanation: 'Most adjectives add -ere and -est ("større", "størst"); long adjectives and participles use mer and mest. "enn" means than: "større enn deg".',
  },
  'particle-verb': {
    title: 'Particle verb: stå opp, finne ut',
    explanation: 'Many verbs have a particle that follows them and changes the meaning: "stå opp" (get up). With a pronoun object the pronoun comes before the particle: "Jeg slår den på."',
  },
};

const posOf = (a: AnalyzedToken | undefined): string | undefined => a?.candidates[0]?.pos;
const split = (v: string | undefined): string[] => (v ?? '').split(',').filter(Boolean);
const hasM = (c: AnalysisCandidate | undefined, k: string, v: string): boolean => split(c?.morph[k]).includes(v);
const top = (a: AnalyzedToken | undefined): AnalysisCandidate | undefined => a?.candidates[0];

const isFinite = (c: AnalysisCandidate | undefined): boolean => !!c && (c.pos === 'VERB' || c.pos === 'AUX') && hasM(c, 'VerbForm', 'Fin') && !hasM(c, 'VerbForm', 'Inf') && !hasM(c, 'Mood', 'Imp') && !hasM(c, 'Voice', 'Pass');
const isInfinitive = (c: AnalysisCandidate | undefined): boolean => !!c && (c.pos === 'VERB' || c.pos === 'AUX') && hasM(c, 'VerbForm', 'Inf') && !hasM(c, 'VerbForm', 'Fin') && !hasM(c, 'Voice', 'Pass');
const isParticiple = (c: AnalysisCandidate | undefined): boolean => !!c && (c.pos === 'VERB' || c.pos === 'AUX') && hasM(c, 'VerbForm', 'Part') && !hasM(c, 'VerbForm', 'Fin');
const subjectPron = (c: AnalysisCandidate | undefined): boolean => !!c && c.pos === 'PRON' && hasM(c, 'Case', 'Nom') && c.morph.Case === 'Nom';

const WH = new Set(['hvem', 'hva', 'hvilken', 'hvilket', 'hvilke', 'hvor', 'hvordan', 'hvorfor', 'når', 'kven', 'kva', 'kvifor', 'korleis', 'kvar', 'kor']);
const SUBORD_FORMS = new Set(['at', 'fordi', 'hvis', 'viss', 'dersom', 'mens', 'medan', 'når', 'da', 'då', 'siden', 'sidan', 'om', 'før', 'idet', 'ettersom', 'som']);
const NEG_ADV = new Set(['ikke', 'ikkje', 'aldri', 'alltid', 'ofte', 'også', 'òg', 'bare', 'berre', 'jo', 'nok', 'vel', 'heller', 'sjelden', 'sjeldan', 'allerede', 'allereie']);
const POSSESSIVES = new Set(['min', 'mi', 'mitt', 'mine', 'din', 'di', 'ditt', 'dine', 'vår', 'vårt', 'våre', 'sin', 'si', 'sitt', 'sine', 'hans', 'hennes', 'hennar', 'deres', 'deira', 'dykkar', 'dens', 'dets']);

export function detectNorwegianConstructions(tokens: RawToken[], analyses: AnalyzedToken[], std: NoStandard): PatternCandidate[] {
  const out: PatternCandidate[] = [];
  const add = (key: string, idx: number[], conf: number): void => {
    if (out.some((o) => o.key === key && o.tokenIndexes.join() === idx.join())) return;
    const info = NORWEGIAN_CONSTRUCTION_INFO[key];
    out.push({ key, title: info.title, explanation: info.explanation, tokenIndexes: idx, confidence: Math.round(conf * 100) / 100 });
  };
  const words: number[] = [];
  tokens.forEach((t, i) => { if (t.isWord) words.push(i); });
  if (!words.length) return out;
  const lastTok = tokens[tokens.length - 1];
  const question = /\?$/.test(lastTok.surface) || tokens.some((t) => t.surface === '?');
  const first = words[0];
  const firstA = analyses[first];
  const firstNorm = tokens[first].normalized;
  const startsSubordinator = SUBORD_FORMS.has(firstNorm) && posOf(firstA) === 'SCONJ';

  // ── question forms ──
  if (question) {
    if (WH.has(firstNorm) && ['PRON', 'ADV', 'DET'].includes(posOf(firstA) ?? '')) {
      const v = words.find((w) => w > first && isFinite(top(analyses[w])));
      add('wh-question', v !== undefined ? [first, v] : [first], v !== undefined ? 0.9 : 0.75);
    } else if (isFinite(top(firstA)) || (firstA.candidates.some((c) => isFinite(c)) && ['VERB', 'AUX'].includes(posOf(firstA) ?? ''))) {
      add('yes-no-question', [first], 0.85);
    }
  }

  // ── verb second, inversion ──
  if (!question && !startsSubordinator) {
    const k = words.findIndex((w) => isFinite(top(analyses[w])));
    if (k >= 0) {
      const v = words[k];
      const before = words.slice(0, k);
      const beforeOk = before.length > 0 && before.every((w) => ['PRON', 'NOUN', 'PROPN', 'DET', 'ADJ', 'NUM', 'ADV', 'ADP'].includes(posOf(analyses[w]) ?? ''));
      const subjAt = words[k + 1] !== undefined ? words[k + 1] : -1;
      const after = analyses[subjAt];
      const afterAdvSubj = NEG_ADV.has(tokens[subjAt]?.normalized ?? '') ? words[k + 2] : undefined;
      if (beforeOk && k === 1 && (subjectPron(top(analyses[before[0]])) || ['NOUN', 'PROPN'].includes(posOf(analyses[before[0]]) ?? ''))) add('v2-main-clause', [before[0], v], 0.85);
      else if (beforeOk && k >= 1 && before.every((w) => !subjectPron(top(analyses[w])) || false) && before.length >= 1 && (subjectPron(top(after)) || (afterAdvSubj !== undefined && subjectPron(top(analyses[afterAdvSubj]))))) {
        add('inversion-after-adverbial', [before[0], v, afterAdvSubj ?? subjAt], 0.85);
        add('v2-main-clause', [before[0], v], 0.8);
      } else if (beforeOk && k >= 2 && before.every((w) => ['DET', 'ADJ', 'NOUN', 'PROPN', 'NUM', 'PRON'].includes(posOf(analyses[w]) ?? ''))) add('v2-main-clause', [before[0], v], 0.75);
    }
  }

  // ── subordinate clause: SCONJ subject ikke verb ──
  words.forEach((w, k) => {
    const a = analyses[w];
    if (!SUBORD_FORMS.has(tokens[w].normalized) || !a.candidates.some((c) => c.pos === 'SCONJ') || posOf(a) !== 'SCONJ') return;
    const s = words[k + 1];
    const adv = words[k + 2];
    const verb = words[k + 3];
    if (s === undefined || adv === undefined || verb === undefined) return;
    if ((subjectPron(top(analyses[s])) || ['NOUN', 'PROPN'].includes(posOf(analyses[s]) ?? '')) && NEG_ADV.has(tokens[adv].normalized) && isFinite(top(analyses[verb]))) add('subordinate-ikke-before-verb', [w, adv, verb], 0.85);
  });

  // ── noun phrase: den store bilen, bilen min, sin ──
  words.forEach((w, k) => {
    const a = top(analyses[w]);
    const a1 = analyses[words[k + 1]];
    const a2 = analyses[words[k + 2]];
    if (a?.pos === 'DET' && ['den', 'det', 'de', 'dei'].includes(a.lemma ?? '') && top(a1)?.pos === 'ADJ' && top(a2)?.pos === 'NOUN' && hasM(top(a2), 'Definite', 'Def')) add('double-definiteness', [w, words[k + 1], words[k + 2]], 0.85);
    if (a?.pos === 'NOUN' && hasM(a, 'Definite', 'Def') && top(a1)?.pos === 'DET' && POSSESSIVES.has(tokens[words[k + 1]]?.normalized ?? '') && tokens[words[k + 1]].start === tokens[w].end + 1) add('postposed-possessive', [w, words[k + 1]], 0.85);
    if (a?.pos === 'DET' && a.lemma === 'sin') add('sin-reflexive', [w], 0.9);
  });

  // ── verb groups ──
  words.forEach((w, k) => {
    const a = top(analyses[w]);
    if (!a) return;
    const nextTwo = [words[k + 1], words[k + 2], words[k + 3]].filter((x) => x !== undefined);
    if (a.pos === 'AUX' && a.lemma === 'ha' || (a.pos === 'AUX' && ['ha', 'hava'].includes(a.lemma ?? ''))) {
      if (!isFinite(a) && !isInfinitive(a)) return;
      const p = nextTwo.find((x) => isParticiple(top(analyses[x])) && !hasM(top(analyses[x]), 'Voice', 'Pass'));
      const between = p === undefined ? [] : words.slice(k + 1, words.indexOf(p));
      if (p !== undefined && between.every((x) => NEG_ADV.has(tokens[x].normalized) || ['PRON', 'NOUN', 'PROPN', 'DET'].includes(posOf(analyses[x]) ?? ''))) add('perfect-har', [w, p], 0.85);
    }
    if (a.pos === 'AUX' && ['kunne', 'skulle', 'ville', 'måtte', 'burde', 'tørre', 'tore'].includes(a.lemma ?? '') && isFinite(a)) {
      const p = nextTwo.find((x) => isInfinitive(top(analyses[x])));
      const between = p === undefined ? [] : words.slice(k + 1, words.indexOf(p));
      if (p !== undefined && between.every((x) => NEG_ADV.has(tokens[x].normalized) || subjectPron(top(analyses[x])) || ['PRON', 'ADV'].includes(posOf(analyses[x]) ?? ''))) add('modal-bare-infinitive', [w, p], 0.85);
    }
    if (a.pos === 'PART' && a.lemma === 'å') {
      const nx = words[k + 1];
      if (nx !== undefined && isInfinitive(top(analyses[nx]))) add('infinitive-marker-aa', [w, nx], 0.9);
    }
    if ((a.pos === 'VERB' || a.pos === 'AUX') && hasM(a, 'Voice', 'Pass')) add('s-passive', [w], 0.75);
    if ((a.pos === 'AUX' || a.pos === 'VERB') && ['bli', 'verte'].includes(a.lemma ?? '') && (isFinite(a) || isInfinitive(a) || isParticiple(a))) {
      const p = nextTwo.find((x) => isParticiple(top(analyses[x])) && top(analyses[x])?.lemma !== 'bli');
      if (p !== undefined) add('bli-passive', [w, p], 0.8);
    }
    if (a.pos === 'SCONJ' && ['da', 'då', 'når'].includes(a.lemma ?? '')) add('da-vs-naar', [w], 0.8);
    const comp = a.morph.Degree === 'Cmp' || a.morph.Degree === 'Sup';
    if ((a.pos === 'ADJ' || a.pos === 'ADV') && comp) add('comparison', [w], 0.8);
    if ((a.lemma === 'mer' || a.lemma === 'meir' || a.lemma === 'mest') && top(analyses[words[k + 1]])?.pos === 'ADJ') add('comparison', [w, words[k + 1]], 0.8);
    if (a.unit && a.unit.head === w && (a.pos === 'VERB')) add('particle-verb', a.unit.pieces, a.confidence);
  });

  void std;
  return out.sort((x, y) => x.tokenIndexes[0] - y.tokenIndexes[0] || x.key.localeCompare(y.key));
}

// ───────────────────────────── fixed phrases ─────────────────────────────

interface Fixed { words: string[]; gloss: string; kind: PhraseCandidate['kind']; std?: NoStandard }

const FIXED_NB: Fixed[] = [
  { words: ['i', 'dag'], gloss: 'today', kind: 'formula' },
  { words: ['i', 'morgen'], gloss: 'tomorrow', kind: 'formula' },
  { words: ['i', 'går'], gloss: 'yesterday', kind: 'formula' },
  { words: ['i', 'kveld'], gloss: 'tonight, this evening', kind: 'formula' },
  { words: ['i', 'natt'], gloss: 'tonight; last night', kind: 'formula' },
  { words: ['i', 'morges'], gloss: 'this morning', kind: 'formula' },
  { words: ['i', 'år'], gloss: 'this year', kind: 'formula' },
  { words: ['i', 'fjor'], gloss: 'last year', kind: 'formula' },
  { words: ['i', 'ettermiddag'], gloss: 'this afternoon', kind: 'formula' },
  { words: ['for', 'å'], gloss: 'in order to', kind: 'frame' },
  { words: ['på', 'grunn', 'av'], gloss: 'because of', kind: 'collocation' },
  { words: ['blant', 'annet'], gloss: 'among other things', kind: 'collocation' },
  { words: ['for', 'eksempel'], gloss: 'for example', kind: 'collocation' },
  { words: ['hva', 'slags'], gloss: 'what kind of', kind: 'collocation' },
  { words: ['selv', 'om'], gloss: 'even though', kind: 'collocation' },
  { words: ['slik', 'at'], gloss: 'so that', kind: 'collocation' },
  { words: ['så', 'fort'], gloss: 'as soon as', kind: 'collocation' },
  { words: ['til', 'og', 'med'], gloss: 'even', kind: 'collocation' },
  { words: ['i', 'tillegg'], gloss: 'in addition', kind: 'collocation' },
  { words: ['til', 'slutt'], gloss: 'finally, in the end', kind: 'collocation' },
  { words: ['på', 'vei'], gloss: 'on the way', kind: 'collocation' },
  { words: ['for', 'det', 'meste'], gloss: 'for the most part', kind: 'collocation' },
  { words: ['ved', 'siden', 'av'], gloss: 'beside; in addition to', kind: 'collocation' },
  { words: ['noen', 'ganger'], gloss: 'sometimes', kind: 'collocation' },
  { words: ['hver', 'dag'], gloss: 'every day', kind: 'collocation' },
  { words: ['hele', 'tiden'], gloss: 'all the time', kind: 'collocation' },
  { words: ['god', 'morgen'], gloss: 'good morning', kind: 'formula' },
  { words: ['god', 'natt'], gloss: 'good night', kind: 'formula' },
  { words: ['god', 'dag'], gloss: 'hello (good day)', kind: 'formula' },
  { words: ['ha', 'det', 'bra'], gloss: 'goodbye (take care)', kind: 'formula' },
  { words: ['vær', 'så', 'snill'], gloss: 'please', kind: 'formula' },
  { words: ['takk', 'for', 'maten'], gloss: 'thanks for the meal', kind: 'formula' },
  { words: ['det', 'vil', 'si'], gloss: 'that is to say', kind: 'collocation' },
  { words: ['i', 'stedet', 'for'], gloss: 'instead of', kind: 'collocation' },
  { words: ['på', 'nytt'], gloss: 'again, anew', kind: 'collocation' },
  { words: ['i', 'hvert', 'fall'], gloss: 'at any rate', kind: 'collocation' },
  { words: ['i', 'alle', 'fall'], gloss: 'in any case', kind: 'collocation' },
  { words: ['en', 'gang'], gloss: 'once; one day', kind: 'collocation' },
  { words: ['nå', 'og', 'da'], gloss: 'now and then', kind: 'collocation' },
  { words: ['om', 'morgenen'], gloss: 'in the morning', kind: 'collocation' },
  { words: ['om', 'kvelden'], gloss: 'in the evening', kind: 'collocation' },
  { words: ['om', 'natten'], gloss: 'at night', kind: 'collocation' },
  { words: ['om', 'sommeren'], gloss: 'in summer', kind: 'collocation' },
  { words: ['helt', 'til'], gloss: 'all the way to; until', kind: 'collocation' },
  { words: ['på', 'den', 'måten'], gloss: 'in that way', kind: 'collocation' },
  { words: ['så', 'mye'], gloss: 'so much', kind: 'collocation' },
  { words: ['så', 'mange'], gloss: 'so many', kind: 'collocation' },
  { words: ['som', 'regel'], gloss: 'as a rule', kind: 'collocation' },
  { words: ['for', 'lenge', 'siden'], gloss: 'a long time ago', kind: 'collocation' },
  { words: ['for', 'ikke', 'lenge', 'siden'], gloss: 'not long ago', kind: 'collocation' },
  { words: ['hjertelig', 'velkommen'], gloss: 'a warm welcome', kind: 'formula' },
  { words: ['i', 'Jesu', 'navn'], gloss: 'in Jesus\' name', kind: 'formula' },
  { words: ['Gud', 'være', 'lovet'], gloss: 'praise be to God', kind: 'formula' },
];

const FIXED_NN: Fixed[] = [
  { words: ['i', 'dag'], gloss: 'today', kind: 'formula' },
  { words: ['i', 'morgon'], gloss: 'tomorrow', kind: 'formula' },
  { words: ['i', 'går'], gloss: 'yesterday', kind: 'formula' },
  { words: ['i', 'kveld'], gloss: 'tonight, this evening', kind: 'formula' },
  { words: ['for', 'å'], gloss: 'in order to', kind: 'frame' },
  { words: ['på', 'grunn', 'av'], gloss: 'because of', kind: 'collocation' },
  { words: ['mellom', 'anna'], gloss: 'among other things', kind: 'collocation' },
  { words: ['til', 'dømes'], gloss: 'for example', kind: 'collocation' },
  { words: ['sjølv', 'om'], gloss: 'even though', kind: 'collocation' },
  { words: ['slik', 'at'], gloss: 'so that', kind: 'collocation' },
  { words: ['til', 'slutt'], gloss: 'finally, in the end', kind: 'collocation' },
  { words: ['kva', 'slags'], gloss: 'what kind of', kind: 'collocation' },
  { words: ['god', 'morgon'], gloss: 'good morning', kind: 'formula' },
  { words: ['ha', 'det', 'bra'], gloss: 'goodbye (take care)', kind: 'formula' },
];

/** Frames with a slot, found through the lemmas (so every inflected form matches): the three target phrases of the seed texts. */
export const NORWEGIAN_PHRASE_RULES: Record<NoStandard, PhraseRule[]> = {
  nb: [
    { pattern: ['da', '_', 'være', 'ung'], display: 'da … var ung', gloss: 'when (someone) was young', kind: 'frame', variants: [['da', { slot: true }, 'være', 'ung']] },
    { pattern: ['begynne', 'å', 'forstå'], display: 'begynne å forstå', gloss: 'begin to understand', kind: 'frame', variants: [['begynne', { gap: 3 }, 'å', 'forstå']] },
    { pattern: ['tro', 'på', '_'], display: 'tro på …', gloss: 'believe in (someone or something)', kind: 'frame', variants: [['tro', { gap: 2 }, 'på', { slot: true }]] },
  ],
  nn: [
    { pattern: ['då', '_', 'vere', 'ung'], display: 'då … var ung', gloss: 'when (someone) was young', kind: 'frame', variants: [['då', { slot: true }, 'vere', 'ung']] },
    { pattern: ['byrje', 'å', 'forstå'], display: 'byrje å forstå', gloss: 'begin to understand', kind: 'frame', variants: [['byrje', { gap: 3 }, 'å', 'forstå']] },
    { pattern: ['tru', 'på', '_'], display: 'tru på …', gloss: 'believe in (someone or something)', kind: 'frame', variants: [['tru', { gap: 2 }, 'på', { slot: true }]] },
  ],
};

export function detectNorwegianPhrases(tokens: RawToken[], analyses: AnalyzedToken[], std: NoStandard): PhraseCandidate[] {
  const out: PhraseCandidate[] = [...matchPhraseRules(tokens, analyses, NORWEGIAN_PHRASE_RULES[std], normalizeNo)];
  const list = std === 'nb' ? FIXED_NB : FIXED_NN;
  const wordIdx = tokens.map((t, i) => (t.isWord ? i : -1)).filter((i) => i >= 0);
  for (const f of list) {
    const want = f.words.map((w) => w.toLocaleLowerCase('nb'));
    for (let k = 0; k + want.length <= wordIdx.length; k++) {
      const idx = wordIdx.slice(k, k + want.length);
      if (!idx.every((ti, j) => tokens[ti].normalized === want[j])) continue;
      // contiguous in the text apart from spaces
      if (idx.some((ti, j) => j > 0 && /[.,;:!?]/.test(tokens.slice(idx[j - 1] + 1, ti).map((t) => t.surface).join('')))) continue;
      out.push({ pattern: want, display: f.words.join(' '), kind: f.kind, tokenIndexes: idx, confidence: 0.9, gloss: f.gloss });
    }
  }
  return out.sort((a, b) => a.tokenIndexes[0] - b.tokenIndexes[0] || a.pattern.join('_').localeCompare(b.pattern.join('_')));
}
