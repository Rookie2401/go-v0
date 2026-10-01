/**
 * The Spanish catalogue is data. These invariants keep it honest: a rights state on every work, nothing unverified
 * presented as public domain, nothing in copyright bundlable, shelves that are never gates, one learner model
 * (one language, one course) behind every stream, and a variety policy whose active target is Honduras.
 */
import { describe, expect, it } from 'vitest';
import { COURSES, DEFAULT_ASSISTANCE, varietyStanding } from '../../src/core';
import type { Variety } from '../../src/core';
import { SPANISH_COURSE_ID, SPANISH_DOORS, SPANISH_SHELVES, SPANISH_STREAMS, SPANISH_WORKS } from '../../src/course/spanish';

const BUNDLABLE = new Set(['verified-public-domain', 'verified-open-licence', 'course-authored']);

describe('Spanish catalogue', () => {
  it('has seven available streams over one course and one language, plus listening kept as data only', () => {
    expect(SPANISH_STREAMS.filter((s) => s.available).map((s) => s.key)).toEqual(['acquisition', 'library', 'honduras', 'knowledge', 'scripture', 'mission', 'personal']);
    expect(SPANISH_STREAMS.find((s) => s.key === 'listening')?.available).toBe(false); // GoListen is deferred to V2
    for (const s of SPANISH_STREAMS) expect([s.courseId, s.lang]).toEqual([SPANISH_COURSE_ID, 'es']);
    expect(new Set(SPANISH_WORKS.map((w) => `${w.courseId}|${w.lang}`))).toEqual(new Set([`${SPANISH_COURSE_ID}|es`]));
  });

  it('shelves are an orientation: every one is a shelf with the ordinary reader, none is a gate', () => {
    expect(SPANISH_SHELVES.map((s) => s.key)).toEqual(['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7']);
    for (const s of SPANISH_SHELVES) {
      expect(s.kind, s.label).toBe('shelf');
      expect(s.assistance, s.label).toEqual(DEFAULT_ASSISTANCE);
    }
  });

  it('every work has a rights state, and only verified or course-authored text can be bundled', () => {
    expect(SPANISH_WORKS.length).toBeGreaterThan(50);
    expect(new Set(SPANISH_WORKS.map((w) => w.id)).size).toBe(SPANISH_WORKS.length);
    const shelves = new Set(SPANISH_SHELVES.map((s) => s.id));
    const streams = new Set(SPANISH_STREAMS.map((s) => s.key));
    for (const w of SPANISH_WORKS) {
      expect(w.rights.state, w.title).toBeDefined();
      expect(shelves.has(w.stageId), w.title).toBe(true);
      for (const s of w.streams ?? []) expect(streams.has(s), `${w.title}: ${s}`).toBe(true);
      expect(w.bibliographyVerified, w.title).toBe(false);
      const bundlable = BUNDLABLE.has(w.rights.state!);
      expect(w.rights.canBundle, w.title).toBe(bundlable);
      if (w.rights.state === 'verified-public-domain' || w.rights.state === 'verified-open-licence') {
        expect(w.rights.verified, w.title).toBe(true);
        expect(w.rights.verifiedBy, w.title).toBeTruthy();
        expect(w.rights.basis, w.title).toBeTruthy();
      }
      if (w.rights.state === 'rights-unverified') {
        // an old date is a lead, never a status
        expect(w.rights.copyrightStatus, w.title).not.toBe('public-domain');
        expect(w.rights.verified, w.title).toBe(false);
        expect(w.ingestion, w.title).toBe('catalogued');
      }
      if (w.rights.copyrightStatus === 'in-copyright') expect(w.rights.state, w.title).toBe('prohibited-from-bundling');
      if (w.ingestion === 'bundled') expect(bundlable, w.title).toBe(true);
    }
    // the only verified public-domain work is the one whose bundled sample was byte-verified
    expect(SPANISH_WORKS.filter((w) => w.rights.state === 'verified-public-domain').map((w) => w.id)).toEqual([`work:${SPANISH_COURSE_ID}:reina-valera-1909`]);
  });

  it('modern books are listed for the learner\'s own copy only', () => {
    for (const slug of ['riordan-ladron-del-rayo', 'rowling-piedra-filosofal', 'colfer-tierra-de-las-historias', 'tolkien-el-hobbit', 'garcia-marquez-cien-anos']) {
      const w = SPANISH_WORKS.find((x) => x.id.endsWith(`:${slug}`))!;
      expect(w.rights, slug).toMatchObject({ state: 'prohibited-from-bundling', canBundle: false, userImportOnly: true, canStoreOffline: false });
    }
  });

  it('the active target is Honduran Spanish; Spain and older Spanish are for recognition', () => {
    const course = COURSES.find((c) => c.id === SPANISH_COURSE_ID)!;
    expect(course.variety).toEqual({ target: 'es-HN', within: ['es-CA', 'es-419'], activeFeatures: ['voseo'] });
    const varieties: Record<string, Variety> = {
      'es-hist': { code: 'es-hist', label: 'older Spanish', kind: 'historical' },
      'es-ES': { code: 'es-ES', label: 'Spain', kind: 'national' },
      'es-MX': { code: 'es-MX', label: 'Mexico', kind: 'national', parent: 'es-419' },
    };
    expect(varietyStanding(undefined, course.variety, varieties)).toBe('general');
    expect(varietyStanding(['es-HN'], course.variety, varieties)).toBe('target');
    expect(varietyStanding(['voseo'], course.variety, varieties)).toBe('target');
    expect(varietyStanding(['es-419'], course.variety, varieties)).toBe('within-target');
    expect(varietyStanding(['vosotros'], course.variety, varieties)).toBe('receptive');
    expect(varietyStanding(['es-ES'], course.variety, varieties)).toBe('receptive');
    expect(varietyStanding(['es-MX'], course.variety, varieties)).toBe('receptive');
    expect(varietyStanding(['es-hist'], course.variety, varieties)).toBe('historical');
    // the catalogue marks the classics as historical Spanish, so the corpus cannot quietly become the active model
    for (const w of SPANISH_WORKS.filter((x) => ['s6', 's7'].some((k) => x.stageId.endsWith(`:${k}`)))) expect(w.variety, w.title).toBe('es-hist');
    expect(SPANISH_WORKS.filter((w) => (w.streams ?? []).includes('honduras')).length).toBeGreaterThanOrEqual(8);
  });

  it('doors are filters on one catalogue, and none of them opens the listening stream', () => {
    expect(SPANISH_DOORS.map((d) => d.label)).toEqual(['Acquisition Path', 'Honduras', 'Stories', 'Bible', 'History', 'Science & Engineering', 'Theology', 'Classics', 'Your Books']);
    expect(SPANISH_DOORS.some((d) => 'stream' in d && (d.stream as string) === 'listening')).toBe(false);
  });
});
