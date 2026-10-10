// @vitest-environment node
/**
 * German, Hindi, Thai and Norwegian (Bokmål and Nynorsk) go through the same manifest, installer, runtime and parser as Spanish did,
 * at an honest "experimental" level: installable, seed-only, unreviewed. These tests prove the wiring and keep the honesty notes.
 * Norwegian has no dictionary in the repository, so its block is the same wiring without the dictionary checks.
 */
import { describe, expect, it } from 'vitest';
import { deAdapter } from '../../src/adapters/de';
import { hiAdapter } from '../../src/adapters/hi';
import { nbAdapter } from '../../src/adapters/nb';
import { nnAdapter } from '../../src/adapters/nn';
import { thAdapter } from '../../src/adapters/th';
import type { LanguageAdapter } from '../../src/core';
import { PACK_IDS, PARSER_LANGUAGES, parseSelection, parserAdapter } from '../../packages/golearn-extension/src/parser';
import {
  DE_VALIDATION, HI_VALIDATION, KAIKKI_ATTRIBUTION, LEVEL_LABEL, MIN_VALIDATION_CASES, NB_VALIDATION, NN_VALIDATION, PACKS, TH_VALIDATION, createPackRuntime, installPack, installablePacks,
  levelOf, packFor, readSelection, runCase, statusOf, validateManifest, verifyInstalled,
} from '../../packages/language-packs/src';
import type { ValidationCase } from '../../packages/language-packs/src';
import { statusFor } from '../../packages/repository-linguistics/src/resolver';
import { BASE, diskFetch, memoryStorage } from '../language-packs/helpers';
import { registerAllAnalysers } from '../support/analysers';

registerAllAnalysers(); // the parser carries Albanian; the other analysers are chunks the content script loads on demand

const CASES: Record<string, { adapter: LanguageAdapter; cases: ValidationCase[]; dictId: string; entries: number }> = {
  de: { adapter: deAdapter, cases: DE_VALIDATION, dictId: 'kaikki-de@2026-09-28', entries: 357750 },
  hi: { adapter: hiAdapter, cases: HI_VALIDATION, dictId: 'kaikki-hi@2026-09-28', entries: 38635 },
  th: { adapter: thAdapter, cases: TH_VALIDATION, dictId: 'kaikki-th@2026-09-28', entries: 20254 },
};

describe.each(Object.keys(CASES))('the experimental %s pack', (lang) => {
  const { adapter, cases, dictId, entries } = CASES[lang];
  const m = () => packFor(lang)!;

  it('validates, is installable at the experimental level, and is the one in the registry', () => {
    expect(validateManifest(m())).toEqual([]);
    expect(m().status).toBe('installable');
    expect(m().level).toBe('experimental');
    expect(levelOf(m())).toBe('experimental');
    expect(LEVEL_LABEL[levelOf(m())]).toBe('experimental, seed-only lemmatisation, unreviewed');
    expect(installablePacks().map((p) => p.packId)).toContain(`pack:${lang}`);
  });

  it('names the real adapter, its version and script; the dictionary is the one on disk', async () => {
    expect(m().version).toBe(String(adapter.version));
    expect(m().analyzer.id).toBe(`adapter-${lang}@${adapter.version}`);
    expect(m().scriptId).toBe(adapter.script);
    const d = m().lexical.dictionary!;
    expect(d).toMatchObject({ id: dictId, entries, baseUrl: `dict/${lang}/`, frequency: true });
    const onDisk = JSON.parse(await (await diskFetch()(`${BASE}dict/${lang}/manifest.json`)).text());
    expect(d).toMatchObject({ id: onDisk.id, entries: onDisk.entries });
    expect(d.attribution).toBe(KAIKKI_ATTRIBUTION);
    expect(onDisk.attribution).toBe(KAIKKI_ATTRIBUTION);
  });

  it('does not claim production readiness: machine-drafted everywhere, no recordings, a remote voice only with consent and a key, and the thin parts are stated', () => {
    expect(m().rights.reviewStatus).toBe('machine-drafted');
    expect(m().lexical.handLexicon.reviewStatus).toBe('machine-drafted');
    const text = m().rights.provenance.join('\n');
    expect(text).toMatch(/^Experimental, installable at a deliberately minimal level and not production-ready/);
    expect(text).toMatch(/Thin:/);
    expect(text).toMatch(/seed-only/);
    expect(text).toMatch(/Nothing in this pack has been reviewed by a native speaker/);
    expect(m().pronunciation.recordings).toBe('none');
    expect(m().pronunciation.remoteVoice.requiresConsentAndKey).toBe(true);
    expect(m().rights.licences.some((l) => /CC BY-SA 4\.0/.test(l.licence) && l.notice === KAIKKI_ATTRIBUTION)).toBe(true);
    const notes = createPackRuntime(m(), { fetch: diskFetch(), baseUrl: BASE }).coverageNotes().join('\n');
    expect(notes).toMatch(/lemmatization seed-only/);
    expect(notes).toMatch(/no native speaker has checked/);
    expect(notes).toMatch(/no recordings/);
    expect(notes).not.toMatch(/planned and cannot be installed/);
  });

  it('has the validation cases it declares, at least the minimum, with unique ids and sentences that contain their word', () => {
    expect(cases.length).toBeGreaterThanOrEqual(MIN_VALIDATION_CASES);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    expect(m().validation).toEqual(cases);
    for (const c of cases) expect(c.sentence?.includes(c.surface), c.id).toBe(true);
  });

  it('every case passes on the real adapter, and says what the adapter really returns when it does not', () => {
    for (const c of cases) expect(runCase(adapter, c), c.id).toEqual({ id: c.id, pass: true });
    const wrong = runCase(adapter, { ...cases[0], expect: { lemma: 'zzz-not-a-lemma' } });
    expect(wrong.pass).toBe(false);
    expect(wrong.got).toMatch(/differs: lemma/);
  });

  it('the pack’s status rule and the Repository resolver’s agree on every case', () => {
    const toRepo = (c: ReturnType<typeof readSelection>['candidates'][number]) => ({
      confidence: c.confidence, features: c.morph ?? {}, lexemeId: c.lemma ? `lemma:${lang}:${c.lemma}:${c.pos ?? ''}` : undefined,
      provenance: { source: (c.unconfirmed || c.origin === 'rule' ? 'rule' : 'hand-lexicon') as 'rule' | 'hand-lexicon', ref: 'x', confidence: c.confidence },
    });
    for (const c of cases) {
      const r = readSelection(adapter, c.surface, c.sentence);
      if (!r.top) continue;
      const all = r.candidates.map(toRepo);
      expect(statusFor(all[0], all, { unconfirmed: !!r.top.unconfirmed }), c.id).toBe(statusOf(r.top, r.candidates));
    }
  });

  it('every construction id the pack explains is one the adapter really detects', () => {
    const SENTENCES: Record<string, string[]> = {
      de: ['Er steht früh auf.', 'Ich rufe dich morgen an.'],
      hi: ['यह लड़का घर में है।', 'मेज़ पर एक किताब है।'],
      th: ['ฉันมีหนังสือสามเล่ม', 'เขามีเพื่อนสองคน'],
    };
    const keys = new Set<string>();
    for (const s of SENTENCES[lang]) {
      const toks = adapter.tokenize(s);
      for (const p of adapter.detectPatterns(toks, adapter.analyze(toks))) keys.add(p.key);
    }
    for (const c of m().grammar.constructions) expect(keys.has(c.id), c.id).toBe(true);
  });

  it('the runtime bundles the analyser (no deps.adapter needed) and the registry order is unchanged', () => {
    const a = createPackRuntime(m(), { fetch: diskFetch(), baseUrl: BASE }).analyzer();
    expect(a.kind).toBe('adapter');
    expect(a.id).toBe(m().analyzer.id);
    expect(a.adapter).toBe(adapter);
  });

  it('installs from the real dictionary files on disk: description, one real shard, every case; the record is read back', async () => {
    const storage = memoryStorage();
    const progress: string[] = [];
    const r = await installPack(m(), { fetch: diskFetch(), baseUrl: BASE, storage, now: () => '2026-10-09T08:00:00.000Z', onProgress: (p) => progress.push(p.step) });
    if (!r.ok) throw new Error(`${r.reason}: ${r.detail}`);
    expect(r).toMatchObject({ ok: true, installedAt: '2026-10-09T08:00:00.000Z', validationFailures: 0 });
    expect(r.verified.dictionaryManifest && r.verified.sampleShard).toBe(true);
    expect(r.verified.validation).toHaveLength(cases.length);
    expect(progress).toEqual(['check', 'dictionary-manifest', 'sample-shard', 'validation', 'record']);
    expect(await verifyInstalled(m(), storage)).toMatchObject({ installed: true, current: true, validationFailures: 0 });
    expect([...storage.map.keys()]).toEqual([`pack:installed:pack:${lang}`]);
  });

  it('refuses to install when the dictionary on the device is another language’s or unreachable (the checks are real)', async () => {
    const wrong = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return url.endsWith('/manifest.json') ? new Response(JSON.stringify({ id: 'kaikki-sq@2026-09-28', lang: 'sq', entries: 91271 }), { status: 200 }) : new Response('x', { status: 404 });
    }) as typeof fetch;
    expect(await installPack(m(), { fetch: wrong, baseUrl: BASE, storage: memoryStorage() })).toMatchObject({ ok: false, reason: 'dictionary-mismatch' });
    const down = (async () => new Response('no', { status: 404 })) as typeof fetch;
    expect(await installPack(m(), { fetch: down, baseUrl: BASE, storage: memoryStorage() })).toMatchObject({ ok: false, reason: 'dictionary-unreachable' });
  });
});

const NORWEGIAN: Record<string, { adapter: LanguageAdapter; cases: ValidationCase[]; sentence: string }> = {
  nb: { adapter: nbAdapter, cases: NB_VALIDATION, sentence: 'Jeg leser boken hver dag.' },
  nn: { adapter: nnAdapter, cases: NN_VALIDATION, sentence: 'Eg les boka kvar dag.' },
};

describe.each(Object.keys(NORWEGIAN))('the experimental %s pack (no dictionary)', (lang) => {
  const { adapter, cases } = NORWEGIAN[lang];
  const m = () => packFor(lang)!;
  const standard = lang === 'nb' ? 'Bokmål' : 'Nynorsk';

  it('validates, is installable at the experimental level, is in the registry, and states its written standard on every variety', () => {
    expect(validateManifest(m())).toEqual([]);
    expect(m().status).toBe('installable');
    expect(m().level).toBe('experimental');
    expect(LEVEL_LABEL[levelOf(m())]).toBe('experimental, seed-only lemmatisation, unreviewed');
    expect(installablePacks().map((p) => p.packId)).toContain(`pack:${lang}`);
    expect(m().varieties.every((v) => v.writtenStandard === lang)).toBe(true);
    expect(m().varieties[0].label).toContain(standard);
  });

  it('names the real adapter, its version and script, and declares no dictionary (none is built for Norwegian)', () => {
    expect(m().version).toBe(String(adapter.version));
    expect(m().analyzer.id).toBe(`adapter-${lang}@${adapter.version}`);
    expect(m().scriptId).toBe(adapter.script);
    expect(m().lexical.dictionary).toBeUndefined();
    expect(m().rights.licences.some((l) => /CC BY-SA/.test(l.licence))).toBe(false);
    expect(m().rights.provenance.join('\n')).toMatch(/no dictionary for this language in the repository/);
  });

  it('does not claim production readiness: machine-drafted everywhere, no recordings, the thin parts stated, a written standard that never credits the other', () => {
    expect(m().rights.reviewStatus).toBe('machine-drafted');
    expect(m().lexical.handLexicon.reviewStatus).toBe('machine-drafted');
    const text = m().rights.provenance.join('\n');
    expect(text).toMatch(/^Experimental, installable at a deliberately minimal level and not production-ready/);
    expect(text).toMatch(/Thin:/);
    expect(text).toMatch(/seed-only/);
    expect(text).toMatch(/Nothing in this pack has been reviewed by a native speaker/);
    expect(text).toMatch(/Norwegian has two written standards/);
    expect(text).toMatch(lang === 'nb' ? /never credits Nynorsk words to it/ : /Nynorsk \(writtenStandard "nn"\)/);
    expect(m().pronunciation.recordings).toBe('none');
    expect(m().pronunciation.remoteVoice.requiresConsentAndKey).toBe(true);
    const notes = createPackRuntime(m(), { fetch: diskFetch(), baseUrl: BASE }).coverageNotes().join('\n');
    expect(notes).toMatch(/lemmatization seed-only/);
    expect(notes).toMatch(/no native speaker has checked/);
    expect(notes).toMatch(/No dictionary is declared for this pack/);
    expect(notes).not.toMatch(/planned and cannot be installed/);
  });

  it('has 14 validation cases, with unique ids and sentences that contain their word; they are the ones the manifest declares', () => {
    expect(cases).toHaveLength(14);
    expect(cases.length).toBeGreaterThanOrEqual(MIN_VALIDATION_CASES);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    expect(m().validation).toEqual(cases);
    for (const c of cases) expect(c.sentence?.includes(c.surface), c.id).toBe(true);
  });

  it('every case passes on the real adapter, and says what the adapter really returns when it does not', () => {
    for (const c of cases) expect(runCase(adapter, c), c.id).toEqual({ id: c.id, pass: true });
    const wrong = runCase(adapter, { ...cases[0], expect: { lemma: 'zzz-not-a-lemma' } });
    expect(wrong.pass).toBe(false);
    expect(wrong.got).toMatch(/differs: lemma/);
  });

  it('the pack’s status rule and the Repository resolver’s agree on every case', () => {
    const toRepo = (c: ReturnType<typeof readSelection>['candidates'][number]) => ({
      confidence: c.confidence, features: c.morph ?? {}, lexemeId: c.lemma ? `lemma:${lang}:${c.lemma}:${c.pos ?? ''}` : undefined,
      provenance: { source: (c.unconfirmed || c.origin === 'rule' ? 'rule' : 'hand-lexicon') as 'rule' | 'hand-lexicon', ref: 'x', confidence: c.confidence },
    });
    for (const c of cases) {
      const r = readSelection(adapter, c.surface, c.sentence);
      if (!r.top) continue;
      const all = r.candidates.map(toRepo);
      expect(statusFor(all[0], all, { unconfirmed: !!r.top.unconfirmed }), c.id).toBe(statusOf(r.top, r.candidates));
    }
  });

  it('every construction id the pack explains is one the adapter really detects', () => {
    const SENTENCES: Record<string, string[]> = {
      nb: ['Han har ikke kjøpt bilen ennå.', 'Vi skal reise til Bergen i morgen.', 'Hun står opp klokka sju.'],
      nn: ['Han har ikkje kjøpt bilen enno.', 'Vi skal reise til Bergen i morgon.', 'Ho står opp klokka sju.'],
    };
    const keys = new Set<string>();
    for (const s of SENTENCES[lang]) {
      const toks = adapter.tokenize(s);
      for (const p of adapter.detectPatterns(toks, adapter.analyze(toks))) keys.add(p.key);
    }
    expect(m().grammar.constructions.map((c) => c.id)).toEqual(['perfect-har', 'modal-bare-infinitive', 'particle-verb']);
    for (const c of m().grammar.constructions) expect(keys.has(c.id), c.id).toBe(true);
  });

  it('the runtime bundles the analyser (no deps.adapter needed)', () => {
    const a = createPackRuntime(m(), { fetch: diskFetch(), baseUrl: BASE }).analyzer();
    expect(a.kind).toBe('adapter');
    expect(a.id).toBe(m().analyzer.id);
    expect(a.adapter).toBe(adapter);
  });

  it('installs without fetching anything: the dictionary checks are recorded as not declared, every case runs, the record is read back', async () => {
    const storage = memoryStorage();
    const f = diskFetch();
    const r = await installPack(m(), { fetch: f, baseUrl: BASE, storage, now: () => '2026-10-09T08:00:00.000Z' });
    if (!r.ok) throw new Error(`${r.reason}: ${r.detail}`);
    expect(f.calls).toEqual([]);
    expect(r).toMatchObject({ ok: true, validationFailures: 0 });
    expect(r.verified).toMatchObject({ dictionaryManifest: false, sampleShard: false, dictionary: 'none-declared' });
    expect(r.verified.validation).toHaveLength(14);
    expect(await verifyInstalled(m(), storage)).toMatchObject({ installed: true, current: true, validationFailures: 0 });
  });

  it('a gloss is honestly absent: the runtime has no dictionary to ask', async () => {
    const rt = createPackRuntime(m(), { fetch: diskFetch(), baseUrl: BASE });
    expect(await rt.gloss(NORWEGIAN[lang].cases[0].expect.lemma!)).toBeUndefined();
  });
});

describe('German, Hindi, Thai and Norwegian in the extension parser', () => {
  it('the parser registry lists them, with pack ids that carry the adapter version, and exposes their adapters to the resolver', () => {
    expect([...PARSER_LANGUAGES]).toEqual(['sq', 'es', 'de', 'hi', 'th', 'nb', 'nn']);
    expect(PACK_IDS).toMatchObject({ de: `pack:de:${deAdapter.version}`, hi: `pack:hi:${hiAdapter.version}`, th: `pack:th:${thAdapter.version}`, nb: `pack:nb:${nbAdapter.version}`, nn: `pack:nn:${nnAdapter.version}` });
    expect(parserAdapter('de')).toBe(deAdapter);
    expect(parserAdapter('hi')).toBe(hiAdapter);
    expect(parserAdapter('th')).toBe(thAdapter);
    expect(parserAdapter('nb')).toBe(nbAdapter);
    expect(parserAdapter('nn')).toBe(nnAdapter);
    expect(parserAdapter('sv')).toBeUndefined();
    expect(parserAdapter('constructor')).toBeUndefined();
  });

  it('a Bokmål card and a Nynorsk card carry their own language, pack id, analyser id and experimental limit, and never the other standard’s ids', () => {
    const nb = parseSelection({ surface: 'boken', languageId: 'nb', context: { kind: 'sentence', confidence: 0.9, sentence: 'Jeg leser boken hver dag.', selStart: 10, selEnd: 15 } });
    const nn = parseSelection({ surface: 'boka', languageId: 'nn', context: { kind: 'sentence', confidence: 0.9, sentence: 'Eg les boka kvar dag.', selStart: 7, selEnd: 11 } });
    for (const [c, lang] of [[nb, 'nb'], [nn, 'nn']] as const) {
      expect(c, lang).toMatchObject({ languageId: lang, packId: PACK_IDS[lang], analyzerId: `adapter-${lang}@2`, lemma: 'bok', pos: 'NOUN', gloss: 'book' });
      expect(c.limits.join(' '), lang).toMatch(/pack is experimental: lemmatisation is seed-only/);
      expect(c.itemIds, lang).toContain(`lemma:${lang}:bok:NOUN`);
      expect(JSON.stringify(c), lang).not.toMatch(lang === 'nb' ? /:nn:|pack:nn/ : /:nb:|pack:nb/);
    }
    expect(nb.limits.join(' ')).toMatch(/Nynorsk words are never credited to it/);
    expect(nn.limits.join(' ')).toMatch(/Bokmål words are never credited to it/);
  });

  it('a page that says only "no" is not noted as another language for either Norwegian pack; a page in English is', () => {
    const on = (lang: string, pageLanguage: string) => parseSelection({ surface: 'bok', languageId: lang, context: { kind: 'none', confidence: 0, pageLanguage } }).notes.join(' ');
    expect(on('nb', 'no')).not.toMatch(/page declares/);
    expect(on('nb', 'nb-NO')).not.toMatch(/page declares/);
    expect(on('nn', 'no-NO')).not.toMatch(/page declares/);
    expect(on('nn', 'nn')).not.toMatch(/page declares/);
    expect(on('nn', 'nb')).toMatch(/The page declares its language as "nb"; the Norwegian \(Nynorsk\) word list is applied because Norwegian \(Nynorsk\) is the language you are studying/);
    expect(on('nb', 'en')).toMatch(/page declares its language as "en"/);
  });

  it('a card in each of the three carries its language, pack id, analyser id and the experimental limit, and no other language’s ids', () => {
    const de = parseSelection({ surface: 'Haus', languageId: 'de', context: { kind: 'sentence', confidence: 0.9, sentence: 'Ich habe ein Haus.', selStart: 13, selEnd: 17 } });
    const hi = parseSelection({ surface: 'घर', languageId: 'hi', context: { kind: 'sentence', confidence: 0.9, sentence: 'यह लड़का घर में है।', selStart: 9, selEnd: 11 } });
    const th = parseSelection({ surface: 'บ้าน', languageId: 'th', context: { kind: 'sentence', confidence: 0.9, sentence: 'ฉันกินข้าวที่บ้านทุกวัน', selStart: 11, selEnd: 15 } });
    for (const [c, lang, lemma] of [[de, 'de', 'Haus'], [hi, 'hi', 'घर'], [th, 'th', 'บ้าน']] as const) {
      expect(c, lang).toMatchObject({ languageId: lang, packId: PACK_IDS[lang], analyzerId: `adapter-${lang}@${CASES[lang].adapter.version}`, lemma, pos: 'NOUN' });
      expect(c.limits.join(' '), lang).toMatch(/pack is experimental: lemmatisation is seed-only/);
      expect(c.itemIds, lang).toContain(`lemma:${lang}:${lemma}:NOUN`);
      expect(JSON.stringify(c), lang).not.toMatch(/pack:sq|:sq:|Albanian/);
    }
  });

  it('Albanian and Spanish cards carry no experimental limit', () => {
    const sq = parseSelection({ surface: 'librin', context: { kind: 'sentence', confidence: 0.9, sentence: 'Fëmijët lexojnë librin.', selStart: 15, selEnd: 21 } });
    expect(sq.limits.join(' ')).not.toMatch(/experimental/);
    const es = parseSelection({ surface: 'libros', languageId: 'es', context: { kind: 'none', confidence: 0 } });
    expect(es.limits.join(' ')).not.toMatch(/experimental/);
  });

  it('a selection in the wrong script says so, naming the script of the language being read', () => {
    expect(parseSelection({ surface: 'kitab', languageId: 'hi', context: { kind: 'none', confidence: 0 } }).notes.join(' ')).toMatch(/not in Devanagari script/);
    expect(parseSelection({ surface: 'coffee', languageId: 'th', context: { kind: 'none', confidence: 0 } }).notes.join(' ')).toMatch(/not in Thai script/);
    expect(parseSelection({ surface: 'книга', languageId: 'de', context: { kind: 'none', confidence: 0 } }).notes.join(' ')).toMatch(/not in Latin script: the German word list/);
    expect(parseSelection({ surface: 'книга', context: { kind: 'none', confidence: 0 } }).notes.join(' ')).toMatch(/not in Latin script: the Albanian word list/);
  });

  it('a page that declares the language the learner studies is not noted; one that declares another is', () => {
    const on = (lang: string, surface: string, pageLanguage: string) => parseSelection({ surface, languageId: lang, context: { kind: 'none', confidence: 0, pageLanguage } }).notes.join(' ');
    expect(on('de', 'Haus', 'de-AT')).not.toMatch(/page declares/);
    expect(on('hi', 'घर', 'hi-IN')).not.toMatch(/page declares/);
    expect(on('th', 'บ้าน', 'th')).not.toMatch(/page declares/);
    expect(on('de', 'Haus', 'en')).toMatch(/The page declares its language as "en"; the German word list is applied because German is the language you are studying/);
  });
});

describe('a language outside the seven', () => {
  it('is still not read: the parser refuses it rather than reading it with another adapter', () => {
    expect(PACKS.sv).toBeUndefined();
    expect(() => parseSelection({ surface: 'hus', languageId: 'sv', context: { kind: 'none', confidence: 0 } })).toThrow(RangeError);
  });
});
