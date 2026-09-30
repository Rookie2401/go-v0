/**
 * Fixture builder for engine tests: creates a Text with sentences/tokens/lemmas/analyses/rescues
 * from an explicit token list (never split(' ') — Thai fixtures pass their segmented tokens).
 * Real ingestion (src/ingest) goes through the language adapters; this exists so GoLearn/GoListen/GoTell
 * tests do not depend on adapter internals.
 */
import type { AppStore } from './store';
import type { LanguageCode, PartOfSpeech, Text, TextKind } from './model';
import { hash, ids } from './ids';

export interface FixtureToken {
  surface: string;
  lemma?: string;
  pos?: PartOfSpeech;
  morph?: Record<string, string>;
  gloss?: string;
  /** default true; set false for punctuation */
  isWord?: boolean;
  confidence?: number;
}

export interface FixtureSentence {
  text?: string; // default: tokens joined by separator
  tokens: FixtureToken[];
  english?: string;
  verseRefs?: string[];
  /** Phrase patterns (normalized token sequences) occurring in this sentence, with the token indexes. */
  phrases?: Array<{ pattern: string[]; display?: string; tokenIndexes: number[]; kind?: 'collocation' | 'formula' | 'idiom' | 'frame' | 'construction' }>;
  patterns?: Array<{ key: string; title?: string; tokenIndexes: number[] }>;
}

export interface FixtureTextSpec {
  lang: LanguageCode;
  slug: string;
  title?: string;
  kind?: TextKind;
  corpusId?: string;
  sourceId?: string;
  version?: string;
  separator?: string; // ' ' for most, '' for Thai
  sentences: FixtureSentence[];
  tags?: string[];
  generated?: boolean;
  scripture?: { book: string; chapter: number };
  /** Default: an approved, published fixture. Set published:false to test the publication gate. */
  reviewStatus?: Text['reviewStatus'];
  published?: boolean;
  editorialTags?: string[];
  prepTargets?: string[];
}

export const FIXTURE_ANALYZER = 'fixture@1';

export async function buildFixtureText(store: AppStore, spec: FixtureTextSpec): Promise<Text> {
  const lang = spec.lang;
  const sep = spec.separator ?? (lang === 'th' ? '' : ' ');
  const textId = ids.text(lang, spec.slug);
  const now = '2026-01-01T00:00:00.000Z';
  const kind = spec.kind ?? 'story';
  const corpusId = spec.corpusId ?? (kind === 'scripture' ? `bible-${lang}-fixture` : `ci-${lang}`);
  const sourceId = spec.sourceId ?? `src:fixture:${lang}`;
  if (!(await store.sources.get(sourceId))) {
    await store.sources.put({ id: sourceId, title: 'Test fixture', rights: 'unverified', authorship: 'human' });
  }
  if (!(await store.corpora.get(corpusId))) {
    await store.corpora.put({ id: corpusId, lang, kind: kind === 'scripture' ? 'scripture' : 'comprehensible-input', title: corpusId });
  }
  const text: Text = {
    id: textId, corpusId, lang, kind, title: spec.title ?? spec.slug, sourceId, version: spec.version, importedAt: now,
    tags: spec.tags ?? [], generated: spec.generated ?? false, transformations: [], contentVersion: 1, scripture: spec.scripture,
    editorialTags: spec.editorialTags ?? [], prepTargets: spec.prepTargets ?? [], reviewStatus: spec.reviewStatus ?? 'approved',
    published: spec.published ?? true, unpublishedReasons: spec.published === false ? ['fixture: marked unpublished'] : [], schemaVersion: 2,
  };
  await store.texts.put(text);
  const sectionId = ids.section(textId, 0);
  await store.sections.put({ id: sectionId, textId, index: 0, chapter: spec.scripture?.chapter });
  const paragraphId = ids.paragraph(textId, 0);
  await store.paragraphs.put({ id: paragraphId, textId, sectionId, index: 0 });

  for (let si = 0; si < spec.sentences.length; si++) {
    const fs = spec.sentences[si];
    const sentenceId = ids.sentence(textId, si);
    // Compose text and offsets from tokens unless text given (then we locate tokens sequentially).
    let text = fs.text ?? '';
    const offsets: Array<[number, number]> = [];
    if (fs.text) {
      let cursor = 0;
      for (const t of fs.tokens) {
        const at = fs.text.indexOf(t.surface, cursor);
        if (at < 0) throw new Error(`fixture token "${t.surface}" not found in "${fs.text}"`);
        offsets.push([at, at + t.surface.length]);
        cursor = at + t.surface.length;
      }
    } else {
      fs.tokens.forEach((t, i) => {
        const isPunct = t.isWord === false;
        if (i > 0 && !isPunct && sep) text += sep;
        offsets.push([text.length, text.length + t.surface.length]);
        text += t.surface;
      });
    }
    const normalizedText = lang === 'th' || lang === 'hi' ? text.normalize('NFC') : text.normalize('NFC').toLowerCase();
    await store.sentences.put({ id: sentenceId, key: String(si), textId, paragraphId, lang, index: si, versionAdded: 1, text, normalizedText, verseRefs: fs.verseRefs, textHash: hash(text) });
    if (fs.english) await store.rescues.put({ id: ids.rescue(sentenceId), sentenceId, textId, english: fs.english, provenance: 'human' });

    for (let ti = 0; ti < fs.tokens.length; ti++) {
      const t = fs.tokens[ti];
      const normalized = lang === 'th' || lang === 'hi' ? t.surface.normalize('NFC') : t.surface.normalize('NFC').toLowerCase();
      const tokenId = ids.token(sentenceId, ti);
      const isWord = t.isWord ?? true;
      await store.tokens.put({ id: tokenId, sentenceId, textId, lang, index: ti, surface: t.surface, start: offsets[ti][0], end: offsets[ti][1], normalized, formId: ids.form(lang, normalized), isWord });
      if (t.lemma) {
        const lemmaId = ids.lemma(lang, t.lemma, t.pos);
        if (!(await store.lemmas.get(lemmaId))) await store.lemmas.put({ id: lemmaId, lang, lemma: t.lemma, pos: t.pos, gloss: t.gloss });
        await store.analyses.put({ id: ids.analysis(tokenId, FIXTURE_ANALYZER), tokenId, lang, lemmaId, pos: t.pos, morph: t.morph ?? {}, confidence: t.confidence ?? 0.95, provenance: 'lexicon', analyzer: FIXTURE_ANALYZER, createdAt: now });
      }
    }
    for (const p of fs.phrases ?? []) {
      const phraseId = ids.phrase(lang, p.pattern);
      if (!(await store.phrases.get(phraseId))) await store.phrases.put({ id: phraseId, lang, pattern: p.pattern, display: p.display ?? p.pattern.join(sep || ' '), kind: p.kind ?? 'formula' });
      await store.phraseOccurrences.put({ id: ids.phraseOccurrence(phraseId, sentenceId, p.tokenIndexes[0]), phraseId, sentenceId, textId, lang, tokenIds: p.tokenIndexes.map((i) => ids.token(sentenceId, i)), confidence: 0.9, provenance: 'lexicon' });
    }
    for (const g of fs.patterns ?? []) {
      const patternId = ids.pattern(lang, g.key);
      if (!(await store.patterns.get(patternId))) await store.patterns.put({ id: patternId, lang, key: g.key, title: g.title ?? g.key, explanation: '' });
      await store.patternOccurrences.put({ id: ids.patternOccurrence(patternId, sentenceId, g.tokenIndexes[0]), patternId, sentenceId, textId, lang, tokenIds: g.tokenIndexes.map((i) => ids.token(sentenceId, i)), confidence: 0.9, provenance: 'lexicon' });
    }
  }
  return text;
}

/** Seed the five languages, one course each and a user. */
export async function seedBasics(store: AppStore, userId = 'u1', courseId = 'honduras-es') {
  const { LANGUAGE_ROWS, COURSES } = await import('./config');
  await store.languages.bulkPut(LANGUAGE_ROWS);
  await store.courses.bulkPut(COURSES);
  await store.users.put({ id: userId, displayName: 'Test learner', courseId, createdAt: '2026-01-01T00:00:00.000Z' });
}
