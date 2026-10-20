import { describe, expect, it } from 'vitest';
import { createMemoryStore, ids } from '../../../src/core';
import type { AppStore, LanguageAdapter, LanguageCode, LearnerItemState, LearnerLevel, Token } from '../../../src/core';
import { deAdapter } from '../../../src/adapters/de';
import { esAdapter } from '../../../src/adapters/es';
import { thAdapter } from '../../../src/adapters/th';
import { buildWordIndex, predict } from '../../../src/gotell/predict';
import type { WordIndex } from '../../../src/gotell/predict';

/** Hand-built corpus: each text is a list of sentences; tokens come from the real adapter. */
async function seedTexts(store: AppStore, adapter: LanguageAdapter, texts: Record<string, string[]>): Promise<void> {
  const rows: Token[] = [];
  for (const [textId, sentences] of Object.entries(texts)) {
    sentences.forEach((text, si) => {
      const sentenceId = `${textId}/s${si}`;
      adapter.tokenize(text).forEach((t, index) => {
        rows.push({
          id: ids.token(sentenceId, index), sentenceId, textId, lang: adapter.lang, index,
          surface: t.surface, start: t.start, end: t.end, normalized: t.normalized,
          formId: ids.form(adapter.lang, t.normalized), isWord: t.isWord,
        });
      });
    });
  }
  await store.tokens.bulkPut(rows);
}

function dim(level: LearnerLevel) {
  return { level, confidence: 0.5, evidence: 1, exposures: 1, estimatedFamiliar: false, unassisted: 1, assisted: 0 };
}

/** A fake golearn.listKnown: every listed normalized form is known at the given level, read in the given texts. */
function fakeGolearn(lang: LanguageCode, known: Array<{ n: string; level?: LearnerLevel; texts: string[] }>) {
  const rows = known.map((k): LearnerItemState => ({
    id: `li:${k.n}`, userId: 'u1', lang, itemId: ids.form(lang, k.n), itemKind: 'form',
    reading: dim(k.level ?? 'recognized'), listening: dim('unseen'), writing: dim('unseen'), speaking: dim('unseen'),
    encounterCount: 1, textIds: k.texts,
  }));
  return { listKnown: async () => rows };
}

async function build(adapter: LanguageAdapter, texts: Record<string, string[]>, known: Array<{ n: string; level?: LearnerLevel }>): Promise<WordIndex> {
  const store = createMemoryStore();
  await seedTexts(store, adapter, texts);
  const ids_ = Object.keys(texts);
  return buildWordIndex(
    { store, adapter, golearn: fakeGolearn(adapter.lang, known.map((k) => ({ ...k, texts: ids_ }))) },
    'u1', adapter.lang,
  );
}

const first = (index: WordIndex, adapter: LanguageAdapter, text: string) => predict(index, adapter, text)[0];

describe('buildWordIndex', () => {
  it('counts known words, keeps the most frequent spelling and stores bigrams', async () => {
    const idx = await build(esAdapter, { t1: ['Creo en Dios.', 'Dios me perdonó.', 'Creo que Dios habla.'] },
      [{ n: 'dios' }, { n: 'creo' }, { n: 'perdonó' }]);
    expect(idx.textCount).toBe(1);
    expect(idx.words.get('dios')).toMatchObject({ itemId: 'form:es:dios', surface: 'Dios', count: 3 });
    // sentence-initial "Creo" is the only spelling, so it is kept as seen
    expect(idx.words.get('creo')!.count).toBe(2);
    expect(idx.words.has('en')).toBe(false);                      // not known: no entry...
    expect(idx.bigrams.get('en')?.get('dios')).toBe(1);           // ...but still a bigram key for the known next word
    expect(idx.bigrams.get('que')?.get('dios')).toBe(1);
    expect(idx.bigrams.get('creo')?.has('en')).toBeFalsy();       // unknown next words are never stored
  });

  it('ignores listKnown rows of other languages and non-form items', async () => {
    const store = createMemoryStore();
    const golearn = {
      listKnown: async () => [
        ...(await fakeGolearn('es', [{ n: 'hola', texts: [] }]).listKnown()),
        { ...(await fakeGolearn('de', [{ n: 'haus', texts: [] }]).listKnown())[0] },
        { ...(await fakeGolearn('es', [{ n: 'hablar', texts: [] }]).listKnown())[0], itemId: 'lemma:es:hablar' },
      ],
    };
    const idx = await buildWordIndex({ store, adapter: esAdapter, golearn }, 'u1', 'es');
    expect([...idx.words.keys()]).toEqual(['hola']);
  });

  it('prefers readingTextIds over textIds', async () => {
    const store = createMemoryStore();
    await seedTexts(store, esAdapter, { read: ['Dios habla.'], heard: ['Dios calla.'] });
    const rows = await fakeGolearn('es', [{ n: 'dios', texts: ['read', 'heard'] }]).listKnown();
    rows[0].readingTextIds = ['read'];
    const idx = await buildWordIndex({ store, adapter: esAdapter, golearn: { listKnown: async () => rows } }, 'u1', 'es');
    expect(idx.textCount).toBe(1);
    expect(idx.words.get('dios')!.count).toBe(1);
  });
});

describe('predict: the prefix-only rule', () => {
  it('shows nothing before a character of the word is typed', async () => {
    const idx = await build(esAdapter, { t: ['Dios habla.'] }, [{ n: 'dios' }, { n: 'habla' }]);
    expect(predict(idx, esAdapter, '')).toEqual([]);
    expect(predict(idx, esAdapter, 'Dios ')).toEqual([]);      // at a word boundary
    expect(predict(idx, esAdapter, 'Dios,')).toEqual([]);      // after punctuation
    expect(predict(idx, esAdapter, 'Dios.\n')).toEqual([]);
    expect(first(idx, esAdapter, 'Dios h')).toMatchObject({ typed: 'h', surface: 'habla', completion: 'abla', itemId: 'form:es:habla' });
  });

  it('never suggests a word that is already exactly typed', async () => {
    const idx = await build(esAdapter, { t: ['Dios habla.'] }, [{ n: 'dios' }, { n: 'habla' }]);
    expect(predict(idx, esAdapter, 'Dios habla')).toEqual([]);
    expect(predict(idx, esAdapter, 'DIOS')).toEqual([]);       // exact match ignoring case
  });

  it('updates live: the ghost shrinks letter by letter and switches words when letters stop matching', async () => {
    const idx = await build(esAdapter, { t: ['La casa y el camino.', 'La casa es grande.', 'El camino es largo.'] },
      [{ n: 'casa' }, { n: 'camino' }]);
    const at = (s: string) => first(idx, esAdapter, s);
    expect(at('c')?.surface).toBe('casa');                      // casa is read twice, camino twice: tie → shorter
    expect(at('ca')?.completion).toBe('sa');
    expect(at('cas')?.completion).toBe('a');
    expect(at('casa')).toBeUndefined();                         // complete
    expect(at('cam')).toMatchObject({ surface: 'camino', completion: 'ino' });
    expect(at('cax')).toBeUndefined();                          // nothing matches any more
  });

  it('works inside a running sentence and ignores what came before the current word', async () => {
    const idx = await build(esAdapter, { t: ['Creo en Dios.'] }, [{ n: 'dios' }]);
    expect(first(idx, esAdapter, 'Yo no creo en Di')).toMatchObject({ surface: 'Dios', completion: 'os' });
  });

  it('respects `max` and returns best first', async () => {
    const idx = await build(esAdapter, { t: ['Casa casa casa camino carta.'] }, [{ n: 'casa' }, { n: 'camino' }, { n: 'carta' }]);
    const all = predict(idx, esAdapter, 'ca', { max: 5 });
    expect(all.map((p) => p.surface)).toEqual(['casa', 'carta', 'camino']);
    expect(all[0].score).toBeGreaterThanOrEqual(all[1].score);
    expect(predict(idx, esAdapter, 'ca')).toHaveLength(1);
  });
});

describe('predict: ranking', () => {
  it('prefers the word that followed the previous word in what the learner read (bigram)', async () => {
    // "casa" is far more frequent overall, but after "mi" the learner has read "camino".
    const idx = await build(esAdapter, {
      t: ['La casa es grande.', 'Una casa roja.', 'Esa casa vieja.', 'Veo la casa.', 'Mi camino es largo.'],
    }, [{ n: 'casa' }, { n: 'camino' }]);
    expect(first(idx, esAdapter, 'ca')?.surface).toBe('casa');
    expect(first(idx, esAdapter, 'Mi ca')?.surface).toBe('camino');
    expect(first(idx, esAdapter, 'La ca')?.surface).toBe('casa');
  });

  it('a bigram does not cross a sentence boundary', async () => {
    const idx = await build(esAdapter, { t: ['La casa es grande.', 'Una casa roja.', 'Mi camino es largo.'] }, [{ n: 'casa' }, { n: 'camino' }]);
    expect(first(idx, esAdapter, 'Todo es mío. ca')?.surface).toBe('casa');
    expect(first(idx, esAdapter, 'Mi. ca')?.surface).toBe('casa');
  });

  it('breaks frequency ties with the level', async () => {
    const idx = await build(esAdapter, { t: ['La casa. La carta.'] }, [{ n: 'casa', level: 'recognized' }, { n: 'carta', level: 'recalled' }]);
    expect(first(idx, esAdapter, 'ca')?.surface).toBe('carta');
  });
});

describe('predict: German', () => {
  it('keeps the capitalised spelling of a noun and matches case-insensitively', async () => {
    const idx = await build(deAdapter, { t: ['Ich glaube an das Haus.', 'Das Haus ist groß.', 'Ich habe Hunger.'] },
      [{ n: 'haus' }, { n: 'hunger' }, { n: 'habe' }]);
    expect(idx.words.get('haus')!.surface).toBe('Haus');
    expect(first(idx, deAdapter, 'Das Ha')?.surface).toBe('Haus');
    expect(first(idx, deAdapter, 'Das Ha')?.completion).toBe('us');
    expect(first(idx, deAdapter, 'das hau')).toMatchObject({ typed: 'hau', surface: 'Haus', completion: 's' });
  });

  it('a bigram counts even when the previous word is not known', async () => {
    const idx = await build(deAdapter, { t: ['Ich glaube an Gott.', 'Ich gehe nach Hause.', 'Wir gehen heim.'] }, [{ n: 'glaube' }, { n: 'gehe' }]);
    expect(idx.bigrams.get('ich')?.get('glaube')).toBe(1);
    expect(first(idx, deAdapter, 'Ich g')?.surface).toMatch(/glaube|gehe/);
    expect(idx.bigrams.get('ich')?.get('gehe')).toBe(1);
  });
});

describe('predict: Thai (no spaces, real adapter)', () => {
  const sentences = ['ฉันรักพระเจ้า', 'พระเจ้ารักฉัน', 'ฉันไปโบสถ์'];
  const words = new Set(sentences.flatMap((s) => thAdapter.tokenize(s).filter((t) => t.isWord).map((t) => t.normalized)));

  it('the segmenter yields multi-character words for the fixture', () => {
    expect([...words].some((w) => w.length >= 3)).toBe(true);
  });

  it('suggests the rest of the word being typed, with no space before it', async () => {
    const idx = await build(thAdapter, { t: sentences }, [...words].map((n) => ({ n })));
    const god = 'พระเจ้า';
    expect(words.has(god)).toBe(true);
    // after a complete word: the new word starts fresh
    expect(first(idx, thAdapter, 'ฉันรักพ')).toMatchObject({ typed: 'พ', surface: god, completion: 'ระเจ้า' });
    // the segmenter glues a half-typed word onto the previous one ("ฉันพ" is one token): the suggestion still works
    expect(thAdapter.tokenize('ฉันพ')).toHaveLength(1);
    expect(first(idx, thAdapter, 'ฉันพ')).toMatchObject({ typed: 'พ', surface: god, completion: 'ระเจ้า' });
    // the ghost shrinks as letters are typed, whatever the segmenter does with the fragment
    for (let k = 1; k < god.length; k++) {
      const p = first(idx, thAdapter, 'ฉัน' + god.slice(0, k));
      if (p) {
        expect(p.surface.startsWith(p.typed)).toBe(true);
        expect(p.completion).toBe(p.surface.slice(p.typed.length));
      }
    }
    expect(first(idx, thAdapter, 'ฉันพระ')).toMatchObject({ surface: god, completion: 'เจ้า' });
  });

  it('shows nothing when the text ends in a complete word or in a space', async () => {
    const idx = await build(thAdapter, { t: sentences }, [...words].map((n) => ({ n })));
    expect(predict(idx, thAdapter, 'ฉันรักพระเจ้า')).toEqual([]);
    expect(predict(idx, thAdapter, 'ฉันรักพระเจ้า ')).toEqual([]);
    expect(predict(idx, thAdapter, '')).toEqual([]);
  });
});

describe('buildWordIndex: bench', () => {
  it('indexes 50 texts x 100 sentences under 1.5 s', async () => {
    const store = createMemoryStore();
    const vocab = Array.from({ length: 400 }, (_, i) => `palabra${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + ((i / 26) | 0) % 26)}`);
    const rows: Token[] = [];
    const texts: string[] = [];
    for (let t = 0; t < 50; t++) {
      const textId = `text:es:b${t}`;
      texts.push(textId);
      for (let s = 0; s < 100; s++) {
        const sentenceId = `${textId}/s${s}`;
        let off = 0;
        for (let k = 0; k < 8; k++) {
          const surface = vocab[(t * 31 + s * 7 + k * 13) % vocab.length];
          rows.push({
            id: ids.token(sentenceId, k), sentenceId, textId, lang: 'es', index: k, surface, start: off, end: off + surface.length,
            normalized: surface, formId: ids.form('es', surface), isWord: true,
          });
          off += surface.length + 1;
        }
      }
    }
    await store.tokens.bulkPut(rows);
    const golearn = fakeGolearn('es', vocab.map((n) => ({ n, texts })));
    const started = performance.now();
    const idx = await buildWordIndex({ store, adapter: esAdapter, golearn }, 'u1', 'es');
    const ms = performance.now() - started;
    expect(idx.textCount).toBe(50);
    expect(idx.words.size).toBe(vocab.length);
    expect(ms).toBeLessThan(1500);
    const p0 = performance.now();
    for (let i = 0; i < 100; i++) predict(idx, esAdapter, 'Hola palabra');
    expect(performance.now() - p0).toBeLessThan(1500);
  });
});
