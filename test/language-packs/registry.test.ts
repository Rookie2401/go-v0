import { describe, expect, it } from 'vitest';
import { deAdapter } from '../../src/adapters/de';
import { esAdapter } from '../../src/adapters/es';
import { hiAdapter } from '../../src/adapters/hi';
import { nbAdapter } from '../../src/adapters/nb';
import { nnAdapter } from '../../src/adapters/nn';
import { thAdapter } from '../../src/adapters/th';
import { LEVEL_LABEL, PACKS, TEAMS, installablePacks, languagesOf, levelOf, packFor, plannedManifest, teamList, validateManifest } from '../../packages/language-packs/src';
import type { TeamId } from '../../packages/language-packs/src';

describe('PACKS and packFor', () => {
  it('lists seven packs; Albanian and Spanish are installable, German, Hindi, Thai and both Norwegian packs experimental (installable)', () => {
    expect(Object.keys(PACKS).sort()).toEqual(['de', 'es', 'hi', 'nb', 'nn', 'sq', 'th']);
    expect(installablePacks().map((p) => p.packId)).toEqual(['pack:sq', 'pack:es', 'pack:de', 'pack:hi', 'pack:th', 'pack:nb', 'pack:nn']);
    const level = { sq: 'installable', es: 'installable', de: 'experimental', hi: 'experimental', th: 'experimental', nb: 'experimental', nn: 'experimental' } as const;
    for (const [lang, m] of Object.entries(PACKS)) {
      expect(m.languageId).toBe(lang);
      expect(m.packId).toBe(`pack:${lang}`);
      expect(levelOf(m), lang).toBe(level[lang as keyof typeof level]);
      expect(m.status, lang).toBe('installable');
    }
  });

  it('an experimental pack says so: its level, its label and its review status; it never reads as plainly installable', () => {
    for (const lang of ['de', 'hi', 'th', 'nb', 'nn']) {
      const m = PACKS[lang];
      expect(m.level, lang).toBe('experimental');
      expect(LEVEL_LABEL[levelOf(m)]).toBe('experimental, seed-only lemmatisation, unreviewed');
      expect(m.rights.reviewStatus, lang).toBe('machine-drafted');
      expect(m.rights.provenance[0], lang).toMatch(/^Experimental, installable at a deliberately minimal level and not production-ready/);
      expect(m.rights.provenance.join(' '), lang).toMatch(/Thin:/);
      expect(m.rights.provenance.join(' '), lang).toMatch(/Nothing in this pack has been reviewed by a native speaker/);
      expect(m.rights.provenance.join(' '), lang).toContain(`The orientation (tutorial/${lang}) is minimal and AI-drafted for this pack and is not reviewed`);
      expect(m.rights.provenance.join(' '), lang).not.toMatch(/does not exist/);
      expect(m.tutorial.ref, lang).toBe(`tutorial/${lang}`);
    }
    expect(PACKS.sq.level).toBeUndefined();
    expect(levelOf(PACKS.sq)).toBe('installable');
  });

  it('refuses an inconsistent level: planned with an installable status, experimental on a planned pack or a reviewed one, an unknown level', () => {
    const bad = (m: unknown): string[] => validateManifest(m).map((i) => i.path);
    expect(bad({ ...structuredClone(PACKS.de), level: 'planned' })).toContain('level');
    expect(bad({ ...structuredClone(PACKS.nb), status: 'planned', level: 'experimental' })).toContain('level');
    expect(bad({ ...structuredClone(PACKS.de), level: 'production' })).toContain('level');
    const reviewed = structuredClone(PACKS.de);
    reviewed.rights.reviewStatus = 'reviewed';
    expect(bad(reviewed)).toContain('level');
  });

  it('packFor finds a pack and does not pretend to know others (or inherited keys)', () => {
    expect(packFor('sq')?.packId).toBe('pack:sq');
    expect(packFor('xx')).toBeUndefined();
    expect(packFor('constructor')).toBeUndefined();
    expect(packFor('toString')).toBeUndefined();
  });
});

describe('experimental packs without a dictionary (Norwegian)', () => {
  it('an experimental pack may declare no dictionary; any other installable pack must, and a planned one may not be installable', () => {
    const bad = (m: unknown): string[] => validateManifest(m).map((i) => i.path);
    for (const lang of ['nb', 'nn']) {
      expect(PACKS[lang].lexical.dictionary, lang).toBeUndefined();
      expect(bad(PACKS[lang]), lang).toEqual([]);
    }
    const noDict = structuredClone(PACKS.sq);
    delete noDict.lexical.dictionary;
    expect(bad(noDict)).toContain('lexical.dictionary');
    const sneaky = structuredClone(PACKS.nb);
    delete sneaky.level;
    expect(bad(sneaky), 'an installable pack with no level is not experimental and needs its dictionary').toContain('lexical.dictionary');
  });

  it('plannedManifest still describes a language that has an analyser and nothing else: never installable, no validation, no review', () => {
    const m = plannedManifest({
      languageId: 'nb', version: '2', varietyId: 'nb', scriptId: 'Latn', name: 'Norwegian (Bokmål)', nativeName: 'norsk bokmål',
      varieties: [{ varietyId: 'nb', label: 'Bokmål', writtenStandard: 'nb', analysed: true }],
      adapterSummary: 'seed-only', capabilities: ['tokenization'], features: [], constructions: [], voices: [], segmentation: { method: 'adapter', notes: 'x' },
    });
    expect(m.status).toBe('planned');
    expect(levelOf(m)).toBe('planned');
    expect(m.validation).toEqual([]);
    expect(m.rights.provenance[0]).toMatch(/Planned, not installable/);
    expect(m.rights.reviewStatus).toBe('machine-drafted');
    expect(validateManifest(m)).toEqual([]);
  });
});

describe('adapter versions', () => {
  const adapters = { es: esAdapter, de: deAdapter, hi: hiAdapter, th: thAdapter, nb: nbAdapter, nn: nnAdapter } as const;

  it('name the real adapter and its current version (the version constant must not drift from the adapter)', () => {
    for (const [lang, a] of Object.entries(adapters)) {
      const m = PACKS[lang];
      expect(m.version, lang).toBe(String(a.version));
      expect(m.analyzer.id, lang).toBe(`adapter-${lang}@${a.version}`);
      expect(m.scriptId, lang).toBe(a.script);
      expect(validateManifest(m), lang).toEqual([]);
    }
  });

  it('declare only capabilities the adapter supports', () => {
    for (const [lang, a] of Object.entries(adapters)) {
      const caps = PACKS[lang].analyzer.capabilities;
      if (a.support.lemmatization === 'none') expect(caps).not.toContain('lemma');
      if (a.support.morphology === 'none') expect(caps).not.toContain('morphology');
      if (a.support.phraseDetection === 'none') expect(caps).not.toContain('phrases');
    }
  });

  it('the Norwegian packs say honestly what exists: 14 validation cases, a minimal orientation, no review, no recordings, no dictionary', () => {
    for (const lang of ['nb', 'nn']) {
      const m = PACKS[lang];
      expect(m.validation, lang).toHaveLength(14);
      expect(m.rights.reviewStatus, lang).toBe('machine-drafted');
      expect(m.rights.provenance[0], lang).toMatch(/^Experimental, installable at a deliberately minimal level and not production-ready/);
      expect(m.rights.provenance.join(' '), lang).toMatch(/no dictionary for this language in the repository: meanings come from the pack’s own word list only/);
      expect(m.rights.provenance.join(' '), lang).toMatch(/Nothing in this pack has been reviewed by a native speaker/);
      expect(m.pronunciation.recordings, lang).toBe('none');
      expect(m.pronunciation.remoteVoice.requiresConsentAndKey, lang).toBe(true);
    }
  });

  it('declare a built dictionary only where one exists', () => {
    for (const lang of ['es', 'de', 'hi', 'th']) {
      const d = PACKS[lang].lexical.dictionary!;
      expect(d.attribution).toBe('Wiktionary, via kaikki.org — CC BY-SA 4.0');
      expect(d.baseUrl).toBe(`dict/${lang}/`);
    }
    expect(PACKS.nb.lexical.dictionary).toBeUndefined();
    expect(PACKS.nn.lexical.dictionary).toBeUndefined();
    expect(PACKS.nb.rights.provenance.join(' ')).toMatch(/no dictionary/i);
    expect(PACKS.nn.rights.provenance.join(' ')).toMatch(/no dictionary/i);
  });

  it('Norwegian: two packs, each stating its written standard on every variety', () => {
    expect(PACKS.nb.varieties.every((v) => v.writtenStandard === 'nb')).toBe(true);
    expect(PACKS.nn.varieties.every((v) => v.writtenStandard === 'nn')).toBe(true);
    expect(PACKS.nb.rights.provenance.join(' ')).toMatch(/never credits Nynorsk/);
  });
});

describe('TEAMS', () => {
  it('has the six teams, each with at least one language', () => {
    const ids = Object.keys(TEAMS).sort();
    expect(ids).toEqual(['albania', 'germany', 'honduras', 'india', 'norway', 'thailand']);
    expect(teamList()).toHaveLength(6);
    for (const t of teamList()) {
      expect(t.languages.length).toBeGreaterThan(0);
      for (const l of t.languages) expect(PACKS[l.languageId], `${t.teamId}/${l.languageId}`).toBeDefined();
    }
  });

  it('a team is not a language: no language or pack field names a team, and a language may be offered by no team id', () => {
    for (const m of Object.values(PACKS)) expect(JSON.stringify(m)).not.toMatch(/"teamId"/);
    for (const t of teamList()) expect(Object.keys(t).sort()).toEqual(['languages', 'name', 'teamId']);
    expect(languagesOf('albania').map((l) => l.languageId)).toEqual(['sq']);
    expect(languagesOf('honduras').map((l) => l.languageId)).toEqual(['es']);
  });

  it('Norway requires an explicit written-standard choice and has no default', () => {
    const langs = languagesOf('norway' as TeamId);
    expect(langs.map((l) => l.languageId).sort()).toEqual(['nb', 'nn']);
    for (const l of langs) {
      expect(l.requiredChoice).toEqual({ key: 'writtenStandard', options: ['nb', 'nn'] });
      expect(l.default).toBeUndefined();
    }
  });

  it('only Norway asks for a choice; the others have a default language', () => {
    for (const t of teamList().filter((x) => x.teamId !== 'norway')) {
      expect(t.languages.every((l) => !l.requiredChoice)).toBe(true);
      expect(t.languages.some((l) => l.default)).toBe(true);
    }
  });
});
