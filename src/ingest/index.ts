/**
 * Ingestion pipeline: CorpusDocument → validated provenance → Text / sections / paragraphs / sentences /
 * tokens / lemmas / analyses / phrases / patterns / English rescue / transformation log, all through the
 * AppStore and the language adapters.
 *
 * Invariants:
 *  - `Sentence.text` is exactly the document's (NFC/trimmed) text; processing never modifies it.
 *  - every Token slices its sentence exactly (`text.slice(start,end) === surface`) — checked on ingest.
 *  - re-ingesting bumps `Text.contentVersion` only when some sentence text changed; human analyses on
 *    unchanged sentences survive a re-ingest.
 */
import type {
  AnalyzedToken, AppStore, AdapterRegistry, GrammarPattern, Lemma, PatternOccurrence, Phrase, PhraseOccurrence,
  Sentence, Text, TokenAnalysis, Token, TransformationRecord, Paragraph, TextSection, EnglishRescue,
} from '../core';
import { hash, ids } from '../core';
import { CorpusValidationError, toContentSource, validateDocument, type CorpusDocument } from './format';

export * from './format';

export const INGEST_TOOL = 'ingest@1';

export interface IngestOptions {
  /** ISO timestamp source; defaults to the wall clock. Tests pass a fixed clock for exact idempotence checks. */
  clock?: () => string;
}

interface PlannedSentence {
  text: string;
  english?: string;
  verseRefs?: string[];
  paragraphIndex: number;
}
interface PlannedParagraph { sectionIndex: number }

const TABLES = [
  'sources', 'corpora', 'texts', 'sections', 'paragraphs', 'sentences', 'tokens', 'lemmas', 'analyses',
  'phrases', 'phraseOccurrences', 'patterns', 'patternOccurrences', 'rescues',
] as const;

const canonical = (s: string) => s.normalize('NFC').trim();

function planDocument(doc: CorpusDocument, registry: AdapterRegistry) {
  const adapter = registry.get(doc.lang);
  const sentences: PlannedSentence[] = [];
  const paragraphs: PlannedParagraph[] = [];
  let canonicalised = 0;
  let adapterWouldSplit = 0;
  doc.sections.forEach((sec, si) => {
    for (const par of sec.paragraphs) {
      const paragraphIndex = paragraphs.length;
      paragraphs.push({ sectionIndex: si });
      if ('sentences' in par) {
        for (const s of par.sentences) {
          const text = canonical(s.text);
          if (text !== s.text) canonicalised++;
          if (adapter.segmentSentences(text).length > 1) adapterWouldSplit++;
          sentences.push({ text, english: s.english, verseRefs: s.verseRefs, paragraphIndex });
        }
      } else {
        const raw = canonical(par.text);
        if (raw !== par.text) canonicalised++;
        const spans = adapter.segmentSentences(raw);
        if (par.english && par.english.length !== spans.length) {
          throw new CorpusValidationError(doc.slug, [
            `paragraph in section ${si}: adapter split the text into ${spans.length} sentence(s) but english has ${par.english.length}`,
          ]);
        }
        spans.forEach((sp, k) => sentences.push({ text: sp.text, english: par.english?.[k], verseRefs: par.verseRefs, paragraphIndex }));
      }
    }
  });
  return { sentences, paragraphs, canonicalised, adapterWouldSplit };
}

/**
 * Ingest one document. Returns the stored `Text`. Throws `CorpusValidationError` for an invalid document;
 * nothing is written in that case.
 */
export async function ingestDocument(store: AppStore, registry: AdapterRegistry, doc: CorpusDocument, opts: IngestOptions = {}): Promise<Text> {
  const problems = validateDocument(doc);
  if (problems.length) throw new CorpusValidationError(String((doc as { slug?: unknown })?.slug ?? '?'), problems);
  const adapter = registry.get(doc.lang);
  const now = (opts.clock ?? (() => new Date().toISOString()))();
  const plan = planDocument(doc, registry);
  const lang = doc.lang;
  const textId = ids.text(lang, doc.slug);
  const analyzerName = `adapter-${lang}@${adapter.version}`;

  return store.transaction([...TABLES], async () => {
    const existing = await store.texts.get(textId);
    const oldSentences = (await store.sentences.where('textId', textId)).sort((a, b) => a.index - b.index);
    const changed =
      !!existing &&
      (oldSentences.length !== plan.sentences.length || oldSentences.some((o, i) => o.text !== plan.sentences[i].text));
    const contentVersion = existing ? existing.contentVersion + (changed ? 1 : 0) : 1;

    // sentences whose text is unchanged keep their human analyses
    const keepSentenceIds = new Set<string>();
    oldSentences.forEach((o, i) => { if (plan.sentences[i] && plan.sentences[i].text === o.text) keepSentenceIds.add(o.id); });

    // ── clear previous rows for this text ──
    const oldTokens = await store.tokens.where('textId', textId);
    const oldTokenById = new Map(oldTokens.map((t) => [t.id, t]));
    const keptHuman: TokenAnalysis[] = [];
    for (const t of oldTokens) {
      for (const a of await store.analyses.where('tokenId', t.id)) {
        if (a.provenance === 'human' && keepSentenceIds.has(t.sentenceId)) keptHuman.push(a);
        else await store.analyses.delete(a.id);
      }
      await store.tokens.delete(t.id);
    }
    for (const s of oldSentences) await store.sentences.delete(s.id);
    for (const r of await store.rescues.where('textId', textId)) await store.rescues.delete(r.id);
    for (const o of await store.phraseOccurrences.where('textId', textId)) await store.phraseOccurrences.delete(o.id);
    for (const o of await store.patternOccurrences.where('textId', textId)) await store.patternOccurrences.delete(o.id);
    for (const s of await store.sections.where('textId', textId)) await store.sections.delete(s.id);
    for (const p of await store.paragraphs.where('textId', textId)) await store.paragraphs.delete(p.id);

    // ── source, corpus ──
    await store.sources.put(toContentSource(doc));
    if (!(await store.corpora.get(doc.corpus.id))) {
      await store.corpora.put({ id: doc.corpus.id, lang, kind: doc.corpus.kind, title: doc.corpus.title });
    }

    // ── structure ──
    const sections: TextSection[] = doc.sections.map((s, i) => ({ id: ids.section(textId, i), textId, index: i, title: s.title, chapter: s.chapter }));
    await store.sections.bulkPut(sections);
    const paragraphRows: Paragraph[] = plan.paragraphs.map((p, i) => ({ id: ids.paragraph(textId, i), textId, sectionId: sections[p.sectionIndex].id, index: i }));
    await store.paragraphs.bulkPut(paragraphRows);

    // ── sentences → tokens → analyses → phrases/patterns → rescue ──
    const lemmaSeen = new Map<string, Lemma>();
    const phraseSeen = new Map<string, Phrase>();
    const patternSeen = new Map<string, GrammarPattern>();
    let tokenCount = 0, wordCount = 0, analysedWords = 0, phraseOcc = 0, patternOcc = 0;
    const newTokenIds = new Set<string>();

    const ensureLemma = async (lemma: string, pos: Lemma['pos'], gloss?: string): Promise<string> => {
      const id = ids.lemma(lang, lemma, pos);
      if (!lemmaSeen.has(id)) {
        const cur = await store.lemmas.get(id);
        const row: Lemma = cur ?? { id, lang, lemma, pos, gloss };
        if (cur && !cur.gloss && gloss) row.gloss = gloss;
        if (!cur || row.gloss !== cur.gloss) await store.lemmas.put(row);
        lemmaSeen.set(id, row);
      }
      return id;
    };

    for (let si = 0; si < plan.sentences.length; si++) {
      const ps = plan.sentences[si];
      const sentenceId = ids.sentence(textId, si);
      const sentence: Sentence = {
        id: sentenceId, textId, paragraphId: paragraphRows[ps.paragraphIndex].id, lang, index: si,
        text: ps.text, normalizedText: adapter.normalize(ps.text), verseRefs: ps.verseRefs ? [...ps.verseRefs] : undefined, textHash: hash(ps.text),
      };
      await store.sentences.put(sentence);

      const raw = adapter.tokenize(ps.text);
      const analyzed: AnalyzedToken[] = adapter.analyze(raw);
      if (analyzed.length !== raw.length) throw new Error(`adapter ${lang}: analyze() returned ${analyzed.length} for ${raw.length} tokens`);
      const tokens: Token[] = raw.map((r, ti) => {
        if (ps.text.slice(r.start, r.end) !== r.surface) throw new Error(`adapter ${lang}: token offsets do not round-trip in ${sentenceId}: "${r.surface}"`);
        return {
          id: ids.token(sentenceId, ti), sentenceId, textId, lang, index: ti, surface: r.surface, start: r.start, end: r.end,
          normalized: r.normalized, formId: ids.form(lang, r.normalized), isWord: r.isWord,
        };
      });
      await store.tokens.bulkPut(tokens);
      tokens.forEach((t) => newTokenIds.add(t.id));
      tokenCount += tokens.length;

      for (let ti = 0; ti < analyzed.length; ti++) {
        const a = analyzed[ti];
        if (tokens[ti].isWord) wordCount++;
        if (!a.candidates.length) continue;
        analysedWords++;
        const [best, ...rest] = a.candidates;
        const lemmaId = best.lemma ? await ensureLemma(best.lemma, best.pos, best.gloss) : undefined;
        const alternatives: NonNullable<TokenAnalysis['alternatives']> = [];
        for (const r of rest) {
          alternatives.push({ lemmaId: r.lemma ? await ensureLemma(r.lemma, r.pos, r.gloss) : undefined, pos: r.pos, morph: r.morph, confidence: r.confidence });
        }
        // TODO(contract): AnalysisCandidate has no provenance field. Rule-derived candidates (clitic split, compound
        // guess, separable particle) are flagged with notes.source === 'rule' and stored as provenance 'machine';
        // lexicon-backed candidates are stored as 'lexicon'. A real field on AnalysisCandidate would replace this convention.
        const notes = best.notes ? { ...best.notes } : undefined;
        const fromRule = notes?.source === 'rule';
        if (notes) delete notes.source;
        const row: TokenAnalysis = {
          id: ids.analysis(tokens[ti].id, a.analyzer, 0), tokenId: tokens[ti].id, lang, lemmaId, pos: best.pos, morph: best.morph,
          notes: notes && Object.keys(notes).length ? notes : undefined, confidence: best.confidence,
          provenance: fromRule ? 'machine' : 'lexicon', analyzer: a.analyzer, createdAt: now,
          alternatives: alternatives.length ? alternatives : undefined,
        };
        await store.analyses.put(row);
      }

      for (const pc of adapter.detectPhrases(raw, analyzed)) {
        const phraseId = ids.phrase(lang, pc.pattern);
        if (!phraseSeen.has(phraseId)) {
          const cur = await store.phrases.get(phraseId);
          const row: Phrase = cur ?? { id: phraseId, lang, pattern: pc.pattern, display: pc.display, gloss: pc.gloss, kind: pc.kind };
          if (!cur) await store.phrases.put(row);
          phraseSeen.set(phraseId, row);
        }
        const occ: PhraseOccurrence = {
          id: ids.phraseOccurrence(phraseId, sentenceId, pc.tokenIndexes[0]), phraseId, sentenceId, textId, lang,
          tokenIds: pc.tokenIndexes.map((i) => tokens[i].id), confidence: pc.confidence, provenance: 'lexicon',
        };
        await store.phraseOccurrences.put(occ);
        phraseOcc++;
      }
      for (const gc of adapter.detectPatterns(raw, analyzed)) {
        const patternId = ids.pattern(lang, gc.key);
        if (!patternSeen.has(patternId)) {
          const cur = await store.patterns.get(patternId);
          const row: GrammarPattern = cur ?? { id: patternId, lang, key: gc.key, title: gc.title, explanation: gc.explanation };
          if (!cur) await store.patterns.put(row);
          patternSeen.set(patternId, row);
        }
        const occ: PatternOccurrence = {
          id: ids.patternOccurrence(patternId, sentenceId, gc.tokenIndexes[0]), patternId, sentenceId, textId, lang,
          tokenIds: gc.tokenIndexes.map((i) => tokens[i].id), confidence: gc.confidence, provenance: 'lexicon',
        };
        await store.patternOccurrences.put(occ);
        patternOcc++;
      }

      if (ps.english) {
        const rescue: EnglishRescue = {
          id: ids.rescue(sentenceId), sentenceId, textId, english: ps.english, provenance: 'human', sourceNote: doc.englishSource,
        };
        await store.rescues.put(rescue);
      }
    }

    // restore human analyses that still point at the same token (same id, same surface span)
    for (const a of keptHuman) {
      const old = oldTokenById.get(a.tokenId);
      if (old && newTokenIds.has(a.tokenId)) {
        const now2 = await store.tokens.get(a.tokenId);
        if (now2 && now2.surface === old.surface && now2.start === old.start) await store.analyses.put(a);
      }
    }

    // ── text row + transformation log ──
    const transformations: TransformationRecord[] = existing ? [...existing.transformations] : [];
    const lastAdapterTool = [...transformations].reverse().find((t) => t.tool.startsWith('adapter-'))?.tool;
    const firstTime = !existing;
    if (firstTime || changed || lastAdapterTool !== analyzerName) {
      if (plan.canonicalised) {
        transformations.push({ at: now, tool: INGEST_TOOL, description: `canonicalised ${plan.canonicalised} text block(s) to NFC/trimmed before storing` });
      }
      transformations.push({
        at: now, tool: INGEST_TOOL,
        description: `${firstTime ? 'imported' : changed ? 're-imported (sentence text changed)' : 're-imported (analyzer changed)'} ${doc.slug}: ${plan.sentences.length} sentences, ${tokenCount} tokens, contentVersion ${contentVersion}` +
          (plan.adapterWouldSplit ? `; author-declared sentences the adapter's splitter would divide: ${plan.adapterWouldSplit}` : ''),
      });
      transformations.push({
        at: now, tool: analyzerName,
        description: `tokenized and analyzed: ${analysedWords}/${wordCount} word tokens have a lexicon/rule analysis (rest uncertain, left empty); ${phraseOcc} phrase and ${patternOcc} pattern occurrences`,
      });
    }

    const text: Text = {
      id: textId, corpusId: doc.corpus.id, lang, kind: doc.kind, title: doc.title, sourceId: doc.source.id, version: doc.version,
      importedAt: existing?.importedAt ?? now, staticLevel: doc.staticLevel, tags: [...doc.tags], generated: doc.generated ?? false,
      transformations, contentVersion, scripture: doc.scripture ? { ...doc.scripture } : undefined,
    };
    await store.texts.put(text);
    return text;
  });
}

/** Ingest many documents in order; returns the stored Texts. */
export async function ingestAll(store: AppStore, registry: AdapterRegistry, docs: CorpusDocument[], opts: IngestOptions = {}): Promise<Text[]> {
  const out: Text[] = [];
  for (const doc of docs) out.push(await ingestDocument(store, registry, doc, opts));
  return out;
}

/** The fifteen bundled corpus documents (`data/corpus/<lang>/*.json`), sorted by path for determinism. */
export function loadBundledCorpus(): CorpusDocument[] {
  const modules = import.meta.glob('../../data/corpus/**/*.json', { eager: true, import: 'default' }) as Record<string, CorpusDocument>;
  return Object.keys(modules).sort().map((k) => modules[k]);
}
