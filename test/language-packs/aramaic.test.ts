import { describe, expect, it } from 'vitest';
import { validateManifest } from '../../packages/language-packs/src/manifest';
import { aramaicManifest, ARC_VALIDATION } from '../../packages/language-packs/src/packs/arc';
import { ARC_TUTORIAL } from '../../packages/language-packs/src/tutorial/arc';

describe('the Biblical Aramaic pack', () => {
  const manifest = aramaicManifest();

  it('is its own experimental language and variety, written RTL in Hebrew script', () => {
    expect(manifest).toMatchObject({
      packId: 'pack:arc',
      languageId: 'arc',
      varietyId: 'arc-bib',
      scriptId: 'Hebr',
      level: 'experimental',
      status: 'installable',
      identity: { name: 'Aramaic', direction: 'rtl' },
    });
    expect(manifest.varieties).toEqual([
      expect.objectContaining({ varietyId: 'arc-bib', analysed: true }),
    ]);
    expect(validateManifest(manifest)).toEqual([]);
  });

  it('keeps its checked examples inside attested Aramaic source passages', () => {
    expect(ARC_VALIDATION.length).toBeGreaterThanOrEqual(12);
    expect(ARC_VALIDATION.every((c) => c.sentence?.includes(c.surface))).toBe(true);
    expect(ARC_VALIDATION.find((c) => c.id === 'v-mal-ka')?.expect).toMatchObject({
      lemma: 'מֶלֶךְ',
      pos: 'NOUN',
      features: { Gender: 'Masc', Number: 'Sing', State: 'Det', Definite: 'Def' },
    });
    expect(ARC_VALIDATION.find((c) => c.id === 'v-hayi')?.expect).toMatchObject({
      lemma: 'חֲיָא',
      pos: 'VERB',
      features: { Binyan: 'Peal', Conj: 'Imp', Person: '2', Gender: 'Masc', Number: 'Sing' },
    });
    expect(ARC_VALIDATION.find((c) => c.id === 'v-nechavve')?.expect).toMatchObject({
      lemma: 'חֲוָא',
      pos: 'VERB',
      features: { Binyan: 'Pael', Conj: 'Impf', Person: '1', Gender: 'Com', Number: 'Plur' },
    });
  });

  it('states source licences and the required OSHB attribution', () => {
    const rights = manifest.rights;
    expect(rights.licences).toContainEqual(expect.objectContaining({
      resource: 'Open Scriptures Hebrew Bible Aramaic morphology',
      licence: 'CC BY 4.0',
      notice: 'Original work of the Open Scriptures Hebrew Bible available at https://github.com/openscriptures/morphhb',
    }));
    expect(rights.licences).toContainEqual(expect.objectContaining({
      resource: 'Westminster Leningrad Codex Aramaic source text',
      licence: 'Public domain',
    }));
  });

  it('ships a skippable, clearly unreviewed orientation with a real Bible practice passage', () => {
    expect(ARC_TUTORIAL).toMatchObject({
      languageId: 'arc',
      authorship: 'machine-drafted',
      reviewed: false,
      reviewNeeded: 'native speaker',
      skippable: true,
    });
    expect(ARC_TUTORIAL.notice).toMatch(/not been checked by a native speaker or a Biblical Aramaic specialist/);
    const practice = ARC_TUTORIAL.steps.find((step) => step.practice)?.practice;
    expect(practice?.sentence).toContain(practice?.target ?? '');
    expect(ARC_VALIDATION.some((c) => c.sentence === practice?.sentence && c.surface === practice?.target)).toBe(true);
    expect(ARC_TUTORIAL.steps.find((step) => step.id === 'script-aram')?.body).toMatch(/right to left/);
    expect(ARC_TUTORIAL.steps.find((step) => step.id === 'forms-and-states')?.body).toMatch(/construct/);
  });
});
