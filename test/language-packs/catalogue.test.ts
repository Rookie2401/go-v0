// @vitest-environment node
/**
 * The language catalogue (packages/language-packs/src/catalogue.ts): the seven languages of interest (Latin was added 2026-10-17), in the picker's order.
 * Everything that is not the fixed identity of an entry (which packs, which written standards, which varieties) is READ from the
 * manifests, the tutorial registry, GoListen's notes and the capability reports, and these tests compare it with them.
 */
import { describe, expect, it } from 'vitest';
import { audioOf } from '../../packages/golearn-extension/src/language/capabilities';
import {
  LANGUAGE_CATALOGUE, LEVEL_LABEL, PACKS, TUTORIALS, audioLine, buildCatalogue, catalogueEntry, levelOf, packCapabilities, validationOf,
} from '../../packages/language-packs/src';

describe('LANGUAGE_CATALOGUE: exactly nine languages, in order (Latin, Hebrew and Greek were added 2026-10-17)', () => {
  it('Norwegian, German, Albanian, Hindi, Thai, Spanish, Latin, Hebrew, Greek', () => {
    expect(LANGUAGE_CATALOGUE).toHaveLength(9);
    expect(LANGUAGE_CATALOGUE.map((e) => e.languageId)).toEqual(['nb', 'de', 'sq', 'hi', 'th', 'es', 'la', 'he', 'el']);
    expect(LANGUAGE_CATALOGUE.map((e) => e.name)).toEqual(['Norwegian', 'German', 'Albanian', 'Hindi', 'Thai', 'Spanish', 'Latin', 'Hebrew', 'Greek']);
    expect(LANGUAGE_CATALOGUE.map((e) => e.nativeName)).toEqual(['norsk', 'Deutsch', 'shqip', 'हिन्दी', 'ไทย', 'español', 'Latina', 'עברית', 'Ελληνικά']);
    expect(LANGUAGE_CATALOGUE.map((e) => e.scriptId)).toEqual(['Latn', 'Latn', 'Latn', 'Deva', 'Thai', 'Latn', 'Latn', 'Hebr', 'Grek']);
    expect(LANGUAGE_CATALOGUE.map((e) => e.scriptName)).toEqual(['Latin', 'Latin', 'Latin', 'Devanagari', 'Thai script', 'Latin', 'Latin', 'Hebrew script', 'Greek alphabet']);
    expect(LANGUAGE_CATALOGUE.map((e) => e.packIds)).toEqual([['pack:nb', 'pack:nn'], ['pack:de'], ['pack:sq'], ['pack:hi'], ['pack:th'], ['pack:es'], ['pack:la'], ['pack:he'], ['pack:el']]);
  });

  it('is frozen and has no team in it: a language is chosen freely, never by team', () => {
    expect(Object.isFrozen(LANGUAGE_CATALOGUE)).toBe(true);
    expect(JSON.stringify(LANGUAGE_CATALOGUE)).not.toMatch(/team|enrol/i);
    for (const e of LANGUAGE_CATALOGUE) expect(Object.keys(e).sort(), e.languageId).toEqual(expect.arrayContaining([
      'audio', 'languageId', 'level', 'levelLabel', 'name', 'nativeName', 'packIds', 'packs', 'scriptId', 'scriptName', 'tutorialAvailable', 'validation', 'whatDoesNot', 'whatWorks',
    ]));
  });

  it('Norwegian offers the two written standards, neither the default; Spanish offers the general variety and Honduras as a regional preference; the others offer neither', () => {
    const [nb, de, sq, hi, th, es, la] = LANGUAGE_CATALOGUE;
    expect(nb.writtenStandards).toEqual([{ id: 'nb', label: 'Bokmål' }, { id: 'nn', label: 'Nynorsk' }]);
    expect(nb.varieties).toBeUndefined();
    expect(JSON.stringify(nb)).not.toMatch(/default/i);
    expect(es.varieties).toEqual([{ id: 'es-standard', label: 'General' }, { id: 'es-HN', label: 'Honduras (regional preference)' }]);
    expect(es.writtenStandards).toBeUndefined();
    for (const e of [de, sq, hi, th, la]) {
      expect(e.writtenStandards, e.languageId).toBeUndefined();
      expect(e.varieties, e.languageId).toBeUndefined();
    }
    // Honduras is a variety the Spanish pack really lists, not a language of its own
    expect(PACKS.es.varieties.map((v) => v.varietyId)).toContain('es-HN');
    expect(LANGUAGE_CATALOGUE.some((e) => e.languageId === 'es-HN')).toBe(false);
  });
});

describe('every field agrees with the manifests (nothing is hard-coded)', () => {
  it.each(LANGUAGE_CATALOGUE.map((e) => [e.languageId, e] as const))('%s: identity, script, packs, level, validation and tutorial are read from the manifests and the tutorial registry', (_id, e) => {
    const manifests = e.packIds.map((id) => Object.values(PACKS).find((p) => p.packId === id)!);
    expect(manifests.every(Boolean)).toBe(true);
    expect(e.scriptId).toBe(manifests[0].scriptId);
    if (e.packIds.length === 1) {
      expect(e.name).toBe(manifests[0].identity.name);
      expect(e.nativeName).toBe(manifests[0].identity.nativeName);
    }
    expect(e.packs.map((p) => p.packId)).toEqual(e.packIds);
    e.packs.forEach((p, i) => {
      const m = manifests[i];
      expect(p).toEqual({
        packId: m.packId, languageId: m.languageId, name: m.identity.name, level: levelOf(m), levelLabel: LEVEL_LABEL[levelOf(m)],
        validation: validationOf(m), reviewStatus: m.rights.reviewStatus, tutorialAvailable: TUTORIALS[m.languageId]?.ref === m.tutorial.ref,
      });
    });
    expect(e.level).toBe(levelOf(manifests[0]));
    expect(e.levelLabel).toBe(LEVEL_LABEL[e.level]);
    expect(e.validation).toBe(validationOf(manifests[0]));
    expect(e.tutorialAvailable).toBe(true);
  });

  it('the levels are the real ones: Albanian and Spanish installable and unreviewed; German, Hindi, Thai, Latin and both Norwegian packs experimental; none production-validated', () => {
    const by = Object.fromEntries(LANGUAGE_CATALOGUE.map((e) => [e.languageId, e]));
    expect([by.sq.level, by.sq.validation]).toEqual(['installable', 'unreviewed']);
    expect([by.es.level, by.es.validation]).toEqual(['installable', 'unreviewed']);
    for (const l of ['nb', 'de', 'hi', 'th', 'la']) expect([by[l].level, by[l].validation, by[l].levelLabel], l).toEqual(['experimental', 'experimental', 'experimental, seed-only lemmatisation, unreviewed']);
    expect(by.nb.packs.map((p) => p.level)).toEqual(['experimental', 'experimental']);
    for (const e of LANGUAGE_CATALOGUE) expect(e.validation, e.languageId).not.toBe('production-validated');
  });

  it('catalogueEntry finds an entry by its language or by any of its packs (nn finds Norwegian), and nothing for a language outside the seven', () => {
    expect(catalogueEntry('nb')).toBe(LANGUAGE_CATALOGUE[0]);
    expect(catalogueEntry('nn')).toBe(LANGUAGE_CATALOGUE[0]);
    expect(catalogueEntry('es')).toBe(LANGUAGE_CATALOGUE[5]);
    expect(catalogueEntry('sv')).toBeUndefined();
    expect(catalogueEntry('constructor')).toBeUndefined();
  });
});

describe('audio, whatWorks and whatDoesNot', () => {
  it('without GoListen’s notes every language says "no validated audio"', () => {
    for (const e of LANGUAGE_CATALOGUE) expect(e.audio, e.languageId).toBe('no validated audio');
    expect(audioLine(undefined)).toBe('no validated audio');
  });

  it('with GoListen’s notes the line says what GoListen holds, and never calls it listening evidence', () => {
    const c = buildCatalogue({ audio: audioOf });
    const by = Object.fromEntries(c.map((e) => [e.languageId, e]));
    expect(by.sq.audio).toBe('a voice from your device, if it has one; a remote voice, only with your consent and your own key; none of it is listening evidence');
    expect(by.es.audio).toBe(by.sq.audio);
    expect(by.de.audio).toBe('1 short demonstration recording; none of it is listening evidence');
    for (const l of ['nb', 'hi', 'th']) expect(by[l].audio, l).toBe('no validated audio');
    // the same GoListen facts the reader's capability view reports
    expect(audioOf('de').recordings).toBe(1);
    expect(audioOf('sq').remoteVoices.length).toBeGreaterThan(0);
  });

  it('whatWorks is one sentence built from the capability report: lemma and morphology quality, phrases and patterns, and Thai’s limited word boundaries', () => {
    for (const e of LANGUAGE_CATALOGUE) {
      const r = e.packs.map((p) => packCapabilities(p.languageId)!);
      expect(e.whatWorks, e.languageId).toMatch(/^Selecting a word/);
      expect(e.whatWorks.match(/\./g)!.length, e.languageId).toBe(1);
      expect(e.whatWorks, e.languageId).toContain(`its lemma (${r[0].lemma.quality})`);
      if (r.every((x) => x.morphology.supported)) expect(e.whatWorks, e.languageId).toContain(`its grammar features (${r[0].morphology.quality})`);
      else expect(e.whatWorks, e.languageId).not.toContain('grammar features');
      // a pack states phrases and patterns only when it declares them (Latin declares neither)
      if (r.every((x) => x.phrases.supported)) expect(e.whatWorks, e.languageId).toContain('fixed phrases');
      if (r.every((x) => x.constructions.supported)) expect(e.whatWorks, e.languageId).toContain('listed sentence patterns');
    }
    const th = LANGUAGE_CATALOGUE.find((e) => e.languageId === 'th')!;
    expect(th.whatWorks).toContain('word boundaries are limited');
    expect(th.whatWorks).not.toContain('grammar features'); // Thai has no inflection to analyse
    expect(LANGUAGE_CATALOGUE.find((e) => e.languageId === 'de')!.whatWorks).not.toContain('word boundaries are');
  });

  it('whatDoesNot states the limits the report states: a seed-only word list, no review, no roles, and nothing written is checked unless the pack offers a checker', () => {
    for (const e of LANGUAGE_CATALOGUE) {
      expect(e.whatDoesNot, e.languageId).toMatch(/^Lemmas come from a small machine-drafted word list/);
      expect(e.whatDoesNot, e.languageId).toContain('no native speaker has reviewed the pack');
      expect(e.whatDoesNot, e.languageId).toContain('there are no subject or object labels');
      const offered = e.packs.every((p) => packCapabilities(p.languageId)!.checker.offered);
      expect(e.whatDoesNot.includes('nothing you write is checked'), e.languageId).toBe(!offered);
    }
    expect(LANGUAGE_CATALOGUE.find((e) => e.languageId === 'sq')!.whatDoesNot).not.toContain('nothing you write is checked');
    expect(LANGUAGE_CATALOGUE.find((e) => e.languageId === 'nb')!.whatDoesNot).toContain('nothing you write is checked');
  });

  it('where the analyser is not loaded (a lazy build) the entry says so instead of claiming anything', () => {
    const lazy = buildCatalogue({ adapterOf: () => undefined });
    expect(lazy).toHaveLength(9);
    for (const e of lazy) {
      expect(e.whatWorks, e.languageId).toBe('The analyser is not loaded in this build, so no card capability is claimed here until it is.');
      expect(e.whatDoesNot, e.languageId).toMatch(/^Nothing is lemmatised or analysed until the analyser is loaded/);
      // level, validation and tutorial do not depend on the analyser
      expect(e.level, e.languageId).toBe(LANGUAGE_CATALOGUE.find((x) => x.languageId === e.languageId)!.level);
    }
  });

  it('a catalogue is plain data: it survives a JSON round trip unchanged', () => {
    expect(JSON.parse(JSON.stringify(LANGUAGE_CATALOGUE))).toEqual(LANGUAGE_CATALOGUE);
  });
});
