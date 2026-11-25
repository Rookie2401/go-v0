// @vitest-environment node
/**
 * The Russian alphabet data: 33 letters, the sprint order, confusions, reading rules and the first words. The data was drafted by an AI
 * model; a one-off check read every example word, first word and reading-rule word against the Wiktionary extract (headword present,
 * stress as marked there). These tests keep the structure honest. A combining acute is always written as \u0301.
 */
import { describe, expect, it } from 'vitest';
import {
  RU_ALPHABET, RU_CONFUSIONS, RU_FIRST_WORDS, RU_READING_RULES, RU_SPRINT_ORDER, alphabetDeckRows,
} from '../../src/adapters/russian/alphabet';
import { ruKey } from '../../src/adapters/russian/text';
import { ruTransliterate } from '../../src/adapters/russian/translit';

const ORDER = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя';
const VOWELS = 'аеёиоуыэюя';
const lowers = RU_ALPHABET.map((l) => l.lower);

describe('RU_ALPHABET', () => {
  it('has the 33 letters in alphabet order, each once, with the right capital', () => {
    expect(RU_ALPHABET).toHaveLength(33);
    expect(lowers.join('')).toBe(ORDER);
    expect(new Set(lowers).size).toBe(33);
    for (const l of RU_ALPHABET) {
      expect(l.upper, l.lower).toBe(l.lower.toUpperCase());
      expect(l.lower.length, l.lower).toBe(1);
      expect(l.name.length, l.lower).toBeGreaterThan(0);
    }
  });

  it('groups the letters as the brief stages them', () => {
    const g = (n: number): string => RU_ALPHABET.filter((l) => l.group === n).map((l) => l.lower).sort().join('');
    expect(g(1)).toBe([...'акмот'].sort().join(''));
    expect(g(2)).toBe([...'веёнрсух'].sort().join(''));
    expect(g(4)).toBe([...'ъь'].sort().join(''));
    expect(g(3)).toBe([...'бгджзийлпфцчшщыэюя'].sort().join(''));
    for (const l of RU_ALPHABET) expect([1, 2, 3, 4]).toContain(l.group);
  });

  it('keeps the hints short: sound at most 70 characters, note at most 100', () => {
    for (const l of RU_ALPHABET) {
      expect(l.sound.length, `${l.lower} sound`).toBeGreaterThan(0);
      expect(l.sound.length, `${l.lower} sound`).toBeLessThanOrEqual(70);
      if (l.note !== undefined) { expect(l.note.length, `${l.lower} note`).toBeGreaterThan(0); expect(l.note.length, `${l.lower} note`).toBeLessThanOrEqual(100); }
    }
  });

  it('agrees with the transliteration scheme of translit.ts', () => {
    for (const l of RU_ALPHABET) {
      if (l.lower === 'е' || l.lower === 'ё') { expect(l.translit).toBe(l.lower === 'е' ? 'e' : 'ë'); continue; }
      expect(l.translit, l.lower).toBe(ruTransliterate(l.lower));
    }
  });

  it('every example word shows its letter, and its stress positions point at vowels of the word', () => {
    for (const l of RU_ALPHABET) {
      const key = ruKey(l.example.word);
      expect(key, `${l.lower}: ${l.example.word}`).toContain(l.lower);
      expect(l.example.gloss.length, l.lower).toBeGreaterThan(0);
      expect(l.example.stress.length, l.lower).toBeGreaterThanOrEqual(1);
      for (const p of l.example.stress) expect(VOWELS.includes(key[p] ?? ''), `${l.lower}: ${l.example.word} stress ${p}`).toBe(true);
      expect(key, `${l.lower}`).toMatch(/^[а-яё]+$/);
    }
  });

  it('a one-vowel example is stressed on that vowel, and one with ё on the ё', () => {
    for (const l of RU_ALPHABET) {
      const key = ruKey(l.example.word);
      const vs = [...key].map((c, i) => (VOWELS.includes(c) ? i : -1)).filter((i) => i >= 0);
      if (vs.length === 1) expect(l.example.stress, l.lower).toEqual(vs);
      if (key.includes('ё')) expect(l.example.stress, l.lower).toEqual([key.indexOf('ё')]);
    }
  });

  it('is plain data: JSON round-trips unchanged', () => {
    expect(JSON.parse(JSON.stringify(RU_ALPHABET))).toEqual(RU_ALPHABET);
  });
});

describe('RU_SPRINT_ORDER', () => {
  it('names every letter exactly once', () => {
    expect(RU_SPRINT_ORDER).toHaveLength(33);
    expect(new Set(RU_SPRINT_ORDER).size).toBe(33);
    expect([...RU_SPRINT_ORDER].sort().join('')).toBe([...ORDER].sort().join(''));
    for (const c of RU_SPRINT_ORDER) expect(lowers).toContain(c);
  });
  it('begins with the five letters that look and sound familiar, and ends with the signs', () => {
    expect([...RU_SPRINT_ORDER.slice(0, 5)].sort().join('')).toBe([...'акмот'].sort().join(''));
    expect(RU_SPRINT_ORDER.slice(-2).sort().join('')).toBe([...'ъь'].sort().join(''));
    expect(RU_SPRINT_ORDER.indexOf('ь')).toBeGreaterThan(RU_SPRINT_ORDER.indexOf('ё'));
  });
});

describe('RU_FIRST_WORDS', () => {
  const need = (form: string): number => Math.max(...[...form.toLowerCase()].filter((c) => /[а-яё]/.test(c)).map((c) => RU_SPRINT_ORDER.indexOf(c) + 1));

  it('has at least 60 distinct entries, each with a gloss', () => {
    expect(RU_FIRST_WORDS.length).toBeGreaterThanOrEqual(60);
    expect(new Set(RU_FIRST_WORDS.map((w) => w.form)).size).toBe(RU_FIRST_WORDS.length);
    for (const w of RU_FIRST_WORDS) { expect(w.gloss.length, w.form).toBeGreaterThan(0); expect(w.form.length, w.form).toBeGreaterThan(0); }
  });
  it('starts with words spelled only with the five letters а к м о т', () => {
    const first = RU_FIRST_WORDS.slice(0, 5);
    for (const w of first) expect(w.form, w.form).toMatch(/^[акмот]+$/);
    expect(RU_FIRST_WORDS.map((w) => w.form)).toEqual(expect.arrayContaining(['там', 'кто', 'кот', 'мама', 'атом', 'такт']));
  });
  it('includes the brief’s greetings and sentences', () => {
    const forms = RU_FIRST_WORDS.map((w) => w.form);
    for (const f of ['Привет', 'Спасибо', 'Здравствуйте', 'Как дела?', 'Меня зовут…', 'Я читаю', 'Это книга']) expect(forms, f).toContain(f);
  });
  it('is in learning order: each entry needs no more of RU_SPRINT_ORDER than the one after it, and its letters are all within that prefix', () => {
    let last = 0;
    for (const w of RU_FIRST_WORDS) {
      const n = need(w.form);
      expect(n, w.form).toBeGreaterThanOrEqual(last);
      expect(n, w.form).toBeLessThanOrEqual(33);
      const known = new Set(RU_SPRINT_ORDER.slice(0, n));
      for (const c of w.form.toLowerCase()) if (/[а-яё]/.test(c)) expect(known.has(c), `${w.form}: ${c}`).toBe(true);
      last = n;
    }
  });
  it('every sprint step unlocks at least one word, so the order is never a wait for nothing', () => {
    const needed = new Set(RU_FIRST_WORDS.map((w) => need(w.form)));
    for (let step = 5; step <= 33; step++) expect(needed.has(step), `step ${step} (${RU_SPRINT_ORDER[step - 1]})`).toBe(true);
  });
  it('every stress position points at a vowel letter of the lower-case key', () => {
    for (const w of RU_FIRST_WORDS) {
      const key = ruKey(w.form);
      expect(w.stress.length, w.form).toBeGreaterThanOrEqual(1);
      for (const p of w.stress) expect(VOWELS.includes(key[p] ?? ''), `${w.form}: ${p}`).toBe(true);
      if (key.includes('ё') && !/\s/.test(key)) expect(w.stress, w.form).toContain(key.indexOf('ё'));
    }
  });
  it('a one-word entry with one vowel is stressed on it', () => {
    for (const w of RU_FIRST_WORDS) {
      const key = ruKey(w.form);
      if (/\s/.test(key)) continue;
      const vs = [...key].map((c, i) => (VOWELS.includes(c) ? i : -1)).filter((i) => i >= 0);
      if (vs.length === 1) expect(w.stress, w.form).toEqual(vs);
    }
  });
});

describe('RU_CONFUSIONS', () => {
  it('names two different real letters in each pair, once each, with a sentence that tells them apart', () => {
    const seen = new Set<string>();
    expect(RU_CONFUSIONS.length).toBeGreaterThanOrEqual(10);
    for (const c of RU_CONFUSIONS) {
      expect(lowers, c.a).toContain(c.a);
      expect(lowers, c.b).toContain(c.b);
      expect(c.a).not.toBe(c.b);
      const k = [c.a, c.b].sort().join('/');
      expect(seen.has(k), k).toBe(false);
      seen.add(k);
      expect(c.tell.length, k).toBeGreaterThan(20);
      expect(c.tell.trim().endsWith('.'), k).toBe(true);
      expect(c.tell, k).toContain(c.a);
      expect(c.tell, k).toContain(c.b);
    }
  });
  it('covers the pairs the brief names', () => {
    const pairs = new Set(RU_CONFUSIONS.map((c) => [c.a, c.b].sort().join('/')));
    for (const p of ['в/б', 'н/п', 'г/р', 'й/и', 'ш/щ', 'ъ/ь', 'е/э', 'и/ы', 'з/с', 'ю/у']) expect(pairs.has([...p.split('/')].sort().join('/')), p).toBe(true);
  });
});

describe('RU_READING_RULES', () => {
  it('has the rules the brief asks for, each with a title, an explanation and examples', () => {
    const keys = RU_READING_RULES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of ['soft-sign', 'hard-sign', 'short-i', 'vowel-pairs', 'palatalisation', 'unstressed-vowels', 'final-devoicing', 'zhi-shi']) expect(keys, k).toContain(k);
    for (const r of RU_READING_RULES) {
      expect(r.title.length, r.key).toBeGreaterThan(0);
      expect(r.explain.length, r.key).toBeGreaterThan(40);
      expect(r.examples.length, r.key).toBeGreaterThan(0);
      for (const e of r.examples) expect(e, `${r.key}: ${e}`).toMatch(/^[\p{Script=Cyrillic}\u0301 —-]+$/u);
    }
  });
  it('every Cyrillic example is a word that the rule is about (spot checks)', () => {
    const ex = (k: string): string[] => RU_READING_RULES.find((r) => r.key === k)!.examples;
    expect(ex('soft-sign')).toContain('день');
    expect(ex('hard-sign')).toEqual(['подъезд', 'объект']);
    expect(ex('final-devoicing')).toEqual(['год', 'хлеб', 'нож', 'глаз']);
    for (const w of ex('final-devoicing')) expect('бвгджз').toContain(w[w.length - 1]);
    for (const w of ex('hard-sign')) expect(w).toContain('ъ');
    for (const w of ex('soft-sign')) expect(w).toContain('ь');
    for (const w of ex('short-i')) expect(w).toContain('й');
  });
});

describe('alphabetDeckRows', () => {
  const rows = alphabetDeckRows();
  it('gives one row per letter, in alphabet order, as [glyph, back]', () => {
    expect(rows).toHaveLength(33);
    expect(rows.map((r) => r[0])).toEqual(RU_ALPHABET.map((l) => `${l.upper} ${l.lower}`));
    expect(rows[0][0]).toBe('А а');
  });
  it('keeps every back non-empty and at most 140 characters, and begins it with the letter’s name and sound', () => {
    for (const [i, [glyph, back]] of rows.entries()) {
      expect(back.length, glyph).toBeGreaterThan(0);
      expect(back.length, glyph).toBeLessThanOrEqual(140);
      expect(back.startsWith(`${RU_ALPHABET[i].name}: ${RU_ALPHABET[i].sound}`), glyph).toBe(true);
    }
  });
  it('is deterministic', () => { expect(alphabetDeckRows()).toEqual(rows); });
});
