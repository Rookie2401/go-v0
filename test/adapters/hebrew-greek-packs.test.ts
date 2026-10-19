// @vitest-environment node
/**
 * The Hebrew and Greek language packs: valid manifests, every validation case read by the real analyser exactly as the manifest states
 * (compiled cores only, as the installer runs them), the tutorials' practice sentences parsed, and the period pickers of the catalogue.
 */
import { describe, expect, it } from 'vitest';
import { runCase } from '../../packages/language-packs/src/analysis';
import { validateManifest } from '../../packages/language-packs/src/manifest';
import { HE_VALIDATION, hebrewManifest } from '../../packages/language-packs/src/packs/he';
import { EL_VALIDATION, greekManifest } from '../../packages/language-packs/src/packs/el';
import { HE_TUTORIAL } from '../../packages/language-packs/src/tutorial/he';
import { EL_TUTORIAL } from '../../packages/language-packs/src/tutorial/el';
import { heAdapter } from '../../src/adapters/he';
import { elAdapter } from '../../src/adapters/el';

describe('pack:he', () => {
  const m = hebrewManifest();
  it('is a valid experimental manifest for ONE language with period varieties, rtl', () => {
    expect(validateManifest(m)).toEqual([]);
    expect(m).toMatchObject({ packId: 'pack:he', languageId: 'he', varietyId: 'he-mod', scriptId: 'Hebr', status: 'installable', level: 'experimental' });
    expect(m.identity.direction).toBe('rtl');
    expect(m.analyzer).toMatchObject({ id: `adapter-he@${heAdapter.version}`, version: heAdapter.version });
    expect(m.varieties.filter((v) => v.analysed).map((v) => v.varietyId)).toEqual(['he-mod', 'he-bib', 'arc-bib']);
    expect(m.rights.provenance.join(' ')).toMatch(/Open Scriptures/);
  });
  it('every validation case reads as stated with the compiled core', () => {
    expect(HE_VALIDATION.length).toBeGreaterThanOrEqual(12);
    const results = HE_VALIDATION.map((c) => runCase(heAdapter, c));
    expect(results.filter((r) => !r.pass).map((r) => `${r.id}: ${r.got}`)).toEqual([]);
  });
  it('the tutorial practice sentence parses and its target has a reading', () => {
    const p = HE_TUTORIAL.steps.find((s) => s.kind === 'practice')!.practice!;
    const tokens = heAdapter.tokenize(p.sentence);
    const i = tokens.findIndex((t) => t.surface === p.target);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(heAdapter.analyze(tokens)[i].candidates[0]).toMatchObject({ lemma: 'אֱלֹהִים', varieties: ['he-bib'] });
    expect(HE_TUTORIAL.ref).toBe(m.tutorial!.ref);
  });
});

describe('pack:el', () => {
  const m = greekManifest();
  it('is a valid experimental manifest for ONE language with period varieties', () => {
    expect(validateManifest(m)).toEqual([]);
    expect(m).toMatchObject({ packId: 'pack:el', languageId: 'el', varietyId: 'el-mod', scriptId: 'Grek', status: 'installable', level: 'experimental' });
    expect(m.analyzer).toMatchObject({ id: `adapter-el@${elAdapter.version}` });
    expect(m.varieties.filter((v) => v.analysed).map((v) => v.varietyId)).toEqual(['el-mod', 'el-koi', 'el-att', 'el-hom']);
    expect(m.rights.provenance.join(' ')).toMatch(/MorphGNT/);
  });
  it('every validation case reads as stated with the compiled core', () => {
    expect(EL_VALIDATION.length).toBeGreaterThanOrEqual(12);
    const results = EL_VALIDATION.map((c) => runCase(elAdapter, c));
    expect(results.filter((r) => !r.pass).map((r) => `${r.id}: ${r.got}`)).toEqual([]);
  });
  it('the tutorial practice sentence parses and its target has a reading', () => {
    const p = EL_TUTORIAL.steps.find((s) => s.kind === 'practice')!.practice!;
    const tokens = elAdapter.tokenize(p.sentence);
    const i = tokens.findIndex((t) => t.surface === p.target);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(elAdapter.analyze(tokens)[i].candidates[0]).toMatchObject({ lemma: 'λόγος', varieties: ['el-koi'] });
  });
});
