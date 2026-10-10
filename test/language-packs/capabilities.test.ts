// @vitest-environment node
/**
 * The language-pack capability report (packages/language-packs/src/capabilities.ts): every pack's report must match its
 * manifest and its adapter, and must never claim what the adapter does not do.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deAdapter } from '../../src/adapters/de';
import { esAdapter } from '../../src/adapters/es';
import { hiAdapter } from '../../src/adapters/hi';
import { nbAdapter } from '../../src/adapters/nb';
import { nnAdapter } from '../../src/adapters/nn';
import { sqAdapter } from '../../src/adapters/sq';
import { thAdapter } from '../../src/adapters/th';
import type { LanguageAdapter } from '../../src/core';
import { PACKS, allPackCapabilities, levelOf, packCapabilities } from '../../packages/language-packs/src';
import type { SupportLevel } from '../../src/core';

const ADAPTERS: Record<string, LanguageAdapter> = { sq: sqAdapter, es: esAdapter, de: deAdapter, hi: hiAdapter, th: thAdapter, nb: nbAdapter, nn: nnAdapter };
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
    expect(c.lemma.quality).toBe(c.lemma.supported ? s.lemmatization : 'none');
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
    expect(c.lemma).toMatchObject({ supported: true, quality: 'seed-only' });
    expect(c.morphology).toMatchObject({ supported: true, quality: 'limited', explained: ['Gender', 'Definite', 'Tense'] });
    expect(c.morphology.observed).toEqual(expect.arrayContaining(['Gender', 'Definite', 'Number', 'Tense']));
    expect(c.phrases).toMatchObject({ supported: true, quality: 'limited' });
    expect(c.constructions).toEqual({ supported: true, explained: ['perfect-har', 'modal-bare-infinitive', 'particle-verb'] });
    expect(c.checker.offered).toBe(false);
    expect(c.limitations.join(' ')).toMatch(/seed-only/);
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
