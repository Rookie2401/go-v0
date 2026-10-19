/**
 * The built Latin dictionary through the pack runtime (the path the extension and the apps take): gloss('verbum') and
 * entry('verbum') read the schema-3 shards and the full records from public/dict/la, and a Vulgate spelling that is not
 * Wiktionary's (no macron, uerbum, j for consonantal i) still finds its headword. Skipped when the dictionary is not built
 * (public/dict is git-ignored: npm run dict:build -- --in <kaikki Latin jsonl> --lang la, then npm run dict:build-full -- la).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPackRuntime, latinManifest } from '../../packages/language-packs/src';
import { diskFetch } from '../language-packs/helpers';

const BASE = 'https://app.test/';
const PUBLIC = path.resolve(__dirname, '../../public');
const built = fs.existsSync(path.join(PUBLIC, 'dict/la/manifest.json')) && fs.existsSync(path.join(PUBLIC, 'dict/la/full/manifest.json'));
const fetchOf = (): typeof fetch => {
  const f = diskFetch(PUBLIC);
  return f;
};

describe.skipIf(!built)('the built Latin dictionary through createPackRuntime', () => {
  const rt = () => createPackRuntime(latinManifest(), { fetch: fetchOf(), baseUrl: BASE });

  it('gloss(verbum): the senses of the word, with the Wiktionary attribution', async () => {
    const g = await rt().gloss('verbum');
    expect(g?.attribution).toMatch(/Wiktionary/);
    expect(g?.senses.some((s) => s.gloss === 'word' && s.pos === 'NOUN')).toBe(true);
  });

  it('entry(verbum): the full record with the declension table (verbō is the ablative singular), the etymology and both readings', async () => {
    const e = await rt().entry('verbum', 'NOUN');
    expect(e?.attribution).toMatch(/Wiktionary/);
    const r = e!.records[0];
    expect(r).toMatchObject({ w: 'verbum', p: 'NOUN' });
    expect(r.f!.some((f) => f.f === 'verbō' && f.t.includes('ablative') && f.t.includes('singular') && f.s === 'declension')).toBe(true);
    expect(r.ety?.text).toMatch(/Proto-Italic/);
    expect(r.ety?.tpl.some((t) => t.k === 'inh' && t.lang === 'itc-pro')).toBe(true);
    expect(r.ipa?.some((i) => i.t?.includes('Classical-Latin'))).toBe(true);
    expect(r.ipa?.some((i) => i.t?.some((t) => /Ecclesiastical/.test(t)))).toBe(true);
  });

  it('an inflected form, and the old spellings uerbo / uerbum / justus / jesus, reach their headword', async () => {
    const viaForm = await rt().gloss('verbo');
    expect(viaForm?.via?.lemma).toBe('verbum');
    expect(viaForm?.senses.some((s) => s.gloss === 'word')).toBe(true);
    // uerbo exists only as the build's spelling-variant entry (a copy of verbo's relation): one hop to the headword
    const viaVariant = await rt().gloss('uerbo');
    expect(viaVariant?.via).toMatchObject({ form: 'uerbo', lemma: 'verbum' });
    expect(viaVariant?.senses.some((s) => s.gloss === 'word')).toBe(true);
    const entry = await rt().entry('uerbo');
    expect(entry?.via?.lemma).toBe('verbum');
    expect(entry?.records[0].w).toBe('verbum');
    // Wiktionary has its own alt-of pages for some of them: those answer with their own senses
    expect((await rt().gloss('uerbum'))?.senses[0].gloss).toMatch(/verbum/);
    expect((await rt().gloss('justus'))?.senses.some((s) => /iūstus/.test(s.gloss))).toBe(true);
    expect((await rt().gloss('jesus'))?.senses.some((s) => /Iēsūs/.test(s.gloss))).toBe(true);
  });
});
