import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bucketOf, buildDictionary, createDictionaryBuilder, mergeEntries, parseManifest, parseShard, shardName } from '../../src/dict';
import type { DictionaryEntry } from '../../src/core';
import { DATE, buildFixture, byPos, fixtureLines, thNormalize } from './helpers';

/** All entries of a build, by form, read back through the shard parser (what a runtime would see). */
function entriesOf(out: ReturnType<typeof buildFixture>): Map<string, DictionaryEntry[]> {
  const all = new Map<string, DictionaryEntry[]>();
  for (const [name, text] of out.files) {
    if (name === 'manifest.json') continue;
    for (const [form, list] of parseShard(JSON.parse(text), 'th')) all.set(form, list);
  }
  return all;
}

describe('dictionary build over the fixture', () => {
  const out = buildFixture();
  const all = entriesOf(out);

  it('counts every line and every reason', () => {
    const s = out.stats;
    expect(s.lines).toBe(51);
    expect(s.blank).toBe(1);
    expect(s.malformed).toBe(2);
    expect(s.skipped).toEqual({ 'not-an-object': 2, 'no-word': 1, 'wrong-language': 1, 'no-gloss': 3 });
    expect(s.kept).toBe(42);
    expect(s.entries).toBe(40);
    expect(s.kept + s.malformed + Object.values(s.skipped).reduce((a, b) => a + b, 0)).toBe(s.lines);
  });

  it('writes a manifest with the contract fields, schema 1 and the honest attribution', () => {
    const m = JSON.parse(out.files.get('manifest.json')!) as Record<string, unknown>;
    expect(m).toMatchObject({
      schema: 1, id: `kaikki-th@${DATE}`, lang: 'th', entries: 40, builtAt: DATE, hasFrequency: false,
      attribution: 'Wiktionary, via kaikki.org — CC BY-SA 4.0',
    });
    expect(String(m.licence)).toContain('CC BY-SA 4.0');
    const parsed = parseManifest(m, 'th');
    expect(parsed).toBeDefined();
    expect(parsed!.shards).toBe(out.files.size - 1);
    expect(parsed!.shardFiles).toEqual([...out.files.keys()].filter((n) => n !== 'manifest.json'));
    expect(parseManifest(m, 'es')).toBeUndefined();
  });

  it('puts each form in the shard named by its bucket, forms sorted, entries compact', () => {
    for (const [name, text] of out.files) {
      if (name === 'manifest.json') continue;
      const shard = JSON.parse(text) as Record<string, unknown[]>;
      const forms = Object.keys(shard);
      expect(forms).toEqual([...forms].sort());
      for (const f of forms) {
        expect(shardName(bucketOf(f))).toBe(name);
        for (const e of shard[f] as Array<Record<string, unknown>>) expect(Array.isArray(e.g)).toBe(true);
      }
    }
    expect(out.manifest.shards).toBe(new Set([...all.keys()].map(bucketOf)).size);
  });

  it('merges the same form + part of speech and keeps different parts of speech apart', () => {
    const gin = all.get('กิน')!;
    expect(gin).toHaveLength(1);
    expect(gin[0].glosses).toEqual(['to eat', 'to consume', 'to take (a medicine)']);
    expect(gin[0].ipa).toBe('/kin˧/'); // the first line's pronunciation wins
    expect(gin[0].romanization).toBe('gin');
    expect(all.get('ที่')!.map((e) => e.pos)).toEqual(['NOUN', 'CONJ', 'CLF']);
    expect(all.get('ใหม่')!.map((e) => e.pos)).toEqual(['ADJ', 'ADV']);
    expect(all.get('ไหม')!.map((e) => e.pos)).toEqual(['PART', 'NOUN']);
    expect(all.get('ทรง')!.map((e) => e.pos)).toEqual(['VERB', 'NOUN']);
  });

  it('maps the interesting fixture entries', () => {
    expect(all.get('หนม')![0]).toMatchObject({ glosses: ['colloquial form of ขนม'], register: ['colloquial'] }); // only sense is a form-of
    expect(all.get('แมว')![0]).toMatchObject({ glosses: ['cat'], classifiers: ['ตัว'] });
    expect(all.get('แมว')![0].register).toBeUndefined(); // the alt-of sense's archaic tag is not used
    expect(all.get('หมา')![0].classifiers).toEqual(['ตัว']);
    expect(all.get('หนังสือ')![0].classifiers).toEqual(['เล่ม', 'ฉบับ']);
    expect(all.get('โรงเรียน')![0].classifiers).toEqual(['แห่ง', 'โรง']);
    expect(all.get('ทำ')![0].glosses).toEqual(['to do', 'to make', 'to work', 'to perform', 'to cause', 'to build']);
    expect(all.get('รัก')![0]).toMatchObject({ glosses: ['to love'], romanization: 'rák' });
    expect(all.get('ตลาด')![0].respelling).toContain('ฺ');
    expect(all.get('ตลาด')![0].ipa).toContain('laː');
  });

  it('register tags come through', () => {
    const reg = (f: string, pos?: string) => (pos ? byPos(all.get(f), pos) : all.get(f)![0])?.register;
    expect(reg('ข้าพเจ้า')).toEqual(['formal']);
    expect(reg('กู')).toEqual(['slang']);
    expect(reg('ทรง', 'VERB')).toEqual(['royal']);
    expect(reg('ทรง', 'NOUN')).toBeUndefined();
    expect(reg('พระ')).toEqual(['religious', 'royal']);
    expect(reg('แซบ')).toEqual(['regional-isan']);
    expect(reg('หรอย')).toEqual(['regional-south']);
    expect(reg('ม่วน')).toEqual(['regional-north']);
    expect(reg('ครับ')).toBeUndefined();
  });

  it('skips entries without glosses, the other language, no headword; none of them reach a shard', () => {
    for (const f of ['ขาย', 'ซื้อ', 'เก่า', 'water', 'ขาด']) expect(all.has(f)).toBe(false);
  });

  it('invents no frequency and no role anywhere', () => {
    for (const list of all.values()) for (const e of list) {
      expect(e.frequencyRank).toBeUndefined();
      expect(e.role).toBeUndefined();
      expect(e.definition).toBeUndefined();
      expect(e.glosses.length).toBeGreaterThan(0);
      expect(e.glosses.length).toBeLessThanOrEqual(6);
      expect(e.lang).toBe('th');
    }
  });
});

describe('determinism', () => {
  it('two builds of the same input and date are byte-identical', () => {
    const a = buildFixture();
    const b = buildFixture();
    expect([...b.files.keys()]).toEqual([...a.files.keys()]);
    for (const [name, text] of a.files) expect(b.files.get(name)).toBe(text);
  });

  it('the date is the only thing that changes the output', () => {
    const a = buildFixture('2026-09-30');
    const b = buildFixture('2026-10-01');
    expect(b.files.get('manifest.json')).not.toBe(a.files.get('manifest.json'));
    for (const [name, text] of a.files) if (name !== 'manifest.json') expect(b.files.get(name)).toBe(text);
  });

  it('the order of shard keys does not depend on the order of the input', () => {
    const lines = fixtureLines();
    const rev = buildDictionary([...lines].reverse(), { lang: 'th', normalize: thNormalize, date: DATE });
    const fwd = buildFixture();
    // Entries of one form can swap order (merge order), but the set of shard files and forms is the same.
    expect([...rev.files.keys()]).toEqual([...fwd.files.keys()]);
    for (const [name, text] of fwd.files) {
      if (name === 'manifest.json') continue;
      expect(Object.keys(JSON.parse(rev.files.get(name)!) as object)).toEqual(Object.keys(JSON.parse(text) as object));
    }
  });
});

describe('builder behaviour', () => {
  const opts = { lang: 'th' as const, normalize: (s: string) => s };

  it('never throws on a bad line, counts it, and strips a BOM and CRLF', () => {
    const b = createDictionaryBuilder(opts);
    b.addLine('﻿{"word":"a","pos":"noun","senses":[{"glosses":["x"]}]}\r');
    b.addLine('{broken');
    b.addLine('');
    b.addLine('   ');
    b.addLine('null');
    const out = b.finish(DATE);
    expect(out.stats).toMatchObject({ lines: 3, blank: 2, malformed: 1, kept: 1, entries: 1 });
    expect(out.stats.skipped['not-an-object']).toBe(1);
  });

  it('an empty input still produces a valid, empty manifest', () => {
    const out = createDictionaryBuilder(opts).finish(DATE);
    expect(out.manifest).toMatchObject({ entries: 0, shards: 0, shardFiles: [] });
    expect([...out.files.keys()]).toEqual(['manifest.json']);
  });

  it('mergeEntries unites glosses (capped), registers and classifiers; first pronunciation wins', () => {
    const a: DictionaryEntry = { form: 'f', lang: 'th', pos: 'NOUN', glosses: ['1', '2', '3', '4'], register: ['formal'], classifiers: ['ก'], ipa: '/a/' };
    const b: DictionaryEntry = { form: 'f', lang: 'th', pos: 'NOUN', glosses: ['3', '5', '6', '7'], register: ['formal', 'royal'], classifiers: ['ข'], ipa: '/b/', respelling: 'r' };
    const m = mergeEntries(a, b);
    expect(m.glosses).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(m.register).toEqual(['formal', 'royal']);
    expect(m.classifiers).toEqual(['ก', 'ข']);
    expect(m.ipa).toBe('/a/');
    expect(m.respelling).toBe('r');
    expect(a.glosses).toEqual(['1', '2', '3', '4']); // inputs untouched
  });

  it('the shard files are plain JSON with no wasted whitespace (they ship to the browser)', () => {
    const out = buildFixture();
    for (const [name, text] of out.files) if (name !== 'manifest.json') expect(text.trimEnd()).toBe(JSON.stringify(JSON.parse(text)));
  });

  it('the fixture itself is where the tests say it is', () => {
    expect(fs.existsSync(path.resolve('test/dict/fixtures/README.md'))).toBe(true);
  });
});
