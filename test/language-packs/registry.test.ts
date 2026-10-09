import { describe, expect, it } from 'vitest';
import { deAdapter } from '../../src/adapters/de';
import { esAdapter } from '../../src/adapters/es';
import { hiAdapter } from '../../src/adapters/hi';
import { nbAdapter } from '../../src/adapters/nb';
import { nnAdapter } from '../../src/adapters/nn';
import { thAdapter } from '../../src/adapters/th';
import { LEVEL_LABEL, PACKS, TEAMS, installablePacks, languagesOf, levelOf, packFor, teamList, validateManifest } from '../../packages/language-packs/src';
import type { TeamId } from '../../packages/language-packs/src';

describe('PACKS and packFor', () => {
  it('lists seven packs; Albanian and Spanish are installable, German, Hindi and Thai experimental (installable), Norwegian planned', () => {
    expect(Object.keys(PACKS).sort()).toEqual(['de', 'es', 'hi', 'nb', 'nn', 'sq', 'th']);
    expect(installablePacks().map((p) => p.packId)).toEqual(['pack:sq', 'pack:es', 'pack:de', 'pack:hi', 'pack:th']);
    const level = { sq: 'installable', es: 'installable', de: 'experimental', hi: 'experimental', th: 'experimental', nb: 'planned', nn: 'planned' } as const;
    for (const [lang, m] of Object.entries(PACKS)) {
      expect(m.languageId).toBe(lang);
      expect(m.packId).toBe(`pack:${lang}`);
      expect(levelOf(m), lang).toBe(level[lang as keyof typeof level]);
      expect(m.status, lang).toBe(level[lang as keyof typeof level] === 'planned' ? 'planned' : 'installable');
    }
  });

  it('an experimental pack says so: its level, its label and its review status; it never reads as plainly installable', () => {
    for (const lang of ['de', 'hi', 'th']) {
      const m = PACKS[lang];
      expect(m.level, lang).toBe('experimental');
      expect(LEVEL_LABEL[levelOf(m)]).toBe('experimental, seed-only lemmatisation, unreviewed');
      expect(m.rights.reviewStatus, lang).toBe('machine-drafted');
      expect(m.rights.provenance[0], lang).toMatch(/^Experimental, installable at a deliberately minimal level and not production-ready/);
      expect(m.rights.provenance.join(' '), lang).toMatch(/Thin:/);
      expect(m.rights.provenance.join(' '), lang).toMatch(/Nothing in this pack has been reviewed by a native speaker/);
      expect(m.rights.provenance.join(' '), lang).toContain(`The orientation tutorial (tutorial/${lang}) does not exist`);
    }
    expect(PACKS.sq.level).toBeUndefined();
    expect(levelOf(PACKS.sq)).toBe('installable');
  });

  it('refuses an inconsistent level: planned with an installable status, experimental on a planned pack or a reviewed one, an unknown level', () => {
    const bad = (m: unknown): string[] => validateManifest(m).map((i) => i.path);
    expect(bad({ ...structuredClone(PACKS.de), level: 'planned' })).toContain('level');
    expect(bad({ ...structuredClone(PACKS.nb), level: 'experimental' })).toContain('level');
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

describe('planned packs', () => {
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

  it('say honestly what exists: no validation, no tutorial, no review, no recordings (Spanish is installable and German, Hindi and Thai experimental; both are covered elsewhere)', () => {
    for (const lang of ['nb', 'nn']) {
      const m = PACKS[lang];
      expect(m.validation, lang).toEqual([]);
      expect(m.rights.reviewStatus, lang).toBe('machine-drafted');
      expect(m.rights.provenance[0], lang).toMatch(/Planned, not installable/);
      expect(m.rights.provenance.join(' '), lang).toMatch(/does not exist|Not yet written/);
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
