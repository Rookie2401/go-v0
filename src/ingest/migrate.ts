/**
 * Version 1 -> version 2 conversion of the bundled corpus documents (`npm run corpus:migrate`, run once).
 * Pure: the verification record (`data/verified/scripture.json`) is passed in and read, verse text is never
 * retyped - a verification is attached only when the bundled wording equals the verified wording byte for byte.
 */
import type { SourceVerification } from '../core';
import { CORPUS_SCHEMA_VERSION, type CorpusDocument, type DocSection } from './format';

/** The shape of `data/verified/scripture.json` (written by scripts/verify-scripture.mjs). */
export interface VerifiedScripture {
  checkedAt: string;
  method: SourceVerification['method'];
  by: string;
  translations: Array<{
    lang: string;
    translationId: string;
    name: string;
    source: string;
    base: string;
    rightsStatement: string;
    verses: Record<string, { text: string; url?: string }>;
    mismatches: unknown[];
  }>;
}

/** A version 1 document as found in `data/corpus` before the migration. */
export interface V1Document {
  formatVersion: 1;
  lang: CorpusDocument['lang'];
  slug: string;
  title: string;
  kind: CorpusDocument['contentType'];
  corpus: CorpusDocument['corpus'];
  source: {
    id: string; title: string; author?: string; publisher?: string; url?: string; edition?: string;
    rights: CorpusDocument['source']['rights']; licenseNote?: string; authorship: CorpusDocument['source']['authorship'];
  };
  sourceNote: string;
  version?: string;
  staticLevel?: CorpusDocument['difficulty'];
  tags: string[];
  generated?: boolean;
  scripture?: { book: string; chapter: number };
  englishSource?: string;
  sections: DocSection[];
}

const BOOK_OF_SLUG: Record<string, string> = {
  john: 'JHN', '1john': '1JN', '2john': '2JN', '3john': '3JN', romans: 'ROM', matthew: 'MAT', mark: 'MRK', luke: 'LUK', acts: 'ACT',
  genesis: 'GEN', exodus: 'EXO', psalm: 'PSA', psalms: 'PSA', isaiah: 'ISA', ephesians: 'EPH', galatians: 'GAL', hebrews: 'HEB', james: 'JAS',
};

type V1Sentence = { text: string; english?: string; verseRefs?: string[] };
const sentencesOf = (d: { sections: DocSection[] }): V1Sentence[] =>
  d.sections.flatMap((s) => s.paragraphs.flatMap((p) => ('sentences' in p ? (p.sentences as V1Sentence[]) : [])));

export interface MigrationResult { doc: CorpusDocument; notes: string[] }

/** Convert one v1 document. `siblings` are the other v1 documents (used to resolve `prep:` tags to verse refs). */
export function migrateV1Document(v1: V1Document, opts: { verified?: VerifiedScripture; siblings?: readonly V1Document[] } = {}): MigrationResult {
  const notes: string[] = [];
  const scripture = v1.kind === 'scripture';
  const editorialTags = v1.tags.filter((t) => t === 'needs-native-review');
  const topics = v1.tags.filter((t) => !t.startsWith('prep:') && t !== 'needs-native-review');

  // prep: tags -> verse refs of the scripture text of the same language
  const prepTargets: string[] = [];
  for (const t of v1.tags.filter((x) => x.startsWith('prep:'))) {
    const m = /^prep:(\d?[a-z]+)-(\d+)$/.exec(t);
    const book = m ? BOOK_OF_SLUG[m[1]] : undefined;
    const bible = opts.siblings?.find((s) => s.lang === v1.lang && s.kind === 'scripture');
    const refs = book && bible
      ? sentencesOf(bible).flatMap((s) => s.verseRefs ?? []).filter((r) => r.startsWith(`${book}.${m![2]}.`))
      : [];
    if (!refs.length) { notes.push(`${v1.lang}/${v1.slug}: could not resolve ${t} to verse refs; dropped`); continue; }
    for (const r of refs) if (!prepTargets.includes(r)) prepTargets.push(r);
  }

  let verifiedEntry = scripture ? opts.verified?.translations.find((t) => t.lang === v1.lang) : undefined;
  if (verifiedEntry) {
    // attach verification only when the bundled wording IS the verified wording
    const entry = verifiedEntry;
    const ok = entry.mismatches.length === 0 && sentencesOf(v1).every((s) => {
      const refs = s.verseRefs ?? [];
      return refs.length > 0 && refs.map((r) => entry.verses[r]?.text).join(' ') === s.text;
    });
    if (!ok) { notes.push(`${v1.lang}/${v1.slug}: bundled text differs from data/verified/scripture.json; NOT marked verified`); verifiedEntry = undefined; }
  }
  const ver = verifiedEntry && opts.verified ? { entry: verifiedEntry, file: opts.verified } : undefined;

  const hasEnglish = sentencesOf(v1).some((s) => s.english);

  const source: CorpusDocument['source'] = {
    id: v1.source.id, title: v1.source.title,
    ...(v1.source.author ? { author: v1.source.author } : {}), ...(v1.source.publisher ? { publisher: v1.source.publisher } : {}),
    ...(v1.source.url ? { url: v1.source.url } : {}), ...(v1.source.edition ? { edition: v1.source.edition } : {}),
    attribution: !scripture
      ? 'Course-authored beginner text. First draft by an AI assistant; not yet reviewed by a native speaker.'
      : ver
        ? `${ver.entry.name}, public domain (${ver.entry.source})`
        : 'Unverified sample (translation not identified) - not for release',
    provenance: ver
      ? `${ver.entry.name} (public domain). The bundled sample was first transcribed by an AI assistant from memory; its wording was then compared byte for byte with the ${ver.entry.source} copy (${ver.entry.base}) on ${ver.file.checkedAt} by ${ver.file.by} (record: data/verified/scripture.json), any differing wording was replaced by the source wording, and the text is now identical to that source.`
      : v1.sourceNote,
    rights: v1.source.rights, ...(v1.source.licenseNote ? { licenseNote: v1.source.licenseNote } : {}), authorship: v1.source.authorship,
  };

  const review: CorpusDocument['review'] = ver
    ? { status: 'reviewed', reviewedBy: ver.file.by, reviewedAt: ver.file.checkedAt, notes: `Wording verified by ${ver.file.method} against ${ver.entry.source} ${ver.entry.translationId}.` }
    : scripture
      ? { status: 'unreviewed', notes: 'Unverified sample: the wording is not checked against any published source.' }
      : { status: 'unreviewed', notes: 'Drafted by an AI assistant; awaiting native-speaker review.' };

  const doc: CorpusDocument = {
    schemaVersion: CORPUS_SCHEMA_VERSION,
    id: v1.slug,
    lang: v1.lang,
    title: v1.title,
    contentType: v1.kind,
    corpus: v1.corpus,
    source,
    review,
    ...(v1.staticLevel ? { difficulty: v1.staticLevel } : {}),
    topics,
    editorialTags: scripture ? (ver ? [] : ['unverified-sample', 'typed-from-memory']) : [...editorialTags, 'machine-drafted'],
    prepTargets,
    generated: v1.generated ?? false,
    ...(v1.scripture
      ? {
        scripture: ver
          ? {
            translationId: ver.entry.translationId, translationName: ver.entry.name, edition: v1.source.edition ?? ver.entry.name,
            book: v1.scripture.book, chapter: v1.scripture.chapter,
            verification: { against: `${ver.entry.source} ${ver.entry.translationId}`, url: ver.entry.base, checkedAt: ver.file.checkedAt, method: ver.file.method, by: ver.file.by },
          }
          : {
            translationId: 'unidentified', translationName: v1.version ?? 'unverified sample', edition: v1.source.edition ?? 'unverified sample',
            book: v1.scripture.book, chapter: v1.scripture.chapter,
          },
      }
      : {}),
    ...(hasEnglish && v1.englishSource ? { english: { source: v1.englishSource } } : {}),
    sections: v1.sections,
  };
  return { doc, notes };
}
