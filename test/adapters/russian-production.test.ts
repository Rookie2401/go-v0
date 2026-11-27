// @vitest-environment node
/**
 * Spelling checks on a learner's own Russian. Each check fires only on its unambiguous shape; an empty result means nothing was found,
 * never that the Russian is right. The examples are the author's own, machine-drafted; none has been checked by a native speaker.
 */
import { describe, expect, it } from 'vitest';
import type { AnalyzedToken, RawToken } from '../../src/core';
import { checkRuProduction } from '../../src/adapters/russian/production';
import { ruTokenize } from '../../src/adapters/russian/text';

const analyse = (tokens: RawToken[]): AnalyzedToken[] => tokens.map((token) => ({ token, candidates: [], analyzer: 'test' }));
const run = (sentence: string, analyses?: (tokens: RawToken[]) => AnalyzedToken[]) => {
  const tokens = ruTokenize(sentence);
  return { tokens, out: checkRuProduction(tokens, (analyses ?? analyse)(tokens), sentence) };
};
const apply = (sentence: string): string => {
  const { out } = run(sentence);
  let s = sentence;
  for (const e of [...out].sort((a, b) => (b.suggestion?.start ?? 0) - (a.suggestion?.start ?? 0))) {
    if (e.suggestion) s = s.slice(0, e.suggestion.start) + e.suggestion.replacement + s.slice(e.suggestion.end);
  }
  return s;
};

describe('жы / шы → жи / ши', () => {
  it('flags a word with жы or шы and suggests the spelling, with exact offsets', () => {
    const { tokens, out } = run('Я люблю жызнь.');
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe('spelling');
    expect(out[0].tokenIndexes).toEqual([tokens.findIndex((t) => t.surface === 'жызнь')]);
    expect(out[0].suggestion!.replacement).toBe('жизнь');
    expect('Я люблю жызнь.'.slice(out[0].suggestion!.start, out[0].suggestion!.end)).toBe('жызнь');
    expect(out[0].message).toMatch(/After ж and ш Russian writes и, not ы/);
    expect(apply('Мы будем шыть платье.')).toBe('Мы будем шить платье.');
  });
  it('keeps capitals and fixes every occurrence in the word', () => {
    expect(apply('Жызнь хороша.')).toBe('Жизнь хороша.');
    expect(apply('Мы шышки.')).toBe('Мы шишки.');
  });
  it('does not fire on a correct word, on ж or ш before another vowel, or on ц + ы / и', () => {
    for (const s of ['Я люблю жизнь.', 'Мы будем шить.', 'Он жуёт.', 'Это цирк.', 'Цыган пришёл.', 'Она шьёт.']) expect(run(s).out, s).toEqual([]);
  });
});

describe('чя / щя → ча / ща and чю / щю → чу / щу', () => {
  it('flags and suggests', () => {
    expect(apply('Он смотрит на чясы.')).toBe('Он смотрит на часы.');
    expect(apply('Это моя щюка.')).toBe('Это моя щука.');
    expect(apply('Какое чюдо.')).toBe('Какое чудо.');
    expect(run('Какое чюдо.').out[0].message).toMatch(/After ч and щ Russian writes а and у/);
  });
  it('does not fire on correct words', () => {
    for (const s of ['Он смотрит на часы.', 'Это щука.', 'Какое чудо.', 'Чашка чая.', 'Моя чья?']) expect(run(s).out, s).toEqual([]);
  });
});

describe('the sibilant checks stay quiet where the spelling is vouched for or is a name', () => {
  it('жюри, брошюра and парашют are not flagged (ж / ш + ю is not checked at all)', () => {
    for (const s of ['Жюри решило.', 'Это брошюра.', 'Он взял парашют.']) expect(run(s).out, s).toEqual([]);
  });
  it('a capitalised word that is not the first of the sentence is a name', () => {
    expect(run('Я был в Шымкент.').out).toEqual([]);
    expect(run('Мы любим Чюрлёнис.').out).toEqual([]);
  });
  it('an all-capital word is left alone', () => {
    expect(run('Мы пришли в ЖЫ.').out).toEqual([]);
  });
  it('a word the analyser vouches for as spelled is not flagged, a guess does not protect it', () => {
    const vouch = (conf: number, unconfirmed?: boolean) => (tokens: RawToken[]): AnalyzedToken[] =>
      tokens.map((token) => ({ token, analyzer: 'test', candidates: token.surface === 'жызнь' ? [{ lemma: 'жызнь', morph: {}, confidence: conf, ...(unconfirmed ? { unconfirmed: true } : {}) }] : [] }));
    expect(run('Я люблю жызнь.', vouch(0.9)).out).toEqual([]);
    expect(run('Я люблю жызнь.', vouch(0.3)).out).toHaveLength(1);
    expect(run('Я люблю жызнь.', vouch(0.9, true)).out).toHaveLength(1);
    const name = (tokens: RawToken[]): AnalyzedToken[] => tokens.map((token) => ({ token, analyzer: 'test', candidates: token.surface === 'жызнь' ? [{ lemma: 'жызнь', pos: 'PROPN', morph: {}, confidence: 0.3 }] : [] }));
    expect(run('Я люблю жызнь.', name).out).toEqual([]);
  });
});

describe('о before а э и о у → об', () => {
  it('flags о before a word that begins with a vowel sound written а, э, и, о or у', () => {
    expect(apply('Я думаю о этом.')).toBe('Я думаю об этом.');
    expect(apply('Мы говорили о Иване.')).toBe('Мы говорили об Иване.');
    expect(apply('Он рассказал о одном друге.')).toBe('Он рассказал об одном друге.');
    expect(apply('Мы думаем о уме.')).toBe('Мы думаем об уме.');
    expect(apply('Она знает о Америке.')).toBe('Она знает об Америке.');
    const { tokens, out } = run('Я думаю о этом.');
    expect(out[0].tokenIndexes).toEqual([tokens.findIndex((t) => t.surface === 'о'), tokens.findIndex((t) => t.surface === 'этом')]);
    expect(out[0].category).toBe('spelling');
  });
  it('does not fire on об, on о before a consonant or е ё ю я, or on an interjection with a comma', () => {
    for (const s of ['Я думаю об этом.', 'Я думаю о нём.', 'Я думаю о ней.', 'Мы говорили о ёлке.', 'Он знает о Юге.', 'Она думает о Яне.', 'О, этом не говори.', 'Он сказал: «О, этом!»']) expect(run(s).out, s).toEqual([]);
  });
  it('does not fire when a stop separates the о from the next word, or on a capital О that opens the sentence', () => {
    expect(run('Я сказал о. Этом больше нет.').out).toEqual([]);
    expect(run('О этом позже.').out).toEqual([]);
  });
});

describe('в / с / к before мне, мной → во / со / ко', () => {
  it('flags the three listed clusters', () => {
    expect(apply('Он не верит в мне.')).toBe('Он не верит во мне.');
    expect(apply('Пойдём с мной.')).toBe('Пойдём со мной.');
    expect(apply('Пойдём с мною.')).toBe('Пойдём со мною.');
    expect(apply('Иди к мне.')).toBe('Иди ко мне.');
    expect(apply('С мной не спорь.')).toBe('Со мной не спорь.');
    expect(apply('К мне пришли.')).toBe('Ко мне пришли.');
  });
  it('does not fire on the correct forms or on other words', () => {
    for (const s of ['Он верит во мне.', 'Пойдём со мной.', 'Иди ко мне.', 'Я иду к ним.', 'Он в моей комнате.', 'Он с мамой.', 'Я пришёл к мнению.']) expect(run(s).out, s).toEqual([]);
  });
});

describe('an empty result', () => {
  it('is returned for correct sentences, and carries only well-formed candidates otherwise', () => {
    for (const s of ['Она читает книгу.', 'Мы идём домой.', '']) expect(run(s).out, s).toEqual([]);
    const { tokens, out } = run('Я думаю о этом и люблю жызнь, чясы.');
    expect(out.length).toBe(3);
    for (const e of out) {
      expect(e.confidence).toBeGreaterThan(0);
      expect(e.confidence).toBeLessThanOrEqual(1);
      expect(e.affectsMeaning).toBe(false);
      expect(e.message.length).toBeGreaterThan(10);
      for (const i of e.tokenIndexes) expect(tokens[i]).toBeDefined();
      expect(e.suggestion!.start).toBeLessThan(e.suggestion!.end);
    }
  });
  it('copes with missing analyses', () => {
    const tokens = ruTokenize('Я люблю жызнь.');
    expect(checkRuProduction(tokens, [], 'Я люблю жызнь.')).toHaveLength(1);
  });
});
