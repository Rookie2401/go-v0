/**
 * The Spanish word list against the dictionary (src/dict/compare-es.ts, scripts/dict-compare-es.mts).
 *
 * The dictionary fixture test/dict/fixtures/kaikki-es-compare.jsonl is HAND-MADE, not an extract of the real kaikki.org
 * file: its glosses, tags and head templates are written for these tests and may differ from the real file. The word
 * list below is a small one built here, so the comparison tests do not depend on the real hand list. Only the
 * "word list as the adapter holds it" tests and the CLI run read the real one.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { esLexicon } from '../../src/adapters/es';
import {
  ES_KIND_ORDER, ES_POS_COMPATIBLE, compareEsFile, compareEsHandToDictionary, createEsCollector, esDictionaryId, esHandData, fileLines,
  parseGenderArg, usSpelling, wantedHeadwords, type EsDictCollection, type EsHandEntry,
} from '../../src/dict/compare-es';
import type { Resolution } from '../../src/dict/compare';
import { runNode } from '../helpers/cli';
import { tmpDir } from './helpers';

const FIXTURE = path.resolve('test/dict/fixtures/kaikki-es-compare.jsonl');
const DICT_ID = 'kaikki-es@2026-09-28';
const OURS_ID = 'adapter-es@4:hand';

const e = (lemma: string, pos: EsHandEntry['pos'], gloss: string, extra: Partial<EsHandEntry> = {}): EsHandEntry => ({ lemma, pos, gloss, varieties: [], ...extra });

/** Every case the fixture was written for. The comment after each says what the comparison should do. */
const HAND: EsHandEntry[] = [
  e('madre', 'NOUN', 'mother', { gender: 'f' }), // agrees on everything
  e('casa', 'NOUN', 'house', { gender: 'f' }),
  e('día', 'NOUN', 'day', { gender: 'f' }), // gender: dictionary tag says masculine
  e('mapa', 'NOUN', 'map', { gender: 'f' }), // gender: no tag, head template says m
  e('mano', 'NOUN', 'hand', { gender: 'f' }), // gender via head template, agrees
  e('artista', 'NOUN', 'artist', { gender: 'mf' }), // by-personal-gender: compatible
  e('turista', 'NOUN', 'tourist', { gender: 'm' }), // head template mfbysense: compatible with either
  e('cura', 'NOUN', 'cure', { gender: 'f' }), // two noun entries (priest m, cure f): read together, compatible
  e('agua', 'NOUN', 'water', { gender: 'm' }), // the dictionary gives no gender: not comparable
  e('perro', 'NOUN', 'dog', { gender: 'm' }), // meaning: the dictionary gloss shares no word
  e('libro', 'NOUN', 'book', { gender: 'm' }),
  e('mesa', 'NOUN', 'table', { gender: 'f' }),
  e('bonito', 'ADJ', 'pretty'),
  e('cantar', 'VERB', 'to sing'), // part of speech: the dictionary has only a noun
  e('el', 'DET', 'the'), // article: compatible; no content word in the gloss: meaning not comparable
  e('este', 'DET', 'this'),
  e('ser', 'AUX', 'to be (essence)'), // AUX against verb
  e('que', 'SCONJ', 'that'), // SCONJ against conj
  e('del', 'ADP', 'of the (de + el)'), // ADP against contraction
  e('dados', 'NOUN', 'dice', { gender: 'm' }), // missing: only a form-of entry
  e('zzzfalta', 'NOUN', 'nothing', { gender: 'f' }), // missing: no entry
  e('Ana', 'PROPN', 'Ana (name)'), // missing
  e('Pedro', 'PROPN', 'Pedro (name)'), // present: nothing else is compared
  e('Marta', 'PROPN', 'Marta (name)'), // present under another part of speech: nothing is compared
  e('cipote', 'NOUN', 'boy, kid', { gender: 'm', varieties: ['es-HN', 'colloquial'] }), // Honduras among the labels
  e('carro', 'NOUN', 'car', { gender: 'm', varieties: ['es-419'] }), // Latin-America
  e('pisto', 'NOUN', 'money (informal); in Spain, a vegetable stew', { gender: 'm', varieties: ['es-CA'] }), // variety: the dictionary says Spain
  e('chele', 'NOUN', 'fair-skinned or fair-haired person (informal)', { gender: 'm', varieties: ['es-CA'] }), // variety: no label (weaker)
  e('ordenador', 'NOUN', 'computer (Spain; Latin America says computadora)', { gender: 'm', varieties: ['es-ES'] }), // no label, not a target region: nothing
  e('catracho', 'NOUN', 'Honduran man', { gender: 'm', varieties: ['es-HN'] }), // Central-America is around Honduras
  e('baleada', 'NOUN', 'Honduran snack: a folded flour tortilla', { gender: 'f', varieties: ['es-HN'] }), // variety: the dictionary says Mexico
  e('vos', 'PRON', 'you (informal, voseo)', { varieties: ['voseo'] }), // voseo is a feature, not a region
  e('cuatro', 'NUM', 'four'), // the dictionary writes the number word too: not a meaning difference
  e('alguno', 'DET', 'some', { forms: [{ form: 'algún', tags: 'Gender=Masc Number=Sing' }] }), // "apocopic form of alguno" (alt_of) is a form of it
  e('centro', 'NOUN', 'centre', { gender: 'm' }), // British spelling against "center": not a meaning difference
  e('además', 'ADV', 'besides, also'), // "also" is a stop word for the helper; a whole word in common still counts
  e('mi', 'DET', 'my'), // part of speech: the det entry is only "apocopic form of mío"; the noun is the musical note
  e('tía', 'NOUN', 'aunt', { gender: 'f' }), // meaning: "female equivalent of tío" is a form-of sense, the own sense is "girl"
  e('frutilla', 'NOUN', 'strawberry (Argentina)', { gender: 'f', varieties: ['es-AR'] }), // variety: the only label sits on another meaning
  e('cipota', 'NOUN', 'girl, kid', { gender: 'f', varieties: ['es-HN'] }), // missing (only "female equivalent of cipote"), but that sense is labelled Honduras
  e('catracha', 'NOUN', 'Honduran woman', { gender: 'f', varieties: ['es-HN'] }), // missing, and the form-of sense has no label: the weaker variety record
  e('pulpería', 'NOUN', 'small neighbourhood shop', { gender: 'f', varieties: ['es-CA'] }), // no entry at all: missing only, listed in the overview
  e('sinsentido', 'NOUN', 'nonsense', { gender: 'm' }), // missing: the dictionary has the headword but no definition (a "no-gloss" sense)
  e('moto', 'NOUN', 'motorbike', { gender: 'f' }), // the feminine noun is only "clipping of motocicleta": its gender tag is read, its gloss has no English word
  e('foto', 'NOUN', 'photograph', { gender: 'f' }), // the gloss of an alt-of sense is read for the meaning
  e('tener', 'VERB', 'to have', {
    forms: [
      { form: 'tener', tags: 'inf' }, { form: 'tengo', tags: '1s pres' }, { form: 'tienes', tags: '2s pres' }, { form: 'tenga', tags: '1s subj' },
      { form: 'tenga', tags: '3s subj' }, { form: 'tenemos', tags: '1p pres' }, { form: 'tenía', tags: '1s impf' }, { form: 'tenía', tags: '3s impf' },
    ],
  }),
];

function collect(lines: string[], hand: readonly EsHandEntry[] = HAND): EsDictCollection {
  const c = createEsCollector(wantedHeadwords(hand));
  for (const l of lines) c.addLine(l);
  return c.finish();
}
const fixtureLines = (): string[] => fs.readFileSync(FIXTURE, 'utf8').split('\n');
const run = (hand: readonly EsHandEntry[] = HAND, resolutions?: ReadonlyMap<string, Resolution>) =>
  compareEsHandToDictionary(hand, collect(fixtureLines(), hand), { dictionaryId: DICT_ID, oursId: OURS_ID, resolutions });
const ids = (r: ReturnType<typeof run>, kind?: string) => r.disagreements.filter((d) => !kind || d.field === kind).map((d) => d.id);

const root = tmpDir('go-dict-compare-es-');
afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('the collector', () => {
  it('keeps only the headwords of the word list and its listed forms, counts the rest, and notes a malformed line', () => {
    const d = collect(fixtureLines());
    expect(d.stats.malformed).toBe(1);
    expect(d.stats.lastLineMalformed).toBe(false);
    expect(d.index.has('zzz')).toBe(false); // not a word-list headword
    expect(d.index.get('madre')).toHaveLength(1); // the English line with the same spelling is ignored
    expect(d.index.get('cura')).toHaveLength(2);
    expect(d.index.has('tengo')).toBe(true); // a listed form is kept
    expect(d.stats.kept).toBeLessThan(d.stats.entries);
    expect(d.stats.posCounts.noun).toBeGreaterThan(10);
  });
});

describe('the six comparisons', () => {
  const r = run();

  it('records exactly the expected disagreements, in kind order, then lemma', () => {
    expect(ids(r)).toEqual([
      'es:missing:Ana:PROPN', 'es:missing:catracha:NOUN', 'es:missing:cipota:NOUN', 'es:missing:dados:NOUN', 'es:missing:pulpería:NOUN', 'es:missing:sinsentido:NOUN', 'es:missing:zzzfalta:NOUN',
      'es:part-of-speech:cantar:VERB', 'es:part-of-speech:mi:DET',
      'es:gender:día:NOUN', 'es:gender:mapa:NOUN',
      'es:meaning:moto:NOUN', 'es:meaning:perro:NOUN', 'es:meaning:tía:NOUN',
      'es:variety:baleada:NOUN', 'es:variety:catracha:NOUN', 'es:variety:chele:NOUN', 'es:variety:frutilla:NOUN', 'es:variety:pisto:NOUN',
      'es:inflection:tener:VERB:tenemos', 'es:inflection:tener:VERB:tenga', 'es:inflection:tener:VERB:tenía',
    ]);
    expect(ES_KIND_ORDER).toEqual(['missing', 'part-of-speech', 'gender', 'meaning', 'variety', 'inflection']);
  });

  it('every record is open, es, the lemma as form, with both sources named', () => {
    for (const d of r.disagreements) {
      expect(d.lang).toBe('es');
      expect(d.status).toBe('open');
      expect(d.ours.sourceId).toBe(OURS_ID);
      expect(d.theirs.sourceId).toBe(DICT_ID);
      expect(d.note).toBeTruthy();
      expect(d.id.startsWith(`es:${d.field}:${d.form}`)).toBe(true);
    }
  });

  it('missing: no entry, only a form-of entry, and a proper name; a proper name that is present is not compared further', () => {
    const by = Object.fromEntries(r.disagreements.filter((d) => d.field === 'missing').map((d) => [d.form, d]));
    expect(by.zzzfalta.theirs.value).toBe('(no entry for this headword)');
    expect(by.dados.theirs.value).toBe('(only inflected-form or alternative-form entries, of: dado)');
    expect(by.sinsentido.theirs.value).toBe('(noun entry without a definition)');
    expect(by.Ana.ours.value).toBe('PROPN: Ana (name)');
    expect(ids(r).some((i) => i.includes('Pedro') || i.includes('Marta'))).toBe(false);
  });

  it('part of speech: fires when no compatible part of speech exists, not for the accepted equivalents', () => {
    const p = r.disagreements.find((d) => d.field === 'part-of-speech')!;
    expect(p.ours.value).toBe('VERB');
    expect(p.theirs.value).toBe('noun');
    // DET/article, AUX/verb, SCONJ/conj, ADP/contraction, ADJ/adj did not fire
    for (const lemma of ['el', 'este', 'ser', 'que', 'del', 'bonito']) expect(ids(r, 'part-of-speech')).not.toContain(`es:part-of-speech:${lemma}`);
    expect(r.checked.partOfSpeechChecked).toBeGreaterThan(20);
    // and the entry that has no compatible part of speech was not compared further
    expect(ids(r, 'meaning').some((i) => i.includes('cantar'))).toBe(false);
    // an entry of a compatible part of speech that is only a form of another word is said, not counted as a match
    expect(r.disagreements.find((d) => d.id === 'es:part-of-speech:mi:DET')!.theirs.value).toBe('noun; as det only a form of another word (mío)');
  });

  it('the equivalence table accepts what the task named', () => {
    expect(ES_POS_COMPATIBLE.DET).toEqual(expect.arrayContaining(['det', 'article', 'adj', 'pron']));
    expect(ES_POS_COMPATIBLE.SCONJ).toContain('conj');
    expect(ES_POS_COMPATIBLE.CONJ).toContain('conj');
    expect(ES_POS_COMPATIBLE.AUX).toContain('verb');
    expect(ES_POS_COMPATIBLE.ADP).toEqual(expect.arrayContaining(['prep', 'contraction']));
  });

  it('gender: from sense tags, from the head template, and which one was used is reported', () => {
    const dia = r.disagreements.find((d) => d.id === 'es:gender:día:NOUN')!;
    expect(dia.ours.value).toMatch(/^\/f/);
    expect(dia.theirs.value).toBe('masculine (from sense tags)');
    const mapa = r.disagreements.find((d) => d.id === 'es:gender:mapa:NOUN')!;
    expect(mapa.theirs.value).toBe('masculine (from head template: m)');
    expect(r.checked.genderFromTags).toBeGreaterThan(0);
    expect(r.checked.genderFromHeadTemplate).toBeGreaterThan(0);
    expect(r.checked.genderChecked).toBe(r.checked.genderFromTags + r.checked.genderFromHeadTemplate);
  });

  it('gender does not fire when the sets meet: same gender, mf, by-personal-gender, mfbysense, two noun entries', () => {
    for (const lemma of ['madre', 'casa', 'mano', 'artista', 'turista', 'cura', 'libro', 'mesa']) expect(ids(r, 'gender')).not.toContain(`es:gender:${lemma}:NOUN`);
    // the feminine noun "moto" is only a clipping of motocicleta (an alt-of sense); its gender tag still counts
    expect(ids(r, 'gender')).not.toContain('es:gender:moto:NOUN');
  });

  it('gender is not compared when the dictionary gives none', () => {
    expect(ids(r, 'gender').some((i) => i.includes('agua'))).toBe(false);
    expect(r.notComparable['gender: the dictionary gives no gender for the noun (no sense tag, no usable head-template argument)']).toBe(1);
  });

  it('meaning: fires when no content word meets, not when one does, not for a gloss without a content word', () => {
    const m = r.disagreements.find((d) => d.id === 'es:meaning:perro:NOUN')!;
    expect(m.ours.value).toBe('dog');
    expect(m.theirs.value).toBe('a type of bird');
    expect(r.notComparable['meaning: the word-list gloss has no content word to compare']).toBe(1); // "the"
    expect(r.checked.meaningChecked).toBeGreaterThan(15);
    // lenient on purpose: British spelling, a shared whole word, a number word
    for (const id of ['es:meaning:centro:NOUN', 'es:meaning:además:ADV', 'es:meaning:cuatro:NUM']) expect(ids(r, 'meaning')).not.toContain(id);
    expect(usSpelling('centre; saviour, to practise, neighbourhood, four hours')).toBe('center; savior, to practice, neighborhood, four hours');
    // a sense that is only "form of another word" is not read as a meaning; the record names the other word
    expect(r.disagreements.find((d) => d.id === 'es:meaning:tía:NOUN')!.theirs.value).toBe('girl, chick (also listed as a form of: tío)');
    expect(r.disagreements.find((d) => d.id === 'es:meaning:moto:NOUN')!.theirs.value).toBe('milestone (also listed as a form of: motocicleta)');
    // ... but an English word inside such a sense is read: "clipping of fotografía (photograph)"
    expect(ids(r, 'meaning')).not.toContain('es:meaning:foto:NOUN');
  });

  it('variety: another region, no region (weaker), and everything that must stay silent', () => {
    const v = Object.fromEntries(r.disagreements.filter((d) => d.field === 'variety').map((d) => [d.form, d]));
    expect(Object.keys(v).sort()).toEqual(['baleada', 'catracha', 'chele', 'frutilla', 'pisto']);
    // a word the dictionary has only as a form of another word is still compared: cipota's form-of sense is labelled Honduras, catracha's is not
    expect(v.catracha.theirs.value).toBe('(no region label on any sense; the dictionary has the word only as a form of: catracho)');
    expect(v.catracha.note).toContain('the dictionary gives no region for this word');
    // a label that sits on another meaning of the word is still recorded, and the note says so
    expect(v.frutilla.theirs.value).toBe('Costa-Rica: trichina');
    expect(v.frutilla.note).toContain('None of the labelled senses shares a word with the word-list gloss');
    expect(v.baleada.note).not.toContain('None of the labelled senses');
    expect(r.regionLabelsSeen['Costa-Rica']).toBe(1);
    expect(r.otherCapitalTags).toEqual({ Internet: 1 }); // a capitalised tag that is not a place is listed, not read as a region
    // both sides verbatim
    expect(v.pisto.ours.value).toBe('es-CA: money (informal); in Spain, a vegetable stew');
    expect(v.pisto.theirs.value).toBe('Spain: stew');
    expect(v.baleada.theirs.value).toBe('Mexico: a snack');
    // the weaker record says so
    expect(v.chele.theirs.value).toBe('(no region label on any sense)');
    expect(v.chele.note).toContain('the dictionary gives no region for this word');
    expect(v.pisto.note).not.toContain('the dictionary gives no region for this word');
    // silent: Honduras among labels, Latin-America for es-419, Central-America around Honduras, no label outside the target region, voseo
    for (const lemma of ['cipote', 'carro', 'catracho', 'ordenador', 'vos']) expect(ids(r, 'variety')).not.toContain(`es:variety:${lemma}:${lemma === 'vos' ? 'PRON' : 'NOUN'}`);
    expect(r.checked.varietyChecked).toBe(10); // cipote carro pisto chele ordenador catracho baleada frutilla cipota catracha (a register tag or voseo is not a region; pulpería has no entry)
  });

  it('variety overview: every Honduran and Central American entry, with or without a record', () => {
    expect(Object.fromEntries(r.varietyOverview.map((v) => [v.lemma, v.outcome]))).toEqual({
      baleada: 'another region', catracha: 'no region label', catracho: 'label matches', chele: 'no region label', cipota: 'label matches',
      cipote: 'label matches', pisto: 'another region', pulpería: 'not in the dictionary',
    });
    expect(r.varietyOverview.map((v) => v.lemma)).toEqual([...r.varietyOverview.map((v) => v.lemma)].sort());
    expect(r.varietyOverview.find((v) => v.lemma === 'cipote')!.theirs).toBe('El-Salvador, Honduras, Nicaragua: youngster, kid, child, boy | Spain: penis');
    // the entries with a record are exactly the 'another region' and 'no region label' ones (frutilla is es-AR: a record, not in this overview)
    const recorded = r.varietyOverview.filter((v) => v.outcome === 'another region' || v.outcome === 'no region label').map((v) => v.lemma).sort();
    expect(recorded).toEqual(['baleada', 'catracha', 'chele', 'pisto']);
  });

  it('variety: a region of the word list outside Honduras and Central America with no label is counted as not comparable', () => {
    expect(r.notComparable['variety: the word list names a region outside Honduras and Central America and the dictionary gives no region label']).toBe(1);
  });

  it('inflection: forms listed by the word list but not by the dictionary, with the tags and the dictionary side said', () => {
    const f = Object.fromEntries(r.disagreements.filter((d) => d.field === 'inflection').map((d) => [d.id.split(':').pop()!, d]));
    expect(Object.keys(f).sort()).toEqual(['tenemos', 'tenga', 'tenía']);
    expect(f.tenemos.theirs.value).toBe('(no entry for this form)');
    expect(f.tenga.theirs.value).toBe('listed as a form of: tengar');
    expect(f.tenía.ours.value).toBe('tenía (1s impf; 3s impf)'); // two listed readings of one spelling: one record
    // tengo is a form-of entry for tener, tienes is in tener's own table of forms, tener is the lemma itself
    expect(ids(r, 'inflection')).not.toContain('es:inflection:tener:VERB:tengo');
    expect(ids(r, 'inflection')).not.toContain('es:inflection:tener:VERB:tienes');
    expect(ids(r, 'inflection')).not.toContain('es:inflection:alguno:DET:algún'); // an alt_of sense counts as a form of the lemma
    expect(ids(r, 'meaning')).not.toContain('es:meaning:cuatro:NUM');
    expect(r.checked.inflectionChecked).toBe(6); // tengo tienes tenga tenemos tenía algún
  });

  it('coverage counts the lemmas found, with an entry of their own, and under a compatible part of speech', () => {
    const c = r.coverage;
    expect(c.entries).toBe(HAND.length);
    expect(c.distinctLemmas).toBe(HAND.length);
    expect(c.lemmasAnyEntry).toBe(HAND.length - 3); // zzzfalta, Ana and pulpería have no entry at all
    expect(c.lemmasWithOwnEntry).toBe(HAND.length - 7); // dados, cipota and catracha have only a form-of entry, sinsentido no definition
    expect(c.entriesCompatible).toBe(HAND.length - 9); // ... and cantar has no verb, mi no determiner with a meaning of its own
    expect(c.byPos.find((p) => p.pos === 'NOUN')!.entries).toBeGreaterThan(15);
  });
});

describe('parseGenderArg', () => {
  it('reads the head-template argument', () => {
    expect(parseGenderArg('m')).toEqual(['masculine']);
    expect(parseGenderArg('f')).toEqual(['feminine']);
    expect(parseGenderArg('mf').sort()).toEqual(['feminine', 'masculine']);
    expect(parseGenderArg('mfbysense').sort()).toEqual(['feminine', 'masculine']);
    expect(parseGenderArg('m-p')).toEqual(['masculine']);
    expect(parseGenderArg('f-p')).toEqual(['feminine']);
    expect(parseGenderArg('f,m<q:less commonly>').sort()).toEqual(['feminine', 'masculine']);
    expect(parseGenderArg('m,f<l:<<colloquial>>>').sort()).toEqual(['feminine', 'masculine']);
    expect(parseGenderArg('gneut')).toEqual([]);
    expect(parseGenderArg('es')).toEqual([]);
    expect(parseGenderArg('?')).toEqual([]);
  });
});

describe('resolutions, determinism, dictionary id', () => {
  it('a resolution is carried onto the record with the same id; an unknown id is reported stale; nothing is invented', () => {
    const decided: Resolution = { by: 'reviewer', at: '2026-10-02', decision: 'ours', note: 'checked with a speaker' };
    const r = run(HAND, new Map([['es:variety:pisto:NOUN', decided], ['es:gender:gone:NOUN', decided]]));
    const pisto = r.disagreements.find((d) => d.id === 'es:variety:pisto:NOUN')!;
    expect(pisto.status).toBe('resolved');
    expect(pisto.resolution).toEqual(decided);
    expect(r.disagreements.filter((d) => d.status === 'resolved')).toHaveLength(1);
    expect(r.staleResolutions).toEqual(['es:gender:gone:NOUN']);
    // ours and theirs are recomputed, not taken from the resolution
    expect(pisto.theirs.value).toBe('Spain: stew');
  });

  it('is deterministic: the same input twice, and the word list in another order, give identical records', () => {
    const a = JSON.stringify(run().disagreements);
    expect(JSON.stringify(run().disagreements)).toBe(a);
    expect(JSON.stringify(run([...HAND].reverse()).disagreements)).toBe(a);
  });

  it('esDictionaryId: --id, else the Last-Modified date of the header dump, else today', () => {
    expect(esDictionaryId({ id: 'kaikki-es@2026-01-02', today: '2026-10-01' })).toEqual({ id: 'kaikki-es@2026-01-02', lastModified: '2026-01-02' });
    const headers = 'HTTP/1.1 200 OK\nContent-Length: 1\nLast-Modified: Mon, 28 Sep 2026 18:05:39 GMT\n';
    expect(esDictionaryId({ headersText: headers, today: '2026-10-01' })).toEqual({ id: 'kaikki-es@2026-09-28', lastModified: '2026-09-28' });
    expect(esDictionaryId({ headersText: 'HTTP/1.1 200 OK\n', today: '2026-10-01' })).toEqual({ id: 'kaikki-es@2026-10-01', lastModified: undefined });
    expect(esDictionaryId({ today: '2026-10-01' }).id).toBe('kaikki-es@2026-10-01');
  });
});

describe('the file reader and compareEsFile', () => {
  const plain = path.join(root, 'fixture.jsonl');
  const gz = path.join(root, 'fixture.jsonl.gz');
  const cut = path.join(root, 'cut.jsonl.gz');
  const base = { dictionaryId: DICT_ID, skipHash: true, hand: { entries: HAND, fromRows: HAND.length, fromOldList: 0 } };
  const out = (name: string) => ({ resolutionsFile: path.join(root, name, 'resolutions.json'), reportFile: path.join(root, name, 'REPORT.md'), jsonFile: path.join(root, name, 'disagreements.json') });

  it('plain and gzip input give the same result, report and review file (apart from the file name and size)', async () => {
    const text = fs.readFileSync(FIXTURE);
    fs.writeFileSync(plain, text);
    fs.writeFileSync(gz, zlib.gzipSync(text));
    const a = await compareEsFile({ ...base, input: plain, ...out('a') });
    const b = await compareEsFile({ ...base, input: gz, ...out('b') });
    expect(b.result).toEqual(a.result);
    expect(b.stats).toEqual(a.stats);
    const strip = (s: string) => s.replaceAll('fixture.jsonl.gz', 'FILE').replaceAll('fixture.jsonl', 'FILE').replace(/size: [\d,]+ bytes/, 'size: N bytes');
    expect(strip(b.report)).toBe(strip(a.report));
    const ja = JSON.parse(a.json); const jb = JSON.parse(b.json);
    expect(jb.disagreements).toEqual(ja.disagreements);
    expect(jb.counts).toEqual(ja.counts);
    expect(ja.schema).toBe(1);
    expect(ja.dictionary.id).toBe(DICT_ID);
    expect(ja.attribution).toMatch(/CC BY-SA 4\.0/);
  });

  it('the report states what it is, how many, the equivalence table, the whole variety list and the first of the rest', async () => {
    const a = await compareEsFile({ ...base, input: plain, ...out('r') });
    expect(a.report).toMatch(/^# Spanish word list against the dictionary \(kaikki-es@2026-09-28\)/);
    expect(a.report).toContain('machine-drafted');
    expect(a.report).toContain('Nothing in this report is a decision');
    expect(a.report).toMatch(/\| DET \| det, article, adj, pron, num \|/);
    expect(a.report).toMatch(/## Variety: all 5 records/);
    expect(a.report).toMatch(/### Every Honduran and Central American entry of the word list: 8/);
    expect(a.report).toContain('another region: 2; label matches: 3; no region label: 2; not in the dictionary: 1.');
    expect(a.report).toContain('| pisto:NOUN | es-CA: money (informal); in Spain, a vegetable stew | Spain: stew |');
    expect(a.report).toMatch(/### gender: 2/);
    expect(a.report).toMatch(/\*\*meaning\.\*\* Can show/);
    expect(a.report).toMatch(/This test is weak/);
  });

  it('a truncated gzip file is a clear error, not a partial result', async () => {
    const whole = fs.readFileSync(gz);
    fs.writeFileSync(cut, whole.subarray(0, Math.floor(whole.length * 0.6)));
    await expect(compareEsFile({ ...base, input: cut, ...out('c') })).rejects.toThrow(/gzip file is damaged or incomplete/);
    expect(fs.existsSync(out('c').jsonFile)).toBe(false); // compareEsFile itself writes nothing
    const lines: string[] = [];
    await expect((async () => { for await (const l of fileLines(cut)) lines.push(l); })()).rejects.toThrow(/damaged or incomplete/);
  });

  it('a plain file cut off in the middle of a line is refused too', async () => {
    const half = path.join(root, 'half.jsonl');
    const text = fs.readFileSync(FIXTURE, 'utf8').trimEnd();
    fs.writeFileSync(half, text.slice(0, text.length - 20));
    await expect(compareEsFile({ ...base, input: half, ...out('h') })).rejects.toThrow(/looks cut off/);
  });

  it('a file with no Spanish entries is refused', async () => {
    const empty = path.join(root, 'empty.jsonl');
    fs.writeFileSync(empty, '{"word":"x","pos":"noun","lang_code":"en","senses":[]}\n');
    await expect(compareEsFile({ ...base, input: empty, ...out('e') })).rejects.toThrow(/no usable Spanish entries/);
  });
});

describe('the word list as the adapter holds it', () => {
  const h = esHandData();

  it('has one entry per lexicon entry, with the row facts read back', () => {
    expect(h.entries).toHaveLength(esLexicon.entries.length);
    expect(h.fromRows + h.fromOldList).toBe(h.entries.length);
    expect(h.fromRows).toBeGreaterThan(h.entries.length * 0.8);
    const cipote = h.entries.find((x) => x.lemma === 'cipote' && x.pos === 'NOUN')!;
    expect(cipote.gender).toBe('m');
    expect(cipote.varieties).toEqual(expect.arrayContaining(['es-HN']));
    const tener = h.entries.find((x) => x.lemma === 'tener')!;
    expect(tener.forms!.map((f) => f.form)).toContain('tengo');
    expect(tener.forms!.some((f) => f.form === 'tener')).toBe(false); // the lemma is not a "listed form"
    expect(h.entries.find((x) => x.lemma === 'pecado')!.gender).toBe('m'); // an entry of the older list: gender from its forms
  });

  it('keeps the Honduran and Central American tags the adapter attaches', () => {
    const tagged = h.entries.filter((x) => x.varieties.some((v) => v === 'es-HN' || v === 'es-CA'));
    expect(tagged.length).toBeGreaterThan(3);
  });
});

describe('npm run dict:compare-es', () => {
  const cli = path.resolve('node_modules/vite-node/dist/cli.mjs');
  const exec = (...args: string[]) => runNode([cli, 'scripts/dict-compare-es.mts', ...args], { cwd: path.resolve('.'), timeout: 120_000 });

  it('compares the real word list with the fixture, writes the three outputs and exits 0', async () => {
    const dir = path.join(root, 'cli-ok');
    const r = await exec('--', '--in', FIXTURE, '--id', DICT_ID, '--report', path.join(dir, 'REPORT.md'), '--json', path.join(dir, 'd.json'), '--resolutions', path.join(dir, 'res.json'));
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/dict:compare-es - kaikki-es@2026-09-28/);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'd.json'), 'utf8')).dictionary.id).toBe(DICT_ID);
    expect(fs.readFileSync(path.join(dir, 'REPORT.md'), 'utf8')).toMatch(/^# Spanish word list against the dictionary/);
    expect(fs.readFileSync(path.join(dir, 'res.json'), 'utf8').trim()).toBe('{}');
  }, 150_000);

  it('a truncated gzip file: a clear message on stderr, exit 1, no output written', async () => {
    const dir = path.join(root, 'cli-cut');
    const whole = zlib.gzipSync(fs.readFileSync(FIXTURE));
    const cut = path.join(root, 'cli-cut.jsonl.gz');
    fs.writeFileSync(cut, whole.subarray(0, Math.floor(whole.length * 0.5)));
    const r = await exec('--in', cut, '--id', DICT_ID, '--report', path.join(dir, 'REPORT.md'), '--json', path.join(dir, 'd.json'), '--resolutions', path.join(dir, 'res.json'));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/dict:compare-es failed: .*damaged or incomplete/);
    expect(fs.existsSync(path.join(dir, 'd.json'))).toBe(false);
  }, 150_000);

  it('bad arguments exit 1', async () => {
    expect((await exec('--bogus', 'x')).status).toBe(1);
    expect((await exec('--in', path.join(root, 'nope.jsonl'))).status).toBe(1);
  }, 150_000);
});
