// @vitest-environment node
/**
 * Repository contract v3 (2026-10-09), at the contract level only (no store, no service): the typed source-reference union and its
 * restrictions, language-resolution evidence, the PackInstalled payload, provenance (P-12), the `requires-review` status, and the
 * promise that a v2 (and v1) event stays valid exactly as it was written.
 */
import { describe, expect, it } from 'vitest';
import {
  ACCEPTED_VERSIONS, ANALYSIS_STATUSES, CONTRACT_VERSION, DEFAULT_ORIGIN, DEFAULT_VALIDATION, PACK_LEVELS, PERMISSIONS, PROVENANCE_ORIGINS,
  RESTRICTION_FIELDS, SOURCE_KINDS, STATUS_RANK, UNKNOWN_RESTRICTIONS, VALIDATION_LEVELS, capRestrictions, packValidationOf, provenanceColumns,
  provenanceOf, restrictionsOf, scanForText, sourceLocator, validateAnalysis, validateEvent, validateLanguageEvidence, validatePayload,
  validateProvenance, validateRelation, validateSourceRef, validateUnit, validationForPack,
} from '../../packages/repository-contract/src';
import type { GoEvent, LinguisticUnit, Permission, SourceRestrictions } from '../../packages/repository-contract/src';

const lookup = (over: Partial<GoEvent> = {}): GoEvent => ({
  id: 'e1', v: 3, learnerId: 'L', enrolmentId: 'E', languageId: 'sq', at: '2026-10-09T10:00:00.000Z',
  producer: { app: 'golearn-ext', version: '1', deviceId: 'd1' }, kind: 'SelectionLookedUp',
  subject: { itemIds: ['form:sq:librin'], sentenceKey: 'ab12', sourceRef: { kind: 'demo' } },
  payload: { surface: 'librin', tokenCount: 1, contextKind: 'sentence', contextConfidence: 0.9, readerId: 'demo', helpShown: ['lemma'] },
  ...over,
});
const withRef = (sourceRef: unknown, v = 3): GoEvent => lookup({ v, subject: { itemIds: ['form:sq:librin'], sentenceKey: 'ab12', sourceRef: sourceRef as never } });
const paths = (issues: Array<{ path: string }>): string[] => issues.map((i) => i.path);

const SCRIPTURE = { kind: 'scripture', provider: 'biblegateway', translationId: 'NIV', book: 'JHN', chapter: 3, verse: 16, confidence: 0.9 };

describe('contract version 3: the version and its compatibility', () => {
  it('is 3, and accepts v1, v2 and v3', () => {
    expect(CONTRACT_VERSION).toBe(3);
    expect(ACCEPTED_VERSIONS).toEqual([1, 2, 3]);
    for (const v of [1, 2, 3]) expect(validateEvent(lookup({ v }))).toEqual([]);
    expect(paths(validateEvent(lookup({ v: 4 })))).toContain('v');
    expect(paths(validateEvent(lookup({ v: 0 })))).toContain('v');
  });

  it('a v2 event stays valid as it was written: any source kind, title and locator, no v3 field', () => {
    const v2 = lookup({ v: 2, subject: { itemIds: ['u1'], sourceRef: { kind: 'ebook', title: 'A book', locator: 'epubcfi(/6/4)' } } });
    expect(validateEvent(v2)).toEqual([]);
    // the extension prototype wrote kinds the union now names, with the old shape; a v2 event is not held to the v3 shape
    expect(validateEvent(withRef({ kind: 'scripture', translationId: 'NIV', book: 'JHN', chapter: 3, languageHint: 'en' }, 2))).toEqual([]);
    expect(validateEvent(withRef({ kind: 'share', title: 't', locator: 'app:x' }, 2))).toEqual([]);
    expect(validateEvent(withRef({ kind: 'some-future-kind' }, 2))).toEqual([]);
    expect(validateEvent(withRef({ kind: 'web' }, 1))).toEqual([]);
  });

  it('v2 still bounds title, locator and the text guard', () => {
    expect(paths(validateEvent(withRef({ kind: 'web', title: 'x'.repeat(301) }, 2)))).toContain('subject.sourceRef.title');
    expect(paths(validateEvent(withRef({ kind: 'web', locator: 'x'.repeat(2049) }, 2)))).toContain('subject.sourceRef.locator');
    expect(paths(validateEvent(withRef({ kind: 'web', title: 42 }, 2)))).toContain('subject.sourceRef.title');
    expect(paths(validateEvent(withRef({ kind: 'web', verseText: 'In the beginning was the Word' }, 2)))).toContain('subject.sourceRef.verseText');
  });

  it('v2 payloads without any v3 field validate: no language evidence, a PackInstalled with a packId only', () => {
    expect(validateEvent(lookup({ v: 2 }))).toEqual([]);
    const pack = lookup({ v: 2, kind: 'PackInstalled', subject: {}, payload: { packId: 'pack:sq' } });
    expect(validateEvent(pack)).toEqual([]);
    expect(packValidationOf(pack.payload as { validation?: unknown })).toBe('unreviewed');
    expect(validateEvent(lookup({ v: 2, kind: 'PackInstalled', subject: {}, payload: {} }))).toEqual([]);
  });
});

describe('the typed source-reference union', () => {
  it('names nine kinds', () => {
    expect([...SOURCE_KINDS]).toEqual(['web', 'ebook', 'file', 'demo', 'practice', 'writing', 'scripture', 'share', 'media']);
  });

  it('accepts every member in a v3 event', () => {
    for (const ref of [
      { kind: 'web', title: 'Page', locator: '/a/b' }, { kind: 'ebook' }, { kind: 'file', locator: 'x.epub' }, { kind: 'demo' }, { kind: 'practice' }, { kind: 'writing' },
      SCRIPTURE,
      { ...SCRIPTURE, provider: 'youversion', translationId: '111', languageId: 'en', verseEnd: 18, url: 'https://example.test/bible/111/JHN.3.16', restrictions: { textRetention: 'forbidden' } },
      { kind: 'scripture', provider: 'other', translationId: 'LSG', book: '1JN', chapter: 4, confidence: 0.3 },
      { kind: 'share', mechanism: 'android-process-text' }, { kind: 'share', mechanism: 'web-share-target', sourceApp: 'Some App', title: 'T', locator: '/x' },
      { kind: 'media', provider: 'video-site', mediaId: 'abc123', timestampMs: 61_000, captionLanguage: 'es', audioLanguage: 'es-MX', captionProvenance: 'generated' },
      { kind: 'media', provider: 'p', mediaId: 'm' },
    ]) {
      expect(validateEvent(withRef(ref)), JSON.stringify(ref)).toEqual([]);
    }
    for (const mechanism of ['android-process-text', 'android-send', 'ios-share-extension', 'ios-safari-extension', 'web-share-target', 'clipboard-import', 'deep-link']) {
      expect(validateSourceRef({ kind: 'share', mechanism })).toEqual([]);
    }
  });

  it('refuses an unknown kind and a non-object at v3', () => {
    expect(paths(validateEvent(withRef({ kind: 'pdf' })))).toContain('subject.sourceRef.kind');
    expect(paths(validateEvent(withRef({})))).toContain('subject.sourceRef.kind');
    expect(paths(validateEvent(withRef('web')))).toContain('subject.sourceRef');
  });

  it.each([
    ['no provider', { ...SCRIPTURE, provider: undefined }, 'provider'],
    ['an unknown provider', { ...SCRIPTURE, provider: 'esv-api' }, 'provider'],
    ['no translation', { ...SCRIPTURE, translationId: '' }, 'translationId'],
    ['a translation with a space', { ...SCRIPTURE, translationId: 'New International' }, 'translationId'],
    ['a lower-case book', { ...SCRIPTURE, book: 'jhn' }, 'book'],
    ['a four-letter book', { ...SCRIPTURE, book: 'JOHN' }, 'book'],
    ['chapter 0', { ...SCRIPTURE, chapter: 0 }, 'chapter'],
    ['a fractional chapter', { ...SCRIPTURE, chapter: 3.5 }, 'chapter'],
    ['verse 0', { ...SCRIPTURE, verse: 0 }, 'verse'],
    ['verse 177', { ...SCRIPTURE, verse: 177 }, 'verse'],
    ['a verseEnd before the verse', { ...SCRIPTURE, verseEnd: 15 }, 'verseEnd'],
    ['a verseEnd without a verse', { ...SCRIPTURE, verse: undefined, verseEnd: 18 }, 'verseEnd'],
    ['no confidence', { ...SCRIPTURE, confidence: undefined }, 'confidence'],
    ['a confidence over 1', { ...SCRIPTURE, confidence: 1.2 }, 'confidence'],
    ['a non-http address', { ...SCRIPTURE, url: 'javascript:alert(1)' }, 'url'],
    ['an address with credentials', { ...SCRIPTURE, url: 'https://user:pw@example.test/x' }, 'url'],
    ['an address that is not one', { ...SCRIPTURE, url: 'not a url' }, 'url'],
    ['a title', { ...SCRIPTURE, title: 'John 3:16' }, 'title'],
    ['a locator', { ...SCRIPTURE, locator: 'JHN.3.16' }, 'locator'],
  ])('a scripture reference with %s is refused', (_name, ref, field) => {
    expect(paths(validateEvent(withRef(ref)))).toContain(`subject.sourceRef.${field}`);
  });

  it('carries no verse text: text, verseText and passage are refused wherever they sit', () => {
    for (const key of ['text', 'verseText', 'verse_text', 'VerseText', 'passage']) {
      const issues = validateEvent(withRef({ ...SCRIPTURE, [key]: 'For God so loved the world' }));
      expect(paths(issues), key).toContain(`subject.sourceRef.${key}`);
    }
    // and in a payload, at any depth
    for (const key of ['verseText', 'passage', 'text']) {
      expect(scanForText({ a: { b: [{ [key]: 'x' }] } }, 'payload').length, key).toBeGreaterThan(0);
    }
    expect(paths(validateEvent(lookup({ payload: { surface: 'x', tokenCount: 1, contextKind: 'none', contextConfidence: 0, readerId: 'r', helpShown: [], verseText: 'x' } })))).toContain('payload.verseText');
  });

  it('a long prose string hidden in an unknown field of a v3 reference is refused', () => {
    const issues = validateEvent(withRef({ ...SCRIPTURE, note: 'In the beginning was the Word and the Word was with God' }));
    expect(paths(issues)).toContain('subject.sourceRef.note');
  });

  it.each([
    ['an unknown mechanism', { kind: 'share', mechanism: 'airdrop' }, 'mechanism'],
    ['no mechanism', { kind: 'share' }, 'mechanism'],
    ['a long app name', { kind: 'share', mechanism: 'deep-link', sourceApp: 'x'.repeat(101) }, 'sourceApp'],
    ['a media item with no id', { kind: 'media', provider: 'p' }, 'mediaId'],
    ['a media item with no provider', { kind: 'media', mediaId: 'm' }, 'provider'],
    ['a negative timestamp', { kind: 'media', provider: 'p', mediaId: 'm', timestampMs: -1 }, 'timestampMs'],
    ['a fractional timestamp', { kind: 'media', provider: 'p', mediaId: 'm', timestampMs: 1.5 }, 'timestampMs'],
    ['an unknown caption provenance', { kind: 'media', provider: 'p', mediaId: 'm', captionProvenance: 'scraped' }, 'captionProvenance'],
    ['a media title', { kind: 'media', provider: 'p', mediaId: 'm', title: 'a caption line' }, 'title'],
    ['a plain title over 300 characters', { kind: 'web', title: 'x'.repeat(301) }, 'title'],
  ])('%s is refused', (_name, ref, field) => {
    expect(paths(validateEvent(withRef(ref)))).toContain(`subject.sourceRef.${field}`);
  });

  it('sourceLocator names a scripture or media reference for source tombstones', () => {
    expect(sourceLocator(SCRIPTURE as never)).toBe('JHN.3.16');
    expect(sourceLocator({ ...SCRIPTURE, verse: undefined } as never)).toBe('JHN.3');
    expect(sourceLocator({ kind: 'media', provider: 'p', mediaId: 'm' })).toBe('p:m');
    expect(sourceLocator({ kind: 'web', locator: '/a' })).toBe('/a');
    expect(sourceLocator(undefined)).toBeUndefined();
  });
});

describe('source restrictions', () => {
  const RANK: Record<Permission, number> = { forbidden: 0, unknown: 1, allowed: 2 };

  it('every field is a permission; absent means unknown, in every field', () => {
    expect([...RESTRICTION_FIELDS]).toEqual(['textRetention', 'remoteProcessing', 'audioRetention', 'export', 'sharing', 'reviewExamples']);
    expect([...PERMISSIONS].sort()).toEqual(['allowed', 'forbidden', 'unknown']);
    expect(restrictionsOf(undefined)).toEqual(UNKNOWN_RESTRICTIONS);
    expect(restrictionsOf({})).toEqual(UNKNOWN_RESTRICTIONS);
    expect(Object.values(restrictionsOf({ restrictions: {} }))).toEqual(RESTRICTION_FIELDS.map(() => 'unknown'));
  });

  it('restrictionsOf fills the fields a reference does not state, and ignores values that are not permissions', () => {
    expect(restrictionsOf({ restrictions: { export: 'allowed', sharing: 'forbidden' } })).toEqual({ ...UNKNOWN_RESTRICTIONS, export: 'allowed', sharing: 'forbidden' });
    expect(restrictionsOf({ restrictions: { export: 'yes' as never } })).toEqual(UNKNOWN_RESTRICTIONS);
  });

  it('capRestrictions takes the more restrictive of the claim and the policy, field by field, for all 27 pairs', () => {
    const levels: Permission[] = ['forbidden', 'unknown', 'allowed'];
    for (const claim of levels) {
      for (const policy of levels) {
        const got = capRestrictions({ export: claim }, { ...UNKNOWN_RESTRICTIONS, export: policy });
        const want = RANK[claim] <= RANK[policy] ? claim : policy;
        expect(got.export, `${claim} under ${policy}`).toBe(want);
      }
    }
    // an absent claim is `unknown`: it can never be raised to the policy's `allowed`
    expect(capRestrictions(undefined, { ...UNKNOWN_RESTRICTIONS, export: 'allowed' }).export).toBe('unknown');
    expect(capRestrictions({}, { ...UNKNOWN_RESTRICTIONS, export: 'forbidden' }).export).toBe('forbidden');
  });

  it('capRestrictions never raises any field, whatever the claim', () => {
    const all = (p: Permission): SourceRestrictions => Object.fromEntries(RESTRICTION_FIELDS.map((f) => [f, p])) as SourceRestrictions;
    expect(capRestrictions(all('allowed'), all('forbidden'))).toEqual(all('forbidden'));
    expect(capRestrictions(all('allowed'), all('unknown'))).toEqual(all('unknown'));
    expect(capRestrictions(all('forbidden'), all('allowed'))).toEqual(all('forbidden'));
  });

  it('is validated on every member of the union', () => {
    expect(validateEvent(withRef({ kind: 'web', restrictions: { textRetention: 'allowed', export: 'forbidden' } }))).toEqual([]);
    expect(validateEvent(withRef({ ...SCRIPTURE, restrictions: {} }))).toEqual([]);
    expect(paths(validateEvent(withRef({ kind: 'web', restrictions: { export: 'maybe' } })))).toContain('subject.sourceRef.restrictions.export');
    expect(paths(validateEvent(withRef({ kind: 'web', restrictions: { copying: 'allowed' } })))).toContain('subject.sourceRef.restrictions.copying');
    expect(paths(validateEvent(withRef({ kind: 'web', restrictions: 'allowed' })))).toContain('subject.sourceRef.restrictions');
    // also on a v2 event: a restriction is never trusted unvalidated
    expect(paths(validateEvent(withRef({ kind: 'web', restrictions: { export: 'maybe' } }, 2)))).toContain('subject.sourceRef.restrictions.export');
  });
});

describe('language-resolution evidence', () => {
  const lang = { languageId: 'sq', basis: 'document-metadata', confidence: 0.8, override: false };
  const withLang = (language: unknown, kind: GoEvent['kind'] = 'SelectionLookedUp', v = 3): GoEvent => {
    const e = lookup({ v, kind });
    if (kind === 'EncounterRecorded') e.payload = { contextKind: 'sentence', language };
    else e.payload = { ...e.payload, language };
    return e;
  };

  it('accepts every basis, on a lookup and on an encounter', () => {
    for (const basis of ['override', 'book-metadata', 'document-metadata', 'detection', 'team-default', 'undetermined']) {
      const l = { languageId: 'sq', varietyId: 'sq-standard', basis, confidence: 0.5, source: 'html-lang', override: basis === 'override' };
      expect(validateEvent(withLang(l)), basis).toEqual([]);
      expect(validateEvent(withLang(l, 'EncounterRecorded')), basis).toEqual([]);
    }
  });

  it('is optional: a v2 lookup and a v3 lookup without it are valid', () => {
    expect(validateEvent(lookup({ v: 2 }))).toEqual([]);
    expect(validateEvent(lookup({ v: 3 }))).toEqual([]);
    expect(validateLanguageEvidence(undefined)).toEqual([]);
  });

  it('refuses an unknown basis, a confidence outside 0..1, and an override that disagrees with the basis', () => {
    expect(paths(validateEvent(withLang({ ...lang, basis: 'guess' })))).toContain('payload.language.basis');
    expect(paths(validateEvent(withLang({ ...lang, confidence: 1.1 })))).toContain('payload.language.confidence');
    expect(paths(validateEvent(withLang({ ...lang, confidence: -0.1 })))).toContain('payload.language.confidence');
    expect(paths(validateEvent(withLang({ ...lang, confidence: '0.5' })))).toContain('payload.language.confidence');
    expect(paths(validateEvent(withLang({ ...lang, basis: 'override', override: false })))).toContain('payload.language.override');
    expect(paths(validateEvent(withLang({ ...lang, basis: 'detection', override: true })))).toContain('payload.language.override');
    expect(paths(validateEvent(withLang({ ...lang, override: undefined })))).toContain('payload.language.override');
    expect(paths(validateEvent(withLang({ ...lang, languageId: '' })))).toContain('payload.language.languageId');
    expect(paths(validateEvent(withLang({ ...lang, source: 'x'.repeat(101) })))).toContain('payload.language.source');
    expect(paths(validateEvent(withLang('sq')))).toContain('payload.language');
    expect(paths(validateEvent(withLang(['sq'])))).toContain('payload.language');
  });

  it('a detected language is a different thing from a confirmed one: the basis is kept, never collapsed', () => {
    expect(validateLanguageEvidence({ ...lang, basis: 'detection', confidence: 0.99 })).toEqual([]);
    expect(validateLanguageEvidence({ ...lang, basis: 'override', confidence: 1, override: true })).toEqual([]);
  });
});

describe('PackInstalled', () => {
  const pack = (payload: Record<string, unknown>, v = 3): GoEvent => lookup({ v, kind: 'PackInstalled', subject: {}, payload });

  it('accepts the full v3 payload with every level and every validation', () => {
    for (const level of PACK_LEVELS) {
      for (const validation of VALIDATION_LEVELS) {
        expect(validateEvent(pack({ packId: 'pack:sq', packVersion: '9', analyzerId: 'adapter-sq', analyzerVersion: '9', level, validation })), `${level}/${validation}`).toEqual([]);
      }
    }
  });

  it('refuses an unknown level or validation and a malformed id', () => {
    expect(paths(validateEvent(pack({ packId: 'p', level: 'beta' })))).toContain('payload.level');
    expect(paths(validateEvent(pack({ packId: 'p', validation: 'verified' })))).toContain('payload.validation');
    expect(paths(validateEvent(pack({ packId: 42 })))).toContain('payload.packId');
    expect(paths(validateEvent(pack({ packId: 'p', analyzerVersion: 'x'.repeat(201) })))).toContain('payload.analyzerVersion');
  });

  it('a payload without level or validation reads as unreviewed', () => {
    expect(packValidationOf({})).toBe('unreviewed');
    expect(packValidationOf({ validation: 'nonsense' })).toBe('unreviewed');
    expect(packValidationOf({ validation: 'experimental' })).toBe('experimental');
    expect(validatePayload('PackInstalled', { packId: 'p' })).toEqual([]);
  });
});

describe('provenance (P-12) and the requires-review status', () => {
  const base = { source: 'rule', ref: 'adapter-sq@9', confidence: 0.5 } as const;

  it('v2 provenance (no v3 field) stays valid and reads as import / unreviewed', () => {
    expect(validateProvenance(base)).toEqual([]);
    expect(provenanceOf(base)).toMatchObject({ origin: DEFAULT_ORIGIN, validation: DEFAULT_VALIDATION });
    expect(DEFAULT_ORIGIN).toBe('import');
    expect(DEFAULT_VALIDATION).toBe('unreviewed');
  });

  it('accepts every origin and validation, and the v3 optional fields', () => {
    for (const origin of PROVENANCE_ORIGINS) for (const validation of VALIDATION_LEVELS) expect(validateProvenance({ ...base, origin, validation })).toEqual([]);
    expect(validateProvenance({
      ...base, origin: 'learner-lookup', validation: 'experimental', licenceId: 'CC-BY-SA-4.0', packVersion: '9', analyzerVersion: '9.1', alternatives: ['lemma:sq:a', 'lemma:sq:b'],
      corrections: [{ at: '2026-10-09T10:00:00.000Z', by: 'learner', from: 'lemma:sq:a', to: 'lemma:sq:b', reason: 'wrong lemma' }],
    })).toEqual([]);
    expect([...PROVENANCE_ORIGINS]).toEqual(['pack-lexicon', 'dictionary', 'rule-derived', 'learner-lookup', 'reviewer', 'import']);
    expect([...VALIDATION_LEVELS]).toEqual(['production-validated', 'experimental', 'seed-only', 'unreviewed', 'incomplete', 'unsupported']);
  });

  it('refuses a bad origin, validation, alternatives and corrections', () => {
    expect(paths(validateProvenance({ ...base, origin: 'scraped' }))).toContain('provenance.origin');
    expect(paths(validateProvenance({ ...base, validation: 'verified' }))).toContain('provenance.validation');
    expect(paths(validateProvenance({ ...base, alternatives: [1] }))).toContain('provenance.alternatives');
    expect(paths(validateProvenance({ ...base, alternatives: Array.from({ length: 51 }, (_, i) => `u${i}`) }))).toContain('provenance.alternatives');
    expect(paths(validateProvenance({ ...base, corrections: [{ at: 'yesterday', by: 'learner', reason: 'r' }] }))).toContain('provenance.corrections[0].at');
    expect(paths(validateProvenance({ ...base, corrections: [{ at: '2026-10-09T10:00:00.000Z', by: 'teacher', reason: 'r' }] }))).toContain('provenance.corrections[0].by');
    expect(paths(validateProvenance({ ...base, corrections: [{ at: '2026-10-09T10:00:00.000Z', by: 'system', reason: '' }] }))).toContain('provenance.corrections[0].reason');
    expect(paths(validateProvenance({ ...base, corrections: [{ at: '2026-10-09T10:00:00.000Z', by: 'system', reason: 'x'.repeat(301) }] }))).toContain('provenance.corrections[0].reason');
    expect(paths(validateProvenance({ ...base, corrections: 'none' }))).toContain('provenance.corrections');
  });

  it('provenanceColumns: a row\'s own provenance, an analysis\' own, else its chosen candidate\'s, else the defaults', () => {
    expect(provenanceColumns({ provenance: { ...base, origin: 'reviewer', validation: 'seed-only' } })).toEqual({ origin: 'reviewer', validation: 'seed-only' });
    expect(provenanceColumns({ provenance: base })).toEqual({ origin: 'import', validation: 'unreviewed' });
    const candidates = [{ provenance: { ...base, origin: 'dictionary' as const } }, { provenance: { ...base, origin: 'rule-derived' as const, validation: 'experimental' as const } }];
    expect(provenanceColumns({ candidates, chosen: 1 })).toEqual({ origin: 'rule-derived', validation: 'experimental' });
    expect(provenanceColumns({ candidates })).toEqual({ origin: 'dictionary', validation: 'unreviewed' });
    expect(provenanceColumns({ provenance: base, candidates, chosen: 1 })).toEqual({ origin: 'import', validation: 'unreviewed' });
    expect(provenanceColumns({})).toEqual({ origin: 'import', validation: 'unreviewed' });
  });

  it('validationForPack: installable is production-validated only if the manifest says so', () => {
    expect(validationForPack({ level: 'installable', validation: 'production-validated' })).toBe('production-validated');
    expect(validationForPack({ level: 'installable' })).toBe('unreviewed');
    expect(validationForPack({ level: 'installable', validation: 'experimental' })).toBe('unreviewed');
    expect(validationForPack({ level: 'installable', validation: 'seed-only' })).toBe('seed-only');
    expect(validationForPack({ level: 'installable', validation: 'incomplete' })).toBe('incomplete');
    expect(validationForPack({ level: 'experimental' })).toBe('experimental');
    expect(validationForPack({ level: 'experimental', validation: 'production-validated' })).toBe('experimental');
    expect(validationForPack({ level: 'planned' })).toBe('unsupported');
    expect(validationForPack({})).toBe('unreviewed');
    expect(validationForPack({ validation: 'production-validated' })).toBe('unreviewed');
    expect(validationForPack(undefined)).toBe('unreviewed');
  });

  it('requires-review ranks between conflicted and provisional, and every layer-A validator accepts it', () => {
    expect(ANALYSIS_STATUSES).toContain('requires-review');
    expect(STATUS_RANK.conflicted).toBeLessThan(STATUS_RANK['requires-review']);
    expect(STATUS_RANK['requires-review']).toBeLessThan(STATUS_RANK.provisional);
    expect(STATUS_RANK.invalidated).toBeLessThan(STATUS_RANK.conflicted);
    expect(STATUS_RANK.provisional).toBeLessThan(STATUS_RANK['high-confidence']);
    expect(STATUS_RANK['high-confidence']).toBeLessThan(STATUS_RANK.verified);
    const unit: LinguisticUnit = {
      unitId: 'lemma:sq:a:NOUN', kind: 'lexeme', languageId: 'sq', label: 'a', packId: 'p', packVersion: '1', provenance: base, status: 'requires-review', createdAt: '2026-10-09T10:00:00.000Z',
    };
    expect(validateUnit(unit)).toEqual([]);
    expect(validateRelation({ fromId: 'a', relation: 'form-of', toId: 'b', confidence: 0.5, provenance: base, status: 'requires-review' })).toEqual([]);
    expect(validateAnalysis({
      analysisId: 'x', formId: 'f', languageId: 'sq', candidates: [{ confidence: 0.5, provenance: base }], status: 'requires-review', analyzerId: 'a', packId: 'p', packVersion: '1', createdAt: '2026-10-09T10:00:00.000Z',
    })).toEqual([]);
    expect(paths(validateUnit({ ...unit, provenance: { ...base, origin: 'bogus' } }))).toContain('provenance.origin');
  });
});

describe('typed card creation and practice intent (GoReview 3, validated since 2026-10-29)', () => {
  const base = (kind: 'CardAdded' | 'CardReviewed', payload: Record<string, unknown>) => ({
    id: 'e1', v: 3, learnerId: 'L', enrolmentId: 'E', languageId: 'sq', at: '2026-10-08T10:00:00.000Z',
    producer: { app: 'gopractice-review', version: '1', deviceId: 'D' }, kind,
    subject: { cardId: 'card:written-recognition:form:sq:x', itemIds: ['form:sq:x'] }, payload, evidence: { quality: 'none' },
  });
  const creation = (payload: Record<string, unknown>) => base('CardAdded', { unitId: 'form:sq:x', unitKind: 'form', dimension: 'written-recognition', family: 'written-recognition', addedBy: 'intake', ...payload });
  const paths = (e: unknown) => validateEvent(e).map((i) => i.path);
  it('accepts a bare creation, a typed automatic creation and a typed explicit one', () => {
    expect(paths(creation({}))).toEqual([]);
    expect(paths(creation({ lifecycle: 'create', admission: { at: '2026-10-08T10:00:00.000Z', intent: { kind: 'automatic' } } }))).toEqual([]);
    expect(paths(creation({ lifecycle: 'create', admission: { at: '2026-10-08T10:00:00.000Z', intent: { kind: 'explicit', reason: 'saved-deck', requestedAt: '2026-10-08T09:59:00.000Z' } } }))).toEqual([]);
  });
  it('names what is wrong: another lifecycle, a missing instant, an intent of another kind, an explicit intent without its reason', () => {
    expect(paths(creation({ lifecycle: 'remove' }))).toEqual(['payload.lifecycle']);
    expect(paths(creation({ lifecycle: 'create', admission: { intent: { kind: 'automatic' } } }))).toEqual(['payload.admission.at']);
    expect(paths(creation({ lifecycle: 'create', admission: { at: 'yesterday', intent: { kind: 'maybe' } } }))).toEqual(['payload.admission.at', 'payload.admission.intent.kind']);
    expect(paths(creation({ admission: { at: '2026-10-08T10:00:00.000Z', intent: { kind: 'explicit', reason: 'because', requestedAt: 'now' } } }))).toEqual(['payload.admission.intent.reason', 'payload.admission.intent.requestedAt']);
    expect(paths(creation({ admission: 'explicit' }))).toEqual(['payload.admission']);
  });
  it('a review carries its practice intent in the same shape, or none', () => {
    const review = (practiceIntent?: unknown) => base('CardReviewed', { cardKind: 'recognition', grade: 'good', correct: true, hinted: false, rating: 3, ...(practiceIntent !== undefined ? { practiceIntent } : {}) });
    expect(paths(review())).toEqual([]);
    expect(paths(review({ kind: 'explicit', reason: 'selected-vocabulary', requestedAt: '2026-10-08T09:59:00.000Z' }))).toEqual([]);
    expect(paths(review({ kind: 'explicit' }))).toEqual(['payload.practiceIntent.reason', 'payload.practiceIntent.requestedAt']);
    expect(paths(review('explicit'))).toEqual(['payload.practiceIntent']);
  });
});
