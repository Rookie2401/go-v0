/**
 * The rights gate keeps three facts apart: the wording is the source's wording (source fidelity), the catalogue records
 * who established the rights state and when, and for which jurisdictions that basis was recorded. A wording
 * verification is never legal clearance; a statement for one country is never a statement for another.
 */
import { describe, expect, it } from 'vitest';
import type { Plugin } from 'vite';
import { rightsGate } from '../../server/rightsGate';
import * as course from '../../src/course';
import { loadBundledCorpus } from '../../src/ingest';
import { bundleDecision, recordedJurisdictions, type RightsContext, type WorkRightsRecord } from '../../src/ingest/rights';
import { catalogueWorks, parseRelease, rightsContext, workBySlug } from '../../src/ingest/rightsCatalogue';

const verification = { against: 'eBible.org deu1912', checkedAt: '2026-10-01', method: 'byte-comparison', by: 'scripts/verify-scripture.mjs' };
const scripture = (work?: string, rights = 'public-domain') => ({
  id: 's', lang: 'de', contentType: 'scripture',
  source: { rights, licenseNote: 'x', attribution: 'y' },
  scripture: { translationId: 'deu1912', edition: 'Luther 1912', verification },
  ...(work ? { work: { slug: work } } : {}),
});
const book = (work: string, rights = 'public-domain') => ({ id: 'b', lang: 'de', contentType: 'story', source: { rights, licenseNote: 'x', attribution: 'y' }, work: { slug: work } });
const ctx = (record: WorkRightsRecord | undefined, release?: string[]): RightsContext => ({ work: () => record, ...(release ? { release } : {}) });
const verified = (statusByJurisdiction?: Record<string, string>): WorkRightsRecord =>
  ({ state: 'verified-public-domain', verifiedBy: 'A. Reviewer', verifiedAt: '2026-10-01', ...(statusByJurisdiction ? { statusByJurisdiction } : {}) });

describe('a wording verification is source fidelity, not legal clearance', () => {
  it('Scripture that names its work is held to the catalogue\'s rights record, like any other text', () => {
    // identical, verified wording — and still not bundled when the catalogue does not vouch for the rights
    expect(bundleDecision(scripture('luther'), ctx(undefined)).verdict).toBe('refuse');
    expect(bundleDecision(scripture('luther'), ctx({ state: 'rights-unverified' })).verdict).toBe('refuse');
    expect(bundleDecision(scripture('luther'), ctx({ state: 'prohibited-from-bundling' })).verdict).toBe('refuse');
    expect(bundleDecision(scripture('luther'), ctx({ state: 'verified-public-domain' })).verdict).toBe('refuse'); // verified by nobody
    expect(bundleDecision(scripture('luther'), ctx(verified())).verdict).toBe('bundle');
  });

  it('Scripture without verified wording is refused whatever the catalogue says', () => {
    const d = { ...scripture('luther'), scripture: { translationId: 'deu1912', edition: 'Luther 1912' } };
    expect(bundleDecision(d, ctx(verified({ US: 'public-domain' }))).verdict).toBe('refuse');
  });

  it('states the three facts apart', () => {
    const d = bundleDecision(scripture('luther'), ctx(verified({ US: 'public-domain', DE: 'public-domain' })));
    expect(d.facts?.wording).toMatch(/wording verified against eBible\.org deu1912 on 2026-10-01/);
    expect(d.facts?.rights).toMatch(/work "luther" is verified-public-domain, verified by A\. Reviewer on 2026-10-01/);
    expect(d.facts?.jurisdictions).toBe('US, DE');
    expect(d.reason).toMatch(/wording verified/);
    expect(d.reason).toMatch(/verified by A\. Reviewer/);
    // a book has no wording record; its rights record is still stated
    const b = bundleDecision(book('grimm'), ctx(verified()));
    expect(b.facts?.wording).toBeUndefined();
    expect(b.facts?.jurisdictions).toBe('none recorded');
  });

  it('Scripture that names no work says that no rights record was consulted', () => {
    const d = bundleDecision(scripture(), ctx(verified()));
    expect(d.verdict).toBe('bundle');
    expect(d.reason).toMatch(/no rights record was consulted/);
    expect(d.facts?.jurisdictions).toBe('none recorded');
    // without a catalogue at all (the plain build plugin) the reason says where the record is checked
    expect(bundleDecision(scripture('luther')).reason).toMatch(/checked by npm run rights:check/);
  });
});

describe('a statement for one jurisdiction is not a statement for another', () => {
  it('a build that names its jurisdictions leaves out a text with no recorded basis for one of them', () => {
    const usOnly = verified({ US: 'public-domain' });
    expect(bundleDecision(scripture('luther'), ctx(usOnly)).verdict).toBe('bundle'); // no release list: no claim, nothing left out
    expect(bundleDecision(scripture('luther'), ctx(usOnly, ['US'])).verdict).toBe('bundle');
    const de = bundleDecision(scripture('luther'), ctx(usOnly, ['US', 'DE', 'EU']));
    expect(de.verdict).toBe('exclude');
    expect(de.reason).toMatch(/no rights basis is recorded for DE, EU/);
    expect(bundleDecision(book('grimm'), ctx(usOnly, ['DE'])).verdict).toBe('exclude');
    expect(bundleDecision(scripture('luther'), ctx(verified({ US: 'public-domain', DE: 'public-domain', EU: 'public-domain' }), ['US', 'DE', 'EU'])).verdict).toBe('bundle');
  });

  it('"unknown" and "in-copyright" are not a basis; no record at all is not a basis', () => {
    expect(bundleDecision(book('x'), ctx(verified({ DE: 'unknown' }), ['DE'])).verdict).toBe('exclude');
    expect(bundleDecision(book('x'), ctx(verified({ DE: 'in-copyright' }), ['DE'])).verdict).toBe('exclude');
    expect(bundleDecision(book('x'), ctx(verified(), ['DE'])).verdict).toBe('exclude');
    expect(recordedJurisdictions(verified({ DE: 'unknown', US: 'public-domain', FR: 'licensed' }))).toEqual(['US', 'FR']);
  });

  it('a licence granted for everywhere may be recorded once ("*"); a named jurisdiction overrides it', () => {
    const everywhere: WorkRightsRecord = { state: 'verified-open-licence', verifiedBy: 'A. Reviewer', verifiedAt: '2026-10-01', statusByJurisdiction: { '*': 'licensed' } };
    expect(bundleDecision(book('irv', 'licensed'), ctx(everywhere, ['US', 'IN', 'DE'])).verdict).toBe('bundle');
    expect(bundleDecision(book('irv', 'licensed'), ctx({ ...everywhere, statusByJurisdiction: { '*': 'licensed', DE: 'unknown' } }, ['US', 'DE'])).verdict).toBe('exclude');
  });

  it('Scripture that names no work has no jurisdiction on record: left out of a build that names its jurisdictions', () => {
    expect(bundleDecision(scripture(), ctx(verified({ DE: 'public-domain' }), ['DE'])).verdict).toBe('exclude');
  });

  it('what was written for the course is never left out on this ground', () => {
    const authored = { id: 'a', lang: 'de', contentType: 'story', source: { rights: 'owner-authored' }, work: { slug: 'weg-1' } };
    expect(bundleDecision(authored, ctx({ state: 'course-authored' }, ['US', 'DE', 'EU'])).verdict).toBe('bundle');
  });

  it('reads the release list from "US, DE ,EU"; empty means no claim', () => {
    expect(parseRelease('US, DE ,EU')).toEqual(['US', 'DE', 'EU']);
    expect(parseRelease('')).toBeUndefined();
    expect(parseRelease(undefined)).toBeUndefined();
  });
});

describe('the German catalogue under the rule', () => {
  const works = catalogueWorks(course as Record<string, unknown>);
  const find = workBySlug(works);
  const docs = loadBundledCorpus().filter((d) => d.lang === 'de');

  it('every German Scripture document names its work, so its rights record is consulted', () => {
    const scriptures = docs.filter((d) => d.contentType === 'scripture');
    expect(scriptures.length).toBe(5);
    for (const d of scriptures) expect((d as { work?: { slug?: string } }).work?.slug, d.id).toBe('lutherbibel-1912');
  });

  it('Luther 1912 and the Grimm tales record their verified US, German and EU status and exact source evidence', () => {
    for (const slug of ['lutherbibel-1912', 'grimm-sternthaler-1857', 'grimm-der-suesse-brei-1857']) {
      const w = find('de', slug)!;
      expect(w, slug).toBeDefined();
      expect(recordedJurisdictions({ statusByJurisdiction: w.rights.statusByJurisdiction }).sort(), slug).toEqual(['DE', 'EU', 'US']);
      expect(w.rights.verifiedBy, slug).toBeTruthy();
      expect(w.rights.sourceRepository, slug).toBeTruthy();
      expect(w.rights.evidence?.length ?? 0, slug).toBeGreaterThanOrEqual(2);
    }
    const luther = find('de', 'lutherbibel-1912')!.rights;
    expect(luther.sourceRepository).toContain('deu1912_usfm.zip');
    expect(luther.evidence!.join(' ')).toContain('deu1912/copyright.htm');
    // No claim is made for unrecorded countries even though the listed source editions are cleared in these three.
    expect(luther.statusByJurisdiction).not.toHaveProperty('AT');
    expect(luther.statusByJurisdiction).not.toHaveProperty('CH');
  });

  it('with the release list US, DE, EU the German documents that are bundled today are still bundled; for a jurisdiction nobody recorded they are not', () => {
    const claims = docs.filter((d) => d.source.rights === 'public-domain' || d.source.rights === 'licensed');
    expect(claims.length).toBe(7);
    const release = (list: string[]) => rightsContext(course as Record<string, unknown>, list);
    for (const d of claims) expect(bundleDecision(d, release(['US', 'DE', 'EU'])).verdict, d.id).toBe('bundle');
    for (const d of claims) expect(bundleDecision(d, release(['US', 'CH'])).verdict, d.id).toBe('exclude');
    // the course's own texts are untouched by the release list
    for (const d of docs.filter((x) => x.source.rights === 'owner-authored')) expect(bundleDecision(d, release(['CH'])).verdict, d.id).toBe('bundle');
  });
});

describe('the build plugin with a release list', () => {
  it('consults the catalogue and leaves out a text with no recorded basis for a release jurisdiction', async () => {
    const plugin = rightsGate({ release: ['US', 'CH'] }) as Plugin & { buildStart: (this: unknown) => Promise<void>; transform: (this: unknown, code: string, id: string) => unknown };
    const self = { error: (m: string) => { throw new Error(m); }, warn: () => undefined };
    await plugin.buildStart.call(self);
    const doc = loadBundledCorpus().find((d) => d.lang === 'de' && d.id === 'bible-psa-23')!;
    expect(plugin.transform.call(self, JSON.stringify(doc), '/repo/data/corpus/de/bible-psa-23.json')).toEqual({ code: 'null', map: null });
    const ok = rightsGate({ release: ['US', 'DE', 'EU'] }) as typeof plugin;
    await ok.buildStart.call(self);
    expect(ok.transform.call(self, JSON.stringify(doc), '/repo/data/corpus/de/bible-psa-23.json')).toBeNull();
  });
});
