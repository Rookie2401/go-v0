/**
 * Rebuild the import document (format version 2) of a stored text, so a book can be shared with a team exactly as it
 * was imported: `documentOf(store, textId)` reads the `Text`, its source, corpus, sections and paragraphs and gives back
 * a `CorpusDocument` that `validateBatch` accepts and that re-imports to the same running text.
 *
 * What is rebuilt, and from where:
 *   id / lang / title / contentType / locale / difficulty / topics / editorialTags / prepTargets / generated / streams /
 *   domains / variety / quality / work / scripture      the `Text` row (`work` from `workId` + `chapter`)
 *   corpus, source                                      `store.corpora`, `store.sources`
 *   review                                              `Text.reviewStatus` and the last `review` transformation
 *   sections, paragraphs                                `store.sections`, `store.paragraphs` (`originalText`, byte for byte)
 *   english                                             `store.rescues`
 *
 * A paragraph is written `{ text: originalText }` (the adapter segments it again on import). A paragraph whose sentences
 * carry something a bare text would lose - an English line, a speaker, verse references - is written sentence by sentence
 * instead, with the separator the stored offsets show, so nothing is lost and the paragraph text is still byte for byte.
 *
 * What cannot be rebuilt is never dropped silently: every such case adds a sentence to `notes`. Those are: word-level
 * `spans` and `corrections`, sentence `notes`, author sentence ids, the review `level` and `contentSignature`, a
 * Scripture fixture's `fixtureNote`, and facts the store keeps only in part (a source without attribution or provenance,
 * a corpus row that is missing, a paragraph without `originalText`).
 */
import type { AppStore, LanguageCode, ReviewStatus, Sentence } from '../core';
import { courseForLang, ids } from '../core';
import type { CorpusDocument, DocParagraph, DocReview, DocSection, DocSentence } from '../ingest/format';

/** Always true of a rebuilt document, so not repeated in every `notes`: hand-supplied word analyses (spans, corrections) are not rebuilt; the importer analyses the text again. */
export const DOCUMENT_ALWAYS_OMITS: readonly string[] = ['spans', 'corrections'];

export interface DocumentOfResult {
  document: CorpusDocument;
  /** Everything the document does not carry that the stored text had, or that had to be filled in. Empty ⇒ a faithful rebuild. */
  notes: string[];
}

type DocumentStore = Pick<AppStore, 'texts' | 'sources' | 'corpora' | 'sections' | 'paragraphs' | 'sentences' | 'rescues' | 'notes'>;

const REVIEW_STATUSES: readonly ReviewStatus[] = ['unreviewed', 'in-review', 'reviewed', 'approved', 'rejected'];
/** An author-supplied sentence key is anything but the importer's hash key (12 hex digits, `~n` for the n-th repeat). */
const HASH_KEY = /^[0-9a-f]{12}(?:~\d+)?$/;

const compact = <T extends object>(o: T): T => {
  const out = { ...o } as Record<string, unknown>;
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out as T;
};

/** `review status <s>[ by <who>][ on <when>][: <notes>]` (the importer's `describeReview`) read back. */
function parseReview(description: string): { status?: string; reviewedBy?: string; reviewedAt?: string; notes?: string } | undefined {
  const m = /^review status (\S+)(?: by (.+?))?(?: on (\S+))?(?:: ([\s\S]*))?$/.exec(description);
  if (!m) return undefined;
  return { status: m[1], reviewedBy: m[2], reviewedAt: m[3], notes: m[4] };
}

/** The work a `workId` names: `work:<courseId>:<slug>` (the slug has no colon). */
function parseWorkId(workId: string): { courseId: string; slug: string } | undefined {
  if (!workId.startsWith('work:')) return undefined;
  const rest = workId.slice('work:'.length);
  const cut = rest.lastIndexOf(':');
  return cut > 0 ? { courseId: rest.slice(0, cut), slug: rest.slice(cut + 1) } : undefined;
}

export async function documentOf(store: DocumentStore, textId: string): Promise<DocumentOfResult> {
  const text = await store.texts.get(textId);
  if (!text) throw new Error(`There is no text ${textId} on this device.`);
  const lang: LanguageCode = text.lang;
  const prefix = ids.text(lang, '');
  const docId = textId.startsWith(prefix) ? textId.slice(prefix.length) : textId;
  const notes: string[] = [];

  // ── provenance: source and corpus ──
  const src = await store.sources.get(text.sourceId);
  if (!src) throw new Error(`The source of ${textId} (${text.sourceId}) is not on this device, so the text cannot be rebuilt.`);
  if (!src.attribution) notes.push(`The source has no attribution line; its title ("${src.title}") stands in for it.`);
  if (!src.provenance) notes.push('The source has no provenance statement; "Provenance not recorded on this device." stands in for it.');
  const source: CorpusDocument['source'] = compact({
    id: src.id, title: src.title, author: src.author, publisher: src.publisher, url: src.url, edition: src.edition,
    attribution: src.attribution || src.title, provenance: src.provenance || 'Provenance not recorded on this device.',
    rights: src.rights, licenseNote: src.licenseNote, authorship: src.authorship,
  });
  const corpusRow = await store.corpora.get(text.corpusId);
  if (!corpusRow) notes.push(`The corpus ${text.corpusId} is not on this device; it is described as a comprehensible-input corpus.`);
  const corpus: CorpusDocument['corpus'] = corpusRow
    ? { id: corpusRow.id, kind: corpusRow.kind, title: corpusRow.title }
    : { id: text.corpusId, kind: text.kind === 'scripture' ? 'scripture' : text.kind === 'testimony' ? 'testimony' : 'comprehensible-input', title: text.corpusId };

  // ── review ──
  const reviewRecord = [...text.transformations].reverse().find((t) => t.tool === 'review');
  const parsed = reviewRecord ? parseReview(reviewRecord.description) : undefined;
  const review: DocReview = compact({
    status: text.reviewStatus,
    reviewedBy: parsed?.reviewedBy, reviewedAt: parsed?.reviewedAt, notes: parsed?.notes,
  });
  if (parsed?.status && (REVIEW_STATUSES as readonly string[]).includes(parsed.status) && parsed.status !== text.reviewStatus) {
    notes.push(`The review record says "${parsed.status}" but the text is marked "${text.reviewStatus}"; the text's own status is used.`);
  }
  if ((review.status === 'reviewed' || review.status === 'approved') && !review.reviewedBy) {
    notes.push(`The text is marked "${review.status}" but the name of the reviewer is not stored; the document will be refused until it is added.`);
  }
  if (review.status === 'reviewed' || review.status === 'approved') {
    notes.push('The kind of review (native speaker or language check) and the wording it covers are not stored, so they are not in the document.');
  }

  // ── structure ──
  const sections = (await store.sections.where('textId', textId)).sort((a, b) => a.index - b.index);
  const paragraphRows = (await store.paragraphs.where('textId', textId)).sort((a, b) => a.index - b.index);
  const live = (await store.sentences.where('textId', textId)).filter((s) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
  const rescues = new Map((await store.rescues.where('textId', textId)).map((r) => [r.sentenceId, r]));
  const sentencesOf = new Map<string, Sentence[]>();
  for (const s of live) (sentencesOf.get(s.paragraphId) ?? sentencesOf.set(s.paragraphId, []).get(s.paragraphId)!).push(s);

  const speakers: Record<string, string> = {};
  let anyEnglish = false;
  let englishSource: string | undefined;
  let lostAuthorIds = 0;
  let missingOriginal = 0;
  let unspannedGaps = 0;

  const docSections: DocSection[] = [];
  for (const sec of sections) {
    const paragraphs: DocParagraph[] = [];
    for (const row of paragraphRows.filter((p) => p.sectionId === sec.id)) {
      const sents = (sentencesOf.get(row.id) ?? []).sort((a, b) => a.index - b.index);
      for (const s of sents) if (!HASH_KEY.test(s.key)) lostAuthorIds++;
      let original = row.originalText;
      if (original === undefined) {
        if (sents.length === 0) { notes.push(`Paragraph ${row.index + 1} has neither its text nor any sentences; it was left out.`); continue; }
        original = sents.map((s) => s.text).join(' ');
        missingOriginal++;
      }
      // what a bare `{ text }` would lose
      const carries = sents.some((s) => rescues.has(s.id) || s.speaker !== undefined || (s.verseRefs?.length ?? 0) > 0);
      let separator: string | undefined;
      let sentenceForm = false;
      if (carries && row.originalText !== undefined && sents.length > 0) {
        // the separator is whatever the stored offsets show between sentences, when it is the same everywhere
        const gaps = new Set<string>();
        let ok = sents[0].paraStart === 0 && sents[sents.length - 1].paraEnd === original.length;
        for (let i = 0; ok && i < sents.length; i++) {
          const s = sents[i];
          if (s.paraStart === undefined || s.paraEnd === undefined || original.slice(s.paraStart, s.paraEnd) !== s.text) ok = false;
          else if (i > 0) gaps.add(original.slice(sents[i - 1].paraEnd!, s.paraStart));
        }
        if (ok && gaps.size <= 1) { separator = [...gaps][0]; sentenceForm = true; }
      }
      if (sentenceForm) {
        const list: DocSentence[] = sents.map((s) => {
          const r = rescues.get(s.id);
          if (r) { anyEnglish = true; englishSource ??= r.sourceNote; }
          if (s.speaker !== undefined) speakers[s.speaker] = s.speaker;
          return compact({ text: s.text, english: r?.english, verseRefs: s.verseRefs?.length ? [...s.verseRefs] : undefined, speaker: s.speaker });
        });
        paragraphs.push({ sentences: list, ...(separator !== undefined && separator !== ' ' ? { separator } : {}) });
      } else {
        if (carries) unspannedGaps++;
        paragraphs.push({ text: original });
      }
    }
    if (paragraphs.length === 0) { notes.push(`Section ${sec.index + 1}${sec.title ? ` ("${sec.title}")` : ''} has no paragraphs on this device; it was left out.`); continue; }
    docSections.push(compact({ title: sec.title, chapter: sec.chapter, paragraphs }));
  }

  if (missingOriginal) notes.push(`${missingOriginal} paragraph(s) had no stored original text; the text of their sentences, joined with single spaces, stands in for it.`);
  if (unspannedGaps) notes.push(`${unspannedGaps} paragraph(s) have English lines, speakers or verse references that could not be tied to the paragraph text; they are in the document as plain text only.`);
  if (lostAuthorIds) notes.push(`${lostAuthorIds} sentence(s) had author-chosen ids; the document carries the text only, so the importer will derive new ones.`);
  const noteRows = await store.notes.where('textId', textId);
  if (noteRows.length) notes.push(`${noteRows.length} note(s) on the text are not in the document.`);

  if (anyEnglish && !englishSource) notes.push('The English lines have no stored source; "English lines stored with the text on this device." stands in for it.');

  // ── work, scripture ──
  let work: CorpusDocument['work'];
  if (text.workId) {
    const w = parseWorkId(text.workId);
    if (w) {
      work = compact({
        slug: w.slug,
        courseId: w.courseId === courseForLang(lang)?.id ? undefined : w.courseId,
        chapter: text.chapter ? compact({ index: text.chapter.index, title: text.chapter.title }) : undefined,
      });
    } else notes.push(`The work id "${text.workId}" is not in the form work:<course>:<slug>; the text's place in the work is not in the document.`);
  }

  let scripture: CorpusDocument['scripture'];
  if (text.scripture) {
    const fixture = text.editorialTags.includes('technical-fixture');
    scripture = compact({
      translationId: text.scripture.translationId ?? 'unidentified',
      translationName: text.version ?? text.scripture.translationId ?? 'unidentified',
      edition: text.scripture.edition ?? 'unknown',
      book: text.scripture.book, chapter: text.scripture.chapter,
      verification: text.scripture.verification,
      role: fixture ? ('technical-fixture' as const) : undefined,
      fixtureNote: fixture ? 'technical fixture (the original note is not stored)' : undefined,
    });
    if (!text.scripture.translationId || !text.scripture.edition) notes.push('The translation or edition of the Scripture text is not fully stored; "unidentified" / "unknown" stand in for it.');
    if (fixture) notes.push('This is a technical fixture; its original fixtureNote is not stored.');
  }

  const document: CorpusDocument = compact({
    schemaVersion: 2 as const,
    id: docId, lang, locale: text.locale, title: text.title, contentType: text.kind, corpus, source, review,
    difficulty: text.staticLevel,
    topics: [...text.tags], editorialTags: [...text.editorialTags], prepTargets: [...text.prepTargets],
    speakers: Object.keys(speakers).length ? speakers : undefined,
    generated: text.generated,
    scripture,
    english: anyEnglish ? { source: englishSource ?? 'English lines stored with the text on this device.' } : undefined,
    sections: docSections,
    work,
    streams: text.streams ? [...text.streams] : undefined,
    domains: text.domains ? [...text.domains] : undefined,
    variety: text.variety,
    quality: text.quality,
    teamText: text.teamText === true ? (true as const) : undefined,
  });
  return { document, notes };
}
