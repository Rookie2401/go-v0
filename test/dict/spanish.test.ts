import fs from 'node:fs';
import path from 'node:path';
import { runNode } from '../helpers/cli';
import { afterAll, describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import type { DictionaryEntry } from '../../src/core';
import {
  bucketOf, buildDictionary, chooseBuckets, createFetchLexiconSource, entryFromKaikki, parseManifest, parseShard, shardName, TARGET_SHARD_BYTES,
} from '../../src/dict';
import { buildDictionaryFile } from '../../src/dict/build-node';
import { createFileLexiconSource } from '../../src/dict/file';
import { DATE, FIXTURE, buildFixture, fakeFetch, filesAt, tmpDir, writeBuild } from './helpers';

const ES_FIXTURE = path.resolve('test/dict/fixtures/kaikki-es-sample.jsonl');
const esNormalize = (s: string) => createAdapterRegistry().get('es').normalize(s);
const esLines = (): string[] => {
  const lines = fs.readFileSync(ES_FIXTURE, 'utf8').split(/\r?\n/);
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
};
const buildEs = (extra: { buckets?: number } = {}) => buildDictionary(esLines(), { lang: 'es', normalize: esNormalize, date: DATE, ...extra });

function entriesOf(out: ReturnType<typeof buildEs>, lang: 'es' | 'th' = 'es'): Map<string, DictionaryEntry[]> {
  const all = new Map<string, DictionaryEntry[]>();
  const b = out.manifest.buckets;
  for (const [name, text] of out.files) {
    if (name === 'manifest.json') continue;
    for (const [form, list] of parseShard(JSON.parse(text), lang, out.manifest)) {
      expect(shardName(bucketOf(form, b), b)).toBe(name);
      all.set(form, list);
    }
  }
  return all;
}

const root = tmpDir('go-dict-es-');
afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('Spanish fixture: inflected forms', () => {
  const out = buildEs();
  const all = entriesOf(out);
  const one = (f: string, pos?: string) => all.get(f)!.find((e) => pos === undefined || e.pos === pos)!;

  it('counts the lines and the form-of entries', () => {
    const s = out.stats;
    expect(s.lines).toBe(33);
    expect(s.malformed).toBe(1);
    expect(s.skipped).toEqual({ 'not-an-object': 0, 'no-word': 0, 'wrong-language': 1, 'no-gloss': 1, 'non-word': 1 });
    expect(s.kept).toBe(29);
    expect(s.entries).toBe(28); // casas twice
    expect(s.forms).toBe(27); // hablado is a verb and an adjective
    expect(s.withFormOf).toBe(13);
    expect(s.formOfRelations).toBe(15);
    expect(out.manifest).toMatchObject({ lang: 'es', id: `kaikki-es@${DATE}`, entries: 28, buckets: 256 });
  });

  it('maps a form-of sense to formOf (lemma + the source labels), never to a gloss or a sense of its own', () => {
    const hablo = one('hablo');
    expect(hablo.formOf).toEqual([{ lemma: 'hablar', tags: ['first-person', 'form-of', 'indicative', 'present', 'singular'] }]);
    expect(hablo.glosses).toEqual([]);
    expect(hablo.senses).toBeUndefined();
    expect(hablo.pos).toBe('VERB');
    expect(hablo.ipa).toBeUndefined(); // an inflected form carries no pronunciation of its own for Spanish (the spelling tells it); the source had /ˈablo/
    expect(hablo.pronunciations).toBeUndefined();
    expect(one('grandes').formOf).toEqual([{ lemma: 'grande', tags: ['form-of', 'plural'] }]);
    expect(one('dame').formOf).toEqual([{ lemma: 'dar', tags: ['combined-form', 'form-of', 'imperative', 'second-person', 'singular'] }]);
  });

  it('keeps variety labels on forms verbatim (Spain, Latin-America, with-voseo)', () => {
    expect(one('habláis').formOf![0].tags).toContain('Spain');
    expect(one('tenés').formOf![0].tags).toEqual(['Latin-America', 'form-of', 'indicative', 'present', 'second-person', 'singular', 'with-voseo']);
    expect(one('hablás').formOf![0].tags).toContain('with-voseo');
  });

  it('normalizes the lemma like the headword, and the headword itself', () => {
    expect(one('hablás').formOf![0].lemma).toBe('hablar'); // source says "Hablar"
    expect(all.has('dios')).toBe(true);
    expect(all.has('Dios')).toBe(false);
    // the capital the source writes is kept beside the normalized form; a headword written as its form carries nothing
    expect(one('dios').written).toBe('Dios');
    expect('written' in one('hablar')).toBe(false);
  });

  it('a form with two lemmas keeps both, one relation each', () => {
    expect(one('fui').formOf!.map((f) => f.lemma)).toEqual(['ir', 'ser']);
    expect(one('sé').formOf!.map((f) => f.lemma)).toEqual(['saber', 'ser']);
    expect(one('sé').formOf![1].tags).toEqual(['form-of', 'imperative', 'second-person', 'singular']);
  });

  it('a word that is a lemma and an inflected form keeps both', () => {
    const nina = one('niña');
    expect(nina.glosses).toEqual(['girl']);
    expect(nina.senses).toEqual([{ gloss: 'girl' }]);
    expect(nina.formOf).toEqual([{ lemma: 'niño', tags: ['feminine', 'form-of', 'singular'] }]);
  });

  it('a form that is a lemma of another part of speech stays two entries', () => {
    expect(all.get('hablado')!.map((e) => e.pos)).toEqual(['VERB', 'ADJ']);
    expect(one('hablado', 'VERB').formOf![0].lemma).toBe('hablar');
    expect(one('hablado', 'ADJ').formOf).toBeUndefined();
    expect(one('hablado', 'ADJ').glosses).toEqual(['spoken']);
  });

  it('merges repeated lines of one form without repeating the relation', () => {
    expect(all.get('casas')).toHaveLength(1);
    expect(one('casas').formOf).toHaveLength(1);
  });

  it('lemma entries stay as they were', () => {
    const hablar = one('hablar');
    expect(hablar).toMatchObject({ pos: 'VERB', glosses: ['to speak', 'to talk'], ipa: '/aˈblaɾ/' });
    expect(hablar.formOf).toBeUndefined();
    expect(hablar.senses).toEqual([{ gloss: 'to speak' }, { gloss: 'to talk', tags: ['intransitive'] }]);
    expect(one('tener').glosses).toEqual(['to have', 'to hold']);
  });

  it('a form-of sense without a usable lemma is an ordinary sense, not an invented relation', () => {
    const zzz = one('zzz');
    expect(zzz.formOf).toBeUndefined();
    expect(zzz.glosses).toHaveLength(1);
    expect(entryFromKaikki({ word: 'x', pos: 'verb', lang_code: 'es', senses: [{ glosses: ['g'], tags: ['form-of'], form_of: [{ word: ' ' }, null, 3] }] }, esNormalize, 'es')[0].formOf).toBeUndefined();
  });

  it('region labels on senses stay verbatim tags; no variety or register is guessed from them', () => {
    expect(one('coche').senses).toEqual([{ gloss: 'car', tags: ['Spain'] }, { gloss: 'carriage' }]);
    expect(one('carro').senses![0].tags).toEqual(['Latin-America', 'Mexico']);
    expect(one('chamba').senses![0].tags).toEqual(['Central-America', 'Mexico', 'colloquial']);
    expect(one('chamba').register).toEqual(['colloquial']); // the register label maps; the region labels do not
    const vos = one('vos');
    expect(vos.senses![0].tags).toEqual(['Honduras', 'Rioplatense', 'Central-America']);
    expect(vos.register).toEqual(['archaic']); // only from the second sense
    expect(one('coche').register).toBeUndefined();
  });

  it('"informal" and "formal" on an inflected form describe the address, not the register of the word', () => {
    const hablas = one('hablas');
    expect(hablas.formOf![0].tags).toContain('informal');
    expect(hablas.register).toBeUndefined();
  });

  it('region-tagged pronunciations are kept with their labels and none is promoted to the short view', () => {
    const calle = one('calle');
    expect(calle.pronunciations).toEqual([{ ipa: '/ˈkaʝe/', tags: ['Latin-America'] }, { ipa: '/ˈkaʎe/', tags: ['Spain'] }]);
    expect(calle.ipa).toBeUndefined();
    expect(one('coche').ipa).toBe('/ˈkotʃe/'); // an untagged reading is the plain one
  });

  it('other headings: contraction without a part of speech, phrase as X, character skipped', () => {
    expect(one('al').pos).toBeUndefined();
    expect(one('por favor')).toMatchObject({ pos: 'X', role: 'phrase' });
    expect(all.has('ñ')).toBe(false);
  });

  it('Spanish region labels never become the Thai regional register tags', () => {
    const e = entryFromKaikki({ word: 'x', pos: 'noun', lang_code: 'es', senses: [{ glosses: ['g'], tags: ['Northern', 'Southern', 'Isan', 'Northeastern'] }] }, esNormalize, 'es')[0];
    expect(e.register).toBeUndefined();
    expect(e.senses![0].tags).toEqual(['Northern', 'Southern', 'Isan', 'Northeastern']);
    const th = entryFromKaikki({ word: 'x', pos: 'noun', lang_code: 'th', senses: [{ glosses: ['g'], tags: ['Northern', 'Isan'] }] }, (s) => s, 'th')[0];
    expect(th.register).toEqual(['regional-north', 'regional-isan']);
  });
});

describe('bucket count in the manifest', () => {
  it('chooseBuckets: 256 for small data, then doubling so the average shard stays near the target', () => {
    expect(chooseBuckets(0)).toBe(256);
    expect(chooseBuckets(7_349_754)).toBe(256); // the Thai dictionary
    expect(chooseBuckets(256 * TARGET_SHARD_BYTES)).toBe(256);
    expect(chooseBuckets(256 * TARGET_SHARD_BYTES + 1)).toBe(512);
    expect(chooseBuckets(150_000_000)).toBe(2048);
    expect(chooseBuckets(1e12)).toBe(65536);
  });

  it('a build with more buckets names its shards wider and records the count', () => {
    const out = buildEs({ buckets: 1024 });
    expect(out.manifest.buckets).toBe(1024);
    expect(out.manifest.shardFiles.every((n) => /^s-[0-9a-f]{3}\.json$/.test(n))).toBe(true);
    expect(JSON.parse(out.files.get('manifest.json')!).buckets).toBe(1024);
    const all = entriesOf(out); // also checks every form sits in the shard its bucket names
    expect(all.size).toBe(27);
    expect(parseManifest(JSON.parse(out.files.get('manifest.json')!), 'es')?.buckets).toBe(1024);
  });

  it('the file and fetch sources read a dictionary with 1024 buckets', async () => {
    const out = buildEs({ buckets: 1024 });
    const dir = path.join(root, 'b1024');
    writeBuild(dir, out, 'es');
    const forms = ['hablo', 'fui', 'niña', 'casas', 'nada'];
    const viaFile = await createFileLexiconSource(dir, 'es').lookup(forms);
    expect([...viaFile.keys()]).toEqual(['hablo', 'fui', 'niña', 'casas']);
    expect(viaFile.get('fui')![0].formOf!.map((f) => f.lemma)).toEqual(['ir', 'ser']);
    const f = fakeFetch(filesAt('/dict', out, 'es'));
    const viaFetch = await createFetchLexiconSource('es', { fetch: f.fetch }).lookup(forms);
    expect(viaFetch).toEqual(viaFile);
    expect(f.log.every((u) => u === '/dict/es/manifest.json' || /\/dict\/es\/s-[0-9a-f]{3}\.json$/.test(u))).toBe(true);
  });

  it('a manifest without `buckets` (an older build) means 256; a nonsense count reads as not installed', () => {
    const out = buildFixture();
    const m = JSON.parse(out.files.get('manifest.json')!) as Record<string, unknown>;
    delete m.buckets;
    expect(parseManifest(m, 'th')?.buckets).toBe(256);
    for (const bad of [0, -1, 1.5, '256', 1e9, null]) expect(parseManifest({ ...m, buckets: bad }, 'th'), String(bad)).toBeUndefined();
  });

  it('an older Thai dictionary on disk (schema 2, no `buckets`) still reads', async () => {
    const out = buildFixture();
    const dir = path.join(root, 'old-thai');
    const d = writeBuild(dir, out);
    const m = JSON.parse(fs.readFileSync(path.join(d, 'manifest.json'), 'utf8')) as Record<string, unknown>;
    delete m.buckets;
    fs.writeFileSync(path.join(d, 'manifest.json'), JSON.stringify(m));
    const src = createFileLexiconSource(dir, 'th');
    expect((await src.info())?.entries).toBe(58);
    expect((await src.lookup(['ขนม'])).get('ขนม')?.[0].glosses).toEqual(['sweets; dessert', 'snack']);
  });

  it('the built Thai dictionary under public/dict/th reads, when there is one', async () => {
    const dir = path.resolve('public/dict');
    if (!fs.existsSync(path.join(dir, 'th', 'manifest.json'))) return;
    const src = createFileLexiconSource(dir, 'th');
    const info = await src.info();
    expect(info?.lang).toBe('th');
    expect(info?.attribution).toContain('CC BY-SA 4.0');
    expect((info?.entries ?? 0)).toBeGreaterThan(1000);
    const got = await src.lookup([...fs.readdirSync(path.join(dir, 'th')).filter((n) => n.startsWith('s-')).slice(0, 1)
      .flatMap((n) => Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'th', n), 'utf8')) as object).slice(0, 5))]);
    expect(got.size).toBeGreaterThan(0);
    for (const list of got.values()) for (const e of list) expect(e.glosses.length > 0 || (e.formOf?.length ?? 0) > 0).toBe(true);
  });
});

describe('streaming writer', () => {
  it('writes exactly what the in-memory builder returns (Thai and Spanish fixtures)', async () => {
    for (const [input, lang, memory] of [[FIXTURE, 'th', buildFixture()], [ES_FIXTURE, 'es', buildEs()]] as const) {
      const outDir = path.join(root, `stream-${lang}`);
      const r = await buildDictionaryFile({ input, lang, outDir, date: DATE });
      const dir = path.join(outDir, lang);
      const names = fs.readdirSync(dir).sort();
      expect(names).toEqual([...memory.files.keys()].sort());
      for (const n of names) {
        if (n === 'manifest.json') continue; // the file build adds the source record
        expect(fs.readFileSync(path.join(dir, n), 'utf8'), `${lang} ${n}`).toBe(memory.files.get(n));
      }
      expect(r.stats).toEqual(memory.stats);
      const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as Record<string, unknown>;
      const { source, ...rest } = m;
      expect(rest).toEqual(JSON.parse(memory.files.get('manifest.json')!));
      expect((source as { file: string }).file).toBe(path.basename(input));
    }
  });

  it('leaves no spill files behind and leaves an earlier build alone when the input is unusable', async () => {
    // its own temp directory: the system one is shared with the dictionary builds of other test files running at the same time
    const tmpDir = path.join(root, 'tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    const spills = () => fs.readdirSync(tmpDir).filter((n) => n.startsWith('go-dict-spill-')).length;
    const outDir = path.join(root, 'keep');
    await buildDictionaryFile({ input: ES_FIXTURE, lang: 'es', outDir, date: DATE, tmpDir });
    expect(spills()).toBe(0);
    const manifest = fs.readFileSync(path.join(outDir, 'es', 'manifest.json'), 'utf8');
    const junk = path.join(root, 'junk.jsonl');
    fs.writeFileSync(junk, 'nope\n');
    await expect(buildDictionaryFile({ input: junk, lang: 'es', outDir, date: DATE, tmpDir })).rejects.toThrow(/no usable entries/);
    expect(fs.readFileSync(path.join(outDir, 'es', 'manifest.json'), 'utf8')).toBe(manifest);
    expect(spills()).toBe(0);
  });
});

/** A deterministic, unique word for index i: syllables from a fixed table. */
const SYL = (() => { const out: string[] = []; for (const c of 'bcdfglmnprstv') for (const v of 'aeiou') out.push(c + v); return out; })();
const wordOf = (i: number): string => {
  let n = i;
  let w = '';
  do { w += SYL[n % SYL.length]; n = Math.floor(n / SYL.length); } while (n > 0);
  return w + 'r';
};

function writeSynthetic(file: string, lines: number): number {
  const fd = fs.openSync(file, 'w');
  let buf = '';
  let bytes = 0;
  const flush = () => { fs.writeSync(fd, buf); bytes += Buffer.byteLength(buf); buf = ''; };
  for (let i = 0; i < lines; i++) {
    const lemma = wordOf(Math.floor(i / 6));
    if (i % 6 === 0) {
      const forms = Array.from({ length: 24 }, (_, k) => ({ form: `${lemma}${k}`, tags: ['indicative', 'present', k % 2 ? 'plural' : 'singular', `person-${k % 3}`] }));
      buf += JSON.stringify({
        word: lemma, pos: 'verb', lang_code: 'es', lang: 'Spanish', forms,
        sounds: [{ ipa: `/ˈ${lemma}/` }, { ipa: `/ˈ${lemma}s/`, tags: ['Latin-America'] }, { rhymes: '-aɾ' }],
        senses: [{ glosses: [`to ${lemma}`, 'a narrower gloss'], tags: i % 12 === 0 ? ['Spain'] : ['Latin-America', 'Mexico'], examples: [{ text: 'x' }] }, { glosses: [`to ${lemma} again`] }],
        etymology_text: 'synthetic line for the size test '.repeat(8),
      }) + '\n';
    } else {
      buf += JSON.stringify({
        word: `${lemma}${(i % 6) - 1}`, pos: 'verb', lang_code: 'es', lang: 'Spanish', sounds: [{ ipa: `/ˈ${lemma}${i % 6}/` }],
        senses: [{ glosses: [`first-person singular present indicative of ${lemma}`], tags: ['first-person', 'form-of', 'indicative', 'present', 'singular'], form_of: [{ word: lemma }], links: [[lemma, lemma]] }],
        etymology_text: 'synthetic line for the size test '.repeat(6),
      }) + '\n';
    }
    if (buf.length > 1 << 20) flush();
  }
  flush();
  fs.closeSync(fd);
  return bytes;
}

describe('size: a synthetic 300,000-line Spanish-shaped file', () => {
  it('builds with bounded memory, shards under 250 kB, and reads back', async () => {
    const input = path.join(root, 'synthetic-es.jsonl');
    const t0 = Date.now();
    const bytes = writeSynthetic(input, 300_000);
    const genMs = Date.now() - t0;
    const outDir = path.join(root, 'synthetic-out');
    const t1 = Date.now();
    const cli = path.resolve('node_modules/vite-node/dist/cli.mjs');
    const r = await runNode([cli, 'scripts/dict-build.mts', '--in', input, '--lang', 'es', '--out', outDir, '--date', DATE], {
      cwd: path.resolve('.'), timeout: 540_000,
    });
    const buildMs = Date.now() - t1;
    const out = r.out;
    expect(r.status, out).toBe(0);
    const peakMb = Number(/peak memory:\s+(\d+) MB/.exec(out)?.[1]);
    const largest = Number(/largest (\d+)\)/.exec(out)?.[1]);
    const buckets = Number(/of (\d+) buckets/.exec(out)?.[1]);
    console.log(`synthetic file: ${(bytes / 1e6).toFixed(0)} MB, 300000 lines, generated in ${genMs} ms; build ${buildMs} ms wall (child), peak memory ${peakMb} MB, ${buckets} buckets, largest shard ${largest} bytes`);
    expect(out).toMatch(/300000 \(\+ 0 blank\)|input lines:\s+300000/);
    expect(peakMb).toBeGreaterThan(0);
    expect(peakMb).toBeLessThan(700); // vite-node itself is ~250 MB; the data is not held in memory
    expect(largest).toBeLessThan(250_000);
    expect(buckets).toBeGreaterThanOrEqual(256); // schema 3 is small enough that this file needs no more than the 256 of the Thai size
    const manifest = parseManifest(JSON.parse(fs.readFileSync(path.join(outDir, 'es', 'manifest.json'), 'utf8')), 'es')!;
    expect(manifest.buckets).toBe(buckets);
    expect(manifest.entries).toBe(300_000);
    expect(manifest.shards).toBeGreaterThan(200);
    return createFileLexiconSource(outDir, 'es').lookup([`${wordOf(0)}0`, wordOf(3), `${wordOf(1000)}2`, 'inexistente']).then((got) => {
      expect(got.get(`${wordOf(0)}0`)![0].formOf).toEqual([{ lemma: wordOf(0), tags: ['first-person', 'form-of', 'indicative', 'present', 'singular'] }]);
      expect(got.get(wordOf(3))![0].glosses[0]).toBe(`to ${wordOf(3)}`);
      expect(got.get(`${wordOf(1000)}2`)).toBeDefined();
      expect(got.has('inexistente')).toBe(false);
    });
  }, 600_000);
});
