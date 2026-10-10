import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import { buildDictionary } from '../../src/dict';
import { buildFullFile } from '../../src/dict/build-full';
import { albanianManifest, createPackRuntime } from '../../packages/language-packs/src';
import { tmpDir, writeBuild } from '../dict/helpers';
import { BASE, diskFetch } from './helpers';

const sqNormalize = (s: string): string => createAdapterRegistry().get('sq').normalize(s);
const line = (o: unknown): string => JSON.stringify(o);

const lines = [
  // a headword, and a form-only entry that names it
  line({ pos: 'noun', word: 'libër', lang_code: 'sq', forms: [{ form: 'libra', tags: ['plural'] }, { form: 'librin', tags: ['accusative', 'definite', 'singular'], source: 'declension' }], etymology_text: 'From Latin liber.', senses: [{ glosses: ['book'] }] }),
  line({ pos: 'noun', word: 'librin', lang_code: 'sq', senses: [{ glosses: ['definite accusative singular of libër'], form_of: [{ word: 'libër' }], tags: ['form-of', 'accusative', 'definite', 'singular'] }] }),
  // an entry with senses of its own AND a form-of relation (the Hindi जाना shape)
  line({ pos: 'verb', word: 'ecën', lang_code: 'sq', senses: [{ glosses: ['to walk'] }, { glosses: ['third-person singular of ecje'], form_of: [{ word: 'ecje' }], tags: ['form-of', 'third-person'] }] }),
  // a form of a word that has no entry here, and a form of two possible headwords
  line({ pos: 'noun', word: 'zogjtë', lang_code: 'sq', senses: [{ glosses: ['plural of zog'], form_of: [{ word: 'zog' }], tags: ['form-of', 'plural'] }] }),
  line({ pos: 'noun', word: 'dritë', lang_code: 'sq', senses: [{ glosses: ['light'] }] }),
  line({ pos: 'verb', word: 'dritat', lang_code: 'sq', senses: [{ glosses: ['x of drit'], form_of: [{ word: 'drit' }], tags: ['form-of'] }] }),
  line({ pos: 'noun', word: 'dritat', lang_code: 'sq', senses: [{ glosses: ['plural of dritë'], form_of: [{ word: 'dritë' }], tags: ['form-of', 'definite', 'plural'] }] }),
];

function installed() {
  const root = tmpDir('go-formof-');
  writeBuild(path.join(root, 'dict'), buildDictionary(lines, { lang: 'sq', normalize: sqNormalize, date: '2026-10-10' }), 'sq');
  const input = path.join(root, 'in.jsonl');
  fs.writeFileSync(input, lines.join('\n') + '\n');
  return buildFullFile({ input, lang: 'sq', outDir: path.join(root, 'dict'), date: '2026-10-10', normalize: sqNormalize }).then(() => root);
}

describe('PackRuntime.gloss follows the form-of relation', () => {
  it('keeps the own senses of an entry that also carries a form-of relation', async () => {
    const rt = createPackRuntime(albanianManifest(), { fetch: diskFetch(await installed()), baseUrl: BASE });
    const g = await rt.gloss('ecën');
    expect(g?.senses.map((s) => s.gloss)).toEqual(['to walk']);
    expect(g?.via).toBeUndefined();
  });

  it('gives the headword senses for an inflected form, one hop, and says which form it came through', async () => {
    const rt = createPackRuntime(albanianManifest(), { fetch: diskFetch(await installed()), baseUrl: BASE });
    const g = await rt.gloss('librin');
    expect(g?.senses.map((s) => s.gloss)).toEqual(['book']);
    expect(g?.via).toEqual({ form: 'librin', lemma: 'libër', labels: ['form-of', 'accusative', 'definite', 'singular'] });
    expect(g?.attribution).toMatch(/CC BY-SA 4\.0/);
    // the headword itself has no via
    expect((await rt.gloss('libër'))?.via).toBeUndefined();
    // a surface form first and the guessed lemma second: the lemma's own senses win, no hop
    const both = await rt.gloss('libër', 'NOUN', ['librin', 'libër']);
    expect(both?.senses.map((s) => s.gloss)).toEqual(['book']);
    expect(both?.via).toBeUndefined();
  });

  it('prefers the relation of the preferred part of speech, and returns nothing when the headword is not there', async () => {
    const rt = createPackRuntime(albanianManifest(), { fetch: diskFetch(await installed()), baseUrl: BASE });
    expect((await rt.gloss('dritat', 'NOUN'))?.via?.lemma).toBe('dritë');
    expect(await rt.gloss('zogjtë')).toBeUndefined(); // form of zog, and there is no zog
    expect(await rt.gloss('nothingatall')).toBeUndefined();
  });
});

describe('PackRuntime.entry', () => {
  it('returns the full records of a lemma, and of the headword for an inflected form', async () => {
    const f = diskFetch(await installed());
    const rt = createPackRuntime(albanianManifest(), { fetch: f, baseUrl: BASE });
    const e = await rt.entry('libër', 'NOUN');
    expect(e?.records[0]).toMatchObject({ w: 'libër', p: 'NOUN', ety: { text: 'From Latin liber.' } });
    expect(e?.records[0].f).toHaveLength(2);
    expect(e?.attribution).toBe('Wiktionary, via kaikki.org — CC BY-SA 4.0');
    expect(e?.via).toBeUndefined();
    const viaForm = await rt.entry('librin', 'NOUN');
    expect(viaForm?.records[0].w).toBe('libër');
    expect(viaForm?.via).toEqual({ form: 'librin', lemma: 'libër', labels: ['form-of', 'accusative', 'definite', 'singular'] });
    expect(f.calls.some((u) => u === `${BASE}dict/sq/full/manifest.json`)).toBe(true);
  });

  it('is a preference for pos, takes the forms the caller worked out, and never throws', async () => {
    const root = await installed();
    const rt = createPackRuntime(albanianManifest(), { fetch: diskFetch(root), baseUrl: BASE });
    expect((await rt.entry('x', 'NOUN', ['libër']))?.records[0].w).toBe('libër');
    expect((await rt.entry('libër', 'VERB'))?.records[0].p).toBe('NOUN');
    expect(await rt.entry('')).toBeUndefined();
    expect(await rt.entry('zogjtë')).toBeUndefined();
    const down = createPackRuntime(albanianManifest(), { fetch: (async () => { throw new TypeError('offline'); }) as typeof fetch, baseUrl: BASE });
    expect(await down.entry('libër')).toBeUndefined();
    const none = createPackRuntime(albanianManifest(), { fetch: (async () => new Response('', { status: 404 })) as typeof fetch, baseUrl: BASE });
    expect(await none.entry('libër')).toBeUndefined();
  });
});
