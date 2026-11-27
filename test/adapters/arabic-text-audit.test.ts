// Single words in Qur’anic-style spelling (a spelling is not a quotation) and sentences written 2026-11-27 by the Arabic pack’s AI agents in Qur’anic-style orthography (the alif wasla, the dagger alif, full vowels); no verse and no edition is quoted.
/**
 * Arabic text views, second set: the cases an independent audit found wrong in the first draft (implied vowels, decomposed input,
 * Quranic marks and spelling, phrase ligatures, a letter written onto a number, abbreviations, borrowed letters) and the one
 * spelling convention of a headword. Every Arabic mark is written as an escape or built from the named constants.
 */
import { describe, expect, it } from 'vitest';
import {
  arCanon, arHeadForm, arKey, arKeyMap, arLoose, arQuranicSpelling, arSegmentSentences, arTokenize, endsInFarsiYeh, hasBorrowedLetter, hasTashkil,
  packVocal, splitVocal, tashkilLevel, vocalMatch, DAGGER_ALIF, DAMMA, DAMMATAN, FATHA, FATHATAN, KASRA, KASRATAN, SHADDA, SUKUN, TATWEEL,
} from '../../src/adapters/arabic/text';

const match = (printed: string, candidate: string, opts?: { afterArticle?: boolean }) => vocalMatch(printed, arKey(candidate), packVocal(candidate), opts);

describe('vocalMatch: implied vowels and bare letters', () => {
  it('a printed vowel the source merely leaves unwritten is not a contradiction', () => {
    const hadhaSource = `ه${DAGGER_ALIF}ذ${FATHA}ا`; // هٰذَا
    expect(match(`ه${FATHA}${DAGGER_ALIF}ذ${FATHA}ا`, hadhaSource).compatible).toBe(true); // هَٰذَا
    expect(match(`ه${FATHA}ذ${FATHA}ا`, hadhaSource).compatible).toBe(true); // هَذَا
    const kitabSource = `ك${KASRA}تاب`; // كِتاب, the fatḥa before the alif left off
    expect(match(`ك${KASRA}ت${FATHA}اب`, kitabSource)).toMatchObject({ compatible: true, agreed: 2 });
    // and the other way round: print leaves it off, the source writes it
    expect(match(kitabSource, `ك${KASRA}ت${FATHA}اب`).compatible).toBe(true);
    // a wrong vowel before the alif is still a contradiction
    expect(match(`ك${KASRA}ت${DAMMA}اب`, kitabSource).compatible).toBe(false);
  });
  it('a case ending printed on a word the source cites without one is not a contradiction', () => {
    const kitab = `ك${KASRA}ت${FATHA}اب`; // كِتَاب
    expect(match(`${kitab}${KASRA}`, kitab).compatible).toBe(true);
    // but against a source ending it is one, and only the ending
    expect(match(`${kitab}${FATHA}`, `${kitab}${DAMMATAN}`)).toMatchObject({ compatible: false, endingOnly: true });
  });
  it('a vowel printed on a letter the candidate reads as a long vowel contradicts it', () => {
    const fi = `ف${KASRA}ي`; // فِي
    expect(match(`ف${KASRA}ي${FATHA}`, fi).compatible).toBe(false);
    expect(match(`ف${KASRA}ي${SUKUN}`, fi).compatible).toBe(true);
    // بَيْت against a candidate بِيت (long ī) : the printed fatḥa on ب contradicts the stated kasra
    expect(match(`ب${FATHA}ي${SUKUN}ت`, `ب${KASRA}يت`).compatible).toBe(false);
  });
  it('the shadda of a sun letter after the article belongs to the article', () => {
    const shams = `ش${FATHA}م${SUKUN}س`; // شَمْس
    const printedStem = `ش${SHADDA}${FATHA}م${SUKUN}س`; // شَّمْس as printed after ال
    expect(match(printedStem, shams).compatible).toBe(false);
    expect(match(printedStem, shams, { afterArticle: true }).compatible).toBe(true);
    // a moon letter gets no such allowance
    const qamar = `ق${FATHA}م${FATHA}ر`;
    expect(match(`ق${SHADDA}${FATHA}م${FATHA}ر`, qamar, { afterArticle: true }).compatible).toBe(false);
  });
  it('an unvocalized candidate constrains nothing', () => {
    expect(vocalMatch(`ك${DAMMA}تب`, 'كتب', '')).toEqual({ compatible: true, agreed: 0 });
  });
});

describe('decomposed and Quranic input', () => {
  it('arKeyMap reads a letter with the marks typed after it, as arKey does', () => {
    const amana = 'آمن'; // ا + combining madda + من
    expect(arKey(amana)).toBe('آمن');
    const m = arKeyMap(amana);
    expect(m.key).toBe(arKey(amana));
    expect(m.starts).toEqual([0, 2, 3]);
    expect(m.ends).toEqual([2, 3, 4]);
    const sual = 'سؤال'; // س + و + combining hamza + ال
    expect(arKeyMap(sual).key).toBe(arKey(sual));
    expect(arKeyMap(sual).key).toBe('سؤال');
  });
  it('reads the Quranic sukūn and the open tanwīn as what they are', () => {
    const alhamdu = `ٱلۡح${FATHA}مۡد${DAMMA}`; // ٱلۡحَمۡدُ
    expect(splitVocal(alhamdu).marks.map((x) => x.vowel)).toEqual(['', SUKUN, FATHA, SUKUN, DAMMA]);
    expect(tashkilLevel(alhamdu)).toBe('full');
    expect(hasTashkil('لۡ')).toBe(true);
    const rahiman = `ر${FATHA}ح${KASRA}يمٗا`; // رَحِيمٗا in the King Fahd encoding
    expect(splitVocal(rahiman).marks[3].vowel).toBe(FATHATAN);
    expect(splitVocal(`ع${FATHA}ل${KASRA}يمࣱ`).marks[3].vowel).toBe(DAMMATAN);
  });
  it('rewrites Quranic spelling into the ordinary one, keeping offsets into the printed word', () => {
    const alamin = `ٱلۡع${FATHA}${DAGGER_ALIF}ل${FATHA}م${KASRA}ين${FATHA}`; // ٱلۡعَٰلَمِينَ
    const q = arQuranicSpelling(alamin)!;
    expect(arKey(q.text)).toBe('العالمين'); // العالمين
    expect(q.at).toHaveLength(q.text.length + 1);
    expect(q.at[q.text.length]).toBe(alamin.length);
    for (let i = 1; i < q.at.length; i++) expect(q.at[i]).toBeGreaterThanOrEqual(q.at[i - 1]);
    const salat = `ٱلص${SHADDA}${FATHA}ل${FATHA}و${DAGGER_ALIF}ة${FATHA}`; // ٱلصَّلَوٰةَ
    expect(arKey(arQuranicSpelling(salat)!.text)).toBe('الصلاة'); // الصلاة
    const dallin = `ٱلض${SHADDA}${FATHA}آل${SHADDA}${KASRA}ين${FATHA}`; // ٱلضَّآلِّينَ
    expect(arKey(arQuranicSpelling(dallin)!.text)).toBe('الضالين'); // الضالين
    const yaayyuha = `ي${FATHA}${TATWEEL}${DAGGER_ALIF}ٓأ${FATHA}ي${SHADDA}${DAMMA}ه${FATHA}ا`; // يَـٰٓأَيُّهَا
    expect(arKey(arQuranicSpelling(yaayyuha)!.text)).toBe('ياأيها'); // ياأيها
    // ordinary words are left alone: a final ىٰ is the alif maqṣūra, and a plain word has nothing to rewrite
    expect(arQuranicSpelling(`م${DAMMA}وس${FATHA}ى${DAGGER_ALIF}`)).toBeUndefined(); // مُوسَىٰ
    expect(arQuranicSpelling('كتاب')).toBeUndefined();
    // هٰذَا is rewritten (هاذا) only as an alternative; the analyser finds the word as it stands first
    expect(arKey(arQuranicSpelling(`ه${DAGGER_ALIF}ذ${FATHA}ا`)!.text)).toBe('هاذا');
  });
});

describe('symbols, numbers, abbreviations, borrowed letters', () => {
  it('a phrase ligature is a symbol, and a spacing vowel sign leaves no space in the key', () => {
    const text = 'محمد ﷺ قال';
    const toks = arTokenize(text);
    expect(toks.filter((t) => t.isWord).map((t) => t.normalized)).toEqual(['محمد', 'قال']);
    for (const t of toks) expect(t.normalized).not.toMatch(/\s/);
    expect(arKey('ﹰ')).toBe('');
    expect(arCanon('ﷲ')).toBe(arCanon('ﷲ').trim()); // ﷲ is one word
    expect(arKey('ﷲ')).not.toMatch(/\s/);
  });
  it('a conjunction written onto a number is a word before the number', () => {
    const text = 'و٢٠٢٤ ب 15'; // و٢٠٢٤ and a word followed by a number
    const toks = arTokenize('في و٢٠٢٤');
    expect(toks.filter((t) => t.isWord).map((t) => t.normalized)).toEqual(['في', 'و']);
    expect(toks.find((t) => !t.isWord && /[٠-٩]/.test(t.surface))?.surface).toBe('٢٠٢٤');
    for (const t of arTokenize(text)) expect(text.slice(t.start, t.end)).toBe(t.surface);
  });
  it('a single letter and a full stop does not end a sentence', () => {
    const text = 'قال د. أحمد: نعم. ثم ذهب.';
    expect(arSegmentSentences(text).map((s) => text.slice(s.start, s.end))).toEqual(['قال د. أحمد: نعم.', 'ثم ذهب.']);
  });
  it('borrowed letters fold to the Arabic letter the dictionary writes, and a final Persian yeh is noticed', () => {
    expect(arLoose('ڤيديو')).toBe('فيديو'); // ڤيديو → فيديو
    expect(hasBorrowedLetter('پاريس')).toBe(true);
    expect(hasBorrowedLetter('باريس')).toBe(false);
    expect(endsInFarsiYeh('علی')).toBe(true);
    expect(endsInFarsiYeh(`علی${FATHA}`)).toBe(true);
    expect(endsInFarsiYeh('علي')).toBe(false);
  });
});

describe('arHeadForm: one spelling of a headword', () => {
  const kitab = `ك${KASRA}ت${FATHA}اب`; // كِتَاب
  it('writes the implied fatḥa before an alif, and drops the fatḥa under a dagger alif', () => {
    expect(arHeadForm(`ك${KASRA}تاب`, 'NOUN')).toBe(kitab);
    const hadha = `ه${DAGGER_ALIF}ذ${FATHA}ا`;
    expect(arHeadForm(`ه${FATHA}${DAGGER_ALIF}ذ${FATHA}ا`, 'DET')).toBe(hadha);
    expect(arHeadForm(hadha, 'DET')).toBe(hadha);
  });
  it('writes the kasra of an initial hamzat al-waṣl on a verb and on a noun, and leaves the article alone', () => {
    const ijtamaa = `ا${KASRA}ج${SUKUN}ت${FATHA}م${FATHA}ع${FATHA}`; // اِجْتَمَعَ
    expect(arHeadForm(`اج${SUKUN}ت${FATHA}م${FATHA}ع${FATHA}`, 'VERB')).toBe(ijtamaa);
    expect(arHeadForm(`اس${SUKUN}م`, 'NOUN')).toBe(`ا${KASRA}س${SUKUN}م`); // اِسْم
    const albayt = `ال${SUKUN}ب${FATHA}ي${SUKUN}ت`; // الْبَيْت
    expect(arHeadForm(albayt, 'NOUN')).toBe(albayt);
    const ashshams = `الش${SHADDA}${FATHA}م${SUKUN}س`; // الشَّمْس
    expect(arHeadForm(ashshams, 'NOUN')).toBe(arCanon(ashshams)); // canonical mark order: the vowel before the shadda
  });
  it('drops the nominative ending of a noun, and keeps the endings that belong to the citation form', () => {
    expect(arHeadForm(`${kitab}${DAMMATAN}`, 'NOUN')).toBe(kitab);
    expect(arHeadForm(`${kitab}${DAMMA}`, 'NOUN')).toBe(kitab);
    const qadin = `ق${FATHA}اض${KASRATAN}`; // قَاضٍ
    expect(arHeadForm(qadin, 'NOUN')).toBe(qadin);
    const hudan = `ه${DAMMA}د${FATHATAN}ى`; // هُدًى
    expect(arHeadForm(hudan, 'NOUN')).toBe(hudan);
    const kataba = `ك${FATHA}ت${FATHA}ب${FATHA}`;
    expect(arHeadForm(kataba, 'VERB')).toBe(kataba);
    const nahnu = `ن${FATHA}ح${SUKUN}ن${DAMMA}`; // نَحْنُ is a pronoun: its ḍamma is not a case ending
    expect(arHeadForm(nahnu, 'PRON')).toBe(nahnu);
  });
  it('is idempotent, leaves an unvocalized headword as its key, and handles a headword of several words', () => {
    for (const [h, pos] of [[`ك${KASRA}تاب${DAMMATAN}`, 'NOUN'], [`اج${SUKUN}ت${FATHA}م${FATHA}ع${FATHA}`, 'VERB'], ['كتاب', 'NOUN']] as const) {
      const once = arHeadForm(h, pos);
      expect(arHeadForm(once, pos)).toBe(once);
    }
    expect(arHeadForm('كتاب', 'NOUN')).toBe('كتاب');
    const two = `ع${FATHA}ب${SUKUN}د${DAMMA} الل${SHADDA}${DAGGER_ALIF}ه`; // عَبْدُ اللّٰه
    expect(arHeadForm(two, 'PROPN')).toBe(two);
  });
});
