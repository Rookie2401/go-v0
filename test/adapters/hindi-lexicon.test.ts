/**
 * The Hindi word list (package H3): row format, size, closed classes, nukta, register groups. Everything here holds whether the
 * sibling modules (rules, phrases, pronunciation …) are stubs or real: it asserts properties of the list and of listed words,
 * not counts of anything the rules or detectors produce.
 */
import { describe, expect, it } from 'vitest';
import type { PartOfSpeech } from '../../src/core';
import { hiAdapter, hiDomainsOf, hiLemmaInfo, hiLexicon, hiLexiconProblems, hiLexiconStats } from '../../src/adapters/hi';
import { buildRows, parseRows, HI_DOMAINS, HI_REGISTERS, annotationKey } from '../../src/adapters/hindi/entries';
import { FUNCTION_ROWS } from '../../src/adapters/hindi/lexicon-function';
import { NUMBER_TIME_ROWS } from '../../src/adapters/hindi/lexicon-numbers-time';
import { VERB_ROWS } from '../../src/adapters/hindi/lexicon-verbs';
import { NOUN_HOME_ROWS } from '../../src/adapters/hindi/lexicon-nouns-home';
import { NOUN_WORLD_ROWS } from '../../src/adapters/hindi/lexicon-nouns-world';
import { NOUN_FAITH_ROWS } from '../../src/adapters/hindi/lexicon-nouns-faith';
import { ADJECTIVE_ROWS } from '../../src/adapters/hindi/lexicon-modifiers';
import { COURSE_ROWS } from '../../src/adapters/hindi/lexicon-course';
import { VERB_MORE_ROWS } from '../../src/adapters/hindi/lexicon-more-verbs';
import { WORD_MORE_ROWS } from '../../src/adapters/hindi/lexicon-more-words';
import { EXTRA_MORE_ROWS } from '../../src/adapters/hindi/lexicon-more-extra';
import { REGISTER_GROUPS, registerGroupOf, registerOf } from '../../src/adapters/hindi/registers';
import { HI_VARIETIES } from '../../src/adapters/hindi/varieties';
import { loadBundledCorpus } from '../../src/ingest';
import { run } from './helpers';

const BLOCKS: Record<string, string> = {
  function: FUNCTION_ROWS, 'numbers-time': NUMBER_TIME_ROWS, verbs: VERB_ROWS, 'nouns-home': NOUN_HOME_ROWS,
  'nouns-world': NOUN_WORLD_ROWS, 'nouns-faith': NOUN_FAITH_ROWS, modifiers: ADJECTIVE_ROWS, course: COURSE_ROWS, 'more-verbs': VERB_MORE_ROWS, 'more-words': WORD_MORE_ROWS, 'more-extra': EXTRA_MORE_ROWS,
};
const ROWS = Object.entries(BLOCKS).flatMap(([label, src]) => parseRows(src, label));

/** The nukta sign (U+093C), and the precomposed nukta letters U+0958-U+095F that NFC decomposes: written as code points, so that no editor can fold them. */
const NUKTA = String.fromCodePoint(0x093c);
const PRECOMPOSED = new RegExp(`[${String.fromCodePoint(0x0958)}-${String.fromCodePoint(0x095f)}]`, 'u');

const POSES = (word: string): PartOfSpeech[] => {
  const r = run('hi', word);
  return [...new Set(r.analyses[0].candidates.map((c) => c.pos as PartOfSpeech))];
};

describe('the row format', () => {
  it('a malformed row throws, and says where', () => {
    expect(() => parseRows('x = y', 't')).toThrow(/t:1: a row before any section header/);
    expect(() => parseRows('# FOO\nx = y', 't')).toThrow(/unknown part of speech/);
    expect(() => parseRows('# NOUN\nघर/m', 't')).toThrow(/expected "lemma = gloss"/);
    expect(() => parseRows('# NOUN\nघर = house', 't')).toThrow(/noun needs a gender/);
    expect(() => parseRows('# VERB\nकरना = to do [bogus]', 't')).toThrow(/unknown tag "bogus"/);
    expect(() => parseRows('# NOUN\nघर/m = house [erg]', 't')).toThrow(/belongs to a verb/);
    expect(() => parseRows('# NOUN\nघर/m = house [d:nowhere]', 't')).toThrow(/unknown tag/);
    expect(() => parseRows('# NOUN\n## d:nowhere\nघर/m = house', 't')).toThrow(/unknown domain/);
    expect(() => buildRows(parseRows('# NOUN\nघर/m = house | @verb:c'))).toThrow(/infinitive/);
    expect(() => buildRows(parseRows('# VERB\nसमझना = to understand | @verb:v'))).toThrow(/needs a stem in/);
    expect(() => buildRows(parseRows('# ADJ\nसुंदर = beautiful | @adj'))).toThrow(/needs a word in/);
    expect(() => buildRows(parseRows('# VERB\nसमझना = to understand | @nothing'))).toThrow(/unknown macro/);
  });

  it('with a problems list a bad row is collected and skipped, so a typo never stops the module from loading', () => {
    const problems: string[] = [];
    const rows = parseRows('# NOUN\nघर = house\nदिन/m = day\n# BOGUS\n', 't', problems);
    expect(rows.map((r) => r.lemma)).toEqual(['दिन']);
    expect(problems.length).toBe(2);
    const built = buildRows(parseRows('# VERB\nसमझना = to understand | @verb:v\nदेखना = to see | @verb:c'), new Set(), problems);
    expect(built.entries.map((e) => e.lemma)).toEqual(['देखना']);
    expect(problems.join(' ')).toMatch(/needs a stem/);
  });

  it('the shipped word list has no problems and no duplicate lemma + part of speech', () => {
    expect(hiLexiconProblems).toEqual([]);
    expect(hiLexiconStats.duplicates).toEqual([]);
    const seen = new Set<string>();
    for (const r of ROWS) {
      const k = annotationKey(r.lemma, r.pos);
      expect(seen.has(k), `duplicate row ${k}`).toBe(false);
      seen.add(k);
    }
    expect(seen.size).toBe(hiLexicon.entries.length);
  });

  it('every tag on a row is known: registers are the documented ones, domains are in HI_DOMAINS', () => {
    for (const r of ROWS) {
      for (const t of r.register) expect(HI_REGISTERS.has(t), `${r.lemma}: ${t}`).toBe(true);
      for (const d of r.domains) expect(HI_DOMAINS.has(d), `${r.lemma}: ${d}`).toBe(true);
    }
    expect(hiDomainsOf('माँ')).toContain('family');
    expect(hiDomainsOf('प्रार्थना')).toEqual(expect.arrayContaining(['prayer', 'church']));
    expect(hiDomainsOf('खाना', 'NOUN')).toContain('food');
    expect(hiDomainsOf('नहीं')).toEqual([]);
  });
});

describe('size and shape of the list', () => {
  const by = hiLexiconStats.byPos;
  it(`about 1,300-2,600 lemmas (${hiLexiconStats.lemmas}): ${Object.entries(by).map(([p, n]) => `${p} ${n}`).join(', ')}`, () => {
    expect(hiLexiconStats.lemmas).toBeGreaterThanOrEqual(1300);
    expect(hiLexiconStats.lemmas).toBeLessThanOrEqual(2600);
    expect(by.VERB + by.AUX).toBeGreaterThanOrEqual(300);
    expect(by.NOUN).toBeGreaterThanOrEqual(600);
    expect(by.ADJ).toBeGreaterThanOrEqual(200);
    expect(by.ADV).toBeGreaterThanOrEqual(80);
    expect(by.PRON).toBeGreaterThanOrEqual(18);
    expect(by.ADP).toBeGreaterThanOrEqual(30);
    expect(by.NUM).toBeGreaterThanOrEqual(35);
    expect(by.PROPN).toBeGreaterThanOrEqual(60);
  });

  it('every noun has a gender (the row says it, and every form of it carries Gender)', () => {
    const nouns = ROWS.filter((r) => r.pos === 'NOUN');
    expect(nouns.length).toBeGreaterThanOrEqual(600);
    for (const r of nouns) {
      expect(r.gender, r.lemma).toBeDefined();
      const e = hiLexicon.find(r.lemma, 'NOUN')!;
      for (const f of e.forms) expect(f.morph.Gender, `${r.lemma} ${f.form}`).toBeDefined();
      expect(hiLemmaInfo(r.lemma, 'NOUN')?.gender, r.lemma).toBe(r.gender);
    }
  });

  it('genders of well-known nouns', () => {
    const gender = (w: string) => hiLemmaInfo(w, 'NOUN')?.gender;
    for (const w of ['माँ', 'बहन', 'बेटी', 'किताब', 'दुनिया', 'रोटी', 'आँख', 'क्षमा', 'प्रार्थना', 'कलीसिया', 'गवाही', 'आत्मा', 'ज़िंदगी', 'मौत']) expect(gender(w), w).toBe('f');
    for (const w of ['पिता', 'भाई', 'बेटा', 'घर', 'दिन', 'पाप', 'परमेश्वर', 'पानी', 'दिल', 'प्रभु', 'स्वर्ग', 'क्रूस', 'अनुग्रह', 'विश्वास', 'पश्चाताप', 'उद्धार']) expect(gender(w) ?? hiLemmaInfo(w, 'PROPN')?.gender, w).toBe('m');
    expect(gender('दोस्त')).toBe('mf');
  });

  it('nouns and adjectives that do not change carry inv; adjectives in -ा get their paradigm', () => {
    for (const w of ['पिता', 'राजा', 'पापा', 'चाचा', 'मामा']) expect(hiLemmaInfo(w, 'NOUN')?.invariant, w).toBe(true);
    for (const w of ['सुंदर', 'लाल', 'शांत', 'पवित्र', 'ज़रूरी']) expect(hiLemmaInfo(w, 'ADJ')?.invariant, w).toBe(true);
    for (const w of ['छोटा', 'बड़ा', 'अच्छा', 'काला']) expect(hiLemmaInfo(w, 'ADJ')?.invariant, w).toBeUndefined();
    const forms = (lemma: string) => hiLexicon.find(lemma, 'ADJ')!.forms.map((f) => f.form).sort();
    expect(forms('छोटा')).toEqual(['छोटा', 'छोटी', 'छोटी', 'छोटे', 'छोटे'].sort());
    expect(forms('लाल')).toEqual(['लाल']);
    expect(forms('शांत')).toEqual(['शांत']);
  });

  it('verbs: ergative flags where certain, causatives point to a verb in the list', () => {
    const erg = (w: string) => hiLemmaInfo(w, w === 'होना' ? 'AUX' : 'VERB')?.ergative;
    for (const w of ['करना', 'देखना', 'खाना', 'पढ़ना', 'लेना', 'देना', 'कहना', 'समझना']) expect(erg(w), w).toBe(true);
    for (const w of ['जाना', 'आना', 'होना', 'बैठना', 'रहना', 'मरना', 'गिरना']) expect(erg(w), w).toBe(false);
    const verbs = ROWS.filter((r) => r.pos === 'VERB');
    const caus = verbs.filter((r) => r.causativeOf);
    expect(caus.length).toBeGreaterThanOrEqual(60);
    for (const r of caus) expect(hiLexicon.find(r.causativeOf!, 'VERB'), `${r.lemma} is the causative of ${r.causativeOf}`).toBeDefined();
    const pairs: Array<[string, string]> = [
      ['कराना', 'करना'], ['करवाना', 'करना'], ['दिखाना', 'देखना'], ['सुनाना', 'सुनना'], ['पढ़ाना', 'पढ़ना'], ['सिखाना', 'सीखना'], ['खिलाना', 'खाना'],
      ['पिलाना', 'पीना'], ['बनाना', 'बनना'], ['उठाना', 'उठना'], ['बिठाना', 'बैठना'], ['चलाना', 'चलना'], ['जगाना', 'जागना'], ['सुलाना', 'सोना'],
    ];
    for (const [c, b] of pairs) expect(hiLemmaInfo(c, 'VERB')?.causativeOf, c).toBe(b);
    for (const r of verbs) expect(r.lemma.endsWith('ना'), r.lemma).toBe(true);
  });

  it('regular verb forms come out right (the macro)', () => {
    const lemmaOf = (form: string, lemma: string) => hiLexicon.lookup(form).some((h) => h.entry.lemma === lemma);
    const morphOf = (form: string, lemma: string) => hiLexicon.lookup(form).filter((h) => h.entry.lemma === lemma).map((h) => h.form.morph);
    for (const f of ['समझना', 'समझने', 'समझ', 'समझता', 'समझते', 'समझती', 'समझतीं', 'समझा', 'समझे', 'समझी', 'समझीं', 'समझूँ', 'समझें', 'समझो', 'समझिए', 'समझूँगा', 'समझूँगी', 'समझेगा', 'समझेगी', 'समझेंगे', 'समझेंगी', 'समझोगे', 'समझोगी', 'समझकर']) {
      expect(lemmaOf(f, 'समझना'), f).toBe(true);
    }
    for (const f of ['खाना', 'खाने', 'खा', 'खाता', 'खाया', 'खाए', 'खाई', 'खाईं', 'खाऊँ', 'खाएँ', 'खाओ', 'खाइए', 'खाऊँगा', 'खाएगा', 'खाएँगे', 'खाओगे']) expect(lemmaOf(f, 'खाना'), f).toBe(true);
    for (const f of ['देना', 'दे', 'देता', 'दिया', 'दिए', 'दी', 'दीं', 'दूँ', 'दें', 'दो', 'दीजिए', 'दूँगा', 'देगा', 'देंगे', 'दोगे']) expect(lemmaOf(f, 'देना'), f).toBe(true);
    for (const f of ['लिया', 'ली', 'लूँगा', 'लेंगे', 'लीजिए', 'लें']) expect(lemmaOf(f, 'लेना'), f).toBe(true);
    for (const f of ['किया', 'की', 'कीं', 'कीजिए', 'करूँगा', 'करेंगे', 'कर', 'करके', 'करने']) expect(lemmaOf(f, 'करना'), f).toBe(true);
    for (const f of ['गया', 'गई', 'गए', 'गईं', 'जाता', 'जाऊँगा', 'जाइए', 'जाकर']) expect(lemmaOf(f, 'जाना'), f).toBe(true);
    for (const f of ['था', 'थी', 'थे', 'थीं', 'हूँ', 'है', 'हैं', 'हो', 'हुआ', 'हुई', 'होगा', 'होंगे', 'हूँगा']) expect(lemmaOf(f, 'होना'), f).toBe(true);
    for (const f of ['पिया', 'पीता', 'पीजिए', 'पिऊँगा']) expect(lemmaOf(f, 'पीना'), f).toBe(true);
    // features
    expect(morphOf('समझतीं', 'समझना')[0]).toMatchObject({ VerbForm: 'Part', Aspect: 'Imp', Gender: 'Fem', Number: 'Plur' });
    expect(morphOf('गई', 'जाना')[0]).toMatchObject({ VerbForm: 'Part', Aspect: 'Perf', Gender: 'Fem', Number: 'Sing' });
    expect(morphOf('समझूँगा', 'समझना')[0]).toMatchObject({ Tense: 'Fut', Person: '1', Number: 'Sing', Gender: 'Masc' });
    expect(morphOf('समझ', 'समझना')[0]).toMatchObject({ VerbForm: 'Stem' });
    expect(morphOf('करके', 'करना')[0]).toMatchObject({ VerbForm: 'Conv' });
    expect(morphOf('समझिए', 'समझना')[0]).toMatchObject({ Mood: 'Imp', Polite: 'Form' });
  });
});

describe('Unicode: NFC, and the nukta stays a sign of its own', () => {
  it('every source block is already NFC and holds no precomposed nukta letter (U+0958-U+095F)', () => {
    for (const [label, src] of Object.entries(BLOCKS)) {
      expect(src === src.normalize('NFC'), `${label} is NFC`).toBe(true);
      expect(PRECOMPOSED.test(src), `${label} has a precomposed nukta letter`).toBe(false);
    }
  });

  it('every lemma and every explicit form in the list is NFC', () => {
    for (const e of hiLexicon.entries) {
      expect(e.lemma === e.lemma.normalize('NFC'), e.lemma).toBe(true);
      for (const f of e.forms) expect(f.form === f.form.normalize('NFC'), `${e.lemma} ${f.form}`).toBe(true);
    }
  });

  it('words with a nukta are stored with it: ज़रूरत, not जरूरत', () => {
    const nukta = ['ज़रूरत', 'ज़िंदगी', 'ज़्यादा', 'ज़रा', 'ज़रूर', 'ज़मीन', 'ज़ोर', 'फ़ोन', 'फ़सल', 'फ़ौज', 'फ़र्ज़', 'क़ीमत', 'क़ानून', 'क़र्ज़', 'ख़ुशी', 'ख़बर', 'ख़ून', 'ख़तरा', 'ग़रीब', 'ग़लती', 'ग़ुस्सा', 'बाग़', 'काग़ज़', 'तरफ़', 'सिर्फ़', 'सज़ा', 'राज़', 'मज़ाक़', 'दरवाज़ा', 'आवाज़', 'वक़्त', 'तारीख़', 'हफ़्ता', 'साफ़', 'काफ़ी', 'फ़िलहाल'];
    for (const w of nukta) {
      expect(w.includes(NUKTA), `${w} is typed with a nukta`).toBe(true);
      expect(hiLexicon.find(w), `${w} is in the list`).toBeDefined();
      const bare = w.split(NUKTA).join('');
      // the bare spelling is a different form: it is never an entry of its own unless it is a different word (राज is, जरा is not)
      if (bare !== 'राज') expect(hiLexicon.find(bare), `${bare} must not be listed as a lemma`).toBeUndefined();
    }
    expect(hiLexicon.find('राज', 'NOUN')?.gloss).toMatch(/rule|reign/);
    expect(hiLexicon.find('राज़', 'NOUN')?.gloss).toMatch(/secret/);
    // forms are looked up by exact identity: the bare spelling of a listed form has no hand reading
    expect(hiLexicon.lookup('ज़रा').length).toBeGreaterThan(0);
    expect(hiLexicon.lookup('जरा')).toEqual([]);
    expect(hiLexicon.lookup('सज़ा').length).toBeGreaterThan(0);
  });
});

describe('closed classes: every word analysed with the right part of speech', () => {
  const TABLE: Record<PartOfSpeech, string[]> = {
    PRON: ['मैं', 'मैंने', 'मुझ', 'मुझे', 'मुझको', 'मुझसे', 'हम', 'हमने', 'हमें', 'तू', 'तूने', 'तुझे', 'तुम', 'तुमने', 'तुम्हें', 'आप', 'आपने', 'आपको',
      'यह', 'इस', 'इसे', 'इसने', 'ये', 'इन', 'इन्हें', 'इन्होंने', 'वह', 'उस', 'उसे', 'उसने', 'वे', 'उन', 'उन्हें', 'उन्होंने', 'कौन', 'किस', 'किसे',
      'किसने', 'किन', 'क्या', 'जो', 'जिस', 'जिसे', 'जिसने', 'जिन', 'कोई', 'किसी', 'कुछ', 'सब', 'सभी', 'खुद', 'स्वयं'],
    DET: ['मेरा', 'मेरे', 'मेरी', 'हमारा', 'हमारी', 'तेरा', 'तुम्हारा', 'आपका', 'आपकी', 'उसका', 'उसकी', 'इसका', 'उनका', 'उनकी', 'अपना', 'अपने', 'अपनी', 'किसका', 'जिसका', 'हर', 'कई'],
    ADP: ['का', 'के', 'की', 'को', 'में', 'पर', 'से', 'ने', 'तक', 'लिए', 'साथ', 'पास', 'बाद', 'पहले', 'ऊपर', 'नीचे', 'अंदर', 'बाहर', 'सामने', 'पीछे', 'बीच', 'बिना',
      'द्वारा', 'ओर', 'तरफ़', 'तरह', 'बारे', 'कारण', 'वजह', 'बजाय', 'अलावा'],
    CONJ: ['और', 'या', 'लेकिन', 'पर', 'मगर', 'परन्तु', 'किन्तु', 'इसलिए'],
    SCONJ: ['क्योंकि', 'कि', 'ताकि', 'अगर', 'यदि', 'जब', 'जैसे'],
    PART: ['भी', 'ही', 'तो', 'न', 'मत', 'सिर्फ़', 'केवल'],
    ADV: ['नहीं', 'अब', 'तब', 'फिर', 'कभी', 'अभी', 'आज', 'कल', 'परसों', 'यहाँ', 'वहाँ', 'जहाँ', 'कहाँ', 'कब', 'क्यों', 'कैसे', 'ऐसे', 'बहुत', 'थोड़ा', 'ज़्यादा', 'कम', 'हमेशा', 'शायद', 'ज़रूर'],
    INTJ: ['हाँ', 'जी', 'नमस्ते', 'धन्यवाद'],
    NUM: ['एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ', 'दस', 'ग्यारह', 'बारह', 'बीस', 'तीस', 'चालीस', 'पचास', 'सौ', 'हज़ार', 'लाख'],
    AUX: ['है', 'हैं', 'हूँ', 'था', 'थी', 'थे', 'हो', 'होना', 'चाहिए', 'सकता'],
    VERB: ['करना', 'किया', 'दिया', 'लिया', 'गया', 'आया', 'कहा', 'रहा', 'चाहता', 'देखा'],
    ADJ: ['पहला', 'दूसरा', 'ऐसा', 'कैसा', 'इतना', 'कितना', 'जितना'],
    NOUN: [], PROPN: [], CLF: [], PUNCT: [], X: [],
  };
  const total = Object.values(TABLE).reduce((n, l) => n + l.length, 0);
  it(`${total} function words are analysed, each with the part of speech expected`, () => {
    expect(total).toBeGreaterThanOrEqual(80);
    for (const [pos, words] of Object.entries(TABLE)) {
      for (const w of words) {
        const r = run('hi', w);
        const cands = r.analyses[0].candidates;
        expect(cands.length, `${w} has a reading`).toBeGreaterThan(0);
        expect(cands.some((c) => c.pos === pos), `${w} should be ${pos}, got ${cands.map((c) => c.pos).join('/')}`).toBe(true);
        // the word list answers: a closed-class word is a hand reading, not a rule guess
        expect(cands.some((c) => c.origin === 'hand'), `${w} is a hand reading`).toBe(true);
      }
    }
  });

  it('forms of the pronouns carry their case and person', () => {
    const best = (w: string) => run('hi', w).analyses[0].candidates.find((c) => c.pos === 'PRON')!;
    expect(best('मैंने').morph).toMatchObject({ Person: '1', Number: 'Sing', Case: 'Erg' });
    expect(best('मुझे').morph).toMatchObject({ Person: '1', Case: 'Dat' });
    expect(best('हमने').morph).toMatchObject({ Person: '1', Number: 'Plur', Case: 'Erg' });
    expect(best('तूने').morph).toMatchObject({ Person: '2', Polite: 'Infm', Case: 'Erg' });
    expect(best('तुम्हें').morph).toMatchObject({ Person: '2', Polite: 'Fam', Case: 'Dat' });
    expect(best('आपने').morph).toMatchObject({ Person: '2', Polite: 'Form', Case: 'Erg' });
    expect(best('उन्होंने').morph).toMatchObject({ Person: '3', Number: 'Plur', Case: 'Erg' });
    expect(best('किसने').morph).toMatchObject({ PronType: 'Int', Case: 'Erg' });
    expect(best('जिसे').morph).toMatchObject({ PronType: 'Rel', Case: 'Dat' });
    // the lemma of a fused or oblique form is the direct form
    expect(best('मुझसे').lemma).toBe('मैं');
    expect(best('उसने').lemma).toBe('वह');
    expect(best('इन्हें').lemma).toBe('ये');
    expect(best('किसे').lemma).toBe('कौन');
  });

  it('days, months, times of day, kinship words, and the names of the first stories', () => {
    for (const w of ['सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार', 'रविवार', 'जनवरी', 'दिसंबर', 'सुबह', 'दोपहर', 'शाम', 'रात', 'दिन', 'महीना', 'साल'])
      expect(POSES(w), w).toContain('NOUN');
    for (const w of ['माँ', 'पिता', 'पापा', 'दादी', 'दादा', 'नानी', 'नाना', 'भाई', 'बहन', 'बेटा', 'बेटी', 'चाचा', 'मामा']) expect(POSES(w), w).toContain('NOUN');
    for (const w of ['रवि', 'मीरा', 'अमित', 'नेहा', 'राजू', 'सीता', 'मोती', 'शर्मा', 'दिल्ली', 'भारत']) expect(POSES(w), w).toContain('PROPN');
    for (const w of ['पहला', 'दूसरा', 'तीसरा', 'चौथा', 'पाँचवाँ', 'छठा', 'सातवाँ', 'आठवाँ', 'नौवाँ', 'दसवाँ']) expect(POSES(w), w).toContain('ADJ');
  });

  it('Scripture and church vocabulary the course needs is there', () => {
    for (const w of ['प्रभु', 'यीशु', 'मसीह', 'पाप', 'अनुग्रह', 'क्षमा', 'विश्वास', 'पश्चाताप', 'उद्धार', 'पुनरुत्थान', 'पवित्रशास्त्र', 'बाइबल', 'प्रार्थना', 'कलीसिया', 'गवाही', 'आत्मा', 'स्वर्ग', 'क्रूस', 'परमेश्वर'])
      expect(hiLexicon.find(w), w).toBeDefined();
    for (const w of ['बचाना', 'मानना', 'पूजना', 'बख़्शना']) expect(hiLexicon.find(w, 'VERB'), w).toBeDefined();
  });

  it('nothing the first version of the adapter knew has been dropped', () => {
    const OLD: Array<[string, PartOfSpeech]> = [
      ['होना', 'AUX'], ['करना', 'VERB'], ['देना', 'VERB'], ['लेना', 'VERB'], ['जाना', 'VERB'], ['समझना', 'VERB'], ['लगना', 'VERB'], ['चाहना', 'VERB'], ['रखना', 'VERB'],
      ['पाना', 'VERB'], ['कहना', 'VERB'], ['मानना', 'VERB'], ['दिल', 'NOUN'], ['पाप', 'NOUN'], ['परमेश्वर', 'PROPN'], ['दिन', 'NOUN'], ['दुनिया', 'NOUN'], ['शांति', 'NOUN'],
      ['प्रेम', 'NOUN'], ['जगत', 'NOUN'], ['पुत्र', 'NOUN'], ['जीवन', 'NOUN'], ['सत्य', 'NOUN'], ['अधर्म', 'NOUN'], ['धोखा', 'NOUN'], ['बात', 'NOUN'], ['नाश', 'NOUN'],
      ['क्षमा', 'NOUN'], ['विश्वास', 'NOUN'], ['किताब', 'NOUN'], ['घर', 'NOUN'], ['अनीता', 'PROPN'], ['पॉल', 'PROPN'], ['मैं', 'PRON'], ['हम', 'PRON'], ['आप', 'PRON'],
      ['वह', 'PRON'], ['कोई', 'PRON'], ['कुछ', 'PRON'], ['सब', 'PRON'], ['जो', 'PRON'], ['क्या', 'PRON'], ['क्यों', 'ADV'], ['कैसा', 'ADJ'], ['मेरा', 'DET'], ['हमारा', 'DET'],
      ['अपना', 'DET'], ['एक', 'NUM'], ['छोटा', 'ADJ'], ['अच्छा', 'ADJ'], ['पूरा', 'ADJ'], ['ऐसा', 'ADJ'], ['ठीक', 'ADJ'], ['शांत', 'ADJ'], ['अनन्त', 'ADJ'], ['एकलौता', 'ADJ'],
      ['शुद्ध', 'ADJ'], ['विश्वासयोग्य', 'ADJ'], ['धर्मी', 'ADJ'], ['का', 'ADP'], ['को', 'ADP'], ['में', 'ADP'], ['से', 'ADP'], ['ने', 'ADP'], ['पर', 'ADP'], ['पर', 'CONJ'],
      ['तक', 'ADP'], ['नहीं', 'ADV'], ['न', 'PART'], ['अब', 'ADV'], ['तो', 'PART'], ['और', 'CONJ'], ['कि', 'SCONJ'], ['क्योंकि', 'SCONJ'], ['ताकि', 'SCONJ'], ['यदि', 'SCONJ'],
      ['परन्तु', 'CONJ'], ['जब', 'SCONJ'], ['नमस्ते', 'INTJ'], ['हाँ', 'INTJ'], ['धन्यवाद', 'INTJ'],
    ];
    for (const [lemma, pos] of OLD) expect(hiLexicon.find(lemma, pos), `${lemma} ${pos}`).toBeDefined();
  });

  it('the bundled Hindi seed texts are covered word for word by the adapter', () => {
    const seeds = loadBundledCorpus().filter((d) => d.lang === 'hi' && ['story-01', 'dialogue-01', 'bible-1john-1'].includes(d.id));
    expect(seeds.length).toBe(3);
    for (const d of seeds) for (const s of d.sections) for (const p of s.paragraphs) {
      for (const x of 'sentences' in p ? p.sentences : [{ text: p.text }]) {
        const toks = hiAdapter.tokenize(x.text);
        const an = hiAdapter.analyze(toks);
        toks.forEach((t, i) => { if (t.isWord) expect(an[i].candidates.length, `${d.id}: ${t.surface}`).toBeGreaterThan(0); });
      }
    }
  });
});

describe('register groups: words for one thing in different layers, never merged', () => {
  it(`there are at least 80 groups (${REGISTER_GROUPS.length}), each with at least two words and a meaning`, () => {
    expect(REGISTER_GROUPS.length).toBeGreaterThanOrEqual(80);
    for (const g of REGISTER_GROUPS) {
      expect(g.meaning.length).toBeGreaterThanOrEqual(2);
      expect(g.members.length).toBeGreaterThanOrEqual(2);
      for (const m of g.members) {
        expect(m.register.length, m.lemma).toBeGreaterThan(0);
        for (const t of m.register) expect(HI_REGISTERS.has(t), `${m.lemma}: ${t}`).toBe(true);
        expect(m.lemma === m.lemma.normalize('NFC')).toBe(true);
      }
    }
  });

  it('every member exists in the word list, or is flagged as outside it (and then it is not in the list)', () => {
    for (const g of REGISTER_GROUPS) {
      for (const m of g.members) {
        if (m.outside) expect(hiLexicon.find(m.lemma), `${m.lemma} is flagged outside but is in the list`).toBeUndefined();
        else expect(hiLexicon.find(m.lemma), `${g.meaning}: ${m.lemma}`).toBeDefined();
      }
      expect(g.members.some((m) => !m.outside), g.meaning).toBe(true);
    }
  });

  it('a row that names a lexical layer agrees with the group that holds the word', () => {
    const LAYERS = new Set(['everyday', 'sanskritic', 'perso-arabic', 'english-loan']);
    for (const g of REGISTER_GROUPS) {
      for (const m of g.members) {
        if (m.outside) continue;
        const rows = ROWS.filter((r) => r.lemma === m.lemma);
        const rowLayers = new Set(rows.flatMap((r) => r.register).filter((t) => LAYERS.has(t)));
        if (!rowLayers.size) continue;
        const groupLayers = new Set(m.register.filter((t) => LAYERS.has(t)));
        // the group may name a layer the row leaves out (an everyday word the row only calls sanskritic); it never contradicts it
        for (const t of rowLayers) if (t !== 'everyday') expect(groupLayers.has(t) || groupLayers.size === 0, `${m.lemma}: row ${[...rowLayers]} vs group ${[...groupLayers]}`).toBe(true);
        for (const t of groupLayers) if (t !== 'everyday') expect(rowLayers.has(t), `${m.lemma}: group ${[...groupLayers]} vs row ${[...rowLayers]}`).toBe(true);
      }
    }
  });

  it('registerGroupOf gives the other words with their own layers; each word keeps its own lemma', () => {
    const g = registerGroupOf('ज़रूरत')!;
    expect(g.meaning).toBe('need');
    expect(g.members.map((m) => m.lemma)).toEqual(['ज़रूरत', 'आवश्यकता']);
    expect(g.members[0].register).toEqual(['perso-arabic', 'everyday']);
    expect(g.members[1].register).toEqual(['sanskritic', 'formal']);
    expect(registerGroupOf('आवश्यकता')!.members.map((m) => m.lemma)).toContain('ज़रूरत');
    for (const w of ['शुरुआत', 'आरंभ', 'प्रारंभ']) expect(registerGroupOf(w)!.members.map((m) => m.lemma)).toEqual(['शुरुआत', 'आरंभ', 'प्रारंभ']);
    expect(registerGroupOf('मौत')!.members.map((m) => m.lemma)).toEqual(['मौत', 'मृत्यु']);
    expect(registerGroupOf('किताब')!.members.map((m) => m.lemma)).toEqual(['किताब', 'पुस्तक']);
    expect(registerGroupOf('दुनिया')!.members.map((m) => m.lemma)).toEqual(['दुनिया', 'संसार', 'जगत']);
    expect(registerGroupOf('दिल')!.members.map((m) => m.lemma)).toEqual(['दिल', 'हृदय']);
    expect(registerGroupOf('वक़्त')!.members.map((m) => m.lemma)).toEqual(['वक़्त', 'समय']);
    expect(registerGroupOf('ज़िंदगी')!.members.map((m) => m.lemma)).toEqual(['ज़िंदगी', 'जीवन']);
    expect(registerGroupOf('मदद')!.members.map((m) => m.lemma)).toEqual(['मदद', 'सहायता']);
    expect(registerGroupOf('इंतज़ार')!.members.map((m) => m.lemma)).toEqual(['इंतज़ार', 'प्रतीक्षा']);
    expect(registerGroupOf('ख़ुशी')!.members.map((m) => m.lemma)).toEqual(['ख़ुशी', 'प्रसन्नता', 'आनंद']);
    expect(registerGroupOf('घर')).toBeUndefined();
    // returned copies: changing one changes nothing
    g.members[0].register.push('literary');
    expect(registerGroupOf('ज़रूरत')!.members[0].register).toEqual(['perso-arabic', 'everyday']);
    // the two words are two lemmas with two readings, two glosses and their own layers; neither is a variant of the other
    const need = run('hi', 'ज़रूरत आवश्यकता').analyses.map((a) => a.candidates[0]);
    expect(need[0].lemma).toBe('ज़रूरत');
    expect(need[1].lemma).toBe('आवश्यकता');
    expect(need[0].register).toEqual(expect.arrayContaining(['perso-arabic']));
    expect(need[1].register).toEqual(expect.arrayContaining(['sanskritic']));
    expect(need[0].register).not.toContain('sanskritic');
    expect(hiAdapter.relate('ज़रूरत', 'आवश्यकता')).toBe('none');
    expect(registerOf('मृत्यु')).toEqual(['sanskritic', 'formal']);
    expect(registerOf('नसीब')).toBeUndefined();
  });
});

describe('varieties', () => {
  it('Awadhi, Braj and the language of the sant poets are heritage varieties with a plain note; Modern Standard Hindi is untagged', () => {
    expect(Object.keys(HI_VARIETIES).sort()).toEqual(['awa', 'bra', 'hi-sant']);
    for (const v of Object.values(HI_VARIETIES)) {
      expect(v.kind).toBe('heritage');
      expect(v.label.length).toBeGreaterThan(3);
      expect(v.note && v.note.length > 40).toBe(true);
      expect(v.note).not.toMatch(/\bcorrect\b|\bpure\b|\bproper\b/i);
    }
    expect(HI_VARIETIES.awa.label).toBe('Awadhi');
    expect(HI_VARIETIES.bra.label).toBe('Braj');
    expect(hiAdapter.varieties).toBe(HI_VARIETIES);
    // a word of the list carries no variety tag
    for (const w of ['घर', 'पानी', 'और']) for (const c of run('hi', w).analyses[0].candidates) expect(c.varieties).toBeUndefined();
  });
});

// ───────────────────────── fix batch 1 ─────────────────────────

/** Is the morphology engine installed (real) or a stub that returns nothing? Plurals and oblique forms need it. */
const ENGINE = run('hi', 'लड़कों').analyses[0].candidates.length > 0;
const vouched = (cands: Array<{ origin?: string; notes?: Record<string, string | string[]> }>) => cands.some((c) => c.origin === 'hand' || c.notes?.lemmaStatus === 'in the word list');
const sentencesOfDoc = (d: ReturnType<typeof loadBundledCorpus>[number]): string[] =>
  d.sections.flatMap((s) => s.paragraphs.flatMap((p) => ('sentences' in p ? p.sentences.map((x) => x.text) : [p.text])));

describe('the list against the bundled texts: every word of the Stage 0 stories has a reading the list vouches for', () => {
  const stage0 = loadBundledCorpus().filter((d) => d.lang === 'hi' && /^s0/u.test(d.id));
  it('there are Stage 0 stories', () => {
    expect(stage0.length).toBeGreaterThanOrEqual(20);
  });
  it('no word of any Stage 0 story is without a reading from the list (the hand list, or the rules on a lemma the list holds)', () => {
    const bad = new Map<string, string>();
    let words = 0;
    for (const d of stage0) for (const text of sentencesOfDoc(d)) {
      const toks = hiAdapter.tokenize(text);
      const an = hiAdapter.analyze(toks);
      toks.forEach((t, i) => {
        if (!t.isWord) return;
        words++;
        if (!vouched(an[i].candidates)) bad.set(t.normalized, `${d.id}: ${text}`);
      });
    }
    expect(words).toBeGreaterThan(3000);
    // with the rule engine installed the list must vouch for every word; as a stub it can only vouch for the forms it lists
    if (ENGINE) expect([...bad].map(([w, where]) => `${w} (${where})`), 'words without a vouched reading').toEqual([]);
    else expect(bad.size / words).toBeLessThan(0.05);
  });
  it('the Scripture slice is vouched for word for word, apart from at most a handful of words', () => {
    if (!ENGINE) return;
    let words = 0, bad = 0;
    for (const d of loadBundledCorpus().filter((x) => x.lang === 'hi' && /^bible/u.test(x.id))) for (const text of sentencesOfDoc(d)) {
      const toks = hiAdapter.tokenize(text);
      const an = hiAdapter.analyze(toks);
      toks.forEach((t, i) => { if (t.isWord) { words++; if (!vouched(an[i].candidates)) bad++; } });
    }
    expect(words).toBeGreaterThan(1500);
    expect(bad / words).toBeLessThan(0.005);
  });
});

describe('the list against an inventory of basic Hindi (written down apart from the texts)', () => {
  const MUST = {
    VERB: ['खेलना', 'भौंकना', 'नाचना', 'गाना', 'दौड़ना', 'कूदना', 'तैरना', 'उड़ना', 'गिरना', 'चढ़ना', 'उतरना', 'भागना', 'बैठना', 'उठना', 'सोना', 'जागना', 'नहाना', 'धोना', 'पकाना', 'खाना', 'पीना', 'पहनना', 'ओढ़ना', 'ख़रीदना', 'बेचना', 'ढूँढ़ना', 'खोजना', 'भेजना', 'बुलाना', 'पूछना', 'बताना', 'सुनना', 'सुनाना', 'दिखाना', 'सिखाना', 'सीखना', 'पढ़ाना', 'लिखना', 'सोचना', 'भूलना', 'हँसना', 'रोना', 'डरना', 'मुस्कुराना', 'चिल्लाना', 'बोलना', 'छूना', 'सीना', 'फिरना', 'रेंगना', 'मरोड़ना', 'मँडराना', 'फिराना', 'पकड़वाना', 'टेकना', 'फूलना', 'फलना', 'बचाना', 'छोड़ना', 'तोड़ना', 'जोड़ना', 'खोलना', 'मिलना', 'चलना', 'रुकना', 'बनना', 'बनाना'],
    NOUN: ['कौआ', 'कुत्ता', 'बिल्ली', 'चिड़िया', 'गेंद', 'पतंग', 'मंदिर', 'मस्जिद', 'स्कूल', 'किताब', 'पेड़', 'फूल', 'नदी', 'पहाड़', 'बारिश', 'बादल', 'सूरज', 'चाँद', 'रेल', 'बस', 'सड़क', 'बाज़ार', 'दुकान', 'रोटी', 'दूध', 'पानी', 'चाय', 'आम', 'केला', 'घर', 'कमरा', 'खिड़की', 'दरवाज़ा', 'आँख', 'हाथ', 'पैर', 'सिर', 'दोस्त', 'अध्यापक', 'डॉक्टर', 'किसान', 'मछुआरा', 'मछुआ', 'चमड़ा', 'कमरबंद', 'टिड्डी', 'भूसी', 'फीता', 'शास्त्री', 'दुष्टात्मा', 'चिह्न', 'विदा', 'निवास', 'वश', 'आकाशवाणी', 'तारागण', 'वनमधु'],
    ADJ: ['अच्छा', 'बुरा', 'बड़ा', 'छोटा', 'लंबा', 'नया', 'पुराना', 'गर्म', 'ठंडा', 'मीठा', 'सुंदर', 'दुखी', 'बीमार', 'दुष्ट', 'धर्मी', 'छठवाँ', 'बेडौल', 'नासरी', 'उदास', 'खुला'],
    INTJ: ['हैलो', 'नमस्ते', 'नमस्कार', 'धन्यवाद', 'शुक्रिया', 'अलविदा', 'वाह', 'अरे', 'आमीन', 'हाँ', 'जी'],
    ADV: ['आदि', 'आपस', 'खुल्लमखुल्ला', 'हमेशा', 'कभी', 'अभी', 'यहाँ', 'वहाँ'],
    PROPN: ['जब्दी', 'शमौन', 'अन्द्रियास', 'याकूब', 'यशायाह', 'यहोवा', 'मूसा', 'दाऊद', 'इब्राहीम', 'रवि', 'मीरा'],
  } as const;
  const total = Object.values(MUST).reduce((n, l) => n + l.length, 0);
  it(`${total} basic words are in the list with the part of speech expected`, () => {
    for (const [pos, words] of Object.entries(MUST)) for (const w of words) expect(hiLexicon.find(w, pos as PartOfSpeech), `${w} ${pos}`).toBeDefined();
  });
  it('the forms of "to play" and "to bark" and the plural of "crow" are read by the list itself', () => {
    for (const w of ['खेलता', 'खेलती', 'खेलते', 'खेला', 'खेली', 'खेलने', 'खेलेगा', 'खेलो', 'खेलें']) expect(hiLexicon.lookup(w).some((h) => h.entry.lemma === 'खेलना'), w).toBe(true);
    for (const w of ['भौंका', 'भौंकता', 'भौंकती', 'भौंकने']) expect(hiLexicon.lookup(w).some((h) => h.entry.lemma === 'भौंकना'), w).toBe(true);
    for (const w of ['कौआ', 'कौए', 'कौओं']) expect(hiLexicon.lookup(w).some((h) => h.entry.lemma === 'कौआ'), w).toBe(true);
    expect(hiLexicon.lookup('हैलो').some((h) => h.entry.pos === 'INTJ')).toBe(true);
  });
});

describe('causatives carry their base and Voice=Cau', () => {
  const caus = ROWS.filter((r) => r.pos === 'VERB' && r.causativeOf);
  it(`${caus.length} causative rows: three forms of each, analysed through the adapter, say Voice=Cau and what they are made from`, () => {
    expect(caus.length).toBeGreaterThanOrEqual(90);
    for (const r of caus) {
      const entry = hiLexicon.find(r.lemma, 'VERB')!;
      const forms = [...new Set([entry.forms[0].form, entry.forms[Math.floor(entry.forms.length / 2)].form, entry.forms[entry.forms.length - 1].form])];
      expect(forms.length, r.lemma).toBeGreaterThanOrEqual(2);
      for (const f of forms) {
        const cands = run('hi', f).analyses[0].candidates.filter((c) => c.lemma === r.lemma && c.pos === 'VERB');
        expect(cands.length, `${f} (${r.lemma})`).toBeGreaterThan(0);
        for (const c of cands) {
          expect(c.morph.Voice, `${f} (${r.lemma})`).toBe('Cau');
          expect(c.notes?.derivedFrom ?? r.causativeOf, `${f} (${r.lemma})`).toBe(r.causativeOf);
        }
      }
      expect(hiLemmaInfo(r.lemma, 'VERB')?.causativeOf).toBe(r.causativeOf);
    }
  });
  it('both degrees are there where both are common', () => {
    const PAIRS: Array<[string, string]> = [
      ['कराना', 'करना'], ['करवाना', 'करना'], ['बनाना', 'बनना'], ['बनवाना', 'बनना'], ['पढ़ाना', 'पढ़ना'], ['पढ़वाना', 'पढ़ना'], ['सुनाना', 'सुनना'], ['सुनवाना', 'सुनाना'],
      ['दिखाना', 'देखना'], ['खिलाना', 'खाना'], ['खिलवाना', 'खिलाना'], ['पिलाना', 'पीना'], ['पिलवाना', 'पिलाना'], ['सुलाना', 'सोना'], ['सुलवाना', 'सुलाना'],
      ['सिखाना', 'सीखना'], ['बिठाना', 'बैठना'], ['उठाना', 'उठना'], ['उठवाना', 'उठाना'], ['जगाना', 'जागना'], ['चलाना', 'चलना'], ['चलवाना', 'चलाना'],
    ];
    for (const [c, b] of PAIRS) expect(hiLemmaInfo(c, 'VERB')?.causativeOf, `${c} <- ${b}`).toBe(b);
    // रुकना → रोकना is not a causative in the sense of the -ा / -वा derivations, and the list does not tag it as one
    expect(hiLemmaInfo('रोकना', 'VERB')?.causativeOf).toBeUndefined();
    // a verb that is not a causative does not say so
    for (const w of ['करना', 'देखना', 'खाना', 'खेलना']) for (const c of run('hi', w).analyses[0].candidates) expect(c.morph.Voice, w).toBeUndefined();
  });
});

describe('homographs: each reading is a separate entry with its own part of speech and gloss', () => {
  const PAIRS: Array<Array<[string, PartOfSpeech]>> = [
    [['और', 'CONJ'], ['और', 'ADV']],
    [['कर', 'NOUN'], ['करना', 'VERB']],
    [['सोना', 'NOUN'], ['सोना', 'VERB']],
    [['खाना', 'NOUN'], ['खाना', 'VERB']],
    [['बोली', 'NOUN'], ['बोलना', 'VERB']],
    [['आम', 'NOUN'], ['आम', 'ADJ']],
    [['पर', 'ADP'], ['पर', 'CONJ'], ['पर', 'NOUN']],
    [['का', 'ADP'], ['करना', 'VERB']],
    [['जी', 'INTJ'], ['जी', 'PART'], ['जी', 'NOUN']],
    [['से', 'ADP'], ['सा', 'PART']],
    [['भी', 'PART']],
    [['कल', 'ADV']],
  ];
  it('the entries exist, with different glosses', () => {
    for (const group of PAIRS) {
      const glosses = group.map(([lemma, pos]) => {
        const e = hiLexicon.find(lemma, pos);
        expect(e, `${lemma} ${pos}`).toBeDefined();
        expect(e!.gloss.length, `${lemma} ${pos}`).toBeGreaterThan(2);
        return e!.gloss;
      });
      expect(new Set(glosses).size, group.map((g) => g.join('/')).join(' ')).toBe(glosses.length);
    }
  });
  it('the forms are offered as readings: the tax noun beside the stem of "to do", the dialect noun beside the feminine perfective of "to speak"', () => {
    const at = (w: string) => run('hi', w).analyses[0].candidates.map((c) => `${c.lemma}/${c.pos}`);
    expect(at('कर')).toEqual(expect.arrayContaining(['कर/NOUN', 'करना/VERB']));
    expect(at('सोना')).toEqual(expect.arrayContaining(['सोना/NOUN', 'सोना/VERB']));
    expect(at('खाना')).toEqual(expect.arrayContaining(['खाना/NOUN', 'खाना/VERB']));
    expect(at('बोली')).toEqual(expect.arrayContaining(['बोली/NOUN', 'बोलना/VERB']));
    expect(at('आम')).toEqual(expect.arrayContaining(['आम/NOUN', 'आम/ADJ']));
    expect(at('और')).toEqual(expect.arrayContaining(['और/CONJ', 'और/ADV']));
    expect(at('पर')).toEqual(expect.arrayContaining(['पर/ADP', 'पर/CONJ', 'पर/NOUN']));
    expect(at('जी')).toEqual(expect.arrayContaining(['जी/INTJ', 'जी/PART', 'जी/NOUN']));
    expect(at('की')).toEqual(expect.arrayContaining(['का/ADP', 'करना/VERB']));
    // "and" is the first reading of और until the neighbours say otherwise
    expect(at('और')[0]).toBe('और/CONJ');
  });
});

describe('register layers of loans and Sanskrit-derived words', () => {
  const layer = (w: string, pos: PartOfSpeech) => hiLexicon.find(w, pos) && ROWS.find((r) => r.lemma === w && r.pos === pos)!.register;
  it('words of English origin carry english-loan', () => {
    const EN: Array<[string, PartOfSpeech]> = [
      ['ट्रेन', 'NOUN'], ['रेल', 'NOUN'], ['स्टेशन', 'NOUN'], ['स्कूल', 'NOUN'], ['डॉक्टर', 'NOUN'], ['फ़ोन', 'NOUN'], ['बस', 'NOUN'], ['टिकट', 'NOUN'], ['होटल', 'NOUN'],
      ['मोबाइल', 'NOUN'], ['ऑफ़िस', 'NOUN'], ['पुलिस', 'NOUN'], ['बैंक', 'NOUN'], ['मशीन', 'NOUN'], ['कंपनी', 'NOUN'], ['पैंट', 'NOUN'], ['कप', 'NOUN'], ['प्लेट', 'NOUN'],
      ['बोतल', 'NOUN'], ['बिस्कुट', 'NOUN'], ['केक', 'NOUN'], ['जूस', 'NOUN'], ['कॉफ़ी', 'NOUN'], ['मिनट', 'NOUN'], ['कॉपी', 'NOUN'], ['पेंसिल', 'NOUN'], ['क्लास', 'NOUN'],
      ['पार्क', 'NOUN'], ['सिनेमा', 'NOUN'], ['फ़िल्म', 'NOUN'], ['ट्रक', 'NOUN'], ['इंजीनियर', 'NOUN'], ['नर्स', 'NOUN'], ['रेडियो', 'NOUN'], ['टीवी', 'NOUN'], ['ड्राइवर', 'NOUN'],
      ['साइकिल', 'NOUN'], ['गिलास', 'NOUN'], ['कार', 'NOUN'], ['पेन', 'NOUN'], ['शर्ट', 'NOUN'], ['बैग', 'NOUN'], ['जेल', 'NOUN'], ['अफ़सर', 'NOUN'], ['हैलो', 'INTJ'], ['सॉरी', 'INTJ'],
    ];
    for (const [w, pos] of EN) expect(layer(w, pos), w).toContain('english-loan');
    for (const [w, pos] of EN) {
      const c = run('hi', w).analyses[0].candidates.find((x) => x.pos === pos)!;
      expect(c.register, `${w} on the reading`).toContain('english-loan');
    }
  });
  it('Sanskrit-derived everyday nouns with conjuncts carry sanskritic, and the dream words are one register group', () => {
    const SK = ['स्वप्न', 'प्रश्न', 'उत्तर', 'प्रयास', 'ज्ञान', 'विश्वास', 'स्वतंत्रता', 'स्वास्थ्य', 'प्रकृति', 'संस्कृति', 'श्रम', 'श्रद्धा', 'क्षमा', 'क्षेत्र', 'शिक्षा', 'स्वभाव', 'प्रेम', 'प्रार्थना', 'प्रकाश', 'प्रसन्नता', 'प्रतीक्षा', 'प्रचार', 'प्रदेश', 'प्राण', 'स्वर्ग', 'स्थान', 'स्थिति', 'स्वागत', 'स्वरूप', 'स्त्री', 'स्मृति', 'क्षण', 'क्षति', 'क्षमता', 'शक्ति', 'शास्त्र', 'शिष्य', 'विज्ञान', 'प्रमाण', 'प्रभाव', 'प्रयोग', 'प्रवेश', 'प्रेरणा', 'क्रिया', 'ग्रंथ', 'दृष्टि', 'पृष्ठ', 'राष्ट्र', 'व्यवहार', 'व्यक्ति', 'श्रेणी'];
    for (const w of SK) expect(layer(w, 'NOUN'), w).toContain('sanskritic');
    expect(registerGroupOf('स्वप्न')!.members.map((m) => m.lemma)).toEqual(expect.arrayContaining(['सपना', 'स्वप्न', 'ख़्वाब']));
    expect(run('hi', 'स्वप्न').analyses[0].candidates[0].register).toContain('sanskritic');
  });
});

describe('also: other spellings of one lemma', () => {
  it('a row names them, they are never lemmas of their own, and the plain spelling of the lemma is not among them', () => {
    const withAlso = ROWS.filter((r) => r.also.length);
    expect(withAlso.map((r) => r.lemma)).toEqual(expect.arrayContaining(['भविष्यवक्ता', 'दुखी', 'दुख', 'मँडराना', 'फलदायी']));
    for (const r of withAlso) for (const a of r.also) {
      expect(a === a.normalize('NFC')).toBe(true);
      expect(a).not.toBe(r.lemma);
      expect(ROWS.some((x) => x.lemma === a), `${a} is a lemma of its own`).toBe(false);
    }
    expect(() => parseRows('# NOUN\nघर/m = house [also:घर]', 't')).toThrow(/the lemma itself/);
  });
});
