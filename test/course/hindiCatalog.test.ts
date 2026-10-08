/**
 * The Hindi catalogue (package H5): shelves that never lock, streams, assistance that thins out, and a catalogue of
 * works in which every rights state is a recorded fact or an honest "unverified". The exports are imported straight
 * from src/course/hindi.ts (the coordinator registers them elsewhere).
 */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import type { RightsState } from '../../src/core';
import {
  HINDI_ASSISTANCE, HINDI_COURSE_ID, HINDI_DOORS, HINDI_OUTSIDE_SHELVES, HINDI_SHELVES, HINDI_STREAMS, HINDI_WORKS,
} from '../../src/course/hindi';

const C = HINDI_COURSE_ID;
const RIGHTS_STATES: RightsState[] = [
  'verified-public-domain', 'verified-open-licence', 'permission-granted', 'course-authored', 'recommended-only', 'user-supplied', 'rights-unverified', 'prohibited-from-bundling',
];
const HERITAGE_VARIETIES = ['awa', 'bra', 'hi-sant'];
const EARLY = ['s0a', 's0b', 's0c', 'c1', 'c2'];
const keyOf = (stageId: string) => stageId.slice(`stage:${C}:`.length);

describe('shelves: an orientation, never a lock', () => {
  it('are ordered, all of kind shelf, and run Stage 0A–0C, Classes 1–12, Open Reading', () => {
    expect(HINDI_SHELVES.map((s) => s.key)).toEqual(['s0a', 's0b', 's0c', ...Array.from({ length: 12 }, (_, i) => `c${i + 1}`), 'open']);
    expect(HINDI_SHELVES.map((s) => s.index)).toEqual(HINDI_SHELVES.map((_, i) => i));
    for (const s of HINDI_SHELVES) {
      expect(s.kind, s.key).toBe('shelf');
      expect(s.courseId).toBe(C);
      expect(s.lang).toBe('hi');
      expect(s.id).toBe(ids.stage(C, s.key));
      expect(s.purpose.length, s.key).toBeGreaterThan(0);
      expect(s.band, `${s.key}: no CEFR band is attached to a shelf`).toBeUndefined();
    }
    expect(new Set(HINDI_SHELVES.map((s) => s.id)).size).toBe(HINDI_SHELVES.length);
  });

  it('every class shelf says in its purpose that it is not an Indian school grade', () => {
    for (const s of HINDI_SHELVES.filter((x) => /^c\d+$/.test(x.key))) {
      expect(s.purpose.join(' '), s.key).toMatch(/not an Indian school grade/);
    }
    // and nothing names a school year as a level
    for (const s of HINDI_SHELVES) expect(s.label, s.key).not.toMatch(/grade|standard|CEFR|[ABC][12]\b/i);
  });

  it('each shelf has an assistance profile of its own', () => {
    expect(Object.keys(HINDI_ASSISTANCE).sort()).toEqual(HINDI_SHELVES.map((s) => s.key).sort());
    for (const s of HINDI_SHELVES) expect(s.assistance, s.key).toBe(HINDI_ASSISTANCE[s.key]);
  });
});

describe('assistance: the system removes itself, English rescue never does', () => {
  it('Stage 0 is heavy and decoding comes first; romanization is a rescue only on the earliest shelves', () => {
    for (const k of ['s0a', 's0b', 's0c']) {
      const a = HINDI_ASSISTANCE[k];
      expect(a.visibility, k).toBe('heavy');
      expect(a.decodingFirst, k).toBe(true);
      expect(a.englishRescue, k).toBe('easy');
      expect(a.layers[0], k).toBe('gloss');
      expect(a.layers, k).toContain('decoding');
    }
    const rescue = HINDI_SHELVES.filter((s) => s.assistance.romanization === 'rescue').map((s) => s.key);
    expect(rescue).toEqual(EARLY); // through Class 2 at most
    for (const s of HINDI_SHELVES.filter((x) => !EARLY.includes(x.key))) {
      expect(s.assistance.romanization, s.key).toBe('never');
      expect(s.assistance.decodingFirst, s.key).toBe(false);
    }
  });

  it('English rescue is in every profile; it is easy first and on request by the last shelves', () => {
    for (const s of HINDI_SHELVES) expect(s.assistance.layers, s.key).toContain('english');
    const rank = { heavy: 0, contextual: 1, light: 2, clean: 3, invisible: 4 } as const;
    const ranks = HINDI_SHELVES.map((s) => rank[s.assistance.visibility]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b)); // never gets heavier again
    for (const k of ['c9', 'c10', 'c11', 'c12', 'open']) {
      expect(['clean', 'invisible'], k).toContain(HINDI_ASSISTANCE[k].visibility);
      expect(HINDI_ASSISTANCE[k].englishRescue, k).toBe('on-request');
    }
    for (const k of ['c11', 'c12', 'open']) expect(HINDI_ASSISTANCE[k].visibility, k).toBe('invisible');
    expect(HINDI_ASSISTANCE.open.chrome).toBe('minimal');
  });
});

describe('streams', () => {
  it('are in order, with the audio stream kept as data but unavailable', () => {
    expect(HINDI_STREAMS.map((s) => s.key)).toEqual(['acquisition', 'children', 'literature', 'knowledge', 'heritage', 'scripture', 'mission', 'personal', 'listening']);
    expect(HINDI_STREAMS.map((s) => s.order)).toEqual(HINDI_STREAMS.map((_, i) => i));
    expect(HINDI_STREAMS.find((s) => s.key === 'listening')!.available).toBe(false);
    expect(HINDI_STREAMS.filter((s) => s.key !== 'listening').every((s) => s.available)).toBe(true);
    expect(HINDI_STREAMS.find((s) => s.key === 'listening')!.kind).toBe('listening');
    expect(HINDI_STREAMS.find((s) => s.key === 'heritage')!.kind).toBe('library');
    expect(HINDI_STREAMS.find((s) => s.key === 'children')!.kind).toBe('library');
    for (const s of HINDI_STREAMS) {
      expect(s.id).toBe(ids.stream(C, s.key));
      expect(s.courseId).toBe(C);
    }
  });
});

describe('works: identity and placement', () => {
  it('have unique ids, slugs and order, and each sits on an existing shelf and in existing streams', () => {
    expect(new Set(HINDI_WORKS.map((w) => w.id)).size).toBe(HINDI_WORKS.length);
    expect(new Set(HINDI_WORKS.map((w) => w.order)).size).toBe(HINDI_WORKS.length);
    const shelves = new Set(HINDI_SHELVES.map((s) => s.id));
    const streams = new Set(HINDI_STREAMS.map((s) => s.key));
    for (const w of HINDI_WORKS) {
      expect(w.id, w.title).toBe(ids.work(C, w.id.slice(`work:${C}:`.length)));
      expect(w.courseId).toBe(C);
      expect(w.lang).toBe('hi');
      expect(shelves.has(w.stageId), `${w.title}: shelf ${w.stageId}`).toBe(true);
      expect(w.streams?.length, w.title).toBeGreaterThan(0);
      for (const s of w.streams ?? []) expect(streams.has(s), `${w.title}: stream ${s}`).toBe(true);
      expect(w.title.trim().length).toBeGreaterThan(0);
    }
  });

  it('holds the three course series, one per Stage 0 band, as the spine of its shelf', () => {
    for (const [slug, shelfKey] of [['pehli-kahaniyan-0a', 's0a'], ['pehli-kahaniyan-0b', 's0b'], ['pehli-kahaniyan-0c', 's0c']] as const) {
      const w = HINDI_WORKS.find((x) => x.id === ids.work(C, slug))!;
      expect(w, slug).toBeDefined();
      expect(w.stageId).toBe(ids.stage(C, shelfKey));
      expect(w.role).toBe('spine');
      expect(w.streams).toEqual(['acquisition']);
      expect(w.genericLevel).toBe('controlled');
    }
  });

  it('bibliography is never marked verified: nothing invented, nothing checked', () => {
    for (const w of HINDI_WORKS.filter(w => !w.id.includes(':gv-'))) {
      expect(w.bibliographyVerified, w.title).toBe(['premchand-panch-parameshwar', 'premchand-namak-ka-daroga'].some((slug) => w.id === ids.work(C, slug)));
      expect(w.isbn, w.title).toBeUndefined();
      expect(w.translator, `${w.title}: a translator is recorded only when certain`).toBeUndefined();
    }
  });
});

describe('works: rights are recorded facts, never inferences', () => {
  it('every work has exactly one rights state, from the known set', () => {
    for (const w of HINDI_WORKS) {
      expect(w.rights.state, w.title).toBeDefined();
      expect(RIGHTS_STATES, w.title).toContain(w.rights.state);
    }
  });

  it('only course-authored works and the one verified licensed text (the Bible) are bundlable or bundled; everything else is the learner\'s own copy or not yet decided', () => {
    for (const w of HINDI_WORKS) {
      const own = w.rights.state === 'course-authored' || w.rights.state === 'verified-open-licence' || w.rights.state === 'verified-public-domain';
      expect(w.rights.canBundle, w.title).toBe(own);
      // everything not bundled is the learner's own copy to bring — except NCERT's readers, whose terms rule out use inside software
      expect(w.rights.userImportOnly, w.title).toBe(!own && w.publisher !== 'NCERT');
      const installedSources = ['bharatendu-andher-nagari', 'gdl-hindi-ccby', 'gdl-hindi-ccby-c2', 'gdl-hindi-ccby-c3', 'gdl-hindi-ccby-c4', 'premchand-panch-parameshwar', 'premchand-namak-ka-daroga', 'gv-hi-467925c35d73-excerpt'].map((slug) => ids.work(C, slug));
      const expectedIngestion = installedSources.includes(w.id) ? 'ingested' : 'bundled';
      expect(w.ingestion === expectedIngestion, w.title).toBe(own);
      expect(w.ingestion === 'ingested', w.title).toBe(installedSources.includes(w.id));
      if (!own) {
        expect(w.rights.verified, w.title).toBe(false);
        expect(w.rights.canStoreOffline, w.title).toBe(false);
      }
    }
    // the GDL books stand on Classes 1-4 as four works (scripts/prepare-hi-gdl-collection.mts), so a book is on its work's shelf
    expect(HINDI_WORKS.filter((w) => w.rights.canBundle)).toHaveLength(12);
    expect(HINDI_WORKS.filter((w) => w.rights.state === 'verified-open-licence').map((w) => w.id).sort()).toEqual([ids.work(C, 'bible-hindi'), ids.work(C, 'gdl-hindi-ccby'), ids.work(C, 'gdl-hindi-ccby-c2'), ids.work(C, 'gdl-hindi-ccby-c3'), ids.work(C, 'gdl-hindi-ccby-c4'), ids.work(C, 'gv-hi-467925c35d73-excerpt')].sort());
  });

  it('no work claims public domain, and a licence is named only where its evidence is recorded: age is a lead, never a conclusion', () => {
    for (const w of HINDI_WORKS) {
      const verified = w.rights.state === 'verified-open-licence' || w.rights.state === 'verified-public-domain';
      if (!['bharatendu-andher-nagari', 'premchand-panch-parameshwar', 'premchand-namak-ka-daroga'].some((slug) => w.id === ids.work(C, slug))) expect(['verified-public-domain', 'permission-granted'], w.title).not.toContain(w.rights.state);
      if (!verified) expect(w.rights.copyrightStatus, w.title).not.toBe('public-domain');
      expect(w.rights.licence === undefined, w.title).toBe(!verified);
      expect(w.rights.verifiedBy === undefined, w.title).toBe(w.rights.state !== 'course-authored' && !verified);
      if (w.rights.state !== 'course-authored' && !verified) expect(w.rights.licensing, w.title).toBeUndefined();
      // a licence may be NAMED only beside recorded evidence (what a source page states, with where and when)
      if (!w.rights.evidence?.length) expect(`${w.rights.basis ?? ''} ${w.notes ?? ''}`, w.title).not.toMatch(/CC[- ]BY|creative commons/i);
      // the Bible's note says "not a public-domain one"; nothing else mentions the public domain at all
      if (!verified) expect(`${w.rights.basis ?? ''} ${w.notes ?? ''}`, w.title).not.toMatch(/public[- ]domain/i);
    }
  });

  it('the readiness word agrees with the rights state', () => {
    for (const w of HINDI_WORKS) {
      const expected = w.rights.state === 'course-authored' || w.rights.state === 'verified-open-licence' || w.rights.state === 'verified-public-domain' ? 'implemented' : w.rights.state === 'rights-unverified' ? 'candidate' : 'recommendation';
      expect(w.readiness, w.title).toBe(expected);
      expect(['verified-ready']).not.toContain(w.readiness);
    }
  });

  it('the course series say that the text is machine-drafted and unreviewed', () => {
    for (const slug of ['pehli-kahaniyan-0a', 'pehli-kahaniyan-0b', 'pehli-kahaniyan-0c']) {
      const w = HINDI_WORKS.find((x) => x.id === ids.work(C, slug))!;
      expect(w.rights.state).toBe('course-authored');
      expect(w.rights.basis).toMatch(/machine-drafted/);
      expect(w.rights.basis).toMatch(/not reviewed by a native speaker/);
      expect(w.notes).toMatch(/not reviewed by a native speaker/);
    }
  });

  it('a date of death is carried as a lead with the edition caveat, and a modern author is never presented as old', () => {
    for (const w of HINDI_WORKS.filter((x) => x.rights.state === 'rights-unverified' && x.authorDied !== undefined)) {
      expect(w.rights.basis, w.title).toMatch(new RegExp(`died in ${w.authorDied}`));
      expect(w.rights.basis, w.title).toMatch(/lead for verification, not a conclusion/);
      expect(w.rights.basis, w.title).toMatch(/India and the United States/);
    }
    for (const w of HINDI_WORKS.filter((x) => x.rights.state === 'prohibited-from-bundling')) {
      expect(w.rights.copyrightStatus, w.title).toBe('in-copyright');
      expect(w.rights.permission, w.title).toBe('none');
    }
  });
});

describe('works: the entries the brief names', () => {
  const byId = (slug: string) => HINDI_WORKS.find((w) => w.id === ids.work(C, slug))!;

  it('StoryWeaver is one collection entry: unverified, a candidate, no generic level, per-story licence still to be checked', () => {
    const sw = HINDI_WORKS.filter((w) => /StoryWeaver/i.test(w.title));
    expect(sw).toHaveLength(1);
    expect(sw[0].rights.state).toBe('rights-unverified');
    expect(sw[0].readiness).toBe('candidate');
    expect(sw[0].genericLevel).toBeUndefined();
    expect(sw[0].rights.acquisitionNotes).toMatch(/licence of EACH story/);
    expect(sw[0].rights.acquisitionNotes).toMatch(/attribution/);
    expect(sw[0].rights.acquisitionNotes).toMatch(/lawful way of access at scale/);
  });

  it('Premchand: fifteen stories and four novels, died 1936, all unverified candidates on plausible shelves', () => {
    const p = HINDI_WORKS.filter((w) => w.author === 'प्रेमचंद');
    const stories = p.filter((w) => w.genre === 'short story');
    const novels = p.filter((w) => w.genre === 'novel');
    expect(stories).toHaveLength(15);
    expect(novels.map((n) => n.title).sort()).toEqual(['गबन', 'गोदान', 'निर्मला', 'सेवासदन'].sort());
    for (const w of p) {
      expect(w.authorDied, w.title).toBe(1936);
      const acquired = ['premchand-panch-parameshwar', 'premchand-namak-ka-daroga'].some((slug) => w.id === ids.work(C, slug));
      expect(w.rights.state, w.title).toBe(acquired ? 'verified-public-domain' : 'rights-unverified');
      expect(w.readiness, w.title).toBe(acquired ? 'implemented' : 'candidate');
      if (acquired) expect(w.rights.statusByJurisdiction).toEqual({ US: 'public-domain', IN: 'public-domain' });
      expect(w.streams, w.title).toContain('literature');
    }
    for (const s of stories) expect(Number(keyOf(s.stageId).slice(1)), s.title).toBeGreaterThanOrEqual(s.rights.verified ? 5 : 6);
    for (const s of stories) expect(Number(keyOf(s.stageId).slice(1)), s.title).toBeLessThanOrEqual(9);
    for (const n of novels) expect(Number(keyOf(n.stageId).slice(1)), n.title).toBeGreaterThanOrEqual(9);
    // a publication year only where it is certain
    expect(p.filter((w) => w.publicationYear !== undefined).map((w) => w.title)).toEqual(['गोदान']);
  });

  it('other older authors are candidates; modern Hindi literature and familiar translations are never bundled', () => {
    for (const slug of ['guleri-usne-kaha-tha', 'prasad-akashdeep', 'khatri-chandrakanta', 'chauhan-jhansi-ki-rani']) {
      expect(byId(slug), slug).toBeDefined();
      expect(byId(slug).rights.state, slug).toBe('rights-unverified');
      expect(byId(slug).readiness, slug).toBe('candidate');
    }
    const andher = byId('bharatendu-andher-nagari');
    expect(andher.rights.state).toBe('verified-public-domain');
    expect(andher.rights.copyrightStatus).toBe('public-domain');
    expect(andher.rights.jurisdictions).toEqual(expect.arrayContaining(['IN', 'US']));
    expect(andher.rights.evidence?.join(' ')).toMatch(/1935|pages 543–570|Public Domain India/);
    expect(andher.ingestion).toBe('ingested');
    expect(andher.readiness).toBe('implemented');
    for (const slug of ['sahni-tamas', 'renu-maila-anchal', 'shukla-raag-darbari', 'rowling-harry-potter-1-hindi']) {
      expect(byId(slug).rights.state, slug).toBe('prohibited-from-bundling');
      expect(byId(slug).readiness, slug).toBe('recommendation');
      expect(byId(slug).rights.canBundle, slug).toBe(false);
    }
    expect(byId('rowling-harry-potter-1-hindi').notes).toMatch(/Knowing the story already makes the Hindi far easier/);
  });

  it('the Hindi Bible is one work: the Indian Revised Version, a verified LICENSED text with its evidence, never called public domain', () => {
    const b = HINDI_WORKS.filter((w) => w.role === 'scripture');
    expect(b).toHaveLength(1);
    const r = b[0].rights;
    expect(r.state).toBe('verified-open-licence');
    expect(r.copyrightStatus).toBe('licensed');
    expect(b[0].readiness).toBe('implemented');
    expect(b[0].ingestion).toBe('bundled');
    expect(b[0].streams).toEqual(['scripture']);
    expect(b[0].domains).toEqual(expect.arrayContaining(['scripture', 'theology']));
    expect(r.basis).toMatch(/Indian Revised Version/);
    expect(r.licence).toMatch(/Attribution Share-Alike license 4\.0/);
    expect(r.sourceRepository).toMatch(/eBible\.org.*hin2017/);
    expect(r.attributionRequired).toBe(true);
    expect(r.shareAlike).toBe(true);
    expect(r.verifiedBy).toBeTruthy();
    expect(r.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.evidence!.length).toBeGreaterThanOrEqual(3);
    expect(r.compliance).toMatch(/Attribution/);
    expect(r.compliance).toMatch(/Share-alike/);
    expect(r.modifications).toMatch(/footnotes/);
    expect(r.canBundleAudio).toBe(false);
  });

  it('NCERT readers are pointers only: the terms NCERT states are recorded and nothing of them is bundled, fetched or linked', () => {
    const n = HINDI_WORKS.filter((w) => w.publisher === 'NCERT');
    expect(n).toHaveLength(3);
    for (const w of n) {
      expect(w.rights.state, w.title).toBe('prohibited-from-bundling');
      expect(w.readiness, w.title).toBe('recommendation');
      expect(w.rights.canBundle, w.title).toBe(false);
      expect(w.rights.sourceTerms, w.title).toMatch(/no redistribution/);
      expect(w.rights.sourceTerms, w.title).toMatch(/no use inside software/);
      expect(w.rights.userImportOnly, w.title).toBe(false); // so the app offers no "add your copy" for it
      expect(w.sourceUrl, w.title).toBeUndefined();
    }
  });
});

describe('works: heritage languages are not Modern Standard Hindi', () => {
  const heritage = HINDI_WORKS.filter((w) => w.streams?.includes('heritage'));

  it('every heritage work has a heritage variety, is never a spine, and sits on no class shelf', () => {
    expect(heritage.map((w) => w.variety).sort()).toEqual([...HERITAGE_VARIETIES].sort());
    for (const w of heritage) {
      expect(HERITAGE_VARIETIES, w.title).toContain(w.variety);
      expect(w.role, w.title).not.toBe('spine');
      expect(keyOf(w.stageId), w.title).toBe('open');
      expect(w.rights.state, w.title).toBe('rights-unverified');
      expect(w.readiness, w.title).toBe('candidate');
    }
    const byVariety = Object.fromEntries(heritage.map((w) => [w.variety, w.title]));
    expect(byVariety).toEqual({ awa: 'रामचरितमानस', bra: 'सूरसागर (चयन)', 'hi-sant': 'कबीर के दोहे' });
  });

  it('only heritage works carry a variety tag; Modern Standard Hindi carries none; no heritage work is on a Stage 0 or class shelf', () => {
    for (const w of HINDI_WORKS) {
      if (w.streams?.includes('heritage')) continue;
      if(w.id.includes(':gv-')) { expect(w.variety).toBe('hi-IN'); continue; }
      expect(w.variety, w.title).toBeUndefined();
    }
    const spineShelves = HINDI_WORKS.filter((w) => w.role === 'spine').map((w) => keyOf(w.stageId));
    expect(spineShelves.sort()).toEqual(['s0a', 's0b', 's0c']);
  });
});

describe('works: domains', () => {
  it('use only the course\'s domain words', () => {
    const allowed = new Set(['daily-life', 'family', 'food', 'travel', 'hospitality', 'school', 'work', 'church', 'scripture', 'theology', 'testimony', 'evangelism', 'prayer', 'pastoral-conversation', 'history', 'science']);
    for (const w of HINDI_WORKS) for (const d of w.domains ?? []) expect(allowed.has(d), `${w.title}: ${d}`).toBe(true);
  });
});

describe('doors', () => {
  it('point at existing streams and shelves, with unique keys', () => {
    const streams = new Set(HINDI_STREAMS.map((s) => s.key));
    const shelves = new Set(HINDI_SHELVES.map((s) => s.key));
    expect(new Set(HINDI_DOORS.map((d) => d.key)).size).toBe(HINDI_DOORS.length);
    for (const d of HINDI_DOORS) {
      const door = d as { stream?: string; stages?: readonly string[]; domain?: string };
      expect(door.stream !== undefined || door.stages !== undefined || door.domain !== undefined, d.key).toBe(true);
      if (door.stream) expect(streams.has(door.stream), d.key).toBe(true);
      for (const s of door.stages ?? []) expect(shelves.has(s), `${d.key}: ${s}`).toBe(true);
    }
  });

  it('offer Stage 0, Classes 1–12 in one door, the libraries, Heritage, the Bible, Your Books and Open Reading', () => {
    expect(HINDI_DOORS.map((d) => d.label)).toEqual(['Stage 0', 'Classes 1–12', 'Children\'s Library', 'Hindi Literature', 'Nonfiction', 'Heritage Hindi', 'Bible', 'Your Books', 'Open Reading']);
    const classes = HINDI_DOORS.find((d) => d.key === 'classes') as { stages: readonly string[] };
    expect([...classes.stages]).toEqual(Array.from({ length: 12 }, (_, i) => `c${i + 1}`));
  });

  it('testimony stays outside the shelves, as in the other courses', () => {
    expect(HINDI_OUTSIDE_SHELVES).toEqual(['testimony']);
  });
});

describe('the current stage of a shelf course (R5)', () => {
  it('Hindi has one, by the rule the stage courses use, and its help profiles are the ones it always had', async () => {
    const { createMemoryStore } = await import('../../src/core');
    const { createCourseCatalog } = await import('../../src/course');
    const store = createMemoryStore();
    const catalog = createCourseCatalog({ store });
    await catalog.install(C);
    expect((await catalog.currentStage('u1', C))!.id).toBe(ids.stage(C, 's0a'));
    await catalog.setCurrentStage('u1', C, ids.stage(C, 'c4'));
    expect((await catalog.currentStage('u1', C))!.id).toBe(ids.stage(C, 'c4'));
    expect(await catalog.assistanceFor({ courseId: C, currentStageId: ids.stage(C, 'c4') })).toEqual(HINDI_ASSISTANCE.c4);
    expect(await catalog.assistanceFor({ courseId: C, currentStageId: ids.stage(C, 's0a') })).toEqual(HINDI_ASSISTANCE.s0a);
  });
});
