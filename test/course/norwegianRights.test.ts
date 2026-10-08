/**
 * Norwegian rights (docs/norway/SPEC.md section 8): every entry of the Norwegian course manifest and every work in NORWEGIAN_WORKS is
 * 'rights-unverified' unless a HUMAN named it verified with a date; nothing unverified claims it can be bundled; every unverified
 * entry carries its evidence; and the rights gate keeps an unverified Norwegian work out of a build. Nothing here marks a work verified.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as course from '../../src/course';
import { NORWEGIAN_WORKS } from '../../src/course';
import { BUNDLABLE_WORK_STATES, bundleDecision } from '../../src/ingest/rights';
import { catalogueWorks, rightsContext } from '../../src/ingest/rightsCatalogue';

interface Evidence { kind?: string; url?: string; checkedAt?: string; by?: string }
interface Rights { state?: string; canBundle?: boolean; verified?: boolean; verifiedBy?: string; verifiedAt?: string; evidenceRecords?: Evidence[] }
interface Entry { slug: string; lang?: string; rights: Rights }

const LIBRARY_DIR = path.join('data', 'sources', 'course-library');
/** nb.json holds the course manifest (it also lists the nn leads); an nn.json would be read as well if one is added. */
const MANIFESTS = ['nb.json', 'nn.json'].filter((f) => fs.existsSync(path.join(LIBRARY_DIR, f)));
const entries: Array<{ file: string; entry: Entry }> = MANIFESTS.flatMap((file) => {
  const j = JSON.parse(fs.readFileSync(path.join(LIBRARY_DIR, file), 'utf8')) as { entries: Entry[] };
  return j.entries.map((entry) => ({ file, entry }));
});

/** A person, not a tool: a verifier whose name says it is a script, an agent or automated is no verifier. */
const AUTOMATED = /agent|tool|script|automated/i;
const isHumanVerified = (r: Rights): boolean =>
  !!r.verifiedBy?.trim() && !AUTOMATED.test(r.verifiedBy) && !!r.verifiedAt?.trim() && !Number.isNaN(Date.parse(r.verifiedAt));

describe('Norwegian catalogue manifest (data/sources/course-library)', () => {
  it('exists and lists leads', () => {
    expect(MANIFESTS).toContain('nb.json');
    expect(entries.length).toBeGreaterThan(0);
  });

  it("every entry is 'rights-unverified' unless a human verifier and a date are named", () => {
    for (const { file, entry } of entries) {
      const r = entry.rights;
      const label = `${file}:${entry.slug}`;
      if (isHumanVerified(r)) continue; // a person recorded it; the other tests still hold it to the evidence rules
      expect({ label, state: r.state }).toEqual({ label, state: 'rights-unverified' });
      expect({ label, verified: r.verified }).toEqual({ label, verified: false });
    }
  });

  it('no unverified entry says it can be bundled, and a verified state never rests on an automated verifier', () => {
    for (const { file, entry } of entries) {
      const r = entry.rights;
      const label = `${file}:${entry.slug}`;
      if (r.state === 'rights-unverified') expect({ label, canBundle: r.canBundle }).toEqual({ label, canBundle: false });
      if (r.canBundle === true) expect({ label, human: isHumanVerified(r) }).toEqual({ label, human: true });
      if (r.state && BUNDLABLE_WORK_STATES.includes(r.state) && r.state !== 'course-authored') expect({ label, human: isHumanVerified(r) }).toEqual({ label, human: true });
      if (r.verifiedBy) expect({ label, automated: AUTOMATED.test(r.verifiedBy) }).toEqual({ label, automated: false });
    }
  });

  it('every unverified entry carries evidence: at least one record with url, checkedAt and by; every record says when and by whom', () => {
    for (const { file, entry } of entries) {
      const r = entry.rights;
      if (r.state !== 'rights-unverified') continue;
      const label = `${file}:${entry.slug}`;
      const records = r.evidenceRecords ?? [];
      expect({ label, count: records.length >= 1 }).toEqual({ label, count: true });
      expect({ label, complete: records.some((e) => !!e.url?.trim() && !!e.checkedAt?.trim() && !!e.by?.trim()) }).toEqual({ label, complete: true });
      for (const [i, e] of records.entries()) {
        expect({ label, i, checkedAt: !!e.checkedAt?.trim(), by: !!e.by?.trim() }).toEqual({ label, i, checkedAt: true, by: true });
      }
    }
  });
});

describe('NORWEGIAN_WORKS (the catalogue the rights gate collects)', () => {
  it('is non-empty and holds the same slugs as the manifest', () => {
    expect(NORWEGIAN_WORKS.length).toBeGreaterThan(0);
    const slugs = new Set(NORWEGIAN_WORKS.map((w) => w.id.split(':').pop()));
    for (const { entry } of entries) expect(slugs.has(entry.slug)).toBe(true);
    expect(catalogueWorks(course as Record<string, unknown>).filter((w) => w.courseId === 'norway-nb').length).toBe(NORWEGIAN_WORKS.length);
  });

  it("every work is 'rights-unverified' unless it names a human verifier and a date; none says canBundle while unverified", () => {
    for (const w of NORWEGIAN_WORKS) {
      const r = w.rights;
      const human = isHumanVerified(r);
      if (!human) {
        expect({ id: w.id, state: r.state }).toEqual({ id: w.id, state: 'rights-unverified' });
        expect({ id: w.id, verified: r.verified, canBundle: r.canBundle }).toEqual({ id: w.id, verified: false, canBundle: false });
        expect(['bundled', 'ingested'].includes(w.ingestion ?? '')).toBe(false);
        expect({ id: w.id, readiness: w.readiness === 'implemented' || w.readiness === 'verified-ready' }).toEqual({ id: w.id, readiness: false });
      }
      if (r.verifiedBy) expect({ id: w.id, automated: AUTOMATED.test(r.verifiedBy) }).toEqual({ id: w.id, automated: false });
      if (r.state === 'rights-unverified') {
        const records = r.evidenceRecords ?? [];
        expect({ id: w.id, ok: records.some((e) => !!e.url && !!e.checkedAt && !!e.by) }).toEqual({ id: w.id, ok: true });
      }
    }
  });
});

describe('the rights gate keeps an unverified Norwegian work out of a build', () => {
  const ctx = rightsContext(course as Record<string, unknown>);
  const unverified = NORWEGIAN_WORKS.filter((w) => !isHumanVerified(w.rights));

  it('a minimal Norwegian document that claims public domain and belongs to an unverified work is not bundled', () => {
    expect(unverified.length).toBeGreaterThan(0);
    for (const w of unverified) {
      const slug = w.id.split(':').pop()!;
      const doc = { id: `doc-${slug}`, lang: w.lang, contentType: 'story', source: { rights: 'public-domain' }, work: { slug } };
      const d = bundleDecision(doc, ctx);
      expect({ slug, verdict: d.verdict }).not.toEqual({ slug, verdict: 'bundle' });
      expect(['exclude', 'refuse']).toContain(d.verdict);
      // the same with a licence claim and with a release jurisdiction named
      const lic = bundleDecision({ ...doc, source: { rights: 'licensed', licenseNote: 'CC BY-SA 4.0', attribution: 'someone' } }, rightsContext(course as Record<string, unknown>, ['NO', 'EU']));
      expect(lic.verdict).not.toBe('bundle');
    }
  });

  it('a Norwegian document with unverified rights of its own is excluded; a work that claims "written for the course" while unverified is refused', () => {
    const w = unverified[0];
    const slug = w.id.split(':').pop()!;
    expect(bundleDecision({ id: 'x', lang: 'nb', contentType: 'story', source: { rights: 'unverified' } }, ctx).verdict).toBe('exclude');
    expect(bundleDecision({ id: 'x', lang: w.lang, contentType: 'story', source: { rights: 'owner-authored' }, work: { slug } }, ctx).verdict).toBe('refuse');
  });

  it('the real Norwegian documents in data/corpus: one that names a catalogue work follows that work\'s state', () => {
    for (const lang of ['nb', 'nn']) {
      const dir = path.join('data', 'corpus', lang);
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
        const doc = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as { id?: string; source?: { rights?: string }; work?: { slug?: string } };
        const slug = doc.work?.slug;
        if (!slug) continue;
        const work = NORWEGIAN_WORKS.find((x) => x.lang === lang && x.id.endsWith(`:${slug}`));
        expect({ file: `${lang}/${name}`, inCatalogue: !!work }).toEqual({ file: `${lang}/${name}`, inCatalogue: true });
        if (work && !isHumanVerified(work.rights)) expect({ file: `${lang}/${name}`, verdict: bundleDecision(doc, ctx).verdict }).not.toEqual({ file: `${lang}/${name}`, verdict: 'bundle' });
      }
    }
  });
});
