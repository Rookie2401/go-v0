/**
 * Coordinator's tables for Hindi, written from my own knowledge of the language and NOT shown to the packages that
 * build the engines (docs/PLAN12.md, "Held-out discipline"). They are a model's judgement, not a native speaker's:
 * a failure here means "look at this", and a row can be wrong. Rows are deliberately plain, common words.
 *
 * Pronunciation rows give the word as said in a bare Latin skeleton (lower case, no diacritics): what matters is
 * where the unwritten a is and is not pronounced, and the order of the sounds — not a transliteration convention.
 */

/** Words whose reading is not in doubt: the engine must give exactly this, with confidence. [word, as said] */
export const SAID_CORE: Array<[string, string]> = [
  ['घर', 'ghar'], ['कमल', 'kamal'], ['नमक', 'namak'], ['कलम', 'kalam'], ['सड़क', 'sarak'], ['किताब', 'kitab'],
  ['पानी', 'pani'], ['लड़का', 'larka'], ['लड़की', 'larki'], ['लड़के', 'larke'], ['करना', 'karna'], ['समझ', 'samajh'],
  ['समझना', 'samajhna'], ['बोलना', 'bolna'], ['आदमी', 'admi'], ['औरत', 'aurat'], ['बच्चा', 'bacca'], ['कुत्ता', 'kutta'],
  ['बिल्ली', 'billi'], ['खाना', 'khana'], ['देखना', 'dekhna'], ['जाना', 'jana'], ['कहना', 'kahna'], ['रहना', 'rahna'],
  ['चलना', 'calna'], ['सुनना', 'sunna'], ['लिखना', 'likhna'], ['पढ़ना', 'parhna'], ['हम', 'ham'], ['तुम', 'tum'],
  ['आप', 'ap'], ['पर', 'par'], ['से', 'se'], ['को', 'ko'], ['का', 'ka'], ['नहीं', 'nahim'], ['है', 'hai'], ['हैं', 'haim'],
  ['था', 'tha'], ['थी', 'thi'], ['अच्छा', 'accha'], ['बड़ा', 'bara'], ['छोटा', 'chota'], ['नया', 'naya'],
  ['पुराना', 'purana'], ['लाल', 'lal'], ['दिन', 'din'], ['रात', 'rat'], ['शाम', 'sam'], ['आज', 'aj'], ['कल', 'kal'],
  ['अब', 'ab'], ['कौन', 'kaun'], ['कब', 'kab'], ['कैसे', 'kaise'], ['एक', 'ek'], ['दो', 'do'], ['तीन', 'tin'],
  ['चार', 'car'], ['दस', 'das'], ['पिता', 'pita'], ['भाई', 'bhai'], ['दादी', 'dadi'], ['दोस्त', 'dost'],
  ['कमरा', 'kamra'], ['खिड़की', 'khirki'], ['दुकान', 'dukan'], ['नदी', 'nadi'], ['पेड़', 'per'], ['फूल', 'phul'],
  ['फल', 'phal'], ['दूध', 'dudh'], ['रोटी', 'roti'], ['चावल', 'caval'], ['सरकार', 'sarkar'], ['मतलब', 'matlab'],
  ['पकड़ना', 'pakarna'], ['निकलना', 'nikalna'], ['बदलना', 'badalna'], ['समझता', 'samajhta'], ['सुनकर', 'sunkar'],
  ['देखकर', 'dekhkar'], ['किताबें', 'kitabem'], ['मछली', 'machli'], ['कहानी', 'kahani'], ['मुश्किल', 'muskil'],
  ['आसान', 'asan'], ['हाथी', 'hathi'], ['घोड़ा', 'ghora'], ['बंदर', 'bandar'], ['अंदर', 'andar'], ['लंबा', 'lamba'],
  ['ठंडा', 'thanda'], ['हिंदी', 'hindi'], ['हिन्दी', 'hindi'], ['ज़रूर', 'zarur'], ['बाज़ार', 'bazar'], ['दरवाज़ा', 'darvaza'],
  ['विश्वास', 'visvas'], ['नमस्ते', 'namaste'], ['स्कूल', 'skul'], ['दुनिया', 'duniya'], ['चिड़िया', 'ciriya'],
];

/**
 * Words where the rules are known to be unsafe (a second deletion, a prefix or compound boundary, a final cluster).
 * The engine may say "uncertain"; what it may not do is give a DIFFERENT reading with confidence. [word, as said]
 */
export const SAID_HARD: Array<[string, string]> = [
  ['बदला', 'badla'], ['निकला', 'nikla'], ['पकड़ा', 'pakra'], ['समझा', 'samjha'], ['उतरा', 'utra'], ['चमका', 'camka'],
  ['औरतें', 'aurtem'], ['सड़कें', 'sarkem'], ['अदरक', 'adrak'], ['बरतन', 'bartan'], ['कसरत', 'kasrat'],
  ['समझदार', 'samajhdar'], ['महसूस', 'mahsus'], ['इनकार', 'inkar'], ['अनजान', 'anjan'], ['अमरूद', 'amrud'],
  ['खरगोश', 'khargos'], ['जनता', 'janta'], ['लोकसभा', 'loksabha'], ['उपयोग', 'upyog'], ['अनुमति', 'anumati'],
  ['प्रार्थना', 'prarthna'], ['परमेश्वर', 'parmesvar'], ['ज़िंदगी', 'zindagi'], ['इतवार', 'itvar'], ['सोमवार', 'somvar'],
  ['मंगलवार', 'mangalvar'], ['धन्यवाद', 'dhanyavad'], ['रसगुल्ला', 'rasgulla'], ['तरबूज़', 'tarbuz'],
  ['पुस्तक', 'pustak'], ['आवश्यकता', 'avasyakta'], ['कलीसिया', 'kalisiya'], ['पश्चाताप', 'pascatap'],
];

/** Words ending in a consonant cluster: the final a is at most lightly released. Either reading is acceptable; a middle a must not appear or vanish. [word, without final a, with final a] */
export const SAID_FINAL_CLUSTER: Array<[string, string, string]> = [
  ['मित्र', 'mitr', 'mitra'], ['सत्य', 'saty', 'satya'], ['धर्म', 'dharm', 'dharma'], ['शब्द', 'sabd', 'sabda'],
  ['पत्र', 'patr', 'patra'], ['चंद्र', 'candr', 'candra'], ['अर्थ', 'arth', 'artha'], ['वाक्य', 'vaky', 'vakya'],
];

/** प्रार्थना and friends: the written units, joined by · [word, units] */
export const AKSHARAS: Array<[string, string]> = [
  ['प्रार्थना', 'प्रा·र्थ·ना'], ['कमल', 'क·म·ल'], ['विश्वास', 'वि·श्वा·स'], ['क्षमा', 'क्ष·मा'], ['हिन्दी', 'हि·न्दी'],
  ['हिंदी', 'हिं·दी'], ['आदमी', 'आ·द·मी'], ['स्कूल', 'स्कू·ल'], ['ज़रूर', 'ज़·रू·र'], ['लड़कियाँ', 'ल·ड़·कि·याँ'],
  ['परमेश्वर', 'प·र·मे·श्व·र'], ['दुःख', 'दुः·ख'], ['कृपा', 'कृ·पा'], ['ऋषि', 'ऋ·षि'], ['उद्धार', 'उ·द्धा·र'],
  ['पुनरुत्थान', 'पु·न·रु·त्था·न'], ['सत्', 'स·त्'],
];

/**
 * Morphology: [form, lemma, part of speech, features that must hold]. The lemma is supplied to the engine as known,
 * with the lemma facts a word list would have (see LEMMAS). Features are a subset; a comma list means "any of".
 */
export const FORMS: Array<[string, string, string, Record<string, string>]> = [
  // masculine nouns in -ा
  ['लड़का', 'लड़का', 'NOUN', { Gender: 'Masc', Number: 'Sing', Case: 'Dir' }],
  ['लड़के', 'लड़का', 'NOUN', { Gender: 'Masc', Number: 'Sing', Case: 'Obl' }],
  ['लड़के', 'लड़का', 'NOUN', { Gender: 'Masc', Number: 'Plur', Case: 'Dir' }],
  ['लड़कों', 'लड़का', 'NOUN', { Gender: 'Masc', Number: 'Plur', Case: 'Obl' }],
  ['कमरे', 'कमरा', 'NOUN', { Gender: 'Masc' }],
  ['कमरों', 'कमरा', 'NOUN', { Number: 'Plur', Case: 'Obl' }],
  ['कुत्ते', 'कुत्ता', 'NOUN', { Gender: 'Masc' }],
  ['बच्चों', 'बच्चा', 'NOUN', { Number: 'Plur', Case: 'Obl' }],
  // masculine nouns that do not change in the singular
  ['घर', 'घर', 'NOUN', { Gender: 'Masc' }],
  ['घरों', 'घर', 'NOUN', { Number: 'Plur', Case: 'Obl' }],
  ['आदमियों', 'आदमी', 'NOUN', { Number: 'Plur', Case: 'Obl' }],
  ['दिनों', 'दिन', 'NOUN', { Number: 'Plur', Case: 'Obl' }],
  ['पिता', 'पिता', 'NOUN', { Gender: 'Masc' }],
  ['राजाओं', 'राजा', 'NOUN', { Number: 'Plur', Case: 'Obl' }],
  // feminine nouns
  ['लड़कियाँ', 'लड़की', 'NOUN', { Gender: 'Fem', Number: 'Plur', Case: 'Dir' }],
  ['लड़कियां', 'लड़की', 'NOUN', { Gender: 'Fem', Number: 'Plur', Case: 'Dir' }],
  ['लड़कियों', 'लड़की', 'NOUN', { Gender: 'Fem', Number: 'Plur', Case: 'Obl' }],
  ['किताबें', 'किताब', 'NOUN', { Gender: 'Fem', Number: 'Plur', Case: 'Dir' }],
  ['किताबों', 'किताब', 'NOUN', { Gender: 'Fem', Number: 'Plur', Case: 'Obl' }],
  ['बातें', 'बात', 'NOUN', { Number: 'Plur', Case: 'Dir' }],
  ['बहनों', 'बहन', 'NOUN', { Number: 'Plur', Case: 'Obl' }],
  ['माताएँ', 'माता', 'NOUN', { Number: 'Plur', Case: 'Dir' }],
  ['चिड़ियाँ', 'चिड़िया', 'NOUN', { Number: 'Plur', Case: 'Dir' }],
  ['कहानियाँ', 'कहानी', 'NOUN', { Number: 'Plur', Case: 'Dir' }],
  ['कहानियों', 'कहानी', 'NOUN', { Number: 'Plur', Case: 'Obl' }],
  // adjectives
  ['अच्छे', 'अच्छा', 'ADJ', { Gender: 'Masc' }],
  ['अच्छी', 'अच्छा', 'ADJ', { Gender: 'Fem' }],
  ['बड़े', 'बड़ा', 'ADJ', { Gender: 'Masc' }],
  ['छोटी', 'छोटा', 'ADJ', { Gender: 'Fem' }],
  ['नई', 'नया', 'ADJ', { Gender: 'Fem' }],
  ['नए', 'नया', 'ADJ', { Gender: 'Masc' }],
  // verbs: करना
  ['करता', 'करना', 'VERB', { Aspect: 'Imp', Gender: 'Masc', Number: 'Sing' }],
  ['करती', 'करना', 'VERB', { Aspect: 'Imp', Gender: 'Fem' }],
  ['करते', 'करना', 'VERB', { Aspect: 'Imp', Gender: 'Masc' }],
  ['किया', 'करना', 'VERB', { Aspect: 'Perf', Gender: 'Masc', Number: 'Sing' }],
  ['किए', 'करना', 'VERB', { Aspect: 'Perf', Gender: 'Masc' }],
  ['की', 'करना', 'VERB', { Aspect: 'Perf', Gender: 'Fem' }],
  ['करूँगा', 'करना', 'VERB', { Tense: 'Fut', Person: '1', Number: 'Sing', Gender: 'Masc' }],
  ['करेगी', 'करना', 'VERB', { Tense: 'Fut', Gender: 'Fem', Number: 'Sing' }],
  ['करेंगे', 'करना', 'VERB', { Tense: 'Fut', Number: 'Plur', Gender: 'Masc' }],
  ['करो', 'करना', 'VERB', { Mood: 'Imp' }],
  ['कीजिए', 'करना', 'VERB', { Mood: 'Imp', Polite: 'Form' }],
  ['करके', 'करना', 'VERB', { VerbForm: 'Conv' }],
  ['करने', 'करना', 'VERB', { VerbForm: 'Inf' }],
  ['कर', 'करना', 'VERB', { VerbForm: 'Stem,Conv' }],
  ['करें', 'करना', 'VERB', { Mood: 'Sub' }],
  // verbs: vowel stems and irregulars
  ['गया', 'जाना', 'VERB', { Aspect: 'Perf', Gender: 'Masc', Number: 'Sing' }],
  ['गई', 'जाना', 'VERB', { Aspect: 'Perf', Gender: 'Fem' }],
  ['गयी', 'जाना', 'VERB', { Aspect: 'Perf', Gender: 'Fem' }],
  ['गए', 'जाना', 'VERB', { Aspect: 'Perf', Gender: 'Masc' }],
  ['जाता', 'जाना', 'VERB', { Aspect: 'Imp' }],
  ['जाऊँगा', 'जाना', 'VERB', { Tense: 'Fut', Person: '1' }],
  ['जाएगा', 'जाना', 'VERB', { Tense: 'Fut', Number: 'Sing', Gender: 'Masc' }],
  ['जाओ', 'जाना', 'VERB', { Mood: 'Imp' }],
  ['जाइए', 'जाना', 'VERB', { Mood: 'Imp', Polite: 'Form' }],
  ['जाकर', 'जाना', 'VERB', { VerbForm: 'Conv' }],
  ['आया', 'आना', 'VERB', { Aspect: 'Perf', Gender: 'Masc', Number: 'Sing' }],
  ['आई', 'आना', 'VERB', { Aspect: 'Perf', Gender: 'Fem' }],
  ['आए', 'आना', 'VERB', { Aspect: 'Perf' }],
  ['आएगी', 'आना', 'VERB', { Tense: 'Fut', Gender: 'Fem' }],
  ['खाया', 'खाना', 'VERB', { Aspect: 'Perf', Gender: 'Masc', Number: 'Sing' }],
  ['खाती', 'खाना', 'VERB', { Aspect: 'Imp', Gender: 'Fem' }],
  ['खाओ', 'खाना', 'VERB', { Mood: 'Imp' }],
  ['पिया', 'पीना', 'VERB', { Aspect: 'Perf', Gender: 'Masc', Number: 'Sing' }],
  ['पीता', 'पीना', 'VERB', { Aspect: 'Imp' }],
  ['पीजिए', 'पीना', 'VERB', { Mood: 'Imp', Polite: 'Form' }],
  ['दिया', 'देना', 'VERB', { Aspect: 'Perf', Gender: 'Masc', Number: 'Sing' }],
  ['दी', 'देना', 'VERB', { Aspect: 'Perf', Gender: 'Fem' }],
  ['देता', 'देना', 'VERB', { Aspect: 'Imp' }],
  ['दूँगा', 'देना', 'VERB', { Tense: 'Fut', Person: '1' }],
  ['देगा', 'देना', 'VERB', { Tense: 'Fut' }],
  ['दीजिए', 'देना', 'VERB', { Mood: 'Imp', Polite: 'Form' }],
  ['लिया', 'लेना', 'VERB', { Aspect: 'Perf', Gender: 'Masc', Number: 'Sing' }],
  ['ली', 'लेना', 'VERB', { Aspect: 'Perf', Gender: 'Fem' }],
  ['लेकर', 'लेना', 'VERB', { VerbForm: 'Conv' }],
  ['सोया', 'सोना', 'VERB', { Aspect: 'Perf', Gender: 'Masc', Number: 'Sing' }],
  ['सोती', 'सोना', 'VERB', { Aspect: 'Imp', Gender: 'Fem' }],
  ['देखा', 'देखना', 'VERB', { Aspect: 'Perf', Gender: 'Masc', Number: 'Sing' }],
  ['देखी', 'देखना', 'VERB', { Aspect: 'Perf', Gender: 'Fem' }],
  ['देखेंगे', 'देखना', 'VERB', { Tense: 'Fut', Number: 'Plur' }],
  ['देखिए', 'देखना', 'VERB', { Mood: 'Imp', Polite: 'Form' }],
  ['देखकर', 'देखना', 'VERB', { VerbForm: 'Conv' }],
  ['कहा', 'कहना', 'VERB', { Aspect: 'Perf', Gender: 'Masc', Number: 'Sing' }],
  ['कहती', 'कहना', 'VERB', { Aspect: 'Imp', Gender: 'Fem' }],
  ['बोला', 'बोलना', 'VERB', { Aspect: 'Perf' }],
  ['समझा', 'समझना', 'VERB', { Aspect: 'Perf' }],
  ['समझती', 'समझना', 'VERB', { Aspect: 'Imp', Gender: 'Fem' }],
  ['रहा', 'रहना', 'VERB', { Aspect: 'Perf,Prog', Gender: 'Masc', Number: 'Sing' }],
  ['रही', 'रहना', 'VERB', { Gender: 'Fem' }],
  ['रहे', 'रहना', 'VERB', { Gender: 'Masc' }],
  // होना
  ['हूँ', 'होना', 'AUX', { Person: '1', Number: 'Sing', Tense: 'Pres' }],
  ['है', 'होना', 'AUX', { Number: 'Sing', Tense: 'Pres' }],
  ['हैं', 'होना', 'AUX', { Number: 'Plur', Tense: 'Pres' }],
  ['था', 'होना', 'AUX', { Tense: 'Past', Gender: 'Masc', Number: 'Sing' }],
  ['थी', 'होना', 'AUX', { Tense: 'Past', Gender: 'Fem' }],
  ['थे', 'होना', 'AUX', { Tense: 'Past', Gender: 'Masc', Number: 'Plur' }],
  ['होगा', 'होना', 'AUX', { Tense: 'Fut', Gender: 'Masc', Number: 'Sing' }],
  ['हुआ', 'होना', 'AUX', { Aspect: 'Perf', Gender: 'Masc', Number: 'Sing' }],
  ['हुई', 'होना', 'AUX', { Aspect: 'Perf', Gender: 'Fem' }],
];

/** Pronouns written together with a postposition: [form, lemma of the pronoun, the postposition, Case] */
export const FUSED: Array<[string, string, string, string]> = [
  ['उसने', 'वह', 'ने', 'Erg'], ['मैंने', 'मैं', 'ने', 'Erg'], ['उन्होंने', 'वे', 'ने', 'Erg'], ['किसने', 'कौन', 'ने', 'Erg'],
  ['मुझसे', 'मैं', 'से', 'Obl'], ['उसको', 'वह', 'को', 'Dat'], ['उससे', 'वह', 'से', 'Obl'], ['इसमें', 'यह', 'में', 'Obl'],
  ['आपको', 'आप', 'को', 'Dat'], ['तुमसे', 'तुम', 'से', 'Obl'], ['हमसे', 'हम', 'से', 'Obl'], ['किसको', 'कौन', 'को', 'Dat'],
];

/** What the word list knows about the lemmas used above. */
export const LEMMAS: Record<string, { pos: string; gender?: 'm' | 'f'; invariant?: boolean; ergative?: boolean }> = {
  'लड़का': { pos: 'NOUN', gender: 'm' }, 'कमरा': { pos: 'NOUN', gender: 'm' }, 'कुत्ता': { pos: 'NOUN', gender: 'm' },
  'बच्चा': { pos: 'NOUN', gender: 'm' }, 'घर': { pos: 'NOUN', gender: 'm' }, 'आदमी': { pos: 'NOUN', gender: 'm' },
  'दिन': { pos: 'NOUN', gender: 'm' }, 'पिता': { pos: 'NOUN', gender: 'm', invariant: true }, 'राजा': { pos: 'NOUN', gender: 'm', invariant: true },
  'लड़की': { pos: 'NOUN', gender: 'f' }, 'किताब': { pos: 'NOUN', gender: 'f' }, 'बात': { pos: 'NOUN', gender: 'f' },
  'बहन': { pos: 'NOUN', gender: 'f' }, 'माता': { pos: 'NOUN', gender: 'f' }, 'चिड़िया': { pos: 'NOUN', gender: 'f' },
  'कहानी': { pos: 'NOUN', gender: 'f' },
  'अच्छा': { pos: 'ADJ' }, 'बड़ा': { pos: 'ADJ' }, 'छोटा': { pos: 'ADJ' }, 'नया': { pos: 'ADJ' },
  'करना': { pos: 'VERB', ergative: true }, 'जाना': { pos: 'VERB', ergative: false }, 'आना': { pos: 'VERB', ergative: false },
  'खाना': { pos: 'VERB', ergative: true }, 'पीना': { pos: 'VERB', ergative: true }, 'देना': { pos: 'VERB', ergative: true },
  'लेना': { pos: 'VERB', ergative: true }, 'सोना': { pos: 'VERB', ergative: false }, 'देखना': { pos: 'VERB', ergative: true },
  'कहना': { pos: 'VERB', ergative: true }, 'बोलना': { pos: 'VERB' }, 'समझना': { pos: 'VERB' }, 'रहना': { pos: 'VERB', ergative: false },
  'होना': { pos: 'AUX', ergative: false },
};

/** Words that are not Hindi words at all: the engine must not give a confident reading. */
export const NONSENSE = ['ब्लॉर्फ़ता', 'झ्रक', 'क्वेट्ज़', 'ङङङ'];
