/**
 * Hindi pronunciation (package H1): the unwritten a, nasal signs, nukta letters, dictionary alignment and the
 * writing-system items. The examples are the author's own, machine-drafted from general knowledge of Hindi; none has
 * been checked by a native speaker. "%" in a literal stands for the nukta (U+093C).
 */
import { describe, expect, it } from 'vitest';
import {
  decodeHindi, decodeHindiWithPronunciation, describeHindiOrthFeature, hindiOrthFeatures,
} from '../../src/adapters/hindi/pronunciation';
import { aksharas } from '../../src/adapters/hindi/script';

const nk = (s: string): string => s.replace(/%/g, '़');
const roms = (w: string): string[] => decodeHindi(nk(w)).map((u) => u.romanization ?? '?');
const inh = (w: string): Array<string | undefined> => decodeHindi(nk(w)).map((u) => u.inherentVowel);
const said = (w: string): string => roms(w).join('');

describe('decodeHindi: shape', () => {
  it('gives one unit per akṣara with the same text and offsets', () => {
    for (const w of ['कमल', 'प्रार्थना', 'हिंदी', 'क्षमा', 'ऑफ़िस', 'पुनः', nk('लड%का'), '१२३']) {
      const us = decodeHindi(w);
      const ak = aksharas(w);
      expect(us.map((u) => u.text), w).toEqual(ak.map((a) => a.text));
      expect(us.map((u) => [u.start, u.end]), w).toEqual(ak.map((a) => [a.start, a.end]));
      for (const u of us) { expect(u.confidence).toBeGreaterThanOrEqual(0); expect(u.confidence).toBeLessThanOrEqual(1); }
    }
  });

  it('is empty for the empty string and leaves the tone fields unset', () => {
    expect(decodeHindi('')).toEqual([]);
    const [u] = decodeHindi('का');
    expect(u.ending).toBeUndefined();
    expect(u.tone).toBeUndefined();
    expect(u.toneMark).toBeUndefined();
  });

  it('describes a unit with a written vowel', () => {
    const [ka, ki, kee, ke, kai, ko, kau] = ['का', 'कि', 'की', 'के', 'कै', 'को', 'कौ'].map((w) => decodeHindi(w)[0]);
    expect([ka.vowelSound, ki.vowelSound, kee.vowelSound, ke.vowelSound, kai.vowelSound, ko.vowelSound, kau.vowelSound]).toEqual(['ā', 'i', 'ī', 'e', 'ai', 'o', 'au']);
    expect([ka.vowelLength, ki.vowelLength, kee.vowelLength, ke.vowelLength]).toEqual(['long', 'short', 'long', 'long']);
    expect(ka.vowel).toBe('◌ा');
    expect(ka.initial).toBe('क');
    expect(ka.inherentVowel).toBeUndefined();
    expect(ka.romanization).toBe('kā');
    expect(ka.source).toBe('rule');
  });

  it('describes independent vowels', () => {
    expect(roms('आ')).toEqual(['ā']);
    expect(roms('इसलिए')).toEqual(['i', 's', 'li', 'e']);
    expect(decodeHindi('ओ')[0].vowelSound).toBe('o');
    expect(decodeHindi('औ')[0].romanization).toBe('au');
    expect(decodeHindi('ऐ')[0].romanization).toBe('ai');
    expect(decodeHindi('उ')[0].vowelLength).toBe('short');
    expect(decodeHindi('ऊ')[0].vowelLength).toBe('long');
  });

  it('ऋ / ृ is ri in Hindi, written r̥ in ISO, with a plain-words rule', () => {
    const [kri] = decodeHindi('कृपा');
    expect(kri.vowelSound).toBe('ri');
    expect(kri.romanization).toBe('kr̥');
    expect(kri.rule).toMatch(/ri/);
    expect(decodeHindi('ऋषि')[0].romanization).toBe('r̥');
  });

  it('the candra vowels of loanwords', () => {
    expect(roms('कॉलेज')).toEqual(['kô', 'le', 'j']);
    expect(said('ऑफ़िस')).toBe('ôfis');
    expect(decodeHindi('कॉ')[0].rule).toMatch(/loanword/);
  });
});

describe('decodeHindi: the unwritten a at the end of a word', () => {
  it('is not said: कमल -> kamal, घर -> ghar', () => {
    for (const [w, r] of [['कमल', 'kamal'], ['घर', 'ghar'], ['जब', 'jab'], ['सब', 'sab'], ['किताब', 'kitāb'], ['नाम', 'nām'], ['राम', 'rām'], ['गाय', 'gāy'], ['और', 'aur']] as const) {
      expect(said(w), w).toBe(r);
      const last = decodeHindi(w).at(-1)!;
      expect(last.inherentVowel, w).toBe('dropped');
      expect(last.vowelSound, w).toBe('');
      expect(last.confidence, w).toBeGreaterThanOrEqual(0.85);
      expect(last.rule, w).toMatch(/end of a word/);
    }
  });

  it('is said in a word that is a single consonant: न, व', () => {
    for (const w of ['न', 'व', 'क']) {
      const [u] = decodeHindi(w);
      expect(u.inherentVowel, w).toBe('pronounced');
      expect(u.vowelSound).toBe('a');
      expect(u.confidence).toBeGreaterThanOrEqual(0.9);
    }
    expect(said('न')).toBe('na');
  });

  it('after a final conjunct it is dropped with a lower confidence, and said so', () => {
    for (const [w, r] of [['धर्म', 'dharm'], ['शब्द', 'śabd'], ['कर्म', 'karm'], ['प्रश्न', 'praśn'], ['ख%त्म', 'ḵẖatm'], ['अध्यक्ष', 'adhyakṣ']] as const) {
      expect(said(w), w).toBe(r);
      const last = decodeHindi(nk(w)).at(-1)!;
      expect(last.inherentVowel, w).toBe('dropped');
      expect(last.confidence, w).toBeLessThan(0.85);
      expect(last.rule, w).toMatch(/conjunct/);
    }
  });

  it('after a final conjunct ending in य र ल व it is uncertain, below 0.6, and written in the transliteration', () => {
    for (const [w, r] of [['मित्र', 'mitra'], ['सत्य', 'satya'], ['वाक्य', 'vākya'], ['राष्ट्र', 'rāṣṭra']] as const) {
      const last = decodeHindi(w).at(-1)!;
      expect(last.inherentVowel, w).toBe('uncertain');
      expect(last.confidence, w).toBeLessThan(0.6);
      expect(said(w), w).toBe(r);
    }
  });

  it('a final consonant with a virama is a dead unit: no vowel at all', () => {
    const [sa, t] = decodeHindi('सत्');
    expect(sa.inherentVowel).toBe('pronounced');
    expect(t.inherentVowel).toBe('dropped');
    expect(t.vowel).toBeUndefined();
    expect(t.confidence).toBeGreaterThanOrEqual(0.9);
    expect(said('सत्')).toBe('sat');
    expect(said('विद्वान्')).toBe('vidvān');
  });

  it('a final consonant carrying a nasal or visarga sign keeps its a', () => {
    const [pu, naḥ] = decodeHindi('पुनः');
    expect(pu.romanization).toBe('pu');
    expect(naḥ.inherentVowel).toBe('pronounced');
    expect(naḥ.romanization).toBe('naḥ');
    expect(naḥ.finalSound).toBe('ḥ');
  });
});

describe('decodeHindi: the unwritten a inside a word', () => {
  it('is dropped between a syllable with a vowel and a syllable with a vowel', () => {
    for (const [w, r] of [
      ['लड%का', 'laṛkā'], ['करना', 'karnā'], ['समझना', 'samajhnā'], ['आदमी', 'ādmī'], ['समझता', 'samajhtā'], ['कहलाना', 'kahlānā'],
      ['कमरा', 'kamrā'], ['मतलब', 'matlab'], ['सरकार', 'sarkār'], ['जितना', 'jitnā'], ['अपना', 'apnā'], ['दूसरा', 'dūsrā'],
      ['बदलना', 'badalnā'], ['सफलता', 'saphaltā'], ['कहना', 'kahnā'], ['रहना', 'rahnā'], ['चलना', 'calnā'], ['लिखना', 'likhnā'],
      ['पढ%ना', 'paṛhnā'], ['पहचान', 'pahcān'], ['आजकल', 'ājkal'], ['तकलीफ%', 'taklīf'], ['भगवान', 'bhagvān'], ['उसकी', 'uskī'],
      ['प्रार्थना', 'prārthnā'], ['सुंदरता', 'sundartā'],
    ] as const) {
      expect(said(w), w).toBe(r);
    }
  });

  it('marks the dropped a as dropped, with a rule in plain words', () => {
    const [la, da, ka] = decodeHindi(nk('लड%का'));
    expect(la.inherentVowel).toBe('pronounced');
    expect(da.inherentVowel).toBe('dropped');
    expect(da.vowelSound).toBe('');
    expect(da.rule).toMatch(/not said/);
    expect(da.confidence).toBeGreaterThanOrEqual(0.75);
    expect(ka.inherentVowel).toBeUndefined();
  });

  it('a verb ending makes the rule sure: समझता, करता, चलना are above 0.8', () => {
    for (const w of ['समझता', 'सफलता', 'बदलना', 'चलना']) {
      const dropped = decodeHindi(w).filter((u) => u.inherentVowel === 'dropped');
      expect(dropped.length, w).toBeGreaterThan(0);
      for (const u of dropped) expect(u.confidence, w).toBeGreaterThanOrEqual(0.8);
      expect(decodeHindi(w).find((u) => u.rule?.includes('verb ending')), w).toBeTruthy();
    }
  });

  it('never drops two in a row: the a before a dropped one is kept', () => {
    for (const w of ['समझना', 'सफलता', 'बदलना', 'सुंदरता']) {
      const us = decodeHindi(w);
      for (let i = 1; i < us.length; i++) {
        expect(us[i - 1].inherentVowel === 'dropped' && us[i].inherentVowel === 'dropped', w).toBe(false);
      }
    }
    expect(decodeHindi('समझना').map((u) => u.inherentVowel)).toEqual(['pronounced', 'pronounced', 'dropped', undefined]);
  });

  it('keeps the a of the first akṣara and of a word with no vowel after it: सड़क, कमल, शहर', () => {
    expect(said('सड%क')).toBe('saṛak');
    expect(said('कमल')).toBe('kamal');
    expect(said('शहर')).toBe('śahar');
    expect(said('जगह')).toBe('jagah');
    expect(said('बहन')).toBe('bahan');
    expect(said('ज%रूरत')).toBe('zarūrat');
    expect(inh('सड%क')).toEqual(['pronounced', 'pronounced', 'dropped']);
    expect(decodeHindi(nk('सड%क'))[1].rule).toMatch(/next/);
  });

  it('keeps the a before a conjunct onset (नमस्ते, समस्या) and after a nasal (ज़िंदगी, इंतज़ार, संगठन)', () => {
    expect(said('नमस्ते')).toBe('namaste');
    expect(said('समस्या')).toBe('samasyā');
    expect(said('ज%िंदगी')).toBe('zindagī');
    expect(said('इंतज%ार')).toBe('intazār');
    expect(said('संगठन')).toBe('saṅgaṭhan');
    expect(decodeHindi('नमस्ते')[1].rule).toMatch(/conjunct/);
  });

  it('keeps the a after a conjunct ending in य, a doubled consonant or other awkward clusters', () => {
    expect(said('धन्यवाद')).toBe('dhanyavād');
    expect(said('उन्नति')).toBe('unnati');
    expect(said('कार्यक्रम')).toBe('kāryakram');
    expect(said('उत्तम')).toBe('uttam');
    expect(said('पुस्तक')).toBe('pustak');
    expect(said('ईश्वर')).toBe('īśvar');
  });
});

describe('decodeHindi: where the rules are unreliable it says so', () => {
  it('words after a known prefix and unresolved neighbours are uncertain, below 0.6', () => {
    for (const w of ['उपहार', 'मनुष्य', 'बंदरगाह']) {
      const us = decodeHindi(w);
      const u = us.find((x) => x.inherentVowel === 'uncertain');
      expect(u, w).toBeTruthy();
      expect(u!.confidence, w).toBeLessThan(0.6);
      expect(u!.rule, w).toMatch(/cannot tell/);
    }
  });

  it('an uncertain a is written in the transliteration and lowers the word\'s confidence', () => {
    expect(said('उपहार')).toBe('upahār');
    expect(decodeHindi('उपहार').map((u) => u.vowelSound)).toEqual(['u', 'a', 'ā', '']);
  });

  it('a word that is a single conjunct is uncertain', () => {
    const [u] = decodeHindi('ज्ञ');
    expect(u.inherentVowel).toBe('uncertain');
    expect(u.confidence).toBeLessThan(0.6);
  });
});

describe('decodeHindi: the exception list', () => {
  it('reads the listed words as listed, labelled as such and not as a rule', () => {
    const cases: Array<[string, string]> = [
      ['सुनहरा', 'sunahrā'], ['समझदार', 'samajhdār'],
      ['मुसलमान', 'musalmān'], ['लोकसभा', 'loksabhā'], ['जनवरी', 'janvarī'], ['दोपहर', 'dopahar'], ['सहायता', 'sahāyatā'],
    ];
    for (const [w, r] of cases) {
      expect(said(w), w).toBe(r);
      const us = decodeHindi(w);
      const listed = us.filter((u) => u.source === 'exception-list');
      expect(listed.length, w).toBeGreaterThan(0);
      for (const u of listed) { expect(u.rule, w).toMatch(/exception list/); expect(u.confidence, w).toBeLessThanOrEqual(0.8); }
    }
  });

  it('is short', async () => {
    const { SCHWA_EXCEPTIONS } = await import('../../src/adapters/hindi/orth-exceptions');
    expect(SCHWA_EXCEPTIONS.length).toBeLessThanOrEqual(20);
  });

  it('every entry decodes with source exception-list and exactly the listed reading', async () => {
    const { SCHWA_EXCEPTIONS } = await import('../../src/adapters/hindi/orth-exceptions');
    expect(SCHWA_EXCEPTIONS.length).toBeGreaterThan(0);
    for (const e of SCHWA_EXCEPTIONS) {
      const us = decodeHindi(e.word);
      expect(us.some((u) => u.source === 'exception-list'), e.word).toBe(true);
      expect(us.map((u) => u.romanization).join(''), e.word).toBe(e.reading);
      expect(us.filter((u) => u.inherentVowel === 'uncertain'), e.word).toEqual([]);
    }
  });

  it('words removed from the list fall back to the rules, and the rules are unsure about them', async () => {
    const { SCHWA_EXCEPTIONS } = await import('../../src/adapters/hindi/orth-exceptions');
    for (const w of ['उपयोग', 'उपयोगी', 'उपन्यास', 'अनुमति']) {
      expect(SCHWA_EXCEPTIONS.some((e) => e.word === w), w).toBe(false);
      const us = decodeHindi(w);
      expect(us.some((u) => u.source === 'exception-list'), w).toBe(false);
      const u = us.find((x) => x.inherentVowel === 'uncertain');
      expect(u, w).toBeTruthy();
      expect(u!.confidence, w).toBeLessThan(0.6);
      expect(u!.rule, w).toMatch(/prefix/);
    }
  });
});

describe('decodeHindi: nasal signs', () => {
  it('anusvara is the nasal of the next consonant\'s class', () => {
    const cases: Array<[string, string, string]> = [
      ['अंक', 'ṅ', 'aṅk'], ['पंख', 'ṅ', 'paṅkh'], ['पंच', 'ñ', 'pañc'], ['अंडा', 'ṇ', 'aṇḍā'], ['हिंदी', 'n', 'hindī'],
      ['संबंध', 'm', 'sambandh'], ['कंपनी', 'm', 'kampanī'],
    ];
    for (const [w, n, r] of cases) {
      const us = decodeHindi(w);
      expect(us.find((u) => u.signs?.includes('anusvara'))!.finalSound, w).toBe(n);
      expect(said(w), w).toBe(r);
      expect(hindiRule(w)).toMatch(/nasal of the next consonant/);
    }
  });

  it('a nasalised vowel before य र ल व श ष स ह and at the end of a word', () => {
    for (const [w, r] of [['संयम', 'saṁyam'], ['वंश', 'vaṁś'], ['सिंह', 'siṁh'], ['संसार', 'saṁsār'], ['हैं', 'haiṁ'], ['में', 'meṁ'], ['नहीं', 'nahīṁ'], ['इंसान', 'iṁsān']] as const) {
      expect(said(w), w).toBe(r);
    }
    expect(decodeHindi('हैं')[0].finalSound).toBe('ṁ');
    expect(decodeHindi('नहीं')[1].finalSound).toBe('ṁ');
  });

  it('chandrabindu is a nasalised vowel, and the unit keeps its a when it carries one', () => {
    expect(said('माँ')).toBe('māṁ');
    expect(said('यहाँ')).toBe('yahāṁ');
    expect(said('हूँ')).toBe('hūṁ');
    expect(decodeHindi('हूँ')[0].signs).toContain('chandrabindu');
    expect(decodeHindi('माँ')[0].rule).toMatch(/nasalises/);
  });
});

function hindiRule(w: string): string {
  return decodeHindi(w).map((u) => u.rule ?? '').join(' ');
}

describe('decodeHindi: letters', () => {
  it('nukta letters: q ḵẖ ġ z f and the flaps ṛ ṛh', () => {
    expect(said('क%ानून')).toBe('qānūn');
    expect(said('ख%बर')).toBe('ḵẖabar');
    expect(said('ग%लत')).toBe('ġalat');
    expect(said('ज%रूरत')).toBe('zarūrat');
    expect(said('फ%ोन')).toBe('fon');
    expect(said('पढ%ना')).toBe('paṛhnā');
    expect(said('बड%ा')).toBe('baṛā');
    expect(decodeHindi(nk('ज%'))[0].signs).toContain('nukta');
  });

  it('ज्ञ is jñ in ISO and said gy; क्ष is kṣ', () => {
    const [jna] = decodeHindi('ज्ञान');
    expect(jna.romanization).toBe('jñā');
    expect(jna.rule).toMatch(/gy/);
    expect(jna.cluster).toBe('ज्ञ');
    expect(jna.initial).toBe('जञ');
    expect(said('क्षमा')).toBe('kṣamā');
    expect(said('प्रेम')).toBe('prem');
    expect(said('श्री')).toBe('śrī');
    expect(said('त्रिशूल')).toBe('triśūl');
  });

  it('ह and its neighbours need no special rule, and no rule text is invented for plain letters', () => {
    const [ka] = decodeHindi('का');
    expect(ka.rule).toBeUndefined();
    expect(decodeHindi('हा')[0].rule).toBeUndefined();
  });

  it('digits and the danda are read; other characters are not', () => {
    expect(decodeHindi('१२३').map((u) => u.romanization)).toEqual(['1', '2', '3']);
    expect(decodeHindi('।')[0].romanization).toBe('.');
    const [a] = decodeHindi('a');
    expect(a.romanization).toBeUndefined();
    expect(a.confidence).toBe(0);
  });

  it('a conjunct unit carries its letters and cluster; a plain unit carries no cluster', () => {
    const [kssa] = decodeHindi('क्षमा');
    expect(kssa.cluster).toBe('क्ष');
    expect(kssa.initial).toBe('कष');
    expect(decodeHindi('का')[0].cluster).toBeUndefined();
  });

  it('is fast enough to call per tapped word', () => {
    const t0 = Date.now();
    for (let i = 0; i < 2000; i++) decodeHindi('प्रार्थना');
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

describe('decodeHindiWithPronunciation', () => {
  it('agrees with the rules: units carry source dictionary and the id, not irregular', () => {
    const us = decodeHindiWithPronunciation('कमल', { ipa: '/kə.məl/' }, 'wiktionary');
    expect(us.map((u) => u.source)).toEqual(['dictionary', 'dictionary', 'dictionary']);
    expect(us.every((u) => u.sourceId === 'wiktionary')).toBe(true);
    expect(us.some((u) => u.irregular)).toBe(false);
    expect(us.map((u) => u.inherentVowel)).toEqual(['pronounced', 'pronounced', 'dropped']);
    expect(us.map((u) => u.romanization).join('')).toBe('kamal');
    expect(us.every((u) => u.confidence >= 0.9)).toBe(true);
  });

  it('takes square brackets, tie bars, stress marks and the vowel ɐ', () => {
    expect(decodeHindiWithPronunciation('कमल', { ipa: '[kə.mɐl]' }).map((u) => u.romanization).join('')).toBe('kamal');
    expect(decodeHindiWithPronunciation('कमल', { ipa: '/ˈkə.məl/' })[2].inherentVowel).toBe('dropped');
    expect(decodeHindiWithPronunciation(nk('लड%का'), { ipa: '/ləɽ.kaː/' }).map((u) => u.romanization).join('')).toBe('laṛkā');
    expect(decodeHindiWithPronunciation('चाचा', { ipa: '/t͡ʃaː.t͡ʃaː/' }).map((u) => u.source)).toEqual(['dictionary', 'dictionary']);
  });

  it('decides an uncertain a that the rules cannot: अनुमति /ə.nu.mə.t̪i/', () => {
    const rules = decodeHindi('उपहार');
    expect(rules.some((u) => u.inherentVowel === 'uncertain')).toBe(true);
    const us = decodeHindiWithPronunciation('उपहार', { ipa: '/ʊ.pə.ɦaːɾ/' }, 'w');
    expect(us.map((u) => u.inherentVowel)).toEqual([undefined, 'pronounced', undefined, 'dropped']);
    expect(us.map((u) => u.romanization).join('')).toBe('upahār');
    expect(us.some((u) => u.irregular)).toBe(false);
    expect(us.find((u) => u.inherentVowel === 'pronounced')!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('where the dictionary and the rules differ it wins, flags irregular and keeps the rule\'s answer in the rule text', () => {
    const rules = decodeHindi('कमल');
    expect(rules[1].inherentVowel).toBe('pronounced');
    const us = decodeHindiWithPronunciation('कमल', { ipa: '/kəml/' }, 'wikt');
    expect(us[1].inherentVowel).toBe('dropped');
    expect(us[1].irregular).toBe(true);
    expect(us[1].source).toBe('dictionary');
    expect(us[1].sourceId).toBe('wikt');
    expect(us[1].rule).toMatch(/spelling rules alone would have said/);
    expect(us[1].rule).toMatch(/is said/);
    expect(us.map((u) => u.romanization).join('')).toBe('kaml');
    // and the other way: the rules drop the a, the dictionary has a vowel there
    const back = decodeHindiWithPronunciation('समझना', { ipa: '/sə.mə.ɟʱə.naː/' }, 'wikt');
    expect(back[2].inherentVowel).toBe('pronounced');
    expect(back[2].irregular).toBe(true);
    expect(back[2].rule).toMatch(/not said/);
  });

  it('aligns an anusvara written out as a nasal consonant, or as a nasal vowel', () => {
    for (const ipa of ['/ɦɪn̪.d̪iː/', '/ɦĩ.d̪iː/', '[ɦɪn.d̪iː]']) {
      const us = decodeHindiWithPronunciation('हिंदी', { ipa }, 'w');
      expect(us.map((u) => u.source), ipa).toEqual(['dictionary', 'dictionary']);
      expect(us.map((u) => u.romanization).join(''), ipa).toBe('hindī');
    }
    expect(decodeHindiWithPronunciation('हैं', { ipa: '/ɦɛ̃ː/' })[0].source).toBe('dictionary');
  });

  it('a word with an affricate, a long vowel and a conjunct', () => {
    const us = decodeHindiWithPronunciation('प्रार्थना', { ipa: '/pɾaː.ɾt̪ʰ.naː/' }, 'w');
    expect(us.map((u) => u.source)).toEqual(['dictionary', 'dictionary', 'dictionary']);
    expect(us.map((u) => u.romanization).join('')).toBe('prārthnā');
    expect(decodeHindiWithPronunciation('बच्चा', { ipa: '/bət͡ʃ.t͡ʃaː/' }, 'w').map((u) => u.source)).toEqual(['dictionary', 'dictionary']);
  });

  it('falls back to decodeHindi unchanged when the IPA cannot be aligned', () => {
    const base = decodeHindi('कमल');
    expect(decodeHindiWithPronunciation('कमल', { ipa: '/foo/' }, 'w')).toEqual(base);
    expect(decodeHindiWithPronunciation('कमल', { ipa: '/kə.mə.lə.nə/' }, 'w')).toEqual(base);
    expect(decodeHindiWithPronunciation('कमल', { ipa: '/kəm/' }, 'w')).toEqual(base);
    expect(decodeHindiWithPronunciation('कमल', {}, 'w')).toEqual(base);
    expect(decodeHindiWithPronunciation('कमल', { respelling: 'ka-mal' }, 'w')).toEqual(base);
    expect(decodeHindiWithPronunciation('कमल', { ipa: '' }, 'w')).toEqual(base);
    expect(decodeHindiWithPronunciation('कमल', { ipa: '//' }, 'w')).toEqual(base);
  });

  it('falls back for a surface with characters that are not Devanagari', () => {
    expect(decodeHindiWithPronunciation('कa', { ipa: '/kə/' }, 'w')).toEqual(decodeHindi('कa'));
  });
});

describe('hindiOrthFeatures and describeHindiOrthFeature', () => {
  it('lists the letters, vowel signs, conjuncts, signs and rules a word exercises', () => {
    const f = hindiOrthFeatures(decodeHindi('प्रार्थना'));
    for (const k of ['letter:प', 'letter:र', 'letter:थ', 'letter:न', 'matra:ा', 'conjunct:प्र', 'conjunct:र्थ', 'sign:rakar', 'sign:reph', 'rule:medial-a-dropped']) expect(f, k).toContain(k);
    expect(f).not.toContain('rule:final-a-dropped');
    expect(new Set(f).size).toBe(f.length);
  });

  it('final and medial a-dropping are separate keys', () => {
    expect(hindiOrthFeatures(decodeHindi('कमल'))).toContain('rule:final-a-dropped');
    expect(hindiOrthFeatures(decodeHindi('कमल'))).not.toContain('rule:medial-a-dropped');
    expect(hindiOrthFeatures(decodeHindi('करना'))).toEqual(expect.arrayContaining(['rule:medial-a-dropped', 'letter:क', 'letter:र', 'letter:न', 'matra:ा']));
  });

  it('nukta, anusvara with a class nasal, chandrabindu, visarga, virama and independent vowels', () => {
    expect(hindiOrthFeatures(decodeHindi(nk('ज%रूरत')))).toEqual(expect.arrayContaining([nk('letter:ज%'), 'sign:nukta', 'matra:ू']));
    const hindi = hindiOrthFeatures(decodeHindi('हिंदी'));
    expect(hindi).toEqual(expect.arrayContaining(['sign:anusvara', 'rule:anusvara-nasal', 'matra:ि', 'matra:ी']));
    expect(hindiOrthFeatures(decodeHindi('हैं'))).toContain('sign:anusvara');
    expect(hindiOrthFeatures(decodeHindi('हैं'))).not.toContain('rule:anusvara-nasal');
    expect(hindiOrthFeatures(decodeHindi('माँ'))).toContain('sign:chandrabindu');
    expect(hindiOrthFeatures(decodeHindi('पुनः'))).toContain('sign:visarga');
    expect(hindiOrthFeatures(decodeHindi('सत्'))).toContain('sign:virama');
    expect(hindiOrthFeatures(decodeHindi('आम'))).toContain('vowel:आ');
    expect(hindiOrthFeatures(decodeHindi('ऽ'))).toContain('sign:avagraha');
  });

  it('a conjunct of three is one key; क्ष and ज्ञ are conjuncts', () => {
    expect(hindiOrthFeatures(decodeHindi('स्त्री'))).toContain('conjunct:स्त्र');
    expect(hindiOrthFeatures(decodeHindi('स्त्री')).filter((k) => k.startsWith('conjunct:'))).toHaveLength(1);
    expect(hindiOrthFeatures(decodeHindi('क्षमा'))).toContain('conjunct:क्ष');
    expect(hindiOrthFeatures(decodeHindi('ज्ञान'))).toContain('conjunct:ज्ञ');
  });

  it('keys are stable: the same word gives the same list, and two spellings give different ones', () => {
    expect(hindiOrthFeatures(decodeHindi('कमल'))).toEqual(hindiOrthFeatures(decodeHindi('कमल')));
    expect(hindiOrthFeatures(decodeHindi(nk('ज%रूरत')))).not.toEqual(hindiOrthFeatures(decodeHindi('जरूरत')));
    expect(hindiOrthFeatures([])).toEqual([]);
  });

  it('describes each kind of item in one plain sentence', () => {
    expect(describeHindiOrthFeature('conjunct:क्ष')).toBe('क्ष is क and ष written together: kṣ.');
    expect(describeHindiOrthFeature('conjunct:ज्ञ')).toMatch(/jñ, said gy/);
    expect(describeHindiOrthFeature('conjunct:स्त्र')).toMatch(/स, त and र written together: str/);
    expect(describeHindiOrthFeature('letter:क')).toMatch(/^क is a consonant letter: ka/);
    expect(describeHindiOrthFeature(nk('letter:ज%'))).toMatch(/nukta.*z/);
    expect(describeHindiOrthFeature('matra:ा')).toMatch(/vowel sign ā/);
    expect(describeHindiOrthFeature('matra:ि')).toMatch(/before the letter/);
    expect(describeHindiOrthFeature('vowel:आ')).toMatch(/vowel letter ā/);
    for (const k of ['nukta', 'anusvara', 'chandrabindu', 'visarga', 'virama', 'reph', 'rakar', 'avagraha']) expect(describeHindiOrthFeature(`sign:${k}`), k).toMatch(/\.$/);
    for (const k of ['final-a-dropped', 'medial-a-dropped', 'anusvara-nasal']) expect(describeHindiOrthFeature(`rule:${k}`), k).toMatch(/\.$/);
    expect(describeHindiOrthFeature('unknown')).toBe('unknown');
  });

  it('every key a decoded word produces has a description that is not the key itself', () => {
    for (const w of ['प्रार्थना', 'हिंदी', 'क्षमा', 'पुनः', nk('ज%रूरत'), 'कमल', 'करना', 'सत्', 'ऽ', 'कृपा', 'कॉलेज', 'माँ']) {
      for (const k of hindiOrthFeatures(decodeHindi(w))) expect(describeHindiOrthFeature(k), `${w} ${k}`).not.toBe(k);
    }
  });
});
