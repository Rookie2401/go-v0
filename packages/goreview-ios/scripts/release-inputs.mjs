import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A clean stage must retain the existing Expo app instead of requiring another project setup. */
export function resolveProjectId({ explicit, previous, tracked }) {
  const value = explicit || previous || tracked;
  if (value !== undefined && !uuid.test(value)) throw new Error('GoReview EAS project ID must be a UUID. Check GOREVIEW_EAS_PROJECT_ID, the previous stage, or app.json.');
  return value;
}

export function dictionaryLanguages(value = 'sq,es,de,hi,th') {
  const languages = [...new Set(value.split(',').map((v) => v.trim()).filter(Boolean))];
  if (languages.some((v) => !/^[a-z]{2,3}$/.test(v))) throw new Error('GOPRACTICE_DICT must be a comma-separated list of language codes.');
  return languages;
}

async function requiredFile(root, relative) {
  try {
    const entry = await stat(path.join(root, relative));
    if (entry.isFile() && entry.size > 0) return;
  } catch { /* give the missing release input an actionable name */ }
  throw new Error(`Required GoReview release asset is missing or empty: ${relative}`);
}

/** Vite permits absent generated data during development; a native release must not silently omit it. */
export async function validateBundledAssets(webRoot, languages) {
  await requiredFile(webRoot, 'biblia/index.html');
  await requiredFile(webRoot, 'biblia/data/canon.json');
  const canon = JSON.parse(await readFile(path.join(webRoot, 'biblia/data/canon.json'), 'utf8'));
  if (!Array.isArray(canon) || canon.length !== 66 || canon.filter((b) => b.lang === 'he').length !== 39 || canon.filter((b) => b.lang === 'el').length !== 27) {
    throw new Error('The bundled Biblia canon must name all 39 Hebrew and 27 Greek books.');
  }
  const ids = new Set();
  for (const book of canon) {
    if (!/^[A-Za-z0-9_-]+$/.test(book.id) || ids.has(book.id)) throw new Error('The bundled Biblia canon has an invalid or duplicate book ID.');
    ids.add(book.id);
    await requiredFile(webRoot, `biblia/data/${book.lang}/${book.id}.json`);
  }
  for (const relative of ['biblia/data/SOURCES.json', 'biblia/lexicon/he/biblical-index.json', 'biblia/lexicon/el/koine-index.json',
    'assets/fonts/eb-garamond-latin-400.woff2', 'assets/fonts/eb-garamond-latin-400-italic.woff2', 'assets/fonts/eb-garamond-latin-600.woff2', 'EB-Garamond-OFL.txt']) {
    await requiredFile(webRoot, relative);
  }
  for (const lang of languages) {
    if (!/^[a-z]{2,3}$/.test(lang)) throw new Error('Invalid release dictionary language.');
    const relative = `dict/${lang}/manifest.json`;
    await requiredFile(webRoot, relative);
    const manifest = JSON.parse(await readFile(path.join(webRoot, relative), 'utf8'));
    if (![2, 3].includes(manifest.schema) || manifest.lang !== lang || !manifest.licence || !manifest.attribution ||
      !Array.isArray(manifest.shardFiles) || !manifest.shardFiles.length || manifest.shards !== manifest.shardFiles.length) {
      throw new Error(`The bundled ${lang} dictionary must have a valid manifest, attribution, and complete shard list.`);
    }
    for (const shard of manifest.shardFiles) {
      if (typeof shard !== 'string' || !/^s-[0-9a-f]{2,4}\.json$/.test(shard)) throw new Error(`Invalid ${lang} dictionary shard name.`);
      await requiredFile(webRoot, `dict/${lang}/${shard}`);
    }
  }
}
