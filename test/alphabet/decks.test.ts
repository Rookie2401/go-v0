// The alphabet trainer's decks (Thai, Hindi): the letters in teaching order, agreeing with the reader's own tables, and the
// four-choice question made from them.
import { describe, expect, it } from 'vitest';
import { decodeThai } from '../../src/adapters/thai/orthography';
import { CONSONANT_ISO, NUKTA_ISO, VOWEL_SIGNS } from '../../src/adapters/hindi/orth-tables';
import { CHOICE_COUNT, DEFAULT_PROMPT, choicesFor, deckFor, isAlphabetLang } from '../../src/alphabet/decks';
import type { AlphabetCard } from '../../src/alphabet/decks';
import { batches } from '../../src/alphabet/srs';

const th = deckFor('th')!;
const hi = deckFor('hi')!;
const ofKind = (cards: AlphabetCard[], kind: string) => cards.filter((c) => c.kind === kind);

/** A seeded generator, so a failing shuffle can be reproduced. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const THAI_ORDER = 'กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ';
const MID = 'กจฎฏดตบปอ';
const HIGH = 'ขฃฉฐถผฝศษสห';

describe('the decks', () => {
  it('exist for Thai and Hindi only', () => {
    expect(th).toBeDefined();
    expect(hi).toBeDefined();
    expect(th.lang).toBe('th');
    expect(hi.lang).toBe('hi');
    for (const lang of ['es', 'de', 'sq', 'en', '']) expect(deckFor(lang)).toBeUndefined();
    expect(isAlphabetLang('th')).toBe(true);
    expect(isAlphabetLang('es')).toBe(false);
  });

  for (const deck of [th, hi]) {
    describe(deck.title, () => {
      it('has unique, stable ids that start with the language and kind', () => {
        const idList = deck.cards.map((c) => c.id);
        expect(new Set(idList).size).toBe(idList.length);
        for (const c of deck.cards) expect(c.id.startsWith(`${deck.lang}:${c.kind}:`)).toBe(true);
      });

      it('gives every card a glyph, a non-empty answer and details', () => {
        for (const c of deck.cards) {
          expect(c.glyph.length, c.id).toBeGreaterThan(0);
          expect(c.answer.trim().length, c.id).toBeGreaterThan(0);
          expect(c.answer, c.id).not.toMatch(/undefined|NaN|\/\//);
          expect(c.details.length, c.id).toBeGreaterThan(0);
          for (const line of c.details) {
            expect(line.label, c.id).not.toBe('');
            expect(line.value + (line.script ?? ''), `${c.id} ${line.label}`).not.toMatch(/undefined|NaN/);
          }
        }
        expect(deck.note.length).toBeGreaterThan(20);
      });

      it('is cut into batches of 10, the last one shorter', () => {
        const b = batches(deck.cards);
        expect(b.slice(0, -1).every((x) => x.length === 10)).toBe(true);
        const last = b[b.length - 1].length;
        expect(last).toBeGreaterThan(0);
        expect(last).toBeLessThanOrEqual(10);
        expect(b.flat().map((c) => c.id)).toEqual(deck.cards.map((c) => c.id));
      });

      it('never offers the right answer text twice, or the same text twice, and always four choices', () => {
        const rand = lcg(7);
        for (const card of deck.cards) {
          for (let round = 0; round < 6; round++) {
            const choices = choicesFor(deck.cards, card, rand);
            expect(choices, card.id).toHaveLength(CHOICE_COUNT);
            const texts = choices.map((c) => c.text);
            expect(new Set(texts).size, `${card.id}: ${texts.join(' | ')}`).toBe(CHOICE_COUNT);
            expect(choices.filter((c) => c.correct), card.id).toHaveLength(1);
            expect(choices.find((c) => c.correct)!.text).toBe(card.answer);
            expect(choices.filter((c) => c.text === card.answer)).toHaveLength(1);
          }
        }
      });

      it('draws the distractors from the same kind where the kind is big enough', () => {
        const rand = lcg(11);
        for (const card of deck.cards) {
          const pool = new Set(ofKind(deck.cards, card.kind).filter((c) => c.id !== card.id).map((c) => c.answer));
          pool.delete(card.answer);
          if (pool.size < CHOICE_COUNT - 1) continue;
          const kindOf = new Map(deck.cards.map((c) => [c.answer, new Set<string>()]));
          for (const c of deck.cards) kindOf.get(c.answer)!.add(c.kind);
          for (const wrong of choicesFor(deck.cards, card, rand).filter((c) => !c.correct)) {
            expect(kindOf.get(wrong.text)!.has(card.kind), `${card.id} got ${wrong.text}`).toBe(true);
          }
        }
      });
    });
  }
});

describe('the Thai deck', () => {
  const consonants = ofKind(th.cards, 'consonant');

  it('starts with the 44 consonants in the traditional order', () => {
    expect(consonants).toHaveLength(44);
    expect(consonants.map((c) => c.glyph).join('')).toBe(THAI_ORDER);
    expect(th.cards.slice(0, 44).every((c) => c.kind === 'consonant')).toBe(true);
    // then the vowels, then the four tone marks
    expect(th.cards.slice(44).map((c) => c.kind).filter((k, i, a) => a.indexOf(k) === i)).toEqual(['vowel', 'tone-mark']);
    expect(ofKind(th.cards, 'tone-mark').map((c) => c.glyph)).toEqual(['◌่', '◌้', '◌๊', '◌๋']);
  });

  it('gives every consonant a class that agrees with the reader (orthography.ts)', () => {
    const counts = { mid: 0, high: 0, low: 0 };
    for (const c of consonants) {
      const line = c.details.find((d) => d.label === 'Class')!.value;
      const cls = line.replace(' class', '') as 'mid' | 'high' | 'low';
      counts[cls]++;
      // the reader's own reading of the letter before ◌า
      expect(decodeThai(`${c.glyph}า`)[0].initialClass, c.glyph).toBe(cls);
      // and the traditional lists, written out here independently
      expect(cls, c.glyph).toBe(MID.includes(c.glyph) ? 'mid' : HIGH.includes(c.glyph) ? 'high' : 'low');
    }
    expect(counts).toEqual({ mid: 9, high: 11, low: 24 });
  });

  it('gives the sound as an initial and as a final, and the names', () => {
    const by = (g: string) => consonants.find((c) => c.glyph === g)!;
    const line = (g: string, label: string) => by(g).details.find((d) => d.label === label)!.value;
    expect(by('ก').answer).toBe('k /k/');
    expect(by('ข').answer).toBe('kh /kʰ/');
    expect(by('ง').answer).toBe('ng /ŋ/');
    expect(by('จ').answer).toBe('ch /t͡ɕ/');
    expect(by('ฉ').answer).toBe('ch /t͡ɕʰ/');
    expect(line('ก', 'As a final')).toBe('k /k̚/');
    expect(line('ด', 'As a final')).toBe('t /t̚/');
    expect(line('บ', 'As a final')).toBe('p /p̚/');
    expect(line('ม', 'As a final')).toBe('m /m/');
    expect(line('ง', 'As a final')).toBe('ng /ŋ/');
    expect(line('ฉ', 'As a final')).toBe('not used as a final consonant');
    expect(by('ก').details.find((d) => d.label === 'Name')!.script).toBe('ไก่');
    expect(by('อ').answer).toMatch(/^– \/ʔ\//);
    for (const c of consonants) {
      expect(c.details.find((d) => d.label === 'Name')!.script, c.glyph).toBeTruthy();
      expect(c.details.find((d) => d.label === 'As an initial')!.value, c.glyph).not.toBe('');
    }
  });

  it('marks the two obsolete letters', () => {
    for (const g of ['ฃ', 'ฅ']) {
      const note = consonants.find((c) => c.glyph === g)!.details.find((d) => d.label === 'Note')!.value;
      expect(note).toMatch(/no longer used/);
    }
    expect(consonants.filter((c) => c.details.some((d) => /no longer used/.test(d.value)))).toHaveLength(2);
  });

  it('shares an answer between letters of one sound, and offers it only as the card’s own', () => {
    const kh = consonants.filter((c) => c.answer === 'kh /kʰ/').map((c) => c.glyph).join('');
    expect(kh).toBe('ขฃคฅฆ');
    const rand = lcg(3);
    for (const g of kh) {
      const card = consonants.find((c) => c.glyph === g)!;
      for (let i = 0; i < 20; i++) expect(choicesFor(th.cards, card, rand).filter((c) => c.text === 'kh /kʰ/')).toHaveLength(1);
    }
    // a different consonant never gets kh as a distractor twice, and gets it at most once
    const other = consonants.find((c) => c.glyph === 'ก')!;
    for (let i = 0; i < 30; i++) expect(choicesFor(th.cards, other, rand).filter((c) => c.text === 'kh /kʰ/').length).toBeLessThanOrEqual(1);
  });

  it('has the vowels as patterns on ◌, with the length and sound the reader gives them', () => {
    const vowels = ofKind(th.cards, 'vowel');
    const patterns = vowels.map((v) => v.glyph);
    for (const p of ['◌ะ', '◌า', '◌ิ', '◌ี', '◌ึ', '◌ื', '◌ุ', '◌ู', 'เ◌ะ', 'เ◌', 'แ◌ะ', 'แ◌', 'โ◌ะ', 'โ◌', 'เ◌าะ', '◌อ', 'เ◌อะ', 'เ◌อ', 'เ◌ียะ', 'เ◌ีย', 'เ◌ือะ', 'เ◌ือ', '◌ัวะ', '◌ัว', '◌ำ', 'ใ◌', 'ไ◌', 'เ◌า']) {
      expect(patterns, p).toContain(p);
    }
    const by = (p: string) => vowels.find((v) => v.glyph === p)!;
    expect(by('◌ะ').answer).toBe('a /a/ (short)');
    expect(by('◌า').answer).toBe('a /aː/ (long)');
    expect(by('เ◌ีย').answer).toBe('ia /ia/ (long)');
    expect(by('ไ◌').answer).toBe('ai /aj/ (short)');
    expect(by('◌ำ').answer).toBe('am /am/ (short)');
    expect(vowels.every((v) => v.carrier?.includes('◌'))).toBe(true);
    // the written example in the details is the pattern on ก, and the reader reads it back the same way
    for (const v of vowels) {
      const written = v.details.find((d) => d.label === 'Written')!.script!;
      expect(written, v.glyph).toBe(v.glyph.replace('◌', 'ก'));
    }
  });

  it('gives each tone mark its name and what it does in each class, from the reader’s rules', () => {
    const marks = ofKind(th.cards, 'tone-mark');
    expect(marks.map((m) => m.answer)).toEqual(['mai ek', 'mai tho', 'mai tri', 'mai chattawa']);
    expect(marks.every((m) => m.prompt === 'What is this mark called?')).toBe(true);
    const tone = (m: AlphabetCard, cls: string) => m.details.find((d) => d.label === `After a ${cls}-class consonant`)!.value;
    expect(marks.map((m) => [tone(m, 'mid'), tone(m, 'high'), tone(m, 'low')])).toEqual([
      ['low tone', 'low tone', 'falling tone'],
      ['falling tone', 'falling tone', 'high tone'],
      ['high tone', 'not used', 'not used'],
      ['rising tone', 'not used', 'not used'],
    ]);
  });
});

describe('the Hindi deck', () => {
  const consonants = ofKind(hi.cards, 'consonant');

  it('has the 33 core consonants in varṇamālā order, row by row', () => {
    expect(consonants).toHaveLength(33);
    expect(consonants.map((c) => c.glyph).join('')).toBe('कखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह');
    for (const c of consonants) expect(c.answer.startsWith(`${CONSONANT_ISO[c.glyph]} /`), c.glyph).toBe(true);
  });

  it('teaches the vowels first, then consonants, signs, marks, conjuncts and nukta letters', () => {
    expect(hi.cards.map((c) => c.kind).filter((k, i, a) => a.indexOf(k) === i)).toEqual(['vowel', 'consonant', 'vowel-sign', 'mark', 'conjunct', 'nukta']);
    expect(ofKind(hi.cards, 'vowel').map((c) => c.glyph).join(' ')).toBe('अ आ इ ई उ ऊ ऋ ए ऐ ओ औ अं अः');
  });

  it('gives the rows, voicing and aspiration', () => {
    const line = (g: string, label: string) => consonants.find((c) => c.glyph === g)!.details.find((d) => d.label === label)!.value;
    expect(line('क', 'Row')).toMatch(/^ka-varga — velar/);
    expect(line('च', 'Row')).toMatch(/palatal/);
    expect(line('ट', 'Row')).toMatch(/retroflex/);
    expect(line('त', 'Row')).toMatch(/dental/);
    expect(line('प', 'Row')).toMatch(/labial/);
    expect(line('ख', 'Voicing')).toBe('voiceless');
    expect(line('ख', 'Aspiration')).toMatch(/^aspirated/);
    expect(line('ग', 'Voicing')).toBe('voiced');
    expect(line('ग', 'Aspiration')).toBe('unaspirated');
    expect(line('न', 'Aspiration')).toBe('nasal');
    expect(line('क', 'Written alone')).toMatch(/inherent a/);
    expect(line('क', 'Anusvāra before it')).toMatch(/ṅ/);
    expect(line('श', 'Place')).toBe('palatal');
  });

  it('uses the reader’s ISO 15919 tables for vowels, signs, conjuncts and nukta letters', () => {
    const signs = ofKind(hi.cards, 'vowel-sign');
    expect(signs.map((c) => c.glyph)).toEqual(['का', 'कि', 'की', 'कु', 'कू', 'कृ', 'के', 'कै', 'को', 'कौ']);
    for (const s of signs) {
      const sign = s.id.split(':')[2];
      expect(s.answer.startsWith(`k${VOWEL_SIGNS[sign].iso} /k`), s.glyph).toBe(true);
    }
    expect(ofKind(hi.cards, 'conjunct').map((c) => c.glyph)).toEqual(['क्ष', 'त्र', 'ज्ञ', 'श्र']);
    expect(ofKind(hi.cards, 'conjunct').map((c) => c.answer.split(' ')[0])).toEqual(['kṣ', 'tr', 'jñ', 'śr']);
    // the nukta letters are base + U+093C (the form the tables key on), in the order of the design
    const nukta = ofKind(hi.cards, 'nukta');
    expect(nukta.map((c) => c.glyph)).toEqual(['क', 'ख', 'ग', 'ज', 'ड', 'ढ', 'फ'].map((b) => `${b}़`));
    for (const c of nukta) expect(c.answer.startsWith(`${NUKTA_ISO[c.glyph]} /`), c.glyph).toBe(true);
    expect(nukta.every((c) => c.details.some((d) => d.label === 'Sound'))).toBe(true);
    expect(ofKind(hi.cards, 'mark').map((c) => c.glyph)).toEqual(['कं', 'कँ', 'कः', 'क्']);
  });

  it('writes the conjuncts and nukta letters as the code points the tables use', () => {
    const cp = (s: string) => [...s].map((ch) => ch.codePointAt(0)!.toString(16)).join(' ');
    expect(cp(ofKind(hi.cards, 'conjunct')[0].glyph)).toBe('915 94d 937');
    expect(cp(ofKind(hi.cards, 'nukta')[0].glyph)).toBe('915 93c');
    expect(cp(ofKind(hi.cards, 'mark')[3].glyph)).toBe('915 94d');
  });

  it('asks what a sign does, not what sound it has, for the marks', () => {
    for (const m of ofKind(hi.cards, 'mark')) expect(m.prompt).toBe('What does it do?');
    expect(DEFAULT_PROMPT).toBe('What sound?');
  });
});
