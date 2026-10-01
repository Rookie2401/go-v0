import { describe, expect, it } from 'vitest';
import { bucketOf, compactEntry, entryFromKaikki, expandEntry, mapKaikkiLine, shardName } from '../../src/dict';
import type { DictionaryEntry } from '../../src/core';
import { fixtureLines, thNormalize } from './helpers';

const id = (s: string) => s;
const map = (line: unknown, normalize: (s: string) => string = id) => entryFromKaikki(line, normalize);
const base = (extra: Record<string, unknown> = {}) => ({ word: 'w', pos: 'noun', lang_code: 'th', senses: [{ glosses: ['a'] }], ...extra });

describe('entryFromKaikki: fields', () => {
  it('maps the example from the brief: respelling, IPA, Paiboon romanization, two senses, no register', () => {
    const line = fixtureLines().map((l) => JSON.parse(l.startsWith('{"word":"ขนม"') ? l : 'null') as unknown).find(Boolean);
    const [e] = map(line, thNormalize);
    expect(e.form).toBe('ขนม');
    expect(e.lang).toBe('th');
    expect(e.pos).toBe('NOUN');
    expect(e.glosses).toEqual(['sweets; dessert', 'snack']);
    expect(e.respelling).toContain('ฺ'); // ขะ-หฺนม: phinthu is kept, not normalized away
    expect(e.respelling?.split('-')).toHaveLength(2);
    expect(e.ipa).toBe('/kʰa˨˩.nom˩˩˦/');
    expect(e.romanization).toBe('kà-nǒm'); // the Paiboon roman, not the Royal Institute one
    expect(e.register).toBeUndefined(); // synonym tags (childish, colloquial) belong to the synonym, not the sense
    expect(e.frequencyRank).toBeUndefined();
    expect(e.role).toBeUndefined();
    expect(e.definition).toBeUndefined();
  });

  it('normalizes the headword with the supplied normalizer', () => {
    expect(map(base({ word: 'AbC' }), (s) => s.toLowerCase())[0].form).toBe('abc');
    expect(map(base({ word: '  x  ' }))[0].form).toBe('x');
  });

  it('keeps at most 6 glosses: the first gloss of each sense, in order, without repeats', () => {
    const senses = ['a', 'b', 'a', 'c', 'd', 'e', 'f', 'g', 'h'].map((g) => ({ glosses: [g, `${g} narrower`] }));
    expect(map(base({ senses }))[0].glosses).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('falls back to raw_glosses only when a sense has no glosses', () => {
    expect(map(base({ senses: [{ raw_glosses: ['raw one'] }, { glosses: ['g'], raw_glosses: ['ignored'] }] }))[0].glosses).toEqual(['raw one', 'g']);
  });

  it('maps parts of speech; an unknown heading leaves pos absent rather than guessing', () => {
    const pos = (p: unknown) => map(base({ pos: p }))[0].pos;
    expect(pos('noun')).toBe('NOUN');
    expect(pos('name')).toBe('PROPN');
    expect(pos('verb')).toBe('VERB');
    expect(pos('adj')).toBe('ADJ');
    expect(pos('adv')).toBe('ADV');
    expect(pos('pron')).toBe('PRON');
    expect(pos('prep')).toBe('ADP');
    expect(pos('conj')).toBe('CONJ');
    expect(pos('particle')).toBe('PART');
    expect(pos('num')).toBe('NUM');
    expect(pos('intj')).toBe('INTJ');
    expect(pos('classifier')).toBe('CLF');
    expect(pos('phrase')).toBe('X'); // with a role: see the "units" test
    expect(pos('pronoun-ish')).toBeUndefined();
    expect(pos(7)).toBeUndefined();
    expect(pos(undefined)).toBeUndefined();
  });

  it('maps register from sense tags and raw_tags; unmapped tags (polite, vulgar, dialectal) add nothing', () => {
    const reg = (tags: string[], raw_tags: string[] = []) => map(base({ senses: [{ glosses: ['a'], tags, raw_tags }] }))[0].register;
    expect(reg(['colloquial'])).toEqual(['colloquial']);
    expect(reg(['formal'])).toEqual(['formal']);
    expect(reg(['archaic'])).toEqual(['archaic']);
    expect(reg(['slang', 'vulgar'])).toEqual(['slang']);
    expect(reg(['royal'])).toEqual(['royal']);
    expect(reg(['literary'])).toEqual(['literary']);
    expect(reg(['poetic'])).toEqual(['literary']);
    expect(reg(['Isan'])).toEqual(['regional-isan']);
    expect(reg(['Northern'])).toEqual(['regional-north']);
    expect(reg([], ['Southern'])).toEqual(['regional-south']);
    expect(reg(['childish'])).toEqual(['child-directed']);
    expect(reg(['polite', 'dialectal'])).toBeUndefined();
    expect(reg(['formal', 'formal', 'royal'])).toEqual(['formal', 'royal']);
  });

  it('reads classifiers as strings, {classifier} or {word}, at entry and sense level, ignoring junk', () => {
    const e = map(base({
      classifiers: ['ก', { classifier: 'ข' }, { word: 'ค' }, 7, null, { other: 'x' }, ''],
      senses: [{ glosses: ['a'], classifiers: ['ก', { word: 'ง' }] }],
    }))[0];
    expect(e.classifiers).toEqual(['ก', 'ข', 'ค', 'ง']);
  });

  it('romanization: Paiboon first, else the first romanization form, else absent', () => {
    expect(map(base({ sounds: [{ raw_tags: ['Paiboon'], roman: 'pai' }], forms: [{ form: 'f', tags: ['romanization'] }] }))[0].romanization).toBe('pai');
    expect(map(base({ forms: [{ form: 'x', tags: ['other'] }, { form: 'f1', tags: ['romanization'] }, { form: 'f2', tags: ['romanization'] }] }))[0].romanization).toBe('f1');
    expect(map(base({ sounds: [{ raw_tags: ['Royal Institute'], roman: 'ri' }] }))[0].romanization).toBeUndefined();
  });

  it('respelling is the Phonemic "other"; the Orthographic one is not it', () => {
    const e = map(base({ sounds: [{ other: 'orth', raw_tags: ['Orthographic'] }, { other: 'pho-nem', raw_tags: ['Phonemic'] }, { ipa: '/x/' }, { ipa: '/y/' }] }))[0];
    expect(e.respelling).toBe('pho-nem');
    expect(e.ipa).toBe('/x/');
    expect(map(base({ sounds: [{ other: 'orth', raw_tags: ['Orthographic'] }] }))[0].respelling).toBeUndefined();
  });
});

describe('entryFromKaikki: the real shapes (PLAN6)', () => {
  const sound = (raw_tags: string[], extra: Record<string, unknown> = {}) => ({ raw_tags, ...extra });

  it('units get part of speech X and a role; characters, symbols and punctuation are skipped as non-words', () => {
    for (const [pos, role] of [['phrase', 'phrase'], ['proverb', 'proverb'], ['prep_phrase', 'prepositional phrase'], ['prefix', 'prefix'], ['suffix', 'suffix'], ['infix', 'infix']]) {
      expect(map(base({ pos }))[0]).toMatchObject({ pos: 'X', role });
    }
    for (const pos of ['character', 'symbol', 'punct']) {
      expect(mapKaikkiLine(base({ pos }), id)).toEqual({ skipped: 'non-word', nonWordPos: pos });
    }
    expect(map(base({ pos: 'name' }))[0].pos).toBe('PROPN');
    expect(map(base({ pos: 'noun' }))[0].role).toBeUndefined();
  });

  it('keeps every sense with verbatim tags (tags then raw_tags), topics and the example count; glosses stays short', () => {
    const e = map(base({ senses: [
      { glosses: ['one'], tags: ['Formal', 'transitive'], raw_tags: ['of a god'], topics: ['religion', 'religion', 'law'], examples: [{ text: 'x' }, { text: 'y' }, 5] },
      { glosses: ['two'] },
      { glosses: ['spelling of z'], tags: ['alt-of'], alt_of: [{ word: 'z' }] },
    ] }))[0];
    expect(e.glosses).toEqual(['one', 'two']);
    expect(e.senses).toEqual([
      { gloss: 'one', tags: ['Formal', 'transitive', 'of a god'], topics: ['religion', 'law'], examples: 3 },
      { gloss: 'two' },
      { gloss: 'spelling of z', tags: ['alt-of'] },
    ]);
    expect(e.register).toEqual(['formal']);
    expect(e.altOf).toEqual(['z']);
  });

  it('the full gloss chain is kept in the sense; the short view uses the first, or first + second after a label', () => {
    const e = map(base({ senses: [{ glosses: ['broad', 'narrow'] }, { glosses: ['Lao:', 'the language'] }] }))[0];
    expect(e.glosses).toEqual(['broad', 'Lao: the language']);
    expect(e.senses!.map((s) => s.gloss)).toEqual(['broad — narrow', 'Lao: — the language']);
  });

  it('classifiers are read from the head template expansion when it states them, not otherwise', () => {
    const head = (expansion: string) => ({ head_templates: [{ name: 'th-noun', args: {}, expansion }] });
    expect(map(base(head('จาน • (jaan) (classifier ใบ or ลูก)')))[0].classifiers).toEqual(['ใบ', 'ลูก']);
    expect(map(base(head('รูป • (rûup) (classifier รูป)')))[0].classifiers).toEqual(['รูป']);
    expect(map(base(head('ไหม • (mǎi)')))[0].classifiers).toBeUndefined();
    expect(map(base({ head_templates: 'x' }))[0].classifiers).toBeUndefined();
    expect(map(base({ head_templates: [null, { expansion: 5 }] }))[0].classifiers).toBeUndefined();
  });

  it('etymology number and alt-of headwords', () => {
    expect(map(base({ etymology_number: 2 }))[0].etymology).toBe(2);
    expect(map(base({ etymology_number: 0 }))[0].etymology).toBeUndefined();
    expect(map(base({ etymology_number: '2' }))[0].etymology).toBeUndefined();
    expect(map(base())[0].etymology).toBeUndefined();
    const alt = map(base({ senses: [{ glosses: ['a'], tags: ['alt-of'], alt_of: [{ word: 'p' }, { word: 'p' }, { word: 'q', extra: 'e' }, 3, {}] }] }))[0];
    expect(alt.altOf).toEqual(['p', 'q']);
    expect(map(base())[0].altOf).toBeUndefined();
  });

  it('Orthographic/Phonemic is one tag: read as written, the respelling is the word', () => {
    const e = map(base({ word: 'ขอบคุณ', sounds: [sound(['Orthographic/Phonemic'], { other: 'ขอบคุณ', roman: 'r' }), sound(['Paiboon'], { roman: 'kɔ̀ɔp-kun' }), { ipa: '/i/' }] }))[0];
    expect(e.pronunciations).toEqual([{ respelling: 'ขอบคุณ', ipa: '/i/', romanization: 'kɔ̀ɔp-kun', asWritten: true }]);
    expect(e.respelling).toBe('ขอบคุณ');
    expect(e.pronunciations![0].tags).toBeUndefined();
  });

  it('variant readings keep their labels verbatim and the short view prefers the plain reading', () => {
    const e = map(base({ sounds: [
      sound(['Phonemic', 'Unorthographical', 'Short'], { other: 'v1' }),
      sound(['bound form', 'Phonemic'], { other: 'v2', tags: ['reduplication'] }),
      sound(['Phonemic'], { other: 'plain' }),
      sound(['Paiboon'], { roman: 'r1' }), sound(['Paiboon'], { roman: 'r2' }), sound(['Paiboon'], { roman: 'r3' }),
      { ipa: '/i1/' }, { ipa: '/i2/' }, { ipa: '/i3/' },
    ] }))[0];
    expect(e.pronunciations).toEqual([
      { respelling: 'v1', ipa: '/i1/', romanization: 'r1', tags: ['Unorthographical', 'Short'] },
      { respelling: 'v2', ipa: '/i2/', romanization: 'r2', tags: ['reduplication', 'bound form'] },
      { respelling: 'plain', ipa: '/i3/', romanization: 'r3' },
    ]);
    expect([e.respelling, e.ipa, e.romanization]).toEqual(['plain', '/i3/', 'r3']); // never a mix of different readings
  });

  it('with no plain reading the short view comes from the first reading', () => {
    const e = map(base({ sounds: [sound(['Phonemic', 'Short'], { other: 'a' }), sound(['Phonemic', 'Short'], { other: 'b' }), { ipa: '/1/' }, { ipa: '/2/' }] }))[0];
    expect([e.respelling, e.ipa]).toEqual(['a', '/1/']);
  });

  it('counts that do not match are kept unpaired and flagged, not guessed', () => {
    const m = mapKaikkiLine(base({ sounds: [sound(['Phonemic'], { other: 'a' }), sound(['Phonemic'], { other: 'b' }), { ipa: '/1/' }, { ipa: '/2/' }, { ipa: '/3/' }, sound(['Paiboon'], { roman: 'r' })] }), id);
    expect(m.unpairedPronunciations).toBe(true);
    expect(m.entry!.pronunciations).toEqual([
      { respelling: 'a' }, { respelling: 'b' }, { ipa: '/1/' }, { ipa: '/2/' }, { ipa: '/3/' }, { romanization: 'r' },
    ]);
    expect(mapKaikkiLine(base({ sounds: [sound(['Phonemic'], { other: 'a' }), { ipa: '/1/' }] }), id).unpairedPronunciations).toBeUndefined();
  });

  it('IPA and Paiboon rows without a phonemic respelling pair with each other, or stay apart', () => {
    expect(map(base({ sounds: [{ ipa: '/1/' }, sound(['Paiboon'], { roman: 'r' })] }))[0].pronunciations).toEqual([{ ipa: '/1/', romanization: 'r' }]);
    const apart = mapKaikkiLine(base({ sounds: [{ ipa: '/1/' }, { ipa: '/2/' }, sound(['Paiboon'], { roman: 'r' })] }), id);
    expect(apart.unpairedPronunciations).toBe(true);
    expect(apart.entry!.pronunciations).toHaveLength(3);
    expect(map(base())[0].pronunciations).toBeUndefined();
  });

  it('Orthographic, Royal Institute, homophone and audio rows are not pronunciations', () => {
    const e = map(base({ sounds: [sound(['Orthographic'], { other: 'o', roman: 'x' }), sound(['Royal Institute'], { roman: 'ri' }), { homophone: 'h' }, { audio: 'a.ogg' }] }))[0];
    expect(e.pronunciations).toBeUndefined();
    expect(e.respelling).toBeUndefined();
  });

  it('register: the listed tags map, vague ones do not, a region only from a label that names one', () => {
    const reg = (...tags: string[]) => map(base({ senses: [{ glosses: ['a'], tags }] }))[0].register;
    expect(reg('Northeastern')).toEqual(['regional-isan']);
    expect(reg('obsolete')).toEqual(['archaic']);
    expect(reg('poetic', 'historical')).toEqual(['literary', 'historical']);
    expect(reg('childish')).toEqual(['child-directed']);
    for (const vague of ['dialectal', 'dated', 'humble', 'polite', 'vulgar', 'derogatory', 'offensive', 'humorous', 'idiomatic', 'figuratively', 'Thailand']) {
      expect(reg(vague), vague).toBeUndefined();
    }
  });
});

describe('entryFromKaikki: variants and skips', () => {
  it('ignores form-of / alt-of senses when a real sense exists (and their tags with them)', () => {
    const e = map(base({ senses: [{ glosses: ['real'] }, { glosses: ['variant of x'], tags: ['alt-of', 'archaic'] }, { glosses: ['spelling of y'], tags: ['form-of', 'formal'] }] }))[0];
    expect(e.glosses).toEqual(['real']);
    expect(e.register).toBeUndefined();
  });

  it('keeps form-of / alt-of senses when they are the only ones', () => {
    const e = map(base({ senses: [{ glosses: ['form of z'], tags: ['form-of', 'colloquial'] }, { glosses: ['also alt'], tags: ['alt-of'] }] }))[0];
    expect(e.glosses).toEqual(['form of z', 'also alt']);
    expect(e.register).toEqual(['colloquial']);
  });

  it('says why a line produced nothing', () => {
    expect(mapKaikkiLine(null, id).skipped).toBe('not-an-object');
    expect(mapKaikkiLine([1], id).skipped).toBe('not-an-object');
    expect(mapKaikkiLine('str', id).skipped).toBe('not-an-object');
    expect(mapKaikkiLine(base({ word: undefined }), id).skipped).toBe('no-word');
    expect(mapKaikkiLine(base({ word: '   ' }), id).skipped).toBe('no-word');
    expect(mapKaikkiLine(base({ word: 5 }), id).skipped).toBe('no-word');
    expect(mapKaikkiLine(base(), () => '').skipped).toBe('no-word');
    expect(mapKaikkiLine(base(), () => { throw new Error('boom'); }).skipped).toBe('no-word');
    expect(mapKaikkiLine(base({ lang_code: 'en' }), id).skipped).toBe('wrong-language');
    expect(mapKaikkiLine(base({ senses: [] }), id).skipped).toBe('no-gloss');
    expect(mapKaikkiLine(base({ senses: undefined }), id).skipped).toBe('no-gloss');
    expect(mapKaikkiLine(base({ senses: [{ glosses: [] }, { glosses: [3, null, ' '] }, 'x', null] }), id).skipped).toBe('no-gloss');
    expect(mapKaikkiLine(base(), id).skipped).toBeUndefined();
  });

  it('accepts a line without lang_code, and honours the language argument', () => {
    const { lang_code: _l, ...noCode } = base();
    expect(map(noCode)).toHaveLength(1);
    expect(entryFromKaikki(base({ lang_code: 'es' }), id, 'es')[0].lang).toBe('es');
  });

  it('never throws on hostile shapes', () => {
    const junk: unknown[] = [undefined, null, 0, 'x', [], {}, { senses: 'x' }, { word: 'w', senses: [null, 5, 'a', [], { glosses: 'g' }] },
      { word: 'w', senses: [{ glosses: ['a'], tags: 'x', raw_tags: 7, classifiers: 'nope' }], sounds: [null, 5, 'x', { ipa: 7, other: {} }], forms: 'x', classifiers: 5 }];
    for (const j of junk) expect(() => map(j)).not.toThrow();
    const e = map(junk[junk.length - 1]);
    expect(e).toHaveLength(1);
    expect(e[0].glosses).toEqual(['a']);
  });
});

describe('format helpers', () => {
  it('bucketOf is stable, in range, and spreads forms', () => {
    expect(bucketOf('ขนม')).toBe(bucketOf('ขนม'));
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const b = bucketOf(`ก${i}`);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(256);
      seen.add(b);
    }
    expect(seen.size).toBeGreaterThan(240);
    expect(bucketOf('')).toBe(0x811c9dc5 % 256);
  });

  it('shardName is two lowercase hex digits', () => {
    expect(shardName(0)).toBe('s-00.json');
    expect(shardName(10)).toBe('s-0a.json');
    expect(shardName(255)).toBe('s-ff.json');
  });

  it('compact entries round-trip, with a fixed key order', () => {
    const e: DictionaryEntry = {
      form: 'ฟ', lang: 'th', pos: 'NOUN', glosses: ['a', 'b'], respelling: 'r', ipa: '/i/', romanization: 't', register: ['formal'],
      classifiers: ['ตัว'], role: 'o', definition: 'd', frequencyRank: 5,
      senses: [{ gloss: 'a', tags: ['t'], topics: ['o'], examples: 2 }, { gloss: 'b' }],
      pronunciations: [{ respelling: 'r', ipa: '/i/', romanization: 't', tags: ['Short'], asWritten: true }, { ipa: '/j/' }],
      etymology: 2, altOf: ['x', 'y'],
    };
    const c = compactEntry(e);
    expect(Object.keys(c)).toEqual(['p', 'g', 'r', 'i', 't', 'c', 'l', 'o', 'd', 'f', 's', 'n', 'y', 'a']);
    expect(expandEntry('ฟ', 'th', JSON.parse(JSON.stringify(c)))).toEqual(e);
  });

  it('expandEntry drops what it cannot trust', () => {
    expect(expandEntry('x', 'th', null)).toBeUndefined();
    expect(expandEntry('x', 'th', { g: [] })).toBeUndefined();
    expect(expandEntry('x', 'th', { g: [3] })).toBeUndefined();
    expect(expandEntry('x', 'th', { g: ['a'], p: 'BOGUS', c: ['formal', 'nonsense'], f: 0, l: [1, 'ก'] })).toEqual({ form: 'x', lang: 'th', glosses: ['a'], register: ['formal'], classifiers: ['ก'] });
    expect(expandEntry('x', 'th', { g: ['a'], s: [{ g: '' }, 3, { g: 'ok', x: 0, t: [1] }], n: [{}, 'x', { r: 'r', w: 'yes' }], y: 0, a: [5] }))
      .toEqual({ form: 'x', lang: 'th', glosses: ['a'], senses: [{ gloss: 'ok' }], pronunciations: [{ respelling: 'r' }] });
  });
});
