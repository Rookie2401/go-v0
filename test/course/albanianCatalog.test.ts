/** The Albanian manifest: stages that never lock, streams and doors that agree, and rights that claim nothing they cannot prove. */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import { readingBridgeWorks } from '../../src/course/readingBridges';
import {
  ALBANIAN_CORPUS_TARGETS, ALBANIAN_COURSE_ID, ALBANIAN_DOORS, ALBANIAN_SCRIPTURE_POLICY, ALBANIAN_STAGES, ALBANIAN_STREAMS, ALBANIAN_VARIETY_POLICY, ALBANIAN_WORKS,
} from '../../src/course/albanian';

const C = ALBANIAN_COURSE_ID;

describe('stages', () => {
  it('keys 0–9 then open, in order, with the right kinds and ids', () => {
    expect(ALBANIAN_STAGES.map((s) => s.key)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'open']);
    expect(ALBANIAN_STAGES.map((s) => s.index)).toEqual(ALBANIAN_STAGES.map((_, i) => i));
    expect(ALBANIAN_STAGES[0].kind).toBe('pre-reader');
    expect(ALBANIAN_STAGES.slice(1, 10).every((s) => s.kind === 'grade')).toBe(true);
    expect(ALBANIAN_STAGES[10].kind).toBe('open');
    expect(ALBANIAN_STAGES.every((s) => s.id === ids.stage(C, s.key) && s.courseId === C && s.lang === 'sq')).toBe(true);
  });

  it('no stage kind locks (no shelf-only or gating kind), and no stage says it gates', () => {
    expect(new Set(ALBANIAN_STAGES.map((s) => s.kind))).toEqual(new Set(['pre-reader', 'grade', 'open']));
    for (const s of ALBANIAN_STAGES.filter((x) => x.kind === 'grade' || x.kind === 'pre-reader')) {
      expect(s.purpose.join(' ')).toMatch(/nothing is locked/);
    }
  });

  it('English rescue everywhere; never romanization; no decoding engine; help removes itself', () => {
    for (const s of ALBANIAN_STAGES) {
      expect(s.assistance.layers).toContain('english');
      expect(s.assistance.romanization).toBe('never');
      expect(s.assistance.decodingFirst).toBe(false);
      expect(s.assistance.layers).not.toContain('decoding');
    }
    expect(ALBANIAN_STAGES[0].assistance.englishRescue).toBe('easy');
    expect(ALBANIAN_STAGES[0].assistance.visibility).toBe('heavy');
    expect(ALBANIAN_STAGES[9].assistance.englishRescue).toBe('on-request');
    expect(ALBANIAN_STAGES[9].assistance.visibility).toBe('invisible');
  });

  it('the Gheg bridge is for Stages 7–9, never 0–2', () => {
    const early = new Set(['0', '1', '2'].map((k) => ids.stage(C, k)));
    for (const w of ALBANIAN_WORKS.filter((x) => (x.streams ?? []).includes('gheg'))) expect(early.has(w.stageId)).toBe(false);
  });
});

describe('corpus targets', () => {
  it('cover stages 0–6 as planning data', () => {
    expect(ALBANIAN_CORPUS_TARGETS.map((t) => t.stage)).toEqual(['0', '1', '2', '3', '4', '5', '6']);
    expect(ALBANIAN_CORPUS_TARGETS[0]).toMatchObject({ minWords: 15_000, maxWords: 25_000 });
    expect(ALBANIAN_CORPUS_TARGETS[5]).toMatchObject({ minWords: 400_000, maxWords: 700_000 });
    expect(ALBANIAN_CORPUS_TARGETS[6].minWords).toBe(500_000);
    expect(ALBANIAN_CORPUS_TARGETS[6].maxWords).toBeUndefined();
    for (const t of ALBANIAN_CORPUS_TARGETS) if (t.maxWords !== undefined) expect(t.maxWords).toBeGreaterThan(t.minWords);
  });
});

describe('streams and doors', () => {
  it('the eight streams in order; listening is kept as data and unavailable', () => {
    expect(ALBANIAN_STREAMS.map((s) => s.key)).toEqual(['acquisition', 'library', 'scripture', 'mission', 'historical', 'gheg', 'personal', 'listening']);
    expect(ALBANIAN_STREAMS.map((s) => s.order)).toEqual([...ALBANIAN_STREAMS.map((s) => s.order)].sort((a, b) => a - b));
    expect(ALBANIAN_STREAMS.find((s) => s.key === 'listening')!.available).toBe(false);
    expect(ALBANIAN_STREAMS.filter((s) => s.key !== 'listening').every((s) => s.available)).toBe(true);
    expect(ALBANIAN_STREAMS.every((s) => s.id === ids.stream(C, s.key) && s.courseId === C)).toBe(true);
  });

  it('every door points at a stream that exists; none at listening', () => {
    expect(ALBANIAN_DOORS.map((d) => d.label)).toEqual(['Acquisition Path', 'Stories', 'Bible', 'Mission', 'History & Literature', 'Gheg Bridge', 'Your Books']);
    const keys = new Set(ALBANIAN_STREAMS.map((s) => s.key));
    for (const d of ALBANIAN_DOORS) {
      expect(keys.has(d.stream)).toBe(true);
      expect(d.stream).not.toBe('listening');
    }
    expect(new Set(ALBANIAN_DOORS.map((d) => d.key)).size).toBe(ALBANIAN_DOORS.length);
  });

  it('every stream named by a work exists', () => {
    const keys = new Set(ALBANIAN_STREAMS.map((s) => s.key));
    for (const w of ALBANIAN_WORKS) for (const s of w.streams ?? []) expect(keys.has(s)).toBe(true);
  });
});

describe('works', () => {
  it.each(['de', 'es', 'hi', 'sq', 'th'] as const)('normalizes %s acquired bridge records to the required Work shape', (lang) => {
    for (const work of readingBridgeWorks(lang)) {
      expect(work.lang, work.id).toBe(lang);
      expect(work.id.startsWith(`work:${work.courseId}:`), work.id).toBe(true);
      expect(work.role, work.id).toBeTruthy();
      expect(Number.isFinite(work.order), work.id).toBe(true);
      expect(work.title, work.id).toBeTruthy();
      expect(Array.isArray(work.purpose), work.id).toBe(true);
      expect(typeof work.bibliographyVerified, work.id).toBe('boolean');
      expect(work.rights.copyrightStatus, work.id).toBeTruthy();
      expect(work.rights.permission, work.id).toBeTruthy();
      expect(typeof work.rights.canBundle, work.id).toBe('boolean');
      expect(typeof work.rights.userImportOnly, work.id).toBe('boolean');
      expect(work.rights.audiobook, work.id).toBeTruthy();
      expect(typeof work.rights.verified, work.id).toBe('boolean');
    }
  });

  it('between 25 and 40 works, unique ids, every stage exists, ids derived from slugs', () => {
    expect(ALBANIAN_WORKS.length).toBeGreaterThanOrEqual(25);
    expect(ALBANIAN_WORKS.length).toBeLessThanOrEqual(40);
    expect(new Set(ALBANIAN_WORKS.map((w) => w.id)).size).toBe(ALBANIAN_WORKS.length);
    expect(new Set(ALBANIAN_WORKS.map((w) => w.order)).size).toBe(ALBANIAN_WORKS.length);
    const stageIds = new Set(ALBANIAN_STAGES.map((s) => s.id));
    for (const w of ALBANIAN_WORKS) {
      expect(stageIds.has(w.stageId)).toBe(true);
      expect(w.courseId).toBe(C);
      expect(w.lang).toBe('sq');
      expect(w.id.startsWith(`work:${C}:`)).toBe(true);
    }
  });

  it('keeps the three course-authored seed works in their controlled stages', () => {
    const bundlable = ALBANIAN_WORKS.filter((w) => w.rights.state === 'course-authored');
    expect(bundlable.map((w) => w.id.split(':')[2]).sort()).toEqual(['misioni-1', 'udha-0', 'udha-1']);
    expect(bundlable.every((w) => w.rights.state === 'course-authored' && w.rights.canBundle)).toBe(true);
    const by = (slug: string) => ALBANIAN_WORKS.find((w) => w.id === ids.work(C, slug))!;
    expect(by('udha-0').stageId).toBe(ids.stage(C, '0'));
    expect(by('udha-1').stageId).toBe(ids.stage(C, '1'));
    expect(by('misioni-1').stageId).toBe(ids.stage(C, '1'));
    expect(by('misioni-1').streams).toContain('mission');
    expect(by('udha-0').title).toBe('Udha 0 — Shkronjat dhe fjalët e para');
    expect(by('udha-1').title).toBe('Udha 1 — Familja dhe shtëpia');
    expect(by('misioni-1').title).toBe('Misioni 1 — Takime');
    for (const w of [by('udha-0'), by('udha-1'), by('misioni-1')]) {
      expect(w.ingestion).toBe('bundled');
      expect(w.genericLevel).toBe('controlled');
      expect(w.readiness).toBe('implemented');
      expect(w.notes).toMatch(/not reviewed by a native speaker/);
    }
  });

  it('keeps unverified external candidates separate from the exact licensed modern collection', () => {
    const approvedExternal = new Set([ids.work(C, 'sq-modern-open'), ids.work(C, 'sq-modern-gap-readings'), ...ALBANIAN_WORKS.filter(w => w.id.includes(':gv-')).map(w => w.id)]);
    for (const w of ALBANIAN_WORKS) {
      const r = w.rights;
      const course = r.state === 'course-authored';
      if (course || approvedExternal.has(w.id)) continue;
      expect(r.verified).toBe(false);
      expect(r.verifiedBy).toBeUndefined();
      expect(r.verifiedAt).toBeUndefined();
      expect(r.state).not.toMatch(/^verified-/);
      expect(r.state).not.toBe('permission-granted');
      expect(r.canBundle).toBe(false);
      expect(w.bibliographyVerified).toBe(false);
      expect(w.readiness).not.toBe('implemented');
      expect(w.readiness).not.toBe('verified-ready');
      expect(w.ingestion).not.toBe('bundled');
      expect(r.licence).toBeUndefined();
      expect(r.checksum).toBeUndefined();
      expect(r.statusByJurisdiction === undefined || Object.values(r.statusByJurisdiction).every((v) => v === 'unknown')).toBe(true);
    }
    const open = ALBANIAN_WORKS.filter((w) => w.rights.state?.startsWith('verified-'));
    expect(open.map((w) => w.id).sort()).toEqual([...approvedExternal].sort());
    for (const w of open) expect(w.rights).toMatchObject({ state: 'verified-open-licence', licensing: w.id.includes(':gv-') ? 'CC BY 3.0' : 'CC BY-SA 4.0', verified: true });
    expect(open.find((w) => w.id === ids.work(C, 'sq-modern-open'))?.rights).toMatchObject({ attributionRequired: true, shareAlike: true });
    expect(open.find((w) => w.id === ids.work(C, 'sq-modern-open'))?.streams).toEqual(['library']);
    expect(open.find((w) => w.id === ids.work(C, 'sq-modern-gap-readings'))?.streams).toEqual(['library']);
  });

  it('the states used are the expected ones, and a modern book is the learner\'s own copy only', () => {
    const allowed = new Set(['course-authored', 'rights-unverified', 'prohibited-from-bundling', 'verified-open-licence']);
    for (const w of ALBANIAN_WORKS) expect(allowed.has(w.rights.state!)).toBe(true);
    for (const w of ALBANIAN_WORKS.filter((x) => x.rights.state === 'prohibited-from-bundling')) {
      expect(w.rights.userImportOnly).toBe(true);
      expect(w.rights.copyrightStatus).toBe('in-copyright');
      expect(w.readiness).toBe('recommendation');
      expect(w.streams).toContain('personal');
    }
    for (const w of ALBANIAN_WORKS.filter((x) => x.rights.state === 'rights-unverified')) expect(w.readiness).toBe('candidate');
    expect(ALBANIAN_WORKS.filter((w) => w.rights.state === 'prohibited-from-bundling').map((w) => w.author)).toEqual(
      expect.arrayContaining(['Ismail Kadare', 'Dritëro Agolli', 'Petro Marko']));
  });

  it('every old-work candidate carries the one-sentence caution', () => {
    const old = ALBANIAN_WORKS.filter((w) => w.rights.state === 'rights-unverified' && w.id !== ids.work(C, 'bibla-alb'));
    expect(old.length).toBeGreaterThan(15);
    for (const w of old) {
      const text = `${w.rights.acquisitionNotes ?? ''} ${w.notes ?? ''}`;
      expect(text).toMatch(/life plus 70 years/);
      expect(text).toMatch(/United States status/);
      expect(text).toMatch(/modern edition, transcription or modernised spelling may carry its own rights/);
      expect(text).toMatch(/Wikisource is a place to find a text, not a verification/);
    }
  });

  it('the leads recorded: death years of the authors', () => {
    const died = (slug: string) => ALBANIAN_WORKS.find((w) => w.id === ids.work(C, slug))!.authorDied;
    expect(died('kristoforidhi-dhjata-e-re-gheg')).toBe(1895);
    expect(died('kristoforidhi-dhjata-e-re-tosk')).toBe(1895);
    expect(died('naim-frasheri-lulet-e-veres')).toBe(1900);
    expect(died('sami-frasheri-shqiperia')).toBe(1904);
    expect(died('de-rada-milosao')).toBe(1903);
    expect(died('vasa-bardha-e-temalit')).toBe(1892);
    expect(died('mjeda-juvenilia')).toBe(1937);
    expect(died('fishta-lahuta-e-malcis')).toBe(1940);
    expect(died('cajupi-baba-tomorri')).toBe(1930);
    expect(died('konica-albania-periodical')).toBe(1942);
    expect(died('migjeni-vargje-te-lira')).toBe(1938);
    expect(died('asdreni-rreze-dielli')).toBe(1947);
    expect(died('noli-historia-e-skenderbeut')).toBe(1965);
    // the modern authors carry no lead at all
    for (const w of ALBANIAN_WORKS.filter((x) => x.rights.state === 'prohibited-from-bundling')) expect(w.authorDied).toBeUndefined();
  });

  it('varieties used by the manifest are codes the adapter defines', () => {
    const known = new Set(['sq', 'aln', 'aln-XK', 'aln-AL', 'als', 'aae', 'aat', 'sq-hist', 'sq-pre1972', 'sq-pre1908']);
    for (const w of ALBANIAN_WORKS) if (w.variety !== undefined) expect(known.has(w.variety)).toBe(true);
    const by = (slug: string) => ALBANIAN_WORKS.find((w) => w.id === ids.work(C, slug))!;
    expect(by('fishta-lahuta-e-malcis').variety).toBe('aln');
    expect(by('mjeda-juvenilia').variety).toBe('aln');
    expect(by('migjeni-vargje-te-lira').variety).toBe('aln');
    expect(by('de-rada-milosao').variety).toBe('aae');
  });

  it('Noli is flagged as not near the public domain', () => {
    const w = ALBANIAN_WORKS.find((x) => x.id === ids.work(C, 'noli-historia-e-skenderbeut'))!;
    expect(w.rights.state).toBe('rights-unverified');
    expect(w.rights.basis).toMatch(/NOT a candidate for early verification/);
  });
});

describe('the ALB Bible record', () => {
  const alb = ALBANIAN_WORKS.find((w) => w.id === ids.work(C, 'bibla-alb'))!;

  it('is a rights-unverified candidate with US status unknown and no translator, society or year', () => {
    expect(alb.rights.state).toBe('rights-unverified');
    expect(alb.rights.statusByJurisdiction).toEqual({ US: 'unknown' });
    expect(alb.rights.jurisdiction).toBe('not established');
    expect(alb.rights.verified).toBe(false);
    expect(alb.rights.canBundle).toBe(false);
    expect(alb.readiness).toBe('candidate');
    expect(alb.bibliographyVerified).toBe(false);
    expect(alb.translator).toBeUndefined();
    expect(alb.publisher).toBeUndefined();
    expect(alb.publicationYear).toBeUndefined();
    expect(alb.edition).toBeUndefined();
    expect(alb.sourceUrl).toBeUndefined();
    expect(alb.streams).toContain('scripture');
  });

  it('its evidence states what the page said and what is missing', () => {
    const e = (alb.rights.evidence ?? []).join('\n');
    expect(e).toMatch(/public domain in the United States/);
    expect(e).toMatch(/no further information/);
    expect(e).toMatch(/MISSING: which edition/);
    expect(e).toMatch(/MISSING: the status of the text outside the United States/);
    expect(e).toMatch(/modify, annotated?|modified, annotated/);
  });
});

describe('variety policy and Scripture policy', () => {
  it('the target is Standard Albanian with nothing wider', () => {
    expect(ALBANIAN_VARIETY_POLICY).toEqual({ target: 'sq', within: [] });
  });

  it('Scripture policy: the candidate, what must be established, what is not approved, English rescue, historical', () => {
    const p = ALBANIAN_SCRIPTURE_POLICY;
    expect(p.candidate.status).toBe('candidate-unverified');
    expect(p.candidate.workSlug).toBe('bibla-alb');
    expect(p.candidate.canBundleText).toBe(false);
    expect(p.candidate.mustEstablish.join(' ')).toMatch(/edition and its publisher/);
    expect(p.candidate.mustEstablish.join(' ')).toMatch(/translator/);
    expect(p.candidate.mustEstablish.join(' ')).toMatch(/United States and in the source country/);
    expect(p.candidate.mustEstablish.join(' ')).toMatch(/modify, annotate and store/);
    expect(p.notApproved.join(' ')).toMatch(/no Albanian Bible text is bundled/);
    expect(p.notApproved.join(' ')).toMatch(/bible-1john-1\.json/);
    expect(p.notApproved.join(' ')).toMatch(/never ships/);
    expect(p.englishRescue.name).toBe('World English Bible');
    expect(p.historical.name).toMatch(/Kristoforidhi/);
    expect(p.historical.use).toBe('historical and Gheg study only');
    expect(p.historical.canBundleText).toBe(false);
    for (const slug of p.historical.workSlugs) expect(ALBANIAN_WORKS.some((w) => w.id === ids.work(C, slug))).toBe(true);
  });
});
