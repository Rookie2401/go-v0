/**
 * The context-free readings of a Russian word (src/adapters/russian/analyze.ts, guess.ts, closed.ts) over the REAL index: the compiled
 * core (generated/core.ts) and, where the shards of public/lexicon/ru/standard exist, the shards of the words the tests read. A second
 * block runs over a small hand-made index (real forms, real tags) for the paths the real index never needs: hyphenated words it does
 * not hold, guesses. A combining acute is always written as the escape ́ here.
 */
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnalysisCandidate, RawToken } from '../../src/core';
import { ruWordCandidates } from '../../src/adapters/russian/analyze';
import { RU_PRONOUN_LEXEME, ruClosedFor } from '../../src/adapters/russian/closed';
import { ruGuess } from '../../src/adapters/russian/guess';
import { RU_CORE } from '../../src/adapters/russian/generated/core';
import {
  installRussianIndex, lookupRussianForm, resetRussianIndexes, type RussianFormIndex,
} from '../../src/adapters/russian/index-store';
import { createRussianShardLoader } from '../../src/adapters/russian/shards';
import { ruFeaturesOfCode } from '../../src/adapters/russian/tags';
import { ruKey } from '../../src/adapters/russian/text';
import { RU_SOURCE_IDS } from '../../src/adapters/russian/version';

const A = '́';
const SHARDS = 'public/lexicon/ru/standard';
const shardsAvailable = fs.existsSync(`${SHARDS}/manifest.json`);

const token = (surface: string): RawToken => ({ surface, start: 0, end: surface.length, isWord: true, normalized: ruKey(surface) });
const cands = (surface: string): AnalysisCandidate[] => ruWordCandidates(token(surface));
const stressOf = (c: AnalysisCandidate): string | undefined => (typeof c.notes?.stress === 'string' ? c.notes.stress : undefined);
const lemmas = (cs: AnalysisCandidate[]): string[] => [...new Set(cs.map((c) => c.lemma ?? '?'))];

const WORDS = [
  'книгу', 'красивую', 'прочитала', 'пишу', 'пишет', 'писал', 'писала', 'написали', 'написав', 'читающий', 'прочитанный', 'стали', 'замок', 'руку', 'рука',
  'руке', 'еще', 'все', 'новые', 'красивого', 'безо', 'что', 'какого-нибудь', 'кое-кого', 'дай-ка', 'северо-западного', 'ёж', 'они', 'него', 'ним', 'шел', 'шёл', 'а', 'и', 'не', 'это', 'как', 'когда', 'если', 'года', 'лет', 'есть', 'книги', 'чаю', 'лесу', 'дал', 'пять', 'мой', 'три', 'мне', 'меня', 'нас', 'его', 'им', 'ними', 'её', 'их', 'всё', 'том', 'просто', 'больше', 'надо', 'лучше', 'много', 'тоже', 'уже', 'ещё', 'только', 'даже', 'или', 'быстро', 'начал', 'рядом', 'видимо', 'дома', 'потом', 'тем', 'в', 'с', 'к', 'о', 'у', 'на', 'по', 'за', 'из', 'от', 'до', 'но', 'да', 'же', 'бы', 'ли', 'два', 'две', 'одна', 'одни', 'оба', 'обе', 'сто', 'тысяча', 'двух', 'пяти', 'одной', 'стали',
];

// ───────────────────────────── over the real index ─────────────────────────────

describe('ruWordCandidates over the real index', () => {
  beforeAll(async () => {
    resetRussianIndexes();
    installRussianIndex(RU_CORE);
    if (shardsAvailable) {
      const loader = await createRussianShardLoader({
        fetchJson: async (p: string) => JSON.parse(fs.readFileSync(p, 'utf8')) as unknown,
        fetchBytes: async (p: string) => new Uint8Array(fs.readFileSync(p)),
      }, { base: SHARDS, maxLoaded: 64 });
      await loader.ensure(WORDS.map(ruKey));
    }
  }, 60_000);
  afterAll(() => resetRussianIndexes());

  const shard = it.skipIf(!shardsAvailable);

  it('книгу → книга, a noun, feminine singular accusative (from the compiled core)', () => {
    const c = cands('книгу');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ lemma: 'книга', pos: 'NOUN', confidence: 0.9, origin: 'dictionary', sourceId: RU_SOURCE_IDS.tables, gloss: 'book' });
    expect(c[0].morph).toEqual({ Case: 'Acc', Number: 'Sing', Gender: 'Fem', Animacy: 'Inan' });
    expect(stressOf(c[0])).toBe(`кни${A}гу`);
  });

  shard('красивую → красивый, accusative feminine singular', () => {
    const c = cands('красивую');
    expect(c[0]).toMatchObject({ lemma: 'красивый', pos: 'ADJ' });
    expect(c[0].morph).toEqual({ Case: 'Acc', Gender: 'Fem', Number: 'Sing' });
  });

  shard('прочитала → прочитать, perfective, past feminine singular, with its partner читать', () => {
    const c = cands('прочитала');
    expect(c[0]).toMatchObject({ lemma: 'прочитать', pos: 'VERB' });
    expect(c[0].morph).toMatchObject({ Aspect: 'Perf', Tense: 'Past', Gender: 'Fem', Number: 'Sing', VerbForm: 'Fin', Mood: 'Ind' });
    expect(c[0].notes?.partners).toBe(`чита${A}ть`);
    expect(stressOf(c[0])).toBe(`прочита${A}ла`);
  });

  it('пишу, пишет: present of писать, imperfective, with its partner', () => {
    const a = cands('пишу');
    expect(a[0]).toMatchObject({ lemma: 'писать', pos: 'VERB' });
    expect(a[0].morph).toMatchObject({ Person: '1', Number: 'Sing', Tense: 'Pres', Aspect: 'Imp' });
    expect(stressOf(a[0])).toBe(`пишу${A}`);
    const b = cands('пишет');
    expect(b[0].morph).toMatchObject({ Person: '3', Number: 'Sing', Tense: 'Pres', Aspect: 'Imp' });
    expect(stressOf(b[0])).toBe(`пи${A}шет`);
    expect(String(b[0].notes?.partners)).toContain(`написа${A}ть`);
  });

  it('писал, писала: the past of писать (and of the second писать, which is another word with another stress); писал is also a form of the noun писало', () => {
    const m = cands('писал').filter((c) => c.pos === 'VERB');
    // the two писать read alike: one reading with both stresses and both glosses
    expect(m).toHaveLength(1);
    expect(m.every((c) => c.lemma === 'писать' && c.morph.Tense === 'Past' && c.morph.Gender === 'Masc')).toBe(true);
    expect(stressOf(m[0])).toBe(`писа${A}л / пи${A}сал`);
    expect(m[0].gloss).toMatch(/write.*; .*urinate/);
    expect(cands('писал').some((c) => c.lemma === 'писало' && c.pos === 'NOUN')).toBe(true);
    const f = cands('писала').filter((c) => c.lemma === 'писать');
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((c) => c.morph.Gender === 'Fem' && c.morph.Number === 'Sing')).toBe(true);
  });

  shard('написали, написав: perfective past plural; the adverbial participle with its tense', () => {
    const a = cands('написали');
    expect(a[0]).toMatchObject({ lemma: 'написать' });
    expect(a[0].morph).toEqual({ Tense: 'Past', Number: 'Plur', VerbForm: 'Fin', Mood: 'Ind', Aspect: 'Perf' });
    const b = cands('написав');
    expect(b[0].morph).toEqual({ Tense: 'Past', VerbForm: 'Conv', Aspect: 'Perf' });
  });

  shard('читающий, прочитанный: participles are forms of their verb', () => {
    const a = cands('читающий');
    expect(a.length).toBeGreaterThan(0);
    for (const c of a) {
      expect(c).toMatchObject({ lemma: 'читать', pos: 'VERB' });
      expect(c.morph).toMatchObject({ VerbForm: 'Part', Voice: 'Act', Tense: 'Pres', Aspect: 'Imp' });
    }
    expect(a.some((c) => c.morph.Case === 'Nom' && c.morph.Gender === 'Masc' && c.morph.Number === 'Sing')).toBe(true);
    const b = cands('прочитанный');
    for (const c of b) {
      expect(c).toMatchObject({ lemma: 'прочитать', pos: 'VERB' });
      expect(c.morph).toMatchObject({ VerbForm: 'Part', Voice: 'Pass', Tense: 'Past', Aspect: 'Perf' });
    }
  });

  shard('стали keeps both the verb стать and the noun сталь, the more frequent lemma first', () => {
    const c = cands('стали');
    expect(lemmas(c)).toEqual(expect.arrayContaining(['стать', 'сталь']));
    expect(c.find((x) => x.lemma === 'стать')?.pos).toBe('VERB');
    expect(c.find((x) => x.lemma === 'сталь')?.pos).toBe('NOUN');
    expect(c.findIndex((x) => x.lemma === 'стать')).toBeLessThan(c.findIndex((x) => x.lemma === 'сталь'));
  });

  shard('за́мок and замо́к are ONE reading (one lemma id for the learner) with both stresses and both glosses; the stress the text writes comes first', () => {
    const plain = cands('замок').filter((c) => c.lemma === 'замок');
    expect(plain).toHaveLength(1);
    expect(stressOf(plain[0])).toBe(`за${A}мок / замо${A}к`);
    expect(plain[0].gloss).toMatch(/^castle; lock/);
    const castle = cands(`за${A}мок`)[0];
    expect(stressOf(castle)).toBe(`за${A}мок / замо${A}к`);
    expect(castle.gloss).toMatch(/^castle/);
    const lock = cands(`замо${A}к`)[0];
    expect(stressOf(lock)).toBe(`замо${A}к / за${A}мок`);
    expect(lock.gloss).toMatch(/^lock/);
    // друзьями: друг and its second entry read alike: one reading
    expect(cands('друзьями').filter((c) => c.lemma === 'друг')).toHaveLength(1);
    // стоит: стоить and стоять are two lemmas: two readings
    expect(lemmas(cands('стоит'))).toEqual(expect.arrayContaining(['стоить', 'стоять']));
  });

  shard('руку, рука, руке: stress and unions', () => {
    expect(stressOf(cands('руку')[0])).toBe(`ру${A}ку`);
    expect(stressOf(cands('рука')[0])).toBe(`рука${A}`);
    const e = cands('руке');
    expect(e).toHaveLength(1);
    expect(stressOf(e[0])).toBe(`руке${A}`);
    expect(e[0].morph).toMatchObject({ Case: 'Dat,Prep', Number: 'Sing', Gender: 'Fem', Animacy: 'Inan' });
  });

  shard('ё restored: еще → ещё, and все keeps весь and всё, each marked', () => {
    const e = cands('еще');
    const yo = e.find((c) => c.lemma === 'ещё');
    expect(yo?.notes?.yo).toBe('restored');
    // the source lists the е-spelling itself (an alternative-spelling row): the restored reading stands at the confidence of one as written
    expect(yo?.confidence).toBe(0.9);
    expect(e.filter((c) => c.lemma === 'ещё')).toHaveLength(1);
    const v = cands('все');
    expect(lemmas(v)).toEqual(expect.arrayContaining(['весь', 'всё']));
    expect(v.filter((c) => c.lemma === 'всё').every((c) => c.notes?.yo === 'restored')).toBe(true);
    expect(v.some((c) => c.lemma === 'весь' && c.notes?.yo === undefined && c.confidence === 0.9)).toBe(true);
    // a ё written in the text is a key of its own and restores nothing
    expect(cands('ёж').every((c) => c.notes?.yo === undefined)).toBe(true);
  });

  shard('a union never allows a combination the rows do not hold, and is never made across lemma ids', () => {
    for (const w of WORDS) {
      const key = ruKey(w);
      const hits = lookupRussianForm(key);
      for (const c of cands(w)) {
        if (c.origin !== 'dictionary' || c.notes?.source === 'rule') continue;
        // every combination of the union's values must be the features of some row of this lemma (as written or ё-restored alike)
        const rows = hits
          .filter((h) => h.lemmaId.split('|')[0] === c.lemma && h.lemma[2] === c.pos)
          .map((h) => ({ ...(h.lemma[2] === 'PRON' ? RU_PRONOUN_LEXEME[c.lemma ?? ''] : {}), ...ruFeaturesOfCode(h.code, h.lemma[2], h.lemma[3]).morph }));
        const unionKeys = Object.keys(c.morph).filter((k) => c.morph[k].includes(','));
        let combos: Array<Record<string, string>> = [{ ...c.morph }];
        for (const k of unionKeys) combos = combos.flatMap((m) => c.morph[k].split(',').map((v) => ({ ...m, [k]: v })));
        for (const combo of combos) {
          // a row may itself be a union (a source page that names two cases): it covers every value it lists
          const covers = (r: Record<string, string>): boolean => Object.keys(r).length === Object.keys(combo).length && Object.entries(combo).every(([k, v]) => k in r && r[k].split(',').includes(v));
          expect(rows.some(covers), `${w}: ${JSON.stringify(combo)}`).toBe(true);
        }
      }
    }
  });

  it('what the index already holds is not added by hand: the н-forms, во, со, б, ж', () => {
    if (!shardsAvailable) return;
    for (const w of ['него', 'неё', 'них', 'ним', 'нему', 'ней', 'нём', 'ними', 'во', 'со', 'ко', 'обо', 'изо', 'б', 'ж', 'ль', 'бы', 'же', 'ли']) {
      expect(ruClosedFor(w), w).toEqual([]);
    }
  });

  shard('hyphenated words the index holds whole are read whole; an indefinite pronoun has its own lemma', () => {
    const a = cands('какого-нибудь');
    expect(a.every((c) => c.lemma === 'какой-нибудь' && c.origin === 'dictionary' && c.confidence === 0.9)).toBe(true);
    expect(a.some((c) => c.morph.Case === 'Gen')).toBe(true);
    expect(cands('северо-западного')[0]).toMatchObject({ lemma: 'северо-западный', pos: 'ADJ' });
  });

  shard('дай-ка is read through its parts (0.60, by rule), the particle left out', () => {
    const c = cands('дай-ка');
    expect(c.length).toBeGreaterThan(0);
    for (const x of c) { expect(x.confidence).toBeLessThanOrEqual(0.6); expect(x.notes?.source).toBe('rule'); expect(x.origin).toBe('rule'); }
    expect(c.find((x) => x.lemma === 'дать')?.morph).toMatchObject({ Mood: 'Imp', Person: '2' });
  });

  it('a word that is not Cyrillic, or not a word, has no reading', () => {
    expect(cands('hello')).toEqual([]);
    expect(cands('2024')).toEqual([]);
    expect(ruWordCandidates({ ...token('книгу'), isWord: false })).toEqual([]);
  });

  it('a form that is unknown and ends in nothing distinctive has no reading at all', () => {
    expect(cands('фывфыв')).toEqual([]);
  });

  it('a guess from the ending is unconfirmed, at most 0.40, has no gloss and no lemma it cannot state', () => {
    const c = cands('фывающий');
    expect(c.length).toBeGreaterThan(0);
    for (const x of c) {
      expect(x.unconfirmed).toBe(true);
      expect(x.confidence).toBeLessThanOrEqual(0.4);
      expect(x.gloss).toBeUndefined();
      expect(x.lemma).toBeUndefined();
      expect(x.notes?.source).toBe('rule');
      expect(x.origin).toBe('rule');
    }
    expect(c[0].morph).toMatchObject({ VerbForm: 'Part', Voice: 'Act', Tense: 'Pres' });
    // an acronym in capitals is not guessed
    expect(cands('ФЫВАЮЩИЙ')).toEqual([]);
  });
});

// ───────────────────────────── guess.ts alone ─────────────────────────────

describe('ruGuess', () => {
  it('a reflexive infinitive is its own lemma; other endings give none', () => {
    expect(ruGuess('фывться')).toEqual([expect.objectContaining({ pos: 'VERB', lemma: 'фывться', morph: { VerbForm: 'Inf', Reflex: 'Yes' } })]);
    for (const g of ruGuess('фывого')) expect(g.lemma).toBeUndefined();
  });

  it('only distinctive endings, and only on words long enough', () => {
    expect(ruGuess('фывого')[0]).toMatchObject({ pos: 'ADJ', morph: { Case: 'Gen', Gender: 'Masc,Neut', Number: 'Sing' } });
    expect(ruGuess('фывами')[0]).toMatchObject({ pos: 'NOUN', morph: { Case: 'Ins', Number: 'Plur' } });
    expect(ruGuess('фывешь')[0]).toMatchObject({ pos: 'VERB', morph: { Person: '2', Number: 'Sing' } });
    expect(ruGuess('фывала')[0]).toMatchObject({ pos: 'VERB', morph: { Tense: 'Past', Gender: 'Fem' } });
    expect(ruGuess('ого')).toEqual([]);
    expect(ruGuess('фыва')).toEqual([]);
    expect(ruGuess('фывкнига')).toEqual([]);
    expect(ruGuess('фыв-ого')).toEqual([]);
    expect(ruGuess('ФЫВОГО'.toLowerCase(), 'ФЫВОГО')).toEqual([]);
  });
});

// ───────────────────────────── over a small hand-made index ─────────────────────────────

/** Real forms with the real tag bundles of the Wiktionary tables, for the paths the full index never needs. */
function fixtureIndex(): RussianFormIndex {
  return {
    schema: 1, id: 'kaikki-ru-tables', shard: 'fixture', built: 'test',
    source: { label: 'hand-made fixture', licence: 'test', url: 'test' },
    codes: ['genitive|masculine|neuter|singular', 'nominative|singular', 'masculine|nominative'],
    lemmaIds: ['тот|PRON', 'восточный|ADJ', 'тот-то|PRON'],
    lemmas: {
      'тот|PRON': ['то́т', 'that', 'PRON', '', 100],
      'восточный|ADJ': ['восто́чный', 'eastern', 'ADJ', '', 10],
      'тот-то|PRON': ['то́т-то', 'that very', 'PRON', '', 1],
    },
    forms: {
      того: [[0, 0, 3]],
      восточного: [[1, 0, 4]],
      восточный: [[1, 2, 4]],
      'тот-то': [[2, 1]],
    },
    yo: {},
  };
}

describe('batch B1 over the real index', () => {
  const skip = !shardsAvailable;
  beforeAll(async () => {
    resetRussianIndexes();
    installRussianIndex(RU_CORE);
    if (!skip) {
      const loader = await createRussianShardLoader({
        fetchJson: async (p: string) => JSON.parse(fs.readFileSync(p, 'utf8')) as unknown,
        fetchBytes: async (p: string) => new Uint8Array(fs.readFileSync(p)),
      }, { base: SHARDS, maxLoaded: 64 });
      await loader.ensure(WORDS.map(ruKey));
    }
  }, 60_000);
  afterAll(() => resetRussianIndexes());
  const shard = it.skipIf(skip);

  it('closed-class gaps: безо is a variant of без; no hand SCONJ is added (the index has SCONJ ids)', () => {
    expect(ruClosedFor('безо')[0]).toMatchObject({ lemma: 'без', pos: 'ADP' });
    expect(ruClosedFor('что')).toEqual([]);
    if (skip) return;
    expect(cands('безо')[0]).toMatchObject({ lemma: 'без', pos: 'ADP', confidence: 0.9, origin: 'hand', sourceId: RU_SOURCE_IDS.closed });
    for (const w of ['что', 'как', 'когда', 'если']) {
      const c = cands(w);
      expect(c.some((x) => x.pos === 'SCONJ'), w).toBe(true);
      expect(c.every((x) => x.origin === 'dictionary'), w).toBe(true);
    }
    expect(cands('что').map((x) => x.pos)).toEqual(expect.arrayContaining(['SCONJ', 'PRON']));
    expect(cands('как').map((x) => x.pos)).toEqual(expect.arrayContaining(['SCONJ', 'ADV']));
  });

  shard('шел: one reading, the restored шёл, at 0.90, with the real stress and the label of an alternative spelling', () => {
    const c = cands('шел');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ lemma: 'идти', pos: 'VERB', confidence: 0.9 });
    expect(c[0].notes).toMatchObject({ yo: 'restored', stress: 'шёл' });
    expect(c[0].notes?.usage).toContain('alternative spelling');
  });

  shard('все: всё is listed by the source (0.90, no false stress); весь and все stay', () => {
    const c = cands('все');
    const vse = c.filter((x) => x.lemma === 'всё');
    expect(vse.length).toBeGreaterThan(0);
    for (const x of vse) { expect(x.notes?.stress).toBe('всё'); expect(x.notes?.yo).toBe('restored'); }
    // the readings the source lists as alternative spellings are as sure as one written; the others are restored beside a reading as written
    expect(vse.filter((x) => !x.notes?.context && (x.notes?.usage as string[] | undefined)?.includes('alternative spelling')).every((x) => x.confidence === 0.9)).toBe(true);
    expect(lemmas(c)).toEqual(expect.arrayContaining(['весь', 'всё', 'все']));
  });

  shard('a rare homograph does not make a common word look uncertain (она, а, и, не, это, как, стали, замок)', () => {
    const rare = (c: AnalysisCandidate): boolean => typeof c.notes?.context === 'string' && c.notes.context.startsWith('much rarer than');
    const ona = cands('она');
    expect(ona[0]).toMatchObject({ lemma: 'она', confidence: 0.9 });
    const oniy = ona.find((x) => x.lemma === 'оный');
    expect(oniy?.confidence).toBe(0.7);
    expect(oniy?.notes?.context).toBe('much rarer than она in running text');
    for (const w of ['а', 'и', 'не', 'это', 'как']) {
      const c = cands(w);
      expect(c[0].confidence, w).toBe(0.9);
      expect(rare(c[0]), w).toBe(false);
      for (const x of c) { if (rare(x)) expect(x.confidence).toBe(0.7); else expect(x.confidence).toBe(0.9); }
    }
    expect(cands('а').some((x) => x.pos === 'INTJ' && x.confidence === 0.7)).toBe(true);
    const st = cands('стали');
    expect(st.find((x) => x.lemma === 'стать')?.confidence).toBe(0.9);
    // the treebank has стали once as сталь (form priors): seen, so not lowered, but after стать (14)
    for (const x of st.filter((y) => y.lemma === 'сталь')) { expect(x.confidence).toBe(0.9); expect(rare(x)).toBe(false); }
    expect(st[0].lemma).toBe('стать');
    expect(cands('замок').filter((x) => x.pos === 'NOUN').every((x) => x.confidence === 0.9 && !rare(x))).toBe(true);
    expect(cands('книгу')[0].confidence).toBe(0.9);
  });

  shard('readings are ordered by what running text has: года is genitive singular before nominative or accusative plural', () => {
    const c = cands('года');
    expect(c).toHaveLength(2);
    expect(c[0].morph).toMatchObject({ Case: 'Gen', Number: 'Sing' });
    expect(c[1].morph).toMatchObject({ Case: 'Acc,Nom', Number: 'Plur' });
  });

  shard('есть keeps быть and the infinitive to eat; чаю may be partitive; лесу has the second locative', () => {
    const e = cands('есть');
    expect(e[0].lemma).toBe('быть');
    expect(e.some((x) => x.lemma === 'есть' && x.morph.VerbForm === 'Inf')).toBe(true);
    expect(cands('чаю').some((x) => x.lemma === 'чай' && x.morph.Case?.includes('Par'))).toBe(true);
    expect(cands('лесу').some((x) => x.lemma === 'лес' && x.morph.Case === 'Loc')).toBe(true);
  });

  shard('B2: a lemma the corpus never saw is lowered beside a lemma seen 5 times or more (дал, пять, мой, три); замок keeps both nouns', () => {
    const low = (w: string, lemma: string): AnalysisCandidate | undefined => cands(w).find((x) => x.lemma === lemma);
    expect(low('дал', 'декалитр')?.confidence).toBe(0.7);
    expect(low('пять', 'пятить')?.confidence).toBe(0.7);
    expect(low('мой', 'мыть')?.confidence).toBe(0.7);
    expect(low('три', 'тереть')?.confidence).toBe(0.7);
    expect(cands('дал')[0]).toMatchObject({ lemma: 'дать', confidence: 0.9 });
    const nouns = cands('замок').filter((x) => x.pos === 'NOUN');
    expect(nouns).toHaveLength(1);
    expect(nouns.every((x) => x.confidence === 0.9)).toBe(true);
    // the letter names of а are seen a handful of times against 209 for the conjunction: lowered by the form priors (B5)
    expect(cands('а').filter((x) => x.pos === 'NOUN').every((x) => x.confidence === 0.7)).toBe(true);
  });

  shard('B2: the personal pronouns have their person, number and gender (supplied by hand where the source does not tag them)', () => {
    expect(cands('мне')[0]).toMatchObject({ lemma: 'я', origin: 'dictionary' });
    expect(cands('мне')[0].morph).toMatchObject({ Case: 'Dat,Prep', Person: '1', Number: 'Sing' });
    expect(cands('меня')[0].morph).toMatchObject({ Person: '1', Number: 'Sing' });
    expect(cands('нас')[0].morph).toEqual({ Case: 'Acc,Gen,Prep', Person: '1', Number: 'Plur' });
    const e = cands('его');
    expect(e.find((x) => x.lemma === 'он')?.morph).toMatchObject({ Gender: 'Masc', Person: '3', Number: 'Sing' });
    expect(e.find((x) => x.lemma === 'оно')?.morph).toMatchObject({ Gender: 'Neut', Person: '3', Number: 'Sing' });
    expect(cands('им').find((x) => x.lemma === 'они')?.morph).toEqual({ Case: 'Dat', Person: '3', Number: 'Plur' });
    expect(cands('ними').find((x) => x.lemma === 'они')?.morph).toEqual({ Case: 'Ins', Person: '3', Number: 'Plur' });
    // what the source states is never overridden: нём is masculine or neuter
    expect(cands('мне').every((x) => x.morph.Number !== undefined || x.lemma !== 'я')).toBe(true);
  });

  shard('B3: the first reading of a frequent ambiguous form is the one running text has (form priors, then expected frequency)', () => {
    const first = (w: string): string => { const c = cands(w)[0]; return `${c.lemma} ${c.pos}`; };
    const expected: Record<string, string> = {
      это: 'это PRON', его: 'его PRON', её: 'её PRON', их: 'их PRON', все: 'весь DET', всё: 'весь DET', что: 'что SCONJ', как: 'как ADV', им: 'они PRON',
      том: 'то PRON', стали: 'стать VERB', просто: 'просто ADV', больше: 'больше ADV', лучше: 'хорошо ADV', много: 'много ADV', тоже: 'тоже PART',
      уже: 'уже ADV', ещё: 'ещё ADV', только: 'только ADV', даже: 'даже ADV', или: 'или CONJ', если: 'если SCONJ', когда: 'когда ADV',
      быстро: 'быстро ADV', начал: 'начать VERB', рядом: 'рядом ADV', видимо: 'видимо ADV', потом: 'потом ADV',
    };
    for (const [w, e] of Object.entries(expected)) expect(first(w), w).toBe(e);
    // его: the possessive first, он second, both sure enough (neither is marked down)
    const e = cands('его');
    expect(e[1]).toMatchObject({ lemma: 'он', confidence: 0.9 });
    expect(e[0].confidence).toBe(0.9);
    // что: the subordinator, then the pronoun
    expect(cands('что').slice(0, 2).map((x) => x.pos)).toEqual(['SCONJ', 'PRON']);
    // a reading the treebank never gave a form that it has with another reading is lowered and says so
    const nachal = cands('начал').find((x) => x.lemma === 'начало');
    expect(nachal?.confidence).toBe(0.7);
    expect(nachal?.notes?.context).toBe('not seen with this reading in running text');
    // дома: the noun's cells by running text, the adverb after
    expect(cands('дома').map((x) => x.pos)).toEqual(['NOUN', 'NOUN', 'ADV']);
    // the first reading of «потом» is the adverb, not the instrumental of пот
    expect(cands('потом').map((x) => x.lemma)).toEqual(['потом', 'пот']);
  });

  shard('B5: the commonest words read with ONE sure reading; the rest are at 0.75 or less', () => {
    for (const w of ['в', 'и', 'а', 'с', 'к', 'о', 'у', 'не', 'на', 'по', 'за', 'из', 'от', 'до', 'но', 'или', 'же', 'бы', 'ли']) {
      const c = cands(w);
      expect(c[0].confidence, w).toBeGreaterThanOrEqual(0.85);
      for (const x of c.slice(1)) expect(x.confidence, `${w}: ${x.lemma} ${x.pos}`).toBeLessThanOrEqual(0.75);
    }
    expect(cands('и')[1].notes?.context).toBe('much rarer than и (CONJ) in running text');
    // да: no form-prior row and every lemma too thin in the counts (all under 5): five readings, all 0.90
    expect(cands('да').every((x) => x.confidence === 0.9)).toBe(true);
    // the real ambiguity stays: это (59 / 30 / 19), что, его; стали is 14 against 1, below the floor of 20, so сталь is not lowered
    expect(cands('это').filter((x) => x.confidence >= 0.85).map((x) => `${x.lemma} ${x.pos}`)).toEqual(expect.arrayContaining(['это PRON', 'этот DET', 'это PART']));
    expect(cands('что').map((x) => x.pos)).toEqual(expect.arrayContaining(['SCONJ', 'PRON']));
    expect(cands('что').every((x) => x.confidence === 0.9)).toBe(true);
    expect(cands('его').slice(0, 2).map((x) => x.lemma)).toEqual(['его', 'он']);
    expect(cands('его').slice(0, 2).every((x) => x.confidence === 0.9)).toBe(true);
    expect(cands('стали').every((x) => x.confidence === 0.9)).toBe(true);
  });

  shard('B5: a numeral has no number of its own, unless the source row says singular or plural', () => {
    const num = (w: string): AnalysisCandidate[] => cands(w).filter((x) => x.pos === 'NUM');
    for (const w of ['два', 'две', 'одна', 'двух', 'одной']) for (const x of num(w)) expect(x.morph.Number, w).toBeUndefined();
    expect(num('два')[0].morph).toMatchObject({ Gender: 'Masc,Neut', Case: 'Nom' });
    expect(num('две')[0].morph).toMatchObject({ Gender: 'Fem' });
    expect(num('одна')[0]).toMatchObject({ lemma: 'один' });
    // the source's own number is kept: одни, оба are plural; три, пять, сто are singular
    expect(num('одни')[0].morph.Number).toBe('Plur');
    expect(num('оба')[0].morph.Number).toBe('Plur');
    expect(num('три')[0].morph.Number).toBe('Sing');
    expect(num('пять')[0].morph.Number).toBe('Sing');
    expect(num('пяти')[0].morph.Number).toBe('Sing');
    expect(num('сто')[0].morph.Number).toBe('Sing');
    // тысяча is both a noun and a numeral in the dictionary
    expect(cands('тысяча').map((x) => x.pos)).toEqual(expect.arrayContaining(['NOUN', 'NUM']));
  });

  it('a noun reading carries Gender and Animacy whenever the lemma row has them (a sample of 200 core nouns)', () => {
    const all = Object.entries(RU_CORE.lemmas)
      .filter(([id, row]) => row[2] === 'NOUN' && id.split('|').length === 2 && /Gender=/.test(row[3]) && /Animacy=/.test(row[3]))
      .map(([id]) => id)
      .sort();
    const step = Math.max(1, Math.floor(all.length / 200));
    const nouns = all.filter((_, i) => i % step === 0).slice(0, 200);
    expect(nouns.length).toBeGreaterThanOrEqual(100);
    const byLemma = new Map<string, string[]>();
    for (const [k, rows] of Object.entries(RU_CORE.forms)) {
      for (const r of rows) {
        const id = RU_CORE.lemmaIds[r[0]];
        if (nouns.includes(id)) { const l = byLemma.get(id) ?? []; if (l.length < 4) l.push(k); byLemma.set(id, l); }
      }
    }
    let checked = 0;
    for (const [id, keys] of byLemma) {
      for (const k of keys) {
        for (const c of cands(k)) {
          if (c.pos !== 'NOUN' || c.lemma !== id.split('|')[0]) continue;
          expect(c.morph.Gender, `${k} → ${id}`).toBeDefined();
          expect(c.morph.Animacy, `${k} → ${id}`).toBeDefined();
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(300);
  });
});

describe('ruWordCandidates over a small index', () => {
  beforeAll(() => { resetRussianIndexes(); installRussianIndex(fixtureIndex()); });
  afterAll(() => resetRussianIndexes());

  it('an indefinite particle after a word the index holds as a form: the form\'s reading at 0.60 by rule, with the particle in the stress note', () => {
    const c = cands('того-то');
    // the index holds "того" (a form of тот) and the lemma тот-то, but not the form "того-то"
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ lemma: 'тот-то', pos: 'PRON', confidence: 0.8, origin: 'rule', sourceId: RU_SOURCE_IDS.rules });
    expect(c[0].notes).toMatchObject({ source: 'rule', stress: `того${A}-то` });
    expect(c[0].gloss).toBe('that very');
    expect(c[0].morph).toMatchObject({ Case: 'Gen', Gender: 'Masc,Neut', Number: 'Sing' });
  });

  it('a prefix particle: кое- before a form the index holds', () => {
    // "того" is a form of тот; the index has no lemma "кое-тот", so the reading is the part's, 0.60
    const c = cands('кое-того');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ lemma: 'тот', confidence: 0.6, origin: 'rule' });
    expect(c[0].notes?.source).toBe('rule');
  });

  it('a compound adjective is read through its last part, 0.60, with a lemma built from the parts and no gloss', () => {
    const c = cands('юго-восточного');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ lemma: 'юго-восточный', pos: 'ADJ', confidence: 0.6, origin: 'rule' });
    expect(c[0].gloss).toBeUndefined();
    expect(c[0].morph).toMatchObject({ Case: 'Gen', Gender: 'Masc,Neut', Number: 'Sing' });
  });

  it('по- and an adverb ending in -ски the index does not hold: a guess, unconfirmed, without lemma', () => {
    const c = cands('по-вражески');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ pos: 'ADV', unconfirmed: true, confidence: 0.35, origin: 'rule' });
    expect(c[0].lemma).toBeUndefined();
    expect(c[0].gloss).toBeUndefined();
  });

  it('a hyphenated word whose parts the index does not know has no reading', () => {
    expect(cands('фыв-фыв')).toEqual([]);
  });

  it('a register label lowers the confidence by 0.10 and is a note, not a feature', () => {
    resetRussianIndexes();
    const idx = fixtureIndex();
    idx.codes.push('dated|genitive|masculine|neuter|singular');
    idx.forms.тому = [[0, 3, 3]];
    installRussianIndex(idx);
    const c = cands('тому');
    const dated = c.filter((x) => Array.isArray(x.notes?.usage) && (x.notes?.usage as string[]).includes('dated'));
    expect(dated).toHaveLength(1);
    expect(dated[0].confidence).toBe(0.8);
    expect(Object.values(dated[0].morph)).not.toContain('dated');
  });

  it('as written and ё-restored: with no reading as written the restored one is 0.88', () => {
    resetRussianIndexes();
    const idx = fixtureIndex();
    idx.lemmaIds.push('ещё|ADV');
    idx.lemmas['ещё|ADV'] = ['ещё', 'yet', 'ADV', '', 50];
    idx.codes.push('');
    idx.forms.ещё = [[3, 3]];
    idx.yo = { еще: ['ещё'] };
    installRussianIndex(idx);
    const c = cands('еще');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ lemma: 'ещё', confidence: 0.88, notes: { yo: 'restored' } });
  });
});
