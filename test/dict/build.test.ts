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
    for (const [form, list] of parseShard(JSON.parse(text), 'th', out.manifest)) all.set(form, list);
  }
  return all;
}

describe('dictionary build over the fixture', () => {
  const out = buildFixture();
  const all = entriesOf(out);

  it('counts every line and every reason', () => {
    const s = out.stats;
    expect(s.lines).toBe(71);
    expect(s.blank).toBe(1);
    expect(s.malformed).toBe(2);
    expect(s.skipped).toEqual({ 'not-an-object': 2, 'no-word': 1, 'wrong-language': 1, 'no-gloss': 3, 'non-word': 3 });
    expect(s.nonWord).toEqual({ character: 1, symbol: 1, punct: 1 });
    expect(s.kept).toBe(59);
    expect(s.entries).toBe(58);
    expect(s.forms).toBe(50);
    expect(s.kept + s.malformed + Object.values(s.skipped).reduce((a, b) => a + b, 0)).toBe(s.lines);
  });

  it('counts what was preserved: senses, pronunciations, entries with each reading, unpaired groups, shard bytes', () => {
    const s = out.stats;
    const flat = [...all.values()].flat();
    expect(s.senses).toBe(flat.reduce((n, e) => n + (e.senses?.length ?? 0), 0));
    expect(s.pronunciations).toBe(flat.reduce((n, e) => n + (e.pronunciations?.length ?? 0), 0));
    expect(s.withRespelling).toBe(flat.filter((e) => e.respelling).length);
    expect(s.withIpa).toBe(flat.filter((e) => e.ipa).length);
    expect(s.withRomanization).toBe(flat.filter((e) => e.romanization).length);
    expect(s.withRegister).toBe(flat.filter((e) => e.register?.length).length);
    expect(s.unpairedGroups).toBe(1); // ทดสอบ: two respellings, three IPA readings
    const sizes = [...out.files].filter(([n]) => n !== 'manifest.json').map(([, t]) => Buffer.byteLength(t, 'utf8'));
    expect(s.shardBytes).toBe(sizes.reduce((a, b) => a + b, 0));
    expect(s.largestShardBytes).toBe(Math.max(...sizes));
  });

  it('writes a manifest with the contract fields, schema 3 and the honest attribution', () => {
    const m = JSON.parse(out.files.get('manifest.json')!) as Record<string, unknown>;
    expect(m).toMatchObject({
      schema: 3, id: `kaikki-th@${DATE}`, lang: 'th', entries: 58, builtAt: DATE, hasFrequency: false,
      attribution: 'Wiktionary, via kaikki.org — CC BY-SA 4.0',
    });
    expect(String(m.licence)).toContain('CC BY-SA 4.0');
    const parsed = parseManifest(m, 'th');
    expect(parsed).toBeDefined();
    expect(parsed!.shards).toBe(out.files.size - 1);
    expect(parsed!.shardFiles).toEqual([...out.files.keys()].filter((n) => n !== 'manifest.json'));
    expect(parseManifest(m, 'es')).toBeUndefined();
    expect(parseManifest({ ...m, schema: 1 }, 'th')).toBeUndefined(); // a schema-1 dictionary reads as not installed
    expect(parseManifest({ ...m, schema: 4 }, 'th')).toBeUndefined(); // one from the future too
    expect(m.labelSets).toEqual([]); // Thai has no form-of relations
    expect(m.source).toBeUndefined(); // no source stated, none invented
  });

  it('records the source in the manifest and names the id after its last-modified date', () => {
    const source = { url: 'https://example.test/x.jsonl', file: 'x.jsonl', lastModified: '2026-09-28', sha256: 'ab'.repeat(32), retrievedAt: '2026-09-30', lines: 71 };
    const o = buildDictionary(fixtureLines(), { lang: 'th', normalize: thNormalize, date: DATE, source });
    expect(o.manifest.id).toBe('kaikki-th@2026-09-28');
    expect(o.manifest.builtAt).toBe(DATE);
    const m = parseManifest(JSON.parse(o.files.get('manifest.json')!), 'th')!;
    expect(m.source).toEqual(source);
    // a source record of the wrong shape is dropped, not guessed at
    expect(parseManifest({ ...JSON.parse(o.files.get('manifest.json')!), source: { url: 5 } }, 'th')?.source).toBeUndefined();
  });

  it('puts each form in the shard named by its bucket, forms sorted, entries compact', () => {
    for (const [name, text] of out.files) {
      if (name === 'manifest.json') continue;
      const shard = JSON.parse(text) as Record<string, unknown[]>;
      const forms = Object.keys(shard);
      expect(forms).toEqual([...forms].sort());
      for (const f of forms) {
        expect(shardName(bucketOf(f))).toBe(name);
        // schema 3: `g` is there when it says something the senses `s` do not, never empty, and an entry says something
        for (const e of shard[f] as Array<Record<string, unknown>>) {
          if (e.g !== undefined) { expect(Array.isArray(e.g)).toBe(true); expect((e.g as unknown[]).length).toBeGreaterThan(0); }
          else expect(Array.isArray(e.s) || Array.isArray(e.m)).toBe(true);
        }
      }
    }
    expect(out.manifest.shards).toBe(new Set([...all.keys()].map((f) => bucketOf(f))).size);
  });

  it('merges the same form + part of speech and keeps different parts of speech apart', () => {
    const gin = all.get('กิน')!;
    // lines 1 and 3 have the same form, part of speech and pronunciation: one entry; the line with another reading stays apart
    expect(gin).toHaveLength(2);
    expect(gin[0].glosses).toEqual(['to eat', 'to consume', 'to take (a medicine)']);
    expect(gin[0].ipa).toBe('/kin˧/');
    expect(gin[0].romanization).toBe('gin');
    expect(gin[0].senses?.map((s) => s.gloss)).toEqual(['to eat', 'to consume — to use up', 'to take (a medicine)']);
    expect(gin[1].ipa).toBe('/a-different-reading-keeps-its-own-entry/');
    expect(all.get('ที่')!.map((e) => e.pos)).toEqual(['NOUN', 'CONJ', 'CLF']);
    expect(all.get('ใหม่')!.map((e) => e.pos)).toEqual(['ADJ', 'ADV']);
    expect(all.get('ไหม')!.map((e) => e.pos)).toEqual(['PART', 'NOUN', 'PART']);
    expect(all.get('ทรง')!.map((e) => e.pos)).toEqual(['VERB', 'NOUN']);
  });

  it('does not merge entries that differ in etymology number or in pronunciation', () => {
    const na = all.get('นา')!;
    expect(na.map((e) => e.etymology)).toEqual([1, 2]);
    expect(na.map((e) => e.glosses[0])).toEqual(['rice field (fixture)', 'second meaning (fixture)']);
    const mai = all.get('ไหม')!.filter((e) => e.pos === 'PART');
    expect(mai).toHaveLength(2);
    expect(mai[0].ipa).toBeUndefined();
    expect(mai[1].ipa).toBe('/maj˩˩˦/');
  });

  it('keeps every sense with the source labels, topics and the number of examples', () => {
    const thai = all.get('ไทย')![0];
    expect(thai.pos).toBe('PROPN');
    expect(thai.glosses).toEqual(['Thailand (fixture)', 'Thai (person, fixture)']);
    expect(thai.senses).toEqual([
      { gloss: 'Thailand (fixture)', topics: ['geography'], examples: 2 },
      { gloss: 'Thai (person, fixture)', tags: ['of a person'] },
    ]);
    expect(all.get('กิน')![0].senses![2]).toEqual({ gloss: 'to take (a medicine)', tags: ['transitive'], topics: ['medicine'] });
    expect(all.get('ลาว')![0].glosses).toEqual(['Lao: the language of Laos (fixture)']); // a label-only first gloss is joined to the next
    expect(all.get('ลาว')![0].senses![0].gloss).toBe('Lao: — the language of Laos (fixture)');
  });

  it('keeps every pronunciation group with its labels, paired by order, and the short view from the plain reading', () => {
    const neon = all.get('นีออน')![0];
    expect(neon.pronunciations).toEqual([
      { respelling: 'นี-ออน', ipa: '/niː˧.ʔɔːn˧/', romanization: 'nii-ɔɔn' },
      { respelling: 'นี-อ็อน', ipa: '/niː˧.ʔɔn˧/', romanization: 'nii-ɔn', tags: ['Unorthographical', 'Short'] },
    ]);
    expect(neon).toMatchObject({ respelling: 'นี-ออน', ipa: '/niː˧.ʔɔːn˧/', romanization: 'nii-ɔɔn' });
    const thai = all.get('ไทย')![0];
    expect(thai.pronunciations).toEqual([{ respelling: 'ไท', ipa: '/tʰaj˧/', romanization: 'tai' }]); // Orthographic, RI, homophone, audio rows are not readings
  });

  it('Orthographic/Phonemic: read as written, respelling is the word', () => {
    const e = all.get('ขอบคุณ')![0];
    expect(e.pronunciations).toEqual([{ respelling: 'ขอบคุณ', ipa: '/kʰɔːp̚˨˩.kʰun˧/', romanization: 'kɔ̀ɔp-kun', asWritten: true }]);
    expect(e.respelling).toBe('ขอบคุณ');
  });

  it('pronunciation rows whose counts do not match stay unpaired (and are counted), never guessed', () => {
    const e = all.get('ทดสอบ')![0];
    expect(e.pronunciations).toEqual([
      { respelling: 'ทด-สอบ', romanization: 'tót-sɔ̀ɔp' }, // two respellings, two Paiboon: paired by order
      { respelling: 'ทด-สอบ-สอบ', romanization: 'tót-sɔ̀ɔp-sɔ̀ɔp', tags: ['Short'] },
      { ipa: '/tʰot̚˦˥.sɔːp̚˨˩/' }, // three IPA readings against two respellings: kept apart
      { ipa: '/tʰot̚˦˥.sɔːp̚˨˩.sɔːp̚˨˩/' },
      { ipa: '/third-ipa-fixture/' },
    ]);
    expect(e.respelling).toBe('ทด-สอบ');
    expect(out.stats.unpairedGroups).toBe(1);
  });

  it('alt-of headwords, classifiers from the head template, units and non-words', () => {
    const alt = all.get('ตุ๊กตุ๊ก')![0];
    expect(alt.altOf).toEqual(['ตุ๊ก ๆ', 'ตุ๊กตุ๊ก2']);
    expect(alt.senses![0].tags).toEqual(['alt-of', 'misspelling']);
    expect(all.get('จาน')![0].classifiers).toEqual(['ใบ', 'ลูก']);
    const unit = (f: string) => all.get(f)![0];
    expect(unit('ไม่เป็นไร')).toMatchObject({ pos: 'X', role: 'phrase' });
    expect(unit('น้ำขึ้นให้รีบตัก')).toMatchObject({ pos: 'X', role: 'proverb' });
    expect(unit('ในขณะที่')).toMatchObject({ pos: 'X', role: 'prepositional phrase' });
    expect(unit('ผู้')).toMatchObject({ pos: 'X', role: 'prefix' });
    for (const f of ['ก', '฿', 'ๆ']) expect(all.has(f)).toBe(false); // character, symbol, punct: counted, not analysed
  });

  it('extended register tags; a vague label never makes a region or a register', () => {
    expect(all.get('บักหุ่ง')![0].register).toEqual(['regional-isan']);
    expect(all.get('เนตร')![0].register).toEqual(['literary', 'archaic']);
    expect(all.get('ถิ่น')![0].register).toBeUndefined();
    expect(all.get('ถิ่น')![0].senses![0].tags).toEqual(['dialectal', 'polite', 'dated', 'humble']); // still kept verbatim
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

  it('invents no frequency, definition or role (a role only on phrase / proverb / prefix units)', () => {
    for (const list of all.values()) for (const e of list) {
      expect(e.frequencyRank).toBeUndefined();
      if (e.role !== undefined) expect(e.pos).toBe('X');
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
