/**
 * Hand-written additions to the generated seed lexicon (lexicon-data.ts): words the Vulgate uses all the time that
 * Whitaker's file files in a shape the generator does not read (deus, the compounds of eo / sum / fero, the numerals above ten, the
 * defective verbs aio and inquam), and the compound verbs themselves. Rows are in the same shapes as the generated ones.
 * Counts are the Vulgate occurrences of the lemma (used only to rank homographs).
 */
import type { AdjRow, ClosedRow, ConjRow, NounRow, PrepRow, VerbRow } from './types';

export const EXTRA_NOUNS: NounRow[] = [
  ['vis', 'vis', 'f', 'force, power, violence; (pl.) strength, troops', 148],
  ['bos', 'bovis', 'c', 'ox, bull, cow', 80],
  ['Iuppiter', 'Iovis', 'm', 'Jupiter, Jove', 30],
  ['deus', 'dei', 'm', 'god; the God of Scripture', 4738],
  ['dextera', 'dexterae', 'f', 'right hand', 127],
  ['vidua', 'viduae', 'f', 'widow', 85],
  ['Iudaeus', 'Iudaei', 'm', 'Jew', 361],
  ['Pharisaeus', 'Pharisaei', 'm', 'Pharisee', 99],
  ['Hebraeus', 'Hebraei', 'm', 'Hebrew', 60],
  ['Aegyptius', 'Aegyptii', 'm', 'Egyptian', 120],
  ['pascha', 'paschae', 'f', 'Passover', 31],
  ['azyma', 'azymorum', 'np', 'unleavened bread', 41],
  ['dies', 'diei', 'c', 'day; daylight', 2588],
  ['sabbatum', 'sabbati', 'n', 'sabbath', 150],
  ['evangelium', 'evangelii', 'n', 'gospel, good news', 90],
  ['ecclesia', 'ecclesiae', 'f', 'assembly, church', 120],
  ['angelus', 'angeli', 'm', 'angel, messenger', 300],
  ['apostolus', 'apostoli', 'm', 'apostle', 80],
  ['discipulus', 'discipuli', 'm', 'pupil, disciple', 250],
  ['propheta', 'prophetae', 'm', 'prophet', 300],
  ['sacerdos', 'sacerdotis', 'c', 'priest, priestess', 400],
  ['sanguis', 'sanguinis', 'm', 'blood', 350],
  ['spiritus', 'spiritus', 'm', 'breath, spirit, the Spirit', 600],
  ['caelum', 'caeli', 'n', 'heaven, sky', 700],
];

export const EXTRA_ADJS: AdjRow[] = [
  ['huiusmodi', 'I', '', '', 'of this kind, such', 160], ['huiuscemodi', 'I', '', '', 'of this kind, such', 60], ['eiusmodi', 'I', '', '', 'of that kind', 30], ['cuiusmodi', 'I', '', '', 'of what kind', 10], ['istiusmodi', 'I', '', '', 'of that kind', 5],
  ['summus', '12', 'summa', 'summum', 'highest, top of; greatest', 75],
  ['proximus', '12', 'proxima', 'proximum', 'nearest, next; neighbour', 112],
  ['ceterus', '12', 'cetera', 'ceterum', 'the other, the rest of', 100],
  ['talis', '3b', '', 'tale', 'such, of such a kind', 150],
  ['qualis', '3b', '', 'quale', 'of what kind, such as', 100],
  ['tantus', '12', 'tanta', 'tantum', 'so great, so much', 150],
  ['quantus', '12', 'quanta', 'quantum', 'how great, how much', 200],
];

export const EXTRA_VERBS: VerbRow[] = [
  ['do', 'dare', 'dedi', 'datum', '1', 'TRANS', 'give, offer, grant; put, place', 2127],
  ['edo', 'edere', 'edi', 'esum', '3', 'TRANS', 'eat, consume', 60],
  ['comedo', 'comedere', 'comedi', 'comesum', '3', 'TRANS', 'eat up, devour', 200],
  ['licet', 'licere', 'licuit', 'licitum', '2', 'IMPERS', 'it is permitted, it is lawful', 58],
  ['oportet', 'oportere', 'oportuit', '', '2', 'IMPERS', 'it is right, it is necessary', 97],
  ['decet', 'decere', 'decuit', '', '2', 'IMPERS', 'it is fitting, it is becoming', 20],
];

export const EXTRA_ADVS: ConjRow[] = [
  ['quamproxime', 'as nearly as may be', 10], ['seorsim', 'separately', 10], ['plusquam', 'more than', 20], ['quamcunque', 'however, in whatever way', 5], ['quamcumque', 'however, in whatever way', 5],
  ['semel', 'once, a single time', 36],
  ['bis', 'twice', 32],
  ['secundo', 'secondly, for the second time', 76],
  ['natu', 'by birth, in age', 43],
  ['sin', 'but if', 93],
  ['etenim', 'for indeed, for', 58],
  ['tamquam', 'as, just as, as if', 153],
  ['verumtamen', 'nevertheless, yet', 101],
  ['obviam', 'to meet, in the way of', 44],
  ['amen', 'truly, so be it', 154],
  ['tandem', 'at last, finally', 28],
  ['omnino', 'altogether, entirely', 14],
  ['diu', 'for a long time', 12],
  ['olim', 'once, formerly', 10],
  ['undique', 'from all sides, everywhere', 10],
  ['deinde', 'then, next', 8],
  ['satis', 'enough, sufficiently', 7],
  ['interea', 'meanwhile', 7],
  ['paene', 'almost', 8],
  ['antea', 'before, formerly', 7],
];

export const EXTRA_PREPS: PrepRow[] = [];

/** Cardinals the Vulgate uses written out; indeclinable (quatuor ... centum) except the hundreds, which decline like the plural of bonus (ducenti, -ae, -a). */
export const EXTRA_NUMERALS: ConjRow[] = [
  ['quatuor', 'four', 204], ['triginta', 'thirty', 175], ['quadraginta', 'forty', 168], ['quinquaginta', 'fifty', 161], ['sexaginta', 'sixty', 73],
  ['septuaginta', 'seventy', 101], ['octoginta', 'eighty', 45], ['nonaginta', 'ninety', 20], ['viginti', 'twenty', 150], ['decem', 'ten', 400], ['septem', 'seven', 450],
  ['duodecim', 'twelve', 190], ['quindecim', 'fifteen', 40], ['centum', 'a hundred', 200], ['mille', 'a thousand', 150], ['quinque', 'five', 320], ['sex', 'six', 120],
  ['octo', 'eight', 90], ['novem', 'nine', 60], ['undecim', 'eleven', 30], ['tredecim', 'thirteen', 10], ['quattuordecim', 'fourteen', 10],
];
/** Hundreds (declined as the plural of a 12 adjective): ducenti, trecenti, quadringenti, quingenti, sescenti, septingenti, octingenti, nongenti. */
export const HUNDREDS: Array<[string, string]> = [['ducentus', 'two hundred'], ['trecentus', 'three hundred'], ['quadringentus', 'four hundred'], ['quingentus', 'five hundred'], ['sescentus', 'six hundred'], ['septingentus', 'seven hundred'], ['octingentus', 'eight hundred'], ['nongentus', 'nine hundred']];

/**
 * Compound verbs of sum, eo and fero. `base` names the literal table of the irregular verb in closed-data.ts; `pres` is the prefix as it is
 * written before the present system; `perf` replaces the perfect stem (fu-, tul-); `ppp` replaces the participle stem of fero (lat-).
 */
export interface Compound { lemma: string; base: 'sum' | 'eo' | 'fero'; pres: string; perf?: string; ppp?: string; gloss: string; count: number }
export const COMPOUNDS: Compound[] = [
  { lemma: 'absum', base: 'sum', pres: 'ab', perf: 'afu', gloss: 'be away, be absent', count: 40 },
  { lemma: 'adsum', base: 'sum', pres: 'ad', perf: 'adfu', gloss: 'be present, be near; help', count: 42 },
  { lemma: 'desum', base: 'sum', pres: 'de', perf: 'defu', gloss: 'be wanting, fail', count: 41 },
  { lemma: 'praesum', base: 'sum', pres: 'prae', perf: 'praefu', gloss: 'be in charge of', count: 45 },
  { lemma: 'intersum', base: 'sum', pres: 'inter', perf: 'interfu', gloss: 'be among, take part in', count: 10 },
  { lemma: 'insum', base: 'sum', pres: 'in', perf: 'infu', gloss: 'be in, be within', count: 10 },
  { lemma: 'supersum', base: 'sum', pres: 'super', perf: 'superfu', gloss: 'be left over, survive', count: 10 },
  { lemma: 'obsum', base: 'sum', pres: 'ob', perf: 'obfu', gloss: 'be a hindrance to', count: 5 },
  { lemma: 'prosum', base: 'sum', pres: 'pro', perf: 'profu', gloss: 'be useful, do good', count: 49 },
  { lemma: 'transeo', base: 'eo', pres: 'trans', gloss: 'go across, pass over, pass away', count: 413 },
  { lemma: 'abeo', base: 'eo', pres: 'ab', gloss: 'go away, depart', count: 395 },
  { lemma: 'exeo', base: 'eo', pres: 'ex', gloss: 'go out, come out', count: 309 },
  { lemma: 'pereo', base: 'eo', pres: 'per', gloss: 'perish, be lost', count: 249 },
  { lemma: 'introeo', base: 'eo', pres: 'intro', gloss: 'go in, enter', count: 189 },
  { lemma: 'pertranseo', base: 'eo', pres: 'pertrans', gloss: 'go through, pass through', count: 77 },
  { lemma: 'praetereo', base: 'eo', pres: 'praeter', gloss: 'go by, pass over', count: 70 },
  { lemma: 'ineo', base: 'eo', pres: 'in', gloss: 'go into, enter upon', count: 68 },
  { lemma: 'circueo', base: 'eo', pres: 'circu', gloss: 'go around, surround', count: 58 },
  { lemma: 'redeo', base: 'eo', pres: 'red', gloss: 'go back, return', count: 54 },
  { lemma: 'intereo', base: 'eo', pres: 'inter', gloss: 'perish, die', count: 38 },
  { lemma: 'adeo', base: 'eo', pres: 'ad', gloss: 'go to, approach', count: 60 },
  { lemma: 'praeeo', base: 'eo', pres: 'prae', gloss: 'go before, lead the way', count: 20 },
  { lemma: 'subeo', base: 'eo', pres: 'sub', gloss: 'go under, come up to', count: 15 },
  { lemma: 'obeo', base: 'eo', pres: 'ob', gloss: 'go to meet; die', count: 15 },
  { lemma: 'coeo', base: 'eo', pres: 'co', gloss: 'come together, meet', count: 15 },
  { lemma: 'aufero', base: 'fero', pres: 'au', perf: 'abstul', ppp: 'ablat', gloss: 'carry off, take away', count: 335 },
  { lemma: 'affero', base: 'fero', pres: 'af', perf: 'attul', ppp: 'allat', gloss: 'bring to, bring', count: 143 },
  { lemma: 'transfero', base: 'fero', pres: 'trans', perf: 'transtul', ppp: 'translat', gloss: 'carry across, transfer', count: 106 },
  { lemma: 'infero', base: 'fero', pres: 'in', perf: 'intul', ppp: 'illat', gloss: 'bring in, bring upon', count: 99 },
  { lemma: 'profero', base: 'fero', pres: 'pro', perf: 'protul', ppp: 'prolat', gloss: 'bring forth, produce', count: 64 },
  { lemma: 'defero', base: 'fero', pres: 'de', perf: 'detul', ppp: 'delat', gloss: 'carry down, report', count: 62 },
  { lemma: 'refero', base: 'fero', pres: 're', perf: 'rettul', ppp: 'relat', gloss: 'carry back, report', count: 39 },
  { lemma: 'offero', base: 'fero', pres: 'of', perf: 'obtul', ppp: 'oblat', gloss: 'offer, present', count: 250 },
  { lemma: 'confero', base: 'fero', pres: 'con', perf: 'contul', ppp: 'collat', gloss: 'bring together, compare', count: 40 },
  { lemma: 'effero', base: 'fero', pres: 'ef', perf: 'extul', ppp: 'elat', gloss: 'carry out, bring out', count: 40 },
  { lemma: 'suffero', base: 'fero', pres: 'suf', perf: 'sustul', ppp: 'sublat', gloss: 'bear, endure; lift up', count: 25 },
  { lemma: 'perfero', base: 'fero', pres: 'per', perf: 'pertul', ppp: 'perlat', gloss: 'carry through, endure', count: 20 },
  { lemma: 'praefero', base: 'fero', pres: 'prae', perf: 'praetul', ppp: 'praelat', gloss: 'carry before, prefer', count: 10 },
  { lemma: 'differo', base: 'fero', pres: 'dif', perf: 'distul', ppp: 'dilat', gloss: 'scatter, spread abroad; put off, delay; differ', count: 30 },
  { lemma: 'adfero', base: 'fero', pres: 'ad', perf: 'adtul', ppp: 'adlat', gloss: 'bring to, bring', count: 60 },
  { lemma: 'circumfero', base: 'fero', pres: 'circum', perf: 'circumtul', ppp: 'circumlat', gloss: 'carry round', count: 10 },
  { lemma: 'antefero', base: 'fero', pres: 'ante', perf: 'antetul', ppp: 'antelat', gloss: 'carry before; prefer', count: 5 },
];

const clos = (lemma: string, pos: ClosedRow['pos'], gloss: string, count: number, forms: Array<[string, string]>): ClosedRow => ({ lemma, pos, kind: 'verb', gloss, count, forms });
const fin = (m: string, t: string, v: string, p: string, n: string): string => `Mood=${m}|Number=${n}|Person=${p}|Tense=${t}|VerbForm=Fin|Voice=${v}`;

/** Defective verbs written out by hand: aio, inquam, memini, odi, coepi (the last three have only a perfect system, with the sense of a present for the first two). */
export const DEFECTIVE_ROWS: ClosedRow[] = [
  clos('aio', 'VERB', 'say, assert', 1277, [
    ['aio', fin('Ind', 'Pres', 'Act', '1', 'Sing')], ['ais', fin('Ind', 'Pres', 'Act', '2', 'Sing')], ['ait', fin('Ind', 'Pres', 'Act', '3', 'Sing')], ['aiunt', fin('Ind', 'Pres', 'Act', '3', 'Plur')],
    ['aiebam', fin('Ind', 'Imp', 'Act', '1', 'Sing')], ['aiebas', fin('Ind', 'Imp', 'Act', '2', 'Sing')], ['aiebat', fin('Ind', 'Imp', 'Act', '3', 'Sing')], ['aiebant', fin('Ind', 'Imp', 'Act', '3', 'Plur')],
    ['aiat', fin('Sub', 'Pres', 'Act', '3', 'Sing')], ['aiant', fin('Sub', 'Pres', 'Act', '3', 'Plur')],
  ]),
  clos('inquam', 'VERB', 'say (after the first words of a quotation)', 400, [
    ['inquam', fin('Ind', 'Pres', 'Act', '1', 'Sing')], ['inquis', fin('Ind', 'Pres', 'Act', '2', 'Sing')], ['inquit', fin('Ind', 'Pres', 'Act', '3', 'Sing')], ['inquimus', fin('Ind', 'Pres', 'Act', '1', 'Plur')], ['inquiunt', fin('Ind', 'Pres', 'Act', '3', 'Plur')],
    ['inquiebat', fin('Ind', 'Imp', 'Act', '3', 'Sing')], ['inquiet', fin('Ind', 'Fut', 'Act', '3', 'Sing')], ['inquies', fin('Ind', 'Fut', 'Act', '2', 'Sing')],
  ]),
  clos('memini', 'VERB', 'remember (perfect form, present sense)', 60, [
    ['memini', fin('Ind', 'Perf', 'Act', '1', 'Sing')], ['meministi', fin('Ind', 'Perf', 'Act', '2', 'Sing')], ['meminit', fin('Ind', 'Perf', 'Act', '3', 'Sing')], ['meminimus', fin('Ind', 'Perf', 'Act', '1', 'Plur')], ['meministis', fin('Ind', 'Perf', 'Act', '2', 'Plur')], ['meminerunt', fin('Ind', 'Perf', 'Act', '3', 'Plur')],
    ['memento', 'Mood=Imp|Number=Sing|Person=2|Tense=Fut|VerbForm=Fin|Voice=Act'], ['mementote', 'Mood=Imp|Number=Plur|Person=2|Tense=Fut|VerbForm=Fin|Voice=Act'],
    ['memineram', fin('Ind', 'Pqp', 'Act', '1', 'Sing')], ['meminerat', fin('Ind', 'Pqp', 'Act', '3', 'Sing')], ['meminerit', fin('Ind', 'FutPerf', 'Act', '3', 'Sing')], ['meminerimus', fin('Sub', 'Perf', 'Act', '1', 'Plur')], ['meminisse', 'Tense=Perf|VerbForm=Inf|Voice=Act'],
  ]),
  clos('odi', 'VERB', 'hate (perfect form, present sense)', 20, [
    ['odi', fin('Ind', 'Perf', 'Act', '1', 'Sing')], ['odisti', fin('Ind', 'Perf', 'Act', '2', 'Sing')], ['odit', fin('Ind', 'Perf', 'Act', '3', 'Sing')], ['odimus', fin('Ind', 'Perf', 'Act', '1', 'Plur')], ['oderunt', fin('Ind', 'Perf', 'Act', '3', 'Plur')], ['oderat', fin('Ind', 'Pqp', 'Act', '3', 'Sing')], ['odisse', 'Tense=Perf|VerbForm=Inf|Voice=Act'],
  ]),
  clos('coepi', 'VERB', 'begin (perfect forms only)', 450, [
    ['coepi', fin('Ind', 'Perf', 'Act', '1', 'Sing')], ['coepisti', fin('Ind', 'Perf', 'Act', '2', 'Sing')], ['coepit', fin('Ind', 'Perf', 'Act', '3', 'Sing')], ['coepimus', fin('Ind', 'Perf', 'Act', '1', 'Plur')], ['coepistis', fin('Ind', 'Perf', 'Act', '2', 'Plur')], ['coeperunt', fin('Ind', 'Perf', 'Act', '3', 'Plur')],
    ['coeperat', fin('Ind', 'Pqp', 'Act', '3', 'Sing')], ['coeperant', fin('Ind', 'Pqp', 'Act', '3', 'Plur')], ['coeperit', fin('Ind', 'FutPerf', 'Act', '3', 'Sing')], ['coepisse', 'Tense=Perf|VerbForm=Inf|Voice=Act'], ['coeperim', fin('Sub', 'Perf', 'Act', '1', 'Sing')], ['coepisset', fin('Sub', 'Pqp', 'Act', '3', 'Sing')], ['coeperint', fin('Sub', 'Perf', 'Act', '3', 'Plur')],
  ]),
];

/** Pronouns and pronominal adjectives built by adding a particle to a base table: the base lemma, the particle, the result lemma and its gloss. */
export const PRONOUN_COMPOSITES: Array<{ base: string; suffix: string; lemma: string; pronType: string; gloss: string; count: number; keepGender?: boolean }> = [
  { base: 'quis', suffix: 'que', lemma: 'quisque', pronType: 'Ind', gloss: 'each, every one', count: 150 },
  { base: 'qui', suffix: 'cumque', lemma: 'quicumque', pronType: 'Rel', gloss: 'whoever, whatever', count: 200 },
  { base: 'quis', suffix: 'quam', lemma: 'quisquam', pronType: 'Ind', gloss: 'anyone at all', count: 50 },
  { base: 'uter', suffix: 'que', lemma: 'uterque', pronType: 'Ind', gloss: 'each of two, both', count: 60 },
];
