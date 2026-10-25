import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { dictionaryLanguages, resolveProjectId, validateBundledAssets } from '../../packages/goreview-ios/scripts/release-inputs.mjs';

const existing = '668babc5-29cc-4185-b101-b963fce37ea1';
const alternate = '04e595f4-05bc-44f5-85a5-fa9cb76e9202';
const temporary: string[] = [];
afterEach(async () => { for (const p of temporary.splice(0)) await rm(p, { recursive: true, force: true }); });

describe('existing GoReview release identity', () => {
  it('keeps the tracked Expo project on a fresh checkout', () => {
    expect(resolveProjectId({ tracked: existing })).toBe(existing);
  });
  it('preserves a linked previous stage and accepts an explicit valid override', () => {
    expect(resolveProjectId({ previous: existing, tracked: alternate })).toBe(existing);
    expect(resolveProjectId({ explicit: alternate, previous: existing, tracked: existing })).toBe(alternate);
    expect(() => resolveProjectId({ explicit: 'not-a-project', tracked: existing })).toThrow('UUID');
  });
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'goreview-release-'));
  temporary.push(root);
  const put = async (relative: string, value: unknown = {}) => {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
  };
  const books = Array.from({ length: 66 }, (_, i) => ({ id: `book${i}`, lang: i < 39 ? 'he' : 'el' }));
  await put('biblia/index.html', '<html></html>');
  await put('biblia/data/canon.json', books);
  for (const b of books) await put(`biblia/data/${b.lang}/${b.id}.json`);
  for (const file of ['biblia/data/SOURCES.json', 'biblia/lexicon/he/biblical-index.json', 'biblia/lexicon/el/koine-index.json',
    'assets/fonts/eb-garamond-latin-400.woff2', 'assets/fonts/eb-garamond-latin-400-italic.woff2', 'assets/fonts/eb-garamond-latin-600.woff2', 'EB-Garamond-OFL.txt']) await put(file);
  await put('dict/hi/manifest.json', { schema: 3, lang: 'hi', licence: 'CC BY-SA 4.0', attribution: 'Wiktionary', shards: 1, shardFiles: ['s-00.json'] });
  await put('dict/hi/s-00.json');
  return { root, put };
}

describe('native release payload completeness', () => {
  it('validates the selected dictionary pack and complete Biblia payload', async () => {
    const { root } = await fixture();
    await expect(validateBundledAssets(root, dictionaryLanguages('hi,hi'))).resolves.toBeUndefined();
  });
  it('refuses a package that silently omitted a selected language', async () => {
    const { root } = await fixture();
    await expect(validateBundledAssets(root, ['hi', 'la'])).rejects.toThrow('dict/la/manifest.json');
  });
  it('refuses a missing dictionary shard even when its manifest exists', async () => {
    const { root } = await fixture();
    await rm(path.join(root, 'dict/hi/s-00.json'));
    await expect(validateBundledAssets(root, ['hi'])).rejects.toThrow('dict/hi/s-00.json');
  });
  it('refuses a missing book even when canon.json exists', async () => {
    const { root } = await fixture();
    await rm(path.join(root, 'biblia/data/he/book0.json'));
    await expect(validateBundledAssets(root, ['hi'])).rejects.toThrow('biblia/data/he/book0.json');
  });
  it('rejects an incomplete canon and a shard path outside its pack', async () => {
    const { root, put } = await fixture();
    await put('dict/hi/manifest.json', { schema: 3, lang: 'hi', licence: 'CC', attribution: 'source', shards: 1, shardFiles: ['../secret.json'] });
    await expect(validateBundledAssets(root, ['hi'])).rejects.toThrow('shard name');
    await put('biblia/data/canon.json', []);
    await expect(validateBundledAssets(root, ['hi'])).rejects.toThrow('39 Hebrew and 27 Greek');
  });
});
