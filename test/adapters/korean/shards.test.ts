// @vitest-environment node
/**
 * The sharded Korean stem lexicon (src/adapters/korean/shards.ts over the shared loader). A written word does not begin with the
 * letters of its stem (갔다 is 가다, 들어요 is 듣다), so the loader is asked for the stems a token may hold, not for the token. The second
 * block runs on the real shards when they are built (npm run ko:build-lexicon).
 */
import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { KO_CORE } from '../../../src/adapters/korean/generated/core';
import { installKoreanLexicon, installedKoreanLexicons, koEntryLemma, koLexiconShardLetters, lookupKoreanStem, uninstallKoreanLexicon } from '../../../src/adapters/korean/index-store';
import { createKoreanShardLoader, koLexiconKeysOf } from '../../../src/adapters/korean/shards';

afterEach(() => { uninstallKoreanLexicon('kaikki-ko-lexicon'); uninstallKoreanLexicon('ko-core'); });

describe('the keys asked for', () => {
  it('are the stems a written word may begin with, not its first letters', () => {
    expect(koLexiconKeysOf('갔다')).toContain('가');
    expect(koLexiconKeysOf('봐요')).toContain('보');
    expect(koLexiconKeysOf('해요')).toContain('하');
    expect(koLexiconKeysOf('들어요')).toEqual(expect.arrayContaining(['듣', '들']));
    expect(koLexiconKeysOf('추워요')).toContain('춥');
    expect(koLexiconKeysOf('몰라요')).toContain('모르');
    expect(koLexiconKeysOf('써요')).toContain('쓰');
    expect(koLexiconKeysOf('학교에서')).toContain('학교');
  });

  it('include the words a token written without spaces may hold', () => {
    expect(koLexiconKeysOf('먹을수있어요')).toEqual(expect.arrayContaining(['먹', '수', '있']));
    expect(koLexiconKeysOf('한국어교육')).toEqual(expect.arrayContaining(['한국어', '교육']));
  });

  it('keep Hanja as written, in the Hanja shards', () => {
    expect(koLexiconKeysOf('學校에서')).toContain('學校');
    expect(koLexiconShardLetters('學校')).toBe('H5b');
    expect(koLexiconShardLetters('가')).toBe('ㄱㅏ');
    expect(koLexiconShardLetters('3')).toBe('');
  });

  it('are bounded for a very long token', () => {
    expect(koLexiconKeysOf('가'.repeat(200)).length).toBeLessThan(1200);
  });
});

const REAL = 'public/lexicon/ko/standard/manifest.json';
describe.skipIf(!fs.existsSync(REAL))('the real shards (built locally)', () => {
  const src = {
    async fetchJson(p: string) { return JSON.parse(fs.readFileSync(`public/${p}`, 'utf8')); },
    async fetchBytes(p: string) { return new Uint8Array(fs.readFileSync(`public/${decodeURIComponent(p)}`)); },
  };

  it('loads the shard of the STEM: 갔다 finds 가다, 들어요 finds 듣다, and nothing is fetched for a key already loaded', async () => {
    const loader = await createKoreanShardLoader(src, { base: 'lexicon/ko/standard' });
    const first = await loader.ensure(['갔다', '들어요']);
    expect(first.failed).toEqual([]);
    expect(first.loaded.length).toBeGreaterThan(0);
    expect(lookupKoreanStem('가').some((h) => h.entry.lemma === '가다' && h.lexicon.id === 'kaikki-ko-lexicon')).toBe(true);
    expect(lookupKoreanStem('듣').some((h) => h.entry.lemma === '듣다' && h.entry.irr === 'D')).toBe(true);
    const again = await loader.ensure(['갔다']);
    expect(again.loaded).toEqual([]);
  });

  it('a word written in Hanja reaches its Hangul headword through the Hanja shard', async () => {
    const loader = await createKoreanShardLoader(src, { base: 'lexicon/ko/standard' });
    const r = await loader.ensure(['學校에서']);
    expect(r.failed).toEqual([]);
    expect(lookupKoreanStem('學校').some((h) => h.entry.lemma === '학교')).toBe(true);
  });

  it('a row the compiled core and a shard both hold is returned once, and is the same row', async () => {
    installKoreanLexicon(KO_CORE);
    const before = lookupKoreanStem('먹').map((h) => `${koEntryLemma(h.entry)}|${h.entry.tag}|${h.entry.irr ?? ''}|${h.entry.gloss ?? ''}|${h.entry.pron ?? ''}|${h.entry.set ?? ''}`);
    expect(before.length).toBeGreaterThan(0);
    const loader = await createKoreanShardLoader(src, { base: 'lexicon/ko/standard' });
    await loader.ensure(['먹었습니다', '눈이', '시간은']);
    const after = lookupKoreanStem('먹').map((h) => `${koEntryLemma(h.entry)}|${h.entry.tag}|${h.entry.irr ?? ''}|${h.entry.gloss ?? ''}|${h.entry.pron ?? ''}|${h.entry.set ?? ''}`);
    for (const row of before) expect(after.filter((x) => x === row).length).toBe(1);
    expect(installedKoreanLexicons()).toContain('ko-core');
    // a whole homonym set, with the states the registry gives it
    const nun = lookupKoreanStem('눈').filter((h) => h.entry.tag === 'NNG');
    expect(nun.length).toBeGreaterThanOrEqual(2);
    expect(nun.every((h) => h.entry.set === 'balanced')).toBe(true);
    const sigan = lookupKoreanStem('시간').filter((h) => h.entry.tag === 'NNG');
    expect(sigan.filter((h) => h.entry.set === 'main').map((h) => koEntryLemma(h.entry))).toEqual(['시간']);
  });

  it('every shard the manifest lists is one the shard letters can name', async () => {
    const loader = await createKoreanShardLoader(src, { base: 'lexicon/ko/standard' });
    const names = Object.keys(loader.manifest.shards);
    expect(names.length).toBeGreaterThan(20);
    for (const name of names) expect(name === '_' || /^H[0-9a-f]+$/.test(name) || /^[ㄱ-ㅎ][ㅏ-ㅣ]?[ㄱ-ㅎ]?$/.test(name), name).toBe(true);
  });
});
