/// <reference types="node" />
/**
 * Build the bundled Latin corpus (data/corpus/la/*.json, schema version 2) from local public-domain sources. Nothing is retyped
 * and nothing is downloaded.
 *
 *   node scripts/corpus-la-build.mts            # write data/corpus/la/*.json
 *   node scripts/corpus-la-build.mts --check    # build in memory, fail if a file on disk differs (idempotence check)
 *
 * Sources (paths can be overridden: LA_VETUS_ROOT, LA_ROMANCE_ROOT; default: the sibling repositories under C:/Users/CJWal/dev):
 *   1. vetus-v0/data/vulgate/lat-clementine.usfx.xml - the Clementine Vulgate (1592), seven1m/open-bibles USFX, public domain.
 *   2. romance-v0/data/la/ritchie-fabulae-faciles.wikitext.json - Ritchie, Fabulae Faciles (1903), Latin Wikisource wikitext.
 *   3. romance-v0/data/la/caesar-bg-1.text.json - Caesar, De bello Gallico I (macronised Latin Wikisource edition), chapters 1-7.
 * English (World English Bible, public domain) is copied verbatim from the German/Hindi corpora for the Scripture verses they
 * already carry. Scripture: one verse = one sentence; the ladder texts are split at "." "?" "!". See docs/latin/CORPUS.md. Refuses to run if a source is missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const REPO = path.resolve(import.meta.dirname, '..');
const OUT = path.join(REPO, 'data/corpus/la');
const DEV = path.resolve(REPO, '..');
const VETUS = process.env.LA_VETUS_ROOT ?? path.join(DEV, 'vetus-v0');
const ROMANCE = process.env.LA_ROMANCE_ROOT ?? path.join(DEV, 'romance-v0');
const USFX = path.join(VETUS, 'data/vulgate/lat-clementine.usfx.xml');
const RITCHIE = path.join(ROMANCE, 'data/la/ritchie-fabulae-faciles.wikitext.json');
const CAESAR = path.join(ROMANCE, 'data/la/caesar-bg-1.text.json');
const CHECK = process.argv.includes('--check');
/** Date the Scripture text was last compared with the USFX source by scripts/verify-la-scripture.mts (fixed, so a rebuild is byte-identical). */
const VERIFIED_AT = '2026-10-17';

for (const p of [USFX, RITCHIE, CAESAR]) {
  if (!fs.existsSync(p)) { console.error(`corpus-la-build: source missing: ${p}\n(set LA_VETUS_ROOT / LA_ROMANCE_ROOT if the repositories live elsewhere)`); process.exit(1); }
}

const sha256 = (s: string | Buffer) => crypto.createHash('sha256').update(s).digest('hex');
const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');

/** Strong stops only: "." "?" "!" (optionally followed by closing quotes). In the Clementine ":" and ";" are comma-like pauses, not sentence ends. */
export function splitSentences(text: string): string[] {
  const t = text.trim();
  const out: string[] = [];
  let from = 0;
  // A stop ("." "?" "!", optionally with closing quotes/brackets) followed by space and a capital, quote or bracket ends a sentence;
  // a lowercase continuation (: ... ?" inquit.) does not.
  for (const m of t.matchAll(/(?<=[.?!]["”’)\]]*)\s+(?=["“‘'(\[\p{Lu}])/gu)) {
    const before = t.slice(from, m.index);
    // a one-letter abbreviation (praenomen M. Pisone, P. Crasso; a. d. V. Kal. Apr.) or a calendar abbreviation is not a sentence end
    if (/(^|[\s\[(])\p{L}\p{M}*\.\]?$/u.test(before) || /(^|[\s\[(])(Kal|Apr|Non|Id|Ian|Dec|Cos)\.\]?$/u.test(before)) continue;
    out.push(before.trim());
    from = m.index + m[0].length;
  }
  out.push(t.slice(from).trim());
  return out.filter(Boolean);
}

interface DocSentence { id: string; text: string; english?: string; verseRefs?: string[] }
interface DocSection { title: string; chapter?: number; paragraphs: Array<{ sentences: DocSentence[] }> }
const written: string[] = [];
let drift = 0;

function emit(id: string, doc: Record<string, unknown>) {
  const file = path.join(OUT, `${id}.json`);
  const body = JSON.stringify(doc, null, 2) + '\n';
  written.push(`${id}.json`);
  if (CHECK) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== body) { console.error(`DIFFERS: ${id}.json`); drift++; }
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(file, body);
}

// ───────────────────────────── 1. Clementine Vulgate ─────────────────────────────

const usfxRaw = fs.readFileSync(USFX, 'utf8');
const usfxHash = sha256(fs.readFileSync(USFX));
const books = new Map<string, Map<number, Map<number, string>>>();
for (const m of usfxRaw.matchAll(/<book id="([^"]+)">([\s\S]*?)<\/book>/g)) {
  const chapters = new Map<number, Map<number, string>>();
  let ch = 0;
  for (const t of m[2].matchAll(/<c id="(\d+)"\/>|<v id="(\d+)"\/>([\s\S]*?)<ve\/>/g)) {
    if (t[1]) { ch = Number(t[1]); chapters.set(ch, new Map()); }
    else chapters.get(ch)!.set(Number(t[2]), decode(t[3]).trim());
  }
  books.set(m[1], chapters);
}

/** English lines (World English Bible, from eBible.org) already bundled in the other corpora, keyed by USFM reference. */
const webByRef = new Map<string, string>();
for (const lang of ['de', 'hi']) {
  const dir = path.join(REPO, 'data/corpus', lang);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.startsWith('bible-') && x.endsWith('.json')).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const s of j.sections ?? []) for (const p of s.paragraphs ?? []) for (const x of p.sentences ?? [])
      if (x.english && x.verseRefs?.length === 1 && !webByRef.has(x.verseRefs[0])) webByRef.set(x.verseRefs[0], x.english);
  }
}

interface Slice { slug: string; title: string; book: string; usfxChapter: number; refChapter: number; topics: string[]; note?: string }
const SLICES: Slice[] = [
  { slug: 'vulgate-gen-1', title: 'Genesis 1', book: 'GEN', usfxChapter: 1, refChapter: 1, topics: ['scripture', 'genesis-1', 'creation'] },
  { slug: 'vulgate-psa-1', title: 'Psalmus 1', book: 'PSA', usfxChapter: 1, refChapter: 1, topics: ['scripture', 'psalm-1'] },
  { slug: 'vulgate-psa-23', title: 'Psalmus 22 (23 hebr.)', book: 'PSA', usfxChapter: 22, refChapter: 23, topics: ['scripture', 'psalm-23'],
    note: 'The Vulgate numbers this psalm 22 (Greek/Vulgate numbering); the references here use the Hebrew number 23 so that they line up with the other languages\u2019 Psalm 23.' },
  { slug: 'vulgate-1john-1', title: 'I Ioannis 1', book: '1JN', usfxChapter: 1, refChapter: 1, topics: ['scripture', '1john-1'] },
  { slug: 'vulgate-john-1', title: 'Ioannes 1', book: 'JHN', usfxChapter: 1, refChapter: 1, topics: ['scripture', 'john-1', 'gospel'] },
  { slug: 'vulgate-john-3', title: 'Ioannes 3', book: 'JHN', usfxChapter: 3, refChapter: 3, topics: ['scripture', 'john-3', 'gospel'] },
  { slug: 'vulgate-luke-2', title: 'Lucas 2', book: 'LUK', usfxChapter: 2, refChapter: 2, topics: ['scripture', 'luke-2', 'gospel'] },
  { slug: 'vulgate-mat-1', title: 'Matthaeus 1', book: 'MAT', usfxChapter: 1, refChapter: 1, topics: ['scripture', 'matthew-1', 'gospel'] },
  { slug: 'vulgate-mat-5', title: 'Matthaeus 5', book: 'MAT', usfxChapter: 5, refChapter: 5, topics: ['scripture', 'matthew-5', 'gospel'] },
  { slug: 'vulgate-mat-6', title: 'Matthaeus 6', book: 'MAT', usfxChapter: 6, refChapter: 6, topics: ['scripture', 'matthew-6', 'gospel'] },
  { slug: 'vulgate-mark-1', title: 'Marcus 1', book: 'MRK', usfxChapter: 1, refChapter: 1, topics: ['scripture', 'mark-1', 'gospel'] },
];

for (const s of SLICES) {
  const verses = books.get(s.book)?.get(s.usfxChapter);
  if (!verses || !verses.size) throw new Error(`Vulgate source has no ${s.book} ${s.usfxChapter}`);
  const sentences: DocSentence[] = [];
  let withEnglish = 0;
  for (const [v, text] of [...verses.entries()].sort((a, b) => a[0] - b[0])) {
    if (!text) throw new Error(`empty verse ${s.book} ${s.usfxChapter}:${v}`);
    const ref = `${s.book}.${s.refChapter}.${v}`;
    // One verse = one sentence (id = the reference, verseRefs = [ref]): the verification contract compares a sentence with its verses' joined text.
    const sent: DocSentence = { id: ref, text };
    const en = webByRef.get(ref);
    if (en) { sent.english = en; withEnglish++; }
    sent.verseRefs = [ref];
    sentences.push(sent);
  }
  const doc: Record<string, unknown> = {
    schemaVersion: 2, id: s.slug, lang: 'la', title: s.title, contentType: 'scripture',
    corpus: { id: 'bible-la-clementine', kind: 'scripture', title: 'Biblia Sacra Vulgata (Clementine, 1592)' },
    source: {
      id: `src:la:${s.slug}`,
      title: 'Biblia Sacra Vulgata, Clementine edition (1592)',
      edition: 'Clementine Vulgate 1592',
      attribution: 'Biblia Sacra Vulgata, editio Clementina (1592), public domain. USFX text from seven1m/open-bibles, held by the Vetus V0 app.',
      provenance: `Taken verse by verse from vetus-v0/data/vulgate/lat-clementine.usfx.xml (SHA-256 ${usfxHash}) by scripts/corpus-la-build.mts; nothing was retyped. Clementine spelling kept (ae ligatures as printed, i/j and u/v as printed, no macrons). One verse is one sentence (the verse is not split, although it may hold several clauses or sentences), so every sentence is addressable by its reference. ${s.note ?? ''} The text has not been compared with a second, independent edition.`.replace(/\s+/g, ' ').trim(),
      url: 'https://github.com/seven1m/open-bibles',
      rights: 'public-domain',
      licenseNote: 'The Clementine Vulgate (1592) is in the public domain. The USFX file comes from seven1m/open-bibles (Bible texts that are public domain or openly licensed).',
      authorship: 'public-domain',
      sourceHash: usfxHash,
      licence: 'public domain',
      modifications: 'none: each sentence is exactly one verse of the source (surrounding whitespace trimmed).',
    },
    review: { status: 'reviewed', reviewedBy: 'scripts/verify-la-scripture.mts', reviewedAt: VERIFIED_AT, notes: 'Wording verified by byte-comparison against the Clementine USFX file it was copied from (a copy-integrity check, not a second edition).' },
    topics: s.topics, editorialTags: ['clementine-orthography'], prepTargets: [], generated: false,
    work: { slug: 'vulgata-clementina', chapter: { index: SLICES.indexOf(s) + 1, title: s.title } }, streams: ['scripture'],
    scripture: { translationId: 'latVulgClementine', translationName: 'Biblia Sacra Vulgata (Clementine, 1592)', edition: 'Clementine Vulgate 1592', book: s.book, chapter: s.refChapter,
      verification: { against: 'seven1m/open-bibles Clementine USFX (lat-clementine.usfx.xml, as held by vetus-v0)', url: 'https://github.com/seven1m/open-bibles', checkedAt: VERIFIED_AT, method: 'byte-comparison', by: 'scripts/verify-la-scripture.mts' } },
  };
  if (withEnglish) doc.english = { source: 'World English Bible (public domain), eBible.org eng-web, copied verbatim from the German/Hindi corpora for the verses they carry' };
  doc.sections = [{ title: s.title, chapter: s.refChapter, paragraphs: [{ sentences }] }] satisfies DocSection[];
  emit(s.slug, doc);
}

// ───────────────────────────── 2. Ritchie, Fabulae Faciles ─────────────────────────────

const wikitextRaw: string = JSON.parse(fs.readFileSync(RITCHIE, 'utf8')).parse.wikitext['*'];
// The stored copy holds one stray U+FFFD (a lost character before "neque" in Hercules 23.5); it is dropped, and the count is recorded below.
const replacementChars = (wikitextRaw.match(/�/g) ?? []).length;
const wikitext = wikitextRaw.replace(/�/g, '');
const ritchieHash = sha256(fs.readFileSync(RITCHIE));
const TALES = [
  { slug: 'ladder-ritchie-perseus', heading: 'PERSEUS', title: 'Perseus', topics: ['myth', 'perseus'] },
  { slug: 'ladder-ritchie-hercules', heading: 'HERCULES', title: 'Hercules', topics: ['myth', 'hercules'] },
  { slug: 'ladder-ritchie-argonauts', heading: 'THE ARGONAUTS', title: 'Argonautae', topics: ['myth', 'argonauts'] },
  { slug: 'ladder-ritchie-ulysses', heading: 'ULYSSES', title: 'Ulixes', topics: ['myth', 'ulysses'] },
];

TALES.forEach((tale, ti) => {
  const start = wikitext.indexOf(`==${tale.heading}==`);
  if (start < 0) throw new Error(`Ritchie: no tale ${tale.heading}`);
  const next = ti + 1 < TALES.length ? wikitext.indexOf(`==${TALES[ti + 1].heading}==`) : wikitext.length;
  const lines = wikitext.slice(start, next).split('\n');
  const sections: DocSection[] = [];
  let cur: DocSection | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('==') || line.startsWith('<div') || line === '</div>' || line.startsWith("''")) continue;
    const h = /^([0-9IVXL]+)\.\s+(.+)$/.exec(line);
    if (h && h[2] === h[2].toUpperCase()) {
      const n = /^\d+$/.test(h[1]) ? Number(h[1]) : 11; // the page prints "II." for section 11
      cur = { title: `${n}. ${h[2]}`, chapter: n, paragraphs: [] };
      sections.push(cur);
      continue;
    }
    if (!cur) throw new Error(`Ritchie: text before a section heading: ${line.slice(0, 60)}`);
    if (/[{}\[\]<>|]|''/.test(line)) throw new Error(`Ritchie: markup in a Latin line: ${line.slice(0, 80)}`);
    const parts = splitSentences(line);
    const n = cur.chapter!;
    const base = cur.paragraphs.reduce((a, p) => a + p.sentences.length, 0);
    cur.paragraphs.push({ sentences: parts.map((text, i) => ({ id: `${tale.slug.replace('ladder-ritchie-', '')}.${n}.${base + i + 1}`, text })) });
  }
  emit(tale.slug, {
    schemaVersion: 2, id: tale.slug, lang: 'la', title: `Fabulae Faciles: ${tale.title}`, contentType: 'story',
    corpus: { id: 'lit-la', kind: 'comprehensible-input', title: 'Latin literature' },
    source: {
      id: `src:la:${tale.slug}`,
      title: `Fabulae Faciles: A First Latin Reader (${tale.title})`,
      author: 'Francis Ritchie', date: '1903',
      url: 'https://la.wikisource.org/wiki/Ritchie%27s_Fabulae_Faciles',
      edition: 'Ritchie, Fabulae Faciles (1903), Latin Wikisource transcription',
      attribution: 'Francis Ritchie, Fabulae Faciles (1903), public domain. Transcription: Latin Wikisource (Vicifons), CC BY-SA 4.0.',
      provenance: `Latin text taken by scripts/corpus-la-build.mts from the Latin Wikisource wikitext of the page, held by romance-v0/data/la/ritchie-fabulae-faciles.wikitext.json (SHA-256 ${ritchieHash}). Nothing was retyped. Only the Latin paragraphs are kept: the italic English argument before each tale is the editor's summary and is left out, and the section headings are Ritchie's English headings (the section title only, never sentence text). Paragraphs are split into sentences at "." "?" "!". Pedagogical Latin composed in 1903 in a classical register.`,
      rights: 'public-domain',
      licenseNote: 'Francis Ritchie’s Fabulae Faciles was published in 1903: public domain. The Wikisource transcription is offered under CC BY-SA 4.0; the source is named here and on the text.',
      authorship: 'public-domain',
      sourceHash: ritchieHash, licence: 'public domain (1903); transcription CC BY-SA 4.0',
      modifications: `Paragraphs split into sentences; English argument omitted;${replacementChars ? ` ${replacementChars} stray U+FFFD replacement character(s) in the stored copy removed (Hercules 23.5, before "neque");` : ''} nothing else changed.`,
    },
    review: { status: 'unreviewed', notes: 'Copied mechanically from the Wikisource transcription; not proofread against the printed book.' },
    difficulty: 'A2', topics: tale.topics, editorialTags: ['graded-reader', 'neo-latin'], prepTargets: [], generated: false,
    work: { slug: 'ritchie-fabulae-faciles', chapter: { index: ti + 1, title: `Fabulae Faciles: ${tale.title}` } }, streams: ['library'],
    sections,
  });
});

// ───────────────────────────── 3. Caesar, De bello Gallico I.1-7 ─────────────────────────────

const caesarHtml: string = JSON.parse(fs.readFileSync(CAESAR, 'utf8')).parse.text['*'];
const caesarHash = sha256(fs.readFileSync(CAESAR));
{
  const sections: DocSection[] = [];
  for (let n = 1; n <= 7; n++) {
    const m = new RegExp(`<h3 id="${n}">${n}</h3>[\\s\\S]*?</div>\\s*<p>([\\s\\S]*?)</p>`).exec(caesarHtml);
    if (!m) throw new Error(`Caesar: no chapter ${n}`);
    const text = decode(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (/[<>{}]/.test(text)) throw new Error(`Caesar ${n}: markup left in text`);
    sections.push({ title: `Caput ${n}`, chapter: n, paragraphs: [{ sentences: splitSentences(text).map((t, i) => ({ id: `bg1.${n}.${i + 1}`, text: t })) }] });
  }
  emit('ladder-caesar-bg-1', {
    schemaVersion: 2, id: 'ladder-caesar-bg-1', lang: 'la', title: 'De bello Gallico I, 1\u20137', contentType: 'nonfiction',
    corpus: { id: 'lit-la', kind: 'comprehensible-input', title: 'Latin literature' },
    source: {
      id: 'src:la:ladder-caesar-bg-1',
      title: 'Commentarii de bello Gallico, Liber I (chapters 1-7)',
      author: 'Gaius Iulius Caesar', date: 'c. 58-50 BC',
      url: 'https://la.wikisource.org/wiki/Commentarii_de_bello_Gallico/Liber_I',
      edition: 'Latin Wikisource edition with vowel length marked (macrons)',
      attribution: 'Gaius Iulius Caesar, Commentarii de bello Gallico I (c. 50 BC), public domain. Text with macrons: Latin Wikisource (Vicifons), CC BY-SA 4.0.',
      provenance: `Taken by scripts/corpus-la-build.mts from the Latin Wikisource page, held by romance-v0/data/la/caesar-bg-1.text.json (SHA-256 ${caesarHash}). Nothing was retyped. The edition marks vowel length (macrons) and they are kept. The source's hard line breaks inside a paragraph are joined with a space; chapters 1-7 only; split into sentences at "." "?" "!".`,
      rights: 'public-domain',
      licenseNote: 'Caesar\u2019s text is in the public domain. The Wikisource edition (macrons, transcription) is offered under CC BY-SA 4.0; the source is named here and on the text.',
      authorship: 'public-domain',
      sourceHash: caesarHash, licence: 'public domain; edition CC BY-SA 4.0',
      modifications: 'Line breaks joined; split into sentences; chapters 1-7 only.',
    },
    review: { status: 'unreviewed', notes: 'Copied mechanically from the Wikisource edition; not proofread against a printed edition.' },
    difficulty: 'B2', topics: ['history', 'caesar', 'gaul'], editorialTags: ['classical', 'macronised'], prepTargets: [], generated: false,
    work: { slug: 'caesar-de-bello-gallico-1', chapter: { index: 1, title: 'De bello Gallico I, 1–7' } }, streams: ['library'],
    sections,
  });
}

if (CHECK) {
  if (drift) { console.error(`corpus-la-build --check: ${drift} file(s) differ`); process.exit(1); }
  console.log(`corpus-la-build --check: ${written.length} files identical to a fresh build`);
} else {
  const stale = fs.readdirSync(OUT).filter((f) => f.endsWith('.json') && !written.includes(f));
  if (stale.length) console.warn(`note: files in data/corpus/la not produced by this script: ${stale.join(', ')}`);
  console.log(`corpus-la-build: wrote ${written.length} files to data/corpus/la`);
}
