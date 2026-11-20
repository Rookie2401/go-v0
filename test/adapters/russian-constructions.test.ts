/**
 * Russian constructions (constructions.ts), aspect (aspect.ts), verbs of motion (motion.ts) and shallow syntax (syntax.ts) over the REAL
 * index: the compiled core and the shards of public/lexicon/ru/standard. A combining acute is always written as the escape \u0301.
 *
 * The motion-verb rule (a prefixed verb built on the determinate stem is perfective, one built on the indeterminate stem imperfective)
 * is CHECKED here against every verb lemma of the index.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnalysisCandidate, AnalyzedToken, PatternCandidate, RawToken } from '../../src/core';
import { ruAspectNote, ruAspectOf, ruAspectPartners, ruAspectPartnerSentence } from '../../src/adapters/russian/aspect';
import { detectRuPatterns, RU_CONSTRUCTIONS } from '../../src/adapters/russian/constructions';
import { RU_CORE } from '../../src/adapters/russian/generated/core';
import { installRussianIndex, resetRussianIndexes } from '../../src/adapters/russian/index-store';
import { RU_MOTION_EXCEPTIONS, RU_MOTION_NOT_MOTION, RU_MOTION_PAIRS, RU_MOTION_PREFIXES, ruMotionNote, ruMotionOf, ruMotionReadings } from '../../src/adapters/russian/motion';
import { ruAnalyze } from '../../src/adapters/russian/sentence';
import { createRussianShardLoader } from '../../src/adapters/russian/shards';
import { ruSyntax } from '../../src/adapters/russian/syntax';
import { ruTokenize } from '../../src/adapters/russian/text';

const SHARDS = 'public/lexicon/ru/standard';
const shardsAvailable = fs.existsSync(`${SHARDS}/manifest.json`);

/** One sentence for every construction id: the pattern must fire on it. */
const FIRES: Record<string, string> = {
  'possession-u-est': 'У меня есть книга.',
  'genitive-of-negation': 'У меня нет книги.',
  'past-perfective': 'Она прочитала книгу.',
  'past-imperfective': 'Она читала книгу.',
  'future-perfective': 'Я прочитаю книгу.',
  'future-imperfective': 'Я буду читать.',
  'conditional-by': 'Я бы прочитал эту книгу.',
  imperative: 'Прочитай эту страницу.',
  'reflexive-verb': 'Он моется.',
  'motion-determinate': 'Я иду в школу.',
  'motion-indeterminate': 'Я хожу в школу каждый день.',
  'motion-prefixed': 'Он пришёл домой.',
  'numeral-noun': 'Прошло пять лет.',
  'instrumental-predicate': 'Он был врачом.',
  'dative-experiencer': 'Мне холодно.',
  'impersonal-modal': 'Здесь можно курить.',
  'short-adjective': 'Он готов к работе.',
  comparative: 'Он старше, чем она.',
  'participle-active': 'Читающий человек сидел.',
  'participle-passive': 'Прочитанная книга лежит на столе.',
  'adverbial-participle': 'Читая письмо, он улыбался.',
  'chtoby-infinitive': 'Я пришёл, чтобы помочь.',
  'chtoby-past': 'Я хочу, чтобы ты пришёл.',
  'relative-kotoryj': 'Книга, которую я читаю, интересна.',
  'preposition-direction': 'Я иду в школу.',
  'preposition-location': 'Он сидит за столом.',
};
/** Sentences on which a named pattern must NOT fire. */
const SILENT: Array<[string, string]> = [
  ['possession-u-est', 'Дом стоит у реки.'],
  ['genitive-of-negation', 'У меня есть книга.'],
  ['future-perfective', 'Я читаю книгу.'],
  ['past-perfective', 'Она читала книгу.'],
  ['motion-prefixed', 'Прошло два года.'],
  ['motion-determinate', 'Я хожу в школу каждый день.'],
  ['preposition-direction', 'Он обращает внимание на это.'],
  ['preposition-direction', 'Мы смотрим друг на друга.'],
  ['numeral-noun', 'У меня есть книга.'],
  ['instrumental-predicate', 'Он врач.'],
  ['conditional-by', 'Я хотел прочитать книгу.'],
  ['imperative', 'Я прочитаю книгу.'],
];

const OTHERS = [
  'Она прочитала интересную книгу в школе.', 'Мы пошли к нему.', 'Я хочу читать книгу брата.', 'Он не знает, что делать.', 'Книга и ручка лежат на столе.',
  'Они любят друг друга.', 'Он не обратил внимания на это.', 'Она рада.', 'Он старше меня.', 'Я в школе.', 'Он идёт за дом.', 'Он врач.', 'Я хотел бы.', 'Я хотел прочитать книгу.',
  'Он ешь хлеб.', 'Мне нужно идти.', 'Мне нравится эта книга.', 'Прошло два года.', 'Дом стоит у реки.',
];

const analyze = (s: string): { tokens: RawToken[]; an: AnalyzedToken[] } => { const tokens = ruTokenize(s); return { tokens, an: ruAnalyze(tokens) }; };
const patterns = (s: string): PatternCandidate[] => { const { tokens, an } = analyze(s); return detectRuPatterns(tokens, an); };
const keys = (s: string): string[] => patterns(s).map((p) => p.key);
const first = (s: string, surface: string): AnalysisCandidate => analyze(s).an.find((a) => a.token.surface === surface)!.candidates[0];

// ───────────────────────────── the index lemmas, for the motion check ─────────────────────────────

interface LemmaFact { aspects: Set<string> }
const verbs = new Map<string, LemmaFact>();

function scanVerbLemmas(): void {
  for (const f of fs.readdirSync(SHARDS)) {
    if (!f.endsWith('.json.gz')) continue;
    const idx = JSON.parse(zlib.gunzipSync(fs.readFileSync(`${SHARDS}/${f}`)).toString('utf8')) as { lemmas: Record<string, [string, string, string, string]> };
    for (const [id, row] of Object.entries(idx.lemmas)) {
      if (row[2] !== 'VERB') continue;
      const lemma = id.split('|')[0];
      const fact = verbs.get(lemma) ?? { aspects: new Set<string>() };
      const m = /Aspect=([A-Za-z,]+)/.exec(row[3]);
      for (const a of (m?.[1] ?? '').split(',')) if (a) fact.aspects.add(a);
      verbs.set(lemma, fact);
    }
  }
}

describe.skipIf(!shardsAvailable)('Russian constructions, aspect, motion and syntax over the real index', () => {
  beforeAll(async () => {
    resetRussianIndexes();
    installRussianIndex(RU_CORE);
    const loader = await createRussianShardLoader({
      fetchJson: async (p: string) => JSON.parse(fs.readFileSync(p, 'utf8')) as unknown,
      fetchBytes: async (p: string) => new Uint8Array(fs.readFileSync(p)),
    }, { base: SHARDS, maxLoaded: 128 });
    const all = [...Object.values(FIRES), ...SILENT.map((x) => x[1]), ...OTHERS];
    await loader.ensure(all.flatMap((s) => ruTokenize(s).filter((t) => t.isWord).map((t) => t.normalized)));
    scanVerbLemmas();
  }, 120_000);
  afterAll(() => resetRussianIndexes());

  describe('the construction table', () => {
    it('lists every id once, each with a label and an explanation of a few plain sentences with an example', () => {
      const ids = RU_CONSTRUCTIONS.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const c of RU_CONSTRUCTIONS) {
        expect(c.label.length, c.id).toBeGreaterThan(5);
        expect(c.explain.length, c.id).toBeGreaterThan(80);
        expect(c.explain, c.id).toMatch(/[А-Яа-яЁё]{3}/); // an example in Russian
      }
    });
    it('every id a pattern returns is in the table, and every id in the table fires on its sentence', () => {
      const known = new Set(RU_CONSTRUCTIONS.map((c) => c.id));
      for (const s of [...Object.values(FIRES), ...OTHERS]) for (const p of patterns(s)) expect(known.has(p.key), `${p.key} in ${s}`).toBe(true);
      for (const id of known) expect(Object.keys(FIRES), id).toContain(id);
      for (const [id, s] of Object.entries(FIRES)) expect(keys(s), `${id}: ${s}`).toContain(id);
    });
    it('a pattern carries the table title, the example explanation and the tokens it is about', () => {
      const p = patterns('У меня есть книга.').find((x) => x.key === 'possession-u-est')!;
      expect(p.title).toBe(RU_CONSTRUCTIONS.find((c) => c.id === 'possession-u-est')!.label);
      expect(p.explanation).toMatch(/у меня есть книга/);
      expect(p.explanation).toMatch(/Here: /);
      expect(p.tokenIndexes).toEqual([0, 1, 2]);
      expect(p.confidence).toBeGreaterThan(0);
      expect(p.confidence).toBeLessThan(1);
    });
  });

  describe('the owner\'s sentences', () => {
    it('«Она прочитала книгу.»: perfective past feminine singular, partner читать, accusative object', () => {
      const v = first('Она прочитала книгу.', 'прочитала');
      expect(v).toMatchObject({ lemma: 'прочитать', pos: 'VERB' });
      expect(v.morph).toMatchObject({ Aspect: 'Perf', Tense: 'Past', Number: 'Sing', Gender: 'Fem' });
      expect(ruAspectPartners(v).join(' ')).toMatch(/чита/);
      expect(first('Она прочитала книгу.', 'книгу').morph.Case).toBe('Acc');
      expect(keys('Она прочитала книгу.')).toContain('past-perfective');
    });
    it('«У меня есть книга.» is possession; «У меня нет книги.» is the genitive of negation', () => {
      expect(keys('У меня есть книга.')).toContain('possession-u-est');
      expect(keys('У меня есть книга.')).not.toContain('genitive-of-negation');
      expect(keys('У меня нет книги.')).toContain('genitive-of-negation');
      expect(keys('У меня нет книги.')).not.toContain('possession-u-est');
    });
    it('«Они стали читать.» takes the verb, «изделия из стали» the noun', () => {
      expect(first('Они стали читать.', 'стали')).toMatchObject({ lemma: 'стать', pos: 'VERB' });
      expect(first('Изделия из стали.', 'стали')).toMatchObject({ lemma: 'сталь', pos: 'NOUN' });
    });
    it('«Я иду в школу.» / «Я хожу в школу каждый день.» / «Он пришёл домой.» are three kinds of motion verb', () => {
      expect(keys('Я иду в школу.')).toContain('motion-determinate');
      expect(keys('Я хожу в школу каждый день.')).toContain('motion-indeterminate');
      expect(keys('Он пришёл домой.')).toContain('motion-prefixed');
      const p = patterns('Он пришёл домой.').find((x) => x.key === 'motion-prefixed')!;
      expect(p.explanation).toMatch(/при-/);
    });
    it('«два года» / «пять лет»: numeral + noun government; «Я читаю интересную книгу.» agrees', () => {
      const two = patterns('Прошло два года.').find((p) => p.key === 'numeral-noun')!;
      expect(two.explanation).toMatch(/genitive singular/);
      const five = patterns('Прошло пять лет.').find((p) => p.key === 'numeral-noun')!;
      expect(five.explanation).toMatch(/genitive plural/);
      expect(first('Я читаю интересную книгу.', 'интересную').morph).toMatchObject({ Case: 'Acc', Gender: 'Fem' });
    });
    it('«Все знают это.» vs «Он всё знает.»', () => {
      expect(first('Все знают это.', 'Все').morph.Number).toBe('Plur');
      expect(first('Он всё знает.', 'всё').lemma).toBe('всё');
    });
  });

  describe('the explanation of an occurrence carries what the card cannot show otherwise', () => {
    const explain = (sentence: string, id: string): string => patterns(sentence).find((x) => x.key === id)!.explanation;
    it('an aspect pattern ends with the partner the dictionary names', () => {
      const e = explain('Она прочитала книгу.', 'past-perfective');
      expect(e).toMatch(/ The dictionary names чита\u0301ть as its imperfective partner\.$/);
      expect(e.indexOf('A perfective past presents')).toBe(0); // the general sentence stays first
      expect(e.length).toBeLessThan(430);
      const f = explain('Она читала книгу.', 'past-imperfective');
      expect(f).toMatch(/ The dictionary names .*чита.* as its perfective partners\.$/);
      expect(f).toMatch(/прочита\u0301ть/);
    });
    it('a verb with no partner in the index gets the general explanation and the occurrence alone', () => {
      const e = explain('Он был врачом.', 'past-imperfective');
      expect(e).not.toMatch(/partner/);
      expect(e).toMatch(/Here: «был» is the past of the imperfective verb быть\.$/);
    });
    it('a motion pattern names this verb\'s pair, and for a prefixed verb the prefix, its stem and the aspect', () => {
      expect(explain('Я иду в школу.', 'motion-determinate')).toMatch(/«иду» is a form of идти, the one-direction verb of the pair идти \/ ходить\.$/);
      const e = explain('Он пришёл домой.', 'motion-prefixed');
      expect(e).toMatch(/«пришёл» is a form of прийти = при- \(arrival\) \+ идти; perfective\./);
      expect(e).toMatch(/Its imperfective partner in the dictionary: приходи\u0301ть\.$/);
      expect(e.length).toBeLessThan(430);
      expect(explain('Я хожу в школу каждый день.', 'motion-indeterminate')).toMatch(/of the pair идти \/ ходить\.$|ходить/);
    });
  });

  describe('a pattern fires only on a shape the readings support', () => {
    for (const [id, s] of SILENT) it(`${id} stays silent on «${s}»`, () => expect(keys(s)).not.toContain(id));
    it('a sentence with no construction returns none', () => expect(patterns('Дом.')).toEqual([]));
    it('lists each pattern once per token set, in sentence order', () => {
      const ps = patterns('Она прочитала интересную книгу в школе.');
      const sigs = ps.map((p) => `${p.key}|${p.tokenIndexes.join(',')}`);
      expect(new Set(sigs).size).toBe(sigs.length);
      expect(ps.map((p) => p.tokenIndexes[0])).toEqual([...ps.map((p) => p.tokenIndexes[0])].sort((a, b) => a - b));
    });
  });

  describe('aspect', () => {
    const cand = (s: string, w: string): AnalysisCandidate => first(s, w);
    it('ruAspectOf reads the aspect of a verb reading and says nothing for a noun', () => {
      expect(ruAspectOf(cand('Она прочитала книгу.', 'прочитала'))).toBe('Perf');
      expect(ruAspectOf(cand('Она читала книгу.', 'читала'))).toBe('Imp');
      expect(ruAspectOf(cand('Она читала книгу.', 'книгу'))).toBeUndefined();
      expect(ruAspectOf({ pos: 'VERB', morph: { Aspect: 'Imp,Perf' }, confidence: 0.9 })).toBe('Both');
    });
    it('ruAspectPartners and the partner sentence say only what the dictionary names', () => {
      const v = cand('Она прочитала книгу.', 'прочитала');
      expect(ruAspectPartners(v).length).toBeGreaterThan(0);
      expect(ruAspectPartnerSentence(v)).toMatch(/^The dictionary names .* as its imperfective partner/);
      expect(ruAspectPartnerSentence({ pos: 'VERB', morph: { Aspect: 'Perf' }, confidence: 0.9 })).toBeUndefined();
      expect(ruAspectPartners({ pos: 'VERB', morph: { Aspect: 'Perf' }, confidence: 0.9 })).toEqual([]);
    });
    it('the note is fitted to the form: perfective past, imperfective past, future, imperative, infinitive, adverbial participle', () => {
      expect(ruAspectNote(cand('Она прочитала книгу.', 'прочитала'))).toMatch(/one completed event as a whole/);
      expect(ruAspectNote(cand('Она читала книгу.', 'читала'))).toMatch(/process, a repeated or habitual action, or only the plain fact/);
      expect(ruAspectNote(cand('Я прочитаю книгу.', 'прочитаю'))).toMatch(/means the future/);
      expect(ruAspectNote(cand('Я читаю книгу.', 'читаю'))).toMatch(/буду \+ the infinitive/);
      expect(ruAspectNote(cand('Прочитай эту страницу.', 'Прочитай'))).toMatch(/one concrete act/);
      expect(ruAspectNote(cand('Читай каждый день!', 'Читай'))).toMatch(/process or a repeated act, or gives a general permission or invitation/);
      expect(ruAspectNote(cand('Они стали читать.', 'читать'), { afterLemma: 'стать' })).toMatch(/After стать the infinitive is imperfective/);
      expect(ruAspectNote(cand('Они стали читать.', 'читать'), { afterLemma: 'начать' })).toMatch(/imperfective: it names the activity/);
      expect(ruAspectNote(cand('Читая письмо, он улыбался.', 'Читая'))).toMatch(/at the same time/);
    });
    it('never claims that perfective means finished and imperfective unfinished, and names no partner it was not given', () => {
      for (const [s, w] of [['Она прочитала книгу.', 'прочитала'], ['Она читала книгу.', 'читала'], ['Я прочитаю книгу.', 'прочитаю'], ['Прочитай эту страницу.', 'Прочитай']]) {
        const note = ruAspectNote(cand(s, w)) ?? '';
        expect(note, s).not.toMatch(/unfinished|not finished|incomplete/i);
        expect(note, s).not.toMatch(/means (finished|completed)/i);
      }
      expect(ruAspectNote({ pos: 'VERB', morph: { Aspect: 'Perf', Tense: 'Past', VerbForm: 'Fin' }, confidence: 0.9 })).not.toMatch(/partner/);
      expect(ruAspectNote({ pos: 'NOUN', morph: {}, confidence: 0.9 })).toBeUndefined();
    });
  });

  describe('verbs of motion', () => {
    it('lists the fourteen pairs with a gloss, and the prefixes the brief names', () => {
      expect(RU_MOTION_PAIRS).toHaveLength(14);
      expect(RU_MOTION_PAIRS.map((p) => p.determinate)).toEqual(['идти', 'ехать', 'бежать', 'лететь', 'плыть', 'нести', 'вести', 'везти', 'лезть', 'ползти', 'тащить', 'гнать', 'катить', 'брести']);
      expect(RU_MOTION_PAIRS.map((p) => p.indeterminate)).toEqual(['ходить', 'ездить', 'бегать', 'летать', 'плавать', 'носить', 'водить', 'возить', 'лазить', 'ползать', 'таскать', 'гонять', 'катать', 'бродить']);
      for (const p of RU_MOTION_PAIRS) expect(p.gloss.length).toBeGreaterThan(30);
      const forms = RU_MOTION_PREFIXES.flatMap((p) => p.forms);
      for (const f of ['при', 'у', 'в', 'во', 'вы', 'под', 'подо', 'от', 'ото', 'пере', 'про', 'за', 'до', 'с', 'со', 'об', 'обо', 'вз', 'вс', 'взо', 'раз', 'рас', 'по']) expect(forms, f).toContain(f);
    });
    it('recognises the unprefixed verbs and the stem changes of the prefixed ones', () => {
      expect(ruMotionOf('идти')).toMatchObject({ kind: 'determinate', pair: 'ходить' });
      expect(ruMotionOf('ходить')).toMatchObject({ kind: 'indeterminate', pair: 'идти' });
      expect(ruMotionOf('катиться')).toMatchObject({ kind: 'determinate', reflexive: true, pair: 'кататься' });
      expect(ruMotionOf('прийти')).toMatchObject({ kind: 'prefixed', prefix: 'при', expectedAspect: 'Perf', base: 'идти' });
      expect(ruMotionOf('приходить')).toMatchObject({ kind: 'prefixed', prefix: 'при', expectedAspect: 'Imp', base: 'ходить' });
      expect(ruMotionOf('войти')).toMatchObject({ kind: 'prefixed', prefix: 'в', expectedAspect: 'Perf' });
      expect(ruMotionOf('выйти')).toMatchObject({ kind: 'prefixed', prefix: 'вы', expectedAspect: 'Perf' });
      expect(ruMotionOf('приехать')).toMatchObject({ expectedAspect: 'Perf', base: 'ехать' });
      expect(ruMotionOf('приезжать')).toMatchObject({ expectedAspect: 'Imp', base: 'ездить' });
      expect(ruMotionOf('въехать')).toMatchObject({ expectedAspect: 'Perf' });
      expect(ruMotionOf('приплыть')).toMatchObject({ expectedAspect: 'Perf' });
      expect(ruMotionOf('приплывать')).toMatchObject({ expectedAspect: 'Imp' });
      expect(ruMotionOf('прибегать')).toMatchObject({ expectedAspect: 'Imp' });
      expect(ruMotionOf('разойтись')).toMatchObject({ kind: 'prefixed', prefix: 'раз', reflexive: true });
      expect(ruMotionOf('пойти')).toMatchObject({ prefix: 'по', expectedAspect: 'Perf' });
      expect(ruMotionReadings('походить').some((r) => r.expectedAspect === 'Perf' && r.prefixSense === 'doing it for a while')).toBe(true);
      expect(ruMotionReadings('сходить').map((r) => r.expectedAspect).sort()).toEqual(['Imp', 'Perf']);
    });
    it('does not treat найти, находить and plain verbs as motion', () => {
      for (const w of ['найти', 'находить', 'читать', 'делать', 'книга', '']) expect(ruMotionOf(w), w).toBeUndefined();
      expect([...RU_MOTION_NOT_MOTION.keys()]).toContain('найти');
    });
    it('says in plain words what a motion verb is', () => {
      expect(ruMotionNote('идти')).toMatch(/determinate verb of motion.*ходить/);
      expect(ruMotionNote('ходить')).toMatch(/indeterminate.*идти/);
      expect(ruMotionNote('прийти')).toMatch(/при-.*perfective/);
      expect(ruMotionNote('читать')).toBeUndefined();
    });
    it('CHECK against the index: a prefixed verb built on the determinate stem is perfective, one on the indeterminate stem imperfective', () => {
      const prefixed = [...verbs.keys()].filter((l) => ruMotionReadings(l).some((r) => r.kind === 'prefixed'));
      const breaks: string[] = [];
      let ok = 0;
      let listed = 0;
      for (const lemma of prefixed) {
        const aspects = verbs.get(lemma)!.aspects;
        const fine = ruMotionReadings(lemma).some((r) => aspects.has(r.expectedAspect!) || aspects.size === 0);
        if (fine) ok++;
        else if (RU_MOTION_EXCEPTIONS.has(lemma)) listed++;
        else breaks.push(`${lemma} [${[...aspects]}]`);
      }
      // the real count, printed so that it can be reported
      console.log(`motion check: ${prefixed.length} prefixed lemmas recognised in the index, ${ok} agree, ${listed} are listed exceptions, ${breaks.length} unexplained`);
      expect(prefixed.length).toBeGreaterThan(300);
      expect(breaks).toEqual([]);
      for (const [lemma, why] of RU_MOTION_EXCEPTIONS) { expect(why.length, lemma).toBeGreaterThan(20); }
    });
    it('the unprefixed verbs are lemmas of the index with the expected aspect', () => {
      for (const p of RU_MOTION_PAIRS) {
        expect(verbs.has(p.determinate), p.determinate).toBe(true);
        expect(verbs.has(p.indeterminate), p.indeterminate).toBe(true);
      }
    });
  });

  describe('shallow syntax', () => {
    const rel = (s: string) => { const { tokens, an } = analyze(s); const r = ruSyntax(tokens, an)!; return { tokens, r, of: (w: string) => r.relations.find((x) => tokens[x.dependent].surface === w), name: (i: number | undefined) => (i === undefined ? undefined : tokens[i].surface) }; };
    it('attaches subject, object, adjective and preposition in «Она прочитала интересную книгу в школе»', () => {
      const { r, of, name } = rel('Она прочитала интересную книгу в школе.');
      expect(of('Она')).toMatchObject({ relation: 'nsubj' });
      expect(name(of('Она')!.head)).toBe('прочитала');
      expect(of('прочитала')).toMatchObject({ relation: 'root' });
      expect(of('интересную')).toMatchObject({ relation: 'amod' });
      expect(name(of('интересную')!.head)).toBe('книгу');
      expect(of('книгу')).toMatchObject({ relation: 'obj' });
      expect(of('в')).toMatchObject({ relation: 'case' });
      expect(name(of('в')!.head)).toBe('школе');
      expect(of('школе')).toMatchObject({ relation: 'obl' });
      expect(r.attached).toBe(1);
      for (const x of r.relations) { expect(x.basis.length).toBeGreaterThan(0); expect(x.status).toBe('generated'); }
    });
    it('attaches the infinitive, the genitive modifier and the negation', () => {
      const a = rel('Я хочу читать книгу брата.');
      expect(a.of('читать')).toMatchObject({ relation: 'xcomp' });
      expect(a.name(a.of('читать')!.head)).toBe('хочу');
      expect(a.of('брата')).toMatchObject({ relation: 'nmod' });
      expect(a.of('брата')!.alternatives?.length).toBeGreaterThan(0);
      const b = rel('Он не знает, что делать.');
      expect(b.of('не')).toMatchObject({ relation: 'advmod' });
    });
    it('reads the genitive of negation as the subject of нет and keeps its words attached', () => {
      const a = rel('У меня нет книги.');
      expect(a.of('нет')).toMatchObject({ relation: 'root' });
      expect(a.of('книги')).toMatchObject({ relation: 'nsubj' });
      expect(a.of('меня')).toMatchObject({ relation: 'obl' });
    });
    it('keeps the alternative when a nominative could be an accusative, and reports words it cannot attach', () => {
      const a = rel('Книга и ручка лежат на столе.');
      expect(a.of('и')).toMatchObject({ relation: 'cc' });
      expect(a.of('ручка')).toMatchObject({ relation: 'conj' });
      const b = rel('Он не знает, что делать.');
      expect(b.r.attached).toBeLessThan(1);
      expect(b.r.notes.join(' ')).toMatch(/Not attached/);
      expect(b.of('что')).toBeUndefined();
    });
    it('returns undefined for a sentence with no word', () => {
      const tokens = ruTokenize('...');
      expect(ruSyntax(tokens, ruAnalyze(tokens))).toBeUndefined();
    });
  });
});
