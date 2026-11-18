// @vitest-environment node
/**
 * Language varieties as a learning dimension: the registry, review identity, what an event says of its variety, and review scope
 * (packages/repository-contract/src/varieties.ts; docs/ecosystem/LANGUAGE-VARIETIES.md).
 */
import { describe, expect, it } from 'vitest';
import {
  canonicalVarietyId, cardIdFor, defaultScope, defaultVarietyOf, hasLearningVarieties, inScope, isLegacyReviewRecord, learningVarietiesOf, legacyStampOf,
  legacyVarietyOf, lexicalFamilyKey, normalizeScope, parseCardId, selectableVarietiesOf, statedVarietyOf, validateEvent, varietyOf, varietyRelation,
} from '../../packages/repository-contract/src';
import type { GoEvent } from '../../packages/repository-contract/src';
import { greekManifest } from '../../packages/language-packs/src/packs/el';
import { hebrewManifest } from '../../packages/language-packs/src/packs/he';

const base = (over: Partial<GoEvent>): GoEvent => ({
  id: 'e1', v: 3, learnerId: 'L', enrolmentId: 'E', languageId: 'el', at: '2026-11-17T10:00:00.000Z',
  producer: { app: 'golearn-ext', version: '1', deviceId: 'd' }, kind: 'SelectionLookedUp', subject: { itemIds: ['lemma:el:λόγος:NOUN'] },
  payload: { tokenCount: 1, contextKind: 'sentence', contextConfidence: 1, readerId: 'r', helpShown: [] }, ...over,
});

describe('the registry', () => {
  it('Greek and Hebrew stay one language each, with their varieties beneath', () => {
    expect(hasLearningVarieties('el')).toBe(true);
    expect(hasLearningVarieties('he')).toBe(true);
    expect(learningVarietiesOf('el').map((v) => v.id)).toEqual(['el-hom', 'el-att', 'el-koi', 'el-ion', 'el-dor', 'el-aeo', 'el-med', 'el-mod']);
    expect(learningVarietiesOf('he').map((v) => v.id)).toEqual(['he-bib', 'he-mish', 'he-med', 'he-mod', 'arc-bib']);
    for (const v of [...learningVarietiesOf('el'), ...learningVarietiesOf('he')]) expect(v.parentLanguage === 'el' || v.parentLanguage === 'he').toBe(true);
    expect(selectableVarietiesOf('el').map((v) => v.id)).toEqual(['el-hom', 'el-att', 'el-koi', 'el-mod']);
    expect(selectableVarietiesOf('he').map((v) => v.id)).toEqual(['he-bib', 'he-mod']);
  });

  it('Ancient Greek is not one thing: Homeric, Classical and Koine are separate varieties of one group, Modern another', () => {
    expect(varietyOf('el', 'el-hom')?.historicalGroup).toBe('ancient');
    expect(varietyOf('el', 'el-att')?.historicalGroup).toBe('ancient');
    expect(varietyOf('el', 'el-koi')?.historicalGroup).toBe('ancient');
    expect(varietyOf('el', 'el-mod')?.historicalGroup).toBe('modern');
    expect(varietyRelation('el', 'el-att', 'el-koi')).toBe('same-group');
    expect(varietyRelation('el', 'el-att', 'el-mod')).toBe('other-group');
    expect(varietyRelation('he', 'he-bib', 'he-mod')).toBe('other-group');
    expect(varietyRelation('he', 'he-bib', 'arc-bib')).toBe('heritage');
    expect(varietyRelation('el', 'el-att', 'el-att')).toBe('same');
    // nearest first: the other ancient varieties before the medieval and the modern
    expect(varietyOf('el', 'el-koi')?.relatedVarieties.slice(0, 2)).toEqual(['el-hom', 'el-att']);
    expect(varietyOf('el', 'el-koi')?.relatedVarieties.at(-1)).toBe('el-mod');
  });

  it('the longer spellings are aliases of the stored ids, never ids of their own', () => {
    expect(canonicalVarietyId('el', 'grc-homeric')).toBe('el-hom');
    expect(canonicalVarietyId('el', 'grc-classical')).toBe('el-att');
    expect(canonicalVarietyId('el', 'grc-koine')).toBe('el-koi');
    expect(canonicalVarietyId('el', 'el-modern')).toBe('el-mod');
    expect(canonicalVarietyId('he', 'he-biblical')).toBe('he-bib');
    expect(canonicalVarietyId('he', 'he-modern')).toBe('he-mod');
    expect(canonicalVarietyId('he', 'el-koi')).toBeUndefined(); // a Greek variety is not a Hebrew one
    expect(canonicalVarietyId('el', 'nonsense')).toBeUndefined();
  });

  it('a language without learning varieties is left exactly as it was', () => {
    for (const lang of ['sq', 'es', 'de', 'hi', 'th', 'la', 'nb', 'nn', 'arc']) {
      expect(hasLearningVarieties(lang)).toBe(false);
      expect(learningVarietiesOf(lang)).toEqual([]);
      expect(canonicalVarietyId(lang, `${lang}-standard`)).toBeUndefined();
      expect(normalizeScope({ languageId: lang, varietyIds: ['x'] })).toBeUndefined();
      expect(defaultScope(lang, 'es-HN')).toBeUndefined();
    }
    // a regional variety is a usage label, not a learning task: a Spanish scope does not exist, and everything is "in scope"
    expect(inScope(undefined, 'es-HN')).toBe(true);
  });

  it('agrees with what the Greek and Hebrew packs declare (same ids, same default)', () => {
    for (const manifest of [greekManifest(), hebrewManifest()]) {
      const known = new Set(learningVarietiesOf(manifest.languageId).map((v) => v.id));
      for (const v of manifest.varieties ?? []) expect(known.has(v.varietyId), `${v.varietyId} is declared by the pack and missing from the registry`).toBe(true);
      expect(defaultVarietyOf(manifest.languageId)).toBe(manifest.varietyId);
      // what the pack analyses is what a learner may choose (Biblical Aramaic is its own language and is never a Hebrew choice)
      const analysed = (manifest.varieties ?? []).filter((v) => v.analysed && v.varietyId !== 'arc-bib').map((v) => v.varietyId).sort();
      expect(selectableVarietiesOf(manifest.languageId).map((v) => v.id).sort()).toEqual(analysed);
    }
  });
});

describe('review identity', () => {
  it('a card id names learner-independent identity: skill, variety and lexical unit; the old shape stays valid', () => {
    const unit = 'lemma:el:λόγος:NOUN';
    expect(cardIdFor(unit, 'written-recognition')).toBe('card:written-recognition:lemma:el:λόγος:NOUN');
    expect(cardIdFor(unit, 'written-recognition', 'el-att')).toBe('card:written-recognition@el-att:lemma:el:λόγος:NOUN');
    expect(parseCardId('card:written-recognition:lemma:el:λόγος:NOUN')).toEqual({ dimension: 'written-recognition', unitId: unit });
    expect(parseCardId('card:written-recognition@el-att:lemma:el:λόγος:NOUN')).toEqual({ dimension: 'written-recognition', varietyId: 'el-att', unitId: unit });
  });

  it('two varieties, two skills and two units never share an id', () => {
    const ids = new Set<string>();
    for (const unit of ['lemma:el:λόγος:NOUN', 'form:el:λόγος']) for (const dim of ['written-recognition', 'meaning-to-form']) for (const v of [undefined, 'el-att', 'el-koi', 'el-mod']) ids.add(cardIdFor(unit, dim, v));
    expect(ids.size).toBe(2 * 2 * 4);
  });

  it('a unit id may contain any character and still parses', () => {
    for (const unit of ['phrase:el:ἐν_ἀρχῇ', 'lemma:he:מֶלֶךְ:NOUN', 'form:el:a@b:c', 'lemma:el:x:y:z']) {
      expect(parseCardId(cardIdFor(unit, 'written-recognition', 'el-koi'))?.unitId).toBe(unit);
      expect(parseCardId(cardIdFor(unit, 'written-recognition'))?.unitId).toBe(unit);
    }
    expect(parseCardId('lemma:el:λόγος')).toBeUndefined();
    expect(parseCardId('card:@el-att:x')).toBeUndefined();
    expect(parseCardId('card:written-recognition@:x')).toBeUndefined();
  });
});

describe('what an event says of its variety', () => {
  it('a reader that declares its text is believed; an enrolment default and a detection are not', () => {
    const declared = base({ payload: { ...base({}).payload, language: { languageId: 'el', varietyId: 'el-koi', basis: 'override', confidence: 1, override: true } } });
    expect(statedVarietyOf(declared)).toEqual({ varietyId: 'el-koi', basis: 'declared' });
    const page = base({ languageId: 'he', payload: { ...base({}).payload, language: { languageId: 'he', varietyId: 'he-bib', basis: 'document-metadata', confidence: 0.9, override: false } } });
    expect(statedVarietyOf(page)).toEqual({ varietyId: 'he-bib', basis: 'declared' });
    for (const basis of ['team-default', 'detection']) {
      const weak = base({ languageId: 'he', payload: { ...base({}).payload, language: { languageId: 'he', varietyId: 'he-mod', basis, confidence: 0.5, override: false } } });
      expect(statedVarietyOf(weak)).toBeUndefined();
    }
    // the envelope's variety is the enrolment's target, not a statement about the text
    expect(statedVarietyOf(base({ varietyId: 'el-mod' }))).toBeUndefined();
  });

  it('`payload.variety` states it outright, with its basis, and is validated', () => {
    const analysed = base({ payload: { ...base({}).payload, variety: { varietyId: 'el-att', basis: 'analysed' } } });
    expect(statedVarietyOf(analysed)).toEqual({ varietyId: 'el-att', basis: 'analysed' });
    expect(validateEvent(analysed)).toEqual([]);
    expect(validateEvent(base({ payload: { ...base({}).payload, variety: { varietyId: 'el-att', basis: 'guess' } } })).map((i) => i.path)).toContain('payload.variety.basis');
    expect(validateEvent(base({ payload: { ...base({}).payload, variety: 'el-att' } })).map((i) => i.path)).toContain('payload.variety');
    // an id the language does not know states nothing
    expect(statedVarietyOf(base({ payload: { ...base({}).payload, variety: { varietyId: 'he-bib', basis: 'declared' } } }))).toBeUndefined();
    // an alias is read as the id it names
    expect(statedVarietyOf(base({ payload: { ...base({}).payload, variety: { varietyId: 'grc-koine', basis: 'declared' } } }))?.varietyId).toBe('el-koi');
  });

  it('a card whose id names a variety is that variety, whatever its envelope says', () => {
    const review = base({ producer: { app: 'gopractice-review', version: '1', deviceId: 'd' }, kind: 'CardReviewed', varietyId: 'el-mod',
      subject: { cardId: cardIdFor('lemma:el:λόγος:NOUN', 'written-recognition', 'el-att'), itemIds: ['lemma:el:λόγος:NOUN'] } });
    expect(statedVarietyOf(review)).toEqual({ varietyId: 'el-att', basis: 'card' });
    expect(isLegacyReviewRecord(review)).toBe(false);
    expect(legacyStampOf(review)).toBeUndefined();
  });

  it('a GoReview record with the old id shape is a legacy record: its envelope carries a stamp, never a classification', () => {
    const old = base({ producer: { app: 'gopractice-review', version: '1', deviceId: 'd' }, kind: 'CardReviewed', varietyId: 'el-koi',
      subject: { cardId: cardIdFor('lemma:el:λόγος:NOUN', 'written-recognition'), itemIds: ['lemma:el:λόγος:NOUN'] } });
    expect(statedVarietyOf(old)).toBeUndefined();
    expect(isLegacyReviewRecord(old)).toBe(true);
    expect(legacyStampOf(old)).toBe('el-koi');
    // a reader's event is never a legacy review record, and a language without varieties has none
    expect(isLegacyReviewRecord(base({}))).toBe(false);
    expect(isLegacyReviewRecord({ ...old, languageId: 'sq' })).toBe(false);
  });
});

describe('legacy records are assigned only on sufficient evidence', () => {
  it('one classified variety settles it; a stamp of the default variety settles nothing by itself', () => {
    expect(legacyVarietyOf('he', undefined, ['he-bib'])).toBe('he-bib');
    expect(legacyVarietyOf('he', 'he-mod', ['he-bib'])).toBe('he-bib'); // the default stamp is not a choice
    expect(legacyVarietyOf('he', 'he-mod', [])).toBeUndefined();        // never "Modern" by assumption
    expect(legacyVarietyOf('el', 'el-mod', [])).toBeUndefined();
    expect(legacyVarietyOf('he', undefined, [])).toBeUndefined();
  });

  it('a stamp somebody chose stands when nothing contradicts it, and is a conflict when the evidence is elsewhere', () => {
    expect(legacyVarietyOf('he', 'he-bib', [])).toBe('he-bib');
    expect(legacyVarietyOf('el', 'el-koi', [])).toBe('el-koi');
    expect(legacyVarietyOf('he', 'he-bib', ['he-mod'])).toBeUndefined();
    expect(legacyVarietyOf('el', 'el-koi', ['el-koi', 'el-att'])).toBe('el-koi');
    expect(legacyVarietyOf('el', undefined, ['el-koi', 'el-att'])).toBeUndefined();
    expect(legacyVarietyOf('el', 'el-mod', ['el-koi', 'el-att'])).toBeUndefined();
  });

  it('a language without learning varieties assigns nothing', () => {
    expect(legacyVarietyOf('es', 'es-HN', ['es-HN'])).toBeUndefined();
  });
});

describe('review scope', () => {
  it('normalises to known ids in registry order and includes the unsettled unless told otherwise', () => {
    expect(normalizeScope({ languageId: 'el', varietyIds: ['el-modern', 'grc-koine', 'bogus', 'el-koi'] })).toEqual({ languageId: 'el', varietyIds: ['el-koi', 'el-mod'], includeUnsettled: true });
    expect(normalizeScope({ languageId: 'he', varietyIds: ['he-bib'], includeUnsettled: false })).toEqual({ languageId: 'he', varietyIds: ['he-bib'], includeUnsettled: false });
  });

  it('the default is ONE variety, never a combination', () => {
    expect(defaultScope('he', 'he-bib')?.varietyIds).toEqual(['he-bib']);
    expect(defaultScope('el', 'el-koi')?.varietyIds).toEqual(['el-koi']);
    expect(defaultScope('he', undefined, ['he-bib', 'he-mod'])?.varietyIds).toEqual(['he-bib']); // the most recently studied
    expect(defaultScope('he')?.varietyIds).toEqual(['he-mod']);
    expect(defaultScope('el', 'not-a-variety', [])?.varietyIds).toEqual(['el-mod']);
  });

  it('membership: a named variety, or the unsettled when included; never another variety', () => {
    const classical = normalizeScope({ languageId: 'el', varietyIds: ['el-att'] })!;
    expect(inScope(classical, 'el-att')).toBe(true);
    expect(inScope(classical, 'el-mod')).toBe(false);
    expect(inScope(classical, 'el-koi')).toBe(false);
    expect(inScope(classical, undefined)).toBe(true);
    expect(inScope({ ...classical, includeUnsettled: false }, undefined)).toBe(false);
  });
});

describe('spelling families', () => {
  it('relates the same letters under two spelling conventions, and nothing else', () => {
    expect(lexicalFamilyKey('he', 'lemma:he:מֶלֶךְ:NOUN')).toBe(lexicalFamilyKey('he', 'lemma:he:מלך:NOUN'));
    expect(lexicalFamilyKey('el', 'lemma:el:ἄνθρωπος:NOUN')).toBe(lexicalFamilyKey('el', 'lemma:el:άνθρωπος:NOUN'));
    expect(lexicalFamilyKey('el', 'lemma:el:λόγος:NOUN')).not.toBe(lexicalFamilyKey('el', 'lemma:el:λόγος:VERB'));
    expect(lexicalFamilyKey('el', 'lemma:el:λόγος:NOUN')).not.toBe(lexicalFamilyKey('el', 'lemma:el:νόμος:NOUN'));
    expect(lexicalFamilyKey('sq', 'lemma:sq:libër:NOUN')).toBeUndefined();
    expect(lexicalFamilyKey('el', 'morph:el:NOUN:x')).toBeUndefined();
  });
});
