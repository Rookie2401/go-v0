import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildDictionary, createFullRecordSource, mapFullLine, parseFullManifest, parseFullShard, readFullRecord, FULL_CAPS } from '../../src/dict';
import { buildFullFile } from '../../src/dict/build-full';
import { cleanText } from '../../src/dict/full-format';
import { tmpDir } from './helpers';

const norm = (s: string): string => s.normalize('NFC').toLowerCase();

const spanishVerb = {
  pos: 'verb', word: 'hablar', lang_code: 'es', lang: 'Spanish', etymology_number: 1,
  forms: [
    { form: 'hablo', tags: ['first-person', 'present', 'singular'] },
    { form: 'no-table-tags', source: 'conjugation', tags: ['table-tags'] },
    { form: 'es-conj', source: 'conjugation', tags: ['inflection-template'] },
    { form: 'hablar', tags: ['infinitive'], source: 'conjugation' },
    { form: 'hablás', tags: ['vos-form', 'singular', 'second-person', 'present', 'indicative', 'informal'], source: 'conjugation' },
    { form: 'hablado', tags: ['participle', 'past'], source: 'conjugation' },
  ],
  hyphenations: [{ parts: ['ha‧blar'] }],
  sounds: [{ ipa: '/aˈblaɾ/' }, { ipa: '[aˈβ̞laɾ]', tags: ['Latin-America'] }, { rhymes: '-aɾ' }],
  etymology_text: 'From Latin fābulārī.\nSee also fabla.',
  etymology_templates: [
    { name: 'root', args: { '1': 'es', '2': 'ine-pro' } },
    { name: 'inh', args: { '1': 'es', '2': 'la', '3': 'fābulārī', t: 'to talk' } },
    { name: 'af', args: { '1': 'es', '2': 'habl', '3': '-ar' } },
  ],
  derived: [{ word: 'hablador' }, { word: 'hablador' }, { word: 'habladuría' }],
  senses: [
    { glosses: ['to speak'], tags: ['intransitive'], examples: [{ text: 'Ella habla español.', translation: 'She speaks Spanish.' }, { text: 'Hablamos mañana.' }, { text: 'third' }], synonyms: [{ word: 'decir' }] },
    { glosses: ['to talk'], raw_tags: ['Latin America'] },
  ],
};

const albanianNoun = {
  pos: 'noun', word: 'libër', lang_code: 'sq', lang: 'Albanian',
  forms: [
    { form: 'líbër', tags: ['canonical', 'masculine'] },
    { form: 'no-table-tags', source: 'declension', tags: ['table-tags'] },
    { form: 'sq-noun-m', source: 'declension', tags: ['inflection-template'] },
    { form: 'libër', tags: ['indefinite', 'nominative', 'singular'], source: 'declension' },
    { form: 'librin', tags: ['accusative', 'definite', 'singular'], source: 'declension' },
  ],
  sounds: [
    { ipa: '/ˈlibəɾ/' },
    { audio: 'LL-Q8748 (sqi)-Katerinadedej-liber.wav', ogg_url: 'https://upload.wikimedia.org/x/liber.ogg', mp3_url: 'https://upload.wikimedia.org/x/liber.mp3' },
    { audio: 'only-mp3.wav', mp3_url: 'https://upload.wikimedia.org/x/only.mp3' },
    { audio: 'no-url.wav' },
  ],
  etymology_text: 'Borrowed from Latin liber.',
  etymology_templates: [{ name: 'bor', args: { '1': 'sq', '2': 'la-vul', '3': '-' } }, { name: 'bor', args: { '1': 'sq', '2': 'la', '3': 'liber' } }],
  senses: [{ glosses: ['book'], examples: [{ text: 'Ia dhashë librin e ri atij.', translation: 'I gave the new book to him.' }] }],
};

const hindiNoun = {
  pos: 'noun', word: 'किताब', lang_code: 'hi', lang: 'Hindi',
  forms: [
    { form: 'kitāb', tags: ['romanization'] },
    { form: 'کِتَاب', tags: ['Urdu'] },
    { form: 'किताबें', tags: ['direct', 'plural'], source: 'declension', roman: 'kitābẽ' },
  ],
  sounds: [{ tags: ['Hindi', 'Standard'], ipa: '/kɪ.t̪ɑːb/' }],
  senses: [{ glosses: ['book'], tags: ['feminine'], synonyms: [{ word: 'पुस्तक' }] }],
};

const noSenses = { pos: 'verb', word: 'hablo', lang_code: 'es', senses: [{ glosses: ['first-person singular present of hablar'], form_of: [{ word: 'hablar' }] }] };

describe('mapFullLine', () => {
  it('keeps a Spanish verb with its conjugation table, hyphenation, IPA, etymology and related words', () => {
    const { key, record: r } = mapFullLine(spanishVerb, norm, 'es');
    expect(key).toBe('hablar');
    expect(r).toMatchObject({ w: 'hablar', p: 'VERB', e: 1 });
    expect(r!.s).toEqual([
      { g: 'to speak', t: ['intransitive'], x: ['Ella habla español.', 'Hablamos mañana.'] }, // no translations, two examples at most
      { g: 'to talk', t: ['Latin America'] },
    ]);
    // every tagged form except the table-tags and inflection-template rows; tags sorted, source kept
    expect(r!.f).toEqual([
      { f: 'hablo', t: ['first-person', 'present', 'singular'] },
      { f: 'hablar', t: ['infinitive'], s: 'conjugation' },
      { f: 'hablás', t: ['indicative', 'informal', 'present', 'second-person', 'singular', 'vos-form'], s: 'conjugation' },
      { f: 'hablado', t: ['participle', 'past'], s: 'conjugation' },
    ]);
    expect(r!.tpl).toEqual(['es-conj']);
    expect(r!.ipa).toEqual([{ i: '/aˈblaɾ/' }, { i: '[aˈβ̞laɾ]', t: ['Latin-America'] }]);
    expect(r!.hyph).toEqual(['ha‧blar']);
    expect(r!.ety!.text).toBe('From Latin fābulārī. See also fabla.'); // the line break is gone
    expect(r!.ety!.tpl).toEqual([{ k: 'inh', lang: 'la', form: 'fābulārī', gloss: 'to talk' }, { k: 'af', lang: 'es', form: 'habl + -ar' }]); // root is dropped
    expect(r!.rel).toEqual({ d: ['hablador', 'habladuría'], syn: ['decir'] });
    expect(r!.audio).toBeUndefined();
    expect(r!.rom).toBeUndefined();
  });

  it('keeps an Albanian noun with its declension table and one audio url per file', () => {
    const { key, record: r } = mapFullLine(albanianNoun, norm, 'sq');
    expect(key).toBe('libër');
    expect(r!.p).toBe('NOUN');
    expect(r!.f).toHaveLength(3);
    expect(r!.f![1]).toEqual({ f: 'libër', t: ['indefinite', 'nominative', 'singular'], s: 'declension' });
    expect(r!.tpl).toEqual(['sq-noun-m']);
    // the ogg url is preferred, the mp3 is used when it is the only one, a file without a url is not an audio record
    expect(r!.audio).toEqual([
      { u: 'https://upload.wikimedia.org/x/liber.ogg', n: 'LL-Q8748 (sqi)-Katerinadedej-liber.wav' },
      { u: 'https://upload.wikimedia.org/x/only.mp3', n: 'only-mp3.wav' },
    ]);
    expect(r!.ety!.tpl).toEqual([{ k: 'bor', lang: 'la-vul' }, { k: 'bor', lang: 'la', form: 'liber' }]); // "-" is no form
  });

  it('puts the romanization of a Hindi word in rom, not in the forms', () => {
    const { record: r } = mapFullLine(hindiNoun, norm, 'hi');
    expect(r!.rom).toBe('kitāb');
    expect(r!.f).toEqual([{ f: 'کِتَاب', t: ['Urdu'] }, { f: 'किताबें', t: ['direct', 'plural'], s: 'declension', r: 'kitābẽ' }]);
    expect(r!.ipa).toEqual([{ i: '/kɪ.t̪ɑːb/', t: ['Hindi', 'Standard'] }]);
    expect(r!.rel).toEqual({ syn: ['पुस्तक'] });
    // another language keeps a romanization row as a form
    expect(mapFullLine(hindiNoun, norm, 'sq').skipped).toBe('wrong-language');
    const asDe = mapFullLine({ ...hindiNoun, lang_code: 'de' }, norm, 'de').record!;
    expect(asDe.f![0]).toEqual({ f: 'kitāb', t: ['romanization'] });
    expect(asDe.rom).toBeUndefined();
  });

  it('skips an entry with no senses of its own (an inflected form), a non-word and odd input, with a reason', () => {
    expect(mapFullLine(noSenses, norm, 'es')).toEqual({ skipped: 'no-senses' });
    expect(mapFullLine({ pos: 'character', word: 'a', lang_code: 'es', senses: [{ glosses: ['x'] }] }, norm, 'es').skipped).toBe('non-word');
    expect(mapFullLine('text', norm, 'es').skipped).toBe('not-an-object');
    expect(mapFullLine(null, norm, 'es').skipped).toBe('not-an-object');
    expect(mapFullLine({ pos: 'noun', senses: [{ glosses: ['x'] }] }, norm, 'es').skipped).toBe('no-word');
    expect(mapFullLine({ pos: 'noun', word: 'x', senses: 'nope', forms: 5, sounds: [3, null], etymology_templates: [7] }, norm, 'es').skipped).toBe('no-senses');
    // odd shapes inside a good entry are ignored, not trusted
    const { record } = mapFullLine({ pos: 'noun', word: 'x', senses: [{ glosses: ['y'] }], forms: [null, { form: 5 }, { form: 'z', tags: 'no' }], sounds: [3, null], etymology_templates: [7, { name: 'inh', args: 5 }] }, norm, 'es');
    expect(record).toEqual({ w: 'x', p: 'NOUN', s: [{ g: 'y' }], ety: { tpl: [{ k: 'inh' }] } });
  });

  it('applies the caps and cleans control characters', () => {
    const forms = Array.from({ length: 450 }, (_, i) => ({ form: `f${i}`, tags: ['x'], source: 'conjugation' }));
    const senses = Array.from({ length: 20 }, (_, i) => ({ glosses: [`sense ${i}`] }));
    const derived = Array.from({ length: 50 }, (_, i) => ({ word: `d${i}` }));
    const templates = Array.from({ length: 30 }, (_, i) => ({ name: 'cog', args: { '1': 'de', '2': `w${i}` } }));
    const { record: r } = mapFullLine({ pos: 'noun', word: 'wo\u0007rd', forms, senses, derived, etymology_text: 'é'.repeat(900) + '\u0000', etymology_templates: templates }, norm, 'es');
    expect(r!.w).toBe('word');
    expect(r!.f).toHaveLength(FULL_CAPS.forms);
    expect(r!.s).toHaveLength(FULL_CAPS.senses);
    expect(r!.rel!.d).toHaveLength(FULL_CAPS.related);
    expect(r!.ety!.text!.length).toBe(FULL_CAPS.etymologyChars);
    expect(r!.ety!.text!.endsWith('…')).toBe(true);
    expect(r!.ety!.tpl).toHaveLength(FULL_CAPS.etymologyTemplates);
    expect(cleanText('a\u0000b\tc\u0085d\u009fe\n\nf')).toBe('ab c de f');
    expect(JSON.stringify(r)).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/);
  });
});

describe('reading back', () => {
  it('drops bad records, bad sub-entries and untrusted urls; a bad manifest reads as absent', () => {
    expect(readFullRecord(null)).toBeUndefined();
    expect(readFullRecord({ w: 'x' })).toBeUndefined();
    expect(readFullRecord({ w: 'x', s: [{ g: '' }] })).toBeUndefined();
    const r = readFullRecord({
      w: 'x', p: 'NOPE', s: [{ g: 'a', t: ['t', 3] }, 5], f: [{ f: 'a', t: ['x'] }, { f: 'b' }, 9],
      audio: [{ u: 'javascript:alert(1)', n: 'a' }, { u: 'https://x.test/a.ogg', n: 'a' }], ety: { tpl: [{ k: 'inh' }, { nope: 1 }] }, e: 0,
    });
    expect(r).toEqual({ w: 'x', s: [{ g: 'a', t: ['t'] }], f: [{ f: 'a', t: ['x'] }], audio: [{ u: 'https://x.test/a.ogg', n: 'a' }], ety: { tpl: [{ k: 'inh' }] } });
    expect(parseFullShard({ a: [{ w: 'a', s: [{ g: 'g' }] }, { bad: 1 }], b: 'no', c: [{ bad: 1 }] }).get('a')).toHaveLength(1);
    expect(parseFullShard([]).size).toBe(0);
    expect(parseFullManifest({ schema: 'full-1' }, 'es')).toBeUndefined();
    expect(parseFullManifest(null, 'es')).toBeUndefined();
  });
});

describe('build -> read round trip', () => {
  const lines = [JSON.stringify(spanishVerb), JSON.stringify(noSenses), 'this is not json', JSON.stringify(albanianNoun), JSON.stringify({ ...spanishVerb, pos: 'noun', etymology_number: 2, senses: [{ glosses: ['speech'] }], forms: [] }), ''];
  const fileFetch = (root: string, log: string[] = []): typeof fetch => (async (input: RequestInfo | URL) => {
    const url = String(input);
    log.push(url);
    const p = path.join(root, url.replace(/^https:\/\/dict\.test\//, ''));
    return fs.existsSync(p) ? new Response(fs.readFileSync(p, 'utf8'), { status: 200 }) : new Response('nope', { status: 404 });
  }) as typeof fetch;

  async function buildEs(gz: boolean) {
    const dir = tmpDir('go-full-');
    // Albanian and Spanish lines in one file would be filtered by lang_code: the Albanian line must be skipped for 'es'
    const input = path.join(dir, gz ? 'in.jsonl.gz' : 'in.jsonl');
    const text = lines.join('\n') + '\n';
    fs.writeFileSync(input, gz ? zlib.gzipSync(text) : text);
    const out = path.join(dir, 'out');
    const r = await buildFullFile({ input, lang: 'es', outDir: out, date: '2026-10-10', normalize: norm, source: { url: 'https://kaikki.org/dictionary/Spanish/', lastModified: '2026-09-28' } });
    return { dir, out, r };
  }

  it('streams a plain file and a gzip to the same shards, counts everything and skips what it must', async () => {
    const a = await buildEs(false);
    const b = await buildEs(true);
    const s = a.r.stats;
    expect(s.lines).toBe(5);
    expect(s.malformed).toBe(1);
    expect(s.skipped).toMatchObject({ 'no-senses': 1, 'wrong-language': 1 });
    expect(a.r.manifest.counts).toEqual({ records: 2, withForms: 1, withEtymology: 2, withIpa: 2, withAudio: 0 });
    expect(a.r.manifest).toMatchObject({ schema: 'full-1', lang: 'es', builtAt: '2026-10-10', source: { version: '2026-09-28', licence: 'CC BY-SA 4.0', url: 'https://kaikki.org/dictionary/Spanish/' } });
    expect(a.r.manifest.buckets).toBe(256);
    const names = fs.readdirSync(path.join(a.out, 'es', 'full')).sort();
    expect(names).toEqual(fs.readdirSync(path.join(b.out, 'es', 'full')).sort());
    for (const n of names.filter((x) => x.startsWith('f-'))) {
      expect(fs.readFileSync(path.join(a.out, 'es', 'full', n), 'utf8')).toBe(fs.readFileSync(path.join(b.out, 'es', 'full', n), 'utf8'));
    }
  });

  it('reads it back through createFullRecordSource over a file fetch, fetching only the shard it needs', async () => {
    const { out, r } = await buildEs(false);
    const log: string[] = [];
    const src = createFullRecordSource('es', { baseUrl: 'https://dict.test/', fetch: fileFetch(out, log) });
    expect((await src.info())?.counts.records).toBe(2);
    const recs = await src.lookup('hablar');
    expect(recs.map((x) => x.p)).toEqual(['VERB', 'NOUN']); // input order
    expect(recs[0].f).toHaveLength(4);
    expect((await src.lookup('hablar', 'NOUN')).map((x) => x.p)).toEqual(['NOUN', 'VERB']); // a preference, not a filter
    expect(await src.lookup('nada')).toEqual([]);
    expect(await src.lookup('hablo')).toEqual([]); // the form-only line was skipped
    expect(await src.lookup('')).toEqual([]);
    const shardFetches = log.filter((u) => /\/f-[0-9a-f]+\.json$/.test(u));
    expect(shardFetches.length).toBeLessThanOrEqual(2);
    expect(new Set(shardFetches).size).toBe(shardFetches.length); // cached after the first read
    expect(log.filter((u) => u.endsWith('manifest.json'))).toHaveLength(1);
    expect(r.manifest.shardFiles.length).toBeGreaterThan(0);
  });

  it('never throws: no manifest, a wrong language, a down network and a corrupt shard all read as no record', async () => {
    const { out } = await buildEs(false);
    const missing = createFullRecordSource('es', { baseUrl: 'https://dict.test/', fetch: (async () => new Response('', { status: 404 })) as typeof fetch });
    expect(await missing.info()).toBeUndefined();
    expect(await missing.lookup('hablar')).toEqual([]);
    const wrong = createFullRecordSource('de', { baseUrl: 'https://dict.test/', fetch: fileFetch(out) }); // the manifest says es
    expect(await wrong.info()).toBeUndefined();
    const down = createFullRecordSource('es', { baseUrl: 'https://dict.test/', fetch: (async () => { throw new TypeError('offline'); }) as typeof fetch });
    expect(await down.lookup('hablar')).toEqual([]);
    const f = fileFetch(out);
    const corrupt = createFullRecordSource('es', { baseUrl: 'https://dict.test/', fetch: (async (i: RequestInfo | URL) => (/\/f-/.test(String(i)) ? new Response('{not json', { status: 200 }) : f(i))) as typeof fetch });
    expect(await corrupt.lookup('hablar')).toEqual([]);
  });

  it('carries the same attribution and licence as the schema-3 manifest of the same source', async () => {
    const { r } = await buildEs(false);
    const s3 = buildDictionary(lines, { lang: 'es', normalize: norm, date: '2026-10-10' });
    expect(r.manifest.source.attribution).toBe(s3.manifest.attribution);
    expect(s3.manifest.licence).toContain(r.manifest.source.licence);
    expect(r.manifest.source.attribution).toMatch(/CC BY-SA 4\.0/);
  });
});
