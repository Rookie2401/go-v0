/**
 * Readings for a word nothing in the lexicon knows. In the order tried:
 *
 *   1. the abbreviations of Roman first names (L., M., C., Cn., Q.) and of the Neo-Latin scientific text (corol., prop., lib., quad.),
 *   2. letters that label a diagram or stand for a quantity (b, ps, bd, fg: no vowel) and mathematical words (sqrt, sin),
 *   3. a capitalised word: a name. The ending suggests the nominative (Catilinam -> Catilina, Gracchum -> Gracchus, Ciceronis -> Cicero),
 *   4. an ending that fixes a verb form or a case of a noun (unconfirmed, with a lemma only where the ending fixes the conjugation or declension),
 *   5. nothing the endings say: part of speech X.
 *
 * Every such reading is `unconfirmed` (the lexicon does not vouch for the lemma), has no gloss and never exceeds confidence 0.4,
 * except an abbreviation of the first two kinds, which is read from a short list written by hand.
 */
import type { AnalysisCandidate, PartOfSpeech } from '../../core';
import { LA_SOURCE_IDS } from './version';

interface Rule {
  suffix: string;
  pos: PartOfSpeech;
  morph: Record<string, string>;
  /** What to add to the stem to name the lemma (absent: the ending does not fix it, so no lemma is offered). */
  lemma?: string;
  note: string;
  conf?: number;
}

const FIN = { VerbForm: 'Fin' };
const RULES: Rule[] = [
  { suffix: 'auerunt', pos: 'VERB', morph: { ...FIN, Mood: 'Ind', Tense: 'Perf', Voice: 'Act', Person: '3', Number: 'Plur' }, lemma: 'o', note: 'perfect -averunt of a first-conjugation verb' },
  { suffix: 'iuerunt', pos: 'VERB', morph: { ...FIN, Mood: 'Ind', Tense: 'Perf', Voice: 'Act', Person: '3', Number: 'Plur' }, lemma: 'io', note: 'perfect -iverunt of a fourth-conjugation verb' },
  { suffix: 'auit', pos: 'VERB', morph: { ...FIN, Mood: 'Ind', Tense: 'Perf', Voice: 'Act', Person: '3', Number: 'Sing' }, lemma: 'o', note: 'perfect -avit of a first-conjugation verb' },
  { suffix: 'iuit', pos: 'VERB', morph: { ...FIN, Mood: 'Ind', Tense: 'Perf', Voice: 'Act', Person: '3', Number: 'Sing' }, lemma: 'io', note: 'perfect -ivit of a fourth-conjugation verb' },
  { suffix: 'abant', pos: 'VERB', morph: { ...FIN, Mood: 'Ind', Tense: 'Imp', Voice: 'Act', Person: '3', Number: 'Plur' }, lemma: 'o', note: 'imperfect -abant of a first-conjugation verb' },
  { suffix: 'abat', pos: 'VERB', morph: { ...FIN, Mood: 'Ind', Tense: 'Imp', Voice: 'Act', Person: '3', Number: 'Sing' }, lemma: 'o', note: 'imperfect -abat of a first-conjugation verb' },
  { suffix: 'ebant', pos: 'VERB', morph: { ...FIN, Mood: 'Ind', Tense: 'Imp', Voice: 'Act', Person: '3', Number: 'Plur' }, note: 'imperfect -ebant (second or third conjugation)' },
  { suffix: 'ebat', pos: 'VERB', morph: { ...FIN, Mood: 'Ind', Tense: 'Imp', Voice: 'Act', Person: '3', Number: 'Sing' }, note: 'imperfect -ebat (second or third conjugation)' },
  { suffix: 'abitur', pos: 'VERB', morph: { ...FIN, Mood: 'Ind', Tense: 'Fut', Voice: 'Pass', Person: '3', Number: 'Sing' }, lemma: 'o', note: 'future passive -abitur' },
  { suffix: 'antur', pos: 'VERB', morph: { ...FIN, Voice: 'Pass', Person: '3', Number: 'Plur' }, note: 'third plural passive -antur' },
  { suffix: 'entur', pos: 'VERB', morph: { ...FIN, Voice: 'Pass', Person: '3', Number: 'Plur' }, note: 'third plural passive -entur' },
  { suffix: 'untur', pos: 'VERB', morph: { ...FIN, Mood: 'Ind', Tense: 'Pres', Voice: 'Pass', Person: '3', Number: 'Plur' }, note: 'third plural passive -untur' },
  { suffix: 'atur', pos: 'VERB', morph: { ...FIN, Voice: 'Pass', Person: '3', Number: 'Sing' }, note: 'third singular passive -atur' },
  { suffix: 'etur', pos: 'VERB', morph: { ...FIN, Voice: 'Pass', Person: '3', Number: 'Sing' }, note: 'third singular passive -etur' },
  { suffix: 'itur', pos: 'VERB', morph: { ...FIN, Voice: 'Pass', Person: '3', Number: 'Sing' }, note: 'third singular passive -itur' },
  { suffix: 'erunt', pos: 'VERB', morph: { ...FIN, Mood: 'Ind', Person: '3', Number: 'Plur' }, note: 'third plural -erunt (perfect, or future of a third-conjugation verb)', conf: 0.3 },
  { suffix: 'erant', pos: 'VERB', morph: { ...FIN, Mood: 'Ind', Tense: 'Pqp', Voice: 'Act', Person: '3', Number: 'Plur' }, note: 'pluperfect -erant', conf: 0.3 },
  { suffix: 'erat', pos: 'VERB', morph: { ...FIN, Mood: 'Ind', Tense: 'Pqp', Voice: 'Act', Person: '3', Number: 'Sing' }, note: 'pluperfect -erat', conf: 0.3 },
  { suffix: 'issent', pos: 'VERB', morph: { ...FIN, Mood: 'Sub', Tense: 'Pqp', Voice: 'Act', Person: '3', Number: 'Plur' }, note: 'pluperfect subjunctive -issent', conf: 0.3 },
  { suffix: 'isset', pos: 'VERB', morph: { ...FIN, Mood: 'Sub', Tense: 'Pqp', Voice: 'Act', Person: '3', Number: 'Sing' }, note: 'pluperfect subjunctive -isset', conf: 0.3 },
  { suffix: 'arent', pos: 'VERB', morph: { ...FIN, Mood: 'Sub', Tense: 'Imp', Voice: 'Act', Person: '3', Number: 'Plur' }, lemma: 'o', note: 'imperfect subjunctive -arent', conf: 0.3 },
  { suffix: 'aret', pos: 'VERB', morph: { ...FIN, Mood: 'Sub', Tense: 'Imp', Voice: 'Act', Person: '3', Number: 'Sing' }, lemma: 'o', note: 'imperfect subjunctive -aret', conf: 0.3 },
  { suffix: 'are', pos: 'VERB', morph: { VerbForm: 'Inf', Tense: 'Pres', Voice: 'Act' }, lemma: 'o', note: 'present infinitive -are of a first-conjugation verb', conf: 0.38 },
  { suffix: 'ire', pos: 'VERB', morph: { VerbForm: 'Inf', Tense: 'Pres', Voice: 'Act' }, lemma: 'io', note: 'present infinitive -ire of a fourth-conjugation verb', conf: 0.36 },
  { suffix: 'ari', pos: 'VERB', morph: { VerbForm: 'Inf', Tense: 'Pres', Voice: 'Act', Deponent: 'Yes' }, lemma: 'or', note: 'deponent infinitive -ari', conf: 0.34 },
  { suffix: 'andum', pos: 'VERB', morph: { VerbForm: 'Gdv,Ger', Case: 'Acc', Number: 'Sing' }, lemma: 'o', note: 'gerund / gerundive -andum of a first-conjugation verb', conf: 0.3 },
  { suffix: 'endum', pos: 'VERB', morph: { VerbForm: 'Gdv,Ger', Case: 'Acc', Number: 'Sing' }, note: 'gerund / gerundive -endum', conf: 0.3 },
  { suffix: 'antes', pos: 'VERB', morph: { VerbForm: 'Part', Tense: 'Pres', Voice: 'Act', Case: 'Acc,Nom', Number: 'Plur' }, lemma: 'o', note: 'present participle -antes', conf: 0.28 },
  { suffix: 'ans', pos: 'VERB', morph: { VerbForm: 'Part', Tense: 'Pres', Voice: 'Act', Case: 'Nom', Number: 'Sing' }, lemma: 'o', note: 'present participle -ans', conf: 0.28 },
  { suffix: 'atus', pos: 'VERB', morph: { VerbForm: 'Part', Tense: 'Perf', Voice: 'Pass', Case: 'Nom', Number: 'Sing', Gender: 'Masc' }, lemma: 'o', note: 'perfect participle -atus', conf: 0.25 },
  { suffix: 'atum', pos: 'VERB', morph: { VerbForm: 'Part', Tense: 'Perf', Voice: 'Pass', Case: 'Acc,Nom', Number: 'Sing', Gender: 'Neut' }, lemma: 'o', note: 'perfect participle -atum', conf: 0.25 },
  { suffix: 'orum', pos: 'NOUN', morph: { Case: 'Gen', Number: 'Plur' }, lemma: 'us', note: 'genitive plural -orum (second declension)', conf: 0.34 },
  { suffix: 'arum', pos: 'NOUN', morph: { Case: 'Gen', Number: 'Plur', Gender: 'Fem' }, lemma: 'a', note: 'genitive plural -arum (first declension)', conf: 0.36 },
  { suffix: 'ionum', pos: 'NOUN', morph: { Case: 'Gen', Number: 'Plur', Gender: 'Fem' }, lemma: 'io', note: 'genitive plural -ionum (nouns in -io)', conf: 0.34 },
  { suffix: 'ionibus', pos: 'NOUN', morph: { Case: 'Abl,Dat', Number: 'Plur', Gender: 'Fem' }, lemma: 'io', note: 'dative / ablative plural -ionibus (nouns in -io)', conf: 0.34 },
  { suffix: 'ive', pos: 'ADV', morph: {}, note: 'adverb in -ive', conf: 0.3 },
  { suffix: 'aris', pos: 'ADJ', morph: { Case: 'Nom,Gen', Number: 'Sing' }, lemma: 'aris', note: 'adjective in -aris', conf: 0.28 },
  { suffix: 'ionem', pos: 'NOUN', morph: { Case: 'Acc', Number: 'Sing', Gender: 'Fem' }, lemma: 'io', note: 'accusative -ionem (third declension, nouns in -io)', conf: 0.36 },
  { suffix: 'ionis', pos: 'NOUN', morph: { Case: 'Gen', Number: 'Sing', Gender: 'Fem' }, lemma: 'io', note: 'genitive -ionis (third declension, nouns in -io)', conf: 0.36 },
  { suffix: 'iones', pos: 'NOUN', morph: { Case: 'Acc,Nom', Number: 'Plur', Gender: 'Fem' }, lemma: 'io', note: 'plural -iones (third declension, nouns in -io)', conf: 0.36 },
  { suffix: 'itatem', pos: 'NOUN', morph: { Case: 'Acc', Number: 'Sing', Gender: 'Fem' }, lemma: 'itas', note: 'accusative -itatem (nouns in -itas)', conf: 0.36 },
  { suffix: 'itatis', pos: 'NOUN', morph: { Case: 'Gen', Number: 'Sing', Gender: 'Fem' }, lemma: 'itas', note: 'genitive -itatis (nouns in -itas)', conf: 0.36 },
  { suffix: 'itates', pos: 'NOUN', morph: { Case: 'Acc,Nom', Number: 'Plur', Gender: 'Fem' }, lemma: 'itas', note: 'plural -itates (nouns in -itas)', conf: 0.36 },
  { suffix: 'ibus', pos: 'NOUN', morph: { Case: 'Abl,Dat', Number: 'Plur' }, note: 'dative / ablative plural -ibus (third, fourth or fifth declension)', conf: 0.3 },
  { suffix: 'ae', pos: 'NOUN', morph: { Number: 'Plur,Sing', Case: 'Dat,Gen,Nom', Gender: 'Fem' }, lemma: 'a', note: 'first declension -ae', conf: 0.3 },
  { suffix: 'am', pos: 'NOUN', morph: { Case: 'Acc', Number: 'Sing', Gender: 'Fem' }, lemma: 'a', note: 'accusative -am (first declension)', conf: 0.3 },
  { suffix: 'os', pos: 'NOUN', morph: { Case: 'Acc', Number: 'Plur', Gender: 'Masc' }, lemma: 'us', note: 'accusative plural -os (second declension)', conf: 0.3 },
  { suffix: 'ter', pos: 'ADV', morph: {}, note: 'adverb in -ter', conf: 0.3 },
  { suffix: 'ibilis', pos: 'ADJ', morph: { Case: 'Gen,Nom', Number: 'Sing,Plur' }, note: 'adjective in -ibilis', conf: 0.28 },
  { suffix: 'alis', pos: 'ADJ', morph: { Case: 'Nom,Gen', Number: 'Sing' }, lemma: 'alis', note: 'adjective in -alis', conf: 0.28 },
  { suffix: 'icus', pos: 'ADJ', morph: { Case: 'Nom', Number: 'Sing', Gender: 'Masc' }, lemma: 'icus', note: 'adjective in -icus', conf: 0.28 },
  { suffix: 'ium', pos: 'NOUN', morph: { Case: 'Acc,Nom', Number: 'Sing', Gender: 'Neut' }, lemma: 'ium', note: 'neuter noun in -ium', conf: 0.28 },
  { suffix: 'um', pos: 'NOUN', morph: { Case: 'Acc,Nom', Number: 'Sing', Gender: 'Neut' }, lemma: 'um', note: 'second-declension neuter -um (or an accusative in -um)', conf: 0.25 },
  { suffix: 'us', pos: 'NOUN', morph: { Case: 'Nom', Number: 'Sing', Gender: 'Masc' }, lemma: 'us', note: 'second-declension -us', conf: 0.22 },
  { suffix: 'is', pos: 'NOUN', morph: { Case: 'Abl,Dat,Gen', Number: 'Sing,Plur' }, note: 'ending -is', conf: 0.2 },
  { suffix: 'es', pos: 'NOUN', morph: { Case: 'Acc,Nom', Number: 'Plur' }, note: 'plural -es', conf: 0.2 },
  { suffix: 'em', pos: 'NOUN', morph: { Case: 'Acc', Number: 'Sing' }, note: 'accusative -em', conf: 0.2 },
];

/** Roman first names and the abbreviations written in the texts. */
const PRAENOMINA: Record<string, string> = { A: 'Aulus', C: 'Gaius', Cn: 'Gnaeus', D: 'Decimus', K: 'Kaeso', L: 'Lucius', M: 'Marcus', Mam: 'Mamercus', N: 'Numerius', P: 'Publius', Q: 'Quintus', Ser: 'Servius', Sex: 'Sextus', Sp: 'Spurius', T: 'Titus', Ti: 'Tiberius', Ap: 'Appius' };
export const isPraenomen = (surface: string): boolean => Object.prototype.hasOwnProperty.call(PRAENOMINA, surface);

/** Abbreviations and Neo-Latin short forms: written key -> [lemma, part of speech]. */
const ABBREVIATIONS: Record<string, [string, PartOfSpeech]> = {
  corol: ['corollarium', 'NOUN'], coroll: ['corollarium', 'NOUN'], prop: ['propositio', 'NOUN'], lib: ['liber', 'NOUN'], quad: ['quadratum', 'NOUN'], cub: ['cubus', 'NOUN'],
  cas: ['casus', 'NOUN'], schol: ['scholium', 'NOUN'], def: ['definitio', 'NOUN'], hyp: ['hypothesis', 'NOUN'], fig: ['figura', 'NOUN'], lem: ['lemma', 'NOUN'],
  theor: ['theorema', 'NOUN'], probl: ['problema', 'NOUN'], cap: ['caput', 'NOUN'], vid: ['video', 'VERB'], pag: ['pagina', 'NOUN'], seq: ['sequor', 'VERB'], sqq: ['sequor', 'VERB'],
  cet: ['ceterus', 'ADJ'], viz: ['videlicet', 'ADV'], sc: ['scilicet', 'ADV'], cf: ['confero', 'VERB'], ibid: ['ibidem', 'ADV'], ib: ['ibidem', 'ADV'], eod: ['idem', 'PRON'],
  sect: ['sectio', 'NOUN'], exper: ['experimentum', 'NOUN'], phaen: ['phaenomenon', 'NOUN'], reg: ['regula', 'NOUN'], ax: ['axioma', 'NOUN'],
};
const GREEK_LETTERS = new Set(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega']);
const MATH_WORDS = new Set(['sqrt', 'sin', 'cos', 'tan', 'sec', 'log', 'arc', 'tang', 'cot', 'cosec']);

const NAME_RULES: Array<{ suffix: string; strip: number; add: string; morph: Record<string, string>; note: string }> = [
  { suffix: 'onis', strip: 4, add: 'o', morph: { Case: 'Gen', Number: 'Sing' }, note: 'genitive -onis of a name in -o' },
  { suffix: 'onem', strip: 4, add: 'o', morph: { Case: 'Acc', Number: 'Sing' }, note: 'accusative -onem of a name in -o' },
  { suffix: 'ium', strip: 0, add: '', morph: { Case: 'Acc,Nom', Number: 'Sing', Gender: 'Neut' }, note: 'a place name in -ium' },
  { suffix: 'am', strip: 2, add: 'a', morph: { Case: 'Acc', Number: 'Sing', Gender: 'Fem' }, note: 'accusative -am of a name in -a' },
  { suffix: 'ae', strip: 2, add: 'a', morph: { Case: 'Dat,Gen', Number: 'Sing', Gender: 'Fem' }, note: 'genitive or dative -ae of a name in -a' },
  { suffix: 'um', strip: 2, add: 'us', morph: { Case: 'Acc', Number: 'Sing', Gender: 'Masc' }, note: 'accusative -um of a name in -us' },
  { suffix: 'orum', strip: 4, add: 'us', morph: { Case: 'Gen', Number: 'Plur' }, note: 'genitive plural -orum of a name in -us' },
  { suffix: 'arum', strip: 4, add: 'a', morph: { Case: 'Gen', Number: 'Plur' }, note: 'genitive plural -arum of a name in -a' },
  { suffix: 'os', strip: 2, add: 'us', morph: { Case: 'Acc', Number: 'Plur', Gender: 'Masc' }, note: 'accusative plural -os of a name in -us' },
  { suffix: 'i', strip: 1, add: 'us', morph: { Case: 'Gen', Number: 'Sing', Gender: 'Masc' }, note: 'genitive -i of a name in -us' },
  { suffix: 'o', strip: 1, add: 'us', morph: { Case: 'Abl,Dat', Number: 'Sing', Gender: 'Masc' }, note: 'dative or ablative -o of a name in -us' },
  { suffix: 'em', strip: 2, add: '', morph: { Case: 'Acc', Number: 'Sing' }, note: 'accusative -em of a name of the third declension' },
  { suffix: 'is', strip: 2, add: '', morph: { Case: 'Gen', Number: 'Sing' }, note: 'genitive -is of a name of the third declension' },
];

const stemBeforeOf = (surface: string, key: string, strip: number): string => {
  const base = surface.length === key.length ? surface : key;
  return base.slice(0, base.length - strip);
};
const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

function make(pos: PartOfSpeech, morph: Record<string, string>, conf: number, note: string, lemma?: string, extra?: Record<string, string | string[]>): AnalysisCandidate {
  return {
    ...(lemma !== undefined ? { lemma } : {}), pos, morph, confidence: conf, unconfirmed: true, origin: 'rule', sourceId: LA_SOURCE_IDS.rules,
    notes: { source: 'rule', guess: note, ...extra },
  };
}

/** The readings of an abbreviation of a first name; the caller decides against a Roman numeral (C, L, M, D). */
export function abbreviationReadings(surface: string): AnalysisCandidate[] {
  if (!isPraenomen(surface)) return [];
  return [{ lemma: PRAENOMINA[surface], pos: 'PROPN', morph: { Case: 'Nom', Number: 'Sing', Gender: 'Masc' }, confidence: 0.5, origin: 'rule', sourceId: LA_SOURCE_IDS.rules, notes: { source: 'rule', abbreviation: `${surface}. = ${PRAENOMINA[surface]}` } }];
}

export function guessWord(surface: string, key: string, sentenceInitial: boolean): AnalysisCandidate[] {
  const abbr = ABBREVIATIONS[key];
  if (abbr) {
    return [{ lemma: abbr[0], pos: abbr[1], morph: {}, confidence: 0.45, origin: 'rule', sourceId: LA_SOURCE_IDS.rules, notes: { source: 'rule', abbreviation: `${surface} is short for ${abbr[0]}` } }];
  }
  if (MATH_WORDS.has(key) || GREEK_LETTERS.has(key)) return [make('X', {}, 0.3, 'a mathematical word or a Greek letter name', key, { symbol: 'mathematical word' })];
  // letters that label a diagram or stand for a quantity: one to four letters, no vowel
  if (/^[b-df-hj-np-tv-z]{1,4}$/.test(key) || (/^[A-Za-z]{2,4}$/.test(surface) && (surface.match(/[A-Z]/g) ?? []).length >= 2 && !/^[A-Z][a-z]+$/.test(surface)) || /^[a-z][A-Z]{1,3}$/.test(surface)) {
    return [make('X', {}, 0.3, 'a label or a quantity: a letter of a diagram or a formula', surface, { symbol: 'letter label' })];
  }
  const capital = /^\p{Lu}/u.test(surface) && surface.length > 1;
  // a capital at the start of a sentence says nothing about a name: it is read as one only when the word ends like a Latin name
  if (capital && (!sentenceInitial || /(a|ae|am|as|e|es|i|is|o|os|um|us|on|en|or|er|ar|ur|ax|ex|ix)$/.test(key))) {
    const out: AnalysisCandidate[] = [];
    for (const r of NAME_RULES) {
      if (!key.endsWith(r.suffix) || key.length < r.suffix.length + 2) continue;
      const lemma = stemBeforeOf(surface, key, r.strip) + r.add;
      out.push(make('PROPN', r.morph, 0.34, r.note, cap(lemma)));
      break;
    }
    // the nominative as written: a name in -a / -us / -es / -as / -or, or one that does not decline
    out.push(make('PROPN', /(us|er|es|as)$/.test(key) ? { Case: 'Nom', Number: 'Sing' } : {}, out.length ? 0.28 : 0.4, 'a capitalised word: read as a name', surface));
    return out;
  }
  for (const r of RULES) {
    if (!key.endsWith(r.suffix) || key.length < r.suffix.length + 2) continue;
    const stem = stemBeforeOf(surface.toLowerCase(), key, r.suffix.length);
    const c = make(r.pos, { ...r.morph }, r.conf ?? 0.35, r.note);
    if (r.lemma !== undefined) c.lemma = stem + r.lemma;
    return [c];
  }
  if (!/[a-z]/.test(key) || capital) return [];
  return [make('X', {}, 0.1, 'no ending rule matched: a word the lexicon and the rules do not know', surface.toLowerCase())];
}
