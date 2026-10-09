// @vitest-environment jsdom
/**
 * Multi-language extensibility, part 3: the extension. The parser chooses the adapter by languageId from a small registry
 * (sq, es); the content controller hands it the enrolment's language; the card shows the Spanish card for a Spanish
 * enrolment and the Albanian card for an Albanian one, with the language set on the model; Latin diacritics survive.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnsupportedAdapter, WebGenericAdapter } from '../../packages/golearn-extension/src/adapters';
import { LookupController } from '../../packages/golearn-extension/src/content/controller';
import type { ContentServices } from '../../packages/golearn-extension/src/content/services';
import { createMemoryMetricsStore } from '../../packages/golearn-extension/src/metrics';
import { PACK_ID, PACK_IDS, PARSER_LANGUAGE, PARSER_LANGUAGES, parseSelection } from '../../packages/golearn-extension/src/parser';
import type { CardModel } from '../../packages/golearn-extension/src/parser';
import { createCardUI } from '../../packages/golearn-extension/src/popup/card';
import type { PublicStatus } from '../../packages/golearn-extension/src/protocol';
import { createMemoryEncounterStore } from '../../packages/golearn-extension/src/store';
import { validateEvent } from '../../packages/repository-contract/src';
import { esAdapter } from '../../src/adapters/es';
import { sqAdapter } from '../../src/adapters/sq';
import { selectText, setBody, stubLayout } from '../extension/dom';

const ES = 'Los niños leen los libros.';
const SQ = 'Fëmijët lexojnë librin.';

function parse(word: string, sentence: string, languageId?: string): CardModel {
  const at = sentence.indexOf(word);
  return parseSelection({ surface: word, ...(languageId ? { languageId } : {}), context: { kind: 'sentence', confidence: 0.9, sentence, selStart: at, selEnd: at + word.length } });
}

describe('parseSelection chooses the adapter by languageId', () => {
  it('the registry lists Albanian and Spanish, and the default is still Albanian', () => {
    expect([...PARSER_LANGUAGES]).toEqual(['sq', 'es']);
    expect(PARSER_LANGUAGE).toBe('sq');
    expect(PACK_ID).toBe(`pack:sq:${sqAdapter.version}`);
    expect(PACK_IDS).toEqual({ sq: `pack:sq:${sqAdapter.version}`, es: `pack:es:${esAdapter.version}` });
  });

  it('a Spanish sentence yields a Spanish card: lemma, part of speech, morphology line, features, unit ids, pronunciation notes', () => {
    const c = parse('libros', ES, 'es');
    expect(c).toMatchObject({ languageId: 'es', packId: `pack:es:${esAdapter.version}`, analyzerId: `adapter-es@${esAdapter.version}`, surface: 'libros', lemma: 'libro', pos: 'NOUN', provenance: 'lexicon', unconfirmed: false, tokenCount: 1 });
    expect(c.morphology).toMatch(/masculine plural/);
    expect(c.features).toEqual(expect.arrayContaining([{ key: 'Number', value: 'Plur' }, { key: 'Gender', value: 'Masc' }]));
    expect(c.gloss).toMatch(/book/);
    expect(c.formId).toBe('form:es:libros');
    expect(c.itemIds).toContain('lemma:es:libro:NOUN');
    expect(c.unitIds).toEqual(expect.arrayContaining(['form:es:libros', 'lemma:es:libro:NOUN']));
    expect(c.constructions.some((k) => k.source === 'form' && /^morph:es:NOUN:/.test(k.unitId))).toBe(true);
    expect(c.pronunciation.join(' ')).toMatch(/next-to-last syllable/);
    expect(c.context.kind).toBe('sentence');
    expect(c.sentenceWords.map((w) => w.surface)).toEqual(['Los', 'niños', 'leen', 'los', 'libros']);
    expect(c.sentenceWords.find((w) => w.selected)?.surface).toBe('libros');
    expect(JSON.stringify(c)).not.toMatch(/:sq:|pack:sq|Albanian/);
  });

  it('a Spanish verb in context is read by the Spanish rules, a Spanish pattern is offered, and the Spanish limits are shown', () => {
    const c = parse('coma', 'Quiero que ella coma pan.', 'es');
    expect(c).toMatchObject({ languageId: 'es', lemma: 'comer', pos: 'VERB', provenance: 'rule' });
    expect(c.morphology).toMatch(/present subjunctive/);
    expect(c.constructions.some((k) => k.source === 'pattern' && k.id === 'querer-que-subjunctive' && k.unitId.startsWith('syntax:es:'))).toBe(true);
    expect(c.alternatives.length).toBeGreaterThan(0);
    expect(c.limits.join(' ')).toMatch(/machine-drafted/);
  });

  it('an Albanian sentence yields the Albanian card, unchanged, whether or not languageId is given', () => {
    const implicit = parse('librin', SQ);
    const explicit = parse('librin', SQ, 'sq');
    expect(explicit).toEqual(implicit);
    expect(implicit).toMatchObject({ languageId: 'sq', packId: PACK_ID, lemma: 'libër', pos: 'NOUN', formId: 'form:sq:librin' });
    expect(implicit.morphology).toMatch(/accusative/);
    expect(implicit.constructions.some((k) => k.id === 'definite-accusative-singular' && k.unitId === 'morph:sq:NOUN:Case=Acc|Definite=Def|Gender=Masc|Number=Sing')).toBe(true);
    expect(JSON.stringify(implicit)).not.toMatch(/:es:|pack:es/);
  });

  it('the same surface gives different languages different ids', () => {
    const e = parse('casa', 'La casa es grande.', 'es');
    const a = parse('casa', 'Ana ka një casa.', 'sq');
    expect(e.formId).toBe('form:es:casa');
    expect(a.formId).toBe('form:sq:casa');
    expect(e.itemIds.filter((i) => a.itemIds.includes(i))).toEqual([]);
  });

  it('an unlisted language throws (the controller turns that into the "parser-error" message) rather than reading it with another adapter', () => {
    expect(() => parse('Haus', 'Das Haus ist alt.', 'de')).toThrow(/No parser for language "de"/);
    expect(() => parse('x', 'x', 'constructor')).toThrow(RangeError);
  });

  it('accents, ñ and inverted marks survive NFC normalisation; a decomposed ñ is composed; a page in another language is noted', () => {
    const c = parse('niños', ES, 'es');
    expect(c.surface).toBe('niños');
    const decomposed = parseSelection({ surface: 'niños', languageId: 'es', context: { kind: 'none', confidence: 0 } });
    expect(decomposed.surface).toBe('niños');
    expect(decomposed.lemma).toBe('niño');
    const q = parse('Cómo', '¿Cómo estás?', 'es');
    expect(q.surface).toBe('Cómo');
    expect(q.sentenceWords.map((w) => w.surface)).toEqual(['Cómo', 'estás']);
    const onEnglishPage = parseSelection({ surface: 'casa', languageId: 'es', context: { kind: 'none', confidence: 0, pageLanguage: 'en-US' } });
    expect(onEnglishPage.notes.join(' ')).toMatch(/Spanish word list is applied because Spanish is the language you are studying/);
    const onSpanishPage = parseSelection({ surface: 'casa', languageId: 'es', context: { kind: 'none', confidence: 0, pageLanguage: 'es-HN' } });
    expect(onSpanishPage.notes.join(' ')).not.toMatch(/page declares/);
    // a non-Latin selection is not read as Spanish
    expect(parseSelection({ surface: 'книга', languageId: 'es', context: { kind: 'none', confidence: 0 } }).notes.join(' ')).toMatch(/not in Latin script: the Spanish word list/);
  });
});

// ───────────────────────────── the content controller, end to end ─────────────────────────────

const PAGE_ES = `<div id="content"><p id="p" lang="es">${ES} ¿Cómo estás? Pastaj shkoj.</p></div>`;
const status = (over: Partial<PublicStatus> = {}): PublicStatus => ({ ok: true, connected: true, needsSignIn: false, languageId: 'sq', languageName: 'Albanian', packAvailable: true, ...over });
const services = (st: PublicStatus): ContentServices => ({
  status: async () => st,
  profile: async () => ({ ok: true, connected: true, rows: {}, depth: 'brief', depthOrigin: 'default' }),
  gloss: async () => ({ ok: true, found: false, senses: [], attribution: '', reason: 'no-entry', message: 'none' }) as never,
  explain: async () => ({ ok: true, source: 'none', features: [], constructions: [] }),
  correct: async () => ({ ok: true, posted: false, reason: 'not-connected' }),
  pronounceInfo: async () => ({ ok: true, deviceVoice: 'maybe', remoteConsent: false, sources: [], note: '' }),
});

let restore: () => void;
let live: LookupController[] = [];
function rig(st: PublicStatus) {
  const store = createMemoryEncounterStore();
  const holder: { c?: LookupController } = {};
  const ui = createCardUI({ doc: document, pronouncer: { availability: () => ({ available: false, note: 'no voice' }), play: () => ({ ok: false, message: 'no voice' }) }, onDismiss: () => holder.c?.onCardDismissed() });
  const parser = vi.fn(parseSelection);
  const controller = new LookupController({
    doc: document,
    adapters: [new WebGenericAdapter({ doc: document, segmentSentences: (t) => sqAdapter.segmentSentences(t) }), new UnsupportedAdapter()],
    parse: parser, ui, store, metrics: createMemoryMetricsStore(), services: services(st), analysers: [...PARSER_LANGUAGES],
    identity: { learnerId: 'pending', enrolmentId: 'pending', deviceId: 'pending' }, version: '0.1.0', sessionId: `m${Math.random().toString(36).slice(2, 8)}`,
    nextFrame: () => Promise.resolve(),
  });
  holder.c = controller;
  live.push(controller);
  return { controller, ui, store, parser };
}

beforeEach(() => { restore = stubLayout(); setBody(PAGE_ES); });
afterEach(() => { for (const c of live) c.dispose(); live = []; restore(); vi.restoreAllMocks(); });

describe('the content controller with a Spanish enrolment', () => {
  it('parses with the enrolment’s language, shows a Spanish card, and records a Spanish selection event that validates', async () => {
    const r = rig(status({ languageId: 'es', languageName: 'Spanish' }));
    selectText(document.getElementById('p')!, 'libros');
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(out.status).toBe('shown');
    if (out.status !== 'shown') return;
    expect(r.parser).toHaveBeenCalledTimes(1);
    expect(r.parser.mock.calls[0][0]).toMatchObject({ surface: 'libros', languageId: 'es' });
    expect(out.card).toMatchObject({ languageId: 'es', lemma: 'libro', pos: 'NOUN' });
    const shadow = r.ui.root()!;
    expect(shadow.textContent).toContain('GoLearn · Spanish');
    expect(shadow.querySelector('.word')!.textContent).toBe('libros');
    expect(shadow.querySelector('.word')!.getAttribute('dir')).toBe('auto');
    expect(shadow.textContent).toMatch(/libro/);
    expect(shadow.textContent).toMatch(/masculine plural/);
    const all = await r.store.list();
    expect(all.length).toBeGreaterThan(0);
    for (const e of all) { expect(e.languageId, e.kind).toBe('es'); expect(validateEvent(e), e.kind).toEqual([]); }
    const lookup = all.find((e) => e.kind === 'SelectionLookedUp')!;
    expect((lookup.subject.itemIds ?? []).every((i) => /:es:/.test(i))).toBe(true);
    expect(lookup.subject.itemIds ?? []).toContain('lemma:es:libro:NOUN');
    expect(JSON.stringify(all)).not.toMatch(/:sq:|pack:sq/);
  });

  it('the same page with an Albanian enrolment gives the Albanian card for an Albanian word and parses with sq', async () => {
    const r = rig(status());
    selectText(document.getElementById('p')!, 'shkoj');
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(out.status).toBe('shown');
    if (out.status !== 'shown') return;
    expect(r.parser.mock.calls[0][0]).toMatchObject({ languageId: 'sq' });
    expect(out.card.languageId).toBe('sq');
    expect(r.ui.root()!.textContent).toContain('GoLearn · Albanian');
    for (const e of await r.store.list()) expect(e.languageId).toBe('sq');
  });

  it('a language with no analyser in the build is still turned away, not read with another language’s adapter', async () => {
    const r = rig(status({ languageId: 'de', languageName: 'German', packAvailable: false }));
    selectText(document.getElementById('p')!, 'libros');
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(out).toMatchObject({ status: 'message', reason: 'no-pack' });
    expect(r.parser).not.toHaveBeenCalled();
  });
});

describe('the content script’s analyser list', () => {
  it('is built from the parser registry, so the two cannot drift', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../packages/golearn-extension/src/content/index.ts'), 'utf8');
    expect(src).toMatch(/import \{ PARSER_LANGUAGES, parseSelection \} from '\.\.\/parser'/);
    expect(src).toMatch(/analysers: \[\.\.\.PARSER_LANGUAGES\]/);
    expect(src).not.toMatch(/analysers: \['sq'\]/);
  });
});
