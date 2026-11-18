// @vitest-environment jsdom
/**
 * Reading Analysis, the lexical half: `buildLexicalTable` (src/reading/lexical.ts) and the word naming it rests on (`wordsOfText`, src/active/scan.ts)
 * with the REAL analysers of every language the parser registry lists. Sample text comes from the repository's own tracked corpus
 * (data/corpus/<lang>/*.json); nothing in Hebrew, Greek, Thai or Hindi is typed here: nonsense words for those scripts are built from code points.
 *
 * Needs local data: NO generated or untracked file is read by this test directly, but the real analysers (src/adapters/*) are imported
 * statically; if a language's compiled word list is absent on a machine the analyser still loads (it only resolves fewer words). The
 * measured shares printed at the end are for the machine this ran on.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { registerAllAnalysers } from '../support/analysers';
import { PARSER_LANGUAGES, getAnalyser } from '../../packages/golearn-extension/src/parser/registry';
import { wordsOfText } from '../../packages/golearn-extension/src/active/scan';
import { wordInScript } from '../../packages/golearn-extension/src/active/pageLanguages';
import { buildLexicalTable, type BuildOptions, type LexicalTable } from '../../packages/golearn-extension/src/reading/lexical';
import type { ConfirmFormsReply } from '../../packages/golearn-extension/src/protocol';

registerAllAnalysers();

const LANGS = ['sq', 'es', 'de', 'hi', 'th', 'nb', 'nn', 'la', 'he', 'el', 'arc', 'fr'] as const;
const VARIETY: Record<string, string> = { he: 'he-bib', el: 'el-koi' };
const CORPUS = resolve(process.cwd(), 'data/corpus');

/** The corpus file(s) each language's sample is read from. */
const SAMPLE_FILES: Record<string, string[]> = {
  sq: ['bible-1john-1'], es: ['camino-1-01'], de: ['bible-gen-1'], hi: ['bible-1john-1'], th: ['bridge-thai-bridge-01'], nb: ['story-01'], nn: ['story-01'],
  la: ['ladder-caesar-bg-1'], he: ['bible-gen-1'], el: ['bible-1john-1'], arc: ['daniel-2-10', 'daniel-2-11', 'daniel-2-12'],
};

function sentencesOf(lang: string, file: string): string[] {
  const j = JSON.parse(readFileSync(resolve(CORPUS, lang, file + '.json'), 'utf8')) as { sections?: Array<{ paragraphs?: Array<{ sentences?: Array<{ text?: unknown }> }> }> };
  const out: string[] = [];
  for (const s of j.sections ?? []) for (const p of s.paragraphs ?? []) for (const x of p.sentences ?? []) if (typeof x.text === 'string' && x.text.trim()) out.push(x.text);
  return out;
}
/**
 * French bundles no corpus (the French pack reads web pages), so its sample is these sentences, written for the pack: ordinary prose
 * with the present, the passé composé, a passé simple, a negation, pronouns, elision, a contraction, a hyphenated clitic and compound.
 */
const INLINE_SAMPLE: Record<string, string[]> = {
  fr: [
    'Elle est ici avec un ami.', 'Ils parlent de l’école.', 'C’est un petit livre.', 'Je veux le livre du garçon.', 'Nous avons deux enfants.',
    'Les enfants vont au marché.', 'Elle est arrivée hier et nous avons mangé ensemble.', 'Je ne sais pas si les chevaux sont dans le jardin.',
    'Il entra dans la maison et vit sa mère.', 'Donne-le-moi, s’il te plaît.', 'Aujourd’hui il fait beau, peut-être.', 'Les lettres que j’ai écrites sont sur la table.',
  ],
};
const sampleOf = (lang: string, n = 12): string[] => (INLINE_SAMPLE[lang] ?? SAMPLE_FILES[lang]!.flatMap((f) => sentencesOf(lang, f))).slice(0, n);
/** Distinct words of up to `files` corpus files of a language (by whitespace; punctuation trimmed). */
function vocabularyOf(lang: string, files = 12, cap = 500): string[] {
  const names = INLINE_SAMPLE[lang] ? [] : readdirSync(resolve(CORPUS, lang)).filter((f) => f.endsWith('.json')).slice(0, files).map((f) => f.replace(/\.json$/, ''));
  const seen = new Set<string>();
  for (const s of [...(INLINE_SAMPLE[lang] ?? []), ...names.flatMap((f) => sentencesOf(lang, f))]) for (const raw of s.split(/\s+/)) {
    const w = raw.replace(/^[^\p{L}\p{M}]+|[^\p{L}\p{M}]+$/gu, '');
    if (w && /^[\p{L}\p{M}]+$/u.test(w) && wordInScript(w, lang)) seen.add(w);
    if (seen.size >= cap) return [...seen];
  }
  return [...seen];
}

const nodesOf = (texts: readonly string[]): Text[] => texts.map((t) => document.createTextNode(t));
const analyseOpt = (_lang: string, variety?: string) => (variety ? { varietyId: variety } : undefined);
const adapterOf = (lang: string) => { const a = getAnalyser(lang); if (!a) throw new Error('no analyser ' + lang); return a; };

/** Deterministic by default: the clock never advances, so no slicing. */
function build(lang: string, texts: readonly string[], extra: Partial<BuildOptions> = {}): Promise<LexicalTable> {
  return buildLexicalTable({
    nodes: nodesOf(texts), fingerprint: 'fp', adapter: adapterOf(lang), languageId: lang, signal: new AbortController().signal,
    now: () => 0, pause: async () => undefined, ...extra,
  });
}
/** What GoLearn Active's one naming function says of the same nodes, after the script filter the table applies. */
const expectedWords = (lang: string, texts: readonly string[], variety?: string) =>
  texts.flatMap((t) => wordsOfText(t, adapterOf(lang), lang, analyseOpt(lang, variety))).filter((w) => wordInScript(w.surface, lang));
/** A nonsense word per script, built from code points (never typed). */
const cp = (...c: number[]): string => String.fromCodePoint(...c);
const MADE_UP: Record<string, string> = {
  sq: 'zqxvkjw', es: 'zqxvkjw', de: 'zqxvkjw', nb: 'zqxvkjw', nn: 'zqxvkjw', la: 'zqxvkjw', fr: 'zqxvkjw',
  he: cp(0x5D6, 0x5D7, 0x5D8, 0x5E1, 0x5E6, 0x5E7), arc: cp(0x5D6, 0x5D7, 0x5D8, 0x5E1, 0x5E6, 0x5E7),
  el: cp(0x3B6, 0x3BE, 0x3C8, 0x3C7, 0x3B8), th: cp(0xE0E, 0xE0F, 0xE10), hi: cp(0x91F, 0x920, 0x921, 0x922, 0x923),
};

const stats: Array<{ lang: string; tokens: number; withReading: number; multi: number; rows: number }> = [];
afterAll(() => {
  const line = (s: (typeof stats)[number]): string =>
    `${s.lang.padEnd(4)} tokens ${String(s.tokens).padStart(4)}  with a reading ${(100 * s.withReading / Math.max(1, s.tokens)).toFixed(1).padStart(5)}%  more than one ${(100 * s.multi / Math.max(1, s.tokens)).toFixed(1).padStart(5)}%  rows ${s.rows}`;
  console.log('READING-LEXICAL per-language measured shares (corpus sample):\n' + stats.map(line).join('\n'));
});

describe('the registry', () => {
  it('lists exactly the twelve languages these tests cover', () => {
    expect([...PARSER_LANGUAGES].sort()).toEqual([...LANGS].sort());
    for (const l of LANGS) expect(getAnalyser(l), l).toBeDefined();
  });
});

// ───────────────────────────── a. invariants, every language ─────────────────────────────
describe.each(LANGS.map((l) => [l]))('invariants of the table: %s', (lang) => {
  for (const variety of lang in VARIETY ? [undefined, VARIETY[lang]] : [undefined]) {
    it(`${variety ? 'in variety ' + variety : 'without a variety'}: total, ids, completeness`, async () => {
      const texts = sampleOf(lang);
      expect(texts.length, 'corpus sample').toBeGreaterThan(0);
      const t = await build(lang, texts, variety ? { varietyId: variety } : {});
      expect(t.languageId).toBe(lang);
      expect(t.varietyId).toBe(variety);
      expect(t.analyser).toBe(adapterOf(lang).version);
      expect(t.words.length).toBeGreaterThan(0);
      expect(t.total).toBe(t.words.reduce((s, w) => s + w.occurrences, 0));
      const expected = expectedWords(lang, texts, variety);
      expect(t.total, 'same count as wordsOfText after the script filter').toBe(expected.length);
      for (const { word, occurrences } of t.words) {
        expect(occurrences).toBeGreaterThan(0);
        expect(Number.isInteger(occurrences)).toBe(true);
        expect(word[0].startsWith(`form:${lang}:`), word[0]).toBe(true);
        for (const id of word.slice(1)) expect(id.startsWith(`lemma:${lang}:`), id).toBe(true);
        for (const id of word) for (const other of LANGS) if (other !== lang) { expect(id.startsWith(`form:${other}:`)).toBe(false); expect(id.startsWith(`lemma:${other}:`)).toBe(false); }
        expect(new Set(word.slice(1)).size, 'no repeated reading').toBe(word.length - 1);
      }
      // the same rows as the page's naming function gives, once each: form + readings
      const byKey = new Map<string, number>();
      for (const w of expected) { const k = [w.ids[0], ...w.readings].join('|'); byKey.set(k, (byKey.get(k) ?? 0) + 1); }
      const got = new Map(t.words.map((w) => [w.word.join('|'), w.occurrences] as const));
      expect([...got.entries()].sort()).toEqual([...byKey.entries()].sort());
      expect(t.complete).toBe(true);
      expect(t.analysedCharacters).toBe(t.characters);
      expect(t.characters).toBe(texts.reduce((s, x) => s + x.length, 0));
      if (!variety) stats.push({ lang, tokens: t.total, withReading: t.words.filter((w) => w.word.length > 1).reduce((s, w) => s + w.occurrences, 0), multi: t.words.filter((w) => w.word.length > 2).reduce((s, w) => s + w.occurrences, 0), rows: t.words.length });
    });
  }
});

// ───────────────────────────── b. repetition and determinism ─────────────────────────────
describe('repetition', () => {
  it('a word repeated 150 times in one node is ONE row with 150 occurrences', async () => {
    const t = await build('es', [Array.from({ length: 150 }, () => 'libro').join(' ')]);
    expect(t.words).toHaveLength(1);
    expect(t.words[0]!.occurrences).toBe(150);
    expect(t.total).toBe(150);
  });
  it('the same word in 150 separate nodes is ONE row too', async () => {
    const t = await build('es', Array.from({ length: 150 }, () => 'libro'));
    expect(t.words).toHaveLength(1);
    expect(t.words[0]!.occurrences).toBe(150);
  });
  it.each(LANGS.map((l) => [l]))('analysing the same text twice gives identical tables: %s', async (lang) => {
    const texts = sampleOf(lang);
    const a = await build(lang, texts);
    const b = await build(lang, texts);
    expect(b).toEqual(a);
  });
});

// ───────────────────────────── c. inflection ─────────────────────────────
/** Words of a language that the real analyser resolves to exactly one lemma when analysed alone, grouped by that lemma. */
function singleReadingFamilies(lang: string): Map<string, Map<string, string>> {
  const fam = new Map<string, Map<string, string>>();
  for (const surface of vocabularyOf(lang)) {
    const [w] = wordsOfText(surface, adapterOf(lang), lang);
    if (!w || w.readings.length !== 1 || w.ids.length !== 2) continue;
    (fam.get(w.readings[0]!) ?? fam.set(w.readings[0]!, new Map()).get(w.readings[0]!)!).set(w.ids[0]!, surface);
  }
  return fam;
}
describe('inflection: two forms, two rows, one lemma', () => {
  it.each([['es'], ['de'], ['la']])('%s', async (lang) => {
    const fam = singleReadingFamilies(lang);
    const pair = [...fam.entries()].find(([, forms]) => forms.size >= 2);
    expect(pair, `no lemma of ${lang} with two inflected forms in the sample`).toBeDefined();
    const [lemma, forms] = pair!;
    const [[formA, surfA], [formB, surfB]] = [...forms.entries()];
    const t = await build(lang, [surfA!, surfB!]); // one word per node: each is analysed exactly as it was when alone
    expect(t.words).toHaveLength(2);
    expect(t.words.map((w) => w.word)).toEqual([[formA, lemma], [formB, lemma]]);
    expect(formA).not.toBe(formB);
    expect(t.words.every((w) => w.occurrences === 1)).toBe(true);
  });
});

// ───────────────────────────── d. homographs ─────────────────────────────
const homographsFound: string[] = [];
describe('homographs: every creditable reading is carried, best first, while Active still sees [form, best]', () => {
  it.each(LANGS.map((l) => [l]))('%s', async (lang) => {
    const variety = VARIETY[lang];
    let checked = 0;
    for (const surface of vocabularyOf(lang)) {
      const [w] = wordsOfText(surface, adapterOf(lang), lang, analyseOpt(lang, variety));
      if (!w || w.readings.length < 2 || w.readings.length > 6) continue;
      homographsFound.push(`${lang}:${surface} (${w.readings.length} readings)`);
      // GoLearn Active's own answer for the word: the form and the single best lemma, no more
      expect(w.ids).toEqual([w.ids[0], w.readings[0]]);
      expect(w.ids).toHaveLength(2);
      expect(new Set(w.readings).size).toBe(w.readings.length);
      const t = await build(lang, [surface], variety ? { varietyId: variety } : {});
      expect(t.words).toHaveLength(1);
      expect(t.words[0]!.word).toEqual([w.ids[0], ...w.readings]);
      expect(t.words[0]!.word[1]).toBe(w.ids[1]); // best first
      expect(t.words[0]!.occurrences).toBe(1);
      if (++checked >= 15) break;
    }
  });
  it('at least one language has a homograph in its sample (otherwise the rule above was never exercised)', () => {
    console.log('READING-LEXICAL homographs exercised: ' + homographsFound.length + ' e.g. ' + homographsFound.slice(0, 12).join('; '));
    expect(homographsFound.length).toBeGreaterThan(0);
  });
});

// ───────────────────────────── e. unrecognised words and the dictionary ─────────────────────────────
describe('a word neither the analyser nor the dictionary has', () => {
  it.each(LANGS.map((l) => [l]))('%s: a made-up word gets a row with no reading and is still counted', async (lang) => {
    const t = await build(lang, [MADE_UP[lang]!]);
    expect(t.words.length).toBeGreaterThan(0);
    expect(t.total).toBe(t.words.reduce((s, w) => s + w.occurrences, 0));
    for (const { word } of t.words) { expect(word).toHaveLength(1); expect(word[0].startsWith(`form:${lang}:`)).toBe(true); }
    expect(t.dictionary).toBe('unavailable'); // no confirmForms given: it could not be asked
  });

  it.each(LANGS.map((l) => [l]))('%s: a dictionary that knows it adds exactly the lemma it returned', async (lang) => {
    const asked: Array<[string[], string]> = [];
    const confirmForms = async (forms: string[], languageId: string): Promise<ConfirmFormsReply | undefined> => {
      asked.push([[...forms], languageId]);
      return { ok: true, forms: Object.fromEntries(forms.map((f) => [f, ['zz', 'NOUN'] as [string, string]])) };
    };
    const t = await build(lang, [MADE_UP[lang]!], { confirmForms });
    expect(t.dictionary).toBe('asked');
    expect(asked.every(([, l]) => l === lang)).toBe(true);
    expect(asked.flatMap(([f]) => f).sort()).toEqual(t.words.map((w) => w.word[0].slice(`form:${lang}:`.length)).sort());
    for (const { word } of t.words) expect(word).toEqual([word[0], `lemma:${lang}:zz:NOUN`]);
  });

  it('a lemma with no part of speech is carried without one', async () => {
    const t = await build('es', ['zqxvkjw'], { confirmForms: async (f) => ({ ok: true, forms: { [f[0]!]: ['qzv', null] } }) });
    expect(t.words[0]!.word).toEqual(['form:es:zqxvkjw', 'lemma:es:qzv']);
  });

  it('an answer of null: still no reading, the dictionary WAS asked', async () => {
    const t = await build('es', ['zqxvkjw'], { confirmForms: async () => ({ ok: true, forms: { zqxvkjw: null } }) });
    expect(t.words).toEqual([{ word: ['form:es:zqxvkjw'], occurrences: 1 }]);
    expect(t.dictionary).toBe('asked');
  });

  it('a worker that is asleep (undefined), a throw, and an offline reply all leave the word without a reading and say unavailable', async () => {
    for (const confirmForms of [
      async () => undefined,
      async (): Promise<ConfirmFormsReply> => { throw new Error('port closed'); },
      async (): Promise<ConfirmFormsReply> => ({ ok: true, forms: {}, reason: 'offline' }),
      async (): Promise<ConfirmFormsReply> => ({ ok: false, forms: {} }),
      async (): Promise<ConfirmFormsReply> => ({ ok: true, forms: {}, reason: 'no-asset-base' }),
    ]) {
      const t = await build('es', ['zqxvkjw'], { confirmForms });
      expect(t.dictionary).toBe('unavailable');
      expect(t.words).toEqual([{ word: ['form:es:zqxvkjw'], occurrences: 1 }]);
    }
  });

  it("reasons 'no-index' and 'no-pack' are reported as no-index", async () => {
    for (const reason of ['no-index', 'no-pack'] as const) {
      const t = await build('es', ['zqxvkjw'], { confirmForms: async () => ({ ok: true, forms: {}, reason }) });
      expect(t.dictionary).toBe('no-index');
      expect(t.words[0]!.word).toEqual(['form:es:zqxvkjw']);
    }
  });

  it('a form missing from one reply is asked again, and only that one', async () => {
    const calls: string[][] = [];
    const confirmForms = async (forms: string[]): Promise<ConfirmFormsReply> => {
      calls.push([...forms]);
      // first call: only the first form is answered; the budget "did not reach" the second
      return { ok: true, forms: calls.length === 1 ? { [forms[0]!]: ['aa', 'NOUN'] } : Object.fromEntries(forms.map((f) => [f, ['bb', 'NOUN'] as [string, string]])) };
    };
    const t = await build('es', ['zqxvkjw qzjxvkw'], { confirmForms });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(['zqxvkjw', 'qzjxvkw']);
    expect(calls[1]).toEqual(['qzjxvkw']);
    expect(t.dictionary).toBe('asked');
    expect(t.words.map((w) => w.word)).toEqual([['form:es:zqxvkjw', 'lemma:es:aa:NOUN'], ['form:es:qzjxvkw', 'lemma:es:bb:NOUN']]);
  });

  it('a reply that answers nothing at all ends the asking (unavailable), after one call', async () => {
    const calls: string[][] = [];
    const t = await build('es', ['zqxvkjw'], { confirmForms: async (f) => { calls.push(f); return { ok: true, forms: {} }; } });
    expect(calls).toHaveLength(1);
    expect(t.dictionary).toBe('unavailable');
    expect(t.words[0]!.word).toEqual(['form:es:zqxvkjw']);
  });

  it('a form the analyser already resolved is never asked; all-resolved text needs no dictionary', async () => {
    const [surface] = [...singleReadingFamilies('es').values()].flatMap((m) => [...m.values()]);
    let asked = 0;
    const t = await build('es', [surface!], { confirmForms: async () => { asked++; return { ok: true, forms: {} }; } });
    expect(asked).toBe(0);
    expect(t.dictionary).toBe('not-needed');
    expect(t.words[0]!.word.length).toBeGreaterThan(1);
  });

  it('more words than one request holds are asked in batches of at most MAX_CONFIRM_FORMS, each form once', async () => {
    const letters = 'qzxvkjw';
    const words = Array.from({ length: 1100 }, (_, i) => 'zq' + [i % 7, Math.floor(i / 7) % 7, Math.floor(i / 49) % 7, Math.floor(i / 343) % 7].map((d) => letters[d]).join(''));
    const calls: string[][] = [];
    const t = await build('de', [words.join(' ')], { confirmForms: async (forms) => { calls.push([...forms]); return { ok: true, forms: Object.fromEntries(forms.map((f) => [f, null])) }; } });
    const unread = t.words.filter((w) => w.word.length === 1).length;
    expect(unread).toBeGreaterThan(500);
    expect(calls.every((c) => c.length <= 500)).toBe(true);
    expect(calls[0]).toHaveLength(500);
    const flat = calls.flat();
    expect(new Set(flat).size).toBe(flat.length);
    expect(flat.length).toBe(unread);
    expect(t.dictionary).toBe('asked');
  });
});

// ───────────────────────────── f. script filter ─────────────────────────────
describe('the script filter', () => {
  it.each([['he'], ['el'], ['th'], ['hi']])('%s: Latin-script words in the text are not counted for the language', async (lang) => {
    const own = sampleOf(lang, 3);
    const texts = own.map((s) => `${s} hello world Spanish text 2024`);
    const t = await build(lang, texts);
    const onlyOwn = await build(lang, own);
    expect(t.total).toBe(onlyOwn.total);
    expect(t.total).toBeGreaterThan(0);
    for (const { word } of t.words) expect(/[A-Za-z]/.test(word[0].slice(`form:${lang}:`.length)), word[0]).toBe(false);
    expect(t.words.map((w) => w.word[0]).some((f) => /hello|world|spanish|text/i.test(f))).toBe(false);
    // and the characters of the Latin words were still read (the node was read whole)
    expect(t.analysedCharacters).toBe(t.characters);
  });
  it.each(LANGS.map((l) => [l]))('%s: numbers and punctuation are never words', async (lang) => {
    const t = await build(lang, ['123 4,5 … !!! ?? — (2024) 3.14 © § ¶ 1/2 #1']);
    expect(t.total).toBe(0);
    expect(t.words).toEqual([]);
    expect(t.dictionary).toBe('not-needed');
  });
});

// ───────────────────────────── g. mixed-language safety ─────────────────────────────
describe('mixed-language safety', () => {
  it('Spanish text analysed as German never yields a Spanish id', async () => {
    const t = await build('de', sampleOf('es'));
    expect(t.words.length).toBeGreaterThan(0);
    for (const { word } of t.words) for (const id of word) expect(id.split(':')[1], id).toBe('de'); // only the language field counts: a German lemma may itself be spelled "es"
  });
  it('German text analysed as Spanish never yields a German id', async () => {
    const t = await build('es', sampleOf('de'));
    for (const { word } of t.words) for (const id of word) expect(id.split(':')[1]).toBe('es');
  });
  it('Nynorsk text analysed as Bokmål carries only Bokmål ids', async () => {
    const t = await build('nb', sampleOf('nn'));
    for (const { word } of t.words) for (const id of word) expect(id.split(':')[1]).toBe('nb');
  });
});

// ───────────────────────────── h. limits, cancellation, progress ─────────────────────────────
describe('limits and cancellation', () => {
  const texts = () => sampleOf('es', 12);
  it('a character limit ends the reading at a node boundary and says so', async () => {
    const all = texts();
    const limit = Math.floor(all.reduce((s, x) => s + x.length, 0) / 2);
    const t = await build('es', all, { limits: { characters: limit } });
    expect(t.complete).toBe(false);
    expect(t.analysedCharacters).toBeLessThan(t.characters);
    expect(t.analysedCharacters).toBeLessThanOrEqual(limit);
    // no node is half-read: the analysed length is a whole prefix of the nodes, and the words are exactly that prefix's words
    let n = 0, sum = 0;
    while (n < all.length && sum + all[n]!.length <= limit) sum += all[n++]!.length;
    expect(t.analysedCharacters).toBe(sum);
    expect(t.total).toBe(expectedWords('es', all.slice(0, n)).length);
    expect(t.characters).toBe(all.reduce((s, x) => s + x.length, 0));
  });
  it('a limit smaller than the first node reads nothing', async () => {
    const t = await build('es', texts(), { limits: { characters: 3 } });
    expect(t.complete).toBe(false);
    expect(t.analysedCharacters).toBe(0);
    expect(t.total).toBe(0);
    expect(t.words).toEqual([]);
  });
  it('a limit larger than the text changes nothing', async () => {
    const t = await build('es', texts(), { limits: { characters: 10_000_000, distinctWords: 1_000_000 } });
    expect(t.complete).toBe(true);
    expect(t.analysedCharacters).toBe(t.characters);
  });
  it('a distinct-word limit also ends the reading at a node boundary', async () => {
    const all = texts();
    const t = await build('es', all, { limits: { distinctWords: 2 } });
    expect(t.complete).toBe(false);
    expect(t.analysedCharacters).toBeLessThan(t.characters);
    let n = 0, sum = 0;
    for (const x of all) { if (sum === t.analysedCharacters) break; sum += x.length; n++; }
    expect(sum).toBe(t.analysedCharacters);
    expect(t.total).toBe(expectedWords('es', all.slice(0, n)).length);
  });
  it('an already aborted signal rejects', async () => {
    await expect(build('es', texts(), { signal: AbortSignal.abort() })).rejects.toBeDefined();
  });
  it('an abort during a pause rejects, and no table is returned', async () => {
    const ctl = new AbortController();
    let t = 0, pauses = 0;
    await expect(build('es', texts(), {
      signal: ctl.signal, now: () => (t += 20), pause: async () => { if (++pauses === 2) ctl.abort(); },
    })).rejects.toBeDefined();
    expect(pauses).toBe(2);
  });
  it('an abort while the dictionary is being asked rejects', async () => {
    const ctl = new AbortController();
    await expect(build('es', ['zqxvkjw'], { signal: ctl.signal, confirmForms: async () => { ctl.abort(); return { ok: true, forms: { zqxvkjw: null } }; } })).rejects.toBeDefined();
  });
  it('progress is reported with non-decreasing done, ends at the whole, and slices happen when the clock says so', async () => {
    const all = texts();
    const seen: Array<[number, number]> = [];
    let t = 0, pauses = 0;
    const table = await build('es', all, { onProgress: (d, tot) => seen.push([d, tot]), now: () => (t += 20), pause: async () => { pauses++; } });
    expect(pauses).toBe(all.length); // every node begins with a clock past the slice
    expect(seen.length).toBeGreaterThan(1);
    for (let i = 1; i < seen.length; i++) expect(seen[i]![0]).toBeGreaterThanOrEqual(seen[i - 1]![0]);
    expect(seen.every(([, tot]) => tot === table.characters)).toBe(true);
    expect(seen[seen.length - 1]![0]).toBe(table.characters);
    // slicing never changes the answer
    expect(table).toEqual(await build('es', all));
  });
  it('a clock that never advances never pauses', async () => {
    let pauses = 0;
    await build('es', texts(), { pause: async () => { pauses++; } });
    expect(pauses).toBe(0);
  });
});

// ───────────────────────────── i. Thai ─────────────────────────────
describe('Thai', () => {
  it('reports the share of tokens with a reading and never invents one for the rest', async () => {
    const texts = [...sampleOf('th', 12), ...sentencesOf('th', 'bridge-thai-bridge-02').slice(0, 12)];
    const t = await build('th', texts);
    const expected = expectedWords('th', texts);
    expect(t.total).toBe(expected.length);
    const withReading = t.words.filter((w) => w.word.length > 1).reduce((s, w) => s + w.occurrences, 0);
    const distinctWith = t.words.filter((w) => w.word.length > 1).length;
    console.log(`READING-LEXICAL Thai: ${t.total} tokens, ${withReading} with a reading (${(100 * withReading / Math.max(1, t.total)).toFixed(1)}%), ${t.words.length} distinct, ${distinctWith} distinct with a reading; unresolved: ${t.words.filter((w) => w.word.length === 1).slice(0, 15).map((w) => w.word[0]!.slice(8)).join(' ')}`);
    // every row's readings are exactly what the adapter itself named for that form: unresolved tokens carry none
    const adapterReadings = new Map<string, Set<string>>();
    for (const w of expected) (adapterReadings.get(w.ids[0]!) ?? adapterReadings.set(w.ids[0]!, new Set()).get(w.ids[0]!)!).add(w.readings.join('|'));
    for (const { word } of t.words) {
      expect(adapterReadings.get(word[0])!.has(word.slice(1).join('|')), word.join(' ')).toBe(true);
      for (const id of word.slice(1)) expect(id.startsWith('lemma:th:')).toBe(true);
    }
    expect(t.words.some((w) => w.word.length === 1) || withReading === t.total).toBe(true);
  });
});

describe('Thai, a sentence the seed list was not built from (the harness scripts page)', () => {
  it('an unseen sentence: unresolved tokens carry no reading; the measured share is reported', async () => {
    const html = readFileSync(resolve(process.cwd(), 'packages/golearn-extension/harness/scripts.html'), 'utf8');
    const m = /<p id="th"[^>]*>([^<]+)<\/p>/.exec(html);
    expect(m, 'the Thai paragraph of scripts.html').not.toBeNull();
    const t = await build('th', [m![1]!]);
    const expected = expectedWords('th', [m![1]!]);
    expect(t.total).toBe(expected.length);
    const withReading = t.words.filter((w) => w.word.length > 1).reduce((s, w) => s + w.occurrences, 0);
    console.log(`READING-LEXICAL Thai (scripts.html sentence): ${t.total} tokens, ${withReading} with a reading (${(100 * withReading / Math.max(1, t.total)).toFixed(1)}%); tokens: ${t.words.map((w) => w.word[0]!.slice(8) + (w.word.length > 1 ? '+' : '-')).join(' ')}`);
    for (const { word } of t.words) if (word.length > 1) expect(word.slice(1).every((id) => id.startsWith('lemma:th:'))).toBe(true);
    // a token with no reading is exactly a token the adapter gave none
    const noneByAdapter = new Set(expected.filter((w) => w.readings.length === 0).map((w) => w.ids[0]));
    expect(new Set(t.words.filter((w) => w.word.length === 1).map((w) => w.word[0]))).toEqual(noneByAdapter);
  });
});
