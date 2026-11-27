/**
 * Confident misreadings of the Russian analyser found by the deck audit (2026-11-26), over the REAL index. Each rule has the audit's shape
 * (a sentence of the kind), other sentences of the same shape, and a counter-example it must leave alone.
 *
 *  1. A word right after its subject that has an agreeing finite verb reading IS that verb (сел is not село, "village").
 *  2. A form that is only genitive, right after an accusative-taking verb, beside a homograph that can be the object (душ is not a form of душа).
 *  3. A plural-only headword written as such beside a commoner lemma with the same case and number (очки, очко): the counts do not decide, so
 *     the two readings stay within 0.15 of each other.
 *
 * MACHINE-DRAFTED rules; not reviewed by a native speaker.
 */
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnalysisCandidate, AnalyzedToken } from '../../src/core';
import { RU_CORE } from '../../src/adapters/russian/generated/core';
import { installRussianIndex, resetRussianIndexes } from '../../src/adapters/russian/index-store';
import { ruAnalyze } from '../../src/adapters/russian/sentence';
import { createRussianShardLoader } from '../../src/adapters/russian/shards';
import { ruTokenize } from '../../src/adapters/russian/text';

const SHARDS = 'public/lexicon/ru/standard';
const shardsAvailable = fs.existsSync(`${SHARDS}/manifest.json`);

const SUBJECT_SHAPE = [
  'Он сел в трамвай, достал книгу и сразу забыл обо всём.', 'Мальчик сел на стул.', 'Она не села рядом с нами.', 'Мы сели за стол.', 'Дети сели в автобус.',
  'Она уже спала, когда я пришёл.', 'Девочка долго мыла руки.',
];
const OBJECT_SHAPE = [
  'Правила бассейна требуют, чтобы перед входом все принимали душ.', 'Каждое утро он принимает душ.', 'Мы всегда принимаем душ перед сном.',
  'Они ждали души умерших.', 'Он ждёт душ.',
];
const SLOT_SHAPE = ['Перед началом работы все сотрудники обязаны надеть защитные очки.', 'Он потерял очки.', 'Очки лежат на столе.'];
const COUNTER = ['Сайт банка работает.', 'Запах мыла был сильным.', 'Цвет стали был серым.', 'Они ждали дождя.'];

const words = (s: string): AnalyzedToken[] => ruAnalyze(ruTokenize(s)).filter((a) => a.token.isWord);
const cands = (s: string, surface: string): AnalysisCandidate[] => {
  const a = words(s).find((x) => x.token.surface.toLowerCase() === surface);
  if (!a) throw new Error(`no ${surface} in ${s}`);
  return a.candidates;
};
const conf = (s: string, surface: string, lemma: string): number | undefined => cands(s, surface).find((c) => c.lemma === lemma)?.confidence;

describe.skipIf(!shardsAvailable)('Russian misreadings the deck audit found', () => {
  beforeAll(async () => {
    resetRussianIndexes();
    installRussianIndex(RU_CORE);
    const loader = await createRussianShardLoader({
      fetchJson: async (p: string) => JSON.parse(fs.readFileSync(p, 'utf8')) as unknown,
      fetchBytes: async (p: string) => new Uint8Array(fs.readFileSync(p)),
    }, { base: SHARDS, maxLoaded: 256 });
    await loader.ensure([...SUBJECT_SHAPE, ...OBJECT_SHAPE, ...SLOT_SHAPE, ...COUNTER].flatMap((s) => ruTokenize(s).filter((t) => t.isWord).map((t) => t.normalized)));
  }, 60_000);
  afterAll(() => resetRussianIndexes());

  describe('1. the word after its subject is the verb that agrees with it', () => {
    it('сел after он / мальчик / мы / дети is сесть, confidently, and село is set aside', () => {
      for (const s of [SUBJECT_SHAPE[0], SUBJECT_SHAPE[1], SUBJECT_SHAPE[3], SUBJECT_SHAPE[4]]) {
        const c = cands(s, s.includes('сели') ? 'сели' : 'сел');
        expect(c[0].lemma, s).toBe('сесть');
        const village = c.find((x) => x.lemma === 'село');
        if (village) expect(c[0].confidence - village.confidence, s).toBeGreaterThanOrEqual(0.15);
      }
    });
    it('села after она + не is сесть', () => {
      expect(cands(SUBJECT_SHAPE[2], 'села')[0].lemma).toBe('сесть');
    });
    it('мыла after девочка (gender agrees) is the past of мыть, not the genitive of мыло', () => {
      expect(cands(SUBJECT_SHAPE[6], 'мыла')[0].lemma).toBe('мыть');
    });
    it('спала after она is a verb; the two verbs спать / спасть stay within 0.15 (the sentence does not decide)', () => {
      const c = cands(SUBJECT_SHAPE[5], 'спала');
      expect(c.every((x) => x.pos === 'VERB')).toBe(true);
      const sleep = conf(SUBJECT_SHAPE[5], 'спала', 'спать');
      const abate = conf(SUBJECT_SHAPE[5], 'спала', 'спасть');
      expect(Math.abs((sleep ?? 0) - (abate ?? 1))).toBeLessThan(0.15);
    });
    it('counter-example: a genitive after a noun with no agreeing verb reading is left alone (запах мыла, цвет стали)', () => {
      expect(cands(COUNTER[1], 'мыла')[0].lemma).toBe('мыло');
      expect(cands(COUNTER[2], 'стали')[0].lemma).toBe('сталь');
    });
  });

  describe('2. a genitive-only form after an accusative-taking verb gives way to an object homograph', () => {
    it('душ after принимали / принимает / принимаем is душ (the shower), confidently', () => {
      for (const s of OBJECT_SHAPE.slice(0, 3)) {
        const c = cands(s, 'душ');
        expect(c[0].lemma, s).toBe('душ');
        const soul = c.find((x) => x.lemma === 'душа');
        if (soul) expect(c[0].confidence - soul.confidence, s).toBeGreaterThanOrEqual(0.15);
      }
    });
    it('counter-example: after a verb of genitive government (ждать) душ stays душа', () => {
      expect(cands(OBJECT_SHAPE[4], 'душ')[0].lemma).toBe('душа');
    });
    it('counter-example: a form that has no object homograph is untouched (ждали души умерших)', () => {
      expect(cands(OBJECT_SHAPE[3], 'души')[0].lemma).toBe('душа');
    });
    it('counter-example: банка after a noun is still the genitive of банк', () => {
      expect(cands(COUNTER[0], 'банка')[0].lemma).toBe('банк');
      expect(conf(COUNTER[0], 'банка', 'банк')! - (conf(COUNTER[0], 'банка', 'банка') ?? 0)).toBeGreaterThanOrEqual(0.15);
    });
  });

  describe('3. plural-only headword beside a commoner lemma in the same slot', () => {
    it('очки (glasses) and очко (point) stay within 0.15, so neither is a confident reading', () => {
      for (const s of SLOT_SHAPE) {
        const glasses = conf(s, 'очки', 'очки');
        const point = conf(s, 'очки', 'очко');
        expect(glasses, s).toBeDefined();
        expect(point, s).toBeDefined();
        expect(Math.abs((glasses as number) - (point as number)), s).toBeLessThan(0.15);
      }
    });
  });
});
