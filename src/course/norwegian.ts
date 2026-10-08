/**
 * The Norwegian course (Norway team): streams, shelves and the catalogue of works. The names and types follow
 * src/course/german.ts so that the catalogue, the doors, the rights gate and the scripts can import them. The works are
 * built from data/sources/course-library/nb.json (Team Norway package D).
 *
 * Target: contemporary written Bokmål (2005 norm). Nynorsk is a separate written standard, read receptively in its own
 * `nn` texts (the course `readsLangs`); Riksmål, Dano-Norwegian, Landsmål and Høgnorsk are recognition-only varieties.
 *
 * RIGHTS. Every work starts as `rights-unverified`; nothing here marks a work verified. A work is never bundled as a
 * candidate or a recommendation (see docs/norway/SPEC.md section 8).
 */
import type { RegisterTag, Stage, Stream, Work, WorkRights, WorkRole } from '../core';
import { DEFAULT_ASSISTANCE, ids } from '../core';
import manifest from '../../data/sources/course-library/nb.json';
import { acquiredWorks } from './acquired';

export const NORWEGIAN_COURSE_ID = 'norway-nb';
const LANG = 'nb' as const;

// ───────────────────────────── streams ─────────────────────────────

const stream = (order: number, key: string, kind: Stream['kind'], label: string, description: string, available = true): Stream => ({
  id: ids.stream(NORWEGIAN_COURSE_ID, key), courseId: NORWEGIAN_COURSE_ID, lang: LANG, key, label, description, kind, order, available,
});

/** One learner model, many content surfaces. A word learned on one shelf is known on every other. */
export const NORWEGIAN_STREAMS: Stream[] = [
  stream(0, 'acquisition', 'acquisition', 'Acquisition Path', 'Controlled, modern, highly comprehensible Bokmål written for the course: the launch ramp into real texts.'),
  stream(1, 'conversation', 'acquisition', 'Conversations', 'Dialogues in everyday Norwegian: greetings, shops, travel, church, meals.'),
  stream(2, 'library', 'library', 'Stories', 'The reading ladder: early readers, tales, children\'s books, novellas, the great literature.'),
  stream(3, 'norway', 'regional', 'Norway', 'Norway as real reading: places, travel, church, daily life, history, customs.'),
  stream(4, 'nynorsk', 'library', 'Nynorsk', 'Texts in Nynorsk, the other written standard, read receptively and counted in their own accounts.'),
  stream(5, 'heritage', 'library', 'Heritage', 'Older Norwegian (Dano-Norwegian, Riksmål, Landsmål), labelled by variety and era: read, never credited as modern.'),
  stream(6, 'knowledge', 'knowledge', 'Knowledge', 'Nonfiction: history, biography, science and engineering, theology, philosophy.'),
  stream(7, 'scripture', 'scripture', 'Bible', 'Scripture read directly in Norwegian, with English only as rescue.'),
  stream(8, 'mission', 'mission', 'Mission', 'Language for the gospel, testimony, prayer, church and ordinary conversation in ministry.'),
  stream(9, 'personal', 'personal', 'Your Books', 'Your own lawful copies, on this device only, read with the same help as everything else.'),
  // GoListen: the stream exists as data so that audio can attach to texts later.
  stream(10, 'listening', 'listening', 'Listen', 'Audio attached to texts, when rights-clear recordings exist.', false),
];

// ───────────────────────────── shelves ─────────────────────────────

const shelf = (index: number, label: string, purpose: string[]): Stage => ({
  id: ids.stage(NORWEGIAN_COURSE_ID, `s${index}`), courseId: NORWEGIAN_COURSE_ID, lang: LANG, index, key: `s${index}`, label, kind: 'shelf', purpose,
  // Shelves do not change how the reader behaves: the word sheet is the same everywhere, help appears when asked for.
  assistance: DEFAULT_ASSISTANCE,
});

/** Shelves, not locks: an orientation for browsing. Personal difficulty is computed per learner, per text. */
export const NORWEGIAN_SHELVES: Stage[] = [
  shelf(0, 'Controlled Bokmål', ['written for the course (the ladder in data/ladder/nb)', 'modern, concrete, repetitive', 'narrative and dialogue, not exercises']),
  shelf(1, 'Modern open texts', ['contemporary open-licence text, attribution and share-alike honoured', 'single sentences and modern Scripture']),
  shelf(2, 'Tales', ['folk tales in the Dano-Norwegian spelling of the 1850s, read as heritage']),
  shelf(3, 'Heritage prose', ['novels of the 1850s-1910s in Dano-Norwegian and Riksmål', 'recognised, labelled by variety and era, never credited as modern Bokmål']),
  shelf(4, 'School readers', ['graded readings of the early twentieth century (Riksmål)']),
  shelf(5, 'Nynorsk', ['the other written standard, read receptively; its items are counted separately from Bokmål', 'Landsmål before 1929 is labelled as such']),
  shelf(6, 'Scripture', ['the Bible in Norwegian, with English only as rescue']),
];

// ───────────────────────────── works ─────────────────────────────
// The catalogue is built from the manifest data/sources/course-library/nb.json, the one place that records each lead and its
// rights evidence. Every entry there is rights-unverified and withheld: no text is bundled. A work whose state a person
// has verified would arrive through acquired-library-works.json (the same pattern as the other courses), never from here.

interface ManifestEntry {
  slug: string; title: string; author?: string; lang?: 'nb' | 'nn'; stage: string; streams?: string[]; domains?: string[]; variety?: string; era?: string;
  genre?: string; audience?: string; level?: Work['genericLevel']; registers?: RegisterTag[]; role?: WorkRole; publicationYear?: number; authorDied?: number;
  rights: WorkRights; source: { url?: string; edition?: string }; notes?: string;
}
const MANIFEST_ENTRIES = (manifest as unknown as { entries: ManifestEntry[] }).entries;

let order = 0;
/** The catalogue of works (rights-unverified leads). The export name (*_WORKS) is what the rights gate collects. */
export const NORWEGIAN_WORKS: Work[] = MANIFEST_ENTRIES.map((e): Work => {
  const lang = e.lang ?? LANG;
  const acquired = acquiredWorks[lang]?.[e.slug];
  const rights = acquired?.rights ?? e.rights;
  return {
    id: ids.work(NORWEGIAN_COURSE_ID, e.slug), courseId: NORWEGIAN_COURSE_ID, lang, stageId: ids.stage(NORWEGIAN_COURSE_ID, e.stage),
    role: e.role ?? 'subsidiary', order: order++, title: e.title, author: e.author, edition: acquired?.edition ?? e.source.edition, purpose: [], registers: e.registers,
    rights, bibliographyVerified: false, optional: true, notes: e.notes, sourceUrl: acquired?.sourceUrl ?? e.source.url,
    streams: e.streams, variety: e.variety, era: e.era, genre: e.genre, audience: e.audience, domains: e.domains, genericLevel: e.level,
    publicationYear: e.publicationYear, authorDied: e.authorDied, ingestion: acquired?.installed ? 'ingested' : 'catalogued',
    readiness: acquired?.installed ? 'implemented' : rights.state === 'prohibited-from-bundling' || rights.state === 'recommended-only' ? 'recommendation' : rights.state === 'rights-unverified' ? 'candidate' : 'verified-ready',
  };
});

/** Texts that are not placed on a shelf by this file: the learner's own books and his testimony. */
export const NORWEGIAN_OUTSIDE_SHELVES = ['testimony'] as const;

/** Doors on Home and Explore; each is a filter on the catalogue, never a separate course. */
export const NORWEGIAN_DOORS = [
  { key: 'acquisition', label: 'Acquisition Path', stream: 'acquisition' },
  { key: 'conversation', label: 'Conversations', stream: 'conversation' },
  { key: 'norway', label: 'Norway', stream: 'norway' },
  { key: 'stories', label: 'Stories', stream: 'library' },
  { key: 'nynorsk', label: 'Nynorsk', stream: 'nynorsk' },
  { key: 'bible', label: 'Bible', stream: 'scripture' },
  { key: 'history', label: 'History', domain: 'history' },
  { key: 'theology', label: 'Theology', domain: 'theology' },
  { key: 'your-books', label: 'Your Books', stream: 'personal' },
] as const;

/**
 * Scripture policy as data. Nothing is verified for bundling yet: the publisher's statement that the 1930 Bokmål and 1938
 * Nynorsk translations are in the public domain gives no legal basis, and the 1938 claim is in tension with the reviser's
 * death date (docs/norway/SPEC.md section 9). The current translations are protected.
 */
export const NORWEGIAN_SCRIPTURE_POLICY = {
  baseline: { name: 'Bibelen 1930 (Bokmål)', translationId: 'nor1930', workSlug: 'bibelen-1930', status: 'rights-unverified (the publisher says the translation is in the public domain; no legal basis checked; only the three-verse seed excerpt, held out of the release bundle)' },
  candidates: [
    { name: 'Bibelen 1938 (Nynorsk)', status: 'candidate-unverified' },
    { name: 'Bibelen 1921 (Studentmållaget, Nynorsk)', status: 'candidate-unverified' },
  ],
  notBundled: ['Bibel 2011 (Bibelselskapet)', 'Bibel 2024 (Bibelselskapet)', 'Det Norske Bibelselskap, other modern translations'],
  rule: 'A modern translation is shown only from the learner\'s own copy or with the publisher\'s written permission on file. The Scripture surface is Norwegian text with English rescue, not a parallel-Bible interface.',
  audio: 'No recording is bundled. Text rights and recording rights are separate: a public-domain text read by someone is that reader\'s or publisher\'s recording.',
} as const;
