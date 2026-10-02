/**
 * Checks on the learner's own Albanian, on the real engine: tokens from the Albanian tokenizer, analyses from `sqAnalyze`
 * (the sentence layer included), then `checkSqProduction`. Every check fires on its error, stays silent on correct
 * sentences, and its suggestion applied to the sentence gives a sentence that yields no error at all. Only words the
 * word list knows are used: a word it does not know is a test of silence, not of a check.
 */
import { describe, expect, it } from 'vitest';
import { sqAnalyze } from '../../src/adapters/albanian/analyze';
import { sqNormalize } from '../../src/adapters/albanian/orthography';
import { checkSqProduction } from '../../src/adapters/albanian/production';
import { makeWordTokenizer } from '../../src/adapters/shared';
import type { ErrorCandidate, ErrorCategory } from '../../src/core';

const tokenize = makeWordTokenizer({ locale: 'sq', normalize: sqNormalize });

function check(text: string): ErrorCandidate[] {
  const tokens = tokenize(text);
  return checkSqProduction(tokens, sqAnalyze(tokens), text);
}

const apply = (text: string, s: NonNullable<ErrorCandidate['suggestion']>): string => text.slice(0, s.start) + s.replacement + text.slice(s.end);

/**
 * The sentence is wrong in exactly one way: one error of the category, whose suggestion turns it into `right`, and `right`
 * yields nothing at all.
 */
function repairs(wrong: string, category: ErrorCategory, right: string): void {
  const errors = check(wrong);
  expect(errors.map((e) => e.category), wrong).toEqual([category]);
  const s = errors[0].suggestion;
  expect(s, `suggestion for ${wrong}`).toBeDefined();
  expect(apply(wrong, s!), wrong).toBe(right);
  expect(check(right), right).toEqual([]);
}

/** The sentence is flagged once, in the category, with no suggestion. */
function flagsOnly(wrong: string, category: ErrorCategory): ErrorCandidate {
  const errors = check(wrong);
  expect(errors.map((e) => e.category), wrong).toEqual([category]);
  expect(errors[0].suggestion, `no suggestion for ${wrong}`).toBeUndefined();
  return errors[0];
}

/** Every word of the sentence has a reading from the word list (not just a guess by ending): a correct sentence of known words. */
function allKnown(sentence: string): boolean {
  return sqAnalyze(tokenize(sentence)).every((a) => !a.token.isWord || a.candidates.some((c) => !c.unconfirmed));
}

/** Correct sentences made of words the engine knows: no error. */
function silent(...sentences: string[]): void {
  for (const s of sentences) {
    expect(allKnown(s), `${s} must use only known words`).toBe(true);
    expect(check(s), s).toEqual([]);
  }
}

/** Sentences with a word the engine does not know, or nothing to judge: no error either, because a missing fact is not a mistake. */
function quiet(...sentences: string[]): void {
  for (const s of sentences) expect(check(s), s).toEqual([]);
}

describe('checkSqProduction', () => {
  describe('1. spelling: a word typed without ë / ç', () => {
    it('reads mekat as mëkat and cfare as çfarë, with the learner\'s capital letter', () => {
      repairs('Kam mekat në zemrën time.', 'spelling', 'Kam mëkat në zemrën time.');
      repairs('Ajo ka një shtepi.', 'spelling', 'Ajo ka një shtëpi.');
      repairs('Cfare dua?', 'spelling', 'Çfarë dua?');
      repairs('Mekat.', 'spelling', 'Mëkat.');
      repairs('Dua caj.', 'spelling', 'Dua çaj.');
    });
    it('lists the candidates and offers no suggestion when the spelling does not say which word it is', () => {
      const e = flagsOnly('Ajo ka femije.', 'spelling');
      expect(e.message).toContain('fëmijë');
      expect(e.message).toContain('fëmije');
      expect(e.confidence).toBeLessThan(0.5);
      flagsOnly('Kam nene.', 'spelling');
    });
    it('says nothing about correct spelling, an ordinary word that happens to lack ë, or a word it does not know', () => {
      silent('Kam mëkat në zemrën time.', 'Çfarë dua?', 'Ajo ka një shtëpi.');
      silent('Ne shkojmë në qytet.'); // "ne" is a word as it stands, whatever the writer meant
      quiet('Xyzqwv shkon.', 'Kam një kompjuterr.'); // nothing the lists know: nothing to correct
    });
  });

  describe('2. dialect: a Gheg form with a Standard equivalent', () => {
    it('names the Standard form and does not call the Gheg form an error', () => {
      repairs('Nji vajzë është këtu.', 'dialect', 'Një vajzë është këtu.');
      repairs('Ajo asht në shtëpinë.', 'dialect', 'Ajo është në shtëpinë.');
      repairs('Tash kam paqe.', 'dialect', 'Tani kam paqe.');
      repairs('Un jam këtu.', 'dialect', 'Unë jam këtu.');
      const e = check('Ajo asht në shtëpinë.')[0];
      expect(e.message).toContain('Gheg');
      expect(e.message).toContain('"është"');
      expect(e.message).not.toMatch(/error|mistake/i);
      expect(e.affectsMeaning).toBe(false);
    });
    it('gives a regular correspondence less confidence than a listed pair, and no suggestion when two forms fit', () => {
      const listed = check('Ajo asht këtu.')[0];
      const pattern = flagsOnly('Ajo punue.', 'dialect');
      expect(pattern.message).toContain('looks like a Gheg form');
      expect(pattern.confidence).toBeLessThan(listed.confidence);
    });
    it('says nothing about the Standard forms', () => {
      silent('Një vajzë është këtu.', 'Ajo është në shtëpinë.', 'Tani kam paqe.', 'Unë jam këtu.', 'Dua të punoj.');
    });
  });

  describe('3. definiteness', () => {
    it('after te / tek the noun is definite (the cases of the old adapter)', () => {
      const e = check('besoj te libër');
      expect(e).toHaveLength(1);
      expect(e[0].category).toBe('definiteness');
      expect(apply('besoj te libër', e[0].suggestion!)).toBe('besoj te libri');
      silent('besoj te libri', 'besoj te Perëndia');
      repairs('Shkoj te mjek.', 'definiteness', 'Shkoj te mjeku.');
      repairs('Flas tek mik.', 'definiteness', 'Flas tek miku.');
      repairs('Besoj te libra.', 'definiteness', 'Besoj te librat.');
    });
    it('after te / tek the noun is in the nominative', () => {
      repairs('Besoj te librin.', 'case', 'Besoj te libri.');
      repairs('Flas tek mikun.', 'case', 'Flas tek miku.');
      repairs('Besoj te Perëndinë.', 'case', 'Besoj te Perëndia.');
    });
    it('is silent after te / tek where the noun is definite or is not the next word', () => {
      silent('Shkoj te mjeku.', 'Besoj tek librat.', 'Shkoj te një mik.', 'Shkoj te unë.', 'Shkoj te shtëpia.');
    });
    it('after nga the noun is normally definite, with less confidence', () => {
      repairs('Ai vjen nga shkollë.', 'definiteness', 'Ai vjen nga shkolla.');
      repairs('Ai vjen nga banjë.', 'definiteness', 'Ai vjen nga banja.');
      const e = check('Ai vjen nga shkollë.')[0];
      expect(e.confidence).toBeLessThan(check('Shkoj te mjek.')[0].confidence);
      silent('Ai vjen nga shkolla.', 'Ai vjen nga Tirana.', 'Ai vjen nga shtëpitë.');
      silent('Ai vjen nga shtëpi.'); // shtëpi: singular or plural; the plural indefinite is fine after nga
    });
    it('a noun with a possessive after it is definite (the case of the old adapter)', () => {
      const e = check('kam mëkat në zemër time');
      expect(e.some((x) => x.category === 'definiteness')).toBe(true);
      expect(apply('kam mëkat në zemër time', e.find((x) => x.suggestion)!.suggestion!)).toBe('kam mëkat në zemrën time');
      silent('kam mëkat në zemrën time');
      repairs('Libër im është këtu.', 'definiteness', 'Libri im është këtu.');
      repairs('Motër ime vjen.', 'definiteness', 'Motra ime vjen.');
      repairs('Kam shok tim.', 'definiteness', 'Kam shokun tim.');
      repairs('Me shok tim flas.', 'definiteness', 'Me shokun tim flas.');
    });
    it('offers no suggestion when the possessive\'s case does not fit the position (kam shok yt: yt is nominative, an object is not)', () => {
      flagsOnly('Kam shok yt.', 'definiteness');
      flagsOnly('Vjen motër ime.', 'definiteness'); // after a verb the noun would be an object (accusative), ime is nominative
    });
    it('says nothing where an indefinite noun with a possessive is fine or not judged', () => {
      silent('Libri im është këtu.', 'Motra ime vjen.', 'Një mik i tij vjen.', 'Ai është mik im.');
      silent('Kam një shok tim.', 'Zemrën time e dua.');
    });
  });

  describe('4. case after a preposition', () => {
    it('në, me, për … take the accusative', () => {
      repairs('Jam në shtëpia.', 'case', 'Jam në shtëpinë.');
      repairs('Jam në rruga.', 'case', 'Jam në rrugën.');
      repairs('Flas për fjala.', 'case', 'Flas për fjalën.');
      repairs('Vij me gruaja.', 'case', 'Vij me gruan.');
    });
    it('prej, sipas, afër, larg, para, pas … take the ablative', () => {
      repairs('Qëndroj afër shtëpia.', 'case', 'Qëndroj afër shtëpisë.');
      repairs('Vij prej rruga.', 'case', 'Vij prej rrugës.');
      repairs('Qëndroj larg dera.', 'case', 'Qëndroj larg derës.');
    });
    it('names the case and offers no suggestion when the noun\'s own readings leave the form open', () => {
      const e = flagsOnly('Vij me libri.', 'case');
      expect(e.message).toContain('accusative');
      flagsOnly('Qëndroj afër një shtëpi.', 'case');
    });
    it('says nothing where the noun is already in the governed case', () => {
      silent('Jam në shtëpinë.', 'Jam në një shtëpi.', 'Qëndroj afër shtëpisë.', 'Qëndroj afër një shtëpie.', 'Vij prej rrugës.');
      silent('Flas me mësuesin.', 'Flas me shokun tim.', 'Jam në qytet.', 'Pas shkollës shkoj në shtëpi.');
    });
    it('says nothing for a preposition with no governed case, a word that is not a preposition here, or an unknown noun', () => {
      silent('Shkoj te shtëpia.', 'Ai vjen nga shtëpia.'); // te / nga: the nominative, which is check 3's
      quiet('Jam në xyzqwv.'); silent('Jam afër.', 'Jam larg.');
    });
  });

  describe('5. the linking article agrees with the noun', () => {
    it('masculine, feminine, plural, oblique', () => {
      repairs('Vajza i mirë vjen.', 'agreement', 'Vajza e mirë vjen.');
      repairs('Djali e mirë vjen.', 'agreement', 'Djali i mirë vjen.');
      repairs('Kam djem i mirë.', 'agreement', 'Kam djem të mirë.');
      repairs('Shtëpia të mirë është këtu.', 'agreement', 'Shtëpia e mirë është këtu.');
      repairs('Qëndroj afër vajzës i mirë.', 'agreement', 'Qëndroj afër vajzës së mirë.');
      repairs('Libri djalit i mirë.', 'agreement', 'Libri djalit të mirë.');
    });
    it('keeps the learner\'s capital letter', () => {
      repairs('Vajza I mirë vjen.', 'agreement', 'Vajza E mirë vjen.');
    });
    it('names the articles the noun allows and offers no suggestion when it allows two', () => {
      const e = flagsOnly('Kam një libër e mirë.', 'agreement');
      expect(e.message).toContain('"i" or "të"');
    });
    it('says nothing for correct articles, with a determiner, a possessive or an ordinal between', () => {
      silent('Vajza e mirë vjen.', 'Djali i mirë vjen.', 'Djemtë e mirë vijnë.', 'Kam djem të mirë.', 'Kam një djalë të mirë.', 'Kam një djalë i mirë.');
      silent('Libri i djalit të mirë është këtu.', 'Vajzat e mira vijnë.', 'Libri i tij është i ri.', 'Një ditë e mirë.');
      silent('Burri i vjetër ulet.', 'Gruaja e bukur flet.', 'Shtëpitë e bukura janë të vjetra.');
    });
  });

  describe('6. the adjective form agrees with the noun', () => {
    it('after a linking article', () => {
      repairs('Vajzat e mirë vijnë.', 'agreement', 'Vajzat e mira vijnë.');
      repairs('Kam djem të mira.', 'agreement', 'Kam djem të mirë.');
      repairs('Shtëpitë e mirë janë këtu.', 'agreement', 'Shtëpitë e mira janë këtu.');
      repairs('Kam vajza të bukur.', 'agreement', 'Kam vajza të bukura.');
    });
    it('without an article', () => {
      repairs('Kam shokë besnik.', 'agreement', 'Kam shokë besnikë.');
      repairs('Ka vajza besnik.', 'agreement', 'Ka vajza besnike.');
      repairs('Vajzat besnik vijnë.', 'agreement', 'Vajzat besnike vijnë.');
    });
    it('says nothing where the form is right for one of the noun\'s readings', () => {
      silent('Vajza e mirë vjen.', 'Vajza e bukur flet.', 'Kam djem të mirë.', 'Kam vajza të mira.', 'Ka vajza besnike.');
      silent('Djemtë e mirë shkojnë.', 'Një shok besnik vjen.', 'Kam shokë besnikë.');
    });
    it('says nothing for an adjective the word list does not hold', () => {
      quiet('Vajzat e xyzqwv vijnë.', 'Vajzat besnikxyz vijnë.');
    });
  });

  describe('7. the verb ending goes with the subject pronoun', () => {
    it('first, second and third person, singular and plural', () => {
      repairs('Unë shkon në shkollë.', 'conjugation', 'Unë shkoj në shkollë.');
      repairs('Ne shkoj në shkollë.', 'conjugation', 'Ne shkojmë në shkollë.');
      repairs('Ata shkon në shkollë.', 'conjugation', 'Ata shkojnë në shkollë.');
      repairs('Ti shkoj në shkollë.', 'conjugation', 'Ti shkon në shkollë.');
      repairs('Unë është mirë.', 'conjugation', 'Unë jam mirë.');
      repairs('Ajo shkojmë.', 'conjugation', 'Ajo shkon.');
      repairs('Unë nuk shkon.', 'conjugation', 'Unë nuk shkoj.');
    });
    it('says nothing for agreement, a coordinated subject, ju, or a pronoun not next to its verb', () => {
      silent('Unë shkoj.', 'Ne shkojmë.', 'Ata shkojnë.', 'Ti shkon.', 'Ai shkon.', 'Unë nuk shkoj.', 'Unë jam mirë.');
      silent('Unë dhe ti shkojmë.', 'Ti dhe ai shkoni.', 'Unë dhe ai shkon.', 'Ju shkoni.', 'Ju shkon.');
      silent('Unë kam një libër.', 'Ai e di.');
    });
    it('has no suggestion where the verb has no form for the person', () => {
      flagsOnly('Unë shko.', 'conjugation');
    });
  });

  describe('8. negation: nuk where mos is needed', () => {
    it('after the subjunctive particle', () => {
      repairs('Dua të nuk shkoj.', 'particle', 'Dua të mos shkoj.');
      repairs('Të nuk shkoj.', 'particle', 'Të mos shkoj.');
      repairs('Dua të nuk kam frikë.', 'particle', 'Dua të mos kam frikë.');
    });
    it('before an imperative', () => {
      repairs('Nuk shko!', 'particle', 'Mos shko!');
      repairs('Nuk ki frikë!', 'particle', 'Mos ki frikë!');
      repairs('Nuk puno!', 'particle', 'Mos puno!');
    });
    it('without the exclamation mark the imperative case is noted, not corrected', () => {
      const e = flagsOnly('Nuk shko.', 'particle');
      expect(e.message).toContain('mos shko');
    });
    it('says nothing for correct negation or a verb that is also an indicative', () => {
      silent('Dua të mos shkoj.', 'Mos shko!', 'Mos ki frikë!', 'Nuk shkoj.', 'Unë nuk shkoj.', 'Nuk ka frikë.');
      silent('Nuk shkruaj!', 'Nuk punon.');
    });
  });

  describe('9. do without të (register)', () => {
    it('is a low-confidence note on register, with the insertion as the suggestion', () => {
      for (const [wrong, right] of [['Do shkoj nesër.', 'Do të shkoj nesër.'], ['Do punoj.', 'Do të punoj.'], ['Do lexoj një libër.', 'Do të lexoj një libër.']]) {
        repairs(wrong, 'register', right);
        const e = check(wrong)[0];
        expect(e.confidence).toBeLessThanOrEqual(0.5);
        expect(e.message).toContain('speech');
      }
    });
    it('names the missing subjunctive when the verb form is not one', () => {
      const e = flagsOnly('Do shkon nesër.', 'register');
      expect(e.confidence).toBeLessThan(0.5);
    });
    it('says nothing for do të, do as the verb "to want", or do before something that is not a verb', () => {
      silent('Do të shkoj nesër.', 'Do të punoj.', 'Ai do ujë.', 'Do bukë.', 'Çfarë do ai?');
    });
  });

  describe('10. kam or jam before a participle', () => {
    it('a verb that exists only in the non-active makes its perfect with jam', () => {
      repairs('Kam përpjekur shumë.', 'conjugation', 'Jam përpjekur shumë.');
      repairs('Ai ka penduar.', 'conjugation', 'Ai është penduar.');
      repairs('Kishte kujdesur.', 'conjugation', 'Ishte kujdesur.');
      repairs('Ata kanë përgjigjur.', 'conjugation', 'Ata janë përgjigjur.');
      repairs('Kam penduar.', 'conjugation', 'Jam penduar.');
    });
    it('says nothing for jam, for kam with an ordinary participle, or for verbs that also have an active twin', () => {
      silent('Jam përpjekur.', 'Është penduar.', 'Kam pasur frikë.', 'Kam larë.', 'Ai ka shkuar.');
      silent('Kam mundur.', 'Ka mbetur.', 'Kam ulur.', 'Ka lindur.'); // kam mundur, ka mbetur: fine; ulem / ul and lindem / lind share a participle
    });
  });

  describe('all checks', () => {
    const wrong = [
      'Kam mekat.', 'Nji vajzë asht këtu.', 'Shkoj te mjek.', 'Jam në shtëpia.', 'Vajza i mirë vjen.', 'Vajzat e mirë vijnë.', 'Unë shkon.',
      'Dua të nuk shkoj.', 'Nuk shko!', 'Do shkoj.', 'Kam penduar.', 'Kam shok yt.', 'Kam një libër e mirë.', 'Ajo ka femije.',
    ];
    it('never exceed 0.85, say plainly what is wrong and keep affectsMeaning honest', () => {
      for (const s of wrong) {
        const errors = check(s);
        expect(errors.length, s).toBeGreaterThan(0);
        for (const e of errors) {
          expect(e.confidence, s).toBeLessThanOrEqual(0.85);
          expect(e.confidence, s).toBeGreaterThan(0);
          expect(e.message.length, s).toBeGreaterThan(10);
          expect(typeof e.affectsMeaning).toBe('boolean');
          expect(e.tokenIndexes.length).toBeGreaterThan(0);
          expect(e.category).not.toBe('idiomaticity'); // needs native data that does not exist yet
          if (e.suggestion) expect(e.suggestion.start).toBeLessThanOrEqual(e.suggestion.end);
        }
      }
    });
    it('give back errors in the order of the words', () => {
      const errors = check('Nji vajzë asht këtu.');
      expect(errors.map((e) => e.tokenIndexes[0])).toEqual([...errors.map((e) => e.tokenIndexes[0])].sort((a, b) => a - b));
      expect(errors).toHaveLength(2);
    });
    it('is silent on an empty sentence, on punctuation and on words nobody knows', () => {
      quiet('', '...', '!', 'Xyzqwv abcdef ghijkl.');
    });
    it('gives lower confidence to an ambiguous noun than to a certain one', () => {
      // vajza is "the girl" or "girls"; shtëpia is only "the house"
      const ambiguous = check('Vajza i mirë vjen.')[0];
      const certain = check('Shtëpia të mirë është këtu.')[0];
      expect(ambiguous.confidence).toBeLessThan(certain.confidence);
    });
  });
});
