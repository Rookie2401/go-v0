// @vitest-environment node
/**
 * The language-pack capability report (packages/language-packs/src/capabilities.ts): every pack's report must match its
 * manifest and its adapter, and must never claim what the adapter does not do.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deAdapter } from '../../src/adapters/de';
import { elAdapter } from '../../src/adapters/el';
import { esAdapter } from '../../src/adapters/es';
import { hiAdapter } from '../../src/adapters/hi';
import { heAdapter } from '../../src/adapters/he';
import { laAdapter } from '../../src/adapters/la';
import { nbAdapter } from '../../src/adapters/nb';
import { nnAdapter } from '../../src/adapters/nn';
import { arcAdapter } from '../../src/adapters/arc';
import { ARC_SOURCE_ID } from '../../src/adapters/aramaic/meta';
import { ARAMAIC_SEED } from '../../src/adapters/aramaic/seed';
import { sqAdapter } from '../../src/adapters/sq';
import { thAdapter } from '../../src/adapters/th';
import type { LanguageAdapter } from '../../src/core';
import {
  DEPENDABLE_ACCURACY, DEPENDABLE_MIN_ITEMS, PACK_EVIDENCE, PACKS, allPackCapabilities, deriveLemmaQuality, evidenceFor, levelOf, measuredSentence, packCapabilities,
} from '../../packages/language-packs/src';
import type { LemmaMeasurement, PackEvidence } from '../../packages/language-packs/src';
import type { SupportLevel } from '../../src/core';

const ADAPTERS: Record<string, LanguageAdapter> = { arc: arcAdapter, sq: sqAdapter, es: esAdapter, de: deAdapter, hi: hiAdapter, th: thAdapter, nb: nbAdapter, nn: nnAdapter, la: laAdapter, he: heAdapter, el: elAdapter };
const q = (l: SupportLevel): string => (l === 'dependable' ? 'dependable' : l === 'limited' ? 'limited' : 'none');

describe('every pack’s report matches its manifest and its adapter', () => {
  it('there is one report per pack, in registry order, and none for a language without a pack', () => {
    expect(allPackCapabilities().map((c) => c.languageId)).toEqual(Object.keys(PACKS));
    expect(packCapabilities('xx')).toBeUndefined();
    expect(packCapabilities('constructor')).toBeUndefined();
    expect(packCapabilities('toString')).toBeUndefined();
  });

  it.each(Object.keys(PACKS))('%s: identity, level, review status and analyser id come from the manifest and the adapter', (lang) => {
    const m = PACKS[lang];
    const c = packCapabilities(lang)!;
    const a = ADAPTERS[lang];
    expect(c).toMatchObject({ languageId: lang, packId: m.packId, version: m.version, level: levelOf(m), reviewStatus: m.rights.reviewStatus });
    expect(c.analyzer).toBe(a ? 'adapter' : 'none');
    expect(c.analyzerId).toBe(a ? m.analyzer.id : 'intl-tokenize@1');
    if (a) expect(c.analyzerId).toBe(`adapter-${a.lang}@${a.version}`);
    expect(c.reviewStatus).toBe('machine-drafted');
  });

  it.each(Object.keys(ADAPTERS))('%s: tokenization, sentence segmentation, lemma, morphology and phrases are exactly what the adapter states and the manifest declares', (lang) => {
    const m = PACKS[lang];
    const a = ADAPTERS[lang];
    const s = a.support;
    const c = packCapabilities(lang)!;
    const declares = (cap: string): boolean => m.analyzer.capabilities.includes(cap);
    expect(c.tokenization).toMatchObject({ quality: q(s.tokenization), method: m.segmentation.method });
    expect(c.sentenceSegmentation.quality).toBe(q(s.sentenceSegmentation));
    expect(c.lemma.supported).toBe(declares('lemma') && s.lemmatization !== 'none');
    // the analyser's statement about its own word list is kept as it is; the level is derived from the evidence and is never below it
    expect(c.lemma.analyserLevel).toBe(c.lemma.supported ? s.lemmatization : 'none');
    expect(c.lemma.quality).toBe(c.lemma.supported ? deriveLemmaQuality(s.lemmatization, { lemmaSources: c.lemma.sources, lemmaMeasurements: c.lemma.measured }) : 'none');
    expect(c.morphology.supported).toBe(declares('morphology') && s.morphology !== 'none');
    expect(c.morphology.quality).toBe(c.morphology.supported ? s.morphology : 'none');
    expect(c.phrases.supported).toBe(declares('phrases') && s.phraseDetection !== 'none');
    expect(c.phrases.quality).toBe(c.phrases.supported ? s.phraseDetection : 'none');
    expect(c.constructions.supported).toBe(declares('constructions'));
    expect(c.constructions.explained).toEqual(m.grammar.constructions.map((k) => k.id));
    expect(c.morphology.explained).toEqual(m.grammar.features.map((f) => f.key));
    expect(c.limitations).toEqual(s.limitations);
  });

  it('never claims a feature the adapter does not implement: every "supported" is backed by a non-"none" adapter level, and every manifest capability by the adapter', () => {
    for (const [lang, a] of Object.entries(ADAPTERS)) {
      const c = packCapabilities(lang)!;
      if (c.lemma.supported) expect(a.support.lemmatization, lang).not.toBe('none');
      if (c.morphology.supported) expect(a.support.morphology, lang).not.toBe('none');
      if (c.phrases.supported) expect(a.support.phraseDetection, lang).not.toBe('none');
      if (c.checker.offered) expect(a.support.productionChecks, lang).not.toBe('none');
      const caps = PACKS[lang].analyzer.capabilities;
      if (a.support.lemmatization === 'none') expect(caps, lang).not.toContain('lemma');
      if (a.support.morphology === 'none') expect(caps, lang).not.toContain('morphology');
      if (a.support.phraseDetection === 'none') expect(caps, lang).not.toContain('phrases');
    }
  });

  it('Thai has no morphology to offer (the manifest does not declare it), though the adapter records parts of speech', () => {
    const th = packCapabilities('th')!;
    expect(th.morphology).toMatchObject({ supported: false, quality: 'none', observed: [] });
    expect(th.morphology.note).toMatch(/no inflection/);
    expect(th.tokenization.quality).toBe('limited');
    expect(th.phrases).toEqual({ supported: true, quality: 'seed-only' });
  });

  it('the features the analyser really wrote (on the pack’s own validation sentences) are listed apart from the ones the tables explain', () => {
    const de = packCapabilities('de')!;
    expect(de.morphology.explained).toEqual(['Case', 'Gender']);
    expect(de.morphology.observed).toEqual(expect.arrayContaining(['Case', 'Gender', 'Number', 'Person', 'Tense', 'Mood']));
    expect(packCapabilities('hi')!.morphology.observed).toEqual(expect.arrayContaining(['Aspect', 'Gender', 'Number', 'Case']));
    for (const lang of ['sq', 'es', 'de', 'hi', 'nb', 'nn']) expect(packCapabilities(lang)!.morphology.observed.length, lang).toBeGreaterThan(4);
  });
});

describe('Norwegian (experimental): the report states what the adapter does and nothing more', () => {
  it.each(['nb', 'nn'])('%s: an adapter, seed-only lemma, limited morphology and phrases, three explained features and three explained constructions, no checker offered', (lang) => {
    const c = packCapabilities(lang)!;
    expect(c).toMatchObject({ level: 'experimental', analyzer: 'adapter', analyzerId: PACKS[lang].analyzer.id });
    expect(c.tokenization).toMatchObject({ quality: 'dependable', method: 'adapter' });
    expect(c.lemma).toMatchObject({ supported: true, quality: 'seed-only', analyserLevel: 'seed-only', sources: [] });
    expect(c.lemma.note).toMatch(/^Seed-only: lemmas come from a small machine-drafted word list/);
    expect(c.dictionary.declared).toBe(false);
    expect(c.morphology).toMatchObject({ supported: true, quality: 'limited', explained: ['Gender', 'Definite', 'Tense'] });
    expect(c.morphology.observed).toEqual(expect.arrayContaining(['Gender', 'Definite', 'Number', 'Tense']));
    expect(c.phrases).toMatchObject({ supported: true, quality: 'limited' });
    expect(c.constructions).toEqual({ supported: true, explained: ['perfect-har', 'modal-bare-infinitive', 'particle-verb'] });
    expect(c.checker.offered).toBe(false);
    expect(c.limitations.join(' ')).toMatch(/seed-only/);
  });
});

describe('lemma quality is derived from the evidence, by one stated rule', () => {
  const human = (lemmaAccuracy: number, items: number): LemmaMeasurement => ({ id: 'h', corpus: 'a text', gold: 'a treebank', goldKind: 'human-treebank', heldOut: true, items, lemmaAccuracy, measuredOn: '2026-01-01', source: 'x' });
  const ai = (lemmaAccuracy: number): LemmaMeasurement => ({ ...human(lemmaAccuracy, 200), goldKind: 'ai-labelled', gold: 'AI labels' });
  const source = { kind: 'dictionary-forms-index' as const, id: 'd', label: 'a form index', source: 'x' };
  const ev = (over: Partial<PackEvidence>): PackEvidence => ({ lemmaSources: [], lemmaMeasurements: [], ...over });

  it('seed-only stays seed-only without a source beyond the hand list; a source makes it limited; an AI-labelled figure never raises it', () => {
    expect(deriveLemmaQuality('seed-only', ev({}))).toBe('seed-only');
    expect(deriveLemmaQuality('seed-only', ev({ lemmaSources: [source] }))).toBe('limited');
    expect(deriveLemmaQuality('seed-only', ev({ lemmaMeasurements: [ai(99.9)] }))).toBe('seed-only');
    expect(deriveLemmaQuality('seed-only', ev({ lemmaSources: [source], lemmaMeasurements: [ai(99.9)] }))).toBe('limited');
  });

  it('dependable needs EVERY human-treebank figure at the bar and one of them over enough words', () => {
    expect([DEPENDABLE_ACCURACY, DEPENDABLE_MIN_ITEMS]).toEqual([95, 10_000]);
    expect(deriveLemmaQuality('seed-only', ev({ lemmaMeasurements: [human(95, 10_000)] }))).toBe('dependable');
    expect(deriveLemmaQuality('seed-only', ev({ lemmaMeasurements: [human(94.99, 500_000)] }))).toBe('seed-only');
    expect(deriveLemmaQuality('seed-only', ev({ lemmaMeasurements: [human(99, 9_999)] }))).toBe('seed-only'); // too few words to carry it
    expect(deriveLemmaQuality('seed-only', ev({ lemmaSources: [source], lemmaMeasurements: [human(96, 100_000), human(90, 60_000)] }))).toBe('limited'); // one corpus below the bar
    expect(deriveLemmaQuality('seed-only', ev({ lemmaMeasurements: [human(96, 100_000), human(95.5, 400)] }))).toBe('dependable');
  });

  it('the evidence never lowers what the analyser states, and never turns “none” into something', () => {
    expect(deriveLemmaQuality('dependable', ev({}))).toBe('dependable');
    expect(deriveLemmaQuality('limited', ev({}))).toBe('limited');
    expect(deriveLemmaQuality('none', ev({ lemmaSources: [source], lemmaMeasurements: [human(99, 100_000)] }))).toBe('none');
  });

  it('each language gets the level its evidence gives it: Norwegian seed-only, every language with a dictionary or form index limited, none dependable', () => {
    const level = Object.fromEntries(allPackCapabilities().map((c) => [c.languageId, c.lemma.quality]));
    expect(level).toEqual({ sq: 'limited', es: 'limited', de: 'limited', hi: 'limited', th: 'limited', nb: 'seed-only', nn: 'seed-only', la: 'limited', he: 'limited', el: 'limited', arc: 'limited' });
    // Latin is measured at the bar on the Vulgate New Testament and below it on the classical authors: the rule asks for every corpus
    const la = packCapabilities('la')!.lemma;
    expect(la.measured.map((m) => [m.id, m.goldKind, m.lemmaAccuracy >= DEPENDABLE_ACCURACY])).toEqual([['proiel-nt', 'human-treebank', true], ['perseus-agldt', 'human-treebank', false]]);
    // every analyser still states seed-only for its own word list, and the report keeps that beside the derived level
    for (const c of allPackCapabilities()) expect(c.lemma.analyserLevel, c.languageId).toBe('seed-only');
  });

  it('the note says where a lemma comes from and what was measured against what, and calls AI-labelled agreement what it is', () => {
    const de = packCapabilities('de')!.lemma.note;
    expect(de).toMatch(/^Limited: a lemma comes from the pack’s hand word list and the closed classes, and for other words from the form index of the pack’s Wiktionary dictionary; /);
    expect(de).toContain('Its first reading agreed with AI-written labels that nobody has checked on 96.3% of 215 words of course texts and 96.3% of 80 words of held-out text: agreement with a machine, not a measure of correctness.');
    expect(de).toMatch(/The analyser states ‘seed-only’ for its own word list\.$/);
    const la = packCapabilities('la')!.lemma.note;
    expect(la).toContain('from the analyser’s own Latin lexicon and the form index of the pack’s Wiktionary dictionary');
    expect(la).toContain('The first reading had the right lemma 95.6% on the Latin New Testament (Clementine Vulgate) against the PROIEL treebank (104,345 words) and 90.5% on twelve classical and late Latin authors against the Perseus treebank (65,595 words).');
    const he = packCapabilities('he')!.lemma.note;
    expect(he).toContain('the forms of the Hebrew Bible with their Open Scriptures morphology (52,687 forms) and Wiktionary’s Hebrew inflection tables (149,277 forms)');
    expect(he).toContain('Lemma accuracy has not been measured on running text.');
    expect(measuredSentence([])).toBe('Lemma accuracy has not been measured on running text.');
    // Norwegian is measured (against AI labels) and is still seed-only: a figure is not a source
    expect(packCapabilities('nb')!.lemma.note).toMatch(/^Seed-only: .* Its first reading agreed with AI-written labels that nobody has checked on 96\.7% of 215 words of course texts and 100\.0% of 70 words of held-out text/);
  });

  it('the dictionary block is the manifest’s declaration, and a form index counts as a lemma source only while the pack declares that dictionary', () => {
    for (const c of allPackCapabilities()) {
      const d = PACKS[c.languageId].lexical.dictionary;
      expect(c.dictionary.declared, c.languageId).toBe(!!d);
      if (d) expect(c.dictionary, c.languageId).toMatchObject({ id: d.id, entries: d.entries, licence: d.licence, attribution: d.attribution });
      for (const s of c.lemma.sources.filter((x) => x.kind === 'dictionary-forms-index')) expect(s.id, c.languageId).toBe(d?.id);
    }
    expect(packCapabilities('la')!.dictionary.note).toContain('kaikki-la@2026-10-17 (997,266 entries');
    expect(packCapabilities('he')!.dictionary).toEqual({ declared: false, note: 'The pack declares no dictionary: meanings come from the pack’s own word list and, where the analyser reads a form index, from that index.' });
    // a report is plain data and a caller cannot reach the evidence table through it
    const report = packCapabilities('la')!;
    report.lemma.measured[0].lemmaAccuracy = 0;
    expect(PACK_EVIDENCE.la.lemmaMeasurements[0].lemmaAccuracy).toBe(95.64);
  });
});

describe('the evidence table states only what the committed reports state', () => {
  const read = (rel: string): any => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf8'));

  it('every row names a file; a language outside the table has no evidence; every listed language has a pack', () => {
    for (const [lang, e] of Object.entries(PACK_EVIDENCE)) {
      expect(PACKS[lang], lang).toBeDefined();
      for (const s of e.lemmaSources) expect(s.source, `${lang} ${s.id}`).toMatch(/^(public|data|docs|src)\//);
      for (const m of e.lemmaMeasurements) {
        expect(fs.existsSync(path.resolve(__dirname, '../..', m.source)), `${lang} ${m.id}: ${m.source}`).toBe(true);
        expect(m.lemmaAccuracy, `${lang} ${m.id}`).toBeGreaterThan(0);
        expect(m.lemmaAccuracy, `${lang} ${m.id}`).toBeLessThanOrEqual(100);
      }
    }
    expect(evidenceFor('xx')).toEqual({ lemmaSources: [], lemmaMeasurements: [] });
    expect(evidenceFor('constructor')).toEqual({ lemmaSources: [], lemmaMeasurements: [] });
  });

  it('Biblical Aramaic: the source is the bundled corpus the analyser reads, with the number of distinct forms it holds', () => {
    const [source] = PACK_EVIDENCE.arc.lemmaSources;
    expect(source).toMatchObject({ kind: 'attested-form-index', id: ARC_SOURCE_ID, source: 'src/adapters/aramaic/seed.ts' });
    expect(source.size).toEqual({ count: new Set(ARAMAIC_SEED.map((r) => r.surface)).size, unit: 'forms' });
    expect(arcAdapter.support.limitations.join(' ')).toMatch(/recognizes only attested forms in the bundled corpus/);
  });

  it('the AI-labelled figures are the gold report’s own counts (docs/ecosystem/linguistics/GOLD-REPORT-2026-10-10.json), and the report says who labelled them', () => {
    const report = read('docs/ecosystem/linguistics/GOLD-REPORT-2026-10-10.json');
    expect(report.labelled_by).toMatch(/AI-judged, unreviewed; no native speaker/);
    expect(report.at.slice(0, 10)).toBe('2026-10-10');
    let rows = 0;
    for (const [lang, e] of Object.entries(PACK_EVIDENCE)) {
      for (const m of e.lemmaMeasurements.filter((x) => x.goldKind === 'ai-labelled')) {
        const set = m.id.replace('gold-2026-10-10-', '');
        const r = report.results[lang][set];
        expect(m.items, `${lang} ${set}`).toBe(r.scored);
        expect(m.lemmaAccuracy, `${lang} ${set}`).toBe(Math.round((r.lemma / r.scored) * 1000) / 10);
        expect(m.heldOut, `${lang} ${set}`).toBe(set === 'unseen');
        expect(m.measuredOn).toBe('2026-10-10');
        rows++;
      }
    }
    expect(rows).toBe(14); // seven languages, the course-text set and the held-out set of each
  });

  it('the Latin figures are the evaluation report’s own (data/review/latin-eval/report.json): PROIEL as stated, Perseus pooled over its twelve files', () => {
    const report = read('data/review/latin-eval/report.json');
    const [proiel, perseus] = PACK_EVIDENCE.la.lemmaMeasurements;
    const nt = report.corpora.nt.gold;
    expect(nt.mode).toBe('proiel');
    expect([proiel.items, proiel.lemmaAccuracy]).toEqual([nt.aligned, nt.lemmaStrict]);
    expect(proiel.analyser).toBe(report.adapter.id);
    expect(proiel.measuredOn).toBe(report.runAt.slice(0, 10));
    const own = Object.values(report.corpora as Record<string, any>).filter((c) => c.gold?.mode === 'perseus-own');
    expect(own).toHaveLength(12);
    const words = own.reduce((a, c) => a + c.gold.aligned, 0);
    const pooled = own.reduce((a, c) => a + (c.gold.aligned * c.gold.lemmaStrict) / 100, 0) / words;
    expect(perseus.items).toBe(words);
    expect(perseus.lemmaAccuracy).toBe(Math.round(pooled * 10000) / 100);
    // the analyser's own lexicon is a source because it confirms nearly every word of running text, as the same report shows
    expect(PACK_EVIDENCE.la.lemmaSources[0]).toMatchObject({ kind: 'analyser-lexicon', id: report.adapter.id, source: 'data/review/latin-eval/report.json' });
    expect(report.corpora.vulgate.lexiconConfirmedPct).toBeGreaterThan(95);
  });

  // the dictionaries and form indexes are generated and not tracked (test/needs-local-data.txt): checked where they are present
  const local = (rel: string): boolean => fs.existsSync(path.resolve(__dirname, '../..', rel));
  it.each(Object.entries(PACK_EVIDENCE).flatMap(([lang, e]) => e.lemmaSources.filter((s) => s.source.endsWith('.json') && s.kind !== 'analyser-lexicon').map((s) => [lang, s.id, s] as const)))('%s %s: the source file holds what the row says', (lang, _id, s) => {
    if (!local(s.source)) return;
    const file = read(s.source);
    if (s.kind === 'dictionary-forms-index') {
      // built from the dictionary the pack declares, for this language
      expect(file.lang).toBe(lang);
      expect(file.forms).toBeGreaterThan(1000);
      expect(read(`public/dict/${lang}/manifest.json`).id ?? PACKS[lang].lexical.dictionary!.id).toBe(s.id);
    } else {
      expect(file.id).toBe(s.id);
      const forms = file.shards ? Object.values(file.shards as Record<string, { keys: number }>).reduce((a, x) => a + x.keys, 0) : Object.keys(file.forms).length;
      expect(s.size).toEqual({ count: forms, unit: 'forms' });
    }
  });
});

describe('syntactic roles: none, anywhere', () => {
  it('every report says so, and no analyser puts a grammatical relation (subject, object, modifier …) on a reading of any validation sentence', () => {
    for (const c of allPackCapabilities()) expect(c.syntaxRoles, c.languageId).toMatchObject({ supported: false });
    const RELATION = /^(subject|object|nsubj|obj|iobj|dobj|root|nmod|amod|advmod|obl|aux|cop|mark|case)/iu;
    const seen: string[] = [];
    for (const [lang, a] of Object.entries(ADAPTERS)) {
      for (const v of PACKS[lang].validation) {
        if (!v.sentence) continue;
        for (const x of a.analyze(a.tokenize(v.sentence))) for (const cand of x.candidates) {
          if (cand.role === undefined) continue;
          seen.push(`${lang}: ${cand.role}`);
          expect(cand.role, `${lang}: ${v.sentence}`).not.toMatch(RELATION);
        }
      }
    }
    // the roles that do exist are short descriptions of a function word's own job (a linking article, a relative pronoun, a separable prefix …)
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.some((s) => /^sq: linking article/.test(s))).toBe(true);
    expect(seen.some((s) => /^de: separable prefix/.test(s))).toBe(true);
  });
});

describe('the production checker is offered only where the pack declares it', () => {
  it('Albanian and Spanish offer it (the adapters call it limited); German, Hindi and Thai have rules in the adapter but the pack does not offer them', () => {
    expect(packCapabilities('sq')!.checker).toMatchObject({ offered: true, quality: 'limited', adapterLevel: 'limited' });
    expect(packCapabilities('es')!.checker).toMatchObject({ offered: true, quality: 'limited', adapterLevel: 'limited' });
    expect(packCapabilities('es')!.checker.scope.join(' ')).toMatch(/article–noun agreement.*number above one/);
    for (const lang of ['de', 'hi', 'th']) {
      const k = packCapabilities(lang)!.checker;
      expect(k, lang).toMatchObject({ offered: false, quality: 'none', adapterLevel: 'limited' });
      expect(k.note, lang).toMatch(/does not offer them: nothing is checked/);
    }
    // the Bokmål adapter has production rules (limited), the Nynorsk one checks nothing; neither pack offers them
    expect(packCapabilities('nb')!.checker).toMatchObject({ offered: false, quality: 'none', adapterLevel: 'limited' });
    expect(packCapabilities('nb')!.checker.note).toMatch(/does not offer them: nothing is checked/);
    expect(packCapabilities('nn')!.checker).toMatchObject({ offered: false, quality: 'none', adapterLevel: 'none' });
  });

  it('the Albanian and Spanish checkers really fire on a planted error (the claim is true)', () => {
    const fire = (a: LanguageAdapter, s: string) => a.checkProduction(a.tokenize(s), a.analyze(a.tokenize(s)), s).length;
    expect(fire(sqAdapter, 'Unë shkon në shkollë.')).toBeGreaterThan(0);
    expect(fire(esAdapter, 'la pecado')).toBeGreaterThan(0);
  });
});

describe('script handling is verified live, every time the report is built', () => {
  const claims: Record<string, string[]> = {
    sq: ['digraphs-stay-whole', 'clitic-clusters'],
    es: ['attached-clitics', 'accents-and-inverted-marks'],
    de: ['compounds', 'separable-verbs'],
    hi: ['grapheme-clusters', 'sentence-end-danda'],
    th: ['word-segmentation', 'tone-decoding'],
    nb: ['ae-oe-aa-stay-whole', 'particle-verbs'],
    nn: ['ae-oe-aa-stay-whole', 'particle-verbs'],
    la: ['ligatures-and-macrons-stay-whole', 'enclitic-que-ne'],
  };
  it.each(Object.keys(claims))('%s: each claim has a probe and the probe passes on the real analyser', (lang) => {
    const items = packCapabilities(lang)!.scriptHandling.items;
    expect(items.map((i) => i.id)).toEqual(claims[lang]);
    for (const i of items) expect(i.works, `${lang}/${i.id}: ${i.evidence}`).toBe(true);
    expect(packCapabilities(lang)!.scriptHandling.script).toBe(PACKS[lang].scriptId);
  });
});

describe('pronunciation notes: the manifest says there are notes only where the adapter really gives some', () => {
  it.each(Object.keys(ADAPTERS))('%s', (lang) => {
    const a = ADAPTERS[lang];
    const gives = PACKS[lang].validation.some((v) => {
      const toks = a.tokenize(v.surface);
      const an = a.analyze(toks);
      const i = toks.findIndex((t) => t.isWord);
      return i >= 0 && (a.pronunciation(toks[i], an[i]).notes ?? []).length > 0;
    }) || ['Straße schön Zeit', 'किताब पढ़ता', 'ข้าว บ้าน', 'casa niño', 'shkollë dhëmb'].some((t) => {
      const toks = a.tokenize(t);
      const an = a.analyze(toks);
      return toks.some((tk, i) => tk.isWord && (a.pronunciation(tk, an[i]).notes ?? []).length > 0);
    });
    expect(PACKS[lang].pronunciation.notesAvailable).toBe(gives);
  });
});

describe('audio: this package does not reach GoListen; the report takes a provider and never invents the line', () => {
  it('without a provider there is no audio line at all', () => {
    for (const c of allPackCapabilities()) expect('audio' in c, c.languageId).toBe(false);
  });

  it('with a provider, its answer is carried as given, per language', () => {
    const provided = (languageId: string) => ({ recordings: 7, deviceVoiceTemplate: true, remoteVoices: [languageId], phoneticNotes: false, listeningEvidence: false as const, gaps: [] });
    const all = allPackCapabilities(provided);
    expect(all.map((c) => c.audio?.remoteVoices[0])).toEqual(Object.keys(PACKS));
    expect(packCapabilities('de', provided)!.audio).toMatchObject({ recordings: 7 });
  });

  it('the package imports nothing from GoListen (the audit keeps GoListen out of every entry but the content script)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../packages/language-packs/src/capabilities.ts'), 'utf8');
    expect(src.split('\n').filter((l) => /^\s*import /.test(l)).join('\n')).not.toMatch(/golisten/);
  });
});
