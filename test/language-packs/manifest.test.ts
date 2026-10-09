import { describe, expect, it } from 'vitest';
import { albanianPack } from '../../packages/repository-linguistics/src';
import { sqAdapter } from '../../src/adapters/sq';
import {
  CLOSE, HIGH_CONFIDENCE, KAIKKI_ATTRIBUTION, MIN_VALIDATION_CASES, PACKS, albanianManifest, toPackInfo, validateManifest,
} from '../../packages/language-packs/src';
import type { PackManifest } from '../../packages/language-packs/src';
import { CLOSE as RESOLVER_CLOSE, HIGH_CONFIDENCE as RESOLVER_HIGH } from '../../packages/repository-linguistics/src';

const paths = (m: unknown): string[] => validateManifest(m).map((i) => i.path);
const clone = (): PackManifest => structuredClone(albanianManifest());

describe('validateManifest', () => {
  it('accepts the Albanian manifest and every planned manifest', () => {
    expect(validateManifest(albanianManifest())).toEqual([]);
    for (const [lang, m] of Object.entries(PACKS)) expect(validateManifest(m), lang).toEqual([]);
  });

  it('agrees with the Repository descriptor of the Albanian pack (packId, version, analyser)', () => {
    const m = albanianManifest();
    const repo = albanianPack();
    expect(m.packId).toBe(repo.packId);
    expect(m.version).toBe(repo.version);
    expect(m.version).toBe(String(sqAdapter.version));
    expect(m.analyzer.id).toBe(repo.analyzerId);
    expect(toPackInfo(m)).toMatchObject({ packId: repo.packId, languageId: 'sq', version: repo.version, analyzerId: repo.analyzerId, reviewStatus: repo.reviewStatus });
  });

  it('uses the Repository’s own status thresholds', () => {
    expect(CLOSE).toBe(RESOLVER_CLOSE);
    expect(HIGH_CONFIDENCE).toBe(RESOLVER_HIGH);
  });

  it('declares the dictionary as the real attributed CC BY-SA dictionary', () => {
    const d = albanianManifest().lexical.dictionary!;
    expect(d).toMatchObject({ id: 'kaikki-sq@2026-09-28', baseUrl: 'dict/sq/', entries: 91271, frequency: true });
    expect(d.attribution).toBe('Wiktionary, via kaikki.org — CC BY-SA 4.0');
    expect(d.attribution).toBe(KAIKKI_ATTRIBUTION);
  });

  it('refuses a non-object, a wrong packId and a missing language', () => {
    expect(validateManifest(null)).toEqual([{ path: '', message: 'not an object' }]);
    const m = clone();
    m.packId = 'pack:xx';
    expect(paths(m)).toContain('packId');
    expect(paths({ ...clone(), languageId: '' })).toContain('languageId');
  });

  it('refuses a remote voice that does not require consent and a key', () => {
    const m = clone() as any;
    m.pronunciation.remoteVoice.requiresConsentAndKey = false;
    expect(paths(m)).toContain('pronunciation.remoteVoice.requiresConsentAndKey');
  });

  it('refuses a tutorial that cannot be skipped', () => {
    const m = clone() as any;
    m.tutorial.skippable = false;
    expect(paths(m)).toContain('tutorial');
  });

  it('refuses a CC BY-SA dictionary without its attribution, and an absolute dictionary path', () => {
    const m = clone();
    m.lexical.dictionary!.attribution = 'Wiktionary';
    expect(paths(m)).toContain('lexical.dictionary.attribution');
    const n = clone();
    n.lexical.dictionary!.baseUrl = 'https://cdn.example/dict/sq/';
    expect(paths(n)).toContain('lexical.dictionary.baseUrl');
    const o = clone();
    o.lexical.dictionary!.baseUrl = '/dict/sq/';
    expect(paths(o)).toContain('lexical.dictionary.baseUrl');
  });

  it('refuses an analyser id that does not name the pack’s language and version', () => {
    const m = clone();
    m.analyzer.id = 'adapter-sq@1';
    expect(paths(m)).toContain('analyzer.id');
    const n = clone();
    n.analyzer.version = '0';
    expect(paths(n)).toContain('analyzer.version');
  });

  it('refuses a pack that claims more review than its hand lexicon has', () => {
    const m = clone();
    m.rights.reviewStatus = 'reviewed';
    expect(paths(m)).toContain('rights.reviewStatus');
  });

  it('refuses an installable pack with too few validation cases, and a case whose sentence lacks the surface', () => {
    const m = clone();
    m.validation = m.validation.slice(0, MIN_VALIDATION_CASES - 1);
    expect(paths(m)).toContain('validation');
    const n = clone();
    n.validation[0] = { ...n.validation[0], surface: 'zzz' };
    expect(paths(n)).toContain('validation[0].sentence');
    const o = clone();
    o.validation[1] = { ...o.validation[0] };
    expect(paths(o)).toContain('validation[1].id');
  });

  it('refuses duplicate grammar features and a feature with no values', () => {
    const m = clone();
    m.grammar.features.push({ ...m.grammar.features[0] });
    expect(paths(m)).toContain(`grammar.features[${m.grammar.features.length - 1}].key`);
    const n = clone();
    n.grammar.features[0].values = {};
    expect(paths(n)).toContain('grammar.features[0].values');
  });

  it('requires a Norwegian pack to state its written standard', () => {
    const m = structuredClone(PACKS.nb);
    delete m.varieties[0].writtenStandard;
    expect(paths(m)).toContain('varieties[0].writtenStandard');
    const n = structuredClone(PACKS.nn);
    n.varieties[0].writtenStandard = 'nb';
    expect(paths(n)).toContain('varieties[0].writtenStandard');
  });

  it('never throws on rubbish', () => {
    for (const junk of [undefined, 3, 'x', [], {}, { validation: 'no', grammar: 3 }]) expect(() => validateManifest(junk)).not.toThrow();
    expect(validateManifest({}).length).toBeGreaterThan(5);
  });
});
