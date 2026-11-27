/**
 * Korean lexicon helpers for the journey tests: homonym numbers are READ from the installed lexicon at run time (by meaning), never written
 * into a test, because the numbers are the source's and a rebuild may change them (docs/korean/PLAN.md "Identities").
 */
import fs from 'node:fs';
import path from 'node:path';
import { koEntryLemma, lookupKoreanStem, type KoLexEntry } from '../../../src/adapters/korean/index-store';
import { koAdapter } from '../../../src/adapters/ko';
import type { ShardSource } from '../../../src/adapters/shared/shards';

void koAdapter; // importing the adapter installs the compiled core

const PUBLIC = path.resolve(__dirname, '../../../public');
/** A shard source over public/ (the same files the extension serves). */
export const diskShardSource: ShardSource = {
  async fetchJson(p) { return JSON.parse(fs.readFileSync(path.join(PUBLIC, p), 'utf8')); },
  async fetchBytes(p) { return new Uint8Array(fs.readFileSync(path.join(PUBLIC, decodeURIComponent(p)))); },
};
export const SHARDS_PRESENT = fs.existsSync(path.join(PUBLIC, 'lexicon/ko/standard/manifest.json'));
export const DICT_PRESENT = fs.existsSync(path.join(PUBLIC, 'dict/ko/manifest.json'));

/** The entries of a spelling in a shared part of speech (NNG nouns by default). */
export function entriesOf(stem: string, tag: KoLexEntry['tag'] = 'NNG'): KoLexEntry[] {
  return lookupKoreanStem(stem).map((h) => h.entry).filter((e) => e.tag === tag);
}
/** The lemma string (numbered or bare, as the registry says) of the noun entry of this spelling whose first gloss matches. */
export function lemmaByMeaning(stem: string, meaning: RegExp, tag: KoLexEntry['tag'] = 'NNG'): string {
  const hit = entriesOf(stem, tag).find((e) => meaning.test(e.gloss ?? ''));
  if (!hit) throw new Error(`no ${tag} entry of ${stem} means ${meaning}`);
  return koEntryLemma(hit);
}
export const SNOW = (): string => lemmaByMeaning('눈', /\bsnow\b/i);
export const EYE = (): string => lemmaByMeaning('눈', /\beye\b/i);
