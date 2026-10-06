/**
 * The gaps the Hindi ladder plan (data/ladder/hi/PLAN.md, sections 6 and 7) found: frame words the word list lacked, the frequent
 * unlisted forms of the authentic books, the cast's names, the numerals 31-99, and the written forms that were read as another word
 * (the everyday noun beside a verb form: गाड़ी, भाई, सही, फल, the name सीता; two listed words that share an oblique plural: कमरों).
 * Machine-drafted rules: nothing here has been checked by a native speaker.
 */
import { describe, expect, it } from 'vitest';
import { hiLemmaInfo, hiLexicon } from '../../src/adapters/hi';
import { NOUN_FIRST } from '../../src/adapters/hindi/noun-first';
import { best, run } from './helpers';

const nfc = (s: string) => s.normalize('NFC');
/** The first reading of `form` in `sentence`. */
function first(sentence: string, form: string, nth = 0) {
  const r = run('hi', nfc(sentence));
  return best(r, nfc(form), nth);
}

const FRAME_NOUNS: Array<[string, 'm' | 'f' | 'mf']> = [
  ['संदेश', 'm'], ['सूचना', 'f'], ['गोली', 'f'], ['मरीज़', 'mf'], ['इंजेक्शन', 'm'], ['पट्टी', 'f'], ['ऑटो', 'm'], ['प्लेटफ़ॉर्म', 'm'], ['फ़ॉर्म', 'm'],
  ['आवेदन', 'm'], ['इंटरनेट', 'm'], ['कंप्यूटर', 'm'], ['फ़ोटो', 'm'], ['वीडियो', 'm'], ['दुआ', 'f'], ['पार्टी', 'f'], ['ख़त', 'm'], ['रिपोर्ट', 'f'],
  ['जेब', 'f'], ['इलाक़ा', 'm'], ['शिविर', 'm'], ['डेंगू', 'm'], ['मलेरिया', 'm'], ['कचरा', 'm'], ['मानसून', 'm'], ['इम्तिहान', 'm'],
  ['इलायची', 'f'], ['धान', 'm'], ['खेती', 'f'], ['दृश्य', 'm'], ['धुंध', 'f'], ['ट्रेनिंग', 'f'], ['सुविधा', 'f'], ['महँगाई', 'f'],
  ['तरक़्क़ी', 'f'], ['गंदगी', 'f'], ['सुधार', 'm'], ['प्रस्ताव', 'm'], ['राय', 'f'], ['सुझाव', 'm'], ['वोट', 'm'], ['चंदा', 'm'],
  ['अध्यक्ष', 'm'], ['निवेदन', 'm'], ['महोदय', 'm'], ['स्वीकार', 'm'], ['पिचकारी', 'f'], ['गुलाल', 'm'], ['पकवान', 'm'], ['ढोल', 'm'],
  ['सावधानी', 'f'], ['मच्छरदानी', 'f'], ['कूलर', 'm'], ['अनुभव', 'm'], ['सीख', 'f'], ['ट्रैफ़िक', 'm'], ['दाख़िला', 'm'], ['पाठ्यक्रम', 'm'],
  ['जायदाद', 'f'], ['दावत', 'f'], ['ग्रहण', 'm'], ['सूअर', 'm'], ['परदेस', 'm'],
];
const FRAME_ADJ = ['आदरणीय', 'फ़ेल', 'सहमत', 'सूचित'];

describe('6.1 of the plan: the frame words are in the list', () => {
  it('67 words: 63 nouns with a gender and 4 adjectives that do not change', () => {
    expect(FRAME_NOUNS.length + FRAME_ADJ.length).toBe(67);
    for (const [w, g] of FRAME_NOUNS) {
      expect(hiLexicon.find(nfc(w), 'NOUN'), `${w} is a listed noun`).toBeDefined();
      expect(hiLemmaInfo(nfc(w), 'NOUN')?.gender, `${w}: gender`).toBe(g);
    }
    for (const w of FRAME_ADJ) {
      expect(hiLexicon.find(nfc(w), 'ADJ'), `${w} is a listed adjective`).toBeDefined();
      expect(hiLemmaInfo(nfc(w), 'ADJ')?.invariant, `${w} does not change`).toBe(true);
    }
  });

  it('each reads as itself bare, in two frames, and in the plural or oblique the rules make of it', () => {
    for (const [w, g] of FRAME_NOUNS) {
      const frames = g === 'f' ? [`यह ${w} है।`, `मेरी ${w} अच्छी है।`] : [`यह ${w} है।`, `मेरा ${w} अच्छा है।`];
      for (const f of frames) expect(first(f, w).lemma, f).toBe(nfc(w));
      expect(first(w, w).lemma, `${w} alone`).toBe(nfc(w));
      const entry = hiLexicon.find(nfc(w), 'NOUN')!;
      for (const f of new Set(entry.forms.map((x) => x.form))) expect(first(f, f).lemma, `${f} of ${w}`).toBe(nfc(w));
    }
    for (const w of FRAME_ADJ) expect(first(`वह ${w} है।`, w).lemma).toBe(nfc(w));
  });

  it('the plural and oblique plural of the new nouns are the rules\' (डेंगू, इलायची, कचरा)', () => {
    expect(first('इलायचियाँ अच्छी हैं।', 'इलायचियाँ').lemma).toBe('इलायची');
    expect(first('कचरे में मत फेंको।', 'कचरे').lemma).toBe('कचरा');
    expect(first('हम सब मरीज़ों को देखेंगे।', 'मरीज़ों').lemma).toBe(nfc('मरीज़'));
  });
});

describe('6.2 of the plan: the frequent unlisted forms and the names', () => {
  const WORDS: Array<[string, string]> = [
    ['जीव', 'NOUN'], ['नज़र', 'NOUN'], ['काका', 'NOUN'], ['पालतू', 'ADJ'], ['हॉकी', 'NOUN'], ['टीम', 'NOUN'], ['मम्मी', 'NOUN'], ['तेज़ी', 'NOUN'], ['जादू', 'NOUN'],
    ['विमान', 'NOUN'], ['वापस', 'ADV'], ['पार', 'NOUN'], ['सर', 'NOUN'], ['पैदा', 'ADJ'], ['टीचर', 'NOUN'], ['बाँस', 'NOUN'], ['मुखिया', 'NOUN'], ['विशालकाय', 'ADJ'],
    ['झटपट', 'ADV'], ['महसूस', 'ADJ'], ['देवी', 'NOUN'], ['टूथपेस्ट', 'NOUN'], ['तय', 'ADJ'], ['ना', 'PART'],
  ];
  it(`${WORDS.length} words are listed, and a sentence reads each as its lemma`, () => {
    for (const [w, pos] of WORDS) {
      expect(hiLexicon.find(nfc(w), pos as never), `${w}/${pos}`).toBeDefined();
      expect(first(`यह ${w}।`, w).lemma, w).toBe(nfc(w));
    }
  });
  it('the colloquial वो, the spelling बिल्कुल and यानि are read as वह, बिलकुल and यानी, and say which spelling they are', () => {
    const vo = first('वो घर गया।', 'वो');
    expect(vo.lemma).toBe('वह');
    expect(vo.notes?.variantOf).toBe('वह');
    expect(first('यह बिल्कुल ठीक है।', 'बिल्कुल').lemma).toBe('बिलकुल');
    expect(first('यानि सब ठीक है।', 'यानि').lemma).toBe('यानी');
  });
  it('नन्ही is the feminine of the listed नन्हा', () => {
    expect(first('नन्ही चिड़िया उड़ी।', 'नन्ही').lemma).toBe('नन्हा');
  });
  const NAMES = ['सैम', 'अमन', 'जॉन', 'डेविड', 'लखनऊ', 'भबलू', 'मोरू', 'मुमताज़', 'कल्लू', 'अनु', 'मुनिया', 'टूका', 'रीति', 'मुत्तज्जी', 'जादव', 'मिठु', 'पपलू', 'श्रीनिवास', 'अर्जुन', 'मुन्नु', 'चीकू', 'सोनू', 'रज़ा', 'अकबर', 'रवि', 'मीरा'];
  it(`${NAMES.length} names are proper names, alone and in three frames (रवि and मीरा both: the adults of Stage 0 and the children of the drafts)`, () => {
    for (const n of NAMES) {
      for (const s of [n, `${n} जी घर गए।`, `${n} ने कहा।`, `यह ${n} है।`]) {
        const c = first(s, n);
        expect([c.lemma, c.pos], s).toEqual([nfc(n), 'PROPN']);
      }
    }
  });
});

describe('7.8 of the plan: the numerals 31-99', () => {
  const NUMS = 'इकतीस बत्तीस तैंतीस चौंतीस पैंतीस छत्तीस सैंतीस अड़तीस उनतालीस इकतालीस बयालीस तैंतालीस चौवालीस पैंतालीस छियालीस सैंतालीस अड़तालीस उनचास इक्यावन बावन तिरपन चौवन पचपन छप्पन सत्तावन अट्ठावन उनसठ इकसठ बासठ तिरसठ चौंसठ पैंसठ छियासठ सड़सठ अड़सठ उनहत्तर इकहत्तर बहत्तर तिहत्तर चौहत्तर पचहत्तर छिहत्तर सतहत्तर अठहत्तर उनासी इक्यासी बयासी तिरासी चौरासी पचासी छियासी सत्तासी अट्ठासी नवासी इक्यानवे बानवे तिरानवे चौरानवे पंचानवे छियानवे सत्तानवे अट्ठानवे निन्यानवे'.split(' ');
  it('every number word from 31 to 99 (the round tens were there) is a NUM lemma of its own', () => {
    expect(NUMS.length).toBe(63); // 31-99 without the six round tens that were already there
    const all = new Set(hiLexicon.entries.filter((e) => e.pos === 'NUM').map((e) => e.lemma));
    for (const n of NUMS) {
      expect(all.has(nfc(n)), n).toBe(true);
      expect(first(`मेरे पास ${n} रुपये हैं।`, n).lemma, n).toBe(nfc(n));
      expect(first(`मेरे पास ${n} रुपये हैं।`, n).pos, n).toBe('NUM');
    }
  });
  it('spelling variants are one lemma', () => {
    expect(first('चवालीस', 'चवालीस').lemma).toBe('चौवालीस');
    expect(first('तिरेपन', 'तिरेपन').lemma).toBe('तिरपन');
  });
});

describe('7.1 / 7.1b of the plan: the everyday noun beside a verb form', () => {
  const ALONE = [...NOUN_FIRST.keys()].map((k) => k.split('|') as [string, string]);
  it('every word of the list is read as itself when it stands alone, and in a comma list', () => {
    expect(ALONE.length).toBeGreaterThanOrEqual(45);
    for (const [lemma, pos] of ALONE) {
      const c = first(lemma, lemma);
      expect([c.lemma, c.pos], `${lemma} alone`).toEqual([nfc(lemma), pos]);
    }
    const list = ALONE.map(([l]) => l).join(', ');
    const r = run('hi', nfc(list));
    ALONE.forEach(([lemma, pos], k) => {
      const c = best(r, nfc(lemma), 0);
      expect([c.lemma, c.pos], `${lemma} in a list (${k})`).toEqual([nfc(lemma), pos]);
    });
  });

  const NOUN_FRAMES: Array<[string, string, string]> = [
    ['मुझे खाँसी है।', 'खाँसी', 'खाँसी'], ['खाँसी की दवा दीजिए।', 'खाँसी', 'खाँसी'],
    ['यह मेरी गाड़ी है।', 'गाड़ी', 'गाड़ी'], ['गाड़ी आ गई।', 'गाड़ी', 'गाड़ी'], ['उसने गाड़ी चलाई।', 'गाड़ी', 'गाड़ी'],
    ['उसकी कमाई कम है।', 'कमाई', 'कमाई'], ['बच्चों की पढ़ाई ज़रूरी है।', 'पढ़ाई', 'पढ़ाई'],
    ['मैंने एक फल खाया।', 'फल', 'फल'], ['उसने फल लिए।', 'फल', 'फल'], ['बाज़ार से फल लाओ।', 'फल', 'फल'],
    ['मेरा भाई स्कूल जाता है।', 'भाई', 'भाई'], ['भाई ने कहा।', 'भाई', 'भाई'], ['मैं अपने भाई के साथ गया।', 'भाई', 'भाई'],
    ['यह जवाब सही है।', 'सही', 'सही'], ['आपने सही कहा।', 'सही', 'सही'],
    ['सीता जी घर गईं।', 'सीता', 'सीता'], ['सीता नानी के घर रहती हैं।', 'सीता', 'सीता'], ['सीता ने कहा।', 'सीता', 'सीता'], ['सीता खाना बनाती है।', 'सीता', 'सीता'],
    ['वह सबसे बड़ा है।', 'सबसे', 'सबसे'], ['फिर हम घर गए।', 'फिर', 'फिर'], ['वह फिर आया।', 'फिर', 'फिर'],
    ['उसकी सोच बहुत अच्छी है।', 'सोच', 'सोच'], ['इस खेल में दस लोग हैं।', 'खेल', 'खेल'], ['यह हमारी हार है।', 'हार', 'हार'], ['यह हमारी जीत है।', 'जीत', 'जीत'],
    ['उसकी हँसी बहुत मीठी है।', 'हँसी', 'हँसी'], ['मुझे बहुत दुख है।', 'दुख', 'दुख'], ['वह बहुत दुखी है।', 'दुखी', 'दुखी'],
    ['पेड़ की डाल टूट गई।', 'डाल', 'डाल'], ['यह घड़ा पानी से भरा है।', 'भरा', 'भरा'], ['वह बहुत थका है।', 'थका', 'थका'],
    ['यह उनकी बोली है।', 'बोली', 'बोली'], ['यह जूतों का जोड़ा है।', 'जोड़ा', 'जोड़ा'], ['दिन भर काम करो।', 'भर', 'भर'],
    ['यह फ़ोटो बहुत अच्छा है।', 'फ़ोटो', 'फ़ोटो'], ['मुझे कुछ दिखाई नहीं देता।', 'दिखाई', 'दिखाई'],
  ];
  it(`${NOUN_FRAMES.length} frames of the plan's kind: the noun, the adjective, the adverb or the name wins`, () => {
    for (const [s, f, want] of NOUN_FRAMES) expect(first(s, f).lemma, s).toBe(nfc(want));
  });

  const VERB_FRAMES: Array<[string, string, string]> = [
    ['वह कपड़े सीता है।', 'सीता', 'सीना'],
    ['मैं बच्चों के साथ खेल रहा हूँ।', 'खेल', 'खेलना'], ['मैं सोच रहा हूँ।', 'सोच', 'सोचना'], ['मैं यह काम सोच लूँगा।', 'सोच', 'सोचना'],
    ['उसने सोच लिया।', 'सोच', 'सोचना'], ['हम कल मैच जीत लेंगे।', 'जीत', 'जीतना'], ['आटे में पानी डाल दो।', 'डाल', 'डालना'],
    ['यह पेड़ फल रहा है।', 'फल', 'फलना'], ['वह बहुत हँसी।', 'हँसी', 'हँसना'], ['माँ बोली।', 'बोली', 'बोलना'], ['गौरी बोली।', 'बोली', 'बोलना'],
    ['मैं यह सीख रहा हूँ।', 'सीख', 'सीखना'], ['वह रोज़ नाच रही है।', 'नाच', 'नाचना'], ['बच्चे दौड़ रहे हैं।', 'दौड़', 'दौड़ना'],
    ['उसने उसे घर में भर लिया।', 'भर', 'भरना'], ['पेट कितना भर गया!', 'भर', 'भरना'], ['कमरा पानी से भरा गया।', 'भरा', 'भरना'],
    ['उसने सब दुख सही।', 'सही', 'सहना'], ['उसने घड़ा भरा।', 'भरा', 'भरना'], ['उसने सीधे जवाब दिया।', 'दिया', 'देना'],
  ];
  it(`${VERB_FRAMES.length} verb frames: the verb reading is still first where a neighbour speaks for it`, () => {
    for (const [s, f, want] of VERB_FRAMES) expect(first(s, f).lemma, s).toBe(nfc(want));
  });

  it('the other reading stays on the list, one tap away', () => {
    const r = run('hi', nfc('सीता'));
    expect(r.analyses[0].candidates.map((c) => `${c.lemma}/${c.pos}`)).toEqual(expect.arrayContaining(['सीता/PROPN', 'सीना/VERB']));
    const g = run('hi', nfc('गाड़ी'));
    expect(g.analyses[0].candidates.map((c) => `${c.lemma}/${c.pos}`)).toEqual(expect.arrayContaining(['गाड़ी/NOUN', 'गाड़ना/VERB']));
    const k = first('मुझे खाँसी है।', 'खाँसी');
    expect(k.notes?.context).toMatch(/everyday word/);
  });

  it('the inflected forms of a noun-like word are the rules\' (the plural of समझ is not the subjunctive: हम समझें)', () => {
    expect(first('हम समझें।', 'समझें').lemma).toBe('समझना');
    expect(first('ताकि हम समझें।', 'समझें').lemma).toBe('समझना');
  });
});

describe('7.5 of the plan: oblique plurals and feminine plurals in -ें', () => {
  it('the everyday word is first where two listed words share the form (कमरों is "rooms", not "waists")', () => {
    for (const [s, f, want] of [
      ['सब कमरों में बत्ती है।', 'कमरों', 'कमरा'], ['घर के कमरों में हवा है।', 'कमरों', 'कमरा'],
      ['सब तालों में चाबी लगाओ।', 'तालों', 'ताला'], ['गाँव के मेलों में भीड़ होती है।', 'मेलों', 'मेला'],
      ['उसके वादों पर भरोसा मत करो।', 'वादों', 'वादा'], ['आसमान में तारों को देखो।', 'तारों', 'तारा'],
    ]) expect(first(s, f).lemma, s).toBe(want);
    // the other word is one tap away
    expect(run('hi', 'कमरों').analyses[0].candidates.map((c) => c.lemma)).toEqual(expect.arrayContaining(['कमरा', 'कमर']));
  });

  it('a feminine plural in -ें is a noun where "to be" follows, or where it opens a clause before its predicate, and a verb after a subject pronoun', () => {
    for (const [s, f, want] of [
      ['घर में गायें हैं।', 'गायें', 'गाय'], ['गायें घास खाती हैं।', 'गायें', 'गाय'], ['मेले में दुकानें हैं।', 'दुकानें', 'दुकान'],
      ['कई सोचें हैं।', 'सोचें', 'सोच'], ['मेरी सोचें अलग हैं।', 'सोचें', 'सोच'], ['तुम गायें घर लाओ।', 'गायें', 'गाय'],
      ['आप सोचें।', 'सोचें', 'सोचना'], ['ताकि वे सोचें।', 'सोचें', 'सोचना'], ['हम बातें करें।', 'करें', 'करना'],
    ]) expect(first(s, f).lemma, s).toBe(want);
  });
});

describe('the adapter is version 4', () => {
  it('its readings name the version, so that imported Hindi texts are analysed again', () => {
    expect(run('hi', 'घर').analyses[0].analyzer).toBe('adapter-hi@4');
  });
});
