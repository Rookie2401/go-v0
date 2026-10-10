// @vitest-environment jsdom
/**
 * Linguistic Engine V2, Stage 5: word structure, derivation and etymology beyond the chain. The structure of a word comes from
 * named sources only (the dictionary's etymology templates, then the analyser's reading, then the analyser's generated stem and
 * ending, with the dictionary's derived and related words as the family); a word no source speaks about stays `unknown` and is
 * never split by guesswork. Language codes in the chain are named where the code is known and stay codes otherwise.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AnalysisCandidate, LanguageAdapter } from '../../src/core';
import { cognateText, etymologyOf, etymologyStepText, structureOf, type LexicalRecord } from '../../packages/golearn-extension/src/content/enrich';
import { LANGUAGE_NAMES, languageNameOf } from '../../packages/golearn-extension/src/content/languageNames';
import { createCardUI, type CardUI } from '../../packages/golearn-extension/src/popup/card';
import { parseSelection, type CardModel } from '../../packages/golearn-extension/src/parser';
import type { PopupAnchor } from '../../packages/golearn-extension/src/contract/readerAdapter';
import { LAYER_ASSISTANCE } from '../../packages/golearn-extension/src/store';
import { deAdapter } from '../../src/adapters/de';
import { hiAdapter } from '../../src/adapters/hi';
import { sqAdapter } from '../../src/adapters/sq';
import { setBody, stubLayout } from './dom';

const rec = (w: string, tpl: NonNullable<LexicalRecord['ety']>['tpl'], over: Partial<LexicalRecord> = {}): LexicalRecord => ({ w, p: 'NOUN', ety: { text: `${w} (test)`, tpl }, ...over });
/** An adapter whose analysis returns the given candidates. */
const stub = (lang: string, candidates: AnalysisCandidate[], extra: Partial<LanguageAdapter> = {}): LanguageAdapter => ({
  lang, name: `Stub ${lang}`, version: '1', normalize: (s: string) => s, analyze: (tokens: unknown[]) => tokens.map((token) => ({ token, candidates })), ...extra,
} as unknown as LanguageAdapter);

describe('structureOf: the dictionary\'s templates', () => {
  it('a prefix template: the prefix and the root, with the template named as the source', () => {
    const s = structureOf(rec('verändern', [{ k: 'prefix', lang: 'de', form: 'ver + ändern' }], { p: 'VERB' }), undefined, 'verändern', 'VERB', 'verändern', {}, { languageId: 'de' });
    expect(s.status).toBe('supported-by-source');
    expect(s.parts.map((p) => [p.text, p.role])).toEqual([['ver', 'prefix'], ['ändern', 'root']]);
    expect(s.parts[0].source).toMatch(/Wiktionary etymology template “prefix”/);
    expect(s.derivedFrom).toMatchObject({ lemma: 'ändern', relation: 'formed with prefix ver' });
  });
  it('a suffix template: the root and the suffix, and the word it was formed from', () => {
    const s = structureOf(rec('schädlichkeit', [{ k: 'suffix', lang: 'de', form: 'schädlich + keit' }]), undefined, 'schädlichkeit', 'NOUN', 'schädlichkeit', {}, { languageId: 'de' });
    expect(s.parts.map((p) => [p.text, p.role])).toEqual([['schädlich', 'root'], ['keit', 'suffix']]);
    expect(s.derivedFrom).toMatchObject({ lemma: 'schädlich', relation: 'formed with suffix keit' });
  });
  it('an affix template: hyphens mark the affixes; a compound has components and a linking element, and no derivedFrom', () => {
    const a = structureOf(rec('rebrote', [{ k: 'af', lang: 'es', form: 're- + brote' }]), undefined, 'rebrote', 'NOUN', 'rebrote', {}, { languageId: 'es' });
    expect(a.parts.map((p) => [p.text, p.role])).toEqual([['re-', 'prefix'], ['brote', 'root']]);
    const c = structureOf(rec('Reichsritter', [{ k: 'af', lang: 'de', form: 'Reich + -s- + Ritter' }]), undefined, 'Reichsritter', 'NOUN', 'Reichsritter', {}, { languageId: 'de' });
    expect(c.parts.map((p) => [p.text, p.role])).toEqual([['Reich', 'component'], ['-s-', 'linking'], ['Ritter', 'component']]);
    expect(c.derivedFrom).toBeUndefined();
    const k = structureOf(rec('bojëkafe', [{ k: 'compound', lang: 'sq', form: 'bojë + kafe' }]), undefined, 'bojëkafe', 'NOUN', 'bojëkafe', {}, { languageId: 'sq' });
    expect(k.parts.map((p) => p.role)).toEqual(['component', 'component']);
  });
  it('the template for the word\'s own language comes first; one for another language is used only with a note saying whose word it describes', () => {
    const r = rec('sanguinolento', [{ k: 'af', lang: 'la', form: 'sanguis + -olentus' }, { k: 'af', lang: 'es', form: 'sangre + -ento' }]);
    expect(structureOf(r, undefined, 'sanguinolento', 'ADJ', 'sanguinolento', {}, { languageId: 'es' }).parts.map((p) => p.text)).toEqual(['sangre', '-ento']);
    const only = structureOf(rec('sanguinolento', [{ k: 'af', lang: 'la', form: 'sanguis + -olentus' }]), undefined, 'sanguinolento', 'ADJ', 'sanguinolento', {}, { languageId: 'es' });
    expect(only.status).toBe('supported-by-source');
    expect(only.derivedFrom).toBeUndefined();
    expect(only.notes.join(' ')).toMatch(/Latin word this one comes from/);
  });
  it('refuses what is not a segmentation: a template with no parts, a part of absurd length, too many parts', () => {
    expect(structureOf(rec('x', [{ k: 'af', lang: 'de' }]), undefined, 'x', 'NOUN', 'x').status).toBe('unknown');
    expect(structureOf(rec('x', [{ k: 'af', lang: 'de', form: `a + ${'b'.repeat(60)}` }]), undefined, 'x', 'NOUN', 'x').parts).toEqual([]);
    expect(structureOf(rec('x', [{ k: 'af', lang: 'de', form: '1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9' }]), undefined, 'x', 'NOUN', 'x').parts).toEqual([]);
    // inh / bor / der give a history, not a segmentation
    expect(structureOf(rec('libër', [{ k: 'bor', lang: 'la', form: 'liber' }]), undefined, 'libër', 'NOUN', 'libër').status).toBe('unknown');
  });
});

describe('structureOf: the analyser', () => {
  it('compound components from the real German analyser: provisional, named, with the link kept apart', () => {
    const s = structureOf(undefined, deAdapter, 'Lebensversicherung', 'NOUN', 'Lebensversicherung');
    expect(s.status).toBe('provisional');
    expect(s.parts.map((p) => p.role)).toEqual(['component', 'linking', 'head']);
    expect(s.parts[0].source).toMatch(/German analyser \(de@\d+\), by its rules/);
    expect(s.notes.join(' ')).toMatch(/Provisional/);
  });
  it('the dictionary\'s template wins over the analyser\'s cut, and the status is then the source\'s', () => {
    const r = rec('Lebensversicherung', [{ k: 'compound', lang: 'de', form: 'Leben + s + Versicherung' }]);
    const agree = structureOf(r, deAdapter, 'Lebensversicherung', 'NOUN', 'Lebensversicherung', {}, { languageId: 'de' });
    expect(agree.status).toBe('supported-by-source');
    expect(agree.parts[0].source).toMatch(/Wiktionary/);
    const other = structureOf(rec('Lebensversicherung', [{ k: 'compound', lang: 'de', form: 'Lebens + Versicherung' }]), deAdapter, 'Lebensversicherung', 'NOUN', 'Lebensversicherung', {}, { languageId: 'de' });
    expect(other.parts.map((p) => p.text)).toEqual(['Lebens', 'Versicherung']);
    expect(agree.notes.concat(other.notes).join(' ')).not.toMatch(/Provisional/);
  });
  it('a separable prefix and the unit it belongs to', () => {
    const s = structureOf(undefined, deAdapter, 'aufstehen', 'VERB', 'aufgestanden');
    expect(s.status).toBe('provisional');
    expect(s.parts[0]).toMatchObject({ text: 'auf', role: 'prefix' });
    const piece = structureOf(undefined, stub('de', [{ lemma: 'aufstehen', pos: 'VERB', morph: {}, confidence: 0.9, unit: { head: 0, pieces: [0, 2], role: 'head', display: 'aufstehen' } }]), 'aufstehen', 'VERB', 'steht');
    expect(piece.notes.join(' ')).toMatch(/unit “aufstehen”/);
  });
  it('a causative base and a derivedFrom note become "derived from", never a part', () => {
    const s = structureOf(undefined, hiAdapter, 'बनाना', 'VERB', 'बनाया');
    expect(s.derivedFrom).toMatchObject({ lemma: 'बनना' });
    expect(s.derivedFrom!.relation).toMatch(/causative/);
    const fake = structureOf(undefined, stub('xx', [{ lemma: 'w', pos: 'VERB', morph: {}, confidence: 1, notes: { derivedFrom: 'base', causative: 'second' } }]), 'w', 'VERB', 'w');
    expect(fake.derivedFrom).toEqual({ lemma: 'base', relation: 'second causative of', source: expect.stringMatching(/Stub xx analyser/) });
    expect(fake.status).toBe('provisional');
    expect(fake.parts).toEqual([]);
  });
  it('attached pronouns are clitics; a contraction\'s `components` note is read as components', () => {
    const c = structureOf(undefined, stub('xx', [{ lemma: 'de', pos: 'ADP', morph: {}, confidence: 1, notes: { components: ['de', 'el'] } }]), 'de', 'ADP', 'del');
    expect(c.parts.map((p) => [p.text, p.role])).toEqual([['de', 'component'], ['el', 'component']]);
    const parts = [{ text: 'dá', start: 0, end: 2, lemma: 'dar' }, { text: 'me', start: 2, end: 4, role: 'indirect object pronoun' }];
    const es = structureOf(undefined, stub('es', [{ lemma: 'dar', pos: 'VERB', morph: {}, confidence: 1, parts }]), 'dar', 'VERB', 'dame');
    expect(es.parts.map((p) => p.role)).toEqual(['component', 'clitic']);
  });
  it('only a reading of this lemma and part of speech is used', () => {
    const wrong = stub('xx', [{ lemma: 'other', pos: 'NOUN', morph: {}, confidence: 1, parts: [{ text: 'a', start: 0, end: 1 }, { text: 'b', start: 1, end: 2 }] }]);
    expect(structureOf(undefined, wrong, 'w', 'NOUN', 'ab').status).toBe('unknown');
  });
  it('a generated stem and ending, marked generated, only when the paradigm shares enough to name a stem', () => {
    const s = structureOf(undefined, sqAdapter, 'shtëpi', 'NOUN', 'shtëpinë', { Case: 'Acc', Definite: 'Def', Number: 'Sing' });
    expect(s.status).toBe('provisional');
    expect(s.parts.map((p) => [p.text, p.role])).toEqual([['shtëpi', 'stem'], ['në', 'ending']]);
    expect(s.parts[0].source).toMatch(/generated/);
    // an irregular paradigm (go / went / gone) shares no stem: no split
    const irregular = stub('xx', [], { paradigm: () => ({ kind: 'verb-conjugation', notes: [], cells: [{ features: { Tense: 'Pres' }, form: 'go' }, { features: { Tense: 'Past' }, form: 'went' }, { features: { Tense: 'Part' }, form: 'gone' }] }) });
    expect(structureOf(undefined, irregular, 'go', 'VERB', 'went').parts).toEqual([]);
    // a surface that is not one of the generated forms is not split
    expect(structureOf(undefined, sqAdapter, 'shtëpi', 'NOUN', 'shtëpixyz').parts).toEqual([]);
  });
  it('with a template AND a generated split, the parts are the template\'s and the inflection is a note', () => {
    const r = rec('shtëpi', [{ k: 'af', lang: 'sq', form: 'shtë + -pi' }]);
    const s = structureOf(r, sqAdapter, 'shtëpi', 'NOUN', 'shtëpinë', { Case: 'Acc', Definite: 'Def', Number: 'Sing' }, { languageId: 'sq' });
    expect(s.status).toBe('supported-by-source');
    expect(s.parts.map((p) => p.text)).toEqual(['shtë', '-pi']);
    expect(s.notes.join(' ')).toMatch(/stem “shtëpi” with the ending “në”/);
  });
});

describe('structureOf: nothing, and the family', () => {
  it('no record, no adapter: unknown, no parts, nothing invented', () => {
    expect(structureOf(undefined, undefined, 'x', 'NOUN', 'x')).toEqual({ status: 'unknown', parts: [], family: { derived: [], related: [] }, notes: [] });
    expect(structureOf({ w: 'x', p: 'NOUN' }, stub('xx', []), 'x', 'NOUN', 'x').status).toBe('unknown');
  });
  it('a word the German analyser has no structure for stays unknown', () => {
    expect(structureOf(undefined, deAdapter, 'machen', 'VERB', 'machst', { Person: '2' }).parts).toEqual([]);
  });
  it('the family is the dictionary\'s derived and related words, with the source; alone it does not make a structure', () => {
    const s = structureOf({ w: 'bok', p: 'NOUN', rel: { d: ['bokhylle', 'bokstav'], r: ['bøker'] } }, undefined, 'bok', 'NOUN', 'bok');
    expect(s.family).toEqual({ derived: ['bokhylle', 'bokstav'], related: ['bøker'], source: expect.stringMatching(/Wiktionary/) });
    expect(s.status).toBe('unknown');
    expect(s.parts).toEqual([]);
  });
});

describe('etymology: language names and cognates', () => {
  const LIBER: LexicalRecord = rec('libër', [{ k: 'bor', lang: 'la', form: 'liber', gloss: 'book' }, { k: 'inh', lang: 'sqj-pro', form: '*lībra' }, { k: 'cog', lang: 'ro', form: 'liber' }, { k: 'cog', lang: 'zzz-unknown', form: 'xyz' }]);
  it('cognates are kept apart from the chain, and the names of the codes that occur travel with the view', () => {
    const e = etymologyOf(LIBER);
    expect(e.chain.map((c) => c.relation)).toEqual(['borrowed', 'inherited']);
    expect(e.cognates).toEqual([{ language: 'ro', form: 'liber' }, { language: 'zzz-unknown', form: 'xyz' }]);
    expect(e.languageNames).toEqual({ la: 'Latin', 'sqj-pro': 'Proto-Albanian', ro: 'Romanian' });
  });
  it('"from Latin liber", not "la: liber"; an unknown code stays a code', () => {
    const e = etymologyOf(LIBER);
    expect(etymologyStepText(e.chain[0], e.languageNames)).toBe('borrowed from Latin liber (“book”)');
    expect(etymologyStepText(e.chain[1], e.languageNames)).toBe('inherited from Proto-Albanian *lībra');
    expect(cognateText(e.cognates[0], e.languageNames)).toBe('Romanian liber');
    expect(cognateText(e.cognates[1], e.languageNames)).toBe('zzz-unknown: xyz');
    expect(etymologyStepText({ relation: 'derived', language: 'qqq', form: 'f' }, {})).toBe('derived from qqq: f');
    expect(etymologyStepText({ relation: 'compound', language: 'de', form: 'a + b' }, { de: 'German' })).toBe('compound of a + b (German)');
  });
  it('a record with only cognates still has an origin to show; with nothing it is unknown', () => {
    expect(etymologyOf(rec('x', [{ k: 'cog', lang: 'de', form: 'X' }], { ety: { text: '', tpl: [{ k: 'cog', lang: 'de', form: 'X' }] } })).status).toBe('supported-by-source');
    expect(etymologyOf({ w: 'x', p: 'NOUN' })).toMatchObject({ status: 'unknown', cognates: [], languageNames: {} });
  });
  it('the names cover the codes that occur most in the built dictionaries', () => {
    for (const code of ['la', 'grc', 'ota', 'sla-pro', 'ine-pro', 'fa', 'ar', 'sa', 'hi', 'en', 'fr', 'it', 'de', 'gml', 'non', 'gmh', 'goh', 'sqj-pro', 'gem-pro']) expect(LANGUAGE_NAMES[code], code).toBeTruthy();
    expect(languageNameOf('gl,pt')).toBe('Galician and Portuguese');
    expect(languageNameOf('gl,qqq')).toBeUndefined();
    expect(languageNameOf(undefined)).toBeUndefined();
  });
});

describe('the built shards (skipped when not built)', () => {
  const dir = path.resolve(__dirname, '../../public/dict/de/full');
  it.skipIf(!fs.existsSync(path.join(dir, 'f-000.json')))('structureOf never throws on real German records, and every part list has a named source', () => {
    const shard: Record<string, LexicalRecord[]> = {};
    for (const f of ['f-000.json', 'f-001.json', 'f-002.json']) if (fs.existsSync(path.join(dir, f))) Object.assign(shard, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
    let withParts = 0; let n = 0;
    for (const recs of Object.values(shard)) {
      if (!Array.isArray(recs)) continue;
      for (const r of recs.slice(0, 1)) {
        const s = structureOf(r, deAdapter, r.w, r.p, r.w, {}, { languageId: 'de' });
        n++;
        if (s.parts.length) { withParts++; expect(s.status).not.toBe('unknown'); expect(s.parts.every((p) => !!p.source)).toBe(true); }
        if (s.status === 'unknown') expect(s.parts).toEqual([]);
      }
      if (n >= 400) break;
    }
    expect(n).toBeGreaterThan(50);
    expect(withParts).toBeGreaterThan(0);
  });
});

// ───────────────────────────── the card ─────────────────────────────

const anchor: PopupAnchor = { rect: { top: 100, left: 50, right: 110, bottom: 120, width: 60, height: 20 }, viewport: { width: 1024, height: 768 }, rtl: false, source: 'range' };
const cardFor = (sel = 'shtëpinë', sentence = 'Unë po lexoj një libër të bukur në shtëpinë time.'): CardModel => {
  const at = sentence.indexOf(sel);
  return parseSelection({ surface: sel, context: { kind: 'sentence', confidence: 0.9, sentence, selStart: at, selEnd: at + sel.length } });
};
let restore: () => void;
let ui: CardUI;
beforeEach(() => { restore = stubLayout(); setBody('<p id="p">Unë po lexoj një libër të bukur në shtëpinë time.</p>'); ui = createCardUI({ doc: document, speech: null, onDismiss: () => {}, makeUtterance: (text, voice) => ({ text, voice }) }); });
afterEach(() => { ui.destroy(); restore(); });
const panel = (): HTMLElement => ui.root()!.querySelector('[data-layer="structure"]') as HTMLElement;
/** "Go deeper" opens every section, Word structure among them. */
const button = (): HTMLButtonElement => ui.root()!.querySelector('button.deeperBtn') as HTMLButtonElement;

describe('the Word structure section of the card', () => {
  it('is a section of Go deeper between Origin and Sentence, and a hint for the learner record', () => {
    ui.show(cardFor(), anchor);
    const sections = [...ui.root()!.querySelectorAll('.deeper > h3')].map((h) => h.textContent);
    expect(sections.slice(sections.indexOf('Origin'), sections.indexOf('Sentence') + 1)).toEqual(['Origin', 'Word structure', 'Sentence']);
    expect(LAYER_ASSISTANCE.structure).toBe('hint');
  });
  it('shows the parts as a segmented line with roles, the status, derived-from, the family and the sources', () => {
    ui.show(cardFor(), anchor);
    const structure = structureOf(rec('schädlichkeit', [{ k: 'suffix', lang: 'de', form: 'schädlich + keit' }], { rel: { d: ['unschädlich'], r: ['Schaden'] } }), undefined, 'schädlichkeit', 'NOUN', 'schädlichkeit', {}, { languageId: 'de' });
    ui.update({ enrichment: { state: 'ready', structure } });
    button().click();
    const segs = [...panel().querySelectorAll('.seg')];
    expect(segs.map((s) => s.textContent)).toEqual(['schädlichroot', 'keitsuffix']);
    expect(panel().querySelector('.segs')!.getAttribute('aria-label')).toMatch(/schädlich: root; keit: suffix/);
    const t = panel().textContent!;
    expect(t).toMatch(/From the dictionary/);
    expect(t).toMatch(/Derived from/);
    expect(t).toMatch(/formed with suffix keit/);
    expect(t).toMatch(/unschädlich/);
    expect(t).toMatch(/Schaden/);
    expect(t).toMatch(/Sources: .*Wiktionary etymology template “suffix”/);
  });
  it('marks a provisional structure as the analyser\'s alone', () => {
    ui.show(cardFor(), anchor);
    ui.update({ enrichment: { state: 'ready', structure: structureOf(undefined, deAdapter, 'Lebensversicherung', 'NOUN', 'Lebensversicherung') } });
    button().click();
    expect(panel().textContent).toMatch(/Provisional: from the analyser's rules only/);
    expect(panel().querySelectorAll('.seg').length).toBe(3);
  });
  it('says honestly when nothing is documented, and never shows a guess', () => {
    ui.show(cardFor(), anchor);
    ui.update({ enrichment: { state: 'ready', structure: structureOf(undefined, undefined, 'x', 'NOUN', 'x') } });
    button().click();
    expect(panel().textContent).toBe('No documented structure for this word.');
    expect(panel().querySelector('.seg')).toBeNull();
  });
  it('with a family only: no parts, said so, and the family listed', () => {
    ui.show(cardFor(), anchor);
    ui.update({ enrichment: { state: 'ready', structure: structureOf({ w: 'bok', p: 'NOUN', rel: { d: ['bokhylle'] } }, undefined, 'bok', 'NOUN', 'bok') } });
    button().click();
    expect(panel().textContent).toMatch(/No documented parts for this word\./);
    expect(panel().textContent).toMatch(/bokhylle/);
  });
  it('while the dictionary is being asked, or when it is not connected, the section says so', () => {
    ui.show(cardFor(), anchor);
    button().click();
    expect(panel().textContent).toMatch(/no dictionary service/i);
    ui.update({ enrichment: { state: 'loading' } });
    expect(panel().textContent).toMatch(/Looking this up/);
  });
  it('the Origin section names the languages and lists the cognates', () => {
    ui.show(cardFor(), anchor);
    ui.update({ enrichment: { state: 'ready', etymology: etymologyOf(rec('libër', [{ k: 'bor', lang: 'la', form: 'liber' }, { k: 'cog', lang: 'ro', form: 'liber' }])) } });
    const origin = ui.root()!.querySelector('[data-layer="origin"]') as HTMLElement;
    expect(origin.textContent).toMatch(/borrowed from Latin liber/);
    expect(origin.textContent).toMatch(/Cognates the source lists/);
    expect(origin.textContent).toMatch(/Romanian liber/);
    expect(origin.textContent).not.toMatch(/la: liber/);
  });
});
