import { describe, expect, it } from 'vitest';
import type { DictionaryEntry } from '../../src/core';
import {
  applyResolutions, compareHandToDictionary, corpusCoverage, countByKind, createDictCollector, parseResolutions,
  type DictCollection, type DictStats, type HandData, type HandEntry,
} from '../../src/dict/compare';
import { glossesOverlap, handGlossStems, isBracketOnly, romanSkeleton } from '../../src/dict/compare-text';
import { renderDisagreementsJson, renderReport } from '../../src/dict/compare-report';
import { thNormalize } from './helpers';

const ID = 'kaikki-th@2026-09-28';
const IDS = { hand: 'adapter-th@2:hand', phrases: 'adapter-th@2:phrases', orthExceptions: 'adapter-th@2:orth-exceptions' };

const emptyStats = (over: Partial<DictStats> = {}): DictStats => ({
  lines: 0, blank: 0, malformed: 0, noEntry: 0, entries: 0, forms: 0, formsWithRespelling: 0, formsWithIpa: 0, formsWithRomanization: 0,
  formsWithAnyPronunciation: 0, posCounts: {}, registerCounts: {}, classifierForms: new Set(), ...over,
});

function dictOf(entries: DictionaryEntry[], stats: Partial<DictStats> = {}): DictCollection {
  const index = new Map<string, DictionaryEntry[]>();
  for (const e of entries) index.set(e.form, [...(index.get(e.form) ?? []), e]);
  return { index, stats: emptyStats({ forms: index.size, entries: entries.length, ...stats }) };
}

const d = (form: string, over: Partial<DictionaryEntry> = {}): DictionaryEntry => ({ form, lang: 'th', glosses: ['thing'], ...over });
const h = (form: string, over: Partial<HandEntry> = {}): HandEntry => ({ form, pos: 'NOUN', gloss: 'thing', category: 'core', ...over });
const handOf = (over: Partial<HandData> = {}): HandData => ({ lang: 'th', sourceIds: IDS, entries: [], phrases: [], compounds: [], exceptions: [], ...over });
const run = (hand: HandData, dict: DictCollection, resolutions?: Parameters<typeof applyResolutions>[1]) =>
  compareHandToDictionary(hand, dict, { dictionaryId: ID, resolutions });
const ofKind = (r: ReturnType<typeof run>, kind: string) => r.disagreements.filter((x) => x.field === kind);

describe('gloss and romanization helpers', () => {
  it('stems content words and ignores brackets, stop words and inflection', () => {
    expect(handGlossStems('to understand')).toEqual(['understand']);
    expect(handGlossStems('fault, blame, penalty')).toEqual(['fault', 'blam', 'penalty']); // light stems
    expect(handGlossStems('to love (deeply)')).toEqual(['lov']);
    expect(glossesOverlap('to understand', ['understanding; comprehension'])).toBe(true);
    expect(glossesOverlap('house, home', ['a building where people live; home'])).toBe(true);
    expect(glossesOverlap('house, home', ['water'])).toBe(false);
  });

  it('meets pronouns by person, number words by digit, and function words by their small words', () => {
    expect(glossesOverlap('I (male)', ['a first person pronoun employed by a male'])).toBe(true);
    expect(glossesOverlap('you (polite)', ['second-person pronoun'])).toBe(true);
    expect(glossesOverlap('he, she, they', ['he; she; they'])).toBe(true);
    expect(glossesOverlap('two', ['2 (Thai numeral)'])).toBe(true);
    expect(glossesOverlap('in order to, for', ['for; since'], true)).toBe(true);
    expect(glossesOverlap('-self', ['oneself'])).toBe(true);
    expect(glossesOverlap('five', ['three'])).toBe(false);
  });

  it('knows a bracket-only gloss, and a gloss with nothing to compare', () => {
    expect(isBracketOnly('(urging particle)')).toBe(true);
    expect(isBracketOnly('to eat (a meal)')).toBe(false);
    expect(glossesOverlap('x', ['y'])).toBe(false);
    expect(glossesOverlap('to', [])).toBeUndefined();
  });

  it('folds Paiboon and the course romanization to the same skeleton, and keeps real differences apart', () => {
    expect(romanSkeleton('chan', 'rtgs')).toBe(romanSkeleton('chǎn', 'paiboon'));
    expect(romanSkeleton('khaochai', 'rtgs')).toBe(romanSkeleton('kâo-jai', 'paiboon'));
    expect(romanSkeleton('nueng', 'rtgs')).toBe(romanSkeleton('nʉ̀ng', 'paiboon'));
    expect(romanSkeleton('pho', 'rtgs')).toBe(romanSkeleton('pɔɔ', 'paiboon'));
    expect(romanSkeleton('khon', 'rtgs')).not.toBe(romanSkeleton('kan', 'paiboon'));
    expect(romanSkeleton('prathan', 'rtgs')).toBe(romanSkeleton('bprà-taan', 'paiboon'));
  });
});

describe('createDictCollector', () => {
  const line = (word: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ word, lang_code: 'th', pos: 'noun', senses: [{ glosses: [`gloss of ${word}`] }], ...extra });

  it('keeps entries of wanted forms only, and counts everything', () => {
    const c = createDictCollector({ lang: 'th', normalize: thNormalize, wanted: new Set(['คน']) });
    c.addLine(line('คน', { sounds: [{ ipa: '/kʰon˧/' }] }));
    c.addLine(line('บ้าน'));
    c.addLine('');
    c.addLine('{not json');
    c.addLine(JSON.stringify({ word: 'x', lang_code: 'en', pos: 'noun', senses: [{ glosses: ['x'] }] }));
    const out = c.finish();
    expect([...out.index.keys()]).toEqual(['คน']);
    expect(out.stats.lines).toBe(4);
    expect(out.stats.blank).toBe(1);
    expect(out.stats.malformed).toBe(1);
    expect(out.stats.noEntry).toBe(1);
    expect(out.stats.entries).toBe(2);
    expect(out.stats.forms).toBe(2);
    expect(out.stats.formsWithIpa).toBe(1);
    expect(out.stats.formsWithAnyPronunciation).toBe(1);
  });
});

describe('coverage and missing', () => {
  const hand = handOf({
    entries: [h('คน'), h('บ้าน', { pos: 'NOUN', category: 'function' }), h('กิน', { pos: 'VERB' }), h('ตัว', { pos: 'CLF', category: 'classifier' })],
    phrases: [{ form: 'กินข้าว', gloss: 'to eat' }, { form: 'ลาก่อน', gloss: 'goodbye' }],
    compounds: ['ผลไม้', 'วันนี้'],
  });
  const dict = dictOf([d('คน', { pos: 'NOUN' }), d('บ้าน', { pos: 'VERB' }), d('กิน', { pos: 'VERB' }), d('กินข้าว', { pos: 'X' }), d('วันนี้', { pos: 'NOUN' })]);

  it('counts hand entries by form, by form + part of speech and by equivalent part of speech', () => {
    const r = run(hand, dict);
    const all = r.coverage.find((c) => c.label === 'all hand entries')!;
    expect(all.total).toBe(4);
    expect(all.byForm).toBe(3);
    expect(all.byFormPos).toBe(2); // คน NOUN, กิน VERB
    expect(all.byFormPosCompatible).toBe(2);
    expect(r.coverage.find((c) => c.label === 'function words')!.total).toBe(1);
    expect(r.coverage.find((c) => c.label === 'classifiers')!.byForm).toBe(0);
    const phrases = r.coverage.find((c) => c.label.startsWith('phrase units'))!;
    expect([phrases.total, phrases.byForm]).toEqual([2, 1]);
    const compounds = r.coverage.find((c) => c.label === 'course compounds')!;
    expect([compounds.total, compounds.byForm]).toEqual([2, 1]);
  });

  it('records a missing disagreement for each absent hand form, phrase and compound, once', () => {
    const r = run(hand, dict);
    const missing = ofKind(r, 'missing');
    expect(missing.map((m) => m.form).sort()).toEqual(['ตัว', 'ผลไม้', 'ลาก่อน'].sort());
    const phrase = missing.find((m) => m.form === 'ลาก่อน')!;
    expect(phrase.ours.sourceId).toBe(IDS.phrases);
    expect(phrase.theirs.sourceId).toBe(ID);
    expect(phrase.status).toBe('open');
    expect(missing.find((m) => m.form === 'ตัว')!.ours.sourceId).toBe(IDS.hand);
    expect(new Set(r.disagreements.map((x) => x.id)).size).toBe(r.disagreements.length);
  });
});

describe('part of speech', () => {
  it('records a hand part of speech with no equivalent in the dictionary', () => {
    const r = run(handOf({ entries: [h('ดี', { pos: 'ADJ', gloss: 'good' })] }), dictOf([d('ดี', { pos: 'NOUN', glosses: ['goodness'] })]));
    const pos = ofKind(r, 'part-of-speech');
    expect(pos).toHaveLength(1);
    expect(pos[0].ours.value).toBe('ADJ');
    expect(pos[0].theirs.value).toBe('NOUN');
    expect(pos[0].note).toMatch(/Possibly different/);
  });

  it('accepts the usual equivalents (adjective as verb, auxiliary as verb, classifier as noun)', () => {
    const entries = [h('ดี', { pos: 'ADJ' }), h('จะ', { pos: 'AUX' }), h('ตัว', { pos: 'CLF' }), h('ที่', { pos: 'SCONJ' })];
    const r = run(handOf({ entries }), dictOf([d('ดี', { pos: 'VERB' }), d('จะ', { pos: 'VERB' }), d('ตัว', { pos: 'NOUN' }), d('ที่', { pos: 'CONJ' })], { classifierForms: new Set(['ตัว']) }));
    expect(ofKind(r, 'part-of-speech')).toHaveLength(0);
    expect(r.coverage[0].byFormPos).toBe(0);
    expect(r.coverage[0].byFormPosCompatible).toBe(4);
  });

  it('cannot judge entries without a usable part of speech, and says so', () => {
    const r = run(handOf({ entries: [h('กิน', { pos: 'VERB' })] }), dictOf([d('กิน', { pos: 'X' }), d('กิน')]));
    expect(ofKind(r, 'part-of-speech')).toHaveLength(0);
    expect(Object.keys(r.notComparable).some((k) => k.startsWith('part of speech'))).toBe(true);
  });
});

describe('meaning', () => {
  it('records a gloss that shares no content word, and not one that shares a stem', () => {
    const entries = [h('รัก', { pos: 'VERB', gloss: 'to love' }), h('บ้าน', { gloss: 'house, home' }), h('แมว', { gloss: 'cat' })];
    const dict = dictOf([d('รัก', { pos: 'VERB', glosses: ['to be in love; loving'] }), d('บ้าน', { pos: 'NOUN', glosses: ['home; village'] }), d('แมว', { pos: 'NOUN', glosses: ['dog'] })]);
    const m = ofKind(run(handOf({ entries }), dict), 'meaning');
    expect(m.map((x) => x.form)).toEqual(['แมว']);
    expect(m[0].note).toMatch(/Possibly different/);
    expect(m[0].note).toMatch(/synonym/);
  });

  it('uses every sense gloss when the entry has senses, and skips a bracket-only gloss', () => {
    const entries = [h('ลิง', { gloss: 'monkey' }), h('นะ', { pos: 'PART', gloss: '(softening particle)' })];
    const dict = dictOf([d('ลิง', { pos: 'NOUN', glosses: ['ape'], senses: [{ gloss: 'ape' }, { gloss: 'a monkey' }] }), d('นะ', { pos: 'PART', glosses: ['x'] })]);
    const r = run(handOf({ entries }), dict);
    expect(ofKind(r, 'meaning')).toHaveLength(0);
    expect(Object.keys(r.notComparable).some((k) => /bracketed description/.test(k))).toBe(true);
  });
});

describe('register', () => {
  const vocab = { registerCounts: { formal: 10, colloquial: 10, slang: 10, archaic: 10 } };

  it('records a hand tag the dictionary lacks, once per entry', () => {
    const r = run(handOf({ entries: [h('ก', { register: ['formal'] }), h('ข', { register: ['colloquial'] })] }),
      dictOf([d('ก', { pos: 'NOUN', register: ['colloquial'] }), d('ข', { pos: 'NOUN', register: ['colloquial'] })], vocab));
    const reg = ofKind(r, 'register');
    expect(reg.map((x) => x.form)).toEqual(['ก']);
    expect(reg[0].ours.value).toBe('formal');
    expect(reg[0].theirs.value).toBe('colloquial');
  });

  it('records a strong dictionary label only when every sense carries it', () => {
    const all = d('ค', { pos: 'NOUN', glosses: ['a'], senses: [{ gloss: 'a', tags: ['vulgar'] }, { gloss: 'b', tags: ['vulgar'] }] });
    const some = d('ง', { pos: 'NOUN', glosses: ['a'], senses: [{ gloss: 'a', tags: ['archaic'] }, { gloss: 'b' }] });
    const r = run(handOf({ entries: [h('ค'), h('ง')] }), dictOf([all, some], vocab));
    expect(ofKind(r, 'register').map((x) => x.form)).toEqual(['ค']);
    expect(ofKind(r, 'register')[0].theirs.value).toMatch(/vulgar/);
  });

  it('does not compare a tag the dictionary has no label for', () => {
    const r = run(handOf({ entries: [h('ก', { register: ['royal'] })] }), dictOf([d('ก', { pos: 'NOUN' })], vocab));
    expect(ofKind(r, 'register')).toHaveLength(0);
    expect(Object.keys(r.notComparable).some((k) => /royal/.test(k))).toBe(true);
  });
});

describe('classifier', () => {
  it('records a classifier entry the dictionary neither files nor lists as one', () => {
    const entries = [h('ชาม', { pos: 'CLF' }), h('ตัว', { pos: 'CLF' }), h('ลูก', { pos: 'CLF' })];
    const dict = dictOf([d('ชาม', { pos: 'NOUN' }), d('ตัว', { pos: 'NOUN' }), d('ลูก', { pos: 'CLF' })], { classifierForms: new Set(['ตัว', 'ลูก']) });
    expect(ofKind(run(handOf({ entries }), dict), 'classifier').map((x) => x.form)).toEqual(['ชาม']);
  });
});

describe('syllables, tone and pronunciation of the exception lists', () => {
  const x = (surface: string, respelling: string, tones?: string[], list: 'exception' | 'settled' = 'exception') => ({ surface, respelling, list, tones });

  it('agrees when ANY listed reading matches, and records a syllable count no reading has', () => {
    const exceptions = [x('ผลาญ', 'ผะ-หฺลาน', ['low', 'rising']), x('ขนม', 'ขะ-หฺนม', ['low', 'rising'])];
    const dict = dictOf([
      d('ผลาญ', { pos: 'VERB', ipa: '/pʰlaːn˩˩˦/' }),
      d('ขนม', { pos: 'NOUN', ipa: '/kʰa˨˩.nom˩˩˦/', pronunciations: [{ ipa: '/kʰnom˩˩˦/' }] }),
    ]);
    const r = run(handOf({ exceptions }), dict);
    const syl = ofKind(r, 'syllables');
    expect(syl.map((s) => s.form)).toEqual(['ผลาญ']);
    expect(syl[0].ours.sourceId).toBe(IDS.orthExceptions);
    expect(ofKind(r, 'tone')).toHaveLength(0);
  });

  it('records a tone that differs from every reading with the same number of syllables', () => {
    const exceptions = [x('ก็', 'ก้อ', ['falling']), x('คน', 'คน', ['mid'])];
    const dict = dictOf([d('ก็', { pos: 'PART', ipa: '/kɔː˥˩/' }), d('คน', { pos: 'NOUN', ipa: '/kʰon˧/' })]);
    const r = run(handOf({ exceptions }), dict);
    expect(ofKind(r, 'tone')).toHaveLength(0);
    const wrong = run(handOf({ exceptions: [x('ก็', 'ก้อ', ['high'])] }), dict);
    const tone = ofKind(wrong, 'tone');
    expect(tone).toHaveLength(1);
    expect(tone[0].ours.value).toMatch(/high/);
    expect(tone[0].theirs.value).toMatch(/˥˩/);
    expect(wrong.checked.toneChecked).toBe(1);
  });

  it('counts a tone as comparable only when there is IPA with tone letters', () => {
    const r = run(handOf({ exceptions: [x('คน', 'คน', ['mid'])] }), dictOf([d('คน', { pos: 'NOUN', respelling: 'คน' })]));
    expect(ofKind(r, 'tone')).toHaveLength(0);
    expect(Object.keys(r.notComparable).some((k) => /tone letters/.test(k))).toBe(true);
  });

  it('treats respellings that the spelling engine hears alike as the same, and flags a different sound', () => {
    const same = run(handOf({ exceptions: [x('ธรรมดา', 'ทำ-มะ-ดา')] }), dictOf([d('ธรรมดา', { pos: 'ADJ', respelling: 'ทัม-มะ-ดา' })]));
    expect(ofKind(same, 'pronunciation')).toHaveLength(0);
    const other = run(handOf({ exceptions: [x('ธรรมดา', 'ทำ-มะ-ดา')] }), dictOf([d('ธรรมดา', { pos: 'ADJ', respelling: 'ทา-มะ-ดา' })]));
    const p = ofKind(other, 'pronunciation');
    expect(p).toHaveLength(1);
    expect(p[0].note).toMatch(/Possibly different/);
  });
});

describe('hand romanization', () => {
  it('compares through the coarse skeleton against any listed romanization', () => {
    const entries = [h('ฉัน', { translit: 'chan' }), h('พูด', { translit: 'phut' }), h('ขาว', { translit: 'khao' })];
    const dict = dictOf([
      d('ฉัน', { pos: 'PRON', romanization: 'chǎn' }),
      d('พูด', { pos: 'VERB', romanization: 'pûut' }),
      d('ขาว', { pos: 'ADJ', romanization: 'kǎao', pronunciations: [{ romanization: 'khao', tags: ['Royal Institute'] }] }),
    ]);
    const r = run(handOf({ entries }), dict);
    const p = ofKind(r, 'pronunciation');
    expect(p).toHaveLength(0);
    expect(r.checked.romanizationChecked).toBe(3);
  });

  it('records a romanization no listed reading matches', () => {
    const r = run(handOf({ entries: [h('คน', { translit: 'kan' })] }), dictOf([d('คน', { pos: 'NOUN', romanization: 'kon' })]));
    const p = ofKind(r, 'pronunciation');
    expect(p).toHaveLength(1);
    expect(p[0].ours.value).toBe('kan');
    expect(p[0].theirs.value).toBe('kon');
  });
});

describe('pronunciation coverage', () => {
  it('counts hand forms and dictionary forms with each reading', () => {
    const dict = dictOf([d('คน', { pos: 'NOUN', respelling: 'คน', ipa: '/kʰon˧/' }), d('บ้าน', { pos: 'NOUN', romanization: 'bâan' }), d('นา', { pos: 'NOUN' })],
      { forms: 10, formsWithRespelling: 8, formsWithIpa: 7, formsWithRomanization: 9, formsWithAnyPronunciation: 9 });
    const r = run(handOf({ entries: [h('คน', { translit: 'khon' }), h('บ้าน'), h('นา'), h('หมา')] }), dict);
    const p = r.pronunciation;
    expect(p.dictionary).toEqual({ forms: 10, withRespelling: 8, withIpa: 7, withRomanization: 9, withAny: 9 });
    expect(p.hand.entries).toBe(4);
    expect(p.hand.withOwnRomanization).toBe(1);
    expect(p.hand.formsInDictionary).toBe(3);
    expect(p.hand.dictRespelling).toBe(1);
    expect(p.hand.dictIpa).toBe(1);
    expect(p.hand.dictRomanization).toBe(1);
    expect(p.hand.dictAny).toBe(2);
  });

  it('counts corpus tokens with a hand analysis, a dictionary entry, a dictionary pronunciation, or neither', () => {
    const dict = dictOf([d('คน', { pos: 'NOUN', ipa: '/kʰon˧/' }), d('บ้าน', { pos: 'NOUN' })]);
    const { rows, total } = corpusCoverage([
      { name: 'b.txt', tokens: [{ form: 'คน', hand: true }, { form: 'บ้าน', hand: false }, { form: 'หมา', hand: false }, { form: 'คน', hand: true }] },
      { name: 'a.txt', tokens: [{ form: 'แมว', hand: true }] },
    ], dict);
    expect(rows.map((r) => r.name)).toEqual(['a.txt', 'b.txt']);
    const b = rows[1];
    expect([b.tokens, b.types, b.withHand, b.withDictionary, b.withDictionaryPronunciation, b.neither]).toEqual([4, 3, 2, 3, 2, 1]);
    expect(total.tokens).toBe(5);
    expect(total.types).toBe(4);
    expect(total.neither).toBe(1);
  });
});

describe('resolutions', () => {
  const hand = handOf({ entries: [h('คน'), h('บ้าน')] });
  const dict = dictOf([]);

  it('reads a valid file and reports the entries it cannot read', () => {
    const { map, problems } = parseResolutions({
      'th:missing:hand:คน': { by: 'Khun A', at: '2026-10-02', decision: 'theirs', note: 'checked' },
      'th:missing:hand:x': { by: '', at: '2026-10-02', decision: 'ours' },
      'th:missing:hand:y': { by: 'B', at: '2026-10-02', decision: 'maybe' },
    });
    expect([...map.keys()]).toEqual(['th:missing:hand:คน']);
    expect(problems).toHaveLength(2);
    expect(parseResolutions({}).map.size).toBe(0);
    expect(parseResolutions({ resolutions: { 'a': { by: 'B', at: '2026-10-02', decision: 'both' } } }).map.size).toBe(1);
    expect(parseResolutions([]).problems).toHaveLength(1);
  });

  it('marks a resolved id as resolved with its decision and keeps the freshly computed sides', () => {
    const resolutions = new Map([['th:missing:hand:คน', { by: 'Khun A', at: '2026-10-02', decision: 'both' as const }], ['th:gone', { by: 'Khun A', at: '2026-10-02', decision: 'ours' as const }]]);
    const r = run(hand, dict, resolutions);
    const resolved = r.disagreements.find((x) => x.id === 'th:missing:hand:คน')!;
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolution).toEqual({ by: 'Khun A', at: '2026-10-02', decision: 'both' });
    expect(resolved.ours.sourceId).toBe(IDS.hand);
    expect(r.disagreements.find((x) => x.id === 'th:missing:hand:บ้าน')!.status).toBe('open');
    expect(r.staleResolutions).toEqual(['th:gone']);
    expect(countByKind(r.disagreements).find((c) => c.kind === 'missing')).toEqual({ kind: 'missing', open: 1, resolved: 1 });
  });

  it('applyResolutions without resolutions changes nothing', () => {
    const r = run(hand, dict);
    expect(applyResolutions(r.disagreements, undefined).merged).toEqual(r.disagreements);
  });
});

describe('determinism and the report', () => {
  const entries: HandEntry[] = Array.from({ length: 60 }, (_, i) => h(`ก${String.fromCharCode(0xe01 + (i % 40))}${i}`));
  const hand = handOf({ entries });
  const dict = dictOf([]);
  const src = { file: 'data/dictionaries/x.jsonl', bytes: 10, lines: 3, sha256: 'ab', lastModified: '2026-09-28' };
  const render = (hd: HandData) => {
    const result = run(hd, dict);
    const input = { result, dictStats: dict.stats, source: src, corpus: corpusCoverage([], dict) };
    return { report: renderReport(input), json: renderDisagreementsJson(input) };
  };

  it('gives byte-identical output for the same input, whatever the order of the hand entries', () => {
    const a = render(hand);
    expect(render(hand)).toEqual(a);
    expect(render(handOf({ entries: [...entries].reverse() }))).toEqual(a);
  });

  it('starts with the attribution, lists at most 40 of a kind and holds all in the JSON', () => {
    const { report, json } = render(hand);
    expect(report.split('\n').slice(0, 3).join('\n')).toMatch(/CC BY-SA 4\.0/);
    expect(report).toMatch(/kaikki-th@2026-09-28/);
    const section = report.split('### missing')[1].split('\n### ')[0];
    expect(section.match(/\| open \|/g)).toHaveLength(40);
    const parsed = JSON.parse(json) as { disagreements: unknown[]; attribution: string; counts: Record<string, { open: number }> };
    expect(parsed.disagreements).toHaveLength(60);
    expect(parsed.counts.missing.open).toBe(60);
    expect(parsed.attribution).toMatch(/CC BY-SA 4\.0/);
    expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}T/); // no timestamp
  });

  it('never calls anything wrong', () => {
    const { report, json } = render(hand);
    expect(json).not.toMatch(/\bwrong\b|\berror\b/i);
    // the report may say that a record is never "wrong"; it must not call anything wrong itself
    expect(report.replace('never "wrong"', '')).not.toMatch(/\bwrong\b|\berror\b/i);
  });
});
