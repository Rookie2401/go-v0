/**
 * The sentence layer of the Russian analyser (src/adapters/russian/sentence.ts, government.ts) over the REAL index: the compiled core
 * and the shards of public/lexicon/ru/standard for the words these sentences use. Every rule has a real sentence it decides and a
 * case it must leave alone (the order the context-free analyser gave stands). A combining acute is always written as the escape ́.
 */
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnalysisCandidate, AnalyzedToken, RawToken } from '../../src/core';
import { ruWordCandidates } from '../../src/adapters/russian/analyze';
import { RU_CORE } from '../../src/adapters/russian/generated/core';
import { ruPrepositionOf, ruGovernmentFit, ruCasesOf, RU_PREPOSITIONS } from '../../src/adapters/russian/government';
import { installRussianIndex, resetRussianIndexes } from '../../src/adapters/russian/index-store';
import { orderRuSentence, ruAgrees, ruAnalyze, ruRefine } from '../../src/adapters/russian/sentence';
import { statusOf } from '../../packages/language-packs/src/analysis';
import { createRussianShardLoader } from '../../src/adapters/russian/shards';
import { ruKey, ruTokenize } from '../../src/adapters/russian/text';
import { RU_ANALYZER } from '../../src/adapters/russian/version';

const SHARDS = 'public/lexicon/ru/standard';
const shardsAvailable = fs.existsSync(`${SHARDS}/manifest.json`);

const SENTENCES = [
  'Она прочитала книгу.', 'У меня есть книга.', 'У меня нет книги.', 'Они стали читать.', 'Изделия из стали.', 'Стали.', 'Я иду в школу.',
  'Я читаю интересную книгу.', 'интересную', 'Все знают это.', 'Он всё знает.', 'Это книга.', 'Это окно открыто.', 'Мы говорили о книге.',
  'Мы пошли к нему.', 'Они ушли без них.', 'Он сказал, что он придёт.', 'Что случилось?', 'Я хочу есть.', 'Есть.', 'Книга брата лежит на столе.',
  'Я вижу его.', 'Это его книга.', 'Прошло два года.', 'Прошло пять лет.', 'Он прожил один год.', 'лет', 'книги', 'Все.', 'Я хочу, чтобы ты пришёл.',
  'Ты ешь хлеб.', 'Он ешь хлеб.', 'Когда ты придёшь?', 'Когда он пришёл, мы ушли.', 'У меня есть два года и пять лет, но нет книги.', 'В этом году он жил в лесу.', 'Он в школе читает книги.', 'Он живёт в Москве, книги лежат дома.', 'В большом доме.', 'Он делает это просто.', 'Она красиво поёт.',
  'Я пришёл, потому что хотел.', 'Мы не знаем, что делать.', 'Он купил красивый дом.', 'Мы живём в большом доме.', 'Я говорил с этим человеком.',
  'Каждый день я хожу в школу.', 'Дом стоит у реки.', 'Мне нужно идти.', 'Они вернулись из города.',
];

const token = (s: string): RawToken => ({ surface: s, start: 0, end: s.length, isWord: true, normalized: ruKey(s) });
const run = (s: string): AnalyzedToken[] => ruAnalyze(ruTokenize(s));
const words = (s: string): AnalyzedToken[] => run(s).filter((a) => a.token.isWord);
const first = (s: string, surface: string): AnalysisCandidate => {
  const a = words(s).find((x) => x.token.surface === surface);
  if (!a?.candidates[0]) throw new Error(`no reading for ${surface} in ${s}`);
  return a.candidates[0];
};
const sig = (c: AnalysisCandidate): string => `${c.lemma}|${c.pos}|${JSON.stringify(Object.entries(c.morph).sort())}`;
const baseSigs = (s: string): string[][] => ruTokenize(s).filter((t) => t.isWord).map((t) => ruWordCandidates(t).map(sig));
const ourSigs = (s: string): string[][] => words(s).map((a) => a.candidates.map(sig));

describe.skipIf(!shardsAvailable)('ruAnalyze over the real index', () => {
  beforeAll(async () => {
    resetRussianIndexes();
    installRussianIndex(RU_CORE);
    const loader = await createRussianShardLoader({
      fetchJson: async (p: string) => JSON.parse(fs.readFileSync(p, 'utf8')) as unknown,
      fetchBytes: async (p: string) => new Uint8Array(fs.readFileSync(p)),
    }, { base: SHARDS, maxLoaded: 128 });
    await loader.ensure(SENTENCES.flatMap((s) => ruTokenize(s).filter((t) => t.isWord).map((t) => t.normalized)));
  }, 60_000);
  afterAll(() => resetRussianIndexes());

  describe('the contract: reorder, lower, annotate; never add, remove or rewrite', () => {
    it('keeps exactly the readings of the context-free analyser, with no confidence raised', () => {
      for (const s of SENTENCES) {
        const base = ruTokenize(s).filter((t) => t.isWord).map((t) => ruWordCandidates(t));
        const ours = words(s).map((a) => a.candidates);
        base.forEach((b, i) => {
          expect(ours[i].map(sig).sort(), `${s} #${i}`).toEqual(b.map(sig).sort());
          for (const c of ours[i]) {
            const was = b.find((x) => sig(x) === sig(c));
            expect(c.confidence).toBeLessThanOrEqual(was!.confidence);
          }
        });
      }
    });
    it('sets notes.context on a reading it moved to the front or a hard rule decided, in one plain sentence', () => {
      const a = words('Изделия из стали.').find((x) => x.token.surface === 'стали')!;
      expect(a.candidates[0].lemma).toBe('сталь');
      expect(a.candidates[0].notes?.context).toMatch(/preposition «из»/);
      expect(a.candidates[0].notes?.context).not.toMatch(/\n/);
    });
    it('returns tokens that are not words untouched, with the adapter analyzer name', () => {
      const out = run('Она читает.');
      expect(out.every((a) => a.analyzer === RU_ANALYZER)).toBe(true);
      expect(out.find((a) => !a.token.isWord)?.candidates).toEqual([]);
    });
  });

  describe('a. government of prepositions', () => {
    it('reads the noun after из in the genitive and puts a finite verb reading last: изделия из стали', () => {
      expect(first('Изделия из стали.', 'стали')).toMatchObject({ lemma: 'сталь', pos: 'NOUN' });
    });
    it('reads «Они стали читать» with the verb (no preposition before it)', () => {
      expect(first('Они стали читать.', 'стали')).toMatchObject({ lemma: 'стать', pos: 'VERB' });
    });
    it('reads «в школу» as accusative and «о книге» as prepositional', () => {
      expect(first('Я иду в школу.', 'школу').morph.Case).toBe('Acc');
      expect(first('Мы говорили о книге.', 'книге').morph.Case).toMatch(/Prep/);
    });
    it('reads the н- pronoun forms after a preposition as personal pronouns', () => {
      expect(first('Мы пошли к нему.', 'нему')).toMatchObject({ lemma: 'он', pos: 'PRON' });
      expect(first('Они ушли без них.', 'них')).toMatchObject({ lemma: 'они', pos: 'PRON' });
    });
    it('leaves a word with no preposition before it in the given order', () => {
      expect(ourSigs('Стали.')).toEqual(baseSigs('Стали.'));
      expect(ourSigs('книги')).toEqual(baseSigs('книги'));
    });
    it('the government table: every primary preposition, its variants and the cases the brief names', () => {
      const cases = (w: string): string[] => { const p = ruPrepositionOf(w)!; return [...p.main, ...p.minor].sort(); };
      expect(cases('в')).toEqual(['Acc', 'Prep']);
      expect(ruPrepositionOf('во')?.lemma).toBe('в');
      expect(cases('с')).toEqual(['Acc', 'Gen', 'Ins']);
      expect(cases('по')).toEqual(['Acc', 'Dat', 'Prep']);
      expect(cases('к')).toEqual(['Dat']);
      expect(cases('между')).toEqual(['Gen', 'Ins']);
      expect(cases('благодаря')).toEqual(['Dat']);
      for (const v of ['во', 'со', 'ко', 'об', 'обо', 'изо', 'надо', 'подо', 'передо', 'ото', 'безо']) expect(ruPrepositionOf(v), v).toBeDefined();
      for (const w of ['у', 'от', 'до', 'из', 'без', 'для', 'около', 'после', 'кроме', 'вместо', 'вокруг', 'среди', 'против', 'из-за', 'из-под', 'мимо', 'возле', 'вдоль', 'внутри', 'вне']) expect(cases(w), w).toEqual(['Gen']);
      for (const w of ['через', 'про', 'сквозь']) expect(cases(w), w).toEqual(['Acc']);
      for (const w of ['перед', 'над']) expect(cases(w), w).toEqual(['Ins']);
      expect(cases('при')).toEqual(['Prep']);
      expect(cases('о')).toEqual(['Acc', 'Prep']);
      expect(cases('за')).toEqual(['Acc', 'Ins']);
      expect(RU_PREPOSITIONS.length).toBeGreaterThanOrEqual(40);
      expect(ruGovernmentFit(ruPrepositionOf('в')!, 'Loc')).toBe(2);
      expect(ruCasesOf('Loc,Par')).toEqual(['Prep', 'Gen']);
    });
  });

  describe('b. agreement inside the noun phrase', () => {
    it('chooses the accusative feminine singular for «интересную книгу»', () => {
      expect(first('Я читаю интересную книгу.', 'интересную')).toMatchObject({ lemma: 'интересный', pos: 'ADJ' });
      expect(first('Я читаю интересную книгу.', 'книгу').morph).toMatchObject({ Case: 'Acc', Number: 'Sing', Gender: 'Fem' });
    });
    it('chooses the prepositional singular of «в большом доме» over the chain', () => {
      expect(first('Мы живём в большом доме.', 'большом').morph.Case).toBe('Prep');
      expect(first('Мы живём в большом доме.', 'доме').morph.Case).toMatch(/Prep/);
    });
    it('puts the instrumental of «с этим человеком» on all three words', () => {
      expect(first('Я говорил с этим человеком.', 'этим').morph.Case).toBe('Ins');
      expect(first('Я говорил с этим человеком.', 'человеком').morph.Case).toBe('Ins');
    });
    it('leaves a lone adjective in the given order', () => {
      expect(ourSigs('интересную')).toEqual(baseSigs('интересную'));
    });
    it('ruAgrees compares case, number, gender and animacy', () => {
      const adj = (morph: Record<string, string>): AnalysisCandidate => ({ lemma: 'x', pos: 'ADJ', morph, confidence: 0.9 });
      const noun = (morph: Record<string, string>): AnalysisCandidate => ({ lemma: 'y', pos: 'NOUN', morph, confidence: 0.9 });
      expect(ruAgrees(adj({ Case: 'Acc', Number: 'Sing', Gender: 'Fem' }), noun({ Case: 'Acc', Number: 'Sing', Gender: 'Fem' }))).toBe(true);
      expect(ruAgrees(adj({ Case: 'Acc', Number: 'Sing', Gender: 'Fem' }), noun({ Case: 'Nom', Number: 'Sing', Gender: 'Fem' }))).toBe(false);
      expect(ruAgrees(adj({ Case: 'Nom', Number: 'Sing', Gender: 'Masc' }), noun({ Case: 'Nom', Number: 'Sing', Gender: 'Fem' }))).toBe(false);
      expect(ruAgrees(adj({ Case: 'Acc', Number: 'Sing', Gender: 'Masc', Animacy: 'Inan' }), noun({ Case: 'Acc', Number: 'Sing', Gender: 'Masc', Animacy: 'Anim' }))).toBe(false);
      expect(ruAgrees(adj({ Case: 'Loc', Number: 'Sing', Gender: 'Masc' }), noun({ Case: 'Prep', Number: 'Sing', Gender: 'Masc' }))).toBe(true);
    });
  });

  describe('c. subject and verb', () => {
    it('reads «Она прочитала книгу» fully: perfective past feminine singular, partner читать, accusative object', () => {
      const v = first('Она прочитала книгу.', 'прочитала');
      expect(v).toMatchObject({ lemma: 'прочитать', pos: 'VERB' });
      expect(v.morph).toMatchObject({ Aspect: 'Perf', Tense: 'Past', Number: 'Sing', Gender: 'Fem', VerbForm: 'Fin' });
      expect(String(v.notes?.partners)).toMatch(/чита/);
      expect(first('Она прочитала книгу.', 'книгу').morph.Case).toBe('Acc');
      expect(first('Она прочитала книгу.', 'Она').morph.Case).toBe('Nom');
    });
    it('leaves a lone noun in the given order', () => {
      expect(ourSigs('Все.')).toEqual(baseSigs('Все.'));
    });
  });

  describe('d. numerals', () => {
    it('reads the noun after два in the genitive singular and after пять in the genitive plural', () => {
      expect(first('Прошло два года.', 'года').morph).toMatchObject({ Case: 'Gen', Number: 'Sing' });
      const lt = first('Прошло пять лет.', 'лет');
      expect(lt).toMatchObject({ lemma: 'год' });
      expect(lt.morph).toMatchObject({ Case: 'Gen', Number: 'Plur' });
    });
    it('after один the noun agrees (not the genitive)', () => {
      const m = first('Он прожил один год.', 'год').morph;
      expect(m.Number).toBe('Sing');
      expect(m.Case).toMatch(/Acc|Nom/);
    });
    it('leaves a bare noun form with no numeral in the given order', () => {
      expect(ourSigs('лет')).toEqual(baseSigs('лет'));
    });
  });

  describe('e. the genitive', () => {
    it('reads книги after нет as the genitive singular (genitive of negation)', () => {
      expect(first('У меня нет книги.', 'книги').morph).toMatchObject({ Case: 'Gen', Number: 'Sing' });
      expect(first('У меня нет книги.', 'меня').morph.Case).toMatch(/Gen/);
    });
    it('reads a genitive after a noun: книга брата', () => {
      expect(first('Книга брата лежит на столе.', 'брата').morph.Case).toMatch(/Gen/);
    });
    it('does not turn an accusative object into a genitive when no noun or negation precedes', () => {
      expect(first('Он купил красивый дом.', 'дом').morph.Case).toMatch(/Acc/);
    });
  });

  describe('f. verbs', () => {
    it('reads стали before an infinitive as the verb стать', () => {
      expect(first('Они стали читать.', 'стали')).toMatchObject({ lemma: 'стать', pos: 'VERB' });
      expect(first('Они стали читать.', 'читать').morph.VerbForm).toBe('Inf');
    });
    it('reads есть after хочу as the infinitive «to eat», and after у + genitive as быть', () => {
      const eat = first('Я хочу есть.', 'есть');
      expect(eat).toMatchObject({ lemma: 'есть', pos: 'VERB' });
      expect(eat.morph.VerbForm).toBe('Inf');
      expect(first('У меня есть книга.', 'есть').lemma).toBe('быть');
    });
    it('puts an imperative reading last beside an explicit subject of another person, and keeps the given order for ты', () => {
      const mood = (s: string, w: string): (string | undefined)[] => words(s).find((a) => a.token.surface === w)!.candidates.map((c) => c.morph.Mood);
      expect(mood('Он ешь хлеб.', 'ешь')[0]).not.toBe('Imp');
      expect(mood('Он ешь хлеб.', 'ешь')).toContain('Imp');
      // beside ты (the same person) the imperative is not demoted: its confidence stays as the dictionary gave it
      const imp = (a: AnalysisCandidate[]): number | undefined => a.find((c) => c.morph.Mood === 'Imp')?.confidence;
      expect(imp(words('Ты ешь хлеб.').find((a) => a.token.surface === 'ешь')!.candidates)).toBe(imp(ruWordCandidates(token('ешь'))));
      expect(imp(words('Он ешь хлеб.').find((a) => a.token.surface === 'ешь')!.candidates)).toBeLessThan(imp(ruWordCandidates(token('ешь')))!);
    });
    it('leaves a lone form that can be an infinitive or быть in the given order', () => {
      expect(ourSigs('Есть.')).toEqual(baseSigs('Есть.'));
    });
  });

  describe('g. words of several parts of speech', () => {
    it('что: the conjunction before a clause with its own subject, the pronoun at the start of a question', () => {
      expect(first('Он сказал, что он придёт.', 'что').pos).toBe('SCONJ');
      expect(first('Что случилось?', 'Что').pos).toBe('PRON');
    });
    it('это: the pronoun это in «это книга», the determiner этот in «это окно»', () => {
      expect(first('Это книга.', 'Это')).toMatchObject({ lemma: 'это', pos: 'PRON' });
      expect(first('Это окно открыто.', 'Это')).toMatchObject({ lemma: 'этот', pos: 'DET' });
    });
    it('все знают это vs он всё знает', () => {
      expect(first('Все знают это.', 'Все')).toMatchObject({ lemma: 'весь' });
      expect(first('Все знают это.', 'Все').morph.Number).toBe('Plur');
      expect(first('Он всё знает.', 'всё')).toMatchObject({ lemma: 'всё', pos: 'PRON' });
    });
    it('его: the possessive before a noun, the personal pronoun as an object', () => {
      expect(first('Это его книга.', 'его')).toMatchObject({ lemma: 'его' });
      expect(first('Я вижу его.', 'его')).toMatchObject({ lemma: 'он', pos: 'PRON' });
    });
    it('когда: a conjunction in a statement, an adverb in a question', () => {
      expect(first('Когда он пришёл, мы ушли.', 'Когда').pos).toBe('SCONJ');
      expect(first('Когда ты придёшь?', 'Когда').pos).toBe('ADV');
    });
    it('чтобы stays the conjunction in «Я хочу, чтобы ты пришёл»', () => {
      expect(first('Я хочу, чтобы ты пришёл.', 'чтобы').pos).toBe('SCONJ');
    });
  });


  describe('hard rules leave the word decided; soft rules keep today\'s behaviour', () => {
    const word = (s: string, w: string): AnalyzedToken => words(s).find((a) => a.token.surface === w)!;
    const status = (s: string, w: string): string => { const a = word(s, w); return statusOf(a.candidates[0], a.candidates); };
    const base = (w: string): AnalysisCandidate[] => ruWordCandidates(token(w));

    it('года after два: genitive singular first, high-confidence; the plural reading is lowered by 0.20 and says why', () => {
      const a = word('У меня есть два года и пять лет, но нет книги.', 'года');
      expect(a.candidates[0].morph).toMatchObject({ Case: 'Gen', Number: 'Sing' });
      expect(a.candidates[0].notes?.context).toMatch(/[Aa]fter два, три, четыре the noun is genitive singular/);
      const plural = a.candidates.find((c) => c.morph.Number === 'Plur')!;
      const was = base('года').find((c) => sig(c) === sig(plural))!;
      expect(plural.confidence).toBeCloseTo(Math.max(0.3, was.confidence - 0.2), 5);
      expect(plural.notes?.context).toMatch(/Set aside because after два/);
      expect(status('У меня есть два года и пять лет, но нет книги.', 'года')).toBe('high-confidence');
    });
    it('лет after пять: genitive plural of год, high-confidence', () => {
      const t = word('У меня есть два года и пять лет, но нет книги.', 'лет').candidates[0];
      expect(t).toMatchObject({ lemma: 'год' });
      expect(t.morph).toMatchObject({ Case: 'Gen', Number: 'Plur' });
      expect(status('У меня есть два года и пять лет, но нет книги.', 'лет')).toBe('high-confidence');
    });
    it('книги after нет: genitive singular, high-confidence', () => {
      expect(word('У меня есть два года и пять лет, но нет книги.', 'книги').candidates[0].morph).toMatchObject({ Case: 'Gen', Number: 'Sing' });
      expect(status('У меня есть два года и пять лет, но нет книги.', 'книги')).toBe('high-confidence');
      expect(status('У меня нет книги.', 'книги')).toBe('high-confidence');
    });
    it('в лесу, в году: the second locative comes first after в, and the dative reading is set aside by the government rule', () => {
      const s = 'В этом году он жил в лесу.';
      expect(first(s, 'лесу').morph.Case).toBe('Loc');
      expect(first(s, 'году').morph.Case).toBe('Loc');
      expect(status(s, 'лесу')).toBe('high-confidence');
      expect(status(s, 'году')).toBe('high-confidence');
      const dative = word(s, 'году').candidates.find((c) => /Dat/.test(c.morph.Case ?? ''))!;
      expect(dative.confidence).toBeLessThan(0.75);
      expect(dative.notes?.context).toMatch(/Set aside because .*(agree in case, number and gender|preposition «в»)/);
      // «этом» agrees with «году»: its Prep reading goes with a noun's Loc
      expect(first(s, 'этом').morph.Case).toMatch(/Prep|Loc/);
      expect(first(s, 'этом').lemma).toBe('этот');
    });
    it('an adjective + noun chain decided by agreement is high-confidence', () => {
      const s = 'Я читаю интересную книгу.';
      expect(status(s, 'интересную')).toBe('high-confidence');
      expect(status(s, 'книгу')).toBe('high-confidence');
      expect(status('В большом доме.', 'доме')).toBe('high-confidence');
      expect(first('В большом доме.', 'большом').morph.Case).toMatch(/Prep|Loc/);
    });
    it('GUARD: a preposition governs the next noun phrase only: a noun after a verb or after a comma is not lowered', () => {
      for (const s of ['Он в школе читает книги.', 'Он живёт в Москве, книги лежат дома.']) {
        const k = word(s, 'книги');
        const was = base('книги');
        for (const c of k.candidates) expect(c.confidence, s).toBe(was.find((x) => sig(x) === sig(c))!.confidence);
      }
    });
    it('GUARD: в / на + accusative and prepositional are both governed, so neither is lowered; only a reading in neither case is', () => {
      const tokens: RawToken[] = [token('в'), token('x')];
      const mk = (Case: string): AnalysisCandidate => ({ lemma: 'x', pos: 'NOUN', morph: { Case, Number: 'Sing', Gender: 'Masc' }, confidence: 0.9 });
      const adp: AnalysisCandidate = { lemma: 'в', pos: 'ADP', morph: {}, confidence: 0.9 };
      const out = orderRuSentence(tokens, [[adp], [mk('Acc'), mk('Prep'), mk('Nom'), mk('Dat')]]);
      const conf = (c: string): number => out[1].find((x) => x.morph.Case === c)!.confidence;
      expect(conf('Acc')).toBe(0.9);
      expect(conf('Prep')).toBe(0.9);
      expect(conf('Nom')).toBeCloseTo(0.7, 5);
      expect(conf('Dat')).toBeCloseTo(0.7, 5);
    });
    it('GUARD: a union the rule only narrows (меня Acc,Gen after у) is compatible and is not lowered', () => {
      const m = word('У меня нет книги.', 'меня').candidates;
      const was = base('меня');
      for (const c of m) expect(c.confidence).toBe(was.find((x) => sig(x) === sig(c))!.confidence);
    });
    it('GUARD: when no reading satisfies the rule, or the chain agrees in more than one way, nothing is lowered', () => {
      // «времени» after сколько has no genitive plural reading: the rule has nothing to prefer
      const was = base('времени');
      const got = words('Сколько времени?').find((a) => a.token.surface === 'времени')!.candidates;
      for (const c of got) expect(c.confidence).toBe(was.find((x) => sig(x) === sig(c))!.confidence);
      // two ways to agree (feminine nominative or accusative plural) stay preferences
      const tokens: RawToken[] = [token('a'), token('b')];
      const adj = (Case: string): AnalysisCandidate => ({ lemma: 'a', pos: 'ADJ', morph: { Case, Number: 'Plur' }, confidence: 0.9 });
      const noun = (Case: string): AnalysisCandidate => ({ lemma: 'b', pos: 'NOUN', morph: { Case, Number: 'Plur', Gender: 'Fem' }, confidence: 0.9 });
      const out = orderRuSentence(tokens, [[adj('Nom'), adj('Acc')], [noun('Nom'), noun('Acc')]]);
      for (const list of out) for (const c of list) expect(c.confidence).toBe(0.9);
    });
    it('a soft rule keeps today\'s behaviour: «что» as the conjunction does not lower the pronoun reading', () => {
      const a = word('Он сказал, что он придёт.', 'что');
      const was = base('что');
      for (const c of a.candidates) expect(c.confidence).toBe(was.find((x) => sig(x) === sig(c))!.confidence);
    });
    it('never raises a confidence, and never lowers below 0.30', () => {
      for (const s of SENTENCES) {
        const b = ruTokenize(s).filter((t) => t.isWord).map((t) => ruWordCandidates(t));
        words(s).forEach((a, i) => a.candidates.forEach((c) => {
          const was = b[i].find((x) => sig(x) === sig(c))!.confidence;
          expect(c.confidence).toBeLessThanOrEqual(was);
          if (c.confidence < was) expect(c.confidence).toBeGreaterThanOrEqual(Math.min(was, 0.3) - 0.11);
        }));
      }
    });
  });

  describe('the adapter entrances', () => {
    it('orderRuSentence takes the base readings given and returns the same lists reordered', () => {
      const toks = ruTokenize('Изделия из стали.');
      const base = toks.map((t) => (t.isWord ? ruWordCandidates(t) : []));
      const ordered = orderRuSentence(toks, base);
      expect(ordered).toHaveLength(toks.length);
      expect(ordered[2][0].lemma).toBe('сталь');
      expect(base[2][0].lemma).not.toBe('сталь'); // the input is not changed
    });
    it('ruRefine orders its own tokens again, and leaves tokens it must not touch alone', () => {
      const toks = ruTokenize('Изделия из стали.');
      const analyzed = ruAnalyze(toks);
      const own = new Set([RU_ANALYZER]);
      const out = ruRefine(toks, analyzed, own);
      expect(out.map((a) => a.candidates.map(sig))).toEqual(analyzed.map((a) => a.candidates.map(sig)));
      // a dictionary reading put on a token (given) stays as it is
      const given = new Set([2]);
      const kept = ruRefine(toks, analyzed.map((a, i) => (i === 2 ? { ...a, candidates: [...a.candidates].reverse() } : a)), own, given);
      expect(kept[2].candidates.map(sig)).toEqual([...analyzed[2].candidates].reverse().map(sig));
      // an author's span (another analyzer) is never touched
      const author = analyzed.map((a, i) => (i === 2 ? { ...a, analyzer: 'author', candidates: [...a.candidates].reverse() } : a));
      expect(ruRefine(toks, author, own)[2].candidates.map(sig)).toEqual([...analyzed[2].candidates].reverse().map(sig));
    });
    it('a hand-made token with no reading is passed through', () => {
      const toks = [token('xyz')];
      const out = ruAnalyze(toks);
      expect(out).toHaveLength(1);
    });
  });
});
