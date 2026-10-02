import { describe, expect, it } from 'vitest';
import { analyzeHindiForm, hindiVerbStem, inflectHindi } from '../../src/adapters/hindi/morphology';
import { VERBS, expectReading, expectTiling, read } from './hindi-morph-helpers';

type Row = [form: string, lemma: string, want: Record<string, string>];

const PART = (aspect: string, g: string, n: string, extra: Record<string, string> = {}) => ({ VerbForm: 'Part', Aspect: aspect, Gender: g, Number: n, ...extra });
const FUT = (person: string, n: string | undefined, g: string) => ({ Tense: 'Fut', Mood: 'Ind', Person: person, ...(n ? { Number: n } : {}), Gender: g });
const SUB = (person: string, n?: string) => ({ Mood: 'Sub', Person: person, ...(n ? { Number: n } : {}) });
const IMP = (polite: string) => ({ Mood: 'Imp', Person: '2', Polite: polite });
const INF = { VerbForm: 'Inf', Gender: 'Masc', Case: 'Dir' };
const INF_OBL = { VerbForm: 'Inf', Case: 'Obl' };
const INF_F = { VerbForm: 'Inf', Gender: 'Fem' };
const CONV = { VerbForm: 'Conv' };
const STEM = { VerbForm: 'Stem' };
const IPF = 'Imp';
const PRF = 'Perf';

/** A verb's characteristic forms, written out by hand for each of the six stem classes. */
const ROWS: Row[] = [
  // करना (consonant stem; irregular perfective and polite command)
  ['करना', 'करना', INF], ['करने', 'करना', INF_OBL], ['करनी', 'करना', INF_F], ['करता', 'करना', PART(IPF, 'Masc', 'Sing')], ['करते', 'करना', PART(IPF, 'Masc', 'Plur')],
  ['करते', 'करना', { ...PART(IPF, 'Masc', 'Sing'), Case: 'Obl' }], ['करती', 'करना', PART(IPF, 'Fem', 'Sing')], ['करती', 'करना', PART(IPF, 'Fem', 'Plur')], ['करतीं', 'करना', PART(IPF, 'Fem', 'Plur')],
  ['किया', 'करना', PART(PRF, 'Masc', 'Sing')], ['किए', 'करना', PART(PRF, 'Masc', 'Plur')], ['किये', 'करना', PART(PRF, 'Masc', 'Plur')], ['की', 'करना', PART(PRF, 'Fem', 'Sing')], ['कीं', 'करना', PART(PRF, 'Fem', 'Plur')],
  ['करूँ', 'करना', SUB('1', 'Sing')], ['करूं', 'करना', SUB('1', 'Sing')], ['करे', 'करना', SUB('2,3', 'Sing')], ['करें', 'करना', SUB('1,2,3', 'Plur')], ['करो', 'करना', SUB('2')], ['करो', 'करना', IMP('Fam')],
  ['करूँगा', 'करना', FUT('1', 'Sing', 'Masc')], ['करूंगा', 'करना', FUT('1', 'Sing', 'Masc')], ['करूँगी', 'करना', FUT('1', 'Sing', 'Fem')], ['करेगा', 'करना', FUT('2,3', 'Sing', 'Masc')], ['करेगी', 'करना', FUT('2,3', 'Sing', 'Fem')],
  ['करेंगे', 'करना', FUT('1,2,3', 'Plur', 'Masc')], ['करेंगी', 'करना', FUT('1,2,3', 'Plur', 'Fem')], ['करोगे', 'करना', FUT('2', undefined, 'Masc')], ['करोगी', 'करना', FUT('2', undefined, 'Fem')],
  ['कीजिए', 'करना', IMP('Form')], ['कीजिये', 'करना', IMP('Form')], ['करिए', 'करना', IMP('Form')], ['कीजिएगा', 'करना', { ...IMP('Form'), Tense: 'Fut' }],
  ['करके', 'करना', CONV], ['करकर', 'करना', CONV], ['कर', 'करना', IMP('Infm')], ['कर', 'करना', STEM],
  // जाना (-ा stem; irregular perfective गया)
  ['जाना', 'जाना', INF], ['जाने', 'जाना', INF_OBL], ['जाता', 'जाना', PART(IPF, 'Masc', 'Sing')], ['जाती', 'जाना', PART(IPF, 'Fem', 'Sing')], ['जातीं', 'जाना', PART(IPF, 'Fem', 'Plur')],
  ['गया', 'जाना', PART(PRF, 'Masc', 'Sing')], ['गए', 'जाना', PART(PRF, 'Masc', 'Plur')], ['गये', 'जाना', PART(PRF, 'Masc', 'Plur')], ['गई', 'जाना', PART(PRF, 'Fem', 'Sing')], ['गयी', 'जाना', PART(PRF, 'Fem', 'Sing')],
  ['गईं', 'जाना', PART(PRF, 'Fem', 'Plur')], ['गयीं', 'जाना', PART(PRF, 'Fem', 'Plur')],
  ['जाऊँ', 'जाना', SUB('1', 'Sing')], ['जाऊं', 'जाना', SUB('1', 'Sing')], ['जाए', 'जाना', SUB('2,3', 'Sing')], ['जाये', 'जाना', SUB('2,3', 'Sing')], ['जाएँ', 'जाना', SUB('1,2,3', 'Plur')], ['जाएं', 'जाना', SUB('1,2,3', 'Plur')],
  ['जायें', 'जाना', SUB('1,2,3', 'Plur')], ['जाओ', 'जाना', SUB('2')], ['जाओ', 'जाना', IMP('Fam')],
  ['जाऊँगा', 'जाना', FUT('1', 'Sing', 'Masc')], ['जाएगा', 'जाना', FUT('2,3', 'Sing', 'Masc')], ['जायेगा', 'जाना', FUT('2,3', 'Sing', 'Masc')], ['जाएगी', 'जाना', FUT('2,3', 'Sing', 'Fem')],
  ['जाएँगे', 'जाना', FUT('1,2,3', 'Plur', 'Masc')], ['जाएंगे', 'जाना', FUT('1,2,3', 'Plur', 'Masc')], ['जाएँगी', 'जाना', FUT('1,2,3', 'Plur', 'Fem')], ['जाओगे', 'जाना', FUT('2', undefined, 'Masc')], ['जाओगी', 'जाना', FUT('2', undefined, 'Fem')],
  ['जाइए', 'जाना', IMP('Form')], ['जाइये', 'जाना', IMP('Form')], ['जाइएगा', 'जाना', { ...IMP('Form'), Tense: 'Fut' }], ['जा', 'जाना', IMP('Infm')], ['जा', 'जाना', STEM], ['जाकर', 'जाना', CONV], ['जाके', 'जाना', CONV],
  // आना, खाना, पाना, लाना (-ा stems with the regular -या perfective)
  ['आना', 'आना', INF], ['आता', 'आना', PART(IPF, 'Masc', 'Sing')], ['आया', 'आना', PART(PRF, 'Masc', 'Sing')], ['आए', 'आना', PART(PRF, 'Masc', 'Plur')], ['आये', 'आना', PART(PRF, 'Masc', 'Plur')],
  ['आई', 'आना', PART(PRF, 'Fem', 'Sing')], ['आयी', 'आना', PART(PRF, 'Fem', 'Sing')], ['आईं', 'आना', PART(PRF, 'Fem', 'Plur')], ['आऊँ', 'आना', SUB('1', 'Sing')], ['आओ', 'आना', IMP('Fam')],
  ['आऊँगा', 'आना', FUT('1', 'Sing', 'Masc')], ['आएगा', 'आना', FUT('2,3', 'Sing', 'Masc')], ['आएँगे', 'आना', FUT('1,2,3', 'Plur', 'Masc')], ['आओगे', 'आना', FUT('2', undefined, 'Masc')],
  ['आइए', 'आना', IMP('Form')], ['आइएगा', 'आना', { ...IMP('Form'), Tense: 'Fut' }], ['आकर', 'आना', CONV], ['आ', 'आना', STEM],
  ['खाना', 'खाना', INF], ['खाता', 'खाना', PART(IPF, 'Masc', 'Sing')], ['खाया', 'खाना', PART(PRF, 'Masc', 'Sing')], ['खाए', 'खाना', PART(PRF, 'Masc', 'Plur')], ['खाई', 'खाना', PART(PRF, 'Fem', 'Sing')],
  ['खाईं', 'खाना', PART(PRF, 'Fem', 'Plur')], ['खाऊँ', 'खाना', SUB('1', 'Sing')], ['खाओ', 'खाना', IMP('Fam')], ['खाइए', 'खाना', IMP('Form')], ['खाएगा', 'खाना', FUT('2,3', 'Sing', 'Masc')], ['खाकर', 'खाना', CONV],
  ['पाया', 'पाना', PART(PRF, 'Masc', 'Sing')], ['पाई', 'पाना', PART(PRF, 'Fem', 'Sing')], ['पाओ', 'पाना', IMP('Fam')], ['पाएगा', 'पाना', FUT('2,3', 'Sing', 'Masc')],
  ['लाया', 'लाना', PART(PRF, 'Masc', 'Sing')], ['लाओ', 'लाना', IMP('Fam')], ['लाइए', 'लाना', IMP('Form')],
  // पीना, सीना, जीना (-ी stems: the vowel shortens before a vowel ending)
  ['पीना', 'पीना', INF], ['पीता', 'पीना', PART(IPF, 'Masc', 'Sing')], ['पीती', 'पीना', PART(IPF, 'Fem', 'Sing')], ['पिया', 'पीना', PART(PRF, 'Masc', 'Sing')], ['पिए', 'पीना', PART(PRF, 'Masc', 'Plur')],
  ['पिये', 'पीना', PART(PRF, 'Masc', 'Plur')], ['पी', 'पीना', PART(PRF, 'Fem', 'Sing')], ['पीं', 'पीना', PART(PRF, 'Fem', 'Plur')], ['पिऊँ', 'पीना', SUB('1', 'Sing')], ['पिए', 'पीना', SUB('2,3', 'Sing')],
  ['पिएँ', 'पीना', SUB('1,2,3', 'Plur')], ['पियो', 'पीना', IMP('Fam')], ['पिओ', 'पीना', IMP('Fam')], ['पिऊँगा', 'पीना', FUT('1', 'Sing', 'Masc')], ['पिएगा', 'पीना', FUT('2,3', 'Sing', 'Masc')],
  ['पिएँगे', 'पीना', FUT('1,2,3', 'Plur', 'Masc')], ['पिओगे', 'पीना', FUT('2', undefined, 'Masc')], ['पीजिए', 'पीना', IMP('Form')], ['पीजिएगा', 'पीना', { ...IMP('Form'), Tense: 'Fut' }], ['पीकर', 'पीना', CONV],
  ['पी', 'पीना', IMP('Infm')], ['पी', 'पीना', STEM], ['सीता', 'सीना', PART(IPF, 'Masc', 'Sing')], ['सिया', 'सीना', PART(PRF, 'Masc', 'Sing')], ['जिया', 'जीना', PART(PRF, 'Masc', 'Sing')], ['जिएगा', 'जीना', FUT('2,3', 'Sing', 'Masc')],
  // छूना (-ू stem)
  ['छूना', 'छूना', INF], ['छूता', 'छूना', PART(IPF, 'Masc', 'Sing')], ['छुआ', 'छूना', PART(PRF, 'Masc', 'Sing')], ['छुए', 'छूना', PART(PRF, 'Masc', 'Plur')], ['छुई', 'छूना', PART(PRF, 'Fem', 'Sing')],
  ['छुईं', 'छूना', PART(PRF, 'Fem', 'Plur')], ['छुऊँ', 'छूना', SUB('1', 'Sing')], ['छुए', 'छूना', SUB('2,3', 'Sing')], ['छुओ', 'छूना', IMP('Fam')], ['छुएगा', 'छूना', FUT('2,3', 'Sing', 'Masc')],
  ['छूइए', 'छूना', IMP('Form')], ['छूकर', 'छूना', CONV],
  // सोना, रोना, धोना (-ो stems)
  ['सोना', 'सोना', INF], ['सोता', 'सोना', PART(IPF, 'Masc', 'Sing')], ['सोया', 'सोना', PART(PRF, 'Masc', 'Sing')], ['सोए', 'सोना', PART(PRF, 'Masc', 'Plur')], ['सोये', 'सोना', PART(PRF, 'Masc', 'Plur')],
  ['सोई', 'सोना', PART(PRF, 'Fem', 'Sing')], ['सोईं', 'सोना', PART(PRF, 'Fem', 'Plur')], ['सोऊँ', 'सोना', SUB('1', 'Sing')], ['सोओ', 'सोना', IMP('Fam')], ['सोऊँगा', 'सोना', FUT('1', 'Sing', 'Masc')],
  ['सोएगा', 'सोना', FUT('2,3', 'Sing', 'Masc')], ['सोओगे', 'सोना', FUT('2', undefined, 'Masc')], ['सोइए', 'सोना', IMP('Form')], ['सोकर', 'सोना', CONV],
  ['रोया', 'रोना', PART(PRF, 'Masc', 'Sing')], ['रोई', 'रोना', PART(PRF, 'Fem', 'Sing')], ['रोइए', 'रोना', IMP('Form')], ['धोया', 'धोना', PART(PRF, 'Masc', 'Sing')], ['धोकर', 'धोना', CONV],
  // लेना, देना (-े stems)
  ['लेना', 'लेना', INF], ['लेने', 'लेना', INF_OBL], ['लेता', 'लेना', PART(IPF, 'Masc', 'Sing')], ['लिया', 'लेना', PART(PRF, 'Masc', 'Sing')], ['लिए', 'लेना', PART(PRF, 'Masc', 'Plur')], ['लिये', 'लेना', PART(PRF, 'Masc', 'Plur')],
  ['ली', 'लेना', PART(PRF, 'Fem', 'Sing')], ['लीं', 'लेना', PART(PRF, 'Fem', 'Plur')], ['लूँ', 'लेना', SUB('1', 'Sing')], ['ले', 'लेना', SUB('2,3', 'Sing')], ['लें', 'लेना', SUB('1,2,3', 'Plur')],
  ['लो', 'लेना', IMP('Fam')], ['लूँगा', 'लेना', FUT('1', 'Sing', 'Masc')], ['लेगा', 'लेना', FUT('2,3', 'Sing', 'Masc')], ['लेंगे', 'लेना', FUT('1,2,3', 'Plur', 'Masc')], ['लोगे', 'लेना', FUT('2', undefined, 'Masc')],
  ['लीजिए', 'लेना', IMP('Form')], ['लीजिएगा', 'लेना', { ...IMP('Form'), Tense: 'Fut' }], ['लेकर', 'लेना', CONV], ['लेके', 'लेना', CONV], ['ले', 'लेना', IMP('Infm')], ['ले', 'लेना', STEM],
  ['देना', 'देना', INF], ['देता', 'देना', PART(IPF, 'Masc', 'Sing')], ['दिया', 'देना', PART(PRF, 'Masc', 'Sing')], ['दिए', 'देना', PART(PRF, 'Masc', 'Plur')], ['दी', 'देना', PART(PRF, 'Fem', 'Sing')],
  ['दीं', 'देना', PART(PRF, 'Fem', 'Plur')], ['दूँ', 'देना', SUB('1', 'Sing')], ['दे', 'देना', SUB('2,3', 'Sing')], ['दें', 'देना', SUB('1,2,3', 'Plur')], ['दो', 'देना', IMP('Fam')], ['दूँगा', 'देना', FUT('1', 'Sing', 'Masc')],
  ['देगा', 'देना', FUT('2,3', 'Sing', 'Masc')], ['देंगी', 'देना', FUT('1,2,3', 'Plur', 'Fem')], ['दोगे', 'देना', FUT('2', undefined, 'Masc')], ['दीजिए', 'देना', IMP('Form')], ['देकर', 'देना', CONV], ['दे', 'देना', STEM],
  // regular consonant stems
  ['कहना', 'कहना', INF], ['कहा', 'कहना', PART(PRF, 'Masc', 'Sing')], ['कहे', 'कहना', PART(PRF, 'Masc', 'Plur')], ['कही', 'कहना', PART(PRF, 'Fem', 'Sing')], ['कहीं', 'कहना', PART(PRF, 'Fem', 'Plur')],
  ['कहूँ', 'कहना', SUB('1', 'Sing')], ['कहे', 'कहना', SUB('2,3', 'Sing')], ['कहें', 'कहना', SUB('1,2,3', 'Plur')], ['कहो', 'कहना', IMP('Fam')], ['कहूँगा', 'कहना', FUT('1', 'Sing', 'Masc')], ['कहेगा', 'कहना', FUT('2,3', 'Sing', 'Masc')],
  ['कहोगे', 'कहना', FUT('2', undefined, 'Masc')], ['कहिए', 'कहना', IMP('Form')], ['कहिएगा', 'कहना', { ...IMP('Form'), Tense: 'Fut' }], ['कहकर', 'कहना', CONV], ['कहके', 'कहना', CONV], ['कह', 'कहना', STEM], ['कह', 'कहना', IMP('Infm')],
  ['बोला', 'बोलना', PART(PRF, 'Masc', 'Sing')], ['बोली', 'बोलना', PART(PRF, 'Fem', 'Sing')], ['बोलता', 'बोलना', PART(IPF, 'Masc', 'Sing')], ['बोलेगा', 'बोलना', FUT('2,3', 'Sing', 'Masc')], ['बोलिए', 'बोलना', IMP('Form')],
  ['देखा', 'देखना', PART(PRF, 'Masc', 'Sing')], ['देखे', 'देखना', PART(PRF, 'Masc', 'Plur')], ['देखीं', 'देखना', PART(PRF, 'Fem', 'Plur')], ['देखिए', 'देखना', IMP('Form')], ['देखकर', 'देखना', CONV], ['देखो', 'देखना', IMP('Fam')],
  ['सुना', 'सुनना', PART(PRF, 'Masc', 'Sing')], ['सुनो', 'सुनना', IMP('Fam')], ['सुनिए', 'सुनना', IMP('Form')], ['सुनकर', 'सुनना', CONV],
  ['पढ़ा', 'पढ़ना', PART(PRF, 'Masc', 'Sing')], ['पढ़ती', 'पढ़ना', PART(IPF, 'Fem', 'Sing')], ['पढ़ेंगे', 'पढ़ना', FUT('1,2,3', 'Plur', 'Masc')], ['पढ़िए', 'पढ़ना', IMP('Form')], ['पढ़कर', 'पढ़ना', CONV],
  ['लिखा', 'लिखना', PART(PRF, 'Masc', 'Sing')], ['उठा', 'उठना', PART(PRF, 'Masc', 'Sing')], ['बैठे', 'बैठना', PART(PRF, 'Masc', 'Plur')], ['मिली', 'मिलना', PART(PRF, 'Fem', 'Sing')], ['पूछा', 'पूछना', PART(PRF, 'Masc', 'Sing')],
  ['बताया', 'बताना', PART(PRF, 'Masc', 'Sing')], ['बताइए', 'बताना', IMP('Form')],
  // रहना: the same participle is also the progressive auxiliary
  ['रहा', 'रहना', PART(PRF, 'Masc', 'Sing')], ['रहा', 'रहना', { VerbForm: 'Part', Aspect: 'Prog', Gender: 'Masc', Number: 'Sing' }], ['रहे', 'रहना', { Aspect: 'Prog', Gender: 'Masc', Number: 'Plur' }],
  ['रही', 'रहना', { Aspect: 'Prog', Gender: 'Fem', Number: 'Sing' }], ['रहीं', 'रहना', { Aspect: 'Prog', Gender: 'Fem', Number: 'Plur' }], ['रहती', 'रहना', PART(IPF, 'Fem', 'Sing')],
];

/** होना: the forms are AUX. */
const HONA: Row[] = [
  ['हूँ', 'होना', { Tense: 'Pres', Person: '1', Number: 'Sing' }], ['हूं', 'होना', { Tense: 'Pres', Person: '1', Number: 'Sing' }], ['है', 'होना', { Tense: 'Pres', Person: '2,3', Number: 'Sing' }],
  ['हैं', 'होना', { Tense: 'Pres', Number: 'Plur' }], ['हो', 'होना', { Tense: 'Pres', Person: '2', Polite: 'Fam' }], ['हो', 'होना', SUB('2,3', 'Sing')], ['हों', 'होना', SUB('1,2,3', 'Plur')],
  ['था', 'होना', { Tense: 'Past', Gender: 'Masc', Number: 'Sing' }], ['थे', 'होना', { Tense: 'Past', Gender: 'Masc', Number: 'Plur' }], ['थी', 'होना', { Tense: 'Past', Gender: 'Fem', Number: 'Sing' }], ['थीं', 'होना', { Tense: 'Past', Gender: 'Fem', Number: 'Plur' }],
  ['हुआ', 'होना', PART(PRF, 'Masc', 'Sing')], ['हुए', 'होना', PART(PRF, 'Masc', 'Plur')], ['हुये', 'होना', PART(PRF, 'Masc', 'Plur')], ['हुई', 'होना', PART(PRF, 'Fem', 'Sing')], ['हुईं', 'होना', PART(PRF, 'Fem', 'Plur')],
  ['होगा', 'होना', FUT('2,3', 'Sing', 'Masc')], ['होगी', 'होना', FUT('2,3', 'Sing', 'Fem')], ['होंगे', 'होना', FUT('1,2,3', 'Plur', 'Masc')], ['होंगी', 'होना', FUT('1,2,3', 'Plur', 'Fem')], ['होगे', 'होना', FUT('2', undefined, 'Masc')],
  ['हूँगा', 'होना', FUT('1', 'Sing', 'Masc')], ['होऊँ', 'होना', SUB('1', 'Sing')], ['होता', 'होना', PART(IPF, 'Masc', 'Sing')], ['होते', 'होना', PART(IPF, 'Masc', 'Plur')], ['होती', 'होना', PART(IPF, 'Fem', 'Sing')],
  ['होना', 'होना', INF], ['होने', 'होना', INF_OBL], ['होकर', 'होना', CONV], ['होइए', 'होना', IMP('Form')], ['होओ', 'होना', IMP('Fam')], ['हो', 'होना', STEM],
];

describe('verbs: every category, by hand', () => {
  it(`analyses ${ROWS.length} verb form → reading rows (known lemmas)`, () => {
    for (const [form, lemma, want] of ROWS) {
      const a = expectReading(form, lemma, want.Aspect === 'Prog' ? 'AUX' : 'VERB', want);
      expect(a.lemmaKnown, form).toBe(true);
      expect(a.confidence, form).toBeGreaterThanOrEqual(0.7);
      expect(a.confidence, form).toBeLessThanOrEqual(0.9);
      expect(a.rule.length, form).toBeGreaterThan(10);
    }
  });

  it(`analyses ${HONA.length} forms of होना as AUX`, () => {
    for (const [form, lemma, want] of HONA) {
      const a = expectReading(form, lemma, 'AUX', want);
      expect(a.lemmaKnown, form).toBe(true);
    }
  });

  it('a verb stem in -ू / -ी shortens before a vowel ending; stems in -ा take य in the perfective', () => {
    const forms = (l: string) => inflectHindi(l, 'VERB').map((x) => x.form);
    expect(forms('छूना')).toContain('छुआ');
    expect(forms('पीना')).toContain('पिया');
    expect(forms('सीना')).toContain('सिया');
    expect(forms('पीना')).toContain('पिएगा');
    expect(forms('आना')).toContain('आया');
    expect(forms('खाना')).toContain('खाया');
    expect(forms('जाना')).not.toContain('जाया');
    expect(forms('करना')).not.toContain('करा');
    expect(forms('होना')).not.toContain('होया');
    expect(read('करा').filter((a) => a.lemma === 'करना')).toHaveLength(0);
    expect(read('जाया').filter((a) => a.lemma === 'जाना')).toHaveLength(0);
  });

  it('every generated verb form analyses back to its lemma with the features it was generated with', () => {
    let rows = 0;
    for (const lemma of [...VERBS, 'होना']) {
      const pos = lemma === 'होना' ? 'AUX' : 'VERB';
      for (const g of inflectHindi(lemma, pos)) {
        rows++;
        const hit = read(g.form).find((a) => a.lemma === lemma && JSON.stringify(a.morph) === JSON.stringify(g.morph));
        expect(hit, `${lemma} ${g.form} ${JSON.stringify(g.morph)}`).toBeTruthy();
        expect(hit!.pos, `${lemma} ${g.form}`).toBe(g.morph.Aspect === 'Prog' ? 'AUX' : pos);
      }
    }
    expect(rows).toBeGreaterThan(900);
  });

  it('the bare stem is a reading of every verb stem the word list knows, and not of a stem it does not', () => {
    for (const s of ['कह', 'सुन', 'देख', 'जा', 'खा', 'आ', 'पी', 'छू', 'सो', 'ले', 'दे', 'कर', 'हो', 'बोल', 'चल', 'पढ़']) {
      const r = read(s).find((a) => a.morph.VerbForm === 'Stem');
      expect(r, s).toBeTruthy();
      expect(r!.lemma).toBe(s + 'ना');
      expect(r!.lemmaKnown).toBe(true);
    }
    expect(analyzeHindiForm('कह')).toEqual([]);
    expect(read('सुंद')).toEqual([]);
  });

  it('conjunctive कर / के written together has parts: the stem and the marker', () => {
    const a = expectReading('देखकर', 'देखना', 'VERB', CONV);
    expectTiling('देखकर', a);
    expect(a.parts!.map((p) => p.text)).toEqual(['देख', 'कर']);
    expect(a.parts![0].kind).toBe('stem');
    expect(a.parts![0].lemma).toBe('देखना');
    const b = expectReading('करके', 'करना', 'VERB', CONV);
    expect(b.parts!.map((p) => p.text)).toEqual(['कर', 'के']);
  });

  it('variant spellings: the glide य is accepted for every vowel-stem form', () => {
    const pairs: Array<[string, string]> = [
      ['आए', 'आये'], ['आई', 'आयी'], ['दिए', 'दिये'], ['लिए', 'लिये'], ['किए', 'किये'], ['गए', 'गये'], ['गई', 'गयी'], ['हुए', 'हुये'], ['सोए', 'सोये'],
      ['जाएगा', 'जायेगा'], ['जाएँगे', 'जायेंगे'], ['जाइए', 'जाइये'], ['कीजिए', 'कीजिये'], ['खाए', 'खाये'], ['पिए', 'पिये'],
    ];
    for (const [a, b] of pairs) {
      const x = read(a).filter((r) => r.pos === 'VERB' || r.pos === 'AUX').map((r) => [r.lemma, r.morph]);
      const y = read(b).filter((r) => r.pos === 'VERB' || r.pos === 'AUX').map((r) => [r.lemma, r.morph]);
      expect(x.length, a).toBeGreaterThan(0);
      expect(y, b).toEqual(x);
    }
  });

  it('causatives keep their own lemma and add Voice=Cau when the word list says causativeOf', () => {
    const a = expectReading('कराया', 'कराना', 'VERB', { ...PART(PRF, 'Masc', 'Sing'), Voice: 'Cau' });
    expect(a.rule).toMatch(/causative of करना/);
    expectReading('कराओ', 'कराना', 'VERB', { ...IMP('Fam'), Voice: 'Cau' });
    expectReading('दिखाया', 'दिखाना', 'VERB', { Voice: 'Cau', Aspect: 'Perf' });
    expectReading('पढ़वाएगा', 'पढ़वाना', 'VERB', { Voice: 'Cau', Tense: 'Fut' });
    // the base verb is not a causative
    expect(read('करता').find((x) => x.lemma === 'करना')!.morph.Voice).toBeUndefined();
    // a guessed -वाना / -ाना lemma for an unknown stem is just another unconfirmed infinitive
    const g = analyzeHindiForm('लिखवाया');
    expect(g.length).toBeGreaterThan(0);
    for (const x of g) { expect(x.lemmaKnown).toBe(false); expect(x.morph.Voice).toBeUndefined(); }
  });

  it('hindiVerbStem', () => {
    expect(hindiVerbStem('कहना')).toBe('कह');
    expect(hindiVerbStem('जाना')).toBe('जा');
    expect(hindiVerbStem('ना')).toBeUndefined();
    expect(hindiVerbStem('घर')).toBeUndefined();
  });

  it('a verb form that is also a noun form returns both, and 0.7 for the vouched ones (ambiguous between paradigms)', () => {
    const o = { knownLemma: (l: string, p?: string) => (l === 'करना' && (!p || p === 'VERB')) || (l === 'कर' && (!p || p === 'NOUN')) };
    const r = analyzeHindiForm('करें', o);
    expect(r.some((a) => a.lemma === 'करना' && a.pos === 'VERB')).toBe(true);
    expect(r.some((a) => a.lemma === 'कर' && a.pos === 'NOUN')).toBe(true);
    for (const a of r.filter((x) => x.lemmaKnown)) expect(a.confidence).toBe(0.7);
  });
});
