// @vitest-environment node
/**
 * Russian number words (nominative cardinals) and the speech normaliser that uses them. A combining acute is always written as \u0301.
 * The expected words are the author's own, machine-drafted from general knowledge of Russian; none has been checked by a native speaker.
 */
import { describe, expect, it } from 'vitest';
import { ruNumberToWords } from '../../src/adapters/russian/numbers';
import { ruSpeechNormalize } from '../../src/adapters/russian/speech';

const w = (n: number, gender?: 'm' | 'f' | 'n'): string | undefined => ruNumberToWords(n, gender ? { gender } : undefined);

describe('ruNumberToWords: the units, teens and tens', () => {
  it('zero and the single digits', () => {
    expect(w(0)).toBe('ноль');
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => w(n))).toEqual(['один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']);
  });
  it('10 to 19 never change with gender', () => {
    const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
    expect([10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((n) => w(n))).toEqual(teens);
    for (const g of ['m', 'f', 'n'] as const) expect([11, 12].map((n) => w(n, g))).toEqual(['одиннадцать', 'двенадцать']);
  });
  it('the tens and the hundreds', () => {
    expect([20, 30, 40, 50, 60, 70, 80, 90].map((n) => w(n))).toEqual(['двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто']);
    expect([100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => w(n))).toEqual(['сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот']);
    expect(w(999)).toBe('девятьсот девяносто девять');
    expect(w(47)).toBe('сорок семь');
    expect(w(215)).toBe('двести пятнадцать');
  });
});

describe('ruNumberToWords: gender of один and два', () => {
  it('один / одна / одно and два / две / два', () => {
    expect(w(1)).toBe('один');
    expect(w(1, 'f')).toBe('одна');
    expect(w(1, 'n')).toBe('одно');
    expect(w(2)).toBe('два');
    expect(w(2, 'f')).toBe('две');
    expect(w(2, 'n')).toBe('два');
  });
  it('the last digit of a compound agrees: 21, 22, 101, 102', () => {
    expect(w(21)).toBe('двадцать один');
    expect(w(21, 'f')).toBe('двадцать одна');
    expect(w(21, 'n')).toBe('двадцать одно');
    expect(w(22)).toBe('двадцать два');
    expect(w(22, 'f')).toBe('двадцать две');
    expect(w(101)).toBe('сто один');
    expect(w(101, 'n')).toBe('сто одно');
    expect(w(102, 'f')).toBe('сто две');
  });
  it('3 and 4 and 5 do not change with gender', () => {
    for (const g of ['m', 'f', 'n'] as const) expect([3, 4, 5, 13].map((n) => w(n, g))).toEqual(['три', 'четыре', 'пять', 'тринадцать']);
  });
});

describe('ruNumberToWords: thousands, millions, billions', () => {
  it('тысяча is feminine and counts by its last two digits', () => {
    expect(w(1000)).toBe('одна тысяча');
    expect(w(2000)).toBe('две тысячи');
    expect(w(3000)).toBe('три тысячи');
    expect(w(4000)).toBe('четыре тысячи');
    expect(w(5000)).toBe('пять тысяч');
    expect(w(11000)).toBe('одиннадцать тысяч');
    expect(w(12000)).toBe('двенадцать тысяч');
    expect(w(14000)).toBe('четырнадцать тысяч');
    expect(w(21000)).toBe('двадцать одна тысяча');
    expect(w(22000)).toBe('двадцать две тысячи');
    expect(w(25000)).toBe('двадцать пять тысяч');
    expect(w(100000)).toBe('сто тысяч');
    expect(w(101000)).toBe('сто одна тысяча');
    expect(w(111000)).toBe('сто одиннадцать тысяч');
    expect(w(112000)).toBe('сто двенадцать тысяч');
    expect(w(222000)).toBe('двести двадцать две тысячи');
  });
  it('the thousands group is feminine whatever gender the whole number is asked in, and the last group follows the gender', () => {
    expect(w(2000, 'n')).toBe('две тысячи');
    expect(w(1001)).toBe('одна тысяча один');
    expect(w(1001, 'f')).toBe('одна тысяча одна');
    expect(w(2002, 'f')).toBe('две тысячи две');
    expect(w(2002, 'n')).toBe('две тысячи два');
    expect(w(12345)).toBe('двенадцать тысяч триста сорок пять');
  });
  it('миллион and миллиард are masculine', () => {
    expect(w(1000000)).toBe('один миллион');
    expect(w(2000000)).toBe('два миллиона');
    expect(w(5000000)).toBe('пять миллионов');
    expect(w(11000000)).toBe('одиннадцать миллионов');
    expect(w(21000000)).toBe('двадцать один миллион');
    expect(w(22000000)).toBe('двадцать два миллиона');
    expect(w(1000000000)).toBe('один миллиард');
    expect(w(2000000000)).toBe('два миллиарда');
    expect(w(5000000000)).toBe('пять миллиардов');
    expect(w(1000000, 'f')).toBe('один миллион');
  });
  it('a zero group is skipped, not spoken', () => {
    expect(w(1001001)).toBe('один миллион одна тысяча один');
    expect(w(1000001)).toBe('один миллион один');
    expect(w(1000001, 'f')).toBe('один миллион одна');
    expect(w(2000100)).toBe('два миллиона сто');
    expect(w(3000000002)).toBe('три миллиарда два');
  });
  it('the largest supported number', () => {
    expect(w(999999999999)).toBe('девятьсот девяносто девять миллиардов девятьсот девяносто девять миллионов девятьсот девяносто девять тысяч девятьсот девяносто девять');
  });
});

describe('ruNumberToWords: the range', () => {
  it('is undefined outside 0 … 999 999 999 999, for a non-integer and for a non-number', () => {
    expect(w(1000000000000)).toBeUndefined();
    expect(w(-1)).toBeUndefined();
    expect(w(1.5)).toBeUndefined();
    expect(w(Number.NaN)).toBeUndefined();
    expect(w(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
  it('speaks every number from 0 to 2000 with no digit, no double space and no empty word', () => {
    for (let n = 0; n <= 2000; n++) {
      const s = w(n)!;
      expect(s, String(n)).toMatch(/^[а-яё]+( [а-яё]+)*$/);
    }
  });
});

describe('ruSpeechNormalize', () => {
  const say = (t: string): string => ruSpeechNormalize(t).speechText;

  it('is versioned speech-ru@1, deterministic, and carries no wall-clock time', () => {
    const a = ruSpeechNormalize('Мне 25 лет, т. е. много.');
    expect(a.normalizerVersion).toBe('speech-ru@1');
    expect(a).toEqual(ruSpeechNormalize('Мне 25 лет, т. е. много.'));
    for (const t of a.transformations) { expect(t.tool).toBe('speech-ru@1'); expect(t.at).toBe('1970-01-01T00:00:00.000Z'); }
  });

  it('speaks a digit as a word', () => {
    expect(say('3')).toBe('три');
    expect(say('Мне 25 лет.')).toBe('Мне двадцать пять лет.');
    expect(say('Глава 1.')).toBe('Глава один.');
    expect(say('В классе 12 детей и 5 учителей.')).toBe('В классе двенадцать детей и пять учителей.');
    expect(say('3 книги')).toBe('три книги');
  });

  it('strips verse markers and does not damage a bracketed number', () => {
    const r = ruSpeechNormalize('Ибо [16] так возлюбил ¹⁶ Бог.', { isScripture: true });
    expect(r.speechText).toBe('Ибо так возлюбил Бог.');
    expect(r.transformations.map((t) => t.description).join('|')).toMatch(/removed verse markers/);
    expect(say('[1] Бог')).toBe('Бог');
  });

  it('percent: the noun follows the number', () => {
    expect(say('5 %')).toBe('пять процентов');
    expect(say('5%')).toBe('пять процентов');
    expect(say('1 %')).toBe('один процент');
    expect(say('3%')).toBe('три процента');
    expect(say('21 %')).toBe('двадцать один процент');
    expect(say('22 %')).toBe('двадцать два процента');
    expect(say('11 %')).toBe('одиннадцать процентов');
    expect(say('14 %')).toBe('четырнадцать процентов');
    expect(say('101 %')).toBe('сто один процент');
    expect(say('111 %')).toBe('сто одиннадцать процентов');
    expect(say('0 %')).toBe('ноль процентов');
  });
  it('a decimal percent is left alone, as are the decimal digits', () => {
    expect(say('2,5 %')).toBe('2,5 %');
  });

  it('expands the common abbreviations', () => {
    expect(say('Это важно, т. е. очень.')).toBe('Это важно, то есть очень.');
    expect(say('Это важно, т.е. очень.')).toBe('Это важно, то есть очень.');
    expect(say('книги, ручки и т. д. лежали')).toBe('книги, ручки и так далее лежали');
    expect(say('книги, ручки и т. п. лежали')).toBe('книги, ручки и тому подобное лежали');
    expect(say('Я иду, т. к. поздно.')).toBe('Я иду, так как поздно.');
    expect(say('люди, в т. ч. дети')).toBe('люди, в том числе дети');
    expect(say('Иван, Пётр и др. пришли.')).toBe('Иван, Пётр и другие пришли.');
  });
  it('keeps the full stop that ends the sentence after т. д., т. п. and и др.', () => {
    expect(say('Книги, ручки и т. д.')).toBe('Книги, ручки и так далее.');
    expect(say('Книги, ручки и т. д. Потом он ушёл.')).toBe('Книги, ручки и так далее. Потом он ушёл.');
    expect(say('Столы, стулья и т. п.')).toBe('Столы, стулья и тому подобное.');
    expect(say('Иван, Пётр и др.')).toBe('Иван, Пётр и другие.');
  });
  it('г. becomes город only at the start of a line or after a colon, before a capital letter', () => {
    expect(say('г. Москва — столица')).toBe('город Москва — столица');
    expect(say('Адрес: г. Москва')).toBe('Адрес: город Москва');
    expect(say('Он жил в г. Москве.')).toBe('Он жил в г. Москве.');
    expect(say('в 1990 г. Москва выросла')).toBe('в 1990 г. Москва выросла');
  });
  it('leaves the abbreviations it cannot expand safely', () => {
    expect(say('5 руб.')).toBe('пять руб.');
    expect(say('Смотри см. выше')).toBe('Смотри см. выше');
    expect(say('3 млн жителей')).toBe('три млн жителей');
  });

  it('leaves a numeral as digits where gender, case or an ordinal depends on the next word, and says so', () => {
    for (const t of ['1 книга', '2 окна', '21 год', '5 января', '1 мая', 'в 2020 году', 'в 2020 г.', 'с 1990 по 2000 гг.', '5-й день', '3-го числа', '5 г']) {
      const r = ruSpeechNormalize(t);
      expect(r.speechText, t).toMatch(/\d/);
      expect(r.transformations.map((x) => x.description).join('|'), t).toMatch(/left as digits/);
    }
    expect(say('1 книга')).toBe('1 книга');
    expect(say('в 2020 году')).toBe('в 2020 году');
    expect(say('5-й день')).toBe('5-й день');
  });
  it('still expands a numeral whose noun is plural or whose number needs no gender', () => {
    expect(say('12 книг')).toBe('двенадцать книг');
    expect(say('11 окон')).toBe('одиннадцать окон');
    expect(say('4 дома')).toBe('четыре дома');
    expect(say('Ответ: 2.')).toBe('Ответ: два.');
  });

  it('strips the stress marks (a voice chooses the stress) and keeps ё', () => {
    const r = ruSpeechNormalize('Кни\u0301гу чита\u0301ю, всё хорошо\u0301.');
    expect(r.speechText).toBe('Книгу читаю, всё хорошо.');
    expect(r.transformations.map((x) => x.description)).toContain('removed stress marks (a voice chooses the stress itself)');
    expect(ruSpeechNormalize('Книгу читаю.').transformations).toEqual([]);
  });

  it('never transliterates: Cyrillic in, Cyrillic out', () => {
    const out = say('Мы читаем т. е. 5 книг, 21 %.');
    expect(out).toMatch(/^[\p{Script=Cyrillic}\s.,%]+$/u);
  });
});
