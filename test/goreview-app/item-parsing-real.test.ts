// @vitest-environment jsdom
/**
 * "This item" against the real files (public/lexicon, public/dict): the facts of a real Hebrew word, the table GoLearn's card builder
 * makes for it, and the section as a learner sees it. Listed in test/needs-local-data.txt (the files are generated, not tracked).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { packFactsFor } from '../../packages/goreview/app/packFacts';
import { fillItemParsing } from '../../packages/goreview/app/screens/itemParsing';
import type { AppContext } from '../../packages/goreview/app/context';
import { resetHebrewIndexes } from '../../src/adapters/hebrew/index-store';
import { gzipHebrewFormFrequency } from '../../packages/goreview/app/hebrewFrequencyAssets';

const requests: string[] = [];
const fileFetch = (async (input: RequestInfo | URL) => {
  const fs = await import('node:fs'); const path = await import('node:path');
  const pathname = decodeURIComponent(new URL(String(input), 'http://assets.local/').pathname);
  requests.push(pathname);
  const file = path.join(path.resolve(__dirname, '../../public'), pathname);
  // the build derives this file from the Biblical index (vite.config.ts); the facts of a Hebrew form need it
  if (pathname === '/lexicon/he/biblical/form-frequency.json.gz') {
    return new Response(gzipHebrewFormFrequency(JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/lexicon/he/biblical-index.json'), 'utf8'))) as unknown as BodyInit);
  }
  return fs.existsSync(file) && fs.statSync(file).isFile() ? new Response(fs.readFileSync(file)) : new Response('not found', { status: 404 });
}) as unknown as typeof fetch;
const noRepository = { unit: async () => ({ ok: false }) } as never;
afterEach(() => { requests.length = 0; resetHebrewIndexes((id) => id === 'oshb-tanakh-core'); document.body.innerHTML = ''; });

describe('"This item" on real data', () => {
  it('a Hebrew verb: the table is read off the Tanakh and Wiktionary form files, first the word\'s own letter, then the whole verb', async () => {
    const pack = packFactsFor({ fetch: fileFetch, baseUrl: 'http://assets.local/' });
    const ask = { languageId: 'he', lemma: 'זָעַק', pos: 'VERB', surface: 'זָעַק', features: {} };
    const first = await pack.paradigm(ask);
    expect(first?.origin).toBe('attested');
    expect(first?.more).toBe(true); // a verb's prefixed forms live under other letters
    expect(first?.incomplete).toBe(false);
    const firstCount = first!.paradigm!.cells.length;
    expect(firstCount).toBeGreaterThan(10);
    expect(requests.filter((r) => r.endsWith('.json.gz')).sort()).toEqual(['/lexicon/he/biblical/ז.json.gz', '/lexicon/he/modern/ז.json.gz']);
    const whole = await pack.paradigm({ ...ask, whole: true });
    expect(whole?.more).toBe(false);
    expect(whole!.paradigm!.cells.length).toBeGreaterThan(firstCount + 15);
    expect(whole!.paradigm!.kind).toBe('verb-conjugation');
    // the prefix conjugation is there now (a form beginning with י, ת, א or נ)
    expect(whole!.paradigm!.cells.some((c) => /^[יתאנ]/u.test(c.form.normalize('NFD').replace(/[֑-ׇ]/gu, '')))).toBe(true);
    expect(whole!.selected.length).toBeGreaterThan(0);
    // credited to the files the forms were read from, each once, with the licence Wiktionary asks to be named
    const labels = whole!.sources.map((s) => `${s.label} (${s.licence})`);
    expect(labels.some((l) => l.startsWith('Wiktionary Hebrew entries and their inflection tables, via kaikki.org (CC BY-SA 4.0'))).toBe(true);
    expect(labels.some((l) => l.startsWith('Open Scriptures Hebrew Bible morphology'))).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
    // the builder's "the dictionary has no table" is untrue of a table that IS the sources' forms, and a source is named once
    expect(whole!.paradigm!.notes.some((n) => n.startsWith('The dictionary has no table'))).toBe(false);
    expect(whole!.paradigm!.notes[0]).toContain('attested in the Tanakh (Open Scriptures morphology) and listed in the Wiktionary table. ');
    expect(whole!.featureNames.Conj.values.Perf).toBe('perfect (qatal)');
    // the verb's files hold forms of several stems, so no one stem names the table
    expect(new Set(whole!.paradigm!.cells.map((c) => c.features.Binyan).filter(Boolean)).size).toBeGreaterThan(1);
    expect(whole!.paradigm!.template).toBeUndefined();
  });

  it('the section for a real Hebrew form: its parsing in the pack\'s words, its tables, its own cell marked, and no meaning anywhere', async () => {
    const pack = packFactsFor({ fetch: fileFetch, baseUrl: 'http://assets.local/' });
    const provider = pack('he', noRepository)!;
    const facts = await provider.factsFor('form:he:בָּרָא', 'he');
    expect(facts?.unit.label).toBe('בָּרָא');
    const el = document.createElement('div');
    document.body.append(el);
    const ctx = { api: async () => ({ api: noRepository }), engine: { factsFor: async () => facts }, deps: { paradigm: pack.paradigm } } as unknown as AppContext;
    await fillItemParsing(ctx, el, { unitId: 'form:he:בָּרָא', languageId: 'he', varietyId: 'he-bib', tag: 'he', afterAnswer: false });
    expect(el.getAttribute('data-state')).toBe('ready');
    const rows = Object.fromEntries([...el.querySelectorAll('#parsing-facts .parsing-row')].map((r) => [r.getAttribute('data-row'), r.querySelector('dd')!.textContent]));
    expect(rows.form).toBe('בָּרָא');
    expect(rows.lemma).toBe('בָּרָא');
    expect(rows.pos).toBe('verb');
    expect(rows['feature-Binyan']).toBe('Qal (simple)');
    expect(rows['feature-Conj']).toBe('perfect (qatal)');
    expect(el.querySelectorAll('#item-forms table').length).toBeGreaterThan(3);
    const marked = [...el.querySelectorAll('#item-forms [data-selected="true"]')];
    expect(marked.length).toBeGreaterThan(0);
    for (const m of marked) expect(m.textContent).toContain('בָּרָא');
    expect(el.querySelector('.pmark')).toBeNull(); // attested cells carry no rules-or-dictionary mark
    expect(el.querySelector('#forms-loading')).toBeNull(); // the whole verb arrived
    expect(el.querySelector('#forms-sources')!.textContent).toContain('CC BY-SA 4.0');
    const text = (el.textContent ?? '').toLowerCase();
    const analysis = (facts as { wordAnalysis?: { lexicalMeaning?: { text: string } | null; inflectedMeaning?: { text: string } | null } }).wordAnalysis;
    const meanings = [...facts!.glosses, analysis?.lexicalMeaning?.text, analysis?.inflectedMeaning?.text, 'create', 'shape'].filter((m): m is string => !!m);
    for (const meaning of meanings) expect(text, `the meaning "${meaning}" must not be in the section`).not.toContain(meaning.toLowerCase());
  });

  it('German and Spanish: the analyser\'s cells checked against the Wiktionary table, each cell saying who vouches for it', async () => {
    const pack = packFactsFor({ fetch: fileFetch, baseUrl: 'http://assets.local/' });
    const de = await pack.paradigm({ languageId: 'de', lemma: 'Haus', pos: 'NOUN', surface: 'Häuser', features: { Number: 'Plur', Case: 'Nom' } });
    expect(de?.origin).toBe('merged');
    expect(de!.paradigm!.cells.length).toBe(8);
    expect(de!.paradigm!.cells.every((c) => c.status === 'verified')).toBe(true);
    expect(de!.selected).toEqual(['Case=Nom|Number=Plur']);
    expect(de!.sources.map((s) => s.licence)).toContain('CC BY-SA 4.0');
    expect(de!.more).toBe(false);
    const es = await pack.paradigm({ languageId: 'es', lemma: 'hablar', pos: 'VERB', surface: 'hablo', features: { Person: '1', Number: 'Sing', Tense: 'Pres', Mood: 'Ind', VerbForm: 'Fin' } });
    expect(es!.paradigm!.cells.length).toBeGreaterThan(60);
    expect(es!.paradigm!.cells.find((c) => c.form === 'hablo')?.status).toBe('verified');
    expect(es!.selected).toEqual(['Mood=Ind|Number=Sing|Person=1|Tense=Pres|VerbForm=Fin']);
    expect(es!.sources.some((s) => s.label.startsWith('Wiktionary (kaikki.org extract)'))).toBe(true);
  });

  it('a language with no pack to install, or a word with no lemma, has no table to ask for', async () => {
    const pack = packFactsFor({ fetch: fileFetch, baseUrl: 'http://assets.local/' });
    expect(await pack.paradigm({ languageId: 'xx', lemma: 'a', pos: 'NOUN', surface: 'a', features: {} })).toBeUndefined();
    expect(await pack.paradigm({ languageId: 'de', lemma: '', pos: 'NOUN', surface: 'a', features: {} })).toBeUndefined();
    expect(requests).toEqual([]);
  });
});
