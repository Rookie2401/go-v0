/**
 * Constructions (detectPatterns) and fixed phrases (detectPhrases) of the Norwegian analyzer. The expectations are MACHINE-DRAFTED,
 * pending native review (written by the model that built the analyzer; not checked by a native speaker).
 */
import { describe, expect, it } from 'vitest';
import { NORWEGIAN_CONSTRUCTION_INFO } from '../../src/adapters/norwegian/constructions';
import { patterns, phrases } from './helpers';

const keys = (lang: 'nb' | 'nn', text: string): string[] => patterns(lang, text).map((p) => p.key);

describe('constructions (Bokmål)', () => {
  const cases: Array<[string, string, string[], string[]]> = [
    // key, sentence, must contain, must not contain
    ['v2-main-clause', 'Jeg bor i Oslo.', ['v2-main-clause'], ['inversion-after-adverbial', 'yes-no-question']],
    ['v2 with a noun phrase', 'Den gamle mannen bor her.', ['v2-main-clause'], ['yes-no-question']],
    ['inversion after a fronted adverbial', 'I morgen kommer jeg.', ['inversion-after-adverbial', 'v2-main-clause'], []],
    ['inversion after a time adverb', 'Klokka sju står jeg opp.', ['inversion-after-adverbial'], []],
    ['subordinate with ikke before the verb', 'Jeg vet at han ikke kommer.', ['subordinate-ikke-before-verb'], []],
    ['yes/no question', 'Kommer du i morgen?', ['yes-no-question'], ['wh-question', 'v2-main-clause']],
    ['wh-question', 'Hvorfor kommer du ikke?', ['wh-question'], ['yes-no-question']],
    ['wh-question hva', 'Hva heter du?', ['wh-question'], []],
    ['double definiteness', 'Den store bilen står her.', ['double-definiteness'], []],
    ['double definiteness (neuter)', 'Det nye huset er pent.', ['double-definiteness'], []],
    ['postposed possessive', 'Bilen min er rød.', ['postposed-possessive'], []],
    ['sin-reflexive', 'Hun tok bilen sin.', ['sin-reflexive'], []],
    ['perfect with har', 'Jeg har spist frokost.', ['perfect-har'], []],
    ['perfect with an adverb between', 'Hun har ikke sovet.', ['perfect-har'], []],
    ['modal + bare infinitive', 'Jeg kan svømme.', ['modal-bare-infinitive'], ['infinitive-marker-aa']],
    ['å-infinitive', 'Jeg liker å lese.', ['infinitive-marker-aa'], ['modal-bare-infinitive']],
    ['s-passive', 'Boka leses av mange.', ['s-passive'], []],
    ['bli-passive', 'Huset ble bygd i 1950.', ['bli-passive'], []],
    ['da', 'Da jeg var liten, bodde vi i Bergen.', ['da-vs-naar'], []],
    ['når', 'Når jeg er trøtt, sover jeg.', ['da-vs-naar'], []],
    ['comparison', 'Bergen er større enn Stavanger.', ['comparison'], []],
    ['comparison with mer', 'Dette er mer interessant.', ['comparison'], []],
  ];
  for (const [name, text, yes, no] of cases) {
    it(name, () => {
      const k = keys('nb', text);
      for (const key of yes) expect(k, `${text} should have ${key}`).toContain(key);
      for (const key of no) expect(k, `${text} should not have ${key}`).not.toContain(key);
    });
  }

  it('each pattern carries a title, an explanation, token indexes inside the sentence and a confidence', () => {
    const text = 'I morgen kommer jeg ikke, fordi jeg har spist den store kaken.';
    const ps = patterns('nb', text);
    expect(ps.length).toBeGreaterThan(2);
    for (const p of ps) {
      expect(p.title.length).toBeGreaterThan(5);
      expect(p.explanation.length).toBeGreaterThan(30);
      expect(p.tokenIndexes.length).toBeGreaterThan(0);
      expect(p.confidence).toBeGreaterThan(0.5);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
    expect(ps.map((p) => p.key)).toEqual(expect.arrayContaining(['inversion-after-adverbial', 'perfect-har', 'double-definiteness']));
  });

  it('the info table covers every key the detector can return', () => {
    const wanted = ['v2-main-clause', 'inversion-after-adverbial', 'subordinate-ikke-before-verb', 'yes-no-question', 'wh-question', 'double-definiteness', 'postposed-possessive', 'sin-reflexive', 'perfect-har', 'modal-bare-infinitive', 'infinitive-marker-aa', 's-passive', 'bli-passive', 'da-vs-naar', 'comparison'];
    for (const k of wanted) expect(NORWEGIAN_CONSTRUCTION_INFO[k], k).toBeDefined();
  });

  it('no false pattern on a one-word or empty sentence', () => {
    expect(keys('nb', 'Takk!')).toEqual([]);
    expect(keys('nb', '')).toEqual([]);
  });
});

describe('constructions (Nynorsk)', () => {
  it('the same keys, with Nynorsk words', () => {
    expect(keys('nn', 'Eg veit at ho ikkje kjem.')).toContain('subordinate-ikke-before-verb');
    expect(keys('nn', 'Kvifor kjem du ikkje?')).toContain('wh-question');
    expect(keys('nn', 'Kjem du i morgon?')).toContain('yes-no-question');
    expect(keys('nn', 'Eg har kjøpt brød.')).toContain('perfect-har');
    expect(keys('nn', 'Eg likar å synge.')).toContain('infinitive-marker-aa');
  });
});

describe('fixed phrases', () => {
  const list = (lang: 'nb' | 'nn', text: string): string[] => phrases(lang, text).map((p) => p.display);

  it('finds the fixed expressions of the recon (B5, B9) with a gloss', () => {
    const cases: Array<[string, string]> = [
      ['Jeg kommer i dag.', 'i dag'], ['Vi reiser i morgen.', 'i morgen'], ['Han kom for å hjelpe.', 'for å'], ['Det stoppet på grunn av regnet.', 'på grunn av'],
      ['Han spiser blant annet fisk.', 'blant annet'], ['Ta for eksempel denne.', 'for eksempel'], ['Hva slags bok er det?', 'hva slags'], ['Vi går selv om det regner.', 'selv om'],
    ];
    for (const [text, display] of cases) {
      const p = phrases('nb', text).find((x) => x.display === display);
      expect(p, display).toBeDefined();
      expect(p!.gloss).toBeTruthy();
      expect(p!.tokenIndexes.length).toBe(display.split(' ').length);
    }
  });

  it('does not match across a clause boundary or on a different word', () => {
    expect(list('nb', 'Han kom for, å hjelpe.')).not.toContain('for å');
    expect(list('nb', 'Jeg dag i.')).toEqual([]);
  });

  it('the three target phrases of the seed texts are frames found through the lemmas', () => {
    expect(list('nb', 'Da jeg var ung, forsto jeg ikke hjertet mitt.')).toContain('da … var ung');
    expect(list('nb', 'En dag begynte jeg å forstå synden min.')).toContain('begynne å forstå');
    expect(list('nb', 'Jeg trodde ikke på Gud.')).toContain('tro på …');
    expect(phrases('nb', 'Jeg tror på Gud.').find((p) => p.display === 'tro på …')?.kind).toBe('frame');
    expect(list('nn', 'Eg trur på Gud.')).toContain('tru på …');
  });
});
