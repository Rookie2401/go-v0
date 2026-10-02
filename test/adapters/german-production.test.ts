/**
 * Checks on the learner's own German, on hand-built analyses and a small fake lexicon view (the real lexicon and the
 * sentence layer are other packages): every check fires on its error, stays silent on the correct sentence, and its
 * suggestion applied to the sentence gives the correct sentence.
 */
import { describe, expect, it } from 'vitest';
import type { AnalysisCandidate, AnalyzedToken, ErrorCandidate, PartOfSpeech, RawToken } from '../../src/core';
import { checkGermanProduction } from '../../src/adapters/german/production';
import type { DeAdjective, DeLexiconView, DeNoun, DePreposition, DeVerb } from '../../src/adapters/german/types';

// ───────────────────────────── a small lexicon view ─────────────────────────────

const noun = (lemma: string, gender: DeNoun['gender']): DeNoun => ({ lemma, gender, gloss: lemma });
const vb = (lemma: string, aux: DeVerb['aux'], extra: Partial<DeVerb> = {}): DeVerb => ({ lemma, cls: 'strong', aux, gloss: lemma, ...extra });
const NOUNS: Record<string, DeNoun[]> = {
  mann: [noun('Mann', 'm')], frau: [noun('Frau', 'f')], haus: [noun('Haus', 'n')], auto: [noun('Auto', 'n')], kind: [noun('Kind', 'n')], zeitung: [noun('Zeitung', 'f')],
  herz: [noun('Herz', 'n')], sünde: [noun('Sünde', 'f')], see: [noun('See', 'm'), noun('See', 'f')], männer: [noun('Mann', 'pl')], kleid: [noun('Kleid', 'n')],
};
const VERBS: Record<string, DeVerb[]> = {
  gehen: [vb('gehen', 'sein')], kommen: [vb('kommen', 'sein')], kaufen: [vb('kaufen', 'haben', { cls: 'weak' })], fahren: [vb('fahren', 'haben/sein')],
  aufstehen: [vb('aufstehen', 'sein', { prefix: 'auf', base: 'stehen' })],
  umfahren: [vb('umfahren', 'haben', { prefix: 'um', base: 'fahren' }), vb('umfahren', 'haben')],
  gewesen: [vb('sein', 'sein')],
};
VERBS.sein = [vb('sein', 'sein', { cls: 'irregular' })];
const ADJECTIVES: Record<string, DeAdjective> = {
  gut: { lemma: 'gut', gloss: 'good' }, teuer: { lemma: 'teuer', stem: 'teur', gloss: 'expensive' }, rosa: { lemma: 'rosa', indeclinable: true, gloss: 'pink' },
};
const prep = (form: string, cases: DePreposition['cases']): DePreposition => ({ form, cases, gloss: form });
const PREPOSITIONS: Record<string, DePreposition> = {
  mit: prep('mit', ['D']), zu: prep('zu', ['D']), nach: prep('nach', ['D']), von: prep('von', ['D']), für: prep('für', ['A']), durch: prep('durch', ['A']),
  in: prep('in', ['A', 'D']), an: prep('an', ['A', 'D']), wegen: prep('wegen', ['G']),
};
const PREFIXES: Record<string, 'separable' | 'inseparable' | 'dual'> = { auf: 'separable', an: 'separable', um: 'dual', ver: 'inseparable' };

const lex: DeLexiconView = {
  nouns: (l) => NOUNS[l] ?? [], verb: (l) => VERBS[l] ?? [], adjective: (l) => ADJECTIVES[l], closed: () => [], plain: () => [],
  preposition: (f) => PREPOSITIONS[f], contraction: () => undefined, prefixKind: (p) => PREFIXES[p], separableVerbsOf: () => [],
  allNouns: () => [], allVerbs: () => [], allAdjectives: () => [],
};

// ───────────────────────────── analyses by hand ─────────────────────────────

type Defs = Record<string, AnalysisCandidate | AnalysisCandidate[]>;
const C = (pos: PartOfSpeech, lemma: string, morph: Record<string, string> = {}, extra: Partial<AnalysisCandidate> = {}): AnalysisCandidate =>
  ({ pos, lemma, morph, confidence: 0.9, ...extra });
const verb = (lemma: string, morph: Record<string, string> = {}, extra: Partial<AnalysisCandidate> = {}) =>
  C('VERB', lemma, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', ...morph }, extra);
const aux = (lemma: string, morph: Record<string, string> = {}) => C('AUX', lemma, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', ...morph });
const ptc = (lemma: string) => C('VERB', lemma, { VerbForm: 'Part', Tense: 'Past' });
const nn = (lemma: string, morph: Record<string, string> = {}) => C('NOUN', lemma, morph);
const adj = (lemma: string, morph: Record<string, string> = {}) => C('ADJ', lemma, morph);
const prn = (lemma: string, person: string, number: string) => C('PRON', lemma, { PronType: 'Prs', Case: 'Nom', Person: person, Number: number });
const ICH = prn('ich', '1', 'Sing');
const ER = prn('er', '3', 'Sing');
const WIR = prn('wir', '1', 'Plur');
const DU = prn('du', '2', 'Sing');
const der = (morph: Record<string, string>) => C('DET', 'der', { PronType: 'Art', Definite: 'Def', ...morph });
const ein = (morph: Record<string, string>) => C('DET', 'ein', { PronType: 'Art', Definite: 'Ind', ...morph });

function build(text: string, defs: Defs = {}): { tokens: RawToken[]; analyses: AnalyzedToken[] } {
  const tokens: RawToken[] = [];
  const analyses: AnalyzedToken[] = [];
  const seen: Record<string, number> = {};
  for (const m of text.matchAll(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu)) {
    const surface = m[0];
    const isWord = /\p{L}/u.test(surface);
    const start = m.index ?? 0;
    const t: RawToken = { surface, start, end: start + surface.length, isWord, normalized: surface.normalize('NFC').toLocaleLowerCase('de') };
    tokens.push(t);
    const n = seen[surface] ?? 0;
    seen[surface] = n + 1;
    const d = defs[`${surface}#${n}`] ?? defs[surface];
    analyses.push({ token: t, candidates: isWord && d ? (Array.isArray(d) ? d : [d]) : [], analyzer: 'test' });
  }
  return { tokens, analyses };
}

const apply = (text: string, s: NonNullable<ErrorCandidate['suggestion']>): string => text.slice(0, s.start) + s.replacement + text.slice(s.end);

function check(text: string, defs: Defs = {}): ErrorCandidate[] {
  const { tokens, analyses } = build(text, defs);
  const out = checkGermanProduction(tokens, analyses, text, lex);
  for (const e of out) {
    expect(e.message.length).toBeGreaterThan(10);
    expect(e.confidence).toBeGreaterThan(0);
    expect(e.confidence).toBeLessThanOrEqual(1);
    expect(e.tokenIndexes.length).toBeGreaterThan(0);
    if (e.suggestion) {
      expect(e.suggestion.start).toBeGreaterThanOrEqual(0);
      expect(e.suggestion.end).toBeGreaterThanOrEqual(e.suggestion.start);
      expect(e.suggestion.end).toBeLessThanOrEqual(text.length);
    }
  }
  return out;
}

// ───────────────────────────── the checks ─────────────────────────────

describe('German production checks', () => {
  describe('noun not capitalised', () => {
    it('flags a lower-case noun and the suggestion capitalises it (the old behaviour)', () => {
      const text = 'ich liebe gott';
      const e = check(text, { ich: ICH, liebe: verb('lieben', { Person: '1', Number: 'Sing' }), gott: C('PROPN', 'Gott') });
      const s = e.find((x) => x.category === 'spelling')!;
      expect(s.message).toMatch(/capital letter/);
      expect(apply(text, s.suggestion!)).toBe('ich liebe Gott');
    });
    it('is silent on a capitalised noun and on a word that can also be a verb', () => {
      expect(check('Ich liebe Gott.', { Ich: ICH, liebe: verb('lieben', { Person: '1', Number: 'Sing' }), Gott: C('PROPN', 'Gott') })).toEqual([]);
      expect(check('wir essen', { wir: WIR, essen: [nn('Essen'), verb('essen', { Person: '1,3', Number: 'Plur' })] })).toEqual([]);
    });
  });

  describe('article not in the case the preposition governs', () => {
    const mann = nn('Mann', { Gender: 'Masc', Number: 'Sing', Case: 'Nom,Acc,Dat' });
    it('mit die Mann → mit dem Mann (one error, the old wording)', () => {
      const text = 'mit die Mann';
      const e = check(text, { mit: C('ADP', 'mit'), die: der({ Case: 'Nom,Acc', Gender: 'Fem', Number: 'Sing,Plur' }), Mann: mann });
      expect(e).toHaveLength(1);
      expect(e[0].category).toBe('case');
      expect(e[0].message).toBe('"mit" takes the dative: "die" is not a dative form.');
      expect(apply(text, e[0].suggestion!)).toBe('mit dem Mann');
    });
    it('mit den Mann → mit dem Mann; mit ein Auto → mit einem Auto; the capital letter is kept', () => {
      const t1 = 'mit den Mann';
      expect(apply(t1, check(t1, { mit: C('ADP', 'mit'), den: der({ Case: 'Acc', Gender: 'Masc', Number: 'Sing' }), Mann: mann })[0].suggestion!)).toBe('mit dem Mann');
      const t2 = 'mit ein Auto';
      const e2 = check(t2, { mit: C('ADP', 'mit'), ein: ein({ Case: 'Nom,Acc', Gender: 'Neut', Number: 'Sing' }), Auto: nn('Auto', { Gender: 'Neut', Number: 'Sing' }) });
      expect(apply(t2, e2[0].suggestion!)).toBe('mit einem Auto');
      const t3 = 'Mit die Frau';
      const e3 = check(t3, { Mit: C('ADP', 'mit'), die: der({ Case: 'Nom,Acc', Gender: 'Fem' }), Frau: nn('Frau', { Gender: 'Fem', Number: 'Sing' }) });
      expect(apply(t3, e3[0].suggestion!)).toBe('Mit der Frau');
    });
    it('the accusative: für dem Mann → für den Mann', () => {
      const text = 'für dem Mann';
      const e = check(text, { für: C('ADP', 'für'), dem: der({ Case: 'Dat', Gender: 'Masc,Neut', Number: 'Sing' }), Mann: mann });
      expect(e[0].message).toBe('"für" takes the accusative: "dem" is not an accusative form.');
      expect(apply(text, e[0].suggestion!)).toBe('für den Mann');
    });
    it('without a certain fix there is an error and no suggestion', () => {
      const e = check('mit die Xyz', { mit: C('ADP', 'mit'), die: der({ Case: 'Nom,Acc', Gender: 'Fem' }), Xyz: nn('Xyz') });
      expect(e).toHaveLength(1);
      expect(e[0].suggestion).toBeUndefined();
      expect(e[0].confidence).toBeLessThan(0.7);
    });
    it('is silent on the right case, on a union that holds it, on a two-way and a genitive preposition', () => {
      expect(check('mit dem Mann', { mit: C('ADP', 'mit'), dem: der({ Case: 'Dat', Gender: 'Masc,Neut', Number: 'Sing' }), Mann: mann })).toEqual([]);
      expect(check('zu den Häusern', { zu: C('ADP', 'zu'), den: der({ Case: 'Acc,Dat', Number: 'Plur' }) })).toEqual([]);
      expect(check('in die Stadt', { in: C('ADP', 'in'), die: der({ Case: 'Nom,Acc', Gender: 'Fem' }) })).toEqual([]);
      expect(check('wegen dem Haus', { wegen: C('ADP', 'wegen'), dem: der({ Case: 'Dat', Gender: 'Masc,Neut', Number: 'Sing' }) })).toEqual([]);
      expect(check('mit Ihnen', { mit: C('ADP', 'mit') })).toEqual([]);
    });
  });

  describe('article and noun of different gender', () => {
    it('das Mann → der Mann when the case is decided', () => {
      const text = 'Das Mann ist alt.';
      const e = check(text, { Das: der({ Case: 'Nom,Acc', Gender: 'Neut', Number: 'Sing' }), Mann: nn('Mann', { Gender: 'Masc', Number: 'Sing', Case: 'Nom' }) });
      expect(e).toHaveLength(1);
      expect(e[0].category).toBe('agreement');
      expect(e[0].message).toContain('masculine');
      expect(apply(text, e[0].suggestion!)).toBe('Der Mann ist alt.');
    });
    it('die Haus → das Haus (feminine and neuter: the same form in the nominative and accusative)', () => {
      const text = 'Ich sehe die Haus.';
      const e = check(text, { die: der({ Case: 'Nom,Acc', Gender: 'Fem', Number: 'Sing,Plur' }), Haus: nn('Haus', { Gender: 'Neut', Number: 'Sing', Case: 'Nom,Acc,Dat' }) });
      expect(apply(text, e[0].suggestion!)).toBe('Ich sehe das Haus.');
    });
    it('an undecided case gives the error without a suggestion', () => {
      const e = check('Das Mann ist alt.', { Das: der({ Case: 'Nom,Acc', Gender: 'Neut', Number: 'Sing' }), Mann: nn('Mann', { Gender: 'Masc', Number: 'Sing', Case: 'Nom,Acc,Dat' }) });
      expect(e).toHaveLength(1);
      expect(e[0].suggestion).toBeUndefined();
    });
    it('is silent on agreement, on a plural noun, on a noun with two genders, on an unknown noun', () => {
      expect(check('Der Mann ist alt.', { Der: der({ Case: 'Nom', Gender: 'Masc', Number: 'Sing' }), Mann: nn('Mann', { Gender: 'Masc', Number: 'Sing' }) })).toEqual([]);
      expect(check('Die Männer sind alt.', { Die: der({ Case: 'Nom,Acc', Gender: 'Fem', Number: 'Plur' }), Männer: nn('Mann', { Gender: 'Masc', Number: 'Plur' }) })).toEqual([]);
      expect(check('Das See ist kalt.', { Das: der({ Case: 'Nom,Acc', Gender: 'Neut', Number: 'Sing' }), See: nn('See', { Number: 'Sing' }) })).toEqual([]);
      expect(check('Das Xyz ist kalt.', { Das: der({ Case: 'Nom,Acc', Gender: 'Neut', Number: 'Sing' }), Xyz: nn('Xyz', { Number: 'Sing' }) })).toEqual([]);
    });
  });

  describe('verb not second after a fronted adverb', () => {
    it('Jetzt ich glaube an Gott. → Jetzt glaube ich an Gott. (the old behaviour)', () => {
      const text = 'Jetzt ich glaube an Gott.';
      const defs: Defs = { Jetzt: C('ADV', 'jetzt'), ich: ICH, glaube: verb('glauben', { Person: '1', Number: 'Sing' }), an: C('ADP', 'an'), Gott: C('PROPN', 'Gott') };
      const w = check(text, defs).find((x) => x.category === 'word-order')!;
      expect(w.message).toBe('In a main clause the conjugated verb is the second element: "Jetzt glaube ich".');
      expect(apply(text, w.suggestion!)).toBe('Jetzt glaube ich an Gott.');
      expect(check('Jetzt glaube ich an Gott.', { Jetzt: C('ADV', 'jetzt'), glaube: verb('glauben', { Person: '1', Number: 'Sing' }), ich: ICH, an: C('ADP', 'an'), Gott: C('PROPN', 'Gott') })).toEqual([]);
    });
    it('Heute ich gehe nach Hause. → Heute gehe ich nach Hause.', () => {
      const text = 'Heute ich gehe nach Hause.';
      const e = check(text, { Heute: C('ADV', 'heute'), ich: ICH, gehe: verb('gehen', { Person: '1', Number: 'Sing' }) });
      expect(apply(text, e.find((x) => x.category === 'word-order')!.suggestion!)).toBe('Heute gehe ich nach Hause.');
    });
    it('is silent when the adverb belongs to the subject (Auch ich gehe) or the order is right', () => {
      expect(check('Auch ich gehe.', { Auch: C('ADV', 'auch'), ich: ICH, gehe: verb('gehen', { Person: '1', Number: 'Sing' }) })).toEqual([]);
      expect(check('Heute gehe ich.', { Heute: C('ADV', 'heute'), gehe: verb('gehen', { Person: '1', Number: 'Sing' }), ich: ICH })).toEqual([]);
    });
  });

  describe('finite verb not last after dass / weil / wenn / ob', () => {
    it('weil ich bin müde → weil ich müde bin', () => {
      const text = 'Ich bleibe zu Hause, weil ich bin müde.';
      const e = check(text, { weil: C('SCONJ', 'weil'), ich: ICH, bin: aux('sein', { Person: '1', Number: 'Sing' }), müde: adj('müde') });
      const w = e.find((x) => x.category === 'word-order')!;
      expect(apply(text, w.suggestion!)).toBe('Ich bleibe zu Hause, weil ich müde bin.');
      expect(w.message).toContain('weil ich müde bin');
    });
    it('dass er hat gelernt → dass er gelernt hat; dass er will gehen → dass er gehen will', () => {
      const t1 = 'Ich weiß, dass er hat das Buch gelernt.';
      const e1 = check(t1, { dass: C('SCONJ', 'dass'), er: ER, hat: aux('haben', { Person: '3', Number: 'Sing' }), Buch: nn('Buch'), gelernt: ptc('lernen') });
      expect(apply(t1, e1.find((x) => x.category === 'word-order')!.suggestion!)).toBe('Ich weiß, dass er das Buch gelernt hat.');
      const t2 = 'Ich glaube, dass er will gehen.';
      const e2 = check(t2, { dass: C('SCONJ', 'dass'), er: ER, will: aux('wollen', { Person: '3', Number: 'Sing' }), gehen: C('VERB', 'gehen', { VerbForm: 'Inf' }) });
      expect(apply(t2, e2[0].suggestion!)).toBe('Ich glaube, dass er gehen will.');
    });
    it('a noun phrase as the subject: wenn der Mann kommt heute is wrong, wenn der Mann ist müde → … müde ist', () => {
      const text = 'Er fragt, ob der Mann ist müde.';
      const e = check(text, { ob: C('SCONJ', 'ob'), der: der({ Case: 'Nom', Gender: 'Masc', Number: 'Sing' }), Mann: nn('Mann', { Gender: 'Masc', Number: 'Sing' }), ist: aux('sein', { Person: '3', Number: 'Sing' }), müde: adj('müde') });
      expect(apply(text, e.find((x) => x.category === 'word-order')!.suggestion!)).toBe('Er fragt, ob der Mann müde ist.');
    });
    it('a coordination gives the error without a suggestion', () => {
      const e = check('Ich bleibe, weil ich bin müde und hungrig.', { weil: C('SCONJ', 'weil'), ich: ICH, bin: aux('sein', { Person: '1', Number: 'Sing' }), müde: adj('müde'), und: C('CONJ', 'und'), hungrig: adj('hungrig') });
      const w = e.find((x) => x.category === 'word-order')!;
      expect(w).toBeDefined();
      expect(w.suggestion).toBeUndefined();
    });
    it('is silent on the correct order, a double infinitive, two clauses run together', () => {
      const ok = check('Ich bleibe zu Hause, weil ich müde bin.', { weil: C('SCONJ', 'weil'), ich: ICH, müde: adj('müde'), bin: aux('sein', { Person: '1', Number: 'Sing' }) });
      expect(ok.filter((x) => x.category === 'word-order')).toEqual([]);
      const dbl = check('Ich weiß, dass er hätte kommen können.', { dass: C('SCONJ', 'dass'), er: ER, hätte: aux('haben', { Mood: 'Sub', Tense: 'Past', Person: '3', Number: 'Sing' }), kommen: C('VERB', 'kommen', { VerbForm: 'Inf' }), können: C('AUX', 'können', { VerbForm: 'Inf' }) });
      expect(dbl).toEqual([]);
      const runOn = check('Wenn ich komme gehe ich schlafen.', { Wenn: C('SCONJ', 'wenn'), ich: ICH, komme: verb('kommen', { Person: '1', Number: 'Sing' }), gehe: verb('gehen', { Person: '1', Number: 'Sing' }), schlafen: C('VERB', 'schlafen', { VerbForm: 'Inf' }) });
      expect(runOn.filter((x) => x.category === 'word-order')).toEqual([]);
      expect(check('Ich weiß, dass ich Hunger habe.', { dass: C('SCONJ', 'dass'), ich: ICH, Hunger: nn('Hunger'), habe: verb('haben', { Person: '1', Number: 'Sing' }) })).toEqual([]);
    });
  });

  describe('wrong perfect auxiliary', () => {
    const habe = aux('haben', { Person: '1', Number: 'Sing' });
    it('ich habe gegangen → ich bin gegangen', () => {
      const text = 'Ich habe gegangen.';
      const e = check(text, { Ich: ICH, habe, gegangen: ptc('gehen') });
      expect(e).toHaveLength(1);
      expect(e[0].category).toBe('conjugation');
      expect(apply(text, e[0].suggestion!)).toBe('Ich bin gegangen.');
    });
    it('er hat → ist, hatte → war, hätte → wäre', () => {
      const t1 = 'Er hat gegangen.';
      expect(apply(t1, check(t1, { hat: aux('haben', { Person: '3', Number: 'Sing' }), gegangen: ptc('gehen') })[0].suggestion!)).toBe('Er ist gegangen.');
      const t2 = 'Er hatte gegangen.';
      expect(apply(t2, check(t2, { hatte: aux('haben', { Person: '3', Number: 'Sing', Tense: 'Past' }), gegangen: ptc('gehen') })[0].suggestion!)).toBe('Er war gegangen.');
      const t3 = 'Er hätte gegangen.';
      expect(apply(t3, check(t3, { hätte: aux('haben', { Person: '3', Number: 'Sing', Tense: 'Past', Mood: 'Sub' }), gegangen: ptc('gehen') })[0].suggestion!)).toBe('Er wäre gegangen.');
    });
    it('the auxiliary is across the bracket and at the end of a subordinate clause', () => {
      const text = 'Ich weiß, dass ich nach Hause gekommen habe.';
      const e = check(text, { dass: C('SCONJ', 'dass'), ich: ICH, gekommen: ptc('kommen'), habe });
      expect(apply(text, e.find((x) => x.category === 'conjugation')!.suggestion!)).toBe('Ich weiß, dass ich nach Hause gekommen bin.');
    });
    it('an undecided person gives the error without a suggestion', () => {
      const e = check('Wir haben gegangen.', { Wir: WIR, haben: aux('haben', { Person: '1,3', Number: 'Plur' }), gegangen: ptc('gehen') });
      expect(e).toHaveLength(1);
      expect(e[0].suggestion).toBeUndefined();
    });
    it('is silent when the lexicon gives haben, both, or nothing', () => {
      expect(check('Ich bin gegangen.', { Ich: ICH, bin: aux('sein', { Person: '1', Number: 'Sing' }), gegangen: ptc('gehen') })).toEqual([]);
      expect(check('Ich habe gekauft.', { Ich: ICH, habe, gekauft: ptc('kaufen') })).toEqual([]);
      expect(check('Ich habe gefahren.', { Ich: ICH, habe, gefahren: ptc('fahren') })).toEqual([]);
      expect(check('Ich habe gesehen.', { Ich: ICH, habe, gesehen: ptc('sehen') })).toEqual([]);
      expect(check('Ich habe ein Buch.', { Ich: ICH, habe, Buch: nn('Buch') })).toEqual([]);
    });
  });

  describe('separable verb written together in a main clause', () => {
    const parts = [{ text: 'auf', start: 0, end: 3, kind: 'prefix' as const }, { text: 'stehe', start: 3, end: 8, kind: 'stem' as const }];
    const aufstehe = verb('aufstehen', { Person: '1', Number: 'Sing' }, { parts });
    it('Ich aufstehe um sechs → Ich stehe um sechs auf', () => {
      const text = 'Ich aufstehe um sechs.';
      const e = check(text, { Ich: ICH, aufstehe, um: C('ADP', 'um'), sechs: C('NUM', 'sechs') });
      expect(e).toHaveLength(1);
      expect(e[0].category).toBe('word-order');
      expect(apply(text, e[0].suggestion!)).toBe('Ich stehe um sechs auf.');
    });
    it('Ich aufstehe. → Ich stehe auf.; a fronted adverb; the prefix goes before a conjunction', () => {
      expect(apply('Ich aufstehe.', check('Ich aufstehe.', { Ich: ICH, aufstehe })[0].suggestion!)).toBe('Ich stehe auf.');
      const t = 'Heute aufstehe ich um sechs.';
      // the subject behind the verb is part of what stays between: the prefix goes to the end of the clause
      const defs: Defs = { Heute: C('ADV', 'heute'), aufstehe, ich: ICH, um: C('ADP', 'um'), sechs: C('NUM', 'sechs') };
      expect(apply(t, check(t, defs)[0].suggestion!)).toBe('Heute stehe ich um sechs auf.');
      const t2 = 'Ich aufstehe um sechs und frühstücke.';
      const e2 = check(t2, { Ich: ICH, aufstehe, um: C('ADP', 'um'), sechs: C('NUM', 'sechs'), und: C('CONJ', 'und'), frühstücke: verb('frühstücken', { Person: '1', Number: 'Sing' }) });
      expect(apply(t2, e2.find((x) => x.category === 'word-order')!.suggestion!)).toBe('Ich stehe um sechs auf und frühstücke.');
    });
    it('is silent: subordinate clause, relative clause, the right form, an inseparable twin, a dual prefix', () => {
      expect(check('Ich weiß, dass er aufsteht.', { dass: C('SCONJ', 'dass'), er: ER, aufsteht: verb('aufstehen', { Person: '3', Number: 'Sing' }, { parts }) })).toEqual([]);
      expect(check('Ich stehe um sechs auf.', { Ich: ICH, stehe: verb('aufstehen', { Person: '1', Number: 'Sing' }), um: C('ADP', 'um'), sechs: C('NUM', 'sechs') })).toEqual([]);
      const umParts = [{ text: 'um', start: 0, end: 2, kind: 'prefix' as const }, { text: 'fahre', start: 2, end: 7, kind: 'stem' as const }];
      expect(check('Ich umfahre den Baum.', { Ich: ICH, umfahre: verb('umfahren', { Person: '1', Number: 'Sing' }, { parts: umParts }), den: C('DET', 'der') })).toEqual([]);
    });
  });

  describe('subject pronoun and verb ending disagree', () => {
    it('ich geht, wir ist, er gehen', () => {
      const e1 = check('ich geht', { ich: ICH, geht: verb('gehen', { Person: '2,3', Number: 'Sing,Plur' }) });
      expect(e1).toHaveLength(1);
      expect(e1[0].category).toBe('agreement');
      expect(e1[0].tokenIndexes).toEqual([0, 1]);
      expect(check('wir ist hier', { wir: WIR, ist: aux('sein', { Person: '3', Number: 'Sing' }) })[0].message).toContain('first person plural');
      expect(check('Er gehen', { Er: ER, gehen: verb('gehen', { VerbForm: 'Fin,Inf', Person: '1,3', Number: 'Plur' }) })).toHaveLength(1);
    });
    it('is silent: a matching ending, a union that holds the person, "er und ich gehen", "sie" (undecided), a pronoun that is not the subject', () => {
      expect(check('ich gehe', { ich: ICH, gehe: verb('gehen', { Person: '1', Number: 'Sing' }) })).toEqual([]);
      expect(check('wir gehen', { wir: WIR, gehen: verb('gehen', { VerbForm: 'Fin,Inf', Person: '1,3', Number: 'Plur' }) })).toEqual([]);
      expect(check('er und ich gehen', { er: ER, und: C('CONJ', 'und'), ich: ICH, gehen: verb('gehen', { Person: '1,3', Number: 'Plur' }) })).toEqual([]);
      expect(check('sie geht', { sie: C('PRON', 'sie', { PronType: 'Prs', Case: 'Nom,Acc', Person: '3', Number: 'Sing,Plur' }), geht: verb('gehen', { Person: '3', Number: 'Sing' }) })).toEqual([]);
      // "du geht": the person and number sets of "geht" both contain the pronoun's features, so nothing is said (it is not guessed)
      expect(check('du geht', { du: DU, geht: verb('gehen', { Person: '2,3', Number: 'Sing,Plur' }) })).toEqual([]);
    });
  });

  describe('adjective without an ending', () => {
    it('der gut Mann → der gute Mann; ein gut Mann → ein guter Mann; eine gut Frau → eine gute Frau; dem gut Mann → dem guten Mann', () => {
      const bare = adj('gut');
      const t1 = 'der gut Mann';
      const e1 = check(t1, { der: der({ Case: 'Nom', Gender: 'Masc', Number: 'Sing' }), gut: bare, Mann: nn('Mann') });
      expect(e1).toHaveLength(1);
      expect(e1[0].category).toBe('morphology');
      expect(apply(t1, e1[0].suggestion!)).toBe('der gute Mann');
      const t2 = 'ein gut Mann';
      expect(apply(t2, check(t2, { ein: ein({ Case: 'Nom', Gender: 'Masc', Number: 'Sing' }), gut: bare, Mann: nn('Mann') })[0].suggestion!)).toBe('ein guter Mann');
      const t3 = 'eine gut Frau';
      expect(apply(t3, check(t3, { eine: ein({ Case: 'Nom,Acc', Gender: 'Fem', Number: 'Sing' }), gut: bare, Frau: nn('Frau') })[0].suggestion!)).toBe('eine gute Frau');
      const t4 = 'dem gut Mann';
      expect(apply(t4, check(t4, { dem: der({ Case: 'Dat', Gender: 'Masc,Neut', Number: 'Sing' }), gut: bare, Mann: nn('Mann') })[0].suggestion!)).toBe('dem guten Mann');
      const t5 = 'das teuer Auto';
      expect(apply(t5, check(t5, { das: der({ Case: 'Nom', Gender: 'Neut', Number: 'Sing' }), teuer: adj('teuer'), Auto: nn('Auto') })[0].suggestion!)).toBe('das teure Auto');
    });
    it('an undecided article gives the error without a suggestion', () => {
      const e = check('der gut Mann', { der: der({ Case: 'Nom,Dat,Gen', Gender: 'Masc,Fem' }), gut: adj('gut'), Mann: nn('Mann') });
      expect(e).toHaveLength(1);
      expect(e[0].suggestion).toBeUndefined();
    });
    it('is silent: an ending, an indeclinable adjective, an adjective the lexicon does not hold, a predicative adjective', () => {
      expect(check('der gute Mann', { der: der({ Case: 'Nom', Gender: 'Masc', Number: 'Sing' }), gute: adj('gut'), Mann: nn('Mann') })).toEqual([]);
      expect(check('ein rosa Kleid', { ein: ein({ Case: 'Nom', Gender: 'Neut', Number: 'Sing' }), rosa: adj('rosa'), Kleid: nn('Kleid') })).toEqual([]);
      expect(check('der klug Mann', { der: der({ Case: 'Nom', Gender: 'Masc', Number: 'Sing' }), klug: adj('klug'), Mann: nn('Mann') })).toEqual([]);
      expect(check('Der Mann ist gut.', { Der: der({ Case: 'Nom', Gender: 'Masc', Number: 'Sing' }), Mann: nn('Mann'), gut: adj('gut') })).toEqual([]);
    });
  });

  describe('older spelling', () => {
    it('daß → dass, as a gentle spelling note whose suggestion applies', () => {
      const text = 'Ich weiß, daß er kommt.';
      const e = check(text, { daß: C('SCONJ', 'dass') });
      expect(e).toHaveLength(1);
      expect(e[0].category).toBe('spelling');
      expect(e[0].message).toContain('"dass"');
      expect(e[0].confidence).toBeLessThanOrEqual(0.6);
      expect(apply(text, e[0].suggestion!)).toBe('Ich weiß, dass er kommt.');
    });
    it('muß → muss and a capital: Muß → Muss', () => {
      expect(apply('Er muß gehen.', check('Er muß gehen.')[0].suggestion!)).toBe('Er muss gehen.');
      expect(apply('Muß ich gehen?', check('Muß ich gehen?')[0].suggestion!)).toBe('Muss ich gehen?');
    });
    it('is silent on modern spelling and on ß that is still right', () => {
      expect(check('Ich weiß, dass er muss. Der Fuß, das Maß, die Straße.')).toEqual([]);
    });
  });

  describe('kein for "nicht ein"', () => {
    const nicht = C('ADV', 'nicht');
    it('Ich habe nicht ein Auto → Ich habe kein Auto; nicht einen Hund → keinen Hund', () => {
      const t1 = 'Ich habe nicht ein Auto.';
      const e1 = check(t1, { nicht, ein: ein({ Case: 'Acc', Gender: 'Neut', Number: 'Sing' }), Auto: nn('Auto') });
      expect(e1).toHaveLength(1);
      expect(e1[0].category).toBe('syntax');
      expect(apply(t1, e1[0].suggestion!)).toBe('Ich habe kein Auto.');
      const t2 = 'Ich habe nicht einen Hund.';
      expect(apply(t2, check(t2, { nicht, einen: ein({ Case: 'Acc', Gender: 'Masc', Number: 'Sing' }), Hund: nn('Hund') })[0].suggestion!)).toBe('Ich habe keinen Hund.');
    });
    it('is silent: kein, nicht + the definite article, a contrast with sondern, nicht ein Mal, nicht ein einziges Mal', () => {
      expect(check('Ich habe kein Auto.', { kein: C('DET', 'kein'), Auto: nn('Auto') })).toEqual([]);
      expect(check('Ich habe das Auto nicht.', { Auto: nn('Auto'), nicht })).toEqual([]);
      expect(check('Ich habe nicht ein Auto, sondern zwei.', { nicht, ein: ein({ Case: 'Acc' }), Auto: nn('Auto'), sondern: C('CONJ', 'sondern') })).toEqual([]);
      expect(check('Er kam nicht ein Mal.', { nicht, ein: ein({ Case: 'Acc' }), Mal: nn('Mal') })).toEqual([]);
      expect(check('Er kam nicht ein einziges Mal.', { nicht, ein: ein({ Case: 'Acc' }), einziges: adj('einzig'), Mal: nn('Mal') })).toEqual([]);
    });
  });

  describe('the old adapter\'s expectations', () => {
    it('is silent on the three correct sentences of the old test', () => {
      expect(check('Ich liebe Gott.', { Ich: ICH, liebe: verb('lieben', { Person: '1', Number: 'Sing' }), Gott: C('PROPN', 'Gott') })).toEqual([]);
      const als = check('Als ich jung war, hatte ich Sünde in meinem Herzen.', {
        Als: C('SCONJ', 'als'), ich: ICH, jung: adj('jung'), war: aux('sein', { Tense: 'Past', Person: '1,3', Number: 'Sing' }),
        hatte: aux('haben', { Tense: 'Past', Person: '1,3', Number: 'Sing' }), Sünde: nn('Sünde', { Gender: 'Fem', Number: 'Sing' }), in: C('ADP', 'in'),
        meinem: C('DET', 'mein', { Poss: 'Yes', Case: 'Dat', Gender: 'Masc,Neut', Number: 'Sing' }), Herzen: nn('Herz', { Gender: 'Neut', Number: 'Sing', Case: 'Dat' }),
      });
      expect(als).toEqual([]);
      const zeitung = check('Er kaufte eine Zeitung.', {
        Er: ER, kaufte: verb('kaufen', { Tense: 'Past', Person: '1,3', Number: 'Sing' }), eine: ein({ Case: 'Nom,Acc', Gender: 'Fem', Number: 'Sing' }), Zeitung: nn('Zeitung', { Gender: 'Fem', Number: 'Sing' }),
      });
      expect(zeitung).toEqual([]);
    });
  });

  describe('general', () => {
    it('says nothing about a sentence nothing is known about: an empty result never means "correct"', () => {
      expect(check('Heute ich gehe nach Hause, weil ich bin müde.')).toEqual([]);
      expect(check('mit die Mann')).toEqual([]);
      expect(check('')).toEqual([]);
    });
    it('reports in text order and every error names token indexes inside the sentence', () => {
      const text = 'ich geht mit die Mann';
      const { tokens } = build(text);
      const e = check(text, {
        ich: ICH, geht: verb('gehen', { Person: '2,3', Number: 'Sing,Plur' }), mit: C('ADP', 'mit'),
        die: der({ Case: 'Nom,Acc', Gender: 'Fem' }), Mann: nn('Mann', { Gender: 'Masc', Number: 'Sing' }),
      });
      expect(e.length).toBe(2);
      const firsts = e.map((x) => Math.min(...x.tokenIndexes));
      expect([...firsts].sort((a, b) => a - b)).toEqual(firsts);
      for (const x of e) for (const i of x.tokenIndexes) expect(i).toBeLessThan(tokens.length);
    });
  });
});
