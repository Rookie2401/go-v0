/**
 * Korean full records (public/dict/ko/full) are read from gzip-at-rest shards (`f-xx.json.gz`, manifest gzip true: what
 * `dict:publish --full-shards gzip` writes, as for de / es / la) exactly as from plain ones, through the pack runtime the card uses.
 * The fixture is made at run time from the real built dictionary; the test skips cleanly when it is not built.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { repackFull } from '../../src/dict/full-pack';
import { createPackRuntime, koreanManifest } from '../../packages/language-packs/src';
import { pickRecord, type LexicalRecord } from '../../packages/golearn-extension/src/content/enrich';
import { lemmaHomonymNumber } from '../../packages/repository-contract/src/lemma-display';
import { DICT_PRESENT, SNOW } from '../support/korean/lexicon';
import { BASE, PUBLIC } from './helpers';

describe.skipIf(!DICT_PRESENT)('Korean full records from gzipped shards', () => {
  let tmp = '';
  const calls: string[] = [];
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'go-ko-full-gz-'));
    const r = repackFull(path.join(PUBLIC, 'dict/ko/full'), path.join(tmp, 'full'), true, 'ko');
    expect(r.gzip).toBe(true);
  }, 120_000);
  afterAll(() => { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); });

  /** public/ from disk, except that dict/ko/full comes from the repacked folder when `gz`. */
  const fetchFor = (gz: boolean): typeof fetch => (async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    if (!url.startsWith(BASE)) return new Response('not here', { status: 404 });
    const rel = decodeURIComponent(url.slice(BASE.length).split('?')[0]);
    const file = gz && rel.startsWith('dict/ko/full/') ? path.join(tmp, 'full', rel.slice('dict/ko/full/'.length)) : path.join(PUBLIC, rel);
    return fs.existsSync(file) && fs.statSync(file).isFile() ? new Response(fs.readFileSync(file), { status: 200 }) : new Response('missing', { status: 404 });
  }) as typeof fetch;

  it('the repacked manifest says gzip, and the shards are .json.gz', () => {
    const m = JSON.parse(fs.readFileSync(path.join(tmp, 'full/manifest.json'), 'utf8')) as { gzip?: boolean };
    expect(m.gzip).toBe(true);
    expect(fs.readdirSync(path.join(tmp, 'full')).filter((f) => /^f-.*\.json$/.test(f))).toEqual([]);
    expect(fs.readdirSync(path.join(tmp, 'full')).some((f) => /^f-.*\.json\.gz$/.test(f))).toBe(true);
  });

  it('the numbered key of the snow entry returns its one record and its table, the same from gzipped and from plain shards', async () => {
    const snow = SNOW();
    const read = async (gz: boolean) => {
      const rt = createPackRuntime(koreanManifest(), { fetch: fetchFor(gz), baseUrl: BASE } as never);
      return rt.entry(snow, 'NOUN', [snow]);
    };
    calls.length = 0;
    const gz = await read(true);
    const gzShards = calls.filter((u) => /\/dict\/ko\/full\/f-[0-9a-f]+\.json/.test(u));
    expect(gzShards.length).toBeGreaterThan(0);
    expect(gzShards.every((u) => /\.json\.gz(\?|$)/.test(u)), 'gzipped shards are the ones asked for').toBe(true);
    const plain = await read(false);
    expect(gz?.records).toHaveLength(1);
    const record = pickRecord(gz!.records as unknown as LexicalRecord[], 'NOUN') as LexicalRecord & { s?: Array<{ g: string }> };
    expect(record.s?.map((x) => x.g), 'resolved by meaning').toEqual(['snow']);
    expect(record.e, 'the numbered entry has its own etymology number').toBe(lemmaHomonymNumber('ko', snow));
    expect(JSON.parse(JSON.stringify(gz))).toEqual(JSON.parse(JSON.stringify(plain)));
  });
});
