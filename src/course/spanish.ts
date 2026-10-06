/**
 * The Spanish course (Honduras team): streams, shelves and the first catalogue of works.
 *
 * Spanish has the opposite problem from Thai: a surplus of content. So this is not a ladder. It is the seed of a
 * catalogue: streams (what kind of reading), shelves (how far from a beginner, as an orientation only — shelves are
 * never locks) and candidate works with conservative rights records. What the learner reads next is decided by his
 * own record (GoLearn), not by this file.
 *
 * RIGHTS: nothing here has been checked by a person against a source, except where `verified` says so. A date of
 * death or of first publication is a LEAD for research and is recorded as such; it is never turned into
 * "public domain". An old work in a modern edition can carry new rights (editing, notes, modernised spelling).
 * BIBLIOGRAPHY: titles, authors and dates are from general knowledge and are marked unverified.
 */
import type { RegisterTag, Stage, Stream, Work, WorkRights, WorkRole } from '../core';
import { DEFAULT_ASSISTANCE, ids } from '../core';
import { acquiredWorks } from './acquired';
import { readingBridgeWorks } from './readingBridges';
import { CURRICULUM_ACQUIRED_WORKS } from './curriculumAcquired';

export const SPANISH_COURSE_ID = 'honduras-es';
const LANG = 'es' as const;

// ───────────────────────────── streams ─────────────────────────────

const stream = (order: number, key: string, kind: Stream['kind'], label: string, description: string, available = true): Stream => ({
  id: ids.stream(SPANISH_COURSE_ID, key), courseId: SPANISH_COURSE_ID, lang: LANG, key, label, description, kind, order, available,
});

/** One learner model, many content surfaces. A word learned on one shelf is known on every other. */
export const SPANISH_STREAMS: Stream[] = [
  stream(0, 'acquisition', 'acquisition', 'Acquisition Path', 'Controlled, highly comprehensible Spanish written for the course: the launch ramp into real texts.'),
  stream(1, 'library', 'library', 'Stories', 'The reading library: readers, folktales, narrative, novels, from easy to classical.'),
  stream(2, 'honduras', 'regional', 'Honduras', 'Honduras and Central America: everyday language, places, history, church and family life.'),
  stream(3, 'knowledge', 'knowledge', 'Knowledge', 'Nonfiction: history, science and engineering, theology, biography and more.'),
  stream(4, 'scripture', 'scripture', 'Bible', 'Scripture read directly in Spanish, with English only as rescue.'),
  stream(5, 'mission', 'mission', 'Mission', 'Language for the gospel, testimony, prayer, church and ordinary conversation in ministry.'),
  stream(6, 'personal', 'personal', 'Your Books', 'Your own lawful copies, on this device only, read with the same help as everything else.'),
  // GoListen is deferred to V2: the stream exists as data so that audio can attach to texts later.
  stream(7, 'listening', 'listening', 'Listen', 'Audio attached to texts, when rights-clear recordings exist.', false),
];

// ───────────────────────────── shelves ─────────────────────────────

const shelf = (index: number, label: string, purpose: string[]): Stage => ({
  id: ids.stage(SPANISH_COURSE_ID, `s${index}`), courseId: SPANISH_COURSE_ID, lang: LANG, index, key: `s${index}`, label, kind: 'shelf', purpose,
  // Shelves do not change how the reader behaves: the word sheet is the same everywhere, help appears when asked for.
  assistance: DEFAULT_ASSISTANCE,
});

/** Shelves, not locks: an orientation for browsing. Personal difficulty is computed per learner, per text. */
export const SPANISH_SHELVES: Stage[] = [
  shelf(0, 'Controlled Spanish', ['written for the course', 'very high repetition of core language', 'narrative, not exercises']),
  shelf(1, 'Early readers', ['children\'s readers', 'fables and folktales', 'simple narrative', 'historical school readers']),
  shelf(2, 'Easy authentic narrative', ['short stories and tales written for native readers', 'plain narrative prose']),
  shelf(3, 'Juvenile and popular', ['longer stories', 'popular and young readers\' fiction', 'your own modern books']),
  shelf(4, 'General modern prose', ['novels', 'journalism', 'biography', 'nonfiction']),
  shelf(5, 'Nineteenth and twentieth century', ['literary Spanish of the 1800s and early 1900s']),
  shelf(6, 'Golden Age and early modern', ['classical Spanish: older spelling, forms and meanings']),
  shelf(7, 'Medieval and historical', ['medieval Spanish: read with notes, never a model for speaking']),
];

// ───────────────────────────── rights records ─────────────────────────────

const BASE: WorkRights = {
  state: 'rights-unverified', copyrightStatus: 'unknown', permission: 'unknown', canBundle: false, userImportOnly: true,
  canModify: false, canStoreOffline: false, canBundleAudio: false, audiobook: 'unknown', verified: false,
  acquisitionNotes: 'Rights not verified. Nothing is bundled until a person records the basis and the exact source edition.',
};

/** An old work: the date is a lead. The edition actually used still has to be identified and checked. */
const lead = (basis: string): WorkRights => ({
  ...BASE, basis: `${basis} A lead for verification, not a conclusion: the specific edition and source must be checked, and terms differ by country.`,
  jurisdiction: 'not established',
});

/** A modern work under copyright: listed so the learner can find it; the app holds no text. Read it from your own copy. */
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
  purpose?: string[]; notes?: string; ingestion?: Work['ingestion']; sourceUrl?: string;
}
const works = (shelfIndex: number, list: W[]): Work[] => list.map((w) => ({
  id: ids.work(SPANISH_COURSE_ID, w.slug), courseId: SPANISH_COURSE_ID, lang: LANG, stageId: ids.stage(SPANISH_COURSE_ID, `s${shelfIndex}`),
  role: w.role ?? 'subsidiary', order: order++, title: w.title, author: w.author, purpose: w.purpose ?? [], registers: w.registers,
  rights: acquiredWorks[LANG]?.[w.slug]?.rights ?? w.rights ?? (w.died !== undefined ? lead(`The author died in ${w.died}${w.year ? `; first published ${w.year}` : ''}.`) : BASE),
  bibliographyVerified: false, optional: true, notes: w.notes,
  streams: w.streams ?? ['library'], variety: w.variety, region: w.region, era: w.era, genre: w.genre, audience: w.audience, domains: w.domains,
  genericLevel: w.level, publicationYear: w.year, authorDied: w.died, ingestion: acquiredWorks[LANG]?.[w.slug]?.installed ? 'ingested' : w.ingestion ?? 'catalogued', sourceUrl: acquiredWorks[LANG]?.[w.slug]?.sourceUrl ?? w.sourceUrl,
  edition: acquiredWorks[LANG]?.[w.slug]?.edition,
  readiness: acquiredWorks[LANG]?.[w.slug]?.installed ? 'implemented' : undefined,
}));

const SPAIN = { variety: 'es-ES', region: 'Spain' } as const;

export const SPANISH_WORKS: Work[] = [
  ...CURRICULUM_ACQUIRED_WORKS.filter(w => w.lang === 'es'),
  ...readingBridgeWorks('es'),
  // ── Shelf 0: controlled Spanish written for the course ──
  ...works(0, [
    { slug: 'camino-1', title: 'Camino 1 — Primeros pasos', role: 'spine', streams: ['acquisition'], variety: 'es-419', level: 'controlled', genre: 'microstories', rights: COURSE, ingestion: 'bundled',
      purpose: ['present tense of the commonest verbs', 'people, home, food, places', 'ser / estar / tener / querer / ir'], notes: 'Machine-drafted prototype: not reviewed by a native speaker, so it is visible in preview only.' },
    { slug: 'camino-2', title: 'Camino 2 — Días y lugares', role: 'spine', streams: ['acquisition'], variety: 'es-419', level: 'controlled', genre: 'short narrative', rights: COURSE, ingestion: 'bundled',
      purpose: ['past narration (preterite and imperfect) met in stories', 'object pronouns', 'ir a + infinitive, tener que, acabar de'], notes: 'Machine-drafted prototype: preview only until reviewed.' },
    { slug: 'camino-3', title: 'Camino 3 — Historias', role: 'spine', streams: ['acquisition'], variety: 'es-419', level: 'controlled', genre: 'narrative', rights: COURSE, ingestion: 'bundled',
      purpose: ['longer connected narrative', 'subordinate clauses', 'the subjunctive met naturally', 'perfect tenses'], notes: 'Machine-drafted prototype: preview only until reviewed.' },
    { slug: 'honduras-lecturas-1', title: 'Honduras — Lecturas 1', role: 'spine', streams: ['honduras', 'acquisition'], variety: 'es-HN', region: 'Honduras', level: 'controlled', genre: 'short readings', rights: COURSE, ingestion: 'bundled',
      purpose: ['everyday Honduran settings', 'usted and vos in ordinary use', 'common regional words, marked as regional'],
      notes: 'Machine-drafted prototype. Facts about Honduras and regional usage must be checked by a Honduran reviewer before publication.' },
  ]),

  // ── Shelf 1: early readers, fables, tales ──
  ...works(1, [
    { slug: 'marti-edad-de-oro', title: 'La Edad de Oro', author: 'José Martí', died: 1895, year: 1889, region: 'Cuba', variety: 'es-419', era: '19th century', genre: 'children\'s magazine: stories, essays, verse', audience: 'children', level: 'easy' },
    { slug: 'samaniego-fabulas', title: 'Fábulas en verso castellano', author: 'Félix María de Samaniego', died: 1801, ...SPAIN, era: '18th century', genre: 'fables in verse', audience: 'children', level: 'easy', registers: ['literary'] },
    { slug: 'iriarte-fabulas', title: 'Fábulas literarias', author: 'Tomás de Iriarte', died: 1791, year: 1782, ...SPAIN, era: '18th century', genre: 'fables in verse', level: 'intermediate', registers: ['literary'] },
    { slug: 'calleja-cuentos', title: 'Cuentos de Calleja', author: 'Saturnino Calleja (publisher)', died: 1915, ...SPAIN, era: 'late 19th – early 20th century', genre: 'children\'s tales', audience: 'children', level: 'easy',
      notes: 'A publisher\'s series of many small volumes by various hands: each tale needs its own source and rights check.' },
  ]),

  // ── Shelf 2: easy authentic narrative ──
  ...works(2, [
    { slug: 'quiroga-cuentos-de-la-selva', title: 'Cuentos de la selva', author: 'Horacio Quiroga', died: 1937, year: 1918, region: 'Uruguay / Argentina', variety: 'es-419', era: 'early 20th century', genre: 'animal tales', audience: 'children', level: 'easy' },
    { slug: 'alarcon-capitan-veneno', title: 'El capitán Veneno', author: 'Pedro Antonio de Alarcón', died: 1891, year: 1881, ...SPAIN, era: '19th century', genre: 'short novel', level: 'intermediate' },
    { slug: 'pardo-bazan-cuentos', title: 'Cuentos (selección)', author: 'Emilia Pardo Bazán', died: 1921, ...SPAIN, era: 'late 19th – early 20th century', genre: 'short stories', level: 'intermediate' },
    { slug: 'palma-tradiciones-peruanas', title: 'Tradiciones peruanas (selección)', author: 'Ricardo Palma', died: 1919, region: 'Peru', variety: 'es-419', era: '19th century', genre: 'historical anecdotes', level: 'intermediate', domains: ['history'] },
  ]),

  // ── Shelf 3: juvenile and popular (modern books are "your copy" only) ──
  ...works(3, [
    { slug: 'jimenez-platero-y-yo', title: 'Platero y yo', author: 'Juan Ramón Jiménez', died: 1958, year: 1914, ...SPAIN, era: 'early 20th century', genre: 'prose poems', level: 'intermediate', registers: ['literary'],
      rights: lead('The author died in 1958; first published 1914. Still protected in countries with long terms (Spain among them, as far as we know); first publication before 1929 matters for the United States.') },
    { slug: 'riordan-ladron-del-rayo', title: 'Percy Jackson y los dioses del Olimpo: El ladrón del rayo', author: 'Rick Riordan (Spanish translation)', genre: 'fantasy novel in translation', audience: 'young readers', level: 'intermediate', streams: ['library', 'personal'], rights: modern('A modern novel in a modern translation.') },
    { slug: 'rowling-piedra-filosofal', title: 'Harry Potter y la piedra filosofal', author: 'J. K. Rowling (Spanish translation)', genre: 'fantasy novel in translation', audience: 'young readers', level: 'intermediate', streams: ['library', 'personal'], rights: modern('A modern novel in a modern translation.') },
    { slug: 'colfer-tierra-de-las-historias', title: 'La tierra de las historias: El hechizo de los deseos', author: 'Chris Colfer (Spanish translation)', genre: 'fantasy novel in translation', audience: 'young readers', level: 'intermediate', streams: ['library', 'personal'], rights: modern('A modern novel in a modern translation.') },
    { slug: 'tolkien-el-hobbit', title: 'El hobbit', author: 'J. R. R. Tolkien (Spanish translation)', genre: 'fantasy novel in translation', level: 'intermediate', streams: ['library', 'personal'], rights: modern('A modern novel in a modern translation.') },
  ]),

  // ── Shelf 4: general modern prose (mostly in copyright: recommended, never bundled) ──
  ...works(4, [
    { slug: 'garcia-marquez-relato-de-un-naufrago', title: 'Relato de un náufrago', author: 'Gabriel García Márquez', died: 2014, year: 1970, region: 'Colombia', variety: 'es-419', era: '20th century', genre: 'narrative journalism', level: 'intermediate', rights: modern('Published 1970; the author died in 2014.') },
    { slug: 'garcia-marquez-cien-anos', title: 'Cien años de soledad', author: 'Gabriel García Márquez', died: 2014, year: 1967, region: 'Colombia', variety: 'es-419', era: '20th century', genre: 'novel', level: 'advanced', registers: ['literary'], rights: modern('Published 1967; the author died in 2014.') },
    { slug: 'palacio-valdes-hermana-san-sulpicio', title: 'La hermana San Sulpicio', author: 'Armando Palacio Valdés', died: 1938, year: 1889, ...SPAIN, era: '19th century', genre: 'novel', level: 'intermediate' },
    { slug: 'isaacs-maria', title: 'María', author: 'Jorge Isaacs', died: 1895, year: 1867, region: 'Colombia', variety: 'es-419', era: '19th century', genre: 'novel', level: 'advanced', registers: ['literary'] },
  ]),

  // ── Honduras and Central America ──
  ...works(4, [
    { slug: 'turcios-el-vampiro', title: 'El vampiro', author: 'Froylán Turcios', died: 1943, year: 1910, streams: ['honduras', 'library'], region: 'Honduras', variety: 'es-HN', era: 'early 20th century', genre: 'novel', level: 'advanced', registers: ['literary'] },
    { slug: 'turcios-cuentos-amor-muerte', title: 'Cuentos del amor y de la muerte', author: 'Froylán Turcios', died: 1943, year: 1930, streams: ['honduras', 'library'], region: 'Honduras', variety: 'es-HN', era: 'early 20th century', genre: 'short stories', level: 'advanced', registers: ['literary'] },
    { slug: 'molina-tierras-mares-cielos', title: 'Tierras, mares y cielos', author: 'Juan Ramón Molina', died: 1908, year: 1911, streams: ['honduras', 'library'], region: 'Honduras', variety: 'es-HN', era: 'early 20th century', genre: 'poetry and prose', level: 'literary', registers: ['literary'] },
    { slug: 'gamero-blanca-olmedo', title: 'Blanca Olmedo', author: 'Lucila Gamero de Medina', died: 1964, year: 1908, streams: ['honduras', 'library'], region: 'Honduras', variety: 'es-HN', era: 'early 20th century', genre: 'novel', level: 'advanced',
      rights: lead('The author died in 1964; first published 1908. Still protected where the term runs from the author\'s death; first publication before 1929 matters for the United States.') },
    { slug: 'amaya-amador-prision-verde', title: 'Prisión verde', author: 'Ramón Amaya Amador', died: 1966, year: 1950, streams: ['honduras', 'library'], region: 'Honduras', variety: 'es-HN', era: '20th century', genre: 'novel', level: 'advanced', rights: modern('Published 1950; the author died in 1966.'),
      notes: 'A social novel of the banana plantations: reading material, never instruction in a political position.' },
    { slug: 'amaya-amador-cipotes', title: 'Cipotes', author: 'Ramón Amaya Amador', died: 1966, year: 1981, streams: ['honduras', 'library'], region: 'Honduras', variety: 'es-HN', era: '20th century', genre: 'novel', level: 'intermediate', rights: modern('Published posthumously (1981); the author died in 1966.') },
    { slug: 'sosa-los-pobres', title: 'Los pobres', author: 'Roberto Sosa', died: 2011, year: 1969, streams: ['honduras', 'library'], region: 'Honduras', variety: 'es-HN', era: '20th century', genre: 'poetry', level: 'literary', registers: ['literary'], rights: modern('Published 1969; the author died in 2011.') },
    { slug: 'salarrue-cuentos-de-barro', title: 'Cuentos de barro', author: 'Salarrué (Salvador Salazar Arrué)', died: 1975, year: 1933, streams: ['honduras', 'library'], region: 'El Salvador', variety: 'es-CA', era: '20th century', genre: 'short stories', level: 'advanced', registers: ['colloquial', 'literary'], rights: modern('Published 1933; the author died in 1975.'),
      notes: 'Rural Salvadoran speech written as spoken: regional forms must be marked as regional.' },
    { slug: 'asturias-leyendas-de-guatemala', title: 'Leyendas de Guatemala', author: 'Miguel Ángel Asturias', died: 1974, year: 1930, streams: ['honduras', 'library'], region: 'Guatemala', variety: 'es-CA', era: '20th century', genre: 'legends', level: 'literary', registers: ['literary'], rights: modern('Published 1930; the author died in 1974.') },
    { slug: 'dario-azul', title: 'Azul...', author: 'Rubén Darío', died: 1916, year: 1888, streams: ['honduras', 'library'], region: 'Nicaragua', variety: 'es-CA', era: '19th century', genre: 'stories and poems', level: 'literary', registers: ['literary'] },
  ]),

  // ── Shelf 5: nineteenth and twentieth century literary Spanish ──
  ...works(5, [
    { slug: 'galdos-marianela', title: 'Marianela', author: 'Benito Pérez Galdós', died: 1920, year: 1878, ...SPAIN, era: '19th century', genre: 'novel', level: 'advanced' },
    { slug: 'galdos-dona-perfecta', title: 'Doña Perfecta', author: 'Benito Pérez Galdós', died: 1920, year: 1876, ...SPAIN, era: '19th century', genre: 'novel', level: 'advanced' },
    { slug: 'galdos-trafalgar', title: 'Trafalgar (Episodios nacionales)', author: 'Benito Pérez Galdós', died: 1920, year: 1873, ...SPAIN, era: '19th century', genre: 'historical novel', level: 'advanced', domains: ['history'] },
    { slug: 'galdos-misericordia', title: 'Misericordia', author: 'Benito Pérez Galdós', died: 1920, year: 1897, ...SPAIN, era: '19th century', genre: 'novel', level: 'literary' },
    { slug: 'galdos-fortunata-y-jacinta', title: 'Fortunata y Jacinta', author: 'Benito Pérez Galdós', died: 1920, year: 1887, ...SPAIN, era: '19th century', genre: 'novel', level: 'literary' },
    { slug: 'becquer-leyendas', title: 'Leyendas', author: 'Gustavo Adolfo Bécquer', died: 1870, ...SPAIN, era: '19th century', genre: 'legends in prose', level: 'literary', registers: ['literary'] },
    { slug: 'becquer-rimas', title: 'Rimas', author: 'Gustavo Adolfo Bécquer', died: 1870, year: 1871, ...SPAIN, era: '19th century', genre: 'poetry', level: 'literary', registers: ['literary'] },
    { slug: 'clarin-adios-cordera', title: '¡Adiós, Cordera!', author: 'Leopoldo Alas «Clarín»', died: 1901, year: 1892, ...SPAIN, era: '19th century', genre: 'short story', level: 'advanced' },
    { slug: 'clarin-la-regenta', title: 'La Regenta', author: 'Leopoldo Alas «Clarín»', died: 1901, year: 1884, ...SPAIN, era: '19th century', genre: 'novel', level: 'literary' },
    { slug: 'pardo-bazan-pazos-de-ulloa', title: 'Los pazos de Ulloa', author: 'Emilia Pardo Bazán', died: 1921, year: 1886, ...SPAIN, era: '19th century', genre: 'novel', level: 'literary' },
    { slug: 'valera-pepita-jimenez', title: 'Pepita Jiménez', author: 'Juan Valera', died: 1905, year: 1874, ...SPAIN, era: '19th century', genre: 'novel', level: 'literary' },
    { slug: 'alarcon-sombrero-de-tres-picos', title: 'El sombrero de tres picos', author: 'Pedro Antonio de Alarcón', died: 1891, year: 1874, ...SPAIN, era: '19th century', genre: 'short novel', level: 'advanced' },
    { slug: 'unamuno-niebla', title: 'Niebla', author: 'Miguel de Unamuno', died: 1936, year: 1914, ...SPAIN, era: 'early 20th century', genre: 'novel', level: 'literary', domains: ['philosophy'] },
    { slug: 'unamuno-san-manuel-bueno', title: 'San Manuel Bueno, mártir', author: 'Miguel de Unamuno', died: 1936, year: 1931, ...SPAIN, era: 'early 20th century', genre: 'short novel', level: 'literary', domains: ['philosophy', 'theology'] },
    { slug: 'baroja-arbol-de-la-ciencia', title: 'El árbol de la ciencia', author: 'Pío Baroja', died: 1956, year: 1911, ...SPAIN, era: 'early 20th century', genre: 'novel', level: 'literary',
      rights: lead('The author died in 1956; first published 1911. Still protected in countries with long terms (Spain among them, as far as we know); first publication before 1929 matters for the United States.') },
    { slug: 'baroja-zalacain', title: 'Zalacaín el aventurero', author: 'Pío Baroja', died: 1956, year: 1909, ...SPAIN, era: 'early 20th century', genre: 'adventure novel', level: 'advanced',
      rights: lead('The author died in 1956; first published 1909. Still protected in countries with long terms (Spain among them, as far as we know); first publication before 1929 matters for the United States.') },
    { slug: 'marti-versos-sencillos', title: 'Versos sencillos', author: 'José Martí', died: 1895, year: 1891, region: 'Cuba', variety: 'es-419', era: '19th century', genre: 'poetry', level: 'advanced', registers: ['literary'] },
    { slug: 'dario-cantos-de-vida-y-esperanza', title: 'Cantos de vida y esperanza', author: 'Rubén Darío', died: 1916, year: 1905, region: 'Nicaragua', variety: 'es-CA', streams: ['library', 'honduras'], era: 'early 20th century', genre: 'poetry', level: 'literary', registers: ['literary'] },
  ]),

  // ── Shelf 6: Golden Age and early modern ──
  ...works(6, [
    { slug: 'lazarillo-de-tormes', title: 'La vida de Lazarillo de Tormes', author: undefined, year: 1554, ...SPAIN, variety: 'es-hist', era: '16th century', genre: 'picaresque novel', level: 'classical', registers: ['archaic', 'literary'],
      rights: lead('Anonymous; first printed 1554.'), notes: 'Author unknown.' },
    { slug: 'cervantes-don-quijote', title: 'El ingenioso hidalgo don Quijote de la Mancha', author: 'Miguel de Cervantes', died: 1616, year: 1605, ...SPAIN, variety: 'es-hist', era: '17th century', genre: 'novel', level: 'classical', registers: ['archaic', 'literary'],
      notes: 'Part I 1605, Part II 1615. Modernised-spelling editions are separate works with their own rights.' },
    { slug: 'cervantes-novelas-ejemplares', title: 'Novelas ejemplares', author: 'Miguel de Cervantes', died: 1616, year: 1613, ...SPAIN, variety: 'es-hist', era: '17th century', genre: 'short novels', level: 'classical', registers: ['archaic', 'literary'] },
    { slug: 'quevedo-el-buscon', title: 'Historia de la vida del Buscón', author: 'Francisco de Quevedo', died: 1645, year: 1626, ...SPAIN, variety: 'es-hist', era: '17th century', genre: 'picaresque novel', level: 'classical', registers: ['archaic', 'literary'] },
    { slug: 'lope-fuenteovejuna', title: 'Fuenteovejuna', author: 'Lope de Vega', died: 1635, year: 1619, ...SPAIN, variety: 'es-hist', era: '17th century', genre: 'verse drama', level: 'classical', registers: ['archaic', 'literary'] },
    { slug: 'calderon-la-vida-es-sueno', title: 'La vida es sueño', author: 'Pedro Calderón de la Barca', died: 1681, year: 1635, ...SPAIN, variety: 'es-hist', era: '17th century', genre: 'verse drama', level: 'classical', registers: ['archaic', 'literary'], domains: ['philosophy'] },
    { slug: 'teresa-libro-de-la-vida', title: 'Libro de la vida', author: 'Santa Teresa de Jesús', died: 1582, ...SPAIN, variety: 'es-hist', era: '16th century', genre: 'spiritual autobiography', level: 'classical', registers: ['archaic', 'religious'], domains: ['theology'], streams: ['library', 'knowledge'] },
    { slug: 'teresa-las-moradas', title: 'Las moradas (El castillo interior)', author: 'Santa Teresa de Jesús', died: 1582, ...SPAIN, variety: 'es-hist', era: '16th century', genre: 'spiritual treatise', level: 'classical', registers: ['archaic', 'religious'], domains: ['theology'], streams: ['library', 'knowledge'] },
    { slug: 'juan-de-la-cruz-poesias', title: 'Cántico espiritual y Noche oscura', author: 'San Juan de la Cruz', died: 1591, ...SPAIN, variety: 'es-hist', era: '16th century', genre: 'mystical poetry', level: 'classical', registers: ['archaic', 'religious', 'literary'], domains: ['theology'], streams: ['library', 'knowledge'] },
    { slug: 'luis-de-leon-nombres-de-cristo', title: 'De los nombres de Cristo', author: 'Fray Luis de León', died: 1591, year: 1583, ...SPAIN, variety: 'es-hist', era: '16th century', genre: 'theological dialogue', level: 'classical', registers: ['archaic', 'religious'], domains: ['theology'], streams: ['library', 'knowledge'] },
  ]),

  // ── Shelf 7: medieval and historical ──
  ...works(7, [
    { slug: 'rojas-la-celestina', title: 'La Celestina (Tragicomedia de Calisto y Melibea)', author: 'Fernando de Rojas', died: 1541, year: 1499, ...SPAIN, variety: 'es-hist', era: 'late 15th century', genre: 'dialogue novel', level: 'historical', registers: ['archaic', 'literary'] },
    { slug: 'juan-manuel-conde-lucanor', title: 'El conde Lucanor', author: 'Don Juan Manuel', died: 1348, year: 1335, ...SPAIN, variety: 'es-hist', era: '14th century', genre: 'exemplary tales', level: 'historical', registers: ['archaic'] },
    { slug: 'juan-ruiz-libro-de-buen-amor', title: 'Libro de buen amor', author: 'Juan Ruiz, Arcipreste de Hita', ...SPAIN, variety: 'es-hist', era: '14th century', genre: 'verse narrative', level: 'historical', registers: ['archaic'], rights: lead('A fourteenth-century work.') },
    { slug: 'berceo-milagros', title: 'Milagros de Nuestra Señora', author: 'Gonzalo de Berceo', ...SPAIN, variety: 'es-hist', era: '13th century', genre: 'verse narrative', level: 'historical', registers: ['archaic', 'religious'], rights: lead('A thirteenth-century work.') },
    { slug: 'alfonso-x-estoria-de-espana', title: 'Estoria de España', author: 'Alfonso X (taller alfonsí)', died: 1284, ...SPAIN, variety: 'es-hist', era: '13th century', genre: 'chronicle', level: 'historical', registers: ['archaic'], domains: ['history'], streams: ['library', 'knowledge'] },
    { slug: 'cantar-de-mio-cid', title: 'Cantar de mio Cid', author: undefined, ...SPAIN, variety: 'es-hist', era: 'c. 1200', genre: 'epic poem', level: 'historical', registers: ['archaic'], rights: lead('Anonymous; composed around 1200.'), notes: 'Author unknown. Usually read in a modern edition with notes, which has its own rights.' },
  ]),

  // ── Scripture ──
  ...works(4, [
    { slug: 'reina-valera-1909', title: 'Santa Biblia — Reina-Valera 1909', role: 'scripture', streams: ['scripture'], variety: 'es-hist', era: 'revision of 1909', genre: 'Scripture', level: 'advanced', registers: ['religious', 'archaic'], year: 1909, ingestion: 'catalogued',
      rights: {
        state: 'verified-public-domain', copyrightStatus: 'public-domain', permission: 'not-needed', canBundle: true, userImportOnly: false, canModify: false, canStoreOffline: true, canBundleAudio: false,
        audiobook: 'unknown', verified: true, verifiedBy: 'checked against the distributor\'s notice (eBible.org, translation id spaRV1909) when the bundled sample was verified',
        verifiedAt: '2026-09-30', // the `checkedAt` of data/verified/scripture.json for spaRV1909
        basis: 'Revision published in 1909; distributed by eBible.org as public domain. The wording of the bundled verses is byte-verified against that source.',
        jurisdiction: 'stated by the distributor; not separately researched per country',
        acquisitionNotes: 'Only three verses are bundled today. Ingesting more requires the same byte-for-byte verification (scripts/verify-scripture.mjs). The text is never modified.',
      },
      purpose: ['Scripture read directly in Spanish'], notes: 'Older wording (vosotros, future subjunctive): receptive, not a model for speaking. A modern translation needs its own rights decision.' },
  ]),
];

/** Texts that are not placed on a shelf by this file: the learner's own books and his testimony. */
export const SPANISH_OUTSIDE_SHELVES = ['testimony'] as const;

/** Subject areas the Home page can offer as doors; each is a filter on the catalogue, never a separate course. */
export const SPANISH_DOORS = [
  { key: 'acquisition', label: 'Acquisition Path', stream: 'acquisition' },
  { key: 'honduras', label: 'Honduras', stream: 'honduras' },
  { key: 'stories', label: 'Stories', stream: 'library' },
  { key: 'bible', label: 'Bible', stream: 'scripture' },
  { key: 'history', label: 'History', domain: 'history' },
  { key: 'science', label: 'Science & Engineering', domain: 'science' },
  { key: 'theology', label: 'Theology', domain: 'theology' },
  { key: 'classics', label: 'Classics', stages: ['s5', 's6', 's7'] },
  { key: 'your-books', label: 'Your Books', stream: 'personal' },
] as const;
