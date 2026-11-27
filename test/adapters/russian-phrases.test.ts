/**
 * Russian fixed expressions (src/adapters/russian/phrases.ts). The SOURCE RULE is checked against the built dictionary on disk
 * (public/dict/ru): every expression that is not a frame must be a headword there, with the dictionary's own gloss. The detector is
 * run over the real index (compiled core + shards). A combining acute is always written as the escape ́.
 */
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnalyzedToken, PhraseCandidate, RawToken } from '../../src/core';
import { RU_CORE } from '../../src/adapters/russian/generated/core';
import { installRussianIndex, resetRussianIndexes } from '../../src/adapters/russian/index-store';
import { detectRuPhrases, RU_PHRASES } from '../../src/adapters/russian/phrases';
import { ruAnalyze } from '../../src/adapters/russian/sentence';
import { createRussianShardLoader } from '../../src/adapters/russian/shards';
import { ruTokenize } from '../../src/adapters/russian/text';

const SHARDS = 'public/lexicon/ru/standard';
const DICT = 'public/dict/ru';
const shardsAvailable = fs.existsSync(`${SHARDS}/manifest.json`);
const dictAvailable = fs.existsSync(`${DICT}/manifest.json`);

interface DictEntry { p?: string; g?: string | string[]; s?: Array<{ g?: string }>; m?: unknown }

/** The dictionary's entries for a headword (the key is the lower-cased spelling), forms of other words left out. */
function dictEntries(head: string, shards: Map<string, Record<string, DictEntry[]>>): DictEntry[] {
  for (const shard of shards.values()) { const e = shard[head]; if (e) return e.filter((x) => !x.m); }
  return [];
}
const glossOf = (e: DictEntry): string => (typeof e.g === 'string' ? e.g : Array.isArray(e.g) ? e.g[0] : e.s?.[0]?.g ?? '');
const flat = (g: string): string => g.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').replace(/ ,/g, ',').trim();

const run = (s: string): { tokens: RawToken[]; an: AnalyzedToken[]; found: PhraseCandidate[] } => {
  const tokens = ruTokenize(s);
  const an = ruAnalyze(tokens);
  return { tokens, an, found: detectRuPhrases(tokens, an) };
};
const shown = (s: string): string[] => { const { found } = run(s); return found.map((f) => f.display); };

const SENTENCES = [
  'Он пришёл, потому что хотел.', 'Несмотря на дождь, мы пошли.', 'В течение года.', 'Это было в течении реки.', 'Я имею в виду другое.', 'Он обращает внимание на это.',
  'Он не обратил внимания на это.', 'Они любят друг друга.', 'Мы смотрим друг на друга.', 'Они помогают друг другу.', 'У меня есть книга.', 'У моего брата есть машина.',
  'У меня нет книги.', 'Меня зовут Иван.', 'До свидания!', 'Может быть, он придёт.', 'Он живёт здесь до сих пор.', 'На самом деле это не так.', 'Я не знаю, как дела.',
  'Всё равно я пойду.', 'Он ведёт себя хорошо.', 'Ему пришла в голову мысль.', 'Спокойной ночи.', 'Добрый день!', 'Мы пошли, как только он пришёл.',
  'Мы ждали, пока не пришёл автобус.', 'Они уехали, так что мы остались.', 'Он говорит, как будто ничего не случилось.', 'Книга, в том числе эта.',
];

describe('the list of expressions', () => {
  it('has at least 80 expressions, each with a text, a part of speech, a gloss and a kind', () => {
    expect(RU_PHRASES.length).toBeGreaterThanOrEqual(80);
    for (const e of RU_PHRASES) {
      expect(e.text.length).toBeGreaterThan(3);
      expect(e.gloss.length, e.text).toBeGreaterThan(1);
      expect(['collocation', 'formula', 'idiom', 'frame', 'construction']).toContain(e.kind);
    }
    expect(new Set(RU_PHRASES.map((e) => e.text)).size).toBe(RU_PHRASES.length);
  });
  it('lists the expressions the brief names', () => {
    const texts = new Set(RU_PHRASES.map((e) => e.text));
    for (const t of ['потому что', 'так как', 'несмотря на', 'в течение', 'друг друга', 'иметь в виду', 'обращать внимание', 'так что', 'как будто', 'до сих пор', 'всё равно',
      'на самом деле', 'в конце концов', 'может быть', 'должно быть', 'как раз', 'только что', 'пока не', 'как только', 'с тех пор', 'по крайней мере', 'тем не менее',
      'кроме того', 'во время', 'по сравнению с', 'с удовольствием', 'до свидания', 'добрый день', 'доброе утро', 'спокойной ночи', 'как дела', 'то есть']) expect(texts.has(t), t).toBe(true);
  });
  it('marks the frames with a slot: у … есть, у … нет, меня зовут …', () => {
    const frames = RU_PHRASES.filter((e) => e.kind === 'frame').map((e) => e.text).sort();
    expect(frames).toEqual(['меня зовут …', 'у … есть', 'у … нет']);
    expect(RU_PHRASES.filter((e) => e.notHeadword).map((e) => e.text).sort()).toEqual(['у … есть', 'у … нет']);
  });
});

describe.skipIf(!dictAvailable)('source rule: every expression that is not a frame is a headword of the built dictionary', () => {
  const shards = new Map<string, Record<string, DictEntry[]>>();
  beforeAll(() => {
    for (const f of fs.readdirSync(DICT)) if (/^s-.*\.json$/.test(f)) shards.set(f, JSON.parse(fs.readFileSync(`${DICT}/${f}`, 'utf8')) as Record<string, DictEntry[]>);
  }, 180_000); // 1,024 shard files, 70 MB of JSON: slow when the whole suite runs beside it
  it('is a headword with the same part of speech, and the gloss is the dictionary\'s own', () => {
    const missing: string[] = [];
    const wrongGloss: string[] = [];
    let checked = 0;
    for (const e of RU_PHRASES) {
      if (e.kind === 'frame') continue;
      const entries = dictEntries(e.text, shards);
      const same = entries.filter((x) => x.p === e.pos);
      if (!same.length) { missing.push(`${e.text} (${e.pos})`); continue; }
      checked++;
      const ours = flat(e.gloss);
      if (!same.some((x) => flat(glossOf(x)).startsWith(ours.slice(0, Math.min(ours.length, 20))))) wrongGloss.push(`${e.text}: «${e.gloss}»`);
    }
    console.log(`phrases: ${RU_PHRASES.length} listed, ${checked} are headwords of public/dict/ru with the dictionary's own gloss, ${RU_PHRASES.filter((e) => e.kind === 'frame').length} frames`);
    expect(missing).toEqual([]);
    expect(wrongGloss).toEqual([]);
  });
  it('the frames that are not headwords have no dictionary entry; меня зовут does', () => {
    expect(dictEntries('у … есть', shards)).toEqual([]);
    expect(dictEntries('меня зовут', shards).length).toBeGreaterThan(0);
  });
});

describe.skipIf(!shardsAvailable)('detectRuPhrases over the real index', () => {
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

  it('finds a compound function word and keeps the readings of its words untouched', () => {
    const tokens = ruTokenize('Он пришёл, потому что хотел.');
    const an = ruAnalyze(tokens);
    const before = JSON.stringify(an);
    const found = detectRuPhrases(tokens, an);
    expect(JSON.stringify(an)).toBe(before);
    const p = found.find((f) => f.display === 'потому что')!;
    expect(p).toBeDefined();
    expect(p.tokenIndexes.map((i) => tokens[i].surface)).toEqual(['потому', 'что']);
    expect(p.gloss).toBe('because');
    expect(p.kind).toBe('collocation');
    expect(an[p.tokenIndexes[0]].candidates.length).toBeGreaterThan(0);
  });
  it('matches the very words: в течение, but not в течении (a different word)', () => {
    expect(shown('В течение года.')).toContain('в течение');
    expect(shown('Это было в течении реки.')).not.toContain('в течение');
    expect(shown('Несмотря на дождь, мы пошли.')).toContain('несмотря на');
  });
  it('matches a verb phrase through the verb\'s lemma: иметь в виду, обращать внимание, вести себя', () => {
    expect(shown('Я имею в виду другое.')).toContain('иметь в виду');
    expect(shown('Он обращает внимание на это.')).toContain('обращать внимание');
    expect(shown('Он не обратил внимания на это.')).toContain('обращать внимание');
    expect(shown('Он ведёт себя хорошо.')).toContain('вести себя');
  });
  it('друг друга in all its case forms, also with a preposition between', () => {
    expect(shown('Они любят друг друга.')).toContain('друг друга');
    expect(shown('Они помогают друг другу.')).toContain('друг друга');
    const p = run('Мы смотрим друг на друга.');
    const f = p.found.find((x) => x.display === 'друг друга')!;
    expect(f).toBeDefined();
    expect(f.tokenIndexes.map((i) => p.tokens[i].surface)).toEqual(['друг', 'друга']);
  });
  it('the frames: у … есть / нет with a slot (also a two-word owner), меня зовут …', () => {
    expect(shown('У меня есть книга.')).toContain('у … есть');
    const p = run('У моего брата есть машина.');
    expect(p.found.find((x) => x.display === 'у … есть')!.tokenIndexes.map((i) => p.tokens[i].surface)).toEqual(['У', 'моего', 'брата', 'есть']);
    expect(shown('У меня нет книги.')).toContain('у … нет');
    expect(shown('У меня нет книги.')).not.toContain('у … есть');
    const z = run('Меня зовут Иван.');
    const f = z.found.find((x) => x.display === 'меня зовут …')!;
    expect(f.kind).toBe('frame');
    expect(f.pattern).toEqual(['меня', 'зовут', '_']);
    expect(f.confidence).toBeLessThan(0.9);
  });
  it('formulas and adverbial idioms are found with their kinds', () => {
    expect(run('До свидания!').found[0]).toMatchObject({ display: 'до свидания', kind: 'formula' });
    expect(shown('Спокойной ночи.')).toContain('спокойной ночи');
    expect(shown('Добрый день!')).toContain('добрый день');
    for (const [s, p] of [['Может быть, он придёт.', 'может быть'], ['Он живёт здесь до сих пор.', 'до сих пор'], ['На самом деле это не так.', 'на самом деле'], ['Всё равно я пойду.', 'всё равно'],
      ['Мы пошли, как только он пришёл.', 'как только'], ['Они уехали, так что мы остались.', 'так что'], ['Книга, в том числе эта.', 'в том числе']]) expect(shown(s), s).toContain(p);
  });
  it('finds nothing in a sentence that has no fixed expression', () => {
    expect(shown('Она читает книгу.')).toEqual([]);
  });
  it('every phrase has token indexes in sentence order and a confidence below 1', () => {
    for (const s of SENTENCES) for (const f of run(s).found) {
      expect(f.tokenIndexes).toEqual([...f.tokenIndexes].sort((a, b) => a - b));
      expect(f.confidence).toBeLessThan(1);
      expect(f.confidence).toBeGreaterThanOrEqual(0.5);
    }
  });
});
