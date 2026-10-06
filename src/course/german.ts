/**
 * The German course (Germany team): streams, shelves and the first catalogue of works.
 *
 * Target: modern Standard German of Germany (de-DE). Austrian and Swiss Standard German, dialects and older spelling
 * are reading matter to recognise, labelled as such, never the model for the learner's own German.
 *
 * Like Spanish, German has a surplus of text, so this is a catalogue with shelves, not a syllabus: shelves are an
 * orientation for browsing and never a lock. What the learner reads next is decided by his own record (GoLearn).
 *
 * RIGHTS. Every entry is one of four things, and the difference is the point of this file:
 *   implemented     bundled and readable now (first-party texts; a verified public-domain text with its evidence)
 *   verified-ready  rights verified for one exact edition, not yet ingested
 *   candidate       awaiting a rights review: a date of death or of publication is a LEAD, never a conclusion
 *   recommendation  will only ever be the learner's own copy (in copyright, or a modern translation)
 * A work is never bundled as a candidate or a recommendation. Rights attach to the exact edition, translation and
 * recording, not to the work: an old text in a modern edition, a modern translation of an old book, or an editor's
 * arrangement of posthumous papers can each carry rights of their own. A statement that holds in one country
 * (the United States, say) is not a worldwide statement.
 * BIBLIOGRAPHY: titles, authors and dates are from general knowledge and are marked unverified.
 */
import type { RegisterTag, Stage, Stream, Work, WorkRights, WorkRole } from '../core';
import { DEFAULT_ASSISTANCE, ids } from '../core';
import { acquiredWorks } from './acquired';
import { readingBridgeWorks } from './readingBridges';
import { CURRICULUM_ACQUIRED_WORKS } from './curriculumAcquired';

export const GERMAN_COURSE_ID = 'germany-de';
const LANG = 'de' as const;

// ───────────────────────────── streams ─────────────────────────────

const stream = (order: number, key: string, kind: Stream['kind'], label: string, description: string, available = true): Stream => ({
  id: ids.stream(GERMAN_COURSE_ID, key), courseId: GERMAN_COURSE_ID, lang: LANG, key, label, description, kind, order, available,
});

/** One learner model, many content surfaces. A word learned on one shelf is known on every other. */
export const GERMAN_STREAMS: Stream[] = [
  stream(0, 'acquisition', 'acquisition', 'Acquisition Path', 'Controlled, modern, highly comprehensible German written for the course: the launch ramp into real texts.'),
  stream(1, 'conversation', 'acquisition', 'Conversations', 'Dialogues in everyday spoken German: greetings, shops, travel, church, meals — with the small words (doch, mal, ja) that carry tone.'),
  stream(2, 'library', 'library', 'Stories', 'The reading ladder: early readers, tales, children\'s books, novellas, the great literature.'),
  stream(3, 'germany', 'regional', 'Germany', 'Germany as real reading: places, travel, church, daily life, history, customs.'),
  stream(4, 'knowledge', 'knowledge', 'Knowledge', 'Nonfiction: history, biography, science and engineering, theology, philosophy.'),
  stream(5, 'scripture', 'scripture', 'Bible', 'Scripture read directly in German, with English only as rescue.'),
  stream(6, 'mission', 'mission', 'Mission', 'Language for the gospel, testimony, prayer, church and ordinary conversation in ministry.'),
  stream(7, 'personal', 'personal', 'Your Books', 'Your own lawful copies, on this device only, read with the same help as everything else.'),
  // GoListen is deferred to V2: the stream exists as data so that audio can attach to texts later.
  stream(8, 'listening', 'listening', 'Listen', 'Audio attached to texts, when rights-clear recordings exist.', false),
];

// ───────────────────────────── shelves ─────────────────────────────

const shelf = (index: number, label: string, purpose: string[]): Stage => ({
  id: ids.stage(GERMAN_COURSE_ID, `s${index}`), courseId: GERMAN_COURSE_ID, lang: LANG, index, key: `s${index}`, label, kind: 'shelf', purpose,
  // Shelves do not change how the reader behaves: the word sheet is the same everywhere, help appears when asked for.
  assistance: DEFAULT_ASSISTANCE,
});

/** Shelves, not locks: an orientation for browsing. Personal difficulty is computed per learner, per text. */
export const GERMAN_SHELVES: Stage[] = [
  shelf(0, 'Controlled German', ['written for the course', 'modern, concrete, repetitive', 'narrative and dialogue, not exercises']),
  shelf(1, 'First readers', ['very simple narrative written for beginners', 'historical graded readers']),
  shelf(2, 'Easy readers', ['simple retold tales', 'short connected stories for learners']),
  shelf(3, 'Short native texts', ['short tales and verse stories written for German children']),
  shelf(4, 'Tales', ['fairy tales and calendar stories in their own language']),
  shelf(5, 'Children\'s books', ['longer books for children']),
  shelf(6, 'Young readers', ['children\'s and young readers\' novels', 'your own modern books']),
  shelf(7, 'Plain literary prose', ['novellas and tales told plainly']),
  shelf(8, 'Novellas and adventure', ['longer novellas', 'popular narrative']),
  shelf(9, 'Mature prose', ['nineteenth-century and early modern prose of some difficulty']),
  shelf(10, 'Demanding prose', ['long periods, dense syntax, irony']),
  shelf(11, 'Major literature', ['the classical authors: drama and prose']),
  shelf(12, 'Major literature, hardest', ['verse drama, philosophical novels, the long novels']),
  shelf(13, 'Open reading', ['philosophy, theology, history, science and engineering, letters: read by interest']),
];

// ───────────────────────────── rights records ─────────────────────────────

const BASE: WorkRights = {
  state: 'rights-unverified', copyrightStatus: 'unknown', permission: 'unknown', canBundle: false, userImportOnly: true,
  canModify: false, canStoreOffline: false, canBundleAudio: false, audiobook: 'unknown', verified: false,
  acquisitionNotes: 'Rights not verified. Nothing is bundled until the exact edition, its source and the legal basis are recorded with their evidence.',
};

/** An old work: the date is a lead. The edition actually used still has to be identified and checked. */
const lead = (basis: string): WorkRights => ({
  ...BASE, basis: `${basis} A lead for verification, not a conclusion: the exact edition and source must be checked, an edition or translation can carry its own rights, and terms differ by country.`,
  jurisdiction: 'not established',
});

/** A modern work under copyright, or a modern translation: listed so the learner can find it; the app holds no text. */
const modern = (basis: string): WorkRights => ({
  ...BASE, state: 'prohibited-from-bundling', copyrightStatus: 'in-copyright', permission: 'none', basis: `${basis} Presumed in copyright; not verified.`,
  acquisitionNotes: 'In copyright: never bundled. Import your own lawful copy; it stays on this device.',
});

/** Text written for the course. Machine-drafted text is labelled as such on the document and needs review before it is published. */
const COURSE: WorkRights = {
  state: 'course-authored', copyrightStatus: 'licensed', licensing: 'written for this course', permission: 'not-needed', canBundle: true, userImportOnly: false,
  canModify: true, canStoreOffline: true, canBundleAudio: false, audiobook: 'none', verified: true, verifiedBy: 'course authors', basis: 'Original text written for the course.',
};

// ───────────────────────────── works ─────────────────────────────

let order = 0;
interface W {
  slug: string; title: string; author?: string; died?: number; year?: number; role?: WorkRole; streams?: string[]; variety?: string; region?: string;
  era?: string; genre?: string; audience?: string; domains?: string[]; level?: Work['genericLevel']; registers?: RegisterTag[]; rights?: WorkRights;
  purpose?: string[]; notes?: string; ingestion?: Work['ingestion']; readiness?: Work['readiness']; translator?: string; edition?: string; sourceUrl?: string;
}
const readinessOf = (r: WorkRights): NonNullable<Work['readiness']> =>
  (r.state === 'prohibited-from-bundling' || r.state === 'recommended-only' ? 'recommendation' : r.state === 'rights-unverified' ? 'candidate' : 'verified-ready');
const works = (shelfIndex: number, list: W[]): Work[] => list.map((w) => {
  const rights = acquiredWorks[LANG]?.[w.slug]?.rights ?? w.rights ?? (w.died !== undefined ? lead(`The author died in ${w.died}${w.year ? `; first published ${w.year}` : ''}.`) : BASE);
  return {
    id: ids.work(GERMAN_COURSE_ID, w.slug), courseId: GERMAN_COURSE_ID, lang: LANG, stageId: ids.stage(GERMAN_COURSE_ID, `s${shelfIndex}`),
    role: w.role ?? 'subsidiary', order: order++, title: w.title, author: w.author, edition: acquiredWorks[LANG]?.[w.slug]?.edition ?? w.edition, purpose: w.purpose ?? [], registers: w.registers,
    rights, bibliographyVerified: false, optional: true, notes: w.notes, translator: w.translator, sourceUrl: acquiredWorks[LANG]?.[w.slug]?.sourceUrl ?? w.sourceUrl,
    streams: w.streams ?? ['library'], variety: w.variety, region: w.region, era: w.era, genre: w.genre, audience: w.audience, domains: w.domains,
    genericLevel: w.level, publicationYear: w.year, authorDied: w.died, ingestion: w.ingestion ?? (acquiredWorks[LANG]?.[w.slug]?.installed ? 'ingested' : 'catalogued'),
    readiness: acquiredWorks[LANG]?.[w.slug]?.installed ? 'implemented' : w.readiness ?? readinessOf(rights),
  };
});

const DRAFT = 'Machine-drafted prototype: not reviewed by a native speaker, so it is visible in preview only.';
const OLD = 'de-pre1901';

/**
 * The Lutherbibel of 1912, as distributed by eBible.org (translation id deu1912). What is bundled is a small slice; each
 * bundled verse is compared with the distributor's text by `scripts/verify-scripture.mjs` and recorded in
 * `data/verified/scripture.json`. The evidence is in docs/german/RIGHTS.md.
 */
export const LUTHER_1912_RIGHTS: WorkRights = {
  state: 'verified-public-domain', copyrightStatus: 'public-domain', permission: 'not-needed', canBundle: true, userImportOnly: false,
  canModify: true, canStoreOffline: true, canBundleAudio: false, audiobook: 'unknown', verified: true,
  verifiedBy: 'coordinator (AI), from the evidence listed; not legal advice — to be confirmed by the owner', verifiedAt: '2026-10-01',
  basis: 'Luther died in 1546. The revision of 1912 was published (New Testament December 1912, whole Bible 1913) as a church text '
    + 'without named revisers; a work published without its authors\' names is protected for 70 years from publication (Germany: UrhG § 66; '
    + 'EU: Directive 2006/116/EC Art. 1(3)), which ended in 1983 at the latest; in the United States a work published before 1929 is in the '
    + 'public domain. The publisher of the Luther Bible claims copyright only in its own digital edition, not in this text. '
    + 'NOT ESTABLISHED FROM A PRIMARY SOURCE: a written statement of the Deutsche Bibelgesellschaft that the text is free (only a third party\'s '
    + 'report of one exists), and the names and death dates of the revisers (were a reviser identified as an author, life plus 70 years would apply to that contribution).',
  sourceRepository: 'eBible.org, translation id deu1912 (https://ebible.org/deu1912/)',
  licence: 'Public Domain (as stated on the source\'s copyright page)',
  jurisdictions: ['US', 'DE', 'EU'],
  statusByJurisdiction: { US: 'public-domain', DE: 'public-domain', EU: 'public-domain' },
  countryOfOrigin: 'DE', editionYear: 1912, retrievedAt: '2026-10-01',
  attributionRequired: false, shareAlike: false,
  modifications: 'none: each bundled verse is identical to the source after Unicode normalization (NFC) and whitespace normalization',
  proofreading: 'the distributor\'s text; no proofreading of our own',
  evidence: [
    'Martin Luther died in 1546. The text is the second church revision of his translation, commissioned by the Evangelische Kirchenkonferenz: New Testament December 1912, whole Bible 1913 (de.wikipedia.org, "Lutherbibel", section "Lutherbibel von 1912", read 2026-10-01).',
    'eBible.org lists the translation "Luther Bibel 1912" (deu1912) with the statement Public Domain on its copyright page (https://ebible.org/deu1912/copyright.htm, read 2026-10-01); the page names no reviser and no jurisdiction.',
    'The Deutsche Bibelgesellschaft\'s own online edition (https://www.die-bibel.de/bibel/LU12/GEN.1, read 2026-10-01) carries the line "Neu durchgesehen nach dem vom Deutschen Evangelischen Kirchenausschuss genehmigten Text (1912). © der digitalen Ausgabe 1999, 2018 Deutsche Bibelgesellschaft Stuttgart": no reviser is named, and copyright is claimed in the digital edition only. That edition is NOT the source of the bundled text.',
    'freie-bibel.de reports: "Die Lizenzabteilung der Deutschen Bibelgesellschaft hat uns am 2014-01-21 bestätigt, dass die Luther 1912 mittlerweile gemeinfrei ist", and adds that no list of the revisers with their years of death exists there (http://www.freie-bibel.de/official/bibel/luther/luther_1912/information/uebersetzung_luther_1912.html, read 2026-10-01). A third party\'s report, not the statement itself.',
    'de.wikipedia.org, "Lutherbibel", section "Die Lutherbibel von 1912 im 21. Jahrhundert": the revision of 1912 is "nicht mehr durch das Urheberrecht geschützt" and may be reprinted without permission (read 2026-10-01). An encyclopedia, not an authority.',
    'Every bundled verse is compared with the distributor\'s page and recorded with its URL in data/verified/scripture.json. That record proves the wording is the source\'s wording; it says nothing about rights.',
    'Not checked: Austria and Switzerland individually; any jurisdiction with a term longer than 70 years.',
  ],
  compliance: 'No attribution is required; the source and edition are named on every Scripture text.',
  audioRights: 'No recording is bundled. A recording has rights of its own, to be checked separately.',
};

/**
 * A tale of the Brothers Grimm in the seventh edition (1857), from the German Wikisource transcription. The evidence
 * for each tale (revision, proofreading state, checksum) is written by `scripts/build-de-grimm.mjs` to
 * `data/sources/de/<slug>.source.json`; the summary is in docs/german/RIGHTS.md.
 */
const grimm1857 = (page: string, revision: number, scanPage: number, sha256: string): WorkRights => ({
  state: 'verified-public-domain', copyrightStatus: 'public-domain', permission: 'not-needed', canBundle: true, userImportOnly: false,
  canModify: true, canStoreOffline: true, canBundleAudio: false, audiobook: 'unknown', verified: true,
  verifiedBy: 'coordinator (AI), from the evidence listed; not legal advice — to be confirmed by the owner', verifiedAt: '2026-10-01',
  basis: 'The authors died in 1859 and 1863 and this edition appeared in 1857: more than 160 years ago, beyond every copyright term in use (life plus 70, life plus 100, and publication before 1929 for the United States).',
  sourceRepository: `de.wikisource.org, page "${page}", revision ${revision} (https://de.wikisource.org/w/index.php?oldid=${revision})`,
  licence: 'Underlying text: public domain. The Wikisource transcription is offered by the site under Creative Commons Attribution-Share Alike 4.0.',
  jurisdictions: ['DE', 'EU', 'US'],
  statusByJurisdiction: { DE: 'public-domain', EU: 'public-domain', US: 'public-domain' },
  countryOfOrigin: 'DE', editionYear: 1857,
  attributionRequired: true, shareAlike: true,
  modifications: 'page-number marks removed; whitespace normalised; cut into sentences without changing a character; the spelling of 1857 is kept',
  retrievedAt: '2026-10-01', checksum: `sha256 ${sha256}`,
  proofreading: 'Wikisource: "fertig" — proofread twice against the scan; scan page quality 4 of 4',
  evidence: [
    'Wilhelm Grimm died on 16 December 1859 and Jacob Grimm on 20 September 1863.',
    `Kinder- und Haus-Märchen, Große Ausgabe, 7. Auflage (Ausgabe letzter Hand), Band 2, Göttingen: Dieterich, 1857, page ${scanPage} — as stated on the source page, which links the scan.`,
    `The German wording is identical to revision ${revision} of the source page (the build script reconstructs the paragraph from its sentences and refuses a difference).`,
    'The site states Creative Commons Attribution-Share Alike 4.0 for its text.',
  ],
  sourceTerms: 'Wikimedia terms of use: reuse is allowed with attribution under the stated licence.',
  compliance: 'The source, the edition and the licence are named in the text\'s own source line, which the reader shows. If the transcription is a licensed work at all, this bundled copy is offered under the same licence (CC BY-SA 4.0). The English lines are the course\'s own.',
  audioRights: 'No recording is bundled. A recording has rights of its own, to be checked separately.',
});

export const GERMAN_WORKS: Work[] = [
  ...CURRICULUM_ACQUIRED_WORKS.filter(w => w.lang === 'de'),
  ...readingBridgeWorks('de'),
  // ── Shelf 0: controlled German written for the course ──
  ...works(0, [
    { slug: 'weg-1', title: 'Weg 1 — Erste Schritte', role: 'spine', streams: ['acquisition'], variety: 'de-DE', level: 'controlled', genre: 'microstories', rights: COURSE, ingestion: 'bundled', readiness: 'implemented',
      purpose: ['sein and haben, the present tense', 'people, home, food, a small recurring world', 'nominative and accusative met in sentences'], notes: DRAFT },
    { slug: 'weg-2', title: 'Weg 2 — Tage und Orte', role: 'spine', streams: ['acquisition'], variety: 'de-DE', level: 'controlled', genre: 'short narrative', rights: COURSE, ingestion: 'bundled', readiness: 'implemented',
      purpose: ['the dative and the common prepositions', 'modal verbs', 'separable verbs', 'the perfect'], notes: DRAFT },
    { slug: 'weg-3', title: 'Weg 3 — Geschichten', role: 'spine', streams: ['acquisition'], variety: 'de-DE', level: 'controlled', genre: 'narrative', rights: COURSE, ingestion: 'bundled', readiness: 'implemented',
      purpose: ['longer connected narrative', 'subordinate clauses with the verb last', 'the preterite of the commonest verbs', 'relative clauses and adjective endings in natural use'], notes: DRAFT },
    { slug: 'gespraeche-1', title: 'Gespräche 1', role: 'spine', streams: ['conversation', 'acquisition'], variety: 'de-DE', level: 'controlled', genre: 'dialogues', rights: COURSE, ingestion: 'bundled', readiness: 'implemented', registers: ['colloquial'],
      purpose: ['everyday spoken German', 'du and Sie', 'the modal particles doch, mal, ja, denn, eben, halt, schon, wohl in real use'], notes: DRAFT },
    { slug: 'deutschland-lesungen-1', title: 'Deutschland — Lesungen 1', role: 'spine', streams: ['germany', 'acquisition'], variety: 'de-DE', region: 'Germany', level: 'controlled', genre: 'short readings', rights: COURSE, ingestion: 'bundled', readiness: 'implemented',
      purpose: ['ordinary life in Germany as reading', 'train and tram, the bakery and the market, church on Sunday, a visit to a family'],
      notes: 'Machine-drafted prototype. Facts about Germany and usage must be checked by a German reviewer before publication.' },
  ]),

  // ── Shelves 1–2: readers written for beginners ──
  ...works(1, [
    { slug: 'guerber-maerchen-und-erzaehlungen', title: 'Märchen und Erzählungen für Anfänger', author: 'H. A. Guerber', died: 1929, year: 1896, era: '19th century', genre: 'graded reader: retold tales', audience: 'learners of German', level: 'easy', variety: OLD,
      notes: 'An American school reader with vocabulary and notes in English. The reader as a whole (text, notes, vocabulary) is one edition; its spelling is that of the 1890s.' },
  ]),
  ...works(2, [
    { slug: 'historical-school-readers', title: 'Historical school readers (to be selected)', era: '19th – early 20th century', genre: 'school readers', audience: 'children', level: 'easy',
      notes: 'A place-holder for public-domain primers and school readers still to be identified title by title. Nothing is listed until an exact edition is named.' },
  ]),

  // ── Shelves 3–4: short native texts and tales ──
  ...works(3, [
    { slug: 'busch-max-und-moritz', title: 'Max und Moritz. Eine Bubengeschichte in sieben Streichen', author: 'Wilhelm Busch', died: 1908, year: 1865, era: '19th century', genre: 'verse story with pictures', audience: 'children', level: 'easy', variety: OLD, registers: ['literary'],
      notes: 'Verse; the pictures are part of the work and have the same author. Older spelling in original editions.' },
    { slug: 'hoffmann-struwwelpeter', title: 'Der Struwwelpeter', author: 'Heinrich Hoffmann', died: 1894, year: 1845, era: '19th century', genre: 'verse stories with pictures', audience: 'children', level: 'easy', variety: OLD },
    { slug: 'busch-hans-huckebein', title: 'Hans Huckebein, der Unglücksrabe', author: 'Wilhelm Busch', died: 1908, year: 1867, era: '19th century', genre: 'verse story with pictures', audience: 'children', level: 'easy', variety: OLD },
  ]),
  ...works(4, [
    { slug: 'grimm-khm', title: 'Kinder- und Hausmärchen', author: 'Jacob und Wilhelm Grimm', died: 1863, year: 1857, edition: '7th edition, 1857 (the last by the brothers)', era: '19th century', genre: 'fairy tales', level: 'easy', variety: OLD,
      rights: lead('Wilhelm Grimm died in 1859 and Jacob Grimm in 1863; the seventh edition appeared in 1857.'),
      notes: 'About two hundred tales of very different difficulty; each bundled tale is listed as its own work with its own evidence. Original spelling (thun, Thür, giebt).' },
    { slug: 'grimm-sternthaler-1857', title: 'Die Sternthaler', author: 'Jacob und Wilhelm Grimm', died: 1863, year: 1857, edition: 'Kinder- und Haus-Märchen, 7. Auflage 1857, Band 2, S. 285 (KHM 153)', era: '19th century', genre: 'fairy tale', level: 'intermediate', variety: OLD,
      rights: grimm1857('Die Sternthaler (1857)', 3577237, 285, '1a676af4ab8aa5506d2c218a198a7222df74a7bd9f2a5b561d960d6d678aa6ab'), ingestion: 'bundled', readiness: 'implemented', sourceUrl: 'https://de.wikisource.org/wiki/Die_Sternthaler_(1857)',
      notes: 'The first verified literary text of the course. Spelling of 1857 (daß, gieng, that, Thaler), related to today\'s in the analysis. Bundled; in preview until the English lines have been read by a person.' },
    { slug: 'grimm-der-suesse-brei-1857', title: 'Der süße Brei', author: 'Jacob und Wilhelm Grimm', died: 1863, year: 1857, edition: 'Kinder- und Haus-Märchen, 7. Auflage 1857, Band 2, S. 90 (KHM 103)', era: '19th century', genre: 'fairy tale', level: 'intermediate', variety: OLD,
      rights: grimm1857('Der süße Brei (1857)', 3445434, 90, 'bd54868208ac173eb0ae8d703d719e7e24953cadc3b5e37d0b8223b4601b0a0b'), ingestion: 'bundled', readiness: 'implemented', sourceUrl: 'https://de.wikisource.org/wiki/Der_s%C3%BC%C3%9Fe_Brei_(1857)',
      notes: 'Spelling of 1857 (gieng, wußte, Armuth, Noth, mußte). Bundled; in preview until the English lines have been read by a person.' },
    { slug: 'bechstein-maerchenbuch', title: 'Deutsches Märchenbuch', author: 'Ludwig Bechstein', died: 1860, year: 1845, era: '19th century', genre: 'fairy tales', level: 'easy', variety: OLD },
    { slug: 'hebel-schatzkaestlein', title: 'Schatzkästlein des rheinischen Hausfreundes', author: 'Johann Peter Hebel', died: 1826, year: 1811, era: 'early 19th century', genre: 'calendar stories', level: 'intermediate', variety: OLD, registers: ['literary'] },
    { slug: 'hauff-maerchen', title: 'Märchen (Die Karawane; Der Scheik von Alessandria; Das Wirtshaus im Spessart)', author: 'Wilhelm Hauff', died: 1827, year: 1826, era: 'early 19th century', genre: 'literary fairy tales', level: 'intermediate', variety: OLD },
  ]),

  // ── Shelves 5–6: children's and young readers' books ──
  ...works(5, [
    { slug: 'spyri-heidi', title: 'Heidis Lehr- und Wanderjahre', author: 'Johanna Spyri', died: 1901, year: 1880, region: 'Switzerland', era: '19th century', genre: 'children\'s novel', audience: 'children', level: 'intermediate', variety: OLD,
      notes: 'A Swiss author writing Standard German; a few Swiss words. Many later editions are abridged or modernised: each is a different edition with its own rights.' },
    { slug: 'bassewitz-peterchens-mondfahrt', title: 'Peterchens Mondfahrt', author: 'Gerdt von Bassewitz', died: 1923, year: 1915, era: 'early 20th century', genre: 'children\'s fairy tale', audience: 'children', level: 'intermediate',
      notes: 'First a play (1912), then the book (1915). The well-known illustrations are by another hand and have their own rights.' },
    { slug: 'bonsels-biene-maja', title: 'Die Biene Maja und ihre Abenteuer', author: 'Waldemar Bonsels', died: 1952, year: 1912, era: 'early 20th century', genre: 'children\'s novel', audience: 'children', level: 'intermediate',
      rights: lead('The author died in 1952; first published 1912. Where the term is the author\'s life plus seventy years it ran to the end of 2022; publication before 1929 matters for the United States.') },
  ]),
  ...works(6, [
    { slug: 'kaestner-emil', title: 'Emil und die Detektive', author: 'Erich Kästner', died: 1974, year: 1929, era: '20th century', genre: 'children\'s novel', audience: 'children', level: 'intermediate', streams: ['library', 'personal'], rights: modern('The author died in 1974.') },
    { slug: 'preussler-kleine-hexe', title: 'Die kleine Hexe', author: 'Otfried Preußler', died: 2013, year: 1957, era: '20th century', genre: 'children\'s novel', audience: 'children', level: 'easy', streams: ['library', 'personal'], rights: modern('The author died in 2013.') },
    { slug: 'ende-momo', title: 'Momo', author: 'Michael Ende', died: 1995, year: 1973, era: '20th century', genre: 'novel for young readers', audience: 'young readers', level: 'intermediate', streams: ['library', 'personal'], rights: modern('The author died in 1995.') },
    { slug: 'funke-tintenherz', title: 'Tintenherz', author: 'Cornelia Funke', year: 2003, era: '21st century', genre: 'fantasy novel', audience: 'young readers', level: 'intermediate', streams: ['library', 'personal'], rights: modern('A living author.') },
    { slug: 'riordan-diebe-im-olymp', title: 'Percy Jackson: Diebe im Olymp', author: 'Rick Riordan (German translation)', genre: 'fantasy novel in translation', audience: 'young readers', level: 'intermediate', streams: ['library', 'personal'], rights: modern('A modern novel in a modern translation: the translation has rights of its own.') },
    { slug: 'rowling-stein-der-weisen', title: 'Harry Potter und der Stein der Weisen', author: 'J. K. Rowling (German translation)', genre: 'fantasy novel in translation', audience: 'young readers', level: 'intermediate', streams: ['library', 'personal'], rights: modern('A modern novel in a modern translation: the translation has rights of its own.') },
    { slug: 'colfer-land-of-stories', title: 'The Land of Stories, book 1 (German translation)', author: 'Chris Colfer (German translation)', genre: 'fantasy novel in translation', audience: 'young readers', level: 'intermediate', streams: ['library', 'personal'], rights: modern('A modern novel in a modern translation: the translation has rights of its own.'),
      notes: 'The exact German title is not recorded here: enter it from your own copy.' },
  ]),

  // ── Shelves 7–8: plain literary prose, novellas, adventure ──
  ...works(7, [
    { slug: 'keller-kleider-machen-leute', title: 'Kleider machen Leute', author: 'Gottfried Keller', died: 1890, year: 1874, region: 'Switzerland', era: '19th century', genre: 'novella', level: 'intermediate', variety: OLD },
    { slug: 'storm-immensee', title: 'Immensee', author: 'Theodor Storm', died: 1888, year: 1849, era: '19th century', genre: 'novella', level: 'intermediate', variety: OLD },
    { slug: 'storm-pole-poppenspaeler', title: 'Pole Poppenspäler', author: 'Theodor Storm', died: 1888, year: 1874, era: '19th century', genre: 'novella', audience: 'young readers', level: 'intermediate', variety: OLD },
    { slug: 'ebner-eschenbach-krambambuli', title: 'Krambambuli', author: 'Marie von Ebner-Eschenbach', died: 1916, year: 1883, region: 'Austria', era: '19th century', genre: 'short story', level: 'intermediate', variety: OLD },
    { slug: 'eichendorff-taugenichts', title: 'Aus dem Leben eines Taugenichts', author: 'Joseph von Eichendorff', died: 1857, year: 1826, era: 'early 19th century', genre: 'novella', level: 'intermediate', variety: OLD, registers: ['literary'] },
  ]),
  ...works(8, [
    { slug: 'storm-schimmelreiter', title: 'Der Schimmelreiter', author: 'Theodor Storm', died: 1888, year: 1888, era: '19th century', genre: 'novella', level: 'advanced', variety: OLD, notes: 'Some Low German and coastal vocabulary: marked as regional where recognised.' },
    { slug: 'keller-romeo-und-julia', title: 'Romeo und Julia auf dem Dorfe', author: 'Gottfried Keller', died: 1890, year: 1856, region: 'Switzerland', era: '19th century', genre: 'novella', level: 'advanced', variety: OLD },
    { slug: 'may-winnetou-1', title: 'Winnetou I', author: 'Karl May', died: 1912, year: 1893, era: '19th century', genre: 'adventure novel', level: 'intermediate', variety: OLD,
      notes: 'Later editions were heavily revised by the publisher: an edition after the author\'s death is a different text and may carry rights of its own.' },
    { slug: 'droste-judenbuche', title: 'Die Judenbuche', author: 'Annette von Droste-Hülshoff', died: 1848, year: 1842, era: '19th century', genre: 'novella', level: 'advanced', variety: OLD },
    { slug: 'hauptmann-bahnwaerter-thiel', title: 'Bahnwärter Thiel', author: 'Gerhart Hauptmann', died: 1946, year: 1888, era: '19th century', genre: 'novella', level: 'advanced', variety: OLD,
      rights: lead('The author died in 1946; first published 1888. Where the term is the author\'s life plus seventy years it ran to the end of 2016.') },
  ]),

  // ── Shelves 9–10: mature literary prose ──
  ...works(9, [
    { slug: 'kafka-das-urteil', title: 'Das Urteil', author: 'Franz Kafka', died: 1924, year: 1913, era: 'early 20th century', genre: 'story', level: 'advanced', variety: 'de-1901' },
    { slug: 'kafka-die-verwandlung', title: 'Die Verwandlung', author: 'Franz Kafka', died: 1924, year: 1915, era: 'early 20th century', genre: 'story', level: 'advanced', variety: 'de-1901' },
    { slug: 'stifter-bergkristall', title: 'Bergkristall', author: 'Adalbert Stifter', died: 1868, year: 1853, region: 'Austria', era: '19th century', genre: 'story', level: 'advanced', variety: OLD },
    { slug: 'fontane-irrungen-wirrungen', title: 'Irrungen, Wirrungen', author: 'Theodor Fontane', died: 1898, year: 1888, era: '19th century', genre: 'novel', level: 'advanced', variety: OLD, notes: 'Dialogue with Berlin speech: marked as regional where recognised.' },
    { slug: 'hoffmann-nussknacker', title: 'Nußknacker und Mausekönig', author: 'E. T. A. Hoffmann', died: 1822, year: 1816, era: 'early 19th century', genre: 'literary fairy tale', level: 'advanced', variety: OLD },
    { slug: 'schnitzler-leutnant-gustl', title: 'Leutnant Gustl', author: 'Arthur Schnitzler', died: 1931, year: 1900, region: 'Austria', era: '1900', genre: 'story (interior monologue)', level: 'advanced', variety: OLD, registers: ['colloquial'],
      notes: 'Viennese colloquial speech throughout: Austrian usage, marked as such where recognised.' },
  ]),
  ...works(10, [
    { slug: 'kleist-michael-kohlhaas', title: 'Michael Kohlhaas', author: 'Heinrich von Kleist', died: 1811, year: 1810, era: 'early 19th century', genre: 'novella', level: 'literary', variety: OLD, notes: 'Very long periods with deeply nested clauses.' },
    { slug: 'kleist-marquise-von-o', title: 'Die Marquise von O….', author: 'Heinrich von Kleist', died: 1811, year: 1808, era: 'early 19th century', genre: 'novella', level: 'literary', variety: OLD },
    { slug: 'fontane-effi-briest', title: 'Effi Briest', author: 'Theodor Fontane', died: 1898, year: 1895, era: '19th century', genre: 'novel', level: 'literary', variety: OLD },
    { slug: 'hoffmann-der-sandmann', title: 'Der Sandmann', author: 'E. T. A. Hoffmann', died: 1822, year: 1816, era: 'early 19th century', genre: 'story', level: 'literary', variety: OLD },
    { slug: 'buechner-lenz', title: 'Lenz', author: 'Georg Büchner', died: 1837, year: 1839, era: '19th century', genre: 'story', level: 'literary', variety: OLD, notes: 'Published after the author\'s death from his papers: editions differ.' },
    { slug: 'kafka-der-process', title: 'Der Process', author: 'Franz Kafka', died: 1924, year: 1925, era: 'early 20th century', genre: 'novel', level: 'literary', variety: 'de-1901',
      rights: lead('The author died in 1924. Published in 1925 from his papers by Max Brod (died 1968), who arranged the chapters.'),
      notes: 'A posthumous work: the arrangement of the first edition is an editor\'s, and the critical editions are modern editorial work with their own rights.' },
    { slug: 'mann-tonio-kroeger', title: 'Tonio Kröger', author: 'Thomas Mann', died: 1955, year: 1903, era: 'early 20th century', genre: 'novella', level: 'literary', variety: 'de-1901',
      rights: lead('The author died in 1955; first published 1903. Where the term is the author\'s life plus seventy years it ran to the end of 2025; publication before 1929 matters for the United States.') },
    { slug: 'zweig-schachnovelle', title: 'Schachnovelle', author: 'Stefan Zweig', died: 1942, year: 1942, region: 'Austria', era: '20th century', genre: 'novella', level: 'advanced', variety: 'de-1901',
      rights: lead('The author died in 1942; first published 1942. Out of copyright where the term is the author\'s life plus seventy years, and NOT necessarily in the United States, where the term of a work first published in 1942 runs from publication.') },
  ]),

  // ── Shelves 11–12: major literature ──
  ...works(11, [
    { slug: 'goethe-werther', title: 'Die Leiden des jungen Werthers', author: 'Johann Wolfgang von Goethe', died: 1832, year: 1774, era: '18th century', genre: 'epistolary novel', level: 'classical', variety: OLD, registers: ['literary'] },
    { slug: 'schiller-wilhelm-tell', title: 'Wilhelm Tell', author: 'Friedrich Schiller', died: 1805, year: 1804, era: 'early 19th century', genre: 'verse drama', level: 'classical', variety: OLD, registers: ['literary'] },
    { slug: 'schiller-kabale-und-liebe', title: 'Kabale und Liebe', author: 'Friedrich Schiller', died: 1805, year: 1784, era: '18th century', genre: 'prose drama', level: 'classical', variety: OLD },
    { slug: 'lessing-emilia-galotti', title: 'Emilia Galotti', author: 'Gotthold Ephraim Lessing', died: 1781, year: 1772, era: '18th century', genre: 'prose drama', level: 'classical', variety: OLD },
    { slug: 'lessing-nathan-der-weise', title: 'Nathan der Weise', author: 'Gotthold Ephraim Lessing', died: 1781, year: 1779, era: '18th century', genre: 'verse drama', level: 'classical', variety: OLD, registers: ['literary'] },
    { slug: 'novalis-ofterdingen', title: 'Heinrich von Ofterdingen', author: 'Novalis', died: 1801, year: 1802, era: 'early 19th century', genre: 'novel', level: 'classical', variety: OLD, registers: ['literary'] },
  ]),
  ...works(12, [
    { slug: 'goethe-faust-1', title: 'Faust. Der Tragödie erster Teil', author: 'Johann Wolfgang von Goethe', died: 1832, year: 1808, era: 'early 19th century', genre: 'verse drama', level: 'classical', variety: OLD, registers: ['literary'] },
    { slug: 'fontane-der-stechlin', title: 'Der Stechlin', author: 'Theodor Fontane', died: 1898, year: 1898, era: '19th century', genre: 'novel', level: 'literary', variety: OLD },
    { slug: 'kafka-das-schloss', title: 'Das Schloss', author: 'Franz Kafka', died: 1924, year: 1926, era: 'early 20th century', genre: 'novel', level: 'literary', variety: 'de-1901',
      rights: lead('The author died in 1924. Published in 1926 from his papers by Max Brod (died 1968).'), notes: 'A posthumous work: see Der Process.' },
    { slug: 'mann-buddenbrooks', title: 'Buddenbrooks', author: 'Thomas Mann', died: 1955, year: 1901, era: 'early 20th century', genre: 'novel', level: 'literary', variety: 'de-1901',
      rights: lead('The author died in 1955; first published 1901. Where the term is the author\'s life plus seventy years it ran to the end of 2025; publication before 1929 matters for the United States.') },
  ]),

  // ── Shelf 13: open reading — theology, philosophy, history, science and engineering ──
  ...works(13, [
    { slug: 'luther-kleiner-katechismus', title: 'Der Kleine Katechismus', author: 'Martin Luther', died: 1546, year: 1529, streams: ['knowledge', 'mission'], era: '16th century', genre: 'catechism', level: 'intermediate', domains: ['theology'], registers: ['religious', 'archaic'],
      notes: 'Sixteenth-century German: almost every edition in use is a later modernisation, and each such edition is its own text.' },
    { slug: 'luther-freiheit-eines-christenmenschen', title: 'Von der Freiheit eines Christenmenschen', author: 'Martin Luther', died: 1546, year: 1520, streams: ['knowledge'], era: '16th century', genre: 'treatise', level: 'classical', domains: ['theology'], registers: ['religious', 'archaic'],
      notes: 'Early New High German in the original; modernised editions are separate texts.' },
    { slug: 'schleiermacher-ueber-die-religion', title: 'Über die Religion. Reden an die Gebildeten unter ihren Verächtern', author: 'Friedrich Schleiermacher', died: 1834, year: 1799, streams: ['knowledge'], era: '18th century', genre: 'speeches', level: 'classical', domains: ['theology', 'philosophy'], variety: OLD },
    { slug: 'bonhoeffer-nachfolge', title: 'Nachfolge', author: 'Dietrich Bonhoeffer', died: 1945, year: 1937, streams: ['knowledge', 'mission'], era: '20th century', genre: 'theology', level: 'advanced', domains: ['theology'], variety: 'de-1901',
      rights: lead('The author died in 1945; first published 1937. Where the term is the author\'s life plus seventy years it ran to the end of 2015; the United States counts from publication.') },
    { slug: 'kant-was-ist-aufklaerung', title: 'Beantwortung der Frage: Was ist Aufklärung?', author: 'Immanuel Kant', died: 1804, year: 1784, streams: ['knowledge'], era: '18th century', genre: 'essay', level: 'classical', domains: ['philosophy'], variety: OLD },
    { slug: 'kant-kritik-der-reinen-vernunft', title: 'Kritik der reinen Vernunft', author: 'Immanuel Kant', died: 1804, year: 1781, streams: ['knowledge'], era: '18th century', genre: 'philosophy', level: 'classical', domains: ['philosophy'], variety: OLD },
    { slug: 'nietzsche-zarathustra', title: 'Also sprach Zarathustra', author: 'Friedrich Nietzsche', died: 1900, year: 1883, streams: ['knowledge', 'library'], era: '19th century', genre: 'philosophical prose', level: 'classical', domains: ['philosophy'], variety: OLD, registers: ['literary'] },
    { slug: 'rilke-malte', title: 'Die Aufzeichnungen des Malte Laurids Brigge', author: 'Rainer Maria Rilke', died: 1926, year: 1910, streams: ['library'], era: 'early 20th century', genre: 'novel', level: 'literary', variety: 'de-1901' },
    { slug: 'rilke-briefe-an-einen-jungen-dichter', title: 'Briefe an einen jungen Dichter', author: 'Rainer Maria Rilke', died: 1926, year: 1929, streams: ['library', 'knowledge'], era: 'early 20th century', genre: 'letters', level: 'advanced', variety: 'de-1901',
      rights: lead('The author died in 1926. Published in 1929 by the recipient, Franz Xaver Kappus (died 1966), with an introduction of his own.'),
      notes: 'The introduction is by another author and has its own term.' },
    { slug: 'schiller-dreissigjaehriger-krieg', title: 'Geschichte des Dreißigjährigen Kriegs', author: 'Friedrich Schiller', died: 1805, year: 1790, streams: ['knowledge'], era: '18th century', genre: 'history', level: 'classical', domains: ['history'], variety: OLD },
    { slug: 'mommsen-roemische-geschichte', title: 'Römische Geschichte', author: 'Theodor Mommsen', died: 1903, year: 1854, streams: ['knowledge'], era: '19th century', genre: 'history', level: 'literary', domains: ['history', 'classics'], variety: OLD },
    { slug: 'humboldt-ansichten-der-natur', title: 'Ansichten der Natur', author: 'Alexander von Humboldt', died: 1859, year: 1808, streams: ['knowledge'], era: 'early 19th century', genre: 'natural history essays', level: 'literary', domains: ['science', 'geography'], variety: OLD },
    { slug: 'lilienthal-vogelflug', title: 'Der Vogelflug als Grundlage der Fliegekunst', author: 'Otto Lilienthal', died: 1896, year: 1889, streams: ['knowledge'], era: '19th century', genre: 'engineering treatise', level: 'advanced', domains: ['science', 'engineering', 'aviation'], variety: OLD,
      notes: 'Technical German of the 1880s with figures and tables; the figures are part of the work.' },
  ]),

  // ── Scripture ──
  ...works(4, [
    { slug: 'lutherbibel-1912', title: 'Die Bibel nach der deutschen Übersetzung D. Martin Luthers (1912)', author: 'Martin Luther (revised 1912)', died: 1546, year: 1912, edition: 'the revision of 1912, as distributed by eBible.org (deu1912)',
      streams: ['scripture', 'mission'], era: 'early 20th century', genre: 'Bible translation', level: 'intermediate', registers: ['religious', 'archaic'], domains: ['theology'], variety: 'de-1901',
      rights: LUTHER_1912_RIGHTS, ingestion: 'bundled', readiness: 'implemented', sourceUrl: 'https://ebible.org/deu1912/',
      notes: 'The course\'s Scripture baseline. Spelling of 1912 (daß, muß) and biblical vocabulary are related to today\'s German in the analysis; the text is never changed. Only a slice is bundled.' },
    { slug: 'elberfelder-1905', title: 'Elberfelder Bibel (1905)', year: 1905, streams: ['scripture'], era: 'early 20th century', genre: 'Bible translation', level: 'advanced', registers: ['religious'], domains: ['theology'], variety: 'de-1901',
      rights: lead('A translation first published complete in 1871, in the revised edition of 1905; several translators.'), notes: 'A candidate only: the exact digital source and its terms are not checked.' },
    { slug: 'schlachter-1905', title: 'Schlachter-Bibel (Miniaturbibel, 1905)', author: 'Franz Eugen Schlachter (translator)', died: 1911, year: 1905, streams: ['scripture'], era: 'early 20th century', genre: 'Bible translation', level: 'intermediate', registers: ['religious'], domains: ['theology'], variety: 'de-1901',
      notes: 'A candidate only. Later revisions (1951, 2000) are different texts with rights of their own.' },
  ]),
];

/** Texts that are not placed on a shelf by this file: the learner's own books and his testimony. */
export const GERMAN_OUTSIDE_SHELVES = ['testimony'] as const;

/** Doors on Home and Explore; each is a filter on the catalogue, never a separate course. */
export const GERMAN_DOORS = [
  { key: 'acquisition', label: 'Acquisition Path', stream: 'acquisition' },
  { key: 'conversation', label: 'Conversations', stream: 'conversation' },
  { key: 'germany', label: 'Germany', stream: 'germany' },
  { key: 'stories', label: 'Stories', stream: 'library' },
  { key: 'bible', label: 'Bible', stream: 'scripture' },
  { key: 'history', label: 'History', domain: 'history' },
  { key: 'science', label: 'Science & Engineering', domain: 'science' },
  { key: 'theology', label: 'Theology', domain: 'theology' },
  { key: 'classics', label: 'Classics', stages: ['s9', 's10', 's11', 's12'] },
  { key: 'your-books', label: 'Your Books', stream: 'personal' },
] as const;

/**
 * Scripture policy as data. The baseline is a public-domain text with its evidence; modern German translations
 * belong to their publishers and are never bundled without written permission.
 */
export const GERMAN_SCRIPTURE_POLICY = {
  baseline: { name: 'Lutherbibel 1912', translationId: 'deu1912', workSlug: 'lutherbibel-1912', status: 'verified-public-domain (a slice is bundled; each verse byte-verified against the distributor)' },
  candidates: [
    { name: 'Elberfelder Bibel 1905', status: 'candidate-unverified' },
    { name: 'Schlachter-Bibel 1905', status: 'candidate-unverified' },
  ],
  notBundled: [
    'Lutherbibel 1984 / 2017 (Deutsche Bibelgesellschaft)', 'Elberfelder Bibel, revised editions', 'Schlachter 2000', 'Einheitsübersetzung',
    'Hoffnung für alle', 'Neue Genfer Übersetzung', 'Gute Nachricht Bibel', 'Neues Leben', 'BasisBibel',
  ],
  rule: 'A modern translation is shown only from the learner\'s own copy or with the publisher\'s written permission on file. The Scripture surface is German text with English rescue, not a parallel-Bible interface.',
  audio: 'No recording is bundled. Text rights and recording rights are separate: a public-domain text read by someone is that reader\'s or publisher\'s recording.',
} as const;
